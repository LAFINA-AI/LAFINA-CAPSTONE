import type {
  Event,
  MinFreeGapMinutes,
  StudyPeakHour,
  Task,
  TimeBlock,
  UserPreferences,
} from '../../../storage';
import {parseClassBlockMetadata} from '../../../storage/academicProfileStore';
import {getCategoryColor} from '../../theme/categoryColors';
import {Colors} from '../../theme/colors';
import type {
  DashboardScheduleItem,
  DashboardTasksSummary,
  FreeStudyBlock,
  FreeStudySummary,
  UpNextSummary,
} from './types';

export const formatLocalDateStr = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const addDaysToDate = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const baseEntityId = (id: string): string => {
  const occurIdx = id.indexOf('_occur_');
  return occurIdx < 0 ? id : id.slice(0, occurIdx);
};

export const parseTimeMinutes = (
  hhmm: string | null | undefined,
  treatMidnightAsEnd = false,
): number | null => {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number.parseInt(match[1], 10);
  const m = Number.parseInt(match[2], 10);
  if (!Number.isInteger(h) || !Number.isInteger(m) || m < 0 || m > 59) {
    return null;
  }
  if (h === 24 && m === 0) return 1440;
  if (h < 0 || h > 23) return null;
  const total = h * 60 + m;
  if (treatMidnightAsEnd && total === 0) return 1440;
  return total;
};

export const minutesToHHMM = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(1440, Math.round(minutes)));
  if (clamped === 1440) return '00:00';
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const formatTimeLabel = (hhmm: string): string => {
  const mins = parseTimeMinutes(hhmm);
  if (mins === null) return hhmm;
  const normalized = mins % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`;
};

export const formatDurationMinutes = (totalMinutes: number): string => {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

export const formatCountdownText = (minutes: number): string => {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
};

export const getTimeOfDayGreeting = (now: Date): string => {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export const buildDayScheduleItems = (
  dateStr: string,
  blocks: readonly TimeBlock[],
  events: readonly Event[],
): DashboardScheduleItem[] => {
  const items: DashboardScheduleItem[] = [];

  for (const block of blocks) {
    if (block.date !== dateStr) continue;
    const startMinutes = parseTimeMinutes(block.startTime, false);
    const endMinutes = parseTimeMinutes(block.endTime, true);
    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      continue;
    }
    const isClass = block.category.toLowerCase() === 'class';
    const meta = isClass ? parseClassBlockMetadata(block.notes) : null;
    const trimmedNotes = block.notes?.trim() || null;

    items.push({
      id: block.id,
      baseId: baseEntityId(block.id),
      kind: isClass ? 'class' : 'block',
      title: block.title,
      date: block.date,
      startTime: block.startTime,
      endTime: block.endTime,
      startMinutes,
      endMinutes,
      color: block.color || getCategoryColor(block.category),
      category: block.category || 'Time Block',
      subtitle: isClass
        ? meta?.summaryLine ?? null
        : trimmedNotes || block.category || null,
      room: meta?.room ?? null,
      section: meta?.section ?? null,
      faculty: meta?.faculty ?? null,
    });
  }

  for (const event of events) {
    if (event.date !== dateStr) continue;
    const startMinutes = parseTimeMinutes(event.startTime, false);
    const endMinutes = parseTimeMinutes(event.endTime, true);
    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      continue;
    }

    items.push({
      id: event.id,
      baseId: baseEntityId(event.id),
      kind: 'event',
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      startMinutes,
      endMinutes,
      color: Colors.blue,
      category: 'Event',
      subtitle: event.location?.trim() || null,
      room: event.location?.trim() || null,
      section: null,
      faculty: null,
    });
  }

  return items.sort(
    (a, b) =>
      a.startMinutes - b.startMinutes ||
      a.endMinutes - b.endMinutes ||
      a.title.localeCompare(b.title),
  );
};

export const computeUpNextSummary = (
  todayItems: readonly DashboardScheduleItem[],
  tomorrowItems: readonly DashboardScheduleItem[],
  now: Date,
): UpNextSummary => {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const liveItems = todayItems.filter(
    item => item.startMinutes <= nowMinutes && item.endMinutes > nowMinutes,
  );
  const nextToday =
    todayItems.find(item => item.startMinutes > nowMinutes) ?? null;
  const tomorrowPreview = tomorrowItems[0] ?? null;

  if (liveItems.length > 0) {
    // Prefer an active class over overlapping generic blocks if both exist.
    const primary =
      liveItems.find(item => item.kind === 'class') ?? liveItems[0];
    const total = Math.max(1, primary.endMinutes - primary.startMinutes);
    const elapsed = Math.max(0, nowMinutes - primary.startMinutes);
    const remaining = Math.max(0, primary.endMinutes - nowMinutes);
    const progressPercent = Math.min(100, Math.round((elapsed / total) * 100));

    return {
      mode: 'live',
      primaryItem: primary,
      followingItem: nextToday,
      tomorrowPreview,
      progressPercent,
      minutesRemaining: remaining,
      minutesUntilStart: null,
    };
  }

  if (nextToday) {
    const followingIndex = todayItems.indexOf(nextToday) + 1;
    const following =
      followingIndex > 0 && followingIndex < todayItems.length
        ? todayItems[followingIndex]
        : null;
    return {
      mode: 'upcoming',
      primaryItem: nextToday,
      followingItem: following,
      tomorrowPreview,
      progressPercent: 0,
      minutesRemaining: null,
      minutesUntilStart: Math.max(1, nextToday.startMinutes - nowMinutes),
    };
  }

  return {
    mode: 'wrapped_up',
    primaryItem: null,
    followingItem: null,
    tomorrowPreview,
    progressPercent: 100,
    minutesRemaining: null,
    minutesUntilStart: null,
  };
};

const PEAK_HOUR_RANGES: Record<
  StudyPeakHour,
  {start: number; end: number; label: string}
> = {
  morning: {start: 360, end: 600, label: 'Morning peak'},
  late_morning: {start: 600, end: 720, label: 'Late morning peak'},
  afternoon: {start: 720, end: 1020, label: 'Afternoon peak'},
  evening: {start: 1020, end: 1260, label: 'Evening peak'},
  night: {start: 1260, end: 1440, label: 'Night peak'},
};

const findPeakOverlapLabel = (
  startMin: number,
  endMin: number,
  peakHours: readonly StudyPeakHour[],
): string | null => {
  const minOverlap = Math.min(15, endMin - startMin);
  let bestOverlap = 0;
  let bestLabel: string | null = null;
  for (const peak of peakHours) {
    const range = PEAK_HOUR_RANGES[peak];
    if (!range) continue;
    const overlap =
      Math.min(endMin, range.end) - Math.max(startMin, range.start);
    if (overlap >= minOverlap && overlap > bestOverlap) {
      bestOverlap = overlap;
      bestLabel = range.label;
    }
  }
  return bestLabel;
};

const STUDY_CATEGORIES = new Set(['learning', 'academic', 'study']);

export const computeFreeStudySummary = (
  todayItems: readonly DashboardScheduleItem[],
  preferences: UserPreferences,
  now: Date,
  minFreeGapMinutes: MinFreeGapMinutes,
): FreeStudySummary => {
  const wakeMin = parseTimeMinutes(preferences.wakeTime, false) ?? 7 * 60;
  const rawSleepMin = parseTimeMinutes(preferences.sleepTime, true) ?? 23 * 60;
  // Sleep times like 00:00 or 01:00 represent the end of the waking day.
  const windowEnd = rawSleepMin <= wakeMin ? 1440 : rawSleepMin;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const effectiveStart = Math.max(wakeMin, nowMin);

  const plannedStudyMinutesToday = todayItems.reduce((sum, item) => {
    if (
      item.kind === 'block' &&
      STUDY_CATEGORIES.has(item.category.toLowerCase())
    ) {
      return sum + (item.endMinutes - item.startMinutes);
    }
    return sum;
  }, 0);

  if (effectiveStart >= windowEnd) {
    return {
      wakeTime: preferences.wakeTime,
      sleepTime: preferences.sleepTime,
      dayEnded: true,
      totalRemainingFreeMinutes: 0,
      usableStudyFreeMinutes: 0,
      plannedStudyMinutesToday,
      freeBlocks: [],
    };
  }

  const busyIntervals: Array<{start: number; end: number}> = [];
  for (const item of todayItems) {
    const clippedStart = Math.max(effectiveStart, item.startMinutes);
    const clippedEnd = Math.min(windowEnd, item.endMinutes);
    if (clippedEnd > clippedStart) {
      busyIntervals.push({start: clippedStart, end: clippedEnd});
    }
  }

  busyIntervals.sort((a, b) => a.start - b.start || a.end - b.end);

  const mergedBusy: Array<{start: number; end: number}> = [];
  for (const interval of busyIntervals) {
    const last = mergedBusy[mergedBusy.length - 1];
    if (!last || interval.start > last.end) {
      mergedBusy.push({...interval});
    } else if (interval.end > last.end) {
      last.end = interval.end;
    }
  }

  const rawGaps: Array<{start: number; end: number}> = [];
  let cursor = effectiveStart;
  for (const busy of mergedBusy) {
    if (busy.start > cursor) {
      rawGaps.push({start: cursor, end: busy.start});
    }
    cursor = Math.max(cursor, busy.end);
  }
  if (cursor < windowEnd) {
    rawGaps.push({start: cursor, end: windowEnd});
  }

  const totalRemainingFreeMinutes = rawGaps.reduce(
    (sum, g) => sum + (g.end - g.start),
    0,
  );

  const freeBlocks: FreeStudyBlock[] = [];
  let usableStudyFreeMinutes = 0;

  for (const gap of rawGaps) {
    const durationMinutes = gap.end - gap.start;
    if (durationMinutes < minFreeGapMinutes) continue;
    usableStudyFreeMinutes += durationMinutes;
    const suggestedEndMin = durationMinutes > 120 ? gap.start + 90 : gap.end;
    const peakLabel = findPeakOverlapLabel(
      gap.start,
      gap.end,
      preferences.studyPeakHours,
    );
    freeBlocks.push({
      id: `gap-${gap.start}-${gap.end}`,
      startTime: minutesToHHMM(gap.start),
      endTime: minutesToHHMM(gap.end),
      suggestedEndTime: minutesToHHMM(suggestedEndMin),
      startMinutes: gap.start,
      endMinutes: gap.end,
      durationMinutes,
      isPeakFocus: peakLabel !== null,
      peakLabel,
    });
  }

  return {
    wakeTime: preferences.wakeTime,
    sleepTime: preferences.sleepTime,
    dayEnded: false,
    totalRemainingFreeMinutes,
    usableStudyFreeMinutes,
    plannedStudyMinutesToday,
    freeBlocks,
  };
};

const PRIORITY_RANK: Record<Task['priority'], number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const compareTasks = (a: Task, b: Task): number => {
  const aDate = a.dueDate || '9999-99-99';
  const bDate = b.dueDate || '9999-99-99';
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  const pDiff =
    (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
  if (pDiff !== 0) return pDiff;
  const aTime = a.dueTime || '99:99';
  const bTime = b.dueTime || '99:99';
  if (aTime !== bTime) return aTime.localeCompare(bTime);
  return a.title.localeCompare(b.title);
};

export const summarizeDashboardTasks = (
  overdueResult: {items: Task[]; total: number},
  windowTasks: readonly Task[],
  todayStr: string,
): DashboardTasksSummary => {
  const overdueIds = new Set(overdueResult.items.map(t => t.id));
  const dueTodayTasks: Task[] = [];
  const upcomingTasks: Task[] = [];

  for (const task of windowTasks) {
    if (task.isCompleted || overdueIds.has(task.id)) continue;
    if (task.dueDate === todayStr) {
      dueTodayTasks.push(task);
    } else if (task.dueDate && task.dueDate > todayStr) {
      upcomingTasks.push(task);
    }
  }

  dueTodayTasks.sort(compareTasks);
  upcomingTasks.sort(compareTasks);

  return {
    overdueTasks: overdueResult.items,
    overdueTotal: overdueResult.total,
    dueTodayTasks,
    upcomingTasks,
  };
};
