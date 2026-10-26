# Phase 05 execution checklist

Explicit owner approval: **APPROVE PHASE 05**, received 2026-10-25 Asia/Manila
as the answer to beginning Android system text-to-speech while leaving physical
phone validation pending. The earlier ambiguous approval stopped at automatic
review; no Phase 05 source edits occurred before this explicit approval.

Branch: `codex/phase-05-system-tts`; Git base remains
`b3eefb853be7c658a38186d330eb8aaf4be8eea2`. Phase 04 is still uncommitted and
is preserved in this checkout. Its 111-file handoff hash manifest defines the
pre-Phase-05 source baseline; cumulative Git diff alone includes both phases.
Do not rewrite its evidence or mark its unrun phone checks passed.

- [x] Read instructions, approved scope, current source contracts and prior evidence.
- [x] Create the Phase 05 branch after explicit approval; retain Phase 04 work.
- [x] Audit pinned legacy TTS selectively, with no legacy writes or model copies.
- [x] Implement lazy native TTS, offline installed-voice checks, bounded replacement,
      callbacks, audio focus, stop/dispose and visible reminder lifecycle.
- [x] Add typed bridge, compatible local voice settings, preview/setup/fallback UI
      and canned text-first replies without speech input or command execution.
- [x] Verify unit/UI/native/instrumentation gates and actual emulator behavior.
- [x] Record actual init/request/onStart milestones separately from audible
      latency; legacy and physical comparisons remain NOT RUN unless measured.
- [x] Update ADR, architecture, provenance, manual guide and completion report.
- [x] Restore emulator controls and stop before Phase 06.

Final gates:263 JS /42 JVM /31 Android instrumentation PASS;8 final emulator UI
checks PASS. Pilot:5 callback samples, not audibility. One ready-idle PSS snapshot
recorded, not peak or phone memory. Acoustic stop duration, first audible speech,
phone focus/interruption, battery, low-RAM and matched Kokoro comparison NOT RUN.
See the report for separate source/APK cohorts and the device-found navigation fix.

No Kokoro, model binaries, cloud, microphone, STT or scheduling intent work is
authorized. Human hearing, phone interruption, low-end performance and the full
offline acceptance gate remain pending unless actual results are supplied.
