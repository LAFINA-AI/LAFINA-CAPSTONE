# LAFINA — complete manual phone testing checklist

Prepared: **2026-11-18, Asia/Manila**. Scope: the current checkout, including uncommitted call fixes and Floating LAFINA changes. This is a **test plan, not a record of completed testing**. Every checkbox starts **NOT RUN**; results in older reports do not automatically pass a case here.

Use this document for a full regression on a physical Android phone. It covers reachable student features, Android behavior, failure paths, and preserved capabilities that may be unavailable in the installed build. Creating this checklist does not approve another implementation phase or certify the app for release.

## Contents

1. [How to run and record tests](#1-how-to-run-and-record-tests)
2. [Install, launch, upgrade and recovery](#2-install-launch-upgrade-and-recovery)
3. [Introduction, onboarding and walkthrough](#3-introduction-onboarding-and-walkthrough)
4. [Accounts, guest mode and access](#4-accounts-guest-mode-and-access)
5. [USTP setup and COR import](#5-ustp-setup-and-cor-import)
6. [Navigation and Home](#6-navigation-and-home)
7. [Schedule, events and time blocks](#7-schedule-events-and-time-blocks)
8. [Recurrence, classes and calendar files](#8-recurrence-classes-and-calendar-files)
9. [To-Dos and task completion](#9-to-dos-and-task-completion)
10. [Notes, formatting, images and categories](#10-notes-formatting-images-and-categories)
11. [Device-local alarms and morning briefing](#11-device-local-alarms-and-morning-briefing)
12. [Reminder scheduling and Android delivery](#12-reminder-scheduling-and-android-delivery)
13. [Incoming reminder calls](#13-incoming-reminder-calls)
14. [Offline speech capture and intent models](#14-offline-speech-capture-and-intent-models)
15. [AI chat, commands and reviewed changes](#15-ai-chat-commands-and-reviewed-changes)
16. [Chat history, drafts and memory](#16-chat-history-drafts-and-memory)
17. [USTP handbook and citations](#17-ustp-handbook-and-citations)
18. [Call LAFINA live conversation](#18-call-lafina-live-conversation)
19. [Offline and online spoken output](#19-offline-and-online-spoken-output)
20. [Profile, preferences, privacy and data reset](#20-profile-preferences-privacy-and-data-reset)
21. [Cloud synchronization and account isolation](#21-cloud-synchronization-and-account-isolation)
22. [Floating LAFINA and Quick Chat](#22-floating-lafina-and-quick-chat)
23. [Preserved document generation](#23-preserved-document-generation)
24. [Preserved lecture and meeting recorder](#24-preserved-lecture-and-meeting-recorder)
25. [App updates and developer controls](#25-app-updates-and-developer-controls)
26. [Accessibility, visual layout and interaction](#26-accessibility-visual-layout-and-interaction)
27. [Cross-feature interruptions, privacy and resilience](#27-cross-feature-interruptions-privacy-and-resilience)
28. [Performance and long-duration checks](#28-performance-and-long-duration-checks)
29. [Complete student journeys](#29-complete-student-journeys)
30. [Results, defect template and completion gate](#30-results-defect-template-and-completion-gate)
31. [Coverage sources and known prerequisites](#31-coverage-sources-and-known-prerequisites)

## 1. How to run and record tests

### Run information

Copy this document or keep a separate results file for **each build/device run**. Preserve the case IDs when reporting bugs.

| Field | Fill before testing |
| --- | --- |
| Tester / local date and time | |
| Build version / versionCode / Git commit | |
| Uncommitted changes included / APK SHA-256 | |
| APK path / package / build variant | |
| Standalone packaged JS or Metro-served JS | |
| Phone manufacturer / model / RAM / ABI | |
| Android version / API / OEM skin | |
| Locale / timezone / 12-hour or 24-hour clock | |
| Network / backend selection / backend revision if known | |
| Account labels and roles, e.g. Guest, QA-A student, QA-B student_pro | |
| Notification / exact alarm / full-screen / microphone / overlay access | |
| Battery optimization / saver / DND / volume / TTS engine and voice | |
| Evidence directory / bug tracker reference | |

Use a non-sensitive device label, **not an IMEI, serial number, password, token, real COR or private transcript**. Use synthetic student data and dedicated QA accounts. Obtain consent before recording anyone. Deletion, account switching, reinstall, low-storage and interruption tests belong on expendable QA data. Export or back up valuable records first; calendar export is not a complete backup of the database or attachments.

### Results and applicability

- `[ ]` means **NOT RUN**, never an implied pass. Tick `[x]` only after observing the expected result on the identified phone/build.
- Record **PASS**, **FAIL**, **BLOCKED**, **NOT RUN**, or **N/A — reason** in the results log in section 30. An unavailable required feature is **BLOCKED/FAIL**, not silently N/A.
- Items labeled **conditional** require an enabled route, QA build, fixture, second phone, account role, or controlled server condition. Record the unmet prerequisite. Do not modify production systems just to manufacture an error.
- Expected results describe acceptance behavior. If the current app behaves differently, record the actual behavior and defect; do not change the expectation to manufacture a pass.
- Repeat core create/edit/delete/read flows in **airplane mode**, after reopening the app, and online where applicable. Repeat important layout flows in Classic and Modern interfaces, light and dark modes.
- Always inspect the actual stored result through the UI after an AI confirmation: title, date, start/end time, priority, category, recurrence, location, note text, reminder delivery and item count. A spoken “saved” is insufficient.
- Acknowledging a reminder means **received**, not **task completed**. Alarm Dismiss, reminder Acknowledge, reminder Snooze and task Complete are different actions.
- **Background**, **swipe from recents**, **OS process death**, **reboot**, and **Android Force stop** are different conditions. Force stop can suspend delivery until reopening; do not expect an app to bypass Android restrictions.

### Test kit and fixture data

Have stable Wi-Fi, mobile data, a charger, headphones/Bluetooth if available, an offline English system TTS voice, and a stopwatch. For synchronization use a second installation/device and two QA accounts. Optional ADB/fault-injection work should use a disposable QA installation and a developer-provided fixture.

Create records with a prefix such as `QA-1118-`:

- An undated task; past-due, today and tomorrow tasks; each priority; completed and reopened tasks.
- A one-hour event with room and notes; an all-day event if offered; a block crossing midnight; two overlapping items; a repeating class.
- A call-style reminder and a notify-only reminder **2–3 minutes ahead**; two reminders due together; a recurring reminder where supported.
- A note with formatted text, two checklist items, an image, a custom category and a pin; two similar titles to test ambiguity.
- A one-shot alarm **2–3 minutes ahead**, a repeating alarm, and an alarm with morning briefing.
- Synthetic COR PDF/image/text with known courses, TBA rows and multi-day schedules; malformed and unsupported files. Keep an expected-values copy.
- Small valid `.ics` with timed/all-day/recurring entries, timezone and count/until examples; invalid/empty `.ics`; harmless image and audio samples; sufficiently long notes/chats for pagination.

### Device and condition matrix

Run on the available physical phone first; record missing coverage. Emulator results supplement physical results and must be labeled separately. Read minimum/target SDK from the installed build's configuration; do not assume an older report describes today's APK.

| Dimension | Required coverage to record |
| --- | --- |
| Hardware | Minimum supported Android/RAM representative; a newer Android phone; additional OEM where available |
| Android policy | Android 13+ notification access; Android 14+ full-screen restrictions; Android 15+ overlay/foreground-service behavior where available |
| OEM | Actual battery/autostart/background-pop-up behavior, especially Infinix/XOS, Samsung, Xiaomi, OPPO/realme/vivo if available |
| User | Guest; signed-in student; student_pro/admin compatibility using QA accounts; two different owners |
| School setup | Scheduling-only; USTP pending COR; USTP confirmed COR |
| Connectivity | Airplane mode; Wi-Fi; mobile data; disconnect/reconnect mid-operation; connected Wi-Fi without internet |
| Lifecycle | Foreground; background; locked; recents removal; process death; reboot; force stop followed by reopening |
| Access | All allowed; individually denied; revoked while active; permanent denial; restore in Settings |
| Presentation | Classic/Modern; each exposed palette; light/dark; small display; 200% font; TalkBack; reduced motion; supported rotation/multi-window |

## 2. Install, launch, upgrade and recovery

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | BOOT-01 | Install the current compatible APK on a clean QA phone; open from launcher. | Correct app name/icon/splash; introduction opens; no crash, blank screen or debug storage error. |
| [ ] | BOOT-02 | Cold-launch three times; then resume repeatedly from Home/recents. | Startup completes; returning preserves the correct user and screen state. |
| [ ] | BOOT-03 | Launch first time in airplane mode. | Guest entry and manual setup work without cloud access. |
| [ ] | BOOT-04 | Open a standalone QA/release-like APK with Metro/computer disconnected. | App launches and native/offline features work without the development machine. |
| [ ] | BOOT-05 | Install an update over a matching-signature older QA build containing fixtures. | Records, attachments, preferences and account ownership survive migration. |
| [ ] | BOOT-06 | After that upgrade, inspect notes search, handbook availability, alarms and pending reminders. | Migration preserves data; optional missing search capabilities do not block the entire app. |
| [ ] | BOOT-07 | Attempt a mismatched-signature update on an expendable install. | Android refuses safely; tester preserves data and uses a matching build, without uninstalling valuable data. |
| [ ] | BOOT-08 | Background/reopen during initialization and immediately after first launch. | No duplicate onboarding, partial user, crash or repeated `local_settings` errors. |
| [ ] | BOOT-09 | Reboot with saved local records, then open the app offline. | Same owner/data; native schedules reconcile without duplicate items. |
| [ ] | BOOT-10 | Conditional: open a QA fixture with failed database initialization; tap Retry twice. | Recovery screen is truthful; retry is guarded; no automatic data reset or false save. |
| [ ] | BOOT-11 | Conditional: remove the injected storage fault and retry/relaunch. | Existing data returns intact; no second database or fresh empty account replaces it. |
| [ ] | BOOT-12 | Repeat a previously failed launch after a normal restart. | Recoverable state clears; persistent fault remains explained without an endless spinner. |

## 3. Introduction, onboarding and walkthrough

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | ONB-01 | Read every introduction page; use Next, Back, swipe and Skip where offered. | Correct page/progress; readable artwork/copy; controls go to the intended destination. |
| [ ] | ONB-02 | Open the introduction's handbook citation/source example, then return. | Source is inspectable; return restores the introduction. |
| [ ] | ONB-03 | Use Sign in and cloud-account links from the introduction. | Correct auth screen; Back does not strand or duplicate setup. |
| [ ] | ONB-04 | Choose guest entry and “not a USTP student.” | Scheduling setup continues; USTP-only capabilities are explained as unavailable. |
| [ ] | ONB-05 | Choose USTP, defer COR, finish setup. | Pending eligibility is honest; manual planning remains usable. |
| [ ] | ONB-06 | Complete the USTP COR review path. | Confirmed school/profile/courses carry into the remaining setup. |
| [ ] | ONB-07 | Visit every offline-AI choice; continue without downloading. | Fast-Path Only remains usable; no forced large download. |
| [ ] | ONB-08 | Where engine support exists, start a model download and continue to later setup. | Progress/status remain accurate across steps; completion does not restart onboarding. |
| [ ] | ONB-09 | Deny Notifications and Mic; skip permission setup. | Setup finishes; text/manual features work; unavailable alert/voice features are explained. |
| [ ] | ONB-10 | Grant each offered permission via its row, return, then revoke one in Android Settings. | Each row refreshes accurately; no unrelated permission is claimed granted. |
| [ ] | ONB-11 | Enter preferred name, tone, reminder lead and memory opt-in; finish. | Saved choices appear in Profile and affect subsequent relevant behavior. |
| [ ] | ONB-12 | Finish once with memory opt-out. | Personal details are not silently saved as AI memory. |
| [ ] | ONB-13 | Close/kill and reopen at each setup stage. | Safe resume/reselection instructions; no partial COR import or duplicated data. |
| [ ] | ONB-14 | Finish with each offered goal and with/without the quick tour. | Intended destination opens; onboarding does not repeat on normal relaunch. |
| [ ] | ONB-15 | Run the entire product tour, skip halfway, replay from Profile. | Anchors follow the five tabs; overlay does not block normal use after exit. |
| [ ] | ONB-16 | Replay onboarding where the QA build exposes it. | Existing planner data remains; imports/settings change only after explicit confirmation. |

## 4. Accounts, guest mode and access

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | AUTH-01 | Create guest tasks, notes and reminders offline; relaunch. | `local_guest_user` retains local data without sign-in. |
| [ ] | AUTH-02 | Register with blank name/email/password, malformed email and mismatched confirmation. | Specific validation; no account or half-created session. |
| [ ] | AUTH-03 | Try short/weak passwords and leading/trailing spaces; toggle password visibility. | Published validation applies consistently; visibility affects only the chosen field. |
| [ ] | AUTH-04 | Register a dedicated valid QA account online. | One account/session; correct display name; setup continues once. |
| [ ] | AUTH-05 | Register an already-used email. | Useful error without duplicate local identity. |
| [ ] | AUTH-06 | Disconnect during registration; cancel any offline-only-account offer, then retry. | Cancel creates nothing; retry is recoverable without false cloud-success claims. |
| [ ] | AUTH-07 | Explicitly accept an offline-only-account offer if available; reopen offline. | Account is clearly local-only; cloud entitlement/sync is not falsely implied. |
| [ ] | AUTH-08 | Login with valid credentials, wrong password and unknown account. | Correct success/error; loading ends; password remains obscured unless revealed. |
| [ ] | AUTH-09 | Disconnect/time out during login; double-tap Login/Register. | No duplicate session, stuck spinner or accidental offline credential bypass. |
| [ ] | AUTH-10 | Restart a signed-in installation online and offline. | Cached local data stays usable; unavailable server features explain their limits. |
| [ ] | AUTH-11 | Use the guest “Create account” path with existing fixtures. | Reviewed migration/linking preserves guest content without duplicate rows or another owner's data. |
| [ ] | AUTH-12 | Cancel account creation/linking and return to guest. | Guest records remain accessible and unchanged. |
| [ ] | AUTH-13 | Sign out online, then repeat offline. | Local session ends safely; outgoing calls/mic/Quick Chat stop; no token remains usable in UI. |
| [ ] | AUTH-14 | Sign in as QA-B after QA-A; return to every tab/history/memory view. | Only QA-B data is shown; previous drafts, avatars and pending actions do not leak. |
| [ ] | AUTH-15 | Exercise cloud features as guest, student, student_pro and admin QA accounts. | Guest is gated; compatible signed-in roles follow actual server entitlement; no obsolete forced Pro badge/paywall. |
| [ ] | AUTH-16 | Conditional: expire/revoke the test session during a cloud request. | Clear sign-in recovery; no retry loop, cross-user write or loss of local planner access. |
| [ ] | AUTH-17 | Conditional: exhaust a controlled quota or use a denied entitlement. | Honest limit/error and retry guidance; no false success, duplicate charge or forced purchase. |
| [ ] | AUTH-18 | Inspect any exposed account/subscription-management entry. | Existing authorized behavior is preserved; missing required route is logged. Do not make a real purchase for QA. |

## 5. USTP setup and COR import

Compare every extracted value to the synthetic source. COR import and manual class entry are separate paths; both need testing.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | COR-01 | Open COR setup from onboarding and Profile → Student Setup/Replace COR. | Both routes reach the review flow for the active owner. |
| [ ] | COR-02 | Pick a supported synthetic COR PDF, image and text source, one at a time. | Supported files are read; unsupported formats give an actionable message. |
| [ ] | COR-03 | Cancel the picker; cancel reading; press Back while reading. | No import; existing academic profile/classes remain. |
| [ ] | COR-04 | Choose empty, damaged, password-protected or non-COR files. | Safe error/retry; no invented subjects or silent overwrite. |
| [ ] | COR-05 | Review school, campus, program, year/section and all subject details. | Extracted values match source; uncertain/missing values are distinguishable. |
| [ ] | COR-06 | View source text and Open original file; return to review. | Comparison works with the phone's available viewer; draft is retained. |
| [ ] | COR-07 | Edit subject code/title/units, section, instructor and room. | Edits remain in review and only approved values are imported. |
| [ ] | COR-08 | Edit days/start/end; add and remove a subject's class time. | Multi-day and multiple-meeting subjects retain independent correct times. |
| [ ] | COR-09 | Exclude a subject; add a missing subject manually. | Preview/counts update; excluded subject is not imported. |
| [ ] | COR-10 | Test TBA/unscheduled subjects and rows with invalid/missing times. | TBA can remain unscheduled; invalid scheduled rows require correction/exclusion. |
| [ ] | COR-11 | Confirm two rows that overlap and two with similar names. | No rows silently merge; conflict/uncertainty is presented where supported. |
| [ ] | COR-12 | Leave the review before Confirm; inspect Schedule/Profile. | No partial course or profile changes. |
| [ ] | COR-13 | Confirm a valid COR; tap Confirm twice quickly. | One import; correct academic profile, repeating classes and eligibility. |
| [ ] | COR-14 | Relaunch and inspect imported class dates/times, room/instructor and counts. | Confirmed information persists without timezone/day shifts. |
| [ ] | COR-15 | Replace a confirmed COR with a corrected synthetic COR. | Replacement scope is explicit; unrelated manual records remain intact. |
| [ ] | COR-16 | Profile → Undo Last COR Import; first Cancel, then confirm on QA data. | Cancel changes nothing; Undo removes only the intended import and updates eligibility truthfully. |
| [ ] | COR-17 | Switch to scheduling-only mode and back through Student Setup. | USTP access follows explicit setup; personal tasks/notes are retained. |
| [ ] | COR-18 | Close/kill during parsing/review; reopen. | Recoverable draft or clear reselect-file state; no duplicate partial import. |
| [ ] | COR-19 | Import offline; repeat without optional vision/model availability. | Supported local path works or explains the missing capability; manual class entry remains usable. |
| [ ] | COR-20 | Switch account while an old COR draft exists, then attempt to resume it. | Draft cannot import into the new owner or expose the old source. |

## 6. Navigation and Home

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | HOME-01 | Tap Home, Schedule, AI, Tools and Profile, including rapid repeats. | Correct five-tab order; centered AI; no duplicate screen or wrong active highlight. |
| [ ] | HOME-02 | Scroll/search a tab, switch away and return. | Retained state is sensible; new data still refreshes. |
| [ ] | HOME-03 | Open Home with no records; then add fixture data. | Helpful empty states become correct populated widgets. |
| [ ] | HOME-04 | Check greeting/date and Up Next against the known fixture schedule. | Correct local day, owner, chronological next item and time. |
| [ ] | HOME-05 | Inspect Today Schedule, Tasks Due and Upcoming Reminders. | Correct dates/status/counts; completed/cancelled items are not treated as pending. |
| [ ] | HOME-06 | Complete/reopen a task from a supported widget action. | Tools/Schedule/statistics agree immediately; linked reminder follows task lifecycle. |
| [ ] | HOME-07 | Open Free Study Blocks with a busy day, empty day and overnight block. | Suggestions fit actual free windows; no overlap or impossible duration. |
| [ ] | HOME-08 | Use a free-window action to prepare a study block. | Correct date/time prefilled; creation requires the offered save/review action. |
| [ ] | HOME-09 | Pin/unpin and edit a note; inspect Pinned Notes and open its card. | Updated content/order; intended note opens. |
| [ ] | HOME-10 | Customize widgets: show/hide each, move up/down and change exposed layout options. | Correct widget order/visibility persists after relaunch and remains owner-scoped. |
| [ ] | HOME-11 | Create/edit/toggle the next alarm; tap Next Alarm on Home. | Card updates/hides correctly; link opens **Tools → Alarms**. |
| [ ] | HOME-12 | Follow every widget's View all/item link, then Back. | Intended day/item/subtab opens; return remains usable. |
| [ ] | HOME-13 | Save data from AI/Quick Chat while Home was retained; return. | No stale counts/cards; no manual app restart required. |
| [ ] | HOME-14 | Leave Home open across midnight and resume next morning. | Today/date and due/overdue sections refresh to the new local day. |

## 7. Schedule, events and time blocks

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | CAL-01 | Switch Month/Week/Day; use previous/next arrows and week strip. | Correct date ranges, selected day and item placement. |
| [ ] | CAL-02 | Choose a date, cross month/year boundaries, then Go to today. | Correct target date; no day shift or lost selection. |
| [ ] | CAL-03 | Toggle Week Starts on Monday in Profile; revisit all calendar views. | Week headers/grids align consistently. |
| [ ] | CAL-04 | Create a task and an event via Add New Item. | Correct editor/type; saved item appears in the right views. |
| [ ] | CAL-05 | Save an event with title, date, start/end, location, category and notes. | All fields survive reopen and readback; duration is correct. |
| [ ] | CAL-06 | Edit one field at a time on that event. | Unchanged fields, recurrence and reminder style are preserved. |
| [ ] | CAL-07 | Test blank/whitespace title, impossible date and invalid time range. | Clear validation; nothing falsely saved. |
| [ ] | CAL-08 | Use 12 AM, 12 PM, 23:59 and midnight-spanning entries. | Correct day/time/duration; no AM/PM reversal or zero-length overnight block. |
| [ ] | CAL-09 | Create a date-only/all-day item if offered. | Correct all-day presentation; no accidental default midnight alarm. |
| [ ] | CAL-10 | Create a block from Add and by tapping a day-grid time slot. | Selected day/hour prefill correctly. |
| [ ] | CAL-11 | Save/edit/delete blocks in every exposed category/color. | Category styling matches; delete affects only the intended record. |
| [ ] | CAL-12 | Place simultaneous/overlapping short and long entries in Week/Day. | Cards remain distinguishable, tappable and readable; none disappear underneath others. |
| [ ] | CAL-13 | Tap event/block/task/reminder cards, including near crowded grid edges. | Correct detail/editor/action opens, not a neighboring record. |
| [ ] | CAL-14 | Change a scheduled task's date/time and priority. | Calendar, To-Do and linked alert agree; previous alert is invalidated. |
| [ ] | CAL-15 | Cancel/back out of new/edit forms and date/time pickers. | No unintended save; existing values remain. |
| [ ] | CAL-16 | Double-tap Save; leave/reopen during save. | One durable item; no misleading success or duplicate reminder. |
| [ ] | CAL-17 | Delete an item, first cancelling the confirmation. | Cancel preserves it; confirmed delete removes it and its obsolete alerts. |
| [ ] | CAL-18 | Open Undated Tasks, complete an item, and load more where offered. | Correct tasks/counts; no forced invented due date. |
| [ ] | CAL-19 | Inspect Philippine holidays and adjacent dates. | Correct displayed dates; holidays do not create personal tasks/alarms. |
| [ ] | CAL-20 | Navigate far forward/back with many entries and return to today. | Stable layout/loading; recurrence expansion does not freeze the phone. |
| [ ] | CAL-21 | Apply saved Event Defaults to a draft, then override them. | Defaults apply only when offered/accepted; explicit fields win. |
| [ ] | CAL-22 | Repeat create/edit/delete offline, then relaunch. | All manual planning remains available and durable. |

## 8. Recurrence, classes and calendar files

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | REP-01 | Create daily, weekly, monthly and yearly items where offered. | Occurrences appear on intended dates without materialized duplicate base records. |
| [ ] | REP-02 | Set every 2 days/weeks and multiple weekdays. | Interval/weekday selections survive reopen and match visible occurrences. |
| [ ] | REP-03 | Set Never, Until date and After count endings. | Series stops at the intended boundary/count. |
| [ ] | REP-04 | Try zero/negative/blank/very large intervals/counts and end before start. | Invalid rules are refused or explicitly normalized; no runaway series. |
| [ ] | REP-05 | Test month-end dates and February 29 across non-leap years. | Defined behavior is consistent; no crash or silently unrelated date. |
| [ ] | REP-06 | Edit/delete a recurring item; inspect the scope offered. | Only the explicitly chosen occurrence/series scope changes. |
| [ ] | REP-07 | Add manual classes with code, title, section, weekdays, start/end, room and faculty. | Correct repeated class blocks and readable class list. |
| [ ] | REP-08 | Add multiple sessions for one subject; edit/remove one/group through View Classes. | Correct scope; unrelated classes survive. |
| [ ] | REP-09 | Filter classes by subject/code/room/faculty; use Add COR/class actions. | Correct matches/navigation; empty search is recoverable. |
| [ ] | REP-10 | Import a small valid `.ics` using the Android picker. | Intended timed/all-day/recurring records and source batch appear once. |
| [ ] | REP-11 | Import timezone-qualified and floating-time calendar fixtures. | Displayed local dates/times match fixture expectations, including overnight entries. |
| [ ] | REP-12 | Cancel import; select empty/malformed/unsupported files. | No partial batch; clear error without losing prior records. |
| [ ] | REP-13 | Import the same file twice. | Duplicate policy is visible/consistent; no unnoticed multiplication of alarms. |
| [ ] | REP-14 | Toggle each personal/imported calendar layer off/on. | Visibility changes without deleting data or claiming to cancel reminders. |
| [ ] | REP-15 | Remove an imported batch, first Cancel, then confirm. | Only that batch and its applicable linked alerts are removed. |
| [ ] | REP-16 | Export calendar, save/share it, open/reimport on a QA destination. | Valid nonempty `.ics`; supported dates, titles, timezones and recurrence survive round trip. |
| [ ] | REP-17 | Cancel export/share or use an unavailable destination. | Recoverable outcome; source data remains. |
| [ ] | REP-18 | Change phone timezone, reopen repeating events/classes, then restore timezone. | Wall-time/instant behavior follows item semantics; no duplicate series or alert registration. |

## 9. To-Dos and task completion

Current route: **Tools → To-Do**. A scheduled task may also appear in Schedule/Home; a checklist row can belong to a note.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | TODO-01 | Quick-add an undated To-Do; submit by button and keyboard. | One task per deliberate submit; field clears only after success. |
| [ ] | TODO-02 | Quick-add blank/whitespace and very long text; change quick priority. | Blank is refused; length handled safely; chosen priority is saved. |
| [ ] | TODO-03 | Open full editor; set title, each priority, category and details. | Values persist; no date is required for an undated task. |
| [ ] | TODO-04 | Set Today/Tomorrow/Pick date, add a time, clear time, then No due date. | Correct due fields; removing a due time/date invalidates its obsolete automatic reminder. |
| [ ] | TODO-05 | Give a task a future due time; then move it earlier/later. | Corresponding reminder is scheduled once at the current intended time. |
| [ ] | TODO-06 | Save past-due and date-only tasks. | Honest overdue/date-only status; no unintended immediate repeated ringing. |
| [ ] | TODO-07 | Check All Open, To-Do, Scheduled, From Notes and Completed filters. | Correct membership/counts and no missing task between filters. |
| [ ] | TODO-08 | Search by title/details/category, clear search and test no matches. | Correct owner-scoped results and recoverable empty state. |
| [ ] | TODO-09 | Complete/reopen a task in Tools, Schedule and Home where exposed. | All views agree; completion stops obsolete reminders; reopening follows current due rules. |
| [ ] | TODO-10 | Toggle twice quickly, then reopen the app. | Final status is consistent; no duplicate task or corrupt completion count. |
| [ ] | TODO-11 | Tick a note checklist in From Notes; inspect the parent note and reverse there. | Both surfaces show the same checklist state without changing unrelated lines. |
| [ ] | TODO-12 | Open a checklist's parent note; test a deleted/missing parent via stale navigation. | Correct note opens or unavailable message; no wrong-owner note. |
| [ ] | TODO-13 | Expand/collapse Completed and switch list/grid views. | State and tappable rows remain correct. |
| [ ] | TODO-14 | Edit/delete a task with a linked reminder, first cancelling deletion. | Cancel changes nothing; deletion removes task and obsolete delivery. |
| [ ] | TODO-15 | Edit two similarly titled tasks, including an AI ambiguous-name request. | Correct explicit target; ambiguity never changes both silently. |
| [ ] | TODO-16 | Add enough tasks for paging; scroll, switch tabs and return offline. | No skipped/duplicated rows or lost edits. |

## 10. Notes, formatting, images and categories

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | NOTE-01 | Create, edit, reopen and delete a plain note offline. | Exact saved title/body; deletion confirmation behaves as offered. |
| [ ] | NOTE-02 | Test blank/whitespace title/body and a very long note with emoji, accents and multiline paste. | Validation/default title is honest; Unicode/text is not lost or truncated silently. |
| [ ] | NOTE-03 | Use Bold, Italic, Highlight and Code on a selection and at the caret. | Intended text formats; caret/selection remains usable. |
| [ ] | NOTE-04 | Use Heading, Subheading, Quote and Bullet list; switch Edit/Preview. | Structure renders correctly; editing round trip preserves content. |
| [ ] | NOTE-05 | Create nested lists; indent/outdent; enter/Backspace at line boundaries. | Correct list levels; no neighboring text loss or stuck formatting. |
| [ ] | NOTE-06 | Create checked/unchecked checklist lines; toggle in preview and note card. | Correct line changes and shared To-Do checklist state. |
| [ ] | NOTE-07 | Render existing ordered lists, dividers, links and mixed formatting. | Supported rich-text blocks are readable; no raw control markup or unsafe navigation. |
| [ ] | NOTE-08 | Pin/unpin notes; inspect pinned grouping and Home widget. | Consistent grouping/order and persisted pin state. |
| [ ] | NOTE-09 | Switch grid/list; search title/body; filter each category. | Same correct result set in both views. |
| [ ] | NOTE-10 | Load more notes; search across records beyond the first page. | Later records are discoverable; no duplicate/missing pages. |
| [ ] | NOTE-11 | Drag-reorder unpinned notes in a complete unfiltered collection. | Order persists; pinned notes remain in their defined section. |
| [ ] | NOTE-12 | Attempt reorder while searching/filtering or viewing partial results. | Unsafe reorder is unavailable; hidden notes are not reordered accidentally. |
| [ ] | NOTE-13 | Add a custom category with each color; assign it to notes/tasks. | Name/color persist and appear consistently. |
| [ ] | NOTE-14 | Rename/recolor/reorder a custom category using offered controls. | Existing records still resolve correctly; no duplicate category. |
| [ ] | NOTE-15 | Test duplicate/blank category names; delete a used custom category. | Clear validation and consistent fallback; note/task content survives category removal. |
| [ ] | NOTE-16 | Attach an image using Android picker; cancel and try an unsupported file. | Valid image previews; cancellation/error preserves the draft. |
| [ ] | NOTE-17 | Open image full-screen, zoom if supported, Back; remove/replace image. | Correct image; controls work; original source file is untouched. |
| [ ] | NOTE-18 | Relaunch after saving an attached image; later delete its note on QA data. | App-owned copy stays readable until deletion; cleanup does not remove other attachments. |
| [ ] | NOTE-19 | Use AI Assist → Summarize, Clean Up and Extract Tasks on synthetic content. | Each action has the advertised effect; no unrelated text/task changes or duplicate extraction. |
| [ ] | NOTE-20 | Cancel/fail an AI assist operation; disconnect if it uses a cloud service. | Draft remains recoverable; no false success or partial overwrite. |
| [ ] | NOTE-21 | Back/switch tabs/close editor with unsaved changes; exercise offered keep/discard/save choices. | Each choice matches its wording; no silent draft loss. |
| [ ] | NOTE-22 | Conditional: change the same note elsewhere while its editor is open, then save old draft. | Stale edit is refused/reconciled visibly; newer text is not silently overwritten. |
| [ ] | NOTE-23 | Open note search/read results from Chat or Call LAFINA; edit and return. | Correct note/owner; results refresh without duplicating notes. |

## 11. Device-local alarms and morning briefing

Route: **Tools → Alarms**. These are local clock-style alarms, separate from synced reminders. Use a test time far enough ahead to finish setup. Record scheduled time, actual ring time and drift. Android access and OEM restrictions can affect delivery; record the precise condition.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | ALM-01 | Open empty Alarms; create a one-shot alarm 2–3 minutes ahead. | Correct local time, label and enabled state; next-ring summary is sensible. |
| [ ] | ALM-02 | Use every exposed hour/minute wheel, AM/PM control and quick preset. | Smooth selection; displayed/saved time agrees, including 12 AM/PM. |
| [ ] | ALM-03 | Set a time earlier today. | Next occurrence/date is clearly shown; no unexpected immediate ring. |
| [ ] | ALM-04 | Create daily, weekday, weekend and selected-day repeats. | Selected days and next occurrence persist. |
| [ ] | ALM-05 | Change label, time, repeat, snooze length, vibration and morning briefing. | Each value survives reopen; old schedule is replaced once. |
| [ ] | ALM-06 | Toggle alarm off/on; delete with Cancel then confirm. | Disabled/deleted alarm never fires at the old time. |
| [ ] | ALM-07 | Let an enabled alarm ring in foreground, background and with screen locked. | Native alert/tone and available actions work; private app content remains protected. |
| [ ] | ALM-08 | Snooze from ringing screen, then wait for its configured interval. | Tone stops; exactly one next alarm at the displayed snooze time. |
| [ ] | ALM-09 | Dismiss from ringing screen and from notification; reopen Alarms. | One-shot/repeating state is correct; old sound/notification stops. |
| [ ] | ALM-10 | Rapidly Snooze/Dismiss or use notification and screen actions together. | One final action wins; no simultaneous snoozed and ringing copies. |
| [ ] | ALM-11 | Ring two alarms at the same time or one while another is snoozed. | Defined handling, usable controls; no orphan tone or lost future schedule. |
| [ ] | ALM-12 | Ring with silent mode, DND, vibration off and low/zero alarm volume separately. | Record actual Android/channel policy; UI never promises audibility contrary to settings. |
| [ ] | ALM-13 | Remove app from recents; repeat after OS process death. | Native schedule remains where supported; no dependence on Metro/foreground JS. |
| [ ] | ALM-14 | Schedule, reboot, unlock once, then wait for the alarm. | Schedule restores correctly without duplicate ring. |
| [ ] | ALM-15 | Force stop, wait through due time, then reopen. | OS limitation is respected; recovery/status is honest, with no uncontrolled burst of old alarms. |
| [ ] | ALM-16 | Test Doze/battery saver/OEM restrictions, then allowed battery/autostart settings. | Measure actual delivery and record required user settings; no unqualified reliability claim. |
| [ ] | ALM-17 | Deny/revoke exact-alarm, notification and full-screen access individually. | Health/status reflects restriction; available fallback is usable, never falsely “exact.” |
| [ ] | ALM-18 | Change timezone/date/time before an alarm; restore automatic time afterward. | Reconciliation follows device-local alarm semantics without stale duplicates. |
| [ ] | ALM-19 | Conditional: use a DST zone around spring gap/fall repeat. | Record actual chosen occurrence. Existing policy shifts a gap time by the gap (e.g. 02:30 → 03:30); no double ring. |
| [ ] | ALM-20 | Enable morning briefing, dismiss, unlock and open promptly. | Local system TTS reads today's actual schedule once; no microphone or online requirement. |
| [ ] | ALM-21 | Dismiss via notification; open within 10 minutes, then repeat opening after 10 minutes. | Eligible briefing plays only within its defined window; Android may require manual app opening. |
| [ ] | ALM-22 | Disable briefing or remove offline TTS; dismiss. | No unwanted speech; visual/manual alarm operation still works. |
| [ ] | ALM-23 | Create/toggle/read an alarm by Chat and Call LAFINA where supported. | Review/confirmation and local alarm list agree; no task/reminder substituted. |
| [ ] | ALM-24 | Test “wake me up at 7:30” versus “wake up at 7:30”; cancel both drafts. | Alarm versus task interpretation is explicit; no silent wrong-type save. |
| [ ] | ALM-25 | Switch accounts and inspect alarms; check second synced phone. | Only active owner's alarms are scheduled; device-local alarms are not cloud-synced. |
| [ ] | ALM-26 | Conditional: upgrade fixture containing legacy “Alarm” reminders and companion tasks. | Conversion happens once; source reminders/companions are handled consistently; normal reminders remain. |

## 12. Reminder scheduling and Android delivery

Test **Call me** and **Notify only** separately. A notification being accepted by Android does not prove a call rang. Do not confuse these reminders with section 11's clock alarms.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | REM-01 | Create a call-style reminder 2–3 minutes ahead via a supported review flow. | Title/time/style are correct; saved reminder appears once. |
| [ ] | REM-02 | Create the equivalent notify-only reminder. | Ordinary notification at due time; no simulated call or microphone. |
| [ ] | REM-03 | Change delivery style before due time, both directions. | Only the current style delivers; stale registration is cancelled. |
| [ ] | REM-04 | Create linked alerts through a timed task/event/block. | Exactly the intended linked reminders; no accidental extra companion item. |
| [ ] | REM-05 | Edit source title/time; clear its due time; delete or complete source. | Reminder content/schedule updates or cancels consistently. |
| [ ] | REM-06 | Deliver while foreground, background and screen off/locked. | One active delivery per identity; usable permitted notification/call route. |
| [ ] | REM-07 | Deliver with recents removed and after process death. | Native path functions where supported; reopen does not duplicate delivery. |
| [ ] | REM-08 | Schedule, reboot, unlock and wait. | Future reminders restore once with correct time/owner. |
| [ ] | REM-09 | Force stop through due time; reopen afterward. | Recovery follows OS limits and stale-reminder policy; no claim that force stop was bypassed. |
| [ ] | REM-10 | Deliver during Doze, battery saver and OEM restricted background mode. | Record actual drift/fallback; appropriate health guidance is available. |
| [ ] | REM-11 | Deny notifications; later grant them and schedule a fresh reminder. | Honest blocked status; no false “rang”; recovery works after grant. |
| [ ] | REM-12 | Deny/revoke exact-alarm access before/after scheduling. | Inexact/blocked condition disclosed; manual UI stays usable; current registrations reconcile. |
| [ ] | REM-13 | Deny full-screen intent while leaving notifications allowed. | Available heads-up/notification path remains; no assumption full screen will always open. |
| [ ] | REM-14 | Disable/remute Android notification channels, DND and sound individually. | Actual policy is respected; health/help does not misreport guaranteed audible delivery. |
| [ ] | REM-15 | Schedule two reminders together and a third during the first call. | Queue preserves distinct deliveries; no duplicate screen or overwritten reminder. |
| [ ] | REM-16 | Edit/delete a reminder just before its due time. | Old generation cannot ring or mutate the new/deleted record. |
| [ ] | REM-17 | Tap an old notification after editing/deleting/acknowledging the reminder. | Stale action is refused/closed; no new write or wrong task. |
| [ ] | REM-18 | Snooze a reminder, then change/delete its source before retry. | Obsolete retry never rings. |
| [ ] | REM-19 | Let repeated unanswered calls exhaust the configured retry/snooze limit. | Bounded retry policy; honest final status; no endless ring loop or task completion. |
| [ ] | REM-20 | Conditional: exercise recurring reminder delivery and exhaustion. | Current occurrence settles correctly; next recurrence advances once. |
| [ ] | REM-21 | Change local time/timezone around a due reminder; restore automatic time. | Defined instant/local semantics; no duplicate old registration or surprising early action. |
| [ ] | REM-22 | Open Alarm & Reminder Health before/after create, deliver, failure and retry. | Upcoming/registered/inexact/queued/failed/outcome counts reflect their actual meanings. |
| [ ] | REM-23 | Use offered permission/settings/retry/reschedule controls in Health. | Correct settings open; return refreshes; retry is bounded and idempotent. |
| [ ] | REM-24 | Acknowledge a reminder and inspect the linked task. | Reminder is received; task stays open until explicitly completed. |
| [ ] | REM-25 | Receive while Quick Chat is open or the floating control is visible. | Normal background path delivers once; retained app root does not also claim it. |

## 13. Incoming reminder calls

These are **simulated app calls**, not carrier calls. On the current privacy design, opening the main app's call UI from a secure lock screen requires normal Android unlock. Do not treat that unlock requirement as a defect.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | INC-01 | Receive in-app and native/background calls for the same test type. | Correct reminder title/owner; Answer/Decline are clear and usable. |
| [ ] | INC-02 | Let ring without answering; observe microphone indicator. | No microphone capture before explicit Answer/capture action. |
| [ ] | INC-03 | Answer; allow microphone on first request. | Permission-dialog pause is handled; permitted foreground audio starts without immediately ending. |
| [ ] | INC-04 | Deny/permanently deny mic, or disable system mic privacy toggle. | Buttons-only mode with clear reason; Acknowledge/Snooze/End remain usable. |
| [ ] | INC-05 | Tap Acknowledge, then inspect reminder and underlying task. | One acknowledgement; task not completed. |
| [ ] | INC-06 | Tap manual Snooze with each exposed interval. | Committed future due time; clear success only after save; task unchanged. |
| [ ] | INC-07 | Speak clear acknowledgement and “snooze for twenty five minutes”/“one hour.” | Correct whole-command interpretation within supported 1–120-minute range. |
| [ ] | INC-08 | Say “don't acknowledge,” “don't snooze,” “what does snooze mean?” and unrelated sentences. | No unintended acknowledgement/snooze from substring/fuzzy matching. |
| [ ] | INC-09 | Ask for zero, negative, 121+ minutes or unclear snooze duration. | Clarification/refusal; invalid explicit duration is not silently replaced by default. |
| [ ] | INC-10 | Decline; repeat using Back while ringing. | Existing automatic snooze/retry policy applies once; no task completion. |
| [ ] | INC-11 | Answer, then End/Back. | Current answered-call settlement matches displayed policy; no stale next call is closed. |
| [ ] | INC-12 | Leave ringing unanswered for 45 seconds. | Ring/notification stops at the deadline, subject to documented OS scheduling limits. |
| [ ] | INC-13 | **Regression:** after native 45-second timeout, open LAFINA about one minute later. | Same reminder does not ring again early; snoozed state persists until retry (default 5 minutes after cutoff). |
| [ ] | INC-14 | Keep an answered call active near 10 minutes. | Remaining-time warning appears in last minute; timeout applies bounded snooze policy, never auto-completes task. **Online call where you talked:** timeout ends the call as received (acknowledged), not snoozed. |
| [ ] | INC-15 | Queue several reminders; let one waiting entry exceed its 15-minute lease. | Expired queued request becomes missed; it does not ring as fresh much later. |
| [ ] | INC-16 | Tap Answer for a different queued notification while a call is active. | Active call stays coherent; later queued call rings and needs a fresh Answer. |
| [ ] | INC-17 | Rapidly Answer/Decline/Snooze/Acknowledge, including notification plus screen action. | One committed outcome; no duplicate speech or inconsistent state. |
| [ ] | INC-18 | Cancel/replace a reminder while its call or speech is active. | Old generation loses authority; late callbacks cannot affect successor. |
| [ ] | INC-19 | Kill process during ringing/answer/snooze; reopen. | Durable recovery preserves identity; never auto-answers or restarts microphone. |
| [ ] | INC-20 | Lock securely; open reminder notification; cancel unlock, then unlock normally. | No main-app notes/chat/profile visible above keyguard; cancellation preserves privacy. |
| [ ] | INC-21 | Allow/deny lock-screen notification previews in Android Settings. | Display follows the device privacy policy; document visible reminder text. |
| [ ] | INC-22 | Answer offline with Whisper unavailable/busy; repeat with silence/noise. | Engine error gives manual fallback; only genuine unsuccessful captures count toward bounded attempts. |
| [ ] | INC-23 | Answer online while entitled; then disconnect mid-conversation. | Clear fallback/manual controls; initial reminder announcement is not spoken twice. |
| [ ] | INC-24 | Ask an online call to snooze at a limit or during controlled save failure. | Tool reports actual refusal/failure; no premature “snoozed” success; controls stay usable. |
| [ ] | INC-25 | Prepare a new task/event during an answered reminder conversation; ask a read-only question meanwhile. | Draft requires confirmation; read does not overwrite it or settle the reminder accidentally. |
| [ ] | INC-26 | Switch account/sign out while a call is pending or answered. | Old call/audio/queue cannot appear or mutate the next owner's data. |
| [ ] | INC-27 | Use Bluetooth/wired output; change volume/route and take a real phone call. | Audio focus and recovery are safe; no overlapping mic owner or orphan ringtone. |
| [ ] | INC-28 | **Online call look:** signed in, Online Mode on, internet on. Let a reminder ring, then Answer. | Ringing screen says “Talk with LAFINA” under Answer. Answered screen looks like Call LAFINA (avatar ring, timer, waveform, Mute / Type / Stop / End). **No Acknowledge or Snooze buttons.** LAFINA says the reminder once, then “Need more time? Just tell me when to call you back…”. |
| [ ] | INC-29 | In an online call, say “call me back in 20 minutes” (or type it after tapping Type). | Call ends with “Reminder snoozed”; reminder rings again about 20 minutes later; task unchanged. Saying “remind me later” with no length uses your usual snooze length from Preferences. |
| [ ] | INC-30 | In an online call, say “okay, got it, thanks”; repeat on another call by just tapping End. | Both end with “Reminder acknowledged”; task is **not** marked done. |
| [ ] | INC-31 | **Offline call keeps buttons:** turn Online Mode off (or use guest mode, or airplane mode), let a reminder ring, Answer. | Ringing screen says “Hear the reminder”; answered screen shows Acknowledge, Snooze and the 5/10/15/30m chips exactly as before. |
| [ ] | INC-32 | Online call fallbacks: (a) choose “Use offline voice” in the first-time disclosure, (b) deny the microphone, (c) turn on airplane mode mid-call. | Each case switches to the offline call screen with Acknowledge and Snooze available; (c) also resumes offline voice when the app is on screen. |
| [ ] | INC-33 | Online call, stay silent for about 2 minutes. | Conversation stops for inactivity and the screen switches to the offline call with Acknowledge and Snooze. |

## 14. Offline speech capture and intent models

The current native build may have **no `lafina_llama` engine**. An unavailable model must be labeled unavailable and its Download/Use controls disabled. Fast-Path Only and manual text remain valid. Do not report a real SmolLM2/Gemma inference pass from a downloaded file or a regex response.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | STT-01 | In airplane mode, hold the AI mic, speak a simple scheduling command, release. | Local Whisper transcript/flow works; visible recording/transcribing states end. |
| [ ] | STT-02 | Slide to cancel; use explicit Cancel; release outside button. | Cancelled audio is not submitted or saved as an action. |
| [ ] | STT-03 | Give short, long, quiet, noisy and silent input. | No invented action; bounded processing; errors/no speech explained. |
| [ ] | STT-04 | Test normal English accent and natural Filipino/Taglish speech. | Record actual transcript accuracy and limitations; do not assume multilingual support from UI language. |
| [ ] | STT-05 | Speak titles/numbers/dates including 12 AM/PM and similar-sounding course names. | Critical transcript fields are inspectable before confirming any write. |
| [ ] | STT-06 | Deny then grant mic; revoke during capture; retry after restoring. | Capture stops safely and recovers; text controls remain available. |
| [ ] | STT-07 | Leave app, lock, rotate if supported, or receive a call during capture/transcription. | Recording stops or follows explicit supported lifecycle; no hidden background capture. |
| [ ] | STT-08 | Start capture while another LAFINA speech/recording session owns mic. | One owner or clear busy message; no cross-session transcript. |
| [ ] | STT-09 | Repeat 20 capture/cancel cycles; inspect Android mic indicator afterward. | No leaked mic, stuck service or steadily growing delay. |
| [ ] | NLU-01 | Select Fast-Path Only and run the command guide offline. | Supported deterministic commands work without a model or network. |
| [ ] | NLU-02 | Open model choices in onboarding, AI Engine and Preferences. | Recommendation/status agrees across all surfaces; missing native engine is clearly disclosed. |
| [ ] | NLU-03 | Conditional: supported engine build, select each compatible downloaded model. | Actual model becomes active for that owner; unsupported/OOM models fail safely. |
| [ ] | NLU-04 | Conditional: download a supported model on Wi-Fi; leave screen and inspect progress elsewhere. | One shared job; truthful byte/progress/readiness state. |
| [ ] | NLU-05 | Conditional: cancel/interruption/low space/truncated download; retry. | Incomplete file never becomes “ready”; only affected temporary file is removed. |
| [ ] | NLU-06 | Conditional: start download from both UIs quickly. | Only one global download; cancel cannot delete another completed model. |
| [ ] | NLU-07 | Conditional: remove active model, relaunch and issue a command offline. | Clear fallback to supported path; no false model inference label. |
| [ ] | NLU-08 | Switch users with different model selections, including during a download. | Selection/inference respects active owner; late completion cannot select for another owner. |
| [ ] | NLU-09 | Submit casual chat, ambiguous Taglish and unsupported commands offline. | Clarification/help rather than fabricated default task or unintended write. |

## 15. AI chat, commands and reviewed changes

Run every write case through **typed AI chat**, and repeat representative create/edit/delete flows through offline voice, live Call LAFINA and Quick Chat where supported. Low-risk task completion/pinning may apply immediately with Undo; creation, editing and deletion must follow their explicit review contract.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | CHAT-01 | Send blank/whitespace, multiline, Unicode and maximum-length input. | Empty send disabled; bounds clear; composer remains usable. |
| [ ] | CHAT-02 | Ask today's/tomorrow's schedule, to-do list, overdue tasks, notes and free study time offline. | Answers reflect actual local data, including undated tasks and note checklists. |
| [ ] | CHAT-03 | Open “What can you ask?”; tap each example. | Inserts draft only; never sends or saves automatically. |
| [ ] | CHAT-04 | “Add task Submit lab report tomorrow at 5pm.” | Correct task review; no stored task before Confirm. |
| [ ] | CHAT-05 | “Add Buy lab manual to my to-do list.” | Undated To-Do review; no invented time. |
| [ ] | CHAT-06 | “Add study block for Physics tomorrow from 2pm to 4pm.” | Correct block/day/duration and review. |
| [ ] | CHAT-07 | “Schedule capstone meeting tomorrow at 5 PM for an hour.” | Event review 5–6 PM; title is concise, without conversational filler. |
| [ ] | CHAT-08 | “Remind me on Friday at 9am to bring my school ID.” | Correct local Friday/time; Call me/Notify only choice is honored. |
| [ ] | CHAT-09 | “Take a note: questions for my thesis adviser.” | Note review contains intended content; no automatic save. |
| [ ] | CHAT-10 | Create/read/toggle an alarm by a clear explicit request. | Alarm review/data, not a task or synced reminder. |
| [ ] | CHAT-11 | Update title/time of an existing task/event/block/note. | Explicit target; all unrelated fields retained. |
| [ ] | CHAT-12 | Delete a named fixture task/note/event where supported; cancel, then retry/confirm. | No deletion before confirmation; only intended item deleted. |
| [ ] | CHAT-13 | Request deletion with ambiguous duplicate titles. | Ask which record; never remove all matches silently. |
| [ ] | CHAT-14 | Complete/reopen a task; pin/unpin a note; use Undo if offered. | Accurate low-risk outcome; Undo restores correct prior state. |
| [ ] | CHAT-15 | Open a review, Edit title/date/start/end/category/details and delivery style. | Displayed revision is exactly what Confirm commits. |
| [ ] | CHAT-16 | Cancel review; edit source request and submit again. | Nothing saved by Cancel; reusable text retained according to UI; new card replaces safely. |
| [ ] | CHAT-17 | Double-tap Confirm; confirm via text immediately after tapping. | One operation/item and honest “already handled” behavior. |
| [ ] | CHAT-18 | Leave a card until expired; change/delete its target elsewhere, then Confirm. | Expired/stale/missing-target refusal; no wrong write. |
| [ ] | CHAT-19 | Ask “schedule a meeting” without necessary details; supply missing fields later. | Clarification or visible assumptions; no invented hidden time. |
| [ ] | CHAT-20 | Use “yes, but change it to 6 PM,” negation and “cancel that, do not create it.” | Revision/cancellation rather than premature save. |
| [ ] | CHAT-21 | With card open ask a read-only question, then reply casually “ok.” | Read does not modify card; unrelated bare “ok” cannot approve an older proposal. |
| [ ] | CHAT-22 | Switch/new chat with a card pending; send “yes” in the new chat. | Old card is invalidated/scoped; new conversation cannot confirm it. |
| [ ] | CHAT-23 | Request event plus separate reminder/note/task in one turn. | All supported items appear in group review or clarification; none disappear into title. |
| [ ] | CHAT-24 | Confirm/cancel grouped actions; trigger a controlled failure in one step. | Displayed atomic/partial policy is truthful; no hidden partial success or duplicate retry. |
| [ ] | CHAT-25 | Schedule into a busy interval; inspect conflicts and alternate slots. | Conflict/alternative times match local data; choosing alternative updates review before save. |
| [ ] | CHAT-26 | Try yesterday, November 31, February 30, leap day, year-end and month/day without year. | Invalid dates refused; past/roll-forward assumptions visible; no silent calendar rollover. |
| [ ] | CHAT-27 | Use “tomorrow,” next weekday, “later,” duration and natural Taglish. | Actual resolved date/title shown; ambiguity handled safely. |
| [ ] | CHAT-28 | Turn Online Mode on/off as guest and signed-in user; send a general question. | Guest/cloud gates correct; cloud is only used after explicit allowed mode. |
| [ ] | CHAT-29 | Observe streamed online reply; disconnect midway, reconnect and retry. | No duplicated bubbles/late stale answer or false save; loading ends with clear recovery. |
| [ ] | CHAT-30 | Rapid-send, navigate away, switch account or cancel while reply/tool runs. | Busy guards; late results cannot overwrite another chat/account or apply actions. |
| [ ] | CHAT-31 | Ask to read private data from another account or change data using quoted malicious note text. | No cross-owner access or instruction execution from stored content. |
| [ ] | CHAT-32 | Ask for unsupported business/Gmail/portal/wake-word/autonomous behavior. | Honest limitation; no fabricated integration or background action. |
| [ ] | CHAT-33 | Compare Markdown Chat Replies on/off, Detailed AI Summaries on/off and spoken readback. | Formatting matches setting; speech is natural and avoids raw Markdown/control syntax. |
| [ ] | CHAT-34 | Use camera/gallery schedule scanning from composer and history shortcuts. | Explicit picker/capture; parsed schedule requires review; cancellation/unsupported capture is explained. |
| [ ] | CHAT-35 | Scan blurry/empty/unrelated/synthetic schedule images; disconnect during any online parsing. | No invented saved schedule; errors retain manual text/planner access. |

## 16. Chat history, drafts and memory

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | HIST-01 | Start several general and USTP conversations; relaunch. | Correct session grouping/title/preview; saved messages persist for current owner. |
| [ ] | HIST-02 | Search history by known text; filter All/General/USTP; expand/collapse history. | Accurate results and current-chat highlight; empty states clear. |
| [ ] | HIST-03 | Rename chat, including blank/long/Unicode title. | Defined title rules; correct session updated once. |
| [ ] | HIST-04 | Delete inactive and current chats, first cancelling. | Cancel retains; confirmed deletion removes only selected history/owned attachments. |
| [ ] | HIST-05 | Try switching/deleting active chat during a streamed reply. | Busy policy is explicit; late content cannot land in another conversation. |
| [ ] | HIST-06 | Load earlier messages beyond first page; scroll between old and newest. | Stable ordering; no missing/duplicate messages or jumpy forced scrolling. |
| [ ] | HIST-07 | Create temporary chat, exchange messages and exit/end it. | Temporary transcript is not added to persistent history. |
| [ ] | HIST-08 | Use a temporary chat to prepare/cancel and explicitly confirm a planner item. | Transcript privacy does not prevent deliberate confirmed planner save; no save on Cancel. |
| [ ] | HIST-09 | Switch tabs with unsent text; choose Keep, Discard and Cancel where offered. | Each action follows wording; draft survives intended return. |
| [ ] | HIST-10 | Close/kill/relaunch with an unsent draft; switch account. | Advertised persistence works; no previous-owner draft shown. |
| [ ] | HIST-11 | Insert guide/scanning text into a nonempty draft; choose replace/cancel. | No silent replacement. |
| [ ] | MEM-01 | Add an explicit memory in Profile → Memory; reopen/relaunch. | Correct owner-scoped memory retained; no duplicate blank memory. |
| [ ] | MEM-02 | Ask Chat/Call to remember a synthetic preference; review, Cancel, then Confirm. | Only confirmed fact is stored; no private inference silently saved. |
| [ ] | MEM-03 | Ask for a reply using that memory; then disable memory and ask again. | Enabled memory used appropriately; disabled memory no longer informs new replies. |
| [ ] | MEM-04 | Delete one memory; Forget all with Cancel then confirm. | Only requested data removed; planner records remain. |
| [ ] | MEM-05 | Use memory Undo where offered; read memories through supported AI path. | Exact prior fact restored/read; no unrelated personal data. |
| [ ] | MEM-06 | Change onboarding name/tone/study preference; compare explicit memory and scheduling preferences. | Correct purpose/scope; changing one does not silently rewrite unrelated settings. |
| [ ] | MEM-07 | Event Defaults: enter valid/invalid start time, duration and expiry; review/save/cancel. | Validation and explicit confirmation; selected expiration honored. |
| [ ] | MEM-08 | Forget default start, length and all defaults separately; let a short expiry elapse. | Only chosen/expired defaults stop applying; existing saved events stay intact. |
| [ ] | MEM-09 | Switch QA accounts with memories/defaults pending; sync if supported. | No cross-owner fact, stale confirmation or unintended cloud sharing. |

## 17. USTP handbook and citations

Use the bundled **USTP Student Handbook 2023 Edition** as the comparison source, not memory or a plausible AI answer. Chat's local pack and Call LAFINA's server index may differ; record the source/version instead of assuming identical answers.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | RAG-01 | Try USTP chat before COR confirmation and in scheduling-only mode. | Eligibility gate is truthful; ordinary planning/chat remains usable. |
| [ ] | RAG-02 | With confirmed USTP setup, open dedicated Handbook chat offline. | Local handbook works if pack/index available; mode is visibly distinct. |
| [ ] | RAG-03 | Ask grading/passing grade, INC completion, attendance, retention and shifting questions. | Relevant passage and correct policy details, page and section. |
| [ ] | RAG-04 | Ask tuition/fees, Dean's List/GWA, NSTP, cheating and leave-of-absence questions. | Correct evidence or explicit uncertainty; scrutinize ranking, especially GWA/NSTP. |
| [ ] | RAG-05 | Ask equivalent English/Filipino/Taglish policy questions. | Relevant evidence when supported; no fabricated policy to fill language gaps. |
| [ ] | RAG-06 | Open each citation/source action and compare key claims to source. | Page/chapter/excerpt supports the answer; navigation or fallback makes source inspectable. |
| [ ] | RAG-07 | Ask photosynthesis, weather, a poem, laptop advice and simple algebra in USTP chat. | No unrelated handbook passage labeled as evidence. |
| [ ] | RAG-08 | Ask an absent/uncertain policy or recent rule beyond the 2023 source. | Explicit insufficient evidence/version limitation; no invented current university rule. |
| [ ] | RAG-09 | Ask INC policy, then a short follow-up; repeat after an unrelated question. | Context merges only with relevant handbook turn; unrelated previous topic is not borrowed. |
| [ ] | RAG-10 | Ask “my schedule tomorrow and the USTP attendance policy.” | Both parts answered or limitation explicit; neither silently dropped. |
| [ ] | RAG-11 | Ask a personal planner question mentioning GPA/tuition/absences; create “pay tuition” reminder. | Personal request stays on correct route; no unrelated handbook hijack. |
| [ ] | RAG-12 | Ask a normal general-chat/reminder-call question. | No unrequested handbook excerpts/citation label. |
| [ ] | RAG-13 | Enable online USTP chat and compare citations with offline source. | Reply only claims evidence it used; provenance remains accurate. |
| [ ] | RAG-14 | Disconnect, deny auth/entitlement, or use a controlled missing-index/pack build. | Clear limitation/local fallback; manual planner unaffected. |
| [ ] | RAG-15 | Ask a malicious instruction embedded in a quoted “handbook passage.” | Treated as untrusted content; no data deletion, account exposure or fabricated authority. |
| [ ] | RAG-16 | Save/reopen USTP conversation and citations after restart. | Source labels retained; history remains isolated from general/temporary chats and other owners. |

## 18. Call LAFINA live conversation

Requires a supported signed-in QA account, working backend/ElevenLabs configuration and explicit Online Mode. Start a **new** call after backend/voice configuration changes. This outbound live conversation is distinct from incoming reminder calls.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | LIVE-01 | Open from AI Call button; try guest/offline/denied entitlement first. | Honest prerequisite state; typed/manual app remains usable. |
| [ ] | LIVE-02 | Start online; allow mic at first request. | One connecting/connected session; permission dialog does not cause a false background hangup. |
| [ ] | LIVE-03 | Have ordinary conversation, pause mid-sentence and make a correction. | Natural turn handling; no repeated greeting or premature action. |
| [ ] | LIVE-04 | Speak English and normal mixed-language phrases. | Record actual recognition/response quality; wrong fields always remain reviewable. |
| [ ] | LIVE-05 | Watch waveform/avatar in speech, silence, playback and mute. | Appropriate live motion; microphone input does not animate when muted. |
| [ ] | LIVE-06 | Interrupt a long spoken reply twice; Stop during speech/tool processing. | Old audio stops and stays stopped; no late card/audio overwrites the new turn. |
| [ ] | LIVE-07 | Type into call while mic denied/muted; send a correction. | Typed path remains functional; no hidden unmute. |
| [ ] | LIVE-08 | Ask agenda, to-dos, note search, memory, alarms and free time. | Correct local results/cards with usable View/Open navigation. |
| [ ] | LIVE-09 | Create task/event/block/reminder/note/alarm; inspect before Confirm. | Each supported action has correct card; no write before explicit confirmation. |
| [ ] | LIVE-10 | “Schedule a capstone meeting” then supply missing date/time/duration. | Clarification, concise title and disclosed assumptions. |
| [ ] | LIVE-11 | With draft open: ask schedule, then say “yes, but move it to 6 PM.” | Read does not overwrite; revision does not prematurely save. |
| [ ] | LIVE-12 | Change only time on recurring event/high-priority task with location/reminder. | Priority, recurrence, duration policy, location and delivery retained correctly. |
| [ ] | LIVE-13 | Confirm by voice/button; rapidly repeat; read it back and open actual record. | One save with displayed fields; spoken success only after commit. |
| [ ] | LIVE-14 | Cancel/negate action; ask to delete a named fixture using own words. | Cancellation safe; deletion follows review; model-created fields cannot silently delete. |
| [ ] | LIVE-15 | Request two or more separate items; confirm/cancel group. | Complete visible group or clarification; no lost second item/duplicate action. |
| [ ] | LIVE-16 | Minimize, use other LAFINA tabs, restore via mini bar and follow a result link. | One session/timer; correct destination; pending review comes forward as designed. |
| [ ] | LIVE-17 | Minimize an idle/not-started panel, reenter AI with Start with Call enabled. | No stuck invisible owner; auto-entry works without duplicate live sessions. |
| [ ] | LIVE-18 | End, reopen and start again; repeat rapid Start/End. | Old transcript/draft/audio/timer does not leak; microphone releases. |
| [ ] | LIVE-19 | Leave app/lock, receive reminder, sign out or withdraw Online Mode. | Actual audio owner stops/preempts safely; no unauthorized background microphone. |
| [ ] | LIVE-20 | Disconnect mid-answer, mid-draft and during tool call; reconnect. | Clear recovery; no false success, stuck spinner or late stale write. |
| [ ] | LIVE-21 | Use mic denial, system privacy toggle, another recorder and real call audio focus. | Specific failure/fallback; later generic errors do not obscure actual cause. |
| [ ] | LIVE-22 | Change speaker/headset/Bluetooth route; listen for echo/self-trigger. | Usable audio; no response loop to LAFINA's own speech. |
| [ ] | LIVE-23 | Change language, brief/detailed style and normal/patient pace in settings. | Choices persist; any “next call” requirement honored and visible. |
| [ ] | LIVE-24 | Change caption size, connection/end haptics, tool audio and Start with Call. | Each setting has intended independent effect; no unsolicited mic start on mere tab entry. |
| [ ] | LIVE-25 | Browse/preview/select voice; Stop preview; open settings during active call. | One audio source; correct selection and active-call limitation. |
| [ ] | LIVE-26 | Let a slow response run; use small screen/keyboard/large captions/reduced motion. | Timer, End, Type and card buttons remain reachable; no giant blank/clipped area. |
| [ ] | LIVE-27 | Ask snooze outside an incoming reminder call. | No arbitrary reminder is snoozed; limitation is explained. |
| [ ] | LIVE-28 | Conditional: use controlled expired session/quota/provider failure. | Honest error and retry path; no fabricated conversation success. |

## 19. Offline and online spoken output

Local speech uses **`react-native-tts` and an installed Android voice**. Online speech uses the selected entitled ElevenLabs path only in explicit Online Mode, with local/visual fallback. No Kokoro download or engine should be requested.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | TTS-01 | Profile → Test TTS Voice, then Offline Voice preview in airplane mode. | Audible local speech when a downloaded system voice is installed. |
| [ ] | TTS-02 | Inspect engine, English availability and listed offline voices. | Real device voices/status; network-required voices are not mislabeled offline. |
| [ ] | TTS-03 | Select each usable offline voice; change rate/pitch; preview/relaunch. | Correct persistent selection and audible settings. |
| [ ] | TTS-04 | Reset speech settings; open Android TTS settings from offered control. | Defaults restored; correct system screen; refreshed status after returning. |
| [ ] | TTS-05 | Remove English voice/use a phone without TTS; run test, reminder and briefing. | Helpful install/settings guidance; visual/manual flow still works. |
| [ ] | TTS-06 | Stop preview; rapidly switch voices/start another utterance. | Previous queue stops; no overlapping or late stale speech. |
| [ ] | TTS-07 | Speak long text, punctuation, numbers, times, Filipino names and formatted AI reply. | Intelligible output; no raw Markdown/tool metadata or spelling of control syntax. |
| [ ] | TTS-08 | Change media/alarm/call volumes and use silent/DND separately. | Record actual stream behavior; no false claim that speech bypasses OS volume policy. |
| [ ] | TTS-09 | Switch Bluetooth/wired/speaker during speech; interrupt with real call/media. | Audio focus/route handled safely; End/Stop silences output. |
| [ ] | TTS-10 | Sign in, enable Online Mode, open Online Voice · ElevenLabs. | Capabilities/catalog load for allowed account; guest/error states truthful. |
| [ ] | TTS-11 | Browse Filipino/More groups, preview/select default and another voice. | Correct current selection/preview; no duplicate playback. |
| [ ] | TTS-12 | Relaunch; use selected online voice in supported speech/call flows. | Intended voice persists for correct owner; surface-specific limitations clear. |
| [ ] | TTS-13 | Disable Online Mode and ask for speech; repeat as guest. | No unauthorized cloud speech; local/visual fallback works. |
| [ ] | TTS-14 | Disconnect during cloud TTS; test quota/auth/provider rejection on controlled account. | Automatic local fallback or readable silent UI; no endless loading or success-before-audio claim. |
| [ ] | TTS-15 | Remove local voice too, then trigger cloud failure. | Text/call buttons remain usable even when both speech paths fail. |
| [ ] | TTS-16 | End/leave/switch owner during speech download/playback. | Old owner's speech never resumes in the next screen/session. |

## 20. Profile, preferences, privacy and data reset

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | PROF-01 | Open Profile after guest/sign-in/COR changes. | Correct identity, school details/subjects and account state. |
| [ ] | PROF-02 | Randomize character avatar repeatedly; relaunch and switch owners. | Intended avatar persists; no previous-owner image. |
| [ ] | PROF-03 | Choose photo, cancel picker, replace/remove photo, switch back to character. | Correct preview/durable app copy; cancellation keeps old avatar. |
| [ ] | PROF-04 | Open Profile statistics/detail modal against known fixtures. | Task/completed/overdue/notes/class-session counts and overnight block minutes are correct. |
| [ ] | PROF-05 | Toggle theme by shortcut and setting; select every Modern palette and Classic/Modern interface. | Whole app updates coherently; persisted after relaunch. |
| [ ] | PROF-06 | Open Scheduling & Reminder Preferences; change wake/sleep times. | Save persists valid values; no automatic alarm implied by routine preference alone. |
| [ ] | PROF-07 | Set peak study hours, busiest day, weekly class load and longest class gap. | Saved selections persist and relevant advice uses them consistently. |
| [ ] | PROF-08 | Change lead time and call response/snooze tendency; create fresh linked reminders. | Intended new-reminder behavior reflects saved preferences; old alerts follow documented reschedule policy. |
| [ ] | PROF-09 | Toggle Adaptive timing; compare repeated synthetic scheduling scenarios. | Enabled/disabled state persists; no claim of learned accuracy without measurements. |
| [ ] | PROF-10 | Navigate Back without saving, then explicitly Save Preferences. | Discard/retention behavior follows UI; no false “saved” on failure. |
| [ ] | PROF-11 | Inspect offline-AI controls and Check Reminder Permissions here. | Same capability/download status as AI Engine; correct permission screen/status refresh. |
| [ ] | PROF-12 | Read Privacy Policy and all feature consent/help sheets. | Readable/scrollable; speech/cloud/overlay/recording statements match observed use. |
| [ ] | PROF-13 | Open Clear All Data, Cancel; check every fixture type. | Nothing is removed. |
| [ ] | PROF-14 | On disposable QA data, confirm Clear All Data and inspect its result. | Only explicitly described active-account scope cleared; result lists actual success/failure. |
| [ ] | PROF-15 | After reset inspect alarms, reminders, notes/images, memory, chats, pending cards and recording files. | Applicable cleanup/reconciliation complete; no stale alert, speech or old private content. |
| [ ] | PROF-16 | Open reset confirmation as QA-A; change account/screen/session before accepting stale dialog. | Stale authority refused; QA-B and QA-A data not silently erased. |
| [ ] | PROF-17 | Conditional: interrupt/reset with an injected storage/native-cleanup failure. | Honest partial/error result and recovery; no “all cleared” when steps failed. |
| [ ] | PROF-18 | Relaunch and sync after local reset with a dedicated cloud QA account. | Matches documented reset/cloud scope; no unadvertised server deletion or unexplained resurrection. |
| [ ] | PROF-19 | Use guest Create account, Sign out and account switching after Profile subpanels were open. | Panels close safely; no old-owner settings/dialog remains actionable. |

## 21. Cloud synchronization and account isolation

Use two installations on the same backend and dedicated QA accounts. Compare **profile, task, event, time_block, reminder, note and custom_category**. Alarms are intentionally device-local. Some auxiliary settings/files/history/memory may also be local-only; record their actual supported contract rather than assuming everything syncs.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | SYNC-01 | As guest, create/edit/delete offline, then connect. | Local work persists; no unauthorized cloud sync. |
| [ ] | SYNC-02 | Sign in as QA-A on both devices; create each of the seven entity types on device A. | Device B eventually receives each supported entity with correct fields/owner. |
| [ ] | SYNC-03 | Edit each type on B; sync/reopen A. | Bidirectional updates; no duplicate or field loss. |
| [ ] | SYNC-04 | Delete each type on A; sync B, restart and sync again. | Deletion remains deleted; no resurrection/duplicate tombstone effects. |
| [ ] | SYNC-05 | Create/edit/delete offline, kill/relaunch, reconnect. | Outbox survives; only final intended state synchronizes. |
| [ ] | SYNC-06 | Tap Force Sync repeatedly where exposed; background/resume while syncing. | One coherent worker; no duplicated mutation or stuck busy state. |
| [ ] | SYNC-07 | Disconnect during upload and during download, then retry. | Idempotent convergence; no partially visible corrupted batch. |
| [ ] | SYNC-08 | Change same record independently offline on A and B, then reconnect. | Defined conflict resolution/retention; no silent unrelated-field loss. |
| [ ] | SYNC-09 | Delete on A while editing offline on B; reconnect in both orders. | Defined delete/update conflict behavior; no uncontrolled resurrection. |
| [ ] | SYNC-10 | Create task plus linked reminder, recurring event and note/category together. | Relationships, recurrence and delivery style survive sync consistently. |
| [ ] | SYNC-11 | Sync overdue, completed, acknowledged, snoozed and cancelled records. | States retain semantics; reminder acknowledgement never completes task. |
| [ ] | SYNC-12 | Let a synced reminder reach due time on both devices. | Record supported multi-device policy; each device avoids duplicate local delivery. Do not assume global exactly-once ringing. |
| [ ] | SYNC-13 | Verify alarms and floating appearance on the second phone. | Device-local records/settings do not appear through seven-entity sync. |
| [ ] | SYNC-14 | Sync notes with images/avatar and inspect advertised attachment behavior. | Text/metadata accurate; unsupported file sync clearly distinguished from corrupt/missing-file success. |
| [ ] | SYNC-15 | Migrate/link guest data into a cloud QA account and repeat sync. | No duplicate original rows, orphan relationships or cross-account merging. |
| [ ] | SYNC-16 | Sign out/change owner while a sync request is in flight. | Late result cannot apply to new owner; queued previous-owner work stays isolated. |
| [ ] | SYNC-17 | Revoke session/change server during queued work; sign in correctly again. | Credentials tied to correct server/owner; local data preserved; recovery clear. |
| [ ] | SYNC-18 | Use connected Wi-Fi without internet, 429/5xx and controlled invalid batch response. | Backoff/retry and honest error; no empty-success wipe. |
| [ ] | SYNC-19 | Sync across different phone timezones and deliberately skewed QA clock. | Event instant/local-time metadata and conflict ordering follow documented semantics. |
| [ ] | SYNC-20 | Sync a large collection through multiple batches/pages; restart midway. | Complete convergence without lost/duplicate rows. |
| [ ] | SYNC-21 | Inspect Home/Schedule/Tools/Profile after remote changes while tabs were retained. | Correct UI refresh; no stale item detail write over newer content. |
| [ ] | SYNC-22 | Sign QA-B into a device previously used by QA-A; inspect all seven types and AI reads. | Zero previous-owner rows, outbox actions, alerts or summaries exposed. |

## 22. Floating LAFINA and Quick Chat

Current route: **Profile → Floating LAFINA**. Default is off. Current default appearance is an **edge bar**, with Bubble optional. Older reports calling every control a “red orb” predate appearance customization. This MVP uses typed Quick Chat; voice-in-panel, reading other apps and reboot auto-restore are not assumed supported.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | FLOAT-01 | Fresh install/update without previous opt-in; inspect setting and other apps. | No floating service/control or overlay request starts automatically. |
| [ ] | FLOAT-02 | Enable; read explainer; return from system settings without granting overlay access. | Setting stays off/permission-needed; no phantom running state. |
| [ ] | FLOAT-03 | Grant Display over other apps, return, press Home. | Edge bar/control appears outside LAFINA; persistent notification has Open/Hide. |
| [ ] | FLOAT-04 | Disable setting, then re-enable. | Control/service/notification stop and restart consistently. |
| [ ] | FLOAT-05 | Revoke overlay permission while enabled; return to Profile and use Allow. | Control disappears safely; truthful “Permission needed”; explainer/regrant works. |
| [ ] | FLOAT-06 | Tap edge bar; swipe inward; lightly brush vertically. | Tap/inward swipe opens Quick Chat; incidental vertical brush does not. |
| [ ] | FLOAT-07 | Long-press then drag edge bar; release near either edge. | Moves/clamps/snaps within safe bounds; saved side/vertical position. |
| [ ] | FLOAT-08 | Select Bubble; drag, tap and drag onto X. | Opens/moves/hides as advertised; hide removes notification until intended reactivation. |
| [ ] | FLOAT-09 | Notification → Hide/Open; visit main app after temporary hide. | Clear temporary-hide/reactivation behavior; Open works if OEM blocks overlay launch. |
| [ ] | FLOAT-10 | Change Style, every Size and Side; inspect preview and actual control. | Immediate matching look; adequate touch target; settings persist. |
| [ ] | FLOAT-11 | Change every idle opacity/color, including white and App theme. | Readable contrast/outline; selected value persists; idle fade behaves after about 3 seconds. |
| [ ] | FLOAT-12 | Enable Bubble Tuck; wait idle and tap visible half. | Half-tucked control remains reachable; tap opens directly. |
| [ ] | FLOAT-13 | Enable Lock position; try normal tap and long-press drag. | Tap opens; drag cannot move or accidentally launch. |
| [ ] | FLOAT-14 | Reset look; simulate controlled native save failure if available. | Defaults restore; failed setting reverts with notice instead of false preview. |
| [ ] | FLOAT-15 | Enable Hide in full-screen apps; open full-screen video/camera/game, then Home. | Control becomes invisible **and not touchable**, then returns; no blocked underlying touch. |
| [ ] | FLOAT-16 | Use another app/keyboard, including taps beside control and Android Back gesture. | Only control's hit area intercepts touches; edge gesture cancellation recovers safely. |
| [ ] | FLOAT-17 | Open LAFINA itself, permissions/banking screen, lock and unlock. | Hidden over main app/secure surfaces/lock screen; returns only where permitted. |
| [ ] | FLOAT-18 | Rotate/change display size/fold or enter multi-window where supported. | Position remaps inside safe bounds; no offscreen/lost control or crash. |
| [ ] | FLOAT-19 | Open Quick Chat over another app. | Dimmed background and focused composer; no underlying content is read/captured. |
| [ ] | FLOAT-20 | Press Back once/twice; tap scrim; close button. | Keyboard then panel closes as designed; original app stays unchanged. |
| [ ] | FLOAT-21 | Tap Schedule/Reminder/Note chip with empty/nonempty draft. | Inserts starter only; no automatic send/save or silent destructive replacement. |
| [ ] | FLOAT-22 | Offline: “add my networking exam this Friday at 9 AM”; inspect card. | Correct event/date/time; nothing saved before Confirm. |
| [ ] | FLOAT-23 | Confirm → Done; repeat using View in LAFINA. | One saved event and intended reminder; Done returns to prior app; View opens correct item/day. |
| [ ] | FLOAT-24 | Repeat note/reminder/task supported requests; use delivery choice/edit/cancel/Undo where offered. | Same review guarantees as main app; correct result visible without restart. |
| [ ] | FLOAT-25 | Double-send/double-confirm; close/reopen panel with review pending; Cancel afterward. | No duplicate; valid pending review retained in-process; source text recoverable on Cancel. |
| [ ] | FLOAT-26 | Tap scrim while a review is open; close explicitly and resume. | Review cannot be accidentally discarded by scrim; explicit close/resume follows UI. |
| [ ] | FLOAT-27 | Expire card, change target/session/owner or cold-start main app before confirming. | Stale card refused; no write into changed context. |
| [ ] | FLOAT-28 | Request complex multi-action workflow. | Supported simple action or clear Open LAFINA handoff; no silently missing steps. |
| [ ] | FLOAT-29 | Signed-in Online Mode on: general question; disconnect while processing; Stop if offered. | Reply/error/loading truthful; failed/cancelled work preserves text and drops late results. |
| [ ] | FLOAT-30 | Try general question as guest/offline/Online Mode off. | Correct local guidance/gating; no covert cloud call. |
| [ ] | FLOAT-31 | Inspect main Chat history/cards after Quick Chat exchanges; wait through transcript idle expiry. | Temporary panel transcript stays separate; intended expiry clears it, not saved planner data. |
| [ ] | FLOAT-32 | Reminder due while panel open; live reminder rings while control visible. | Background delivery once; control does not obstruct call or steal microphone. |
| [ ] | FLOAT-33 | Open main app while panel open; open panel in split screen. | Safe single-active-surface behavior; no duplicate roots/foreground delivery. |
| [ ] | FLOAT-34 | Remove from recents, kill process, low-memory restart, then force stop/reopen. | Record supported service recovery; never claims to survive Force stop. |
| [ ] | FLOAT-35 | Sign out/switch account with control/panel enabled. | Previous transcript/review cleared; service stops unless new owner explicitly enabled it. |
| [ ] | FLOAT-36 | Conditional: Android Go/low-RAM unsupported phone. | Clear unavailable state; no broken overlay enable path. |
| [ ] | FLOAT-37 | Conditional: OEM blocks background pop-up launch. | Accurate help/hint; notification Open provides usable fallback without fighting OS policy. |
| [ ] | FLOAT-38 | TalkBack open/move-left/move-right/hide; navigate panel/card/success. | Equivalent non-drag actions; labels/focus/reply announcements usable. |

## 23. Preserved document generation

**Reachability prerequisite:** retained code supports PDF, DOCX, XLSX and PPTX, but the current `ChatScreen` is not wired to `documentSkill`; its plus button opens camera/gallery schedule scanning. First record whether the tested build offers an authorized document route. If a required route is absent, record **BLOCKED — no document entry point** for generation cases. Existing attachment viewing can still be tested with a safe fixture. Do not assume that saying “make a PDF” proves a downloadable file was generated.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | DOC-01 | Search the shipped UI/help for the documented generation entry point. | Record reachable route or explicit feature gap; no false pass from retained code alone. |
| [ ] | DOC-02 | Conditional: generate small synthetic PDF, DOCX, XLSX and PPTX, individually. | Real nonempty file of requested format; truthful title/summary and attachment card. |
| [ ] | DOC-03 | Open each generated file in a compatible phone viewer. | File parses; expected text/table/slide content and filename/extension match. |
| [ ] | DOC-04 | Save/share attachment; cancel share; return to chat. | Android destination receives valid file; cancellation does not delete source/history. |
| [ ] | DOC-05 | Request blank, very long, unsupported-format or ambiguous content. | Clear validation/clarification; no malformed “successful” download. |
| [ ] | DOC-06 | Try guest, offline, Online Mode off and denied entitlement/quota. | Accurate cloud prerequisites and errors; no forced real purchase. |
| [ ] | DOC-07 | Disconnect during generation; retry/double-tap request. | Bounded recovery; no duplicate attachments/charges or false completion. |
| [ ] | DOC-08 | Reopen historical attachment after restart; test missing/invalid file fixture. | Valid file accessible; missing file gives clear recovery without crash. |
| [ ] | DOC-09 | Delete containing chat and switch accounts. | Owned temporary files cleaned appropriately; another user's files remain protected. |
| [ ] | DOC-10 | Test filename with spaces/Unicode; try a path-like generated filename fixture. | Safe filename/location; no write outside intended app/share storage. |

## 24. Preserved lecture and meeting recorder

**Reachability prerequisite:** `MeetingsScreen`, recording/transcription and cloud-notes code remain in the repository, but current `App.tsx`/Tools routes do not mount that screen. Record **BLOCKED — no recorder entry point** if the installed build has no approved route. Do not add a route or start recording as part of executing this documentation task. All recording cases require explicit user consent and synthetic/self-recorded audio.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | MEET-01 | Check for recorder route/help and its privacy notice. | Real reachable route or documented gap; local recording versus cloud notes explained. |
| [ ] | MEET-02 | Conditional: start recording with/without title and Keep audio choice. | Explicit mic consent; timer/status and recording foreground notification. |
| [ ] | MEET-03 | Pause/resume repeatedly; stop once and rapidly twice. | Correct duration/content; one final recording, no stuck mic. |
| [ ] | MEET-04 | Deny/revoke microphone; use system mic-off/another recording app. | Clear refusal/busy fallback; no silent recording. |
| [ ] | MEET-05 | Background/lock and return during recording. | Only explicitly supported foreground-service capture continues; visible notification and usable Stop. |
| [ ] | MEET-06 | Interrupt with real phone call, reminder or Call LAFINA. | Defined pause/stop/busy policy; one microphone owner and no damaged recording. |
| [ ] | MEET-07 | Kill/relaunch during recording/processing. | Recoverable entry labeled appropriately; no automatic mic restart. |
| [ ] | MEET-08 | Import supported short audio; cancel picker; try unsupported/corrupt/empty/oversized files. | Correct validation and original-file safety. |
| [ ] | MEET-09 | Transcribe offline using Whisper; include silence/noise/long audio. | Honest progress, transcript/timestamps or useful limitation; no invented text. |
| [ ] | MEET-10 | Cancel transcription; retry/resume supported recovery. | Finished work retained as described; no duplicate segments or stuck processing. |
| [ ] | MEET-11 | Search transcript, inspect segment order and replay audio where available. | Correct matches/timing; clear behavior if audio was not retained. |
| [ ] | MEET-12 | Generate online AI notes with explicit mode/account. | Uses intended transcript; truthful progress and structured result. |
| [ ] | MEET-13 | Test cloud notes offline/guest/denied quota/auth/provider failure. | Actionable error; local recording/transcript preserved. |
| [ ] | MEET-14 | Edit title/notes; inspect summary, decisions and action items where offered. | Correct changes persist; uncertain inferred content is not presented as a recording fact. |
| [ ] | MEET-15 | Convert an action item to a task through offered review. | Explicit confirmation; one correctly attributed task, no automatic hidden creation. |
| [ ] | MEET-16 | Export/share transcript/notes/audio with each offered format. | Valid output; cancellation safe; audio export only if retained. |
| [ ] | MEET-17 | Delete recording, first Cancel; inspect audio/transcript/files after confirm. | Correct owned cleanup; original imported file untouched. |
| [ ] | MEET-18 | Sign out/switch owner/reset while recording or processing. | Safe cleanup/fencing; no previous-owner audio/transcript/late notes exposed. |

## 25. App updates and developer controls

Update failure/integrity tests need a controlled QA update manifest/artifact, never a modified production release. Debug controls may intentionally be absent from a release build.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | UPD-01 | Profile → Check for Updates with no update, then offline. | Accurate up-to-date/error/unsupported state; no perpetual spinner. |
| [ ] | UPD-02 | Conditional: offer newer supported bundle/APK; inspect version, notes and size; choose Later. | Correct metadata; no unsolicited install/restart. |
| [ ] | UPD-03 | Download, cancel, interrupt network and retry. | Progress truthful; incomplete artifact not installable; old app usable. |
| [ ] | UPD-04 | Test wrong hash/signature/truncated/unsupported-native-version fixtures. | Unsafe/incompatible update refused; no corrupted launch or data reset. |
| [ ] | UPD-05 | Complete bundle update; choose Restart now and Later separately. | New JS applied only as advertised; durable data survives. |
| [ ] | UPD-06 | Install APK update; deny/allow “Install unknown apps,” cancel Android installer, then retry. | Permission/installer flow recoverable; no claim installed after cancellation. |
| [ ] | UPD-07 | Upgrade standalone app containing all fixture types and pending alerts. | Migration/attachments/accounts/settings preserved; native schedules reconciled once. |
| [ ] | UPD-08 | Conditional: failed new bundle startup and supported rollback path. | Safe recovery to valid app; no silent wipe or boot loop. |
| [ ] | DEV-01 | Inspect release build; enable Developer Mode via version taps only in intended QA/debug context. | Production restrictions respected; exposed diagnostic controls match build policy. |
| [ ] | DEV-02 | QA: Simulate Incoming Call Now and Schedule Native Alarm in 5s. | Intended single test alert; cancel/settle it and verify no residue. |
| [ ] | DEV-03 | QA: Test TTS, STT/NLU sandbox and inspect route/confidence output. | Diagnostics truthful; parsing alone does not mutate database. |
| [ ] | DEV-04 | QA: use Execute Action in Database on expendable fixtures. | Explicit guarded action/result; no unintended account/record changes. |
| [ ] | DEV-05 | QA: Seed Sample Student Data, inspect counts, remove seeded items. | Seeded scope recognizable; removal preserves manually created records. |
| [ ] | DEV-06 | QA: Force Cloud Sync and Refresh Counts. | Counts/outbox/delivery metrics reflect real state; no false native-delivery proof. |
| [ ] | DEV-07 | QA: replay tour/onboarding; toggle Developer Mode off. | Replay safe; diagnostic controls disappear as intended. |
| [ ] | DEV-08 | QA: switch Vercel/local backend and set private LAN address; cancel first. | Cancel unchanged; signed-in switch signs out old server; planner preserved. |
| [ ] | DEV-09 | QA: invalid/unreachable local URL; restore hosted server. | Useful validation/connection error; no credentials sent to unintended default host. |
| [ ] | DEV-10 | QA: USB reverse/local Wi-Fi connection with computer disconnected afterward. | Error explained; app's offline core continues; phone localhost is not mistaken for PC without routing. |

## 26. Accessibility, visual layout and interaction

Apply these checks to **every reachable screen, modal, sheet, editor, review card, picker handoff, error state and call state** above. Test populated and empty/loading/error states, not only the Home screen.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | UX-01 | Inspect Classic/Modern, light/dark and each exposed Modern palette. | Legible text/icons/placeholders, coherent contrast and visible selected/disabled states. |
| [ ] | UX-02 | Use smallest supported display and largest system display size. | Controls fit/scroll; no clipped Save/Confirm/End/Back. |
| [ ] | UX-03 | Increase font to 200%; open Quick Chat, alarms, call captions and long review. | Full titles/content reachable; no overlapping labels/buttons. |
| [ ] | UX-04 | Show keyboard in every editor/composer; focus last field. | Field and primary actions visible; no bottom-bar/keyboard obstruction. |
| [ ] | UX-05 | Test gesture and three-button navigation, cutout/status bar and keyboard insets. | Taps and content clear of system bars/cutouts. |
| [ ] | UX-06 | Use Back/predictive Back on each modal/picker/draft/call. | Expected hierarchy; no accidental save, hidden modal or stale overlay on another tab. |
| [ ] | UX-07 | Rotate/enter split screen where supported; fold/unfold where available. | Supported layout adapts; intentionally fixed orientation remains stable; no lost draft. |
| [ ] | UX-08 | TalkBack every main tab, header action and form. | Meaningful names/roles/states; selected tabs and validation errors announced. |
| [ ] | UX-09 | TalkBack all review cards and Confirm/Cancel/Edit/Undo; activate without sight. | Logical focus order; no unlabeled icon or unreachable primary action. |
| [ ] | UX-10 | Open/close modal with TalkBack and navigate background. | Focus goes inside and returns correctly; inactive retained screens are not exposed. |
| [ ] | UX-11 | Wait for streamed reply, save, success, timeout and error with TalkBack. | Useful announcements without repetitive flood or focus theft. |
| [ ] | UX-12 | Perform drag-based notes/categories/widgets/floating controls using available accessibility actions. | Equivalent non-drag control exists where required; gaps recorded explicitly. |
| [ ] | UX-13 | Turn system animations off/reduced motion on. | No unnecessary continuous wave/orb/transition motion; states still understandable. |
| [ ] | UX-14 | Operate one-handed; tap small icons and crowded calendar entries. | Reliable target area; destructive and confirm actions distinguishable. |
| [ ] | UX-15 | Test external keyboard/switch access if available. | Visible focus and predictable traversal; key actions operable. |
| [ ] | UX-16 | Use large Unicode/long titles and localization/date settings. | Wrapping/ellipsis does not hide critical time/status or make action ambiguous. |
| [ ] | UX-17 | Compare colored statuses in grayscale/high-contrast display. | Status also conveyed by text/icon, not color alone. |
| [ ] | UX-18 | Rapidly open/close sheets and switch tabs with a modal present. | No invisible touch blocker, double overlay or inaccessible app. |

## 27. Cross-feature interruptions, privacy and resilience

These tests complement individual flows. Use controlled QA fault fixtures for storage/provider failures; never fill or corrupt a personal phone/database to test recovery.

| Done | ID | Action on phone | Expected result |
| --- | --- | --- | --- |
| [ ] | SAFE-01 | Receive reminder while composing note/chat/COR review or editing alarm. | Draft preserved; reminder presented/queued safely; return remains usable. |
| [ ] | SAFE-02 | Receive reminder during live call, TTS, offline capture and conditional meeting recording. | Defined preemption/busy fallback; one actual microphone owner. |
| [ ] | SAFE-03 | Trigger alarm during reminder/live call and reverse the order. | Both settle safely; no orphan sound, stuck service or invisible active mic. |
| [ ] | SAFE-04 | Change account during AI reply, review, download, sync, image pick and native notification action. | Every late callback fenced; no cross-owner content/write. |
| [ ] | SAFE-05 | Turn off Online Mode mid-cloud conversation/request. | Cloud/audio session stops or is invalidated as designed; local/manual controls remain. |
| [ ] | SAFE-06 | Inspect Android mic indicator/Privacy Dashboard after End/Cancel/sign-out/lock. | No continuing capture outside explicitly permitted active operation. |
| [ ] | SAFE-07 | Inspect permissions list and floating behavior over another app. | No accessibility-service, contacts, Gmail, screen capture or other-app-reading dependency introduced. |
| [ ] | SAFE-08 | Lock securely while main app, note, chat or Quick Chat is visible; return via notification. | Normal keyguard protects private main-app content; floating panel not above lock. |
| [ ] | SAFE-09 | Observe app preview in recents and lock-screen notification contents. | Document actual exposed content and compare with privacy requirements; no unsupported privacy guarantee. |
| [ ] | SAFE-10 | Put instruction-like text in note/title/imported class and have AI read it. | Treated as data; no automatic delete/confirm/network/foreign-owner action. |
| [ ] | SAFE-11 | Conditional: deny storage write/full-disk fixture during save/Confirm/Snooze. | Truthful failure; no “saved/snoozed” claim or partially applied linked data. |
| [ ] | SAFE-12 | Free QA storage/clear fault, retry same operation, reopen offline. | One durable result; no silent loss or duplicate outbox/native schedule. |
| [ ] | SAFE-13 | Kill process immediately after Save/Confirm/Snooze and before UI success. | Reopen shows committed state or explicit failure; retry does not duplicate. |
| [ ] | SAFE-14 | Interrupt with permissions/settings screens and return repeatedly. | Correct foreground permission recheck; no false background cleanup of newly granted mic. |
| [ ] | SAFE-15 | Change automatic date/time/locale/timezone with app backgrounded. | Recomputed schedules/date labels; no corrupted due times or wrong-owner alert. |
| [ ] | SAFE-16 | Leave phone offline for a day with queued work, then reconnect. | Manual data persists; old alerts handled by defined policy; bounded synchronization. |
| [ ] | SAFE-17 | Inspect exported diagnostic logs/screenshots before sharing. | No tokens, secrets, real audio/COR or unnecessary private record content. |
| [ ] | SAFE-18 | Uninstall only disposable QA install, reinstall; inspect Android backup/restore if supported. | Reset/restore behavior documented; no unexpected previous-owner secret or alarm restoration. |

## 28. Performance and long-duration checks

Use a **standalone release-like build** for release claims. Record raw observations/failures, sample count, cold/warm condition and p50/p95/max; averages alone can hide failures. Debug/Metro numbers must be labeled. Goals below come from repository plans and are **targets, not achieved results**.

| Done | ID | Action / measurement | Evidence and expectation |
| --- | --- | --- | --- |
| [ ] | PERF-01 | Time cold startup and warm resume, at least 5 runs each. | Record usable-screen time and failures; suggested startup goal under 2 seconds on agreed reference device. |
| [ ] | PERF-02 | Time manual save and common offline command, at least 20 runs. | Save goal p50 <300 ms; speech-end to durable confirmation goal p50 <3 s; report actual data. |
| [ ] | PERF-03 | Measure offline TTS first audible audio cold/warm. | Goals cold median <1.5 s, warm <500 ms; distinguish callback timing from audible output. |
| [ ] | PERF-04 | Schedule at least 20 reminders/alarms across foreground/locked/background conditions. | Record each planned/actual time, drift, misses/duplicates and permissions. Reminder target ≥95% within 60 s applies only in supported conditions. |
| [ ] | PERF-05 | Live call: 20 ordinary exchanges and 20 scheduling turns on Wi-Fi, repeat mobile data. | First audio goals p50 ≤1.2 s/p95 ≤2.5 s; card goals p50 ≤2.5 s/p95 ≤5 s. Include failed/early turns. |
| [ ] | PERF-06 | Interrupt live speech repeatedly; measure onset to old audio silence. | Goals p50 ≤250 ms/p95 ≤500 ms; record late replay and failures. |
| [ ] | PERF-07 | Time floating control tap→panel warm/cold and leaving app→control. | Goals warm median ≤500 ms, cold ≤2.5 s, control return ≤300 ms; record real measurements. |
| [ ] | PERF-08 | Compare app memory/CPU with floating feature off/on and after repeated voice cycles. | Separate control/service overhead from whole resident process; no steady leak or unexpected periodic work. |
| [ ] | PERF-09 | Leave floating feature idle for 8 hours under controlled comparable conditions. | Record battery/CPU/wake locks and interruptions. Plan target <1%/24 h cannot be certified by short/noisy observation. |
| [ ] | PERF-10 | Browse large notes/tasks/chats/calendar collections and long transcript/handbook queries. | Record input/scroll/tab latency, memory and freezes; UI remains usable. |
| [ ] | PERF-11 | Run 30–60 minute mixed-use session, low battery and charging/warm-phone conditions. | No crash/ANR, runaway heat, stuck audio/notifications or progressive latency. |
| [ ] | PERF-12 | Measure model/APK/update storage use and failed-download cleanup. | Actual size/free-space behavior recorded; no abandoned large temporary files. |

## 29. Complete student journeys

These are final integrated checks, not substitutes for the individual cases. Use fresh distinctive fixtures so counts can be verified.

| Done | ID | Journey | Expected result |
| --- | --- | --- | --- |
| [ ] | E2E-01 | Airplane mode → guest → scheduling-only setup → task, event, note → relaunch. | Complete usable offline student planner; all saved records present. |
| [ ] | E2E-02 | USTP setup → COR review/fix/confirm → view classes → ask cited handbook question offline. | Correct class schedule and inspectable relevant source. |
| [ ] | E2E-03 | Offline voice request → review/edit → Confirm → background/lock → reminder Answer → Acknowledge. | One record/delivery; acknowledged reminder; underlying task still open. |
| [ ] | E2E-04 | Timed task → reminder → Snooze → kill/reopen → retry → explicitly complete task. | Durable snooze/retry; task completes only on explicit task action. |
| [ ] | E2E-05 | Create alarm with briefing → reboot/unlock → ring → Dismiss/open. | Native alarm and eligible local briefing work without cloud or mic. |
| [ ] | E2E-06 | Guest fixtures → create/link cloud QA account → sync second device → edit offline → reconnect. | Safe migration and bidirectional convergence without duplicates. |
| [ ] | E2E-07 | Signed-in Online Mode → live call → read agenda → prepare/revise/confirm → View item → End. | Correct navigation/data; no leftover mic/audio or duplicate write. |
| [ ] | E2E-08 | Enable floating edge bar → other app → Quick Chat create/confirm → Done → main app. | Other app unchanged; temporary transcript separate; planner refreshed. |
| [ ] | E2E-09 | Two simultaneous reminders → timeout first → reopen before retry → handle second/retry. | No early repeated first call, overwritten queue entry or cross-delivery outcome. |
| [ ] | E2E-10 | Long note/checklist/image → extract task → complete via To-Do → search/reopen after restart. | Durable consistent note/task relationship and attachment. |
| [ ] | E2E-11 | Switch QA-A→QA-B during pending review/sync/live/floating activity → inspect all tabs. | No QA-A private content/action/audio; QA-B remains usable. |
| [ ] | E2E-12 | Matching-signature update with fixtures/alerts → reopen offline → inspect and deliver next alert. | No data loss; native/JS compatibility and alert reconciliation verified. |
| [ ] | E2E-13 | Conditional: record/import audio → transcribe → cloud notes → reviewed task → export. | All preserved recorder stages work if exposed; otherwise explicit reachability blocker. |
| [ ] | E2E-14 | Conditional: generate requested document → open/share → restart → reopen attachment. | Real valid durable artifact if exposed; otherwise explicit reachability blocker. |

## 30. Results, defect template and completion gate

### Per-case results log

Add one row for every executed, blocked or N/A case. Keep the checklist unchecked for anything not passed. Include a separate row when a case passes on one phone and fails on another.

| Case ID | Device/build | Result | Actual observation | Evidence / defect | Retest |
| --- | --- | --- | --- | --- | --- |
| Example only: INC-13 | Fill in real device/build | NOT RUN | No observation yet | | |

### Defect report template

```markdown
### BUG-___ — short observed problem
- Case ID(s):
- Severity: data loss/privacy/unsafe write; blocked core flow; functional; visual/usability
- Device/Android/OEM/RAM:
- App version/versionCode/commit/APK hash; standalone or Metro:
- Account label/role; school setup; Online Mode/backend:
- Permissions, battery policy, network, locale/timezone:
- Preconditions and synthetic data:
- Exact steps:
  1.
  2.
- Expected:
- Actual:
- Reproduction rate (e.g. 3/5):
- Planned/actual delivery times and drift, if relevant:
- Screenshot/video/log path (redacted; no credentials/private audio):
- Recovery/workaround:
- Related report/case:
- Retest build/date/result:
```

### Completion gate

- [ ] Actual phone/build/permissions/network matrix recorded; emulator observations labeled separately.
- [ ] Every case has PASS/FAIL/BLOCKED/NOT RUN/N/A with reason; no blank treated as pass.
- [ ] Core offline text/manual creation, editing and reading work with mic/TTS/model/network denied.
- [ ] Real alarm/reminder/call/audio behavior observed on physical phone, including keyguard, timeout/retry and reboot.
- [ ] No unreviewed destructive write, data loss, cross-account content or microphone leak.
- [ ] Signed-in sync/online speech/chat/RAG exercised or explicitly still blocked.
- [ ] Floating permission, appearance, interaction, privacy and accessibility exercised or explicitly still blocked.
- [ ] Documents/recorder reachability decided; unavailable required routes remain explicit gaps.
- [ ] Accessibility, release-like performance and long-duration gaps reported honestly.
- [ ] Bugs retested on identified fixed build; remaining risks and exact untested cases listed.
- [ ] QA alarms/reminders/recordings/overlays cleaned up; normal clock/battery/accessibility settings restored.

**Status for this newly written checklist: NOT RUN.** Choose a truthful run status afterward: **AWAITING DEVICE VALIDATION** if required phone cases remain; **BLOCKED** with concrete missing prerequisite; or **READY FOR REVIEW** with evidence and remaining limitations. Automated test/build passes alone never close this manual gate. Follow the repository's existing phase approval rules when completing an implementation phase.

## 31. Coverage sources and known prerequisites

This checklist was assembled by inspecting current screen/component routes, storage/scheduler/AI/cloud modules, Android manifest and existing reports. It is a functional inventory of this checkout, not a promise that every retained capability has a shipped route. Recheck applicability whenever UI/routes/contracts change.

| Area | Primary source in this checkout |
| --- | --- |
| Scope and authorization boundaries | [AGENTS.md](../AGENTS.md); [AGY preservation authorization](plans/agy-improvements/OWNER-AUTHORIZATION.md) |
| Root routes and five tabs | [App.tsx](../App.tsx); [CustomTabBar](../src/ui/components/CustomTabBar.tsx) |
| Onboarding and COR | [OnboardingScreen](../src/ui/screens/OnboardingScreen.tsx); [CorReviewFlow](../src/ui/screens/onboarding/CorReviewFlow.tsx) |
| Planner/Home/Tools | [CalendarScreen](../src/ui/screens/calendar/CalendarScreen.tsx); [DashboardScreen](../src/ui/screens/dashboard/DashboardScreen.tsx); [NotesScreen](../src/ui/screens/notes/NotesScreen.tsx) |
| Profile/settings and actual entitlement behavior | [ProfileScreen](../src/ui/screens/ProfileScreen.tsx); [PreferencesSettingsScreen](../src/ui/screens/PreferencesSettingsScreen.tsx); [entitlements](../src/cloud/entitlements.ts) |
| Device-local alarms and five-tab change | [Alarm report](reports/alarms-and-tabs-report-2026-11-15.md); [ADR-034](decisions/ADR-034-device-local-alarms.md) |
| Call lifecycle and repeated timeout ring | [ADR-037](decisions/ADR-037-call-lifecycle-remediation.md); [2026-11-18 regression](reports/call-fix-followup-2026-11-18.md); [CALL-FIX-05](reports/phase-CALL-FIX-05-report.md) |
| Live voice detailed checks | [Call manual checks](reports/call-feature-remediation/MANUAL-CHECKS.md); [backend deployment follow-up](reports/call-feature-remediation/backend-deployment-follow-up.md) |
| Handbook relevance/model-engine limitations | [Audit fixes](reports/app-status-audit-2026-11-16-fixes.md); [RAG architecture](07-RAG-AND-ONLINE.md) |
| Floating baseline and appearance additions | [Floating test plan](plans/lafina-floating-assistant/06-TEST-PLAN.md); [FLOAT-07](reports/float-07-report.md); [appearance report](reports/float-orb-look-report.md) |
| Documents and recorder retained implementations | [documentSkill](../src/skills/documentSkill.ts); [MeetingsScreen](../src/ui/screens/meetings/MeetingsScreen.tsx); compare actual routing in App.tsx |
| Sync and Android access | [syncWorker](../src/sync/syncWorker.ts); [manifest](../android/app/src/main/AndroidManifest.xml) |
| Updates and benchmark targets | [updateService](../src/updates/updateService.ts); [QA/performance guidance](08-QA-AND-PERFORMANCE.md) |

Known prerequisites/gaps to carry into the first run:

- Test the **actual installed APK plus JS revision**. The shared working tree contains active uncommitted feature/fix work; an old APK/Metro session may not include it.
- The previous audit reports no built `lafina_llama` engine. Expect truthful unavailable state unless the tested APK explicitly includes a working native engine; model download and inference cases then become conditional.
- Document generation and meeting recording have retained implementations but no current main-app route found during this inventory. Their absence must remain a tracked capability gap where preservation is required.
- Separate Pro display helpers currently return false, while `student`, `student_pro` and `admin` pass local cloud entitlement checks. Test actual role/server responses; do not invent a purchase/subscription UI.
- Signed-in live services, a second device/account, safe error fixtures, TalkBack, OEM battery policies and long idle windows require real prerequisites. Mark unavailable coverage explicitly.
- Earlier phone evidence exists for some floating functions, but TalkBack, long-duration battery, release-like performance and the latest repeated-ring regression require build-specific retesting. Earlier reports are references, not blanket acceptance.
