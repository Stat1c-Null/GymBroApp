import { Component, computed, inject, signal } from '@angular/core';
import { LiftedWeightPipe } from '../../components/lifted-weight-pipe';
import { ExerciseAnalyticsService } from '../../services/exercise-analytics.service';
import { SettingsService } from '../../services/settings.service';
import { displayDistance, formatDuration } from '../../services/cardio';
import {
  hasAnyRecord,
  personalRecords,
  searchRecords,
} from '../../analytics/personal-records';

/**
 * Personal records — the best set, est. 1RM, rep count and day's volume for every
 * exercise ever logged (distance and duration for cardio), with one search box that
 * matches exercise name and muscle group at the same time.
 *
 * Records are computed from the full logged history the Analytics page already
 * streams; nothing is stored. See `analytics/personal-records.ts`.
 */
@Component({
  selector: 'app-records',
  standalone: true,
  imports: [LiftedWeightPipe],
  templateUrl: './records.html',
  styleUrl: './records.css',
})
export class RecordsComponent {
  private readonly history = inject(ExerciseAnalyticsService);
  private readonly settings = inject(SettingsService);

  protected readonly unit = this.settings.unit;
  protected readonly distanceUnit = this.settings.distanceUnit;
  protected readonly loaded = this.history.loaded;

  protected readonly query = signal('');
  /** Est. 1RM and volume are derived values — whole pounds is precise enough. */
  protected readonly round = Math.round;

  /** Every exercise with at least one record, most recently trained first. */
  protected readonly records = computed(() => {
    // Read entries() so this recomputes when the history stream emits.
    if (this.history.entries() === undefined) return [];
    return personalRecords(this.history.totalsEntries()).filter(hasAnyRecord);
  });

  protected readonly results = computed(() => searchRecords(this.records(), this.query()));

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.query.set('');
  }

  protected formatDate(x: number): string {
    return new Date(x).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  protected distance(mi: number): string {
    return `${displayDistance(mi, this.distanceUnit())} ${this.distanceUnit()}`;
  }

  protected duration(seconds: number): string {
    return formatDuration(seconds);
  }
}
