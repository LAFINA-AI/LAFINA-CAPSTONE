import {db, DatabaseTransaction} from './database';

/**
 * The student's chosen LAFINA experience and first-use progress
 * (onboarding redesign). Stored only on this phone in `local_settings`;
 * it is not part of any synced entity or cloud contract.
 *
 * Declared affiliation, COR review status and the derived feature
 * availability (`ustpEligibility.ts`) are deliberately separate: choosing
 * "USTP" does not enable school features, and a failed or cancelled COR
 * import never changes the declared affiliation.
 */
export const STUDENT_SETUP_KEY = 'student.setup.v1';

export type StudentAffiliation = 'unset' | 'ustp' | 'not_ustp';

/**
 * - `none`: no COR review has started.
 * - `pending`: USTP selected; COR not confirmed yet (later, failed, cancelled).
 * - `confirmed`: a reviewed COR import was saved (`confirmedImportId`).
 * - `needs_review`: an older install holds COR data without review provenance.
 */
export type CorSetupStatus = 'none' | 'pending' | 'confirmed' | 'needs_review';

export type MainGoal = 'deadlines' | 'schedule' | 'handbook';
export type ResponseStyle = 'short' | 'balanced' | 'detailed';
export type ConversationToneSetting = 'casual' | 'professional';

/** Preferences the student picked themselves (skipped or default values are not listed). */
export type ExplicitPreference =
  | 'name'
  | 'tone'
  | 'goal'
  | 'routine'
  | 'study'
  | 'response'
  | 'lead';

export type MemoryCategory = 'identity' | 'academic' | 'study' | 'goal';

export interface MemoryChoices {
  identity: boolean;
  academic: boolean;
  study: boolean;
  goal: boolean;
}

export interface StudentSetupState {
  version: 1;
  affiliation: StudentAffiliation;
  corStatus: CorSetupStatus;
  confirmedImportId: string | null;
  confirmedAt: string | null;
  preferredName: string;
  tone: ConversationToneSetting | null;
  goal: MainGoal | null;
  responseStyle: ResponseStyle | null;
  explicit: ExplicitPreference[];
  memory: MemoryChoices;
  setupCompletedAt: string | null;
  updatedAt: string;
  /** Increases on every write, so in-flight work can detect a mode change. */
  revision: number;
}

const DEFAULT_MEMORY: MemoryChoices = {
  identity: true,
  academic: true,
  study: true,
  goal: true,
};

type Executor = Pick<DatabaseTransaction, 'executeSync'>;
type Listener = (userId: string) => void;
const listeners = new Set<Listener>();

const AFFILIATIONS: StudentAffiliation[] = ['unset', 'ustp', 'not_ustp'];
const STATUSES: CorSetupStatus[] = [
  'none',
  'pending',
  'confirmed',
  'needs_review',
];
const GOALS: MainGoal[] = ['deadlines', 'schedule', 'handbook'];
const STYLES: ResponseStyle[] = ['short', 'balanced', 'detailed'];
const EXPLICIT: ExplicitPreference[] = [
  'name',
  'tone',
  'goal',
  'routine',
  'study',
  'response',
  'lead',
];

const pick = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const pickOrNull = <T extends string>(value: unknown, allowed: T[]): T | null =>
  allowed.includes(value as T) ? (value as T) : null;

export const defaultStudentSetup = (): StudentSetupState => ({
  version: 1,
  affiliation: 'unset',
  corStatus: 'none',
  confirmedImportId: null,
  confirmedAt: null,
  preferredName: '',
  tone: null,
  goal: null,
  responseStyle: null,
  explicit: [],
  memory: {...DEFAULT_MEMORY},
  setupCompletedAt: null,
  updatedAt: '',
  revision: 0,
});

const normalize = (raw: unknown): StudentSetupState => {
  const base = defaultStudentSetup();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<StudentSetupState>;
  const memory = (value.memory ?? {}) as Partial<MemoryChoices>;
  return {
    version: 1,
    affiliation: pick(value.affiliation, AFFILIATIONS, 'unset'),
    corStatus: pick(value.corStatus, STATUSES, 'none'),
    confirmedImportId:
      typeof value.confirmedImportId === 'string' && value.confirmedImportId
        ? value.confirmedImportId
        : null,
    confirmedAt:
      typeof value.confirmedAt === 'string' ? value.confirmedAt : null,
    preferredName:
      typeof value.preferredName === 'string'
        ? value.preferredName.slice(0, 60)
        : '',
    tone: pickOrNull(value.tone, ['casual', 'professional']),
    goal: pickOrNull(value.goal, GOALS),
    responseStyle: pickOrNull(value.responseStyle, STYLES),
    explicit: Array.isArray(value.explicit)
      ? value.explicit.filter((key): key is ExplicitPreference =>
          EXPLICIT.includes(key as ExplicitPreference),
        )
      : [],
    memory: {
      identity: memory.identity !== false,
      academic: memory.academic !== false,
      study: memory.study !== false,
      goal: memory.goal !== false,
    },
    setupCompletedAt:
      typeof value.setupCompletedAt === 'string'
        ? value.setupCompletedAt
        : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    revision: typeof value.revision === 'number' ? value.revision : 0,
  };
};

const readRaw = (userId: string, executor: Executor): string | null => {
  const row = executor.executeSync(
    'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
    [userId, STUDENT_SETUP_KEY],
  ).rows?.[0];
  return typeof row?.value === 'string' ? row.value : null;
};

/**
 * Existing installs (before this redesign) have no setup state. A stored
 * academic profile without review provenance becomes `needs_review`: USTP
 * stays selected, school features stay off until the COR is reviewed.
 */
const legacyState = (userId: string, executor: Executor): StudentSetupState => {
  const base = defaultStudentSetup();
  try {
    const row = executor.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [userId, 'academic.profile.v1'],
    ).rows?.[0];
    if (typeof row?.value === 'string') {
      const profile = JSON.parse(row.value) as {isUstpStudent?: boolean};
      if (profile?.isUstpStudent) {
        return {...base, affiliation: 'ustp', corStatus: 'needs_review'};
      }
    }
  } catch {
    // Unreadable legacy data is treated as "not chosen yet".
  }
  return base;
};

const notify = (userId: string): void => {
  listeners.forEach(listener => {
    try {
      listener(userId);
    } catch (error) {
      console.warn('[studentSetupStore] listener failed:', error);
    }
  });
};

export const studentSetupStore = {
  get: (
    userId: string | null | undefined,
    executor: Executor = db,
  ): StudentSetupState => {
    if (!userId) return defaultStudentSetup();
    try {
      const raw = readRaw(userId, executor);
      if (raw === null) return legacyState(userId, executor);
      return normalize(JSON.parse(raw));
    } catch (error) {
      console.warn('[studentSetupStore] Could not read setup state:', error);
      return defaultStudentSetup();
    }
  },

  /** True once a state row exists (the student went through the new setup). */
  exists: (userId: string, executor: Executor = db): boolean => {
    try {
      return readRaw(userId, executor) !== null;
    } catch {
      return false;
    }
  },

  /**
   * Applies `patch` atomically. Throws on failure (callers decide how to
   * report it); listeners run after a successful write outside a caller tx.
   */
  update: (
    userId: string,
    patch: Partial<
      Omit<StudentSetupState, 'version' | 'revision' | 'updatedAt'>
    >,
    executor?: DatabaseTransaction,
  ): StudentSetupState => {
    if (!userId) throw new Error('A setup owner is required.');
    let next = defaultStudentSetup();
    const apply = (tx: DatabaseTransaction) => {
      const current = studentSetupStore.get(userId, tx);
      next = normalize({
        ...current,
        ...patch,
        memory: {...current.memory, ...(patch.memory ?? {})},
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      tx.executeSync(
        `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [userId, STUDENT_SETUP_KEY, JSON.stringify(next), next.updatedAt],
      );
    };
    if (executor) {
      apply(executor);
      executor.afterCommit?.(() => notify(userId));
    } else {
      db.transactionSync(apply);
      notify(userId);
    }
    return next;
  },

  /** Lets a caller that wrote inside its own transaction announce the change after commit. */
  notifyChanged: (userId: string): void => notify(userId),

  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  markExplicit: (
    state: StudentSetupState,
    keys: ExplicitPreference[],
  ): ExplicitPreference[] => Array.from(new Set([...state.explicit, ...keys])),

  /**
   * Guest → account: the setup choice, first-use progress, onboarding-owned
   * memory index and tour state follow the guest's data (an account that
   * already has its own value keeps it).
   */
  transferFromGuest: (
    tx: Executor,
    fromUserId: string,
    toUserId: string,
  ): void => {
    if (fromUserId === toUserId) return;
    // Merge onboarding.memory.v1 entries so partial guest memory transfers
    // preserve pointers to transferred rows without overwriting existing ones.
    try {
      const fromRow = tx.executeSync(
        'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
        [fromUserId, 'onboarding.memory.v1'],
      ).rows[0];
      const toRow = tx.executeSync(
        'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
        [toUserId, 'onboarding.memory.v1'],
      ).rows[0];
      if (fromRow && toRow) {
        const fromParsed = JSON.parse(String(fromRow.value || '{}')) as {
          entries?: Record<string, {id?: string}>;
        };
        const toParsed = JSON.parse(String(toRow.value || '{}')) as {
          entries?: Record<string, {id?: string}>;
        };
        const merged: Record<string, {id: string}> = {};
        for (const [k, v] of Object.entries(toParsed.entries ?? {})) {
          if (v?.id) merged[k] = {id: v.id};
        }
        let changed = false;
        for (const [k, v] of Object.entries(fromParsed.entries ?? {})) {
          if (!v?.id || merged[k]) continue;
          const exists = tx.executeSync(
            'SELECT id FROM chat_memories WHERE user_id = ? AND id = ?',
            [toUserId, v.id],
          ).rows;
          if (exists.length > 0) {
            merged[k] = {id: v.id};
            changed = true;
          }
        }
        if (changed) {
          tx.executeSync(
            'UPDATE local_settings SET value = ?, updated_at = ? WHERE user_id = ? AND key = ?',
            [
              JSON.stringify({entries: merged}),
              new Date().toISOString(),
              toUserId,
              'onboarding.memory.v1',
            ],
          );
        }
      }
    } catch {
      // Fall back to standard UPDATE OR IGNORE below.
    }
    for (const key of [
      STUDENT_SETUP_KEY,
      'onboarding.progress.v1',
      'onboarding.memory.v1',
      'product_tour',
    ]) {
      tx.executeSync(
        'UPDATE OR IGNORE local_settings SET user_id = ? WHERE user_id = ? AND key = ?',
        [toUserId, fromUserId, key],
      );
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [fromUserId, key],
      );
    }
  },

  clear: (userId: string, executor?: Executor): void => {
    const apply = (tx: Executor) =>
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, STUDENT_SETUP_KEY],
      );
    if (executor) apply(executor);
    else db.transactionSync(apply);
    if (!executor) notify(userId);
  },
};
