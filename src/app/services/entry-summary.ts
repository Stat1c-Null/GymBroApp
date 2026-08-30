import { DistanceUnit, displayDistance, formatPace } from './cardio';
import { WeightUnit, displayLifted } from './weight.service';
import { CardioLog, LoggedSet, formatTime } from './week.service';
import { CARDIO_GROUP, MuscleGroup } from './workout.service';

/**
 * The units a summary renders in.
 *
 * These are the **reader's** preferences, not the logger's: entries store
 * canonical pounds and miles, so the very same session reads as "60 lbs" for one
 * person and "27.2 kg" for another. That distinction only started to matter once
 * the Friends page let you look at someone else's week.
 */
export interface SummaryUnits {
  weight: WeightUnit;
  distance: DistanceUnit;
}

/**
 * The parts of an exercise a summary actually reads.
 *
 * Structural rather than `WeekEntry` so a saved set's `SetItem`
 * (`workout-set.service.ts`) satisfies it too — which is what lets the Sets
 * page and the set picker describe a planned exercise with the very same line
 * the week grid uses for a logged one. They are the same sentence about the
 * same thing; writing it twice would be how the two start to disagree.
 */
export interface SummarizableExercise {
  muscleGroup: MuscleGroup;
  sets: LoggedSet[];
  cardio?: CardioLog;
}

/**
 * The one-line summary shown under an entry's name in a day column, e.g.
 * "12×60 · 10×60 (1:30) · 8×65 lbs" or "30:00 · 5 mi · 6:00 /mi".
 *
 * A plain function rather than a component method because two components render
 * day columns now (your own week and a friend's), and because it is the only
 * part of that rendering worth unit-testing.
 */
export function entrySummary(
  entry: SummarizableExercise,
  units: SummaryUnits
): string {
  return entry.muscleGroup === CARDIO_GROUP && entry.cardio
    ? cardioSummary(entry.cardio, units.distance)
    : setSummary(entry, units.weight);
}

/** e.g. "30:00 · 5 mi · 6:00 /mi". Parts with no value are omitted. */
function cardioSummary(cardio: CardioLog, unit: DistanceUnit): string {
  const distance = displayDistance(cardio.distance, unit);
  const parts = [
    cardio.time != null ? formatTime(cardio.time) : null,
    distance != null ? `${distance} ${unit}` : null,
    formatPace(cardio.time, cardio.distance, unit),
  ];
  return parts.filter((part): part is string => part != null).join(' · ');
}

/** Compact per-set summary. Times show whenever a set has one stored —
 *  independent of the entry's "track time per set" toggle. */
function setSummary(entry: SummarizableExercise, unit: WeightUnit): string {
  const parts = entry.sets.map((set) => {
    const weight = displayLifted(set.weight, unit);
    const base = weight != null ? `${set.reps}×${weight}` : `${set.reps}`;
    return set.time != null ? `${base} (${formatTime(set.time)})` : base;
  });
  const hasWeight = entry.sets.some((set) => set.weight != null);
  return parts.join(' · ') + (hasWeight ? ` ${unit}` : '');
}
