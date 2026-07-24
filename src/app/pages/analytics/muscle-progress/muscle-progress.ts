import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartSeries, TimeRangeKey } from '../../../analytics/chart.types';
import {
  EXERCISE_METRICS,
  ExerciseMetric,
  buildExerciseSeries,
  computeFrequency,
  progressPerWeek,
  totalVolume,
} from '../../../analytics/exercise-metrics';
import { rangeStart } from '../../../analytics/time-series';
import { AnalyticsCardComponent } from '../../../components/charts/analytics-card';
import { BarChartComponent } from '../../../components/charts/bar-chart';
import { StatTileComponent, StatTone } from '../../../components/charts/stat-tile';
import { ExerciseAnalyticsService } from '../../../services/exercise-analytics.service';
import { SettingsService } from '../../../services/settings.service';
import { displayLifted } from '../../../services/weight.service';
import { WeekService } from '../../../services/week.service';
import { UNASSIGNED_GROUP, WorkoutService, isOrphanGroup } from '../../../services/workout.service';

/** Never compare more colours than the categorical palette can keep distinct. */
const MAX_SELECTED = 8;

/**
 * Exercise progress by muscle group: pick a group, choose the exercises to compare,
 * and read each one as its own bar series across a strength/volume/effort metric —
 * plus tiles for how hard and how consistently the group is being trained.
 *
 * Mirrors the weight-burndown card's shape (a range-scoped `analytics-card` with a
 * chart and a stat grid) but plots genuinely different entities, so it uses the
 * categorical bar chart rather than the single-accent line chart. All lifted numbers
 * are pounds; `show()` converts to the user's unit at the display boundary.
 */
@Component({
  selector: 'app-muscle-progress',
  standalone: true,
  imports: [AnalyticsCardComponent, BarChartComponent, StatTileComponent, RouterLink],
  templateUrl: './muscle-progress.html',
  styleUrl: './muscle-progress.css',
})
export class MuscleProgressComponent {
  private readonly svc = inject(ExerciseAnalyticsService);
  private readonly workouts = inject(WorkoutService);
  private readonly settings = inject(SettingsService);
  private readonly week = inject(WeekService);

  readonly range = input.required<TimeRangeKey>();

  protected readonly metrics = EXERCISE_METRICS;
  protected readonly unit = this.settings.unit;
  protected readonly maxSelected = MAX_SELECTED;

  protected readonly selectedGroup = signal('');
  protected readonly selectedIds = signal<string[]>([]);
  protected readonly metric = signal<ExerciseMetric>('est1rm');

  protected readonly metricMeta = computed(
    () => this.metrics.find((m) => m.key === this.metric()) ?? this.metrics[0]
  );

  /** The groups to offer: the user's list, plus "Unassigned" when orphans exist. */
  protected readonly groups = computed<string[]>(() => {
    const list = [...this.svc.groups()];
    const known = new Set(list);
    const hasOrphan = (this.workouts.workouts() ?? []).some((w) => isOrphanGroup(w.muscleGroup, known));
    if (hasOrphan) list.push(UNASSIGNED_GROUP);
    return list;
  });

  protected readonly exercises = computed(() => this.svc.exercisesInGroup(this.selectedGroup()));

  protected readonly state = computed<'loading' | 'empty' | 'ready'>(() => {
    if (!this.svc.loaded() || this.workouts.workouts() === undefined) return 'loading';
    return (this.workouts.workouts() ?? []).length === 0 ? 'empty' : 'ready';
  });

  // --- Selection defaulting -------------------------------------------------
  // Keep the group valid and the exercise selection sensible as data loads and the
  // group changes, without clobbering a choice the user has actively made.

  private readonly syncGroup = effect(() => {
    const groups = this.groups();
    const current = untracked(this.selectedGroup);
    if (current && groups.includes(current)) return;
    const withExercises = groups.find((g) => this.svc.exercisesInGroup(g).length > 0);
    this.selectedGroup.set(withExercises ?? groups[0] ?? '');
  });

  private readonly syncSelection = effect(() => {
    const ids = this.exercises()
      .map((w) => w.id)
      .filter((id): id is string => !!id);
    const known = new Set(ids);
    const current = untracked(this.selectedIds).filter((id) => known.has(id));
    if (current.length === 0 && ids.length > 0) {
      this.selectedIds.set(ids.slice(0, Math.min(3, ids.length)));
    } else if (current.length !== untracked(this.selectedIds).length) {
      this.selectedIds.set(current);
    }
  });

  // --- Derived series & windowing ------------------------------------------

  private readonly now = computed(() => this.week.today().getTime());
  private readonly windowStart = computed(() => rangeStart(this.range(), this.now()));

  private readonly windowed = computed(() => {
    const from = this.windowStart();
    return this.svc.sessionsFor(this.selectedIds()).filter((s) => from == null || s.x >= from);
  });

  protected readonly series = computed<ChartSeries[]>(() =>
    buildExerciseSeries(this.windowed(), this.selectedIds(), this.metric())
  );

  /**
   * Only the series with data in range — empties are dropped from the chart, but each
   * kept series keeps its `colorIndex`, so a colour never migrates to another exercise
   * when the range or selection changes.
   */
  protected readonly chartSeries = computed<ChartSeries[]>(() =>
    this.series().filter((s) => s.points.length > 0)
  );

  protected readonly hasData = computed(() => this.chartSeries().length > 0);

  // --- Formatting -----------------------------------------------------------

  protected readonly formatX = (ms: number): string =>
    new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  protected readonly formatY = computed<(v: number) => string>(() => {
    const weight = this.metricMeta().unit === 'weight';
    return (v: number) => (weight ? this.show(v) : `${Math.round(v)}`);
  });

  protected readonly metricUnitLabel = computed(() =>
    this.metricMeta().unit === 'weight' ? this.unit() : ''
  );

  protected readonly ariaLabel = computed(() => {
    const meta = this.metricMeta();
    const names = this.series()
      .filter((s) => s.points.length > 0)
      .map((s) => s.label)
      .join(', ');
    const suffix = meta.unit === 'weight' ? ` in ${this.unit()}` : '';
    return names
      ? `${meta.full}${suffix} per session, comparing ${names}.`
      : `${meta.full}${suffix} per session.`;
  });

  // --- Stat tiles -----------------------------------------------------------

  private readonly trainingDays = computed(() => [...new Set(this.windowed().map((s) => s.x))]);

  private readonly frequency = computed(() =>
    computeFrequency(this.trainingDays(), this.windowStart(), this.now())
  );

  protected readonly sessionsText = computed(() => `${this.frequency().sessions}`);

  protected readonly perWeekText = computed(() => {
    const f = this.frequency();
    return f.sessions === 0 ? '—' : this.round1(f.perWeek);
  });

  protected readonly consistencyText = computed(() => {
    const f = this.frequency();
    return `${f.weeksTrained} / ${f.weeksInRange}`;
  });

  /** Best value of the active metric across the selection, in range. */
  protected readonly bestText = computed(() => {
    const ys = this.series().flatMap((s) => s.points.map((p) => p.y));
    return ys.length ? this.formatMetric(Math.max(...ys)) : '—';
  });

  /** Average total volume per training day — the universal "work done" number. */
  protected readonly avgVolumeText = computed(() => {
    const days = this.trainingDays().length;
    if (days === 0) return '—';
    let sum = 0;
    let any = false;
    for (const s of this.windowed()) {
      const v = totalVolume(s.sets);
      if (v != null) {
        sum += v;
        any = true;
      }
    }
    return any ? this.show(sum / days) : '—';
  });

  /** Progress rate of the primary (first-selected) exercise for the active metric. */
  private readonly progress = computed(() => {
    const primary = this.series()[0];
    return primary ? progressPerWeek(primary.points) : null;
  });

  protected readonly progressText = computed(() => {
    const rate = this.progress();
    if (rate == null) return '—';
    const sign = rate > 0 ? '+' : rate < 0 ? '−' : '';
    return `${sign}${this.formatMetric(Math.abs(rate))}`;
  });

  protected readonly progressTone = computed<StatTone>(() => {
    const rate = this.progress();
    if (rate == null || rate === 0) return 'neutral';
    return rate > 0 ? 'good' : 'bad';
  });

  protected readonly progressHint = computed(() => {
    if (this.progress() == null) return 'Need 2+ sessions';
    const primary = this.series()[0];
    return primary ? `${primary.label} · per week` : 'per week';
  });

  // --- Interaction ----------------------------------------------------------

  protected selectGroup(group: string): void {
    this.selectedGroup.set(group);
  }

  protected selectMetric(metric: ExerciseMetric): void {
    this.metric.set(metric);
  }

  protected isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  protected toggleExercise(id: string): void {
    const current = this.selectedIds();
    if (current.includes(id)) {
      this.selectedIds.set(current.filter((x) => x !== id));
    } else if (current.length < MAX_SELECTED) {
      this.selectedIds.set([...current, id]);
    }
  }

  /** Whether an unselected exercise is blocked by the compare cap. */
  protected atCapacity(id: string): boolean {
    return !this.isSelected(id) && this.selectedIds().length >= MAX_SELECTED;
  }

  // --- Value formatting -----------------------------------------------------

  /** A metric value formatted for display: weight metrics convert to the user's unit. */
  private formatMetric(value: number): string {
    return this.metricMeta().unit === 'weight' ? this.show(value) : `${Math.round(value)}`;
  }

  /** A pounds value in the user's unit, rounded to 1 decimal, no suffix. */
  private show(lbs: number): string {
    return this.round1(displayLifted(lbs, this.unit()) ?? 0);
  }

  private round1(value: number): string {
    return `${Math.round(value * 10) / 10}`;
  }
}
