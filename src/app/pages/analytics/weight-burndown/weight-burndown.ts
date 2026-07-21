import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BurndownStats,
  computeBurndown,
  directionSign,
  idealLine,
  projectionLine,
} from '../../../analytics/burndown';
import { ChartPoint, ChartSeries, Extent, TimeRangeKey } from '../../../analytics/chart.types';
import {
  extentOf,
  filterFrom,
  linearRegression,
  padExtent,
  rangeStart,
} from '../../../analytics/time-series';
import { AnalyticsCardComponent } from '../../../components/charts/analytics-card';
import { LineChartComponent } from '../../../components/charts/line-chart';
import { StatTileComponent, StatTone } from '../../../components/charts/stat-tile';
import { SettingsService } from '../../../services/settings.service';
import { WeightAnalyticsService } from '../../../services/weight-analytics.service';
import { displayLifted } from '../../../services/weight.service';

/**
 * Body-weight burndown: actual weigh-ins against the pace needed to hit the goal.
 *
 * Plots **weight**, not "remaining to goal". A literal burndown (y = distance from
 * target) would invert for bulking, vanish when no goal is set, and rewrite its own
 * history whenever the goal changed. Plotting weight with the plan as a reference
 * line keeps the burndown read — a line descending to a target — while staying
 * direction-agnostic and useful before any goal exists.
 */
@Component({
  selector: 'app-weight-burndown',
  standalone: true,
  imports: [AnalyticsCardComponent, LineChartComponent, StatTileComponent, RouterLink],
  templateUrl: './weight-burndown.html',
  styleUrl: './weight-burndown.css',
})
export class WeightBurndownComponent {
  private readonly analytics = inject(WeightAnalyticsService);
  private readonly settings = inject(SettingsService);

  readonly range = input.required<TimeRangeKey>();
  readonly editGoal = output<void>();

  protected readonly unit = this.settings.unit;
  protected readonly goal = this.analytics.goal;

  protected readonly state = computed<'loading' | 'empty' | 'ready'>(() => {
    const daily = this.analytics.daily();
    if (daily === undefined) return 'loading';
    return daily.length === 0 ? 'empty' : 'ready';
  });

  /** Day-bucketed weigh-ins within the selected window. */
  private readonly windowed = computed<ChartPoint[]>(() => {
    const daily = this.analytics.daily() ?? [];
    return filterFrom(daily, rangeStart(this.range(), this.analytics.today().getTime()));
  });

  private readonly windowedTrend = computed<ChartPoint[]>(() => {
    const trend = this.analytics.trend() ?? [];
    return filterFrom(trend, rangeStart(this.range(), this.analytics.today().getTime()));
  });

  protected readonly stats = computed<BurndownStats | null>(() => {
    const goal = this.goal();
    if (!goal) return null;
    return computeBurndown(
      this.windowed(),
      this.windowedTrend(),
      goal,
      this.analytics.today().getTime()
    );
  });

  protected readonly series = computed<ChartSeries[]>(() => {
    const goal = this.goal();
    const points = this.windowed();
    const trend = this.windowedTrend();
    const list: ChartSeries[] = [];

    // Context first, accent last — draw order is z-order in Chart.js.
    if (goal) {
      const plan = idealLine(goal);
      if (plan.length) {
        list.push({ id: 'plan', label: 'Plan', points: plan, role: 'plan', dashed: true });
      }

      const projection = projectionLine(trend, goal, linearRegression(trend));
      if (projection) {
        list.push({
          id: 'projection',
          label: 'Projected',
          points: projection,
          role: 'projection',
          dashed: true,
        });
      }
    }

    if (trend.length) {
      list.push({ id: 'trend', label: '7-day trend', points: trend, role: 'trend' });
    }

    // Dots only, no connecting line: day-to-day bodyweight is water noise, and
    // joining it produces a jagged line that shouts louder than the trend, which
    // is the thing actually worth reading.
    list.push({
      id: 'actual',
      label: 'Weigh-ins',
      points,
      role: 'actual',
      line: false,
      dots: true,
    });

    return list;
  });

  /** Padded to the data, but always wide enough to show the goal line. */
  protected readonly yDomain = computed<Extent | null>(() => {
    const values = this.series().flatMap((s) => s.points.map((p) => p.y));
    const extent = extentOf(values);
    if (!extent) return null;
    const goal = this.goal();
    return padExtent(extent, 0.12, goal ? [goal.targetLbs] : []);
  });

  /**
   * Ends at the target date when there's a goal — a burndown whose target sits off
   * the canvas isn't a burndown.
   */
  protected readonly xDomain = computed<Extent | null>(() => {
    const xs = this.series().flatMap((s) => s.points.map((p) => p.x));
    const extent = extentOf(xs);
    if (!extent) return null;
    return { min: extent.min, max: Math.max(extent.max, this.analytics.today().getTime()) };
  });

  protected readonly formatX = (ms: number): string =>
    new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  protected readonly formatY = (lbs: number): string => this.show(lbs);

  protected readonly ariaLabel = computed(() => {
    const stats = this.stats();
    const base = `Body weight over time, in ${this.unit()}`;
    if (!stats?.current) return `${base}.`;
    return `${base}. Currently ${this.show(stats.current)} ${this.unit()}, target ${this.show(stats.target)} ${this.unit()}.`;
  });

  // --- Stat tiles -----------------------------------------------------------
  // Every tone below is derived from the goal's direction, never from a raw sign:
  // losing 2 lbs is good on a cut and bad on a bulk.

  protected readonly currentText = computed(() => {
    const v = this.analytics.latestLbs();
    return v == null ? '—' : this.show(v);
  });

  protected readonly changeHint = computed(() => {
    const stats = this.stats();
    if (!stats || stats.current == null) return '';
    const delta = stats.totalChange;
    const sign = delta > 0 ? '+' : '';
    return `${sign}${this.show(delta)} ${this.unit()} since start`;
  });

  protected readonly remainingText = computed(() => {
    const stats = this.stats();
    if (!stats || stats.current == null) return '—';
    return stats.goalReached ? 'Reached' : this.show(Math.abs(stats.remaining));
  });

  protected readonly rateText = computed(() => {
    const rate = this.stats()?.ratePerWeek;
    if (rate == null) return '—';
    const sign = rate > 0 ? '+' : '';
    return `${sign}${this.show(rate)}`;
  });

  protected readonly rateTone = computed<StatTone>(() => {
    const stats = this.stats();
    if (!stats?.ratePerWeek) return 'neutral';
    return Math.sign(stats.ratePerWeek) === directionSign(stats.direction) ? 'good' : 'bad';
  });

  protected readonly rateHint = computed(() =>
    this.stats()?.ratePerWeek == null ? 'Need a few more weigh-ins' : 'per week'
  );

  protected readonly projectedText = computed(() => {
    const stats = this.stats();
    if (!stats) return '—';
    if (stats.goalReached) return 'Done';
    if (stats.projectedDate == null) return 'Not on track';
    return new Date(stats.projectedDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  });

  protected readonly planText = computed(() => {
    const stats = this.stats();
    if (!stats || stats.deltaVsPlan == null) return '—';
    return `${this.show(Math.abs(stats.deltaVsPlan))}`;
  });

  protected readonly planTone = computed<StatTone>(() => {
    const delta = this.stats()?.deltaVsPlan;
    if (delta == null) return 'neutral';
    return delta >= 0 ? 'good' : 'bad';
  });

  protected readonly planHint = computed(() => {
    const stats = this.stats();
    if (!stats) return '';
    if (stats.deltaVsPlan == null) {
      return stats.targetDatePassed ? 'Target date passed' : 'Outside your plan dates';
    }
    return stats.deltaVsPlan >= 0 ? 'ahead of plan' : 'behind plan';
  });

  /**
   * A pounds value rendered in the user's unit, rounded to 1 decimal, without the
   * unit suffix. The single rounding path for both the stat tiles and the chart's
   * axis/tooltip: the burndown feeds *computed* values — a regression slope × a
   * week, a delta-vs-plan, a remaining distance — which, unlike a stored weigh-in,
   * carry full float precision. Round at the display boundary so no readout ever
   * shows `182.4444444` and overflows its tile.
   */
  protected show(lbs: number): string {
    const value = displayLifted(lbs, this.unit()) ?? 0;
    return `${Math.round(value * 10) / 10}`;
  }
}
