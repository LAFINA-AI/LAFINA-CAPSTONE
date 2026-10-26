# Phase06 — Whisper source, optional model and test corpus provenance

Reviewed2026-10-26, Asia/Manila. This ledger records artifact identity and license
notices. It does not certify inference, accuracy, phone compatibility or model
safety. Actual tests/builds/device outcomes belong in the phase completion report.
No package-manager dependency or cloud SDK is added by this native selection.

## Runtime source

Upstream: [ggml-org/whisper.cpp at the exact revision][runtime], version1.9.5,
commit `d1be6fde11ac6e0407606b4e42fe72d34add8037`. The source ZIP SHA256 is
`6be93b881acb415c5a25d0ef85bb6a488099de0296e072e22a66d50f20ec40b9`.

The selected95 files are under
`android/app/src/main/cpp/third_party/whisper.cpp/`. They cover Whisper library
headers/source, GGML core and ARM/x86 CPU implementation, CMake support, README
and MIT notice. All selected bytes were compared to both the archive and the
[source manifest](../../android/app/src/main/cpp/third_party/whisper.cpp/SOURCE-MANIFEST.json),
with zero mismatches. [Static integrity evidence](../reports/evidence/phase-06-upstream-integrity.json)
records the fresh check. The full upstream archive stays ignored locally.

The [upstream MIT notice](../../android/app/src/main/cpp/third_party/whisper.cpp/LICENSE)
is retained, with a byte-identical notice included in every main APK at
`assets/licenses/WHISPER-CPP-MIT.txt`. That notice's SHA256 is
`94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d`.

The custom parent CMake builds static private GGML/Whisper into the JNI library.
The capstone JNI wrapper lives at
[`cpp/jni/whisper_jni.cpp`](../../android/app/src/main/cpp/jni/whisper_jni.cpp),
outside the root `*.cpp` glob that React Native interprets as an application
`OnLoad` override. Keeping that root free of wrapper sources preserves React
Native's default application registration. Separate single-slot Ninja compile
and link pools bound host build concurrency; they are not runtime performance
settings or evidence of Android speed.
Host-native/AVX-family assumptions and dynamic GPU/network/server backends are
disabled. The mandatory ANE helper compiles upstream non-Apple stubs on Android;
no Apple backend is linked. ARM64 targets baseline `armv8-a`. JNI uses16KiB
linker page alignment. These are configured targets, not a substitute for actual
ARM64/x86_64 builds and device loading. No generated native binary is copied from
upstream or the legacy application.

## Optional model

The publisher's [pinned model card][card] identifies MIT licensing and converted
OpenAI Whisper models. The [pinned artifact page][artifact] exposes the content
SHA256. The checked local payload matches:

| Field | Value |
|---|---|
| Model | Tiny multilingual GGML Q5_1; not legacy Tiny English |
| Publisher/revision | `ggerganov/whisper.cpp` / `fb5ed9369c26eaf08392504d8446da431e0fffb9` |
| Asset | `stt/ggml-tiny-q5_1.bin` |
| Exact payload bytes |32,152,673 |
| SHA256 | `818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7` |
| Original license | [OpenAI Whisper MIT][original-license]; notice copied to [whisper-model-MIT.txt](licenses/whisper-model-MIT.txt) |
| Notice SHA256 | `b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d` |

The public [model metadata](phase-06-model.json) pins download/pointer/card URLs,
size, hashes and runtime revision. The artifact was deliberately obtained by the
engineering workflow after provenance review, not by the application. The binary
remains ignored; no model file is committed. Original/converted provenance relies
on the publisher and content identity; quantization has not been independently
reproduced. Header/language support does not establish accent/Tagalog accuracy.

Staging is deliberate and checksum-checked:

```powershell
.\scripts\prepare-whisper-model.ps1 -ModelPath '<reviewed-local-ggml-tiny-q5_1.bin>'
.\android\gradlew.bat -p android :app:assembleDataQa '-PwhisperModelDir=C:/absolute/capstone/.local/phase06-whisper-assets'
```

The optional directory permits only model, pinned OpenAI notice and provenance
manifest. Gradle checks exact model bytes/SHA and notice SHA before packaging.
`WHISPER_MODEL_INCLUDED` records whether the flag was provided. Without it, the
runtime must report Whisper unavailable; a filename/version alone does not prove
a model-bearing APK. With it, the model and notice are main assets. The app has
no download client, model updater or Internet permission in its bundled variants.
Model32MB is payload size, not APK delta, runtime memory or low-end feasibility.

`isAvailable` checks the library/build flag/asset length as a cheap candidate.
The inference worker revalidates SHA256 before loading, including an existing
private cached model file. Decoder ownership ends on every request; cancel is
cooperative and cannot free a context still being used. PCM remains in memory
and is best-effort cleared on completion/error; this is not a forensic zeroing
guarantee. There is no persistent audio/transcript cache or resident model daemon.

## Synthetic evaluation data

[Corpus text](../benchmarks/phase-06-corpus.json) contains six public synthetic
academic phrases; they must never execute actions in Phase06. Windows' installed
Microsoft David Desktop voice generated the clips locally, without a microphone.
[Audio metadata](../benchmarks/phase-06-synthetic-audio.json) records format,
voice, sizes and SHA256; WAVs stay ignored in `.local/phase06-corpus` and are not
publicly redistributed. No classmate/student recordings were used.

The explicit `-PsttCorpusDir=<absolute>/.local/phase06-corpus` flag includes these
seven allowlisted/checksummed files only in **androidTest** assets, never main
assets. Corpus presence does not imply its inference benchmark ran. Synthetic
voice quality/WER cannot certify Filipino-accented English, Tagalog, noise,
capture or a physical phone. No legacy fixture of unknown consent was imported.

[runtime]: https://github.com/ggml-org/whisper.cpp/tree/d1be6fde11ac6e0407606b4e42fe72d34add8037
[card]: https://huggingface.co/ggerganov/whisper.cpp/blob/fb5ed9369c26eaf08392504d8446da431e0fffb9/README.md
[artifact]: https://huggingface.co/ggerganov/whisper.cpp/blob/fb5ed9369c26eaf08392504d8446da431e0fffb9/ggml-tiny-q5_1.bin
[original-license]: https://github.com/openai/whisper/blob/v20250625/LICENSE
