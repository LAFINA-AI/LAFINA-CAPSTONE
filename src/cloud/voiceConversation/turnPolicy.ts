/**
 * Spoken turn policy for Call Lafina: when the student's own words approve
 * or discard the draft card on screen.
 *
 * Speech-to-text punctuates and pads short answers ("Okay, save it, Lafina.",
 * "Yes. Can you save it now?"), so the words are normalized and polite framing
 * is peeled off before the core command is matched. Anything that qualifies
 * the answer (but, change, wait, a time or a day) is never an approval: those
 * words revise the card or ask something, and saving would be wrong.
 */

/** Lowercase words only; curly quotes folded, punctuation and hyphens spaced. */
const normalizeSpoken = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Words that turn a "yes" into "yes, but…" or "no". */
const QUALIFIER_RE =
  /\b(?:no|nope|nah|not|don't|dont|never|cancel|discard|delete|remove|wait|hold|but|except|change|changed|instead|move|rename|edit|update|adjust|fix|later|yet|maybe|stop|undo|hindi|huwag|wag|saved)\b/;

/** A time, a day or a duration means the card is being changed, not saved. */
const SCHEDULE_DETAIL_RE =
  /\d|\b(?:am|pm|noon|midnight|today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night|week|weekend|month|o'clock|oclock|minutes?|mins?|hours?|hrs?)\b/;

/** Questions about the card ("did you save it?") are not approvals. */
const QUESTION_RE =
  /^(?:did|have|has|was|were|is|are|what|which|when|where|who|why|how|does|do you|do i)\b/;

const AFFIRMATIVE_RE =
  /\b(?:yes|yeah|yea|yep|yup|yah|ya|sure|okay|ok|okey|oki|okie|alright|all right|right|great|perfect|nice|cool|good|awesome|fine|correct|exactly|absolutely|definitely|of course|sige|oo|opo|ayos|tama|game|works)\b/;

/**
 * A goodbye or thanks at the end of an answer ("yes save it, thanks, bye").
 * It is peeled off before the answer is read, so it neither blocks the save
 * ("later" in "see you later" is otherwise a qualifier) nor counts as one.
 */
const CLOSING_TAIL_RE =
  /\s*\b(?:bye(?: bye)?|byee+|good ?bye|goodnight|good night|see (?:you|ya)(?: later| tomorrow| soon)?|talk (?:to you )?later|ttyl|later|take care|ingat(?: ka| po)?|salamat(?: po)?|thanks?(?: a lot| so much)?(?: lafina)?|thank you(?: so much| very much)?(?: lafina)?|ty|that's all|that is all|that's it|that is it|i'm done|im done)$/;

const stripClosingTail = (normalized: string): string => {
  let t = normalized;
  for (let i = 0; i < 6; i += 1) {
    const next = t.replace(CLOSING_TAIL_RE, '').trim();
    if (next === t || !next) break;
    t = next;
  }
  return t;
};

const LEAD_RE =
  /^(?:yes|yeah|yea|yep|yup|yah|ya|sure(?: thing)?|okay|ok|okey|oki|okie|k|alright|all right|right|great|perfect|nice|cool|good|awesome|fine|correct|exactly|absolutely|definitely|of course|sige(?: na)?|oo|opo|ayos|tama|game|um+|uh+|hmm+|so|and|then|now|well|hey|oh|lafina|please|kindly|just|thanks|thank you|that's (?:good|fine|great|perfect|right|correct|it)|that is (?:good|fine|great|perfect|right|correct)|it's (?:good|fine|great|perfect|right|correct)|(?:it|that|this|everything) looks? (?:good|great|fine|right|correct|okay|ok|perfect)|looks? (?:good|great|fine|right|correct|okay|ok|perfect)|(?:that )?sounds? (?:good|great|fine|right|perfect)|that works|works for me|go ahead and|please go ahead and|can you|could you|would you|will you|you can|you may|can we|let's|lets|i want you to|i'd like you to|i would like you to|i want to|i'd like to)\b\s*/;

const TRAIL_RE =
  /\s*\b(?:please|lafina|now|for me|thanks|thank you|already|na|po|right away|then|too|as well|(?:to|on|in|into) (?:my|the) (?:calendar|planner|schedule|list|to do list|todo list|to do|todo|to dos|todos|notes|reminders|tasks|alarms|clock))$/;

const NOUN =
  '(?:card|draft|meeting|event|task|reminder|note|block|time block|schedule|entry|change|changes|item|items|alarm|to do|todo|class|one|new one|updated one)';
const OBJECT = `(?:it|that|this|them|those|these|everything|all|it all|all of it|all of them|this one|that one|(?:the|my) ${NOUN})`;

/** The whole remaining utterance is a save command. */
const SAVE_COMMAND_RE = new RegExp(
  `^(?:(?:i )?save(?: (?:mo|na|mo na|na lang))?(?: ${OBJECT})?(?: (?:in|up))?` +
    // Speech-to-text often writes "save it" as "safe it".
    `|safe ${OBJECT}` +
    `|(?:i )?add (?:mo|na|mo na|na lang)(?: ${OBJECT})?` +
    `|do (?:it|that|this|that one|this one)` +
    `|confirm(?: ${OBJECT})?` +
    `|book(?: ${OBJECT})?` +
    `|finali[sz]e(?: ${OBJECT})?` +
    `|lock(?: ${OBJECT})?(?: in)?` +
    `|lock in(?: ${OBJECT})?` +
    `|keep ${OBJECT}` +
    `|(?:add|schedule|create|set|put|submit) ${OBJECT}(?: in| up)?` +
    `|go ahead(?: with ${OBJECT})?` +
    '|go for it|do it|proceed|go na)$',
);

/** Peels polite framing off both ends until only the core words remain. */
const coreWords = (normalized: string): string => {
  let core = normalized;
  for (let i = 0; i < 8; i += 1) {
    const next = core.replace(LEAD_RE, '').replace(TRAIL_RE, '').trim();
    if (next === core) break;
    core = next;
  }
  return core;
};

/** LAFINA's line split into sentences and dash-separated clauses. */
const clauses = (assistantText: string): string[] =>
  assistantText
    .replace(/[‘’]/g, "'")
    .split(/(?<=[.!?])\s+|\s+[—–-]+\s+|\s*[—–]\s*/)
    .map(c => c.trim())
    .filter(Boolean);

/**
 * LAFINA's last line asked whether to save the card. Each clause is read on
 * its own, so "I can't save it until you say so — should I save it?" still
 * asks, while "I couldn't save it." alone does not.
 */
const askedToSave = (assistantText: string): boolean =>
  clauses(assistantText).some(clauseAsksToSave);

/** LAFINA asked a question that is not about saving the card. */
const askedOtherQuestion = (assistantText: string): boolean =>
  clauses(assistantText).some(c => c.includes('?') && !clauseAsksToSave(c));

const clauseAsksToSave = (a: string): boolean => {
  if (/\b(?:cannot|can't|couldn't|do not|don't|no longer)\b/i.test(a))
    return false;
  return (
    /\b(?:would|do)\s+you\s+(?:like|want)\s+(?:me\s+)?to\s+(?:save|add|schedule|book|confirm|lock|create|set|put|keep|go\s+ahead)/i.test(
      a,
    ) ||
    /\b(?:want|like)\s+me\s+to\s+(?:save|add|schedule|book|confirm|lock|create|set|put|keep|go\s+ahead)/i.test(
      a,
    ) ||
    /\b(?:ok(?:ay)?|good|fine|alright)\s+to\s+(?:save|add|book|lock|schedule)/i.test(
      a,
    ) ||
    /\b(?:shall|should|can|may)\s+i\s+(?:save|add|schedule|book|confirm|lock|create|set|put|go\s+ahead)/i.test(
      a,
    ) ||
    /\bready\s+(?:for\s+me\s+)?to\s+(?:save|confirm|book|lock)/i.test(a) ||
    /\b(?:confirm|save)\b[^.!?]*(?:card|draft|it|that|this)/i.test(a) ||
    /\b(?:card|draft)\b[^.!?]*(?:confirm|save)/i.test(a) ||
    /\b(?:does|do)\s+(?:that|this|it|everything|the\s+\w+)\s+(?:look|sound)\s+(?:good|right|correct|okay|ok)/i.test(
      a,
    ) ||
    /\bis\s+(?:that|this|it|everything)\s+(?:correct|right|good|okay|ok)\b/i.test(
      a,
    )
  );
};

/**
 * The student's words are an explicit save command on their own ("save it",
 * "okay, lock it in", "can you confirm that?"), whatever LAFINA last said.
 */
export const isExplicitSaveCommand = (text: string): boolean => {
  const t = answerWords(text);
  if (!t || QUALIFIER_RE.test(t) || SCHEDULE_DETAIL_RE.test(t)) return false;
  if (QUESTION_RE.test(t)) return false;
  return SAVE_COMMAND_RE.test(coreWords(t));
};

/** Normalized words with a trailing goodbye or thanks peeled off. */
const answerWords = (text: string): string =>
  stripClosingTail(normalizeSpoken(text));

/** What is on screen when the student answers. */
export interface ApprovalContext {
  /**
   * A card was shown (or changed) since the student's previous turn: it is
   * the thing LAFINA just presented, so a bare "yes" answers it.
   */
  cardJustShown?: boolean;
}

/**
 * The student approved the open draft. A save command always counts. A bare
 * acknowledgement ("yes", "sounds good", "oo") counts as the answer to LAFINA
 * asking whether to save, or to a card she has just put on screen when her
 * line asked nothing else ("I've put a card on screen. Nothing is saved
 * until you confirm.").
 */
export const hasDraftApproval = (
  text: string,
  assistantText: string,
  context: ApprovalContext = {},
): boolean => {
  const t = answerWords(text);
  if (!t || QUALIFIER_RE.test(t) || SCHEDULE_DETAIL_RE.test(t)) return false;
  if (QUESTION_RE.test(t)) return false;
  const core = coreWords(t);
  if (SAVE_COMMAND_RE.test(core)) return true;
  if (core !== '' || !AFFIRMATIVE_RE.test(t)) return false;
  if (askedToSave(assistantText)) return true;
  return !!context.cardJustShown && !askedOtherQuestion(assistantText);
};

/**
 * The student's words are a plain yes or save, with nothing that changes,
 * questions or refuses. Used to accept LAFINA's `confirm_draft` for a card
 * that was open when they spoke, when the device alone could not tell what
 * the "yes" answered: the model heard the whole conversation.
 */
export const isPlainApproval = (text: string): boolean => {
  const t = answerWords(text);
  if (!t || QUALIFIER_RE.test(t) || SCHEDULE_DETAIL_RE.test(t)) return false;
  if (QUESTION_RE.test(t)) return false;
  const core = coreWords(t);
  return SAVE_COMMAND_RE.test(core) || (core === '' && AFFIRMATIVE_RE.test(t));
};

/**
 * "…and save it" at the end of a change ("change it to 10:30 and save it").
 * Returns the change without the save, or null when there is no such ending.
 */
export const splitTrailingSave = (text: string): string | null => {
  const match = text
    .trim()
    .match(
      /^(.*\S)\s*(?:,\s*(?:(?:and|then)\s+)?|\s+(?:and|then)\s+(?:then\s+)?)(?:please\s+)?(?:save|confirm|lock\s+in|book)\s+(?:it|that|this)(?:\s+in)?(?:\s*,?\s*(?:please|now|lafina))*[.!]*$/i,
    );
  const rest = match?.[1]?.replace(/[\s,]+$/, '').trim();
  return rest ? rest : null;
};

/** The student is discarding the open draft ("cancel that", "never mind"). */
export const isDraftCancel = (text: string): boolean => {
  let t = normalizeSpoken(text);
  for (let i = 0; i < 4; i += 1) {
    const next = t
      .replace(
        /^(?:no|nope|nah|actually|okay|ok|um+|uh+|hmm+|oh|lafina|please|just)\b\s*/,
        '',
      )
      .replace(
        /\s*\b(?:please|lafina|now|for now|then|thanks|thank you|na|po)$/,
        '',
      )
      .trim();
    if (next === t) break;
    t = next;
  }
  return (
    /^(?:cancel|discard|scrap|drop|skip|forget|don't save|dont save|do not save|don't add|dont add|do not add)(?: (?:it|that|this|that one|this one|it all|all|the (?:card|draft|meeting|event|task|reminder|note|block|one)))?(?: (?:do not create it|don't create it|dont create it))?$/.test(
      t,
    ) || /^(?:never ?mind|forget (?:about )?it|no thanks|no thank you)$/.test(t)
  );
};

/**
 * How a turn ends the call, if it does.
 * - `goodbye`: "bye", "that's all", "I'm done", "sige bye", "end the call".
 * - `thanks`: only thanks ("thank you", "salamat"). The call ends only when
 *   nothing is waiting for the student; otherwise LAFINA says you're welcome.
 * - `none`: anything else, including "thanks, and also add…".
 */
export type CallClosingKind = 'goodbye' | 'thanks' | 'none';

const GOODBYE_PHRASE =
  "byee+|bye|good ?bye|goodnight|good night|nighty? night|see (?:you|ya)(?: tomorrow| soon| next time)?|talk (?:to you )?(?:later|soon|tomorrow)|ttyl|later|take care|ingat(?: ka)?|gtg|got to go|gotta go|i have to go|i need to go|i(?:'m| am) (?:off|going|leaving)|that's all|that is all|that'll be all|that will be all|that's it|that is it|i'm done|im done|i am done|we're done|we are done|all done|nothing else|nothing more|no more|that's everything|that is everything|end (?:the |this )?call|hang up|you can hang up|end it|paalam";
const THANKS_PHRASE =
  'thanks?(?: a lot| so much| very much)?|thank you(?: so much| very much| a lot)?|thank u|thx|tnx|ty|tysm|salamat|maraming salamat|appreciate it|much appreciated|i appreciate it';
const CLOSING_FILLER =
  'ok|okay|okey|alright|all right|sige|oh|um+|uh+|so|well|no|nope|nah|yes|yeah|yep|great|perfect|cool|nice|awesome|got it|lafina|po|again|for (?:the help|your help|helping|everything)|for (?:that|this)|have a (?:good|nice|great) (?:day|night|one)|you too|for now';
const CLOSING_TOKEN_GROUP = `(?:${GOODBYE_PHRASE}|${THANKS_PHRASE}|${CLOSING_FILLER})`;
const CLOSING_TOKEN_RE = new RegExp(
  `^${CLOSING_TOKEN_GROUP}(?:\\s+${CLOSING_TOKEN_GROUP})*$`,
);
const GOODBYE_RE = new RegExp(`\\b(?:${GOODBYE_PHRASE})\\b`);
const THANKS_RE = new RegExp(`\\b(?:${THANKS_PHRASE})\\b`);

/** The whole turn is a goodbye or a thanks (fillers allowed, nothing else). */
export const callClosingKind = (text: string): CallClosingKind => {
  const t = normalizeSpoken(text);
  if (!t || !CLOSING_TOKEN_RE.test(t)) return 'none';
  if (GOODBYE_RE.test(t)) return 'goodbye';
  if (THANKS_RE.test(t)) return 'thanks';
  return 'none';
};

/**
 * A goodbye at the end of a longer turn ("yes save it, thanks, bye"). Only a
 * goodbye counts; a trailing "thanks" after a request does not end the call.
 */
export const endsWithGoodbye = (text: string): boolean => {
  const t = normalizeSpoken(text);
  const rest = stripClosingTail(t);
  if (rest === t) return false;
  return callClosingKind(t.slice(rest.length)) === 'goodbye';
};

/** Multiple requested artifacts must not be flattened into a single action. */
export const isCompoundVoiceRequest = (text: string): boolean =>
  /\b(?:and|also|then|plus|tapos|at\s+saka)\s+(?:(?:please|also|then)\s+)*(?:(?:add|create|schedule|set|make|remind|save|jot)\b(?!\s+(?:it|that|this|them)\b)|(?:a|an|another)\s+(?:task|event|meeting|reminder|note|time\s*block)\b)/i.test(
    text,
  );
