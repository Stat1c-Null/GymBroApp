import { Component, effect, inject, signal } from '@angular/core';
import { TimeRangeKey } from '../../analytics/chart.types';
import { RangeSelectorComponent } from '../../components/charts/range-selector';
import { GoalFormModalComponent } from './goal-form-modal';
import { WeightBurndownComponent } from './weight-burndown/weight-burndown';
import { MuscleProgressComponent } from './muscle-progress/muscle-progress';
import { TrainingTotalsComponent } from './totals/training-totals';
import { EntryBackfillService } from '../../services/entry-backfill.service';

/**
 * The Analytics page: one range selector scoping a stack of analytics cards.
 *
 * Body weight is the first card, exercise progress (per muscle group) the second,
 * and training totals the third. All are driven by the same `range` — a per-card
 * range would let the cards disagree about the window they show.
 *
 * The page also triggers the one-time back-fill that stamps `uid`/`date` onto older
 * logged entries, since the exercise card's cross-week query can't see entries that
 * lack them. The Dashboard triggers it too; `EntryBackfillService.ensureBackfilled`
 * makes sure it only runs once (guarded by a persisted flag).
 */
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    RangeSelectorComponent,
    WeightBurndownComponent,
    MuscleProgressComponent,
    TrainingTotalsComponent,
    GoalFormModalComponent,
  ],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class AnalyticsComponent {
  private readonly backfill = inject(EntryBackfillService);

  /** One window for the whole page — never per-card, or the cards can disagree. */
  protected readonly range = signal<TimeRangeKey>('90d');
  protected readonly goalModalOpen = signal(false);

  /** Re-runs until the data the back-fill's scan window needs has loaded. */
  private readonly ensureBackfill = effect(() => this.backfill.ensureBackfilled());
}
