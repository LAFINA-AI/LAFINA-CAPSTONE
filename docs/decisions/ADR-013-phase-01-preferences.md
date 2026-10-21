# ADR-013 — Anonymous local foundation and durable preference snapshot

**Status:** implemented; physical-device acceptance pending  
**Date:** 2026-10-21 Asia/Manila  
**Phase:** 01  
**Approval:** user: “proceed phase 1, make sure after every phase you tell me what to check manually.”

## Context / problem

Phase 01 must provide no-account onboarding, persisted local settings, basic tabs,
theme tokens and truthful future-feature boundaries. Phase 00 identified unsafe
legacy storage fallback, identity/business coupling and unverified native versions.
No existing app source was present in capstone.

## Decision

Use the official React Native community template 0.86.0, selectively copying only
Android/configuration files. No legacy application code or brand assets are ported.
The source-derived visual reference is cream/white/charcoal surfaces, a crimson
accent, system fonts and simple rounded controls; primary text contrast is adjusted
through shared semantic tokens. The launcher is an original letterform placeholder.
Retain the template MIT notice in docs/third-party.

Runtime dependencies are RN/React, safe-area-context and OP-SQLite only. No navigation
library, state manager, cloud SDK, analytics or speech model is needed for four
local tabs. No runtime engine initializes before the user can read the app.

One app-private `lafina-capstone.sqlite` contains `app_settings`:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
```

The payload's schemaVersion=1 stores nickname (optional), IANA timezone, appearance,
lead/snooze, reply preference, quiet hours and onboarding completion timestamp.
No account identifiers/passwords/email/roles exist. A single bound-parameter upsert
atomically saves all fields and completion; UI advances only after durable success.
Invalid or unreadable saved data surfaces Retry, never a silent reset or volatile
production DB. Failed save preserves draft input. Reopening onboarding sets only
completion to null and keeps existing preferences.

Phase 02 will extend this same database with explicit tested migrations and planner
tables; preserve this table/payload. There is no migration from legacy v17. No
tasks/events/alarm job schema is implemented early.

Reply/quiet-hour selections are preferences only. The UI clearly states that voice
and reminders are not available yet. No microphone/notification/exact/FSI permission
is requested. Main/release manifest has no INTERNET permission; debug-only network
permission serves Metro. Release preview bundles Hermes JS for airplane-mode use,
disables backup and cleartext, and uses standard development signing, not publication
credentials. Debug application ID has `.debug` suffix; both differ from old LAFINA.

ABI-split APKs avoid including unrelated native libraries on each phone. ARM64 and
x86_64 build/runtime evidence is recorded separately; untested ARMv7/low-end physical
support is not inferred. No always-running service, polling loop, heavy animation,
model preload or background microphone exists.

## Alternatives considered

- AsyncStorage/SharedPreferences temporary store rejected: another authority and
  avoidable data migration when Phase 02 adds SQLite.
- Legacy user/database/theme providers rejected: account/sync/demo dependencies.
- Complete scheduling schema deferred: Phase 02 is not authorized.
- Plain text/manual preferences remain usable without future engine modules.
- Full navigation/design frameworks rejected for this small local foundation.

## Measurements / verification

Exact package pins are in package.json and package-lock.json; actual native build,
test and emulator outcomes are in the Phase 01 report. Host SQLite tests exercise
real SQL, file close/reopen and rejected writes, but do not certify Android JSI.
RNTL uses an injected test repository and a native-driver mock that throws by
default, never a production fallback. Graphify is unavailable; the checked-in
TypeScript AST import/cycle checker is the documented substitute.

No real-phone startup, PSS, battery, STT/TTS or alarm performance measurement is
claimed. Phase 00 baseline remains NOT RUN. Emulator evidence cannot establish
low-end handset support.

## Rollback

Before any planner data exists, revert Phase 01 source/config files and preserve
the app settings DB. Later migrations must preserve existing preferences and user
data. Settings are device-local; uninstall/clear storage removes them. No legacy
checkout, history, private DB, model or environment file was modified/imported.

## Human approval / stop

Natural-language Phase 01 approval is explicit authorization despite the kit's
suggested literal approval syntax. It does not mark missing Phase 00 physical
baselines passed. Owner must review Phase 01 manual checks before Phase 02; no
automatic continuation or deployment is authorized.
