# Existing behavior regression checklist

Captured before product edits, 2026-11-20. Source inspection is evidence of an existing contract, not a claim of successful device execution. Runtime results belong in AUDIT.md.

Audit notation: [x] means the source contract was checked and retained, with the relevant automated suite passing; it does not certify native hardware behavior. [ ] marks the explicit phone checks. All rows were reviewed individually.

## Navigation and ownership
- [x] Fourth bottom tab (`notes`) remains reachable; stored tab IDs, call navigation requests, entity resolution and account ownership are preserved.
- [x] Requests for `notesTab: alarms`, legacy `scheduleSection: alarms`, tasks and individual notes resolve to the correct page; unavailable/deleted/wrong-owner targets show an error.
- [x] Product tour can open each essential page, highlight its anchors, and restore the prior page after closing.
- [x] Retained tab state, account-keyed remounts and modal visibility boundaries remain effective.

## Alarms
- [x] List/grid display; add, edit, delete confirmation, enable/disable; new/saved alarm arrival highlight.
- [x] Hour/minute, one-shot date, repeat day bitmask, label (60-character limit), snooze, vibration, sound and optional morning briefing are preserved by AlarmEditorModal.
- [x] Up to 50 alarms per owner; invalid inputs fail without writes. Disabled and enabled alarms remain visible.
- [x] Weekly overview, enabled count, next alarm and time-until text use real local data and existing `nextAlarmTrigger`/`nextAlarm` functions, including 12/24-hour preferences.
- [ ] Notification/exact-alarm/full-screen permission notices open the appropriate settings; unavailable native delivery remains distinguishable.
- [ ] Existing `onAlarmsChanged` → alarm lifecycle reconciliation schedules/cancels Android AlarmManager bookings. Boot/time/timezone/package-change rescheduling and generation fences remain intact.
- [ ] Native ringing screen, sound/vibration, snooze/dismiss, one-shot consumption, native event drain and briefing after dismissal are unchanged. These require real device testing.

## To-do
- [x] Quick add title with cycling Medium → High → Low priority; blank title does not save.
- [x] Detailed editor: title, category, priority, notes, due date/time, save/edit/delete and validation.
- [x] All Open, undated To-Do, Scheduled, From Notes and Completed filters; pending count includes unchecked note checklist items.
- [x] Title/search matching, scheduled/date grouping and priority ordering; pagination/show more tasks.
- [x] Inline completion and reopening use the existing task store; highlighting a task opened from a call remains supported.
- [x] From Notes checkbox edits the existing note revision; opening the parent note returns to its existing editor. Completed note checklist items are filtered appropriately.
- [x] Due-date/time saves create linked reminders with the configured lead time; rescheduling retires previous linked reminders. Completing/deleting cancels delivery and active call; reopening may schedule a future reminder.
- [x] Reminder acknowledgement remains separate from task completion.

## Notes
- [x] All, AI Transcribed, Pinned, Personal, Work, Health, Learning and custom category filters; persisted `notes.selectedFilter` key and missing-category fallback.
- [x] SQL-backed search/indexing message, search retry, query error, pagination, grid/list and pinned-first ordering.
- [x] Create/open/edit/delete; untitled fallback; empty drafts do not create records. Text, original HTML, tags, category, pinned state, transcription flag and image remain preserved.
- [x] Rich-text/Markdown formatting, selection/newline continuation, checklist editing, image picker/attachment/removal and quick templates remain reachable.
- [x] Custom category add/rename/delete and colors; drag reorder only for the full unfiltered unpinned collection; order persistence and failure recovery.
- [x] Revision-checked saves/deletes and checklists; conflict keeps draft and offers save-as-copy; account/editor token fences retire stale callbacks.
- [x] Existing note editor actions (summarize, clean, extract tasks) remain wired. Source finding: summarize currently appends canned text after a timeout; cleanup/extraction are local heuristics. This pre-existing behavior is not used for new AI skills and is not represented as a real AI response.

## Storage, sync, assistant integrations
- [x] Existing `alarmsStore`, `tasksStore`, `notesStore`, `notesEditStore`, `notesQueryStore`, `useTodoData`, `useNotesData`, schema and migrations are not replaced.
- [x] Existing task/note/category writes retain transaction/outbox contracts and optional account sync; guest/offline data remains local and owner scoped. Alarms use their existing local schema/native registry.
- [x] Local fast-path/NLU executor, alarm review, chat agent tools, structured voice actions, command review, reminder calls and Quick Chat continue reading/writing the same entities through existing services.
- [x] Existing meeting pipeline, recorder microphone lease, processing/cancellation, recording import, transcript persistence and note/task review flows are reused.
- [x] Existing document AI endpoint and generated attachment sharing remain available; new entry points do not introduce a provider or embed keys.

Sources: `src/ui/screens/notes/{NotesScreen.tsx,hooks,components}`, `src/ui/screens/calendar/components/{AlarmsView,AlarmEditorModal}.tsx`, `src/storage/{alarmsStore,tasksStore,notesStore,notesEditStore,notesQueryStore,syncOutboxStore}.ts`, `src/scheduler/{alarmService,alarmSchedule,reminderAlarm}.ts`, `src/ai/{nlu,voiceActions,chatAgent.ts}`, `src/ui/navigation`, `src/ui/contexts/MeetingsContext.tsx`, `src/skills/{onlineChatSkill,documentSkill}.ts`, Android alarm/receiver/service classes.
