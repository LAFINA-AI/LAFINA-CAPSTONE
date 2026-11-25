import type {StudyPeakHour} from '../storage/preferencesStore';

const NEGATED_REMEMBER = /\b(?:don'?t|do\s+not|never|stop)\s+remember\b/i;

const SCHEDULING_ACTION_VERB =
  /\b(?:schedule|reschedule|create|add|book|block|remind|set\s+up|set\s+an?\s+(?:alarm|reminder)|put\s+.+\s+on\s+(?:my|the)\s+(?:calendar|schedule))\b/i;

const QUESTION_START =
  /^(?:what|when|where|why|how|who|which|do|does|did|am|are|is|can|could|would|will|should)\b/i;

// Must contain an actual time-of-day or clock expression — never bare prepositions
// like "at the library", "in the dorm", or "from my notes".
const STUDY_TIME_WINDOW_CUE =
  /\b(?:late\s+at\s+night|late[\s-]+night|overnight|early\s+morning|late\s+morning|mornings?|afternoons?|evenings?|nights?|midnight|noon|dawn|sunrise|sunset|\d{1,2}(?::[0-5]\d)?\s*(?:am|pm))\b/i;

const NEGATED_NIGHT_OWL_RE =
  /\b(?:not|no\s+longer|never|n['’]t)\s+(?:a\s+|an\s+)?night\s*owl\b/i;
const NEGATED_EARLY_BIRD_RE =
  /\b(?:not|no\s+longer|never|n['’]t)\s+(?:a\s+|an\s+)?(?:early\s*bird|morning\s+person)\b/i;

const NIGHT_OWL_RE = /\bnight\s*owl\b/i;
const EARLY_BIRD_RE = /\b(?:early\s*bird|morning\s+person)\b/i;

const MEMORY_LEAD_STRIP =
  /^(?:(?:hey|hi|hello|okay|ok)\s+(?:lafina\s*)?[,.!]?\s*)?(?:please\s+)?(?:(?:remember|keep\s+in\s+mind|don'?t\s+forget|do\s+not\s+forget|take\s+note|note|memorize|save(?:\s+(?:this|that))?\s+(?:to|in)\s+(?:your\s+|my\s+)?memor(?:y|ies))\s*(?:that\s+|:\s*|-+\s*)?|(?:fyi|for\s+future\s+reference|just\s+so\s+you\s+know|btw|by\s+the\s+way)[,:\s-]+)/i;

const NEGATED_CLAUSE_RE =
  /\b(?:not\s+(?:a|an|in|at|during|my|good|productive|studying|working|late|mornings?|afternoons?|evenings?|nights?|overnight|midnight|noon)|don['’]?t\s+(?:like|love|prefer|enjoy|want|study|focus|work)|do\s+not\s+(?:like|love|prefer|enjoy|want|study|focus|work)|hate|dislike|avoid|can['’]?t\s+(?:study|focus|concentrate|work)|cannot\s+(?:study|focus|concentrate|work)|never\s+(?:study|focus|work)|no\s+longer\s+(?:study|prefer|like|a|an))\b/i;

const stripChronotypeLead = (text: string): string =>
  text
    .replace(
      /^(?:(?:i(?:'|’)?m|i\s+am)(?:\s+not)?\s+(?:a|an)\s+(?:night\s*owl|early\s*bird|morning\s+person)\s*(?:[,;&-]\s*|\s+and\s+|\s+so\s+|\s+but\s+))+?/i,
      '',
    )
    .replace(
      /^(?:i\s+(?:don['’]?t|do\s+not)\s+(?:like|love|prefer|enjoy)\s+(?:studying|to\s+study|working|to\s+work)\s+[^,.;!?]+(?:[,;]\s*|\s+but\s+))/i,
      '',
    )
    .trim();

const stripTrailingChronotype = (text: string): string =>
  text
    .replace(
      /\s*(?:[,;&-]\s*|\s+and\s+|\s+because\s+|\s+since\s+)(?:i(?:'|’)?m|i\s+am)(?:\s+not)?\s+(?:a|an)\s+(?:night\s*owl|early\s*bird|morning\s+person)\b.*$/i,
      '',
    )
    .trim();

const cleanWindow = (raw: string): string =>
  stripTrailingChronotype(raw)
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const clockHourToPeak = (
  hour12: number,
  meridiem: string,
): StudyPeakHour | null => {
  if (hour12 < 1 || hour12 > 12) return null;
  const lowerM = meridiem.toLowerCase();
  const h24 =
    lowerM === 'am'
      ? hour12 === 12
        ? 0
        : hour12
      : hour12 === 12
      ? 12
      : hour12 + 12;
  if (h24 >= 21 || h24 <= 4) return 'night';
  if (h24 >= 18 && h24 <= 20) return 'evening';
  if (h24 >= 12 && h24 <= 17) return 'afternoon';
  if (h24 >= 10 && h24 <= 11) return 'late_morning';
  return 'morning';
};

const extractPeaksFromPositiveClause = (clause: string): StudyPeakHour[] => {
  const lower = clause.toLowerCase();
  const hits: Array<{index: number; peak: StudyPeakHour}> = [];

  // 1a. Shared-meridiem ranges like "from 8 to 10pm" or "10 to 2am"
  const sharedRangeRe =
    /\b(\d{1,2})(?::([0-5]\d))?\s*(?:to|-|–|—|until|till|'til)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/gi;
  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = sharedRangeRe.exec(lower)) !== null) {
    const startH = Number(rangeMatch[1]);
    const endH = Number(rangeMatch[3]);
    const endMeridiem = rangeMatch[5].toLowerCase();
    // If start > end (e.g. "10 to 2am") and start != 12, start is opposite meridiem (10pm).
    const startMeridiem =
      startH > endH && startH !== 12
        ? endMeridiem === 'am'
          ? 'pm'
          : 'am'
        : endMeridiem;
    const startPeak = clockHourToPeak(startH, startMeridiem);
    const endPeak = clockHourToPeak(endH, endMeridiem);
    if (startPeak) hits.push({index: rangeMatch.index, peak: startPeak});
    if (endPeak) hits.push({index: rangeMatch.index + 1, peak: endPeak});
  }

  // 1b. Explicit clock times (supports :00, :30, :45, 12am..11:59pm)
  const clockRe = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/gi;
  let clockMatch: RegExpExecArray | null;
  while ((clockMatch = clockRe.exec(lower)) !== null) {
    const h = Number(clockMatch[1]);
    const peak = clockHourToPeak(h, clockMatch[3]);
    if (peak) {
      hits.push({index: clockMatch.index, peak});
    }
  }

  // 2. Named time-of-day periods (preserving order, avoiding "late morning" double-matching "morning")
  const namedPatterns: Array<{re: RegExp; peak: StudyPeakHour}> = [
    {
      re: /\b(?:night\s*owl|late\s+at\s+night|late[\s-]+night|at\s+night|nights?|overnight|midnight|after\s+midnight)\b/g,
      peak: 'night',
    },
    {re: /\b(?:evenings?)\b/g, peak: 'evening'},
    {re: /\b(?:afternoons?|noon|midday)\b/g, peak: 'afternoon'},
    {re: /\blate\s+mornings?\b/g, peak: 'late_morning'},
    {
      re: /\b(?:early\s*bird|morning\s+person|early\s+morning|in\s+the\s+morning|dawn)\b/g,
      peak: 'morning',
    },
  ];
  for (const {re, peak} of namedPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      hits.push({index: m.index, peak});
    }
  }

  // Bare "morning(s)" only when not preceded by "late "
  const bareMorningRe = /\bmornings?\b/g;
  let mm: RegExpExecArray | null;
  while ((mm = bareMorningRe.exec(lower)) !== null) {
    const prefix = lower.slice(Math.max(0, mm.index - 8), mm.index);
    if (/\blate\s+$/.test(prefix)) continue;
    hits.push({index: mm.index, peak: 'morning'});
  }

  hits.sort((a, b) => a.index - b.index);
  const result: StudyPeakHour[] = [];
  for (const h of hits) {
    if (!result.includes(h.peak)) result.push(h.peak);
  }
  return result;
};

/**
 * Infers structured `StudyPeakHour` windows from any positive natural-language
 * study preference statement (e.g. "night owl", "from 6pm to 10pm", "early bird"),
 * preserving order of appearance and ignoring negated clauses.
 */
export const inferStudyPeaksFromText = (text: string): StudyPeakHour[] => {
  const raw = (text || '').trim();
  if (!raw) return [];

  const clauses = raw
    .split(
      /(?:[.!?;]+|,\s*(?=(?:i(?:'|’)?m|i\s+|not\s+|but\s+|however\s+))|\bbut\b)/i,
    )
    .map(c => c.trim())
    .filter(Boolean);

  const hints: StudyPeakHour[] = [];
  for (const clause of clauses) {
    if (NEGATED_CLAUSE_RE.test(clause)) continue;
    for (const peak of extractPeaksFromPositiveClause(clause)) {
      if (!hints.includes(peak)) hints.push(peak);
    }
  }
  return hints;
};

export const ONE_OFF_DATE_CUE =
  /\b(?:today|tonight|tomorrow|this\s+(?:morning|afternoon|evening|week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;

/** Recognize a personal study preference, not a request to schedule a block. */
export const studyPreference = (text: string): string | null => {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (NEGATED_REMEMBER.test(normalized)) return null;
  if (normalized.endsWith('?') || QUESTION_START.test(normalized)) return null;
  if (SCHEDULING_ACTION_VERB.test(normalized)) return null;
  if (ONE_OFF_DATE_CUE.test(normalized)) return null;

  const stripped = normalized.replace(MEMORY_LEAD_STRIP, '').trim();
  if (!stripped || QUESTION_START.test(stripped)) return null;

  const isNightOwl =
    NIGHT_OWL_RE.test(stripped) && !NEGATED_NIGHT_OWL_RE.test(stripped);
  const isEarlyBird =
    EARLY_BIRD_RE.test(stripped) && !NEGATED_EARLY_BIRD_RE.test(stripped);
  const body = stripChronotypeLead(stripped);
  const hadStudyOrChronotypeLead = body !== stripped;

  const prefMatch =
    body.match(
      /^(?:i\s+(?:like|love|prefer|enjoy)\s+(?:to\s+(?:study|review|focus|work)|studying|reviewing|focusing|working)|my\s+preferred\s+(?:study|focus)\s+(?:time|hours?)\s+(?:is|are)|my\s+study\s+hours?\s+(?:is|are)|i\s+(?:usually|always|mostly|normally)\s+(?:study|review|focus)|i\s+(?:study|review|focus|work)\s+(?:best|better)|i\s+(?:study|review)\s+(?=(?:at\s+night|late|until|till|'til|from|between|in\s+the|during|after|before)))\s*(.+?)[.!?]*$/i,
    ) ||
    body.match(
      /^(?:i(?:'|’)?m|i\s+am)\s+(?:most|more)\s+productive\s+(.+?)[.!?]*$/i,
    ) ||
    body.match(
      /^i\s+stay\s+up\s+((?:until|till|'til|to)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:studying|to\s+study|reviewing|to\s+review)[.!?]*$/i,
    ) ||
    (hadStudyOrChronotypeLead
      ? body.match(
          /^i\s+(?:prefer|like|love)\s+((?:early\s+morning|late\s+morning|in\s+the\s+(?:morning|afternoon|evening)|at\s+night|mornings?|afternoons?|evenings?|nights?)(?:\b.*)?)[.!?]*$/i,
        )
      : null);

  if (prefMatch) {
    const rawWindow = prefMatch[1] ?? '';
    const window = cleanWindow(rawWindow);
    if (window && window.length <= 140 && STUDY_TIME_WINDOW_CUE.test(window)) {
      const formattedWindow = /^\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)\b/i.test(
        window,
      )
        ? `at ${window}`
        : window;
      const suffix = isNightOwl
        ? ' (night owl)'
        : isEarlyBird
        ? ' (morning person)'
        : '';
      return `Prefers studying ${formattedWindow}${suffix}.`;
    }
  }

  // Standalone chronotype statement ("I'm a night owl", "im an night owl", "I'm a morning person").
  if (
    /^(?:i(?:'|’)?m|i\s+am)\s+(?:a|an)\s+(?:night\s*owl|early\s*bird|morning\s+person)(?:\s+(?:so\s+i\s+.*))?[.!?]*$/i.test(
      stripped,
    )
  ) {
    if (isNightOwl) {
      return 'Prefers studying late at night (night owl).';
    }
    if (isEarlyBird) {
      return 'Prefers studying in the morning (morning person).';
    }
  }

  return null;
};
