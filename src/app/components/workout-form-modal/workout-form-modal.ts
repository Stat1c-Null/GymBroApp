import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { WorkoutService, Workout, UNASSIGNED_GROUP, CARDIO_GROUP } from '../../services/workout.service';
import { displayLifted, liftedToCanonical } from '../../services/weight.service';
import { SettingsService } from '../../services/settings.service';
import { ModalComponent } from '../modal/modal';

/**
 * Shared create/edit-workout modal. Owns the whole form (name, muscle group,
 * usual/max weight), validation, and the save call, so both the Workouts page
 * and the Weeks "Create new workout" flow reuse one implementation.
 *
 * Driven by inputs: pass `editingWorkout` to edit, or `presetGroup` to preselect
 * a group when adding. Emits `saved` (with the persisted workout, including its
 * id) and `close`.
 */
@Component({
  selector: 'app-workout-form-modal',
  standalone: true,
  imports: [FormsModule, ModalComponent],
  templateUrl: './workout-form-modal.html',
})
export class WorkoutFormModalComponent {
  private readonly service = inject(WorkoutService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly editingWorkout = input<Workout | null>(null);
  readonly presetGroup = input('');

  readonly close = output<void>();
  readonly saved = output<Workout>();

  protected readonly unit = this.settings.unit;
  /** Exposed so the template can hide the weight fields for this group. */
  protected readonly cardioGroup = CARDIO_GROUP;
  protected readonly muscleGroupsForForm = computed(() => [
    CARDIO_GROUP,
    ...this.settings.muscleGroups(),
    UNASSIGNED_GROUP,
  ]);

  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly isEditing = computed(() => this.editingWorkout() != null);

  protected name = '';
  protected muscleGroup = '';
  /** Shown in the user's unit; converted back to canonical lbs on submit. */
  protected usualWeight: number | null = null;
  protected maxWeight: number | null = null;

  /**
   * What the weight fields were seeded with: the stored (canonical lbs) values and
   * the display values derived from them. An untouched field is written back
   * verbatim — re-converting it would round-trip through `convertWeight`'s
   * 1-decimal rounding and shift the stored number (135 lbs → 61.2 kg → 134.9 lbs)
   * just because someone opened the form in kg and renamed the workout.
   */
  private seeded = { usual: null as number | null, max: null as number | null };
  private canonical = { usual: null as number | null, max: null as number | null };

  constructor() {
    // Re-seed the form each time the modal transitions from closed to open, so
    // it reflects the latest edit target / preset group without clobbering the
    // user's typing while it's open.
    let prevOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !prevOpen) this.initForm();
      prevOpen = isOpen;
    });
  }

  private initForm(): void {
    const w = this.editingWorkout();
    this.name = w?.name ?? '';
    this.muscleGroup =
      w?.muscleGroup ?? this.presetGroup() ?? this.muscleGroupsForForm()[0] ?? '';
    const unit = this.settings.unit();
    this.canonical = { usual: w?.usualWeight ?? null, max: w?.maxWeight ?? null };
    this.usualWeight = displayLifted(this.canonical.usual, unit);
    this.maxWeight = displayLifted(this.canonical.max, unit);
    this.seeded = { usual: this.usualWeight, max: this.maxWeight };
    this.error.set('');
  }

  protected async onSubmit(): Promise<void> {
    if (!this.name.trim()) {
      this.error.set('Please enter a workout name.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const data = {
      name: this.name.trim(),
      muscleGroup: this.muscleGroup,
      // Cardio exercises don't collect a usual/max lifted weight — the form
      // hides those inputs for this group, so ignore whatever's left in them.
      usualWeight:
        this.muscleGroup === CARDIO_GROUP
          ? null
          : this.toCanonical(this.usualWeight, this.seeded.usual, this.canonical.usual),
      maxWeight:
        this.muscleGroup === CARDIO_GROUP
          ? null
          : this.toCanonical(this.maxWeight, this.seeded.max, this.canonical.max),
    };
    const id = this.editingWorkout()?.id ?? null;

    try {
      let savedId: string;
      if (id) {
        await this.service.update(id, data);
        savedId = id;
        this.toast.show('Workout updated!', 'success');
      } else {
        savedId = await this.service.add(data);
        this.toast.show('Workout added!', 'success');
      }
      this.saved.emit({ id: savedId, ...data });
      this.close.emit();
    } catch {
      this.error.set('Could not save your workout. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  /** The value to store for a weight field — see {@link seeded}. */
  private toCanonical(
    current: number | null,
    seeded: number | null,
    canonical: number | null
  ): number | null {
    if (current == null) return null;
    if (current === seeded) return canonical;
    return liftedToCanonical(current, this.settings.unit());
  }
}
