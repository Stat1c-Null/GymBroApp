import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
import { displayLifted, liftedToCanonical } from '../../services/weight.service';
import {
  displayDistance,
  distanceToCanonical,
  displayElevation,
  elevationToCanonical,
  formatPace,
} from '../../services/cardio';
import { ModalComponent } from '../../components/modal/modal';
import { WorkoutFormModalComponent } from '../../components/workout-form-modal/workout-form-modal';
import {
  WeekService,
  WeekEntry,
  CardioLog,
  DAY_LABELS,
  toWeekId,
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

@Component({
  selector: 'app-weeks',
  standalone: true,
  imports: [FormsModule, DatePipe, ModalComponent, WorkoutFormModalComponent],
  templateUrl: './weeks.html',
  styleUrl: './weeks.css',
})
export class WeeksComponent {
  private readonly service = inject(WeekService);
  private readonly workoutService = inject(WorkoutService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

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

  // --- Week state (delegated to the service) ---
  protected readonly entries = this.service.entries;
  protected readonly rangeLabel = this.service.rangeLabel;
  protected readonly isCurrentWeek = this.service.isCurrentWeek;
  protected readonly previousWeek = (): void => this.service.previousWeek();
  protected readonly nextWeek = (): void => this.service.nextWeek();
  protected readonly goToThisWeek = (): void => this.service.goToThisWeek();

  /** The 7 day columns for the current week. */
  protected readonly days = computed(() => {
    const start = this.service.currentWeekStart();
    const todayId = toWeekId(this.service.today());
    return DAY_LABELS.map((label, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { index: i, label, date, isToday: toWeekId(date) === todayId };
    });
  });

  /** Entries bucketed by day index (each bucket stays newest-first). */
  protected readonly entriesByDay = computed(() => {
    const buckets: WeekEntry[][] = [[], [], [], [], [], [], []];
    for (const e of this.entries() ?? []) buckets[e.day]?.push(e);
    return buckets;
  });

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
        this.seedRow(s.weight, s.reps, formatTime(s.time ?? null))
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
      this.reseedWeights(workout.usualWeight ?? null);
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
    // Re-default each set's weight to the newly chosen workout's usual weight.
    this.reseedWeights(this.selectedWorkout()?.usualWeight ?? null);
  }

  /** Grow/shrink the visible per-set rows. Shrinking only hides rows (they
   *  stay in the pool with their data); growing brings them back. */
  protected onSetsCountChange(value: number | null): void {
    const count = Math.max(0, Math.min(Math.floor(value ?? 0), 20));
    const canonicalWeight = this.selectedWorkout()?.usualWeight ?? null;
    while (this.rowPool.length < count) {
      this.rowPool.push(this.seedRow(canonicalWeight));
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
    // them anyway, but bail explicitly rather than relying on that.
    if (workout.muscleGroup === CARDIO_GROUP) {
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

  /** Compact summary shown under a day-entry's name — dispatches on whether
   *  the entry is a cardio session or a strength log. */
  protected entrySummary(entry: WeekEntry): string {
    return entry.muscleGroup === CARDIO_GROUP && entry.cardio
      ? this.cardioSummary(entry.cardio)
      : this.setSummary(entry);
  }

  /** e.g. "30:00 · 5 mi · 6:00 /mi". Parts with no value are omitted. */
  private cardioSummary(cardio: CardioLog): string {
    const unit = this.distanceUnit();
    const distance = displayDistance(cardio.distance, unit);
    const parts = [
      cardio.time != null ? formatTime(cardio.time) : null,
      distance != null ? `${distance} ${unit}` : null,
      formatPace(cardio.time, cardio.distance, unit),
    ];
    return parts.filter((p): p is string => p != null).join(' · ');
  }

  /** Compact per-set summary, e.g. "12×60 · 10×60 (1:30) · 8×65 lbs".
   *  Times are shown whenever a set has one stored — independent of the toggle. */
  private setSummary(entry: WeekEntry): string {
    const parts = entry.sets.map((s) => {
      const weight = displayLifted(s.weight, this.settings.unit());
      const base = weight != null ? `${s.reps}×${weight}` : `${s.reps}`;
      return s.time != null ? `${base} (${formatTime(s.time)})` : base;
    });
    const hasWeight = entry.sets.some((s) => s.weight != null);
    return parts.join(' · ') + (hasWeight ? ` ${this.settings.unit()}` : '');
  }

  /** A set row seeded from a stored (canonical lbs) weight. See {@link SetRow}. */
  private seedRow(
    canonicalWeight: number | null,
    reps: number | null = null,
    timeText = ''
  ): SetRow {
    const weight = displayLifted(canonicalWeight, this.settings.unit());
    return { reps, weight, canonicalWeight, seededWeight: weight, timeText };
  }

  /** Re-seed every pooled row's weight (e.g. the selected workout changed),
   *  leaving reps and time intact. */
  private reseedWeights(canonicalWeight: number | null): void {
    const weight = displayLifted(canonicalWeight, this.settings.unit());
    this.rowPool = this.rowPool.map((r) => ({
      ...r,
      weight,
      canonicalWeight,
      seededWeight: weight,
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
