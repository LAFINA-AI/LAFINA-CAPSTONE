# 09 — Scalable Engineering, Documentation, Developer QoL

## Theme & UI design system (minimal visual work)

- Central semantic tokens, light/dark, typography scale, spacing (e.g. 4pt), elevation and component states. Use existing legacy aesthetics as reference; don't produce redesigned fancy screens before functionality passes.
- Make reusable `Button`, `TextInput`, `Screen`, `Card`, `Modal`, `Loading`, `EmptyState`, `ErrorState`, `ChatBubble`, and touch-accessible mic controls as needed. No overengineering.
- Dynamic font scaling, min tap targets, contrast, screen reader labels, keyboard avoidance, safe areas, landscape/rotation where supported. No animation that interferes with TTS/STT or drains battery.

## Code conventions

- TypeScript strict true, explicit DTOs and interfaces, no unsafely typed `any`. Named exports, clear names, stable ID handling, avoid massive components/services and circular imports. Extract after a file's responsibilities clearly diverge, not by arbitrary 200-line quota.
- Kotlin code uses meaningful lifecycle-aware service callbacks; no blocking UI thread; close native resources and cancel jobs correctly. Platform promises never outlive their owner without cancellation/timeout.
- Python backend uses type hints, FastAPI/Pydantic validation, Ruff and Pytest. Keep it minimal and disabled before online phase.
- Add comments for platform caveats, algorithms, transaction invariants, privacy and non-obvious trade-offs, not trivial restatements. Exported/public interfaces have concise docs. Remove stale docs and TODOs.
- Separate configuration constants; never hardcode multiple timestamps/theme values throughout files. Centralized error codes and user-friendly errors. Prefer dependency injection for testability.

## Documentation

Keep `README.md` setup, architecture, onboarding, offline/online boundary, commands, support matrix and user privacy notice current. Maintain implementation docs for schema/Android scheduler/voice/AI backend/RAG as features land. Every nontrivial change includes ADR (`templates/ADR.md`). Never cite old paper's unimplemented component as deployed.

## Graphify and dependency checks

Legacy has `npm run graphify`. In Phase 00 confirm whether same tooling supports the current RN project and works in CI. Use Graphify after architecture changes to visualize import dependency and check `offline modules -> online modules` forbidden edge. Adopt a tested import-boundary linter if Graphify is informational only. Store dependency snapshot/summary in report, not giant generated graph blobs in repo unless useful.

## Quality-of-life scripts

- `npm run preflight` runs lint/typecheck/tests reproducibly.
- `npm run doctor` checks Node, Android SDK/NDK, Java, Gradle, required SDK versions, emulator/device detection and missing model assets, without exposing secrets.
- `npm run test:domain`, `npm run test:voice`, `npm run test:alarms` only after scripts exist and work.
- Debug-only Diagnostics panel shows alarm capabilities, current offline STT engine, selected TTS voice/offline status, timings, active schedule count, last run errors. No transcript/log of private task content by default. Never expose debug panel in production.
- Add seeded synthetic test fixtures (class schedule, quiz, deadlines, snooze cases) behind debug mode. No real demo credentials.
- Write concise phase notes in `docs/reports/`; version relevant screenshots and metrics only if non-sensitive.

## Git and change process

- Use feature branches `phase/00-audit`, `phase/01-foundation` etc. Do not force push, overwrite old repo, or merge to main without request.
- Commit small logically grouped changes; use Conventional Commit prefixes (`feat`, `fix`, `test`, `docs`, `perf`, `refactor`, `chore`).
- PR template documents requirement IDs, tests, APK/manual behavior, risks, assets/licenses and QA evidence.
- Each reviewer handoff includes exact commands to validate, expected observable phone UI/voice behavior and rollback plan. No hidden dependencies.

## Token-efficient Codex practices

Read AGENTS/phase and inspect only relevant paths. Use `git grep`/symbol search, summarize old reference in `docs/legacy-port-log.md`, avoid scanning 1,800-file old tree every session, preserve tests instead of rewriting, don't generate long code dumps after implementing. Reuse architecture decisions, run focused tests during edits and full preflight once near the end. Repair phase defects before moving on; let human approve new phase.
