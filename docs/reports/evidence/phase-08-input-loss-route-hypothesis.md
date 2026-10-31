# Phase 08 — input selection hypothesis and discriminating test

Date: 2026-10-29, Asia/Manila. Scope: narrow host/source diagnosis only. No ADB,
emulator control, capture, build, installation or application-source change was
executed for this finding. V05 and physical-device validation remain NOT RUN.

## Confirmed facts

The installed package metadata identifies Emulator 37.1.11, build 15917651.
The installed protocol and current sender agree on signed PCM16, mono, 16 kHz
and default blocking delivery. The sender already respects HTTP/2 backpressure.
No packet-framing defect was established. The existing
[transport finding](phase-08-remaining-audio-transport-finding.md) retains the
previous observations and implementation caveat.

The following official implementation was read again at pinned commit
`cf0f40a0aad1aa3fca68f2f89372525c8d28ca68`. This commit still has **no verified
mapping to the installed binary**; it supplies a concrete hypothesis, not its
proven root cause.

- The [virtio input open/close path, lines 742–805](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/hw/audio/virtio-snd.c#742)
  records the last successfully opened input in a global pointer. It does not
  select that pointer by Android recording-client activity. An input close
  clears the pointer without checking whether that closing stream is its owner.
- The [forwarder registration, lines 85–140](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/audio/audio_forwarder.c#85)
  retrieves and reopens the selected card input and activates the replacement.
  The [input worker, lines 203–253](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/audio/audio_forwarder.c#203)
  consumes its queue only while a forwarding voice exists.
- The [blocking stream writer, lines 78–106](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/audio/AudioStream.cpp#78)
  waits for queue space and retries partial writes. It does not acknowledge
  receipt by the target Android app.
- The [RPC loop, lines 690–729](https://android.googlesource.com/platform/external/qemu/+/cf0f40a0aad1aa3fca68f2f89372525c8d28ca68/android/android-grpc/services/emulator-controller/server/src/android/emulation/control/EmulatorService.cpp#690)
  queues packet bytes until cancellation, ignores packet timestamps, then
  attempts a bounded 300 ms silence flush. It can return OK after that flush
  times out.

Graphify navigation used exact vocabulary `[audio, microphone, capture, rpc]`,
a bounded query and the sender's focused explanation before inspecting its
`rpc()` and `audioPackets()` spans. Graph relationships are navigation evidence;
the protocol and source establish the statements above. No paid extraction ran.

## Narrower inference

One active, unsilenced Android recording configuration does not exclude another
open hardware input in standby or another input consuming data below that
client-level view. Forwarding to a different consuming input could produce the
observed combination of RPC OK and a target app capture containing only its
low-level floor. The prior
[passing route observation](phase-08-remaining-relative-route-observation.json)
alone cannot test that difference.

A completely absent selected forwarding voice is a weaker fit: in this
reference implementation the forwarding worker would consume nothing, so a
multi-second default-mode stream should fill its small queue and eventually
hit the request deadline. That differs from an ordinary completed stream.
This distinction depends on the unverified source/binary mapping.

End-of-stream tail loss alone also does not explain removal of an entire
utterance already followed by one second of zero padding. No evidence here
supports adding a client timer, changing timestamps, enabling host audio or
relaxing the transcript gate.

## One bounded comparison

Run a predeclared pair of independent visible ACK trials using the same saved
AVD, installed APK, pinned WAV, gain, zero padding, onset delay and decoder.
Keep every trial result. During each existing stream, collect private,
read-only AudioFlinger and audio-policy input snapshots plus the app's recording
configuration. Correlate the target app's session and patch to hardware input
I/O handle, port/device identity, active/standby state, and other open input
threads. Record capture frame count/RMS and stream start/end times separately.
Publish only fixed observations and hashes; retain unrestricted dumps privately.

The discriminating observation is whether a failed target capture has a
different last-open hardware input from a matched passing capture. A mismatch
supports a routing follow-up; equal observed routes do not establish a timing
fix. No hidden retry, pre-arm or automatic recorder restart should be added.
If both predeclared trials pass, report non-reproduction rather than claiming
repair. Any additional trials need their own recorded purpose and outcomes.

This investigation identifies no justified application or sender patch yet.
Manual typing and explicitly reviewed ACK/snooze remain available throughout.
