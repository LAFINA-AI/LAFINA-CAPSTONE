# Phase 09 — voice memory and onboarding follow-up

**Date:** 2026-11-10, Asia/Manila  
**Branch:** `Lem-branch`, uncommitted changes following `4371ca8`  
**Device:** Infinix X6880, Android 15, ADB `13195704C2004480`  
**Status:** AWAITING DEVICE VALIDATION  
**Owner request:** Fix a spoken study preference being handled as a time block; seed optional name, tone and study preferences during onboarding; expose a developer onboarding replay.

## Scope and changes

- Explicit spoken memory requests and first-person study-time preferences are handled before planner parsing. The direct voice panel saves the preference locally on a final user turn and gives the agent the actual result. The dedicated test agent has a `save_lafina_memory` client tool. Duplicate facts do not create duplicate memories; disabled memory is respected. Existing incorrectly created time blocks are not removed automatically.
- Onboarding has an optional preferred name and casual/professional tone step. Explicitly selected study periods can also seed local memories. Memory-off means no onboarding facts are saved. Settings store memory identifiers only, not duplicate copies of names or tones; deleting a memory prevents it being included in the voice onboarding context.
- In debug/test builds, Profile → Developer → Replay onboarding reopens the flow. It pre-fills existing scheduling preferences, can be cancelled, and does not clear unrelated data. Replay does not queue the first-run product tour.
- Onboarding identity context is supplied to the direct voice provider only after the personal-data disclosure is accepted and while memory is enabled. Memories are scoped to their account and are not synced by the current memory architecture.

## Checks and evidence

| Check | Outcome |
|---|---|
| Focused voice and onboarding tests | PASS: 55 tests before the final additional regression check. `.local/voice-memory-onboarding-targeted-latest.log` |
| Synthetic ElevenLabs memory test | PASS: `save_lafina_memory` was invoked and answered; no scheduling tool was called. |
| Synthetic ElevenLabs schedule test | PASS: agent used the schedule review tool and described confirmation after a preamble. `.local/memory-agent-schedule-recheck.log` |
| Full app preflight | PASS: 82 suites, 1,198 tests passed, 1 skipped. `.local/voice-memory-onboarding-preflight-final.log` |
| Android build and installation | PASS: arm64 APK installed with `adb install -r`; SHA-256 `d51bc314b9c18b5eb754334899d81caa82d5b361758bed5d4fff06491154b824`. `.local/provider-testing/voice-memory-onboarding-build-final.log` and `artifact-direct-private-arm64-v8a.json` |
| Android native unit tests | PASS for the preceding tool-message change; no Kotlin source changed in this follow-up. `.local/voice-tools-native.log` |
| Phone spoken study preference | Owner confirmed it was saved as memory without creating a new time block. |
| Phone onboarding replay and identity context | Owner confirmed preferred name and tone were saved and used in a new voice conversation. |
| Phone memory-off, cancel replay and meeting regression | NOT YET CONFIRMED on device. |

## Manual phone checks

1. Open the private test app in Online Mode. Say “Remember that I like studying between 10pm and 2am.” Expect a saved-memory response and the fact in Profile → Memory; no new time block should appear. Check the previously created incorrect block manually and remove it if desired.
2. In Profile → Developer, choose Replay onboarding. Check existing settings are prefilled. Enter a preferred name and choose a tone, complete the flow, then verify both facts in Profile → Memory and ask the voice assistant to address you accordingly.
3. Repeat with memory off; identity facts must not be saved. Cancel a replay and check existing data remains. Test a normal scheduled meeting to ensure its review card still requires confirmation.

The private test APK contains recoverable provider keys. Do not distribute it; rotate the keys after testing. User memory is local to the account on the phone and is not currently synced. The direct voice agent is a test setup, not a release design.

STATUS: AWAITING DEVICE VALIDATION  
STOPPED — awaiting explicit human approval
