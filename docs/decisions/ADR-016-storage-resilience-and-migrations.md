# ADR-016 — Storage resilience, migrations and the journal/busy protocol

**Status:** accepted  
**Date:** 2026-11-06  
**Phase:** AGY-PORT 01  
**Review owner:** human developer  

## Context / problem

Three defects could lose a student's work without any sign of it (inventory item 1; PF01–PF04, PF07–PF08, PF12):

- When the native SQLite connection failed to open, `db` became a no-op: writes returned success, reads returned nothing, and the app looked like a fresh install.
- A failed `ROLLBACK` was only logged, so the next statement ran inside a half-finished transaction.
- Schema setup ran statement by statement and refused nothing. A file from a newer build, or a damaged one, was written to. `userStore` also ran `CREATE TABLE` when the module was imported, before any check could run.

Later phases need to change the schema safely, and Phase 03 may add a native writer, so the locking rules must be settled now.

## Decision

**Production has no volatile mode.** `open` failure leaves `DatabaseService` in `unavailable`. Reads and writes throw `StorageUnavailableError`. The in-memory no-op adapter survives only as `setFallbackForTesting`, which throws unless `NODE_ENV === 'test'`. `isFallback()` is now true for that adapter alone; `getHealth().durable` is the production question.

**Health is explicit:** `ready`, `temporary` (test adapter), `unavailable` and `quarantined`, each with a reason and a student-facing message. `App.tsx` subscribes and shows `StorageRecoveryScreen` in place of the app for the last two. That screen has a retry and no way to clear data.

**Transactions** (`db.transactionSync`) are synchronous and own their handle:

- `BEGIN IMMEDIATE`, so write contention appears at the start, not partway through.
- The handle expires when the callback returns; later use throws.
- Async callbacks and returned promises are refused and rolled back. Nesting is refused.
- `tx.afterCommit(fn)` runs after a successful `COMMIT` and never after a rollback. If such work throws (a native alarm registration, for example), the error is logged and not rethrown, because the data is durable and must not look rolled back. Callers that must react should catch inside the callback.
- A failed `ROLLBACK` quarantines the connection until `db.reopen()`. SQLite's own automatic rollback ("no transaction is active") is a clean state and does not quarantine.

**Migrations** live in one ordered list, `SCHEMA_MIGRATIONS` in `src/storage/dbInit.ts`, after an idempotent baseline for schema 17. `initDatabase` runs:

1. Session pragmas that do not touch the file: `busy_timeout = 5000`, `foreign_keys = ON`.
2. Read `user_version`. A malformed value or one above the target is refused.
3. `PRAGMA quick_check(1)`. An explicit non-ok verdict is refused. An unreadable file fails here.
4. `synchronous = FULL` and `journal_mode = DELETE`, outside any transaction and only after the refusals.
5. One transaction: baseline, steps above the installed version, then `user_version`.

Any failure leaves the old version and all rows in place, keeps the service unavailable and retries on the next launch or `Try again`. `user_version` is transactional in SQLite, so it cannot advance without its steps.

**To add a schema change:** append `{ version: 18, description, up: (tx) => ... }` to `SCHEMA_MIGRATIONS`. `CURRENT_SCHEMA_VERSION` follows it. Steps must be synchronous, use only `tx`, and be additive. `validateMigrationSequence` rejects gaps, duplicates and reordering. Do not edit the baseline or `__tests__/fixtures/agySchema17.sql`; extend `schemaMigrations.test.ts` with the new step. No step exists today, so the version stays 17.

**Journal and busy protocol:** rollback journal (`DELETE`), `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout = 5000`. Every connection, on any side, must use exactly these.

**Native writers (constraint on Phase 03).** Today no Kotlin or C++ code opens `lafina.db`, so JS is the only writer. op-sqlite ships its own SQLite, separate from Android's framework copy. Two SQLite copies in one process do not coordinate POSIX locks and can corrupt the file (sqlite.org, "How To Corrupt An SQLite Database File", §2.2.1). A native reader or writer through `android.database.sqlite` must therefore run in a separate process, as the donor does with `android:process=":reminders"`, must apply this protocol, must refuse a newer version, and must not delete the file on corruption. Phase 03 needs its own review against this section.

**Schema version is separate from the app version.** A newer APK may keep version 17; only `SCHEMA_MIGRATIONS` moves it.

## Alternatives considered

- **Keep the no-op fallback with a warning banner (baseline).** Rejected: anything the student typed would still vanish.
- **Copy the donor's JS SQL fallback engine and full initializer.** Rejected: the plan forbids the full initializer, its schema differs (`lafina.sqlite`), and a second engine would be a second source of truth. Only the concepts were adapted.
- **Save nothing and let onboarding continue.** Rejected: it fabricates progress. Login and onboarding return once storage is usable.
- **WAL.** Deferred: it allows more concurrency but adds `-wal`/`-shm` files and a shared-memory requirement across processes. The app has one writer and short transactions. A later change needs a new ADR and must switch modes outside a transaction.
- **Full `integrity_check` at launch.** Rejected: it also cross-checks indexes and costs more on the UI thread.
- **Bump to schema 18 for this phase.** Rejected: nothing in the schema changed.

## Impact

- **Correctness:** failed writes can no longer look saved; refused files are left byte-identical in tests.
- **Behavior change:** a student whose storage fails now sees a recovery screen instead of an empty app that loses their work.
- **Startup:** `quick_check` reads the whole file on the JS thread. `quick_check(1)` limits the number of reported errors, not the time, which grows with file size. Local databases are small, but this cost is not measured on a phone.
- **Writes:** `synchronous = FULL` is the safest durable setting and may be slower per commit than a relaxed mode. Not measured on a phone.
- **Security:** SQL error logs contain a truncated statement and never bound values.
- **Unchanged:** APK contents, permissions, public API, sync wire format, entitlements, auth data handling.

## Measurements/verification

Automated on real SQLite files through `node:sqlite`: upgrade from the frozen fixture with row-identical snapshots, forced failures across the upgrade transaction, reopen, refusals with byte comparison. See `docs/plans/agy-improvements/reports/phase-01-storage.md`.

op-sqlite was checked from its 16.2.0 source only. Pragma result shapes, journal readback, open failure and timings on Android: **NOT YET MEASURED**. Manual gate M02.

## Rollback

Revert the phase commit. Schema version stays 17 and no step ran, so older AGY builds open the same file. The one lasting file change is the journal setting, which is already SQLite's default for this file. Steps added later are additive; a build older than the installed version is refused rather than allowed to write, so recovery is to install the newer build. Local data is never deleted by any of these paths.

## Human approval

Owner authorization for the unattended AGY-PORT run: `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md`. No stack or AI change is made here.
