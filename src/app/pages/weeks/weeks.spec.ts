import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeksComponent } from './weeks';
import {
  WeekService,
  WeekEntry,
  mondayOf,
  toWeekId,
  parseTime,
  formatTime,
} from '../../services/week.service';
import { WorkoutService } from '../../services/workout.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';

/** Typed window onto WeeksComponent's `protected` members. */
interface WeeksView {
  openAddModal: (day: number) => void;
  openEditModal: (entry: WeekEntry) => void;
  onWorkoutChange: (id: string) => void;
  onMuscleGroupChange: (group: string) => void;
  onSetsCountChange: (value: number | null) => void;
  onSubmit: () => Promise<void>;
  onDelete: (entry: WeekEntry) => Promise<void>;
  setRows: () => { reps: number | null; weight: number | null; timeText: string }[];
  error: () => string;
  editingId: () => string | null;
  muscleGroups: () => string[];
  filteredWorkouts: () => { id?: string }[];
}

const SAMPLE_WORKOUT = {
  id: 'w1',
  name: 'Bench Press',
  muscleGroup: 'Chest',
  usualWeight: 60,
  maxWeight: 80,
};

/** A workout whose muscle group is no longer in the user's list (e.g. the
 *  group was deleted), so it lands in the reserved "Unassigned" bucket. */
const ORPHAN_WORKOUT = {
  id: 'w2',
  name: 'Old Lift',
  muscleGroup: 'Deleted Group',
  usualWeight: 40,
  maxWeight: 50,
};

describe('week.service date helpers', () => {
  it('mondayOf returns the Monday of that week', () => {
    const wed = new Date(2026, 0, 7); // some weekday in Jan 2026
    const mon = mondayOf(wed);
    expect(mon.getDay()).toBe(1); // Monday
    expect(mon.getTime()).toBeLessThanOrEqual(wed.getTime());
    expect(wed.getTime() - mon.getTime()).toBeLessThan(7 * 24 * 3600 * 1000);
  });

  it('toWeekId formats local YYYY-MM-DD without UTC shift', () => {
    expect(toWeekId(new Date(2026, 5, 1))).toBe('2026-06-01');
  });

  it('parseTime reads m:ss, bare seconds, and rejects blank/garbage', () => {
    expect(parseTime('1:30')).toBe(90);
    expect(parseTime('0:45')).toBe(45);
    expect(parseTime('45')).toBe(45);
    expect(parseTime('')).toBeNull();
    expect(parseTime('  ')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });

  it('formatTime renders m:ss with zero-padded seconds', () => {
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(null)).toBe('');
  });
});

describe('WeeksComponent', () => {
  let view: WeeksView;
  let entriesData: WeekEntry[];
  let service: {
    entries: () => WeekEntry[];
    rangeLabel: () => string;
    isCurrentWeek: () => boolean;
    currentWeekStart: () => Date;
    today: () => Date;
    previousWeek: ReturnType<typeof vi.fn>;
    nextWeek: ReturnType<typeof vi.fn>;
    goToThisWeek: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    entriesData = [];
    service = {
      entries: () => entriesData,
      rangeLabel: () => 'Jun 16 – Jun 22, 2026',
      isCurrentWeek: () => true,
      currentWeekStart: () => new Date(2026, 5, 15),
      today: () => new Date(2026, 5, 17),
      previousWeek: vi.fn(),
      nextWeek: vi.fn(),
      goToThisWeek: vi.fn(),
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    toast = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [WeeksComponent],
      providers: [
        { provide: WeekService, useValue: service },
        { provide: WorkoutService, useValue: { workouts: () => [SAMPLE_WORKOUT, ORPHAN_WORKOUT] } },
        { provide: ToastService, useValue: toast },
        { provide: SettingsService, useValue: { showSetTime: () => false, muscleGroups: () => ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'] } },
      ],
    }).compileComponents();

    view = TestBed.createComponent(WeeksComponent)
      .componentInstance as unknown as WeeksView;
  });

  it('builds set rows with weight defaulted from the chosen workout', () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(3);

    const rows = view.setRows();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.weight === 60)).toBe(true);
    expect(rows.every((r) => r.reps === null)).toBe(true);
  });

  it('offers the Unassigned bucket and its workouts when a group was deleted', () => {
    view.openAddModal(0);

    expect(view.muscleGroups()).toContain('Unassigned');

    view.onMuscleGroupChange('Unassigned');

    expect(view.filteredWorkouts().map((w) => w.id)).toEqual(['w2']);
  });

  it('keeps entered set data when the count field is cleared and retyped', () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(3);
    view.setRows().forEach((r, i) => (r.reps = 10 + i));

    // Clearing the number input fires ngModelChange(null) before the new
    // value is typed — this must not wipe what the user already entered.
    view.onSetsCountChange(null);
    view.onSetsCountChange(3);

    expect(view.setRows().map((r) => r.reps)).toEqual([10, 11, 12]);
  });

  it('keeps entered set data while typing a two-digit count', () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(5);
    view.setRows().forEach((r, i) => (r.reps = 1 + i));

    // Typing "12" over "5" passes through the transient value 1.
    view.onSetsCountChange(1);
    view.onSetsCountChange(12);

    const reps = view.setRows().map((r) => r.reps);
    expect(reps.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(reps.slice(5)).toEqual([null, null, null, null, null, null, null]);
  });

  it('saves a valid workout and shows a toast', async () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(3);
    view.setRows().forEach((r) => (r.reps = 10));

    await view.onSubmit();

    expect(service.add).toHaveBeenCalledWith({
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      sets: [
        { reps: 10, weight: 60, time: null },
        { reps: 10, weight: 60, time: null },
        { reps: 10, weight: 60, time: null },
      ],
    });
    expect(toast.show).toHaveBeenCalledWith('Workout added!', 'success');
  });

  it('parses an entered m:ss time into seconds on submit', async () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(1);
    view.setRows()[0].reps = 8;
    view.setRows()[0].timeText = '1:30';

    await view.onSubmit();

    expect(service.add).toHaveBeenCalledWith({
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      sets: [{ reps: 8, weight: 60, time: 90 }],
    });
  });

  it('blocks adding the same workout twice on one day', async () => {
    entriesData = [
      {
        id: 'existing',
        day: 0,
        workoutId: 'w1',
        workoutName: 'Bench Press',
        muscleGroup: 'Chest',
        sets: [{ reps: 10, weight: 60 }],
      },
    ];

    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(1);
    view.setRows()[0].reps = 8;

    await view.onSubmit();

    expect(service.add).not.toHaveBeenCalled();
    expect(view.error()).toBeTruthy();
  });

  it('updates in edit mode and excludes the edited entry from the dedupe check', async () => {
    const entry: WeekEntry = {
      id: 'existing',
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      sets: [{ reps: 10, weight: 60 }],
    };
    entriesData = [entry];

    view.openEditModal(entry);
    expect(view.editingId()).toBe('existing');
    view.setRows()[0].reps = 12;

    await view.onSubmit();

    expect(service.update).toHaveBeenCalledWith('existing', {
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      sets: [{ reps: 12, weight: 60, time: null }],
    });
    expect(service.add).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Workout updated!', 'success');
  });

  it('deletes an entry once the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await view.onDelete({
      id: 'existing',
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      sets: [],
    });

    expect(service.remove).toHaveBeenCalledWith('existing');
    expect(toast.show).toHaveBeenCalledWith('Workout deleted', 'success');
  });

  it('does not delete when the user cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await view.onDelete({
      id: 'existing',
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      sets: [],
    });

    expect(service.remove).not.toHaveBeenCalled();
  });
});
