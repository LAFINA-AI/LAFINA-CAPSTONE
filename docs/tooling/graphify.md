# Graphify — local Codex setup

Verified on2026-10-27 Asia/Manila. Development tooling only; Phase08 remains
unapproved. Application source, Android/npm dependencies and installed APK are
unchanged. No app rebuild or repeated phase test suite is needed for this setup.

## Installed tools and provenance

- `uv`0.13.6, installed through Astral's documented Python/PyPI route after
  WinGet returned no useful output in this environment.
- `graphifyy==0.9.96` (double **y**), Apache-2.0, in an isolated uv tool environment
  using Python3.12.14. It is not an application dependency.
- [Official package](https://pypi.org/project/graphifyy/0.9.96/) / publisher
  [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), published
  commit `dac063456bc1f5d92354ec3936fd9dd1513a83f3`.
- Official wheel SHA256:
  `bbef4c79b5905f45e384a7ca49417cd6c131d4774f280037159dd6cf4c425e29`.
  Download verified; all233installed package files match the wheel.
- Retained [license](../third-party/licenses/graphify-LICENSE.txt) and
  [notice](../third-party/licenses/graphify-NOTICE.txt) cover upstream project
  skill/templates. The wheel and installed tool environments are not committed.

The executable is `C:/Users/USER-PC/.local/bin/graphify.exe`. Its user PATH entry
is persisted. **Restart Codex/shells once** to inherit the updated PATH. Until
then, the current agent can use the full path:

```powershell
& "$env:USERPROFILE/.local/bin/graphify.exe" --version
& "$env:USERPROFILE/.local/bin/graphify.exe" query 'confirm session' --budget 1000
```

The uv executable is also available through `python -m uv`; its installed user
Scripts directory is added to user PATH. No system Python package replacement.

## Efficient graph-first workflow

Read root `AGENTS.md` and the project skill in `.codex/skills/graphify/`.
Use graph vocabulary for queries; prefer a narrow symbol/relationship:

```powershell
graphify query 'confirm session' --budget 1000
graphify explain CommandSession
graphify path ChatScreen.tsx commandSession.ts
graphify update .
```

The tested path found the direct extracted import from ChatScreen to the command
session. The focused explanation identified submit/confirm/cancel/dispose.
Read the source spans identified by the graph before making behavioral claims.
If a broad query is truncated, narrow it or use explain/path; do not raise the
budget to tens of thousands by default. Typical starting budgets500–1500 are
practical limits, not measured or guaranteed savings in Codex account allowance.

`graphify update .` was inspected and exercised as local structural extraction:
no LLM/API key/cloud account, semantic extraction, audio capture or daemon.
Do not enable cloud/semantic/media processing merely to refresh code. Existing
`.graphifyignore` excludes vendored sources, notices, raw evidence, benchmark
JSON, the lockfile and images; ordinary `.gitignore` rules also apply.

## Hooks and limits

`graphify install --project --platform codex` preserved the existing AGENTS.md
bytes and single Graphify section, refreshed the project skill and created
`.codex/hooks.json` with portable `graphify hook-check`.

In0.9.96 that Codex hook is deliberately a successful **no-op**. It does not
inject instructions, enforce a lookup or refresh the graph automatically.
Graph-first behavior comes from AGENTS.md/skill instructions. The agent must
run `graphify update .` after code changes. No extra Git hook/watcher/MCP server
was installed. Smoke execution of the configured hook succeeded.

First local refresh:298files considered,2,523nodes,5,344edges,190communities.
Its scope/runtime differ from Claude's earlier169-file graph; counts are not a
regression assertion. Three files were only partially parsed by tree-sitter:

- `android/app/build.gradle`
- `android/app/src/androidTest/java/com/lafina/capstone/reminders/ReminderStoreTest.kt`
- `android/app/src/main/java/com/lafina/capstone/voice/SpeechInput.kt`

Nineteen files yielded no symbols and22unsupported files were skipped. These
are graph coverage limits, not compiler findings; the earlier Android build/
tests passed. XML/manifests and unsupported constructs require direct review.
Keep EXTRACTED and INFERRED edges distinct. The graph is navigation, not proof
that an action is safe or that physical-device behavior passed.

Graph/cache/HTML stay local under ignored `graphify-out/`; setup files can be
committed. Current run facts and checksums are in
[setup evidence](../reports/evidence/graphify-local-setup.json).
