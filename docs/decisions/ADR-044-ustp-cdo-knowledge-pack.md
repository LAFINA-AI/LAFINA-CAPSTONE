# ADR-044 — USTP Cagayan de Oro knowledge pack beside the Student Handbook

**Status:** accepted (awaiting review)
**Date:** 2026-11-24
**Phase:** USTP-CDO-KNOWLEDGE
**Review owner:** human developer

## Context / problem

LAFINA's local USTP knowledge was one source: the 2023 USTP Student Handbook
(367 passages, `src/handbook/ustpHandbookPack.json`). It covers standing
policies, but not this year's dates, offices, portals, programs or library
locations. The owner supplied the **LAFINA USTP CDO Knowledge Pack**
(2026-11-24): 14 reviewed Markdown documents, a source registry, a list of
known source conflicts (C1–C9) and agent rules (`AGENT_INTEGRATION.md`):

- index only `knowledge/*.md`, and make ingestion idempotent;
- keep provenance, dates and audiences;
- show conflicts and never pick between them (for example the June 5 and
  June 9 midyear starts);
- do not use AY 2025-2026 dates;
- use `events.json` only if the app has institutional calendar events (it
  does not).

## Decision

1. **One index, two collections.** Migration **v32** adds `collection`
   (default `'handbook'`) and `meta_json` to `handbook_chunks`. The campus
   pack is merged after the Student Handbook at load. The Student Handbook
   pack, its builder and its banner count are unchanged. Re-indexing is
   skipped when the combined SHA is unchanged.
2. **A deterministic builder.** `scripts/build_campus_knowledge_pack.py`:
   - Has no dependencies, and `--check` confirms the committed pack is
     current.
   - Verifies every file against the manifest SHA-256 and refuses anything
     outside `knowledge/*.md`.
   - Keeps each table row whole.
   - Adds per-passage metadata: document, audience, academic years, term,
     UG/GR scope, PDF pages, official source links and caveats. Links come
     only from `sources.json`; caveats are the curated wording of C1–C7 and
     C9.
   - Adds acronyms the pack itself defines (CITC, ASO, SITE…) as keywords.
3. **Scoped retrieval** (`src/handbook/knowledgeScope.ts`, `handbookSearch.ts`):
   - Each collection is fetched separately, so neither crowds out the other.
   - Policy questions prefer the handbook; dated and campus questions prefer
     the campus pack.
   - A different semester is filtered out. Graduate rows are left out unless
     the question asks for graduate studies, and the reverse also holds.
   - A question for another academic year gets a refusal that points to the
     official calendar (this covers C8), never AY 2026-2027 dates.
   - Long calendar lists show only the rows for the question, plus a count
     of the other rows.
4. **Citations that can be checked.** The note under a reply keeps its
   handbook wording ("Referenced USTP Student Handbook (p. 42)"). Campus
   replies add "USTP CDO sources (as of November 24, 2026): [Title, PDF p.
   4](https://…)". There are at most 4 links, https only, and each is
   tappable (`SourceNoteText`). URLs stay out of the reply body, so TTS
   never reads them.
5. **Online** the same excerpts go to the model in `<handbook_excerpts>`.
   They carry rules to cite the source and page, give the as-of date, keep
   UG/GR, semesters and years apart, state caveats and never choose between
   conflicting dates. The backend's handbook search stays off for these
   turns, as before.
6. **Freshness.** Passages carry `asOf` and volatility. After 45, 120 or 365
   days (high, medium, low volatility), replies say the snapshot may have
   changed.
7. **Document generation** keeps to the Student Handbook
   (`collections: ['handbook']`).

## Alternatives considered

- **A second store and search path.** Rejected: it duplicates the FTS5
  schema, the triggers and the evidence gate, and would need a merge step
  for mixed questions anyway.
- **Rewriting the knowledge files into the handbook pack format.** Rejected:
  it loses the per-passage provenance the pack rules require.
- **Indexing `events.json` as reminders or calendar items.** Rejected: there
  is no institutional calendar feature, and creating schedule items
  automatically from a conflicting date (C1) is explicitly forbidden.

## Consequences

- Campus questions are answered offline with sources, pages and dates.
- Existing handbook answers, notes and the off-topic fail-closed list are
  unchanged (`__tests__/ai/appStatusAudit20261116.test.ts`).
- **Call Lafina does not use this knowledge.** Calls use the backend's
  server-side index. Adding the pack there is a `LAFINA-backend` change,
  which this task does not authorize.
- Refreshing the knowledge means a new dated pack folder, a manifest and a
  rebuild. The app does not fetch updates.
- Some passages are written as guidance for an assistant ("LAFINA should
  say…"). Offline replies show that wording as written.

## Verification

- `__tests__/ai/ustpCdoKnowledge.test.ts` (real corpus).
- `__tests__/ui/sourceNoteText.test.tsx`.
- `python -I scripts/build_campus_knowledge_pack.py --check`.
- The existing handbook suites.
