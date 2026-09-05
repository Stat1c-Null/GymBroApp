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

**Files**: `services/week.service.ts`, `pages/weeks/`,
`components/week-grid/`, `components/week-nav/`, `services/entry-summary.ts`.

The core logging flow. A 7-day grid (Mon–Sun, `DAY_LABELS`) for the
currently-viewed week, with Prev/Next/"This week" navigation
(`WeekService.previousWeek/nextWeek/goToThisWeek`, backed by
`currentWeekStart`). Each day column lists that day's `WeekEntry` items and
has an "add" button.

That button no longer opens the logging form directly: a day can be filled two
ways now, so it asks which first — **log one workout**, or **drop in a saved
set**. See [Workout Sets](#workout-sets-reusable-days-and-weeks). A day
that already has something logged also carries a small "save as set" button in
its column header, which captures it as a reusable set.

The page header carries the same pair one level up — **"Save week as set"** and
**"Load week set"** — beside the week nav. They live in `weeks.html` rather than
in `WeekNavComponent`, which the read-only friend-week view shares.

The grid and the nav are **shared components**, not page markup: the Friends
page renders a friend's week from the same two, read-only and compact. So the
page component owns the modal and the writes; `WeekGridComponent` owns the
columns and emits intent, and the one-line per-entry summary is a pure function
in `services/entry-summary.ts`. See
[Friends → Seeing a friend's week](#seeing-a-friends-week).

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

Those per-set rows and the cardio fields are **shared components** —
`SetRowsEditorComponent` and `CardioFieldsComponent` — because the set builder
needs the identical form. Their arithmetic is pure and lives outside both:
`services/set-rows.ts` (seeding rows, growing the pool, and the
canonical-weight round-trip guard) and the `toCardioLog`/`fromCardioLog` pair
beside the cardio component. `weeks.ts` kept the orchestration — which day,
the duplicate guard, the submit, the usual-weight write-back — and delegates
the rest. See
[Workout Sets → Sharing the form](#sharing-the-form-with-the-weeks-page).

Workout notes: a second toggle (`modalHasNotes`) reveals a `<textarea>` for a
free-text note on the session, stored as `WeekEntry.notes`. It looks like the
time-tracking toggle but differs from it in three ways worth remembering:

- **No global default.** There is no `showNotes` setting — the toggle starts off
  on a new entry *unless the exercise has a standing note*, in which case picking
  it turns the toggle on and fills the text (see below). On edit it re-derives
  from the entry (`!!entry.notes`).
- **It applies to cardio too**, so `notes` is built into the shared `base`
  object in `onSubmit`, not the strength-only branch that carries `trackTime`.
- **Turning it off saves `''`, not nothing** — see
  [Database → Workout notes](./database.md#workout-notes) for why omitting the
  key could never clear a note.

The note renders under the sets summary in `WeekGridComponent`
(`.day-entry-notes`), clamped to three lines — two in the `compact` friend
strip — with the full text on the element's `title` and always in the edit
modal. Because the grid is shared, **an accepted friend sees your notes**.

#### Notes carry over

A note follows the **exercise**, not the day. Write "shoulder still clicking" on
Bench Press one Tuesday and it is already in the form the next time Bench Press
is logged, however many weeks later — seeded in `onWorkoutChange`, the same hook
that re-seeds the set weights, so picking an exercise brings forward both what
you usually lift and what you last said about it.

Four rules make that safe, and each is enforced in one place:

- **Editing the text revises the note going forward**; the session you just
  saved keeps exactly what you typed. `WeeksComponent.syncWorkoutNote` pushes it
  back to the library after the log is saved — the same position and shape as
  `syncUsualWeight`, including never failing the log if the library write does.
- **The original date is kept** through every revision and every carry-over, and
  a brand-new note is dated to the *session* it describes rather than to today,
  so annotating a past week dates the note to that week. The modal shows it
  ("First noted Mar 4 · carries over to your next session"), and a note that was
  carried in gets a small `.day-entry-note-origin` line in the grid — one written
  on the day it sits on doesn't, since that would only restate the column.
- **Turning the toggle off clears it**, which is how carry-over is switched off;
  there is no separate control. Editing an *old* session clears it too, so the
  toast says so ("Note cleared from Bench Press.").
- **Past sessions never change.** Each holds its own snapshot in `WeekEntry.notes`
  and nothing rewrites it, so a deleted note stays on every workout it was
  applied to. See [Database → Note carry-over](./database.md#note-carry-over).

Applying a saved set carries notes too, with the set's own note winning over the
standing one — [Workout Sets](#workout-sets-reusable-days-and-weeks).

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

Cardio logging: selecting the reserved "Cardio" group (always first in the
dropdown) swaps the whole form — no muscle-group-style sets, just one
session per day: duration, distance, a read-only computed pace, and optional
heart rate/elevation. `WeeksComponent.isCardio` drives the swap;
`entrySummary()` dispatches each day-entry's display line to either the
cardio or strength summary depending on `muscleGroup`. See
[Database → The Cardio category](./database.md#the-cardio-category) for the
data shape and unit handling. The usual-weight write-back above is a no-op
for cardio entries (they carry no `sets` to check).

Body-weight exercises: when the selected workout is flagged `bodyWeight`
(`WeeksComponent.isBodyWeight`), every set's weight is filled from the user's
latest weigh-in and shown read-only — reps and the optional time stay editable,
and a hint line names the weight being used. The weigh-in log streams in
asynchronously, so an effect re-seeds the open modal's rows if the log lands
after a body-weight workout was picked (skipped while *editing* an entry, whose
weight is history). With an **empty** log there's nothing to fill from, so
`BodyWeightPromptComponent` takes the hint's place and logs a weigh-in inline —
the same stream then fills the rows. Sending the user to `/weights` instead
would have cost them the sets they'd already entered. The usual-weight
write-back above is skipped for these, the same way it is for cardio. See
[Database → Body-weight exercises](./database.md#body-weight-exercises).

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

A reserved **"Cardio"** category (`CARDIO_GROUP`) always appears first — even
with zero exercises — for every user, with no migration needed (same trick
as the `Unassigned` bucket: injected in the UI, never persisted to
`settings.muscleGroups`). Creating/editing a Cardio-category workout hides
the usual/max weight inputs entirely; see
[Database → The Cardio category](./database.md#the-cardio-category).
Logging one is a Weeks-page feature — see below.

A **"Body weight"** toggle sits where the usual/max weight inputs are (hidden
for Cardio, which has no weights at all). Turning it on replaces those two
inputs — there is no per-workout weight to enter, because the weight comes from
the weigh-in log at logging time. The library card shows "body weight" instead
of the usual/max stats. If the weight log is empty,
`BodyWeightPromptComponent` appears under the toggle so the first weigh-in can
be logged without leaving the form — the exercise is useless until one exists.
See
[Database → Body-weight exercises](./database.md#body-weight-exercises) for the
stored shape, and Weeks above for what logging one does.

## Workout Sets (reusable days and weeks)

**Files**: `services/workout-set.service.ts`, `services/week-set.service.ts`,
`services/apply-set.ts` (+ `.spec.ts`), `services/set-rows.ts` (+ `.spec.ts`),
`pages/sets/`, `components/set-form-modal/` (`set-form-modal.ts`,
`set-item-editor.ts`, `builder-item.ts` + `.spec.ts`),
`components/set-rows-editor/`, `components/cardio-fields/`.

For anyone who does the same session every week and would rather not re-enter
it. There are two kinds, and they nest:

- A **day set** (`WorkoutSet`) is a named, ordered group of exercises with the
  reps, weights and notes they're meant to be done at; applying one to a day
  creates a normal `WeekEntry` per exercise, each editable afterwards like any
  other.
- A **week set** (`WeekSet`) is a whole Mon–Sun plan — a list of
  `{ day, items }`, where `items` is the *same* `SetItem[]` a day set holds.
  Loading one fills every day it covers in a single batch.

The week kind is built almost entirely out of the day kind's machinery:
`SetItem` is reused verbatim, `sanitizeItem` is shared (and had to be — see
[Database → weekSets](./database.md#usersuidweeksetssetid)), the apply rules are
one function called once per day, and the builder is the same component in a
different mode.

🟠 **"Set" is overloaded, and the code disambiguates.** The gym sense — reps at
a weight — is `LoggedSet`; it was renamed from `WorkoutSet` when this feature
landed so that name could mean the bundle. See
[Database → workoutSets](./database.md#usersuidworkoutsetssetid).

### The `/sets` page

Two stacked sections under one page title — **Day sets**, then **Week sets** —
each with its own "New …" button, its own loading-vs-empty state, and its own
empty-state copy. Stacked rather than tabbed: nothing is hidden behind a click,
and a user typically has a handful of each.

A day-set card is a thin list modelled on the Workouts page: name, description,
exercise count, and every exercise summarised — using `entrySummary()`, the
*same* pure function the week grid uses, so a set reads exactly like the day it
will become. (That function's parameter was widened to a structural
`SummarizableExercise` for this; `WeekEntry` and `SetItem` both satisfy it.)
Contents are always visible rather than behind an accordion — the whole point of
a set is what's in it, and there are only ever a handful.

A week-set card is the same card with one more level: `N days · M exercises` in
the stats, then one row per stored day (`Mon`, `Wed`, …) listing that day's
exercises through the very same `entrySummary()`. Rest days aren't stored, so the
days shown are exactly the ones a load will fill.

Create/edit for both is entirely owned by **`SetFormModalComponent`**, driven by
inputs (`mode`, `editingSet`/`editingWeekSet`, `presetItems`/`presetDays`,
`presetName`) and emitting `saved`/`savedWeek`/`close` — the
same shape `WorkoutFormModalComponent` has, and for the same reason: the Weeks
page opens it too.

### The builder

Name, optional description, then one `SetItemEditorComponent` block per
exercise, each with "+ Add exercise" / remove. A block is the Weeks logging
form minus the day: muscle group → workout → set count → per-set rows (or the
cardio fields) → optional note. It even carries the same "+ Create new
workout" link, layering `WorkoutFormModalComponent` over the builder exactly
as it layers over the logging modal.

**`mode: 'week'` is the same component, not a twin.** It renders seven
collapsible day sections and writes to `WeekSetService`; everything else — the
name, the description, the error line, the validation loop, the remove, the
create-workout sub-modal — is shared. The blocks stay **one flat list**, each
`BuilderItem` stamped with a `day`; the sections are a view over that list
(`itemsForDay`), which is what keeps the rest identical. `day` is builder-only
state and never reaches `SetItem` — a stored item doesn't carry its own day,
`WeekSetDay` groups items *by* day.

Two deliberate differences in week mode: days with exercises start expanded and
empty ones collapsed (so seven headers fit on one screen), and a fresh week
builder starts with **no** blocks rather than the day builder's one — an empty
Tuesday is normal, and there'd be no obvious day to put a first block on.

Validation and conversion happen together in `toSetItem` (`builder-item.ts`,
pure and unit-tested), which returns either the storable `SetItem` or the first
thing wrong with it — named, so the user knows which block to fix ("Enter the
reps for every set of Bench Press.").

`BuilderItem`'s fields are **signals**, unlike the Weeks modal's plain
`SetRow`s. The builder and each child editor share one object by reference, and
a plain property mutation would tell neither of them anything. Row *fields*
stay plain for the same reason they always were: `[(ngModel)]` writes what the
user already sees.

### Sharing the form with the Weeks page

This is the second piece of business logic genuinely shared between two pages
(after `WorkoutFormModalComponent`). The split:

| Piece | Kind | Why there |
|---|---|---|
| `services/set-rows.ts` | pure functions | The arithmetic, including the **canonical-weight round-trip guard** — the 135 lbs → 61.2 kg → 134.9 lbs trap. Worth testing directly, and the thing you'd otherwise get subtly wrong twice. |
| `SetRowsEditorComponent` | presentational | The set-count field, the time toggle, and the rows. Renders `SetRow` objects the caller owns and lets `ngModel` mutate them in place. |
| `CardioFieldsComponent` | presentational | Duration/distance/HR/elevation + the read-only computed pace, with `toCardioLog`/`fromCardioLog` converting at the boundary. |

One input separates the two callers: `template`. In template mode a body-weight
exercise shows **no weight at all** and no "log a weigh-in" prompt — a set is
reused week after week, so the weight is filled at apply time instead. Both
components also take an `idPrefix`, because the builder renders several inside
one `<form>` where duplicate control names would collide.

### Applying a set to a day

The `+` on a day column opens a chooser ("Log a workout" / "Add a set"); the
second opens a picker listing saved sets with their exercises. Choosing one
writes every exercise in a single batch (`WeekService.addMany`).

Below the day sets, that same picker offers **one day pulled out of a week set**
— one row per non-empty day, labelled `PPL Split · Thu`. A week set is often the
only place a routine was written down, and wanting just Thursday out of it
shouldn't mean rebuilding it as a day set. It calls `entriesFromItems`, the
function `entriesFromSet` itself delegates to.

The rules live in `services/apply-set.ts` — pure, no Angular, no Firestore, in
the spirit of `entry-summary.ts`. Three of them, each with an
obvious-but-wrong alternative, are spelled out in
[Database → Applying a set to a day](./database.md#applying-a-set-to-a-day):
a collision **skips** that exercise rather than failing the set, body-weight
exercises take **today's** weight, and **nothing** is written back to the
exercise library. The toast reports the outcome, naming what was skipped.

`WeeksComponent.commitApplied` is the shared tail of all three apply flows — the
write, the skipped list, the `applying` guard. The three *messages* stay with the
callers: "already logged on Mon" and "already logged this week" are different
facts, and one wording covering both would be vaguer than either.

### Loading a week set into a week

"Load week set" in the page header opens a picker of week sets, each row naming
the days it fills. Choosing one calls `entriesFromWeekSet` and writes the whole
week with the **unchanged** `WeekService.addMany` — one batch, one commit, so a
week can never land half-applied.

It is **purely additive**: a day that already has an exercise keeps it and that
one exercise is skipped, by name and day. Nothing is cleared, and there is
deliberately no "replace this week". See
[Database → Applying a week to a week](./database.md#applying-a-week-to-a-week)
for why the collision guard is rebuilt per day.

### Save this day (or week) as a set

The inverse, and in practice how most sets get built: the quickest moment to
write a routine down is just after doing it. A "save as set" button on any
non-empty day column captures its entries (`setItemsFromEntries`) and opens the
builder **pre-filled** rather than saving silently — a set wants a name, and
this is the moment to look over what's being kept. The round trip is stable:
capture preserves the column's order, and `addMany` restores it.

"Save week as set" in the page header is the same move one level up:
`weekSetDaysFromEntries` captures every non-empty day of the viewed week and
opens the builder in week mode, pre-filled and named after the week's date range.
It is disabled while the week is empty — there is nothing to capture.

### Interaction with the rest of the app

- **No security-rules change.** Both collections sit under `users/{uid}`, which
  the existing owner rule already covers. Nothing is shared across a
  friendship.
- **Analytics needs nothing.** Applied entries are ordinary `WeekEntry` docs
  with `uid`/`date` stamped by `WeekService.addMany`, so the collection-group
  query sees them like any other.
- **`loggableGroups()`/`workoutsInGroup()`** moved into `workout.service.ts`
  when the builder needed the Weeks modal's group list, rather than becoming a
  third copy.
- The Weeks page gained the chooser, the pickers and both capture flows;
  `WeekGridComponent` gained one output (`saveAsSet`) and stays presentational,
  so the friend-week view is unaffected. The two week-level buttons live in
  `weeks.html`'s own `.list-header`, **not** in `WeekNavComponent` — that
  component is shared read-only with the friend-week view.

## Weights (body weight tracking)

**Files**: `services/weight.service.ts`, `pages/weights/`,
`components/body-weight-prompt/`.

A simple timestamped log of body weight. The add form accepts *either*
kilograms or pounds; whichever is filled is treated as canonical and the
other is derived via `convertWeight()` (kg wins if somehow both are filled —
the form only surfaces one input at a time in practice). Both units are
persisted so the list can display both without a live conversion on read.

This page is no longer the only way in. `BodyWeightPromptComponent` writes to
the same collection from the Workouts and Weeks modals, for the case where a
body-weight exercise has no weigh-in to draw on — see
[Workouts](#workouts-exercise-library). It asks for one number in the user's
display unit rather than the kg/lbs pair above (it's a detour out of another
form, not the weight log itself) and derives the other unit the same way.

## Settings

**Files**: `services/settings.service.ts`, `pages/settings/`.

Three independent things live on this page:

1. **"Track time per set" toggle** — sets `showSetTime`, the *default* for
   the Weeks page's per-log time-tracking toggle (each log entry can still
   override it locally, see Weeks above).
2. **Weight unit / distance unit toggles** — lbs/kg and mi/km
   display-preference switches. Neither rewrites stored data, only how it's
   shown — see [Database → Weight unit handling](./database.md#weight-unit-handling)
   and [Database → Distance unit handling](./database.md#distance-unit-handling).
3. **Muscle group management** — add/rename/delete the groups used
   throughout Workouts and Weeks. Rename and delete both cascade into
   `WorkoutService` via an atomic batch — see
   [Database → Denormalization & consistency](./database.md#denormalization--consistency)
   for exactly how, and why it has to be atomic. Deleting a group shows a
   confirmation banner stating how many workouts will move to `Unassigned`
   before committing. The reserved `Cardio` category can't be created,
   renamed, or targeted this way (checked case-insensitively) — see
   [Database → The Cardio category](./database.md#the-cardio-category).

## Analytics

**Files**: `pages/analytics/` (`analytics.ts`/`.html`/`.css`, `goal-form-modal.ts`,
`weight-burndown/`, `muscle-progress/`, `totals/`), `analytics/` (pure maths —
`burndown.ts`, `exercise-metrics.ts`, `totals.ts`), `components/charts/`
(reusable chart toolkit), `services/weight-analytics.service.ts`,
`services/exercise-analytics.service.ts`, `services/entry-backfill.service.ts`.

One range selector (30d/90d/6m/1y/All) scoping a stack of three cards. The range
lives on the page, never per-card — two cards showing different windows is how a
dashboard starts lying. (A card may still have its *own* view toggles — the
metric switch, the totals breakdown switch — because those change what is shown,
not which window it is drawn from.)

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

Cardio workouts are excluded here entirely (their reps/weight-based metrics
above don't apply) rather than folded into the `Unassigned` chip —
`ExerciseAnalyticsService.exercisesInGroup` and `MuscleProgressComponent`'s
group list both use `isOrphanGroup()` (`workout.service.ts`), which
special-cases `CARDIO_GROUP` for exactly this reason. Cardio *totals* now live on
the Totals card below; a cardio **trend** view — pace over time, weekly mileage —
is still separate, future work.

### Totals

**Files**: `analytics/totals.ts` (+ `.spec.ts`), `pages/analytics/totals/`.

The other two cards answer "how am I *trending*?"; this one answers "how much
have I *done*?" — over the page's window, so "All" gives lifetime figures.

Two tile rows and a table. **Lifting**: training days, sets, reps, and total
weight lifted (Σ reps×weight). **Cardio**: distance, time, sessions — kept in
their own row rather than folded in, because a 5-mile run has nothing to say
about tonnage. Then a **breakdown table** ranked by volume, toggled between
per-exercise and per-muscle-group; cardio is excluded from both, for the same
reason it's excluded from the card above.

All the arithmetic is pure in `analytics/totals.ts` (`computeTotals`), which
reuses `totalVolume`/`totalReps`/`setCount` from `exercise-metrics.ts` rather
than re-summing `reps×weight` — those already encode which rows count as a
logged set. Three rules worth knowing:

- **`volumeLbs` is `null`, not `0`, when nothing qualified**, and renders `—`.
  The per-session metrics already return `null` for "not applicable", and that
  has to survive aggregation: a month of bodyweight-only training genuinely has
  no tonnage, and `0 lbs` would read as a measurement rather than an absence.
  Counts are plain numbers, where zero *is* truthful.
- **The caller decides what is cardio.** `computeTotals` takes entries with
  `cardio` already resolved, because `CARDIO_GROUP` is a value export from
  `workout.service.ts` — importing it would drag Firestore into a pure module.
  `ExerciseAnalyticsService.totalsEntries()` applies the same
  `muscleGroup === CARDIO_GROUP && entry.cardio` predicate `entrySummary` uses.
- **Convert the sum, never the addends.** `convertWeight` rounds to one decimal
  (see [Database → Round-trip drift](./database.md#round-trip-drift--the-trap-to-know-about)),
  which is negligible once but compounds across thousands of entries. The card
  sums canonical lbs/miles and calls `displayLifted`/`displayDistance` once. It
  also formats with `toLocaleString()` rather than the `lifted` pipe, which emits
  ungrouped digits — fine at `135 lbs`, unreadable at `1,234,567 lbs`.

Body-weight exercises need no special case: a logged body-weight set already
stores a real weight (the weigh-in at logging time), so it counts toward tonnage
exactly as the exercise-progress volume metric already treats it.

`formatDuration` (`services/cardio.ts`) renders total cardio time as `"12h 30m"`.
It exists because `formatTime` only emits `m:ss`, which turns forty hours of
running into `"2400:00"`.

**No new Firestore reads.** `ExerciseAnalyticsService.entries` already streams
every entry the user has logged and never filters by date — the range has always
been applied client-side — so this card costs one more pass over data already in
memory, and needed no rules or index change.

### Adding another analytic

Write a reducer in `analytics/` and a card that composes `AnalyticsCardComponent` +
`StatTileComponent`, plus `LineChartComponent` or `BarChartComponent` if the
analytic actually wants a chart — Totals doesn't, and didn't have to pretend
otherwise. The chart layer should need no change — that's the test of the design.
Totals is the worked example: a pure `totals.ts` + `totals.spec.ts`, one accessor
on the existing service, a card, and one line on the page.

> **Reading workout history across weeks** (the burndown reads flat `weights`; a
> *workout* analytic can't). `WeekService` subscribes to one `weekId` at a time, and
> parent `weeks/{weekId}` docs are Firestore *phantoms* (only `addDoc` into `entries`
> ever runs), so you can't enumerate weeks. This is **solved** for the exercise card:
> every entry now carries a denormalized `uid` + `date` (set by `WeekService`), so
> `ExerciseAnalyticsService` reads all history with one `collectionGroup('entries')`
> query filtered by `uid`, and `EntryBackfillService` stamps old entries once. It
> needs a Firebase-console collection-group index + security rule — see
> [Database → Cross-week analytics reads](./database.md#cross-week-analytics-reads-the-exception).

## Friends

**Files**: `pages/friends/` (`friends.ts`, `.html`, `.css`),
`services/friend.service.ts`, `services/user-profile.service.ts`,
`services/friends.ts` (+ `friends.spec.ts`).

The app's **only cross-user feature**, and the reason two top-level Firestore
collections exist at all — see
[Database → Cross-user collections](./database.md#cross-user-collections-friends).

What `/friends` does:

- **Search** by display-name prefix or exact email, or **browse everyone** by
  hitting Search with an empty box. A term containing `@` is matched exactly
  against `emailLower`; anything else is a prefix match on `displayNameLower`.
  Firestore has no full-text search, so "kita" will not find "Mikita" — a
  limitation to state to users, not a bug to fix, and the reason browsing exists.
- **Paged, 20 at a time**, with Previous/Next. See
  [Database → userProfiles](./database.md#userprofilesuid--the-searchable-directory)
  for the cursor mechanics.
- **Emails are matchable but never rendered.** Search hits, the friend list and
  the request rows show display names only. That's why the published name falls
  back to the email's *local part* (`profileNameFor` in
  `user-profile.service.ts`) rather than reusing `AuthService.displayName`, whose
  fallback is the whole address — fine for labelling yourself, a leak when shown
  to other people.
- **Request → accept.** Sending creates a `pending` friendship; only the
  recipient can accept it. Decline, cancel and unfriend are all the same
  `deleteDoc`, so a declined pair is free to try again later.
- **Requests surface on this page only** — no nav badge, no toast, no push. A
  request sits under "Friend requests" until the user opens `/friends`.

### Seeing a friend's week and weight

**Files**: `pages/friends/friend-week/`, `pages/friends/friend-weight/`, plus the
shared `components/week-grid/` and `components/week-nav/`.

Each friend's row carries two buttons — a calendar and a scale — that expand a
read-only panel **in place**, below that row. No route change, no page.

The **week** panel is the Weeks page's own grid in read-only, compact form, so
the two views cannot drift apart: `WeekGridComponent` is the same component,
`WeekNavComponent` is the same nav, and the entries come from the same query via
`WeekService.entriesFor(uid, weekId)`.

The **weight** panel shows their latest weigh-in, the net change across the
loaded window, and that window as a short list. It reads
`WeightService.recentFor(uid)`, which is bounded to the last `RECENT_WEIGHTS`
entries — nobody needs a friend's whole history to answer "what do they weigh?",
and an unbounded log is a pointless download.

Four things about the panels are deliberate:

- **One at a time, across the whole list.** The two buttons on a row behave like
  tabs, and opening either closes whatever else was open. Each panel is a live
  Firestore subscription; a list of them would keep several running while the
  user reads one.
- **The week panel keeps its own cursor.** `FriendWeekComponent` holds a private
  `mondayOf` signal rather than driving `WeekService.currentWeekStart`. Paging
  back through a friend's month must not move the week on the user's own Weeks
  page. Only the shared `today` clock is borrowed, so the "today" highlight still
  rolls over at midnight.
- **A refused read is not an empty result.** See
  [Database → Reading a friend's data](./database.md#reading-a-friends-data).
- **The weight change is not colour-coded.** Neither direction is "good" without
  knowing the person's goal, and green/red would have the app cheering or
  scolding someone's body weight. The ± sign carries the direction.

Units follow the **viewer**, not the logger. Week entries store canonical pounds
and miles, and `entrySummary` (`services/entry-summary.ts`, pure and unit-tested)
renders them in whatever the reader picked in Settings. `WeightEntry` stores both
kg and lbs, so `weightIn` picks a field rather than converting — no rounding
drift.

Still not built: a friend's profile, their weight **goal**, their analytics.

**Interaction with the rest of the app**: the Weeks page now composes
`WeekGridComponent` + `WeekNavComponent` instead of owning its grid markup, and
its per-entry summary moved to `services/entry-summary.ts`. No data shape,
collection or route changed. `ShellComponent` gained one injection —
`UserProfileService`, purely for its side effect of publishing the signed-in
user's directory entry — because the shell wraps every signed-in route, and
nothing outside it has a user to publish.

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
