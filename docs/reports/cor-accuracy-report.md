# COR import accuracy — Completion Report

**Branch / commit SHA:** written on `feature/lafina-floating-assistant` @ `0082d1c`; committed as `d77d293` on `feature/cor-accuracy-calendar-call-updates`
**Date/time UTC:** 2026-11-18T17:30Z (2026-11-19 01:30 PHT)
**Device(s) available:** Infinix X6880, Android 15 (API 35), `com.lafina.capstone` 0.6.0-data-qa
**Status:** `AWAITING DEVICE VALIDATION` (in-app import not yet tried by a human)
**Approval provenance:** owner, 2026-11-19: "ok proceed and implement to make this cor attatchment accuracy - then test so that to make sure that it is very accurate - you can use my cor to test it. just make sure to put it to gitignore."

## 1. Scope completed

- **Exact PDF reading.** Portal COR PDFs are read from their own text layer (PDFBox) instead of being rendered to an image and OCR'd. Decision: [ADR-039](../decisions/ADR-039-cor-exact-pdf-text-and-layout-checks.md).
- **Column-layout reader** used for both PDF words and OCR word boxes. It is anchored on the table header and works on the template's measured geometry.
- **OCR clean-up** limited to confusions observed on the phone (`/`→`I`, `:`→`-`/`.`/missing, `0`→`O`/`D`, leading `l`→`I`, near-miss template words).
- **Automatic checks:** subject units vs printed Total Unit(s), Lec+Lab=Credit, strict schedule grammar, code/title present, student number, term, section, duplicates, plus a near-miss section warning for OCR.
- **Review screen card:** "Read exactly from your COR PDF", "Read from an image · checks passed", or an itemized list of problems.
- **No more invented data:** unknown day codes give no days (the old reader defaulted to Monday). Deduced units are flagged. Unreadable schedule cells reach the review as "needs fix".
- **Time limits:** stuck native calls fall back (PDF text → OCR after 15 s) or report a failure (OCR after 60 s).
- `cor-sample/` is git-ignored.

## 2. Change summary

| File/module | Change |
|---|---|
| `android/.../CorPdfTextExtractor.kt`, `CorPdfWords.kt` | PDFBox text layer → positioned words (word grouping is pure and JVM-tested) |
| `android/.../LafinaVisionModule.kt` | `extractPdfWords`; OCR returns element boxes and image size; small images enlarged to 2400 px before OCR |
| `android/app/build.gradle` | `com.tom-roush:pdfbox-android:2.0.27.0` (Apache-2.0) |
| `src/ai/vision/corLayoutParser.ts` | new layout reader |
| `src/ai/vision/corOcrCleanup.ts` | new OCR-only repairs |
| `src/ai/vision/corChecks.ts` | new checks and accuracy level |
| `src/ai/vision/corExtraction.ts` | chooses PDF → OCR layout → OCR text by check score |
| `src/ai/vision/ustpCorParser.ts` | shared types, `assembleUstpCorResult`, `printedTotals`, no Monday default, `unitsInferred` |
| `src/ai/vision/visionService.ts` | new extraction order and time limits (file also re-formatted by Prettier) |
| `src/ai/vision/corReviewModel.ts`, `CorReviewFlow.tsx`, `CorAccuracyCard.tsx` | `accuracy` on the draft and the review card |
| `__tests__/ai/cor*.test.ts`, `__tests__/fixtures/cor*.ts`, `onboardingCorReviewFlow.test.tsx` | synthetic template generator, OCR simulation, real-sample harness (local only), UI test |
| `android/app/src/androidTest/.../CorExtractionDeviceTest.kt`, `src/test/.../CorPdfWordsTest.kt` | on-device extraction harness; JVM tests |

## 3. Tests and real outcomes

| Check | Command / procedure | Result | Evidence |
|---|---|---|---|
| Typecheck + lint + format (changed files) | `npx tsc --noEmit`; `eslint … --max-warnings 0`; `prettier --check` | PASS | — |
| COR Jest suites | 8 suites (`cor*`, `ustpCorParser`, `scheduleScanOcr`, `onboardingCorReviewFlow`, `onboardingCorEligibility`) | PASS, 109/109 | `evidence/cor-accuracy/cor-suites.log` |
| Full preflight (earlier run) | `npm run preflight` | PASS, 163 suites / 2207 tests, architecture check clean | `evidence/cor-accuracy/preflight.log` |
| Full preflight (final run) | `npm run preflight` | **FAIL, 1 test** in `agyPort06PlannerReplies` ("editing an overdue task…": `Save` not found). Not caused by this change: 14 Calendar/Dashboard/storage/tab-bar files were being edited by someone else during this task (from ~00:35). This task did not touch them, and the same test passed in the earlier run. | `preflight-final.log`, `planner-rerun.log` |
| Android build + JVM tests | `gradlew :app:testDebugUnitTest :app:assembleDataQa :app:assembleDataQaAndroidTest -PreactNativeArchitectures=arm64-v8a` | PASS; 101 JVM tests, 0 failures (5 new in `CorPdfWordsTest`) | `gradle-final.log` |
| Real COR, PDF, read on the phone | instrumentation `CorExtractionDeviceTest` → Jest `corRealSample` | **105/105 fields (100%)**, level `exact`, 511 words, 753 ms | `device-progress.log`, `real-cor-accuracy.log` |
| Real COR, PDF, desktop reference (pdfplumber) | Jest `corRealSample` | 105/105, `exact` | same |
| Real COR, 770 px screenshot, phone OCR | same harness | **100/105 (95.2%)**, all 5 wrong fields flagged (`days_unclear`, `time_unclear`, `section_near_main`), 1.35 s. Before the OCR repairs: 64/105. | same |
| Synthetic template CORs | `corLayoutParser.test.ts` | 300 random CORs: 0 field errors, all `exact`. 240 OCR-style variants (scale 1.3–5.2, ±1.2°, jitter): 0 errors, all `checked` | `cor-suites.log` |
| Old raster path (PDF → image → OCR) on the phone | harness step `ocr-pdfrender` | **NOT RUN / hangs.** `PdfRenderer` never returned on this phone inside instrumentation. Portal PDFs no longer use this path; the app now has a 60 s limit on it. | `device-instrumentation-pdf.log` |
| In-app import through the UI | manual | **NOT RUN** (human required) | §6 |

## 4. Performance

On the phone (single runs, not a benchmark): PDF text layer 753 ms (1239 ms on the first, cold run); screenshot OCR 1352 ms at 2400×1501. APK grows by the pdfbox-android library (size not measured separately).

## 5. Reliability, privacy, permissions, licenses

- No new permissions. Everything stays on the device. PDFBox is Apache-2.0.
- `cor-sample/` (real COR, expected answers, extracted words) is git-ignored. A scan of the new tests, fixtures, evidence and ADR found no real student or faculty data. Older committed tests (`ustpCorParser.test.ts`, `onboardingCorReviewFlow.test.tsx`) already contained real COR values before this task.
- Image imports can still misspell names and rooms, because no checksum covers free text. The card tells the student and recommends the portal PDF.
- Instrumentation on this phone needs the screen on: Doze plus the vendor's power manager suspends the test process. The test temporarily set `stay_on_while_plugged_in`, which is restored to `0`. The phone also drops app logcat output, so the harness writes `progress.log` instead.

## 6. Human phone verification

1. Install the build under test (see note below), open LAFINA, then go to the COR import in onboarding or your profile and choose **the COR PDF from the student portal**.
   - Expected: a green card, "Read exactly from your COR PDF".
   - Expected: 6 subjects with the correct units, sections, rooms and faculty; IT411 as "TBA · no schedule"; Total 18.
2. Tap **Replace** and choose the **screenshot**.
   - Expected: a red card, "N things to double-check", listing IT412's evening class and GnS's section.
3. Choose a non-COR image.
   - Expected: "could not find USTP COR details"; your schedule is unchanged.
4. Not certified by the agent: the import through the UI, the "Confirm & Add Schedule" result in Calendar, and dark-mode appearance of the card.

Note: the phone currently has the APK built at 00:46. It contains the native changes but not the later OCR repairs. The newest APK also bundles the unfinished Calendar work from the other edits, so it was not installed.

## 7. Docs/ADRs

- [ADR-039](../decisions/ADR-039-cor-exact-pdf-text-and-layout-checks.md).
- Architecture check: 0 import cycles, 0 forbidden dependencies (from the earlier full preflight).

## 8. Open items

1. Re-run full preflight once the concurrent Calendar work is finished (the planner test failure belongs to it).
2. Investigate the `PdfRenderer` hang on the X6880. It only matters for scanned PDFs without a text layer.
3. Collect more real CORs (other colleges and the older "FM-USTP-RGTR-01" template) into `cor-sample/` to widen the accuracy measurement.
