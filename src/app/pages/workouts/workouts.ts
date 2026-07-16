import { Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../services/toast.service';
import { WorkoutService, Workout, UNASSIGNED_GROUP } from '../../services/workout.service';
import { LiftedWeightPipe } from '../../components/lifted-weight-pipe';
import { SettingsService } from '../../services/settings.service';
import { WorkoutFormModalComponent } from '../../components/workout-form-modal/workout-form-modal';

@Component({
  selector: 'app-workouts',
  standalone: true,
  imports: [WorkoutFormModalComponent, LiftedWeightPipe],
  templateUrl: './workouts.html',
  styleUrl: './workouts.css',
})
export class WorkoutsComponent {
  private readonly service = inject(WorkoutService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly workouts = this.service.workouts;

  protected readonly groupedWorkouts = computed(() => {
    const list = this.workouts() ?? [];
    const groups = this.settings.muscleGroups();
    const knownGroups = new Set(groups);
    const result = groups
      .map((group) => ({ group, items: list.filter((w) => w.muscleGroup === group) }))
      .filter((g) => g.items.length > 0);
    const unassigned = list.filter((w) => !knownGroups.has(w.muscleGroup));
    if (unassigned.length > 0) {
      result.push({ group: UNASSIGNED_GROUP, items: unassigned });
    }
    return result;
  });

  /** Muscle-group sections currently expanded (collapsed by default). */
  protected readonly expandedGroups = signal<ReadonlySet<string>>(new Set());

  protected isExpanded(group: string): boolean {
    return this.expandedGroups().has(group);
  }

  protected toggleGroup(group: string): void {
    this.expandedGroups.update((groups) => {
      const next = new Set(groups);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  protected readonly unit = this.settings.unit;

  // Shared create/edit-workout modal state.
  protected readonly modalOpen = signal(false);
  /** null = adding a new workout; a workout = editing it. */
  protected readonly editingWorkout = signal<Workout | null>(null);

  /** Open the modal — pass a workout to edit it, or nothing to add a new one. */
  protected openModal(workout?: Workout): void {
    this.editingWorkout.set(workout ?? null);
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
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
