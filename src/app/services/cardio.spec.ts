import { describe, expect, it } from 'vitest';
import {
  CARDIO_DISTANCE_STORAGE_UNIT,
  displayDistance,
  distanceToCanonical,
  displayElevation,
  elevationToCanonical,
  formatPace,
} from './cardio';

describe('cardio storage unit', () => {
  it('is miles', () => {
    expect(CARDIO_DISTANCE_STORAGE_UNIT).toBe('mi');
  });
});

describe('displayDistance', () => {
  it('passes miles through unchanged', () => {
    expect(displayDistance(5, 'mi')).toBe(5);
  });

  it('converts canonical miles to km', () => {
    expect(displayDistance(5, 'km')).toBeCloseTo(8.05, 2);
  });

  it('returns null for a null distance', () => {
    expect(displayDistance(null, 'km')).toBeNull();
  });
});

describe('distanceToCanonical', () => {
  it('passes miles through unchanged', () => {
    expect(distanceToCanonical(5, 'mi')).toBe(5);
  });

  it('converts km back to canonical miles', () => {
    expect(distanceToCanonical(8.05, 'km')).toBeCloseTo(5, 1);
  });
});

describe('displayElevation', () => {
  it('passes feet through unchanged', () => {
    expect(displayElevation(1000, 'mi')).toBe(1000);
  });

  it('converts canonical feet to meters', () => {
    expect(displayElevation(1000, 'km')).toBeCloseTo(305, 0);
  });

  it('returns null for a null elevation', () => {
    expect(displayElevation(null, 'km')).toBeNull();
  });
});

describe('elevationToCanonical', () => {
  it('passes feet through unchanged', () => {
    expect(elevationToCanonical(1000, 'mi')).toBe(1000);
  });

  it('converts meters back to canonical feet', () => {
    expect(elevationToCanonical(305, 'km')).toBeCloseTo(1000, -1);
  });
});

describe('formatPace', () => {
  it('formats a clean mile pace', () => {
    // 30 minutes for 5 miles = 6:00/mi
    expect(formatPace(30 * 60, 5, 'mi')).toBe('6:00 /mi');
  });

  it('formats a km pace, converting distance first', () => {
    // 25 minutes for 5 miles (~8.05 km) ≈ 3:06/km
    expect(formatPace(25 * 60, 5, 'km')).toBe('3:06 /km');
  });

  it('zero-pads seconds under 10', () => {
    // 20:05 for 4 miles = 5:01.25/mi -> rounds to 5:01
    expect(formatPace(20 * 60 + 5, 4, 'mi')).toBe('5:01 /mi');
  });

  it('returns null when time is missing', () => {
    expect(formatPace(null, 5, 'mi')).toBeNull();
  });

  it('returns null when distance is missing', () => {
    expect(formatPace(600, null, 'mi')).toBeNull();
  });

  it('returns null when distance is zero or negative', () => {
    expect(formatPace(600, 0, 'mi')).toBeNull();
    expect(formatPace(600, -1, 'mi')).toBeNull();
  });
});
