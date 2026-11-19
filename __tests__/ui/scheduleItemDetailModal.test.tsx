import React from 'react';
import {Alert, Linking} from 'react-native';
import {
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {saveBirthday} from '../../src/ui/screens/calendar/utils/calendarGroups';
import {groupClassBlocks} from '../../src/ui/screens/calendar/utils/classScheduleHelpers';
import {
  academicProfileStore,
  db,
  extractUrlsFromText,
  initDatabase,
  normalizeEntryUrl,
  resolveScheduleEntryTarget,
  scheduleEntriesStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';

// Monday 2026-11-16 10:00 local (so MWF classes land on 2026-11-16 & 2026-11-18).
const FIXED_NOW = new Date(2026, 10, 16, 10, 0, 0);
const TODAY_STR = '2026-11-16';

describe('ScheduleItemDetailModal & scheduleEntriesStore', () => {
  let userId: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'queueMicrotask',
      ],
    });
    jest.setSystemTime(FIXED_NOW);

    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');

    const guest = userStore.createGuestUser();
    userId = guest.id;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('URL helpers normalize bare domains and extract unique URLs from notes', () => {
    expect(normalizeEntryUrl('  meet.google.com/abc-defg-hij  ')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
    expect(normalizeEntryUrl('https://ustp.edu.ph/portal')).toBe(
      'https://ustp.edu.ph/portal',
    );
    expect(
      extractUrlsFromText(
        'Join https://meet.google.com/xyz-123, meet.google.com/abc-defg-hij, or canvas.ustp.edu.ph/courses/1. Email prof@ustp.edu.ph or see www.canvas.edu/hw and https://meet.google.com/xyz-123!',
      ),
    ).toEqual([
      'https://meet.google.com/xyz-123',
      'meet.google.com/abc-defg-hij',
      'canvas.ustp.edu.ph/courses/1',
      'www.canvas.edu/hw',
    ]);
  });

  test('scheduleEntriesStore resolves targets across recurrences and supports guest migration & clear', () => {
    const classTarget = resolveScheduleEntryTarget({
      kind: 'block',
      rawBlock: {
        id: 'blk-1_occur_2026-11-18',
        title: 'IT311 · Systems Integration',
        startTime: '09:00',
        endTime: '10:30',
        category: 'Class',
        recurrenceRule: 'FREQ=WEEKLY',
      },
    });
    expect(classTarget.targetKind).toBe('class_group');
    expect(classTarget.targetId).toBe(
      'class::it311 · systems integration::09:00::10:30',
    );
    expect(classTarget.fallbackIds).toEqual(['blk-1']);
    expect(classTarget.isSharedAcrossSessions).toBe(true);

    const added = scheduleEntriesStore.addEntry({
      userId,
      targetKind: classTarget.targetKind,
      targetId: classTarget.targetId,
      entryType: 'link',
      title: 'Syllabus',
      content: 'docs.google.com/doc/1',
    });
    expect(added.content).toBe('https://docs.google.com/doc/1');

    // Guest migration moves entries to the signed-in userId.
    db.transactionSync(tx => {
      scheduleEntriesStore.transferFromGuest(tx, GUEST_USER_ID, 'cloud-u1');
    });
    expect(scheduleEntriesStore.getAll(GUEST_USER_ID)).toHaveLength(0);
    expect(scheduleEntriesStore.getAll('cloud-u1')).toHaveLength(1);

    scheduleEntriesStore.clear('cloud-u1');
    expect(scheduleEntriesStore.getAll('cloud-u1')).toHaveLength(0);
  });

  test('tapping a repeating Class shows structured details, shares notes/links across days without breaking grouping, and Edit opens Edit Class', async () => {
    const openUrlSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined);

    academicProfileStore.persistRecurringSchedule(
      userId,
      [
        {
          code: 'IT311',
          subjectTitle: 'Systems Integration',
          section: 'IT3R1',
          room: '09-301',
          faculty: 'Prof. Dela Cruz',
          days: ['Monday', 'Wednesday', 'Friday'],
          startTime: '09:00',
          endTime: '10:30',
          recurrenceRule: 'FREQ=WEEKLY',
        },
      ],
      FIXED_NOW,
    );

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Tapping the class opens the Detail Sheet rather than the Edit modal.
    fireEvent.press(screen.getByText('IT311 · Systems Integration'));

    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(screen.getByTestId('schedule-detail-general-card')).toBeTruthy();
    expect(screen.getByText('IT311')).toBeTruthy();
    expect(screen.getByText('MWF')).toBeTruthy();
    expect(screen.getByText('09-301')).toBeTruthy();
    expect(screen.getByText('IT3R1')).toBeTruthy();
    expect(screen.getByText('Prof. Dela Cruz')).toBeTruthy();
    expect(
      screen.getByText('Attached to all sessions of this class'),
    ).toBeTruthy();
    expect(screen.queryByTestId('view-classes-modal')).toBeNull();

    // Attach a Link inside the detail sheet.
    fireEvent.press(screen.getByTestId('schedule-detail-add-link-btn'));
    fireEvent.changeText(
      screen.getByTestId('schedule-entry-title-input'),
      'Google Meet',
    );
    fireEvent.changeText(
      screen.getByTestId('schedule-entry-content-input'),
      'meet.google.com/abc-defg-hij',
    );
    fireEvent.press(screen.getByTestId('schedule-entry-save-btn'));

    expect(screen.getByText('Google Meet')).toBeTruthy();
    expect(
      screen.getByText('https://meet.google.com/abc-defg-hij'),
    ).toBeTruthy();

    // Tapping the link opens the normalized URL.
    fireEvent.press(screen.getByTestId('schedule-entry-open-0'));
    await waitFor(() => {
      expect(openUrlSpy).toHaveBeenCalledWith(
        'https://meet.google.com/abc-defg-hij',
      );
    });

    // Attach a Note as well.
    fireEvent.press(screen.getByTestId('schedule-detail-add-note-btn'));
    fireEvent.changeText(
      screen.getByTestId('schedule-entry-title-input'),
      'Lab Prep',
    );
    fireEvent.changeText(
      screen.getByTestId('schedule-entry-content-input'),
      'Bring printed worksheet',
    );
    fireEvent.press(screen.getByTestId('schedule-entry-save-btn'));
    expect(screen.getByText('Lab Prep')).toBeTruthy();
    expect(screen.getByText('Bring printed worksheet')).toBeTruthy();

    // Edit the attached note inline.
    fireEvent.press(screen.getByTestId('schedule-entry-edit-1'));
    fireEvent.changeText(
      screen.getByTestId('schedule-entry-content-input'),
      'Bring printed worksheet and calculator',
    );
    fireEvent.press(screen.getByTestId('schedule-entry-save-btn'));
    expect(
      screen.getByText('Bring printed worksheet and calculator'),
    ).toBeTruthy();

    // Close detail sheet -> attachment count badge (2) is shown on the schedule card.
    fireEvent.press(screen.getByTestId('schedule-detail-close-button'));
    expect(screen.queryByTestId('schedule-item-detail-modal')).toBeNull();
    const badge = screen.getByTestId(/^month-plan-attachment-badge-/);
    expect(within(badge).getByText('2')).toBeTruthy();

    // Class grouping across MWF remains completely intact.
    expect(groupClassBlocks(timeBlocksStore.getAll(userId))).toHaveLength(1);

    // Switch to Wednesday Nov 18 -> same attachments appear on Wednesday's session.
    fireEvent.press(screen.getByLabelText('Nov 18'));
    fireEvent.press(screen.getByText('IT311 · Systems Integration'));
    expect(screen.getByText('Google Meet')).toBeTruthy();
    expect(
      screen.getByText('Bring printed worksheet and calculator'),
    ).toBeTruthy();

    // Delete the attached link entry.
    fireEvent.press(screen.getByTestId('schedule-entry-delete-0'));
    expect(screen.queryByText('Google Meet')).toBeNull();
    expect(
      screen.getByText('Bring printed worksheet and calculator'),
    ).toBeTruthy();

    // Tapping Edit in the detail sheet closes details and opens ViewClassesModal in Edit Class mode.
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    expect(screen.queryByTestId('schedule-item-detail-modal')).toBeNull();
    expect(screen.getByTestId('view-classes-modal')).toBeTruthy();
    expect(screen.getByText('Edit Class')).toBeTruthy();
    expect(screen.getByTestId('view-class-edit-title').props.value).toBe(
      'Systems Integration',
    );
  });

  test('Event detail view shows general details when present, omits empty details card when absent, and hides Edit behind button', () => {
    tasksStore.insertEvent({
      id: 'ev-detailed',
      userId,
      title: 'Capstone Advising',
      date: TODAY_STR,
      startTime: '14:00',
      endTime: '15:00',
      location: 'Faculty Room 204',
    });
    tasksStore.insertEvent({
      id: 'ev-minimal',
      userId,
      title: 'Quick Sync',
      date: TODAY_STR,
      startTime: '16:00',
      endTime: '16:30',
      location: '',
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Minimal event: no extra metadata -> General Details card is omitted.
    fireEvent.press(screen.getByText('Quick Sync'));
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(screen.queryByTestId('schedule-detail-general-card')).toBeNull();
    fireEvent.press(screen.getByTestId('schedule-detail-close-button'));

    // Detailed event: shows location, Edit button opens AddTaskEventModal.
    fireEvent.press(screen.getByText('Capstone Advising'));
    expect(screen.getByTestId('schedule-detail-general-card')).toBeTruthy();
    expect(screen.getByText('Faculty Room 204')).toBeTruthy();
    expect(screen.queryByText('Edit event')).toBeNull();

    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    expect(screen.queryByTestId('schedule-item-detail-modal')).toBeNull();
    expect(screen.getByText('Edit event')).toBeTruthy();
  });

  test('Task & Overdue task chips open detail view with inline completion toggle, saved note links, and Edit access', () => {
    tasksStore.insertTask({
      id: 'task-today',
      userId,
      title: 'Submit Lab 4',
      dueDate: TODAY_STR,
      dueTime: '17:00',
      isCompleted: false,
      priority: 'High',
      category: 'Learning',
      notes: 'Upload PDF to canvas.ustp.edu.ph',
    });
    tasksStore.insertTask({
      id: 'task-overdue',
      userId,
      title: 'Past Quiz Review',
      dueDate: '2026-11-10',
      isCompleted: false,
      priority: 'Medium',
      category: 'Work',
    });

    const openUrlSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined);

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Tap Today's task -> opens detail sheet, not Edit task modal.
    fireEvent.press(screen.getByText('Submit Lab 4'));
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Learning')).toBeTruthy();
    expect(screen.getByText('Upload PDF to canvas.ustp.edu.ph')).toBeTruthy();
    // Bare domain extracted as clickable link chip.
    fireEvent.press(screen.getByText('canvas.ustp.edu.ph'));
    expect(openUrlSpy).toHaveBeenCalledWith('https://canvas.ustp.edu.ph');
    expect(screen.queryByText('Edit task')).toBeNull();

    // Toggle task completion inline.
    fireEvent.press(screen.getByTestId('schedule-detail-toggle-task'));
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
    expect(
      tasksStore.getAllTasks(userId).find(t => t.id === 'task-today')
        ?.isCompleted,
    ).toBe(true);

    // Close and tap Overdue chip -> also opens detail sheet first.
    fireEvent.press(screen.getByTestId('schedule-detail-close-button'));
    fireEvent.press(screen.getByText('Past Quiz Review'));
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(
      within(screen.getByTestId('schedule-detail-general-card')).getByText(
        'Overdue',
      ),
    ).toBeTruthy();

    // Tapping Edit opens AddTaskEventModal.
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    expect(screen.getByText('Edit task')).toBeTruthy();
    expect(openUrlSpy).toHaveBeenCalledTimes(1);
  });

  test('Non-class Time Block, Birthday, and Holiday open detail sheet and route Edit to the right manager', () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    timeBlocksStore.insert({
      id: 'blk-study',
      userId,
      title: 'Thesis Writing',
      date: TODAY_STR,
      startTime: '18:00',
      endTime: '19:30',
      color: '#2563EB',
      category: 'Learning',
      notes: 'Draft chapter 2 methodology',
    });

    saveBirthday({
      userId,
      personName: 'Ada Lovelace',
      month: 11,
      day: 16,
      birthYear: 2000,
      relation: 'Classmate',
      notes: 'Bring cupcakes',
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Non-class Time Block
    fireEvent.press(screen.getByText('Thesis Writing'));
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(screen.getByText('Draft chapter 2 methodology')).toBeTruthy();
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    expect(screen.getByText('Edit Time Block')).toBeTruthy();
    fireEvent.press(screen.getByText('Cancel'));

    // Birthday
    fireEvent.press(screen.getByText("🎂 Ada Lovelace's Birthday"));
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(screen.getByText('26 years old')).toBeTruthy();
    expect(screen.getByText('Classmate')).toBeTruthy();
    expect(screen.getByText('Bring cupcakes')).toBeTruthy();
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    expect(screen.getByTestId('birthdays-group-modal')).toBeTruthy();
    fireEvent.press(screen.getByTestId('birthdays-close-button'));

    // Philippine Holiday (Nov 30, 2026 Bonifacio Day)
    fireEvent.press(screen.getByLabelText('Nov 30'));
    fireEvent.press(screen.getByText('Bonifacio Day'));
    expect(screen.getByTestId('schedule-item-detail-modal')).toBeTruthy();
    expect(screen.getByText('Regular holiday')).toBeTruthy();
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    expect(screen.getByTestId('holidays-group-modal')).toBeTruthy();
  });

  test('recurring _occur_ items toggle, edit, and delete base SQLite rows and clean up attached entries', () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        buttons?.find(b => b.text === 'Delete')?.onPress?.();
      });

    // Base records start 7 days earlier (2026-11-09), so 2026-11-16 has _occur_ IDs.
    tasksStore.insertTask({
      id: 'rec-task-1',
      userId,
      title: 'Weekly Quiz Prep',
      dueDate: '2026-11-09',
      dueTime: '11:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Learning',
      recurrenceRule: 'FREQ=WEEKLY',
    });

    tasksStore.insertEvent({
      id: 'rec-ev-1',
      userId,
      title: 'Weekly Lab Sync',
      date: '2026-11-09',
      startTime: '15:00',
      endTime: '16:00',
      location: 'Lab 2',
      recurrenceRule: 'FREQ=WEEKLY',
    });
    scheduleEntriesStore.addEntry({
      userId,
      targetKind: 'event',
      targetId: 'rec-ev-1',
      entryType: 'link',
      title: 'Lab Docs',
      content: 'ustp.edu.ph/labs',
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Toggle recurring _occur_ task inside detail modal -> updates base task row.
    fireEvent.press(screen.getAllByText('Weekly Quiz Prep')[0]);
    fireEvent.press(screen.getByTestId('schedule-detail-toggle-task'));
    expect(
      tasksStore.getAllTasks(userId).find(t => t.id === 'rec-task-1')
        ?.isCompleted,
    ).toBe(true);
    fireEvent.press(screen.getByTestId('schedule-detail-close-button'));

    // Open recurring _occur_ event -> shows attached link -> Edit -> Delete cleans up base row & entries.
    fireEvent.press(screen.getByText('Weekly Lab Sync'));
    expect(screen.getByText('Lab Docs')).toBeTruthy();
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    fireEvent.press(screen.getByText('Delete'));

    expect(alertSpy).toHaveBeenCalled();
    expect(tasksStore.getAllEvents(userId)).toHaveLength(0);
    expect(scheduleEntriesStore.getForTarget(userId, 'rec-ev-1')).toHaveLength(
      0,
    );
  });

  test('re-keying preserves class attachments on title/time change, clearing event form note removes only form note, and deleting class cleans entries', () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        buttons?.find(b => b.text === 'Remove')?.onPress?.();
      });

    academicProfileStore.persistRecurringSchedule(
      userId,
      [
        {
          code: 'IT311',
          subjectTitle: 'Systems Integration',
          section: 'IT3R1',
          room: '09-301',
          faculty: 'Prof. Dela Cruz',
          days: ['Monday', 'Wednesday'],
          startTime: '09:00',
          endTime: '10:30',
          recurrenceRule: 'FREQ=WEEKLY',
        },
      ],
      FIXED_NOW,
    );

    // Event created with untitled form note + titled note.
    tasksStore.insertEvent({
      id: 'ev-form-note',
      userId,
      title: 'Project Demo',
      date: TODAY_STR,
      startTime: '13:00',
      endTime: '14:00',
    });
    scheduleEntriesStore.upsertFormNoteForEvent(
      userId,
      'ev-form-note',
      'Initial form note',
    );
    scheduleEntriesStore.addEntry({
      userId,
      targetKind: 'event',
      targetId: 'ev-form-note',
      entryType: 'note',
      title: 'Rubric',
      content: 'Keep this titled note',
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Edit event and clear its form note -> removes untitled form note, preserves titled note.
    fireEvent.press(screen.getByText('Project Demo'));
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    expect(screen.getByDisplayValue('Initial form note')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Add notes...'), '');
    fireEvent.press(screen.getByText('Save'));

    const remainingEventEntries = scheduleEntriesStore.getForTarget(
      userId,
      'ev-form-note',
    );
    expect(remainingEventEntries).toHaveLength(1);
    expect(remainingEventEntries[0].title).toBe('Rubric');

    // Attach link to repeating class, then rename class in ViewClassesModal -> entry re-keys and remains attached.
    fireEvent.press(screen.getByText('IT311 · Systems Integration'));
    fireEvent.press(screen.getByTestId('schedule-detail-add-link-btn'));
    fireEvent.changeText(
      screen.getByTestId('schedule-entry-title-input'),
      'Class Meet',
    );
    fireEvent.changeText(
      screen.getByTestId('schedule-entry-content-input'),
      'meet.google.com/class-311',
    );
    fireEvent.press(screen.getByTestId('schedule-entry-save-btn'));
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));

    fireEvent.changeText(
      screen.getByTestId('view-class-edit-title'),
      'Systems Architecture',
    );
    fireEvent.press(screen.getByTestId('view-class-edit-save'));
    // Close ViewClassesModal and verify renamed class still has the link.
    fireEvent.press(screen.getByLabelText('Close my classes'));
    fireEvent.press(screen.getByText('IT311 · Systems Architecture'));
    expect(screen.getByText('Class Meet')).toBeTruthy();

    // Deleting the class from ViewClassesModal cleans up its attached entries.
    fireEvent.press(screen.getByTestId('schedule-detail-edit-button'));
    fireEvent.press(screen.getByLabelText('Cancel editing class'));
    fireEvent.press(screen.getByTestId('view-class-delete-0'));
    expect(alertSpy).toHaveBeenCalled();
    expect(
      scheduleEntriesStore
        .getAll(userId)
        .filter(e => e.targetKind === 'class_group'),
    ).toHaveLength(0);
  });
});
