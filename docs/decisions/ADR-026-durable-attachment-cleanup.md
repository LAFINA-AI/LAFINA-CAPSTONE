# ADR-026: Durable, owner-bound chat attachment cleanup for Clear All Data

**Status:** accepted, implemented; amended the same day for audit C2 (see [Amendment: fair turn order](#amendment-2026-11-07-fair-turn-order-audit-c2)). Device validation is still pending.
**Date:** 2026-11-07
**Origin:** clear-data audit C1 (`docs/plans/agy-improvements/reports/codex-clear-data-audit-8823b11-20261107.md`); amendment from attachment-cleanup audit C2 (`docs/plans/agy-improvements/reports/codex-attachment-cleanup-audit-69aafcd-20261107.md`)
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

- `finishAttachmentCleanup(authority)` makes **one bounded pass**: at most `MAX_CLEANUP_PER_RUN` (50) of the owner's saved obligations, ~~oldest first~~ *in queue order (amendment C2)*.
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
| More than 50 saved | The rest are kept | ~~The next pass continues~~ *Corrected (C2):* this held only when the first 50 were removed. If they kept failing, every pass repeated them and the rest were never attempted. Since the amendment, the next pass continues behind them |

## Consequences

- Repeated attempts and duplicate references are idempotent, through the primary key and `INSERT OR IGNORE`.
- A saved obligation that the path rules refuse, which only tampering or a future rule change could produce, stays visible. It keeps the result partial and is never acted on.
- **Out of scope:** Chat's own "Clear conversation" (`ChatScreen`) is unchanged. It still deletes messages, then removes files best-effort, without recording obligations, and it does not claim the files were removed. Files it fails to remove are not later retried by Clear All Data. That is a residual outside C1.
- **The `stat` check needed a test-harness change.** The Jest `react-native-fs` mock gained a default `stat` that reports a regular file (`jest.setup.js`), because the mock had none.

## Amendment (2026-11-07): fair turn order (audit C2)

**Problem.** The pass selected the first 50 rows by `recorded_at, path`, which never change. A failed unlink only updated `attempts` and `last_attempt_at`, which did not affect selection. Refused saved rows were skipped without any bookkeeping. So 50 obligations that kept failing (or were refused, or were directories) held the front of the queue on every pass, and a removable 51st file was never attempted. The result stayed truthfully partial, but the retry could not make progress. Ordering by `last_attempt_at` would not fix it: with a frozen or coarse clock, every row attempted in one pass gets the same timestamp, and the tie falls back to the same immutable order.

**Decision.**

1. **A durable per-owner queue.** Schema 24 adds `queue_order INTEGER NOT NULL DEFAULT 0` to `attachment_cleanup` (one `ALTER TABLE … ADD COLUMN` in the existing migration chain; additive). Existing rows take `queue_order = attempts`, so a row the old order never reached (attempts 0) goes first.
2. **Joining and yielding.** A new obligation is recorded at the owner's back: `MAX(queue_order) + 1` for that owner. A pass reads the lowest 50 turns, ordered `queue_order, recorded_at, path`. The path is unique per owner, so the order is total and deterministic.
3. **The attempt is saved before the file is touched.** For each selected row, one `UPDATE` adds 1 to `attempts`, sets `last_attempt_at` and moves the row to the owner's back. Only then are the path rules, the existence check, the regular-file check and the unlink applied. A failed unlink, a directory target and a refused saved path therefore all yield their turn. None is deleted or dropped: each stays saved and visible in the pending count.
4. **Bookkeeping failures are reported.** The result gains `unsaved`, the number of obligations whose progress could not be saved in this pass.
   - If the attempt cannot be saved, the file is **not** touched. The row keeps its place, and the pass moves on to the next row. A transient failure is retried by the next Clear All Data; a failure confined to one row cannot block the others.
   - If the file was removed but its row could not be retired, that also counts. The row has already yielded its turn, and a later pass finds the file absent and retires it.
   - Profile never says "Data Cleared" while `unsaved` is above 0. It says "This phone could not save its cleanup progress for N chat attachment file(s); it stays/they stay listed for the next Clear All Data", followed by "Try Clear All Data again."
5. **No overlapping passes for one owner.** Two Clear All Data presses can overlap, because Profile awaits the pass. A pass requested while another is running for the same owner now starts after it, through an in-process per-owner chain. So the passes never work on the same rows, and neither reports the other's files as pending. This is a mutual-exclusion guard only; fairness lives entirely in the database. Passes for different owners do not wait for each other.
6. **Ownership re-check.** The claim and the retire are keyed by owner. `removed` is counted only when the retire deleted a row. A row that moved to another owner mid-pass (guest linking) is neither attempted nor counted.

**Guarantees.**

- **Bound:** a pass still selects at most 50 rows (`LIMIT`) and attempts each at most once.
- **Fairness:** with `N` saved obligations, any `N` consecutive selections cover every one of them, so each is attempted within ⌈N / 50⌉ passes. A new obligation waits only behind the ones already saved, and later arrivals never push it back.
- **Restarts and crashes:** the turn order is in `lafina.db`, not in module memory.
  - A crash after an attempt is saved leaves that row at the back, still saved.
  - A crash before it is saved leaves the row in its place.
  - Either way the next launch continues from the database.
- **Ties and frozen clocks:** the order does not depend on the clock. Equal `recorded_at` and equal `last_attempt_at` values are broken by the moving `queue_order` and then by the unique path.
- **Unchanged from C1:**
  - recording in the chat-delete transaction;
  - retirement only after confirmed removal or absence;
  - the path rules and the regular-file check;
  - duplicates via `INSERT OR IGNORE`: a re-recorded path keeps its place and attempts;
  - owner keys and the session check before each file;
  - guest linking, which moves rows with their `queue_order`; ties are broken as above;
  - no loop, timer, poller or background work.

**Residual.** If a new file were saved at the same path as an obligation, in the moment between that obligation's unlink and its retirement, the new reference would be merged into the existing row (`INSERT OR IGNORE`) and retired with it. This needs a generated file to reuse an exact name within milliseconds. It is unchanged from C1 and accepted.
