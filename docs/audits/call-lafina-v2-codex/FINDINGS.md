# Independent findings

All findings apply to fe489a6487884fa6667f1cc6e2e0bddbd24e386d. HIGH findings have code-path evidence; eleven audit probes reproduce ten findings using synthetic host data. A passing defect probe means a bug was reproduced, not that acceptance passed.

## CL2-001 — HIGH — confirm_draft falsely claims a durable save

**Category:** Persistence

**Feature Ids:** F-029 F-030 F-048 F-073 F-077

**Phase Item Ids:** P06-07 P07-06 P10-06 P10-07 P15-06

**Qa Scenario Ids:** T034 T047 T049

**Source:** src/ai/voiceActions/actionService.ts:328 (toolDef.kind === 'draft.confirm')

**Evidence:** executeTool delegates to draftRegistry.confirmDraft, which sets applied and constructs an in-memory receipt without calling SQLite, outbox or scheduler. The returned string says confirmed and saved. Audit probe CL2-001 reproduces unchanged tasks and sync_outbox counts.

**Reproduction:** Register a pending task, call confirm_draft with revision 1, inspect tasks/outbox before and after.

**Impact:** The assistant can say a reminder/task was saved although no durable record exists.

**Root Cause:** Source-supported: executeTool delegates to draftRegistry.confirmDraft, which sets applied and constructs an in-memory receipt without calling SQLite, outbox or scheduler. The returned string says confirmed and saved. Audit probe CL2-001 reproduces unchanged tasks and sync_outbox counts.

**Smallest Safe Fix:** Route confirmations through the authoritative reviewed-command transaction; require on-screen approval and report the actual durable/scheduler result. Remove the free-standing fake receipt.

**Regression Test Needed:** Real host SQLite task/reminder/outbox assertions after first and repeated confirmation; scheduler failure; no write from provider-only confirmation.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-002 — HIGH — Spoken edits and cancellation do not change the review that Confirm saves

**Category:** Draft integrity

**Feature Ids:** F-029 F-031 F-034 F-040 F-041 F-042 F-048

**Phase Item Ids:** P07-05 P08-04 P10-01 P10-02 P10-03 P10-04 P10-05 P10-06 P10-09

**Qa Scenario Ids:** T039 T044 T045 T046 T048

**Source:** src/ai/voiceActions/actionService.ts:311 (const result = draftRegistry.reviseDraft)

**Evidence:** The service edits/cancels a separate TransientDraft. The panel renders review.proposal and calls useCommandReview.confirm, which commits commandReview operationId. No subscription/adaptor copies edits or cancellation back. Registry registration omits structured date/time. Tool reply also omits cardId/revision needed by the next tool. Two audit probes show a 4 PM revision still saves 3 PM and a canceled shadow draft still saves via the original review.

**Reproduction:** Prepare Add task: Physics homework tomorrow at 3pm; revise registry to 4 PM; confirm the original review operation. Repeat with cancel then Confirm.

**Impact:** Students save the wrong time or a supposedly canceled action; stale revision protection is bypassed by the actual UI path.

**Root Cause:** Source-supported: The service edits/cancels a separate TransientDraft. The panel renders review.proposal and calls useCommandReview.confirm, which commits commandReview operationId. No subscription/adaptor copies edits or cancellation back. Registry registration omits structured date/time. Tool reply also omits cardId/revision needed by the next tool. Two audit probes show a 4 PM revision still saves 3 PM and a canceled shadow draft still saves via the original review.

**Smallest Safe Fix:** Keep one authoritative revision-aware draft shared by provider, UI and commandReview. Return stable card ID/revision, update visible fields, and invalidate old confirmation/cancel tokens together.

**Regression Test Needed:** Render actual panel plus real review hook; voice edit -> visible card -> Confirm -> SQL at 16:00; voice cancel -> zero writes; two-card ambiguity and stale confirmation tests.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-003 — HIGH — Memory Save, Undo and Cancel use the wrong identifier

**Category:** Memory integration

**Feature Ids:** F-037 F-039 F-075

**Phase Item Ids:** P09-03 P09-04 P09-06

**Qa Scenario Ids:** T042

**Source:** src/ui/components/voice/VoiceConversationPanel.tsx:244 (confirmMemoryProposal(owner, activeMemoryProposal.id)

**Evidence:** Actions are keyed by act IDs, while the callback exposes only a mem_prop ID. The panel passes mem_prop to confirmMemoryProposal/undoMemoryProposal/cancelMemoryProposal, which look up the actions map. Audit probe CL2-003 gets Action not found; using the real actionId succeeds.

**Reproduction:** Receive prepare_memory, then tap Save Memory. Observe failed status / Action not found and no saved memory.

**Impact:** The new explicit memory card cannot save through its production panel handler.

**Root Cause:** Source-supported: Actions are keyed by act IDs, while the callback exposes only a mem_prop ID. The panel passes mem_prop to confirmMemoryProposal/undoMemoryProposal/cancelMemoryProposal, which look up the actions map. Audit probe CL2-003 gets Action not found; using the real actionId succeeds.

**Smallest Safe Fix:** Carry actionId separately on the proposal/card envelope and use it consistently for Save, Undo, Cancel and revision/expiry checks.

**Regression Test Needed:** Dispatch real tool -> render panel -> Save -> memory row -> Undo -> removed; do not inject a successful fake onSave.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-004 — HIGH — Legacy memory path bypasses the promised review card

**Category:** Consent

**Feature Ids:** F-037 F-075 F-077

**Phase Item Ids:** P06-07 P09-03 P09-07

**Qa Scenario Ids:** T032 T042

**Source:** src/ui/components/voice/VoiceConversationPanel.tsx:173 (.reviewSpokenTurn(owner, text))

**Evidence:** Both final-user processing and legacy.save_memory call chatOrchestrator.reviewSpokenTurn; its explicitMemory branch immediately calls chatMemoryStore.add. This inherited behavior was not adapted to the new review requirement. Audit CL2-004 reproduces a memory row before any card approval.

**Reproduction:** With memory enabled, deliver Remember that I prefer afternoon study time through a final turn or save_lafina_memory; do not press Save.

**Impact:** The advertised confirm-before-write memory policy is false; declining the new card cannot undo an earlier legacy write.

**Root Cause:** Source-supported: Both final-user processing and legacy.save_memory call chatOrchestrator.reviewSpokenTurn; its explicitMemory branch immediately calls chatMemoryStore.add. This inherited behavior was not adapted to the new review requirement. Audit CL2-004 reproduces a memory row before any card approval.

**Smallest Safe Fix:** Use a nonmutating proposal mode for Call Lafina memory, leaving separately authorized ordinary Chat semantics intact. All call memory tools must converge on the same explicit review.

**Regression Test Needed:** Real final transcript and both memory tool names create zero rows before on-screen Save; memory off and cancellation remain zero.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-005 — HIGH — New voice selection is ignored by call session creation

**Category:** Voice settings

**Feature Ids:** F-014 F-050

**Phase Item Ids:** P03-02 P12-01 P12-08

**Qa Scenario Ids:** T012 T058

**Source:** src/cloud/voiceConversation/index.ts:116 (getVoice: () => onlineVoiceSettingsStore.read)

**Evidence:** Settings modal saves callLafina.voiceId/name; default dependencies read speech.onlineVoice.v1. No synchronization connects the stores. Audit CL2-005 saves voice B in the new UI store and dependencies still return voice A.

**Reproduction:** Select A in Profile, select B in Call settings, start a fresh call and inspect createSession voiceId.

**Impact:** The screen offers a chosen ElevenLabs voice that does not drive the actual call.

**Root Cause:** Source-supported: Settings modal saves callLafina.voiceId/name; default dependencies read speech.onlineVoice.v1. No synchronization connects the stores. Audit CL2-005 saves voice B in the new UI store and dependencies still return voice A.

**Smallest Safe Fix:** Reuse the existing authoritative onlineVoiceSettingsStore; explicitly handle a next-session change while live and preserve drafts/history.

**Regression Test Needed:** Settings UI -> dependency -> session request voiceId contract test, followed by authorized real-provider audibility check.

**Owner Backend Phone:** Phone/provider required only to certify audible chosen voice

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-006 — HIGH — Minimizing unmounts the controller on Android

**Category:** Navigation lifecycle

**Feature Ids:** F-026 F-054

**Phase Item Ids:** P05-04 P13-01 P13-02 P13-09

**Qa Scenario Ids:** T060

**Source:** App.tsx:661 (visible={callLafinaVisible})

**Evidence:** Minimize sets callLafinaVisible=false while keeping the outer Modal element. Installed RN Modal.js:278-288 returns null on Android when visible=false, unmounting CallLafinaScreen children. useVoiceConversation effect cleanup disposes the controller. Keeping the Modal wrapper mounted does not retain its child tree.

**Reproduction:** Start call, press Minimize; render Android Modal with visible false. Its child cleanup disposes the active controller; restoring mounts a new idle panel.

**Impact:** The promised uninterrupted Calendar/Notes navigation loses the live session and transient cards.

**Root Cause:** Source-supported: Minimize sets callLafinaVisible=false while keeping the outer Modal element. Installed RN Modal.js:278-288 returns null on Android when visible=false, unmounting CallLafinaScreen children. useVoiceConversation effect cleanup disposes the controller. Keeping the Modal wrapper mounted does not retain its child tree.

**Smallest Safe Fix:** Hoist call controller and review state outside conditional Modal content, or use a persistent in-app overlay route whose children survive minimization.

**Regression Test Needed:** Integration test with real Android Modal visibility semantics and controller lifetime assertions; same session ID, cards and transcripts after minimize/restore.

**Owner Backend Phone:** Physical phone follow-up required; source path is deterministic

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-007 — HIGH — Grouped tool declaration, validator and executor disagree

**Category:** Tool schema

**Feature Ids:** F-043 F-046 F-078

**Phase Item Ids:** P06-01 P06-02 P11-01

**Qa Scenario Ids:** T050 T053

**Source:** src/ai/voiceActions/actionValidator.ts:346 (case 'multi.prepare')

**Evidence:** Registry declares flat items {kind:task,title}; validator expects nested {kind:task.prepare,payload:{title}}. Executor reads flat title/date again and casts nested kind to UI kind. Audit CL2-007 shows declared payload rejected and accepted nested payload becomes kind task.prepare / title Action 1, which persistence does not handle.

**Reproduction:** Validate items:[{kind:task,title:Physics}]; then execute items:[{kind:task.prepare,payload:{title:Physics}}].

**Impact:** Primary structured compound-action calls cannot produce correct savable items.

**Root Cause:** Source-supported: Registry declares flat items {kind:task,title}; validator expects nested {kind:task.prepare,payload:{title}}. Executor reads flat title/date again and casts nested kind to UI kind. Audit CL2-007 shows declared payload rejected and accepted nested payload becomes kind task.prepare / title Action 1, which persistence does not handle.

**Smallest Safe Fix:** Define one shared discriminated payload schema and use it in registry, validator, backend proposal, executor and cards. Reject unsupported kinds rather than casting.

**Regression Test Needed:** Round-trip every registry example through validator, executor, card, SQL/outbox; malformed/unknown kinds fail closed.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-008 — HIGH — Grouped actions invent times and bypass alarm-result verification

**Category:** Scheduling

**Feature Ids:** F-030 F-042 F-044 F-045 F-077

**Phase Item Ids:** P07-06 P11-01 P11-04 P11-06

**Qa Scenario Ids:** T034 T050 T052

**Source:** src/ai/voiceActions/multiActionService.ts:272 (startTime: item.time || '09:00')

**Evidence:** Grouped event/reminder persistence fills missing date from UTC today and missing time with 09:00 (event end 10:00). Audit CL2-008 proves actual SQL rows get invented 09:00. This path only inserts reminder rows/outbox; it neither invokes nor awaits scheduler registration or an alarm receipt. Existing app polling may reconcile later, but that is not verified delivery readiness.

**Reproduction:** Prepare grouped event/reminder with title only, tap Save All; inspect stored time and scheduler/delivery-job evidence.

**Impact:** Wrong-date/time reminders can be committed, and saved summaries overstate alarm readiness.

**Root Cause:** Source-supported: Grouped event/reminder persistence fills missing date from UTC today and missing time with 09:00 (event end 10:00). Audit CL2-008 proves actual SQL rows get invented 09:00. This path only inserts reminder rows/outbox; it neither invokes nor awaits scheduler registration or an alarm receipt. Existing app polling may reconcile later, but that is not verified delivery readiness.

**Smallest Safe Fix:** Require missing-field clarification using local timezone; use the existing reviewed persistence/scheduler workflow and distinguish durable save from alarm registration failure.

**Regression Test Needed:** No guessed date/time, timezone midnight/overnight/recurrence, actual delivery job creation and permission/scheduler failure results.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-009 — HIGH — Targeted retry can duplicate a successful grouped item

**Category:** Idempotency

**Feature Ids:** F-044 F-048

**Phase Item Ids:** P10-06 P11-03 P11-08

**Qa Scenario Ids:** T047 T055

**Source:** src/ai/voiceActions/multiActionService.ts:241 (? batch.items.filter(i => i.id === targetItemId))

**Evidence:** Normal group execution filters saved/cancelled items; targeted retry filters only by ID, resets saving, generates a new entity ID and writes again. Audit CL2-009 produces two real task records and different IDs. Normal UI hides retry for saved rows, but a queued duplicate retry callback reaches this public service path.

**Reproduction:** Execute a task batch; invoke retryMultiActionItem or executeMultiActionBatch with the same saved item ID twice.

**Impact:** Duplicate tasks/reminders/outbox entries under repeated targeted callback; intended service-level replay protection is absent.

**Root Cause:** Source-supported: Normal group execution filters saved/cancelled items; targeted retry filters only by ID, resets saving, generates a new entity ID and writes again. Audit CL2-009 produces two real task records and different IDs. Normal UI hides retry for saved rows, but a queued duplicate retry callback reaches this public service path.

**Smallest Safe Fix:** Reject retries unless the authoritative item is failed; use durable operation receipts and stable entity IDs, with an in-flight guard and revision checks.

**Regression Test Needed:** Repeated targeted retries after success, double queued callbacks, process/restart recovery and outbox/alarm cardinality.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-010 — HIGH — Agenda/note result navigation and draft editing are not wired into the call

**Category:** Reachability

**Feature Ids:** F-029 F-031 F-032 F-034 F-035 F-036 F-043 F-068

**Phase Item Ids:** P06-06 P07-02 P07-03 P08-03 P08-04 P11-02 P11-05 P11-07

**Qa Scenario Ids:** T037 T038 T039 T050

**Source:** src/ui/components/voice/VoiceConversationPanel.tsx:743 (<ActionCardHost)

**Evidence:** Panel passes proposal/memory/batch only, never agendaData, noteResultData, onOpenNote or onEditMultiItemTitle. Read tools return JSON strings only. Single reminder/calendar/note cards contain no TextInput or edit handler. MultiActionCard edits local text but callback is absent, so stored title remains original. Saved item link is a View/Text containing Saved ID, not navigation.

**Reproduction:** Run read_calendar/search_notes during call; inspect missing cards/open actions. Change grouped title then Save All; inspect persisted original title. Inspect saved link pressability.

**Impact:** Visible standalone card tests mask unreachable read cards, inert saved links and editing that is absent or discarded.

**Root Cause:** Source-supported: Panel passes proposal/memory/batch only, never agendaData, noteResultData, onOpenNote or onEditMultiItemTitle. Read tools return JSON strings only. Single reminder/calendar/note cards contain no TextInput or edit handler. MultiActionCard edits local text but callback is absent, so stored title remains original. Saved item link is a View/Text containing Saved ID, not navigation.

**Smallest Safe Fix:** Adapt authoritative read results into typed card data with stable local IDs; supply owner-checked navigation and revision-aware edit callbacks from the panel.

**Regression Test Needed:** Real panel tool dispatch -> card -> edit/open -> persisted item or actual Notes/Calendar screen; do not render card in isolation only.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-011 — MEDIUM — Read errors and overnight overlaps appear conflict-free

**Category:** Conflict checking

**Feature Ids:** F-031 F-033 F-041

**Phase Item Ids:** P07-02 P07-04 P10-04

**Qa Scenario Ids:** T036

**Source:** src/ai/voiceActions/conflictChecker.ts:63 (windowData = plannerQueries.window)

**Evidence:** A thrown read returns hasConflict:false without an unavailable state (audit CL2-011). Same-day minute intervals do not model endDate or previous-day overnight spill; a 23:00-01:00 event has end<start and escapes the overlap test.

**Reproduction:** Throw plannerQueries.window or query an overlap at midnight with a prior-day overnight event.

**Impact:** Students receive ungrounded no-conflict results and may double-book events.

**Root Cause:** Source-supported: A thrown read returns hasConflict:false without an unavailable state (audit CL2-011). Same-day minute intervals do not model endDate or previous-day overnight spill; a 23:00-01:00 event has end<start and escapes the overlap test.

**Smallest Safe Fix:** Expose unavailable/partial state; use existing date-aware event intervals and adjacent-day recurrence expansion.

**Regression Test Needed:** Read failure, prior-day overnight spill, multi-day events, DST and recurrence conflict fixtures.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-012 — HIGH — Style/language/wait preferences do not control provider output

**Category:** Provider integration

**Feature Ids:** F-016 F-017 F-020 F-021 F-051 F-052

**Phase Item Ids:** P04-02 P04-03 P04-06 P04-07 P12-03 P12-04 P12-05

**Qa Scenario Ids:** T023 T025 T026 T027 T057

**Source:** src/cloud/voiceConversation/controller.ts:384 (const initiation = JSON.stringify)

**Evidence:** buildVoicePersonaPrompt/getLanguageInstruction have no production callers. setPreferences stores local values only and the hook does not expose it. Initiation sends voice and grant only. wait sets UI notice but does not stop playback, send wait control or reject later playback. sanitizeSpeechText transforms transcript text after provider PCM already bypasses JS. Native output is not sanitized by that function.

**Reproduction:** Save Cebuano/detailed/slow settings then inspect session payload. Emit wait transcript followed by playback:true; controller accepts speaking again.

**Impact:** Language/style/wait controls are misleading; text sanitizer tests do not prove safe spoken reasoning/markdown output.

**Root Cause:** Source-supported: buildVoicePersonaPrompt/getLanguageInstruction have no production callers. setPreferences stores local values only and the hook does not expose it. Initiation sends voice and grant only. wait sets UI notice but does not stop playback, send wait control or reject later playback. sanitizeSpeechText transforms transcript text after provider PCM already bypasses JS. Native output is not sanitized by that function.

**Smallest Safe Fix:** Use verified backend/ElevenAgents configuration to transmit supported preferences and enforce wait/resume on authoritative output. Keep untested languages explicitly unevaluated.

**Regression Test Needed:** Recorded initiation/context contract tests plus wait -> no audio until resume; authorized native-speaker/provider evaluation.

**Owner Backend Phone:** Backend/agent owner required for approved remote contract change; physical language evaluation pending

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-013 — MEDIUM — Strict schema claims exceed runtime validation

**Category:** Validation

**Feature Ids:** F-046 F-062

**Phase Item Ids:** P06-02 P06-09 P14-04

**Qa Scenario Ids:** T040 T053 T054

**Source:** src/ai/voiceActions/actionValidator.ts:166 (const p = rawPayload as Record<string, unknown>)

**Evidence:** Unknown fields are silently accepted/stripped, not rejected (audit CL2-013). Revision numbers accept NaN/Infinity/fractions in direct calls. Date checks validate shape, not calendar validity. Injection regex helpers are not proof against arbitrary stored instructions; notes are transmitted raw except bounded length and dataIsUntrusted metadata.

**Reproduction:** Pass unexpected:true to memory.prepare, impossible YYYY-MM-DD dates, or non-finite revision to the validator.

**Impact:** Contract is weaker than declared; schema mismatches are concealed. No cross-owner exploit is established solely from stripped extra fields.

**Root Cause:** Source-supported: Unknown fields are silently accepted/stripped, not rejected (audit CL2-013). Revision numbers accept NaN/Infinity/fractions in direct calls. Date checks validate shape, not calendar validity. Injection regex helpers are not proof against arbitrary stored instructions; notes are transmitted raw except bounded length and dataIsUntrusted metadata.

**Smallest Safe Fix:** Reject unknown keys with size/depth bounds and finite integer revisions; validate real dates and return typed failures. Treat retrieved data as untrusted structurally and retain confirmation gates.

**Regression Test Needed:** Unknown keys, array/deep/oversized objects, impossible dates, bad revisions and hostile note-data integration tests.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-014 — HIGH — Action state is not tied to the real call session or cleaned up on End

**Category:** Session lifecycle

**Feature Ids:** F-028 F-040 F-048 F-059 F-073

**Phase Item Ids:** P06-04 P09-05 P10-08 P10-10

**Qa Scenario Ids:** T043 T048 T054 T066

**Source:** src/ui/components/voice/VoiceConversationPanel.tsx:216 ('session-live')

**Evidence:** Panel passes the constant session-live for every action. clearSessionActions/clearSessionDrafts have no production call sites. Tool lookups check owner but not current session; draft.confirm/cancel/multi branches lack consistent isCurrent guards. User-change effect clears text but not activeMemoryProposal/activeMultiBatch/callSettings. This proves isolation/cleanup gaps; an actual cross-account disclosure is not asserted without runtime proof.

**Reproduction:** Create a transient draft in one call, End/restart, inspect action/draft maps; attempt same-owner old-card operation using a new sessionId.

**Impact:** Old same-owner drafts remain operable, action maps grow, and privacy/late-callback guarantees are not substantiated.

**Root Cause:** Source-supported: Panel passes the constant session-live for every action. clearSessionActions/clearSessionDrafts have no production call sites. Tool lookups check owner but not current session; draft.confirm/cancel/multi branches lack consistent isCurrent guards. User-change effect clears text but not activeMemoryProposal/activeMultiBatch/callSettings. This proves isolation/cleanup gaps; an actual cross-account disclosure is not asserted without runtime proof.

**Smallest Safe Fix:** Use real session/generation IDs; invalidate session state on End/system stop/account change; check owner, consent, session and revision at every mutation boundary.

**Regression Test Needed:** Same-owner new-session stale card, account switch while tool delayed, canceled memory save, End during batch callback and repeated-session map bounds.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-015 — HIGH — Backend source does not activate the new structured client tools

**Category:** Backend wiring

**Feature Ids:** F-047 F-078

**Phase Item Ids:** P00-05 P06-01 P06-03 P06-08 P15-07

**Qa Scenario Ids:** T055 T056

**Source:** backend_integration/call_lafina_v2_proposals/agent_tools_contract.md:20 (read_lafina_data)

**Evidence:** Read-only GitHub main is 5866aa241922b710d32d6d56277a8ef24a6aa178. scripts/provision_voice_agent.py declares no client tools or client_tool_call event. app/api/v1/voice.py:559 calls DeepSeek with messages/user/request/max_tokens, no tool schema, and service retains user/assistant text turns. The mobile repository contains only a proposed contract, not a deployed/provisioned result. Live agent might have separate owner config; it was not inspected.

**Reproduction:** Compare captured backend source and proposed tool contract; attempt signed-in tool event only after owner-approved agent setup.

**Impact:** The secure JS callback is reachable in synthetic tests, but a real custom-LLM/client-tool round trip is not delivered by the inspected backend source.

**Root Cause:** Source-supported: Read-only GitHub main is 5866aa241922b710d32d6d56277a8ef24a6aa178. scripts/provision_voice_agent.py declares no client tools or client_tool_call event. app/api/v1/voice.py:559 calls DeepSeek with messages/user/request/max_tokens, no tool schema, and service retains user/assistant text turns. The mobile repository contains only a proposed contract, not a deployed/provisioned result. Live agent might have separate owner config; it was not inspected.

**Smallest Safe Fix:** Prepare a minimal reviewable backend/agent patch and tests with exact tool declarations/results; obtain scoped owner authorization before backend writes/provisioning. Mark F-047/F-078 externally blocked until observed.

**Regression Test Needed:** Backend custom-LLM tool-call/result round trip, authenticated client tool event, no paid calls in ordinary tests.

**Owner Backend Phone:** Backend and agent owner approval/access required; no external edits made by this audit

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-016 — MEDIUM — Completion ledger substitutes mocks and document assertions for acceptance proof

**Category:** Evidence integrity

**Feature Ids:** F-052 F-063 F-064 F-065 F-077 F-078

**Phase Item Ids:** P12-05 P14-01 P14-07 P15-01 P15-02 P15-03 P15-04 P15-06 P15-09

**Qa Scenario Ids:** T057 T067 T069 T070

**Source:** __tests__/ui/callLafinaPhase15.test.tsx:139 (const confirmResult = draftRegistry.confirmDraft)

**Evidence:** Final acceptance test checks an in-memory receipt after confirm, never checks a new SQL row. Phase13 tests button callback/store/ADR strings, not App Modal lifetime. Phase12 checks persistent setting, not session voice. Reports replace language evaluation with prompt text and profiling with amplitude clamp tests. EVIDENCE directory is absent. P12-08/P12-09 have no report checklist entries. Gradle dry-run is not compilation; this audit independently compiled successfully.

**Reproduction:** Read named assertions alongside original exact P requirements; compare FEATURE_LEDGER blanket CODE_COMPLETE/AUTOMATED_PASS with defect probes and missing phone/APK measurements.

**Impact:** Green suite totals materially overstate functional completeness and release readiness.

**Root Cause:** Source-supported: Final acceptance test checks an in-memory receipt after confirm, never checks a new SQL row. Phase13 tests button callback/store/ADR strings, not App Modal lifetime. Phase12 checks persistent setting, not session voice. Reports replace language evaluation with prompt text and profiling with amplitude clamp tests. EVIDENCE directory is absent. P12-08/P12-09 have no report checklist entries. Gradle dry-run is not compilation; this audit independently compiled successfully.

**Smallest Safe Fix:** Correct ledgers/reports with exact code, host test, provider and device layers. Add integration tests at broken boundaries; retain original requirements. Save dated raw logs/APK hashes for future handoff.

**Regression Test Needed:** All original F/P/T IDs covered with meaningful evidence and no false success; raw logs and optional/device statuses separate.

**Owner Backend Phone:** No external access required for code fix

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.

## CL2-017 — MEDIUM — Keyboard, small-screen and exit behavior remain unvalidated or inconsistent

**Category:** Accessibility and navigation

**Feature Ids:** F-002 F-005 F-053 F-056

**Phase Item Ids:** P01-05 P01-06 P01-07 P05-06 P13-03

**Qa Scenario Ids:** T002 T011 T035 T059

**Source:** App.tsx:235 (if (settings.startWithCallLafina && !callLafinaVisible && !callLafinaMinimized))

**Evidence:** With startWithCallLafina enabled on Chat, closing sets visible/minimized false, immediately satisfying the effect and reopening the call surface. New full-screen wrapper has safe insets but no KeyboardAvoidingView. Header fits multiple fixed controls at 320dp only by assumption. Reduce-motion stops thinking pulse but audio-driven bars still change height; tiny transcript toggle lacks minimum height.

**Reproduction:** Enable start-with-call, stay on Chat, close call. For layout, use 320dp, large fonts, keyboard and TalkBack; these device checks were not run.

**Impact:** Call exit can reopen unexpectedly; narrow/large-text controls have no substantiated accessibility acceptance.

**Root Cause:** Source-supported: With startWithCallLafina enabled on Chat, closing sets visible/minimized false, immediately satisfying the effect and reopening the call surface. New full-screen wrapper has safe insets but no KeyboardAvoidingView. Header fits multiple fixed controls at 320dp only by assumption. Reduce-motion stops thinking pulse but audio-driven bars still change height; tiny transcript toggle lacks minimum height.

**Smallest Safe Fix:** Trigger optional opening on deliberate tab-entry transition, not every visibility change; implement measured keyboard/small-screen layout and reduced-motion behavior.

**Regression Test Needed:** Exit does not reopen until a new deliberate Chat entry; short viewport/keyboard/large text snapshots plus device TalkBack.

**Owner Backend Phone:** Phone/emulator visual QA required; reopening path is source-proven

**Verification Command:** See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.