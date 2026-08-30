import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { Workout } from '../../services/workout.service';
import {
  SetItem,
  WorkoutSet,
  WorkoutSetService,
} from '../../services/workout-set.service';
import { ModalComponent } from '../modal/modal';
import { WorkoutFormModalComponent } from '../workout-form-modal/workout-form-modal';
import { SetItemEditorComponent } from './set-item-editor';
import {
  BuilderItem,
  blankItem,
  builderItemFrom,
  selectWorkout,
  toSetItem,
} from './builder-item';

/**
 * Create or edit a saved set: a name, an optional description, and an ordered
 * list of exercises with the reps, weight and notes they're meant to be done at.
 *
 * Driven purely by inputs, like `WorkoutFormModalComponent` — pass
 * `editingSet` to edit one, or `presetItems` to open the builder already filled
 * in (that's the "save this day as a set" flow on the Weeks page). Emits
 * `saved` and `close`.
 *
 * Each exercise block is a `SetItemEditorComponent`, and the per-set rows
 * inside it are the same component the Weeks logging modal uses — so a set is
 * written down in exactly the form it will later be logged in.
 */
@Component({
  selector: 'app-set-form-modal',
  standalone: true,
  imports: [
    FormsModule,
    ModalComponent,
    SetItemEditorComponent,
    WorkoutFormModalComponent,
  ],
  templateUrl: './set-form-modal.html',
  styleUrl: './set-form-modal.css',
})
export class SetFormModalComponent {
  private readonly service = inject(WorkoutSetService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  readonly editingSet = input<WorkoutSet | null>(null);
  /** Exercises to open the builder pre-filled with, when creating a set from
   *  something that already exists — a logged day. Ignored while editing. */
  readonly presetItems = input<SetItem[] | null>(null);
  /** A suggested name to go with {@link presetItems}. */
  readonly presetName = input('');

  readonly close = output<void>();
  readonly saved = output<WorkoutSet>();

  protected name = '';
  protected description = '';
  protected readonly items = signal<BuilderItem[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly isEditing = computed(() => this.editingSet() != null);

  /** Keys are handed out per builder session and never reused, so `@for`'s
   *  `track` stays stable as blocks are added and removed. */
  private nextKey = 0;

  constructor() {
    // Re-seed each time the modal goes from closed to open, so it reflects the
    // latest edit target without clobbering what's being typed while it's open
    // — the same guard `WorkoutFormModalComponent` uses.
    let prevOpen = false;
    effect(() => {
      const isOpen = this.open();
      if (isOpen && !prevOpen) this.initForm();
      prevOpen = isOpen;
    });
  }

  private initForm(): void {
    const set = this.editingSet();
    const source = set?.items ?? this.presetItems() ?? [];
    this.name = set?.name ?? this.presetName();
    this.description = set?.description ?? '';
    this.nextKey = 0;
    this.items.set(
      source.map((item) =>
        builderItemFrom(
          item,
          this.nextKey++,
          this.settings.unit(),
          this.settings.distanceUnit()
        )
      )
    );
    // A set with no exercises is not worth saving, so a fresh builder starts
    // with one block open rather than an empty page and a button.
    if (this.items().length === 0) this.addItem();
    this.error.set('');
  }

  protected addItem(): void {
    const group = this.settings.muscleGroups()[0] ?? '';
    this.items.update((list) => [...list, blankItem(this.nextKey++, group)]);
  }

  protected removeItem(item: BuilderItem): void {
    this.items.update((list) => list.filter((i) => i !== item));
  }

  protected async onSubmit(): Promise<void> {
    if (!this.name.trim()) {
      this.error.set('Give this set a name.');
      return;
    }
    const items = this.items();
    if (items.length === 0) {
      this.error.set('Add at least one exercise.');
      return;
    }

    // Convert and validate in one pass — the first block that isn't ready is
    // the message the user sees, named so they know which one to fix.
    const converted: SetItem[] = [];
    for (const item of items) {
      const result = toSetItem(item, this.settings.unit(), this.settings.distanceUnit());
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }
      converted.push(result.item);
    }

    this.saving.set(true);
    this.error.set('');
    const data = {
      name: this.name.trim(),
      description: this.description.trim(),
      items: converted,
    };
    const id = this.editingSet()?.id ?? null;

    try {
      let savedId: string;
      if (id) {
        await this.service.update(id, data);
        savedId = id;
        this.toast.show('Set updated!', 'success');
      } else {
        savedId = await this.service.add(data);
        this.toast.show('Set saved!', 'success');
      }
      this.saved.emit({ id: savedId, ...data });
      this.close.emit();
    } catch {
      this.error.set('Could not save your set. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  // --- "Create new workout" sub-modal, layered over the builder ---

  /** The block that asked for a new exercise, so the result can be dropped
   *  straight back into it. `null` when the sub-modal is closed. */
  protected readonly creatingFor = signal<BuilderItem | null>(null);

  protected readonly createPresetGroup = computed(
    () => this.creatingFor()?.muscleGroup() ?? ''
  );

  protected onWorkoutCreated(workout: Workout): void {
    const item = this.creatingFor();
    this.creatingFor.set(null);
    if (!item) return;
    // Follow the new exercise to its group — it may not be the one the block
    // was sitting in when the user hit "Create new workout".
    item.muscleGroup.set(workout.muscleGroup);
    selectWorkout(item, workout, this.settings.unit());
  }
}
