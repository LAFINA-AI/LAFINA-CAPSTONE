import type { ExtractedIntent, ParsedIntentType } from './types';

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

  // Relative offset: "in 15 minutes", "in 2 hours"
  const relativeTimeMatch = /\bin\s+(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/i.exec(lower);
  if (relativeTimeMatch) {
    const amount = parseInt(relativeTimeMatch[1], 10);
    const unit = relativeTimeMatch[2].toLowerCase();
    const isHour = unit.startsWith('hour') || unit.startsWith('hr');
    const offsetMs = amount * (isHour ? 3600000 : 60000);
    const target = new Date(referenceDate.getTime() + offsetMs);
    date = formatLocalDate(target);
    time = formatLocalTime(target.getHours(), target.getMinutes());
    matchedText.push(relativeTimeMatch[0]);
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

  // Single time: "at 3pm", "3:30 pm", "at 14:00"
  if (!time) {
    const singleTimeMatch = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(lower);
    if (singleTimeMatch) {
      let hour = parseInt(singleTimeMatch[1], 10);
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
  if (/^(i(?:'m| am)? done|i did it|finished|got it|okay|ok|understood|acknowledged|thanks?)\b/i.test(lower)) {
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
  const snoozeMatch = /\b(?:snooze|remind me in|give me)\s*(?:for\s+)?(\d+)?\s*(minute|minutes|min|mins)?\b/i.exec(lower);
  if (snoozeMatch || /^\s*snooze\b/i.test(lower)) {
    const mins = snoozeMatch && snoozeMatch[1] ? parseInt(snoozeMatch[1], 10) : 10;
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
  if (/\b(?:what(?:'s| is) (?:on )?(?:my )?(?:schedule|calendar|tasks)|show (?:my )?(?:schedule|calendar|tasks))\b/i.test(lower)) {
    return {
      intent: 'query_schedule',
      title: null,
      date: formatLocalDate(referenceDate),
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

  // Strip matched date/time phrases
  for (const match of dt.matchedText) {
    cleanTitle = cleanTitle.replace(new RegExp(`\\b${escapeRegExp(match)}\\b`, 'gi'), '');
  }

  // Strip lingering prepositions at edges (ensuring word boundaries)
  cleanTitle = cleanTitle
    .replace(/^[\s,:-]*(?:\b(?:on|at|by|for|starting|with|to)\b[\s,:-]*)+/i, '')
    .replace(/(?:[\s,:-]*\b(?:on|at|by|for|starting|with|to)\b)+[\s,:-]*$/i, '')
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
