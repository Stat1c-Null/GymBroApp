import { DAY_LABELS, LoggedSet, WeekEntry, bucketByDay } from './week.service';
import { WeekSet, WeekSetDay } from './week-set.service';
import { SetItem, WorkoutSet } from './workout-set.service';

/**
 * Turning a saved set into logged entries, and back again.
 *
 * Pure — no Angular, no Firestore — so the rules below are testable as plain
 * functions, the way `entry-summary.ts` and `analytics/exercise-metrics.ts` are.
 * `WeekService.addMany` does the writing; this decides *what* gets written.
 */

/**
 * An exercise's standing note, as carried into a session it didn't originate on
 * — `Workout.note` and `Workout.noteCreatedAt`, narrowed to strings.
 */
export interface CarriedNote {
  note: string;
  noteCreatedAt: string;
}

/**
 * Standing notes by `workoutId`, for filling in the exercises a set says nothing
 * about. Optional everywhere it's accepted: an omitted lookup simply carries
 * nothing, which is exactly how this behaved before notes could travel.
 */
export type NoteLookup = ReadonlyMap<string, CarriedNote>;

/** The outcome of applying a set to a day. */
export interface SetApplication {
  /** Entries to write, in the set's own item order. */
  entries: Omit<WeekEntry, 'id' | 'createdAt'>[];
  /** Names of exercises left out because that day already has them — see
   *  {@link entriesFromSet}. Empty when nothing collided. */
  skipped: string[];
}

/**
 * The entries a saved set becomes on `day`.
 *
 * Three rules, each of which had an obvious-but-wrong alternative:
 *
 * 1. **A collision skips that exercise, it doesn't fail the set.** The Weeks
 *    page refuses to log the same workout twice on one day, and a set applied
 *    onto a partly-logged day will trip that. Rejecting the whole set over one
 *    overlap would leave the user to add the other four by hand — so the rest
 *    go in and the caller reports what didn't (`skipped`). Repeats *within* the
 *    set are caught by the same guard.
 *
 * 2. **Body-weight exercises take today's weight, not the set's.** A saved set
 *    stores no weight for them at all (see {@link SetItem.bodyWeight}); it is
 *    filled here from the latest weigh-in. Reusing a weight captured when the
 *    set was written would stamp one day's body weight onto every future week.
 *    With no weigh-in yet, the weight stays null — exactly what logging one by
 *    hand does with an empty weight log.
 *
 * 3. **Nothing is written back to the exercise library.** The Weeks page pushes
 *    a uniform logged weight onto `Workout.usualWeight`; applying a set must
 *    not. A set's weights are an intention, not what was lifted, and a stale
 *    template would quietly overwrite real progress. Editing the resulting
 *    entry afterwards goes through the normal path and *does* sync — which is
 *    the honest moment to do it.
 *
 * `notes` carries standing exercise notes in, per rule 4 in
 * {@link entriesFromItems}.
 */
export function entriesFromSet(
  set: WorkoutSet,
  day: number,
  dayEntries: WeekEntry[],
  bodyWeightLbs: number | null,
  notes?: NoteLookup
): SetApplication {
  return entriesFromItems(set.items, day, dayEntries, bodyWeightLbs, notes);
}

/**
 * The three rules above, applied to a bare list of items.
 *
 * Split out from {@link entriesFromSet} so a week set can reuse them a day at a
 * time ({@link entriesFromWeekSet}) — and so the Weeks page can drop a single
 * day *out* of a week set onto a column — without either re-deriving the
 * collision guard or having to wrap its items in a fake `WorkoutSet`.
 *
 * There is a fourth rule, and it belongs to notes:
 *
 * 4. **The set's own note wins; a standing note only fills a blank.** A note
 *    written into a set is a deliberate instruction about *this* routine
 *    ("pause at the bottom"), so it outranks the exercise's standing note —
 *    which is a running observation that happens to still be true. When the
 *    item says nothing, `notes` supplies the carried note and the date it was
 *    first written, so the session records where the text came from.
 *
 *    Nothing is written *back*: like rule 3, applying a set must not touch the
 *    library. A set carrying a note is not the user re-asserting it today.
 */
export function entriesFromItems(
  items: SetItem[],
  day: number,
  dayEntries: WeekEntry[],
  bodyWeightLbs: number | null,
  notes?: NoteLookup
): SetApplication {
  const taken = new Set(dayEntries.map((entry) => entry.workoutId));
  const entries: Omit<WeekEntry, 'id' | 'createdAt'>[] = [];
  const skipped: string[] = [];

  for (const item of items) {
    if (taken.has(item.workoutId)) {
      skipped.push(item.workoutName);
      continue;
    }
    taken.add(item.workoutId);

    const base = {
      day,
      workoutId: item.workoutId,
      workoutName: item.workoutName,
      muscleGroup: item.muscleGroup,
      ...noteFor(item, notes),
    };
    entries.push(
      item.cardio
        ? { ...base, sets: [], cardio: item.cardio }
        : {
            ...base,
            trackTime: item.trackTime ?? false,
            sets: applyWeights(item, bodyWeightLbs),
          }
    );
  }

  return { entries, skipped };
}

/**
 * The inverse: a day's logged entries captured as reusable set items — the
 * "save this day as a set" flow.
 *
 * Takes the entries **in the order they're shown** (the day column is
 * newest-first), so the set reads the way the day looked. `addMany` stamps
 * descending timestamps on the way back, which puts them in that same order
 * again — the round trip is stable.
 *
 * `bodyWeightIds` is needed because a `WeekEntry` doesn't record whether its
 * exercise is body-weight; only the library knows. Entries whose exercise is
 * flagged there are captured with **no** weights, per rule 2 above.
 */
export function setItemsFromEntries(
  entries: WeekEntry[],
  bodyWeightIds: ReadonlySet<string>
): SetItem[] {
  return entries.map((entry) => {
    const bodyWeight = bodyWeightIds.has(entry.workoutId);
    const item: SetItem = {
      workoutId: entry.workoutId,
      workoutName: entry.workoutName,
      muscleGroup: entry.muscleGroup,
      notes: entry.notes ?? '',
      sets: bodyWeight
        ? entry.sets.map((set) => ({ ...set, weight: null }))
        : entry.sets,
    };
    if (bodyWeight) item.bodyWeight = true;
    if (entry.trackTime) item.trackTime = true;
    if (entry.cardio) item.cardio = entry.cardio;
    return item;
  });
}

/**
 * The entries a saved **week** set becomes, across every day it covers.
 *
 * A thin loop over {@link entriesFromItems}, and the loop is the point: the
 * collision guard is rebuilt **per day**, from that day's own entries. Sharing
 * one `taken` set across the week would mean logging Bench Press on Monday
 * silently swallowed the Thursday copy of it — which is the whole shape of an
 * upper/lower split. The three rules of {@link entriesFromSet} otherwise apply
 * unchanged, including body-weight items taking *today's* weigh-in on every day
 * they appear.
 *
 * `skipped` names are qualified with the weekday (`"Bench Press (Mon)"`),
 * because the same exercise can collide on more than one day and an unqualified
 * list would repeat a name with no way to tell which day it meant.
 *
 * Days come back in weekday order, and each day's items in the set's own order,
 * so one flat descending timestamp run over the result still orders every
 * column correctly — see `WeekService.addMany`.
 */
export function entriesFromWeekSet(
  weekSet: WeekSet,
  weekEntries: WeekEntry[],
  bodyWeightLbs: number | null,
  notes?: NoteLookup
): SetApplication {
  const byDay = bucketByDay(weekEntries);
  const entries: Omit<WeekEntry, 'id' | 'createdAt'>[] = [];
  const skipped: string[] = [];

  const days = [...weekSet.days].sort((a, b) => a.day - b.day);
  for (const day of days) {
    const applied = entriesFromItems(
      day.items,
      day.day,
      byDay[day.day] ?? [],
      bodyWeightLbs,
      notes
    );
    entries.push(...applied.entries);
    skipped.push(
      ...applied.skipped.map((name) => `${name} (${DAY_LABELS[day.day]})`)
    );
  }

  return { entries, skipped };
}

/**
 * The inverse of {@link entriesFromWeekSet}: a whole logged week captured as a
 * reusable week set — the "save this week as a set" flow.
 *
 * Rest days are **dropped, not stored empty** (see {@link WeekSetDay}), so a
 * week with three sessions in it saves three days. Each day's items are
 * captured by the same {@link setItemsFromEntries} the day flow uses, in the
 * order that day's column shows them, which keeps the round trip stable.
 */
export function weekSetDaysFromEntries(
  entries: WeekEntry[],
  bodyWeightIds: ReadonlySet<string>
): WeekSetDay[] {
  const byDay = bucketByDay(entries);
  const days: WeekSetDay[] = [];
  for (let day = 0; day < byDay.length; day++) {
    const dayEntries = byDay[day];
    if (!dayEntries?.length) continue;
    days.push({ day, items: setItemsFromEntries(dayEntries, bodyWeightIds) });
  }
  return days;
}

/**
 * The note an applied item logs with, and where it came from — rule 4 of
 * {@link entriesFromItems}.
 *
 * A set's own note carries **no** origin date (`''`): the set doesn't record
 * when its note was written, and dating it to today would be a guess dressed as
 * a fact. Only a carried note has a real first-written date to report.
 */
function noteFor(
  item: SetItem,
  notes: NoteLookup | undefined
): { notes: string; noteCreatedAt: string } {
  const own = item.notes ?? '';
  if (own) return { notes: own, noteCreatedAt: '' };
  const carried = notes?.get(item.workoutId);
  return carried?.note
    ? { notes: carried.note, noteCreatedAt: carried.noteCreatedAt }
    : { notes: '', noteCreatedAt: '' };
}

/** An item's sets, with a body-weight exercise's weight filled from the latest
 *  weigh-in — see rule 2 of {@link entriesFromSet}. */
function applyWeights(item: SetItem, bodyWeightLbs: number | null): LoggedSet[] {
  if (!item.bodyWeight) return item.sets;
  return item.sets.map((set) => ({ ...set, weight: bodyWeightLbs }));
}
