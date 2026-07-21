import { Injectable, inject } from '@angular/core';
import { Firestore, collection, getDocs, writeBatch } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { toDate } from './firestore-utils';
import { WeightService } from './weight.service';
import { WorkoutService } from './workout.service';
import { WeekEntry, entryDate, mondayOf, toWeekId } from './week.service';

/** Firestore caps a batch at 500 writes; stay under it. */
const BATCH_LIMIT = 400;
/** How far back to scan if the account has no earlier signal — generous, one-time. */
const FLOOR_MONTHS = 24;

export interface BackfillResult {
  /** Entries that gained `uid`/`date`. */
  stamped: number;
  /** Entries already carrying both — left untouched. */
  skipped: number;
}

/**
 * One-time migration that stamps `uid` and `date` onto logged entries written
 * before the analytics feature existed.
 *
 * Why it's needed: {@link ExerciseAnalyticsService} reads history with a
 * collection-group query filtered by `uid`, so any entry missing `uid` is invisible
 * to analytics. New writes stamp both fields (see WeekService); this back-fills the
 * old ones.
 *
 * How it stays safe:
 * - **Additive** — each write sets only `uid` and `date` via `batch.update`, so
 *   `sets`, `workoutName`, `createdAt` and everything else are left exactly as-is.
 * - **Idempotent** — entries that already have both fields are skipped, so a re-run
 *   is harmless (and a re-run is how an interrupted pass finishes).
 *
 * It finds entries by walking weekIds deterministically (Monday → Monday), which
 * sidesteps Firestore's "phantom parent" problem: a `weeks/{weekId}` document may
 * not exist even when its `entries` sub-collection does, so the parent can't be listed.
 */
@Injectable({ providedIn: 'root' })
export class EntryBackfillService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  private readonly workouts = inject(WorkoutService);
  private readonly weights = inject(WeightService);

  async backfillEntries(): Promise<BackfillResult> {
    const uid = this.auth.requireUid('back-fill your analytics data');
    const weekIds = this.weekIdsToScan();

    // Read every week's entries in parallel — a one-time burst of small reads.
    const weeks = await Promise.all(
      weekIds.map(async (weekId) => ({
        weekId,
        snap: await getDocs(
          collection(this.firestore, 'users', uid, 'weeks', weekId, 'entries')
        ),
      }))
    );

    let stamped = 0;
    let skipped = 0;
    let batch = writeBatch(this.firestore);
    let pending = 0;

    for (const { weekId, snap } of weeks) {
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as WeekEntry;
        if (data.uid && data.date) {
          skipped++;
          continue;
        }
        batch.update(docSnap.ref, { uid, date: entryDate(weekId, data.day ?? 0) });
        stamped++;
        pending++;
        if (pending >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(this.firestore);
          pending = 0;
        }
      }
    }
    if (pending > 0) await batch.commit();

    return { stamped, skipped };
  }

  /**
   * The list of weekIds (Mondays) to scan: from the earliest signal of account
   * activity — or {@link FLOOR_MONTHS} back, whichever is earlier — through two
   * weeks past today (to catch anything logged into a future-navigated week).
   */
  private weekIdsToScan(): string[] {
    const floor = new Date();
    floor.setMonth(floor.getMonth() - FLOOR_MONTHS);
    let earliest = floor.getTime();
    for (const row of [...(this.workouts.workouts() ?? []), ...(this.weights.weights() ?? [])]) {
      const d = toDate((row as { createdAt?: unknown }).createdAt);
      if (d && d.getTime() < earliest) earliest = d.getTime();
    }

    const end = mondayOf(new Date());
    end.setDate(end.getDate() + 14);

    const ids: string[] = [];
    for (const m = mondayOf(new Date(earliest)); m <= end; m.setDate(m.getDate() + 7)) {
      ids.push(toWeekId(m));
    }
    return ids;
  }
}
