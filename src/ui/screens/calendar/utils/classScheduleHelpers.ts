import {computeSemesterEndDate} from '../../../../ai/vision/scheduleParser';
import type {ParsedScheduleResult} from '../../../../ai/vision/scheduleParser';
import type {ParsedUstpCorResult} from '../../../../ai/vision/ustpCorParser';
import type {
  AcademicCourseRecord,
  AcademicProfileRecord,
  OnboardingScheduleSessionInput,
} from '../../../../storage';
import {generateId} from '../../../../utils';
import {formatTimeForDisplay} from './calendarHelpers';

export type ClassRecurrenceMode = 'semester' | 'weekly';

export interface ManualClassDraft {
  id?: string;
  code: string;
  subjectTitle: string;
  days: string[];
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  faculty: string;
  recurrenceMode: ClassRecurrenceMode;
}

export interface ManualClassEntry extends ManualClassDraft {
  id: string;
}

export interface ManualCorStudentInfo {
  studentNo: string;
  program: string;
  yearLevel: string;
  section: string;
  academicTerm: string;
}

export const WEEKDAY_OPTIONS: ReadonlyArray<{key: string; short: string}> = [
  {key: 'Monday', short: 'Mon'},
  {key: 'Tuesday', short: 'Tue'},
  {key: 'Wednesday', short: 'Wed'},
  {key: 'Thursday', short: 'Thu'},
  {key: 'Friday', short: 'Fri'},
  {key: 'Saturday', short: 'Sat'},
  {key: 'Sunday', short: 'Sun'},
];

export const DAY_PATTERN_PRESETS: ReadonlyArray<{
  label: string;
  days: string[];
}> = [
  {label: 'MWF', days: ['Monday', 'Wednesday', 'Friday']},
  {label: 'TTH', days: ['Tuesday', 'Thursday']},
  {
    label: 'MTWTHF',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  },
];

export function createEmptyClassDraft(
  defaults?: Partial<Pick<ManualClassDraft, 'section' | 'recurrenceMode'>>,
): ManualClassDraft {
  return {
    code: '',
    subjectTitle: '',
    days: ['Monday', 'Wednesday', 'Friday'],
    startTime: '09:00',
    endTime: '10:30',
    room: '',
    section: defaults?.section ?? '',
    faculty: '',
    recurrenceMode: defaults?.recurrenceMode ?? 'semester',
  };
}

/** True when no subject-specific fields have been typed yet in the draft. */
export function isDraftUntouched(draft: ManualClassDraft): boolean {
  return (
    !draft.id &&
    draft.code.trim().length === 0 &&
    draft.subjectTitle.trim().length === 0 &&
    draft.room.trim().length === 0 &&
    draft.faculty.trim().length === 0
  );
}

export function parseTimeMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function validateManualClassDraft(
  draft: ManualClassDraft,
): string | null {
  if (!draft.subjectTitle.trim()) {
    return 'Enter a subject title.';
  }
  if (!Array.isArray(draft.days) || draft.days.length === 0) {
    return 'Select at least one class day.';
  }
  const startMin = parseTimeMinutes(draft.startTime);
  const endMin = parseTimeMinutes(draft.endTime);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return 'End time must be after start time.';
  }
  return null;
}

export function formatDaysBadge(days: string[]): string {
  const ordered = WEEKDAY_OPTIONS.filter(d => days.includes(d.key)).map(
    d => d.key,
  );
  if (
    ordered.length === 3 &&
    ordered[0] === 'Monday' &&
    ordered[1] === 'Wednesday' &&
    ordered[2] === 'Friday'
  ) {
    return 'MWF';
  }
  if (
    ordered.length === 2 &&
    ordered[0] === 'Tuesday' &&
    ordered[1] === 'Thursday'
  ) {
    return 'TTH';
  }
  if (
    ordered.length === 5 &&
    ordered[0] === 'Monday' &&
    ordered[4] === 'Friday'
  ) {
    return 'MTWTHF';
  }
  return ordered.map(d => d.slice(0, 3)).join(', ');
}

export function sortWeekdays(days: string[]): string[] {
  const order = new Map(WEEKDAY_OPTIONS.map((d, idx) => [d.key, idx]));
  return [...days].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

export function normalizeDraftToEntry(
  draft: ManualClassDraft,
): ManualClassEntry {
  return {
    id: draft.id || generateId('cls'),
    code: draft.code.trim(),
    subjectTitle: draft.subjectTitle.trim(),
    days: sortWeekdays(draft.days),
    startTime: draft.startTime,
    endTime: draft.endTime,
    room: draft.room.trim(),
    section: draft.section.trim(),
    faculty: draft.faculty.trim(),
    recurrenceMode: draft.recurrenceMode,
  };
}

export function manualEntriesToScheduleInputs(
  entries: ManualClassEntry[],
  referenceDate: Date = new Date(),
): OnboardingScheduleSessionInput[] {
  const semesterUntil = computeSemesterEndDate(referenceDate);
  return entries.map(entry => ({
    code: entry.code.trim() || undefined,
    subjectTitle: entry.subjectTitle.trim(),
    section: entry.section.trim() || undefined,
    faculty: entry.faculty.trim() || undefined,
    room: entry.room.trim() || undefined,
    days: sortWeekdays(entry.days),
    startTime: entry.startTime,
    endTime: entry.endTime,
    recurrenceRule:
      entry.recurrenceMode === 'weekly'
        ? 'FREQ=WEEKLY'
        : `FREQ=WEEKLY;UNTIL=${semesterUntil}`,
  }));
}

export function corResultToManualEntries(
  cor: ParsedUstpCorResult,
): ManualClassEntry[] {
  return cor.sessions.map(session => ({
    id: session.id || generateId('cls'),
    code: session.code || '',
    subjectTitle: session.subjectTitle || session.code || 'Class',
    days: sortWeekdays(session.days),
    startTime: session.startTime,
    endTime: session.endTime,
    room: session.room && session.room !== 'TBA' ? session.room : '',
    section: session.section || '',
    faculty:
      session.faculty && session.faculty !== 'TBA' ? session.faculty : '',
    recurrenceMode: session.recurrenceRule.includes('UNTIL=')
      ? 'semester'
      : 'weekly',
  }));
}

export function scannedScheduleToManualEntries(
  result: ParsedScheduleResult,
): ManualClassEntry[] {
  return result.classes.map(cls => ({
    id: cls.id || generateId('cls'),
    code: cls.code || '',
    subjectTitle: cls.subjectTitle || cls.subject || 'Class',
    days: sortWeekdays(cls.days),
    startTime: cls.startTime,
    endTime: cls.endTime,
    room: cls.room && cls.room !== 'TBA' ? cls.room : '',
    section: cls.section || '',
    faculty: cls.faculty && cls.faculty !== 'TBA' ? cls.faculty : '',
    recurrenceMode: cls.recurrenceRule.includes('UNTIL=')
      ? 'semester'
      : 'weekly',
  }));
}

export function buildAcademicCoursesFromEntries(
  entries: ManualClassEntry[],
): AcademicCourseRecord[] {
  const grouped = new Map<
    string,
    {
      code: string;
      subjectTitle: string;
      section: string;
      faculty: string;
      parts: string[];
    }
  >();

  for (const entry of entries) {
    const code = entry.code.trim();
    const subjectTitle = entry.subjectTitle.trim();
    const key = `${code.toUpperCase()}::${subjectTitle.toLowerCase()}`;
    const timeSummary = `${formatDaysBadge(entry.days)} ${formatTimeForDisplay(
      entry.startTime,
      false,
    )}-${formatTimeForDisplay(entry.endTime, false)}${
      entry.room.trim() ? ` (${entry.room.trim()})` : ''
    }`;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.section && entry.section.trim()) {
        existing.section = entry.section.trim();
      }
      if (!existing.faculty && entry.faculty.trim()) {
        existing.faculty = entry.faculty.trim();
      }
      existing.parts.push(timeSummary);
    } else {
      grouped.set(key, {
        code,
        subjectTitle,
        section: entry.section.trim(),
        faculty: entry.faculty.trim() || 'TBA',
        parts: [timeSummary],
      });
    }
  }

  return Array.from(grouped.values()).map(item => ({
    code: item.code,
    title: item.subjectTitle,
    subjectTitle: item.subjectTitle,
    lecUnits: 0,
    labUnits: 0,
    creditUnits: 0,
    section: item.section,
    faculty: item.faculty || 'TBA',
    scheduleSummary: item.parts.join(', '),
  }));
}

export function hasAnyCorStudentInfo(info: ManualCorStudentInfo): boolean {
  return Boolean(
    info.studentNo.trim() ||
      info.program.trim() ||
      info.yearLevel.trim() ||
      info.section.trim() ||
      info.academicTerm.trim(),
  );
}

export function buildMergedAcademicProfile(params: {
  existing: AcademicProfileRecord | null;
  scannedCor: ParsedUstpCorResult | null;
  manualInfo: ManualCorStudentInfo;
  entries: ManualClassEntry[];
}): Omit<AcademicProfileRecord, 'updatedAt'> | null {
  const {existing, scannedCor, manualInfo, entries} = params;
  const infoProvided = hasAnyCorStudentInfo(manualInfo);
  if (!scannedCor && !infoProvided) {
    return null;
  }

  const baseProfile: Partial<AcademicProfileRecord> =
    scannedCor?.profile ?? existing ?? {};

  const coursesFromManual = buildAcademicCoursesFromEntries(entries);
  let courses: AcademicCourseRecord[];
  if (scannedCor) {
    courses =
      coursesFromManual.length > 0
        ? coursesFromManual.map(mc => {
            const matched = scannedCor.courses.find(
              c =>
                c.code.toUpperCase() === mc.code.toUpperCase() &&
                c.subjectTitle.toLowerCase() === mc.subjectTitle.toLowerCase(),
            );
            return matched
              ? {
                  ...mc,
                  lecUnits: matched.lecUnits,
                  labUnits: matched.labUnits,
                  creditUnits: matched.creditUnits,
                }
              : mc;
          })
        : scannedCor.courses.map(c => ({
            code: c.code,
            subjectTitle: c.subjectTitle,
            lecUnits: c.lecUnits,
            labUnits: c.labUnits,
            creditUnits: c.creditUnits,
            section: c.section,
            faculty: c.faculty,
            scheduleSummary: c.scheduleSummary,
          }));
  } else {
    const existingList = existing?.courses ?? [];
    const byKey = new Map<string, AcademicCourseRecord>();
    for (const c of existingList) {
      byKey.set(`${c.code.toUpperCase()}::${c.subjectTitle.toLowerCase()}`, c);
    }
    for (const mc of coursesFromManual) {
      byKey.set(
        `${mc.code.toUpperCase()}::${mc.subjectTitle.toLowerCase()}`,
        mc,
      );
    }
    courses = Array.from(byKey.values());
  }

  const section =
    manualInfo.section.trim() ||
    baseProfile.section ||
    baseProfile.primarySection ||
    '';
  const academicTerm =
    manualInfo.academicTerm.trim() ||
    baseProfile.academicTerm ||
    baseProfile.academicYearTerm ||
    '';

  return {
    isUstpStudent: Boolean(scannedCor || existing?.isUstpStudent),
    campus: baseProfile.campus ?? '',
    registrationNo: baseProfile.registrationNo ?? '',
    studentNo: manualInfo.studentNo.trim() || baseProfile.studentNo || '',
    fullName: baseProfile.fullName ?? '',
    formattedName: baseProfile.formattedName ?? '',
    preferredName: baseProfile.preferredName ?? '',
    gender: baseProfile.gender ?? '',
    age: baseProfile.age ?? null,
    nationality: baseProfile.nationality ?? '',
    college: baseProfile.college ?? '',
    collegeShort: baseProfile.collegeShort ?? '',
    program: manualInfo.program.trim() || baseProfile.program || '',
    major: baseProfile.major ?? '',
    yearLevel: manualInfo.yearLevel.trim() || baseProfile.yearLevel || '',
    yearLevelShort: baseProfile.yearLevelShort ?? '',
    curriculum: baseProfile.curriculum ?? '',
    academicTerm,
    academicYearTerm: academicTerm,
    section,
    primarySection: section,
    totalUnits: baseProfile.totalUnits ?? '',
    totalLecUnits: baseProfile.totalLecUnits ?? null,
    totalLabUnits: baseProfile.totalLabUnits ?? null,
    totalCreditUnits: baseProfile.totalCreditUnits ?? null,
    courses,
  };
}
