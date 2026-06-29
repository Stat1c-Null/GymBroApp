import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { WorkoutService } from '../../services/workout.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsComponent {
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);
  private readonly workoutService = inject(WorkoutService);

  protected readonly showSetTime = this.settings.showSetTime;
  protected readonly saving = signal(false);

  protected async toggleSetTime(): Promise<void> {
    this.saving.set(true);
    try {
      await this.settings.setShowSetTime(!this.showSetTime());
    } catch {
      this.toast.show('Could not save your setting. Please try again.', 'error');
    } finally {
      this.saving.set(false);
    }
  }

  // Muscle group management
  protected readonly muscleGroups = this.settings.muscleGroups;
  protected newGroupName = '';
  protected readonly addingGroup = signal(false);
  protected readonly managingGroups = signal(false);
  protected readonly pendingDeleteGroup = signal<string | null>(null);

  protected readonly affectedCount = computed(() => {
    const pending = this.pendingDeleteGroup();
    if (!pending) return 0;
    return (this.workoutService.workouts() ?? []).filter(
      (w) => w.muscleGroup === pending
    ).length;
  });

  protected async addGroup(): Promise<void> {
    const name = this.newGroupName.trim();
    if (!name) return;
    if (name.toLowerCase() === 'unassigned') {
      this.toast.show('"Unassigned" is reserved and cannot be used.', 'error');
      return;
    }
    const current = this.settings.muscleGroups();
    if (current.some((g) => g.toLowerCase() === name.toLowerCase())) {
      this.toast.show(`"${name}" already exists.`, 'error');
      return;
    }
    this.addingGroup.set(true);
    try {
      await this.settings.setMuscleGroups([...current, name]);
      this.newGroupName = '';
    } catch {
      this.toast.show('Could not save. Please try again.', 'error');
    } finally {
      this.addingGroup.set(false);
    }
  }

  // Inline rename
  protected readonly editingGroup = signal<string | null>(null);
  protected editingGroupName = '';
  protected readonly renamingGroup = signal(false);

  protected startEditGroup(group: string): void {
    this.pendingDeleteGroup.set(null);
    this.editingGroupName = group;
    this.editingGroup.set(group);
  }

  protected cancelEditGroup(): void {
    this.editingGroup.set(null);
  }

  protected async confirmRenameGroup(): Promise<void> {
    const oldName = this.editingGroup();
    const newName = this.editingGroupName.trim();
    if (!oldName) return;
    if (!newName || newName === oldName) {
      this.editingGroup.set(null);
      return;
    }
    if (newName.toLowerCase() === 'unassigned') {
      this.toast.show('"Unassigned" is reserved and cannot be used.', 'error');
      return;
    }
    const current = this.settings.muscleGroups();
    if (current.some((g) => g !== oldName && g.toLowerCase() === newName.toLowerCase())) {
      this.toast.show(`"${newName}" already exists.`, 'error');
      return;
    }
    this.renamingGroup.set(true);
    try {
      await this.workoutService.renameGroup(oldName, newName);
      await this.settings.setMuscleGroups(
        current.map((g) => (g === oldName ? newName : g))
      );
      this.editingGroup.set(null);
    } catch {
      this.toast.show('Could not rename group. Please try again.', 'error');
    } finally {
      this.renamingGroup.set(false);
    }
  }

  protected requestDeleteGroup(group: string): void {
    this.editingGroup.set(null);
    this.pendingDeleteGroup.set(group);
  }

  protected async confirmDeleteGroup(): Promise<void> {
    const group = this.pendingDeleteGroup();
    if (!group) return;
    this.managingGroups.set(true);
    try {
      if (this.affectedCount() > 0) {
        await this.workoutService.reassignMuscleGroup(group);
      }
      await this.settings.setMuscleGroups(
        this.settings.muscleGroups().filter((g) => g !== group)
      );
      this.pendingDeleteGroup.set(null);
      this.toast.show(`"${group}" removed.`, 'success');
    } catch {
      this.toast.show('Could not remove group. Please try again.', 'error');
    } finally {
      this.managingGroups.set(false);
    }
  }

  protected cancelDeleteGroup(): void {
    this.pendingDeleteGroup.set(null);
  }
}
