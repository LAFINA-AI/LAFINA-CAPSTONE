# PHASE 02 — Calendar, Tasks, Events, Time Blocks, Notes & Cloud Sync

> Read `AGENTS.md` first. Execute **only Phase 02** when approved.

## Objective

Migrate the full `LAFINA` student scheduling and note-taking experience (`CalendarScreen`, `NotesScreen`, calendar subcomponents, note markdown/rich-text editors, iCal `.ics` schedule import, recurring `rrule` expansion, conflict detection, adaptive free-slot suggestions, and custom categories) and verify end-to-end local SQLite persistence and bidirectional `/v1/sync/batch` synchronization with `LAFINA-backend`.

## Scope

1. **Calendar & Scheduling (`src/ui/screens/CalendarScreen.tsx`, `src/ui/components/calendar/`, `src/scheduler/`)**
   - Migrate `CalendarScreen` (Day timeline, Week strip, Month grid, Agenda/Tasks view, Event/Task/TimeBlock modals, iCal `.ics` import).
   - Migrate `conflictDetector.ts`, `freeSlotFinder.ts`, `recurrenceExpander.ts`, `scheduleOptimizer.ts`, `icalImporter.ts` (personal tasks/events/time_blocks only — no business tasks or work blocks).
2. **Notes & Custom Categories (`src/ui/screens/NotesScreen.tsx`, `src/ui/components/notes/`, `src/utils/`)**
   - Migrate `NotesScreen`, `NoteCard`, `NoteEditorModal`, `CategoryFilterBar`, `CategoryManagerModal`, `richText.ts`, `noteMarkdown.ts`, `noteEditing.ts`.
3. **App Shell Integration & Tests**
   - Connect `CalendarScreen` and `NotesScreen` in `App.tsx`.
   - Add unit and component tests for `CalendarScreen`, `NotesScreen`, iCal import, recurrence expansion, conflict detection, and `/v1/sync/batch` synchronization across all 7 personal entity types.
