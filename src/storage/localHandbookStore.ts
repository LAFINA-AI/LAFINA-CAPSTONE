import {db} from './database';
import {createHandbookFtsIndex, handbookFtsIndexExists} from './handbookSchema';

/**
 * The corpora kept in the one on-device index: the 2023 USTP Student Handbook
 * and the USTP Cagayan de Oro knowledge pack (calendar, admissions, offices,
 * services; `scripts/build_campus_knowledge_pack.py`).
 */
export type KnowledgeCollection = 'handbook' | 'ustp_cdo';

export const KNOWLEDGE_COLLECTIONS: readonly KnowledgeCollection[] = [
  'handbook',
  'ustp_cdo',
];

/** An official page or document a knowledge chunk cites. Always https. */
export interface KnowledgeSourceRef {
  id: string;
  title: string;
  url: string;
  /** PDF pages of this document the passage cites (the academic calendar). */
  pages?: number[];
}

/** A known inconsistency in the sources that an answer must disclose. */
export interface KnowledgeCaveat {
  id: string;
  text: string;
}

export type KnowledgeVolatility = 'low' | 'medium' | 'high';
export type KnowledgeTerm = 'first' | 'second' | 'midyear';
export type KnowledgeScope = 'UG' | 'GR';

/** Provenance of a knowledge-pack chunk (null for handbook chunks). */
export interface KnowledgeChunkMeta {
  doc: string | null;
  category: string | null;
  asOf: string | null;
  volatility: KnowledgeVolatility | null;
  /** Academic years the chunk belongs to, e.g. ['2026-2027']. */
  academicYears: string[];
  term: KnowledgeTerm | null;
  scope: KnowledgeScope | null;
  pdfPages: number[];
  sources: KnowledgeSourceRef[];
  caveats: KnowledgeCaveat[];
  /** Acronyms this passage writes out in full: {CITC: "College of …"}. */
  aliases?: Record<string, string>;
}

export interface HandbookPackChunk {
  id: string;
  seq: number;
  chapter: string;
  section: string;
  pageLabel: string | null;
  sourceLabel: string;
  keywords?: string;
  content: string;
  collection?: KnowledgeCollection;
  meta?: KnowledgeChunkMeta | null;
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
  collection: KnowledgeCollection;
  meta: KnowledgeChunkMeta | null;
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

const asCollection = (value: unknown): KnowledgeCollection =>
  value === 'ustp_cdo' ? 'ustp_cdo' : 'handbook';

/** Only an absolute https link is ever shown as a source. */
const isSafeSourceUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https:\/\/[^\s<>"'()]+$/i.test(value.trim());

/** Validates chunk provenance; anything malformed is dropped, never guessed. */
export function parseKnowledgeMeta(raw: unknown): KnowledgeChunkMeta | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const sources: KnowledgeSourceRef[] = [];
  for (const item of Array.isArray(r.sources) ? r.sources : []) {
    if (!item || typeof item !== 'object') continue;
    const src = item as Record<string, unknown>;
    const title = asTrimmedString(src.title);
    if (!title || !isSafeSourceUrl(src.url)) continue;
    const pages = (Array.isArray(src.pages) ? src.pages : []).filter(
      (p): p is number => typeof p === 'number' && Number.isInteger(p) && p > 0,
    );
    sources.push({
      id: asTrimmedString(src.id) || title,
      title,
      url: src.url.trim(),
      ...(pages.length > 0 ? {pages} : {}),
    });
  }
  const caveats: KnowledgeCaveat[] = [];
  for (const item of Array.isArray(r.caveats) ? r.caveats : []) {
    if (!item || typeof item !== 'object') continue;
    const cav = item as Record<string, unknown>;
    const text = asTrimmedString(cav.text);
    if (text) caveats.push({id: asTrimmedString(cav.id) || 'caveat', text});
  }
  const asOf = asNullableString(r.asOf);
  const aliases: Record<string, string> = {};
  if (r.aliases && typeof r.aliases === 'object') {
    for (const [acronym, name] of Object.entries(
      r.aliases as Record<string, unknown>,
    )) {
      if (/^[A-Z]{2,8}$/.test(acronym) && typeof name === 'string' && name.trim()) {
        aliases[acronym] = name.trim();
      }
    }
  }
  return {
    ...(Object.keys(aliases).length > 0 ? {aliases} : {}),
    doc: asNullableString(r.doc),
    category: asNullableString(r.category),
    asOf: asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null,
    volatility:
      r.volatility === 'low' ||
      r.volatility === 'medium' ||
      r.volatility === 'high'
        ? r.volatility
        : null,
    academicYears: (Array.isArray(r.academicYears) ? r.academicYears : []).filter(
      (y): y is string => typeof y === 'string' && /^\d{4}-\d{4}$/.test(y),
    ),
    term:
      r.term === 'first' || r.term === 'second' || r.term === 'midyear'
        ? r.term
        : null,
    scope: r.scope === 'UG' || r.scope === 'GR' ? r.scope : null,
    pdfPages: (Array.isArray(r.pdfPages) ? r.pdfPages : []).filter(
      (p): p is number => typeof p === 'number' && Number.isInteger(p) && p > 0,
    ),
    sources,
    caveats,
  };
}

function parseMetaJson(value: unknown): KnowledgeChunkMeta | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  try {
    return parseKnowledgeMeta(JSON.parse(value));
  } catch {
    return null;
  }
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
    const collection = asCollection(c.collection ?? record.collection);
    chunks.push({
      id,
      seq,
      chapter,
      section,
      pageLabel,
      sourceLabel: chunkSource,
      keywords,
      content,
      collection,
      meta: collection === 'ustp_cdo' ? parseKnowledgeMeta(c.meta) : null,
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

/** One chapter (handbook) or document (campus pack) in the sources library. */
export interface KnowledgeChapter {
  chapter: string;
  passageCount: number;
}

const PASSAGE_COLUMNS =
  'id, seq, chapter, section, page_label, source_label, keywords, content, collection, meta_json';

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
    collection: asCollection(row.collection),
    meta: parseMetaJson(row.meta_json),
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

  /** Chapters (handbook) or documents (campus pack) of one corpus, in order. */
  listChapters(collection: KnowledgeCollection): KnowledgeChapter[] {
    try {
      const res = db.executeSync(
        `SELECT chapter, MIN(seq) AS first_seq, COUNT(*) AS n
         FROM handbook_chunks
         WHERE collection = ?
         GROUP BY chapter
         ORDER BY first_seq ASC`,
        [collection],
      );
      return res.rows.map(row => ({
        chapter: String(row.chapter),
        passageCount: Number(row.n ?? 0),
      }));
    } catch {
      return [];
    }
  },

  /** Every passage of one chapter or document, in reading order. */
  listPassages(
    collection: KnowledgeCollection,
    chapter: string,
  ): HandbookFtsHit[] {
    try {
      const res = db.executeSync(
        `SELECT ${PASSAGE_COLUMNS}
         FROM handbook_chunks
         WHERE collection = ? AND chapter = ?
         ORDER BY seq ASC`,
        [collection, chapter],
      );
      return res.rows.map(row => mapHitRow(row));
    } catch {
      return [];
    }
  },

  /** These passages in the given order; ids no longer indexed are skipped. */
  getPassages(ids: readonly string[]): HandbookFtsHit[] {
    const wanted = Array.from(new Set(ids)).slice(0, 25);
    if (wanted.length === 0) {
      return [];
    }
    try {
      const res = db.executeSync(
        `SELECT ${PASSAGE_COLUMNS}
         FROM handbook_chunks
         WHERE id IN (${wanted.map(() => '?').join(', ')})`,
        wanted,
      );
      const byId = new Map(
        res.rows.map(row => [String(row.id), mapHitRow(row)] as const),
      );
      return wanted
        .map(id => byId.get(id))
        .filter((hit): hit is HandbookFtsHit => Boolean(hit));
    } catch {
      return [];
    }
  },

  /**
   * Passages containing every word of `text` (plain substring match, so
   * the student sees exactly what the words find; no ranking or synonyms).
   */
  searchPassages(text: string, limit = 30): HandbookFtsHit[] {
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map(word => word.trim())
      .filter(word => word.length >= 2)
      .slice(0, 6);
    if (words.length === 0) {
      return [];
    }
    const escape = (word: string) => word.replace(/[\\%_]/g, ch => `\\${ch}`);
    const clauses = words.map(
      () =>
        "LOWER(chapter || ' ' || section || ' ' || content) LIKE ? ESCAPE '\\'",
    );
    try {
      const res = db.executeSync(
        `SELECT ${PASSAGE_COLUMNS}
         FROM handbook_chunks
         WHERE ${clauses.join(' AND ')}
         ORDER BY seq ASC
         LIMIT ?`,
        [
          ...words.map(word => `%${escape(word)}%`),
          Math.max(1, Math.min(50, Math.floor(limit))),
        ],
      );
      return res.rows.map(row => mapHitRow(row));
    } catch {
      return [];
    }
  },

  /** Indexed passages of one corpus (the status shows handbook sections only). */
  countChunks(collection: KnowledgeCollection): number {
    try {
      const res = db.executeSync(
        'SELECT COUNT(*) AS n FROM handbook_chunks WHERE collection = ?',
        [collection],
      );
      return Number(res.rows[0]?.n ?? 0);
    } catch {
      return 0;
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
          .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
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
            chunk.collection ?? 'handbook',
            chunk.meta ? JSON.stringify(chunk.meta) : null,
          );
        }
        tx.executeSync(
          `INSERT INTO handbook_chunks (
             id, seq, chapter, section, page_label, source_label, keywords, content, content_chars,
             collection, meta_json
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

  /**
   * BM25-ranked chunks for an FTS5 expression. `collections` limits the
   * search to some corpora (all of them when omitted or empty).
   */
  queryFts(
    matchExpression: string,
    limit = 8,
    collections?: readonly KnowledgeCollection[],
  ): HandbookFtsHit[] {
    const expr = matchExpression.trim();
    if (!expr) {
      return [];
    }
    const clampedLimit = Math.max(1, Math.min(25, Math.floor(limit)));
    const wanted = (collections ?? []).filter(c =>
      KNOWLEDGE_COLLECTIONS.includes(c),
    );
    const collectionFilter =
      wanted.length > 0
        ? `AND c.collection IN (${wanted.map(() => '?').join(', ')})`
        : '';
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
         c.collection,
         c.meta_json,
         bm25(handbook_chunks_fts, 3.0, 4.0, 2.5, 1.0) AS bm25_score
       FROM handbook_chunks_fts
       JOIN handbook_chunks c ON c.rowid = handbook_chunks_fts.rowid
       WHERE handbook_chunks_fts MATCH ? ${collectionFilter}
       ORDER BY bm25_score ASC, c.seq ASC
       LIMIT ?`,
      [expr, ...wanted, clampedLimit],
    );
    return res.rows.map(row => mapHitRow(row));
  },
};
