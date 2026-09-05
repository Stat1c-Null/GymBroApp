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

**Security rules live in [`firestore.rules`](../../firestore.rules)** at the
repo root, with `firebase.json` and `.firebaserc` beside it. Deploy them with
`firebase deploy --only firestore:rules`, or paste the file into Firebase
console → Firestore → Rules → Publish. They used to exist *only* in the console,
which is how the friend body-weight rule went missing for a whole release — so
change the file first, and keep it and the deployed rules in step.

There is still no `firestore.indexes.json`: the one composite index this app
needs is created from the console link that the first collection-group query
surfaces (see [Cross-week analytics reads](#cross-week-analytics-reads-the-exception)).
Note also that the client-side `authGuard` only prevents unauthenticated
*navigation* within this Angular app — it has no bearing on what Firestore
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
├── workoutSets/{setId}         (collection — reusable bundles of exercises)
├── weekSets/{setId}            (collection — reusable Mon–Sun plans)
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
  bodyWeight?: boolean;         // exercise loaded by the user's own body weight;
                                 // when true both weights above are null — see below
  note?: string;                // standing note, carried into the next session
  noteCreatedAt?: string;       // local YYYY-MM-DD it was FIRST written
  createdAt: Timestamp;         // serverTimestamp()
}
```

Ordered `orderBy('createdAt', 'desc')` — newest workout first.

`usualWeight` is normally set from the Workouts page's create/edit form, but
`WeeksComponent` (Weeks page) also writes it: logging a day's sets with a
uniform weight different from the current value pushes that weight back onto
the workout — see [Features → Weeks](./features.md#weeks-weekly-workout-logging).

#### Body-weight exercises

`bodyWeight: true` marks an exercise loaded by the user's own weight (pull-ups,
dips). It is a **third mutually exclusive weight mode** alongside the normal
usual/max pair and [Cardio](#the-cardio-category), and it *replaces* those two
inputs in the form rather than adding to them — so `usualWeight`/`maxWeight` are
always written as `null`, exactly like Cardio.

The flag is optional: workouts saved before it existed simply lack the field,
which reads the same as `false`. No migration, same trick as `Cardio` being
absent from `settings.muscleGroups`.

Nothing about the weight is stored on the *workout*. Logging one seeds every
set's `weight` from the newest entry in
[`users/{uid}/weights`](#usersuidweightsweightid) (canonical lbs, from that
entry's own `lbs` field) and renders the field read-only — reps and time stay
editable. An empty weight log is therefore a dead end, which
`BodyWeightPromptComponent` fills inline rather than routing the user off to
`/weights` — see [Features → Weights](./features.md#weights-body-weight-tracking).
Two consequences worth knowing:

- **Set weights are still plain stored numbers.** Analytics (1RM, volume, …)
  and the entry summary need no special case; a logged body-weight set looks
  like any other set that happens to weigh 176.4 lbs.
- **The usual-weight write-back is skipped** for these
  (`WeeksComponent.syncUsualWeight`, the same bail-out Cardio gets). Every set
  agreeing on one weight would otherwise sync it into the library and freeze one
  day's body weight there. Editing an old entry likewise keeps the weight it was
  logged at, never today's — the log reflects reality at logging time.

### `users/{uid}/workoutSets/{setId}`

The user's saved **sets** — reusable bundles of exercises, for anyone who does
the same session every week (`WorkoutSetService`). Applied to a day from the
Weeks page; see [Features → Workout Sets](./features.md#workout-sets-reusable-days-and-weeks).

🟠 **"Set" means two different things in this app, and the code keeps them
apart.** `LoggedSet` (`week.service.ts`) is the gym sense — reps at a weight,
one row of `WeekEntry.sets`. `WorkoutSet` (`workout-set.service.ts`) is *this*:
a named group of exercises. The gym one used to be called `WorkoutSet`; it was
renamed when this feature landed, precisely so a reader never has to guess which
sense a `sets` field carries.

Shape (`WorkoutSet`):

```ts
{
  name: string;
  description: string;         // always written, '' when none — see below
  items: SetItem[];            // ordered
  createdAt: Timestamp;        // serverTimestamp()
}

// SetItem — one exercise, and how it's meant to be done:
{
  workoutId: string;           // ref into users/{uid}/workouts (may dangle)
  workoutName: string;         // denormalized copy
  muscleGroup: string;         // denormalized copy
  bodyWeight?: boolean;        // denormalized from Workout.bodyWeight — see below
  trackTime?: boolean;
  notes: string;               // always written, '' when none
  sets: LoggedSet[];           // [] for a cardio item
  cardio?: CardioLog;          // present only when muscleGroup is CARDIO_GROUP
}
```

Ordered `orderBy('createdAt', 'desc')` — newest set first. Single-field, so
**no composite index**, and the existing owner rule
(`match /users/{userId}/{document=**}`) already covers it: **this feature needed
no change to [`firestore.rules`](../../firestore.rules)**. Nothing about a set is
readable across a friendship, and the collection-group rule matches `entries`
only, so neither interacts with it.

#### Items are an array, not a sub-collection

A set is a handful of exercises, always read and written whole. One document
means one read, one atomic write and no fan-out — and it is nowhere near
Firestore's 1 MiB limit.

🟠 **The footgun that buys:** Firestore rejects `undefined` outright. A top-level
document gets away with loose optionals because the service builds its payload
key by key — but an item lives *inside an array*, where an optional field the
form left `undefined` reaches the write untouched and fails the whole save. So
`WorkoutSetService.sanitizeItem` runs every item on the way in: optional keys are
**omitted** rather than set to undefined, and `time`/`heartRate`/`elevation` are
written as explicit `null`. Add a field to `SetItem` and it must go through
there too.

`description` and `notes` are **always written, as `''` when there is none** —
the same reasoning as [Workout notes](#workout-notes): `update` uses `updateDoc`,
which ignores a missing key, so omitting them could never *clear* one the user
removed.

#### Body weight is not stored in a set

A body-weight item (`bodyWeight: true`) carries **no weight at all** — every
`LoggedSet.weight` in it is `null`. A body weight is a fact about a *day*, not
about a routine: capturing it here would freeze whatever the user weighed when
they wrote the set down into every future week. `entriesFromSet`
(`services/apply-set.ts`) fills it from the newest weigh-in at apply time
instead, the same source [logging one by hand](#body-weight-exercises) uses.

The flag is denormalized onto the item because applying a set must know without
a library lookup — the exercise may have been deleted by then.

#### Applying a set to a day

`services/apply-set.ts` is pure (no Angular, no Firestore) and holds the three
rules, each of which had an obvious-but-wrong alternative:

1. **A collision skips that exercise; it doesn't fail the set.** The Weeks page
   refuses the same workout twice on one day, and a set applied onto a
   partly-logged day trips that. The rest go in and the caller names what didn't.
2. **Body-weight exercises take today's weight** — above.
3. **Nothing is written back to the exercise library.** The usual-weight
   write-back (`WeeksComponent.syncUsualWeight`) is deliberately skipped: a set's
   weights are an intention, not what was lifted, and a stale template would
   quietly overwrite real progress. Editing the resulting entry afterwards goes
   through the normal path and *does* sync. The note write-back is skipped for
   the same reason — a set carrying a note is not the user re-asserting it today.
4. **The set's own note wins; a standing note only fills a blank.** The optional
   `NoteLookup` fifth argument carries
   [standing exercise notes](#note-carry-over) in, so applying a set to a day
   brings forward what you last said about each exercise. A note written into the
   set itself outranks it. `entriesFromItems` is the one place this is decided,
   so the day, week and single-day-of-a-week flows can't disagree; omit the
   lookup and nothing is carried, exactly as before the feature existed.

`setItemsFromEntries` is the inverse, backing "save this day as a set".

The write itself is `WeekService.addMany` — **one `writeBatch`, one commit**, so
a set can never land half-applied.

🟠 That method writes a **client** `Timestamp` for `createdAt`, not
`serverTimestamp()` as everywhere else, and deliberately: every write in a batch
commits at the same instant, so server timestamps would tie and the day column
(`orderBy('createdAt','desc')`) would fall back to random document ids —
scrambling the order of the very routine the user saved. Counting *down* from
`Date.now()` gives the first item the newest stamp. The cost is that a
badly-skewed client clock misorders a set's entries against individually-logged
ones in the same column. That is display order only; nothing reads `createdAt`
for meaning.

#### What a set does *not* track

Muscle-group rename/delete does **not** cascade into saved sets.
`SettingsService.commitGroupChange` batches workouts + settings only; extending
it here would mean a read-modify-write of every set document for a nested array
field. The consequence is contained: `SetItem.muscleGroup` is a denormalized
display value, the builder offers the same `loggableGroups()` list the Weeks
modal does (so an orphaned group lands in `Unassigned` rather than blanking the
dropdown), and applying the set still works. Same spirit as
[`WeekEntry.workoutName`](#denormalization--consistency) keeping the old name.

A deleted *exercise* likewise leaves `workoutId` dangling. The set still applies
— it remembers the name — and the builder labels the block ("no longer in your
library") rather than emptying it.

### `users/{uid}/weekSets/{setId}`

The user's saved **week sets** — a whole Mon–Sun plan, for anyone on a fixed
split (`WeekSetService`, `services/week-set.service.ts`). Loaded into a week from
the Weeks page; see
[Features → Workout Sets](./features.md#workout-sets-reusable-days-and-weeks).

Where a [`WorkoutSet`](#usersuidworkoutsetssetid) is one session, a `WeekSet` is
seven of them — or however many the user actually trains. Shape:

```ts
{
  name: string;
  description: string;         // always written, '' when none — same rule as WorkoutSet
  days: WeekSetDay[];          // sorted by `day`, only non-empty days present
  createdAt: Timestamp;        // serverTimestamp()
}

// WeekSetDay — one weekday of the plan:
{
  day: number;                 // 0 = Mon … 6 = Sun, same as WeekEntry.day
  items: SetItem[];            // the *same* SetItem as a day set — see below
}
```

Ordered `orderBy('createdAt', 'desc')`, single-field, so **no composite index**;
the existing owner rule (`match /users/{userId}/{document=**}`) already covers it,
so like the day-set collection this needed **no change to
[`firestore.rules`](../../firestore.rules)**. Nothing is readable across a
friendship.

#### Its own collection, not a `kind` on `workoutSets`

The alternative was one collection with a discriminator. It was rejected because
the two shapes are read in different places for different reasons, and a
discriminator would put a branch in front of every read of a feature that has
none today — plus every pre-existing document would need a default for the
missing field. Two collections cost one extra `toSignal` stream and nothing else.

#### `SetItem` is reused verbatim, and so is `sanitizeItem`

A week set stores the identical item shape a day set does — which is what makes
the whole feature cheap: the builder, `entrySummary()`, the apply rules and the
capture path all work on `SetItem` and needed no widening.

🟠 That reuse extends to the write guard, and it has to.
`WorkoutSetService.sanitizeItem` is **exported** rather than reimplemented here,
because [the `undefined`-inside-an-array footgun](#items-are-an-array-not-a-sub-collection)
bites a week set at **two** levels (`days[].items[]`), and a second copy of the
rule would drift the moment a field is added to `SetItem`. `sanitizeDays` in
`week-set.service.ts` maps every item of every day through it, drops days whose
`items` are empty, and sorts what's left by `day`.

#### Rest days are absent, not empty

Only days with exercises are stored, so the document says what the plan *is*
rather than padding it with five empty slots — and `days.length` is directly the
"4 days" stat the `/sets` card shows. The consequence for readers: **never index
`days` by weekday**; it is a list to iterate, and `WeekSetDay.day` is where the
weekday lives.

#### Applying a week to a week

`entriesFromWeekSet` (`services/apply-set.ts`) is a loop over the day function,
and the loop is the point: **the collision guard is rebuilt per day**, from that
day's own entries. One `taken` set shared across the week would mean logging
Bench Press on Monday silently swallowed the Thursday copy of it — which is the
shape of an upper/lower split. The
[three rules](#applying-a-set-to-a-day) otherwise apply unchanged, including
body-weight items taking *today's* weigh-in on every day they appear.

Skipped names are qualified with the weekday (`"Bench Press (Mon)"`), since the
same exercise can collide on more than one day.

Loading a week is **purely additive** — it never clears a day. Loading the same
week set twice reports everything as skipped and writes nothing; there is
deliberately no "replace this week" action.

The write is `WeekService.addMany` **unchanged**: it already accepts entries with
varying `day` values and stamps `date` per entry, so a whole week commits in one
batch and can never land half-applied. Its descending
`Timestamp.fromMillis(now - index)` only has to order entries *within* a column,
so one flat index run across the week still orders every column correctly.

`weekSetDaysFromEntries` is the inverse, backing "save this week as a set" — it
buckets with `bucketByDay` and maps each non-empty day through the same
`setItemsFromEntries` the day flow uses.

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
  notes?: string;              // free-text note; always written, '' when none — see below
  noteCreatedAt?: string;      // local YYYY-MM-DD that note was FIRST written; '' when
                               // written on this session — see Note carry-over
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

#### Workout notes

`notes` is a free-text note about how the session went, gated in the logging
modal by a toggle that mirrors "Track time per set" — but with **no global
default setting** behind it (see [Features → Weeks](./features.md#weeks-weekly-workout-logging)).
It applies to cardio sessions as well as strength ones, so `WeeksComponent`
builds it into the shared `base` object rather than the strength-only branch
`trackTime` lives in.

The field is **always written, as `''` when there is none**. That is not
cosmetic: `WeekService.update` uses `updateDoc`, which ignores a key that isn't
in the payload — so omitting `notes` could never *clear* a note the user just
removed, and Firestore rejects `undefined` outright. Readers treat `''` and a
missing field alike, so entries logged before the field existed need no
migration, same as `trackTime`.

#### Note carry-over

A note doesn't stay on the session it was written on. It lives on the
**exercise** ([`Workout.note`](#usersuidworkoutsworkoutid)) and is seeded into
the log modal every time that exercise is picked — so a note written on Tuesday
of one week is already there when the same workout comes round on Thursday of
the next.

Two fields, in two places, doing two different jobs:

| Field | Where | What it is |
|---|---|---|
| `Workout.note` | the exercise | the **live** note — one per exercise, seeded on pick, overwritten on save |
| `Workout.noteCreatedAt` | the exercise | local `YYYY-MM-DD` it was **first** written, held across revisions |
| `WeekEntry.notes` | the session | a **snapshot** — what the note said on that day, never rewritten |
| `WeekEntry.noteCreatedAt` | the session | where that snapshot came from; `''` when written on this session |

The split is the whole feature, and it is what makes deletion safe: **clearing a
note cannot reach backwards**. `Workout.note` is the only thing that changes;
every session that already logged the note keeps its own copy, and re-opening one
shows what it said then, not what the exercise says now.

So there is deliberately **no separate "stop carrying this" control**: turning
the note toggle off in the log modal and saving clears the exercise's note. That
applies when editing an *old* session too — which is the one surprising case, so
the toast says it out loud ("Note cleared from Bench Press.").

`WeeksComponent.syncWorkoutNote` does the write-back, positioned and shaped like
`syncUsualWeight`: after the log is saved, never failing it, and skipped entirely
when the text is unchanged — the common case is a carried note logged again
untouched, which must not cost a write. It calls **`WorkoutService.setNote`**,
not `update`: `syncUsualWeight` may have just written a new `usualWeight`, and a
whole-document write built from the component's stale copy would revert it.

**Dates are the session's, not the clock's.** A new note is stamped with
`entryDate(weekId, day)` — the day it describes — so annotating last Tuesday
dates the note to last Tuesday. Revising a carried note keeps the original date:
"I've been working around this since June" is the fact worth keeping, and a date
that reset on every edit couldn't state it.

Both fields are optional and both are written as `''` rather than omitted, for
exactly the reason `notes` is. Exercises and entries that predate them need no
migration.

Applying a **saved set** carries notes too, but the set's own
[`SetItem.notes`](#usersuidworkoutsetssetid) wins — a note written into a routine
("pause at the bottom") is a deliberate instruction and outranks a standing
observation. A blank item note is filled from the exercise's. See
[Applying a set to a day](#applying-a-set-to-a-day), rule 4.

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

Two pieces of setup beyond the app code:

1. A **collection-group index** on `entries.uid` — the first query run surfaces a
   console link that creates the exact index. This one genuinely is console-only;
   the repo ships no `firestore.indexes.json`.
2. A **security rule** permitting the owner-scoped collection-group read. That one
   *is* in the repo, in [`firestore.rules`](../../firestore.rules):
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
pages run, just against another uid, and [`firestore.rules`](../../firestore.rules)
decides whether it is allowed.

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

Note that a week entry now carries a free-text `notes` field, so **an accepted
friend can read your workout notes**, and `WeekGridComponent` renders them in the
friend panel exactly as it does on your own Weeks page. There is no per-note
privacy control; hiding them in the UI would not change what the rule permits.

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

### Deploying the rules

The ruleset lives at [`firestore.rules`](../../firestore.rules) in the repo root.
Read it *there* rather than duplicating it here, so the two can't disagree.
`firebase.json` points at that file and `.firebaserc` pins the project, so
`firebase deploy --only firestore:rules` is the whole deploy; pasting the file
into Firebase console → Firestore → Rules → Publish works just as well.

🟠 The rules are reviewed, not verified. Exercise the friend-read rules in the
Rules Playground from all three sides — owner, accepted friend, and a stranger —
before trusting a change to them.

**A new cross-user read means editing that file in the same change.** The friend
body-weight panel shipped without its `users/{userId}/weights/{entryId}` rule and
was dead on arrival: friends' weeks loaded, friends' weights were refused. A rule
that exists only in prose is a rule that isn't deployed.

Note what the friendship `update` rule buys beyond "only the recipient accepts":
because a `setDoc` onto an existing document counts as an update, it also refuses
to re-open an already-accepted friendship as pending.

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
