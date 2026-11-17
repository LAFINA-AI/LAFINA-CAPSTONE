# Fixes for the app status audit of 2026-11-16

- **Audit:** `docs/reports/app-status-audit-2026-11-16.md` (written at `e12dfa5`)
- **Fixed on:** branch `feature/uniguide-inspired-ui-overhaul`, working tree on top of `1757a0a`. Nothing is committed.
- **Date:** 2026-11-16
- **Status:** READY FOR REVIEW. All automated gates pass. No device, emulator or live-backend check was run.

## Gates run (this working tree)

| Gate | Command | Result |
|---|---|---|
| TypeScript strict | `npx tsc --noEmit -p .` | exit 0 |
| ESLint | `npm run lint` (`--max-warnings 0`) | exit 0 |
| Architecture | `npm run check:architecture` | PASS: 355 modules, 0 cycles, 0 forbidden deps, 100 offline leaves with no network import |
| Jest | `npx jest --runInBand --ci` | 138/138 suites, 1915 passed, 1 skipped (skipped before these changes as well), 0 failed |
| Android JVM | `gradlew testDebugUnitTest --offline` | exit 0; 8 suites, 76 tests, 0 failures (`LafinaIntentExtractorTest`: 8/8) |

The new regression file `__tests__/ai/appStatusAudit20261116.test.ts` has 58 tests. They run on the real bundled handbook pack.

## Findings

| ID | Result | What changed |
|---|---|---|
| H1 | **Fixed** | `handbookSearch.ts`: every candidate must now pass an evidence gate based on domain concepts, free-word coverage, and unknown words absent from the pack vocabulary (`localHandbookStore.hasTerm`). Generic words were removed from the concept groups, and conversational and Tagalog stop words were added. All 18 off-topic audit questions now return `insufficientEvidence`. |
| H2 | **Fixed** | `useHandbook` is now opt-in (`=== true`), or on for the USTP chat. A follow-up borrows the previous question only if that question found evidence itself. No handbook note is added when the reply says the excerpts don't cover the question (`replyDisclaimsHandbook`). |
| H3 | **Fixed** | `isHandbookQuestion` = handbook signal minus personal-planner phrasing ("my GWA", "do I have left", command verbs, "goal note"). For a mixed question, the handbook clause is extracted (`extractHandbookClause`) and its local answer is appended under the planner/agent reply. |
| H4 | **Partly fixed, root cause open** | New native `isEngineAvailable()`. Download/Use is disabled with an "unavailable on this build" notice in Chat and Settings. `getActiveOfflineModelReadyConfig` returns null without the engine. Native output is tagged `engine: slm / kotlin_fallback`, and only `slm` output is fused. **`lafina_llama` is still not built**, so on-device models stay off on real builds until the JNI library ships. |
| H5 | **Fixed** | Migration v28 creates the FTS table and triggers inside a savepoint. Without FTS5 it rolls back just that part and logs a warning. A missing index is recreated and rebuilt at start-up. The handbook then reports *not available* instead of breaking DB init. |
| M1 | **Fixed** | A card is tied to the chat and the assistant turn that showed it. A bare "yes/ok/sure/no" decides it only if the card was the last assistant message. "confirm" and "cancel" still work. Switching chats cancels the card silently, and stale replies are dropped (`isCurrent`). |
| M2 | **Fixed** | `plainToolText` strips the "Say …" hint and Markdown emphasis from agent tool results. The test now checks for `Say`, `*` and `>`. |
| M3 | **Fixed** | One download at a time across screens. Free space is checked first. The file is accepted only if its size equals Content-Length and exceeds the preset minimum. Cancel removes only its own job and temp file. The model is selected only after a verified download. |
| M4 | **Fixed** | Download state is shared between Chat and Settings (`useSharedModelDownload`). A model counts as active only if the engine exists and the file is valid. The preset's `minValidBytes` is passed to native (floored at 40 MB). |
| M5 | **Mostly fixed** | Ranking now uses score only (domain concepts, section-title matches, coverage, BM25). Correct #1 for INC, grade completion, passing grade, grading system, shifting, cheating, dress code, drop subject and LOA. **GWA and NSTP questions still don't always rank the best section first.** |
| M6 | **Fixed** | To-do, day-schedule and notes answers carry `spokenReply`. Chat TTS and the Voice modal speak it instead of the flattened Markdown. |
| M7 | **Fixed** | A month/day with no year that is more than 60 days in the past rolls to next year. An impossible date (Nov 31, Feb 30) is refused with "November 31 doesn't exist… Nothing was changed." |
| L1 | Fixed | Wording now says "Tools → Alarms". The tour no longer mixes alarms and reminders. |
| L2 | Fixed | Bare "pa-remind" and "may … kami/tayo" are translated, so the filler no longer ends up in titles. |
| L3 | Fixed | Overnight blocks count their minutes. A task due earlier today at a set time counts as overdue. `weeklyClassCount` is documented as sessions, which is what the UI shows. |
| L4 | Fixed | "what tasks are overdue", "tasks that are still overdue" and "anything overdue" reach the offline overdue lookup. |
| L5 | Fixed | One shared `DEVICE_SETTINGS_SCOPE` (`src/storage/deviceScope.ts`), with a read fallback for the old `__device__` model key. `backendSelection` keeps `__device__` on purpose, because existing installs store the debug server choice there. |
| L6 | Documented | The PDF has been tracked since `cd9fdc8`, so the audit's "untracked" is out of date. Distribution rights are the owner's call (see `docs/07-RAG-AND-ONLINE.md`). |
| L7 | Fixed | The server-refusal message for meeting notes now says what happened and what to do. |
| L8 | Fixed | `find_free_time` accepts `today` / `tomorrow`. |
| L9 | Documented | Chat (local 2023 pack) vs Call Lafina (server index) is explained in `docs/07-RAG-AND-ONLINE.md`. The code is unchanged. |
| L10 | Fixed, untested | `VoiceConversationPanel` remembers the words it already executed this call. `prepare_lafina_action` does not run them a second time. There is no unit test because the panel has no harness for this path. |

## Not done / needs the owner

- **Version bump.** The preservation test PF13 pins `versionCode 6` / `0.6.0`. A release bump is your decision, so the change was reverted.
- **Build `lafina_llama`** (llama.cpp JNI) and check Gemma prompts for a double BOS token. Neither can be done or verified on the host.
- **Model integrity.** Download URLs are not pinned to a revision and there are no SHA-256 checks. Size checks are the only guard for now.
- **Device checks.** Nothing in this report was observed on a phone. Mocked Jest tests do not prove TTS, alarms, STT or downloads work on a device.

## Files

Changed: 36 tracked files (+1286 / −317). New: `src/storage/deviceScope.ts`, `src/ui/hooks/useOfflineModels.ts`, `__tests__/ai/appStatusAudit20261116.test.ts`, and this report. The temporary probe test was deleted. Nothing was written to `LAFINA` or `LAFINA-backend`.
