import {DatabaseSync} from 'node:sqlite';
import type {NoteDraft} from '../src/core/domain/notes';
import {createNotesRepository} from '../src/core/storage/notesRepository';
import {initializePlannerDatabase} from '../src/core/storage/plannerDatabase';
import {createPlannerRepository} from '../src/core/storage/plannerRepository';
import {connect} from './helpers/sqlite';
import {failOnce, fixtureNow, taskDraft} from './helpers/plannerFixtures';

const draft: NoteDraft = {
  title: 'Chapter notes',
  body: 'Synthetic test text',
  category: 'Coursework',
  pinned: false,
};
describe('local notes on real host SQLite', () => {
  let db: DatabaseSync;
  let sql: ReturnType<typeof connect>;
  let repository: ReturnType<typeof createNotesRepository>;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    sql = connect(db);
    initializePlannerDatabase(sql, fixtureNow);
    repository = createNotesRepository(sql, {now: () => fixtureNow});
  });
  afterEach(() => db.close());

  it('creates, gets, updates and tombstones a note with independent replay-safe receipts', () => {
    const command = {token: 'note_create', draft};
    const note = repository.create(command);
    expect(note).toMatchObject({
      id: 'note_note_create',
      version: 1,
      createdAt: fixtureNow,
      deletedAt: null,
    });
    expect(repository.create(command)).toEqual(note);
    const edit = {
      token: 'note_edit',
      id: note.id,
      expectedVersion: 1,
      draft: {...draft, title: 'Updated', pinned: true},
    };
    const updated = repository.update(edit);
    expect(updated).toMatchObject({title: 'Updated', pinned: true, version: 2});
    expect(repository.update(edit)).toEqual(updated);
    expect(repository.get(note.id)).toEqual(updated);
    const deletion = {token: 'note_delete', id: note.id, expectedVersion: 2};
    repository.delete(deletion);
    repository.delete(deletion);
    expect(repository.get(note.id)).toBeNull();
    expect(repository.page({filter: 'All'})).toEqual({
      items: [],
      hasMore: false,
    });
    expect(sql.execute('SELECT version,deleted_at FROM notes')).toEqual([
      {version: 3, deleted_at: fixtureNow},
    ]);
    expect(sql.execute('SELECT token FROM operation_receipts')).toHaveLength(3);
  });

  it('refuses token reuse for another payload or planner operation', () => {
    repository.create({token: 'shared', draft});
    expect(() =>
      repository.create({
        token: 'shared',
        draft: {...draft, title: 'Different'},
      }),
    ).toThrow('different action');
    const planner = createPlannerRepository(sql, {now: () => fixtureNow});
    expect(() =>
      planner.createTask({
        token: 'shared',
        draft: taskDraft(),
        reminderLeadMinutes: null,
      }),
    ).toThrow('different action');
    expect(repository.counts()).toEqual({completedTasks: 0, notes: 1});
  });

  it('rejects stale updates/deletes and never resurrects a deleted source', () => {
    const note = repository.create({token: 'create', draft});
    repository.update({
      token: 'edit',
      id: note.id,
      expectedVersion: 1,
      draft: {...draft, body: 'new'},
    });
    expect(() =>
      repository.update({
        token: 'stale',
        id: note.id,
        expectedVersion: 1,
        draft,
      }),
    ).toThrow('changed');
    expect(() =>
      repository.delete({
        token: 'stale_delete',
        id: note.id,
        expectedVersion: 1,
      }),
    ).toThrow('changed');
    repository.delete({token: 'delete', id: note.id, expectedVersion: 2});
    expect(() =>
      repository.update({
        token: 'resurrect',
        id: note.id,
        expectedVersion: 3,
        draft,
      }),
    ).toThrow('no longer');
  });

  it('rolls back note and receipt together and permits retry after an injected failure', () => {
    const interrupted = createNotesRepository(
      failOnce(sql, /INSERT INTO operation_receipts/),
      {now: () => fixtureNow},
    );
    const command = {token: 'retry', draft};
    expect(() => interrupted.create(command)).toThrow('Injected');
    expect(repository.counts().notes).toBe(0);
    expect(sql.execute('SELECT * FROM operation_receipts')).toEqual([]);
    expect(interrupted.create(command).version).toBe(1);
    expect(interrupted.create(command).version).toBe(1);
    expect(repository.counts().notes).toBe(1);
  });

  it('pages at most 20 notes, orders pinned first, filters category and reports exact total', () => {
    for (let i = 0; i < 25; i++) {
      repository.create({
        token: `page_${i.toString().padStart(2, '0')}`,
        draft: {
          ...draft,
          title: `Note ${i}`,
          category: i % 2 ? 'Personal' : 'Coursework',
          pinned: i === 24,
        },
      });
    }
    const first = repository.page({filter: 'All'});
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.title).toBe('Note 24');
    expect(first.hasMore).toBe(true);
    const second = repository.page({filter: 'All', offset: 20});
    expect(second.items).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(
      new Set([...first.items, ...second.items].map(note => note.id)).size,
    ).toBe(25);
    expect(repository.page({filter: 'Pinned'}).items).toHaveLength(1);
    expect(repository.page({filter: 'Personal'}).items).toHaveLength(12);
    expect(repository.page({filter: 'Coursework'}).items).toHaveLength(13);
    const planner = createPlannerRepository(sql, {now: () => fixtureNow});
    planner.createTask({
      token: 'done_task',
      draft: taskDraft({status: 'COMPLETED'}),
      reminderLeadMinutes: null,
    });
    planner.createTask({
      token: 'todo_task',
      draft: taskDraft(),
      reminderLeadMinutes: null,
    });
    expect(repository.counts()).toEqual({completedTasks: 1, notes: 25});
  });

  it('treats SQL wildcard punctuation and quote text literally and searches note body', () => {
    repository.create({
      token: 'wild',
      draft: {...draft, title: '100% ready_\\', body: 'needle body'},
    });
    repository.create({token: 'ordinary', draft});
    for (const search of ['%', '_', '\\', 'needle']) {
      expect(
        repository.page({filter: 'All', search}).items.map(note => note.id),
      ).toEqual(['note_wild']);
    }
    expect(
      repository.page({filter: 'All', search: "' OR 1=1 --"}).items,
    ).toEqual([]);
  });

  it.each([
    {title: ''},
    {title: ' '.repeat(4)},
    {title: 'x'.repeat(161)},
    {body: 'x'.repeat(10001)},
    {category: 'Work'},
    {pinned: 1},
    {title: 'line\nbreak'},
    {body: 'bad\u0000text'},
  ])('rejects invalid note data %p without mutation', patch => {
    expect(() =>
      repository.create({
        token: 'invalid',
        draft: {...draft, ...patch} as NoteDraft,
      }),
    ).toThrow();
    expect(repository.counts().notes).toBe(0);
  });

  it.each([
    {limit: 21},
    {limit: 0},
    {offset: -1},
    {offset: 100001},
    {search: 'x'.repeat(101)},
    {search: '\u0000'},
    {filter: 'AI Transcribed'},
  ])('rejects unbounded/unsupported query %p', patch => {
    expect(() =>
      repository.page({filter: 'All', ...patch} as Parameters<
        typeof repository.page
      >[0]),
    ).toThrow();
  });

  it('accepts the exact Unicode title/body limits and preserves multiline note text', () => {
    const note = repository.create({
      token: 'unicode',
      draft: {
        ...draft,
        title: '😀'.repeat(160),
        body: `${'x'.repeat(9997)}\n\t\r`,
      },
    });
    expect(repository.get(note.id)).toEqual(note);
  });
});
