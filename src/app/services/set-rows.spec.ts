import { describe, expect, it } from 'vitest';
import {
  BLANK_SEED,
  MAX_SETS,
  bodyWeightSeed,
  canonicalSeed,
  clampSetCount,
  everyRowHasReps,
  growPool,
  reseedRows,
  rowToLoggedSet,
  rowsFromLoggedSets,
  rowsToLoggedSets,
  seedRow,
} from './set-rows';

describe('canonicalSeed', () => {
  it('passes pounds through untouched', () => {
    expect(canonicalSeed(135, 'lbs')).toEqual({ canonical: 135, display: 135 });
  });

  it('shows kilograms while keeping the stored pounds', () => {
    expect(canonicalSeed(135, 'kg')).toEqual({ canonical: 135, display: 61.2 });
  });

  it('seeds nothing from a workout with no usual weight', () => {
    expect(canonicalSeed(null, 'kg')).toEqual({ canonical: null, display: null });
  });
});

describe('bodyWeightSeed', () => {
  it('reads the display value off the weigh-in rather than converting it', () => {
    // 80 kg is stored alongside 176.4 lbs. Converting 176.4 lbs would give
    // 80.0 by luck here, but the point is that the entry's own field is used.
    const seed = bodyWeightSeed({ kg: 80, lbs: 176.4 }, 'kg');
    expect(seed).toEqual({ canonical: 176.4, display: 80 });
  });

  it('uses pounds when that is the display unit', () => {
    expect(bodyWeightSeed({ kg: 80, lbs: 176.4 }, 'lbs')).toEqual({
      canonical: 176.4,
      display: 176.4,
    });
  });

  it('is blank when nothing has been weighed in', () => {
    expect(bodyWeightSeed(null, 'lbs')).toEqual(BLANK_SEED);
  });
});

describe('rowToLoggedSet — the round-trip guard', () => {
  it('writes an untouched kg field back as its original pounds', () => {
    // The trap: 135 lbs displays as 61.2 kg, and converting that back gives
    // 134.9. Editing the *reps* must not shift the stored weight.
    const row = seedRow(canonicalSeed(135, 'kg'));
    row.reps = 10;

    expect(rowToLoggedSet(row, 'kg', false)).toEqual({
      reps: 10,
      weight: 135,
      time: null,
    });
  });

  it('converts a weight the user actually changed', () => {
    const row = seedRow(canonicalSeed(135, 'kg'));
    row.reps = 10;
    row.weight = 60; // typed over the seeded 61.2

    const stored = rowToLoggedSet(row, 'kg', false);
    expect(stored.weight).toBeCloseTo(132.3, 1);
  });

  it('stores a cleared weight as null', () => {
    const row = seedRow(canonicalSeed(135, 'lbs'));
    row.weight = null;

    expect(rowToLoggedSet(row, 'lbs', false).weight).toBeNull();
  });

  it('parses the time text only when tracking is on', () => {
    const row = seedRow(canonicalSeed(135, 'lbs'));
    row.timeText = '1:30';

    expect(rowToLoggedSet(row, 'lbs', true).time).toBe(90);
    expect(rowToLoggedSet(row, 'lbs', false).time).toBeNull();
  });
});

describe('rowsFromLoggedSets', () => {
  it('round-trips stored sets through the form without drift', () => {
    const stored = [
      { reps: 10, weight: 135, time: 90 },
      { reps: 8, weight: 135, time: null },
    ];

    const rows = rowsFromLoggedSets(stored, 'kg');
    expect(rows[0].weight).toBe(61.2); // shown in kg
    expect(rows[0].timeText).toBe('1:30');

    // Untouched, so the original pounds come back out.
    expect(rowsToLoggedSets(rows, 'kg', true)).toEqual(stored);
  });
});

describe('reseedRows', () => {
  it('replaces weights but keeps reps and time', () => {
    const rows = rowsFromLoggedSets([{ reps: 10, weight: 100, time: 60 }], 'lbs');

    const [row] = reseedRows(rows, canonicalSeed(135, 'lbs'));

    expect(row.reps).toBe(10);
    expect(row.timeText).toBe('1:00');
    expect(row.weight).toBe(135);
    expect(row.seededWeight).toBe(135);
  });

  it('leaves the original rows alone', () => {
    const rows = [seedRow(canonicalSeed(100, 'lbs'))];
    reseedRows(rows, canonicalSeed(135, 'lbs'));
    expect(rows[0].weight).toBe(100);
  });
});

describe('growPool', () => {
  it('appends rows seeded from the given weight', () => {
    const grown = growPool([], 3, canonicalSeed(135, 'lbs'));
    expect(grown).toHaveLength(3);
    expect(grown.every((r) => r.weight === 135)).toBe(true);
  });

  it('never shrinks, so typed rows survive a transient count', () => {
    const pool = growPool([], 3, canonicalSeed(135, 'lbs'));
    pool[2].reps = 8;

    // The user clears the field on the way to typing a bigger number.
    const afterClear = growPool(pool, clampSetCount(null), canonicalSeed(135, 'lbs'));

    expect(afterClear).toHaveLength(3);
    expect(afterClear[2].reps).toBe(8);
  });
});

describe('clampSetCount', () => {
  it('treats a cleared field as zero', () => {
    expect(clampSetCount(null)).toBe(0);
  });

  it('refuses negatives and caps a typo at the maximum', () => {
    expect(clampSetCount(-4)).toBe(0);
    expect(clampSetCount(500)).toBe(MAX_SETS);
  });

  it('floors a fractional entry', () => {
    expect(clampSetCount(3.7)).toBe(3);
  });
});

describe('everyRowHasReps', () => {
  it('rejects a blank or zero rep count', () => {
    const rows = growPool([], 2, BLANK_SEED);
    rows[0].reps = 10;
    expect(everyRowHasReps(rows)).toBe(false);

    rows[1].reps = 0;
    expect(everyRowHasReps(rows)).toBe(false);

    rows[1].reps = 8;
    expect(everyRowHasReps(rows)).toBe(true);
  });

  it('is vacuously true for no rows — the caller checks emptiness itself', () => {
    expect(everyRowHasReps([])).toBe(true);
  });
});
