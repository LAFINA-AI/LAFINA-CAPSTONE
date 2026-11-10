# Manual acceptance — NOT RUN

Implementation run `agy-port-20261106` is finished (PARTIAL, see SUMMARY.md). **Every check below is NOT_RUN.** No phone, emulator or live service was used in this run.

## Artifacts produced (build outputs; not committed)

These APKs are on the build machine only.

- **Built from:** branch `codex/agy-preservation-improvements`, code commit `acfd8fc` (attachment-cleanup audit C2 fair queue, on top of the C1, P1/P2 and final-audit F1–F3 fixes). The build ran at HEAD `acfd8fc`.
- **Receipts:** `evidence/agy-port-20261106/attachment-queue-fairness-remediation-20261107/`:
  - `apk-audit-*-1.json`;
  - `sdk-tools-1.log` (zipalign, apksigner and aapt2 output);
  - `artifact-hashes-1.txt` and `bundle-markers-1.txt`.
- **Updated 2026-11-07 (C2 rebuild).** It replaces the C1 dataQa APKs, arm64 `4ff8d67e…8532` and x86_64 `e9ec1f09…7086` (receipts in `attachment-cleanup-remediation-20261107/`). Those replaced the P1/P2 dataQa APKs, arm64 `94c5d9ad…9a04` and x86_64 `9f04fb38…1183` (receipts in `clear-all-data-remediation-20261107/`). Those replaced the final-audit dataQa APKs, arm64 `2502aec3…89ba` and x86_64 `a0bf18e5…91f2` (receipts in `final-audit-remediation/`), which replaced the Phase 13 ones, arm64 `ef264311…7e19` and x86_64 `58470f2f…bfd5e`. Those files were overwritten and no longer exist on disk.

| File (under `android/app/build/outputs/apk/`) | Use | Bytes | SHA-256 |
|---|---|---|---|
| `dataQa/app-arm64-v8a-dataQa.apk` | **Phones.** Standalone (bundled JS, no Metro) | 163,257,936 | `ae0b4cc1c0222561fef6897db4eea0e83504f7db161cc026f06d2e3be09c789b` |
| `dataQa/app-x86_64-dataQa.apk` | Emulators only | 169,577,888 | `3f523ba79a05172c77c941476713d3d5bbfc6178d1b832aa5fa090f6cc229928` |
| `debug/app-arm64-v8a-debug.apk` | Development with Metro (unchanged since Phase 13; no packaged JS) | 159,718,559 | `0629c828072dfd5c3f8ab27e0f9838251965d78018dbf9ff32b2a0cc6d2b466e` |
| `debug/app-x86_64-debug.apk` | Development with Metro, emulator (unchanged) | 166,317,039 | `0756c1236c0a5f1942feb6de651acd470d71606825813629146e8f54d073d63a` |

**dataQa facts** (`aapt2`, `apksigner`, `zipalign`, `apk_audit.py`):

- Package `com.lafina.capstone`, versionCode 6, versionName `0.6.0-data-qa`, target/compile SDK 36, debuggable. The permission list is identical to the earlier builds.
- v2 signature: `CN=Android Debug`, certificate SHA-256 `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`.
- ONNX Runtime 1.22.0. All 16 native libraries have 16 KiB-aligned load segments, and ZIP alignment passes.
- Whisper `ggml-base.en-q5_1.bin` and `silero_vad.onnx` are present; no Kokoro.
- Packaged JS bundle SHA-256: `45c434ebef1d348dcfc68158cb9cfc18362565f347d78fa752da1963f74a789a`, built from `acfd8fc`. It contains the 8 C2 fix-only strings, does not contain the old timestamp selection order, and contains the C1, P1/P2 and F1 controls (`bundle-markers-1.txt`). C1: `9c284de8…b17b`; P1/P2: `09e25695…a199`; final audit: `f86e13af…bc67`; Phase 13: `e448f8ea…a91c`.

**Safe in-place update:**

1. Use only the arm64 dataQa APK on a phone.
2. Check its SHA-256 against the table above before installing.
3. Install with `adb install -r <apk>` or the on-phone installer, over an existing `com.lafina.capstone` that is signed by the same debug certificate. Data is kept.
4. If Android reports `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, stop. Never uninstall or clear data to get past it.
5. It installs over versionCode 6 or lower, never over a higher one.
6. Before updating, write down your task/event/note counts, one armed reminder and the account state. Compare them afterwards (M16).
7. This build is debuggable. Do not hand it out as a release.

Keep private data, credentials, audio and device serials out of any report you add.

| ID | Later concrete check | Expected result | Current status |
|---|---|---|---|
| M01 | Install a verified compatible target QA artifact on an explicitly authorized test phone; open existing synthetic records | App opens without Metro where claimed; preserved accounts/preferences/records and no migration reset | NOT_RUN |
| M02 | In airplane mode manually create/edit a task; restart and reopen | Durable record persists; failed storage shows recovery instead of success | NOT_RUN |
| M03 | Type/dictate a planner change; edit draft, Prepare, Cancel, then Prepare/Confirm twice | Cancel saves nothing; draft stays; one durable change after double Confirm | NOT_RUN |
| M04 | Create same-title items, request deletion/reschedule, and switch account while a review is open | Ambiguity is clarified; stale/other-owner review cannot mutate | NOT_RUN |
| M05 | Set a synthetic reminder; lock screen, let it ring, ACK then inspect task | Correct call/notification arrives under allowed permissions; ACK does not complete task | NOT_RUN |
| M06 | Test main-process death, reboot/unlock, Doze, timezone/time changes, permission revoke/restore and old notification buttons | Recovery is truthful; no duplicate/stale/wrong-owner actions; force-stop limits documented. Corrected 2026-11-06 (final audit F4): main-process death and explicit Force Stop are separate procedures with different expected results, see M18 R1-R3 | NOT_RUN |
| M07 | Select installed offline English voice, Preview/Stop/reset in airplane mode; simulate unavailable voice | Eligible speech audible with sane settings; owned cancellation; text/typing/recovery if unavailable | NOT_RUN |
| M08 | Start meeting recording; attempt dictation; stop/cancel, then reverse the contention order | Existing recording is not lost/stopped by contender; ownership releases only after native work returns | NOT_RUN |
| M09 | Import/record a synthetic lecture, pause/resume/stop/transcribe; exercise keepAudio and explicit online-summary consent | Chunk ordering/retention and meeting Notes/action items preserved; no silent upload | NOT_RUN |
| M10 | With controlled disposable accounts, guest-link then switch owners; inspect Chat/pages/attachments and edit conflicting Notes | Owned history preserved, no cross-owner access, rich content intact and conflict drafts retained | NOT_RUN |
| M11 | Test cross-midnight/timezone/recurring events and ICS; controlled sync push/pull through existing server | Correct local spans/reminders; existing payloads work; local-only metadata limitations explicit | NOT_RUN |
| M12 | With controlled live service access, exercise guest/student/student_pro/admin gates, online Chat/RAG toggles/citations, four document formats/share and entitled cloud speech fallback | Original role/mode/consent policies and routes remain working; failures don't fabricate answers/saves | NOT_RUN |
| M13 | Open Profile → Reminder Health, revoke/restore exact alarms in Android settings and return; Retry; save Event Defaults, Apply on a new event, Forget; acknowledge/snooze reminders and read On Time | Access rows refresh on return; counts and retry never claim a ring; defaults change a draft only on Apply; statistics match the records | NOT_RUN |
| M14 | In airplane mode open Profile → Offline Voice; choose a voice, change speed/pitch, Preview/Stop, Reset; try Preview during dictation and recording; remove the voice and Refresh; with a controlled Student Pro account compare Test TTS Voice online and offline; let a call ring during Preview | Default sounds as before; only installed offline English voices; Preview audible and stoppable; busy states refused; missing voice falls back with a notice; cloud and offline fallback unchanged; the call takes priority | NOT_RUN |
| M15 | Audit A1-A4: in airplane mode with an offline English voice a reminder call speaks; disable the voice, Refresh Offline Voice (speech off, Preview disabled) and let a call ring (text only); reinstall and confirm speech returns; save Event Defaults then Clear All Data (no defaults offered, offline voice kept); ~~retire a reminder by sync, background and force-stop at once, wait for the old time~~ corrected 2026-11-06 (final audit F4): the reminder part is replaced by M18 R1-R3 (Force Stop cancels the alarm itself on Android 15, so it cannot probe the residual) | Speech only with a confirmed voice; text otherwise; defaults forgotten; ~~the force-stop case may still ring (documented residual, ADR-023) and is dismissed on open~~ for the reminder part see M18 R1-R3 | NOT_RUN |
| M16 | Phase 11: note task/event/note counts and one armed reminder; adb install -r the arm64 ONNX 1.22.0 dataQa APK (sha256 ef264311...e19; updated 2026-11-06: use the final-audit rebuild 2502aec3...89ba; updated 2026-11-07: use the remediation-audit rebuild 94c5d9ad...9a04; updated again 2026-11-07: use the C1 rebuild 4ff8d67e...8532; updated again 2026-11-07: use the C2 rebuild ae0b4cc1...789b from the table above) over the existing debug-signed app (never uninstall/clear); airplane mode launch; push-to-talk dictation (VAD); meeting record/stop; reminder call on a locked screen; optionally a 16 KiB-page image | Launch without Metro; counts unchanged; dictation and VAD work; recording saved; call rings; INSTALL_FAILED_UPDATE_INCOMPATIBLE means stop | NOT_RUN |
| M17 | Phase 12 (optional): on an owner-designated AVD with no needed data, run scripts/emulator_qa.py with the x86_64 ONNX 1.22.0 APK and its receipt; then the listed manual steps (planner Cancel/Confirm/untimed/delete, Chat paging, Notes search, locked-screen reminder call, online/document/meeting screens with network on); npm run doctor on the owner shell | Every gate PASS before install; offline launch without Metro; manual steps behave as before; doctor names any wrong JDK | NOT_RUN |
| M18 | Final audit F1-F4 (see the section below): (a) Profile -> Offline Voice with a saved speed, press Preview then at once Stop, close the sheet, or press Home, before speech starts; (b) press Preview then immediately start dictation, or start a meeting recording, or sign out / switch account; (c) Clear All Data normally; (d) reminder procedures R1, R2 and R3 below, each separately | (a, b) no Preview audio after Stop/close/Home or once the microphone, a recording or another account is active; a valid Preview still plays and stops; (c) "Data Cleared" and a new event draft offers no defaults; the failure wording is host-tested only; (d) as stated per procedure | NOT_RUN |
| M19 | Remediation audit P1/P2 (2026-11-07, [clear-all-data-remediation.md](clear-all-data-remediation.md)), on a designated test phone or emulator with a synthetic account only (never your real account): (a) Profile -> Clear All Data, leave the confirmation open, then without answering it sign out (or switch account, or sign out and back in as the same account) so a confirmation from the old sign-in is still on screen if Android keeps it, and press Delete Everything; (b) open Clear All Data again on the now-signed-in synthetic account and confirm; (c) the read/write/attachment failure cases | (a) "Not Cleared" and nothing deleted: notes, tasks, events, reminders, calendar blocks, chat and its document files, and event defaults are all still there (if Android dismisses the dialog on sign-out, record that the stale case could not be reached on device); (b) "Data Cleared", everything for that account gone, offline voice, theme and time format kept, armed reminders for it no longer ring, other accounts' data untouched; (c) host-tested only, no device fault injection exists. *Added 2026-11-07 (clear-data audit C1, [attachment-cleanup-remediation.md](attachment-cleanup-remediation.md)):* (d) on the synthetic account, ask Chat for a document (online, entitled), then Clear All Data: "Data Cleared" and the document gone; open Clear All Data again: still "Data Cleared", nothing left. A failed removal, a restart between steps and the retry are host-tested only: a stock phone cannot force an unlink failure. *Added 2026-11-07 (attachment-cleanup audit C2, [attachment-queue-fairness-remediation.md](attachment-queue-fairness-remediation.md)):* (e) on the C2 build, repeat (d) and check that the result still says "Data Cleared" and the document is gone. Several documents in one Clear All Data should also all be removed. Fair progress behind more than 50 persistently failing files, unsaved-progress reporting, overlapping presses and restart recovery are host-tested only: they need forced failures a stock phone cannot produce, and the host restart tests are not Android process-death tests | NOT_RUN |

## Final audit follow-up (2026-11-06): reminder interruption procedures

Added by [final-audit-remediation.md](final-audit-remediation.md) for audit F4. These replace the earlier "force-stop during a reconcile" wording in M06 and M15. Run each procedure separately, on a designated test phone or emulator only, with synthetic reminders. Every procedure is **NOT_RUN**.

**R1. Ordinary process death during reconciliation (the ADR-023 residual).**

1. Arm a synthetic reminder 5 minutes out.
2. Retire it. A sync that deletes or reschedules it is the case that matters; a local delete is the control.
3. Immediately send the app to the background. Then end the process **without Force Stop**, using the debuggable dataQa build:
   - `adb shell am kill com.lafina.capstone` (kills it only if Android considers it safe to kill), or
   - `adb shell run-as com.lafina.capstone kill -9 <pid>`, with the pid from `adb shell pidof com.lafina.capstone`.
4. Do not reopen the app. Wait for the old time, then open the app.

**Expected:**

- The retired reminder **may ring once** if the process died after the SQLite commit but before the native cancel. This is the documented residual, not a pass or a fail.
- Opening the app dismisses or refuses it and cancels it.
- Write down whether it rang.

The window is short, and a manual kill usually lands outside it. A "no ring" therefore does **not** show the window is closed. Proving that needs ADR-023's QA fault-injection point, which is not built.

**R2. Explicit Force Stop (a separate Android condition).**

1. Arm a synthetic reminder 5 minutes out. Leave it valid.
2. Use Settings → Apps → LAFINA → Force stop, or `adb shell am force-stop com.lafina.capstone`.
3. Do not open the app. Wait past the time.

**Expected:**

- On Android 15 and later, nothing rings while the app is force-stopped. The app is in the stopped state and Android has cancelled its pending intents, alarms included ([Android 15 enhanced stop states](https://developer.android.com/about/versions/15/behavior-changes-all#enhanced-stop-states)).
- LAFINA promises no delivery in this state and does not try to bypass it.
- On older Android versions, record what you observe.
- Do **not** use Force Stop to probe R1: it cancels the alarm itself, so a "no ring" there is a misleading pass.

**R3. Relaunch and re-registration recovery.**

1. After R1 or R2, open the app by tapping its icon (the user action that leaves the stopped state).
2. Look at Profile → Reminder Health and the Calendar.

**Expected:**

- Still-valid future reminders are registered again and ring at their time.
- A retired reminder is not registered again.
- Record how a reminder whose time passed while the app was stopped is shown. Late delivery is not promised.

Live/disposable credentials and actual subscription transactions are not authorized by the unattended implementation prompt. M10–M12 live portions need a separately controlled later environment. Coding/testing with synthetic adapters can proceed now without claiming these passes.
