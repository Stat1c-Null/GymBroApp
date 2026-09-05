/**
 * Lifetime (or windowed) training totals: how much work has actually been done,
 * as opposed to how it is trending.
 *
 * Like the rest of `analytics/`, this file is free of Angular and Firestore so
 * the maths can be unit tested as plain functions. Callers adapt their Firestore
 * rows into the plain {@link TotalsEntry} shape — `x` already resolved to epoch
 * ms, and cardio already identified — so this layer never parses a date id and
 * never needs the reserved Cardio group's name.
 */
import { SetInput, setCount, totalReps, totalVolume } from './exercise-metrics';

/** The cardio half of a logged session, in canonical units. */
export interface CardioTotalsInput {
  /** Seconds. */
  time: number | null;
  /** Canonical miles. */
  distance: number | null;
  /** Canonical feet. */
  elevation?: number | null;
}

/**
 * One logged entry, flattened for totalling. Weights are canonical pounds and
 * distances canonical miles — conversion happens at the display boundary, on the
 * *sum*, never on each addend (see `displayLifted` / `displayDistance`).
 */
export interface TotalsEntry {
  /** Epoch ms at local midnight of the entry's logical date. */
  x: number;
  workoutId: string;
  /** Denormalized exercise name — survives a library rename or delete. */
  label: string;
  muscleGroup: string;
  sets: readonly SetInput[];
  /**
   * Present only for cardio entries.
   *
   * The **caller** decides what counts as cardio, applying the same
   * `muscleGroup === CARDIO_GROUP && entry.cardio` predicate `entrySummary` uses.
   * `CARDIO_GROUP` is a value export from `workout.service.ts`, which imports
   * Firestore — reaching for it here would drag that into this module's graph and
   * break the rule that `analytics/` stays pure.
   */
  cardio?: CardioTotalsInput | null;
}

/** One row of a breakdown table — an exercise, or a whole muscle group. */
export interface BreakdownRow {
  /** `workoutId` for an exercise, the group name for a group. */
  key: string;
  label: string;
  /** Distinct days this exercise (or group) was trained. */
  sessions: number;
  sets: number;
  reps: number;
  /** `null` when no set logged both reps and a weight — see {@link TrainingTotals}. */
  volumeLbs: number | null;
}

export interface StrengthTotals {
  /** Logged exercises, counting one per entry — not distinct days. */
  sessions: number;
  sets: number;
  reps: number;
  volumeLbs: number | null;
}

export interface CardioTotals {
  sessions: number;
  /** Canonical miles. */
  distanceMi: number;
  seconds: number;
  /** Canonical feet. */
  elevationFt: number;
}

/**
 * Everything the Totals card shows.
 *
 * 🟠 **`volumeLbs` is `null`, not `0`, when nothing qualified.** The per-session
 * metrics this builds on already return `null` for "not applicable" rather than a
 * misleading zero, and that distinction has to survive aggregation: a month of
 * bodyweight-only training genuinely has no tonnage, and reporting `0 lbs` would
 * read as a measurement rather than an absence. Counts (`sets`, `reps`,
 * `sessions`, and every cardio figure) are plain numbers — zero is a truthful
 * count.
 *
 * Note "sessions" is used at two scopes, deliberately: {@link trainingDays} is
 * distinct days with *anything* logged (what `computeFrequency` calls `sessions`),
 * while {@link BreakdownRow.sessions} is distinct days *that one row* appeared on.
 */
export interface TrainingTotals {
  /** Distinct days with anything logged at all, cardio included. */
  trainingDays: number;
  strength: StrengthTotals;
  cardio: CardioTotals;
  /** Ranked, volume first. */
  byExercise: BreakdownRow[];
  /** The same rollup one level up. */
  byGroup: BreakdownRow[];
}

/** A breakdown row under construction, before its day set becomes a count. */
interface RowAccumulator {
  key: string;
  label: string;
  days: Set<number>;
  sets: number;
  reps: number;
  volumeLbs: number;
  hasVolume: boolean;
}

/**
 * Fold logged entries into totals.
 *
 * Takes **already-windowed** entries, exactly as `buildExerciseSeries` takes
 * already-windowed sessions: the range lives on the Analytics page and is applied
 * once by the card with `rangeStart`, so there is one filtering idiom rather than
 * two that could disagree.
 *
 * Cardio is totalled separately and is **excluded from both breakdowns** — a
 * table of sets/reps/volume has nothing true to say about a 5-mile run, which is
 * the same reason the exercise-progress card leaves cardio out. The cardio tiles
 * are where that work shows up.
 *
 * Body-weight exercises need no special case: a logged body-weight set already
 * stores a real weight (the weigh-in at logging time), so it flows through
 * `totalVolume` like any other.
 */
export function computeTotals(entries: readonly TotalsEntry[]): TrainingTotals {
  const trainingDays = new Set<number>();
  const byExercise = new Map<string, RowAccumulator>();
  const byGroup = new Map<string, RowAccumulator>();

  const strength = { sessions: 0, sets: 0, reps: 0 };
  let volumeSum = 0;
  let anyVolume = false;
  const cardio: CardioTotals = {
    sessions: 0,
    distanceMi: 0,
    seconds: 0,
    elevationFt: 0,
  };

  for (const entry of entries) {
    trainingDays.add(entry.x);

    if (entry.cardio) {
      cardio.sessions++;
      cardio.distanceMi += entry.cardio.distance ?? 0;
      cardio.seconds += entry.cardio.time ?? 0;
      cardio.elevationFt += entry.cardio.elevation ?? 0;
      continue;
    }

    // `?? 0` because these read `null` as "not applicable"; the volume flag below
    // is what keeps that distinction alive for the one measure where it matters.
    const sets = setCount(entry.sets) ?? 0;
    const reps = totalReps(entry.sets) ?? 0;
    const volume = totalVolume(entry.sets);

    strength.sessions++;
    strength.sets += sets;
    strength.reps += reps;
    if (volume != null) {
      volumeSum += volume;
      anyVolume = true;
    }

    accumulate(byExercise, entry.workoutId, entry.label, entry, sets, reps, volume);
    accumulate(byGroup, entry.muscleGroup, entry.muscleGroup, entry, sets, reps, volume);
  }

  return {
    trainingDays: trainingDays.size,
    strength: { ...strength, volumeLbs: anyVolume ? volumeSum : null },
    cardio,
    byExercise: rank(byExercise),
    byGroup: rank(byGroup),
  };
}

/** Add one entry's numbers to its row, creating the row on first sight. */
function accumulate(
  rows: Map<string, RowAccumulator>,
  key: string,
  label: string,
  entry: TotalsEntry,
  sets: number,
  reps: number,
  volume: number | null
): void {
  let row = rows.get(key);
  if (!row) {
    row = {
      key,
      label,
      days: new Set<number>(),
      sets: 0,
      reps: 0,
      volumeLbs: 0,
      hasVolume: false,
    };
    rows.set(key, row);
  }
  row.days.add(entry.x);
  row.sets += sets;
  row.reps += reps;
  if (volume != null) {
    row.volumeLbs += volume;
    row.hasVolume = true;
  }
}

/**
 * Accumulators as finished rows, heaviest first.
 *
 * Volume is the ranking measure because it is the one that answers "what is my
 * training actually made of". A row with no volume at all (bodyweight-only, say)
 * sorts last rather than as zero, then ties break on how often it was trained.
 */
function rank(rows: Map<string, RowAccumulator>): BreakdownRow[] {
  return [...rows.values()]
    .map((row) => ({
      key: row.key,
      label: row.label,
      sessions: row.days.size,
      sets: row.sets,
      reps: row.reps,
      volumeLbs: row.hasVolume ? row.volumeLbs : null,
    }))
    .sort(
      (a, b) =>
        (b.volumeLbs ?? -1) - (a.volumeLbs ?? -1) ||
        b.sessions - a.sessions ||
        a.label.localeCompare(b.label)
    );
}
