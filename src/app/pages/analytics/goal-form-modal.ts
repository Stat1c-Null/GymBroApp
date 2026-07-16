import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../components/modal/modal';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { WeightAnalyticsService } from '../../services/weight-analytics.service';
import { convertWeight, displayLifted, liftedToCanonical } from '../../services/weight.service';
import { parseDateId, toWeekId } from '../../services/week.service';

/**
 * Sets the body-weight goal that gives the burndown something to burn down toward.
 *
 * Lives on the Analytics page rather than in Settings: it's analytics-specific, it
 * needs the chart for context, and the no-goal empty state opens this same modal, so
 * there's one path in. Persistence still goes through `SettingsService` — where the
 * editor lives and where the data lives are independent choices.
 *
 * Weights are entered in the user's unit and stored in both, matching `WeightEntry`.
 */
@Component({
  selector: 'app-goal-form-modal',
  standalone: true,
  imports: [FormsModule, ModalComponent],
  template: `
    <app-modal [open]="open()" title="Set your weight goal" (close)="close.emit()">
      @if (error()) {
        <div class="auth-error">{{ error() }}</div>
      }

      <form (ngSubmit)="onSubmit()">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="goal-start">Starting weight ({{ unit() }})</label>
            <input class="form-input" id="goal-start" type="number" step="0.1" min="1"
              [(ngModel)]="startWeight" name="startWeight" />
          </div>
          <div class="form-group">
            <label class="form-label" for="goal-start-date">Started on</label>
            <input class="form-input" id="goal-start-date" type="date"
              [(ngModel)]="startDate" name="startDate" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="goal-target">Target weight ({{ unit() }})</label>
            <input class="form-input" id="goal-target" type="number" step="0.1" min="1"
              [(ngModel)]="targetWeight" name="targetWeight" />
          </div>
          <div class="form-group">
            <label class="form-label" for="goal-target-date">Target date</label>
            <input class="form-input" id="goal-target-date" type="date"
              [(ngModel)]="targetDate" name="targetDate" />
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-full mt-2" [disabled]="saving()">
          @if (saving()) {
            <span class="spinner"></span>
            Saving...
          } @else {
            Save goal
          }
        </button>

        @if (hasGoal()) {
          <button type="button" class="btn btn-ghost btn-full mt-1" [disabled]="saving()"
            (click)="onClear()">
            Remove goal
          </button>
        }
      </form>
    </app-modal>
  `,
})
export class GoalFormModalComponent {
  private readonly settings = inject(SettingsService);
  private readonly analytics = inject(WeightAnalyticsService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly close = output<void>();

  protected readonly unit = this.settings.unit;
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly hasGoal = computed(() => this.settings.weightGoal() != null);

  protected startWeight: number | null = null;
  protected targetWeight: number | null = null;
  protected startDate = '';
  protected targetDate = '';

  constructor() {
    // Re-seed on each closed→open transition, mirroring WorkoutFormModalComponent,
    // so the form reflects the current goal without clobbering in-progress typing.
    let prevOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !prevOpen) this.initForm();
      prevOpen = isOpen;
    });
  }

  private initForm(): void {
    const unit = this.unit();
    const goal = this.settings.weightGoal();

    if (goal) {
      this.startWeight = displayLifted(goal.startLbs, unit);
      this.targetWeight = displayLifted(goal.targetLbs, unit);
      this.startDate = goal.startDate;
      this.targetDate = goal.targetDate;
    } else {
      // Default the start to where they are now — the common case is "from today".
      this.startWeight = displayLifted(this.analytics.latestLbs(), unit);
      this.targetWeight = null;
      this.startDate = toWeekId(this.analytics.today());
      this.targetDate = '';
    }
    this.error.set('');
  }

  protected async onSubmit(): Promise<void> {
    const message = this.validate();
    if (message) {
      this.error.set(message);
      return;
    }

    const unit = this.unit();
    const startLbs = liftedToCanonical(this.startWeight as number, unit);
    const targetLbs = liftedToCanonical(this.targetWeight as number, unit);

    this.saving.set(true);
    this.error.set('');
    try {
      await this.settings.setWeightGoal({
        startLbs,
        startKg: convertWeight(startLbs, 'lbs'),
        startDate: this.startDate,
        targetLbs,
        targetKg: convertWeight(targetLbs, 'lbs'),
        targetDate: this.targetDate,
      });
      this.toast.show('Goal saved!', 'success');
      this.close.emit();
    } catch {
      this.error.set('Could not save your goal. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  /** The first problem with the form, or `null` if it's good to save. */
  private validate(): string | null {
    if (this.startWeight == null || this.startWeight <= 0) {
      return 'Enter your starting weight.';
    }
    if (this.targetWeight == null || this.targetWeight <= 0) {
      return 'Enter your target weight.';
    }
    if (this.startWeight === this.targetWeight) {
      // A zero-length goal has no direction, so every pace and projection would be
      // a division by zero. Reject it here rather than defend against it downstream.
      return 'Your target should differ from your starting weight.';
    }
    const start = parseDateId(this.startDate);
    const target = parseDateId(this.targetDate);
    if (!start) return 'Pick the date you started.';
    if (!target) return 'Pick a target date.';
    if (target <= start) return 'Your target date must be after your start date.';
    return null;
  }

  protected async onClear(): Promise<void> {
    this.saving.set(true);
    try {
      await this.settings.clearWeightGoal();
      this.toast.show('Goal removed', 'success');
      this.close.emit();
    } catch {
      this.error.set('Could not remove your goal. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
