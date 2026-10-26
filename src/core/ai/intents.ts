import {
  assertDate,
  assertTimezone,
  assertUtc,
  localDateTime,
} from '../domain/scheduleTime';

export interface IntentContext {
  now: string;
  timezone: string;
}
export interface NamedTarget {
  kind: 'task' | 'event';
  title: string;
}
export type Intent =
  | {
      kind: 'create_task';
      title: string;
      at: string | null;
      date: string | null;
      reminder: boolean;
    }
  | {kind: 'create_event'; title: string; startAt: string; endAt: string}
  | {kind: 'move'; target: NamedTarget; at: string}
  | {kind: 'complete' | 'delete'; target: NamedTarget}
  | {kind: 'ack'; target: NamedTarget | null}
  | {kind: 'snooze'; target: NamedTarget | null; minutes: number}
  | {
      kind: 'query';
      scope: 'tasks' | 'agenda';
      date: string | null;
      filter: 'active' | 'completed' | 'all';
    }
  | {kind: 'repeat'};

export type ParseResult =
  | {
      status: 'ready';
      intent: Intent;
      timezone: string;
      confidence: 1;
      needsConfirmation: boolean;
      sourceTargetId: null;
      slots: {present: string[]; missing: []};
    }
  | {
      status: 'clarification' | 'unsupported';
      message: string;
      confidence: 0;
      needsConfirmation: false;
      missingSlots: string[];
    };

export function validateIntentContext(context: IntentContext): void {
  assertUtc(context.now);
  assertTimezone(context.timezone);
}

export function hasControlCharacters(value: string): boolean {
  return [...value].some(character => {
    const point = character.codePointAt(0)!;
    return point < 32 || point === 127;
  });
}

function record(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object)
  ) {
    throw new Error('Use a structured scheduling command.');
  }
  return value as Record<string, unknown>;
}
function keys(row: Record<string, unknown>, expected: string[]): void {
  if (
    Object.keys(row).length !== expected.length ||
    Object.keys(row).some(key => !expected.includes(key))
  ) {
    throw new Error('The scheduling command has unexpected or missing fields.');
  }
}
function title(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    [...value].length > 160 ||
    hasControlCharacters(value)
  ) {
    throw new Error('Use a title of 1–160 characters.');
  }
  return value;
}
function target(value: unknown): NamedTarget {
  const row = record(value);
  keys(row, ['kind', 'title']);
  if (row.kind !== 'task' && row.kind !== 'event') {
    throw new Error('Choose an exact task or event.');
  }
  return {kind: row.kind, title: title(row.title)};
}
function future(value: unknown, context: IntentContext): string {
  if (typeof value !== 'string') {
    throw new Error('Choose an explicit future date and time.');
  }
  assertUtc(value);
  if (value <= context.now) {
    throw new Error('That time has passed. Choose a future date and time.');
  }
  return value;
}

/** Strict JSON-shaped boundary shared by parsing and execution; never accepts SQL,
 * arbitrary tools, target IDs or extra model fields. Confidence is grammar
 * coverage, not a calibrated probability or authorization to perform a write.
 */
export function validateIntent(value: unknown, context: IntentContext): Intent {
  validateIntentContext(context);
  const row = record(value);
  switch (row.kind) {
    case 'create_task': {
      keys(row, ['kind', 'title', 'at', 'date', 'reminder']);
      const at = row.at === null ? null : future(row.at, context);
      if (row.date !== null) {
        if (typeof row.date !== 'string') {
          throw new Error('Choose an exact due date.');
        }
        assertDate(row.date);
        if (row.date < localDateTime(context.now, context.timezone).date) {
          throw new Error('That due date has passed. Choose today or later.');
        }
      }
      if (
        (at !== null && row.date !== null) ||
        typeof row.reminder !== 'boolean' ||
        (row.reminder && at === null)
      ) {
        throw new Error('A reminder needs one explicit date and time.');
      }
      return {
        kind: row.kind,
        title: title(row.title),
        at,
        date: row.date as string | null,
        reminder: row.reminder,
      };
    }
    case 'create_event': {
      keys(row, ['kind', 'title', 'startAt', 'endAt']);
      const startAt = future(row.startAt, context);
      const endAt = future(row.endAt, context);
      const duration = Date.parse(endAt) - Date.parse(startAt);
      if (
        duration < 60_000 ||
        duration > 1440 * 60_000 ||
        duration % 60_000 !== 0
      ) {
        throw new Error('Use an event duration of 1–1440 minutes.');
      }
      return {kind: row.kind, title: title(row.title), startAt, endAt};
    }
    case 'move':
      keys(row, ['kind', 'target', 'at']);
      return {
        kind: row.kind,
        target: target(row.target),
        at: future(row.at, context),
      };
    case 'complete':
    case 'delete': {
      keys(row, ['kind', 'target']);
      const chosen = target(row.target);
      if (row.kind === 'complete' && chosen.kind !== 'task') {
        throw new Error(
          'Task completion is separate from acknowledging an alert.',
        );
      }
      return {kind: row.kind, target: chosen};
    }
    case 'ack':
      keys(row, ['kind', 'target']);
      return {
        kind: row.kind,
        target: row.target === null ? null : target(row.target),
      };
    case 'snooze':
      keys(row, ['kind', 'target', 'minutes']);
      if (
        typeof row.minutes !== 'number' ||
        !Number.isInteger(row.minutes) ||
        row.minutes < 1 ||
        row.minutes > 120
      ) {
        throw new Error('Choose a snooze of 1–120 whole minutes.');
      }
      return {
        kind: row.kind,
        target: row.target === null ? null : target(row.target),
        minutes: row.minutes,
      };
    case 'query':
      keys(row, ['kind', 'scope', 'date', 'filter']);
      if (row.date !== null) {
        if (typeof row.date !== 'string')
          throw new Error('Choose an exact date.');
        assertDate(row.date);
      }
      if (
        typeof row.filter !== 'string' ||
        !['active', 'completed', 'all'].includes(row.filter)
      ) {
        throw new Error('Choose active, completed or all tasks.');
      }
      if (row.scope !== 'tasks' && row.scope !== 'agenda') {
        throw new Error('Choose tasks or the dated agenda.');
      }
      if (row.scope === 'agenda' && row.date === null) {
        throw new Error('Choose a date for the agenda.');
      }
      return {
        kind: row.kind,
        scope: row.scope,
        date: row.date as string | null,
        filter: row.filter as 'active' | 'completed' | 'all',
      };
    case 'repeat':
      keys(row, ['kind']);
      return {kind: row.kind};
    default:
      throw new Error(
        'This command is outside the supported local scheduling grammar.',
      );
  }
}
