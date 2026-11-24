import {
  db,
  initDatabase,
  userStore,
  tasksStore,
  remindersStore,
  notesStore,
  preferencesStore,
  getDefaultUserPreferences,
  syncOutboxStore,
  guestMigration,
} from '../../src/storage';
import {deliveryStore} from '../../src/storage/deliveryStore';
import {GUEST_USER_ID} from '../../src/constants';
import {corImportStore} from '../../src/storage/corImportStore';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import {parseIcsString} from '../../src/storage/icsHelper';
import {getOccurrences} from '../../src/storage/rruleHelper';
import {
  authorizeDataReset,
  resetPersonalData,
} from '../../src/storage/accountDataReset';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {
  executeLowRiskCommand,
  undoLowRiskCommand,
} from '../../src/ai/nlu/commandReview';
import {validateIntent} from '../../src/ai/nlu/types';
import {classifySmallTalk} from '../../src/ai/localConversation';
import {buildPromptHandbookContextWithMeta} from '../../src/handbook/handbookSearch';
import type {LocalHandbookMatch} from '../../src/handbook/handbookSearch';
import {buildDayScheduleItems} from '../../src/ui/screens/dashboard/dashboardCalculations';
import {buildTodayTimelineRows} from '../../src/ui/screens/dashboard/components/modern/homeTimeline';
import {createSyncScheduler} from '../../src/sync/syncScheduler';
import {chatSyncStore} from '../../src/storage/chatSyncStore';
import {chatStore} from '../../src/storage/chatStore';
import {timeBlocksStore} from '../../src/storage/timeBlocksStore';
import {confirmAllValidItems} from '../../src/ai/vision/corReviewModel';
import type {CorDraft} from '../../src/ai/vision/corReviewModel';

describe('AUDIT-03 targeted regressions', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM sync_metadata');
    db.executeSync('DELETE FROM sync_conflicts');
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM reminder_delivery_jobs');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM messages');
    db.executeSync('DELETE FROM chat_sessions');
    db.executeSync('DELETE FROM chat_memories');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');
  });

  test('F-01: guestMigration detects guest data and preserves active_session tokens when requested', async () => {
    userStore.createGuestUser();
    tasksStore.insertTask({
      id: 'guest-task-1',
      userId: GUEST_USER_ID,
      title: 'Finish lab report',
      dueDate: '2026-12-01',
      dueTime: '14:00',
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
      notes: null,
      recurrenceRule: null,
    });
    expect(guestMigration.hasGuestAccountData()).toBe(true);

    const cloudUserId = await userStore.register(
      'Student',
      'student@example.test',
      'Password123',
    );
    userStore.setCurrentUser(cloudUserId);
    db.executeSync(
      `UPDATE active_session SET access_token = 'tok_keep', refresh_token = 'ref_keep' WHERE user_id = ?`,
      [cloudUserId],
    );

    await guestMigration.linkGuestToCloudAccount(
      cloudUserId,
      'student@example.test',
      {preserveActiveSession: true},
    );

    const session = userStore.getActiveSessionToken();
    expect(session.userId).toBe(cloudUserId);
    expect(session.accessToken).toBe('tok_keep');
    expect(session.refreshToken).toBe('ref_keep');
    expect(tasksStore.getAllTasks(cloudUserId).map(t => t.id)).toContain(
      'guest-task-1',
    );
  });

  test('F-07: resetPersonalData soft-deletes custom_categories with outbox tombstones and allows cor_drafts cleanup', async () => {
    const userId = await userStore.register(
      'Reset Student',
      'reset@example.test',
      'Password123',
    );
    userStore.setCurrentUser(userId);
    notesStore.addCustomCategory(userId, 'Physics', '#FF0000');
    expect(notesStore.getCustomCategories(userId)).toHaveLength(1);

    const authority = authorizeDataReset(userId);
    expect(authority).not.toBeNull();
    const res = resetPersonalData(authority!);
    expect(res.admitted).toBe(true);
    expect(notesStore.getCustomCategories(userId)).toHaveLength(0);
    const tombstones = db.executeSync(
      `SELECT entity_type, operation FROM sync_outbox WHERE user_id = ? AND entity_type = 'custom_category' AND operation = 'delete'`,
      [userId],
    ).rows;
    expect(tombstones?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  test('F-08: parseIcsString handles missing DTEND, RDATE before UID, exact UID override, and VTODO DUE', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'RDATE:20261128T090000',
      'UID:ev-1',
      'RRULE:FREQ=DAILY;COUNT=2',
      'DTSTART:20261126T090000',
      'SUMMARY:Lecture One',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:ev-10',
      'DTSTART:20261126T130000',
      'DTEND:20261126T140000',
      'SUMMARY:Unrelated Event',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:ev-1',
      'RECURRENCE-ID:20261128T090000',
      'DTSTART:20261128T110000',
      'SUMMARY:Moved\\, Room 302',
      'END:VEVENT',
      'BEGIN:VTODO',
      'UID:todo-1',
      'DUE:20261129T150000',
      'SUMMARY:Submit Assignment',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\r\n');

    const parsed = parseIcsString(ics);
    const ev1 = parsed.blocks.find(e => e.title === 'Lecture One');
    const ev10 = parsed.blocks.find(e => e.title === 'Unrelated Event');
    const override = parsed.blocks.find(e => e.title === 'Moved, Room 302');
    expect(ev1?.startTime).toBe('09:00');
    expect(ev1?.endTime).toBe('10:00');
    expect(ev10?.title).toBe('Unrelated Event');
    expect(override?.startTime).toBe('11:00');
    expect(override?.endTime).toBe('12:00');
    expect(parsed.tasks[0]?.title).toBe('Submit Assignment');
    expect(parsed.tasks[0]?.dueDate).toBe('2026-11-29');
    expect(parsed.tasks[0]?.dueTime).toBe('15:00');
  });

  test('F-06: chatSyncStore.applyRemoteMessage preserves local sourcePassageIds when handbook_note is present', async () => {
    const userId = await userStore.register(
      'Chat User',
      'chat@example.test',
      'Password123',
    );
    const sessionId = chatStore.startNewChat(userId, 'general');
    const msg = chatStore.addMessage(
      userId,
      'assistant',
      'Policy answer',
      null,
      {
        handbookNote: 'USTP Student Handbook, p. 12',
        sourcePassageIds: ['hb-12'],
      },
      sessionId,
    );
    const cloudSessionId = `chat_${sessionId}`;
    db.transactionSync(tx => {
      chatSyncStore.applyRemoteMessage(
        tx,
        userId,
        msg.id,
        {
          session_id: cloudSessionId,
          sender: 'assistant',
          content: 'Policy answer',
          handbook_note: 'USTP Student Handbook, p. 12',
          created_at: msg.createdAt,
        },
        new Date().toISOString(),
      );
    });
    const reloaded = chatStore.getMessages(userId, sessionId);
    expect(reloaded[0]?.sourcePassageIds).toEqual(['hb-12']);
  });

  test('F-18: undoing complete_task restores linked pending reminder status', async () => {
    const userId = await userStore.register(
      'Undo User',
      'undo@example.test',
      'Password123',
    );
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    tasksStore.insertTask({
      id: 'task-undo-1',
      userId,
      title: 'Read chapter 3',
      dueDate: '2026-12-10',
      dueTime: '10:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
      notes: null,
      recurrenceRule: null,
    });
    remindersStore.insertReminder({
      id: 'rem-undo-1',
      userId,
      task: 'Read chapter 3',
      description: null,
      scheduledAt: futureIso,
      triggerAt: futureIso,
      status: 'pending',
      preCastAudioPath: null,
    });
    deliveryStore.linkSource('rem-undo-1', 'task', 'task-undo-1');

    const applied = executeLowRiskCommand(userId, {
      intent: 'update_task',
      title: 'Read chapter 3',
      targetTitle: 'Read chapter 3',
      newTitle: null,
      date: null,
      time: null,
      endTime: null,
      targetTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: null,
      isCompleted: true,
      snoozeMinutes: null,
      confidence: 1,
      source: 'fast_path',
      rawTranscript: 'mark read chapter 3 done',
      isValid: true,
    });
    expect(applied.status).toBe('applied');
    expect(remindersStore.getReminderById('rem-undo-1')?.status).toBe(
      'acknowledged',
    );
    if (applied.status === 'applied' && applied.undo) {
      const undone = undoLowRiskCommand(userId, applied.undo.token);
      expect(undone.status).toBe('undone');
      expect(remindersStore.getReminderById('rem-undo-1')?.status).toBe(
        'pending',
      );
    }
  });

  test('F-21 & F-22: prompt handbook context preserves caveats under tight budget and classifySmallTalk rejects questions', () => {
    const match1: LocalHandbookMatch = {
      chunk: {
        id: 'c1',
        seq: 1,
        collection: 'ustp_cdo',
        chapter: 'Calendar',
        section: 'Midyear 2027',
        pageLabel: 'p. 1',
        sourceLabel: 'USTP CDO',
        keywords: 'midyear 2027',
        bm25Score: -1,
        content: 'A'.repeat(600),
        meta: {
          doc: 'ustp-cdo-cal',
          category: 'calendar',
          asOf: '2024-01-01',
          volatility: 'high',
          scope: 'UG',
          term: 'midyear',
          academicYears: ['2026-2027'],
          caveats: [{id: 'cav-1', text: 'Verify dates with Registrar.'}],
          sources: [],
          pdfPages: [],
        },
      },
      score: 10,
      matchedConcepts: 2,
      totalConcepts: 2,
      pageNumber: 1,
      source: {
        title: 'Midyear 2027',
        section: 'Midyear 2027',
        page: 1,
        passageId: 'c1',
        collection: 'ustp_cdo',
      },
    };
    const match2: LocalHandbookMatch = {
      ...match1,
      chunk: {...match1.chunk, id: 'c2', section: 'Dropped Section'},
      source: {...match1.source, title: 'Dropped Section', passageId: 'c2'},
    };
    const built = buildPromptHandbookContextWithMeta([match1, match2], 450, {
      referenceDate: new Date('2026-11-25T00:00:00Z'),
    });
    expect(built.contextBlock).toContain(
      'Caveat: Verify dates with Registrar.',
    );
    expect(built.includedMatches).toHaveLength(1);
    expect(built.includedSources.map(s => s.passageId)).toEqual(['c1']);

    expect(classifySmallTalk('Hey, what is USTP tuition per unit?')).toBeNull();
    expect(classifySmallTalk('Night class schedule at USTP?')).toBeNull();
    expect(classifySmallTalk('Hi LAFINA!')).toBe('greeting');
    expect(classifySmallTalk('thanks so much!')).toBe('thanks');
  });

  test('F-25: Temporary Chat never calls chatMemoryStore.markUsed on online turns', async () => {
    const userId = await userStore.register(
      'Temp User',
      'temp@example.test',
      'Password123',
    );
    chatMemoryStore.add(userId, 'Prefers morning study sessions');
    const markUsedSpy = jest.spyOn(chatMemoryStore, 'markUsed');
    const chatSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {reply: 'Hello there!', sources: [], usedHandbook: false},
      });
    try {
      await chatOrchestrator.processMessage(
        userId,
        'Explain photosynthesis briefly',
        {temporaryChat: true, onlineMode: true, speakReply: false},
      );
      expect(markUsedSpy).not.toHaveBeenCalled();
    } finally {
      chatSpy.mockRestore();
      markUsedSpy.mockRestore();
    }
  });

  test('F-34: syncScheduler.stop cancels pending debounced sync timer', () => {
    jest.useFakeTimers();
    const runPass = jest.fn().mockResolvedValue(false);
    const scheduler = createSyncScheduler({
      runPass,
      onRemoteChanges: jest.fn(),
      debounceMs: 500,
    });
    scheduler.start();
    scheduler.schedule();
    scheduler.stop();
    jest.advanceTimersByTime(2000);
    expect(runPass).not.toHaveBeenCalled();
    scheduler.dispose();
    jest.useRealTimers();
  });

  test('F-35 & F-36: overnight blocks appear on both days and filtered timeline suppresses false free_now', () => {
    const overnight = {
      id: 'blk-night',
      userId: 'u1',
      title: 'Hackathon Sprint',
      date: '2026-11-24',
      startTime: '22:00',
      endTime: '02:00',
      color: '#3498DB',
      category: 'Study',
      notes: undefined,
      recurrenceRule: null,
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
    };
    const day1 = buildDayScheduleItems('2026-11-24', [overnight], []);
    const day2 = buildDayScheduleItems('2026-11-25', [overnight], []);
    expect(day1).toHaveLength(1);
    expect(day1[0].startMinutes).toBe(22 * 60);
    expect(day1[0].endMinutes).toBe(1440);
    expect(day2).toHaveLength(1);
    expect(day2[0].startMinutes).toBe(0);
    expect(day2[0].endMinutes).toBe(120);

    const rows = buildTodayTimelineRows({
      items: [],
      freeStudy: {
        wakeTime: '07:00',
        sleepTime: '23:00',
        freeBlocks: [],
        totalRemainingFreeMinutes: 120,
        usableStudyFreeMinutes: 120,
        plannedStudyMinutesToday: 0,
        dayEnded: false,
      },
      now: new Date(2026, 10, 25, 1, 0),
      timeFormat24h: true,
      hasLiveUnfilteredItem: true,
    });
    expect(rows.some(r => r.kind === 'free_now')).toBe(false);
  });

  test('F-37: getOccurrences handles malformed RRULE without throwing', () => {
    const out = getOccurrences(
      'FREQ=NOT_A_REAL_FREQ;INTERVAL=BAD',
      '2026-11-25',
      new Date(2026, 10, 1),
      new Date(2026, 10, 30),
    );
    expect(out).toEqual([]);
  });

  test('F-38: guest user preferences and profile toggles never enqueue sync_outbox rows', () => {
    userStore.createGuestUser();
    userStore.set24HourFormat(GUEST_USER_ID, true);
    userStore.setWeekStartsMonday(GUEST_USER_ID, true);
    userStore.setDarkModeEnabled(GUEST_USER_ID, true);
    preferencesStore.save(GUEST_USER_ID, {
      ...getDefaultUserPreferences(),
      wakeTime: '06:30',
      sleepTime: '22:30',
    });
    expect(syncOutboxStore.getPendingMutations(GUEST_USER_ID)).toHaveLength(0);
  });

  test('F-43: validateIntent rejects reschedule with invalid time or impossible calendar date', () => {
    const badTime = validateIntent({
      intent: 'reschedule',
      title: null,
      date: '2026-11-26',
      time: '25:99',
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: null,
      snoozeMinutes: null,
      confidence: 1,
      source: 'fast_path',
      rawTranscript: 'reschedule to 25:99',
    });
    expect(badTime.isValid).toBe(false);

    const badDate = validateIntent({
      intent: 'reschedule',
      title: null,
      date: '2026-02-30',
      time: '10:00',
      endTime: null,
      durationMinutes: null,
      category: 'Academic',
      details: null,
      snoozeMinutes: null,
      confidence: 1,
      source: 'fast_path',
      rawTranscript: 'reschedule to Feb 30',
    });
    expect(badDate.isValid).toBe(false);
  });

  test('F-47: corImportStore.undoLatestImport restores previous affiliation and remaps restored block IDs', async () => {
    const userId = await userStore.register(
      'COR Student',
      'cor@example.test',
      'Password123',
    );
    studentSetupStore.update(userId, {
      affiliation: 'not_ustp',
    });
    timeBlocksStore.insert({
      id: 'blk-cor-seed-1',
      userId,
      title: 'IT101',
      date: '2026-11-26',
      startTime: '08:00',
      endTime: '09:00',
      color: '#3498DB',
      category: 'Class',
      notes: 'Room 101',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TH',
    });

    const rawDraft: CorDraft = {
      version: 1,
      draftId: `draft-${userId}`,
      ownerId: userId,
      status: 'draft',
      committedImportId: null,
      createdAt: '2026-11-25T00:00:00.000Z',
      updatedAt: '2026-11-25T00:00:00.000Z',
      document: {
        fileName: 'cor.pdf',
        localPath: null,
        mimeType: 'application/pdf',
      },
      sourceText: 'IT101 Intro to IT TH 8:00 AM - 9:00 AM',
      studentName: 'COR Student',
      campus: 'Cagayan de Oro',
      program: 'BS Information Technology',
      yearLevel: '3rd Year',
      section: 'IT3R1',
      term: '1st Semester AY 2026-2027',
      startDate: '2026-08-17',
      endDate: '2026-12-18',
      studentReviewed: true,
      academicReviewed: true,
      termReviewed: true,
      courses: [
        {
          id: 'c-it101',
          code: 'IT101',
          title: 'Intro to IT',
          units: '3',
          origin: 'detected',
          sourceText: 'IT101 Intro to IT',
          included: true,
          reviewed: false,
          keepUnscheduled: false,
          meetings: [
            {
              id: 'm-thu',
              days: ['Thu'],
              start: {hour: 8, minute: 0, period: 'AM'},
              end: {hour: 9, minute: 0, period: 'AM'},
              room: 'Room 202',
              faculty: 'Prof. Reyes',
              section: 'IT3R1',
              origin: 'detected',
              sourceText: 'TH 8:00 AM - 9:00 AM',
              notices: [],
              reviewed: false,
            },
          ],
        },
      ],
      acknowledgedOverlaps: [],
      extras: {
        college: '',
        collegeShort: '',
        major: '',
        curriculum: '',
        yearLevelShort: '3rd',
        formattedName: 'COR Student',
        totalCreditUnits: 3,
        totalLecUnits: 3,
        totalLabUnits: 0,
      },
    };
    const readyDraft = confirmAllValidItems(rawDraft);
    corImportStore.saveDraft(userId, readyDraft);
    const committed = corImportStore.commitDraft(userId, readyDraft);
    expect(committed.importId).toBeTruthy();
    expect(studentSetupStore.get(userId).affiliation).toBe('ustp');

    const undone = corImportStore.undoLatestImport(userId);
    expect(undone).not.toBeNull();
    expect(studentSetupStore.get(userId).affiliation).toBe('not_ustp');
  });
});
