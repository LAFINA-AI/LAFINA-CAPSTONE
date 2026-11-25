import type {
  CrudTargetEntityType,
  ExtractedIntent,
  ParsedIntentType,
} from './types';
import {extractExplicitMemory} from '../explicitMemory';
import {
  extractForgetSpecificMemoryQuery,
  isForgetAllMemoriesRequest,
  isMemoryRecallQuery,
} from '../chatMemoryCommands';

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
  if (
    parts.length === 2 &&
    dict[parts[0]] !== undefined &&
    dict[parts[1]] !== undefined
  ) {
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

const TIME_ENDPOINT_PATTERN = `(?:(?:noon|midday|mid-day|midnight)(?:\\s+(?:12|twelve)(?::00)?)?|(${HOUR_TOKEN_PATTERN})(?:(?::(\\d{2}))|(?:\\s+(${SPOKEN_MINUTE_PATTERN})))?(?:\\s+oclock)?(?:\\s*(${MERIDIEM_OR_ANCHOR_PATTERN}))?)`;

/** Formats a Date object to YYYY-MM-DD in local time. */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats hours and minutes to HH:mm in 24-hour format. */
export function formatLocalTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0',
  )}`;
}

/** Splits a 3- or 4-digit compact time token (e.g. "730" -> 7:30, "1030" -> 10:30, "0730" -> 07:30) if valid. */
function splitCompactDigitsToTime(
  digits: string,
  requireStandardMinuteWhenBare: boolean = false,
): {hourStr: string; hour: number; minuteStr: string; minute: number} | null {
  if (!/^\d{3,4}$/.test(digits)) return null;
  const hourStr = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minuteStr = digits.slice(-2);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  // Avoid treating years like 2025, 2026, 2027 as bare military times when no meridiem is attached
  if (
    digits.length === 4 &&
    hour === 20 &&
    minute >= 20 &&
    minute <= 35 &&
    requireStandardMinuteWhenBare
  ) {
    return null;
  }
  if (
    requireStandardMinuteWhenBare &&
    digits.length === 3 &&
    minute % 5 !== 0
  ) {
    return null;
  }
  return {hourStr, hour, minuteStr, minute};
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
      new RegExp(
        `(\\b(?:\\d{1,4}(?::\\d{2})?|${HOUR_TOKEN_PATTERN}|${SPOKEN_MINUTE_PATTERN}))\\s+a\\s+m\\b`,
        'gi',
      ),
      '$1 am',
    )
    .replace(
      new RegExp(
        `(\\b(?:\\d{1,4}(?::\\d{2})?|${HOUR_TOKEN_PATTERN}|${SPOKEN_MINUTE_PATTERN}))\\s+p\\s+m\\b`,
        'gi',
      ),
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
      const leftDigits = /^\d{3,4}$/.test(leftTok.trim())
        ? splitCompactDigitsToTime(leftTok.trim(), true)
        : null;
      const rightDigits = /^\d{3,4}$/.test(rightTok.trim())
        ? splitCompactDigitsToTime(rightTok.trim(), true)
        : null;
      if (!leftDigits && !rightDigits) return full;
      const newLeft = leftDigits
        ? `${leftDigits.hourStr}:${leftDigits.minuteStr}`
        : leftTok;
      const newRight = rightDigits
        ? `${rightDigits.hourStr}:${rightDigits.minuteStr}`
        : rightTok;
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
    new RegExp(
      `\\bhalf\\s+past\\s+(noon|midday|midnight|${HOUR_TOKEN_PATTERN})\\b`,
      'gi',
    ),
    (_, hToken: string) => {
      const lowerH = hToken.toLowerCase();
      if (lowerH === 'noon' || lowerH === 'midday') return '12:30 noon';
      if (lowerH === 'midnight') return '12:30 midnight';
      const parsed = parseNumberWordOrDigits(lowerH);
      return parsed !== null ? `${parsed}:30` : `${hToken}:30`;
    },
  );
  result = result.replace(
    new RegExp(
      `\\bquarter\\s+past\\s+(noon|midday|midnight|${HOUR_TOKEN_PATTERN})\\b`,
      'gi',
    ),
    (_, hToken: string) => {
      const lowerH = hToken.toLowerCase();
      if (lowerH === 'noon' || lowerH === 'midday') return '12:15 noon';
      if (lowerH === 'midnight') return '12:15 midnight';
      const parsed = parseNumberWordOrDigits(lowerH);
      return parsed !== null ? `${parsed}:15` : `${hToken}:15`;
    },
  );
  result = result.replace(
    new RegExp(
      `\\bquarter\\s+(?:to|till)\\s+(noon|midday|midnight|${HOUR_TOKEN_PATTERN})\\b`,
      'gi',
    ),
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
    new RegExp(
      `\\b(ten|fifteen|twenty|twenty[\\s-]five|5|10|15|20|25)\\s+(?:minutes?\\s+)?past\\s+(${HOUR_TOKEN_PATTERN})\\b`,
      'gi',
    ),
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
    new RegExp(
      `\\b(ten|fifteen|twenty|twenty[\\s-]five|5|10|15|20|25)\\s+(?:minutes?\\s+)?(?:to|till)\\s+(${HOUR_TOKEN_PATTERN})\\b`,
      'gi',
    ),
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

const TAGLISH_MARKER =
  /\b(?:paalala(?:han)?|ipaalala|dagdag(?:an)?|idagdag|i?lagay|ano(?:ng)?|bukas|mamaya(?:ng)?|ngayon(?:g)?|sakin|saakin|mag-?aral|mag-?review|bumili|magpasa|ipasa|alas|pa-?remind|i-?cancel|i-?delete|burahin|tanggalin|tapos\s+na|natapos|gisingin|gisingan|alarm\s+ko|i-?alarm|mag-?alarm|tuwing|araw-?araw|patayin|buksan|i-?off|free\s+ba|bakante\s+ba|lunes|martes|miyerkules|myerkules|huwebes|biyernes|sabado)\b|\bmay\s+\S+(?:\s+\S+)?\s+(?:ako|kami|tayo)\b/i;

/** "gawa ka ng note: …": the note's own words stay exactly as said. */
const TAGLISH_NOTE_FRAME =
  /^(?:gawa|gumawa)(?:\s+(?:ka|mo|ako))?\s+(?:ng\s+|ang\s+)?(?:note|notes|tala)\s*[:,-]?\s*(.+)$/i;

const TAGLISH_WEEKDAYS: Record<string, string> = {
  lunes: 'monday',
  martes: 'tuesday',
  miyerkules: 'wednesday',
  myerkules: 'wednesday',
  huwebes: 'thursday',
  biyernes: 'friday',
  sabado: 'saturday',
  linggo: 'sunday',
};

/**
 * Offline Taglish support: rewrites the common Filipino words students mix into
 * planner commands ("paalala mo sakin mag-aral bukas ng 7pm") into the English
 * the parser understands ("remind me to study tomorrow at 7pm"). Returns null
 * when the text has no Taglish planner words, so English input is untouched.
 */
export function translateTaglishCommand(text: string): string | null {
  const source = (text || '').trim();
  const noteFrame = TAGLISH_NOTE_FRAME.exec(source);
  if (noteFrame) return `note: ${noteFrame[1].trim()}`;
  if (!source || !TAGLISH_MARKER.test(source)) return null;
  let result = ` ${source.toLowerCase()} `;
  const replace = (
    pattern: RegExp,
    value: string | ((match: string, ...groups: string[]) => string),
  ): void => {
    result =
      typeof value === 'string'
        ? result.replace(pattern, value)
        : result.replace(pattern, value);
  };
  // Command frames first, so their pronouns ("mo", "sakin") go with them.
  replace(
    /\s(?:i?paalala(?:han)?)\s+(?:mo\s+)?(?:ako|sakin|saakin|sa\s+akin)?\s*(?:na\s+|ng\s+|to\s+)?/g,
    ' remind me to ',
  );
  replace(
    /\s(?:i?dagdag(?:an)?|i?lagay)\s+(?:mo\s+)?(?:ito\s+)?(?:sa|ng)\s+(?:aking\s+|ang\s+)?(?:to-?do|to\s+do|todo|listahan)(?:\s+ko)?\s+(?:yung\s+|ang\s+)?(.+?)\s*$/g,
    ' add $1 to my to-do ',
  );
  replace(
    /\s(?:i?dagdag(?:an)?|i?lagay)\s+(?:mo\s+)?(?:yung\s+|ang\s+)?(.+?)\s+sa\s+(?:aking\s+|ang\s+)?(?:to-?do|to\s+do|todo|listahan)(?:\s+ko)?\s*$/g,
    ' add $1 to my to-do ',
  );
  // "pa-remind ako", "remind mo ako": a reminder for the speaker.
  replace(
    /\s(?:pa-?remind|remind\s+mo)\s+(?:mo\s+)?(?:ako|sakin|saakin|sa\s+akin)\b\s*/g,
    ' remind me ',
  );
  // A bare "pa-remind bukas …" (no pronoun) is still "remind me" (audit L2).
  replace(/\spa-?remind\b\s*/g, ' remind me ');
  // Wake-up requests: "gisingin mo ako ng 6 bukas".
  replace(
    /\s(?:gisingin|gisingan)\s+(?:mo\s+)?(?:ako|sakin)\b/g,
    ' wake me up',
  );
  // Alarms (alarm plan A3): "patayin mo yung alarm ko", "alarm ko 5:30 tuwing weekdays".
  replace(
    /\s(?:patayin|i-?off|isara)\s+(?:mo\s+)?(?:na\s+)?(?:yung\s+|ang\s+)?(.*?)\balarm\b(?:\s+ko)?/g,
    ' turn off my $1 alarm',
  );
  replace(
    /\s(?:buksan|i-?on)\s+(?:mo\s+)?(?:ulit\s+)?(?:yung\s+|ang\s+)?(.*?)\balarm\b(?:\s+ko)?/g,
    ' turn on my $1 alarm',
  );
  replace(
    /^\s(?:alarm\s+ko|i-?alarm\s+mo(?:\s+ako)?|mag-?alarm(?:\s+ka)?)\b(?:\s+(?:ng\s+alas|ng|sa|alas))?/g,
    ' set an alarm at',
  );
  replace(
    /\stuwing\s+(lunes|martes|miyerkules|myerkules|huwebes|biyernes|sabado|linggo)\b/g,
    (_m: string, day: string) => ` every ${TAGLISH_WEEKDAYS[day] || day}`,
  );
  replace(
    /\stuwing\s+(?:weekdays?|week\s+days?|may\s+pasok)\b/g,
    ' on weekdays',
  );
  replace(/\stuwing\s+weekends?\b/g, ' on weekends');
  replace(/\s(?:araw-?araw|tuwing\s+araw)\b/g, ' every day');
  // Removing or finishing an item named after the frame.
  replace(
    /\s(?:i-?cancel|i-?delete|burahin|tanggalin)\s+(?:mo\s+)?(?:na\s+)?(?:yung|ang)?\s*/g,
    ' delete my ',
  );
  replace(
    /^\s(?:tapos\s+na|natapos\s+(?:ko\s+)?na)\s+(?:yung\s+|ang\s+)?(.+?)\s*$/g,
    ' mark $1 as done ',
  );
  // Schedule questions: "free ba ako sa biyernes?".
  replace(/\s(?:free|bakante)\s+ba\s+(?:ako|ko)\b/g, ' when am i free');
  // "may quiz ako sa lunes": the student has something on a day.
  // "may quiz kami/tayo bukas" is the same for the class (audit L2).
  replace(/^\smay\s+(\S+(?:\s+\S+)?)\s+(?:ako|kami|tayo)\b/g, ' i have a $1');
  replace(
    /\sano(?:ng)?\s+(?:ang\s+)?(?:sched(?:ule)?|iskedyul|gagawin|lakad)\s+(?:ko|natin)\b/g,
    ' what is my schedule',
  );
  replace(
    /\sano(?:ng)?\s+(?:ang\s+)?(?:to-?do|todo)\s+ko\b/g,
    ' what is on my to-do list',
  );
  // Verbs students use as task titles.
  replace(/\smag-?aral\b/g, ' study');
  replace(/\smag-?review\b/g, ' review');
  replace(/\sbumili\s+(?:ng\s+)?/g, ' buy ');
  replace(/\s(?:magpasa|ipasa)\s+(?:ng\s+|ang\s+)?/g, ' submit ');
  replace(/\smaglinis\s+(?:ng\s+)?/g, ' clean ');
  replace(/\stapusin\s+(?:ang\s+)?/g, ' finish ');
  // Any other "na mag-submit ng essay" → "to submit essay".
  replace(/\s(?:na\s+)?mag-(\w+)(?:\s+ng)?\b/g, ' to $1');
  // Time words.
  replace(/\sbukas\s+ng\s+umaga\b/g, ' tomorrow morning');
  replace(/\sbukas\s+ng\s+hapon\b/g, ' tomorrow afternoon');
  replace(/\sbukas\s+ng\s+gabi\b/g, ' tomorrow night');
  replace(/\sbukas\b/g, ' tomorrow');
  replace(/\s(?:mamayang|ngayong)\s+gabi\b/g, ' tonight');
  replace(/\smamayang\s+hapon\b/g, ' this afternoon');
  // "mamaya 5pm" with a clock time is today at that time.
  replace(
    /\smamaya(?:ng)?\s+(?:ng\s+|alas\s+)?(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\b)/g,
    ' today at ',
  );
  replace(/\smamaya(?:ng)?\b/g, ' later');
  replace(/\sngayon(?:g)?\s+araw\b/g, ' today');
  replace(/\sngayon\b/g, ' today');
  replace(
    /\s(?:sa\s+)?(lunes|martes|miyerkules|myerkules|huwebes|biyernes|sabado|linggo)\b/g,
    (_m: string, day: string) => ` on ${TAGLISH_WEEKDAYS[day] || day}`,
  );
  replace(/\salas\s+(\d{1,2}(?::\d{2})?)/g, ' at $1');
  replace(
    /\sng\s+(?=\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\b)/g,
    ' at ',
  );
  // Leftover pronouns and particles.
  replace(/\s(?:mo|ko|sakin|saakin|sa\s+akin|po|naman|nga)\b/g, ' ');
  const translated = result.replace(/\s+/g, ' ').trim();
  return translated && translated !== source.toLowerCase() ? translated : null;
}

/** Detects academic vs personal category from keywords. */
export function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  const academicKeywords = [
    'exam',
    'quiz',
    'midterm',
    'final',
    'lecture',
    'assignment',
    'homework',
    'thesis',
    'capstone',
    'lab',
    'class',
    'study',
    'professor',
    'course',
    'project',
    'defense',
    'subject',
    'school',
    'university',
    'ustp',
    'syllabus',
    'calculus',
    'physics',
    'algorithms',
    'programming',
    'research',
    'report',
    'seminar',
  ];
  for (const kw of academicKeywords) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) {
      return 'Academic';
    }
  }
  return 'Personal';
}

/** Detects recurrence rules (e.g. "repeats every Monday", "every week", "daily") as standard iCalendar RRULE strings. */
export function extractRecurrenceRule(text: string): string | null {
  const lower = text.toLowerCase();
  // "every monday and wednesday", "every mon, wed and fri"
  const multiDay =
    /\b(?:repeats?|repeating|every)\s+((?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?:\s*,\s*|\s+and\s+|\s*&\s*|\s*\/\s*)?){2,})/i.exec(
      lower,
    );
  if (multiDay) {
    const codes: Record<string, string> = {
      monday: 'MO',
      tuesday: 'TU',
      wednesday: 'WE',
      thursday: 'TH',
      friday: 'FR',
      saturday: 'SA',
      sunday: 'SU',
    };
    const found = [
      ...multiDay[1].matchAll(
        /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
      ),
    ].map(m => codes[m[1].toLowerCase()]);
    const unique = [...new Set(found)];
    if (unique.length >= 2) {
      return `RRULE:FREQ=WEEKLY;BYDAY=${unique.join(',')}`;
    }
  }
  if (/\b(?:repeats?|repeating|every)\s+mondays?\b/i.test(lower)) {
    return 'RRULE:FREQ=WEEKLY;BYDAY=MO';
  }
  if (/\b(?:repeats?|repeating|every)\s+tuesdays?\b/i.test(lower)) {
    return 'RRULE:FREQ=WEEKLY;BYDAY=TU';
  }
  if (/\b(?:repeats?|repeating|every)\s+wednesdays?\b/i.test(lower)) {
    return 'RRULE:FREQ=WEEKLY;BYDAY=WE';
  }
  if (/\b(?:repeats?|repeating|every)\s+thursdays?\b/i.test(lower)) {
    return 'RRULE:FREQ=WEEKLY;BYDAY=TH';
  }
  if (/\b(?:repeats?|repeating|every)\s+fridays?\b/i.test(lower)) {
    return 'RRULE:FREQ=WEEKLY;BYDAY=FR';
  }
  if (/\b(?:repeats?|repeating|every)\s+saturdays?\b/i.test(lower)) {
    return 'RRULE:FREQ=WEEKLY;BYDAY=SA';
  }
  if (/\b(?:repeats?|repeating|every)\s+sundays?\b/i.test(lower)) {
    return 'RRULE:FREQ=WEEKLY;BYDAY=SU';
  }
  if (/\b(?:every\s+day|daily|repeats?\s+daily)\b/i.test(lower)) {
    return 'RRULE:FREQ=DAILY';
  }
  if (/\b(?:every\s+week|weekly|repeats?\s+weekly)\b/i.test(lower)) {
    return 'RRULE:FREQ=WEEKLY';
  }
  if (/\b(?:every\s+month|monthly|repeats?\s+monthly)\b/i.test(lower)) {
    return 'RRULE:FREQ=MONTHLY';
  }
  return null;
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
  if (
    cleaned.includes('noon') ||
    cleaned.includes('midday') ||
    cleaned.includes('mid-day')
  ) {
    return 'noon';
  }
  if (cleaned.includes('midnight')) {
    return 'midnight';
  }
  if (cleaned === 'am' || cleaned === 'in the morning') {
    return 'am';
  }
  if (
    cleaned === 'pm' ||
    cleaned === 'in the afternoon' ||
    cleaned === 'in the evening'
  ) {
    return 'pm';
  }
  if (cleaned === 'at night' || cleaned === 'tonight') {
    return 'night';
  }
  return null;
}

function parseTimeEndpoint(
  rawEndpoint: string,
  allowBareSpokenMinutes: boolean = false,
): ParsedTimeEndpoint | null {
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
    (parsedHour >= 13 ||
      parsedHour === 0 ||
      (hasLeadingZero && colonMinToken !== undefined));

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

function detectContextPeriod(
  lowerText: string,
): 'morning' | 'afternoon' | 'evening' | 'night' | null {
  if (
    /\b(?:in\s+the\s+morning|this\s+morning|(?:to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr)\s+morning|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+morning|before\s+class|before\s+school)\b/i.test(
      lowerText,
    )
  ) {
    return 'morning';
  }
  if (
    /\b(?:in\s+the\s+afternoon|this\s+afternoon|(?:to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr)\s+afternoon|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+afternoon|after\s+lunch)\b/i.test(
      lowerText,
    )
  ) {
    return 'afternoon';
  }
  if (
    /\b(?:in\s+the\s+evening|this\s+evening|(?:to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr)\s+evening|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+evening|after\s+class|after\s+school|after\s+work)\b/i.test(
      lowerText,
    )
  ) {
    return 'evening';
  }
  if (
    /\b(?:at\s+night|tonight|(?:to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr)\s+night|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+night|late\s+night)\b/i.test(
      lowerText,
    )
  ) {
    return 'night';
  }
  return null;
}

function resolveTimeRangeEndpoints(
  startEp: ParsedTimeEndpoint,
  endEp: ParsedTimeEndpoint,
  contextPeriod: 'morning' | 'afternoon' | 'evening' | 'night' | null,
): {
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  durationMinutes: number;
} {
  let startH = resolveExplicitHour24(startEp);
  let endH = resolveExplicitHour24(endEp);

  if (startH !== null && endH === null) {
    const eh = endEp.rawHour;
    if (startH < 12) {
      if (eh === 12) {
        endH = 12;
      } else if (startH === 0) {
        endH = eh;
      } else if (
        eh > startH ||
        (eh === startH && endEp.minute > startEp.minute)
      ) {
        endH = eh;
      } else {
        endH = eh + 12;
      }
    } else {
      if (eh === 12) {
        endH = 0;
      } else if (startH === 12) {
        endH = eh + 12;
      } else if (
        eh + 12 > startH ||
        (eh + 12 === startH && endEp.minute > startEp.minute)
      ) {
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
      } else if (
        sh < end12 ||
        (sh === end12 && startEp.minute < endEp.minute)
      ) {
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
  /**
   * True when a bare hour with no am/pm was read as later today because the
   * morning reading had already passed ("later at 7" at 10 AM -> 7 PM).
   */
  shiftedToEvening?: boolean;
}

/**
 * "in N minutes" from now, rounded up to a whole minute: times are kept as
 * HH:MM, and dropping the seconds made "in 1 minute" at 9:30:51 ring at
 * 9:31:00, already past before the student could confirm (device test
 * 2026-11-23). Never earlier than asked.
 */
function relativeTarget(referenceDate: Date, offsetMs: number): Date {
  const target = new Date(referenceDate.getTime() + offsetMs);
  if (target.getSeconds() > 0 || target.getMilliseconds() > 0) {
    target.setSeconds(0, 0);
    target.setMinutes(target.getMinutes() + 1);
  }
  return target;
}

/** Parses dates and times deterministically using local calendar arithmetic. */
export function parseDateAndTime(
  text: string,
  referenceDate: Date = new Date(),
): ParsedDateTime {
  const matchedText: string[] = [];
  let date: string | null = null;
  let time: string | null = null;
  let endTime: string | null = null;
  let durationMinutes: number | null = null;
  // A bare hour read with the daytime assumption (no am/pm, no part of day).
  let implicitHour = false;
  let shiftedToEvening = false;

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
    const morrowMatch =
      /\b(?:to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr)\b/i.exec(
        lower,
      );
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

  // Explicit ISO date: "2026-10-31", "on 2026-10-31"
  if (!date) {
    const isoDateMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(lower);
    if (isoDateMatch) {
      date = isoDateMatch[1];
      matchedText.push(isoDateMatch[0]);
    }
  }

  // Month name and day: e.g. "on October 31", "Oct 31", "October 31st"
  if (!date) {
    const monthRegex =
      /\b(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i;
    const monthMatch = monthRegex.exec(lower);
    if (monthMatch) {
      const monthNames = [
        'january',
        'february',
        'march',
        'april',
        'may',
        'june',
        'july',
        'august',
        'september',
        'october',
        'november',
        'december',
      ];
      const monthShort = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ];
      const mStr = monthMatch[1].toLowerCase();
      let mIdx = monthNames.indexOf(mStr);
      if (mIdx === -1) mIdx = monthShort.indexOf(mStr.slice(0, 3));
      if (mIdx !== -1) {
        const dNum = parseInt(monthMatch[2], 10);
        const explicitYear = Boolean(monthMatch[3]);
        let yNum = explicitYear
          ? parseInt(monthMatch[3], 10)
          : referenceDate.getFullYear();
        if (dNum >= 1 && dNum <= 31) {
          const daysInMonth = new Date(yNum, mIdx + 1, 0).getDate();
          if (dNum > daysInMonth) {
            // "November 31" must not silently become December 1 (audit
            // M7): keep the impossible date so validation can say so.
            date = `${yNum}-${String(mIdx + 1).padStart(2, '0')}-${String(
              dNum,
            ).padStart(2, '0')}`;
          } else {
            // Without a year, a date well in the past means next year: in
            // November, "January 5" is the coming January (audit M7). A
            // date only a few weeks back stays, so "already passed" is said.
            const startOfToday = new Date(
              referenceDate.getFullYear(),
              referenceDate.getMonth(),
              referenceDate.getDate(),
            );
            let d = new Date(yNum, mIdx, dNum);
            const daysPast =
              (startOfToday.getTime() - d.getTime()) / 86_400_000;
            if (!explicitYear && daysPast > 60) {
              yNum += 1;
              d = new Date(yNum, mIdx, dNum);
            }
            date = formatLocalDate(d);
          }
          matchedText.push(monthMatch[0]);
        }
      }
    }
  }

  // Weekdays: e.g. "next Monday", "this Friday", "on Wednesday", "every Monday"
  const weekdayMatch =
    /\b(?:on\s+|this\s+|next\s+|every\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(
      lower,
    );
  if (weekdayMatch && !date) {
    const days = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
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

  // "next week" / "this coming week"
  if (!date) {
    const nextWeekMatch =
      /\b(?:(?:for|in|on)\s+)?(?:next\s+week|this\s+coming\s+week)\b/i.exec(
        lower,
      );
    if (nextWeekMatch) {
      const currentDayIndex = referenceDate.getDay();
      let daysUntilNextMonday = (8 - currentDayIndex) % 7;
      if (daysUntilNextMonday === 0) daysUntilNextMonday = 7;
      const d = new Date(referenceDate);
      d.setDate(d.getDate() + daysUntilNextMonday);
      date = formatLocalDate(d);
      matchedText.push(nextWeekMatch[0]);
    }
  }

  // "this weekend" / "next weekend"
  if (!date) {
    const weekendMatch =
      /\b(?:(?:for|on|over)\s+)?(?:this\s+weekend|next\s+weekend)\b/i.exec(
        lower,
      );
    if (weekendMatch) {
      const isNext = /\bnext\b/i.test(weekendMatch[0]);
      const currentDayIndex = referenceDate.getDay();
      let daysUntilSaturday = (6 - currentDayIndex + 7) % 7;
      if (daysUntilSaturday === 0 && isNext) daysUntilSaturday = 7;
      else if (daysUntilSaturday === 0) daysUntilSaturday = 0;
      else if (isNext) daysUntilSaturday += 7;
      const d = new Date(referenceDate);
      d.setDate(d.getDate() + daysUntilSaturday);
      date = formatLocalDate(d);
      matchedText.push(weekendMatch[0]);
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
  const halfHourMatch =
    /\b(?:in\s+(?:about\s+)?half\s+(?:an?\s+)?hour(?:\s+(?:from\s+now|later))?|(?:about\s+)?half\s+(?:an?\s+)?hour\s+(?:from\s+now|later))\b/i.exec(
      lower,
    );
  if (halfHourMatch && !time) {
    const target = relativeTarget(referenceDate, 30 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(halfHourMatch[0]);
  }

  // "in an hour", "an hour from now", "an hour later"
  const anHourMatch =
    /\b(?:in\s+(?:about\s+)?an\s+hour(?:\s+(?:from\s+now|later))?|(?:about\s+)?an\s+hour\s+(?:from\s+now|later))\b/i.exec(
      lower,
    );
  if (anHourMatch && !time) {
    const target = relativeTarget(referenceDate, 60 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(anHourMatch[0]);
  }

  // "a couple minutes from now", "in a couple minutes", "a couple of minutes"
  const coupleMatch =
    /\b(?:in\s+(?:about\s+)?(?:a\s+)?couple(?:\s+of)?\s*(?:minutes?|mins?)(?:\s+(?:from\s+now|later))?|(?:about\s+)?(?:a\s+)?couple(?:\s+of)?\s*(?:minutes?|mins?)\s+(?:from\s+now|later))\b/i.exec(
      lower,
    );
  if (coupleMatch && !time) {
    const target = relativeTarget(referenceDate, 2 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(coupleMatch[0]);
  }

  // "a few minutes from now", "in a few minutes", "few minutes later"
  const fewMatch =
    /\b(?:in\s+(?:about\s+)?(?:a\s+)?few\s*(?:minutes?|mins?)(?:\s+(?:from\s+now|later))?|(?:about\s+)?(?:a\s+)?few\s*(?:minutes?|mins?)\s+(?:from\s+now|later))\b/i.exec(
      lower,
    );
  if (fewMatch && !time) {
    const target = relativeTarget(referenceDate, 5 * 60000);
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
        const target = relativeTarget(referenceDate, offsetMs);
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
        .slice(
          (rangeCandidate[1] || '').length + rawStart.length,
          fullMatch.length - rawEnd.length,
        )
        .trim()
        .toLowerCase();
      if (middlePart === 'and' && prefix !== 'between') {
        continue;
      }

      // Avoid false-matching non-time ranges like "chapters 1 through 4" or "pages 9 to 12"
      const precedingSlice = lower.slice(0, rangeCandidate.index).trim();
      if (
        /\b(?:chapters?|pages?|sections?|parts?|items?|questions?|problems?|steps?|units?|modules?|verses?|exercises?)$/i.test(
          precedingSlice,
        )
      ) {
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
            ? parseNumberWordOrDigits(spokenMinTok) ?? 0
            : 0;
        if (rawH !== null && rawH >= 0 && rawH <= 23 && min >= 0 && min <= 59) {
          const resolvedH = resolveImplicitHour24(
            rawH,
            contextPeriod,
            /^0\d$/.test(hourTok),
          );
          implicitHour =
            !contextPeriod && !/^0\d$/.test(hourTok) && rawH >= 1 && rawH <= 11;
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
        const resolvedH = resolveImplicitHour24(
          rawH % 24,
          contextPeriod,
          /^0\d$/.test(bareAtMatch[1]),
        );
        implicitHour =
          !contextPeriod &&
          !/^0\d$/.test(bareAtMatch[1]) &&
          rawH >= 1 &&
          rawH <= 11;
        time = formatLocalTime(resolvedH, 0);
        matchedText.push(bareAtMatch[0]);
      }
    }
  }

  // 4. Period-of-day fallback when a time-of-day phrase ("this morning", "this afternoon", "this evening", "tonight")
  // is explicitly spoken without a clock hour, preventing timed tasks from falling into All-Day!
  if (!time && contextPeriod) {
    const explicitPeriodMatch =
      /\b(?:in\s+the\s+(?:morning|afternoon|evening)|this\s+(?:morning|afternoon|evening)|(?:to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr)\s+(?:morning|afternoon|evening|night)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:morning|afternoon|evening|night)|tonight|at\s+night)\b/i.exec(
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

  // A bare hour that already passed this morning means this evening: at 10 AM,
  // "later at 7" is 7 PM, not 7 AM. Only for today (or no date) and only when
  // the evening reading is still ahead.
  if (
    time &&
    implicitHour &&
    !endTime &&
    (date === null || date === formatLocalDate(referenceDate))
  ) {
    const [h, m] = time.split(':').map(v => parseInt(v, 10));
    const nowMinutes =
      referenceDate.getHours() * 60 + referenceDate.getMinutes();
    if (h < 12 && h * 60 + m <= nowMinutes && (h + 12) * 60 + m > nowMinutes) {
      time = formatLocalTime(h + 12, m);
      shiftedToEvening = true;
    }
  }

  // Explicit duration phrases (e.g. "for 2 hours", "for 90 minutes", "for an hour and a half", "for half an hour")
  if (durationMinutes === null) {
    const hourAndHalfMatch = new RegExp(
      `\\bfor\\s+(?:an?\\s+hour|(${NUM_WORDS_PATTERN})\\s+hours?)\\s+and\\s+a\\s+half\\b`,
      'i',
    ).exec(lower);
    if (hourAndHalfMatch) {
      const baseHours = hourAndHalfMatch[1]
        ? parseNumberWordOrDigits(hourAndHalfMatch[1]) ?? 1
        : 1;
      durationMinutes = baseHours * 60 + 30;
      matchedText.push(hourAndHalfMatch[0]);
    } else {
      const halfHourDurMatch =
        /\bfor\s+(?:half\s+an?\s+hour|a\s+half\s+hour)\b/i.exec(lower);
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
        } else {
          // "for an hour", "block out 2 hours", "2 hours of studying": a bare
          // length that is not an offset ("in 2 hours", "2 hours before").
          const anHour = /\bfor\s+an?\s+hour\b/i.exec(lower);
          const bareDur = new RegExp(
            `(?<!\\b(?:in|after|within|every|each|about|around)\\s)\\b(${NUM_WORDS_PATTERN}|\\d+\\.5)\\s*(hours?|hrs?)\\b(?!\\s+(?:from\\s+now|later|before|after|ago|early|earlier|prior))`,
            'i',
          ).exec(lower);
          if (anHour) {
            durationMinutes = 60;
            matchedText.push(anHour[0]);
          } else if (bareDur) {
            const rawAmount = bareDur[1];
            const numericAmount = /^\d+\.\d+$/.test(rawAmount)
              ? parseFloat(rawAmount)
              : parseNumberWordOrDigits(rawAmount);
            if (
              numericAmount !== null &&
              numericAmount > 0 &&
              numericAmount <= 12
            ) {
              durationMinutes = Math.round(numericAmount * 60);
              matchedText.push(bareDur[0]);
            }
          }
        }
      }
    }

    if (time && !endTime && durationMinutes !== null && durationMinutes > 0) {
      const [h, m] = time.split(':').map(v => parseInt(v, 10));
      const totalMin = h * 60 + m + durationMinutes;
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      endTime = formatLocalTime(endH, endM);
    }
  }

  return {
    date,
    time,
    endTime,
    durationMinutes,
    matchedText,
    ...(shiftedToEvening ? {shiftedToEvening} : {}),
  };
}

function extractPriority(text: string): 'High' | 'Medium' | 'Low' | null {
  if (
    /\b(?:high\s+priority|priority\s*:\s*high|urgent|asap|critical)\b/i.test(
      text,
    )
  ) {
    return 'High';
  }
  if (
    /\b(?:medium\s+priority|priority\s*:\s*medium|normal\s+priority)\b/i.test(
      text,
    )
  ) {
    return 'Medium';
  }
  if (/\b(?:low\s+priority|priority\s*:\s*low|no\s+rush)\b/i.test(text)) {
    return 'Low';
  }
  return null;
}

function stripConversationalCommandPrefix(text: string): string {
  let result = text.trim();
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result
      .replace(
        /^(?:(?:uh|um|er|ah|hey|hi|hello|okay|ok|yo|so|well|actually|honestly|alright|now|then|never\s*mind)\s*[,.!:-]*\s*)+/i,
        '',
      )
      .replace(/^lafina\s*[,.!:-]*\s*/i, '')
      .replace(
        /^(?:(?:can|could|would|will|may)\s+(?:you|we)\s+(?:please\s+)?(?:help\s+me\s+(?:to\s+)?)?|please\s+(?:help\s+me\s+(?:to\s+)?)?|help\s+me\s+(?:to\s+)?)/i,
        '',
      )
      .replace(
        /^(?:(?:(?:i|we)\s+)(?:really\s+|just\s+)?(?:want|need|would\s+like)\s+(?:you\s+)?to\s+|(?:i['’]?d|we['’]?d)\s+like\s+(?:you\s+)?to\s+|let['’]?s\s+(?:just\s+|go\s+ahead\s+and\s+)?|go\s+ahead\s+and\s+)(?=(?:cancel|remove|delete|clear|erase|drop|scratch|discard|unschedule|wipe|get\s+rid\s+of|take\s+off|call\s+off|cross\s+off|cross\s+out|update|edit|change|modify|move|reschedule|shift|push\s+back|postpone|rename|complete|check\s+off|tick\s+off|mark|schedule|add|create|set|make|put|book|plan|remind|take\s+a?\s*note|save\s+a?\s*note|write\s+a?\s*note|note\s+down|write\s+down|jot\s+down)\b)/i,
        '',
      )
      .trim();
  }
  return result;
}

function classifyCrudEntityType(text: string): {
  entityType: CrudTargetEntityType;
  deleteIntent: 'delete_task' | 'delete_time_block' | 'delete_note';
  updateIntent: 'update_task' | 'update_time_block' | 'update_note';
} {
  if (/\b(?:events?|appointments?)\b/i.test(text)) {
    return {
      entityType: 'event',
      deleteIntent: 'delete_time_block',
      updateIntent: 'update_time_block',
    };
  }
  if (
    /\b(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|blocks?)\b/i.test(
      text,
    )
  ) {
    return {
      entityType: 'time_block',
      deleteIntent: 'delete_time_block',
      updateIntent: 'update_time_block',
    };
  }
  const targetsTodoDestination =
    /\b(?:from|off|on|onto|in)\s+(?:my\s+|the\s+)?(?:to-?do|to\s+do|todo|task|checklist)(?:\s+list)?(?:\s+in\s+(?:my\s+|the\s+)?notes?(?:\s+tab)?)?\b/i.test(
      text,
    );
  const isExplicitNoteTarget =
    /\b(?:delete|remove|cancel|update|edit|rename|append\s+to|check)\s+(?:my\s+|the\s+|a\s+)?notes?\b|\bnotes?\s+(?:titled|called|named|about)\b/i.test(
      text,
    );
  if (
    /\b(?:tasks?|todos?|to-?dos?|to\s+dos?|checklists?)\b/i.test(text) &&
    (targetsTodoDestination || !isExplicitNoteTarget)
  ) {
    return {
      entityType: 'task',
      deleteIntent: 'delete_task',
      updateIntent: 'update_task',
    };
  }
  if (/\b(?:notes?)\b/i.test(text)) {
    return {
      entityType: 'note',
      deleteIntent: 'delete_note',
      updateIntent: 'update_note',
    };
  }
  if (/\b(?:reminders?|alarms?)\b/i.test(text)) {
    return {
      entityType: 'reminder',
      deleteIntent: 'delete_task',
      updateIntent: 'update_task',
    };
  }
  if (/\b(?:tasks?|todos?|to-?dos?|to\s+dos?)\b/i.test(text)) {
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

function cleanCrudTargetTitle(
  rawTarget: string,
  matchedDateTimeTokens: string[] = [],
  hasDateTime: boolean = false,
): string {
  let cleaned = stripConversationalCommandPrefix(rawTarget);

  // Strip trailing "from my schedule / calendar / to-do list" or trailing ", cancel it / delete that"
  cleaned = cleaned
    .replace(
      /(?:,\s*|\s+and\s+|\s+please\s+|\s+)(?:cancel|delete|remove|unschedule)\s+(?:it|that|this|them)[\s.!?]*$/i,
      ' ',
    )
    .replace(
      /\s+(?:from|off|on|onto|in)\s+(?:my\s+|the\s+)?(?:(?:to-?do|to\s+do|todo|task)\s+)?(?:schedule|calendar|agenda|list|to-?dos?|to\s+dos?|todos?|tasks?|events?|time\s*blocks?)(?:\s+in\s+(?:my\s+|the\s+)?notes?(?:\s+tab)?)?\b[\s.!?]*$/i,
      ' ',
    );

  const sortedMatches = [...matchedDateTimeTokens].sort(
    (a, b) => b.length - a.length,
  );
  for (const m of sortedMatches) {
    cleaned = cleaned.replace(
      new RegExp(`\\b${escapeRegExp(m)}\\b`, 'gi'),
      ' ',
    );
  }

  cleaned = stripConversationalCommandPrefix(cleaned)
    .replace(
      /^(?:cancel|remove|delete|clear|erase|drop|scratch|discard|unschedule|wipe|get\s+rid\s+of|take\s+off|call\s+off|cross\s+off|cross\s+out|update|edit|change|modify|move|reschedule|shift|push\s+back|postpone|rename|complete|finish|check\s+off|tick\s+off|mark)\b\s*/i,
      '',
    )
    .replace(
      /\b(?:(?:that|which|you|i)\s+)?(?:just\s+)?(?:created|made|added|scheduled|set\s+up)\s+(?:earlier|previously|before|recently)\b/gi,
      ' ',
    )
    .replace(/\b(?:earlier|previously|before|recently)\b/gi, ' ')
    .replace(/\b(?:recurring|repeated|repeats?|one-time|single)\b/gi, ' ')
    .replace(
      /\b(?:what\s+i\s+have(?:\s+scheduled)?|what(?:'s|s|\s+is)\s+(?:scheduled|on\s+my\s+schedule|on\s+my\s+calendar)|whatever\s+is(?:\s+scheduled)?|time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|blocks?|tasks?|to-?do\s+lists?|todo\s+lists?|to\s+do\s+lists?|todos?|to-?dos?|to\s+dos?|checklists?|reminders?|alarms?|notes?|events?|appointments?)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();

  // Check if the remaining target is a recent-reference token ("that", "this", "it", "last", "latest", "recent", "previous")
  const recentCandidate = cleaned
    .replace(
      /^(?:[\s,.:;!?-]*(?:my|the|a|an|our|for|about|of|to|on|at|from)\b)+/gi,
      '',
    )
    .replace(
      /(?:[\s,.:;!?-]*\b(?:one|item|thing|for|about|of|to|on|at|from|my|the|a|an)\b)+$/gi,
      '',
    )
    .replace(/^[\s,.;:!?'"“”‘’:-]+|[\s,.;:!?'"“”‘’:-]+$/g, '')
    .trim();
  if (
    !hasDateTime &&
    /^(?:last|latest|recent|previous|that|this|it)$/i.test(recentCandidate)
  ) {
    return recentCandidate;
  }

  cleaned = cleaned
    .replace(
      /^(?:[\s,:-]*(?:my|the|a|an|this|that|it|our|called|titled|named|scheduled|for|about|of|to|on|at|from|in|around|by)\b)+/gi,
      '',
    )
    .replace(
      /(?:[\s,:-]*\b(?:called|titled|named|scheduled|for|about|of|to|on|at|from|in|around|by|my|the|a|an|this|that|it)\b)+$/gi,
      '',
    )
    .replace(/^[\s,.;:!?'"“”‘’:-]+|[\s,.;:!?'"“”‘’:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip leading "schedule for (a/an/the)" when followed by actual title words (e.g. "schedule for a coffee date" -> "coffee date")
  const withoutLeadingSchedule = cleaned
    .replace(
      /^(?:schedule|scheduled|plan|plans|item|items|activity|session)\s+(?:(?:for|to|about|on|at)\s+)?(?:(?:a|an|the|my)\s+)?/i,
      '',
    )
    .trim();
  if (
    withoutLeadingSchedule.length > 0 &&
    withoutLeadingSchedule.toLowerCase() !== cleaned.toLowerCase()
  ) {
    cleaned = withoutLeadingSchedule;
  } else if (
    hasDateTime &&
    /^(?:schedule|scheduled|calendar|agenda|plan|plans|item|items|thing|things|activity|anything|everything|something|what|reminder|reminders|task|tasks)$/i.test(
      cleaned,
    )
  ) {
    // When a time or date was specified ("Cancel my 2pm schedule"), generic words shouldn't block time matching
    cleaned = '';
  }

  return cleaned;
}

/** Items that belong on the calendar as events when a time is given. */
const EVENT_NOUN =
  /\b(?:exams?|midterms?|finals?\s+exams?|prelims?|quiz(?:zes)?|appointments?|meetings?|interviews?|seminars?|consultations?|defen[cs]e|orientation|webinars?|recitals?|tryouts?|check-?ups?)\b/i;

/** Bare pronouns and fillers that never name a real item ("add it"). */
export const VAGUE_ITEM_TITLE =
  /^(?:it|that|this|them|those|these|one|something|anything|stuff|thing|things|item|the\s+thing)$/i;

const NOTE_CREATION_START =
  /^(?:(?:please\s+)?(?:take|create|add|make|save|write|jot)\s+(?:a\s+|an\s+|new\s+|quick\s+)?notes?\b|note\s*:|jot\s+down|note\s+down|isulat)/i;

/** "notify me at 5 to…" reads as "remind me at 5 to…" with a notification. */
const NOTIFY_LEAD = /^(\s*(?:please\s+)?)(?:just\s+)?notify\s+me\b/i;
/** "…, don't call me", "no call", "notification only", "just a notification". */
const NOTIFY_PHRASE =
  /[\s,;]*\b(?:(?:but|and)\s+)?(?:please\s+)?(?:(?:don'?t|do\s+not|no\s+need\s+to)\s+call(?:\s+me)?|(?:with\s+)?no\s+call|without\s+(?:a\s+)?call(?:ing)?(?:\s+me)?|(?:as\s+a\s+|by\s+|via\s+)?notification\s+only|(?:just|only)\s+(?:a\s+|send\s+(?:me\s+)?a\s+)?notification|(?:just|only)\s+notify(?:\s+me)?|as\s+a\s+notification)\b[.!]?/gi;

const REMINDER_CREATING_INTENTS = new Set([
  'create_reminder',
  'create_task',
  'create_time_block',
]);

/**
 * Finds a "Notify only" request (audit finding 16) and returns the command
 * without it. Null when the student did not ask for a notification.
 */
export function extractNotifyOnlyRequest(transcript: string): string | null {
  const text = transcript || '';
  let found = false;
  let stripped = text.replace(NOTIFY_LEAD, (_match, prefix: string) => {
    found = true;
    return `${prefix}remind me`;
  });
  stripped = stripped.replace(NOTIFY_PHRASE, () => {
    found = true;
    return '';
  });
  return found ? stripped.replace(/\s{2,}/g, ' ').trim() : null;
}

/** Deterministic Fast-Path NLU Intent Extractor. */
// ---------------------------------------------------------------------------
// Alarm plan A3: alarm commands. An alarm rings like a clock alarm (never a
// call) and lives in Tools → Alarms. A bare hour means the morning: "wake
// me up at 6" is 6 AM, and "6pm", "18:00" or "tonight" stay as said.
// ---------------------------------------------------------------------------

const ALARM_EVENING_WORDS =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:pm|p\.m\.?)|(?:1[3-9]|2[0-3]):\d{2}|tonight|evening|afternoon|night|noon)\b/i;

const ALARM_DAY_CODES: Record<string, string> = {
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
  sunday: 'SU',
};

const ALARM_REPEAT_PHRASE =
  /\b(?:(?:on|every|each)\s+)?(?:week\s?days?|weekends?|school\s+days?|every\s+day|everyday|daily|monday\s+(?:to|through|thru)\s+friday|(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?:\s*,\s*|\s+and\s+|\s*&\s*)?)+)/gi;

function alarmClock(
  text: string,
  referenceDate: Date,
): {date: string | null; time: string | null; matched: string[]} {
  if (!text.trim()) return {date: null, time: null, matched: []};
  const dt = parseDateAndTime(text, referenceDate);
  let time = dt.time;
  let date = dt.date;
  const matched = [...dt.matchedText];
  if (!time) {
    // "set an alarm for 6", "move my alarm to 7", "set an alarm for six".
    const bare =
      /\b(?:for|at|by|to)\s+(\d{1,2}|[a-z]+)(?::([0-5]\d))?(?=\s|$)/i.exec(
        text,
      ) || /^()(\d{1,2})(?::([0-5]\d))?(?=\s|$)/.exec(text.trim());
    const hourToken = bare ? bare[1] || bare[2] : null;
    const minutes = bare ? (bare[1] ? bare[2] : bare[3]) : null;
    const hour = hourToken ? parseNumberWordOrDigits(hourToken) : null;
    if (bare && hour !== null && hour >= 1 && hour <= 12) {
      time = `${String(hour).padStart(2, '0')}:${minutes || '00'}`;
      matched.push(bare[0]);
    }
  }
  if (
    time &&
    Number(time.slice(0, 2)) >= 13 &&
    !ALARM_EVENING_WORDS.test(text)
  ) {
    time = `${String(Number(time.slice(0, 2)) - 12).padStart(
      2,
      '0',
    )}${time.slice(2)}`;
    // A date that only came from reading the hour as today's evening is
    // dropped; the review rings it the next time that morning hour comes.
    if (!/\b(?:today|tomorrow|tonight)\b/i.test(text)) date = null;
  }
  // "every monday" names a repeat, not one date.
  if (
    date &&
    /\b(?:every|each)\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b|\bweek\s?days?\b|\bweekends?\b/i.test(
      text,
    )
  )
    date = null;
  return {date, time, matched};
}

/** The weekday repeat an alarm request names, as an RRULE, or null for once. */
export function alarmRepeatRule(text: string): string | null {
  const lower = text.toLowerCase();
  if (
    /\b(?:week\s?days?|school\s+days?|monday\s+(?:to|through|thru)\s+friday)\b/.test(
      lower,
    )
  )
    return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (/\bweekends?\b/.test(lower)) return 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU';
  if (/\beveryday\b/.test(lower)) return 'RRULE:FREQ=DAILY';
  const rule = extractRecurrenceRule(lower);
  if (rule) return rule;
  // "on mondays and wednesdays": plural days repeat.
  const plural = [
    ...lower.matchAll(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b/g,
    ),
  ].map(match => ALARM_DAY_CODES[match[1]]);
  return plural.length
    ? `RRULE:FREQ=WEEKLY;BYDAY=${[...new Set(plural)].join(',')}`
    : null;
}

const ALARM_FILLER =
  /\b(?:my|the|that|this|all|of|an?|for|at|on|in|by|to|and|me|please|set|alarms?|o'?clock|called|labell?ed|named|titled|ko|mo|yung|ang)\b/gi;

/** Whatever is left once the time, date and repeat words are taken out. */
function alarmLeftover(text: string, matched: readonly string[]): string {
  // Repeat phrases first, before a matched weekday splits "monday and wednesday".
  let rest = ` ${text} `.replace(ALARM_REPEAT_PHRASE, ' ');
  for (const piece of matched) {
    if (piece.trim())
      rest = rest.replace(new RegExp(escapeRegExp(piece), 'i'), ' ');
  }
  return rest
    .replace(/\b(?:today|tomorrow|tonight)(?:'s)?\b/gi, ' ')
    .replace(/'s\b/g, ' ')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?(?=\s|$)/gi, ' ')
    .replace(/[,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function alarmLabelFrom(
  text: string,
  matched: readonly string[],
): string | null {
  const rest = alarmLeftover(text, matched);
  const marked = /\b(?:called|labell?ed|named|titled|for|to)\s+(.+)$/i.exec(
    rest,
  );
  const label = (marked ? marked[1] : rest)
    .replace(ALARM_FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label || label.split(' ').length > 6) return null;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function alarmTarget(
  descriptor: string,
  tail: string,
  referenceDate: Date,
): {targetTime: string | null; targetTitle: string | null} {
  const source = `${descriptor} ${tail}`.trim();
  const clock = alarmClock(source, referenceDate);
  const label = alarmLabelFrom(source, clock.matched);
  return {targetTime: clock.time, targetTitle: label};
}

/** Words before "alarm" that say which alarm, never a whole other request. */
const alarmDescriptorOk = (pre: string): boolean =>
  pre.trim().split(/\s+/).filter(Boolean).length <= 5 &&
  !/\b(?:remind(?:er)?s?|tasks?|events?|notes?|blocks?|to|clock)\b/i.test(pre);

export function parseAlarmCommand(
  commandLower: string,
  transcript: string,
  referenceDate: Date,
): ExtractedIntent | null {
  const text = commandLower
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const namesAlarm =
    /\balarms?\b/.test(text) && !/\balarms?\s+clocks?\b/.test(text);
  // "wake me up at 6" asks for an alarm; "wake up at 7:30" alone stays a
  // to-do titled "Wake up", as before alarms existed.
  const wakeRequest = /^wake\s+me(?:\s+up)?\b/.test(text);
  if (!namesAlarm && !wakeRequest) return null;
  const base = {
    title: null,
    date: null,
    time: null,
    endTime: null,
    durationMinutes: null,
    category: 'Personal',
    details: null,
    snoozeMinutes: null,
    confidence: 0.95,
    source: 'fast_path' as const,
    rawTranscript: transcript,
  };

  if (namesAlarm) {
    // Questions: "what time is my alarm", "do I have an alarm tomorrow".
    if (
      /^(?:what|when|which|how\s+many)\b/.test(text) ||
      /^(?:show|list|check|see|view|open)\s+(?:me\s+)?(?:all\s+)?(?:of\s+)?(?:my|the)\s+(?:\w+\s+)?alarms?\b/.test(
        text,
      ) ||
      /^(?:do|did|have)\s+i\b/.test(text) ||
      /^(?:is|are)\s+(?:my|there|the)\b/.test(text) ||
      /^(?:my|all\s+my)\s+alarms?$/.test(text)
    ) {
      return {...base, intent: 'list_alarms'};
    }

    // On or off: "turn off my 6am alarm", "turn my alarm off", "disable the gym alarm".
    let enabled: boolean | null = null;
    let descriptor = '';
    let tail = '';
    let match = /^(?:turn|switch)\s+(off|on)\s+(.*?)\balarms?\b(.*)$/.exec(
      text,
    );
    if (match) {
      enabled = match[1] === 'on';
      descriptor = match[2];
      tail = match[3];
    } else if (
      (match =
        /^(?:turn|switch)\s+(.*?)\balarms?\s+(?:back\s+)?(off|on)\b(.*)$/.exec(
          text,
        ))
    ) {
      enabled = match[2] === 'on';
      descriptor = match[1];
      tail = match[3];
    } else if (
      (match =
        /^(disable|enable|deactivate|activate|pause|unpause|resume|mute|silence)\s+(.*?)\balarms?\b(.*)$/.exec(
          text,
        ))
    ) {
      enabled = /^(?:enable|activate|unpause|resume)$/.test(match[1]);
      descriptor = match[2];
      tail = match[3];
    }
    if (enabled !== null && alarmDescriptorOk(descriptor)) {
      return {
        ...base,
        intent: 'toggle_alarm',
        alarmEnabled: enabled,
        ...alarmTarget(descriptor, tail, referenceDate),
      };
    }

    match =
      /^(?:delete|remove|cancel|clear|erase|get\s+rid\s+of)\s+(.*?)\balarms?\b(.*)$/.exec(
        text,
      );
    if (match && alarmDescriptorOk(match[1])) {
      return {
        ...base,
        intent: 'delete_alarm',
        ...alarmTarget(match[1], match[2], referenceDate),
      };
    }

    match = /^(?:rename|relabel)\s+(.*?)\balarms?\s+(?:to|as)\s+(.+)$/.exec(
      text,
    );
    if (match && alarmDescriptorOk(match[1])) {
      const label = match[2].trim();
      return {
        ...base,
        intent: 'update_alarm',
        newTitle: label.charAt(0).toUpperCase() + label.slice(1),
        ...alarmTarget(match[1], '', referenceDate),
      };
    }

    // "change my 6am alarm to 6:30", "move my alarm to 7", "set my 6am alarm to weekdays".
    match =
      /^(change|move|reschedule|update|push|adjust|edit|set|make)\s+(?:my|the|that|this)\s+(.*?)\balarms?\s+(?:to|for|at|into|on)\s+(.+)$/.exec(
        text,
      );
    if (match && alarmDescriptorOk(match[2])) {
      const isSetVerb = /^(?:set|make)$/.test(match[1]);
      const target = alarmTarget(match[2], '', referenceDate);
      if (!isSetVerb || target.targetTime || target.targetTitle) {
        const clock = alarmClock(match[3], referenceDate);
        return {
          ...base,
          intent: 'update_alarm',
          date: clock.date,
          time: clock.time,
          recurrenceRule: alarmRepeatRule(match[3]) || undefined,
          ...target,
        };
      }
    }

    // "set an alarm for 6", "set a 5:30 alarm on weekdays", "alarm at 7 tomorrow".
    match =
      /^(?:set|add|create|make|put|schedule|program)\s+(?:up\s+)?(?:me\s+)?(.*?)\balarms?\b(.*)$/.exec(
        text,
      ) || /^()alarms?\s+((?:at|for|on|tomorrow|every|this)\b.*)$/.exec(text);
    if (match && alarmDescriptorOk(match[1])) {
      const rest = `${match[1]} ${match[2]}`.trim();
      const clock = alarmClock(rest, referenceDate);
      return {
        ...base,
        intent: 'create_alarm',
        title: alarmLabelFrom(rest, clock.matched),
        date: clock.date,
        time: clock.time,
        recurrenceRule: alarmRepeatRule(rest) || undefined,
      };
    }
    return null;
  }

  // "wake me up at 6 on weekdays", "wake me at 5:30 tomorrow".
  const rest = text.replace(/^wake\s+me(?:\s+up)?\b/, '').trim();
  const clock = alarmClock(rest, referenceDate);
  return {
    ...base,
    intent: 'create_alarm',
    title: alarmLabelFrom(rest, clock.matched) || 'Wake up',
    date: clock.date,
    time: clock.time,
    recurrenceRule: alarmRepeatRule(rest) || undefined,
  };
}

export function parseIntentFastPath(
  transcript: string,
  referenceDate: Date = new Date(),
): ExtractedIntent {
  const notifyCommand = extractNotifyOnlyRequest(transcript);
  if (notifyCommand) {
    const parsed = parseIntentWithoutDelivery(notifyCommand, referenceDate);
    if (REMINDER_CREATING_INTENTS.has(parsed.intent)) {
      return {...parsed, deliveryStyle: 'notify', rawTranscript: transcript};
    }
  }
  return parseIntentWithoutDelivery(transcript, referenceDate);
}

function parseIntentWithoutDelivery(
  transcript: string,
  referenceDate: Date,
): ExtractedIntent {
  const rawTrimmed = (transcript || '').trim();
  // Personal memory statements, recall queries, and forget-memory requests must
  // never be misparsed as notes, tasks, or time blocks (e.g. "im an night owl,
  // i prefer studying at night till 1am").
  if (
    rawTrimmed &&
    (extractExplicitMemory(rawTrimmed) ||
      isMemoryRecallQuery(rawTrimmed) ||
      isForgetAllMemoriesRequest(rawTrimmed) ||
      extractForgetSpecificMemoryQuery(rawTrimmed))
  ) {
    return {
      intent: 'chat',
      title: null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: detectCategory(rawTrimmed),
      details: transcript,
      snoozeMinutes: null,
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }
  // Offline Taglish: translate the planner words, never a note's own text.
  const taglish = NOTE_CREATION_START.test(rawTrimmed)
    ? null
    : translateTaglishCommand(transcript);
  if (taglish) {
    return {
      ...parseEnglishIntent(taglish, referenceDate),
      rawTranscript: transcript,
    };
  }
  return parseEnglishIntent(transcript, referenceDate);
}

function parseEnglishIntent(
  transcript: string,
  referenceDate: Date,
): ExtractedIntent {
  const normalized = normalizeSpeech(transcript);
  const lower = normalized.toLowerCase();

  // Strip polite/conversational invocation prefixes for command matching ("Hey Lafina, can you please...", "I want to...", "So let's...")
  const commandLower = stripConversationalCommandPrefix(lower);
  const commandRaw = stripConversationalCommandPrefix(normalized);

  // 1. Call Responses / Acknowledge
  const isAck =
    /^(?:i(?:'m| am)? done|i did it|finished|got it|okay|ok|understood|acknowledged|thanks?)(?:[,.!\s]+(?:thanks?|bye))?[\s.!,]*$/i.test(
      lower,
    );
  const ackMatch =
    /^(?:i(?:'ve| have)?\s+already\s+|i\s+)?acknowledged?(?:\s+(?:the|my|this))?(?:\s+(event|task|reminder|call\s*reminder))?(?:\s+(.+))?[\s.!,]*$/i.exec(
      commandRaw,
    );
  if (isAck || ackMatch) {
    const rawEntity = ackMatch ? ackMatch[1]?.toLowerCase() : undefined;
    const entityType: 'event' | 'task' | 'reminder' | undefined =
      rawEntity === 'event'
        ? 'event'
        : rawEntity === 'task'
        ? 'task'
        : rawEntity && rawEntity.includes('reminder')
        ? 'reminder'
        : undefined;
    const rawTarget =
      ackMatch && ackMatch[2] ? cleanCrudTargetTitle(ackMatch[2]) : null;
    const formattedTarget = rawTarget
      ? rawTarget.charAt(0).toUpperCase() + rawTarget.slice(1)
      : null;
    return {
      intent: 'acknowledge',
      title: formattedTarget,
      targetTitle: formattedTarget,
      targetEntityType: entityType,
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
  const snoozeMatch =
    /^\s*(?:please\s+)?(?:snooze(?:\s+for)?|give me|remind me in)\s*([a-z0-9-]+)?\s*(?:minute|minutes|min|mins)?[\s.!,]*$/i.exec(
      lower,
    );
  if (snoozeMatch || /^\s*snooze\b/i.test(lower)) {
    const parsedMins =
      snoozeMatch && snoozeMatch[1]
        ? parseNumberWordOrDigits(snoozeMatch[1])
        : null;
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

  // Alarms (alarm plan A3) before reminders, queries and edits, which would
  // otherwise read "alarm" as a reminder.
  const alarmCommand = parseAlarmCommand(
    commandLower,
    transcript,
    referenceDate,
  );
  if (alarmCommand) return alarmCommand;

  const base = {
    date: null,
    time: null,
    endTime: null,
    durationMinutes: null,
    snoozeMinutes: null,
    confidence: 0.95,
    source: 'fast_path' as const,
    rawTranscript: transcript,
  };

  // 2b. Planning requests are questions, never items to save ("plan my week
  // around my exams" must not become a task titled "My Week Around My Exams").
  if (
    /^(?:(?:can|could|would)\s+you\s+)?(?:help\s+me\s+)?(?:plan|map)\s+(?:out\s+)?(?:my|the|this|next|our)\s+(?:whole\s+)?(?:week|day|days|weekend|month|semester|schedule|study\s+schedule|review(?:\s+schedule)?|exam\s+week)\b|^(?:(?:can|could|would)\s+you\s+)?help\s+me\s+(?:plan|organi[sz]e|prioriti[sz]e|figure\s+out|decide|manage)\b/i.test(
      commandLower,
    )
  ) {
    return {
      ...base,
      intent: 'chat',
      title: null,
      category: detectCategory(normalized),
      details: transcript,
      confidence: 0.9,
    };
  }

  // 2c. Free time ("find a free slot tomorrow for 2 hours of studying").
  if (
    /\b(?:find|any|get|show|look\s+for|suggest|give)\s+(?:me\s+)?(?:an?\s+|some\s+|the\s+)?(?:free|open|available|empty)\s+(?:slots?|time(?:\s+slots?)?|times|windows?|hours?|blocks?|periods?)\b|\bwhen\s+(?:am\s+i|are\s+we)\s+free\b|\bwhen\s+can\s+i\s+(?:study|fit|squeeze|schedule)\b|\b(?:do\s+i\s+have|is\s+there)\s+(?:any\s+)?(?:free|open)\s+(?:time|slots?)\b/i.test(
      commandLower,
    )
  ) {
    const dt = parseDateAndTime(normalized, referenceDate);
    return {
      ...base,
      intent: 'query_schedule',
      title: null,
      date: dt.date || formatLocalDate(referenceDate),
      durationMinutes: dt.durationMinutes,
      category: 'Academic',
      details: 'free_slots',
    };
  }

  // 2d. Overdue work ("show overdue tasks", "what am I behind on").
  if (
    /\b(?:overdue|past[\s-]+due|late)\s+(?:tasks?|to-?dos?|todos?|to\s+dos?|assignments?|homework|work|items?)\b|\b(?:tasks?|to-?dos?|todos?|assignments?|homework)\s+(?:(?:that\s+)?(?:are|is)\s+(?:still\s+)?)?(?:overdue|past\s+due|late)\b|\b(?:is\s+)?any(?:thing)?\s+(?:overdue|past\s+due)\b|\bwhat(?:'s|s|\s+is|\s+am\s+i)\s+(?:overdue|behind(?:\s+on)?)\b|\bam\s+i\s+behind\b|^(?:show|list|check)\s+(?:my\s+)?overdue\b/i.test(
      commandLower,
    )
  ) {
    return {
      ...base,
      intent: 'query_schedule',
      title: null,
      date: formatLocalDate(referenceDate),
      category: 'Academic',
      details: 'overdue',
    };
  }

  // 2e. What comes next ("what's my next class", "what's next").
  const nextMatch =
    /\b(?:what(?:'s|s|\s+is)|when(?:'s|s|\s+is)|where(?:'s|s|\s+is)|show|tell\s+me|read)\s+(?:me\s+)?(?:my\s+|the\s+)?next\s*(class|lecture|subject|event|exam|quiz|meeting|appointment|task|deadline|thing|item|schedule)?\b|^next\s+(class|lecture|event|exam|task)\b/i.exec(
      commandLower,
    );
  if (nextMatch) {
    const kind = (nextMatch[1] || nextMatch[2] || '').toLowerCase();
    return {
      ...base,
      intent: 'query_schedule',
      title: null,
      date: formatLocalDate(referenceDate),
      category: 'Academic',
      details:
        kind === 'class' || kind === 'lecture' || kind === 'subject'
          ? 'next_class'
          : kind === 'task' || kind === 'deadline'
          ? 'next_task'
          : 'next_item',
    };
  }

  // 2f. Searching notes by topic ("what did I write about physics?").
  const noteSearchMatch =
    /\bwhat\s+(?:did|have)\s+i\s+(?:write|written|wrote|note|noted|jot|jotted|save|saved|put)(?:\s+down)?\s+(?:about|on|regarding|for|in)\s+['"“]?([^'"”?.!]+)/i.exec(
      commandLower,
    ) ||
    /\b(?:search|find|look\s+(?:up|for))\s+(?:in\s+|through\s+)?(?:my\s+|the\s+)?notes?\s+(?:for|about|on)\s+['"“]?([^'"”?.!]+)/i.exec(
      commandLower,
    ) ||
    /\b(?:search\s+for|find|look\s+for)\s+['"“]?([^'"”?.!]+?)['"”]?\s+in\s+(?:my\s+|the\s+)?notes?\b/i.exec(
      commandLower,
    ) ||
    /\b(?:summari[sz]e|recap)\s+(?:my\s+|the\s+)?notes?\s+(?:about|on|for)\s+['"“]?([^'"”?.!]+)/i.exec(
      commandLower,
    );
  if (noteSearchMatch) {
    const topic = noteSearchMatch[1]
      .replace(/^(?:my|the|a|an)\s+/i, '')
      .replace(/\s+(?:notes?|please|lafina)$/i, '')
      .trim();
    if (topic && !/^(?:it|that|this|them|everything|anything)$/i.test(topic)) {
      return {
        ...base,
        intent: 'query_notes',
        title: topic,
        category: detectCategory(topic),
        details: topic,
      };
    }
  }

  // 2g. Bulk removal. Always a review card that lists every item first.
  if (
    /^(?:clear|delete|remove|erase|wipe|get\s+rid\s+of)\s+(?:out\s+)?(?:all\s+)?(?:of\s+)?(?:my\s+|the\s+)?(?:completed|finished|done|checked(?:[\s-]+off)?|ticked(?:\s+off)?)\s+(?:tasks?|to-?dos?|todos?|to\s+dos?|items?)\b/i.test(
      commandLower,
    )
  ) {
    return {
      ...base,
      intent: 'delete_task',
      title: 'Completed tasks',
      targetTitle: 'Completed tasks',
      targetEntityType: 'task',
      bulkScope: 'completed_tasks',
      category: 'Academic',
      details: null,
    };
  }
  const bulkDateMatch =
    /^(?:clear|delete|remove|cancel|erase|wipe)\s+(?:out\s+)?(?:(all|everything)\s+)?(?:(?:of\s+)?(?:my|the)\s+)?(?:(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:'s|s)?\s+)?(events|appointments|time\s*blocks|blocks|classes|tasks|to-?dos|todos|plans|schedule|calendar|everything)\b(?:\s+(?:for|on)\s+)?(.*)$/i.exec(
      commandLower,
    );
  if (bulkDateMatch) {
    const dayWord = bulkDateMatch[2] || '';
    const rest = bulkDateMatch[4] || '';
    const dt = parseDateAndTime(`${dayWord} ${rest}`, referenceDate);
    const noun = bulkDateMatch[3].toLowerCase();
    const hasAll = Boolean(bulkDateMatch[1]) || noun === 'everything';
    if (
      dt.date &&
      (hasAll ||
        dayWord ||
        /^(?:today|tomorrow|tonight|on\s|this\s|next\s|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(
          rest.trim(),
        ))
    ) {
      const entity: CrudTargetEntityType = /event|appointment/.test(noun)
        ? 'event'
        : /block|class/.test(noun)
        ? 'time_block'
        : /task|to-?do|todo/.test(noun)
        ? 'task'
        : 'any';
      return {
        ...base,
        intent: entity === 'task' ? 'delete_task' : 'delete_time_block',
        title: `Items on ${dt.date}`,
        targetTitle: `Items on ${dt.date}`,
        targetEntityType: entity,
        bulkScope: 'date_items',
        date: dt.date,
        category: 'Academic',
        details: null,
      };
    }
  }

  // 2h. Adding to an existing checklist or list note ("add rice to my
  // groceries checklist"). Never the To-Do list, which holds tasks.
  const listAddMatch =
    /^(?:add|put|include|append)\s+(.+?)\s+(?:to|on|in|into|onto)\s+(?:my\s+|the\s+)?(.+?)\s+(checklist|check\s*list|list|note)$/i.exec(
      commandLower.replace(/[.!?]+$/, ''),
    );
  if (
    listAddMatch &&
    !/^(?:to-?do|to\s+do|todo|task|tasks|reading)$/i.test(
      listAddMatch[2].trim(),
    )
  ) {
    const items = listAddMatch[1]
      .split(/\s*,\s*|\s+and\s+/i)
      .map(item => item.replace(/^(?:some|a|an|the)\s+/i, '').trim())
      .filter(Boolean)
      .map(item => item.charAt(0).toUpperCase() + item.slice(1));
    const listName = listAddMatch[2].trim();
    if (items.length > 0 && listName) {
      const targetTitle = listName.charAt(0).toUpperCase() + listName.slice(1);
      return {
        ...base,
        intent: 'update_note',
        title: targetTitle,
        targetTitle,
        targetEntityType: 'note',
        checklistItems: items,
        category: 'APPEND',
        details: null,
      };
    }
  }

  // 2i. A reminder tied to an item ("remind me 30 minutes before my math exam").
  const leadMatch = new RegExp(
    `^(?:remind\\s+me|set\\s+(?:a\\s+)?reminder|ping\\s+me|alert\\s+me)\\s+(?:about\\s+(?:my\\s+|the\\s+)?(.+?)\\s+)?(?:(an?|${NUM_WORDS_PATTERN})\\s*(minutes?|mins?|hours?|hrs?)|(half\\s+an?\\s+hour))\\s+(?:before|ahead\\s+of|prior\\s+to)\\s+(?:my\\s+|the\\s+)?(.+?)(?:\\s+(?:starts?|begins?))?[.!?]*$`,
    'i',
  ).exec(commandLower);
  if (leadMatch) {
    const amountToken = leadMatch[2];
    const unit = (leadMatch[3] || '').toLowerCase();
    let minutes: number | null = null;
    if (leadMatch[4]) minutes = 30;
    else if (amountToken) {
      const amount = /^an?$/i.test(amountToken)
        ? 1
        : parseNumberWordOrDigits(amountToken);
      if (amount !== null && amount > 0) {
        minutes =
          unit.startsWith('hour') || unit.startsWith('hr')
            ? amount * 60
            : amount;
      }
    }
    const rawTarget = (leadMatch[5] || '').trim();
    const target =
      rawTarget && !/^(?:it|that|this)$/i.test(rawTarget)
        ? rawTarget
        : (leadMatch[1] || '').trim();
    if (minutes && minutes <= 7 * 24 * 60 && target) {
      const targetTitle = target.charAt(0).toUpperCase() + target.slice(1);
      return {
        ...base,
        intent: 'create_reminder',
        title: targetTitle,
        targetTitle,
        leadMinutes: minutes,
        category: detectCategory(targetTitle),
        details: null,
      };
    }
  }

  // 3. Schedule Audit & Schedule Query
  // Must run BEFORE CRUD/Creation intents unless the utterance starts with an explicit creation/mutation command
  const isExplicitMutationStart =
    /^(?:remind\s+me|set\s+(?:a\s+|an\s+|up\s+)?(?:reminder|task|event|time\s*block|meeting|appointment|class|session)|add\s+|put\s+|create\s+|make\s+|schedule\s+(?!audit\b|(?:for\s+)?(?:today|to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[\s.!?]*$)|book\s+|plan\s+|(?:to-?do|to\s+do|todo)(?:\s+list)?\s*[:,-]\s*\S|take\s+(?:a\s+)?note|save\s+(?:a\s+)?note|note\s+down|write\s+down|jot\s+down|cancel\b|remove\b|delete\b|clear\b|erase\b|drop\b|scratch\b|discard\b|unschedule\b|wipe\b|get\s+rid\s+of\b|take\s+off\b|call\s+off\b|cross\s+off\b|cross\s+out\b|check\s+off\b|tick\s+off\b|update\s+|edit\s+|rename\s+|reschedule\s+|move\s+|postpone\s+|push\s+back\s+|complete\s+|finish\s+|mark\s+)/i.test(
      commandLower,
    );

  const isScheduleQuery =
    /\b(?:what(?:'s|s| is| are) (?:on |in |for )?(?:my |the )?(?:(?:pending|open|remaining|unfinished|incomplete)\s+)?(?:schedule|calendar|agenda|plans?|tasks?|todos?|to-?dos?(?:\s+list)?|to\s+dos?(?:\s+list)?|checklists?|events?|time\s*blocks?|blocks?|reminders?|classes?)|what(?:'s|s| is) (?:happening|upcoming|planned|scheduled|on\s+deck)|what (?:do i have|have i got|i have|am i doing|do i need to do)|what (?:(?:pending|open|remaining|unfinished|incomplete)\s+)?(?:tasks?|todos?|to-?dos?|to\s+dos?|checklists?|events?|time\s*blocks?|blocks?|reminders?|classes?|plans?|items?) (?:do i have|have i got|i have|are due|are scheduled|are on|are left|are pending)|what does my (?:day|schedule|calendar|morning|afternoon|evening|week|to-?do(?:\s+list)?) look|how(?:'s|s| is| does) my (?:schedule|day|calendar|agenda|to-?do(?:\s+list)?)(?: look(?:ing)?)?|do i have (?:anything(?:(?:\s+(?:on|in)\s+(?:my\s+|the\s+)?(?:to-?do|to\s+do|todo)(?:\s+list)?))?|any (?:(?:pending|open|remaining|unfinished|incomplete)\s+)?(?:tasks?|todos?|to-?dos?|to\s+dos?|checklists?|events?|time\s*blocks?|blocks?|reminders?|classes?|plans?))|is there anything (?:on |in |for )?(?:my |the )?(?:schedule|calendar|agenda|to-?do(?:\s+list)?|todo\s+list)|is anything (?:scheduled|planned|due|pending)|am i (?:free|busy|available)|(?:audit|check|show|tell(?:\s+me)?|give(?:\s+me)?|read(?:\s+out)?|list|get|view|review|summarize|brief(?:\s+me(?:\s+on)?)?)(?:\s+(?:me|you|us))?\s+(?:what(?:'s|s| is| are)\s+(?:on\s+|in\s+)?)?(?:everything|all|a\s+|my\s+|the\s+|today'?s\s+|tomorrow'?s\s+)?(?:(?:pending|open|remaining|unfinished|incomplete)\s+)?(?:schedule(?:\s+audit)?|calendar|agenda|tasks?|todos?|to-?dos?(?:\s+list)?|to\s+dos?(?:\s+list)?|checklists?|time\s*blocks?|plans?|events?|scheduled|planned)|(?:show|tell|list|view|read|summarize|give)\s+(?:me|you|us\s+)?(?:everything|all|what(?:'s|\s+is))\s+(?:that(?:'s|\s+is)\s+)?(?:scheduled|planned|on\s+(?:my\s+|the\s+)?(?:schedule|calendar|agenda|to-?do(?:\s+list)?|todo\s+list))|(?:everything|anything)\s+scheduled\s+(?:for\s+)?(?:this|next)\s+week|(?:this|next)\s+week(?:'?s)?\s+(?:schedule|agenda|calendar|plans?|tasks?)|what\s+do\s+i\s+have\s+(?:scheduled\s+)?(?:this|next)\s+week|schedule\s+audit|my\s+schedule|my\s+to-?do(?:\s+list)?|today'?s\s+schedule|tomorrow'?s\s+schedule|^schedule\s+(?:for\s+)?(?:today|to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|any\s+(?:plans?|tasks?|to-?dos?|todos?|events?|time\s*blocks?|classes?)\s+(?:for\s+|on\s+)?(?:today|to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr|tonight))\b/i.test(
      commandLower,
    );

  if (isScheduleQuery && !isExplicitMutationStart) {
    const isThisWeek =
      /\b(?:this\s+week|for\s+the\s+week|upcoming\s+week)\b/i.test(
        commandLower,
      );
    const isNextWeek = /\b(?:next\s+week)\b/i.test(commandLower);
    const dateRange: 'this_week' | 'next_week' | null = isNextWeek
      ? 'next_week'
      : isThisWeek
      ? 'this_week'
      : null;

    const dt = parseDateAndTime(normalized, referenceDate);
    const targetDate = dt.date || formatLocalDate(referenceDate);
    const isTodoFocusQuery =
      !dateRange &&
      /\b(?:todos?(?:\s+list)?|to-?dos?(?:\s+list)?|to\s+dos?(?:\s+list)?|checklists?|undated(?:\s+tasks?)?|(?:pending|open|remaining|unfinished|incomplete)\s+tasks?|tasks?\s+(?:that\s+)?(?:are\s+)?pending)\b/i.test(
        commandLower,
      );
    return {
      intent: 'query_schedule',
      title: null,
      date: targetDate,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: isTodoFocusQuery
        ? dt.matchedText.length > 0
          ? 'todo_list_dated'
          : 'todo_list'
        : null,
      snoozeMinutes: null,
      confidence: 0.96,
      source: 'fast_path',
      rawTranscript: transcript,
      dateRange,
    };
  }

  // 3b. Notes Query & Search (e.g. "check my notes about grocery list", "what are my notes", "find my note on physics", "read my note about...", etc.)
  const isExplicitNoteQuery =
    /\b(?:check|find|search|look\s+(?:up|for)|read(?:\s+out)?|show|view|open|get|list|display)\s+(?:me\s+)?(?:all\s+|any\s+|my\s+|the\s+)?notes?\b/i.test(
      commandLower,
    ) ||
    /\b(?:check|find|search|look\s+(?:up|for)|read(?:\s+out)?|show|view|open|get)\s+(?:my\s+|the\s+)?([a-z0-9\s_-]+?)\s+notes?\b/i.test(
      commandLower,
    ) ||
    /\b(?:what(?:'s|s| is| are)|what\s+do\s+i\s+have)\s+(?:in\s+|on\s+)?(?:my\s+|the\s+)?notes?\b/i.test(
      commandLower,
    ) ||
    /\bwhat\s+(?:did\s+i\s+write|is\s+written)\s+(?:in|about|on)\s+(?:my\s+|the\s+)?notes?\b/i.test(
      commandLower,
    ) ||
    /\b(?:do\s+i\s+have\s+any|any)\s+notes?\b/i.test(commandLower) ||
    /\bnotes?\s+(?:about|on|for|regarding)\b/i.test(commandLower);

  if (isExplicitNoteQuery && !isExplicitMutationStart) {
    let noteTopic: string | null = null;

    // Pattern 1: notes? (about|on|for|regarding|titled|named) <topic>
    const matchAbout = commandLower.match(
      /\bnotes?\s+(?:about|on|for|regarding|titled|named|with)\s+['"“]?([^'"”?.!]+)['"”]?/i,
    );
    if (matchAbout) {
      noteTopic = matchAbout[1].trim();
    } else {
      // Pattern 2: (check|find|search|look up|read|show|view|open|get) (my|the)? <topic> notes?
      const matchTopicNote = commandLower.match(
        /\b(?:check|find|search|look\s+(?:up|for)|read(?:\s+out)?|show|view|open|get)\s+(?:my\s+|the\s+)?['"“]?([^'"”?.!]+?)['"”]?\s+notes?\b/i,
      );
      if (
        matchTopicNote &&
        !/^(?:all|any|the|my|these|those)$/i.test(matchTopicNote[1].trim())
      ) {
        noteTopic = matchTopicNote[1].trim();
      } else {
        // Pattern 3: what's in my <topic> note
        const matchWhatsIn = commandLower.match(
          /\bwhat(?:'s|s| is)\s+(?:in|on)\s+(?:my\s+|the\s+)?['"“]?([^'"”?.!]+?)['"”]?\s+notes?\b/i,
        );
        if (
          matchWhatsIn &&
          !/^(?:all|any|the|my)$/i.test(matchWhatsIn[1].trim())
        ) {
          noteTopic = matchWhatsIn[1].trim();
        }
      }
    }

    if (noteTopic) {
      noteTopic = noteTopic
        .replace(/^(?:all\s+my|all\s+the|all|the|a|an|my)\s+/i, '')
        .replace(/\s+(?:please|lafina)$/i, '')
        .trim();
      if (
        /^(?:all|any|the|my|these|those|saved|active|recent)$/i.test(
          noteTopic,
        ) ||
        !noteTopic
      ) {
        noteTopic = null;
      }
    }

    return {
      intent: 'query_notes',
      title: noteTopic || null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: noteTopic || null,
      snoozeMinutes: null,
      confidence: 0.96,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 4. Conversational greetings & chatbot inquiries ("What are you", "Who are you", "What can you do", etc.)
  const isIdentityOrChatbotQuery =
    /^(?:(?:what|who)\s+(?:are|is)\s+(?:you|lafina)|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself|who\s+made\s+you|are\s+you\s+(?:an?\s+)?(?:ai|bot|assistant)|what(?:'s|\s+is)\s+your\s+name|how\s+are\s+you|who\s+are\s+u|what\s+are\s+u)\b/i.test(
      commandLower,
    );
  const isGreeting =
    /^(?:hey|hi|hello|good\s+morning|good\s+afternoon|good\s+evening|sup|what'?s\s+up)\b/i.test(
      lower,
    ) && lower.split(' ').length <= 4;

  if (isGreeting || isIdentityOrChatbotQuery) {
    return {
      intent: 'chat',
      title: null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Personal',
      details: isIdentityOrChatbotQuery ? 'Identity' : 'Greeting',
      snoozeMinutes: null,
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 5. CRUD: Delete / Cancel / Remove Time Block, Event, Task, Reminder, or Note
  const isCreationStart =
    /^(?:remind\s+me|set\s+(?:a\s+|an\s+|new\s+)?reminder|(?:create|add|make|take|save|write|jot|put)\s+(?:a\s+|an\s+|new\s+|quick\s+)?(?:note|task|todo|to-?do|to\s+do|time\s*block|timeblock|study\s*block|event)|(?:add|put|create)\s+.+\s+(?:to|on|onto|into)\s+(?:my\s+|the\s+)?(?:todos?|to-?dos?|to\s+dos?)(?:\s+list)?|(?:to-?do|to\s+do|todo)(?:\s+list)?\s*[:,-]|note\s+down|write\s+down|jot\s+down)\b/i.test(
      commandLower,
    );
  const isDeleteCommand =
    /^(?:cancel|remove|delete|clear|erase|drop|scratch|discard|unschedule|wipe|get\s+rid\s+of|take\s+off|call\s+off|cross\s+off|cross\s+out)\b/i.test(
      commandLower,
    ) ||
    (!isCreationStart &&
      (/(?:,\s*|\s+and\s+|\s+please\s+|\s+)(?:cancel|delete|remove|unschedule)\s+(?:it|that|this|them)[\s.!?]*$/i.test(
        commandLower,
      ) ||
        /\b(?:cancel|delete|remove|unschedule)\s+(?:my|the|this|that|all)\s+(?:tasks?|todos?|to-?dos?|to\s+dos?|events?|appointments?|time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|blocks?|reminders?|alarms?|schedule|plans?|notes?)\b/i.test(
          commandLower,
        )));
  if (isDeleteCommand) {
    const {entityType, deleteIntent} = classifyCrudEntityType(commandLower);
    const dt =
      deleteIntent === 'delete_note'
        ? {
            date: null,
            time: null,
            endTime: null,
            durationMinutes: null,
            matchedText: [],
          }
        : parseDateAndTime(normalized, referenceDate);
    const hasDateTime = Boolean(dt.time || dt.date);
    const targetTitle = cleanCrudTargetTitle(
      normalized,
      dt.matchedText,
      hasDateTime,
    );
    const formattedTarget = targetTitle
      ? targetTitle.charAt(0).toUpperCase() + targetTitle.slice(1)
      : null;

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
  const isNegativeCompletion =
    /\b(?:not\s+done|incomplete|undone|uncompleted|still\s+pending)\b/i.test(
      commandLower,
    );
  const markDoneMatch = isNegativeCompletion
    ? null
    : /\bmark\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)\b/i.exec(
        commandLower,
      ) ||
      /^(?:complete|finish|check\s+off|tick\s+off)\s+(?:(?:my|the|a|an)\s+)?(?:(?:task|todo|to-?do|to\s+do)\s+)(.+)$/i.exec(
        commandLower,
      ) ||
      /^(?:complete|check\s+off|tick\s+off)\s+(?:(?:my|the)\s+)(.+)$/i.exec(
        commandLower,
      ) ||
      /^(?:check\s+off|tick\s+off)\s+(.+)$/i.exec(commandLower) ||
      /^(?:i(?:'m| am)?\s+done\s+with|i\s+(?:already\s+)?finished)\s+(?:(?:my|the|a|an)\s+)?(?:(?:task|event|todo|to-?do|to\s+do)\s+)?(.+)$/i.exec(
        commandLower,
      );
  if (markDoneMatch) {
    const rawTarget = markDoneMatch[1];
    const targetTitle = cleanCrudTargetTitle(rawTarget);
    const formattedTarget = targetTitle
      ? targetTitle.charAt(0).toUpperCase() + targetTitle.slice(1)
      : null;
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

  // 6b. CRUD: Reopen / Uncheck / Mark Task Not Done
  const reopenMatch =
    /\bmark\s+(.+?)\s+as\s+(?:not\s+done|incomplete|undone|uncompleted|open|pending)\b/i.exec(
      commandLower,
    ) ||
    /^(?:reopen|unmark|uncheck|untick)\s+(?:(?:my|the|a|an)\s+)?(?:(?:task|todo|to-?do|to\s+do)\s+)?(.+)$/i.exec(
      commandLower,
    );
  if (reopenMatch) {
    const targetTitle = cleanCrudTargetTitle(reopenMatch[1]);
    const formattedTarget = targetTitle
      ? targetTitle.charAt(0).toUpperCase() + targetTitle.slice(1)
      : null;
    if (formattedTarget) {
      return {
        intent: 'update_task',
        title: formattedTarget,
        targetTitle: formattedTarget,
        targetEntityType: 'task',
        isCompleted: false,
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

  // 6c. CRUD: Pin / Unpin Note
  const pinMatch =
    /^(?:(pin|unpin))\s+(?:(?:my|the|a|an)\s+)?(?:notes?\s+(?:(?:called|titled|named|about)\s+)?)?(.+)$/i.exec(
      commandLower,
    );
  if (pinMatch) {
    const isPinned = pinMatch[1].toLowerCase() === 'pin';
    const targetTitle = cleanCrudTargetTitle(pinMatch[2]);
    const formattedTarget = targetTitle
      ? targetTitle.charAt(0).toUpperCase() + targetTitle.slice(1)
      : null;
    if (formattedTarget) {
      return {
        intent: 'update_note',
        title: formattedTarget,
        targetTitle: formattedTarget,
        targetEntityType: 'note',
        isPinned,
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

  // 6d. CRUD: Update Task Priority ("set physics homework priority to high")
  const priorityUpdateMatch =
    /^(?:set|change|update|make)\s+(?:the\s+)?(?:priority\s+of\s+)?(?:(?:my|the|a|an)\s+)?(?:(?:task|todo|to-?do|to\s+do)\s+)?(.+?)(?:\s+priority)?\s+(?:to|as)\s+(high|medium|low|urgent|normal)(?:\s+priority)?$/i.exec(
      commandLower,
    );
  if (priorityUpdateMatch) {
    const rawTarget = cleanCrudTargetTitle(priorityUpdateMatch[1]);
    const formattedTarget = rawTarget
      ? rawTarget.charAt(0).toUpperCase() + rawTarget.slice(1)
      : null;
    const rawPrio = priorityUpdateMatch[2].toLowerCase();
    const priority: 'High' | 'Medium' | 'Low' =
      rawPrio === 'high' || rawPrio === 'urgent'
        ? 'High'
        : rawPrio === 'low'
        ? 'Low'
        : 'Medium';
    if (formattedTarget) {
      return {
        intent: 'update_task',
        title: formattedTarget,
        targetTitle: formattedTarget,
        targetEntityType: 'task',
        priority,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: detectCategory(formattedTarget),
        details: null,
        snoozeMinutes: null,
        confidence: 0.94,
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
    const isRename =
      /^rename\b/i.test(commandLower) ||
      /\bchange\s+(?:the\s+)?(?:title|name)\b/i.test(commandLower);
    const isAppend = /^(?:append|add)\s+to\b/i.test(commandLower);

    if (isRename) {
      const renameMatch =
        /\bnote\s+(?:(?:called|titled|named|about)\s+)?(.+?)\s+to\s+(.+)$/i.exec(
          commandLower,
        );
      const rawTarget = renameMatch
        ? cleanCrudTargetTitle(renameMatch[1])
        : cleanCrudTargetTitle(commandLower);
      const rawNew = renameMatch
        ? renameMatch[2].replace(/^[\s,:-]+|[\s,:-]+$/g, '').trim()
        : '';
      const targetTitle = rawTarget
        ? rawTarget.charAt(0).toUpperCase() + rawTarget.slice(1)
        : 'Voice Note';
      const newTitle = rawNew
        ? rawNew.charAt(0).toUpperCase() + rawNew.slice(1)
        : null;
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
      targetTitle = cleanedT
        ? cleanedT.charAt(0).toUpperCase() + cleanedT.slice(1)
        : 'Voice Note';
      bodyContent = noteSplitMatch[2]
        .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
        .trim();
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
      category: isAppend
        ? 'APPEND'
        : detectCategory(`${targetTitle} ${bodyContent}`),
      details: bodyContent || null,
      snoozeMinutes: null,
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 8. CRUD: Update / Edit / Move / Reschedule / Rename Time Block or Task (or Call Reschedule)
  const isUpdateOrRescheduleCommand =
    /^(?:update|edit|change|modify|move|reschedule|shift|push\s+back|postpone|rename)\b/i.test(
      commandLower,
    );
  if (isUpdateOrRescheduleCommand) {
    const {entityType, updateIntent} = classifyCrudEntityType(commandLower);
    const isRenameVerb =
      /^rename\b/i.test(commandLower) ||
      /\b(?:change|update)\s+(?:the\s+)?(?:title|name)\s+of\b/i.test(
        commandLower,
      );

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
      const formattedTarget = targetTitle
        ? targetTitle.charAt(0).toUpperCase() + targetTitle.slice(1)
        : null;
      const cleanedNew = rightPart
        .replace(/^(?:be\s+|called\s+|titled\s+|named\s+)/i, '')
        .replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '')
        .trim();
      const formattedNew = cleanedNew
        ? cleanedNew.charAt(0).toUpperCase() + cleanedNew.slice(1)
        : null;

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
        category: detectCategory(
          `${formattedTarget || ''} ${formattedNew || ''}`,
        ),
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: transcript,
      };
    }

    const rightDt = rightPart
      ? parseDateAndTime(`at ${rightPart}`, referenceDate)
      : {
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          matchedText: [],
        };
    const fullDt = parseDateAndTime(normalized, referenceDate);
    const leftDt = rightPart
      ? parseDateAndTime(leftPart, referenceDate)
      : {
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          matchedText: [],
        };

    const newDate = rightDt.date || fullDt.date;
    const newTime = rightDt.time || fullDt.time;
    const newEndTime = rightDt.endTime || fullDt.endTime;
    const newDuration = rightDt.durationMinutes || fullDt.durationMinutes;
    const targetTime =
      rightPart && leftDt.time && leftDt.time !== newTime ? leftDt.time : null;

    const targetTitleRaw = cleanCrudTargetTitle(
      rightPart ? leftPart : normalized,
      rightPart ? leftDt.matchedText : fullDt.matchedText,
    );
    const formattedTarget = targetTitleRaw
      ? targetTitleRaw.charAt(0).toUpperCase() + targetTitleRaw.slice(1)
      : null;

    // If rightPart had NO date/time and a targetTitle was given, treat "Update/Change task X to Y" as a rename!
    if (rightPart && !newDate && !newTime && formattedTarget) {
      const cleanedNew = rightPart
        .replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '')
        .trim();
      const formattedNew = cleanedNew
        ? cleanedNew.charAt(0).toUpperCase() + cleanedNew.slice(1)
        : null;
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
    if (
      !formattedTarget &&
      !targetTime &&
      entityType === 'any' &&
      /^(?:reschedule|move|push\s+back|postpone)\b/i.test(commandLower)
    ) {
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
  const targetsTodoList =
    /(?:add|put|create)\s+.+\s+(?:to|on|onto|into)\s+(?:my\s+|the\s+)?(?:todos?|to-?dos?|to\s+dos?)(?:\s+list)?\b/i.test(
      commandLower,
    );
  const checklistNoteMatch =
    !targetsTodoList &&
    /^(?:(?:please\s+)?(?:create|add|make|start|new)\s+(?:a\s+|new\s+)?(?:checklist|check\s*list)(?:\s+note)?(?:\s+(?:(?:called|titled|named|for|about)\s+)?([^:]+?))?(?:\s*(?::|with)\s*(.+)))$/i.exec(
      normalized,
    );
  if (checklistNoteMatch && checklistNoteMatch[2]) {
    const titleRaw = (checklistNoteMatch[1] || 'Checklist').trim();
    const noteTitle = titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1);
    const items = checklistNoteMatch[2]
      .split(/[,;]+|\s+and\s+/i)
      .map(s => s.trim())
      .filter(Boolean);
    if (items.length > 0) {
      return {
        intent: 'create_note',
        title: noteTitle,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: detectCategory(`${noteTitle} ${checklistNoteMatch[2]}`),
        details: items.map(item => `- [ ] ${item}`).join('\n'),
        checklistItems: items,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: transcript,
      };
    }
  }

  const isExplicitNoteCreate =
    !targetsTodoList &&
    (/\b(?:(?:create|add|make|take|save)\s+(?:(?:this|that)\s+)?(?:as\s+)?(?:a\s+|an\s+|new\s+|quick\s+)?notes?|(?:save|add)\s+to\s+(?:my\s+)?notes?|to\s+note\b|take\s+note\b|note\s+down|write\s+down|jot\s+down|(?:write|jot)\s+(?:a\s+|an\s+|new\s+|quick\s+)?notes?)\b/i.test(
      commandLower,
    ) ||
      /^(?:(?:new|to)\s+)?note(?::|\s+that\s+|\s+about\s+|\s+for\s+|\s+titled\s+|\s+called\s+|\s+to\s+|\s*:\s*)/i.test(
        commandLower,
      ));

  if (isExplicitNoteCreate) {
    // Support explicit title + body ("Create a note titled Biology that mitochondria is the powerhouse")
    const titledNoteMatch =
      /\bnotes?\s+(?:called|titled|named)\s+(.+?)(?:\s+(?:that|saying|about|with|:)\s+|\s*:\s*)(.+)$/i.exec(
        normalized,
      );
    if (titledNoteMatch) {
      const rawNoteTitle = titledNoteMatch[1]
        .replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '')
        .trim();
      const rawNoteBody = titledNoteMatch[2]
        .replace(/^[\s,;:'"“”‘’:-]+|[\s,;:'"“”‘’:-]+$/g, '')
        .trim();
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

    const hadColonNotePrefix =
      /^(?:(?:please\s+)?(?:take|create|add|make|save)\s+(?:(?:this|that)\s+)?(?:as\s+)?(?:a\s+|an\s+|new\s+)?note|to\s+note|note)\s*:/i.test(
        commandLower,
      );
    let noteContent = normalized
      .replace(
        /^(?:(?:hey|hi|hello|okay|ok)\s+(?:lafina\s*)?[,.!]?\s*)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i,
        '',
      )
      .replace(
        /^(?:(?:create|add|make|take|save|write|jot)\s+(?:(?:this|that)\s+)?(?:as\s+)?(?:a\s+|an\s+|new\s+|quick\s+)?notes?|(?:save|add)\s+to\s+(?:my\s+)?notes?|to\s+note|take\s+note|note\s+down|write\s+down|jot\s+down|(?:new\s+)?notes?)\s*(?:(?:\b(?:that|about|for|regarding|on|saying|called|titled|named|to)\b)\s*)?[:\s,-]*/i,
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

  const parsedDt = parseDateAndTime(normalized, referenceDate);
  // An alarm or wake-up call at a bare hour means the morning: "wake me up at
  // 6" at 10 AM is 6 AM tomorrow, not 6 PM today.
  const dt =
    parsedDt.time &&
    Number(parsedDt.time.slice(0, 2)) >= 13 &&
    /^(?:wake\s+me\s+up|(?:set|add|create|make|put)\s+(?:up\s+)?(?:my\s+|an?\s+|the\s+|new\s+)?alarms?)\b/i.test(
      normalized.trim(),
    ) &&
    // Only a bare hour: "6pm", "18:00", "tonight" or "evening" stay as said.
    !/\b(?:\d{1,2}(?::\d{2})?\s*(?:pm|p\.m\.?)|(?:1[3-9]|2[0-3]):\d{2}|tonight|evening|afternoon|night|noon)\b/i.test(
      normalized,
    )
      ? {
          ...parsedDt,
          time: `${String(Number(parsedDt.time.slice(0, 2)) - 12).padStart(
            2,
            '0',
          )}${parsedDt.time.slice(2)}`,
          shiftedToEvening: false,
        }
      : parsedDt;

  // Determine schedule creation intent (Time Block, Task, Reminder)
  let intentType: ParsedIntentType = 'create_task';

  const isExplicitTimeBlock =
    /\b(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|block\s+time|block\s+out|(?:create|add|set|schedule|make|put|book|plan)\s+(?:(?:for\s+)?(?:me|us)\s+)?(?:a\s+|an\s+|new\s+)?blocks?|events?)\b/i.test(
      commandLower,
    ) || /^blocks?\b/i.test(commandLower);

  const isExplicitTask =
    /\b(?:(?:create|add|set|make|schedule|put|book|plan)\s+(?:(?:for\s+)?(?:me|us)\s+)?(?:a\s+|an\s+|new\s+)?(?:tasks?|todos?|to-?dos?|to\s+dos?))\b/i.test(
      commandLower,
    ) ||
    targetsTodoList ||
    /^(?:new\s+)?(?:tasks?|todos?|to-?dos?|to\s+dos?)\b/i.test(commandLower);

  const isAlarmRequest =
    /^(?:set|add|create|make|put)\s+(?:up\s+)?(?:my\s+|an?\s+|the\s+|new\s+)?alarms?\b/i.test(
      commandLower,
    ) || /^wake\s+me\s+up\b/i.test(commandLower);

  const isExplicitReminder =
    /\b(?:remind|reminders?)\b/i.test(commandLower) || isAlarmRequest;

  const isImperativeScheduleVerb =
    /^(?:add|set(?:\s+up)?|create|put|schedule|make|book|plan|remind|wake)\b/i.test(
      commandLower,
    );

  const isQuestionPhrase =
    !isImperativeScheduleVerb &&
    (/^(?:what|which|who|where|when|why|how|should|can|could|would|do|does|did|is|are|will|am)\b/i.test(
      commandLower,
    ) ||
      commandLower.endsWith('?'));

  // Looking, asking and planning verbs never create an item on their own:
  // "find a free slot tomorrow" is a question even though it has a date.
  const isInquiryPhrase =
    !isImperativeScheduleVerb &&
    /^(?:find|search|look|check|show|tell|give|list|suggest|recommend|explain|summari[sz]e|review\s+my|compare|help|figure|decide)\b/i.test(
      commandLower,
    );
  if (isInquiryPhrase && !isExplicitTimeBlock && !isExplicitTask) {
    return {
      intent: 'chat',
      title: null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: detectCategory(normalized),
      details: transcript,
      snoozeMinutes: null,
      confidence: 0.85,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  if (isExplicitTimeBlock) {
    intentType = 'create_time_block';
  } else if (isExplicitTask && !isExplicitReminder) {
    intentType = 'create_task';
  } else if (isExplicitReminder) {
    intentType = 'create_reminder';
  } else if (!isQuestionPhrase && dt.endTime !== null) {
    intentType = 'create_time_block';
  } else if (!isQuestionPhrase && (dt.date !== null || dt.time !== null)) {
    intentType = 'create_task';
  } else if (
    /^(?:add|set|create|put|schedule|make|book|plan)\b/i.test(commandLower)
  ) {
    intentType = 'create_task';
  } else {
    // Neither date/time nor schedule mutation command:
    // User did NOT ask to save as note and did NOT ask to schedule anything.
    // Return conversational chat intent without modifying schedule or creating notes.
    return {
      intent: 'chat',
      title: null,
      date: null,
      time: null,
      endTime: null,
      durationMinutes: null,
      category: 'Personal',
      details: transcript,
      snoozeMinutes: null,
      confidence: 0.85,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // Clean title by stripping command prefixes and matched date/time tokens
  let cleanTitle = stripConversationalCommandPrefix(normalized);

  // Strip leading priority label like "high priority task: ..."
  cleanTitle = cleanTitle.replace(
    /^(?:with\s+)?(?:high|medium|low)\s+priority\s*[:,-]?\s*/i,
    '',
  );

  // "block out 2 hours for thesis", "set my alarm for 6am", "wake me up at 6"
  cleanTitle = cleanTitle
    .replace(/^block\s+(?:out|off)\s+(?:some\s+)?(?:time\s+)?/i, '')
    .replace(
      /^(?:set|add|create|make|put)\s+(?:up\s+)?(?:my\s+|an?\s+|the\s+|new\s+)?alarms?\s*/i,
      '',
    )
    .replace(/^wake\s+me\s+up\s*/i, '')
    // "every monday and wednesday", "every mon, wed and fri" (before the
    // single matched weekday is cut out and leaves "and wednesday" behind)
    .replace(
      /\b(?:every|each|on)\s+(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?:\s*,\s*|\s+and\s+|\s*&\s*|\s*\/\s*)?){2,}/gi,
      ' ',
    );

  // Strip command verb + optional article/adjective + entity noun
  cleanTitle = cleanTitle.replace(
    /^(?:remind\s+me(?:\s+to\b|\s+for\b|\s+about\b)?|set(?:\s+up)?\s+(?:a\s+|an\s+|new\s+)?reminder\s*(?:to\b|for\b|about\b)?|(?:(?:create|add|set(?:\s+up)?|schedule|make|put|book|plan)\s+)(?:(?:for\s+)?(?:me|us)\s+)?(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|block\s+time|block\s+out|blocks?|tasks?|todos?|to-?dos?|to\s+dos?|reminders?|events?|notes?)|(?:add|create|schedule|set(?:\s+up)?|make|put|book|plan)(?:\s+(?:for\s+)?(?:me|us)(?:\s+(?:to|about))?)?\b)\s*[:\s,-]*(?:(?:a|an|the|new)\s+)*[:\s,-]*/i,
    '',
  );

  cleanTitle = cleanTitle.replace(
    /^(?:(?:new\s+)?(?:tasks?|todos?|to-?dos?|to\s+dos?(?:\s+list)?|events?|time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|blocks?|reminders?|notes?))\s*[:\s,-]*(?:(?:called|titled|named|for|to|about|on|at)\b)?\s*[:\s,-]*/i,
    '',
  );

  cleanTitle = cleanTitle
    .replace(
      /\s+(?:to|on|onto|into|in)\s+(?:my\s+|the\s+)?(?:todos?|to-?dos?|to\s+dos?|task)(?:\s+list)?(?:\s+in\s+(?:my\s+|the\s+)?notes?(?:\s+tab)?)?[\s.!?]*$/i,
      '',
    )
    .replace(
      /(?:,\s*|\s+(?:with|at|as)\s+|\s+)\b(?:high|medium|low)\s+priority\b[\s.!?]*$/i,
      '',
    )
    .replace(/\s+for\s+(?:me|us)[\s.!?]*$/i, '');

  cleanTitle = cleanTitle.replace(/^(?:called|titled|named)\s+/i, '');

  // Strip matched date/time phrases (longest first to avoid partial replacements)
  const sortedMatches = [...dt.matchedText].sort((a, b) => b.length - a.length);
  for (const match of sortedMatches) {
    cleanTitle = cleanTitle.replace(
      new RegExp(`\\b${escapeRegExp(match)}\\b`, 'gi'),
      '',
    );
  }

  // Strip leftover time-of-day qualifiers if time was parsed
  if (dt.time) {
    cleanTitle = cleanTitle.replace(
      /\b(?:in\s+the\s+(?:morning|afternoon|evening)|this\s+(?:morning|afternoon|evening)|(?:to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr)\s+(?:morning|afternoon|evening|night)|at\s+night)\b/gi,
      '',
    );
  }

  // Strip recurring repetition phrases from title: e.g. "that repeats every Monday", "repeating every week", "every Monday"
  cleanTitle = cleanTitle
    .replace(
      /\b(?:that\s+repeats?|repeating|repeats?)\s+(?:every|each|on)?\b/gi,
      ' ',
    )
    // "... on my calendar" / "to my schedule"
    .replace(
      /\s+(?:on|to|in|into|onto)\s+(?:my\s+|the\s+)?(?:calendar|schedule|agenda|planner)\b/gi,
      ' ',
    )
    .replace(
      /\bevery\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|week|month)\b/gi,
      ' ',
    )
    .replace(/\bthat\s+repeats?\b/gi, ' ');

  // Strip lingering leading prepositions and articles/possessives (e.g. "for a coffee" -> "coffee", "for your class" -> "class", "to submit" -> "submit")
  cleanTitle = cleanTitle.replace(
    /^[\s,:-]*(?:\b(?:on|at|by|for|from|between|starting|with|to|about|regarding|of|called|titled|named)\b[\s,:-]*(?:(?:a|an|the|your|our)\b[\s,:-]*)?)+/i,
    '',
  );

  // Strip bare leading article or possessive pronoun for action items
  cleanTitle = cleanTitle.replace(
    /^[\s,:-]*(?:a|an|the|your|our)\b[\s,:-]*/i,
    '',
  );

  // Strip lingering trailing prepositions and punctuation at edges (including trailing periods)
  cleanTitle = cleanTitle
    .replace(
      /(?:[\s,:-]*\b(?:on|at|by|for|from|between|starting|with|to|about|regarding|of)\b)+[\s,.;:!?-]*$/i,
      '',
    )
    .replace(/^[\s,.;:!?'"“”‘’:-]+|[\s,.;:!?'"“”‘’:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Evaluate whether the extracted title or raw transcript had conversational noise
  const hasExplicitCommandPrefix =
    /^(?:remind\s+me|set\s+a?\s*reminder|add\s+a?\s*reminder|(?:(?:create|add|set|schedule|make|book|plan)\s+)?(?:(?:for\s+)?(?:me|us)\s+)?(?:a\s+|an\s+)?(?:new\s+)?(?:time\s*block|timeblock|study\s*block|focus\s*block|block\s+time|block\s+out|block|take\s+a?\s*note|save\s+a?\s*note|note\s+down|write\s+down|task|todo|note)|add|create|schedule|set(?:\s+up)?|make|book|plan)\b/i.test(
      commandLower,
    );
  const noisy = isTitleNoisy(cleanTitle, normalized);
  if ((noisy || !hasExplicitCommandPrefix) && cleanTitle) {
    cleanTitle = distillScheduleTitle(cleanTitle);
  }

  // If title is empty, provide a clean default
  let finalTitle = cleanTitle;
  let finalDetails: string | null = cleanTitle || normalized;

  if (!cleanTitle) {
    if (isAlarmRequest) finalTitle = 'Alarm';
    else if (intentType === 'create_reminder') finalTitle = 'Reminder';
    else if (intentType === 'create_time_block') finalTitle = 'Study Session';
    else finalTitle = 'New Task';
  }

  // Capitalize first letter of title
  finalTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);

  const category = detectCategory(finalTitle + ' ' + normalized);
  const priority =
    intentType === 'create_task' ? extractPriority(normalized) : null;

  let confidence = 0.5;
  if (noisy) {
    confidence = dt.matchedText.length > 0 ? 0.75 : 0.65;
  } else {
    confidence = dt.matchedText.length > 0 ? 0.95 : 0.85;
  }

  // Exams, appointments and meetings at a set time are calendar events, not
  // to-dos. Without a time they stay tasks (a deadline on that day).
  const namesBlockExplicitly =
    /\b(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|block\s+(?:out|off|time))\b/i.test(
      commandLower,
    );
  if (
    !namesBlockExplicitly &&
    !isExplicitReminder &&
    !(isExplicitTask && intentType === 'create_task') &&
    (intentType === 'create_task' || intentType === 'create_time_block') &&
    dt.time !== null &&
    EVENT_NOUN.test(`${finalTitle} ${commandLower}`)
  ) {
    intentType = 'create_time_block';
  }

  const isExplicitEventKeyword =
    intentType === 'create_time_block' &&
    !namesBlockExplicitly &&
    (/\b(?:events?|appointments?)\b/i.test(commandLower) ||
      (dt.time !== null && EVENT_NOUN.test(`${finalTitle} ${commandLower}`)));

  return {
    intent: intentType,
    title: finalTitle,
    ...(isExplicitEventKeyword ? {targetEntityType: 'event' as const} : {}),
    date: dt.date,
    time: dt.time,
    endTime: dt.endTime,
    durationMinutes:
      dt.durationMinutes || (intentType === 'create_time_block' ? 60 : null),
    category,
    ...(priority ? {priority} : {}),
    details: finalDetails,
    snoozeMinutes: null,
    recurrenceRule: extractRecurrenceRule(normalized) || undefined,
    confidence,
    source: 'fast_path',
    rawTranscript: transcript,
  };
}

const MINOR_TITLE_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'so',
  'yet',
  'at',
  'by',
  'in',
  'of',
  'on',
  'to',
  'up',
  'as',
  'with',
  'from',
  'into',
  'onto',
  'upon',
  'vs',
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
export function isTitleNoisy(
  title: string,
  rawTranscript: string = '',
): boolean {
  const trimmed = (title || '').trim();
  if (!trimmed) return true;

  const lowerTitle = trimmed.toLowerCase();
  const lowerRaw = (rawTranscript || '').trim().toLowerCase();

  // 1. Conversational pronouns or modal/obligation verbs
  const modalOrPronounRegex =
    /\b(?:i|i['’]m|i['’]ve|i['’]ll|we|we['’]ll|we['’]re|let['’]?s|you|gotta|gonna|wanna|need\s+to|have\s+to|should|must|remember\s+to|don['’]?t\s+forget(?:\s+to)?|planning\s+to|want\s+to|trying\s+to|supposed\s+to)\b/i;
  if (
    modalOrPronounRegex.test(lowerTitle) ||
    modalOrPronounRegex.test(lowerRaw) ||
    /^(?:me|us|for\s+me|for\s+us)\b/i.test(lowerTitle)
  ) {
    return true;
  }

  // 2. Lingering temporal or hedging adverbs
  const colloquialTemporalOrFillerRegex =
    /\b(?:morrow|tmrw|tmr|later|sometime|maybe|probably|just|around|somewhere|after\s+class|before\s+class)\b/i;
  if (
    colloquialTemporalOrFillerRegex.test(lowerTitle) ||
    colloquialTemporalOrFillerRegex.test(lowerRaw)
  ) {
    return true;
  }

  // 3. Starts with a preposition, conjunction, or filler word
  if (
    /^(?:and|but|so|or|that|because|if|when|with|also|actually|honestly|basically)\b/i.test(
      lowerTitle,
    )
  ) {
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

  // Iteratively strip leading conversational framing (e.g., "I really gotta", "I need to", "So let's schedule", "Don't forget to", "Maybe")
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned
      .replace(
        /^(?:(?:uh|um|er|ah|hey|hi|hello|yeah|yep|yes|okay|ok|well|so|like|actually|honestly|basically|alright)\s*[,.!:-]*\s*)+/i,
        '',
      )
      .replace(/^(?:i|we)\s+(?:want|need|would\s+like)\s+you\s+to\s+/i, '')
      .replace(/^(?:set|make|create)\s+(?:a\s+)?schedule\s+(?:for\s+)?/i, '')
      .replace(/^lafina\s*[,.!:-]*\s*/i, '')
      .replace(
        /^(?:(?:can|could|would|will|may)\s+(?:you|we)\s+(?:please\s+)?(?:help\s+me\s+(?:to\s+)?)?)/i,
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
        /^(?:please\s+)?(?:don['’]?t\s+forget(?:\s+to)?|remember(?:\s+to)?|make\s+sure(?:\s+to)?|be\s+sure(?:\s+to)?|let['’]?s(?:\s+have)?|(?:i|we)\s+have|maybe|probably)\s+/i,
        '',
      )
      .replace(
        /^(?:remind\s+me(?:\s+to\b|\s+for\b|\s+about\b)?|set(?:\s+up)?\s+(?:a\s+|an\s+|new\s+)?reminder\s*(?:to\b|for\b|about\b)?|(?:(?:create|add|set(?:\s+up)?|schedule|make|put|book|plan)\s+)(?:(?:for\s+)?(?:me|us)\s+)?(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:time\s*blocks?|timeblocks?|study\s*blocks?|focus\s*blocks?|work\s*blocks?|block\s+time|block\s+out|blocks?|tasks?|todos?|to-dos?|reminders?|events?)|(?:create|add|schedule|set(?:\s+up)?|make|book|plan)(?:\s+(?:for\s+)?(?:me|us)(?:\s+(?:to|about))?)?\b)(?:\s+(?:called|titled|named|for|to|about)\b)?(?:\s+(?:a|an|the|new)\b)*[\s,:-]*/i,
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
    /\b(?:to-?morrow|tommorow|tomorow|tommorrow|morrow|tmrw|tmr|today|tonight|yesterday|after\s+class|before\s+class|after\s+school|before\s+school|after\s+work|in\s+the\s+(?:morning|afternoon|evening)|this\s+(?:morning|afternoon|evening)|at\s+night|later\s+today|later\s+tonight|sometime|later|(?:(?:at|from|by|around)\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|noon|midnight))\b/gi,
    '',
  );

  // Strip lingering leading/trailing prepositions, articles, and punctuation (including periods)
  cleaned = cleaned
    .replace(
      /^[\s,:-]*(?:\b(?:on|at|by|for|from|between|starting|with|to|about|regarding|of|in|around|called|titled|named)\b[\s,:-]*(?:(?:a|an|the)\b[\s,:-]*)?)+/i,
      '',
    )
    .replace(/^[\s,:-]*(?:a|an|the)\b[\s,:-]*/i, '')
    .replace(
      /(?:[\s,:-]*\b(?:on|at|by|for|from|between|starting|with|to|about|regarding|of|in|around)\b)+[\s,.;:!?-]*$/i,
      '',
    )
    .replace(/^[\s,.;:!?'"“”‘’:-]+|[\s,.;:!?'"“”‘’:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return toTitleCase(cleaned);
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
