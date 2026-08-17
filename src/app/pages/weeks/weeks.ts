import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';
import {
  WorkoutService,
  Workout,
  UNASSIGNED_GROUP,
  CARDIO_GROUP,
  isOrphanGroup,
} from '../../services/workout.service';
import {
  WeightService,
  displayLifted,
  liftedToCanonical,
  weightIn,
} from '../../services/weight.service';
import {
  displayDistance,
  distanceToCanonical,
  displayElevation,
  elevationToCanonical,
  formatPace,
} from '../../services/cardio';
import { ModalComponent } from '../../components/modal/modal';
import { WorkoutFormModalComponent } from '../../components/workout-form-modal/workout-form-modal';
import { WeekGridComponent } from '../../components/week-grid/week-grid';
import { WeekNavComponent } from '../../components/week-nav/week-nav';
import { BodyWeightPromptComponent } from '../../components/body-weight-prompt/body-weight-prompt';
import {
  WeekService,
  WeekEntry,
  CardioLog,
  DAY_LABELS,
  bucketByDay,
  parseTime,
  formatTime,
  uniformWeight,
} from '../../services/week.service';

/** A per-set row in the modal. `timeText` is the raw m:ss text the user edits;
 *  it's parsed to seconds (the stored `WorkoutSet.time`) on submit. */
interface SetRow {
  reps: number | null;
  /** Weight as shown in the user's unit; converted back to canonical lbs on submit. */
  weight: number | null;
  /**
   * What this row was seeded with: the stored (canonical lbs) value, and the
   * display value derived from it. While `weight` still equals `seededWeight` the
   * user hasn't touched the field, so `canonicalWeight` is written back verbatim.
   * Converting again would round-trip through `convertWeight`'s 1-decimal rounding
   * and silently shift the stored number (135 lbs → 61.2 kg → 134.9 lbs) just
   * because someone opened the form in kg and edited the reps.
   */
  canonicalWeight: number | null;
  seededWeight: number | null;
  timeText: string;
}

/**
 * What a set row's weight field starts out as: the value to store (canonical
 * lbs) paired with the value to show (the user's unit).
 *
 * The two travel together because they aren't always derived from each other. A
 * body-weight seed takes its display value straight off the weigh-in's own `kg`
 * field, so the row reads exactly like the Weight page instead of a converted
 * (and re-rounded) approximation of it.
 */
interface WeightSeed {
  canonical: number | null;
  display: number | null;
}

@Component({
  selector: 'app-weeks',
  standalone: true,
  imports: [
    FormsModule,
    ModalComponent,
    WorkoutFormModalComponent,
    WeekGridComponent,
    WeekNavComponent,
    BodyWeightPromptComponent,
  ],
  templateUrl: './weeks.html',
  styleUrl: './weeks.css',
})
export class WeeksComponent {
  private readonly service = inject(WeekService);
  private readonly workoutService = inject(WorkoutService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);
  private readonly weightService = inject(WeightService);

  /** Groups offered in the modal's dropdown: the reserved "Cardio" category
   *  always first, then the user's groups, then "Unassigned" when the
   *  library holds workouts whose group was deleted (so those stay loggable
   *  instead of becoming unreachable). */
  protected readonly muscleGroups = computed(() => {
    const groups = this.settings.muscleGroups();
    const known = new Set(groups);
    const hasUnassigned = (this.workoutService.workouts() ?? []).some((w) =>
      isOrphanGroup(w.muscleGroup, known)
    );
    const list = [CARDIO_GROUP, ...groups];
    return hasUnassigned ? [...list, UNASSIGNED_GROUP] : list;
  });

  /** Per-workout time tracking for the open modal. Defaults from the global
   *  "Track time per set" setting when adding, or the entry's saved value when
   *  editing. When on, each set row shows an m:ss time field. */
  protected readonly modalTrackTime = signal(false);

  protected readonly unit = this.settings.unit;

  // --- Week state (delegated to the service; the grid itself is shared) ---
  protected readonly entries = this.service.entries;
  protected readonly rangeLabel = this.service.rangeLabel;
  protected readonly isCurrentWeek = this.service.isCurrentWeek;
  protected readonly weekStart = this.service.currentWeekStart;
  protected readonly today = this.service.today;
  protected readonly previousWeek = (): void => this.service.previousWeek();
  protected readonly nextWeek = (): void => this.service.nextWeek();
  protected readonly goToThisWeek = (): void => this.service.goToThisWeek();

  /** Entries bucketed by day index — only for the "already logged today?"
   *  check below; the grid does its own bucketing from the same helper. */
  private readonly entriesByDay = computed(() => bucketByDay(this.entries()));

  // --- Modal + form state ---
  protected readonly showModal = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  /** null = adding; a string id = editing that entry. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly activeDay = signal(0);
  protected readonly modalMuscleGroup = signal<string>('');
  protected readonly modalWorkoutId = signal('');
  protected readonly setRows = signal<SetRow[]>([]);
  /** Every row created since the modal opened, including ones hidden by a
   *  lower sets count. The visible rows share these objects, so transient
   *  count values (a cleared field, the "1" while typing "12") only hide
   *  rows instead of destroying their data. Only visible rows are saved. */
  private rowPool: SetRow[] = [];

  /** Library workouts in the modal's selected muscle group. When "Unassigned"
   *  is selected, matches any workout whose group is no longer in the user's
   *  list (mirrors the Workouts page's grouping). */
  protected readonly filteredWorkouts = computed(() => {
    const group = this.modalMuscleGroup();
    const all = this.workoutService.workouts() ?? [];
    if (group === UNASSIGNED_GROUP) {
      const known = new Set(this.settings.muscleGroups());
      return all.filter((w) => isOrphanGroup(w.muscleGroup, known));
    }
    return all.filter((w) => w.muscleGroup === group);
  });

  private readonly selectedWorkout = computed(
    () => this.filteredWorkouts().find((w) => w.id === this.modalWorkoutId()) ?? null
  );

  /** Whether the modal's selected group is the reserved Cardio category —
   *  swaps the reps/weight/sets form for the single-session cardio fields. */
  protected readonly isCardio = computed(() => this.modalMuscleGroup() === CARDIO_GROUP);
  protected readonly distanceUnit = this.settings.distanceUnit;
  /** Elevation is shown in feet alongside miles, meters alongside km. */
  protected readonly elevationUnitLabel = computed(() =>
    this.distanceUnit() === 'mi' ? 'ft' : 'm'
  );

  // --- Body-weight exercises (pull-ups, dips, …) ---

  /** Whether the modal's selected workout is flagged as body-weight: every set
   *  is loaded by the user's own weight, so the weight field is filled from the
   *  weigh-in log and shown read-only. Reps and time are still theirs to enter. */
  protected readonly isBodyWeight = computed(() => this.selectedWorkout()?.bodyWeight === true);

  /** The user's most recent weigh-in — the log is ordered newest-first — or
   *  `null` while it loads and when they've never logged one. */
  private readonly latestWeighIn = computed(() => this.weightService.weights()?.[0] ?? null);

  /** That weigh-in in the user's unit, for the modal's hint line. `null` when
   *  there's nothing to auto-fill from, which the hint says instead. */
  protected readonly bodyWeightDisplay = computed(() => {
    const latest = this.latestWeighIn();
    return latest ? weightIn(latest, this.settings.unit()) : null;
  });

  constructor() {
    // The weigh-in log streams in asynchronously, so a body-weight exercise can
    // be picked before it arrives — leaving rows seeded with nothing. Re-seed
    // them once it lands. Safe to overwrite: the field is read-only for these,
    // so there is no user input to clobber. `untracked` keeps the write to
    // setRows (which reseedWeights also reads) out of this effect's own
    // dependencies, so it can't retrigger itself.
    effect(() => {
      const latest = this.latestWeighIn();
      if (!latest) return;
      untracked(() => {
        // Adding only. An entry being edited keeps the weight it was logged at
        // — a weigh-in landing mid-edit must not rewrite that history.
        if (!this.showModal() || this.editingId() !== null) return;
        if (!this.isBodyWeight()) return;
        this.reseedWeights(this.weightSeedFor(this.selectedWorkout()));
      });
    });
  }

  // --- Cardio session fields (one per logged day — no per-set breakdown). ---
  protected readonly cardioTimeText = signal('');
  protected readonly cardioDistance = signal<number | null>(null);
  protected readonly cardioHeartRate = signal<number | null>(null);
  protected readonly cardioElevation = signal<number | null>(null);

  /** Read-only pace derived from the entered duration and distance. */
  protected readonly cardioPace = computed(() => {
    const seconds = parseTime(this.cardioTimeText());
    const distance = this.cardioDistance();
    const unit = this.distanceUnit();
    const canonicalDistance = distance == null ? null : distanceToCanonical(distance, unit);
    return formatPace(seconds, canonicalDistance, unit);
  });

  protected openAddModal(day: number): void {
    this.editingId.set(null);
    this.activeDay.set(day);
    this.modalMuscleGroup.set(this.settings.muscleGroups()[0] ?? '');
    this.modalWorkoutId.set('');
    this.modalTrackTime.set(this.settings.showSetTime());
    this.rowPool = [];
    this.setRows.set([]);
    this.resetCardioFields();
    this.error.set('');
    this.showModal.set(true);
  }

  protected openEditModal(entry: WeekEntry): void {
    this.editingId.set(entry.id ?? null);
    this.activeDay.set(entry.day);
    this.modalMuscleGroup.set(entry.muscleGroup);
    this.modalWorkoutId.set(entry.workoutId);
    if (entry.muscleGroup === CARDIO_GROUP) {
      this.rowPool = [];
      this.setRows.set([]);
      this.modalTrackTime.set(false);
      this.seedCardioFields(entry.cardio ?? null);
    } else {
      this.modalTrackTime.set(
        entry.trackTime ?? entry.sets.some((s) => s.time != null)
      );
      this.rowPool = entry.sets.map((s) =>
        this.seedRow(this.canonicalSeed(s.weight), s.reps, formatTime(s.time ?? null))
      );
      this.setRows.set(this.rowPool.slice());
      this.resetCardioFields();
    }
    this.error.set('');
    this.showModal.set(true);
  }

  protected toggleModalTrackTime(): void {
    this.modalTrackTime.update((v) => !v);
  }

  protected closeModal(): void {
    this.showModal.set(false);
  }

  // --- "Create new workout" sub-modal (layered over the add-to-week modal) ---
  protected readonly showCreateWorkout = signal(false);

  protected openCreateWorkout(): void {
    this.showCreateWorkout.set(true);
  }

  /** After a workout is created from within the logging flow, select it in the
   *  add-to-week form. Sets the group/workout signals directly (not via
   *  onMuscleGroupChange) so the in-progress log is preserved for other groups.
   *  The new workout appears in filteredWorkouts() once the live library
   *  stream emits. */
  protected onWorkoutCreated(workout: Workout): void {
    this.showCreateWorkout.set(false);
    this.modalMuscleGroup.set(workout.muscleGroup);
    this.modalWorkoutId.set(workout.id ?? '');
    if (workout.muscleGroup === CARDIO_GROUP) {
      this.rowPool = [];
      this.setRows.set([]);
      this.resetCardioFields();
    } else {
      this.reseedWeights(this.weightSeedFor(workout));
    }
  }

  protected onMuscleGroupChange(group: string): void {
    this.modalMuscleGroup.set(group);
    this.modalWorkoutId.set('');
    this.rowPool = [];
    this.setRows.set([]);
    this.resetCardioFields();
  }

  protected onWorkoutChange(id: string): void {
    this.modalWorkoutId.set(id);
    if (this.isCardio()) {
      this.resetCardioFields();
      return;
    }
    // Re-default each set's weight for the newly chosen workout: its usual
    // weight, or the latest weigh-in if it's a body-weight exercise.
    this.reseedWeights(this.weightSeedFor(this.selectedWorkout()));
  }

  /** Grow/shrink the visible per-set rows. Shrinking only hides rows (they
   *  stay in the pool with their data); growing brings them back. */
  protected onSetsCountChange(value: number | null): void {
    const count = Math.max(0, Math.min(Math.floor(value ?? 0), 20));
    const seed = this.weightSeedFor(this.selectedWorkout());
    while (this.rowPool.length < count) {
      this.rowPool.push(this.seedRow(seed));
    }
    this.setRows.set(this.rowPool.slice(0, count));
  }

  protected async onSubmit(): Promise<void> {
    const workout = this.selectedWorkout();
    if (!workout?.id) {
      this.error.set('Please select a workout.');
      return;
    }

    const isCardio = this.isCardio();
    let cardio: CardioLog | null = null;

    if (isCardio) {
      cardio = this.buildCardioLog();
      if (!cardio) {
        this.error.set('Enter a duration and distance.');
        return;
      }
    } else {
      const sets = this.setRows();
      if (sets.length === 0) {
        this.error.set('Add at least one set.');
        return;
      }
      if (sets.some((s) => s.reps == null || s.reps <= 0)) {
        this.error.set('Enter the reps for every set.');
        return;
      }
    }

    const day = this.activeDay();
    const duplicate = (this.entriesByDay()[day] ?? []).some(
      (e) => e.workoutId === workout.id && e.id !== this.editingId()
    );
    if (duplicate) {
      this.error.set(
        `You've already added ${workout.name} on ${DAY_LABELS[day]}.`
      );
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const trackTime = this.modalTrackTime();
    const base = {
      day,
      workoutId: workout.id,
      workoutName: workout.name,
      muscleGroup: workout.muscleGroup,
    };
    const data: Omit<WeekEntry, 'id' | 'createdAt'> = cardio
      ? { ...base, sets: [], cardio }
      : {
          ...base,
          trackTime,
          sets: this.setRows().map((s) => ({
            reps: s.reps,
            weight: this.toCanonicalWeight(s),
            time: trackTime ? parseTime(s.timeText) : null,
          })),
        };
    const id = this.editingId();

    try {
      const baseMessage = id ? 'Workout updated!' : 'Workout added!';
      if (id) {
        await this.service.update(id, data);
      } else {
        await this.service.add(data);
      }
      this.toast.show(
        await this.syncUsualWeight(workout, data.sets, baseMessage),
        'success'
      );
      this.closeModal();
    } catch {
      this.error.set('Could not save your workout. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  /** After a log save, if every set shares one weight and it differs from the
   *  workout's saved usual weight, push it back into the library so the next
   *  time this workout is logged, the form seeds from the latest value.
   *  Blank (no-weight) sets are ignored — see {@link uniformWeight}. Returns
   *  the toast message to show (the base message, with a suffix if the usual
   *  weight changed). */
  private async syncUsualWeight(
    workout: Workout,
    sets: { weight: number | null }[],
    baseMessage: string
  ): Promise<string> {
    // Cardio workouts have no usualWeight concept — sets is always [] for
    // them anyway, but bail explicitly rather than relying on that. Body-weight
    // exercises have none either: their sets carry today's weigh-in, and writing
    // that back would freeze one day's body weight into the library.
    if (workout.muscleGroup === CARDIO_GROUP || workout.bodyWeight) {
      return baseMessage;
    }
    const newUsual = uniformWeight(sets);
    if (newUsual == null || newUsual === workout.usualWeight) {
      return baseMessage;
    }
    try {
      await this.workoutService.update(workout.id!, {
        name: workout.name,
        muscleGroup: workout.muscleGroup,
        maxWeight: workout.maxWeight,
        usualWeight: newUsual,
      });
      const shown = displayLifted(newUsual, this.settings.unit());
      return `${baseMessage} Usual weight updated to ${shown} ${this.settings.unit()}.`;
    } catch {
      return baseMessage;
    }
  }

  protected async onDelete(entry: WeekEntry): Promise<void> {
    if (!entry.id) return;
    if (!confirm(`Delete ${entry.workoutName}? This can't be undone.`)) return;
    try {
      await this.service.remove(entry.id);
      this.toast.show('Workout deleted', 'success');
    } catch {
      this.toast.show('Could not delete workout. Please try again.', 'error');
    }
  }

  /** What to seed a set row's weight with for `workout`: the latest weigh-in
   *  for a body-weight exercise, otherwise the workout's usual weight. Returns
   *  a blank seed when a body-weight exercise is picked before any weigh-in
   *  exists — the modal swaps in `BodyWeightPromptComponent` to log one, and
   *  the effect above fills the rows in as soon as it lands. */
  private weightSeedFor(workout: Workout | null): WeightSeed {
    if (workout?.bodyWeight) {
      const latest = this.latestWeighIn();
      return latest
        ? { canonical: latest.lbs, display: weightIn(latest, this.settings.unit()) }
        : { canonical: null, display: null };
    }
    return this.canonicalSeed(workout?.usualWeight ?? null);
  }

  /** A seed for a stored (canonical lbs) weight, shown in the user's unit. */
  private canonicalSeed(canonical: number | null): WeightSeed {
    return { canonical, display: displayLifted(canonical, this.settings.unit()) };
  }

  /** A set row seeded from a {@link WeightSeed}. See {@link SetRow}. */
  private seedRow(
    seed: WeightSeed,
    reps: number | null = null,
    timeText = ''
  ): SetRow {
    return {
      reps,
      weight: seed.display,
      canonicalWeight: seed.canonical,
      seededWeight: seed.display,
      timeText,
    };
  }

  /** Re-seed every pooled row's weight (e.g. the selected workout changed),
   *  leaving reps and time intact. */
  private reseedWeights(seed: WeightSeed): void {
    this.rowPool = this.rowPool.map((r) => ({
      ...r,
      weight: seed.display,
      canonicalWeight: seed.canonical,
      seededWeight: seed.display,
    }));
    this.setRows.set(this.rowPool.slice(0, this.setRows().length));
  }

  /** The value to store for a row — see {@link SetRow.canonicalWeight}. */
  private toCanonicalWeight(row: SetRow): number | null {
    if (row.weight == null) return null;
    if (row.weight === row.seededWeight) return row.canonicalWeight;
    return liftedToCanonical(row.weight, this.settings.unit());
  }

  private resetCardioFields(): void {
    this.cardioTimeText.set('');
    this.cardioDistance.set(null);
    this.cardioHeartRate.set(null);
    this.cardioElevation.set(null);
  }

  /** Seed the cardio fields from a stored (canonical) log when editing. */
  private seedCardioFields(cardio: CardioLog | null): void {
    const unit = this.distanceUnit();
    this.cardioTimeText.set(formatTime(cardio?.time ?? null));
    this.cardioDistance.set(displayDistance(cardio?.distance ?? null, unit));
    this.cardioHeartRate.set(cardio?.heartRate ?? null);
    this.cardioElevation.set(displayElevation(cardio?.elevation ?? null, unit));
  }

  /** The cardio log to save from the current form fields, or `null` if the
   *  required duration/distance aren't both present (a positive distance). */
  private buildCardioLog(): CardioLog | null {
    const unit = this.distanceUnit();
    const time = parseTime(this.cardioTimeText());
    const distance = this.cardioDistance();
    const canonicalDistance = distance == null ? null : distanceToCanonical(distance, unit);
    if (time == null || canonicalDistance == null || canonicalDistance <= 0) {
      return null;
    }
    const elevation = this.cardioElevation();
    return {
      time,
      distance: canonicalDistance,
      heartRate: this.cardioHeartRate(),
      elevation: elevation == null ? null : elevationToCanonical(elevation, unit),
    };
  }
}
