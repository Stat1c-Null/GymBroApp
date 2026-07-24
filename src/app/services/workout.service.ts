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
  getDocs,
  where,
  WriteBatch,
} from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

/** Default muscle groups — used as fallback when user has not customized their list. */
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
export type MuscleGroup = string;

/**
 * Reserved bucket for workouts whose muscle group no longer exists (e.g. after
 * the group is deleted). It's never a user-defined group, so any workout whose
 * `muscleGroup` isn't in the settings list is treated as belonging here.
 */
export const UNASSIGNED_GROUP = 'Unassigned';

/**
 * Reserved category for cardio exercises (running, cycling, etc). Like
 * {@link UNASSIGNED_GROUP}, it's never stored in `settings.muscleGroups` and
 * can't be renamed or deleted — it's injected wherever muscle groups are
 * listed, so every user has it immediately with no per-user migration.
 * Exercises in it use different logging fields than reps/weight — a single
 * time/distance session per day, see `WeekEntry.cardio` in `week.service.ts`
 * and the cardio form in `weeks.ts`.
 */
export const CARDIO_GROUP = 'Cardio';

/**
 * Whether `muscleGroup` should be treated as belonging to the reserved
 * {@link UNASSIGNED_GROUP} bucket: missing from the user's known group list,
 * and not the reserved {@link CARDIO_GROUP} (which has its own home and must
 * never be swept into Unassigned just because it's never in that list).
 */
export function isOrphanGroup(muscleGroup: string, knownGroups: ReadonlySet<string>): boolean {
  return !knownGroups.has(muscleGroup) && muscleGroup !== CARDIO_GROUP;
}

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
              // Estimate pending server timestamps so a new workout doesn't
              // briefly sort to the bottom before the write commits.
              { idField: 'id', serverTimestamps: 'estimate' }
            )
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => Workout[] | undefined;

  async add(data: Omit<Workout, 'id' | 'createdAt'>): Promise<string> {
    const uid = this.auth.requireUid('add a workout');
    const ref = await addDoc(this.userWorkouts(uid), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(
    id: string,
    data: Omit<Workout, 'id' | 'createdAt'>
  ): Promise<void> {
    const uid = this.auth.requireUid('edit a workout');
    await updateDoc(doc(this.firestore, 'users', uid, 'workouts', id), {
      ...data,
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.requireUid('delete a workout');
    await deleteDoc(doc(this.firestore, 'users', uid, 'workouts', id));
  }

  /**
   * Add "move every workout in group `from` to `to`" to an existing batch, so
   * the caller can commit it atomically alongside the settings update. Returns
   * the number of workouts affected.
   */
  async stageGroupReassign(
    batch: WriteBatch,
    from: string,
    to: string
  ): Promise<number> {
    const uid = this.auth.requireUid();
    const snapshot = await getDocs(
      query(this.userWorkouts(uid), where('muscleGroup', '==', from))
    );
    snapshot.docs.forEach((d) => batch.update(d.ref, { muscleGroup: to }));
    return snapshot.size;
  }

  private userWorkouts(uid: string) {
    return collection(this.firestore, 'users', uid, 'workouts');
  }
}
