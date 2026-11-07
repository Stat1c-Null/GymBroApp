import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import {
  BLANK_SEED,
  canonicalSeed,
  clampSetCount,
  growPool,
} from '../../services/set-rows';
import {
  Workout,
  WorkoutService,
  loggableGroups,
  workoutsInGroup,
} from '../../services/workout.service';
import { CardioFieldsComponent } from '../cardio-fields/cardio-fields';
import { SetRowsEditorComponent } from '../set-rows-editor/set-rows-editor';
import { BuilderItem, isCardioItem, selectWorkout } from './builder-item';

/**
 * One exercise block in the set builder: which exercise, and how it's done.
 *
 * The same three parts the Weeks logging modal has — an exercise picker, the
 * per-set rows (or the cardio fields), and an optional note — but recording a
 * *plan* rather than a session. `SetRowsEditorComponent` and
 * `CardioFieldsComponent` are literally the same components the Weeks modal
 * uses; only `template` mode differs, which is what stops a body weight from
 * being baked into a routine.
 *
 * It edits the {@link BuilderItem} it's handed, in place. The object's fields
 * are signals precisely so that this component and its parent — which share the
 * one object — both see those edits.
 */
@Component({
  selector: 'app-set-item-editor',
  standalone: true,
  imports: [FormsModule, SetRowsEditorComponent, CardioFieldsComponent],
  templateUrl: './set-item-editor.html',
  styleUrl: './set-item-editor.css',
})
export class SetItemEditorComponent {
  private readonly workoutService = inject(WorkoutService);
  private readonly settings = inject(SettingsService);

  readonly item = input.required<BuilderItem>();
  /** 1-based position, for the block's "Exercise 2" heading. */
  readonly position = input.required<number>();

  readonly remove = output<void>();
  /** Bubbled up so the parent can layer the shared create-workout modal over
   *  the builder — the same trick the Weeks modal plays. */
  readonly createWorkout = output<void>();

  protected readonly muscleGroups = computed(() =>
    loggableGroups(this.settings.muscleGroups(), this.workoutService.workouts() ?? [])
  );

  protected readonly filteredWorkouts = computed(() =>
    workoutsInGroup(
      this.workoutService.workouts() ?? [],
      this.item().muscleGroup(),
      this.settings.muscleGroups()
    )
  );

  protected readonly isCardio = computed(() => isCardioItem(this.item()));

  /** Unique per block, so several editors can share one `<form>` without their
   *  control names colliding. */
  protected readonly idPrefix = computed(() => `set-item-${this.item().key}`);

  /**
   * The chosen exercise is no longer in the library — deleted since this set
   * was saved. The set still works (name and group are denormalized onto the
   * item), so the block is labelled rather than emptied; picking a replacement
   * from the dropdown is the way out.
   */
  protected readonly missing = computed(() => {
    const item = this.item();
    return (
      !!item.workoutId() &&
      !this.filteredWorkouts().some((w) => w.id === item.workoutId())
    );
  });

  protected onGroupChange(group: string): void {
    const item = this.item();
    item.muscleGroup.set(group);
    item.workoutId.set('');
    item.name.set('');
    item.bodyWeight.set(false);
    item.rowPool = [];
    item.rows.set([]);
    this.resetCardio();
  }

  protected onWorkoutChange(id: string): void {
    const workout = this.filteredWorkouts().find((w) => w.id === id);
    if (!workout) return;
    selectWorkout(this.item(), workout, this.settings.unit());
    if (this.isCardio()) this.resetCardio();
  }

  /** Grow/shrink the visible rows. Shrinking only hides them — they stay in the
   *  pool with whatever was typed, so a transient count doesn't destroy data. */
  protected onCountChange(value: number | null): void {
    const item = this.item();
    const count = clampSetCount(value);
    item.rowPool = growPool(item.rowPool, count, this.seed());
    item.rows.set(item.rowPool.slice(0, count));
  }

  protected toggleNotes(): void {
    this.item().hasNotes.update((v) => !v);
  }

  /** What a newly-added row starts with. A body-weight exercise gets nothing:
   *  its weight is filled in when the set is applied to a day, not now. */
  private seed() {
    const item = this.item();
    if (item.bodyWeight()) return BLANK_SEED;
    const workout: Workout | undefined = this.filteredWorkouts().find(
      (w) => w.id === item.workoutId()
    );
    return canonicalSeed(workout?.usualWeight ?? null, this.settings.unit());
  }

  private resetCardio(): void {
    const item = this.item();
    item.cardioTimeText.set('');
    item.cardioDistance.set(null);
    item.cardioHeartRate.set(null);
    item.cardioElevation.set(null);
  }
}
