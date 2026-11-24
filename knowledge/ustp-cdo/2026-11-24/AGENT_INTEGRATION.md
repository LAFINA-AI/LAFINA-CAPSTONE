# LAFINA integration instructions (agent-ready)

## Goal

Extend the **existing USTP 2023 handbook** knowledge base with current, source-backed CDO knowledge, while preserving the existing indexing and retrieval design. This is **data integration**, not a request to rebuild LAFINA, replace its prompts, invent integrations or change user accounts.

## Autonomy-safe implementation steps

1. Examine LAFINA's existing RAG ingestion entrypoint, supported file format, metadata schema, chunker, vector store, embeddings and citation UI. Do not guess repository paths.
2. Copy/ingest only `knowledge/*.md`. Parse YAML frontmatter; preserve `title`, `as_of`, `source_ids`, `campus`, `category`, `volatility` and every `Source references` paragraph with its URL.
3. Make ingestion **idempotent**: a stable document key from relative path + content SHA-256, ensuring re-import does not duplicate chunks. If your current pipeline has another stable ID strategy, use it.
4. **Prioritize matching academic year** on date questions. For AY 2026-27 use the CHED-noted calendar, not legacy AY 2025-26 embedded on other university pages. For conduct, grades, policies and disciplinary rules prefer existing 2023 handbook, subject to any verifiably newer official policies.
5. Chunk Markdown by H2/H3 headings and optionally subdivide long event tables, retaining source citations and **year/scope metadata** with every chunk. Avoid splitting a date from its event label, and never mix graduate vs undergraduate date rows in a chunk.
6. Use retrieval filters such as `campus=USTP Cagayan de Oro`, relevant `academic_year`, `category`, and `audience` when available. Do not filter the `source_conflicts` guardrail away from calendar-date responses.
7. Route **personal** questions about individual class, timetable, account balance, grades, clearances, scholarship approval and exam venue to an authorized private integration or state they cannot be verified from public sources.
8. If supporting scheduling tools, treat `metadata/events.json` as external **proposed reminders**. Only create a calendar entry after an explicit user action; never schedule when `status=conflicted` or `needs_confirmation` without resolving ambiguity. `timezone=Asia/Manila`; events have **dates but no start/end times**.
9. Run automated smoke tests below. Do not claim integration succeeded unless ingestion and retrieval results were actually checked.
10. Surface document title, URL, PDF page (for CAL), academic year, and as-of date for factual replies. Keep the answer short by default, expandable with citation.

## Recommended retrieval priority

1. User's authorized private student context for own schedule/records, if actually connected.
2. New verified, date-specific USTP notices or official revisions (when actually retrieved and scoped correctly).
3. This calendar PDF for AY 2026-27.
4. USTP's official pages for programs, services, offices and links.
5. Existing USTP Student Handbook 2023 for regulations and standing policies.
6. Clearly label archived historic organizational pages.

## QA smoke tests (expected outcomes)

| Query | Required behavior |
|---|---|
| What are AY 2026-27 undergraduate term dates? | Aug 10-Dec 19 2026; Jan 5-May 20 2027; June 9-July 22 2027 summary; mention conflict only when midyear-specific |
| When are 1st sem non-graduating final exams? | Dec 9-19 2026; cite calendar PDF p. 3 |
| When are 2nd sem midterms? | March 15-20 2027; undergraduate only |
| When does midyear 2027 start? | Present June 9 summary vs June 5 detail and ask to verify, no single confident claim |
| What is my class tomorrow? | Public KB cannot know personal schedule; no fabricated classes |
| How to enroll in PRISMS? | Link official site and describe verified pre-enrollment steps; say validation may be needed |
| Where is e-Library? | LRC 2nd floor left wing; cite library page |
| What does SITE stand for? | Society of Information Technology Enthusiasts; label organization listing as older directory |
| What is my scholarship allowance? | No private/current award amounts available; refer to ASO |
| Does USTP CDO offer BSIT? | Listed yes; current admissions availability not established |
| How do I change my portal password? | Official portal recovery; do not request password or OTP |
| Is the semester cancelled because of weather? | No live verified announcement from snapshot; cannot confirm cancellation |

## Suggested copy-paste task for a code agent

```text
Integrate this extracted USTP CDO public knowledge pack into LAFINA's existing RAG system.
First inspect the repository instructions (e.g. AGENTS.md), retrieval pipeline, embeddings, document metadata, citation UI, and existing USTP 2023 handbook; do not assume any file path or duplicate existing data.
Only index knowledge/*.md; ignore reference PDFs and metadata/*.json for vector text indexing.
Preserve each Markdown document's source, date, PDF-page context, category and audience metadata. Add an idempotent import. Keep the existing handbook unchanged.
Use metadata/events.json only if the project already supports structured school calendar events; do not automatically create student reminders.
Treat 'conflicted' and 'needs_confirmation' calendar events as unresolved. Explicitly mention June 5 versus June 9, 2027 in any midyear-start answer. Do not use older AY 2025-2026 calendars for 2026-2027 dates.
Maintain correct campus scoping (USTP CDO vs Balubal/Alubijid) and differentiate UG vs GR dates. Do not invent class schedules, grades, portal access, scholarship outcomes, payment statuses, or official notices.
Run existing repository tests plus the QA prompts in AGENT_INTEGRATION.md. Report modified files, actual test results and any remaining manual validation needs.
```

## No dependencies to install

No external Python libraries are necessary to read the JSON or Markdown text. YAML frontmatter parsing is optional if the existing pipeline already handles plain Markdown; if so, retain the frontmatter as indexed text or transform it into collection metadata.

## Review and refresh

The data is a November 24, 2026 snapshot. Read `knowledge/14_source_conflicts_and_refresh_rules.md`. Admissions, holidays, active scholarships and office staff may change after that date. Do not automatically assert information is still live months later.
