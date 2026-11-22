# ADR-040 — Chat history sync across phones and reinstalls

**Status:** Accepted (owner approval 2026-11-21). The backend part is not deployed yet.
**Date:** 2026-11-21

## Context

Chat history (D3) lived only in the phone's SQLite (`chat_sessions`, `messages`). It was never part of `/v1/sync/batch`. Chats written offline therefore never "synced when the phone came online": nothing synced chat at all. A second phone or a reinstall started with an empty chat list.

The owner wants chat to match across phones and after a reinstall. They approved four decisions:

1. A **Sync chat history** setting, on by default for signed-in accounts, with a one-time notice.
2. Turning sync off keeps the cloud copy. A separate **Delete chat history from cloud** button deletes it.
3. Attachments sync only their description (file name, format, MIME type, size), never the file.
4. Clearing chat history (and Clear All Data) also deletes the cloud copy, as planner data already does.

## Decision

Chat joins the existing sync protocol as two new entity types, `chat_session` and `chat_message`. It uses the same outbox, change feed, authoritative snapshot and prune rules as planner data. Nothing about planner sync changes.

### Server (LAFINA-backend, `backend_integration/LAFINA-backend-chat-history-sync.patch`)

- Adds tables `chat_sessions_sync` and `chat_messages_sync` with the same shape and owner RLS as the other sync tables. Alembic migration `014_chat_history_sync`.
- Payloads are strict (`extra="forbid"`):
  - Session: `title` ≤ 128, `kind` (`general`/`ustp`), `created_at`.
  - Message: `session_id`, `sender`, `content` ≤ 100,000 chars, `created_at`, `handbook_note`, `local_reply`, `voice_interrupted`, `review_resolution`, `attachment{file_name, format, mime_type, size_bytes}`.
- Both types are listed in `supportedEntityTypes` and are authoritative in snapshots (sessions before messages).
- Delete rules:
  - Deleting a session deletes its messages first, and their delete changes come before the session's.
  - Deleted rows lose their payload, and older change-feed copies of their text are cleared.
  - A stale update or delete to a deleted chat row is accepted as a no-op (`already_deleted`). A `create` restores it.
  - A message written into a missing or deleted session recreates that session untitled.
- `POST /v1/sync/chat/purge` deletes the account's whole chat copy (delete changes are emitted, so other phones remove what they had synced) and returns counts.

### App

- **Declared only when safe.** Chat is declared in `entityTypes` only when the account's chat sync is on **and** the server already lists both chat types (`declaredSyncEntityTypes`). An older server never sees chat; the app keeps chat on the phone automatically until the backend is deployed. When the server first lists chat, a follow-up pass starts right away. A changed type set takes a snapshot first, as before.
- **Same transaction.** Every chat write in `chatStore` queues its mutation in the same SQLite transaction (`chatSyncStore.afterMessageWrite`, `afterSessionWrite`, `beforeSessionDelete`). A chat written offline is in the outbox and goes up on the next pass after reconnecting.
- **Last write wins.** Chat mutations are sent without `baseVersion`, so they never produce conflict prompts.
- **One first chat.** Each phone's first chat id contains its local user id, which differs per phone. It travels as `chat_default` and maps back to each phone's own first chat. Other chats keep their `chat_session:` ids.
- **Not synced (device-only):**
  - the file itself and its path. A synced message whose file is elsewhere has `uri: ''`; the chat shows "On another phone" and explains on tap;
  - the memory notice and its Undo (`memoryChanges`), since the memories stay on the phone;
  - Temporary Chat;
  - guest chats;
  - legacy quarantined chats.
- **Deletes only touch what this phone synced.** A remote delete removes a local row only if this phone has sync metadata for it. A message written here and not yet sent survives a remote chat delete and brings the chat back.
- **Catch-up upload.** History from before sync, from while it was off, or moved from guest mode is queued in batches of 500 per pass (`enqueueUnsynced`), after the snapshot.
- **Long messages.** Text over 100,000 characters is cut for the cloud copy only. This phone keeps its full original when the shortened echo returns.
- **Turning sync off** (Preferences or the notice) keeps the cloud copy. New writes stay on the phone. Deleting a chat still queues its cloud delete, so turning sync back on cannot bring back a deleted chat.
- **Delete chat history from cloud** works in this order:
  1. Turns sync off on this phone.
  2. Waits for any sync pass already running, so no chat is uploaded after the purge.
  3. Calls the purge.
  4. On success, forgets this phone's chat sync records. If that last step fails, it reports a failure and asks to try again. Otherwise turning sync back on would treat this phone's chats as deleted in the cloud.

  Chats stay on the phone; turning sync on later uploads them again.
- **The one-time notice** appears only once the server has listed the chat types. Before the backend is deployed it would be untrue.
- **Live refresh.** Chat changes from the cloud emit `LAFINA_CHAT_REMOTE_CHANGED`. The Chat screen reloads, unless a reply is being sent or a Temporary Chat is open. Files of remotely deleted messages are queued for the existing attachment cleanup.

### 20-chat limit (owner request, 2026-11-21)

An account keeps at most **20 chats**. A chat counts once it holds a message. Empty chats and Temporary Chat do not count, and every chat kind counts (first chat, New chats, USTP chats). The same number is enforced on the phone and on the server.

**On the phone** (`MAX_CHATS_PER_ACCOUNT`):
- At 20, `startNewChat` / `startNewUstpChat` throw `ChatLimitReachedError`.
- A first message into an empty chat is refused, so a chat that arrived from another phone cannot push the count to 21. Nothing is saved.
- Messages and renames in existing chats are never limited.
- What the student sees:
  - The chat list shows "N of 20 chats".
  - New chat, a send into an empty chat, and voice commands answer: "You have 20 chats, the most an account can keep. Delete a chat to start a new one."
  - Flows that must leave a USTP or Temporary Chat (scan, leaving a blocked USTP chat) open the latest general chat instead.
  - Voice-call transcripts are already best-effort: a refused turn is not saved, and the call goes on.
- **Nothing is ever deleted to make room.** Chats from before the limit, or brought together by sync or a guest-to-account move, are kept even above 20. New chats are refused until the student deletes some.

**On the server** (`MAX_CHAT_SESSIONS_PER_ACCOUNT = 20`):
- A write that would add a live chat is rejected with reason `chat_limit_reached`. That covers creating or restoring a session, and a message into a missing or deleted session.
- Batches of one account are serialized by the existing `sync-head` advisory lock, so the count cannot race.

**When the server refuses a chat:**
- The phone keeps it and puts its local id on a held list (`chat.cloudLimitHeld`). Its queued writes are dropped, and new writes to it are not queued.
- It is not recorded as a conflict and does not set "Attention required".
- Held chats are tried again (most recently used first) when room may exist:
  - the student deletes a synced chat here;
  - a chat is deleted on another phone;
  - sync is turned back on;
  - the cloud copy is deleted.
- Preferences says how many chats are held.

## Consequences

- Chats now leave the phone for signed-in accounts by default. The notice says so, but only once the account's server actually stores chat. Preferences says so too, and both offer "this phone only".
- At most 20 chats per account; message size is capped at 100,000 characters, and batch and request sizes are capped as before.
- If the backend patch is not deployed, behaviour is the same as before (chat stays on the phone). The cloud delete button reports "LAFINA's server does not store chat history yet."
- Two phones editing the same message at once: the later write wins. Chat messages are rarely edited (only the review card's Confirm/Cancel state).

## Alternatives rejected

- **A separate chat sync endpoint.** It would duplicate the outbox, cursor, snapshot and prune logic that already has safety tests.
- **Adding chat to `CLIENT_SYNC_ENTITY_TYPES`.** That would declare chat to servers that reject it and break the preserved sync contracts.
- **Uploading attachment files.** The owner chose description only (decision 3).
