import { db, DatabaseTransaction } from './database';
import { localSettingsStore } from './localSettingsStore';
import { timeBlocksStore } from './timeBlocksStore';
import { userStore } from './userStore';
import { generateId } from '../utils';

export const ACADEMIC_PROFILE_KEY = 'academic.profile.v1';

export interface AcademicCourseRecord {
  code: string;
  title?: string;
  subjectTitle: string;
  lecUnits: number;
  labUnits: number;
  creditUnits: number;
  section: string;
  faculty: string;
  scheduleSummary: string;
}

export interface AcademicProfileRecord {
  isUstpStudent: boolean;
  campus: string;
  registrationNo: string;
  studentNo: string;
  fullName: string;
  formattedName: string;
  preferredName: string;
  gender: string;
  age: number | string | null;
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
  courses: AcademicCourseRecord[];
  updatedAt: string;
}

export interface OnboardingScheduleSessionInput {
  code?: string;
  subjectTitle: string;
  section?: string;
  faculty?: string;
  days: string[];
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  room?: string;
  recurrenceRule: string;
}

export interface ClassBlockMetadata {
  section: string | null;
  room: string | null;
  faculty: string | null;
  summaryLine: string | null;
}

const SUBJECT_COLOR_PALETTE = [
  '#2563EB', // Royal Blue
  '#E6003A', // Crimson
  '#059669', // Emerald
  '#D97706', // Amber
  '#7C3AED', // Violet
  '#0891B2', // Cyan
  '#DB2777', // Pink
];

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function pickSubjectColor(subjectKey: string): string {
  let hash = 0;
  const clean = subjectKey.trim().toUpperCase();
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_COLOR_PALETTE[hash % SUBJECT_COLOR_PALETTE.length];
}

function getNextDateForWeekday(dayName: string, refDate: Date = new Date()): string {
  const targetIdx = WEEKDAY_INDEX[dayName.trim().toLowerCase()];
  const d = new Date(refDate);
  if (targetIdx !== undefined) {
    const currentIdx = d.getDay();
    const diff = (targetIdx - currentIdx + 7) % 7;
    d.setDate(d.getDate() + diff);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatClassBlockNotes(input: {
  section?: string | null;
  room?: string | null;
  faculty?: string | null;
}): string | undefined {
  const parts: string[] = [];
  const room = input.room?.trim();
  const section = input.section?.trim();
  const faculty = input.faculty?.trim();

  if (room && room !== 'TBA') {
    parts.push(`Room: ${room}`);
  }
  if (section) {
    parts.push(`Section: ${section}`);
  }
  if (faculty && faculty !== 'TBA') {
    parts.push(`Faculty: ${faculty}`);
  }
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

/**
 * Parses structured USTP COR / class schedule metadata from a TimeBlock's `notes` field.
 */
export function parseClassBlockMetadata(notes?: string | null): ClassBlockMetadata {
  if (!notes || !notes.trim()) {
    return { section: null, room: null, faculty: null, summaryLine: null };
  }
  const raw = notes.trim();
  let section: string | null = null;
  let room: string | null = null;
  let faculty: string | null = null;

  const segments = raw.split('|').map(s => s.trim());
  for (const seg of segments) {
    const roomMatch = seg.match(/^(?:Room|Location)\s*:\s*(.+)$/i);
    if (roomMatch) {
      room = roomMatch[1].trim();
      continue;
    }
    const secMatch = seg.match(/^Section\s*:\s*(.+)$/i);
    if (secMatch) {
      section = secMatch[1].trim();
      continue;
    }
    const facMatch = seg.match(/^(?:Faculty|Prof\.?|Instructor)\s*:\s*(.+)$/i);
    if (facMatch) {
      faculty = facMatch[1].trim();
      continue;
    }
  }

  const displayParts: string[] = [];
  if (room && room !== 'TBA') displayParts.push(room);
  if (section) displayParts.push(section);
  if (faculty && faculty !== 'TBA') displayParts.push(faculty);

  const summaryLine =
    displayParts.length > 0
      ? displayParts.join(' · ')
      : !raw.startsWith('[BATCH_CLASSES:')
        ? raw
        : null;

  return { section, room, faculty, summaryLine };
}

export const academicProfileStore = {
  get: (userId: string): AcademicProfileRecord | null => {
    try {
      const raw = localSettingsStore.get(userId, ACADEMIC_PROFILE_KEY, '');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<AcademicProfileRecord>;
      if (!parsed || typeof parsed !== 'object') return null;
      const academicTerm = String(
        parsed.academicTerm ?? parsed.academicYearTerm ?? '',
      );
      const section = String(parsed.section ?? parsed.primarySection ?? '');
      const courses = Array.isArray(parsed.courses)
        ? parsed.courses.map(c => ({
            ...c,
            title: c.title || c.subjectTitle || '',
            subjectTitle: c.subjectTitle || c.title || '',
          }))
        : [];
      return {
        isUstpStudent: Boolean(parsed.isUstpStudent),
        campus: String(parsed.campus ?? ''),
        registrationNo: String(parsed.registrationNo ?? ''),
        studentNo: String(parsed.studentNo ?? ''),
        fullName: String(parsed.fullName ?? ''),
        formattedName: String(parsed.formattedName ?? ''),
        preferredName: String(parsed.preferredName ?? ''),
        gender: String(parsed.gender ?? ''),
        age: parsed.age ?? null,
        nationality: String(parsed.nationality ?? ''),
        college: String(parsed.college ?? ''),
        collegeShort: String(parsed.collegeShort ?? ''),
        program: String(parsed.program ?? ''),
        major: String(parsed.major ?? ''),
        yearLevel: String(parsed.yearLevel ?? ''),
        yearLevelShort: String(parsed.yearLevelShort ?? ''),
        curriculum: String(parsed.curriculum ?? ''),
        academicTerm,
        academicYearTerm: academicTerm,
        section,
        primarySection: section,
        totalUnits: String(
          parsed.totalUnits ??
            (parsed.totalCreditUnits !== null &&
            parsed.totalCreditUnits !== undefined
              ? parsed.totalCreditUnits
              : ''),
        ),
        totalLecUnits:
          typeof parsed.totalLecUnits === 'number' ? parsed.totalLecUnits : null,
        totalLabUnits:
          typeof parsed.totalLabUnits === 'number' ? parsed.totalLabUnits : null,
        totalCreditUnits:
          typeof parsed.totalCreditUnits === 'number'
            ? parsed.totalCreditUnits
            : null,
        courses,
        updatedAt: String(parsed.updatedAt ?? ''),
      };
    } catch {
      return null;
    }
  },

  save: (
    userId: string,
    profile: Omit<AcademicProfileRecord, 'updatedAt'>,
    executor?: DatabaseTransaction,
  ): AcademicProfileRecord => {
    const now = new Date().toISOString();
    const academicTerm = profile.academicTerm || profile.academicYearTerm || '';
    const section = profile.section || profile.primarySection || '';
    const courses = (profile.courses || []).map(c => ({
      ...c,
      title: c.title || c.subjectTitle || '',
      subjectTitle: c.subjectTitle || c.title || '',
    }));
    const record: AcademicProfileRecord = {
      ...profile,
      academicTerm,
      academicYearTerm: academicTerm,
      section,
      primarySection: section,
      courses,
      updatedAt: now,
    };

    const apply = (tx: DatabaseTransaction) => {
      tx.executeSync(
        `INSERT INTO local_settings (user_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [userId, ACADEMIC_PROFILE_KEY, JSON.stringify(record), now],
      );
      if (record.formattedName.trim().length > 0) {
        userStore.setUsername(userId, record.formattedName, tx);
      }
    };

    if (executor) apply(executor);
    else db.transactionSync(apply);

    return record;
  },

  clear: (userId: string, executor?: DatabaseTransaction): void => {
    const apply = (tx: Pick<DatabaseTransaction, 'executeSync'>) => {
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, ACADEMIC_PROFILE_KEY],
      );
    };
    if (executor) apply(executor);
    else db.transactionSync(apply);
  },

  transferFromGuest: (
    tx: Pick<DatabaseTransaction, 'executeSync'>,
    fromUserId: string,
    toUserId: string,
  ): void => {
    if (fromUserId === toUserId) return;
    tx.executeSync(
      `UPDATE OR IGNORE local_settings SET user_id = ? WHERE user_id = ? AND key = ?`,
      [toUserId, fromUserId, ACADEMIC_PROFILE_KEY],
    );
    tx.executeSync(
      `DELETE FROM local_settings WHERE user_id = ? AND key = ?`,
      [fromUserId, ACADEMIC_PROFILE_KEY],
    );
  },

  /**
   * Persists recurring class sessions (from a USTP COR or a scanned schedule image)
   * into `time_blocks` atomically, deduplicating against existing Class blocks.
   */
  persistRecurringSchedule: (
    userId: string,
    sessions: OnboardingScheduleSessionInput[],
    referenceDate: Date = new Date(),
    executor?: DatabaseTransaction,
  ): number => {
    if (sessions.length === 0) return 0;

    let savedCount = 0;
    const apply = (tx: DatabaseTransaction) => {
      const existingBlocks = timeBlocksStore.getAllOrThrow(userId, tx);

      for (const session of sessions) {
        const cleanCode = session.code?.trim();
        const cleanTitle = session.subjectTitle.trim();
        const blockTitle =
          cleanCode && !cleanTitle.toLowerCase().startsWith(cleanCode.toLowerCase())
            ? `${cleanCode} · ${cleanTitle}`
            : cleanTitle;
        const color = pickSubjectColor(cleanCode || cleanTitle);
        const notes = formatClassBlockNotes({
          section: session.section,
          room: session.room,
          faculty: session.faculty,
        });

        for (const dayName of session.days) {
          const dateStr = getNextDateForWeekday(dayName, referenceDate);
          const targetDay = new Date(`${dateStr}T12:00:00Z`).getUTCDay();

          const existing = existingBlocks.find(b => {
            if (b.category !== 'Class' || b.startTime !== session.startTime) {
              return false;
            }
            const bDay = new Date(`${b.date}T12:00:00Z`).getUTCDay();
            return bDay === targetDay;
          });

          if (existing) {
            timeBlocksStore.update(
              {
                id: existing.id,
                title: blockTitle,
                date: dateStr,
                startTime: session.startTime,
                endTime: session.endTime,
                color,
                category: 'Class',
                notes: notes || existing.notes,
                recurrenceRule: session.recurrenceRule || existing.recurrenceRule,
              },
              tx,
            );
          } else {
            timeBlocksStore.insert(
              {
                id: generateId('block'),
                userId,
                title: blockTitle,
                date: dateStr,
                startTime: session.startTime,
                endTime: session.endTime,
                color,
                category: 'Class',
                notes,
                recurrenceRule: session.recurrenceRule || 'FREQ=WEEKLY',
              },
              tx,
            );
          }
          savedCount += 1;
        }
      }
    };

    if (executor) apply(executor);
    else db.transactionSync(apply);

    return savedCount;
  },
};
