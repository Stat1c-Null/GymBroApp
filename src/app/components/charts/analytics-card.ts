import { Component, input } from '@angular/core';

/**
 * The standard panel every analytic sits in: a titled `.glass-card` with explicit
 * loading / empty / ready states and an actions slot in the header.
 *
 * It encodes the app's `undefined = loading, [] = empty` stream convention once, so
 * no future analytics page re-implements that branch. Deliberately has **no** filter
 * slot: a per-card date range lets two charts disagree about what window they show,
 * which is how a dashboard starts lying. Range lives in one row above the cards.
 *
 * Content is projected; pass `state` from the page.
 */
@Component({
  selector: 'app-analytics-card',
  standalone: true,
  template: `
    <section class="glass-card card">
      <header class="card-head">
        <div class="card-titles">
          <h2 class="card-title">{{ title() }}</h2>
          @if (subtitle()) {
            <p class="card-subtitle">{{ subtitle() }}</p>
          }
        </div>
        <ng-content select="[actions]" />
      </header>

      @switch (state()) {
        @case ('loading') {
          <div class="card-state">
            <span class="spinner"></span>
          </div>
        }
        @case ('empty') {
          <div class="card-state card-empty">
            <p>{{ emptyMessage() }}</p>
            <ng-content select="[empty-action]" />
          </div>
        }
        @default {
          <ng-content />
        }
      }
    </section>
  `,
  styles: [
    `
      .card {
        padding: 1.25rem 1.4rem 1.4rem;
      }

      .card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1.1rem;
      }

      .card-title {
        font-size: 1.05rem;
        font-weight: 700;
      }

      .card-subtitle {
        margin-top: 0.15rem;
        font-size: 0.85rem;
        color: var(--text-muted);
      }

      .card-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 3rem 1rem;
        color: var(--primary);
      }

      .card-empty {
        color: var(--text-muted);
        text-align: center;
      }

      @media (max-width: 560px) {
        .card-head {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class AnalyticsCardComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly state = input<'loading' | 'empty' | 'ready'>('ready');
  readonly emptyMessage = input('Nothing to show yet.');
}
