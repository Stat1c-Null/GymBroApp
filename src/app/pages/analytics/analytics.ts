import { Component, signal } from '@angular/core';
import { TimeRangeKey } from '../../analytics/chart.types';
import { RangeSelectorComponent } from '../../components/charts/range-selector';
import { GoalFormModalComponent } from './goal-form-modal';
import { WeightBurndownComponent } from './weight-burndown/weight-burndown';

/**
 * The Analytics page: one range selector scoping a stack of analytics cards.
 *
 * Body weight is the first card. Future analytics (volume per muscle group, 1RM
 * progression, frequency) drop in as further cards driven by the same `range` —
 * they should need no change to `line-chart`, `analytics-card` or `stat-tile`.
 */
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [RangeSelectorComponent, WeightBurndownComponent, GoalFormModalComponent],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class AnalyticsComponent {
  /** One window for the whole page — never per-card, or the cards can disagree. */
  protected readonly range = signal<TimeRangeKey>('90d');
  protected readonly goalModalOpen = signal(false);
}
