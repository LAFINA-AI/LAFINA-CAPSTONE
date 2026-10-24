import {
  db,
  initDatabase,
  tasksStore,
  timeBlocksStore,
  notesStore,
  remindersStore,
  syncOutboxStore,
  userStore,
} from '../../src/storage';
import { guestMigration } from '../../src/storage/guestMigration';
import { generateIcsString, parseIcsString } from '../../src/storage/icsHelper';
import { getOccurrences, parseRrule } from '../../src/storage/rruleHelper';
import { GUEST_USER_ID } from '../../src/constants';

describe('Phase 02 Storage, Scheduling, Notes & Guest Migration', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM users');
  });

  describe('Tasks & Events Storage', () => {
    test('inserts, reads, updates, and soft-deletes a task with sync outbox tracking', () => {
      const taskId = 'task-test-1';
      tasksStore.insertTask({
        id: taskId,
        userId: 'student-1',
        title: 'Submit CS 101 Assignment',
        dueDate: '2026-10-30',
        dueTime: '17:00',
        isCompleted: false,
        priority: 'High',
        category: 'Academics',
        notes: 'Chapter 4 problems 1-10',
      });

      const userTasks = tasksStore.getAllTasks('student-1');
      expect(userTasks).toHaveLength(1);
      expect(userTasks[0].title).toBe('Submit CS 101 Assignment');
      expect(userTasks[0].isCompleted).toBe(false);

      // Update task
      tasksStore.updateTask({
        id: taskId,
        title: 'Submit CS 101 Lab & Assignment',
        priority: 'Medium',
        isCompleted: true,
      });

      const updatedTasks = tasksStore.getAllTasks('student-1');
      expect(updatedTasks[0].title).toBe('Submit CS 101 Lab & Assignment');
      expect(updatedTasks[0].priority).toBe('Medium');
      expect(updatedTasks[0].isCompleted).toBe(true);

      // Soft delete
      tasksStore.deleteTask(taskId);
      expect(tasksStore.getAllTasks('student-1')).toHaveLength(0);

      // Verify outbox has tracked mutations
      const outbox = syncOutboxStore.getPendingMutations('student-1');
      expect(outbox.length).toBeGreaterThanOrEqual(1);
      const deleteEntry = outbox.find((o) => o.entityId === taskId && o.operation === 'delete');
      expect(deleteEntry).toBeDefined();
    });

    test('inserts, queries by date, and deletes events with sync outbox tracking', () => {
      const eventId = 'event-test-1';
      tasksStore.insertEvent({
        id: eventId,
        userId: 'student-1',
        title: 'Linear Algebra Lecture',
        date: '2026-10-25',
        startTime: '09:00',
        endTime: '10:30',
        location: 'Room 302',
      });

      const dayEvents = tasksStore.getAllEvents('student-1').filter((e) => e.date === '2026-10-25');
      expect(dayEvents).toHaveLength(1);
      expect(dayEvents[0].title).toBe('Linear Algebra Lecture');

      tasksStore.deleteEvent(eventId);
      const remainingEvents = tasksStore.getAllEvents('student-1').filter((e) => e.date === '2026-10-25');
      expect(remainingEvents).toHaveLength(0);

      const outbox = syncOutboxStore.getPendingMutations('student-1');
      const deleteEntry = outbox.find((o) => o.entityId === eventId && o.operation === 'delete');
      expect(deleteEntry).toBeDefined();
    });
  });

  describe('Time Blocks Storage', () => {
    test('inserts, reads, updates, and deletes time blocks with sync outbox tracking', () => {
      const blockId = 'block-test-1';
      timeBlocksStore.insert({
        id: blockId,
        userId: 'student-1',
        title: 'Deep Study Calculus',
        date: '2026-10-25',
        startTime: '14:00',
        endTime: '16:00',
        category: 'Study',
        color: '#6366F1',
        notes: 'Review integrals',
      });

      const blocks = timeBlocksStore.getAll('student-1');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].title).toBe('Deep Study Calculus');

      timeBlocksStore.update({ id: blockId, title: 'Study Calculus - Integrals' });
      const updatedBlocks = timeBlocksStore.getAll('student-1');
      expect(updatedBlocks[0].title).toBe('Study Calculus - Integrals');

      timeBlocksStore.delete(blockId);
      expect(timeBlocksStore.getAll('student-1')).toHaveLength(0);

      const outbox = syncOutboxStore.getPendingMutations('student-1');
      const deleteEntry = outbox.find((o) => o.entityId === blockId && o.operation === 'delete');
      expect(deleteEntry).toBeDefined();
    });
  });

  describe('Notes & Custom Categories Storage', () => {
    test('inserts, reads, updates, and deletes academic notes with sync outbox tracking', () => {
      const noteId = 'note-test-1';
      notesStore.insert({
        id: noteId,
        userId: 'student-1',
        title: 'Physics Lab Notes',
        body: '# Experiment 1\n- [ ] Measure mass\n- [x] Record timestamp',
        category: 'Physics',
        isPinned: true,
        tags: ['lab', 'physics'],
        isVoiceTranscribed: false,
      });

      const notes = notesStore.getAll('student-1');
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Physics Lab Notes');
      expect(notes[0].isPinned).toBe(true);

      notesStore.update({ id: noteId, isPinned: false });
      const updatedNotes = notesStore.getAll('student-1');
      expect(updatedNotes[0].isPinned).toBe(false);

      notesStore.delete(noteId);
      expect(notesStore.getAll('student-1')).toHaveLength(0);

      const outbox = syncOutboxStore.getPendingMutations('student-1');
      const deleteEntry = outbox.find((o) => o.entityId === noteId && o.operation === 'delete');
      expect(deleteEntry).toBeDefined();
    });

    test('adds, retrieves, and deletes custom categories with sync outbox tracking', () => {
      notesStore.addCustomCategory('student-1', 'Capstone Research', '#10B981');

      const categories = notesStore.getCustomCategories('student-1');
      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe('Capstone Research');
      expect(categories[0].color).toBe('#10B981');

      notesStore.deleteCustomCategory('student-1', 'Capstone Research');
      expect(notesStore.getCustomCategories('student-1')).toHaveLength(0);

      const outbox = syncOutboxStore.getPendingMutations('student-1');
      const deleteEntry = outbox.find((o) => o.entityType === 'custom_category' && o.operation === 'delete');
      expect(deleteEntry).toBeDefined();
    });
  });

  describe('RFC 5545 Recurrence Rules (rruleHelper)', () => {
    test('parses and validates recurrence rules accurately', () => {
      const daily = parseRrule('RRULE:FREQ=DAILY;INTERVAL=1');
      expect(daily?.freq).toBe('DAILY');
      expect(daily?.interval).toBe(1);

      const weekly = parseRrule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10');
      expect(weekly?.freq).toBe('WEEKLY');
      expect(weekly?.byday).toEqual(['MO', 'WE', 'FR']);
      expect(weekly?.count).toBe(10);

      expect(parseRrule(null)).toBeNull();
      expect(parseRrule('')).toBeNull();
    });

    test('expands weekly recurrence across range', () => {
      // Mondays and Wednesdays for 2 weeks starting 2026-10-26 (Monday)
      const rule = 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4';
      const occurrences = getOccurrences(
        '2026-10-26',
        rule,
        new Date(2026, 9, 26, 0, 0, 0),
        new Date(2026, 10, 5, 23, 59, 59),
      );
      expect(occurrences.length).toBe(4);
      expect(occurrences).toContain('2026-10-26');
      expect(occurrences).toContain('2026-10-28');
      expect(occurrences).toContain('2026-11-02');
      expect(occurrences).toContain('2026-11-04');
    });
  });

  describe('iCalendar Export / Import (icsHelper)', () => {
    test('generates valid RFC 5545 iCalendar string and parses it back accurately', () => {
      const task = {
        id: 'task-1',
        userId: 'student-1',
        title: 'Project Defense',
        dueDate: '2026-11-10',
        dueTime: '13:00',
        isCompleted: false,
        priority: 'High' as const,
        category: 'Capstone',
        notes: 'Bring presentation slides',
        createdAt: '2026-10-24T12:00:00Z',
        updatedAt: '2026-10-24T12:00:00Z',
      };

      const event = {
        id: 'event-1',
        userId: 'student-1',
        title: 'Graduation Rehearsal',
        date: '2026-11-15',
        startTime: '08:00',
        endTime: '11:00',
        location: 'University Gymnasium',
        createdAt: '2026-10-24T12:00:00Z',
        updatedAt: '2026-10-24T12:00:00Z',
      };

      const icsString = generateIcsString([event], [], [task]);
      expect(icsString).toContain('BEGIN:VCALENDAR');
      expect(icsString).toContain('SUMMARY:Project Defense');
      expect(icsString).toContain('SUMMARY:Graduation Rehearsal');
      expect(icsString).toContain('LOCATION:University Gymnasium');
      expect(icsString).toContain('END:VCALENDAR');

      const parsed = parseIcsString(icsString);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].title).toBe('Project Defense');
      expect(parsed.tasks[0].dueDate).toBe('2026-11-10');

      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].title).toBe('Graduation Rehearsal');
      expect(parsed.events[0].location).toBe('University Gymnasium');
    });
  });

  describe('Guest Account Migration (guestMigration)', () => {
    test('re-keys all 7 personal entities from guest to cloud account and enqueues outbox sync', async () => {
      // 1. Setup guest user
      const guest = userStore.createGuestUser();
      expect(guest.id).toBe(GUEST_USER_ID);

      // Create guest records
      tasksStore.insertTask({
        id: 'guest-task-1',
        userId: GUEST_USER_ID,
        title: 'Guest Assignment',
        dueDate: '2026-10-29',
        isCompleted: false,
        priority: 'Medium',
        category: 'Academics',
      });

      tasksStore.insertEvent({
        id: 'guest-event-1',
        userId: GUEST_USER_ID,
        title: 'Guest Event',
        date: '2026-10-29',
        startTime: '10:00',
        endTime: '11:00',
      });

      timeBlocksStore.insert({
        id: 'guest-block-1',
        userId: GUEST_USER_ID,
        title: 'Guest Study Block',
        date: '2026-10-29',
        startTime: '13:00',
        endTime: '15:00',
        color: '#6366F1',
        category: 'Study',
      });

      notesStore.insert({
        id: 'guest-note-1',
        userId: GUEST_USER_ID,
        title: 'Guest Note',
        body: 'Notes taken while offline guest',
        category: 'General',
        isPinned: false,
        tags: [],
        isVoiceTranscribed: false,
      });

      notesStore.addCustomCategory(GUEST_USER_ID, 'Guest Category', '#EC4899');

      remindersStore.insertReminder({
        id: 'guest-reminder-1',
        userId: GUEST_USER_ID,
        task: 'Guest Reminder',
        description: null,
        scheduledAt: '2026-10-29T10:00:00Z',
        triggerAt: '2026-10-29T10:00:00Z',
        status: 'pending',
        preCastAudioPath: null,
      });

      // Clear any outbox generated during guest setup so we strictly test migration outbox
      db.executeSync('DELETE FROM sync_outbox');

      // 2. Check summary
      const summary = guestMigration.getGuestDataSummary();
      expect(summary.taskCount).toBe(1);
      expect(summary.eventCount).toBe(1);
      expect(summary.timeBlockCount).toBe(1);
      expect(summary.noteCount).toBe(1);
      expect(summary.categoryCount).toBe(1);
      expect(summary.reminderCount).toBe(1);

      // 3. Perform migration to cloud user
      const cloudUserId = 'cloud-student-456';
      await guestMigration.linkGuestToCloudAccount(cloudUserId, 'student@ustp.edu.ph');

      // 4. Verify guest data has moved to cloud user
      const cloudTasks = tasksStore.getAllTasks(cloudUserId);
      expect(cloudTasks).toHaveLength(1);
      expect(cloudTasks[0].title).toBe('Guest Assignment');

      const cloudEvents = tasksStore.getAllEvents(cloudUserId).filter((e) => e.date === '2026-10-29');
      expect(cloudEvents).toHaveLength(1);
      expect(cloudEvents[0].title).toBe('Guest Event');

      const cloudBlocks = timeBlocksStore.getAll(cloudUserId);
      expect(cloudBlocks).toHaveLength(1);
      expect(cloudBlocks[0].title).toBe('Guest Study Block');

      const cloudNotes = notesStore.getAll(cloudUserId);
      expect(cloudNotes).toHaveLength(1);
      expect(cloudNotes[0].title).toBe('Guest Note');

      const cloudCategories = notesStore.getCustomCategories(cloudUserId);
      expect(cloudCategories).toHaveLength(1);
      expect(cloudCategories[0].name).toBe('Guest Category');

      const cloudReminders = remindersStore.getPendingReminders(cloudUserId);
      expect(cloudReminders).toHaveLength(1);
      expect(cloudReminders[0].task).toBe('Guest Reminder');

      // Guest should now have 0 records
      const guestSummaryAfter = guestMigration.getGuestDataSummary();
      expect(guestSummaryAfter.taskCount).toBe(0);
      expect(guestSummaryAfter.eventCount).toBe(0);

      // Verify outbox has enqueue records for the cloud user
      const outbox = syncOutboxStore.getPendingMutations(cloudUserId);
      expect(outbox.length).toBeGreaterThanOrEqual(6);
    });
  });
});
