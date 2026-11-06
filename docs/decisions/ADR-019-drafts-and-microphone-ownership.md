# ADR-019 — Speech drafts and token-fenced microphone ownership

**Status:** accepted (owner pre-authorized AGY-PORT 00–13 in `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md`)
**Date:** 2026-11-06
**Phase:** AGY-PORT 05
**Review owner:** human developer

## Context / problem

Before this phase:

- **Recognition went straight to a command.** Releasing the Voice mic sent the Whisper transcript to the assistant. A misheard phrase was prepared at once, with no chance to fix the words first. Phase 04 had already stopped direct writes, but there was still no editable draft.
- **Unsent text could be lost.**
  - Closing the Voice sheet dropped typed or dictated text, and so did Android back.
  - The Chat composer lived inside `ChatScreen`, so switching tabs lost it.
  - Chat clear-history said nothing about the composer.
- **The microphone lease was not fenced.** `LafinaMicrophoneLease` was a process-local enum holder.
  - It was re-entrant, so a second Whisper start counted as the "same" owner.
  - Its `CAPTURE_BUSY` branch called `release(SPEECH_TO_TEXT)`. A rejected contender therefore released the active capture's lease.
  - The meeting bridge only *peeked* at the holder before starting the foreground service. If the service then lost the race, it stopped silently while JS believed recording had started.
  - The meeting service released the lease after a 3 s `join` even when the capture thread was still running.
  - JS recognized the busy reply only by message text. The voice-assistant wording ("…in use by voice assistant.") matched none of its patterns, so it was shown as a generic recording failure.

## Decision

### 1. Speech ends in an editable draft (`VoiceModal`)

- **Release → draft only.** Releasing the mic puts the transcript into the sheet's text field. Nothing is prepared, sent or saved.
- **Prepare → review → Confirm.** The arrow button (`voice-send-button`, now labeled "Prepare command for review") runs the Phase 04 review. Only Confirm writes.
- **Cancel keeps the text** in the field.
- **Questions back keep the sheet open.** A clarify or invalid reply keeps the sheet and the draft instead of auto-closing.
- **Use draft in Chat** places the text in the Chat composer and opens Chat, without sending.

### 2. Keep/Replace for unsent text

- `useDraftProtection`, adapted from donor blob `400dc944`, asks before dictation overwrites different unsent text. Default, back and outside-tap all mean **Keep**.
- A version fence ignores any late decision after the owner, text or review state changes.
- The dialog is AGY-themed (`DraftDecisionDialog`), not `Alert`.

### 3. Composer drafts survive navigation

- The Chat composer reads and writes `chatDraftStore`. It is memory-only and owner-keyed: never persisted, synced or logged. Tab switches, tool sheets, the meeting recorder and the Voice handoff all keep the draft.
- On an account change, `App` calls `chatDraftStore.retainOnly(userId)`, which drops other owners' drafts. On sign-out it drops all drafts and closes the Voice sheet.

### 4. Guards on leaving

- **Voice sheet:** close, backdrop, Android back and discard all ask first while there is text or a waiting review.
- **Chat:** Android back with composer text asks before `BackHandler.exitApp()`.
- **Chat Cancel:** puts the reviewed text back into an empty composer.
- **Chat clear-history:** keeps the composer and says so.

### 5. Late work is retired

These events retire the active capture: close, reopen, account switch, background (AppState) and unmount. The capture generation (`activeCaptureRef`) advances, so a late Whisper result is ignored.

### 6. Token-fenced lease

`MicrophoneLeaseRegistry`, a pure JVM class, sits behind the `LafinaMicrophoneLease` facade.

- **Fresh tickets.** `tryAcquire(holder)` returns a fresh `Ticket` (unique token) or `null`. While any ticket is active, every acquisition fails, including one by the same holder kind.
- **Exact release.** `release(ticket)` releases only the exact active ticket. A rejected contender has no ticket, and a stale or foreign ticket is a no-op.
- **OS file lock.** The lease also takes an OS advisory `FileLock` on `noBackupFilesDir/lafina-microphone.lock`, as the donor did (blob `fab9afbb`).
  - The kernel drops it on process death.
  - The process never opens a second descriptor of a lock it holds. This POSIX rule comes from the donor.
  - If the lock file cannot be used (I/O failure), the lease falls back to the in-process fence. It does not leave the microphone permanently busy.

### 7. Release only when the worker returns

- **Whisper.** The worker releases its own ticket in `finally`. That happens after AudioRecord is released and any Whisper decode has finished.
  - A cancel during decode now returns a cancelled result, and the late text is discarded.
  - JS settles a cancel at once. The native lease stays held until the worker returns, and a new start meanwhile gets `CAPTURE_BUSY`.
- **Meetings.**
  - The bridge acquires before `startForegroundService`. A busy microphone is a rejected `startRecording` (`MIC_IN_USE`).
  - The ticket is parked in `PendingLeaseHandoff`, and the service claims it. A one-shot 15 s timer releases an unclaimed ticket exactly once; it never releases a claimed one.
  - The capture thread releases its own ticket on every exit path, including AudioRecord init failures.
  - A stop whose worker is still flushing leaves the release to that worker.

### 8. JS watchdog

The JS watchdog (donor blob `e8103725`) bounds the JS capture slot at 90 s. It fires at most once and is cleared exactly once in `finally`. On expiry it cancels natively.

### 9. Busy is recoverable

- **Codes.** `isMicrophoneBusyError` classifies `MIC_IN_USE` and `CAPTURE_BUSY`, and the JS-side `MicrophoneBusyError`.
- **Voice sheet:** shows a busy notice, and typing and Prepare keep working.
- **Meetings:** show "Microphone is busy" with nothing recorded.
- **Reminder call:** falls back to its buttons. A busy microphone does not count toward auto-snooze.
- **Recordings are untouched.** A busy reply never stops or alters an active recording.
- **Imports don't need the lease.** Imported-audio transcription still needs no lease.

## Public interfaces

The React Native module and method names are unchanged:

- `LafinaSpeechToText.startListening/transcribe/stopListening/cancelListening/isAvailable/release`
- `LafinaMeetingRecorder.*`

Rejection codes keep their existing names. `MIC_IN_USE` messages now name the actual holder.

The Kotlin API is internal and changed from `tryAcquire(): Boolean` / `release(holder)` to tickets.

## For later phases (AGY-PORT 10, optional Android recognizer)

An optional Android `SpeechRecognizer` path must:

1. call `LafinaMicrophoneLease.configure(context)` once;
2. call `tryAcquire(MicrophoneLeaseRegistry.Holder.<new holder, e.g. ANDROID_RECOGNIZER>)` before `startListening`, and reject with `LafinaMicrophoneLease.BUSY_CODE` when it gets `null`;
3. keep the `Ticket` in the session object and call `release(ticket)` exactly once. That happens in `onResults`, `onError` or after `destroy()` has returned on the main thread, never from a cancel request alone.

Adding a holder is a one-line enum change. The busy classification in JS needs no change.

## Consequences

- **Fewer accidental sends.** Speech can no longer trigger a planner action by itself.
- **One more tap.** Voice needs one more tap (Prepare) before the review card.
- **Draft prompts appear more often.** Closing the sheet with text asks first. The Phase 04 test now presses Discard, with its original assertions kept.
- **The meeting bridge owns acquisition.** The service accepts only a ticket handed off for its meeting, or acquires its own.
- **Not verified on a device.** Audible capture, real AudioRecord contention and process-kill behavior on a phone were not run in this phase. Host JVM tests cover the lease, including a real second OS process holding the lock and then being killed.
