# Phase06 native session and answered-reminder review

Reviewed2026-10-26 (Asia/Manila). This is source review and regression-test
addition, not executed native tests, microphone validation or physical-device
proof. The phase report owns actual build/test/emulator results.

## Scope

Reviewed `SpeechInput`, its pure session policy, `PcmCapture`, the shared OS
microphone lease, RN module, native answered dictation panel and reminder
activity integration. The Whisper source/model/JNI audit is a separate review.
No legacy source or binary was changed by this review.

## Corrections

- Normal release can unblock an Android PCM read with zero or a negative result.
  Treat that as capture completion when the hold ended/cancelled; keep genuine
  read failure while still holding. Three pure tests distinguish completion,
  error/no-spin and the last positive chunk returned during a release race.
- Optional answered dictation catches permission/start/stop failures and retains
  manual text. A click or delayed permission result never starts capture;
  `ACTION_UP` ends the hold and invokes the intentionally inert click action.
  The caption accurately says closing clears the transient draft; Home cancels
  speech without claiming the retained activity draft was cleared.
- Reentrant cancellation during a native event cannot subsequently allocate a
  preparation/listening timeout. Executor shutdown failure cannot escape the
  disposal path. Native language-unsupported recovery uses the UI's matching
  `LANGUAGE_NOT_SUPPORTED` reason.
- A native reminder's durable identity is insufficient to identify its current
  presentation. Added a presentation ticket independent of database/alarm
  generation. New intents and answered/error transitions invalidate old load,
  action, timeout and delayed-close callbacks. The timeout captures its original
  reminder identity; a new intent removes the old local timer immediately.
  Five pure tests cover different/same-identity replacement, answered timeout,
  delayed error close and returning to an old identity. This changes UI ownership,
  not the durable reminder state machine or ACK/completion semantics.
- An old answered view cannot start capture after its presentation is retired,
  even during the interval before a replacement view finishes loading.

## Reviewed boundaries and limits

Android recognition uses only the API31+ on-device factory. API30 cannot use a
generic potentially network recognizer; it requires the reviewed local model or
honest manual fallback. Platform capability/model metadata still needs actual
airplane-mode validation. A missing local language changes only the next
explicit automatic hold; it does not silently reopen the microphone.

Capture is bounded to15 seconds/240,00016kHz samples. PCM is held in memory,
recording stops before Whisper decode, and worker cleanup retains the OS lease
until cooperative native cleanup completes. The native decoder has its own
timeout/cancellation boundary; this review does not establish observed timings.
Audio focus/mode, revocation, lifecycle, stale callbacks and duplicate sessions
have source guards; OEM behavior and actual microphone release remain device
checks. A stuck hardware/provider implementation cannot be certified by source
inspection or pure tests.

The optional answered panel is created only after the ACK transaction succeeds.
It never interprets or stores recognized words as scheduling operations. Manual
draft and explicit copy/confirm remain separate from received speech. No
microphone starts on Answer, screen creation, resume or permission approval.

Automated tests added by this review: **NOT RUN here**. Root validation command:

```powershell
.\android\gradlew.bat -p android :app:testDataQaUnitTest :app:assembleDataQa :app:assembleDataQaAndroidTest <phase-report build flags>
```

`git diff --check` on reviewed native paths exited0; existing CRLF conversion
warnings are not native test results. Physical offline speech, accents/noise,
real-call focus, repeated holds, TalkBack and low-RAM/battery remain HUMAN REQUIRED.
