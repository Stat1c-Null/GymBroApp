import { Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, startWith, switchMap } from 'rxjs';
import { SettingsService } from '../../../services/settings.service';
import { toDate } from '../../../services/firestore-utils';
import {
  WeightEntry,
  WeightService,
  weightChange,
  weightIn,
} from '../../../services/weight.service';

/** Same three-way state as the friend-week panel: loading / loaded / refused.
 *  See `FriendWeekComponent` for why a refused read can't be shown as "no data". */
type WeightState = WeightEntry[] | undefined | 'failed';

/**
 * A friend's recent body weight, embedded in the Friends page.
 *
 * Read-only, and windowed to the last handful of weigh-ins
 * (`WeightService.recentFor`) — enough to answer "what do they weigh, and which
 * way are they going?" without pulling a friend's entire history.
 *
 * Everything is rendered in the **viewer's** unit. `WeightEntry` stores both kg
 * and lbs, so that's picking a field, never converting.
 */
@Component({
  selector: 'app-friend-weight',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './friend-weight.html',
  styleUrl: './friend-weight.css',
})
export class FriendWeightComponent {
  private readonly weights = inject(WeightService);
  private readonly settings = inject(SettingsService);

  readonly uid = input.required<string>();
  /** Display name, for the panel heading. */
  readonly name = input('');

  protected readonly unit = this.settings.unit;

  private readonly state = toSignal<WeightState, WeightState>(
    toObservable(this.uid).pipe(
      switchMap((uid) =>
        this.weights.recentFor(uid).pipe(
          startWith(undefined),
          catchError((error: unknown) => {
            console.error('[friends] could not read a friend weight log', error);
            return of('failed' as const);
          })
        )
      )
    ),
    { initialValue: undefined }
  );

  protected readonly failed = computed(() => this.state() === 'failed');

  /** Newest first. `undefined` while loading (and when the read was refused,
   *  since the list is hidden entirely in that case). */
  protected readonly entries = computed(() => {
    const state = this.state();
    return state === 'failed' ? undefined : state;
  });

  protected readonly latest = computed(() => this.entries()?.[0] ?? null);

  /** Net change across the loaded window, or null if there's nothing to compare. */
  private readonly change = computed(() => {
    const entries = this.entries();
    return entries ? weightChange(entries, this.unit()) : null;
  });

  /**
   * The change as text, or null when there is no second weigh-in to compare
   * against. A computed rather than a template expression because "no change"
   * (`0`) and "can't tell" (`null`) must not collapse into one falsy case.
   */
  protected readonly changeLabel = computed(() => {
    const delta = this.change();
    if (delta === null) return null;
    if (delta === 0) return 'No change';
    // A real minus sign, not a hyphen — the direction is the point of this line.
    const sign = delta > 0 ? '+' : '−';
    return `${sign}${Math.abs(delta)} ${this.unit()}`;
  });

  /** The oldest weigh-in in the window — the change is measured *from* here, so
   *  the UI labels it with that date rather than implying a fixed period. */
  protected readonly since = computed(() => {
    const entries = this.entries();
    return entries && entries.length > 1
      ? toDate(entries[entries.length - 1].createdAt)
      : null;
  });

  protected shown(entry: WeightEntry): number {
    return weightIn(entry, this.unit());
  }

  protected dateOf(entry: WeightEntry): Date | null {
    return toDate(entry.createdAt);
  }
}
