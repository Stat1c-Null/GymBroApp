import { Component, inject, signal } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { entrySummary } from '../../services/entry-summary';
import {
  SetItem,
  WorkoutSet,
  WorkoutSetService,
} from '../../services/workout-set.service';
import { SetFormModalComponent } from '../../components/set-form-modal/set-form-modal';

/**
 * The saved-sets library: reusable bundles of exercises, for anyone who does
 * the same session week after week and would rather not re-enter it every time.
 *
 * The page itself is a thin list — create/edit is entirely owned by
 * `SetFormModalComponent`, which the Weeks page also opens for "save this day
 * as a set". Applying a set to a day belongs to the Weeks page; from here a set
 * is only written and maintained.
 */
@Component({
  selector: 'app-sets',
  standalone: true,
  imports: [SetFormModalComponent],
  templateUrl: './sets.html',
  styleUrl: './sets.css',
})
export class SetsComponent {
  private readonly service = inject(WorkoutSetService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly sets = this.service.sets;

  protected readonly modalOpen = signal(false);
  /** null = creating a new set; a set = editing it. */
  protected readonly editingSet = signal<WorkoutSet | null>(null);

  /** Open the builder — pass a set to edit it, or nothing to create one. */
  protected openModal(set?: WorkoutSet): void {
    this.editingSet.set(set ?? null);
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  /** The same one-line summary the week grid shows for a logged exercise —
   *  in the reader's units, from the reader's settings. */
  protected summaryOf(item: SetItem): string {
    return entrySummary(item, {
      weight: this.settings.unit(),
      distance: this.settings.distanceUnit(),
    });
  }

  protected async onDelete(set: WorkoutSet): Promise<void> {
    if (!set.id) return;
    if (!confirm(`Delete "${set.name}"? This can't be undone.`)) return;

    try {
      await this.service.remove(set.id);
      this.toast.show('Set deleted', 'success');
    } catch {
      this.toast.show('Could not delete set. Please try again.', 'error');
    }
  }
}
