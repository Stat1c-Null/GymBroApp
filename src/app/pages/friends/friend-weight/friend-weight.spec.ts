import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendWeightComponent } from './friend-weight';
import { SettingsService } from '../../../services/settings.service';
import {
  WeightEntry,
  WeightService,
  weightChange,
  weightIn,
} from '../../../services/weight.service';

/** Typed window onto FriendWeightComponent's `protected` members. */
interface FriendWeightView {
  latest: () => WeightEntry | null;
  entries: () => WeightEntry[] | undefined;
  changeLabel: () => string | null;
  failed: () => boolean;
  shown: (entry: WeightEntry) => number;
}

/** Firestore-shaped timestamp, as `serverTimestamps: 'estimate'` hands them back. */
function at(date: Date): { toDate: () => Date } {
  return { toDate: () => date };
}

/** Newest first, as the query returns them. */
const LOG: WeightEntry[] = [
  { id: 'w3', kg: 80, lbs: 176.4, createdAt: at(new Date(2026, 7, 1)) },
  { id: 'w2', kg: 81, lbs: 178.6, createdAt: at(new Date(2026, 6, 15)) },
  { id: 'w1', kg: 82.4, lbs: 181.7, createdAt: at(new Date(2026, 6, 1)) },
];

describe('weightIn / weightChange', () => {
  it('picks the stored field for the unit instead of converting', () => {
    expect(weightIn(LOG[0], 'kg')).toBe(80);
    expect(weightIn(LOG[0], 'lbs')).toBe(176.4);
  });

  it('measures newest minus oldest across the window', () => {
    expect(weightChange(LOG, 'kg')).toBe(-2.4);
  });

  it('reports a gain as positive', () => {
    expect(weightChange([...LOG].reverse(), 'kg')).toBe(2.4);
  });

  it('returns null when there is nothing to compare against', () => {
    expect(weightChange([LOG[0]], 'kg')).toBeNull();
    expect(weightChange([], 'kg')).toBeNull();
  });

  it('returns 0 — not null — when the weight is unchanged', () => {
    const flat = [LOG[0], { ...LOG[0], id: 'older' }];
    expect(weightChange(flat, 'kg')).toBe(0);
  });
});

describe('FriendWeightComponent', () => {
  let recentFor: ReturnType<typeof vi.fn>;
  let unit: 'kg' | 'lbs';
  let view: FriendWeightView;

  function create(): void {
    const fixture = TestBed.createComponent(FriendWeightComponent);
    fixture.componentRef.setInput('uid', 'friend-1');
    fixture.componentRef.setInput('name', 'Alex');
    fixture.detectChanges();
    view = fixture.componentInstance as unknown as FriendWeightView;
  }

  beforeEach(async () => {
    unit = 'kg';
    recentFor = vi.fn((): Observable<WeightEntry[]> => of(LOG));

    await TestBed.configureTestingModule({
      imports: [FriendWeightComponent],
      providers: [
        { provide: WeightService, useValue: { recentFor } },
        {
          provide: SettingsService,
          useValue: { unit: () => unit, distanceUnit: () => 'mi' },
        },
      ],
    }).compileComponents();
  });

  it('shows the friend’s most recent weigh-in and the change since the oldest', () => {
    create();

    expect(recentFor).toHaveBeenCalledWith('friend-1');
    expect(view.latest()?.id).toBe('w3');
    expect(view.changeLabel()).toBe('−2.4 kg');
  });

  it('renders in the viewer’s unit, not the logger’s', () => {
    unit = 'lbs';
    create();

    expect(view.shown(LOG[0])).toBe(176.4);
    expect(view.changeLabel()).toBe('−5.3 lbs');
  });

  it('says "No change" rather than hiding the line when the weight held steady', () => {
    recentFor.mockReturnValue(of([LOG[0], { ...LOG[0], id: 'older' }]));
    create();

    expect(view.changeLabel()).toBe('No change');
  });

  it('offers no change at all from a single weigh-in', () => {
    recentFor.mockReturnValue(of([LOG[0]]));
    create();

    expect(view.changeLabel()).toBeNull();
  });

  it('reports a refused read as failed rather than as an empty log', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recentFor.mockReturnValue(
      throwError(() => new Error('Missing or insufficient permissions.'))
    );

    create();

    expect(view.failed()).toBe(true);
    // Crucially not `[]` — that would read as "they've never weighed in".
    expect(view.entries()).toBeUndefined();
  });
});
