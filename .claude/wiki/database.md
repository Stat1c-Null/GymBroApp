# Database

## Backend

Firebase project `gymbroapp-7b680`. Two pieces are used:

- **Firebase Auth** — email/password and Google popup sign-in.
- **Cloud Firestore** — app data scoped per-user under `users/{uid}`, plus two
  top-level collections for the friend graph. The only per-user data another
  user can read is `weeks/*/entries` and `weights`, and only between accepted
  friends — see [Reading a friend's data](#reading-a-friends-data).

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

Almost everything is nested under `users/{uid}/...`. The **only** exceptions are
the two top-level collections the Friends feature needs, because friend search
has to read other people's names — see
[Cross-user collections](#cross-user-collections-friends).

```
users/{uid}
├── settings/preferences        (single doc)
├── workouts/{workoutId}        (collection)
├── weights/{weightId}          (collection)
└── weeks/{weekId}/entries/{entryId}   (sub-collection per week)

userProfiles/{uid}              (top-level — the searchable directory)
friendships/{pairId}            (top-level — the friend graph)
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

## Cross-user collections (Friends)

The per-user tree above structurally cannot support friend search: finding
someone means reading a document that isn't yours. So the Friends feature adds
the app's only two top-level collections. Nothing about a user's workouts, weight
or settings leaves `users/{uid}` — only what's needed to find and label a person.

### `userProfiles/{uid}` — the searchable directory

Owned by `UserProfileService`. Shape (`UserProfile` in `services/friends.ts`):

```ts
{
  uid: string;
  displayName: string;       // shown in search results and friend lists
  displayNameLower: string;  // prefix-search key
  emailLower: string;        // exact-match search key — NEVER rendered
  createdAt: Timestamp;      // first write only
  updatedAt: Timestamp;
}
```

Upserted by an `effect()` on `AuthService.currentUser`, and only when a field
would actually change — signing in shouldn't cost a write on every page load.
`ShellComponent` injects the service purely to make that effect run.

**Existing users become searchable on their next sign-in, and there is no
back-fill.** Unlike `EntryBackfillService`, which can walk week ids
deterministically, a client cannot enumerate Firebase Auth users — so an account
that never signs in again simply stays unfindable. There is no client-side fix.

`listProfiles(term, after)` is the single read path, with three query shapes —
all **single-field**, so all auto-indexed with no composite index:

- **empty term** → `orderBy('displayNameLower')`, paged. Browsing the whole
  directory is the fallback when prefix search can't help (you don't know the
  spelling), and the fastest way to answer "does this person have a profile yet?"
- **email** (term contains `@`) → `where('emailLower', '==', term)`, unpaged —
  there's at most one hit. **No `orderBy` on this path**: pairing an equality
  filter with a sort on a *different* field is exactly what forces a composite
  index.
- **name** → `where('displayNameLower', '>=', term)` +
  `where('displayNameLower', '<=', term + PREFIX_SENTINEL)`, paged. The range
  filter and the sort are on the same field, so it stays single-field.

`PREFIX_SENTINEL` is U+F8FF, built with `String.fromCharCode` rather than written
as a literal — the raw character is invisible and doesn't survive every editor or
diff intact, and a mangled sentinel would silently break every name search.
Firestore has no full-text search: prefix matching is the whole story.

**Paging** is `PROFILE_PAGE_SIZE` (20) per page, cursor-based. Two details worth
not relearning:

- The query asks for `PAGE_SIZE + 1` rows. Whether that extra row comes back is
  how "is there a next page?" is answered — no second count query.
- The cursor is a **document snapshot**, not the last name string. Firestore
  appends the document id as a tiebreaker to every sort, and only a snapshot
  carries that tiebreaker; a bare name would silently skip people who share a
  display name with the one on a page boundary.

The page component keeps a `cursors[]` array (index → that page's start cursor)
so Previous jumps straight back instead of re-walking from page one. Note that
the signed-in user is filtered out of results *client-side*, after the read, so a
page can legitimately show 19 rows.

### `friendships/{pairId}` — the friend graph

Owned by `FriendService`. `pairId = [uidA, uidB].sort().join('_')`.

```ts
{
  members: [string, string];   // sorted — the array-contains query key
  requesterUid: string;        // who sent it; only the *other* member may accept
  status: 'pending' | 'accepted';
  createdAt: Timestamp;
  respondedAt?: Timestamp;     // set on accept
}
```

**One shared document per relationship, not a mirrored copy under each user.**
Mirroring would put the same fact in two places and need a `writeBatch` to keep
them honest on every accept and unfriend — exactly the problem
[Denormalization & consistency](#denormalization--consistency) below describes for
muscle groups. One doc makes that consistency structural instead of enforced.

The **deterministic id** carries the rest of the design: A→B and B→A resolve to
the same document, so duplicate requests and the both-request-each-other race are
impossible by construction — no "does one already exist?" pre-query, no dedupe.
Direction is derived (`requesterUid` vs. the reader), never stored twice.

Decline, cancel and unfriend are all the same `deleteDoc`, which also means a
declined pair can try again later.

Reads are **one live query**: `where('members', 'array-contains', uid)` — no
`orderBy`, no `status` filter, so it stays single-field and needs **no composite
index**. `splitFriendships()` (`services/friends.ts`, pure and unit-tested) does
the bucketing into friends / incoming / outgoing and the newest-first sort
client-side.

### Reading a friend's data

Friends can open each other's **logged week** and **body-weight log** from the
Friends page. Nothing is copied to do it: `WeekService.entriesFor(uid, weekId)`
and `WeightService.recentFor(uid)` run the *same* queries the Weeks and Weight
pages run, just against another uid, and the rules below decide whether it is
allowed.

That makes the security rule the only gate — which is why the client treats a
failed read as its own state. Both panels distinguish three outcomes, where the
owner-facing pages need only two: `undefined` (loading), `[]` (nothing logged),
and `'failed'` (refused or offline). Showing a refused read as an empty result
would quietly tell someone their friend skipped the gym, or never weighs in.

Exactly two subtrees open up, both read-only:

| Path | Exposed as |
|---|---|
| `users/{uid}/weeks/*/entries` | `FriendWeekComponent` — the whole week, any week |
| `users/{uid}/weights` | `FriendWeightComponent` — the last `RECENT_WEIGHTS` weigh-ins |

The weight window is bounded in the *query* (`orderBy` + `limit`), which is a
product decision, not a security boundary — the rule permits the whole
collection, so a wider `limit` would return more. Narrow the rule if that ever
needs to be enforced.

Settings, the weight **goal**, the workout library and the analytics back-fill
all stay owner-only. Nothing anywhere becomes writable across a friendship.

**This is a privacy decision, not just a schema one.** Accepting a friend request
now discloses body weight, with no per-field opt-out and no indication to the
owner that someone looked. If that should be optional, the natural home is a flag
on `userProfiles/{uid}` checked in the rule alongside `isAcceptedFriend`.

### Firebase-console setup this repo can't ship

Same situation as the collection-group index above — no rules file lives here.
🟠 These rules are a reviewed starting point, not verified code: check them in the
Rules Playground before trusting them. The friend-read rule in particular is
worth exercising from all three sides — owner, accepted friend, and a stranger.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Sorted-pair friendship id, matching friendshipId() in services/friends.ts.
    function pairId(a, b) {
      return a < b ? a + '_' + b : b + '_' + a;
    }

    // Is the signed-in user an *accepted* friend of otherUid? exists() first:
    // get() on a missing document yields null, and reading .data off it fails.
    function isAcceptedFriend(otherUid) {
      let path = /databases/$(database)/documents/friendships/$(pairId(request.auth.uid, otherUid));
      return exists(path) && get(path).data.status == 'accepted';
    }

    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // A friend's logged week — read-only. Rules are OR-ed with the owner rule
    // above, so this only ever adds access.
    match /users/{userId}/weeks/{weekId}/entries/{entryId} {
      allow read: if request.auth != null && isAcceptedFriend(userId);
    }

    // A friend's body-weight log — read-only.
    match /users/{userId}/weights/{entryId} {
      allow read: if request.auth != null && isAcceptedFriend(userId);
    }

    match /{path=**}/entries/{entryId} {
      allow read: if request.auth != null && resource.data.uid == request.auth.uid;
    }

    match /userProfiles/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    match /friendships/{pairId} {
      allow read:   if request.auth.uid in resource.data.members;
      allow create: if request.auth.uid == request.resource.data.requesterUid
                    && request.auth.uid in request.resource.data.members
                    && request.resource.data.members.size() == 2
                    && request.resource.data.status == 'pending';
      // Only the recipient can accept, and only pending → accepted.
      allow update: if request.auth.uid in resource.data.members
                    && request.auth.uid != resource.data.requesterUid
                    && resource.data.status == 'pending'
                    && request.resource.data.status == 'accepted'
                    && request.resource.data.members == resource.data.members;
      allow delete: if request.auth.uid in resource.data.members;
    }
  }
}
```

Note what the `update` rule buys beyond "only the recipient accepts": because a
`setDoc` onto an existing document counts as an update, it also refuses to
re-open an already-accepted friendship as pending.

`isAcceptedFriend` reads a second document, but only once per *query*, not once
per entry — the condition depends on the path and `get()`, never on
`resource.data`, which is also what keeps it usable for a collection query at
all.

Any signed-in user can read any profile — that is the deliberate price of search.
It is why `emailLower` is stored lowercased for matching but never rendered, and
why the published `displayName` falls back to the email's local part rather than
the whole address.

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
