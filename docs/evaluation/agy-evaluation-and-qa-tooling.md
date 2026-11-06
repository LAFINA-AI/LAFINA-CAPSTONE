# AGY evaluation, offline boundary and QA tooling (AGY-PORT 12)

This page explains what each tool proves and what it does not prove. All tools run on a developer host. None of them ships in the app, collects student data, or needs the network.

## 1. Offline boundary (static)

Run: `npm run check:architecture` (also part of `npm run preflight`).

- **Offline leaves**: `src/storage`, `src/scheduler`, `src/ai/nlu`, `src/ai/stt`, `src/ai/tts` and `src/ai/native`. There were 71 files on 2026-11-06.
- **What the scanner follows from each leaf** (`scripts/offline-boundary.cjs`, TypeScript AST):
  - static imports and re-exports;
  - `require()` calls;
  - `import()` calls, transitively.
  - Type-only imports are skipped because they are erased at build time.
- **What it reports:**
  - any path to a network global (`fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource`);
  - any path to a network package (http/https/net/tls/dgram, axios, undici, node-fetch, cross-fetch, ky, socket.io-client, NetInfo);
  - any path to an online module (`src/cloud`, `src/sync`, `src/skills`, `src/updates`);
  - every `import()` whose specifier is not a string literal.
- **Online composition stays outside the leaves.** Chat, documents, meetings and cloud speech are composed in `src/ai/chatOrchestrator.ts`, `src/ai/documentIntent.ts`, `src/ai/meeting`, `src/meetings` and `src/ui`. None of them was removed or narrowed to pass the check. If a leaf ever needs an online edge, it must be added to `ONLINE_COMPOSITION` as one exact `importer -> target` pair with a reason. Directory or wildcard allowances do not exist, and an approval whose edge disappears is itself an error.
- **The existing policy is unchanged:** no business, Gmail, study-tool or Kokoro modules; no import cycles; manifest permissions.
- **Tests:** `__tests__/evaluation/offlineBoundary.test.ts` has 10 cases:
  - **Real violations:** direct and global network calls, a transitive chain, dynamic `import()`/`require()`/re-exports, network packages and non-literal dynamic imports.
  - **False positives:** type-only imports, and the words `fetch`/`WebSocket` in comments, strings or properties.
  - **Scope:** online modules and UI may use the network; only an exact approval passes, and a stale approval is reported.
  - **The real tree:** the actual project passes with no approvals.

## 2. Zero-network sentinel (runtime)

Run: `npx jest offlineNetworkSentinel`.

- **Setup:**
  - `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` are replaced with sentinels that record each call and throw.
  - The device is reported **online**, so a local flow cannot pass merely because cloud code noticed it was offline.
- **Positive control:** a real `cloudClient.request` call does trip the sentinel. A silent sentinel therefore means "no network attempted", not "sentinel not wired".
- **Flows covered:**
  - fast-path parse → review → Confirm for a reminder, a task, a time block and a note;
  - update, delete, acknowledge, snooze and query;
  - Chat with a local command;
  - the planner window read;
  - Notes search;
  - offline voice eligibility.
- **Limit:** native alarms are Jest spies. This proves the JavaScript layer makes no network call; it does not prove Android behavior.

## 3. Frozen evaluation fixtures

Fixtures live in `evaluation/`, and `evaluation/fixture-manifest-v1.json` lists each one with its version and SHA-256. The hash is taken over LF-normalized bytes, so a CRLF checkout verifies the same.

| Fixture | Checks | Is not |
|---|---|---|
| `intent-contract-v1.json` | 34 synthetic commands: fast-path fields and route for every AGY intent type. Also the empty transcript (`out_of_scope`) and the ringing-call routes | SmolLM2 accuracy, speech accuracy, a held-out test |
| `notes-contract-v1.json` | Search normalization of HTML/Markdown, LIKE escaping, and filtered/search pages on synthetic notes | Ranking quality, large-corpus timing |
| `speech-contract-v1.json` | Positive offline-voice eligibility and automatic selection (audit A1) | Audibility, engine behavior on a phone |
| `protected-contracts-v1.json` | PF01–PF13 each still map to an existing named test | Proof that those tests are sufficient |
| `stt-corpus-v1.json` | Reference sentences for the WER scorer | Audio; no recognition was run |

**Rules, enforced by `__tests__/evaluation/evaluationContracts.test.ts`:**

1. A frozen file never changes. Any edit fails until the change is made as a new `-v2` file.
2. A file's own `version` and its manifest version must equal the `-vN` in its name.
3. Every JSON file in `evaluation/` must be listed in the manifest.
4. The v1 hashes are also written in the test, so changing one shows in review as two coordinated edits.

**Fresh evidence:**

- Run: `AGY_EVALUATION_OUTPUT=docs/plans/agy-improvements/reports/evidence/<run>/<phase>/evaluation-{kind}-N.json npx jest evaluationContracts`.
- The writer refuses:
  - an existing file (`wx`);
  - any path outside `docs/plans/agy-improvements/reports/evidence/`;
  - a source that is not a `src/**` TypeScript file.
- Each report records:
  - the fixture hashes;
  - a hash of every named source;
  - one hash over the whole `src` tree;
  - the host environment.

**Observed limitations, kept out of the fixtures** (2026-11-06; the v1 fixtures contain only outputs reviewed as correct):

- "mark the task review chapter 3 as not done" is parsed as a new task whose title is the whole phrase. Marking a task not done by voice is not understood.
- "remind me to take my medicine every day at 9 pm" keeps "every day" in the title and sets no date. Recurrence is not parsed by the fast path.
- "update note X to Y" sets no new title; "rename note X to Y" does.
- "next friday", said on a Monday, resolves to the Friday of the following week. This is ambiguous and was not frozen.

## 4. QA SQL checks (host, owned temporary file)

Run: `npx jest qaSqlChecks.test`. Set `AGY_QA_SQL_OUTPUT=<new evidence json>` to record a report.

- **Isolation:**
  - `__tests__/evaluation/support/qaSqlChecks.ts` creates its own `agy-qa-sql-XXXXXX` directory in the user temp folder.
  - It runs AGY's real migrations and query stores on a file there.
  - It removes exactly that directory, after closing every handle it opened.
  - It never uses the app database. The test makes the app database throw if anything touches it.
- **Checks:**
  - schema version and ready health;
  - paired note and outbox rollback/commit, and no revision after a rollback;
  - bounded, account-scoped Notes pages;
  - rich-text search and search after an edit;
  - revision bump on any SQL write, and a stale-revision write refused;
  - foreign keys and UTC timestamps;
  - close/reopen;
  - `quick_check`.
- **The report holds only check names, pass/fail, duration and schema version.** It contains no rows, paths or error text.
- **Failure rules:**
  - Cleanup that cannot be confirmed fails the run, even when every check passed.
  - A statement budget stops a runaway check.
- **Gap (PARTIAL):** the donor's in-app QA screen and native fixture gate (`LafinaQaDiagnosticsModule`, `QaDiagnostics.tsx`) are **not** ported. They need new Kotlin and device validation. Until then the checks run on the host only, and the production app cannot reach them.

## 5. Emulator QA runner

Run: `python scripts/emulator_qa.py --serial emulator-NNNN --designated-avd <name> --apk <x86_64 apk> --receipt <apk_audit receipt> --output <new json in evidence>`.

- **Gates, all checked before any install:**
  - the device is an emulator (`emulator-NNNN` and `ro.kernel.qemu=1`) whose AVD equals the owner-designated name;
  - the APK hash and ABI match an all-PASS `apk_audit.py` receipt;
  - `com.lafina.capstone` is not already installed, unless `--allow-update-existing` is given;
  - the network is confirmed off.
- **It never:**
  - uninstalls or clears data;
  - touches a physical device;
  - leaves the network changed. Unconfirmed restoration is a failure.
- **Automated checks:** standalone launch without Metro, the process stays alive, and no fatal exception.
- **Manual steps listed in the report:**
  - planner review: Cancel, Confirm, untimed item, delete;
  - Chat paging and Notes;
  - the online, document and meeting screens.
- **Status:** NOT_RUN. No emulator is designated. The only local AVD holds unknown data, and dataQa uses the production app ID.

## 6. Speech-recognition scoring

- `scripts/stt-metrics.cjs` provides:
  - word normalization;
  - a bounded edit distance (WER);
  - fresh and shared-context timing summaries.
- Every empty or failed attempt counts as an error.
- Reports carry source, corpus, model and APK fingerprints, and are written only as new files in the evidence folder.
- `SCORER_SELF_TEST` reports are labeled as not recognition evidence.
- Tests: `node --test scripts/tests/stt-metrics.test.cjs`.
- **NOT_RUN:**
  - actual Whisper collection;
  - the test-only native instrumentation path.

  No approved public, synthetic or consented audio fixture is in the repository, and no student microphone audio may be used.

## 7. Doctor

Run: `npm run doctor`.

- It reads the required versions from the project itself:
  - Node from `package.json` engines;
  - the JDK, compile SDK, build-tools, NDK and CMake from the Gradle files.
- It runs read-only version subprocesses, each bounded to 10 s.
- It never installs anything, prints the environment, or opens `.env` or signing files.
- It exits nonzero when a required check fails.
- On 2026-11-06 it correctly failed the default shell: `JAVA_HOME` pointed to Android Studio's JDK 25, while the build uses JDK 17 (the Gradle wrapper scripts set JDK 17 explicitly). With that JDK it passes.
- Tests: `node --test scripts/tests/doctor.test.mjs`.

## 8. Planner benchmark

`scripts/benchmark-planner.cjs` predates the AGY base. It hashes `src/core/...` files that no longer exist, and it fails before writing anything. It is **STALE**.

Its old baselines in `docs/benchmarks/` are kept unchanged and are not comparable to AGY. No new host timing was recorded: an opt-in Jest timing test exists (`AGY_MEASURE`), but host timing says nothing about phone latency.

## 9. Graphify

The `graphify` binary is on PATH, but this checkout has no `graphify-out/graph.json` (as Phase 00 recorded). No graph was generated, queried or updated. The TypeScript AST scanner above, together with targeted `rg` searches, is the substitute.
