# USTP-CDO-KNOWLEDGE — USTP Cagayan de Oro knowledge pack / Completion Report

**Branch / commit SHA:** `main` at `14bc7f0`, plus uncommitted changes (nothing committed). The working tree also holds the owner's earlier uncommitted work, which was left as it was.
**Date/time UTC:** 2026-11-23T21:15Z (2026-11-24 Asia/Manila)
**Device(s) available:** NONE (no phone used in this task)
**Status:** `AWAITING DEVICE VALIDATION`
**Phase approval provenance:** owner task "Integrate New USTP Knowledge into LAFINA", which authorizes autonomous implementation and local validation.
**Decision record:** [ADR-044](../decisions/ADR-044-ustp-cdo-knowledge-pack.md)

## 1. Scope completed

**Newly implemented:**
- The 14 reviewed knowledge files are indexed, offline, in the existing handbook FTS5 index as a second collection (`ustp_cdo`, 88 passages).
- Every passage keeps its provenance: document, as-of date, audience (UG/GR), academic years, term, PDF pages, official source links, and known-conflict caveats.
- **Retrieval:**
  - Policy questions prefer the 2023 Student Handbook; dated and campus questions prefer the campus pack.
  - Each collection is fetched separately, so neither crowds the other out.
  - Semester, academic year and UG/GR filtering.
  - A refusal for AY 2025-2026 or any other year that is not covered.
  - Long calendar lists show only the matching rows ("Is November 30 a holiday?" shows Bonifacio Day).
- **Conflicts:**
  - C1–C7 and C9 are attached as caveats; C8 is handled by the academic-year refusal.
  - The midyear start always shows both June 5 and June 9 and tells the student to confirm with the Registrar.
- **Citations:**
  - The note under a reply lists official https pages with PDF pages and the snapshot date. Each link is tappable (`SourceNoteText`).
  - Handbook-only notes are worded exactly as before.
- **Online Ask USTP:** the same excerpts are sent with rules to cite, keep years and audiences apart, state caveats and invent nothing.
- **Freshness warning:** passages carry volatility windows of 45, 120 or 365 days.
- **Questions outside Ask USTP:** general chat now recognizes campus questions (PRISMS, e-Library, ASO, enrollment period, programs offered…).

**Deliberately not done:**
- `events.json` is not imported; the app has no institutional calendar feature.
- The 4 MB reference PDF is not copied into the app.
- Call Lafina is not changed; it uses the backend index.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `knowledge/ustp-cdo/2026-11-24/` | Copy of the pack's `knowledge/`, `metadata/`, README and AGENT_INTEGRATION; hashes match the manifest | Reviewed source, versioned by date | `ustpCdoKnowledge` "every indexed document hashes to its manifest entry" |
| `scripts/build_campus_knowledge_pack.py` (new) | Deterministic builder: manifest SHA check, chunking, metadata, curated caveats, registry-only links, acronym keywords, `--check` | Reproducible, auditable pack | `--check` exit 0 |
| `src/handbook/ustpCdoKnowledgePack.json` (new) | Generated pack (14 docs, 88 chunks, sha256 `8104b8d001ca…`) | Bundled offline data | integrity tests |
| `src/storage/handbookSchema.ts`, `dbInit.ts` | Migration v32: `collection`, `meta_json` columns (additive, idempotent) | Two corpora in one index | `schemaMigrations` 16/16, `ustpCdoKnowledge` schema tests |
| `src/storage/localHandbookStore.ts`, `index.ts` | Knowledge metadata types and validated parser (https-only links); collection filter in `queryFts`; `countChunks` | Provenance and scoping | `ustpCdoKnowledge` |
| `src/handbook/knowledgeScope.ts` (new) | Reads year, term, audience and preference from a question; scope filter; freshness | Keep years and audiences apart | `ustpCdoKnowledge` "dates, terms and audiences" |
| `src/handbook/knowledgeCitations.ts` (new) | Citation note builder | Clickable, never invented links | "citation notes" tests |
| `src/handbook/handbookSearch.ts` | Synonyms, concept groups, acronym evidence, row ranking, collection preference, AY refusal, campus-aware prompt and offline formatting | Retrieval quality and honesty | `ustpCdoKnowledge`, `appStatusAudit20261116`, `localHandbookRag`, `phase10HandbookRAG` |
| `src/handbook/localHandbookService.ts`, `index.ts` | Merges the campus pack with the handbook (bundled and device override); fetches each collection separately; `collections` and `referenceDate` options; banner count stays handbook-only | Integration without changing the handbook pack | `localHandbookRag` 13/13 |
| `src/skills/onlineChatSkill.ts` | `handbookSourceLabel` adds the campus line | Citations | "handbook-only notes keep their existing wording" |
| `src/ui/components/chat/SourceNoteText.tsx` (new), `ChatMessageItem.tsx` | Note pill renders tappable https links | Clickable citations | `sourceNoteText` 3/3 |
| `src/ai/onlineIntentExtractor.ts` | Campus question cues | Offline general chat answers campus questions | "campus questions are recognized" |
| `src/ai/chatOrchestrator.ts` | Passes `referenceDate` to the search, prompt and offline answer | Freshness uses the conversation's date | `ustpCdoKnowledge` end-to-end |
| `src/ui/screens/skills/DocGenSkill.tsx` | `collections: ['handbook']` | Document generation keeps its handbook-only scope | "Document generation keeps to the Student Handbook" |
| `docs/decisions/ADR-044-…`, `docs/07-RAG-AND-ONLINE.md` | Decision and RAG doc section | Documentation | — |
| `__tests__/ai/ustpCdoKnowledge.test.ts`, `__tests__/ui/sourceNoteText.test.tsx` (new) | 53 tests on the real corpus | Regression coverage | below |

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS | no output |
| Lint | `npx eslint <14 changed files>`; full `npm run lint` inside preflight | PASS | No output; `--max-warnings 0`. |
| Prettier (new files) | `npx prettier --write` on the 5 new TS/TSX files | DONE | Edited existing files were already not Prettier-clean at `HEAD` and were not reformatted. `format:check` is not part of preflight. |
| Pack freshness | `python -I scripts/build_campus_knowledge_pack.py --check` | PASS | "Up to date … (88 chunks, sha256 8104b8d001ca)" |
| New tests | `npx jest __tests__/ai/ustpCdoKnowledge.test.ts __tests__/ui/sourceNoteText.test.tsx` | PASS 50/50 + 3/3 | — |
| Handbook regressions | `npx jest __tests__/ai/localHandbookRag.test.tsx __tests__/ai/ustpCdoKnowledge.test.ts __tests__/ai/phase10HandbookRAG.test.tsx __tests__/ai/appStatusAudit20261116.test.ts` | PASS 137/137 | — |
| Schema migrations | `npx jest __tests__/storage/schemaMigrations.test.ts` | PASS 16/16 | Includes the schema-17 → current upgrade with forced failures. |
| All 45 handbook-related suites | `npx jest $(grep -rl handbook __tests__)` | 42 PASS, 3 FAIL | See §8. `localHandbookRag` was fixed afterwards; the other 2 are outside this change. |
| Full preflight | `npm run preflight` | INCOMPLETE | Claude Code stopped it because the computer ran low on memory. Before that, full-repo `typecheck` and `lint` passed. Jest (`--runInBand`) finished 131 of 226 suites: 129 passed, 2 failed (`chatHistorySync` and `callLafinaStudentContext`, see §8.2). `check:architecture` NOT RUN. |
| Android build | `gradlew` | NOT RUN | No native code changed. The JSON pack is bundled by Metro. |
| Device manual | §6 | HUMAN REQUIRED | — |

## 4. Performance and device matrix

N/A for benchmarks; none were run.
- The pack adds 166 KB of JSON and 88 rows. Indexing happens once per pack SHA.
- Each search now runs up to four FTS5 queries instead of two: strict and relaxed, for each collection. In Jest each search took 20–60 ms. Device timing was NOT RUN.

## 5. Reliability, privacy, permissions, licenses

- **Permissions and data:** no new permissions, no network calls, and no personal data.
- **Links:**
  - Every link comes from the pack's `sources.json`; the parser rejects non-https links and the UI opens https only.
  - Link labels are stripped of Markdown brackets.
- **Content safety:** pack text goes through the existing passage sanitizer before it reaches the prompt.
- **Uncertain information** is labelled, never asserted:
  - historical organization directory (C7);
  - two phone numbers (C5) and extension forms (C6);
  - scholarship amounts not verified;
  - officials listed as a snapshot.
- **Eligibility:** all of this stays behind the existing USTP eligibility gate (a confirmed COR).
- **Licensing:** the pack is the owner's compilation of public USTP pages and the CHED-noted calendar, and each passage cites its source. Redistribution is the owner's decision, as for the 2023 Student Handbook PDF.

## 6. Human phone verification

See the checklist in the chat handoff. In summary:
1. Install a debug build on a phone whose USTP setup is confirmed.
2. In Chat, turn on **Ask USTP**, go offline, and ask the listed questions.
3. Check the dates, the two midyear dates, the AY 2025-2026 refusal, the tappable links (they open the official pages), and that handbook answers still look the same.

The agent cannot certify on-device rendering, link opening or TTS behaviour.

## 7. Docs/ADRs changed

- [ADR-044](../decisions/ADR-044-ustp-cdo-knowledge-pack.md)
- [docs/07-RAG-AND-ONLINE.md](../07-RAG-AND-ONLINE.md), section "USTP Cagayan de Oro knowledge pack"
- Architecture check: covered by `npm run preflight` (`check:architecture`); see §3.

## 8. Open blockers and recommended next steps

1. **Call Lafina does not know the campus pack.** It searches the backend's index. Adding the pack there is a `LAFINA-backend` change, which needs owner authorization.
2. **Two failing suites outside this change.**
   - `__tests__/cloud/callLafinaStudentContext.test.ts`: 2 tests, expecting note text in the voice context.
   - `__tests__/storage/chatHistorySync.test.ts`: 1 test, and a different one failed in two runs.

   Neither imports the handbook modules. Both exercise files with earlier uncommitted changes (`localVoiceData.ts`, `syncWorker.ts`, and the chatHistorySync test itself). They were not touched here.
3. **Possible COR date mismatch.** The uncommitted `src/ai/vision/corReviewModel.ts` suggests a first-semester end date of **2026-12-17**. The official calendar says **December 19, 2026**: the term summary on PDF p. 2, with non-graduating finals December 9-19 on p. 3. This was not changed; the owner should confirm.
4. **Assistant-directed wording.** A few passages are written for an assistant ("LAFINA should say …"), and offline replies show them as written. Rewording them belongs in the next pack revision.
5. **Refreshing the pack.** The pack is a dated snapshot. To refresh it:
   1. Add `knowledge/ustp-cdo/<date>/` with a manifest.
   2. Point the builder at it.
   3. Rebuild and run `--check`.

## 8a. Follow-up: Ask USTP and the sources library (ADR-045)

Owner approval: "proceed and just do what you think is best".

**What changed:**
- **Name.** "USTP Handbook" is now **Ask USTP** in the sidebar, the chat header, the placeholder, the empty state, the offline banner, Preferences, onboarding, the tour and the help list. "Local FTS5 Ready" is now "Works offline". Document generation keeps "USTP Handbook", because it uses only the handbook.
- **See passages.** Answers save the passage ids their note cites, on the phone only; the sync payload is unchanged. A test checks this. **See passages ›** opens those exact passages.
- **USTP sources library.** It opens from the sidebar and from the empty state. It shows both sources, then chapters or documents, then every passage, with pages, UG/GR and year scope, conflict notes, freshness, tappable official links, all official pages, and a plain substring search.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS |
| Lint (touched files) | `npx eslint … --max-warnings 0` | PASS |
| Architecture | `npm run check:architecture` | PASS: 519 modules, 0 import cycles, 0 forbidden dependencies |
| New tests | `npx jest __tests__/ui/ustpSourcesLibrary.test.tsx` | PASS 16/16 |
| Handbook, chat and label suites | 13 suites incl. `localHandbookRag`, `chatUniGuideRedesign`, `productTourWalkthrough`, `ustpCdoKnowledge`, `appStatusAudit20261116` | PASS 266/266, after updating 3 label assertions |
| Suites rendering chat, sidebar, ToolSheet, tour or orchestrator | 50 suites, `npx jest <list> --runInBand` | PASS 751/751 |
| Full `npm run preflight` | — | NOT RERUN, because the machine ran low on memory last time |

## 9. Review decision

- [ ] All automated required checks passing (see §3 and §8.2)
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate, links validated, docs updated

`STATUS: AWAITING DEVICE VALIDATION`
`STOPPED — awaiting explicit human approval`
