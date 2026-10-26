# Phase 07.1 — incoming integration checklist

Authorized by the owner's request to pull, thoroughly audit, integrate and test
the friend's changes before Phase 08. This is a maintenance integration of the
approved offline core, not authorization for Phase 08 or online services.

- [x] Read standing instructions; record dirty branch and remote.
- [x] Scan local checkpoint candidates without printing credentials; save all
  reviewed Phase 04–07 work in local checkpoint `0d06b24`.
- [x] Create `codex/phase-07-1-integration`; fetch/pull upstream
  `9c183a20eca2377b5e54f219c5f83460b18af81b`; record 73 conflict paths.
- [x] Resolve the replacement conflict using our checkpoint as the authoritative
  data/native/runtime baseline. Preserve upstream ancestry in the eventual merge.
- [x] Audit incoming storage, alarms, speech, UI, dependencies and scope.
- [x] Adapt reviewed month calendar, rounded navigation, brand and semantic theme.
- [x] Verify current data/native code retained; test command safeguards and dates.
- [x] Run complete preflight, current native build/tests; current42 Android checks
  and visible month/day/detail/upgrade/query/refusal/persistence cases pass.
- [x] Finish remaining visible emulator alarm/style checks; final large-text
  layout and speech-draft copy/discard pass, plus native alarm ACK/taskTODO.
- [x] Restore emulator settings and remove only new synthetic test fixtures.
- [x] Save report, ADR, provenance, evidence and full manual checklist.
- [x] Save local merge `ac6ea2a`, preserving checkpoint/upstream ancestry; final
  documentation/verification commit records report links and current hashes.
- [ ] Physical phone/real speech/low-RAM acceptance — HUMAN REQUIRED.

Pasted production credentials are not saved or used. Owner must revoke/rotate
them. Incoming account/cloud/sync runtime, larger unbenchmarked models and unsafe
replacement stores are excluded from this integration tree and retained in Git
history for inspection. Existing reports and baselines are not rewritten.
