import { describe, expect, it } from 'vitest';
import {
  entriesFromSet,
  entriesFromWeekSet,
  setItemsFromEntries,
  weekSetDaysFromEntries,
} from './apply-set';
import { WeekEntry } from './week.service';
import { WeekSet, WeekSetDay } from './week-set.service';
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

function weekSet(days: WeekSetDay[]): WeekSet {
  return { id: 'ws1', name: 'PPL Split', description: '', days };
}

describe('entriesFromWeekSet', () => {
  it('maps every day onto its own column, in weekday order', () => {
    const set = weekSet([
      { day: 3, items: [item({ workoutId: 'w2', workoutName: 'Squat' })] },
      { day: 0, items: [item()] },
    ]);

    const { entries, skipped } = entriesFromWeekSet(set, [], null);

    expect(skipped).toEqual([]);
    expect(entries.map((e) => [e.workoutName, e.day])).toEqual([
      ['Bench Press', 0],
      ['Squat', 3],
    ]);
  });

  it('scopes the collision guard per day, so the same exercise can repeat', () => {
    // The shape of an upper/lower split: Bench on Mon and again on Thu.
    const set = weekSet([
      { day: 0, items: [item()] },
      { day: 3, items: [item()] },
    ]);

    const { entries, skipped } = entriesFromWeekSet(set, [], null);

    expect(skipped).toEqual([]);
    expect(entries.map((e) => e.day)).toEqual([0, 3]);
  });

  it('skips only the day that already has that exercise, and names the day', () => {
    const set = weekSet([
      { day: 0, items: [item()] },
      { day: 3, items: [item()] },
    ]);

    const { entries, skipped } = entriesFromWeekSet(
      set,
      [entry({ day: 0 })],
      null
    );

    expect(skipped).toEqual(['Bench Press (Mon)']);
    expect(entries.map((e) => e.day)).toEqual([3]);
  });

  it('fills every body-weight day from today’s weigh-in, not the set', () => {
    const bodyWeightItem = item({
      workoutId: 'w3',
      workoutName: 'Pull-ups',
      bodyWeight: true,
      sets: [
        { reps: 8, weight: null, time: null },
        { reps: 6, weight: null, time: null },
      ],
    });
    const set = weekSet([
      { day: 1, items: [bodyWeightItem] },
      { day: 4, items: [bodyWeightItem] },
    ]);

    const { entries } = entriesFromWeekSet(set, [], 176.4);

    expect(entries).toHaveLength(2);
    for (const written of entries) {
      expect(written.sets.every((s) => s.weight === 176.4)).toBe(true);
    }
  });

  it('reports nothing to add when every day is already logged', () => {
    const set = weekSet([
      { day: 0, items: [item()] },
      { day: 3, items: [item()] },
    ]);

    const { entries, skipped } = entriesFromWeekSet(
      set,
      [entry({ day: 0 }), entry({ day: 3 })],
      null
    );

    expect(entries).toEqual([]);
    expect(skipped).toEqual(['Bench Press (Mon)', 'Bench Press (Thu)']);
  });
});

describe('weekSetDaysFromEntries', () => {
  it('buckets a logged week by day, dropping the rest days', () => {
    const days = weekSetDaysFromEntries(
      [
        entry({ day: 0 }),
        entry({ day: 4, workoutId: 'w2', workoutName: 'Squat' }),
      ],
      new Set()
    );

    expect(days.map((d) => d.day)).toEqual([0, 4]);
    expect(days[0].items.map((i) => i.workoutName)).toEqual(['Bench Press']);
    expect(days[1].items.map((i) => i.workoutName)).toEqual(['Squat']);
  });

  it('captures a body-weight exercise without a weight', () => {
    const days = weekSetDaysFromEntries(
      [
        entry({
          day: 2,
          workoutId: 'w3',
          workoutName: 'Pull-ups',
          sets: [{ reps: 8, weight: 176.4, time: null }],
        }),
      ],
      new Set(['w3'])
    );

    expect(days[0].items[0].bodyWeight).toBe(true);
    expect(days[0].items[0].sets[0].weight).toBeNull();
  });

  it('returns nothing for a week with nothing logged', () => {
    expect(weekSetDaysFromEntries([], new Set())).toEqual([]);
  });

  it('round-trips a week: capture, then apply, gives the same columns back', () => {
    const logged = [
      entry({ day: 0, notes: 'felt good' }),
      entry({ day: 0, workoutId: 'w2', workoutName: 'Dips', trackTime: true }),
      entry({ day: 3, workoutId: 'w4', workoutName: 'Squat', muscleGroup: 'Legs' }),
    ];

    const { entries } = entriesFromWeekSet(
      weekSet(weekSetDaysFromEntries(logged, new Set())),
      [],
      null
    );

    expect(entries.map((e) => [e.workoutName, e.day])).toEqual([
      ['Bench Press', 0],
      ['Dips', 0],
      ['Squat', 3],
    ]);
    expect(entries[0].notes).toBe('felt good');
    expect(entries[1].trackTime).toBe(true);
    expect(entries[2].muscleGroup).toBe('Legs');
  });
});
