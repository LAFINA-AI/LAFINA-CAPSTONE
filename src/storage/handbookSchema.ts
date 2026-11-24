import type {DatabaseTransaction} from './database';

/**
 * Schema 28: On-device USTP Student Handbook chunk store + SQLite FTS5 BM25
 * inverted index with trigger synchronization.
 *
 * DDL only — no seed INSERTs during `initDatabase()` so schema migrations
 * remain 100% deterministic across existing user databases.
 */
export function migrateHandbookIndex(tx: DatabaseTransaction): void {
  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS handbook_meta (
      id TEXT PRIMARY KEY NOT NULL CHECK (id = 'active'),
      title TEXT NOT NULL,
      edition TEXT NOT NULL,
      source_label TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS handbook_chunks (
      id TEXT PRIMARY KEY NOT NULL,
      seq INTEGER NOT NULL,
      chapter TEXT NOT NULL,
      section TEXT NOT NULL,
      page_label TEXT,
      source_label TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      content_chars INTEGER NOT NULL
    )
  `);

  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_handbook_chunks_seq ON handbook_chunks(seq)',
  );

  // FTS5 exists only in native builds compiled with `"op-sqlite": {"fts5":
  // true}`. A missing module must never fail the whole upgrade and send
  // storage into recovery (audit H5): the plain tables above are enough for
  // the app to start, and `localHandbookStore.ensureFtsIndex()` creates the
  // index later on a build that has FTS5.
  tx.executeSync('SAVEPOINT handbook_fts');
  try {
    createHandbookFtsIndex(tx);
    tx.executeSync('RELEASE SAVEPOINT handbook_fts');
  } catch (error) {
    tx.executeSync('ROLLBACK TO SAVEPOINT handbook_fts');
    tx.executeSync('RELEASE SAVEPOINT handbook_fts');
    console.warn(
      '[Database] SQLite FTS5 is unavailable; the offline handbook index is disabled on this build.',
      error,
    );
  }
}

/**
 * Schema 32: the handbook index also holds the USTP Cagayan de Oro knowledge
 * pack. `collection` names the corpus a chunk came from ('handbook' for the
 * 2023 Student Handbook, 'ustp_cdo' for the campus knowledge pack) and
 * `meta_json` keeps its provenance (source URLs, as-of date, academic year,
 * semester, undergraduate/graduate scope, PDF pages, known conflicts).
 * Additive: existing rows default to the handbook, and the FTS5 columns and
 * triggers are unchanged.
 */
export function migrateKnowledgeCollections(tx: DatabaseTransaction): void {
  const columns = new Set(
    (tx.executeSync('PRAGMA table_info(handbook_chunks)').rows ?? []).map(row =>
      String(row.name),
    ),
  );
  if (!columns.has('collection')) {
    tx.executeSync(
      "ALTER TABLE handbook_chunks ADD COLUMN collection TEXT NOT NULL DEFAULT 'handbook'",
    );
  }
  if (!columns.has('meta_json')) {
    tx.executeSync('ALTER TABLE handbook_chunks ADD COLUMN meta_json TEXT');
  }
}

export function handbookFtsIndexExists(
  executor: Pick<DatabaseTransaction, 'executeSync'>,
): boolean {
  const res = executor.executeSync(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'handbook_chunks_fts' LIMIT 1",
  );
  return res.rows.length > 0;
}

/** The FTS5 table and its sync triggers. Throws when FTS5 is not compiled in. */
export function createHandbookFtsIndex(
  tx: Pick<DatabaseTransaction, 'executeSync'>,
): void {
  tx.executeSync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS handbook_chunks_fts USING fts5(
      chapter,
      section,
      keywords,
      content,
      content='handbook_chunks',
      content_rowid='rowid',
      tokenize='porter unicode61 remove_diacritics 2'
    )
  `);

  tx.executeSync(`
    CREATE TRIGGER IF NOT EXISTS trg_handbook_chunks_ai
    AFTER INSERT ON handbook_chunks BEGIN
      INSERT INTO handbook_chunks_fts(rowid, chapter, section, keywords, content)
      VALUES (new.rowid, new.chapter, new.section, new.keywords, new.content);
    END
  `);

  tx.executeSync(`
    CREATE TRIGGER IF NOT EXISTS trg_handbook_chunks_ad
    AFTER DELETE ON handbook_chunks BEGIN
      INSERT INTO handbook_chunks_fts(handbook_chunks_fts, rowid, chapter, section, keywords, content)
      VALUES ('delete', old.rowid, old.chapter, old.section, old.keywords, old.content);
    END
  `);

  tx.executeSync(`
    CREATE TRIGGER IF NOT EXISTS trg_handbook_chunks_au
    AFTER UPDATE ON handbook_chunks BEGIN
      INSERT INTO handbook_chunks_fts(handbook_chunks_fts, rowid, chapter, section, keywords, content)
      VALUES ('delete', old.rowid, old.chapter, old.section, old.keywords, old.content);
      INSERT INTO handbook_chunks_fts(rowid, chapter, section, keywords, content)
      VALUES (new.rowid, new.chapter, new.section, new.keywords, new.content);
    END
  `);
}
