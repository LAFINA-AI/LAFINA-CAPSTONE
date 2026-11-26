/**
 * Runtime schema validator for Action Envelopes and Tool Payloads (P06-02, F-078).
 *
 * Rejects malformed payloads, unknown fields, oversized parameters, invalid dates,
 * and cross-owner spoofing before any execution or review presentation.
 */

import type {
  ActionEnvelope,
  LafinaActionKind,
  LafinaActionPhase,
  CalendarReadPayload,
  CalendarPreparePayload,
  TaskPreparePayload,
  ReminderPreparePayload,
  NoteSearchPayload,
  NotePreparePayload,
  MemoryReadPayload,
  MemoryPreparePayload,
  DraftRevisePayload,
  DraftConfirmPayload,
  DraftCancelPayload,
  MultiPreparePayload,
} from './types';
import {isRealDate} from '../../storage/eventTime';
import {containsPromptInjection} from './actionSecurity';
import {REGISTERED_TOOLS, STRUCTURED_ACTIONS} from './actionRegistry';

const ALLOWED_KINDS: readonly LafinaActionKind[] = [
  'calendar.read',
  'calendar.prepare',
  'task.prepare',
  'reminder.prepare',
  'note.search',
  'note.prepare',
  'memory.read',
  'memory.prepare',
  'draft.revise',
  'draft.cancel',
  'draft.confirm',
  'multi.prepare',
  'legacy.read_data',
  'legacy.prepare_action',
  'legacy.save_memory',
  'calendar.free_time',
  'reminder.snooze',
  'ustp.search',
];

const ALLOWED_PHASES: readonly LafinaActionPhase[] = [
  'requested',
  'checking',
  'preparing',
  'waiting',
  'confirming',
  'saving',
  'done',
  'canceled',
  'failed',
  'expired',
  'partial',
];

const DATE_REGEX = {test: (value: string) => isRealDate(value)};
const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type ValidationOutcome<T> =
  | {valid: true; data: T}
  | {valid: false; error: string};

export function validateActionEnvelope(
  raw: unknown,
  expectedOwnerId: string,
): ValidationOutcome<ActionEnvelope> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {valid: false, error: 'Envelope must be a non-null object.'};
  }

  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== 1) {
    return {valid: false, error: 'Unsupported schema version: expected 1.'};
  }

  if (
    typeof obj.actionId !== 'string' ||
    !obj.actionId.trim() ||
    obj.actionId.length > 100
  ) {
    return {
      valid: false,
      error: 'Invalid or missing actionId (max 100 chars).',
    };
  }

  if (
    typeof obj.sessionId !== 'string' ||
    !obj.sessionId.trim() ||
    obj.sessionId.length > 200
  ) {
    return {
      valid: false,
      error: 'Invalid or missing sessionId (max 200 chars).',
    };
  }

  if (typeof obj.ownerId !== 'string' || obj.ownerId !== expectedOwnerId) {
    return {
      valid: false,
      error: `Owner ID mismatch: action owner '${obj.ownerId}' does not match authenticated owner '${expectedOwnerId}'.`,
    };
  }

  if (
    typeof obj.sourceTurnId !== 'string' ||
    !obj.sourceTurnId.trim() ||
    obj.sourceTurnId.length > 100
  ) {
    return {valid: false, error: 'Invalid or missing sourceTurnId.'};
  }

  if (
    typeof obj.kind !== 'string' ||
    !ALLOWED_KINDS.includes(obj.kind as LafinaActionKind)
  ) {
    return {
      valid: false,
      error: `Unsupported action kind: '${String(obj.kind)}'.`,
    };
  }

  if (
    typeof obj.phase !== 'string' ||
    !ALLOWED_PHASES.includes(obj.phase as LafinaActionPhase)
  ) {
    return {
      valid: false,
      error: `Invalid action phase: '${String(obj.phase)}'.`,
    };
  }

  if (
    Object.keys(obj).some(
      key =>
        ![
          'schemaVersion',
          'actionId',
          'sessionId',
          'ownerId',
          'sourceTurnId',
          'kind',
          'phase',
          'cardId',
          'cardRevision',
          'payload',
          'details',
        ].includes(key),
    )
  )
    return {valid: false, error: 'Unknown envelope field.'};
  if (
    obj.cardRevision !== undefined &&
    (typeof obj.cardRevision !== 'number' ||
      !Number.isSafeInteger(obj.cardRevision) ||
      obj.cardRevision < 1)
  ) {
    return {
      valid: false,
      error: 'cardRevision must be a number when provided.',
    };
  }

  const payloadValidation = validatePayload(
    obj.kind as LafinaActionKind,
    obj.payload,
  );
  if (!payloadValidation.valid) {
    return {valid: false, error: payloadValidation.error};
  }

  return {
    valid: true,
    data: {
      schemaVersion: 1,
      actionId: obj.actionId.trim(),
      sessionId: obj.sessionId.trim(),
      ownerId: expectedOwnerId,
      sourceTurnId: obj.sourceTurnId.trim(),
      kind: obj.kind as LafinaActionKind,
      phase: obj.phase as LafinaActionPhase,
      cardId: typeof obj.cardId === 'string' ? obj.cardId : undefined,
      cardRevision:
        typeof obj.cardRevision === 'number' ? obj.cardRevision : undefined,
      payload: payloadValidation.data,
      details:
        obj.details &&
        typeof obj.details === 'object' &&
        !Array.isArray(obj.details)
          ? (obj.details as Record<string, unknown>)
          : undefined,
    },
  };
}

export function validatePayload(
  kind: LafinaActionKind,
  rawPayload: unknown,
): ValidationOutcome<unknown> {
  if (
    !rawPayload ||
    typeof rawPayload !== 'object' ||
    Array.isArray(rawPayload)
  ) {
    return {
      valid: false,
      error: `Payload for ${kind} must be a non-null object.`,
    };
  }

  const p = rawPayload as Record<string, unknown>;
  const extraFields: Partial<Record<LafinaActionKind, string[]>> = {
    'calendar.prepare': ['title', 'date', 'startTime', 'endTime', 'location'],
    'task.prepare': ['title', 'dueDate', 'dueTime', 'priority'],
    'reminder.prepare': [
      'title',
      'parentTitle',
      'date',
      'time',
      'triggerDate',
      'triggerTime',
      'repeatInterval',
      'minutesBefore',
    ],
    'note.prepare': ['title', 'body'],
  };
  const definition = REGISTERED_TOOLS.find(tool => tool.kind === kind);
  const allowed =
    extraFields[kind] || Object.keys(definition?.parameters.properties || {});
  if (Object.keys(p).some(key => !allowed.includes(key)))
    return {valid: false, error: 'Unknown tool parameter.'};
  if (Object.keys(p).length > 12)
    return {valid: false, error: 'Too many tool parameters.'};

  for (const field of [
    'query',
    'date',
    'start',
    'end',
    'title',
    'body',
    'dueDate',
    'dueTime',
    'startTime',
    'endTime',
    'location',
    'parentTitle',
    'time',
    'triggerDate',
    'triggerTime',
    'repeatInterval',
    'text',
    'request',
    'cardId',
    'instruction',
  ]) {
    if (p[field] !== undefined && typeof p[field] !== 'string')
      return {valid: false, error: `${field} must be a string.`};
  }
  if (
    p.priority !== undefined &&
    !['low', 'medium', 'high'].includes(p.priority as string)
  )
    return {valid: false, error: 'Invalid priority.'};
  switch (kind) {
    case 'calendar.read': {
      for (const field of ['date', 'start', 'end'])
        if (
          p[field] !== undefined &&
          (typeof p[field] !== 'string' || !DATE_REGEX.test(p[field] as string))
        )
          return {valid: false, error: 'Invalid calendar date.'};
      if (
        typeof p.start === 'string' &&
        typeof p.end === 'string' &&
        p.end < p.start
      )
        return {valid: false, error: 'Calendar range end precedes start.'};
      const query =
        typeof p.query === 'string' ? p.query.trim().slice(0, 100) : undefined;
      const date =
        typeof p.date === 'string' && DATE_REGEX.test(p.date)
          ? p.date
          : undefined;
      const start =
        typeof p.start === 'string' && DATE_REGEX.test(p.start)
          ? p.start
          : undefined;
      const end =
        typeof p.end === 'string' && DATE_REGEX.test(p.end) ? p.end : undefined;
      const res: CalendarReadPayload = {query, date, start, end};
      return {valid: true, data: res};
    }

    case 'calendar.prepare': {
      if (
        typeof p.title !== 'string' ||
        !p.title.trim() ||
        p.title.length > 200
      ) {
        return {
          valid: false,
          error: 'calendar.prepare requires title (1..200 chars).',
        };
      }
      if (typeof p.date !== 'string' || !DATE_REGEX.test(p.date)) {
        return {
          valid: false,
          error: 'calendar.prepare requires valid date (YYYY-MM-DD).',
        };
      }
      if (
        p.startTime !== undefined &&
        (typeof p.startTime !== 'string' || !TIME_REGEX.test(p.startTime))
      ) {
        return {
          valid: false,
          error: 'calendar.prepare startTime must be HH:MM.',
        };
      }
      if (
        p.endTime !== undefined &&
        (typeof p.endTime !== 'string' || !TIME_REGEX.test(p.endTime))
      ) {
        return {valid: false, error: 'calendar.prepare endTime must be HH:MM.'};
      }
      if (containsPromptInjection(p.title)) {
        return {
          valid: false,
          error: 'calendar.prepare title contains rejected adversarial tokens.',
        };
      }
      const res: CalendarPreparePayload = {
        title: p.title.trim(),
        date: p.date,
        startTime: typeof p.startTime === 'string' ? p.startTime : undefined,
        endTime: typeof p.endTime === 'string' ? p.endTime : undefined,
        location:
          typeof p.location === 'string'
            ? p.location.trim().slice(0, 100)
            : undefined,
      };
      return {valid: true, data: res};
    }

    case 'task.prepare': {
      if (
        typeof p.title !== 'string' ||
        !p.title.trim() ||
        p.title.length > 200
      ) {
        return {
          valid: false,
          error: 'task.prepare requires title (1..200 chars).',
        };
      }
      if (
        p.dueDate !== undefined &&
        (typeof p.dueDate !== 'string' || !DATE_REGEX.test(p.dueDate))
      ) {
        return {
          valid: false,
          error: 'task.prepare dueDate must be YYYY-MM-DD.',
        };
      }
      if (
        p.dueTime !== undefined &&
        (typeof p.dueTime !== 'string' || !TIME_REGEX.test(p.dueTime))
      ) {
        return {valid: false, error: 'task.prepare dueTime must be HH:MM.'};
      }
      const priority = ['low', 'medium', 'high'].includes(p.priority as string)
        ? (p.priority as 'low' | 'medium' | 'high')
        : undefined;
      if (containsPromptInjection(p.title)) {
        return {
          valid: false,
          error: 'task.prepare title contains rejected adversarial tokens.',
        };
      }
      const res: TaskPreparePayload = {
        title: p.title.trim(),
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : undefined,
        dueTime: typeof p.dueTime === 'string' ? p.dueTime : undefined,
        priority,
      };
      return {valid: true, data: res};
    }

    case 'reminder.prepare': {
      if (
        p.minutesBefore !== undefined &&
        (typeof p.minutesBefore !== 'number' ||
          !Number.isSafeInteger(p.minutesBefore) ||
          p.minutesBefore < 0 ||
          p.minutesBefore > 10080)
      )
        return {valid: false, error: 'Invalid follow-up offset.'};
      const title =
        typeof p.title === 'string' && p.title.trim()
          ? p.title.trim()
          : typeof p.parentTitle === 'string' && p.parentTitle.trim()
          ? `Reminder: ${p.parentTitle.trim()}`
          : null;
      if (!title || title.length > 200) {
        return {
          valid: false,
          error:
            'reminder.prepare requires title or parentTitle (1..200 chars).',
        };
      }
      const triggerDate =
        typeof p.triggerDate === 'string' && DATE_REGEX.test(p.triggerDate)
          ? p.triggerDate
          : typeof p.date === 'string' && DATE_REGEX.test(p.date)
          ? p.date
          : null;
      if (!triggerDate) {
        return {
          valid: false,
          error:
            'reminder.prepare requires valid triggerDate or date (YYYY-MM-DD).',
        };
      }
      const triggerTime =
        typeof p.triggerTime === 'string' && TIME_REGEX.test(p.triggerTime)
          ? p.triggerTime
          : typeof p.time === 'string' && TIME_REGEX.test(p.time)
          ? p.time
          : null;
      if (!triggerTime) {
        return {
          valid: false,
          error: 'reminder.prepare requires valid triggerTime or time (HH:MM).',
        };
      }
      if (containsPromptInjection(title)) {
        return {
          valid: false,
          error: 'reminder.prepare title contains rejected adversarial tokens.',
        };
      }
      const res: ReminderPreparePayload = {
        title,
        triggerDate,
        triggerTime,
        repeatInterval:
          typeof p.repeatInterval === 'string'
            ? p.repeatInterval.slice(0, 50)
            : undefined,
      };
      return {valid: true, data: res};
    }

    case 'note.search': {
      if (
        p.limit !== undefined &&
        (typeof p.limit !== 'number' ||
          !Number.isSafeInteger(p.limit) ||
          p.limit < 1 ||
          p.limit > 50)
      )
        return {valid: false, error: 'Invalid note result limit.'};
      if (
        typeof p.query !== 'string' ||
        !p.query.trim() ||
        p.query.length > 100
      ) {
        return {
          valid: false,
          error: 'note.search requires query (1..100 chars).',
        };
      }
      const limit =
        typeof p.limit === 'number' && p.limit > 0 && p.limit <= 50
          ? p.limit
          : 5;
      const res: NoteSearchPayload = {query: p.query.trim(), limit};
      return {valid: true, data: res};
    }

    case 'note.prepare': {
      if (
        typeof p.title !== 'string' ||
        !p.title.trim() ||
        p.title.length > 200
      ) {
        return {
          valid: false,
          error: 'note.prepare requires title (1..200 chars).',
        };
      }
      if (
        typeof p.body !== 'string' ||
        !p.body.trim() ||
        p.body.length > 4000
      ) {
        return {
          valid: false,
          error: 'note.prepare requires body (1..4000 chars).',
        };
      }
      const res: NotePreparePayload = {
        title: p.title.trim(),
        body: p.body.trim(),
      };
      return {valid: true, data: res};
    }

    case 'memory.read': {
      const query =
        typeof p.query === 'string' ? p.query.trim().slice(0, 100) : undefined;
      const res: MemoryReadPayload = {query};
      return {valid: true, data: res};
    }

    case 'memory.prepare': {
      if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > 200) {
        return {
          valid: false,
          error: 'memory.prepare requires text (1..200 chars).',
        };
      }
      if (containsPromptInjection(p.text)) {
        return {
          valid: false,
          error: 'memory.prepare contains rejected adversarial tokens.',
        };
      }
      const res: MemoryPreparePayload = {text: p.text.trim()};
      return {valid: true, data: res};
    }

    case 'draft.revise': {
      if (
        typeof p.cardId !== 'string' ||
        !p.cardId.trim() ||
        p.cardId.length > 100
      ) {
        return {valid: false, error: 'draft.revise requires valid cardId.'};
      }
      if (
        typeof p.revision !== 'number' ||
        !Number.isSafeInteger(p.revision) ||
        p.revision < 1
      ) {
        return {
          valid: false,
          error: 'draft.revise requires non-negative revision number.',
        };
      }
      if (
        typeof p.instruction !== 'string' ||
        !p.instruction.trim() ||
        p.instruction.length > 500
      ) {
        return {
          valid: false,
          error: 'draft.revise requires instruction (1..500 chars).',
        };
      }
      const res: DraftRevisePayload = {
        cardId: p.cardId.trim(),
        revision: p.revision,
        instruction: p.instruction.trim(),
      };
      return {valid: true, data: res};
    }

    case 'draft.confirm': {
      if (
        typeof p.cardId !== 'string' ||
        !p.cardId.trim() ||
        p.cardId.length > 100
      ) {
        return {valid: false, error: 'draft.confirm requires valid cardId.'};
      }
      if (
        typeof p.revision !== 'number' ||
        !Number.isSafeInteger(p.revision) ||
        p.revision < 1
      ) {
        return {
          valid: false,
          error: 'draft.confirm requires non-negative revision number.',
        };
      }
      const res: DraftConfirmPayload = {
        cardId: p.cardId.trim(),
        revision: p.revision,
      };
      return {valid: true, data: res};
    }

    case 'draft.cancel': {
      if (
        typeof p.cardId !== 'string' ||
        !p.cardId.trim() ||
        p.cardId.length > 100
      ) {
        return {valid: false, error: 'draft.cancel requires valid cardId.'};
      }
      if (
        typeof p.revision !== 'number' ||
        !Number.isSafeInteger(p.revision) ||
        p.revision < 1
      ) {
        return {
          valid: false,
          error: 'draft.cancel requires non-negative revision number.',
        };
      }
      const res: DraftCancelPayload = {
        cardId: p.cardId.trim(),
        revision: p.revision,
      };
      return {valid: true, data: res};
    }

    case 'multi.prepare': {
      if (
        typeof p.text === 'string' &&
        p.text.trim() &&
        Array.isArray(p.items) &&
        p.items.length
      )
        return {
          valid: false,
          error: 'Provide grouped text or structured items, not both.',
        };
      if (typeof p.text === 'string' && p.text.trim()) {
        if (p.text.length > 500) {
          return {
            valid: false,
            error: 'multi.prepare text must not exceed 500 chars.',
          };
        }
        if (containsPromptInjection(p.text)) {
          return {
            valid: false,
            error: 'multi.prepare text contains rejected adversarial tokens.',
          };
        }
        return {
          valid: true,
          data: {
            text: p.text.trim(),
            items: [],
          } as unknown as MultiPreparePayload,
        };
      }
      if (
        !Array.isArray(p.items) ||
        p.items.length === 0 ||
        p.items.length > 10
      ) {
        return {
          valid: false,
          error: 'multi.prepare requires 1..10 items or text.',
        };
      }
      const items = [];
      for (let i = 0; i < p.items.length; i++) {
        const item = p.items[i] as Record<string, unknown>;
        if (
          !item ||
          typeof item !== 'object' ||
          typeof item.kind !== 'string'
        ) {
          return {valid: false, error: `multi.prepare item ${i} is invalid.`};
        }
        if (
          !['task', 'event', 'reminder', 'note'].includes(item.kind) ||
          typeof item.title !== 'string' ||
          !item.title.trim() ||
          item.title.length > 200 ||
          Object.keys(item).some(
            key =>
              ![
                'kind',
                'title',
                'date',
                'time',
                'endTime',
                'priority',
                'body',
              ].includes(key),
          )
        ) {
          return {valid: false, error: 'Invalid grouped item schema.'};
        }
        if (
          (item.date !== undefined &&
            (typeof item.date !== 'string' || !DATE_REGEX.test(item.date))) ||
          (item.time !== undefined &&
            (typeof item.time !== 'string' || !TIME_REGEX.test(item.time))) ||
          (item.endTime !== undefined &&
            (typeof item.endTime !== 'string' ||
              !TIME_REGEX.test(item.endTime)))
        ) {
          return {valid: false, error: 'Invalid grouped date/time.'};
        }
        if (
          item.body !== undefined &&
          (typeof item.body !== 'string' || item.body.length > 4000)
        )
          return {valid: false, error: 'Invalid note content.'};
        if (
          item.priority !== undefined &&
          !['low', 'medium', 'high'].includes(item.priority as string)
        )
          return {valid: false, error: 'Invalid grouped priority.'};
        items.push({...item, title: item.title.trim()});
      }
      const res = {items} as unknown as MultiPreparePayload;
      return {valid: true, data: res};
    }

    case 'legacy.read_data': {
      const allowedKinds = ['calendar', 'todos', 'notes', 'alarms', 'memory'];
      if (typeof p.kind !== 'string' || !allowedKinds.includes(p.kind)) {
        return {
          valid: false,
          error:
            "legacy.read_data requires kind: 'calendar' | 'todos' | 'notes' | 'alarms' | 'memory'.",
        };
      }
      return {
        valid: true,
        data: {
          kind: p.kind,
          query:
            typeof p.query === 'string' ? p.query.trim().slice(0, 100) : '',
        },
      };
    }

    case 'legacy.prepare_action':
    case 'legacy.save_memory': {
      if (
        typeof p.request !== 'string' ||
        !p.request.trim() ||
        p.request.length > 1000
      ) {
        return {
          valid: false,
          error: `${kind} requires request string (1..1000 chars).`,
        };
      }
      if (kind === 'legacy.save_memory')
        return {valid: true, data: {request: p.request.trim()}};
      // Optional structured fields (audit follow-up: agent arguments). Each is
      // checked here; `structuredAction.ts` decides whether they make a card.
      if (
        p.action !== undefined &&
        !STRUCTURED_ACTIONS.includes(p.action as string)
      )
        return {valid: false, error: 'Unsupported action.'};
      for (const field of [
        'newTitle',
        'title',
        'date',
        'time',
        'endTime',
        'priority',
        'location',
        'category',
        'details',
        'deliveryStyle',
        'action',
        'repeat',
      ])
        if (p[field] !== undefined && typeof p[field] !== 'string')
          return {valid: false, error: `${field} must be a string.`};
      if (typeof p.date === 'string' && !DATE_REGEX.test(p.date))
        return {valid: false, error: 'Invalid date.'};
      for (const field of ['time', 'endTime'])
        if (
          typeof p[field] === 'string' &&
          !TIME_REGEX.test(p[field] as string)
        )
          return {valid: false, error: `Invalid ${field}.`};
      if (
        p.durationMinutes !== undefined &&
        (typeof p.durationMinutes !== 'number' ||
          !Number.isFinite(p.durationMinutes) ||
          p.durationMinutes < 5 ||
          p.durationMinutes > 720)
      )
        return {valid: false, error: 'durationMinutes must be 5..720.'};
      if (
        p.deliveryStyle !== undefined &&
        p.deliveryStyle !== 'call' &&
        p.deliveryStyle !== 'notify'
      )
        return {valid: false, error: 'Invalid deliveryStyle.'};
      if (
        p.repeat !== undefined &&
        !/^(?:daily|weekdays|weekly:(?:mo|tu|we|th|fr|sa|su)(?:,(?:mo|tu|we|th|fr|sa|su)){0,6})$/.test(
          String(p.repeat).trim().toLowerCase(),
        )
      )
        return {valid: false, error: 'Invalid repeat.'};
      if (p.enabled !== undefined && typeof p.enabled !== 'boolean')
        return {valid: false, error: 'enabled must be a boolean.'};
      const data: Record<string, unknown> = {request: p.request.trim()};
      for (const field of [
        'action',
        'location',
        'category',
        'title',
        'date',
        'time',
        'endTime',
        'durationMinutes',
        'priority',
        'newTitle',
        'details',
        'deliveryStyle',
        'repeat',
        'enabled',
      ])
        if (p[field] !== undefined) {
          const value = p[field];
          if (typeof value === 'string') {
            const limit = field === 'details' ? 1000 : 200;
            if (value.length > limit)
              return {valid: false, error: `${field} is too long.`};
            if (containsPromptInjection(value))
              return {valid: false, error: `${field} was rejected.`};
            data[field] = value.trim();
          } else data[field] = value;
        }
      return {valid: true, data};
    }

    case 'calendar.free_time': {
      // "today" / "tomorrow" are accepted like read_lafina_data does (audit
      // L8), so the agent does not spend a step correcting itself.
      if (
        typeof p.date === 'string' &&
        !DATE_REGEX.test(p.date) &&
        !/^(?:today|tomorrow)$/i.test(p.date.trim())
      )
        return {valid: false, error: 'Invalid date.'};
      if (
        p.durationMinutes !== undefined &&
        (typeof p.durationMinutes !== 'number' ||
          !Number.isFinite(p.durationMinutes) ||
          p.durationMinutes < 15 ||
          p.durationMinutes > 720)
      )
        return {valid: false, error: 'durationMinutes must be 15..720.'};
      return {
        valid: true,
        data: {
          ...(typeof p.date === 'string' ? {date: p.date} : {}),
          ...(typeof p.durationMinutes === 'number'
            ? {durationMinutes: Math.round(p.durationMinutes)}
            : {}),
        },
      };
    }

    case 'reminder.snooze': {
      if (
        p.minutes !== undefined &&
        (typeof p.minutes !== 'number' ||
          !Number.isFinite(p.minutes) ||
          p.minutes < 1 ||
          p.minutes > 120)
      )
        return {valid: false, error: 'minutes must be 1..120.'};
      return {
        valid: true,
        data: {
          minutes: typeof p.minutes === 'number' ? Math.round(p.minutes) : 10,
        },
      };
    }

    case 'ustp.search': {
      if (
        typeof p.query !== 'string' ||
        !p.query.trim() ||
        p.query.length > 200
      ) {
        return {
          valid: false,
          error: 'ustp.search requires query string (1..200 chars).',
        };
      }
      if (containsPromptInjection(p.query)) {
        return {valid: false, error: 'query was rejected.'};
      }
      if (
        p.collection !== undefined &&
        p.collection !== 'all' &&
        p.collection !== 'handbook' &&
        p.collection !== 'ustp_cdo'
      ) {
        return {
          valid: false,
          error: 'collection must be one of: all, handbook, ustp_cdo.',
        };
      }
      return {
        valid: true,
        data: {
          query: p.query.trim(),
          ...(p.collection !== undefined ? {collection: p.collection} : {}),
        },
      };
    }

    default:
      return {
        valid: false,
        error: `Unhandled kind validation: ${String(kind)}.`,
      };
  }
}
