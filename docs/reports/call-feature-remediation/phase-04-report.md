# PHASE CALL-FIX 04 — Backend prompt and tool contract / Completion Report

> **Deployment follow-up:** the owner approved the scoped backend exception, the final backend was deployed, and the existing agent was updated/read back. [Current deployment report](backend-deployment-follow-up.md) supersedes the historical publication/authorization blockers below. Current overall status: **AWAITING DEVICE VALIDATION**.

**Branch / commit SHA:** feature/uniguide-inspired-ui-overhaul / 1757a0ac77271aab3c3139ba5c24865c0a8136bd + uncommitted working changes  
**Date/time UTC:** 2026-11-17T02:19:54.882Z  
**Device(s) used:** NONE — physical inventory/validation NOT RUN  
**Status:** `BLOCKED`  
**Phase approval provenance:** Owner: “approved, fix everything without stopping. just give me a list of checks i can do manually to check after everything is finished”. Continuous execution/device deferral recorded in [OWNER-AUTHORIZATION.md](OWNER-AUTHORIZATION.md). Backend repository exception remains pending.

## 1. Scope completed

Prepared a dedicated voice persona describing current planner capabilities, concise speech, trusted save receipts, clean titles and multiple structured items. General chat prompts are preserved. Frontend and prepared backend tool definitions match. Provisioning detects outdated parameter schemas.

New fixes adapted the current implementation; no wholesale legacy import. This report is task-scoped and does not replace original migration-phase reports.

## 2. Change summary

| File/module | Change and reason | Test evidence |
|---|---|---|
| `backend_integration/call-feature-remediation/call-feature-remediation.patch`: voice route/service, contract JSON and provisioning script; `src/cloud/voiceConversation/personaPolicy.ts` | Prepared a dedicated voice persona describing current planner capabilities, concise speech, trusted save receipts, clean titles and multiple structured items. General chat prompts are preserved. Frontend and prepared backend tool definitions match. Provisioning detects outdated parameter schemas. | Selected backend tests include prompt isolation, tool contract behavior, provisioning default and schema mismatch checks; 78 selected tests passed overall. |

## 3. Tests and real outcomes

The following are shared final integrated gates, not nine independent full builds.

| Check | Exact command/procedure | Outcome | Evidence |
|---|---|---|---|
| Typecheck/lint/Jest | `npm run preflight` | PASS: 145 suites, 2,022 tests passed, 1 skipped | [preflight-final.log](preflight-final.log) |
| Architecture | `npm run check:architecture` | PASS: 378 modules; 0 cycles/forbidden dependencies; 105 isolated offline leaves | [architecture.log](architecture.log) |
| Backend selected regression | `python -u -m pytest -p pytest_asyncio.plugin tests/test_voice_conversation.py tests/test_deepseek.py tests/test_online_voices.py -q` | PASS: 78 tests | [backend-tests-final.log](backend-tests-final.log) |
| Backend critical lint | `python -m ruff check --select E9,F63,F7,F82 app/api/v1/voice.py app/services/voice_conversation.py app/clients/deepseek.py scripts/provision_voice_agent.py tests/test_voice_conversation.py` | PASS; full Ruff not claimed | [backend-critical-lint.log](backend-critical-lint.log) |
| Android | JDK 17: `.\gradlew.bat :app:testDebugUnitTest :app:assembleDataQa -PreactNativeArchitectures=arm64-v8a -PlafinaDirectProviders=false -PlafinaProviderTesting=false --no-daemon --no-parallel --console=plain --max-workers=2` | PASS: APK and 8 JVM suites/76 tests | [android-build-final.log](android-build-final.log), [artifact.json](artifact.json) |
| Patch applicability | `git apply --check --verbose --directory=.local/call-feature-remediation-base backend_integration/call-feature-remediation/call-feature-remediation.patch` | PASS: six files, pinned backend source | [backend-patch-check.log](backend-patch-check.log) |
| Device/call/provider | [Manual checklist](MANUAL-CHECKS.md) | HUMAN REQUIRED / NOT RUN | No device identifier or live audio evidence |
| Backend publication/agent update | Existing backend and existing agent only | NOT RUN / authorization and access prerequisite | [Backend README](../../../backend_integration/call-feature-remediation/README.md) |

Backend tests used a local targeted test harness inside this checkout with temporary dependency paths and pytest plugin autoload disabled. No production credentials/provider calls were used; a complete fresh backend checkout/full backend suite was not tested. Initial failed logs are retained; final gates above supersede them.

## 4. Performance and device matrix

Baseline/new phone timings, PSS, offline speech proof and alarm drift: **NOT RUN**. Actual n=0; p50/p95 are null in [latency-benchmark.json](latency-benchmark.json). Targets are documented goals only. APK hashes/build metadata/JVM counts: [artifact.json](artifact.json). No invented device identifier or timing result.

## 5. Reliability, privacy, permissions, licenses

Confirm-before-write, account ownership/mode/consent guards, local transactional persistence and text/manual fallbacks remain. No new manifest permissions, wake word, always-on background mic, bundled Kokoro or provider keys were introduced by these call fixes. Normal QA BuildConfig has empty direct provider fields and provider testing disabled. Existing QA harness controls make this a QA artifact, not a release.

NOT DEPLOYED. Automatic approval review rejected remote backend Git-tree creation under AGENTS.md's write prohibition. A scoped exception and existing-project/agent access are pending. Live denial may persist until deployment.

## 6. Human phone verification

After authorized deployment, ask whether Lafina can add/edit planner items and prepare a card. Expected: accurate capabilities and no success claim before confirmation. Production check NOT RUN.

Preconditions, install guidance, detailed expected UI/audio and failure paths are in [MANUAL-CHECKS.md](MANUAL-CHECKS.md). Use privacy-safe timings and identifiers, not transcript/credential dumps. The agent cannot certify physical behavior from mocked tests.

## 7. Docs/ADRs changed

[Reviewer handoff](README.md), [manual checks](MANUAL-CHECKS.md), [authorization record](OWNER-AUTHORIZATION.md), [backend patch instructions](../../../backend_integration/call-feature-remediation/README.md), build and benchmark JSON. Architecture/import cycle gate passed as above. No standalone Graphify run.

## 8. Open blockers and recommended next steps

Complete the device checklist. Obtain a specific exception to the backend-write prohibition and access to the existing deployment/agent before publishing the prepared patch. Automatic approval review rejected the remote tree creation; no successful remote mutation is claimed. Existing production behavior may still include the old denial/latency until deployment.

## 9. Review decision

- [x] Final automated mobile/build gates passing; selected backend checks passing
- [ ] Manual device tests completed and human-confirmed
- [x] Scope limited to call fixes inside the authorized checkout; remote backend publication not performed
- [x] Evidence and pending work recorded

STATUS: BLOCKED
STOPPED — awaiting explicit human approval/device validation
