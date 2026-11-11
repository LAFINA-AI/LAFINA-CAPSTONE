# Call Lafina 2.0 manual acceptance checklist

Physical audio, provider and user acceptance checks below are **NOT RUN** unless a separate installation/smoke receipt explicitly says otherwise. Checkout repairs have automated coverage; this does not certify the production backend or physical audio. This checklist includes every original T001–T070 scenario and additional regression checks.

Both requested copies are now updated on the Infinix X6880 / Android 15. Installed APK hashes match the verified builds; Android activities/processes start and no fatal startup error pattern was found. The main app is open. No uninstall or data clearing was used. This is installation/launch smoke only.

## Setup and recording results

Use a synthetic student account and harmless dummy records. Record date/time/timezone, phone model, Android/API, app variant, source revision, APK SHA256, selected nonsecret voice ID, network and headset. Record PASS/FAIL/NOT_RUN per item, expected versus actual, and a privacy-safe screenshot/log where useful. Keep tokens, signed URLs, API keys and private student content out of evidence.

- [ ] Use the updated ARM64 APKs and SHA256 receipts in `docs/reports/evidence/call-lafina-remediation/`. Target phone detected: Infinix X6880, Android 15, ARM64. See the final report for actual build/install outcomes.
- [ ] Install with `adb install -r` using the matching package APK (main and provider-test copies keep separate data). Preserve existing data; do not uninstall or clear storage.
- [ ] Have speaker, wired headset and Bluetooth headset ready. For live calls, use the existing backend and an authorized account with provisioned ElevenAgents and DeepSeek access.

## Access and disclosure

1. [ ] Guest: attempt Call Lafina. Expect sign-in explanation and no microphone indicator or provider session.
2. [ ] Signed-in, Online Mode off: expect explicit enable flow before any audio upload.
3. [ ] First-use consent: expect accurate disclosure naming ElevenLabs/cloud microphone streaming; decline leaves mic closed.
4. [ ] Deny/revoke OS microphone permission. Expect clear error and usable typing/manual tools.
5. [ ] Use offline/airplane mode. Call should fail honestly while offline push-to-talk, local TTS, Calendar, Notes and typed commands remain usable.

## Voice, waveform and conversation

6. [ ] Choose voice B in Call settings, end the current session and start a new call. Expect voice B, including after app restart; no simultaneous device voice.
7. [ ] Speak and listen separately. Input meter follows only the mic; output meter follows playback. Silence must not report fabricated amplitude; thinking/tool indicators must differ from speech.
8. [ ] Mute and speak: OS microphone indicator disappears and no new transcript is captured. Unmute resumes once. End releases capture and sound.
9. [ ] Tap Stop during speech. Expect prompt silence, no late resumption and preserved drafts. Repeat while a tool/review is active.
10. [ ] Speak over the assistant at low and high speaker volume. Expect interruption, recognition of your new turn and no echo loop. Repeat wired and Bluetooth.
11. [ ] Connect/disconnect Bluetooth during a call. Verify actual input/output route, fallback and no duplicate audio.
12. [ ] Pause mid-sentence for 1–2 seconds, continue, then request “wait, I'm thinking.” Expect patient turns and no unsolicited playback until you resume. Confirm actual audio, not just the status label.
13. [ ] Request brief/detailed/slow replies and each offered language. Provider enforcement and language quality require live acceptance; do not count saved settings as proof. Use native-speaker English/Filipino/Taglish/Cebuano samples and record recognition/pronunciation results.

## Transcript and review

14. [ ] Speak with provisional captions, interrupt an answer, type a turn, collapse transcript, scroll back and Jump to latest. Expect stable final turns, preserved scroll and one response per typed turn.
15. [ ] End/reopen ordinary Chat. Expect each finished turn once, with interrupted status where appropriate, under the correct account. During a live call, tap Open Chat history; expect ordinary earlier Chat browsing with a working mini-call bar.
16. [ ] Prepare “Add task: Physics tomorrow at 3 PM.” Expect review only and no durable item/outbox/alarm before Confirm.
17. [ ] Say “Change to 4 PM.” Expect updated review. Tap Confirm: exactly one durable item at 4 PM. The older card/token must not save 3 PM.
18. [ ] Repeat with “Cancel that.” Expect card dismissal and zero writes even if an old callback arrives. Stop speaking and End must not be interpreted as completing a task.
19. [ ] Use Update draft to change title, date/time and note content. Confirm the displayed result matches actual stored fields. Test ambiguous/missing dates and times: clarification, never silent 09:00/today.
20. [ ] Double-tap Confirm, replay/retry a saved item and interrupt speech during save. Expect one durable entity/outbox/alarm and a truthful final result. Use safe synthetic storage/scheduler failure injection to check that a failed save never says Done.

## Calendar, notes, memory and batches

21. [ ] Create a conflicting event, including an overnight event. Request overlapping time. Expect actual conflict/warnings and grounded alternatives; a storage read failure must not mean no conflicts. After a spoken edit, expect conflicts and alternatives to be recomputed. Also check a grouped event conflict.
22. [ ] Ask for tomorrow's agenda. Expect correct local date/timezone, actual bounded results and partial flags. Expect an Agenda card and an Open Calendar link to the requested date.
23. [ ] Dictate a note, edit title/body, Save, reopen Notes and read it back. Search for two same-title notes; expect clear matches and owner-checked opening. Tap Open Note and expect that exact owned note; deleted/other-account records must be refused.
24. [ ] Search a harmless test note containing hostile instructions. Expect data display/retrieval only; no autonomous writes or instruction execution.
25. [ ] Memory off: request remember/recall. Expect no read/write. Memory on: request a harmless preference, review exact text, Save then Undo. Repeat Cancel, duplicate Save, expiry, consent revocation and account switch. No legacy pre-confirm write may occur.
26. [ ] Prepare a grouped task/event/reminder/note request. Edit a title/date/time/end time/note body, remove another item, Save All. Expect exact reviewed fields and per-item results. Missing event/reminder time must fail without inventing a time.
27. [ ] Safely fail one batch item and retry. Expect accurate partial success and no replay of saved items. Confirm real reminder delivery-job/alarm registration separately; a DB row alone is not hardware delivery proof.
28. [ ] Tap saved-result links. They must open the exact local entity. Return to a tab later: the consumed open request must not reopen the editor again.

## Navigation, interruptions and accessibility

29. [ ] Minimize during listening/speech/review, navigate Calendar/Notes, then restore. Expect same live session, transcript, drafts and call controls. Check hardware Back, mini-bar Mute/End and timer continuity.
30. [ ] Enable start-with-call, enter Chat, close the surface and stay in Chat. It must stay closed until another deliberate Chat entry; no automatic mic opening.
31. [ ] Trigger an exact reminder during the call; receive a cellular call; press Home; lock; lose Wi-Fi; sign out or switch account during startup/tool work. Expect correct audio priority, microphone release, no old-owner UI/writes, and explicit Start again rather than hidden restart.
32. [ ] Test 320dp/short display, landscape, large text, keyboard open, safe insets and TalkBack. All review, correction, Cancel, Confirm, Mute and End controls must remain reachable. Verify reduced motion and haptics toggles with real hardware.
33. [ ] Run ordinary Chat, onboarding/preferences, guest mode, Notes editing, Calendar CRUD, native alarms and all seven sync entity types after these changes. Check reminder acknowledged remains distinct from task completed.

## Backend/provider owner checks

34. [ ] Backend owner: follow `backend_integration/call_lafina_v2/OWNER-HANDOFF.md` and verify deployed backend revision, migration 013, live ElevenAgents config and server-side key permissions. Route is `/v1/ai/voice/sessions`; a 401 alone does not prove readiness.
35. [ ] Verify actual tool declarations/events and DeepSeek custom-LLM tool-call/result round trip. This remains externally blocked; mobile callback tests do not prove it.
36. [ ] Using approved bounded usage, test missing agent, expired grant, 401/402/429, timeout and lost connection. Expect honest failure/manual fallback, no fabricated saved result and no unbounded retry charges.
37. [ ] Review privacy-safe runtime logs for transcripts, notes, grants and signed URLs. Verify disabled memory is not sent to provider.
38. [ ] Measure user-final → first text/audio, Stop/interruption → silence, CPU/PSS/FPS/battery and provider usage, with sample counts and median/p95. No performance figure is established until measured.
39. [ ] Background microphone and image upload remain deferred. Do not enable or count them as successful without separate owner approval and a supported compliant implementation.


## Additional checks specific to the repaired paths

40. [ ] Open Call settings while a call is live. Voice preview must be disabled. After End, preview two voices quickly and close settings mid-preview: only the current preview may play, closing must stop it, and Online Mode off/account change must prevent another cloud preview.
41. [ ] Open at least two different drafts (for example a memory and a planner item). Say “Cancel that.” Expect a request to choose a card and no arbitrary cancellation. End the call while preparation is delayed; no late card may reappear or save.
42. [ ] Leave a reminder alarm permission disabled, confirm a reminder and inspect the actual row. Expect “Saved locally” with a pending/unverified delivery warning, never “alarm registered.” Enable permission, reconcile, then verify one registration and one ring. Registered status must match the current delivery generation.
43. [ ] Create/confirm a dated recurring reminder, revise its time and a time block's duration, then verify the exact stored recurrence and start/end. End/restart while draft or tool work is delayed: stale cards must not save.
44. [ ] Compare both installed copies: main (`com.lafina.capstone`) and provider-test (`com.lafina.capstone.providers`). They keep separate accounts/settings/data. The rebuilt provider-test copy uses the normal backend and contains no direct provider credentials; verify Profile backend choice if a previous local override remains.
45. [ ] Schedule a harmless future reminder, restart the phone and change time/timezone deliberately. Verify native rescheduling, no duplicate ring, correct local date and reminder acknowledgement distinct from task completion. Restore the original time settings after testing.
46. [ ] Test memory duplicate Save/Undo on an already existing fact: duplicate must not delete the original. Forget an actual synthetic saved fact in Memory settings, then verify it is absent from subsequent calls and from another account.

## Complete original acceptance scenario checklist

Every original ID is retained below. Execute against **each installed copy** where relevant, recording expected versus actual, phone/OS, timestamp and redacted evidence. A host test is supplementary evidence. T061 and T062 remain deferred, not successful tests. T069 is the owner's document review; T070 includes physical-phone acceptance beyond installation/launch. CSV result worksheet: `qa/CALL-LAFINA-V2-MANUAL-RESULTS.csv`.

| ID | Action/scenario | Expected result | Phone/provider result |
|---|---|---|---|
| T001 | Tap Call Lafina; offline PTT remains separate | Correct full-screen screen, no hidden call-sheet buttons | NOT_RUN |
| T002 | Back and return to Chat | No duplicate session or lost history | NOT_RUN |
| T003 | Guest attempts call | No mic/agent session, clear sign-in gate | NOT_RUN |
| T004 | Signed user Online Mode disabled | No mic until explicit enable | NOT_RUN |
| T005 | First-time online speech disclosure | Consent before capture, correct providers described | NOT_RUN |
| T006 | Real microphone activity drives input waveform | Unmuted RMS visible, muted waveform flat | NOT_RUN |
| T007 | Real assistant output drives waveform | Audio amplitude maps to output only | NOT_RUN |
| T008 | Thinking/tool states without audio | No fake speaking animation | NOT_RUN |
| T009 | Stop/end stale waveform event | Waveform stops and never restarts from old event | NOT_RUN |
| T010 | Reduced motion/low end / battery | Stable no-motion alternative, bounded CPU | NOT_RUN |
| T011 | Small screen, keyboard, large font | Confirm/Cancel and bottom dock reachable | NOT_RUN |
| T012 | Select voice B then place call | Actual voice B, not local device voice | NOT_RUN |
| T013 | Interrupt assistant mid-sentence | Playback silenced, new user turn recognized | NOT_RUN |
| T014 | Tap Stop while speaking | Silence and listening resumed | NOT_RUN |
| T015 | Tap Mute and speak | Android recording indicator off, no transcript | NOT_RUN |
| T016 | Unmute after mute and speak | Capture resumes once, no lease leak | NOT_RUN |
| T017 | Speaker echo while agent speaks | No self-triggered conversation loop | NOT_RUN |
| T018 | Wired/Bluetooth route audio focus | Playback/capture routed correctly, no leak | NOT_RUN |
| T019 | Reminder simulated call interrupts voice | Correct priority and cleanup | NOT_RUN |
| T020 | Real cellular call interrupts Lafina | Safe stop/restart, no hidden microphone | NOT_RUN |
| T021 | Background/lock with default settings | Session ends, mic released | NOT_RUN |
| T022 | Loss of Wi-Fi/session close | Needs explicit Start again | NOT_RUN |
| T023 | Pause mid-sentence then continue | Patient turn-taking, no early reply | NOT_RUN |
| T024 | Tool slow to respond | One truthful status cue, not repeated filler | NOT_RUN |
| T025 | Ask stop speaking / wait | Output stops / wait state respected | NOT_RUN |
| T026 | Short answer then request detail | Short first answer, expands on request | NOT_RUN |
| T027 | Ask to speak slowly | Style change or truthful limitation | NOT_RUN |
| T028 | Live provisional text and final | Provisional replaced, no duplicates | NOT_RUN |
| T029 | Long call transcript scroll and collapse | Jump to latest and user scroll preserved | NOT_RUN |
| T030 | Type during live call | Typed turn receives speech, no double event | NOT_RUN |
| T031 | Interrupted reply in chat history | Saved once with interrupted metadata | NOT_RUN |
| T032 | Prepare reminder via voice | Review only, no write before Confirm | NOT_RUN |
| T033 | Cancel prepared reminder | No task/reminder/outbox/alarm created | NOT_RUN |
| T034 | Confirm reminder | Persisted exactly once and alarm registered | NOT_RUN |
| T035 | Confirm button during keyboard up | Visible and accessible | NOT_RUN |
| T036 | Calendar conflict check | Actual busy event shown, alternatives grounded | NOT_RUN |
| T037 | Agenda query tomorrow | Correct date/time from device time zone | NOT_RUN |
| T038 | Search existing notes by term | Correct owner, bounded excerpt, open note | NOT_RUN |
| T039 | Create dictated note and edit title | No save before confirm; correct revision/outbox | NOT_RUN |
| T040 | Prompt injection stored in note | Ignored as instruction, not executed | NOT_RUN |
| T041 | Remember preference with memory off | No save/read; truthful message | NOT_RUN |
| T042 | Save explicit memory and Undo | Exact state transitions and owner scope | NOT_RUN |
| T043 | Forget fact and switch account | No stale memory in new session | NOT_RUN |
| T044 | Actually make that 4 PM | Same draft revised, collision rechecked | NOT_RUN |
| T045 | Cancel that with one open draft | Draft canceled, call continues | NOT_RUN |
| T046 | Cancel that with two drafts | Ask which draft, do not pick randomly | NOT_RUN |
| T047 | Repeat same confirm twice | One durable item / alarm / outbox | NOT_RUN |
| T048 | Edit while prior confirm delayed | Revision guard prevents stale save | NOT_RUN |
| T049 | Interrupt speech during save | Action result truthful, no orphaned write | NOT_RUN |
| T050 | Create three reminders in one turn | Group review, individually editable | NOT_RUN |
| T051 | Item 2 transaction failure | Atomic rollback or accurate partial result | NOT_RUN |
| T052 | Follow up on capstone submission | Draft requires explicit confirmation | NOT_RUN |
| T053 | Unknown tool name/invalid arguments | Rejected without execution or data leak | NOT_RUN |
| T054 | Forged owner/session ID or stale callback | Bound to active authenticated owner | NOT_RUN |
| T055 | Duplicate ElevenAgents tool event | Idempotent result, no duplicate write | NOT_RUN |
| T056 | Client tool path outside dev test mode | Release allowlist + real consent gates | NOT_RUN |
| T057 | English and Filipino/Taglish/Cebuano tests | Pass only with native-speaker samples | NOT_RUN |
| T058 | Switch voice while call open | Supported session restart; drafts/history survive | NOT_RUN |
| T059 | Disable tool sounds and haptics | Settings visibly take effect | NOT_RUN |
| T060 | In-app minimization and restore | No session loss or unintended capture | NOT_RUN |
| T061 | Opt-in background call | Do not test as success until approved/compliant | DEFERRED — do not enable |
| T062 | Image attachment during call | Only enabled with actual multimodal support | DEFERRED — do not enable |
| T063 | DeepSeek 402/quota exhausted | Real error, no fake answer | NOT_RUN |
| T064 | ElevenAgents not provisioned 404 | Unavailable message, offline fallback remains | NOT_RUN |
| T065 | Offline airplane mode | Voice call blocked; offline Whisper/task tools work | NOT_RUN |
| T066 | Sign out mid-call and delayed event | No previous owner data, mic released | NOT_RUN |
| T067 | No API keys/grants/transcripts in logs | Static & runtime audit | NOT_RUN |
| T068 | Calendar/Notes/Chat/memory/alarms/sync | All existing features continue working | NOT_RUN |
| T069 | Final 78-ID evidence audit | Every feature mapped to test/code/device or blocker | NOT_RUN |
| T070 | Final build / QA APK on real phone | Receipts and manual checklist, or explicit NOT_RUN | PARTIAL — installed/launch smoke only |
