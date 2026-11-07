/**
 * Personal records: the best a user has ever done on each exercise, and the
 * search that finds them.
 *
 * Like the rest of `analytics/`, this file is free of Angular and Firestore so
 * the maths can be unit tested as plain functions. It reads the same
 * {@link TotalsEntry} rows the Totals card does — label and muscle group already
 * resolved from the current library, cardio already identified — so a renamed
 * exercise keeps its records and a renamed group carries them along.
 *
 * Records are **derived**, never stored: every one is recomputed from the logged
 * history, so editing or deleting an old session can never leave a stale record
 * behind.
 */
import { SetInput } from './exercise-metrics';
import { TotalsEntry } from './totals';

/** The records an exercise can hold. Strength and cardio never share a kind. */
export type RecordKind =
  | 'est1rm'
  | 'topSet'
  | 'mostReps'
  | 'bestVolume'
  | 'longestDistance'
  | 'longestTime'
  | 'fastestPace';

/** How a record is labelled and unit-formatted at the display boundary. */
export interface RecordMeta {
  kind: RecordKind;
  label: string;
  /**
   * `'weight'` values are pounds, `'distance'` miles, `'time'` seconds and
   * `'pace'` seconds per mile — all canonical; the page converts for display.
   */
  unit: 'weight' | 'reps' | 'distance' | 'time' | 'pace';
}

export const RECORD_META: Readonly<Record<RecordKind, RecordMeta>> = {
  est1rm: { kind: 'est1rm', label: 'Est. 1RM', unit: 'weight' },
  topSet: { kind: 'topSet', label: 'Heaviest set', unit: 'weight' },
  mostReps: { kind: 'mostReps', label: 'Most reps', unit: 'reps' },
  bestVolume: { kind: 'bestVolume', label: 'Best session volume', unit: 'weight' },
  longestDistance: { kind: 'longestDistance', label: 'Longest distance', unit: 'distance' },
  longestTime: { kind: 'longestTime', label: 'Longest session', unit: 'time' },
  fastestPace: { kind: 'fastestPace', label: 'Fastest pace', unit: 'pace' },
};

/** One record: its value, the day it was set, and the set that set it. */
export interface PersonalRecord {
  kind: RecordKind;
  /** Canonical units — see {@link RecordMeta.unit}. */
  value: number;
  /** Epoch ms at local midnight of the day the record was set. */
  x: number;
  /** The set behind a per-set record (1RM, heaviest, most reps). */
  set?: SetInput;
}

/** Every record one exercise holds. */
export interface ExerciseRecords {
  workoutId: string;
  label: string;
  muscleGroup: string;
  cardio: boolean;
  /** Distinct days the exercise was logged. */
  sessions: number;
  /** In {@link RECORD_META} order; a kind with no qualifying data is absent. */
  records: PersonalRecord[];
}

const STRENGTH_ORDER: readonly RecordKind[] = ['est1rm', 'topSet', 'mostReps', 'bestVolume'];
const CARDIO_ORDER: readonly RecordKind[] = ['longestDistance', 'longestTime', 'fastestPace'];

/**
 * Epley, per set — the same formula as `estimatedOneRm`, which only returns the
 * best value; records also need to know *which* set it came from.
 */
function setOneRm(s: SetInput): number | null {
  if (s.weight == null || s.reps == null || s.reps <= 0) return null;
  return s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30);
}

/**
 * Keeps the best candidate per kind. Ties go to the **earlier** day: a record is
 * set when it is first reached, and matching it later doesn't move the date.
 * Callers feed sessions in ascending date order, so strict `better` is enough.
 */
class Best {
  private readonly map = new Map<RecordKind, PersonalRecord>();

  offer(rec: PersonalRecord, lowerIsBetter = false): void {
    const cur = this.map.get(rec.kind);
    if (!cur || (lowerIsBetter ? rec.value < cur.value : rec.value > cur.value)) {
      this.map.set(rec.kind, rec);
    }
  }

  inOrder(order: readonly RecordKind[]): PersonalRecord[] {
    return order.flatMap((k) => this.map.get(k) ?? []);
  }
}

/**
 * Every exercise's personal records, from its whole logged history.
 *
 * Same-day entries of one exercise are pooled into one session before session
 * volume is taken (the same rule the exercise-progress card applies), so a
 * session split across two entries still counts as one.
 *
 * Sorted by muscle group, then exercise name. Exercises with no qualifying data
 * (e.g. only blank sets) still appear, with an empty `records` list — they were
 * logged, so a search for them should find them.
 */
export function computeRecords(entries: readonly TotalsEntry[]): ExerciseRecords[] {
  const byExercise = new Map<string, TotalsEntry[]>();
  for (const e of entries) {
    const list = byExercise.get(e.workoutId);
    if (list) list.push(e);
    else byExercise.set(e.workoutId, [e]);
  }

  const out: ExerciseRecords[] = [];
  for (const [workoutId, list] of byExercise) {
    const sorted = [...list].sort((a, b) => a.x - b.x);
    // Label and group come from the most recent entry: they're resolved from the
    // current library, so they agree across entries unless the exercise was
    // deleted — in which case the latest denormalized name is the best we have.
    const latest = sorted[sorted.length - 1];
    const cardio = sorted.some((e) => e.cardio != null);
    const best = new Best();
    const days = new Set<number>();

    for (const e of sorted) days.add(e.x);

    if (cardio) {
      for (const e of sorted) {
        const c = e.cardio;
        if (!c) continue;
        if (c.distance != null && c.distance > 0) {
          best.offer({ kind: 'longestDistance', value: c.distance, x: e.x });
        }
        if (c.time != null && c.time > 0) {
          best.offer({ kind: 'longestTime', value: c.time, x: e.x });
        }
        if (c.time != null && c.time > 0 && c.distance != null && c.distance > 0) {
          best.offer({ kind: 'fastestPace', value: c.time / c.distance, x: e.x }, true);
        }
      }
    } else {
      const volumeByDay = new Map<number, number>();
      for (const e of sorted) {
        for (const s of e.sets) {
          const orm = setOneRm(s);
          if (orm != null) best.offer({ kind: 'est1rm', value: orm, x: e.x, set: s });
          if (s.weight != null && s.weight > 0) {
            best.offer({ kind: 'topSet', value: s.weight, x: e.x, set: s });
          }
          if (s.reps != null && s.reps > 0) {
            best.offer({ kind: 'mostReps', value: s.reps, x: e.x, set: s });
          }
          if (s.reps != null && s.reps > 0 && s.weight != null && s.weight > 0) {
            volumeByDay.set(e.x, (volumeByDay.get(e.x) ?? 0) + s.reps * s.weight);
          }
        }
      }
      for (const [x, value] of volumeByDay) {
        best.offer({ kind: 'bestVolume', value, x });
      }
    }

    out.push({
      workoutId,
      label: latest.label,
      muscleGroup: latest.muscleGroup,
      cardio,
      sessions: days.size,
      records: best.inOrder(cardio ? CARDIO_ORDER : STRENGTH_ORDER),
    });
  }

  return out.sort(
    (a, b) => a.muscleGroup.localeCompare(b.muscleGroup) || a.label.localeCompare(b.label)
  );
}

/** Which field a search hit matched on — shown so the user sees *why* it matched. */
export type MatchField = 'name' | 'group' | 'both';

export interface RecordSearchHit {
  item: ExerciseRecords;
  matched: MatchField;
}

/** Lowercase, accent-free, single-spaced — so "Bénch  press" finds "bench press". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** 3 = a word in `text` starts with `token`, 1 = `token` appears mid-word, 0 = absent. */
function tokenScore(text: string, token: string): number {
  const i = text.indexOf(token);
  if (i < 0) return 0;
  if (i === 0 || text[i - 1] === ' ') return 3;
  return text.split(' ').some((w) => w.startsWith(token)) ? 3 : 1;
}

/**
 * Search records by exercise name **and** muscle group at once — the user never
 * picks which. Each whitespace-separated word of the query must match the name
 * or the group (either one, independently), so "chest incline" finds Incline
 * Press in Chest, and "legs" finds every leg exercise.
 *
 * Ranked so the likeliest intent comes first: name matches outrank group-only
 * matches, and a word-start match ("ben" → "Bench") outranks a mid-word one
 * ("nch" → "Bench"). Ties keep the input order (group, then name).
 *
 * An empty query returns everything, unranked.
 */
export function searchRecords(
  items: readonly ExerciseRecords[],
  query: string
): RecordSearchHit[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return items.map((item) => ({ item, matched: 'both' as const }));
  }

  const scored: { hit: RecordSearchHit; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const name = normalize(item.label);
    const group = normalize(item.muscleGroup);
    let score = 0;
    let onName = false;
    let onGroup = false;
    for (const t of tokens) {
      const n = tokenScore(name, t);
      const g = tokenScore(group, t);
      if (n === 0 && g === 0) return;
      // Name matches weigh double: someone typing an exercise name wants that
      // exercise first, ahead of everything that merely shares its group.
      score += Math.max(n * 2, g);
      if (n > 0) onName = true;
      if (g > 0) onGroup = true;
    }
    const matched: MatchField = onName && onGroup ? 'both' : onName ? 'name' : 'group';
    scored.push({ hit: { item, matched }, score, index });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.hit);
}
