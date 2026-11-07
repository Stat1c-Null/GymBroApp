import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { WeightService, convertWeight } from '../../services/weight.service';

/**
 * The "you have no body weight logged yet" empty state, with a one-field form
 * to fix it on the spot.
 *
 * Body-weight exercises fill every set from the newest weigh-in, so a user with
 * an empty weight log hits a dead end mid-flow — either creating a body-weight
 * workout or logging one on the Weeks page. A link to `/weights` would abandon
 * the form they're standing in (the create-workout modal is layered *over* the
 * add-to-week modal, with unsaved sets underneath), so the fix belongs here.
 *
 * Renders **nothing** unless it's needed: hidden while the log is still loading,
 * and gone the moment anything is in it. Callers drop it in place without
 * gating it themselves. Once a weight lands, the live Firestore stream carries
 * it the rest of the way — `WeeksComponent`'s re-seed effect fills the open set
 * rows with no wiring between the two.
 *
 * It asks for one number in the user's chosen unit rather than reusing the
 * Weights page's kg-*and*-lbs pair: this is a detour, not the weight log. Both
 * units are still stored — see `WeightEntry`.
 *
 * `ngModelOptions: standalone` and the Enter handler both exist because this
 * sits *inside* someone else's `<form>`: without them the field would register
 * as a control of that form, and Enter would submit it.
 */
@Component({
  selector: 'app-body-weight-prompt',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (needed()) {
      <div class="bw-prompt">
        <p class="bw-copy">
          No body weight logged yet — add it here and body-weight exercises fill
          their sets in automatically.
        </p>
        <div class="bw-row">
          <input
            class="form-input"
            type="number"
            min="0"
            step="0.1"
            [placeholder]="unit()"
            aria-label="Body weight"
            [ngModel]="value()"
            (ngModelChange)="value.set($event)"
            [ngModelOptions]="{ standalone: true }"
            (keydown.enter)="onEnter($event)"
          />
          <button type="button" class="btn btn-primary" (click)="log()" [disabled]="saving()">
            @if (saving()) {
              <span class="spinner"></span>
              Saving...
            } @else {
              Log weight
            }
          </button>
        </div>
        @if (error()) {
          <p class="bw-error">{{ error() }}</p>
        }
      </div>
    }
  `,
  styles: [
    `
      .bw-prompt {
        padding: 14px 16px;
        margin-bottom: 1rem;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
      }

      .bw-copy {
        font-size: 0.82rem;
        color: var(--text-muted);
        margin-bottom: 0.6rem;
      }

      .bw-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }

      .bw-row .form-input {
        flex: 1;
        padding: 10px 12px;
      }

      .bw-row .btn {
        flex-shrink: 0;
      }

      .bw-error {
        margin-top: 0.5rem;
        font-size: 0.8rem;
        color: var(--error);
      }
    `,
  ],
})
export class BodyWeightPromptComponent {
  private readonly weights = inject(WeightService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly unit = this.settings.unit;

  /** Nothing to prompt for while the log is still loading (`undefined`), or
   *  once it holds anything at all. */
  protected readonly needed = computed(() => this.weights.weights()?.length === 0);

  protected readonly value = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  /** Enter logs the weight instead of submitting the surrounding form — which
   *  would otherwise create the workout / save the week entry from here. */
  protected onEnter(event: Event): void {
    event.preventDefault();
    void this.log();
  }

  protected async log(): Promise<void> {
    const entered = this.value();
    if (entered == null || entered <= 0) {
      this.error.set('Enter a weight greater than zero.');
      return;
    }

    // Derive the other unit rather than asking twice: every entry stores both,
    // so either can be read back without a conversion (and its rounding).
    const unit = this.unit();
    const kg = unit === 'kg' ? entered : convertWeight(entered, 'lbs');
    const lbs = unit === 'lbs' ? entered : convertWeight(entered, 'kg');

    this.saving.set(true);
    this.error.set('');
    try {
      await this.weights.add({ kg, lbs });
      this.toast.show('Weight logged!', 'success');
      // The live stream removes this prompt; clearing keeps it from flashing
      // the old number if the user logs again later in the same session.
      this.value.set(null);
    } catch {
      this.error.set('Could not save your weight. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
