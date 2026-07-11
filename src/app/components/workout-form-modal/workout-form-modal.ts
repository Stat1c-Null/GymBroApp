import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { WorkoutService, Workout, UNASSIGNED_GROUP } from '../../services/workout.service';
import { WEIGHT_UNIT } from '../../services/weight.service';
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

  protected readonly unit = WEIGHT_UNIT;
  protected readonly muscleGroupsForForm = computed(() => [
    ...this.settings.muscleGroups(),
    UNASSIGNED_GROUP,
  ]);

  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly isEditing = computed(() => this.editingWorkout() != null);

  protected name = '';
  protected muscleGroup = '';
  protected usualWeight: number | null = null;
  protected maxWeight: number | null = null;

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
    this.usualWeight = w?.usualWeight ?? null;
    this.maxWeight = w?.maxWeight ?? null;
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
      usualWeight: this.usualWeight ?? null,
      maxWeight: this.maxWeight ?? null,
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
}
