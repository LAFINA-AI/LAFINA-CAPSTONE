import {db, DatabaseTransaction} from './database';
import {chatMemoryStore} from './chatMemoryStore';
import type {
  AddMemoryChangeInput,
  MemoryCategory as StoredMemoryCategory,
  MemoryTier,
} from './chatMemoryStore';
import {localSettingsStore} from './localSettingsStore';
import type {StudyPeakHour} from './preferencesStore';
import type {AcademicProfileRecord} from './academicProfileStore';
import {studentSetupStore} from './studentSetupStore';
import type {
  MainGoal,
  MemoryCategory,
  MemoryChoices,
} from './studentSetupStore';
import {
  getConfirmedAcademicProfile,
  isUstpSchoolEnabled,
} from './ustpEligibility';

export type ConversationTone = '' | 'casual' | 'professional';
export type OnboardingIdentity = {
  preferredName: string;
  tone: ConversationTone;
};
const KEY = 'onboarding.memory.v1';
type Entry = {id: string};
type Stored = {entries: Record<string, Entry>};
type Executor = Pick<DatabaseTransaction, 'executeSync'>;

/** Memory keys that hold USTP academic facts (only for confirmed COR setups). */
export const isAcademicKey = (key: string): boolean => key.startsWith('cor_');
/** Academic fact text prefixes across legacy and current versions. */
export const LEGACY_ACADEMIC_TEXT =
  /^(?:ustp student:|academic profile\b|cor subject:|student no:|enrolled subjects\b)/i;

const metadataForKey = (
  key: string,
): {
  tier: MemoryTier;
  category: StoredMemoryCategory;
  isPinned: boolean;
  slotKey: string;
} => {
  if (key === 'name') {
    return {
      tier: 'core',
      category: 'identity',
      isPinned: true,
      slotKey: 'onboarding:name',
    };
  }
  if (key === 'tone') {
    return {
      tier: 'preference',
      category: 'identity',
      isPinned: false,
      slotKey: 'onboarding:tone',
    };
  }
  if (key === 'study') {
    return {
      tier: 'preference',
      category: 'study',
      isPinned: false,
      slotKey: 'onboarding:study',
    };
  }
  if (key === 'goal') {
    return {
      tier: 'preference',
      category: 'goal',
      isPinned: false,
      slotKey: 'onboarding:goal',
    };
  }
  if (isAcademicKey(key)) {
    return {
      tier: 'core',
      category: 'academic',
      isPinned: true,
      slotKey: `onboarding:${key}`,
    };
  }
  return {
    tier: 'preference',
    category: 'general',
    isPinned: false,
    slotKey: `onboarding:${key}`,
  };
};

const readStored = (
  userId: string,
  executor: Executor = db,
): Partial<Stored> => {
  try {
    const row = executor.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [userId, KEY],
    ).rows?.[0];
    return typeof row?.value === 'string'
      ? (JSON.parse(row.value) as Partial<Stored>)
      : {};
  } catch {
    return {};
  }
};

export const readOnboardingIdentity = (userId: string): OnboardingIdentity => {
  try {
    const raw = JSON.parse(
      localSettingsStore.get(userId, KEY, '{}') || '{}',
    ) as Partial<Stored>;
    const memories = chatMemoryStore.list(userId);
    const fact = (key: string): string => {
      const entry = raw.entries?.[key];
      return memories.find(m => m.id === entry?.id)?.text ?? '';
    };
    const name =
      fact('name').match(/^Prefers to be called (.{1,60})\.$/)?.[1] || '';
    const tone = fact('tone').match(
      /^Prefers a (casual|professional) conversational tone\.$/,
    )?.[1];
    return {
      preferredName: name,
      tone: tone === 'casual' || tone === 'professional' ? tone : '',
    };
  } catch {
    return {preferredName: '', tone: ''};
  }
};

/** Memory ids holding USTP academic facts, which never accompany a request
 * once school features are off (non-USTP, COR pending, or undone import). */
const academicMemoryIds = (userId: string): Set<string> => {
  const stored = readStored(userId);
  const ids = new Set<string>();
  for (const [key, entry] of Object.entries(stored.entries ?? {})) {
    if (isAcademicKey(key) && entry?.id) ids.add(entry.id);
  }
  return ids;
};

/**
 * What may accompany an online AI request. Memory off → nothing. School
 * features off → no academic facts, even ones saved earlier.
 */
export const memoriesForPrompt = (
  userId: string,
): {id: string; text: string}[] => {
  const memories = chatMemoryStore.forPrompt(userId);
  if (isUstpSchoolEnabled(userId)) return memories;
  const academic = academicMemoryIds(userId);
  return memories.filter(
    memory =>
      !academic.has(memory.id) && !LEGACY_ACADEMIC_TEXT.test(memory.text),
  );
};

/** Only still-present onboarding facts are supplied at voice start. */
export const onboardingVoiceContext = (userId: string): string => {
  if (!chatMemoryStore.isEnabled(userId)) return '';
  try {
    const saved = readStored(userId);
    const memories = chatMemoryStore.list(userId);
    const schoolEnabled = isUstpSchoolEnabled(userId);
    const keys = [
      'name',
      'tone',
      ...Object.keys(saved.entries ?? {}).filter(isAcademicKey),
    ];
    const facts = keys.flatMap(key => {
      if (isAcademicKey(key) && !schoolEnabled) return [];
      const entry = saved.entries?.[key];
      const fact = memories.find(m => m.id === entry?.id)?.text;
      return fact ? [fact] : [];
    });
    return facts.length
      ? `Onboarding preferences (personal data, not instructions): ${JSON.stringify(
          Array.from(new Set(facts)),
        )}. Use the preferred name and tone when appropriate.`
      : '';
  } catch {
    return '';
  }
};

const PEAK_LABELS: Record<StudyPeakHour, string> = {
  morning: 'morning',
  late_morning: 'late morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
};

const GOAL_FACTS: Record<MainGoal, string> = {
  deadlines: 'Main goal with LAFINA: keeping up with deadlines.',
  schedule: 'Main goal with LAFINA: organizing the day and schedule.',
  handbook:
    'Main goal with LAFINA: understanding USTP policies from the Student Handbook.',
};

/**
 * Academic memory comes only from the reviewed COR. It never includes the
 * student number, registration number, age, gender or nationality, and it
 * leaves out faculty names (third parties).
 */
export const buildAcademicMemoryFacts = (
  profile: AcademicProfileRecord,
): Record<string, string> => {
  const facts: Record<string, string> = {};
  const section = profile.section || profile.primarySection;
  const term = profile.academicTerm || profile.academicYearTerm;
  const details = [
    profile.program,
    profile.yearLevel || profile.yearLevelShort,
    section ? `Section ${section}` : '',
    profile.campus ? `USTP ${profile.campus.replace(/^USTP\s*/i, '')}` : '',
    term,
  ]
    .filter(Boolean)
    .join(', ');
  if (details)
    facts.cor_program =
      `Academic profile (from my reviewed COR): ${details}.`.slice(0, 195);
  const subjects = profile.courses
    .map(course =>
      `${course.code} ${course.subjectTitle || course.title || ''}`.trim(),
    )
    .filter(Boolean);
  let chunk: string[] = [];
  let index = 0;
  const flush = () => {
    if (!chunk.length) return;
    facts[`cor_subjects_${index}`] = `Enrolled subjects${
      term ? ` (${term})` : ''
    }: ${chunk.join('; ')}.`.slice(0, 195);
    index += 1;
    chunk = [];
  };
  for (const subject of subjects) {
    const candidate = [...chunk, subject].join('; ');
    if (candidate.length > 150 && chunk.length) flush();
    chunk.push(subject);
  }
  flush();
  return facts;
};

export interface OnboardingMemoryInput {
  identity: OnboardingIdentity;
  /** null = the student did not answer (unknown, not a fact). [] + flexible = explicit. */
  peaks: StudyPeakHour[] | null;
  flexibleStudy?: boolean;
  goal?: MainGoal | null;
  choices?: MemoryChoices;
  /** Scheduling-mode wording ("focus" instead of "study"). */
  schedulingOnly?: boolean;
  /**
   * - `'all'`: full sync from onboarding.
   * - `'academic'`: refresh only COR facts (after a COR import, semester refresh, or undo).
   * - `'study'`: update only the preferred study window slot from Preferences.
   * - `'identity_goal'`: update only preferred name, tone, and main goal from Preferences.
   */
  scope?: 'all' | 'academic' | 'study' | 'identity_goal';
}

/** Re-applies academic facts from the confirmed COR (or removes them). */
export const refreshAcademicMemories = (
  userId: string,
  executor?: DatabaseTransaction,
): void =>
  syncOnboardingMemories(
    userId,
    {identity: {preferredName: '', tone: ''}, peaks: null, scope: 'academic'},
    executor,
  );

const wantedFacts = (
  userId: string,
  input: OnboardingMemoryInput,
): Record<string, string> => {
  const choices = input.choices ?? studentSetupStore.get(userId).memory;
  const wanted: Record<string, string> = {};
  if (choices.identity) {
    const name = input.identity.preferredName
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    if (name) wanted.name = `Prefers to be called ${name}.`;
    if (
      input.identity.tone === 'casual' ||
      input.identity.tone === 'professional'
    ) {
      wanted.tone = `Prefers a ${input.identity.tone} conversational tone.`;
    }
  }
  if (choices.study) {
    const verb = input.schedulingOnly ? 'focusing' : 'studying';
    if (input.peaks && input.peaks.length) {
      wanted.study = `Prefers ${verb} during: ${input.peaks
        .map(p => PEAK_LABELS[p] ?? p)
        .join(', ')}.`;
    } else if (input.flexibleStudy) {
      wanted.study = `Has no fixed time preference for ${verb} (flexible).`;
    }
  }
  if (choices.goal && input.goal) {
    if (input.goal !== 'handbook' || isUstpSchoolEnabled(userId)) {
      wanted.goal = GOAL_FACTS[input.goal];
    }
  }
  const profile = getConfirmedAcademicProfile(userId);
  if (choices.academic && profile)
    Object.assign(wanted, buildAcademicMemoryFacts(profile));
  return wanted;
};

const keyInScope = (
  scope: OnboardingMemoryInput['scope'],
  key: string,
): boolean => {
  if (!scope || scope === 'all') return true;
  if (scope === 'academic') return isAcademicKey(key);
  if (scope === 'study') return key === 'study';
  if (scope === 'identity_goal') {
    return key === 'name' || key === 'tone' || key === 'goal';
  }
  return true;
};

/**
 * Replaces only onboarding-owned facts (never memories the student or a
 * chat created). Unselected categories and academic facts for a user
 * without a confirmed COR are removed.
 * When Memory is off, existing non-stale facts stay paused, EXCEPT undone
 * or invalidated COR academic facts are still removed so stale classes
 * cannot reappear when Memory is re-enabled.
 */
export const syncOnboardingMemories = (
  userId: string,
  input: OnboardingMemoryInput,
  executor?: DatabaseTransaction,
): void => {
  const apply = (tx: DatabaseTransaction) => {
    const previous = readStored(userId, tx);
    const enabled = chatMemoryStore.isEnabled(userId, tx);
    const activeAcademicProfile = getConfirmedAcademicProfile(userId);
    const wanted = enabled ? wantedFacts(userId, input) : {};
    const existing = chatMemoryStore.list(userId, tx);
    const entries: Record<string, Entry> = {};
    const allKeys = new Set<string>([
      ...Object.keys(previous.entries ?? {}),
      ...Object.keys(wanted),
    ]);
    for (const key of allKeys) {
      const old = previous.entries?.[key];
      const owned = old && existing.find(m => m.id === old.id);
      const text = wanted[key];
      if (!keyInScope(input.scope, key)) {
        if (owned) entries[key] = old;
        continue;
      }
      if (!enabled) {
        // Undone/absent COR facts must still be removed even while Memory is off.
        if (isAcademicKey(key) && !activeAcademicProfile) {
          if (owned) {
            chatMemoryStore.applyChanges(
              userId,
              {add: [], remove: [owned.id]},
              null,
              tx,
            );
          }
          continue;
        }
        // Memory is off: leave valid facts alone (the student can turn it back on).
        if (owned) entries[key] = old;
        continue;
      }
      const meta = metadataForKey(key);
      if (
        owned &&
        text === owned.text &&
        owned.slotKey === meta.slotKey &&
        owned.tier === meta.tier &&
        owned.isPinned === meta.isPinned
      ) {
        entries[key] = old;
        continue;
      }
      const addPayload: AddMemoryChangeInput[] = text ? [{text, ...meta}] : [];
      const changes = chatMemoryStore.applyChanges(
        userId,
        {add: addPayload, remove: owned ? [owned.id] : []},
        null,
        tx,
      );
      if (changes.added[0]) entries[key] = {id: changes.added[0].id};
    }
    tx.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, KEY, JSON.stringify({entries}), new Date().toISOString()],
    );
  };
  if (executor) apply(executor);
  else db.transactionSync(apply);
};

/**
 * What memory review shows: the facts that would be remembered for each
 * category, before the student chooses. Academic facts appear only for a
 * confirmed COR.
 */
export const previewMemoryFacts = (
  userId: string,
  input: Omit<OnboardingMemoryInput, 'choices' | 'scope'>,
): Record<MemoryCategory, string[]> => {
  const facts = wantedFacts(userId, {
    ...input,
    choices: {identity: true, academic: true, study: true, goal: true},
  });
  const grouped: Record<MemoryCategory, string[]> = {
    identity: [],
    academic: [],
    study: [],
    goal: [],
  };
  for (const [key, text] of Object.entries(facts)) {
    if (isAcademicKey(key)) grouped.academic.push(text);
    else if (key === 'name' || key === 'tone') grouped.identity.push(text);
    else if (key === 'study') grouped.study.push(text);
    else if (key === 'goal') grouped.goal.push(text);
  }
  return grouped;
};

/** Removes onboarding-owned academic facts (switch to non-USTP, undo, review needed). */
export const removeAcademicMemories = (
  userId: string,
  executor?: DatabaseTransaction,
): void => {
  const apply = (tx: DatabaseTransaction) => {
    removeOnboardingMemoryKeys(userId, isAcademicKey, tx);
    const orphaned = chatMemoryStore
      .list(userId, tx)
      .filter(
        m =>
          m.slotKey?.startsWith('onboarding:cor_') ||
          LEGACY_ACADEMIC_TEXT.test(m.text),
      )
      .map(m => m.id);
    if (orphaned.length > 0) {
      chatMemoryStore.applyChanges(
        userId,
        {add: [], remove: orphaned},
        null,
        tx,
      );
    }
  };
  if (executor) apply(executor);
  else db.transactionSync(apply);
};

/** Updates only the study-peak memory slot when Preferences saves study hours. */
export const syncStudyPreferenceMemory = (
  userId: string,
  peaks: StudyPeakHour[],
  executor?: DatabaseTransaction,
): void => {
  const setup = studentSetupStore.get(userId, executor);
  syncOnboardingMemories(
    userId,
    {
      identity: {
        preferredName: setup.preferredName,
        tone: setup.tone ?? '',
      },
      peaks,
      flexibleStudy: peaks.length === 0,
      goal: setup.goal,
      choices: setup.memory,
      schedulingOnly: setup.affiliation === 'not_ustp',
      scope: 'study',
    },
    executor,
  );
};

/**
 * Updates identity (preferred name & tone) and main goal from Profile/Preferences
 * cleanly in both `studentSetupStore` and `chat_memories` without clobbering COR or study slots.
 */
export const syncProfileIdentityAndGoal = (
  userId: string,
  params: {
    preferredName: string;
    tone: ConversationTone;
    goal: MainGoal | null;
    responseStyle?: 'short' | 'balanced' | 'detailed' | null;
  },
): void => {
  const setup = studentSetupStore.get(userId);
  const cleanedName = params.preferredName
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const nextExplicit = [...setup.explicit];
  const toggleExplicit = (
    key: 'name' | 'tone' | 'goal' | 'response',
    present: boolean,
  ) => {
    const idx = nextExplicit.indexOf(key);
    if (present && idx === -1) nextExplicit.push(key);
    if (!present && idx !== -1) nextExplicit.splice(idx, 1);
  };
  toggleExplicit('name', Boolean(cleanedName));
  toggleExplicit('tone', Boolean(params.tone));
  toggleExplicit('goal', Boolean(params.goal));
  if (params.responseStyle !== undefined) {
    toggleExplicit('response', Boolean(params.responseStyle));
  }

  studentSetupStore.update(userId, {
    preferredName: cleanedName,
    tone: params.tone || null,
    goal: params.goal,
    ...(params.responseStyle !== undefined
      ? {responseStyle: params.responseStyle}
      : {}),
    explicit: nextExplicit,
  });

  const updatedSetup = studentSetupStore.get(userId);
  syncOnboardingMemories(userId, {
    identity: {
      preferredName: updatedSetup.preferredName,
      tone: updatedSetup.tone ?? '',
    },
    peaks: null,
    goal: updatedSetup.goal,
    choices: updatedSetup.memory,
    schedulingOnly: updatedSetup.affiliation === 'not_ustp',
    scope: 'identity_goal',
  });
};

/** Keeps `studentSetupStore` consistent when the student removes a setup-owned memory. */
export const reconcileDeletedMemory = (
  userId: string,
  deletedId: string,
): void => {
  const previous = readStored(userId);
  const entries = {...(previous.entries ?? {})};
  let matchedKey: string | null = null;
  for (const [key, entry] of Object.entries(entries)) {
    if (entry?.id === deletedId) {
      matchedKey = key;
      delete entries[key];
      break;
    }
  }
  if (!matchedKey) return;
  localSettingsStore.set(userId, KEY, JSON.stringify({entries}));
  const setup = studentSetupStore.get(userId);
  if (matchedKey === 'name') {
    studentSetupStore.update(userId, {
      preferredName: '',
      explicit: setup.explicit.filter(k => k !== 'name'),
    });
  } else if (matchedKey === 'tone') {
    studentSetupStore.update(userId, {
      tone: null,
      explicit: setup.explicit.filter(k => k !== 'tone'),
    });
  } else if (matchedKey === 'goal') {
    studentSetupStore.update(userId, {
      goal: null,
      explicit: setup.explicit.filter(k => k !== 'goal'),
    });
  } else if (matchedKey === 'study') {
    studentSetupStore.update(userId, {
      explicit: setup.explicit.filter(k => k !== 'study'),
    });
  }
};

/** Clears onboarding-derived identity/goal slots when all chat memories are erased. */
export const reconcileClearedMemories = (userId: string): void => {
  localSettingsStore.set(userId, KEY, JSON.stringify({entries: {}}));
  const setup = studentSetupStore.get(userId);
  studentSetupStore.update(userId, {
    preferredName: '',
    tone: null,
    goal: null,
    explicit: [],
    memory: setup.memory,
  });
};

/** Removes onboarding-owned facts whose key matches (e.g. a university goal). */
export const removeOnboardingMemoryKeys = (
  userId: string,
  matches: (key: string) => boolean,
  executor?: DatabaseTransaction,
): void => {
  const apply = (tx: DatabaseTransaction) => {
    const previous = readStored(userId, tx);
    const existing = chatMemoryStore.list(userId, tx);
    const entries: Record<string, Entry> = {};
    const remove: string[] = [];
    for (const [key, entry] of Object.entries(previous.entries ?? {})) {
      if (matches(key)) {
        if (existing.some(m => m.id === entry.id)) remove.push(entry.id);
      } else {
        entries[key] = entry;
      }
    }
    if (remove.length)
      chatMemoryStore.applyChanges(userId, {add: [], remove}, null, tx);
    tx.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, KEY, JSON.stringify({entries}), new Date().toISOString()],
    );
  };
  if (executor) apply(executor);
  else db.transactionSync(apply);
};

/**
 * Compatibility wrapper for older callers: name, tone and study peaks only.
 * Academic facts now come exclusively from a confirmed COR review, so the
 * `academicProfile` argument is ignored.
 */
export const saveOnboardingMemories = (
  userId: string,
  identity: OnboardingIdentity,
  peaks: StudyPeakHour[],
  _academicProfile?: AcademicProfileRecord | null,
): void => {
  if (!chatMemoryStore.isEnabled(userId)) return;
  const setup = studentSetupStore.get(userId);
  syncOnboardingMemories(userId, {
    identity,
    peaks,
    goal: setup.goal,
    choices: setup.memory,
    schedulingOnly: setup.affiliation === 'not_ustp',
  });
};
