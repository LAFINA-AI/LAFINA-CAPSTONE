/**
 * AGY-PORT 07: revision-checked Notes edits, the derived search cache, keyset
 * pages and safe reorder, on real SQLite (node:sqlite).
 *
 * All note content is synthetic. Large bodies are checked by SHA-256
 * fingerprint, never printed. The sync tests run the real `runSyncPass`
 * against a fake server (no network, no live backend).
 */
import crypto from 'crypto';
import {
  db,
  guestMigration,
  initDatabase,
  InvalidNotesQueryError,
  isNoteEditConflict,
  notesEditStore,
  notesQueryStore,
  notesStore,
  userStore,
} from '../../src/storage';
import type {NoteSnapshot} from '../../src/storage';
import {
  escapeLike,
  INDEX_BATCH,
  INDEX_CHAR_BUDGET,
  MAX_INDEXED_BODY_CHARS,
  normalizeNoteForSearch,
} from '../../src/storage/notesQueryStore';
import {GUEST_USER_ID} from '../../src/constants';
import {cloudClient} from '../../src/cloud/cloudClient';
import {syncWorker} from '../../src/sync/syncWorker';
import {
  AUTHORITATIVE_SYNC_ENTITY_TYPES,
  CLIENT_SYNC_ENTITY_TYPES,
} from '../../src/sync/syncEntityTypes';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  return `p07-${label}-${serial}`;
};

const STAMP = '2026-11-01T08:00:00.000Z';

/** Raw insert, as sync or an older code path would write it. */
const seedNote = (
  userId: string,
  fields: {
    id?: string;
    title?: string;
    body?: string;
    category?: string;
    pinned?: boolean;
    voice?: boolean;
    sortOrder?: number;
    updatedAt?: string;
  } = {},
): string => {
  serial += 1;
  const id = fields.id ?? `note-${String(serial).padStart(6, '0')}`;
  db.executeSync(
    `INSERT INTO notes (id, user_id, title, body, is_pinned, tags, category, is_voice_transcribed, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      fields.title ?? `Title ${id}`,
      fields.body ?? `Body ${id}`,
      fields.pinned ? 1 : 0,
      fields.category ?? 'Personal',
      fields.voice ? 1 : 0,
      fields.sortOrder ?? 0,
      STAMP,
      fields.updatedAt ?? STAMP,
    ],
  );
  return id;
};

const snapshot = (userId: string, id: string): NoteSnapshot => {
  const found = notesEditStore.getSnapshot(userId, id);
  if (!found) throw new Error(`missing note ${id}`);
  return found;
};

const target = (note: NoteSnapshot) => ({
  id: note.id,
  userId: note.userId,
  revision: note.revision,
});

const bodyOf = (id: string): string =>
  String(
    db.executeSync('SELECT body FROM notes WHERE id = ?', [id]).rows[0]?.body,
  );

const failureOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (isNoteEditConflict(error)) return error.reason;
    throw error;
  }
  return 'none';
};

const allPages = (
  userId: string,
  query: {filter?: string; search?: string; limit?: number} = {},
): NoteSnapshot[] => {
  const out: NoteSnapshot[] = [];
  let after: string | null = null;
  for (let guard = 0; guard < 200; guard += 1) {
    const page = notesQueryStore.page({userId, ...query, after});
    out.push(...page.items);
    after = page.nextCursor;
    if (!after) break;
  }
  return out;
};

/** Search until the cache is complete, as the screen does. */
const searchAll = (userId: string, search: string): NoteSnapshot[] => {
  for (let guard = 0; guard < 50; guard += 1) {
    if (!notesQueryStore.page({userId, search}).indexing) break;
  }
  return allPages(userId, {search});
};

const cacheRows = (userId: string): number =>
  Number(
    db.executeSync(
      'SELECT COUNT(*) AS n FROM notes_search_index WHERE user_id = ?',
      [userId],
    ).rows[0]?.n ?? 0,
  );

describe('AGY-PORT 07 Notes consistency, search and pages', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db.executeSync('DELETE FROM active_session');
  });

  describe('revision-checked edits', () => {
    test('a save over the revision the editor saw succeeds and returns the new revision', () => {
      const me = owner('save');
      const id = seedNote(me, {body: 'first'});
      const opened = snapshot(me, id);
      const saved = notesEditStore.save(target(opened), {body: 'second'});
      expect(saved.body).toBe('second');
      expect(saved.revision).toBe(opened.revision + 1);
      // The same stale target cannot save again.
      expect(
        failureOf(() => notesEditStore.save(target(opened), {body: 'third'})),
      ).toBe('changed');
      expect(bodyOf(id)).toBe('second');
    });

    test('a newer write by another writer is never overwritten or deleted by a stale editor', () => {
      const me = owner('stale');
      const id = seedNote(me, {body: 'editor saw this'});
      const opened = snapshot(me, id);
      notesStore.update({id, body: 'newer from another editor'});

      expect(
        failureOf(() =>
          notesEditStore.save(target(opened), {body: 'stale draft'}),
        ),
      ).toBe('changed');
      expect(failureOf(() => notesEditStore.remove(target(opened)))).toBe(
        'changed',
      );
      expect(bodyOf(id)).toBe('newer from another editor');
      expect(
        db.executeSync('SELECT deleted_at FROM notes WHERE id = ?', [id])
          .rows[0]?.deleted_at,
      ).toBeNull();
    });

    test('a note deleted elsewhere refuses the save as "deleted"', () => {
      const me = owner('deleted');
      const id = seedNote(me);
      const opened = snapshot(me, id);
      notesStore.delete(id);
      expect(
        failureOf(() => notesEditStore.save(target(opened), {title: 'x'})),
      ).toBe('deleted');
    });

    test('another signed-in account, or a note now owned by someone else, refuses as "owner_changed"', () => {
      const me = owner('owner');
      const other = owner('other');
      const id = seedNote(me);
      const opened = snapshot(me, id);

      userStore.setCurrentUser(other);
      expect(
        failureOf(() => notesEditStore.save(target(opened), {title: 'x'})),
      ).toBe('owner_changed');
      expect(
        failureOf(() =>
          notesEditStore.create({
            id: `${me}-new`,
            userId: me,
            title: 't',
            body: 'b',
            category: 'Personal',
            isPinned: false,
            tags: [],
            isVoiceTranscribed: false,
          }),
        ),
      ).toBe('owner_changed');
      db.executeSync('DELETE FROM active_session');

      db.executeSync('UPDATE notes SET user_id = ? WHERE id = ?', [other, id]);
      expect(
        failureOf(() => notesEditStore.save(target(opened), {title: 'x'})),
      ).toBe('owner_changed');
      expect(notesEditStore.getSnapshot(me, id)).toBeNull();
    });

    test('a failed save rolls back: no content, revision or outbox change', () => {
      const me = owner('fail');
      const id = seedNote(me, {body: 'kept'});
      const opened = snapshot(me, id);
      const outboxBefore = Number(
        db.executeSync(
          'SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ?',
          [me],
        ).rows[0]?.n,
      );
      jest.spyOn(notesStore, 'update').mockImplementation(() => {
        throw new Error('disk full');
      });
      expect(() =>
        notesEditStore.save(target(opened), {body: 'lost?'}),
      ).toThrow('disk full');
      jest.restoreAllMocks();
      expect(bodyOf(id)).toBe('kept');
      expect(snapshot(me, id).revision).toBe(opened.revision);
      expect(
        Number(
          db.executeSync(
            'SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ?',
            [me],
          ).rows[0]?.n,
        ),
      ).toBe(outboxBefore);
    });
  });

  describe('search cache', () => {
    test('rich variants are searchable without rewriting the stored body', () => {
      const me = owner('rich');
      const html = seedNote(me, {
        body: '<p>The <b>Quantum</b> tunnelling lab</p>',
      });
      const md = seedNote(me, {
        body: '# Heading\n**Thermodynamics** review\n- [ ] buy chalk',
      });
      seedNote(me, {body: 'unrelated'});
      const before = [bodyOf(html), bodyOf(md)];

      expect(searchAll(me, 'quantum').map(n => n.id)).toEqual([html]);
      expect(searchAll(me, 'THERMODYNAMICS').map(n => n.id)).toEqual([md]);
      expect(searchAll(me, 'buy chalk').map(n => n.id)).toEqual([md]);
      // Markup is not searchable text.
      expect(searchAll(me, '<b>')).toEqual([]);
      expect([bodyOf(html), bodyOf(md)]).toEqual(before);
    });

    test('%, _ and backslash are literal characters, not wildcards', () => {
      const me = owner('like');
      const pct = seedNote(me, {body: 'scored 100% on the quiz'});
      seedNote(me, {body: 'scored 1000 on the quiz'});
      const under = seedNote(me, {body: 'file_name.txt'});
      seedNote(me, {body: 'fileXname.txt'});
      const slash = seedNote(me, {body: 'C:\\temp folder'});

      expect(searchAll(me, '100%').map(n => n.id)).toEqual([pct]);
      expect(searchAll(me, 'file_name').map(n => n.id)).toEqual([under]);
      expect(searchAll(me, ':\\t').map(n => n.id)).toEqual([slash]);
      expect(searchAll(me, '%')).toHaveLength(1);
      expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    });

    test('every writer invalidates the cache: manual, raw/sync-style, category rename and delete', () => {
      const me = owner('invalidate');
      const id = seedNote(me, {title: 'Plan', body: 'alpha', category: 'Lab'});
      expect(searchAll(me, 'alpha').map(n => n.id)).toEqual([id]);
      expect(cacheRows(me)).toBe(1);

      notesStore.update({id, body: 'beta'});
      expect(cacheRows(me)).toBe(0);
      expect(searchAll(me, 'alpha')).toEqual([]);
      expect(searchAll(me, 'beta').map(n => n.id)).toEqual([id]);

      db.executeSync('UPDATE notes SET title = ? WHERE id = ?', [
        'Gamma plan',
        id,
      ]);
      expect(searchAll(me, 'gamma').map(n => n.id)).toEqual([id]);

      notesStore.updateCustomCategory(me, 'Lab', 'Laboratory', '#123456');
      expect(cacheRows(me)).toBe(0);
      expect(allPages(me, {filter: 'Laboratory'}).map(n => n.id)).toEqual([id]);

      notesStore.delete(id);
      expect(searchAll(me, 'gamma')).toEqual([]);
    });

    test('indexing is bounded per call, reports progress and survives reopening', () => {
      const me = owner('index');
      for (let i = 0; i < INDEX_BATCH * 2 + 10; i += 1) {
        seedNote(me, {body: `entry ${i} keyword`});
      }
      const first = notesQueryStore.page({userId: me, search: 'keyword'});
      expect(first.indexing).toBe(true);
      expect(cacheRows(me)).toBe(INDEX_BATCH);
      expect(
        notesQueryStore.page({userId: me, search: 'keyword'}).indexing,
      ).toBe(true);
      expect(cacheRows(me)).toBe(INDEX_BATCH * 2);
      expect(
        notesQueryStore.page({userId: me, search: 'keyword'}).indexing,
      ).toBe(false);
      expect(cacheRows(me)).toBe(INDEX_BATCH * 2 + 10);

      // "Reopen": a fresh query store finds the cache complete and does no work.
      const reopened =
        require('../../src/storage/notesQueryStore').createNotesQueryStore();
      expect(reopened.page({userId: me, search: 'keyword'}).indexing).toBe(
        false,
      );
      expect(allPages(me, {search: 'keyword'})).toHaveLength(
        INDEX_BATCH * 2 + 10,
      );
    });

    test('one call normalizes at most the character budget, then continues on the next call', () => {
      const me = owner('budget');
      const notes = 8;
      for (let i = 0; i < notes; i += 1) {
        seedNote(me, {body: `${'x'.repeat(MAX_INDEXED_BODY_CHARS)} term${i}`});
      }
      const perCall = Math.ceil(INDEX_CHAR_BUDGET / MAX_INDEXED_BODY_CHARS);
      expect(notesQueryStore.page({userId: me, search: 'xx'}).indexing).toBe(
        true,
      );
      expect(cacheRows(me)).toBe(perCall);
      expect(searchAll(me, 'xx')).toHaveLength(notes);
      expect(cacheRows(me)).toBe(notes);
    });

    test('large bodies are normalized with bounded work and the source is unchanged (fingerprint)', () => {
      const me = owner('large');
      const huge = `${'lorem ipsum '.repeat(30_000)} needle-at-the-end`;
      const id = seedNote(me, {title: 'Big', body: huge});
      const fingerprint = crypto
        .createHash('sha256')
        .update(huge)
        .digest('hex');

      const normalized = normalizeNoteForSearch('Big', huge);
      expect(normalized.length).toBeLessThanOrEqual(
        MAX_INDEXED_BODY_CHARS + 10,
      );
      searchAll(me, 'lorem');
      expect(crypto.createHash('sha256').update(bodyOf(id)).digest('hex')).toBe(
        fingerprint,
      );
      // Text beyond the bound is not indexed (documented limit).
      expect(searchAll(me, 'needle-at-the-end')).toEqual([]);
    });

    test('indexing and search never log note text', () => {
      const me = owner('quiet');
      seedNote(me, {body: 'private-diary-entry'});
      const logs = [
        jest.spyOn(console, 'log'),
        jest.spyOn(console, 'warn'),
        jest.spyOn(console, 'error'),
        jest.spyOn(console, 'info'),
      ];
      searchAll(me, 'private');
      for (const spy of logs) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain('private-diary-entry');
        }
      }
    });
  });

  describe('keyset pages and filters', () => {
    test('equal sort values and timestamps never drop or repeat a note; pinned come first', () => {
      const me = owner('pages');
      const ids = new Set<string>();
      for (let i = 0; i < 130; i += 1) ids.add(seedNote(me));
      const pinned = seedNote(me, {pinned: true});
      ids.add(pinned);
      seedNote(owner('someone-else'));

      const seen = allPages(me, {limit: 50});
      expect(seen[0].id).toBe(pinned);
      expect(seen.map(n => n.id)).toHaveLength(131);
      expect(new Set(seen.map(n => n.id))).toEqual(ids);
      for (const note of seen) expect(note.userId).toBe(me);
    });

    test('filters run in SQL, and a cursor cannot be replayed for another owner or filter', () => {
      const me = owner('filters');
      const other = owner('filters-other');
      for (let i = 0; i < 6; i += 1) seedNote(me, {category: 'Health'});
      const voice = seedNote(me, {voice: true});
      const pin = seedNote(me, {pinned: true});
      seedNote(other, {category: 'Health'});

      expect(allPages(me, {filter: 'Health'})).toHaveLength(6);
      expect(allPages(me, {filter: 'AI Transcribed'}).map(n => n.id)).toEqual([
        voice,
      ]);
      expect(allPages(me, {filter: 'Pinned'}).map(n => n.id)).toEqual([pin]);

      const first = notesQueryStore.page({
        userId: me,
        filter: 'Health',
        limit: 2,
      });
      expect(first.nextCursor).not.toBeNull();
      expect(() =>
        notesQueryStore.page({
          userId: other,
          filter: 'Health',
          after: first.nextCursor,
        }),
      ).toThrow(InvalidNotesQueryError);
      expect(() =>
        notesQueryStore.page({
          userId: me,
          filter: 'All',
          after: first.nextCursor,
        }),
      ).toThrow(InvalidNotesQueryError);
      expect(() =>
        notesQueryStore.page({userId: me, after: 'garbage'}),
      ).toThrow(InvalidNotesQueryError);
      expect(() =>
        notesQueryStore.page({userId: me, search: 'x'.repeat(101)}),
      ).toThrow(InvalidNotesQueryError);
      expect(() =>
        notesQueryStore.page({userId: me, search: 'tab	here'}),
      ).toThrow(InvalidNotesQueryError);
    });
  });

  describe('safe reorder', () => {
    test('only the complete, unchanged collection can set the order', () => {
      const me = owner('reorder');
      seedNote(me, {sortOrder: 0, title: 'A'});
      const b = seedNote(me, {sortOrder: 1, title: 'B'});
      seedNote(me, {sortOrder: 2, title: 'C'});
      const all = allPages(me);
      const order = () => allPages(me).map(n => n.title);

      // A partial page (two of three) is refused; nothing is written.
      expect(
        failureOf(() => notesQueryStore.reorder(me, [all[1], all[0]])),
      ).toBe('changed');
      expect(order()).toEqual(['A', 'B', 'C']);

      // A stale snapshot (B changed meanwhile) is refused.
      notesStore.update({id: b, body: 'edited'});
      expect(
        failureOf(() => notesQueryStore.reorder(me, [all[2], all[1], all[0]])),
      ).toBe('changed');
      expect(order()).toEqual(['A', 'B', 'C']);

      const fresh = allPages(me);
      notesQueryStore.reorder(me, [fresh[2], fresh[0], fresh[1]]);
      expect(order()).toEqual(['C', 'A', 'B']);
    });
  });

  describe('guest link', () => {
    test('rekeys notes atomically: the guest cache is dropped, revisions move and the new owner can edit', async () => {
      db.executeSync('DELETE FROM notes WHERE user_id = ?', [GUEST_USER_ID]);
      userStore.createGuestUser();
      userStore.setCurrentUser(GUEST_USER_ID);
      const id = seedNote(GUEST_USER_ID, {body: 'guest lecture outline'});
      expect(searchAll(GUEST_USER_ID, 'lecture').map(n => n.id)).toEqual([id]);
      const asGuest = snapshot(GUEST_USER_ID, id);
      expect(cacheRows(GUEST_USER_ID)).toBe(1);

      const cloud = owner('cloud');
      await guestMigration.linkGuestToCloudAccount(
        cloud,
        `${cloud}@example.invalid`,
      );

      expect(cacheRows(GUEST_USER_ID)).toBe(0);
      expect(cacheRows(cloud)).toBe(0);
      expect(
        failureOf(() =>
          notesEditStore.save(target(asGuest), {body: 'late guest'}),
        ),
      ).toBe('owner_changed');
      const asCloud = snapshot(cloud, id);
      expect(asCloud.revision).toBeGreaterThan(asGuest.revision);
      expect(searchAll(cloud, 'lecture').map(n => n.id)).toEqual([id]);
      notesEditStore.save(target(asCloud), {body: 'cloud edit'});
      expect(bodyOf(id)).toBe('cloud edit');
    });
  });

  describe('sync pull under an open editor (full runSyncPass, fake server)', () => {
    const originalToken = cloudClient.getAccessToken;
    const originalOnline = cloudClient.isOnline;
    const previousFetch = global.fetch;
    let serverChanges: unknown[] = [];
    let changeId = 7000;

    const respond = (payload: unknown) =>
      ({
        ok: true,
        status: 200,
        headers: {get: () => 'application/json'},
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      } as unknown as Response);

    beforeEach(() => {
      cloudClient.getAccessToken = () => 'synthetic-token';
      cloudClient.isOnline = async () => true;
      global.fetch = jest.fn(async (url: string, init: RequestInit) => {
        if (!String(url).endsWith('/v1/sync/batch')) {
          return {...respond({}), ok: false, status: 404} as Response;
        }
        const body = JSON.parse(String(init.body));
        const changes = serverChanges;
        serverChanges = [];
        return respond({
          accepted: (body.mutations as any[]).map(m => ({
            mutationId: m.mutationId,
            entityType: m.entityType,
            entityId: m.entityId,
            status: 'accepted',
            serverVersion: 1,
          })),
          rejected: [],
          changes: body.snapshot ? [] : changes,
          nextCursor: body.snapshot ? body.cursor : changeId,
          hasMore: false,
          resetRequired: false,
          serverTime: new Date().toISOString(),
          snapshot: body.snapshot
            ? {
                boundaryCursor: changeId,
                items: [],
                nextAfter: null,
                hasMore: false,
                complete: true,
                authoritativeEntityTypes: AUTHORITATIVE_SYNC_ENTITY_TYPES,
                prunePolicy: {
                  preserveOutboxStatuses: ['pending', 'in_progress', 'failed'],
                  requireExistingSyncMetadata: true,
                },
              }
            : null,
          supportedEntityTypes: [...CLIENT_SYNC_ENTITY_TYPES],
        });
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      cloudClient.getAccessToken = originalToken;
      cloudClient.isOnline = originalOnline;
      global.fetch = previousFetch;
    });

    const noteChange = (
      id: string,
      operation: 'update' | 'delete',
      body: string,
    ) => {
      changeId += 1;
      const updatedAt = new Date(Date.now() + 60_000).toISOString();
      return {
        changeId,
        entityType: 'note',
        entityId: id,
        operation,
        version: changeId,
        payload:
          operation === 'delete'
            ? {}
            : {
                title: 'Synced',
                body,
                is_pinned: false,
                tags: '[]',
                category: 'Personal',
                is_voice_transcribed: false,
                sort_order: 0,
              },
        updatedAt,
        ...(operation === 'delete' ? {deletedAt: updatedAt} : {}),
      };
    };

    test('a pulled update or delete makes the open editor stale; the pulled version stays', async () => {
      const me = owner('sync');
      const now = new Date().toISOString();
      db.executeSync(
        `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
         VALUES (?, ?, ?, 'student', 0, ?, ?)`,
        [me, me, `${me}@example.invalid`, now, now],
      );
      userStore.setCurrentUser(me);
      await syncWorker.runSyncPass(); // first pass negotiates the snapshot

      const edited = seedNote(me, {body: 'before pull'});
      const removed = seedNote(me, {body: 'will be deleted remotely'});
      const editorA = snapshot(me, edited);
      const editorB = snapshot(me, removed);

      serverChanges = [
        noteChange(edited, 'update', 'from the laptop'),
        noteChange(removed, 'delete', ''),
      ];
      await syncWorker.runSyncPass();

      expect(bodyOf(edited)).toBe('from the laptop');
      expect(
        failureOf(() =>
          notesEditStore.save(target(editorA), {body: 'phone draft'}),
        ),
      ).toBe('changed');
      expect(bodyOf(edited)).toBe('from the laptop');
      expect(
        failureOf(() =>
          notesEditStore.save(target(editorB), {body: 'phone draft'}),
        ),
      ).toBe('deleted');
    });
  });
});
