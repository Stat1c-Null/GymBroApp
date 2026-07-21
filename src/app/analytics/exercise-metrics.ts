/**
 * Per-exercise strength/volume metrics and the series that plot them.
 *
 * Like the rest of `analytics/`, this file is free of Angular and Firestore so the
 * maths can be unit tested as plain functions. Callers adapt their Firestore rows
 * into the plain {@link ExerciseSession} shape (x already resolved to epoch ms) and
 * read {@link ChartSeries} back out.
 */
import { ChartPoint, ChartSeries } from './chart.types';
import { daysBetween, linearRegression } from './time-series';

/** A single logged set. Weight is in the app's canonical unit (pounds). */
export interface SetInput {
  reps: number | null;
  weight: number | null;
}

/**
 * One exercise performed on one day. `x` is epoch ms at local midnight of the
 * session's date — the caller resolves it from the entry's `date`, so this layer
 * never parses a date id.
 */
export interface ExerciseSession {
  workoutId: string;
  label: string;
  x: number;
  sets: SetInput[];
}

/** The measures a user can plot per session. */
export type ExerciseMetric = 'est1rm' | 'topSet' | 'volume' | 'reps' | 'sets';

/** How a metric is labelled and unit-formatted at the display boundary. */
export interface MetricMeta {
  key: ExerciseMetric;
  /** Short label for the metric toggle. */
  label: string;
  /** Longer label for axes, aria and tile headers. */
  full: string;
  /**
   * `'weight'` values are pounds to be shown in the user's unit; `'reps'`/`'sets'`
   * are unitless counts. Volume is weight×reps — conventionally shown in weight units.
   */
  unit: 'weight' | 'reps' | 'sets';
}

export const EXERCISE_METRICS: readonly MetricMeta[] = [
  { key: 'est1rm', label: 'Est. 1RM', full: 'Estimated 1-rep max', unit: 'weight' },
  { key: 'topSet', label: 'Top set', full: 'Heaviest set', unit: 'weight' },
  { key: 'volume', label: 'Volume', full: 'Total volume', unit: 'weight' },
  { key: 'reps', label: 'Reps', full: 'Total reps', unit: 'reps' },
  { key: 'sets', label: 'Sets', full: 'Sets', unit: 'sets' },
];

/** Sets carrying at least one logged value — a blank row is not a set. */
function loggedSets(sets: readonly SetInput[]): SetInput[] {
  return sets.filter((s) => s.reps != null || s.weight != null);
}

/**
 * Estimated one-rep max via the Epley formula, taken over the best set:
 * `weight × (1 + reps / 30)`. A single rep is by definition the 1RM, so `reps === 1`
 * returns the weight itself rather than Epley's ~3% overshoot. `null` when no set
 * has both a weight and a positive rep count.
 */
export function estimatedOneRm(sets: readonly SetInput[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.weight == null || s.reps == null || s.reps <= 0) continue;
    const est = s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30);
    if (best == null || est > best) best = est;
  }
  return best;
}

/** Heaviest weight in the session, or `null` if no set logged a weight. */
export function topSetWeight(sets: readonly SetInput[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.weight == null) continue;
    if (best == null || s.weight > best) best = s.weight;
  }
  return best;
}

/**
 * Total volume, `Σ reps × weight` over sets with both values. `null` when no set
 * qualifies (so the point is skipped rather than plotted as a misleading zero).
 * A logged weight of 0 (bodyweight) contributes 0, which is correct.
 */
export function totalVolume(sets: readonly SetInput[]): number | null {
  let sum = 0;
  let any = false;
  for (const s of sets) {
    if (s.reps == null || s.weight == null) continue;
    sum += s.reps * s.weight;
    any = true;
  }
  return any ? sum : null;
}

/** Total reps across sets that logged a rep count, or `null` if none did. */
export function totalReps(sets: readonly SetInput[]): number | null {
  let sum = 0;
  let any = false;
  for (const s of sets) {
    if (s.reps == null) continue;
    sum += s.reps;
    any = true;
  }
  return any ? sum : null;
}

/** Number of logged sets, or `null` if the session has none. */
export function setCount(sets: readonly SetInput[]): number | null {
  const n = loggedSets(sets).length;
  return n > 0 ? n : null;
}

/** The value of `metric` for one session's sets, or `null` when undefined. */
export function metricValue(metric: ExerciseMetric, sets: readonly SetInput[]): number | null {
  switch (metric) {
    case 'est1rm':
      return estimatedOneRm(sets);
    case 'topSet':
      return topSetWeight(sets);
    case 'volume':
      return totalVolume(sets);
    case 'reps':
      return totalReps(sets);
    case 'sets':
      return setCount(sets);
  }
}

/**
 * One {@link ChartSeries} per selected exercise, in `ids` order so a series keeps
 * its colour as the selection changes (colour follows the exercise, never its rank).
 *
 * Sessions of the same exercise on the same day are merged — their sets pooled —
 * so a metric like volume sums and 1RM takes the true best across both. Points
 * with a `null` metric value are dropped. Series with no points are still returned
 * (empty, carrying their `colorIndex`) so callers can filter them out while each kept
 * series keeps its fixed colour slot.
 */
export function buildExerciseSeries(
  sessions: readonly ExerciseSession[],
  ids: readonly string[],
  metric: ExerciseMetric
): ChartSeries[] {
  return ids.map((id, colorIndex): ChartSeries => {
    const mine = sessions.filter((s) => s.workoutId === id);
    const byDay = new Map<number, SetInput[]>();
    let label = id;
    for (const s of mine) {
      label = s.label || label;
      const bucket = byDay.get(s.x);
      if (bucket) bucket.push(...s.sets);
      else byDay.set(s.x, [...s.sets]);
    }
    const points: ChartPoint[] = [];
    for (const [x, sets] of byDay) {
      const y = metricValue(metric, sets);
      if (y != null) points.push({ x, y });
    }
    points.sort((a, b) => a.x - b.x);
    // Bars colour by colorIndex (the selection slot), not by role, so a series keeps
    // its hue even when the rendered list is filtered. 'role' is a placeholder here.
    return { id, label, points, role: 'actual', colorIndex };
  });
}

export interface FrequencyStats {
  /** Distinct training days across the selected exercises within the window. */
  sessions: number;
  /** `sessions / weeksInRange`, the training frequency. */
  perWeek: number;
  /** Distinct calendar weeks (Monday-anchored) trained. */
  weeksTrained: number;
  /** Weeks the window spans — the denominator for consistency. */
  weeksInRange: number;
}

/** Monday (local midnight) of the week containing `x`. Pure — no service import. */
function mondayMs(x: number): number {
  const d = new Date(x);
  const back = (d.getDay() + 6) % 7; // Sun(0)→6 … Sat(6)→5
  d.setDate(d.getDate() - back);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Training frequency and consistency over a window. `dayXs` are the distinct
 * training-day timestamps already filtered to the window; `start` is the window's
 * beginning (`null` = all-time, so it falls back to the first training day).
 */
export function computeFrequency(
  dayXs: readonly number[],
  start: number | null,
  now: number
): FrequencyStats {
  const days = [...new Set(dayXs)].sort((a, b) => a - b);
  const sessions = days.length;
  const weeksTrained = new Set(days.map(mondayMs)).size;
  const from = start ?? (days.length ? days[0] : now);
  const weeksInRange = Math.max(1, Math.ceil(daysBetween(from, now) / 7));
  const perWeek = sessions / weeksInRange;
  return { sessions, perWeek, weeksTrained, weeksInRange };
}

/**
 * Change per week in a series, from an OLS fit — the "progress rate". `null` when
 * the fit is undefined (fewer than two sessions, or all on one day). Positive means
 * the metric is trending up, which is improvement for every metric here.
 */
const WEEK_MS = 7 * 86_400_000;
export function progressPerWeek(points: readonly ChartPoint[]): number | null {
  const fit = linearRegression(points);
  return fit ? fit.slope * WEEK_MS : null;
}
