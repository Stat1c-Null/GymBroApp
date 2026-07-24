# Database

## Backend

Firebase project `gymbroapp-7b680`. Two pieces are used:

- **Firebase Auth** — email/password and Google popup sign-in.
- **Cloud Firestore** — all app data, scoped per-user under `users/{uid}`.

Config lives in `src/environments/environment.ts` (dev) and
`environment.prod.ts` (prod), wired up in `app.config.ts` via
`provideFirebaseApp`/`provideAuth`/`provideFirestore`.

**I'm not fully certain this is intentional, so verify it**: both
`environment.ts` and `environment.prod.ts` point at the *same* Firebase
project ID (`gymbroapp-7b680`). There doesn't appear to be a separate
dev/staging Firebase project — local development reads and writes the same
Firestore instance as production.

**No Firestore security rules file exists in this repo** (no
`firebase.json`, no `*.rules` file, no `firestore.indexes.json`). Rules are
presumably managed directly in the Firebase console, or this repo simply
doesn't include Firebase project config/deployment tooling. Either way,
don't assume any server-side access control exists beyond what you can see
in the console — the client-side `authGuard` only prevents unauthenticated
*navigation* within this Angular app, it has no bearing on what Firestore
itself will accept.

## Document layout

Everything is nested under `users/{uid}/...` — there is no top-level
collection containing cross-user data.

```
users/{uid}
├── settings/preferences        (single doc)
├── workouts/{workoutId}        (collection)
├── weights/{weightId}          (collection)
└── weeks/{weekId}/entries/{entryId}   (sub-collection per week)
```

### `users/{uid}/settings/preferences`

One document per user (`SettingsService`). Shape (`UserSettings`):

```ts
{
  showSetTime: boolean;        // default false — see Features → Settings
  muscleGroups?: string[];     // default MUSCLE_GROUPS constant if unset
  unit?: 'kg' | 'lbs';         // display unit; default 'lbs' — see below
  weightGoal?: WeightGoal | null;  // body-weight target driving /analytics
  entriesBackfilledAt?: Timestamp; // set once the analytics uid/date back-fill runs
}

// weightGoal, when set:
{
  startLbs: number;  startKg: number;  startDate: string;   // local YYYY-MM-DD
  targetLbs: number; targetKg: number; targetDate: string;  // local YYYY-MM-DD
}
```

Written with `setDoc(..., { merge: true })`, so each setting can be updated
independently without clobbering the others. `weightGoal` is always written as a
**complete** object — a partial merge could pair one goal's start with another's
target. Clearing it writes `weightGoal: null` rather than deleting the field,
because `merge: true` cannot remove a field; readers treat null and missing alike.

### `users/{uid}/workouts/{workoutId}`

The user's exercise library (`WorkoutService`). Shape (`Workout`):

```ts
{
  name: string;
  muscleGroup: string;          // free-form string, validated against
                                 // settings.muscleGroups at the UI layer only
  usualWeight: number | null;   // ALWAYS pounds — see Weight unit handling
  maxWeight: number | null;
  createdAt: Timestamp;         // serverTimestamp()
}
```

Ordered `orderBy('createdAt', 'desc')` — newest workout first.

`usualWeight` is normally set from the Workouts page's create/edit form, but
`WeeksComponent` (Weeks page) also writes it: logging a day's sets with a
uniform weight different from the current value pushes that weight back onto
the workout — see [Features → Weeks](./features.md#weeks-weekly-workout-logging).

### `users/{uid}/weights/{weightId}`

Body-weight log (`WeightService`). Shape (`WeightEntry`):

```ts
{
  kg: number;
  lbs: number;
  createdAt: Timestamp;
}
```

Both units are stored on every entry — see [Weight unit
handling](#weight-unit-handling) below for why.

### `users/{uid}/weeks/{weekId}/entries/{entryId}`

Logged workout sessions, bucketed by week (`WeekService`). `weekId` is the
**local-date** `YYYY-MM-DD` of the **Monday** that starts that week (see
`mondayOf()`/`toWeekId()` in `week.service.ts` — deliberately *not*
`Date.toISOString()`, which would UTC-shift the date and could put a
Sunday-night entry in the wrong week for users west of UTC).

Shape (`WeekEntry`):

```ts
{
  day: number;                 // 0 = Mon … 6 = Sun (DAY_LABELS is Monday-first)
  workoutId: string;           // ref into users/{uid}/workouts
  workoutName: string;         // denormalized copy — see below
  muscleGroup: string;         // denormalized copy — see below
  trackTime?: boolean;         // per-entry override of the global showSetTime setting
  sets: {
    reps: number | null;
    weight: number | null;
    time?: number | null;      // seconds; optional, older entries lack it
  }[];                         // [] for cardio entries — see below
  cardio?: {                   // present only when muscleGroup is CARDIO_GROUP
    time: number | null;        // seconds
    distance: number | null;    // canonical miles
    heartRate?: number | null;  // average bpm
    elevation?: number | null;  // canonical feet
  };
  createdAt: Timestamp;
  uid?: string;                // owner — service-managed; enables cross-week analytics reads
  date?: string;               // logical local YYYY-MM-DD (Monday + day); service-managed
}
```

Only the *current* week's entries are subscribed to at a time — the
`entries` signal re-subscribes via `switchMap` when `weekId` changes, so
navigating Prev/Next week loads on demand rather than loading the user's
entire history up front.

### Cross-week analytics reads (the exception)

The *exercise* analytics card (`/analytics`) needs every logged entry across all
weeks at once — the opposite of the per-week subscription above.
`ExerciseAnalyticsService` reads them with a Firestore **collection-group** query
over every `entries` sub-collection, filtered `where('uid', '==', uid)`.

That query is only possible because two fields are **denormalized onto every entry**,
both set by the service on write (`WeekService.add`/`update`):

- **`uid`** — Firestore can't scope a collection group to one user by path, so the
  owner is stored on the doc and used both as the query filter and as the security
  rule's guard.
- **`date`** — the logical local `YYYY-MM-DD` (that week's Monday + `day`), so
  analytics gets a stable timeline value without unwrapping the pending
  `serverTimestamp`.

Two pieces of **Firebase-console** setup this repo can't ship (no rules/index files):

1. A **collection-group index** on `entries.uid` — the first query run surfaces a
   console link that creates the exact index.
2. A **security rule** permitting the owner-scoped collection-group read, e.g.
   `match /{path=**}/entries/{entryId} { allow read: if resource.data.uid == request.auth.uid; }`.

**Back-fill for old entries:** entries logged before this feature lack `uid`/`date`,
so they'd be invisible to the query. `EntryBackfillService` stamps them once — an
**additive, idempotent** migration (only `batch.update`s the two fields, skips
already-stamped docs) triggered from the Analytics page on first open and gated by a
persisted `settings.entriesBackfilledAt` flag. It finds entries by walking weekIds
deterministically (Monday → Monday from the account's earliest activity), which
sidesteps the Firestore "phantom parent" problem (a `weeks/{weekId}` parent doc may
not exist even when its `entries` sub-collection does).

## Denormalization & consistency

`WeekEntry.workoutName` and `WeekEntry.muscleGroup` are copied from the
`Workout` at the moment it's logged, not looked up live. This is
deliberate: if the workout is later renamed or deleted from the library, past
week logs keep showing what was actually done at the time, instead of
breaking or silently changing history.

This creates one consistency concern the code explicitly handles: **muscle
group rename/delete**. `Workout.muscleGroup` and
`settings.preferences.muscleGroups` (the list of valid group names) are two
separate pieces of state that must never disagree. `SettingsService.renameGroup`
/ `deleteGroup` → `commitGroupChange` fixes this by using a single Firestore
`writeBatch`: `WorkoutService.stageGroupReassign` queries every workout in the
affected group and stages a `muscleGroup` update for each, then the settings
doc's `muscleGroups` array update is added to the *same* batch before
`batch.commit()`. If the write fails partway, nothing commits — you never end
up with workouts pointing at a group name that no longer exists in settings
(with one designed exception: the reserved `Unassigned` bucket, below).

`WeekEntry.workoutName`/`muscleGroup` are **not** touched by this batch —
historical week logs intentionally keep the old muscle-group name even after
a rename, consistent with the "log reflects reality at logging time"
decision above.

### The `Unassigned` bucket

`UNASSIGNED_GROUP = 'Unassigned'` (`workout.service.ts`) is not stored
anywhere — it's a reserved sentinel string. When a muscle group is deleted,
`deleteGroup` reassigns its workouts' `muscleGroup` field to literally the
string `'Unassigned'` and removes the group from `settings.muscleGroups`.
Any workout whose `muscleGroup` isn't in the current `settings.muscleGroups`
list (including ones set to `'Unassigned'`, or orphaned some other way) is
computed client-side as belonging to this bucket — see `groupedWorkouts` in
`workouts.ts` and `muscleGroups` computed in `weeks.ts`. Users cannot create
a group literally named "Unassigned" (checked case-insensitively in
`settings.ts`).

### The `Cardio` category

`CARDIO_GROUP = 'Cardio'` (`workout.service.ts`) is a second reserved,
never-persisted category, alongside `Unassigned` — but unlike `Unassigned`,
it's meant to always be visible, even with zero workouts in it, and always
**first** wherever muscle groups are listed, so every user has it immediately
with no per-user migration. It's injected into:

- `WorkoutsComponent.groupedWorkouts` (`workouts.ts`) — placed first,
  unconditionally (not filtered by item count like the other groups), so it's
  always the top section; its workout cards hide the usual/max weight stats.
- `WorkoutFormModalComponent.muscleGroupsForForm` — listed first in the
  dropdown, selectable when creating/editing a workout; picking it hides the
  usual/max weight inputs and the form always saves `null`/`null` for those
  fields.
- `WeeksComponent.muscleGroups` (`weeks.ts`) — listed first in the
  add/edit-entry modal's group dropdown, swapping the whole form (below).
- `SettingsComponent.addGroup`/`confirmRenameGroup` — rejects a custom group
  named "Cardio" (case-insensitively), the same way `Unassigned` is blocked.

Because `CARDIO_GROUP` is never in `settings.muscleGroups`, every place that
computes "is this workout orphaned → bucket it under Unassigned" has to
explicitly exclude it, or cardio workouts would wrongly land in Unassigned.
That check is centralized as `isOrphanGroup(muscleGroup, knownGroups)`
(`workout.service.ts`), used by `workouts.ts`, `weeks.ts`,
`exercise-analytics.service.ts`, and `muscle-progress.ts`.

**Logging a cardio entry** is a single session per day — no per-set
breakdown, unlike strength exercises. `WeekEntry` gains an optional `cardio`
field (see below) instead of populating `sets`, which stays `[]`. Whether an
entry is cardio is read from its already-denormalized `muscleGroup`, not a
separate flag. `WeeksComponent` swaps in a duration/distance/heart-rate/
elevation form when the selected group is Cardio (`isCardio` computed); pace
is always computed from duration ÷ distance and shown read-only, never typed
(`formatPace` in `cardio.ts`) — the user chose this over free-typing pace to
avoid two numbers ever disagreeing. Both duration and distance are required
to save; heart rate and elevation are optional. The existing "usual weight"
auto-update feature (`WeeksComponent.syncUsualWeight`) explicitly bails out
for Cardio workouts — the concept doesn't apply, and `sets` being `[]` would
make it a no-op anyway, but the guard is explicit for clarity.

## Weight unit handling

There **is** a per-user display unit: `UserSettings.unit` (`'kg' | 'lbs'`, default
`'lbs'`), exposed as `SettingsService.unit()` and toggled on the Settings page.

The rule that matters:

> **Lifted weight is always *stored* in pounds.** `Workout.usualWeight`,
> `Workout.maxWeight` and `WorkoutSet.weight` are plain numbers with no unit tag,
> and every version of the app has written and displayed them as pounds — so pounds
> is their canonical unit by definition. The unit preference is a **display-and-input
> concern only**: convert at the boundary, never rewrite stored rows. There was no
> data migration, and none is needed.

`LIFTED_STORAGE_UNIT` (`weight.service.ts`) names that canonical unit. Convert with
`displayLifted(lbs, unit)` on the way out and `liftedToCanonical(value, unit)` on the
way in, or use the `lifted` pipe in templates. `WEIGHT_UNIT` still exists but is
`@deprecated` — read `SettingsService.unit()` instead.

`WeightEntry` (body weight) is the exception that needs none of this: it stores **both**
`kg` and `lbs` on every document, so either can be read directly. `WeightGoal` stores
both for the same reason.

### Round-trip drift — the trap to know about

`convertWeight` rounds to 1 decimal, so lbs → kg → lbs is **lossy**: 135 lbs → 61.2 kg
→ 134.9 lbs. That means naively re-converting a form field on save would silently shift
stored weights just because someone opened the form in kg and edited an unrelated field.

Both weight-editing forms guard against this by remembering what they seeded a field
with and writing the original canonical value back when the displayed value is
unchanged — see `SetRow.canonicalWeight`/`seededWeight` in `weeks.ts` and the `seeded`
/`canonical` pair in `workout-form-modal.ts`. If you add another weight input, do the
same.

## Distance unit handling

Same pattern as [Weight unit handling](#weight-unit-handling), for cardio. A
per-user display unit, `UserSettings.distanceUnit` (`'mi' | 'km'`, default
`'mi'`), exposed as `SettingsService.distanceUnit()` and toggled on the
Settings page next to the weight-unit toggle. `WeekEntry.cardio.distance` and
`.elevation` are always *stored* canonically — miles and feet respectively
(`CARDIO_DISTANCE_STORAGE_UNIT` in `cardio.ts`) — regardless of display unit;
convert with `displayDistance`/`distanceToCanonical` and
`displayElevation`/`elevationToCanonical` (or format pace directly with
`formatPace`), never rewrite stored rows. `cardio.ts` has no Angular or
Firestore imports — it's pure conversion/formatting maths, unit-tested as
plain functions, same spirit as `analytics/exercise-metrics.ts`.
