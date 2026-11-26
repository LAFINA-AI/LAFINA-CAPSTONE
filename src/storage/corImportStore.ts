import {db, DatabaseTransaction} from './database';
import {
  academicProfileStore,
  formatClassBlockNotes,
  pickSubjectColor,
} from './academicProfileStore';
import type {
  AcademicCourseRecord,
  AcademicProfileRecord,
} from './academicProfileStore';
import {timeBlocksStore} from './timeBlocksStore';
import type {TimeBlock} from './timeBlocksStore';
import {studentSetupStore} from './studentSetupStore';
import type {CorSetupStatus, StudentAffiliation} from './studentSetupStore';
import {generateId} from '../utils';
import {
  clockLabel,
  draftReadiness,
  normalizeTermKey,
  planClassBlocks,
} from '../ai/vision/corReviewModel';
import type {CorDraft, PlannedClassBlock} from '../ai/vision/corReviewModel';

/**
 * COR review drafts and reviewed imports (onboarding redesign).
 *
 * Both live only on this phone in `local_settings`:
 * - `cor.draft.v1`: the one in-progress (or last committed) review draft.
 * - `cor.import.ledger.v1`: which class blocks each confirmed import created
 *   or updated, so retries do not duplicate and undo only reverts that import.
 *
 * The class blocks themselves are ordinary `time_block` entities and sync as
 * before; no new cloud fields are introduced.
 */
export const COR_DRAFT_KEY = 'cor.draft.v1';
export const COR_LEDGER_KEY = 'cor.import.ledger.v1';

type Executor = Pick<DatabaseTransaction, 'executeSync'>;

type BlockSnapshot = Pick<
  TimeBlock,
  | 'title'
  | 'date'
  | 'startTime'
  | 'endTime'
  | 'color'
  | 'category'
  | 'notes'
  | 'recurrenceRule'
>;

export interface CorImportBlockEntry {
  blockId: string;
  identityKey: string;
  action: 'created' | 'updated' | 'removed';
  /** State before this import touched an updated/removed block. */
  previous?: BlockSnapshot;
}

export interface CorImportRecord {
  importId: string;
  draftId: string;
  termKey: string;
  committedAt: string;
  blocks: CorImportBlockEntry[];
  previousProfile: AcademicProfileRecord | null;
  previousSetup: {
    affiliation: StudentAffiliation;
    corStatus: CorSetupStatus;
    confirmedImportId: string | null;
    confirmedAt: string | null;
  };
  undoneAt: string | null;
}

interface Ledger {
  version: 1;
  imports: CorImportRecord[];
}

const readSetting = (
  executor: Executor,
  userId: string,
  key: string,
): string | null => {
  const row = executor.executeSync(
    'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
    [userId, key],
  ).rows?.[0];
  return typeof row?.value === 'string' ? row.value : null;
};

const writeSetting = (
  executor: Executor,
  userId: string,
  key: string,
  value: string,
) => {
  executor.executeSync(
    `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [userId, key, value, new Date().toISOString()],
  );
};

const readLedger = (executor: Executor, userId: string): Ledger => {
  try {
    const raw = readSetting(executor, userId, COR_LEDGER_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Ledger>) : null;
    return {
      version: 1,
      imports: Array.isArray(parsed?.imports) ? parsed!.imports : [],
    };
  } catch {
    return {version: 1, imports: []};
  }
};

const snapshotOf = (block: TimeBlock): BlockSnapshot => ({
  title: block.title,
  date: block.date,
  startTime: block.startTime,
  endTime: block.endTime,
  color: block.color,
  category: block.category,
  notes: block.notes ?? undefined,
  recurrenceRule: block.recurrenceRule ?? undefined,
});

const blockFields = (planned: PlannedClassBlock): BlockSnapshot => {
  const title =
    planned.code &&
    !planned.title.toLowerCase().startsWith(planned.code.toLowerCase())
      ? `${planned.code} · ${planned.title}`
      : planned.title;
  return {
    title,
    date: planned.firstDate,
    startTime: planned.startTime,
    endTime: planned.endTime,
    color: pickSubjectColor(planned.code || planned.title),
    category: 'Class',
    notes: formatClassBlockNotes({
      section: planned.section,
      room: planned.room,
      faculty: planned.faculty,
    }),
    recurrenceRule: planned.recurrenceRule,
  };
};

const courseRecords = (draft: CorDraft): AcademicCourseRecord[] =>
  draft.courses
    .filter(course => course.included)
    .map(course => {
      const units = Number(course.units) || 0;
      return {
        code: course.code.trim(),
        title: course.title.trim(),
        subjectTitle: course.title.trim(),
        lecUnits: units,
        labUnits: 0,
        creditUnits: units,
        section: course.meetings[0]?.section || draft.section,
        faculty: course.meetings.find(m => m.faculty)?.faculty || '',
        scheduleSummary: course.meetings.length
          ? course.meetings
              .map(
                m =>
                  `${m.days.join('/')} ${clockLabel(m.start)}-${clockLabel(
                    m.end,
                  )}${m.room ? ` (${m.room})` : ''}`,
              )
              .join(', ')
          : 'TBA',
      };
    });

/**
 * Only reviewed, non-identifying COR facts are kept in the academic profile:
 * student number, registration number, gender, age and nationality are not.
 */
const reviewedProfile = (
  draft: CorDraft,
): Omit<AcademicProfileRecord, 'updatedAt'> => {
  const courses = courseRecords(draft);
  const total = courses.reduce((n, c) => n + c.creditUnits, 0);
  return {
    isUstpStudent: true,
    campus: draft.campus.trim(),
    registrationNo: '',
    studentNo: '',
    fullName: draft.studentName.trim(),
    formattedName: draft.studentName.trim(),
    preferredName: '',
    gender: '',
    age: null,
    nationality: '',
    college: draft.extras.college,
    collegeShort: draft.extras.collegeShort,
    program: draft.program.trim(),
    major: draft.extras.major,
    yearLevel: draft.yearLevel.trim(),
    yearLevelShort: draft.extras.yearLevelShort || draft.yearLevel.trim(),
    curriculum: draft.extras.curriculum,
    academicTerm: draft.term.trim(),
    academicYearTerm: draft.term.trim(),
    section: draft.section.trim(),
    primarySection: draft.section.trim(),
    totalUnits: String(total),
    totalLecUnits: null,
    totalLabUnits: null,
    totalCreditUnits: total,
    courses,
  };
};

export class CorImportError extends Error {
  constructor(
    message: string,
    readonly code: 'not_ready' | 'owner' | 'save_failed',
  ) {
    super(message);
    this.name = 'CorImportError';
  }
}

export interface CommitResult {
  importId: string;
  created: number;
  updated: number;
  removed: number;
  subjects: number;
  meetings: number;
}

/** Test hook: a function run inside the commit transaction before it finishes. */
let commitFaultInjector: ((stage: string) => void) | null = null;
export const __setCorCommitFaultForTests = (
  fn: ((stage: string) => void) | null,
) => {
  commitFaultInjector = fn;
};

export const corImportStore = {
  getDraft: (userId: string, executor: Executor = db): CorDraft | null => {
    try {
      const raw = readSetting(executor, userId, COR_DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw) as CorDraft;
      // Drafts are owner-scoped: a row under another owner is never shown.
      if (!draft || draft.version !== 1 || draft.ownerId !== userId)
        return null;
      return draft;
    } catch {
      return null;
    }
  },

  /** Persists review progress. Returns false when it could not be saved. */
  saveDraft: (
    userId: string,
    draft: CorDraft,
    executor?: Executor,
  ): boolean => {
    if (draft.ownerId !== userId) return false;
    try {
      const apply = (tx: Executor) =>
        writeSetting(tx, userId, COR_DRAFT_KEY, JSON.stringify(draft));
      if (executor) apply(executor);
      else db.transactionSync(apply);
      return true;
    } catch (error) {
      console.error('[corImportStore] Could not save the COR draft:', error);
      return false;
    }
  },

  /** Removes only the draft. An already confirmed schedule is never touched. */
  discardDraft: (userId: string): void => {
    db.transactionSync(tx =>
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, COR_DRAFT_KEY],
      ),
    );
  },

  imports: (userId: string, executor: Executor = db): CorImportRecord[] =>
    readLedger(executor, userId).imports,

  latestActiveImport: (
    userId: string,
    executor: Executor = db,
  ): CorImportRecord | null => {
    const active = readLedger(executor, userId).imports.filter(
      i => !i.undoneAt,
    );
    return active.length ? active[active.length - 1] : null;
  },

  /**
   * Saves a fully reviewed draft in ONE transaction: class blocks (with their
   * sync outbox rows), the reviewed academic profile, the import ledger, the
   * draft's committed status and the COR "confirmed" setup state. Any failure
   * rolls everything back and leaves the persisted draft as it was.
   */
  commitDraft: (userId: string, draft: CorDraft): CommitResult => {
    if (draft.ownerId !== userId) {
      throw new CorImportError(
        'This draft belongs to another account.',
        'owner',
      );
    }
    const readiness = draftReadiness(draft);
    if (!readiness.canCommit) {
      throw new CorImportError(
        'Some items still need your review.',
        'not_ready',
      );
    }
    const planned = planClassBlocks(draft);
    const termKey = normalizeTermKey(draft);
    const importId = generateId('corimport');
    const now = new Date().toISOString();
    const result: CommitResult = {
      importId,
      created: 0,
      updated: 0,
      removed: 0,
      subjects: readiness.includedCourses,
      meetings: readiness.timedMeetings,
    };

    db.transactionSync(tx => {
      const ledger = readLedger(tx, userId);
      const setup = studentSetupStore.get(userId, tx);
      const previousProfile = academicProfileStore.get(userId);
      const liveBlocks = new Map(
        timeBlocksStore
          .getAllOrThrow(userId, tx)
          .map(block => [block.id, block]),
      );

      // Blocks owned by earlier, still-active imports of the same term.
      const owned = new Map<string, string>();
      for (const record of ledger.imports) {
        if (record.undoneAt || record.termKey !== termKey) continue;
        for (const entry of record.blocks) {
          if (entry.action === 'removed') {
            owned.delete(entry.identityKey);
          } else if (liveBlocks.has(entry.blockId)) {
            owned.set(entry.identityKey, entry.blockId);
          }
        }
      }

      const entries: CorImportBlockEntry[] = [];
      const wanted = new Set<string>();
      for (const block of planned) {
        if (wanted.has(block.identityKey)) continue;
        wanted.add(block.identityKey);
        const fields = blockFields(block);
        const existingId = owned.get(block.identityKey);
        const existing = existingId ? liveBlocks.get(existingId) : undefined;
        if (existing) {
          timeBlocksStore.update(
            {id: existing.id, ...fields},
            tx as DatabaseTransaction,
          );
          entries.push({
            blockId: existing.id,
            identityKey: block.identityKey,
            action: 'updated',
            previous: snapshotOf(existing),
          });
          result.updated += 1;
        } else {
          const id = generateId('block');
          timeBlocksStore.insert(
            {id, userId, ...fields},
            tx as DatabaseTransaction,
          );
          entries.push({
            blockId: id,
            identityKey: block.identityKey,
            action: 'created',
          });
          result.created += 1;
        }
      }
      commitFaultInjector?.('blocks');

      // Classes this import lineage added before but the reviewed draft no
      // longer contains (an excluded or corrected meeting). Unrelated
      // classes the student made themselves are never in `owned`.
      for (const [identityKey, blockId] of owned) {
        if (wanted.has(identityKey)) continue;
        const existing = liveBlocks.get(blockId);
        if (!existing) continue;
        timeBlocksStore.delete(blockId, tx as DatabaseTransaction);
        entries.push({
          blockId,
          identityKey,
          action: 'removed',
          previous: snapshotOf(existing),
        });
        result.removed += 1;
      }

      academicProfileStore.save(
        userId,
        reviewedProfile(draft),
        tx as DatabaseTransaction,
        {
          updateUsername: false,
          provenance: {source: 'cor_review', importId, reviewedAt: now},
        },
      );
      commitFaultInjector?.('profile');

      const record: CorImportRecord = {
        importId,
        draftId: draft.draftId,
        termKey,
        committedAt: now,
        blocks: entries,
        previousProfile,
        previousSetup: {
          affiliation: setup.affiliation,
          corStatus: setup.corStatus,
          confirmedImportId: setup.confirmedImportId,
          confirmedAt: setup.confirmedAt,
        },
        undoneAt: null,
      };
      writeSetting(
        tx,
        userId,
        COR_LEDGER_KEY,
        JSON.stringify({
          version: 1,
          imports: [...ledger.imports, record].slice(-12),
        }),
      );
      writeSetting(
        tx,
        userId,
        COR_DRAFT_KEY,
        JSON.stringify({
          ...draft,
          status: 'committed',
          committedImportId: importId,
          updatedAt: now,
        } satisfies CorDraft),
      );
      studentSetupStore.update(
        userId,
        {
          affiliation: 'ustp',
          corStatus: 'confirmed',
          confirmedImportId: importId,
          confirmedAt: now,
        },
        tx as DatabaseTransaction,
      );
      commitFaultInjector?.('setup');
    });
    return result;
  },

  /**
   * Reverts the most recent confirmed import only: blocks it created are
   * removed, blocks it updated or removed are restored, and the previous
   * profile and COR status return. Other schedule data is untouched.
   */
  undoLatestImport: (userId: string): CorImportRecord | null => {
    let undone: CorImportRecord | null = null;
    db.transactionSync(tx => {
      const ledger = readLedger(tx, userId);
      const index = ledger.imports.map(i => !i.undoneAt).lastIndexOf(true);
      if (index < 0) return;
      const record = ledger.imports[index];
      const live = new Map(
        timeBlocksStore
          .getAllOrThrow(userId, tx)
          .map(block => [block.id, block]),
      );
      const restoredBlockIds = new Map<string, string>();
      for (const entry of [...record.blocks].reverse()) {
        if (entry.action === 'created') {
          if (live.has(entry.blockId)) {
            timeBlocksStore.delete(entry.blockId, tx as DatabaseTransaction);
          }
        } else if (entry.action === 'updated' && entry.previous) {
          if (live.has(entry.blockId)) {
            timeBlocksStore.update(
              {id: entry.blockId, ...entry.previous},
              tx as DatabaseTransaction,
            );
          }
        } else if (entry.action === 'removed' && entry.previous) {
          const restoredId = generateId('block');
          timeBlocksStore.insert(
            {id: restoredId, userId, ...entry.previous},
            tx as DatabaseTransaction,
          );
          restoredBlockIds.set(entry.blockId, restoredId);
        }
      }
      if (record.previousProfile) {
        const {provenance, ...withStamp} = record.previousProfile;
        const rest: Omit<typeof withStamp, 'updatedAt'> & {updatedAt?: string} =
          {...withStamp};
        delete rest.updatedAt;
        academicProfileStore.save(userId, rest, tx as DatabaseTransaction, {
          updateUsername: false,
          provenance: provenance ?? null,
        });
      } else {
        academicProfileStore.clear(userId, tx as DatabaseTransaction);
      }
      studentSetupStore.update(
        userId,
        {
          affiliation: record.previousSetup.affiliation,
          corStatus:
            record.previousSetup.corStatus === 'confirmed' &&
            !record.previousSetup.confirmedImportId
              ? 'pending'
              : record.previousSetup.corStatus,
          confirmedImportId: record.previousSetup.confirmedImportId,
          confirmedAt: record.previousSetup.confirmedAt,
        },
        tx as DatabaseTransaction,
      );
      const undoneRecord = {...record, undoneAt: new Date().toISOString()};
      const imports = ledger.imports.map((imp, impIndex) => {
        if (impIndex === index) return undoneRecord;
        if (restoredBlockIds.size === 0) return imp;
        return {
          ...imp,
          blocks: imp.blocks.map(blockEntry => {
            const remapped = restoredBlockIds.get(blockEntry.blockId);
            return remapped ? {...blockEntry, blockId: remapped} : blockEntry;
          }),
        };
      });
      writeSetting(
        tx,
        userId,
        COR_LEDGER_KEY,
        JSON.stringify({version: 1, imports}),
      );
      const draftRaw = readSetting(tx, userId, COR_DRAFT_KEY);
      if (draftRaw) {
        try {
          const draft = JSON.parse(draftRaw) as CorDraft;
          if (draft.committedImportId === record.importId) {
            writeSetting(
              tx,
              userId,
              COR_DRAFT_KEY,
              JSON.stringify({
                ...draft,
                status: 'draft',
                committedImportId: null,
              }),
            );
          }
        } catch {
          // A broken draft row is left for the student to replace.
        }
      }
      undone = undoneRecord;
    });
    return undone;
  },

  /** Moves guest-owned drafts/ledger to a new account (inside guest migration). */
  transferFromGuest: (
    tx: Executor,
    fromUserId: string,
    toUserId: string,
  ): void => {
    if (fromUserId === toUserId) return;
    for (const key of [COR_DRAFT_KEY, COR_LEDGER_KEY]) {
      const raw = readSetting(tx, fromUserId, key);
      if (raw !== null && readSetting(tx, toUserId, key) === null) {
        let value = raw;
        if (key === COR_DRAFT_KEY) {
          try {
            value = JSON.stringify({
              ...(JSON.parse(raw) as CorDraft),
              ownerId: toUserId,
            });
          } catch {
            value = raw;
          }
        }
        writeSetting(tx, toUserId, key, value);
      }
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [fromUserId, key],
      );
    }
  },

  clear: (userId: string, executor?: Executor): void => {
    const apply = (tx: Executor) => {
      for (const key of [COR_DRAFT_KEY, COR_LEDGER_KEY]) {
        tx.executeSync(
          'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
          [userId, key],
        );
      }
    };
    if (executor) apply(executor);
    else db.transactionSync(apply);
  },
};
