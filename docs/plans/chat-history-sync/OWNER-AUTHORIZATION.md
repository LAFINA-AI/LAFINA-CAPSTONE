# Owner authorization — chat history sync (2026-11-21)

This file records the owner's decisions for the chat history sync task (CHAT-SYNC-00 to CHAT-SYNC-05, ADR-040).

## What the owner said

1. "investigate the bidirectional sync on the online offline chat conversation history … do not start coding yet, this is a read only task."
2. "it should match across phones and reinstall so it needs the backend work, plan on how we can implement this."
3. After reviewing the phased plan and its four decisions: "ok i approve all, develop everything without stopping, report back until everything is finished."

## Approved decisions

1. A "Sync chat history" setting, on by default for signed-in accounts, with a one-time notice.
2. Turning sync off keeps the cloud copy. A separate "Delete chat history from cloud" button deletes it.
3. Attachments sync only their description (name, format, MIME type, size), not the file.
4. Clear chat history (and Clear All Data) also deletes the cloud copy.

## Follow-up request (2026-11-21)

"add a 20 chat limits for each accounts in chats, also audit your output to make sure everything works well, check for edge cases as well"

The limit is built non-destructively: new chats are refused at 20, and nothing is deleted to make room. Details are in ADR-040, "20-chat limit". The server enforces the same limit, which is part of the same backend exception.

## Scope of the backend exception

The approval covers a scoped `LAFINA-backend` change for chat history sync only:

- the two chat sync tables;
- migration `014_chat_history_sync`;
- the chat entity types in `/v1/sync/batch`;
- `POST /v1/sync/chat/purge`;
- the 20-chat-per-account limit;
- their tests.

The change was made in a scratch clone and delivered as `backend_integration/LAFINA-backend-chat-history-sync.patch`. Nothing was pushed, merged or deployed, and the owner's `LAFINA-backend` checkout was not modified. Merging, running migration 014 against production, and redeploying are left to the owner (or the Vercel owner).

The approval does not authorize unrelated backend changes, a new hosting project, or any change to the planner sync contract. Everything else in `AGENTS.md` still applies.
