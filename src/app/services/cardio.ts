/** The units cardio distance/elevation/pace can be displayed in. */
export type DistanceUnit = 'mi' | 'km';

/**
 * The unit cardio distance/elevation are *stored* in.
 *
 * `WeekEntry.cardio.distance` is always miles and `elevation` is always feet —
 * a mi/km preference is a display-and-input concern only: convert at the
 * boundary, never rewrite stored rows. Mirrors `LIFTED_STORAGE_UNIT` in
 * `weight.service.ts`.
 */
export const CARDIO_DISTANCE_STORAGE_UNIT: DistanceUnit = 'mi';

const KM_PER_MI = 1.609344;
const M_PER_FT = 0.3048;

/**
 * Convert a distance between miles and kilometers. `from` names the unit of
 * `value`, so this single function handles both directions. Result rounded
 * to 2 decimals.
 */
export function convertDistance(value: number, from: DistanceUnit): number {
  const result = from === 'mi' ? value * KM_PER_MI : value / KM_PER_MI;
  return Math.round(result * 100) / 100;
}

/** A distance (stored in miles) as it should be shown in `unit`. */
export function displayDistance(mi: number | null, unit: DistanceUnit): number | null {
  if (mi == null) return null;
  return unit === 'mi' ? mi : convertDistance(mi, 'mi');
}

/**
 * Inverse of {@link displayDistance}: a distance the user typed in `unit`,
 * converted back to the canonical storage unit (miles) for persistence.
 */
export function distanceToCanonical(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? value : convertDistance(value, 'km');
}

/**
 * Convert an elevation gain between feet and meters, paired with the same
 * mi/km preference as distance. `from` names the unit of `value`. Result
 * rounded to a whole unit — sub-foot/meter precision isn't meaningful for
 * elevation gain.
 */
export function convertElevation(value: number, from: 'ft' | 'm'): number {
  const result = from === 'ft' ? value * M_PER_FT : value / M_PER_FT;
  return Math.round(result);
}

/**
 * Elevation gain (stored in feet) as it should be shown for `unit` — feet
 * when paired with miles, meters when paired with km.
 */
export function displayElevation(ft: number | null, unit: DistanceUnit): number | null {
  if (ft == null) return null;
  return unit === 'mi' ? ft : convertElevation(ft, 'ft');
}

/**
 * Inverse of {@link displayElevation}: an elevation gain typed against
 * `unit`, converted back to the canonical storage unit (feet).
 */
export function elevationToCanonical(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? value : convertElevation(value, 'm');
}

/**
 * Pace as `"m:ss /mi"` or `"m:ss /km"` — the time to cover one unit of
 * distance, derived from a session's total time and canonical (miles)
 * distance. `null` when either input is missing or distance isn't positive
 * (dividing by zero/negative is meaningless) — the same "skip rather than
 * lie" rule the other analytics maths in this app follows.
 */
export function formatPace(
  seconds: number | null,
  distanceMi: number | null,
  unit: DistanceUnit
): string | null {
  if (seconds == null || distanceMi == null || distanceMi <= 0) return null;
  const distance = unit === 'mi' ? distanceMi : convertDistance(distanceMi, 'mi');
  const totalPaceSeconds = Math.round(seconds / distance);
  const mins = Math.floor(totalPaceSeconds / 60);
  const secs = totalPaceSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')} /${unit}`;
}
