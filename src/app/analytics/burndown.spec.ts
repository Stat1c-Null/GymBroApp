import { describe, expect, it } from 'vitest';
import type { WeightGoal } from '../services/weight.service';
import {
  computeBurndown,
  directionSign,
  goalDirection,
  idealAt,
  idealLine,
  projectionLine,
} from './burndown';
import { ChartPoint } from './chart.types';
import { movingAverage } from './time-series';

const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();

/** A 30 lb cut across January: 200 → 170. */
const cut: WeightGoal = {
  startLbs: 200,
  startKg: 90.7,
  startDate: '2026-01-01',
  targetLbs: 170,
  targetKg: 77.1,
  targetDate: '2026-01-31',
};

/** The exact mirror of `cut`: a 30 lb bulk, 200 → 230. */
const bulk: WeightGoal = {
  startLbs: 200,
  startKg: 90.7,
  startDate: '2026-01-01',
  targetLbs: 230,
  targetKg: 104.3,
  targetDate: '2026-01-31',
};

/** Reflects a weight about the 200 lb start, turning any cut fixture into its bulk twin. */
const mirror = (points: ChartPoint[]): ChartPoint[] =>
  points.map((p) => ({ x: p.x, y: 200 + (200 - p.y) }));

const series = (...ys: number[]): ChartPoint[] =>
  ys.map((y, i) => ({ x: day(2026, 1, 1 + i), y }));

describe('goalDirection / directionSign', () => {
  it('reads a lower target as a cut and a higher one as a bulk', () => {
    expect(goalDirection(cut)).toBe('cut');
    expect(goalDirection(bulk)).toBe('bulk');
    expect(directionSign('cut')).toBe(-1);
    expect(directionSign('bulk')).toBe(1);
  });

  it('treats an equal target as a bulk rather than crashing', () => {
    // The form rejects a zero-length goal; this just pins the fallback.
    expect(goalDirection({ ...cut, targetLbs: 200 })).toBe('bulk');
  });
});

describe('idealLine / idealAt', () => {
  it('runs from start to target', () => {
    expect(idealLine(cut)).toEqual([
      { x: day(2026, 1, 1), y: 200 },
      { x: day(2026, 1, 31), y: 170 },
    ]);
  });

  it('interpolates linearly across the span', () => {
    expect(idealAt(cut, day(2026, 1, 16))).toBeCloseTo(185, 0);
  });

  it('never extrapolates outside the plan dates', () => {
    expect(idealAt(cut, day(2025, 12, 25))).toBeNull();
    expect(idealAt(cut, day(2026, 2, 10))).toBeNull();
  });

  it('yields nothing when the goal dates are malformed or inverted', () => {
    expect(idealLine({ ...cut, targetDate: 'nonsense' })).toEqual([]);
    expect(idealLine({ ...cut, targetDate: '2025-12-01' })).toEqual([]);
  });
});

describe('projectionLine', () => {
  it('projects forward to the target crossing', () => {
    const points = series(200, 199, 198); // -1 lb/day
    const line = projectionLine(points, cut);
    expect(line).not.toBeNull();
    expect(line?.[1].y).toBe(170);
    expect(line?.[1].x).toBeGreaterThan(points[2].x);
  });

  it('returns null when the trend heads away from the target', () => {
    // Gaining weight on a cut never reaches a lower target.
    expect(projectionLine(series(200, 201, 202), cut)).toBeNull();
  });

  it('returns null for a flat trend', () => {
    expect(projectionLine(series(200, 200, 200), cut)).toBeNull();
  });

  it('returns null without enough points to fit', () => {
    expect(projectionLine(series(200), cut)).toBeNull();
    expect(projectionLine([], cut)).toBeNull();
  });
});

describe('computeBurndown — cut and bulk symmetry', () => {
  // The whole point of the sign normalisation: the mirrored bulk fixture must
  // produce identical readouts to the cut. If a comparison assumes "down is good",
  // one of these pairs breaks.
  const cutPoints = series(200, 197, 194);
  const bulkPoints = mirror(cutPoints);
  const now = day(2026, 1, 3);

  const cutStats = computeBurndown(cutPoints, movingAverage(cutPoints, 7), cut, now);
  const bulkStats = computeBurndown(bulkPoints, movingAverage(bulkPoints, 7), bulk, now);

  it('reports the same remaining distance either way', () => {
    expect(cutStats.remaining).toBeCloseTo(24);
    expect(bulkStats.remaining).toBeCloseTo(24);
  });

  it('reports the same progress either way', () => {
    expect(cutStats.progress).toBeCloseTo(bulkStats.progress);
    expect(cutStats.progress).toBeCloseTo(6 / 30);
  });

  it('signs the rate by direction — negative on a cut, positive on a bulk', () => {
    expect(cutStats.ratePerWeek).toBeLessThan(0);
    expect(bulkStats.ratePerWeek).toBeGreaterThan(0);
    expect(cutStats.ratePerWeek).toBeCloseTo(-(bulkStats.ratePerWeek as number));
  });

  it('agrees on being ahead of plan in both directions', () => {
    // Both are moving ~3 lb/day against a 1 lb/day plan.
    expect(cutStats.deltaVsPlan).toBeGreaterThan(0);
    expect(bulkStats.deltaVsPlan).toBeGreaterThan(0);
    expect(cutStats.deltaVsPlan).toBeCloseTo(bulkStats.deltaVsPlan as number);
    expect(cutStats.onTrack).toBe(true);
    expect(bulkStats.onTrack).toBe(true);
  });

  it('agrees on being behind plan in both directions', () => {
    const slowCut = series(200, 199.8, 199.6);
    const slowBulk = mirror(slowCut);
    const a = computeBurndown(slowCut, movingAverage(slowCut, 7), cut, now);
    const b = computeBurndown(slowBulk, movingAverage(slowBulk, 7), bulk, now);

    expect(a.deltaVsPlan).toBeLessThan(0);
    expect(b.deltaVsPlan).toBeLessThan(0);
    expect(a.onTrack).toBe(false);
    expect(b.onTrack).toBe(false);
  });

  it('calls the wrong-way direction not-on-track in both directions', () => {
    // Gaining on a cut, and losing on a bulk, are the same mistake.
    const wrongCut = series(200, 202, 204);
    const wrongBulk = mirror(wrongCut);
    const a = computeBurndown(wrongCut, movingAverage(wrongCut, 7), cut, now);
    const b = computeBurndown(wrongBulk, movingAverage(wrongBulk, 7), bulk, now);

    expect(a.onTrack).toBe(false);
    expect(b.onTrack).toBe(false);
    expect(a.projectedDate).toBeNull();
    expect(b.projectedDate).toBeNull();
  });
});

describe('computeBurndown — edge cases', () => {
  it('handles no weigh-ins without producing NaN', () => {
    const stats = computeBurndown([], [], cut, day(2026, 1, 10));
    expect(stats.current).toBeNull();
    expect(stats.ratePerWeek).toBeNull();
    expect(stats.projectedDate).toBeNull();
    expect(stats.deltaVsPlan).toBeNull();
    expect(Number.isFinite(stats.progress)).toBe(true);
    expect(stats.progress).toBe(0);
  });

  it('handles a single weigh-in — no rate, no projection', () => {
    const points = series(198);
    const stats = computeBurndown(points, points, cut, day(2026, 1, 1));
    expect(stats.current).toBe(198);
    expect(stats.ratePerWeek).toBeNull();
    expect(stats.projectedDate).toBeNull();
    expect(stats.remaining).toBeCloseTo(28);
  });

  it('handles every weigh-in landing on one day (zero x-variance)', () => {
    const sameDay: ChartPoint[] = [
      { x: day(2026, 1, 5), y: 198 },
      { x: day(2026, 1, 5), y: 197 },
    ];
    const stats = computeBurndown(sameDay, sameDay, cut, day(2026, 1, 5));
    expect(stats.ratePerWeek).toBeNull();
    expect(stats.projectedDate).toBeNull();
  });

  it('reports a reached goal and stops projecting', () => {
    const points = series(200, 185, 169);
    const stats = computeBurndown(points, movingAverage(points, 7), cut, day(2026, 1, 3));
    expect(stats.goalReached).toBe(true);
    expect(stats.remaining).toBeLessThanOrEqual(0);
    expect(stats.progress).toBe(1);
    expect(stats.projectedDate).toBeNull();
    expect(stats.onTrack).toBe(true);
  });

  it('reports a reached goal on a bulk too', () => {
    const points = series(200, 215, 231);
    const stats = computeBurndown(points, movingAverage(points, 7), bulk, day(2026, 1, 3));
    expect(stats.goalReached).toBe(true);
    expect(stats.progress).toBe(1);
  });

  it('flags a target date in the past but still reports remaining', () => {
    const points = series(200, 195);
    const stats = computeBurndown(points, points, cut, day(2026, 3, 1));
    expect(stats.targetDatePassed).toBe(true);
    expect(stats.remaining).toBeCloseTo(25);
    // Outside the plan span, so there's no pace to compare against.
    expect(stats.idealToday).toBeNull();
    expect(stats.deltaVsPlan).toBeNull();
  });

  it('clamps progress to 0..1 when the user moves the wrong way', () => {
    const points = series(200, 210);
    const stats = computeBurndown(points, points, cut, day(2026, 1, 2));
    expect(stats.progress).toBeGreaterThanOrEqual(0);
    expect(stats.progress).toBeLessThanOrEqual(1);
  });

  it('never projects a crossing that is already behind us', () => {
    const points = series(200, 199);
    const stats = computeBurndown(points, points, cut, day(2026, 6, 1));
    expect(stats.projectedDate === null || stats.projectedDate >= day(2026, 6, 1)).toBe(
      true
    );
  });

  it('survives a degenerate goal where start equals target', () => {
    const flat: WeightGoal = { ...cut, targetLbs: 200, targetKg: 90.7 };
    const points = series(200);
    const stats = computeBurndown(points, points, flat, day(2026, 1, 1));
    expect(Number.isFinite(stats.progress)).toBe(true);
    expect(Number.isNaN(stats.remaining)).toBe(false);
  });
});
