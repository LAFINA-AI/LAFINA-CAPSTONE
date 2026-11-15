import {plannerQueries} from '../../storage/plannerQueries';
import {formatAlarmTime} from '../../scheduler/alarmSchedule';
import {onAlarmDismissedForBriefing} from '../../scheduler/alarmService';
import {formatLocalDate} from '../nlu/fastPathParser';
import {speakTextWithTts} from '../tts/ttsService';

/**
 * Alarm plan A4: the optional morning briefing. After the student dismisses
 * an alarm that has "Morning briefing" on, LAFINA reads today's schedule
 * aloud with the on-device voice (react-native-tts). Built only from local
 * data, so it works offline; never sent anywhere. If speech is unavailable
 * nothing else changes: the same schedule is on Home.
 */

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MAX_SPOKEN_ITEMS = 5;

const spokenTitle = (title: string): string =>
  title.replace(/\s+/g, ' ').trim().slice(0, 80);

const clock = (hhmm: string): string =>
  formatAlarmTime(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));

const listJoin = (items: string[]): string =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** The words of the briefing for this owner's day. */
export const buildMorningBriefing = (
  userId: string,
  now: Date = new Date(),
): string => {
  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const opening = `${greeting}. It's ${formatAlarmTime(
    hour,
    now.getMinutes(),
  )}, ${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}.`;

  const today = formatLocalDate(now);
  let window;
  try {
    window = plannerQueries.window(userId, today, today);
  } catch {
    return `${opening} I couldn't read your schedule right now.`;
  }
  const timed = [
    ...window.events.map(e => ({title: e.title, time: e.startTime})),
    ...window.blocks.map(b => ({title: b.title, time: b.startTime})),
    ...window.tasks
      .filter(t => !t.isCompleted && t.dueTime)
      .map(t => ({title: t.title, time: t.dueTime as string})),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const due = window.tasks
    .filter(t => !t.isCompleted && !t.dueTime)
    .map(t => spokenTitle(t.title));

  if (timed.length === 0 && due.length === 0)
    return `${opening} Your schedule is clear today.`;

  const parts = [opening];
  if (timed.length > 0) {
    const spoken = timed
      .slice(0, MAX_SPOKEN_ITEMS)
      .map(item => `${spokenTitle(item.title)} at ${clock(item.time)}`);
    const more =
      timed.length > MAX_SPOKEN_ITEMS
        ? `, and ${timed.length - MAX_SPOKEN_ITEMS} more`
        : '';
    parts.push(
      `You have ${timed.length} ${
        timed.length === 1 ? 'thing' : 'things'
      } scheduled: ${listJoin(spoken)}${more}.`,
    );
  }
  if (due.length > 0) {
    const spoken = due.slice(0, MAX_SPOKEN_ITEMS);
    const more =
      due.length > MAX_SPOKEN_ITEMS
        ? `, and ${due.length - MAX_SPOKEN_ITEMS} more`
        : '';
    parts.push(`Due today: ${listJoin(spoken)}${more}.`);
  }
  return parts.join(' ');
};

/** Speaks the briefing; resolves false when speech was unavailable. */
export const speakMorningBriefing = async (
  userId: string,
  now: Date = new Date(),
): Promise<boolean> => {
  try {
    await speakTextWithTts(buildMorningBriefing(userId, now));
    return true;
  } catch (error) {
    console.warn('[morningBriefing] Could not speak the briefing:', error);
    return false;
  }
};

/** App lifecycle: listens for dismissed briefing alarms. Returns the cleanup. */
export const startMorningBriefing = (): (() => void) =>
  onAlarmDismissedForBriefing(alarm => {
    void speakMorningBriefing(alarm.userId);
  });
