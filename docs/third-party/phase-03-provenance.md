# Phase03 provenance and build dependencies

No model, speech engine, legacy source/asset, application runtime npm dependency or
Android runtime library was added in this phase. Android framework APIs provide
AlarmManager, notifications, the simulated screen and the isolated SQLite engine.
[Targeted legacy selection](../audits/phase-03-legacy-selection.md) records pinned
read-only references and why the old microphone foreground service was excluded.

New Gradle dependencies are test-scoped only:

| Coordinate | Scope | License declared in downloaded Maven POM |
|---|---|---|
| `junit:junit:4.13.2` | JVM unit tests | Eclipse Public License1.0 |
| `androidx.test:runner:1.7.0` | Instrumentation APK only | Apache License2.0 |
| `androidx.test.ext:junit:1.3.0` | Instrumentation APK only | Apache License2.0 |

Versions were checked against the [official AndroidX Test release notes](https://developer.android.com/jetpack/androidx/releases/test).
JUnit and runner license declarations were inspected in the installed Maven cache;
the AndroidX extension is part of the same Apache-licensed AndroidX Test project.
These dependencies and their transitives belong to test artifacts, not the release
app's implementation configuration. This is not a complete transitive legal or
security clearance. Keep distribution notices and provenance review as release work.

The [Phase01 security ledger](phase-01-provenance.md) and advisory JSON remain
historical evidence. No new npm audit scan or upstream advisory resolution is
claimed by Phase03. Development preview signing/debuggability restrictions remain.
ARMv7 is an explicit experimental build opt-in, not a supported-device claim.
