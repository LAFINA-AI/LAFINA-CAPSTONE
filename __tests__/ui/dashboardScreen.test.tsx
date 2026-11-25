import React from 'react';
import RNFS from 'react-native-fs';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  ALL_DASHBOARD_WIDGET_IDS,
  ALL_UP_NEXT_CARD_TONES,
  DEFAULT_HOME_QUICK_ACTIONS,
  alarmsStore,
  calendarVisibilityStore,
  dashboardConfigStore,
  db,
  importedBatchesStore,
  initDatabase,
  normalizeDashboardConfig,
  notesStore,
  preferencesStore,
  remindersStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {academicProfileStore} from '../../src/storage/academicProfileStore';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import type {Event, TimeBlock} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  MODERN_THEMES,
  getModernPalette,
  getModernThemeExtras,
} from '../../src/ui/theme';
import {DashboardScreen} from '../../src/ui/screens/dashboard';
import {resolveHeroToneColors} from '../../src/ui/screens/dashboard/components/modern';
import {useDashboardData} from '../../src/ui/screens/dashboard/hooks/useDashboardData';
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
      dashboardConfigStore.save(guest.id, {
        minFreeGapMinutes: 45,
        upNextStyle: 'mascot_progress',
        upNextTone: 'soft',
        homeDensity: 'compact',
        showQuickActions: false,
      });

      const targetId = makeUser('transfer');
      db.transactionSync(tx => {
        dashboardConfigStore.transferFromGuest(tx, guest.id, targetId);
      });

      const transferred = dashboardConfigStore.get(targetId);
      expect(transferred.minFreeGapMinutes).toBe(45);
      expect(transferred.upNextStyle).toBe('mascot_progress');
      expect(transferred.upNextTone).toBe('soft');
      expect(transferred.homeDensity).toBe('compact');
      expect(transferred.showQuickActions).toBe(false);
      expect(dashboardConfigStore.get(guest.id).minFreeGapMinutes).toBe(30);
    });

    test('normalizes Up Next card style/tone, quick action bounds, density, and avatar toggle safely', () => {
      const sanitized = normalizeDashboardConfig({
        upNextStyle: 'invalid_style' as never,
        upNextTone: 'invalid_tone' as never,
        quickActions: ['notes', 'notes', 'unknown' as never],
        homeDensity: 'wide' as never,
        showQuickActions: false,
        showGreetingAvatar: false,
      });

      expect(sanitized.upNextStyle).toBe('countdown_ring');
      expect(sanitized.upNextTone).toBe('vivid');
      expect(sanitized.homeDensity).toBe('comfortable');
      expect(sanitized.showQuickActions).toBe(false);
      expect(sanitized.showGreetingAvatar).toBe(false);
      // Single valid action is padded from defaults without duplicates
      expect(sanitized.quickActions[0]).toBe('notes');
      expect(sanitized.quickActions.length).toBe(
        DEFAULT_HOME_QUICK_ACTIONS.length,
      );
      expect(new Set(sanitized.quickActions).size).toBe(
        sanitized.quickActions.length,
      );
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

      // All default widgets render with live data (countdown ring, no search bar, no bell icon)
      expect(utils.getByTestId('dashboard-widget-up-next')).toBeTruthy();
      expect(utils.getByTestId('dashboard-hero-ring')).toBeTruthy();
      expect(utils.queryByTestId('dashboard-hero-mascot')).toBeNull();
      expect(utils.queryByLabelText('Open alarms')).toBeNull();
      expect(
        utils.queryByPlaceholderText('Search classes, notes...'),
      ).toBeNull();
      expect(utils.getByTestId('home-greeting-title').props.children).toEqual([
        'Good morning',
        ', ',
        'Juan',
      ]);
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

      // Clicking VIEW SCHEDULE opens the Schedule tab without opening Edit Time Block
      fireEvent.press(utils.getByTestId('dashboard-hero-cta'));
      expect(onOpenCalendarTab).toHaveBeenCalledWith({date: todayStr});
      expect(onOpenCalendarTab).not.toHaveBeenCalledWith(
        expect.objectContaining({entityId: expect.anything()}),
      );

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

      expect(utils.queryByTestId('dashboard-ask-lafina-btn')).toBeNull();
      expect(utils.queryByText('Customize')).toBeNull();

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

    test('renders real greetingName and upNext synchronously on the very first frame without split-second flicker', async () => {
      const fixedNow = new Date(2026, 10, 12, 9, 30, 0);
      jest.useFakeTimers().setSystemTime(fixedNow);

      const uid = makeUser('instant');
      const todayStr = formatLocalDateStr(fixedNow);

      timeBlocksStore.insert({
        id: 'cls-instant-1',
        userId: uid,
        title: 'CS 401 · Compilers',
        date: todayStr,
        startTime: '10:30',
        endTime: '12:00',
        color: '#2563EB',
        category: 'Class',
        notes: 'Room: ICT 201',
      });

      const observedFrames: Array<{
        greetingName: string;
        upNextMode: string;
        upNextTitle: string | null;
      }> = [];

      const Probe: React.FC<{isActive?: boolean; refreshTrigger?: number}> = ({
        isActive = true,
        refreshTrigger = 0,
      }) => {
        const {data} = useDashboardData({
          userId: uid,
          refreshTrigger,
          isActive,
          onRefresh: jest.fn(),
        });
        observedFrames.push({
          greetingName: data.greetingName,
          upNextMode: data.upNext.mode,
          upNextTitle: data.upNext.primaryItem?.title ?? null,
        });
        return null;
      };

      const utils = render(<Probe />);
      await waitFor(() => {
        expect(observedFrames.length).toBeGreaterThan(0);
      });

      // Frame 0 (first synchronous render) must already have the real user name and Up Next item.
      expect(observedFrames[0]).toEqual({
        greetingName: 'Juan',
        upNextMode: 'upcoming',
        upNextTitle: 'CS 401 · Compilers',
      });
      expect(
        observedFrames.some(
          f => f.greetingName === 'Student' || f.upNextMode === 'wrapped_up',
        ),
      ).toBe(false);

      // Switching away and back within the same minute with no changes does not flicker.
      const countBeforeSwitch = observedFrames.length;
      utils.rerender(<Probe isActive={false} />);
      utils.rerender(<Probe isActive />);
      expect(observedFrames.length).toBe(countBeforeSwitch + 2);
    });

    test('uses warmed layer-visibility cache on first frame and updates when refreshTrigger increments while inactive', async () => {
      const fixedNow = new Date(2026, 10, 12, 9, 30, 0);
      jest.useFakeTimers().setSystemTime(fixedNow);

      const memFiles = new Map<string, string>();
      jest
        .spyOn(RNFS, 'exists')
        .mockImplementation(async path => memFiles.has(path));
      jest.spyOn(RNFS, 'readFile').mockImplementation(async path => {
        const val = memFiles.get(path);
        if (val === undefined) throw new Error('ENOENT');
        return val;
      });
      jest.spyOn(RNFS, 'writeFile').mockImplementation(async (path, data) => {
        memFiles.set(path, data);
      });

      const uid = makeUser('cached-vis');
      const todayStr = formatLocalDateStr(fixedNow);

      timeBlocksStore.insert({
        id: 'cls-vis-hidden',
        userId: uid,
        title: 'Hidden Imported Class',
        date: todayStr,
        startTime: '10:00',
        endTime: '11:00',
        color: '#2563EB',
        category: 'Class',
      });
      timeBlocksStore.insert({
        id: 'cls-vis-shown',
        userId: uid,
        title: 'Main Schedule Class',
        date: todayStr,
        startTime: '13:00',
        endTime: '14:00',
        color: '#2563EB',
        category: 'Class',
      });

      await importedBatchesStore.saveImportedBatch(
        uid,
        'cor.ics',
        [],
        ['cls-vis-hidden'],
        [],
      );
      const batches = await importedBatchesStore.getImportedBatches(uid);
      expect(batches).toHaveLength(1);
      await calendarVisibilityStore.setVisibility(uid, batches[0].id, false);

      const firstRenderTitles: Array<string | null> = [];
      const Probe: React.FC<{isActive: boolean; refreshTrigger: number}> = ({
        isActive,
        refreshTrigger,
      }) => {
        const {data} = useDashboardData({
          userId: uid,
          refreshTrigger,
          isActive,
          onRefresh: jest.fn(),
        });
        firstRenderTitles.push(data.upNext.primaryItem?.title ?? null);
        return null;
      };

      const utils = render(<Probe isActive refreshTrigger={0} />);
      // Frame 0 already excludes the hidden imported batch.
      expect(firstRenderTitles[0]).toBe('Main Schedule Class');
      expect(firstRenderTitles).not.toContain('Hidden Imported Class');

      // While inactive, a refreshTrigger update prepares fresh data before returning Home.
      utils.rerender(<Probe isActive={false} refreshTrigger={0} />);
      timeBlocksStore.insert({
        id: 'cls-vis-new',
        userId: uid,
        title: 'Newly Added Earlier Class',
        date: todayStr,
        startTime: '10:30',
        endTime: '11:30',
        color: '#059669',
        category: 'Class',
      });
      utils.rerender(<Probe isActive={false} refreshTrigger={1} />);
      utils.rerender(<Probe isActive refreshTrigger={1} />);

      await waitFor(() => {
        expect(firstRenderTitles[firstRenderTitles.length - 1]).toBe(
          'Newly Added Earlier Class',
        );
      });
    });

    test('renders redesigned Today timeline (past check, live Free time + Focus, upcoming) and wires all 4 Quick Actions', async () => {
      const fixedNow = new Date(2026, 10, 24, 18, 2, 0); // Tue Nov 24, 6:02 PM
      jest.useFakeTimers().setSystemTime(fixedNow);

      const uid = makeUser('redesign');
      const todayStr = formatLocalDateStr(fixedNow);

      // Confirm USTP COR so Ask USTP quick action appears
      studentSetupStore.update(uid, {
        affiliation: 'ustp',
        corStatus: 'confirmed',
        confirmedImportId: 'imp-redesign-1',
      });
      academicProfileStore.save(
        uid,
        {
          isUstpStudent: true,
          campus: 'CDO',
          registrationNo: '',
          studentNo: '',
          fullName: 'John Doe',
          formattedName: 'John',
          preferredName: 'John',
          gender: '',
          age: null,
          nationality: '',
          college: '',
          collegeShort: '',
          program: 'BSIT',
          major: '',
          yearLevel: '4th Year',
          yearLevelShort: '4th Yr',
          curriculum: '',
          academicTerm: '',
          academicYearTerm: '',
          section: 'IT4R11',
          primarySection: 'IT4R11',
          totalUnits: '',
          totalLecUnits: null,
          totalLabUnits: null,
          totalCreditUnits: null,
          courses: [],
          provenance: null,
        },
        undefined,
        {
          provenance: {
            source: 'cor_review',
            importId: 'imp-redesign-1',
            reviewedAt: fixedNow.toISOString(),
          },
        },
      );

      timeBlocksStore.insert({
        id: 'cls-past-1',
        userId: uid,
        title: 'IT413 · Social and Professional Issues',
        date: todayStr,
        startTime: '11:30',
        endTime: '13:00',
        color: '#2563EB',
        category: 'Class',
        notes: 'Room: 51-204',
      });
      timeBlocksStore.insert({
        id: 'cls-next-1',
        userId: uid,
        title: 'Capstone Review',
        date: todayStr,
        startTime: '19:00',
        endTime: '20:00',
        color: '#C24B14',
        category: 'Class',
        notes: 'Room: Lab 3',
      });

      const onRefresh = jest.fn();
      const onOpenCalendarTab = jest.fn();
      const onOpenNotesTab = jest.fn();
      const onOpenChatTab = jest.fn();
      const onOpenAskUstp = jest.fn();
      const onOpenSkill = jest.fn();

      const utils = render(
        <ThemeProvider userId={uid} initialModernTheme="sunset">
          <DashboardScreen
            userId={uid}
            refreshTrigger={0}
            onRefresh={onRefresh}
            onOpenCalendarTab={onOpenCalendarTab}
            onOpenNotesTab={onOpenNotesTab}
            onOpenChatTab={onOpenChatTab}
            onOpenAskUstp={onOpenAskUstp}
            onOpenSkill={onOpenSkill}
          />
        </ThemeProvider>,
      );

      // Greeting + countdown ring + timeline states
      expect(utils.getByText('Good evening, John')).toBeTruthy();
      expect(utils.getByText('58')).toBeTruthy();
      expect(utils.getByText('min to go')).toBeTruthy();
      expect(utils.getByTestId('home-timeline-done-cls-past-1')).toBeTruthy();
      expect(utils.getByTestId('home-timeline-free-now')).toBeTruthy();
      expect(utils.getByText('Free time · 58 min')).toBeTruthy();
      expect(utils.getByText('Until 7:00 PM')).toBeTruthy();

      // Quick Action: Focus -> launches Pomodoro skill
      fireEvent.press(utils.getByTestId('home-quick-focus'));
      expect(onOpenSkill).toHaveBeenCalledWith({
        skill: 'pomodoro',
        action: 'open',
      });

      // Timeline Focus CTA -> launches Pomodoro skill
      fireEvent.press(utils.getByTestId('home-timeline-focus-btn'));
      expect(onOpenSkill).toHaveBeenCalledTimes(2);

      // Quick Action: Ask USTP -> launches USTP handbook chat
      fireEvent.press(utils.getByTestId('home-quick-ask-ustp'));
      expect(onOpenAskUstp).toHaveBeenCalledTimes(1);

      // Quick Action: Add task -> opens AddTaskEventModal and persists real SQLite task
      fireEvent.press(utils.getByTestId('home-quick-add-task'));
      const titleInput = utils.getByPlaceholderText(
        'Buy groceries, Finish report...',
      );
      fireEvent.changeText(titleInput, 'Prepare Capstone Slides');
      fireEvent.press(utils.getByText('Save'));
      await waitFor(() => {
        expect(
          tasksStore
            .getAllTasks(uid)
            .some(t => t.title === 'Prepare Capstone Slides'),
        ).toBe(true);
      });

      // Quick Action: Set alarm -> opens AlarmEditorModal and creates real SQLite alarm
      fireEvent.press(utils.getByTestId('home-quick-set-alarm'));
      const saveAlarmBtn = utils.getByTestId('alarm-save-button');
      fireEvent.press(saveAlarmBtn);
      await waitFor(() => {
        expect(alarmsStore.list(uid).length).toBeGreaterThanOrEqual(1);
      });
    });

    test('customizes Up Next card style & finish, quick actions, density, and greeting avatar with live persistence', async () => {
      const fixedNow = new Date(2026, 10, 24, 18, 2, 0);
      jest.useFakeTimers().setSystemTime(fixedNow);

      const uid = makeUser('home-custom');
      const todayStr = formatLocalDateStr(fixedNow);

      // 3 completed sessions + 1 upcoming session in 58 min => "3 of 4 done"
      timeBlocksStore.insert({
        id: 'done-1',
        userId: uid,
        title: 'CS 101 · Lecture',
        date: todayStr,
        startTime: '08:00',
        endTime: '09:30',
        color: '#2563EB',
        category: 'Class',
      });
      timeBlocksStore.insert({
        id: 'done-2',
        userId: uid,
        title: 'CS 102 · Lab',
        date: todayStr,
        startTime: '10:00',
        endTime: '12:00',
        color: '#2563EB',
        category: 'Class',
      });
      timeBlocksStore.insert({
        id: 'done-3',
        userId: uid,
        title: 'Study Session',
        date: todayStr,
        startTime: '14:00',
        endTime: '15:30',
        color: '#059669',
        category: 'Learning',
      });
      timeBlocksStore.insert({
        id: 'next-4',
        userId: uid,
        title: 'Capstone Sync',
        date: todayStr,
        startTime: '19:00',
        endTime: '20:00',
        color: '#C24B14',
        category: 'Class',
      });

      const onOpenNotesTab = jest.fn();
      const utils = render(
        <ThemeProvider userId={uid} initialModernTheme="sunset">
          <DashboardScreen
            userId={uid}
            refreshTrigger={0}
            onRefresh={jest.fn()}
            onOpenCalendarTab={jest.fn()}
            onOpenNotesTab={onOpenNotesTab}
            onOpenChatTab={jest.fn()}
          />
        </ThemeProvider>,
      );

      // Default is countdown_ring; long-pressing opens Customize Dashboard
      expect(utils.getByTestId('dashboard-hero-ring')).toBeTruthy();
      expect(utils.getByTestId('home-header-avatar')).toBeTruthy();
      fireEvent(utils.getByTestId('dashboard-widget-up-next'), 'longPress');
      expect(utils.getByText('Customize Dashboard')).toBeTruthy();
      expect(utils.getByTestId('customize-upnext-preview')).toBeTruthy();

      // Switch to Mascot & Progress style + Soft Tint finish
      fireEvent.press(utils.getByTestId('upnext-style-mascot_progress'));
      fireEvent.press(utils.getByTestId('upnext-tone-soft'));
      fireEvent.press(utils.getByTestId('home-density-compact'));
      fireEvent(
        utils.getByTestId('toggle-greeting-avatar'),
        'valueChange',
        false,
      );

      // Swap quick action: remove Focus, add Notes
      fireEvent.press(utils.getByTestId('quick-action-chip-focus'));
      fireEvent.press(utils.getByTestId('quick-action-chip-notes'));

      fireEvent.press(utils.getByTestId('customize-dashboard-done'));

      await waitFor(() => {
        expect(utils.getByTestId('dashboard-hero-mascot')).toBeTruthy();
      });
      expect(utils.getByText('UP NEXT · IN 58 MIN')).toBeTruthy();
      expect(utils.getByText('Your day')).toBeTruthy();
      expect(utils.getByText('3 of 4 done')).toBeTruthy();
      expect(utils.getByTestId('dashboard-hero-segment-0')).toBeTruthy();
      expect(utils.getByTestId('dashboard-hero-segment-3')).toBeTruthy();
      expect(utils.queryByTestId('home-header-avatar')).toBeNull();
      expect(utils.queryByTestId('home-quick-focus')).toBeNull();

      // Newly added Notes quick action navigates cleanly
      fireEvent.press(utils.getByTestId('home-quick-notes'));
      expect(onOpenNotesTab).toHaveBeenCalledTimes(1);

      // Verify persistence in SQLite
      const saved = dashboardConfigStore.get(uid);
      expect(saved.upNextStyle).toBe('mascot_progress');
      expect(saved.upNextTone).toBe('soft');
      expect(saved.homeDensity).toBe('compact');
      expect(saved.showGreetingAvatar).toBe(false);
      expect(saved.quickActions).toContain('notes');
      expect(saved.quickActions).not.toContain('focus');

      // Switch to Orb & Brief, then Compact Glance, then hide Quick Actions
      fireEvent.press(utils.getByTestId('dashboard-customize-btn'));
      fireEvent.press(utils.getByTestId('upnext-style-orb_brief'));
      fireEvent.press(utils.getByTestId('customize-dashboard-done'));
      await waitFor(() => {
        expect(utils.getByTestId('dashboard-hero-orb')).toBeTruthy();
      });

      fireEvent.press(utils.getByTestId('dashboard-customize-btn'));
      fireEvent.press(utils.getByTestId('upnext-style-compact_glance'));
      fireEvent(
        utils.getByTestId('toggle-quick-actions'),
        'valueChange',
        false,
      );
      fireEvent.press(utils.getByTestId('customize-dashboard-done'));
      await waitFor(() => {
        expect(utils.getByTestId('dashboard-hero-compact')).toBeTruthy();
      });
      expect(utils.queryByTestId('home-quick-actions')).toBeNull();

      // Reset restores defaults
      fireEvent.press(utils.getByTestId('dashboard-customize-btn'));
      fireEvent.press(utils.getByTestId('customize-dashboard-reset'));
      fireEvent.press(utils.getByTestId('customize-dashboard-done'));
      await waitFor(() => {
        expect(utils.getByTestId('dashboard-hero-ring')).toBeTruthy();
      });
      expect(utils.getByTestId('home-quick-actions')).toBeTruthy();
      expect(utils.getByTestId('home-header-avatar')).toBeTruthy();
    });

    test('resolveHeroToneColors scales cleanly across all Modern themes in Light and Dark mode', () => {
      for (const theme of MODERN_THEMES) {
        for (const isDarkMode of [false, true]) {
          const palette = getModernPalette(isDarkMode, theme.id);
          const extras = getModernThemeExtras(isDarkMode, theme.id);
          for (const tone of ALL_UP_NEXT_CARD_TONES) {
            const resolved = resolveHeroToneColors(
              tone,
              isDarkMode,
              palette,
              extras,
            );
            expect(resolved.cardBg).toBeTruthy();
            expect(resolved.titleColor).toBeTruthy();
            expect(resolved.pillBg).toBeTruthy();
            expect(resolved.ctaBg).toBeTruthy();
            expect(resolved.segmentFilled).toBeTruthy();
            expect(resolved.segmentEmpty).toBeTruthy();
            expect(resolved.cardBg).not.toBe(resolved.titleColor);
          }
        }
      }
    });
  });
});
