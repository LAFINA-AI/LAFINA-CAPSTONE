# AGY-PORT 01 — storage resilience and migration foundation

Prerequisite: 00. Inventory: 1. Protect PF01–PF04, PF07–PF08, PF12.

## Navigate

Target `src/storage/database.ts`, `dbInit.ts`, store transaction/afterCommit usage, startup recovery UI, auth/session/sync/meeting stores. Donor pinned database/dbInit and `dbResilience.test.ts`, `transactionSafety.test.ts`, `fallbackSyncSafety.test.ts`. Never copy its full initializer/barrels.

## Execute

1. Add failing regression tests for native-open failure falsely appearing durable, rollback failure reuse, expired transaction handles, nested/async misuse and post-commit failures. Confirm target driver's actual connection/transaction API.
2. Make volatile/test adapters explicit and test-only; production storage failure exposes unavailable/recovery state and rejects durable writes. Keep onboarding/login/manual UI recoverable without fabricating saves. Preserve native module registration and auth data handling.
3. Implement typed owned transaction lifetime, exception handling and after-commit behavior. Quarantine unsafe connections after failed rollback. Native/platform registration errors after durable commit leave recoverable state instead of pretending rollback occurred.
4. Refactor migration setup into a single reviewed atomic sequence from the actual AGY schema version; refuse future/malformed versions before writes. Add bounded integrity/readiness checks using supported APIs. Select a journal/busy protocol appropriate to both JS/native writers and document it in an ADR; don't change journal mode inside a transaction.
5. Generate synthetic legacy fixtures containing all AGY tables and protected data: guest/two accounts, tokens as harmless fixtures only, preferences, seven sync types, pending outbox/conflicts, rich/cited/attached messages, meeting records and deleted rows. Upgrade/reopen and inject failures to verify rollback/no version advancement/no row loss.
6. Check all store call sites and guest migration/sync transactions still use the same executor, preserve outbox atomicity and report errors. No mass replacement of stores. Run affected tests, full preflight, native/build gates and preserved-feature subset.

## Acceptance

Failed production writes cannot show successful save; future/corrupt schema does not get rewritten; a rollback failure prevents reuse. Synthetic AGY data/outbox/meetings/entitlements survive upgrade. No auth/sync feature removed to simplify storage. Native compatibility is documented and tested where available.

Deliver `reports/phase-01-storage.md`, migration/protocol ADR, synthetic evidence and manual reopen/save/failure instructions. If unsafe storage cannot be repaired, retain the last coherent state and defer dependent runtime changes.
