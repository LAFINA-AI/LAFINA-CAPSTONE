# Manual acceptance — NOT RUN

Implementation run `agy-port-20261106` is finished (PARTIAL, see SUMMARY.md). **Every check below is NOT_RUN.** No phone, emulator or live service was used in this run.

## Artifacts produced (build outputs; not committed)

These APKs are on the build machine only.

- **Built from:** branch `codex/agy-preservation-improvements`. The app code is identical at `a152bcb` and at the final HEAD.
- **Receipts:** `evidence/agy-port-20261106/phase-13/` (`apk-audit-final-*-1.json`, `sdk-tools-final-1.log`, `artifact-hashes-final-1.txt`).

| File (under `android/app/build/outputs/apk/`) | Use | Bytes | SHA-256 |
|---|---|---|---|
| `dataQa/app-arm64-v8a-dataQa.apk` | **Phones.** Standalone (bundled JS, no Metro) | 163,257,936 | `ef264311182ce10299b2b87a281af7c628b9824e67d45710dc2c1fa349e87e19` |
| `dataQa/app-x86_64-dataQa.apk` | Emulators only | 169,577,888 | `58470f2f9d4ba972e43af6da32839d708aace5124c36703759e6603a699bfd5e` |
| `debug/app-arm64-v8a-debug.apk` | Development with Metro | 159,718,559 | `0629c828072dfd5c3f8ab27e0f9838251965d78018dbf9ff32b2a0cc6d2b466e` |
| `debug/app-x86_64-debug.apk` | Development with Metro, emulator | 166,317,039 | `0756c1236c0a5f1942feb6de651acd470d71606825813629146e8f54d073d63a` |

**dataQa facts** (`aapt2`, `apksigner`, `zipalign`, `apk_audit.py`):

- Package `com.lafina.capstone`, versionCode 6, versionName `0.6.0-data-qa`, target/compile SDK 36, debuggable.
- v2 signature: `CN=Android Debug`, certificate SHA-256 `acf890c33d9f7252cca541e5c60166fdf49d47b28313bf678bebb8fb0f62dd5e`.
- ONNX Runtime 1.22.0. All 16 native libraries have 16 KiB-aligned load segments, and ZIP alignment passes.
- Whisper `ggml-base.en-q5_1.bin` and `silero_vad.onnx` are present; no Kokoro.
- Packaged JS bundle SHA-256: `e448f8ea…a91c`.

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
| M06 | Test main-process death, reboot/unlock, Doze, timezone/time changes, permission revoke/restore and old notification buttons | Recovery is truthful; no duplicate/stale/wrong-owner actions; force-stop limits documented | NOT_RUN |
| M07 | Select installed offline English voice, Preview/Stop/reset in airplane mode; simulate unavailable voice | Eligible speech audible with sane settings; owned cancellation; text/typing/recovery if unavailable | NOT_RUN |
| M08 | Start meeting recording; attempt dictation; stop/cancel, then reverse the contention order | Existing recording is not lost/stopped by contender; ownership releases only after native work returns | NOT_RUN |
| M09 | Import/record a synthetic lecture, pause/resume/stop/transcribe; exercise keepAudio and explicit online-summary consent | Chunk ordering/retention and meeting Notes/action items preserved; no silent upload | NOT_RUN |
| M10 | With controlled disposable accounts, guest-link then switch owners; inspect Chat/pages/attachments and edit conflicting Notes | Owned history preserved, no cross-owner access, rich content intact and conflict drafts retained | NOT_RUN |
| M11 | Test cross-midnight/timezone/recurring events and ICS; controlled sync push/pull through existing server | Correct local spans/reminders; existing payloads work; local-only metadata limitations explicit | NOT_RUN |
| M12 | With controlled live service access, exercise guest/student/student_pro/admin gates, online Chat/RAG toggles/citations, four document formats/share and entitled cloud speech fallback | Original role/mode/consent policies and routes remain working; failures don't fabricate answers/saves | NOT_RUN |
| M13 | Open Profile → Reminder Health, revoke/restore exact alarms in Android settings and return; Retry; save Event Defaults, Apply on a new event, Forget; acknowledge/snooze reminders and read On Time | Access rows refresh on return; counts and retry never claim a ring; defaults change a draft only on Apply; statistics match the records | NOT_RUN |
| M14 | In airplane mode open Profile → Offline Voice; choose a voice, change speed/pitch, Preview/Stop, Reset; try Preview during dictation and recording; remove the voice and Refresh; with a controlled Student Pro account compare Test TTS Voice online and offline; let a call ring during Preview | Default sounds as before; only installed offline English voices; Preview audible and stoppable; busy states refused; missing voice falls back with a notice; cloud and offline fallback unchanged; the call takes priority | NOT_RUN |
| M15 | Audit A1-A4: in airplane mode with an offline English voice a reminder call speaks; disable the voice, Refresh Offline Voice (speech off, Preview disabled) and let a call ring (text only); reinstall and confirm speech returns; save Event Defaults then Clear All Data (no defaults offered, offline voice kept); retire a reminder by sync, background and force-stop at once, wait for the old time | Speech only with a confirmed voice; text otherwise; defaults forgotten; the force-stop case may still ring (documented residual, ADR-023) and is dismissed on open | NOT_RUN |
| M16 | Phase 11: note task/event/note counts and one armed reminder; adb install -r the arm64 ONNX 1.22.0 dataQa APK (sha256 ef264311...e19) over the existing debug-signed app (never uninstall/clear); airplane mode launch; push-to-talk dictation (VAD); meeting record/stop; reminder call on a locked screen; optionally a 16 KiB-page image | Launch without Metro; counts unchanged; dictation and VAD work; recording saved; call rings; INSTALL_FAILED_UPDATE_INCOMPATIBLE means stop | NOT_RUN |
| M17 | Phase 12 (optional): on an owner-designated AVD with no needed data, run scripts/emulator_qa.py with the x86_64 ONNX 1.22.0 APK and its receipt; then the listed manual steps (planner Cancel/Confirm/untimed/delete, Chat paging, Notes search, locked-screen reminder call, online/document/meeting screens with network on); npm run doctor on the owner shell | Every gate PASS before install; offline launch without Metro; manual steps behave as before; doctor names any wrong JDK | NOT_RUN |

Live/disposable credentials and actual subscription transactions are not authorized by the unattended implementation prompt. M10–M12 live portions need a separately controlled later environment. Coding/testing with synthetic adapters can proceed now without claiming these passes.
