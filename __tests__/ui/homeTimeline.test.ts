import {
  buildHeroModel,
  buildTodayTimelineRows,
  formatAlarmDayPrefix,
  formatFreeTimeDuration,
  formatHomeTimeRange,
  type NextAlarmOccurrence,
} from '../../src/ui/screens/dashboard/components/modern/homeTimeline';
import type {
  DashboardLoadedData,
  DashboardScheduleItem,
  FreeStudySummary,
} from '../../src/ui/screens/dashboard/types';
import type {Task} from '../../src/storage';

const makeItem = (
  id: string,
  title: string,
  startTime: string,
  endTime: string,
  room: string | null = null,
): DashboardScheduleItem => {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return {
    id,
    baseId: id,
    kind: 'class',
    title,
    date: '2026-11-24',
    startTime,
    endTime,
    startMinutes: sh * 60 + sm,
    endMinutes: eh * 60 + em,
    color: '#C24B14',
    category: 'Class',
    subtitle: room,
    room,
    section: null,
    faculty: null,
  };
};

const baseFreeStudy = (
  overrides: Partial<FreeStudySummary> = {},
): FreeStudySummary => ({
  wakeTime: '07:00',
  sleepTime: '23:00',
  dayEnded: false,
  totalRemainingFreeMinutes: 120,
  usableStudyFreeMinutes: 120,
  plannedStudyMinutesToday: 0,
  freeBlocks: [],
  ...overrides,
});

const baseData = (
  overrides: Partial<DashboardLoadedData> = {},
): DashboardLoadedData => ({
  todayStr: '2026-11-24',
  nowMinutes: 18 * 60 + 2,
  greetingName: 'John',
  academicBadge: null,
  todayItems: [],
  upNext: {
    mode: 'wrapped_up',
    primaryItem: null,
    followingItem: null,
    tomorrowPreview: null,
    progressPercent: 100,
    minutesRemaining: null,
    minutesUntilStart: null,
  },
  freeStudy: baseFreeStudy(),
  tasksSummary: {
    overdueTasks: [],
    overdueTotal: 0,
    dueTodayTasks: [],
    upcomingTasks: [],
    completedCount: 0,
  },
  pendingReminders: [],
  highlightedNotes: [],
  pinnedNotesCount: 0,
  readError: null,
  rawBlocksCount: 0,
  rawEventsCount: 0,
  ...overrides,
});

describe('homeTimeline pure calculations', () => {
  test('formatHomeTimeRange collapses shared AM/PM in 12h mode and preserves 24h mode', () => {
    expect(formatHomeTimeRange('19:00', '20:00', false)).toBe('7:00 – 8:00 PM');
    expect(formatHomeTimeRange('11:30', '13:00', false)).toBe(
      '11:30 AM – 1:00 PM',
    );
    expect(formatHomeTimeRange('19:00', '20:00', true)).toBe('19:00 – 20:00');
  });

  test('formatFreeTimeDuration renders compact minute and hour labels', () => {
    expect(formatFreeTimeDuration(58)).toBe('58 min');
    expect(formatFreeTimeDuration(60)).toBe('1 hr');
    expect(formatFreeTimeDuration(95)).toBe('1h 35m');
  });

  test('buildHeroModel computes real gap progress for upcoming item and live progress for active item', () => {
    const pastClass = makeItem(
      'c1',
      'IT415 · Elective 4',
      '15:00',
      '17:00',
      'Room 1',
    );
    const nextClass = makeItem('c2', 'Project Sync', '19:00', '20:00', 'Lab 2');
    const now = new Date(2026, 10, 24, 18, 2); // 62m past 17:00, 58m before 19:00

    const upcomingHero = buildHeroModel({
      data: baseData({
        todayItems: [pastClass, nextClass],
        upNext: {
          mode: 'upcoming',
          primaryItem: nextClass,
          followingItem: null,
          tomorrowPreview: null,
          progressPercent: 0,
          minutesRemaining: null,
          minutesUntilStart: 58,
        },
      }),
      activeAlarm: null,
      allPendingTasks: [],
      completedTasksCount: 0,
      now,
      timeFormat24h: false,
      ustpEnabled: true,
    });

    expect(upcomingHero.badge).toBe('UP NEXT');
    expect(upcomingHero.pillMeta).toBe('UP NEXT · IN 58 MIN');
    expect(upcomingHero.ringValue).toBe('58');
    expect(upcomingHero.ringCaption).toBe('min to go');
    expect(upcomingHero.dayProgressLabel).toBe('Your day');
    expect(upcomingHero.dayProgressText).toBe('1 of 2 done');
    expect(upcomingHero.dayProgressCompleted).toBe(1);
    expect(upcomingHero.dayProgressTotal).toBe(2);
    // 62 / 120 elapsed in gap
    expect(upcomingHero.ringProgress).toBeCloseTo(62 / 120, 2);
    expect(upcomingHero.subtitle).toBe('Today · 7:00 – 8:00 PM · Lab 2');

    const liveHero = buildHeroModel({
      data: baseData({
        todayItems: [pastClass, nextClass],
        upNext: {
          mode: 'live',
          primaryItem: nextClass,
          followingItem: null,
          tomorrowPreview: null,
          progressPercent: 50,
          minutesRemaining: 30,
          minutesUntilStart: null,
        },
      }),
      activeAlarm: null,
      allPendingTasks: [],
      completedTasksCount: 0,
      now: new Date(2026, 10, 24, 19, 30),
      timeFormat24h: true,
      ustpEnabled: true,
    });

    expect(liveHero.badge).toBe('LIVE NOW');
    expect(liveHero.pillMeta).toBe('LIVE NOW · 30 MIN LEFT');
    expect(liveHero.ringValue).toBe('30');
    expect(liveHero.ringCaption).toBe('min left');
    expect(liveHero.ringProgress).toBe(0.5);
    expect(liveHero.subtitle).toBe('Today · 19:00 – 20:00 · Lab 2');
  });

  test('buildHeroModel handles next_alarm, todo_next, tomorrow, and all_clear fallbacks', () => {
    const now = new Date(2026, 10, 24, 21, 0);
    const alarmAt = new Date(2026, 10, 25, 6, 30);
    const nextAlarm: NextAlarmOccurrence = {
      alarm: {
        id: 'a1',
        userId: 'u1',
        hour: 6,
        minute: 30,
        repeatDays: 0,
        oneShotDate: '2026-11-25',
        label: 'Morning Prep',
        enabled: true,
        snoozeMinutes: 9,
        vibrate: true,
        soundUri: null,
        generation: 1,
        briefing: false,
        nextTriggerAt: alarmAt.toISOString(),
        lastFiredAt: null,
        lastOutcome: null,
        sourceReminderId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      at: alarmAt,
    };

    const alarmHero = buildHeroModel({
      data: baseData(),
      activeAlarm: nextAlarm,
      allPendingTasks: [],
      completedTasksCount: 0,
      now,
      timeFormat24h: false,
      ustpEnabled: false,
    });
    expect(alarmHero.badge).toBe('NEXT ALARM');
    expect(alarmHero.ringValue).toBe('9h 30m');
    expect(alarmHero.ringCaption).toBe('until alarm');

    const pendingTask: Task = {
      id: 't1',
      userId: 'u1',
      title: 'Finish Lab 4',
      dueDate: '2026-11-24',
      dueTime: '23:00',
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const taskHero = buildHeroModel({
      data: baseData(),
      activeAlarm: null,
      allPendingTasks: [pendingTask],
      completedTasksCount: 2,
      now,
      timeFormat24h: false,
      ustpEnabled: false,
    });
    expect(taskHero.badge).toBe('TO DO NEXT');
    expect(taskHero.ringValue).toBe('2/3');
    expect(taskHero.ringCaption).toBe('tasks done');

    const clearHero = buildHeroModel({
      data: baseData(),
      activeAlarm: null,
      allPendingTasks: [],
      completedTasksCount: 0,
      now,
      timeFormat24h: false,
      ustpEnabled: false,
    });
    expect(clearHero.badge).toBe('ALL CLEAR');
    expect(clearHero.ringShowCheck).toBe(true);
  });

  test('buildTodayTimelineRows inserts live Free time row between past and next upcoming items', () => {
    const items = [
      makeItem('c1', 'IT413', '11:30', '13:00', '51-204'),
      makeItem('c2', 'IT415', '15:00', '17:00', 'Modular 1'),
      makeItem('c3', 'Evening Review', '19:00', '20:00', 'Lab 2'),
    ];
    const rows = buildTodayTimelineRows({
      items,
      freeStudy: baseFreeStudy(),
      now: new Date(2026, 10, 24, 18, 2),
      timeFormat24h: false,
    });

    expect(rows.map(r => r.kind)).toEqual([
      'schedule',
      'schedule',
      'free_now',
      'schedule',
    ]);
    expect(rows[0].kind === 'schedule' && rows[0].state).toBe('past');
    expect(rows[2].kind === 'free_now' && rows[2].title).toBe(
      'Free time · 58 min',
    );
    expect(rows[2].kind === 'free_now' && rows[2].subtitle).toBe(
      'Until 7:00 PM',
    );
    expect(rows[3].kind === 'schedule' && rows[3].isNext).toBe(true);
  });

  test('buildTodayTimelineRows replaces Free time row with live session when inside an item', () => {
    const items = [makeItem('c1', 'IT415', '15:00', '17:00', 'Modular 1')];
    const rows = buildTodayTimelineRows({
      items,
      freeStudy: baseFreeStudy(),
      now: new Date(2026, 10, 24, 15, 45),
      timeFormat24h: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('schedule');
    if (rows[0].kind === 'schedule') {
      expect(rows[0].state).toBe('live');
      expect(rows[0].timeLabel).toBe('Now');
      expect(rows[0].remainingLabel).toBe('1h 15m left');
    }
  });

  test('buildTodayTimelineRows does not attach an unrelated later study slot to a short current free gap', () => {
    const items = [makeItem('c1', 'Next Class', '10:15', '11:30', 'Room 2')];
    const laterSlot = {
      id: 'gap-840-960',
      startTime: '14:00',
      endTime: '16:00',
      startMinutes: 14 * 60,
      endMinutes: 16 * 60,
      durationMinutes: 120,
      suggestedEndTime: '15:00',
      suggestedDurationMinutes: 60,
      isPeakFocus: false,
      peakLabel: null,
    };
    const rows = buildTodayTimelineRows({
      items,
      freeStudy: baseFreeStudy({freeBlocks: [laterSlot]}),
      now: new Date(2026, 10, 24, 10, 0),
      timeFormat24h: false,
    });

    const freeRow = rows.find(r => r.kind === 'free_now');
    expect(freeRow).toBeTruthy();
    if (freeRow && freeRow.kind === 'free_now') {
      expect(freeRow.durationMinutes).toBe(15);
      expect(freeRow.matchingStudySlot).toBeNull();
    }
  });

  test('formatAlarmDayPrefix distinguishes Today, Tomorrow, and later weekdays', () => {
    expect(
      formatAlarmDayPrefix(new Date(2026, 10, 24, 22, 0), '2026-11-24'),
    ).toBe('Today');
    expect(
      formatAlarmDayPrefix(new Date(2026, 10, 25, 6, 30), '2026-11-24'),
    ).toBe('Tomorrow');
    expect(
      formatAlarmDayPrefix(new Date(2026, 10, 26, 6, 30), '2026-11-24'),
    ).toBe('Thu');
  });
});
