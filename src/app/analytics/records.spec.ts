import { describe, expect, it } from 'vitest';
import { ExerciseRecords, computeRecords, searchRecords } from './records';
import { TotalsEntry } from './totals';

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
    cardio: { time: 1800, distance: 3 },
    ...overrides,
  };
}

function recordOf(items: ExerciseRecords[], kind: string) {
  return items[0].records.find((r) => r.kind === kind);
}

describe('computeRecords — strength', () => {
  it('finds the heaviest set, most reps, best 1RM and best session volume', () => {
    const items = computeRecords([
      lift({ x: MON, sets: [{ reps: 10, weight: 100 }] }),
      lift({ x: TUE, sets: [{ reps: 3, weight: 140 }, { reps: 15, weight: 60 }] }),
    ]);

    expect(items).toHaveLength(1);
    expect(recordOf(items, 'topSet')).toMatchObject({ value: 140, x: TUE });
    expect(recordOf(items, 'mostReps')).toMatchObject({ value: 15, x: TUE });
    // 140 × (1 + 3/30) = 154 beats 100 × (1 + 10/30) ≈ 133.3
    expect(recordOf(items, 'est1rm')?.value).toBeCloseTo(154);
    // TUE: 420 + 900 = 1320 beats MON: 1000
    expect(recordOf(items, 'bestVolume')).toMatchObject({ value: 1320, x: TUE });
  });

  it('keeps the set behind a per-set record', () => {
    const items = computeRecords([lift({ sets: [{ reps: 5, weight: 200 }] })]);
    expect(recordOf(items, 'topSet')?.set).toEqual({ reps: 5, weight: 200 });
  });

  it('treats a single rep as the 1RM itself, not Epley', () => {
    const items = computeRecords([lift({ sets: [{ reps: 1, weight: 225 }] })]);
    expect(recordOf(items, 'est1rm')?.value).toBe(225);
  });

  it('dates a tied record to the day it was first reached', () => {
    const items = computeRecords([
      lift({ x: WED, sets: [{ reps: 5, weight: 150 }] }),
      lift({ x: MON, sets: [{ reps: 5, weight: 150 }] }),
    ]);
    expect(recordOf(items, 'topSet')?.x).toBe(MON);
  });

  it('pools same-day entries of one exercise for session volume', () => {
    const items = computeRecords([
      lift({ x: MON, sets: [{ reps: 10, weight: 100 }] }),
      lift({ x: MON, sets: [{ reps: 10, weight: 100 }] }),
      lift({ x: TUE, sets: [{ reps: 15, weight: 100 }] }),
    ]);
    expect(recordOf(items, 'bestVolume')).toMatchObject({ value: 2000, x: MON });
    expect(items[0].sessions).toBe(2);
  });

  it('records reps for body-weight-style sets with no weight, but no weight records', () => {
    const items = computeRecords([lift({ sets: [{ reps: 20, weight: null }] })]);
    expect(items[0].records.map((r) => r.kind)).toEqual(['mostReps']);
  });

  it('still lists an exercise logged only with blank sets', () => {
    const items = computeRecords([lift({ sets: [{ reps: null, weight: null }] })]);
    expect(items).toHaveLength(1);
    expect(items[0].records).toEqual([]);
  });

  it('sorts by muscle group, then name', () => {
    const items = computeRecords([
      lift({ workoutId: 'a', label: 'Squat', muscleGroup: 'Legs' }),
      lift({ workoutId: 'b', label: 'Incline Press', muscleGroup: 'Chest' }),
      lift({ workoutId: 'c', label: 'Bench Press', muscleGroup: 'Chest' }),
    ]);
    expect(items.map((i) => i.label)).toEqual(['Bench Press', 'Incline Press', 'Squat']);
  });

  it('uses the latest entry’s label after a rename', () => {
    const items = computeRecords([
      lift({ x: MON, label: 'Bench' }),
      lift({ x: TUE, label: 'Bench Press' }),
    ]);
    expect(items[0].label).toBe('Bench Press');
  });
});

describe('computeRecords — cardio', () => {
  it('finds the longest distance, longest time and fastest pace', () => {
    const items = computeRecords([
      run({ x: MON, cardio: { time: 1800, distance: 3 } }), // 600 s/mi
      run({ x: TUE, cardio: { time: 3600, distance: 5 } }), // 720 s/mi
      run({ x: WED, cardio: { time: 1000, distance: 2 } }), // 500 s/mi
    ]);

    expect(items[0].cardio).toBe(true);
    expect(recordOf(items, 'longestDistance')).toMatchObject({ value: 5, x: TUE });
    expect(recordOf(items, 'longestTime')).toMatchObject({ value: 3600, x: TUE });
    expect(recordOf(items, 'fastestPace')).toMatchObject({ value: 500, x: WED });
  });

  it('skips pace when distance or time is missing', () => {
    const items = computeRecords([run({ cardio: { time: 1800, distance: null } })]);
    expect(items[0].records.map((r) => r.kind)).toEqual(['longestTime']);
  });

  it('never gives a cardio exercise strength records', () => {
    const items = computeRecords([run()]);
    expect(items[0].records.every((r) => !['topSet', 'est1rm'].includes(r.kind))).toBe(true);
  });
});

describe('searchRecords', () => {
  const items = computeRecords([
    lift({ workoutId: 'bench', label: 'Bench Press', muscleGroup: 'Chest' }),
    lift({ workoutId: 'incline', label: 'Incline Press', muscleGroup: 'Chest' }),
    lift({ workoutId: 'squat', label: 'Squat', muscleGroup: 'Legs' }),
    lift({ workoutId: 'legext', label: 'Leg Extension', muscleGroup: 'Legs' }),
    lift({ workoutId: 'dip', label: 'Chest Dip', muscleGroup: 'Triceps' }),
    run(),
  ]);
  const labels = (q: string) => searchRecords(items, q).map((h) => h.item.label);

  it('returns everything for an empty or blank query', () => {
    expect(labels('')).toHaveLength(items.length);
    expect(labels('   ')).toHaveLength(items.length);
  });

  it('matches by exercise name', () => {
    expect(labels('squat')).toEqual(['Squat']);
  });

  it('matches by muscle group without being told to', () => {
    expect(labels('legs')).toEqual(['Leg Extension', 'Squat']);
  });

  it('is case- and accent-insensitive', () => {
    expect(labels('BÉNCH')).toEqual(['Bench Press']);
  });

  it('lets each word match either field', () => {
    expect(labels('chest incline')).toEqual(['Incline Press']);
  });

  it('requires every word to match something', () => {
    expect(labels('chest squat')).toEqual([]);
  });

  it('ranks name matches above group-only matches', () => {
    // "Chest Dip" matches by name; Bench and Incline only by their Chest group.
    expect(labels('chest')[0]).toBe('Chest Dip');
    expect(labels('chest')).toHaveLength(3);
  });

  it('ranks word-start matches above mid-word ones', () => {
    // "press" is mid-word in "Expressway" but starts a word in "Leg Press".
    const pair = computeRecords([
      lift({ workoutId: 'a', label: 'Expressway Lunge', muscleGroup: 'Legs' }),
      lift({ workoutId: 'b', label: 'Leg Press', muscleGroup: 'Legs' }),
    ]);
    expect(searchRecords(pair, 'press').map((h) => h.item.label)).toEqual([
      'Leg Press',
      'Expressway Lunge',
    ]);
  });

  it('reports which field matched', () => {
    const hits = searchRecords(items, 'leg');
    const ext = hits.find((h) => h.item.label === 'Leg Extension');
    const squat = hits.find((h) => h.item.label === 'Squat');
    expect(ext?.matched).toBe('both');
    expect(squat?.matched).toBe('group');
  });

  it('finds cardio by its group name', () => {
    expect(labels('cardio')).toEqual(['Treadmill']);
  });
});
