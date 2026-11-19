/**
 * Narrow, COR-specific clean-up for OCR text (never applied to PDF text).
 *
 * Every rule here corrects a confusion observed when ML Kit read a real USTP
 * COR screenshot on a phone: "/" read as "I", ":" read as "-", "." or nothing,
 * "0" read as "O"/"D", a leading "I" read as "l", and near-miss spellings of
 * fixed template words ("INFORMATIKON", "Classoom", "NIA"). Free text that is
 * not template vocabulary (names, subject titles, sections) is never
 * "corrected" into something else; the checks and the review handle it.
 */

/** Words that appear in COR colleges, programs, year levels and rooms. */
const VOCABULARY = [
  'College',
  'of',
  'and',
  'in',
  'Information',
  'Technology',
  'Computing',
  'Engineering',
  'Architecture',
  'Science',
  'Sciences',
  'Mathematics',
  'Education',
  'Secondary',
  'Elementary',
  'Technical',
  'Technician',
  'Teacher',
  'Bachelor',
  'Master',
  'Doctor',
  'Civil',
  'Electrical',
  'Mechanical',
  'Electronics',
  'Computer',
  'Chemistry',
  'Chemical',
  'Applied',
  'Physics',
  'Environmental',
  'Management',
  'Industrial',
  'Medicine',
  'Major',
  'Baccalaureate',
  'Filipino',
  'Modular',
  'Classroom',
  'Laboratory',
  'Lab',
  'Room',
  'Building',
];

/** Acronyms printed in rooms and curricula, restored to upper case. */
const ACRONYMS = ['CITC', 'ICT', 'CEA', 'CSM', 'CSTE', 'COT', 'AVR', 'USTP'];

export const editDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({length: n + 1}, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
};

const allowedDistance = (length: number) =>
  length >= 8 ? 2 : length >= 5 ? 1 : 0;

const mostlyUpper = (word: string) => {
  const letters = word.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return letters.length > 0 && upper / letters.length >= 0.6;
};

const recase = (canonical: string, original: string) =>
  mostlyUpper(original) && original.length > 1
    ? canonical.toUpperCase()
    : canonical;

/** Snaps one word to the template vocabulary when it is a near miss. */
const snapWord = (word: string): string => {
  const match = /^([^A-Za-z]*)([A-Za-z|]+)([^A-Za-z]*)$/.exec(word);
  if (!match) return word;
  const [, pre, core, post] = match;
  const lower = core.toLowerCase();
  const acronym = ACRONYMS.find(a => a.toLowerCase() === lower);
  if (acronym) return `${pre}${acronym}${post}`;
  const exact = VOCABULARY.find(v => v.toLowerCase() === lower);
  if (exact) return `${pre}${recase(exact, core)}${post}`;
  // A stray leading "I"/"l"/"|" before a real word ("Iin" -> "in").
  if (core.length >= 3 && /^[Il|]/.test(core)) {
    const rest = VOCABULARY.find(v => v.toLowerCase() === lower.slice(1));
    if (rest) return `${pre}${recase(rest, core.slice(1))}${post}`;
  }
  const limit = allowedDistance(core.length);
  if (limit === 0) return word;
  let best: string | null = null;
  let bestDistance = Infinity;
  let tie = false;
  for (const candidate of VOCABULARY) {
    if (Math.abs(candidate.length - core.length) > limit) continue;
    const distance = editDistance(lower, candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tie = false;
    } else if (distance === bestDistance && candidate !== best) {
      tie = true;
    }
  }
  if (best && bestDistance <= limit && !tie) {
    return `${pre}${recase(best, core)}${post}`;
  }
  return word;
};

/** Snaps template vocabulary in a phrase (college, program, room). */
export const snapVocabulary = (text: string): string =>
  text
    .split(' ')
    .map(word => (word ? snapWord(word) : word))
    .join(' ');

/** "lssues" -> "Issues": a word-initial "l" before a consonant is an "I". */
export const fixLeadingL = (text: string): string =>
  text.replace(/(^|[\s(])l(?=[bcdfghjkmnpqrstvwxz])/g, '$1I');

const OCR_DIGIT = /[OoDIl|]/g;
const toDigits = (token: string) =>
  token.replace(OCR_DIGIT, ch => (/[Il|]/.test(ch) ? '1' : '0'));

/** Building-room codes like "O9-302" or "D9-105" -> "09-302", "09-105". */
export const cleanOcrRoom = (room: string): string =>
  snapVocabulary(
    room
      .trim()
      .replace(
        /^([0-9OoDIl|]{1,3})\s*-\s*([0-9OoDIl|]{2,4})(?=$|[\s(])/,
        (_m, a: string, b: string) => `${toDigits(a)}-${toDigits(b)}`,
      ),
  ).replace(/\(\s*/g, '(');

const ORDINALS = ['', 'st', 'nd', 'rd', 'th', 'th'];

/** "4h Yoar- Baccalauroate" -> "4th Year - Baccalaureate". */
export const cleanOcrYearLevel = (value: string): string => {
  const match =
    /^([1-5])\s*[A-Za-z]{0,2}\s*Y[a-z]{2,3}\b\s*[-–]?\s*(.*)$/i.exec(
      value.trim(),
    );
  if (!match) return value;
  const n = Number(match[1]);
  const rest = snapVocabulary(match[2].trim());
  return `${n}${ORDINALS[n]} Year${rest ? ` - ${rest}` : ''}`;
};

/** "NIA", "N1A", "N A" -> "N/A". */
export const cleanOcrMajor = (value: string): string =>
  /^N\s*[/I1l|]?\s*A$/i.test(value.trim()) ? 'N/A' : value;

/** Upper-cases a curriculum and restores its college prefix ("crTC" -> "CITC"). */
export const cleanOcrCurriculum = (value: string, collegeShort: string) => {
  const upper = value.toUpperCase();
  if (!collegeShort) return upper;
  const [first, ...rest] = upper.split('-');
  if (
    first !== collegeShort &&
    first.length === collegeShort.length &&
    editDistance(first, collegeShort) <= 1
  ) {
    return [collegeShort, ...rest].join('-');
  }
  return upper;
};

const TIME = '([0-9OoIl|]{1,2}[:.;\\-]?[0-9OoIl|]{2})';
const PERIOD = '([AP]\\.?\\s?M\\.?)?';

/**
 * Tolerant schedule grammar for OCR: day glued to the time ("F7.00"),
 * colon read as "." / "-" / dropped ("7-00", "500"), and the "/" before the
 * room read as "I" or dropped ("AMIO9-302", "PMModular").
 */
export const OCR_SCHEDULE_PATTERN = new RegExp(
  `^([A-Za-z]{1,4})\\s*${TIME}\\s*${PERIOD}\\s*[-–—.~]+\\s*${TIME}\\s*${PERIOD}\\s*(?:\\/\\s*|[|Il](?=[0-9OD]))?(.*)$`,
  'i',
);

/** "7.00" / "7-00" / "700" / "1O:OO" -> "7:00". */
export const normalizeOcrTime = (token: string): string | null => {
  const digits = token.replace(/[OoIl|]/g, ch => (/[Oo]/.test(ch) ? '0' : '1'));
  const match = /^(\d{1,2})[:.;-]?(\d{2})$/.exec(digits);
  return match ? `${Number(match[1])}:${match[2]}` : null;
};
