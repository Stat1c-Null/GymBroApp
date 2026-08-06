import { Component, computed, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SettingsService } from '../../services/settings.service';
import { entrySummary } from '../../services/entry-summary';
import { DAY_LABELS, WeekEntry, bucketByDay, toWeekId } from '../../services/week.service';

/** One day column's header data. */
interface DayColumn {
  index: number;
  label: string;
  date: Date;
  isToday: boolean;
}

/**
 * The seven-day grid of logged entries — the visual heart of the Weeks page,
 * factored out so a friend's week can be shown in the same shape.
 *
 * Purely presentational: it takes entries and a week start, and emits when a
 * day or an entry is acted on. It reads no week, subscribes to nothing, and
 * writes nothing — which is exactly why it can render *someone else's* week.
 * The one service it does inject is {@link SettingsService}, for the units to
 * render in; those are always the **viewer's**, never the logger's.
 *
 * Two knobs:
 * - `editable` — off by default. A friend's week is read-only, so the add /
 *   edit / delete affordances are absent rather than merely disabled.
 * - `compact` — a fixed-height, side-scrolling week strip for embedding in a
 *   card, instead of the full-height page grid.
 */
@Component({
  selector: 'app-week-grid',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './week-grid.html',
  styleUrl: './week-grid.css',
  host: {
    '[class.compact]': 'compact()',
  },
})
export class WeekGridComponent {
  private readonly settings = inject(SettingsService);

  /** `undefined` = still loading, which renders a spinner instead of the grid. */
  readonly entries = input<WeekEntry[] | undefined>(undefined);

  /** The Monday the week starts on. */
  readonly weekStart = input.required<Date>();

  /** Today, for highlighting its column. Passed in rather than read from
   *  `new Date()` so it can roll over at midnight — see `WeekService.today`. */
  readonly today = input<Date>(new Date());

  readonly editable = input(false);
  readonly compact = input(false);

  readonly add = output<number>();
  readonly edit = output<WeekEntry>();
  readonly remove = output<WeekEntry>();

  protected readonly days = computed<DayColumn[]>(() => {
    const start = this.weekStart();
    const todayId = toWeekId(this.today());
    return DAY_LABELS.map((label, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { index, label, date, isToday: toWeekId(date) === todayId };
    });
  });

  protected readonly entriesByDay = computed(() => bucketByDay(this.entries()));

  protected summaryOf(entry: WeekEntry): string {
    return entrySummary(entry, {
      weight: this.settings.unit(),
      distance: this.settings.distanceUnit(),
    });
  }
}
