import type { ChangelogEntry } from '../../components/changelog-entry/changelog-entry';

/**
 * Newest entry first. Add a new object to the TOP of this array for every
 * deployment (see .claude/CLAUDE.md — the "I am deploying" workflow appends here).
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 5,
    date: '2026-09-22',
    changes: [
      'Week sets: save a whole Mon–Sun plan as a reusable set. The /sets page now has two sections — Day sets and Week sets — and the week builder lays out all seven days, so you can leave rest days empty.',
      'On the Weeks page, "Save week as set" captures everything you logged this week as a new week set, and "Load week set" fills a week from one in a single step. Loading only adds workouts: anything already on a day stays as it is, and you\'ll be told which exercises were skipped.',
      'Only need one day of a week plan? When applying a set to a day, you can now pick a single day out of any week set, like "PPL Split · Thu".',
      'New Totals card on the Analytics page shows how much you\'ve done in the selected range: training days, sets, reps and total weight lifted, plus cardio distance, time and sessions. A table ranks your exercises or muscle groups by volume. Pick "All" to see your lifetime totals.',
      'Notes now carry over: a note you write on an exercise is filled in automatically the next time you log it, dated to when you first wrote it. Edit the note to update it from then on, or switch it off to clear it. Past workouts always keep the note they were logged with. Saved sets carry their notes over too.',
    ],
  },
  {
    version: 4,
    date: '2026-08-30',
    changes: [
      'Body weight as a workout weight: mark an exercise as "Body weight" and its sets fill in automatically from your latest weigh-in when you log it — reps (and time, if you track it) stay editable. No weigh-in yet? Log one right there without losing what you already typed.',
      'Workout notes: add a free-text note to any workout when you log it, cardio included. Notes show under the workout on the Weeks page — and on a friend\'s week if you\'re connected, so keep that in mind before you write one.',
      'Fixed a bug that kept a friend\'s body weight from loading on their profile card.',
      'Workout Sets: a new /sets page for saving a whole session — exercises, sets, reps, weights and notes — as a named, reusable set. On the Weeks page, + now asks whether to add a single workout or apply a saved set to that day, and you can save any day you\'ve already logged as a new set.',
      'The set-builder window is easier to use on a larger screen: exercises now lay out in columns instead of one long list, and the window scrolls properly so nothing gets stuck off-screen. Phones and small screens are unchanged.',
    ],
  },
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
