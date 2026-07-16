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
}
```

Written with `setDoc(..., { merge: true })`, so each setting can be updated
independently without clobbering the other.

### `users/{uid}/workouts/{workoutId}`

The user's exercise library (`WorkoutService`). Shape (`Workout`):

```ts
{
  name: string;
  muscleGroup: string;          // free-form string, validated against
                                 // settings.muscleGroups at the UI layer only
  usualWeight: number | null;   // in WEIGHT_UNIT ('lbs') — see below
  maxWeight: number | null;
  createdAt: Timestamp;         // serverTimestamp()
}
```

Ordered `orderBy('createdAt', 'desc')` — newest workout first.

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
  }[];
  createdAt: Timestamp;
}
```

Only the *current* week's entries are subscribed to at a time — the
`entries` signal re-subscribes via `switchMap` when `weekId` changes, so
navigating Prev/Next week loads on demand rather than loading the user's
entire history up front.

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

## Weight unit handling

`WEIGHT_UNIT = 'lbs'` (`weight.service.ts`) is a single hardcoded constant —
**there is no per-user kg/lbs preference yet**, despite `WeightEntry` storing
both units on every document. The dual storage exists only so the Weights
page can show both without a live conversion; `usualWeight`/`maxWeight` on
`Workout` and `WorkoutSet.weight` are **not** unit-tagged fields — they're
implicitly in whatever `WEIGHT_UNIT` currently is, displayed via the
constant everywhere (Weeks, Workouts pages). If a per-user unit preference is
ever added, every read site that assumes `WEIGHT_UNIT` for those fields would
need updating, not just `WeightService`.
