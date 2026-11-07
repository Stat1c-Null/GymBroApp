import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CardioFieldsComponent,
  fromCardioLog,
  toCardioLog,
} from './cardio-fields';
import { SettingsService } from '../../services/settings.service';
import { DistanceUnit } from '../../services/cardio';

describe('toCardioLog', () => {
  it('stores canonical miles and feet from a miles/feet entry', () => {
    expect(
      toCardioLog(
        { timeText: '30:00', distance: 5, heartRate: 150, elevation: 200 },
        'mi'
      )
    ).toEqual({ time: 1800, distance: 5, heartRate: 150, elevation: 200 });
  });

  it('converts a km/meters entry back to canonical miles and feet', () => {
    const log = toCardioLog(
      { timeText: '25:00', distance: 10, heartRate: null, elevation: 100 },
      'km'
    );

    expect(log?.time).toBe(1500);
    expect(log?.distance).toBeCloseTo(6.2, 1);
    expect(log?.elevation).toBeCloseTo(328, 0);
  });

  it('refuses to build a log without a duration', () => {
    expect(
      toCardioLog({ timeText: '', distance: 5, heartRate: null, elevation: null }, 'mi')
    ).toBeNull();
  });

  it('refuses to build a log without a positive distance', () => {
    const blank = { timeText: '30:00', heartRate: null, elevation: null };
    expect(toCardioLog({ ...blank, distance: null }, 'mi')).toBeNull();
    expect(toCardioLog({ ...blank, distance: 0 }, 'mi')).toBeNull();
  });

  it('keeps heart rate and elevation optional', () => {
    expect(
      toCardioLog(
        { timeText: '30:00', distance: 5, heartRate: null, elevation: null },
        'mi'
      )
    ).toEqual({ time: 1800, distance: 5, heartRate: null, elevation: null });
  });
});

describe('fromCardioLog', () => {
  it('renders a stored log in the reader’s units', () => {
    const fields = fromCardioLog(
      { time: 1800, distance: 5, heartRate: 150, elevation: 200 },
      'km'
    );

    expect(fields.timeText).toBe('30:00');
    expect(fields.distance).toBeCloseTo(8, 0);
    expect(fields.heartRate).toBe(150);
  });

  it('blanks every field for a missing log, which is how the form is cleared', () => {
    expect(fromCardioLog(null, 'mi')).toEqual({
      timeText: '',
      distance: null,
      heartRate: null,
      elevation: null,
    });
  });
});

describe('CardioFieldsComponent', () => {
  let fixture: ComponentFixture<CardioFieldsComponent>;
  let distanceUnit: DistanceUnit;

  async function render(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CardioFieldsComponent],
      providers: [
        {
          provide: SettingsService,
          useValue: { distanceUnit: () => distanceUnit },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CardioFieldsComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    distanceUnit = 'mi';
  });

  /** Pace is read off the rendered hint — it's `protected`, and what matters is
   *  that the user sees it. */
  function paceText(): string {
    const hint = fixture.nativeElement.querySelector('.form-hint');
    return hint?.textContent?.trim() ?? '';
  }

  it('computes pace from the entered duration and distance', async () => {
    await render();

    fixture.componentRef.setInput('timeText', '30:00');
    fixture.componentRef.setInput('distance', 5);
    fixture.detectChanges();

    expect(paceText()).toBe('Pace: 6:00 /mi');
  });

  it('shows pace per kilometre for a km reader', async () => {
    distanceUnit = 'km';
    await render();

    fixture.componentRef.setInput('timeText', '30:00');
    fixture.componentRef.setInput('distance', 5);
    fixture.detectChanges();

    // 5:59, not 6:00 — the entered kilometres go to canonical miles and back,
    // and `convertWeight`-style 1-decimal rounding loses a second on the way.
    // Long-standing behaviour of the distance conversion, asserted here so a
    // change to it is a deliberate one rather than a surprise.
    expect(paceText()).toBe('Pace: 5:59 /km');
  });

  it('shows no pace until both duration and distance are entered', async () => {
    await render();

    fixture.componentRef.setInput('timeText', '30:00');
    fixture.detectChanges();

    expect(paceText()).toBe('');
  });
});
