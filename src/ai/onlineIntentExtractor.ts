import {onlineChatSkill} from '../skills/onlineChatSkill';
import {isRealDate} from '../storage/eventTime';
import {classifySmallTalk} from './localConversation';
import {detectCategory, formatLocalDate} from './nlu/fastPathParser';
import {routeIntent} from './nlu/intentRoutes';
import {
  validateIntent,
  type CrudTargetEntityType,
  type ExtractedIntent,
  type ParsedIntentType,
  type ValidatedIntent,
} from './nlu/types';

/** Handbook topics answer only from the verified online handbook, never offline. */
export const isHandbookQuestion = (text: string): boolean =>
  /\b(?:ustp|handbook|dean'?s\s+list|grading\s+system|retention\s+policy|tuition|graduation\s+requirements|uniform\s+policy|dress\s+code|drop(?:ping)?\s+subject|prerequisite|academic\s+probation)\b/i.test(
    text,
  );

const ONLINE_EXTRACTABLE_INTENTS = new Set<ParsedIntentType>([
  'create_task',
  'create_time_block',
  'create_reminder',
  'create_note',
  'update_task',
  'update_time_block',
  'update_note',
  'delete_task',
  'delete_time_block',
  'delete_note',
  'reschedule',
  'chat',
]);

const ENTITY_TYPES = new Set<CrudTargetEntityType>([
  'task',
  'time_block',
  'event',
  'reminder',
  'note',
  'any',
]);

const UNSTRUCTURED_PLANNER_PHRASE =
  /\b(?:schedule|reschedule|book|block\s+out|remind\s+me|set\s+(?:a|an)?\s*reminder|add\s+(?:a\s+)?(?:task|todo|to-?do|to\s+do|event|meeting|appointment|note|reminder|checklist)|put\s+.+\s+on\s+(?:my|the)\s+(?:calendar|schedule|to-?do|to\s+do|todo)(?:\s+list)?|add\s+.+\s+to\s+(?:my|the)\s+(?:to-?do|to\s+do|todo)(?:\s+list)?|create\s+(?:a\s+)?(?:task|todo|to-?do|event|time\s*block|reminder|note|checklist)|check\s+off|tick\s+off|uncheck|untick|reopen|pin|unpin|mark\s+.+\s+as\s+(?:done|complete|completed|not\s+done|incomplete|open|pending)|don['’]?t\s+forget\s+to|i\s+have\s+(?:a|an)\s+(?:meeting|appointment|exam|quiz|class|call|deadline|presentation|event)\b|need\s+to\s+(?:submit|finish|meet|attend|study|review|call|buy|print)|jot\s+(?:this\s+)?down|cancel\s+(?:my|the)|delete\s+(?:my|the)|move\s+(?:my|the)\s+.+\s+to|change\s+(?:the\s+)?(?:priority|category|title|time|date))\b/i;

const OPEN_ENDED_PLANNING_OR_STUDY_QUESTION =
  /^(?:what|why|how|who|where|when|explain|summarize|define|compare|outline|tell\s+me|give\s+me|plan\s+my\s+(?:week|day|month|semester)|help\s+me\s+plan)\b/i;

const POLITE_COMMAND_QUESTION =
  /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:schedule|reschedule|book|block|remind|add|create|make|set|put|cancel|delete|move|update|edit|change|rename|jot|save|complete|finish|check\s+off|uncheck|reopen|pin|unpin)\b/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Decides whether a user message in Online Mode should use DeepSeek to extract
 * structured planner intent rather than pure conversational chat or local read queries.
 * Leaves small talk, USTP handbook questions, read-only queries, and study/concept
 * questions untouched so online chat never makes extra round trips.
 */
export function shouldUseOnlineIntentExtraction(
  text: string,
  fastPath: ValidatedIntent,
): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return false;
  }

  if (classifySmallTalk(trimmed) || isHandbookQuestion(trimmed)) {
    return false;
  }

  if (
    fastPath.intent === 'query_schedule' ||
    fastPath.intent === 'query_notes' ||
    fastPath.intent === 'acknowledge' ||
    fastPath.intent === 'snooze'
  ) {
    return false;
  }

  if (
    OPEN_ENDED_PLANNING_OR_STUDY_QUESTION.test(trimmed) ||
    (trimmed.endsWith('?') && !POLITE_COMMAND_QUESTION.test(trimmed))
  ) {
    return false;
  }

  if (routeIntent(fastPath.intent) === 'reviewed_mutation') {
    return true;
  }

  if (fastPath.intent === 'chat') {
    return UNSTRUCTURED_PLANNER_PHRASE.test(trimmed);
  }

  return false;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatReferenceClock(referenceDate: Date): {
  dateStr: string;
  weekday: string;
  timeStr: string;
} {
  const dateStr = formatLocalDate(referenceDate);
  const weekday = WEEKDAYS[referenceDate.getDay()] || 'Day';
  const hh = String(referenceDate.getHours()).padStart(2, '0');
  const mm = String(referenceDate.getMinutes()).padStart(2, '0');
  return {dateStr, weekday, timeStr: `${hh}:${mm}`};
}

function buildIntentExtractionPrompt(
  transcript: string,
  referenceDate: Date,
): string {
  const {dateStr, weekday, timeStr} = formatReferenceClock(referenceDate);
  return [
    'Extract the structured student planner command from the user message and return ONLY a single valid JSON object (no markdown fences, no commentary).',
    `Current local reference: ${dateStr} (${weekday}), time ${timeStr}.`,
    'Allowed "intent" values:',
    '- "create_task": tasks, to-dos, deadlines without an explicit duration/time-range',
    '- "create_event": standalone calendar events or appointments ("add an event...", "book an appointment...")',
    '- "create_time_block": explicit time blocks, study blocks, focus blocks, work blocks, or scheduled slots with start+end time/duration',
    '- "create_reminder": explicit reminders ("remind me...", "set a reminder...")',
    '- "create_note": saving a note or checklist ("note...", "jot down...", "checklist...")',
    '- "update_task", "update_time_block", "update_note", "delete_task", "delete_time_block", "delete_note", "complete_task"',
    '- "chat": NOT a planner action (questions, advice, open-ended chat, cancelled requests)',
    'JSON schema:',
    '{"intent":string,"title":string|null,"date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"endTime":"HH:MM"|null,"durationMinutes":number|null,"category":"Academic"|"Personal"|"APPEND","priority":"High"|"Medium"|"Low"|null,"details":string|null,"location":string|null,"isCompleted":boolean|null,"isPinned":boolean|null,"newCategory":string|null,"checklistItems":string[]|null,"targetTitle":string|null,"newTitle":string|null,"targetEntityType":"task"|"time_block"|"event"|"reminder"|"note"|"any"|null}',
    'Rules:',
    '1. "title" must be clean and concise: strip command prefixes ("schedule me a", "remind me to", "make me a"), indirect pronouns ("me", "for me"), articles ("a", "an", "the"), destination phrases ("to my to-do list"), and extracted date/time phrases. Example: "schedule me a meeting tommorow at 3pm" -> title "Meeting".',
    '2. Fix obvious spelling typos like "tommorow"/"tomorow"/"tmr" and resolve relative dates against the reference date. Leave "date" null for undated To-Dos.',
    '3. Use 24-hour "HH:MM" for time/endTime. Use "Academic" for class, study, exam, homework, lab, thesis, or faculty/advisor items; otherwise "Personal" (or "APPEND" on update_note when appending text).',
    '4. For reopening/unchecking a task, use "intent":"update_task","isCompleted":false. For pinning/unpinning a note, use "intent":"update_note","isPinned":true|false. For checklist notes, set "checklistItems".',
    `User message: ${JSON.stringify(transcript)}`,
  ].join('\n');
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = (raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function cleanString(value: unknown, maxLen: number = 240): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLen);
}

function parseRawIntentType(
  value: unknown,
  entityType?: CrudTargetEntityType,
): {
  intent: ParsedIntentType;
  isCompleted?: boolean;
  defaultEntityType?: CrudTargetEntityType;
} | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'create_event') {
    return {intent: 'create_time_block', defaultEntityType: 'event'};
  }
  if (normalized === 'update_schedule_item' || normalized === 'update_event') {
    return {intent: 'update_time_block', defaultEntityType: 'event'};
  }
  if (normalized === 'complete_task') {
    return {intent: 'update_task', isCompleted: true, defaultEntityType: 'task'};
  }
  if (normalized === 'reopen_task') {
    return {intent: 'update_task', isCompleted: false, defaultEntityType: 'task'};
  }
  if (normalized === 'delete_event') {
    return {intent: 'delete_time_block'};
  }
  if (normalized === 'delete_item') {
    if (entityType === 'note') return {intent: 'delete_note'};
    if (entityType === 'time_block' || entityType === 'event') {
      return {intent: 'delete_time_block'};
    }
    return {intent: 'delete_task'};
  }
  if (normalized === 'reschedule_reminder') {
    return {intent: 'reschedule'};
  }
  if (ONLINE_EXTRACTABLE_INTENTS.has(normalized as ParsedIntentType)) {
    return {intent: normalized as ParsedIntentType};
  }
  return null;
}

function parseValidatedDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!DATE_RE.test(trimmed) || !isRealDate(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseValidatedTime(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return TIME_RE.test(trimmed) ? trimmed : null;
}

function wallTimeToMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + mm;
}

function parseDurationMinutes(
  value: unknown,
  startTime: string | null,
  endTime: string | null,
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= 5 && rounded <= 720) {
      return rounded;
    }
  }
  if (startTime && endTime) {
    const diff = wallTimeToMinutes(endTime) - wallTimeToMinutes(startTime);
    if (diff >= 5 && diff <= 720) {
      return diff;
    }
  }
  return null;
}

function parsePriority(value: unknown): 'High' | 'Medium' | 'Low' | null {
  if (typeof value !== 'string') {
    return null;
  }
  const lower = value.trim().toLowerCase();
  if (lower === 'high' || lower === 'urgent') return 'High';
  if (lower === 'medium' || lower === 'normal') return 'Medium';
  if (lower === 'low') return 'Low';
  return null;
}

function parseCategory(
  value: unknown,
  intent: ParsedIntentType,
  fallbackText: string,
): string {
  if (intent === 'update_note' && value === 'APPEND') {
    return 'APPEND';
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'academic') return 'Academic';
    if (lower === 'personal') return 'Personal';
  }
  return detectCategory(fallbackText);
}

/**
 * Calls DeepSeek via the authenticated backend chat endpoint to parse a natural-language
 * scheduling/planner command into a strictly validated local `ValidatedIntent`.
 * Returns `null` on network/auth failure, non-JSON output, or invalid intent schema so the
 * caller can safely fall back to offline fast-path/SLM parsing.
 */
export async function extractIntentWithDeepSeek(
  transcript: string,
  referenceDate: Date = new Date(),
): Promise<ValidatedIntent | null> {
  const trimmed = (transcript || '').trim();
  if (!trimmed) {
    return null;
  }

  let result;
  try {
    result = await onlineChatSkill.sendChatMessage(
      [
        {
          role: 'user',
          content: buildIntentExtractionPrompt(trimmed, referenceDate),
        },
      ],
      {useHandbook: false},
    );
  } catch (error) {
    console.warn('[OnlineIntentExtractor] Failed calling DeepSeek:', error);
    return null;
  }

  if (result.status !== 'success' || !result.data?.reply) {
    return null;
  }

  const obj = extractJsonObject(result.data.reply);
  if (!obj) {
    return null;
  }
  return parseExtractedIntentObject(obj, trimmed);
}

function parseExtractedIntentObject(
  obj: Record<string, unknown>,
  trimmed: string,
): ValidatedIntent | null {
  const rawEntityType =
    typeof obj.targetEntityType === 'string' &&
    ENTITY_TYPES.has(obj.targetEntityType as CrudTargetEntityType)
      ? (obj.targetEntityType as CrudTargetEntityType)
      : undefined;

  const parsedIntent = parseRawIntentType(obj.intent, rawEntityType);
  if (!parsedIntent) {
    return null;
  }
  const {intent, defaultEntityType} = parsedIntent;
  const targetEntityType = rawEntityType || defaultEntityType;
  const isCompleted =
    typeof obj.isCompleted === 'boolean'
      ? obj.isCompleted
      : parsedIntent.isCompleted;

  if (intent === 'chat') {
    return validateIntent({
      intent: 'chat',
      title: null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Personal',
      details: trimmed,
      snoozeMinutes: null,
      confidence: 0.92,
      source: 'cloud',
      rawTranscript: trimmed,
    });
  }

  const title = cleanString(obj.title);
  const targetTitle = cleanString(obj.targetTitle);
  const newTitle = cleanString(obj.newTitle);
  const details = cleanString(obj.details, 1000);
  const location = cleanString(obj.location, 120);
  const newCategory = cleanString(obj.newCategory, 40);
  const isPinned =
    typeof obj.isPinned === 'boolean' ? obj.isPinned : undefined;
  const checklistItems = Array.isArray(obj.checklistItems)
    ? obj.checklistItems
        .map(item => cleanString(item, 200))
        .filter((item): item is string => Boolean(item))
    : undefined;
  const date = parseValidatedDate(obj.date);
  const time = parseValidatedTime(obj.time);
  const endTime = parseValidatedTime(obj.endTime);
  const priority = parsePriority(obj.priority);
  const durationMinutes = parseDurationMinutes(
    obj.durationMinutes,
    time,
    endTime,
  );

  if (
    (intent === 'create_task' ||
      intent === 'create_time_block' ||
      intent === 'create_reminder') &&
    !title
  ) {
    return null;
  }
  if (
    intent === 'create_note' &&
    !title &&
    !details &&
    !(checklistItems && checklistItems.length > 0)
  ) {
    return null;
  }

  const rawExtracted: ExtractedIntent = {
    intent,
    title: title || targetTitle || null,
    ...(targetTitle ? {targetTitle} : {}),
    ...(newTitle ? {newTitle} : {}),
    ...(typeof isCompleted === 'boolean' ? {isCompleted} : {}),
    ...(typeof isPinned === 'boolean' ? {isPinned} : {}),
    ...(location ? {location} : {}),
    ...(newCategory ? {newCategory} : {}),
    ...(checklistItems && checklistItems.length > 0 ? {checklistItems} : {}),
    ...(targetEntityType ? {targetEntityType} : {}),
    date,
    time,
    endTime,
    durationMinutes,
    category: parseCategory(
      obj.category,
      intent,
      `${title || ''} ${targetTitle || ''} ${trimmed}`,
    ),
    ...(priority ? {priority} : {}),
    details:
      intent === 'create_note'
        ? details ||
          (checklistItems && checklistItems.length > 0
            ? checklistItems.map(i => `- [ ] ${i}`).join('\n')
            : title || trimmed)
        : details && details.toLowerCase() !== (title || '').toLowerCase()
        ? details
        : null,
    snoozeMinutes: null,
    confidence: 0.94,
    source: 'cloud',
    rawTranscript: trimmed,
  };

  const validated = validateIntent(rawExtracted);
  if (!validated.isValid) {
    return null;
  }
  return validated;
}

/**
 * Extracts multiple planner actions from one compound student message using DeepSeek.
 * Returns null if fewer than 2 valid actions are extracted so single-action flows proceed.
 */
export async function extractMultiIntentsWithDeepSeek(
  transcript: string,
  referenceDate: Date = new Date(),
): Promise<ValidatedIntent[] | null> {
  const trimmed = (transcript || '').trim();
  if (!trimmed) return null;
  const {dateStr, weekday, timeStr} = formatReferenceClock(referenceDate);
  const prompt = [
    'Extract ALL distinct student planner commands from the compound user message and return ONLY a JSON object: {"intents":[...]}.',
    `Current local reference: ${dateStr} (${weekday}), time ${timeStr}.`,
    'Each item uses the same schema: {"intent":string,"title":string|null,"date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"endTime":"HH:MM"|null,"durationMinutes":number|null,"category":"Academic"|"Personal","priority":"High"|"Medium"|"Low"|null,"details":string|null,"location":string|null,"checklistItems":string[]|null,"targetTitle":string|null,"newTitle":string|null,"targetEntityType":"task"|"time_block"|"event"|"reminder"|"note"|"any"|null}.',
    'Allowed intents per item: create_task, create_event, create_time_block, create_reminder, create_note, update_task, update_time_block, update_note, delete_task, delete_time_block, delete_note, complete_task. Max 5 items.',
    `User message: ${JSON.stringify(trimmed)}`,
  ].join('\n');

  try {
    const result = await onlineChatSkill.sendChatMessage(
      [{role: 'user', content: prompt}],
      {useHandbook: false},
    );
    if (result.status !== 'success' || !result.data?.reply) return null;
    const obj = extractJsonObject(result.data.reply);
    if (!obj || !Array.isArray(obj.intents)) return null;
    const valid = obj.intents
      .slice(0, 5)
      .map(item =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? parseExtractedIntentObject(item as Record<string, unknown>, trimmed)
          : null,
      )
      .filter((v): v is ValidatedIntent => v !== null && v.intent !== 'chat');
    return valid.length >= 2 ? valid : null;
  } catch {
    return null;
  }
}
