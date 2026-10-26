# Phase 05 — platform speech provenance and dependency boundary

**Reviewed:** 2026-10-25, Asia/Manila.

Phase 05 uses the Android framework `TextToSpeech`, `Voice`,
`UtteranceProgressListener`, audio focus and system settings APIs through capstone
code. Calling those platform APIs does not copy or redistribute a speech engine,
voice data, model, sound recording or upstream implementation. No Kokoro/ONNX,
Whisper, STT, inference binary, waveform cache or audio dependency is added for
this phase. Existing dependency/advisory records remain in
[Phase 01](phase-01-provenance.md) and [Phase 03](phase-03-provenance.md); this
document does not claim a new advisory scan or resolution of historical tooling
advisories. At source review, `package.json` and `package-lock.json` have no
dependency diff from the existing checkout baseline, and the app Gradle diff
changes version metadata only. Current artifact hashes and permissions still
belong to the Phase 05 artifact/report evidence.

Speech engines and voices are separately installed packages/data maintained by
their vendors. They are not bundled in the capstone APK and retain their own
licenses, update behavior and permissions. The app enumerates them and permits
only installed voices whose metadata says no network is required; human
airplane-mode validation is still required. This is not a certification of the
vendor package or its redistribution terms. The capstone does not automatically
download, copy, export or rehost voice data. If missing, the user can review the
Android speech settings separately and continue with text/manual controls.

The [selective pinned legacy audit](../audits/phase-05-legacy-tts.md) records exact
source blobs and reviewed ranges. No legacy source, business module, WAV cache,
credentials, model assets or dependency tree was copied. Owner authorization for
source/brand reuse is already recorded, with attribution/publication details to
follow; no such authorization is substituted for third-party artifact clearance.
The legacy ONNX conversion/voice/dictionary provenance remains unresolved and
therefore no Kokoro payload is redistributed or benchmarked by this phase.

Timing diagnostics should contain only bounded identifiers, engine/voice
metadata, monotonic milestones and outcome codes. Do not commit spoken student
titles, transcripts, microphone audio, vendor/account identifiers or raw device
notification dumps. The fixed synthetic phrases in the manual checklist can be
used without collecting classmates' voices. No microphone permission or
background recording is needed for output speech.

The review build remains development-signed and is not a production store
distribution. Build hashes, permissions and actual tests belong to
[the Phase 05 report](../reports/phase-05-report.md), rather than a filename reused
from an older phase.
