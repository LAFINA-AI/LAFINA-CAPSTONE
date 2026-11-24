# UI-POLISH — Profile, Call cards, Memory page and plain-language copy / Completion Report

**Branch / commit SHA:** `main` @ `14bc7f0` + uncommitted working tree
**Date/time UTC:** 2026-11-24
**Device(s) available:** NONE (no phone connected to this session)
**Status:** `AWAITING DEVICE VALIDATION`
**Approval provenance:** owner request in chat (2026-11-24): "improve the profile tab layout and design … the lafina call tab cards … the memory page … no hard to understand terminologies … don't mention any deepseek or elevenlabs, as well as walls of texts".

## 1. Scope completed

- **Profile tab layout.** The settings are regrouped by what the student wants to do, in this order: *Reminders & schedule*, *LAFINA assistant*, *Voice*, *School*, *Appearance*, *About & help*, then *Your data* (Clear All Data) at the bottom next to Sign Out. Every row has a coloured icon, a plain name and its current status on a second line. A row of shortcut chips (Reminders · Assistant · Voice · School · Look · About) sits above the settings and scrolls to each group. Group headers have a title and a one-line hint.
- **Row renames (no jargon).** Scheduling & Reminder Preferences → Reminder timing; Alert Tones & Notifications → Alerts & sounds; Reminder Call Settings → Reminder calls; Alarm & Reminder Health → Check my reminders work; Event Defaults → New event defaults; Memory → What LAFINA remembers; Detailed AI Summaries → Detailed answers; Markdown Chat Replies → Neat answer formatting; Test TTS Voice → Play a voice sample; Offline Voice → Voice without internet; Online Voice · ElevenLabs → Online voice; Student Setup → School setup; Undo Last COR Import → Undo last COR upload.
- **Row summaries in plain words.** e.g. "15 min before · Snooze once", "Calls you · quiet hours on", "LAFINA talks with you · rings 45 sec", "3 things saved".
- **Memory page** (`ChatMemorySettings`) redesigned: a short intro card with two bullet points instead of a 300-character paragraph; an on/off card ("Remember things from chats"); stat tiles (Saved / Pinned / From chats); a "Your reminder habits" block with bold numbers and a progress bar instead of "Adaptive timing active: N reminder signals …"; a "+" add box; each memory as its own card with a friendly category tag (About you, School, Studying, Goal, Routine, Other), pinned memories first, and labelled Save/Cancel buttons while editing; an outlined "Forget everything" button.
- **Call cards.** Draft cards (task/reminder, event/time block, note) show "Add task" then the title in bold, and each detail line as a muted label with a **bold value** inside a soft box (`CardDetailLine`). The To-Do result card shows each item's title in bold with a "Wed, Nov 25 · 2:00 PM" line and a High/Low tag instead of `• Title (2026-11-25 14:00) [High]`. The agenda card shows bold titles with time and type underneath, in 12-hour time and friendly dates. The grouped card says "2 items to save" instead of "Grouped Actions (2)". The in-call memory card wording is shorter and no longer mentions a "voice provider".
- **No vendor names.** User-visible text no longer names DeepSeek or ElevenLabs (chat failure messages, offline-reply notes, online voice sheet, voice sample alerts, call settings, walkthrough). Server-provided error text shown in the voice sheet, voice sample and call problem card passes through `hideVendorNames` (`src/utils/vendorNames.ts`). Internal identifiers, logs, comments and the developer-only hub are unchanged.
- **Walls of text shortened** in Profile sheets (Offline voice, Online voice, Event defaults, Reminder health, Floating LAFINA, Clear All Data), Chat (sync notice, command guide), onboarding, COR accuracy card, Preferences chat sync, walkthrough steps.

Not changed: behaviour, storage, sync, permissions, native code, the developer-only hub.

## 2. Change summary

| File/module | Change |
|---|---|
| `src/ui/components/profile/SettingItem.tsx` | Optional `icon`, `tone`, `subtitle`, `testID`; exported `useSettingTone`. Old call sites unchanged. |
| `src/ui/screens/ProfileScreen.tsx` | Regrouped settings, section shortcut chips, group headers, plain summaries, voice sample alerts without vendor names. |
| `src/ui/components/profile/AppUpdateItem.tsx` | Icon tile to line up with the other rows. |
| `src/ui/components/profile/ChatMemorySettings.tsx` | Memory page redesign (logic unchanged). |
| `src/ui/components/callLafina/cards/CardDetailLine.tsx` (new) | Label + bold value detail line. |
| `src/ui/components/callLafina/cards/cardFormat.ts` (new) | `shortDate`, `time12`. |
| `src/ui/components/callLafina/CallReadResults.tsx`, `cards/AgendaCard.tsx`, `cards/{Calendar,Reminder,Note}DraftCard.tsx`, `cards/MultiActionCard.tsx`, `cards/MemoryReviewCard.tsx` | Card formatting and wording. |
| `src/utils/vendorNames.ts` (new) | `hideVendorNames` for server-provided messages. |
| `src/ai/chatOrchestrator.ts`, `src/ai/localConversation.ts`, `src/cloud/{speechService,onlineVoiceService}.ts`, `src/cloud/voiceConversation/controller.ts` | Vendor-free user-facing strings. |
| Other `src/ui/**` copy files | Shorter text. |
| Tests | Updated for renamed labels; `productTourWalkthrough` now asserts the tour does **not** mention DeepSeek/ElevenLabs/Whisper/AlarmManager; new `__tests__/ui/plainLanguageCopy.test.ts`. |

## 3. Tests and real outcomes

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p .` | PASS |
| Lint | `npx eslint src __tests__ App.tsx index.js --max-warnings 0` | PASS |
| Jest (full) | `npx jest` | PASS — 218/218 suites, 2958 passed, 1 skipped |
| Architecture | `npm run check:architecture` | PASS — 509 modules, 0 cycles, 0 forbidden deps |
| Android build | `gradlew` | NOT RUN — JS/TS-only change, no native files touched |
| Device manual | see chat checklist | NOT RUN — no device |

The first `npm run preflight` run failed 6 tests in 4 suites. Five were old text matches, now updated. One was a real problem: the shorter Call LAFINA consent text had dropped "saved memories" and the note that reminder calls share the reminder. Both are privacy disclosures, so they were put back before the clean run above.

## 6. Human phone verification

Not run: no device in this session. Checklist is in the chat handoff.

## 8. Open items

- Not checked on a phone: spacing, dark mode, and the shortcut chips' scroll targets.
- Model names in the offline model picker (e.g. "Gemma 3 270M") are still shown, because they tell the student which download they are choosing.

**STATUS: AWAITING DEVICE VALIDATION** — STOPPED — awaiting explicit human approval

---

## Follow-up (2026-11-24): Review your COR — class dates

**Problem reported:** tapping "Confirm & Add Schedule" without a first/last class date added nothing and seemed to do nothing. The error box was drawn after every subject card, at the very bottom of a long scrolling page, so it was off screen. The date rows were not marked either.

**Changes**
- `onboardingUi.tsx`: `OnboardingPage` can show its error just above the bottom buttons (`errorNearActions`), where it is always visible, and shakes it on each failed Confirm (`errorShake`). It also exposes `scrollToFieldY` through a ref. `SlimRow` has an `invalid` state: red outline, bold red text, a "Required…" line under it, and a shake. New `useShake` hook; it respects the phone's reduced-motion setting.
- `CorReviewFlow.tsx`: a failed Confirm returns *where* the problem is (student details, term dates, a subject, conflicts). The page then scrolls there and marks it: missing dates turn red, and a subject with a problem gets a red border. The message names exactly what's missing ("Choose your first and last class dates (marked in red above)."). Unset dates read "Tap to choose" instead of "Not set".
- Suggested dates: when dates are missing, the term card shows "Suggested: USTP 1st semester runs Mon, Aug 10, 2026 to Thu, Dec 17, 2026" and a one-tap "Use Aug 10 – Thu, Dec 17, 2026" button. The date pickers open on those dates. Nothing is filled in without a tap, so the existing "dates come from the student" rule still holds. There is no suggestion for 2nd semester, summer, or after Dec 17, 2026; the 18-week button is used then.
- `corReviewModel.ts`: `USTP_SUGGESTED_TERM`, `suggestedTermDates`, `fillMissingTermDates` (fills only the missing date).

**Tests:** `__tests__/ai/corSuggestedDates.test.ts` (new); `__tests__/ui/onboardingCorReviewFlow.test.tsx` now checks that the error and the red date rows show. Full `npx jest`: 219/219 suites, 2963 passed, 1 skipped. Lint, typecheck and architecture: PASS. Not run on a device.
