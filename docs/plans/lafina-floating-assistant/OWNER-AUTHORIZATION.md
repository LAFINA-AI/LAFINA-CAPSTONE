# Owner authorization — Floating LAFINA

Recorded 2026-11-17. This file records the owner's answers to the questions in `07-RISKS-AND-DECISIONS.md` §3. It applies to the Floating LAFINA task only (phases `FLOAT-00` to `FLOAT-08`) and does not change any other rule in `AGENTS.md`.

## What the owner said

After reading the final research report, which listed the open owner questions with a recommendation for each, the owner wrote:

> what was the question again? just do what you recommend. add it in the docs

This is recorded as: **the owner accepts the recommended answer to every owner question.** Where a question asked for a fact rather than a choice, it is listed below as still open.

## Answers

| ID | Question | Answer | Source |
| --- | --- | --- | --- |
| Q-00 | Authorise the Floating LAFINA feature and add a task-scoped notice to `AGENTS.md`? | **Yes.** The feature is authorised as planned in this pack. A notice was added to `AGENTS.md` on 2026-11-17. `FLOAT-00` may start. Every later phase still needs the owner's explicit approval, as `AGENTS.md` requires. | Recommendation accepted |
| Q-01 | Approve `SYSTEM_ALERT_WINDOW` and `FOREGROUND_SERVICE_SPECIAL_USE`, and the matching addition to `allowedPermissions` in `scripts/check-architecture.mjs`? | **Yes**, these two permissions only. The allow-list comment should cite this file and the date 2026-11-17. | Recommendation accepted |
| Q-02 | Temporary or saved Quick Chat messages? | **Temporary** for the MVP (in memory, not written to chat history). | Recommendation accepted |
| Q-03 | Restore the orb after a phone restart? | **Not in the MVP.** May return as an optional setting, default off, in 1.1. | Recommendation accepted |
| Q-04 | Is a Google Play release planned? | **Not decided.** The MVP is built for the current sideloaded preview. Before any Play submission: foreground-service declaration with demo video, release signing, and a fresh policy check. | Recommendation was conditional; no decision recorded |
| Q-05 | Orb concept and brand mark? | **Concept A (brand disc).** No vector mark has been supplied, so the existing launcher icon is used as the glyph until one is. | Recommendation accepted |
| Q-06 | Names? | **"Floating LAFINA"** for the feature, **"Quick Chat"** for the panel. | Recommendation accepted |
| Q-07 | Which branch? | **A new branch** (suggested name `feature/lafina-floating-assistant`) created from `feature/uniguide-inspired-ui-overhaul` **after the owner's uncommitted work there has been committed.** Creating that one branch is authorised. Committing the owner's existing work is not delegated: if the tree still has uncommitted changes that are not part of this feature when `FLOAT-00` starts, stop and ask the owner. | Recommendation accepted |
| Q-08 | Which devices are available for validation? | **Open.** The owner has not listed devices. Ask at the start of `FLOAT-00`. Until then only emulator results can be expected, and OEM rows in the test matrix are reported as not tested. | Needs a fact from the owner |

## Limits of this authorization

1. It covers the architecture in `04-ARCHITECTURE-DESIGN.md` and the phases in `05-IMPLEMENTATION-ROADMAP.md`. A change of architecture, a third permission, or any new dependency needs a new owner decision.
2. It does not authorise commits of unrelated work, pushes, merges, pull requests, or any change to `LAFINA` or `LAFINA-backend`.
3. It does not relax the product limits: off by default, nothing saved without Confirm, no Accessibility Service, no screen capture, no reading of other apps, no wake word, no always-on microphone, not shown on the lock screen.
4. It does not replace device validation. Phases that cannot be checked on a device end with `STATUS: AWAITING DEVICE VALIDATION`.
5. Approval was given by accepting recommendations in bulk. If any answer above is not what the owner intended, the owner's later word overrides this file.
