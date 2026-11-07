# ADR-025: Clear All Data as an account-bound, outcome-reporting operation

**Status:** accepted, implemented. Device validation is still pending.
**Date:** 2026-11-07
**Origin:** remediation audit P1 and P2 (`docs/plans/agy-improvements/reports/codex-remediation-audit-7b3b183-20261106.md`)
**Review owner:** human developer

## Problem

The final-audit F3 fix made Profile "Clear All Data" report a failed event-defaults step truthfully. The remediation audit then found two remaining defects.

**P1: a stale confirmation could delete.**

- The "Delete Everything" button's handler captured the `userId` prop of the screen that rendered it.
- If the account changed, the user signed out, or the same account signed in again while the confirmation was still held, pressing it later deleted the captured owner's planner data, chat and attachment files.
- The same was true after the Profile screen had unmounted.
- Only the event-defaults step, which has its own owner check, refused.

**P2: a failed read looked like success.**

- Each planner step listed records with the display getters (`notesStore.getAll` and the like).
- On a SQL error those getters log the error and return `[]`.
- An empty list deletes nothing and throws nothing, so the step "succeeded", and the screen said "All personal scheduling data … deleted" while the records were still there.
- A write that failed part-way left some tables cleared and others not.

## Decision

**1. Session epoch** (`src/storage/sessionEpoch.ts`).

- `readSessionEpoch()` returns the current owner and an epoch made of:
  - a process-local sign-in generation;
  - the `active_session` user ID;
  - its `created_at`.
- The generation goes up at every session replacement: `userStore.setCurrentUser`, `userStore.logout`, and the session rewrite in `guestMigration.linkGuestToCloudAccount`.
- So signing in again as the same account also gives a new epoch, even within the same millisecond.
- This follows the `user_id|created_at` owner-epoch precedent in `commandReview.readOwnerEpoch`.

**2. Authority captured at confirmation** (`src/storage/accountDataReset.ts`).

- `authorizeDataReset(userId)` runs when the confirmation opens.
- It returns `{ userId, epoch }` only if that user is the signed-in owner.
- It returns null when nobody is signed in, the session cannot be read, or the volatile test-only adapter is active.

**3. Admission in the operation, not only the UI.**

- `resetPersonalData(authority, isCurrent)` checks the authority against the live session, and checks `isCurrent()` (the confirming screen's liveness). It does so:
  - before any write;
  - again inside the planner transaction;
  - again before the chat step;
  - again before the event-defaults step.
- A refusal before or inside the planner transaction returns `{ admitted: false }` and changes nothing.
- The work is synchronous from authorization to the last database write, so no other JavaScript can change the session in between. There is no new async gap.
- The only async work, removing attachment files, comes afterwards. It touches only the files of messages already deleted under that authority.

**4. Strict, owner-bound reads.**

- Each planner store gained an `…OrThrow` getter:
  - `notesStore.getAllOrThrow`;
  - `tasksStore.getAllTasksOrThrow` / `getAllEventsOrThrow`;
  - `timeBlocksStore.getAllOrThrow`;
  - `remindersStore.getAllRemindersOrThrow`.
- Each uses the same SQL as its display getter, but a failure throws.
- The display getters are unchanged.

**5. Store deletes, one transaction, verified.**

- Records are deleted through the existing `delete(id, tx)` functions. Soft-delete tombstones, `sync_outbox` delete mutations, linked-reminder retirement and after-commit alarm cancellation stay exactly as for a single delete. There is no raw blanket SQL.
- Before commit, the step counts the owner's live planner rows. Any row left rolls the whole step back.
- The planner step is therefore all or nothing.

**6. Per-step outcomes.**

- The result reports, step by step:
  - `planner`, `chat` and `defaults`, each `cleared` or `failed`;
  - the attachment URIs.
- `removeAttachmentFilesReportingFailures` counts files it could not remove. A file that is already missing counts as removed.
- The screen says "Data Cleared" only when every step and every file is confirmed.
- Otherwise it says "Data Partly Cleared", names what was cleared and what was not, and says how many attachment files remain.
- The existing event-defaults recovery sentence is kept, and the message ends "Try Clear All Data again" when a retry can help.
- A refused confirmation says "Not Cleared".

## What stays the same

- **Device settings are untouched:** offline voice, theme and time format.
- **Ownership:** other owners' records and attachment files are not affected.
- **Event defaults:** `personalMemoryStore.clearForDataReset` and its truthful failure report (final audit F3) are reused unchanged.
- **Chat:** `chatStore.getAttachmentUris` / `clearHistory` are unchanged.
- **Display getters,** the cloud client, sync protocol, accounts and tier gates are unchanged.

## Consequences

- **A held confirmation dies with its sign-in.** A confirmation opened before any sign-in change, including signing in again as the same account, is refused. The user opens Clear All Data again.
- **A failed planner step changes nothing.** The user can retry without having to work out what is left.
- **Generation and process restart.** The generation is process-local. After a process restart, the persisted `created_at` alone distinguishes sessions. No confirmation survives a restart, because the alert does not.
- **Not covered here.** Native alarm cancellation is still after-commit and best-effort, as for any delete. ADR-023 covers the process-death window.
