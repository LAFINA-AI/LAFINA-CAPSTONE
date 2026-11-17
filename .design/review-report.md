# LAFINA onboarding review

Date: 2026-11-16 (Asia/Manila)

Current owner decisions: [onboarding redesign plan](../docs/plans/onboarding-redesign-plan.md). Its COR-first setup, read-only COR campus/program, and scheduling-only non-USTP branch supersede the earlier school/manual-entry suggestions in this initial review. No app implementation is authorized.

## Scope and method

Research and advice only. No application code changed. Inspected WelcomeScreen, OnboardingScreen, onboarding components, App routing/permission effects, ProductTour, tour persistence, theme tokens, dependencies, and the OCR service. This is source inspection plus external research, not a rendered device audit. Existing unrelated working-tree changes were left untouched.

## Executive read

Use the owner's proposed sequence: explain LAFINA, personalize it, then guide the user in the real interface. Reduce the amount asked before first use; adding attractive introduction pages on top of the existing six setup pages and seven tour steps would increase the burden.

## Preserve

- Guest-first use and optional accounts.
- Existing semantic colors, typography, light/dark themes, and Modern palette support.
- The navigation footer already lives outside the setup ScrollView.
- Optional USTP COR / other-school schedule import and manual fallback.
- ProductTour's measured spotlight, reduced-motion support, Skip/Back, and replay path.
- Existing preferred-name and tone persistence rules; never silently enable memory to simplify setup.

## Source-level scorecard

These judgments cover flow/content in the inspected source, not verified visual quality. Scale: 0 broken, 1 weak, 2 mixed, 3 strong, 4 excellent.

| Dimension | Assessment | Evidence |
|---|---|---|
| First-use explanation | 2 / mixed | Welcome offers a short tagline and description, then choices; no dedicated product demonstration. |
| Information hierarchy | 1 / weak | Step 1 combines school, importing, results, wake time, and sleep time; preferred name is step 5. |
| Flow and feedback | 2 / mixed | Back, completion error, import status, and tour dismissal exist; no clear per-step setup skip in navigation. |
| Theme consistency | 3 / strong at source level | Existing theme hooks and Modern tokens are reused. Actual rendered consistency remains unverified. |
| Viewport resilience | Unscored | Dynamic lists and wrapping controls suggest risk; exact device overflow was not measured. |
| Accessibility / motion / performance | Unscored | Some semantics and reduced-motion support exist; no device, TalkBack, contrast, or performance tests performed. |

## Findings

| ID | Severity | Source evidence | Current behavior and impact | Recommended correction |
|---|---|---|---|---|
| ONB-01 | Medium | src/ui/components/onboarding/OnboardingStep.tsx:179 | Initial step combines several unrelated decisions; attaching a COR adds every parsed course inline. This increases first-step effort and creates content of unbounded height. | Separate school/import from routine; move extraction review into paginated, editable review screens. |
| ONB-02 | Medium | src/ui/screens/OnboardingScreen.tsx:468 | Outer padding is 24 and inner card padding is 24. A 360-unit-wide viewport has about 264 units for content before further nested padding. This narrows labels and increases wrapping. | Use one screen gutter and avoid a padded outer card surrounding the entire form. |
| ONB-03 | Medium | src/ui/components/onboarding/OnboardingStep.tsx:740 | The friendly preferred-name question appears after academic and behavioral questions. | Start setup with identity, then school, routine, reminders, and optional schedule import. |
| ONB-04 | Medium | src/ui/components/onboarding/OnboardingStep.tsx:764 | Completion says “Ready to Sync” and “Configuration Baseline,” even though guest use is supported. | Use “You're ready, [name]” and accurately summarize local setup; discuss sync only for relevant signed-in users. |
| ONB-05 | Medium | src/ui/tour/tourSteps.ts:23 | Seven tour steps include another welcome, each tab, and a closing step after setup. | Offer a short final guide on real screens; prioritize Home, Schedule, and AI, with contextual tips later. |
| ONB-06 | Medium | App.tsx:330 | The user-ID effect requests notification permission and can queue reminder education before setup finishes. This is earlier than feature intent. | Ask when enabling reminders or creating the first reminder, explain benefit, and allow Later. Sequence permission education separately from the tour. |

Viewport clipping, keyboard obstruction, color contrast failures, and jank are verification gaps, not confirmed runtime findings.

## Recommended journey

### 1. Meet LAFINA — three brief, skippable pages

Replace/extend the current welcome experience instead of introducing a duplicate welcome layer after it. Keep a visible returning-user sign-in path.

| Page | Suggested heading | Visual story |
|---|---|---|
| 1 | Your academic day, organized. | LAFINA mark with a small realistic day preview: class, deadline, reminder. Explain “Your personal academic AI secretary.” |
| 2 | Say it. Plan it. | A sample request, “Remind me about my assignment tomorrow at 6 PM,” becomes a preview reminder. Clearly label this as a demonstration; do not create records or activate the mic. |
| 3 | Start on this phone. | Show a saved local item. Explain optional account sync and that online AI features need internet. Avoid promising every AI feature works offline without setup. |

Use a short heading, one concise supporting sentence, one main illustration, progress dots, and a stable action area. Pages advance only through user action. The final page offers Continue without an account, with secondary account/sign-in paths.

### 2. Make it yours — five focused setup pages

1. **About you:** preferred name and optional Casual / Professional tone. Prefill known details. If memory is disabled, explain the existing restriction and offer a way to proceed without personal memory; do not silently enable it.
2. **Your school:** USTP / Another school / Set up later. No student number required merely to enter the app. Avoid requesting fields that the product does not use.
3. **Your routine:** two compact wake/sleep time rows using the existing native picker, rather than twelve time chips. Offer “Use defaults”; defer peak study hours, busiest day, class count, and gap estimates to later personalization.
4. **Your reminders:** one lead-time choice with a live sample. Defer the snooze-behavior questionnaire. Explain simulated reminder calls when the user enables that feature.
5. **Your schedule (optional):** the appropriate COR or schedule-image import, with Add later. Show compact scanning/progress/error states. After a scan, show the class count and explicit Review action. Review imported details before saving; paginate records so they remain reachable without a growing onboarding page.

In-page optionality should be explicit. Preserve answers on Back and support draft/resume if the app closes; the current screen keeps answers in component state and saves at the end. Do not mark setup complete until saving succeeds. Track introduction-seen, setup completion, and guide completion independently.

Use stage-aware progress, for example “Make it yours · 2 of 5.” Optional import review is a labeled branch with its own progress. After saving, show a compact ready state with Take a quick tour / Explore on my own; the ready state need not be another full-page hurdle.

### 3. Final walkthrough — three useful stops

Use existing ProductTour as the base. Keep Home, Schedule, and AI, each with one short explanation about the highlighted area. Remove duplicated welcome and closing slides. Offer an optional sample action at the end, with clear confirmation before saving anything. Keep Skip and replay from Profile. Introduce remaining features through contextual guidance when opened.

## Visual and motion direction

Aim for a calm academic assistant: generous readable headings, concise friendly language, realistic calendar/reminder previews, and restrained brand color. Retain LAFINA's existing tokens. Reserve the expressive AuthBackdrop/Grainient treatment for the introduction; keep forms on quiet theme surfaces.

Use purposeful motion: a brief entrance for the first illustration, a sample message transforming into a reminder, small selected-state feedback, and directional page transitions. Proposed timings around 180–280 ms are design starting points to test, not research-established performance targets. Avoid auto-advancing pages, compulsory animation waits, decorative continuous movement behind inputs, or audio/microphone activity during demonstrations. Reduced motion should preserve the same information in a static state or gentle fade.

Existing React Native Animated and react-native-svg can express the initial direction; there is no demonstrated need for a new animation dependency.

## No-scroll layout contract

- Design each ordinary onboarding page to fit the available viewport at default text size, initially checking 360 x 640 and 360 x 800 logical units, plus the owner's actual device.
- Reserve safe-area/system-bar space, stage header, and a stable bottom action area first; lay out content in the remaining space.
- Use approximately 16–24 units of outer gutter without another full-card gutter. Keep illustrations responsive to available height and remove decorative height first on compact screens.
- Limit each page to one topic and one or two related inputs. Move variable-length lists into bounded, paginated review flows, not tiny nested scroll boxes.
- When the keyboard opens, collapse the illustration and lift the action area. Preserve name/error readability and a way to dismiss the keyboard.
- Retain text scaling. If large fonts, landscape, or a large keyboard leave insufficient room, use additional focused pages or an accessibility scrolling fallback instead of clipping content or shrinking text. Android supports font scaling to 200%.
- Ensure at least 48 x 48 dp usable touch areas for interactive elements, including Skip and tour controls; verify contrast in both themes.

## Research and interpretation

1. [NN/g: Mobile-App Onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/) describes feature promotion, customization, and instructions, matching the owner's proposed stages. It also cautions against unnecessary onboarding. The proposed page counts are LAFINA-specific recommendations, not a universal research rule.
2. [NN/g: New Users Need Support with Generative-AI Tools](https://www.nngroup.com/articles/new-ai-users-onboarding/) supports clear purpose, brief explanations, and contextual help. Its small qualitative study is useful direction, not proof of outcomes for LAFINA students.
3. [NN/g: Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/) supports dismissible, recallable, contextual help and reducing memorization demands. This informs shortening the final tour.
4. [Android: Request runtime permissions](https://developer.android.com/training/permissions/requesting) recommends requests in context, cancellation, and graceful degradation after denial.
5. [Android: Font scaling](https://developer.android.com/about/versions/14/features#non-linear-font-scaling) supports testing at the maximum font size rather than preventing enlargement.
6. [Android: Accessible controls](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) recommends touch targets of at least 48 x 48 dp.

## Priorities and verification

**Now, before implementation:** approve screen content, required versus deferred questions, and the viewport/accessibility contract. Review static visual proposals for an intro page, an identity page with keyboard, the school/import branch, and the final tour.

**Next, after implementation is separately authorized:** exercise fresh guest, fresh cloud account, returning account, skipped import/tour, COR and schedule import success/failure/cancel, memory disabled, denied permissions, offline launch, Back, interrupted setup, and save failure. Check small screens, larger fonts, long names/file names, light/dark themes, reduced motion, and TalkBack. Verify that preview demos create no data and never activate the microphone.

**Later:** observe a small formative test with students. Ask what LAFINA does, have them complete setup and create a reminder, and record where they hesitate. Measure time to first useful action, per-step completion/skip, errors, and unaided task success; these are proposed measures, not collected results.

Not run: app launch, screenshots, device checks, TalkBack, animation benchmarks, Jest, preflight, or Gradle. No implementation was authorized or performed. This is not completion of an implementation phase.

**Verdict: Needs changes for the inspected flow and content. Rendered layout and accessibility approval remain pending device verification.**
