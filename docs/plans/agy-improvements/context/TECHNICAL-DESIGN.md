# Adaptation design and non-obvious decisions

These are implementation constraints and preferred approaches. Inspect existing APIs first; keep a simpler correct AGY-native design if donor code is too coupled. Record material deviations in an ADR and phase report.

## Storage and migration protocol

Keep one authoritative `lafina.db` and existing personal records. Add safe wrapper behavior with typed transaction lifetime/ownership and after-commit semantics. A production connection failure must show recoverable unavailable storage, not a no-op database that returns success. Existing test-only adapters remain explicit. Quarantine a connection after failed rollback; don't let an after-commit alarm failure pretend the database rolled back.

Read actual installed version before schema writes; refuse malformed/future versions. Use an additive, transactionally tested sequence from AGY's version 17, preserving every existing auth, sync, meeting, profile, note and preference table/index. Do not transplant donor schema 24 or excluded tables. Test generated legacy fixtures with all protected data, rows under different owners, deleted rows and pending outbox state. Never copy or inspect a real student's SQLite file.

Separate application schema version from a local delivery protocol compatibility revision if native modules require it. JS and native coordinators must agree on database path, journaling, busy/timeout policy, schema range and transaction boundaries. SQLite permits one concurrent writer; compare actual OP-SQLite settings before choosing WAL or DELETE. Never change journal mode inside a transaction. Bounded contention/reconciliation is required; no blocking infinite retry loops.

Every mutating path, including sync pull, guest link, manual UI, assistant and native reminder actions, must maintain applicable revision/delivery/outbox invariants. Define trigger ownership deliberately: avoid duplicate enqueue, echo loops, updates that spuriously invalidate a ringing call, and trigger-generated writes under the wrong user. Derive local metadata from authoritative IDs; never pair reminders by title.

## Delivery and account boundaries

Keep the Android AlarmManager and simulated call experience. Introduce durable jobs/registration receipts/redacted event history and owner/reminder/occurrence/generation/action identities. Full Intent data URI and tagged notifications avoid relying only on request-code hashes. Capture identity before showing a call or starting voice interpretation; check it again before ACK/snooze/cancel/cleanup.

Precisely specify behavior for logout/account switch: retire old UI and active speech, prevent one owner acting on another, cancel or suppress the previous owner's active registrations according to AGY's existing active-account model, and re-register appropriate jobs when returning. Source and guest-rekey operations update related local metadata atomically. Do not invent a new background multi-account delivery policy.

Stage cutover safely: create/backfill metadata and test a single authoritative scheduler path. Retire legacy registrations through a versioned idempotent migration. Never run the old poller and new native dispatcher as independent active alarm sources. Native inability to open a future schema must preserve recoverable work and avoid destructive 'repair'. Force-stop restrictions are documented; do not claim guaranteed post-force-stop delivery.

## Review without losing AGY's intent coverage

AGY's `ValidatedIntent` stays the public parser/native boundary. Build a typed adapter into private proposed operations rather than importing the donor's narrower NluResult schema. Map every current intent: create/update/delete task/time block/Note, reminder, reschedule, ACK, snooze, queries and online/chat/out-of-scope routing. Add exhaustive coverage so an unmapped existing intent is an obvious failure.

An assistant-proposed mutation yields an expiring in-memory review bound to owner, app/session lifetime, exact IDs, revisions, resolved timing and any defaults. Confirm revalidates and commits item + linked reminder + delivery work + outbox + operation receipt atomically. Repeated confirm returns the existing receipt; cancelled/expired/stale reviews do not mutate. No raw model JSON becomes a command. Ambiguous destructive targets request in-product clarification, not a coding-agent approval question.

Do not make users reconfirm normal manual form saves or contextual Answer/Snooze buttons unnecessarily. Existing in-call ACK/snooze remains immediate for the exact ringing identity; ambiguous Chat deletion/rescheduling requires review. Document generation and consented online meeting notes retain their own routes and lifecycle instead of being rejected by a scheduling-only adapter. Never auto-send an editable dictated draft or a guide example.

## Chat and attachments

Use owner-bound sessions and access checks for messages, clear-history and attachments. Stable pages need a deterministic tie-breaker (for example insertion order plus timestamp) and owner/session-bound cursor validation. Preserve attachment JSON and Handbook citation metadata, not just message text.

Historic shared sessions may contain ambiguous mixed ownership. Preserve those rows without assigning them to whichever user launches first. Make ambiguous history inaccessible across owners, retain a recoverable quarantine/legacy mapping and provide clear recovery guidance. Recover only ownership supported by durable evidence. Guest linking migrates known ownership and new cursors/revisions safely. No silent loss or export of ambiguous attachments.

## Planner, Notes and event metadata

Bound read work by visible date range, recurrence relevance and explicit backlog/history pages. Keep explicit exports able to read full owned collections in batches. Factual planner replies use actual SQLite state and bounded text, with unavailable states on failed reads.

Notes revisions protect rich content and soft delete across sync writers. Search is a derived, bounded-normalization cache; do not rewrite bodies. Escape literal search wildcards. A partial/filtered page cannot reorder the global collection. Retain failed/conflicting editor drafts and existing meeting-generated rich Notes.

Timezone/overnight metadata is additive: end date, zone, UTC instants and ambiguity choices as appropriate. Existing floating events retain their meaning. Apply consistently to recurrence, Calendar spans, linked alarms and ICS round-trips. Don't invent replacements for invalid local times.

**Backend compatibility is mandatory.** Do not start sending fields a strict existing server may reject. Preserve the existing seven wire contracts by default. New timing/preferences/revision/delivery metadata may be local-only until server support is verified. Incoming older payloads that omit optional local metadata do not silently clear it; explicit-null handling requires an evidenced contract. If edits invalidate local time metadata, recompute or surface repair rather than retaining false instants. Test old-server round-trips and document which improvements do not yet sync cross-device. Defer only extended cross-device guarantees, not existing sync.

## Meeting-safe voice adaptation

Port OS microphone locking and owned lifetime cleanup across **both** AGY Whisper and existing meeting recording. Add Android-recognizer integration only as an explicit optional engine. A failed acquisition or stale session cannot release the actual owner's lock. Stop/cancel does not release capture ownership until native work actually ends. Process-death recovery must not leave a permanent lock. Preserve foreground-service permission behavior and explicit recording/online-summary consent.

System TTS stays `react-native-tts`; existing online speech entitlement and local/text fallback stay intact. Voice choices must be installed and positively known to be offline-capable for offline playback; missing metadata may need platform validation, not an assumed safe default. Unsupported capability is recoverable text/typing, never an automatic network voice or download.

Do not copy the donor's 0.5–2.0 speed factor directly into the wrapper's normalized rate API. Inspect pinned react-native-tts 4.1.1: public documentation uses normalized rate 0.01–0.99 and optional `skipTransform`. Choose a documented factor-to-wrapper/native mapping, preserve the current neutral experience, clamp through one adapter and test both limits and reset. Keep pitch and cloud speech provider behavior separate. Preview/Stop must cancel only owned playback and not interrupt a reminder/meeting indiscriminately.

## Architecture without deleting online functionality

The existing blanket donor `src/ai` offline rule would flag AGY's valid Chat/document orchestration. Classify actual offline leaf modules and online composition boundaries. Keep offline storage/scheduler/inference/intent/review modules network-independent; let explicitly identified online orchestration call authorized cloud clients behind the current mode/entitlement/consent gates. Preserve public exports with narrow adapters or move composition with compatible wrappers.

Use AST/transitive/dynamic checks and runtime network sentinels. Do not whitelist whole directories, disable the scanner, remove documents/RAG, or hide an import through an unchecked dynamic call. Record the exact small approved composition boundaries and tests proving offline branches never issue network requests. Preserve all other forbidden-import rules, including no Kokoro/business/Gmail/new study tools.

## Tooling and evidence

QA-only SQL checks use uniquely owned temporary databases; no student DB fixtures. Packaging retains target native IDs and existing signing references without reading key material. Audit ZIP alignment and ELF PT_LOAD separately and run actual target model/VAD smokes when available. A host audit is not physical load/audibility proof. Approved source ONNX results are a hypothesis for target testing, not target approval evidence.

Every performance/accuracy result records commit, build/ABI, model hash/version, fixture fingerprint, device/API/page size (non-sensitive), conditions, failures and sample size. Keep p50/p95 and raw redacted evidence where meaningful. Never publish donor measurements as AGY results or invent model/audio fixtures.
