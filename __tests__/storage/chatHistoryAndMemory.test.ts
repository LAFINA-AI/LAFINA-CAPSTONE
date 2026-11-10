/**
 * Chat history (several chats per account, like ChatGPT or Claude) and chat
 * memory (short facts LAFINA keeps about a student), both on this phone only.
 */
import {db, initDatabase, chatStore, chatMemoryStore} from '../../src/storage';
import {CURRENT_CHAT_KEY, NEW_CHAT_PREFIX} from '../../src/storage/chatStore';
import {
  MAX_PROMPT_MEMORIES,
  MAX_STORED_MEMORIES,
} from '../../src/storage/chatMemoryStore';
import {
  ownedChatSessionId,
  transferChatOwnership,
} from '../../src/storage/chatOwnership';
import {localSettingsStore} from '../../src/storage/localSettingsStore';

let serial = 0;
const student = (): string => {
  serial += 1;
  const id = `history-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const PDF = {
  uri: 'file:///data/user/0/app/files/notes.pdf',
  fileName: 'notes.pdf',
  format: 'pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
};

beforeAll(async () => {
  await initDatabase();
});

describe('several chats per account', () => {
  it('starts in the first chat; New chat opens an empty one and keeps the old one', () => {
    const me = student();
    const first = chatStore.currentSessionId(me);
    expect(first).toBe(ownedChatSessionId(me));

    chatStore.addMessage(me, 'user', 'What is spaced repetition?');
    chatStore.addMessage(me, 'assistant', 'Reviewing at growing intervals.');

    const second = chatStore.startNewChat(me);
    expect(second.startsWith(NEW_CHAT_PREFIX)).toBe(true);
    expect(chatStore.currentSessionId(me)).toBe(second);
    expect(chatStore.getMessages(me)).toEqual([]);

    // Tapping New chat again while it is still empty reuses it.
    expect(chatStore.startNewChat(me)).toBe(second);

    chatStore.addMessage(me, 'user', 'Plan my week');
    expect(chatStore.getMessages(me).map(m => m.content)).toEqual([
      'Plan my week',
    ]);
    expect(chatStore.getMessages(me, first).map(m => m.content)).toEqual([
      'What is spaced repetition?',
      'Reviewing at growing intervals.',
    ]);
  });

  it('lists chats with messages, newest first, titled by the first question', () => {
    const me = student();
    chatStore.addMessage(
      me,
      'user',
      '  Explain\n photosynthesis   in detail please, with all six steps and examples  ',
    );
    chatStore.addMessage(me, 'assistant', 'Sure! Step 1...');
    const second = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'Hi');
    chatStore.startNewChat(me); // empty: not listed

    const chats = chatStore.listSessions(me);
    expect(chats.map(c => c.id)).toEqual([second, ownedChatSessionId(me)]);
    expect(chats[0]).toMatchObject({
      title: 'Hi',
      preview: 'Hi',
      messageCount: 1,
      customTitle: false,
    });
    expect(chats[1].title).toBe(
      'Explain photosynthesis in detail please, with all six steps…',
    );
    expect(chats[1].title.length).toBeLessThanOrEqual(60);
    expect(chats[1].preview).toBe('Sure! Step 1...');
  });

  it('searches titles and messages, treating % and _ literally', () => {
    const me = student();
    chatStore.addMessage(me, 'user', 'Thesis outline');
    chatStore.addMessage(me, 'assistant', 'Chapter 1 covers 100% of the intro');
    chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'Gym schedule');

    expect(chatStore.listSessions(me, 'chapter').map(c => c.title)).toEqual([
      'Thesis outline',
    ]);
    expect(chatStore.listSessions(me, 'GYM').map(c => c.title)).toEqual([
      'Gym schedule',
    ]);
    expect(chatStore.listSessions(me, '100%').map(c => c.title)).toEqual([
      'Thesis outline',
    ]);
    expect(chatStore.listSessions(me, '_')).toEqual([]);
    expect(chatStore.listSessions(me, 'nothing like this')).toEqual([]);
  });

  it('opens, renames and resets a title', () => {
    const me = student();
    chatStore.addMessage(me, 'user', 'First question');
    const second = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'Second question');

    chatStore.openSession(me, ownedChatSessionId(me));
    expect(chatStore.currentSessionId(me)).toBe(ownedChatSessionId(me));
    expect(localSettingsStore.get(me, CURRENT_CHAT_KEY)).toBeNull();

    chatStore.renameSession(me, second, '  Finals   plan  ');
    let titles = chatStore.listSessions(me).map(c => [c.title, c.customTitle]);
    expect(titles).toContainEqual(['Finals plan', true]);

    chatStore.renameSession(me, second, '   ');
    titles = chatStore.listSessions(me).map(c => [c.title, c.customTitle]);
    expect(titles).toContainEqual(['Second question', false]);
  });

  it('deleting the open chat opens an empty one and returns its files', () => {
    const me = student();
    chatStore.addMessage(me, 'user', 'Keep me');
    const second = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'Make a PDF');
    chatStore.addMessage(me, 'assistant', 'Here it is', PDF);

    expect(chatStore.hasAttachment(me, PDF.uri)).toBe(true);
    const {attachmentUris} = chatStore.deleteSession(me, second);
    expect(attachmentUris).toEqual([PDF.uri]);
    expect(chatStore.hasAttachment(me, PDF.uri)).toBe(false);

    const open = chatStore.currentSessionId(me);
    expect(open).not.toBe(second);
    expect(chatStore.getMessages(me)).toEqual([]);
    expect(chatStore.listSessions(me).map(c => c.title)).toEqual(['Keep me']);
  });

  it('deleting the first chat empties it and keeps the account usable', () => {
    const me = student();
    chatStore.addMessage(me, 'user', 'Old talk');
    const first = ownedChatSessionId(me);
    const page = chatStore.getMessagesPage(me, {limit: 1});
    chatStore.addMessage(me, 'assistant', 'Old reply');
    const cursor = chatStore.getMessagesPage(me, {limit: 1}).nextCursor;
    expect(page.items).toHaveLength(1);

    chatStore.deleteSession(me, first);
    expect(chatStore.listSessions(me)).toEqual([]);
    expect(chatStore.currentSessionId(me)).toBe(first);
    // An old position in the deleted chat no longer works.
    expect(() => chatStore.getMessagesPage(me, {before: cursor})).toThrow();
    chatStore.addMessage(me, 'user', 'Fresh start');
    expect(chatStore.getMessages(me).map(m => m.content)).toEqual([
      'Fresh start',
    ]);
  });

  it("never reads, writes, opens or deletes another account's chat", () => {
    const me = student();
    const other = student();
    chatStore.addMessage(other, 'user', 'Private');
    const theirs = chatStore.startNewChat(other);
    chatStore.addMessage(other, 'user', 'Also private', PDF);

    for (const id of [theirs, ownedChatSessionId(other)]) {
      expect(() => chatStore.openSession(me, id)).toThrow();
      expect(() =>
        chatStore.addMessage(me, 'user', 'x', null, null, id),
      ).toThrow();
      expect(() => chatStore.deleteSession(me, id)).toThrow();
      expect(() => chatStore.renameSession(me, id, 'mine')).toThrow();
      expect(() => chatStore.getMessagesPage(me, {sessionId: id})).toThrow();
      expect(chatStore.getMessages(me, id)).toEqual([]);
    }
    expect(chatStore.hasAttachment(me, PDF.uri)).toBe(false);
    expect(chatStore.listSessions(me)).toEqual([]);

    // A saved "open chat" pointing at someone else's chat is ignored.
    localSettingsStore.set(me, CURRENT_CHAT_KEY, theirs);
    expect(chatStore.currentSessionId(me)).toBe(ownedChatSessionId(me));
    expect(chatStore.getMessages(other).map(m => m.content)).toEqual([
      'Also private',
    ]);
  });

  it('never opens quarantined legacy history', () => {
    const me = student();
    const legacy = `${NEW_CHAT_PREFIX}legacy-${serial}`;
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, generation) VALUES (?, ?, 'x', ?, ?, 'g')`,
      [legacy, me, now, now],
    );
    db.executeSync(
      `INSERT INTO chat_legacy_quarantine (session_id, recorded_owner, message_count, reason, created_at)
       VALUES (?, ?, 0, 'multiple_local_accounts', ?)`,
      [legacy, me, now],
    );
    expect(() => chatStore.openSession(me, legacy)).toThrow();
    expect(() =>
      chatStore.addMessage(me, 'user', 'x', null, null, legacy),
    ).toThrow();
  });

  it('a reply can be written to the chat its question came from while another is open', () => {
    const me = student();
    const question = chatStore.addMessage(me, 'user', 'Long question');
    chatStore.startNewChat(me);
    chatStore.addMessage(
      me,
      'assistant',
      'Late answer',
      null,
      null,
      question.sessionId,
    );
    expect(chatStore.getMessages(me)).toEqual([]);
    expect(
      chatStore.getMessages(me, question.sessionId).map(m => m.content),
    ).toEqual(['Long question', 'Late answer']);
  });

  it('clearHistory removes every chat of the account (Clear All Data)', () => {
    const me = student();
    chatStore.addMessage(me, 'user', 'one');
    chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'two', PDF);
    expect(chatStore.getAttachmentUris(me)).toEqual([PDF.uri]);
    chatStore.clearHistory(me);
    expect(chatStore.listSessions(me)).toEqual([]);
    expect(chatStore.getAttachmentUris(me)).toEqual([]);
    expect(chatStore.currentSessionId(me)).toBe(ownedChatSessionId(me));
  });

  it('guest linking moves every chat and memory to the new account', () => {
    const guest = student();
    const account = student();
    chatStore.addMessage(guest, 'user', 'guest first');
    chatStore.startNewChat(guest);
    chatStore.addMessage(guest, 'user', 'guest second');
    chatMemoryStore.add(guest, 'Studies nursing.');

    db.transactionSync(tx => {
      transferChatOwnership(tx, guest, account);
      chatMemoryStore.transferFromGuest(tx, guest, account);
    });
    expect(
      chatStore
        .listSessions(account)
        .map(c => c.title)
        .sort(),
    ).toEqual(['guest first', 'guest second']);
    expect(chatStore.listSessions(guest)).toEqual([]);
    expect(chatMemoryStore.list(account).map(m => m.text)).toEqual([
      'Studies nursing.',
    ]);
    expect(chatMemoryStore.list(guest)).toEqual([]);
  });
});

describe('chat memory', () => {
  it('is on by default and can be turned off', () => {
    const me = student();
    expect(chatMemoryStore.isEnabled(me)).toBe(true);
    chatMemoryStore.add(me, 'Prefers short answers.');
    expect(chatMemoryStore.forPrompt(me).map(m => m.text)).toEqual([
      'Prefers short answers.',
    ]);
    expect(chatMemoryStore.setEnabled(me, false)).toBe(true);
    expect(chatMemoryStore.isEnabled(me)).toBe(false);
    expect(chatMemoryStore.forPrompt(me)).toEqual([]);
    // Turning it off keeps what was saved.
    expect(chatMemoryStore.list(me)).toHaveLength(1);
  });

  it('cleans text, skips empty and duplicate memories', () => {
    const me = student();
    expect(
      chatMemoryStore.add(me, '  Works   mornings \n at a cafe ')?.text,
    ).toBe('Works mornings at a cafe');
    expect(chatMemoryStore.add(me, 'works MORNINGS at a cafe')).toBeNull();
    expect(chatMemoryStore.add(me, '  ')).toBeNull();
    expect(chatMemoryStore.add(me, 'x'.repeat(500))?.text).toHaveLength(200);
  });

  it('keeps the newest memories within the limits', () => {
    const me = student();
    for (let i = 0; i < MAX_STORED_MEMORIES + 5; i += 1)
      chatMemoryStore.add(me, `Fact ${i}`);
    const all = chatMemoryStore.list(me);
    expect(all).toHaveLength(MAX_STORED_MEMORIES);
    expect(all[0].text).toBe(`Fact ${MAX_STORED_MEMORIES + 4}`);
    expect(all.some(m => m.text === 'Fact 0')).toBe(false);
    expect(chatMemoryStore.forPrompt(me)).toHaveLength(MAX_PROMPT_MEMORIES);
  });

  it('applies a server suggestion to this owner only, and undo puts it back', () => {
    const me = student();
    const other = student();
    const old = chatMemoryStore.add(me, 'Is in 1st year.')!;
    const theirs = chatMemoryStore.add(other, 'Their secret fact.')!;

    const changes = chatMemoryStore.applyChanges(
      me,
      {
        add: ['Is in 2nd year.', 'Is in 2nd year.'],
        remove: [old.id, theirs.id, 'missing'],
      },
      'session-x',
    );
    expect(changes.added.map(m => m.text)).toEqual(['Is in 2nd year.']);
    expect(changes.removed).toMatchObject([
      {id: old.id, text: 'Is in 1st year.'},
    ]);
    expect(chatMemoryStore.list(me).map(m => m.text)).toEqual([
      'Is in 2nd year.',
    ]);
    expect(chatMemoryStore.list(me)[0]).toMatchObject({
      source: 'chat',
      sessionId: 'session-x',
    });
    expect(chatMemoryStore.list(other).map(m => m.text)).toEqual([
      'Their secret fact.',
    ]);

    chatMemoryStore.undoChanges(me, changes);
    expect(chatMemoryStore.list(me).map(m => m.text)).toEqual([
      'Is in 1st year.',
    ]);
    expect(chatMemoryStore.list(me)[0].id).toBe(old.id);
  });

  it('records the change on the reply so Chat can show it', () => {
    const me = student();
    const reply = chatStore.addMessage(me, 'assistant', 'Noted!', null, {
      handbookNote: 'p. 4',
    });
    const changes = {
      added: [{id: 'mem_a', text: 'Likes mornings.'}],
      removed: [],
    };
    expect(chatStore.setMemoryChanges(me, reply.id, changes)).toBe(true);
    const saved = chatStore.getMessages(me).find(m => m.id === reply.id)!;
    expect(saved.memoryChanges).toEqual(changes);
    expect(saved.handbookNote).toBe('p. 4');

    expect(
      chatStore.setMemoryChanges(me, reply.id, {...changes, undone: true}),
    ).toBe(true);
    expect(chatStore.getMessages(me)[0].memoryChanges?.undone).toBe(true);

    const stranger = student();
    expect(chatStore.setMemoryChanges(stranger, reply.id, null)).toBe(false);
    expect(chatStore.getMessages(me)[0].memoryChanges?.undone).toBe(true);
  });

  it('refuses an invalid owner', () => {
    expect(() => chatMemoryStore.list('')).toThrow();
    expect(() => chatMemoryStore.add(' ', 'x')).toThrow();
    expect(chatMemoryStore.forPrompt('')).toEqual([]);
  });
});
