import {computeSemesterEndDate} from '../../../../ai/vision/scheduleParser';
import type {ParsedScheduleResult} from '../../../../ai/vision/scheduleParser';
import type {ParsedUstpCorResult} from '../../../../ai/vision/ustpCorParser';
import type {
  AcademicCourseRecord,
  AcademicProfileRecord,
  OnboardingScheduleSessionInput,
  TimeBlock,
} from '../../../../storage';
import {
  db,
  formatClassBlockNotes,
  getNextDateForWeekday,
  parseClassBlockMetadata,
  pickSubjectColor,
  timeBlocksStore,
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

export interface GroupedClassSchedule {
  key: string;
  code: string;
  subjectTitle: string;
  displayTitle: string;
  days: string[];
  daysLabel: string;
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  faculty: string;
  color: string;
  recurrenceMode: ClassRecurrenceMode;
  recurrenceRule: string;
  blocks: TimeBlock[];
}

const UTC_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Extracts canonical English weekday name for a YYYY-MM-DD block date. */
export function weekdayNameForDate(dateStr: string): string | null {
  const parsed = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return UTC_WEEKDAY_NAMES[parsed.getUTCDay()] ?? null;
}

/** Splits stored block title `'IT311 · Systems Integration'` into code and subject title. */
export function splitClassBlockTitle(title: string): {
  code: string;
  subjectTitle: string;
} {
  const clean = title.trim();
  const sepIdx = clean.indexOf(' · ');
  if (sepIdx > 0) {
    return {
      code: clean.slice(0, sepIdx).trim(),
      subjectTitle: clean.slice(sepIdx + 3).trim() || clean,
    };
  }
  return {code: '', subjectTitle: clean};
}

/**
 * Collapses weekday `TimeBlock` rows created for repeating `'Class'` schedules
 * into logical class entries for reviewing, editing, or deleting a whole subject.
 */
export function groupClassBlocks(blocks: TimeBlock[]): GroupedClassSchedule[] {
  const classBlocks = blocks.filter(
    block => block.category === 'Class' && !block.deletedAt,
  );
  const grouped = new Map<string, GroupedClassSchedule>();

  for (const block of classBlocks) {
    const cleanTitle = block.title.trim();
    const meta = parseClassBlockMetadata(block.notes);
    const recurrenceRule = block.recurrenceRule?.trim() || '';
    const groupKey = [
      cleanTitle.toLowerCase(),
      block.startTime,
      block.endTime,
      (block.notes || '').trim(),
      recurrenceRule,
    ].join('::');

    const dayName = weekdayNameForDate(block.date);
    const existing = grouped.get(groupKey);
    if (existing) {
      if (dayName && !existing.days.includes(dayName)) {
        existing.days = sortWeekdays([...existing.days, dayName]);
        existing.daysLabel = formatDaysBadge(existing.days);
      }
      existing.blocks.push(block);
    } else {
      const {code, subjectTitle} = splitClassBlockTitle(cleanTitle);
      const days = dayName ? [dayName] : [];
      grouped.set(groupKey, {
        key: `${groupKey}::${block.id}`,
        code,
        subjectTitle,
        displayTitle: cleanTitle,
        days,
        daysLabel: days.length > 0 ? formatDaysBadge(days) : block.date,
        startTime: block.startTime,
        endTime: block.endTime,
        room: meta.room || '',
        section: meta.section || '',
        faculty: meta.faculty || '',
        color: block.color || pickSubjectColor(code || subjectTitle),
        recurrenceMode:
          recurrenceRule && !recurrenceRule.includes('UNTIL=')
            ? 'weekly'
            : 'semester',
        recurrenceRule,
        blocks: [block],
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const timeCmp = a.startTime.localeCompare(b.startTime);
    if (timeCmp !== 0) return timeCmp;
    return a.displayTitle.localeCompare(b.displayTitle);
  });
}

export function groupedClassToDraft(
  group: GroupedClassSchedule,
): ManualClassDraft {
  return {
    id: group.key,
    code: group.code,
    subjectTitle: group.subjectTitle,
    days: [...group.days],
    startTime: group.startTime,
    endTime: group.endTime,
    room: group.room,
    section: group.section,
    faculty: group.faculty,
    recurrenceMode: group.recurrenceMode,
  };
}

/**
 * Updates a grouped repeating class in SQLite in one transaction: preserves/updates
 * blocks for retained weekdays, inserts new weekday rows, and deletes removed days.
 */
export function updateClassGroupInStore(params: {
  userId: string;
  group: GroupedClassSchedule;
  draft: ManualClassDraft;
  referenceDate?: Date;
}): void {
  const {userId, group, draft, referenceDate = new Date()} = params;
  const normalized = normalizeDraftToEntry({...draft, id: group.key});
  const blockTitle =
    normalized.code &&
    !normalized.subjectTitle
      .toLowerCase()
      .startsWith(normalized.code.toLowerCase())
      ? `${normalized.code} · ${normalized.subjectTitle}`
      : normalized.subjectTitle;
  const notes = formatClassBlockNotes({
    section: normalized.section,
    room: normalized.room,
    faculty: normalized.faculty,
  });
  const color = pickSubjectColor(normalized.code || normalized.subjectTitle);
  const recurrenceRule =
    normalized.recurrenceMode === 'weekly'
      ? 'FREQ=WEEKLY'
      : group.recurrenceRule.includes('UNTIL=')
        ? group.recurrenceRule
        : `FREQ=WEEKLY;UNTIL=${computeSemesterEndDate(referenceDate)}`;

  db.transactionSync(tx => {
    const remainingBlocks = [...group.blocks];
    const matchedIndices = new Set<number>();

    const assignments: Array<{
      dayName: string;
      existing: TimeBlock | null;
    }> = normalized.days.map(dayName => {
      const idx = remainingBlocks.findIndex(
        (b, i) => !matchedIndices.has(i) && weekdayNameForDate(b.date) === dayName,
      );
      if (idx >= 0) {
        matchedIndices.add(idx);
        return {dayName, existing: remainingBlocks[idx]};
      }
      return {dayName, existing: null};
    });

    const reusableBlocks = remainingBlocks.filter(
      (_b, i) => !matchedIndices.has(i),
    );

    for (const item of assignments) {
      const targetBlock = item.existing ?? reusableBlocks.shift() ?? null;
      const targetDate = item.existing
        ? item.existing.date
        : getNextDateForWeekday(item.dayName, referenceDate);

      if (targetBlock) {
        timeBlocksStore.update(
          {
            id: targetBlock.id,
            title: blockTitle,
            date: targetDate,
            startTime: normalized.startTime,
            endTime: normalized.endTime,
            color,
            category: 'Class',
            notes: notes || '',
            recurrenceRule,
          },
          tx,
        );
      } else {
        timeBlocksStore.insert(
          {
            id: generateId('block'),
            userId,
            title: blockTitle,
            date: targetDate,
            startTime: normalized.startTime,
            endTime: normalized.endTime,
            color,
            category: 'Class',
            notes,
            recurrenceRule,
          },
          tx,
        );
      }
    }

    for (const unused of reusableBlocks) {
      timeBlocksStore.delete(unused.id, tx);
    }
  });
}

/** Deletes all underlying weekday `TimeBlock` rows belonging to one or more class groups. */
export function deleteClassGroupFromStore(blockIds: string[]): void {
  if (blockIds.length === 0) return;
  db.transactionSync(tx => {
    for (const id of blockIds) {
      timeBlocksStore.delete(id, tx);
    }
  });
}
