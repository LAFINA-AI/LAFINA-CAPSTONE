import {studyPreference} from './studyPreference';

/** Explicit memory, distinct from an instruction such as “remember to call”. */
export const explicitMemory = (text: string): string | null => {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const preference = studyPreference(normalized);
  if (preference) return preference;
  const match = normalized.match(/^(?:please\s+)?remember\s+(?:that\s+)?((?:i\s+(?:am|like|love|prefer|enjoy|study|have)|i['’]m|my\s+name\s+is|my\s+preferred)\b.+?)[.!?]*$/i);
  if (!match) return null;
  const fact = match[1].trim().replace(/[.!?]+$/, '');
  if (fact.length < 3 || fact.length > 175) return null;
  return `Student says: ${fact}.`;
};
