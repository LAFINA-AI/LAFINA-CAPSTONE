/** Split planner requests without splitting conjunctions inside quoted titles. */
const ACTION_START =
  /^(?:(?:please|also|then)\s+)*(?:(?:remind(?:er)?|schedule|add|create|set|make|task|event|note|meeting|jot|write)\b|save\b(?!\s+(?:it|that|this|them)\b)|(?:a|an|another)\s+(?:task|event|meeting|reminder|note|time\s*block)\b)/i;
const REMINDER_START =
  /^(?:please\s+)?(?:remind\s+me|(?:add|create|set)\s+(?:a\s+)?reminder)\b/i;
const TIME_START =
  /^(?:(?:on|at)\s+)?(?:(?:next|this)\s+)?(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

export function splitGroupedClauses(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  // Keep offsets stable and leave apostrophes inside words ("don't") alone.
  const visible = normalized.replace(
    /"[^"]*"|“[^”]*”|(?:^|\s)'[^']*'(?=\s|$|[.,;])/g,
    match => ' '.repeat(match.length),
  );
  const separators =
    /;\s*|(?:,\s*|\s+)(?:and(?:\s+then)?|also|plus|then|tapos|at\s+saka)\s+/gi;
  const cuts: Array<{start: number; end: number}> = [];
  const inheritedReminder = REMINDER_START.test(normalized);
  for (const match of visible.matchAll(separators)) {
    const end = match.index! + match[0].length;
    const tail = visible.slice(end);
    const timedReminder =
      inheritedReminder && TIME_START.test(tail) && /\bto\s+\S/i.test(tail);
    if (ACTION_START.test(tail) || timedReminder)
      cuts.push({start: match.index!, end});
  }
  const clauses: string[] = [];
  let start = 0;
  for (const cut of cuts) {
    const clause = normalized.slice(start, cut.start).trim();
    if (clause) clauses.push(clause);
    start = cut.end;
  }
  const last = normalized.slice(start).trim();
  if (last) clauses.push(last);
  return clauses.map((clause, index) => {
    if (!index || !inheritedReminder || !TIME_START.test(clause)) return clause;
    // "...and then on Monday 8am to go jogging" shares "remind me".
    // Move only the explicitly spoken activity; never inherit the first date.
    const timed = /^(.*?)\s+to\s+(.+?)[.!?]*$/i.exec(clause);
    return timed
      ? `remind me to ${timed[2].trim()} ${timed[1].trim()}`
      : clause;
  });
}
