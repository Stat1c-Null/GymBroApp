# GymBroApp — Project Instructions

## Wiki — read this first

Before making non-trivial changes, consult `.claude/wiki/` for how this
codebase is put together: architecture, the Firestore data model, a
feature-by-feature breakdown of how things interact, the component/service
catalog, and the shared CSS design system. Start at `.claude/wiki/README.md`.
When a change alters something the wiki documents (new route/collection/
shared component/data shape), update the relevant wiki page in the same
change so it doesn't drift out of date.

## Changelog workflow

Whenever the user says something like "I am deploying" (or clearly indicates
they're about to deploy/ship the current state of the app), create a new
changelog entry for the changes that haven't been recorded yet:

1. Identify what changed since the last changelog entry — recent commits,
   diffs, and work discussed in the conversation.
2. Open `src/app/pages/changelog/changelog-data.ts`.
3. Add a new object to the **top** of the `CHANGELOG` array (newest first)
   with:
   - `version`: the previous top entry's `version` + 1
   - `date`: today's date, in `YYYY-MM-DD` format
   - `changes`: a bullet list of the undeployed changes, written for end
     users (not raw commit messages)
4. Do not edit or remove existing entries — only prepend.

The array is rendered on the `/changelog` page (`src/app/pages/changelog/`),
one bordered card per entry via the reusable `ChangelogEntryComponent`
(`src/app/components/changelog-entry/changelog-entry.ts`).
