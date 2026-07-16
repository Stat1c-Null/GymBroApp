import type { ChangelogEntry } from '../../components/changelog-entry/changelog-entry';

/**
 * Newest entry first. Add a new object to the TOP of this array for every
 * deployment (see .claude/CLAUDE.md — the "I am deploying" workflow appends here).
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 1,
    date: '2026-07-15',
    changes: ['Added the Changelog page to track future deployments.'],
  },
];
