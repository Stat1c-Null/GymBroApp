# Features

Each section: what the feature does, its key files, and how it interacts
with other features. See [Components & Services](./components-and-services.md)
for full API-level detail on each piece named here.

## Authentication

**Files**: `services/auth.service.ts`, `guards/auth.guard.ts`,
`pages/login/`, `pages/signup/`, `components/auth-layout/`,
`components/password-input/`, `components/google-button/`.

Email/password and Google-popup sign-in via Firebase Auth. `AuthService`
holds the current `User` as a signal (`currentUser`, kept in sync via
`onAuthStateChanged`) and exposes `displayName` (falls back
`displayName → email → 'Gym Bro'`). All the app's other services depend on
`AuthService.currentUser` to know which Firestore data to subscribe to (see
[Architecture → the service/signal pattern](./architecture.md#the-servicesignal-pattern-central)).

Login also supports a **password reset** flow (a modal on the login page,
not a separate route) and preserves a `returnUrl` query param so a
guarded deep link redirected to `/login` returns the user to where they were
headed after sign-in — see `authGuard` in
[Architecture](./architecture.md#auth-guard-srcappguardsauthguardts).

Signup additionally computes a live password-strength meter
(`passwordStrength` computed signal in `signup.ts`, purely client-side
heuristic — length + character class checks, not validated against any
external list).

Google sign-in errors for a dismissed/superseded popup
(`auth/popup-closed-by-user`, `auth/cancelled-popup-request`,
`BENIGN_POPUP_CODES`) are deliberately swallowed — the UI stays silent
instead of showing an error, since the user didn't do anything wrong.

## Dashboard

**Files**: `pages/dashboard/`.

The landing page after `/`. A single welcome card with quick links to This
Week, Workouts, Weight, and Changelog. No data of its own — purely
navigation plus `AuthService.displayName()` for the greeting.

## Weeks (weekly workout logging)

**Files**: `services/week.service.ts`, `pages/weeks/`.

The core logging flow. A 7-day grid (Mon–Sun, `DAY_LABELS`) for the
currently-viewed week, with Prev/Next/"This week" navigation
(`WeekService.previousWeek/nextWeek/goToThisWeek`, backed by
`currentWeekStart`). Each day column lists that day's `WeekEntry` items and
has an "add" button opening a modal to log a new one.

**The add/edit modal cross-cuts into two other features**:
- The muscle-group dropdown reads `SettingsService.muscleGroups()`.
- The workout dropdown reads `WorkoutService.workouts()`, filtered by
  selected group (`filteredWorkouts` computed in `weeks.ts`).
- A "+ Create new workout" link inside that same modal opens
  `WorkoutFormModalComponent` (the same component the Workouts page uses)
  *layered on top* of the logging modal — completing it seeds the
  newly-created workout straight back into the logging form
  (`onWorkoutCreated`) without losing any sets already entered.

Per-set fields are reps + weight, plus an optional time (m:ss) field gated
by a toggle (`modalTrackTime`) that defaults from
`SettingsService.showSetTime()` but can be overridden per log entry
(`WeekEntry.trackTime`). `parseTime`/`formatTime` (in `week.service.ts`)
convert between the `"m:ss"` text the form uses and the stored integer
seconds.

Duplicate-guard: logging the same workout twice on the same day (outside of
editing that same entry) is rejected client-side before the write.

Usual-weight write-back: on save (add or edit), if every set that has a
weight entered agrees on one value (`uniformWeight()` in `week.service.ts`;
blank/bodyweight sets are ignored) and it differs from the workout's current
`usualWeight`, the library entry is updated to match
(`WeeksComponent.syncUsualWeight`, `weeks.ts`) — so the next time this
workout is logged, the form seeds from the latest weight. Disagreeing sets
never touch `usualWeight`. The success toast is extended to mention the
change (e.g. "Usual weight updated to 135 lbs."); a failure to update the
library doesn't affect the already-saved log entry or its toast.

## Workouts (exercise library)

**Files**: `services/workout.service.ts`, `pages/workouts/`,
`components/workout-form-modal/`.

A reusable exercise library, grouped into collapsible sections by muscle
group (`groupedWorkouts` computed in `workouts.ts`; sections start
collapsed, `expandedGroups` tracks which are open). Each workout has a name,
muscle group, usual weight, and max weight.

Create/edit is entirely owned by **`WorkoutFormModalComponent`** — this is
the one piece of business logic genuinely shared between two pages: the
Workouts page (standalone create/edit) and the Weeks page (inline
create-while-logging, see above). It's driven purely by inputs
(`editingWorkout`, `presetGroup`) and emits `saved`/`close` — neither caller
needs to know how the form works internally.

Deleting a workout only removes the library entry — it does **not** touch
any `WeekEntry` that referenced it (those keep their denormalized
`workoutName`/`muscleGroup`; see
[Database → Denormalization](./database.md#denormalization--consistency)).

## Weights (body weight tracking)

**Files**: `services/weight.service.ts`, `pages/weights/`.

A simple timestamped log of body weight. The add form accepts *either*
kilograms or pounds; whichever is filled is treated as canonical and the
other is derived via `convertWeight()` (kg wins if somehow both are filled —
the form only surfaces one input at a time in practice). Both units are
persisted so the list can display both without a live conversion on read.

## Settings

**Files**: `services/settings.service.ts`, `pages/settings/`.

Two independent things live on this page:

1. **"Track time per set" toggle** — sets `showSetTime`, the *default* for
   the Weeks page's per-log time-tracking toggle (each log entry can still
   override it locally, see Weeks above).
2. **Muscle group management** — add/rename/delete the groups used
   throughout Workouts and Weeks. Rename and delete both cascade into
   `WorkoutService` via an atomic batch — see
   [Database → Denormalization & consistency](./database.md#denormalization--consistency)
   for exactly how, and why it has to be atomic. Deleting a group shows a
   confirmation banner stating how many workouts will move to `Unassigned`
   before committing.

## Analytics

**Files**: `pages/analytics/` (`analytics.ts`/`.html`/`.css`, `goal-form-modal.ts`,
`weight-burndown/`, `muscle-progress/`), `analytics/` (pure maths — `burndown.ts`,
`exercise-metrics.ts`), `components/charts/` (reusable chart toolkit),
`services/weight-analytics.service.ts`, `services/exercise-analytics.service.ts`,
`services/entry-backfill.service.ts`.

One range selector (30d/90d/6m/1y/All) scoping a stack of cards. The range lives on
the page, never per-card — two cards showing different windows is how a dashboard
starts lying.

### Weight burndown

Plots **body weight over time** against the pace needed to reach a goal. Four marks:

| Mark | Why |
|---|---|
| Weigh-ins (dots, no line) | The raw data. Deliberately unconnected — day-to-day bodyweight swings on water alone, and joining the dots produces a jagged line that shouts louder than the trend. |
| 7-day trend (solid accent) | The actual signal. Fitted for rate/projection, not the raw dots. |
| Plan (dashed gray) | Straight line from (start, startLbs) to (target, targetLbs) — the burndown reference. |
| Projection (dashed accent) | Where the current trend crosses the target. Omitted when the trend is flat or heading away. |

Note it plots *weight*, not "remaining to goal". A literal burndown would invert for
bulking, vanish with no goal set, and rewrite its own history whenever the goal changed.

**Direction-agnostic.** `goalDirection` is `cut` when the target is below the start,
`bulk` when above, and every readout is normalised by `directionSign` (−1 / +1) so one
implementation serves both — losing 2 lbs is progress on a cut and a setback on a bulk.
Nothing in `analytics/burndown.ts` may assume "down is good". The specs mirror every
cut fixture into its bulk twin and assert identical readouts; that's what caught a sign
inversion in `deltaVsPlan` during development.

**The goal** lives on `users/{uid}/settings/preferences` (see
[Database](./database.md)) and is edited from a modal on this page, not Settings —
it's analytics-specific and the empty-state CTA opens the same modal. With no goal the
chart still renders weigh-ins + trend; only the pace, projection and vs-plan tiles are
withheld. It must be useful before a goal exists.

**Edge cases** are defined rather than incidental: zero weigh-ins → card empty state;
one weigh-in (or all on one day) → no rate/projection, because `linearRegression`
returns `null` on zero x-variance rather than a NaN that would silently poison every
stat; goal reached → progress pinned to 1 and projection dropped; target date past →
banner, and no pace to compare against.

### Exercise progress (by muscle group)

Compares how the user's lifts trend over time. Pick a **muscle group**
(`SettingsService.muscleGroups()`, plus an `Unassigned` chip when orphans exist),
multi-select the **exercises** to compare (capped at 8 — the categorical palette's
distinct-colour limit), and toggle a **metric**: estimated 1RM (Epley, `reps === 1`
returns the weight), heaviest set, total volume (`Σ reps×weight`), total reps, or set
count. Each exercise is its own colour in a grouped **`app-bar-chart`** (colour follows
the entity, never its rank); same-day sessions of one exercise are pooled before the
metric is computed. Six stat tiles summarise training: sessions, frequency (per week),
consistency (weeks trained / weeks in range), best-in-range, average volume per
session, and a regression progress rate for the primary exercise. All maths is pure in
`analytics/exercise-metrics.ts`; `ExerciseAnalyticsService` supplies the history.

Unlike the burndown (which reads the flat `weights` collection), this needs **all
logged sets across every week** — see the data-access design below.

### Adding another analytic

Write a reducer in `analytics/` and a card that composes `AnalyticsCardComponent` +
`LineChartComponent` (or `BarChartComponent`) + `StatTileComponent`. The chart layer should need no change —
that's the test of the design.

> **Reading workout history across weeks** (the burndown reads flat `weights`; a
> *workout* analytic can't). `WeekService` subscribes to one `weekId` at a time, and
> parent `weeks/{weekId}` docs are Firestore *phantoms* (only `addDoc` into `entries`
> ever runs), so you can't enumerate weeks. This is **solved** for the exercise card:
> every entry now carries a denormalized `uid` + `date` (set by `WeekService`), so
> `ExerciseAnalyticsService` reads all history with one `collectionGroup('entries')`
> query filtered by `uid`, and `EntryBackfillService` stamps old entries once. It
> needs a Firebase-console collection-group index + security rule — see
> [Database → Cross-week analytics reads](./database.md#cross-week-analytics-reads-the-exception).

## Changelog

**Files**: `components/changelog-entry/`, `pages/changelog/` (`changelog.ts`,
`.html`, `.css`, and `changelog-data.ts`).

A static, hardcoded list of releases (`CHANGELOG` array in
`changelog-data.ts`, **not** stored in Firestore — it ships with the app
bundle). Each entry (`ChangelogEntry`: `version`, `date`, `changes: string[]`)
renders as one bordered card via the reusable `ChangelogEntryComponent`.
Newest entry is convention-first in the array; the page renders them in
array order, no sorting logic.

Reachable from the Dashboard's "Changelog" button. **Not** currently linked
from the nav sidebar — only from the Dashboard.

**Maintenance workflow**: `.claude/CLAUDE.md` instructs Claude to prepend a
new entry to `CHANGELOG` whenever the user says something like "I am
deploying," summarizing whatever changed since the last entry. See that file
for the exact procedure.

## Theming

**Files**: `services/theme.service.ts`, `components/theme-toggle/`,
`components/settings-sidebar/`.

`ThemeService` holds a `'light' | 'dark'` signal, persisted to
`localStorage` (`gymbro-theme` key) and initialized from that storage or
`prefers-color-scheme` if unset. An `effect()` in its constructor writes
`data-theme` onto `document.documentElement` whenever the signal changes —
this is what drives the `[data-theme='dark']`/`[data-theme='light']` CSS
variable blocks in `styles.css` (see
[Design System](./design-system.md)). `ThemeToggleComponent` is the switch
UI; it's embedded in two different places depending on auth state:
`NavSidebarComponent` (signed in) and `SettingsSidebarComponent` — a floating
panel toggled by a corner button, used on the `/login` and `/signup` pages
since there's no nav sidebar before sign-in.

## Toasts

**Files**: `services/toast.service.ts`, `components/toast/`.

A single global notification queue. `ToastService.show(message, type,
duration)` sets `message`/`type`/`visible` signals and a `setTimeout` to
auto-hide. `ToastComponent` is mounted **once**, at the app root
(`app.html`), not per-page — any service or page can `inject(ToastService)`
and call `.show()` from anywhere, and it'll surface regardless of which page
is currently active. Almost every mutating action across the app (save/
delete workout, log weight, save settings, etc.) calls this on
success/failure — it's the app's only feedback mechanism for async
operations besides inline form errors.
