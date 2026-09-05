import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimeRangeKey } from '../../../analytics/chart.types';
import { rangeStart } from '../../../analytics/time-series';
import { BreakdownRow, computeTotals } from '../../../analytics/totals';
import { AnalyticsCardComponent } from '../../../components/charts/analytics-card';
import { StatTileComponent } from '../../../components/charts/stat-tile';
import { displayDistance, formatDuration } from '../../../services/cardio';
import { ExerciseAnalyticsService } from '../../../services/exercise-analytics.service';
import { SettingsService } from '../../../services/settings.service';
import { WeekService } from '../../../services/week.service';
import { displayLifted } from '../../../services/weight.service';

/** Which rollup the breakdown table is showing. */
type BreakdownMode = 'exercise' | 'group';

/**
 * How much work has actually been done, over the page's selected window.
 *
 * The other two cards answer "how am I *trending*?"; this one answers "how much
 * have I *done*?" — total sets, reps and tonnage, total miles and time, and a
 * ranked breakdown of where that work went.
 *
 * All the arithmetic is pure in `analytics/totals.ts`. This component only
 * windows the entries, formats, and converts units — and it converts the
 * **sum**, never each addend: `convertWeight` rounds to one decimal, so a
 * per-entry round trip would compound that drift across thousands of entries.
 */
@Component({
  selector: 'app-training-totals',
  standalone: true,
  imports: [AnalyticsCardComponent, StatTileComponent, RouterLink],
  templateUrl: './training-totals.html',
  styleUrl: './training-totals.css',
})
export class TrainingTotalsComponent {
  private readonly svc = inject(ExerciseAnalyticsService);
  private readonly settings = inject(SettingsService);
  private readonly week = inject(WeekService);

  readonly range = input.required<TimeRangeKey>();

  protected readonly unit = this.settings.unit;
  protected readonly distanceUnit = this.settings.distanceUnit;

  /** Which rollup the table shows. A view toggle, not a second range — the
   *  window still comes from the page, so no two cards can disagree. */
  protected readonly mode = signal<BreakdownMode>('exercise');

  private readonly windowStart = computed(() =>
    rangeStart(this.range(), this.week.today().getTime())
  );

  /** Entries inside the selected window — the same filtering idiom the exercise
   *  card uses, since the query itself never applies a date filter. */
  private readonly windowed = computed(() => {
    const from = this.windowStart();
    return this.svc.totalsEntries().filter((e) => from == null || e.x >= from);
  });

  protected readonly totals = computed(() => computeTotals(this.windowed()));

  protected readonly state = computed<'loading' | 'empty' | 'ready'>(() => {
    if (!this.svc.loaded()) return 'loading';
    return this.windowed().length === 0 ? 'empty' : 'ready';
  });

  protected readonly rows = computed<BreakdownRow[]>(() =>
    this.mode() === 'exercise' ? this.totals().byExercise : this.totals().byGroup
  );

  // --- Strength tiles ---

  protected readonly trainingDaysText = computed(() =>
    count(this.totals().trainingDays)
  );
  protected readonly setsText = computed(() => count(this.totals().strength.sets));
  protected readonly repsText = computed(() => count(this.totals().strength.reps));

  /** Total tonnage in the reader's unit. Converted once, from the canonical sum. */
  protected readonly volumeText = computed(() =>
    this.weightText(this.totals().strength.volumeLbs)
  );

  // --- Cardio tiles ---

  protected readonly cardioSessionsText = computed(() =>
    count(this.totals().cardio.sessions)
  );

  protected readonly distanceText = computed(() => {
    const { cardio } = this.totals();
    if (cardio.sessions === 0) return '—';
    const shown = displayDistance(cardio.distanceMi, this.distanceUnit()) ?? 0;
    return round1(shown).toLocaleString();
  });

  protected readonly cardioTimeText = computed(() => {
    const { cardio } = this.totals();
    return cardio.sessions === 0 ? '—' : formatDuration(cardio.seconds);
  });

  /** A row's volume, formatted for the table. */
  protected rowVolume(row: BreakdownRow): string {
    return this.weightText(row.volumeLbs);
  }

  protected rowCount(value: number): string {
    return count(value);
  }

  /**
   * Canonical pounds in the reader's unit, grouped for readability.
   *
   * `null` stays `—`: a window with no weighted set has no tonnage, and `0 lbs`
   * would read as a measurement rather than an absence. The `lifted` pipe isn't
   * used here because it emits ungrouped digits — fine for `135 lbs`, unreadable
   * at `1234567.5 lbs`.
   */
  private weightText(lbs: number | null): string {
    if (lbs == null) return '—';
    return Math.round(displayLifted(lbs, this.unit()) ?? 0).toLocaleString();
  }
}

/** A count with thousands separators. */
function count(value: number): string {
  return value.toLocaleString();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
