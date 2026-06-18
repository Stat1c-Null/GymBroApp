import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutsComponent } from './workouts';
import { WorkoutService } from '../../services/workout.service';
import { ToastService } from '../../services/toast.service';

/** Typed window onto WorkoutsComponent's `protected` members. */
interface WorkoutsView {
  name: string;
  muscleGroup: string;
  usualWeight: number | null;
  maxWeight: number | null;
  onSubmit: () => Promise<void>;
  onDelete: (workout: { id?: string; name: string }) => Promise<void>;
  error: () => string;
}

describe('WorkoutsComponent', () => {
  let view: WorkoutsView;
  let service: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    workouts: () => unknown[];
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      workouts: () => [],
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
});
