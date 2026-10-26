import type {
  Note,
  NoteDraft,
  NoteTarget,
  NotesRepository,
} from '../domain/notes';
import type {Clock} from '../domain/planner';
import {validateToken} from '../domain/plannerValidation';
import {assertUtc} from '../domain/scheduleTime';
import {inTransaction} from './plannerDatabase';
import {num, str} from './plannerRows';
import type {LocalSqlConnection} from './preferencesRepository';

const systemClock: Clock = {now: () => new Date().toISOString()};

function disallowedControls(value: string, multiline = false): boolean {
  return [...value].some(character => {
    const code = character.charCodeAt(0);
    return (
      code === 127 || (code < 32 && !(multiline && [9, 10, 13].includes(code)))
    );
  });
}

function draftOf(draft: NoteDraft): NoteDraft {
  if (
    typeof draft?.title !== 'string' ||
    !draft.title.trim() ||
    [...draft.title].length > 160 ||
    disallowedControls(draft.title) ||
    typeof draft.body !== 'string' ||
    [...draft.body].length > 10000 ||
    disallowedControls(draft.body, true)
  ) {
    throw new Error(
      'Enter a title (1–160 characters) and note text up to 10000 characters.',
    );
  }
  if (
    !['Personal', 'Coursework'].includes(draft.category) ||
    typeof draft.pinned !== 'boolean'
  ) {
    throw new Error(
      'Choose Personal or Coursework and a valid pinned setting.',
    );
  }
  return {
    title: draft.title.trim(),
    body: draft.body,
    category: draft.category,
    pinned: draft.pinned,
  };
}

function checkId(id: string): void {
  if (typeof id !== 'string' || !/^note_[A-Za-z0-9_-]{1,80}$/.test(id)) {
    throw new Error('Invalid note identity.');
  }
}

function decode(row: Record<string, unknown>): Note {
  const pinned = num(row, 'pinned');
  if (pinned !== 0 && pinned !== 1) {
    throw new Error('Invalid saved note.');
  }
  const category = str(row, 'category');
  if (category !== 'Personal' && category !== 'Coursework') {
    throw new Error('Invalid saved note category.');
  }
  const note: Note = {
    ...draftOf({
      title: str(row, 'title'),
      body: str(row, 'body'),
      category,
      pinned: pinned === 1,
    }),
    id: str(row, 'id'),
    version: num(row, 'version'),
    createdAt: str(row, 'created_at'),
    updatedAt: str(row, 'updated_at'),
    deletedAt: row.deleted_at === null ? null : str(row, 'deleted_at'),
  };
  checkId(note.id);
  if (note.version < 1) {
    throw new Error('Invalid saved note version.');
  }
  assertUtc(note.createdAt);
  assertUtc(note.updatedAt);
  if (note.deletedAt !== null) {
    assertUtc(note.deletedAt);
  }
  return note;
}

/** Notes share the capstone connection and operation receipts; no second database. */
export function createNotesRepository(
  db: LocalSqlConnection,
  clock: Clock = systemClock,
): NotesRepository {
  function mutate<T>(
    token: string,
    kind: string,
    payload: unknown,
    apply: (at: string) => T,
  ): T {
    validateToken(token);
    // Payloads are rebuilt in a fixed field order, independently of caller key order.
    const fingerprint = JSON.stringify({kind, payload});
    return inTransaction(db, () => {
      const receipt = db.execute(
        'SELECT fingerprint,result FROM operation_receipts WHERE token=?',
        [token],
      )[0];
      if (receipt) {
        if (str(receipt, 'fingerprint') !== fingerprint) {
          throw new Error(
            'This operation token was already used for a different action.',
          );
        }
        return JSON.parse(str(receipt, 'result')) as T;
      }
      const at = clock.now();
      assertUtc(at);
      const result = apply(at);
      db.execute(
        'INSERT INTO operation_receipts(token,fingerprint,result,created_at) VALUES(?,?,?,?)',
        [token, fingerprint, JSON.stringify(result ?? null), at],
      );
      return result;
    });
  }
  function get(id: string): Note | null {
    checkId(id);
    const row = db.execute(
      'SELECT * FROM notes WHERE id=? AND deleted_at IS NULL',
      [id],
    )[0];
    return row ? decode(row) : null;
  }
  function live(target: NoteTarget): Note {
    if (
      !Number.isSafeInteger(target.expectedVersion) ||
      target.expectedVersion < 1
    ) {
      throw new Error('Invalid note version.');
    }
    const note = get(target.id);
    if (!note) {
      throw new Error('This note is no longer available. Return to Notes.');
    }
    if (note.version !== target.expectedVersion) {
      throw new Error(
        'This note changed. Keep your draft and reopen the saved note before retrying.',
      );
    }
    return note;
  }
  return {
    get,
    page(query) {
      if (
        !query ||
        !['All', 'Pinned', 'Personal', 'Coursework'].includes(query.filter)
      ) {
        throw new Error('Choose a supported note filter.');
      }
      const search = query.search ?? '';
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 20;
      if (
        typeof search !== 'string' ||
        [...search].length > 100 ||
        disallowedControls(search) ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > 100000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 20
      ) {
        throw new Error(
          'Search up to 100 characters and use a page size from 1 to 20.',
        );
      }
      const where = ['deleted_at IS NULL'];
      const params: Array<string | number> = [];
      if (query.filter === 'Pinned') {
        where.push('pinned=1');
      } else if (query.filter !== 'All') {
        where.push('category=?');
        params.push(query.filter);
      }
      if (search.trim()) {
        // Wildcard punctuation is literal user text; values never become SQL.
        const pattern = `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`;
        where.push("(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')");
        params.push(pattern, pattern);
      }
      params.push(limit + 1, offset);
      const rows = db.execute(
        `SELECT * FROM notes WHERE ${where.join(
          ' AND ',
        )} ORDER BY pinned DESC,updated_at DESC,id ASC LIMIT ? OFFSET ?`,
        params,
      );
      return {
        items: rows.slice(0, limit).map(decode),
        hasMore: rows.length > limit,
      };
    },
    create(command) {
      const draft = draftOf(command.draft);
      return mutate(command.token, 'createNote', {draft}, at => {
        const note: Note = {
          ...draft,
          id: `note_${command.token}`,
          version: 1,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        db.execute(
          'INSERT INTO notes(id,title,body,category,pinned,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,NULL)',
          [
            note.id,
            note.title,
            note.body,
            note.category,
            note.pinned ? 1 : 0,
            1,
            at,
            at,
          ],
        );
        return note;
      });
    },
    update(command) {
      const draft = draftOf(command.draft);
      const payload = {
        id: command.id,
        expectedVersion: command.expectedVersion,
        draft,
      };
      return mutate(command.token, 'updateNote', payload, at => {
        const previous = live(command);
        db.execute(
          'UPDATE notes SET title=?,body=?,category=?,pinned=?,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted_at IS NULL',
          [
            draft.title,
            draft.body,
            draft.category,
            draft.pinned ? 1 : 0,
            at,
            command.id,
            command.expectedVersion,
          ],
        );
        return {
          ...previous,
          ...draft,
          version: previous.version + 1,
          updatedAt: at,
        };
      });
    },
    delete(command) {
      const payload = {
        id: command.id,
        expectedVersion: command.expectedVersion,
      };
      mutate(command.token, 'deleteNote', payload, at => {
        live(command);
        db.execute(
          'UPDATE notes SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL',
          [at, at, command.id, command.expectedVersion],
        );
        return null;
      });
    },
    counts() {
      return {
        completedTasks: num(
          db.execute(
            "SELECT COUNT(*) AS total FROM tasks WHERE deleted_at IS NULL AND status='COMPLETED'",
          )[0]!,
          'total',
        ),
        notes: num(
          db.execute(
            'SELECT COUNT(*) AS total FROM notes WHERE deleted_at IS NULL',
          )[0]!,
          'total',
        ),
      };
    },
  };
}
