# Phase 09 voice action audit follow-up

**Branch / base:** Lem-branch / cae65fec4b0efc25dc343e3f30a4d216defa19aa
**Date:** 2026-11-10 (Asia/Manila)
**Device:** none verified in this run; `adb devices -l` could not start the daemon in the sandbox. Previous reports identify an Infinix X6880 / Android 15, but it was not verified here.
**Status:** BLOCKED — reliable multi-turn and guaranteed truthful spoken outcomes remain unresolved; device validation not run.
**Authorization:** user requested the voice action audit and improvements on this branch.

## Scope and changes

- Stop late asynchronous intent extraction from preparing a voice review after the conversation closes or changes; this does not save a planner entry.
- Prevent concurrent or repeated direct-tool requests from replacing a pending card; reject a tool call made after a cancellation utterance. A simple explicit spoken cancellation retires the card without saving. Confirm still requires the card button.
- Added UI tests for two-turn tool input, duplicate calls, cancellation and ending during extraction. These use a synthetic agent and transport, not real audio or model behavior.
- Proposed `docs/plans/lafina-prompt-contract-v1.md`; no agent, hosted backend, or production prompt changed.

## Tests and evidence

| Check | Command | Result |
|---|---|---|
| Full app gates | `npm run preflight` | PASS: typecheck, lint, 82 suites / 1,198 passed / 1 skipped, architecture (258 modules, no cycles). This run preceded the last test-only transcript adjustment. Console contained existing test warnings. |
| Final voice UI | `npm test -- --runTestsByPath __tests__/ui/voiceConversationUi.test.tsx` | PASS: 14 tests after the final test adjustment. |
| Typecheck/lint | `npm run typecheck` and `npm run lint` | PASS before the final test-only adjustment. |
| Android | `cd android; .\gradlew.bat :app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64` | PASS, BUILD SUCCESSFUL; required access to existing Gradle cache. No APK built or installed. |
| Device, live provider, benchmark | NOT RUN | ADB daemon unavailable in sandbox; no phone/audio results or benchmark JSON. |

## Limitations and risks

The direct provider reconstructs multi-turn requests itself. The app validates and displays its proposal, but does not verify that every reconstructed detail was actually spoken, and the provider may omit the tool call. A context message after confirmation or cancellation cannot guarantee speech is delivered or matches the actual outcome. A deterministic app-owned response path and grounded, stateful slot collection are still required for the requested guarantee. Spoken cancellation supports only a narrow explicit phrase; review card controls remain authoritative. The non-direct voice mode still generates an independent response and does not receive a tool result. Duplicate prevention applies while a request is being prepared, a card is pending, or a tool is repeated on the same user turn; a genuinely repeated later request can still produce another card and must be reviewed. Review proposals are in memory, not durable across process death; closure cannot confirm them, and the student must start again. Note that the backend prompt inspected is a local reference, not proof of deployed production state.

No secrets committed and no credential-bearing APK distributed. The private direct-provider test profile described in existing reports embeds recoverable credentials and is not a release design. No latency, alarm, STT or TTS performance measurements were made.

## Human phone verification — NOT RUN

On a privately provisioned test build containing these changes, open Online Mode voice and consent to the disclosure. Ask to create a named task or event across several turns with a missing date/time, then provide the missing detail. Verify the card matches only what was said and nothing appears in the planner before tapping Confirm. Check actual spoken words against the card and, after confirming, against the saved entry; repeat with a refused/failed save. Say “cancel that” while a card is pending and check no entry is saved. Repeat a request and verify only one card appears; close or background the app while extraction is in progress, reopen, and verify no unconfirmed entry was created. Test a new session after process termination, and inspect calendar/reminder behavior separately. Do not distribute the private test APK. Real speech, interruption, provider failures and phone lifecycle remain unverified.

## Review decision

- [x] Automated app and native checks run as above
- [ ] Guaranteed correct spoken outcome / reliable grounded multi-turn flow
- [ ] Human device checks completed
- [x] Prompt proposal identifies mode boundaries and deployment uncertainty

STATUS: BLOCKED
STOPPED — awaiting explicit human approval
