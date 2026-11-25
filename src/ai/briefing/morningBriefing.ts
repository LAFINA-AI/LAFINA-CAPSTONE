import {plannerQueries} from '../../storage/plannerQueries';
import {addDaysToDate} from '../../storage/eventTime';
import {tasksStore} from '../../storage/tasksStore';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {readOnboardingIdentity} from '../../storage/onboardingMemory';
import {studentSetupStore} from '../../storage/studentSetupStore';
import {preferencesStore} from '../../storage/preferencesStore';
import type {StudyPeakHour} from '../../storage/preferencesStore';
import {formatAlarmTime} from '../../scheduler/alarmSchedule';
import {onAlarmDismissedForBriefing} from '../../scheduler/alarmService';
import {formatLocalDate} from '../nlu/fastPathParser';
import {inferStudyPeaksFromText} from '../studyPreference';
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

const PEAK_WINDOWS: Record<StudyPeakHour, [number, number, string]> = {
  morning: [7, 10, 'morning'],
  late_morning: [10, 12, 'late morning'],
  afternoon: [13, 17, 'afternoon'],
  evening: [18, 21, 'evening'],
  night: [21, 24, 'night'],
};

const toMins = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const findPeakOpenSlot = (
  peaks: StudyPeakHour[],
  occupied: Array<[number, number]>,
  nowMins: number,
): {time: string; label: string} | null => {
  for (const peak of peaks) {
    const [startH, endH, label] = PEAK_WINDOWS[peak];
    const start = Math.max(startH * 60, Math.ceil(nowMins / 30) * 30);
    const end = endH * 60;
    for (let cursor = start; cursor + 60 <= end; cursor += 30) {
      const overlaps = occupied.some(
        ([s, e]) => Math.max(cursor, s) < Math.min(cursor + 60, e),
      );
      if (!overlaps) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, '0');
        const mm = String(cursor % 60).padStart(2, '0');
        return {time: `${hh}:${mm}`, label};
      }
    }
  }
  return null;
};

/** The words of the briefing for this owner's day. */
export const buildMorningBriefing = (
  userId: string,
  now: Date = new Date(),
): string => {
  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  let preferredName = '';
  try {
    if (chatMemoryStore.isEnabled(userId)) {
      preferredName = (
        readOnboardingIdentity(userId).preferredName ||
        studentSetupStore.get(userId).preferredName
      )
        .replace(/\s+/g, ' ')
        .trim();
    }
  } catch {
    preferredName = '';
  }
  const addressedGreeting = preferredName
    ? `${greeting}, ${preferredName}`
    : greeting;
  const opening = `${addressedGreeting}. It's ${formatAlarmTime(
    hour,
    now.getMinutes(),
  )}, ${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}.`;

  const today = formatLocalDate(now);
  const yesterday = addDaysToDate(today, -1);
  let window;
  try {
    window = plannerQueries.window(userId, yesterday, today);
  } catch {
    return `${opening} I couldn't read your schedule right now.`;
  }
  const todayEvents = window.events.filter(e => e.date === today);
  const todayBlocks = window.blocks.filter(b => b.date === today);
  const todayTasks = window.tasks.filter(t => t.dueDate === today);
  const timed = [
    ...todayEvents.map(e => ({title: e.title, time: e.startTime})),
    ...todayBlocks.map(b => ({title: b.title, time: b.startTime})),
    ...todayTasks
      .filter(t => !t.isCompleted && t.dueTime)
      .map(t => ({title: t.title, time: t.dueTime as string})),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const due = todayTasks
    .filter(t => !t.isCompleted && !t.dueTime)
    .map(t => spokenTitle(t.title));

  let overdue: string[] = [];
  try {
    overdue = tasksStore
      .getAllTasks(userId)
      .filter(t => t.dueDate && t.dueDate < today && !t.isCompleted)
      .map(t => spokenTitle(t.title));
  } catch {
    overdue = [];
  }

  let peakSlot: {time: string; label: string} | null = null;
  try {
    const storedPrefs = preferencesStore.getStored(userId);
    const storedPeaks = storedPrefs?.studyPeakHours ?? [];
    let memoryPeaks: StudyPeakHour[] = [];
    let newestMemoryAt: string | null = null;
    if (chatMemoryStore.isEnabled(userId)) {
      for (const m of chatMemoryStore.list(userId)) {
        const isStudyMemory =
          m.slotKey === 'onboarding:study' ||
          /^prefers\s+(?:studying|focusing)\b/i.test(m.text) ||
          /\b(?:night\s*owl|early\s*bird|morning\s+person)\b/i.test(m.text) ||
          /\b(?:prefer|prefers|like|likes|love|usually|most\s+productive|best)\b[^.?!]{0,40}\b(?:study|studying|focus|focusing)\b/i.test(
            m.text,
          ) ||
          /\b(?:study|studying|focus|focusing)\b[^.?!]{0,25}\b(?:best|better|prefer|prefers)\b/i.test(
            m.text,
          );
        if (!isStudyMemory) {
          continue;
        }
        const parsed = inferStudyPeaksFromText(m.text);
        if (parsed.length === 0) continue;
        const stampedAt = m.updatedAt || m.createdAt;
        if (!newestMemoryAt || stampedAt > newestMemoryAt) {
          newestMemoryAt = stampedAt;
        }
        for (const p of parsed) {
          if (!memoryPeaks.includes(p)) memoryPeaks.push(p);
        }
      }
    }
    const memoryIsNewer =
      Boolean(newestMemoryAt) &&
      (!storedPrefs?.updatedAt || newestMemoryAt! > storedPrefs.updatedAt);
    const useMemoryPeaks =
      memoryPeaks.length > 0 &&
      (memoryIsNewer || (storedPeaks.length === 0 && !storedPrefs?.updatedAt));
    const activePeaks = useMemoryPeaks ? memoryPeaks : storedPeaks;
    if (activePeaks.length > 0) {
      const occupied: Array<[number, number]> = [];
      const addOccupied = (
        itemDate: string,
        startTime?: string,
        endTime?: string,
      ) => {
        if (!startTime || !endTime) return;
        const s = toMins(startTime);
        const en = toMins(endTime);
        if (itemDate === today) {
          occupied.push([s, en > s ? en : en + 1440]);
        } else if (itemDate === yesterday && en <= s && en > 0) {
          occupied.push([0, en]);
        }
      };
      for (const e of window.events) addOccupied(e.date, e.startTime, e.endTime);
      for (const b of window.blocks) addOccupied(b.date, b.startTime, b.endTime);
      peakSlot = findPeakOpenSlot(
        activePeaks,
        occupied,
        now.getHours() * 60 + now.getMinutes(),
      );
    }
  } catch {
    peakSlot = null;
  }

  if (timed.length === 0 && due.length === 0 && overdue.length === 0) {
    return peakSlot
      ? `${opening} Your schedule is clear today. You have open ${
          peakSlot.label
        } study time starting at ${clock(peakSlot.time)}.`
      : `${opening} Your schedule is clear today.`;
  }

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
  if (overdue.length > 0) {
    const topOverdue = overdue.slice(0, 2);
    const moreOverdue =
      overdue.length > 2 ? `, and ${overdue.length - 2} more` : '';
    parts.push(`Overdue: ${listJoin(topOverdue)}${moreOverdue}.`);
  }
  if (peakSlot) {
    parts.push(
      `Open ${peakSlot.label} study time starts at ${clock(peakSlot.time)}.`,
    );
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
