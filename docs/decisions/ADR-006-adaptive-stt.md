# ADR-006 — Capability-gated on-device STT with conditional Whisper fallback

**Status:** proposed; engine/model selection pending measurements  
**Date:** 2026-10-21  
**Phase:** 00  
**Review owner:** human developer

## Context / problem

F-010/F-015 require offline hold-to-talk. API 30 cannot assume API 31 on-device
recognizer APIs. Pinned capture/JNI has reusable concepts but lifecycle/provenance
gaps. Installing a model is not proof of recognition quality.

## Decision

Evaluate Android on-device recognizer availability and real airplane-mode language
support first. Use a provenance-cleared, pinned Whisper.cpp model/bridge fallback
where justified by coverage/accuracy/latency/memory. No automatic model download
or bundled binary now. Single visible capture owner, release/cancel, late-callback
rejection and native resource ownership are mandatory. Typed/manual fallback
always works; it does not alone satisfy the supported-device offline-STT gate.

## Alternatives considered

Cloud recognition and always-on listening rejected. Whisper everywhere versus
adaptive STT will be compared on the same phones; no engine winner is assumed.

## Impact

Conditional support must be explained; fallback adds APK/RAM/battery cost if chosen.
Minimum-device coverage and missing-language cases need human review.

## Measurements/verification

WER, post-release latency, model load, peak memory and battery: NOT RUN.
Native/API facts and expected LFS metadata are in [native audit](../audits/phase-00-native.md).

## Rollback

Release/cancel engine resources and preserve typed input. Engine changes cannot
mutate a pending command or the authoritative schedule.

## Human approval

Phase 06 and any model redistribution remain pending separate approval and evidence.
