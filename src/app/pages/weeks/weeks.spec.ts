import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeksComponent } from './weeks';
import {
  WeekService,
  WeekEntry,
  WorkoutSet,
  mondayOf,
  toWeekId,
} from '../../services/week.service';
import { WorkoutService } from '../../services/workout.service';
import { ToastService } from '../../services/toast.service';

/** Typed window onto WeeksComponent's `protected` members. */
interface WeeksView {
  openAddModal: (day: number) => void;
  openEditModal: (entry: WeekEntry) => void;
  onWorkoutChange: (id: string) => void;
  onMuscleGroupChange: (group: string) => void;
  onSetsCountChange: (value: number | null) => void;
  onSubmit: () => Promise<void>;
  onDelete: (entry: WeekEntry) => Promise<void>;
  setRows: () => WorkoutSet[];
  error: () => string;
  editingId: () => string | null;
}

const SAMPLE_WORKOUT = {
  id: 'w1',
  name: 'Bench Press',
  muscleGroup: 'Chest',
  usualWeight: 60,
  maxWeight: 80,
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
});

describe('WeeksComponent', () => {
  let view: WeeksView;
  let entriesData: WeekEntry[];
  let service: {
    entries: () => WeekEntry[];
    rangeLabel: () => string;
    isCurrentWeek: () => boolean;
    currentWeekStart: () => Date;
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
        { provide: WorkoutService, useValue: { workouts: () => [SAMPLE_WORKOUT] } },
        { provide: ToastService, useValue: toast },
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
        { reps: 10, weight: 60 },
        { reps: 10, weight: 60 },
        { reps: 10, weight: 60 },
      ],
    });
    expect(toast.show).toHaveBeenCalledWith('Workout added!', 'success');
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
      sets: [{ reps: 12, weight: 60 }],
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
