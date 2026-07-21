import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { WorkoutService, UNASSIGNED_GROUP } from '../../services/workout.service';
import { WeightUnit } from '../../services/weight.service';
import { EntryBackfillService } from '../../services/entry-backfill.service';

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
  private readonly backfill = inject(EntryBackfillService);

  protected readonly showSetTime = this.settings.showSetTime;
  protected readonly unit = this.settings.unit;
  protected readonly units: readonly WeightUnit[] = ['lbs', 'kg'];
  protected readonly saving = signal(false);
  protected readonly backfilling = signal(false);

  protected async setUnit(unit: WeightUnit): Promise<void> {
    if (unit === this.unit()) return;
    this.saving.set(true);
    try {
      await this.settings.setUnit(unit);
    } catch {
      this.toast.show('Could not save your setting. Please try again.', 'error');
    } finally {
      this.saving.set(false);
    }
  }

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

  /**
   * Re-run the analytics back-fill on demand. Additive and idempotent — it only
   * stamps `uid`/`date` onto entries missing them — so it's safe to run any time,
   * e.g. to confirm every logged set is visible to the exercise analytics.
   */
  protected async rerunBackfill(): Promise<void> {
    this.backfilling.set(true);
    try {
      const { stamped, skipped } = await this.backfill.backfillEntries();
      await this.settings.markEntriesBackfilled();
      this.toast.show(
        `Analytics data refreshed — updated ${stamped}, already current ${skipped}.`,
        'success'
      );
    } catch {
      this.toast.show('Could not refresh analytics data. Please try again.', 'error');
    } finally {
      this.backfilling.set(false);
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
    if (name.toLowerCase() === UNASSIGNED_GROUP.toLowerCase()) {
      this.toast.show(`"${UNASSIGNED_GROUP}" is reserved and cannot be used.`, 'error');
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
    if (newName.toLowerCase() === UNASSIGNED_GROUP.toLowerCase()) {
      this.toast.show(`"${UNASSIGNED_GROUP}" is reserved and cannot be used.`, 'error');
      return;
    }
    const current = this.settings.muscleGroups();
    if (current.some((g) => g !== oldName && g.toLowerCase() === newName.toLowerCase())) {
      this.toast.show(`"${newName}" already exists.`, 'error');
      return;
    }
    this.renamingGroup.set(true);
    try {
      await this.settings.renameGroup(oldName, newName);
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
      // deleteGroup reassigns affected workouts (queried server-side) and drops
      // the group from the list in one atomic batch.
      await this.settings.deleteGroup(group);
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
