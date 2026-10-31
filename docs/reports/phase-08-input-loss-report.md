# Phase 08 — emulator input-loss investigation and full test follow-up

**Date:** 2026-10-29–30, Asia/Manila; evidence timestamps are UTC.  
**Branch / base:** `codex/phase-07-audit-hardening` / `98bef88`. Work remains local.  
**Automated release gate:** BLOCKED by A03, V03 and V04.  
**Physical acceptance:** AWAITING DEVICE VALIDATION; unsigned. Phase 09+ is not approved.

## 1. Outcome

All **47 runnable emulator cases** were exercised. The reconciled result is
**44 PASS, 3 FAIL, 1 NOT RUN**, across 51 retained terminal attempts. V05 remains
owner-deferred until suitable reviewed public/consented local-accent audio exists.
The interrupted partial V08 run is preserved separately; a fresh full V08 passed.
These are scoped emulator outcomes, not an all-attempt success rate or phone certification.

The intermittent input-loss issue is **not reliably fixed**. Four focused diagnostic
captures passed, but the clean candidate reproduced recognition, transport/check,
and near-silence failures. No failed speech trial confirmed an action.

| Open case | Actual failure | Evidence |
|---|---|---|
| A03 | Signal was present, but the exact synthetic ACK was misrecognized. The reference guard prevented confirmation. | [comparison](evidence/phase-08-input-loss-clean-ack-comparison.json) |
| V03 | First repeated ACK passed; second failed. A final host-input-ON check masked an earlier injection error. The old output cannot establish whether the source RPC began. No enable was requested; final input OFF and restoration verified. | [protocol review](evidence/phase-08-input-loss-protocol-review.json) |
| V04 | First repeated snooze passed; second produced NO_AUDIO_SIGNAL despite successful initialization/source RPCs and host input OFF throughout. | [current ledger](evidence/phase-08-input-loss-case-ledger.json) |

The [current matrix](evidence/phase-08-emulator-expansion-matrix.json),
[51-attempt ledger](evidence/phase-08-input-loss-case-ledger.json) and
[hash-bound reconciliation review](evidence/phase-08-input-loss-campaign-reconciliation-review.json)
retain every original failure. A31 cleanup and A36 foreground-precondition failures
were superseded only after reviewed recovery and separate fresh full passes.
The [previous matrix](evidence/phase-08-emulator-expansion-matrix-pre-input-loss.json)
and [previous report](phase-08-remaining-emulator-report.md) remain historical evidence.

## 2. Changes and preserved behavior

- Added optional `--initialize-input` to the loopback test producer. After visible
  Recording and host input OFF, it sends a format-only RPC with zero source PCM,
  then rechecks OFF/Recording before sending the same pinned source once. This is
  an **experimental, disproved reliability workaround**, disabled by default.
- Fixed diagnostic error masking: `injectionFailureReason`/optional gRPC status
  preserve the original redacted error when the final privacy check also fails.
  `sourceStreamAttempted` distinguishes setup from entering the actual source RPC.
  Streaming, routing and safety checks are unchanged by this logging correction.
- Added exact `delete all tasks` to the typed refusal test coverage. Its three
  refusals use separate fresh ringing fixtures and independent unchanged-state checks.
- Hardened private test recovery: preserve dispatch locks after unknown restoration;
  verify host/guest clocks; navigate through the observed Chat control before owned
  composition/cleanup; establish actual Main foreground before a private stale open.

Answer still neither acknowledges nor records. Recording needs deliberate visible
hold; copying/reviewing and Confirm remain explicit. ACK leaves the task TODO.
Manual and typed controls remain available on voice failure. No automatic recording,
source-audio retries, parser weakening, new model, schema/dependency/permission
change, account, backend, Gemini, RAG or Kokoro was introduced by this follow-up.
[ADR024](../decisions/ADR-024-reminder-speech-vocabulary.md) and the
[flow contract](../phase-08-offline-loop.md) document the retained boundaries.

## 3. Checks actually executed

| Check | Result and evidence |
|---|---|
| Final host preflight | PASS: 528 Jest tests / 35 suites, TypeScript, lint, formatting and 61-module architecture. [summary](evidence/phase-08-input-loss-host-final.json) |
| JVM / Android build | PASS: 81 tests / 8 suites, no failures/errors/skips; QA/debug/release for ARM64 and x86_64, plus matching test APK. [build log](evidence/phase-08-input-loss-final-build.log), [JVM record](evidence/phase-08-input-loss-jvm-results-final.json) |
| Ordinary native instrumentation | PASS: 53 tests, no skip/assumption codes. [log verification](evidence/phase-08-input-loss-native-results.json) |
| Frozen commands | PASS: 64/64 exact, 88/88 selected slots, 6,400 repeated calls; no unsafe ready refusal, exception or nondeterminism. [JSON](../benchmarks/phase-08-input-loss-command-regression.json) |
| Four isolated host storage harnesses | PASS: 24 metrics, 1,710 measured successful calls, zero failures. [summary](evidence/phase-08-input-loss-extra-host-checks.json) |
| Negative decoder controls | PASS: four controls proposed no reminder-response command. [JSON](evidence/phase-08-input-loss-negative-controls.json) |
| Floor/offset decoder regression | PASS: 16 calls, two clips × four offsets × two floors. [batch](evidence/phase-08-input-loss-extra-20261030T090717682741Z-4c1b2c.json) |
| Exact saved-capture replay | PASS: four pinned diagnostic captures replayed on the clean decoder; exact expected responses, no mic/action; exact device copies removed. [batch](evidence/phase-08-input-loss-extra-20261030T090717682741Z-4c1b2c.json) |
| GENERAL synthetic corpus | PASS: 6/6 normalized exact, 0 word errors / 36 reference words. [analysis](../benchmarks/phase-08-input-loss-general-corpus-analysis.json) |
| System TTS probes | Six callback conditions passed their assertions, including unavailable-engine behavior. Audibility NOT RUN. [results](evidence/phase-08-input-loss-tts-probes.json) |
| Native response-policy benchmark | 1,200 measured / 240 warmup calls, zero failures; pure synthetic policy/session only. [JSON](../benchmarks/phase-08-input-loss-native-response-emulator.json) |
| Binary verification | PASS: seven APKs, 84 ELFs, six pinned model copies; diagnostic exporter absent from source and all seven DEX payloads. [artifacts](evidence/phase-08-input-loss-artifacts-final.json), [absence](evidence/phase-08-input-loss-diagnostic-absence-final.json) |
| Client logging correction | Node syntax/format checks and six rejected-input privacy guards passed. No device connection in those guards. [guards](evidence/phase-08-input-loss-observability-host-guards.json) |
| AST graph | Updated after final code change: 2,968 nodes / 6,591 edges / 209 communities. Partial parsing remains a navigation limit. [log](evidence/phase-08-input-loss-graphify-observability-resumed.log) |
| Final restoration | PASS: all ten checks. [record](evidence/phase-08-input-loss-restoration-final.json) |
| Final integrity | Source/APK ledgers, actual case counts, public JSON, document links, Git identity and pending human gates: [record](evidence/phase-08-input-loss-validation-verified.json). This check does not pass the phase. |

Gradle reused unchanged build outputs; the JVM task was explicitly rerun. The final
host preflight preceded the client-only logging correction; that correction received
the Node/format/privacy checks above. No APK source changed after the clean build.
The live dual-error branch was not deliberately induced by enabling host input.

GENERAL prepare/load/decode median was 3016.5 ms, maximum 3412 ms, and sampled
maximum PSS 169613 KiB. These six synthetic emulator samples do not establish a
stable p95, absolute peak memory, human accuracy or phone performance.

## 4. What the diagnosis establishes

The [initial cold pair](evidence/phase-08-input-loss-cold-pair-1.json) reproduced
floor-only capture and a separate signal-present recognition failure. The
[four initialized diagnostic captures](evidence/phase-08-input-loss-initialized-capture-summary.json)
matched the source at correlation about 0.9999999873 with zero clipped samples.
They used temporary diagnostic APK 98ed4f5… and cannot certify clean-APK reliability.
The [exporter source review](evidence/phase-08-input-loss-exporter-source-review.json)
found no sample/profile mutation in that file; its missing exact call-site archive,
I/O timing and actual failed-buffer identity remain limits.

The installed protocol treats host-OFF as a setting, not PCM-health proof. Later
packet formats are ignored and default blocking delivery permits unthrottled
client pushes; neither supports inventing a format-reset or pacing repair.
The [protocol review](evidence/phase-08-input-loss-protocol-review.json) separates
installed-schema evidence from upstream implementation not mapped to this binary.
No definitive installed-SDK root cause or host-capture cause is claimed.

An isolated official SDK37.2.13 comparison failed cold and passed warm; it was
rejected. The original installed SDK37.1.11/build15917651 was retained.
[Assessment](evidence/phase-08-input-loss-sdk-assessment.json).
Raw synthetic buffers and unrestricted dumps stayed ignored/private. Temporary
export code is removed; no recording exporter is shipped in the clean APKs.

## 5. Candidate and environment

Saved `Medium_Phone` / `emulator-5554`, `sdk_gphone16k_x86_64`, API37 preview,
x86_64, 16 KiB pages. No physical phone was tested.

Candidate: `com.lafina.capstone`, **0.8.0-data-qa / versionCode11 / schema3**.
Installed QA SHA256:
`7300f2aefeb8d5f90882655d46435b100a12531e16a7c70df4f81230f4160454`.
Matching test APK SHA256:
`945fa582d8896848fbe9a9b9745fc4cea997be4bb95eee426d39bc174c2034b9`.
[31-file current source ledger](evidence/phase-08-input-loss-source-hashes-observability.json).
The late MJS logging change is outside the APK; application hashes remain equal.
ARM64 binaries were built/inspected, not executed on an ARM64 device.

## 6. Restoration and preservation

Final restoration independently compared all three original baselines. Original
non-diagnostic rows, full preference payload and delivery flags are preserved.
Recorded permission flags/AppOps, radios, clock/timezone, display/font/keyboard,
power and audio settings passed their checks. Google TTS inventory/state is restored;
final host input is OFF, normal audio mode and no recording are verified.
There are zero active jobs and registrations. Volume was not mutated or compared.

Owned fixtures were soft-removed through reviewed UI. Their saved history and
operation receipts remain; this is not permanent erasure. The two exact pinned
WAVs and replay device copies were removed with hash checks. No model/cache/data
clear, uninstall, database replacement, Git reset, branch switch, legacy edit,
pull/merge, push or publication occurred. Interrupted records retain their original
statuses and are explicitly classified as historical, not live controllers.

## 7. Scope limits

- A13 uses AppTask removal, not an actual Recents gesture. A31 uses overlapping
  rings, not an exact same-instant collision.
- A26 tests busy audio mode, not removal of Whisper/vendor engines. A27 tests
  actual recording interruption and manual recovery.
- A34 verifies 200% text reachability, not TalkBack or soft-keyboard certification.
- A36 tests actual notification snooze plus a private saved old identity; an old
  notification tap is NOT RUN. V08's three refusals are typed.
- V06 uses a fixed synthetic 20 dB noise derivative; V12 uses HOME cancellation,
  not acoustic TTS echo. No generic synthetic voice fills the V05 accent gate.

## 8. Execution and evidence navigation

Executed `npm run preflight`; the Android build command included
`:app:testDataQaUnitTest --rerun :app:assembleDataQa :app:assembleDataQaAndroidTest
:app:assembleDebug :app:assembleRelease`, both ABIs, pinned local model/corpus
properties, offline mode and one worker. Exact output is in the linked build log.
Native instrumentation classes and case procedures are listed in the
[native inventory](evidence/phase-08-input-loss-native-test-inventory.md) and
[case inventory](evidence/phase-08-input-loss-case-driver-inventory.md).

Root serial commands used `.local/phase08-input-loss-all-cases.py --run` for the
full selection, then explicit resumed selections. The three exact campaign
arguments and hashes are in the current ledger. The ignored root helpers performed
only recorded recovery/probes; public [suite](../../scripts/phase08-emulator-suite.py)
and [protocol](../benchmarks/phase-08-emulator-voice-protocol.md) retain the reusable
owned-fixture procedures. Final checks used `graphify update .` and the guarded
restoration helper with the explicit known-restoration/owned-cleanup switches.

## 9. Concrete manual checklist and remaining gates

1. Upgrade a compatible capstone signing lineage in place using the ARM64 DataQa
   APK from the artifact ledger. Open Profile, Calendar and Notes; verify saved
   content/preferences and version0.8.0-data-qa. Preserve app data.
2. In airplane mode, trigger an owned test reminder and Answer. Expect readable
   text/optional installed offline TTS, no ACK and no automatic microphone.
3. Deliberately hold, speak ACK, release, copy/review and Confirm. Expect the
   reminder ACKNOWLEDGED/closed while its task remains TODO. If recognition is
   wrong, cancel/edit/use manual controls; no action should occur from speech alone.
4. On a fresh reminder, review/confirm ten-minute snooze. Expect one replacement
   and later re-delivery. Deny/interrupt microphone access and verify a visible
   warning, preserved draft, no late result and working typed/manual review.
5. Record phone model/API/RAM, offline voice, actual audibility and locked/background/
   reboot/OEM behavior. Restore settings and remove only owned fixtures through UI.

**NOT RUN:** V05; all 48 physical rows and signed human acceptance; physical ARM64,
API30/31/newer and low-memory execution; live accents/quiet/noise, audibility/audio
routes, OEM/natural-Doze behavior, TalkBack/keyboard, battery and matched phone
performance/alarm-drift qualification. Follow the [full manual](../../qa/PHASE-08-MANUAL.md).

The emulator investigation is complete for this bounded run; the three failures
remain unresolved. Phase08 is not passed. Physical acceptance remains
**AWAITING DEVICE VALIDATION**, and the automated release gate remains **BLOCKED**.
