# ADR-004 — Native alarms with truthful permission and delivery state

**Status:** proposed, physical-device acceptance pending  
**Date:** 2026-10-21  
**Phase:** 00  
**Review owner:** human developer

## Context / problem

F-006/F-007/F-014 require due reminders through OS restrictions. Pinned receiver
registration and pending-call handling have static defects; no device proof exists.

## Decision

Use native AlarmManager for eligible time-specific reminders, capability checks,
unique per-job intent identity, explicit precision/failure status and normal
notification/manual recovery paths. Full-screen/headsup is conditional. Simulated
calls are app reminder UI, never Telecom/real calls. Mic starts only after suitable
visible user action. Reconcile supported launch/boot/time/permission events; never
promise delivery while force-stopped. WorkManager only for justified deferrable work.

## Alternatives considered

Permanent JS polling/model daemon and blind legacy service copy rejected. Exact
permission choice and FSI eligibility must match distribution policy/use case;
visual call styling grants no exemption. Do not silently claim exact delivery
when using an inexact fallback.

## Impact

Clear delivery limits and usable manual controls. Requires API/OEM/permission,
concurrency, reboot, process-death and cancellation validation on phones.

## Measurements/verification

[Native audit and primary Android references](../audits/phase-00-native.md).
Delivery drift/reliability, battery and physical behavior: NOT RUN.

## Rollback

Keep desired jobs in SQLite while switching delivery adapters/capabilities; expose
restricted state and let users edit/cancel manually without losing tasks.

## Human approval

Phase 03 implementation and device matrix not approved yet. Permission/distribution
choices are provisional and do not certify Play eligibility.
