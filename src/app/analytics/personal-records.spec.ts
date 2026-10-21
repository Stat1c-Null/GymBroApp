import { describe, expect, it } from 'vitest';
import { TotalsEntry } from './totals';
import { hasAnyRecord, personalRecords, searchRecords } from './personal-records';

const DAY = 86_400_000;
const MON = Date.UTC(2026, 5, 15);
const TUE = MON + DAY;
const WED = TUE + DAY;

function lift(overrides: Partial<TotalsEntry> = {}): TotalsEntry {
  return {
    x: MON,
    workoutId: 'w1',
    label: 'Bench Press',
    muscleGroup: 'Chest',
    sets: [
      { reps: 10, weight: 100 },
      { reps: 8, weight: 110 },
    ],
    ...overrides,
  };
}

function run(overrides: Partial<TotalsEntry> = {}): TotalsEntry {
  return {
    x: MON,
    workoutId: 'c1',
    label: 'Treadmill',
    muscleGroup: 'Cardio',
    sets: [],
    cardio: { time: 1800, distance: 3 },
    ...overrides,
  };
}

describe('personalRecords', () => {
  it('returns [] for no entries', () => {
    expect(personalRecords([])).toEqual([]);
  });

  it('finds the heaviest set, most reps, est. 1RM and best day volume', () => {
    const [r] = personalRecords([
      lift(),
      lift({ x: TUE, sets: [{ reps: 3, weight: 130 }, { reps: 15, weight: 50 }] }),
    ]);
    expect(r.heaviest).toEqual({ value: 130, reps: 3, x: TUE });
    expect(r.mostReps).toEqual({ value: 15, x: TUE });
    // 130 × (1 + 3/30) = 143 beats 110 × (1 + 8/30) ≈ 139.3
    expect(r.est1rm?.value).toBeCloseTo(143);
    expect(r.est1rm?.x).toBe(TUE);
    // MON: 1000 + 880 = 1880; TUE: 390 + 750 = 1140
    expect(r.bestVolume).toEqual({ value: 1880, x: MON });
    expect(r.sessions).toBe(2);
    expect(r.lastX).toBe(TUE);
    expect(r.cardio).toBe(false);
  });

  it('keeps the first day a record was reached on a tie', () => {
    const [r] = personalRecords([
      lift({ x: TUE, sets: [{ reps: 5, weight: 120 }] }),
      lift({ x: MON, sets: [{ reps: 5, weight: 120 }] }),
    ]);
    expect(r.heaviest?.x).toBe(MON);
  });

  it('prefers more reps at the same top weight', () => {
    const [r] = personalRecords([
      lift({ sets: [{ reps: 2, weight: 120 }] }),
      lift({ x: TUE, sets: [{ reps: 4, weight: 120 }] }),
    ]);
    expect(r.heaviest).toEqual({ value: 120, reps: 4, x: TUE });
  });

  it('sums two entries of the same exercise on one day for volume', () => {
    const [r] = personalRecords([
      lift({ sets: [{ reps: 10, weight: 100 }] }),
      lift({ sets: [{ reps: 10, weight: 100 }] }),
    ]);
    expect(r.bestVolume?.value).toBe(2000);
    expect(r.sessions).toBe(1);
  });

  it('tracks cardio distance and time, not lifting records', () => {
    const [r] = personalRecords([
      run(),
      run({ x: TUE, cardio: { time: 2400, distance: 2.5 } }),
    ]);
    expect(r.cardio).toBe(true);
    expect(r.longestDistance).toEqual({ value: 3, x: MON });
    expect(r.longestTime).toEqual({ value: 2400, x: TUE });
    expect(r.heaviest).toBeNull();
  });

  it('orders exercises by most recently trained', () => {
    const recs = personalRecords([
      lift({ x: MON }),
      lift({ x: WED, workoutId: 'w2', label: 'Squat', muscleGroup: 'Legs' }),
      run({ x: TUE }),
    ]);
    expect(recs.map((r) => r.workoutId)).toEqual(['w2', 'c1', 'w1']);
  });

  it('ignores blank sets', () => {
    const [r] = personalRecords([lift({ sets: [{ reps: null, weight: null }] })]);
    expect(hasAnyRecord(r)).toBe(false);
  });
});

describe('searchRecords', () => {
  const recs = personalRecords([
    lift({ x: WED }),
    lift({ x: TUE, workoutId: 'w2', label: 'Back Squat', muscleGroup: 'Legs' }),
    lift({ x: MON, workoutId: 'w3', label: 'Chest Fly', muscleGroup: 'Chest' }),
    lift({ x: MON, workoutId: 'w4', label: 'Barbell Row', muscleGroup: 'Back' }),
  ]);

  it('returns everything for a blank query', () => {
    expect(searchRecords(recs, '   ')).toHaveLength(4);
  });

  it('matches muscle group without being told to', () => {
    expect(searchRecords(recs, 'chest').map((r) => r.workoutId)).toEqual(['w1', 'w3']);
  });

  it('matches exercise name without being told to', () => {
    expect(searchRecords(recs, 'BENCH').map((r) => r.workoutId)).toEqual(['w1']);
  });

  it('requires every word to match name or group', () => {
    expect(searchRecords(recs, 'legs squat').map((r) => r.workoutId)).toEqual(['w2']);
    expect(searchRecords(recs, 'legs bench')).toEqual([]);
  });

  it('ranks an exact group match above a partial name match', () => {
    // "back" is the Back group exactly (w4) and a word inside "Back Squat" (w2).
    expect(searchRecords(recs, 'back').map((r) => r.workoutId)).toEqual(['w4', 'w2']);
  });
});
