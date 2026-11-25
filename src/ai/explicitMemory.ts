import {
  inferMemoryCategory,
  inferMemoryTier,
  type MemoryCategory,
  type MemoryTier,
} from '../storage/chatMemoryStore';
import type {StudyPeakHour} from '../storage/preferencesStore';
import {
  inferStudyPeaksFromText,
  ONE_OFF_DATE_CUE,
  studyPreference,
} from './studyPreference';
import {
  containsPromptInjection,
  containsSensitiveSecret,
} from './voiceActions/promptSanitizer';

const NEGATED_REMEMBER = /\b(?:don'?t|do\s+not|never|stop)\s+remember\b/i;

const QUESTION_START =
  /^(?:what|when|where|why|how|who|which|do|does|did|am|are|is|can|could|would|will|should)\b/i;

const SCHEDULING_TIME_CUE =
  /\b(?:today|tonight|tomorrow|this\s+(?:morning|afternoon|evening|week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2})|in\s+\d+\s+(?:min(?:ute)?s?|hr?s?|hours?|days?)|(?:at|by|before|after)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

const ACTIONABLE_EVENT_NOUN =
  /\b(?:exam|midterm|finals?|quiz(?:zes)?|test|meeting|appointment|dentist|doctor|clinic|checkup|interview|defense|presentation|class(?:es)?|lecture|lab|deadline|assignment|project|homework|submission|submit|due|chore|errand|tuition|bill|groceries)\b/i;

const SCHEDULING_LEAD =
  /^(?:i\s+have|i['’]?ve\s+got|i\s+need\s+to|i\s+have\s+to|i\s+gotta|i\s+must|i\s+got|we\s+have|there\s+is)\b/i;

const ACTIONABLE_OBLIGATION_LEAD =
  /^(?:i\s+(?:need|have|ought|got|gotta)\s+to|i\s+must|i\s+should)\s+[a-z]+/i;

const SCHEDULING_ACTION_VERB =
  /\b(?:schedule|reschedule|create\s+(?:a|an)\s+(?:task|event|note|reminder|block)|add\s+(?:a|an)\s+(?:task|event|note|reminder|block)|book\s+(?:a|an)?|block\s+(?:out|off|time)|remind\s+me|set\s+(?:up\s+)?(?:a|an|my)\s+(?:alarm|reminder))\b/i;

const NON_NAME_WORDS = new Set([
  'back',
  'later',
  'tomorrow',
  'tonight',
  'today',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'morning',
  'afternoon',
  'evening',
  'night',
  'midnight',
  'noon',
  'at',
  'about',
  'when',
  'if',
  'in',
  'on',
  'soon',
  'now',
  'up',
  'please',
  'again',
  'before',
  'after',
  'by',
  'for',
  'maybe',
  'daily',
  'weekly',
  'hourly',
  'every',
  'instead',
  'asap',
  'urgently',
  'immediately',
  'directly',
  'first',
  'next',
  'anytime',
  'whenever',
  'online',
  'offline',
  'home',
  'here',
  'there',
  'something',
  'anything',
  'nothing',
  'everything',
]);

export interface ExplicitMemoryMatch {
  text: string;
  isStudyPreference: boolean;
  tier: MemoryTier;
  category: MemoryCategory;
  slotKey?: string | null;
  isPinned?: boolean;
  inferredPeaks?: StudyPeakHour[];
}

const isSchedulingTrap = (fact: string): boolean => {
  if (SCHEDULING_ACTION_VERB.test(fact)) return true;
  if (ACTIONABLE_OBLIGATION_LEAD.test(fact)) return true;
  if (
    SCHEDULING_LEAD.test(fact) &&
    (SCHEDULING_TIME_CUE.test(fact) || ACTIONABLE_EVENT_NOUN.test(fact))
  ) {
    return true;
  }
  if (SCHEDULING_TIME_CUE.test(fact) && ACTIONABLE_EVENT_NOUN.test(fact)) {
    return true;
  }
  return false;
};

const matchPreferredName = (input: string): ExplicitMemoryMatch | null => {
  const nameMatch =
    input.match(
      /^my\s+preferred\s+name\s+is\s+([a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,2})[.!]*$/i,
    ) ||
    input.match(
      /^(?:please\s+)?(?:you\s+can\s+)?call\s+me\s+([a-z][a-z'.-]*(?:\s+[a-z][a-z'.-]*){0,2})(?:\s+instead)?[.!]*$/i,
    );
  if (!nameMatch) return null;
  const candidate = nameMatch[1].trim().replace(/[,.!]+$/, '');
  if (candidate.length < 2 || candidate.length > 32) return null;
  const parts = candidate.split(/\s+/);
  if (
    parts.some(part => {
      const clean = part.replace(/\.$/, '').toLowerCase();
      return !clean || NON_NAME_WORDS.has(clean);
    })
  ) {
    return null;
  }
  return {
    text: `Prefers to be called ${candidate}.`,
    isStudyPreference: false,
    tier: 'core',
    category: 'identity',
    slotKey: 'onboarding:name',
    isPinned: true,
  };
};

const inferSlotForStandaloneFact = (fact: string): string | null => {
  const lower = fact.toLowerCase();
  if (
    /^i\s+(?:prefer|like|love)\s+(?:short|brief|concise|detailed|step[\s-]by[\s-]step|bullet(?:ed)?)\s+(?:answers?|replies|explanations?|notes?|points?)/.test(
      lower,
    )
  ) {
    return 'preference:reply_style';
  }
  if (
    /^(?:i\s+(?:usually|always|normally|typically|mostly)\s+(?:sleep|go\s+to\s+(?:bed|sleep)|stay\s+up)|i\s+stay\s+up\b)/.test(
      lower,
    )
  ) {
    return 'routine:sleep';
  }
  if (
    /^i\s+(?:usually|always|normally|typically|mostly)\s+(?:wake\s+up|get\s+up)\b/.test(
      lower,
    )
  ) {
    return 'routine:wake';
  }
  if (
    /^my\s+(?:major|course|program|degree)\s+is\s+/.test(lower) ||
    /^(?:i['’]?m|i\s+am)\s+(?:a|an)\s+(?:\d+(?:st|nd|rd|th)\s+year\s+)?[\w\s.&/-]{2,45}\s+(?:student|major)\b/.test(
      lower,
    )
  ) {
    return 'academic:major';
  }
  return null;
};

/**
 * Structured explicit memory extraction: captures study preferences, chronotypes,
 * personal routines, reply/learning preferences, and explicit "remember that..."
 * facts while rejecting secrets, prompt injection, and scheduling/deadline/question statements.
 */
export const extractExplicitMemory = (
  text: string,
): ExplicitMemoryMatch | null => {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (NEGATED_REMEMBER.test(normalized)) return null;
  if (normalized.endsWith('?') || QUESTION_START.test(normalized)) return null;
  if (
    containsPromptInjection(normalized) ||
    containsSensitiveSecret(normalized)
  ) {
    return null;
  }

  // Never hijack LAFINA's documented "Note: ..." / "Note - ..." note-creation syntax
  // unless it explicitly states a study preference (already rejected if bare note).
  const isBareNoteCommand = /^note\s*[:-]\s*/i.test(normalized);
  if (isBareNoteCommand) return null;

  const preference = studyPreference(normalized);
  if (preference) {
    const inferredPeaks = inferStudyPeaksFromText(preference);
    return {
      text: preference,
      isStudyPreference: true,
      tier: 'preference',
      category: 'study',
      slotKey: 'onboarding:study',
      ...(inferredPeaks.length > 0 ? {inferredPeaks} : {}),
    };
  }

  // Explicit memory commands ("remember that...", "remember I...", "keep in mind...",
  // "don't forget that I...", "note that I'm...", "take note that I...", "fyi I'm...",
  // "save to memory: ..."). Bare "note:" is intentionally excluded above.
  const leadMatch = normalized.match(
    /^(?:(?:hey|hi|hello|okay|ok)\s+(?:lafina\s*)?[,.!]?\s*)?(?:please\s+)?(?:(?:remember|keep\s+in\s+mind|don'?t\s+forget|do\s+not\s+forget|memorize|save(?:\s+(?:this|that))?\s+(?:to|in)\s+(?:your\s+|my\s+)?memor(?:y|ies))(?:\s+(?:that\s+)?|\s*[:-]\s*)|(?:take\s+note|note)\s+that\s+|(?:fyi|for\s+future\s+reference|just\s+so\s+you\s+know)[,:\s-]+)((?:i\s+(?:am|like|love|prefer|enjoy|study|have|['’]?ve\s+got|usually|always|never|dislike|hate|work|learn|sleep|wake|stay\s+up|focus|concentrate)|i['’]?m|(?:please\s+)?(?:you\s+can\s+)?call\s+me\s+|my\s+(?:name|preferred(?:\s+\w+)?|major|course|program|year|goal|favorite(?:\s+\w+)?|study\s+\w+|sleep\s+\w+|wake\s+\w+))\b.+?)[.!?]*$/i,
  );
  if (leadMatch) {
    const fact = leadMatch[1].trim().replace(/[.!?]+$/, '');
    if (fact.length < 3 || fact.length > 175) return null;
    if (isSchedulingTrap(fact)) return null;
    const namedFromLead = matchPreferredName(fact);
    if (namedFromLead) return namedFromLead;
    const slotKey = inferSlotForStandaloneFact(fact);
    const savedText = `Student says: ${fact}.`;
    return {
      text: savedText,
      isStudyPreference: false,
      tier: inferMemoryTier(fact),
      category: inferMemoryCategory(fact),
      ...(slotKey ? {slotKey} : {}),
    };
  }

  // Standalone preferred name ("my preferred name is Alex", "call me Alex").
  const standaloneName = matchPreferredName(normalized);
  if (standaloneName) return standaloneName;

  // Standalone clear personal habit / preference / academic profile facts without
  // needing the student to say "remember" first.
  if (
    normalized.length <= 175 &&
    !isSchedulingTrap(normalized) &&
    !ONE_OFF_DATE_CUE.test(normalized)
  ) {
    // Sleep / wake routine ("I usually wake up at 9am", "I usually sleep around 1am", "I stay up till 1am").
    if (
      /^(?:i\s+(?:usually|always|normally|typically|mostly)\s+(?:wake\s+up|get\s+up|sleep|go\s+to\s+(?:bed|sleep)|stay\s+up)|i\s+stay\s+up\s+(?:until|till|'til|past|around))\s+.+$/i.test(
        normalized,
      )
    ) {
      const fact = normalized.replace(/[.!?]+$/, '');
      const slotKey = inferSlotForStandaloneFact(fact);
      return {
        text: `Student says: ${fact}.`,
        isStudyPreference: false,
        tier: 'preference',
        category: 'routine',
        ...(slotKey ? {slotKey} : {}),
      };
    }

    // Answer / study method preference ("I prefer short answers", "I prefer studying with flashcards").
    if (
      /^(?:i\s+(?:prefer|like|love)\s+(?:short|brief|concise|detailed|step[\s-]by[\s-]step|bullet(?:ed)?)\s+(?:answers?|replies|explanations?|notes?|points?)|i\s+(?:prefer|like|love)\s+(?:studying|learning|reviewing)\s+(?:with|using|by|in)\s+.+)$/i.test(
        normalized,
      )
    ) {
      const fact = normalized.replace(/[.!?]+$/, '');
      const slotKey = inferSlotForStandaloneFact(fact);
      return {
        text: `Student says: ${fact}.`,
        isStudyPreference: false,
        tier: 'preference',
        category: inferMemoryCategory(fact),
        ...(slotKey ? {slotKey} : {}),
      };
    }

    // Direct academic identity ("My major is BSIT", "My course is Computer Science", "I'm a 3rd year BSIT student").
    if (
      /^(?:my\s+(?:major|course|program|degree)\s+is\s+\S.+|(?:i['’]?m|i\s+am)\s+(?:a|an)\s+(?:\d+(?:st|nd|rd|th)\s+year\s+)?[\w\s.&/-]{2,45}\s+(?:student|major))$/i.test(
        normalized,
      )
    ) {
      const fact = normalized.replace(/[.!?]+$/, '');
      const slotKey = inferSlotForStandaloneFact(fact);
      return {
        text: `Student says: ${fact}.`,
        isStudyPreference: false,
        tier: 'core',
        category: 'academic',
        ...(slotKey ? {slotKey} : {}),
      };
    }

    // Standalone personal/academic goal ("My goal is to make the Dean's List").
    if (/^my\s+(?:main\s+|academic\s+|personal\s+)?goal\s+is\s+\S.+$/i.test(normalized)) {
      const fact = normalized.replace(/[.!?]+$/, '');
      return {
        text: `Student says: ${fact}.`,
        isStudyPreference: false,
        tier: 'core',
        category: 'goal',
      };
    }
  }

  return null;
};

/**
 * Extracts a personal memory / study preference embedded inside a longer or
 * mixed message (e.g. "I'm a night owl, I prefer studying at night till 1am.
 * Can you help me plan my week?"), so LAFINA saves the preference without
 * dropping the student's question or request.
 */
export const extractEmbeddedMemory = (
  text: string,
): ExplicitMemoryMatch | null => {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (!normalized || NEGATED_REMEMBER.test(normalized)) return null;
  if (
    containsPromptInjection(normalized) ||
    containsSensitiveSecret(normalized)
  ) {
    return null;
  }
  if (extractExplicitMemory(normalized)) return null;

  const clauses = normalized
    .split(
      /(?:[.!?;]+\s+|(?:\s*[-—–]\s*|\s*,\s*)(?=(?:can|could|would|will|what|when|where|how|help|suggest|recommend|plan|schedule|make|give|create|remind|tell)\b))/i,
    )
    .map(part => part.trim())
    .filter(part => part.length >= 6);

  if (clauses.length < 2) return null;

  for (const clause of clauses) {
    if (clause.endsWith('?') || QUESTION_START.test(clause)) continue;
    const match = extractExplicitMemory(clause);
    if (match) return match;
  }
  return null;
};

/**
 * Explicit memory, distinct from an instruction ("remember to call") or a dated
 * scheduling statement ("remember I have a math exam tomorrow").
 */
export const explicitMemory = (text: string): string | null =>
  extractExplicitMemory(text)?.text ?? null;
