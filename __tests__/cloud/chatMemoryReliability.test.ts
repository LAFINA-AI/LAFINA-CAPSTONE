jest.unmock('../../src/cloud/chatMemoryService');
import {db, chatMemoryStore, chatStore, initDatabase} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {isForgetAllMemoriesRequest} from '../../src/ai/chatMemoryCommands';
import {studyPreference} from '../../src/ai/studyPreference';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  chatMemoryService,
  resetChatMemorySupport,
} from '../../src/cloud/chatMemoryService';

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

const exchange = (userId: string) => {
  const reply = chatStore.addMessage(userId, 'assistant', 'Noted.');
  return {
    userId,
    sessionId: reply.sessionId,
    assistantMessageId: reply.id,
    userText: 'I study nursing.',
    replyText: reply.content,
  };
};

it('remembers a study-time preference locally without scheduling it', async () => {
  const userId = 'study-preference-local';
  const result = await chatOrchestrator.processMessage(
    userId, 'i like studying between 10pm to 2am', {onlineMode: true},
  );
  expect(result.intent.intent).toBe('chat');
  expect(chatMemoryStore.list(userId).map(m => m.text)).toContain(
    'Prefers studying between 10pm to 2am.',
  );
  expect(result.assistantMessage.memoryChanges?.added).toHaveLength(1);
  expect(result.actionResult).toBeUndefined();
});

it('does not save a preference when memory is disabled', async () => {
  const userId = 'study-preference-disabled';
  chatMemoryStore.setEnabled(userId, false);
  const result = await chatOrchestrator.processMessage(
    userId, 'I prefer studying at night', {onlineMode: true},
  );
  expect(result.reply).toContain('memory is turned off');
  expect(chatMemoryStore.list(userId)).toEqual([]);
  expect(result.actionResult).toBeUndefined();
});

it('keeps explicit scheduling requests out of the preference route', () => {
  expect(studyPreference('Schedule a study block from 10pm to 2am')).toBeNull();
  expect(studyPreference('I like studying but schedule a block at 10pm')).toBeNull();
});

it('does not restore memory after the user clears data during extraction', async () => {
  const me = 'audit-clear';
  let release: (value: unknown) => void = () => undefined;
  jest.spyOn(cloudClient, 'request').mockImplementation(
    () =>
      new Promise(resolve => {
        release = resolve;
      }) as never,
  );
  const pending = chatMemoryService.afterExchange(exchange(me));
  chatStore.clearHistory(me);
  chatMemoryStore.clear(me);
  release({status: 'success', data: {add: ['Studies nursing.'], remove: []}});
  await pending;
  expect(chatMemoryStore.list(me)).toEqual([]);
});

it('does not save memory without its promised reply notice if saving metadata fails', async () => {
  const me = 'audit-notice';
  const input = exchange(me);
  jest.spyOn(cloudClient, 'request').mockResolvedValue({
    status: 'success',
    data: {add: ['Studies nursing.'], remove: []},
  } as never);
  jest.spyOn(chatStore, 'setMemoryChanges').mockImplementation(() => {
    throw new Error('metadata write failed');
  });
  await chatMemoryService.afterExchange(input);
  expect(chatMemoryStore.list(me)).toEqual([]);
});

it('Undo restores all memories when adding at the storage limit', () => {
  const me = 'audit-undo';
  for (let i = 0; i < 100; i += 1)
    chatMemoryStore.add(me, `Original fact ${i}.`);
  const before = chatMemoryStore
    .list(me)
    .map(m => m.text)
    .sort();
  const changes = chatMemoryStore.applyChanges(
    me,
    {add: ['New fact.'], remove: []},
    null,
  );
  chatMemoryStore.undoChanges(me, changes);
  expect(
    chatMemoryStore
      .list(me)
      .map(m => m.text)
      .sort(),
  ).toEqual(before);
});

it('can forget all stored memories on a natural-language forget-everything request', async () => {
  const me = 'audit-forget';
  for (let i = 0; i < 60; i += 1) chatMemoryStore.add(me, `Fact ${i}.`);
  jest.spyOn(cloudClient, 'request').mockImplementation(async (_path, init) => {
    const body = JSON.parse(String(init?.body));
    return {
      status: 'success',
      data: {add: [], remove: body.memories.map((m: {id: string}) => m.id)},
    } as never;
  });
  await chatMemoryService.afterExchange({
    ...exchange(me),
    userText: 'Forget everything you remember about me.',
  });
  expect(chatMemoryStore.list(me)).toEqual([]);
});

it.each(['clear', 'edit', 'toggle', 'deleteReply'] as const)(
  'rejects an extraction after %s while the request is pending',
  async action => {
    const me = `pending-${action}`;
    const input = exchange(me);
    let release: (value: unknown) => void = () => undefined;
    jest.spyOn(cloudClient, 'request').mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }) as never,
    );
    const pending = chatMemoryService.afterExchange(input);
    if (action === 'clear') chatMemoryStore.clear(me);
    if (action === 'edit') chatMemoryStore.add(me, 'Manual preference.');
    if (action === 'toggle') {
      chatMemoryStore.setEnabled(me, false);
      chatMemoryStore.setEnabled(me, true);
    }
    if (action === 'deleteReply') chatStore.deleteSession(me, input.sessionId);
    const before = chatMemoryStore.list(me);
    release({status: 'success', data: {add: ['Late preference.'], remove: []}});
    expect(await pending).toBeNull();
    expect(chatMemoryStore.list(me)).toEqual(before);
  },
);

it('rolls back a memory update when the notice writer returns false', async () => {
  const me = 'notice-false';
  const input = exchange(me);
  const old = chatMemoryStore.add(me, 'Old fact.')!;
  const beforeRevision = chatMemoryStore.revision(me);
  jest.spyOn(cloudClient, 'request').mockResolvedValue({
    status: 'success',
    data: {add: ['New fact.'], remove: [old.id]},
  } as never);
  jest.spyOn(chatStore, 'setMemoryChanges').mockReturnValue(false);
  expect(await chatMemoryService.afterExchange(input)).toBeNull();
  expect(chatMemoryStore.list(me)).toEqual([old]);
  expect(chatMemoryStore.revision(me)).toBe(beforeRevision);
});

it('rejects extraction whose original chat request predates a clear', async () => {
  const me = 'old-request';
  const input = exchange(me);
  const memoryRevision = chatMemoryStore.revision(me);
  chatMemoryStore.clear(me);
  const request = jest.spyOn(cloudClient, 'request');
  expect(
    await chatMemoryService.afterExchange({...input, memoryRevision}),
  ).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

it('requires an existing assistant reply in the supplied owned session', async () => {
  const me = 'owned-reply';
  const input = exchange(me);
  const request = jest.spyOn(cloudClient, 'request');
  expect(
    await chatMemoryService.afterExchange({
      ...input,
      assistantMessageId: 'deleted',
    }),
  ).toBeNull();
  const user = chatStore.addMessage(me, 'user', 'Question');
  expect(
    await chatMemoryService.afterExchange({
      ...input,
      assistantMessageId: user.id,
    }),
  ).toBeNull();
  const anotherChat = chatStore.startNewChat(me);
  expect(
    await chatMemoryService.afterExchange({...input, sessionId: anotherChat}),
  ).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

it('restores eviction metadata and ordering through a reloaded notice, and Undo is idempotent', async () => {
  const me = 'reload-undo';
  const input = exchange(me);
  for (let i = 0; i < 100; i += 1) chatMemoryStore.add(me, `Original ${i}.`);
  const before = db.executeSync(
    'SELECT rowid AS position, * FROM chat_memories WHERE user_id = ? ORDER BY rowid',
    [me],
  ).rows;
  jest.spyOn(cloudClient, 'request').mockResolvedValue({
    status: 'success',
    data: {add: ['Newest fact.'], remove: []},
  } as never);
  await chatMemoryService.afterExchange(input);
  const saved = chatStore
    .getMessages(me)
    .find(m => m.id === input.assistantMessageId)!.memoryChanges!;
  expect(saved.removed).toHaveLength(1);
  const undone = chatMemoryService.undo(me, input.assistantMessageId, saved);
  expect(
    db.executeSync(
      'SELECT rowid AS position, * FROM chat_memories WHERE user_id = ? ORDER BY rowid',
      [me],
    ).rows,
  ).toEqual(before);
  expect(chatMemoryService.undo(me, input.assistantMessageId, saved)).toEqual(
    undone,
  );
});

it('rolls back Undo if its notice cannot be updated', async () => {
  const me = 'undo-atomic';
  const input = exchange(me);
  jest.spyOn(cloudClient, 'request').mockResolvedValue({
    status: 'success',
    data: {add: ['A fact.'], remove: []},
  } as never);
  const changes = (await chatMemoryService.afterExchange(input))!;
  const before = chatMemoryStore.list(me);
  const revision = chatMemoryStore.revision(me);
  jest.spyOn(chatStore, 'setMemoryChanges').mockReturnValue(false);
  expect(() =>
    chatMemoryService.undo(me, input.assistantMessageId, changes),
  ).toThrow();
  expect(chatMemoryStore.list(me)).toEqual(before);
  expect(chatMemoryStore.revision(me)).toBe(revision);
});

it('an old Undo cannot resurrect memories after Forget Everything', () => {
  const me = 'stale-undo';
  const old = chatMemoryStore.add(me, 'Forgotten fact.')!;
  const changes = chatMemoryStore.applyChanges(
    me,
    {add: [], remove: [old.id]},
    null,
  );
  chatMemoryStore.clear(me);
  expect(() => chatMemoryStore.undoChanges(me, changes)).toThrow(
    'Memories have changed',
  );
  expect(chatMemoryStore.list(me)).toEqual([]);
});

describe('explicit forget-all commands', () => {
  it.each([
    'Forget everything you remember about me.',
    'Please forget all my saved memories!',
    'Clear all memories about me',
    'delete all of my memories please',
  ])('recognizes a complete request: %s', text => {
    expect(isForgetAllMemoriesRequest(text)).toBe(true);
  });

  it.each([
    'Do not forget everything you remember about me.',
    'Can you explain what "forget everything" means?',
    'Forget my old course.',
    'If I say forget everything, what happens?',
    'My teacher said: forget everything.',
    'Delete all my memories of my biology class',
  ])(
    'does not clear on unrelated, partial, negated or quoted text: %s',
    text => {
      expect(isForgetAllMemoriesRequest(text)).toBe(false);
    },
  );

  it.each([false, true])(
    'clears all 100 memories locally with Online Mode %s, even when memory is disabled',
    async onlineMode => {
      const me = `command-${onlineMode}`;
      const other = `other-${onlineMode}`;
      for (let i = 0; i < 100; i += 1)
        chatMemoryStore.add(me, `Remembered ${i}.`);
      chatMemoryStore.add(other, 'Other owner fact.');
      chatMemoryStore.setEnabled(me, false);
      const request = jest.spyOn(cloudClient, 'request');
      const result = await chatOrchestrator.processMessage(
        me,
        'Forget everything you remember about me.',
        {onlineMode},
      );
      expect(result.usedOnline).toBe(false);
      expect(result.reply).toContain("I've forgotten all saved memories");
      expect(result.assistantMessage.memoryChanges?.removed).toHaveLength(100);
      expect(chatMemoryStore.list(me)).toEqual([]);
      expect(chatMemoryStore.list(other)).toHaveLength(1);
      expect(chatStore.getMessages(me).map(m => m.sender)).toEqual([
        'user',
        'assistant',
      ]);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('does not publish a success reply or change memory if saving the forget-all notice fails', async () => {
    const me = 'forget-atomic';
    const old = chatMemoryStore.add(me, 'Keep on failure.')!;
    jest.spyOn(chatStore, 'setMemoryChanges').mockReturnValue(false);
    await expect(
      chatOrchestrator.processMessage(me, 'forget all memories'),
    ).rejects.toThrow();
    expect(chatMemoryStore.list(me)).toEqual([old]);
    expect(chatStore.getMessages(me).map(m => m.sender)).toEqual(['user']);
  });
});
