/**
 * Shared vocabulary for every analytic in the app.
 *
 * This file — and everything else in `analytics/` — is deliberately free of
 * Angular and Firestore imports so the maths can be unit tested as plain
 * functions. Only `import type` is allowed to reach into `services/`.
 */

/** A single plotted sample. `x` is epoch milliseconds; `y` is the measure. */
export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * How a series is drawn. These are *emphasis* roles, not identities.
 *
 * The burndown's four marks are all the same measure (body weight) differently
 * derived — actual, smoothed, planned, projected. They are not four competing
 * categories, so they're encoded with one accent hue plus gray, varied by dash
 * and opacity, rather than four hues. A categorical scale is only correct when
 * the series are genuinely different entities (e.g. muscle groups) — build one
 * then, not now.
 */
export type SeriesRole = 'actual' | 'trend' | 'plan' | 'projection' | 'goal';

export interface ChartSeries {
  id: string;
  label: string;
  /** Ascending by `x`. */
  points: ChartPoint[];
  role: SeriesRole;
  /** Draw a connecting line. Raw weigh-ins set this false — dots only. */
  line?: boolean;
  /** Draw a dot per point. */
  dots?: boolean;
  dashed?: boolean;
  /**
   * Fixed categorical slot for this series in a bar chart, so colour follows the
   * entity rather than its position in the (filterable) rendered list. Ignored by
   * the line chart, which colours by {@link role}.
   */
  colorIndex?: number;
}

export type TimeRangeKey = '30d' | '90d' | '6m' | '1y' | 'all';

export interface TimeRangeOption {
  key: TimeRangeKey;
  label: string;
}

/** Presets for the shared range selector, shortest first. */
export const TIME_RANGES: readonly TimeRangeOption[] = [
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: '6m', label: '6m' },
  { key: '1y', label: '1y' },
  { key: 'all', label: 'All' },
];

export interface Extent {
  min: number;
  max: number;
}
