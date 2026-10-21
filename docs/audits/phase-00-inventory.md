# Phase 00 repository and provenance inventory

Audit date: 2026-10-21 Asia/Manila. Scope: planning and read-only evidence.

## Capstone and kit

- Active repository: `https://github.com/LAFINA-AI/LAFINA-CAPSTONE.git`.
- Starting branch `main`, HEAD `e43e38b9bb31ed98f5f52ae6df42404488fd173d`.
  Only tracked file was `README.md`, containing `# LAFINA-CAPSTONE`.
- Existing untracked input:
  `LAFINA_CAPSTONE_Codex_Phase_Gated_Handoff/lafina_capstone_codex_handoff/`.
  This was already extracted; no ZIP extraction or application copying was needed.
- Read its AGENTS/README/START_HERE, docs 00–15, Phase 00 and report template.
  Read Phase 01's prerequisites for readiness only; it is not authorized.
- The kit has 57 files: 56 hash-listed files plus its manifest. All 56 listed
  SHA-256 values match. Installed 55 planning files other than README at their
  documented root paths, and archived manifest metadata separately. Inspected and
  expanded the existing README separately. Existing source kit preserved, ignored
  to avoid duplicate standing instructions. Manifest archived in
  [handoff-manifest.json](../reports/evidence/handoff-manifest.json).
- Working branch: `codex/phase-00-audit`. Initial branch creation failed on sandbox
  Git metadata permissions; the same branch creation succeeded via tool escalation.
  No commits, pushes, merges or remote mutations performed.
- Application source, dependency installation, native project, models, runtime
  database and backend are absent. New app typecheck/build/tests are NOT RUN.

## Legacy resolution

The supplied sibling directory is a container for `LAFINA/` and
`LAFINA-Business/`; it is not itself a Git repository. Actual inspected checkout:
`C:\L3mxr\Github Repositories\LAFINA\LAFINA`.

- Local HEAD: `abb35ac5c8d8684fed80294405a0d82561b79a17`.
- Local origin points at `CyberSphinxxx/LAFINA`; upstream points at `LAFINA-AI/LAFINA`.
- Local pinned-object lookup failed (`fatal: Needed a single revision`).
- Checkout is dirty: 15 tracked modifications and 4 untracked files at first
  inspection. No checkout, reset, fetch, install, test, build or write was performed
  there. `LAFINA-Business` was not audited.
- All source findings use the GitHub connector against
  **`f7e70aec54e6d16e627f444f2a67114cbfb07b5e`**, not the dirty working files.
  The [recursive pinned tree](https://api.github.com/repos/LAFINA-AI/LAFINA/git/trees/f7e70aec54e6d16e627f444f2a67114cbfb07b5e?recursive=1)
  returned `truncated: false`, 1,849 entries and 1,686 blobs.
- Static source inventory: 97 mobile `*.test.ts/tsx` files and 21 backend
  `test_*.py` files. Counts are not test executions. Sum of Git blob sizes is
  29,139,022 bytes, including LFS **pointer** bytes; this is not full repository,
  model, APK or installed size. Machine-readable metadata:
  [pinned inventory](../reports/evidence/phase-00-pinned-inventory.json).

Final local legacy HEAD and all 19 short-status entries match the initial
observation. [Repository safety evidence](../reports/evidence/phase-00-repository-state.txt)
records the comparison and its limit: status equality is not a full byte snapshot.
No local legacy write/build command was issued.

## Dependency and security classification

Pinned [package.json](https://github.com/LAFINA-AI/LAFINA/blob/f7e70aec54e6d16e627f444f2a67114cbfb07b5e/package.json)
has 15 production dependencies. Its lockfile v3 has 919 package entries including
the root. These are observed legacy versions, not a selected capstone lockfile.

| Package at locked version | Lockfile license label | Capstone disposition |
|---|---|---|
| react-native 0.86.0, react 19.2.3 | MIT | Candidate foundation; native compatibility must be tested |
| @op-engineering/op-sqlite 16.2.0 | MIT | Candidate single SQLite driver; instrument real transactions |
| @react-native-community/datetimepicker 9.1.0 | MIT | Candidate manual date/time control |
| react-native-safe-area-context 5.8.0 | MIT | Candidate platform layout helper |
| react-native-svg 15.15.5, lucide-react-native 1.21.0 | MIT / ISC | Only if minimal accessible UI needs them |
| rrule 2.8.1 | BSD-3-Clause | Defer installation until recurrence decision/tests |
| netinfo 11.5.2, documents/picker 12.0.1, new-app-screen 0.86.0 | MIT | Omit from initial dependency set |
| ical-js-parser 0.7.4, lucide-react 1.21.0 | MIT / ISC | Omit: no import/sync or web icon dependency needed |
| react-native-fs 2.20.0, react-native-share 10.2.1 | MIT | Omit until a reviewed requirement needs them |

License labels come from the pinned lockfile, not an independent legal clearance
or full transitive notice review. No npm/pip packages were installed. Dependency
advisory scan (`npm audit --omit=dev --json`) is **NOT RUN**: no capstone lockfile
and no isolated pinned legacy dependency workspace. Backend requirements use
broad minimum versions and include auth, cloud sync and document-generation
packages; do not import them. FastAPI/Pytest/Ruff are deferred to Phase 09.

No top-level LICENSE/COPYING/NOTICE exists in the pinned tree. Current GitHub
repository metadata also reports `license: null`. The owner confirmed in this chat
on 2026-10-21: **“I have authorization; details to follow.”** This records permission
for legacy source/brand reuse; no repeat permission request is needed. Capture the
owner/attribution/publication details when supplied. Third-party code/model/voice
terms still require independent verification. PORT candidates await their own
phase approval, adaptation and tests.
No model/voice payload or brand asset has been imported. See
[native provenance audit](phase-00-native.md) for declared LFS payload metadata and
unresolved upstream/vendor/model terms.

The legacy `.gitignore` excludes environment/signing/database data, but its policy
does not prove absence of secrets in history or source. No `.env` or private
credential file or private database was opened. The pinned README contains public
demo credentials; their values were not reproduced or imported. The capstone
`.gitignore` protects private config, signing data, local captures, databases,
models and generated output. This is not a full secret-history scan.

## Documentation drift resolved

| Claim | Verified observation | Decision |
|---|---|---|
| Old AGENTS says react-native-sqlite-storage | Pinned package and runtime storage use OP-SQLite | Evaluate OP-SQLite; do not copy old AGENTS |
| Old AGENTS lists Qdrant/SmolLM2 model execution | Runtime backend is FastAPI/Pinecone/DeepSeek; native intent extractor is deterministic Kotlin | Describe actual code; bundled model does not prove inference |
| Handoff describes paper using Django/Qdrant | No manuscript supplied/found in pinned tree | Paper comparison UNVERIFIED; request manuscript only when reconciling research claims |
| Kit/native filenames imply working alarms | Receiver declaration/source mismatch and missing device evidence | Rewrite boundary; no working-phone claim |
| Kokoro considered slow | Anecdotal report only; no comparable timing run | BASELINE NOT RUN, no speedup claim |

The handoff provides phase plans, not proof that any functionality or benchmark
has passed. No requirements are marked implemented by installing documentation.
