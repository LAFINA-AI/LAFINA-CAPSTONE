import {
  alarmsStore,
  chatMemoryStore,
  chatStore,
  db,
  enterPresentationSandbox,
  exitPresentationSandbox,
  initDatabase,
  localSettingsStore,
  materialStore,
  notesStore,
  presentationModeStore,
  recordedMeetingStore,
  refreshPresentationSandbox,
  remindersStore,
  syncOutboxStore,
  syncStateStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {reminderDeliveryStyleStore} from '../../src/storage/reminderDeliveryStyleStore';
import {syncWorker} from '../../src/sync/syncWorker';
import {syncState} from '../../src/sync/syncState';
import {cloudClient} from '../../src/cloud/cloudClient';

let serial = 0;

const createTestOwner = (label: string): string => {
  serial += 1;
  const id = `pres01-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (
       id, username, email, role, is_new_user, time_format_24h, week_starts_monday,
       dark_mode, avatar_seed, created_at, updated_at
     ) VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?, ?)`,
    [id, `Real ${label}`, `${id}@example.invalid`, 'orig-seed', now, now],
  );
  return id;
};

const seedRealOwnerData = (userId: string) => {
  const now = new Date().toISOString();
  userStore.setCurrentUser(userId);
  syncOutboxStore.setSuppression(userId, false);

  notesStore.addCustomCategory(userId, 'RealCat', '#112233');
  tasksStore.insertTask({
    id: `${userId}-real-task`,
    userId,
    title: 'Real student thesis draft',
    dueDate: '2030-05-01',
    dueTime: '14:00',
    isCompleted: false,
    priority: 'High',
    category: 'RealCat',
    notes: 'Original task note',
    recurrenceRule: null,
  });
  tasksStore.insertEvent({
    id: `${userId}-real-event`,
    userId,
    title: 'Real midterm exam',
    date: '2030-05-02',
    startTime: '09:00',
    endTime: '11:00',
    location: 'Room 101',
    linkedCalendarBlock: null,
    recurrenceRule: null,
  });
  db.executeSync(
    `INSERT OR REPLACE INTO event_time_local (
       event_id, user_id, time_zone, start_at, end_at, start_fold, end_fold,
       base_date, base_start_time, base_end_time, recorded_at
     ) VALUES (?, ?, 'Asia/Manila', '2030-05-02T01:00:00.000Z', '2030-05-02T03:00:00.000Z',
       NULL, NULL, '2030-05-02', '09:00', '11:00', ?)`,
    [`${userId}-real-event`, userId, now],
  );
  timeBlocksStore.insert({
    id: `${userId}-real-block`,
    userId,
    title: 'Real class block',
    date: '2030-05-02',
    startTime: '13:00',
    endTime: '14:30',
    color: '#2563EB',
    category: 'Class',
    notes: 'Room: ICT-101',
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
  });
  remindersStore.insertReminder({
    id: `${userId}-real-rem`,
    userId,
    task: 'Real reminder call',
    description: 'Bring ID',
    scheduledAt: now,
    triggerAt: '2030-05-02T08:00:00.000Z',
    status: 'pending',
    preCastAudioPath: null,
  });
  reminderDeliveryStyleStore.set(`${userId}-real-rem`, 'notify');
  alarmsStore.create(userId, {
    hour: 6,
    minute: 30,
    repeatDays: 31,
    label: 'Real morning alarm',
    enabled: true,
    briefing: true,
  });
  notesStore.insert({
    id: `${userId}-real-note`,
    userId,
    title: 'Real personal note',
    body: '# Real Note\nOriginal markdown body',
    isPinned: true,
    tags: ['real'],
    category: 'RealCat',
    isVoiceTranscribed: false,
  });

  const sessionId = chatStore.currentSessionId(userId);
  chatStore.addMessage(
    userId,
    'user',
    'Original question',
    null,
    null,
    sessionId,
  );
  chatStore.addMessage(
    userId,
    'assistant',
    'Original answer',
    null,
    null,
    sessionId,
  );
  chatMemoryStore.add(userId, 'Prefers morning study', {
    tier: 'preference',
    category: 'study',
    isPinned: true,
  });

  recordedMeetingStore.create({
    id: `${userId}-real-meeting`,
    userId,
    title: 'Real adviser meeting',
  });
  recordedMeetingStore.update(`${userId}-real-meeting`, {
    status: 'completed',
    durationSeconds: 300,
    transcript: [
      {startMs: 0, endMs: 4000, text: 'Original meeting transcript'},
    ],
  });

  materialStore.ensureFtsIndex();
  materialStore.saveMaterialWithChunks(
    userId,
    {
      id: `${userId}-real-mat`,
      title: 'Real Lesson PDF',
      fileName: 'real.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: `sha-${userId}`,
      pageCount: 2,
      pagesRead: 2,
      ocrPages: 0,
      totalChars: 64,
      outline: [{heading: 'Intro', pageNumber: 1, pageLabel: 'p. 1'}],
    },
    [
      {
        seq: 1,
        heading: 'Intro',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'real_unique_token',
        content: 'Original lesson material with real_unique_token inside.',
      },
    ],
  );
  materialStore.addMessage(userId, {
    scopeKey: `${userId}-real-mat`,
    sender: 'user',
    content: 'What is in my real PDF?',
  });

  localSettingsStore.set(
    userId,
    'skills.decks.v1',
    JSON.stringify([{id: 'real-deck', title: 'Real Flashcards', cards: []}]),
  );
  localSettingsStore.set(
    userId,
    'academic.profile.v1',
    JSON.stringify({program: 'Real Program'}),
  );
  localSettingsStore.set(userId, 'onlineVoice.voiceId', 'keep-my-voice-id');

  syncStateStore.save(userId, {
    status: 'Synced',
    cursor: 42,
    lastSyncedAt: now,
    errorMessage: null,
  });
};

describe('Presentation Mode snapshot engine, sync gate, and lifecycle (PRES-01)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    const activeOwner = presentationModeStore.findActiveOwner();
    if (activeOwner) {
      exitPresentationSandbox(activeOwner);
    }
  });

  it('snapshots all owner tables, pauses outbox during presentation, and restores verbatim on exit', () => {
    const owner = createTestOwner('roundtrip');
    seedRealOwnerData(owner);

    const outboxBefore = syncOutboxStore.getPendingMutations(owner).length;
    expect(outboxBefore).toBeGreaterThan(0);

    const entered = enterPresentationSandbox(owner, tx => {
      tasksStore.insertTask(
        {
          id: `${owner}-demo-task`,
          userId: owner,
          title: 'Defense Demo Task',
          dueDate: '2030-06-01',
          dueTime: '10:00',
          isCompleted: false,
          priority: 'High',
          category: 'Capstone',
          notes: 'Demo note',
          recurrenceRule: null,
        },
        tx,
      );
      localSettingsStore.set(
        owner,
        'skills.decks.v1',
        JSON.stringify([{id: 'demo-deck', title: 'Demo Deck', cards: []}]),
      );
    });

    expect(entered.entered).toBe(true);
    expect(entered.alreadyActive).toBe(false);
    expect(presentationModeStore.isActive(owner)).toBe(true);
    expect(presentationModeStore.hasSnapshot(owner)).toBe(true);
    expect(syncOutboxStore.isSuppressed(owner)).toBe(true);
    expect(syncOutboxStore.getPendingMutations(owner)).toHaveLength(0);

    // Real data is replaced by demo data while unmanaged settings remain intact.
    expect(tasksStore.getAllTasks(owner).map(t => t.title)).toEqual([
      'Defense Demo Task',
    ]);
    expect(notesStore.getAll(owner)).toHaveLength(0);
    expect(recordedMeetingStore.list(owner)).toHaveLength(0);
    expect(localSettingsStore.get(owner, 'onlineVoice.voiceId')).toBe(
      'keep-my-voice-id',
    );

    // Live mutations made during defense work normally without enqueuing cloud sync mutations.
    tasksStore.insertTask({
      id: `${owner}-live-defense-task`,
      userId: owner,
      title: 'Live task added during Q&A',
      dueDate: '2030-06-02',
      dueTime: '15:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Capstone',
      notes: null,
      recurrenceRule: null,
    });
    expect(tasksStore.getAllTasks(owner)).toHaveLength(2);
    expect(syncOutboxStore.getPendingMutations(owner)).toHaveLength(0);

    // Calling enter again must NOT overwrite the real snapshot.
    const secondEnter = enterPresentationSandbox(owner);
    expect(secondEnter.entered).toBe(false);
    expect(secondEnter.alreadyActive).toBe(true);

    // Exit restores every single table, child table, FTS index, outbox, sync state, and managed settings.
    const exited = exitPresentationSandbox(owner);
    expect(exited.restored).toBe(true);
    expect(exited.hadSnapshot).toBe(true);
    expect(presentationModeStore.isActive(owner)).toBe(false);
    expect(presentationModeStore.hasSnapshot(owner)).toBe(false);
    expect(syncOutboxStore.isSuppressed(owner)).toBe(false);

    expect(tasksStore.getAllTasks(owner).map(t => t.title)).toEqual([
      'Real student thesis draft',
    ]);
    expect(tasksStore.getAllEvents(owner).map(e => e.title)).toEqual([
      'Real midterm exam',
    ]);
    const eventTimeRow = db.executeSync(
      'SELECT time_zone FROM event_time_local WHERE event_id = ?',
      [`${owner}-real-event`],
    ).rows?.[0];
    expect(eventTimeRow?.time_zone).toBe('Asia/Manila');

    expect(timeBlocksStore.getAll(owner).map(b => b.title)).toEqual([
      'Real class block',
    ]);
    expect(remindersStore.getAllReminders(owner).map(r => r.task)).toEqual([
      'Real reminder call',
    ]);
    expect(reminderDeliveryStyleStore.get(`${owner}-real-rem`)).toBe('notify');
    expect(alarmsStore.list(owner).map(a => a.label)).toEqual([
      'Real morning alarm',
    ]);
    expect(notesStore.getAll(owner).map(n => n.title)).toEqual([
      'Real personal note',
    ]);
    expect(recordedMeetingStore.list(owner).map(m => m.title)).toEqual([
      'Real adviser meeting',
    ]);

    const restoredSessionId = chatStore.currentSessionId(owner);
    const messages = chatStore.getMessages(owner, restoredSessionId);
    expect(messages.map(m => m.content)).toEqual([
      'Original question',
      'Original answer',
    ]);
    expect(chatMemoryStore.list(owner).map(m => m.text)).toContain(
      'Prefers morning study',
    );

    expect(materialStore.listMaterials(owner).map(m => m.title)).toEqual([
      'Real Lesson PDF',
    ]);
    const hits = materialStore.queryFts(owner, 'real_unique_token');
    expect(hits.length).toBeGreaterThan(0);
    expect(materialStore.listMessages(owner, `${owner}-real-mat`)).toHaveLength(
      1,
    );

    expect(localSettingsStore.get(owner, 'skills.decks.v1')).toContain(
      'Real Flashcards',
    );
    expect(localSettingsStore.get(owner, 'academic.profile.v1')).toContain(
      'Real Program',
    );
    expect(localSettingsStore.get(owner, 'onlineVoice.voiceId')).toBe(
      'keep-my-voice-id',
    );
    expect(syncOutboxStore.getPendingMutations(owner)).toHaveLength(
      outboxBefore,
    );
    expect(syncStateStore.load(owner).cursor).toBe(42);
    expect(userStore.getUserById(owner)?.username).toBe('Real roundtrip');
  });

  it('refreshes presentation data cleanly without disturbing the saved original backup', () => {
    const owner = createTestOwner('refresh');
    seedRealOwnerData(owner);

    enterPresentationSandbox(owner, tx => {
      tasksStore.insertTask(
        {
          id: `${owner}-seed-v1`,
          userId: owner,
          title: 'Seed V1',
          dueDate: null,
          dueTime: null,
          isCompleted: false,
          priority: 'Low',
          category: 'General',
          notes: null,
          recurrenceRule: null,
        },
        tx,
      );
    });

    // Simulate edits during a dry run.
    tasksStore.insertTask({
      id: `${owner}-dryrun-edit`,
      userId: owner,
      title: 'Dry run extra task',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Low',
      category: 'General',
      notes: null,
      recurrenceRule: null,
    });
    expect(tasksStore.getAllTasks(owner)).toHaveLength(2);

    const refreshed = refreshPresentationSandbox(
      owner,
      tx => {
        tasksStore.insertTask(
          {
            id: `${owner}-seed-v2`,
            userId: owner,
            title: 'Fresh Defense Seed',
            dueDate: null,
            dueTime: null,
            isCompleted: false,
            priority: 'High',
            category: 'Capstone',
            notes: null,
            recurrenceRule: null,
          },
          tx,
        );
      },
      '2030-07-01T08:00:00.000Z',
    );

    expect(refreshed.refreshed).toBe(true);
    expect(refreshed.state.lastRefreshedAt).toBe('2030-07-01T08:00:00.000Z');
    expect(tasksStore.getAllTasks(owner).map(t => t.title)).toEqual([
      'Fresh Defense Seed',
    ]);

    // Exiting still restores the original pre-presentation data.
    exitPresentationSandbox(owner);
    expect(tasksStore.getAllTasks(owner).map(t => t.title)).toEqual([
      'Real student thesis draft',
    ]);
  });

  it('rolls back completely if seeding throws during enterPresentationSandbox', () => {
    const owner = createTestOwner('rollback');
    seedRealOwnerData(owner);

    expect(() =>
      enterPresentationSandbox(owner, () => {
        throw new Error('Simulated seed failure');
      }),
    ).toThrow('Simulated seed failure');

    expect(presentationModeStore.isActive(owner)).toBe(false);
    expect(presentationModeStore.hasSnapshot(owner)).toBe(false);
    expect(syncOutboxStore.isSuppressed(owner)).toBe(false);
    expect(tasksStore.getAllTasks(owner).map(t => t.title)).toEqual([
      'Real student thesis draft',
    ]);
  });

  it('pauses syncWorker.performSync while Presentation Mode is active', async () => {
    const owner = createTestOwner('syncgate');
    seedRealOwnerData(owner);

    const isOnlineSpy = jest.spyOn(cloudClient, 'isOnline');
    enterPresentationSandbox(owner);

    await syncWorker.performSync();

    expect(isOnlineSpy).not.toHaveBeenCalled();
    expect(syncState.getState().status).toBe('Local only');
  });

  it('auto-restores real data on logout and when switching to a different account, but preserves state for same-user re-auth', () => {
    const ownerA = createTestOwner('ownerA');
    const ownerB = createTestOwner('ownerB');
    seedRealOwnerData(ownerA);
    seedRealOwnerData(ownerB);
    userStore.setCurrentUser(ownerA);

    enterPresentationSandbox(ownerA);
    expect(presentationModeStore.isActive(ownerA)).toBe(true);
    expect(tasksStore.getAllTasks(ownerA)).toHaveLength(0);
    // User B is completely untouched while User A is in Presentation Mode.
    expect(tasksStore.getAllTasks(ownerB).map(t => t.title)).toEqual([
      'Real student thesis draft',
    ]);

    // Re-setting the same user keeps Presentation Mode active.
    userStore.setCurrentUser(ownerA);
    expect(presentationModeStore.isActive(ownerA)).toBe(true);

    // Switching to another account restores Owner A cleanly.
    userStore.setCurrentUser(ownerB);
    expect(presentationModeStore.isActive(ownerA)).toBe(false);
    expect(syncOutboxStore.isSuppressed(ownerA)).toBe(false);
    expect(tasksStore.getAllTasks(ownerA).map(t => t.title)).toEqual([
      'Real student thesis draft',
    ]);

    // Logout also restores active presentation owner.
    enterPresentationSandbox(ownerB);
    expect(presentationModeStore.isActive(ownerB)).toBe(true);
    userStore.logout();
    expect(presentationModeStore.isActive(ownerB)).toBe(false);
    expect(syncOutboxStore.isSuppressed(ownerB)).toBe(false);
    expect(tasksStore.getAllTasks(ownerB).map(t => t.title)).toEqual([
      'Real student thesis draft',
    ]);
  });
});
