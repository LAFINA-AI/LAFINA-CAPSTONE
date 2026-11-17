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

## Follow-up answers (2026-11-17, later the same day)

After committing the existing work (`d331b97` on `codex/latest-main-20261117`, merged via PR #14), the owner wrote:

> yes, start a new branch. use my infinix phone for testing. proceed and finish everything without human interaction as much as possible.

Recorded as:

| ID | Answer |
| --- | --- |
| Q-07 | Branch `feature/lafina-floating-assistant` created from `d331b97` (`codex/latest-main-20261117`), which contains `feature/uniguide-inspired-ui-overhaul`. |
| Q-08 | Test device: Infinix X6880 (XOS, Android 15 / API 35, build `X6880-15.1.2.200(OPPJ001PF001PJ)`). The local `Medium_Phone` emulator (Android 17 beta) may be used as a supplement. All other matrix rows are reported as not tested. |
| Phase approval | **Unattended run.** Like the AGY-PORT precedent in `AGENTS.md`, phases `FLOAT-00` to `FLOAT-07` proceed in order without a per-phase approval message. Each phase still gets its report, its gates and a truthful status. The run stops and asks only when a phase hits a failure condition from `05-IMPLEMENTATION-ROADMAP.md`, needs an architecture change, a new dependency or permission, or needs a physical action on the phone that cannot be done over `adb`. `FLOAT-08` (voice, release 1.1) is included in "finish everything" only after the MVP gate in `FLOAT-07` has passed. |

## Limits of this authorization

1. It covers the architecture in `04-ARCHITECTURE-DESIGN.md` and the phases in `05-IMPLEMENTATION-ROADMAP.md`. A change of architecture, a third permission, or any new dependency needs a new owner decision.
2. It does not authorise commits of unrelated work, pushes, merges, pull requests, or any change to `LAFINA` or `LAFINA-backend`.
3. It does not relax the product limits: off by default, nothing saved without Confirm, no Accessibility Service, no screen capture, no reading of other apps, no wake word, no always-on microphone, not shown on the lock screen.
4. It does not replace device validation. Phases that cannot be checked on a device end with `STATUS: AWAITING DEVICE VALIDATION`.
5. Approval was given by accepting recommendations in bulk. If any answer above is not what the owner intended, the owner's later word overrides this file.
