# PHASE 07 — On-Device NLU (`SmolLM2`) & Deterministic Intent Fast Path

> Read `AGENTS.md` first. Execute **only Phase 07** when approved.

## Objective

Migrate `LAFINA`'s hybrid offline NLU pipeline: deterministic regex/fast-path intent extraction + on-device `SmolLM2` (`LafinaIntentExtractorModule.kt`, `llama.cpp` JNI, `src/ai/nlu/`, `src/ai/chatOrchestrator.ts`) for offline scheduling, task/event/time-block/reminder/note creation, and call-response classification (`acknowledge`, `snooze`, `reschedule`).

## Scope

1. **Deterministic Fast Path & On-Device NLU (`src/ai/nlu/`, `LafinaIntentExtractorModule.kt`)**
   - Migrate deterministic date/time/intent parsing and `LafinaIntentExtractorModule` (`SmolLM2-135M-Instruct` / `SmolLM2-360M-Instruct` GGUF) with 60s idle auto-unload.
2. **Validated Action Execution**
   - Validate all extracted intents against strict schemas before mutating `tasksStore`, `timeBlocksStore`, `remindersStore`, or `notesStore`.
