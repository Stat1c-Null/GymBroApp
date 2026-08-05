import type { ChangelogEntry } from '../../components/changelog-entry/changelog-entry';

/**
 * Newest entry first. Add a new object to the TOP of this array for every
 * deployment (see .claude/CLAUDE.md — the "I am deploying" workflow appends here).
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 3,
    date: '2026-08-05',
    changes: [
      'Friends are here — the new Friends page lets you find other lifters by name or email, send them a friend request, and see everyone who has accepted in one list.',
      'Not sure how someone spelled their name? Hit Search with an empty box to browse everyone who has signed up, 20 at a time.',
      'Friend requests wait for you on the Friends page: accept or decline what comes in, cancel a request you sent by mistake, or remove a friend at any time. For now, friends simply appear in each other\'s list — seeing their workouts comes later.',
      'New Cardio category, available to everyone from the start and always listed first. Log a session with its duration, distance, average heart rate and elevation instead of sets and reps.',
      'Your cardio pace is worked out for you from duration and distance, so the numbers can never disagree.',
      'Choose whether distance and elevation show in miles/feet or kilometres/meters, in Settings next to the weight unit.',
      'Logging a workout where every set used the same weight now updates that exercise\'s usual weight automatically, so the form starts from what you actually lifted last time.',
    ],
  },
  {
    version: 2,
    date: '2026-07-21',
    changes: [
      'New Analytics page — see how your training and body weight are trending over time, with a date-range filter that scopes every chart on the page.',
      'Weight goals: set a start and target weight with dates, then track your weigh-ins against the pace you need to hit them — complete with a smoothed 7-day trend line, a projected finish date, and a read on whether you\'re ahead of or behind plan.',
      'Exercise progress: compare how your lifts are trending by muscle group across metrics like estimated 1-rep max, heaviest set, total volume, reps, and sets — with per-exercise stats for sessions, frequency, consistency, and your best result.',
      'Choose your weight unit (kg or lbs) in Settings — weights now display in your preferred unit everywhere in the app.',
      'Manage your muscle groups in Settings — add, remove, and reorder the categories used to organize your workouts.',
      'Optionally track the time spent on each set when logging a workout, and refresh your analytics data on demand from Settings.',
    ],
  },
  {
    version: 1,
    date: '2026-07-15',
    changes: ['Added the Changelog page to track future deployments.'],
  },
];
