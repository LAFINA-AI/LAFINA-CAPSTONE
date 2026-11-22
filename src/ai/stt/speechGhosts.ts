/**
 * Words whisper.cpp writes when it heard no real speech, and LAFINA's own
 * voice heard back through the microphone.
 *
 * Two kinds of "ghost":
 * - Always junk: "you", "thanks for watching", "subtitles by…", a lone letter.
 *   Nobody means these as a request.
 * - Plausible words ("thank you", "bye", "okay", "yes"): whisper's favourite
 *   inventions on a cough or a door, but also real answers. They are dropped
 *   only when the voice detector was never confident it heard a person.
 */

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Never a student's request, whatever the detector says. */
const ALWAYS_GHOSTS = new Set([
  'you',
  'thanks for watching',
  'thank you for watching',
  'thank you so much for watching',
  'please subscribe',
  'subtitles by',
  'translated by',
  'silence',
  'music',
  'audio',
  'the end',
]);

/** Real answers that whisper also makes up from noise. */
const PLAUSIBLE_GHOSTS = new Set([
  'thank you',
  'thanks',
  'thank you very much',
  'bye',
  'bye bye',
  'goodbye',
  'okay',
  'ok',
  'yes',
  'yeah',
]);

/**
 * Below this Silero VAD peak the capture most likely started on noise (the
 * energy fallback), so a plausible ghost is not trusted. Real speech peaks
 * well above it.
 */
export const GHOST_VAD_CONFIDENCE = 0.6;

/** Plausible words push-to-talk has always dropped when the detector is unknown. */
const PUSH_TO_TALK_GHOSTS = new Set(['thank you', 'thanks', 'bye', 'goodbye']);

/**
 * Whisper made this up rather than heard it. `maxVadProbability` is the
 * detector's peak for the capture. When it is unknown (an older build),
 * `whenUnknown: 'keep'` drops only always-junk (a call, where "bye" must
 * still hang up), and `'push_to_talk'` keeps Chat's long-standing list.
 */
export const isHallucinatedSpeech = (
  rawText: string,
  maxVadProbability?: number | null,
  whenUnknown: 'keep' | 'push_to_talk' = 'keep',
): boolean => {
  const clean = normalize(rawText).replace(/'/g, '');
  if (!clean || clean.replace(/\s/g, '').length < 2) return true;
  if (
    ALWAYS_GHOSTS.has(clean) ||
    /^subtitles by\b|^translated by\b/.test(clean)
  )
    return true;
  const known =
    typeof maxVadProbability === 'number' && Number.isFinite(maxVadProbability);
  if (!known)
    return whenUnknown === 'push_to_talk' && PUSH_TO_TALK_GHOSTS.has(clean);
  return (
    PLAUSIBLE_GHOSTS.has(clean) && maxVadProbability < GHOST_VAD_CONFIDENCE
  );
};

/**
 * The microphone heard the end of LAFINA's own line ("…I added it to your
 * calendar" coming back as "to your calendar"). True when the words heard are
 * exactly the last 3 to 6 words she just said. Never fewer than 3: a short
 * answer such as "yes", "confirm" or "save it" may match the end of her
 * question and is always the student's.
 */
const ECHO_MIN_WORDS = 3;

export const isEchoOfLine = (heard: string, line: string | null): boolean => {
  if (!line) return false;
  const words = normalize(heard).split(' ').filter(Boolean);
  if (words.length < ECHO_MIN_WORDS || words.length > 6) return false;
  const lineWords = normalize(line).split(' ').filter(Boolean);
  if (words.length > lineWords.length) return false;
  const tail = lineWords.slice(lineWords.length - words.length);
  return tail.every((word, index) => word === words[index]);
};
