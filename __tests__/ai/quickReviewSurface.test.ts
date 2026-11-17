/**
 * Floating LAFINA FLOAT-01 (J-01): Quick Chat's `'quick'` review surface is
 * its own card slot. A Quick Chat proposal never replaces a Chat-tab or Voice
 * proposal for the same owner, and the reverse.
 */
import {initDatabase, tasksStore, userStore} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  confirmReviewedCommand,
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import type {
  CommandProposal,
  ReviewSurface,
} from '../../src/ai/nlu/commandReview';

/** Wednesday 18 Nov 2026, 10:00 local. */
const REF = new Date(2026, 10, 18, 10, 0, 0);

let ownerIndex = 0;
const owner = (): string => `quick-surface-${++ownerIndex}`;

const propose = async (
  userId: string,
  text: string,
  surface: ReviewSurface,
): Promise<CommandProposal> => {
  const result = await chatOrchestrator.processMessage(userId, text, {
    referenceDate: REF,
    reviewSurface: surface,
    temporaryChat: true,
  });
  if (result.review?.status !== 'proposal') {
    throw new Error(`Expected a review card, got: ${result.reply}`);
  }
  return result.review.proposal;
};

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
});

describe("'quick' review surface", () => {
  test("is kept through the pipeline (not normalised to 'chat')", async () => {
    const userId = owner();
    const proposal = await propose(
      userId,
      'add math exam on friday at 9am',
      'quick',
    );
    expect(proposal.surface).toBe('quick');
    expect(proposal.heading).toBe('Create event');
    expect(latestPendingReview(userId, 'quick')?.operationId).toBe(
      proposal.operationId,
    );
    expect(latestPendingReview(userId, 'chat')).toBeNull();
    expect(latestPendingReview(userId, 'voice')).toBeNull();
  });

  test('unknown surfaces still fall back to chat', async () => {
    const userId = owner();
    const proposal = await propose(
      userId,
      'add math exam on friday at 9am',
      'something-else' as ReviewSurface,
    );
    expect(proposal.surface).toBe('chat');
  });

  test('a quick proposal and a chat proposal coexist; neither replaces the other', async () => {
    const userId = owner();
    const chat = await propose(
      userId,
      'add math exam on friday at 9am',
      'chat',
    );
    const quick = await propose(
      userId,
      'add physics quiz on thursday at 2pm',
      'quick',
    );
    const voice = await propose(
      userId,
      'add dentist appointment on monday at 2pm',
      'voice',
    );

    expect(latestPendingReview(userId, 'chat')?.operationId).toBe(
      chat.operationId,
    );
    expect(latestPendingReview(userId, 'quick')?.operationId).toBe(
      quick.operationId,
    );
    expect(latestPendingReview(userId, 'voice')?.operationId).toBe(
      voice.operationId,
    );

    // A newer chat card does not touch the quick card.
    await propose(userId, 'add history essay on friday at 4pm', 'chat');
    expect(latestPendingReview(userId, 'quick')?.operationId).toBe(
      quick.operationId,
    );

    // Each confirms on its own.
    expect(confirmReviewedCommand(userId, quick.operationId).status).toBe(
      'applied',
    );
    expect(latestPendingReview(userId, 'quick')).toBeNull();
    expect(latestPendingReview(userId, 'chat')).not.toBeNull();
    expect(confirmReviewedCommand(userId, voice.operationId).status).toBe(
      'applied',
    );
  });

  test('a second quick proposal replaces the first quick proposal only', async () => {
    const userId = owner();
    const chat = await propose(
      userId,
      'add math exam on friday at 9am',
      'chat',
    );
    const first = await propose(
      userId,
      'add physics quiz on thursday at 2pm',
      'quick',
    );
    const second = await propose(
      userId,
      'add biology exam on friday at 1pm',
      'quick',
    );

    expect(latestPendingReview(userId, 'quick')?.operationId).toBe(
      second.operationId,
    );
    const stale = confirmReviewedCommand(userId, first.operationId);
    expect(stale.status).toBe('refused');
    expect(latestPendingReview(userId, 'chat')?.operationId).toBe(
      chat.operationId,
    );

    const before = tasksStore.getAllEvents(userId).length;
    const applied = confirmReviewedCommand(userId, second.operationId);
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') return;
    expect(applied.receipt.entityType).toBe('event');
    expect(tasksStore.getAllEvents(userId).length).toBe(before + 1);
  });
});
