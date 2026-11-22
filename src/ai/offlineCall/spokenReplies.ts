/**
 * What LAFINA says out loud in the offline call. Cards keep their full text
 * on screen; speech gets one short line about the card plus the question
 * that lets a plain "yes" save it.
 */
import type {CommandProposal} from '../nlu/commandReview';

/** The question after every card. A bare "yes" answers it (turnPolicy). */
export const SAVE_QUESTION = 'Should I save it?';

/** The question after a card that deletes or changes something. */
export const CHANGE_QUESTION = 'Should I go ahead?';

const strip = (line: string): string =>
  line
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');

/** Detail lines the student needs to hear; the rest stay on the card. */
const SPOKEN_DETAIL_RE =
  /^(?:When|Due|Time|Date|From|To|Moves? to|New time|New date|Starts|Ends|At)\b/i;

/**
 * "Create event "Capstone Meeting": Thu, Jun 12, 10:30 AM to 11:00 AM.
 * Heads up: it overlaps with Lab. Should I save it?"
 */
export const spokenCardLine = (proposal: CommandProposal): string => {
  const heading = strip(proposal.heading);
  const title = strip(proposal.title);
  const detail = proposal.details
    .map(strip)
    .find(d => SPOKEN_DETAIL_RE.test(d));
  const when = detail ? detail.replace(/^When:\s*/i, '') : null;
  const overlap = proposal.warnings.map(strip).find(w => /overlap/i.test(w));
  const parts = [
    `${heading}${title ? ` "${title}"` : ''}${when ? `: ${when}.` : '.'}`,
  ];
  if (overlap) parts.push(`Heads up: ${overlap.replace(/^Notice:\s*/i, '')}.`);
  parts.push(
    proposal.destructive || /^(?:delete|change|move)/i.test(heading)
      ? CHANGE_QUESTION
      : SAVE_QUESTION,
  );
  return parts.join(' ');
};

/**
 * whisper.cpp marks non-speech in brackets ("[BLANK_AUDIO]", "(music)").
 * Those are never the student's words.
 */
export const cleanTranscript = (text: string): string =>
  text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const offlineGreeting = (name: string | null): string =>
  `Hi${
    name ? ` ${name}` : ''
  }, Lafina here. I'm working offline. What do you want to plan?`;

/** When nothing on the device matched the request. */
export const OFFLINE_HELP_REPLY =
  'Offline, I can schedule, reschedule or cancel things in your planner, add tasks, reminders and notes, and tell you what is coming up. Try: schedule a capstone meeting tomorrow at 10 AM.';

export const OFFLINE_SILENCE_GOODBYE =
  "It's quiet, so I'll hang up for now. Call me anytime.";

const MAX_SPOKEN_CHARS = 320;

/**
 * A reply cut to what is comfortable to hear: whole sentences up to about
 * 320 characters. The full reply stays on screen. The phone voice also has a
 * 30-second safety stop, which a long answer would hit mid-sentence.
 */
export const speakable = (reply: string): string => {
  const plain = reply
    .replace(/\*\*|__|`|^#+\s*/gm, '')
    .replace(/^\s*(?:[-*+•]|\d{1,3}[.)])\s+/gm, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/:\./g, ':')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= MAX_SPOKEN_CHARS) return plain;
  const sentences = plain.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [plain];
  let out = '';
  for (const sentence of sentences) {
    if (out && out.length + sentence.length > MAX_SPOKEN_CHARS) break;
    out += sentence;
  }
  if (out.length > MAX_SPOKEN_CHARS)
    out = `${out.slice(0, MAX_SPOKEN_CHARS).replace(/\s+\S*$/, '')}.`;
  return `${out.trim()} The rest is on your screen.`;
};

/** Whether the reminder alarm for a saved item is armed on this phone. */
export type AlarmStatus = 'registered' | 'pending' | 'unavailable';

const ALARM_LINE: Record<AlarmStatus, string> = {
  registered: 'The reminder alarm is set.',
  pending:
    "The reminder alarm isn't set yet. Check reminder permissions in Settings.",
  unavailable:
    "I couldn't check the reminder alarm. Open reminder delivery settings.",
};

/**
 * The one line after a save: what was saved, when, and whether its alarm is
 * set. "Saved "Capstone meeting": Sat, Nov 21, 10:00 AM to 11:00 AM. The
 * reminder alarm is set." Without the card it falls back to the receipt.
 */
export const savedConfirmation = (
  proposal: CommandProposal | null,
  receipt: string,
  alarm: AlarmStatus | null,
): string => {
  const title = proposal ? strip(proposal.title) : '';
  const detail = proposal?.details
    .map(strip)
    .find(d => SPOKEN_DETAIL_RE.test(d));
  const when = detail ? detail.replace(/^When:\s*/i, '') : null;
  const what =
    proposal && title && !/^(?:delete|change|move)/i.test(proposal.heading)
      ? `Saved "${title}"${when ? `: ${when}.` : '.'}`
      : receipt.trim();
  return alarm ? `${what} ${ALARM_LINE[alarm]}` : what;
};
