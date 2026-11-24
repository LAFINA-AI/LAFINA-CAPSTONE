import {onlineChatSkill} from '../skills/onlineChatSkill';
import {isRealDate} from '../storage/eventTime';
import {classifySmallTalk} from './localConversation';
import {
  alarmRepeatRule,
  detectCategory,
  formatLocalDate,
  parseDateAndTime,
  NUM_WORDS_PATTERN,
} from './nlu/fastPathParser';
import {routeIntent} from './nlu/intentRoutes';
import {
  validateIntent,
  type CrudTargetEntityType,
  type ExtractedIntent,
  type ParsedIntentType,
  type ValidatedIntent,
} from './nlu/types';

/**
 * Phrases that name a handbook policy on their own ("dean's list", "dress
 * code", "leave of absence").
 */
const HANDBOOK_STRONG_CUE_RE =
  /\b(?:ustp\s+(?:policy|policies|rules?|handbook|regulations?)|(?:student\s+)?handbook|dean['\u2018\u2019]?s\s+list|grading\s+system|retention\s+policy|graduation\s+requirements?|uniform\s+policy|dress\s+code|academic\s+probation|inc\s+(?:grade|completion|policy)|grade\s+completion|cum\s+laude|latin\s+honors|leave\s+of\s+absence|attendance\s+policy|absenteeism|academic\s+dishonesty|student\s+conduct|shifting\s+policy|honorable\s+dismissal|scholarship\s+policy|maximum\s+(?:allowable\s+)?absences|allowable\s+absences|unexcused\s+absences?|passing\s+grade)\b/i;

/** Policy topics that are only handbook questions next to a policy cue. */
const HANDBOOK_TOPIC_RE =
  /\b(?:gwa|gpa|tuition|fees?|prerequisites?|absences?|absent|tardiness|plagiari[sz]m|cheating|cheat|transferee|uniform|haircut|probation|retention|scholarship|overload|underload|inc|incomplete|grades?|grading|honors?|nstp|rotc|loa|(?:drop(?:ping)?|withdraw(?:ing|al)?)\s+(?:(?:a|this|that|my|the|one)\s+)?(?:subjects?|course|class|units?)|mag[\s-]?drop|fail(?:ed|ing)?\s+(?:(?:a|this|that|my|the)\s+)?(?:subjects?|course|class)|shift(?:ing)?\s+(?:(?:of|to|ng|my|another|a)\s+)*(?:courses?|programs?|degrees?|majors?)|mag[\s-]?shift)\b/i;

/** Words that ask what is allowed, required or what happens. */
const HANDBOOK_POLICY_CUE_RE =
  /\b(?:ustp|polic(?:y|ies)|rules?|regulations?|allowed|allowable|permitted|maximum|max|minimum|required|requirements?|requirement|penalty|penalties|sanctions?|what\s+happens|can\s+i|may\s+i|am\s+i\s+allowed|is\s+it\s+(?:okay|ok|allowed)|pwede|puwede|bawal|procedure|process|how\s+(?:do|can)\s+i|how\s+to|how\s+many|how\s+much|qualify|qualifications?|eligible|eligibility|deadline|what\s+is|what\s+are|ano\s+ang)\b/i;

/**
 * Commands and questions about the student's own data. They stay with the
 * planner even when they mention a policy word ("remind me to pay tuition",
 * "how many absences do I have left").
 */
const PERSONAL_PLANNER_RE =
  /^(?:please\s+)?(?:add|remind|schedule|create|make|set|book|put|take\s+(?:a\s+)?note|note|jot|save|mark|move|delete|cancel|update|edit|rename)\b|\b(?:do\s+i\s+(?:still\s+)?have(?:\s+left)?|i\s+have\s+left|have\s+i\s+(?:got|used)|my\s+(?:schedule|calendar|tasks?|to-?dos?|notes?|reminders?|alarms?|classes|goal|goals|plan|plans|day|week|grades?|gwa|gpa|absences?|units|balance)|(?:goal|target)\s+note)\b/i;

/**
 * USTP Cagayan de Oro information in the local knowledge pack: university
 * calendar dates, portals, offices and services. These name the institution's
 * own things; a student's personal schedule stays with the planner below.
 */
const CAMPUS_STRONG_CUE_RE =
  /\b(?:academic\s+calendar|university\s+calendar|ustp\s+calendar|week\s+of\s+welcome|prisms|ustep|e-?\s?clearance|ustat|e-?\s?library|main\s+library|graduate\s+library|registrar['’]?s?(?:\s+office)?|admission\s+and\s+scholarship\s+office|admissions?\s+(?:portal|office|test)|enrollment\s+(?:period|flow|steps?)|(?:dean|director)\s+of\s+(?:the\s+)?(?:citc|cea|csm|cste|cot|college|library|guidance|health|admissions?|student\s+affairs)|(?:ustp|cdo|cagayan\s+de\s+oro)\s+(?:campus|address|programs?|courses|offices?|contact|phone|hotline|library|organi[sz]ations?|orgs?|scholarships?|holidays?)|(?:programs?|courses)\s+(?:(?:are\s+)?offered|does\s+ustp))\b/i;

/** The Admission and Scholarship Office, written as its acronym (not "aso", dog). */
const CAMPUS_OFFICE_ACRONYM_RE = /\b(?:ASO|ICTS)\b/;

/** A term of the university calendar ("2nd sem", "midyear")... */
const CAMPUS_TERM_RE =
  /\b(?:first|second|1st|2nd)\s+sem(?:ester)?\b|\bmid-?\s?year\b|\bsemester\b/i;
/** ...together with a calendar event asks for a published date. */
const CAMPUS_CALENDAR_EVENT_RE =
  /\b(?:starts?|begins?|ends?|break|finals?|midterms?|prelim(?:inary|s)?|pre-?\s?finals?|exams?|examinations?|enrol(?:l)?(?:ment)?|classes|holidays?|deadline|dean['’]?s\s+list(?:ers)?)\b/i;

/** True when the text asks about a handbook policy anywhere in it. */
export const hasHandbookSignal = (text: string): boolean =>
  HANDBOOK_STRONG_CUE_RE.test(text) ||
  (HANDBOOK_TOPIC_RE.test(text) && HANDBOOK_POLICY_CUE_RE.test(text)) ||
  CAMPUS_STRONG_CUE_RE.test(text) ||
  CAMPUS_OFFICE_ACRONYM_RE.test(text) ||
  (CAMPUS_TERM_RE.test(text) && CAMPUS_CALENDAR_EVENT_RE.test(text));

/**
 * Detects USTP Student Handbook / academic policy questions for local FTS5 or
 * online RAG. Personal planner commands and questions about the student's
 * own data never count, even when they contain a policy word (audit H3).
 */
export const isHandbookQuestion = (text: string): boolean =>
  hasHandbookSignal(text) && !PERSONAL_PLANNER_RE.test(text.trim());

/**
 * The handbook half of a mixed question ("what is my schedule tomorrow and
 * what is the USTP attendance policy?"), or null when there is none or the
 * whole message is the handbook question.
 */
export function extractHandbookClause(text: string): string | null {
  const trimmed = (text || '').trim();
  if (!trimmed || isHandbookQuestion(trimmed)) {
    return null;
  }
  const clauses = trimmed
    .split(/\s*(?:[?;]|\.\s+|,?\s+\b(?:and\s+also|and|also|plus|tapos|at\s+saka)\b)\s*/i)
    .map(part => part.trim())
    .filter(part => part.length > 0);
  if (clauses.length < 2) {
    return null;
  }
  const hit = clauses.find(part => isHandbookQuestion(part));
  return hit ?? null;
}

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
  // Alarm plan A3: a wake-up phrasing the device parser missed. Changing or
  // deleting an existing alarm stays on the device parser.
  'create_alarm',
  'chat',
]);

/** Alarm requests the device parser recognised: it is authoritative for them. */
const DEVICE_ONLY_INTENTS = new Set<ParsedIntentType>([
  'create_alarm',
  'update_alarm',
  'delete_alarm',
  'toggle_alarm',
  'list_alarms',
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
    DEVICE_ONLY_INTENTS.has(fastPath.intent) ||
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
    '- "create_alarm": a clock alarm that rings to wake the student ("set an alarm...", "wake me up at...", "get me up at six"); "time" is required and "title" is an optional short label. Use "create_reminder" only when the student asks to be reminded of something.',
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
    return {
      intent: 'update_task',
      isCompleted: true,
      defaultEntityType: 'task',
    };
  }
  if (normalized === 'reopen_task') {
    return {
      intent: 'update_task',
      isCompleted: false,
      defaultEntityType: 'task',
    };
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
      {useHandbook: false, keepNameCase: true},
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
  const parsed = parseExtractedIntentObject(obj, trimmed);
  return parsed ? withLocalRelativeTime(parsed, trimmed, referenceDate) : null;
}

/** "in 5 minutes", "an hour from now", "10 mins later", "in a couple minutes". */
const RELATIVE_CLOCK_RE = new RegExp(
  `\\b(?:in|after)\\s+(?:about\\s+)?(?:an?\\s+|half\\s+(?:an?\\s+)?|(?:a\\s+)?(?:couple|few)(?:\\s+of)?\\s*|(?:${NUM_WORDS_PATTERN})\\s*)(?:minutes?|mins?|hours?|hrs?)\\b|\\b(?:minutes?|mins?|hours?|hrs?)\\s+(?:from\\s+now|later)\\b`,
  'i',
);

/**
 * The model only sees the reference time to the minute, so "in 1 minute" at
 * 9:36:26 came back as 9:37, already 26 seconds closer than asked and often
 * past before Confirm (device test 2026-11-23). For a relative time the
 * phone's own clock math (rounded up to a whole minute) wins.
 */
export function withLocalRelativeTime(
  intent: ValidatedIntent,
  text: string,
  referenceDate: Date,
): ValidatedIntent {
  if (!intent.time || !RELATIVE_CLOCK_RE.test(text)) return intent;
  const local = parseDateAndTime(text, referenceDate);
  if (!local.time || !local.date) return intent;
  return {...intent, date: local.date, time: local.time};
}

/** Turns a model-written planner object into a validated intent, or null. */
export function parseExtractedIntentObject(
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
  const isPinned = typeof obj.isPinned === 'boolean' ? obj.isPinned : undefined;
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
  if (intent === 'create_alarm' && !time) {
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
    // Alarm repeat days come from the student's own words, not the model.
    ...(intent === 'create_alarm' && alarmRepeatRule(trimmed)
      ? {recurrenceRule: alarmRepeatRule(trimmed)}
      : {}),
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
      {useHandbook: false, keepNameCase: true},
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
