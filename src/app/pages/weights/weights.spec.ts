import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeightsComponent } from './weights';
import { WeightService, convertWeight } from '../../services/weight.service';
import { ToastService } from '../../services/toast.service';

interface EntryLike {
  id?: string;
  kg: number;
  lbs: number;
}

/** Typed window onto WeightsComponent's `protected` members. */
interface WeightsView {
  kg: number | null;
  lbs: number | null;
  onSubmit: () => Promise<void>;
  onDelete: (entry: EntryLike) => Promise<void>;
  error: () => string;
}

describe('convertWeight', () => {
  it('converts kilograms to pounds', () => {
    expect(convertWeight(100, 'kg')).toBe(220.5);
  });

  it('converts pounds to kilograms', () => {
    expect(convertWeight(220.5, 'lbs')).toBe(100);
  });
});

describe('WeightsComponent', () => {
  let view: WeightsView;
  let service: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    weights: () => unknown[];
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      weights: () => [],
    };
    toast = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [WeightsComponent],
      providers: [
        { provide: WeightService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    view = TestBed.createComponent(WeightsComponent)
      .componentInstance as unknown as WeightsView;
  });

  it('fills in pounds from kilograms when pounds is left blank', async () => {
    view.kg = 100;
    view.lbs = null;

    await view.onSubmit();

    expect(service.add).toHaveBeenCalledWith({ kg: 100, lbs: 220.5 });
    expect(toast.show).toHaveBeenCalledWith('Weight logged!', 'success');
  });

  it('fills in kilograms from pounds when kilograms is left blank', async () => {
    view.kg = null;
    view.lbs = 220.5;

    await view.onSubmit();

    expect(service.add).toHaveBeenCalledWith({ kg: 100, lbs: 220.5 });
  });

  it('rejects an empty form without calling the service', async () => {
    view.kg = null;
    view.lbs = null;

    await view.onSubmit();

    expect(service.add).not.toHaveBeenCalled();
    expect(view.error()).toBeTruthy();
  });

  it('deletes an entry once the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await view.onDelete({ id: 'abc123', kg: 100, lbs: 220.5 });

    expect(service.remove).toHaveBeenCalledWith('abc123');
    expect(toast.show).toHaveBeenCalledWith('Entry deleted', 'success');
  });

  it('does not delete when the user cancels the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await view.onDelete({ id: 'abc123', kg: 100, lbs: 220.5 });

    expect(service.remove).not.toHaveBeenCalled();
  });
});
