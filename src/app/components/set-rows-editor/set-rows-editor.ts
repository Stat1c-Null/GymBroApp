import { Component, computed, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { SetRow, MAX_SETS } from '../../services/set-rows';
import { BodyWeightPromptComponent } from '../body-weight-prompt/body-weight-prompt';

/**
 * "How was this exercise done" — the set-count field, the time-tracking toggle
 * and the per-set reps/weight/time rows.
 *
 * Purely presentational, and deliberately so: it renders {@link SetRow} objects
 * the caller owns and lets `ngModel` mutate them **in place**, exactly as the
 * Weeks modal always did. All the arithmetic — seeding rows, growing the pool,
 * and the canonical-weight round-trip guard — is pure and lives in
 * `services/set-rows.ts`. This component only knows how to draw rows.
 *
 * Two callers, and the difference between them is one input:
 * - the Weeks page's add/edit modal, **logging** a session;
 * - the set builder on `/sets`, writing down a **plan** (`template` mode).
 *
 * In `template` mode a body-weight exercise shows no weight at all — a set is
 * reused week after week, and whatever the user weighed the day they wrote it
 * down is not what they'll weigh when they use it. `entriesFromSet` fills the
 * weight in at apply time instead. That is also why the "log a weigh-in now"
 * prompt is suppressed there: nothing is being logged yet, so there is no dead
 * end to rescue the user from.
 */
@Component({
  selector: 'app-set-rows-editor',
  standalone: true,
  imports: [FormsModule, BodyWeightPromptComponent],
  templateUrl: './set-rows-editor.html',
  styleUrl: './set-rows-editor.css',
})
export class SetRowsEditorComponent {
  private readonly settings = inject(SettingsService);

  /** The visible rows. Mutated in place by the row inputs — see the class doc. */
  readonly rows = input.required<SetRow[]>();

  /** Per-exercise time tracking. Two-way: the toggle lives in here, but the
   *  value is saved by the caller (`WeekEntry.trackTime` / `SetItem.trackTime`). */
  readonly trackTime = model(false);

  /** Whether the selected exercise is loaded by the user's own body weight. */
  readonly bodyWeight = input(false);

  /** The latest weigh-in in the user's unit, for the hint line and the
   *  read-only weight cells. `null` when nothing has been logged. */
  readonly bodyWeightDisplay = input<number | null>(null);

  /** Planning a reusable set rather than logging a session — see the class doc. */
  readonly template = input(false);

  /**
   * Unique prefix for this editor's `id`/`name` attributes. The set builder
   * renders one editor per exercise inside a single `<form>`, where duplicate
   * control names would collide in Angular's form registration.
   */
  readonly idPrefix = input('sets');

  /** Raw input from the "Number of sets" field — the caller clamps it and
   *  grows/slices its own row pool (`clampSetCount` / `growPool`). */
  readonly countChange = output<number | null>();

  protected readonly unit = this.settings.unit;
  protected readonly maxSets = MAX_SETS;

  /** Body-weight rows carry a real (read-only) weight when logging, and none at
   *  all when planning a set. */
  protected readonly showStaticWeight = computed(
    () => this.bodyWeight() && !this.template()
  );

  protected toggleTrackTime(): void {
    this.trackTime.update((v) => !v);
  }
}
