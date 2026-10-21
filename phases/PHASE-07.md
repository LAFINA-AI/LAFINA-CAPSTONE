# PHASE 07 — Offline intent engine, Messenger-style chat and validated actions

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-06. **Prerequisites:** Human approval `APPROVE PHASE 07` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Implement chat text first, then STT transcript feed to structured intent parser. Fast rules for explicit ACK/SNOOZE/REPEAT and common scheduling. Salvage useful old date parsing/tests; optional existing SmolLM2 inference only if deterministic path insufficient and device QA justifies model size/latency. Laya is experiment, not mandatory.
- Create typed JSON/discriminated intents and validation: present/missing slots, `needsConfirmation`, date/time normalization, timezone, source target ID, confidence, legal state transitions. AI never directly writes DB.
- Use cases perform validated mutations via SQLite transaction; show immediate text response, TTS optional async. Clarify ambiguous 'Friday', 'later', conflicting 'Okay but remind me later', vague 'change it'. No guesses, dangerous bulk delete requires confirmation.
- Simple on-device chat history only if privacy settings support it. No general knowledge chatbot promise; if unsupported ask user to rephrase. No accounts, Gemini or RAG yet.
- Build labeled held-out command set, including adversarial and error fixtures; measure intents/slots and false ACK/false scheduling; compare latency old/new only if reliable baseline exists.

## Required evidence / exit gate

**Deliver:** usable local text/voice chat scheduling and query, deterministic fast path, optional bounded model adapter, tests and benchmark.
**Automated:** parser/validator date/time suite, fixed phrases, contradictory command refusal, safe write side effect, no online network tests; mock engine and optional model integration.
**Human:** in airplane mode speak 'Remind me to revise tomorrow at 7 PM', verify precise calendar + alarm, correct via chat, stop TTS mid-reply, reject ambiguous commands.
**Fail if:** unverified model output mutates storage, common commands require cloud, unclear ACK treated as dismissal, or long AI timeout locks UI.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-07-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
