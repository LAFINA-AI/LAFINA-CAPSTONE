# AGY-PORT 05 — drafts and meeting-safe microphone ownership

Prerequisite: 04. Inventory: 6, 7. Protect PF01–PF03, PF05, PF07–PF12.

## Navigate

Target VoiceModal, Chat composer/navigation, speechCapture, native Whisper/meeting recorder/service, MeetingsContext and meeting import/transcription pipeline. Donor useDraftProtection/voicePipeline/capture watchdog and OS microphone lease/probes. **Retain AGY meeting code**; earlier donor-port advice to exclude meeting integration does not apply to this owner-approved preservation run.

## Execute

1. Recognition ends in an editable draft. Prepare uses Phase 04 review; only Confirm mutates. Keep/Replace defaults to preserving existing unsent text. Voice-to-Chat handoff fills the composer without Send/Confirm. Preserve document format choices, attachments and current meeting entry points.
2. Protect close/back/tab/tool/history-clear navigation against losing unsent drafts. Cancel review retains editable text; discarding a draft never undoes already saved content. Background/account change/unmount retire asynchronous work and private review ownership safely.
3. Port an OS lease with instance/token-fenced ownership and synchronized local state into AGY's native packages. Integrate **Whisper and meeting AudioRecord** before later optional Android STT. Reentrant acquisition by the same enum is not a fresh valid owner. A rejected contender, stale cancel or cleanup must not release a different active lease.
4. Align native cancellation lifetime: hold ownership while cancelled decode/capture still runs; release when the real worker returns. Bound watchdogs and clear them exactly once. Process death releases locks; initialize/recover without a permanent stale busy state.
5. Preserve explicit foreground recording gestures/permission/service behavior, meeting pause/resume/stop/import, keepAudio and transcription/summary consent. A competing mic attempt shows a recoverable busy state without stopping/losing the existing recording. Do not change imported-audio paths to require mic ownership unnecessarily.
6. Test StrictMode lifecycle, late permission/result, close/reopen, background, account switch, stale release, contender rejection, cancellation before native returns, both Whisper↔meeting contention directions, preserved recorded chunks and owned cleanup. Run existing phase06/phase09/online-speech and new draft/native tests.

## Acceptance

No lost draft or accidental command send after STT; no microphone release by the wrong owner; valid meeting recording/import/transcription remains usable. Typing is available when capture is busy/unavailable. Product consent is never bypassed because implementation is unattended.

Deliver `reports/phase-05-drafts-microphone.md`, ownership/lifecycle notes and manual dictation/meeting interruption checklist. Audible recording/real-mic performance remains NOT_RUN without authorized observation.
