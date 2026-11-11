"""Rebuild audit artifacts from the original inventory and captured evidence; no product writes."""
import csv
import hashlib
import json
import re
import subprocess
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
PACK = ROOT / 'CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1'
EV = OUT / 'evidence'
SHA = 'fe489a6487884fa6667f1cc6e2e0bddbd24e386d'
BASE = 'cae65fec4b0efc25dc343e3f30a4d216defa19aa'
NOW = datetime.now(ZoneInfo('Asia/Manila')).isoformat()

def read(p):
    return (ROOT / p).read_text(encoding='utf-8-sig')

def write(name, text):
    (OUT / name).write_text(text, encoding='utf-8')

def rows(p):
    with (ROOT / p).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def csvout(name, data):
    with (OUT / name).open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(data[0]))
        w.writeheader()
        w.writerows(data)

def loc(path, needle):
    lines = read(path).splitlines()
    return f'{path}:{next((i+1 for i,l in enumerate(lines) if needle in l),1)} ({needle})'

findings = []
def finding(n, severity, category, title, features, items, scenarios, path, symbol, evidence, reproduction, impact, fix, test, external='No external access required for code fix'):
    findings.append(dict(finding_id=f'CL2-{n:03}', severity=severity, category=category, title=title,
        feature_ids=features, phase_item_ids=items, qa_scenario_ids=scenarios,
        source=loc(path, symbol), evidence=evidence, reproduction=reproduction,
        impact=impact, root_cause='Source-supported: '+evidence,
        smallest_safe_fix=fix, regression_test_needed=test, owner_backend_phone=external,
        verification_command='See VALIDATION_LOG.md; rerun defect probes after converting observations to corrected acceptance assertions.'))

finding(1,'HIGH','Persistence','confirm_draft falsely claims a durable save',
 'F-029 F-030 F-048 F-073 F-077','P06-07 P07-06 P10-06 P10-07 P15-06','T034 T047 T049',
 'src/ai/voiceActions/actionService.ts',"toolDef.kind === 'draft.confirm'",
 'executeTool delegates to draftRegistry.confirmDraft, which sets applied and constructs an in-memory receipt without calling SQLite, outbox or scheduler. The returned string says confirmed and saved. Audit probe CL2-001 reproduces unchanged tasks and sync_outbox counts.',
 'Register a pending task, call confirm_draft with revision 1, inspect tasks/outbox before and after.',
 'The assistant can say a reminder/task was saved although no durable record exists.',
 'Route confirmations through the authoritative reviewed-command transaction; require on-screen approval and report the actual durable/scheduler result. Remove the free-standing fake receipt.',
 'Real host SQLite task/reminder/outbox assertions after first and repeated confirmation; scheduler failure; no write from provider-only confirmation.')
finding(2,'HIGH','Draft integrity','Spoken edits and cancellation do not change the review that Confirm saves',
 'F-029 F-031 F-034 F-040 F-041 F-042 F-048','P07-05 P08-04 P10-01 P10-02 P10-03 P10-04 P10-05 P10-06 P10-09','T039 T044 T045 T046 T048',
 'src/ai/voiceActions/actionService.ts','const result = draftRegistry.reviseDraft',
 'The service edits/cancels a separate TransientDraft. The panel renders review.proposal and calls useCommandReview.confirm, which commits commandReview operationId. No subscription/adaptor copies edits or cancellation back. Registry registration omits structured date/time. Tool reply also omits cardId/revision needed by the next tool. Two audit probes show a 4 PM revision still saves 3 PM and a canceled shadow draft still saves via the original review.',
 'Prepare Add task: Physics homework tomorrow at 3pm; revise registry to 4 PM; confirm the original review operation. Repeat with cancel then Confirm.',
 'Students save the wrong time or a supposedly canceled action; stale revision protection is bypassed by the actual UI path.',
 'Keep one authoritative revision-aware draft shared by provider, UI and commandReview. Return stable card ID/revision, update visible fields, and invalidate old confirmation/cancel tokens together.',
 'Render actual panel plus real review hook; voice edit -> visible card -> Confirm -> SQL at 16:00; voice cancel -> zero writes; two-card ambiguity and stale confirmation tests.')
finding(3,'HIGH','Memory integration','Memory Save, Undo and Cancel use the wrong identifier',
 'F-037 F-039 F-075','P09-03 P09-04 P09-06','T042',
 'src/ui/components/voice/VoiceConversationPanel.tsx','confirmMemoryProposal(owner, activeMemoryProposal.id',
 'Actions are keyed by act IDs, while the callback exposes only a mem_prop ID. The panel passes mem_prop to confirmMemoryProposal/undoMemoryProposal/cancelMemoryProposal, which look up the actions map. Audit probe CL2-003 gets Action not found; using the real actionId succeeds.',
 'Receive prepare_memory, then tap Save Memory. Observe failed status / Action not found and no saved memory.',
 'The new explicit memory card cannot save through its production panel handler.',
 'Carry actionId separately on the proposal/card envelope and use it consistently for Save, Undo, Cancel and revision/expiry checks.',
 'Dispatch real tool -> render panel -> Save -> memory row -> Undo -> removed; do not inject a successful fake onSave.')
finding(4,'HIGH','Consent','Legacy memory path bypasses the promised review card',
 'F-037 F-075 F-077','P06-07 P09-03 P09-07','T032 T042',
 'src/ui/components/voice/VoiceConversationPanel.tsx','.reviewSpokenTurn(owner, text)',
 'Both final-user processing and legacy.save_memory call chatOrchestrator.reviewSpokenTurn; its explicitMemory branch immediately calls chatMemoryStore.add. This inherited behavior was not adapted to the new review requirement. Audit CL2-004 reproduces a memory row before any card approval.',
 'With memory enabled, deliver Remember that I prefer afternoon study time through a final turn or save_lafina_memory; do not press Save.',
 'The advertised confirm-before-write memory policy is false; declining the new card cannot undo an earlier legacy write.',
 'Use a nonmutating proposal mode for Call Lafina memory, leaving separately authorized ordinary Chat semantics intact. All call memory tools must converge on the same explicit review.',
 'Real final transcript and both memory tool names create zero rows before on-screen Save; memory off and cancellation remain zero.')
finding(5,'HIGH','Voice settings','New voice selection is ignored by call session creation',
 'F-014 F-050','P03-02 P12-01 P12-08','T012 T058',
 'src/cloud/voiceConversation/index.ts','getVoice: () => onlineVoiceSettingsStore.read',
 'Settings modal saves callLafina.voiceId/name; default dependencies read speech.onlineVoice.v1. No synchronization connects the stores. Audit CL2-005 saves voice B in the new UI store and dependencies still return voice A.',
 'Select A in Profile, select B in Call settings, start a fresh call and inspect createSession voiceId.',
 'The screen offers a chosen ElevenLabs voice that does not drive the actual call.',
 'Reuse the existing authoritative onlineVoiceSettingsStore; explicitly handle a next-session change while live and preserve drafts/history.',
 'Settings UI -> dependency -> session request voiceId contract test, followed by authorized real-provider audibility check.',
 'Phone/provider required only to certify audible chosen voice')
finding(6,'HIGH','Navigation lifecycle','Minimizing unmounts the controller on Android',
 'F-026 F-054','P05-04 P13-01 P13-02 P13-09','T060',
 'App.tsx','visible={callLafinaVisible}',
 'Minimize sets callLafinaVisible=false while keeping the outer Modal element. Installed RN Modal.js:278-288 returns null on Android when visible=false, unmounting CallLafinaScreen children. useVoiceConversation effect cleanup disposes the controller. Keeping the Modal wrapper mounted does not retain its child tree.',
 'Start call, press Minimize; render Android Modal with visible false. Its child cleanup disposes the active controller; restoring mounts a new idle panel.',
 'The promised uninterrupted Calendar/Notes navigation loses the live session and transient cards.',
 'Hoist call controller and review state outside conditional Modal content, or use a persistent in-app overlay route whose children survive minimization.',
 'Integration test with real Android Modal visibility semantics and controller lifetime assertions; same session ID, cards and transcripts after minimize/restore.',
 'Physical phone follow-up required; source path is deterministic')
finding(7,'HIGH','Tool schema','Grouped tool declaration, validator and executor disagree',
 'F-043 F-046 F-078','P06-01 P06-02 P11-01','T050 T053',
 'src/ai/voiceActions/actionValidator.ts',"case 'multi.prepare'",
 'Registry declares flat items {kind:task,title}; validator expects nested {kind:task.prepare,payload:{title}}. Executor reads flat title/date again and casts nested kind to UI kind. Audit CL2-007 shows declared payload rejected and accepted nested payload becomes kind task.prepare / title Action 1, which persistence does not handle.',
 'Validate items:[{kind:task,title:Physics}]; then execute items:[{kind:task.prepare,payload:{title:Physics}}].',
 'Primary structured compound-action calls cannot produce correct savable items.',
 'Define one shared discriminated payload schema and use it in registry, validator, backend proposal, executor and cards. Reject unsupported kinds rather than casting.',
 'Round-trip every registry example through validator, executor, card, SQL/outbox; malformed/unknown kinds fail closed.')
finding(8,'HIGH','Scheduling','Grouped actions invent times and bypass alarm-result verification',
 'F-030 F-042 F-044 F-045 F-077','P07-06 P11-01 P11-04 P11-06','T034 T050 T052',
 'src/ai/voiceActions/multiActionService.ts',"startTime: item.time || '09:00'",
 'Grouped event/reminder persistence fills missing date from UTC today and missing time with 09:00 (event end 10:00). Audit CL2-008 proves actual SQL rows get invented 09:00. This path only inserts reminder rows/outbox; it neither invokes nor awaits scheduler registration or an alarm receipt. Existing app polling may reconcile later, but that is not verified delivery readiness.',
 'Prepare grouped event/reminder with title only, tap Save All; inspect stored time and scheduler/delivery-job evidence.',
 'Wrong-date/time reminders can be committed, and saved summaries overstate alarm readiness.',
 'Require missing-field clarification using local timezone; use the existing reviewed persistence/scheduler workflow and distinguish durable save from alarm registration failure.',
 'No guessed date/time, timezone midnight/overnight/recurrence, actual delivery job creation and permission/scheduler failure results.')
finding(9,'HIGH','Idempotency','Targeted retry can duplicate a successful grouped item',
 'F-044 F-048','P10-06 P11-03 P11-08','T047 T055',
 'src/ai/voiceActions/multiActionService.ts','? batch.items.filter(i => i.id === targetItemId)',
 'Normal group execution filters saved/cancelled items; targeted retry filters only by ID, resets saving, generates a new entity ID and writes again. Audit CL2-009 produces two real task records and different IDs. Normal UI hides retry for saved rows, but a queued duplicate retry callback reaches this public service path.',
 'Execute a task batch; invoke retryMultiActionItem or executeMultiActionBatch with the same saved item ID twice.',
 'Duplicate tasks/reminders/outbox entries under repeated targeted callback; intended service-level replay protection is absent.',
 'Reject retries unless the authoritative item is failed; use durable operation receipts and stable entity IDs, with an in-flight guard and revision checks.',
 'Repeated targeted retries after success, double queued callbacks, process/restart recovery and outbox/alarm cardinality.')
finding(10,'HIGH','Reachability','Agenda/note result navigation and draft editing are not wired into the call',
 'F-029 F-031 F-032 F-034 F-035 F-036 F-043 F-068','P06-06 P07-02 P07-03 P08-03 P08-04 P11-02 P11-05 P11-07','T037 T038 T039 T050',
 'src/ui/components/voice/VoiceConversationPanel.tsx','<ActionCardHost',
 'Panel passes proposal/memory/batch only, never agendaData, noteResultData, onOpenNote or onEditMultiItemTitle. Read tools return JSON strings only. Single reminder/calendar/note cards contain no TextInput or edit handler. MultiActionCard edits local text but callback is absent, so stored title remains original. Saved item link is a View/Text containing Saved ID, not navigation.',
 'Run read_calendar/search_notes during call; inspect missing cards/open actions. Change grouped title then Save All; inspect persisted original title. Inspect saved link pressability.',
 'Visible standalone card tests mask unreachable read cards, inert saved links and editing that is absent or discarded.',
 'Adapt authoritative read results into typed card data with stable local IDs; supply owner-checked navigation and revision-aware edit callbacks from the panel.',
 'Real panel tool dispatch -> card -> edit/open -> persisted item or actual Notes/Calendar screen; do not render card in isolation only.')
finding(11,'MEDIUM','Conflict checking','Read errors and overnight overlaps appear conflict-free',
 'F-031 F-033 F-041','P07-02 P07-04 P10-04','T036',
 'src/ai/voiceActions/conflictChecker.ts','windowData = plannerQueries.window',
 'A thrown read returns hasConflict:false without an unavailable state (audit CL2-011). Same-day minute intervals do not model endDate or previous-day overnight spill; a 23:00-01:00 event has end<start and escapes the overlap test.',
 'Throw plannerQueries.window or query an overlap at midnight with a prior-day overnight event.',
 'Students receive ungrounded no-conflict results and may double-book events.',
 'Expose unavailable/partial state; use existing date-aware event intervals and adjacent-day recurrence expansion.',
 'Read failure, prior-day overnight spill, multi-day events, DST and recurrence conflict fixtures.')
finding(12,'HIGH','Provider integration','Style/language/wait preferences do not control provider output',
 'F-016 F-017 F-020 F-021 F-051 F-052','P04-02 P04-03 P04-06 P04-07 P12-03 P12-04 P12-05','T023 T025 T026 T027 T057',
 'src/cloud/voiceConversation/controller.ts','const initiation = JSON.stringify',
 'buildVoicePersonaPrompt/getLanguageInstruction have no production callers. setPreferences stores local values only and the hook does not expose it. Initiation sends voice and grant only. wait sets UI notice but does not stop playback, send wait control or reject later playback. sanitizeSpeechText transforms transcript text after provider PCM already bypasses JS. Native output is not sanitized by that function.',
 'Save Cebuano/detailed/slow settings then inspect session payload. Emit wait transcript followed by playback:true; controller accepts speaking again.',
 'Language/style/wait controls are misleading; text sanitizer tests do not prove safe spoken reasoning/markdown output.',
 'Use verified backend/ElevenAgents configuration to transmit supported preferences and enforce wait/resume on authoritative output. Keep untested languages explicitly unevaluated.',
 'Recorded initiation/context contract tests plus wait -> no audio until resume; authorized native-speaker/provider evaluation.',
 'Backend/agent owner required for approved remote contract change; physical language evaluation pending')
finding(13,'MEDIUM','Validation','Strict schema claims exceed runtime validation',
 'F-046 F-062','P06-02 P06-09 P14-04','T040 T053 T054',
 'src/ai/voiceActions/actionValidator.ts','const p = rawPayload as Record<string, unknown>',
 'Unknown fields are silently accepted/stripped, not rejected (audit CL2-013). Revision numbers accept NaN/Infinity/fractions in direct calls. Date checks validate shape, not calendar validity. Injection regex helpers are not proof against arbitrary stored instructions; notes are transmitted raw except bounded length and dataIsUntrusted metadata.',
 'Pass unexpected:true to memory.prepare, impossible YYYY-MM-DD dates, or non-finite revision to the validator.',
 'Contract is weaker than declared; schema mismatches are concealed. No cross-owner exploit is established solely from stripped extra fields.',
 'Reject unknown keys with size/depth bounds and finite integer revisions; validate real dates and return typed failures. Treat retrieved data as untrusted structurally and retain confirmation gates.',
 'Unknown keys, array/deep/oversized objects, impossible dates, bad revisions and hostile note-data integration tests.')
finding(14,'HIGH','Session lifecycle','Action state is not tied to the real call session or cleaned up on End',
 'F-028 F-040 F-048 F-059 F-073','P06-04 P09-05 P10-08 P10-10','T043 T048 T054 T066',
 'src/ui/components/voice/VoiceConversationPanel.tsx',"'session-live'",
 'Panel passes the constant session-live for every action. clearSessionActions/clearSessionDrafts have no production call sites. Tool lookups check owner but not current session; draft.confirm/cancel/multi branches lack consistent isCurrent guards. User-change effect clears text but not activeMemoryProposal/activeMultiBatch/callSettings. This proves isolation/cleanup gaps; an actual cross-account disclosure is not asserted without runtime proof.',
 'Create a transient draft in one call, End/restart, inspect action/draft maps; attempt same-owner old-card operation using a new sessionId.',
 'Old same-owner drafts remain operable, action maps grow, and privacy/late-callback guarantees are not substantiated.',
 'Use real session/generation IDs; invalidate session state on End/system stop/account change; check owner, consent, session and revision at every mutation boundary.',
 'Same-owner new-session stale card, account switch while tool delayed, canceled memory save, End during batch callback and repeated-session map bounds.')
finding(15,'HIGH','Backend wiring','Backend source does not activate the new structured client tools',
 'F-047 F-078','P00-05 P06-01 P06-03 P06-08 P15-07','T055 T056',
 'backend_integration/call_lafina_v2_proposals/agent_tools_contract.md','read_lafina_data',
 'Read-only GitHub main is 5866aa241922b710d32d6d56277a8ef24a6aa178. scripts/provision_voice_agent.py declares no client tools or client_tool_call event. app/api/v1/voice.py:559 calls DeepSeek with messages/user/request/max_tokens, no tool schema, and service retains user/assistant text turns. The mobile repository contains only a proposed contract, not a deployed/provisioned result. Live agent might have separate owner config; it was not inspected.',
 'Compare captured backend source and proposed tool contract; attempt signed-in tool event only after owner-approved agent setup.',
 'The secure JS callback is reachable in synthetic tests, but a real custom-LLM/client-tool round trip is not delivered by the inspected backend source.',
 'Prepare a minimal reviewable backend/agent patch and tests with exact tool declarations/results; obtain scoped owner authorization before backend writes/provisioning. Mark F-047/F-078 externally blocked until observed.',
 'Backend custom-LLM tool-call/result round trip, authenticated client tool event, no paid calls in ordinary tests.',
 'Backend and agent owner approval/access required; no external edits made by this audit')
finding(16,'MEDIUM','Evidence integrity','Completion ledger substitutes mocks and document assertions for acceptance proof',
 'F-052 F-063 F-064 F-065 F-077 F-078','P12-05 P14-01 P14-07 P15-01 P15-02 P15-03 P15-04 P15-06 P15-09','T057 T067 T069 T070',
 '__tests__/ui/callLafinaPhase15.test.tsx','const confirmResult = draftRegistry.confirmDraft',
 'Final acceptance test checks an in-memory receipt after confirm, never checks a new SQL row. Phase13 tests button callback/store/ADR strings, not App Modal lifetime. Phase12 checks persistent setting, not session voice. Reports replace language evaluation with prompt text and profiling with amplitude clamp tests. EVIDENCE directory is absent. P12-08/P12-09 have no report checklist entries. Gradle dry-run is not compilation; this audit independently compiled successfully.',
 'Read named assertions alongside original exact P requirements; compare FEATURE_LEDGER blanket CODE_COMPLETE/AUTOMATED_PASS with defect probes and missing phone/APK measurements.',
 'Green suite totals materially overstate functional completeness and release readiness.',
 'Correct ledgers/reports with exact code, host test, provider and device layers. Add integration tests at broken boundaries; retain original requirements. Save dated raw logs/APK hashes for future handoff.',
 'All original F/P/T IDs covered with meaningful evidence and no false success; raw logs and optional/device statuses separate.')
finding(17,'MEDIUM','Accessibility and navigation','Keyboard, small-screen and exit behavior remain unvalidated or inconsistent',
 'F-002 F-005 F-053 F-056','P01-05 P01-06 P01-07 P05-06 P13-03','T002 T011 T035 T059',
 'App.tsx',"if (settings.startWithCallLafina && !callLafinaVisible && !callLafinaMinimized)",
 'With startWithCallLafina enabled on Chat, closing sets visible/minimized false, immediately satisfying the effect and reopening the call surface. New full-screen wrapper has safe insets but no KeyboardAvoidingView. Header fits multiple fixed controls at 320dp only by assumption. Reduce-motion stops thinking pulse but audio-driven bars still change height; tiny transcript toggle lacks minimum height.',
 'Enable start-with-call, stay on Chat, close call. For layout, use 320dp, large fonts, keyboard and TalkBack; these device checks were not run.',
 'Call exit can reopen unexpectedly; narrow/large-text controls have no substantiated accessibility acceptance.',
 'Trigger optional opening on deliberate tab-entry transition, not every visibility change; implement measured keyboard/small-screen layout and reduced-motion behavior.',
 'Exit does not reopen until a new deliberate Chat entry; short viewport/keyboard/large text snapshots plus device TalkBack.',
 'Phone/emulator visual QA required; reopening path is source-proven')

csvout('FINDINGS.csv', findings)
write('FINDINGS.md', '# Independent findings\n\nAll findings apply to '+SHA+'. HIGH findings have code-path evidence; eleven audit probes reproduce ten findings using synthetic host data. A passing defect probe means a bug was reproduced, not that acceptance passed.\n\n'+ '\n\n'.join(
    f"## {f['finding_id']} — {f['severity']} — {f['title']}\n\n" + '\n\n'.join(f'**{k.replace("_", " ").title()}:** {v}' for k,v in f.items() if k not in ('finding_id','severity','title')) for f in findings))

# Each feature is independently classified against the exact original acceptance.
# A phase suite passing is recorded separately and never upgrades hardware/provider proof.
feature_specs = '''
001|AUTOMATED_PASS|src/ui/components/VoiceModal.tsx|Call Lafina|Entry renamed; offline Hold to talk remains a separate control.|
002|PARTIAL|src/ui/screens/CallLafinaScreen.tsx|CallLafinaScreen|Full-screen wrapper exists; exit/reopen and navigation continuity incomplete.|CL2-006 CL2-017
003|PARTIAL|src/ui/components/voice/VoiceConversationPanel.tsx|callConnectedAt|Timer/state code exists; badge says Online even idle/failure and minimized duration restarts from minimize time.|CL2-006
004|AUTOMATED_PASS|src/ui/components/voice/VoiceConversationPanel.tsx|useThemedStyles|Existing semantic theme and fonts reused; aesthetic/device inspection NOT_RUN.|
005|PARTIAL|src/ui/screens/CallLafinaScreen.tsx|paddingBottom|Safe insets present; no measured 320dp/large-text/keyboard QA.|CL2-017
006|PARTIAL|android/app/src/main/java/com/lafina/capstone/LafinaVoiceConversationModule.kt|calculateRms|Actual PCM written to AudioTrack drives bounded output events. Output bar floor is nonzero at zero RMS. Native arithmetic verified; actual audibility/flush NOT_RUN.|
007|CODE_PRESENT_UNVERIFIED|src/ui/components/callLafina/CallWaveform.tsx|const isUserActive|Input RMS gated on capture and mute; native recorder and hardware waveform NOT_RUN.|
008|AUTOMATED_PASS|src/ui/components/callLafina/CallWaveform.tsx|phase === 'thinking'|Thinking/tool pulse is separate from output bars.|
009|PARTIAL|src/ui/components/callLafina/CallWaveform.tsx|isReducedMotion|Thinking pulse stops; waveform heights still follow every input/output update. No CPU/frame/battery measurement.|CL2-017
010|CODE_PRESENT_UNVERIFIED|android/app/src/main/java/com/lafina/capstone/LafinaVoiceConversationModule.kt|setMuted|Release/reacquire native mic code present; physical OS indicator/transcript exclusion NOT_RUN.|
011|PARTIAL|src/cloud/voiceConversation/controller.ts|stopResponse =|Transport flush and transcript interruption covered synthetically; actual PCM stop timing NOT_RUN.|
012|CODE_PRESENT_UNVERIFIED|android/app/src/main/java/com/lafina/capstone/LafinaVoiceConversationModule.kt|flushPlayback(owner)|Provider interruption flush present; acoustic barge-in/AEC only phone can prove.|
013|PARTIAL|src/ui/hooks/useVoiceConversation.ts|controller.dispose|Generation cleanup tested in controller; separate action state is not retired on End.|CL2-014
014|FAILED|src/cloud/voiceConversation/index.ts|getVoice:|Session uses different voice store from new selection UI.|CL2-005
015|PARTIAL|src/ui/components/voice/VoiceConversationPanel.tsx|void ttsService.stop|Provider PCM restored as normal output; local TTS stopped on start. Mixed hardware routing not proven; voice preview separate.|
016|CODE_PRESENT_UNVERIFIED|docs/audits/call-lafina-v2-codex/evidence/backend-provision_voice_agent.py.txt|turn_eagerness|Backend default patient configuration exists; live provisioned config and real pauses NOT_RUN.|CL2-012
017|PARTIAL|src/cloud/voiceConversation/personaPolicy.ts|sanitizeSpeechText|Transcript sanitization exists; prompt builder not connected and cannot modify already generated PCM.|CL2-012
018|PARTIAL|src/cloud/voiceConversation/controller.ts|getToolWorkingPhrase|Event-driven tool status exists; phrases precede executor permission/validation, backend event availability unverified.|CL2-015
019|AUTOMATED_PASS|src/cloud/voiceConversation/controller.ts|thinkingTimeoutMs|Owned single thinking timer and synthetic-delay tests; spoken provider filler behavior NOT_RUN.|
020|FAILED|src/cloud/voiceConversation/controller.ts|directive === 'wait'|Only local notice changes; subsequent provider playback still accepted.|CL2-012
021|FAILED|src/cloud/voiceConversation/controller.ts|setPreferences|Preferences stored locally but not transmitted/applied to provider.|CL2-012
022|AUTOMATED_PASS|src/cloud/voiceConversation/controller.ts|showProvisionalUser|Controller synthetic provisional/final/correction tests; live provider transcription NOT_RUN.|
023|AUTOMATED_PASS|src/ui/components/voice/VoiceConversationPanel.tsx|jumpToLatest|Collapse and user-scroll-aware logic covered by UI tests; TalkBack phone QA pending.|
024|PARTIAL|src/cloud/voiceConversation/controller.ts|sendText =|Typed user_message plus echo dedup implemented; actual spoken reply/provider integration NOT_RUN.|
025|PARTIAL|src/cloud/voiceConversation/index.ts|userTurn: text|Owner-gated Chat writes and controller once-per-turn tests exist; actual live call/provider not run.|
026|MISSING|src/ui/components/voice/VoiceConversationPanel.tsx|snapshot.turns|Only current call turns available; no saved earlier Chat history read/access path that preserves call.|CL2-006
027|PARTIAL|src/ui/components/callLafina/ActionCardHost.tsx|ActionCardHost|Typed renderer and unknown-kind fallback present; some supported variants unreachable from real call.|CL2-010
028|PARTIAL|src/ui/components/voice/VoiceConversationPanel.tsx|const handleConfirm|Confirm no longer forcibly ends audio; End/minimize/session lifetimes still inconsistent.|CL2-006 CL2-014
029|FAILED|src/ui/components/callLafina/ActionCardHost.tsx|onConfirm|No unified revision-aware edit/result/error lifecycle; shadow registry diverges from review.|CL2-001 CL2-002 CL2-010
030|PARTIAL|src/ui/components/callLafina/cards/ReminderDraftCard.tsx|onConfirm|Existing on-screen commandReview transaction preserved, but new tool confirm and grouped scheduler paths broken.|CL2-001 CL2-008
031|FAILED|src/ui/components/callLafina/cards/CalendarDraftCard.tsx|onConfirm|Displays proposal; no edit controls; conflict warnings/alternatives not fed from new registry to displayed review.|CL2-002 CL2-010 CL2-011
032|MISSING|src/ui/components/callLafina/ActionCardHost.tsx|if (agendaData)|Standalone agenda component exists but live panel never provides agendaData.|CL2-010
033|PARTIAL|src/ai/voiceActions/conflictChecker.ts|checkScheduleConflict|Standalone conflict checker exists; no initial live-card alternatives wiring; errors/overnight intervals unsafe.|CL2-010 CL2-011
034|FAILED|src/ui/components/callLafina/cards/NoteDraftCard.tsx|NoteDraftCard|Draft displays text only; no editable title/body path from live panel before confirm.|CL2-002 CL2-010
035|PARTIAL|src/cloud/voiceConversation/localVoiceData.ts|if (kind === 'notes')|Owner-scoped bounded note query works as JSON; no contextual note result card adapter.|CL2-010
036|MISSING|src/ui/components/callLafina/ActionCardHost.tsx|onOpenNote={onOpenNote}|Standalone callback prop exists; live call supplies no note result or navigation callback.|CL2-010
037|FAILED|src/ui/components/voice/VoiceConversationPanel.tsx|handleSaveMemory|New card cannot save by proposal ID; legacy path writes before review.|CL2-003 CL2-004
038|AUTOMATED_PASS|src/cloud/voiceConversation/localVoiceData.ts|if (kind === 'memory')|Bounded owner-scoped query, disabled-memory empty result and filtering covered with host store tests.|
039|FAILED|src/ui/components/voice/VoiceConversationPanel.tsx|handleUndoMemory|Undo/Save handlers receive mem_prop instead of action ID; helper works with correct ID in isolation.|CL2-003
040|FAILED|src/ai/voiceActions/draftRegistry.ts|registerDraft|Transient map exists but not the authoritative review source; no real session cleanup.|CL2-002 CL2-014
041|FAILED|src/ai/voiceActions/actionService.ts|draftRegistry.reviseDraft|SQL probe: revision to 16:00 still persists original 15:00 on actual review confirmation.|CL2-002 CL2-011
042|FAILED|src/ai/voiceActions/draftRegistry.ts|resolveTargetDraft|Resolver helper not called by live handler; grouped executor invents missing day/time.|CL2-002 CL2-008
043|FAILED|src/ai/voiceActions/actionValidator.ts|case 'multi.prepare'|Provider schemas disagree; live grouped edit callback absent.|CL2-007 CL2-010
044|FAILED|src/ai/voiceActions/multiActionService.ts|executeMultiActionBatch|Real per-item writes support partial results, but targeted retry duplicates and alarm result not checked.|CL2-008 CL2-009
045|PARTIAL|src/ai/voiceActions/multiActionService.ts|proposeFollowUpReminder|Relative proposal helper exists and requires card confirmation; scheduler/date guarantees incomplete.|CL2-008
046|FAILED|src/ai/voiceActions/actionValidator.ts|validatePayload|Allowlist exists; advertised multi payload rejected and extra fields accepted.|CL2-007 CL2-013
047|EXTERNAL_BLOCKED|src/ai/voiceActions/actionSecurity.ts|isToolExecutionPermitted|Signed-in production callback is no longer dev-only; backend/agent source does not activate tool flow.|CL2-015
048|FAILED|src/ai/voiceActions/draftRegistry.ts|confirmDraft|In-memory dedup is not durable persistence; targeted retries duplicate and session ID fixed.|CL2-001 CL2-002 CL2-009 CL2-014
049|PARTIAL|src/ai/voiceActions/actionService.ts|private emit|Lifecycle feed exists without subscriber in call UI; provider result errors often returned as normal strings.|
050|FAILED|src/ui/components/callLafina/CallLafinaSettingsModal.tsx|handleSelectVoice|Preview and catalogue code exists; selection is not read by actual session.|CL2-005
051|FAILED|src/cloud/voiceConversation/callLafinaSettingsStore.ts|getLanguageInstruction|Persistent language chips only; no session/LLM consumption or spoken locale switch.|CL2-012
052|NOT_RUN|src/cloud/voiceConversation/personaPolicy.ts|effective.language|No native-speaker samples or language quality measurements. Prompt-string tests do not evaluate language.|CL2-012 CL2-016
053|PARTIAL|src/ui/components/voice/VoiceConversationPanel.tsx|callSettings.captionSize|Caption size connected to transcript; accessibility/reduced-motion device checks unrun.|CL2-017
054|FAILED|App.tsx|visible={callLafinaVisible}|Android invisible Modal unmounts controller children.|CL2-006
055|DEFERRED_APPROVAL|docs/decisions/ADR-031-background-call-and-multimodal-feasibility.md|FOREGROUND_SERVICE_MICROPHONE|Conditional background mic appropriately deferred; no background capture authorization inferred.|
056|FAILED|App.tsx|settings.startWithCallLafina|Foreground-open preference exists but close immediately retriggers on Chat.|CL2-017
057|DEFERRED_APPROVAL|docs/decisions/ADR-031-background-call-and-multimodal-feasibility.md|text-only|Conditional multimodal feature appropriately withheld absent approved supported backend.|
058|PARTIAL|src/ui/components/VoiceModal.tsx|VoiceModal|Existing host regression suites pass; native Whisper/airplane-mode phone workflow NOT_RUN.|
059|PARTIAL|src/ai/voiceActions/actionSecurity.ts|const session =|Signed-in owner and consent checks present; in-call transient action cleanup/session identity incomplete.|CL2-014
060|CODE_PRESENT_UNVERIFIED|src/ui/hooks/useVoiceConversation.ts|audio|System-stop/mic-lease code and JVM rules pass; actual incoming reminder/phone focus NOT_RUN.|
061|PARTIAL|src/cloud/voiceConversation/controller.ts|failFromApi|Synthetic 401/402/unavailable/network handling passes; provisioned provider response path NOT_RUN.|
062|PARTIAL|src/cloud/voiceConversation/localVoiceData.ts|dataIsUntrusted|Bounded data and allowlist reduce exposure; regex injection checks do not establish end-to-end provider safety.|CL2-013 CL2-015
063|NOT_RUN|src/cloud/voiceConversation/controller.ts|recordTiming|Timing hooks exist; medians/p95, samples, actual CPU/PSS/FPS/battery budgets unmeasured.|CL2-016
064|PARTIAL|qa/DEVICE-TEST-MATRIX.md|DEV-01|20-step matrix exists; no newly built QA APK hash/install/phone receipt for this commit.|CL2-016
065|FAILED|docs/plans/call-lafina-v2/FINAL_REPORT.md|Required Backend Route|Handoff overstates functionality; route and contract names inaccurate; provider/phone gates remain.|CL2-015 CL2-016
066|AUTOMATED_PASS|src/ui/components/callLafina/CallWaveform.tsx|getTruthfulStateText|State-driven component labels covered with synthetic UI tests; device layout unrun.|
067|PARTIAL|src/ui/components/voice/VoiceConversationPanel.tsx|callSettings.callConnectedHaptics|Configurable connect/end vibration code; actual hardware haptics and event counts NOT_RUN.|
068|FAILED|src/ui/components/callLafina/cards/MultiActionCard.tsx|Saved ID:|Saved ID is noninteractive Text; retry can duplicate; no navigable local result link.|CL2-009 CL2-010
069|PARTIAL|src/cloud/voiceConversation/controller.ts|private log|Controller synthetic logging checks pass; full app/native/provider runtime audit NOT_RUN.|
070|PARTIAL|src/ui/components/voice/VoiceConversationPanel.tsx|Vibration.vibrate(20)|Setting named audio cue causes vibration, not sound; off by default.|
071|PARTIAL|android/app/src/main/java/com/lafina/capstone/LafinaVoiceConversationModule.kt|pongMessage|Native ping/pong, PCM format and close rules implemented/tested; actual provider compatibility NOT_RUN.|
072|NOT_RUN|android/app/src/main/java/com/lafina/capstone/LafinaVoiceConversationModule.kt|AcousticEchoCanceler|Headset/Bluetooth/speaker/AEC actual hardware evaluation entirely unrun.|
073|FAILED|src/ai/voiceActions/draftRegistry.ts|draft.status = 'applied'|Tests verify shadow-map transitions, not durable save under interruption; displayed review uses different authority.|CL2-001 CL2-002 CL2-014
074|AUTOMATED_PASS|src/cloud/voiceConversation/controller.ts|case 'closed'|Synthetic transport close -> explicit restart_required; no automatic restart in controller.|
075|FAILED|src/ui/components/voice/VoiceConversationPanel.tsx|activeMemoryProposal.id|Memory-on/off read gate exists; new Save/Undo broken and old path saves without card review.|CL2-003 CL2-004
076|PARTIAL|src/ui/components/voice/VoiceConversationPanel.tsx|<ActionCardHost|Cards coexist with call in component; several card/result/backend branches not integrated.|CL2-010 CL2-015
077|FAILED|src/ai/voiceActions/actionService.ts|confirmed and saved|Literal success returned with zero durable writes; phase15 test accepts in-memory receipt.|CL2-001 CL2-004 CL2-016
078|PARTIAL|backend_integration/call_lafina_v2_proposals/agent_tools_contract.md|read_lafina_data|Proposal exists, not implemented server/agent proof; FINAL_REPORT references nonexistent docs/decisions/agent_tools_contract.md.|CL2-007 CL2-015 CL2-016
'''

inventory = rows('CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/SPEC/FEATURE_INVENTORY.csv')
acceptance = rows('CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/QA/ACCEPTANCE_MATRIX.csv')
ledger = {r['id']: r for r in rows('docs/plans/call-lafina-v2/FEATURE_LEDGER.csv')}
details = {}
for l in feature_specs.strip().splitlines():
    n,status,path,symbol,note,ids = l.split('|')
    details[f'F-{n}'] = (status,path,symbol,note,ids)
assert set(details) == {r['id'] for r in inventory}

testresults = json.loads((EV / 'call-phase-results.json').read_text(encoding='utf-8-sig'))
byphase = {}
for suite in testresults['testResults']:
    m = re.search(r'callLafinaPhase(\d+)', suite['name'])
    if m:
        byphase[m[1]] = suite

def tests_for(phase, identifiers):
    suite=byphase.get(phase)
    path=f'__tests__/ui/callLafinaPhase{phase}.test.tsx'
    if not suite:
        return 'No Phase00 implementation suite; current preflight/native validation recorded separately'
    selected=[a['fullName'] for a in suite['assertionResults'] if any(ident in a['fullName'] for ident in identifiers)]
    if not selected:
        return path+'; no exact ID-linked assertion established; suite result alone is not acceptance proof'
    return path+' :: '+' || '.join(selected)

features = []
for original in inventory:
    fid = original['id']
    status,path,symbol,note,ids = details[fid]
    suite = byphase.get(original['phase'])
    linked = [f for f in findings if f['finding_id'] in ids]
    tests = f"__tests__/ui/callLafinaPhase{original['phase']}.test.tsx"
    features.append(dict(feature_id=fid, original_phase=original['phase'], priority=original['priority'],
        feature=original['feature'], exact_acceptance=original['acceptance'], independent_status=status,
        source_file_symbol_line=loc(path,symbol), reached_in_real_app=note,
        focused_test=tests_for(original['phase'],[fid]), test_execution_result=(f"Suite {suite['status']}; {len(suite['assertionResults'])} assertions; scoped proof only" if suite else 'NOT_RUN'),
        actual_device_status='NOT_RUN', backend_provider_status='NOT_RUN (no authenticated real-provider session)',
        observed_defect_or_blocker=ids or ('Physical/provider evidence unavailable' if status not in ('AUTOMATED_PASS','DEFERRED_APPROVAL') else ''),
        severity=max((f['severity'] for f in linked), key=lambda x: ['LOW','MEDIUM','HIGH','CRITICAL','BLOCKER'].index(x), default=''),
        antigravity_claim=ledger[fid]['code_status']+' / '+ledger[fid]['automated_test'],
        source_present=('NO' if fid in ('F-026','F-055','F-057') else 'YES (may be unreachable or incorrect)'),
        automated_acceptance_verified=('YES (host scope)' if status=='AUTOMATED_PASS' else 'NO'),
        auditor_notes=note))
csvout('FEATURE_AUDIT.csv', features)

phase_sources = {
 '00':('docs/plans/call-lafina-v2/REPORTS/phase-00.md','Starting HEAD'),
 '01':('src/ui/screens/CallLafinaScreen.tsx','CallLafinaScreen'),
 '02':('src/ui/components/callLafina/CallWaveform.tsx','CallWaveform'),
 '03':('src/cloud/voiceConversation/controller.ts','start ='),
 '04':('src/cloud/voiceConversation/personaPolicy.ts','LAFINA_VOICE_SYSTEM_PROMPT'),
 '05':('src/ui/components/voice/VoiceConversationPanel.tsx','jumpToLatest'),
 '06':('src/ai/voiceActions/actionService.ts','async executeTool'),
 '07':('src/ui/components/callLafina/ActionCardHost.tsx','isTaskOrReminder'),
 '08':('src/cloud/voiceConversation/localVoiceData.ts',"if (kind === 'notes')"),
 '09':('src/ui/components/voice/VoiceConversationPanel.tsx','handleSaveMemory'),
 '10':('src/ai/voiceActions/draftRegistry.ts','reviseDraft'),
 '11':('src/ai/voiceActions/multiActionService.ts','executeMultiActionBatch'),
 '12':('src/cloud/voiceConversation/callLafinaSettingsStore.ts','getCallLafinaSettings'),
 '13':('App.tsx','visible={callLafinaVisible}'),
 '14':('docs/plans/call-lafina-v2/REPORTS/phase-14.md','Automated Verification'),
 '15':('docs/plans/call-lafina-v2/FINAL_REPORT.md','Automated Verification'),
}
phase_overrides = {}
def pstatus(status, ids):
    for ident in ids.split(): phase_overrides[ident] = status
pstatus('AUTOMATED_PASS','P00-01 P00-07 P01-01 P01-08 P02-01 P02-02 P02-04 P02-05 P03-08 P03-09 P04-05 P05-01 P05-02 P05-07 P05-08 P06-10 P07-10 P08-08 P09-01 P09-02 P11-09 P14-01 P14-09 P14-10 P15-03 P15-08 P15-10')
pstatus('CODE_PRESENT_UNVERIFIED','P00-02 P00-03 P00-04 P00-08 P00-09 P03-01 P03-05 P03-07 P04-01 P08-01 P09-09 P12-09 P13-04 P13-05 P13-07')
pstatus('NOT_RUN','P01-09 P02-09 P04-09 P05-09 P12-05 P14-07 P14-08')
pstatus('EXTERNAL_BLOCKED','P00-05 P06-01 P06-08')
pstatus('DEFERRED_APPROVAL','P13-06 P13-08')
pstatus('FAILED','P04-06 P05-04 P06-02 P06-07 P07-02 P07-03 P07-05 P08-03 P08-04 P09-03 P09-04 P09-07 P10-02 P10-03 P10-04 P10-05 P10-06 P10-07 P10-08 P10-09 P10-10 P11-01 P11-02 P11-03 P11-05 P11-07 P11-08 P12-01 P12-03 P12-04 P12-08 P13-01 P13-02 P13-03 P13-09 P15-02 P15-06 P15-07')
checklist = []
gates = []
for pf in sorted((PACK / 'PHASES').glob('*.md')):
    phase = pf.name[:2]
    reportpath=f'docs/plans/call-lafina-v2/REPORTS/phase-{phase}.md'
    report=read(reportpath)
    path,symbol=phase_sources[phase]
    phase_f = [f for f in features if f['original_phase']==phase]
    for line in pf.read_text(encoding='utf-8').splitlines():
        m=re.match(r'- \[ \] \*\*(P\d{2}-\d{2})\*\* (.*)',line)
        if not m: continue
        ident, requirement=m.groups()
        matches=[f for f in findings if ident in f['phase_item_ids'].split()]
        claims=[l.strip() for l in report.splitlines() if re.search(r'\*\*'+ident+r'\*\*',l)]
        status=phase_overrides.get(ident,'PARTIAL')
        if matches and status=='AUTOMATED_PASS' and ident not in ('P14-01','P15-03'):
            status='PARTIAL'
        testpath=f'__tests__/ui/callLafinaPhase{phase}.test.tsx'
        source='; '.join(dict.fromkeys(f['source'] for f in matches)) if matches else loc(path,symbol)
        gap='; '.join(f['title'] for f in matches) if matches else ('Exact acceptance proof not established beyond inspected source and scoped host suite; no real-provider/device evidence.')
        if status=='AUTOMATED_PASS':
            gap='Current host verification satisfies the stated machine/document portion only; historical per-phase raw receipts and hardware are separate.'
        if ident in ('P14-01','P15-03'):
            gap='Independently ran preflight and native compile/JVM tests at HEAD. Does not validate historical per-phase commands, APK packaging or hardware.'
        checklist.append(dict(phase=phase,phase_item_id=ident,exact_original_requirement=requirement,
            antigravity_claim=' | '.join(claims) if claims else 'Listed complete in STATE.json; no matching exact report checklist row',
            observed_code_evidence=source, tests=tests_for(phase,[ident]),
            execution_result='Host phase suite passed; see call-phase-results.json' if phase in byphase else 'Current preflight/native compilation passed; historical baseline not rerun',
            proof_gaps=gap, independent_status=status, finding_ids=' '.join(f['finding_id'] for f in matches),
            report_exists='YES', report_revision_scope='Historical phase starting SHA where stated; not a raw full-HEAD execution receipt',
            real_device='NOT_RUN', real_provider='NOT_RUN'))
    for gate, evidence, status in [
        ('startup',reportpath+'; OWNER_AUTHORIZATION.md; STATE.json','CODE_PRESENT_UNVERIFIED'),
        ('tests',f'{reportpath}; evidence/preflight.log; evidence/gradle-elevated.log','AUTOMATED_PASS (current HEAD only; per-phase raw receipts absent)'),
        ('regression','evidence/preflight.log; 97 suites / 1395 passed / 1 skipped','PARTIAL (host suite; hardware not run)'),
        ('security','FINDINGS.md; owner/session/confirmation review','FAILED (integration issues remain)'),
        ('reporting',reportpath,'PARTIAL (exists; claims are not equivalent to acceptance evidence)'),
        ('exit','FEATURE_AUDIT.csv; PHASE_CHECKLIST_AUDIT.csv; ACCEPTANCE_AUDIT.csv','NOT_PASSED (see unresolved IDs; no historical gate inferred)')]:
        gates.append(dict(phase=phase,gate=gate,independent_status=status,evidence=evidence,notes='Auditor does not certify original per-phase startup or execution history from narrative reports.'))
csvout('PHASE_CHECKLIST_AUDIT.csv', checklist)
csvout('PHASE_GATES_AUDIT.csv', gates)

tstatus={8:'AUTOMATED_PASS',29:'AUTOMATED_PASS',31:'PARTIAL',41:'AUTOMATED_PASS',51:'AUTOMATED_PASS',59:'PARTIAL',61:'DEFERRED_APPROVAL',62:'DEFERRED_APPROVAL',69:'FAILED',70:'NOT_RUN'}
for n in [2,12,25,27,34,37,38,39,42,44,45,46,47,48,49,50,53,58,60]: tstatus[n]='FAILED'
for n in [3,4,9,22,24,28,30,32,33,36,40,43,52,54,55,63,64,66,67,68]: tstatus[n]='PARTIAL'
tstatus[56]='EXTERNAL_BLOCKED'
accept_rows=[]
for original in acceptance:
    tid=original['scenario_id']; n=int(tid[1:]); status=tstatus.get(n,'NOT_RUN')
    matches=[f for f in findings if tid in f['qa_scenario_ids'].split()]
    suite=byphase.get(original['phase'])
    device='Device' in original['layer']
    provider='Provider' in original['layer']
    accept_rows.append(dict(scenario_id=tid,area=original['area'],original_phase=original['phase'],
        exact_original_scenario=original['scenario'],exact_expected_behavior=original['expected'],environment_layer=original['layer'],
        independent_status=status,test_case=f"__tests__/ui/callLafinaPhase{original['phase']}.test.tsx (see named assertions in evidence/call-phase-results.json)",
        executed='HOST_SUITE_ONLY' if suite else 'NOT_RUN',
        actual_observed_result='; '.join(f['title'] for f in matches) if matches else ('Host/UI subcase passed; no physical/provider observation' if status=='AUTOMATED_PASS' else 'Original end-to-end scenario not executed; relevant suite passes only in host environment'),
        mock_scope='Host React Native/native transport/provider mocks; SQLite uses node:sqlite for storage suites. No physical or real-service claim.',
        evidence=' '.join(f['finding_id'] for f in matches) or 'evidence/call-phase-results.json; evidence/preflight.log',
        actual_device_status='NOT_RUN', actual_provider_status='NOT_RUN',
        owner_action=('Use synthetic signed-in account and identified physical phone; '+original['scenario']+'; record observed result and timestamp.' if device else 'Retest full original scenario after linked code remediation; authorized real-provider test required.' if provider else 'Retest original acceptance against authoritative source/storage; see linked finding.'),
        failure_description='; '.join(f['evidence'] for f in matches)))
csvout('ACCEPTANCE_AUDIT.csv',accept_rows)

# Capture full pack integrity, history, individual report checklists and actual toolchain.
checks=[]
for command in [
 ['git','status','--short'],['git','branch','--show-current'],['git','rev-parse','HEAD'],
 ['git','rev-parse','--abbrev-ref','@{upstream}'],['git','merge-base','--is-ancestor',BASE,'HEAD'],
 ['git','merge-base','--is-ancestor','dcbef57ec3b069be939a28e6c4b1442ea38d126a','HEAD'],
 ['git','diff','--stat',BASE+'..HEAD'],['git','diff','--check',BASE+'..HEAD'],
 ['git','diff','--name-status',BASE+'..HEAD'],['git','log','--format=%h %s',BASE+'..HEAD'],
 ['python','CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1/scripts/validate_pack.py'],
 ['node','--version'],['java','-version'],
]:
    p=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace')
    checks.append(dict(command=subprocess.list2cmdline(command),timestamp=NOW,exit_code=p.returncode,stdout=p.stdout,stderr=p.stderr))
(EV/'read-only-checks.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
manifest=[]
for line in (PACK/'MANIFEST.sha256').read_text(encoding='utf-8').splitlines():
    expected,name=line.split(maxsplit=1)
    fp=PACK/name.strip()
    actual=hashlib.sha256(fp.read_bytes()).hexdigest() if fp.exists() else 'MISSING'
    manifest.append(dict(path=name.strip(),expected=expected,actual=actual,match=expected==actual))
(EV/'pack-manifest-check.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
assert len(features)==78 and len(checklist)==151 and len(accept_rows)==70
assert len({r['phase_item_id'] for r in checklist})==151
native=[]
for fp in (ROOT/'android/app/build/test-results/testDebugUnitTest').glob('TEST-*.xml'):
    elem=ET.parse(fp).getroot()
    native.append({k:elem.attrib.get(k,'') for k in ['name','tests','failures','errors','skipped','timestamp']})
(EV/'native-test-summary.json').write_text(json.dumps(native,indent=2),encoding='utf-8')

counts={
 'F':dict(Counter(f['independent_status'] for f in features)),
 'P':dict(Counter(f['independent_status'] for f in checklist)),
 'T':dict(Counter(f['independent_status'] for f in accept_rows)),
 'feature_priority':{priority:dict(Counter(f['independent_status'] for f in features if f['priority']==priority)) for priority in ['P0','P1','P2']},
 'by_phase':{phase:{'features':dict(Counter(f['independent_status'] for f in features if f['original_phase']==phase)), 'checklist':dict(Counter(f['independent_status'] for f in checklist if f['phase']==phase)), 'acceptance':dict(Counter(f['independent_status'] for f in accept_rows if f['original_phase']==phase))} for phase in phase_sources},
 'source_present':sum(f['source_present'].startswith('YES') for f in features),
 'automated_acceptance_verified':sum(f['automated_acceptance_verified'].startswith('YES') for f in features),
 'real_device_verified':0,'real_service_verified':0,
 'findings_by_severity':dict(Counter(f['severity'] for f in findings)),
 'inventory_counts':dict(phases=16,features=len(features),phase_items=len(checklist),qa_scenarios=len(accept_rows)),
 'native_tests':sum(int(n['tests']) for n in native),
 'pack_manifest':dict(entries=len(manifest),matched=sum(m['match'] for m in manifest)),
}
(OUT/'STATUS_COUNTS.json').write_text(json.dumps(counts,indent=2),encoding='utf-8')
write('COVERAGE_SUMMARY.md','# Coverage by evidence layer\n\nThese are acceptance classifications, not a percentage of useful code. Source present includes incorrect/unreachable components. No items are excluded from the 78 denominator; F-055/F-057 are explicitly conditional and deferred.\n\n```json\n'+json.dumps(counts,indent=2)+'\n```\n')
logs=['# Actual validation log',f'Audit HEAD: `{SHA}`. Timezone: Asia/Manila. Report refreshed: {NOW}.',
      'Only nondestructive checks and synthetic host fixtures were used. No backend smoke/provider synthesis, database migration, install, clear-data or release publish ran.']
for name in ['preflight-result.json','gradle-result.json','gradle-elevated-result.json','call-phase-run.json','defect-probes-run.json']:
    fp=EV/name
    if fp.exists():
        result=json.loads(fp.read_text(encoding='utf-8-sig'))
        logs.append('## '+name+'\n\n```json\n'+json.dumps(result,indent=2)+'\n```')
logs += [
 '''## Results and scope

| Check | Outcome | Evidence |
|---|---|---|
| npm run preflight | Exit 0; typecheck and lint passed; 97 suites, 1395 tests passed, one skipped | evidence/preflight.log |
| Architecture within preflight | 280 modules, zero reported cycles/forbidden imports; 80 offline leaves | evidence/preflight.log |
| Native first attempt | Exit 1; sandbox denied Gradle cache lock access | evidence/gradle.log |
| Native approved escalation | Exit 0; compileDebugKotlin and testDebugUnitTest; 54 JVM tests, no failures/errors/skips | evidence/gradle-elevated.log; evidence/native-test-summary.json |
| Focused call phase suites | Exit 0; 15 suites, 197 passed | evidence/call-phase.log; evidence/call-phase-results.json |
| Audit defect reproductions | Exit 0; 11 bug observations reproduced, not acceptance passes | evidence/defect-probes.log; evidence/defect-probes-results.json |
| Original pack validator | Exit 0; 16 phases, 151 P, 78 F, 70 T | evidence/read-only-checks.json |
| Manifest | 37/37 SHA256 matches | evidence/pack-manifest-check.json |
| git diff --check actual base..HEAD | Exit 2; whitespace/blank EOF findings | evidence/read-only-checks.json |
| git diff --check unstaged | Exit 0 at initial check; owner .gitignore edit preserved | Initial read and final status |
| APK assembly/install/instrumentation | NOT_RUN | No new APK/device receipt claimed |
| Real signed-in ElevenLabs/DeepSeek | NOT_RUN | No billable/provider session started |

Jest emitted the existing open-handles warning and console warnings from negative fixtures. Both recorded main commands eventually exited 0 without --forceExit. The one skipped existing test is the opt-in planner performance benchmark in __tests__/storage/agyPort06PlannerQueries.test.ts (AGY_MEASURE). No test was skipped by this audit.

Native Gradle ran --offline and reused installed dependencies. The first attempt was blocked by filesystem cache permissions; a scoped approved escalation allowed the same compile/tests to run. No automatic approval rejection occurred.

Defect probes were initially run with nine observations and then expanded with two real reviewed-command/SQL cases. The final retained log/JSON is the eleven-observation run. They seed only node:sqlite in-memory synthetic data using the existing mock; no personal device database is opened. Permanent source/test files were not edited.

## Read-only provenance checks

Exact commands, timestamps, exit codes, stdout/stderr are in evidence/read-only-checks.json. This includes branch/HEAD, ancestor checks, base..HEAD file list/stat/history, whitespace check, pack validator, Node and Java versions. Unconfigured upstream is recorded as a nonzero discovery outcome, not a failure of implementation.

Additional discovery reads: root AGENTS/README/package.json, task-pack specifications/phase checklists/QA/templates/loop, phase ledgers/reports, affected voice/action/native/store/UI/test code, and installed React Native Modal.js:278-288. A process inventory via Get-CimInstance was denied by the sandbox; Get-Process later found no remaining Node process. No process was killed or app controlled.

GitHub connector read-only calls inspected backend branches/main, recursive source tree and three source files. Backend main was 5866aa241922b710d32d6d56277a8ef24a6aa178. Captured file content and provenance links are in BACKEND_AND_DEVICE_GATES.md and evidence/backend-*.txt. These are source reads, not deployment/provider verification.

## Preservation

Final tracked working-tree difference remains the pre-existing .gitignore entry; new authored files are confined to docs/audits/call-lafina-v2-codex/. Gradle/Jest updated ordinary generated outputs/caches. Application source, original tests/pack, backend/provider settings and existing user data were not changed. No commit, merge, push or deploy was performed.
''']
write('VALIDATION_LOG.md','\n\n'.join(logs)+'\n')
write('INDEX.md','''# Call Lafina 2.0 independent audit

**Verdict: FAIL.** HEAD `fe489a6487884fa6667f1cc6e2e0bddbd24e386d`.

- [Audit report](AUDIT_REPORT.md)
- [Every feature: 78 rows](FEATURE_AUDIT.csv)
- [Every phase item: 151 rows](PHASE_CHECKLIST_AUDIT.csv)
- [Every acceptance scenario: 70 rows](ACCEPTANCE_AUDIT.csv)
- [Separate phase gates: 96 rows](PHASE_GATES_AUDIT.csv)
- [Findings](FINDINGS.md) / [CSV](FINDINGS.csv)
- [Actual validation log](VALIDATION_LOG.md)
- [Backend and physical-device gates](BACKEND_AND_DEVICE_GATES.md)
- [Proposed Antigravity remediation prompt](REMEDIATION_PROMPT_FOR_ANTIGRAVITY.md)
- [22 adversarial cases](ADVERSARIAL_CASES.md)
- [Coverage detail](COVERAGE_SUMMARY.md) / [machine-readable counts](STATUS_COUNTS.json)
- [Evidence directory](evidence/)

Only audit artifacts were authored. Normal generated build/test caches were updated by validation. No product fixes or external writes were applied.
''')
print(json.dumps({k:v for k,v in counts.items() if k!='by_phase'},indent=2))
