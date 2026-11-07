# Offline leaves versus online composition (baseline for inventory #23)

The current `scripts/check-architecture.mjs` stays executable and unchanged in this phase: 179 modules, 0 cycles, 0 forbidden imports (see `preflight-baseline.log`).

The donor's stronger analyzer treats all of `src/ai` as offline, and on AGY it reports `src/ai/chatOrchestrator.ts -> src/skills/documentSkill.ts -> ../cloud` plus the same path through `src/ai/index.ts`. Those are valid AGY online routes, so the rule is wrong for this product. No feature gets deleted to satisfy it. AGY-PORT 12 will apply the stronger check to the classification below.

| Class | Modules | Rule |
|---|---|---|
| Offline leaves | `src/storage/*`, `src/ai/nlu/{types,fastPathParser,intentService,modelManager,actionExecutor}`, `src/ai/stt/*`, `src/ai/native/*`, `src/ai/tts/ttsService`, `src/meetings/*` (except notesPipeline if it reaches cloud), `src/ai/documentIntent` (type-only skill import) | No runtime path to `src/cloud`, `src/skills`, `fetch`, or `XMLHttpRequest` |
| Online composition (narrow, named) | `src/ai/chatOrchestrator`, `src/ai/index` (re-export only), `src/ui/contexts/MeetingsContext`, `src/sync/syncWorker`, `src/cloud/speechService`, `src/scheduler/callDispatcher` (via injected speech provider) | May call cloud clients behind mode, entitlement and consent gates |
| Cloud clients | `src/cloud/*`, `src/skills/*` | The only modules allowed to issue requests |

To be verified by AST in AGY-PORT 12, including whether `src/storage` reaches cloud anywhere. Runtime network sentinels already exist for all 16 intents in `__tests__/preservation/agyPreservedContracts.test.ts`.
