import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendWeekComponent } from './friend-week';
import { SettingsService } from '../../../services/settings.service';
import { WeekEntry, WeekService, toWeekId } from '../../../services/week.service';

/** Typed window onto FriendWeekComponent's `protected` members. */
interface FriendWeekView {
  weekStart: () => Date;
  rangeLabel: () => string;
  isCurrentWeek: () => boolean;
  entries: () => WeekEntry[] | undefined;
  failed: () => boolean;
  previousWeek: () => void;
  nextWeek: () => void;
  goToThisWeek: () => void;
}

const ENTRY: WeekEntry = {
  id: 'e1',
  day: 0,
  workoutId: 'w1',
  workoutName: 'Bench Press',
  muscleGroup: 'Chest',
  sets: [{ reps: 10, weight: 60 }],
};

describe('FriendWeekComponent', () => {
  let entriesFor: ReturnType<typeof vi.fn>;
  let fixture: ReturnType<typeof TestBed.createComponent<FriendWeekComponent>>;
  let view: FriendWeekView;

  /** Creates the component with `uid` bound, as the Friends page does. */
  function create(uid = 'friend-1'): void {
    fixture = TestBed.createComponent(FriendWeekComponent);
    fixture.componentRef.setInput('uid', uid);
    fixture.componentRef.setInput('name', 'Alex');
    fixture.detectChanges();
    view = fixture.componentInstance as unknown as FriendWeekView;
  }

  beforeEach(async () => {
    entriesFor = vi.fn((): Observable<WeekEntry[]> => of([ENTRY]));

    await TestBed.configureTestingModule({
      imports: [FriendWeekComponent],
      providers: [
        {
          provide: WeekService,
          useValue: {
            today: signal(new Date(2026, 5, 17)),
            currentWeekStart: signal(new Date(2026, 5, 15)),
            entriesFor,
          },
        },
        {
          provide: SettingsService,
          useValue: { unit: () => 'lbs', distanceUnit: () => 'mi' },
        },
      ],
    }).compileComponents();
  });

  it('reads the friend’s current week on open', () => {
    create();

    expect(entriesFor).toHaveBeenCalledWith('friend-1', '2026-06-15');
    expect(view.entries()).toEqual([ENTRY]);
    expect(view.isCurrentWeek()).toBe(true);
    expect(view.rangeLabel()).toBe('Jun 15 – Jun 21, 2026');
  });

  it('re-queries the previous week without touching the shared WeekService', () => {
    create();
    const week = TestBed.inject(WeekService);

    view.previousWeek();
    fixture.detectChanges();

    expect(entriesFor).toHaveBeenLastCalledWith('friend-1', '2026-06-08');
    expect(view.isCurrentWeek()).toBe(false);
    // The user's own Weeks page must not have moved.
    expect(toWeekId(week.currentWeekStart())).not.toBe('2026-06-08');
  });

  it('returns to the current week from "This week"', () => {
    create();

    view.previousWeek();
    fixture.detectChanges();
    view.nextWeek();
    fixture.detectChanges();
    view.goToThisWeek();
    fixture.detectChanges();

    expect(view.isCurrentWeek()).toBe(true);
  });

  it('reports a refused read as failed rather than as an empty week', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    entriesFor.mockReturnValue(
      throwError(() => new Error('Missing or insufficient permissions.'))
    );

    create();

    expect(view.failed()).toBe(true);
    // Crucially not `[]` — that would read as "they didn't train this week".
    expect(view.entries()).toBeUndefined();
  });
});
