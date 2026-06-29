import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsComponent } from './settings';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';
import { WorkoutService, MUSCLE_GROUPS } from '../../services/workout.service';

/** Typed window onto SettingsComponent's `protected` members. */
interface SettingsView {
  toggleSetTime: () => Promise<void>;
  showSetTime: () => boolean;
}

describe('SettingsComponent', () => {
  let view: SettingsView;
  let showSetTimeValue: boolean;
  let settings: {
    showSetTime: () => boolean;
    setShowSetTime: ReturnType<typeof vi.fn>;
    muscleGroups: () => string[];
    setMuscleGroups: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    showSetTimeValue = false;
    settings = {
      showSetTime: () => showSetTimeValue,
      setShowSetTime: vi.fn().mockResolvedValue(undefined),
      muscleGroups: () => [...MUSCLE_GROUPS],
      setMuscleGroups: vi.fn().mockResolvedValue(undefined),
    };
    toast = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: SettingsService, useValue: settings },
        { provide: ToastService, useValue: toast },
        { provide: WorkoutService, useValue: { workouts: () => [], reassignMuscleGroup: vi.fn() } },
      ],
    }).compileComponents();

    view = TestBed.createComponent(SettingsComponent)
      .componentInstance as unknown as SettingsView;
  });

  it('toggles the setting to the opposite of its current value', async () => {
    await view.toggleSetTime();
    expect(settings.setShowSetTime).toHaveBeenCalledWith(true);

    showSetTimeValue = true;
    await view.toggleSetTime();
    expect(settings.setShowSetTime).toHaveBeenCalledWith(false);
  });

  it('shows an error toast when saving fails', async () => {
    settings.setShowSetTime.mockRejectedValueOnce(new Error('offline'));

    await view.toggleSetTime();

    expect(toast.show).toHaveBeenCalledWith(
      'Could not save your setting. Please try again.',
      'error'
    );
  });
});
