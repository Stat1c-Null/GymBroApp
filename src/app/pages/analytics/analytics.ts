import { Component, effect, inject, signal } from '@angular/core';
import { TimeRangeKey } from '../../analytics/chart.types';
import { RangeSelectorComponent } from '../../components/charts/range-selector';
import { GoalFormModalComponent } from './goal-form-modal';
import { WeightBurndownComponent } from './weight-burndown/weight-burndown';
import { MuscleProgressComponent } from './muscle-progress/muscle-progress';
import { EntryBackfillService } from '../../services/entry-backfill.service';
import { SettingsService } from '../../services/settings.service';
import { WeightService } from '../../services/weight.service';
import { WorkoutService } from '../../services/workout.service';

/**
 * The Analytics page: one range selector scoping a stack of analytics cards.
 *
 * Body weight is the first card; exercise progress (per muscle group) is the second.
 * Both are driven by the same `range` — a per-card range would let two cards disagree
 * about the window they show.
 *
 * The page also hosts the one-time back-fill that stamps `uid`/`date` onto older
 * logged entries, since the exercise card's cross-week query can't see entries that
 * lack them. It runs once (guarded by a persisted flag) the first time the page is
 * opened after the feature ships.
 */
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    RangeSelectorComponent,
    WeightBurndownComponent,
    MuscleProgressComponent,
    GoalFormModalComponent,
  ],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class AnalyticsComponent {
  private readonly backfill = inject(EntryBackfillService);
  private readonly settings = inject(SettingsService);
  private readonly workouts = inject(WorkoutService);
  private readonly weights = inject(WeightService);

  /** One window for the whole page — never per-card, or the cards can disagree. */
  protected readonly range = signal<TimeRangeKey>('90d');
  protected readonly goalModalOpen = signal(false);

  /** Guards against launching the back-fill more than once per session. */
  private hasRunBackfill = false;

  /**
   * Run the entry back-fill once, after the data its scan window is derived from has
   * loaded and only if it hasn't already completed. Idempotent, so the rare case
   * where it fires before the persisted flag has loaded just does a cheap no-op pass.
   */
  private readonly ensureBackfill = effect(() => {
    const workouts = this.workouts.workouts();
    const weights = this.weights.weights();
    if (workouts === undefined || weights === undefined) return;
    if (this.hasRunBackfill || this.settings.entriesBackfilledAt() != null) return;

    this.hasRunBackfill = true;
    // No exercises means no logged entries to migrate — just record it as done.
    if (workouts.length === 0) {
      void this.settings.markEntriesBackfilled();
      return;
    }
    void this.runBackfill();
  });

  private async runBackfill(): Promise<void> {
    try {
      const { stamped, skipped } = await this.backfill.backfillEntries();
      await this.settings.markEntriesBackfilled();
      console.info(
        `[analytics] entry back-fill complete: stamped ${stamped}, skipped ${skipped}`
      );
    } catch (err) {
      // Leave the flag unset so a later visit retries — the migration is idempotent.
      this.hasRunBackfill = false;
      console.error('[analytics] entry back-fill failed', err);
    }
  }
}
