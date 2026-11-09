# Phase 09 follow-up — Study preference and reminder calls

**Date:** 2026-11-09 (Asia/Manila). **Device:** Infinix HOT 50 Pro+ / X6880, Android 15, available but this change has not been installed or tested on it. **Status:** BLOCKED / incomplete. The owner requested both local preference recognition and automatic online conversation after answering a reminder call.

## Scope and changes

The chat orchestrator now recognizes narrow first-person study-time preferences before scheduling, stores the preference in local chat memory, and attaches the existing undo notice transactionally. It respects the memory setting and excludes explicit scheduling commands. Stored memories remain available to chat even when the backend extraction route returns 404. This does not deploy or change the memory backend branch. Existing wrongly created time blocks are not automatically removed.

Files: `src/ai/studyPreference.ts`, `src/ai/chatOrchestrator.ts`, `__tests__/cloud/chatMemoryReliability.test.ts`.

Automatic online conversation for answered reminder calls is **not implemented**. The current dispatcher starts its own automatic capture and reminder speech, while the online conversation has a separate microphone lease, audio focus, consent and lifecycle. A correct change must coordinate these, preserve manual Snooze/Acknowledge and reminder-generation handling, and provide fallback and teardown on denial, failure, backgrounding, ending or account change.

## Checks

- Targeted Jest memory suites: PASS, 43 tests.
- `npm run typecheck`: PASS.
- Android: `android/gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest --offline --no-daemon --console=plain -PreactNativeArchitectures=x86_64`: PASS; `.local/study-preference-native.log`.
- `npm run preflight`: PASS, 76 suites / 1,154 tests and one skipped; `.local/study-preference-preflight.log`. It started before the final one-line memory prompt change; the targeted suites and typecheck/lint were rerun after that change.
- Physical-phone preference, new APK, online reminder-call behavior, acoustic pause/interruption and alarm checks: NOT RUN.
- Performance, memory consumption and alarm drift benchmarks: NOT RUN.

## Manual verification after installation

1. Open the updated app and enable Memory. Type `I like studying between 10pm to 2am`. Expect a memory notice and no new time block. Check Profile → Memory and Undo.
2. Disable memory and repeat with a different preference. Expect no memory saved. Re-enable it and request `Schedule a study block from 10pm to 2am`; it should use the normal scheduling review, not save a preference.
3. The earlier incorrect `I Studying` block remains in Calendar; inspect it and remove it manually if unwanted.
4. Online reminder-call handoff remains unimplemented, so do not expect it to work yet. Its integration and human device checks remain required.

## Review

No next phase is approved or complete. The memory fix has automated coverage; the call request and device checks remain open.

**STATUS: BLOCKED**  
**STOPPED — awaiting explicit human approval**
