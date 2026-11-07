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
import { SetItem, sanitizeItem } from './workout-set.service';

/**
 * One day of a {@link WeekSet}: which weekday, and the exercises planned for it.
 *
 * `day` matches `WeekEntry.day` and `DAY_LABELS` — 0 = Mon … 6 = Sun — so a day
 * of a week set drops straight onto the matching column with no translation.
 *
 * Rest days are **absent, not empty**: only days with exercises are stored, so
 * the document says what the plan is rather than padding it with five empty
 * slots. Readers must therefore never index `days` by weekday.
 */
export interface WeekSetDay {
  day: number;
  items: SetItem[];
}

/**
 * A saved, reusable **week** — the whole Mon–Sun plan, where a
 * {@link WorkoutSet} is a single day of one.
 *
 * Deliberately its own collection rather than a `kind` discriminator on
 * `workoutSets`: the two shapes are read in different places for different
 * reasons, and a discriminator would put a branch in front of every read of a
 * feature that has none today.
 *
 * The days live in an **array on this document**, for the same reason a day
 * set's items do: a week is read and written whole, so one doc means one read,
 * one atomic write and no fan-out. A dense week is a few dozen exercises —
 * nowhere near Firestore's 1 MiB document limit.
 */
export interface WeekSet {
  id?: string;
  name: string;
  /** Always written, '' when there is none — `update` uses `updateDoc`, which
   *  ignores a missing key and so could never clear a description the user
   *  removed. (Firestore also rejects `undefined` outright.) */
  description: string;
  days: WeekSetDay[];
  createdAt?: unknown; // Firestore serverTimestamp
}

/**
 * The days of a week set as they get stored: empty days dropped, the rest in
 * weekday order, every item run through the shared `sanitizeItem`.
 *
 * That last part is the whole reason `sanitizeItem` is exported from
 * `workout-set.service.ts` rather than reimplemented here. Firestore rejects
 * `undefined` outright, and an optional field the form left undefined inside an
 * **array** reaches the write untouched and fails the whole save. A week set
 * nests arrays two deep (`days[].items[]`), so it hits that trap harder than a
 * day set does — with a second copy of the rule, the two would drift and only
 * one of them would be fixed when a field is added to {@link SetItem}.
 */
function sanitizeDays(days: WeekSetDay[]): WeekSetDay[] {
  return days
    .filter((d) => d.items.length > 0)
    .sort((a, b) => a.day - b.day)
    .map((d) => ({ day: d.day, items: d.items.map(sanitizeItem) }));
}

@Injectable({ providedIn: 'root' })
export class WeekSetService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /**
   * The signed-in user's saved week sets, kept live via Firestore's stream.
   * `undefined` means "still loading" — distinct from an empty array, which
   * means "loaded, but you have no week sets".
   */
  readonly weekSets = toSignal(
    toObservable(this.auth.currentUser).pipe(
      switchMap((user) =>
        user
          ? collectionData(
              query(this.userWeekSets(user.uid), orderBy('createdAt', 'desc')),
              // Estimate pending server timestamps so a new week set doesn't
              // briefly sort to the bottom before the write commits.
              { idField: 'id', serverTimestamps: 'estimate' }
            )
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => WeekSet[] | undefined;

  async add(data: Omit<WeekSet, 'id' | 'createdAt'>): Promise<string> {
    const uid = this.auth.requireUid('add a week set');
    const ref = await addDoc(this.userWeekSets(uid), {
      ...data,
      days: sanitizeDays(data.days),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(
    id: string,
    data: Omit<WeekSet, 'id' | 'createdAt'>
  ): Promise<void> {
    const uid = this.auth.requireUid('edit a week set');
    await updateDoc(doc(this.firestore, 'users', uid, 'weekSets', id), {
      ...data,
      days: sanitizeDays(data.days),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.auth.requireUid('delete a week set');
    await deleteDoc(doc(this.firestore, 'users', uid, 'weekSets', id));
  }

  private userWeekSets(uid: string) {
    return collection(this.firestore, 'users', uid, 'weekSets');
  }
}

/** Total exercises across every day — the `/sets` card's second stat. */
export function weekSetItemCount(weekSet: WeekSet): number {
  return weekSet.days.reduce((total, day) => total + day.items.length, 0);
}
