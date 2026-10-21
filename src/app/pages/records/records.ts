import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  PersonalRecord,
  RECORD_META,
  computeRecords,
  searchRecords,
} from '../../analytics/records';
import { displayDistance, formatPace } from '../../services/cardio';
import { EntryBackfillService } from '../../services/entry-backfill.service';
import { ExerciseAnalyticsService } from '../../services/exercise-analytics.service';
import { SettingsService } from '../../services/settings.service';
import { WeekService, formatTime } from '../../services/week.service';
import { displayLifted } from '../../services/weight.service';

/** A record set this recently gets a "New" badge. */
const NEW_RECORD_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * The Records page: every exercise's personal bests, with one search box that
 * matches exercise names and muscle groups at the same time.
 *
 * All the maths and the matching are pure in `analytics/records.ts`; this
 * component only feeds it the history, formats units, and owns the query.
 * Records are derived from the logged history on every render rather than
 * stored, so they can never drift from the logs.
 *
 * Like Analytics and the Dashboard, it triggers the one-time back-fill — the
 * cross-week history query can't see entries logged before `uid`/`date` were
 * stamped onto them, and those may hold old records.
 */
@Component({
  selector: 'app-records',
  standalone: true,
  templateUrl: './records.html',
  styleUrl: './records.css',
})
export class RecordsComponent {
  private readonly svc = inject(ExerciseAnalyticsService);
  private readonly settings = inject(SettingsService);
  private readonly week = inject(WeekService);
  private readonly backfill = inject(EntryBackfillService);

  protected readonly unit = this.settings.unit;
  protected readonly meta = RECORD_META;

  /** The search text. One box — the search decides name vs. muscle group itself. */
  protected readonly query = signal('');

  private readonly records = computed(() => computeRecords(this.svc.totalsEntries()));

  protected readonly hits = computed(() => searchRecords(this.records(), this.query()));

  protected readonly state = computed<'loading' | 'empty' | 'ready'>(() => {
    if (!this.svc.loaded()) return 'loading';
    return this.records().length === 0 ? 'empty' : 'ready';
  });

  private readonly newSince = computed(
    () => this.week.today().getTime() - NEW_RECORD_DAYS * DAY_MS
  );

  /** How many records among the current results were set in the last week. */
  protected readonly newCount = computed(() =>
    this.hits().reduce(
      (n, h) => n + h.item.records.filter((r) => this.isNew(r)).length,
      0
    )
  );

  /** Re-runs until the data the back-fill's scan window needs has loaded. */
  private readonly ensureBackfill = effect(() => this.backfill.ensureBackfilled());

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /** Tapping a muscle-group chip searches that group. */
  protected searchGroup(group: string): void {
    this.query.set(group);
  }

  protected clear(): void {
    this.query.set('');
  }

  protected isNew(r: PersonalRecord): boolean {
    return r.x >= this.newSince();
  }

  /** The record's headline value, in the user's units. */
  protected valueText(r: PersonalRecord): string {
    switch (RECORD_META[r.kind].unit) {
      case 'weight': {
        const v = displayLifted(r.value, this.unit());
        return v == null ? '—' : `${v.toLocaleString()} ${this.unit()}`;
      }
      case 'reps':
        return `${r.value} reps`;
      case 'distance': {
        const unit = this.settings.distanceUnit();
        const v = displayDistance(r.value, unit);
        return v == null ? '—' : `${Math.round(v * 100) / 100} ${unit}`;
      }
      case 'time':
        return formatTime(r.value) || '—';
      case 'pace':
        // `value` is seconds per mile — the pace of a one-mile session.
        return formatPace(r.value, 1, this.settings.distanceUnit()) ?? '—';
    }
  }

  /** The set behind a per-set record, e.g. "5 × 225 lbs". */
  protected setText(r: PersonalRecord): string | null {
    const s = r.set;
    if (!s || s.reps == null || s.weight == null) return null;
    const w = displayLifted(s.weight, this.unit());
    return `${s.reps} × ${w} ${this.unit()}`;
  }

  protected dateText(x: number): string {
    return new Date(x).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
