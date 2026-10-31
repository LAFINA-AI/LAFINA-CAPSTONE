# ADR 024 — Fixed speech vocabulary for answered reminders

Date: 2026-10-29, Asia/Manila. Status: retained in the local Phase 08 candidate;
final candidate checks are recorded in the speech-correction report.
Physical-device acceptance remains NOT RUN.

## Context

The two checksum-pinned Zira synthetic response clips failed through both visible
capture and direct native decoding. Private diagnostics identified lexical
sound-alikes rather than valid ACK/snooze commands. The same unchanged clips with
0/250/500/1000ms of additional silence still failed on the original decoder.
Later actual-capture diagnostics also found a low-level emulator input floor
and transport gain near two. These are separate decoder and synthetic-transport
findings, not evidence about human speech quality. Historical failed attempts
remain preserved in the Phase 08 evidence.

## Decision

Use a default-GENERAL `WhisperVocabulary` purpose. Only `AnsweredDictationPanel`
selects REMINDER_RESPONSE, routed through its private `SpeechInput` instance and
`WhisperTranscriber` into JNI. For English reminder responses, supply the fixed
initial prompt: `Acknowledge this reminder. Snooze for ten minutes.` It contains
no schedule, identity, user draft or arbitrary prompt text. Chat/general
transcription stays unhinted with its existing greedy strategy. Reminder-only
English decoding uses a bounded beam of three at temperature zero. Keep the
existing pinned model, cancellation and per-request decoder lifetime.

Short responses were sensitive to onset offsets; exact-zero trimming alone
also anchored on the emulator's measured nonzero floor of up to eight PCM units.
The reminder profile locates the first/last sample with absolute magnitude at
least `max(16/32768, capturedPeak * 0.001)`, retains up to 250ms before and 750ms after that signal, then
provides a fixed first-signal anchor at 345ms and one second after the last
signal. This may remove low-level input outside the retained margins; it is not
a general voice-activity detector or a guarantee that quiet speech is preserved.
Input without a sample above that threshold receives 250ms of context on each
side. The 15-second captured-input limit is unchanged; the largest derived
decoder buffer is 16.345 seconds, under the unchanged 30-second JNI cancellation
deadline. The aggregate transcription timer remains 60 seconds. This empirically chosen profile requires phone checks with quiet
speech, noise and different durations.

The peak-relative boundary replaces the earlier fixed 16-PCM boundary. Two
checksum-verified captures of the same synthetic ACK had different input gain;
the fixed boundary selected source onsets 82 frames apart. The relative boundary
selected the same source span in both captures, and exact replays independently
parsed the expected ACK. It changes boundary selection only, without scaling
sample amplitudes or mapping mistaken words to commands. See the
[boundary analysis](../reports/evidence/phase-08-remaining-boundary-analysis.json)
and [remaining-case report](../reports/phase-08-remaining-emulator-report.md).

The hint changes transcription context. It does not constrain output to commands,
substitute a command, perform fuzzy correction or authorize an action. Recognized
text remains visible/editable and must be copied deliberately into the draft.
The existing strict parser, exact review, source/deadline fences and explicit
Confirm remain required. ACK does not complete the task. Speech failure,
unsupported input and cancellation preserve manual controls.

## Verification and acceptance boundary

The preceding fixed-floor profile passed all 16 real decoder calls across the two pinned
responses, 0/250/500/1000ms offsets and digital-zero/eight-PCM synthetic floors.
Each result also passed the independent exact ACK/duration expectation. See the
[offset/floor regression](../reports/evidence/phase-08-speech-floor-offset-results.json).
These are synthetic decoder checks without microphone capture or executed actions.

The final candidate also passed three unsupported-utterance controls and a
15-second digital-silence control without proposing ACK/snooze. The three known
utterances transcribed exactly. Raw decoder silence produced nonempty text,
which the strict parser refused; this is not a silence-recognition quality pass.
See the [control results](../reports/evidence/phase-08-speech-final-negative-controls.json).

The final candidate report separately records the following checks and their
actual results; none can be inferred from the 16 decoder calls:

- Fresh pinned positive decoder results, including parsed ACK/exact duration.
- Actual visible hold/capture → copy → review → Confirm with independent paired
  SQLite state, task TODO, registration and snooze-time checks.
- Unsupported synthetic speech and silence controls under the hint; report
  transcription accuracy separately from safe command refusal.
- Existing six-clip GENERAL corpus and native cancellation/boundary regressions.
- Individual decoder durations under recorded build/model/device conditions.
  Two positive clips cannot establish an accuracy or performance improvement for
  human speech; any emulator measurements remain bounded evidence.

Synthetic SDK transport requires separate validation. A successful gRPC stream
does not prove AudioRecord received audio. Current visible cases use bounded
one-second zero pre/post-roll after an observed visible hold, with host input
false before/after. The blocking SDK stream supplies pacing; an explicit
test-only gain of 500/1000 compensates for the measured virtual input gain.
An actual reminder capture then matched the unchanged ACK waveform with
correlation 0.999999987278, gain 1.000078 and no clipped samples
([capture metadata](../reports/evidence/phase-08-native-fidelity-20261029T031904526676Z.json),
[waveform analysis](../reports/evidence/phase-08-fidelity-analysis-native-20261029T031904526676Z.json)).
This demonstrates transport fidelity for that known synthetic sample, not
human acoustic accuracy. The temporary capture exporter/probe used for this
diagnosis was removed from final source; no persistent recording feature is added.
The emulator must have virtual audio support; `-no-audio` disables it. No
`-allow-host-audio` flag or host-input enable operation is used. These are
test-harness conditions, not production microphone delays or gain changes.

## Optional emulator input initialization follow-up

The test client now offers optional `--initialize-input`, after independently
observed visible Recording and a fresh host-input OFF result. Before sending
source PCM, it sends one separate format-only `AudioPacket` with **zero source
PCM bytes**, a two-second RPC deadline and required gRPC status 0. It then checks
host input OFF and the fresh Recording proof again, and sends the same pinned
PCM once through the existing blocking stream. This does not start or restart
app recording, retry actual source audio, or change the app deadline, model,
parser, transport gain or padding. It is a synthetic test-transport step; the
production capture and decoder profile above remain unchanged.

Four actual-capture ACK cases passed across two cold boots with this option:
[first pair](../reports/evidence/phase-08-input-loss-initialized-capture-pair.json)
and [second pair](../reports/evidence/phase-08-input-loss-initialized-capture-pair-2b.json).
The [initial two failed captures](../reports/evidence/phase-08-input-loss-cold-pair-1.json)
remain retained. The underlying SDK cause is unproven; completed RPCs alone
remain insufficient evidence of capture or recognition. These checks used the
original SDK emulator 37.1.11. An isolated 37.2.13 candidate was rejected after a
cold failure and warm pass, so an emulator upgrade is not the accepted remedy.
Initialization remains an experimental, unreliable workaround. A later A03
actual-capture case failed recognition despite successful initialization,
host-input OFF and a captured signal. Four focused passes do not establish a
reliability fix. The completed campaign has44PASS/3FAIL/1NOT RUN; A03/V03/V04
remain failed, V05 deferred, and all physical gates pending.

## Limits

No new model, dependency, permission, account, backend or online feature is added.
Physical ARM64/low-memory, live speech, accents/noise, audibility, OEM delivery,
phone performance/battery and the signed offline release gate remain pending.
The fixed hint mentions ten minutes, so other durations and spoken aliases need
separate accuracy checks. Wrong or uncertain recognition must be edited or
cancelled before confirmation. Beam search also needs phone cost/deadline checks;
the existing ringing window is not extended.
Final results and any rejected candidate belong in the
[current speech-correction report](../reports/phase-08-speech-correction-report.md).

The completed input-loss follow-up retains a V04 all-OFF/gRPC0 no-signal failure
and V03's masked-error failure. Client logging now preserves the primary redacted
error and distinguishes source-stream entry; no producer or decoder repair is
claimed. See the [current report](../reports/phase-08-input-loss-report.md).

<!-- phase08-capture-fix-current -->

## Current capture transport evidence — 2026-10-31

See the [capture-fix report](../reports/phase-08-capture-fix-report.md) and [closed ledger](../reports/evidence/phase-08-capture-fix-case-ledger.json): 45 PASS / 2 FAIL / 1 NOT RUN. The current scoped path uses a single source RPC after real visible Recording, source gain500/pad1000/delay0, <=200ms prefill, start-anchored20ms deadlines and minimum5ms post-prefill spacing. Both100ms lateness/lag guards remain; native test coordination12s, production capture15s/ringing60s are unchanged. No new production/decoder/model/schema/permission decision is introduced.

Earlier initializer/blocking/rebased protocol observations above are historical/experimental, not the current comparison protocol. All failed experiments remain. Planned PCM duration, source RPC completion/host-OFF eligibility, generator-yield counters, native comparison metadata and strict review/Confirm are distinct; source success does not prove capture/recognition. Literal ABORT differs from invalid authorization or absent-marker timeout. A pre-controller navigation failure is neither a source abort nor a recognition failure. No ASR accuracy denominator is constructed.

30 host checks,5 real Windows-clock dry runs (no SDK/audio) and3 gate controls passed; the controls are excluded from the10 selected affected trials. SDK cause remains unproven;10 pinned trials do not establish broad reliability, phone accuracy or audibility. Manual/typed fallback and ACK-not-completion remain. V05 owner-deferred; all48 physical rows NOT RUN, human review NOT SIGNED; stable release and Phase09+ unapproved.
