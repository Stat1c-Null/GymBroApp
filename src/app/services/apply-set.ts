import { LoggedSet, WeekEntry } from './week.service';
import { SetItem, WorkoutSet } from './workout-set.service';

/**
 * Turning a saved set into logged entries, and back again.
 *
 * Pure — no Angular, no Firestore — so the rules below are testable as plain
 * functions, the way `entry-summary.ts` and `analytics/exercise-metrics.ts` are.
 * `WeekService.addMany` does the writing; this decides *what* gets written.
 */

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
 */
export function entriesFromSet(
  set: WorkoutSet,
  day: number,
  dayEntries: WeekEntry[],
  bodyWeightLbs: number | null
): SetApplication {
  const taken = new Set(dayEntries.map((entry) => entry.workoutId));
  const entries: Omit<WeekEntry, 'id' | 'createdAt'>[] = [];
  const skipped: string[] = [];

  for (const item of set.items) {
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
      notes: item.notes ?? '',
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

/** An item's sets, with a body-weight exercise's weight filled from the latest
 *  weigh-in — see rule 2 of {@link entriesFromSet}. */
function applyWeights(item: SetItem, bodyWeightLbs: number | null): LoggedSet[] {
  if (!item.bodyWeight) return item.sets;
  return item.sets.map((set) => ({ ...set, weight: bodyWeightLbs }));
}
