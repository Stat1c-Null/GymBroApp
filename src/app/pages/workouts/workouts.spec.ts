import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutsComponent } from './workouts';
import { WorkoutService } from '../../services/workout.service';
import { ToastService } from '../../services/toast.service';

interface WorkoutLike {
  id?: string;
  name: string;
  muscleGroup?: string;
  usualWeight?: number | null;
  maxWeight?: number | null;
}

/** Typed window onto WorkoutsComponent's `protected` members. */
interface WorkoutsView {
  name: string;
  muscleGroup: string;
  usualWeight: number | null;
  maxWeight: number | null;
  openModal: (workout?: WorkoutLike) => void;
  onSubmit: () => Promise<void>;
  onDelete: (workout: WorkoutLike) => Promise<void>;
  error: () => string;
  editingId: () => string | null;
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
      ],
    }).compileComponents();

    view = TestBed.createComponent(WorkoutsComponent)
      .componentInstance as unknown as WorkoutsView;
  });

  it('saves a valid workout and shows a toast', async () => {
    view.name = 'Bench Press';
    view.muscleGroup = 'Chest';
    view.usualWeight = 60;
    view.maxWeight = 80;

    await view.onSubmit();

    expect(service.add).toHaveBeenCalledWith({
      name: 'Bench Press',
      muscleGroup: 'Chest',
      usualWeight: 60,
      maxWeight: 80,
    });
    expect(toast.show).toHaveBeenCalledWith('Workout added!', 'success');
  });

  it('rejects an empty name without calling the service', async () => {
    view.name = '   ';

    await view.onSubmit();

    expect(service.add).not.toHaveBeenCalled();
    expect(view.error()).toBeTruthy();
  });

  it('updates an existing workout when opened in edit mode', async () => {
    view.openModal({
      id: 'abc123',
      name: 'Squat',
      muscleGroup: 'Legs',
      usualWeight: 90,
      maxWeight: 120,
    });
    expect(view.editingId()).toBe('abc123');

    view.maxWeight = 140;
    await view.onSubmit();

    expect(service.update).toHaveBeenCalledWith('abc123', {
      name: 'Squat',
      muscleGroup: 'Legs',
      usualWeight: 90,
      maxWeight: 140,
    });
    expect(service.add).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Workout updated!', 'success');
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

  it('groups workouts by muscle group in preset order, omitting empty groups', () => {
    workoutsData = [
      { id: '1', name: 'Curl', muscleGroup: 'Arms' },
      { id: '2', name: 'Bench', muscleGroup: 'Chest' },
      { id: '3', name: 'Press', muscleGroup: 'Arms' },
    ];

    const groups = view.groupedWorkouts();

    // Chest comes before Arms in MUSCLE_GROUPS, and Legs (empty) is dropped.
    expect(groups.map((g) => g.group)).toEqual(['Chest', 'Arms']);
    expect(groups.find((g) => g.group === 'Arms')?.items).toHaveLength(2);
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
