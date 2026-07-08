import { Component, input, output } from '@angular/core';

/**
 * The app's standard centered modal: a dimmed overlay that closes on backdrop
 * click or the corner ✕, with an optional heading. Page content goes in the
 * projected slot. `.modal-overlay` / `.modal-content` / `.modal-header` styles
 * are global (styles.css).
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    <div class="modal-overlay" [class.visible]="open()" (click)="close.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <button class="modal-close" (click)="close.emit()" aria-label="Close modal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        @if (title()) {
          <div class="modal-header">
            <h2>{{ title() }}</h2>
          </div>
        }

        <ng-content />
      </div>
    </div>
  `,
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly close = output<void>();
}
