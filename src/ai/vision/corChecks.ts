/**
 * Automatic COR consistency checks.
 *
 * A COR carries its own checksums: every subject's Lec + Lab = Credit, and
 * the subjects add up to the printed Total Unit(s) row. Together with strict
 * formats for schedules, student numbers and terms, these checks decide
 * whether an extraction can be trusted as-is or which items the student must
 * look at. They never change the data; they only report.
 */
import {isPlausibleCourseCode} from './corLayoutParser';
import {editDistance} from './corOcrCleanup';
import type {
  CorCheckIssue,
  CorCheckReport,
  ParsedUstpCorResult,
} from './ustpCorParser';

const STUDENT_NO_RE = /^\d{10}$/;
const TERM_RE =
  /^(?:1st|2nd|First|Second)\s+Semester\s+AY\s+\d{4}-\d{4}$|^(?:Summer|Midyear)(?:\s+Term)?\s+AY\s+\d{4}-\d{4}$/i;
const SECTION_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Longest believable single class meeting. */
const MAX_MEETING_MINUTES = 6 * 60;

const minutesOf = (hhmm: string): number | null => {
  const match = TIME_RE.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

export const checkCorExtraction = (
  parsed: ParsedUstpCorResult,
): CorCheckReport => {
  const method = parsed.extraction?.method ?? 'ocr_text';
  const issues: CorCheckIssue[] = [];
  const add = (
    code: string,
    severity: CorCheckIssue['severity'],
    message: string,
    courseCode?: string,
  ) => issues.push({code, severity, message, courseCode});

  const {profile, courses} = parsed;
  if (courses.length === 0) {
    add('no_courses', 'error', 'No subjects were found on the COR.');
  }

  // OCR can misread one character of a section ("ITAR11_Track2" for
  // "IT4R11_Track2"). A section one edit away from the most common one is
  // far more often a misread than a real section, so it is flagged (never changed).
  const sectionCounts = new Map<string, number>();
  for (const course of courses) {
    if (course.section) {
      sectionCounts.set(
        course.section,
        (sectionCounts.get(course.section) ?? 0) + 1,
      );
    }
  }
  const mainSection = [...sectionCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  const seenCodes = new Set<string>();
  for (const course of courses) {
    if (
      method !== 'pdf_text' &&
      mainSection &&
      course.section &&
      course.section !== mainSection &&
      editDistance(course.section, mainSection) === 1
    ) {
      add(
        'section_near_main',
        'warning',
        `${course.code || 'A subject'}: section "${
          course.section
        }" looks like "${mainSection}". Check it.`,
        course.code,
      );
    }
    const label = course.code || course.title || 'A subject';
    if (!isPlausibleCourseCode(course.code)) {
      add(
        'code_invalid',
        'error',
        `${label}: the subject code looks wrong.`,
        course.code,
      );
    }
    if (seenCodes.has(course.code)) {
      add(
        'duplicate_course',
        'warning',
        `${label} appears more than once.`,
        course.code,
      );
    }
    seenCodes.add(course.code);
    if (!course.title.trim()) {
      add(
        'title_missing',
        'error',
        `${label}: the subject title is missing.`,
        course.code,
      );
    }
    if (course.unitsUnread) {
      add(
        'units_unread',
        'error',
        `${label}: the units could not be read.`,
        course.code,
      );
    } else if (course.unitsInferred) {
      add(
        'units_inferred',
        'warning',
        `${label}: the units were worked out from the total, not read directly.`,
        course.code,
      );
    } else if (!near(course.lecUnits + course.labUnits, course.creditUnits)) {
      add(
        'units_inconsistent',
        'warning',
        `${label}: Lec ${course.lecUnits} + Lab ${course.labUnits} does not equal Credit ${course.creditUnits}.`,
        course.code,
      );
    }
    if (!course.section || !SECTION_RE.test(course.section)) {
      add(
        'section_unclear',
        'warning',
        `${label}: the section is missing or unclear.`,
        course.code,
      );
    }
    for (const session of course.sessions) {
      const where = `${label} (${session.rawText || 'schedule'})`;
      const start = minutesOf(session.startTime);
      const end = minutesOf(session.endTime);
      if (session.days.length === 0) {
        add(
          'days_unclear',
          'error',
          `${where}: the class days could not be read.`,
          course.code,
        );
      }
      if (start === null || end === null) {
        add(
          'time_unclear',
          'error',
          `${where}: the class time could not be read.`,
          course.code,
        );
      } else if (end <= start) {
        add(
          'time_order',
          'error',
          `${where}: the class ends before it starts.`,
          course.code,
        );
      } else if (end - start > MAX_MEETING_MINUTES) {
        add(
          'time_long',
          'warning',
          `${where}: this class is unusually long.`,
          course.code,
        );
      }
    }
  }

  const totals = parsed.extraction?.printedTotals ?? null;
  if (courses.length > 0) {
    if (!totals || totals.credit === null) {
      add(
        'totals_missing',
        'warning',
        'The Total Unit(s) row was not found, so the subject list could not be cross-checked.',
      );
    } else {
      const sum = (pick: (c: (typeof courses)[number]) => number) =>
        courses.reduce((acc, c) => acc + pick(c), 0);
      const mismatch: string[] = [];
      if (
        totals.lec !== null &&
        !near(
          sum(c => c.lecUnits),
          totals.lec,
        )
      ) {
        mismatch.push(`Lec ${sum(c => c.lecUnits)} vs ${totals.lec}`);
      }
      if (
        totals.lab !== null &&
        !near(
          sum(c => c.labUnits),
          totals.lab,
        )
      ) {
        mismatch.push(`Lab ${sum(c => c.labUnits)} vs ${totals.lab}`);
      }
      if (
        !near(
          sum(c => c.creditUnits),
          totals.credit,
        )
      ) {
        mismatch.push(`Credit ${sum(c => c.creditUnits)} vs ${totals.credit}`);
      }
      if (mismatch.length > 0) {
        add(
          'totals_mismatch',
          'error',
          `The subjects do not add up to the printed Total Unit(s) (${mismatch.join(
            ', ',
          )}). A subject may be missing or misread.`,
        );
      }
    }
  }

  if (!STUDENT_NO_RE.test(profile.studentNo)) {
    add(
      'student_no_unclear',
      'warning',
      'The student number is missing or unclear.',
    );
  }
  if (!profile.fullName.trim()) {
    add('name_missing', 'warning', 'The student name was not found.');
  }
  if (!TERM_RE.test(profile.academicTerm)) {
    add(
      'term_unclear',
      'warning',
      'The semester and school year are missing or unclear.',
    );
  }
  if (!profile.program.trim()) {
    add('program_missing', 'warning', 'The program was not found.');
  }

  const level: CorCheckReport['level'] =
    issues.length > 0
      ? 'needs_attention'
      : method === 'pdf_text'
      ? 'exact'
      : 'checked';
  return {method, level, issues};
};

/** Errors weigh more than warnings when choosing between two readings. */
export const checkScore = (report: CorCheckReport): number =>
  report.issues.reduce(
    (score, issue) => score + (issue.severity === 'error' ? 10 : 1),
    0,
  );
