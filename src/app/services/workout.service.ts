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

/** Preset muscle groups (extend here to add more). */
export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export interface Workout {
  id?: string;
  name: string;
  muscleGroup: MuscleGroup;
  usualWeight: number | null;
  maxWeight: number | null;
  createdAt?: unknown; // Firestore serverTimestamp
}

@Injectable({ providedIn: 'root' })
export class WorkoutService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /**
   * The signed-in user's workout library, kept live via Firestore's stream.
   * `undefined` means "still loading" (auth/Firestore not resolved yet) — distinct
   * from an empty array, which means "loaded, but you have no workouts".
   */
  readonly workouts = toSignal(
    toObservable(this.auth.currentUser).pipe(
      switchMap((user) =>
        user
          ? collectionData(
              query(this.userWorkouts(user.uid), orderBy('createdAt', 'desc')),
              { idField: 'id' }
            )
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => Workout[] | undefined;

  async add(data: Omit<Workout, 'id' | 'createdAt'>): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('You must be signed in to add a workout.');
    await addDoc(this.userWorkouts(uid), {
      ...data,
      createdAt: serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('You must be signed in to delete a workout.');
    await deleteDoc(doc(this.firestore, 'users', uid, 'workouts', id));
  }

  private userWorkouts(uid: string) {
    return collection(this.firestore, 'users', uid, 'workouts');
  }
}
