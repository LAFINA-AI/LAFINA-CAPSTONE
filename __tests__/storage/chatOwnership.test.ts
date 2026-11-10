/**
 * AGY-PORT 02: owner-bound Chat sessions, legacy shared-history quarantine,
 * stable paging with owner/session-bound cursors, and guest linking, on real
 * SQLite files through the real storage module stack.
 */
import {DatabaseService} from '../../src/storage/database';
import {initDatabase as initDatabaseWith} from '../../src/storage/dbInit';
import {
  buildSchema17Database,
  FIXTURE_ACCOUNT_A,
  FIXTURE_ACCOUNT_B,
  FIXTURE_GUEST,
  readUserVersion,
  snapshotAllRows,
} from '../fixtures/schema17Fixture';
import {createOwnedTempDirectory, openSqliteFile} from '../fixtures/sqliteFile';
import type {
  OwnedTempDirectory,
  SqliteTestConnection,
} from '../fixtures/sqliteFile';

type Storage = typeof import('../../src/storage');
type GuestMigration =
  typeof import('../../src/storage/guestMigration').guestMigration;

interface Stack {
  storage: Storage;
  guestMigration: GuestMigration;
  connection: SqliteTestConnection;
}

const PDF = {
  uri: 'file:///documents/a-only.pdf',
  fileName: 'a-only.pdf',
  format: 'pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
};

describe('AGY-PORT 02: Chat ownership and paging', () => {
  let directory: OwnedTempDirectory;
  let serial = 0;
  const open: SqliteTestConnection[] = [];

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    directory = createOwnedTempDirectory();
  });

  afterEach(() => {
    jest.useRealTimers();
    while (open.length) open.pop()?.close();
    directory.remove();
    jest.restoreAllMocks();
  });

  const newFile = (seed?: (c: SqliteTestConnection) => void): string => {
    serial += 1;
    const path = directory.file(`chat-${serial}.db`);
    if (seed) {
      const connection = openSqliteFile(path);
      seed(connection);
      connection.close();
    }
    return path;
  };

  const loadStack = async (path: string): Promise<Stack> => {
    const connection = openSqliteFile(path);
    open.push(connection);
    let storage!: Storage;
    let guestMigration!: GuestMigration;
    jest.isolateModules(() => {
      jest.doMock('@op-engineering/op-sqlite', () => ({
        open: () => connection,
      }));
      storage = require('../../src/storage');
      guestMigration =
        require('../../src/storage/guestMigration').guestMigration;
    });
    await storage.initDatabase();
    return {storage, guestMigration, connection};
  };

  const inspect = <T>(
    path: string,
    read: (c: SqliteTestConnection) => T,
  ): T => {
    const connection = openSqliteFile(path);
    try {
      return read(connection);
    } finally {
      connection.close();
    }
  };

  const atTime = (iso: string): void => {
    jest.useFakeTimers({
      now: new Date(iso),
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout'],
    });
  };

  describe('owner isolation (the shared default_chat_session leak)', () => {
    test('another account cannot read, clear or share the first account messages', async () => {
      const {storage} = await loadStack(newFile());
      const {chatStore} = storage;
      chatStore.addMessage('account-a', 'user', 'A private question');
      chatStore.addMessage('account-a', 'assistant', 'Here is your PDF', PDF);

      expect(chatStore.getMessages('account-b')).toEqual([]);
      expect(chatStore.getMessagesPage('account-b').items).toEqual([]);
      expect(chatStore.getRecentMessages('account-b', 10)).toEqual([]);
      expect(chatStore.getAttachmentUris('account-b')).toEqual([]);
      expect(chatStore.hasAttachment('account-b', PDF.uri)).toBe(false);
      expect(chatStore.hasAttachment('account-a', PDF.uri)).toBe(true);

      chatStore.addMessage('account-b', 'user', 'B question');
      chatStore.clearHistory('account-b');
      expect(chatStore.getMessages('account-a').map(m => m.content)).toEqual([
        'A private question',
        'Here is your PDF',
      ]);
      expect(chatStore.getMessages('account-b')).toEqual([]);
    });

    test('each owner gets a distinct, deterministic session id', async () => {
      const {storage} = await loadStack(newFile());
      const a = storage.chatStore.ensureDefaultSession('account-a');
      expect(storage.chatStore.ensureDefaultSession('account-a')).toBe(a);
      expect(a).toBe(storage.ownedChatSessionId('account-a'));
      expect(storage.chatStore.ensureDefaultSession('account-b')).not.toBe(a);
      expect(a).not.toBe('default_chat_session');
      // Encoding keeps owners whose ids differ only by separators distinct.
      expect(storage.ownedChatSessionId('a:b')).not.toBe(
        storage.ownedChatSessionId('a%3Ab'),
      );
    });

    test('an invalid owner is refused at every boundary', async () => {
      const {storage} = await loadStack(newFile());
      const {chatStore} = storage;
      for (const owner of ['', '   ', 'x'.repeat(257)]) {
        expect(() => chatStore.ensureDefaultSession(owner)).toThrow();
        expect(() => chatStore.addMessage(owner, 'user', 'hi')).toThrow();
        expect(() => chatStore.getMessagesPage(owner)).toThrow();
        expect(() => chatStore.clearHistory(owner)).toThrow();
        expect(chatStore.getMessages(owner)).toEqual([]);
        expect(chatStore.hasAttachment(owner, PDF.uri)).toBe(false);
      }
    });

    test('a message cannot be inserted into another owner session', async () => {
      const {storage} = await loadStack(newFile());
      const {chatStore} = storage;
      const aSession = chatStore.ensureDefaultSession('account-a');
      expect(() =>
        chatStore.insertMessage(
          {id: 'forged', sessionId: aSession, sender: 'user', content: 'x'},
          'account-b',
        ),
      ).toThrow('Chat message owner does not match its session.');
      expect(chatStore.getMessages('account-a')).toEqual([]);
    });

    test('a session row that claims another owner is refused, not reused', async () => {
      const {storage, connection} = await loadStack(newFile());
      const victim = storage.ownedChatSessionId('account-b');
      connection.executeSync(
        `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
         VALUES (?, 'account-a', 'Default Chat', 'x', 'x', 'g')`,
        [victim],
      );
      expect(() =>
        storage.chatStore.addMessage('account-b', 'user', 'x'),
      ).toThrow('Chat session ownership does not match the signed-in account.');
      expect(storage.chatStore.getMessages('account-b')).toEqual([]);
    });
  });

  describe('Handbook citation persistence', () => {
    test('the citation label is stored with the reply and survives a reload', async () => {
      const path = newFile();
      const first = await loadStack(path);
      first.storage.chatStore.addMessage(
        'account-a',
        'assistant',
        'Per the handbook',
        null,
        {
          handbookNote: 'Referenced USTP Student Handbook (p. 46)',
        },
      );
      first.storage.chatStore.addMessage(
        'account-a',
        'assistant',
        'No citation',
      );
      first.connection.close();

      const second = await loadStack(path);
      const items = second.storage.chatStore.getMessagesPage('account-a').items;
      expect(items.map(m => m.handbookNote)).toEqual([
        'Referenced USTP Student Handbook (p. 46)',
        null,
      ]);
    });
  });

  describe('paging', () => {
    const seedMessages = (
      storage: Storage,
      owner: string,
      count: number,
    ): void => {
      for (let i = 0; i < count; i += 1) {
        // Two messages per millisecond: a question and its reply.
        jest.setSystemTime(
          new Date(Date.UTC(2026, 10, 6, 0, 0, 0, Math.floor(i / 2))),
        );
        storage.chatStore.addMessage(
          owner,
          i % 2 === 0 ? 'user' : 'assistant',
          `message ${i}`,
        );
      }
    };

    test('the newest page holds 50 and load-earlier walks back without gaps or duplicates', async () => {
      atTime('2026-11-06T00:00:00.000Z');
      const {storage} = await loadStack(newFile());
      seedMessages(storage, 'account-a', 123);

      const newest = storage.chatStore.getMessagesPage('account-a');
      expect(storage.CHAT_PAGE_SIZE).toBe(50);
      expect(newest.items).toHaveLength(50);
      expect(newest.items[49].content).toBe('message 122');
      expect(newest.nextCursor).not.toBeNull();

      const seen: string[] = [...newest.items.map(m => m.content)];
      let cursor = newest.nextCursor;
      let pages = 1;
      while (cursor) {
        const page = storage.chatStore.getMessagesPage('account-a', {
          before: cursor,
        });
        seen.unshift(...page.items.map(m => m.content));
        cursor = page.nextCursor;
        pages += 1;
      }
      expect(pages).toBe(3);
      expect(seen).toEqual(Array.from({length: 123}, (_, i) => `message ${i}`));
      expect(new Set(seen).size).toBe(123);
    });

    test('a user message stays before the reply written in the same millisecond', async () => {
      atTime('2026-11-06T00:00:00.000Z');
      const {storage} = await loadStack(newFile());
      storage.chatStore.addMessage('account-a', 'user', 'question');
      storage.chatStore.addMessage('account-a', 'assistant', 'answer');
      const items = storage.chatStore.getMessagesPage('account-a').items;
      expect(items[0].createdAt).toBe(items[1].createdAt);
      expect(items.map(m => m.sender)).toEqual(['user', 'assistant']);
      expect(items[0].sequence).toBeLessThan(items[1].sequence ?? 0);

      // A page boundary between the two still keeps both, in order.
      const last = storage.chatStore.getMessagesPage('account-a', {limit: 1});
      expect(last.items.map(m => m.content)).toEqual(['answer']);
      const before = storage.chatStore.getMessagesPage('account-a', {
        before: last.nextCursor,
      });
      expect(before.items.map(m => m.content)).toEqual(['question']);
      expect(before.nextCursor).toBeNull();
    });

    test('messages written after a cursor was issued do not shift earlier pages', async () => {
      atTime('2026-11-06T00:00:00.000Z');
      const {storage} = await loadStack(newFile());
      seedMessages(storage, 'account-a', 60);
      const newest = storage.chatStore.getMessagesPage('account-a');
      jest.setSystemTime(new Date('2026-11-06T01:00:00.000Z'));
      storage.chatStore.addMessage('account-a', 'user', 'later');
      const earlier = storage.chatStore.getMessagesPage('account-a', {
        before: newest.nextCursor,
      });
      expect(earlier.items.map(m => m.content)).toEqual(
        Array.from({length: 10}, (_, i) => `message ${i}`),
      );
    });

    test('malformed, tampered, cross-owner and wrong-version cursors are rejected', async () => {
      atTime('2026-11-06T00:00:00.000Z');
      const {storage} = await loadStack(newFile());
      seedMessages(storage, 'account-a', 3);
      seedMessages(storage, 'account-b', 3);
      const cursor = storage.chatStore.getMessagesPage('account-a', {limit: 1})
        .nextCursor as string;
      const parts = JSON.parse(cursor) as unknown[];
      const tamper = (index: number, value: unknown): string =>
        JSON.stringify(parts.map((p, i) => (i === index ? value : p)));
      const bad = [
        '',
        'not json',
        '{}',
        '[]',
        JSON.stringify(parts.slice(0, 5)),
        tamper(0, 2),
        tamper(1, 'account-b'),
        tamper(2, storage.ownedChatSessionId('account-b')),
        tamper(3, 'another-generation'),
        tamper(4, ''),
        tamper(5, 0),
        tamper(5, 1.5),
        tamper(5, '3'),
      ];
      for (const raw of bad) {
        expect(() =>
          storage.chatStore.getMessagesPage('account-a', {before: raw}),
        ).toThrow(storage.InvalidChatCursorError);
      }
      // Account B cannot use account A's cursor, even unmodified.
      expect(() =>
        storage.chatStore.getMessagesPage('account-b', {before: cursor}),
      ).toThrow(storage.InvalidChatCursorError);
      expect(
        storage.chatStore.getMessagesPage('account-a', {before: cursor}).items,
      ).toHaveLength(2);
      expect(() =>
        storage.chatStore.getMessagesPage('account-a', {limit: 0}),
      ).toThrow();
      expect(() =>
        storage.chatStore.getMessagesPage('account-a', {limit: 101}),
      ).toThrow();
    });

    test('clearing history invalidates outstanding cursors only by emptying them', async () => {
      atTime('2026-11-06T00:00:00.000Z');
      const {storage} = await loadStack(newFile());
      seedMessages(storage, 'account-a', 4);
      const cursor = storage.chatStore.getMessagesPage('account-a', {
        limit: 2,
      }).nextCursor;
      storage.chatStore.clearHistory('account-a');
      expect(
        storage.chatStore.getMessagesPage('account-a', {before: cursor}).items,
      ).toEqual([]);
    });
  });

  describe('guest linking', () => {
    test('moves guest history to the account, keeps existing history and invalidates guest cursors', async () => {
      atTime('2026-11-06T00:00:00.000Z');
      const {storage, guestMigration} = await loadStack(newFile());
      storage.userStore.createGuestUser();
      const guest = FIXTURE_GUEST;
      storage.chatStore.addMessage('cloud-x', 'user', 'earlier on the account');
      jest.setSystemTime(new Date('2026-11-06T00:00:01.000Z'));
      storage.chatStore.addMessage(guest, 'user', 'guest question');
      storage.chatStore.addMessage(guest, 'assistant', 'guest answer', PDF, {
        handbookNote: 'Referenced USTP Student Handbook (p. 3)',
      });
      const guestCursor = storage.chatStore.getMessagesPage(guest, {limit: 1})
        .nextCursor as string;
      expect(guestCursor).not.toBeNull();

      jest.setSystemTime(new Date('2026-11-06T00:00:02.000Z'));
      await guestMigration.linkGuestToCloudAccount(
        'cloud-x',
        'x@example.invalid',
      );

      const moved = storage.chatStore.getMessagesPage('cloud-x').items;
      expect(moved.map(m => m.content)).toEqual([
        'earlier on the account',
        'guest question',
        'guest answer',
      ]);
      expect(moved[2].handbookNote).toBe(
        'Referenced USTP Student Handbook (p. 3)',
      );
      expect(storage.chatStore.hasAttachment('cloud-x', PDF.uri)).toBe(true);
      expect(
        moved.every(m => m.sessionId === storage.ownedChatSessionId('cloud-x')),
      ).toBe(true);

      expect(storage.chatStore.getMessages(guest)).toEqual([]);
      expect(storage.chatStore.hasAttachment(guest, PDF.uri)).toBe(false);
      expect(() =>
        storage.chatStore.getMessagesPage('cloud-x', {before: guestCursor}),
      ).toThrow(storage.InvalidChatCursorError);
      // A new guest session is a new generation: the old cursor never matches it.
      expect(() =>
        storage.chatStore.getMessagesPage(guest, {before: guestCursor}),
      ).toThrow(storage.InvalidChatCursorError);
    });

    test('a failure during linking leaves the guest history where it was', async () => {
      const {storage, guestMigration, connection} = await loadStack(newFile());
      storage.userStore.createGuestUser();
      storage.chatStore.addMessage(FIXTURE_GUEST, 'user', 'keep me');
      connection.failWhen = query => /UPDATE user_behavior_logs/.test(query);
      await expect(
        guestMigration.linkGuestToCloudAccount('cloud-y', 'y@example.invalid'),
      ).rejects.toThrow();
      connection.failWhen = null;
      expect(
        storage.chatStore.getMessages(FIXTURE_GUEST).map(m => m.content),
      ).toEqual(['keep me']);
      expect(storage.chatStore.getMessages('cloud-y')).toEqual([]);
    });
  });

  describe('legacy shared history (schema 17 upgrade)', () => {
    test('with several local accounts the shared history is quarantined, hidden and kept', async () => {
      const path = newFile(buildSchema17Database);
      const {storage} = await loadStack(path);
      const {chatStore} = storage;

      for (const owner of [
        FIXTURE_ACCOUNT_A,
        FIXTURE_ACCOUNT_B,
        FIXTURE_GUEST,
      ]) {
        expect(chatStore.getMessages(owner)).toEqual([]);
        expect(chatStore.getMessagesPage(owner).items).toEqual([]);
        expect(
          chatStore.hasAttachment(owner, 'file:///documents/fixture.pdf'),
        ).toBe(false);
        chatStore.clearHistory(owner);
      }
      expect(chatStore.getLegacyQuarantineSummary()).toEqual({
        sessionCount: 1,
        messageCount: 3,
      });

      const remaining = inspect(
        path,
        c =>
          c.executeSync(
            "SELECT id FROM messages WHERE session_id = 'default_chat_session' ORDER BY seq",
          ).rows,
      );
      expect(remaining).toEqual([
        {id: 'm-user'},
        {id: 'm-cited'},
        {id: 'm-doc'},
      ]);
    });

    test('quarantined history never moves on guest linking', async () => {
      const path = newFile(buildSchema17Database);
      const {storage, guestMigration} = await loadStack(path);
      await guestMigration.linkGuestToCloudAccount(
        'cloud-z',
        'z@example.invalid',
      );
      expect(storage.chatStore.getMessages('cloud-z')).toEqual([]);
      expect(storage.chatStore.getLegacyQuarantineSummary().messageCount).toBe(
        3,
      );
      expect(
        inspect(
          path,
          c =>
            c.executeSync(
              "SELECT user_id FROM chat_sessions WHERE id = 'default_chat_session'",
            ).rows,
        ),
      ).toEqual([{user_id: FIXTURE_ACCOUNT_A}]);
    });

    test('when the recorded owner is the only account, the history is adopted in order', async () => {
      const path = newFile(connection => {
        buildSchema17Database(connection);
        connection.exec('PRAGMA foreign_keys = OFF;');
        connection.executeSync('DELETE FROM users WHERE id <> ?', [
          FIXTURE_ACCOUNT_A,
        ]);
      });
      const {storage} = await loadStack(path);
      const items = storage.chatStore.getMessagesPage(FIXTURE_ACCOUNT_A).items;
      expect(items.map(m => m.id)).toEqual(['m-user', 'm-cited', 'm-doc']);
      expect(items[2].attachment?.uri).toBe('file:///documents/fixture.pdf');
      expect(
        storage.chatStore.hasAttachment(
          FIXTURE_ACCOUNT_A,
          'file:///documents/fixture.pdf',
        ),
      ).toBe(true);
      expect(storage.chatStore.getLegacyQuarantineSummary()).toEqual({
        sessionCount: 0,
        messageCount: 0,
      });
      expect(storage.chatStore.getMessages('someone-else')).toEqual([]);
    });

    test('accounts created after the newest legacy message cannot claim it, so the recorded owner adopts it', async () => {
      const path = newFile(connection => {
        buildSchema17Database(connection);
        // The guest and account B rows appeared only after the last message
        // (for example the guest row recreated on demand).
        connection.executeSync(
          "UPDATE users SET created_at = '2026-11-07T00:00:00.000Z' WHERE id <> ?",
          [FIXTURE_ACCOUNT_A],
        );
      });
      const {storage} = await loadStack(path);
      expect(
        storage.chatStore.getMessagesPage(FIXTURE_ACCOUNT_A).items.map(m => m.id),
      ).toEqual(['m-user', 'm-cited', 'm-doc']);
      expect(storage.chatStore.getMessages(FIXTURE_ACCOUNT_B)).toEqual([]);
      expect(storage.chatStore.getMessages(FIXTURE_GUEST)).toEqual([]);
      expect(storage.chatStore.getLegacyQuarantineSummary().messageCount).toBe(
        0,
      );
    });

    test('an account that already existed when the history was written keeps it quarantined', async () => {
      const path = newFile(connection => {
        buildSchema17Database(connection);
        connection.executeSync(
          "UPDATE users SET created_at = '2026-11-07T00:00:00.000Z' WHERE id NOT IN (?, ?)",
          [FIXTURE_ACCOUNT_A, FIXTURE_GUEST],
        );
      });
      const {storage} = await loadStack(path);
      expect(storage.chatStore.getMessages(FIXTURE_ACCOUNT_A)).toEqual([]);
      expect(storage.chatStore.getLegacyQuarantineSummary().messageCount).toBe(
        3,
      );
    });

    test('when the recorded owner no longer exists, the history is quarantined', async () => {
      const path = newFile(connection => {
        buildSchema17Database(connection);
        connection.exec('PRAGMA foreign_keys = OFF;');
        connection.executeSync('DELETE FROM users WHERE id <> ?', [
          FIXTURE_ACCOUNT_B,
        ]);
      });
      const {storage} = await loadStack(path);
      expect(storage.chatStore.getMessages(FIXTURE_ACCOUNT_B)).toEqual([]);
      expect(
        inspect(
          path,
          c =>
            c.executeSync(
              'SELECT recorded_owner, reason FROM chat_legacy_quarantine',
            ).rows,
        ),
      ).toEqual([
        {recorded_owner: FIXTURE_ACCOUNT_A, reason: 'recorded_owner_missing'},
      ]);
    });

    test('a failure inside the schema 18 step leaves schema 17 intact and retries next launch', async () => {
      const path = newFile(buildSchema17Database);
      const before = inspect(path, snapshotAllRows);

      const failing = openSqliteFile(path);
      failing.failWhen = query =>
        /INSERT INTO chat_legacy_quarantine/.test(query);
      const service = new DatabaseService(() => failing);
      await expect(initDatabaseWith(service)).rejects.toThrow();
      expect(service.getHealth().reason).toBe('migration_failed');
      failing.close();
      expect(inspect(path, snapshotAllRows)).toEqual(before);
      expect(inspect(path, readUserVersion)).toBe(17);

      const {storage} = await loadStack(path);
      expect(storage.db.getHealth().status).toBe('ready');
      expect(storage.chatStore.getLegacyQuarantineSummary().messageCount).toBe(
        3,
      );
    });

    test('reopening after the upgrade changes nothing', async () => {
      const path = newFile(buildSchema17Database);
      const first = await loadStack(path);
      first.connection.close();
      const once = inspect(path, snapshotAllRows);
      const second = await loadStack(path);
      second.connection.close();
      expect(inspect(path, snapshotAllRows)).toEqual(once);
    });
  });
});
