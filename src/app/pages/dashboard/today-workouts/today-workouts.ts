import { Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AnalyticsCardComponent } from '../../../components/charts/analytics-card';
import { AuthService } from '../../../services/auth.service';
import { entrySummary } from '../../../services/entry-summary';
import { SettingsService } from '../../../services/settings.service';
import {
  WeekEntry,
  WeekService,
  formatDayId,
  mondayOf,
  toWeekId,
} from '../../../services/week.service';

/**
 * The Dashboard's "Today" card: what's been logged on today's date, read-only.
 *
 * Deliberately **not** `WeekService.entries`: that stream follows whichever week
 * the Weeks page last navigated to, so a user who browsed back three weeks would
 * see the wrong day here. This queries the week containing *today* directly, via
 * the same `entriesFor` path the Friends page uses, and rolls over at midnight
 * because it keys off `WeekService.today`.
 *
 * No add/edit/delete — logging stays on the Weeks page. The card links there.
 */
@Component({
  selector: 'app-today-workouts',
  standalone: true,
  imports: [AnalyticsCardComponent, RouterLink],
  templateUrl: './today-workouts.html',
  styleUrl: './today-workouts.css',
})
export class TodayWorkoutsComponent {
  private readonly auth = inject(AuthService);
  private readonly week = inject(WeekService);
  private readonly settings = inject(SettingsService);

  /** Mon = 0 … Sun = 6, matching {@link WeekEntry.day}. */
  private readonly todayIndex = computed(() => (this.week.today().getDay() + 6) % 7);

  private readonly thisWeekId = computed(() => toWeekId(mondayOf(this.week.today())));

  /** `undefined` = still loading, following the app's stream convention. */
  private readonly weekEntries = toSignal(
    combineLatest([
      toObservable(this.auth.currentUser),
      toObservable(this.thisWeekId).pipe(distinctUntilChanged()),
    ]).pipe(
      switchMap(([user, weekId]) =>
        user ? this.week.entriesFor(user.uid, weekId) : of(undefined)
      ),
      map((entries) => entries as WeekEntry[] | undefined)
    ),
    { initialValue: undefined }
  );

  protected readonly entries = computed(() => {
    const list = this.weekEntries();
    if (list === undefined) return undefined;
    const day = this.todayIndex();
    return list.filter((e) => e.day === day);
  });

  protected readonly state = computed<'loading' | 'empty' | 'ready'>(() => {
    const list = this.entries();
    if (list === undefined) return 'loading';
    return list.length === 0 ? 'empty' : 'ready';
  });

  /** e.g. "Saturday, Oct 10". */
  protected readonly dateLabel = computed(() =>
    this.week.today().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  );

  /** Make sure "Open week" lands on this week, not whichever one was last viewed. */
  protected openWeek(): void {
    this.week.goToThisWeek();
  }

  protected summaryOf(entry: WeekEntry): string {
    return entrySummary(entry, {
      weight: this.settings.unit(),
      distance: this.settings.distanceUnit(),
    });
  }

  /** "Noted Jun 16" for a carried note — same rule as the week grid's. */
  protected noteOrigin(entry: WeekEntry): string {
    const created = entry.noteCreatedAt;
    if (!created || created === entry.date) return '';
    return formatDayId(created, this.week.today());
  }
}
