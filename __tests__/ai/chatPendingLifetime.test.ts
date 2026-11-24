import {
  chatOrchestrator,
  ChatRequestCancelledError,
} from '../../src/ai/chatOrchestrator';
import {intentService} from '../../src/ai/nlu/intentService';
import type {ValidatedIntent} from '../../src/ai/nlu/types';
import {chatStore, db, initDatabase, userStore} from '../../src/storage';
import {invalidateOwnerWork} from '../../src/storage/ownerWorkEpoch';
import {waitFor} from '@testing-library/react-native';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';

let owner: string;
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  db.executeSync('DELETE FROM active_session');
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
  chatStore.clearHistory(owner);
});
afterEach(() => jest.restoreAllMocks());

const delayedIntent = () => {
  let finish!: (intent: ValidatedIntent) => void;
  const spy = jest.spyOn(intentService, 'extractIntent').mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  return {
    spy,
    finish: () =>
      finish({
        intent: 'chat',
        title: null,
        date: null,
        time: null,
        endTime: null,
        details: 'explain photons',
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'explain photons',
        isValid: true,
      } as ValidatedIntent),
  };
};

test.each(['clear', 'delete', 'signout', 'reset'] as const)(
  '%s retires a delayed chat reply',
  async action => {
    const intent = delayedIntent();
    const pending = chatOrchestrator.processMessage(owner, 'explain photons', {
      onlineMode: false,
    });
    const settled = pending.then(
      () => null,
      (error: unknown) => error,
    );
    expect(intent.spy).toHaveBeenCalledTimes(1);
    const session = chatStore.currentSessionId(owner);
    if (action === 'clear') chatStore.clearHistory(owner);
    if (action === 'delete') chatStore.deleteSession(owner, session);
    if (action === 'signout') userStore.logout();
    if (action === 'reset') invalidateOwnerWork(owner);
    intent.finish();
    expect(await settled).toBeInstanceOf(ChatRequestCancelledError);
    expect(
      chatStore
        .getMessages(owner)
        .filter(message => message.sender === 'assistant'),
    ).toHaveLength(0);
  },
);

test('opening another chat preserves the reply in its original chat', async () => {
  const intent = delayedIntent();
  const pending = chatOrchestrator.processMessage(owner, 'explain photons', {
    onlineMode: false,
  });
  const original = chatStore.currentSessionId(owner);
  const next = chatStore.startNewChat(owner);
  intent.finish();
  const result = await pending;
  expect(result.assistantMessage.sessionId).toBe(original);
  expect(chatStore.getMessages(owner, original)).toHaveLength(2);
  expect(chatStore.getMessages(owner, next)).toHaveLength(0);
});

test('streaming caches the existence check but stops publishing as soon as history is cleared', async () => {
  let finish!: (
    value: Awaited<ReturnType<typeof onlineChatSkill.streamChatMessage>>,
  ) => void;
  let publish!: (text: string) => void;
  const stream = jest
    .spyOn(onlineChatSkill, 'streamChatMessage')
    .mockImplementation((_history, options) => {
      publish = text => options.onReplyText(text);
      return new Promise(resolve => {
        finish = resolve;
      });
    });
  const received = jest.fn();
  const query = jest.spyOn(db, 'executeSync');
  const pending = chatOrchestrator.processMessage(owner, 'hi', {
    onlineMode: true,
    onReplyText: received,
  });
  const settled = pending.then(
    () => null,
    (error: unknown) => error,
  );
  await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
  const checks = () =>
    query.mock.calls.filter(([sql]) =>
      sql.includes('SELECT 1 FROM messages m JOIN chat_sessions'),
    ).length;
  const before = checks();
  for (let i = 0; i < 100; i++) publish(`Partial answer ${i}`);
  expect(received).toHaveBeenCalledTimes(100);
  expect(checks()).toBe(before);
  chatStore.clearHistory(owner);
  publish('Private late answer');
  expect(received).toHaveBeenCalledTimes(100);
  expect(checks()).toBe(before + 1);
  finish({
    status: 'success',
    data: {reply: 'Final answer', sources: [], usedHandbook: false},
  });
  expect(await settled).toBeInstanceOf(ChatRequestCancelledError);
  expect(chatStore.getMessages(owner)).toHaveLength(0);
});
