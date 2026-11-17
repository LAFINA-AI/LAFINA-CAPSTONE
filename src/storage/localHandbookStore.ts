import {db} from './database';
import {createHandbookFtsIndex, handbookFtsIndexExists} from './handbookSchema';

export interface HandbookPackChunk {
  id: string;
  seq: number;
  chapter: string;
  section: string;
  pageLabel: string | null;
  sourceLabel: string;
  keywords?: string;
  content: string;
}

export interface HandbookPack {
  version: number;
  title: string;
  edition: string;
  sourceLabel: string;
  sha256: string;
  chunkCount: number;
  generatedAt: string;
  chunks: HandbookPackChunk[];
}

export interface HandbookMeta {
  title: string;
  edition: string;
  sourceLabel: string;
  sha256: string;
  chunkCount: number;
  updatedAt: string;
}

export interface HandbookFtsHit {
  id: string;
  seq: number;
  chapter: string;
  section: string;
  pageLabel: string | null;
  sourceLabel: string;
  keywords: string;
  content: string;
  bm25Score: number;
}

const INSERT_BATCH_SIZE = 25;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseHandbookPack(raw: unknown): HandbookPack | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const title = asTrimmedString(record.title) || 'USTP Student Handbook';
  const edition = asTrimmedString(record.edition) || 'USTP Student Handbook';
  const sourceLabel = asTrimmedString(record.sourceLabel) || title;
  const sha256 = asTrimmedString(record.sha256);
  const generatedAt =
    asTrimmedString(record.generatedAt) || new Date(0).toISOString();
  const version =
    typeof record.version === 'number' && Number.isFinite(record.version)
      ? Math.max(1, Math.floor(record.version))
      : 1;

  if (!sha256 || !Array.isArray(record.chunks)) {
    return null;
  }

  const chunks: HandbookPackChunk[] = [];
  for (let i = 0; i < record.chunks.length; i += 1) {
    const item = record.chunks[i];
    if (!item || typeof item !== 'object') {
      continue;
    }
    const c = item as Record<string, unknown>;
    const content = typeof c.content === 'string' ? c.content.trim() : '';
    if (!content) {
      continue;
    }
    const id = asTrimmedString(c.id) || `chunk-${i + 1}`;
    const seq =
      typeof c.seq === 'number' && Number.isFinite(c.seq)
        ? Math.floor(c.seq)
        : i + 1;
    const chapter = asTrimmedString(c.chapter) || 'General Provisions';
    const section = asTrimmedString(c.section) || 'General';
    const pageLabel = asNullableString(c.pageLabel);
    const chunkSource = asTrimmedString(c.sourceLabel) || sourceLabel;
    const keywords = asTrimmedString(c.keywords);
    chunks.push({
      id,
      seq,
      chapter,
      section,
      pageLabel,
      sourceLabel: chunkSource,
      keywords,
      content,
    });
  }

  return {
    version,
    title,
    edition,
    sourceLabel,
    sha256,
    chunkCount: chunks.length,
    generatedAt,
    chunks,
  };
}

function mapHitRow(row: Record<string, unknown>): HandbookFtsHit {
  return {
    id: String(row.id),
    seq: Number(row.seq),
    chapter: String(row.chapter),
    section: String(row.section),
    pageLabel:
      typeof row.page_label === 'string' && row.page_label.trim().length > 0
        ? row.page_label
        : null,
    sourceLabel: String(row.source_label),
    keywords: typeof row.keywords === 'string' ? row.keywords : '',
    content: String(row.content),
    bm25Score: Number(row.bm25_score ?? 0),
  };
}

export const localHandbookStore = {
  getMeta(): HandbookMeta | null {
    try {
      const res = db.executeSync(
        `SELECT title, edition, source_label, sha256, chunk_count, updated_at
         FROM handbook_meta
         WHERE id = 'active'
         LIMIT 1`,
      );
      if (res.rows.length === 0) {
        return null;
      }
      const row = res.rows[0];
      return {
        title: String(row.title),
        edition: String(row.edition),
        sourceLabel: String(row.source_label),
        sha256: String(row.sha256),
        chunkCount: Number(row.chunk_count ?? 0),
        updatedAt: String(row.updated_at),
      };
    } catch {
      return null;
    }
  },

  clearPack(): void {
    db.transactionSync(tx => {
      tx.executeSync('DELETE FROM handbook_chunks');
      tx.executeSync("DELETE FROM handbook_meta WHERE id = 'active'");
    });
  },

  upsertPack(pack: HandbookPack): void {
    const now = new Date().toISOString();
    db.transactionSync(tx => {
      tx.executeSync('DELETE FROM handbook_chunks');

      for (let i = 0; i < pack.chunks.length; i += INSERT_BATCH_SIZE) {
        const batch = pack.chunks.slice(i, i + INSERT_BATCH_SIZE);
        const placeholders = batch
          .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .join(', ');
        const params: unknown[] = [];
        for (const chunk of batch) {
          params.push(
            chunk.id,
            chunk.seq,
            chunk.chapter,
            chunk.section,
            chunk.pageLabel,
            chunk.sourceLabel,
            chunk.keywords ?? '',
            chunk.content,
            chunk.content.length,
          );
        }
        tx.executeSync(
          `INSERT INTO handbook_chunks (
             id, seq, chapter, section, page_label, source_label, keywords, content, content_chars
           ) VALUES ${placeholders}`,
          params,
        );
      }

      tx.executeSync(
        `INSERT OR REPLACE INTO handbook_meta (
           id, title, edition, source_label, sha256, chunk_count, updated_at
         ) VALUES ('active', ?, ?, ?, ?, ?, ?)`,
        [
          pack.title,
          pack.edition,
          pack.sourceLabel,
          pack.sha256,
          pack.chunks.length,
          now,
        ],
      );
    });
  },

  /**
   * Makes sure the FTS5 index exists, creating and rebuilding it when the
   * schema 28 migration ran on a build without FTS5. Returns false when this
   * native build has no FTS5 at all; the handbook is then reported as not
   * available instead of failing (audit H5).
   */
  ensureFtsIndex(): boolean {
    try {
      if (handbookFtsIndexExists(db)) {
        return true;
      }
      db.transactionSync(tx => {
        createHandbookFtsIndex(tx);
        tx.executeSync(
          "INSERT INTO handbook_chunks_fts(handbook_chunks_fts) VALUES ('rebuild')",
        );
      });
      return true;
    } catch (error) {
      console.warn(
        '[LocalHandbookStore] SQLite FTS5 unavailable; offline handbook disabled:',
        error,
      );
      return false;
    }
  },

  /**
   * True when the (porter-stemmed) token occurs anywhere in the handbook
   * index. Used by the evidence gate to spot off-topic words.
   */
  hasTerm(token: string): boolean {
    const clean = token.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean) {
      return false;
    }
    const res = db.executeSync(
      `SELECT 1 AS hit FROM handbook_chunks_fts
       WHERE handbook_chunks_fts MATCH ?
       LIMIT 1`,
      [`"${clean}"`],
    );
    return res.rows.length > 0;
  },

  queryFts(matchExpression: string, limit = 8): HandbookFtsHit[] {
    const expr = matchExpression.trim();
    if (!expr) {
      return [];
    }
    const clampedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
    const res = db.executeSync(
      `SELECT
         c.id,
         c.seq,
         c.chapter,
         c.section,
         c.page_label,
         c.source_label,
         c.keywords,
         c.content,
         bm25(handbook_chunks_fts, 3.0, 4.0, 2.5, 1.0) AS bm25_score
       FROM handbook_chunks_fts
       JOIN handbook_chunks c ON c.rowid = handbook_chunks_fts.rowid
       WHERE handbook_chunks_fts MATCH ?
       ORDER BY bm25_score ASC, c.seq ASC
       LIMIT ?`,
      [expr, clampedLimit],
    );
    return res.rows.map(row => mapHitRow(row));
  },
};
