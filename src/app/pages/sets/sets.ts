import { Component, inject, signal } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { entrySummary } from '../../services/entry-summary';
import { DAY_LABELS } from '../../services/week.service';
import {
  WeekSet,
  WeekSetService,
  weekSetItemCount,
} from '../../services/week-set.service';
import {
  SetItem,
  WorkoutSet,
  WorkoutSetService,
} from '../../services/workout-set.service';
import { SetFormModalComponent } from '../../components/set-form-modal/set-form-modal';

/**
 * The saved-sets library, in two sections: **day sets** — reusable bundles of
 * exercises, for anyone who does the same session week after week — and **week
 * sets**, the whole Mon–Sun plan for anyone on a fixed split.
 *
 * The page itself is a thin list of both. Create/edit is entirely owned by
 * `SetFormModalComponent` (in `mode: 'day'` and `mode: 'week'` respectively),
 * which the Weeks page also opens for "save this day as a set" and "save this
 * week as a set". Applying either to a day or a week belongs to the Weeks page;
 * from here they are only written and maintained.
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
  private readonly weekService = inject(WeekSetService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly sets = this.service.sets;
  protected readonly weekSets = this.weekService.weekSets;
  protected readonly dayLabels = DAY_LABELS;

  protected readonly modalOpen = signal(false);
  /** null = creating a new set; a set = editing it. */
  protected readonly editingSet = signal<WorkoutSet | null>(null);

  /** The week-set builder is the same component in `mode: 'week'`, so it needs
   *  its own open/editing pair rather than sharing the two above. */
  protected readonly weekModalOpen = signal(false);
  protected readonly editingWeekSet = signal<WeekSet | null>(null);

  /** Open the builder — pass a set to edit it, or nothing to create one. */
  protected openModal(set?: WorkoutSet): void {
    this.editingSet.set(set ?? null);
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected openWeekModal(weekSet?: WeekSet): void {
    this.editingWeekSet.set(weekSet ?? null);
    this.weekModalOpen.set(true);
  }

  protected closeWeekModal(): void {
    this.weekModalOpen.set(false);
  }

  /** The same one-line summary the week grid shows for a logged exercise —
   *  in the reader's units, from the reader's settings. */
  protected summaryOf(item: SetItem): string {
    return entrySummary(item, {
      weight: this.settings.unit(),
      distance: this.settings.distanceUnit(),
    });
  }

  protected exerciseCount(weekSet: WeekSet): number {
    return weekSetItemCount(weekSet);
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

  protected async onDeleteWeek(weekSet: WeekSet): Promise<void> {
    if (!weekSet.id) return;
    if (!confirm(`Delete "${weekSet.name}"? This can't be undone.`)) return;

    try {
      await this.weekService.remove(weekSet.id);
      this.toast.show('Week deleted', 'success');
    } catch {
      this.toast.show('Could not delete week. Please try again.', 'error');
    }
  }
}
