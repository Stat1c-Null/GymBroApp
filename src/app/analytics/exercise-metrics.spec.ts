import { describe, expect, it } from 'vitest';
import {
  ExerciseSession,
  SetInput,
  buildExerciseSeries,
  computeFrequency,
  estimatedOneRm,
  metricValue,
  progressPerWeek,
  setCount,
  topSetWeight,
  totalReps,
  totalVolume,
} from './exercise-metrics';

/** Local midnight on a calendar day — how the service resolves an entry's x. */
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const set = (reps: number | null, weight: number | null): SetInput => ({ reps, weight });

describe('estimatedOneRm', () => {
  it('applies Epley over the best set', () => {
    // 100 × (1 + 5/30) = 116.67; a heavier-but-higher-rep set can win.
    expect(estimatedOneRm([set(5, 100)])).toBeCloseTo(116.667, 2);
    expect(estimatedOneRm([set(1, 140), set(8, 120)])).toBeCloseTo(152, 2); // 120×(1+8/30)
  });

  it('returns the weight itself at one rep', () => {
    expect(estimatedOneRm([set(1, 100)])).toBe(100);
  });

  it('ignores sets missing a weight or a positive rep count, null when none qualify', () => {
    expect(estimatedOneRm([set(null, 100), set(0, 100), set(5, null)])).toBeNull();
    expect(estimatedOneRm([])).toBeNull();
  });
});

describe('topSetWeight', () => {
  it('takes the heaviest logged weight, ignoring reps', () => {
    expect(topSetWeight([set(12, 60), set(3, 95), set(8, 80)])).toBe(95);
  });
  it('counts a logged bodyweight 0 but null when no weight logged', () => {
    expect(topSetWeight([set(10, 0)])).toBe(0);
    expect(topSetWeight([set(10, null)])).toBeNull();
  });
});

describe('totalVolume', () => {
  it('sums reps × weight over qualifying sets', () => {
    expect(totalVolume([set(10, 100), set(8, 100)])).toBe(1800);
  });
  it('treats a 0 weight as 0 volume, not a skip', () => {
    expect(totalVolume([set(10, 0)])).toBe(0);
  });
  it('is null when no set has both reps and weight', () => {
    expect(totalVolume([set(null, 100), set(10, null)])).toBeNull();
    expect(totalVolume([])).toBeNull();
  });
});

describe('totalReps / setCount', () => {
  it('sums reps and counts logged sets', () => {
    expect(totalReps([set(10, 100), set(8, 100)])).toBe(18);
    expect(setCount([set(10, 100), set(8, 100), set(6, 90)])).toBe(3);
  });
  it('a blank row is not a set', () => {
    expect(setCount([set(null, null), set(10, 100)])).toBe(1);
    expect(setCount([set(null, null)])).toBeNull();
    expect(totalReps([set(null, null)])).toBeNull();
  });
});

describe('metricValue', () => {
  const sets = [set(5, 100), set(5, 100)];
  it('dispatches to the right measure', () => {
    expect(metricValue('topSet', sets)).toBe(100);
    expect(metricValue('volume', sets)).toBe(1000);
    expect(metricValue('reps', sets)).toBe(10);
    expect(metricValue('sets', sets)).toBe(2);
    expect(metricValue('est1rm', sets)).toBeCloseTo(116.667, 2);
  });
});

describe('buildExerciseSeries', () => {
  const sessions: ExerciseSession[] = [
    { workoutId: 'bench', label: 'Bench', x: day(2026, 1, 5), sets: [set(5, 100)] },
    { workoutId: 'bench', label: 'Bench', x: day(2026, 1, 12), sets: [set(5, 110)] },
    { workoutId: 'incline', label: 'Incline', x: day(2026, 1, 5), sets: [set(8, 70)] },
  ];

  it('emits one series per id, in the given order, coloured by entity not rank', () => {
    const series = buildExerciseSeries(sessions, ['incline', 'bench'], 'topSet');
    expect(series.map((s) => s.id)).toEqual(['incline', 'bench']);
    // colorIndex is the selection slot, so a filtered/reordered render keeps hues.
    expect(series.map((s) => s.colorIndex)).toEqual([0, 1]);
    expect(series[0].label).toBe('Incline');
    expect(series[1].points).toEqual([
      { x: day(2026, 1, 5), y: 100 },
      { x: day(2026, 1, 12), y: 110 },
    ]);
  });

  it('merges same-day sessions of one exercise before computing the metric', () => {
    const doubled: ExerciseSession[] = [
      { workoutId: 'bench', label: 'Bench', x: day(2026, 1, 5), sets: [set(5, 100)] },
      { workoutId: 'bench', label: 'Bench', x: day(2026, 1, 5), sets: [set(5, 100)] },
    ];
    const [series] = buildExerciseSeries(doubled, ['bench'], 'volume');
    expect(series.points).toEqual([{ x: day(2026, 1, 5), y: 1000 }]); // pooled: 4×(5×100)
  });

  it('drops points whose metric is null but keeps the (empty) series', () => {
    const noWeight: ExerciseSession[] = [
      { workoutId: 'bench', label: 'Bench', x: day(2026, 1, 5), sets: [set(5, null)] },
    ];
    const [series] = buildExerciseSeries(noWeight, ['bench'], 'topSet');
    expect(series.points).toEqual([]);
    expect(series.id).toBe('bench');
  });
});

describe('computeFrequency', () => {
  it('counts distinct training days, weeks trained, and per-week rate', () => {
    const start = day(2026, 1, 1);
    const now = day(2026, 1, 29); // 28 days → 4 weeks
    const days = [day(2026, 1, 5), day(2026, 1, 7), day(2026, 1, 20)]; // wk1 ×2, wk3 ×1
    const f = computeFrequency(days, start, now);
    expect(f.sessions).toBe(3);
    expect(f.weeksTrained).toBe(2);
    expect(f.weeksInRange).toBe(4);
    expect(f.perWeek).toBeCloseTo(0.75, 5);
  });

  it('de-duplicates repeated day timestamps', () => {
    const d = day(2026, 1, 5);
    expect(computeFrequency([d, d], day(2026, 1, 1), day(2026, 1, 8)).sessions).toBe(1);
  });

  it('falls back to the first training day when the range is all-time', () => {
    const f = computeFrequency([day(2026, 1, 1), day(2026, 1, 15)], null, day(2026, 1, 15));
    expect(f.weeksInRange).toBe(2);
    expect(f.sessions).toBe(2);
  });
});

describe('progressPerWeek', () => {
  it('is the OLS slope scaled to a week', () => {
    // +10 across 14 days → +5 per week.
    const points = [
      { x: day(2026, 1, 1), y: 100 },
      { x: day(2026, 1, 15), y: 110 },
    ];
    expect(progressPerWeek(points)).toBeCloseTo(5, 5);
  });

  it('is null with fewer than two sessions', () => {
    expect(progressPerWeek([{ x: day(2026, 1, 1), y: 100 }])).toBeNull();
    expect(progressPerWeek([])).toBeNull();
  });
});
