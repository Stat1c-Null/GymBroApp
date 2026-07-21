import { Injectable, computed, inject, signal } from '@angular/core';
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
import { combineLatest, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { MuscleGroup } from './workout.service';

/** Day-of-week labels, Monday-first to match weekId (week starts Monday). */
export const DAY_LABELS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

export interface WorkoutSet {
  reps: number | null;
  weight: number | null;
  time?: number | null; // duration in seconds (optional; older entries lack it)
}

/** "m:ss" (or bare seconds) → total seconds; null for blank/invalid input. */
export function parseTime(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length === 1) {
    const secs = Number(parts[0]);
    return Number.isFinite(secs) && secs >= 0 ? Math.floor(secs) : null;
  }
  const mins = Number(parts[0]);
  const secs = Number(parts[1]);
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || mins < 0 || secs < 0) {
    return null;
  }
  return Math.floor(mins) * 60 + Math.floor(secs);
}

/** Total seconds → "m:ss" (seconds zero-padded); "" for null. */
export function formatTime(seconds: number | null): string {
  if (seconds == null) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export interface WeekEntry {
  id?: string;
  day: number; // 0 = Mon … 6 = Sun
  workoutId: string; // ref into the library
  workoutName: string; // denormalized (survives library rename/delete)
  muscleGroup: MuscleGroup; // denormalized
  trackTime?: boolean; // per-entry time-per-set tracking (older entries lack it)
  sets: WorkoutSet[]; // length = number of sets
  createdAt?: unknown; // Firestore serverTimestamp → newest on top
  /** Owner uid, denormalized so the cross-week analytics collection-group query
   *  can scope to one user. Set by the service on every write; absent on entries
   *  logged before the analytics feature (back-filled by EntryBackfillService). */
  uid?: string;
  /** Logical local day id ('YYYY-MM-DD') = this week's Monday + `day`. Set by the
   *  service; gives analytics a stable date without unwrapping the serverTimestamp. */
  date?: string;
}

/** The Monday (local, midnight) of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  const back = (d.getDay() + 6) % 7; // Sun(0)→6, Mon(1)→0, … Sat(6)→5
  d.setDate(d.getDate() - back);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local `YYYY-MM-DD` (NOT toISOString — that would UTC-shift the day). */
export function toWeekId(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Inverse of {@link toWeekId}: a local `YYYY-MM-DD` day id back to a Date at local
 * midnight. Built from parts rather than `new Date(id)`, which parses a bare
 * `YYYY-MM-DD` as UTC and can land on the previous day west of Greenwich.
 *
 * Despite the `toWeekId` name, the pair is a general local-day-id codec — the
 * weight goal stores its start/target dates with it too.
 */
export function parseDateId(id: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  date.setHours(0, 0, 0, 0);
  // Rejects impossible days (e.g. 2026-02-31, which would roll into March).
  return date.getMonth() === Number(m) - 1 && date.getDate() === Number(d)
    ? date
    : null;
}

/**
 * The logical local day id ('YYYY-MM-DD') of an entry: `day` days after the week's
 * Monday. Lets analytics place a logged set on a timeline without unwrapping its
 * pending serverTimestamp. `day` 0 = Monday, matching {@link WeekEntry.day}.
 */
export function entryDate(weekId: string, day: number): string {
  const monday = parseDateId(weekId);
  if (!monday) return weekId; // malformed weekId — fall back to the week start
  const d = new Date(monday);
  d.setDate(d.getDate() + day);
  return toWeekId(d);
}

@Injectable({ providedIn: 'root' })
export class WeekService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);

  /** Monday of the week currently being viewed. */
  readonly currentWeekStart = signal<Date>(mondayOf(new Date()));
  readonly weekId = computed(() => toWeekId(this.currentWeekStart()));

  /**
   * The current local date, refreshed when the tab regains visibility and on a
   * one-minute timer. `new Date()` inside a computed would never re-run on its
   * own, so a session left open across midnight (common on phones) would keep
   * highlighting the wrong day and mis-report "this week" — this signal is the
   * dependency that lets those computeds roll over.
   */
  readonly today = signal(new Date());

  readonly isCurrentWeek = computed(
    () => this.weekId() === toWeekId(mondayOf(this.today()))
  );

  constructor() {
    const refreshIfDayChanged = (): void => {
      const now = new Date();
      if (toWeekId(now) !== toWeekId(this.today())) this.today.set(now);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshIfDayChanged();
      });
    }
    if (typeof setInterval === 'function') {
      setInterval(refreshIfDayChanged, 60_000);
    }
  }

  /** e.g. "Jun 16 – Jun 22, 2026". */
  readonly rangeLabel = computed(() => {
    const start = this.currentWeekStart();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const startStr = start.toLocaleDateString('en-US', opts);
    const endStr = end.toLocaleDateString('en-US', opts);
    return `${startStr} – ${endStr}, ${end.getFullYear()}`;
  });

  /**
   * Entries for the currently-viewed week only. Re-subscribes when the week or
   * user changes, so previous weeks are loaded on demand — never all at once.
   * `undefined` = still loading (distinct from an empty week).
   */
  readonly entries = toSignal(
    combineLatest([
      toObservable(this.auth.currentUser),
      toObservable(this.weekId),
    ]).pipe(
      switchMap(([user, weekId]) =>
        user
          ? collectionData(
              query(
                this.weekEntries(user.uid, weekId),
                orderBy('createdAt', 'desc')
              ),
              // 'estimate' fills a just-added doc's pending server timestamp
              // with a local estimate instead of null, so it sorts to the top
              // immediately rather than jumping into place when the write lands.
              { idField: 'id', serverTimestamps: 'estimate' }
            )
          : of(undefined)
      )
    ),
    { initialValue: undefined }
  ) as () => WeekEntry[] | undefined;

  previousWeek(): void {
    this.shiftWeeks(-1);
  }

  nextWeek(): void {
    this.shiftWeeks(1);
  }

  goToThisWeek(): void {
    this.currentWeekStart.set(mondayOf(new Date()));
  }

  async add(data: Omit<WeekEntry, 'id' | 'createdAt'>): Promise<void> {
    const uid = this.requireUid();
    await addDoc(this.weekEntries(uid, this.weekId()), {
      ...data,
      uid,
      date: entryDate(this.weekId(), data.day),
      createdAt: serverTimestamp(),
    });
  }

  async update(
    id: string,
    data: Omit<WeekEntry, 'id' | 'createdAt'>
  ): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(this.entryDoc(uid, this.weekId(), id), {
      ...data,
      uid,
      date: entryDate(this.weekId(), data.day),
    });
  }

  async remove(id: string): Promise<void> {
    const uid = this.requireUid();
    await deleteDoc(this.entryDoc(uid, this.weekId(), id));
  }

  private shiftWeeks(delta: number): void {
    const next = new Date(this.currentWeekStart());
    next.setDate(next.getDate() + delta * 7);
    this.currentWeekStart.set(mondayOf(next));
  }

  private requireUid(): string {
    return this.auth.requireUid('log workouts');
  }

  private weekEntries(uid: string, weekId: string) {
    return collection(this.firestore, 'users', uid, 'weeks', weekId, 'entries');
  }

  private entryDoc(uid: string, weekId: string, id: string) {
    return doc(this.firestore, 'users', uid, 'weeks', weekId, 'entries', id);
  }
}
