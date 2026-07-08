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

/**
 * Display unit for lifted weights across the app. A per-user kg/lbs preference
 * isn't implemented yet; until it is, this single constant is the source of
 * truth so the Weeks and Workouts pages stay in sync.
 */
export const WEIGHT_UNIT = 'lbs';

/**
 * Convert a weight between kilograms and pounds. `from` names the unit of `value`,
 * so this single function handles both directions. Result rounded to 1 decimal.
 */
export function convertWeight(value: number, from: 'kg' | 'lbs'): number {
  const result = from === 'kg' ? value * LBS_PER_KG : value / LBS_PER_KG;
  return Math.round(result * 10) / 10;
}

export interface WeightEntry {
  id?: string;
  kg: number;
  lbs: number;
  createdAt?: unknown; // Firestore serverTimestamp
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
