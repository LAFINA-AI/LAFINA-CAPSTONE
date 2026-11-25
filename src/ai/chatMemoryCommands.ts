/** Only a complete, explicit command authorizes clearing local memories.
 * Quoted text, questions, negation and requests to forget a particular fact
 * stay on the normal conversation path.
 */
export const isForgetAllMemoriesRequest = (text: string): boolean =>
  /^(?:please\s+)?(?:forget (?:everything(?: (?:you (?:know|remember) about me|about me))?|all (?:of )?(?:my |your )?(?:saved )?memories(?: about me)?)|(?:clear|delete|remove) all (?:of )?(?:my |your )?(?:saved )?memories(?: about me)?)(?:\s+please)?[.!]*$/i.test(
    text.trim().replace(/\s+/g, ' '),
  );

const MEMORY_RECALL_ALL_RE =
  /^(?:(?:hey|hi|hello)\s+(?:lafina\s*)?[,.!]?\s*)?(?:please\s+)?(?:what\s+do\s+you\s+(?:remember|know)\s+about\s+me|what\s+(?:are|is)\s+(?:in\s+)?(?:my|your)\s+(?:saved\s+)?memor(?:y|ies)|what\s+memor(?:y|ies)\s+do\s+you\s+(?:have|keep|store)(?:\s+(?:about|for)\s+me)?|(?:show|list|view|check|tell\s+me)\s+(?:all\s+(?:of\s+)?)?(?:my|your)\s+(?:saved\s+)?memor(?:y|ies)|do\s+you\s+remember\s+anything\s+about\s+me)[?!.\s]*$/i;

// Requires an explicit personal/memory anchor ("my ...", "(that) I'm ...", "what I prefer/told you")
// so general knowledge, USTP handbook, and planner questions ("Do you know Python?",
// "Do you know what the USTP grading system is?") are never hijacked.
const MEMORY_RECALL_TOPIC_RE =
  /^(?:(?:hey|hi|hello)\s+(?:lafina\s*)?[,.!]?\s*)?(?:do\s+you\s+remember\s+(?:(?:what|when|about)\s+)?my\s+(.+?)|do\s+you\s+remember\s+(?:that\s+)?i(?:['’]?m|\s+am|\s+)(.+?)|do\s+you\s+remember\s+what\s+i\s+(?:prefer|like|told\s+you|said)(?:\s+about\s+(.+?))?|do\s+you\s+know\s+(?:(?:what|when|about)\s+)?(?:my\s+(preferred\s+[\w\s]+|study\s+[\w\s]+|sleep\s+[\w\s]+|wake\s+[\w\s]+|major|course|program|degree|year\s*level|goal|name|favorite\s+[\w\s]+|habit(?:s)?|routine|tone|style)|if\s+i(?:'m|\s+am)\s+(?:a|an)\s+(night\s*owl|early\s*bird|morning\s+person))|what(?:'s|\s+is|\s+are)\s+my\s+(?:saved\s+)?(preferred\s+study\s+(?:time|hours?)|study\s+(?:preference|time|hours?|habit)s?|(?:preferred\s+)?name|sleep\s+(?:schedule|time)|wake\s+time)|when\s+do\s+i\s+(?:prefer|like|love|usually)\s+(?:to\s+study|studying)|am\s+i\s+(?:a|an)\s+(night\s*owl|early\s*bird|morning\s+person))[?!.\s]*$/i;

const PLANNER_RECALL_EXCLUSION_RE =
  /\b(?:class(?:es)?|exam(?:s)?|quiz(?:zes)?|midterm(?:s)?|final(?:s)?|deadline(?:s)?|assignment(?:s)?|homework|project(?:s)?|lab(?:s)?|lecture(?:s)?|meeting(?:s)?|appointment(?:s)?|dentist|doctor|session(?:s)?|block(?:s)?|calendar|task(?:s)?|to-?do(?:s)?|reminder(?:s)?|alarm(?:s)?|note(?:s)?|event(?:s)?|tomorrow|today|tonight|weekend|week|month|when|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

const extractTopicFromMatch = (match: RegExpExecArray): string =>
  (
    match[1] ||
    match[2] ||
    match[3] ||
    match[4] ||
    match[5] ||
    match[6] ||
    match[7] ||
    ''
  ).trim();

const isPlannerScheduleTopic = (rawTopic: string): boolean => {
  if (PLANNER_RECALL_EXCLUSION_RE.test(rawTopic)) return true;
  // Allow "sleep schedule" as a memory topic, but exclude calendar "schedule".
  if (/\bschedule\b/i.test(rawTopic) && !/\bsleep\s+schedule\b/i.test(rawTopic)) {
    return true;
  }
  return false;
};

/**
 * True when the student is asking what LAFINA remembers about them
 * (works offline and online directly from local SQLite memory).
 */
export const isMemoryRecallQuery = (text: string): boolean => {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 140) return false;
  if (MEMORY_RECALL_ALL_RE.test(normalized)) return true;
  const topicMatch = MEMORY_RECALL_TOPIC_RE.exec(normalized);
  if (!topicMatch) return false;
  const rawTopic = extractTopicFromMatch(topicMatch).toLowerCase();
  if (!rawTopic) return true;
  // Avoid hijacking calendar/schedule/task/note queries like "do you remember my tasks?"
  if (isPlannerScheduleTopic(rawTopic)) {
    return false;
  }
  return true;
};

/** Extracts an optional filter topic from a memory recall question. */
export const extractMemoryRecallTopic = (text: string): string | null => {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (!normalized || MEMORY_RECALL_ALL_RE.test(normalized)) return null;
  const match = MEMORY_RECALL_TOPIC_RE.exec(normalized);
  if (!match) return null;
  if (/\bwhen\s+do\s+i\s+/i.test(normalized)) return 'study';
  const topic = extractTopicFromMatch(match);
  return topic || null;
};

const NEGATED_FORGET_RE = /^(?:don'?t|do\s+not|never)\s+forget\b/i;
const DISMISS_FORGET_RE =
  /^(?:forget\s+(?:it|about\s+it|that|this|everything\s+else)|never\s*mind)[.!\s]*$/i;

const CONVERSATIONAL_FORGET_TARGET_RE =
  /^(?:what\s+i\s+(?:just\s+)?said|the\s+(?:previous|last)\s+|that\s+(?:previous|last|one)\b|(?:that|this|it)\s*,)/i;

const PLANNER_FORGET_NOUN_RE =
  /\b(?:alarm(?:s)?|task(?:s)?|to-?do(?:s)?|event(?:s)?|note(?:s)?|reminder(?:s)?|class(?:es)?|exam(?:s)?|quiz(?:zes)?|midterm(?:s)?|final(?:s)?|meeting(?:s)?|appointment(?:s)?|dentist|doctor|session(?:s)?|block(?:s)?|lecture(?:s)?|schedule|deadline(?:s)?|assignment(?:s)?|homework|project(?:s)?|lab(?:s)?|question(?:s)?|problem(?:s)?|tomorrow|today|tonight)\b/i;

const MULTI_CLAUSE_REDIRECT_RE =
  /,\s*(?:can|could|would|let'?s|explain|help|tell|show|schedule|create|add|remind|write|summarize|plan|answer|solve|give)\b/i;

/**
 * Extracts the target phrase when the student asks LAFINA to forget one
 * specific memory ("forget that I'm a morning person", "forget my study preference").
 */
export const extractForgetSpecificMemoryQuery = (
  text: string,
): string | null => {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (
    !normalized ||
    normalized.length > 160 ||
    normalized.endsWith('?') ||
    isForgetAllMemoriesRequest(normalized) ||
    NEGATED_FORGET_RE.test(normalized) ||
    DISMISS_FORGET_RE.test(normalized)
  ) {
    return null;
  }
  const match = normalized.match(
    /^(?:please\s+)?(?:forget\s+(?:that\s+|about\s+)?|(?:delete|remove)\s+(?:the\s+|my\s+)?memor(?:y|ies)\s+(?:that\s+|about\s+|for\s+|of\s+)?)(.+?)(?:\s+from\s+(?:my\s+|your\s+)?memor(?:y|ies))?[.!]*$/i,
  );
  if (!match) return null;
  const target = match[1].trim();
  if (target.length < 3) return null;
  if (CONVERSATIONAL_FORGET_TARGET_RE.test(target)) return null;
  if (MULTI_CLAUSE_REDIRECT_RE.test(target)) return null;
  // Don't hijack planner deletion ("forget my 3pm alarm", "forget about that task",
  // "forget my math exam", "forget my dentist appointment") unless memory is explicit.
  const explicitlyMentionsMemory = /\bmemor(?:y|ies)\b/i.test(normalized);
  if (
    !explicitlyMentionsMemory &&
    PLANNER_FORGET_NOUN_RE.test(target) &&
    !/\bsleep\s+schedule\b/i.test(target)
  ) {
    return null;
  }
  return target;
};

const STOP_WORDS = new Set([
  'i',
  'im',
  'am',
  'my',
  'me',
  'the',
  'a',
  'an',
  'that',
  'this',
  'about',
  'is',
  'are',
  'was',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'do',
  'you',
  'remember',
  'know',
  'saved',
  'memory',
  'memories',
  'preference',
  'preferences',
]);

// Generic wrapper nouns dropped when paired with a concrete memory anchor
// (e.g. "preferred name" -> ["name"], "preferred study time" -> ["study"],
// "morning person" -> ["morning"], "sleep schedule" -> ["sleep"]).
const QUERY_WRAPPER_WORDS = new Set([
  'preferred',
  'time',
  'times',
  'hour',
  'hours',
  'schedule',
  'habit',
  'habits',
  'person',
]);

const tokenizeForMemoryMatch = (text: string): string[] => {
  const raw = Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/['’]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(token => token.length >= 2 && !STOP_WORDS.has(token)),
    ),
  );
  const meaningful = raw.filter(t => !QUERY_WRAPPER_WORDS.has(t));
  return meaningful.length > 0 ? meaningful : raw;
};

const TOKEN_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  study: ['study', 'studying', 'focusing', 'reviewing'],
  studying: ['study', 'studying', 'focusing', 'reviewing'],
  night: ['night', 'nights', 'overnight'],
  owl: ['owl'],
  morning: ['morning', 'mornings'],
  early: ['early', 'morning', 'mornings'],
  name: ['name', 'called'],
  prefer: ['prefer', 'prefers', 'preferred', 'likes', 'wants'],
  prefers: ['prefer', 'prefers', 'preferred', 'likes', 'wants'],
  sleep: ['sleep', 'sleeps', 'bed', 'stay'],
  wake: ['wake', 'wakes', 'up'],
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasWholeWord = (lowerText: string, word: string): boolean =>
  new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').test(lowerText);

/** Finds saved memories matching a topic or targeted forget phrase. */
export const findMatchingMemories = <T extends {id: string; text: string}>(
  memories: readonly T[],
  query: string,
): T[] => {
  const tokens = tokenizeForMemoryMatch(query);
  if (tokens.length === 0) return [];
  const groups = tokens.map(token => TOKEN_SYNONYMS[token] ?? [token]);
  // Each original query token contributes at most 1 hit, matched on word boundaries,
  // so synonym expansion never double-counts a single word and unrelated memories
  // (e.g. "study biology" vs "Prefers studying at night") are never deleted.
  const minHits =
    groups.length <= 2 ? groups.length : Math.ceil(groups.length * 0.7);
  return memories.filter(memory => {
    const lower = memory.text.toLowerCase();
    let hits = 0;
    for (const variants of groups) {
      if (variants.some(variant => hasWholeWord(lower, variant))) {
        hits += 1;
      }
    }
    return hits >= minHits;
  });
};

/** Formats a truthful, readable reply for local or online memory recall. */
export const formatMemoryRecallReply = (
  memories: readonly {id: string; text: string}[],
  enabled: boolean,
  topic?: string | null,
): string => {
  if (!enabled) {
    return 'Memory is turned off right now, so I am not using saved memories. You can turn it back on in Profile -> What LAFINA remembers.';
  }
  if (memories.length === 0) {
    return 'I do not have any saved memories about you yet. You can tell me things like "I\'m a night owl, I prefer studying at night till 1am" or add them in Profile -> What LAFINA remembers.';
  }
  if (topic) {
    const matched = findMatchingMemories(memories, topic);
    if (matched.length > 0) {
      const bullets = matched
        .slice(0, 8)
        .map(m => `• ${m.text}`)
        .join('\n');
      return `Yes, here is what I remember about that:\n${bullets}`;
    }
    const bullets = memories
      .slice(0, 6)
      .map(m => `• ${m.text}`)
      .join('\n');
    return `I don't have a specific memory saved about "${topic}" yet. Here is what I currently remember:\n${bullets}`;
  }
  const shown = memories.slice(0, 12);
  const bullets = shown.map(m => `• ${m.text}`).join('\n');
  const extra =
    memories.length > shown.length
      ? `\n\n(+${memories.length - shown.length} more in Profile -> What LAFINA remembers)`
      : '';
  return `Here is what I remember about you:\n${bullets}${extra}`;
};
