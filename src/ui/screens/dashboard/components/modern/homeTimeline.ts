import type {nextAlarm} from '../../../../../scheduler/alarmService';
import {formatAlarmTime} from '../../../../../scheduler/alarmSchedule';
import type {Task} from '../../../../../storage';

export type NextAlarmOccurrence = NonNullable<ReturnType<typeof nextAlarm>>;
import {
  formatDurationMinutes,
  formatTimeLabel,
  parseTimeMinutes,
} from '../../dashboardCalculations';
import type {
  DashboardLoadedData,
  DashboardScheduleItem,
  FreeStudyBlock,
  FreeStudySummary,
} from '../../types';

export type HeroActionKind =
  | 'calendar_item'
  | 'alarms'
  | 'task'
  | 'tomorrow'
  | 'chat';

export interface HomeHeroModel {
  badge: string;
  /** Compact combined badge + timing for Mascot/Orb styles (e.g. "UP NEXT · IN 58 MIN"). */
  pillMeta: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  actionKind: HeroActionKind;
  targetDate?: string;
  targetTask?: Task;
  /** 0..1 progress arc for the circular SVG ring. */
  ringProgress: number;
  /** Big center value inside the ring (e.g. "58", "1h 15m", "3/5"). */
  ringValue: string;
  /** Small caption beneath ringValue (e.g. "min to go", "min left"). */
  ringCaption: string;
  /** When true, show a crisp checkmark icon instead of ringValue text. */
  ringShowCheck?: boolean;
  /** Left label for the segmented day progress bar (e.g. "Your day"). */
  dayProgressLabel: string;
  /** Right label for the segmented day progress bar (e.g. "3 of 4 done"). */
  dayProgressText: string;
  /** Completed count for segmented progress bar. */
  dayProgressCompleted: number;
  /** Total items count for segmented progress bar (0 when wide open). */
  dayProgressTotal: number;
  /** Optional compact preview of what comes after the primary item. */
  followingLabel?: string;
}

export type TodayTimelineRow =
  | {
      id: string;
      kind: 'schedule';
      state: 'past' | 'live' | 'upcoming';
      isNext: boolean;
      timeLabel: string;
      title: string;
      subtitle: string;
      remainingLabel?: string;
      item: DashboardScheduleItem;
    }
  | {
      id: string;
      kind: 'free_now';
      durationMinutes: number;
      title: string;
      subtitle: string;
      matchingStudySlot: FreeStudyBlock | null;
    };

/**
 * Formats a start–end time range cleanly. In 12-hour mode, collapses shared
 * AM/PM suffixes (e.g. "7:00 – 8:00 PM") just like the redesigned Home card.
 */
export const formatHomeTimeRange = (
  startHHMM: string,
  endHHMM: string,
  use24h: boolean,
): string => {
  const startLabel = formatTimeLabel(startHHMM, use24h);
  const endLabel = formatTimeLabel(endHHMM, use24h);
  if (use24h) {
    return `${startLabel} – ${endLabel}`;
  }
  const startParts = startLabel.split(' ');
  const endParts = endLabel.split(' ');
  if (
    startParts.length === 2 &&
    endParts.length === 2 &&
    startParts[1] === endParts[1]
  ) {
    return `${startParts[0]} – ${endParts[0]} ${endParts[1]}`;
  }
  return `${startLabel} – ${endLabel}`;
};

export const formatAlarmDayPrefix = (at: Date, todayStr: string): string => {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  const atStr = `${y}-${m}-${d}`;
  if (atStr === todayStr) return 'Today';
  const todayMidday = new Date(`${todayStr}T12:00:00`);
  if (!Number.isNaN(todayMidday.getTime())) {
    todayMidday.setDate(todayMidday.getDate() + 1);
    const tomorrowStr = `${todayMidday.getFullYear()}-${String(
      todayMidday.getMonth() + 1,
    ).padStart(2, '0')}-${String(todayMidday.getDate()).padStart(2, '0')}`;
    if (atStr === tomorrowStr) return 'Tomorrow';
  }
  return at.toLocaleDateString('en-US', {weekday: 'short'});
};

export const formatFreeTimeDuration = (totalMinutes: number): string => {
  const mins = Math.max(1, Math.round(totalMinutes));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${h} hr` : `${h}h ${rem}m`;
};

const formatRingDuration = (
  totalMinutes: number,
  suffixShort: string,
  suffixLong: string,
): {value: string; caption: string} => {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins <= 0) {
    return {value: '<1', caption: suffixShort};
  }
  if (mins < 60) {
    return {value: String(mins), caption: suffixShort};
  }
  if (mins >= 1440) {
    const days = Math.floor(mins / 1440);
    const remHours = Math.floor((mins % 1440) / 60);
    return {
      value: remHours === 0 ? `${days}d` : `${days}d ${remHours}h`,
      caption: suffixLong,
    };
  }
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return {
    value: rem === 0 ? `${h}h` : `${h}h ${rem}m`,
    caption: suffixLong,
  };
};

export const formatTaskDueCompact = (
  task: Task,
  todayStr: string,
  use24h: boolean,
): string => {
  if (!task.dueDate) return 'No due date';
  if (task.dueDate < todayStr) return 'Overdue';
  if (task.dueDate === todayStr) {
    return task.dueTime
      ? `Today · ${formatTimeLabel(task.dueTime, use24h)}`
      : 'Today';
  }
  const dt = new Date(`${task.dueDate}T12:00:00`);
  const dayLabel = Number.isNaN(dt.getTime())
    ? task.dueDate
    : dt.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  return task.dueTime
    ? `${dayLabel} · ${formatTimeLabel(task.dueTime, use24h)}`
    : dayLabel;
};

const formatPillDuration = (totalMinutes: number): string => {
  const mins = Math.max(1, Math.round(totalMinutes));
  if (mins < 60) return `${mins} MIN`;
  if (mins >= 1440) {
    const days = Math.floor(mins / 1440);
    const remHours = Math.floor((mins % 1440) / 60);
    return remHours === 0 ? `${days}D` : `${days}D ${remHours}H`;
  }
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${h} HR` : `${h}H ${rem}M`;
};

const isOvernightCarryItem = (item: DashboardScheduleItem): boolean =>
  item.id.endsWith('::carry');

const formatMinutesAsHHMM = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const computeDayProgress = (
  todayItems: readonly DashboardScheduleItem[],
  nowMinutes: number,
  completedTasksCount: number,
  pendingTasksCount: number,
): {
  dayProgressLabel: string;
  dayProgressText: string;
  dayProgressCompleted: number;
  dayProgressTotal: number;
} => {
  const todayTotal = todayItems.length;
  if (todayTotal > 0) {
    const done = todayItems.filter(i => i.endMinutes <= nowMinutes).length;
    return {
      dayProgressLabel: 'Your day',
      dayProgressText: `${done} of ${todayTotal} done`,
      dayProgressCompleted: done,
      dayProgressTotal: todayTotal,
    };
  }
  const totalTasks = completedTasksCount + pendingTasksCount;
  if (totalTasks > 0) {
    return {
      dayProgressLabel: 'Your tasks',
      dayProgressText: `${completedTasksCount} of ${totalTasks} done`,
      dayProgressCompleted: completedTasksCount,
      dayProgressTotal: totalTasks,
    };
  }
  return {
    dayProgressLabel: 'Your day',
    dayProgressText: 'Wide open',
    dayProgressCompleted: 0,
    dayProgressTotal: 0,
  };
};

/**
 * Computes the Hero card model and live circular countdown/progress ring
 * strictly from live SQLite dashboard data (zero mock data).
 */
export const buildHeroModel = (options: {
  data: DashboardLoadedData;
  activeAlarm: NextAlarmOccurrence | null;
  allPendingTasks: readonly Task[];
  completedTasksCount: number;
  now: Date;
  timeFormat24h: boolean;
  ustpEnabled: boolean;
}): HomeHeroModel => {
  const {
    data,
    activeAlarm,
    allPendingTasks,
    completedTasksCount,
    now,
    timeFormat24h,
    ustpEnabled,
  } = options;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const primary = data.upNext.primaryItem;
  const dayProgress = computeDayProgress(
    data.todayItems,
    nowMinutes,
    completedTasksCount,
    allPendingTasks.length,
  );
  const following = data.upNext.followingItem;
  const followingLabel = following
    ? `Next · ${formatTimeLabel(following.startTime, timeFormat24h)} · ${
        following.title
      }`
    : undefined;

  // 1. Live class / event / time block right now
  if (data.upNext.mode === 'live' && primary) {
    const remaining = Math.max(
      0,
      data.upNext.minutesRemaining ?? primary.endMinutes - nowMinutes,
    );
    const carry = isOvernightCarryItem(primary);
    const timeRange = carry
      ? `Until ${formatTimeLabel(primary.endTime, timeFormat24h)}`
      : formatHomeTimeRange(primary.startTime, primary.endTime, timeFormat24h);
    const roomSuffix = primary.room ? ` · ${primary.room}` : '';
    const ring = formatRingDuration(remaining, 'min left', 'left');
    const progress = Math.max(
      0.06,
      Math.min(1, (data.upNext.progressPercent || 0) / 100),
    );
    return {
      badge: 'LIVE NOW',
      pillMeta:
        remaining > 0
          ? `LIVE NOW · ${formatPillDuration(remaining)} LEFT`
          : 'LIVE NOW · ENDING SOON',
      title: primary.title,
      subtitle: `${carry ? 'Overnight' : 'Today'} · ${timeRange}${roomSuffix}`,
      ctaLabel: 'View schedule',
      actionKind: 'calendar_item',
      targetDate: primary.date,
      ringProgress: progress,
      ringValue: ring.value,
      ringCaption: ring.caption,
      ...dayProgress,
      followingLabel,
    };
  }

  // 2. Upcoming item today
  if (data.upNext.mode === 'upcoming' && primary) {
    const minsUntil = Math.max(
      1,
      data.upNext.minutesUntilStart ?? primary.startMinutes - nowMinutes,
    );
    const timeRange = formatHomeTimeRange(
      primary.startTime,
      primary.endTime,
      timeFormat24h,
    );
    const roomSuffix = primary.room ? ` · ${primary.room}` : '';
    const ring = formatRingDuration(minsUntil, 'min to go', 'to go');

    // Compute real gap-relative progress from the previous completed session
    // (or a 60-minute approach window when before the first session of the day).
    const pastItems = data.todayItems.filter(i => i.endMinutes <= nowMinutes);
    const prevEnd =
      pastItems.length > 0
        ? Math.max(...pastItems.map(i => i.endMinutes))
        : null;
    let ringProgress: number;
    if (prevEnd !== null && primary.startMinutes > prevEnd) {
      const gapTotal = primary.startMinutes - prevEnd;
      const gapElapsed = Math.max(0, nowMinutes - prevEnd);
      ringProgress = Math.max(0.08, Math.min(0.96, gapElapsed / gapTotal));
    } else {
      const windowMins = minsUntil <= 60 ? 60 : Math.min(240, minsUntil + 30);
      ringProgress = Math.max(0.08, Math.min(0.96, 1 - minsUntil / windowMins));
    }

    return {
      badge: 'UP NEXT',
      pillMeta: `UP NEXT · IN ${formatPillDuration(minsUntil)}`,
      title: primary.title,
      subtitle: `Today · ${timeRange}${roomSuffix}`,
      ctaLabel: 'View schedule',
      actionKind: 'calendar_item',
      targetDate: primary.date,
      ringProgress,
      ringValue: ring.value,
      ringCaption: ring.caption,
      ...dayProgress,
      followingLabel,
    };
  }

  // 3. Next armed clock alarm
  if (activeAlarm) {
    const timeStr = formatAlarmTime(
      activeAlarm.alarm.hour,
      activeAlarm.alarm.minute,
      timeFormat24h,
    );
    const minsUntilAlarm = Math.max(
      1,
      Math.round((activeAlarm.at.getTime() - now.getTime()) / 60_000),
    );
    const dayPrefix = formatAlarmDayPrefix(activeAlarm.at, data.todayStr);
    const ring = formatRingDuration(minsUntilAlarm, 'min left', 'until alarm');
    const ringProgress = Math.max(
      0.08,
      Math.min(0.95, 1 - Math.min(minsUntilAlarm, 720) / 720),
    );
    return {
      badge: 'NEXT ALARM',
      pillMeta: `NEXT ALARM · IN ${formatPillDuration(minsUntilAlarm)}`,
      title: activeAlarm.alarm.label || 'Scheduled Alarm',
      subtitle: `${dayPrefix} · ${timeStr}`,
      ctaLabel: 'View alarm',
      actionKind: 'alarms',
      ringProgress,
      ringValue: ring.value,
      ringCaption: ring.caption,
      ...dayProgress,
    };
  }

  // 4. Pending task fallback
  if (allPendingTasks.length > 0) {
    const firstTask = allPendingTasks[0];
    const totalTasks = completedTasksCount + allPendingTasks.length;
    const progress =
      totalTasks > 0 ? Math.max(0.08, completedTasksCount / totalTasks) : 0.1;
    return {
      badge: 'TO DO NEXT',
      pillMeta: `TO DO NEXT · ${completedTasksCount}/${totalTasks} DONE`,
      title: firstTask.title,
      subtitle: formatTaskDueCompact(firstTask, data.todayStr, timeFormat24h),
      ctaLabel: 'View task',
      actionKind: 'task',
      targetTask: firstTask,
      ringProgress: progress,
      ringValue: `${completedTasksCount}/${totalTasks}`,
      ringCaption: 'tasks done',
      ...dayProgress,
    };
  }

  // 5. Tomorrow preview fallback
  if (data.upNext.tomorrowPreview) {
    const tomorrow = data.upNext.tomorrowPreview;
    const startLabel = formatTimeLabel(tomorrow.startTime, timeFormat24h);
    const pastCount = data.todayItems.length;
    return {
      badge: 'TOMORROW',
      pillMeta: `TOMORROW · ${startLabel.toUpperCase()}`,
      title: tomorrow.title,
      subtitle: `Tomorrow · ${startLabel}${
        tomorrow.room ? ` · ${tomorrow.room}` : ''
      }`,
      ctaLabel: 'View schedule',
      actionKind: 'tomorrow',
      targetDate: tomorrow.date,
      ringProgress: 1,
      ringValue: pastCount > 0 ? `${pastCount}/${pastCount}` : startLabel,
      ringCaption: pastCount > 0 ? 'today done' : 'first up',
      ...dayProgress,
    };
  }

  // 6. All clear fallback
  const todayTotal = data.todayItems.length;
  return {
    badge: 'ALL CLEAR',
    pillMeta: todayTotal > 0 ? 'ALL CLEAR · DAY DONE' : 'ALL CLEAR',
    title: todayTotal > 0 ? 'Wrapped up for today' : 'Your day is wide open',
    subtitle: ustpEnabled
      ? 'Plan study blocks or ask LAFINA about USTP'
      : 'Plan study blocks or ask LAFINA to organize your day',
    ctaLabel: 'Ask LAFINA',
    actionKind: 'chat',
    ringProgress: 1,
    ringValue: todayTotal > 0 ? `${todayTotal}/${todayTotal}` : '',
    ringCaption: todayTotal > 0 ? 'done today' : 'all clear',
    ringShowCheck: todayTotal === 0,
    ...dayProgress,
  };
};

/**
 * Builds the chronological "Today" timeline rows combining real today items
 * and the live "Now" free-time gap row when the student is between sessions.
 */
export const buildTodayTimelineRows = (options: {
  items: readonly DashboardScheduleItem[];
  freeStudy: FreeStudySummary;
  now: Date;
  timeFormat24h: boolean;
  hasLiveUnfilteredItem?: boolean;
  nextUnfilteredStartMinutes?: number | null;
}): TodayTimelineRow[] => {
  const {
    items,
    freeStudy,
    now,
    timeFormat24h,
    hasLiveUnfilteredItem,
    nextUnfilteredStartMinutes,
  } = options;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const past: DashboardScheduleItem[] = [];
  const live: DashboardScheduleItem[] = [];
  const upcoming: DashboardScheduleItem[] = [];

  for (const item of items) {
    if (item.endMinutes <= nowMinutes) {
      past.push(item);
    } else if (
      item.startMinutes <= nowMinutes &&
      item.endMinutes > nowMinutes
    ) {
      live.push(item);
    } else {
      upcoming.push(item);
    }
  }

  const rows: TodayTimelineRow[] = [];

  for (const item of past) {
    const carry = isOvernightCarryItem(item);
    rows.push({
      id: item.id,
      kind: 'schedule',
      state: 'past',
      isNext: false,
      timeLabel: formatTimeLabel(
        carry ? '00:00' : item.startTime,
        timeFormat24h,
      ),
      title: item.title,
      subtitle: carry
        ? `Overnight · Until ${formatTimeLabel(item.endTime, timeFormat24h)}${
            item.room ? ` · ${item.room}` : ''
          }`
        : item.room ||
          item.subtitle ||
          formatHomeTimeRange(item.startTime, item.endTime, timeFormat24h),
      item,
    });
  }

  if (live.length > 0) {
    for (const item of live) {
      const carry = isOvernightCarryItem(item);
      const remaining = Math.max(1, item.endMinutes - nowMinutes);
      rows.push({
        id: item.id,
        kind: 'schedule',
        state: 'live',
        isNext: false,
        timeLabel: 'Now',
        title: item.title,
        subtitle: carry
          ? `Overnight · Until ${formatTimeLabel(item.endTime, timeFormat24h)}${
              item.room ? ` · ${item.room}` : ''
            }`
          : item.room ||
            formatHomeTimeRange(item.startTime, item.endTime, timeFormat24h),
        remainingLabel: `${formatDurationMinutes(remaining)} left`,
        item,
      });
    }
  } else if (items.length > 0 && !hasLiveUnfilteredItem) {
    // Student is currently in a free window (before next item or until sleep).
    const nextItem = upcoming[0] ?? null;
    const rawSleepMin = parseTimeMinutes(freeStudy.sleepTime, true) ?? 23 * 60;
    const wakeMin = parseTimeMinutes(freeStudy.wakeTime, false) ?? 7 * 60;
    const windowEnd = rawSleepMin <= wakeMin ? 1440 : rawSleepMin;

    let gapEndMinutes: number | null = null;
    let untilLabel = '';
    const unfilteredCap =
      typeof nextUnfilteredStartMinutes === 'number' &&
      nextUnfilteredStartMinutes > nowMinutes
        ? nextUnfilteredStartMinutes
        : null;
    if (nextItem) {
      if (unfilteredCap !== null && unfilteredCap < nextItem.startMinutes) {
        gapEndMinutes = unfilteredCap;
        untilLabel = `Until ${formatTimeLabel(
          formatMinutesAsHHMM(unfilteredCap),
          timeFormat24h,
        )}`;
      } else {
        gapEndMinutes = nextItem.startMinutes;
        untilLabel = `Until ${formatTimeLabel(
          nextItem.startTime,
          timeFormat24h,
        )}`;
      }
    } else if (unfilteredCap !== null) {
      gapEndMinutes = unfilteredCap;
      untilLabel = `Until ${formatTimeLabel(
        formatMinutesAsHHMM(unfilteredCap),
        timeFormat24h,
      )}`;
    } else if (!freeStudy.dayEnded && nowMinutes < windowEnd) {
      gapEndMinutes = windowEnd;
      untilLabel =
        windowEnd === 1440
          ? 'Rest of today'
          : `Until ${formatTimeLabel(freeStudy.sleepTime, timeFormat24h)}`;
    }

    if (gapEndMinutes !== null && gapEndMinutes - nowMinutes >= 5) {
      const gapMinutes = gapEndMinutes - nowMinutes;
      const slotEndTarget = Math.min(gapEndMinutes, windowEnd);
      const matchingSlot =
        freeStudy.freeBlocks.find(
          slot =>
            slot.startMinutes <= nowMinutes + 5 &&
            slot.endMinutes >= slotEndTarget - 5,
        ) ?? null;

      rows.push({
        id: `now-free-${nowMinutes}-${gapEndMinutes}`,
        kind: 'free_now',
        durationMinutes: gapMinutes,
        title: `Free time · ${formatFreeTimeDuration(gapMinutes)}`,
        subtitle: untilLabel,
        matchingStudySlot: matchingSlot,
      });
    }
  }

  upcoming.forEach((item, index) => {
    const timeRange = formatHomeTimeRange(
      item.startTime,
      item.endTime,
      timeFormat24h,
    );
    const subParts: string[] = [timeRange];
    if (item.room) {
      subParts.push(item.room);
    }
    rows.push({
      id: item.id,
      kind: 'schedule',
      state: 'upcoming',
      isNext: live.length === 0 && index === 0,
      timeLabel: formatTimeLabel(item.startTime, timeFormat24h),
      title: item.title,
      subtitle: subParts.join(' · '),
      item,
    });
  });

  return rows;
};
