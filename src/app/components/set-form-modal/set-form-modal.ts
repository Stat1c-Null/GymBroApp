import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { DAY_LABELS } from '../../services/week.service';
import { Workout } from '../../services/workout.service';
import {
  WeekSet,
  WeekSetDay,
  WeekSetService,
} from '../../services/week-set.service';
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

/** `0…6`, so the template can loop the seven day sections. */
const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6];

/**
 * Create or edit a saved set — either a **day** set (a name, an optional
 * description, and an ordered list of exercises with the reps, weight and notes
 * they're meant to be done at) or, in `mode: 'week'`, a **week** set: the same
 * thing grouped under seven collapsible weekday sections.
 *
 * Driven purely by inputs, like `WorkoutFormModalComponent` — pass
 * `editingSet` / `editingWeekSet` to edit one, or `presetItems` / `presetDays`
 * to open the builder already filled in (that's the "save this day as a set"
 * and "save this week as a set" flows on the Weeks page). Emits `saved` /
 * `savedWeek` and `close`.
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
  private readonly weekService = inject(WeekSetService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  readonly open = input(false);
  /**
   * Which kind of set is being built. `'week'` swaps the flat exercise list for
   * seven collapsible day sections and writes to `WeekSetService` — everything
   * else (the name, the validation, the exercise blocks, the layered
   * "create new workout" modal) is the same in both, which is the reason this
   * is a mode rather than a second component.
   */
  readonly mode = input<'day' | 'week'>('day');

  readonly editingSet = input<WorkoutSet | null>(null);
  /** Exercises to open the builder pre-filled with, when creating a set from
   *  something that already exists — a logged day. Ignored while editing. */
  readonly presetItems = input<SetItem[] | null>(null);

  /** The `mode: 'week'` counterparts of the two above. */
  readonly editingWeekSet = input<WeekSet | null>(null);
  readonly presetDays = input<WeekSetDay[] | null>(null);

  /** A suggested name to go with {@link presetItems} / {@link presetDays}. */
  readonly presetName = input('');

  readonly close = output<void>();
  readonly saved = output<WorkoutSet>();
  readonly savedWeek = output<WeekSet>();

  protected name = '';
  protected description = '';
  protected readonly items = signal<BuilderItem[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly isWeek = computed(() => this.mode() === 'week');
  protected readonly isEditing = computed(() =>
    this.isWeek() ? this.editingWeekSet() != null : this.editingSet() != null
  );

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
    this.nextKey = 0;
    this.error.set('');
    this.isWeek() ? this.initWeekForm() : this.initDayForm();
  }

  private initDayForm(): void {
    const set = this.editingSet();
    const source = set?.items ?? this.presetItems() ?? [];
    this.name = set?.name ?? this.presetName();
    this.description = set?.description ?? '';
    this.items.set(source.map((item) => this.toBuilderItem(item)));
    // A set with no exercises is not worth saving, so a fresh builder starts
    // with one block open rather than an empty page and a button.
    if (this.items().length === 0) this.addItem(0);
    this.expanded.set(new Set(DAY_INDICES));
  }

  /**
   * The week builder holds the same **flat** list of blocks, each stamped with
   * its day — the day sections in the template are a view over it, not seven
   * separate lists. That keeps `removeItem`, the key counter and the
   * create-workout sub-modal identical to the day builder's.
   */
  private initWeekForm(): void {
    const set = this.editingWeekSet();
    const source = set?.days ?? this.presetDays() ?? [];
    this.name = set?.name ?? this.presetName();
    this.description = set?.description ?? '';
    this.items.set(
      source.flatMap((d) => d.items.map((item) => this.toBuilderItem(item, d.day)))
    );
    // Unlike a day set, a fresh week builder starts empty: a week with nothing
    // on it yet has no obvious day to put the first block on, and an empty
    // Tuesday is normal rather than a gap to fill.
    this.expanded.set(new Set(source.map((d) => d.day)));
  }

  private toBuilderItem(item: SetItem, day = 0): BuilderItem {
    return builderItemFrom(
      item,
      this.nextKey++,
      this.settings.unit(),
      this.settings.distanceUnit(),
      day
    );
  }

  protected addItem(day: number): void {
    const group = this.settings.muscleGroups()[0] ?? '';
    this.items.update((list) => [
      ...list,
      blankItem(this.nextKey++, group, day),
    ]);
    // Adding to a collapsed day would hide the block the user just asked for.
    this.expanded.update((open) => new Set(open).add(day));
  }

  protected removeItem(item: BuilderItem): void {
    this.items.update((list) => list.filter((i) => i !== item));
  }

  protected async onSubmit(): Promise<void> {
    if (!this.name.trim()) {
      this.error.set(this.isWeek() ? 'Give this week a name.' : 'Give this set a name.');
      return;
    }
    const items = this.items();
    if (items.length === 0) {
      this.error.set(
        this.isWeek()
          ? 'Add at least one exercise to at least one day.'
          : 'Add at least one exercise.'
      );
      return;
    }

    // Convert and validate in one pass — the first block that isn't ready is
    // the message the user sees, named so they know which one to fix. In week
    // mode the day is named too, since the same exercise can appear twice.
    const converted: { day: number; item: SetItem }[] = [];
    for (const item of items) {
      const result = toSetItem(item, this.settings.unit(), this.settings.distanceUnit());
      if (!result.ok) {
        this.error.set(
          this.isWeek()
            ? `${result.error} (${DAY_LABELS[item.day()]})`
            : result.error
        );
        return;
      }
      converted.push({ day: item.day(), item: result.item });
    }

    this.saving.set(true);
    this.error.set('');

    try {
      this.isWeek()
        ? await this.saveWeekSet(converted)
        : await this.saveDaySet(converted.map((c) => c.item));
      this.close.emit();
    } catch {
      this.error.set(
        this.isWeek()
          ? 'Could not save your week. Please try again.'
          : 'Could not save your set. Please try again.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async saveDaySet(items: SetItem[]): Promise<void> {
    const data = {
      name: this.name.trim(),
      description: this.description.trim(),
      items,
    };
    const id = this.editingSet()?.id ?? null;
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
  }

  private async saveWeekSet(
    converted: { day: number; item: SetItem }[]
  ): Promise<void> {
    // Group the flat block list back into days. `WeekSetService` drops empty
    // days and sorts them, so this only has to preserve each day's own order.
    const byDay = new Map<number, SetItem[]>();
    for (const { day, item } of converted) {
      const bucket = byDay.get(day);
      bucket ? bucket.push(item) : byDay.set(day, [item]);
    }

    const data = {
      name: this.name.trim(),
      description: this.description.trim(),
      days: [...byDay.entries()].map(([day, items]) => ({ day, items })),
    };
    const id = this.editingWeekSet()?.id ?? null;
    let savedId: string;
    if (id) {
      await this.weekService.update(id, data);
      savedId = id;
      this.toast.show('Week updated!', 'success');
    } else {
      savedId = await this.weekService.add(data);
      this.toast.show('Week saved!', 'success');
    }
    this.savedWeek.emit({ id: savedId, ...data });
  }

  // --- Day sections (week mode only) ---

  protected readonly dayIndices = DAY_INDICES;
  protected readonly dayLabels = DAY_LABELS;

  /** Which day sections are open. A day with exercises starts expanded; an
   *  empty one stays collapsed so seven headers fit on one screen. */
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected itemsForDay(day: number): BuilderItem[] {
    return this.items().filter((item) => item.day() === day);
  }

  protected isExpanded(day: number): boolean {
    return this.expanded().has(day);
  }

  protected toggleDay(day: number): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
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
