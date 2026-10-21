# Phase 01 execution checklist

Approval: user said “proceed phase 1, make sure after every phase you tell me what
to check manually” on 2026-10-21 Asia/Manila. This explicitly authorizes Phase 01
despite the kit's suggested literal approval syntax. Phase 00 physical baselines
remain NOT RUN; approval does not retrospectively certify them.

- [x] Review standing instructions, Phase 01 scope and prior audit/working tree.
- [x] Preserve Phase 00 files; work on codex/phase-01-foundation.
- [x] Validate official template/dependencies and native Android build.
- [x] Implement local anonymous preferences/onboarding and recovery states.
- [x] Add semantic themes, labeled shared controls and four basic tabs.
- [x] Keep future native/intent contracts explicitly unavailable.
- [x] Run strict typing, lint/format, behavioral tests and architecture checks.
- [x] Record actual build/artifact results and all physical checks NOT RUN.
- [x] Save phase-01-report.md with exact manual checks; stop before Phase02.

19 automated tests pass; ARM64/x86_64 debug and release-preview builds pass.
Read-only API37 emulator offline native persistence/navigation/selected200% font
checks pass after a footer correction. Physical manual gate remains pending.
Dependency audit is not clean; see report/provenance for the two remaining leaf
advisories and propagated package counts. No advisories were hidden or forced away.

No backend, alarms, STT/TTS engines, command execution or scheduling CRUD in this
phase. Device support/performance claims require actual phone measurements.
