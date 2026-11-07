import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimeRangeKey } from '../../analytics/chart.types';
import { BrandLogoComponent } from '../../components/brand-logo/brand-logo';
import { ChangelogEntryComponent } from '../../components/changelog-entry/changelog-entry';
import { AnalyticsCardComponent } from '../../components/charts/analytics-card';
import { RangeSelectorComponent } from '../../components/charts/range-selector';
import { AuthService } from '../../services/auth.service';
import { EntryBackfillService } from '../../services/entry-backfill.service';
import { TrainingTotalsComponent } from '../analytics/totals/training-totals';
import { WeightBurndownComponent } from '../analytics/weight-burndown/weight-burndown';
import { CHANGELOG } from '../changelog/changelog-data';
import { TodayWorkoutsComponent } from './today-workouts/today-workouts';

/**
 * The landing page: a slim greeting with quick links, then a read-only summary —
 * weight burndown and training totals side by side, today's logged workouts, and
 * the latest changelog entry.
 *
 * Everything here is a summary of another page, never a second place to edit:
 * each card links to where the real thing lives. The two analytics cards are the
 * Analytics page's own components in `compact` mode, sharing one range selector
 * for the same reason the Analytics page has only one — two cards drawn from
 * different windows would disagree.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    AnalyticsCardComponent,
    BrandLogoComponent,
    ChangelogEntryComponent,
    RangeSelectorComponent,
    RouterLink,
    TodayWorkoutsComponent,
    TrainingTotalsComponent,
    WeightBurndownComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  protected readonly authService = inject(AuthService);
  private readonly backfill = inject(EntryBackfillService);

  /** Shorter than Analytics' 90d default: the dashboard is "how am I doing lately". */
  protected readonly range = signal<TimeRangeKey>('30d');

  /** Only the newest release — the full history is one click away. */
  protected readonly latestRelease = CHANGELOG[0];

  /** The Totals card can't see entries missing `uid`/`date` until this has run
   *  once; without it, a user who never opens Analytics would see short totals. */
  private readonly ensureBackfill = effect(() => this.backfill.ensureBackfilled());
}
