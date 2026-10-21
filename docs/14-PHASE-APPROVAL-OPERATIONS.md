# 14 — Codex Phase Approval Operations

## Operating principle

**Human-in-the-loop.** Codex works within one approved phase, reports, then stops. It must not loop across all phases autonomously. The package contains the prompts so the developer can opt into the next phase explicitly, with exact gates.

## Standard prompts

- First ever Codex session: paste entire `STARTING_PROMPT.md`; authorizes only Phase 00.
- Once Phase NN report reviewed and device validations satisfied: say `APPROVE PHASE XX` and paste/send `prompts/PHASE-XX-PROMPT.md` (where XX=next phase).
- To fix: `REWORK PHASE NN: Steps to reproduce ..., actual vs expected ..., device ...`. Do not authorize next phase.
- If you prefer Codex to create GitHub PR rather than commit locally, specify `Work in a new phase/XX branch and prepare PR, don't merge`. Require review.
- To halt: `STOP; summarize current branch, tests, uncommitted changes, and what remains.`

## Session memory and token use

A new Codex conversation should first read `AGENTS.md`, current phase, last phase report, `docs/decisions` and `docs/03-LEGACY-REFERENCE.md`. Avoid pasting 40+ docs into every turn if files are present: instruct it to read selectively. Maintain one `docs/reports/CURRENT-STATUS.md` only as a derived factual progress snapshot, not a new source of truth. Summarize phase changes and link to tests/benchmarks. No real development code or models inside handoff ZIP.

## Environments

- **Cloud Codex**: may not be able to see local sibling `/workspace/LAFINA`; request read access or use pinned GitHub links; Android physical QA likely human-required.
- **Local Codex**: open `LAFINA-CAPSTONE` as writable project; old project sibling read-only; check secrets and shell commands before execution.
- Never hand over actual `.env`, production Gemini API key or private student files to a general assistant prompt. Configuration uses placeholders and secret stores.

## Phase approval record

After each approval, append human instruction and date to phase report under approval provenance. If an app component/API fails tests, approval cannot be automatically inferred from silence; require explicit user action.
