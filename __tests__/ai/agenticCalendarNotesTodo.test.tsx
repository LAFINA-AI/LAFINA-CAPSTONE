/**
 * Verifies LAFINA's agentic Calendar, Notes & To-Do control across Chat and Call:
 * - Scope cleanup (no Meetings UI entry in NotesScreen, no Document picker in ChatScreen)
 * - Immediate execution for low-risk actions (complete/reopen task, pin/unpin note, checklist toggle)
 * - Review cards preserved for higher-risk actions + conversational confirm/revise/cancel
 * - Standalone Calendar Events, task priorities, checklist notes, 7-day context, multi-action batching
 */
import React from 'react';
import {render} from '@testing-library/react-native';
import {
  assistantOperationStore,
  chatStore,
  db,
  initDatabase,
  notesStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {NotesScreen} from '../../src/ui/screens/notes/NotesScreen';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  confirmReviewedCommand,
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {buildStudentVoiceContext} from '../../src/cloud/voiceConversation/localVoiceData';
import {addDaysToDate} from '../../src/storage/eventTime';
import {formatLocalDate} from '../../src/ai/nlu/fastPathParser';

describe('Agentic Calendar, Notes & To-Do across Chat and Call', () => {
  let ownerIdx = 0;
  const nextOwner = (tag: string): string => {
    return `agentic-${tag}-${++ownerIdx}`;
  };

  beforeEach(async () => {
    await initDatabase();
    userStore.createGuestUser();
    endReviewSession();
    jest.restoreAllMocks();
  });

  test('NotesScreen omits Meetings button and ChatScreen omits Document picker', () => {
    const userId = nextOwner('scope-ui');
    const notesRender = render(
      <ThemeProvider userId={userId}>
        <NotesScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} />
      </ThemeProvider>,
    );
    expect(notesRender.queryByTestId('notes-meetings-button')).toBeNull();

    const chatRender = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );
    expect(chatRender.queryByText(/Create a Document/i)).toBeNull();
  });

  test('low-risk actions execute immediately in Chat and Call with receipts, without confirmation card', async () => {
    const userId = nextOwner('low-risk');
    const taskId = `task_${userId}_1`;
    tasksStore.insertTask({
      id: taskId,
      userId,
      title: 'Lab Report',
      dueDate: '2026-11-15',
      dueTime: '17:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
    });
    const noteId = `note_${userId}_1`;
    notesStore.insert({
      id: noteId,
      userId,
      title: 'Physics Formulas',
      body: 'F = m * a',
      category: 'Academics',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });
    const checklistNoteId = `note_${userId}_chk`;
    notesStore.insert({
      id: checklistNoteId,
      userId,
      title: 'Errands',
      body: '- [ ] Buy milk\n- [ ] Print ID',
      category: 'Personal',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });

    // 1. Complete task immediately in Chat
    const doneRes = await chatOrchestrator.processMessage(
      userId,
      'Mark Lab Report done',
    );
    expect(doneRes.review).toBeUndefined();
    expect(doneRes.actionResult?.success).toBe(true);
    expect(tasksStore.getAllTasks(userId).find(t => t.id === taskId)?.isCompleted).toBe(true);
    const receipts =
      db.executeSync(
        'SELECT operation_id FROM assistant_operation_receipts WHERE user_id = ?',
        [userId],
      ).rows ?? [];
    expect(receipts.length).toBeGreaterThanOrEqual(1);
    expect(assistantOperationStore.revisionOf('task', taskId)).toBeGreaterThanOrEqual(1);

    // 2. Reopen task immediately in Call (reviewSpokenTurn)
    const reopenRes = await chatOrchestrator.reviewSpokenTurn(
      userId,
      'Reopen Lab Report',
    );
    expect(reopenRes.kind).toBe('executed');
    expect(tasksStore.getAllTasks(userId).find(t => t.id === taskId)?.isCompleted).toBe(false);

    // 3. Pin note immediately in Chat
    const pinRes = await chatOrchestrator.processMessage(
      userId,
      'Pin note Physics Formulas',
    );
    expect(pinRes.review).toBeUndefined();
    expect(pinRes.actionResult?.success).toBe(true);
    expect(notesStore.getAll(userId).find(n => n.id === noteId)?.isPinned).toBe(true);

    // 4. Unpin note immediately in Call
    const unpinRes = await chatOrchestrator.reviewSpokenTurn(
      userId,
      'Unpin Physics Formulas',
    );
    expect(unpinRes.kind).toBe('executed');
    expect(notesStore.getAll(userId).find(n => n.id === noteId)?.isPinned).toBe(false);

    // 5. Check off checklist item immediately in Chat
    const chkRes = await chatOrchestrator.processMessage(
      userId,
      'Check off Buy milk',
    );
    expect(chkRes.review).toBeUndefined();
    expect(chkRes.actionResult?.success).toBe(true);
    expect(notesStore.getAll(userId).find(n => n.id === checklistNoteId)?.body).toContain('- [x] Buy milk');
  });

  test('conversational revise, confirm, and cancel work directly from Chat messages', async () => {
    const userId = nextOwner('conv-draft');
    const created = await chatOrchestrator.processMessage(
      userId,
      'Add task Submit Thesis tomorrow at 2pm',
    );
    expect(created.review?.status).toBe('proposal');
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

    const revised = await chatOrchestrator.processMessage(
      userId,
      'change it to 4pm',
    );
    expect(revised.review?.status).toBe('proposal');
    if (revised.review?.status === 'proposal') {
      expect(revised.review.proposal.details.join(' ')).toContain('4:00 PM');
    }

    const confirmed = await chatOrchestrator.processMessage(
      userId,
      'yes please confirm',
    );
    expect(confirmed.resolvedReview?.status).toBe('applied');
    expect(latestPendingReview(userId, 'chat')).toBeNull();
    expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
    expect(tasksStore.getAllTasks(userId)[0].dueTime).toBe('16:00');

    // Also test conversational cancel
    await chatOrchestrator.processMessage(userId, 'Delete task Submit Thesis');
    expect(latestPendingReview(userId, 'chat')).not.toBeNull();
    const cancelled = await chatOrchestrator.processMessage(userId, 'nevermind');
    expect(cancelled.resolvedReview?.status).toBe('cancelled');
    expect(latestPendingReview(userId, 'chat')).toBeNull();
    expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
    chatStore.clearHistory(userId);
  });

  test('creates Calendar Events (separate from TimeBlocks), checklist notes, and updates task priority', async () => {
    const userId = nextOwner('entities');

    // Event creation
    const evtRes = await chatOrchestrator.processMessage(
      userId,
      'Add event Department Orientation tomorrow from 1pm to 3pm',
    );
    expect(evtRes.review?.status).toBe('proposal');
    if (evtRes.review?.status === 'proposal') {
      const outcome = confirmReviewedCommand(
        userId,
        evtRes.review.proposal.operationId,
      );
      expect(outcome.status).toBe('applied');
    }
    const events = tasksStore.getAllEvents(userId);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Department Orientation');

    // Checklist note creation
    const listRes = await chatOrchestrator.processMessage(
      userId,
      'Create checklist Exam Kit: calculator, pencil and ID',
    );
    expect(listRes.review?.status).toBe('proposal');
    if (listRes.review?.status === 'proposal') {
      confirmReviewedCommand(userId, listRes.review.proposal.operationId);
    }
    const savedNote = notesStore
      .getAll(userId)
      .find(n => n.title === 'Exam Kit');
    expect(savedNote?.body).toBe('- [ ] calculator\n- [ ] pencil\n- [ ] ID');

    // Priority update via proposal + confirm
    tasksStore.insertTask({
      id: `task_${userId}_prio`,
      userId,
      title: 'Calculus Sheet',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Low',
      category: 'Academic',
    });
    const prioRes = await chatOrchestrator.processMessage(
      userId,
      'Set Calculus Sheet priority to high',
    );
    expect(prioRes.review?.status).toBe('proposal');
    if (prioRes.review?.status === 'proposal') {
      confirmReviewedCommand(userId, prioRes.review.proposal.operationId);
    }
    expect(tasksStore.getAllTasks(userId).find(t => t.id === `task_${userId}_prio`)?.priority).toBe('High');
  });

  test('buildStudentVoiceContext spans 7 days with locations/pins and Chat supports multi-action batching', async () => {
    const userId = nextOwner('context-multi');
    const inFiveDays = addDaysToDate(formatLocalDate(new Date()), 5);
    tasksStore.insertEvent({
      id: `evt_${userId}_5d`,
      userId,
      title: 'Defense Rehearsal',
      date: inFiveDays,
      startTime: '10:00',
      endTime: '11:30',
      location: 'Room 302',
    });
    notesStore.insert({
      id: `note_${userId}_pin`,
      userId,
      title: 'Adviser Feedback',
      body: 'Cite RRL sources',
      category: 'Academics',
      isPinned: true,
      tags: [],
      isVoiceTranscribed: false,
    });

    const ctx = buildStudentVoiceContext(userId);
    expect(ctx).toContain('Defense Rehearsal');
    expect(ctx).toContain('@ Room 302');
    expect(ctx).toContain('[Pinned] "Adviser Feedback"');

    const batchRes = await chatOrchestrator.processMessage(
      userId,
      'Add task Submit draft tomorrow; Remind me tomorrow at 8pm to email adviser',
    );
    expect(batchRes.multiBatch?.items).toHaveLength(2);
    expect(batchRes.multiBatch?.items[0].kind).toBe('task');
    expect(batchRes.multiBatch?.items[1].kind).toBe('reminder');
  });
});
