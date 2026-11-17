/**
 * Floating LAFINA FLOAT-01 (J-02 to J-05): the Quick Chat controller runs the
 * existing pipeline in Temporary Chat mode on the `'quick'` surface, keeps a
 * capped in-memory transcript, drops stale replies, and announces applied
 * changes. Device path only; no network.
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
import type {ChatOrchestratorResult} from '../../src/ai/chatOrchestrator';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {
  QUICK_CHAT_DATA_CHANGED_EVENT,
  QUICK_CHAT_IDLE_MS,
  QUICK_CHAT_MAX_MESSAGES,
  quickChatController,
} from '../../src/ai/quickChat/quickChatController';
import type {QuickChatDataChangedEvent} from '../../src/ai/quickChat/quickChatController';

/** Wednesday 18 Nov 2026, 10:00 local. "This Friday" is 20 Nov. */
const REF = new Date(2026, 10, 18, 10, 0, 0);
const EXAMPLE = 'add my networking exam this Friday at 9 AM';

let ownerIndex = 0;
const owner = (): string => `quick-ctl-${++ownerIndex}`;

/** Saved chat messages plus chat sessions; Quick Chat must add neither. */
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

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return {promise, resolve};
};

describe('J-02: example request through the controller', () => {
  test('the brief\'s example becomes a "Create event" card on the quick surface, with no chat rows', async () => {
    const userId = owner();
    const rowsBefore = chatRowCount();

    const sent = await quickChatController.send(userId, EXAMPLE, {
      referenceDate: REF,
    });
    expect(sent.status).toBe('done');
    if (sent.status !== 'done') return;
    const review = sent.result.review;
    expect(review?.status).toBe('proposal');
    if (review?.status !== 'proposal') return;
    expect(review.proposal.heading).toBe('Create event');
    expect(review.proposal.surface).toBe('quick');
    expect(latestPendingReview(userId, 'quick')?.operationId).toBe(
      review.proposal.operationId,
    );
    expect(latestPendingReview(userId, 'chat')).toBeNull();
    expect(quickChatController.getLastResult(userId)?.review).toBe(review);
    expect(quickChatController.getLastResult('someone-else')).toBeNull();

    // Confirm the way the card does, in Temporary Chat mode.
    const decision = await chatOrchestrator.confirmReview(
      userId,
      review.proposal.operationId,
      {temporaryChat: true},
    );
    quickChatController.recordDecision(userId, decision);
    expect(decision.outcome?.status).toBe('applied');

    const events = tasksStore.getAllEvents(userId);
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe('2026-11-20');
    expect(events[0].startTime).toBe('09:00');
    expect(remindersStore.getAllReminders(userId)).toHaveLength(1);

    expect(chatRowCount()).toBe(rowsBefore);
    expect(dataEvents).toEqual([{ownerId: userId, reason: 'confirmed'}]);

    // Control: a normal Chat-tab send does add rows, so the count is meaningful.
    await chatOrchestrator.processMessage(userId, 'hello', {
      referenceDate: REF,
    });
    expect(chatRowCount()).toBeGreaterThan(rowsBefore);
  });

  test('passes the fixed options and the in-memory history', async () => {
    const userId = owner();
    const spy = jest.spyOn(chatOrchestrator, 'processMessage');

    await quickChatController.send(userId, 'what is on my schedule today', {
      referenceDate: REF,
    });
    await quickChatController.send(userId, 'and tomorrow?', {
      referenceDate: REF,
    });

    expect(spy).toHaveBeenCalledTimes(2);
    const options = spy.mock.calls[1][2]!;
    expect(options.temporaryChat).toBe(true);
    expect(options.reviewSurface).toBe('quick');
    expect(options.onlineMode).toBe(false);
    expect(options.useHandbook).toBeUndefined();
    expect(options.speakReply).toBeUndefined();
    const history = options.temporaryHistory!.map(m => m.content);
    expect(history[0]).toBe('what is on my schedule today');
    expect(history[history.length - 1]).toBe('and tomorrow?');
    expect(history).toHaveLength(3);

    const transcript = quickChatController.getTranscript(userId);
    expect(transcript.map(m => m.sender)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  test('the transcript is capped', async () => {
    const userId = owner();
    for (let i = 0; i < QUICK_CHAT_MAX_MESSAGES; i += 1) {
      await quickChatController.send(userId, `hello ${i}`, {
        referenceDate: REF,
      });
    }
    const transcript = quickChatController.getTranscript(userId);
    expect(transcript).toHaveLength(QUICK_CHAT_MAX_MESSAGES);
    expect(transcript[transcript.length - 2].content).toBe(
      `hello ${QUICK_CHAT_MAX_MESSAGES - 1}`,
    );
  });

  test('empty text sends nothing', async () => {
    const spy = jest.spyOn(chatOrchestrator, 'processMessage');
    expect((await quickChatController.send(owner(), '   ')).status).toBe(
      'empty',
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('J-03: stop, busy and errors', () => {
  test('a second send while busy is refused', async () => {
    const userId = owner();
    const gate = deferred<ChatOrchestratorResult>();
    const spy = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockImplementationOnce(() => gate.promise);

    const first = quickChatController.send(userId, 'first', {
      referenceDate: REF,
    });
    expect(quickChatController.isBusy(userId)).toBe(true);
    expect((await quickChatController.send(userId, 'second')).status).toBe(
      'busy',
    );
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    gate.resolve(
      await chatOrchestrator.processMessage(userId, 'first', {
        temporaryChat: true,
        referenceDate: REF,
      }),
    );
    expect((await first).status).toBe('done');
    expect(quickChatController.isBusy(userId)).toBe(false);
  });

  test('stop() makes the late reply stale, removes the echo and withdraws its card', async () => {
    const userId = owner();
    const real = await chatOrchestrator.processMessage(userId, EXAMPLE, {
      temporaryChat: true,
      reviewSurface: 'quick',
      referenceDate: REF,
    });
    expect(real.review?.status).toBe('proposal');
    const gate = deferred<ChatOrchestratorResult>();
    let isCurrent: (() => boolean) | undefined;
    jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockImplementationOnce((_u, _t, options) => {
        isCurrent = options?.isCurrent;
        return gate.promise;
      });

    const pending = quickChatController.send(userId, EXAMPLE, {
      referenceDate: REF,
    });
    expect(quickChatController.getTranscript(userId)).toHaveLength(1);
    quickChatController.stop();
    expect(isCurrent?.()).toBe(false);
    expect(quickChatController.getTranscript(userId)).toHaveLength(0);
    expect(quickChatController.isBusy(userId)).toBe(false);

    gate.resolve(real);
    expect((await pending).status).toBe('stopped');
    expect(quickChatController.getTranscript(userId)).toHaveLength(0);
    expect(latestPendingReview(userId, 'quick')).toBeNull();
    expect(dataEvents).toHaveLength(0);
  });

  test('a thrown error returns status error and removes the echo', async () => {
    const userId = owner();
    jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockRejectedValueOnce(new Error('boom'));
    const result = await quickChatController.send(userId, 'add exam friday');
    expect(result.status).toBe('error');
    expect(quickChatController.getTranscript(userId)).toHaveLength(0);
    expect(quickChatController.isBusy(userId)).toBe(false);
  });
});

describe('J-04: data-changed event', () => {
  test('not emitted for cancel, refusal or a repeated confirm', async () => {
    const userId = owner();
    const sent = await quickChatController.send(userId, EXAMPLE, {
      referenceDate: REF,
    });
    if (sent.status !== 'done' || sent.result.review?.status !== 'proposal') {
      throw new Error('expected a proposal');
    }
    const operationId = sent.result.review.proposal.operationId;

    const cancelled = chatOrchestrator.cancelReview(userId, operationId, {
      temporaryChat: true,
    });
    quickChatController.recordDecision(userId, cancelled);
    const refused = await chatOrchestrator.confirmReview(userId, operationId, {
      temporaryChat: true,
    });
    expect(refused.outcome?.status).toBe('refused');
    quickChatController.recordDecision(userId, refused);
    expect(dataEvents).toHaveLength(0);

    const again = await quickChatController.send(userId, EXAMPLE, {
      referenceDate: REF,
    });
    if (again.status !== 'done' || again.result.review?.status !== 'proposal') {
      throw new Error('expected a proposal');
    }
    const id = again.result.review.proposal.operationId;
    const applied = await chatOrchestrator.confirmReview(userId, id, {
      temporaryChat: true,
    });
    quickChatController.recordDecision(userId, applied);
    const repeated = await chatOrchestrator.confirmReview(userId, id, {
      temporaryChat: true,
    });
    expect(
      repeated.outcome?.status === 'applied' && repeated.outcome.repeated,
    ).toBe(true);
    quickChatController.recordDecision(userId, repeated);
    expect(dataEvents).toEqual([{ownerId: userId, reason: 'confirmed'}]);
  });

  test('undo writes nothing to chat history and emits once when undone', () => {
    const userId = owner();
    const spy = jest
      .spyOn(chatOrchestrator, 'undoAction')
      .mockReturnValueOnce({status: 'undone', reply: 'Undone.'})
      .mockReturnValueOnce({status: 'refused', reply: 'Too late.'});

    expect(quickChatController.undo(userId, 'tok-1').status).toBe('undone');
    expect(quickChatController.undo(userId, 'tok-2').status).toBe('refused');
    expect(spy).toHaveBeenNthCalledWith(1, userId, 'tok-1', {
      recordInChat: false,
    });
    expect(dataEvents).toEqual([{ownerId: userId, reason: 'undone'}]);
  });
});

describe('J-05: owner change and idle expiry', () => {
  test('a different owner never sees the previous transcript', async () => {
    const first = owner();
    const second = owner();
    await quickChatController.send(first, 'hello', {referenceDate: REF});
    expect(quickChatController.getTranscript(first)).toHaveLength(2);
    expect(quickChatController.getTranscript(second)).toEqual([]);

    await quickChatController.send(second, 'hi', {referenceDate: REF});
    expect(quickChatController.getTranscript(first)).toEqual([]);
    expect(quickChatController.getTranscript(second)).toHaveLength(2);
  });

  test('retainOnly drops another owner', async () => {
    const first = owner();
    await quickChatController.send(first, 'hello', {referenceDate: REF});
    quickChatController.retainOnly(null);
    expect(quickChatController.getTranscript(first)).toEqual([]);
  });

  test('30 minutes without use clears the transcript', async () => {
    let clock = REF.getTime();
    quickChatController.resetForTests(() => clock);
    const userId = owner();
    await quickChatController.send(userId, 'hello', {referenceDate: REF});
    clock += QUICK_CHAT_IDLE_MS - 1000;
    expect(quickChatController.getTranscript(userId)).toHaveLength(2);
    clock += QUICK_CHAT_IDLE_MS + 1000;
    expect(quickChatController.getTranscript(userId)).toEqual([]);
    expect(quickChatController.getLastResult(userId)).toBeNull();
  });
});
