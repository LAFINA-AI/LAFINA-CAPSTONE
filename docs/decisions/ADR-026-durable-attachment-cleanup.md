# ADR-026: Durable, owner-bound chat attachment cleanup for Clear All Data

**Status:** accepted, implemented. Device validation is still pending.
**Date:** 2026-11-07
**Origin:** clear-data audit C1 (`docs/plans/agy-improvements/reports/codex-clear-data-audit-8823b11-20261107.md`)
**Extends:** [ADR-025](ADR-025-account-bound-data-reset.md). Its admission, strict reads and atomic planner step are unchanged.
**Review owner:** human developer

## Problem

Under ADR-025, Clear All Data handled attachment files as follows:

1. It read the owner's chat attachment URIs.
2. It deleted the chat messages.
3. It returned the URIs in memory for an asynchronous unlink.

If an unlink failed, the result was a truthful "Data Partly Cleared … Try Clear All Data again". The retry was not. The deleted messages had been the only reference to the file, so the next Clear All Data found nothing to remove and said "Data Cleared" while the file was still on the phone. A restart lost the URIs in the same way.

## Decision

**1. Durable obligations in the existing database.**

- Schema 23 adds `attachment_cleanup (user_id, path, recorded_at, attempts, last_attempt_at)`, with primary key `(user_id, path)`.
- It is created by `migrateAttachmentCleanup`, through the existing single-transaction migration chain in `dbInit.ts`.
- The table lives in the same `lafina.db`. It is device-local and never synced. There is no new database, file or cloud dependency.

**2. Recorded with the delete.**

- The chat step of `resetPersonalData` is one `transactionSync`. Inside it, the step:
  1. re-admits the authority;
  2. reads the owner's attachment URIs;
  3. records an obligation for each accepted path;
  4. deletes the owner's messages.
- If recording fails, the transaction rolls back: the messages, the only references, stay, and the chat step reports `failed`.
- A committed chat step is reported `cleared` even if a later file removal fails. The file outcome is reported separately, so a committed delete is never presented as rolled back.

**3. Retired only on confirmation.**

- `finishAttachmentCleanup(authority)` makes **one bounded pass**: at most `MAX_CLEANUP_PER_RUN` (50) of the owner's saved obligations, oldest first.
- It covers obligations left by earlier attempts, so a retry works even when the chat history is already empty.
- For each saved path, the pass:
  1. checks the path rules again;
  2. if the file is absent, treats it as done;
  3. otherwise `stat`s it and unlinks it only if it is a regular file;
  4. retires the row only when the file was removed or found absent.
- A failed unlink keeps the row and increments `attempts`.
- A failure to retire keeps the row; the next pass finds the file absent and retires it.
- There is no retry loop, timer, poller or background work. The next retry is the user's next Clear All Data.

**4. Truthful result.**

- Profile says "Data Cleared" only when all of these hold:
  - the planner, chat and defaults steps were confirmed;
  - **no** obligation remains saved for the owner;
  - no attachment reference was refused.
- Otherwise it says "Data Partly Cleared". It gives the number of files still saved, which are distinct paths, so duplicates are not double-counted. It says when that number could not be read or the sign-in changed, and says "Try Clear All Data again" only when a retry can help.
- If the owner has no saved obligations, the pass is skipped synchronously, which keeps the earlier timing.

**5. Ownership and session.**

- Every read and write is keyed by the owner captured in the `DataResetAuthority`.
- Before each file, the pass checks that authority's sign-in, with the same session epoch as ADR-025. If another sign-in has replaced it, the pass stops and the rest stay saved for that owner's next Clear All Data. An old pass never reads, writes or deletes another account's obligations or files.
- Guest linking moves the guest's obligations to the account, in the link transaction, as it does for the conversation that owned the files. An obligation the account already holds is kept once.

**6. Path rules** (`attachmentCleanupTarget`).

- **Accepted:**
  - a `file://` URI or absolute path;
  - that resolves to a plain file name with an extension;
  - either in `chat_files/` (where `saveGeneratedFile` writes generated documents), or directly in the app's private document storage. The reference-based ownership rule (`chatStore.hasAttachment`) has always treated an owned reference there as the owner's attachment, and the independent audit regression uses such a path.
- **Refused:**
  - other schemes, and relative paths;
  - `.`, `..` and empty segments, backslashes and control characters;
  - anything outside app document storage;
  - every other nested directory: offline `models/`, `meetings/` recordings, `avatars/`, nested `chat_files/` directories;
  - the top-level `calendar_visibility.json` and `imported_batches.json`;
  - hidden or extension-less names, and directories.
- A refused reference is never recorded or touched and is reported. Because Android's `RNFS.unlink` deletes directories recursively, every unlink is preceded by its own `stat` regular-file check.
- No directory is ever swept.

## Recovery semantics

| Interruption | What is saved | Next Clear All Data |
|---|---|---|
| Failure recording the obligation | Messages kept (rolled back), no row | Records it and removes the file |
| Crash after the chat commit, before any unlink | Row saved, messages gone | Removes the file, retires the row |
| Unlink fails | Row kept, `attempts` + 1 | Tries again |
| Crash after the unlink, before retiring | Row kept, file gone | Finds it absent and retires it, without an unlink |
| Sign-in changes mid-pass | Remaining rows kept for that owner | That owner's next Clear All Data continues |
| More than 50 saved | The rest are kept | The next pass continues |

## Consequences

- Repeated attempts and duplicate references are idempotent, through the primary key and `INSERT OR IGNORE`.
- A saved obligation that the path rules refuse, which only tampering or a future rule change could produce, stays visible. It keeps the result partial and is never acted on.
- **Out of scope:** Chat's own "Clear conversation" (`ChatScreen`) is unchanged. It still deletes messages, then removes files best-effort, without recording obligations, and it does not claim the files were removed. Files it fails to remove are not later retried by Clear All Data. That is a residual outside C1.
- **The `stat` check needed a test-harness change.** The Jest `react-native-fs` mock gained a default `stat` that reports a regular file (`jest.setup.js`), because the mock had none.
