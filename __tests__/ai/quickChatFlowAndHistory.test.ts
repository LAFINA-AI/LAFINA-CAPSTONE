/**
 * Floating LAFINA & Orchestrator multi-turn clarification follow-ups,
 * persistent Quick Chat history, and Clear flow.
 */
import {DeviceEventEmitter} from 'react-native';
import {
  db,
  initDatabase,
  remindersStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {
  QUICK_CHAT_DATA_CHANGED_EVENT,
  QUICK_CHAT_IDLE_MS,
  quickChatController,
  type QuickChatDataChangedEvent,
} from '../../src/ai/quickChat/quickChatController';

/** Wednesday 18 Nov 2026, 10:00 local. */
const REF = new Date(2026, 10, 18, 10, 0, 0);

let ownerIndex = 0;
const owner = (): string => `quick-flow-hist-${++ownerIndex}`;

const chatRowCount = (): number => {
  const count = (table: string): number =>
    Number(
      db.executeSync(`SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.n ?? 0,
    );
  return count('messages') + count('chat_sessions');
};

const dataEvents: QuickChatDataChangedEvent[] = [];
let subscription: {remove: () => void} | null = null;

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask',
    ],
  });
  jest.setSystemTime(REF);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(async () => {
  await initDatabase();
  userStore.createGuestUser();
  endReviewSession();
  quickChatController.resetForTests();
  dataEvents.length = 0;
  subscription = DeviceEventEmitter.addListener(
    QUICK_CHAT_DATA_CHANGED_EVENT,
    (event: QuickChatDataChangedEvent) => dataEvents.push(event),
  );
});

afterEach(() => {
  subscription?.remove();
  subscription = null;
  jest.restoreAllMocks();
});

describe('Multi-turn clarification follow-ups', () => {
  test('"remind me to throw trash" → "9pm" in Quick Chat prepares a Set reminder card and confirms cleanly (offline)', async () => {
    const userId = owner();
    const rowsBefore = chatRowCount();

    const first = await quickChatController.send(
      userId,
      'remind me to throw trash',
      {referenceDate: REF},
    );
    expect(first.status).toBe('done');
    if (first.status !== 'done') return;
    expect(first.result.review?.status).toBe('clarify');
    expect(first.result.reply).toMatch(/What time should I remind you/i);
    expect(latestPendingReview(userId, 'quick')).toBeNull();

    const second = await quickChatController.send(userId, '9pm', {
      referenceDate: REF,
    });
    expect(second.status).toBe('done');
    if (second.status !== 'done') return;
    const review = second.result.review;
    expect(review?.status).toBe('proposal');
    if (review?.status !== 'proposal') return;
    expect(review.proposal.heading).toBe('Set reminder');
    expect(review.proposal.surface).toBe('quick');
    expect(review.proposal.title.toLowerCase()).toContain('throw trash');
    expect(review.proposal.details.join(' ')).toMatch(/9:00\s*PM/i);
    expect(second.result.intent.rawTranscript).toMatch(
      /remind me to throw trash at 9pm/i,
    );

    const decision = await chatOrchestrator.confirmReview(
      userId,
      review.proposal.operationId,
      {temporaryChat: true},
    );
    quickChatController.recordDecision(userId, decision);
    expect(decision.outcome?.status).toBe('applied');
    expect(remindersStore.getAllReminders(userId)).toHaveLength(1);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
    expect(dataEvents).toEqual([{ownerId: userId, reason: 'confirmed'}]);
    expect(chatRowCount()).toBe(rowsBefore);
  });

  test('"remind me to throw trash" → "9pm" in Online Mode does NOT leak to plain DeepSeek chat', async () => {
    const userId = owner();
    const streamSpy = jest
      .spyOn(onlineChatSkill, 'streamChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {
          reply:
            "Got it, 9:00 PM for throwing the trash. I can't create or save reminders.",
          sources: [],
          usedHandbook: false,
        },
      });
    const sendSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {
          reply:
            "Got it, 9:00 PM for throwing the trash. I can't create or save reminders.",
          sources: [],
          usedHandbook: false,
        },
      });

    const first = await quickChatController.send(
      userId,
      'remind me to throw trash',
      {referenceDate: REF, onlineMode: true},
    );
    expect(first.status).toBe('done');
    if (first.status !== 'done') return;
    expect(first.result.review?.status).toBe('clarify');

    streamSpy.mockClear();
    sendSpy.mockClear();

    const second = await quickChatController.send(userId, '9pm', {
      referenceDate: REF,
      onlineMode: true,
    });
    expect(second.status).toBe('done');
    if (second.status !== 'done') return;
    expect(second.result.review?.status).toBe('proposal');
    expect(streamSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test('two-step clarification: "remind me to throw trash" → "tomorrow" → "9pm"', async () => {
    const userId = owner();
    const first = await quickChatController.send(
      userId,
      'remind me to throw trash',
      {referenceDate: REF},
    );
    expect(first.status === 'done' && first.result.review?.status).toBe(
      'clarify',
    );

    const second = await quickChatController.send(userId, 'tomorrow', {
      referenceDate: REF,
    });
    expect(second.status).toBe('done');
    if (second.status !== 'done') return;
    expect(second.result.review?.status).toBe('clarify');

    const third = await quickChatController.send(userId, '9pm', {
      referenceDate: REF,
    });
    expect(third.status).toBe('done');
    if (third.status !== 'done') return;
    expect(third.result.review?.status).toBe('proposal');
    if (third.result.review?.status !== 'proposal') return;
    expect(third.result.review.proposal.details.join(' ')).toMatch(
      /Nov 19.*9:00\s*PM/i,
    );
  });

  test('relative time, bare hour, and alarm follow-ups also complete cleanly', async () => {
    const userId = owner();

    // Relative time: "in 15 minutes"
    await quickChatController.send(userId, 'remind me to stretch', {
      referenceDate: REF,
    });
    const rel = await quickChatController.send(userId, 'in 15 minutes', {
      referenceDate: REF,
    });
    expect(rel.status === 'done' && rel.result.review?.status).toBe('proposal');
    quickChatController.clear(userId);

    // Alarm missing time → "6am"
    const alarmAsk = await quickChatController.send(userId, 'set an alarm', {
      referenceDate: REF,
    });
    expect(alarmAsk.status).toBe('done');
    const alarmAns = await quickChatController.send(userId, '6am', {
      referenceDate: REF,
    });
    expect(alarmAns.status === 'done' && alarmAns.result.review?.status).toBe(
      'proposal',
    );
    if (
      alarmAns.status === 'done' &&
      alarmAns.result.review?.status === 'proposal'
    ) {
      expect(alarmAns.result.review.proposal.heading).toBe('Set alarm');
    }
  });

  test('works in main Chat tab (persistent session) too', async () => {
    const userId = owner();
    const first = await chatOrchestrator.processMessage(
      userId,
      'remind me to throw trash',
      {referenceDate: REF},
    );
    expect(first.review?.status).toBe('clarify');

    const second = await chatOrchestrator.processMessage(userId, '9pm', {
      referenceDate: REF,
    });
    expect(second.review?.status).toBe('proposal');
    if (second.review?.status === 'proposal') {
      expect(second.review.proposal.surface).toBe('chat');
      expect(second.review.proposal.heading).toBe('Set reminder');
    }
  });

  test('cancelling or starting a new command exits pending clarification cleanly', async () => {
    const userId = owner();
    await quickChatController.send(userId, 'remind me to throw trash', {
      referenceDate: REF,
    });
    const cancelled = await quickChatController.send(userId, 'cancel', {
      referenceDate: REF,
    });
    expect(cancelled.status).toBe('done');
    if (cancelled.status === 'done') {
      expect(cancelled.result.reply).toMatch(/Cancelled\. Nothing was changed/i);
    }

    // Replying "9pm" after cancel does NOT resurrect the cancelled reminder.
    const afterCancel = await quickChatController.send(userId, '9pm', {
      referenceDate: REF,
    });
    expect(afterCancel.status).toBe('done');
    if (afterCancel.status === 'done') {
      expect(afterCancel.result.reply.toLowerCase()).not.toContain(
        'throw trash',
      );
      if (afterCancel.result.review?.status === 'proposal') {
        expect(afterCancel.result.review.proposal.heading).not.toBe(
          'Set reminder',
        );
      }
    }

    // Starting a brand-new command instead of giving a time runs the new command.
    await quickChatController.send(userId, 'remind me to throw trash', {
      referenceDate: REF,
    });
    const replaced = await quickChatController.send(
      userId,
      'add math exam this Friday at 9 AM',
      {referenceDate: REF},
    );
    expect(replaced.status).toBe('done');
    if (
      replaced.status === 'done' &&
      replaced.result.review?.status === 'proposal'
    ) {
      expect(replaced.result.review.proposal.heading).toBe('Create event');
    }
  });
});

describe('Quick Chat persistent history and clear', () => {
  test('saves completed chats to history, survives idle/reset, supports reopen, delete, clear, and owner isolation', async () => {
    let clock = REF.getTime();
    quickChatController.resetForTests(() => clock);
    const firstOwner = owner();
    const secondOwner = owner();
    const rowsBefore = chatRowCount();

    await quickChatController.send(firstOwner, 'hello first chat', {
      referenceDate: REF,
    });
    const firstId = quickChatController.getActiveSessionId(firstOwner);
    expect(firstId).toBeTruthy();

    // Clear resets active transcript and cancels any pending review/clarification,
    // while keeping the completed chat available in History.
    await quickChatController.send(firstOwner, 'remind me to throw trash', {
      referenceDate: REF,
    });
    quickChatController.clear(firstOwner);
    expect(quickChatController.getTranscript(firstOwner)).toEqual([]);
    expect(quickChatController.getActiveSessionId(firstOwner)).toBeNull();
    // Pending clarification was cleared too (9pm does not resurrect "throw trash").
    const stray = await quickChatController.send(firstOwner, '9pm', {
      referenceDate: REF,
    });
    expect(stray.status).toBe('done');
    if (stray.status === 'done') {
      expect(stray.result.reply.toLowerCase()).not.toContain('throw trash');
    }

    // Start another chat after clearing.
    clock += 1000;
    quickChatController.clear(firstOwner);
    await quickChatController.send(firstOwner, 'what is on my schedule today', {
      referenceDate: REF,
    });

    const history = quickChatController.getHistory(firstOwner);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].title).toBe('what is on my schedule today');
    expect(quickChatController.getHistory(secondOwner)).toEqual([]);

    // Idle expiry clears active view, but history remains persisted.
    clock += QUICK_CHAT_IDLE_MS + 1000;
    expect(quickChatController.getTranscript(firstOwner)).toEqual([]);
    expect(quickChatController.getHistory(firstOwner).length).toBeGreaterThanOrEqual(2);

    // Reopening the first chat loads its messages back into the panel.
    expect(quickChatController.openHistorySession(firstOwner, firstId!)).toBe(
      true,
    );
    expect(quickChatController.getActiveSessionId(firstOwner)).toBe(firstId);
    expect(quickChatController.getTranscript(firstOwner)[0].content).toBe(
      'hello first chat',
    );

    // Deleting the currently open session removes it from history and clears panel.
    quickChatController.deleteHistorySession(firstOwner, firstId!);
    expect(quickChatController.getTranscript(firstOwner)).toEqual([]);
    expect(
      quickChatController.getHistory(firstOwner).some(s => s.id === firstId),
    ).toBe(false);

    // Clear all removes all history for firstOwner only.
    await quickChatController.send(secondOwner, 'second owner chat', {
      referenceDate: REF,
    });
    quickChatController.clearHistory(firstOwner);
    expect(quickChatController.getHistory(firstOwner)).toEqual([]);
    expect(quickChatController.getHistory(secondOwner)).toHaveLength(1);

    // Still zero rows written to main chat_sessions / messages.
    expect(chatRowCount()).toBe(rowsBefore);
  });
});
