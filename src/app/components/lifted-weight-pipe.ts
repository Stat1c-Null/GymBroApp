import { Pipe, PipeTransform } from '@angular/core';
import { WeightUnit, displayLifted } from '../services/weight.service';

/**
 * Formats a stored lifted weight for display in the user's chosen unit:
 * `{{ set.weight | lifted: unit() }}` → `"135 lbs"` / `"61.2 kg"`.
 *
 * Pass `unit` explicitly (from `SettingsService.unit()`) rather than injecting it
 * here — a pipe that reads a signal internally would be impure, and every call
 * site already has the unit to hand.
 *
 * Renders `withUnit: false` for bare numbers (e.g. inside a form input).
 */
@Pipe({ name: 'lifted', standalone: true })
export class LiftedWeightPipe implements PipeTransform {
  transform(
    lbs: number | null | undefined,
    unit: WeightUnit,
    withUnit = true
  ): string {
    const value = displayLifted(lbs ?? null, unit);
    if (value == null) return '—';
    return withUnit ? `${value} ${unit}` : `${value}`;
  }
}
