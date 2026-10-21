# ADR-002 — React Native foundation with a measured native toolchain gate

**Status:** proposed; version pins pending clean build  
**Date:** 2026-10-21  
**Phase:** 00  
**Review owner:** human developer

## Context / problem

Existing RN/TypeScript/Kotlin/C++ work is useful reference, but legacy declarations
and available host tools do not prove compatibility. Initial restricted ADB/Gradle
probes failed; outside-sandbox Gradle9.3.1/JDK17 and ADB enumeration passed. No
devices are attached, and no application build ran. Default Java25 drift requires
explicit JDK17 selection for future builds.

## Decision

Keep RN + strict TS + Kotlin as provisional architecture, C++ only for a justified
STT fallback. Start a fresh minimal template only after Phase 01 approval. Treat
observed RN 0.86.0/React 19.2.3 and OP-SQLite 16.2.0 as candidates, not adopted pins.
Validate exact Node/npm/JDK/SDK/NDK/Gradle/Kotlin/CMake and native driver together;
record the selected lockfile and clean debug/release-like results before acceptance.

## Alternatives considered

Full Kotlin rewrite requires a separate change request. Copying legacy Gradle,
all dependencies or choosing newest versions without validation is rejected.
Graphify is unavailable; manual design diagrams are the Phase 00 substitute.
An actual import-boundary/cycle check is required once source exists.

## Impact

Allows selective reuse while containing native integration risk. Minimal
dependencies reduce maintenance/APK risk; magnitude is NOT YET MEASURED.

## Measurements/verification

[Toolchain evidence](../audits/phase-00-toolchain.md) records actual versions,
errors and follow-up commands. No RN app build, native smoke test or cycle scan ran.

## Rollback

Before data exists, revise proposed pins via review; afterward preserve schema
migrations and typed adapter contracts if changing a native dependency.

## Human approval

Stack direction comes from the handoff; exact pins, any major swap and Phase 01
implementation remain unapproved. No dependency installation in Phase 00.

## Phase 01 verification (supersedes version-pending status for built ABIs)

Phase01 was subsequently approved. The exact locked RN0.86.0/React19.2.3/
OP-SQLite16.2.0/TS5.9.3 stack builds debug and bundled release previews with
JDK17.0.20.1, Gradle9.3.1, Android SDK36/NDK27.1.12297006 and project KGP2.1.20 for
ARM64 and x86_64. Babel7.29.7 and CLI/AndroidCLI20.2.0 are compatible security
updates, verified by rebuild; no RN framework migration was applied. Native build
compatibility is established for those configurations, not every ABI/API/phone.
No physical-device performance claim or Phase02 approval follows. See the Phase01
report for actual artifacts, remaining advisories and emulator/device limits.
