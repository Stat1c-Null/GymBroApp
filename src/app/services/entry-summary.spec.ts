import { describe, expect, it } from 'vitest';
import { SummaryUnits, entrySummary } from './entry-summary';
import { WeekEntry, bucketByDay, weekRangeLabel } from './week.service';
import { CARDIO_GROUP } from './workout.service';

const IMPERIAL: SummaryUnits = { weight: 'lbs', distance: 'mi' };

function strength(sets: WeekEntry['sets'], day = 0): WeekEntry {
  return {
    id: 'strength-entry',
    day,
    workoutId: 'w1',
    workoutName: 'Bench Press',
    muscleGroup: 'Chest',
    sets,
  };
}

const CARDIO: WeekEntry = {
  id: 'cardio-entry',
  day: 2,
  workoutId: 'w3',
  workoutName: 'Morning Run',
  muscleGroup: CARDIO_GROUP,
  sets: [],
  cardio: { time: 1800, distance: 5, heartRate: null, elevation: null },
};

describe('entrySummary', () => {
  it('summarizes a cardio entry with duration, distance, and pace', () => {
    const summary = entrySummary(CARDIO, IMPERIAL);

    expect(summary).toContain('30:00');
    expect(summary).toContain('5 mi');
    expect(summary).toContain('6:00 /mi');
  });

  it('renders a cardio entry in the reader’s units, not the logger’s', () => {
    const summary = entrySummary(CARDIO, { weight: 'kg', distance: 'km' });

    expect(summary).toContain('km');
    expect(summary).not.toContain(' mi');
  });

  it('summarizes a strength entry by sets', () => {
    expect(entrySummary(strength([{ reps: 10, weight: 60 }]), IMPERIAL)).toBe(
      '10×60 lbs'
    );
  });

  it('joins multiple sets and appends the unit once', () => {
    const entry = strength([
      { reps: 12, weight: 60 },
      { reps: 10, weight: 65 },
    ]);

    expect(entrySummary(entry, IMPERIAL)).toBe('12×60 · 10×65 lbs');
  });

  it('shows a stored set time regardless of the tracking toggle', () => {
    const entry = strength([{ reps: 10, weight: 60, time: 90 }]);

    expect(entrySummary(entry, IMPERIAL)).toBe('10×60 (1:30) lbs');
  });

  it('omits the unit entirely for bodyweight sets', () => {
    const entry = strength([{ reps: 15, weight: null }]);

    expect(entrySummary(entry, IMPERIAL)).toBe('15');
  });

  it('falls back to the set summary for a cardio-group entry with no cardio log', () => {
    const entry: WeekEntry = { ...CARDIO, cardio: undefined, sets: [{ reps: 5, weight: null }] };

    expect(entrySummary(entry, IMPERIAL)).toBe('5');
  });
});

describe('bucketByDay', () => {
  it('always returns seven buckets, in Monday-first order', () => {
    const buckets = bucketByDay([strength([], 0), strength([], 6), strength([], 0)]);

    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toHaveLength(2);
    expect(buckets[6]).toHaveLength(1);
    expect(buckets[3]).toEqual([]);
  });

  it('treats a still-loading week as seven empty buckets', () => {
    expect(bucketByDay(undefined).every((bucket) => bucket.length === 0)).toBe(true);
  });

  it('preserves the incoming order within a day', () => {
    const first = strength([{ reps: 1, weight: null }]);
    const second = strength([{ reps: 2, weight: null }]);

    expect(bucketByDay([first, second])[0]).toEqual([first, second]);
  });
});

describe('weekRangeLabel', () => {
  it('spans Monday to Sunday and ends with the year', () => {
    expect(weekRangeLabel(new Date(2026, 5, 15))).toBe('Jun 15 – Jun 21, 2026');
  });

  it('crosses a month boundary', () => {
    expect(weekRangeLabel(new Date(2026, 5, 29))).toBe('Jun 29 – Jul 5, 2026');
  });
});
