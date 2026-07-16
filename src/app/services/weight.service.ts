import { Injectable, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

const LBS_PER_KG = 2.2046226218;

/** The units the app can display a weight in. */
export type WeightUnit = 'kg' | 'lbs';

/**
 * The unit lifted weights are *stored* in.
 *
 * `Workout.usualWeight`, `Workout.maxWeight` and `WorkoutSet.weight` are plain
 * numbers carrying no unit tag, and every version of the app has written and
 * labelled them as pounds — so pounds is their canonical unit by definition.
 * A kg/lbs preference is therefore a display-and-input concern only: convert at
 * the boundary, never rewrite stored rows.
 */
export const LIFTED_STORAGE_UNIT: WeightUnit = 'lbs';

/**
 * @deprecated Lifted weights now follow the user's chosen unit. Read
 * `SettingsService.unit()` and format with {@link displayLifted} (or the `lifted`
 * pipe). For the storage unit, use {@link LIFTED_STORAGE_UNIT}.
 */
export const WEIGHT_UNIT: WeightUnit = LIFTED_STORAGE_UNIT;

/**
 * Convert a weight between kilograms and pounds. `from` names the unit of `value`,
 * so this single function handles both directions. Result rounded to 1 decimal.
 */
export function convertWeight(value: number, from: 'kg' | 'lbs'): number {
  const result = from === 'kg' ? value * LBS_PER_KG : value / LBS_PER_KG;
  return Math.round(result * 10) / 10;
}

/**
 * A lifted weight (stored in {@link LIFTED_STORAGE_UNIT}) as it should be shown in
 * `unit`. Pounds pass straight through, so the default case never picks up
 * {@link convertWeight}'s rounding.
 */
export function displayLifted(lbs: number | null, unit: WeightUnit): number | null {
  if (lbs == null) return null;
  return unit === 'lbs' ? lbs : convertWeight(lbs, 'lbs');
}

/**
 * Inverse of {@link displayLifted}: a weight the user typed in `unit`, converted
 * back to the canonical storage unit for persistence.
 */
export function liftedToCanonical(value: number, unit: WeightUnit): number {
  return unit === 'lbs' ? value : convertWeight(value, 'kg');
}

export interface WeightEntry {
  id?: string;
  kg: number;
  lbs: number;
  createdAt?: unknown; // Firestore serverTimestamp
}

/**
 * A body-weight target: where the user started, where they want to land, and by
 * when. Both units are stored for the same reason {@link WeightEntry} stores both —
 * {@link convertWeight} rounds to 1 decimal, so re-deriving one from the other on
 * every read would let the value drift.
 *
 * Dates are local `YYYY-MM-DD` day ids (see `toWeekId`/`parseDateId` in
 * `week.service.ts`) — deliberately not `toISOString()`, which would UTC-shift the day.
 */
export interface WeightGoal {
  startKg: number;
  startLbs: number;
  startDate: string;
  targetKg: number;
  targetLbs: number;
  targetDate: string;
}

@Injectable({ providedIn: 'root' })
export class WeightService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /**
   * The signed-in user's weight log, kept live via Firestore's stream.
   * `undefined` means "still loading" — distinct from an empty array ("no entries yet").
   */
  readonly weights = toSignal(
    toObservable(this.auth.currentUser).pipe(
      switchMap((user) =>
        user
          ? collectionData(
              query(this.userWeights(user.uid), orderBy('createdAt', 'desc')),
              // Estimate pending server timestamps so a new entry doesn't
              // briefly sort to the bottom before the write commits.
              { idField: 'id', serverTimestamps: 'estimate' }
            )
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => WeightEntry[] | undefined;

  async add(data: Omit<WeightEntry, 'id' | 'createdAt'>): Promise<void> {
    const uid = this.auth.requireUid('log your weight');
    await addDoc(this.userWeights(uid), {
      ...data,
      createdAt: serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.requireUid('delete an entry');
    await deleteDoc(doc(this.firestore, 'users', uid, 'weights', id));
  }

  private userWeights(uid: string) {
    return collection(this.firestore, 'users', uid, 'weights');
  }
}
