export type ParsedIntentType =
  | 'create_task'
  | 'create_time_block'
  | 'create_reminder'
  | 'create_note'
  | 'update_task'
  | 'update_time_block'
  | 'update_note'
  | 'delete_task'
  | 'delete_time_block'
  | 'delete_note'
  | 'acknowledge'
  | 'snooze'
  | 'reschedule'
  | 'query_schedule'
  | 'chat'
  | 'out_of_scope';

export type CrudTargetEntityType = 'task' | 'time_block' | 'note' | 'reminder' | 'any';

export interface ExtractedIntent {
  intent: ParsedIntentType;
  title: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm (24-hour)
  endTime: string | null; // HH:mm (24-hour)
  durationMinutes: number | null;
  category: string;
  details: string | null;
  snoozeMinutes: number | null;
  confidence: number; // 0.0 to 1.0
  source: 'fast_path' | 'on_device_slm' | 'cloud';
  rawTranscript: string;
  /** Optional CRUD target fields for update/delete operations. */
  targetTitle?: string | null;
  targetTime?: string | null;
  newTitle?: string | null;
  isCompleted?: boolean | null;
  targetEntityType?: CrudTargetEntityType | null;
}

export interface ValidatedIntent extends ExtractedIntent {
  isValid: boolean;
  validationError?: string;
}

export interface NluActionResult {
  success: boolean;
  intent: ParsedIntentType;
  entityType?: 'task' | 'time_block' | 'reminder' | 'note';
  entityId?: string;
  reply: string;
  error?: string;
}

export interface ModelDownloadProgress {
  bytesWritten: number;
  contentLength: number;
  percent: number; // 0 to 100
  status: 'idle' | 'downloading' | 'ready' | 'error';
  error?: string;
}

export interface ModelStatus {
  isDownloaded: boolean;
  filePath: string;
  fileSizeBytes: number;
  modelName: string;
}

const TIME_FORMAT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Validates and clamps an extracted intent to ensure strict schema compliance before DB execution. */
export function validateIntent(intent: ExtractedIntent): ValidatedIntent {
  const sanitizedTitle = (intent.title || '').trim();
  const sanitizedTargetTitle = (intent.targetTitle || '').trim();
  const sanitizedNewTitle = (intent.newTitle || '').trim();

  // Call responses
  if (intent.intent === 'acknowledge') {
    return { ...intent, isValid: true };
  }

  if (intent.intent === 'snooze') {
    const minutes = Math.max(1, Math.min(1440, intent.snoozeMinutes || 10));
    return { ...intent, snoozeMinutes: minutes, isValid: true };
  }

  if (intent.intent === 'reschedule') {
    if (!intent.time && !intent.date && !intent.durationMinutes) {
      return {
        ...intent,
        isValid: false,
        validationError: 'Reschedule request requires at least a new time or date.',
      };
    }
    return { ...intent, isValid: true };
  }

  if (intent.intent === 'query_schedule') {
    return { ...intent, isValid: true };
  }

  if (intent.intent === 'chat' || intent.intent === 'out_of_scope') {
    return { ...intent, isValid: true };
  }

  // Validate time & date formats whenever present
  if (intent.time && !TIME_FORMAT_REGEX.test(intent.time)) {
    return {
      ...intent,
      isValid: false,
      validationError: `Invalid time format: ${intent.time}. Expected HH:mm.`,
    };
  }

  if (intent.endTime && !TIME_FORMAT_REGEX.test(intent.endTime)) {
    return {
      ...intent,
      isValid: false,
      validationError: `Invalid end time format: ${intent.endTime}. Expected HH:mm.`,
    };
  }

  if (intent.targetTime && !TIME_FORMAT_REGEX.test(intent.targetTime)) {
    return {
      ...intent,
      isValid: false,
      validationError: `Invalid target time format: ${intent.targetTime}. Expected HH:mm.`,
    };
  }

  if (intent.date && !DATE_FORMAT_REGEX.test(intent.date)) {
    return {
      ...intent,
      isValid: false,
      validationError: `Invalid date format: ${intent.date}. Expected YYYY-MM-DD.`,
    };
  }

  // Delete / Cancel / Remove intents
  if (
    intent.intent === 'delete_task' ||
    intent.intent === 'delete_time_block' ||
    intent.intent === 'delete_note'
  ) {
    if (!sanitizedTargetTitle && !sanitizedTitle && !intent.targetTime && !intent.time && !intent.date) {
      return {
        ...intent,
        isValid: false,
        validationError: 'Please specify which item you want to remove or cancel.',
      };
    }
    return {
      ...intent,
      title: sanitizedTitle || sanitizedTargetTitle || null,
      targetTitle: sanitizedTargetTitle || sanitizedTitle || null,
      isValid: true,
    };
  }

  // Update / Edit / Move / Complete intents
  if (
    intent.intent === 'update_task' ||
    intent.intent === 'update_time_block' ||
    intent.intent === 'update_note'
  ) {
    const hasTarget = Boolean(sanitizedTargetTitle || sanitizedTitle || intent.targetTime);
    const hasMutation = Boolean(
      intent.time ||
        intent.endTime ||
        intent.date ||
        sanitizedNewTitle ||
        intent.details ||
        typeof intent.isCompleted === 'boolean',
    );
    if (!hasTarget && !hasMutation) {
      return {
        ...intent,
        isValid: false,
        validationError: 'Please specify which item to update and the new changes.',
      };
    }
    return {
      ...intent,
      title: sanitizedTitle || sanitizedTargetTitle || null,
      targetTitle: sanitizedTargetTitle || sanitizedTitle || null,
      newTitle: sanitizedNewTitle || null,
      isValid: true,
    };
  }

  // Creation intents require a non-empty title
  if (!sanitizedTitle) {
    return {
      ...intent,
      isValid: false,
      validationError: 'Title cannot be empty for task, event, reminder, or note creation.',
    };
  }

  return {
    ...intent,
    title: sanitizedTitle,
    isValid: true,
  };
}
