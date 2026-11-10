# AGY-PORT 02 — Chat ownership, attachments and pages

Implementation: CODE_COMPLETE

Automation: PASS. Build: NOT_RUN (no native, Gradle or manifest input changed). Device: NOT_RUN. Live service: NOT_RUN.

Run ID / UTC timestamp: agy-port-20261106 / 2026-11-05T19:00Z (last gate run)
Repository/worktree / branch: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont` / `codex/agy-preservation-improvements`
Phase base / tested HEAD: `8ab83b266f808fb06b0f6220889fd2e08cfe6134` plus this phase's uncommitted working tree
Phase result commit: recorded by the parent in RUN-STATE.json and the log
Owner authorization: [OWNER-AUTHORIZATION.md](../OWNER-AUTHORIZATION.md), current starting prompt.
Inventory areas / prerequisites: 8, 9 / AGY-PORT 01 complete.

## Outcome in plain language

Before this phase, every account on a device wrote to one Chat conversation, `default_chat_session`. Account B could read account A's messages, open or share A's generated files, and wipe A's history with "Clear". That was reproduced against the pre-fix store (3 of 3 checks failed, see evidence).

Each account now has its own conversation. Every read, write, clear, attachment check and share checks the owner.

History saved before this change that cannot be proven to belong to one account is kept on the device, untouched. No account can see it. Nothing is deleted or handed to whoever opens Chat first.

Chat now shows the newest 50 messages, with a "Load earlier messages" button. Loading never clears an unsent draft or duplicates the newest reply. Handbook citations are now saved with the reply, so they survive leaving and reopening Chat. Before, they were lost.

Accounts, entitlements, guest linking, sync, online AI, document generation and attachments, share controls, the online/Handbook toggles and meetings were preserved. All of this is host automation only. Nothing here has run on a phone.

## Checklist and changes

| Requirement | Result | File/module | Reason / intentional behavior change |
|---|---|---|---|
| Reproduce the shared-session leak | implemented | evidence `01-prefix-leak-reproduction.log` | The 8ab83b2 `chatStore` was run in temporary files (since removed) against the owner-isolation scenario. B read A's messages, B's `hasAttachment` returned true for A's PDF, and B's clear deleted A's history. The permanent tests were written after the fix, so they were not themselves observed failing first |
| Deterministic owner-bound sessions | implemented | `src/storage/chatOwnership.ts`, `chatStore.ts` | Session id is `default_chat_session:<encodeURIComponent(userId)>` (donor format). The owner must be a non-blank string of at most 256 characters, otherwise the call throws (read helpers that already swallowed errors return empty or false) |
| Owner checks at get/add/clear/attachment/share | implemented | `chatStore.ts`, `ChatScreen.tsx`, `ProfileScreen.tsx`, `chatOrchestrator.ts` | Every message read joins `chat_sessions` on `user_id`. `insertMessage` refuses a session the caller does not own. A forged session row claiming another owner is refused. Opening or sharing a file still goes through `hasAttachment(userId, uri)`. Profile "Clear All Data" now removes only that account's chat files |
| Delayed account change | implemented | `ChatScreen.handleSend` | A reply that completes after an account switch is saved for the sender and not shown to the new account. A mutation check showed the test fails without the guard |
| Legacy ownership only by durable evidence | implemented | `migrateChatOwnership` (schema 18) | A legacy session is adopted only when its recorded owner is the only row in `users`. Otherwise it is quarantined in place. The recorded owner just means "first to open Chat", so it is not evidence when several accounts exist |
| Recoverable quarantine, no leak | implemented | `chat_legacy_quarantine` table, `getLegacyQuarantineSummary` | Rows stay in `default_chat_session` with their content, attachments and order. Only counts are exposed. Attachments are unreadable by every account. A dismissible notice explains this |
| Guest linking moves history; cursors invalidated | implemented | `transferChatOwnership`, `guestMigration.ts` | Guest messages move into the account's session, keeping existing account history, in timestamp then insertion order, inside the linking transaction. The guest session row is removed. Quarantined history never moves. A guest cursor is rejected afterwards, both for the account (owner mismatch) and for a later guest session (new generation) |
| Newest page 50, load earlier, deterministic tie-break | implemented | `chatStore.getMessagesPage` | Order is `created_at`, then a durable `seq` copied from rowid and assigned on insert. A user message keeps its place before a reply written in the same millisecond, including across a page boundary. Page size must be 1–100 |
| Owner/session/version-bound opaque cursor | implemented | `chatStore.ts` | The cursor is `[1, userId, sessionId, generation, created_at, seq]`, checked strictly. Malformed, tampered, other-owner, other-session, other-generation and wrong-version cursors throw `InvalidChatCursorError`. It is opaque to the UI but not signed, so its binding comes from the check, not secrecy |
| UI load-earlier/empty/error states | implemented | `ChatScreen.tsx`, `src/ui/screens/chat/chatPaging.ts` | A load error shows a retryable card instead of the empty state, saying nothing was deleted. A clear failure shows "Could Not Clear". Prepending keeps the scroll position. A newest page that does not overlap what is shown replaces the list, so it never leaves a silent gap |
| Draft and newest reply preserved | implemented | `ChatScreen.tsx` | Neither loading, retrying nor merging touches the composer. Merging drops ids already shown |
| Preserve citations/attachments/share/toggles | implemented | `messages.metadata_json`, `chatOrchestrator.ts` | The citation (`handbookNote`) is persisted on the online reply. The in-memory map stays as a fallback. Attachment JSON is unchanged. The online, Handbook, meetings and format controls were not modified |
| Schema 18 via `SCHEMA_MIGRATIONS`, fixture tests | implemented | `dbInit.ts`, `schemaMigrations.test.ts`, `chatOwnership.test.ts` | Additive only: `messages.seq`, `messages.metadata_json`, `chat_sessions.generation`, two indexes and `chat_legacy_quarantine`. The upgrade test now checks every schema-17 column of every row is unchanged, that exactly these columns and table were added, and the exact quarantine row. A forced failure inside step 18 leaves schema 17 intact and retries cleanly |

## Legacy quarantine behavior and owner recovery

What happens on upgrade (schema 17 → 18, once, in the atomic migration):

1. Legacy sessions are those whose id lacks the owned prefix. Each one with messages, and the recorded owner as the only local account, is moved into that owner's session (`adopted`).
2. Otherwise a row goes into `chat_legacy_quarantine` (`session_id`, `recorded_owner`, `message_count`, `reason`, `created_at`). The reason is either `multiple_local_accounts` or `recorded_owner_missing`. The messages and the session row are not changed.
3. Empty legacy sessions are left alone.

While quarantined, the history is excluded from all paging, export, attachment, share, clear and guest-link paths. "Clear conversation" and "Clear All Data" cannot delete it. The Chat screen shows a per-account dismissible notice, without any content: "Some chat history saved before accounts were kept separate could not be matched to a single account. It is still stored on this device, hidden from every account, and nothing was deleted."

Safe owner recovery (support/developer procedure; no in-app reassignment exists in this phase):

1. The rows are in `messages WHERE session_id = 'default_chat_session'`, with the first-opener account in `chat_legacy_quarantine.recorded_owner`. That value is not proof of ownership.
2. Assign ownership only after the device owner confirms who wrote the history, from the device itself, never from someone else's account. On a debug build, back up `lafina.db` first (`run-as`), then in one transaction:
   - `INSERT OR IGNORE` the owner's session `default_chat_session:<encodeURIComponent(owner)>`.
   - `UPDATE messages SET session_id = <that id> WHERE session_id = 'default_chat_session'`.
   - `DELETE FROM chat_legacy_quarantine WHERE session_id = 'default_chat_session'`.
3. If no single owner can be confirmed, leave it quarantined. It costs storage but exposes nothing.

A product path for this (for example, a confirmed claim by the only account that can sign in to the recorded owner) is not built. It is a follow-up item.

## Provenance and compatibility

Donor `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480`, read with `git show` only. Concepts were adapted and no source was copied.

| Donor path | Blob | Used for |
|---|---|---|
| `src/storage/chatStore.ts` | `7be5c0c495c1db5391a8c37a95e23025d55ff7ea` | Owned session id format, owner join on reads, newest-page plus `created_at`/insertion-order cursor |

Deliberate differences from the donor:
- Ordering uses a durable `seq` column rather than raw `rowid`, which `VACUUM` may renumber on a table with a TEXT primary key.
- The cursor also binds the session and its generation.
- Legacy history goes to quarantine. The donor moves a legacy session to whichever account is its recorded owner, which keeps the first-opener leak.

Schema version 17 → 18. Native code, wire/sync format (chat is not one of the 7 sync entity types), entitlements and default engines are unchanged.

Store API changes for later phases:
- `chatStore.getMessagesPage(userId, {limit?, before?})` and `getRecentMessages(userId, count)` throw on failure.
- `getMessages(userId)` is the unbounded export read.
- `addMessage(..., attachment?, metadata?)` takes `{handbookNote}`.
- `insertMessage(msg, userId, executor?)` now requires the owner.
- `getLegacyQuarantineSummary()` returns counts only.
- `ownedChatSessionId` and `transferChatOwnership(tx, from, to)` are for any future rekey path.
- `CHAT_PAGE_SIZE` and `InvalidChatCursorError` are exported.

## Preserved AGY features

| PF ID | Baseline result | Current test/command | Actual result | Manual/live limitation |
|---|---|---|---|---|
| PF01 | PASS | `phase01*`, `chatOwnership` (owner validation) | PASS | Device NOT_RUN |
| PF02 | PASS | preservation PF02, `phase09`, `phase10` | PASS (no entitlement code touched) | Device and live NOT_RUN |
| PF03 | PASS | preservation PF03, `phase02`, `chatOwnership` guest-link tests (move, rollback, quarantine untouched) | PASS | Device NOT_RUN |
| PF04 | PASS | preservation PF04 | PASS (Chat is not synced) | Live sync NOT_RUN |
| PF05 | PASS | preservation PF05, `phase07`, `phase08` | PASS | Device and live NOT_RUN |
| PF06 | PASS | `phase10`, `chatHistoryPaging` (citation stored and shown after remount) | PASS, and citations now persist | Live RAG NOT_RUN |
| PF07 | PASS | `phase09`, preservation PF07, `chatOwnership` attachment isolation | PASS | Device share sheet NOT_RUN |
| PF10 | PASS | `phase08` ChatScreen, `chatHistoryPaging`, `App.test` | PASS | Device NOT_RUN |
| PF12 | PASS (after 01) | `schemaMigrations`, `chatOwnership` forced v18 failure | PASS | Device NOT_RUN |

## Commands and evidence

Evidence directory: `evidence/agy-port-20261106/phase-02/`.

| UTC / working directory | Exact command | Tested HEAD | Exit/result | Evidence path |
|---|---|---|---|---|
| ~18:50Z / repo root | `npx jest __tests__/storage/p02PrefixRepro.tmp.test.ts` (pre-fix store from `git show 8ab83b2:src/storage/chatStore.ts`, temporary files since deleted) | `8ab83b2` store + tree | 3 failed of 3, as intended: the leak was reproduced | `01-prefix-leak-reproduction.log` |
| ~18:47Z / repo root | `npx jest __tests__/storage/schemaMigrations` (before updating the upgrade test) | `8ab83b2` + tree | 1 failed: the byte-identical check saw the new columns, as expected. The check was then made column-projected, with explicit v18 assertions | not saved separately (output in session) |
| ~18:54Z / repo root | `npx jest <7 chat/storage/preservation suites>` | `8ab83b2` + tree | exit 0, 7 suites, 115 passed | `02-targeted-tests.log` |
| ~18:55Z / repo root | `npm run preflight` | `8ab83b2` + pre-final tree | exit 0, 21 suites, 276 tests | `03-preflight.log` |
| ~18:57Z / repo root | Mutation: stale-reply guard removed, one test run, file restored | `8ab83b2` + tree | 1 failed, as intended | `04-mutation-stale-reply-guard.log` |
| 18:58Z / repo root | `npx jest __tests__/storage/chatOwnership __tests__/storage/schemaMigrations __tests__/ui/chatHistoryPaging __tests__/ai/phase08ChatAndOrchestrator __tests__/ai/phase09OnlineDocsAndMeetings __tests__/ai/phase10HandbookRAG __tests__/storage/phase02CalendarAndNotes __tests__/preservation --runInBand --json --outputFile=<evidence>` | `8ab83b2` + final tree | exit 0, 125 passed, 0 failed, 8 suites | `05-targeted-jest.json` |
| 18:59–19:00Z / repo root | `npm run preflight` | `8ab83b2` + final tree | exit 0: typecheck, lint, 21 suites, 277 tests, architecture PASS (182 modules, 0 cycles, 0 forbidden dependencies) | `06-preflight-final.log` |

Counts: 248 → 277 tests. 29 new tests: 19 in `chatOwnership.test.ts` and 10 in `chatHistoryPaging.test.tsx`. One existing test, the schema-17 upgrade, was changed. Its row-for-row comparison is now made on the schema-17 columns, plus exact assertions of what v18 adds and the quarantine row. It was not weakened. No other test was changed or removed. Prettier was run only on new files.

## Native, performance and device facts

No artifact was produced, no Gradle task was run (no native input changed) and no device was used. Tests use real SQLite through `node:sqlite`, not op-sqlite. Not measured:
- Migration time for a large legacy chat, which needs a full-table `UPDATE ... seq = rowid` plus two index builds.
- `MAX(seq)+1` insert cost.
- List scroll behavior on device.

## Review findings and decisions

Self-review by the implementer on 2026-11-06. There was no independent reviewer.

Found and fixed during the phase:
- Cursors were first bound only to owner and session id. A guest cursor would have stayed formally valid for a recreated guest session. A per-session `generation` was added.
- The page merge could have left a silent gap if the newest page did not overlap the list. It now restarts from the newest page.

Intentional behavior changes:
- On a device with several accounts, legacy Chat history disappears from every account (quarantined, not deleted), with a notice.
- Profile "Clear All Data" now also removes that account's generated chat files.

Remaining risks:
- **The composer draft is not cleared on account switch.** Unsent text typed by account A stays in the box if the active account changes while Chat stays mounted. It is not persisted or sent for B automatically. Draft scoping is left to Phase 05 and is not fixed here.
- **`localSettingsStore.set` result ignored** for the notice dismissal, as before for other toggles. A failed write means the notice reappears.
- **No in-app recovery** for quarantined history. Only the support procedure above exists.
- **Cursor is not cryptographically signed.** Binding is enforced by validation against the caller's owner/session/generation, and data access is still owner-joined, so a forged cursor can only move within the caller's own history.
- **`seq` is global, not per session.** That is correct for ordering, but the numbers are not contiguous per conversation.
- `getMessages(userId)` remains unbounded and still swallows errors to `[]`. Only tests and export-style callers use it; the screen does not.

## Manual checklist still needed

Current execution status: all NOT_RUN. Use only an authorized test phone with synthetic data and disposable accounts. No live login was performed by the agent.

1. Install: NO ARTIFACT PRODUCED. Build the debug app from this tree.
2. Upgrade with legacy history and two local accounts: install over an AGY debug build where Chat has messages and two accounts exist. Open Chat in each. Expected:
   - Empty history in both.
   - The notice says nothing was deleted; "Got it" hides it for that account only.
   - After force-stop and reopen, it stays hidden for that account.
3. Upgrade with one account: repeat with only one local account that used Chat. Expected: its old messages, citations and PDF are still shown, in order.
4. Isolation: as A, send a message and generate a PDF. Switch to B. Expected:
   - B sees none of A's messages.
   - "Clear conversation" in B leaves A's history intact when you switch back.
5. Share: as A, tap the PDF. Expected: the share sheet opens. As B, nothing of A's is listed, so nothing can be opened.
6. Paging: in one account, create more than 50 messages (for example, 26 prompts). Reopen Chat. Expected:
   - The newest 50 are shown with "Load earlier messages".
   - Tapping it adds the older ones above without jumping or duplicating.
   - A half-typed draft stays in the box.
7. Citations: online with Handbook on, ask a handbook question. Expected: a citation badge. Leave Chat and return. Expected: the badge is still there (live RAG NOT_RUN by the agent).
8. Guest linking: chat as guest, then link a disposable account. Expected: the guest messages appear in the account; the guest no longer has them.
9. Profile → Clear All Data in one account. Expected: that account's chat and files are gone; other accounts' chat and the quarantined history are unaffected.

## Deferrals and continuation

Deferred items:
- Draft scoping on account switch: Phase 05.
- An in-app recovery path for quarantined history: follow-up.
- Device and live checks: the manual gate.

No runtime experiment is left active. The temporary pre-fix reproduction files were deleted.

Next action: NEXT_PHASE, AGY-PORT 03, once the parent commits this phase. No human review pause under this pack's authorization.

## Independent review and parent follow-up

A separate read-only reviewer (forked, same model) checked the stable diff against `8ab83b2` and re-ran seven Chat, migration and preservation suites (116 passed). No high-severity findings.

- **Medium, fixed by the parent:** the original rule adopted legacy history only when the recorded owner was the only row in `users`. A device with a guest row plus one signed-in account would hide all of that person's history. The guest row alone proves nothing, because `userStore` recreates it on demand. The rule is now: an account can only be an author if its local row existed when the newest legacy message was written (`users.created_at <= MAX(messages.created_at)`). Adopt only when the recorded owner is the sole such account. A guest or account created after the history is excluded. Two regression tests were added in `chatOwnership.test.ts`: later accounts are excluded and the owner adopts; an earlier account keeps the history quarantined. Like the original rule, this assumes deleted local user rows did not author messages.
- **Plain statement of the common upgrade case:** if the guest was in use and an account was also used on the device before this update, the shared history stays quarantined and hidden. That is conservative and deliberate, because there is no durable author per message. Recovery is the manual procedure above.
- **Low, accepted:** `setOlderCursor` is called inside the `setMessages` updater in `ChatScreen.loadMessages`. It is idempotent today; kept as is.
- **Low, accepted:** a row with a NULL `seq` (a future direct SQL writer) would make Load earlier fail for that row. No such writer exists; all inserts go through `insertMessage`.
- **Low, deferred to AGY-PORT 05:** the composer draft is not cleared on account switch. It is never sent automatically.

Parent verification: `npm run preflight` exit 0, 21 suites and 277 tests before the follow-up (`parent-preflight.log`). Results after the follow-up are in `parent-preflight-2.log`.
