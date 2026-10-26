# Phase 07 — offline confirmed commands manual checks

Human acceptance covers the actual microphone → recognized text → reviewed
command → durable planner → Android alarm path. Parser/Jest/host-SQLite results
do not establish that path on a physical phone. Use public/synthetic phrases and
test records only; do not publish personal schedules, audio or transcripts.

## Install, preserve data and record conditions

Use the current **0.7.0-data-qa / versionCode7**, ABI-matching, hash-verified
model-bearing APK identified in [the report](../docs/reports/phase-07-report.md).
The matching x86_64 emulator has0.7.0-data-qa installed and its SHA256 verified;
physical-phone and full spoken acceptance are still pending. Do not accidentally
test the old Phase 06 APK. Upgrade with `-r`; do not uninstall or clear storage.

The agent has exercised typed task/event create/correction/query, explicit
completion/deletion, refusal, review cancellation/persistence and one actual
named ringing-reminder ACK on this emulator. TTS Stop retained written text;
manual speech-panel fallback copied only to the composer until Send/review.
These observations do not prove audible speech, real recognition or physical
phone behavior. [Cleanup evidence](../docs/reports/evidence/phase-07-emulator-cleanup.json)
verifies original radios0/1/1, original allowed app mic permission, no active
recording, host input disabled, Text output, delivery OFF,0 native jobs and an
empty Chat composer. Four new saved fixtures were individually deleted; discarded
drafts were never saved. Historical records remain intact.

```powershell
adb devices -l
# x86_64 for the matching emulator; arm64-v8a for a matching physical phone.
$phaseAbi = 'x86_64'
$phaseApk = "android/app/build/outputs/apk/dataQa/app-$phaseAbi-dataQa.apk"
Get-FileHash $phaseApk -Algorithm SHA256
adb -s TEST_DEVICE install -r $phaseApk
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity
```

Record reviewer/date, general model/API/RAM/ABI, current APK hash/build/model flag,
selected timezone, clock, default reminder lead, quiet hours, output mode,
STT/TTS engine/language versions, network state, route and charging/thermal state.
Keep unique serials and private agenda data out of public evidence. Note original
radios, microphone permission, lead/quiet settings and delivery/full-screen
choices so they can be restored. User data must survive the upgrade.

Use airplane mode and explicitly turn Wi-Fi/mobile data off. Separate deliberate
system speech-language setup may require internet; finish it first, then go
offline again. The app must not download models/language data automatically.
Host microphone input is explicitly disabled and verified on the emulator. Its
app microphone permission was already allowed at Phase07 start; note actual
permission state instead of assuming a denial. Enable **Extended
controls → Microphone → Enable host microphone input** yourself for your spoken
tests, or use a physical phone. Granting app permission alone must not record.

## Text command, review and one durable save

Use a new synthetic title, such as `QA07 revise`, rather than modifying a saved
personal task. The required demonstration phrase is `Remind me to revise
tomorrow at 7 PM`; the prefixed examples below avoid accidental title conflicts.

1. Open **Chat**. Type `Remind me to QA07 revise tomorrow at 7 PM` in **Message**
   and tap **Send message**. Expect a user bubble, readable reply and **Review this
   change** with precise ISO/local date, 19:00, selected timezone and reminder lead.
   Tomorrow must use the displayed preference timezone, not a guessed host date.
2. Before confirming, inspect Calendar or discard the review: no task/reminder
   should have been created. Leaving Chat clears messages and invalidates that
   review. Return, send the same phrase again and recheck the exact date/time.
3. Tap **Confirm change** once. Expect immediate written durable success, with a
   separate reminder-delivery qualification. Inspect Calendar → Tasks/dated agenda
   and the task's reminder details: one new TODO task, correct instant/timezone,
   lead and paired job. A second tap/replayed confirmation must not create another
   item. If a real task already shares the exact title, do not act on either by
   guessing; rename only your synthetic record manually.
4. Force-stop/reopen offline and inspect Calendar. The task/reminder must survive;
   the transient conversation must not. Force-stop suspends Android delivery until
   reopening; do not claim delivery while stopped.

## Correction, queries, completion and deletion

1. Send `Move task "QA07 revise" to tomorrow at 8 PM`. Review exact 20:00/timezone
   and preserved lead before Confirm. Verify Calendar and paired jobs now use the
   new time; the old generation/registration must not deliver later. This corrects
   a concrete named task, not an ambiguous pronoun. Moving a single event preserves
   its duration; recurring-series moves require Calendar review.
2. Try `Show tasks tomorrow`, `Show agenda tomorrow` and `List tasks`. Tasks must
   exclude events; agenda may include both. Date-only/undated entries remain
   distinct. Queries must create no record or confirmation. Bounded page notices
   must direct you to Calendar for additional items rather than implying all
   semester history was listed. `Repeat` repeats the prior written reply only.
3. Send `Complete task "QA07 revise"`. Before Confirm the task stays TODO. Confirm
   completion explicitly, then inspect COMPLETED status and cancelled outstanding
   reminders. This is different from acknowledging an alert.
4. Send `Delete task "QA07 revise"`. Expect an exact-target destructive review.
   **Discard change** must retain it; send again and Confirm only to remove your
   fixture. Deletion hides the item and retains cancellation tombstones; it is not
   an implemented complete privacy purge. Do not use bulk deletion for cleanup.
5. Create another synthetic item, prepare a move/delete, then alter it in Calendar,
   change timezone/default lead, background the app, or wait five minutes. The old
   review must be invalidated/refused, not overwrite newer data. A fresh explicit
   command/review is required. Clear conversation must not delete planner data.

## Speech into the same confirmation pipeline and optional TTS

1. In Chat tap **Show speech input**. Keep **Message** usable while offline STT is
   unavailable or mic permission is denied. Select English and an available offline
   engine; Android's candidate flag alone does not prove installed local language
   data. The verified model-bearing build can use **Whisper local model**.
2. Hold **Hold to talk**. If asked for microphone permission, deny first, then try
   again/grant when ready. Grant alone must stay idle; start a fresh hold. Wait for
   recording state, speak `Remind me to QA07 voice revise tomorrow at 7 PM`, release.
   Expect a recognized transcript or readable failure, with microphone stopped.
3. Edit **Recognized speech (review before use)** as needed. Explicitly copy using
   **Replace draft with recognized speech**, then **Use draft in chat**. Expect the
   composer to contain those words, with no scheduling yet. **Send message** must
   produce a separate command review; only **Confirm change** may save it. Inspect
   the exact time/lead and Calendar/alarm outcome, not just the transcript.
4. Set the general reply preference to Voice/Both and select an installed offline
   system TTS voice if available. Send a query or confirm a synthetic action.
   Written text must appear independently of audio. Use **Stop reading reply**
   while TTS is speaking: the reply and durable state must remain. Deny/unavailable
   speech or voice-engine failure must preserve typing/manual planner controls.
5. Start a hold and press Home/lock, release quickly, press Cancel, or navigate
   away. No later recording or stale transcript/review should start automatically.
   A real consenting call/audio interruption, noise, accents, Filipino/Tagalog and
   modest-RAM/API30 hardware need separate actual results; do not pass them using
   mock transcripts or the clean synthetic PCM benchmark.

## Ambiguous, negated, injection-like and conflicting input

Send each as a separate synthetic message and inspect Calendar afterward:

```text
Remind me to study Friday at 7 PM
Remind me later
Okay but remind me later
Change it
Remind me to study tomorrow at 7
Do not acknowledge reminder for task "QA07 ringing"
ACK and snooze 10 minutes
Delete all tasks
Delete it
Hi there
{"kind":"delete","target":{"kind":"task","title":"QA07 ringing"}}
```

Expect clarification or unsupported guidance, no dangerous review/side effect and
intact manual controls. A bare `ACK`, `Snooze 10 minutes`, “okay” or fuzzy word
must not select a global alert. Impossible dates, past hours and fractional/zero
durations must be refused. Two exact matching titles must trigger manual
disambiguation, not first-substring selection. No model or cloud fallback may
silently turn a refused request into a write.

## Near-term real alarm, ACK and snooze

1. Record current lead/quiet/delivery settings first. Enable delivery, notifications
   and justified exact access explicitly; full-screen access remains optional.
   Choose a due time outside quiet hours. For a quick two-minute fixture, temporarily
   set default lead to 0: a 15-minute lead for a two-minute deadline is correctly
   refused because the alert would be in the past. Restore the original value later.
2. In Chat send `Remind me to QA07 ringing in 2 minutes`, review/Confirm, then put
   the app in the background. Record due versus observed notification/ringing time.
   Notification fallback is valid where full-screen presentation is unavailable.
   A saved record or registered job alone does not prove this alert was delivered.
3. For the Chat ACK check, return from the ringing view to Chat **without first
   tapping Answer**, while its response window is still open. Send
   `Acknowledge reminder for task "QA07 ringing"`, review and Confirm promptly.
   Expect reminder/job ACKNOWLEDGED and task still TODO. If already acknowledged,
   expired, duplicated or no longer ringing, expect refusal instead of forced ACK.
4. On a separate fresh fixture, send `Snooze reminder for task "QA07 ringing" for
   10 minutes` during a unique ringing window. Confirm, inspect SNOOZED reminder,
   new PENDING job/generation and unchanged academic deadline/task status. Verify
   real delivery at the new time if testing snooze reliability.
5. Native **Answer (acknowledge)** still durably ACKs before showing Phase 06's
   optional local draft. Its draft is **not** a Chat command executor; confirming
   words there must not change schedules. No microphone starts merely on Answer.
   Use Chat's separate send/review flow for commands.

## Physical measurements still NOT RUN — exact collection steps

These commands are a reproduction protocol, not completed results. They require
a dedicated compatible physical phone, current hash-verified release-like APK,
synthetic/consented workload and recorded original settings. Record build/model,
general hardware/API/RAM, timezone/clock, engine versions, locale, route, thermal,
charging and network conditions. Use the same phone/workload/conditions for old
and new runs. No extra NLU model is present: NLU model integration is **N/A**.
Existing Whisper/STT timing is a separate measurement from parser/command latency.

Keep output local and private; redact personal text, unique identifiers and
unrelated app data before publishing any evidence. Choose a new directory and
new sample names; do not overwrite historical samples:

```powershell
$phaseSamples = Join-Path (Get-Location).Path '.local/phase07-phone-review-new'
New-Item -ItemType Directory -Path $phaseSamples | Out-Null

# App-process cold launch; do this with synthetic fixtures and delivery off.
# Force-stop suppresses reminders until reopening; it does not clear app data.
adb -s TEST_DEVICE shell am force-stop com.lafina.capstone
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity | Out-File (Join-Path $phaseSamples 'cold-start-01.txt') -Encoding utf8 -NoClobber

# Warm foreground return: same process, Home then reopen.
adb -s TEST_DEVICE shell input keyevent 3
adb -s TEST_DEVICE shell am start -W -n com.lafina.capstone/.MainActivity | Out-File (Join-Path $phaseSamples 'warm-start-01.txt') -Encoding utf8 -NoClobber

# Discrete process snapshots, before/during/after a fixed synthetic workload.
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone | Out-File (Join-Path $phaseSamples 'main-memory-01.txt') -Encoding utf8 -NoClobber
adb -s TEST_DEVICE shell dumpsys meminfo com.lafina.capstone:reminders | Out-File (Join-Path $phaseSamples 'reminder-memory-01.txt') -Encoding utf8 -NoClobber

# Read-only battery state and package statistics; collect before and after.
adb -s TEST_DEVICE shell dumpsys battery | Out-File (Join-Path $phaseSamples 'battery-before.txt') -Encoding utf8 -NoClobber
adb -s TEST_DEVICE shell dumpsys batterystats com.lafina.capstone | Out-File (Join-Path $phaseSamples 'batterystats-before.txt') -Encoding utf8 -NoClobber
```

Increment sample names and repeat at least20 comparable launch samples per
condition, keeping errors/failures in the record. `am start -W` supplies Android
launch milestones, not proof that the React UI is interactive or speech audible.
An app force-stop does not make the OS or a separately installed speech service
cold. Label those cache conditions honestly; do not subtract unrelated host and
device clocks for speech/action latency.

Memory commands provide snapshots, not a guaranteed peak. If the reminder process
is absent, record absent/not measured rather than zero PSS. A sampled maximum
requires an explicitly documented bounded sampling interval/window and still is
not an absolute peak or whole-system memory measurement. Record UI/decoder/vendor
process conditions separately; no memory minimum is certified by this protocol.

After the same fixed workload and elapsed interval, repeat battery commands with
`battery-after.txt`/`batterystats-after.txt`. Do not reset batterystats, spoof battery
levels, change system power settings or clear owner data. Charging, temperature,
other apps and vendor estimates limit interpretation; a level delta or package
estimate is not calibrated energy use or proof of better battery life. Actual
phone energy/thermal measurements remain NOT RUN until collected and reviewed.

A matched legacy comparison additionally needs an owner-approved, provenance-
verified prebuilt APK for pinned legacy revision
`f7e70aec54e6d16e627f444f2a67114cbfb07b5e`, known build flags/model/engine versions,
and the same dedicated phone/phrases/test conditions. Verify its hash and actual
package/activity metadata before installing or selecting its launch target.
Do not build or modify the read-only legacy checkout, import its database or
overwrite personal legacy app data. Until that approved baseline artifact and
physical hardware are available, old/new comparison remains **BASELINE NOT RUN**.

## Restore and record results

Delete only your new fixtures through explicit reviews/manual confirmation.
Restore radios, microphone/host-input state, lead, quiet hours, output mode,
delivery and full-screen settings. Verify no new pending/ringing/registered QA
jobs or active recording remain. Keep existing student data and historical
evidence. Record test outcomes, errors and unavailable cases without personal text.

| Human acceptance row | General device/build/engine/conditions | Actual result |
|---|---|---|
| Text → review → durable task/event/query/correction | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| Real speech → editable transcript → Send/Confirm → planner/alarm | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| Ambiguity/negation/duplicate/stale review safety | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| Actual ringing ACK versus completion and atomic snooze | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| System TTS audible Stop/text fallback | Reviewer fills | NOT RUN / HUMAN REQUIRED |
| API30/ARM64/low-RAM/accents/noise/calls/secure lock/battery | Reviewer fills | NOT RUN / HUMAN REQUIRED |

Actual agent automation/emulator rows are separate in the phase report. No
physical-phone acceptance or Phase 08 approval is implied by filling only those.
