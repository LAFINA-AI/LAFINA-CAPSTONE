# AGY-PORT 10 — compatible speech controls and readiness

Prerequisites: 05, 09. Inventory: 17, 18, 19. Protect PF01–PF03, PF08–PF12. No Kokoro and no default-engine switch.

## Navigate

Target `ai/tts/ttsService.ts`, STT/VAD/native capture, cloud speech/provider and entitlement logic, Profile/preferences, call/meeting lifetimes. Donor speechEngineStore/Android speech bridge/offline validation/SpeechEngines and readiness/customization/recovery tests. Adapt to the pinned target wrapper, not donor Kokoro paths.

## Execute

1. Characterize current Whisper default, `react-native-tts` neutral settings and per-feature entitled cloud speech behavior, including admin/student_pro differences. Preserve cloud provider selection, timeout/cancel/audio-file cleanup and local/text fallback.
2. Add versioned owner-scoped installed English offline voice preferences, eligible engine/voice choice, speed/pitch, neutral reset, Preview and Stop. Positively verify installed offline capability; when metadata is unknown use supported platform validation or report unavailable, never a silent network voice/download. Retain the current default when no explicit choice exists.
3. Inspect react-native-tts 4.1.1 source and map speed factors to its normalized rate or documented native transform bypass. Document the neutral mapping, clamps and unsupported-provider behavior. Do not copy donor 0.5–2.0 factor directly into an incompatible wrapper scale. Keep cloud voice parameters unchanged unless already supported.
4. Add bounded init/probe/readiness checks, distinguish service existence from English readiness, retire late callbacks and show typing/text/recovery. Preview/Stop cancels only owned playback; account changes/focus loss/active calls/meeting recording cannot cause another session's playback to be stopped or restarted unexpectedly.
5. Optionally add explicitly selected Android on-device English STT where version and capability support it, using the same microphone lease. Whisper stays default and remains available on Android 11/unsupported devices. No generic network recognizer or silent model/language-pack download. If optional engine can't be verified, defer that engine alone while finishing system-TTS controls/readiness.
6. Test saved/default/reset settings, limits, voice missing/network-required/unknown, initialization/hang/cancel/late callbacks, owner switch, microphone contention, Preview ownership and entitled cloud success/error/offline fallback. Run native tests/build and the preserved meeting/call/speech suites.

## Acceptance

AGY's current speech defaults/cloud entitlement behavior remains working; explicit local choices are offline eligible and recoverable; no mic contention regression; typing always works. Actual voice audibility, accent/noise and physical focus/interruption checks stay NOT_RUN until observed.

Deliver `reports/phase-10-speech.md`, rate/provider/voice-selection ADR and manual airplane-mode/voice/mic/cloud-fallback checklist.
