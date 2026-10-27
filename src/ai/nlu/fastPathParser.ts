import type { ExtractedIntent, ParsedIntentType } from './types';

/** Dictionary mapping spoken number words to integers. */
export const NUMBER_WORDS: Record<string, number> = {
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
  fifty: 50,
  sixty: 60,
  couple: 2,
  few: 5,
};

/** Parses spoken number words (e.g. "five", "twenty-five") or raw digits into a number. */
export function parseNumberWordOrDigits(token: string | null | undefined): number | null {
  if (!token) return null;
  const trimmed = token.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  if (NUMBER_WORDS[trimmed] !== undefined) {
    return NUMBER_WORDS[trimmed];
  }
  const parts = trimmed.split(/[\s-]+/);
  if (parts.length === 2 && NUMBER_WORDS[parts[0]] && NUMBER_WORDS[parts[1]]) {
    const tens = NUMBER_WORDS[parts[0]];
    const ones = NUMBER_WORDS[parts[1]];
    if (tens >= 20 && tens <= 90 && ones >= 1 && ones <= 9) {
      return tens + ones;
    }
  }
  return null;
}

/** Regex pattern matching digits or spoken number words including compounds. */
export const NUM_WORDS_PATTERN =
  '(?:\\d+|(?:twenty|thirty|forty|fifty|sixty)(?:[\\s-]+(?:one|two|three|four|five|six|seven|eight|nine))|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|couple|few|a|an)';

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

/** Normalizes speech transcript artifacts (e.g. "a.m." -> "am", "p.m." -> "pm", "o'clock"). */
export function normalizeSpeech(transcript: string): string {
  return transcript
    .replace(/\bp\.m\./gi, 'pm')
    .replace(/\ba\.m\./gi, 'am')
    .replace(/\bo['’]clock\b/gi, ':00')
    .replace(/\b(uh|um|er|ah|like|please)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detects academic vs personal category from keywords. */
export function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  const academicKeywords = [
    'exam', 'quiz', 'midterm', 'final', 'lecture', 'assignment', 'homework',
    'thesis', 'capstone', 'lab', 'class', 'study', 'professor', 'course', 'project',
    'defense', 'subject', 'school', 'university', 'ustp', 'syllabus',
  ];
  for (const kw of academicKeywords) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) {
      return 'Academic';
    }
  }
  return 'Personal';
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

  const lower = text.toLowerCase();

  // Relative date: today, tomorrow, day after tomorrow
  if (/\bday after tomorrow\b/i.test(lower)) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 2);
    date = formatLocalDate(d);
    matchedText.push('day after tomorrow');
  } else if (/\btomorrow\b/i.test(lower)) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 1);
    date = formatLocalDate(d);
    matchedText.push('tomorrow');
  } else if (/\btoday\b/i.test(lower)) {
    date = formatLocalDate(referenceDate);
    matchedText.push('today');
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
  const halfHourMatch = /\b(?:in\s+)?(?:about\s+)?half\s+(?:an?\s+)?hour(?:\s+(?:from\s+now|later))?\b/i.exec(lower);
  if (halfHourMatch && !time) {
    const target = new Date(referenceDate.getTime() + 30 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(halfHourMatch[0]);
  }

  // "in an hour", "an hour from now", "an hour later"
  const anHourMatch = /\b(?:in\s+)?(?:about\s+)?an\s+hour(?:\s+(?:from\s+now|later))?\b/i.exec(lower);
  if (anHourMatch && !time) {
    const target = new Date(referenceDate.getTime() + 60 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(anHourMatch[0]);
  }

  // "a couple minutes from now", "in a couple minutes", "a couple of minutes"
  const coupleMatch = /\b(?:in\s+)?(?:about\s+)?(?:a\s+)?couple(?:\s+of)?\s*(?:minutes?|mins?)(?:\s+(?:from\s+now|later))?\b/i.exec(lower);
  if (coupleMatch && !time) {
    const target = new Date(referenceDate.getTime() + 2 * 60000);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(coupleMatch[0]);
  }

  // "a few minutes from now", "in a few minutes", "few minutes later"
  const fewMatch = /\b(?:in\s+)?(?:about\s+)?(?:a\s+)?few\s*(?:minutes?|mins?)(?:\s+(?:from\s+now|later))?\b/i.exec(lower);
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

  // Time range: "from 9 to 11 am", "9am - 11am", "from 14:00 to 16:00"
  const rangeMatch = /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(lower);
  if (rangeMatch && !time) {
    let startHour = parseInt(rangeMatch[1], 10);
    const startMin = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
    const endMeridiem = rangeMatch[6].toLowerCase();
    const startMeridiem = rangeMatch[3]
      ? rangeMatch[3].toLowerCase()
      : (endMeridiem === 'pm' && startHour < 12 ? 'pm' : undefined);

    let endHour = parseInt(rangeMatch[4], 10);
    const endMin = rangeMatch[5] ? parseInt(rangeMatch[5], 10) : 0;

    if (startMeridiem === 'pm' && startHour < 12) startHour += 12;
    if (startMeridiem === 'am' && startHour === 12) startHour = 0;
    if (endMeridiem === 'pm' && endHour < 12) endHour += 12;
    if (endMeridiem === 'am' && endHour === 12) endHour = 0;

    time = formatLocalTime(startHour, startMin);
    endTime = formatLocalTime(endHour, endMin);

    const startTotal = startHour * 60 + startMin;
    const endTotal = endHour * 60 + endMin;
    if (endTotal > startTotal) {
      durationMinutes = endTotal - startTotal;
    }
    matchedText.push(rangeMatch[0]);
  }

  // Single time: "at 3pm", "3:30 pm", "at nine am", "at 14:00"
  if (!time) {
    const singleTimeMatch = /\b(?:at\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(\d{2}))?\s*(am|pm)\b/i.exec(lower);
    if (singleTimeMatch) {
      const rawHour = singleTimeMatch[1];
      let hour = parseNumberWordOrDigits(rawHour) ?? parseInt(rawHour, 10);
      const min = singleTimeMatch[2] ? parseInt(singleTimeMatch[2], 10) : 0;
      const meridiem = singleTimeMatch[3].toLowerCase();
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      time = formatLocalTime(hour, min);
      matchedText.push(singleTimeMatch[0]);
    } else {
      const militaryMatch = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i.exec(lower);
      if (militaryMatch) {
        time = formatLocalTime(parseInt(militaryMatch[1], 10), parseInt(militaryMatch[2], 10));
        matchedText.push(militaryMatch[0]);
      }
    }
  }

  return { date, time, endTime, durationMinutes, matchedText };
}

/** Deterministic Fast-Path NLU Intent Extractor. */
export function parseIntentFastPath(
  transcript: string,
  referenceDate: Date = new Date(),
): ExtractedIntent {
  const normalized = normalizeSpeech(transcript);
  const lower = normalized.toLowerCase();

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
  // Snooze responses occur when a reminder call is active. If the user specifies an action ("for a coffee", "to study"), it is a new reminder.
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

  // 3. Call Responses / Reschedule
  if (/\b(?:reschedule|move|push back|postpone)\b/i.test(lower)) {
    const dt = parseDateAndTime(normalized, referenceDate);
    return {
      intent: 'reschedule',
      title: null,
      date: dt.date,
      time: dt.time,
      endTime: dt.endTime,
      durationMinutes: dt.durationMinutes,
      category: 'Academic',
      details: null,
      snoozeMinutes: null,
      confidence: 0.92,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 4. Schedule Query
  const isActionCommand = /^(?:please\s+)?(?:remind\s+me|set\s+a\s+reminder|add\s+task|create\s+task|take\s+a\s+note|save\s+note|note\s+down)\b/i.test(lower);
  const isScheduleQuery =
    /\b(?:what(?:'s| is| are) (?:on |in )?(?:my )?(?:schedule|calendar|agenda|plans?|tasks?|events?|classes?)|what(?:'s| is| are) (?:my )?(?:schedule|agenda|plans?|tasks?|events?|classes?)|what(?:'s| is) (?:happening|upcoming|planned)|what (?:do i have|have i got|i have)|what (?:tasks?|events?|classes?|plans?) (?:do i have|have i got|i have)|what does my (?:day|schedule) look|how(?:'s| is| does) my (?:schedule|day)(?: look(?:ing)?)?|do i have (?:anything|any (?:tasks?|events?|classes?|plans?))|is there anything (?:on |in )?(?:my )?(?:schedule|calendar|agenda)|is anything (?:scheduled|planned)|(?:show|check|tell me|read(?: out)?|list|get|view)(?: me)? (?:what(?:'s| is| are) (?:on |in )?)?(?:my |today'?s |tomorrow'?s )?(?:schedule|calendar|agenda|tasks?|plans?|events?)|my schedule|today'?s schedule|tomorrow'?s schedule|any (?:plans?|tasks?|events?|classes?) (?:for |on )?(?:today|tomorrow))\b/i.test(lower);

  if (isScheduleQuery && !isActionCommand) {
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
      confidence: 0.95,
      source: 'fast_path',
      rawTranscript: transcript,
    };
  }

  // 5. Conversational greetings
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

  // 6. Action Intents (Task, Time Block, Reminder, Note)
  let intentType: ParsedIntentType = 'create_task';

  if (/\b(?:remind|reminder)\b/i.test(lower)) {
    intentType = 'create_reminder';
  } else if (/\b(?:time\s*block|study\s*block|focus\s*block|event)\b/i.test(lower)) {
    intentType = 'create_time_block';
  } else if (/^(?:take\s+a\s+)?note(?::|\s+that\s+|\s+about\s+|\s+)/i.test(lower) || /\b(?:save\s+note|note\s+down|write\s+down)\b/i.test(lower)) {
    intentType = 'create_note';
  } else if (/\b(?:task|todo|to-do|schedule)\b/i.test(lower)) {
    intentType = 'create_task';
  } else {
    // Default fallback: if speech contains scheduling verbs, treat as task
    if (/^(add|set|create|put)\b/i.test(lower)) {
      intentType = 'create_task';
    } else {
      intentType = 'create_note';
    }
  }

  const dt = parseDateAndTime(normalized, referenceDate);

  // Clean title by stripping command prefixes and matched date/time tokens
  let cleanTitle = normalized;

  // Remove command prefixes (including trailing colon / dashes)
  cleanTitle = cleanTitle.replace(
    /^(?:please\s+)?(?:remind\s+me(?:\s+to\b)?|set\s+a\s+reminder\s+(?:to\b|for)?|time\s*block|study\s*block|block|take\s+a\s+note(?:\s+about|\s+that)?|save\s+note|note\s+down|write\s+down|add\s+task|create\s+task|add|create|schedule|set(?:\s+up)?|note|task|todo)\s*[:\s,-]*(?:a|an|the)?\s*[:\s,-]*/i,
    '',
  );

  cleanTitle = cleanTitle.replace(/^(?:task|event|time\s*block|reminder|note)\s*[:\s,-]*(?:for|to|about)?\s*[:\s,-]*/i, '');

  // Strip matched date/time phrases (longest first to avoid partial replacements)
  const sortedMatches = [...dt.matchedText].sort((a, b) => b.length - a.length);
  for (const match of sortedMatches) {
    cleanTitle = cleanTitle.replace(new RegExp(`\\b${escapeRegExp(match)}\\b`, 'gi'), '');
  }

  // Strip lingering leading prepositions and articles (e.g. "for a coffee" -> "coffee", "to submit" -> "submit")
  cleanTitle = cleanTitle
    .replace(/^[\s,:-]*(?:\b(?:on|at|by|for|starting|with|to|about|regarding|of)\b[\s,:-]*(?:(?:a|an|the)\b[\s,:-]*)?)+/i, '');

  // Strip bare leading article for action items
  if (intentType !== 'create_note') {
    cleanTitle = cleanTitle.replace(/^[\s,:-]*(?:a|an|the)\b[\s,:-]*/i, '');
  }

  // Strip lingering trailing prepositions at edges
  cleanTitle = cleanTitle
    .replace(/(?:[\s,:-]*\b(?:on|at|by|for|starting|with|to|about|regarding|of)\b)+[\s,:-]*$/i, '')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If title is empty, provide a clean default
  let finalTitle = cleanTitle;
  let finalDetails: string | null = cleanTitle || normalized;

  if (intentType === 'create_note') {
    if (/^(?:take\s+a\s+)?note\s*:/i.test(lower) || !cleanTitle) {
      finalTitle = 'Voice Note';
      finalDetails = cleanTitle || 'Voice note transcript.';
    }
  } else if (!cleanTitle) {
    if (intentType === 'create_reminder') finalTitle = 'Reminder';
    else if (intentType === 'create_time_block') finalTitle = 'Study Session';
    else finalTitle = 'New Task';
  }

  // Capitalize first letter of title
  finalTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);

  const category = detectCategory(finalTitle + ' ' + normalized);

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
    confidence: dt.matchedText.length > 0 ? 0.92 : 0.85,
    source: 'fast_path',
    rawTranscript: transcript,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
