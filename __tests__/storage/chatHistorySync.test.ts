/**
 * Chat history sync (ADR-040) on real SQLite (node:sqlite): the outbox hooks
 * in chatStore, the remote apply rules, and the real `runSyncPass` against a
 * fake server that keeps state like LAFINA-backend's /v1/sync/batch and
 * /v1/sync/chat/purge. No network, no live backend. All chat text is made up.
 *
 * "Another phone" is the server feed: what it writes reaches this phone as
 * changes. "Reinstall" removes this phone's local data and signs in again
 * with a new local user id, as a fresh install does.
 */
import {DeviceEventEmitter} from 'react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {chatStore} from '../../src/storage/chatStore';
import {
  ChatLimitReachedError,
  isRemoteOnlyAttachment,
} from '../../src/storage/chatStore';
import {
  MAX_CHATS_PER_ACCOUNT,
  ownedChatSessionId,
} from '../../src/storage/chatOwnership';
import {
  CLOUD_DEFAULT_CHAT_ID,
  MAX_SYNCED_MESSAGE_CHARS,
  chatSyncStore,
  toCloudSessionId,
  toLocalSessionId,
} from '../../src/storage/chatSyncStore';
import {GUEST_USER_ID} from '../../src/constants';
import {cloudClient} from '../../src/cloud/cloudClient';
import {syncWorker} from '../../src/sync/syncWorker';
import {chatHistorySync} from '../../src/sync/chatHistorySync';
import {CHAT_REMOTE_CHANGED_EVENT} from '../../src/sync/chatSyncEvents';
import {
  AUTHORITATIVE_SYNC_ENTITY_TYPES,
  CHAT_SYNC_ENTITY_TYPES,
  CLIENT_SYNC_ENTITY_TYPES,
  declaredSyncEntityTypes,
} from '../../src/sync/syncEntityTypes';

type Json = Record<string, any>;

let serial = 0;
const newUser = (label: string, register = true): string => {
  serial += 1;
  const id = `chs-${label}-${serial}`;
  if (register) {
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, ?, ?)`,
      [id, id, `${id}@example.invalid`, now, now],
    );
  }
  return id;
};

const outbox = (userId: string): Json[] =>
  db
    .executeSync(
      `SELECT entity_type, entity_id, operation, payload, status FROM sync_outbox
       WHERE user_id = ? AND entity_type IN ('chat_session', 'chat_message')
       ORDER BY created_at, rowid`,
      [userId],
    )
    .rows.map((row: Json) => ({...row, payload: JSON.parse(row.payload)}));

const localMessages = (userId: string): Json[] =>
  db.executeSync(
    `SELECT m.id, m.session_id, m.sender, m.content, m.attachment_json, m.metadata_json
     FROM messages m JOIN chat_sessions s ON s.id = m.session_id
     WHERE s.user_id = ? ORDER BY m.created_at, m.seq`,
    [userId],
  ).rows;

const localSessions = (userId: string): Json[] =>
  db.executeSync(
    'SELECT id, title FROM chat_sessions WHERE user_id = ? ORDER BY created_at',
    [userId],
  ).rows;

/** A stateful stand-in for LAFINA-backend's sync and purge endpoints. */
class FakeServer {
  supported: string[] = [
    ...CLIENT_SYNC_ENTITY_TYPES,
    ...CHAT_SYNC_ENTITY_TYPES,
  ];
  rows = new Map<string, Json>();
  changes: Json[] = [];
  requests: Json[] = [];
  purgeAvailable = true;
  /** LAFINA-backend MAX_CHAT_SESSIONS_PER_ACCOUNT. */
  chatLimit = 20;
  private seq = 0;

  private stamp = () =>
    new Date(Date.UTC(2027, 0, 1, 0, 0, this.seq)).toISOString();

  private record(
    entityType: string,
    entityId: string,
    deleted: boolean,
    payload: Json,
  ): Json {
    const key = `${entityType}:${entityId}`;
    const version = (this.rows.get(key)?.version ?? 0) + 1;
    this.seq += 1;
    const updatedAt = this.stamp();
    const change = {
      changeId: this.seq,
      entityType,
      entityId,
      operation: deleted ? 'delete' : 'update',
      version,
      payload: deleted ? {} : payload,
      updatedAt,
      ...(deleted ? {deletedAt: updatedAt} : {}),
    };
    this.rows.set(key, {...change, deleted});
    this.changes.push(change);
    return change;
  }

  live(entityType: string): Json[] {
    return [...this.rows.values()].filter(
      row => row.entityType === entityType && !row.deleted,
    );
  }

  /** A write made by another phone of the same account. */
  write(entityType: string, entityId: string, payload: Json): void {
    if (entityType === 'chat_message') this.ensureSession(payload);
    this.record(entityType, entityId, false, payload);
  }

  remove(entityType: string, entityId: string): void {
    if (entityType === 'chat_session') {
      for (const message of this.live('chat_message')) {
        if (message.payload.session_id === entityId) {
          this.record('chat_message', message.entityId, true, {});
        }
      }
    }
    this.record(entityType, entityId, true, {});
  }

  private ensureSession(payload: Json): void {
    const session = this.rows.get(`chat_session:${payload.session_id}`);
    if (!session || session.deleted) {
      this.record('chat_session', payload.session_id, false, {
        title: '',
        kind: 'general',
        created_at: payload.created_at,
      });
    }
  }

  private mutate(m: Json): Json {
    const accepted = (serverVersion: number, reason?: string) => ({
      mutationId: m.mutationId,
      entityType: m.entityType,
      entityId: m.entityId,
      status: 'accepted',
      serverVersion,
      ...(reason ? {reason} : {}),
    });
    if (!CHAT_SYNC_ENTITY_TYPES.includes(m.entityType)) return accepted(1);
    const existing = this.rows.get(`${m.entityType}:${m.entityId}`);
    if (m.operation !== 'create' && existing?.deleted) {
      return accepted(existing.version, 'already_deleted');
    }
    if (m.operation !== 'delete') {
      // Like the backend: a write that would add a 21st live chat is refused.
      const sessionId =
        m.entityType === 'chat_session' ? m.entityId : m.payload.session_id;
      const session = this.rows.get(`chat_session:${sessionId}`);
      if (
        (!session || session.deleted) &&
        this.live('chat_session').length >= this.chatLimit
      ) {
        return {
          mutationId: m.mutationId,
          entityType: m.entityType,
          entityId: m.entityId,
          status: 'rejected',
          reason: 'chat_limit_reached',
          serverVersion: existing?.version ?? 0,
        };
      }
    }
    if (m.operation === 'delete') {
      if (!existing) return accepted(1);
      this.remove(m.entityType, m.entityId);
    } else {
      this.write(m.entityType, m.entityId, m.payload);
    }
    return accepted(this.rows.get(`${m.entityType}:${m.entityId}`)!.version);
  }

  private batch(body: Json): Json {
    const declared = (body.entityTypes as string[]).filter(type =>
      this.supported.includes(type),
    );
    const results = (body.mutations as Json[]).map(m => this.mutate(m));
    const base = {
      accepted: results.filter(r => r.status === 'accepted'),
      rejected: results.filter(r => r.status === 'rejected'),
      hasMore: false,
      resetRequired: false,
      serverTime: this.stamp(),
      supportedEntityTypes: [...this.supported],
    };
    if (body.snapshot) {
      const order = ['chat_session', 'chat_message'];
      const items = [...this.rows.values()]
        .filter(row => !row.deleted && declared.includes(row.entityType))
        .sort(
          (a, b) => order.indexOf(a.entityType) - order.indexOf(b.entityType),
        )
        .map(({deleted: _deleted, ...change}) => ({
          ...change,
          operation: 'update',
        }));
      return {
        ...base,
        changes: [],
        nextCursor: body.cursor,
        snapshot: {
          boundaryCursor: this.seq,
          items,
          nextAfter: null,
          hasMore: false,
          complete: true,
          authoritativeEntityTypes: [
            ...AUTHORITATIVE_SYNC_ENTITY_TYPES,
            ...CHAT_SYNC_ENTITY_TYPES,
          ].filter(type => declared.includes(type)),
          prunePolicy: {
            preserveOutboxStatuses: ['pending', 'in_progress', 'failed'],
            requireExistingSyncMetadata: true,
          },
        },
      };
    }
    const changes = this.changes.filter(
      change =>
        change.changeId > body.cursor && declared.includes(change.entityType),
    );
    return {
      ...base,
      changes,
      nextCursor: changes.length
        ? changes[changes.length - 1].changeId
        : body.cursor,
      snapshot: null,
    };
  }

  purge(): Json {
    let deletedMessages = 0;
    let deletedSessions = 0;
    for (const message of this.live('chat_message')) {
      this.record('chat_message', message.entityId, true, {});
      deletedMessages += 1;
    }
    for (const session of this.live('chat_session')) {
      this.record('chat_session', session.entityId, true, {});
      deletedSessions += 1;
    }
    return {deletedSessions, deletedMessages, serverTime: this.stamp()};
  }

  fetch = jest.fn(async (url: string, init: RequestInit) => {
    const respond = (status: number, payload: unknown) =>
      ({
        ok: status < 400,
        status,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      } as Response);
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    if (path === '/v1/sync/batch') {
      const body = JSON.parse(String(init.body));
      this.requests.push(body);
      return respond(200, this.batch(body));
    }
    if (path === '/v1/sync/chat/purge' && this.purgeAvailable) {
      return respond(200, this.purge());
    }
    return respond(404, {detail: 'Not Found'});
  });
}

const originalToken = cloudClient.getAccessToken;
const originalOnline = cloudClient.isOnline;
const previousFetch = global.fetch;
let server: FakeServer;
let online = true;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  server = new FakeServer();
  online = true;
  cloudClient.getAccessToken = () => 'synthetic-token';
  cloudClient.isOnline = async () => online;
  global.fetch = server.fetch as unknown as typeof fetch;
  // setEnabled starts a background pass; tests run passes themselves.
  jest.spyOn(syncWorker, 'performSync').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  cloudClient.getAccessToken = originalToken;
  cloudClient.isOnline = originalOnline;
  global.fetch = previousFetch;
});

/** Signs `userId` in on this phone and runs passes until chat is negotiated. */
const signInAndSync = async (userId: string): Promise<void> => {
  userStore.setCurrentUser(userId);
  await syncWorker.runSyncPass(); // learns that the server stores chat
  await syncWorker.runSyncPass(); // declares chat, takes its snapshot
};

const lastRequest = (): Json => server.requests[server.requests.length - 1];

describe('chat id mapping and type negotiation', () => {
  test("each phone's first chat travels as chat_default", () => {
    const me = newUser('map', false);
    const first = ownedChatSessionId(me);
    expect(toCloudSessionId(me, first)).toBe(CLOUD_DEFAULT_CHAT_ID);
    expect(toLocalSessionId(me, CLOUD_DEFAULT_CHAT_ID)).toBe(first);
    expect(toCloudSessionId(me, 'chat_session:abc')).toBe('chat_session:abc');
    expect(toLocalSessionId(me, 'chat_session:abc')).toBe('chat_session:abc');
    // Ids this app never makes are ignored, never written.
    expect(toLocalSessionId(me, 'default_chat_session:someone')).toBeNull();
    expect(toLocalSessionId(me, 'chat_session:')).toBeNull();
    expect(toLocalSessionId(me, `chat_session:${'x'.repeat(200)}`)).toBeNull();
    expect(toLocalSessionId(me, 42)).toBeNull();
  });

  test('chat is declared only when sync is on and the server lists it', () => {
    const all = [...CLIENT_SYNC_ENTITY_TYPES, ...CHAT_SYNC_ENTITY_TYPES];
    expect(declaredSyncEntityTypes(true, all)).toEqual(all);
    expect(declaredSyncEntityTypes(false, all)).toEqual([
      ...CLIENT_SYNC_ENTITY_TYPES,
    ]);
    expect(declaredSyncEntityTypes(true, CLIENT_SYNC_ENTITY_TYPES)).toEqual([
      ...CLIENT_SYNC_ENTITY_TYPES,
    ]);
    expect(
      declaredSyncEntityTypes(true, [
        ...CLIENT_SYNC_ENTITY_TYPES,
        'chat_session',
      ]),
    ).toEqual([...CLIENT_SYNC_ENTITY_TYPES]);
    expect(declaredSyncEntityTypes(true, null)).toEqual([
      ...CLIENT_SYNC_ENTITY_TYPES,
    ]);
  });
});

describe('outbox hooks in chatStore', () => {
  test('a message queues its chat first, without the file path or memory notice', () => {
    const me = newUser('hooks');
    const message = chatStore.addMessage(
      me,
      'user',
      'Summarize chapter 3',
      {
        uri: 'file:///data/user/0/app/files/chat_files/notes.pdf',
        fileName: 'notes.pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      },
      {
        handbookNote: 'Handbook p. 12',
        memoryChanges: {added: [], removed: [], undone: false} as any,
      },
    );
    const queued = outbox(me);
    expect(queued.map(row => [row.entity_type, row.operation])).toEqual([
      ['chat_session', 'create'],
      ['chat_message', 'create'],
    ]);
    expect(queued[0].entity_id).toBe(CLOUD_DEFAULT_CHAT_ID);
    expect(queued[0].payload).toEqual(
      expect.objectContaining({title: '', kind: 'general'}),
    );
    const payload = queued[1].payload;
    expect(queued[1].entity_id).toBe(message.id);
    expect(payload.session_id).toBe(CLOUD_DEFAULT_CHAT_ID);
    expect(payload.content).toBe('Summarize chapter 3');
    expect(payload.handbook_note).toBe('Handbook p. 12');
    expect(payload.attachment).toEqual({
      file_name: 'notes.pdf',
      format: 'pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
    });
    expect(JSON.stringify(payload)).not.toContain('file:///');
    expect(payload).not.toHaveProperty('memoryChanges');
    expect(payload).not.toHaveProperty('memory_changes');
  });

  test('guests and accounts with sync off queue nothing', () => {
    chatStore.addMessage(GUEST_USER_ID, 'user', 'guest note');
    expect(outbox(GUEST_USER_ID)).toEqual([]);

    const me = newUser('off');
    chatSyncStore.setEnabled(me, false);
    chatStore.addMessage(me, 'user', 'kept on this phone');
    expect(outbox(me)).toEqual([]);
    expect(chatSyncStore.needsNotice(me)).toBe(false);
    expect(chatSyncStore.needsNotice(GUEST_USER_ID)).toBe(false);
  });

  test('deleting a chat that was never sent drops its queued writes', () => {
    const me = newUser('drop');
    const chat = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'draft question', null, null, chat);
    expect(outbox(me)).toHaveLength(2);
    chatStore.deleteSession(me, chat);
    expect(outbox(me)).toEqual([]);
  });

  test('a rename of an empty chat is not sent; a rename of a sent chat is', () => {
    const me = newUser('rename');
    const empty = chatStore.startNewChat(me);
    chatStore.renameSession(me, empty, 'Nothing yet');
    expect(outbox(me)).toEqual([]);

    chatStore.addMessage(me, 'user', 'hello', null, null, empty);
    chatStore.renameSession(me, empty, 'Physics');
    const sessionWrites = outbox(me).filter(
      row => row.entity_type === 'chat_session',
    );
    expect(sessionWrites[sessionWrites.length - 1].payload.title).toBe(
      'Physics',
    );
  });
});

describe('sync passes against the fake server', () => {
  test('chats written offline upload when the phone reconnects', async () => {
    const me = newUser('offline');
    await signInAndSync(me);
    expect(lastRequest().entityTypes).toEqual(
      expect.arrayContaining([...CHAT_SYNC_ENTITY_TYPES]),
    );

    online = false;
    const chat = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'Exam on Friday?', null, null, chat);
    chatStore.addMessage(me, 'assistant', 'Yes, at 9 AM.', null, null, chat);
    const before = server.requests.length;
    await syncWorker.runSyncPass();
    expect(server.requests.length).toBe(before); // offline: nothing sent

    online = true;
    await syncWorker.runSyncPass();
    expect(server.live('chat_session').map(row => row.entityId)).toContain(
      toCloudSessionId(me, chat),
    );
    expect(
      server
        .live('chat_message')
        .map(row => row.payload.content)
        .sort(),
    ).toEqual(['Exam on Friday?', 'Yes, at 9 AM.']);
    // Acknowledged and recorded: nothing waits in the outbox.
    expect(outbox(me)).toEqual([]);
  });

  test('a server without chat support never sees chat', async () => {
    server.supported = [...CLIENT_SYNC_ENTITY_TYPES];
    const me = newUser('oldserver');
    chatStore.addMessage(me, 'user', 'stays here');
    await signInAndSync(me);
    for (const request of server.requests) {
      expect(request.entityTypes).toEqual([...CLIENT_SYNC_ENTITY_TYPES]);
      for (const mutation of request.mutations) {
        expect(CHAT_SYNC_ENTITY_TYPES).not.toContain(mutation.entityType);
      }
    }
    expect(localMessages(me).map(row => row.content)).toEqual(['stays here']);
  });

  test("another phone's chats arrive, the first chats merge, and the screen is told", async () => {
    const me = newUser('remote');
    await signInAndSync(me);
    const listener = jest.fn();
    const subscription = DeviceEventEmitter.addListener(
      CHAT_REMOTE_CHANGED_EVENT,
      listener,
    );
    try {
      server.write('chat_message', 'msg_remote_1', {
        session_id: CLOUD_DEFAULT_CHAT_ID,
        sender: 'user',
        content: 'Asked on my tablet',
        created_at: '2027-01-01T00:00:00.000Z',
        attachment: {
          file_name: 'syllabus.docx',
          format: 'docx',
          mime_type:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size_bytes: 900,
        },
      });
      server.write('chat_session', 'chat_session:remote_physics', {
        title: 'Physics review',
        kind: 'general',
        created_at: '2027-01-01T00:00:00.000Z',
      });
      server.write('chat_message', 'msg_remote_2', {
        session_id: 'chat_session:remote_physics',
        sender: 'assistant',
        content: 'Newton laws recap',
        created_at: '2027-01-01T00:00:01.000Z',
      });
      await syncWorker.runSyncPass();
    } finally {
      subscription.remove();
    }

    const messages = localMessages(me);
    const first = messages.find(row => row.id === 'msg_remote_1');
    expect(first?.session_id).toBe(ownedChatSessionId(me));
    const file = JSON.parse(first?.attachment_json);
    expect(file.uri).toBe('');
    expect(isRemoteOnlyAttachment(file)).toBe(true);
    expect(
      localSessions(me).find(row => row.id === 'chat_session:remote_physics')
        ?.title,
    ).toBe('Physics review');
    expect(listener).toHaveBeenCalledWith({userId: me});
    // Arrived changes are not sent back.
    expect(outbox(me)).toEqual([]);
  });

  test('a reinstall restores every chat from the cloud', async () => {
    const me = newUser('before');
    await signInAndSync(me);
    chatStore.addMessage(me, 'user', 'first chat question');
    const chat = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'calculus help', null, null, chat);
    chatStore.renameSession(me, chat, 'Calculus');
    await syncWorker.runSyncPass();

    // Reinstall: this phone's data is gone; a new local user signs in.
    for (const table of ['sync_outbox', 'sync_metadata', 'sync_state']) {
      db.executeSync(`DELETE FROM ${table} WHERE user_id = ?`, [me]);
    }
    db.executeSync(
      'DELETE FROM messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id = ?)',
      [me],
    );
    db.executeSync('DELETE FROM chat_sessions WHERE user_id = ?', [me]);
    const again = newUser('after');
    await signInAndSync(again);

    const restored = localMessages(again);
    expect(restored.map(row => [row.session_id, row.content])).toEqual([
      [ownedChatSessionId(again), 'first chat question'],
      [chat, 'calculus help'],
    ]);
    expect(localSessions(again).find(row => row.id === chat)?.title).toBe(
      'Calculus',
    );
    expect(outbox(again)).toEqual([]);
  });

  test('history from before sync was on uploads after the first snapshot', async () => {
    const me = newUser('backfill');
    chatSyncStore.setEnabled(me, false);
    chatStore.addMessage(me, 'user', 'written while sync was off');
    expect(outbox(me)).toEqual([]);
    chatHistorySync.setEnabled(me, true);
    await signInAndSync(me);
    expect(server.live('chat_message').map(row => row.payload.content)).toEqual(
      ['written while sync was off'],
    );
  });

  test('deleting a synced chat deletes it in the cloud with its messages', async () => {
    const me = newUser('delete');
    await signInAndSync(me);
    chatStore.addMessage(me, 'user', 'first chat stays');
    const chat = chatStore.startNewChat(me);
    expect(chat).not.toBe(ownedChatSessionId(me));
    chatStore.addMessage(me, 'user', 'to be deleted', null, null, chat);
    chatStore.addMessage(me, 'assistant', 'reply', null, null, chat);
    await syncWorker.runSyncPass();
    expect(server.live('chat_message')).toHaveLength(3);

    chatStore.deleteSession(me, chat);
    expect(outbox(me).map(row => [row.entity_type, row.operation])).toEqual([
      ['chat_session', 'delete'],
    ]);
    await syncWorker.runSyncPass();
    expect(server.live('chat_session').map(row => row.entityId)).not.toContain(
      chat,
    );
    expect(server.live('chat_message').map(row => row.payload.content)).toEqual(
      ['first chat stays'],
    );
    expect(localSessions(me).map(row => row.id)).not.toContain(chat);
  });

  test('a chat deleted on another phone goes; an unsent message here stays', async () => {
    const me = newUser('remotedelete');
    await signInAndSync(me);
    const chat = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'synced', null, null, chat);
    await syncWorker.runSyncPass();

    // The first chat: removed on the other phone, reset (not deleted) here.
    expect(chat).toBe(ownedChatSessionId(me));
    server.remove('chat_session', toCloudSessionId(me, chat));
    online = false;
    chatStore.addMessage(me, 'user', 'written offline', null, null, chat);
    online = true;
    await syncWorker.runSyncPass();

    // The synced message went with the chat; the newer one brought it back.
    expect(
      localMessages(me)
        .filter(row => row.session_id === chat)
        .map(row => row.content),
    ).toEqual(['written offline']);
    expect(server.live('chat_message').map(row => row.payload.content)).toEqual(
      ['written offline'],
    );
  });

  test('Clear chat history deletes the cloud copy too', async () => {
    const me = newUser('clear');
    await signInAndSync(me);
    chatStore.addMessage(me, 'user', 'one');
    const chat = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'two', null, null, chat);
    await syncWorker.runSyncPass();
    chatStore.clearHistory(me);
    await syncWorker.runSyncPass();
    expect(server.live('chat_message')).toEqual([]);
    expect(localMessages(me)).toEqual([]);
  });

  test("a message cut to the server's limit keeps its full text here", async () => {
    const me = newUser('long');
    await signInAndSync(me);
    const long = 'a'.repeat(MAX_SYNCED_MESSAGE_CHARS + 50);
    chatStore.addMessage(me, 'assistant', long);
    await syncWorker.runSyncPass();
    expect(server.live('chat_message')[0].payload.content).toHaveLength(
      MAX_SYNCED_MESSAGE_CHARS,
    );
    expect(localMessages(me)[0].content).toHaveLength(long.length);
  });
});

describe('Delete chat history from cloud', () => {
  test('removes the cloud copy, keeps chats here, and turns sync off', async () => {
    const me = newUser('purge');
    await signInAndSync(me);
    chatStore.addMessage(me, 'user', 'keep me on this phone');
    await syncWorker.runSyncPass();
    expect(server.live('chat_message')).toHaveLength(1);

    const result = await chatHistorySync.deleteCloudCopy(me);
    expect(result).toEqual({
      status: 'deleted',
      deletedSessions: 1,
      deletedMessages: 1,
    });
    expect(server.live('chat_message')).toEqual([]);
    expect(chatHistorySync.isEnabled(me)).toBe(false);

    await syncWorker.runSyncPass();
    expect(localMessages(me).map(row => row.content)).toEqual([
      'keep me on this phone',
    ]);
    expect(lastRequest().entityTypes).toEqual([...CLIENT_SYNC_ENTITY_TYPES]);

    // Turning it back on uploads this phone's chats again.
    chatHistorySync.setEnabled(me, true);
    await syncWorker.runSyncPass();
    expect(server.live('chat_message').map(row => row.payload.content)).toEqual(
      ['keep me on this phone'],
    );
    expect(localMessages(me)).toHaveLength(1);
  });

  test('reports offline, and an older server, without deleting anything', async () => {
    const me = newUser('purgefail');
    chatStore.addMessage(me, 'user', 'still here');
    online = false;
    expect((await chatHistorySync.deleteCloudCopy(me)).status).toBe('offline');
    online = true;
    server.purgeAvailable = false;
    expect((await chatHistorySync.deleteCloudCopy(me)).status).toBe(
      'unsupported',
    );
    expect(localMessages(me)).toHaveLength(1);
  });
});

const syncStatus = (userId: string): string =>
  String(
    db.executeSync('SELECT status FROM sync_state WHERE user_id = ?', [userId])
      .rows[0]?.status,
  );

const conflicts = (userId: string): number =>
  Number(
    db.executeSync(
      'SELECT COUNT(*) AS n FROM sync_conflicts WHERE user_id = ?',
      [userId],
    ).rows[0].n,
  );

/** Fills this phone with `count` chats that each hold one message. */
const fillChats = (userId: string, count: number): string[] => {
  const ids: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const chat =
      n === 0
        ? chatStore.currentSessionId(userId)
        : chatStore.startNewChat(userId);
    chatStore.addMessage(userId, 'user', `chat ${n + 1}`, null, null, chat);
    ids.push(chat);
  }
  return ids;
};

describe('the 20-chat limit', () => {
  test('an account keeps at most 20 chats; existing chats keep working', () => {
    expect(MAX_CHATS_PER_ACCOUNT).toBe(20);
    const me = newUser('limit');
    chatSyncStore.setEnabled(me, false);
    const chats = fillChats(me, MAX_CHATS_PER_ACCOUNT);
    expect(chatStore.chatLimit(me)).toEqual({
      count: 20,
      max: 20,
      reached: true,
    });

    expect(() => chatStore.startNewChat(me)).toThrow(ChatLimitReachedError);
    expect(() => chatStore.startNewUstpChat(me)).toThrow(ChatLimitReachedError);
    // Messages into chats that already exist are not limited.
    chatStore.addMessage(me, 'user', 'still here', null, null, chats[3]);
    expect(chatStore.chatLimit(me).count).toBe(20);

    // Deleting one makes room for exactly one.
    chatStore.deleteSession(me, chats[5]);
    const fresh = chatStore.startNewChat(me);
    expect(chatStore.chatLimit(me).count).toBe(19); // empty chats do not count
    chatStore.addMessage(me, 'user', 'new', null, null, fresh);
    expect(chatStore.chatLimit(me).reached).toBe(true);
    expect(chatStore.openLatestGeneralChat(me)).toBe(fresh);
  });

  test('the latest chat is the one written last, even within the same millisecond', () => {
    // CI runners are fast enough that two chats get the same timestamp; the
    // newest message (its global seq) must decide, not SQLite's row order.
    const me = newUser('same-ms');
    chatSyncStore.setEnabled(me, false);
    jest.useFakeTimers({now: new Date('2030-03-04T05:06:07.008Z')});
    try {
      const first = chatStore.startNewChat(me);
      chatStore.addMessage(me, 'user', 'one', null, null, first);
      const second = chatStore.startNewChat(me);
      chatStore.addMessage(me, 'user', 'two', null, null, second);
      chatStore.addMessage(me, 'user', 'one again', null, null, first);
      expect(chatStore.openLatestGeneralChat(me)).toBe(first);
      chatStore.addMessage(me, 'user', 'two again', null, null, second);
      expect(chatStore.openLatestGeneralChat(me)).toBe(second);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a first message into an empty chat is refused at the limit; nothing is saved', () => {
    const me = newUser('limitfirst');
    chatSyncStore.setEnabled(me, false);
    fillChats(me, MAX_CHATS_PER_ACCOUNT - 1);
    const empty = chatStore.startNewChat(me);
    // A chat arrives from another phone while this one is open and empty.
    db.transactionSync(tx =>
      chatSyncStore.applyRemoteMessage(
        tx,
        me,
        'msg_from_tablet',
        {
          session_id: 'chat_session:from_tablet',
          sender: 'user',
          content: 'written on the tablet',
          created_at: '2027-01-01T00:00:00.000Z',
        },
        '2027-01-01T00:00:00.000Z',
      ),
    );
    expect(chatStore.chatLimit(me).count).toBe(20);
    expect(() =>
      chatStore.addMessage(me, 'user', 'one too many', null, null, empty),
    ).toThrow(ChatLimitReachedError);
    expect(localMessages(me).map(row => row.content)).not.toContain(
      'one too many',
    );
  });

  test('chats the cloud refuses stay here, do not fail sync, and go up when room frees', async () => {
    const me = newUser('held');
    chatSyncStore.setEnabled(me, false);
    chatStore.addMessage(me, 'user', 'local A');
    const localB = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'local B', null, null, localB);
    // Another phone already filled the account.
    for (let n = 0; n < 20; n += 1) {
      server.write('chat_message', `msg_cloud${n}`, {
        session_id: `chat_session:cloud${n}`,
        sender: 'user',
        content: `cloud ${n}`,
        created_at: '2026-12-01T00:00:00.000Z',
      });
    }
    chatHistorySync.setEnabled(me, true);
    await signInAndSync(me);

    expect(server.live('chat_session')).toHaveLength(20);
    expect(chatSyncStore.heldChatCount(me)).toBe(2);
    expect(outbox(me)).toEqual([]);
    expect(syncStatus(me)).toBe('Synced');
    expect(conflicts(me)).toBe(0);
    expect(localMessages(me)).toHaveLength(22); // nothing removed here

    // Held chats are not sent again on every pass, even with new messages.
    chatStore.addMessage(me, 'user', 'more B', null, null, localB);
    expect(outbox(me)).toEqual([]);
    await syncWorker.runSyncPass();
    for (const mutation of lastRequest().mutations) {
      expect(CHAT_SYNC_ENTITY_TYPES).not.toContain(mutation.entityType);
    }

    // Another phone deletes a chat: one slot opens for the newest held chat.
    server.remove('chat_session', 'chat_session:cloud0');
    await syncWorker.runSyncPass(); // learns of the delete
    await syncWorker.runSyncPass(); // tries the held chats again
    const cloud = server.live('chat_session').map(row => row.entityId);
    expect(cloud).toHaveLength(20);
    expect(cloud).toContain(localB);
    expect(cloud).not.toContain(CLOUD_DEFAULT_CHAT_ID);
    expect(
      server
        .live('chat_message')
        .filter(row => row.payload.session_id === localB)
        .map(row => row.payload.content)
        .sort(),
    ).toEqual(['local B', 'more B']);
    expect(chatSyncStore.heldChatCount(me)).toBe(1);
    expect(syncStatus(me)).toBe('Synced');

    // Deleting the held chat here takes it off the held list.
    chatStore.deleteSession(me, ownedChatSessionId(me));
    expect(chatSyncStore.heldChatCount(me)).toBe(0);
    expect(outbox(me)).toEqual([]);
  });
});

describe('audit edge cases', () => {
  test('Delete from cloud waits for a running sync, which no longer sends chat', async () => {
    const me = newUser('purgeorder');
    const order: string[] = [];
    jest.spyOn(syncWorker, 'performSync').mockImplementation(async () => {
      order.push(
        `sync:${chatSyncStore.isEnabled(me) ? 'chat-on' : 'chat-off'}`,
      );
    });
    server.fetch.mockImplementationOnce(async () => {
      order.push('purge');
      return {
        ok: true,
        status: 200,
        json: async () => ({deletedSessions: 0, deletedMessages: 0}),
      } as Response;
    });
    await chatHistorySync.deleteCloudCopy(me);
    expect(order).toEqual(['sync:chat-off', 'purge']);
  });

  test('a phone that could not finish after the purge says so and keeps sync off', async () => {
    const me = newUser('purgefinish');
    jest.spyOn(chatSyncStore, 'forgetCloudState').mockImplementation(() => {
      throw new Error('disk full');
    });
    const result = await chatHistorySync.deleteCloudCopy(me);
    expect(result.status).toBe('failed');
    expect(chatHistorySync.isEnabled(me)).toBe(false);
  });

  test('the sync notice waits until the server stores chat', async () => {
    server.supported = [...CLIENT_SYNC_ENTITY_TYPES];
    const me = newUser('notice');
    await signInAndSync(me);
    expect(chatSyncStore.needsNotice(me)).toBe(false);
    expect(chatHistorySync.serverSupportsChat(me)).toBe(false);

    server.supported = [...CLIENT_SYNC_ENTITY_TYPES, ...CHAT_SYNC_ENTITY_TYPES];
    await syncWorker.runSyncPass();
    expect(chatHistorySync.serverSupportsChat(me)).toBe(true);
    expect(chatSyncStore.needsNotice(me)).toBe(true);
    chatSyncStore.markNoticeSeen(me);
    expect(chatSyncStore.needsNotice(me)).toBe(false);
  });

  test('a chat deleted while sync is off is removed from the cloud without uploading new messages', async () => {
    const me = newUser('offdelete');
    await signInAndSync(me);
    chatStore.addMessage(me, 'user', 'keep');
    const chat = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'gone', null, null, chat);
    await syncWorker.runSyncPass();

    chatHistorySync.setEnabled(me, false);
    chatStore.addMessage(
      me,
      'user',
      'phone only',
      null,
      null,
      ownedChatSessionId(me),
    );
    chatStore.deleteSession(me, chat);
    await syncWorker.runSyncPass();
    expect(server.live('chat_session').map(row => row.entityId)).not.toContain(
      chat,
    );
    expect(
      server.live('chat_message').map(row => row.payload.content),
    ).not.toContain('phone only');

    chatHistorySync.setEnabled(me, true);
    await syncWorker.runSyncPass();
    await syncWorker.runSyncPass();
    expect(server.live('chat_session').map(row => row.entityId)).not.toContain(
      chat,
    );
    expect(localMessages(me).map(row => row.content)).toEqual([
      'keep',
      'phone only',
    ]);
  });
});
