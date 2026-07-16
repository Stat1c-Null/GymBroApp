import { describe, expect, it } from 'vitest';
import { ChartPoint } from './chart.types';
import {
  addDays,
  bucketByDay,
  daysBetween,
  extentOf,
  filterFrom,
  linearRegression,
  movingAverage,
  padExtent,
  rangeStart,
  solveForX,
  startOfLocalDay,
  toAscending,
  valueAt,
} from './time-series';

/** Local midnight on the given calendar day — mirrors how the app stores day ids. */
const day = (y: number, m: number, d: number, h = 0): number =>
  new Date(y, m - 1, d, h).getTime();

describe('startOfLocalDay', () => {
  it('collapses any time on a day to that day', () => {
    expect(startOfLocalDay(day(2026, 3, 14, 23))).toBe(day(2026, 3, 14));
    expect(startOfLocalDay(day(2026, 3, 14, 0))).toBe(day(2026, 3, 14));
  });

  it('buckets a late-evening sample to the local day, not the UTC one', () => {
    // The bug this guards: `Math.floor(ms / 86400000)` buckets by UTC, so 11pm
    // local lands on tomorrow anywhere west of Greenwich.
    const late = day(2026, 3, 14, 23);
    expect(new Date(startOfLocalDay(late)).getDate()).toBe(14);
  });
});

describe('addDays / daysBetween', () => {
  it('round-trips', () => {
    const start = day(2026, 1, 10);
    expect(daysBetween(start, addDays(start, 7))).toBe(7);
  });

  it('stays whole across a DST boundary', () => {
    // US DST starts 2026-03-08; that local day is 23 hours long, so naive epoch
    // division would report 6.96 days rather than 7.
    const before = day(2026, 3, 5);
    expect(daysBetween(before, addDays(before, 7))).toBe(7);
  });

  it('preserves local midnight across a DST boundary', () => {
    const before = day(2026, 3, 5);
    expect(new Date(addDays(before, 7)).getHours()).toBe(0);
  });
});

describe('toAscending', () => {
  it('sorts newest-last without mutating the input', () => {
    // WeightService streams newest-first, so every consumer reverses.
    const input: ChartPoint[] = [
      { x: 300, y: 3 },
      { x: 100, y: 1 },
      { x: 200, y: 2 },
    ];
    expect(toAscending(input).map((p) => p.x)).toEqual([100, 200, 300]);
    expect(input[0].x).toBe(300);
  });
});

describe('bucketByDay', () => {
  it('averages several weigh-ins on the same day into one point', () => {
    const points = [
      { x: day(2026, 5, 1, 7), y: 200 },
      { x: day(2026, 5, 1, 20), y: 204 },
      { x: day(2026, 5, 2, 8), y: 199 },
    ];
    const result = bucketByDay(points);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ x: day(2026, 5, 1), y: 202 });
    expect(result[1]).toEqual({ x: day(2026, 5, 2), y: 199 });
  });

  it('returns points ascending regardless of input order', () => {
    const result = bucketByDay([
      { x: day(2026, 5, 3), y: 1 },
      { x: day(2026, 5, 1), y: 2 },
    ]);
    expect(result.map((p) => p.x)).toEqual([day(2026, 5, 1), day(2026, 5, 3)]);
  });

  it('drops non-finite samples rather than poisoning the average', () => {
    const result = bucketByDay([
      { x: day(2026, 5, 1), y: 200 },
      { x: day(2026, 5, 1), y: Number.NaN },
    ]);
    expect(result).toEqual([{ x: day(2026, 5, 1), y: 200 }]);
  });

  it('returns nothing for no samples', () => {
    expect(bucketByDay([])).toEqual([]);
  });
});

describe('movingAverage', () => {
  it('averages over the trailing calendar window', () => {
    const points = [
      { x: day(2026, 6, 1), y: 10 },
      { x: day(2026, 6, 2), y: 20 },
      { x: day(2026, 6, 3), y: 30 },
    ];
    const result = movingAverage(points, 3);
    expect(result[0].y).toBe(10); // only itself in window
    expect(result[1].y).toBe(15); // (10 + 20) / 2
    expect(result[2].y).toBe(20); // (10 + 20 + 30) / 3
  });

  it('does not average across a gap wider than the window', () => {
    // The bug this guards: an index-based "last N points" window would average
    // January with June and still call itself a 7-day average.
    const points = [
      { x: day(2026, 1, 1), y: 250 },
      { x: day(2026, 6, 1), y: 180 },
    ];
    const result = movingAverage(points, 7);
    expect(result[1].y).toBe(180);
  });

  it('leaves a single point untouched', () => {
    expect(movingAverage([{ x: day(2026, 6, 1), y: 42 }], 7)).toEqual([
      { x: day(2026, 6, 1), y: 42 },
    ]);
  });
});

describe('linearRegression', () => {
  it('fits a clean line', () => {
    const reg = linearRegression([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);
    expect(reg).not.toBeNull();
    expect(reg?.slope).toBeCloseTo(1);
    expect(reg?.intercept).toBeCloseTo(0);
  });

  it('fits a descending line', () => {
    const reg = linearRegression([
      { x: 0, y: 200 },
      { x: 10, y: 190 },
    ]);
    expect(reg?.slope).toBeCloseTo(-1);
  });

  // These are the guards that keep NaN out of the chart: a NaN slope propagates
  // into every stat and into the canvas, where it fails silently rather than loudly.
  it('returns null for a single point', () => {
    expect(linearRegression([{ x: 1, y: 1 }])).toBeNull();
  });

  it('returns null for no points', () => {
    expect(linearRegression([])).toBeNull();
  });

  it('returns null when every sample shares one x (zero variance)', () => {
    const reg = linearRegression([
      { x: 500, y: 1 },
      { x: 500, y: 9 },
    ]);
    expect(reg).toBeNull();
  });

  it('never yields a non-finite slope', () => {
    const reg = linearRegression([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ]);
    expect(Number.isFinite(reg?.slope as number)).toBe(true);
    expect(Number.isFinite(reg?.intercept as number)).toBe(true);
  });
});

describe('valueAt / solveForX', () => {
  it('evaluates the fit', () => {
    expect(valueAt({ slope: 2, intercept: 1 }, 3)).toBe(7);
  });

  it('solves for the crossing', () => {
    expect(solveForX({ slope: -1, intercept: 200 }, 190)).toBe(10);
  });

  it('returns null for a flat line — it never reaches the target', () => {
    expect(solveForX({ slope: 0, intercept: 200 }, 190)).toBeNull();
  });
});

describe('rangeStart', () => {
  const now = day(2026, 6, 15);

  it('returns null for all-time', () => {
    expect(rangeStart('all', now)).toBeNull();
  });

  it('steps back by calendar units', () => {
    expect(rangeStart('30d', now)).toBe(day(2026, 5, 16));
    expect(rangeStart('6m', now)).toBe(day(2025, 12, 15));
    expect(rangeStart('1y', now)).toBe(day(2025, 6, 15));
  });
});

describe('filterFrom', () => {
  const points = [
    { x: day(2026, 1, 1), y: 1 },
    { x: day(2026, 6, 1), y: 2 },
  ];

  it('keeps everything when from is null', () => {
    expect(filterFrom(points, null)).toHaveLength(2);
  });

  it('keeps points at or after from', () => {
    expect(filterFrom(points, day(2026, 6, 1))).toHaveLength(1);
  });
});

describe('extentOf / padExtent', () => {
  it('returns null for no values', () => {
    expect(extentOf([])).toBeNull();
  });

  it('finds min and max, ignoring non-finite values', () => {
    expect(extentOf([5, 1, Number.NaN, 9])).toEqual({ min: 1, max: 9 });
  });

  it('pads by a fraction of the span', () => {
    expect(padExtent({ min: 100, max: 200 }, 0.1)).toEqual({ min: 90, max: 210 });
  });

  it('widens to include forced values, so the goal line is always on-screen', () => {
    const result = padExtent({ min: 190, max: 200 }, 0.1, [175]);
    expect(result.min).toBeLessThan(175);
    expect(result.max).toBeGreaterThan(200);
  });

  it('does not collapse a zero-span extent', () => {
    const result = padExtent({ min: 200, max: 200 }, 0.1);
    expect(result.max).toBeGreaterThan(result.min);
  });
});
