export type ParsedIntentType =
  | 'create_task'
  | 'create_time_block'
  | 'create_reminder'
  | 'create_note'
  | 'acknowledge'
  | 'snooze'
  | 'reschedule'
  | 'query_schedule'
  | 'chat'
  | 'out_of_scope';

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

/** Validates and clamps an extracted intent to ensure strict schema compliance before DB execution. */
export function validateIntent(intent: ExtractedIntent): ValidatedIntent {
  const sanitizedTitle = (intent.title || '').trim();

  // Call responses
  if (intent.intent === 'acknowledge') {
    return { ...intent, isValid: true };
  }

  if (intent.intent === 'snooze') {
    const minutes = Math.max(1, Math.min(1440, intent.snoozeMinutes || 10));
    return { ...intent, snoozeMinutes: minutes, isValid: true };
  }

  if (intent.intent === 'reschedule') {
    if (!intent.time && !intent.date) {
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

  // Scheduling & note intents require a non-empty title
  if (!sanitizedTitle) {
    return {
      ...intent,
      isValid: false,
      validationError: 'Title cannot be empty for task, event, reminder, or note creation.',
    };
  }

  // Validate time format (HH:mm)
  if (intent.time && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(intent.time)) {
    return {
      ...intent,
      isValid: false,
      validationError: `Invalid time format: ${intent.time}. Expected HH:mm.`,
    };
  }

  if (intent.endTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(intent.endTime)) {
    return {
      ...intent,
      isValid: false,
      validationError: `Invalid end time format: ${intent.endTime}. Expected HH:mm.`,
    };
  }

  // Validate date format (YYYY-MM-DD)
  if (intent.date && !/^\d{4}-\d{2}-\d{2}$/.test(intent.date)) {
    return {
      ...intent,
      isValid: false,
      validationError: `Invalid date format: ${intent.date}. Expected YYYY-MM-DD.`,
    };
  }

  return {
    ...intent,
    title: sanitizedTitle,
    isValid: true,
  };
}
