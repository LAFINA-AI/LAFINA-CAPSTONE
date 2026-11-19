# Onboarding introduction redesign — Completion Report

**Branch / commit SHA:** `feature/cor-accuracy-calendar-call-updates` @ `b1491d5` + uncommitted working tree  
**Date/time UTC:** 2026-11-19T09:22Z  
**Device(s) available:** Infinix X6880 attached over adb. **Not used.** The intro only shows when signed out, and getting there would mean clearing the app's data on the owner's phone.  
**Status:** `AWAITING DEVICE VALIDATION`  
**Approval provenance:** owner asked for a 1:1 rebuild of `docs/design/onboarding/LAFINA Introduction.html`. After the plan, the owner directed: keep the current fonts, use today's date instead of hard-coded sample dates, and make slide 1's notification light (not black or dark).

## 1. Scope completed

- **Welcome (screen 0) and four slides**, rebuilt from the prototype's spec.
  - The spec is gzip/base64 inside the bundled HTML; it was unpacked for reading only and is not shipped.
  - Hex colours, sizes, weights, letter-spacing (em→dp), radii, CSS box-shadows (RN `boxShadow`, minSdk 30), absolute positions and gaps are copied 1:1 (px→dp).
- **Navigation follows the prototype script:**
  - Get started → 1, Continue → next, Back → max(1, s−1), Skip → 4.
  - "I already have an account" and "Sign in" → login; "Create an account" → register.
  - "Continue without an account" → the existing guest start.
- **Android Back:**
  - The handbook source view closes first.
  - A slide goes to the previous slide, and slide 1 goes to the welcome.
  - On the welcome, Back is left to Android.
- **Animations:** every prototype class has a matching React Native keyframe definition (`MOTION` in `src/ui/screens/onboarding/intro/introMotion.tsx`), built on RN's own `Animated` (no new libraries).
  - Easing applies to each segment between keyframes, as CSS does.
  - A delay applies to the first run only.
  - During its delay, an entry animation (`fill-mode: both`) holds its first frame; a loop shows its resting style.
  - Each slide is keyed by its screen number, so entry animations replay every time it is shown.
  - Native driver for opacity and transforms; JS driver for SVG strokes, the highlight width and the dots.
  - `isInteraction: false` throughout, so looping decorations never hold up `InteractionManager`.
- **Reduce motion** (`AccessibilityInfo`): entry animations render their last frame and loops render their resting style, mirroring the prototype's `prefers-reduced-motion` rule. Dots change instantly.
- **Changes the owner requested:**
  - The app's existing fonts are kept. Weight 400 uses `Fonts.body`; 500–700 use `Fonts.heading` with that weight.
  - Slide 1 shows today's real date. Slide 4's sample deadline is two days from today.
  - Slide 1's notification is white with a light border and a brand-tinted shadow.
- **Flow mode** (the intro inside setup, already signed in):
  - Slides 1–4 only, with no Sign in.
  - Skip finishes the intro, and the last button reads "Continue".
  - The last slide's copy says data is saved on this phone first.
- **Kept from before:**
  - The real handbook quote and citation from the bundled pack, and the tappable source view.
  - The guest-start error message, shown above the dots.
- **Deviations:**
  - **Small screens:** illustrations shrink uniformly (minimum 0.5×) when the phone is narrower than 390 dp or too short. Text and buttons stay at spec size, and the middle area scrolls if it still doesn't fit.
  - **Dashed circles** are drawn with SVG (dash 4.5/3); the browser's dash pattern can't be reproduced exactly.
  - **The bubble's word-by-word text** is a wrapping row with a 4 dp gap standing in for spaces, so each word can fade on its own.
  - **Fixed light palette:** the intro uses the spec's light colours even when the app is in dark mode. The handbook source view still follows the app theme.
  - **No welcome-only scheduling variant:** the separate scheduling-only version of slide 3 was dropped. Slide 3 already says "Available to USTP students after COR setup."
  - **Returning users** now open on the welcome. Previously they opened on the last slide.

## 2. Change summary

| File/module | Change | Reason | Test evidence |
|---|---|---|---|
| `src/ui/screens/onboarding/intro/introTokens.ts` | New: colours, shadows, font helper, em→dp, live sample dates | Spec values in one place | `introOnboarding` "sample dates" |
| `src/ui/screens/onboarding/intro/introMotion.tsx` | New: keyframe engine, `Motion`, all prototype classes, reduce-motion context | Animations | `introOnboarding` engine tests |
| `src/ui/screens/onboarding/intro/introIcons.tsx` | New: prototype SVG paths, self-drawing check, moving dashed line, dashed circle | 1:1 icons | rendered in all intro tests |
| `src/ui/screens/onboarding/intro/introLayout.tsx` | New: canvas that shrinks to fit | Small screens | — |
| `src/ui/screens/onboarding/intro/IntroWelcome.tsx` | New: screen 0 | Design | `phase01…` and `introOnboarding` |
| `src/ui/screens/onboarding/intro/IntroSlides.tsx` | New: header, stage, copy, dots, footer | Design | same |
| `src/ui/screens/onboarding/intro/Slide{Day,Say,Handbook,Phone}.tsx` | New: the four illustrations | Design | same |
| `src/ui/screens/onboarding/IntroPager.tsx` | Rewritten as the screen 0–4 state machine; `schedulingOnly` and `initialPage` props removed | Design | same |
| `src/ui/screens/WelcomeScreen.tsx` | Always opens on the welcome | Design | `phase01…`, `storageRecovery` |
| `src/ui/screens/OnboardingScreen.tsx` | Drops the `schedulingOnly` prop (only that line) | API change | `phase01…` flow test |
| `__tests__/ui/introOnboarding.test.tsx` | New: navigation (both modes), dates, engine timing/loops/reduce motion | Coverage | — |
| `__tests__/ui/phase01AuthAndProfileScreens.test.tsx`, `__tests__/ui/storageRecovery.test.tsx` | Updated for the welcome step and 1–4 slide numbering | API change | — |

Other uncommitted edits in the working tree (scheduler, storage, profile, developer settings, the lead-time options in `OnboardingScreen`) were there before this task and were not touched.

## 3. Tests and real outcomes

| Check | Exact command or manual procedure | Result | Evidence |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS | console |
| Lint | `npx eslint src __tests__ App.tsx index.js --max-warnings 0` | PASS | console |
| Jest (intro suites) | `npx jest __tests__/ui/introOnboarding.test.tsx __tests__/ui/phase01AuthAndProfileScreens.test.tsx __tests__/ui/storageRecovery.test.tsx` | PASS, 37/37 | console |
| Full preflight | `npm run preflight` | PASS: 168/168 suites, 2280 passed, 1 skipped; architecture check: 0 import cycles, 0 forbidden dependencies | console. An earlier run hit one `waitFor` timeout in `phase10HandbookRAG` (chat online-mode toggle, not intro code). That suite passed on its own and in the final full run. |
| JS bundle | `npx react-native bundle --platform android --dev false --entry-file index.js …` | PASS | bundle in scratchpad (not committed) |
| Android Gradle build | `gradlew assembleDebug` | NOT RUN. JS-only change; no native or manifest edits | — |
| Device visual check against the PNGs | see §6 | HUMAN REQUIRED | — |

## 4. Performance and device matrix

N/A (no benchmarks for UI animation). About 40 animated values run at once on the busiest slide. Loops run on the native driver except the dashed line on slide 4, and are stopped when their slide unmounts. Smoothness on a low-end phone is HUMAN REQUIRED.

## 5. Reliability, privacy, permissions, licenses

- **Illustrations only:** no records are created, the microphone is never used, and no permission is requested. The test "the demos created nothing" still passes.
- **Licences and fonts:** nothing new to license; no fonts were added.
- **Reduce motion:** the prototype's own rule shows the handbook scan line at rest at the top of the card.

## 6. Human phone verification

1. Install a debug build. Sign out, or use a fresh install, so the welcome shows.
2. **Welcome:** purple screen with the sparkle.
   - It spins in, then breathes. The orbit turns slowly, with its icons staying upright. Stars twinkle.
   - "LAFINA" rises letter by letter, then the tagline, the "Made for USTP students" pill and the buttons appear.
   - "I already have an account" opens Login.
3. **Get started → slide 1:**
   - The card slides up and the timeline line grows down. The rows rise in turn and the 9:00 dot pulses.
   - The bell wiggles after about 1.6 s.
   - The date shows **today**.
   - The **white** notification floats in at the bottom.
4. **Continue → slide 2:**
   - The bubble pops in, words fade in one by one, then "tomorrow" and "6 PM" get a highlight sweep.
   - The mic pulses and the bars bounce. "Got it" appears with a spinning sparkle.
   - The card's chips pop in, then the green check draws itself.
5. **Continue → slide 3:**
   - The tilted handbook scan line sweeps; the highlighted line grows.
   - The question bubble and answer card appear.
   - Tapping the citation opens the source view, and Back returns to the slide.
6. **Continue → slide 4:**
   - The deadline card drops in with a bounce. Its weekday is two days from today.
   - The shield pops in and pulses. The dashed link to the cloud moves.
   - "Continue without an account" starts guest mode.
7. **Back arrow and Android Back:** step back through the slides; from slide 1 you return to the welcome.
8. **Turn on Settings → Accessibility → Remove animations,** then reopen: everything appears at once, with no movement.
9. **Small or large phones:** on a phone narrower than 390 dp, or with large font size, check that nothing is clipped. The illustration shrinks and the middle area scrolls.

The agent cannot certify how smooth the animations are, how the shadows look, or how closely each screen matches its screenshot.

## 7. Docs/ADRs changed

This report. The design source is `docs/design/onboarding/` (added by the owner).

## 8. Open blockers and recommended next steps

1. The device visual check (§6) is outstanding.
2. Decide whether the intro should get a dark-mode version; it is fixed light today, per the spec.

## 9. Review decision

- [x] All automated required checks passing
- [ ] Manual device tests completed and human-confirmed
- [x] No disallowed scope/code change
- [x] Report accurate

`STATUS: AWAITING DEVICE VALIDATION` — `STOPPED — awaiting explicit human approval`
