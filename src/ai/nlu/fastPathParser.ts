import type { CrudTargetEntityType, ExtractedIntent, ParsedIntentType } from './types';

/** Dictionary mapping spoken number words to integers. */
export const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  oh: 0,
  o: 0,
  a: 1,
  an: 1,
  one: 1,
  won: 1,
  two: 2,
  to: 2,
  too: 2,
  three: 3,
  four: 4,
  for: 4,
  fore: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ate: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  couple: 2,
  few: 5,
};

const STRICT_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  oh: 0,
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  couple: 2,
  few: 5,
};

/** Parses spoken number words (e.g. "five", "twenty-five", "oh five") or raw digits into a number. */
export function parseNumberWordOrDigits(
  token: string | null | undefined,
  allowHomophones: boolean = false,
): number | null {
  if (!token) return null;
  const trimmed = token.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const dict = allowHomophones ? NUMBER_WORDS : STRICT_NUMBER_WORDS;
  if (dict[trimmed] !== undefined) {
    return dict[trimmed];
  }
  const parts = trimmed.split(/[\s-]+/);
  if (parts.length === 2 && dict[parts[0]] !== undefined && dict[parts[1]] !== undefined) {
    const first = dict[parts[0]];
    const second = dict[parts[1]];
    if ((parts[0] === 'oh' || parts[0] === 'o') && second >= 1 && second <= 9) {
      return second;
    }
    if (first >= 20 && first <= 90 && second >= 1 && second <= 9) {
      return first + second;
    }
  }
  return null;
}

/** Regex pattern matching digits or spoken number words including compounds. */
export const NUM_WORDS_PATTERN =
  '(?:\\d+|(?:twenty|thirty|forty|fourty|fifty|sixty)(?:[\\s-]+(?:one|two|three|four|five|six|seven|eight|nine))|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|couple|few|a|an)';

const HOUR_TOKEN_PATTERN =
  '(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';

const SPOKEN_MINUTE_PATTERN =
  '(?:(?:oh|o)[\\s-]+(?:one|two|three|four|five|six|seven|eight|nine)|(?:twenty|thirty|forty|fourty|fifty)(?:[\\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|0\\d|[1-5]\\d)';

const MERIDIEM_OR_ANCHOR_PATTERN =
  '(?:(?:am|pm)\\s+(?:noon|midday|mid-day|midnight)|noon|midday|mid-day|midnight|am|pm|in\\s+the\\s+morning|in\\s+the\\s+afternoon|in\\s+the\\s+evening|at\\s+night|tonight)';

const TIME_ENDPOINT_PATTERN =
  `(?:(?:noon|midday|mid-day|midnight)(?:\\s+(?:12|twelve)(?::00)?)?|(${HOUR_TOKEN_PATTERN})(?:(?::(\\d{2}))|(?:\\s+(${SPOKEN_MINUTE_PATTERN})))?(?:\\s+oclock)?(?:\\s*(${MERIDIEM_OR_ANCHOR_PATTERN}))?)`;

/** Formats a Date object to YYYY-MM-DD in local time. */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats hours and minutes to HH:mm in 24-hour format. */
export function formatLocalTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Splits a 3- or 4-digit compact time token (e.g. "730" -> 7:30, "1030" -> 10:30, "0730" -> 07:30) if valid. */
function splitCompactDigitsToTime(
  digits: string,
  requireStandardMinuteWhenBare: boolean = false,
): { hourStr: string; hour: number; minuteStr: string; minute: number } | null {
  if (!/^\d{3,4}$/.test(digits)) return null;
  const hourStr = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minuteStr = digits.slice(-2);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  // Avoid treating years like 2025, 2026, 2027 as bare military times when no meridiem is attached
  if (digits.length === 4 && hour === 20 && minute >= 20 && minute <= 35 && requireStandardMinuteWhenBare) {
    return null;
  }
  if (requireStandardMinuteWhenBare && digits.length === 3 && minute % 5 !== 0) {
    return null;
  }
  return { hourStr, hour, minuteStr, minute };
}

/**
 * Normalizes speech transcript artifacts and STT transcription quirks:
 * - Attached or spaced "a.m." / "p.m." / "a m" / "p m" -> "am" / "pm"
 * - Compact 3/4-digit times ("730AM" -> "7:30 am", "1030pm" -> "10:30 pm", "at 730" -> "at 7:30", "730 to 930" -> "7:30 to 9:30")
 * - Dot-separated or space-separated times ("7.30 am" -> "7:30 am", "7 30 am" -> "7:30 am")
 * - Spoken "oh" minutes ("7 oh 5 am" / "7 o 5 am" -> "7:05 am")
 * - Whisper homophones before meridiems ("at to pm" -> "at 2 pm", "at for pm" -> "at 4 pm", "at ate am" -> "at 8 am")
 * - "12nn" -> "12 noon", "12mn" -> "12 midnight", "o'clock" -> "oclock"
 */
export function normalizeSpeech(transcript: string): string {
  let result = transcript
    // Normalize dotted a.m. / p.m. even when directly attached to digits (e.g. "730a.m.", "9:00p.m.")
    .replace(/(?:(?<=\d)|\b)p\s*\.\s*m\.?(?=\s|$|[.,!?;:])/gi, ' pm')
    .replace(/(?:(?<=\d)|\b)a\s*\.\s*m\.?(?=\s|$|[.,!?;:])/gi, ' am')
    // Normalize spaced "a m" / "p m" after digits or time words (e.g. "7:30 a m", "730 p m", "nine a m")
    .replace(
      new RegExp(`(\\b(?:\\d{1,4}(?::\\d{2})?|${HOUR_TOKEN_PATTERN}|${SPOKEN_MINUTE_PATTERN}))\\s+a\\s+m\\b`, 'gi'),
      '$1 am',
    )
    .replace(
      new RegExp(`(\\b(?:\\d{1,4}(?::\\d{2})?|${HOUR_TOKEN_PATTERN}|${SPOKEN_MINUTE_PATTERN}))\\s+p\\s+m\\b`, 'gi'),
      '$1 pm',
    )
    // Normalize "in the am" / "in the pm"
    .replace(/\bin\s+the\s+a\.?m\.?\b/gi, 'am')
    .replace(/\bin\s+the\s+p\.?m\.?\b/gi, 'pm')
    // Normalize 12nn / 12mn (attached or spaced)
    .replace(/(?:(?<=\d)|\b)12\s*n\.?n\.?\b/gi, '12 noon')
    .replace(/(?:(?<=\d)|\b)12\s*m\.?n\.?\b/gi, '12 midnight')
    .replace(/\bo['’\s]?clock\b/gi, 'oclock')
    .replace(/\b(uh|um|er|ah|like|please)\b/gi, '');

  // Fix Whisper homophones directly before am/pm/oclock ("to pm" -> "2 pm", "too pm" -> "2 pm", "for pm" -> "4 pm", "ate am" -> "8 am", "won pm" -> "1 pm")
  result = result
    .replace(/\b(?:to|too)\s+(?=(?:am|pm|oclock)\b)/gi, '2 ')
    .replace(/\b(?:for|fore)\s+(?=(?:am|pm|oclock)\b)/gi, '4 ')
    .replace(/\bate\s+(?=(?:am|pm|oclock)\b)/gi, '8 ')
    .replace(/\bwon\s+(?=(?:am|pm|oclock)\b)/gi, '1 ');

  // Convert dot-separated times ("7.30 am", "7.30pm", "at 7.30", "from 7.30 to 9.30") into colon times
  result = result.replace(
    /\b(\d{1,2})\.([0-5]\d)\s*(?=(?:am|pm|noon|midday|midnight|oclock)\b)/gi,
    '$1:$2 ',
  );
  result = result.replace(
    /\b(at|from|by|around|to|until|till|between)\s+(\d{1,2})\.([0-5]\d)\b/gi,
    '$1 $2:$3',
  );

  // Convert "7 oh 5" / "7 o 5" / "seven oh five" into "<hour>:0<min>"
  result = result.replace(
    new RegExp(
      `\\b(${HOUR_TOKEN_PATTERN})\\s+(?:oh|o)\\s+(\\d|one|two|three|four|five|six|seven|eight|nine)\\b`,
      'gi',
    ),
    (full, hTok: string, mTok: string) => {
      const h = parseNumberWordOrDigits(hTok);
      const m = parseNumberWordOrDigits(mTok);
      if (h !== null && h >= 1 && h <= 12 && m !== null && m >= 1 && m <= 9) {
        return `${h}:0${m}`;
      }
      return full;
    },
  );

  // Convert compact 3- or 4-digit times with explicit meridiem/anchor/hours ("730AM", "730 am", "1030pm", "1230 noon", "0800 hours")
  result = result.replace(
    /\b(\d{3,4})\s*(am|pm|noon|midday|mid-day|midnight|oclock|hours?|hrs?|in\s+the\s+(?:morning|afternoon|evening)|at\s+night|tonight)\b/gi,
    (full, digits: string, suffix: string) => {
      const split = splitCompactDigitsToTime(digits, false);
      if (!split) return full;
      const lowerSuffix = suffix.toLowerCase();
      if (lowerSuffix.startsWith('hour') || lowerSuffix.startsWith('hr')) {
        return `${String(split.hour).padStart(2, '0')}:${split.minuteStr}`;
      }
      if (split.hour > 12 && (lowerSuffix === 'am' || lowerSuffix === 'pm')) {
        return full;
      }
      return `${split.hourStr}:${split.minuteStr} ${suffix}`;
    },
  );

  // Convert compact 3- or 4-digit times in ranges ("from 730 to 930", "730 to 9am", "9am to 1030", "730-930")
  result = result.replace(
    /\b(\d{3,4}|\d{1,2}(?::\d{2})?\s*(?:am|pm|noon|midnight)?)\s*(to|until|till|'til|through|thru|[-–—])\s*(\d{3,4}|\d{1,2}(?::\d{2})?\s*(?:am|pm|noon|midnight)?)\b/gi,
    (full, leftTok: string, conn: string, rightTok: string) => {
      const leftDigits = /^\d{3,4}$/.test(leftTok.trim()) ? splitCompactDigitsToTime(leftTok.trim(), true) : null;
      const rightDigits = /^\d{3,4}$/.test(rightTok.trim()) ? splitCompactDigitsToTime(rightTok.trim(), true) : null;
      if (!leftDigits && !rightDigits) return full;
      const newLeft = leftDigits ? `${leftDigits.hourStr}:${leftDigits.minuteStr}` : leftTok;
      const newRight = rightDigits ? `${rightDigits.hourStr}:${rightDigits.minuteStr}` : rightTok;
      return `${newLeft} ${conn} ${newRight}`;
    },
  );

  // Convert compact 3- or 4-digit times after time prepositions ("at 730", "by 1030", "around 930", "from 0830")
  result = result.replace(
    /\b(at|by|around|from|starting(?:\s+at)?)\s+(\d{3,4})\b(?!\s*(?:am|pm|noon|midnight|rooms?|chapters?|pages?|points?|items?|words?|days?|mins?|minutes?|hours?|hrs?))/gi,
    (full, prep: string, digits: string) => {
      const split = splitCompactDigitsToTime(digits, true);
      if (!split) return full;
      return `${prep} ${split.hourStr}:${split.minuteStr}`;
    },
  );

  // Convert space-separated hour + 2-digit minutes after "at/from/by/around" ("at 7 30", "from 9 15")
  result = result.replace(
    /\b(at|by|around|from|starting(?:\s+at)?)\s+(\d{1,2})\s+([0-5]\d)\b/gi,
    (full, prep: string, hStr: string, mStr: string) => {
      const h = parseInt(hStr, 10);
      if (h >= 0 && h <= 23) {
        return `${prep} ${h}:${mStr}`;
      }
      return full;
    },
  );

  // Convert "half past <hour>", "quarter past <hour>", "quarter to <hour>", "<M> past <hour>", "<M> to <hour>"
  result = result.replace(
    new RegExp(`\\bhalf\\s+past\\s+(noon|midday|midnight|${HOUR_TOKEN_PATTERN})\\b`, 'gi'),
    (_, hToken: string) => {
      const lowerH = hToken.toLowerCase();
      if (lowerH === 'noon' || lowerH === 'midday') return '12:30 noon';
      if (lowerH === 'midnight') return '12:30 midnight';
      const parsed = parseNumberWordOrDigits(lowerH);
      return parsed !== null ? `${parsed}:30` : `${hToken}:30`;
    },
  );
  result = result.replace(
    new RegExp(`\\bquarter\\s+past\\s+(noon|midday|midnight|${HOUR_TOKEN_PATTERN})\\b`, 'gi'),
    (_, hToken: string) => {
      const lowerH = hToken.toLowerCase();
      if (lowerH === 'noon' || lowerH === 'midday') return '12:15 noon';
      if (lowerH === 'midnight') return '12:15 midnight';
      const parsed = parseNumberWordOrDigits(lowerH);
      return parsed !== null ? `${parsed}:15` : `${hToken}:15`;
    },
  );
  result = result.replace(
    new RegExp(`\\bquarter\\s+(?:to|till)\\s+(noon|midday|midnight|${HOUR_TOKEN_PATTERN})\\b`, 'gi'),
    (_, hToken: string) => {
      const lowerH = hToken.toLowerCase();
      if (lowerH === 'noon' || lowerH === 'midday') return '11:45 am';
      if (lowerH === 'midnight') return '11:45 pm';
      const parsed = parseNumberWordOrDigits(lowerH);
      if (parsed !== null && parsed >= 1 && parsed <= 12) {
        const prevHour = parsed === 1 ? 12 : parsed - 1;
        return `${prevHour}:45`;
      }
      return `${hToken}`;
    },
  );
  result = result.replace(
    new RegExp(`\\b(ten|fifteen|twenty|twenty[\\s-]five|5|10|15|20|25)\\s+(?:minutes?\\s+)?past\\s+(${HOUR_TOKEN_PATTERN})\\b`, 'gi'),
    (full, minTok: string, hTok: string) => {
      const m = parseNumberWordOrDigits(minTok);
      const h = parseNumberWordOrDigits(hTok);
      if (m !== null && h !== null && h >= 1 && h <= 12) {
        return `${h}:${String(m).padStart(2, '0')}`;
      }
      return full;
    },
  );
  result = result.replace(
    new RegExp(`\\b(ten|fifteen|twenty|twenty[\\s-]five|5|10|15|20|25)\\s+(?:minutes?\\s+)?(?:to|till)\\s+(${HOUR_TOKEN_PATTERN})\\b`, 'gi'),
    (full, minTok: string, hTok: string) => {
      const m = parseNumberWordOrDigits(minTok);
      const h = parseNumberWordOrDigits(hTok);
      if (m !== null && h !== null && h >= 1 && h <= 12) {
        const prevHour = h === 1 ? 12 : h - 1;
        const remMin = 60 - m;
        return `${prevHour}:${String(remMin).padStart(2, '0')}`;
      }
      return full;
    },
  );

  return result.replace(/\s+/g, ' ').trim();
}

/** Detects academic vs personal category from keywords. */
export function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  const academicKeywords = [
    'exam', 'quiz', 'midterm', 'final', 'lecture', 'assignment', 'homework',
    'thesis', 'capstone', 'lab', 'class', 'study', 'professor', 'course', 'project',
    'defense', 'subject', 'school', 'university', 'ustp', 'syllabus', 'calculus',
    'physics', 'algorithms', 'programming', 'research', 'report', 'seminar',
  ];
  for (const kw of academicKeywords) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) {
      return 'Academic';
    }
  }
  return 'Personal';
}

type EndpointMeridiem = 'am' | 'pm' | 'noon' | 'midnight' | 'night' | null;

interface ParsedTimeEndpoint {
  rawText: string;
  rawHour: number;
  minute: number;
  meridiem: EndpointMeridiem;
  is24Hour: boolean;
  hasExplicitMarker: boolean;
}

function classifyMeridiemToken(raw: string | undefined): EndpointMeridiem {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (cleaned.includes('noon') || cleaned.includes('midday') || cleaned.includes('mid-day')) {
    return 'noon';
  }
  if (cleaned.includes('midnight')) {
    return 'midnight';
  }
  if (cleaned === 'am' || cleaned === 'in the morning') {
    return 'am';
  }
  if (cleaned === 'pm' || cleaned === 'in the afternoon' || cleaned === 'in the evening') {
    return 'pm';
  }
  if (cleaned === 'at night' || cleaned === 'tonight') {
    return 'night';
  }
  return null;
}

function parseTimeEndpoint(rawEndpoint: string, allowBareSpokenMinutes: boolean = false): ParsedTimeEndpoint | null {
  const trimmed = rawEndpoint.trim().toLowerCase();
  if (!trimmed) return null;

  // Pure named anchor: "noon", "midday", "midnight", "noon 12", "midnight 12"
  if (/^(?:noon|midday|mid-day)(?:\s+(?:12|twelve)(?::00)?)?$/.test(trimmed)) {
    return {
      rawText: rawEndpoint.trim(),
      rawHour: 12,
      minute: 0,
      meridiem: 'noon',
      is24Hour: false,
      hasExplicitMarker: true,
    };
  }
  if (/^midnight(?:\s+(?:12|twelve)(?::00)?)?$/.test(trimmed)) {
    return {
      rawText: rawEndpoint.trim(),
      rawHour: 12,
      minute: 0,
      meridiem: 'midnight',
      is24Hour: false,
      hasExplicitMarker: true,
    };
  }

  const epRegex = new RegExp(
    `^(${HOUR_TOKEN_PATTERN})(?:(?::(\\d{2}))|(?:\\s+(${SPOKEN_MINUTE_PATTERN})))?(\\s+oclock)?(?:\\s*(${MERIDIEM_OR_ANCHOR_PATTERN}))?$`,
    'i',
  );
  const m = epRegex.exec(trimmed);
  if (!m) return null;

  const hourToken = m[1];
  const colonMinToken = m[2];
  const spokenMinToken = m[3];
  const oclockToken = m[4];
  const meridiemToken = m[5];

  const parsedHour = parseNumberWordOrDigits(hourToken);
  if (parsedHour === null || parsedHour < 0 || parsedHour > 24) return null;

  let minute = 0;
  if (colonMinToken !== undefined) {
    minute = parseInt(colonMinToken, 10);
  } else if (spokenMinToken !== undefined) {
    if (!meridiemToken && !oclockToken && !allowBareSpokenMinutes) return null;
    const parsedMin = parseNumberWordOrDigits(spokenMinToken);
    if (parsedMin === null || parsedMin < 0 || parsedMin > 59) return null;
    minute = parsedMin;
  }
  if (minute < 0 || minute > 59) return null;

  const meridiem = classifyMeridiemToken(meridiemToken);
  const hasLeadingZero = /^0\d$/.test(hourToken);
  const is24Hour =
    meridiem === null &&
    (parsedHour >= 13 || parsedHour === 0 || (hasLeadingZero && colonMinToken !== undefined));

  // If > 12 and user also said am/pm/noon/midnight, reject invalid combinations like "15 pm"
  if (parsedHour > 12 && meridiem !== null) return null;

  const hasExplicitMarker =
    meridiem !== null ||
    Boolean(oclockToken) ||
    colonMinToken !== undefined ||
    spokenMinToken !== undefined ||
    is24Hour;

  return {
    rawText: rawEndpoint.trim(),
    rawHour: parsedHour,
    minute,
    meridiem,
    is24Hour,
    hasExplicitMarker,
  };
}

function resolveExplicitHour24(ep: ParsedTimeEndpoint): number | null {
  if (ep.is24Hour) {
    return ep.rawHour % 24;
  }
  if (ep.meridiem === 'noon') {
    return 12;
  }
  if (ep.meridiem === 'midnight') {
    return 0;
  }
  if (ep.meridiem === 'am') {
    return ep.rawHour === 12 ? 0 : ep.rawHour;
  }
  if (ep.meridiem === 'pm') {
    return ep.rawHour < 12 ? ep.rawHour + 12 : ep.rawHour;
  }
  if (ep.meridiem === 'night') {
    if (ep.rawHour === 12) return 0;
    if (ep.rawHour >= 5 && ep.rawHour <= 11) return ep.rawHour + 12;
    return ep.rawHour;
  }
  return null;
}

function resolveImplicitHour24(
  rawHour: number,
  contextPeriod: 'morning' | 'afternoon' | 'evening' | 'night' | null,
  hasLeadingZero: boolean = false,
): number {
  if (rawHour === 0 || rawHour >= 13) return rawHour % 24;
  if (rawHour === 12) {
    return contextPeriod === 'night' ? 0 : 12;
  }
  if (hasLeadingZero) {
    return rawHour;
  }
  if (contextPeriod === 'morning') {
    return rawHour;
  }
  if (contextPeriod === 'afternoon' || contextPeriod === 'evening') {
    return rawHour + 12;
  }
  if (contextPeriod === 'night') {
    return rawHour >= 5 ? rawHour + 12 : rawHour;
  }
  // Standard academic daytime assumption: 7..11 -> AM (07:00..11:00), 1..6 -> PM (13:00..18:00)
  if (rawHour >= 7 && rawHour <= 11) {
    return rawHour;
  }
  return rawHour + 12;
}

function detectContextPeriod(lowerText: string): 'morning' | 'afternoon' | 'evening' | 'night' | null {
  if (/\b(?:in\s+the\s+morning|this\s+morning|to-?morrow\s+morning|morrow\s+morning|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+morning|before\s+class|before\s+school)\b/i.test(lowerText)) {
    return 'morning';
  }
  if (/\b(?:in\s+the\s+afternoon|this\s+afternoon|to-?morrow\s+afternoon|morrow\s+afternoon|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+afternoon|after\s+lunch)\b/i.test(lowerText)) {
    return 'afternoon';
  }
  if (/\b(?:in\s+the\s+evening|this\s+evening|to-?morrow\s+evening|morrow\s+evening|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+evening|after\s+class|after\s+school|after\s+work)\b/i.test(lowerText)) {
    return 'evening';
  }
  if (/\b(?:at\s+night|tonight|to-?morrow\s+night|morrow\s+night|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+night|late\s+night)\b/i.test(lowerText)) {
    return 'night';
  }
  return null;
}

function resolveTimeRangeEndpoints(
  startEp: ParsedTimeEndpoint,
  endEp: ParsedTimeEndpoint,
  contextPeriod: 'morning' | 'afternoon' | 'evening' | 'night' | null,
): { startHour: number; startMin: number; endHour: number; endMin: number; durationMinutes: number } {
  let startH = resolveExplicitHour24(startEp);
  let endH = resolveExplicitHour24(endEp);

  if (startH !== null && endH === null) {
    const eh = endEp.rawHour;
    if (startH < 12) {
      if (eh === 12) {
        endH = 12;
      } else if (startH === 0) {
        endH = eh;
      } else if (eh > startH || (eh === startH && endEp.minute > startEp.minute)) {
        endH = eh;
      } else {
        endH = eh + 12;
      }
    } else {
      if (eh === 12) {
        endH = 0;
      } else if (startH === 12) {
        endH = eh + 12;
      } else if (eh + 12 > startH || (eh + 12 === startH && endEp.minute > startEp.minute)) {
        endH = eh + 12;
      } else {
        endH = eh;
      }
    }
  } else if (startH === null && endH !== null) {
    const sh = startEp.rawHour;
    if (endEp.meridiem === 'noon' || endH === 12) {
      if (sh === 12) {
        startH = endEp.minute > startEp.minute ? 12 : 0;
      } else {
        startH = sh;
      }
    } else if (endEp.meridiem === 'midnight' || endH === 0) {
      if (sh === 12) {
        startH = endEp.minute > startEp.minute ? 0 : 12;
      } else {
        startH = sh + 12;
      }
    } else if (endH < 12) {
      if (sh === 12) {
        startH = 0;
      } else if (sh < endH || (sh === endH && startEp.minute < endEp.minute)) {
        startH = sh;
      } else {
        startH = sh + 12;
      }
    } else {
      const end12 = endH - 12;
      if (sh === 12) {
        startH = 12;
      } else if (sh < end12 || (sh === end12 && startEp.minute < endEp.minute)) {
        startH = sh + 12;
      } else {
        startH = sh;
      }
    }
  } else if (startH === null && endH === null) {
    const sh = startEp.rawHour;
    const eh = endEp.rawHour;
    if (contextPeriod === 'evening' || contextPeriod === 'night') {
      startH = sh === 12 ? 0 : sh < 12 ? sh + 12 : sh;
      if (eh === 12) {
        endH = 0;
      } else if (eh + 12 > startH) {
        endH = eh + 12;
      } else {
        endH = eh;
      }
    } else if (contextPeriod === 'afternoon') {
      startH = sh === 12 ? 12 : sh < 12 ? sh + 12 : sh;
      endH = eh === 12 ? 0 : eh < 12 ? eh + 12 : eh;
    } else if (contextPeriod === 'morning') {
      startH = sh === 12 ? 0 : sh;
      endH = eh === 12 ? 12 : eh >= startH ? eh : eh + 12;
    } else {
      if (sh === 12) {
        startH = 12;
        endH = eh === 12 ? 0 : eh < 12 ? eh + 12 : eh;
      } else if (sh >= 7 && sh <= 11) {
        startH = sh;
        if (eh === 12) {
          endH = 12;
        } else if (eh > sh && eh <= 11) {
          endH = eh;
        } else {
          endH = eh < 12 ? eh + 12 : eh;
        }
      } else {
        startH = sh < 12 ? sh + 12 : sh;
        if (eh === 12) {
          endH = 0;
        } else if (eh > sh && eh < 12) {
          endH = eh + 12;
        } else {
          endH = eh % 24;
        }
      }
    }
  }

  const finalStartH = (startH ?? 9) % 24;
  const finalEndH = (endH ?? 10) % 24;
  const startTotal = finalStartH * 60 + startEp.minute;
  let endTotal = finalEndH * 60 + endEp.minute;
  if (endTotal <= startTotal) {
    endTotal += 24 * 60;
  }
  const durationMinutes = endTotal - startTotal;

  return {
    startHour: finalStartH,
    startMin: startEp.minute,
    endHour: finalEndH,
    endMin: endEp.minute,
    durationMinutes,
  };
}

interface ParsedDateTime {
  date: string | null;
  time: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  matchedText: string[];
}

/** Parses dates and times deterministically using local calendar arithmetic. */
export function parseDateAndTime(text: string, referenceDate: Date = new Date()): ParsedDateTime {
  const matchedText: string[] = [];
  let date: string | null = null;
  let time: string | null = null;
  let endTime: string | null = null;
  let durationMinutes: number | null = null;

  const normalized = normalizeSpeech(text);
  const lower = normalized.toLowerCase();
  const contextPeriod = detectContextPeriod(lower);

  // Relative date: today, tomorrow (including colloquial "morrow" / "tmrw"), day after tomorrow, tonight
  if (/\bday after tomorrow\b/i.test(lower)) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 2);
    date = formatLocalDate(d);
    matchedText.push('day after tomorrow');
  } else {
    const morrowMatch = /\b(?:to-?morrow|morrow|tmrw)\b/i.exec(lower);
    if (morrowMatch) {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() + 1);
      date = formatLocalDate(d);
      matchedText.push(morrowMatch[0]);
    } else if (/\btoday\b/i.test(lower)) {
      date = formatLocalDate(referenceDate);
      matchedText.push('today');
    } else if (/\btonight\b/i.test(lower)) {
      date = formatLocalDate(referenceDate);
      matchedText.push('tonight');
    }
  }

  // Weekdays: e.g. "next Monday", "this Friday", "on Wednesday"
  const weekdayMatch = /\b(?:on\s+|this\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(lower);
  if (weekdayMatch && !date) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDayIndex = days.indexOf(weekdayMatch[1].toLowerCase());
    if (targetDayIndex !== -1) {
      const currentDayIndex = referenceDate.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0 || /\bnext\s+/i.test(weekdayMatch[0])) {
        diff += 7;
      }
      const d = new Date(referenceDate);
      d.setDate(d.getDate() + diff);
      date = formatLocalDate(d);
      matchedText.push(weekdayMatch[0]);
    }
  }

  // Relative days: "in 2 days", "in two days", "3 days from now"
  if (!date) {
    const relDayRegex = new RegExp(
      `\\b(?:(?:in|after)\\s+(${NUM_WORDS_PATTERN})\\s+days?(?:\\s+(?:from\\s+now|later))?|(${NUM_WORDS_PATTERN})\\s+days?\\s+(?:from\\s+now|later))\\b`,
      'i',
    );
    const relativeDayMatch = relDayRegex.exec(lower);
    if (relativeDayMatch) {
      const dayToken = relativeDayMatch[1] || relativeDayMatch[2];
      const days = parseNumberWordOrDigits(dayToken);
      if (days !== null && days > 0) {
        const d = new Date(referenceDate);
        d.setDate(d.getDate() + days);
        date = formatLocalDate(d);
        matchedText.push(relativeDayMatch[0]);
      }
    }
  }

  // Relative time expressions:
  // "in half an hour", "half an hour from now", "half an hour later", "half hour from now"
  const halfHourMatch = /\b(?:in\s+(?:about\s+)?half\s+(?:an?\s+)?hour(?:\s+(?:from\s+now|later))?|(?:about\s+)?half\s+(?:an?\s+)?hour\s+(?:from\s+now|later))\b/i.exec(lower);
  if (halfHourMatch && !time) {
    const target = new Date(referenceDate.getTime() + 30 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(halfHourMatch[0]);
  }

  // "in an hour", "an hour from now", "an hour later"
  const anHourMatch = /\b(?:in\s+(?:about\s+)?an\s+hour(?:\s+(?:from\s+now|later))?|(?:about\s+)?an\s+hour\s+(?:from\s+now|later))\b/i.exec(lower);
  if (anHourMatch && !time) {
    const target = new Date(referenceDate.getTime() + 60 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(anHourMatch[0]);
  }

  // "a couple minutes from now", "in a couple minutes", "a couple of minutes"
  const coupleMatch = /\b(?:in\s+(?:about\s+)?(?:a\s+)?couple(?:\s+of)?\s*(?:minutes?|mins?)(?:\s+(?:from\s+now|later))?|(?:about\s+)?(?:a\s+)?couple(?:\s+of)?\s*(?:minutes?|mins?)\s+(?:from\s+now|later))\b/i.exec(lower);
  if (coupleMatch && !time) {
    const target = new Date(referenceDate.getTime() + 2 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(coupleMatch[0]);
  }

  // "a few minutes from now", "in a few minutes", "few minutes later"
  const fewMatch = /\b(?:in\s+(?:about\s+)?(?:a\s+)?few\s*(?:minutes?|mins?)(?:\s+(?:from\s+now|later))?|(?:about\s+)?(?:a\s+)?few\s*(?:minutes?|mins?)\s+(?:from\s+now|later))\b/i.exec(lower);
  if (fewMatch && !time) {
    const target = new Date(referenceDate.getTime() + 5 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(fewMatch[0]);
  }

  // General relative offset:
  // "in 5 minutes", "in five minutes", "after 10 minutes", "five minutes from now", "10 minutes later", etc.
  if (!time) {
    const relRegex = new RegExp(
      `\\b(?:(?:in|after)\\s+(?:about\\s+)?(${NUM_WORDS_PATTERN})\\s*(minutes?|mins?|hours?|hrs?)(?:\\s+(?:from\\s+now|later))?|(${NUM_WORDS_PATTERN})\\s*(minutes?|mins?|hours?|hrs?)\\s+(?:from\\s+now|later))\\b`,
      'i',
    );
    const relMatch = relRegex.exec(lower);
    if (relMatch) {
      const numToken = relMatch[1] || relMatch[3];
      const unitToken = relMatch[2] || relMatch[4];
      const amount = parseNumberWordOrDigits(numToken);
      if (amount !== null && amount > 0) {
        const unit = unitToken.toLowerCase();
        const isHour = unit.startsWith('hour') || unit.startsWith('hr');
        const offsetMs = amount * (isHour ? 3600000 : 60000);
        const target = new Date(referenceDate.getTime() + offsetMs);
        date = formatLocalDate(target);
        time = formatLocalTime(target.getHours(), target.getMinutes());
        matchedText.push(relMatch[0]);
      }
    }
  }

  // Time range:
  // Supports "9am to 12 Noon", "at 9am to 12 Noon", "from 9 to 12", "12 Noon to 2pm",
  // "730am to 930am", "from 730 to 930", "9pm to 12 Midnight", "noon to 3pm", "between 9am and 12 noon", etc.
  if (!time) {
    const rangeRegex = new RegExp(
      `\\b(from\\s+|at\\s+|between\\s+|for\\s+)?(${TIME_ENDPOINT_PATTERN})\\s*(?:to|until|till|'til|through|thru|and|[-–—])\\s*(${TIME_ENDPOINT_PATTERN})\\b`,
      'gi',
    );
    let rangeCandidate: RegExpExecArray | null;
    while ((rangeCandidate = rangeRegex.exec(lower)) !== null) {
      const fullMatch = rangeCandidate[0];
      const prefix = (rangeCandidate[1] || '').trim().toLowerCase();
      const rawStart = rangeCandidate[2];
      const rawEnd = rangeCandidate[7];

      const middlePart = fullMatch
        .slice((rangeCandidate[1] || '').length + rawStart.length, fullMatch.length - rawEnd.length)
        .trim()
        .toLowerCase();
      if (middlePart === 'and' && prefix !== 'between') {
        continue;
      }

      // Avoid false-matching non-time ranges like "chapters 1 through 4" or "pages 9 to 12"
      const precedingSlice = lower.slice(0, rangeCandidate.index).trim();
      if (/\b(?:chapters?|pages?|sections?|parts?|items?|questions?|problems?|steps?|units?|modules?|verses?|exercises?)$/i.test(precedingSlice)) {
        continue;
      }

      const startEp = parseTimeEndpoint(rawStart, Boolean(prefix));
      const endEp = parseTimeEndpoint(rawEnd, Boolean(prefix));
      if (!startEp || !endEp) continue;

      if (
        (middlePart === 'through' || middlePart === 'thru') &&
        !startEp.hasExplicitMarker &&
        !endEp.hasExplicitMarker
      ) {
        continue;
      }

      if (!startEp.hasExplicitMarker && !endEp.hasExplicitMarker && !prefix) {
        continue;
      }

      const resolved = resolveTimeRangeEndpoints(startEp, endEp, contextPeriod);
      time = formatLocalTime(resolved.startHour, resolved.startMin);
      endTime = formatLocalTime(resolved.endHour, resolved.endMin);
      durationMinutes = resolved.durationMinutes;
      matchedText.push(fullMatch);
      break;
    }
  }

  // Single time expressions:
  // 1. Named anchors or hour + explicit meridiem/anchor/qualifier (including "730am", "7:30 am", "seven thirty am")
  if (!time) {
    const explicitSingleRegex = new RegExp(
      `\\b(?:(?:at|by|around|starting(?:\\s+at)?|from|for)\\s+)?((?:noon|midday|mid-day|midnight)(?:\\s+(?:12|twelve)(?::00)?)?|(${HOUR_TOKEN_PATTERN})(?:(?::(\\d{2}))|(?:\\s+(${SPOKEN_MINUTE_PATTERN})))?(?:\\s+oclock)?\\s*(${MERIDIEM_OR_ANCHOR_PATTERN}))\\b`,
      'i',
    );
    const explicitSingleMatch = explicitSingleRegex.exec(lower);
    if (explicitSingleMatch) {
      const ep = parseTimeEndpoint(explicitSingleMatch[1], true);
      if (ep) {
        const resolvedH = resolveExplicitHour24(ep);
        if (resolvedH !== null) {
          time = formatLocalTime(resolvedH, ep.minute);
          matchedText.push(explicitSingleMatch[0]);
        }
      }
    }
  }

  // 2. 24-hour / colon time, spoken hour+minute with preposition ("at seven thirty", "at 7:30"), or "o'clock" time
  if (!time) {
    const colonOrOclockRegex = new RegExp(
      `\\b(?:(at|by|around|starting(?:\\s+at)?|from|for)\\s+)?(${HOUR_TOKEN_PATTERN})(?::([0-5]\\d)|\\s+(${SPOKEN_MINUTE_PATTERN})|\\s+oclock)\\b`,
      'i',
    );
    const colonOrOclockMatch = colonOrOclockRegex.exec(lower);
    if (colonOrOclockMatch) {
      const prep = colonOrOclockMatch[1];
      const hourTok = colonOrOclockMatch[2];
      const colonMinTok = colonOrOclockMatch[3];
      const spokenMinTok = colonOrOclockMatch[4];
      const hasOclock = colonOrOclockMatch[0].toLowerCase().includes('oclock');

      // Spoken minutes without am/pm require either a time preposition ("at seven thirty") or "oclock"
      if (spokenMinTok === undefined || prep || hasOclock) {
        const rawH = parseNumberWordOrDigits(hourTok);
        const min =
          colonMinTok !== undefined
            ? parseInt(colonMinTok, 10)
            : spokenMinTok !== undefined
              ? (parseNumberWordOrDigits(spokenMinTok) ?? 0)
              : 0;
        if (rawH !== null && rawH >= 0 && rawH <= 23 && min >= 0 && min <= 59) {
          const resolvedH = resolveImplicitHour24(rawH, contextPeriod, /^0\d$/.test(hourTok));
          time = formatLocalTime(resolvedH, min);
          matchedText.push(colonOrOclockMatch[0]);
        }
      }
    }
  }

  // 3. Bare hour with explicit "at" or "by" preposition (e.g. "at 12", "at twelve", "at 8 tomorrow morning", "at 12 tonight")
  if (!time) {
    const bareAtHourRegex = new RegExp(
      `\\b(?:at|by|around)\\s+(${HOUR_TOKEN_PATTERN})\\b(?!\\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|%|percent|items?|tasks?|points?|chapters?|pages?|rooms?))`,
      'i',
    );
    const bareAtMatch = bareAtHourRegex.exec(lower);
    if (bareAtMatch) {
      const rawH = parseNumberWordOrDigits(bareAtMatch[1]);
      if (rawH !== null && rawH >= 1 && rawH <= 24) {
        const resolvedH = resolveImplicitHour24(rawH % 24, contextPeriod, /^0\d$/.test(bareAtMatch[1]));
        time = formatLocalTime(resolvedH, 0);
        matchedText.push(bareAtMatch[0]);
      }
    }
  }

  // 4. Period-of-day fallback when a time-of-day phrase ("this morning", "this afternoon", "this evening", "tonight")
  // is explicitly spoken without a clock hour, preventing timed tasks from falling into All-Day!
  if (!time && contextPeriod) {
    const explicitPeriodMatch =
      /\b(?:in\s+the\s+(?:morning|afternoon|evening)|this\s+(?:morning|afternoon|evening)|to-?morrow\s+(?:morning|afternoon|evening|night)|morrow\s+(?:morning|afternoon|evening|night)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:morning|afternoon|evening|night)|tonight|at\s+night)\b/i.exec(
        lower,
      );
    if (explicitPeriodMatch) {
      if (contextPeriod === 'morning') time = '09:00';
      else if (contextPeriod === 'afternoon') time = '14:00';
      else if (contextPeriod === 'evening') time = '18:00';
      else if (contextPeriod === 'night') time = '20:00';
      matchedText.push(explicitPeriodMatch[0]);
    }
  }

  // Explicit duration phrases (e.g. "for 2 hours", "for 90 minutes", "for an hour and a half", "for half an hour")
  if (durationMinutes === null) {
    const hourAndHalfMatch = new RegExp(
      `\\bfor\\s+(?:an?\\s+hour|(${NUM_WORDS_PATTERN})\\s+hours?)\\s+and\\s+a\\s+half\\b`,
      'i',
    ).exec(lower);
    if (hourAndHalfMatch) {
      const baseHours = hourAndHalfMatch[1] ? (parseNumberWordOrDigits(hourAndHalfMatch[1]) ?? 1) : 1;
      durationMinutes = baseHours * 60 + 30;
      matchedText.push(hourAndHalfMatch[0]);
    } else {
      const halfHourDurMatch = /\bfor\s+(?:half\s+an?\s+hour|a\s+half\s+hour)\b/i.exec(lower);
      if (halfHourDurMatch) {
        durationMinutes = 30;
        matchedText.push(halfHourDurMatch[0]);
      } else {
        const durRegex = new RegExp(
          `\\bfor\\s+(${NUM_WORDS_PATTERN}|\\d+\\.5)\\s*(hours?|hrs?|minutes?|mins?)\\b`,
          'i',
        );
        const durMatch = durRegex.exec(lower);
        if (durMatch) {
          const rawAmount = durMatch[1];
          const unit = durMatch[2].toLowerCase();
          const isHour = unit.startsWith('hour') || unit.startsWith('hr');
          const numericAmount = /^\d+\.\d+$/.test(rawAmount)
            ? parseFloat(rawAmount)
            : parseNumberWordOrDigits(rawAmount);
          if (numericAmount !== null && numericAmount > 0) {
            durationMinutes = Math.round(numericAmount * (isHour ? 60 : 1));
            matchedText.push(durMatch[0]);
          }
        }
      }
    }

    if (time && !endTime && durationMinutes !== null && durationMinutes > 0) {
      const [h, m] = time.split(':').map((v) => parseInt(v, 10));
      const totalMin = h * 60 + m + durationMinutes;
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      endTime = formatLocalTime(endH, endM);
    }
  }

  return { date, time, endTime, durationMinutes, matchedText };
}

function classifyCrudEntityType(text: string): {
  entityType: CrudTargetEntityType;
  deleteIntent: 'delete_task' | 'delete_time_block' | 'delete_note';
  updateIntent: 'update_task' | 'update_time_block' | 'update_note';
} {
  if (/\b(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|blocks?|events?)\b/i.test(text)) {
    return {
      entityType: 'time_block',
      deleteIntent: 'delete_time_block',
      updateIntent: 'update_time_block',
    };
  }
  if (/\b(?:notes?)\b/i.test(text)) {
    return {
      entityType: 'note',
      deleteIntent: 'delete_note',
      updateIntent: 'update_note',
    };
  }
  if (/\b(?:tasks?|todos?|to-dos?|reminders?|alarms?)\b/i.test(text)) {
    return {
      entityType: 'task',
      deleteIntent: 'delete_task',
      updateIntent: 'update_task',
    };
  }
  return {
    entityType: 'any',
    deleteIntent: 'delete_task',
    updateIntent: 'update_task',
  };
}

function cleanCrudTargetTitle(rawTarget: string, matchedDateTimeTokens: string[] = []): string {
  let cleaned = rawTarget;
  const sortedMatches = [...matchedDateTimeTokens].sort((a, b) => b.length - a.length);
  for (const m of sortedMatches) {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegExp(m)}\\b`, 'gi'), ' ');
  }
  cleaned = cleaned
    .replace(
      /^(?:(?:hey|hi|okay|ok)\s+(?:lafina\s*)?[,.!]?\s*)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i,
      '',
    )
    .replace(
      /^(?:cancel|remove|delete|clear|erase|drop|scratch|get\s+rid\s+of|update|edit|change|modify|move|reschedule|shift|push\s+back|postpone|rename|complete|finish|check\s+off|tick\s+off|mark)\b\s*/i,
      '',
    )
    .replace(
      /\b(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|blocks?|tasks?|todos?|to-dos?|reminders?|alarms?|notes?|events?)\b/gi,
      ' ',
    )
    .replace(/^(?:[\s,:-]*(?:my|the|a|an|this|that|our|called|titled|named|for|about|of|to|on|at|from)\b)+/gi, '')
    .replace(/(?:[\s,:-]*\b(?:called|titled|named|for|about|of|to|on|at|from|my|the|a|an)\b)+$/gi, '')
    .replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/** Deterministic Fast-Path NLU Intent Extractor. */
export function parseIntentFastPath(
  transcript: string,
  referenceDate: Date = new Date(),
): ExtractedIntent {
  const normalized = normalizeSpeech(transcript);
  const lower = normalized.toLowerCase();

  // Strip polite/conversational invocation prefixes for command matching ("Hey Lafina, can you please...")
  const commandLower = lower
    .replace(/^(?:(?:hey|hi|hello|okay|ok|yo)\s+)?(?:lafina\s*[,.!]?\s*)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i, '')
    .trim();

  // 1. Call Responses / Acknowledge
  const isAck = /^(?:i(?:'m| am)? done|i did it|finished|got it|okay|ok|understood|acknowledged|thanks?)(?:[,.!\s]+(?:thanks?|bye))?[\s.!,]*$/i.test(lower);
  if (isAck) {
    return {
      intent: 'acknowledge',
      title: null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: null,
      snoozeMinutes: null,
      confidence: 0.99,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 2. Call Responses / Snooze
  const snoozeMatch = /^\s*(?:please\s+)?(?:snooze(?:\s+for)?|give me|remind me in)\s*([a-z0-9-]+)?\s*(?:minute|minutes|min|mins)?[\s.!,]*$/i.exec(lower);
  if (snoozeMatch || /^\s*snooze\b/i.test(lower)) {
    const parsedMins = snoozeMatch && snoozeMatch[1] ? parseNumberWordOrDigits(snoozeMatch[1]) : null;
    const mins = parsedMins !== null && parsedMins > 0 ? parsedMins : 10;
    return {
      intent: 'snooze',
      title: null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: null,
      snoozeMinutes: mins,
      confidence: 0.98,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 3. Schedule Audit & Schedule Query
  // Must run BEFORE CRUD/Creation intents unless the utterance starts with an explicit creation/mutation command
  const isExplicitMutationStart =
    /^(?:remind\s+me|set\s+(?:a\s+|an\s+)?reminder|add\s+|create\s+|make\s+|take\s+(?:a\s+)?note|save\s+(?:a\s+)?note|note\s+down|write\s+down|jot\s+down|cancel\s+|remove\s+|delete\s+|update\s+|edit\s+|rename\s+|reschedule\s+|move\s+|postpone\s+|push\s+back\s+|complete\s+|finish\s+|mark\s+)/i.test(
      commandLower,
    );

  const isScheduleQuery =
    /\b(?:what(?:'s|s| is| are) (?:on |in |for )?(?:my |the )?(?:schedule|calendar|agenda|plans?|tasks?|todos?|events?|time\s*blocks?|blocks?|reminders?|classes?)|what(?:'s|s| is) (?:happening|upcoming|planned|scheduled|on\s+deck)|what (?:do i have|have i got|i have|am i doing|do i need to do)|what (?:tasks?|todos?|events?|time\s*blocks?|blocks?|reminders?|classes?|plans?|items?) (?:do i have|have i got|i have|are due|are scheduled|are on)|what does my (?:day|schedule|calendar|morning|afternoon|evening|week) look|how(?:'s|s| is| does) my (?:schedule|day|calendar|agenda)(?: look(?:ing)?)?|do i have (?:anything|any (?:tasks?|todos?|events?|time\s*blocks?|blocks?|reminders?|classes?|plans?))|is there anything (?:on |in |for )?(?:my |the )?(?:schedule|calendar|agenda)|is anything (?:scheduled|planned|due)|am i (?:free|busy|available)|(?:audit|check|show|tell(?:\s+me)?|give(?:\s+me)?|read(?:\s+out)?|list|get|view|review|summarize|brief(?:\s+me(?:\s+on)?)?)(?:\s+me)?\s+(?:what(?:'s|s| is| are)\s+(?:on\s+|in\s+)?)?(?:a\s+|my\s+|the\s+|today'?s\s+|tomorrow'?s\s+)?(?:schedule(?:\s+audit)?|calendar|agenda|tasks?|todos?|time\s*blocks?|plans?|events?)|schedule\s+audit|my\s+schedule|today'?s\s+schedule|tomorrow'?s\s+schedule|^schedule\s+(?:for\s+)?(?:today|to-?morrow|morrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|any\s+(?:plans?|tasks?|events?|time\s*blocks?|classes?)\s+(?:for\s+|on\s+)?(?:today|to-?morrow|morrow|tonight))\b/i.test(
      commandLower,
    );

  if (isScheduleQuery && !isExplicitMutationStart) {
    const dt = parseDateAndTime(normalized, referenceDate);
    const targetDate = dt.date || formatLocalDate(referenceDate);
    return {
      intent: 'query_schedule',
      title: null,
      date: targetDate,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: null,
      snoozeMinutes: null,
      confidence: 0.96,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 4. Conversational greetings
  if (/^(hey|hi|hello|good morning|good afternoon|good evening|sup|what'?s up)\b/i.test(lower) && lower.split(' ').length <= 4) {
    return {
      intent: 'chat',
      title: null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Personal',
      details: 'Greeting',
      snoozeMinutes: null,
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 5. CRUD: Delete / Cancel / Remove Time Block, Task, or Note
  const isDeleteCommand =
    /^(?:cancel|remove|delete|clear|erase|drop|scratch|get\s+rid\s+of)\b/i.test(commandLower);
  if (isDeleteCommand) {
    const { entityType, deleteIntent } = classifyCrudEntityType(commandLower);
    const dt = deleteIntent === 'delete_note' ? { date: null, time: null, endTime: null, durationMinutes: null, matchedText: [] } : parseDateAndTime(normalized, referenceDate);
    const targetTitle = cleanCrudTargetTitle(normalized, dt.matchedText);
    const formattedTarget = targetTitle ? targetTitle.charAt(0).toUpperCase() + targetTitle.slice(1) : null;

    return {
      intent: deleteIntent,
      title: formattedTarget,
      targetTitle: formattedTarget,
      targetTime: dt.time,
      targetEntityType: entityType,
      date: dt.date,
      time: dt.time,
      endTime: dt.endTime,
      durationMinutes: dt.durationMinutes,
      category: detectCategory(`${formattedTarget || ''} ${normalized}`),
      details: null,
      snoozeMinutes: null,
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 6. CRUD: Complete / Mark Task as Done
  const markDoneMatch =
    /\bmark\s+(.+?)\s+as\s+(?:done|complete|completed|finished)\b/i.exec(commandLower) ||
    /^(?:complete|finish|check\s+off|tick\s+off)\s+(?:(?:my|the|a|an)\s+)?(?:(?:task|todo|to-do)\s+)(.+)$/i.exec(commandLower) ||
    /^(?:complete|check\s+off|tick\s+off)\s+(?:(?:my|the)\s+)(.+)$/i.exec(commandLower);
  if (markDoneMatch) {
    const rawTarget = markDoneMatch[1];
    const targetTitle = cleanCrudTargetTitle(rawTarget);
    const formattedTarget = targetTitle ? targetTitle.charAt(0).toUpperCase() + targetTitle.slice(1) : null;
    if (formattedTarget) {
      return {
        intent: 'update_task',
        title: formattedTarget,
        targetTitle: formattedTarget,
        targetEntityType: 'task',
        isCompleted: true,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: detectCategory(formattedTarget),
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: transcript,
      };
    }
  }

  // 7. CRUD: Update / Edit / Append / Rename Note
  const isNoteUpdateCommand =
    /^(?:(?:update|edit|change|modify|rename)\s+(?:my\s+|the\s+|a\s+)?note\b|(?:append|add)\s+to\s+(?:my\s+|the\s+|a\s+)?note\b)/i.test(
      commandLower,
    );
  if (isNoteUpdateCommand) {
    const isRename = /^rename\b/i.test(commandLower) || /\bchange\s+(?:the\s+)?(?:title|name)\b/i.test(commandLower);
    const isAppend = /^(?:append|add)\s+to\b/i.test(commandLower);

    if (isRename) {
      const renameMatch = /\bnote\s+(?:(?:called|titled|named|about)\s+)?(.+?)\s+to\s+(.+)$/i.exec(commandLower);
      const rawTarget = renameMatch ? cleanCrudTargetTitle(renameMatch[1]) : cleanCrudTargetTitle(commandLower);
      const rawNew = renameMatch ? renameMatch[2].replace(/^[\s,:-]+|[\s,:-]+$/g, '').trim() : '';
      const targetTitle = rawTarget ? rawTarget.charAt(0).toUpperCase() + rawTarget.slice(1) : 'Voice Note';
      const newTitle = rawNew ? rawNew.charAt(0).toUpperCase() + rawNew.slice(1) : null;
      return {
        intent: 'update_note',
        title: targetTitle,
        targetTitle,
        newTitle,
        targetEntityType: 'note',
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: detectCategory(`${targetTitle} ${newTitle || ''}`),
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: transcript,
      };
    }

    // Update or Append note content: e.g. "Update note Physics Formulas to include E=mc2", "Edit note Shopping List: buy milk", "Add to note Ideas test stt"
    const noteSplitMatch =
      /\bnote\s+(?:(?:called|titled|named|about|for)\s+)?(.+?)(?:\s+(?:to\s+say|to\s+include|to\s+be|with\s+content|saying|that|with|to)\s+|\s*:\s*)(.+)$/i.exec(
        normalized,
      );
    let targetTitle = 'Voice Note';
    let bodyContent = '';
    if (noteSplitMatch) {
      const cleanedT = cleanCrudTargetTitle(noteSplitMatch[1]);
      targetTitle = cleanedT ? cleanedT.charAt(0).toUpperCase() + cleanedT.slice(1) : 'Voice Note';
      bodyContent = noteSplitMatch[2].replace(/^[\s,:-]+|[\s,:-]+$/g, '').trim();
    } else {
      const fallbackCleaned = cleanCrudTargetTitle(normalized);
      bodyContent = fallbackCleaned;
    }
    if (bodyContent) {
      bodyContent = bodyContent.charAt(0).toUpperCase() + bodyContent.slice(1);
    }

    return {
      intent: 'update_note',
      title: targetTitle,
      targetTitle,
      targetEntityType: 'note',
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: isAppend ? 'APPEND' : detectCategory(`${targetTitle} ${bodyContent}`),
      details: bodyContent || null,
      snoozeMinutes: null,
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 8. CRUD: Update / Edit / Move / Reschedule / Rename Time Block or Task (or Call Reschedule)
  const isUpdateOrRescheduleCommand =
    /^(?:update|edit|change|modify|move|reschedule|shift|push\s+back|postpone|rename)\b/i.test(commandLower);
  if (isUpdateOrRescheduleCommand) {
    const { entityType, updateIntent } = classifyCrudEntityType(commandLower);
    const isRenameVerb = /^rename\b/i.test(commandLower) || /\b(?:change|update)\s+(?:the\s+)?(?:title|name)\s+of\b/i.test(commandLower);

    // Check if there is a "to <new specification>" clause
    // Note: if the new specification is a time range ("to 10am to 12 noon"), we split at the FIRST "to" that precedes the new schedule/title
    let leftPart = normalized;
    let rightPart = '';

    const toMatches = [...normalized.matchAll(/\bto\b/gi)];
    if (toMatches.length > 0) {
      // Find the best split point: if there are 2+ "to"s and the last two form a time range ("to 9am to 12 noon"), split at the second-to-last "to"
      let splitIdx = toMatches[toMatches.length - 1].index!;
      if (toMatches.length >= 2) {
        const secondLastIdx = toMatches[toMatches.length - 2].index!;
        const candidateRangeSlice = normalized.slice(secondLastIdx + 2).trim();
        const rangeDt = parseDateAndTime(candidateRangeSlice, referenceDate);
        if (rangeDt.endTime !== null) {
          splitIdx = secondLastIdx;
        }
      }
      leftPart = normalized.slice(0, splitIdx).trim();
      rightPart = normalized.slice(splitIdx + 2).trim();
    }

    if (isRenameVerb && rightPart) {
      const targetTitle = cleanCrudTargetTitle(leftPart);
      const formattedTarget = targetTitle ? targetTitle.charAt(0).toUpperCase() + targetTitle.slice(1) : null;
      const cleanedNew = rightPart
        .replace(/^(?:be\s+|called\s+|titled\s+|named\s+)/i, '')
        .replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '')
        .trim();
      const formattedNew = cleanedNew ? cleanedNew.charAt(0).toUpperCase() + cleanedNew.slice(1) : null;

      return {
        intent: updateIntent,
        title: formattedTarget,
        targetTitle: formattedTarget,
        newTitle: formattedNew,
        targetEntityType: entityType,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: detectCategory(`${formattedTarget || ''} ${formattedNew || ''}`),
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: transcript,
      };
    }

    const rightDt = rightPart ? parseDateAndTime(`at ${rightPart}`, referenceDate) : { date: null, time: null, endTime: null, durationMinutes: null, matchedText: [] };
    const fullDt = parseDateAndTime(normalized, referenceDate);
    const leftDt = rightPart ? parseDateAndTime(leftPart, referenceDate) : { date: null, time: null, endTime: null, durationMinutes: null, matchedText: [] };

    const newDate = rightDt.date || fullDt.date;
    const newTime = rightDt.time || fullDt.time;
    const newEndTime = rightDt.endTime || fullDt.endTime;
    const newDuration = rightDt.durationMinutes || fullDt.durationMinutes;
    const targetTime = rightPart && leftDt.time && leftDt.time !== newTime ? leftDt.time : null;

    const targetTitleRaw = cleanCrudTargetTitle(
      rightPart ? leftPart : normalized,
      rightPart ? leftDt.matchedText : fullDt.matchedText,
    );
    const formattedTarget = targetTitleRaw ? targetTitleRaw.charAt(0).toUpperCase() + targetTitleRaw.slice(1) : null;

    // If rightPart had NO date/time and a targetTitle was given, treat "Update/Change task X to Y" as a rename!
    if (rightPart && !newDate && !newTime && formattedTarget) {
      const cleanedNew = rightPart.replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '').trim();
      const formattedNew = cleanedNew ? cleanedNew.charAt(0).toUpperCase() + cleanedNew.slice(1) : null;
      return {
        intent: updateIntent,
        title: formattedTarget,
        targetTitle: formattedTarget,
        newTitle: formattedNew,
        targetEntityType: entityType,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: detectCategory(`${formattedTarget} ${formattedNew || ''}`),
        details: null,
        snoozeMinutes: null,
        confidence: 0.94,
        source: 'fast_path',
        rawTranscript: transcript,
      };
    }

    // If the user said "Reschedule to tomorrow at 4pm" with NO target title and NO explicit entity type ("task"/"time block"),
    // preserve the 'reschedule' intent for active reminder calls & fallback rescheduling
    if (!formattedTarget && !targetTime && entityType === 'any' && /^(?:reschedule|move|push\s+back|postpone)\b/i.test(commandLower)) {
      return {
        intent: 'reschedule',
        title: null,
        date: newDate,
        time: newTime,
        endTime: newEndTime,
        durationMinutes: newDuration,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 0.94,
        source: 'fast_path',
        rawTranscript: transcript,
      };
    }

    return {
      intent: updateIntent,
      title: formattedTarget,
      targetTitle: formattedTarget,
      targetTime,
      targetEntityType: entityType,
      date: newDate,
      time: newTime,
      endTime: newEndTime,
      durationMinutes: newDuration,
      category: detectCategory(`${formattedTarget || ''} ${normalized}`),
      details: null,
      snoozeMinutes: null,
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 9. Creation Intents (Note, Time Block, Task, Reminder)
  // Check explicit Note creation FIRST so dates/times inside note bodies are never stripped or hijacked as tasks!
  const isExplicitNoteCreate =
    /\b(?:(?:create|add|make|take|save|write|jot)\s+(?:a\s+|an\s+|new\s+|quick\s+)?notes?|note\s+down|write\s+down|jot\s+down)\b/i.test(
      commandLower,
    ) || /^(?:new\s+)?note(?::|\s+that\s+|\s+about\s+|\s+for\s+|\s+titled\s+|\s+called\s+|\s+)/i.test(commandLower);

  if (isExplicitNoteCreate) {
    // Support explicit title + body ("Create a note titled Biology that mitochondria is the powerhouse")
    const titledNoteMatch =
      /\bnotes?\s+(?:called|titled|named)\s+(.+?)(?:\s+(?:that|saying|about|with|:)\s+|\s*:\s*)(.+)$/i.exec(
        normalized,
      );
    if (titledNoteMatch) {
      const rawNoteTitle = titledNoteMatch[1].replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '').trim();
      const rawNoteBody = titledNoteMatch[2].replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '').trim();
      const finalNoteTitle = rawNoteTitle
        ? rawNoteTitle.charAt(0).toUpperCase() + rawNoteTitle.slice(1)
        : 'Voice Note';
      const finalNoteBody = rawNoteBody
        ? rawNoteBody.charAt(0).toUpperCase() + rawNoteBody.slice(1)
        : finalNoteTitle;
      return {
        intent: 'create_note',
        title: finalNoteTitle,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: detectCategory(`${finalNoteTitle} ${finalNoteBody}`),
        details: finalNoteBody,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: transcript,
      };
    }

    const hadColonNotePrefix = /^(?:(?:please\s+)?(?:take|create|add|make|save)\s+(?:a\s+|an\s+|new\s+)?note|note)\s*:/i.test(
      commandLower,
    );
    let noteContent = normalized
      .replace(
        /^(?:(?:hey|hi|hello|okay|ok)\s+(?:lafina\s*)?[,.!]?\s*)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i,
        '',
      )
      .replace(
        /^(?:(?:create|add|make|take|save|write|jot)\s+(?:a\s+|an\s+|new\s+|quick\s+)?notes?|note\s+down|write\s+down|jot\s+down|(?:new\s+)?notes?)\s*(?:(?:\b(?:that|about|for|regarding|on|saying|called|titled|named)\b)\s*)?[:\s,-]*/i,
        '',
      )
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
      .trim();

    let finalNoteTitle = noteContent
      ? noteContent.charAt(0).toUpperCase() + noteContent.slice(1)
      : 'Voice Note';
    let finalNoteDetails = noteContent
      ? noteContent.charAt(0).toUpperCase() + noteContent.slice(1)
      : 'Voice note transcript.';

    if (hadColonNotePrefix || !noteContent) {
      finalNoteTitle = 'Voice Note';
      finalNoteDetails = finalNoteDetails || 'Voice note transcript.';
    }

    return {
      intent: 'create_note',
      title: finalNoteTitle,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: detectCategory(`${finalNoteTitle} ${normalized}`),
      details: finalNoteDetails,
      snoozeMinutes: null,
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  const dt = parseDateAndTime(normalized, referenceDate);

  // Determine schedule creation intent (Time Block, Task, Reminder, or fallback Note)
  let intentType: ParsedIntentType = 'create_task';

  const isExplicitTimeBlock =
    /\b(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|block\s+time|block\s+out|(?:create|add|set|schedule|make|put)\s+(?:a\s+|an\s+|new\s+)?blocks?|events?)\b/i.test(
      commandLower,
    ) || /^blocks?\b/i.test(commandLower);

  const isExplicitTask =
    /\b(?:(?:create|add|set|make|schedule|put)\s+(?:a\s+|an\s+|new\s+)?(?:tasks?|todos?|to-dos?))\b/i.test(
      commandLower,
    ) || /^(?:new\s+)?(?:tasks?|todos?|to-dos?)\b/i.test(commandLower);

  const isExplicitReminder = /\b(?:remind|reminders?)\b/i.test(commandLower);

  if (isExplicitTimeBlock) {
    intentType = 'create_time_block';
  } else if (isExplicitTask && !isExplicitReminder) {
    intentType = 'create_task';
  } else if (isExplicitReminder) {
    intentType = 'create_reminder';
  } else if (/\b(?:tasks?|todos?|to-dos?)\b/i.test(commandLower)) {
    intentType = 'create_task';
  } else if (dt.endTime !== null) {
    intentType = 'create_time_block';
  } else if (dt.date !== null || dt.time !== null) {
    intentType = 'create_task';
  } else {
    if (/^(?:add|set|create|put|schedule|make)\b/i.test(commandLower)) {
      intentType = 'create_task';
    } else {
      intentType = 'create_note';
    }
  }

  // Clean title by stripping command prefixes and matched date/time tokens
  let cleanTitle = normalized;

  // Strip polite/assistant framing at start
  cleanTitle = cleanTitle.replace(
    /^(?:(?:hey|hi|hello|okay|ok)\s+(?:lafina\s*)?[,.!]?\s*)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i,
    '',
  );

  // Strip command verb + optional article/adjective + entity noun
  cleanTitle = cleanTitle.replace(
    /^(?:remind\s+me(?:\s+to\b)?|set\s+(?:a\s+|an\s+|new\s+)?reminder\s*(?:to\b|for\b)?|(?:(?:create|add|set(?:\s+up)?|schedule|make|put)\s+)?(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|block\s+time|block\s+out|blocks?|tasks?|todos?|to-dos?|reminders?|events?|notes?)|add|create|schedule|set(?:\s+up)?)\s*[:\s,-]*(?:(?:a|an|the|new)\s+)*[:\s,-]*/i,
    '',
  );

  cleanTitle = cleanTitle.replace(
    /^(?:(?:new\s+)?(?:tasks?|events?|time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|blocks?|reminders?|notes?))\s*[:\s,-]*(?:(?:called|titled|named|for|to|about|on|at)\b)?\s*[:\s,-]*/i,
    '',
  );

  cleanTitle = cleanTitle.replace(/^(?:called|titled|named)\s+/i, '');

  // Strip matched date/time phrases (longest first to avoid partial replacements)
  const sortedMatches = [...dt.matchedText].sort((a, b) => b.length - a.length);
  for (const match of sortedMatches) {
    cleanTitle = cleanTitle.replace(new RegExp(`\\b${escapeRegExp(match)}\\b`, 'gi'), '');
  }

  // Strip leftover time-of-day qualifiers if time was parsed
  if (dt.time) {
    cleanTitle = cleanTitle.replace(
      /\b(?:in\s+the\s+(?:morning|afternoon|evening)|this\s+(?:morning|afternoon|evening)|to-?morrow\s+(?:morning|afternoon|evening|night)|at\s+night)\b/gi,
      '',
    );
  }

  // Strip lingering leading prepositions and articles (e.g. "for a coffee" -> "coffee", "to submit" -> "submit")
  cleanTitle = cleanTitle.replace(
    /^[\s,:-]*(?:\b(?:on|at|by|for|from|between|starting|with|to|about|regarding|of|called|titled|named)\b[\s,:-]*(?:(?:a|an|the)\b[\s,:-]*)?)+/i,
    '',
  );

  // Strip bare leading article for action items
  if (intentType !== 'create_note') {
    cleanTitle = cleanTitle.replace(/^[\s,:-]*(?:a|an|the)\b[\s,:-]*/i, '');
  }

  // Strip lingering trailing prepositions at edges
  cleanTitle = cleanTitle
    .replace(/(?:[\s,:-]*\b(?:on|at|by|for|from|between|starting|with|to|about|regarding|of)\b)+[\s,:-]*$/i, '')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Evaluate whether the extracted title or raw transcript had conversational noise
  const hasExplicitCommandPrefix =
    /^(?:remind\s+me|set\s+a?\s*reminder|add\s+a?\s*reminder|(?:(?:create|add|set|schedule|make)\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:time\s*block|timeblock|study\s*block|focus\s*block|block\s+time|block\s+out|block|take\s+a?\s*note|save\s+a?\s*note|note\s+down|write\s+down|task|todo|note)|add|create|schedule|set(?:\s+up)?)\b/i.test(
      commandLower,
    );
  const noisy = intentType !== 'create_note' && isTitleNoisy(cleanTitle, normalized);
  if ((noisy || !hasExplicitCommandPrefix) && intentType !== 'create_note' && cleanTitle) {
    cleanTitle = distillScheduleTitle(cleanTitle);
  }

  // If title is empty, provide a clean default
  let finalTitle = cleanTitle;
  let finalDetails: string | null = cleanTitle || normalized;

  if (intentType === 'create_note') {
    if (!cleanTitle) {
      finalTitle = 'Voice Note';
      finalDetails = 'Voice note transcript.';
    }
  } else if (!cleanTitle) {
    if (intentType === 'create_reminder') finalTitle = 'Reminder';
    else if (intentType === 'create_time_block') finalTitle = 'Study Session';
    else finalTitle = 'New Task';
  }

  // Capitalize first letter of title
  finalTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);

  const category = detectCategory(finalTitle + ' ' + normalized);

  let confidence = 0.5;
  if (noisy) {
    confidence = dt.matchedText.length > 0 ? 0.75 : 0.65;
  } else {
    confidence = dt.matchedText.length > 0 ? 0.95 : 0.85;
  }

  return {
    intent: intentType,
    title: finalTitle,
    date: dt.date,
    time: dt.time,
    endTime: dt.endTime,
    durationMinutes: dt.durationMinutes || (intentType === 'create_time_block' ? 60 : null),
    category,
    details: finalDetails,
    snoozeMinutes: null,
    confidence,
    source: 'fast_path',
    rawTranscript: transcript,
  };
}

const MINOR_TITLE_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'with', 'from',
  'into', 'onto', 'upon', 'vs',
]);

const GERUND_TO_INFINITIVE: Record<string, string> = {
  studying: 'study',
  reviewing: 'review',
  submitting: 'submit',
  writing: 'write',
  reading: 'read',
  working: 'work',
  preparing: 'prepare',
  practicing: 'practice',
  coding: 'code',
  debugging: 'debug',
  cleaning: 'clean',
  buying: 'buy',
  calling: 'call',
  meeting: 'meet',
  doing: 'do',
  making: 'make',
  finishing: 'finish',
};

/** Formats a schedule title into clean Title Case while preserving acronyms and minor words. */
export function toTitleCase(title: string): string {
  const trimmed = (title || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const words = trimmed.split(' ');
  return words
    .map((word, index) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }
      const lower = word.toLowerCase();
      if (index > 0 && MINOR_TITLE_WORDS.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Detects whether a candidate title or raw transcript contains conversational noise,
 * colloquial temporal tokens, or rambling phrasing that should trigger on-device SLM distillation.
 */
export function isTitleNoisy(title: string, rawTranscript: string = ''): boolean {
  const trimmed = (title || '').trim();
  if (!trimmed) return true;

  const lowerTitle = trimmed.toLowerCase();
  const lowerRaw = (rawTranscript || '').trim().toLowerCase();

  // 1. Conversational pronouns or modal/obligation verbs
  const modalOrPronounRegex =
    /\b(?:i|i['’]m|i['’]ve|i['’]ll|we|we['’]ll|we['’]re|you|gotta|gonna|wanna|need\s+to|have\s+to|should|must|remember\s+to|don['’]?t\s+forget(?:\s+to)?|planning\s+to|want\s+to|trying\s+to|supposed\s+to)\b/i;
  if (modalOrPronounRegex.test(lowerTitle) || modalOrPronounRegex.test(lowerRaw)) {
    return true;
  }

  // 2. Lingering temporal or hedging adverbs
  const colloquialTemporalOrFillerRegex =
    /\b(?:morrow|tmrw|later|sometime|maybe|probably|just|around|somewhere|after\s+class|before\s+class)\b/i;
  if (colloquialTemporalOrFillerRegex.test(lowerTitle) || colloquialTemporalOrFillerRegex.test(lowerRaw)) {
    return true;
  }

  // 3. Starts with a preposition, conjunction, or filler word
  if (/^(?:and|but|so|or|that|because|if|when|with|also|actually|honestly|basically)\b/i.test(lowerTitle)) {
    return true;
  }

  // 4. Excessive word count (>= 6 words) without a compact title structure
  const wordCount = lowerTitle.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 6) {
    return true;
  }

  return false;
}

/**
 * Distills conversational rambling, modal framing, and residual temporal qualifiers
 * into a clean, concise Title Case schedule title.
 */
export function distillScheduleTitle(rawTitle: string): string {
  let cleaned = (rawTitle || '').trim();
  if (!cleaned) return '';

  // Iteratively strip leading conversational framing (e.g., "I really gotta", "I need to", "Don't forget to", "Maybe")
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned
      .replace(
        /^(?:(?:uh|um|er|ah|hey|hi|okay|ok|well|so|like|actually|honestly|basically)\s*[,.!:-]*\s*)+/i,
        '',
      )
      .replace(
        /^(?:(?:i|we)\s+)(?:really\s+|just\s+|probably\s+|maybe\s+|kind\s+of\s+|kinda\s+|sort\s+of\s+|sorta\s+|still\s+|also\s+)*(?:gotta|gonna|wanna|(?:need|have|want|planning|plan|trying|try|supposed|ought|going|hope|hoping)\s+to|should|must|will|would\s+like\s+to|am\s+going\s+to|are\s+going\s+to)\s+/i,
        '',
      )
      .replace(
        /^(?:(?:really|just|probably|maybe|kind\s+of|kinda|sort\s+of|sorta)\s+)*(?:gotta|gonna|wanna|(?:need|have|want|planning|trying|supposed|ought|going)\s+to)\s+/i,
        '',
      )
      .replace(
        /^(?:please\s+)?(?:don['’]?t\s+forget(?:\s+to)?|remember(?:\s+to)?|make\s+sure(?:\s+to)?|be\s+sure(?:\s+to)?|let['’]?s|maybe|probably)\s+/i,
        '',
      )
      .trim();
  }

  // Convert "finish/start/continue + <gerund>" (e.g. "finish studying for..." -> "study for...")
  cleaned = cleaned.replace(
    /^(?:finish|start|begin|continue|keep)\s+([a-z]+ing)\b/i,
    (full, gerund: string) => {
      const base = GERUND_TO_INFINITIVE[gerund.toLowerCase()];
      return base || full;
    },
  );

  // Strip redundant possessive "my/our" after common task verbs (e.g. "submit my capstone draft" -> "submit capstone draft")
  cleaned = cleaned.replace(
    /\b(submit|finish|complete|upload|send|turn\s+in|hand\s+in|write|review|revise|edit|prepare|start|do)\s+(?:my|our)\s+/gi,
    '$1 ',
  );

  // Strip lingering temporal/contextual phrases and time tokens
  cleaned = cleaned.replace(
    /\b(?:to-?morrow|morrow|tmrw|today|tonight|yesterday|after\s+class|before\s+class|after\s+school|before\s+school|after\s+work|in\s+the\s+(?:morning|afternoon|evening)|this\s+(?:morning|afternoon|evening)|at\s+night|later\s+today|later\s+tonight|sometime|later|(?:(?:at|from|by|around)\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|noon|midnight))\b/gi,
    '',
  );

  // Strip lingering leading/trailing prepositions and articles
  cleaned = cleaned
    .replace(
      /^[\s,:-]*(?:\b(?:on|at|by|for|from|between|starting|with|to|about|regarding|of|in|around)\b[\s,:-]*(?:(?:a|an|the)\b[\s,:-]*)?)+/i,
      '',
    )
    .replace(/^[\s,:-]*(?:a|an|the)\b[\s,:-]*/i, '')
    .replace(
      /(?:[\s,:-]*\b(?:on|at|by|for|from|between|starting|with|to|about|regarding|of|in|around)\b)+[\s,:-]*$/i,
      '',
    )
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return toTitleCase(cleaned);
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
