# CHAT-SYNC 00–07 — Chat history sync, 20-chat limit and audit / Completion Report

**Branch / commit SHA:**
- App: `codex/skills-hub` at `f03f128` plus uncommitted working-tree changes. Nothing was committed: the tree also holds other uncommitted work.
- Backend: scratch-clone commits `ce1b4f0` (sync) and `aed5442` (20-chat limit) on base `94f0fa0`, delivered as `backend_integration/LAFINA-backend-chat-history-sync.patch`. Not pushed, merged or deployed.

**Date/time UTC:** 2026-11-21
**Device(s) available:** NONE. No phone or emulator was used.
**Status:** `AWAITING DEVICE VALIDATION`. The backend must also be deployed first; see §8.

**Approval provenance:**
- "ok i approve all, develop everything without stopping, report back until everything is finished."
- Follow-up: "add a 20 chat limits for each accounts in chats, also audit your output to make sure everything works well, check for edge cases as well."

Both are recorded in `docs/plans/chat-history-sync/OWNER-AUTHORIZATION.md`.

## 1. Scope completed

**Root cause.** Chat history was never part of sync. `/v1/sync/batch` carried only the seven planner types, so offline chats had nothing to "catch up" with.

**Newly implemented** (design: ADR-040):

| ID | Behaviour |
|---|---|
| CHAT-SYNC-00 | Backend: chat tables and migration 014. Chat types in `/v1/sync/batch`: strict payloads, snapshot and authoritative lists, session-delete cascade, payload scrub, stale-write no-op, revive on create. Plus `POST /v1/sync/chat/purge`. |
| CHAT-SYNC-01 | App: chat types declared only when sync is on **and** the server lists them. A follow-up pass starts when the server first lists chat. Chat is last-write-wins (no conflict prompts). |
| CHAT-SYNC-02 | App: every chat write queues its mutation in the same SQLite transaction: send, reply, rename, review Confirm/Cancel, delete chat, Clear chat history, Clear All Data. Offline writes go up on reconnect. |
| CHAT-SYNC-03 | App: remote apply. Each phone's first chat maps to `chat_default`. Placeholder chats, owner checks, metadata-gated deletes, catch-up upload of older history (500 per pass), long-message echo protection, attachment cleanup for remote deletes. |
| CHAT-SYNC-04 | UI. Preferences → "Chat history": On/Off switch and "Delete chat history from cloud". Chat: one-time notice, live refresh, "On another phone" files. |
| CHAT-SYNC-05 | Docs and tests. |
| CHAT-SYNC-06 | **20-chat limit** (follow-up), enforced on the phone and the server. Details below. |
| CHAT-SYNC-07 | **Audit** of all of the above; findings and fixes in §1a. |

**Owner decisions as built:**

1. On by default for signed-in accounts, with a one-time notice.
2. Off keeps the cloud copy; a separate delete button removes it.
3. Attachments sync as a description only.
4. Clearing chats deletes the cloud copy.
5. At most 20 chats per account.

**How the 20-chat limit behaves:**
- **What counts:** a chat counts once it has a message. Empty chats and Temporary Chat don't count. All kinds count: first chat, New chats and USTP chats.
- **At 20:**
  - New chat and Ask about USTP answer "You have 20 chats, the most an account can keep. Delete a chat to start a new one."
  - Sending into an empty chat is refused with the same message, and the typed text is kept.
  - Voice commands answer with the message.
  - Voice-call transcripts are not saved; the call continues.
  - Scan and "leave a blocked USTP chat" open the latest general chat instead.
- **The chat list** shows "N of 20 chats".
- **Nothing is ever deleted to make room.** Chats above 20 (from before the limit, from merging two phones, or from guest mode) are kept. New chats are refused until some are deleted.
- **Server:** a write that would add a 21st live chat is rejected with `chat_limit_reached`. The phone keeps that chat ("held") and sync still shows Synced. Held chats are tried again when room may exist:
  - a synced chat is deleted here or on another phone;
  - sync is turned on;
  - the cloud copy is deleted.

  Preferences says how many chats are held.

**Not synced** (device-only): attachment files and paths, the memory notice and its Undo, memories, Temporary Chat (including Quick Chat), guest chats, legacy quarantined chats.

### 1a. Audit findings

**Fixed:**

| # | Edge case found | Effect before | Fix |
|---|---|---|---|
| 1 | "Delete chat history from cloud" while a sync pass is running | That pass could upload chats after the purge, putting them back in the cloud | Turn sync off, **wait for the running pass** (its follow-up no longer sends chat), then purge |
| 2 | Purge succeeds but forgetting this phone's sync records fails | Turning sync on later would treat this phone's chats as deleted and **remove them locally** | Reports a failure and asks to tap Delete again (the purge is safe to repeat) |
| 3 | One-time notice before the backend is deployed | Claimed chats are "now saved to your LAFINA account" when they were not | Notice shows only once the server has listed the chat types. Re-checked on foreground and on synced changes. |
| 4 | Preferences while chat is not syncing yet | Implied chats were syncing | Note: "Chats are not syncing yet…" |
| 5 | Chat list open while synced changes arrive | List stayed stale | Sheet reloads on `LAFINA_CHAT_REMOTE_CHANGED` |
| 6 | A server rejection of any chat write | Recorded as a conflict, row left `failed` forever, status "Attention required" | Limit rejections are held instead (other rejection reasons keep the existing behaviour) |
| 7 | Limit error logged by `insertMessage` | `console.error` (a LogBox warning in debug builds) for an expected answer | Not logged |
| 8 | My earlier report said Quick Chat messages sync before the notice | Wrong: Quick Chat is a Temporary Chat and is never saved | Corrected; voice commands and calls are the paths that save before Chat is opened |

**Checked and found safe:**
- **One cloud account under two local users on one phone** (which would make chat apply throw and stop all sync): prevented. `userStore` refuses a second local user for the same `cloud_account_id`.
- **Message and chat id collisions across phones:** ids are a millisecond timestamp plus about 46 random bits.
- **Guest chats moved into an account:** the guest's first chat merges into the account's first chat, and other chats are relabelled. The catch-up upload sends them.
- **Voice calls, undo, multi-action confirm:** the chat writes are already in try/catch, so a limit refusal cannot break them.
- **Clear All Data:** goes through `chatStore.clearHistory` and does not wipe the outbox, so cloud deletes are queued.

**Known and left as is:**
- A synced message older than the loaded page appears after reopening the chat, not live.
- Two phones editing the same message at once: the later write wins. Only review-card state is ever edited.
- A phone that had sync **off** when another phone deleted the cloud copy removes its previously synced chats once sync is turned on. That matches the delete confirmation, which says other phones remove them.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/storage/chatSyncStore.ts` (new) | Setting and notice (server-gated); payloads; outbox hooks; remote apply and delete; catch-up upload (most recent first); held list for the limit; `forgetCloudState` | Core of chat sync | `__tests__/storage/chatHistorySync.test.ts` |
| `src/storage/chatStore.ts` | Sync hooks; `isRemoteOnlyAttachment`; `ChatLimitReachedError`, limit in `startNewChat` / `insertMessage`, `chatLimit()`, `openLatestGeneralChat()` | Same-transaction outbox; the limit | same + existing chat suites |
| `src/storage/chatOwnership.ts` | Shared chat ids; `MAX_CHATS_PER_ACCOUNT = 20` | Avoid an import cycle; one limit constant | architecture check |
| `src/storage/syncTypes.ts`, `src/sync/syncEntityTypes.ts` | Chat entity types; declared-type gating | Old servers never see chat | negotiation tests |
| `src/sync/syncWorker.ts` | Chat routing, metadata-gated prune, chat event, catch-up queueing, follow-up pass; limit rejections held, not counted | Wire chat into the existing pass | fake-server tests |
| `src/sync/chatHistorySync.ts` (new) | Toggle; purge after the running sync; failure if this phone cannot finish; held count; server support | Preferences actions | purge and audit tests |
| `src/sync/chatSyncEvents.ts` (new) | `LAFINA_CHAT_REMOTE_CHANGED` | Live refresh | remote-arrival test |
| `src/ui/screens/PreferencesSettingsScreen.tsx` | "Chat history" card: limit text, "not syncing yet", held count | Decisions 1, 2, 5 | `__tests__/ui/chatHistorySyncUi.test.tsx` |
| `src/ui/components/chat/ChatHistorySheet.tsx` | "N of 20 chats"; limit alert on New chat and Ask about USTP; live reload | Decision 5; audit #5 | same UI test file |
| `src/ui/screens/ChatScreen.tsx` | Notice (gated), live refresh, remote-only file tap; limit alert on send and USTP; latest-chat fallback for scan and leaving a blocked USTP chat | Decisions 1, 3, 5 | Chat UI suites pass; the limit alerts here have **no dedicated UI test** |
| `src/ui/components/VoiceModal.tsx` | Voice command at the limit answers with the limit message | Decision 5 | NOT covered by a dedicated test |
| `src/ui/components/chat/ChatMessageItem.tsx` | "On another phone" | Decision 3 | NOT covered by a dedicated test |
| `__tests__/ai/agyPort04ReviewedCommands.test.ts` | Footprint counts planner outbox only | A chat turn now queues chat rows | suite passes |
| `backend_integration/LAFINA-backend-chat-history-sync.patch` | 2-commit `git am` series | Repo safety | backend pytest |

## 3. Tests and real outcomes

| Check | Exact command or procedure | Result | Evidence / note |
|---|---|---|---|
| Backend tests | `python -m pytest` in the scratch clone | PASS: 310 passed | 11 new in `tests/test_chat_history_sync.py`, 2 of them for the limit (20 accepted, 21st refused by session or by message, existing chats still writable, delete frees one slot, restore counts, retry gets the same answer, per account, purge frees all) |
| Backend lint | `ruff check` on changed files vs. the same file on main | 2 new findings (B008 `Depends`, UP017) | Same pattern as the file's existing code; the limit code adds none |
| Patch applies | `git am` of the patch on backend main `94f0fa0` in a fresh worktree | PASS | Resulting `sync.py` identical to the branch; 21 sync tests pass there |
| Typecheck | `npx tsc --noEmit` | PASS | |
| Lint | `npx eslint … --max-warnings 0` on every changed and new file | PASS | |
| Architecture | `node scripts/check-architecture.mjs` | PASS: 472 modules, 0 cycles | |
| New Jest: sync | `npx jest __tests__/storage/chatHistorySync.test.ts` | PASS: 24/24 | Fake stateful server with the 20-chat limit; real `runSyncPass` on node:sqlite |
| New Jest: UI | `npx jest __tests__/ui/chatHistorySyncUi.test.tsx` | PASS: 7/7 | Preferences card; chat list counter and limit alert |
| Affected suites | storage, cloud, preservation, all `__tests__/ai`, chat / quick chat / voice / call UI, Preferences | 111/112 suites, 1723 passed, 1 failed | The failure: `phase10HandbookRAG` "separates Ask LAFINA about USTP…", a 1 s `waitFor` under load. Passes alone, 16/16. |
| Full preflight, run 3 | `npm run preflight` | 191/192 suites, 2555 passed, 1 failed | Same `phase10HandbookRAG` 1 s timeout; measured against HEAD in §3a |
| Android build | `gradlew assembleDebug` | NOT RUN | No native, Gradle or manifest change; the tree holds other uncommitted native work |
| Device: two phones / reinstall / limit | §6 | NOT RUN, HUMAN REQUIRED | Needs the backend deployed |

### 3a. Full preflight

- **Run 1** (before the limit): 182/184 suites. 6 failures were the agyPort04 footprint (fixed). 1 was the `callLafinaRemediation` 15 s timeout.
- **Run 2:** stopped at lint on `IncomingCallScreen.tsx`, which another process was editing at the time. Not part of this change.
- **Run 3** (after the limit and audit fixes): typecheck PASS, lint PASS. Jest: 191/192 suites, 2555 passed, 1 skipped, **1 failed**. The preflight chain stops at the first failure, so the architecture step did not run inside it; it passed when run on its own.

**The failing test:** `phase10HandbookRAG` "separates Ask LAFINA about USTP into its own RAG chat…". It waits with the default 1 s `waitFor` for the "enable Online Mode" banner to go away after a tap. It also failed 1 of 3 times when the file ran alone, and failed under parallel load.

Measured per step (3 runs each), on committed HEAD `f03f128` in a temporary worktree versus this working tree:

| Step | HEAD `f03f128` | Working tree |
|---|---|---|
| Banner gone after tap (the timed step) | 1204 / 1482 / 1420 ms | 1412 / 1315 / 1529 ms |
| First render (not timed by the test) | 1653 / 1998 / 2150 ms | 2036 / 2617 / 2646 ms |
| Open chat list + new USTP chat | 159 / 176 / 182 ms | 182 / 233 / 243 ms |

The timed step was already above 1 s at HEAD, and its range is about the same on both trees. The tap only awaits `NetInfo` and the mocked `authorizeOnlineMode`; no chat-sync or limit code runs in it. So this is an existing tight timeout, not a behaviour change. The working tree is slower to render the first screen, but this measurement cannot separate this change from the other uncommitted work in the tree.

I did **not** change the test. A `{timeout: 5000}` on that one `waitFor` would make it stable, but it is not part of this task. That's the owner's call.

So the full-suite gate is **not met as one clean run**.

**Fake-server tests cover:**
- id mapping and type negotiation;
- payloads without the file path or memory notice;
- guest and sync-off writes stay local;
- never-sent deletes and empty-chat renames are not sent;
- offline-then-reconnect upload;
- an old server never sees chat;
- another phone's chats arrive (first chats merge, files marked remote, screen notified, nothing echoed back);
- reinstall restore;
- upload of older history;
- delete cascade, and a remote delete that keeps an unsent message;
- Clear chat history;
- long-message echo;
- Delete from cloud, its error cases and its ordering;
- a chat deleted while sync was off is deleted in the cloud once sync is back on;
- the notice waits for server support;
- **limit:** 20 allowed and the 21st refused; existing chats keep working; delete frees one slot; a first message into an empty chat is refused when a synced chat filled the account, and nothing is saved;
- **held chats:** kept locally, status Synced, no conflicts, not resent, the newest uploads when another phone frees a slot, deleting one takes it off the list.

## 4. Performance and device matrix

N/A for latency. Each pass queues at most 500 older messages; batches keep the 100-mutation and 768 KB limits. Counting chats is one indexed `COUNT` on New chat and on a chat's first message. Not measured on a device.

## 5. Reliability, privacy, permissions, licenses

**Privacy:**
- Signed-in chats leave the phone by default (decision 1).
- The notice appears the first time Chat is opened **after the server stores chat**, and offers "Keep on this phone only". Preferences repeats it.
- Voice commands or calls made before Chat is ever opened can sync before the notice is shown.
- File contents, memories and the memory notice never leave the phone. Deleted text is cleared on the server.

**Permissions:** none added.

**Open risks:**
- Two phones editing one message at once: the later write wins.
- If migration 014 is skipped, startup `create_all` creates the tables without RLS. The step is in the handoff.
- Held chats are retried once per room-freeing event, so in the worst case that is one rejected request each time.
- Timing-sensitive tests:
  - `callLafinaRemediation` "confirm_draft…" (15 s): failed only in long multi-suite runs, and passed in run 3.
  - `phase10HandbookRAG` "separates Ask LAFINA about USTP…" (1 s `waitFor`): the timed step already takes over 1 s at HEAD (§3a).

## 6. Human phone verification

**Preconditions:**
- The backend patch is merged and deployed, and migration 014 is applied (§8).
- This working tree is installed on **two** Android phones (A and B), signed in to the **same** account.

**Steps:**

1. **Notice.** On A, open Chat after the app has synced once. Expect "Your chats are now saved to your LAFINA account…". Tap **Got it**; it does not return.
2. **Online sync.** On A, send "sync test 1". On B, open Chat (or bring the app to the foreground). The message and reply appear.
3. **Offline then reconnect.** In airplane mode on A, send "offline test" in a **new chat**. Turn airplane mode off. The chat appears on B.
4. **Rename and delete.** On B, rename that chat, then delete it. A shows the rename, then the chat disappears. If A's chat list is open, it updates by itself.
5. **Attachment.** On A, attach a PDF. B shows "On another phone" and explains on tap. On A the file still opens.
6. **Reinstall.** Reinstall on B and sign in. The chats come back.
7. **Sync off.** On A, set Preferences → Chat history → **Off (this phone only)** and send "local only". It does not reach B. Turn it **On**, and it does.
8. **Limit.**
   1. On A, create chats until the chat list says "20 of 20 chats".
   2. Tap **New chat**. Expect "Chat Limit Reached … Delete a chat to start a new one." Sending in existing chats still works.
   3. Delete one chat. The list says "19 of 20" and New chat works.
9. **Limit across phones.**
   1. With A at 20 synced chats, turn B's sync **Off**. Make 2 new chats on B, then turn sync **On**.
   2. Expect B's Preferences to say "2 chats are saved on this phone only…". Sync shows no error, and A does not get them.
   3. Delete one chat on A. After B syncs, one of B's two chats reaches A.
10. **Delete from cloud.** On A: **Delete chat history from cloud** → Delete. Expect "Deleted from Cloud" and Off. A keeps its chats. B removes the chats it had synced.
11. **Guest.** In guest mode, Preferences shows "saved on this phone only", with no switch. The chat list still shows "N of 20 chats".

**Privacy-safe log:** `adb logcat | grep -i "SyncWorker\|ChatScreen"`. Do not share message text.

**The agent cannot certify:** any of the above on a real phone, or the deployed backend.

## 7. Docs/ADRs changed

- `docs/decisions/ADR-040-chat-history-sync.md`, including the "20-chat limit" section
- `docs/plans/chat-history-sync/OWNER-AUTHORIZATION.md`, including the follow-up request
- `backend_integration/README.md` (activation steps, 2-commit patch)
- `docs/architecture/lafina-data-flow.md` (D3)
- `AGENTS.md` (task-scoped notice)

## 8. Open blockers and recommended next steps

1. **Owner: deploy the backend** per `backend_integration/README.md`: `git am` the patch, run pytest, merge, redeploy, run migration 014, verify. Until then the app keeps chat on the phone. The local 20-chat limit already applies.
2. Run the §6 checklist on two phones.
3. Owner decision: give the `phase10HandbookRAG` banner `waitFor` a longer timeout (§3a), then rerun `npm run preflight` for one clean run.
4. Optional, not started: UI tests for the Chat-screen limit alert, the VoiceModal limit reply and the "On another phone" subtitle.

## 9. Review decision

- [ ] All automated required checks passing (see §3a)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated

`STATUS: AWAITING DEVICE VALIDATION`
`STOPPED — awaiting explicit human approval`
