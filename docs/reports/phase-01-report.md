# PHASE 01 — Minimal app foundation, theme and local onboarding / Completion Report

**Branch / base commit:** `codex/phase-01-foundation` / `e43e38b9bb31ed98f5f52ae6df42404488fd173d`  
**Date:** 2026-10-21 Asia/Manila; raw evidence records UTC where applicable  
**Evidence snapshot UTC:** 2026-10-20T21:51:23Z  
**Device:** API37 x86_64 emulator, configured2048MB RAM, read-only AVD; physical phone NONE  
**Status:** `AWAITING DEVICE VALIDATION`  
**Approval provenance:** user: “proceed phase 1, make sure after every phase you tell me what to check manually”.

This explicitly authorizes Phase01 in natural language despite the kit's suggested
literal syntax. Phase00 missing physical baselines are not retrospectively passed.
No Phase02 authorization is assumed. Changes are uncommitted; no push/PR/merge or
deployment occurred. The earlier uncommitted Phase00 documents were preserved.

## 1. Scope completed

- **F-001:** anonymous offline onboarding, optional nickname (defaults to Student),
  device timezone detection/editing, welcome/back/finish flow and recoverable load/
  save failure. Completion is saved atomically and UI advances only after commit.
- **F-002:** local theme, reply preference, reminder lead/snooze and optional quiet
  hours. Values validate before save; failed writes keep the draft. Reopen setup
  preserves preferences. Settings supports discarding unsaved edits.
- **F-017 partial:** local preference inspection and setup review. Full planner-data
  deletion/export is not implemented early. Uninstall/clear storage removes settings.
- Shared semantic light/dark/system tokens and labeled scalable controls; basic
  Today/Calendar/Chat/Settings navigation; Calendar/Chat are explicit placeholders.
- Typed future SQLite/alarm/STT/TTS/intent contracts with no fake native success.
  Debug-only diagnostics states which adapters are absent.
- Fresh Android RN0.86.0/React19.2.3 foundation, OP-SQLite16.2.0, strict TypeScript,
  reproducible preflight, architecture checker, doctor and CI starter. No iOS app.
- Official template selectively adapted; no legacy app code, business modules,
  accounts, database, credentials, model binary or brand image was copied. The
  source-derived visual reference remains cream/white/charcoal/crimson, system
  type and restrained rounded controls. No large redesign or animation framework.
- `AGENTS.md` now preserves the owner's instruction to include concrete manual
  checks in every phase's chat handoff as well as its report.

**Not implemented:** planner CRUD/schema, working calendar/chat commands, native
alarms/call reminders, STT, TTS, local language model, online Gemini, backend/RAG.
Voice/quiet-hour choices are clearly labeled saved preferences only. No runtime
permission prompt occurs in this phase.

## 2. Change summary

| Files | Implementation/reason | Verification |
|---|---|---|
| `package.json`, `package-lock.json`, Babel/Metro/TS/Jest/ESLint/Prettier configs, `index.js`, `app.json` | Pinned minimal RN tooling, strict TS and reproducible checks | Preflight, debug/release native builds |
| `android/**` | Fresh capstone namespace, API30 minimum/target36, Kotlin entry points, verified Gradle wrapper, offline release manifest, original vector placeholder, ABI splits | Native compile, APK manifest/signing inspection |
| `src/app/{App.tsx,useLocalPreferences.ts}` | Composition, loading/retry, durable-save transition, four tabs, Android Back, debug diagnostics | RNTL and real emulator UI/restart |
| `src/features/onboarding/PreferencesForm.tsx` | Anonymous setup/preferences, validation/draft recovery, save/retake controls | Component behavior and emulator save/reload |
| `src/core/domain/{preferences.ts,ports.ts}` | Pure settings types/validation; future contracts only | Unit cases and import boundary checker |
| `src/core/storage/{preferencesRepository.ts,openPreferences.ts}` | One bound-parameter SQL snapshot in app-private database; explicit failure | Real host SQLite close/reopen/fault tests and actual emulator native persistence |
| `src/core/theme/*`, `src/core/ui/controls.tsx` | Semantic theme and shared accessible controls | Light/dark and200% font emulator screenshots; physical TalkBack pending |
| `__tests__/{App,preferences,storage}.test.*` |19 tests, including failed-save and corrupt-data cases |3 suites PASS |
| `scripts/{doctor,check-architecture}.mjs`, `.github/workflows/phase-01.yml` | Public tool diagnosis, TS AST cycles/offline boundaries, minimal-permission CI | Local commands PASS; remote CI NOT RUN |
| `README`, `AGENTS`, architecture/decision docs, scope/risk matrix, ADR-013, provenance, manual checklist and report/evidence | Accurate setup, phase gates, persistence decisions and manual handoff | Link/JSON/whitespace checks; evidence below |

Implementation map: [phase-01-foundation.md](../phase-01-foundation.md).
Schema/rollback decisions: [ADR-013](../decisions/ADR-013-phase-01-preferences.md).

## 3. Tests and actual results

| Check | Exact command / procedure | Result | Evidence / limit |
|---|---|---|---|
| Dependency installation | `npm install --ignore-scripts --no-fund --no-audit`; lockfile retained; repeat with `npm ci --ignore-scripts` | PASS | No install hooks or model downloads; only reviewed runtime dependencies |
| Typecheck | `npm run typecheck` | PASS | Strict, noImplicitAny, unchecked-index checks; [preflight log](evidence/phase-01-preflight.log) |
| ESLint | `npm run lint` | PASS |0 warnings/errors in final preflight |
| Formatting | `npm run format:check` | PASS | All targeted source/test/tool/config files match |
| Jest/RNTL/host SQLite | `npm test` | PASS |19 tests /3 suites; no snapshots; real host SQLite and injected UI repository |
| Full gate | `npm run preflight` | PASS | Typecheck → lint → format → tests → architecture |
| Import/cycle/offline boundary | `npm run check:architecture` | PASS |10 TS modules, no detected cycles/forbidden imports/premature main-manifest permissions; not a Kotlin/JNI graph audit |
| Doctor | JDK17/SDK selected, `npm run doctor` outside sandbox | PASS inventory | [Doctor log](evidence/phase-01-doctor.txt); inventory is not phone proof |
| Debug + release native build | JDK17/SDK selected; `android/gradlew.bat -p android :app:assembleDebug :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon --console=plain` | PASS | [Native build](evidence/phase-01-android-build.log), [post-dependency rebuild](evidence/phase-01-android-final.log) |
| Native footer/viewport recheck | Same wrapper, `:app:assembleRelease` with those ABIs | PASS build/recheck | [Footer rebuild](evidence/phase-01-navigation-recheck-build.log), [final release](evidence/phase-01-final-release.log) |
| APK permissions/signing | SDK36 `aapt2 dump badging <arm64-preview.apk>`; `apksigner verify --verbose <apk>` | PASS | [Inspection](evidence/phase-01-apk-inspection.txt); v2 signature valid, development signing only |
| Template/wrapper integrity | Actual template SHA512 vs registry; wrapper JAR SHA256 vs official9.3.1; distribution checksum pinned | PASS | [Provenance](../third-party/phase-01-provenance.md) |
| Documentation/artifact integrity | Local Markdown links, JSON parse, APK SHA256 and `git diff --check` | PASS | [Integrity record](evidence/phase-01-integrity.txt); six JSON files and four APK hashes verified |
| Offline emulator smoke | Install x86_64 release preview; disable radios/airplane mode; complete setup, select Dark, navigate, save synthetic nickname/timezone, force-stop/relaunch | PASS for exercised cases | [Smoke log](evidence/phase-01-emulator-smoke.txt); actual OP-SQLite native persistence, API37 only |
|200% font emulator UI | `adb ... shell settings put system font_scale 2.0`; inspect Today/nav and scroll to Settings Save | PASS for inspected path | Screenshots below; not full accessibility certification |
| Dependency advisory scan | `npm audit --omit=dev --json` | **FAIL / OPEN findings** | Exit1;33 affected/meta-affected entries; [raw snapshot](evidence/phase-01-dependency-audit.json) |
| Remote GitHub CI | Workflow supplied, no push/run invoked | NOT RUN | No fabricated Actions run/link |
| Graphify | Not installed | NOT RUN | Checked-in AST import graph is the reproducible substitute |
| Physical phone install/reboot/TalkBack/low-end performance | [Manual checklist](../../qa/PHASE-01-MANUAL.md) | NOT RUN / HUMAN REQUIRED | No attached physical phone |
| Native alarms/STT/TTS instrumentation | Not implemented/approved in Phase01 | NOT RUN | No mocked claim of future-feature success |

Initial failures were repaired, not hidden: Node type declarations added; safe-area
mock transformed correctly; Jest cache moved to writable workspace; a cold component
test exceeded the default5s timeout, so the RN suite uses15s. All19 tests then pass.
Initial emulator test-driver field selection was corrected. A real emulator footer
touch issue was addressed with an explicit scroll viewport/native footer sibling;
navigation, native save/reload and large-font reachability then passed recheck.
No production in-memory fallback, disabled test, assertion removal or fake engine
was introduced to obtain these results.

## 4. Artifacts, performance and device matrix

Final APK paths, exact bytes and SHA256 are in
[phase-01-artifacts.json](evidence/phase-01-artifacts.json). APKs are generated local
outputs, not committed binaries. The final source is an uncommitted working tree;
no invented source SHA is assigned to it.

- [ARM64 release preview](../../android/app/build/outputs/apk/release/app-arm64-v8a-release.apk)
  for a matching Android11+ ARM64 test phone.
- [x86_64 release preview](../../android/app/build/outputs/apk/release/app-x86_64-release.apk)
  for a matching emulator.
- Debug ABI APKs also exist but require Metro; use bundled release previews for
  airplane-mode first-launch testing. Previews use development signing and are not
  production/publication artifacts.

Actual package sizes are approximately27.2MB ARM64 /27.5MB x86_64 (decimal); consult
the JSON for exact values. These are APK file sizes, not installed size or peak RAM.
Separate ABI packages avoid sending other architectures to a device. ARMv7 remains
configured but **NOT BUILT/TESTED**, and no32-bit/Android Go support is certified.

| Environment | Evidence | Limit |
|---|---|---|
| Windows host Node24.19.0/npm11.17.0/JDK17.0.20.1 | Compilation/preflight | Not phone performance |
| RN0.86.0/React19.2.3/OP-SQLite16.2.0/TS5.9.3, SDK36/NDK27.1/KGP2.1.20/Gradle9.3.1 | ARM64+x86_64 debug/release build | Not every API/ABI/OEM |
| Read-only headless API37 x86_64 AVD,2048MB setting | Offline native launch, onboarding/save/restart, dark theme, navigation,200% text | Not a low-end physical handset, API30 or battery/OEM test |
| Low-end2–3GB and~4GB physical Android11+ devices | NOT RUN | Owner device review still required |

Old baseline remains **NOT RUN**. Real-phone startup p50/p95/n, peak PSS, battery,
alarm delivery and STT/TTS accuracy/latency remain **NOT RUN**. No speedup, memory
saving percentage or minimum-RAM guarantee is claimed. ADB cold-launch smoke timings
are not controlled performance samples; build times are not app latency.

Screenshots inspected: [welcome](evidence/phase-01-emulator-welcome.png),
[dark Today](evidence/phase-01-emulator-today-dark.png),
[200% Today](evidence/phase-01-emulator-large-text.png),
[large-text Settings](evidence/phase-01-emulator-large-settings.png).
Synthetic nickname Kai is test data. Early GMT screenshots show Oct20 UTC; after
setting Asia/Manila, the app correctly shows Oct21. Report dates use Asia/Manila.

## 5. Reliability, privacy, permissions and licenses

The one settings-row upsert commits fields/completion together. App advances after
successful SQL execution; rejected/corrupt reads expose Retry rather than discarding
settings. Save errors preserve draft values; no silent volatile fallback. Phase02
must add tested migrations to this same DB without destroying preferences.

No account, email/password, analytics, backend, cloud key, audio recording or model
is present. No private DB/environment/credential file or legacy working tree was
opened/modified in this phase. Release has no INTERNET/mic/notification/alarm/FSI
permission, though AndroidX adds its internal signature-level receiver permission.
Backup is disabled; uninstall/clear storage removes local settings. Debug alone
uses INTERNET for Metro. Do not expose Metro publicly or use preview signing for
publication.

Template MIT notice and Gradle license are retained. Registry/lockfile integrity
and package metadata are recorded in the [provenance ledger](../third-party/phase-01-provenance.md).
No model/voice license is assumed or model binary redistributed.

**Open security findings:** initial audit35 affected entries, compatible Babel7.29.7
and CLI/AndroidCLI20.2.0 fixes applied, final audit33 meta/affected entries (28 high,
5 moderate,0 critical). Two remaining leaf advisories affect braces<=3.0.3 and
sprintf-js<=1.1.3; registry latest is still those versions at scan. Counts include
propagated tooling dependencies, not33 independent flaws. No APK reachability or
blanket non-exploitability claim is made. No forced RN migration, advisory masking
or `audit fix --force` was used. Review upstream fixes/compatible alternatives before
wider distribution; build trusted project inputs only. The audit is **not PASS**.

## 6. What the owner must check manually

Full checklist: [qa/PHASE-01-MANUAL.md](../../qa/PHASE-01-MANUAL.md).
Physical checks below are **NOT RUN**; emulator tests do not replace them.

1. On a dedicated Android11+ ARM64 phone, install the matching ARM64 bundled
   preview. Record model/API/RAM and artifact hash; do not send serials or private
   data. Prefer a low-end phone. Do not overwrite old LAFINA or clear its data.
2. Turn airplane mode ON and Wi-Fi/mobile data OFF before fresh launch; stop Metro.
   Expect setup without sign-in or microphone/notification/alarm prompts.
3. Complete setup with nickname empty. Expect Student, Today and four tabs. Close/
   reopen and restart the phone offline; setup must stay complete.
4. Save a synthetic nickname, timezone, lead/snooze, reply/quiet-hour choices and
   appearance. Relaunch and verify each value. Invalid timezone/snooze/quiet time
   should show an error, preserve entries and allow correction.
5. Try Light/Dark/System and large font/display size, keyboard, landscape and
   TalkBack if available. Scroll to Save; every tab/action must remain reachable.
   Check especially bottom-tab taps after an app restart.
6. Test Discard unsaved changes and Review onboarding confirmation/cancel/reopen.
   Reopening keeps preferences; completion persists after finishing again.
7. Calendar/Chat must clearly say unavailable. Voice/Both settings must not claim
   speech works yet; quiet hours must not change Android Do Not Disturb. No mic
   capture, alarm or background reminder service should start.

Return PASS/FAIL/NOT TESTED by item, model/API/RAM and sanitized screenshots/steps.
Do not submit personal agenda/DB/audio/.env or unique device identifiers. Use
`REWORK PHASE 01: <device, steps, expected, observed>` for failures.

## 7. Docs and architecture decisions updated

[README](../../README.md), [architecture](../02-ARCHITECTURE.md),
[implementation map](../phase-01-foundation.md),
[ADR-002 build-validation update](../decisions/ADR-002-stack-validation.md),
[ADR-013 foundation/settings](../decisions/ADR-013-phase-01-preferences.md),
[decision log](../04-DECISION-LOG.md), [scope matrix](../../qa/REQUIREMENTS-MATRIX.md),
[risk register](../../qa/RISK-REGISTER.md), [provenance](../third-party/phase-01-provenance.md),
[manual checklist](../../qa/PHASE-01-MANUAL.md) and standing manual-handoff rule.
Source dependency diagram and state/failure boundaries are current. Graphify
NOT RUN; `npm run check:architecture` is the executed TypeScript graph substitute.
React component review covered stable effects/cleanup, explicit async errors,
typed contracts, no premature engine initialization and scalable labeled controls;
it is not a screen-reader or comprehensive accessibility certification.

## 8. Remaining problems, risks and next steps

- **Human device validation:** no physical phone, API30 handset, OEM, low-end RAM,
  TalkBack, landscape or reboot evidence. Run the checklist before passing01.
- **Dependency security review:** two unpatched leaf advisories remain documented;
  review before wider distribution. Do not silently treat the scan as green.
- **No production signing/release:** preview uses debug signing; distribution is not
  authorized. Remote CI has not run. Native dependencies emit deprecation/CMake
  warnings; no project source patch hides them.
- **Performance comparison:** old baseline/real-phone metrics unavailable. Keep
  claims limited to observed file sizes, build/test results and emulator behavior.
- **Future work not started:** scheduling storage/migrations and all planner/native
  voice/alarm functionality await their own phase approval. Phase02 must preserve
  this settings snapshot and add meaningful migration tests.

## 9. Review decision

- [x] Phase01 typecheck/lint/format/tests/import checks and native builds pass.
- [x] Offline emulator foundation smoke and selected large-text checks exercised.
- [ ] Dependency advisory scan clean — **NO**, open findings documented.
- [ ] Physical-device manual checks completed and owner-confirmed — **NOT RUN**.
- [x] No account/business/cloud/model import or Phase02 implementation.
- [x] Actual evidence, limitations and manual reviewer instructions saved.
- [ ] Human accepts Phase01 and explicitly approves Phase02 — **NOT RECEIVED**.

STATUS: AWAITING DEVICE VALIDATION

**STOPPED — awaiting explicit human approval for Phase 02.**
