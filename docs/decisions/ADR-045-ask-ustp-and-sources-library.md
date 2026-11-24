# ADR-045 — "Ask USTP", "See passages" and the USTP sources library

**Status:** accepted (awaiting review)
**Date:** 2026-11-24
**Phase:** USTP-CDO-KNOWLEDGE follow-up
**Review owner:** human developer
**Approval:** owner, "proceed and just do what you think is best" (2026-11-24)

## Context / problem

After ADR-044 the USTP chat answers from two sources: the 2023 Student
Handbook and the USTP Cagayan de Oro knowledge snapshot. The chat was still
labelled "USTP Handbook", which hides the new campus answers (dates, offices,
portals). The owner also wants students to be able to check everything the
chat answers from, so they can trust it.

## Decision

1. **Name.** The chat mode is **Ask USTP** everywhere a student sees it:
   - the sidebar, the chat header and the input placeholder;
   - the empty state, the offline banner and the Preferences focus option;
   - onboarding, the product tour and the help list.

   "Student Handbook" stays as the name of that source in citations. The
   empty-state tag "Local FTS5 Ready" (jargon) is now "Works offline".
   Document generation keeps its "USTP Handbook" source, because it uses
   only the handbook.
2. **See passages.** Every local source records its passage id. A reply
   saves the ids its note cites (at most 12) in the message's local
   metadata. Chat sync builds its payload from named fields, so the ids
   never leave the phone and the synced format does not change. The note
   pill shows **See passages ›**, which opens those passages exactly as
   stored. If a passage is no longer in the installed pack version, the
   sheet says so.
3. **USTP sources library** (`UstpSourcesSheet`). It opens from the sidebar
   ("USTP sources") and from the Ask USTP empty state ("Browse every
   source"). It has:
   - both sources, with their real passage counts;
   - chapters (handbook) or documents (campus);
   - every passage, with its page, scope (UG/GR, academic year, semester),
     conflict notes, freshness warning and tappable official links;
   - a list of every official page behind the campus answers;
   - a plain substring search. It finds exactly what the student typed,
     with no ranking or synonyms, so nothing is hidden.

   The library is read-only and shown only when USTP school features are
   on.
4. **Honest wording.** The library says that Ask USTP answers only from
   these passages. That holds because Ask USTP refuses when no local passage
   matches (`localUstpUnsupported`), both offline and online. It also says
   that online answers are worded by the AI, and that calls use a separate
   online copy of the handbook. It does not claim the content is always
   right.

## Consequences

- A student can check any Ask USTP answer against its source text in one tap.
- Answers synced from another phone have no passage ids, so they show the
  note without "See passages". The library is still available.
- A pack update can remove old passage ids. Old answers then point to the
  library instead.
- `ToolSheet` gained an optional `onRequestClose`, so Android Back steps
  back one page inside the sheet.

## Verification

- `__tests__/ui/ustpSourcesLibrary.test.tsx` (16 tests).
- The updated label assertions in `localHandbookRag`,
  `chatUniGuideRedesign` and `productTourWalkthrough`.
