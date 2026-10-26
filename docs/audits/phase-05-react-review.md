# Phase 05 React review

Date: 2026-10-25 (Asia/Manila). Scope: source inspection, without running
additional builds or tests. This is not evidence of audible speech or physical
device behavior.

Applied the relevant React Native lifecycle, effect dependency, asynchronous
state, accessibility and bounded rendering checks from the installed
`react-best-practices` skill. Web-only Next.js, server and DOM recommendations do
not apply to this Android application.

## Initial source review and subsequent emulator finding

The initial static review found no additional defect in `ReplyMessage`,
`SpeechSettings`, the speech sections of `App`, the typed speech boundary,
shared controls, post-save planner callback and their existing regression tests.
That conclusion was limited: it did not establish that the navigation warning
was visible in a scrolled Android viewport.

Subsequent real-emulator testing by the integrating agent exposed a usability
defect. Pressing Android Back while editing speed controls placed the unsaved
voice warning above the viewport, at the top of the long voice list. The draft
guard existed, but the user could not see its choices without scrolling.

The integrating agent added a regression assertion requiring a visible
`voice-navigation-confirmation` Modal. Before the fix,
`phase-05-navigation-regression-before.log` records **1 failed, 7 passed** in
the eight App speech cases. The fix moves the warning and its Stay/Discard
actions into a sibling Modal outside the ScrollView (`App.tsx`, lines 329–355
at review time), using the existing modal layout and semantic theme colors.
Android modal Back dismisses the prompt while retaining the draft; Discard
performs the pending navigation explicitly. The inline voice warning was
removed. Source inspection of this correction found no further actionable
issue. Final post-fix test/build and emulator results belong in the phase report;
this review does not claim those pending checks passed.

- Written replies render independently of optional speech. Text mode avoids
  initializing or subscribing to speech. Planner mutations complete before the
  optional reply callback; speech failure cannot turn that mutation into a
  failed save.
- Reply initialization and callbacks are guarded against replacement, Stop,
  background entry and unmount. Terminal callbacks cannot reopen a finished
  request. Cleanup invokes disposal before the next client initializes, without
  chaining it behind an older unresolved Stop promise.
- Preview requests use one active identity. Stop clears that identity before
  awaiting native cancellation, so late preview results cannot request speech.
  The preview and its written text remain separate from saved output mode.
- Voice settings do not autoplay or silently persist. Engine initialization
  does not block navigation; a real preferences write does. Edited settings use
  the parent discard guard for tab navigation and Android Back. The corrected
  voice prompt uses a Modal so its actions do not depend on list scroll position.
- Choices expose checked and disabled accessibility states; controls use the
  centralized minimum control height, and status/error text uses the existing
  live-region message component. Voice rows are shown in bounded increments.
- Canned help is explicitly described as fixed text. No microphone, command
  parser, cloud client or automatic scheduling behavior was introduced here.

## Limits and required follow-up

The existing tests inspected use injected adapters. This review does not add to
their reported execution counts. The native owner must still verify offline
voice metadata, callback ordering and lifecycle behavior against the installed
APK. Human phone checks remain necessary for airplane-mode audibility,
intelligibility, first-audible latency, rapid replies, audio focus and TalkBack.
See `qa/PHASE-05-MANUAL.md`; do not infer those results from source review.
