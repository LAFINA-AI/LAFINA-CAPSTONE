import {studyPreference} from './studyPreference';

const NEGATED_REMEMBER = /^(?:don'?t|do\s+not|never|stop)\s+remember\b/i;

const SCHEDULING_TIME_CUE =
  /\b(?:today|tonight|tomorrow|this\s+(?:morning|afternoon|evening|week|weekend)|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:at|by|before|after)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})\s*(?:am|pm))\b/i;

const ACTIONABLE_EVENT_NOUN =
  /\b(?:exam|midterm|finals?|quiz(?:zes)?|test|meeting|appointment|interview|defense|presentation|class(?:es)?|lecture|lab|deadline|assignment|project|homework|submission|submit|due|chore|errand)\b/i;

const SCHEDULING_LEAD =
  /^(?:i\s+have|i['’]ve\s+got|i\s+need\s+to|i\s+got|we\s+have|there\s+is)\b/i;

/**
 * Explicit memory, distinct from an instruction ("remember to call") or a dated
 * scheduling statement ("remember I have a math exam tomorrow").
 */
export const explicitMemory = (text: string): string | null => {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (NEGATED_REMEMBER.test(normalized)) return null;
  const preference = studyPreference(normalized);
  if (preference) return preference;
  const match = normalized.match(
    /^(?:please\s+)?(?:remember|keep\s+in\s+mind|note)\s+(?:that\s+)?((?:i\s+(?:am|like|love|prefer|enjoy|study|have|['’]ve\s+got|usually|always|never|need|dislike|hate|work|learn)|i['’]m|my\s+(?:name|preferred(?:\s+\w+)?|major|course|program|year|goal|favorite(?:\s+\w+)?|study\s+\w+))\b.+?)[.!?]*$/i,
  );
  if (!match) return null;
  const fact = match[1].trim().replace(/[.!?]+$/, '');
  if (fact.length < 3 || fact.length > 175) return null;
  if (
    SCHEDULING_LEAD.test(fact) &&
    (SCHEDULING_TIME_CUE.test(fact) || ACTIONABLE_EVENT_NOUN.test(fact))
  ) {
    return null;
  }
  if (SCHEDULING_TIME_CUE.test(fact) && ACTIONABLE_EVENT_NOUN.test(fact)) {
    return null;
  }
  return `Student says: ${fact}.`;
};
