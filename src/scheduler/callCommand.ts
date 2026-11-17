export interface CallCommand {
  intent: 'acknowledge' | 'snooze';
  minutes: number | null;
}
const NUMBERS: Record<string, number> = {
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
};
const duration = (text: string): number | null => {
  const match =
    /^(?:in |for )?(.+?)\s+(?:more\s+)?(minutes?|mins?|hours?)(?: more)?$/.exec(
      text,
    );
  if (!match) return null;
  const raw = match[1];
  let number = /^\d+$/.test(raw)
    ? Number(raw)
    : raw === 'a' || raw === 'an'
    ? 1
    : NUMBERS[raw];
  if (!number) {
    const parts = raw.split(' ');
    if (
      parts.length === 2 &&
      NUMBERS[parts[0]] >= 20 &&
      NUMBERS[parts[0]] % 10 === 0 &&
      NUMBERS[parts[1]] < 10
    )
      number = NUMBERS[parts[0]] + NUMBERS[parts[1]];
  }
  const minutes = number * (match[2].startsWith('hour') ? 60 : 1);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 120
    ? minutes
    : null;
};

/** Whole commands only. Casual answers apply solely to the offline choice prompt. */
export const detectCallKeyword = (
  transcript: string,
  options: {casual?: boolean} = {},
): CallCommand | null => {
  let text = transcript
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/-/g, ' ')
    .replace(/[.,!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || /\?/.test(text)) return null;
  if (
    /\b(?:don't|do not|never|not)\b.*\b(?:remind|call|snooz\w*|acknowledg\w*|got it)\b/.test(
      text,
    )
  )
    return null;
  if (options.casual) {
    if (
      /^(?:yes|yeah|yep|yup|ok|okay|alright|all right|sure|noted|copy(?: that)?|will do|i will|i'?ll do it|i'?m doing it|doing it(?: now)?|on my way|sige|oo|opo)(?: (?:lafina|please|thanks|thank you|po))?$/.test(
        text,
      )
    )
      return {intent: 'acknowledge', minutes: null};
    if (
      /^(?:not now|later|maybe later|in a bit|in a while|a bit later|wait|hold on|i'?m busy|busy|mamaya(?: na)?|saglit(?: lang)?|teka(?: lang)?)(?: (?:lafina|please|po))?$/.test(
        text,
      )
    )
      return {intent: 'snooze', minutes: null};
  }
  text = text
    .replace(
      /^(?:(?:okay|ok|yes|yeah|yep|alright|sure|thanks|thank you|lafina|please) )+/,
      '',
    )
    .replace(/(?: (?:please|thanks|thank you|lafina|po))+$/, '');
  if (
    /^(?:(?:i (?:have )?|i've )?(?:acknowledge|acknowledged|acknowlege|knowledged)(?: (?:this reminder|the reminder|this|it))?|(?:i(?:'ve)? )?got it|understood|noted|i'?m on it|on it)$/.test(
      text,
    )
  )
    return {intent: 'acknowledge', minutes: null};
  if (/^(?:remind|call) (?:me|you)$/.test(text)) return null;
  const snooze =
    /^(?:snooz(?:e|ed)(?: (?:this reminder|the reminder|this|it))?|remind (?:me|you)(?: again)?|call (?:me|you)(?: back)?|postpone)(?: (.*))?$/.exec(
      text,
    );
  if (snooze) {
    if (!snooze[1] || snooze[1] === 'later')
      return {intent: 'snooze', minutes: null};
    const minutes = duration(snooze[1]);
    return minutes === null ? null : {intent: 'snooze', minutes};
  }
  const give = /^give (?:me|us) (.+)$/.exec(text);
  const minutes = duration(give ? give[1] : options.casual ? text : '');
  return minutes === null ? null : {intent: 'snooze', minutes};
};
