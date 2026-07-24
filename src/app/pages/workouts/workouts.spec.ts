import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutsComponent } from './workouts';
import { WorkoutService, MUSCLE_GROUPS, CARDIO_GROUP } from '../../services/workout.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';

interface WorkoutLike {
  id?: string;
  name: string;
  muscleGroup?: string;
  usualWeight?: number | null;
  maxWeight?: number | null;
}

/** Typed window onto WorkoutsComponent's `protected` members. The create/edit
 *  form now lives in WorkoutFormModalComponent (see its own spec); this page
 *  only owns the list, grouping, and delete. */
interface WorkoutsView {
  onDelete: (workout: WorkoutLike) => Promise<void>;
  groupedWorkouts: () => { group: string; items: WorkoutLike[] }[];
  isExpanded: (group: string) => boolean;
  toggleGroup: (group: string) => void;
}

describe('WorkoutsComponent', () => {
  let view: WorkoutsView;
  let workoutsData: WorkoutLike[];
  let service: {
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    workouts: () => unknown[];
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    workoutsData = [];
    service = {
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      workouts: () => workoutsData,
    };
    toast = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [WorkoutsComponent],
      providers: [
        { provide: WorkoutService, useValue: service },
        { provide: ToastService, useValue: toast },
        {
          provide: SettingsService,
          useValue: { muscleGroups: () => [...MUSCLE_GROUPS], unit: () => 'lbs' },
        },
      ],
    }).compileComponents();

    view = TestBed.createComponent(WorkoutsComponent)
      .componentInstance as unknown as WorkoutsView;
  });

  it('deletes a workout once the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await view.onDelete({ id: 'abc123', name: 'Squat' });

    expect(service.remove).toHaveBeenCalledWith('abc123');
    expect(toast.show).toHaveBeenCalledWith('Workout deleted', 'success');
  });

  it('does not delete when the user cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await view.onDelete({ id: 'abc123', name: 'Squat' });

    expect(service.remove).not.toHaveBeenCalled();
  });

  it('groups workouts by muscle group in preset order, omitting empty groups except the reserved Cardio one', () => {
    workoutsData = [
      { id: '1', name: 'Curl', muscleGroup: 'Arms' },
      { id: '2', name: 'Bench', muscleGroup: 'Chest' },
      { id: '3', name: 'Press', muscleGroup: 'Arms' },
    ];

    const groups = view.groupedWorkouts();

    // Chest comes before Arms in MUSCLE_GROUPS, Legs (empty) is dropped, and the
    // reserved Cardio section always appears first — even with zero items.
    expect(groups.map((g) => g.group)).toEqual([CARDIO_GROUP, 'Chest', 'Arms']);
    expect(groups.find((g) => g.group === 'Arms')?.items).toHaveLength(2);
    expect(groups.find((g) => g.group === CARDIO_GROUP)?.items).toEqual([]);
  });

  it('places cardio workouts under the reserved Cardio group, not Unassigned', () => {
    workoutsData = [
      { id: '1', name: 'Run', muscleGroup: CARDIO_GROUP },
      { id: '2', name: 'Orphaned Lift', muscleGroup: 'Deleted Group' },
    ];

    const groups = view.groupedWorkouts();

    expect(groups.find((g) => g.group === CARDIO_GROUP)?.items.map((w) => w.name)).toEqual([
      'Run',
    ]);
    expect(groups.find((g) => g.group === 'Unassigned')?.items.map((w) => w.name)).toEqual([
      'Orphaned Lift',
    ]);
  });

  it('toggles a group between expanded and collapsed', () => {
    expect(view.isExpanded('Arms')).toBe(false);

    view.toggleGroup('Arms');
    expect(view.isExpanded('Arms')).toBe(true);
    expect(view.isExpanded('Chest')).toBe(false);

    view.toggleGroup('Arms');
    expect(view.isExpanded('Arms')).toBe(false);
  });
});
