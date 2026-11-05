/**
 * Reviewed assistant commands (AGY-PORT 04, ADR-018).
 *
 * The assistant never writes a task, block, note or reminder by itself. It
 * prepares a private, in-memory proposal that names exactly what will change,
 * including every default it applied. Nothing is saved until the student
 * presses Confirm. Confirm re-checks the owner, the app session, the expiry and
 * the local revision of every row the proposal read, then writes the item, its
 * linked reminder (the delivery job follows through triggers), the sync outbox
 * and an operation receipt in one transaction. Cancel writes nothing. A repeated
 * Confirm returns the first receipt.
 *
 * Proposals are built only from typed, re-validated fields. Raw model output
 * never becomes a command.
 */
import {db} from '../../storage/database';
import type {DatabaseTransaction} from '../../storage/database';
import {tasksStore} from '../../storage/tasksStore';
import type {Task, Event} from '../../storage/tasksStore';
import {timeBlocksStore} from '../../storage/timeBlocksStore';
import type {TimeBlock} from '../../storage/timeBlocksStore';
import {notesStore} from '../../storage/notesStore';
import type {Note} from '../../storage/notesStore';
import {remindersStore} from '../../storage/remindersStore';
import type {Reminder} from '../../storage/remindersStore';
import {deliveryStore, DeliveryFenceError} from '../../storage/deliveryStore';
import {remindersForSource} from '../../storage/sourceReminders';
import type {
  ReminderSourceKind,
  SourceReminderRow,
} from '../../storage/sourceReminders';
import {assistantOperationStore} from '../../storage/assistantOperationStore';
import type {OperationReceipt} from '../../storage/assistantOperationStore';
import type {RevisionEntityType} from '../../storage/assistantOperationSchema';
import {
  cancelReminderAlarm,
  finishNativeIncomingCall,
  scheduleReminderAlarm,
} from '../../scheduler/reminderAlarm';
import {getReminderPreferences} from '../../scheduler/userPreferences';
import {deletePreCachedReminderAudio} from '../tts/ttsService';
import {generateId} from '../../utils';
import {formatLocalDate} from './fastPathParser';
import {
  addMinutesToTime,
  computeDurationMinutes,
  format12HourTime,
  isRecentReference,
  scoreEntityMatch,
} from './actionExecutor';
import {INTENT_ROUTES} from './intentRoutes';
import type {RingingCallContext} from './intentRoutes';
import type {
  CrudTargetEntityType,
  ParsedIntentType,
  ValidatedIntent,
} from './types';

export type ReviewSurface = 'chat' | 'voice';

/** How long a proposal can be confirmed. It never confirms itself. */
export const REVIEW_TTL_MS = 5 * 60 * 1000;

const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 4000;
const MAX_CATEGORY_LENGTH = 40;
const MATCH_THRESHOLD = 30;
const AMBIGUITY_MARGIN = 10;
const PRIMARY_TYPE_BONUS = 5;
const MAX_CANDIDATES_SHOWN = 5;
const DEFAULT_SNOOZE_MINUTES = 10;

type TargetType = RevisionEntityType;

interface TargetRef {
  readonly type: TargetType;
  readonly id: string;
  readonly title: string;
  readonly revision: number;
}

interface PlannedReminder {
  readonly id: string;
  readonly scheduledAt: string;
  readonly triggerAt: string;
}

type PlannedOperation =
  | {
      op: 'create_task';
      taskId: string;
      title: string;
      dueDate: string | null;
      dueTime: string | null;
      category: string;
      notes: string | null;
      reminder: PlannedReminder | null;
    }
  | {
      op: 'create_time_block';
      blockId: string;
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      category: string;
      notes: string | null;
    }
  | {
      op: 'create_reminder';
      taskId: string;
      title: string;
      date: string;
      time: string;
      category: string;
      details: string | null;
      reminder: PlannedReminder;
    }
  | {
      op: 'create_note';
      noteId: string;
      title: string;
      body: string;
      category: string;
    }
  | {op: 'complete_task'; target: TargetRef}
  | {
      op: 'update_task';
      target: TargetRef;
      title: string;
      dueDate: string | null;
      dueTime: string | null;
      reminderChanges: ReadonlyArray<ReminderChange>;
    }
  | {
      op: 'update_schedule_item';
      target: TargetRef;
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      reminderChanges: ReadonlyArray<ReminderChange>;
    }
  | {op: 'update_note'; target: TargetRef; title: string; body: string}
  | {
      op: 'delete_item';
      target: TargetRef;
      /** The reminders the store cascade will remove, as shown on the card. */
      cascadeReminderIds: readonly string[];
    }
  | {op: 'acknowledge_reminder'; target: TargetRef; generation: number}
  | {
      op: 'snooze_reminder';
      target: TargetRef;
      generation: number;
      minutes: number;
      maxSnoozes: number;
    }
  | {
      op: 'reschedule_reminder';
      target: TargetRef;
      generation: number;
      triggerAt: string;
    };

/**
 * One reminder that follows its task, event or time block when that item is
 * renamed or moved. `title` is the reminder text after the change; `triggerAt`
 * is the new alarm time, or null when only the text changes.
 */
interface ReminderChange {
  ref: TargetRef;
  title: string;
  triggerAt: string | null;
  linked: boolean;
}

/** What the student sees on the review card. Immutable. */
export interface CommandProposal {
  readonly operationId: string;
  readonly ownerId: string;
  readonly surface: ReviewSurface;
  readonly intent: ParsedIntentType;
  /** For example "Create task" or "Delete event". */
  readonly heading: string;
  readonly title: string;
  readonly details: readonly string[];
  /** Every default the assistant filled in, stated plainly. */
  readonly assumptions: readonly string[];
  readonly warnings: readonly string[];
  readonly destructive: boolean;
  readonly expiresAt: number;
  /** One-paragraph summary for the chat transcript and speech. */
  readonly reply: string;
}

export interface ClarificationCandidate {
  readonly type: TargetType;
  readonly title: string;
  readonly when: string | null;
}

export type PrepareResult =
  | {status: 'proposal'; proposal: CommandProposal; reply: string}
  | {
      status: 'clarify';
      reply: string;
      candidates: readonly ClarificationCandidate[];
    }
  | {status: 'invalid'; reply: string};

export type ReviewRefusal =
  | 'not_found'
  | 'expired'
  | 'cancelled'
  | 'owner_mismatch'
  | 'session_ended'
  | 'stale'
  | 'failed';

export type ConfirmResult =
  | {
      status: 'applied';
      receipt: OperationReceipt;
      reply: string;
      /** True when this operation had already been applied; nothing was written again. */
      repeated: boolean;
    }
  | {status: 'refused'; reason: ReviewRefusal; reply: string};

export interface PrepareOptions {
  referenceDate?: Date;
  surface?: ReviewSurface;
  /** Identity of a ringing reminder call; makes `reschedule` target exactly that reminder. */
  ringingCall?: RingingCallContext | null;
}

interface PendingReview {
  readonly proposal: CommandProposal;
  readonly operation: PlannedOperation;
  readonly ownerId: string;
  readonly ownerEpoch: string;
  readonly sessionId: string;
  readonly expiresAt: number;
  state: 'pending' | 'cancelled' | 'refused';
}

class ReviewRefusedError extends Error {
  constructor(readonly reason: ReviewRefusal, readonly userMessage?: string) {
    super(reason);
    this.name = 'ReviewRefusedError';
  }
}

let sessionId = generateId('review_session');
const reviews = new Map<string, PendingReview>();

const REFUSAL_MESSAGES: Record<ReviewRefusal, string> = {
  not_found:
    'That review is no longer available. Nothing was changed. Please ask again.',
  expired:
    'That review expired before it was confirmed. Nothing was changed. Please ask again.',
  cancelled: 'That review was cancelled. Nothing was changed.',
  owner_mismatch:
    'That review belongs to a different account. Nothing was changed.',
  session_ended:
    'That review is from an earlier session. Nothing was changed. Please ask again.',
  stale:
    'Something changed since this review was prepared, so nothing was saved. Please ask again to see the current details.',
  failed: 'I could not save that. Nothing was changed. Please try again.',
};

const refused = (reason: ReviewRefusal, message?: string): ConfirmResult => ({
  status: 'refused',
  reason,
  reply: message || REFUSAL_MESSAGES[reason],
});

// ---------------------------------------------------------------------------
// Typed re-validation of the intent fields
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TARGET_TYPES: readonly CrudTargetEntityType[] = [
  'task',
  'time_block',
  'event',
  'note',
  'reminder',
  'any',
];

class InvalidFieldError extends Error {}

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  // Control characters from a transcript or model output never reach storage.
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
  const trimmed = value.replace(controlChars, '').trim();
  if (!trimmed) return null;
  return trimmed.length > max
    ? `${trimmed.slice(0, max - 1).trimEnd()}…`
    : trimmed;
};

const cleanDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const match =
    typeof value === 'string' ? DATE_PATTERN.exec(value.trim()) : null;
  if (!match) throw new InvalidFieldError('date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (
    year < 2000 ||
    year > 2100 ||
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    throw new InvalidFieldError('date');
  }
  return match[0];
};

const cleanTime = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !TIME_PATTERN.test(value.trim())) {
    throw new InvalidFieldError('time');
  }
  return value.trim();
};

const cleanMinutes = (value: unknown, max: number): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= max ? rounded : null;
};

interface CleanIntent {
  intent: ParsedIntentType;
  title: string | null;
  targetTitle: string | null;
  newTitle: string | null;
  date: string | null;
  time: string | null;
  endTime: string | null;
  targetTime: string | null;
  durationMinutes: number | null;
  rawSnoozeMinutes: unknown;
  details: string | null;
  category: string;
  appendToNote: boolean;
  isCompleted: boolean;
  targetEntityType: CrudTargetEntityType | null;
}

const cleanIntent = (intent: ValidatedIntent): CleanIntent => {
  const rawCategory = cleanText(intent.category, MAX_CATEGORY_LENGTH);
  const targetEntityType = TARGET_TYPES.includes(
    intent.targetEntityType as CrudTargetEntityType,
  )
    ? (intent.targetEntityType as CrudTargetEntityType)
    : null;
  return {
    intent: intent.intent,
    title: cleanText(intent.title, MAX_TITLE_LENGTH),
    targetTitle: cleanText(intent.targetTitle, MAX_TITLE_LENGTH),
    newTitle: cleanText(intent.newTitle, MAX_TITLE_LENGTH),
    date: cleanDate(intent.date),
    time: cleanTime(intent.time),
    endTime: cleanTime(intent.endTime),
    targetTime: cleanTime(intent.targetTime),
    durationMinutes: cleanMinutes(intent.durationMinutes, 24 * 60),
    rawSnoozeMinutes: intent.snoozeMinutes,
    details: cleanText(intent.details, MAX_TEXT_LENGTH),
    category:
      rawCategory && rawCategory !== 'APPEND' ? rawCategory : 'Academic',
    appendToNote: rawCategory === 'APPEND',
    isCompleted: intent.isCompleted === true,
    targetEntityType,
  };
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
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
];

const friendlyDate = (date: string): string => {
  const match = DATE_PATTERN.exec(date);
  if (!match) return date;
  const value = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return `${WEEKDAYS[value.getDay()]}, ${
    MONTHS[value.getMonth()]
  } ${value.getDate()}, ${value.getFullYear()}`;
};

const quote = (title: string): string => `“${title}”`;

const localInstant = (date: string, time: string): number =>
  new Date(`${date}T${time}:00`).getTime();

const localParts = (
  iso: string,
): {date: string | null; time: string | null} => {
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return {date: null, time: null};
  return {
    date: formatLocalDate(value),
    time: `${String(value.getHours()).padStart(2, '0')}:${String(
      value.getMinutes(),
    ).padStart(2, '0')}`,
  };
};

const TYPE_LABELS: Record<TargetType, string> = {
  task: 'task',
  event: 'event',
  time_block: 'time block',
  note: 'note',
  reminder: 'reminder',
};

// ---------------------------------------------------------------------------
// Target resolution with ambiguity detection
// ---------------------------------------------------------------------------

interface Candidate {
  type: TargetType;
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  endTime: string | null;
  createdAt: string;
  score: number;
  task?: Task;
  event?: Event;
  block?: TimeBlock;
  note?: Note;
  reminder?: Reminder;
}

interface TargetQuery {
  title: string | null;
  date: string | null;
  time: string | null;
  endTime: string | null;
}

type Resolution =
  | {kind: 'single'; candidate: Candidate; viaRecent: boolean}
  | {kind: 'ambiguous'; candidates: Candidate[]}
  | {kind: 'none'};

const loadCandidates = (
  userId: string,
  types: readonly TargetType[],
): Candidate[] => {
  const list: Candidate[] = [];
  for (const type of types) {
    if (type === 'task') {
      for (const task of tasksStore.getAllTasks(userId)) {
        list.push({
          type,
          id: task.id,
          title: task.title,
          date: task.dueDate ?? null,
          time: task.dueTime ?? null,
          endTime: null,
          createdAt: task.createdAt || '',
          score: 0,
          task,
        });
      }
    } else if (type === 'event') {
      for (const event of tasksStore.getAllEvents(userId)) {
        list.push({
          type,
          id: event.id,
          title: event.title,
          date: event.date,
          time: event.startTime,
          endTime: event.endTime,
          createdAt: event.createdAt || '',
          score: 0,
          event,
        });
      }
    } else if (type === 'time_block') {
      for (const block of timeBlocksStore.getAll(userId)) {
        list.push({
          type,
          id: block.id,
          title: block.title,
          date: block.date,
          time: block.startTime,
          endTime: block.endTime,
          createdAt: block.createdAt || '',
          score: 0,
          block,
        });
      }
    } else if (type === 'note') {
      for (const note of notesStore.getAll(userId)) {
        list.push({
          type,
          id: note.id,
          title: note.title,
          date: null,
          time: null,
          endTime: null,
          createdAt: note.updatedAt || note.createdAt || '',
          score: 0,
          note,
        });
      }
    } else {
      for (const reminder of remindersStore.getPendingReminders(userId)) {
        const parts = localParts(reminder.scheduledAt || reminder.triggerAt);
        list.push({
          type,
          id: reminder.id,
          title: reminder.task,
          date: parts.date,
          time: parts.time,
          endTime: null,
          createdAt: reminder.createdAt || '',
          score: 0,
          reminder,
        });
      }
    }
  }
  return list;
};

const scoreCandidate = (candidate: Candidate, query: TargetQuery): number => {
  if (candidate.type === 'note' && candidate.note) {
    const titleScore = scoreEntityMatch(
      candidate.note.title,
      null,
      null,
      query.title,
      null,
      null,
    );
    const bodyScore =
      scoreEntityMatch(
        candidate.note.body,
        null,
        null,
        query.title,
        null,
        null,
      ) * 0.7;
    return Math.max(titleScore, bodyScore);
  }
  return scoreEntityMatch(
    candidate.title,
    candidate.date,
    candidate.time,
    query.title,
    query.date,
    query.time,
    candidate.endTime,
    query.endTime,
  );
};

const resolveTarget = (
  userId: string,
  types: readonly TargetType[],
  primary: readonly TargetType[],
  query: TargetQuery,
): Resolution => {
  const pool = loadCandidates(userId, types);
  if (pool.length === 0) return {kind: 'none'};

  if (isRecentReference(query.title)) {
    const preferred = pool.filter(c => primary.includes(c.type));
    const source = preferred.length > 0 ? preferred : pool;
    const newest = [...source].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];
    return {kind: 'single', candidate: newest, viaRecent: true};
  }

  const scored = pool
    .map(candidate => {
      const base = scoreCandidate(candidate, query);
      return {
        ...candidate,
        score:
          base >= MATCH_THRESHOLD && primary.includes(candidate.type)
            ? base + PRIMARY_TYPE_BONUS
            : base,
      };
    })
    .filter(candidate => candidate.score >= MATCH_THRESHOLD)
    .sort(
      (a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt),
    );

  if (scored.length === 0) return {kind: 'none'};
  const best = scored[0];
  const close = scored.filter(
    candidate => candidate.score >= best.score - AMBIGUITY_MARGIN,
  );
  if (close.length > 1)
    return {
      kind: 'ambiguous',
      candidates: close.slice(0, MAX_CANDIDATES_SHOWN),
    };
  return {kind: 'single', candidate: best, viaRecent: false};
};

const describeWhen = (candidate: Candidate): string | null => {
  if (candidate.type === 'note') return null;
  if (!candidate.date && !candidate.time) return null;
  const date = candidate.date ? friendlyDate(candidate.date) : null;
  const time = candidate.time ? format12HourTime(candidate.time) : null;
  return [date, time].filter(Boolean).join(' at ');
};

const clarifyAmbiguous = (
  queryLabel: string,
  candidates: Candidate[],
): PrepareResult => {
  const listed = candidates.map(c => {
    const when = describeWhen(c);
    return `${TYPE_LABELS[c.type]} ${quote(c.title)}${
      when ? ` (${when})` : ''
    }`;
  });
  return {
    status: 'clarify',
    reply: `I found more than one match for ${quote(queryLabel)}: ${listed.join(
      '; ',
    )}. Please say the full name, date or time of the one you mean. Nothing was changed.`,
    candidates: candidates.map(c => ({
      type: c.type,
      title: c.title,
      when: describeWhen(c),
    })),
  };
};

const notFound = (
  label: string,
  query: string | null,
  time: string | null,
): PrepareResult => ({
  status: 'clarify',
  reply: `I could not find a ${label} matching ${quote(
    query || (time ? format12HourTime(time) : 'that request'),
  )}. Nothing was changed.`,
  candidates: [],
});

const refOf = (
  candidate: Candidate,
  executor: DatabaseTransaction = db,
): TargetRef => ({
  type: candidate.type,
  id: candidate.id,
  title: candidate.title,
  revision: assistantOperationStore.revisionOf(
    candidate.type,
    candidate.id,
    executor,
  ),
});

const recentAssumption = (candidate: Candidate): string =>
  `You did not name the item, so this uses your most recent ${
    TYPE_LABELS[candidate.type]
  }.`;

// ---------------------------------------------------------------------------
// Proposal builders
// ---------------------------------------------------------------------------

interface Draft {
  heading: string;
  title: string;
  details: string[];
  assumptions: string[];
  warnings: string[];
  destructive: boolean;
  operation: PlannedOperation;
}

type BuildResult = {draft: Draft} | {result: PrepareResult};

const reminderPlan = (date: string, time: string): PlannedReminder | null => {
  const at = localInstant(date, time);
  if (!Number.isFinite(at) || at <= Date.now()) return null;
  const iso = new Date(at).toISOString();
  return {id: generateId('rem'), scheduledAt: iso, triggerAt: iso};
};

const buildCreateTask = (c: CleanIntent, today: string): BuildResult => {
  const title = c.title;
  if (!title)
    return {
      result: {
        status: 'invalid',
        reply: 'What should the task be called? Nothing was changed.',
      },
    };
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  let dueDate = c.date;
  const dueTime = c.time;
  if (dueTime && !dueDate) {
    dueDate = today;
    assumptions.push(
      `No date was given, so it is due today (${friendlyDate(today)}).`,
    );
  }
  let reminder: PlannedReminder | null = null;
  if (!dueDate) {
    details.push(
      'No due date. It will be listed under Undated tasks in Calendar.',
    );
    details.push('No reminder (no time was given).');
  } else if (!dueTime) {
    details.push(`Due: ${friendlyDate(dueDate)} (date only, no time).`);
    details.push('No reminder (no time was given).');
  } else {
    details.push(
      `Due: ${friendlyDate(dueDate)} at ${format12HourTime(dueTime)}.`,
    );
    reminder = reminderPlan(dueDate, dueTime);
    if (reminder)
      details.push(
        `Reminder: rings at ${format12HourTime(dueTime)}, when it is due.`,
      );
    else
      warnings.push(
        'That time has already passed, so no reminder will be set.',
      );
  }
  details.push(`Category: ${c.category}.`);
  if (c.details) details.push(`Notes: ${c.details}`);
  return {
    draft: {
      heading: 'Create task',
      title,
      details,
      assumptions,
      warnings,
      destructive: false,
      operation: {
        op: 'create_task',
        taskId: generateId('task'),
        title,
        dueDate,
        dueTime: dueDate ? dueTime : null,
        category: c.category,
        notes: c.details,
        reminder,
      },
    },
  };
};

const buildCreateTimeBlock = (c: CleanIntent, today: string): BuildResult => {
  const title = c.title;
  if (!title)
    return {
      result: {
        status: 'invalid',
        reply: 'What should the time block be called? Nothing was changed.',
      },
    };
  const assumptions: string[] = [];
  const date = c.date ?? today;
  if (!c.date)
    assumptions.push(
      `No date was given, so it is scheduled today (${friendlyDate(today)}).`,
    );
  const startTime = c.time ?? '09:00';
  if (!c.time)
    assumptions.push('No start time was given, so it starts at 9:00 AM.');
  let endTime = c.endTime;
  if (!endTime) {
    const duration = c.durationMinutes ?? 60;
    if (!c.durationMinutes)
      assumptions.push('No length was given, so it lasts 1 hour.');
    endTime = addMinutesToTime(startTime, duration);
  }
  if (endTime === startTime) {
    return {
      result: {
        status: 'invalid',
        reply:
          'The block needs an end time after its start. Nothing was changed.',
      },
    };
  }
  return {
    draft: {
      heading: 'Create time block',
      title,
      details: [
        `When: ${friendlyDate(date)}, ${format12HourTime(
          startTime,
        )} to ${format12HourTime(endTime)}.`,
        `Category: ${c.category}.`,
        'No reminder is added for time blocks.',
      ],
      assumptions,
      warnings: [],
      destructive: false,
      operation: {
        op: 'create_time_block',
        blockId: generateId('block'),
        title,
        date,
        startTime,
        endTime,
        category: c.category,
        notes: c.details,
      },
    },
  };
};

const buildCreateReminder = (c: CleanIntent, today: string): BuildResult => {
  const title = c.title;
  if (!title)
    return {
      result: {
        status: 'invalid',
        reply: 'What should I remind you about? Nothing was changed.',
      },
    };
  if (!c.time) {
    return {
      result: {
        status: 'clarify',
        reply: `What time should I remind you about ${quote(
          title,
        )}? I will not guess a time. Nothing was changed.`,
        candidates: [],
      },
    };
  }
  const assumptions: string[] = [];
  const date = c.date ?? today;
  if (!c.date)
    assumptions.push(
      `No date was given, so it rings today (${friendlyDate(today)}).`,
    );
  const reminder = reminderPlan(date, c.time);
  if (!reminder) {
    return {
      result: {
        status: 'clarify',
        reply: `${friendlyDate(date)} at ${format12HourTime(
          c.time,
        )} has already passed. Please say a future time. Nothing was changed.`,
        candidates: [],
      },
    };
  }
  return {
    draft: {
      heading: 'Set reminder',
      title,
      details: [
        `Rings: ${friendlyDate(date)} at ${format12HourTime(c.time)}.`,
        'A matching task is added too, so it shows in your lists.',
      ],
      assumptions,
      warnings: [],
      destructive: false,
      operation: {
        op: 'create_reminder',
        taskId: generateId('task'),
        title,
        date,
        time: c.time,
        category: c.category,
        details: c.details,
        reminder,
      },
    },
  };
};

const buildCreateNote = (c: CleanIntent): BuildResult => {
  const title = c.title || 'Voice Note';
  const body = c.details || c.title || '';
  const assumptions = c.title
    ? []
    : ['No title was given, so it is called “Voice Note”.'];
  const preview = body.length > 160 ? `${body.slice(0, 159)}…` : body;
  return {
    draft: {
      heading: 'Save note',
      title,
      details: [
        preview ? `Text: ${preview}` : 'Text: (empty)',
        `Category: ${c.category}.`,
      ],
      assumptions,
      warnings: [],
      destructive: false,
      operation: {
        op: 'create_note',
        noteId: generateId('note'),
        title,
        body,
        category: c.category,
      },
    },
  };
};

const primaryFor = (
  requested: CrudTargetEntityType | null,
  fallback: TargetType,
): TargetType[] => {
  if (requested === 'any') return [];
  if (requested) return [requested];
  return [fallback];
};

const describeReminderRow = (row: SourceReminderRow): string => {
  const parts = localParts(row.trigger_at);
  const when =
    parts.date && parts.time
      ? ` at ${format12HourTime(parts.time)} on ${friendlyDate(parts.date)}`
      : '';
  return `${quote(row.task)}${when}`;
};

const MAX_REMINDERS_LISTED = 5;

/** Card lines naming exactly the reminders a delete will also remove. */
const describeCascade = (rows: readonly SourceReminderRow[]): string[] => {
  if (rows.length === 0)
    return ['No reminders are attached, so only this item is removed.'];
  const lines = rows
    .slice(0, MAX_REMINDERS_LISTED)
    .map(
      row =>
        `Also removes the reminder ${describeReminderRow(row)}${
          row.linked
            ? '.'
            : ' (it has no link to this item, but it has the same title).'
        }`,
    );
  if (rows.length > MAX_REMINDERS_LISTED) {
    lines.push(
      `And ${
        rows.length - MAX_REMINDERS_LISTED
      } more reminder(s) with the same title.`,
    );
  }
  return lines;
};

const sortedIds = (rows: readonly {id: string}[]): string[] =>
  rows.map(row => row.id).sort();

/**
 * Plan how the reminders of one item follow a rename or a move. Linked
 * reminders and unlinked reminders with the same title (AGY's legacy rule)
 * get the new text, and when `retime` returns an instant they move too. A
 * retime into the past leaves that reminder's time alone, with a warning.
 */
const planReminderChanges = (
  userId: string,
  source: {type: ReminderSourceKind; id: string; title: string},
  newTitle: string,
  retime: ((row: SourceReminderRow) => number) | null,
  moveLabel: string,
  details: string[],
  warnings: string[],
): ReminderChange[] => {
  const renamed = newTitle !== source.title;
  if (!renamed && !retime) return [];
  const rows = remindersForSource(
    db,
    userId,
    source.type,
    source.id,
    source.title,
    ['pending', 'snoozed'],
  );
  const changes: ReminderChange[] = [];
  let moved = 0;
  let pastCount = 0;
  for (const row of rows) {
    let triggerAt: string | null = null;
    if (retime) {
      const at = retime(row);
      if (Number.isFinite(at) && at > Date.now()) {
        triggerAt = new Date(at).toISOString();
        moved += 1;
      } else {
        pastCount += 1;
      }
    }
    const title = renamed ? newTitle : row.task;
    if (!triggerAt && title === row.task) continue;
    changes.push({
      ref: {
        type: 'reminder',
        id: row.id,
        title: row.task,
        revision: assistantOperationStore.revisionOf('reminder', row.id),
      },
      title,
      triggerAt,
      linked: row.linked,
    });
  }
  if (moved > 0) {
    details.push(
      moved === 1
        ? `Its reminder ${moveLabel}.`
        : `Its ${moved} reminders ${moveLabel}.`,
    );
  }
  const renamedCount = renamed ? changes.length : 0;
  if (renamedCount > 0) {
    details.push(
      renamedCount === 1
        ? `Its reminder will say ${quote(newTitle)}.`
        : `Its ${renamedCount} reminders will say ${quote(newTitle)}.`,
    );
  }
  const unlinked = changes.filter(change => !change.linked).length;
  if (unlinked > 0) {
    details.push(
      unlinked === 1
        ? 'This includes 1 reminder with no link to this item that has the same title.'
        : `This includes ${unlinked} reminders with no link to this item that have the same title.`,
    );
  }
  if (pastCount > 0) {
    warnings.push(
      'The new time has already passed, so its reminder keeps its current time.',
    );
  }
  return changes;
};

const buildDelete = (userId: string, c: CleanIntent): BuildResult => {
  const query: TargetQuery = {
    title: c.targetTitle || c.title,
    date: c.date,
    time: c.targetTime || c.time,
    endTime: c.endTime,
  };
  let stages: TargetType[][];
  let primary: TargetType[];
  let label: string;
  if (c.intent === 'delete_note') {
    stages = [['note']];
    primary = ['note'];
    label = 'note';
  } else if (c.intent === 'delete_time_block') {
    stages = [['time_block', 'event', 'task']];
    primary = c.targetEntityType === 'event' ? ['event'] : ['time_block'];
    label = c.targetEntityType === 'event' ? 'event' : 'time block';
  } else if (c.targetEntityType === 'reminder') {
    stages = [['reminder']];
    primary = ['reminder'];
    label = 'reminder';
  } else if (c.targetEntityType === 'note') {
    stages = [['note']];
    primary = ['note'];
    label = 'note';
  } else {
    stages = [
      ['task', 'event', 'time_block'],
      c.targetEntityType === 'any' ? ['reminder', 'note'] : ['reminder'],
    ];
    primary = primaryFor(c.targetEntityType, 'task');
    label = 'scheduled item';
  }

  for (const types of stages) {
    const resolution = resolveTarget(userId, types, primary, query);
    if (resolution.kind === 'ambiguous') {
      return {
        result: clarifyAmbiguous(
          query.title || format12HourTime(query.time) || 'that',
          resolution.candidates,
        ),
      };
    }
    if (resolution.kind === 'single') {
      const candidate = resolution.candidate;
      const typeLabel = TYPE_LABELS[candidate.type];
      const when = describeWhen(candidate);
      const details: string[] = [];
      if (when) details.push(`When: ${when}.`);
      let cascade: SourceReminderRow[] = [];
      if (
        candidate.type === 'task' ||
        candidate.type === 'event' ||
        candidate.type === 'time_block'
      ) {
        cascade = remindersForSource(
          db,
          userId,
          candidate.type,
          candidate.id,
          candidate.title,
          ['pending', 'snoozed'],
        );
        details.push(...describeCascade(cascade));
      } else if (candidate.type === 'reminder') {
        details.push('Only this reminder is removed; nothing else changes.');
      }
      return {
        draft: {
          heading: `Delete ${typeLabel}`,
          title: candidate.title,
          details,
          assumptions: resolution.viaRecent
            ? [recentAssumption(candidate)]
            : [],
          warnings: [],
          destructive: true,
          operation: {
            op: 'delete_item',
            target: refOf(candidate),
            cascadeReminderIds: sortedIds(cascade),
          },
        },
      };
    }
  }
  return {result: notFound(label, query.title, query.time)};
};

const computeEnd = (
  c: CleanIntent,
  start: string,
  currentStart: string,
  currentEnd: string,
): string => {
  if (c.endTime) return c.endTime;
  if (c.durationMinutes) return addMinutesToTime(start, c.durationMinutes);
  if (c.time)
    return addMinutesToTime(
      start,
      computeDurationMinutes(currentStart, currentEnd),
    );
  return currentEnd;
};

const buildScheduleItemUpdate = (
  userId: string,
  candidate: Candidate,
  c: CleanIntent,
  viaRecent: boolean,
): BuildResult => {
  const current = candidate.event ?? candidate.block;
  if (!current)
    return {result: {status: 'invalid', reply: REFUSAL_MESSAGES.failed}};
  const title = c.newTitle || current.title;
  const date = c.date || current.date;
  const startTime = c.time || current.startTime;
  const endTime = computeEnd(c, startTime, current.startTime, current.endTime);
  const typeLabel = TYPE_LABELS[candidate.type];
  if (
    title === current.title &&
    date === current.date &&
    startTime === current.startTime &&
    endTime === current.endTime
  ) {
    return {
      result: {
        status: 'clarify',
        reply: `What should change about the ${typeLabel} ${quote(
          current.title,
        )}? Nothing was changed.`,
        candidates: [],
      },
    };
  }
  const details: string[] = [];
  if (title !== current.title)
    details.push(`Rename: ${quote(current.title)} to ${quote(title)}.`);
  details.push(
    `When: ${friendlyDate(date)}, ${format12HourTime(
      startTime,
    )} to ${format12HourTime(endTime)} (was ${friendlyDate(
      current.date,
    )}, ${format12HourTime(current.startTime)} to ${format12HourTime(
      current.endTime,
    )}).`,
  );
  const warnings: string[] = [];
  const shift =
    localInstant(date, startTime) -
    localInstant(current.date, current.startTime);
  const reminderChanges = planReminderChanges(
    userId,
    {
      type: candidate.type === 'event' ? 'event' : 'time_block',
      id: candidate.id,
      title: current.title,
    },
    title,
    Number.isFinite(shift) && shift !== 0
      ? row => new Date(row.trigger_at).getTime() + shift
      : null,
    'moves with it, keeping the same lead time',
    details,
    warnings,
  );
  return {
    draft: {
      heading: `Change ${typeLabel}`,
      title: current.title,
      details,
      assumptions: viaRecent ? [recentAssumption(candidate)] : [],
      warnings,
      destructive: false,
      operation: {
        op: 'update_schedule_item',
        target: refOf(candidate),
        title,
        date,
        startTime,
        endTime,
        reminderChanges,
      },
    },
  };
};

const buildUpdate = (
  userId: string,
  c: CleanIntent,
  today: string,
): BuildResult => {
  const queryTitle = c.targetTitle || c.title;
  const query: TargetQuery = {
    title: queryTitle,
    date: null,
    time: c.targetTime,
    endTime: null,
  };

  if (c.intent === 'update_note') {
    const resolution = resolveTarget(userId, ['note'], ['note'], query);
    if (resolution.kind === 'ambiguous')
      return {
        result: clarifyAmbiguous(queryTitle || 'that', resolution.candidates),
      };
    if (resolution.kind === 'none' || !resolution.candidate.note)
      return {result: notFound('note', queryTitle, null)};
    const note = resolution.candidate.note;
    const title = c.newTitle || note.title;
    const body = c.details
      ? c.appendToNote && note.body
        ? `${note.body}\n${c.details}`
        : c.details
      : note.body;
    if (title === note.title && body === note.body) {
      return {
        result: {
          status: 'clarify',
          reply: `What should change in the note ${quote(
            note.title,
          )}? Nothing was changed.`,
          candidates: [],
        },
      };
    }
    const details: string[] = [];
    if (title !== note.title)
      details.push(`Rename: ${quote(note.title)} to ${quote(title)}.`);
    if (body !== note.body) {
      details.push(
        c.appendToNote
          ? `Add text: ${c.details}`
          : `Replace the text with: ${c.details}`,
      );
    }
    return {
      draft: {
        heading: 'Change note',
        title: note.title,
        details,
        assumptions: resolution.viaRecent
          ? [recentAssumption(resolution.candidate)]
          : [],
        warnings: [],
        destructive: false,
        operation: {
          op: 'update_note',
          target: refOf(resolution.candidate),
          title,
          body,
        },
      },
    };
  }

  if (c.intent === 'update_time_block') {
    const primary: TargetType[] =
      c.targetEntityType === 'event' ? ['event'] : ['time_block'];
    const resolution = resolveTarget(
      userId,
      ['time_block', 'event'],
      primary,
      query,
    );
    if (resolution.kind === 'ambiguous') {
      return {
        result: clarifyAmbiguous(
          queryTitle || format12HourTime(c.targetTime) || 'that',
          resolution.candidates,
        ),
      };
    }
    if (resolution.kind === 'none') {
      return {
        result: notFound(
          c.targetEntityType === 'event' ? 'event' : 'time block',
          queryTitle,
          c.targetTime,
        ),
      };
    }
    return buildScheduleItemUpdate(
      userId,
      resolution.candidate,
      c,
      resolution.viaRecent,
    );
  }

  // update_task
  const types: TargetType[] =
    c.targetEntityType === 'any' && !c.isCompleted
      ? ['task', 'event', 'time_block']
      : ['task'];
  const resolution = resolveTarget(userId, types, ['task'], query);
  if (resolution.kind === 'ambiguous') {
    return {
      result: clarifyAmbiguous(
        queryTitle || format12HourTime(c.targetTime) || 'that',
        resolution.candidates,
      ),
    };
  }
  if (resolution.kind === 'none')
    return {result: notFound('task', queryTitle, c.targetTime)};
  const candidate = resolution.candidate;
  if (candidate.type !== 'task')
    return buildScheduleItemUpdate(userId, candidate, c, resolution.viaRecent);
  const task = candidate.task as Task;
  const assumptions = resolution.viaRecent ? [recentAssumption(candidate)] : [];

  if (c.isCompleted) {
    if (task.isCompleted) {
      return {
        result: {
          status: 'clarify',
          reply: `The task ${quote(
            task.title,
          )} is already done. Nothing was changed.`,
          candidates: [],
        },
      };
    }
    return {
      draft: {
        heading: 'Mark task done',
        title: task.title,
        details: [
          'Marks the task as completed and turns off its pending reminders.',
        ],
        assumptions,
        warnings: [],
        destructive: false,
        operation: {op: 'complete_task', target: refOf(candidate)},
      },
    };
  }

  const title = c.newTitle || task.title;
  let dueDate = c.date || task.dueDate || null;
  const dueTime = c.time ?? task.dueTime ?? null;
  if (!dueDate && c.time) {
    dueDate = today;
    assumptions.push(
      `The task had no date, so the new time is for today (${friendlyDate(
        today,
      )}).`,
    );
  }
  if (
    title === task.title &&
    dueDate === (task.dueDate || null) &&
    dueTime === (task.dueTime || null)
  ) {
    return {
      result: {
        status: 'clarify',
        reply: `What should change about the task ${quote(
          task.title,
        )}? Nothing was changed.`,
        candidates: [],
      },
    };
  }
  const details: string[] = [];
  const warnings: string[] = [];
  if (title !== task.title)
    details.push(`Rename: ${quote(task.title)} to ${quote(title)}.`);
  details.push(
    dueDate
      ? `Due: ${friendlyDate(dueDate)}${
          dueTime ? ` at ${format12HourTime(dueTime)}` : ' (date only)'
        }.`
      : 'No due date.',
  );
  const timeChanged =
    dueDate !== (task.dueDate || null) || dueTime !== (task.dueTime || null);
  const newAt =
    timeChanged && dueDate && dueTime ? localInstant(dueDate, dueTime) : null;
  const reminderChanges = planReminderChanges(
    userId,
    {type: 'task', id: task.id, title: task.title},
    title,
    newAt === null ? null : () => newAt,
    dueTime ? `moves to ${format12HourTime(dueTime)}` : 'moves',
    details,
    warnings,
  );
  return {
    draft: {
      heading: 'Change task',
      title: task.title,
      details,
      assumptions,
      warnings,
      destructive: false,
      operation: {
        op: 'update_task',
        target: refOf(candidate),
        title,
        dueDate,
        dueTime: dueDate ? dueTime : null,
        reminderChanges,
      },
    },
  };
};

const resolveReminder = (
  userId: string,
  c: CleanIntent,
  ringingCall: RingingCallContext | null | undefined,
  action: string,
): {candidate: Candidate; viaRecent: boolean} | {result: PrepareResult} => {
  if (ringingCall) {
    const reminder = remindersStore.getReminderById(ringingCall.reminderId);
    if (!reminder || reminder.userId !== userId) {
      return {
        result: {
          status: 'invalid',
          reply: 'That reminder is no longer available. Nothing was changed.',
        },
      };
    }
    const parts = localParts(reminder.scheduledAt || reminder.triggerAt);
    return {
      candidate: {
        type: 'reminder',
        id: reminder.id,
        title: reminder.task,
        date: parts.date,
        time: parts.time,
        endTime: null,
        createdAt: reminder.createdAt,
        score: 100,
        reminder,
      },
      viaRecent: false,
    };
  }
  const queryTitle = c.targetTitle || c.title;
  const all = loadCandidates(userId, ['reminder']);
  if (all.length === 0) {
    return {
      result: {
        status: 'invalid',
        reply: `You have no active reminders to ${action}. Nothing was changed.${
          action === 'acknowledge'
            ? ' To finish a task, say “mark it as done” instead.'
            : ''
        }`,
      },
    };
  }
  if (!queryTitle && !c.targetTime) {
    const ringing = all.filter(
      candidate => candidate.reminder?.status === 'triggered',
    );
    if (ringing.length === 1) return {candidate: ringing[0], viaRecent: false};
    if (all.length === 1) return {candidate: all[0], viaRecent: false};
    return {
      result: clarifyAmbiguous(
        'your reminders',
        all.slice(0, MAX_CANDIDATES_SHOWN),
      ),
    };
  }
  const resolution = resolveTarget(userId, ['reminder'], ['reminder'], {
    title: queryTitle,
    date: null,
    time: c.targetTime,
    endTime: null,
  });
  if (resolution.kind === 'ambiguous') {
    return {
      result: clarifyAmbiguous(
        queryTitle || format12HourTime(c.targetTime) || 'that',
        resolution.candidates,
      ),
    };
  }
  if (resolution.kind === 'none') {
    return {
      result: {
        status: 'clarify',
        reply: `There is no active reminder matching ${quote(
          queryTitle || format12HourTime(c.targetTime),
        )}. Nothing was changed.${
          action === 'acknowledge'
            ? ' To finish a task, say “mark it as done” instead.'
            : ''
        }`,
        candidates: [],
      },
    };
  }
  return resolution;
};

const generationOf = (reminderId: string): number =>
  deliveryStore.get(reminderId)?.generation ?? 1;

const buildReminderAction = (
  userId: string,
  c: CleanIntent,
  ringingCall: RingingCallContext | null | undefined,
  today: string,
): BuildResult => {
  const action =
    c.intent === 'acknowledge'
      ? 'acknowledge'
      : c.intent === 'snooze'
      ? 'snooze'
      : 'reschedule';
  const found = resolveReminder(
    userId,
    c,
    c.intent === 'reschedule' ? ringingCall : null,
    action,
  );
  if ('result' in found) return {result: found.result};
  const candidate = found.candidate;
  const reminder = candidate.reminder as Reminder;
  const assumptions = found.viaRecent ? [recentAssumption(candidate)] : [];
  const ref = refOf(candidate);
  const generation =
    c.intent === 'reschedule' && ringingCall
      ? ringingCall.generation
      : generationOf(reminder.id);

  if (c.intent === 'acknowledge') {
    return {
      draft: {
        heading: 'Acknowledge reminder',
        title: reminder.task,
        details: ['Stops this reminder. The task itself is not marked done.'],
        assumptions,
        warnings: [],
        destructive: false,
        operation: {op: 'acknowledge_reminder', target: ref, generation},
      },
    };
  }

  if (c.intent === 'snooze') {
    let minutes = DEFAULT_SNOOZE_MINUTES;
    if (c.rawSnoozeMinutes !== null && c.rawSnoozeMinutes !== undefined) {
      const parsed = cleanMinutes(c.rawSnoozeMinutes, 120);
      if (parsed === null) {
        return {
          result: {
            status: 'clarify',
            reply:
              'Please choose a snooze between 1 and 120 minutes. Nothing was changed.',
            candidates: [],
          },
        };
      }
      minutes = parsed;
    } else {
      assumptions.push(
        `No length was given, so it snoozes for ${DEFAULT_SNOOZE_MINUTES} minutes.`,
      );
    }
    const maxSnoozes = getReminderPreferences(userId).maxSnoozeCount;
    if (reminder.snoozeCount >= maxSnoozes) {
      return {
        result: {
          status: 'invalid',
          reply: `You have reached the limit of ${maxSnoozes} snoozes for this reminder. Nothing was changed.`,
        },
      };
    }
    return {
      draft: {
        heading: 'Snooze reminder',
        title: reminder.task,
        details: [`Rings again ${minutes} minutes after you confirm.`],
        assumptions,
        warnings: [],
        destructive: false,
        operation: {
          op: 'snooze_reminder',
          target: ref,
          generation,
          minutes,
          maxSnoozes,
        },
      },
    };
  }

  // reschedule
  const current = localParts(reminder.triggerAt);
  let at: number;
  let date: string;
  let time: string;
  if (c.time) {
    date = c.date ?? today;
    if (!c.date)
      assumptions.push(
        `No date was given, so it moves to today (${friendlyDate(today)}).`,
      );
    time = c.time;
    at = localInstant(date, time);
  } else if (c.date && current.time) {
    date = c.date;
    time = current.time;
    assumptions.push(
      `No time was given, so it keeps its time of ${format12HourTime(
        current.time,
      )}.`,
    );
    at = localInstant(date, time);
  } else if (c.durationMinutes) {
    at = new Date(reminder.triggerAt).getTime() + c.durationMinutes * 60 * 1000;
    const parts = localParts(new Date(at).toISOString());
    date = parts.date ?? today;
    time = parts.time ?? '00:00';
    assumptions.push(
      `It moves ${c.durationMinutes} minutes later than its current time.`,
    );
  } else {
    return {
      result: {
        status: 'clarify',
        reply: 'When should the reminder ring instead? Nothing was changed.',
        candidates: [],
      },
    };
  }
  if (!Number.isFinite(at) || at <= Date.now()) {
    return {
      result: {
        status: 'clarify',
        reply: `${friendlyDate(date)} at ${format12HourTime(
          time,
        )} has already passed. Please say a future time. Nothing was changed.`,
        candidates: [],
      },
    };
  }
  return {
    draft: {
      heading: 'Move reminder',
      title: reminder.task,
      details: [
        `Rings: ${friendlyDate(date)} at ${format12HourTime(time)}.`,
        'Only the reminder moves; the item it belongs to keeps its time.',
      ],
      assumptions,
      warnings: [],
      destructive: false,
      operation: {
        op: 'reschedule_reminder',
        target: ref,
        generation,
        triggerAt: new Date(at).toISOString(),
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Owner/session binding
// ---------------------------------------------------------------------------

/**
 * Changes when the active account changes, a new sign-in starts, or the owner
 * record is removed (guest linking).
 */
const readOwnerEpoch = (
  ownerId: string,
  executor: DatabaseTransaction = db,
): string => {
  const exists = Number(
    executor.executeSync('SELECT COUNT(*) AS n FROM users WHERE id = ?', [
      ownerId,
    ]).rows?.[0]?.n ?? 0,
  );
  const session = executor.executeSync(
    'SELECT user_id, created_at FROM active_session LIMIT 1',
  ).rows?.[0];
  const active = session?.user_id;
  // The session start changes on every sign-in, so a card prepared before a
  // sign-out never confirms after signing back in, even as the same account.
  const started = session?.created_at;
  return `${exists > 0 ? 1 : 0}|${active == null ? '' : String(active)}|${
    started == null ? '' : String(started)
  }`;
};

const pruneReviews = (now: number): void => {
  for (const [id, review] of reviews) {
    if (review.expiresAt <= now || review.sessionId !== sessionId)
      reviews.delete(id);
  }
};

const composeReply = (draft: Draft): string => {
  const parts = [
    `Please review: ${draft.heading} ${quote(draft.title)}.`,
    ...draft.details,
  ];
  if (draft.assumptions.length > 0) parts.push(...draft.assumptions);
  if (draft.warnings.length > 0) parts.push(...draft.warnings);
  parts.push('Nothing is saved until you press Confirm.');
  return parts.join(' ');
};

/**
 * Turns a validated intent into a private proposal, a clarification, or a
 * refusal. Writes nothing.
 */
export const prepareReviewedCommand = (
  userId: string,
  intent: ValidatedIntent,
  options: PrepareOptions = {},
): PrepareResult => {
  if (
    !intent ||
    typeof intent !== 'object' ||
    typeof intent.intent !== 'string'
  ) {
    return {
      status: 'invalid',
      reply: 'I could not understand that request. Nothing was changed.',
    };
  }
  const spec = Object.prototype.hasOwnProperty.call(
    INTENT_ROUTES,
    intent.intent,
  )
    ? INTENT_ROUTES[intent.intent]
    : undefined;
  if (!spec || spec.kind !== 'reviewed_mutation') {
    return {
      status: 'invalid',
      reply: 'That request does not change your planner. Nothing was changed.',
    };
  }
  if (!intent.isValid) {
    return {
      status: 'invalid',
      reply: `${
        intent.validationError || 'I could not understand that request.'
      } Nothing was changed.`,
    };
  }

  let clean: CleanIntent;
  try {
    clean = cleanIntent(intent);
  } catch (error) {
    if (error instanceof InvalidFieldError) {
      return {
        status: 'invalid',
        reply: `I could not read the ${error.message} in that request. Please say it again. Nothing was changed.`,
      };
    }
    throw error;
  }

  const now = Date.now();
  const today = formatLocalDate(options.referenceDate || new Date());
  const surface: ReviewSurface = options.surface === 'voice' ? 'voice' : 'chat';
  try {
    let built: BuildResult;
    switch (clean.intent) {
      case 'create_task':
        built = buildCreateTask(clean, today);
        break;
      case 'create_time_block':
        built = buildCreateTimeBlock(clean, today);
        break;
      case 'create_reminder':
        built = buildCreateReminder(clean, today);
        break;
      case 'create_note':
        built = buildCreateNote(clean);
        break;
      case 'delete_task':
      case 'delete_time_block':
      case 'delete_note':
        built = buildDelete(userId, clean);
        break;
      case 'update_task':
      case 'update_time_block':
      case 'update_note':
        built = buildUpdate(userId, clean, today);
        break;
      case 'acknowledge':
      case 'snooze':
      case 'reschedule':
        built = buildReminderAction(userId, clean, options.ringingCall, today);
        break;
      default:
        return {
          status: 'invalid',
          reply:
            'That request does not change your planner. Nothing was changed.',
        };
    }
    if ('result' in built) return built.result;

    const ownerEpoch = readOwnerEpoch(userId);
    pruneReviews(now);
    // One open proposal per owner and surface: a newer request replaces the older card.
    for (const review of reviews.values()) {
      if (
        review.ownerId === userId &&
        review.proposal.surface === surface &&
        review.state === 'pending'
      ) {
        review.state = 'cancelled';
      }
    }

    const draft = built.draft;
    const operationId = generateId('op');
    const expiresAt = now + REVIEW_TTL_MS;
    const proposal: CommandProposal = Object.freeze({
      operationId,
      ownerId: userId,
      surface,
      intent: clean.intent,
      heading: draft.heading,
      title: draft.title,
      details: Object.freeze([...draft.details]),
      assumptions: Object.freeze([...draft.assumptions]),
      warnings: Object.freeze([...draft.warnings]),
      destructive: draft.destructive,
      expiresAt,
      reply: composeReply(draft),
    });
    reviews.set(operationId, {
      proposal,
      operation: draft.operation,
      ownerId: userId,
      ownerEpoch,
      sessionId,
      expiresAt,
      state: 'pending',
    });
    return {status: 'proposal', proposal, reply: proposal.reply};
  } catch (error) {
    console.warn('[CommandReview] Could not prepare a review:', error);
    return {
      status: 'invalid',
      reply: 'I could not read your planner right now. Nothing was changed.',
    };
  }
};

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

const TABLES: Record<TargetType, string> = {
  task: 'tasks',
  event: 'events',
  time_block: 'time_blocks',
  note: 'notes',
  reminder: 'reminders',
};

const verifyTarget = (
  tx: DatabaseTransaction,
  ref: TargetRef,
  ownerId: string,
): Record<string, unknown> => {
  const row = tx.executeSync(`SELECT * FROM ${TABLES[ref.type]} WHERE id = ?`, [
    ref.id,
  ]).rows?.[0];
  if (!row || String(row.user_id) !== ownerId)
    throw new ReviewRefusedError('stale');
  if (row.deleted_at !== null && row.deleted_at !== undefined)
    throw new ReviewRefusedError('stale');
  if (
    assistantOperationStore.revisionOf(ref.type, ref.id, tx) !== ref.revision
  ) {
    throw new ReviewRefusedError('stale');
  }
  return row;
};

const requireFuture = (iso: string): void => {
  if (!(new Date(iso).getTime() > Date.now())) {
    throw new ReviewRefusedError(
      'expired',
      'The time in this review has passed while it was waiting. Nothing was changed. Please ask again.',
    );
  }
};

interface Applied {
  operation: string;
  entityType: string | null;
  entityId: string | null;
  reminderId: string | null;
  reply: string;
}

const scheduleAfterCommit = (
  tx: DatabaseTransaction,
  reminderId: string,
  task: string,
  triggerAt: string,
): void => {
  tx.afterCommit?.(() => {
    scheduleReminderAlarm(reminderId, task, triggerAt).catch((error: unknown) =>
      console.warn(
        '[CommandReview] Saved; alarm registration will be retried by reconcile:',
        error,
      ),
    );
  });
};

/** Re-check every reminder a rename or move will touch. */
const verifyReminderChanges = (
  tx: DatabaseTransaction,
  ownerId: string,
  changes: ReadonlyArray<ReminderChange>,
): void => {
  for (const change of changes) {
    verifyTarget(tx, change.ref, ownerId);
    if (change.triggerAt) requireFuture(change.triggerAt);
  }
};

/**
 * Write the reminder text and time in the same transaction as the item, then
 * re-register each alarm after commit with the new text. A renamed reminder
 * drops its pre-recorded speech so the call never speaks the old title.
 */
const applyReminderChanges = (
  tx: DatabaseTransaction,
  changes: ReadonlyArray<ReminderChange>,
): void => {
  for (const change of changes) {
    if (change.triggerAt) {
      remindersStore.updateReminderTriggerAt(
        change.ref.id,
        change.triggerAt,
        tx,
      );
    }
    if (change.title !== change.ref.title) {
      const staleAudio = remindersStore.updateReminderText(
        change.ref.id,
        change.title,
        tx,
      );
      if (staleAudio) {
        tx.afterCommit?.(() => {
          deletePreCachedReminderAudio(staleAudio).catch(() => undefined);
        });
      }
    }
    const row = tx.executeSync(
      'SELECT trigger_at FROM reminders WHERE id = ?',
      [change.ref.id],
    ).rows?.[0];
    const triggerAt = change.triggerAt ?? String(row?.trigger_at ?? '');
    if (new Date(triggerAt).getTime() > Date.now()) {
      scheduleAfterCommit(tx, change.ref.id, change.title, triggerAt);
    }
  }
};

const applyOperation = (
  tx: DatabaseTransaction,
  ownerId: string,
  op: PlannedOperation,
): Applied => {
  switch (op.op) {
    case 'create_task': {
      tasksStore.insertTask(
        {
          id: op.taskId,
          userId: ownerId,
          title: op.title,
          dueDate: op.dueDate,
          dueTime: op.dueTime,
          isCompleted: false,
          priority: 'Medium',
          category: op.category,
          notes: op.notes,
          recurrenceRule: null,
        },
        tx,
      );
      let reminderId: string | null = null;
      if (op.reminder) {
        requireFuture(op.reminder.triggerAt);
        remindersStore.insertReminder(
          {
            id: op.reminder.id,
            userId: ownerId,
            task: op.title,
            description: op.notes,
            scheduledAt: op.reminder.scheduledAt,
            triggerAt: op.reminder.triggerAt,
            status: 'pending',
            preCastAudioPath: null,
          },
          tx,
        );
        deliveryStore.linkSource(op.reminder.id, 'task', op.taskId, tx);
        scheduleAfterCommit(
          tx,
          op.reminder.id,
          op.title,
          op.reminder.triggerAt,
        );
        reminderId = op.reminder.id;
      }
      const when = op.dueDate
        ? ` for ${op.dueDate}${
            op.dueTime
              ? reminderId
                ? ` with a reminder at ${format12HourTime(op.dueTime)}`
                : ` at ${format12HourTime(op.dueTime)}`
              : ''
          }`
        : ' with no due date';
      return {
        operation: op.op,
        entityType: 'task',
        entityId: op.taskId,
        reminderId,
        reply: `Added task: "${op.title}"${when}.`,
      };
    }
    case 'create_time_block': {
      timeBlocksStore.insert(
        {
          id: op.blockId,
          userId: ownerId,
          title: op.title,
          date: op.date,
          startTime: op.startTime,
          endTime: op.endTime,
          color: '#3498DB',
          category: op.category,
          notes: op.notes || undefined,
          recurrenceRule: null,
        },
        tx,
      );
      return {
        operation: op.op,
        entityType: 'time_block',
        entityId: op.blockId,
        reminderId: null,
        reply: `Scheduled time block: "${op.title}" on ${
          op.date
        } from ${format12HourTime(op.startTime)} to ${format12HourTime(
          op.endTime,
        )}.`,
      };
    }
    case 'create_reminder': {
      requireFuture(op.reminder.triggerAt);
      tasksStore.insertTask(
        {
          id: op.taskId,
          userId: ownerId,
          title: op.title,
          dueDate: op.date,
          dueTime: op.time,
          isCompleted: false,
          priority: 'High',
          category: op.category,
          notes: op.details,
          recurrenceRule: null,
        },
        tx,
      );
      remindersStore.insertReminder(
        {
          id: op.reminder.id,
          userId: ownerId,
          task: op.title,
          description: op.details,
          scheduledAt: op.reminder.scheduledAt,
          triggerAt: op.reminder.triggerAt,
          status: 'pending',
          preCastAudioPath: null,
        },
        tx,
      );
      deliveryStore.linkSource(op.reminder.id, 'task', op.taskId, tx);
      scheduleAfterCommit(tx, op.reminder.id, op.title, op.reminder.triggerAt);
      return {
        operation: op.op,
        entityType: 'reminder',
        entityId: op.reminder.id,
        reminderId: op.reminder.id,
        reply: `Reminder set: "${op.title}" on ${op.date} at ${format12HourTime(
          op.time,
        )}.`,
      };
    }
    case 'create_note': {
      notesStore.insert(
        {
          id: op.noteId,
          userId: ownerId,
          title: op.title,
          body: op.body,
          isPinned: false,
          tags: [op.category],
          category: op.category,
          isVoiceTranscribed: true,
          imageUri: null,
          sortOrder: 0,
        },
        tx,
      );
      return {
        operation: op.op,
        entityType: 'note',
        entityId: op.noteId,
        reminderId: null,
        reply: `Saved note: "${op.title}".`,
      };
    }
    case 'complete_task': {
      verifyTarget(tx, op.target, ownerId);
      tasksStore.updateTask({id: op.target.id, isCompleted: true}, tx);
      return {
        operation: op.op,
        entityType: 'task',
        entityId: op.target.id,
        reminderId: null,
        reply: `Marked task "${op.target.title}" as completed. Its pending reminders are turned off.`,
      };
    }
    case 'update_task': {
      verifyTarget(tx, op.target, ownerId);
      verifyReminderChanges(tx, ownerId, op.reminderChanges);
      tasksStore.updateTask(
        {
          id: op.target.id,
          title: op.title,
          dueDate: op.dueDate,
          dueTime: op.dueTime,
        },
        tx,
      );
      applyReminderChanges(tx, op.reminderChanges);
      const when = op.dueDate
        ? ` for ${op.dueDate}${
            op.dueTime ? ` at ${format12HourTime(op.dueTime)}` : ''
          }`
        : '';
      return {
        operation: op.op,
        entityType: 'task',
        entityId: op.target.id,
        reminderId: op.reminderChanges[0]?.ref.id ?? null,
        reply: `Updated task: "${op.title}"${when}.`,
      };
    }
    case 'update_schedule_item': {
      verifyTarget(tx, op.target, ownerId);
      verifyReminderChanges(tx, ownerId, op.reminderChanges);
      const patch = {
        id: op.target.id,
        title: op.title,
        date: op.date,
        startTime: op.startTime,
        endTime: op.endTime,
      };
      if (op.target.type === 'event') tasksStore.updateEvent(patch, tx);
      else timeBlocksStore.update(patch, tx);
      applyReminderChanges(tx, op.reminderChanges);
      const label = op.target.type === 'event' ? 'event' : 'time block';
      return {
        operation: op.op,
        entityType: op.target.type,
        entityId: op.target.id,
        reminderId: op.reminderChanges[0]?.ref.id ?? null,
        reply: `Updated ${label}: "${op.title}" on ${
          op.date
        } from ${format12HourTime(op.startTime)} to ${format12HourTime(
          op.endTime,
        )}.`,
      };
    }
    case 'update_note': {
      verifyTarget(tx, op.target, ownerId);
      notesStore.update({id: op.target.id, title: op.title, body: op.body}, tx);
      return {
        operation: op.op,
        entityType: 'note',
        entityId: op.target.id,
        reminderId: null,
        reply: `Updated note: "${op.title}".`,
      };
    }
    case 'delete_item': {
      const target = op.target;
      verifyTarget(tx, target, ownerId);
      if (
        target.type === 'task' ||
        target.type === 'event' ||
        target.type === 'time_block'
      ) {
        // The store cascade below removes exactly these reminders; a reminder
        // that appeared, changed title or was linked since the card was shown
        // makes the review stale instead of removing something not listed.
        const now = remindersForSource(
          tx,
          ownerId,
          target.type,
          target.id,
          target.title,
          ['pending', 'snoozed'],
        );
        const shown = op.cascadeReminderIds;
        if (
          now.length !== shown.length ||
          sortedIds(now).some((id, index) => id !== shown[index])
        ) {
          throw new ReviewRefusedError('stale');
        }
      }
      let reply: string;
      if (target.type === 'task') {
        tasksStore.deleteTask(target.id, tx);
        reply = `Removed task: "${target.title}".`;
      } else if (target.type === 'event') {
        tasksStore.deleteEvent(target.id, tx);
        reply = `Removed event: "${target.title}".`;
      } else if (target.type === 'time_block') {
        timeBlocksStore.delete(target.id, tx);
        reply = `Removed time block: "${target.title}".`;
      } else if (target.type === 'note') {
        notesStore.delete(target.id, tx);
        reply = `Deleted note: "${target.title}".`;
      } else {
        remindersStore.deleteReminder(target.id, tx);
        tx.afterCommit?.(() => {
          cancelReminderAlarm(target.id).catch(() => undefined);
          finishNativeIncomingCall(target.id).catch(() => undefined);
        });
        reply = `Cancelled reminder: "${target.title}".`;
      }
      return {
        operation: op.op,
        entityType: target.type,
        entityId: target.id,
        reminderId: target.type === 'reminder' ? target.id : null,
        reply,
      };
    }
    case 'acknowledge_reminder': {
      const row = verifyTarget(tx, op.target, ownerId);
      const guard = (inner: DatabaseTransaction) =>
        deliveryStore.assertFence(inner, op.target.id, ownerId, op.generation);
      remindersStore.acknowledgeReminder(op.target.id, guard, tx);
      const audio =
        typeof row.precast_audio_path === 'string'
          ? row.precast_audio_path
          : null;
      tx.afterCommit?.(() => {
        cancelReminderAlarm(op.target.id).catch(() => undefined);
        finishNativeIncomingCall(op.target.id).catch(() => undefined);
        deletePreCachedReminderAudio(audio).catch(() => undefined);
      });
      return {
        operation: op.op,
        entityType: 'reminder',
        entityId: op.target.id,
        reminderId: op.target.id,
        reply: `Acknowledged "${op.target.title}". The reminder is stopped; the task itself is not marked done.`,
      };
    }
    case 'snooze_reminder': {
      const row = verifyTarget(tx, op.target, ownerId);
      if (Number(row.snooze_count ?? 0) >= op.maxSnoozes)
        throw new ReviewRefusedError('stale');
      const triggerAt = new Date(
        Date.now() + op.minutes * 60 * 1000,
      ).toISOString();
      const guard = (inner: DatabaseTransaction) =>
        deliveryStore.assertFence(inner, op.target.id, ownerId, op.generation);
      remindersStore.snoozeReminderAt(op.target.id, triggerAt, guard, tx);
      scheduleAfterCommit(tx, op.target.id, op.target.title, triggerAt);
      tx.afterCommit?.(() => {
        finishNativeIncomingCall(op.target.id).catch(() => undefined);
      });
      return {
        operation: op.op,
        entityType: 'reminder',
        entityId: op.target.id,
        reminderId: op.target.id,
        reply: `Snoozed "${op.target.title}" for ${op.minutes} minutes.`,
      };
    }
    case 'reschedule_reminder': {
      const row = verifyTarget(tx, op.target, ownerId);
      requireFuture(op.triggerAt);
      deliveryStore.assertFence(tx, op.target.id, ownerId, op.generation);
      remindersStore.updateReminderTriggerAt(op.target.id, op.triggerAt, tx);
      if (row.status === 'triggered') {
        remindersStore.updateReminderStatus(
          op.target.id,
          'pending',
          undefined,
          tx,
        );
      }
      scheduleAfterCommit(tx, op.target.id, op.target.title, op.triggerAt);
      tx.afterCommit?.(() => {
        finishNativeIncomingCall(op.target.id).catch(() => undefined);
      });
      const parts = localParts(op.triggerAt);
      return {
        operation: op.op,
        entityType: 'reminder',
        entityId: op.target.id,
        reminderId: op.target.id,
        reply: `Rescheduled "${op.target.title}" to ${
          parts.date
        } at ${format12HourTime(parts.time)}.`,
      };
    }
  }
};

/**
 * Applies a proposal once. Re-checks everything the proposal relied on inside
 * the write transaction; any mismatch rolls back and nothing is written.
 */
export const confirmReviewedCommand = (
  activeUserId: string,
  operationId: string,
): ConfirmResult => {
  let existing: OperationReceipt | null = null;
  try {
    existing = assistantOperationStore.getReceipt(operationId);
  } catch (error) {
    console.warn('[CommandReview] Could not read operation receipts:', error);
    return refused('failed');
  }
  if (existing) {
    if (existing.userId !== activeUserId) return refused('owner_mismatch');
    return {
      status: 'applied',
      receipt: existing,
      reply: existing.reply,
      repeated: true,
    };
  }

  const review = reviews.get(operationId);
  if (!review) return refused('not_found');
  if (review.ownerId !== activeUserId) return refused('owner_mismatch');
  if (review.sessionId !== sessionId) {
    reviews.delete(operationId);
    return refused('session_ended');
  }
  if (review.state === 'cancelled') return refused('cancelled');
  if (review.state === 'refused') return refused('stale');
  if (Date.now() >= review.expiresAt) {
    reviews.delete(operationId);
    return refused('expired');
  }

  let receipt: OperationReceipt | null = null;
  try {
    db.transactionSync(tx => {
      if (readOwnerEpoch(review.ownerId, tx) !== review.ownerEpoch) {
        throw new ReviewRefusedError('owner_mismatch');
      }
      const applied = applyOperation(tx, review.ownerId, review.operation);
      receipt = assistantOperationStore.insertReceipt(
        {
          operationId,
          userId: review.ownerId,
          intent: review.proposal.intent,
          operation: applied.operation,
          entityType: applied.entityType,
          entityId: applied.entityId,
          reminderId: applied.reminderId,
          reply: applied.reply,
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof ReviewRefusedError) {
      if (error.reason === 'expired') reviews.delete(operationId);
      else review.state = 'refused';
      return refused(error.reason, error.userMessage);
    }
    if (error instanceof DeliveryFenceError) {
      review.state = 'refused';
      return refused('stale');
    }
    console.error(
      '[CommandReview] Confirm failed; nothing was written:',
      error,
    );
    return refused('failed');
  }
  reviews.delete(operationId);
  const saved = receipt as OperationReceipt | null;
  if (!saved) return refused('failed');
  return {
    status: 'applied',
    receipt: saved,
    reply: saved.reply,
    repeated: false,
  };
};

/** Discards a proposal. Never writes. Returns false when there was nothing to cancel. */
export const cancelReviewedCommand = (
  activeUserId: string,
  operationId: string,
): boolean => {
  const review = reviews.get(operationId);
  if (!review || review.ownerId !== activeUserId || review.state !== 'pending')
    return false;
  review.state = 'cancelled';
  return true;
};

/** The newest proposal that can still be confirmed for this owner and surface. */
export const latestPendingReview = (
  ownerId: string,
  surface: ReviewSurface = 'chat',
): CommandProposal | null => {
  const now = Date.now();
  let latest: PendingReview | null = null;
  for (const review of reviews.values()) {
    if (
      review.ownerId === ownerId &&
      review.proposal.surface === surface &&
      review.state === 'pending' &&
      review.sessionId === sessionId &&
      review.expiresAt > now &&
      (!latest || review.expiresAt > latest.expiresAt)
    ) {
      latest = review;
    }
  }
  return latest ? latest.proposal : null;
};

/** Ends the review session: every open proposal becomes unconfirmable. */
export const endReviewSession = (): void => {
  reviews.clear();
  sessionId = generateId('review_session');
};
