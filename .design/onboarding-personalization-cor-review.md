# Onboarding personalization and COR verification

Date: 2026-11-16, Asia/Manila. Analysis and mockup planning only; no app implementation. The current owner decisions are recorded in [the onboarding redesign plan](../docs/plans/onboarding-redesign-plan.md): COR-first USTP setup, no independent campus/program entry, and a scheduling-only non-USTP path with USTP RAG unavailable.

## Recommendation

Keep the visual direction and purposeful personalization. Give COR verification its own branch and primary action for USTP students. Users who defer COR setup can schedule while USTP features remain unavailable. Users who explicitly select non-USTP mode use scheduling without school features. Verification is required before extracted records enter the active schedule or personal memory.

## Information to collect and why

| Information | Benefit | Timing | Current support |
|---|---|---|---|
| Preferred name | Natural address without using a legal name unnecessarily | Initial setup, optional | Existing identity/memory support |
| Casual or professional tone | Communication preference | Initial setup, optional | Existing identity/memory support |
| Campus, program/major, year level, section, term | Academic context and interpreting enrolled subjects | COR only; campus/program shown read-only, with replacement if incorrect | Academic profile already stores these; confirm before use; unavailable in non-USTP mode |
| Main goal: deadlines, schedule, handbook guidance | Relevant starter prompts and first-use route | One optional focused page | New explicit preference and consumer would be needed |
| Wake/sleep routine | Context for planning | Initial setup with editable defaults | Existing preferences; do not claim every scheduler currently enforces them |
| Peak study periods, including Flexible | More useful scheduling preference | Optional initial page or after first use | Stored preferences and ML feature extraction already use peak periods |
| Reminder lead time | Expected reminder timing | Initial setup with editable default | Existing reminder preference consumer |
| Response length / preferred language | More comfortable explanations | Optional later personalization | New preference/consumer and language-quality checks required; offer only supported languages |
| Recurring unavailable periods / travel buffer | Prevent impractical scheduling suggestions | Later, after schedule import or when planning | New controls and scheduling enforcement needed; represent hard unavailability as structured constraints |

Suggested base flow: About you → Your USTP profile/COR choice → Main goal (optional) → Routine → Reminders → What LAFINA remembers → Ready. A peak-period question can be a separate optional page or later prompt; do not squeeze it into the routine page. COR review is its own clearly labeled branch, with review progress rather than inflating the base step counter. Fields supplied by the COR are confirmed instead of asked again.

Lead with COR-first student setup and an explicit “I’m not a USTP student” alternative. Do not ask users to select or enter campus/program independently. Preserve scheduling access when COR setup is pending; do not label those students non-USTP. Non-USTP users do not receive USTP handbook RAG or school features. The approved plan above supersedes earlier manual academic-profile entry proposals.

Do not collect age, gender, nationality, home address, finances, student number, grades, or a personality/learning-style label simply to personalize an academic secretary. If a student identifier is retained for a specific profile purpose, keep that decision separate from the facts used in AI responses.

Skipped values are unknown; defaults are defaults; neither is a user-confirmed personal fact. Derive class count, busy days, and gaps from the reviewed timetable instead of asking for estimates. Gaps do not imply availability: travel or other obligations can occupy them.

## Current-source findings that affect the design

| ID | Evidence | Finding | Required design consequence |
|---|---|---|---|
| COR-01 | src/ui/components/onboarding/OnboardingStep.tsx:276; src/ui/screens/OnboardingScreen.tsx:302 | Extracted fields are displayed but not individually editable/confirmable before final setup writes them. | Separate detection from review, correction, confirmation, and commit. |
| COR-02 | src/ai/vision/ustpCorParser.ts:1193 | Recurrence ends 18 weeks after the supplied reference date, rather than a confirmed term-end date. | Ask for/check actual start/end dates; distinguish assumed values from document-derived ones. |
| COR-03 | src/storage/academicProfileStore.ts:401 | Existing Class blocks are matched using start time and weekday without subject/term identity in that match. | Preview additions, duplicates, and conflicts; never silently replace a different subject at the same time. |
| COR-04 | src/ui/screens/OnboardingScreen.tsx:116 | The import acceptance gate checks for recognized courses/name/number, not the returned COR validity flags; validity itself is a coarse document-level signal. | Validate document identity separately from field correctness; a recognized COR is not a verified timetable. |
| COR-05 | src/ui/screens/OnboardingScreen.tsx:289 | Preferences, academic profile, recurring schedule, memory, and completion are invoked as separate saves. | Design one final save with all-or-nothing outcome and safe retry; implementation must share an appropriate transaction with required outbox writes. |
| MEM-01 | src/storage/onboardingMemory.ts:86 | COR memory construction includes student number, gender, and age as well as academic facts. | Preview and selectively retain useful academic memory; exclude unnecessary identifiers and demographics by default. |
| MEM-02 | src/storage/chatMemoryStore.ts:6; src/cloud/chatMemoryService.ts:141 | Memory is stored locally but can be included with online requests. | Avoid a blanket claim that personal information never leaves the phone. Explain local storage, account sync, and online request use separately. |

These findings are from source inspection, not device reproduction. No existing records were read from a user's database or changed.

## COR review journey

1. **Pick a file.** Explain supported PDF/image input, on-device extraction in the existing service, and that nothing is added to Calendar until confirmation. Allow cancel/retry or continuing without import.
2. **Confirm the document and student.** Show the detected name, campus, program/year, and term in small logical groups. Campus and program are read-only COR facts; missing or wrong values require replacing the document. Other permitted corrections remain editable. Offer View original, Replace file, and This is not my COR. Preserve a manually chosen preferred name; a scanned legal name should not silently replace it.
3. **Report completeness honestly.** Show subject count, distinct meeting/session count, and items needing review. A single subject may have multiple lecture/lab meetings. Allow adding a missing subject; do not present partial OCR as a complete schedule. Compare printed units/counts where available, but do not treat a matching total as proof of accuracy.
4. **Review each course and meeting.** Use a course header and per-meeting pager. One screen covers subject identity, another days/times, another location/section/faculty if content needs it. Show the corresponding source excerpt where available or a quick original-document viewer. Each meeting needs an explicit review decision. Editing a reviewed item returns it to Needs review.
5. **Handle unresolved items.** Require valid days, start/end times, and explicit AM/PM before generating a timed class. Do not guess unknown days/times. TBA/flexible classes can be kept as subjects without timed blocks, excluded, or corrected. Allow additional sessions and missing subjects. Flag conflicts for a decision; genuine overlaps may be retained deliberately.
6. **Confirm the term and recurrence.** Show recurring days and confirmed start/end dates in plain language. Preview at least the next dated occurrence. Do not generate an official term calendar from a generic 18-week assumption or imply COR room times verify school changes made after issuance.
7. **Final review and save.** Show reviewed subjects/meetings, unresolved/excluded items, proposed additions/updates/duplicates, and an explicit “Confirm and add schedule” action. Offer Save draft if unfinished. Pending/excluded data must not leak into Calendar, reminders, AI memory, or synchronized active entities.
8. **Recover and revise.** Keep the draft after a failed save; retry without duplicates. After success, allow correction and an undo/import-management path. Preserve unrelated existing classes and user edits.

Statuses should mean Detected → Needs review → Reviewed by you → Added. “Reviewed by you” must never imply authentication or verification by USTP. Do not invent an OCR confidence percentage; currently exposed extraction data does not establish calibrated field confidence. Prefer concrete notices such as “AM/PM missing.”

## Personal knowledge and memory

Separate structured profile facts, schedule facts, editable personal preferences, and the optional subset shared as AI memory. Structured reviewed facts are authoritative; a chat inference must not silently overwrite them. Keep origin, review status, time updated, and relevant term so expired schedules do not become timeless facts.

Offer a concise “What LAFINA will remember” page: preferred name/tone, academic program/year, and chosen study preferences. Provide edit/remove and an explicit memory control. The stored class schedule must continue to work with conversational memory off. Online mode must not send a complete COR or unrelated student identifiers just to answer a handbook question. Existing memory behavior and new controls would need implementation review; these are recommendations, not shipped guarantees.

New questions earn their place only if a real consumer is implemented. Storing a main goal or a travel buffer alone will not make scheduling or responses respect it. Do not describe personalization as training a new model on the student's COR.

## USTP introduction addition

Preserve the three accepted introduction concepts and insert a short handbook page before the local-storage page:

- Heading: **Ask anything about USTP.**
- Supporting copy: **Explore the USTP Student Handbook, even offline—with sources you can check.**
- Preview prompt: **How does the grading system work?**
- Preview response treatment: an actual supported handbook excerpt or accurately grounded answer with a tappable chapter/section/page citation, plus a clearly labeled Offline indicator. Exact answer and citation must come from retrieval, never invented mock text.

This keeps the owner's headline while explaining the source coverage. The bundled pack identifies itself as the 2023 Edition, with 367 chunks; show the actual edition in source details. Do not imply access to live announcements, personal grades, registration status, or the official university portal. Unknown/unsupported questions should receive an honest no-evidence response. Show offline availability based on the actual local index readiness; handbook excerpt retrieval should not be falsely tied to downloading a separate generative model.

Personal context can tailor how a handbook answer is explained, but must not change the cited rule or replace handbook evidence. Campus/program-specific applicability should only be claimed when the source establishes it.

## Small-screen and next-proposal requirements

Keep the accepted 360 x 640 composition. Use one question or a small related group per page. For COR review, paginate by meeting and by field group; use a source viewer instead of nesting a long PDF inside the form. Keep Back, review count, and primary action visible. Preserve entered data and progress through Back, interruptions, and file-picker cancellation. Validate keyboard, long names/course titles, error text, light/dark themes, and large-text fallbacks in the next visual revision. Prior mockup checks do not validate new, unrendered designs.

The next visual proposal should cover the USTP handbook intro page, optional main-goal page, memory review, COR document summary, editable meeting verification, ambiguous-time error, term-date confirmation, conflict review, and final import confirmation.

## Research

- [NN/g: EAS framework](https://www.nngroup.com/articles/eas-framework-simplify-forms/) supports removing nonessential questions, automating known information, and simplifying the remaining input. The proposed data fields are recommendations for LAFINA, not a universal validated questionnaire.
- [Google PAIR patterns](https://pair.withgoogle.com/guidebook-v2/patterns) supports setting accurate AI expectations and giving users feedback/correction controls.
- [W3C multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/) supports logical stages, explicit optionality, and progress. Apply these interaction principles to native Android; web-specific markup is not an implementation prescription.
- [W3C error prevention](https://www.w3.org/WAI/WCAG21/Understanding/error-prevention-all.html) explains checking, confirmation, correction, and reversibility. Referenced as design guidance, not a claim of conformance.

## Verification status and verdict

Completed: targeted source review and primary-source research. Not run: device reproduction, code changes, new visual rendering, COR extraction benchmarks, native tests, or new small-screen checks.

Verdict: the accepted direction remains appropriate. COR import needs stronger verification before implementation; proposed new personalization controls need explicit purpose, real consumers, and fresh visual validation. This is analysis, not completion of an implementation phase.
