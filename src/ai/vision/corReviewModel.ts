/**
 * COR review draft model (onboarding redesign).
 *
 * Extraction only produces a draft. Every included subject and meeting needs
 * an explicit student review; editing reviewed data returns it to review.
 * Nothing here touches storage: `corImportStore` persists drafts and commits
 * the reviewed plan. Pure functions, so they are easy to test.
 */
import type {
  CorAccuracyLevel,
  CorExtractionMethod,
  ParsedUstpCorResult,
  UstpCorClassSession,
} from './ustpCorParser';

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export const WEEKDAYS: Weekday[] = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};
const WEEKDAY_JS_INDEX: Record<Weekday, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type Meridiem = 'AM' | 'PM';
export interface ClockTime {
  hour: number | null; // 1-12
  minute: number | null; // 0-59
  period: Meridiem | null;
}
export const EMPTY_CLOCK: ClockTime = {hour: null, minute: null, period: null};

export type MeetingNotice =
  | 'days_unclear'
  | 'start_period_missing'
  | 'end_period_missing'
  | 'time_unclear';

export type DraftOrigin = 'detected' | 'added';

export interface CorDraftMeeting {
  id: string;
  days: Weekday[];
  start: ClockTime;
  end: ClockTime;
  room: string;
  faculty: string;
  section: string;
  origin: DraftOrigin;
  /** The recognized COR line this meeting came from (empty when added by hand). */
  sourceText: string;
  notices: MeetingNotice[];
  reviewed: boolean;
}

export interface CorDraftCourse {
  id: string;
  code: string;
  title: string;
  units: string;
  origin: DraftOrigin;
  sourceText: string;
  included: boolean;
  /** Subject code/title/units reviewed by the student. */
  reviewed: boolean;
  /** The student chose to keep a subject with no timed meeting (TBA/flexible). */
  keepUnscheduled: boolean;
  meetings: CorDraftMeeting[];
}

export interface CorDraftDocument {
  fileName: string;
  /** App-private copy of the picked file, used for "View original". */
  localPath: string | null;
  mimeType: string | null;
}

/** COR facts that are kept but not edited (they come from the document as-is). */
export interface CorDetectedExtras {
  college: string;
  collegeShort: string;
  major: string;
  curriculum: string;
  yearLevelShort: string;
  formattedName: string;
  totalCreditUnits: number | null;
  totalLecUnits: number | null;
  totalLabUnits: number | null;
}

/** How the COR was read and what the automatic checks found (read-only). */
export interface CorDraftAccuracy {
  method: CorExtractionMethod;
  level: CorAccuracyLevel;
  /** Student-facing check messages, most serious first. */
  issues: string[];
}

export type CorDraftStatus = 'draft' | 'committed';

export interface CorDraft {
  version: 1;
  draftId: string;
  ownerId: string;
  status: CorDraftStatus;
  createdAt: string;
  updatedAt: string;
  document: CorDraftDocument | null;
  /** Text recognized from the original file, for side-by-side comparison. */
  sourceText: string;
  studentName: string;
  /** Read-only: comes from the COR. Wrong or missing means replace the COR. */
  campus: string;
  /** Read-only: comes from the COR. Wrong or missing means replace the COR. */
  program: string;
  yearLevel: string;
  section: string;
  term: string;
  /** YYYY-MM-DD, confirmed by the student (never guessed). */
  startDate: string;
  endDate: string;
  studentReviewed: boolean;
  academicReviewed: boolean;
  termReviewed: boolean;
  courses: CorDraftCourse[];
  acknowledgedOverlaps: string[];
  extras: CorDetectedExtras;
  committedImportId: string | null;
  /** Absent on drafts saved before accuracy checks existed. */
  accuracy?: CorDraftAccuracy;
}

let idCounter = 0;
export const draftLocalId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(
    36,
  )}-${Math.random().toString(36).slice(2, 6)}`;
};

// ---------------------------------------------------------------------------
// Days and times
// ---------------------------------------------------------------------------

const DAY_TOKEN_RE = /^(?:TH|SU|[MTWRFS])+$/;
const DAY_WORDS: Record<string, Weekday> = {
  MON: 'Mon',
  TUE: 'Tue',
  TUES: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  THUR: 'Thu',
  THURS: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

/**
 * Strict day-code reading. Unlike the parser's `expandDays`, an
 * unrecognized code returns [] instead of silently defaulting to Monday.
 */
export const parseDayCodeStrict = (dayCode: string): Weekday[] => {
  const upper = (dayCode || '').toUpperCase().replace(/[\s,]/g, '');
  if (!upper) return [];
  const result: Weekday[] = [];
  const push = (day: Weekday) => {
    if (!result.includes(day)) result.push(day);
  };
  const parts = upper.split(/[/-]/).filter(Boolean);
  for (const part of parts) {
    if (DAY_WORDS[part]) {
      push(DAY_WORDS[part]);
      continue;
    }
    if (part === 'TR') {
      push('Tue');
      push('Thu');
      continue;
    }
    if (!DAY_TOKEN_RE.test(part)) return [];
    let i = 0;
    while (i < part.length) {
      const two = part.slice(i, i + 2);
      if (two === 'TH') {
        push('Thu');
        i += 2;
        continue;
      }
      if (two === 'SU') {
        push('Sun');
        i += 2;
        continue;
      }
      const map: Record<string, Weekday> = {
        M: 'Mon',
        T: 'Tue',
        W: 'Wed',
        R: 'Thu',
        F: 'Fri',
        S: 'Sat',
      };
      const mapped = map[part[i]];
      if (!mapped) return [];
      push(mapped);
      i += 1;
    }
  }
  return WEEKDAYS.filter(day => result.includes(day));
};

export const clockFrom24 = (
  hhmm: string,
  period: Meridiem | null = null,
): ClockTime => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!match) return {...EMPTY_CLOCK};
  const h24 = Number(match[1]);
  const minute = Number(match[2]);
  if (h24 > 23 || minute > 59) return {...EMPTY_CLOCK};
  return {
    hour: h24 % 12 || 12,
    minute,
    period: period ?? (h24 >= 12 ? 'PM' : 'AM'),
  };
};

export const isClockComplete = (clock: ClockTime): boolean =>
  clock.hour !== null &&
  clock.minute !== null &&
  clock.period !== null &&
  clock.hour >= 1 &&
  clock.hour <= 12 &&
  clock.minute >= 0 &&
  clock.minute <= 59;

export const clockToMinutes = (clock: ClockTime): number | null => {
  if (!isClockComplete(clock)) return null;
  const hour12 = clock.hour as number;
  let h24 = hour12 % 12;
  if (clock.period === 'PM') h24 += 12;
  return h24 * 60 + (clock.minute as number);
};

export const clockTo24 = (clock: ClockTime): string | null => {
  const minutes = clockToMinutes(clock);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60,
  ).padStart(2, '0')}`;
};

export const clockLabel = (clock: ClockTime): string => {
  if (clock.hour === null || clock.minute === null) return 'Time needed';
  const base = `${clock.hour}:${String(clock.minute).padStart(2, '0')}`;
  return clock.period ? `${base} ${clock.period}` : `${base} (AM/PM?)`;
};

/** Parses "9", "9:30", "930", "09.30" typed into an hour:minute field (no AM/PM). */
export const parseClockDigits = (
  text: string,
): {hour: number; minute: number} | null => {
  const clean = (text || '').trim().replace('.', ':');
  let match = /^(\d{1,2})(?::(\d{2}))?$/.exec(clean);
  if (!match && /^\d{3,4}$/.test(clean)) {
    match = /^(\d{1,2})(\d{2})$/.exec(clean);
  }
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return {hour, minute};
};

const TIME_TOKEN_RE = /([0-9oOIl]{1,2}[:.][0-9oOIl]{2})\s*(AM|PM)?/gi;

/** Which printed times lacked AM/PM in the recognized COR line. */
export const detectMissingPeriods = (
  rawText: string,
): {start: boolean; end: boolean} => {
  const tokens = Array.from((rawText || '').matchAll(TIME_TOKEN_RE));
  if (tokens.length < 2) return {start: false, end: false};
  return {start: !tokens[0][2], end: !tokens[1][2]};
};

// ---------------------------------------------------------------------------
// Draft construction
// ---------------------------------------------------------------------------

const meetingFromSession = (
  session: UstpCorClassSession,
  fallbackSection: string,
): CorDraftMeeting => {
  const days = parseDayCodeStrict(session.dayCode);
  const missing = detectMissingPeriods(session.rawText);
  const notices: MeetingNotice[] = [];
  if (days.length === 0) notices.push('days_unclear');
  if (missing.start) notices.push('start_period_missing');
  if (missing.end) notices.push('end_period_missing');
  const start = clockFrom24(session.startTime);
  const end = clockFrom24(session.endTime);
  if (start.hour === null || end.hour === null) notices.push('time_unclear');
  return {
    id: draftLocalId('meeting'),
    days,
    // A period the COR did not print is left for the student to choose.
    start: missing.start ? {...start, period: null} : start,
    end: missing.end ? {...end, period: null} : end,
    room: session.room && session.room !== 'TBA' ? session.room : '',
    faculty:
      session.faculty && session.faculty !== 'TBA' ? session.faculty : '',
    section: session.section || fallbackSection,
    origin: 'detected',
    sourceText: session.rawText || '',
    notices,
    reviewed: false,
  };
};

export interface BuildDraftInput {
  ownerId: string;
  draftId?: string;
  document: CorDraftDocument | null;
  sourceText: string;
  now?: Date;
}

/** Turns an extraction result into an unreviewed draft. Nothing is guessed. */
export const buildCorDraft = (
  parsed: ParsedUstpCorResult,
  input: BuildDraftInput,
): CorDraft => {
  const now = (input.now ?? new Date()).toISOString();
  const profile = parsed.profile;
  const section = profile.section || profile.primarySection || '';
  return {
    version: 1,
    draftId: input.draftId ?? draftLocalId('cordraft'),
    ownerId: input.ownerId,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    document: input.document,
    sourceText: (input.sourceText || '').slice(0, 12000),
    studentName: profile.formattedName || profile.fullName || '',
    campus: profile.campus || '',
    program: profile.program || '',
    yearLevel: profile.yearLevel || profile.yearLevelShort || '',
    section,
    term: profile.academicTerm || profile.academicYearTerm || '',
    startDate: '',
    endDate: '',
    studentReviewed: false,
    academicReviewed: false,
    termReviewed: false,
    courses: parsed.courses.map(course => ({
      id: draftLocalId('course'),
      code: course.code || '',
      title: course.subjectTitle || course.title || '',
      units: Number.isFinite(course.creditUnits)
        ? String(course.creditUnits)
        : '',
      origin: 'detected' as const,
      sourceText:
        course.rawText ||
        course.sessions[0]?.rawText ||
        `${course.code} ${course.title}`,
      included: true,
      reviewed: false,
      keepUnscheduled: false,
      meetings: course.sessions.map(session =>
        meetingFromSession(session, course.section || section),
      ),
    })),
    acknowledgedOverlaps: [],
    extras: {
      college: profile.college || '',
      collegeShort: profile.collegeShort || '',
      major: profile.major || '',
      curriculum: profile.curriculum || '',
      yearLevelShort: profile.yearLevelShort || '',
      formattedName: profile.formattedName || '',
      totalCreditUnits: profile.totalCreditUnits,
      totalLecUnits: profile.totalLecUnits,
      totalLabUnits: profile.totalLabUnits,
    },
    committedImportId: null,
    ...(parsed.checks
      ? {
          accuracy: {
            method: parsed.checks.method,
            level: parsed.checks.level,
            issues: [...parsed.checks.issues]
              .sort(
                (a, b) =>
                  (a.severity === 'error' ? 0 : 1) -
                  (b.severity === 'error' ? 0 : 1),
              )
              .map(issue => issue.message),
          },
        }
      : {}),
  };
};

/** Whether a recognition result is worth reviewing at all (not proof it is correct). */
export const isReviewableExtraction = (
  parsed: ParsedUstpCorResult | null,
): boolean =>
  Boolean(
    parsed &&
      parsed.isValidUstpCor &&
      (parsed.courses.length > 0 ||
        parsed.profile.campus ||
        parsed.profile.program),
  );

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const meetingProblems = (meeting: CorDraftMeeting): string[] => {
  const problems: string[] = [];
  if (meeting.days.length === 0) problems.push('Choose the class day or days.');
  if (!isClockComplete(meeting.start)) {
    problems.push(
      meeting.start.hour !== null && meeting.start.period === null
        ? 'Choose AM or PM for the start time.'
        : 'Enter the start time.',
    );
  }
  if (!isClockComplete(meeting.end)) {
    problems.push(
      meeting.end.hour !== null && meeting.end.period === null
        ? 'Choose AM or PM for the end time.'
        : 'Enter the end time.',
    );
  }
  const start = clockToMinutes(meeting.start);
  const end = clockToMinutes(meeting.end);
  if (start !== null && end !== null && end <= start) {
    problems.push('The end time must be after the start time.');
  }
  return problems;
};

export const isMeetingValid = (meeting: CorDraftMeeting): boolean =>
  meetingProblems(meeting).length === 0;

export const courseProblems = (course: CorDraftCourse): string[] => {
  const problems: string[] = [];
  if (!course.code.trim()) problems.push('Enter the subject code.');
  if (!course.title.trim()) problems.push('Enter the subject title.');
  const units = Number(course.units);
  if (
    course.units.trim() === '' ||
    !Number.isFinite(units) ||
    units < 0 ||
    units > 30
  ) {
    problems.push('Enter valid credit units (0 or more).');
  }
  return problems;
};

export type CourseReviewState = 'excluded' | 'needs_review' | 'reviewed';

export const courseReviewState = (
  course: CorDraftCourse,
): CourseReviewState => {
  if (!course.included) return 'excluded';
  if (!course.reviewed || courseProblems(course).length) return 'needs_review';
  if (course.meetings.length === 0) {
    return course.keepUnscheduled ? 'reviewed' : 'needs_review';
  }
  return course.meetings.every(m => m.reviewed && isMeetingValid(m))
    ? 'reviewed'
    : 'needs_review';
};

export const isCourseResolved = (course: CorDraftCourse): boolean =>
  courseReviewState(course) !== 'needs_review';

const isRealIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
};

export const termProblems = (
  draft: Pick<CorDraft, 'term' | 'startDate' | 'endDate'>,
): string[] => {
  const problems: string[] = [];
  if (!draft.term.trim())
    problems.push('Enter the term or academic year label.');
  if (!isRealIsoDate(draft.startDate))
    problems.push('Choose the first class date.');
  if (!isRealIsoDate(draft.endDate))
    problems.push('Choose the last class date.');
  if (
    isRealIsoDate(draft.startDate) &&
    isRealIsoDate(draft.endDate) &&
    draft.endDate < draft.startDate
  ) {
    problems.push(
      'The last class date must be on or after the first class date.',
    );
  }
  if (isRealIsoDate(draft.startDate) && isRealIsoDate(draft.endDate)) {
    const span =
      (parseIsoDate(draft.endDate).getTime() -
        parseIsoDate(draft.startDate).getTime()) /
      86400000;
    if (span > 366) problems.push('A term cannot be longer than a year.');
  }
  return problems;
};

// ---------------------------------------------------------------------------
// Overlaps and duplicates
// ---------------------------------------------------------------------------

export interface MeetingRef {
  course: CorDraftCourse;
  meeting: CorDraftMeeting;
}

export interface OverlapPair {
  key: string;
  first: MeetingRef;
  second: MeetingRef;
  days: Weekday[];
}

const timedMeetings = (draft: CorDraft): MeetingRef[] =>
  draft.courses
    .filter(course => course.included)
    .flatMap(course =>
      course.meetings
        .filter(isMeetingValid)
        .map(meeting => ({course, meeting})),
    );

const meetingSignature = (meeting: CorDraftMeeting): string =>
  `${meeting.days.join('')}@${clockTo24(meeting.start)}-${clockTo24(
    meeting.end,
  )}`;

/** Exact repeats (same subject code, days and times) must be removed, not kept. */
export const findDuplicateMeetings = (draft: CorDraft): MeetingRef[] => {
  const seen = new Set<string>();
  const duplicates: MeetingRef[] = [];
  for (const ref of timedMeetings(draft)) {
    const signature = `${ref.course.code
      .trim()
      .toUpperCase()}|${meetingSignature(ref.meeting)}`;
    if (seen.has(signature)) duplicates.push(ref);
    else seen.add(signature);
  }
  return duplicates;
};

/** Two included subjects using the same code. One must be corrected or excluded. */
export const findDuplicateSubjects = (draft: CorDraft): CorDraftCourse[] => {
  const seen = new Set<string>();
  const duplicates: CorDraftCourse[] = [];
  for (const course of draft.courses.filter(c => c.included)) {
    const code = course.code.trim().toUpperCase();
    if (!code) continue;
    if (seen.has(code)) duplicates.push(course);
    else seen.add(code);
  }
  return duplicates;
};

/**
 * Overlapping meetings that the student has not explicitly kept. The key
 * contains both meetings' details, so editing either one invalidates an
 * earlier "keep both" decision.
 */
export const findOverlaps = (
  draft: CorDraft,
  includeAcknowledged = false,
): OverlapPair[] => {
  const duplicates = new Set(
    findDuplicateMeetings(draft).map(ref => ref.meeting.id),
  );
  const refs = timedMeetings(draft).filter(
    ref => !duplicates.has(ref.meeting.id),
  );
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i];
      const b = refs[j];
      const shared = a.meeting.days.filter(day => b.meeting.days.includes(day));
      if (!shared.length) continue;
      const aStart = clockToMinutes(a.meeting.start) as number;
      const aEnd = clockToMinutes(a.meeting.end) as number;
      const bStart = clockToMinutes(b.meeting.start) as number;
      const bEnd = clockToMinutes(b.meeting.end) as number;
      if (!(aStart < bEnd && bStart < aEnd)) continue;
      const key = [
        `${a.meeting.id}:${a.course.code}:${meetingSignature(a.meeting)}`,
        `${b.meeting.id}:${b.course.code}:${meetingSignature(b.meeting)}`,
      ]
        .sort()
        .join('|');
      if (includeAcknowledged || !draft.acknowledgedOverlaps.includes(key)) {
        pairs.push({key, first: a, second: b, days: shared});
      }
    }
  }
  return pairs;
};

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface DraftReadiness {
  pendingCourses: CorDraftCourse[];
  overlaps: OverlapPair[];
  duplicateMeetings: MeetingRef[];
  duplicateSubjects: CorDraftCourse[];
  termProblems: string[];
  missingSteps: Array<'student' | 'academic' | 'term'>;
  includedCourses: number;
  excludedCourses: number;
  timedMeetings: number;
  unscheduledCourses: number;
  canCommit: boolean;
}

export const draftReadiness = (draft: CorDraft): DraftReadiness => {
  const missingSteps: DraftReadiness['missingSteps'] = [];
  if (
    !draft.studentReviewed ||
    !draft.studentName.trim() ||
    !draft.campus.trim()
  ) {
    missingSteps.push('student');
  }
  if (
    !draft.academicReviewed ||
    !draft.program.trim() ||
    !draft.yearLevel.trim()
  ) {
    missingSteps.push('academic');
  }
  const termIssues = termProblems(draft);
  if (!draft.termReviewed || termIssues.length) missingSteps.push('term');
  const included = draft.courses.filter(c => c.included);
  const pendingCourses = draft.courses.filter(c => !isCourseResolved(c));
  const overlaps = findOverlaps(draft);
  const duplicateMeetings = findDuplicateMeetings(draft);
  const duplicateSubjects = findDuplicateSubjects(draft);
  const timed = included.reduce(
    (n, course) => n + course.meetings.filter(isMeetingValid).length,
    0,
  );
  return {
    pendingCourses,
    overlaps,
    duplicateMeetings,
    duplicateSubjects,
    termProblems: termIssues,
    missingSteps,
    includedCourses: included.length,
    excludedCourses: draft.courses.length - included.length,
    timedMeetings: timed,
    unscheduledCourses: included.filter(c => c.meetings.length === 0).length,
    canCommit:
      missingSteps.length === 0 &&
      pendingCourses.length === 0 &&
      overlaps.length === 0 &&
      duplicateMeetings.length === 0 &&
      duplicateSubjects.length === 0 &&
      included.length > 0,
  };
};

// ---------------------------------------------------------------------------
// Edits (each returns a new draft; edits invalidate the related review)
// ---------------------------------------------------------------------------

const touch = (draft: CorDraft, patch: Partial<CorDraft>): CorDraft => ({
  ...draft,
  ...patch,
  updatedAt: new Date().toISOString(),
});

export const editStudentName = (
  draft: CorDraft,
  studentName: string,
): CorDraft =>
  touch(draft, {
    studentName: studentName.slice(0, 120),
    studentReviewed: false,
  });

export const editAcademic = (
  draft: CorDraft,
  patch: Partial<Pick<CorDraft, 'yearLevel' | 'section'>>,
): CorDraft =>
  touch(draft, {
    yearLevel: (patch.yearLevel ?? draft.yearLevel).slice(0, 60),
    section: (patch.section ?? draft.section).slice(0, 40),
    academicReviewed: false,
  });

export const editTerm = (
  draft: CorDraft,
  patch: Partial<Pick<CorDraft, 'term' | 'startDate' | 'endDate'>>,
): CorDraft =>
  touch(draft, {
    term: (patch.term ?? draft.term).slice(0, 80),
    startDate: patch.startDate ?? draft.startDate,
    endDate: patch.endDate ?? draft.endDate,
    termReviewed: false,
  });

export const confirmStudent = (draft: CorDraft): CorDraft =>
  touch(draft, {studentReviewed: true});
export const confirmAcademic = (draft: CorDraft): CorDraft =>
  touch(draft, {academicReviewed: true});
export const confirmTerm = (draft: CorDraft): CorDraft =>
  touch(draft, {termReviewed: true});

const mapCourse = (
  draft: CorDraft,
  courseId: string,
  fn: (course: CorDraftCourse) => CorDraftCourse,
): CorDraft =>
  touch(draft, {
    courses: draft.courses.map(course =>
      course.id === courseId ? fn(course) : course,
    ),
  });

export const editCourse = (
  draft: CorDraft,
  courseId: string,
  patch: Partial<Pick<CorDraftCourse, 'code' | 'title' | 'units'>>,
): CorDraft =>
  mapCourse(draft, courseId, course => ({
    ...course,
    code: (patch.code ?? course.code).slice(0, 24),
    title: (patch.title ?? course.title).slice(0, 160),
    units: (patch.units ?? course.units).slice(0, 5),
    reviewed: false,
  }));

export const confirmCourse = (draft: CorDraft, courseId: string): CorDraft =>
  mapCourse(draft, courseId, course => ({
    ...course,
    included: true,
    reviewed: true,
  }));

export const setCourseIncluded = (
  draft: CorDraft,
  courseId: string,
  included: boolean,
): CorDraft => mapCourse(draft, courseId, course => ({...course, included}));

export const keepCourseUnscheduled = (
  draft: CorDraft,
  courseId: string,
): CorDraft =>
  mapCourse(draft, courseId, course => ({
    ...course,
    keepUnscheduled: course.meetings.length === 0,
  }));

export const addCourse = (
  draft: CorDraft,
): {draft: CorDraft; courseId: string} => {
  const course: CorDraftCourse = {
    id: draftLocalId('course'),
    code: '',
    title: '',
    units: '',
    origin: 'added',
    sourceText: '',
    included: true,
    reviewed: false,
    keepUnscheduled: false,
    meetings: [],
  };
  return {
    draft: touch(draft, {courses: [...draft.courses, course]}),
    courseId: course.id,
  };
};

export const addMeeting = (
  draft: CorDraft,
  courseId: string,
): {draft: CorDraft; meetingId: string} => {
  const meeting: CorDraftMeeting = {
    id: draftLocalId('meeting'),
    days: [],
    start: {...EMPTY_CLOCK},
    end: {...EMPTY_CLOCK},
    room: '',
    faculty: '',
    section: draft.section,
    origin: 'added',
    sourceText: '',
    notices: [],
    reviewed: false,
  };
  return {
    draft: mapCourse(draft, courseId, course => ({
      ...course,
      keepUnscheduled: false,
      meetings: [...course.meetings, meeting],
    })),
    meetingId: meeting.id,
  };
};

export const removeMeeting = (
  draft: CorDraft,
  courseId: string,
  meetingId: string,
): CorDraft =>
  mapCourse(draft, courseId, course => ({
    ...course,
    keepUnscheduled: false,
    meetings: course.meetings.filter(m => m.id !== meetingId),
  }));

export type MeetingPatch = Partial<
  Pick<
    CorDraftMeeting,
    'days' | 'start' | 'end' | 'room' | 'faculty' | 'section'
  >
>;

export const editMeeting = (
  draft: CorDraft,
  courseId: string,
  meetingId: string,
  patch: MeetingPatch,
): CorDraft =>
  mapCourse(draft, courseId, course => ({
    ...course,
    meetings: course.meetings.map(meeting => {
      if (meeting.id !== meetingId) return meeting;
      const days = patch.days
        ? WEEKDAYS.filter(d => patch.days!.includes(d))
        : meeting.days;
      const start = patch.start ?? meeting.start;
      const end = patch.end ?? meeting.end;
      const notices = meeting.notices.filter(notice => {
        if (notice === 'days_unclear') return days.length === 0;
        if (notice === 'start_period_missing') return start.period === null;
        if (notice === 'end_period_missing') return end.period === null;
        if (notice === 'time_unclear')
          return start.hour === null || end.hour === null;
        return true;
      });
      return {
        ...meeting,
        ...patch,
        days,
        room: (patch.room ?? meeting.room).slice(0, 80),
        faculty: (patch.faculty ?? meeting.faculty).slice(0, 80),
        section: (patch.section ?? meeting.section).slice(0, 40),
        notices,
        reviewed: false,
      };
    }),
  }));

export const confirmMeeting = (
  draft: CorDraft,
  courseId: string,
  meetingId: string,
): CorDraft =>
  mapCourse(draft, courseId, course => ({
    ...course,
    meetings: course.meetings.map(meeting =>
      meeting.id === meetingId && isMeetingValid(meeting)
        ? {...meeting, reviewed: true}
        : meeting,
    ),
  }));

/** Returns the first actionable problem in an included course, or null when clean (including TBA). */
export const courseNeedsAttention = (course: CorDraftCourse): string | null => {
  if (!course.included) return null;
  const problems = courseProblems(course);
  if (problems.length) return problems[0];
  for (const meeting of course.meetings) {
    const meetingErrors = meetingProblems(meeting);
    if (meetingErrors.length) return meetingErrors[0];
    if (meeting.notices.length) return 'Check class day or time.';
  }
  return null;
};

/**
 * Confirms all valid sections, courses (including TBA), and meetings from the
 * single-screen COR review. Invalid or incomplete items stay unconfirmed so
 * `draftReadiness` still guards against committing bad data.
 */
export const confirmAllValidItems = (draft: CorDraft): CorDraft =>
  touch(draft, {
    studentReviewed: Boolean(draft.studentName.trim() && draft.campus.trim()),
    academicReviewed: Boolean(draft.program.trim() && draft.yearLevel.trim()),
    termReviewed: termProblems(draft).length === 0,
    courses: draft.courses.map(course => {
      if (!course.included) return course;
      const meetings = course.meetings.map(meeting =>
        isMeetingValid(meeting) && meeting.notices.length === 0
          ? {...meeting, reviewed: true}
          : meeting,
      );
      const validCourse = courseProblems(course).length === 0;
      const allMeetingsReady = meetings.every(
        meeting => meeting.reviewed && isMeetingValid(meeting),
      );
      return {
        ...course,
        meetings,
        keepUnscheduled:
          course.meetings.length === 0 ? true : course.keepUnscheduled,
        reviewed: validCourse && allMeetingsReady,
      };
    }),
  });

export const semesterTermDates = (
  startDate: Date = new Date(),
  weeks = 18,
): {startDate: string; endDate: string} => {
  const start = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
    12,
    0,
    0,
    0,
  );
  const end = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate() + weeks * 7,
    12,
    0,
    0,
    0,
  );
  return {startDate: formatIsoDate(start), endDate: formatIsoDate(end)};
};

export const acknowledgeOverlap = (draft: CorDraft, key: string): CorDraft =>
  draft.acknowledgedOverlaps.includes(key)
    ? draft
    : touch(draft, {
        acknowledgedOverlaps: [...draft.acknowledgedOverlaps, key],
      });

// ---------------------------------------------------------------------------
// Recurrence preview and import plan
// ---------------------------------------------------------------------------

export const parseIsoDate = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

export const formatIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;

export const firstWeekdayOnOrAfter = (
  startIso: string,
  day: Weekday,
): string => {
  const start = parseIsoDate(startIso);
  const diff = (WEEKDAY_JS_INDEX[day] - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + diff);
  return formatIsoDate(start);
};

export const countWeeklyOccurrences = (
  firstIso: string,
  endIso: string,
): number => {
  if (firstIso > endIso) return 0;
  const days = Math.round(
    (parseIsoDate(endIso).getTime() - parseIsoDate(firstIso).getTime()) /
      86400000,
  );
  return Math.floor(days / 7) + 1;
};

export interface PlannedClassBlock {
  identityKey: string;
  courseId: string;
  meetingId: string;
  code: string;
  title: string;
  day: Weekday;
  startTime: string;
  endTime: string;
  room: string;
  faculty: string;
  section: string;
  firstDate: string;
  occurrences: number;
  recurrenceRule: string;
}

export const normalizeTermKey = (
  draft: Pick<CorDraft, 'term' | 'startDate'>,
): string =>
  `${draft.term.trim().toUpperCase().replace(/\s+/g, ' ')}#${draft.startDate}`;

/** Subject/session/term identity: never just weekday + start time. */
export const classIdentityKey = (
  termKey: string,
  code: string,
  day: Weekday,
  startTime: string,
  endTime: string,
): string =>
  `${termKey}|${code.trim().toUpperCase()}|${day}|${startTime}-${endTime}`;

/** One weekly block per included, reviewed meeting day within the confirmed dates. */
export const planClassBlocks = (draft: CorDraft): PlannedClassBlock[] => {
  if (termProblems(draft).length) return [];
  const termKey = normalizeTermKey(draft);
  const until = `${draft.endDate.replace(/-/g, '')}T235959Z`;
  const blocks: PlannedClassBlock[] = [];
  for (const course of draft.courses) {
    if (!course.included) continue;
    for (const meeting of course.meetings) {
      if (!isMeetingValid(meeting)) continue;
      const startTime = clockTo24(meeting.start) as string;
      const endTime = clockTo24(meeting.end) as string;
      for (const day of meeting.days) {
        const firstDate = firstWeekdayOnOrAfter(draft.startDate, day);
        const occurrences = countWeeklyOccurrences(firstDate, draft.endDate);
        if (occurrences === 0) continue;
        blocks.push({
          identityKey: classIdentityKey(
            termKey,
            course.code,
            day,
            startTime,
            endTime,
          ),
          courseId: course.id,
          meetingId: meeting.id,
          code: course.code.trim(),
          title: course.title.trim(),
          day,
          startTime,
          endTime,
          room: meeting.room.trim(),
          faculty: meeting.faculty.trim(),
          section: meeting.section.trim(),
          firstDate,
          occurrences,
          recurrenceRule: `FREQ=WEEKLY;UNTIL=${until}`,
        });
      }
    }
  }
  return blocks;
};

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const formatDisplayDate = (iso: string): string => {
  if (!isRealIsoDate(iso)) return 'Not set';
  const date = parseIsoDate(iso);
  const day = WEEKDAYS[(date.getDay() + 6) % 7];
  return `${day}, ${
    SHORT_MONTHS[date.getMonth()]
  } ${date.getDate()}, ${date.getFullYear()}`;
};

export const meetingSummary = (meeting: CorDraftMeeting): string => {
  const days = meeting.days.length ? meeting.days.join(', ') : 'Day needed';
  return `${days} · ${clockLabel(meeting.start)}–${clockLabel(meeting.end)}`;
};

export const isIsoDate = isRealIsoDate;
