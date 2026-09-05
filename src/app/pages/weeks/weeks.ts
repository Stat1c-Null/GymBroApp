import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';
import {
  WorkoutService,
  Workout,
  CARDIO_GROUP,
  loggableGroups,
  workoutsInGroup,
} from '../../services/workout.service';
import {
  WeightService,
  displayLifted,
  weightIn,
} from '../../services/weight.service';
import { ModalComponent } from '../../components/modal/modal';
import { WorkoutFormModalComponent } from '../../components/workout-form-modal/workout-form-modal';
import { SetFormModalComponent } from '../../components/set-form-modal/set-form-modal';
import { SetRowsEditorComponent } from '../../components/set-rows-editor/set-rows-editor';
import {
  CardioFieldsComponent,
  fromCardioLog,
  toCardioLog,
} from '../../components/cardio-fields/cardio-fields';
import { WeekGridComponent } from '../../components/week-grid/week-grid';
import { WeekNavComponent } from '../../components/week-nav/week-nav';
import {
  BLANK_SEED,
  SetRow,
  WeightSeed,
  bodyWeightSeed,
  canonicalSeed,
  clampSetCount,
  everyRowHasReps,
  growPool,
  reseedRows,
  rowsFromLoggedSets,
  rowsToLoggedSets,
} from '../../services/set-rows';
import {
  SetApplication,
  entriesFromItems,
  entriesFromSet,
  entriesFromWeekSet,
  setItemsFromEntries,
  weekSetDaysFromEntries,
} from '../../services/apply-set';
import {
  SetItem,
  WorkoutSet,
  WorkoutSetService,
} from '../../services/workout-set.service';
import {
  WeekSet,
  WeekSetDay,
  WeekSetService,
} from '../../services/week-set.service';
import {
  WeekService,
  WeekEntry,
  CardioLog,
  DAY_LABELS,
  bucketByDay,
  uniformWeight,
} from '../../services/week.service';

/**
 * What the day's "+" button offers. A day can be filled in two quite different
 * ways now, so the button asks which before opening either form rather than
 * cramming both into one modal.
 */
type AddChoice = 'workout' | 'set';

@Component({
  selector: 'app-weeks',
  standalone: true,
  imports: [
    FormsModule,
    ModalComponent,
    WorkoutFormModalComponent,
    SetFormModalComponent,
    SetRowsEditorComponent,
    CardioFieldsComponent,
    WeekGridComponent,
    WeekNavComponent,
  ],
  templateUrl: './weeks.html',
  styleUrl: './weeks.css',
})
export class WeeksComponent {
  private readonly service = inject(WeekService);
  private readonly workoutService = inject(WorkoutService);
  private readonly setService = inject(WorkoutSetService);
  private readonly weekSetService = inject(WeekSetService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);
  private readonly weightService = inject(WeightService);

  /** Groups offered in the modal's dropdown — Cardio first, the user's groups
   *  next, and Unassigned only when something has landed there. Shared with the
   *  set builder so the two pickers can't drift. */
  protected readonly muscleGroups = computed(() =>
    loggableGroups(this.settings.muscleGroups(), this.workoutService.workouts() ?? [])
  );

  /** Per-workout time tracking for the open modal. Defaults from the global
   *  "Track time per set" setting when adding, or the entry's saved value when
   *  editing. When on, each set row shows an m:ss time field. */
  protected readonly modalTrackTime = signal(false);

  /** Whether the open modal is collecting a note. Off when adding; on when
   *  editing an entry that already has one. Unlike {@link modalTrackTime} this
   *  has no global default — a note is occasional, not a standing preference. */
  protected readonly modalHasNotes = signal(false);

  /** The note text for the open modal. */
  protected readonly modalNotes = signal('');

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

  /** Entries bucketed by day index — for the "already logged today?" check and
   *  for capturing a day as a set; the grid does its own bucketing from the
   *  same helper. */
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

  /** Library workouts in the modal's selected muscle group. */
  protected readonly filteredWorkouts = computed(() =>
    workoutsInGroup(
      this.workoutService.workouts() ?? [],
      this.modalMuscleGroup(),
      this.settings.muscleGroups()
    )
  );

  private readonly selectedWorkout = computed(
    () => this.filteredWorkouts().find((w) => w.id === this.modalWorkoutId()) ?? null
  );

  /** Whether the modal's selected group is the reserved Cardio category —
   *  swaps the reps/weight/sets form for the single-session cardio fields. */
  protected readonly isCardio = computed(() => this.modalMuscleGroup() === CARDIO_GROUP);

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

  // --- The day's "+": log one workout, or drop in a whole saved set ---

  protected readonly showAddChoice = signal(false);
  protected readonly showSetPicker = signal(false);
  protected readonly applying = signal(false);
  protected readonly savedSets = this.setService.sets;

  /** The "+" no longer opens the logging form directly: it asks which of the
   *  two ways to fill a day the user means. */
  protected openAddChoice(day: number): void {
    this.activeDay.set(day);
    this.showAddChoice.set(true);
  }

  protected choose(choice: AddChoice): void {
    this.showAddChoice.set(false);
    if (choice === 'workout') this.openAddModal(this.activeDay());
    else this.showSetPicker.set(true);
  }

  /** The label of the day being added to, for the chooser and picker headings. */
  protected readonly activeDayLabel = computed(() => DAY_LABELS[this.activeDay()]);

  /** Monday-first day names, for labelling week-set rows in the pickers. */
  protected readonly dayLabels = DAY_LABELS;

  /**
   * Drop every exercise in `set` onto the active day, in one atomic write.
   *
   * The rules — skip what's already logged, re-weight body-weight exercises
   * from today's weigh-in, and never write back to the exercise library — all
   * live in `entriesFromSet`; this only reports the outcome.
   */
  protected async applySet(set: WorkoutSet): Promise<void> {
    const day = this.activeDay();
    const applied = entriesFromSet(
      set,
      day,
      this.entriesByDay()[day] ?? [],
      this.latestWeighIn()?.lbs ?? null
    );
    await this.commitApplied(
      applied,
      {
        label: set.name,
        nothingToAdd: `Everything in ${set.name} is already logged on ${DAY_LABELS[day]}.`,
        failure: 'Could not add that set. Please try again.',
      },
      () => this.showSetPicker.set(false)
    );
  }

  /** A saved set's exercises, summarised for the picker. */
  protected itemNames(set: WorkoutSet): string {
    return set.items.map((item) => item.workoutName).join(' · ');
  }

  /** The same summary for one day of a week set. */
  protected dayItemNames(day: WeekSetDay): string {
    return day.items.map((item) => item.workoutName).join(' · ');
  }

  /** Which days a week set fills, for its row in the picker. */
  protected weekDayNames(weekSet: WeekSet): string {
    return weekSet.days.map((d) => DAY_LABELS[d.day]).join(' · ');
  }

  /**
   * Drop **one day** of a week set onto the active day.
   *
   * The other half of the day picker: a week set is often the only place a
   * routine was written down, and wanting just Thursday out of it shouldn't
   * mean rebuilding it as a day set. Same rules, same reporting — this reuses
   * `entriesFromItems`, the function `entriesFromSet` itself delegates to.
   */
  protected async applyWeekSetDay(
    weekSet: WeekSet,
    dayOfSet: WeekSetDay
  ): Promise<void> {
    const day = this.activeDay();
    const label = `${weekSet.name} · ${DAY_LABELS[dayOfSet.day]}`;
    const applied = entriesFromItems(
      dayOfSet.items,
      day,
      this.entriesByDay()[day] ?? [],
      this.latestWeighIn()?.lbs ?? null
    );
    await this.commitApplied(
      applied,
      {
        label,
        nothingToAdd: `Everything in ${label} is already logged on ${DAY_LABELS[day]}.`,
        failure: 'Could not add that set. Please try again.',
      },
      () => this.showSetPicker.set(false)
    );
  }

  // --- Loading a whole week ---

  protected readonly showWeekSetPicker = signal(false);
  protected readonly savedWeekSets = this.weekSetService.weekSets;

  /** Whether the viewed week has anything in it — gates both week-level
   *  buttons, since there is nothing to capture from an empty week. */
  protected readonly weekHasEntries = computed(
    () => (this.entries()?.length ?? 0) > 0
  );

  /**
   * Drop a whole week set onto the week being viewed, in one atomic write.
   *
   * Purely additive, exactly like applying a day set: a day that already has an
   * exercise keeps it and that one exercise is skipped. Nothing is cleared, so
   * loading onto a week you've already logged tops it up rather than replacing
   * it. The per-day collision scoping lives in `entriesFromWeekSet`.
   */
  protected async applyWeekSet(weekSet: WeekSet): Promise<void> {
    const applied = entriesFromWeekSet(
      weekSet,
      this.entries() ?? [],
      this.latestWeighIn()?.lbs ?? null
    );
    await this.commitApplied(
      applied,
      {
        label: weekSet.name,
        nothingToAdd: `Everything in ${weekSet.name} is already logged this week.`,
        failure: 'Could not load that week. Please try again.',
      },
      () => this.showWeekSetPicker.set(false)
    );
  }

  /**
   * Write what an apply produced and say what happened — shared by all three
   * apply flows so the "nothing to add" case, the skipped list and the
   * `applying` guard can't drift between them.
   *
   * The three messages are the caller's, not this function's: "already logged
   * on Mon" and "already logged this week" are different facts, and a shared
   * wording that covered both would be vaguer than either.
   */
  private async commitApplied(
    { entries, skipped }: SetApplication,
    messages: { label: string; nothingToAdd: string; failure: string },
    onDone: () => void
  ): Promise<void> {
    if (entries.length === 0) {
      this.toast.show(messages.nothingToAdd, 'error');
      return;
    }

    this.applying.set(true);
    try {
      await this.service.addMany(entries);
      const added = `Added ${entries.length} ${entries.length === 1 ? 'exercise' : 'exercises'} from ${messages.label}.`;
      this.toast.show(
        skipped.length
          ? `${added} ${skipped.join(', ')} ${skipped.length === 1 ? 'was' : 'were'} already logged.`
          : added,
        'success'
      );
      onDone();
    } catch {
      this.toast.show(messages.failure, 'error');
    } finally {
      this.applying.set(false);
    }
  }

  // --- "Save this day as a set" / "Save this week as a set" ---

  protected readonly showSaveDay = signal(false);
  protected readonly saveDayItems = signal<SetItem[]>([]);
  protected readonly saveDayName = signal('');

  protected readonly showSaveWeek = signal(false);
  protected readonly saveWeekDays = signal<WeekSetDay[]>([]);
  protected readonly saveWeekName = signal('');

  /**
   * Which library exercises are body-weight ones.
   *
   * Capture needs this because a `WeekEntry` doesn't record it — only the
   * library does — and a body-weight exercise must be saved with **no** weight
   * so it picks up the reader's current one at apply time.
   */
  private bodyWeightIds(): ReadonlySet<string> {
    return new Set(
      (this.workoutService.workouts() ?? [])
        .filter((w) => w.bodyWeight && w.id)
        .map((w) => w.id!)
    );
  }

  /**
   * Open the set builder pre-filled with what's already logged on `day`.
   *
   * The natural way to build a set is to have just done it, so this captures a
   * day rather than asking the user to re-enter it. It opens the builder rather
   * than saving silently: a set wants a name, and this is the moment to look
   * over what's being kept.
   */
  protected onSaveDayAsSet(day: number): void {
    const entries = this.entriesByDay()[day] ?? [];
    if (entries.length === 0) return;
    this.saveDayItems.set(setItemsFromEntries(entries, this.bodyWeightIds()));
    this.saveDayName.set(`${DAY_LABELS[day]} session`);
    this.showSaveDay.set(true);
  }

  /**
   * The same idea one level up: the whole week being viewed, captured as a week
   * set and opened in the builder for a name.
   *
   * Rest days are dropped rather than stored empty, so what lands in the builder
   * is exactly the days that had something on them.
   */
  protected onSaveWeekAsSet(): void {
    const entries = this.entries() ?? [];
    if (entries.length === 0) return;
    this.saveWeekDays.set(weekSetDaysFromEntries(entries, this.bodyWeightIds()));
    this.saveWeekName.set(this.rangeLabel());
    this.showSaveWeek.set(true);
  }

  // --- Add / edit one logged workout ---

  protected openAddModal(day: number): void {
    this.editingId.set(null);
    this.activeDay.set(day);
    this.modalMuscleGroup.set(this.settings.muscleGroups()[0] ?? '');
    this.modalWorkoutId.set('');
    this.modalTrackTime.set(this.settings.showSetTime());
    this.rowPool = [];
    this.setRows.set([]);
    this.resetCardioFields();
    this.modalHasNotes.set(false);
    this.modalNotes.set('');
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
      this.rowPool = rowsFromLoggedSets(entry.sets, this.settings.unit());
      this.setRows.set(this.rowPool.slice());
      this.resetCardioFields();
    }
    // Seeded outside the cardio/strength split above: a note belongs to either
    // kind of session.
    this.modalNotes.set(entry.notes ?? '');
    this.modalHasNotes.set(!!entry.notes);
    this.error.set('');
    this.showModal.set(true);
  }

  protected toggleModalTrackTime(): void {
    this.modalTrackTime.update((v) => !v);
  }

  protected toggleModalNotes(): void {
    this.modalHasNotes.update((v) => !v);
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
    const count = clampSetCount(value);
    this.rowPool = growPool(
      this.rowPool,
      count,
      this.weightSeedFor(this.selectedWorkout())
    );
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
      if (!everyRowHasReps(sets)) {
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
    // '' rather than omitted: `update` uses `updateDoc`, which ignores a missing
    // key — leaving a note the user just cleared sitting in the document.
    const notes = this.modalHasNotes() ? this.modalNotes().trim() : '';
    const base = {
      day,
      workoutId: workout.id,
      workoutName: workout.name,
      muscleGroup: workout.muscleGroup,
      notes,
    };
    const data: Omit<WeekEntry, 'id' | 'createdAt'> = cardio
      ? { ...base, sets: [], cardio }
      : {
          ...base,
          trackTime,
          sets: rowsToLoggedSets(this.setRows(), this.settings.unit(), trackTime),
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
   *  Blank (no-weight) sets are ignored — see `uniformWeight`. Returns
   *  the toast message to show (the base message, with a suffix if the usual
   *  weight changed).
   *
   *  Note this runs only for a hand-logged entry. Applying a saved set
   *  deliberately skips it — see `entriesFromSet`. */
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
    if (!workout) return BLANK_SEED;
    return workout.bodyWeight
      ? bodyWeightSeed(this.latestWeighIn(), this.settings.unit())
      : canonicalSeed(workout.usualWeight, this.settings.unit());
  }

  /** Re-seed every pooled row's weight (e.g. the selected workout changed),
   *  leaving reps and time intact. */
  private reseedWeights(seed: WeightSeed): void {
    this.rowPool = reseedRows(this.rowPool, seed);
    this.setRows.set(this.rowPool.slice(0, this.setRows().length));
  }

  private resetCardioFields(): void {
    this.seedCardioFields(null);
  }

  /** Seed the cardio fields from a stored (canonical) log — or clear them,
   *  which is the same operation with nothing to seed from. */
  private seedCardioFields(cardio: CardioLog | null): void {
    const fields = fromCardioLog(cardio, this.settings.distanceUnit());
    this.cardioTimeText.set(fields.timeText);
    this.cardioDistance.set(fields.distance);
    this.cardioHeartRate.set(fields.heartRate);
    this.cardioElevation.set(fields.elevation);
  }

  /** The cardio log to save from the current form fields, or `null` if the
   *  required duration/distance aren't both present (a positive distance). */
  private buildCardioLog(): CardioLog | null {
    return toCardioLog(
      {
        timeText: this.cardioTimeText(),
        distance: this.cardioDistance(),
        heartRate: this.cardioHeartRate(),
        elevation: this.cardioElevation(),
      },
      this.settings.distanceUnit()
    );
  }
}
