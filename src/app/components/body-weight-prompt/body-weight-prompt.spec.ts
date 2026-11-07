import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BodyWeightPromptComponent } from './body-weight-prompt';
import { WeightService, WeightEntry, convertWeight } from '../../services/weight.service';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';

/** Typed window onto BodyWeightPromptComponent's `protected` members. */
interface PromptView {
  needed: () => boolean;
  value: WritableSignal<number | null>;
  error: () => string;
  log: () => Promise<void>;
  onEnter: (event: Event) => void;
}

describe('BodyWeightPromptComponent', () => {
  let fixture: ComponentFixture<BodyWeightPromptComponent>;
  let view: PromptView;
  let weighIns: WritableSignal<WeightEntry[] | undefined>;
  let unitValue: 'kg' | 'lbs';
  let service: { weights: () => WeightEntry[] | undefined; add: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    weighIns = signal<WeightEntry[] | undefined>([]);
    unitValue = 'lbs';
    service = {
      weights: () => weighIns(),
      add: vi.fn().mockResolvedValue(undefined),
    };
    toast = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [BodyWeightPromptComponent],
      providers: [
        { provide: WeightService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: SettingsService, useValue: { unit: () => unitValue } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BodyWeightPromptComponent);
    view = fixture.componentInstance as unknown as PromptView;
  });

  /** Whether the prompt actually rendered anything into the DOM. */
  function rendered(): boolean {
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.bw-prompt') != null;
  }

  it('shows only when the weight log is loaded and empty', () => {
    expect(view.needed()).toBe(true);
    expect(rendered()).toBe(true);
  });

  it('renders nothing while the log is still loading', () => {
    weighIns.set(undefined);
    expect(view.needed()).toBe(false);
    expect(rendered()).toBe(false);
  });

  it('renders nothing once a weight is logged', () => {
    weighIns.set([{ id: 'wt1', kg: 80, lbs: 176.4 }]);
    expect(view.needed()).toBe(false);
    expect(rendered()).toBe(false);
  });

  it('stores both units from a weight entered in pounds', async () => {
    view.value.set(176.4);

    await view.log();

    expect(service.add).toHaveBeenCalledWith({
      kg: convertWeight(176.4, 'lbs'),
      lbs: 176.4,
    });
    expect(toast.show).toHaveBeenCalledWith('Weight logged!', 'success');
  });

  it('stores both units from a weight entered in kilograms', async () => {
    unitValue = 'kg';
    view.value.set(80);

    await view.log();

    // The entered number is kept exactly as typed; only the other unit is
    // derived, so no rounding touches what the user actually weighed.
    expect(service.add).toHaveBeenCalledWith({ kg: 80, lbs: convertWeight(80, 'kg') });
  });

  it('rejects a blank or non-positive weight without calling the service', async () => {
    await view.log(); // nothing entered
    expect(service.add).not.toHaveBeenCalled();
    expect(view.error()).toBeTruthy();

    view.value.set(0);
    await view.log();
    expect(service.add).not.toHaveBeenCalled();
  });

  it('surfaces a failed save inline and keeps the entered value', async () => {
    service.add.mockRejectedValueOnce(new Error('offline'));
    view.value.set(180);

    await view.log();

    expect(view.error()).toBeTruthy();
    expect(view.value()).toBe(180); // still there to retry with
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('logs the weight on Enter instead of submitting the surrounding form', async () => {
    view.value.set(180);
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

    view.onEnter(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(service.add).toHaveBeenCalled();
  });
});
