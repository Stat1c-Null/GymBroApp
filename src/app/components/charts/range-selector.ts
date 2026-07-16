import { Component, model } from '@angular/core';
import { TIME_RANGES, TimeRangeKey } from '../../analytics/chart.types';

/**
 * The shared time-window control for the Analytics page.
 *
 * Belongs in one row above everything it scopes, never inside a chart card — every
 * card must render against the same slice or the page starts contradicting itself.
 */
@Component({
  selector: 'app-range-selector',
  standalone: true,
  template: `
    <div class="segmented" role="group" aria-label="Time range">
      @for (r of ranges; track r.key) {
        <button
          type="button"
          [class.active]="range() === r.key"
          [attr.aria-pressed]="range() === r.key"
          (click)="range.set(r.key)"
        >
          {{ r.label }}
        </button>
      }
    </div>
  `,
})
export class RangeSelectorComponent {
  readonly range = model<TimeRangeKey>('90d');
  protected readonly ranges = TIME_RANGES;
}
