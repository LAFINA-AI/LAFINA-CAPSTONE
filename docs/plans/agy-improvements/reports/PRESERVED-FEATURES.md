# Preserved AGY features

Run `agy-port-20261106`. Baseline HEAD `b9433dc` plus the characterization suite `__tests__/preservation/agyPreservedContracts.test.ts`. Fake cloud adapters are contract evidence, never live results. Device and live columns stay NOT_RUN until someone actually observes them.

Baseline command: `npx jest --runInBand` gave 16 suites and 194 tests, all passing (163 pre-existing plus 31 characterization). Native baseline: 14 Kotlin unit tests pass and debug APKs build, using JDK 17 and an `X:` alias of this checkout. Evidence: `evidence/agy-port-20261106/phase-00/`.

| PF ID | Feature | Baseline tests/result | Seams the port touches | Final tests/result | Device/live status |
|---|---|---|---|---|---|
| PF01 | Accounts and guest onboarding | PASS: `phase01Storage`, `phase01AuthAndProfileScreens` | `userStore`, `database`, startup | Pending | NOT_RUN |
| PF02 | Tiers and entitlements | PASS: preservation PF02 matrix, `phase05` speech gating, `phase09` meetings | `entitlements`, Profile | Pending | NOT_RUN |
| PF03 | Guest linking | PASS: preservation PF03 (rekey, outbox rebuild, rollback), `phase02` | `guestMigration` | Pending | NOT_RUN |
| PF04 | Seven-type cloud sync | PASS: preservation PF04 (frozen payload fields, batch envelope, ack); `syncWorker` had no direct test before this run | `syncWorker`, outbox | Pending | NOT_RUN |
| PF05 | Offline and online Chat routing | PASS: preservation PF05 (all 16 intents with network sentinel), `phase07`, `phase08` | `actionExecutor`, `chatOrchestrator` | Pending | NOT_RUN |
| PF06 | Handbook RAG and citations | PASS: `phase10`, preservation PF06 | Chat UI, `chatStore` | Pending | NOT_RUN |
| PF07 | Documents and attachments | PASS: `phase09`, preservation PF07 | `chatStore`, `chatFiles` | Pending | NOT_RUN |
| PF08 | Meetings and consent | PASS: `phase09` (keepAudio, consent, import) | `LafinaMicrophoneLease`, meeting module | Pending | NOT_RUN |
| PF09 | Whisper/system/online speech | PASS: `phase05`, `phase06`, `ttsService`, preservation PF09 | `ttsService`, STT module | Pending | NOT_RUN |
| PF10 | UI/navigation/settings | PASS: `phase01ThemeAndTour`, `phase02CalendarAndNotesScreens`, `App.test` | Chat, Calendar, Notes, Profile screens | Pending | NOT_RUN |
| PF11 | Reminder calls and identity | PASS: `phase03`, `callDispatcherAndCallScreen`, preservation PF11 | reminder native module, poller | Pending | NOT_RUN |
| PF12 | Data/error/privacy recovery | PARTIAL: rollback covered by PF03; a production no-op storage fallback is a known defect that AGY-PORT 01 fixes | `database`, `dbInit` | Pending | NOT_RUN |
| PF13 | Android/native/update identity | PASS: preservation PF13 (static identity checks) | `build.gradle`, manifest | Pending | NOT_RUN |

## Per-phase results

| Phase | Tested state | PF results (host automation) | Notes |
|---|---|---|---|
| 01 | 5f0ac39 + worktree, committed 8ab83b2 | PF01-PF04, PF07, PF08, PF12 PASS; PF12 no-op storage fallback fixed | preflight 248 |
| 02 | 8ab83b2 + worktree, committed aec3703 | PF01-PF07, PF10, PF12 PASS | Intentional: pre-upgrade shared Chat history is quarantined when ownership is ambiguous. preflight 279 |
| 03 | aec3703 + worktree | PF01-PF04, PF09, PF11-PF13 PASS | Intentional: a snooze is saved and retried when Android rejects the alarm; boot restore skips alarms more than 15 minutes late. Jest 316, Kotlin 24, debug build PASS. Instrumentation compiled once, before the review follow-up changed `LafinaReminderModule.kt` |
