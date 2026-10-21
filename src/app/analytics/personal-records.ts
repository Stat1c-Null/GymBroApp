/**
 * Personal records: the best a user has ever done on each exercise, and the
 * free-text search over them.
 *
 * Like the rest of `analytics/`, this file is free of Angular and Firestore so the
 * maths can be unit tested as plain functions. It takes the same flattened
 * {@link TotalsEntry} rows as `totals.ts` — label and muscle group already
 * resolved against the current library, cardio already identified — so a record
 * follows an exercise through a rename instead of splitting into two rows.
 *
 * Records are derived, never stored: there is no `records` collection to keep in
 * sync, and editing or deleting a logged set corrects its record automatically.
 */
import { estimatedOneRm } from './exercise-metrics';
import { TotalsEntry } from './totals';

/** One best-ever value and the day it was set. `x` is epoch ms, local midnight. */
export interface RecordMark {
  value: number;
  x: number;
}

/** The heaviest single set — kept with its reps, since "200 × 1" ≠ "200 × 8". */
export interface HeaviestMark extends RecordMark {
  reps: number | null;
}

export interface PersonalRecord {
  workoutId: string;
  label: string;
  muscleGroup: string;
  /** Whether this is a cardio exercise (distance/time records, no lifting ones). */
  cardio: boolean;
  /** Distinct days the exercise was logged. */
  sessions: number;
  /** Most recent day it was logged, epoch ms. */
  lastX: number;
  /** Heaviest weight in one set, canonical lbs. */
  heaviest: HeaviestMark | null;
  /** Best Epley estimated one-rep max over any set, canonical lbs. */
  est1rm: RecordMark | null;
  /** Most reps in one set. */
  mostReps: RecordMark | null;
  /** Most volume (Σ reps × weight) in one day, canonical lbs. */
  bestVolume: RecordMark | null;
  /** Longest single cardio session distance, canonical miles. */
  longestDistance: RecordMark | null;
  /** Longest single cardio session, seconds. */
  longestTime: RecordMark | null;
}

/**
 * Replace `current` when `value` beats it. Ties keep the **earlier** day: the
 * record was set the first time it was reached, not every time it was matched.
 * Entries arrive ascending by date, so "strictly greater" gives exactly that.
 */
function better(current: RecordMark | null, value: number, x: number): RecordMark | null {
  return current == null || value > current.value ? { value, x } : current;
}

/**
 * Every exercise's personal records, one row per `workoutId`, ordered by most
 * recently trained first — the records you're actively chasing come up top.
 *
 * Sessions of the same exercise on the same day are summed for volume (two logged
 * entries of bench on one Monday are one day's work), matching how `totals.ts`
 * counts a session as a distinct day.
 */
export function personalRecords(entries: readonly TotalsEntry[]): PersonalRecord[] {
  const sorted = [...entries].sort((a, b) => a.x - b.x);
  const byId = new Map<string, PersonalRecord>();
  const days = new Map<string, Set<number>>();
  const dayVolume = new Map<string, number>(); // `${workoutId}|${x}` → lbs

  for (const e of sorted) {
    let rec = byId.get(e.workoutId);
    if (!rec) {
      rec = {
        workoutId: e.workoutId,
        label: e.label,
        muscleGroup: e.muscleGroup,
        cardio: false,
        sessions: 0,
        lastX: e.x,
        heaviest: null,
        est1rm: null,
        mostReps: null,
        bestVolume: null,
        longestDistance: null,
        longestTime: null,
      };
      byId.set(e.workoutId, rec);
      days.set(e.workoutId, new Set());
    }
    // Latest entry wins the display label/group, in case the caller passed raw
    // (unresolved) rows from before a rename.
    rec.label = e.label;
    rec.muscleGroup = e.muscleGroup;
    rec.lastX = Math.max(rec.lastX, e.x);
    days.get(e.workoutId)!.add(e.x);

    if (e.cardio) {
      rec.cardio = true;
      if (e.cardio.distance != null && e.cardio.distance > 0) {
        rec.longestDistance = better(rec.longestDistance, e.cardio.distance, e.x);
      }
      if (e.cardio.time != null && e.cardio.time > 0) {
        rec.longestTime = better(rec.longestTime, e.cardio.time, e.x);
      }
      continue;
    }

    let volume = 0;
    let anyVolume = false;
    for (const s of e.sets) {
      if (s.weight != null && s.weight > 0) {
        if (!rec.heaviest || s.weight > rec.heaviest.value) {
          rec.heaviest = { value: s.weight, x: e.x, reps: s.reps };
        } else if (
          // Same top weight for more reps is a better heaviest set.
          s.weight === rec.heaviest.value &&
          s.reps != null &&
          (rec.heaviest.reps == null || s.reps > rec.heaviest.reps)
        ) {
          rec.heaviest = { value: s.weight, x: e.x, reps: s.reps };
        }
      }
      if (s.reps != null && s.reps > 0) {
        rec.mostReps = better(rec.mostReps, s.reps, e.x);
        const est = estimatedOneRm([s]);
        if (est != null && est > 0) rec.est1rm = better(rec.est1rm, est, e.x);
      }
      if (s.reps != null && s.weight != null) {
        volume += s.reps * s.weight;
        anyVolume = true;
      }
    }
    if (anyVolume && volume > 0) {
      const key = `${e.workoutId}|${e.x}`;
      const sum = (dayVolume.get(key) ?? 0) + volume;
      dayVolume.set(key, sum);
      rec.bestVolume = better(rec.bestVolume, sum, e.x);
    }
  }

  for (const [id, rec] of byId) rec.sessions = days.get(id)!.size;
  return [...byId.values()].sort((a, b) => b.lastX - a.lastX || a.label.localeCompare(b.label));
}

/** Whether a record has anything worth showing (e.g. not just blank sets). */
export function hasAnyRecord(r: PersonalRecord): boolean {
  return !!(
    r.heaviest ||
    r.est1rm ||
    r.mostReps ||
    r.bestVolume ||
    r.longestDistance ||
    r.longestTime
  );
}

/**
 * Filter records by a free-text query, matching **both** the exercise name and
 * its muscle group at once — the user never picks which field to search.
 *
 * The query is split on whitespace and every word must appear (case-insensitive,
 * substring) in the name *or* the group. So "chest" finds every chest exercise
 * plus any exercise named "Chest fly"; "legs squat" narrows to squats in Legs;
 * "bench" finds bench press wherever it lives.
 *
 * Results are ranked so the most direct hit comes first: an exact muscle-group or
 * name match, then a name that starts with the query, then everything else — each
 * tier keeping the input's order (most recently trained first). An empty query
 * returns the input unchanged.
 */
export function searchRecords(
  records: readonly PersonalRecord[],
  query: string
): PersonalRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...records];
  const words = q.split(/\s+/);

  const scored: { rec: PersonalRecord; rank: number; i: number }[] = [];
  records.forEach((rec, i) => {
    const name = rec.label.toLowerCase();
    const group = rec.muscleGroup.toLowerCase();
    if (!words.every((w) => name.includes(w) || group.includes(w))) return;
    const rank = name === q || group === q ? 0 : name.startsWith(q) || group.startsWith(q) ? 1 : 2;
    scored.push({ rec, rank, i });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.i - b.i).map((s) => s.rec);
}
