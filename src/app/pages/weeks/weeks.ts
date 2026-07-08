import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';
import { WorkoutService, UNASSIGNED_GROUP } from '../../services/workout.service';
import { WEIGHT_UNIT } from '../../services/weight.service';
import { ModalComponent } from '../../components/modal/modal';
import {
  WeekService,
  WeekEntry,
  DAY_LABELS,
  toWeekId,
  parseTime,
  formatTime,
} from '../../services/week.service';

/** A per-set row in the modal. `timeText` is the raw m:ss text the user edits;
 *  it's parsed to seconds (the stored `WorkoutSet.time`) on submit. */
interface SetRow {
  reps: number | null;
  weight: number | null;
  timeText: string;
}

@Component({
  selector: 'app-weeks',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, ModalComponent],
  templateUrl: './weeks.html',
  styleUrl: './weeks.css',
})
export class WeeksComponent {
  private readonly service = inject(WeekService);
  private readonly workoutService = inject(WorkoutService);
  private readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  /** Groups offered in the modal's dropdown. Adds the reserved "Unassigned"
   *  bucket when the library holds workouts whose group was deleted, so those
   *  workouts remain loggable instead of becoming unreachable. */
  protected readonly muscleGroups = computed(() => {
    const groups = this.settings.muscleGroups();
    const known = new Set(groups);
    const hasUnassigned = (this.workoutService.workouts() ?? []).some(
      (w) => !known.has(w.muscleGroup)
    );
    return hasUnassigned ? [...groups, UNASSIGNED_GROUP] : groups;
  });

  /** When on, each set row shows an m:ss time field (Settings page toggle). */
  protected readonly showSetTime = this.settings.showSetTime;

  protected readonly unit = WEIGHT_UNIT;

  // --- Week state (delegated to the service) ---
  protected readonly entries = this.service.entries;
  protected readonly rangeLabel = this.service.rangeLabel;
  protected readonly isCurrentWeek = this.service.isCurrentWeek;
  protected readonly previousWeek = (): void => this.service.previousWeek();
  protected readonly nextWeek = (): void => this.service.nextWeek();
  protected readonly goToThisWeek = (): void => this.service.goToThisWeek();

  /** The 7 day columns for the current week. */
  protected readonly days = computed(() => {
    const start = this.service.currentWeekStart();
    const todayId = toWeekId(this.service.today());
    return DAY_LABELS.map((label, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { index: i, label, date, isToday: toWeekId(date) === todayId };
    });
  });

  /** Entries bucketed by day index (each bucket stays newest-first). */
  protected readonly entriesByDay = computed(() => {
    const buckets: WeekEntry[][] = [[], [], [], [], [], [], []];
    for (const e of this.entries() ?? []) buckets[e.day]?.push(e);
    return buckets;
  });

  // --- Modal + form state ---
  protected readonly showModal = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  /** null = adding; a string id = editing that entry. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly activeDay = signal(0);
  protected readonly modalMuscleGroup = signal<string>('');
  protected readonly modalWorkoutId = signal('');
  protected readonly setRows = signal<SetRow[]>([]);
  /** Every row created since the modal opened, including ones hidden by a
   *  lower sets count. The visible rows share these objects, so transient
   *  count values (a cleared field, the "1" while typing "12") only hide
   *  rows instead of destroying their data. Only visible rows are saved. */
  private rowPool: SetRow[] = [];

  /** Library workouts in the modal's selected muscle group. When "Unassigned"
   *  is selected, matches any workout whose group is no longer in the user's
   *  list (mirrors the Workouts page's grouping). */
  protected readonly filteredWorkouts = computed(() => {
    const group = this.modalMuscleGroup();
    const all = this.workoutService.workouts() ?? [];
    if (group === UNASSIGNED_GROUP) {
      const known = new Set(this.settings.muscleGroups());
      return all.filter((w) => !known.has(w.muscleGroup));
    }
    return all.filter((w) => w.muscleGroup === group);
  });

  private readonly selectedWorkout = computed(
    () => this.filteredWorkouts().find((w) => w.id === this.modalWorkoutId()) ?? null
  );

  protected openAddModal(day: number): void {
    this.editingId.set(null);
    this.activeDay.set(day);
    this.modalMuscleGroup.set(this.settings.muscleGroups()[0] ?? '');
    this.modalWorkoutId.set('');
    this.rowPool = [];
    this.setRows.set([]);
    this.error.set('');
    this.showModal.set(true);
  }

  protected openEditModal(entry: WeekEntry): void {
    this.editingId.set(entry.id ?? null);
    this.activeDay.set(entry.day);
    this.modalMuscleGroup.set(entry.muscleGroup);
    this.modalWorkoutId.set(entry.workoutId);
    this.rowPool = entry.sets.map((s) => ({
      reps: s.reps,
      weight: s.weight,
      timeText: formatTime(s.time ?? null),
    }));
    this.setRows.set(this.rowPool.slice());
    this.error.set('');
    this.showModal.set(true);
  }

  protected closeModal(): void {
    this.showModal.set(false);
  }

  protected onMuscleGroupChange(group: string): void {
    this.modalMuscleGroup.set(group);
    this.modalWorkoutId.set('');
    this.rowPool = [];
    this.setRows.set([]);
  }

  protected onWorkoutChange(id: string): void {
    this.modalWorkoutId.set(id);
    // Re-default each set's weight to the newly chosen workout's usual weight.
    const weight = this.selectedWorkout()?.usualWeight ?? null;
    this.rowPool = this.rowPool.map((r) => ({ ...r, weight }));
    this.setRows.set(this.rowPool.slice(0, this.setRows().length));
  }

  /** Grow/shrink the visible per-set rows. Shrinking only hides rows (they
   *  stay in the pool with their data); growing brings them back. */
  protected onSetsCountChange(value: number | null): void {
    const count = Math.max(0, Math.min(Math.floor(value ?? 0), 20));
    const weight = this.selectedWorkout()?.usualWeight ?? null;
    while (this.rowPool.length < count) {
      this.rowPool.push({ reps: null, weight, timeText: '' });
    }
    this.setRows.set(this.rowPool.slice(0, count));
  }

  protected async onSubmit(): Promise<void> {
    const workout = this.selectedWorkout();
    if (!workout?.id) {
      this.error.set('Please select a workout.');
      return;
    }
    const sets = this.setRows();
    if (sets.length === 0) {
      this.error.set('Add at least one set.');
      return;
    }
    if (sets.some((s) => s.reps == null || s.reps <= 0)) {
      this.error.set('Enter the reps for every set.');
      return;
    }

    const day = this.activeDay();
    const duplicate = (this.entriesByDay()[day] ?? []).some(
      (e) => e.workoutId === workout.id && e.id !== this.editingId()
    );
    if (duplicate) {
      this.error.set(
        `You've already added ${workout.name} on ${DAY_LABELS[day]}.`
      );
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const data = {
      day,
      workoutId: workout.id,
      workoutName: workout.name,
      muscleGroup: workout.muscleGroup,
      sets: sets.map((s) => ({
        reps: s.reps,
        weight: s.weight ?? null,
        time: parseTime(s.timeText),
      })),
    };
    const id = this.editingId();

    try {
      if (id) {
        await this.service.update(id, data);
        this.toast.show('Workout updated!', 'success');
      } else {
        await this.service.add(data);
        this.toast.show('Workout added!', 'success');
      }
      this.closeModal();
    } catch {
      this.error.set('Could not save your workout. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async onDelete(entry: WeekEntry): Promise<void> {
    if (!entry.id) return;
    if (!confirm(`Delete ${entry.workoutName}? This can't be undone.`)) return;
    try {
      await this.service.remove(entry.id);
      this.toast.show('Workout deleted', 'success');
    } catch {
      this.toast.show('Could not delete workout. Please try again.', 'error');
    }
  }

  /** Compact per-set summary, e.g. "12×60 · 10×60 (1:30) · 8×65 lbs".
   *  Times are shown whenever a set has one stored — independent of the toggle. */
  protected setSummary(entry: WeekEntry): string {
    const parts = entry.sets.map((s) => {
      const base = s.weight != null ? `${s.reps}×${s.weight}` : `${s.reps}`;
      return s.time != null ? `${base} (${formatTime(s.time)})` : base;
    });
    const hasWeight = entry.sets.some((s) => s.weight != null);
    return parts.join(' · ') + (hasWeight ? ` ${this.unit}` : '');
  }
}
