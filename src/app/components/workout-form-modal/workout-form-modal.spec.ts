import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkoutFormModalComponent } from './workout-form-modal';
import { WorkoutService, Workout, MUSCLE_GROUPS } from '../../services/workout.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';

/** Typed window onto WorkoutFormModalComponent's `protected` form members. */
interface FormView {
  name: string;
  muscleGroup: string;
  usualWeight: number | null;
  maxWeight: number | null;
  onSubmit: () => Promise<void>;
  error: () => string;
  isEditing: () => boolean;
}

describe('WorkoutFormModalComponent', () => {
  let fixture: ComponentFixture<WorkoutFormModalComponent>;
  let component: WorkoutFormModalComponent;
  let view: FormView;
  let service: {
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    workouts: () => unknown[];
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      add: vi.fn().mockResolvedValue('new-id'),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      workouts: () => [],
    };
    toast = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [WorkoutFormModalComponent],
      providers: [
        { provide: WorkoutService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: SettingsService, useValue: { muscleGroups: () => [...MUSCLE_GROUPS] } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkoutFormModalComponent);
    component = fixture.componentInstance;
    view = component as unknown as FormView;
  });

  /** Open the modal (optionally in edit mode); the false→true transition fires
   *  the init effect that seeds the form. */
  function open(editingWorkout: Workout | null = null): void {
    fixture.componentRef.setInput('editingWorkout', editingWorkout);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  }

  it('saves a valid workout, emits it, and shows a toast', async () => {
    open();
    let saved: Workout | undefined;
    component.saved.subscribe((w) => (saved = w));

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
    expect(saved).toEqual({
      id: 'new-id',
      name: 'Bench Press',
      muscleGroup: 'Chest',
      usualWeight: 60,
      maxWeight: 80,
    });
    expect(toast.show).toHaveBeenCalledWith('Workout added!', 'success');
  });

  it('rejects an empty name without calling the service', async () => {
    open();
    view.name = '   ';

    await view.onSubmit();

    expect(service.add).not.toHaveBeenCalled();
    expect(view.error()).toBeTruthy();
  });

  it('updates an existing workout when opened in edit mode', async () => {
    open({ id: 'abc123', name: 'Squat', muscleGroup: 'Legs', usualWeight: 90, maxWeight: 120 });
    expect(view.isEditing()).toBe(true);
    expect(view.name).toBe('Squat'); // seeded from the edit target

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

  it('preselects the preset group when adding', () => {
    fixture.componentRef.setInput('presetGroup', 'Back');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(view.muscleGroup).toBe('Back');
  });
});
