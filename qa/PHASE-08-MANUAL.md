# Phase 08 — offline reminder loop / human acceptance

**State: HUMAN REQUIRED / NOT RUN.** This is an execution checklist, not a
certificate. Automated or emulator evidence in the phase report does not fill
in these physical-phone results. Phase 09+ remains gated by offline acceptance.

V05 remains **NOT RUN by owner decision** until a reviewed public or consented
local-accent recording is available. Generic synthetic voices do not satisfy it.
All 48 physical rows and the human signature remain unfilled by emulator tests.

The current decoder selects a peak-relative boundary. On each phone, include
soft/quiet speech, repeated ACK and different supported snooze durations before
accepting it. The emulator's defined 20dB synthetic-noise sample does not certify
room-noise tolerance. Its intermittent injection loss and retained failed
captures remain recorded; the optional transport step below is emulator-only.
During an actual call/audio interruption, expect capture to stop, an interruption
message, the typed draft preserved, no late transcript/action, and working manual
review controls. Restore the original settings after each owned QA fixture.

Current scoped emulator aggregate: 45 PASS / 2 FAIL / 1 NOT RUN;44 retained prior passes plus10 affected trials. The separate API35 guest reproduces A03/V03 FAIL (coinciding with observed emulator audio-path faults; root cause not established) and V04 PASS, and passes the A01/A02/A04 fallback smoke. Its low-load comparison is NOT RUN (host admission unmet); see the [stable-emulator report](../docs/reports/phase-08-stable-emulator-report.md). Earlier: [capture-fix report](../docs/reports/phase-08-capture-fix-report.md) and [restoration10/10](../docs/reports/evidence/phase-08-capture-fix-restoration-final.json). Producer/native/preflight failures remain distinct; no physical row or signature is filled by emulator tests.

## Install and prepare without losing existing data

Candidate: **0.8.0-data-qa, versionCode 11**. Verify the exact APK path and SHA-256
in the authoritative [current APK ledger](../docs/reports/evidence/phase-08-capture-fix-artifacts-final.json)
and [current capture-fix report](../docs/reports/phase-08-capture-fix-report.md).
Earlier Phase 08 APK hashes identify historical candidates. Package:
`com.lafina.capstone`; database schema: 3. Choose the phone's ABI. Establish that
any existing installation belongs to the reviewed capstone lineage and has a
compatible signing certificate before upgrading. The Nol replacement application
uses the same package with a different database; a package or certificate match
alone is not a migration plan. Stop on unknown lineage, signature failure,
version downgrade or missing data. Do not uninstall, clear storage, replace a
database or force a downgrade.

For a known compatible ARM64 phone, from the repository root:

```powershell
$phaseAdb='C:/Users/USER-PC/AppData/Local/Android/Sdk/platform-tools/adb.exe'
& $phaseAdb devices -l
Get-FileHash -Algorithm SHA256 android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
# Replace PHONE_SERIAL with the connected phone; confirm the candidate hash first.
& $phaseAdb -s PHONE_SERIAL install -r android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk
& $phaseAdb -s PHONE_SERIAL shell am start -W -n com.lafina.capstone/.MainActivity
```

Use a release-like APK for performance measurements; DataQa is for inspection.
Record non-sensitive model, API, ABI, RAM tier, build and speech engine/voice
versions. Cover Android 11/API30, API31, a newer reference phone and low-memory
ARM64 phones where available; mark missing coverage NOT RUN. Do not publish
phone serials, personal schedules, nicknames, screenshots containing real data,
microphone recordings or private transcripts.

Open Profile, Calendar and Notes. Existing preferences/items must survive the
upgrade and app reopen. Record original theme, reply mode, timezone, lead,
snooze, quiet hours, delivery/permission states, volume and radio settings so
they can be restored. Use only uniquely named synthetic `QA08` fixtures.

Enable reminder delivery deliberately in Profile. Review Android notification,
exact-alarm and full-screen access where applicable; unavailable access must
produce honest guidance/fallback. Full-screen simulated reminder UI is
conditional on OS permission/eligibility. An OS notification is an expected
fallback; this app never makes a cellular call. Set default lead to 0 for the
two-minute fixture below, then restore the original value after testing.

## First complete interaction

1. In Chat send `Remind me to QA08 phone loop in 2 minutes`, review the exact
   title/time and Confirm. Open Calendar/details and verify the task is TODO.
2. Enable airplane mode and explicitly turn Wi-Fi/mobile data off. Background
   and lock the phone. At due time inspect the notification/eligible simulated
   reminder screen. Record scheduled/actual times and delivery constraints.
3. Open the reminder and tap Answer. Expect the visible response screen and
   optional installed offline system TTS when voice replies are enabled. Answer
   alone must not acknowledge or complete the task. No microphone may start.
4. Use **Read reminder** / **Stop reading** where available. Hold **Hold to talk**
   only when ready; release to transcribe locally. If permission is requested,
   granting it must not start capture. If the OS permission dialog pauses the
   activity, the old response screen/draft is retired: tap **Answer** again if
   the original window remains open, then deliberately hold again. Recognition
   is editable text, never a saved action by itself.
5. Tap **Replace draft with recognized speech**, review/edit **Draft text**, then
   **Review response**. Typing `acknowledge` or `snooze 10 minutes` directly in
   Draft text also works. Alternatively use **Acknowledge / Dismiss** or
   **Snooze 10 minutes**. All these activity actions open **Review reminder
   response** with the exact title/action/duration. **Keep editing** or cancelling
   the dialog saves nothing. **Confirm** must save once, reconcile delivery and
   close, or clearly state that the action was saved but delivery is unverified.
6. Reopen Calendar/details. ACK must leave the task TODO; completion is a
   separate action. Snooze must leave one future reminder/job for the same
   task, with no duplicate alert. Confirm after returning/replacing/expiring the
   response screen must not apply an old proposal.

Historical pinned synthetic phrases passed in earlier cohorts; current capture-follow-up failures remain open;
this does not fill any phone result. On fresh reminders, test actual speech
`acknowledge this reminder` and `snooze for ten minutes`; inspect, copy, review
and Confirm only an exact action/duration. Separately check quiet/noisy speech,
aliases and five/fifteen-minute snoozes. Cancel/edit any misrecognition and verify
manual/typed fallback. These human cases remain NOT RUN.

The original 60-second ringing window does not restart at Answer. Completing a
long voice test may require a fresh fixture rather than extending a stale one.
Supported grammar is intentionally small: `acknowledge`, `acknowledge reminder`,
`acknowledge this reminder`; `snooze` (fixed 10 minutes); or `snooze [for] N
minute(s)` for numeric 1–120 and the words one/two/five/ten/fifteen/thirty/sixty.
Printable ASCII English only; case, spaces and one final `.`, `!` or `?` are
accepted. Unknown, contradictory, Unicode/control-containing or out-of-range
responses must be refused with manual controls available. A refusal is a result
to record, not permission to skip the case.

The notification's explicit ACK/snooze buttons continue to act directly through
the native receiver; the new review dialog belongs to the visible activity.
Selecting a notification action must still be deliberate and identity-fenced.
**Close without responding**, Back, or Answer alone must not imply ACK.

For the reopening regression (A28), pause an unconfirmed reminder review by
opening Main/Chat, enter a synthetic message without sending it, and reopen the
same reminder through its notification. Expect a fresh Answer/review, the
original timeout, no old proposal, and the exact unsent Chat text still present
when returning to Main. For A35, use the notification's ACK action, then inspect
Calendar/details: task remains TODO, the alert closes and does not return;
duplicate/old notification actions must not change another reminder.

Historical original-decoder synthetic response failures, including the
[direct decoder probe](../docs/reports/evidence/phase-08-response-direct-decoder.log),
remain retained. They must be read with the current profile and actual-capture
evidence rather than treated as a fresh test of this candidate. Neither later
synthetic nor typed/manual successes certify human speech or phone audibility.

Historical experimental emulator-only protocol (not the current comparison protocol): optional `--initialize-input` may be used after an
independently proven visible Recording state and fresh host-input OFF. It sends
one separate format-only `AudioPacket` with **zero source PCM bytes**, a
two-second deadline and required gRPC status 0. Recheck host input OFF and the
fresh Recording proof, then stream the same pinned PCM once via the existing
blocking stream. Do not start/restart capture, retry actual source audio, or
change app deadlines, model, parser, gain or padding for this step. Keep the
manual fallback usable. This is not an extra step for physical-phone testers.

Four actual-capture ACK cases passed across two cold boots on SDK emulator
37.1.11 ([first pair](../docs/reports/evidence/phase-08-input-loss-initialized-capture-pair.json),
[second pair](../docs/reports/evidence/phase-08-input-loss-initialized-capture-pair-2b.json)).
The [two initial failed captures](../docs/reports/evidence/phase-08-input-loss-cold-pair-1.json)
are preserved; the underlying SDK cause is unproven. Isolated SDK 37.2.13 had a
cold failure and warm pass and was rejected. Initialization remains an
experimental, unreliable workaround: a later A03 actual-capture recognition
failed despite successful initialization, host-input OFF and captured signal.
Four focused passes do not establish a reliability fix. The completed campaign
has44PASS/3FAIL/1NOT RUN: A03/V03/V04 remain failed and V05 deferred. See the
[emulator protocol](../docs/benchmarks/phase-08-emulator-voice-protocol.md) for the
clean in-place schema-3 candidate identity and removal of the temporary capture
exporter/hook. V05 and all physical rows/signatures remain NOT RUN.

## Alarm and lifecycle matrix — at least 30 actual alarms

Execute all 36 cases below on the reference phone where the OS supports them.
Each row means a distinct scheduled/due fixture; repeat on minimum/newer APIs
and OEM/low-memory tiers where available. Record actual delivery, final
reminder/job state, task TODO/completion state and drift. A missed or constrained
alarm is a result to investigate, never an automatic PASS. Record unsupported
conditions with the OS reason, not a fabricated successful trial.

| Case | Action at/around due time | Expected result | Physical result |
|---|---|---|---|
| A01 | Foreground, manual ACK review/Confirm | Exactly one ACK; task stays TODO; closes | NOT RUN |
| A02 | Answer, typed `acknowledge`, review/Confirm | Answer alone saves nothing; confirmed ACK once | NOT RUN |
| A03 | Answer, visible hold and spoken ACK, review/Confirm | No auto mic; reviewed ACK only | NOT RUN |
| A04 | Manual snooze review/Confirm | One future job; task stays TODO | NOT RUN |
| A05 | Answer, typed `snooze 10 minutes`, Confirm | One ten-minute snooze; no duplicate | NOT RUN |
| A06 | Answer, spoken supported snooze, Confirm | Same atomic result as manual snooze | NOT RUN |
| A07 | Background/unlocked | Notification/eligible reminder UI; controls work | NOT RUN |
| A08 | Background/locked | OS-permitted notification/call-style presentation | NOT RUN |
| A09 | Screen off | Wake/presentation only within OS limits; record drift | NOT RUN |
| A10 | Idle/Doze on a test phone | Record delivery/drift and capability limits | NOT RUN |
| A11 | Battery saver enabled | Honest constraints; no false delivered/ACK claim | NOT RUN |
| A12 | OS removes background process before due | Durable record recovers within OS limits | NOT RUN |
| A13 | Swipe app from recents before due | Record OEM behavior; no invented delivery guarantee | NOT RUN |
| A14 | Force-stop before due, then reopen after due | No promise while force-stopped; reopen reconciles | NOT RUN |
| A15 | Reboot before due; unlock phone as required | Restore/reconcile once; record locked-boot limits | NOT RUN |
| A16 | Restart app with an outstanding alarm | Existing reminder/job survives without duplicates | NOT RUN |
| A17 | Change wall clock forward across due | Reconcile consistent state; record late policy | NOT RUN |
| A18 | Change wall clock backward before due | No duplicate/stale ACK; record actual timing | NOT RUN |
| A19 | Change timezone before due | Stored instant/defined timezone semantics preserved | NOT RUN |
| A20 | Revoke notification permission before due | Clear delivery warning/manual planner fallback | NOT RUN |
| A21 | Deny/revoke exact-alarm access before due | Capability guidance; record fallback/constraints | NOT RUN |
| A22 | Deny full-screen access before due | Notification fallback, no forced full-screen claim | NOT RUN |
| A23 | Deny mic on answered screen | Typed and manual reviewed actions still work | NOT RUN |
| A24 | Grant mic, then release before permission returns | No recording until a new explicit hold | NOT RUN |
| A25 | Remove/disable offline TTS voice using reversible OS settings | Text/manual controls remain usable; no network voice | NOT RUN |
| A26 | STT unavailable/offline recognizer fails | Typed/manual controls remain; no silent mutation | NOT RUN |
| A27 | Audio-focus loss/real call during TTS or recording | Speech stops/releases appropriately; no late action | NOT RUN |
| A28 | Background/reopen reminder during recognition/review; retain an unsent Main/Chat draft | Old capture/review invalidated; fresh Answer/review, original timeout and Main draft preserved | NOT RUN |
| A29 | Let response window expire, then attempt an old confirmation | Stale action refused; durable state reconciled | NOT RUN |
| A30 | Rapid double Confirm or repeated notification action | At most one durable transition/job | NOT RUN |
| A31 | Two alarms due together; open/replace first screen with second | Correct identity; no cross-reminder action/transcript | NOT RUN |
| A32 | Edit/delete the exact source item before confirming old review | Stale/invalid source rejected; no orphan action | NOT RUN |
| A33 | Snooze, then allow the replacement alarm to become due | One replacement presentation; original cannot mutate it | NOT RUN |
| A34 | TalkBack, large text and soft keyboard during manual response | All actions/review/Cancel reachable and clearly named | NOT RUN |
| A35 | Explicit notification ACK action, including duplicate tap; reopen Calendar/details | Current identity ACK once; task stays TODO; alert stays closed; no activity review required | NOT RUN |
| A36 | Explicit notification snooze action, then old notification tap | One replacement job; old identity cannot change it | NOT RUN |

Use existing UI controls for source edits and exact fixture cleanup. A process
kill, force-stop, reboot or permission change must affect only the deliberately
chosen test phone/app. Restore OS overrides and settings afterward. App Back or
Close without a confirmed action must not imply ACK or task completion.

## Voice matrix — at least 10 interactions per tested voice

Run V01–V12 for each installed offline TTS voice and selected STT engine/language
combination actually claimed as supported. State voice/engine IDs and locale;
do not treat a synthetic PCM injection or typed draft as a live microphone pass.
Use consented human testers only. Record text expectations and observed error
categories, not private raw audio. Airplane mode with Wi-Fi/mobile data OFF
applies throughout. A microphone privacy indicator should appear only during
deliberate visible recording.

| Case | Spoken/manual interaction | Expected result | Physical result |
|---|---|---|---|
| V01 | Clear `acknowledge` | Review exact ACK; no mutation until Confirm | NOT RUN |
| V02 | Clear `snooze 10 minutes` | Review exact supported snooze duration | NOT RUN |
| V03 | Repeat supported ACK in quiet conditions | Same bounded action; task stays TODO | NOT RUN |
| V04 | Repeat supported snooze in quiet conditions | One future reminder after Confirm | NOT RUN |
| V05 | Local accent with supported response | Review actual transcript; correct or refuse safely | NOT RUN |
| V06 | Moderate background noise | Wrong/uncertain words never silently act | NOT RUN |
| V07 | `Okay but remind me later` | Ambiguity refused; manual options offered | NOT RUN |
| V08 | `Delete all tasks` | Unsupported/destructive response refused | NOT RUN |
| V09 | Silence/short release/no ready recording | Recoverable feedback; manual response works | NOT RUN |
| V10 | Cancel while preparing/recording/transcribing | Mic releases; late result cannot mutate/review | NOT RUN |
| V11 | Speak then edit text before review/Confirm | Visible reviewed text governs; old proposal invalid | NOT RUN |
| V12 | Stop TTS, explicitly hold mic, then cancel action review | No TTS/mic ownership conflict; no saved action | NOT RUN |

Separately hear the full reminder title in each selected offline voice; check
intelligibility, volume, Stop, focus interruption and unavailable-voice fallback.
Collect timing/RAM/startup/battery results with the
[device protocol](../docs/benchmarks/phase-08-device-protocol.md). No speed,
voice-quality or battery claim follows from emulator/mocked success.

## Cleanup and signed result ledger

Remove only named QA08 fixtures through exact reviewed UI actions. Restore
original preferences, permissions, radios, volume and OS battery/idle overrides.
Verify no active microphone/privacy indicator and no leftover owned alarm. Note
that Notes removal hides saved text/history; it is not secure erasure.

Keep a privacy-safe result file per device/run, linked from the phase report.
For each case record PASS/FAIL/NOT RUN, API/model/build, scheduled/observed time,
action/final state and reason/evidence. Keep skipped or failed cases visible.
F-001–F-017 traceability and SHOULD limitations belong in the release gate;
this reminder matrix does not replace setup/Calendar/Notes/privacy acceptance.

| Human review | Required value | Current value |
|---|---|---|
| Reviewer and review date | Human-entered name/initials and date | NOT SIGNED |
| Candidate version/hash; device matrix | Exact tested cohort | NOT RUN |
| A01–A36 results / count | At least 30 actual alarms; failures explained | NOT RUN / 0 certified here |
| V01–V12 per voice / count | At least 10 live interactions per test voice | NOT RUN / 0 certified here |
| Airplane mode/live audibility verified | Human observation | NOT RUN |
| Persistence/accessibility/fallback verified | Human observation | NOT RUN |
| Performance/battery evidence | Raw measurements or explicit pending reason | NOT RUN |
| Offline core release decision | Approve / reject with open defects | PENDING HUMAN REVIEW |

**STATUS: AWAITING DEVICE VALIDATION**

**STOPPED — awaiting explicit human approval.**
