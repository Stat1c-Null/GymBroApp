import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SetsComponent } from './sets';
import {
  SetItem,
  WorkoutSet,
  WorkoutSetService,
} from '../../services/workout-set.service';
import { WeekSet, WeekSetService } from '../../services/week-set.service';
import { WorkoutService, MUSCLE_GROUPS, CARDIO_GROUP } from '../../services/workout.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';

/** Typed window onto SetsComponent's `protected` members. The builder lives in
 *  SetFormModalComponent (see builder-item.spec.ts); this page owns the list,
 *  the per-item summary line, and delete. */
interface SetsView {
  sets: () => WorkoutSet[] | undefined;
  openModal: (set?: WorkoutSet) => void;
  closeModal: () => void;
  modalOpen: () => boolean;
  editingSet: () => WorkoutSet | null;
  summaryOf: (item: SetItem) => string;
  onDelete: (set: WorkoutSet) => Promise<void>;
}

describe('SetsComponent', () => {
  let view: SetsView;
  let setsData: WorkoutSet[] | undefined;
  let unit: 'kg' | 'lbs';
  let service: {
    sets: () => WorkoutSet[] | undefined;
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let weekSetsData: WeekSet[] | undefined;
  let weekService: {
    weekSets: () => WeekSet[] | undefined;
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  const PUSH_DAY: WorkoutSet = {
    id: 's1',
    name: 'Push Day',
    description: 'Chest and arms',
    items: [
      {
        workoutId: 'w1',
        workoutName: 'Bench Press',
        muscleGroup: 'Chest',
        notes: '',
        sets: [
          { reps: 10, weight: 135, time: null },
          { reps: 8, weight: 135, time: null },
        ],
      },
    ],
  };

  beforeEach(async () => {
    setsData = [];
    unit = 'lbs';
    service = {
      sets: () => setsData,
      add: vi.fn().mockResolvedValue('new-id'),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    weekSetsData = [];
    weekService = {
      weekSets: () => weekSetsData,
      add: vi.fn().mockResolvedValue('new-week-id'),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    toast = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [SetsComponent],
      providers: [
        { provide: WorkoutSetService, useValue: service },
        { provide: WeekSetService, useValue: weekService },
        { provide: WorkoutService, useValue: { workouts: () => [], update: vi.fn() } },
        { provide: ToastService, useValue: toast },
        {
          provide: SettingsService,
          useValue: {
            muscleGroups: () => [...MUSCLE_GROUPS],
            unit: () => unit,
            distanceUnit: () => 'mi',
            showSetTime: () => false,
          },
        },
      ],
    }).compileComponents();

    view = TestBed.createComponent(SetsComponent)
      .componentInstance as unknown as SetsView;
  });

  it('distinguishes "still loading" from "you have no sets"', () => {
    setsData = undefined;
    expect(view.sets()).toBeUndefined();

    setsData = [];
    expect(view.sets()).toEqual([]);
  });

  it('opens the builder empty for a new set', () => {
    view.openModal();

    expect(view.modalOpen()).toBe(true);
    expect(view.editingSet()).toBeNull();
  });

  it('opens the builder on an existing set to edit it', () => {
    view.openModal(PUSH_DAY);

    expect(view.modalOpen()).toBe(true);
    expect(view.editingSet()).toBe(PUSH_DAY);
  });

  it('closes the builder', () => {
    view.openModal();
    view.closeModal();

    expect(view.modalOpen()).toBe(false);
  });

  it('summarises an item with the same line the week grid uses', () => {
    expect(view.summaryOf(PUSH_DAY.items[0])).toBe('10×135 · 8×135 lbs');
  });

  it('summarises in the reader’s unit, not the stored one', () => {
    unit = 'kg';
    expect(view.summaryOf(PUSH_DAY.items[0])).toBe('10×61.2 · 8×61.2 kg');
  });

  it('summarises a cardio item as a session', () => {
    const run: SetItem = {
      workoutId: 'w3',
      workoutName: 'Morning Run',
      muscleGroup: CARDIO_GROUP,
      notes: '',
      sets: [],
      cardio: { time: 1800, distance: 5, heartRate: null, elevation: null },
    };

    expect(view.summaryOf(run)).toBe('30:00 · 5 mi · 6:00 /mi');
  });

  it('deletes a set once the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await view.onDelete(PUSH_DAY);

    expect(service.remove).toHaveBeenCalledWith('s1');
    expect(toast.show).toHaveBeenCalledWith('Set deleted', 'success');
  });

  it('does not delete when the user cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await view.onDelete(PUSH_DAY);

    expect(service.remove).not.toHaveBeenCalled();
  });

  it('reports a failed delete instead of claiming success', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    service.remove.mockRejectedValueOnce(new Error('offline'));

    await view.onDelete(PUSH_DAY);

    expect(toast.show).toHaveBeenCalledWith(
      'Could not delete set. Please try again.',
      'error'
    );
  });
});
