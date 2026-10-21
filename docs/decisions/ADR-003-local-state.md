# ADR-003 — One local database and durable desired alarm jobs

**Status:** accepted direction; schema/driver/native access proposed  
**Date:** 2026-10-21  
**Phase:** 00  
**Review owner:** human developer

## Context / problem

F-003–F-008/F-014/F-015 require durable offline state. Legacy DB fallback can hide
initialization failure and scheduling effects cross independent stores/native state.

## Decision

New minimal SQLite schema with migrations, anonymous local preferences and no
auth/business tables. Use transactions for item/reminder/job/receipt changes.
AlarmManager effects occur after commit through idempotent reconciliation because
they cannot share a SQLite transaction. Generation/occurrence/version identify
callbacks. ACK is separate from task completion. Never silently fall back to a
volatile database in production. See [schema and protocol](../phase-00-blueprint.md).

## Alternatives considered

Legacy v17 clone, account-based storage and independent reminder/job writes
rejected. A native delivery ledger may be necessary, but it must be derived and
reconciled, never a competing source of schedule truth.

## Impact

Crash windows become recoverable; tests and native DB/concurrency design are
required. Memory, save latency and battery are NOT YET MEASURED.

## Measurements/verification

Source defects documented in [reuse audit](../audits/phase-00-reuse.md).
DDL/migrations and real SQLite/device checks are NOT RUN; Phase 02/03 work.

## Rollback

Version migrations and preserve pending desired jobs when changing adapters.
Do not delete schedules because voice/native registration fails.

## Human approval

Local-first/no-account direction authorized by requirements. Exact schema,
driver build and receiver-safe native access require review in their approved phases.
