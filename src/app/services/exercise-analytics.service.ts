import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collectionData,
  collectionGroup,
  query,
  where,
} from '@angular/fire/firestore';
import { of, switchMap } from 'rxjs';
import { startOfLocalDay } from '../analytics/time-series';
import { ExerciseSession } from '../analytics/exercise-metrics';
import { TotalsEntry } from '../analytics/totals';
import { AuthService } from './auth.service';
import { SettingsService } from './settings.service';
import {
  CARDIO_GROUP,
  UNASSIGNED_GROUP,
  Workout,
  WorkoutService,
  isOrphanGroup,
} from './workout.service';
import { WeekEntry, parseDateId } from './week.service';
import { toDate } from './firestore-utils';

/**
 * All of the signed-in user's logged sets, across every week, prepared for
 * exercise analytics.
 *
 * Unlike {@link WeekService}, which loads a single week's entries, this reads every
 * entry the user has ever logged via a Firestore **collection-group** query over the
 * `entries` sub-collections. That query is only possible because each entry carries
 * a denormalized `uid` (see WeekEntry / EntryBackfillService) — Firestore can't
 * scope a collection group to one user otherwise. It needs a collection-group index
 * on `entries.uid`; the first run surfaces a console link to create it.
 *
 * A service rather than page computeds so a future Dashboard could reuse the same
 * history stream. Weights stay in pounds (canonical); the page converts for display.
 */
@Injectable({ providedIn: 'root' })
export class ExerciseAnalyticsService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly settings = inject(SettingsService);
  private readonly workouts = inject(WorkoutService);

  /** The user's muscle-group list (their custom order, else the defaults). */
  readonly groups = this.settings.muscleGroups;

  /**
   * Every logged entry, live. `undefined` = still loading, `[]` = loaded but empty.
   * Not ordered in the query (that would force a composite index); callers sort by
   * the resolved date. `where('uid', …)` both scopes to the user and satisfies the
   * security rule that guards the collection-group read.
   */
  readonly entries = toSignal(
    toObservable(this.auth.currentUser).pipe(
      switchMap((user) =>
        user
          ? collectionData(
              query(collectionGroup(this.firestore, 'entries'), where('uid', '==', user.uid)),
              { idField: 'id' }
            )
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => WeekEntry[] | undefined;

  /** Whether the history stream has resolved at least once. */
  readonly loaded = computed(() => this.entries() !== undefined);

  /**
   * The exercises in `group`, folding any workout whose muscle group is no longer
   * in the user's list into {@link UNASSIGNED_GROUP} — the same rule the rest of the
   * app applies to orphaned groups.
   */
  exercisesInGroup(group: string): Workout[] {
    const all = this.workouts.workouts() ?? [];
    const known = new Set(this.groups());
    return all.filter((w) => {
      const effective = isOrphanGroup(w.muscleGroup, known) ? UNASSIGNED_GROUP : w.muscleGroup;
      return effective === group;
    });
  }

  /**
   * The logged sessions for the given workout ids, as plain {@link ExerciseSession}s
   * with the date resolved to epoch ms — ready for the pure metric functions.
   * Ascending by date. Entries without a resolvable date are dropped.
   */
  sessionsFor(ids: readonly string[]): ExerciseSession[] {
    const wanted = new Set(ids);
    const out: ExerciseSession[] = [];
    for (const e of this.entries() ?? []) {
      if (!wanted.has(e.workoutId)) continue;
      const x = this.entryX(e);
      if (x == null) continue;
      out.push({ workoutId: e.workoutId, label: e.workoutName, x, sets: e.sets ?? [] });
    }
    return out.sort((a, b) => a.x - b.x);
  }

  /**
   * Every logged entry flattened for totalling, ascending by date.
   *
   * Two things separate this from {@link sessionsFor}, and both are why totals
   * couldn't be built on that: it takes **no id list** (totals are about
   * everything), and it **keeps `cardio` and `muscleGroup`**, which that method
   * drops. Without the first there'd be no total tonnage, without the second no
   * total miles.
   *
   * Cardio-ness is decided here rather than in `analytics/totals.ts`: it is the
   * same `muscleGroup === CARDIO_GROUP && entry.cardio` predicate `entrySummary`
   * uses, and resolving it at this boundary keeps the pure module free of a
   * constant that lives in a Firestore-importing service.
   *
   * Entries without a resolvable date are dropped, as in `sessionsFor`.
   */
  totalsEntries(): TotalsEntry[] {
    const out: TotalsEntry[] = [];
    for (const e of this.entries() ?? []) {
      const x = this.entryX(e);
      if (x == null) continue;
      const isCardio = e.muscleGroup === CARDIO_GROUP && e.cardio != null;
      out.push({
        x,
        workoutId: e.workoutId,
        label: e.workoutName,
        muscleGroup: e.muscleGroup,
        sets: isCardio ? [] : e.sets ?? [],
        cardio: isCardio ? e.cardio : null,
      });
    }
    return out.sort((a, b) => a.x - b.x);
  }

  /**
   * Epoch ms at local midnight of an entry's logical date. Prefers the denormalized
   * `date`; falls back to the server timestamp for any entry the back-fill missed.
   */
  private entryX(e: WeekEntry): number | null {
    if (e.date) {
      const d = parseDateId(e.date);
      if (d) return startOfLocalDay(d.getTime());
    }
    const d = toDate(e.createdAt);
    return d ? startOfLocalDay(d.getTime()) : null;
  }
}
