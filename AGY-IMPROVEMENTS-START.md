# AGY improvement port — start here

Extract this archive into the **AGY repository root**, so that `docs/plans/agy-improvements/PLAN.md` exists. The archive does not replace `AGENTS.md`, application files, dependencies, or existing phase reports. Its work has not been executed. If this exact plan directory already contains execution results, preserve it and resume that run instead of overwriting it with the initial ZIP.

Expected repository: `LAFINA-AI/LAFINA-CAPSTONE`, branch `agy-development-cont`, audited HEAD `b9433dc39d172f30ba26ea68e4a9c9eedd922407`. Required writable checkout: `C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont`.

Read-only donor: `C:\L3mxr\Github Repositories\LAFINA\LAFINA`, pinned commit `0d4bbe39e106c29fb90792cf5d2f916b5c0d6480`. The pack contains instructions and reference evidence, not donor source or model binaries.

## Start Claude Code

Use Claude Code **Opus 5.5**. Run from this exact AGY checkout:

```powershell
Set-Location -LiteralPath 'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
claude --model claude-opus-5-5 --permission-mode auto
```

Then paste `docs/plans/agy-improvements/START-PROMPT.md`, reproduced below. The model ID and Auto mode were checked against official documentation on 2026-11-06. Installed Claude Code observed during preparation: 2.1.318. Model/account access and permission-mode availability still depend on your installation. Use your already authenticated session; do not put credentials in this pack.

Auto mode reviews tool actions without routine approval prompts. A prompt cannot override managed tool permissions, account limits, workspace trust, or OS access. Complete initial trust/login/setup before leaving. Do not use a permissions-bypass flag to overcome denials. If Auto mode is unavailable, configure the needed project-scoped permissions before starting; the plan tells Claude to document denied work and continue independent work.

## Paste this prompt

```text
You are implementing AGY improvements UNATTENDED using Claude Code Opus 5.5. I am away and will not answer questions or approve intermediate steps.

Read docs/plans/agy-improvements/OWNER-AUTHORIZATION.md, PLAN.md, and every file in context/ fully before changing application code.

I explicitly authorize all AGY-PORT phases 00 through 13 in this pack, sequentially, without further human approval. This task-specific authorization overrides older repository rules that would remove AGY's existing features or stop between these phases for human/device approval. Keep every other safety/privacy constraint. Pending phone/live-service checks must remain NOT RUN and must never be called passed, but they do not stop independent implementation.

AGY is the product base. Preserve accounts, subscriptions/entitlements, guest linking, cloud sync, online AI, Handbook RAG/citations, document generation/attachments, meeting recording/transcription/consent, existing UI/navigation, and speech defaults. Keep Whisper and react-native-tts with AGY's existing entitled online speech/fallback behavior. Never introduce Kokoro. Add improvements; do not replace AGY with the donor or disable features to pass checks.

Work only in C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont on codex/agy-preservation-improvements, created from the verified agy-development-cont baseline. Before edits, resolve and verify that exact Git top-level path. If launched elsewhere, change to that path first. Do not implement in the original LAFINA-CAPSTONE folder or any other checkout/worktree. Read the LAFINA donor only at the pinned revision described in context/BASELINE.md. Never modify either donor or another checkout. Never push, deploy, merge into the base branch, reset, clean, stash, delete branches/commits, read secrets, change signing, or clear device/student data.

Execute phases 00–13 in order. If useful, use one foreground implementation subagent per phase and a separate read-only reviewer, both on this exact Opus 5.5 model; otherwise do the same workflow yourself. One writer at a time. Read prompts/IMPLEMENTER.md and prompts/REVIEWER.md. The parent verifies tests, diffs, preserved-feature results, and phase reports before proceeding.

Never ask me questions or wait for review. Decide routine details conservatively and record them. Attempt available checks. Missing devices, credentials, remote backend access, tooling permissions, or a genuinely unsafe change mean document the limit and defer the smallest affected unit; continue all independent safe work. Do not silently pass failures, weaken tests/entitlements, hide features, or leave a broken experiment active.

Write results only under docs/plans/agy-improvements/reports/ and its evidence/ directory, plus needed product docs/ADRs. Keep RUN-STATE.json, autonomous-run-log.md, PRESERVED-FEATURES.md, and manual verification instructions current. Make small local commits containing only reviewed task files when checks permit. Finish with reports/SUMMARY.md, listing implemented, verified-existing, deferred, failed, and NOT RUN items separately for all 30 inventory areas.

If resuming, read RUN-STATE.json, autonomous-run-log.md, the latest phase report and git status first. Verify any in-progress work; do not repeat commits or skip incomplete work because a status file says DONE. Resume the first eligible incomplete phase. Do not end after producing a plan: implement the authorized work and leave the final results in docs.
```

## Read later

Open `docs/plans/agy-improvements/reports/SUMMARY.md`. During execution, inspect `RUN-STATE.json`, `autonomous-run-log.md`, phase reports and `PRESERVED-FEATURES.md`. The run must distinguish coding completion from physical-device and live-backend qualification.

Optional package-integrity check before starting: `python docs/plans/agy-improvements/tools/validate-pack.py`. It reads only pack files. After Claude changes result files, original hashes will naturally differ; use `--structure-only` for structural checks then. The manifest validates the package, not app behavior.

Official launch references: [model configuration](https://code.claude.com/docs/en/model-config), [permissions](https://code.claude.com/docs/en/permissions). See the pack's [research notes](docs/plans/agy-improvements/context/RESEARCH.md) for technical sources and limitations.
