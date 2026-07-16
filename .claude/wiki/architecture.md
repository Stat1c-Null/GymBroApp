# Architecture

## Tech stack

- **Angular 21**, standalone components only — there are no `NgModule`s
  anywhere in `src/app`. Every component sets `standalone: true` explicitly.
- **Signals** for all reactive state (`signal`, `computed`, `effect`,
  `input()`/`output()`/`model()`), not `@Input()`/`@Output()` decorators.
- **New control-flow syntax** in templates: `@if`, `@for`, `@empty` — no
  `*ngIf`/`*ngFor` structural directives.
- **`@angular/fire`** (v20) wraps Firebase Auth + Firestore with observable/
  signal-friendly APIs.
- **RxJS interop**: `toObservable` / `toSignal` (from
  `@angular/core/rxjs-interop`) are the bridge every data service uses to turn
  a Firestore stream into a signal — see [The service/signal
  pattern](#the-servicesignal-pattern-central) below.
- **Vitest** for unit tests (not Karma/Jasmine). No e2e framework is
  configured.
- Global styling is one file, `src/styles.css` — see
  [Design System](./design-system.md).

## Bootstrap

`src/main.ts` calls `bootstrapApplication(App, appConfig)`.

`src/app/app.config.ts` registers the app's providers:
- `provideRouter(routes)` — the route table (below)
- `provideFirebaseApp(() => initializeApp(environment.firebase))`
- `provideAuth(() => getAuth())`
- `provideFirestore(() => getFirestore())`

`src/app/app.ts` / `app.html` is the actual root component — it's minimal by
design: just `<router-outlet />` plus `<app-toast />`. The toast is mounted
once at the root (not per-page) because `ToastService` is a global singleton
notification queue — see [Features → Toasts](./features.md#toasts).

## Routing (`src/app/app.routes.ts`)

```
/login, /signup            → standalone pages, no guard, outside the shell
/  (ShellComponent)        → canActivate: [authGuard]
  ├── /dashboard
  ├── /weeks
  ├── /workouts
  ├── /weights
  ├── /analytics
  ├── /settings
  ├── /changelog
  └── '' → redirect to /dashboard
** (wildcard)               → redirect to /dashboard
```

Every route lazily loads its component via `loadComponent: () => import(...)`
— there's no route module or eager page registration. Adding a page means:
create the standalone component, add one `loadComponent` entry as a child of
the `ShellComponent` route (or top-level if it shouldn't have the nav
sidebar, like `/login`/`/signup`).

### Auth guard (`src/app/guards/auth.guard.ts`)

`authGuard` is a `CanActivateFn`. It awaits a single value from
`authState(auth)` — Firebase resolves this once it has restored (or failed to
restore) the persisted session — and returns `true` if a user exists,
otherwise a `UrlTree` redirect to `/login?returnUrl=<originalUrl>`.
`LoginComponent` reads `returnUrl` from the query params on successful
sign-in and navigates there instead of always going to `/dashboard`, so a
guarded deep link isn't lost.

## Layout

Two different shells depending on whether the user is authenticated:

- **`ShellComponent`** (`src/app/layout/shell/`) — wraps every guarded page.
  Renders `NavSidebarComponent`, a hamburger button to reopen the sidebar on
  mobile, a backdrop when open on mobile, and `<router-outlet />` for the
  page body.
- **`NavSidebarComponent`** (`src/app/layout/nav-sidebar/`) — the left nav:
  links to Dashboard/Weeks/Workouts/Weight/Analytics/Settings, plus
  `ThemeToggleComponent` and a Sign Out button. `RouterLinkActive` highlights
  the current page. Note: it does **not** currently link to `/changelog` —
  that page is only reachable via the Dashboard button.
- **`AuthLayoutComponent`** (`src/app/components/auth-layout/`) — used by
  `/login` and `/signup` instead of the shell (there's no nav sidebar before
  sign-in). Centers a glass card with a title/subtitle and projects the
  page's form via `<ng-content />`. Also renders `SettingsSidebarComponent`,
  a floating panel with just the theme toggle — the only way to change theme
  before signing in.

## The service/signal pattern (central)

This is the single most important pattern in the codebase — it repeats
almost identically in `WeekService`, `WeightService`, `WorkoutService`, and
`SettingsService`. Understanding it once explains most of `src/app/services/`.

Each domain has one `@Injectable({ providedIn: 'root' })` service that:

1. Exposes its data as a **signal built from a live Firestore stream**,
   re-subscribing whenever the signed-in user changes:

   ```ts
   readonly workouts = toSignal(
     toObservable(this.auth.currentUser).pipe(
       switchMap((user) =>
         user
           ? collectionData(query(this.userWorkouts(user.uid), orderBy('createdAt', 'desc')),
               { idField: 'id', serverTimestamps: 'estimate' })
           : of(undefined)
       )
     ),
     { initialValue: undefined }
   );
   ```

   `toObservable(auth.currentUser)` turns the auth signal into a stream;
   `switchMap` cancels the previous Firestore subscription and starts a new
   one whenever the user changes (including sign-out, which yields
   `of(undefined)`); `toSignal` turns the result back into a signal pages can
   read directly in templates.

2. Treats **`undefined` as "still loading"** and an **empty array as
   "loaded, but nothing there"** — these are semantically different and
   pages branch on it:

   ```html
   @if (weights(); as list) {
     <!-- render list, list.length === 0 shows an empty-state card -->
   } @else {
     <span class="spinner"></span>
   }
   ```

3. Uses `serverTimestamps: 'estimate'` on every `collectionData`/`docData`
   call. Without it, a just-written document's `createdAt` is `null` until
   the server timestamp round-trips back down, which would make a
   newest-first sort briefly place a new item in the wrong spot before it
   "jumps" into place. `'estimate'` fills the pending timestamp with a local
   clock value so it sorts correctly immediately.

4. Exposes mutations as plain `async` methods (`add`, `update`, `remove`,
   ...) that call `AuthService.requireUid(action)` to get the current uid or
   throw a user-facing error, then call the Firestore SDK directly
   (`addDoc`/`updateDoc`/`deleteDoc`/`setDoc`). There's no separate
   repository/DTO layer — the service *is* the data-access layer, and pages
   call it directly.

`SettingsService` and `WorkoutService` additionally coordinate a
**cross-collection atomic write** via `writeBatch` when a muscle group is
renamed or deleted — see [Database → Denormalization &
consistency](./database.md#denormalization--consistency) for why that matters.

`ThemeService` and `ToastService` don't follow this Firestore pattern — they
hold purely local state (`localStorage` and in-memory, respectively). See
[Features](./features.md) for both.

## Error handling convention

Firebase errors are mapped to user-facing messages in one place:
`AuthService.mapError` (a `Record<code, message>` lookup, falling back to a
generic message for unmapped codes). Other services don't attempt to
interpret Firestore errors — pages that call them just show a generic
"Could not save/delete. Please try again." on catch. There's no global HTTP
interceptor or error boundary; each page's `try/catch` is the whole error
handling story.
