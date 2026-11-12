import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {executeNluAction} from '../../src/ai/nlu/actionExecutor';
import {
  confirmReviewedCommand,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {validateIntent} from '../../src/ai/nlu/types';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {
  db,
  initDatabase,
  notesStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {extractChecklistItems} from '../../src/utils';

describe('To-Do NLU, Reviewed Commands, and Chat Context', () => {
  const refDate = new Date('2026-11-12T09:00:00');
  let userId: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM messages');
    db.executeSync('DELETE FROM chat_sessions');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM users');

    const guest = userStore.createGuestUser();
    userId = guest.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('fastPathParser recognizes To-Do queries, high-priority undated additions, check-offs, and deletions without note hijacking', () => {
    const queryIntent = parseIntentFastPath(
      "What's on my to-do list?",
      refDate,
    );
    expect(queryIntent).not.toBeNull();
    expect(queryIntent?.intent).toBe('query_schedule');
    expect(queryIntent?.details).toBe('todo_list');

    const addIntent = parseIntentFastPath(
      'Add buy lab manual high priority to my to-do list',
      refDate,
    );
    expect(addIntent).not.toBeNull();
    expect(addIntent?.intent).toBe('create_task');
    expect(addIntent?.title?.toLowerCase()).toBe('buy lab manual');
    expect(addIntent?.priority).toBe('High');
    expect(addIntent?.date).toBeNull();

    const checkOffIntent = parseIntentFastPath(
      'Check off buy lab manual from my to-do list',
      refDate,
    );
    expect(checkOffIntent).not.toBeNull();
    expect(checkOffIntent?.intent).toBe('update_task');
    expect(checkOffIntent?.isCompleted).toBe(true);
    expect(checkOffIntent?.title?.toLowerCase()).toBe('buy lab manual');

    const deleteIntent = parseIntentFastPath(
      'Remove buy lab manual from my to-do list',
      refDate,
    );
    expect(deleteIntent).not.toBeNull();
    expect(deleteIntent?.intent).toBe('delete_task');
    expect(deleteIntent?.title?.toLowerCase()).toBe('buy lab manual');
  });

  test('reviewed To-Do creation preserves undated dueDate=null and priority, and query_schedule lists undated To-Dos + Note checklists', async () => {
    notesStore.insert({
      id: 'note-lab-check',
      userId,
      title: 'Lab Supplies',
      body: '- [ ] Pack scientific calculator\n- [x] Charge tablet',
      category: 'Academics',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    tasksStore.insertTask({
      id: 'task-dated-chem',
      userId,
      title: 'Submit Chem Prelab',
      dueDate: '2026-11-12',
      dueTime: '14:00',
      isCompleted: false,
      priority: 'High',
      category: 'Academics',
    });

    const addIntent = validateIntent(
      parseIntentFastPath(
        'Add buy lab manual high priority to my to-do list',
        refDate,
      )!,
    );
    const prepared = prepareReviewedCommand(userId, addIntent, {
      surface: 'chat',
      referenceDate: refDate,
    });
    expect(prepared.status).toBe('proposal');
    if (prepared.status !== 'proposal') return;
    expect(prepared.proposal.intent).toBe('create_task');
    expect(
      prepared.proposal.details.some(d => /High/i.test(d)) ||
        prepared.proposal.assumptions.some(a => /High/i.test(a)),
    ).toBe(true);
    expect(
      prepared.proposal.details.some(d => /No due date/i.test(d)) ||
        prepared.proposal.assumptions.some(a => /No due date/i.test(a)),
    ).toBe(true);

    const confirmed = confirmReviewedCommand(
      userId,
      prepared.proposal.operationId,
    );
    expect(confirmed.status).toBe('applied');

    const createdTodo = tasksStore
      .getAllTasks(userId)
      .find(t => t.title.toLowerCase() === 'buy lab manual');
    expect(createdTodo).toBeDefined();
    expect(createdTodo?.dueDate).toBeNull();
    expect(createdTodo?.dueTime).toBeNull();
    expect(createdTodo?.priority).toBe('High');

    // Query to-do list via actionExecutor
    const queryIntent = validateIntent(
      parseIntentFastPath("What's on my to-do list?", refDate)!,
    );
    const queryRes = await executeNluAction(userId, queryIntent, {
      referenceDate: refDate,
    });
    expect(queryRes.success).toBe(true);
    expect(queryRes.reply).toMatch(/buy lab manual/i);
    expect(queryRes.reply).toContain('Submit Chem Prelab');
    expect(queryRes.reply).toContain('Pack scientific calculator');
    expect(queryRes.reply).not.toContain('Charge tablet');
  });

  test('reviewed check-off completes undated To-Do, preserves dueDate=null on rename, falls back to Note checklist toggle, and supports deletion', async () => {
    tasksStore.insertTask({
      id: 'todo-keep-undated',
      userId,
      title: 'Buy lab manual',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Medium',
      category: 'Personal',
    });

    // Updating title of undated To-Do must keep dueDate=null
    const renameRes = await executeNluAction(
      userId,
      {
        intent: 'update_task',
        title: 'Buy lab manual',
        newTitle: 'Buy chemistry manual',
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Personal',
        details: null,
        snoozeMinutes: null,
        confidence: 0.9,
        source: 'fast_path',
        rawTranscript: 'Rename buy lab manual to buy chemistry manual',
        isValid: true,
      },
      {referenceDate: refDate},
    );
    expect(renameRes.success).toBe(true);
    const renamed = tasksStore
      .getAllTasks(userId)
      .find(t => t.id === 'todo-keep-undated');
    expect(renamed?.title).toBe('Buy chemistry manual');
    expect(renamed?.dueDate).toBeNull();

    // Check off task via reviewed command
    const doneIntent = validateIntent(
      parseIntentFastPath('Check off buy chemistry manual', refDate)!,
    );
    const doneDraft = prepareReviewedCommand(userId, doneIntent, {
      surface: 'chat',
      referenceDate: refDate,
    });
    expect(doneDraft.status).toBe('proposal');
    if (doneDraft.status !== 'proposal') return;
    const doneConfirmed = confirmReviewedCommand(
      userId,
      doneDraft.proposal.operationId,
    );
    expect(doneConfirmed.status).toBe('applied');
    expect(
      tasksStore.getAllTasks(userId).find(t => t.id === 'todo-keep-undated')
        ?.isCompleted,
    ).toBe(true);

    // Note checklist check-off fallback -> update_note proposal
    notesStore.insert({
      id: 'note-pack',
      userId,
      title: 'Packing List',
      body: '- [ ] Bring USB drive\n- [ ] Bring ID',
      category: 'Personal',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    const checklistDone = validateIntent(
      parseIntentFastPath('Check off Bring USB drive', refDate)!,
    );
    const noteDraft = prepareReviewedCommand(userId, checklistDone, {
      surface: 'chat',
      referenceDate: refDate,
    });
    expect(noteDraft.status).toBe('proposal');
    if (noteDraft.status !== 'proposal') return;
    expect(noteDraft.proposal.heading).toBe('Check off checklist item');
    confirmReviewedCommand(userId, noteDraft.proposal.operationId);

    const updatedNote = notesStore
      .getAll(userId)
      .find(n => n.id === 'note-pack');
    const items = extractChecklistItems(updatedNote?.body ?? '');
    expect(items.find(i => i.text === 'Bring USB drive')?.done).toBe(true);
    expect(items.find(i => i.text === 'Bring ID')?.done).toBe(false);

    // Delete To-Do via reviewed command
    const deleteIntent = validateIntent(
      parseIntentFastPath(
        'Remove buy chemistry manual from my to-do list',
        refDate,
      )!,
    );
    const delDraft = prepareReviewedCommand(userId, deleteIntent, {
      surface: 'chat',
      referenceDate: refDate,
    });
    expect(delDraft.status).toBe('proposal');
    if (delDraft.status !== 'proposal') return;
    confirmReviewedCommand(userId, delDraft.proposal.operationId);
    expect(
      tasksStore.getAllTasks(userId).find(t => t.id === 'todo-keep-undated'),
    ).toBeUndefined();
  });

  test('online chat agentContext injects open To-Dos and unchecked Note checklists', async () => {
    const now = new Date().toISOString();
    const onlineUser = 'student-todo-online';
    db.executeSync(
      `INSERT OR REPLACE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
      [onlineUser, 'online_student', 'online@example.invalid', now, now],
    );
    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId: onlineUser,
      accessToken: 'tok-todo',
      refreshToken: null,
    });

    tasksStore.insertTask({
      id: 'online-todo-1',
      userId: onlineUser,
      title: 'Email scholarship coordinator',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'High',
      category: 'Personal',
    });
    notesStore.insert({
      id: 'online-note-1',
      userId: onlineUser,
      title: 'Capstone Checklist',
      body: '- [ ] Export slides PDF',
      category: 'Academics',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    const sendSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {
          reply: 'Here is what you should tackle next.',
          sources: [],
          usedHandbook: false,
        },
      });

    const response = await chatOrchestrator.processMessage(
      onlineUser,
      'What pending to-dos should I prioritize right now?',
      {onlineMode: true, useHandbook: false, referenceDate: refDate},
    );

    expect(response.reply).toContain('tackle next');
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sentHistory = sendSpy.mock.calls[0][0];
    const lastUserContent = sentHistory[sentHistory.length - 1]?.content ?? '';
    expect(lastUserContent).toContain('To-Do List in Notes tab:');
    expect(lastUserContent).toContain('Email scholarship coordinator');
    expect(lastUserContent).toContain('[Note Checklist]');
    expect(lastUserContent).toContain('Export slides PDF');
  });
});
