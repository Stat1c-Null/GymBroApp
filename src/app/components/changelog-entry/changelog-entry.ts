import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';

/** One deployed release: a version number, its date, and the list of changes it shipped. */
export interface ChangelogEntry {
  version: number;
  date: string;
  changes: string[];
}

/**
 * Bordered card for a single changelog release. Used on the Changelog page,
 * one per entry in `CHANGELOG` (see `pages/changelog/changelog-data.ts`).
 */
@Component({
  selector: 'app-changelog-entry',
  standalone: true,
  imports: [DatePipe],
  template: `
    <article class="changelog-entry">
      <div class="changelog-entry-header">
        <span class="changelog-version">v{{ version() }}</span>
        <span class="changelog-date">{{ date() | date: 'MMM d, y' }}</span>
      </div>
      <ul class="changelog-changes">
        @for (change of changes(); track change) {
          <li>{{ change }}</li>
        }
      </ul>
    </article>
  `,
  styles: [`
    .changelog-entry {
      border: 1.5px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 1.25rem 1.5rem;
    }

    .changelog-entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.85rem;
    }

    .changelog-version {
      font-weight: 800;
      font-size: 1.05rem;
      color: var(--primary-light);
      letter-spacing: -0.01em;
    }

    .changelog-date {
      color: var(--text-muted);
      font-size: 0.82rem;
      white-space: nowrap;
    }

    .changelog-changes {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding-left: 1.1rem;
      color: var(--text-secondary);
      font-size: 0.92rem;
      line-height: 1.5;
    }
  `],
})
export class ChangelogEntryComponent {
  readonly version = input.required<number>();
  readonly date = input.required<string>();
  readonly changes = input.required<string[]>();
}
