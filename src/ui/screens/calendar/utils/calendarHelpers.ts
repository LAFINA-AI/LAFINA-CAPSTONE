import type {Event, Reminder, Task, TimeBlock} from '../../../../storage';
import {parseClassBlockMetadata} from '../../../../storage/academicProfileStore';
import type {ScheduleTimelineItem, ViewMode} from '../types';

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const SHORT_WEEKDAYS = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

const FULL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Formats a Date object to "YYYY-MM-DD" in local time. */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Convert an "HH:MM" string into a Date object (today, at that time). */
export const timeStringToDate = (timeStr: string): Date => {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
  return d;
};

/** Format a Date object back to "HH:MM" (24-hour). */
export const dateToTimeString = (d: Date): string => {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

/** Format a "HH:MM" 24-hour string strictly in 12-hour AM/PM display format. */
export const formatTimeForDisplay = (
  timeStr: string,
  _is24Hour?: boolean,
): string => {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const displayMin = m.toString().padStart(2, '0');
  return `${displayHour.toString().padStart(2, '0')}:${displayMin} ${ampm}`;
};

/**
 * Formats an "HH:MM" string in UniGuide compact style ("9:00 AM" / "1:30 PM",
 * or "09:00" when 24-hour preference is enabled).
 */
export const formatCompactTime = (
  timeStr: string,
  is24Hour: boolean = false,
): string => {
  if (!timeStr) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(timeStr.trim());
  if (!match) return timeStr;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const displayMin = String(m).padStart(2, '0');
  if (is24Hour) {
    return `${String(h).padStart(2, '0')}:${displayMin}`;
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${displayMin} ${ampm}`;
};

const formatClockFromDate = (d: Date, is24Hour: boolean = false): string => {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return formatCompactTime(`${hh}:${mm}`, is24Hour);
};

const parseHourAndMinutes = (
  timeStr?: string | null,
): {hour: number; minutes: number} => {
  if (!timeStr) return {hour: 9, minutes: 9 * 60};
  const match = /^(\d{1,2}):(\d{2})/.exec(timeStr.trim());
  if (!match) return {hour: 9, minutes: 9 * 60};
  const h = Math.max(0, Math.min(23, Number(match[1])));
  const m = Math.max(0, Math.min(59, Number(match[2])));
  return {hour: h, minutes: h * 60 + m};
};

/** Returns UniGuide header date label ("Nov 2026" in Month, "16 Nov, 26" in Week/Day). */
export const formatHeaderDateLabel = (
  viewMode: ViewMode,
  selectedDate: Date,
  currentDate: Date,
): string => {
  if (viewMode === 'month') {
    const mon = SHORT_MONTHS[currentDate.getMonth()] ?? '';
    return `${mon} ${currentDate.getFullYear()}`;
  }
  const day = selectedDate.getDate();
  const mon = SHORT_MONTHS[selectedDate.getMonth()] ?? '';
  const yy = String(selectedDate.getFullYear()).slice(-2);
  return `${day} ${mon}, ${yy}`;
};

export const formatShortWeekday = (date: Date): string =>
  SHORT_WEEKDAYS[date.getDay()] ?? '';

export const formatFullWeekday = (date: Date): string =>
  FULL_WEEKDAYS[date.getDay()] ?? '';

export const formatShortMonthDay = (date: Date): string =>
  `${SHORT_MONTHS[date.getMonth()] ?? ''} ${date.getDate()}`;

/** Get header title for the calendar based on view mode and selected date. */
export const getHeaderTitle = (
  viewMode: ViewMode,
  selectedDate: Date,
  currentDate: Date,
  weekDays: Date[],
): string => {
  if (viewMode === 'week') {
    if (weekDays.length === 0) return '';
    const start = weekDays[0];
    const end = weekDays[weekDays.length - 1];
    if (start.getFullYear() !== end.getFullYear()) {
      return `${start.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} - ${end.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}`;
    }
    return `${start.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} - ${end.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}, ${start.getFullYear()}`;
  }
  if (viewMode === 'day') {
    return formatHeaderDateLabel('day', selectedDate, currentDate);
  }
  return currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
};

/** Get days in month with the index of the first day. */
export const getDaysInMonth = (date: Date, weekStartsMonday: boolean) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const rawDay = new Date(year, month, 1).getDay(); // 0=Sunday
  const firstDayIndex = weekStartsMonday ? (rawDay + 6) % 7 : rawDay;
  const totalDays = new Date(year, month + 1, 0).getDate();
  return {firstDayIndex, totalDays};
};

/** Normalizes a reminder's trigger/scheduled instant to local YYYY-MM-DD, or null if invalid. */
export const reminderLocalDate = (r: Reminder): string | null => {
  const raw = r.triggerAt || r.scheduledAt;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalDate(d);
};

/**
 * Builds the sorted list of UniGuide-style timeline items (events, time blocks,
 * tasks, and standalone reminders) for a single local calendar date.
 */
export const buildDayTimelineItems = ({
  date,
  blocks,
  events,
  tasks,
  reminders = [],
  timeFormat24h,
}: {
  date: Date;
  blocks: TimeBlock[];
  events: Event[];
  tasks: Task[];
  reminders?: Reminder[];
  timeFormat24h: boolean;
}): ScheduleTimelineItem[] => {
  const dateStr = formatLocalDate(date);
  const items: ScheduleTimelineItem[] = [];
  const existingTitles = new Set<string>();

  for (const e of events) {
    if (e.date !== dateStr) continue;
    existingTitles.add(e.title.trim().toLowerCase());
    const {hour, minutes} = parseHourAndMinutes(e.startTime);
    items.push({
      id: `event-${e.id}`,
      kind: 'event',
      title: e.title,
      subtitle: e.location?.trim() || 'Class / Event',
      categoryLabel: 'Class / Event',
      timeLabel: `${formatCompactTime(e.startTime, timeFormat24h)} - ${formatCompactTime(e.endTime, timeFormat24h)}`,
      hour,
      sortMinutes: minutes,
      tone: 'peach',
      rawEvent: e,
    });
  }

  for (const b of blocks) {
    if (b.date !== dateStr) continue;
    existingTitles.add(b.title.trim().toLowerCase());
    const {hour, minutes} = parseHourAndMinutes(b.startTime);
    const meta = parseClassBlockMetadata(b.notes);
    const subtitle = meta?.room || b.category || 'Class / Event';
    const categoryLabel =
      b.category === 'Class' ? 'Class / Event' : b.category || 'Class / Event';
    items.push({
      id: `block-${b.id}`,
      kind: 'block',
      title: b.title,
      subtitle,
      categoryLabel,
      timeLabel: `${formatCompactTime(b.startTime, timeFormat24h)} - ${formatCompactTime(b.endTime, timeFormat24h)}`,
      hour,
      sortMinutes: minutes,
      tone: 'peach',
      rawBlock: b,
    });
  }

  for (const t of tasks) {
    if (t.dueDate !== dateStr) continue;
    existingTitles.add(t.title.trim().toLowerCase());
    const {hour, minutes} = parseHourAndMinutes(t.dueTime);
    items.push({
      id: `task-${t.id}`,
      kind: 'task',
      title: t.title,
      subtitle: 'To Do',
      categoryLabel: 'To Do',
      timeLabel: t.dueTime
        ? formatCompactTime(t.dueTime, timeFormat24h)
        : 'Anytime',
      hour,
      sortMinutes: minutes,
      tone: 'mint',
      rawTask: t,
    });
  }

  for (const r of reminders) {
    const rDate = reminderLocalDate(r);
    if (rDate !== dateStr) continue;
    if (existingTitles.has(r.task.trim().toLowerCase())) continue;
    const raw = r.triggerAt || r.scheduledAt;
    const d = new Date(raw);
    const hour = Number.isNaN(d.getTime()) ? 9 : d.getHours();
    const minutes = Number.isNaN(d.getTime())
      ? 9 * 60
      : d.getHours() * 60 + d.getMinutes();
    items.push({
      id: `rem-${r.id}`,
      kind: 'reminder',
      title: r.task,
      subtitle: 'Reminder',
      categoryLabel: 'Reminder',
      timeLabel: Number.isNaN(d.getTime())
        ? ''
        : formatClockFromDate(d, timeFormat24h),
      hour,
      sortMinutes: minutes,
      tone: 'blueSoft',
      rawReminder: r,
    });
  }

  items.sort((a, b) => a.sortMinutes - b.sortMinutes);
  return items;
};
