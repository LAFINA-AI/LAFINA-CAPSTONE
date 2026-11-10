# Phase 09 — app-controlled voice actions / follow-up report

**Branch / base:** `Lem-branch`, `cae65fec4b0efc25dc343e3f30a4d216defa19aa`
**Date:** 2026-11-10 (Asia/Manila)
**Authorization:** user requested continuing voice actions, removing the initial tool-call dependency and preventing inaccurate provider speech before decisions.
**Device tested:** NONE in this run. A previously recorded Infinix X6880 / Android 15 was not verified here.
**Status:** AWAITING DEVICE VALIDATION; no APK was built or distributed.

## Changes

The native conversation transport can be started with app-owned audio. It discards every provider audio frame for this panel, including after an interruption. The JavaScript bridge fails closed if the installed native bridge cannot report support. The answered-reminder conversation retains its existing transport behavior and has not gained planner tools.

The panel starts recognized scheduling requests directly from finalized student turns, without waiting for an agent tool call. Drafts use the deterministic local parser and the student’s own words. Missing names, dates, times and block duration trigger a clarification as applicable. A later missing date or time can replace an unsaved proposal; conflicting changes are refused with instructions to cancel and retry. A spoken yes does not confirm. An unsolicited or duplicate agent tool call does not create a proposal. Cancel, closure, account change and expired operations cannot save a planner entry.

For recognized planner actions, app-owned local TTS reads the actual clarification or review. Native capture pauses during local playback and respects the student’s mute choice; the on-screen Stop control interrupts speech. Provider action text is suppressed. Confirm or Cancel ends the provider session, waits for native release, then uses local TTS to speak the actual decision when the screen and speech request are still active. The visible result remains available when speech or release fails. The UI identifies the device voice and says when a new conversation is needed. Explicit memory results also use app-owned speech. General provider text is spoken locally only for selected questions or greetings and is filtered for action-claim language; other replies remain text-only.

The parser uses bounded English-oriented action cues and deterministic heuristics. It can fail to understand a request or interpret it incorrectly; students must inspect the card, and conflicting changes may require restarting. The app does not guarantee arbitrary-language comprehension or that model-generated general answers are factually correct. Handbook answers and personal-data access remain governed by their existing modes. The prompt contract proposal is in `docs/plans/lafina-prompt-contract-v1.md`; no hosted agent or backend prompt was changed.

## Tests and evidence

| Check | Command / outcome |
|---|---|
| Full preflight | PASS: `npm run preflight`, 84 suites, 1,211 passed and 1 skipped; 259 modules passed architecture checks. Log: `.local/voice-action-final-current.log`. This run preceded the final test-only general-speech assertion. |
| Targeted tests | Voice UI, controller, native gate handshake and grounded-draft Jest suites: PASS: 73 tests after the missing-name and confirmation-race changes; after adding the general-speech test, the voice UI suite passed all 21 tests. Tests use fake audio and transport. |
| Native Android | Repository-local Gradle home; installed Gradle 9.3.1 command `:app:compileDebugKotlin :app:testDebugUnitTest -PreactNativeArchitectures=x86_64`: PASS, `BUILD SUCCESSFUL`. Includes pure JVM audio-gate rule test. The temporary local Gradle cache was removed after the run. XML in `android/app/build/test-results/testDebugUnitTest/`. |
| Live provider / Android phone / speech / lifecycle | NOT RUN. No benchmark JSON or device measurements were collected. |

Earlier test runs caught a stale-card race and a fabricated default title; both were fixed and their focused scenarios rerun. No credentials or private APK were committed or distributed. The old credential-bearing direct-provider test profile is not safe to distribute or release.

## Manual phone checklist — NOT RUN

1. Privately provision and install a build containing the native gate and these JavaScript changes. Open Online Mode voice, review the disclosure and grant microphone access. Check that an older build without the native capability refuses to start the app-owned audio mode.
2. Ask for a time block without a name, date, time or duration, then give each missing item across turns. Verify only app-owned prompts are spoken, the microphone pauses during speech, and no planner entry exists before Confirm. Tap Stop during speech and continue. Verify the card contains the words and times actually requested.
3. Give a missing date after an undated task card appears. Verify the revised card replaces the earlier unsaved card. Say “yes” and verify nothing is saved; tap Confirm, then compare the spoken and displayed result with the actual planner entry. Confirm the conversation ends and can be started again.
4. Repeat using duplicate requests, Cancel, a conflicting time, TTS unavailable, and closing/backgrounding while a request or save is in flight. Check no unconfirmed or duplicate entry appears and no delayed audio plays after closure. Observe the microphone/mute indicator and test an incoming reminder interruption.
5. Ask a general question and a planner lookup. Check the device-voice/text-only behavior and that no provider preamble claims an action was saved. Test both direct test and supported backend voice modes; test the separate answered-reminder surface independently.

## Review

- [x] Automated app and native checks completed as listed
- [ ] Human phone/audio validation
- [x] Explicit card confirmation retained
- [x] No hosted prompt change or credential-bearing APK distribution

STATUS: AWAITING DEVICE VALIDATION
STOPPED — awaiting explicit human approval
