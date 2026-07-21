import { Injectable, computed, inject } from '@angular/core';
import { Theme, ThemeService } from '../../services/theme.service';
import { SeriesRole } from '../../analytics/chart.types';

/**
 * Colours for canvas charts.
 *
 * Chart.js draws to a `<canvas>`, which cannot read CSS custom properties — so the
 * app's `--*` tokens are unreachable from the chart. The obvious workaround, reading
 * `getComputedStyle(document.documentElement)` whenever the theme flips, is a trap:
 * `ThemeService` sets `data-theme` inside an `effect()`, and effect-vs-computed
 * ordering across injectors isn't guaranteed, so the palette can read the *previous*
 * theme's values. That's a real correctness bug, not a style nit.
 *
 * So chart colours are defined here in TypeScript instead, keyed by theme. This is
 * deterministic and testable, and it stays a single source of truth because the
 * legend swatches bind from this same object rather than from CSS.
 *
 * Values mirror `src/styles.css`. If you change a token there, change it here too —
 * there is no automatic link.
 */
export interface ChartPalette {
  /** Axis tick labels. */
  text: string;
  /** Gridlines — recessive, one shade off the surface, never dashed. */
  grid: string;
  /** Tooltip background. */
  surfaceRaised: string;
  /** Ring drawn around dots so overlapping marks stay separable. */
  surface: string;
  /** The accent: the user's actual weight and everything derived from it. */
  accent: string;
  /** Translucent accent for raw weigh-in dots. */
  accentSoft: string;
  /** Gray: the plan line and other context marks. */
  context: string;
  good: string;
  bad: string;
  /**
   * A fixed-order categorical scale for charts whose series are genuinely different
   * entities (one exercise per series). Assigned by slot index, never cycled — a 9th
   * series folds to "Other" rather than reusing slot 1. These are the dataviz skill's
   * validated reference hues (worst adjacent CVD ΔE ≈ 9 light / 8 dark), stepped per
   * theme; the always-present legend + sr-only table cover the few light-surface
   * slots below 3:1 contrast.
   */
  categorical: string[];
}

/**
 * Deliberately one accent hue plus gray — not a categorical scale.
 *
 * The burndown's marks (actual, trend, plan, projection) are all the same measure,
 * differently derived. They're distinguished by dash, opacity and mark type, which
 * is the honest encoding for an emphasis chart. A categorical palette is only right
 * when series are genuinely different entities — that scale now exists as the
 * `categorical` slot below (validated with the CVD script), used by the bar chart.
 */
export const CHART_PALETTE: Record<Theme, ChartPalette> = {
  dark: {
    text: 'hsl(0, 0%, 68%)', // --text-secondary
    grid: 'hsla(0, 0%, 100%, 0.06)', // --border-subtle
    surfaceRaised: 'hsl(240, 12%, 12%)', // --bg-secondary
    surface: 'hsl(240, 14%, 11%)', // the glass card composited over --bg-primary
    accent: 'hsl(270, 80%, 60%)', // --primary
    accentSoft: 'hsla(270, 80%, 60%, 0.45)',
    context: 'hsl(0, 0%, 48%)', // --text-muted
    good: 'hsl(145, 65%, 50%)', // --success
    bad: 'hsl(0, 80%, 60%)', // --error
    categorical: [
      '#3987e5', // blue
      '#008300', // green
      '#d55181', // magenta
      '#c98500', // yellow
      '#199e70', // aqua
      '#d95926', // orange
      '#9085e9', // violet
      '#e66767', // red
    ],
  },
  light: {
    text: 'hsl(240, 5%, 40%)',
    grid: 'hsla(0, 0%, 0%, 0.06)',
    surfaceRaised: 'hsl(0, 0%, 100%)',
    surface: 'hsl(240, 20%, 99%)',
    accent: 'hsl(270, 80%, 60%)',
    accentSoft: 'hsla(270, 80%, 60%, 0.45)',
    context: 'hsl(240, 5%, 58%)',
    good: 'hsl(145, 60%, 40%)',
    bad: 'hsl(0, 75%, 50%)',
    categorical: [
      '#2a78d6', // blue
      '#008300', // green
      '#e87ba4', // magenta
      '#eda100', // yellow
      '#1baf7a', // aqua
      '#eb6834', // orange
      '#4a3aa7', // violet
      '#e34948', // red
    ],
  },
};

/** The stroke colour for each emphasis role. */
export function roleColor(role: SeriesRole, palette: ChartPalette): string {
  switch (role) {
    case 'actual':
      return palette.accentSoft;
    case 'trend':
      return palette.accent;
    case 'projection':
      return palette.accentSoft;
    case 'plan':
    case 'goal':
      return palette.context;
  }
}

/**
 * The fill/stroke colour for categorical slot `index`, by entity order. Not cycled:
 * callers cap the series count so identity never collides; an out-of-range index
 * falls back to the recessive context gray.
 */
export function categoricalColor(index: number, palette: ChartPalette): string {
  return palette.categorical[index] ?? palette.context;
}

@Injectable({ providedIn: 'root' })
export class ChartThemeService {
  /** The app's ThemeService — not ng2-charts', which exports one of the same name. */
  private readonly theme = inject(ThemeService).theme;

  readonly palette = computed<ChartPalette>(() => CHART_PALETTE[this.theme()]);
}
