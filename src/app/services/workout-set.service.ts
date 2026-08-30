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
} from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { CardioLog, LoggedSet } from './week.service';
import { MuscleGroup } from './workout.service';

/**
 * One exercise inside a saved set: which exercise, and exactly how it's meant
 * to be done — the per-set reps/weight/time, and any note that travels with it.
 *
 * The workout's name and muscle group are **denormalized**, the same trade the
 * week log makes (see `WeekEntry`): a set keeps working after the exercise is
 * renamed or deleted from the library, instead of breaking or silently
 * changing. `workoutId` may therefore dangle; the builder labels such an item
 * rather than dropping it.
 */
export interface SetItem {
  workoutId: string;
  workoutName: string; // denormalized (survives library rename/delete)
  muscleGroup: MuscleGroup; // denormalized
  /**
   * Denormalized copy of `Workout.bodyWeight`, because applying a set has to
   * know *without* a library lookup — the exercise may be gone by then.
   *
   * When true, `sets` carry no weight at all (every `weight` is null). A body
   * weight is a fact about a day, not about a routine: capturing it here would
   * freeze whatever the user weighed when they built the set into every future
   * week. `entriesFromSet` fills it from the latest weigh-in at apply time.
   */
  bodyWeight?: boolean;
  trackTime?: boolean;
  /** Always written, '' when there is none — see {@link sanitizeItem}. */
  notes: string;
  sets: LoggedSet[]; // [] for cardio items
  /** Present only when `muscleGroup` is the reserved Cardio category. */
  cardio?: CardioLog;
}

/**
 * A saved, reusable bundle of exercises — the *other* sense of "set" (see
 * {@link LoggedSet} for the gym one). Users who do the same session every week
 * build one once and apply it to a day instead of re-entering every exercise.
 *
 * Items live in an **array on this document, not a sub-collection**: a set is a
 * handful of exercises, always read and written whole, so one doc means one
 * read, one atomic write and no fan-out. It is nowhere near Firestore's 1 MiB
 * document limit.
 */
export interface WorkoutSet {
  id?: string;
  name: string;
  /** Always written, '' when there is none — `update` uses `updateDoc`, which
   *  ignores a missing key and so could never clear a description the user
   *  removed. (Firestore also rejects `undefined` outright.) */
  description: string;
  items: SetItem[];
  createdAt?: unknown; // Firestore serverTimestamp
}

/**
 * A {@link SetItem} with every `undefined` removed and its invariants enforced.
 *
 * Firestore rejects `undefined` outright. A top-level document gets away with
 * loose optionals because the service builds its payload key by key — but an
 * item lives *inside an array*, where an optional field the form left
 * `undefined` reaches the write untouched and fails the whole save. So optional
 * keys are **omitted** rather than set to undefined, and `time` / `heartRate` /
 * `elevation` are written as explicit `null`.
 *
 * It also enforces the one invariant a form could get wrong: a body-weight
 * item stores no weight (see {@link SetItem.bodyWeight}).
 */
function sanitizeItem(item: SetItem): SetItem {
  const clean: SetItem = {
    workoutId: item.workoutId,
    workoutName: item.workoutName,
    muscleGroup: item.muscleGroup,
    notes: item.notes?.trim() ?? '',
    sets: item.sets.map((s) => ({
      reps: s.reps ?? null,
      weight: item.bodyWeight ? null : s.weight ?? null,
      time: s.time ?? null,
    })),
  };
  if (item.bodyWeight) clean.bodyWeight = true;
  if (item.trackTime) clean.trackTime = true;
  if (item.cardio) {
    clean.cardio = {
      time: item.cardio.time ?? null,
      distance: item.cardio.distance ?? null,
      heartRate: item.cardio.heartRate ?? null,
      elevation: item.cardio.elevation ?? null,
    };
  }
  return clean;
}

@Injectable({ providedIn: 'root' })
export class WorkoutSetService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /**
   * The signed-in user's saved sets, kept live via Firestore's stream.
   * `undefined` means "still loading" (auth/Firestore not resolved yet) —
   * distinct from an empty array, which means "loaded, but you have no sets".
   */
  readonly sets = toSignal(
    toObservable(this.auth.currentUser).pipe(
      switchMap((user) =>
        user
          ? collectionData(
              query(this.userSets(user.uid), orderBy('createdAt', 'desc')),
              // Estimate pending server timestamps so a new set doesn't briefly
              // sort to the bottom before the write commits.
              { idField: 'id', serverTimestamps: 'estimate' }
            )
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => WorkoutSet[] | undefined;

  async add(data: Omit<WorkoutSet, 'id' | 'createdAt'>): Promise<string> {
    const uid = this.auth.requireUid('add a set');
    const ref = await addDoc(this.userSets(uid), {
      ...data,
      items: data.items.map(sanitizeItem),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(
    id: string,
    data: Omit<WorkoutSet, 'id' | 'createdAt'>
  ): Promise<void> {
    const uid = this.auth.requireUid('edit a set');
    await updateDoc(doc(this.firestore, 'users', uid, 'workoutSets', id), {
      ...data,
      items: data.items.map(sanitizeItem),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.requireUid('delete a set');
    await deleteDoc(doc(this.firestore, 'users', uid, 'workoutSets', id));
  }

  private userSets(uid: string) {
    return collection(this.firestore, 'users', uid, 'workoutSets');
  }
}
