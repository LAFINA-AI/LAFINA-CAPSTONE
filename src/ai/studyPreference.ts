/** Recognize a personal study preference, not a request to schedule a block. */
export const studyPreference = (text: string): string | null => {
  const value = text.trim().replace(/\s+/g, ' ')
    .replace(/^(?:please\s+)?remember\s+(?:that\s+)?(?=i\s+(?:like|love|prefer|enjoy)\b)/i, '');
  if (/\b(?:schedule|create|add|book|block|remind|set up)\b/i.test(value)) return null;
  const match = value.match(
    /^(?:i\s+(?:like|love|prefer|enjoy)\s+(?:to\s+study|studying)|my\s+preferred\s+study\s+time\s+is)\s+(.+?)[.!]?$/i,
  );
  if (!match || !/\b(?:between|from|at|in the|during|after|before)\b/i.test(match[1])) return null;
  return `Prefers studying ${match[1].replace(/[.!?]+$/, '')}.`;
};
