import { describe, expect, it } from 'vitest';
import { TotalsEntry, computeTotals } from './totals';

const DAY = 86_400_000;
const MON = Date.UTC(2026, 5, 15);
const TUE = MON + DAY;

function lift(overrides: Partial<TotalsEntry> = {}): TotalsEntry {
  return {
    x: MON,
    workoutId: 'w1',
    label: 'Bench Press',
    muscleGroup: 'Chest',
    sets: [
      { reps: 10, weight: 100 },
      { reps: 8, weight: 100 },
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
    cardio: { time: 1800, distance: 3, elevation: 120 },
    ...overrides,
  };
}

describe('computeTotals — strength', () => {
  it('sums sets, reps and volume across entries', () => {
    const { strength } = computeTotals([lift(), lift({ x: TUE })]);

    expect(strength.sessions).toBe(2);
    expect(strength.sets).toBe(4);
    expect(strength.reps).toBe(36);
    // (10×100 + 8×100) × 2
    expect(strength.volumeLbs).toBe(3600);
  });

  it('reports null volume — not zero — when no set logged both reps and a weight', () => {
    const { strength } = computeTotals([
      lift({ sets: [{ reps: 12, weight: null }] }),
    ]);

    expect(strength.sets).toBe(1);
    expect(strength.reps).toBe(12);
    expect(strength.volumeLbs).toBeNull();
  });

  it('counts a weighted set even when another set in the entry has no weight', () => {
    const { strength } = computeTotals([
      lift({ sets: [{ reps: 5, weight: 200 }, { reps: 5, weight: null }] }),
    ]);

    expect(strength.sets).toBe(2);
    expect(strength.reps).toBe(10);
    expect(strength.volumeLbs).toBe(1000);
  });

  it('ignores blank rows, which are not sets', () => {
    const { strength } = computeTotals([
      lift({ sets: [{ reps: 10, weight: 100 }, { reps: null, weight: null }] }),
    ]);

    expect(strength.sets).toBe(1);
  });
});

describe('computeTotals — cardio', () => {
  it('sums distance, time and elevation, keeping canonical units', () => {
    const { cardio } = computeTotals([run(), run({ x: TUE })]);

    expect(cardio.sessions).toBe(2);
    expect(cardio.distanceMi).toBe(6);
    expect(cardio.seconds).toBe(3600);
    expect(cardio.elevationFt).toBe(240);
  });

  it('treats missing cardio fields as zero rather than dropping the session', () => {
    const { cardio } = computeTotals([
      run({ cardio: { time: 600, distance: null } }),
    ]);

    expect(cardio.sessions).toBe(1);
    expect(cardio.seconds).toBe(600);
    expect(cardio.distanceMi).toBe(0);
    expect(cardio.elevationFt).toBe(0);
  });

  it('keeps cardio out of the strength totals, and lifts out of the cardio ones', () => {
    const totals = computeTotals([lift(), run()]);

    expect(totals.strength.sessions).toBe(1);
    expect(totals.strength.sets).toBe(2);
    expect(totals.cardio.sessions).toBe(1);
    expect(totals.cardio.distanceMi).toBe(3);
  });
});

describe('computeTotals — training days', () => {
  it('counts distinct days, not entries', () => {
    const totals = computeTotals([
      lift(),
      lift({ workoutId: 'w2', label: 'Dips' }),
      lift({ x: TUE }),
    ]);

    expect(totals.trainingDays).toBe(2);
  });

  it('counts a cardio-only day as a training day', () => {
    expect(computeTotals([run({ x: TUE })]).trainingDays).toBe(1);
  });
});

describe('computeTotals — breakdowns', () => {
  it('rolls up per exercise and ranks by volume', () => {
    const totals = computeTotals([
      lift(),
      lift({
        workoutId: 'w2',
        label: 'Squat',
        muscleGroup: 'Legs',
        sets: [{ reps: 5, weight: 300 }],
      }),
    ]);

    expect(totals.byExercise.map((r) => r.label)).toEqual(['Bench Press', 'Squat']);
    expect(totals.byExercise[0].volumeLbs).toBe(1800);
    expect(totals.byExercise[1].volumeLbs).toBe(1500);
  });

  it('counts a row’s sessions as distinct days, not entries', () => {
    const totals = computeTotals([lift(), lift(), lift({ x: TUE })]);

    expect(totals.byExercise).toHaveLength(1);
    expect(totals.byExercise[0].sessions).toBe(2);
    expect(totals.byExercise[0].sets).toBe(6);
  });

  it('folds several exercises into one muscle-group row', () => {
    const totals = computeTotals([
      lift(),
      lift({ workoutId: 'w2', label: 'Incline Press' }),
      lift({ workoutId: 'w3', label: 'Squat', muscleGroup: 'Legs' }),
    ]);

    expect(totals.byExercise).toHaveLength(3);
    expect(totals.byGroup.map((r) => r.label)).toEqual(['Chest', 'Legs']);
    expect(totals.byGroup[0].volumeLbs).toBe(3600);
    expect(totals.byGroup[0].sessions).toBe(1);
  });

  it('excludes cardio from both breakdowns', () => {
    const totals = computeTotals([lift(), run()]);

    expect(totals.byExercise.map((r) => r.label)).toEqual(['Bench Press']);
    expect(totals.byGroup.map((r) => r.label)).toEqual(['Chest']);
  });

  it('sorts a volume-less row last rather than treating it as zero', () => {
    const totals = computeTotals([
      lift({
        workoutId: 'w9',
        label: 'Pull-ups',
        sets: [{ reps: 10, weight: null }],
      }),
      lift(),
    ]);

    expect(totals.byExercise.map((r) => r.label)).toEqual([
      'Bench Press',
      'Pull-ups',
    ]);
    expect(totals.byExercise[1].volumeLbs).toBeNull();
    expect(totals.byExercise[1].reps).toBe(10);
  });
});

describe('computeTotals — empty', () => {
  it('returns zeroed totals with a null volume for no entries', () => {
    const totals = computeTotals([]);

    expect(totals.trainingDays).toBe(0);
    expect(totals.strength).toEqual({
      sessions: 0,
      sets: 0,
      reps: 0,
      volumeLbs: null,
    });
    expect(totals.cardio).toEqual({
      sessions: 0,
      distanceMi: 0,
      seconds: 0,
      elevationFt: 0,
    });
    expect(totals.byExercise).toEqual([]);
    expect(totals.byGroup).toEqual([]);
  });
});
