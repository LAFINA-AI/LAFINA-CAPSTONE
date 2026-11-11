/**
 * Conflict Checker and Free-Slot Alternative Finder (Phase 07, F-033, P07-04).
 *
 * Checks prospective calendar events and time blocks against the student's
 * authoritative SQLite schedule on a specific date. Never silently reschedules;
 * returns detected collisions and proposed grounded alternative time slots.
 */

import {addDaysToDate} from '../../storage/eventTime';
import {plannerQueries} from '../../storage/plannerQueries';

export interface ConflictingItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: 'event' | 'block';
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingItems: ConflictingItem[];
  alternatives: string[];
  warningMessage?: string;
}

/** Parses HH:MM 24-hour string to minutes from midnight (0..1439). */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  return (isNaN(hours) ? 0 : hours) * 60 + (isNaN(minutes) ? 0 : minutes);
}

/** Converts minutes from midnight to HH:MM 24-hour format. */
export function minutesToTime(minutes: number): string {
  const norm = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Checks for collisions with existing events and time blocks on the requested date.
 * If conflicts exist, computes 1-2 free slots of equal duration during typical day hours (08:00 - 20:00).
 */
export function checkScheduleConflict(
  userId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
): ConflictCheckResult {
  if (!date || !startTime || !endTime) {
    return {hasConflict: false, conflictingItems: [], alternatives: []};
  }

  const reqStart = timeToMinutes(startTime);
  const requestedEnd = timeToMinutes(endTime);
  const reqEnd = requestedEnd <= reqStart ? requestedEnd + 1440 : requestedEnd;
  const duration = Math.max(15, reqEnd - reqStart);

  const windowData = plannerQueries.window(
    userId,
    addDaysToDate(date, -1),
    addDaysToDate(date, 1),
  );

  const conflictingItems: ConflictingItem[] = [];
  const occupiedIntervals: Array<{start: number; end: number}> = [];

  // 1. Check events
  for (const event of windowData.events) {
    if (event.id !== excludeId && event.startTime && event.endTime) {
      const dayOffset =
        event.date < date ? -1440 : event.date > date ? 1440 : 0;
      const eStart = dayOffset + timeToMinutes(event.startTime);
      const rawEnd = dayOffset + timeToMinutes(event.endTime);
      const eEnd = rawEnd <= eStart ? rawEnd + 1440 : rawEnd;
      occupiedIntervals.push({start: eStart, end: eEnd});

      // Overlap condition: max(start1, start2) < min(end1, end2)
      if (Math.max(reqStart, eStart) < Math.min(reqEnd, eEnd)) {
        conflictingItems.push({
          id: event.id,
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          type: 'event',
        });
      }
    }
  }

  // 2. Check time blocks
  for (const block of windowData.blocks) {
    if (block.id !== excludeId && block.startTime && block.endTime) {
      const dayOffset =
        block.date < date ? -1440 : block.date > date ? 1440 : 0;
      const bStart = dayOffset + timeToMinutes(block.startTime);
      const rawEnd = dayOffset + timeToMinutes(block.endTime);
      const bEnd = rawEnd <= bStart ? rawEnd + 1440 : rawEnd;
      occupiedIntervals.push({start: bStart, end: bEnd});

      if (Math.max(reqStart, bStart) < Math.min(reqEnd, bEnd)) {
        conflictingItems.push({
          id: block.id,
          title: block.title,
          startTime: block.startTime,
          endTime: block.endTime,
          type: 'block',
        });
      }
    }
  }

  if (conflictingItems.length === 0) {
    return {hasConflict: false, conflictingItems: [], alternatives: []};
  }

  // Sort occupied intervals
  occupiedIntervals.sort((a, b) => a.start - b.start);

  // 3. Find 1-2 free alternative slots between 08:00 (480) and 20:00 (1200)
  const DAY_START = 8 * 60; // 08:00
  const DAY_END = 20 * 60; // 20:00
  const alternatives: string[] = [];

  let candidateStart = DAY_START;
  for (const occ of occupiedIntervals) {
    if (Math.min(DAY_END, occ.start) - candidateStart >= duration) {
      alternatives.push(
        `${minutesToTime(candidateStart)} - ${minutesToTime(
          candidateStart + duration,
        )}`,
      );
      if (alternatives.length >= 2) break;
    }
    candidateStart = Math.max(candidateStart, Math.min(DAY_END, occ.end));
    if (candidateStart >= DAY_END) break;
  }

  if (alternatives.length < 2 && DAY_END - candidateStart >= duration) {
    alternatives.push(
      `${minutesToTime(candidateStart)} - ${minutesToTime(
        candidateStart + duration,
      )}`,
    );
  }

  const titles = conflictingItems
    .map(c => `"${c.title}" (${c.startTime}-${c.endTime})`)
    .join(', ');
  const warningMessage = `Conflicts with ${titles}.`;

  return {
    hasConflict: true,
    conflictingItems,
    alternatives,
    warningMessage,
  };
}
