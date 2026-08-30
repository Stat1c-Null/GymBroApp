import { describe, expect, it } from 'vitest';
import { entriesFromSet, setItemsFromEntries } from './apply-set';
import { WeekEntry } from './week.service';
import { SetItem, WorkoutSet } from './workout-set.service';

function item(overrides: Partial<SetItem> = {}): SetItem {
  return {
    workoutId: 'w1',
    workoutName: 'Bench Press',
    muscleGroup: 'Chest',
    notes: '',
    sets: [
      { reps: 10, weight: 135, time: null },
      { reps: 8, weight: 135, time: null },
    ],
    ...overrides,
  };
}

function savedSet(items: SetItem[]): WorkoutSet {
  return { id: 's1', name: 'Push Day', description: '', items };
}

function entry(overrides: Partial<WeekEntry> = {}): WeekEntry {
  return {
    day: 0,
    workoutId: 'w1',
    workoutName: 'Bench Press',
    muscleGroup: 'Chest',
    sets: [{ reps: 10, weight: 135, time: null }],
    ...overrides,
  };
}

describe('entriesFromSet', () => {
  it('maps every item to an entry on the requested day, in the set’s order', () => {
    const set = savedSet([
      item({ workoutId: 'w1', workoutName: 'Bench Press' }),
      item({ workoutId: 'w2', workoutName: 'Dips', muscleGroup: 'Arms' }),
    ]);

    const { entries, skipped } = entriesFromSet(set, 2, [], null);

    expect(skipped).toEqual([]);
    expect(entries.map((e) => e.workoutName)).toEqual(['Bench Press', 'Dips']);
    expect(entries.every((e) => e.day === 2)).toBe(true);
    expect(entries[0].muscleGroup).toBe('Chest');
    expect(entries[1].muscleGroup).toBe('Arms');
  });

  it('carries the stored sets, notes and trackTime onto the entry', () => {
    const set = savedSet([item({ notes: 'go heavy', trackTime: true })]);

    const { entries } = entriesFromSet(set, 0, [], null);

    expect(entries[0].notes).toBe('go heavy');
    expect(entries[0].trackTime).toBe(true);
    expect(entries[0].sets).toEqual([
      { reps: 10, weight: 135, time: null },
      { reps: 8, weight: 135, time: null },
    ]);
  });

  it('defaults notes to an empty string and trackTime to false', () => {
    const { entries } = entriesFromSet(savedSet([item()]), 0, [], null);

    expect(entries[0].notes).toBe('');
    expect(entries[0].trackTime).toBe(false);
  });

  it('skips an exercise already logged that day and reports its name', () => {
    const set = savedSet([
      item({ workoutId: 'w1', workoutName: 'Bench Press' }),
      item({ workoutId: 'w2', workoutName: 'Dips' }),
    ]);
    const alreadyLogged = [entry({ workoutId: 'w1' })];

    const { entries, skipped } = entriesFromSet(set, 0, alreadyLogged, null);

    expect(skipped).toEqual(['Bench Press']);
    expect(entries.map((e) => e.workoutName)).toEqual(['Dips']);
  });

  it('skips a repeat of the same exercise within the set itself', () => {
    const set = savedSet([
      item({ workoutId: 'w1', workoutName: 'Bench Press' }),
      item({ workoutId: 'w1', workoutName: 'Bench Press' }),
    ]);

    const { entries, skipped } = entriesFromSet(set, 0, [], null);

    expect(entries).toHaveLength(1);
    expect(skipped).toEqual(['Bench Press']);
  });

  it('fills a body-weight exercise’s sets from the latest weigh-in', () => {
    const set = savedSet([
      item({
        workoutName: 'Pull-ups',
        bodyWeight: true,
        sets: [
          { reps: 10, weight: null, time: null },
          { reps: 8, weight: null, time: null },
        ],
      }),
    ]);

    const { entries } = entriesFromSet(set, 0, [], 176.4);

    expect(entries[0].sets).toEqual([
      { reps: 10, weight: 176.4, time: null },
      { reps: 8, weight: 176.4, time: null },
    ]);
  });

  it('leaves a body-weight exercise unweighted when nothing has been weighed in', () => {
    const set = savedSet([
      item({ bodyWeight: true, sets: [{ reps: 10, weight: null, time: null }] }),
    ]);

    const { entries } = entriesFromSet(set, 0, [], null);

    expect(entries[0].sets).toEqual([{ reps: 10, weight: null, time: null }]);
  });

  it('never re-weights a normal exercise from the weigh-in', () => {
    const { entries } = entriesFromSet(savedSet([item()]), 0, [], 176.4);

    expect(entries[0].sets.every((s) => s.weight === 135)).toBe(true);
  });

  it('applies a cardio item as a session with no sets', () => {
    const set = savedSet([
      item({
        workoutName: 'Run',
        muscleGroup: 'Cardio',
        sets: [],
        cardio: { time: 1800, distance: 3, heartRate: 150, elevation: 100 },
      }),
    ]);

    const { entries } = entriesFromSet(set, 4, [], null);

    expect(entries[0].sets).toEqual([]);
    expect(entries[0].cardio).toEqual({
      time: 1800,
      distance: 3,
      heartRate: 150,
      elevation: 100,
    });
    // trackTime is a strength-only concern — it must not appear on a cardio entry.
    expect(entries[0].trackTime).toBeUndefined();
  });

  it('produces nothing for an empty set', () => {
    expect(entriesFromSet(savedSet([]), 0, [], null)).toEqual({
      entries: [],
      skipped: [],
    });
  });
});

describe('setItemsFromEntries', () => {
  it('captures a day’s entries in the order given', () => {
    const items = setItemsFromEntries(
      [
        entry({ workoutId: 'w1', workoutName: 'Bench Press' }),
        entry({ workoutId: 'w2', workoutName: 'Dips' }),
      ],
      new Set()
    );

    expect(items.map((i) => i.workoutName)).toEqual(['Bench Press', 'Dips']);
  });

  it('drops the weights of a body-weight exercise, which is a fact about the day', () => {
    const items = setItemsFromEntries(
      [
        entry({
          workoutId: 'bw',
          workoutName: 'Pull-ups',
          sets: [
            { reps: 10, weight: 176.4, time: null },
            { reps: 8, weight: 176.4, time: null },
          ],
        }),
      ],
      new Set(['bw'])
    );

    expect(items[0].bodyWeight).toBe(true);
    expect(items[0].sets).toEqual([
      { reps: 10, weight: null, time: null },
      { reps: 8, weight: null, time: null },
    ]);
  });

  it('omits optional keys rather than storing undefined, which Firestore rejects', () => {
    const [captured] = setItemsFromEntries([entry()], new Set());

    expect('bodyWeight' in captured).toBe(false);
    expect('trackTime' in captured).toBe(false);
    expect('cardio' in captured).toBe(false);
    expect(captured.notes).toBe('');
  });

  it('keeps a cardio session whole', () => {
    const cardio = { time: 1800, distance: 3, heartRate: null, elevation: null };
    const [captured] = setItemsFromEntries(
      [entry({ muscleGroup: 'Cardio', sets: [], cardio })],
      new Set()
    );

    expect(captured.cardio).toEqual(cardio);
    expect(captured.sets).toEqual([]);
  });

  it('round-trips a day through a set unchanged', () => {
    const day = [
      entry({ workoutId: 'w1', workoutName: 'Bench Press', notes: 'felt good' }),
      entry({ workoutId: 'w2', workoutName: 'Dips', trackTime: true }),
    ];

    const { entries } = entriesFromSet(
      savedSet(setItemsFromEntries(day, new Set())),
      0,
      [],
      null
    );

    expect(entries.map((e) => e.workoutName)).toEqual(['Bench Press', 'Dips']);
    expect(entries[0].notes).toBe('felt good');
    expect(entries[1].trackTime).toBe(true);
    expect(entries[0].sets).toEqual(day[0].sets);
  });
});
