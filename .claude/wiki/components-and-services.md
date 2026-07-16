# Components & Services Catalog

## Services (`src/app/services/`)

All `@Injectable({ providedIn: 'root' })` — one instance app-wide, injected
via `inject()`, never provided per-component.

| Service | Backs | Key state (signals) | Key methods |
|---|---|---|---|
| `AuthService` | Firebase Auth | `currentUser`, `displayName` (computed) | `signUp`, `signIn`, `signInWithGoogle`, `resetPassword`, `logout`, `requireUid(action?)` |
| `SettingsService` | `users/{uid}/settings/preferences` | `showSetTime`, `muscleGroups` (both computed, defaulted) | `setShowSetTime`, `setMuscleGroups`, `renameGroup`, `deleteGroup` |
| `WorkoutService` | `users/{uid}/workouts` | `workouts` (`undefined` while loading) | `add`, `update`, `remove`, `stageGroupReassign(batch, from, to)` |
| `WeekService` | `users/{uid}/weeks/{weekId}/entries` | `entries`, `currentWeekStart`, `weekId`, `rangeLabel`, `isCurrentWeek`, `today` | `add`, `update`, `remove`, `previousWeek`, `nextWeek`, `goToThisWeek` |
| `WeightService` | `users/{uid}/weights` | `weights` | `add`, `remove` |
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

## Components (`src/app/components/`)

Reusable, non-page pieces. All standalone.

| Component | Selector | Inputs | Outputs | Notes |
|---|---|---|---|---|
| `AuthLayoutComponent` | `app-auth-layout` | `title`, `subtitle` | — | Wraps Login/Signup; projects form via `<ng-content>`; also renders `SettingsSidebarComponent`. |
| `BrandLogoComponent` | `app-brand-logo` | `size` | — | Inline SVG dumbbell mark with a per-instance gradient id (`uid++` module counter avoids duplicate-id collisions when rendered more than once on a page). |
| `GoogleButtonComponent` | `app-google-button` | `loading`, `label` | `clicked` | Presentational only — caller owns the actual sign-in call. |
| `PasswordInputComponent` | `app-password-input` | `label`, `inputId` (required), `placeholder`, `autocomplete`, `name`, `value` (`model()`) | (via `model()`) | Show/hide toggle built in. `value` is a two-way `model()`, used as `[(value)]` by callers. |
| `ModalComponent` | `app-modal` | `open`, `title` | `close` | The app's one generic modal shell (dimmed overlay + close on backdrop/✕). Page content goes in `<ng-content>`. `.modal-overlay`/`.modal-content` styles are global, not scoped to this component. |
| `SettingsSidebarComponent` | `app-settings-sidebar` | — | — | Floating panel (corner toggle button) holding just `ThemeToggleComponent`. Used only on auth pages — signed-in pages use the nav sidebar's toggle instead. Closes on Escape (`@HostListener`). |
| `ThemeToggleComponent` | `app-theme-toggle` | — | — | Reads/writes `ThemeService` directly; no inputs/outputs. Embedded in both `NavSidebarComponent` and `SettingsSidebarComponent`. |
| `ToastComponent` | `app-toast` | — | — | Mounted once at app root; reads `ToastService` directly. |
| `WorkoutFormModalComponent` | `app-workout-form-modal` | `open`, `editingWorkout`, `presetGroup` | `close`, `saved` | Owns the entire create/edit-workout form + validation + save call. Shared by the Workouts page and the Weeks page's inline "create new workout" flow — see [Features → Workouts](./features.md#workouts-exercise-library). Re-seeds its fields from `editingWorkout`/`presetGroup` only on the closed→open transition (tracked via a local `prevOpen` flag in an `effect()`), so it doesn't clobber in-progress typing while already open. |
| `ChangelogEntryComponent` | `app-changelog-entry` | `version`, `date`, `changes` (all `input.required`) | — | Bordered card for one changelog release. See [Features → Changelog](./features.md#changelog). |

## Layout (`src/app/layout/`)

| Component | Selector | Purpose |
|---|---|---|
| `ShellComponent` | `app-shell` | Route target for `''` — wraps every guarded page. Owns sidebar open/close state (`open` signal, defaults open on desktop / closed on mobile via `window.innerWidth`), renders `NavSidebarComponent` + `<router-outlet>`. |
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
| Weights | `/weights` | `weights.ts`, `.html`, `.css` |
| Analytics | `/analytics` | `analytics.ts` (inline template, stub) |
| Settings | `/settings` | `settings.ts`, `.html`, `.css` |
| Changelog | `/changelog` | `changelog.ts`, `.html`, `.css`, `changelog-data.ts` |

## Guards (`src/app/guards/`)

| Guard | Type | Purpose |
|---|---|---|
| `authGuard` | `CanActivateFn` | See [Architecture → Auth guard](./architecture.md#auth-guard-srcappguardsauthguardts). |
