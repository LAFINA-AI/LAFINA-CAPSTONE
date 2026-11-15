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
  | 'query_notes'
  // Alarm plan A3: device-local wake-up alarms (not reminders, not synced).
  | 'create_alarm'
  | 'update_alarm'
  | 'delete_alarm'
  | 'toggle_alarm'
  | 'list_alarms'
  | 'chat'
  | 'out_of_scope';

export type CrudTargetEntityType = 'task' | 'time_block' | 'event' | 'note' | 'reminder' | 'any';

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
  dateRange?: 'this_week' | 'next_week' | null;
  recurrenceRule?: string | null;
  priority?: 'High' | 'Medium' | 'Low' | null;
  location?: string | null;
  isPinned?: boolean | null;
  newCategory?: string | null;
  checklistItems?: string[] | null;
  /**
   * Bulk delete ("clear completed tasks", "delete tomorrow's events"). The
   * review card lists every item before anything is removed.
   */
  bulkScope?: 'completed_tasks' | 'date_items' | null;
  /** "remind me 30 minutes before my math exam": minutes before `targetTitle` starts. */
  leadMinutes?: number | null;
  /**
   * How a new reminder reaches the student: a reminder call (default) or an
   * ordinary notification ("notify me", "no call"). Device-local, never synced.
   */
  deliveryStyle?: 'call' | 'notify' | null;
  /** toggle_alarm: true turns the alarm on, false turns it off. */
  alarmEnabled?: boolean | null;
}

export interface ValidatedIntent extends ExtractedIntent {
  isValid: boolean;
  validationError?: string;
}

export interface NluActionResult {
  success: boolean;
  intent: ParsedIntentType;
  entityType?: 'task' | 'time_block' | 'event' | 'reminder' | 'note';
  entityId?: string;
  reply: string;
  error?: string;
}

export type DownloadableOfflineModelId =
  | 'smollm2-135m'
  | 'gemma-3-270m'
  | 'qwen2.5-0.5b'
  | 'gemma-3-1b';

export type OfflineModelId = 'fast_path_only' | DownloadableOfflineModelId;

export type OfflinePromptFormat = 'chatml' | 'gemma';

export interface OfflineModelPreset {
  id: OfflineModelId;
  name: string;
  shortLabel: string;
  filename: string | null;
  url: string | null;
  approximateSizeBytes: number;
  minValidSizeBytes: number;
  promptFormat: OfflinePromptFormat;
  recommendedRamGb: number;
  description: string;
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
  modelId?: OfflineModelId;
  shortLabel?: string;
  approximateSizeBytes?: number;
  recommendedRamGb?: number;
  description?: string;
  isSelected?: boolean;
}

export interface DeviceHardwareSpecs {
  isDetected: boolean;
  totalRamBytes: number;
  availableRamBytes: number;
  totalRamGb: number;
  availableRamGb: number;
  advertisedRamGb: number;
  isLowRamDevice: boolean;
  isLowMemoryNow: boolean;
  cpuCores: number;
  supports64Bit: boolean;
  primaryAbi: string;
  availableStorageBytes: number;
  totalStorageBytes: number;
  deviceLabel: string;
  androidSdk: number | null;
}

export type ModelCompatibilityTier =
  | 'recommended'
  | 'compatible'
  | 'tight_fit'
  | 'unsupported';

export interface OfflineModelFitAssessment {
  modelId: OfflineModelId;
  tier: ModelCompatibilityTier;
  isRecommended: boolean;
  hasEnoughRam: boolean;
  hasEnoughStorage: boolean;
  note: string | null;
}

export interface DeviceAiRecommendation {
  specs: DeviceHardwareSpecs;
  recommendedModelId: OfflineModelId;
  headline: string;
  reason: string;
  specSummary: string;
  assessments: Record<OfflineModelId, OfflineModelFitAssessment>;
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

  if (
    intent.intent === 'query_schedule' ||
    intent.intent === 'query_notes' ||
    intent.intent === 'list_alarms'
  ) {
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

  // Alarm plan A3. Which alarm is meant is resolved against the owner's
  // alarms when the review card is prepared; an empty target means "my alarm".
  if (intent.intent === 'create_alarm') {
    if (!intent.time) {
      return {
        ...intent,
        isValid: false,
        validationError: 'What time should the alarm ring? For example "set an alarm for 6 AM".',
      };
    }
    return {...intent, title: sanitizedTitle || null, isValid: true};
  }
  if (intent.intent === 'update_alarm') {
    if (!intent.time && !intent.recurrenceRule && !sanitizedNewTitle) {
      return {
        ...intent,
        isValid: false,
        validationError: 'Tell me the new alarm time, for example "change my 6 AM alarm to 6:30".',
      };
    }
    return {...intent, isValid: true};
  }
  if (intent.intent === 'toggle_alarm') {
    if (typeof intent.alarmEnabled !== 'boolean') {
      return {
        ...intent,
        isValid: false,
        validationError: 'Should the alarm be turned on or off?',
      };
    }
    return {...intent, isValid: true};
  }
  if (intent.intent === 'delete_alarm') {
    return {...intent, isValid: true};
  }

  // Delete / Cancel / Remove intents
  if (
    intent.intent === 'delete_task' ||
    intent.intent === 'delete_time_block' ||
    intent.intent === 'delete_note'
  ) {
    if (intent.bulkScope) {
      return {...intent, isValid: true};
    }
    if (
      !sanitizedTargetTitle &&
      !sanitizedTitle &&
      !intent.targetTime &&
      !intent.time &&
      !intent.date
    ) {
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
        typeof intent.isCompleted === 'boolean' ||
        typeof intent.isPinned === 'boolean' ||
        Boolean((intent.newCategory || '').trim()) ||
        Boolean(intent.priority) ||
        Boolean((intent.location || '').trim()) ||
        Boolean(intent.checklistItems && intent.checklistItems.length > 0),
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
