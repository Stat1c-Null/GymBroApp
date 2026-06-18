import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import {
  WorkoutService,
  MUSCLE_GROUPS,
  MuscleGroup,
  Workout,
} from '../../services/workout.service';

@Component({
  selector: 'app-workouts',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './workouts.html',
  styleUrl: './workouts.css',
})
export class WorkoutsComponent {
  private readonly service = inject(WorkoutService);
  private readonly toast = inject(ToastService);

  protected readonly workouts = this.service.workouts;
  protected readonly muscleGroups = MUSCLE_GROUPS;

  // TODO: source from user settings once the Settings page exists.
  protected readonly unit = 'lbs';

  // Modal + form state
  protected readonly showModal = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected name = '';
  protected muscleGroup: MuscleGroup = MUSCLE_GROUPS[0];
  protected usualWeight: number | null = null;
  protected maxWeight: number | null = null;

  protected openModal(): void {
    this.name = '';
    this.muscleGroup = MUSCLE_GROUPS[0];
    this.usualWeight = null;
    this.maxWeight = null;
    this.error.set('');
    this.showModal.set(true);
  }

  protected closeModal(): void {
    this.showModal.set(false);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.name.trim()) {
      this.error.set('Please enter a workout name.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    try {
      await this.service.add({
        name: this.name.trim(),
        muscleGroup: this.muscleGroup,
        usualWeight: this.usualWeight ?? null,
        maxWeight: this.maxWeight ?? null,
      });
      this.toast.show('Workout added!', 'success');
      this.closeModal();
    } catch {
      this.error.set('Could not save your workout. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async onDelete(workout: Workout): Promise<void> {
    if (!workout.id) return;
    if (!confirm(`Delete "${workout.name}"? This can't be undone.`)) return;

    try {
      await this.service.remove(workout.id);
      this.toast.show('Workout deleted', 'success');
    } catch {
      this.toast.show('Could not delete workout. Please try again.', 'error');
    }
  }
}
