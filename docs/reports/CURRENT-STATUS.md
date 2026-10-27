# LAFINA-CAPSTONE — current status / new-chat handoff

Last verified: **2026-10-27, Asia/Manila**. This is a compact derived snapshot;
phase reports, source, tests and fresh Git state remain authoritative. Read it
before reopening old logs. **Phase 08 is NOT approved or started.**

## Workspace and Git safety

- Continue the existing local checkout:
  `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE`.
- Branch: `codex/phase-07-audit-hardening`.
- Hardening documentation checkpoint:
  `97436803a66de8cacc8c72578b28d898d8c1e540`. A later local Graphify setup commit
  follows; resolve the actual current HEAD with `git log -3`.
- Implementation/evidence: `c63088739510e8d0bef003060ddc1512c6d1d1c0`.
- Independent audit preservation: `0ff4002d82a205b88a8624e808cbcbc79bf60cc4`.
- Previous integrated baseline: `a186bfceeb05db038bb0b7a2a35b6fe17d1fab62`.
- At the last remote check, main/Nol-branch both pointed to
  `9c183a20eca2377b5e54f219c5f83460b18af81b`. Their replacement app is NOT the
  reviewed current implementation. Do not start from a fresh origin/main clone
  or blindly merge/pull it into this checkout.
- Reviewed work has not been pushed; off-machine backup remains an owner decision.
  Proposed normal command: `git push -u origin codex/phase-07-audit-hardening`.
  No push/main edit/force push/PR publication is authorized by this handoff.
- Graphify setup is now verified locally: uv0.13.6, isolated graphifyy0.9.96 /
  Python3.12.14, project skill and portable passive Codex hook. The installer
  preserved the owner-added AGENTS.md section without duplicate rules.
- `graphify-out/graph.json` exists and a local AST refresh/query/path/explain
  succeeded. Read [tooling notes](../tooling/graphify.md) and current `AGENTS.md`
  before code exploration. The user PATH is updated; restart Codex once, or use
  `C:/Users/USER-PC/.local/bin/graphify.exe` in the existing process. The Codex
  hook itself is a no-op; the agent must follow graph-first/update instructions.
- Graphify has partial Gradle/Kotlin parsing and cannot replace source/compiler/
  device checks. Its graph/cache stay ignored/local. The hardening report's
  earlier Graphify NOT RUN remains historical, not the current tooling state.
- Legacy `C:\L3mxr\Github Repositories\LAFINA` is strictly READ ONLY; pinned
  reference `f7e70aec54e6d16e627f444f2a67114cbfb07b5e`.

## Progress through Phase 07.1

Phase00 established scope/toolchain/audit/blueprint;01 added anonymous setup,
themes and local preferences;02 added transactional SQLite/domain operations;
03 added native reminder/call-style delivery;04 added bounded manual calendar
and scheduling UI;05 added Android offline-capable system TTS;06 added reviewed
offline STT with Android on-device candidate and verified Whisper Tiny fallback;
07 added deterministic, validated, explicitly confirmed offline commands.

Phase07.1 selectively integrated Nol presentation while retaining the reviewed
offline services. It then added the requested Chat/Calendar/Notes/Profile dock,
central mic entry, week timeline, real local Notes and Profile preferences.
Database schema3 adds Notes; native reminders support schemas2/3. Nol's
`lafina.db` schema17 is NOT imported. Same package does not imply compatible
signatures or data. No uninstall/clear-data/downgrade workaround.

Latest hardening fixed honest note-removal/disclosure, dark Send contrast,
Profile route guidance, QA caption, signing/schema instructions, omitted-feature
documentation and dependency-notice scope. Notes removal hides records but
retains saved text/history in rows AND operation-receipt results/fingerprints.
No purge, restore feature or permanent-erasure claim. Storage/native/domain
logic and dependency versions were unchanged; app version is0.7.3/code10.

## Read these first, then inspect selectively

1. Current root `AGENTS.md` — includes newer uncommitted Graphify instructions.
2. [Latest hardening report](phase-07-audit-hardening-report.md).
3. [Hardening manual checklist](../../qa/PHASE-07-HARDENING-MANUAL.md).
4. [Phase08 specification](../../phases/PHASE-08.md) — planning only until approval.
5. [Requirements matrix](../../qa/REQUIREMENTS-MATRIX.md), then only relevant ADRs.

For questions, follow links from the reports. Older progress is in
[Phase07](phase-07-report.md), [integration](phase-07-1-report.md),
[Nol UI follow-up](phase-07-1-nol-ui-report.md) and
[independent audit](phase-07-independent-claude-audit.md). Phase00–06 reports and
earlier failed evidence remain preserved. Do not reread every log/source file or
rerun the independent audit merely to orient a new chat.

## Latest actual verification (historical; not a new-chat rerun)

- Windows doctor: Node24.19, Java17, SDK36/NDK27.1/CMake available.
- Full preflight: **528 tests /35 suites PASS45.241s**, type/lint/format PASS,
  architecture AST61modules PASS.
- Android: debug/dataQa/release ARM64+x86_64 and test APK build PASS5m19s.
- Fresh JVM rerun: **62 tests /6 suites PASS0.175s**.
- Installed-candidate instrumentation: **44 tests PASS6.317s**, corpus benchmark
  explicitly excluded; no fresh speech-accuracy claim.
- Frozen parser regression:64/64 exact,88/88 slots,0unsafe refusal proposals.
  Host-only, not a new held-out set or Android/legacy performance comparison.
- APK/native:7APKs,84native libraries across6appAPKs pass16KiB ELF/ZIP checks;
  QA/release have no INTERNET. Verified model/notices retained. Debug has the
  documented development permissions. Candidate source cohort contains291files.
- All291source/7APK/26original-audit hashes matched when hardening finished.
  `AGENTS.md` has since changed; do not claim that old manifest still matches
  the entire current working tree without checking/qualifying that difference.

Installed QA: **0.7.3-data-qa**, `com.lafina.capstone`, x86_64 APK SHA256:
`5f635943bb3ef20a97d7f2561189ae9dbb1a3cf06740e5c6bd749867ed63db1a`.

Actual emulator checks passed: upgrade preservation, Notes disclosure/Cancel/
Remove, Profile recovery, Light/Dark Send, typed create/query/refusal, reviewed
manual draft/Discard, isolated JSI SQL, font1.3 disclosure and dirty-note/
preferences guards. Empty-search driver placeholder handling was corrected;
no product bug was hidden by that correction.

## Device state and remaining gates

At final testing: Medium_Phone, emulator-5554, API37beta/x86_64/16KiB; no physical
phone. Final app was left on Calendar. Discover current device availability
afresh; do not assume it is still running.

Restored Dark theme,24h/Monday,1080x2400/font1.0, radios airplane0/Wi-Fi1/mobile1;
delivery OFF. Saved private preferences unchanged. Owned synthetic fixtures
removed; documented tombstones/history remain. Host microphone OFF, no active
app recording; pre-existing mic permission preserved. Evidence:
[cleanup](evidence/phase-07-hardening-emulator-cleanup.json).

Physical ARM64/API30/31/low-RAM, real STT/TTS/audibility, OEM/Doze/reboot/time-change
delivery, TalkBack/soft keyboards and phone startup/PSS/battery remain HUMAN
REQUIRED. Emulator/mocks do not certify them. No backend credentials, real audio
or student data belong in a handoff or public evidence.

## Next action and efficient continuation

Current project status: **AWAITING DEVICE VALIDATION**. The owner has not yet
approved Phase08 or confirmed its prerequisite human checks. First confirm this
state and provide a concise Phase08 plan; wait for explicit `APPROVE PHASE 08`
and address/record prerequisite human validation before implementation.

Phase08 targets the integrated offline reminder → Answer/TTS → visible mic or
button → validated ACK/snooze → reconcile/close loop and its release gate.
It is not permission for accounts, cloud/Gemini/RAG, new models or deferred UI
extras. ACK remains separate from task completion; never automatically record.

To conserve usage, use targeted graph/file queries, small diffs and bounded tool
outputs. Reuse unchanged valid evidence; run checks appropriate to changes and
failures, without needless repeated full builds/audits. Start orientation with
one agent and no delegated audit. Keep commentary concise and update this
snapshot at meaningful handoffs. Account usage is shared and cannot be assigned
precisely to this chat; a new chat does not reset limits. Save a continuation
handoff if nearing a limit rather than claiming unfinished work complete.
