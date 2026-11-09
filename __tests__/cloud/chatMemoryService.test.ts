jest.unmock('../../src/cloud/chatMemoryService');
/**
 * Chat memory, Claude-style: after a complete online reply LAFINA asks its
 * server (POST /v1/ai/memory/extract) what to remember or forget, applies the
 * answer on this phone, and the reply shows the change with Undo.
 */
import {DeviceEventEmitter} from 'react-native';
import {chatMemoryStore, chatStore, initDatabase} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  CHAT_MEMORY_CHANGED_EVENT,
  chatMemoryService,
  resetChatMemorySupport,
} from '../../src/cloud/chatMemoryService';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {GUEST_USER_ID} from '../../src/constants';

let serial = 0;
const student = (): string => {
  serial += 1;
  return `memory-student-${serial}`;
};

const extractAnswers = (
  data: {add?: unknown; remove?: unknown} | null,
  httpStatus = 200,
) =>
  jest.spyOn(cloudClient, 'request').mockResolvedValue(
    data
      ? ({status: 'success', data, httpStatus} as never)
      : ({
          status: 'validation_error',
          error: 'Not Found',
          httpStatus,
        } as never),
  );

const replyIs = (reply: string, interrupted?: boolean) =>
  jest.spyOn(onlineChatSkill, 'sendChatMessage').mockResolvedValue({
    status: 'success',
    data: {
      reply,
      provider: 'deepseek',
      usedHandbook: false,
      sources: [],
      ...(interrupted ? {interrupted} : {}),
    },
  } as never);

/** Lets the background memory call finish. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const exchange = (
  userId: string,
  assistantMessageId = chatStore.addMessage(userId, 'assistant', 'Got it!').id,
) => ({
  userId,
  sessionId: chatStore.currentSessionId(userId),
  assistantMessageId,
  userText: "I'm a 2nd year nursing student and I work mornings.",
  replyText: 'Got it!',
});

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetChatMemorySupport();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('chatMemoryService.afterExchange', () => {
  it('saves what the server picks out, records it on the reply and tells Chat', async () => {
    const me = student();
    const reply = chatStore.addMessage(me, 'assistant', 'Got it!');
    const old = chatMemoryStore.add(me, 'Is in 1st year.')!;
    const request = extractAnswers({
      add: ['Is a 2nd year nursing student.', 'Works mornings.'],
      remove: [old.id],
    });
    const events: unknown[] = [];
    const sub = DeviceEventEmitter.addListener(CHAT_MEMORY_CHANGED_EVENT, e =>
      events.push(e),
    );

    const changes = await chatMemoryService.afterExchange(
      exchange(me, reply.id),
    );
    sub.remove();

    const [path, init, auth] = request.mock.calls[0];
    expect(path).toBe('/v1/ai/memory/extract');
    expect(auth).toBe(true);
    const body = JSON.parse(String(init?.body));
    expect(body.messages.map((m: {role: string}) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(body.memories).toEqual([{id: old.id, text: 'Is in 1st year.'}]);

    expect(
      chatMemoryStore
        .list(me)
        .map(m => m.text)
        .sort(),
    ).toEqual(['Is a 2nd year nursing student.', 'Works mornings.']);
    expect(changes?.removed).toMatchObject([
      {id: old.id, text: 'Is in 1st year.'},
    ]);
    expect(chatStore.getMessages(me)[0].memoryChanges).toEqual(changes);
    expect(events).toEqual([{userId: me, messageId: reply.id, changes}]);
  });

  it('sends at most 3000 characters of the question', async () => {
    const me = student();
    const request = extractAnswers({add: [], remove: []});
    await chatMemoryService.afterExchange({
      ...exchange(me),
      userText: 'x'.repeat(9000),
    });
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.messages[0].content).toHaveLength(3000);
  });

  it('nothing to remember changes nothing and emits nothing', async () => {
    const me = student();
    extractAnswers({add: [], remove: []});
    const emit = jest.spyOn(DeviceEventEmitter, 'emit');
    expect(await chatMemoryService.afterExchange(exchange(me))).toBeNull();
    expect(chatMemoryStore.list(me)).toEqual([]);
    expect(emit).not.toHaveBeenCalledWith(
      CHAT_MEMORY_CHANGED_EVENT,
      expect.anything(),
    );
  });

  it('never asks for guests or when memory is off', async () => {
    const request = extractAnswers({add: ['x'], remove: []});
    expect(
      await chatMemoryService.afterExchange(exchange(GUEST_USER_ID)),
    ).toBeNull();
    const me = student();
    chatMemoryStore.setEnabled(me, false);
    expect(await chatMemoryService.afterExchange(exchange(me))).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('memory turned off while the server was thinking saves nothing', async () => {
    const me = student();
    jest.spyOn(cloudClient, 'request').mockImplementation(async () => {
      chatMemoryStore.setEnabled(me, false);
      return {
        status: 'success',
        data: {add: ['Likes tea.'], remove: []},
        httpStatus: 200,
      } as never;
    });
    expect(await chatMemoryService.afterExchange(exchange(me))).toBeNull();
    expect(chatMemoryStore.list(me)).toEqual([]);
  });

  it('a server without memory (404) is not asked again; other failures are retried later', async () => {
    const me = student();
    const missing = extractAnswers(null, 404);
    await chatMemoryService.afterExchange(exchange(me));
    expect(chatMemoryService.isActive(me)).toBe(false);
    await chatMemoryService.afterExchange(exchange(me));
    expect(missing).toHaveBeenCalledTimes(1);

    resetChatMemorySupport();
    missing.mockResolvedValue({
      status: 'server_error',
      error: 'x',
      httpStatus: 503,
    } as never);
    await chatMemoryService.afterExchange(exchange(me));
    expect(chatMemoryService.isActive(me)).toBe(true);
  });

  it('a network error or a garbled answer changes nothing', async () => {
    const me = student();
    jest
      .spyOn(cloudClient, 'request')
      .mockRejectedValueOnce(new Error('socket closed'));
    expect(await chatMemoryService.afterExchange(exchange(me))).toBeNull();
    extractAnswers({add: 'not a list', remove: [42]});
    expect(await chatMemoryService.afterExchange(exchange(me))).toBeNull();
    expect(chatMemoryStore.list(me)).toEqual([]);
  });

  it('Undo puts memory back and marks the reply', async () => {
    const me = student();
    const reply = chatStore.addMessage(me, 'assistant', 'Noted');
    extractAnswers({add: ['Takes BSN.'], remove: []});
    const changes = (await chatMemoryService.afterExchange(
      exchange(me, reply.id),
    ))!;
    const events: unknown[] = [];
    const sub = DeviceEventEmitter.addListener(CHAT_MEMORY_CHANGED_EVENT, e =>
      events.push(e),
    );
    const undone = chatMemoryService.undo(me, reply.id, changes);
    sub.remove();
    expect(chatMemoryStore.list(me)).toEqual([]);
    expect(undone.undone).toBe(true);
    expect(chatStore.getMessages(me)[0].memoryChanges?.undone).toBe(true);
    expect(events).toEqual([
      {userId: me, messageId: reply.id, changes: undone},
    ]);
  });
});

describe('chat replies and memory', () => {
  it('sends saved memories with an online message and learns from the reply', async () => {
    const me = student();
    const saved = chatMemoryStore.add(me, 'Prefers short answers.')!;
    const send = replyIs('Sure, short and sweet.');
    const request = extractAnswers({
      add: ['Has a quiz on Friday.'],
      remove: [],
    });

    const result = await chatOrchestrator.processMessage(
      me,
      'what is the best way to revise anatomy',
      {
        onlineMode: true,
        useHandbook: false,
      },
    );
    await settle();

    expect(send.mock.calls[0][1]).toMatchObject({
      memories: [{id: saved.id, text: 'Prefers short answers.'}],
    });
    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.messages[1].content).toBe(result.reply);
    expect(chatMemoryStore.list(me).map(m => m.text)).toContain(
      'Has a quiz on Friday.',
    );
    const stored = chatStore
      .getMessages(me)
      .find(m => m.id === result.assistantMessage.id);
    expect(stored?.memoryChanges?.added.map(m => m.text)).toEqual([
      'Has a quiz on Friday.',
    ]);
  });

  it('sends no memories field when there are none', async () => {
    const me = student();
    const send = replyIs('Hello!');
    extractAnswers({add: [], remove: []});
    await chatOrchestrator.processMessage(me, 'what should I study first', {
      onlineMode: true,
      useHandbook: false,
    });
    expect(send.mock.calls[0][1]).not.toHaveProperty('memories');
  });

  it('memory off: nothing is sent and nothing is learned', async () => {
    const me = student();
    chatMemoryStore.add(me, 'Prefers short answers.');
    chatMemoryStore.setEnabled(me, false);
    const send = replyIs('Okay.');
    const request = extractAnswers({add: ['x'], remove: []});
    await chatOrchestrator.processMessage(me, 'what should I study first', {
      onlineMode: true,
      useHandbook: false,
    });
    await settle();
    expect(send.mock.calls[0][1]).not.toHaveProperty('memories');
    expect(request).not.toHaveBeenCalled();
  });

  it('a cut-off reply, a failed reply and offline chat never touch memory', async () => {
    const me = student();
    const request = extractAnswers({add: ['x'], remove: []});
    replyIs('The steps are', true);
    await chatOrchestrator.processMessage(me, 'explain the steps of mitosis', {
      onlineMode: true,
      useHandbook: false,
    });
    jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({status: 'offline', error: 'x'} as never);
    await chatOrchestrator.processMessage(me, 'explain the steps of meiosis', {
      onlineMode: true,
      useHandbook: false,
    });
    await chatOrchestrator.processMessage(me, 'hello', {onlineMode: false});
    await settle();
    expect(request).not.toHaveBeenCalled();
  });

  it('the reply stays in the chat it was asked in', async () => {
    const me = student();
    const first = chatStore.currentSessionId(me);
    let release: () => void = () => undefined;
    jest.spyOn(onlineChatSkill, 'sendChatMessage').mockImplementation(
      () =>
        new Promise(resolve => {
          release = () =>
            resolve({
              status: 'success',
              data: {
                reply: 'Done.',
                provider: 'deepseek',
                usedHandbook: false,
                sources: [],
              },
            } as never);
        }),
    );
    extractAnswers({add: [], remove: []});
    const pending = chatOrchestrator.processMessage(
      me,
      'summarize chapter two for me',
      {
        onlineMode: true,
        useHandbook: false,
      },
    );
    await settle();
    chatStore.startNewChat(me);
    release();
    await pending;
    expect(chatStore.getMessages(me)).toEqual([]);
    expect(chatStore.getMessages(me, first).map(m => m.sender)).toEqual([
      'user',
      'assistant',
    ]);
  });
});
