# Phase08 remaining cases — synthetic audio transport finding

**Date:** 2026-10-29 Asia/Manila. **Scope:** host/source investigation only; no device calls, builds, source changes or new test executions. **Physical-device validation:** NOT RUN.

The current helper's packet fields match the installed SDK protocol. No concrete client protocol defect was established. A completed injection stream does not establish that the target app received its samples. The intermittent input-route failure remains open; changing decoder output or confirming a mismatched response cannot resolve absent capture signal.

## Evidence and version boundary

The installed `emulator/source.properties` identifies Android Emulator37.1.11/build15917651. Its `lib/emulator_controller.proto` was inspected locally at lines334–354 and1554–1602. The package includes the protocol but no matching implementation source was located.

For implementation behavior, this investigation read official Android Gitiles source pinned to **`cf0f40a0aad1aa3fca68f2f89372525c8d28ca68`**, the `emu-main-dev` head observed during the investigation. **That commit has not been mapped to the installed37.1.11 binary.** It supplies concrete reference-implementation behavior and test hypotheses, not proof of the installed binary's exact internal cause. Public source was fetched read-only; no vendor code was copied into the app.

Graphify vocabulary `[emulator, audio, microphone]`, a bounded query and focused `audioPackets` explanation located [the existing controller](../../../scripts/phase08-emulator-audio.mjs). Its `audioPackets()` and `rpc()` spans were then inspected directly.

## Confirmed protocol and reference implementation behavior

- The installed proto defines signed16 little-endian input, mono as channel0 and default delivery mode0 as blocking. The helper selects16kHz using sample rate field1, sample format field3 and leaves the two default enums omitted. Audio packet format/timestamp/bytes use fields1/2/3 respectively. It honors HTTP/2 backpressure. Repeated format metadata is unnecessary but is not invalid.
- The reference [`injectAudio` implementation, lines651–729](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/EmulatorService.cpp#651) reads the first packet before constructing the input stream. It uses that first format, retries partial/zero writes until packet bytes are queued or the request is cancelled, and does not read packet timestamps. At stream end it attempts a bounded silence flush, then returns OK even if that flush reaches its timeout. There is no target-app consumption acknowledgment.
- [`QemuAudioInputStream`, lines70–106](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/audio/AudioStream.cpp#70) supplies bytes through a ring-buffer callback. Default-mode writes wait for space; the input callback removes queued bytes. The stream's capturer is registered at construction and stopped at destruction. Its [header, lines105–131](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/android/android-grpc/services/emulator-controller/server/include/android/emulation/control/audio/AudioStream.h#105) explicitly allows a zero write when QEMU requests no audio. Thus HTTP/2 acceptance is separate from downstream guest capture.
- The reference [`getMicrophoneState`, lines787–793](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/EmulatorService.cpp#787) only reads the host-audio permission flag. It does not change or restore an input source. The helper does not call `setMicrophoneState`.
- [`QemuAudioInputEngine`, lines166–227](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/android-qemu2-glue/audio-capturer.cpp#166) serializes registration/teardown with the VM lock and enforces one injected stream. The [forwarder, lines85–183](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/audio/audio_forwarder.c#85) saves the previous driver/input voice, switches to the synthetic forwarding driver and reopens the card input. Teardown restores the saved driver/voice. During its own synthetic routing it temporarily changes an internal permission flag and restores the saved value on exit; this is SDK implementation behavior, not a client instruction to enable host recording. Before/after false observations alone do not expose every internal routing transition.
- The reference [virtio sound backend, lines708–805](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/hw/audio/virtio-snd.c#708) selects one global `g_input_stream` for its forwarding callback. A successful input open replaces that pointer; an input close clears it. The same file defines mic0/mic1 stream names. This creates a concrete multiple-input/route-selection hypothesis, but the active backend, pointer state and affected installed-binary path have not been observed.

The source does not justify a client20ms timer, switching to experimental real-time mode, changing timestamps or calling the microphone-state setter. The existing one-second trailing zero padding also means an end-of-stream tail loss alone does not explain the complete absence of the earlier utterance. None of these possibilities is established as the current root cause.

## Actual observations and their limits

After reopening the saved emulator, the first [V01 attempt](phase-08-emulator-expansion/ex20261028/20261029T135956086055Z-V01-microphone.json) completed the synthetic stream with gRPC status0 after visible Recording, then failed. Root's content-free capture diagnostic reported NO_AUDIO_SIGNAL. The same unchanged transport was followed by [V03 trial1](phase-08-emulator-expansion/ex20261028/20261029T140154997326Z-V03-microphone.json), [V03 trial2](phase-08-emulator-expansion/ex20261028/20261029T140353132735Z-V03-microphone.json) and [V04 trial1](phase-08-emulator-expansion/ex20261028/20261029T140546768437Z-V04-microphone.json), each PASS with host microphone disabled at the end. These observations establish intermittency, not a warm-up mechanism or causal effect of cold boot. Root owns subsequent result reconciliation.

Earlier checksum-verified actual synthetic captures include both [a faithful unity-gain waveform](phase-08-fidelity-analysis-native-20261029T031904526676Z.json) and [a capture containing only the measured low-level floor](phase-08-fidelity-analysis-native-20261029T075318475782Z.json). Correct reference decoding from saved data is a separate check from successful new microphone transport. Preserve all failed attempts and keep those layers distinct.

## Bounded next diagnostic, if the failure recurs

The [final V01 retry](phase-08-emulator-expansion/ex20261028/20261029T142355292045Z-V01-microphone.json)
passed on the final installed candidate. A read-only observer collected three
private audio/AudioFlinger snapshots during that retry. Each showed one active,
unsilenced app VOICE_RECOGNITION configuration at mono16kHz/PCM16; the virtual
built-in microphone route was present. Only fixed observations and private-dump
hashes are in the [filtered record](phase-08-remaining-relative-route-observation.json).
There is no matching failed-trial route snapshot, so this does not establish
the intermittent failure's cause or demonstrate its repair. The observer never
opened or controlled a recorder.

No transport modification is recommended from this source review alone. On one failed attempt and one matching passing attempt, collect content-free observations of the app's active recording configuration, routed device/input identity, client-silenced state and other active input clients before/during the existing synthetic stream. Compare those with capture frames/peak/RMS and the stream start/end times. Keep the same pinned clip, gain, padding, decoder and visible hold; do not simultaneously change timing or audio mode. This can test whether the synthetic forwarding route and target app input differ. A route difference would still require a deliberate follow-up test before a fix is claimed.

If read-only route observations cannot identify the mismatch, report the emulator limitation and retain the failure. Do not enable the host microphone, pre-arm/background-record, replace a failed capture with direct decoder input or silently retry until a pass is presented as the original result. Manual typing and reviewed ACK/snooze remain the fallback. V05 and physical-device acceptance remain pending.
