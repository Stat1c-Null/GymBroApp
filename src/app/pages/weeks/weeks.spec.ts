import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
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
import { WorkoutService, Workout, CARDIO_GROUP } from '../../services/workout.service';
import {
  SetItem,
  WorkoutSet,
  WorkoutSetService,
} from '../../services/workout-set.service';
import { WeightService, WeightEntry } from '../../services/weight.service';
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
  toggleModalNotes: () => void;
  modalHasNotes: () => boolean;
  modalNotes: WritableSignal<string>;
  onWorkoutCreated: (workout: Workout) => void;
  setRows: () => { reps: number | null; weight: number | null; timeText: string }[];
  error: () => string;
  editingId: () => string | null;
  showModal: () => boolean;
  muscleGroups: () => string[];
  modalMuscleGroup: () => string;
  modalWorkoutId: () => string;
  filteredWorkouts: () => { id?: string }[];
  isCardio: () => boolean;
  isBodyWeight: () => boolean;
  bodyWeightDisplay: () => number | null;
  cardioTimeText: WritableSignal<string>;
  cardioDistance: WritableSignal<number | null>;
  cardioHeartRate: WritableSignal<number | null>;
  cardioElevation: WritableSignal<number | null>;
  // --- the day's "+": one workout, or a whole saved set ---
  openAddChoice: (day: number) => void;
  choose: (choice: 'workout' | 'set') => void;
  showAddChoice: () => boolean;
  showSetPicker: () => boolean;
  activeDayLabel: () => string;
  applySet: (set: WorkoutSet) => Promise<void>;
  itemNames: (set: WorkoutSet) => string;
  // --- "save this day as a set" ---
  onSaveDayAsSet: (day: number) => void;
  showSaveDay: () => boolean;
  saveDayItems: () => SetItem[];
  saveDayName: () => string;
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

const CARDIO_WORKOUT: Workout = {
  id: 'w3',
  name: 'Morning Run',
  muscleGroup: CARDIO_GROUP,
  usualWeight: null,
  maxWeight: null,
};

/** A body-weight exercise: no usual/max weight of its own — every set is
 *  filled in from the user's latest weigh-in. */
const BODYWEIGHT_WORKOUT: Workout = {
  id: 'w4',
  name: 'Pull-ups',
  muscleGroup: 'Back',
  usualWeight: null,
  maxWeight: null,
  bodyWeight: true,
};

/** Weigh-ins are read newest-first, so index 0 is the current body weight.
 *  Both units are stored on every entry — see `WeightEntry`. */
const WEIGH_INS: WeightEntry[] = [
  { id: 'wt2', kg: 80, lbs: 176.4 },
  { id: 'wt1', kg: 81, lbs: 178.6 },
];

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
  let fixture: ComponentFixture<WeeksComponent>;
  let view: WeeksView;
  let entriesData: WeekEntry[];
  let distanceUnitValue: 'mi' | 'km';
  let unitValue: 'kg' | 'lbs';
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
    addMany: ReturnType<typeof vi.fn>;
  };
  /** The saved sets the "+ → Add a set" picker sees. Most tests don't care;
   *  the ones that do assign to `savedSets` before rendering. */
  let savedSets: WorkoutSet[];
  let setService: { sets: () => WorkoutSet[] | undefined };
  let toast: { show: ReturnType<typeof vi.fn> };
  let workoutService: {
    workouts: () => Workout[];
    update: ReturnType<typeof vi.fn>;
  };
  let weighIns: WritableSignal<WeightEntry[] | undefined>;
  let weightService: { weights: () => WeightEntry[] | undefined };

  beforeEach(async () => {
    entriesData = [];
    savedSets = [];
    distanceUnitValue = 'mi';
    unitValue = 'lbs';
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
      addMany: vi.fn().mockResolvedValue(undefined),
    };
    setService = { sets: () => savedSets };
    toast = { show: vi.fn() };
    workoutService = {
      workouts: () => [
        SAMPLE_WORKOUT,
        ORPHAN_WORKOUT,
        CARDIO_WORKOUT,
        BODYWEIGHT_WORKOUT,
      ],
      update: vi.fn().mockResolvedValue(undefined),
    };
    // A signal so a test can land the log *after* the modal is already open,
    // the way the live Firestore stream does.
    weighIns = signal<WeightEntry[] | undefined>(WEIGH_INS);
    weightService = { weights: () => weighIns() };

    await TestBed.configureTestingModule({
      imports: [WeeksComponent],
      providers: [
        { provide: WeekService, useValue: service },
        { provide: WorkoutService, useValue: workoutService },
        { provide: WorkoutSetService, useValue: setService },
        { provide: WeightService, useValue: weightService },
        { provide: ToastService, useValue: toast },
        {
          provide: SettingsService,
          useValue: {
            showSetTime: () => false,
            unit: () => unitValue,
            muscleGroups: () => ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'],
            distanceUnit: () => distanceUnitValue,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WeeksComponent);
    view = fixture.componentInstance as unknown as WeeksView;
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
      notes: '',
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
      notes: '',
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
      notes: '',
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
      notes: '',
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
      notes: '',
      trackTime: true,
      sets: [{ reps: 10, weight: 60, time: 90 }],
    });
  });

  it('selects a newly created workout in the add-to-week form', () => {
    view.openAddModal(0); // group defaults to 'Chest'
    view.onWorkoutChange('w1');
    view.onSetsCountChange(2);

    view.onWorkoutCreated({
      id: 'new-w',
      name: 'Barbell Row',
      muscleGroup: 'Back',
      usualWeight: 50,
      maxWeight: 70,
    });

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

    view.onWorkoutCreated({
      id: 'new-cardio',
      name: 'Evening Run',
      muscleGroup: CARDIO_GROUP,
      usualWeight: null,
      maxWeight: null,
    });

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

    // Pace moved to CardioFieldsComponent when the set builder needed the same
    // fields — it's covered in cardio-fields.spec.ts now.

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
        notes: '',
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
        notes: '',
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
        notes: '',
        sets: [],
        cardio: { time: 1800, distance: 6, heartRate: null, elevation: null },
      });
    });
  });

  describe('body-weight exercises', () => {
    it('fills every set with the latest weigh-in instead of a usual weight', () => {
      view.openAddModal(0);
      view.onMuscleGroupChange('Back');
      view.onWorkoutChange('w4');
      view.onSetsCountChange(3);

      expect(view.isBodyWeight()).toBe(true);
      expect(view.bodyWeightDisplay()).toBe(176.4);
      // Newest weigh-in, not the older one.
      expect(view.setRows().map((r) => r.weight)).toEqual([176.4, 176.4, 176.4]);
    });

    it('saves the weigh-in as each set’s weight', async () => {
      view.openAddModal(0);
      view.onMuscleGroupChange('Back');
      view.onWorkoutChange('w4');
      view.onSetsCountChange(2);
      view.setRows().forEach((r) => (r.reps = 8));

      await view.onSubmit();

      expect(service.add).toHaveBeenCalledWith({
        day: 0,
        workoutId: 'w4',
        workoutName: 'Pull-ups',
        muscleGroup: 'Back',
        notes: '',
        trackTime: false,
        sets: [
          { reps: 8, weight: 176.4, time: null },
          { reps: 8, weight: 176.4, time: null },
        ],
      });
    });

    it('never writes the body weight back as the workout’s usual weight', async () => {
      view.openAddModal(0);
      view.onMuscleGroupChange('Back');
      view.onWorkoutChange('w4');
      view.onSetsCountChange(2);
      view.setRows().forEach((r) => (r.reps = 8));

      await view.onSubmit();

      // Every set agrees on one weight, which would normally sync back — but
      // that would freeze one day's body weight into the library.
      expect(workoutService.update).not.toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith('Workout added!', 'success');
    });

    it('shows kg from the weigh-in’s own field but still stores canonical lbs', async () => {
      unitValue = 'kg';
      view.openAddModal(0);
      view.onMuscleGroupChange('Back');
      view.onWorkoutChange('w4');
      view.onSetsCountChange(1);
      view.setRows()[0].reps = 8;

      // Read straight off WeightEntry.kg — not lbs re-converted (176.4 lbs →
      // 80.0 kg here, but rounding makes that coincidence unreliable).
      expect(view.setRows()[0].weight).toBe(80);

      await view.onSubmit();

      expect(service.add).toHaveBeenCalledWith(
        expect.objectContaining({ sets: [{ reps: 8, weight: 176.4, time: null }] })
      );
    });

    it('leaves the weight blank when nothing has ever been weighed in', async () => {
      weighIns.set([]);
      view.openAddModal(0);
      view.onMuscleGroupChange('Back');
      view.onWorkoutChange('w4');
      view.onSetsCountChange(1);
      view.setRows()[0].reps = 8;

      expect(view.bodyWeightDisplay()).toBeNull();

      await view.onSubmit();

      expect(service.add).toHaveBeenCalledWith(
        expect.objectContaining({ sets: [{ reps: 8, weight: null, time: null }] })
      );
    });

    it('fills the rows in when the weigh-in log arrives after the modal is open', () => {
      weighIns.set(undefined); // still loading
      view.openAddModal(0);
      view.onMuscleGroupChange('Back');
      view.onWorkoutChange('w4');
      view.onSetsCountChange(2);
      expect(view.setRows().every((r) => r.weight === null)).toBe(true);

      weighIns.set(WEIGH_INS);
      fixture.detectChanges(); // runs the re-seed effect

      expect(view.setRows().map((r) => r.weight)).toEqual([176.4, 176.4]);
    });

    it('keeps the weight an entry was logged at when editing, not today’s', () => {
      const entry: WeekEntry = {
        id: 'old-pullups',
        day: 1,
        workoutId: 'w4',
        workoutName: 'Pull-ups',
        muscleGroup: 'Back',
        sets: [{ reps: 8, weight: 190 }],
      };
      entriesData = [entry];

      view.openEditModal(entry);

      expect(view.isBodyWeight()).toBe(true);
      // 190 lbs then, 176.4 lbs now — history keeps what actually happened.
      expect(view.setRows()[0].weight).toBe(190);
    });

    it('does not let a weigh-in arriving mid-edit rewrite the logged weight', () => {
      const entry: WeekEntry = {
        id: 'old-pullups',
        day: 1,
        workoutId: 'w4',
        workoutName: 'Pull-ups',
        muscleGroup: 'Back',
        sets: [{ reps: 8, weight: 190 }],
      };
      entriesData = [entry];

      view.openEditModal(entry);
      weighIns.set([{ id: 'wt3', kg: 79, lbs: 174.2 }]);
      fixture.detectChanges(); // the re-seed effect must skip an entry being edited

      expect(view.setRows()[0].weight).toBe(190);
    });
  });

  describe('workout notes', () => {
    const notedEntry = (): WeekEntry => ({
      id: 'noted',
      day: 0,
      workoutId: 'w1',
      workoutName: 'Bench Press',
      muscleGroup: 'Chest',
      notes: 'Felt strong',
      sets: [{ reps: 10, weight: 60 }],
    });

    it('saves a trimmed note when the toggle is on', async () => {
      view.openAddModal(0);
      view.onWorkoutChange('w1');
      view.onSetsCountChange(1);
      view.setRows()[0].reps = 8;
      view.toggleModalNotes();
      view.modalNotes.set('  Shoulder tight on the warmup  ');

      await view.onSubmit();

      expect(service.add).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Shoulder tight on the warmup' })
      );
    });

    it('saves no note when the toggle is off, even if text was entered', async () => {
      view.openAddModal(0);
      view.onWorkoutChange('w1');
      view.onSetsCountChange(1);
      view.setRows()[0].reps = 8;
      view.modalNotes.set('typed, then thought better of it');
      expect(view.modalHasNotes()).toBe(false);

      await view.onSubmit();

      expect(service.add).toHaveBeenCalledWith(
        expect.objectContaining({ notes: '' })
      );
    });

    it('turns the toggle on and seeds the text when editing an entry that has a note', () => {
      view.openEditModal(notedEntry());

      expect(view.modalHasNotes()).toBe(true);
      expect(view.modalNotes()).toBe('Felt strong');
    });

    it("writes '' when an existing note is toggled off, so updateDoc clears it", async () => {
      const entry = notedEntry();
      entriesData = [entry];

      view.openEditModal(entry);
      view.toggleModalNotes();
      expect(view.modalHasNotes()).toBe(false);

      await view.onSubmit();

      expect(service.update).toHaveBeenCalledWith(
        'noted',
        expect.objectContaining({ notes: '' })
      );
    });

    it('saves a note on a cardio session too', async () => {
      view.openAddModal(0);
      view.onMuscleGroupChange(CARDIO_GROUP);
      view.onWorkoutChange('w3');
      view.cardioTimeText.set('30:00');
      view.cardioDistance.set(5);
      view.toggleModalNotes();
      view.modalNotes.set('Windy out');

      await view.onSubmit();

      expect(service.add).toHaveBeenCalledWith(
        expect.objectContaining({
          muscleGroup: CARDIO_GROUP,
          notes: 'Windy out',
        })
      );
    });
  });

  describe('adding a saved set to a day', () => {
    /** A saved set holding Bench Press (already in the library) and Dips. */
    function pushDay(): WorkoutSet {
      return {
        id: 's1',
        name: 'Push Day',
        description: 'Chest and arms',
        items: [
          {
            workoutId: 'w1',
            workoutName: 'Bench Press',
            muscleGroup: 'Chest',
            notes: '',
            trackTime: false,
            sets: [
              { reps: 10, weight: 135, time: null },
              { reps: 8, weight: 135, time: null },
            ],
          },
          {
            workoutId: 'w5',
            workoutName: 'Dips',
            muscleGroup: 'Arms',
            notes: 'slow',
            trackTime: false,
            sets: [{ reps: 12, weight: null, time: null }],
          },
        ],
      };
    }

    it('asks which kind of add the "+" means before opening either form', () => {
      view.openAddChoice(2);

      expect(view.showAddChoice()).toBe(true);
      expect(view.showModal()).toBe(false);
      expect(view.activeDayLabel()).toBe('Wed');
    });

    it('opens the logging form for "workout"', () => {
      view.openAddChoice(2);
      view.choose('workout');

      expect(view.showAddChoice()).toBe(false);
      expect(view.showModal()).toBe(true);
      expect(view.editingId()).toBeNull();
    });

    it('opens the set picker for "set"', () => {
      view.openAddChoice(2);
      view.choose('set');

      expect(view.showAddChoice()).toBe(false);
      expect(view.showSetPicker()).toBe(true);
      expect(view.showModal()).toBe(false);
    });

    it('writes every exercise in one batch, on the chosen day', async () => {
      view.openAddChoice(3);
      view.choose('set');

      await view.applySet(pushDay());

      expect(service.addMany).toHaveBeenCalledTimes(1);
      const written = service.addMany.mock.calls[0][0];
      expect(written).toHaveLength(2);
      expect(written.map((e: WeekEntry) => e.workoutName)).toEqual([
        'Bench Press',
        'Dips',
      ]);
      expect(written.every((e: WeekEntry) => e.day === 3)).toBe(true);
      expect(view.showSetPicker()).toBe(false);
    });

    it('reports how many were added', async () => {
      view.openAddChoice(0);
      await view.applySet(pushDay());

      expect(toast.show).toHaveBeenCalledWith(
        'Added 2 exercises from Push Day.',
        'success'
      );
    });

    it('skips what that day already has, and says which', async () => {
      entriesData = [
        {
          id: 'e1',
          day: 0,
          workoutId: 'w1',
          workoutName: 'Bench Press',
          muscleGroup: 'Chest',
          sets: [{ reps: 10, weight: 135 }],
        },
      ];
      view.openAddChoice(0);

      await view.applySet(pushDay());

      const written = service.addMany.mock.calls[0][0];
      expect(written.map((e: WeekEntry) => e.workoutName)).toEqual(['Dips']);
      expect(toast.show).toHaveBeenCalledWith(
        'Added 1 exercise from Push Day. Bench Press was already logged.',
        'success'
      );
    });

    it('writes nothing and explains when the whole set is already logged', async () => {
      entriesData = pushDay().items.map((item, i) => ({
        id: `e${i}`,
        day: 0,
        workoutId: item.workoutId,
        workoutName: item.workoutName,
        muscleGroup: item.muscleGroup,
        sets: [],
      }));
      view.openAddChoice(0);

      await view.applySet(pushDay());

      expect(service.addMany).not.toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith(
        'Everything in Push Day is already logged on Mon.',
        'error'
      );
    });

    it('fills a body-weight exercise from the latest weigh-in, not the set', async () => {
      const set: WorkoutSet = {
        id: 's2',
        name: 'Pull Day',
        description: '',
        items: [
          {
            workoutId: 'w4',
            workoutName: 'Pull-ups',
            muscleGroup: 'Back',
            bodyWeight: true,
            notes: '',
            trackTime: false,
            sets: [{ reps: 10, weight: null, time: null }],
          },
        ],
      };
      view.openAddChoice(0);

      await view.applySet(set);

      const written = service.addMany.mock.calls[0][0];
      expect(written[0].sets).toEqual([{ reps: 10, weight: 176.4, time: null }]);
    });

    it('never writes back to the exercise library', async () => {
      view.openAddChoice(0);
      await view.applySet(pushDay());

      // The set's uniform 135 differs from SAMPLE_WORKOUT's usualWeight of 60,
      // which a hand-logged entry would sync — a template must not.
      expect(workoutService.update).not.toHaveBeenCalled();
    });

    it('keeps the picker open and says so when the write fails', async () => {
      service.addMany.mockRejectedValueOnce(new Error('offline'));
      view.openAddChoice(0);
      view.choose('set');

      await view.applySet(pushDay());

      expect(toast.show).toHaveBeenCalledWith(
        'Could not add that set. Please try again.',
        'error'
      );
      expect(view.showSetPicker()).toBe(true);
    });

    it('lists a set’s exercises so the picker can be read at a glance', () => {
      expect(view.itemNames(pushDay())).toBe('Bench Press · Dips');
    });
  });

  describe('saving a day as a set', () => {
    beforeEach(() => {
      entriesData = [
        {
          id: 'e1',
          day: 1,
          workoutId: 'w1',
          workoutName: 'Bench Press',
          muscleGroup: 'Chest',
          notes: 'felt good',
          sets: [{ reps: 10, weight: 135 }],
        },
        {
          id: 'e2',
          day: 1,
          workoutId: 'w4',
          workoutName: 'Pull-ups',
          muscleGroup: 'Back',
          sets: [{ reps: 10, weight: 176.4 }],
        },
      ];
    });

    it('opens the builder pre-filled from that day, with a suggested name', () => {
      view.onSaveDayAsSet(1);

      expect(view.showSaveDay()).toBe(true);
      expect(view.saveDayName()).toBe('Tue session');
      expect(view.saveDayItems().map((i) => i.workoutName)).toEqual([
        'Bench Press',
        'Pull-ups',
      ]);
    });

    it('carries each entry’s notes and sets across', () => {
      view.onSaveDayAsSet(1);

      const [bench] = view.saveDayItems();
      expect(bench.notes).toBe('felt good');
      expect(bench.sets).toEqual([{ reps: 10, weight: 135 }]);
    });

    it('captures a body-weight exercise without a weight', () => {
      view.onSaveDayAsSet(1);

      const pullups = view.saveDayItems()[1];
      expect(pullups.bodyWeight).toBe(true);
      expect(pullups.sets).toEqual([{ reps: 10, weight: null }]);
    });

    it('does nothing for a day with nothing logged', () => {
      view.onSaveDayAsSet(5);

      expect(view.showSaveDay()).toBe(false);
    });
  });
});
