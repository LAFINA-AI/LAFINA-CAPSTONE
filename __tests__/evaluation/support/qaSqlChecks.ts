/**
 * AGY-PORT 12: isolated QA SQL checks on an explicitly owned temporary file.
 *
 * Adapted from the LAFINA donor's src/storage/qaSqlChecks.ts (pinned
 * 0d4bbe39). The donor runs inside a QA build behind a native allocation
 * gate. AGY has no such native module yet, so this runner is host-only: it
 * lives under __tests__, is never bundled, and the production app cannot
 * reach it. The in-app QA screen and native gate are a documented PARTIAL.
 *
 * Every check uses AGY's real migrations and query stores against a file in
 * a directory this runner created. The report carries only check names,
 * pass/fail, timing and schema version: no row content, paths or errors.
 */
import {existsSync, mkdtempSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {basename, dirname, join, resolve} from 'path';
import {DatabaseService} from '../../../src/storage/database';
import {CURRENT_SCHEMA_VERSION, initDatabase} from '../../../src/storage/dbInit';
import {createNotesQueryStore} from '../../../src/storage/notesQueryStore';
import {openSqliteFile} from '../../fixtures/sqliteFile';
import type {SqliteTestConnection} from '../../fixtures/sqliteFile';

export interface QaSqlCheck {
  name: string;
  passed: boolean;
}

export interface QaSqlReport {
  status: 'passed' | 'failed';
  checks: QaSqlCheck[];
  cleanup: 'removed' | 'not-created' | 'failed';
  durationMs: number;
  schemaVersion: number;
}

export const QA_DIRECTORY_PREFIX = 'agy-qa-sql-';
export const QA_DB_NAME = 'qa-fixture.db';
/** A runaway check fails instead of running forever. */
export const QA_STATEMENT_BUDGET = 2000;

const OWNER = 'qa-owner';
const OTHER = 'qa-other';

class QaCheckFailed extends Error {}

export interface QaSqlHooks {
  /** Test seam: wraps the opened connection (for example to inject failures). */
  onOpen?: (connection: SqliteTestConnection) => void;
  /** Test seam: replaces directory removal. */
  remove?: (path: string) => void;
}

/** True only for a directory this runner could have created. */
export const isOwnedQaDirectory = (path: string): boolean =>
  resolve(dirname(path)) === resolve(tmpdir()) &&
  basename(path).startsWith(QA_DIRECTORY_PREFIX) &&
  /^agy-qa-sql-[A-Za-z0-9]{6}$/.test(basename(path));

const runChecks = async (
  path: string,
  checks: QaSqlCheck[],
  hooks: QaSqlHooks,
  opened: SqliteTestConnection[],
): Promise<void> => {
  const check = (name: string, accepted: boolean): void => {
    checks.push({name, passed: accepted});
    if (!accepted) throw new QaCheckFailed(name);
  };
  const now = new Date().toISOString();

  let connection = openSqliteFile(path);
  opened.push(connection);
  hooks.onOpen?.(connection);
  const budget = (target: SqliteTestConnection): void => {
    const previous = target.failWhen;
    target.failWhen = (query, index) =>
      index >= QA_STATEMENT_BUDGET || (previous?.(query, index) ?? false);
  };
  budget(connection);
  let service = new DatabaseService(() => connection);
  await initDatabase(service);
  const version = (): number =>
    Number(service.executeSync('PRAGMA user_version').rows[0]?.user_version);
  check('Fresh owned file reaches the current schema', version() === CURRENT_SCHEMA_VERSION);
  check('Storage reports ready', service.getHealth().status === 'ready');

  const count = (sql: string, params: unknown[] = []): number =>
    Number(service.executeSync(sql, params).rows[0]?.n ?? 0);
  const addUser = (id: string): void => {
    service.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, ?, ?)`,
      [id, id, `${id}@example.invalid`, now, now],
    );
  };
  addUser(OWNER);
  addUser(OTHER);

  const insertNote = (id: string, owner = OWNER, body = '<p>Study <b>group</b></p>'): void => {
    service.executeSync(
      `INSERT INTO notes (id, user_id, title, body, category, is_pinned, tags,
         is_voice_transcribed, sort_order, created_at, updated_at)
       VALUES (?, ?, 'Synthetic note', ?, 'Academic', 0, '[]', 0, 0, ?, ?)`,
      [id, owner, body, now, now],
    );
  };
  const insertOutbox = (id: string): void => {
    service.executeSync(
      `INSERT INTO sync_outbox (id, user_id, scope_type, scope_id, entity_type,
         entity_id, operation, payload, created_at, updated_at)
       VALUES (?, ?, 'account', ?, 'note', ?, 'create', '{}', ?, ?)`,
      [`outbox-${id}`, OWNER, OWNER, id, now, now],
    );
  };
  const notes = (id: string): number =>
    count('SELECT COUNT(*) AS n FROM notes WHERE id = ?', [id]);
  const outbox = (id: string): number =>
    count('SELECT COUNT(*) AS n FROM sync_outbox WHERE entity_id = ?', [id]);
  const revision = (id: string): number | null => {
    const row = service.executeSync(
      "SELECT revision FROM entity_local_revisions WHERE entity_type = 'note' AND entity_id = ?",
      [id],
    ).rows[0];
    return row ? Number(row.revision) : null;
  };

  const injected = new Error('QA_INJECTED_ROLLBACK');
  let reachedPair = false;
  try {
    service.transactionSync(tx => {
      tx.executeSync(
        `INSERT INTO notes (id, user_id, title, body, category, is_pinned, tags,
           is_voice_transcribed, sort_order, created_at, updated_at)
         VALUES ('qa-rollback', ?, 'Synthetic note', 'x', 'Academic', 0, '[]', 0, 0, ?, ?)`,
        [OWNER, now, now],
      );
      tx.executeSync(
        `INSERT INTO sync_outbox (id, user_id, scope_type, scope_id, entity_type,
           entity_id, operation, payload, created_at, updated_at)
         VALUES ('outbox-qa-rollback', ?, 'account', ?, 'note', 'qa-rollback', 'create', '{}', ?, ?)`,
        [OWNER, OWNER, now, now],
      );
      reachedPair =
        Number(
          tx.executeSync("SELECT COUNT(*) AS n FROM notes WHERE id = 'qa-rollback'").rows[0]?.n,
        ) === 1;
      throw injected;
    });
  } catch (error) {
    if (error !== injected) throw error;
  }
  check(
    'Paired note and outbox writes roll back together',
    reachedPair && notes('qa-rollback') === 0 && outbox('qa-rollback') === 0,
  );
  check('A rolled-back write leaves no revision', revision('qa-rollback') === null);

  service.transactionSync(() => {
    insertNote('qa-committed');
    insertOutbox('qa-committed');
  });
  check(
    'Paired note and outbox writes commit together',
    notes('qa-committed') === 1 && outbox('qa-committed') === 1,
  );

  for (let index = 0; index < 24; index += 1) {
    insertNote(`qa-note${String(index).padStart(2, '0')}`);
  }
  insertNote('qa-foreign', OTHER);
  const query = createNotesQueryStore(service);
  const first = query.page({userId: OWNER, limit: 20});
  const second = query.page({userId: OWNER, limit: 20, after: first.nextCursor});
  const paged = [...first.items, ...second.items];
  check(
    'Notes pages stay bounded and account-scoped',
    first.items.length === 20 &&
      second.items.length === 5 &&
      second.nextCursor === null &&
      new Set(paged.map(note => note.id)).size === 25 &&
      paged.every(note => note.userId === OWNER),
  );

  const settle = (search: string) => {
    let page = query.page({userId: OWNER, search, limit: 100});
    for (let i = 0; page.indexing && i < 10; i += 1) {
      page = query.page({userId: OWNER, search, limit: 100});
    }
    return page;
  };
  const rich = settle('study group');
  check(
    'Rich-text search matches plain words, never another account',
    !rich.indexing && rich.items.length === 25 && rich.items.every(n => n.userId === OWNER),
  );

  const before = revision('qa-note00');
  service.executeSync("UPDATE notes SET body = 'Changed fixture' WHERE id = 'qa-note00'");
  check(
    'Every SQL writer advances the note revision',
    before !== null && revision('qa-note00') === before + 1,
  );
  check('A changed note is found by its new text', settle('changed fixture').items.length === 1);

  const stale = service.executeSync(
    `UPDATE notes SET body = 'Stale overwrite' WHERE id = 'qa-note00'
       AND (SELECT revision FROM entity_local_revisions
             WHERE entity_type = 'note' AND entity_id = 'qa-note00') = ?`,
    [before],
  );
  check('A stale revision cannot overwrite a newer note', stale.rowsAffected === 0);

  let foreignKeyRejected = false;
  try {
    service.executeSync(
      `INSERT INTO messages (id, session_id, sender, content, created_at, updated_at)
       VALUES ('qa-orphan', 'qa-missing-session', 'user', 'x', ?, ?)`,
      [now, now],
    );
  } catch {
    foreignKeyRejected = true;
  }
  check(
    'Foreign keys are enforced',
    foreignKeyRejected &&
      count("SELECT COUNT(*) AS n FROM messages WHERE id = 'qa-orphan'") === 0,
  );
  check(
    'UTC timestamps are retained',
    count(
      "SELECT COUNT(*) AS n FROM notes WHERE created_at NOT LIKE '%Z' OR updated_at NOT LIKE '%Z'",
    ) === 0,
  );

  connection.close();
  connection = openSqliteFile(path);
  opened.push(connection);
  budget(connection);
  service = new DatabaseService(() => connection);
  await initDatabase(service);
  check(
    'Close and reopen keeps the schema and rows',
    version() === CURRENT_SCHEMA_VERSION &&
      count('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?', [OWNER]) === 25 &&
      outbox('qa-committed') === 1,
  );
  check(
    'SQLite integrity check',
    Object.values(service.executeSync('PRAGMA quick_check').rows[0] ?? {}).includes('ok'),
  );
  connection.close();
};

/**
 * Runs the checks in a new owned temporary directory and removes exactly
 * that directory afterwards. Cleanup that cannot be confirmed is a failure.
 */
export const runQaSqlChecks = async (hooks: QaSqlHooks = {}): Promise<QaSqlReport> => {
  const started = Date.now();
  const report: QaSqlReport = {
    status: 'failed',
    checks: [],
    cleanup: 'not-created',
    durationMs: 0,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
  let directory: string | null = null;
  const opened: SqliteTestConnection[] = [];
  try {
    directory = mkdtempSync(join(tmpdir(), QA_DIRECTORY_PREFIX));
    await runChecks(join(directory, QA_DB_NAME), report.checks, hooks, opened);
    report.status = 'passed';
  } catch {
    // Redacted: the failing check is already the last entry in `checks`.
    report.status = 'failed';
  } finally {
    // A check that threw may leave a handle open; Windows then refuses removal.
    let closed = true;
    for (const connection of opened) {
      try {
        connection.close();
      } catch {
        closed = false;
      }
    }
    if (directory) {
      try {
        if (!closed) throw new Error('handle still open');
        if (!isOwnedQaDirectory(directory)) throw new Error('not owned');
        (hooks.remove ?? (path => rmSync(path, {recursive: true, force: true})))(directory);
        report.cleanup = existsSync(directory) ? 'failed' : 'removed';
      } catch {
        report.cleanup = 'failed';
      }
      if (report.cleanup === 'failed') report.status = 'failed';
    }
    report.durationMs = Math.max(0, Date.now() - started);
  }
  return report;
};
