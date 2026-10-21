# PHASE 10 — USTP Student Handbook RAG: rigorous source-grounded answers

**Work authorization:** ONE PHASE ONLY. **Previous gate:** PHASE-09. **Prerequisites:** Human approval `APPROVE PHASE 10` after previous phase report reviewed; Phase 08 offline gate must pass before 09/10.

## In-scope work

- Only after stable Phase 09 gateway. Selectively port old FastAPI/Pinecone handbook ingestion/retriever tests; replace DeepSeek with Gemini provider through adapter. Avoid importing old business/auth modules. Decide retention of Pinecone based on free-tier/security/latency constraints; do not migrate to Qdrant without approved ADR.
- Obtain approved official 2023 USTP Student Handbook and current applicable revisions/issuances; verify exact source URLs, checksum, printed/page PDF mapping, effective dates, lawful use; no unlicensed PDF committed.
- Implement versioned ingestion, section-aware chunking, exact article matching/keyword + embeddings, source metadata and confidence filtering. Explicit handbook-mode routing and strict fail-closed behavior if index unavailable/irrelevant, no fallback to uncited policy hallucination.
- Display plain answer, verified printed page and section, source edition/revision, official PDF link (if valid), option to read via system TTS. Handle policy conflicts with uncertainty and office referral.
- Build 100+ verified gold questions across supported/unanswerable/conflicting/ambiguous/prompt injection classes, held-out evaluation, citation validation and corpus index lifecycle tests. Keep online RAG opt-in; offline core unaffected.

## Required evidence / exit gate

**Deliver:** source-backed USTP Q&A with evidence and integrity tests, RAG evaluation report, authorized corpus manifest and citation UI.
**Automated:** PDF parser/chunker tests, retrieval and rerank, malicious excerpt handling, citation mapping, insufficient sources fail-close, API timeouts, 100+ gold question evaluation where deployment available.
**Human:** adviser or domain reviewer validates sample citations/pages, updated handbook amendments, off-topic refusal and online/offline messages.
**Fail if:** uncited university policy answers, missing/incorrect sources, corpus authorization unresolved, weak-evidence answers instead of refusal, or unsupported offline RAG claim.

## Phase execution checklist

1. Read root `AGENTS.md`, current phase and relevant docs. Check git status/branch and requirement IDs. If files differ from proposal, inspect and record discrepancies.
2. Create/update a brief phase execution plan and acceptance checklist. Inspect only relevant old repo files **read-only** at the pinned SHA.
3. Implement in small reviewable patches; do not modify unrelated features, business code or future phase features. Add tests alongside changes.
4. Execute focused tests, then full available `preflight`, build and instrumentation where configured. Report `PASS`, `FAIL`, `NOT RUN`, `HUMAN REQUIRED` accurately with commands/logs and device IDs only at general model/API level.
5. Update architecture docs and ADRs, domain schema and manual QA checklist if touched. Run Graphify/import cycle checks when applicable and record whether they ran.
6. Write `docs/reports/phase-10-report.md` using the report template, link commits/PR if allowed, list human validation steps and open risks.
7. **STOP, do not open the next phase.** End the message `STATUS: READY FOR REVIEW` or `STATUS: AWAITING DEVICE VALIDATION` or `STATUS: BLOCKED`; then `STOPPED — awaiting explicit human approval`.

## Hard boundaries

- New repo writable, old repo never writable. No full old repo copy, auto model downloads of unknown provenance, or remote secrets in mobile.
- No account/signup/business team functionality and no large UI redesign.
- Before Phase 09, absolutely no online API/backend runtime dependency for essential student flows. After Phase 09, online mode must remain optional.
- If manual phone checks cannot run here, stop with `AWAITING DEVICE VALIDATION` and supply exact steps. Never claim pass by mocking native Android.
