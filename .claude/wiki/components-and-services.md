# Components & Services Catalog

## Services (`src/app/services/`)

All `@Injectable({ providedIn: 'root' })` — one instance app-wide, injected
via `inject()`, never provided per-component.

| Service | Backs | Key state (signals) | Key methods |
|---|---|---|---|
| `AuthService` | Firebase Auth | `currentUser`, `displayName` (computed) | `signUp`, `signIn`, `signInWithGoogle`, `resetPassword`, `logout`, `requireUid(action?)` |
| `SettingsService` | `users/{uid}/settings/preferences` | `showSetTime`, `muscleGroups`, `unit`, `distanceUnit`, `weightGoal`, `entriesBackfilledAt` (all computed, defaulted) | `setShowSetTime`, `setMuscleGroups`, `setUnit`, `setDistanceUnit`, `setWeightGoal`, `clearWeightGoal`, `renameGroup`, `deleteGroup`, `markEntriesBackfilled` |
| `WorkoutService` | `users/{uid}/workouts` | `workouts` (`undefined` while loading) | `add`, `update`, `remove`, `stageGroupReassign(batch, from, to)`; module functions `isOrphanGroup`, `loggableGroups(groups, workouts)`, `workoutsInGroup(workouts, group, knownGroups)` — the last two shared by the Weeks logging modal and the set builder so their pickers can't drift |
| `WorkoutSetService` | `users/{uid}/workoutSets` | `sets` (`undefined` while loading) | `add`, `update`, `remove`. Saved **sets** — reusable bundles of exercises. Items live in an array on the doc, sanitized on every write (Firestore rejects `undefined`, and these live *inside* an array — see [Database → workoutSets](./database.md#usersuidworkoutsetssetid)) |
| `WeekService` | `users/{uid}/weeks/{weekId}/entries` | `entries`, `currentWeekStart`, `weekId`, `rangeLabel`, `isCurrentWeek`, `today` | `add`, `update`, `remove`, `previousWeek`, `nextWeek`, `goToThisWeek`, `entriesFor(uid, weekId)` — the same live query against *any* uid, used by the Friends page to show a friend's week (rules decide; the stream errors if they aren't friends) |
| `WeightService` | `users/{uid}/weights` | `weights` | `add`, `remove`, `recentFor(uid)` — the last `RECENT_WEIGHTS` weigh-ins of any user, for the Friends page's weight panel (rules decide; the stream errors if they aren't friends) |
| `WeightAnalyticsService` | derives from `WeightService` + `SettingsService` | `samples`, `daily`, `trend`, `latestLbs`, `goal`, `today` | — (read-only derivation) |
| `ExerciseAnalyticsService` | collection-group over all `entries` (+ `WorkoutService`/`SettingsService`) | `entries` (all weeks), `loaded`, `groups` | `exercisesInGroup(group)`, `sessionsFor(ids)` — read-only |
| `EntryBackfillService` | `users/{uid}/weeks/*/entries` | — | `backfillEntries()` — one-time uid/date migration (idempotent) |
| `UserProfileService` | `userProfiles/{uid}` (top-level) | — (a `Map` cache, not a signal) | `listProfiles(term?, after?)` — one paged page of the directory (empty term = browse everyone), `profileFor(uid)`; an `effect()` publishes the signed-in user's entry |
| `FriendService` | `friendships/{pairId}` (top-level) | `friendships`, `friends`, `incomingRequests`, `outgoingRequests`, `byOtherUid` | `sendRequest`, `accept`, `decline`, `cancel`, `remove` |
| `ChartThemeService` | `ThemeService` | `palette` (computed) | — |
| `ThemeService` | `localStorage` only | `theme` (`'light' \| 'dark'`) | `toggleTheme` |
| `ToastService` | in-memory only | `message`, `type`, `visible` | `show(message, type?, duration?)` |

Details, data shapes, and the shared Firestore→signal pattern all four
Firestore-backed services follow: see
[Architecture → the service/signal pattern](./architecture.md#the-servicesignal-pattern-central)
and [Database](./database.md).

`requireUid(action?)` on `AuthService` is the one auth-check every mutating
method in every other service calls first — it throws a user-facing "You
must be signed in to {action}." if there's no current user, so callers don't
each need their own null check.

### Pure modules in `services/`

Not every file here is injectable. Several are plain functions — no Angular, no
Firestore — because the interesting part is a decision or a calculation, and
that is far cheaper to test directly than through a component. They sit beside
the services they serve rather than in a `utils/` bucket:

| Module | What it holds |
|---|---|
| `entry-summary.ts` | The one-line "12×60 · 10×60 lbs" summary, in the *reader's* units. Its parameter is the structural `SummarizableExercise`, so both `WeekEntry` and a saved set's `SetItem` satisfy it — one sentence about an exercise, not two. |
| `cardio.ts` | Distance/elevation/pace conversion and formatting. Deliberately free of Angular and Firestore imports. |
| `set-rows.ts` | The per-set editing model (`SetRow`) plus seeding, pooling, and the **canonical-weight round-trip guard** — the 135 lbs → 61.2 kg → 134.9 lbs trap. Shared by the Weeks logging modal and the set builder. |
| `apply-set.ts` | `entriesFromSet` (a saved set → logged entries, with the skip/body-weight/no-write-back rules) and `setItemsFromEntries` (the inverse, for "save this day as a set"). |
| `firestore-utils.ts` | Small Firestore helpers. |
| `friends.ts` | `splitFriendships`, `friendshipId`, profile-name derivation. |

`analytics/` follows the same convention for its maths (`burndown.ts`,
`exercise-metrics.ts`, `time-series.ts`).

## Components (`src/app/components/`)

Reusable, non-page pieces. All standalone.

| Component | Selector | Inputs | Outputs | Notes |
|---|---|---|---|---|
| `AuthLayoutComponent` | `app-auth-layout` | `title`, `subtitle` | — | Wraps Login/Signup; projects form via `<ng-content>`; also renders `SettingsSidebarComponent`. |
| `BrandLogoComponent` | `app-brand-logo` | `size` | — | Inline SVG dumbbell mark with a per-instance gradient id (`uid++` module counter avoids duplicate-id collisions when rendered more than once on a page). |
| `GoogleButtonComponent` | `app-google-button` | `loading`, `label` | `clicked` | Presentational only — caller owns the actual sign-in call. |
| `PasswordInputComponent` | `app-password-input` | `label`, `inputId` (required), `placeholder`, `autocomplete`, `name`, `value` (`model()`) | (via `model()`) | Show/hide toggle built in. `value` is a two-way `model()`, used as `[(value)]` by callers. |
| `ModalComponent` | `app-modal` | `open`, `title`, `wide` | `close` | The app's one generic modal shell (dimmed overlay + close on backdrop/✕). Page content goes in `<ng-content>`, wrapped in a `.modal-body` that scrolls on its own so the ✕ and heading stay reachable however tall the content grows — the modal itself is capped at `100dvh - 3rem`. `wide` opts into the multi-column desktop width and does nothing below 900px. `.modal-overlay`/`.modal-content` styles are global, not scoped to this component. |
| `SettingsSidebarComponent` | `app-settings-sidebar` | — | — | Floating panel (corner toggle button) holding just `ThemeToggleComponent`. Used only on auth pages — signed-in pages use the nav sidebar's toggle instead. Closes on Escape (`@HostListener`). |
| `ThemeToggleComponent` | `app-theme-toggle` | — | — | Reads/writes `ThemeService` directly; no inputs/outputs. Embedded in both `NavSidebarComponent` and `SettingsSidebarComponent`. |
| `ToastComponent` | `app-toast` | — | — | Mounted once at app root; reads `ToastService` directly. |
| `WorkoutFormModalComponent` | `app-workout-form-modal` | `open`, `editingWorkout`, `presetGroup` | `close`, `saved` | Owns the entire create/edit-workout form + validation + save call. Shared by the Workouts page and the Weeks page's inline "create new workout" flow — see [Features → Workouts](./features.md#workouts-exercise-library). Re-seeds its fields from `editingWorkout`/`presetGroup` only on the closed→open transition (tracked via a local `prevOpen` flag in an `effect()`), so it doesn't clobber in-progress typing while already open. The weight half of the form has three modes: usual/max inputs, the "Body weight" toggle that replaces them, and Cardio (which hides all of it) — the latter two always save `usualWeight`/`maxWeight` as `null`. |
| `BodyWeightPromptComponent` | `app-body-weight-prompt` | — | — | The "no body weight logged yet" empty state plus a one-field form to log one inline, in the user's unit (both units still stored). Used by `WorkoutFormModalComponent` and the Weeks logging modal, because a body-weight exercise has nothing to fill its sets from until a weigh-in exists, and sending the user to `/weights` mid-form would throw away what they'd typed. **Self-gating**: renders nothing while the log is loading or once it holds anything, so callers just place it. Reads/writes `WeightService` directly; the live stream then re-seeds the open set rows via `WeeksComponent`'s effect. Sits inside another component's `<form>`, hence `ngModelOptions: standalone` and an Enter handler that logs instead of submitting. |
| `ChangelogEntryComponent` | `app-changelog-entry` | `version`, `date`, `changes` (all `input.required`) | — | Bordered card for one changelog release. See [Features → Changelog](./features.md#changelog). |
| `LiftedWeightPipe` | `lifted` (pipe) | — | — | `{{ set.weight \| lifted: unit() }}` → `"135 lbs"` / `"61.2 kg"`. Takes the unit as an argument rather than injecting it, so the pipe stays pure. See [Database → Weight unit handling](./database.md#weight-unit-handling). |
| `WeekGridComponent` | `app-week-grid` | `entries`, `weekStart` (required), `today`, `editable`, `compact` | `add(day)`, `edit(entry)`, `remove(entry)`, `saveAsSet(day)` | The 7-day grid, shared by the Weeks page and the friend-week panel. Purely presentational — takes entries, emits intent, subscribes to nothing, which is what lets it render *someone else's* week. `editable` off drops the add/edit/delete affordances entirely rather than disabling them; `compact` swaps the full-height page grid for a fixed-height side-scrolling strip that does **not** stack on mobile. `saveAsSet` is offered only for a day that already has entries — there is nothing to capture from an empty column. The one service it injects is `SettingsService`, for units — always the *viewer's*. |
| `SetRowsEditorComponent` | `app-set-rows-editor` | `rows` (required), `trackTime` (`model()`), `bodyWeight`, `bodyWeightDisplay`, `template`, `idPrefix` | `countChange` | The set-count field, the time-per-set toggle and the per-set reps/weight/time rows. Shared by the Weeks logging modal and the set builder. Presentational: renders `SetRow` objects the *caller* owns and lets `ngModel` mutate them in place; all the arithmetic (seeding, pooling, and the canonical-weight round-trip guard) is pure in `services/set-rows.ts`. `template` mode = planning a set rather than logging, which hides a body-weight exercise's weight entirely and suppresses the weigh-in prompt. `idPrefix` keeps control names unique when several are in one `<form>`. |
| `CardioFieldsComponent` | `app-cardio-fields` | `timeText`, `distance`, `heartRate`, `elevation` (all `model()`), `idPrefix` | (via `model()`) | Duration / distance / avg heart rate / elevation, plus the read-only computed pace (never typed — two numbers that can disagree is a bug waiting to happen). Shared by the Weeks logging modal and the set builder. The module also exports `toCardioLog`/`fromCardioLog`, the display-unit ↔ canonical boundary. |
| `SetFormModalComponent` | `app-set-form-modal` | `open`, `editingSet`, `presetItems`, `presetName` | `close`, `saved` | Owns the whole create/edit-**set** builder: name, description, and an ordered list of `SetItemEditorComponent` blocks. Same input-driven shape as `WorkoutFormModalComponent`, and re-seeds on the closed→open transition the same way. `presetItems`/`presetName` open it pre-filled — that's the Weeks page's "save this day as a set". Layers `WorkoutFormModalComponent` over itself for "+ Create new workout". The only `wide` modal: from 900px up the exercise blocks lay out as columns wrapping onto the next row (four across at full width — the count falls out of a 320px track floor against the 1500px cap, so it can't overflow sideways), and name/description pair up; below 900px it's the plain single-column stack. See [Features → Workout Sets](./features.md#workout-sets-reusable-groups-of-exercises). |
| `SetItemEditorComponent` | `app-set-item-editor` | `item` (required), `position` (required) | `remove`, `createWorkout` | One exercise block inside the builder — group/workout pickers, then `SetRowsEditorComponent` or `CardioFieldsComponent`, then an optional note. Edits the `BuilderItem` it's handed **in place**; that object's fields are signals precisely because parent and child share it by reference. Labels a block whose exercise has left the library rather than emptying it. |
| `WeekNavComponent` | `app-week-nav` | `isCurrentWeek` | `previous`, `next`, `thisWeek` | Prev / This week / Next. Stateless by design: the Weeks page wires it to `WeekService`, the friend-week panel to its own private week signal. Add `class="compact"` for the smaller embedded size. Styles live in the component, not `styles.css`. |

### Charts (`src/app/components/charts/`)

The reusable analytics toolkit. Adding a new analytic should mean writing a data
reducer and a card — not touching anything in here.

| Component | Selector | Inputs | Notes |
|---|---|---|---|
| `LineChartComponent` | `app-line-chart` | `series` (required), `height`, `yDomain`, `xDomain`, `formatX`, `formatY`, `ariaLabel` (required) | **The only place Chart.js is touched.** Speaks `ChartSeries`/signals; quarantines ng2-charts, which is decorator-based and not signal-native. Declares `provideCharts(withDefaultRegisterables())` in its own `providers` — doing it in `app.config.ts` put ~208kB of Chart.js in the *initial* bundle. Renders an `.sr-only` table twin because a `<canvas>` is opaque to assistive tech. Uses a `linear` x scale over epoch-ms, not Chart.js's `time` scale, which would need a date-adapter dependency. |
| `BarChartComponent` | `app-bar-chart` | `series` (required), `height`, `yDomain`, `formatX`, `formatY`, `ariaLabel` (required) | The second (and only other) Chart.js touchpoint — grouped bars for genuinely different entities (one exercise per series). Uses the fixed-order **categorical** palette (colour = identity), a `category` x-axis, a zero-based y-axis (bar length encodes magnitude), and the same `.sr-only` table twin as the line chart. |
| `AnalyticsCardComponent` | `app-analytics-card` | `title` (required), `subtitle`, `state`, `emptyMessage` | Titled `.glass-card` with loading/empty/ready states; encodes the `undefined = loading, [] = empty` convention once. Has **no** filter slot on purpose — per-card ranges let cards disagree. |
| `StatTileComponent` | `app-stat-tile` | `label` (required), `value` (required), `unit`, `tone`, `hint` | One headline number. A toned tile always renders an arrow + words, never colour alone. |
| `RangeSelectorComponent` | `app-range-selector` | `range` (`model()`) | 30d/90d/6m/1y/All. Belongs in one row above the cards. |

`ChartThemeService` + `CHART_PALETTE` (`chart-palette.ts`) supply chart colours from
TypeScript rather than CSS variables — canvas cannot read CSS custom properties, and
reading `getComputedStyle` on theme change races `ThemeService`'s own effect. See
[Design system → Charts](./design-system.md).

`CHART_PALETTE` also carries a validated fixed-order **`categorical`** scale (dataviz
CVD-checked) and `categoricalColor(index, palette)`, used by `BarChartComponent` to
give each exercise series its own stable colour.

## Layout (`src/app/layout/`)

| Component | Selector | Purpose |
|---|---|---|
| `ShellComponent` | `app-shell` | Route target for `''` — wraps every guarded page. Owns sidebar open/close state (`open` signal, defaults open on desktop / closed on mobile via `window.innerWidth`), renders `NavSidebarComponent` + `<router-outlet>`. Injects `UserProfileService` for its side effect only (publishes the signed-in user's directory entry). |
| `NavSidebarComponent` | `app-nav-sidebar` | Left nav: links to all app pages except Changelog (see [Architecture](./architecture.md#layout)), `ThemeToggleComponent`, sign-out. Auto-closes itself on navigation when on a mobile-width viewport (`onNavigate`). |

## Pages (`src/app/pages/`)

Each page is one standalone component, lazy-loaded by its route. See
[Features](./features.md) for what each one does and how they interact —
this list is just the file map:

| Page | Route | Files |
|---|---|---|
| Login | `/login` | `login.ts`, `.html`, `.css` |
| Signup | `/signup` | `signup.ts`, `.html`, `.css` |
| Dashboard | `/dashboard` | `dashboard.ts`, `.html`, `.css` |
| Weeks | `/weeks` | `weeks.ts`, `.html`, `.css` |
| Workouts | `/workouts` | `workouts.ts`, `.html`, `.css` |
| Sets | `/sets` | `sets.ts`, `.html`, `.css` — the saved-set library; the builder lives in `components/set-form-modal/` |
| Weights | `/weights` | `weights.ts`, `.html`, `.css` |
| Analytics | `/analytics` | `analytics.ts`, `.html`, `.css`; `goal-form-modal.ts`; `weight-burndown/` (ts/html/css); `muscle-progress/` (ts/html/css) |
| Friends | `/friends` | `friends.ts`, `.html`, `.css`; `friend-week/` and `friend-weight/` (each ts/html/css) — the read-only panels that expand under a friend's row |
| Settings | `/settings` | `settings.ts`, `.html`, `.css` |
| Changelog | `/changelog` | `changelog.ts`, `.html`, `.css`, `changelog-data.ts` |

## Guards (`src/app/guards/`)

| Guard | Type | Purpose |
|---|---|---|
| `authGuard` | `CanActivateFn` | See [Architecture → Auth guard](./architecture.md#auth-guard-srcappguardsauthguardts). |
