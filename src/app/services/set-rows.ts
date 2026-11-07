import {
  WeightEntry,
  WeightUnit,
  displayLifted,
  liftedToCanonical,
  weightIn,
} from './weight.service';
import { LoggedSet, formatTime, parseTime } from './week.service';

/**
 * The per-set editing model shared by every form that plans or logs an
 * exercise: the Weeks page's add/edit modal, and the set builder on `/sets`.
 *
 * Pure on purpose — no Angular, no Firestore — because the interesting part is
 * arithmetic, not rendering, and it is the arithmetic that has a trap in it
 * (see {@link rowToLoggedSet}). Same spirit as `entry-summary.ts` and
 * `cardio.ts`. The matching markup lives in `components/set-rows-editor/`.
 */

/** A per-set row in a form. `timeText` is the raw m:ss text the user edits;
 *  it's parsed to seconds (the stored `LoggedSet.time`) on submit. */
export interface SetRow {
  reps: number | null;
  /** Weight as shown in the user's unit; converted back to canonical lbs on submit. */
  weight: number | null;
  /**
   * What this row was seeded with: the stored (canonical lbs) value, and the
   * display value derived from it. While `weight` still equals `seededWeight` the
   * user hasn't touched the field, so `canonicalWeight` is written back verbatim.
   * Converting again would round-trip through `convertWeight`'s 1-decimal rounding
   * and silently shift the stored number (135 lbs → 61.2 kg → 134.9 lbs) just
   * because someone opened the form in kg and edited the reps.
   */
  canonicalWeight: number | null;
  seededWeight: number | null;
  timeText: string;
}

/**
 * What a set row's weight field starts out as: the value to store (canonical
 * lbs) paired with the value to show (the user's unit).
 *
 * The two travel together because they aren't always derived from each other. A
 * body-weight seed takes its display value straight off the weigh-in's own `kg`
 * field, so the row reads exactly like the Weight page instead of a converted
 * (and re-rounded) approximation of it.
 */
export interface WeightSeed {
  canonical: number | null;
  display: number | null;
}

/** An empty seed — nothing to prefill the weight field with. */
export const BLANK_SEED: WeightSeed = { canonical: null, display: null };

/** A seed for a stored (canonical lbs) weight, shown in `unit`. */
export function canonicalSeed(
  canonical: number | null,
  unit: WeightUnit
): WeightSeed {
  return { canonical, display: displayLifted(canonical, unit) };
}

/**
 * A seed taken from a weigh-in, for a body-weight exercise. Reads the display
 * value off the entry's own field for that unit rather than converting the
 * canonical pounds — see {@link WeightSeed}. A `null` entry (nothing logged
 * yet) gives {@link BLANK_SEED}.
 */
export function bodyWeightSeed(
  entry: WeightEntry | null,
  unit: WeightUnit
): WeightSeed {
  return entry
    ? { canonical: entry.lbs, display: weightIn(entry, unit) }
    : BLANK_SEED;
}

/** A set row seeded from a {@link WeightSeed}. */
export function seedRow(
  seed: WeightSeed,
  reps: number | null = null,
  timeText = ''
): SetRow {
  return {
    reps,
    weight: seed.display,
    canonicalWeight: seed.canonical,
    seededWeight: seed.display,
    timeText,
  };
}

/** Re-seed every row's weight (e.g. the selected workout changed), leaving
 *  reps and time intact. Returns new rows; the originals aren't mutated. */
export function reseedRows(rows: SetRow[], seed: WeightSeed): SetRow[] {
  return rows.map((row) => ({
    ...row,
    weight: seed.display,
    canonicalWeight: seed.canonical,
    seededWeight: seed.display,
  }));
}

/**
 * Grow `pool` to at least `count` rows, appending rows seeded from `seed`.
 *
 * Only ever grows. Shrinking is the caller's job, and it does it by *slicing
 * the visible list* rather than trimming the pool: a transient count value (a
 * cleared field, the "1" on the way to typing "12") then only hides rows
 * instead of destroying what was typed in them.
 */
export function growPool(
  pool: SetRow[],
  count: number,
  seed: WeightSeed
): SetRow[] {
  const grown = pool.slice();
  while (grown.length < count) grown.push(seedRow(seed));
  return grown;
}

/** The largest set count a form will accept — a guard against a typo'd 500. */
export const MAX_SETS = 20;

/** Clamp raw input from the "number of sets" field to a sane row count. */
export function clampSetCount(value: number | null): number {
  return Math.max(0, Math.min(Math.floor(value ?? 0), MAX_SETS));
}

/**
 * The value to store for a row.
 *
 * **The trap:** an untouched weight field is written back as its original
 * canonical number, never re-converted — see {@link SetRow.canonicalWeight}.
 * Re-converting would round-trip through `convertWeight`'s 1-decimal rounding
 * and shift a stored weight (135 lbs → 61.2 kg → 134.9 lbs) just because the
 * form was opened in kg and something unrelated was edited.
 */
export function rowToLoggedSet(
  row: SetRow,
  unit: WeightUnit,
  trackTime: boolean
): LoggedSet {
  return {
    reps: row.reps,
    weight: rowWeight(row, unit),
    time: trackTime ? parseTime(row.timeText) : null,
  };
}

/** {@link rowToLoggedSet} for a whole list. */
export function rowsToLoggedSets(
  rows: SetRow[],
  unit: WeightUnit,
  trackTime: boolean
): LoggedSet[] {
  return rows.map((row) => rowToLoggedSet(row, unit, trackTime));
}

/** Rows seeded from already-stored sets, for editing them. */
export function rowsFromLoggedSets(
  sets: LoggedSet[],
  unit: WeightUnit
): SetRow[] {
  return sets.map((set) =>
    seedRow(canonicalSeed(set.weight, unit), set.reps, formatTime(set.time ?? null))
  );
}

/** Whether every row has a usable rep count — the one validation both forms
 *  run before saving. */
export function everyRowHasReps(rows: SetRow[]): boolean {
  return rows.every((row) => row.reps != null && row.reps > 0);
}

/** See {@link rowToLoggedSet}. */
function rowWeight(row: SetRow, unit: WeightUnit): number | null {
  if (row.weight == null) return null;
  if (row.weight === row.seededWeight) return row.canonicalWeight;
  return liftedToCanonical(row.weight, unit);
}
