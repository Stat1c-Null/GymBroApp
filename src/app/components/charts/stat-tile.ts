import { Component, input } from '@angular/core';

/** Whether a value is good news, bad news, or neither. Never inferred from sign —
 *  losing weight is good on a cut and bad on a bulk, so the caller decides. */
export type StatTone = 'neutral' | 'good' | 'bad';

/**
 * One headline number with a label. The reusable readout for every analytic.
 *
 * A toned tile always shows an arrow glyph and words alongside the colour — colour
 * is never the only channel carrying "ahead"/"behind".
 *
 * The value uses proportional figures on purpose: `tabular-nums` makes a large
 * standalone number look loose, and nothing here aligns vertically. Tabular figures
 * belong on axis ticks and table rows.
 */
@Component({
  selector: 'app-stat-tile',
  standalone: true,
  template: `
    <div class="tile">
      <span class="tile-label">{{ label() }}</span>
      <span class="tile-value" [class.good]="tone() === 'good'" [class.bad]="tone() === 'bad'">
        @if (tone() !== 'neutral') {
          <span class="tile-arrow" aria-hidden="true">{{ tone() === 'good' ? '↑' : '↓' }}</span>
        }
        {{ value() }}
        @if (unit()) {
          <span class="tile-unit">{{ unit() }}</span>
        }
      </span>
      @if (hint()) {
        <span class="tile-hint">{{ hint() }}</span>
      }
    </div>
  `,
  styles: [
    `
      /* Fill the grid track the host sits in: the grid stretches the host to the
         row's height, so the tile must fill the host — otherwise a tile with no
         hint (e.g. "Remaining") stops at its content and reads shorter than its
         rowmates. */
      :host {
        display: flex;
      }

      .tile {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        flex: 1;
        padding: 0.85rem 1rem;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        /* Let the tile shrink inside its grid track so a long value (e.g. the
           projected date) wraps within the box rather than spilling past it. */
        min-width: 0;
      }

      .tile-label {
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .tile-value {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 0.3rem;
        min-width: 0;
        font-size: 1.35rem;
        font-weight: 700;
        line-height: 1.25;
        color: var(--text-primary);
        overflow-wrap: anywhere;
      }

      .tile-value.good {
        color: var(--success);
      }
      .tile-value.bad {
        color: var(--error);
      }

      .tile-arrow {
        font-size: 1rem;
      }

      .tile-unit {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-muted);
      }

      .tile-hint {
        font-size: 0.75rem;
        color: var(--text-muted);
      }
    `,
  ],
})
export class StatTileComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly unit = input('');
  readonly tone = input<StatTone>('neutral');
  readonly hint = input('');
}
