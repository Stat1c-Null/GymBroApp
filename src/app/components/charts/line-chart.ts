import { Component, computed, inject, input } from '@angular/core';
import { ChartConfiguration, ChartDataset } from 'chart.js';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { ChartPoint, ChartSeries, Extent } from '../../analytics/chart.types';
import { ChartThemeService, roleColor } from './chart-palette';

/**
 * The app's generic multi-series line chart, and the only place Chart.js is touched.
 *
 * ng2-charts is decorator-based (`@Input()`) and injects `NgZone`, so it isn't
 * signal-native — it works fine zoneless (Angular supplies a no-op zone), but it's
 * the least idiomatic thing in an otherwise signals-only codebase. This component
 * exists to quarantine it: everything outside speaks `ChartSeries` and signals.
 *
 * Theming is automatic rather than imperative: `options()` reads the palette signal,
 * so a theme flip re-derives the config and ng2-charts pushes it to the canvas. No
 * manual `chart.update()`, no `getComputedStyle`.
 *
 * The x scale is `linear` over epoch-ms, not Chart.js's `time` scale — that needs a
 * date adapter (`chartjs-adapter-date-fns` + `date-fns`), and this repo deliberately
 * carries no date library. A linear scale positions irregular samples correctly; only
 * the tick *labels* need formatting, which `formatX` does.
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [BaseChartDirective],
  // Registered here rather than in app.config.ts on purpose. `withDefaultRegisterables()`
  // pulls in all of Chart.js at module scope, so providing it from the eager app config
  // put ~208kB of Chart.js in the *initial* bundle for every user, including those who
  // never open Analytics. Declaring it on this component keeps Chart.js in whichever
  // lazy chunk imports the chart, and makes this component self-sufficient anywhere.
  providers: [provideCharts(withDefaultRegisterables())],
  template: `
    <div class="chart-box" [style.height.px]="height()">
      <canvas
        baseChart
        type="line"
        [data]="data()"
        [options]="options()"
        [attr.aria-label]="ariaLabel()"
      ></canvas>
    </div>

    <!--
      A <canvas> is opaque to assistive tech, and a tooltip must never be the only
      way to read a value. This table is the WCAG-clean twin of the chart above:
      same numbers, real DOM. Hidden visually, always present for screen readers.
    -->
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
      /* The box must include the x-axis band, or the labels get clipped into a
         nested scrollbar. Chart.js fills its parent, so the parent is sized here. */
      .chart-box {
        position: relative;
        width: 100%;
      }
    `,
  ],
})
export class LineChartComponent {
  private readonly chartTheme = inject(ChartThemeService);

  readonly series = input.required<ChartSeries[]>();
  readonly height = input(300);
  /** Overrides the derived y extent — the burndown forces the goal into view. */
  readonly yDomain = input<Extent | null>(null);
  readonly xDomain = input<Extent | null>(null);
  readonly formatX = input<(v: number) => string>((v) => String(v));
  readonly formatY = input<(v: number) => string>((v) => String(v));
  /** Summarises the chart for screen readers; also the table's caption. */
  readonly ariaLabel = input.required<string>();

  /** Series with points, in draw order — context first so the accent sits on top. */
  protected readonly tableSeries = computed(() =>
    this.series().filter((s) => s.points.length > 0)
  );

  protected readonly data = computed<ChartConfiguration<'line'>['data']>(() => {
    const palette = this.chartTheme.palette();
    return {
      datasets: this.series().map((s): ChartDataset<'line'> => {
        const color = roleColor(s.role, palette);
        const showLine = s.line ?? true;
        return {
          label: s.label,
          data: s.points.map((p) => ({ x: p.x, y: p.y })),
          borderColor: color,
          backgroundColor: color,
          borderWidth: showLine ? 2 : 0,
          borderDash: s.dashed ? [6, 6] : undefined,
          showLine,
          spanGaps: true,
          tension: 0,
          pointRadius: s.dots ? 4 : 0,
          pointHoverRadius: s.dots ? 6 : 4,
          pointBackgroundColor: color,
          // A 2px ring in the surface colour keeps overlapping dots separable
          // without drawing a border around every mark.
          pointBorderColor: palette.surface,
          pointBorderWidth: s.dots ? 2 : 0,
        };
      }),
    };
  });

  protected readonly options = computed<ChartConfiguration<'line'>['options']>(() => {
    const palette = this.chartTheme.palette();
    const formatX = this.formatX();
    const formatY = this.formatY();
    const y = this.yDomain();
    const x = this.xDomain();

    return {
      responsive: true,
      maintainAspectRatio: false,
      // Nearest-x rather than exact-hit: the reader aims at a date, never at a 2px
      // line, and this gives every series at that x in one tooltip.
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 200 },
      layout: { padding: { top: 8, right: 8 } },
      scales: {
        x: {
          type: 'linear',
          min: x?.min,
          max: x?.max,
          border: { color: palette.grid },
          // Solid hairline. Dashing means "projection" on this chart; reusing it
          // on the grid would be noise.
          grid: { color: palette.grid, tickLength: 6 },
          ticks: {
            color: palette.text,
            font: { family: 'Inter', size: 11 },
            maxRotation: 0,
            autoSkipPadding: 24,
            callback: (value) => formatX(Number(value)),
          },
        },
        y: {
          type: 'linear',
          // Not zero-based: length doesn't encode magnitude on a line, and a
          // 0-based axis would flatten every real bodyweight change into noise.
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
            boxWidth: 18,
            boxHeight: 2,
            usePointStyle: false,
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
            title: (items) => (items.length ? formatX(Number(items[0].parsed.x)) : ''),
            label: (item) => ` ${item.dataset.label}: ${formatY(Number(item.parsed.y))}`,
          },
        },
      },
    };
  });

  /** One row per distinct x across all series — the table twin's body. */
  protected readonly tableRows = computed(() => {
    const series = this.tableSeries();
    const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(
      (a, b) => a - b
    );
    const lookup = series.map((s) => new Map(s.points.map((p: ChartPoint) => [p.x, p.y])));
    return xs.map((x) => ({
      x,
      cells: lookup.map((m) => m.get(x) ?? null),
    }));
  });
}
