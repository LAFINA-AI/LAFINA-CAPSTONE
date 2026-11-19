# ADR-039 — Read the COR from the PDF text layer, by column, with checksum checks

**Status:** proposed (awaiting device validation)
**Date:** 2026-11-19
**Review owner:** human developer

## Context / problem

The owner asked (2026-11-18/19) for COR import to be "very reliable, 100% accurate", noting every USTP COR comes from the same portal template.

Findings:

- The portal COR is a **generated PDF** (JasperReports 6.18 + iText 2.1.7, A4, one page) with an exact text layer. Every cell is its own text object at a fixed column: CODE x≈34, TITLE 80, Lec 238, Lab 258, Credit 282, SECTION 300, SCHEDULE/ROOM 366, FACULTY 481 (points). A subject's second schedule line sits 10 pt lower. Long cells shrink to 5.5–6 pt instead of wrapping.
- The app **rasterized the PDF and ran ML Kit OCR on the image**, then parsed flattened lines with regex heuristics (name lists for glued middle initials, guessing dropped unit digits, splitting room from faculty). The 5.5–6 pt cells are exactly where OCR fails.
- The parser **filled gaps instead of checking**: a missing unit was deduced from the Total Unit(s) row, missing totals were replaced by the subject sums (so the checksum could never fail), and an unknown day code became Monday.

## Decision

1. **PDF text layer first.** `LafinaVisionModule.extractPdfWords` reads page 1 with `pdfbox-android` (`com.tom-roush:pdfbox-android:2.0.27.0`, Apache-2.0, offline) and returns positioned words (`CorPdfTextExtractor`, `CorPdfWords`). No OCR for portal PDFs.
2. **One layout reader for PDF and images** (`src/ai/vision/corLayoutParser.ts`). It finds the table header (CODE … FACULTY), maps words onto the template with one rotation + uniform scale, assigns each word to a column by its center, starts a subject at each CODE cell, and pairs schedule and faculty lines by height. The header is read label-by-label. If the SECTION/SCHEDULE headers are not where the template has them, it reports `layout_mismatch` and the caller falls back.
3. **OCR path keeps word boxes.** `recognizeText` now also returns ML Kit element boxes and image size, so screenshots/photos use the same layout reader. Images narrower than 1600 px are enlarged to 2400 px before OCR (the small COR text is otherwise a few pixels tall).
4. **Automatic checks** (`src/ai/vision/corChecks.ts`): subject units vs printed Total Unit(s) (error), Lec + Lab = Credit (warning), strict schedule grammar / known day codes / start < end (error), code and title present (error), 10-digit student number, term format, section format, duplicates. Result level: `exact` (PDF text + no issues), `checked` (OCR + no issues), `needs_attention`.
5. **Choosing a reading** (`src/ai/vision/corExtraction.ts`): PDF layout when the template is recognized; otherwise the OCR layout reading and the older OCR text reading are both checked and the one with fewer problems is used.
6. **Never silently wrong.** Unreadable schedule cells are kept (empty days/times, original text) so the review marks them; `expandDays` returns no days instead of Monday; deduced units are marked `unitsInferred` and flagged; the subject-sum fallback is display-only and never used as the "printed" total.
7. **Review shows the result** (`CorAccuracyCard`): "Read exactly from your COR PDF", "Read from an image · checks passed", or the itemized problems. Stored on the draft as optional `accuracy` (older drafts simply show nothing).

No machine-learning model was added: for a fixed generated template the text layer is exact, and a trained model would only add probabilistic errors plus a need for many real (personal) CORs to train on. ML Kit OCR remains the image fallback.

## Consequences

- Portal PDFs are read character-exact; tested 105/105 fields on the owner's real COR (local, git-ignored `cor-sample/`) and 0 field errors across 300 randomized template-geometry CORs plus 240 OCR-style variants (scale, ±1.2° rotation, box jitter).
- A 770 px screenshot of the same COR, read by ML Kit on an Infinix X6880 (Android 15), scored 100/105 fields after the OCR-only clean-up (64/105 before it). All 5 wrong fields were flagged by the checks (`days_unclear`, `time_unclear`, `section_near_main`), so none reaches the calendar silently.
- Native calls are time-limited in `visionService` (PDF text 15 s, then OCR; OCR 60 s, then a clear error). The old PDF→image→OCR path hung on the test phone inside instrumentation; portal PDFs no longer use it.
- APK grows by the pdfbox-android library (a few MB). Code shrinking is off, so no keep rules are needed.
- A redesigned portal template is detected (`layout_mismatch`/`no_table_header`) and falls back to the older text reader with the checks still applied; the template constants would then need re-measuring.
- Image imports can still misspell names or rooms (no checksum covers free text); the card says so and recommends the portal PDF.

## Alternatives considered

- Android 15 `PdfRenderer` text APIs: not on most students' phones (minSdk 30).
- PDF.js in React Native: heavy, Hermes/worker friction.
- MuPDF: AGPL.
- Training a document model (LayoutLM/Donut): not needed for a fixed template; needs labelled personal data; non-deterministic.
- Sending the COR to the backend: breaks offline-first and moves personal data off the device.
