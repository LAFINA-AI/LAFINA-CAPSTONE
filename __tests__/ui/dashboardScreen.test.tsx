import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  ALL_DASHBOARD_WIDGET_IDS,
  dashboardConfigStore,
  db,
  initDatabase,
  notesStore,
  preferencesStore,
  remindersStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import type {Event, TimeBlock} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {DashboardScreen} from '../../src/ui/screens/dashboard';
import {
  buildDayScheduleItems,
  computeFreeStudySummary,
  computeUpNextSummary,
  formatLocalDateStr,
} from '../../src/ui/screens/dashboard/dashboardCalculations';

let userSeq = 0;
const makeUser = (label: string): string => {
  userSeq += 1;
  const id = `dash-user-${label}-${userSeq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, `Juan ${label}`, `${id}@example.invalid`, now, now],
  );
  return id;
};

describe('Dashboard Config Store, Schedule Calculations & Screen UI', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('dashboardConfigStore', () => {
    test('returns defaults, applies presets, enforces at least 1 visible widget, and resets cleanly', () => {
      const uid = makeUser('config');
      const initial = dashboardConfigStore.get(uid);
      expect(initial.widgetOrder).toEqual([...ALL_DASHBOARD_WIDGET_IDS]);
      expect(initial.hiddenWidgets).toEqual([]);
      expect(initial.minFreeGapMinutes).toBe(30);

      // Trying to hide every widget must leave at least the first widget visible.
      const forcedVisible = dashboardConfigStore.save(uid, {
        hiddenWidgets: [...ALL_DASHBOARD_WIDGET_IDS],
      });
      expect(forcedVisible.hiddenWidgets.length).toBe(
        ALL_DASHBOARD_WIDGET_IDS.length - 1,
      );

      // Apply exam_crunch preset
      const preset = dashboardConfigStore.applyPreset(uid, 'exam_crunch');
      expect(preset.widgetOrder[0]).toBe('tasks_due');
      expect(preset.hiddenWidgets).toContain('today_schedule');

      // Reset back to default
      const reset = dashboardConfigStore.reset(uid);
      expect(reset.widgetOrder).toEqual([...ALL_DASHBOARD_WIDGET_IDS]);
      expect(reset.hiddenWidgets).toEqual([]);
    });

    test('transfers guest dashboard preferences on account link without overwriting existing cloud config', () => {
      const guest = userStore.createGuestUser();
      dashboardConfigStore.save(guest.id, {minFreeGapMinutes: 45});

      const targetId = makeUser('transfer');
      db.transactionSync(tx => {
        dashboardConfigStore.transferFromGuest(tx, guest.id, targetId);
      });

      expect(dashboardConfigStore.get(targetId).minFreeGapMinutes).toBe(45);
      expect(dashboardConfigStore.get(guest.id).minFreeGapMinutes).toBe(30);
    });
  });

  describe('dashboardCalculations', () => {
    const sampleDate = '2026-11-12';
    const blocks: TimeBlock[] = [
      {
        id: 'b1_occur_2026-11-12',
        userId: 'u1',
        title: 'CS 301 · Algorithms',
        date: sampleDate,
        startTime: '08:00',
        endTime: '09:30',
        color: '#2563EB',
        category: 'Class',
        notes: 'Room: ICT 302 | Section: BSCS-3A | Faculty: Prof. Reyes',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'b2',
        userId: 'u1',
        title: 'Thesis Reading',
        date: sampleDate,
        startTime: '11:00',
        endTime: '12:00',
        color: '#059669',
        category: 'Learning',
        notes: 'Chapter 2 review',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'b3',
        userId: 'u1',
        title: 'CS 305 · OS Lab',
        date: sampleDate,
        startTime: '14:00',
        endTime: '16:00',
        color: '#E6003A',
        category: 'Class',
        notes: 'Room: Lab 1',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ];
    const events: Event[] = [
      {
        id: 'e1',
        userId: 'u1',
        title: 'Capstone Advising',
        date: sampleDate,
        startTime: '16:15',
        endTime: '17:00',
        location: 'Faculty Room',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ];

    test('builds chronological items with parsed class metadata and stripped baseId', () => {
      const items = buildDayScheduleItems(sampleDate, blocks, events);
      expect(items.map(i => i.title)).toEqual([
        'CS 301 · Algorithms',
        'Thesis Reading',
        'CS 305 · OS Lab',
        'Capstone Advising',
      ]);
      expect(items[0].baseId).toBe('b1');
      expect(items[0].kind).toBe('class');
      expect(items[0].room).toBe('ICT 302');
      expect(items[0].subtitle).toContain('ICT 302');
      expect(items[3].kind).toBe('event');
    });

    test('computeUpNextSummary detects live, upcoming, and wrapped_up states accurately', () => {
      const todayItems = buildDayScheduleItems(sampleDate, blocks, events);
      const tomorrowItems = buildDayScheduleItems(
        '2026-11-13',
        [{...blocks[0], id: 'tom-1', date: '2026-11-13'}],
        [],
      );

      // During CS 301 (08:45) -> live mode, 50% complete, 45m remaining
      const liveNow = computeUpNextSummary(
        todayItems,
        tomorrowItems,
        new Date(2026, 10, 12, 8, 45),
      );
      expect(liveNow.mode).toBe('live');
      expect(liveNow.primaryItem?.title).toBe('CS 301 · Algorithms');
      expect(liveNow.progressPercent).toBe(50);
      expect(liveNow.minutesRemaining).toBe(45);
      expect(liveNow.followingItem?.title).toBe('Thesis Reading');

      // Gap at 10:00 -> upcoming mode, Thesis Reading in 60m
      const upcoming = computeUpNextSummary(
        todayItems,
        tomorrowItems,
        new Date(2026, 10, 12, 10, 0),
      );
      expect(upcoming.mode).toBe('upcoming');
      expect(upcoming.primaryItem?.title).toBe('Thesis Reading');
      expect(upcoming.minutesUntilStart).toBe(60);

      // Evening after 17:00 -> wrapped_up with tomorrow preview
      const wrapped = computeUpNextSummary(
        todayItems,
        tomorrowItems,
        new Date(2026, 10, 12, 19, 0),
      );
      expect(wrapped.mode).toBe('wrapped_up');
      expect(wrapped.tomorrowPreview?.date).toBe('2026-11-13');
    });

    test('computeFreeStudySummary computes free gaps, filters tiny transitions, handles midnight sleep, and tags peak focus', () => {
      const todayItems = buildDayScheduleItems(sampleDate, blocks, events);
      const prefs = {
        wakeTime: '07:00',
        sleepTime: '00:00', // midnight end of day
        studyPeakHours: ['afternoon' as const],
        busiestDay: 'Monday',
        reminderLeadMinutes: 15,
        snoozeTendency: 'snooze_once' as const,
        weeklyClassCount: '4-6' as const,
        longestClassGap: '1 hour' as const,
      };

      // At 09:30, remaining window is 09:30 -> 24:00 (14.5h = 870m).
      // Busy: 11:00-12:00 (60m), 14:00-16:00 (120m), 16:15-17:00 (45m) -> 225m busy.
      // Raw gaps: 09:30-11:00 (90m), 12:00-14:00 (120m), 16:00-16:15 (15m), 17:00-24:00 (420m).
      // Total remaining free = 90 + 120 + 15 + 420 = 645m.
      // With minFreeGapMinutes=30, 16:00-16:15 (15m) is excluded!
      const summary = computeFreeStudySummary(
        todayItems,
        prefs,
        new Date(2026, 10, 12, 9, 30),
        30,
      );

      expect(summary.totalRemainingFreeMinutes).toBe(645);
      expect(summary.usableStudyFreeMinutes).toBe(630);
      expect(summary.plannedStudyMinutesToday).toBe(60); // Thesis Reading (Learning)
      expect(
        summary.freeBlocks.map(g => `${g.startTime}-${g.endTime}`),
      ).toEqual(['09:30-11:00', '12:00-14:00', '17:00-00:00']);
      // 12:00-14:00 overlaps afternoon peak
      expect(summary.freeBlocks[1].isPeakFocus).toBe(true);
      expect(summary.freeBlocks[1].peakLabel).toBe('Afternoon peak');
    });
  });

  describe('DashboardScreen UI', () => {
    test('renders widgets, supports inline task check-off, + Study Block creation, and Customize persistence', async () => {
      const fixedNow = new Date(2026, 10, 12, 9, 30, 0);
      jest.useFakeTimers().setSystemTime(fixedNow);

      const uid = makeUser('ui');
      const todayStr = formatLocalDateStr(fixedNow);

      preferencesStore.save(uid, {
        wakeTime: '07:00',
        sleepTime: '22:00',
        studyPeakHours: ['morning'],
        busiestDay: 'Thursday',
        reminderLeadMinutes: 15,
        snoozeTendency: 'snooze_once',
        weeklyClassCount: '4-6',
        longestClassGap: '1 hour',
      });

      timeBlocksStore.insert({
        id: 'cls-1',
        userId: uid,
        title: 'IT 311 · Networking',
        date: todayStr,
        startTime: '13:00',
        endTime: '14:30',
        color: '#2563EB',
        category: 'Class',
        notes: 'Room: Lab 2 | Section: BSIT-3A',
      });

      tasksStore.insertTask({
        id: 'task-1',
        userId: uid,
        title: 'Submit Packet Tracer Lab',
        dueDate: todayStr,
        dueTime: '17:00',
        isCompleted: false,
        priority: 'High',
        category: 'Academic',
      });

      remindersStore.insertReminder({
        id: 'rem-1',
        userId: uid,
        task: 'Review Subnetting Quiz',
        description: null,
        scheduledAt: new Date(2026, 10, 12, 16, 0, 0).toISOString(),
        triggerAt: new Date(2026, 10, 12, 15, 45, 0).toISOString(),
        status: 'pending',
        preCastAudioPath: null,
      });

      notesStore.insert({
        id: 'note-1',
        userId: uid,
        title: 'OS Semaphores Summary',
        body: 'Binary vs counting semaphores',
        category: 'Learning',
        isPinned: true,
        tags: [],
        isVoiceTranscribed: false,
        imageUri: null,
      });

      const onRefresh = jest.fn();
      const onOpenCalendarTab = jest.fn();
      const onOpenNotesTab = jest.fn();
      const onOpenChatTab = jest.fn();

      const utils = render(
        <ThemeProvider userId={uid}>
          <DashboardScreen
            userId={uid}
            refreshTrigger={0}
            onRefresh={onRefresh}
            onOpenCalendarTab={onOpenCalendarTab}
            onOpenNotesTab={onOpenNotesTab}
            onOpenChatTab={onOpenChatTab}
          />
        </ThemeProvider>,
      );

      // All default widgets render with live data
      expect(utils.getByTestId('dashboard-widget-up-next')).toBeTruthy();
      expect(
        utils.getByTestId('dashboard-widget-free-study-blocks'),
      ).toBeTruthy();
      expect(utils.getByTestId('dashboard-widget-today-schedule')).toBeTruthy();
      expect(utils.getByTestId('dashboard-widget-tasks-due')).toBeTruthy();
      expect(
        utils.getByTestId('dashboard-widget-upcoming-reminders'),
      ).toBeTruthy();
      expect(utils.getByTestId('dashboard-widget-pinned-notes')).toBeTruthy();

      expect(utils.getAllByText('IT 311 · Networking').length).toBeGreaterThan(
        0,
      );
      expect(utils.getByText('Submit Packet Tracer Lab')).toBeTruthy();
      expect(utils.getByText('Review Subnetting Quiz')).toBeTruthy();
      expect(utils.getByText('OS Semaphores Summary')).toBeTruthy();

      // Inline task completion writes to SQLite and triggers refresh
      fireEvent.press(utils.getByTestId('dashboard-task-toggle-task-1'));
      await waitFor(() => {
        expect(tasksStore.getAllTasks(uid)[0].isCompleted).toBe(true);
      });
      expect(onRefresh).toHaveBeenCalled();

      // Tapping pinned note navigates to NotesScreen with noteId
      fireEvent.press(utils.getByTestId('dashboard-note-item-note-1'));
      expect(onOpenNotesTab).toHaveBeenCalledWith('note-1');

      // Tapping + Study opens AddBlockModal prefilled for the free slot (09:30 -> 11:00)
      fireEvent.press(utils.getByTestId('free-slot-add-gap-570-780'));
      expect(utils.getByText('Create Time Block')).toBeTruthy();
      fireEvent.press(utils.getByText('Save'));
      await waitFor(() => {
        expect(timeBlocksStore.getAll(uid).length).toBe(2);
      });

      // Open Customize modal and hide Pinned Notes
      fireEvent.press(utils.getByTestId('dashboard-customize-btn'));
      expect(utils.getByText('Customize Dashboard')).toBeTruthy();
      fireEvent(
        utils.getByTestId('toggle-widget-pinned_notes'),
        'valueChange',
        false,
      );
      fireEvent.press(utils.getByTestId('customize-dashboard-done'));

      await waitFor(() => {
        expect(utils.queryByTestId('dashboard-widget-pinned-notes')).toBeNull();
      });
      expect(dashboardConfigStore.get(uid).hiddenWidgets).toContain(
        'pinned_notes',
      );
    });
  });
});
