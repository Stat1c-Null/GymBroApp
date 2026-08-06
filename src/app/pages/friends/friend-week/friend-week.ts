import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, of, startWith, switchMap } from 'rxjs';
import { WeekGridComponent } from '../../../components/week-grid/week-grid';
import { WeekNavComponent } from '../../../components/week-nav/week-nav';
import {
  WeekEntry,
  WeekService,
  mondayOf,
  toWeekId,
  weekRangeLabel,
} from '../../../services/week.service';

/**
 * What the friend's week query currently is. `undefined` = loading and `[]` = an
 * empty week, the app's usual convention; `'failed'` is the third case this view
 * has and the Weeks page does not — reading *someone else's* week can be refused
 * by Firestore rules, and "we couldn't look" must not be shown as "they did
 * nothing this week".
 */
type WeekState = WeekEntry[] | undefined | 'failed';

/**
 * One friend's week, embedded in the Friends page — the read-only twin of the
 * Weeks page, sharing its grid and its navigation components.
 *
 * It keeps its **own** week cursor rather than driving `WeekService`'s: scrolling
 * back through a friend's month must not quietly move the week the user sees on
 * their own Weeks page. Only the shared `today` clock is borrowed, so the
 * "today" highlight still rolls over at midnight.
 */
@Component({
  selector: 'app-friend-week',
  standalone: true,
  imports: [WeekGridComponent, WeekNavComponent],
  templateUrl: './friend-week.html',
  styleUrl: './friend-week.css',
})
export class FriendWeekComponent {
  private readonly weeks = inject(WeekService);

  readonly uid = input.required<string>();
  /** Display name, for the panel heading. */
  readonly name = input('');

  protected readonly today = this.weeks.today;

  /** This panel's own week, seeded from the shared clock so it opens on the
   *  same "this week" the rest of the app means. */
  private readonly cursor = signal(mondayOf(this.today()));
  protected readonly weekStart = this.cursor.asReadonly();
  private readonly weekId = computed(() => toWeekId(this.weekStart()));
  protected readonly rangeLabel = computed(() => weekRangeLabel(this.weekStart()));
  protected readonly isCurrentWeek = computed(
    () => this.weekId() === toWeekId(mondayOf(this.today()))
  );

  private readonly state = toSignal<WeekState, WeekState>(
    combineLatest([toObservable(this.uid), toObservable(this.weekId)]).pipe(
      switchMap(([uid, weekId]) =>
        this.weeks.entriesFor(uid, weekId).pipe(
          // Back to the spinner while the newly-selected week loads, instead of
          // leaving the previous week's entries on screen under the new dates.
          startWith(undefined),
          catchError((error: unknown) => {
            console.error('[friends] could not read a friend week', error);
            return of('failed' as const);
          })
        )
      )
    ),
    { initialValue: undefined }
  );

  protected readonly failed = computed(() => this.state() === 'failed');

  /** Entries for the grid — `undefined` (loading) stands in for a failed read
   *  too, since the grid is hidden entirely in that case. */
  protected readonly entries = computed(() => {
    const state = this.state();
    return state === 'failed' ? undefined : state;
  });

  protected previousWeek(): void {
    this.shiftWeeks(-1);
  }

  protected nextWeek(): void {
    this.shiftWeeks(1);
  }

  protected goToThisWeek(): void {
    this.cursor.set(mondayOf(this.today()));
  }

  private shiftWeeks(delta: number): void {
    const next = new Date(this.weekStart());
    next.setDate(next.getDate() + delta * 7);
    this.cursor.set(mondayOf(next));
  }
}
