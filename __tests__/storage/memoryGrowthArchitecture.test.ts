import {
  behaviorStore,
  chatMemoryStore,
  chatStore,
  db,
  guestMigration,
  initDatabase,
  preferencesStore,
  userStore,
} from '../../src/storage';
import {
  authorizeDataReset,
  resetPersonalData,
} from '../../src/storage/accountDataReset';
import {corImportStore} from '../../src/storage/corImportStore';
import {personalMemoryStore} from '../../src/storage/personalMemoryStore';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import {
  acknowledgeOverlap,
  confirmAcademic,
  confirmCourse,
  confirmMeeting,
  confirmStudent,
  confirmTerm,
  editMeeting,
  editTerm,
  findOverlaps,
  keepCourseUnscheduled,
} from '../../src/ai/vision/corReviewModel';
import type {
  CorDraft,
  CorDraftMeeting,
} from '../../src/ai/vision/corReviewModel';
import {GUEST_USER_ID} from '../../src/constants';
import {migrateChatMemoriesV2} from '../../src/storage/chatMemorySchema';
import {
  memoriesForPrompt,
  refreshAcademicMemories,
  reconcileClearedMemories,
  reconcileDeletedMemory,
  saveOnboardingMemories,
} from '../../src/storage/onboardingMemory';
import {chooseNotUstpMode, chooseUstpMode} from '../../src/storage/studentMode';
import {getUstpEligibility} from '../../src/storage/ustpEligibility';
import {recordReminderInteraction} from '../../src/ai/ml/featureExtractor';
import {getAdaptiveGrowthInsights} from '../../src/ai/ml/timingAdvisor';

let seq = 0;
const makeStudent = (prefix = 'mem-grow'): string => {
  seq += 1;
  const id = `${prefix}-${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const clock = (hour: number, minute: number, period: 'AM' | 'PM' | null) => ({
  hour,
  minute,
  period,
});

const sampleMeeting = (
  id: string,
  days: CorDraftMeeting['days'],
  start: CorDraftMeeting['start'],
  end: CorDraftMeeting['end'],
): CorDraftMeeting => ({
  id,
  days,
  start,
  end,
  room: '09-302',
  faculty: 'Instructor',
  section: 'IT4R11',
  origin: 'detected',
  sourceText: 'IT414 F 7:00 AM - 10:00 AM/09-302',
  notices: [],
  reviewed: false,
});

const makeCorDraft = (
  userId: string,
  term = '1st Semester AY 2026-2027',
): CorDraft => {
  const raw: CorDraft = {
    version: 1,
    draftId: `cor-draft-${userId}-${seq}-${term}`,
    ownerId: userId,
    status: 'draft',
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    document: {
      fileName: 'cor.pdf',
      localPath: null,
      mimeType: 'application/pdf',
    },
    sourceText: 'IT414 IT Elective 3 ...',
    studentName: 'Alex A. Cruz',
    campus: 'Cagayan de Oro',
    program: 'B.S. in Information Technology',
    yearLevel: '4th Year',
    section: 'IT4R11',
    term,
    startDate: '2026-08-10',
    endDate: '2026-12-18',
    studentReviewed: false,
    academicReviewed: false,
    termReviewed: false,
    courses: [
      {
        id: 'c-it414',
        code: 'IT414',
        title: 'IT Elective 3',
        units: '3',
        origin: 'detected',
        sourceText: 'IT414 IT Elective 3 2 1 3',
        included: true,
        reviewed: false,
        keepUnscheduled: false,
        meetings: [
          sampleMeeting(
            'm-fri',
            ['Fri'],
            clock(7, 0, 'AM'),
            clock(10, 0, 'AM'),
          ),
        ],
      },
      {
        id: 'c-it411',
        code: 'IT411',
        title: 'Capstone Project',
        units: '3',
        origin: 'detected',
        sourceText: 'IT411 Capstone Project',
        included: true,
        reviewed: false,
        keepUnscheduled: false,
        meetings: [],
      },
    ],
    acknowledgedOverlaps: [],
    extras: {
      college: 'CITC',
      collegeShort: 'CITC',
      major: 'N/A',
      curriculum: 'CITC-BSIT',
      yearLevelShort: '4th Year',
      formattedName: 'Alex A. Cruz',
      totalCreditUnits: 6,
      totalLecUnits: 6,
      totalLabUnits: 0,
    },
    committedImportId: null,
  };
  let d = confirmStudent(raw);
  d = confirmAcademic(d);
  d = editTerm(d, {startDate: '2026-08-10', endDate: '2026-12-18'});
  d = confirmTerm(d);
  d = editMeeting(d, 'c-it414', 'm-fri', {
    start: clock(7, 0, 'AM'),
    end: clock(10, 0, 'AM'),
  });
  d = confirmMeeting(d, 'c-it414', 'm-fri');
  d = keepCourseUnscheduled(d, 'c-it411');
  for (const id of ['c-it414', 'c-it411']) d = confirmCourse(d, id);
  for (const overlap of findOverlaps(d)) d = acknowledgeOverlap(d, overlap.key);
  return d;
};

beforeAll(async () => {
  await initDatabase();
});

describe('Schema v30 & tiered chatMemoryStore', () => {
  test('migrateChatMemoriesV2 is idempotent and exposes tiered columns', () => {
    db.transactionSync(tx => {
      migrateChatMemoriesV2(tx);
    });
    const cols = db
      .executeSync("PRAGMA table_info('chat_memories')")
      .rows.map(r => String(r.name));
    expect(cols).toEqual(
      expect.arrayContaining([
        'tier',
        'category',
        'is_pinned',
        'slot_key',
        'last_used_at',
        'expires_at',
      ]),
    );
  });

  test('protects pinned and core memories from 100-item FIFO eviction and prioritizes prompt budget', () => {
    const userId = makeStudent('evict');
    const pinnedCore = chatMemoryStore.add(
      userId,
      'Prefers to be called Alex.',
      {
        tier: 'core',
        category: 'identity',
        isPinned: true,
        slotKey: 'onboarding:name',
      },
    );
    expect(pinnedCore).not.toBeNull();
    const unpinnedPref = chatMemoryStore.add(
      userId,
      'Prefers concise bullet points.',
      {
        tier: 'preference',
        category: 'study',
      },
    );
    expect(unpinnedPref).not.toBeNull();

    for (let i = 0; i < 105; i += 1) {
      chatMemoryStore.add(userId, `Episodic detail number ${i}.`, {
        tier: 'episodic',
      });
    }

    const stored = chatMemoryStore.list(userId);
    expect(stored).toHaveLength(100);
    expect(stored.some(m => m.id === pinnedCore!.id)).toBe(true);

    const promptList = chatMemoryStore.forPrompt(userId);
    expect(promptList).toHaveLength(40);
    expect(promptList[0].id).toBe(pinnedCore!.id);
    expect(promptList.some(m => m.id === unpinnedPref!.id)).toBe(true);
  });

  test('deduplicates trailing punctuation, supports inline edit, pin/unpin, expiration, and markUsed', () => {
    const userId = makeStudent('edit');
    const first = chatMemoryStore.add(userId, 'Prefers quiet study rooms.');
    expect(first).not.toBeNull();
    expect(chatMemoryStore.add(userId, 'prefers quiet study rooms')).toBeNull();

    expect(() =>
      chatMemoryStore.add(userId, 'Enjoys coffee while coding.'),
    ).not.toThrow();
    const second = chatMemoryStore
      .list(userId)
      .find(m => m.text.startsWith('Enjoys coffee'));
    expect(second).toBeDefined();
    expect(() =>
      chatMemoryStore.update(userId, second!.id, {
        text: 'Prefers quiet study rooms!',
      }),
    ).toThrow(/already saved/i);

    const edited = chatMemoryStore.update(userId, second!.id, {
      text: 'Enjoys iced coffee while reviewing.',
      isPinned: true,
      tier: 'core',
    });
    expect(edited).toMatchObject({
      text: 'Enjoys iced coffee while reviewing.',
      isPinned: true,
      tier: 'core',
    });

    const revBeforeUsed = chatMemoryStore.revision(userId);
    chatMemoryStore.markUsed(userId, [edited!.id]);
    expect(chatMemoryStore.revision(userId)).toBe(revBeforeUsed);
    expect(
      chatMemoryStore.list(userId).find(m => m.id === edited!.id)?.lastUsedAt,
    ).toBeTruthy();

    chatMemoryStore.add(userId, 'Already expired transient fact.', {
      tier: 'episodic',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    expect(
      chatMemoryStore
        .list(userId)
        .some(m => m.text.includes('Already expired')),
    ).toBe(false);
  });

  test('slotKey replaces prior value and preserves full rollback across chatStore memoryChanges Undo', () => {
    const userId = makeStudent('slot-undo');
    const first = chatMemoryStore.applyChanges(
      userId,
      {
        add: [
          {
            text: 'Prefers studying at morning.',
            tier: 'preference',
            category: 'study',
            slotKey: 'study:time',
          },
        ],
        remove: [],
      },
      null,
    );
    expect(first.added).toHaveLength(1);

    const replace = chatMemoryStore.applyChanges(
      userId,
      {
        add: [
          {
            text: 'Prefers studying at night.',
            tier: 'preference',
            category: 'study',
            slotKey: 'study:time',
          },
        ],
        remove: [],
      },
      null,
    );
    expect(replace.added).toHaveLength(1);
    expect(replace.removed).toHaveLength(1);
    expect(replace.removed[0].slotKey).toBe('study:time');
    expect(chatMemoryStore.list(userId).map(m => m.text)).toEqual([
      'Prefers studying at night.',
    ]);

    const reply = chatStore.addMessage(
      userId,
      'assistant',
      'Updated preference',
    );
    expect(chatStore.setMemoryChanges(userId, reply.id, replace)).toBe(true);
    const reloaded = chatStore.getMemoryChanges(userId, reply.id);
    expect(reloaded).toEqual(replace);

    chatMemoryStore.undoChanges(userId, reloaded!);
    const afterUndo = chatMemoryStore.list(userId);
    expect(afterUndo).toHaveLength(1);
    expect(afterUndo[0].text).toBe('Prefers studying at morning.');
    expect(afterUndo[0].slotKey).toBe('study:time');
  });
});

describe('Onboarding, COR Undo, Reset, and Guest Migration fixes', () => {
  test('undone COR removes academic memories even while chat memory is disabled', () => {
    const userId = makeStudent('cor-undo-off');
    chooseUstpMode(userId);
    chatMemoryStore.setEnabled(userId, true);
    corImportStore.commitDraft(userId, makeCorDraft(userId));
    refreshAcademicMemories(userId);
    expect(
      chatMemoryStore
        .list(userId)
        .some(m => m.text.includes('Information Technology')),
    ).toBe(true);

    // Student pauses Memory, then undoes COR import.
    chatMemoryStore.setEnabled(userId, false);
    corImportStore.undoLatestImport(userId);
    refreshAcademicMemories(userId);

    // Re-enabling Memory later must NOT bring back withdrawn COR subjects or program.
    chatMemoryStore.setEnabled(userId, true);
    const remaining = chatMemoryStore.list(userId).map(m => m.text);
    expect(remaining.some(t => t.includes('Information Technology'))).toBe(
      false,
    );
    expect(remaining.some(t => t.includes('IT414'))).toBe(false);
  });

  test('new semester COR refresh cleanly replaces prior-term subjects without stale leftovers', () => {
    const userId = makeStudent('cor-semester');
    chooseUstpMode(userId);
    chatMemoryStore.setEnabled(userId, true);

    corImportStore.commitDraft(
      userId,
      makeCorDraft(userId, '1st Semester AY 2026-2027'),
    );
    refreshAcademicMemories(userId);
    expect(
      chatMemoryStore
        .list(userId)
        .some(m => m.text.includes('1st Semester AY 2026-2027')),
    ).toBe(true);

    corImportStore.commitDraft(
      userId,
      makeCorDraft(userId, '2nd Semester AY 2026-2027'),
    );
    refreshAcademicMemories(userId);
    const texts = chatMemoryStore.list(userId).map(m => m.text);
    expect(texts.some(t => t.includes('2nd Semester AY 2026-2027'))).toBe(true);
    expect(texts.some(t => t.includes('1st Semester AY 2026-2027'))).toBe(
      false,
    );
  });

  test('LEGACY_ACADEMIC_TEXT blocks orphaned current COR text when school features are disabled', () => {
    const userId = makeStudent('legacy-guard');
    chooseNotUstpMode(userId);
    chatMemoryStore.setEnabled(userId, true);
    chatMemoryStore.add(
      userId,
      'Academic profile (from my reviewed COR): BSIT, 3rd Year.',
    );
    chatMemoryStore.add(
      userId,
      'Enrolled subjects (1st Semester AY 2026-2027): IT311.',
    );
    chatMemoryStore.add(userId, 'Likes dark roast coffee.');

    const promptTexts = memoriesForPrompt(userId).map(m => m.text);
    expect(promptTexts).toEqual(['Likes dark roast coffee.']);
  });

  test('resetPersonalData clears studentSetupStore identity/goal/explicit flags cleanly', () => {
    const userId = makeStudent('reset-setup');
    userStore.setCurrentUser(userId);
    studentSetupStore.update(userId, {
      affiliation: 'not_ustp',
      preferredName: 'Mina',
      tone: 'casual',
      goal: 'schedule',
      responseStyle: 'short',
      explicit: ['name', 'tone', 'goal', 'response'],
    });
    saveOnboardingMemories(userId, {preferredName: 'Mina', tone: 'casual'}, [
      'evening',
    ]);

    const auth = authorizeDataReset(userId);
    const res = resetPersonalData(auth);
    expect(res).toMatchObject({admitted: true, defaults: 'cleared'});
    const setup = studentSetupStore.get(userId);
    expect(setup.preferredName).toBe('');
    expect(setup.tone).toBeNull();
    expect(setup.goal).toBeNull();
    expect(setup.responseStyle).toBeNull();
    expect(setup.explicit).toEqual([]);
    expect(chatMemoryStore.list(userId)).toEqual([]);
  });

  test('reconcileDeletedMemory & reconcileClearedMemories sync onboarding identity', () => {
    const userId = makeStudent('reconcile');
    studentSetupStore.update(userId, {
      preferredName: 'Noah',
      tone: 'professional',
      goal: 'deadlines',
      explicit: ['name', 'tone', 'goal'],
    });
    saveOnboardingMemories(
      userId,
      {preferredName: 'Noah', tone: 'professional'},
      ['morning'],
    );
    const nameRow = chatMemoryStore
      .list(userId)
      .find(m => m.text === 'Prefers to be called Noah.');
    expect(nameRow).toBeDefined();
    chatMemoryStore.remove(userId, nameRow!.id);
    reconcileDeletedMemory(userId, nameRow!.id);
    expect(studentSetupStore.get(userId).preferredName).toBe('');

    chatMemoryStore.clear(userId);
    reconcileClearedMemories(userId);
    expect(studentSetupStore.get(userId).tone).toBeNull();
    expect(studentSetupStore.get(userId).goal).toBeNull();
  });

  test('guestMigration inherits memory opt-out, deduplicates memories, and blocks COR leak into non-USTP account', async () => {
    userStore.createGuestUser();
    userStore.setCurrentUser(GUEST_USER_ID);
    chatMemoryStore.clear(GUEST_USER_ID);
    personalMemoryStore.clearForDataReset(GUEST_USER_ID);
    studentSetupStore.clear(GUEST_USER_ID);
    corImportStore.clear(GUEST_USER_ID);

    chooseUstpMode(GUEST_USER_ID);
    corImportStore.commitDraft(GUEST_USER_ID, makeCorDraft(GUEST_USER_ID));
    refreshAcademicMemories(GUEST_USER_ID);
    chatMemoryStore.add(GUEST_USER_ID, 'Studies in quiet libraries.');
    chatMemoryStore.setEnabled(GUEST_USER_ID, false);

    const cloudUser = makeStudent('cloud-non-ustp');
    chooseNotUstpMode(cloudUser);
    chatMemoryStore.add(cloudUser, 'studies in quiet libraries');

    await guestMigration.linkGuestToCloudAccount(
      cloudUser,
      `${cloudUser}@example.test`,
    );

    // Explicit guest memory opt-out carried over because cloud had no explicit setting.
    expect(chatMemoryStore.isEnabled(cloudUser)).toBe(false);
    // Guest setting row was cleaned up.
    expect(chatMemoryStore.isEnabled(GUEST_USER_ID)).toBe(true);
    // Non-USTP cloud account stays non-USTP and guest COR academic memories are purged.
    expect(getUstpEligibility(cloudUser).eligible).toBe(false);
    const cloudMemories = chatMemoryStore.list(cloudUser);
    expect(
      cloudMemories.filter(m => /quiet libraries/i.test(m.text)),
    ).toHaveLength(1);
    expect(
      cloudMemories.some(m => m.text.includes('Information Technology')),
    ).toBe(false);
  });
});

describe('Bounded behaviorStore & adaptive ML growth insights', () => {
  test('filters behavior logs by owner at SQL level and provides transparent ML growth insights', () => {
    const studentA = makeStudent('ml-a');
    const studentB = makeStudent('ml-b');
    preferencesStore.save(studentA, {
      wakeTime: '07:00',
      sleepTime: '23:00',
      studyPeakHours: ['evening'],
      busiestDay: 'Wednesday',
      reminderLeadMinutes: 15,
      snoozeTendency: 'immediate',
      weeklyClassCount: '4-6',
      longestClassGap: '1 hour',
    });

    for (let i = 0; i < 6; i += 1) {
      recordReminderInteraction(studentA, {
        reminderId: `rem-a-${i}`,
        outcome: 'acknowledged',
        latencySeconds: 18,
        channel: 'notification',
      });
    }
    recordReminderInteraction(studentB, {
      reminderId: 'rem-b-0',
      outcome: 'missed',
      latencySeconds: 300,
    });

    const aLogs = behaviorStore.getBehaviorLogs(
      studentA,
      'reminder_interaction',
    );
    expect(aLogs).toHaveLength(6);
    expect(aLogs.every(l => l.userId === studentA)).toBe(true);

    const insights = getAdaptiveGrowthInsights(studentA);
    expect(insights.mlReady).toBe(true);
    expect(insights.totalSamples).toBe(6);
    expect(insights.ackRate).toBe(1);
    expect(insights.preferredChannel).toBe('notification');
  });
});
