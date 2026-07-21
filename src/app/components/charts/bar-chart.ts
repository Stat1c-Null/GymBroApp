import { Component, computed, inject, input } from '@angular/core';
import { ChartConfiguration, ChartDataset } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ChartSeries, Extent } from '../../analytics/chart.types';
import { ChartThemeService, categoricalColor } from './chart-palette';

/**
 * A grouped bar chart for comparing genuinely different entities over time — one
 * series per entity (e.g. one exercise per bar colour), grouped at each date.
 *
 * The sibling of {@link LineChartComponent}, and the second (and only other) place
 * Chart.js is touched. Where the line chart uses one accent hue for one measure
 * differently derived, this one uses the fixed-order **categorical** palette: colour
 * carries identity, so each series keeps its colour as the selection changes.
 *
 * The x scale is `category`, not the line chart's linear epoch scale: bars sit in
 * labelled slots, and each session is a discrete bucket rather than a point on a
 * continuous timeline. Labels come from `formatX`; a series with no value at a given
 * date contributes a gap there, not a zero.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [BaseChartDirective],
  // Same rationale as line-chart: register Chart.js here, not in app.config, so its
  // ~208kB stays in the lazy Analytics chunk rather than the initial bundle.
  providers: [provideCharts(withDefaultRegisterables())],
  template: `
    <div class="chart-box" [style.height.px]="height()">
      <canvas
        baseChart
        type="bar"
        [data]="data()"
        [options]="options()"
        [attr.aria-label]="ariaLabel()"
      ></canvas>
    </div>

    <!-- The WCAG-clean twin of the chart: a real DOM table of the same numbers,
         hidden visually but always present for assistive tech (a canvas is opaque
         to it, and colour must never be the only channel carrying identity). -->
    <table class="sr-only">
      <caption>
        {{ ariaLabel() }}
      </caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          @for (s of tableSeries(); track s.id) {
            <th scope="col">{{ s.label }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of tableRows(); track row.x) {
          <tr>
            <th scope="row">{{ formatX()(row.x) }}</th>
            @for (cell of row.cells; track $index) {
              <td>{{ cell == null ? '—' : formatY()(cell) }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [
    `
      .chart-box {
        position: relative;
        width: 100%;
      }
    `,
  ],
})
export class BarChartComponent {
  private readonly chartTheme = inject(ChartThemeService);

  readonly series = input.required<ChartSeries[]>();
  readonly height = input(300);
  readonly yDomain = input<Extent | null>(null);
  readonly formatX = input<(v: number) => string>((v) => String(v));
  readonly formatY = input<(v: number) => string>((v) => String(v));
  /** Summarises the chart for screen readers; also the table's caption. */
  readonly ariaLabel = input.required<string>();

  /** Series that actually have data, in slot order — the legend and colour order. */
  protected readonly tableSeries = computed(() =>
    this.series().filter((s) => s.points.length > 0)
  );

  /** Distinct x values across every series, ascending — the category slots. */
  private readonly categories = computed<number[]>(() =>
    [...new Set(this.series().flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b)
  );

  protected readonly data = computed<ChartConfiguration<'bar'>['data']>(() => {
    const palette = this.chartTheme.palette();
    const cats = this.categories();
    return {
      labels: cats.map((x) => this.formatX()(x)),
      datasets: this.series().map((s, i): ChartDataset<'bar'> => {
        const color = categoricalColor(s.colorIndex ?? i, palette);
        const byX = new Map(s.points.map((p) => [p.x, p.y]));
        return {
          label: s.label,
          // Aligned to the category slots; a missing value is a gap, not a 0 bar.
          data: cats.map((x) => byX.get(x) ?? null),
          backgroundColor: color,
          borderColor: color,
          // 4px rounded data-end anchored to the baseline (dataviz mark spec).
          borderRadius: 4,
          maxBarThickness: 34,
          // A 2px surface gap keeps adjacent bars in a group separable.
          borderWidth: { top: 0, right: 1, bottom: 0, left: 1 },
        };
      }),
    };
  });

  protected readonly options = computed<ChartConfiguration<'bar'>['options']>(() => {
    const palette = this.chartTheme.palette();
    const formatY = this.formatY();
    const y = this.yDomain();

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 200 },
      layout: { padding: { top: 8, right: 8 } },
      scales: {
        x: {
          type: 'category',
          border: { color: palette.grid },
          // No vertical gridlines on a category axis — the bars are the marks.
          grid: { display: false },
          ticks: {
            color: palette.text,
            font: { family: 'Inter', size: 11 },
            maxRotation: 0,
            autoSkipPadding: 16,
          },
        },
        y: {
          type: 'linear',
          // Bars encode magnitude by length, so their axis MUST start at zero —
          // unlike the line chart, a floating baseline would lie about ratios.
          beginAtZero: true,
          min: y?.min,
          max: y?.max,
          border: { display: false },
          grid: { color: palette.grid },
          ticks: {
            color: palette.text,
            font: { family: 'Inter', size: 11 },
            maxTicksLimit: 6,
            callback: (value) => formatY(Number(value)),
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: palette.text,
            font: { family: 'Inter', size: 11 },
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            padding: 16,
            filter: (item) => item.text !== '',
          },
        },
        tooltip: {
          backgroundColor: palette.surfaceRaised,
          titleColor: palette.text,
          bodyColor: palette.text,
          borderColor: palette.grid,
          borderWidth: 1,
          padding: 10,
          displayColors: true,
          callbacks: {
            label: (item) => ` ${item.dataset.label}: ${formatY(Number(item.parsed.y))}`,
          },
        },
      },
    };
  });

  /** One row per distinct x across all series — the table twin's body. */
  protected readonly tableRows = computed(() => {
    const series = this.tableSeries();
    const xs = this.categories();
    const lookup = series.map((s) => new Map(s.points.map((p) => [p.x, p.y])));
    return xs.map((x) => ({ x, cells: lookup.map((m) => m.get(x) ?? null) }));
  });
}
