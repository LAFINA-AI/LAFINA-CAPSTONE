# ADR-005 — Android offline-capable system TTS as default

**Status:** accepted product direction; device validation pending  
**Date:** 2026-10-21  
**Phase:** 00  
**Review owner:** human developer

## Context / problem

F-011/F-012 require fast optional spoken replies without blocking text. The old
Kokoro pipeline has large declared payloads; its latency/memory remain unmeasured.

## Decision

Implement Android TextToSpeech in Phase 05 with readiness, verified installed
offline voice selection, timing/error callbacks, audio-focus handling and stop/
dispose lifecycle. Text appears after durable commit without waiting on speech.
No offline voice means text/notification fallback with guidance; no silent online
voice. Exclude Kokoro from initial MVP and keep it only as a reviewed old baseline.

## Alternatives considered

Kokoro default rejected by explicit requirements, not by fabricated speed results.
Caching/pre-generated prompts deferred unless measurements justify cost/retention.

## Impact

Less bundled model scope; quality/availability varies across installed engines.
TTS service resource use must be included separately in matched measurements.

## Measurements/verification

Kokoro vs Android first audible latency/quality/PSS/battery: NOT RUN.
[Matched benchmark protocol](../benchmarks/phase-00-baseline.md).

## Rollback

Select text-only if engine fails; tasks/alarms remain durable. Any experimental
engine swap requires evidence, provenance and a new approval/ADR.

## Human approval

Explicit user requirement establishes default direction. Phase 05 code and phone
acceptance are pending; no voice was certified offline in Phase 00.
