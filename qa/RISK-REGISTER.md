# Initial Risk Register — maintain and assign during Phase 00

| ID | Likelihood | Impact | Risk | Mitigation and checkpoint |
|---|---|---|---|---|
| R-01 | High | Critical | Android denies exact alarm / full-screen on some phones | Phase 03 OS capability and fallback matrix; explain no guarantee |
| R-02 | High | High | Built-in offline TTS voice absent or low quality | Phase 05 enumerate voices, airplane-mode validation, text fallback |
| R-03 | Medium | High | On-device SpeechRecognizer unavailable/poor for API 30 phone | Phase 06 tested Whisper fallback and typed control |
| R-04 | Medium | High | Bundled Whisper causes APK/RAM/battery issues | Benchmark model sizes and lazy load; decision gate |
| R-05 | High | High | AI misinterprets date/ACK/snooze | Deterministic validation, ambiguity, critical no-false-ACK tests |
| R-06 | Medium | Critical | Reminder/job record drift under crash/duplicate alarm | SQLite transactions, idempotency, version guards, recovery tests |
| R-07 | Medium | High | Legacy port drags business/auth/cloud dependence | Per-file audit + dependency boundary/Graphify |
| R-08 | Medium | High | Public backend Gemini proxy abused / cost overrun | Phase 09 quotas, caps, demo-only security; no open unauthenticated proxy |
| R-09 | High | High | USTP handbook revision ambiguity or citations wrong | Versioned official sources, human reviewed gold dataset, abstention |
| R-10 | Medium | High | Copyright/privacy risk from handbook, test audio, old model binaries | Provenance/license + research consent review |
| R-11 | Medium | High | Inconsistent performance claims between devices | Baseline pinned, same-device protocols, p95 and raw metrics |
| R-12 | Medium | High | Codex over-builds project or fails to stop | Phase approvals, phase report template, no autonomous next phase |
| R-13 | Medium | Medium | Offline user's selected voice requires network | Require voice network flag and airplane-mode verification |
| R-14 | High | High | Device OEM battery optimizations prevent timely alerts | Multiple-device matrix, user education, no unsupported guarantees |

## Phase 00 findings and accountable checkpoints — 2026-10-21

All original risks remain OPEN; no runtime mitigation has been implemented.
Owner for R-01/06/14: Android engineering + human device reviewer (03/08).
R-02/03/04/05/13: voice/domain engineering + consenting testers (05–07).
R-07/12: engineering owner and phase reviewer (every phase).
R-08/09: deferred backend/adviser owner (09/10 only).
R-10: project owner/provenance reviewer; R-11: research lead (00/05–08/11).

| ID | Severity/status | Actual finding or open uncertainty | Owner and required checkpoint |
|---|---|---|---|
| R-15 | Critical, OPEN | Pinned manifest declares receiver class absent from complete tree; implemented receiver has different name | Android engineer; rewrite registration/identity, native compile + physical alarms before 03 passes |
| R-16 | Critical, OPEN | Legacy production storage can become volatile mock DB; scheduling success precedes durable/native completion | Storage/domain engineer; new minimal DB/transactions/desired-job protocol + fault tests in 02/03 |
| R-17 | High, OPEN | Native app compatibility not build-validated. Restricted Gradle failure resolved outside sandbox; version probe passes with JDK17. Default inherited launch initially chose Java25 | Build owner; select JDK17 explicitly and clean debug/release-like build in 01; no blind upgrades |
| R-18 | High, OPEN | Restricted ADB startup failure resolved outside sandbox; enumeration passes with no devices attached | Human device reviewer/build owner; connect/authorize phone and record only model/API/RAM before baseline/device gates |
| R-19 | High, PARTLY RESOLVED | No root legacy license; user confirmed source/brand authorization, details to follow. Third-party/model/voice provenance unverified | Project owner records authorization/attribution details; engineer verifies upstream revision/terms/checksum before binary/source inclusion |
| R-20 | High, OPEN | Low-end RAM/CPU/ABI coverage not measured; no specific test hardware selected | Performance lead + owner; prioritize 2–3 GB Android11+ ARM64 tier if available plus ~4 GB/reference/newer API; publish measured support envelope, no assumed RAM minimum/32-bit guarantee |
| R-21 | High, OPEN | Single native call slot/hash identities and possible STT context-free/inference race | Android/voice engineer; generation-safe queues, serialized native ownership, cancellation tests in 03/06/08 |
| R-22 | High, OPEN | Impossible dates, first substring completion targets and recurrence weekday loss in legacy paths | Domain engineer; pure proposals, real date/target checks, no false ACK/delete, BYDAY fixtures in 02/07 |
| R-23 | Medium, OPEN | Old manuscript unavailable; handoff's Django/Qdrant paper claim cannot be verified | Research lead/adviser; obtain manuscript before correcting paper claims, not an offline runtime dependency |
| R-24 | High, OPEN | No measured old/new baseline; model pointers are not payload/APK/PSS measurements | Research lead; isolated reviewed baseline and matched protocol, null missing values and preserve failed control results |

Evidence: [inventory](../docs/audits/phase-00-inventory.md),
[native audit](../docs/audits/phase-00-native.md),
[domain audit](../docs/audits/phase-00-reuse.md),
[toolchain](../docs/audits/phase-00-toolchain.md),
[blueprint](../docs/phase-00-blueprint.md).

## Phase 01 update

Phase 01 native debug/release builds now validate the chosen RN/OP-SQLite
configuration for the built ABIs; this partially resolves R-17. Physical-device
usability, low-end performance and all future native-feature risks remain open.
Emulator smoke checks are a separate evidence class, never phone certification.

| ID | Severity/status | Finding | Owner/checkpoint |
|---|---|---|---|
| R-25 | High, OPEN | Final npm production-graph audit has33 affected/meta-affected entries from two remaining leaf advisories; no patched latest leaf version available at scan | Engineering/security reviewer; trusted build inputs, no public Metro, review upstream fixes or separately evaluated framework migration before distribution; see provenance ledger |
| R-26 | High, OPEN | ARMv7/API30/physical low-RAM handset behavior not yet validated; emulator is API37/x86_64 | Device reviewer; run Phase01 manual checklist on actual low-end phone; do not infer support from ABI configuration or 2GB emulator setting |

The package [provenance/security ledger](../docs/third-party/phase-01-provenance.md)
records actual advisories and compatible fixes; no advisory scan is labeled PASS.
