# Phase06 React Native speech-input review

Reviewed2026-10-26 (Asia/Manila). Scope: typed speech boundary, session hook,
SpeechInputPanel, their two test suites and the App integration that stops TTS
before capture. This is source/injected-adapter evidence, not microphone or
physical-phone recognition proof.

Applied the relevant lifecycle, effect dependency, asynchronous state,
accessibility and bounded-input checks from the installed React best-practices
skill. Web/Next.js/server recommendations do not apply to this Android UI.

## Finding and correction

Strict TypeScript initially found two fixture-only typing errors even though
Jest passed: the mock start response widened `engine` to `string`, and the
pre-capture mock inferred `Promise<undefined>` while its deferred test returned
`Promise<void>`. The fixture now declares the engine literal and the callback's
`Promise<void>` return type. No production behavior changed in this review.

The failed result remains in
[the initial strict check](../reports/evidence/phase-06-ui-typecheck-reviewed.log).

## Reviewed behavior

- Microphone permission is checked only on an explicit hold. Completing an OS
  permission prompt never begins capture; a new hold is required. Release while
  permission or TTS cleanup is pending invalidates the request.
- One active session identity and cancellation generation guard delayed work.
  Release before recording cancels preparation. Recording release requests
  transcription; background/unmount cancels and disposes without auto-resume.
- The bridge bounds request identities, languages, engine choices, transcript
  length and native milestones. Invalid native messages cancel the affected
  current work toward a text fallback; terminal/stale sessions cannot restore
  an older result.
- Manual draft text stays editable when speech is absent, denied, interrupted or
  transcribing. Recognized text is a separate editable field; copying and
  confirming are explicit actions. No command interpretation, planner mutation
  or transcript persistence is introduced by these components.
- Choices and hold/Cancel controls expose checked, disabled and busy states.
  Labels explain holding/releasing and the permission retry. Shared semantic
  tokens are used. The help reply is stopped/disposed before optional capture.
- Diagnostics display engine/timing metadata separately from the reviewed
  transcript; capability is labelled a candidate rather than proven offline
  recognition or language accuracy.

No additional actionable production defect was identified in this source review.
This does not certify native resource ownership or visible layout on a device.

## Actual checks

| Check | Result | Evidence |
|---|---|---|
| Two focused Jest suites before fixture annotations | PASS,39 tests;22.695s | [Initial focused log](../reports/evidence/phase-06-ui-bridge-reviewed.log) |
| Strict TypeScript after annotations | PASS,exit0 | [Fixed strict log](../reports/evidence/phase-06-ui-typecheck-fixed.log) |
| Two focused Jest suites after annotations | PASS,39 tests/2 suites;6.608s | [Fixed focused log](../reports/evidence/phase-06-ui-bridge-fixed.log) |
| Scoped ESLint | PASS,exit0 | [Lint log](../reports/evidence/phase-06-ui-lint-reviewed.log) |
| Scoped Prettier | PASS,exit0 | [Format log](../reports/evidence/phase-06-ui-format-reviewed.log) |

Commands covered the five owned TS/TSX source/test files; no Android build,
instrumentation, audio recording or full preflight was run by this review.
The root phase report must supply its own later final-source checks.

## Device follow-up

Verify actual hold/release and Cancel layout, the OS permission dialog, denied
and revoked access, engine failure, Home/lock/call interruption, rapid holds,
TalkBack and offline recognition on the named device. An injected callback is
not a recorded spoken phrase or a WER/latency measurement. Native cross-process
microphone exclusion and model cleanup require separate native/device evidence.
