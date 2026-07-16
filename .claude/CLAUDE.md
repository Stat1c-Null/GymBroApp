# GymBroApp — Project Instructions

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
