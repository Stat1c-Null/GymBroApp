# GymBroApp Wiki

Internal reference for understanding this codebase. Read this before making
non-trivial changes — it explains how the pieces fit together so changes stay
consistent with existing patterns instead of introducing a second way of doing
the same thing.

GymBroApp is a personal workout tracker: users log weekly workout sessions
(sets/reps/weight/time), maintain a reusable exercise library grouped by
muscle group, track body weight over time (with a goal-driven burndown chart on
the Analytics page), and customize a few preferences.
Auth and data are backed by Firebase (Auth + Firestore); there is no custom
backend server.

## Pages

- [Architecture](./architecture.md) — tech stack, app bootstrap, routing, the
  service/signal pattern used for all data, layout structure, and the
  analytics/charts layering rule.
- [Database](./database.md) — Firestore collection layout, document shapes,
  denormalization decisions, what's *not* configured (e.g. no rules file in
  this repo).
- [Features](./features.md) — one section per feature (auth, dashboard,
  weeks, workouts, weights, settings, analytics, changelog, theming, toasts),
  what it does, and how it interacts with other features.
- [Components & Services](./components-and-services.md) — catalog of every
  reusable component and injectable service: purpose, inputs/outputs, key
  methods.
- [Design System](./design-system.md) — the global CSS in `src/styles.css`:
  design tokens, shared utility classes, theming mechanism, component
  conventions, and why chart colours live in TypeScript rather than CSS.

## Keeping this wiki current

This wiki is generated from reading the source, not the other way around —
it can drift. When you make a change that alters something documented here
(a new page/route, a new Firestore collection, a new shared component, a
changed data shape), update the relevant wiki page in the same change.
