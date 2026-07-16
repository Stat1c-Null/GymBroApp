import { Injectable, computed, inject } from '@angular/core';
import { ChartPoint } from '../analytics/chart.types';
import { bucketByDay, movingAverage, toAscending } from '../analytics/time-series';
import { toDate } from './firestore-utils';
import { SettingsService } from './settings.service';
import { WeekService } from './week.service';
import { WeightService } from './weight.service';

/**
 * The smoothing window for the body-weight trend line, in days.
 *
 * Body weight swings a couple of pounds on water and food timing alone, so the raw
 * weigh-in series is mostly noise. Seven days is the standard window — long enough
 * to cancel the weekly eating cycle, short enough to still track a real cut.
 */
export const TREND_WINDOW_DAYS = 7;

/**
 * Body-weight data prepared for charting: unwrapped, sorted, day-bucketed, smoothed.
 *
 * A service rather than page computeds because this chain is shared — a Dashboard
 * sparkline would want exactly these signals, and duplicating the derivation is how
 * two views start disagreeing. Range filtering stays in the page, since that's view
 * state; the maths it calls are pure functions from `analytics/`.
 *
 * Everything is in **pounds**, the canonical storage unit. The page converts for
 * display via the user's unit preference.
 */
@Injectable({ providedIn: 'root' })
export class WeightAnalyticsService {
  private readonly weights = inject(WeightService);
  private readonly settings = inject(SettingsService);
  private readonly week = inject(WeekService);

  readonly goal = this.settings.weightGoal;

  /**
   * "Now", refreshed by WeekService on visibility change and every 60s, so anything
   * derived from it rolls over at midnight. Never call `new Date()` in a computed —
   * it makes the computed lie about its dependencies and it will never recompute.
   */
  readonly today = this.week.today;

  /** Every weigh-in as a point, ascending. `undefined` while loading. */
  readonly samples = computed<ChartPoint[] | undefined>(() => {
    const entries = this.weights.weights();
    if (entries === undefined) return undefined;
    const points: ChartPoint[] = [];
    for (const e of entries) {
      const date = toDate(e.createdAt);
      // A pending serverTimestamp has no date yet. Dropping the point is right —
      // coercing to 0 would plot it at 1970 and blow the x-domain wide open.
      if (!date) continue;
      points.push({ x: date.getTime(), y: e.lbs });
    }
    return toAscending(points);
  });

  /** One point per local day — the series everything else is derived from. */
  readonly daily = computed<ChartPoint[] | undefined>(() => {
    const s = this.samples();
    return s === undefined ? undefined : bucketByDay(s);
  });

  /** The 7-day trend: the actual signal under the noise. */
  readonly trend = computed<ChartPoint[] | undefined>(() => {
    const d = this.daily();
    return d === undefined ? undefined : movingAverage(d, TREND_WINDOW_DAYS);
  });

  /** The most recent weigh-in in pounds, or `null`. */
  readonly latestLbs = computed<number | null>(() => {
    const d = this.daily();
    return d?.length ? d[d.length - 1].y : null;
  });
}
