# Phase 09 — voice assistant app tools

**Date:** 2026-11-10, Asia/Manila  
**Branch:** `Lem-branch`, uncommitted follow-up to `4371ca8`  
**Device:** Infinix X6880, Android 15, ADB `13195704C2004480`  
**Status:** AWAITING DEVICE VALIDATION  
**Owner request:** Make the voice assistant aware of and able to use the app's calendar, memory and notes, and correct the contradictory scheduling reply.

## Scope and design

The previously installed direct ElevenLabs agent answered independently while the phone prepared a review card; the agent never saw that result. A separate direct test agent now uses client tools to request a reviewed planner change or read requested personal data. The app returns the actual result to the agent. Planner writes still require a user-confirmed review card; the agent must not report a proposal as saved. A confirmation or cancellation updates its conversation context.

Reads use the signed-in owner, bounded outputs and a per-turn request check. Calendar results contain events, tasks and time blocks in a date window. Note search can be partial while indexing; memory is unavailable when disabled. The first direct conversation asks for consent before requested records are sent to the voice provider. Results are identified as untrusted data in the prompt.

This integration is specific to the direct-provider test voice panel. The separate answered-reminder call surface does not yet expose these personal-data or planner tools. The hosted backend and production agent were not changed. Direct chat and voice still use the deliberately credential-bearing private test profile documented in `phase-09-direct-provider-test-20261110.md`.

## Verification

| Check | Result |
|---|---|
| Targeted voice and data tests | PASS: 61 tests before final follow-up adjustment; rerun included in full preflight. `.local/voice-tools-targeted-final.log` |
| Synthetic ElevenLabs tool exchange | PASS: a complete scheduling request called the tool and the reply referred to review/confirmation. An incomplete request sometimes prompted for more details instead of calling the tool. `.local/voice-agent-tool-complete.log` |
| Synthetic ElevenLabs memory, notes and calendar lookups | PASS for specific requests; agent called the read tool and used synthetic data. One earlier vague calendar test timed out without a tool call; no real user data was sent. |
| Full app preflight | PASS: 81 suites, 1,187 passed and 1 skipped, before the final consent guard. After that guard, typecheck, lint and the targeted voice UI tests passed. `.local/voice-tools-preflight-final.log`, `.local/voice-tools-consent.log` |
| Android build and installation | PASS: private ARM64 test APK installed with `adb install -r`. SHA-256 `a32fe3ad7bf91fbb4d5ecba4bd283533b1ee843c906be7ab2ee967a56108b505`. `.local/provider-testing/voice-tools-build-verified.log` and `artifact-direct-private-arm64-v8a.json`. |
| Native Android tests | PASS: `:app:compileDebugKotlin :app:testDebugUnitTest` for x86_64. `.local/voice-tools-native.log` |
| Real phone scheduling review and spoken reply | Owner confirmed the review card appeared and LAFINA asked for confirmation without claiming the event was already saved. |
| Real phone calendar, note and memory reads; final confirmation and reminder surface | NOT YET VERIFIED in this build. |

## Phone checklist

1. Install the private ARM64 build without clearing app data and leave internet on; open Online Mode conversation. Review the new disclosure about sending requested personal records to the voice provider.
2. Ask to schedule a named meeting with a date and start/end time. Expect a review card and a spoken instruction to review and confirm; check the calendar has not changed yet. Confirm and verify the entry exists. Check a follow-up providing missing details.
3. Ask what is on the calendar, what a specific note says, and what LAFINA remembers. Check answers against the signed-in user's data and ensure disabled memory is respected.
4. Verify mute/end and interruption, then separately test reminder calls. None of these checks can be inferred from mocks or the synthetic provider tests.

The test APK contains recoverable provider API keys and must not be distributed. Rotate keys after testing and replace this design before release. The model may ask for clarification or fail to invoke a tool, so review of real device behavior is required; it is not a guarantee of autonomous execution.

STATUS: AWAITING DEVICE VALIDATION  
STOPPED — awaiting explicit human approval
