import type {DatabaseTransaction} from './database';

/**
 * Schema 29: Owner-scoped user study materials, chunked passages, SQLite FTS5
 * BM25 index (with trigger sync), and per-scope Q&A history.
 *
 * DDL only — no seed INSERTs during `initDatabase()` so upgrades from older
 * databases stay deterministic.
 */
export function migrateMaterialIndex(tx: DatabaseTransaction): void {
  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS user_materials (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 1,
      pages_read INTEGER NOT NULL DEFAULT 1,
      ocr_pages INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      total_chars INTEGER NOT NULL DEFAULT 0,
      outline_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS user_material_chunks (
      id TEXT PRIMARY KEY NOT NULL,
      material_id TEXT NOT NULL REFERENCES user_materials(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      heading TEXT NOT NULL DEFAULT '',
      page_start INTEGER NOT NULL DEFAULT 1,
      page_end INTEGER NOT NULL DEFAULT 1,
      page_label TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      content_chars INTEGER NOT NULL
    )
  `);

  tx.executeSync(`
    CREATE TABLE IF NOT EXISTS user_material_qa_messages (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
      content TEXT NOT NULL,
      sources_json TEXT,
      used_online INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_user_materials_owner_updated ON user_materials(user_id, updated_at DESC, id ASC)',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_user_materials_owner_hash ON user_materials(user_id, sha256)',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_user_material_chunks_mat_seq ON user_material_chunks(user_id, material_id, seq)',
  );
  tx.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_user_material_qa_owner_scope ON user_material_qa_messages(user_id, scope_key, created_at ASC, id ASC)',
  );

  // FTS5 exists only in builds compiled with `"op-sqlite": {"fts5": true}`.
  // Never fail the whole upgrade on a build without FTS5.
  tx.executeSync('SAVEPOINT material_fts');
  try {
    createMaterialFtsIndex(tx);
    tx.executeSync('RELEASE SAVEPOINT material_fts');
  } catch (error) {
    tx.executeSync('ROLLBACK TO SAVEPOINT material_fts');
    tx.executeSync('RELEASE SAVEPOINT material_fts');
    console.warn(
      '[Database] SQLite FTS5 is unavailable; material search will use LIKE fallback on this build.',
      error,
    );
  }
}

export function materialFtsIndexExists(
  executor: Pick<DatabaseTransaction, 'executeSync'>,
): boolean {
  const res = executor.executeSync(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'user_material_chunks_fts' LIMIT 1",
  );
  return res.rows.length > 0;
}

/** Creates the FTS5 virtual table and sync triggers. Throws when FTS5 is unavailable. */
export function createMaterialFtsIndex(
  tx: Pick<DatabaseTransaction, 'executeSync'>,
): void {
  tx.executeSync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS user_material_chunks_fts USING fts5(
      heading,
      keywords,
      content,
      content='user_material_chunks',
      content_rowid='rowid',
      tokenize='porter unicode61 remove_diacritics 2'
    )
  `);

  tx.executeSync(`
    CREATE TRIGGER IF NOT EXISTS trg_user_material_chunks_ai
    AFTER INSERT ON user_material_chunks BEGIN
      INSERT INTO user_material_chunks_fts(rowid, heading, keywords, content)
      VALUES (new.rowid, new.heading, new.keywords, new.content);
    END
  `);

  tx.executeSync(`
    CREATE TRIGGER IF NOT EXISTS trg_user_material_chunks_ad
    AFTER DELETE ON user_material_chunks BEGIN
      INSERT INTO user_material_chunks_fts(user_material_chunks_fts, rowid, heading, keywords, content)
      VALUES ('delete', old.rowid, old.heading, old.keywords, old.content);
    END
  `);

  tx.executeSync(`
    CREATE TRIGGER IF NOT EXISTS trg_user_material_chunks_au
    AFTER UPDATE ON user_material_chunks BEGIN
      INSERT INTO user_material_chunks_fts(user_material_chunks_fts, rowid, heading, keywords, content)
      VALUES ('delete', old.rowid, old.heading, old.keywords, old.content);
      INSERT INTO user_material_chunks_fts(rowid, heading, keywords, content)
      VALUES (new.rowid, new.heading, new.keywords, new.content);
    END
  `);
}
