# Call feature remediation — reviewer handoff

Mobile implementation, backend publication and the existing-agent update are complete. The final backend commit is `dfbeecb9a9e9366a6cc41d7fb73635e1d1895c2e`; Vercel Git deployment succeeded. Physical-device/signed-in voice checks remain pending. See [backend-deployment-follow-up.md](backend-deployment-follow-up.md).

## Results

- Online structured planner interpretation replaces the call's eager offline create-card shortcut. A guarded older-agent fallback still works from the student's actual words. Clean title extraction also improves that fallback.
- Read questions do not edit open drafts. Time revisions preserve existing recurrence, event location, task priority and reminder delivery.
- The model cannot approve its own card. Explicit student confirmation is required, repeated structured preparations reuse the same card, stale revisions/results are rejected, and failure messages do not report successful saves.
- The live avatar remains visible above the timer when reply/cards appear. Mic/output levels drive motion; reduced-motion mode is static.
- Interruption/Stop/new turns cancel stale in-flight tools; native playback suppresses late old audio.
- The deployed backend addresses the outdated denial prompt, structured tool guidance, unnecessary handbook retrieval and delayed first tool-stream signaling. The existing agent now has 14 tools, their callback event and normal turn eagerness; unrelated configuration and auth were verified unchanged.

## Evidence

| Gate | Actual result | Evidence |
|---|---|---|
| TypeScript + ESLint | PASS in final preflight | [preflight-final.log](preflight-final.log) |
| Jest | 145 suites, 2,022 passed, 1 skipped | [preflight-final.log](preflight-final.log) |
| Architecture | 378 modules, 0 cycles; 105 offline leaves isolated | [architecture.log](architecture.log) |
| Backend full suite, fresh checkout | 288 passed | [backend-fresh-full-tests-final.log](backend-fresh-full-tests-final.log) |
| Backend critical lint | PASS; full Ruff not claimed | [backend-critical-lint.log](backend-critical-lint.log) |
| Patch application | Seven pinned source/test files checked | [backend-patch-check.log](backend-patch-check.log) |
| Android JVM | 8 suites, 76 tests, 0 errors/failures | [artifact.json](artifact.json) |
| Android arm64 QA APK | BUILD SUCCESSFUL; packaged JS matches generated bundle | [android-build-final.log](android-build-final.log), [artifact.json](artifact.json) |
| Device audio/visual/network/latency | NOT RUN | [MANUAL-CHECKS.md](MANUAL-CHECKS.md), [latency-benchmark.json](latency-benchmark.json) |
| Production backend/agent update | Deployed via Git; agent updated/read back; health/auth probes passed | [deployment follow-up](backend-deployment-follow-up.md) |

The first preflight had one unrelated model-download UI test failure; it passed in isolation and the final complete preflight passed. Earlier Android builds failed due incomplete library outputs and an incompatible Java environment; rebuilding the two libraries and using Microsoft JDK 17 resolved assembly. Earlier failure logs are retained, not treated as final results.

Node v24.19.0, Python 3.14.7, Microsoft JDK 17.0.20.101. Existing branch `feature/uniguide-inspired-ui-overhaul`, base HEAD `1757a0ac77271aab3c3139ba5c24865c0a8136bd`, uncommitted mixed working tree. Unrelated concurrent changes were preserved; no root commit/push was made. No physical device identifier is available because no phone validation was performed. Backend publication used a separate isolated checkout and did not commit the mixed mobile working tree.

## Reports and next action

CALL-FIX 00–08 reports are in this directory, kept separate from the original migration phase numbers. Continuous implementation/device-check deferral follows the [owner authorization](OWNER-AUTHORIZATION.md).

Install/open the QA build, start a new online call and follow [MANUAL-CHECKS.md](MANUAL-CHECKS.md). The owner granted the scoped backend exception. Connector writes were unavailable, so publication used native Git and the existing Vercel Git workflow. The agent was patched in place without rotating secrets or replacing hosting. Direct Vercel log/monitoring access remains unavailable.

STATUS: AWAITING DEVICE VALIDATION. Backend deployment and existing-agent update are complete.
