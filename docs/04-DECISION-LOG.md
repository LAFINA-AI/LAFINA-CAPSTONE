# 04 — Architecture Decision Register (Provisional)

| ID | Decision | Status | Validation/exit |
|---|---|---|---|
| ADR-001 | New independent repo, old read-only ref pinned to SHA | ACCEPTED | Phase 00 repo audit |
| ADR-002 | React Native/TS + Kotlin/C++ bridges, not full Kotlin rewrite | PROVISIONAL | Phase 00 + 01 build/profiling |
| ADR-003 | Offline local SQLite, no auth accounts | ACCEPTED | Phase 02 airplane mode |
| ADR-004 | Native AlarmManager, permitted full-screen/headsup fallback | PROVISIONAL | Phase 03 device matrix |
| ADR-005 | System TextToSpeech default; Kokoro outside MVP | ACCEPTED direction | Phase 05 offline voice benchmark |
| ADR-006 | Android on-device recognizer when available, Whisper fallback | PROVISIONAL | Phase 06 WER, latency, device support |
| ADR-007 | Rules first, optional small local model only with measured gain | ACCEPTED direction | Phase 07 eval |
| ADR-008 | No user login/onboarding offline by default | ACCEPTED | Phase 01 fresh install |
| ADR-009 | Gemini optional via FastAPI, provider configurable | DEFERRED | Phase 09 benchmark/cost/security |
| ADR-010 | USTP RAG initially ported from Pinecone/legacy Python | DEFERRED | Phase 10 citations/quality/license review |
| ADR-011 | Minimal UI, use legacy patterns + semantic theme | ACCEPTED | Phase 01 usability |
| ADR-012 | Separate student and future business products; no shared runtime dependency | ACCEPTED | Phase 00 import graph |

Every change to these requires a short ADR in `docs/decisions/` using template, with rejected alternatives, rationale, effects on quality/performance, exact benchmark and approval. Never turn a provisional into accepted silently. If Android platform restrictions invalidate a design, stop and present alternatives for approval.

## Phase 00 review record — 2026-10-21

Direction is confirmed by the user's Phase 00 request; no implementation phase is
approved. The following decision files document evidence and pending gates:

- [ADR-001](decisions/ADR-001-independent-reference.md): independent pinned reference;
  user confirmed source/brand authorization, details to follow; no ports performed.
- [ADR-002](decisions/ADR-002-stack-validation.md): RN/TS/Kotlin proposed; exact versions
  remain unaccepted until a clean build. Outside-sandbox Gradle/JDK17 and ADB
  enumeration passed after restricted failures; no devices are attached.
- [ADR-003](decisions/ADR-003-local-state.md): fresh local schema and durable desired
  jobs; native effects reconciled after commit, no volatile production DB fallback.
- [ADR-004](decisions/ADR-004-platform-delivery.md): conditional platform delivery,
  explicit permission/failure states, physical acceptance pending.
- [ADR-005](decisions/ADR-005-system-tts.md): system TTS direction accepted; Kokoro
  excluded from MVP; comparable device measurements NOT RUN.
- [ADR-006](decisions/ADR-006-adaptive-stt.md): platform STT evaluated by capability;
  Whisper remains conditional on provenance and device results.
- [ADR-007](decisions/ADR-007-validated-intents.md): proposals/validation/executor;
  optional local model disabled pending demonstrated value.

ADR-008/011/012 directions remain charter requirements; no source/UI implementation
was created. ADR-009/010 remain DEFERRED. The [blueprint](phase-00-blueprint.md)
records the unchanged phase sequence and proposed contract/schema details.

## Phase 01 record — 2026-10-21

User explicitly approved Phase 01 in natural language and requested manual checks
after every phase. See [ADR-013](decisions/ADR-013-phase-01-preferences.md).
The official RN template is used selectively; the local preference snapshot and
minimal navigation do not import legacy accounts/business/cloud code. Actual
version/build/runtime evidence is in the Phase 01 report. Source/brand authorization
already recorded remains valid; no assets or legacy application code were copied.
No acceptance of physical-device behavior or approval of Phase 02 is implied.
