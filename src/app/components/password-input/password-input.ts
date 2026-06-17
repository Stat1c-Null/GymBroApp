import { Component, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-password-input',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label class="form-label" [attr.for]="inputId()">{{ label() }}</label>
    <div class="password-wrapper">
      <input
        class="form-input"
        [id]="inputId()"
        [type]="show() ? 'text' : 'password'"
        [placeholder]="placeholder()"
        [attr.name]="name()"
        [attr.autocomplete]="autocomplete()"
        [ngModel]="value()"
        (ngModelChange)="value.set($event)"
        [ngModelOptions]="{ standalone: true }"
        required
      />
      <button
        type="button"
        class="password-toggle"
        (click)="show.set(!show())"
        [attr.aria-label]="show() ? 'Hide password' : 'Show password'"
      >
        @if (show()) {
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        } @else {
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        }
      </button>
    </div>
  `,
  styles: [`
    .password-wrapper {
      position: relative;
    }

    .password-wrapper .form-input {
      padding-right: 48px;
    }

    .password-toggle {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      width: 38px;
      height: 38px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color var(--transition-fast);
    }

    .password-toggle:hover {
      color: var(--primary);
    }
  `],
})
export class PasswordInputComponent {
  readonly label = input('Password');
  readonly inputId = input.required<string>();
  readonly placeholder = input('');
  readonly autocomplete = input('current-password');
  readonly name = input('password');
  readonly value = model('');
  protected readonly show = signal(false);
}
