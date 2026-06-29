import { Injectable, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs,
  where,
} from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

/** Default muscle groups — used as fallback when user has not customized their list. */
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
export type MuscleGroup = string;

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

  async update(
    id: string,
    data: Omit<Workout, 'id' | 'createdAt'>
  ): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('You must be signed in to edit a workout.');
    await updateDoc(doc(this.firestore, 'users', uid, 'workouts', id), {
      ...data,
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('You must be signed in to delete a workout.');
    await deleteDoc(doc(this.firestore, 'users', uid, 'workouts', id));
  }

  async renameGroup(from: string, to: string): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('You must be signed in.');
    const snapshot = await getDocs(
      query(this.userWorkouts(uid), where('muscleGroup', '==', from))
    );
    if (snapshot.empty) return;
    const batch = writeBatch(this.firestore);
    snapshot.docs.forEach((d) => batch.update(d.ref, { muscleGroup: to }));
    await batch.commit();
  }

  async reassignMuscleGroup(from: string): Promise<void> {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) throw new Error('You must be signed in.');
    const snapshot = await getDocs(
      query(this.userWorkouts(uid), where('muscleGroup', '==', from))
    );
    if (snapshot.empty) return;
    const batch = writeBatch(this.firestore);
    snapshot.docs.forEach((d) => batch.update(d.ref, { muscleGroup: 'Unassigned' }));
    await batch.commit();
  }

  private userWorkouts(uid: string) {
    return collection(this.firestore, 'users', uid, 'workouts');
  }
}
