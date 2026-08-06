import { Component, input, output } from '@angular/core';

/**
 * Prev / This week / Next controls for anything that shows one week at a time.
 *
 * Deliberately stateless — it holds no week and knows no service, it only emits.
 * That is what lets the Weeks page drive the shared `WeekService` with it while
 * an embedded friend's week drives its own private week signal from the same
 * three buttons.
 *
 * Its styles live here rather than in `styles.css` because they are the whole
 * component; only `.btn`/`.btn-secondary` come from the global sheet.
 */
@Component({
  selector: 'app-week-nav',
  standalone: true,
  template: `
    <button class="btn btn-secondary" (click)="previous.emit()" aria-label="Previous week">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Prev
    </button>
    @if (!isCurrentWeek()) {
      <button class="btn btn-secondary" (click)="thisWeek.emit()">This week</button>
    }
    <button class="btn btn-secondary" (click)="next.emit()" aria-label="Next week">
      Next
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .btn {
      padding: 8px 14px;
    }

    /* Embedded in a card (a friend's week) rather than a page header. */
    :host(.compact) {
      gap: 0.35rem;
    }

    :host(.compact) .btn {
      padding: 6px 10px;
      font-size: 0.8rem;
    }

    :host(.compact) svg {
      width: 14px;
      height: 14px;
    }

    /* Narrow screens: take a full row of the (now stacked) header and split it
       evenly, so all three buttons fit instead of overflowing. */
    @media (max-width: 768px) {
      :host {
        width: 100%;
      }

      .btn {
        flex: 1;
        padding: 8px 10px;
      }
    }
  `,
})
export class WeekNavComponent {
  /** Hides the "This week" shortcut when it would be a no-op. */
  readonly isCurrentWeek = input(false);

  readonly previous = output<void>();
  readonly next = output<void>();
  readonly thisWeek = output<void>();
}
