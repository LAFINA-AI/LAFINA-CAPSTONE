# Phase 09 ElevenLabs phone checks — NOT RUN

Preconditions: backend owner has deployed the migration and server-held key; install `android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk` on an appropriate ARM64 QA phone (or start Metro for a matching debug APK). Do not clear user data, uninstall, or force a downgrade to bypass an installation error. Use an existing entitled test account and a phone with an installed offline TTS voice. Do not export real student schedules, tokens or audio into reports.

1. Open Chat in **Offline Mode**, keep Wi-Fi enabled, and tap read aloud on a synthetic reply. Expect local speech, no capabilities/TTS request, and normal local scheduling/Notes/calendar controls.
2. Enable **Online Mode**, send a synthetic general question, and wait for DeepSeek's written answer. Tap its existing speaker button. Expect ElevenLabs audio after text is visible. Speech is not automatically requested while text is generated.
3. Tap Stop while audio downloads and again during playback. Expect no late cloud audio and no unexpected local fallback. Tap two replies rapidly; only the latest should continue.
4. Switch Offline Mode during synthesis; background/leave Chat; change the active account. Expect the old Chat speech session to stop and no old account reply to play.
5. Disconnect the internet or test an unavailable/limited TTS server. Expect the written reply to remain and installed local TTS to remain usable. With no local voice, retain text/manual controls and the existing speech error indication.
6. Check old-server compatibility using a backend without the new capabilities route. Expect local speech; there must be no POST to the retired Gemini synthesis path.
7. Use airplane mode to create, edit and acknowledge a synthetic reminder. Expect the same offline manual and local voice behavior; acknowledgment must not complete the task. Reboot/permission/full-screen delivery remain governed by existing phone QA, not this provider test.
8. Interrupt playback with a call or another audio-focus owner, and start push-to-talk. Confirm there is no overlapping speech or speech captured as student input. Record failures rather than certifying behavior from Jest.

Record model/OS/build/voice ID, tested/not-tested status, and privacy-safe failures. Android audibility, lifecycle, focus, microphone ownership and performance remain human/device checks. No performance baseline, median, p95 or RAM measurement is available for this migration.
