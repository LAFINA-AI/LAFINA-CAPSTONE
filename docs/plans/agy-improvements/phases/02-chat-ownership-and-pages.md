# AGY-PORT 02 — Chat ownership, attachments and pages

Prerequisite: 01. Inventory: 8, 9. Protect PF01–PF07, PF10, PF12.

## Navigate

Target `chatStore.ts`, `chatFiles.ts`, `guestMigration.ts`, ChatScreen/input/message components and orchestrator reply persistence. Donor pinned Chat store/attachment access and chatIsolation/chatStore/draft tests. Preserve AGY document attachments and Handbook source/citation fields.

## Execute

1. Reproduce shared-default-session cross-account access with synthetic users. Add tests for get/add/clear/attachment-share ownership and delayed account changes.
2. Introduce deterministic owner-bound sessions and owner validation at each store/share boundary. Map only historical ownership established by durable evidence. Preserve ambiguous mixed legacy rows in recoverable quarantine; never assign them to the first launcher, silently delete them or make another account's attachments readable.
3. Integrate guest linking with explicit known ownership and destination preservation. Update every relevant account-transfer/cleanup path; old cursors become invalid rather than exposing data.
4. Implement newest-page default (50 as a reasonable bounded default) and stable earlier pages using a deterministic tie-breaker. Bind cursor to owner/session/version; reject malformed or cross-owner cursors. Preserve normal user-before-assistant order when timestamps tie.
5. Adapt UI loading/load-earlier/empty/error states within AGY theme; preserve composer, document attachments, source citations, share controls, online toggles and navigation. Loading an older page cannot overwrite an unsent draft or duplicate the newest reply.
6. Run Chat/attachment/guest/auth/online-doc/RAG tests and full host gates. Record legacy quarantine behavior and safe owner recovery instructions without exposing old content.

## Acceptance

Synthetic owner B cannot read/delete/share owner A content; ambiguous legacy history is retained but not leaked. Guest linking and attachments remain working. Bounded pages are stable and online document/citation replies retain metadata. No cloud feature or subscription control is disabled.

Deliver `reports/phase-02-chat.md`, ownership/page migration notes, preservation updates and manual account/history/share checklist. Live accounts are NOT_RUN unless separately authorized disposable credentials exist.
