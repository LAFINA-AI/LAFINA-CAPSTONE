# Independent audit — Phase 00 through Phase 07.1 (incl. Nol-branch integration)

**Auditor:** Claude (independent engineering audit; no prior involvement in this code)
**Audit date:** 2026-10-27 Asia/Manila (2026-10-26 21:20–22:15 UTC)
**Audited baseline:** `codex/phase-07-1-nol-ui` @ `a186bfceeb05db038bb0b7a2a35b6fe17d1fab62`, working tree clean
**Incoming reference:** `origin/Nol-branch` = `origin/main` = `9c183a20eca2377b5e54f219c5f83460b18af81b` (unchanged at audit time)
**Scope boundary:** read/verify only. No application source, test, dependency, branch, remote, emulator or legacy-repository change. Phase 08 was read only to understand its boundary.

**Independent verdict: PASS WITH CONDITIONS.** No blocking defect was found. The Nol integration is substantively correct: incoming
presentation was adapted onto the reviewed offline core, and nothing that the project requires was lost. Two Medium items need the owner's attention (one note-privacy defect and one repository-custody risk). Physical-device validation is still outstanding.

`STATUS: AWAITING DEVICE VALIDATION`

---

## 1. Actual state, environment and access

| Item | Observed |
|---|---|
| Branch / HEAD | `codex/phase-07-1-nol-ui` / `a186bfc` "feat: align Nol student UI with confirmed local services" — matches the handoff |
| Working tree | Clean. The Windows index matches HEAD. All 724 tracked files have mtimes no later than the index write, the `android/` tree is stat-identical to the index, and no unignored untracked files were found. Separately, 290/290 frozen source hashes and four re-staged disk files match. |
| Post-handoff activity | Only `.git/refs/codex/turn-diffs/checkpoints/...`, a Codex tool snapshot ref created 21:20:58Z, about two minutes before this audit started. It is not a working-tree change. |
| Remote | `origin` = `https://github.com/LAFINA-AI/LAFINA-CAPSTONE.git`. The audited branch has no upstream configured. |
| Fresh remote metadata | `git ls-remote …` at 2026-10-26T21:24:10Z: `main`, `Nol-branch`, `agy-development-cont` and `HEAD` all = `9c183a2`. Tags v0.1.0–v0.5.0 are present. `git fetch origin main Nol-branch` ran only in the audit copy and found no new commits. |
| Not on the remote | `0d06b24`, `ac6ea2a`, `589508d`, `a186bfc` and every `codex/*` branch exist **only** on the owner's machine (see AUD-02). |
| Local `main` | `b3eefb8` (v0.2.0). Local `origin/main` was last fetched at `9c183a2`. |
| Legacy repository | The checkout at `…\LAFINA\LAFINA` has HEAD `abb35ac5` on `main`, the same value recorded in Phase 00. Nothing was written to it. Pinned `f7e70aec` could not be re-verified (GitHub API not enabled in this session). Its `.env` and `lafina.db` were not opened. |
| Audit execution host | Anthropic cloud Linux container, 2 vCPU / 8 GiB. Node **24.19.0** and npm **11.17.0** were installed to match the project's `engines`. `npm ci --ignore-scripts` ran from the unchanged lockfile. |
| Access method | `.git` packs, refs and index, plus selected files, were staged **read-only** from the Windows checkout. The rebuilt repository passed `git fsck --connectivity-only`. |
| Windows/emulator execution | **NOT RUN.** This session had no device shell, and computer use treats terminals/IDEs as click-only. The emulator window could not be resolved as an app, so no Gradle, adb, Windows `npm run doctor` or emulator interaction took place, and no emulator data, settings, radios or microphone were touched. Details: [not-run ledger](evidence/claude-phase-07-audit-not-run.json). |

Evidence: [repository state and ancestry](evidence/claude-phase-07-audit-repo-state.txt).

## 2. Progress timeline (Phase 00 → 07.1 follow-up)

| Phase / commit | Implemented | Reuse vs rewrite | Automated gates (historical) | Emulator | Physical |
|---|---|---|---|---|---|
| 00 (`e43e38b` → `ad75d8e`) | Read-only legacy audit and blueprint; 56/56 handoff hashes | Legacy read via GitHub at pinned `f7e70ae` | Doc checks | none | none |
| 01 (`ad75d8e`, v0.1.0) | Anonymous onboarding, local preferences, theme | Rewritten; selected styling only | 19 tests / 3 suites | API37 smoke, large text | pending |
| 02 + 03 (`b3eefb8`, v0.2.0) | One SQLite DB, planner domain, paired reminder/job transactions; native AlarmManager runtime, isolated `:reminders` process, simulated call screen | Rewritten; legacy alarm logic consulted only | 108/7 → 156/11 JS; 30 JVM | Rings, ACK, reboot, denial paths | pending |
| 04–07 (developed uncommitted, checkpointed in `0d06b24`) | 04 manual planner/calendar; 05 system TTS; 06 hold-to-talk STT (on-device recognizer + optional Whisper Tiny); 07 deterministic grammar and private expiring review/confirm | Whisper.cpp vendored with a source manifest; parser written fresh | 208/16 → 263/20 → 308/24 → 453/27 JS; 62 JVM; 42 instrumentation | Create/move/query/refusal, named ringing ACK, TTS Stop, draft copy | pending |
| 07.1 integration (`ac6ea2a` merge, `589508d` docs) | `git pull --no-ff origin main` produced 73 conflicts. Checkpoint restored; month grid, rounded tabs, theme and logo adapted | Incoming app **not** adopted | 464/28 JS; 62 JVM; 42 instrumentation; builds | Upgrade-preservation and refusal cases | pending |
| 07.1 Nol UI (`a186bfc`) | Chat/Calendar/Notes/Profile dock with central mic; Week/Month calendar and hourly timeline; local Notes (schema 3); persisted 12/24h and week start; `react-native-svg` | Nol compositions re-implemented on the existing services | 520/34 JS; AST 61 modules; 62 JVM (task actually ran in the initial build); 44 instrumentation; 7 APKs | Notes CRUD, dirty guards, Light screenshots, font 1.3 reachability | pending |

The first integration kept the reviewed core and adopted only presentation (3 non-document code paths changed against the checkpoint). The follow-up replaced the shell UI, added Notes/schema 3 and the SVG dependency, and made the native reader accept schema 3. Historical reports for Phases 00–07 were never rewritten: every later change to `docs/reports` or `docs/benchmarks` is a pure addition.

## 3. Git ancestry, content verification and Nol reconciliation

**Ancestry (verified):**
- `ac6ea2a` has parent 1 = `0d06b24` (the checkpoint) and parent 2 = `9c183a2` (incoming). Merge base is `b3eefb8`. `b3eefb8..9c183a2` contains 12 commits by NBlancs, matching the report.
- `9c183a2` is an ancestor of HEAD. The earlier "Already up to date" pull result is therefore true, but only in the ancestry sense.
- `0d06b24..ac6ea2a` touched 59 files. Outside documents and evidence, only `CalendarMonth.test.tsx` (+153), `android/app/build.gradle` (version), `theme.ts`, `App.tsx`, `PlannerScreen.tsx`, `CalendarMonth.tsx`, `calendarMonthModel.ts`, the logo, `check-architecture.mjs` and `package*.json` (version) changed. No domain, storage, command, Kotlin or C++ content changed, which confirms the report.
- `9c183a2..ac6ea2a`: 1,685 files and 341,730 deletions. All 141 incoming `src/` files are absent from HEAD. **Merge ancestry therefore says nothing about retained functionality**; the table below covers that.
- `ac6ea2a..589508d`: 3 documentation/evidence files.
- `589508d..a186bfc`: 100 files. Core/native changes are limited to `notes.ts`, `notesRepository.ts`, `openNotes.ts`, `plannerDatabase.ts` (schema 3), `preferences.ts`, `runPlannerSqlChecks.ts`, `theme.ts`, `Icon.tsx` and a one-line `ReminderStore.kt` gate (`version !in 2..3`).
- No conflict markers anywhere in HEAD. **No test file was removed** relative to the checkpoint. Static `it/test` count went 282 → 329 and Kotlin `@Test` 105 → 107. The incoming branch had deleted `ReminderStoreTest`, `ReminderIntentsTest` and 13 JS suites; all are present at HEAD.
- No `lafina.db` or schema 17 reference, no `fetch()` and no URLs in current `src/`. No duplicate entry point (root `index.js` → `src/app/App`), second database, second theme provider or JS poller or scheduler.
- The incoming defect probes were re-run fresh against the pinned `9c183a2` objects. Every probe and assertion matched the recorded cohorts ([data](evidence/claude-phase-07-audit-incoming-data-probes-rerun.json), [native](evidence/claude-phase-07-audit-incoming-native-probes-rerun.json)).

**Incoming-feature reconciliation** (all 1,417 changed paths classified in [reconciliation JSON](evidence/claude-phase-07-audit-incoming-reconciliation.json)):

| Incoming feature / path | Integration decision | Current implementation | Preserved functionality | Deliberate exclusions | Regression or unexplained omission | Evidence |
|---|---|---|---|---|---|---|
| `src/storage/*` (`lafina.db` schema 17, 26 files) | Excluded | `lafina-capstone.sqlite` schema 3 (`plannerDatabase.ts:170-238`) | Tasks/events/reminders/settings on the existing DB | Second DB, sync outbox, behaviour store, guest migration | None. Note the manual's "different package" claim is wrong (AUD-03) | ADR-021; data probes re-run |
| `src/scheduler/*`, `Lafina*Reminder*`, `ReminderAlarm/BootReceiver` | Excluded | Native `reminders/*` runtime with generations and fencing | Durable alarms, ACK ≠ completion, reboot restore | SharedPreferences scheduler, JS poller, call dispatcher | None (incoming hash collision and negated-ACK defects reproduced) | native probes; `reminderOperations.ts` |
| `src/ai/*`, `LafinaSpeechToText`, `LafinaAudioPlayer`, Silero/Base.en | Excluded | Phase 05/06 system TTS and STT; Whisper Tiny | Hold-to-talk, editable draft, offline TTS | Gemini cloud TTS, ONNX/VAD, Base.en model | None | APK model sha `818710…` = manifest |
| `VoiceModal`, `IncomingCallScreen`, `CallAnsweredView` | Excluded | `SpeechInputPanel` → composer → Send → review → Confirm; native `ReminderActivity` | Voice entry and call UI | Direct voice mutations | None | probes §6 |
| `CustomTabBar`, `ui/theme/*`, `ThemeContext` | Adapted | `StudentTabBar.tsx`, single `theme.ts` | 4 tabs + central mic, light/dark | Second theme provider | Dark Send contrast (AUD-05) | screenshots |
| Calendar `MonthView`/`WeekView`/`DayView`, `timeGridLayout` | Adapted | `CalendarHeader`/`Month`/`Week`, `DayTimeline`, `calendarTimeline.ts` (overlap layout credited) | Month/Week, date strip, to-scale day timeline, add menu | ICS import | **Undocumented omissions:** time blocks, Philippine-holiday layer and calendar layers, overdue section, quick task checkbox (AUD-06) | `calendarTimeline.test.tsx` |
| Notes screens, `noteMarkdown`, `richText`, `noteEditing` | Re-implemented | `features/notes/*`, `notesRepository.ts` | CRUD, search, pin, 2 categories, compact toggle | Images/camera, voice-transcribed flag | **Undocumented:** rich text/checklists, tags, custom categories, drag reorder (AUD-06). **Privacy defect** in delete (AUD-01) | probes `notes:*` |
| Profile (`ProfileStats`, `avatarFile`, `PrivacyModal`, `AppUpdateItem`, `StudentProTag`) | Adapted | `ProfileScreen.tsx` with real `COUNT(*)` | Identity, counts, settings rows, two persisted switches | Camera avatar, updater, Pro | None | `ProfileScreen.test.tsx` |
| Auth, Welcome, Login, Register, `cloud/*`, `sync/*`, `updates/*` | Excluded by scope | n/a | n/a | Accounts, sync, self-update | None (forbidden scope) | AGENTS.md |
| Splash (`SynthSplash`), `ProductTour`, theme-reveal module, launcher mipmaps | Not adopted | Existing vector launcher icon | n/a | — | **Undocumented** (cosmetic) (AUD-06) | reconciliation JSON |
| Manifest INTERNET/FGS/WAKE_LOCK, `patch-android-libs`, CI patch | Not adopted | Restricted manifest; release APK has no INTERNET | Offline-only permissions | Network permissions | None (the CI patch was for incoming `react-native-tts`) | APK inspection |
| Incoming tests and docs (phase rewrites, AGENTS scope change to accounts/cloud/SmolLM2/Gemini) | Not adopted | Owner AGENTS.md and phases unchanged since `b3eefb8` | Governance retained | Conflicting scope | Remote `main` still carries the conflicting scope (AUD-02) | `git diff b3eefb8 HEAD -- AGENTS.md phases` = empty |
| Vendor `whisper.cpp` (1,129 paths, add/add conflicts) | Kept reviewed copy | Phase 06 vendor tree and `SOURCE-MANIFEST.json` | Offline STT | Incoming vendor revision | None | 16 KiB ELF check |

Classification summary: **adapted and functioning** for calendar, navigation, profile and theme; **preserved through an equivalent existing implementation** for alarms, STT, TTS, preferences, JNI and vendor code; **intentionally excluded** for accounts, cloud, sync, updater, schema 17, Silero/Base.en, direct voice actions and network permissions; **deferred and honestly presented** for import/export, handbook and camera; **omitted without documentation (not broken)** for time blocks, holidays/layers, rich-text notes/tags/reorder, splash/tour and the launcher icon set. Nothing required by the capstone was found accidentally omitted or broken.

## 4. Requirements verification

| Requirement | Verdict | Source | Evidence |
|---|---|---|---|
| Anonymous offline setup and preferences | Met | `App.tsx:414-437`, `preferences.ts:157-195` (old snapshots default to 24h/Monday) | App tests; fresh preflight |
| Manual tasks, events, calendar, scheduling | Met | `PlannerScreen.tsx`, `plannerQueries.ts:347-376` (half-open windows, recurrence) | 520/34 PASS |
| Durable native reminders, simulated call UI | Met in code; delivery not re-tested | `reminderOperations.ts:80-199`, `ReminderReceiver.kt`, `ReminderStore.kt:345-346` | Historical 44 instrumentation (not fresh) |
| ACK = received, not completed | Met | `reminderOperations.ts:159-161` (task untouched); `commandSession.ts:423-436` | probe and session tests |
| Hold-to-talk offline STT with editable review | Met in code | `SpeechInputPanel.tsx:166-167` (pressIn/pressOut), `:93-100` copies the draft only; `SpeechInput.kt:130` on-device factory | Speech imports never touch the repository |
| System offline-capable TTS default | Met in code | `SystemSpeech.kt:249-250` (rejects network/not-installed voices) | Audibility NOT RUN |
| Deterministic, validated offline commands | Met | `parseIntent.ts:129-148`, `intents.ts:121-238`, `commandSession.ts:518-599` | 33 probes; 64/64 regression |
| Text/manual fallback | Met | Chat never gates Calendar; `reconcilePlanner.ts` keeps commits on native failure | App tests |
| One SQLite DB, migrations, transactions | Met | `openLocalDatabase.ts:14-31` (DELETE journal), `plannerDatabase.ts:16-54,185-240` | migration tests; schema 2→3 preservation |
| Central light/dark theme, strict typing, modular boundaries | Met (one contrast gap) | `theme.ts`, `tsconfig.json` strict + `noUncheckedIndexedAccess` | AST 61 modules, no cycles |
| Forbidden scope absent (accounts, cloud, wake word, Kokoro, keys) | Met | No cloud/auth modules or URLs in `src/`; release permissions below | Secret scan: 0 real hits |

Release APKs (ARM64/x86_64) contain POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM, USE_FULL_SCREEN_INTENT, RECEIVE_BOOT_COMPLETED, VIBRATE and RECORD_AUDIO, with **no INTERNET**, `allowBackup=false`, and are not debuggable. Debug adds INTERNET and SYSTEM_ALERT_WINDOW for Metro, as documented. [APK inspection](evidence/claude-phase-07-audit-apk-inspection.json).

### Command and speech safety trace (§6 of the brief)

The full path is: typed text or the copied speech draft → `ChatScreen.send` → `session.submit` → `parseIntent` → `validateIntent` → `prepare`. `prepare` only builds a private `Pending` with a closure and returns a review; nothing is written. `Confirm change` → `session.confirm(review.id)`, which re-checks the 5-minute expiry, timezone, default lead, intent validity, future time, the exact target id and version, and the ringing reminder's id/version/generation/occurrence before running the versioned, idempotent repository call.

The following were all verified in code and/or by fresh probes:
- Editing the composer (`ChatScreen.tsx:124-128`), backgrounding (`:100-105`), starting a capture (`:397-403`), any new submit (`commandSession.ts:491`), Discard, and dispose each invalidate the pending review.
- Forged review ids and confirmations after dispose do not write.
- Duplicate confirms return the cached result, so there is one receipt and one task.
- A stale target version refuses with no write.
- Exact-title targeting uses `trim(title)=? COLLATE NOCASE`, not LIKE. Two items with the same title refuse.
- Failed transactions keep the review and show "could not be confirmed". Native reconcile failures never undo a commit.

Adversarial results ([probe results](evidence/claude-phase-07-audit-probe-results.json)): "Friday", "Remind me later", "Okay but remind me later", "Change it", "Delete all tasks", compound and negated commands, bare hours, 25:00, weekdays, raw JSON, DST gap and fold all clarify or refuse. Bare "acknowledge" parses but `prepare` refuses without a named target.

Gaps:
- "No, delete task …" returns *unsupported*, but only because of the comma; there is no general handling of "no" as negation. This is safe because every mutation still needs review.
- The Chat review summary always shows 24h plus ISO time and ignores the 12h preference. That is acceptable as a canonical review format.
- Grammar confidence is documented as an acceptance flag, not a probability (`intents.ts:117-119`).

Corpus methodology is sound and honest. The first held-out result (62/64) is kept; 64/64 is labelled regression. The corpus is 64 synthetic English cases, so claims are corpus-limited.

### Storage, migrations and reminders (§7)

Schema 3 is confirmed. Migration from version 0/1/2 runs in one `BEGIN IMMEDIATE` transaction. `user_version` is committed together with the DDL. A failed rollback quarantines the connection (`plannerDatabase.ts:39-50`). Future versions throw without being rewritten (`:195-197`). The native reader accepts versions 2–3 and requires the DELETE journal mode. JS and native reads ignore the extra preference keys (`ReminderStore.kt:373-378`).

Notes behaviour:
- Validation: title 1–160 code points, body ≤10,000.
- Search: `LIKE … ESCAPE '\'` with escaped wildcards (probe confirms `%` and `_` are literal), parameterised values, limit+1 paging and `offset ≤ 100000`.
- Updates and deletes check the version inside the transaction. Receipts are token-fingerprinted.

Reminder state: `RING` needs a matching generation and PENDING/SCHEDULED status. ACK and snooze enforce the persisted 60 s response window (a late ACK becomes MISSED). Cancel/set bump the generation, and ACKNOWLEDGED/MISSED occurrences are not replayed after edits.

Not re-tested here: native duplicate broadcasts, process death, reboot, time changes, force-stop and permission loss. The code paths exist (`ReminderReceiver.kt`, generation-fenced `UPDATE … WHERE generation=?`), but evidence for them is historical emulator and instrumentation only. **A saved record or registered alarm is not proof of delivery.**

Hardening note, not a defect: `initializePlannerDatabase` reads `user_version` before `BEGIN`. The race needs two migrating connections. In production there is one JS connection and native never migrates, so it cannot occur today.

## 5. Confirmed findings (most severe first)

### AUD-01 — Medium — Deleting a note does not remove its text; the UI says it does
- **Requirement:** F-017 (inspect/delete local notes), AGENTS privacy rules ("no silent retention of private content"), and the user-facing honesty rule.
- **Type:** Confirmed defect (user-facing claim) plus privacy risk.
- **Where:** The delete dialog in `src/features/notes/NotesScreen.tsx:197-201` says "This removes the saved note…". `src/core/storage/notesRepository.ts:272-279` only sets `deleted_at` and keeps `title`/`body`. `notesRepository.ts:124-128` stores the **full returned note** (title and body) in `operation_receipts.result` for every create and update (`:213-235`, `:245-265`).
- **Reproduction:** Create a note with the body `SECRET-CANARY-v1`, edit it to `-v2`, then delete it. `notes.body` is still `SECRET-CANARY-v2`, and two receipts (`p1`, `p2`) contain the canary text, so **every saved revision** survives indefinitely. Probe: `notes:afterDelete` in the [probe results](evidence/claude-phase-07-audit-probe-results.json).
- **Expected vs observed:** A student deleting a private note expects its text to be gone (or to be told it is not). Observed: the text and its full edit history persist in the app database, with no purge path.
- **Why tests missed it:** `notesRepository.test.ts` and `runPlannerSqlChecks` assert only that the note is hidden (`get()===null`, count 0). Tombstones are documented as intended (`05-DATA-SCHEDULING.md:25`), but per-revision receipt retention and the dialog wording were never tested or documented. The planner has the same retention, but the README discloses it there.
- **Proposed minimal fix (choose one; implement only after approval):**
  1. *Copy-only:* change the dialog to "Hide this note? It disappears from Notes and Profile counts. Its text stays in this phone's private app storage until a purge option exists." Document per-revision receipts in 05/ADR-022.
  2. *Privacy fix:* in `delete`, also run `title='Deleted note', body=''`. Store content-free note receipts (`{id, version}`) and re-read on replay. Scrub existing note receipts in a later additive migration.
- **Regression test:** create → edit → delete with a canary body, then assert `SELECT COUNT(*) FROM notes WHERE body LIKE '%CANARY%'` and the same query on `operation_receipts.result` both return 0 (fix 2), or assert the dialog copy (fix 1).

### AUD-02 — Medium — The reviewed baseline exists only on one machine; remote `main` is the incompatible incoming app
- **Requirement:** AGENTS "Repository safety", "Don't modify main directly", "no destructive git operations".
- **Type:** Unverified risk (process and custody), not a code defect.
- **Facts:**
  - `git ls-remote` shows only `main`, `Nol-branch` and `agy-development-cont`, all at `9c183a2`.
  - The incoming `AGENTS.md` redefines scope to cloud accounts, sync, SmolLM2 and Gemini (diff `b3eefb8..9c183a2 -- AGENTS.md`).
  - Tags `v0.3.0`–`v0.5.0` mark incoming commits, including "optional Gemini cloud TTS".
  - None of `0d06b24`, `ac6ea2a`, `589508d` or `a186bfc` is on any remote.
- **Failure scenario:** A disk failure or accidental reset loses every reviewed Phase 04–07.1 commit. A teammate or CI cloning `main` builds the replacement app, which has an INTERNET permission, account scope and a different DB, while believing it is the capstone. A later `git pull origin main` into a fresh clone silently yields the wrong baseline.
- **Why not caught:** Reports correctly state "no remote publication", but nothing tracks custody.
- **Proposed action (owner decision; the audit did not push):** Push `codex/phase-07-1-nol-ui` to a new, protected, non-`main` remote branch, or make an off-machine `git bundle` backup. Agree the project scope with the co-developer and protect `main`. Consider annotating or renaming the conflicting tags rather than deleting them.
- **Regression check:** `git branch -r --contains a186bfc` is non-empty.

### AUD-03 — Low — Manual checklists say the friend's build uses a "different package"; it uses the same `com.lafina.capstone`
- **Type:** Documentation discrepancy with a data-loss risk if mishandled.
- **Where:** `qa/PHASE-07-1-MANUAL.md:23-24` and `qa/PHASE-07-1-NOL-UI-MANUAL.md:5-6` disagree with incoming `9c183a2:android/app/build.gradle:22` (`applicationId 'com.lafina.capstone'`, versionCode 6). Both projects sign with the per-machine default debug key (no keystore is committed), while ours is versionCode 9.
- **Scenario:** On a phone that has Nol's build, `adb install -r` of ours fails with a signature mismatch. The obvious workaround (uninstall) destroys that install's `lafina.db`.
- **Fix:** State "same package, different signing key → install fails; do not uninstall; back up first", or give QA builds a distinct `applicationIdSuffix`.
- **Test:** A doc check that the manual's package statement matches both `build.gradle` files.

### AUD-04 — Low — Stale "Settings →" navigation text after the tab was renamed Profile
- **Where:**
  - `PlannerScreen.tsx:184,186,196`
  - `PlannerItemDetails.tsx:299`
  - `PreferencesForm.tsx:108`
  - `commandSession.ts:66`
  - `formatOverviewDate.ts:24`

  These all say "Settings → Reminder delivery" or "in Settings". The tab is labelled **Profile** (`StudentTabBar.tsx:11`), and the global banner already says "Profile → Reminder delivery" (`App.tsx:670`).
- **Type:** Confirmed UI copy defect. Students are sent to a screen name that no longer exists, which could also be confused with Android Settings.
- **Fix:** Replace with "Profile → Reminder delivery" or "Profile → Scheduling & Reminder Preferences". Add an RNTL assertion on the calendar tools message, or a `grep`-based test that rejects `Settings →` in `src/`.

### AUD-05 — Low — Dark-mode Chat Send icon contrast is 2.18:1
- **Where:** `ChatScreen.tsx:352-360` (white `onBrand` icon on `accent`) with `theme.ts:40,42` (`#FF8F96` / `#FFFFFF`). Light mode is 3.2:1. The non-text minimum (WCAG 1.4.11) is 3:1. The Notes FAB uses `onPrimary` and passes (8+:1).
- **Type:** Confirmed by static calculation ([contrast](evidence/claude-phase-07-audit-contrast.json)); not seen on a device.
- **Fix:** Use `colors.onPrimary` for the Send icon (as `NotesList.tsx:224` does), or `brand` as the background. Add a theme unit test asserting ≥3:1 for the icon/background pairs in both themes.

### AUD-06 — Low — Reconciliation omissions are not documented
- **Type:** Documentation discrepancy (no requirement broken).
- **Where:** The deviation lists in `phase-07-1-nol-ui-report.md:31` and `ADR-022:56` name accounts, email, Pro, camera, updater, voice count, transcription, import/export and handbook. They do not mention incoming time blocks, the Philippine-holiday and calendar layers, the overdue section and quick task toggle, rich-text/checklist/tags/custom categories/drag reorder for notes, splash/product tour/theme reveal, or the launcher icon set.
- **Fix:** Add a short "not adopted (in scope but deferred)" list to ADR-022, linking the [reconciliation JSON](evidence/claude-phase-07-audit-incoming-reconciliation.json).

### AUD-07 — Info — The `boolbase` notice limitation does not affect the shipped JS
- A fresh release-mode Metro bundle of the audited source contains `react-native-svg` but **none** of `css-select`, `css-tree`, `boolbase`, `nth-check`, `domutils` and their dependencies ([module graph](evidence/claude-phase-07-audit-js-bundle-modules.json)). The release APK's Hermes bundle also contains no such strings.
- `REACT-NATIVE-SVG-NOTICES.txt` is therefore over-inclusive. It even includes `body-parser`, a development-only tool.
- The attribution question for `boolbase` still applies to source/npm redistribution, but not, on this evidence, to the APK's JS. No licence text was invented.
- **Suggestion:** Note this in the provenance file and trim or annotate the asset after review. Publication provenance remains pending.

**Observations (not defects):**
- Leaving Chat, including via Back, silently discards a typed composer or copied transcript and any pending review (transient by design; the review discard is safe).
- The 12h preference does not change Chat review text or the native reminder screen.
- Known limitation verified: `PlannerHarness.tsx:384` still says "Calendar screens arrive in a later phase" (QA-only harness).
- The large-text wrapping limitation is visible in the recorded 1.3 screenshots. It was not re-tested.

No blocking defect was found.

## 6. Fresh test and build results

| Command (container clone of `a186bfc`) | Result | Evidence |
|---|---|---|
| `npm ci --ignore-scripts` (Node 24.19.0 / npm 11.17.0, unchanged lockfile `sha256 0c12ecbb…` as checked out with LF line endings) | 861 packages, 0 vulnerabilities | [dependencies](evidence/claude-phase-07-audit-dependencies.log) |
| `npm run doctor` | Node OK. JDK/SDK/NDK "not found" (container). Not Windows evidence | [doctor](evidence/claude-phase-07-audit-doctor-container.log) |
| `npm run preflight` (TZ Asia/Manila) | **PASS**: tsc, eslint 0 warnings, prettier, **520 tests / 34 suites** (28.1 s), AST **61 modules**, no cycles | [preflight](evidence/claude-phase-07-audit-preflight-container.log) |
| `TZ=UTC npx jest --runInBand` | **PASS** 520/34 | [UTC run](evidence/claude-phase-07-audit-jest-tz-utc-container.log) |
| Audit probes (`claudeAuditProbe.test.ts`, *not added to the repo*; copy kept as `.txt`) | 33/33 pass, asserting observed behaviour including AUD-01 | [run](evidence/claude-phase-07-audit-probes-run.log), [source](evidence/claude-phase-07-audit-probes.test.ts.txt) |
| `npx react-native bundle --platform android --dev false` | Bundle built in 14.7 s; module graph recorded | [module graph](evidence/claude-phase-07-audit-js-bundle-modules.json) |
| `node scripts/benchmark-intents.cjs --evaluation regression --output …` | 64/64 exact, 88/88 slots, 0 unsafe ready proposals; p50/p95 0.0179/0.2051 ms (6,400 calls, Linux host) | [JSON](evidence/claude-phase-07-audit-intents-regression-linux.json) |
| `node scripts/benchmark-notes.cjs --output …` | PASS, 0 failures, 600 samples (details in §7) | [JSON](evidence/claude-phase-07-audit-notes-host-linux.json) |
| `scripts/audit-incoming-{data,native}.cjs` | Identical to the recorded cohorts | §3 |
| Gradle build, 62 JVM, 44 instrumentation, emulator UI | **NOT RUN** (no Windows shell) | [not-run ledger](evidence/claude-phase-07-audit-not-run.json) |

Instrumentation isolation review (static): `ReminderStoreTest` uses a test database; `runPlannerSqlChecks` opens a separate synthetic QA DB. Excluding `WhisperCorpusBenchmarkTest` means no fresh speech accuracy or latency. Historical 44/44 was not re-executed.

## 7. Performance and evidence integrity

- **APKs:** all 7 existing APKs re-hashed from disk match `phase-07-1-nol-ui-artifacts-reviewed.json` byte-for-byte. Release ARM64 `8b38f17c…` (62,923,108 B); dataQa x86_64 `0edc3b64…` (90,024,072 B). These are artefacts of the audited source, **not a fresh build**.
- **Native libraries:** in all 6 app APKs, all 14 `.so` files per APK have PT_LOAD alignment ≥16 KiB and stored, 16 KiB-aligned zip data. ABIs are arm64-v8a and x86_64 only.
- **Model:** asset `stt/ggml-tiny-q5_1.bin` is 32,152,673 B, sha `818710…`, equal to `phase-06-model.json`. Licence assets: `WHISPER-CPP-MIT.txt` and `REACT-NATIVE-SVG-NOTICES.txt`.
- **Source manifest:** 290/290 entries match HEAD (139 as LF, 150 as CRLF, 1 mixed-line-ending file matched against staged disk bytes). Notes-benchmark source hashes match. The reported p50/p95/max were **recomputed exactly** from raw samples ([integrity](evidence/claude-phase-07-audit-integrity.json)).
- **Notes benchmark methodology:** 5 warm-ups and 100 samples per metric, nearest-rank `ceil(p·n)`, failures retained, uncontrolled host load disclosed. Sound for its stated scope.
- **Fresh notes cohort:** Linux container, 2 vCPU. Create p95 1.62 ms, edit 2.04 ms, page 0.59 ms, no-match search 0.50 ms, counts 0.08 ms; 0 failures. This is a **different host, filesystem and load**, not comparable to the Windows cohort and not a speed claim. Host SQLite is not Android, and neither is a phone.
- **Measurement categories kept separate in this report:** historical vs fresh, host vs Android SQLite, emulator vs phone, synthetic vs live speech, mocked vs native, and build success vs delivery.
- **Dependencies:** exact `react-native-svg@15.15.5` (MIT, lock integrity present). `body-parser@2.4.0` is under the dev-only `@react-native-community/cli`. `npm audit` (full and `--omit=dev`) reports 0 advisories today. That is point-in-time only and not proof of production safety.
- **Secret scan:** HEAD has 0 credential-like hits (2 operation-token fixture false positives). All history, including incoming, has 1 false positive inside a base64 PNG ([scan](evidence/claude-phase-07-audit-secret-scan.txt)). This is a regex scan, not complete detection.
- **Graphify:** NOT RUN (not installed). The AST check and the ADR Mermaid diagrams are limited substitutes; there is no Kotlin/C++ call graph.

## 8. Exclusions, known limitations and unverified claims

- **Intentional, correctly absent:** accounts/login/email/Pro, subscriptions, cloud/backend/Gemini/RAG, sync, updater, camera, schema 17 import, Kokoro, Silero/Base.en, wake word or always-on mic, unsupported import/export, and handbook claims.
- **Known limitations, confirmed:** the stale harness caption; large-text wrapping (screenshot evidence only); TalkBack and physical soft-keyboard combinations not certified; complete privacy purge and export are later work.
- **Unverified (NOT RUN or HUMAN REQUIRED):**
  - physical ARM64/API30/31 and low-RAM devices
  - Doze, OEM restrictions, reboot and time-change delivery on a phone
  - real speech recognition and accents, TTS audibility, call and audio-focus interruption
  - PSS, startup and battery
  - fresh Gradle, JVM and instrumentation runs; emulator end-to-end UI; the Whisper corpus benchmark
  - re-verification of the legacy pinned revision

## 9. Manual Android checklist (owner)

1. `adb devices -l`. Install the **existing** verified build with `adb install -r android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk` (expect sha256 `0edc3b64…`, version `0.7.2-data-qa`). Never uninstall or clear data. On a phone, use `app-arm64-v8a-dataQa.apk`.
2. Airplane mode on. Reopen and confirm the prior nickname, timezone, lead/snooze, quiet hours and planner items survive.
3. **AUD-01 check:** In Notes, create `QA-AUDIT note` with the body `canary`, edit it, then delete it. Expected today: it disappears from the list and Profile counts, but (per this audit) its text is still stored locally. Decide which fix to apply.
4. **AUD-04 check:** Calendar → Tools with alerts off. The message says "Settings → Reminder delivery" while the tab is called Profile.
5. Dark mode → Chat. Check the Send arrow is legible (AUD-05).
6. Chat: `Remind me to QA-AUDIT revise tomorrow at 7 PM` → review → Confirm. Then `Move task "QA-AUDIT revise" to tomorrow at 8 PM`. Then try `Friday`, `Okay but remind me later`, `Change it`, `Delete all tasks`: none may produce a review. Background the app with a review open; it must disappear.
7. Mic button with an unsaved note or planner form: a guard must appear. With no draft, the speech panel opens without recording. Hold and release, edit the transcript, Use draft in chat, then Send and Confirm separately.
8. Enable delivery. Create a lead-0 timed task 3 minutes ahead and lock the phone. It must ring. ACK must leave the task TODO; complete it separately. Snooze must not duplicate.
9. Profile: toggle 24-hour and Monday start, restart, and confirm both persist. Calendar Week/Month labels must follow.
10. Font size Large plus TalkBack pass on a narrow screen.
11. Restore radios, theme, font and delivery, and delete only `QA-AUDIT` fixtures.

## 10. Verdict

**PASS WITH CONDITIONS.**

Conditions:
- (a) Owner decision on AUD-01 before notes are used for private content.
- (b) Off-machine custody of the reviewed branch (AUD-02).
- (c) Low copy, contrast and documentation fixes (AUD-03 to AUD-07) at the owner's convenience.
- (d) The existing physical-device validation gates.

There are no blocking or High defects, no test weakening, no conflict residue, and no forbidden runtime.

## 11. Phase 08 prerequisites

**Partially satisfied.**
- Automated JS gates, preserved artefacts and the integration contract are in place.
- Phases 01–07.1 are all still `AWAITING DEVICE VALIDATION`. AGENTS requires human device checks to be completed or acknowledged, and Phase 08 requires an explicit `APPROVE PHASE 08`.
- This audit does not authorise Phase 08.

## 12. Human summary

- **Inspected:** Git state and ancestry (all 1,417 incoming paths classified), the two integration reports, ADR-021/022, the requirements matrix, phase reports 00–07, benchmark protocols, and the command, speech, storage, reminder, notes and UI source, including native schema gating. Existing APKs, the source manifest and benchmark raw data were re-verified.
- **Freshly tested:** preflight (520/34, AST 61) under two timezones, 33 independent safety/privacy probes, a release-mode JS bundle, dependency audit, the parser regression (64/64), the notes host benchmark, the incoming-defect probes, APK/ELF/model inspection and a secret scan.
- **Nol integration:** substantively correct. Requirements are intact and unsafe incoming behaviour is excluded. Some cosmetic and in-scope Nol features were dropped without documentation.
- **Most important findings:** AUD-01 (deleted notes keep their text and full revision history; the dialog says "removes") and AUD-02 (the reviewed code exists only locally while remote `main` is the incompatible replacement).
- **Check manually:** checklist §9, especially steps 3, 6 and 8 on a physical phone.
- **NOT RUN:** Windows `doctor`, Gradle, JVM, instrumentation, emulator UI, all physical-device, speech, audio, battery and memory checks, Graphify, and legacy pin re-verification.
- **Report:** `docs/reports/phase-07-independent-claude-audit.md`, with evidence at `docs/reports/evidence/claude-phase-07-audit-*`. These are uncommitted new files; nothing else in the repository was modified.

`STATUS: AWAITING DEVICE VALIDATION`

**STOPPED — awaiting explicit human approval. Phase 08 has not been started.**
