import { ChartPoint, Extent, TimeRangeKey } from './chart.types';

const DAY_MS = 86_400_000;

/**
 * Local midnight of the day containing `ms`.
 *
 * Uses Date mutation rather than `Math.floor(ms / DAY_MS)`: epoch division buckets
 * by *UTC* day, so any sample after local evening lands on tomorrow west of
 * Greenwich, and DST days (23 or 25 hours long) drift by an hour either way.
 */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole local days from `a` to `b`, DST-safe (rounds away the ±1h shift). */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfLocalDay(b) - startOfLocalDay(a)) / DAY_MS);
}

/** `n` local days after `ms`, preserving local midnight across DST. */
export function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Ascending by `x`. Returns a new array — `WeightService` streams newest-first. */
export function toAscending(points: readonly ChartPoint[]): ChartPoint[] {
  return [...points].sort((a, b) => a.x - b.x);
}

/**
 * Collapse samples to one point per local day, averaging same-day duplicates and
 * stamping each at local midnight. Weigh-ins are irregular and a keen user may log
 * twice in a day; every downstream statistic assumes one point per day.
 *
 * Input need not be sorted; output is ascending.
 */
export function bucketByDay(points: readonly ChartPoint[]): ChartPoint[] {
  const sums = new Map<number, { total: number; count: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const day = startOfLocalDay(p.x);
    const bucket = sums.get(day);
    if (bucket) {
      bucket.total += p.y;
      bucket.count += 1;
    } else {
      sums.set(day, { total: p.y, count: 1 });
    }
  }
  return [...sums.entries()]
    .map(([x, { total, count }]) => ({ x, y: total / count }))
    .sort((a, b) => a.x - b.x);
}

/**
 * Trailing moving average over a **calendar-day** window: each point averages every
 * sample in `[day - (windowDays - 1), day]`.
 *
 * Deliberately not a "last N points" window. Weigh-ins are irregularly spaced, so an
 * index window silently averages across a three-month gap and still calls itself a
 * 7-day average. Pass day-bucketed points.
 */
export function movingAverage(
  points: readonly ChartPoint[],
  windowDays: number
): ChartPoint[] {
  if (windowDays < 1) return [...points];
  const asc = toAscending(points);
  return asc.map((p) => {
    const from = addDays(p.x, -(windowDays - 1));
    let total = 0;
    let count = 0;
    for (const q of asc) {
      if (q.x > p.x) break;
      if (q.x >= from) {
        total += q.y;
        count += 1;
      }
    }
    return { x: p.x, y: total / count };
  });
}

export interface Regression {
  /** Change in `y` per millisecond of `x`. */
  slope: number;
  intercept: number;
}

/**
 * Ordinary least-squares fit, or `null` when the fit is undefined — fewer than two
 * points, or every point on the same day (zero x-variance).
 *
 * Returning `null` rather than a NaN-bearing result is load-bearing: NaN propagates
 * silently through every downstream stat and, in a chart, produces an invisible
 * failure rather than an error. Callers must handle `null` as "not enough data".
 */
export function linearRegression(points: readonly ChartPoint[]): Regression | null {
  const usable = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (usable.length < 2) return null;

  const n = usable.length;
  const meanX = usable.reduce((s, p) => s + p.x, 0) / n;
  const meanY = usable.reduce((s, p) => s + p.y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const p of usable) {
    const dx = p.x - meanX;
    numerator += dx * (p.y - meanY);
    denominator += dx * dx;
  }
  if (denominator === 0) return null; // all samples share one x

  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

/** The fitted `y` at `x`. */
export function valueAt(reg: Regression, x: number): number {
  return reg.slope * x + reg.intercept;
}

/**
 * The `x` where the fit reaches `y`, or `null` when it never will — a flat line
 * (slope 0) or one heading away from the target. "Never at this rate" is an
 * expected answer here, not an error.
 */
export function solveForX(reg: Regression, y: number): number | null {
  if (reg.slope === 0 || !Number.isFinite(reg.slope)) return null;
  const x = (y - reg.intercept) / reg.slope;
  return Number.isFinite(x) ? x : null;
}

/** Epoch ms at which `range` begins, or `null` for "all time". */
export function rangeStart(range: TimeRangeKey, now: number): number | null {
  const d = new Date(now);
  switch (range) {
    case '30d':
      d.setDate(d.getDate() - 30);
      return d.getTime();
    case '90d':
      d.setDate(d.getDate() - 90);
      return d.getTime();
    case '6m':
      d.setMonth(d.getMonth() - 6);
      return d.getTime();
    case '1y':
      d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    case 'all':
      return null;
  }
}

/** Points at or after `from`. `null` keeps everything. */
export function filterFrom(
  points: readonly ChartPoint[],
  from: number | null
): ChartPoint[] {
  return from == null ? [...points] : points.filter((p) => p.x >= from);
}

/** Min/max of `values`, or `null` when empty. */
export function extentOf(values: readonly number[]): Extent | null {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) return null;
  return { min: Math.min(...usable), max: Math.max(...usable) };
}

/**
 * Widen an extent by `fraction` of its span, optionally forcing `include` values
 * inside it first (the burndown uses this to guarantee the goal line is on-screen).
 * A zero-span extent is padded by an absolute amount so the scale never collapses.
 */
export function padExtent(
  extent: Extent,
  fraction: number,
  include: readonly number[] = []
): Extent {
  let { min, max } = extent;
  for (const v of include) {
    if (!Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const span = max - min;
  const pad = span === 0 ? Math.max(Math.abs(max) * 0.05, 1) : span * fraction;
  return { min: min - pad, max: max + pad };
}
