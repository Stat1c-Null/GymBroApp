import { TestBed } from '@angular/core/testing';
import type { WritableSignal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeksComponent } from './weeks';
import {
  WeekService,
  WeekEntry,
  mondayOf,
  toWeekId,
  parseTime,
  formatTime,
  uniformWeight,
} from '../../services/week.service';
import { WorkoutService, CARDIO_GROUP } from '../../services/workout.service';
import { distanceToCanonical, elevationToCanonical } from '../../services/cardio';
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
  toggleModalTrackTime: () => void;
  modalTrackTime: () => boolean;
  onWorkoutCreated: (workout: {
    id?: string;
    muscleGroup: string;
    usualWeight: number | null;
  }) => void;
  setRows: () => { reps: number | null; weight: number | null; timeText: string }[];
  error: () => string;
  editingId: () => string | null;
  muscleGroups: () => string[];
  modalMuscleGroup: () => string;
  modalWorkoutId: () => string;
  filteredWorkouts: () => { id?: string }[];
  isCardio: () => boolean;
  cardioTimeText: WritableSignal<string>;
  cardioDistance: WritableSignal<number | null>;
  cardioHeartRate: WritableSignal<number | null>;
  cardioElevation: WritableSignal<number | null>;
  cardioPace: () => string | null;
  entrySummary: (entry: WeekEntry) => string;
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

const CARDIO_WORKOUT: {
  id: string;
  name: string;
  muscleGroup: string;
  usualWeight: number | null;
  maxWeight: number | null;
} = {
  id: 'w3',
  name: 'Morning Run',
  muscleGroup: CARDIO_GROUP,
  usualWeight: null,
  maxWeight: null,
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

describe('uniformWeight', () => {
  it('returns the common weight when every set matches', () => {
    expect(uniformWeight([{ weight: 60 }, { weight: 60 }, { weight: 60 }])).toBe(60);
  });

  it('returns null when set weights disagree', () => {
    expect(uniformWeight([{ weight: 60 }, { weight: 65 }])).toBeNull();
  });

  it('ignores blank sets and matches on the remaining weights', () => {
    expect(uniformWeight([{ weight: 60 }, { weight: null }, { weight: 60 }])).toBe(60);
  });

  it('returns null when every set is blank', () => {
    expect(uniformWeight([{ weight: null }, { weight: null }])).toBeNull();
  });

  it('returns the weight for a single set', () => {
    expect(uniformWeight([{ weight: 45 }])).toBe(45);
  });
});

describe('WeeksComponent', () => {
  let view: WeeksView;
  let entriesData: WeekEntry[];
  let distanceUnitValue: 'mi' | 'km';
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
  let workoutService: {
    workouts: () => (typeof SAMPLE_WORKOUT | typeof CARDIO_WORKOUT)[];
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    entriesData = [];
    distanceUnitValue = 'mi';
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
    workoutService = {
      workouts: () => [SAMPLE_WORKOUT, ORPHAN_WORKOUT, CARDIO_WORKOUT],
      update: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [WeeksComponent],
      providers: [
        { provide: WeekService, useValue: service },
        { provide: WorkoutService, useValue: workoutService },
        { provide: ToastService, useValue: toast },
        {
          provide: SettingsService,
          useValue: {
            showSetTime: () => false,
            unit: () => 'lbs',
            muscleGroups: () => ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'],
            distanceUnit: () => distanceUnitValue,
          },
        },
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

  it('lists the reserved Cardio group first, and offers Unassigned when a group was deleted', () => {
    view.openAddModal(0);

    expect(view.muscleGroups()[0]).toBe(CARDIO_GROUP);
    expect(view.muscleGroups()).toContain('Unassigned');

    view.onMuscleGroupChange('Unassigned');

    // Cardio workouts are excluded from Unassigned even though 'Cardio' isn't
    // in the known muscleGroups list either — it has its own reserved home.
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
      trackTime: false,
      sets: [
        { reps: 10, weight: 60, time: null },
        { reps: 10, weight: 60, time: null },
        { reps: 10, weight: 60, time: null },
      ],
    });
    expect(toast.show).toHaveBeenCalledWith('Workout added!', 'success');
  });

  it('updates the workout usual weight and mentions it in the toast when every set weight agrees and differs from the saved value', async () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(3);
    view.setRows().forEach((r) => {
      r.reps = 10;
      r.weight = 70;
    });

    await view.onSubmit();

    expect(workoutService.update).toHaveBeenCalledWith('w1', {
      name: 'Bench Press',
      muscleGroup: 'Chest',
      maxWeight: 80,
      usualWeight: 70,
    });
    expect(toast.show).toHaveBeenCalledWith(
      'Workout added! Usual weight updated to 70 lbs.',
      'success'
    );
  });

  it('does not touch the usual weight when the logged sets disagree', async () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(2);
    const rows = view.setRows();
    rows[0].reps = 10;
    rows[0].weight = 70;
    rows[1].reps = 10;
    rows[1].weight = 75;

    await view.onSubmit();

    expect(workoutService.update).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Workout added!', 'success');
  });

  it('does not write back the usual weight when the logged weight matches the saved value', async () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(2);
    view.setRows().forEach((r) => (r.reps = 10)); // weight stays seeded at 60

    await view.onSubmit();

    expect(workoutService.update).not.toHaveBeenCalled();
  });

  it('ignores blank-weight sets when checking whether the logged sets agree', async () => {
    view.openAddModal(0);
    view.onWorkoutChange('w1');
    view.onSetsCountChange(3);
    const rows = view.setRows();
    rows[0].reps = 10;
    rows[0].weight = 70;
    rows[1].reps = 12;
    rows[1].weight = null; // e.g. a bodyweight set
    rows[2].reps = 10;
    rows[2].weight = 70;

    await view.onSubmit();

    expect(workoutService.update).toHaveBeenCalledWith('w1', {
      name: 'Bench Press',
      muscleGroup: 'Chest',
      maxWeight: 80,
      usualWeight: 70,
    });
  });

  it('parses an entered m:ss time into seconds on submit when tracking is on', async () => {
    view.openAddModal(0);
    view.toggleModalTrackTime(); // setting defaults off in this suite; turn it on
    expect(view.modalTrackTime()).toBe(true);
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
      trackTime: true,
      sets: [{ reps: 8, weight: 60, time: 90 }],
    });
  });

  it('clears set times when tracking is off, even if text was entered', async () => {
    view.openAddModal(0); // setting defaults off in this suite
    expect(view.modalTrackTime()).toBe(false);
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
      trackTime: false,
      sets: [{ reps: 8, weight: 60, time: null }],
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
      trackTime: false,
      sets: [{ reps: 12, weight: 60, time: null }],
    });
    expect(service.add).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Workout updated!', 'success');
  });

  it('restores tracking for a legacy entry (no trackTime) that has set times', async () => {
    const entry: WeekEntry = {
      id: 'legacy',
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      sets: [{ reps: 10, weight: 60, time: 90 }],
    };
    entriesData = [entry];

    view.openEditModal(entry);
    // No trackTime field, but a set has a time → tracking defaults on.
    expect(view.modalTrackTime()).toBe(true);

    await view.onSubmit();

    expect(service.update).toHaveBeenCalledWith('legacy', {
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      trackTime: true,
      sets: [{ reps: 10, weight: 60, time: 90 }],
    });
  });

  it('selects a newly created workout in the add-to-week form', () => {
    view.openAddModal(0); // group defaults to 'Chest'
    view.onWorkoutChange('w1');
    view.onSetsCountChange(2);

    view.onWorkoutCreated({ id: 'new-w', muscleGroup: 'Back', usualWeight: 50 });

    // The new workout's group + id are selected, and the in-progress set rows
    // are preserved (not wiped by a group change).
    expect(view.modalMuscleGroup()).toBe('Back');
    expect(view.modalWorkoutId()).toBe('new-w');
    expect(view.setRows()).toHaveLength(2);
    expect(view.setRows().every((r) => r.weight === 50)).toBe(true);
  });

  it('selects a newly created Cardio workout and resets the strength log', () => {
    view.openAddModal(0); // group defaults to 'Chest'
    view.onWorkoutChange('w1');
    view.onSetsCountChange(2);

    view.onWorkoutCreated({ id: 'new-cardio', muscleGroup: CARDIO_GROUP, usualWeight: null });

    expect(view.modalMuscleGroup()).toBe(CARDIO_GROUP);
    expect(view.modalWorkoutId()).toBe('new-cardio');
    expect(view.setRows()).toHaveLength(0);
    expect(view.cardioTimeText()).toBe('');
    expect(view.cardioDistance()).toBeNull();
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

  describe('cardio logging', () => {
    it('starts with blank cardio fields when switching to Cardio', () => {
      view.openAddModal(0);
      view.onMuscleGroupChange(CARDIO_GROUP);

      expect(view.isCardio()).toBe(true);
      expect(view.cardioTimeText()).toBe('');
      expect(view.cardioDistance()).toBeNull();
      expect(view.cardioHeartRate()).toBeNull();
      expect(view.cardioElevation()).toBeNull();
    });

    it('resets cardio fields when a different cardio workout is chosen', () => {
      view.openAddModal(0);
      view.onMuscleGroupChange(CARDIO_GROUP);
      view.onWorkoutChange('w3');
      view.cardioTimeText.set('30:00');
      view.cardioDistance.set(5);

      view.onWorkoutChange('w3'); // re-selecting (or picking another) starts fresh

      expect(view.cardioTimeText()).toBe('');
      expect(view.cardioDistance()).toBeNull();
    });

    it('computes pace from the entered duration and distance', () => {
      view.openAddModal(0);
      view.onMuscleGroupChange(CARDIO_GROUP);
      view.onWorkoutChange('w3');
      view.cardioTimeText.set('30:00');
      view.cardioDistance.set(5);

      expect(view.cardioPace()).toBe('6:00 /mi');
    });

    it('saves a cardio session with duration, distance, heart rate and elevation', async () => {
      view.openAddModal(0);
      view.onMuscleGroupChange(CARDIO_GROUP);
      view.onWorkoutChange('w3');
      view.cardioTimeText.set('30:00');
      view.cardioDistance.set(5);
      view.cardioHeartRate.set(150);
      view.cardioElevation.set(200);

      await view.onSubmit();

      expect(service.add).toHaveBeenCalledWith({
        day: 0,
        workoutId: 'w3',
        workoutName: 'Morning Run',
        muscleGroup: CARDIO_GROUP,
        sets: [],
        cardio: { time: 1800, distance: 5, heartRate: 150, elevation: 200 },
      });
      expect(toast.show).toHaveBeenCalledWith('Workout added!', 'success');
      // Cardio entries carry no sets, so the usual-weight sync must no-op.
      expect(workoutService.update).not.toHaveBeenCalled();
    });

    it('converts a km/meters display entry back to canonical miles/feet on submit', async () => {
      distanceUnitValue = 'km';
      view.openAddModal(0);
      view.onMuscleGroupChange(CARDIO_GROUP);
      view.onWorkoutChange('w3');
      view.cardioTimeText.set('30:00');
      view.cardioDistance.set(8.05);
      view.cardioElevation.set(305);

      await view.onSubmit();

      expect(service.add).toHaveBeenCalledWith({
        day: 0,
        workoutId: 'w3',
        workoutName: 'Morning Run',
        muscleGroup: CARDIO_GROUP,
        sets: [],
        cardio: {
          time: 1800,
          distance: distanceToCanonical(8.05, 'km'),
          heartRate: null,
          elevation: elevationToCanonical(305, 'km'),
        },
      });
    });

    it('requires both a duration and a distance before saving a cardio session', async () => {
      view.openAddModal(0);
      view.onMuscleGroupChange(CARDIO_GROUP);
      view.onWorkoutChange('w3');
      view.cardioTimeText.set('30:00');
      // distance left blank

      await view.onSubmit();

      expect(service.add).not.toHaveBeenCalled();
      expect(view.error()).toBeTruthy();
    });

    it('seeds cardio fields from an existing entry when editing', () => {
      const entry: WeekEntry = {
        id: 'cardio-entry',
        day: 2,
        workoutId: 'w3',
        workoutName: 'Morning Run',
        muscleGroup: CARDIO_GROUP,
        sets: [],
        cardio: { time: 1800, distance: 5, heartRate: 150, elevation: 200 },
      };

      view.openEditModal(entry);

      expect(view.isCardio()).toBe(true);
      expect(view.cardioTimeText()).toBe('30:00');
      expect(view.cardioDistance()).toBe(5);
      expect(view.cardioHeartRate()).toBe(150);
      expect(view.cardioElevation()).toBe(200);
    });

    it('updates an existing cardio entry', async () => {
      const entry: WeekEntry = {
        id: 'cardio-entry',
        day: 2,
        workoutId: 'w3',
        workoutName: 'Morning Run',
        muscleGroup: CARDIO_GROUP,
        sets: [],
        cardio: { time: 1800, distance: 5, heartRate: null, elevation: null },
      };
      entriesData = [entry];

      view.openEditModal(entry);
      view.cardioDistance.set(6);

      await view.onSubmit();

      expect(service.update).toHaveBeenCalledWith('cardio-entry', {
        day: 2,
        workoutId: 'w3',
        workoutName: 'Morning Run',
        muscleGroup: CARDIO_GROUP,
        sets: [],
        cardio: { time: 1800, distance: 6, heartRate: null, elevation: null },
      });
    });

    it('summarizes a cardio entry with duration, distance, and pace', () => {
      const entry: WeekEntry = {
        id: 'cardio-entry',
        day: 2,
        workoutId: 'w3',
        workoutName: 'Morning Run',
        muscleGroup: CARDIO_GROUP,
        sets: [],
        cardio: { time: 1800, distance: 5, heartRate: null, elevation: null },
      };

      const summary = view.entrySummary(entry);

      expect(summary).toContain('30:00');
      expect(summary).toContain('5 mi');
      expect(summary).toContain('6:00 /mi');
    });

    it('summarizes a strength entry by sets, unchanged', () => {
      const entry: WeekEntry = {
        id: 'strength-entry',
        day: 0,
        workoutId: 'w1',
        workoutName: 'Bench Press',
        muscleGroup: 'Chest',
        sets: [{ reps: 10, weight: 60 }],
      };

      expect(view.entrySummary(entry)).toBe('10×60 lbs');
    });
  });
});
