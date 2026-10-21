# ADR-007 — Deterministic proposals and one validated command executor

**Status:** accepted direction; grammar/model evaluation proposed  
**Date:** 2026-10-21  
**Phase:** 00  
**Review owner:** human developer

## Context / problem

F-009/F-013 require safe offline scheduling. Legacy parsing, target selection and
success messages have correctness hazards. Bundled SmolLM2 is not proof of inference.

## Decision

Use pure deterministic parsing for simple commands. Typed discriminated proposals
pass date/time/target/state validation and confirmation before one executor commits
side effects. Ambiguous/contradictory/destructive inputs cannot silently mutate
data. Optional small offline model stays disabled unless held-out results establish
added value within resource limits. No AI-generated arbitrary tools or SQL.

## Alternatives considered

Model-first writes, first-substring target selection and parsing-as-persistence
rejected. A bounded local model remains an experiment, not a required dependency.
Online Gemini/handbook routing remains absent until post-08 approvals.

## Impact

Testable offline core with explicit clarification. Grammar limits and accents/
recognition errors remain visible; no general-purpose assistant promise.

## Measurements/verification

Command critical-error rate/accuracy/latency/RAM: NOT RUN. Existing starter cases
are synthetic plans. [Reuse audit](../audits/phase-00-reuse.md) identifies tests to adapt.

## Rollback

Disable optional model, preserve deterministic/manual operations and stored data.

## Human approval

Direction follows explicit user requirements. Phase 07 implementation and any
offline model inclusion require their own approval and evidence.
