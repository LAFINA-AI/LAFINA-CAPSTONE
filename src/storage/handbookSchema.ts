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
