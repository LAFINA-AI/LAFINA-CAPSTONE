const DAY_MAP: Record<string, string> = {
  m: 'Monday',
  mon: 'Monday',
  monday: 'Monday',
  t: 'Tuesday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  w: 'Wednesday',
  wed: 'Wednesday',
  wednesday: 'Wednesday',
  r: 'Thursday',
  th: 'Thursday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  f: 'Friday',
  fri: 'Friday',
  friday: 'Friday',
  s: 'Saturday',
  sat: 'Saturday',
  saturday: 'Saturday',
  sun: 'Sunday',
  sunday: 'Sunday',
};

export function computeSemesterEndDate(
  refDate: Date = new Date(),
  weeks: number = 18,
): string {
  const until = new Date(refDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const yyyy = until.getUTCFullYear();
  const mm = String(until.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(until.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T235959Z`;
}

export function expandDays(dayStr: string): string[] {
  const clean = dayStr.trim();
  const upper = clean.toUpperCase().replace(/[\s\-/]/g, '');

  if (upper === 'MWF') return ['Monday', 'Wednesday', 'Friday'];
  if (upper === 'MW') return ['Monday', 'Wednesday'];
  if (upper === 'TTH' || upper === 'T-TH' || upper === 'TR' || upper === 'T-R')
    return ['Tuesday', 'Thursday'];
  if (upper === 'TF' || upper === 'T-F') return ['Tuesday', 'Friday'];
  if (upper === 'FS' || upper === 'FRI-SAT') return ['Friday', 'Saturday'];
  if (upper === 'MTWTH') return ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
  if (upper === 'MTWTHF')
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  if (upper === 'M' || upper === 'MON') return ['Monday'];
  if (upper === 'T' || upper === 'TUE') return ['Tuesday'];
  if (upper === 'W' || upper === 'WED') return ['Wednesday'];
  if (upper === 'R' || upper === 'TH' || upper === 'THU') return ['Thursday'];
  if (upper === 'F' || upper === 'FRI') return ['Friday'];
  if (upper === 'S' || upper === 'SAT') return ['Saturday'];
  if (upper === 'SU' || upper === 'SUN') return ['Sunday'];

  const tokens = clean.replace(/[/\-,]/g, ' ').split(/\s+/);
  const result: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (DAY_MAP[key] && !result.includes(DAY_MAP[key])) {
      result.push(DAY_MAP[key]);
    }
  }
  if (result.length > 0) return result;

  // Compact multi-day combinations such as WF, MF, MTH, TTHS, MTWF, WS, etc.
  if (/^(?:TH|SU|[MTWRFS])+$/.test(upper)) {
    const compact: string[] = [];
    let i = 0;
    while (i < upper.length) {
      const two = upper.slice(i, i + 2);
      if (two === 'TH') {
        if (!compact.includes('Thursday')) compact.push('Thursday');
        i += 2;
        continue;
      }
      if (two === 'SU') {
        if (!compact.includes('Sunday')) compact.push('Sunday');
        i += 2;
        continue;
      }
      const mapped = DAY_MAP[upper[i].toLowerCase()];
      if (mapped && !compact.includes(mapped)) {
        compact.push(mapped);
      }
      i += 1;
    }
    if (compact.length > 0) return compact;
  }

  return ['Monday'];
}

export function normalizeTime24(
  timeStr: string,
): {time24: string; time12: string} | null {
  const periodMatch = timeStr.trim().match(/\s*(am|pm)\s*$/i);
  const periodPart = periodMatch ? periodMatch[1].toLowerCase() : '';
  const numPart = (
    periodMatch ? timeStr.trim().slice(0, periodMatch.index) : timeStr.trim()
  )
    .replace(/[oO]/g, '0')
    .replace(/[Il]/g, '1');
  const match = numPart.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const period = periodPart || undefined;

  if (minute < 0 || minute > 59) return null;

  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;

  if (hour < 0 || hour > 23) return null;

  const hh = hour.toString().padStart(2, '0');
  const mm = minute.toString().padStart(2, '0');

  const dispHour = hour % 12 || 12;
  const dispPeriod = hour >= 12 ? 'PM' : 'AM';
  const time12 = `${dispHour}:${mm} ${dispPeriod}`;

  return {time24: `${hh}:${mm}`, time12};
}
import type {
  LongestClassGap,
  WeeklyClassCount,
} from '../../storage/preferencesStore';

export interface UstpCorClassSession {
  id: string;
  code: string;
  subjectTitle: string;
  section: string;
  faculty: string;
  dayCode: string;
  days: string[];
  startTime: string; // HH:mm (24h)
  endTime: string; // HH:mm (24h)
  startTime12: string;
  endTime12: string;
  room: string;
  recurrenceRule: string;
  rawText: string;
}

export interface UstpEnrolledCourse {
  code: string;
  title: string;
  subjectTitle: string;
  lecUnits: number;
  labUnits: number;
  creditUnits: number;
  section: string;
  faculty: string;
  sessions: UstpCorClassSession[];
  scheduleSummary: string;
}

export interface UstpStudentProfile {
  isUstpStudent: boolean;
  campus: string;
  registrationNo: string;
  studentNo: string;
  fullName: string;
  formattedName: string;
  preferredName: string;
  gender: string;
  age: number | null;
  nationality: string;
  college: string;
  collegeShort: string;
  program: string;
  major: string;
  yearLevel: string;
  yearLevelShort: string;
  curriculum: string;
  academicTerm: string;
  academicYearTerm: string;
  section: string;
  primarySection: string;
  totalUnits: string;
  totalLecUnits: number | null;
  totalLabUnits: number | null;
  totalCreditUnits: number | null;
}

export interface UstpCorOnboardingRecommendations {
  busiestDay: string;
  weeklyClassCount: WeeklyClassCount;
  longestClassGap: LongestClassGap;
}

export interface ParsedUstpCorResult {
  isUstpCor: boolean;
  isValidUstpCor: boolean;
  profile: UstpStudentProfile;
  courses: UstpEnrolledCourse[];
  sessions: UstpCorClassSession[];
  semesterEndDate: string;
  recommendedPreferences: UstpCorOnboardingRecommendations;
  markdownSummary: string;
}

const HARD_STOP_PATTERNS: RegExp[] = [
  /^A\s*S\s*S\s*E\s*S\s*S+\s*E\s*D\s+F\s*E\s*E\s*S/i,
  /\bASSESS+ED\s+FEES\b/i,
  /\bSTUDENT['’]?\s*S?\s*PLEDGE\b/i,
  /\bS\s*C\s*H\s*E\s*D\s*U\s*L\s*E\s+O\s*F\s+P\s*A\s*Y\s*M\s*E\s*N\s*T\s*S\b/i,
  /\bSCHEDULE\s+OF\s+PAYMENTS\b/i,
  /\bIn\s+consideration\s+of\s+my\s+admission\b/i,
  /\bI\s+hereby\b.*\bswear\b/i,
  /\bTuition\s+Fee\b/i,
  /\bLibrary\s+Fee\b/i,
  /\bLaboratory\s+Fee\b/i,
  /\bGroup\s+Insurance\s+Fee\b/i,
  /\bTOTAL\s+ASSESSED\b/i,
  /\bKEEP\s+THIS\s+CERTIFICATE\b/i,
  /\bAPPROVED\s+BY\s*:/i,
  /^Note:\s*Subject\s+marked/i,
];

const COLLEGE_ACRONYMS: Array<[RegExp, string]> = [
  [/INFORMATION\s+TECHNOLOGY\s+AND\s+COMPUTING/i, 'CITC'],
  [/ENGINEERING\s+AND\s+ARCHITECTURE/i, 'CEA'],
  [/SCIENCE\s+AND\s+MATHEMATICS/i, 'CSM'],
  [/SCIENCE\s+AND\s+TECHNOLOGY\s+EDUCATION/i, 'CSTE'],
  [/TECHNOLOGY\b/i, 'COT'],
  [/MEDICINE\b/i, 'COM'],
];

function toTitleCaseWord(word: string): string {
  if (!word) return '';
  const clean = word.trim();
  if (/^(?:II|III|IV|JR\.?|SR\.?)$/i.test(clean)) {
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }
  if (/^[A-Z]\.?$/i.test(clean)) {
    return `${clean.charAt(0).toUpperCase()}.`;
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

const KNOWN_INTACT_ALLCAPS_NAMES = new Set([
  'PEARL',
  'MERLE',
  'RUSSELL',
  'MITCHELL',
  'DARRELL',
  'MAXWELL',
  'RANDALL',
  'KENDALL',
  'MARSHALL',
  'WENDELL',
  'LOWELL',
  'HOWELL',
  'NEWELL',
  'JEWELL',
  'CARLOS',
  'MARCUS',
  'RICHARD',
  'EDWARD',
  'RAYMOND',
  'ARNOLD',
  'RONALD',
  'DONALD',
  'HAROLD',
  'GERALD',
  'REGINALD',
  'ROBERT',
  'ALBERT',
  'HERBERT',
  'GILBERT',
  'WILBERT',
  'NORBERT',
  'ARTHUR',
  'VICTOR',
  'HECTOR',
  'NESTOR',
  'CESAR',
  'OSCAR',
  'EDGAR',
  'PETER',
  'WALTER',
  'OLIVER',
  'ROGER',
  'DAVID',
  'KEVIN',
  'BRIAN',
  'JASON',
  'JUSTIN',
  'MARTIN',
  'STEVEN',
  'ALLEN',
  'JOSEPH',
  'PHILIP',
  'PATRICK',
  'DOMINIC',
  'RODERICK',
  'ALEXANDER',
  'CHRISTOPHER',
  'FERDINAND',
  'CHRISTIAN',
  'SEBASTIAN',
  'NATHAN',
  'JONATHAN',
  'ANTHONY',
  'TIMOTHY',
  'GREGORY',
  'JEFFREY',
  'BRADLEY',
  'STANLEY',
  'WESLEY',
  'ASHLEY',
  'LESLIE',
  'VINCENT',
  'LAWRENCE',
  'TERRENCE',
  'CLARENCE',
  'KENNETH',
  'STEPHEN',
  'MATTHEW',
  'ANDREW',
  'EDWARD',
]);

const VALID_WORD_FINAL_BIGRAMS = new Set([
  'NG',
  'NT',
  'ND',
  'NK',
  'RM',
  'RN',
  'RT',
  'RD',
  'RK',
  'CH',
  'SH',
  'TH',
  'CK',
  'FF',
  'LL',
  'SS',
  'LT',
  'ST',
  'SP',
  'SK',
  'PH',
  'ER',
  'OR',
  'AR',
  'AN',
  'EN',
  'ON',
  'IN',
  'EL',
  'AL',
  'UL',
  'OL',
  'ES',
  'US',
  'IS',
  'AS',
  'OS',
  'EY',
  'AY',
  'OY',
]);

/**
 * Splits an OCR-glued single-letter middle initial from an ALL-CAPS USTP given name token
 * (e.g. "LEMARL" -> ["LEMAR", "L"]) while preserving ordinary names like PAUL, CARL, NOEL, PEARL.
 */
function splitOcrGluedMiddleInitial(token: string): string[] {
  if (!/^[A-Z]{5,}$/.test(token)) return [token];
  if (KNOWN_INTACT_ALLCAPS_NAMES.has(token)) return [token];

  const tail2 = token.slice(-2);
  if (VALID_WORD_FINAL_BIGRAMS.has(tail2)) return [token];

  // Consonant + L / rare consonant + consonant ending attached by missing narrow space (e.g. LEMAR + L)
  const penultimate = tail2[0];
  const last = tail2[1];
  const isVowel = (ch: string) => /[AEIOUY]/.test(ch);
  if (!isVowel(penultimate) && last === 'L') {
    return [token.slice(0, -1), last];
  }
  return [token];
}

/**
 * Formats USTP COR "LASTNAME, FIRSTNAME MIDDLE" into display name and preferred first name.
 * Example: "GONZALES, JOHN LEMAR L" -> { formattedName: "John Lemar L. Gonzales", preferredName: "John Lemar" }
 */
export function formatUstpStudentName(rawName: string): {
  formattedName: string;
  preferredName: string;
} {
  const cleaned = rawName.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return {formattedName: '', preferredName: ''};
  }

  if (cleaned.includes(',')) {
    const [lastPart, restPart = ''] = cleaned.split(',', 2);
    const lastWords = lastPart
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(toTitleCaseWord);
    let givenTokens = restPart.trim().split(/\s+/).filter(Boolean);

    const hasExplicitInitialOrSuffix = givenTokens.some(
      t => /^[A-Za-z]\.?$/.test(t) || /^(?:JR\.?|SR\.?|II|III|IV)$/i.test(t),
    );
    if (
      givenTokens.length >= 2 &&
      !hasExplicitInitialOrSuffix &&
      lastPart.trim() === lastPart.trim().toUpperCase() &&
      restPart.trim() === restPart.trim().toUpperCase()
    ) {
      const lastGiven = givenTokens[givenTokens.length - 1];
      const splitLast = splitOcrGluedMiddleInitial(lastGiven);
      if (splitLast.length === 2) {
        givenTokens = [...givenTokens.slice(0, -1), ...splitLast];
      }
    }

    const formattedGiven = givenTokens.map(toTitleCaseWord);
    const preferredTokens = givenTokens.filter(
      token =>
        !/^[A-Za-z]\.?$/.test(token) &&
        !/^(?:JR\.?|SR\.?|II|III|IV)$/i.test(token),
    );
    const preferredName = (
      preferredTokens.length > 0 ? preferredTokens : givenTokens
    )
      .map(toTitleCaseWord)
      .join(' ');
    const formattedName = [...formattedGiven, ...lastWords].join(' ').trim();
    return {
      formattedName: formattedName || cleaned,
      preferredName: preferredName || formattedName || cleaned,
    };
  }

  const words = cleaned.split(/\s+/).filter(Boolean).map(toTitleCaseWord);
  return {
    formattedName: words.join(' '),
    preferredName: words.slice(0, Math.min(2, words.length)).join(' '),
  };
}

function deriveCollegeShort(college: string): string {
  for (const [pattern, acronym] of COLLEGE_ACRONYMS) {
    if (pattern.test(college)) return acronym;
  }
  const stopWords = new Set(['OF', 'AND', 'THE', 'IN', 'FOR']);
  const initials = college
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z]/g, '').toUpperCase())
    .filter(w => w.length > 0 && !stopWords.has(w))
    .map(w => w[0])
    .join('');
  return initials.slice(0, 6) || college;
}

function formatFacultyName(rawFaculty: string): string {
  const clean = rawFaculty.replace(/\s+/g, ' ').trim();
  if (!clean) return 'TBA';
  return clean;
}

/**
 * Separates a USTP COR schedule/room/faculty tail after the section or on a continuation row.
 * Examples:
 * - "F 7:00 AM - 10:00 AM/09-302(CITC Lab 3) Loredel Tamayo"
 * - "W 7:00 AM - 9:00 AM/51-201 Loredel Tamayo"
 * - "T 3:00 PM - 5:00 PM/Modular Classroom 1 FLORETO JR. QUINITO"
 * - "S 4:00 PM - 7:00 PM Shannice Cabili"
 * - "TF 1:00 PM - 2:30 PM Anton Alfred Endaya"
 */
export function parseUstpScheduleTail(tail: string): {
  dayCode: string;
  days: string[];
  startTime: string;
  endTime: string;
  startTime12: string;
  endTime12: string;
  room: string;
  faculty: string;
} | null {
  const cleaned = tail.replace(/\s+/g, ' ').trim();
  const scheduleRegex =
    /^(MON|TUE|TUES|WED|THU|THUR|THURS|FRI|SAT|SUN|MWF|MTWTHF|MTWTH|TTHS|TTH|MTH|MTWF|MW|MF|WF|MS|TS|WS|TF|FS|THS|TR|SU|TH|M|T|W|R|F|S|(?:[MTWRFS]|TH|SU)(?:[/-](?:[MTWRFS]|TH|SU))+)(?:\s+|(?=[0-9]))([0-9oOIl]{1,2}[:.][0-9oOIl]{2}\s*(?:AM|PM)?)\s*(?:-|–|—|to)\s*([0-9oOIl]{1,2}[:.][0-9oOIl]{2}\s*(?:AM|PM)?)\s*(.*)$/i;
  const match = cleaned.match(scheduleRegex);
  if (!match) return null;

  const dayCode = match[1].toUpperCase();
  let startRaw = match[2].trim();
  let endRaw = match[3].trim();
  const remainder = match[4].trim();

  // Inherit AM/PM if start time omitted it
  if (!/am|pm/i.test(startRaw) && /am|pm/i.test(endRaw)) {
    const endPeriod = endRaw.match(/am|pm/i)![0].toUpperCase();
    const normDigits = (s: string) =>
      s.replace(/[oO]/g, '0').replace(/[Il]/g, '1');
    const startH = parseInt(normDigits(startRaw.split(/[:.]/)[0]), 10);
    const endH = parseInt(normDigits(endRaw.split(/[:.]/)[0]), 10);
    if (endPeriod === 'PM' && startH >= 7 && startH <= 11 && endH < 12) {
      startRaw = `${startRaw} AM`;
    } else {
      startRaw = `${startRaw} ${endPeriod}`;
    }
  }

  const startNorm = normalizeTime24(startRaw);
  const endNorm = normalizeTime24(endRaw);
  if (!startNorm || !endNorm) return null;

  const days = expandDays(dayCode);
  let room = 'TBA';
  let faculty = '';

  if (remainder.startsWith('/')) {
    const afterSlash = remainder.slice(1).trim();
    // Pattern 1: Numeric building-room with optional parenthetical e.g. "09-302(CITC Lab 3) Loredel Tamayo" or "51-201 Loredel Tamayo"
    const bldgRoomMatch = afterSlash.match(
      /^(\d{1,3}\s*-\s*\d{2,4}(?:\s*\([^)]+\))?)\s*(.*)$/,
    );
    // Pattern 2: Named classroom/lab e.g. "Modular Classroom 1 FLORETO JR. QUINITO" or "CITC Lab 3 Loredel Tamayo"
    const namedRoomMatch = afterSlash.match(
      /^((?:Modular\s+Classroom\s*\d*|Room\s+[A-Za-z0-9-]+|Rm\.?\s*[A-Za-z0-9-]+|Bldg\.?\s*[A-Za-z0-9-]+|Building\s+[A-Za-z0-9-]+|CITC\s+Lab\s*\d*|ICT\s+Lab\s*\d*|Lab(?:oratory)?\s*\d+|AVR\s*\d*|Covered\s+Court\s*\d*|Court\s*\d*|Field\s*\d*|Track\s*\d*|Pool\s*\d*|Gym(?:nasium)?|Online|TBA|[A-Za-z]{2,6}-\d{2,4})(?:\s*\([^)]+\))?)\s*(.*)$/i,
    );

    if (bldgRoomMatch) {
      room = bldgRoomMatch[1].trim();
      faculty = bldgRoomMatch[2].trim();
    } else if (namedRoomMatch) {
      room = namedRoomMatch[1].trim();
      faculty = namedRoomMatch[2].trim();
    } else {
      room = afterSlash;
    }
  } else if (remainder.length > 0) {
    // Check if remainder starts with an explicit room keyword without a slash
    const explicitRoomMatch = remainder.match(
      /^((?:Bldg\.?\s*\d{1,3}-\d{2,4}|Building\s+\d{1,3}-\d{2,4}|\d{1,3}-\d{2,4}|Modular\s+Classroom\s*\d*|Room\s+[A-Za-z0-9-]+)(?:\s*\([^)]+\))?)\s*(.*)$/i,
    );
    if (explicitRoomMatch) {
      room = explicitRoomMatch[1].trim();
      faculty = explicitRoomMatch[2].trim();
    } else {
      faculty = remainder;
    }
  }

  return {
    dayCode,
    days,
    startTime: startNorm.time24,
    endTime: endNorm.time24,
    startTime12: startNorm.time12,
    endTime12: endNorm.time12,
    room: room || 'TBA',
    faculty: faculty ? formatFacultyName(faculty) : '',
  };
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Computes onboarding schedule preference recommendations from parsed USTP COR sessions.
 */
export function computeCorRecommendations(
  courses: UstpEnrolledCourse[],
  sessions: UstpCorClassSession[],
): UstpCorOnboardingRecommendations {
  // 1. Weekly class count
  const subjectCount = courses.length || sessions.length;
  const weeklyClassCount: WeeklyClassCount =
    subjectCount <= 3 ? '1-3' : subjectCount <= 6 ? '4-6' : '7+';

  // 2. Busiest weekday (by total class minutes) and longest gap between same-day classes
  const dayMinutes: Record<string, number> = {};
  const dayIntervals: Record<string, Array<{start: number; end: number}>> = {};

  for (const session of sessions) {
    const start = timeToMins(session.startTime);
    const end = timeToMins(session.endTime);
    const duration = Math.max(0, end - start);
    for (const day of session.days) {
      dayMinutes[day] = (dayMinutes[day] || 0) + duration;
      if (!dayIntervals[day]) dayIntervals[day] = [];
      dayIntervals[day].push({start, end});
    }
  }

  let busiestDay = 'Monday';
  let maxMinutes = -1;
  for (const [day, mins] of Object.entries(dayMinutes)) {
    if (mins > maxMinutes) {
      maxMinutes = mins;
      busiestDay = day;
    }
  }

  let maxGapMinutes = 0;
  for (const intervals of Object.values(dayIntervals)) {
    if (intervals.length < 2) continue;
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].start - sorted[i - 1].end;
      if (gap > maxGapMinutes) {
        maxGapMinutes = gap;
      }
    }
  }

  let longestClassGap: LongestClassGap = 'None';
  if (maxGapMinutes >= 120) {
    longestClassGap = '2+ hours';
  } else if (maxGapMinutes >= 60) {
    longestClassGap = '1 hour';
  } else if (maxGapMinutes >= 25) {
    longestClassGap = '30 min';
  }

  return {
    busiestDay,
    weeklyClassCount,
    longestClassGap,
  };
}

interface MatchedCourseRow {
  code: string;
  title: string;
  lecUnits: number;
  labUnits: number;
  creditUnits: number;
  section: string;
  tail: string;
}

// Legacy strict 3-unit regex kept as fallback for synthetic minimal sections (e.g. "A")
const PRIMARY_COURSE_ROW_REGEX =
  /^\*?\s*([A-Za-z]{2,10}-?\d{1,4}[A-Za-z]?(?:-[A-Za-z0-9]{1,4})?|[A-Za-z]{2,10}\s+\d{1,4}[A-Za-z]?|[A-Za-z]{2,10})\s+(.+?)\s+(\d+(?:\.\d+)?|[Oo])\s+(\d+(?:\.\d+)?|[Oo])\s+(\d+(?:\.\d+)?|[Oo])\s+([A-Za-z0-9_/-]{1,25})(?:\s+(.*))?$/;

const USTP_SECTION_TOKEN_REGEX =
  /^(?:[A-Za-z]{2,8}\d+[A-Za-z0-9_-]*|[A-Za-z0-9]+_[A-Za-z0-9_-]+)$/;
const UNIT_NUMBER_TOKEN_REGEX = /^(?:\d+(?:\.\d+)?|[Oo])$/;
const LEADING_COURSE_CODE_REGEX =
  /^\*?\s*([A-Za-z]{2,10}-?\d{1,4}[A-Za-z]?(?:-[A-Za-z0-9]{1,4})?|[A-Za-z]{2,10}\s+\d{1,4}[A-Za-z]?|[A-Za-z]{2,10})\s+(.+)$/;

function parseUnitNumber(raw: string): number {
  return parseFloat(raw.trim().replace(/[Oo]/g, '0'));
}

function isUnitNumberToken(tok: string): boolean {
  if (!UNIT_NUMBER_TOKEN_REGEX.test(tok)) return false;
  const val = parseUnitNumber(tok);
  return Number.isFinite(val) && val >= 0 && val <= 12;
}

/**
 * Matches a USTP course row tolerantly even if OCR drops 1-3 unit column digits (which otherwise
 * cause course numbers like "4" in "IT Elective 4" or "2" in "Research 2" to be mistaken for
 * lecUnits) or splits section suffixes like "IT4R11 Track2".
 */
function matchPrimaryCourseRow(line: string): MatchedCourseRow | null {
  const trimmed = line.trim();
  if (
    !trimmed ||
    Boolean(parseUstpScheduleTail(trimmed)) ||
    Boolean(parseTotalUnitsLine(trimmed)) ||
    HARD_STOP_PATTERNS.some(regex => regex.test(trimmed)) ||
    STUDENT_LABEL_COLON_REGEX.test(trimmed) ||
    NON_COURSE_PREFIX_REGEX.test(trimmed) ||
    /^(?:BLOCK|BLK|LOT|PUROK|BRGY|BARANGAY)\b/i.test(trimmed)
  ) {
    return null;
  }

  const codeMatch = trimmed.match(LEADING_COURSE_CODE_REGEX);
  if (codeMatch) {
    const code = codeMatch[1].replace(/\s+/g, ' ').trim();
    const rest = codeMatch[2].trim();
    const tokens = rest.split(/\s+/);

    // Anchor on a recognizable USTP section token (e.g. IT4R11_Track2, IT411_Rojo, IT4R11 Track2, IT2R13)
    let sectionIdx = -1;
    for (let i = 1; i < tokens.length; i++) {
      if (USTP_SECTION_TOKEN_REGEX.test(tokens[i])) {
        sectionIdx = i;
        break;
      }
    }

    if (sectionIdx >= 1) {
      let section = tokens[sectionIdx];
      let tailStartIdx = sectionIdx + 1;

      // Rejoin OCR-split Track suffix (e.g. "IT4R11 Track2" -> "IT4R11_Track2")
      if (
        tailStartIdx < tokens.length &&
        /^Track\d+$/i.test(tokens[tailStartIdx])
      ) {
        section = `${section}_${tokens[tailStartIdx]}`;
        tailStartIdx += 1;
      }

      const beforeSection = tokens.slice(0, sectionIdx);
      const trailingNums: number[] = [];
      let numCount = 0;
      for (let j = beforeSection.length - 1; j >= 1 && numCount < 3; j--) {
        if (!isUnitNumberToken(beforeSection[j])) break;
        trailingNums.unshift(parseUnitNumber(beforeSection[j]));
        numCount += 1;
      }

      let consumeCount = 0;
      let lecUnits = 0;
      let labUnits = 0;
      let creditUnits = 0;

      if (trailingNums.length === 3) {
        const [u0, u1, u2] = trailingNums;
        if (u2 > 0 && Math.abs(u0 + u1 - u2) < 0.01) {
          consumeCount = 3;
          lecUnits = u0;
          labUnits = u1;
          creditUnits = u2;
        } else if (u2 > 0 && u1 <= u2) {
          // One unit digit dropped -> last two are [lec, credit], preserving title trailing digit
          consumeCount = 2;
          lecUnits = u1;
          creditUnits = u2;
          labUnits = Math.max(0, u2 - u1);
        } else if (u2 > 0) {
          consumeCount = 1;
          creditUnits = u2;
          lecUnits = u2;
          labUnits = 0;
        }
      } else if (trailingNums.length === 2) {
        const [u0, u1] = trailingNums;
        if (u1 > 0 && u0 <= u1) {
          consumeCount = 2;
          lecUnits = u0;
          creditUnits = u1;
          labUnits = Math.max(0, u1 - u0);
        } else if (u1 > 0) {
          consumeCount = 1;
          creditUnits = u1;
          lecUnits = u1;
          labUnits = 0;
        }
      } else if (trailingNums.length === 1 && beforeSection.length >= 2) {
        const u0 = trailingNums[0];
        if (u0 > 0) {
          consumeCount = 1;
          creditUnits = u0;
          lecUnits = u0;
          labUnits = 0;
        }
      }

      const titleTokens = beforeSection.slice(
        0,
        beforeSection.length - consumeCount,
      );
      const title = titleTokens.join(' ').trim();
      let tail = tokens.slice(tailStartIdx).join(' ').trim();

      // If OCR split an arbitrary suffix between section and schedule, absorb it if remainder parses
      if (tail && !parseUstpScheduleTail(tail)) {
        const splitTailMatch = tail.match(/^([^\s]+)\s+(.+)$/);
        if (
          splitTailMatch &&
          parseUstpScheduleTail(splitTailMatch[2]) &&
          !/^[MTWRFS]{1,4}$|^MON|TUE|WED|THU|FRI|SAT|SUN/i.test(
            splitTailMatch[1],
          )
        ) {
          if (/^[A-Za-z0-9_-]{2,15}$/.test(splitTailMatch[1])) {
            section = `${section}_${splitTailMatch[1]}`;
          }
          tail = splitTailMatch[2].trim();
        }
      }

      const hasDigitsInCode = /\d/.test(code);
      const hasStrongTail =
        Boolean(parseUstpScheduleTail(tail)) || tail.length >= 3;
      if (
        title.length >= 2 &&
        (hasDigitsInCode || consumeCount > 0 || section.includes('_')) &&
        (consumeCount > 0 || hasStrongTail)
      ) {
        return {
          code,
          title,
          lecUnits,
          labUnits,
          creditUnits,
          section,
          tail,
        };
      }
    }
  }

  const strict = trimmed.match(PRIMARY_COURSE_ROW_REGEX);
  if (!strict) return null;
  const lecUnits = parseUnitNumber(strict[3]);
  const labUnits = parseUnitNumber(strict[4]);
  const creditUnits = parseUnitNumber(strict[5]);
  if (Math.abs(lecUnits + labUnits - creditUnits) > 0.01) {
    return null;
  }
  return {
    code: strict[1].replace(/\s+/g, ' ').trim(),
    title: strict[2].trim(),
    lecUnits,
    labUnits,
    creditUnits,
    section: strict[6].trim(),
    tail: (strict[7] || '').trim(),
  };
}

function parseTotalUnitsLine(
  line: string,
): {lec: number; lab: number; cred: number} | null {
  const explicit = line.match(
    /^Total\s+Unit\(s\)\s*:?\s*(\d+(?:\.\d+)?|[Oo])\s+(\d+(?:\.\d+)?|[Oo])\s+(\d+(?:\.\d+)?|[Oo])/i,
  );
  if (explicit) {
    return {
      lec: parseUnitNumber(explicit[1]),
      lab: parseUnitNumber(explicit[2]),
      cred: parseUnitNumber(explicit[3]),
    };
  }
  const bare = line.match(
    /^(\d{1,2}(?:\.\d+)?|[Oo])\s+(\d{1,2}(?:\.\d+)?|[Oo])\s+(\d{1,2}(?:\.\d+)?|[Oo])$/,
  );
  if (bare) {
    const lec = parseUnitNumber(bare[1]);
    const lab = parseUnitNumber(bare[2]);
    const cred = parseUnitNumber(bare[3]);
    if (Math.abs(lec + lab - cred) < 0.01) {
      return {lec, lab, cred};
    }
  }
  return null;
}

const NON_COURSE_PREFIX_REGEX =
  /^(?:Document\s+Code|FM-USTP|Rev\.\s*No|01\s+\d|Republic\s+of|University\s+of|Alubijid|CERTIFICATE|STUDENT\s+GENERAL|CODE\s+SUBJECT|Lec\s+Lab|U\s+N\s+I\s+T|SECTION\s+SCHEDULE|Total\s+Unit|First\s+Payment|1st\s+Sem|2nd\s+Sem|First\s+Sem|Second\s+Sem|Midyear|Summer|COLLEGE\s+OF|B\.?\s*S\.?|Bachelor|Master|Doctor|[1-5](?:st|nd|rd|th)\s+Year|N\/A|Filipino|Note:|Free\s+Higher|[A-Z]{2,8}-[A-Z0-9-]{4,25}$|\d{4,12}$|[MF]\s+\d{2}$|[A-ZÑ][A-ZÑ\s'-]+,\s*[A-ZÑ])/i;

const STUDENT_LABEL_COLON_REGEX = /^[A-Za-z][A-Za-z\s/#]{1,24}:/;

function canStartSplitCourseRow(line: string): boolean {
  if (
    Boolean(matchPrimaryCourseRow(line)) ||
    Boolean(parseUstpScheduleTail(line)) ||
    Boolean(parseTotalUnitsLine(line)) ||
    HARD_STOP_PATTERNS.some(regex => regex.test(line)) ||
    STUDENT_LABEL_COLON_REGEX.test(line) ||
    NON_COURSE_PREFIX_REGEX.test(line)
  ) {
    return false;
  }
  return /^\*?\s*[A-Za-z]{2,10}(?:-?\d{1,4}[A-Za-z]?)?(?:\s|$)/.test(line);
}

function canJoinSplitCourseLine(
  line: string,
  prevHasDigitCode: boolean,
): boolean {
  const startsWithDigitCode = /^\*?\s*[A-Za-z]{2,10}-?\d/.test(line);
  if (startsWithDigitCode) return false;
  if (!prevHasDigitCode && Boolean(matchPrimaryCourseRow(line))) {
    return false;
  }
  return (
    !parseUstpScheduleTail(line) &&
    !parseTotalUnitsLine(line) &&
    !HARD_STOP_PATTERNS.some(regex => regex.test(line)) &&
    !STUDENT_LABEL_COLON_REGEX.test(line) &&
    !NON_COURSE_PREFIX_REGEX.test(line)
  );
}

/**
 * Reconstructs course rows split across 2–3 lines by wrapped subject titles
 * or slight vertical cell misalignment during OCR / PDF extraction.
 */
function mergeSplitCourseLines(lines: string[]): string[] {
  const merged: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (canStartSplitCourseRow(line) && i + 1 < lines.length) {
      const prevHasDigitCode = /^\*?\s*[A-Za-z]{2,10}-?\d/.test(line);
      const next = lines[i + 1];
      if (canJoinSplitCourseLine(next, prevHasDigitCode)) {
        const two = `${line} ${next}`;
        if (matchPrimaryCourseRow(two)) {
          merged.push(two);
          i += 2;
          continue;
        }
        if (i + 2 < lines.length) {
          const third = lines[i + 2];
          if (canJoinSplitCourseLine(third, prevHasDigitCode)) {
            const three = `${two} ${third}`;
            if (matchPrimaryCourseRow(three)) {
              merged.push(three);
              i += 3;
              continue;
            }
          }
        }
      }
    }
    merged.push(line);
    i += 1;
  }
  return merged;
}

/**
 * Parses a USTP Certificate of Registration (COR) from extracted PDF/OCR text.
 * Supports both coordinate-sorted horizontal OCR text and PDF block-separated text.
 * Isolates Student General Information and the Schedule Table while strictly
 * ignoring Assessed Fees, Student Pledge, Schedule of Payments, and Home Address.
 */
export function parseUstpCor(
  rawText: string,
  referenceDate: Date = new Date(),
): ParsedUstpCorResult {
  const rawLines = rawText
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const allLines = mergeSplitCourseLines(rawLines);

  // Detect whether this document is a USTP COR
  const joinedUpper = allLines.join('\n').toUpperCase();
  const isUstpCor =
    /CERTIFICATE\s+OF\s+REGISTRATION|C\s+E\s+R\s+T\s+I\s+F\s+I\s+C\s+A\s+T\s+E/i.test(
      joinedUpper,
    ) ||
    /UNIVERSITY\s+OF\s+SCIENCE\s+AND\s+TECHNOLOGY\s+OF\s+SOUTHERN\s+PHILIPPINES|\bUSTP\b/i.test(
      joinedUpper,
    ) ||
    /STUDENT\s+GENERAL\s+INFORMATION/i.test(joinedUpper) ||
    /\bCITC-BSIT\b|\bCITOC-BSIT\b|\bIT\dR\d+\b/i.test(joinedUpper);

  // Split into Zone 1 (Header & Student Info) before the first primary course row,
  // and Zone 2 (Schedule Table) starting at the first primary course row and hard-stopping
  // at Total Unit(s) / Assessed Fees / Student Pledge / Schedule of Payments.
  const zone1Lines: string[] = [];
  const zone2Lines: string[] = [];
  let inZone2 = false;
  let totalLecUnits: number | null = null;
  let totalLabUnits: number | null = null;
  let totalCreditUnits: number | null = null;

  for (const line of allLines) {
    if (!inZone2) {
      if (matchPrimaryCourseRow(line)) {
        inZone2 = true;
        zone2Lines.push(line);
      } else if (!HARD_STOP_PATTERNS.some(regex => regex.test(line))) {
        zone1Lines.push(line);
      }
      continue;
    }

    // Once inside Zone 2 (course rows started), check for Total Unit(s) or hard stop
    const totalUnits = parseTotalUnitsLine(line);
    if (totalUnits) {
      totalLecUnits = totalUnits.lec;
      totalLabUnits = totalUnits.lab;
      totalCreditUnits = totalUnits.cred;
      break;
    }

    if (HARD_STOP_PATTERNS.some(regex => regex.test(line))) {
      break;
    }

    zone2Lines.push(line);
  }

  // --- Parse Zone 1: Student General Information ---
  const zone1Text = zone1Lines.join('\n');

  let campus = 'USTP CDO Campus';
  const campusMatch = zone1Text.match(/\b(USTP\s+[A-Z\s]+CAMPUS)\b/i);
  if (campusMatch) {
    campus = campusMatch[1]
      .trim()
      .split(/\s+/)
      .map(w =>
        w.toUpperCase() === 'USTP' || w.toUpperCase() === 'CDO'
          ? w.toUpperCase()
          : toTitleCaseWord(w),
      )
      .join(' ');
  }

  let registrationNo = '';
  const regInline =
    zone1Text.match(/Registration\s+No\s*:\s*(\d{4,10})/i) ||
    zone1Text.match(/AY\s*\d{4}\s*-\s*\d{4}\s+(\d{4,10})/i);
  if (regInline) {
    registrationNo = regInline[1];
  } else {
    const standaloneReg = zone1Lines.find(l => /^\d{5,7}$/.test(l));
    if (standaloneReg) registrationNo = standaloneReg;
  }

  let studentNo = '';
  const studNoInline = zone1Text.match(/Student\s+No\s*:\s*(\d{8,12})/i);
  if (studNoInline) {
    studentNo = studNoInline[1];
  } else {
    const standaloneStudNo = zone1Text.match(/\b(20\d{8})\b/);
    if (standaloneStudNo) studentNo = standaloneStudNo[1];
  }

  let fullName = '';
  for (const l of zone1Lines) {
    const m = l.match(
      /Name\s*:\s*([A-ZÑ][A-ZÑ\s.,'-]+?)(?=\s+(?:Program|College|Gender|Major|Year|Curriculum|Student)\s*:|$)/i,
    );
    if (m && !/^(?:Student|Gender|Age|College|Program)/i.test(m[1].trim())) {
      fullName = m[1].trim();
      break;
    }
  }
  if (!fullName) {
    const commaNameLine = zone1Lines.find(
      l =>
        /^[A-ZÑ][A-ZÑ\s'-]+,\s*[A-ZÑ][A-ZÑ\s.'-]+$/.test(l) &&
        !/UNIVERSITY|PHILIPPINES|REPUBLIC|COLLEGE|INFORMATION|MACASANDIG|CAGAYAN|TIBASAK|BLOCK/i.test(
          l,
        ),
    );
    if (commaNameLine) fullName = commaNameLine;
  }

  const {formattedName, preferredName} = formatUstpStudentName(fullName);

  let gender = '';
  let age: number | null = null;

  const genderInline = zone1Text.match(/Gender\s*:\s*(M|F|Male|Female)\b/i);
  if (genderInline) {
    const g = genderInline[1].trim().toUpperCase();
    gender = g === 'MALE' ? 'M' : g === 'FEMALE' ? 'F' : g;
  }
  const ageInline = zone1Text.match(/Age\s*:\s*(\d{2})\b/i);
  if (ageInline) {
    age = parseInt(ageInline[1], 10);
  }
  if (!gender || age === null) {
    const combinedGenderAge = zone1Lines.find(l =>
      /^(M|F)\s+(1[5-9]|[2-6]\d)$/i.test(l),
    );
    if (combinedGenderAge) {
      const parts = combinedGenderAge.split(/\s+/);
      if (!gender) gender = parts[0].toUpperCase();
      if (age === null) age = parseInt(parts[1], 10);
    } else {
      if (!gender) {
        const standaloneGender = zone1Lines.find(l => /^(?:M|F)$/.test(l));
        if (standaloneGender) gender = standaloneGender;
      }
      if (age === null) {
        const standaloneAge = zone1Lines.find(l =>
          /^(?:1[5-9]|[2-5]\d)$/.test(l),
        );
        if (standaloneAge) age = parseInt(standaloneAge, 10);
      }
    }
  }

  let nationality = 'Filipino';
  const natInline = zone1Text.match(/Nationality\s*:\s*([A-Za-z]+)/i);
  if (natInline && !/^(?:Major|Year|Age|Gender)/i.test(natInline[1])) {
    nationality = toTitleCaseWord(natInline[1]);
  }

  let college = '';
  for (const l of zone1Lines) {
    const m = l.match(
      /College\s*:\s*(COLLEGE\s+OF\s+[A-Za-z\s,&]+?)(?=\s+(?:Program|Name|Gender|Curriculum|Year)\s*:|$)/i,
    );
    if (m) {
      college = m[1].trim();
      break;
    }
  }
  if (!college) {
    const standaloneCollege = zone1Lines.find(l => /^COLLEGE\s+OF\s+/i.test(l));
    if (standaloneCollege) college = standaloneCollege.trim();
  }
  const collegeShort = college ? deriveCollegeShort(college) : '';

  let program = '';
  for (const l of zone1Lines) {
    const m = l.match(
      /Program\s*:\s*([A-Za-z.\s,&()-]+?)(?=\s+(?:Major|Curriculum|Year|Gender|College)\s*:|$)/i,
    );
    if (m && !/^(?:Major|Year|Curriculum|Gender)/i.test(m[1].trim())) {
      program = m[1].trim();
      break;
    }
  }
  if (!program) {
    const standaloneProg = zone1Lines.find(l =>
      /^(?:B\.?\s*S\.?|Bachelor\s+of|B\.?\s*A\.?|Master\s+of|Doctor\s+of)\s+/i.test(
        l,
      ),
    );
    if (standaloneProg) program = standaloneProg.trim();
  }

  let major = 'N/A';
  for (const l of zone1Lines) {
    const m = l.match(
      /Major\s*:\s*([A-Za-z0-9/\s-]+?)(?=\s+(?:Curriculum|Year|Scholarship|Age)\s*:|$)/i,
    );
    if (m && !/^(?:Year|Curriculum|Scholarship)/i.test(m[1].trim())) {
      major = m[1].trim();
      break;
    }
  }

  let yearLevel = '';
  const yearInline = zone1Text.match(
    /Year\s+Level\s*:\s*([1-5](?:st|nd|rd|th)\s+Year(?:\s*-\s*[A-Za-z]+)?)/i,
  );
  if (yearInline) {
    yearLevel = yearInline[1].replace(/Scholarship.*$/i, '').trim();
  } else {
    const standaloneYear = zone1Text.match(
      /\b([1-5](?:st|nd|rd|th)\s+Year(?:\s*-\s*Baccalaureate)?)\b/i,
    );
    if (standaloneYear) yearLevel = standaloneYear[1].trim();
  }
  const yearLevelShort =
    yearLevel.match(/^[1-5](?:st|nd|rd|th)\s+Year/i)?.[0] || yearLevel;

  let curriculum = '';
  const currInline = zone1Text.match(
    /Curriculum\s*:\s*([A-Z]{2,8}-[A-Z0-9-]{4,25})/i,
  );
  if (currInline) {
    curriculum = currInline[1].trim();
  } else {
    const standaloneCurr = zone1Text.match(
      /\b([A-Z]{2,8}-[A-Z]{2,8}-\d{4}-\d{4})\b/,
    );
    if (standaloneCurr) curriculum = standaloneCurr[1];
  }

  let academicTerm = '';
  const termMatch = zone1Text.match(
    /\b((?:1st|2nd|First|Second|Midyear|Summer)\s+(?:Semester|Term)?\s*AY\s*\d{4}\s*-\s*\d{4})\b/i,
  );
  if (termMatch) {
    academicTerm = termMatch[1].replace(/\s+/g, ' ').trim();
  }

  // --- Parse Zone 2: Enrolled Subjects & Schedule Table ---
  const semesterEndDate = computeSemesterEndDate(referenceDate, 18);
  const recurrenceRule = `FREQ=WEEKLY;UNTIL=${semesterEndDate}`;
  const courses: UstpEnrolledCourse[] = [];
  const allSessions: UstpCorClassSession[] = [];
  let sessionCounter = 0;

  let activeCourse: UstpEnrolledCourse | null = null;

  for (const line of zone2Lines) {
    const primaryMatch = matchPrimaryCourseRow(line);
    if (primaryMatch) {
      const {code, title, lecUnits, labUnits, creditUnits, section, tail} =
        primaryMatch;

      const course: UstpEnrolledCourse = {
        code,
        title,
        subjectTitle: title,
        lecUnits,
        labUnits,
        creditUnits,
        section,
        faculty: 'TBA',
        sessions: [],
        scheduleSummary: 'TBA',
      };

      if (tail) {
        const parsedTail = parseUstpScheduleTail(tail);
        if (parsedTail) {
          if (parsedTail.faculty) {
            course.faculty = parsedTail.faculty;
          }
          sessionCounter += 1;
          const session: UstpCorClassSession = {
            id: `ustp-cor-${sessionCounter}-${code}`,
            code,
            subjectTitle: title,
            section,
            faculty: course.faculty,
            dayCode: parsedTail.dayCode,
            days: parsedTail.days,
            startTime: parsedTail.startTime,
            endTime: parsedTail.endTime,
            startTime12: parsedTail.startTime12,
            endTime12: parsedTail.endTime12,
            room: parsedTail.room,
            recurrenceRule,
            rawText: line,
          };
          course.sessions.push(session);
          allSessions.push(session);
        } else {
          // Unscheduled course with faculty only (e.g. "IT411 CAPSTONE Project and Research 2 ... IT411_Rojo JAY NOEL ROJO")
          course.faculty = formatFacultyName(tail);
        }
      }

      courses.push(course);
      activeCourse = course;
      continue;
    }

    // Check if this is a continuation schedule row for the active course (e.g. "W 7:00 AM - 9:00 AM/51-201 Loredel Tamayo")
    if (activeCourse) {
      const contTail = parseUstpScheduleTail(line);
      if (contTail) {
        const faculty = contTail.faculty || activeCourse.faculty;
        if (activeCourse.faculty === 'TBA' && faculty !== 'TBA') {
          activeCourse.faculty = faculty;
        }
        sessionCounter += 1;
        const session: UstpCorClassSession = {
          id: `ustp-cor-${sessionCounter}-${activeCourse.code}`,
          code: activeCourse.code,
          subjectTitle: activeCourse.title,
          section: activeCourse.section,
          faculty,
          dayCode: contTail.dayCode,
          days: contTail.days,
          startTime: contTail.startTime,
          endTime: contTail.endTime,
          startTime12: contTail.startTime12,
          endTime12: contTail.endTime12,
          room: contTail.room,
          recurrenceRule,
          rawText: line,
        };
        activeCourse.sessions.push(session);
        allSessions.push(session);
      }
    }
  }

  // Finalize schedule summaries and primary section
  const zeroUnitCourses = courses.filter(c => c.creditUnits === 0);
  if (totalCreditUnits !== null && zeroUnitCourses.length === 1) {
    const knownCred = courses.reduce((s, c) => s + c.creditUnits, 0);
    const missingCred = totalCreditUnits - knownCred;
    if (missingCred > 0 && missingCred <= 6) {
      zeroUnitCourses[0].creditUnits = missingCred;
      zeroUnitCourses[0].lecUnits = missingCred;
    }
  }

  const sectionCounts: Record<string, number> = {};
  let sumLec = 0;
  let sumLab = 0;
  let sumCred = 0;

  for (const course of courses) {
    sumLec += course.lecUnits;
    sumLab += course.labUnits;
    sumCred += course.creditUnits;
    if (course.section) {
      sectionCounts[course.section] = (sectionCounts[course.section] || 0) + 1;
    }
    for (const s of course.sessions) {
      if ((s.faculty === 'TBA' || !s.faculty) && course.faculty !== 'TBA') {
        s.faculty = course.faculty;
      }
    }
    if (course.sessions.length > 0) {
      course.scheduleSummary = course.sessions
        .map(s => {
          const dayShort = s.days.map(d => d.slice(0, 3)).join('/');
          const roomPart = s.room && s.room !== 'TBA' ? ` (${s.room})` : '';
          return `${dayShort} ${s.startTime12}–${s.endTime12}${roomPart}`;
        })
        .join(', ');
    } else {
      course.scheduleSummary = 'TBA / Flexible';
    }
  }

  let primarySection = '';
  let bestSecCount = 0;
  for (const [sec, count] of Object.entries(sectionCounts)) {
    if (count > bestSecCount) {
      bestSecCount = count;
      primarySection = sec;
    }
  }

  if (totalLecUnits === null && courses.length > 0) totalLecUnits = sumLec;
  if (totalLabUnits === null && courses.length > 0) totalLabUnits = sumLab;
  if (totalCreditUnits === null && courses.length > 0)
    totalCreditUnits = sumCred;
  const totalUnits = totalCreditUnits !== null ? String(totalCreditUnits) : '';

  const profile: UstpStudentProfile = {
    isUstpStudent: true,
    campus,
    registrationNo,
    studentNo,
    fullName,
    formattedName,
    preferredName,
    gender,
    age,
    nationality,
    college,
    collegeShort,
    program,
    major,
    yearLevel,
    yearLevelShort,
    curriculum,
    academicTerm,
    academicYearTerm: academicTerm,
    section: primarySection,
    primarySection,
    totalUnits,
    totalLecUnits,
    totalLabUnits,
    totalCreditUnits,
  };

  const recommendedPreferences = computeCorRecommendations(
    courses,
    allSessions,
  );

  const markdownLines: string[] = [
    '### 🎓 USTP Certificate of Registration',
    '',
    `**Student:** ${formattedName || fullName || 'USTP Student'}${
      studentNo ? ` (${studentNo})` : ''
    }`,
    `**Program:** ${program || 'N/A'}${
      yearLevelShort ? ` · ${yearLevelShort}` : ''
    }`,
    `**Section:** ${primarySection || 'N/A'}${
      academicTerm ? ` · ${academicTerm}` : ''
    }`,
    '',
    '| Code | Subject Title | Section | Schedule / Room | Faculty |',
    '| :--- | :--- | :--- | :--- | :--- |',
    ...courses.map(
      c =>
        `| **${c.code}** | ${c.title} | ${c.section} | ${c.scheduleSummary} | ${c.faculty} |`,
    ),
  ];

  const valid = Boolean(
    isUstpCor && (courses.length > 0 || studentNo || fullName),
  );

  return {
    isUstpCor: valid,
    isValidUstpCor: valid,
    profile,
    courses,
    sessions: allSessions,
    semesterEndDate,
    recommendedPreferences,
    markdownSummary: markdownLines.join('\n'),
  };
}
