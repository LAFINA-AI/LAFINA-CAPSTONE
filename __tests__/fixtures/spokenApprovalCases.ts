/**
 * Spoken answers to a review card in Call Lafina (CALLFIX-01).
 *
 * The first rows are the 2026-11-22 probe that found the "say yes several
 * times" bug: these answers failed whenever LAFINA's card line did not
 * literally ask "would you like me to save it?".
 */

/** Lines LAFINA says when she puts a card on screen. */
export const CARD_LINES = [
  "I've put a card on your screen for Review chemistry tomorrow at 3 PM. Would you like me to save it?",
  "I've shown a card for Review chemistry tomorrow at 3 PM. Nothing is saved until you confirm.",
  "Here's the card. I can't save it until you say so — should I save it?",
  "I've shown a card on screen. Let me know if it looks right.",
  'Okay, I have prepared that for you. Check the card on your screen.',
  'Done, the card is ready. Does everything look right?',
  'A reminder card for 7 AM is on screen.',
] as const;

/** The student approves: every one must save, after any card line. */
export const APPROVALS = [
  'yes',
  'yes save it',
  'yes please',
  'yes, save it. thank you, bye',
  'yes add it to my to-do',
  'yes set the alarm',
  'okay save my reminder',
  'sure, add the event',
  'yes save it to my calendar',
  'yeah go ahead',
  'oo',
  'sige i-save mo',
  'yes, safe it',
  'yes put it in',
  "that's good, thanks",
  'yes save',
  'save it na po',
  'yes, confirm',
  'perfect, save it lafina',
  'yes do that',
  'yes please add it',
  "yes it's correct",
  "yup that's right save it",
  'ayos',
  'oo sige',
  'yes save it, see you later',
  'Okay, save it, Lafina.',
  'Yes. Can you save it now?',
  'sure thing, lock it in',
  'go for it',
  'save my to-do',
  'confirm the alarm',
  'okay',
  'sounds good',
  'looks good, save it',
  'tama, save mo na',
  'yes save the class',
  'please save it',
  'go ahead and add it',
  'alright, book it',
] as const;

/** Never a save, after any card line. */
export const NOT_APPROVALS = [
  'no',
  'wait',
  'change it to 4pm',
  'did you save it?',
  'save it for tomorrow instead',
  'yes but at 5',
  'not yet',
  'maybe later',
  'yes, change the title',
  'do not save it',
  'what time is it',
  'add a task to buy milk',
  'cancel',
  'hold on',
  'is it saved?',
  'no thanks',
  "don't save that",
  'yes, move it to friday',
  'save it at 6 pm',
  'hindi, wag muna',
  'what is on my schedule tomorrow',
  'rename it to physics',
] as const;
