import { describe, expect, it } from 'vitest';
import {
  BuilderItem,
  blankItem,
  builderItemFrom,
  isCardioItem,
  selectWorkout,
  toSetItem,
} from './builder-item';
import { growPool, canonicalSeed } from '../../services/set-rows';
import { Workout, CARDIO_GROUP } from '../../services/workout.service';
import { SetItem } from '../../services/workout-set.service';

const BENCH: Workout = {
  id: 'w1',
  name: 'Bench Press',
  muscleGroup: 'Chest',
  usualWeight: 135,
  maxWeight: 185,
};

const PULLUPS: Workout = {
  id: 'w4',
  name: 'Pull-ups',
  muscleGroup: 'Back',
  usualWeight: null,
  maxWeight: null,
  bodyWeight: true,
};

/** A block with `workout` chosen and `count` set rows, as the editor builds it. */
function itemWith(workout: Workout, count: number, unit: 'kg' | 'lbs' = 'lbs'): BuilderItem {
  const item = blankItem(0, workout.muscleGroup);
  selectWorkout(item, workout, unit);
  const seed = workout.bodyWeight
    ? { canonical: null, display: null }
    : canonicalSeed(workout.usualWeight, unit);
  item.rowPool = growPool(item.rowPool, count, seed);
  item.rows.set(item.rowPool.slice(0, count));
  return item;
}

describe('selectWorkout', () => {
  it('seeds the rows from the exercise’s usual weight', () => {
    const item = itemWith(BENCH, 2);

    expect(item.name()).toBe('Bench Press');
    expect(item.bodyWeight()).toBe(false);
    expect(item.rows().every((r) => r.weight === 135)).toBe(true);
  });

  it('leaves a body-weight exercise’s rows unweighted', () => {
    const item = itemWith(PULLUPS, 2);

    expect(item.bodyWeight()).toBe(true);
    expect(item.rows().every((r) => r.weight === null)).toBe(true);
  });

  it('re-seeds existing rows when the exercise is swapped', () => {
    const item = itemWith(BENCH, 2);
    item.rows()[0].reps = 10;

    selectWorkout(item, { ...BENCH, id: 'w9', name: 'Incline', usualWeight: 95 }, 'lbs');

    expect(item.rows().every((r) => r.weight === 95)).toBe(true);
    // Reps survive the swap — only the weight is a property of the exercise.
    expect(item.rows()[0].reps).toBe(10);
  });
});

describe('toSetItem', () => {
  it('stores a strength block with its rows in canonical pounds', () => {
    const item = itemWith(BENCH, 2);
    item.rows()[0].reps = 10;
    item.rows()[1].reps = 8;

    const result = toSetItem(item, 'lbs', 'mi');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item).toEqual<SetItem>({
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      notes: '',
      trackTime: false,
      sets: [
        { reps: 10, weight: 135, time: null },
        { reps: 8, weight: 135, time: null },
      ],
    });
  });

  it('never re-converts an untouched weight, whatever unit the builder is in', () => {
    const item = itemWith(BENCH, 1, 'kg');
    item.rows()[0].reps = 10;

    const result = toSetItem(item, 'kg', 'mi');

    // 135 lbs shows as 61.2 kg; converting that back would store 134.9.
    expect(result.ok && result.item.sets[0].weight).toBe(135);
  });

  it('marks a body-weight block and stores no weights', () => {
    const item = itemWith(PULLUPS, 1);
    item.rows()[0].reps = 10;

    const result = toSetItem(item, 'lbs', 'mi');

    expect(result.ok && result.item.bodyWeight).toBe(true);
    expect(result.ok && result.item.sets[0].weight).toBeNull();
  });

  it('omits the body-weight key entirely for a normal exercise', () => {
    const item = itemWith(BENCH, 1);
    item.rows()[0].reps = 10;

    const result = toSetItem(item, 'lbs', 'mi');

    expect(result.ok && 'bodyWeight' in result.item).toBe(false);
  });

  it('keeps a note, and drops it when the toggle is off', () => {
    const item = itemWith(BENCH, 1);
    item.rows()[0].reps = 10;
    item.notes.set('  slow negatives  ');

    item.hasNotes.set(true);
    expect(toSetItem(item, 'lbs', 'mi')).toMatchObject({
      item: { notes: 'slow negatives' },
    });

    item.hasNotes.set(false);
    expect(toSetItem(item, 'lbs', 'mi')).toMatchObject({ item: { notes: '' } });
  });

  it('refuses a block with no exercise chosen', () => {
    const result = toSetItem(blankItem(0, 'Chest'), 'lbs', 'mi');

    expect(result).toEqual({
      ok: false,
      error: 'Pick an exercise for every block, or remove it.',
    });
  });

  it('refuses a block with no sets, naming it', () => {
    const result = toSetItem(itemWith(BENCH, 0), 'lbs', 'mi');

    expect(result).toEqual({
      ok: false,
      error: 'Add at least one set to Bench Press.',
    });
  });

  it('refuses a block with a blank rep count, naming it', () => {
    const item = itemWith(BENCH, 2);
    item.rows()[0].reps = 10; // second row left blank

    expect(toSetItem(item, 'lbs', 'mi')).toEqual({
      ok: false,
      error: 'Enter the reps for every set of Bench Press.',
    });
  });

  describe('cardio blocks', () => {
    const RUN: Workout = {
      id: 'w3',
      name: 'Morning Run',
      muscleGroup: CARDIO_GROUP,
      usualWeight: null,
      maxWeight: null,
    };

    it('stores a session instead of sets', () => {
      const item = itemWith(RUN, 0);
      item.cardioTimeText.set('30:00');
      item.cardioDistance.set(5);

      expect(isCardioItem(item)).toBe(true);

      const result = toSetItem(item, 'lbs', 'mi');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.item.sets).toEqual([]);
      expect(result.item.cardio).toEqual({
        time: 1800,
        distance: 5,
        heartRate: null,
        elevation: null,
      });
      // trackTime is strength-only; it must not ride along on a cardio item.
      expect('trackTime' in result.item).toBe(false);
    });

    it('refuses a session missing its duration or distance, naming it', () => {
      const item = itemWith(RUN, 0);
      item.cardioTimeText.set('30:00');

      expect(toSetItem(item, 'lbs', 'mi')).toEqual({
        ok: false,
        error: 'Enter a duration and distance for Morning Run.',
      });
    });
  });
});

describe('builderItemFrom', () => {
  it('reopens a stored item in the reader’s units', () => {
    const stored: SetItem = {
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      notes: 'go heavy',
      trackTime: true,
      sets: [{ reps: 10, weight: 135, time: 90 }],
    };

    const item = builderItemFrom(stored, 7, 'kg', 'mi');

    expect(item.key).toBe(7);
    expect(item.hasNotes()).toBe(true);
    expect(item.trackTime()).toBe(true);
    expect(item.rows()[0].weight).toBe(61.2); // shown in kg
    expect(item.rows()[0].timeText).toBe('1:30');

    // And back out unchanged — the round-trip guard holds through the builder.
    expect(toSetItem(item, 'kg', 'mi')).toEqual({ ok: true, item: stored });
  });

  it('reopens a cardio item with its session fields filled', () => {
    const item = builderItemFrom(
      {
        workoutId: 'w3',
        workoutName: 'Morning Run',
        muscleGroup: CARDIO_GROUP,
        notes: '',
        sets: [],
        cardio: { time: 1800, distance: 5, heartRate: 150, elevation: null },
      },
      0,
      'lbs',
      'mi'
    );

    expect(item.cardioTimeText()).toBe('30:00');
    expect(item.cardioDistance()).toBe(5);
    expect(item.cardioHeartRate()).toBe(150);
  });
});
