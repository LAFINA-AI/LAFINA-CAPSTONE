# Onboarding redesign plan

Updated: 2026-11-16 (Asia/Manila).

Status: design proposal and interactive mockup only. App implementation is not authorized by this plan. The existing phase approval rules remain in force.

## Owner decisions

- Keep the accepted introduction, with the USTP handbook page.
- Prioritize USTP COR setup. Do not offer campus or program selectors or manual profile entry.
- Campus and program come from the COR, and are displayed for review. If either is missing or wrong, ask the user to replace the document; do not provide an independent override.
- Offer an explicit **“I’m not a USTP student”** path. This uses LAFINA for scheduling without USTP school features.
- USTP offline handbook RAG is unavailable for non-USTP users. This restriction covers all USTP handbook entry points and school-specific online answers as well; changing AI engines must not bypass the selected experience.
- Keep user correction and confirmation of COR name, year/section, subjects, units, days, times, locations, faculty, and term dates. Read-only campus/program does not remove the remaining COR verification flow.
- Keep every ordinary mockup page within a small-phone viewport without scrolling at default text size. Retain an accessible large-text/keyboard strategy in the eventual app.

## Journey and branch rules

Introduction → Name/tone → Student setup → Main goal → Routine → Study/focus preferences → Answer style → Reminder timing → Memory review → Ready → Final walkthrough.

The student-setup page gives COR import the primary action. It has two distinct alternatives:

1. **USTP student:** add COR → verify detected student/campus/program → verify term and meetings → resolve ambiguities/overlaps → explicitly confirm import. USTP handbook and school features become available only after this reviewed COR setup.
2. **Not a USTP student:** choose the explicit non-USTP action → see a scheduling-mode confirmation → continue personalization with no campus/program/COR fields. Calendar, tasks, reminders, and the scheduling assistant remain available; USTP academic profile and handbook features do not.

An **“I’ll add my COR later”** action records USTP setup as pending. It allows scheduling without pretending that the student is non-USTP. USTP features remain unavailable until COR review is completed. Failed scans, canceled picking, missing COR access, and offline failures use this same pending path; they do not change the student's declared affiliation.

Use separate state for declared affiliation, COR draft/review/completion, and current feature availability. A name, account tier, campus-like free text, selected AI engine, or a merely parsed file must not grant USTP feature access. This is product eligibility based on user selection and reviewed COR, not official authentication by the university.

## Feature availability

| Experience | Calendar, tasks, reminders | Scheduling assistant | USTP academic profile | USTP handbook RAG |
|---|---|---|---|---|
| Student setup not chosen | Scheduling can remain usable | Scheduling only | Unavailable | Unavailable |
| USTP, COR pending | Available | Scheduling only | Draft only; not active | Unavailable |
| USTP, COR confirmed | Available | Available | Confirmed COR facts | Available when local index is ready |
| Not a USTP student | Available | Scheduling only | Unavailable | Unavailable |

For the non-USTP path, remove university handbook goals, prompts, source links, academic profile memory, class-feed/USTP panels, and university-specific tour content. Use ordinary events/tasks in the walkthrough. Explain unavailable USTP features if an old link is opened; provide a path back to scheduling or an explicit change to USTP setup.

The introduction may describe the USTP capability as conditional on USTP COR setup. After selecting non-USTP mode, revisiting the introduction must not offer an active USTP handbook demonstration or source-answer route.

## COR verification

Retain the complete review branch: draft extraction summary, student confirmation, read-only campus and program, editable year/section, term dates, subject list, subject edits, per-meeting day/time review, room/faculty/section edits, TBA handling, missing-subject/meeting entry, overlap decisions, final confirmation, error/retry, saved draft, and undo.

- Recognition is not verification. Require explicit review actions before activation.
- Do not guess days, times, AM/PM, or the semester end date.
- Edits invalidate the relevant review status. Campus/program correction requires a replacement COR rather than a picker or free-text override.
- Source comparison does not mark data reviewed. Label the state **“Reviewed by you”**, never “Verified by USTP.”
- Excluded or unresolved draft records must not enter the active calendar, sync outbox, reminders, or AI memory.
- Match imported records by appropriate subject/session/term identity, not only weekday and start time. Preview conflicts and duplicates.
- Saving must be consistent across profile, schedule, required outbox mutations, review state, and completion. Preserve the draft on failure; retry must not duplicate records.

## Memory, affiliation changes, and enforcement

Use campus/program only from a confirmed COR. Do not prefill an unverified academic profile with sample defaults or save a guessed campus/program as user memory. Non-USTP and COR-pending memory review contains only selected personal/scheduling preferences; it has no academic-profile category or USTP policy goal.

Changing to non-USTP mode disables school features immediately, clears university-specific suggested goals, and excludes academic facts from future prompt assembly. Preserve ordinary scheduling data and user-created items; do not silently delete existing calendar entries or erase a draft. Returning to USTP requires explicit selection and a valid reviewed COR before school features reappear.

Implementation must apply the same eligibility decision to UI navigation, chat/voice intent routing, local RAG search/answer calls, source viewers, restored screens, deep links, prompt/context construction, and online USTP requests. Hiding a tile alone is insufficient. Recheck eligibility after asynchronous work so an answer started before a mode change cannot leak into the new mode. Generic scheduling and existing optional accounts/sync remain in scope; this plan does not authorize unrelated feature removal or backend changes.

## Validation before implementation review

Verify both experiences and the pending state at 360 × 640 and 320 × 640 in light/dark themes, with keyboard, errors, long text, and reduced motion. Check that:

- Campus/program cannot be independently typed or selected before or during COR setup.
- A parsed, incomplete, canceled, or failed COR does not enable USTP features.
- Confirmed COR data is shown as the academic source; missing/wrong campus/program leads to replacement.
- Non-USTP users receive scheduling-only goals, memory, walkthroughs, and assistant entry points.
- Non-USTP or pending users cannot reach USTP RAG through an old source button, tour, restored navigation, direct action, AI-engine switch, or delayed response.
- Changing modes and navigating Back does not restore previous eligibility.
- Editing a meeting requires renewed review; invalid times and unresolved overlaps block import.
- Retry and undo preserve unrelated scheduling data.

Mockup verification is not native Android verification. App tests, preflight, Gradle, and device validation will be required in the separately approved implementation phase. No successful on-device alarm, voice, OCR, or RAG behavior is claimed by this proposal.

## Mockup verification completed

The v3 standalone prototype passed 552 layout cases at 360 × 640 and 320 × 640 in light/dark themes, including keyboard, error, long-text, pending-COR, confirmed-COR, and non-USTP states. Its 61 interaction checks passed, including COR-only campus/program, import review guards, unavailable handbook actions, absence of non-USTP academic memory, and affiliation changes followed by Back navigation.

Evidence: `lafina-v3-layout-checks.json` and `lafina-v3-contact-sheet.png` in this chat's visualization directory. Browser geometry and mock interaction results apply only to the prototype at default text size. Native Android rendering, accessibility/large-text behavior, actual OCR, actual RAG call suppression, asynchronous requests, backend enforcement, and device flows are NOT RUN. No application code was changed for this update.
