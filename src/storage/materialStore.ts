import {db} from './database';
import type {DatabaseTransaction} from './database';
import {createMaterialFtsIndex, materialFtsIndexExists} from './materialSchema';
import {generateId} from '../utils';

export type MaterialFileKind = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md' | 'csv';

export interface MaterialOutlineEntry {
  heading: string;
  pageNumber: number;
  pageLabel: string;
}

export interface UserMaterialRecord {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  fileKind: MaterialFileKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
  pagesRead: number;
  ocrPages: number;
  chunkCount: number;
  totalChars: number;
  outline: MaterialOutlineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface MaterialChunkInput {
  id?: string;
  seq: number;
  heading: string;
  pageStart: number;
  pageEnd: number;
  pageLabel: string;
  keywords: string;
  content: string;
}

export interface MaterialChunkHit {
  id: string;
  materialId: string;
  materialTitle: string;
  fileName: string;
  fileKind: MaterialFileKind;
  seq: number;
  heading: string;
  pageStart: number;
  pageEnd: number;
  pageLabel: string;
  keywords: string;
  content: string;
  bm25Score: number;
}

export interface MaterialCitation {
  materialId: string;
  title: string;
  heading: string;
  pageLabel: string;
  snippet: string;
  content?: string;
  seq?: number;
}

export interface MaterialQaMessage {
  id: string;
  userId: string;
  scopeKey: string;
  sender: 'user' | 'assistant';
  content: string;
  sources: MaterialCitation[];
  usedOnline: boolean;
  createdAt: string;
}

const INSERT_BATCH_SIZE = 25;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`);
}

function parseOutline(raw: unknown): MaterialOutlineEntry[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object'),
      )
      .map(entry => ({
        heading: typeof entry.heading === 'string' ? entry.heading : '',
        pageNumber:
          typeof entry.pageNumber === 'number' &&
          Number.isFinite(entry.pageNumber)
            ? entry.pageNumber
            : 1,
        pageLabel:
          typeof entry.pageLabel === 'string' && entry.pageLabel.trim()
            ? entry.pageLabel
            : 'p. 1',
      }))
      .filter(entry => entry.heading.length > 0);
  } catch {
    return [];
  }
}

function parseSources(raw: unknown): MaterialCitation[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object'),
      )
      .map(entry => ({
        materialId: String(entry.materialId ?? ''),
        title: String(entry.title ?? 'Lesson material'),
        heading: typeof entry.heading === 'string' ? entry.heading : '',
        pageLabel: typeof entry.pageLabel === 'string' ? entry.pageLabel : '',
        snippet: typeof entry.snippet === 'string' ? entry.snippet : '',
        ...(typeof entry.content === 'string' ? {content: entry.content} : {}),
        ...(typeof entry.seq === 'number' &&
        Number.isInteger(entry.seq) &&
        entry.seq >= 1
          ? {seq: entry.seq}
          : {}),
      }))
      .filter(entry => entry.title.length > 0);
  } catch {
    return [];
  }
}

function mapMaterialRow(row: Record<string, unknown>): UserMaterialRecord {
  const kind = String(row.file_kind ?? 'txt') as MaterialFileKind;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title ?? 'Lesson material'),
    fileName: String(row.file_name ?? 'document'),
    fileKind: kind,
    mimeType: String(row.mime_type ?? 'application/octet-stream'),
    sizeBytes: Number(row.size_bytes ?? 0),
    sha256: String(row.sha256 ?? ''),
    pageCount: Number(row.page_count ?? 1),
    pagesRead: Number(row.pages_read ?? 1),
    ocrPages: Number(row.ocr_pages ?? 0),
    chunkCount: Number(row.chunk_count ?? 0),
    totalChars: Number(row.total_chars ?? 0),
    outline: parseOutline(row.outline_json),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapChunkHitRow(row: Record<string, unknown>): MaterialChunkHit {
  return {
    id: String(row.id),
    materialId: String(row.material_id),
    materialTitle: String(row.material_title ?? 'Lesson material'),
    fileName: String(row.file_name ?? 'document'),
    fileKind: String(row.file_kind ?? 'txt') as MaterialFileKind,
    seq: Number(row.seq ?? 0),
    heading: typeof row.heading === 'string' ? row.heading : '',
    pageStart: Number(row.page_start ?? 1),
    pageEnd: Number(row.page_end ?? 1),
    pageLabel: String(row.page_label ?? 'p. 1'),
    keywords: typeof row.keywords === 'string' ? row.keywords : '',
    content: String(row.content ?? ''),
    bm25Score: Number(row.bm25_score ?? 0),
  };
}

function mapQaMessageRow(row: Record<string, unknown>): MaterialQaMessage {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    scopeKey: String(row.scope_key),
    sender: row.sender === 'user' ? 'user' : 'assistant',
    content: String(row.content ?? ''),
    sources: parseSources(row.sources_json),
    usedOnline: Number(row.used_online ?? 0) === 1,
    createdAt: String(row.created_at ?? ''),
  };
}

function buildMaterialScopeFilter(materialIds?: readonly string[] | null): {
  clause: string;
  params: string[];
} {
  const clean = (materialIds ?? []).map(id => id.trim()).filter(Boolean);
  if (clean.length === 0) return {clause: '', params: []};
  const placeholders = clean.map(() => '?').join(', ');
  return {clause: ` AND c.material_id IN (${placeholders})`, params: clean};
}

export interface MaterialSection {
  index: number;
  /** "pp. 1–6", "Slides 4–9" or "Part 2". */
  label: string;
  heading: string;
  text: string;
  pageStart: number;
  pageEnd: number;
}

function sectionLabel(
  fileKind: string,
  index: number,
  pageStart: number,
  pageEnd: number,
): string {
  if (fileKind === 'pdf' || fileKind === 'docx') {
    return pageStart === pageEnd
      ? `p. ${pageStart}`
      : `pp. ${pageStart}–${pageEnd}`;
  }
  if (fileKind === 'pptx') {
    return pageStart === pageEnd
      ? `Slide ${pageStart}`
      : `Slides ${pageStart}–${pageEnd}`;
  }
  return `Part ${index + 1}`;
}

export const materialStore = {
  ensureFtsIndex(): boolean {
    try {
      if (materialFtsIndexExists(db)) {
        return true;
      }
      db.transactionSync(tx => {
        createMaterialFtsIndex(tx);
        tx.executeSync(
          "INSERT INTO user_material_chunks_fts(user_material_chunks_fts) VALUES ('rebuild')",
        );
      });
      return true;
    } catch (error) {
      console.warn(
        '[MaterialStore] SQLite FTS5 unavailable; using LIKE fallback:',
        error,
      );
      return false;
    }
  },

  listMaterials(userId: string): UserMaterialRecord[] {
    const res = db.executeSync(
      `SELECT id, user_id, title, file_name, file_kind, mime_type, size_bytes,
              sha256, page_count, pages_read, ocr_pages, chunk_count, total_chars,
              outline_json, created_at, updated_at
       FROM user_materials
       WHERE user_id = ?
       ORDER BY updated_at DESC, id ASC`,
      [userId],
    );
    return res.rows.map(mapMaterialRow);
  },

  getMaterial(userId: string, materialId: string): UserMaterialRecord | null {
    const res = db.executeSync(
      `SELECT id, user_id, title, file_name, file_kind, mime_type, size_bytes,
              sha256, page_count, pages_read, ocr_pages, chunk_count, total_chars,
              outline_json, created_at, updated_at
       FROM user_materials
       WHERE user_id = ? AND id = ?
       LIMIT 1`,
      [userId, materialId],
    );
    return res.rows.length > 0 ? mapMaterialRow(res.rows[0]) : null;
  },

  findByHash(userId: string, sha256: string): UserMaterialRecord | null {
    if (!sha256.trim()) return null;
    const res = db.executeSync(
      `SELECT id, user_id, title, file_name, file_kind, mime_type, size_bytes,
              sha256, page_count, pages_read, ocr_pages, chunk_count, total_chars,
              outline_json, created_at, updated_at
       FROM user_materials
       WHERE user_id = ? AND sha256 = ?
       LIMIT 1`,
      [userId, sha256],
    );
    return res.rows.length > 0 ? mapMaterialRow(res.rows[0]) : null;
  },

  searchMaterialTitles(
    userId: string,
    query: string,
    limit = 10,
  ): UserMaterialRecord[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const clamped = Math.max(1, Math.min(25, Math.floor(limit)));
    const pattern = `%${escapeLike(trimmed)}%`;
    const res = db.executeSync(
      `SELECT id, user_id, title, file_name, file_kind, mime_type, size_bytes,
              sha256, page_count, pages_read, ocr_pages, chunk_count, total_chars,
              outline_json, created_at, updated_at
       FROM user_materials
       WHERE user_id = ? AND (title LIKE ? ESCAPE '\\' OR file_name LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC, id ASC
       LIMIT ?`,
      [userId, pattern, pattern, clamped],
    );
    return res.rows.map(mapMaterialRow);
  },

  saveMaterialWithChunks(
    userId: string,
    material: Omit<
      UserMaterialRecord,
      'id' | 'userId' | 'createdAt' | 'updatedAt' | 'chunkCount'
    > & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
    },
    chunks: MaterialChunkInput[],
  ): UserMaterialRecord {
    const now = new Date().toISOString();
    const materialId = material.id?.trim() || generateId('mat');
    const createdAt = material.createdAt || now;
    const updatedAt = material.updatedAt || now;
    const cleanTitle = material.title.trim().slice(0, 120) || 'Lesson material';

    db.transactionSync(tx => {
      tx.executeSync(
        `INSERT INTO user_materials (
           id, user_id, title, file_name, file_kind, mime_type, size_bytes,
           sha256, page_count, pages_read, ocr_pages, chunk_count, total_chars,
           outline_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          materialId,
          userId,
          cleanTitle,
          material.fileName,
          material.fileKind,
          material.mimeType,
          Math.max(0, Math.floor(material.sizeBytes)),
          material.sha256,
          Math.max(1, Math.floor(material.pageCount)),
          Math.max(1, Math.floor(material.pagesRead)),
          Math.max(0, Math.floor(material.ocrPages)),
          chunks.length,
          Math.max(0, Math.floor(material.totalChars)),
          JSON.stringify(material.outline ?? []),
          createdAt,
          updatedAt,
        ],
      );

      for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
        const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);
        const placeholders = batch
          .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .join(', ');
        const params: unknown[] = [];
        for (const chunk of batch) {
          params.push(
            chunk.id?.trim() || `${materialId}_c${chunk.seq}`,
            materialId,
            userId,
            chunk.seq,
            chunk.heading,
            chunk.pageStart,
            chunk.pageEnd,
            chunk.pageLabel,
            chunk.keywords,
            chunk.content,
            chunk.content.length,
          );
        }
        tx.executeSync(
          `INSERT INTO user_material_chunks (
             id, material_id, user_id, seq, heading, page_start, page_end,
             page_label, keywords, content, content_chars
           ) VALUES ${placeholders}`,
          params,
        );
      }
    });

    return {
      id: materialId,
      userId,
      title: cleanTitle,
      fileName: material.fileName,
      fileKind: material.fileKind,
      mimeType: material.mimeType,
      sizeBytes: Math.max(0, Math.floor(material.sizeBytes)),
      sha256: material.sha256,
      pageCount: Math.max(1, Math.floor(material.pageCount)),
      pagesRead: Math.max(1, Math.floor(material.pagesRead)),
      ocrPages: Math.max(0, Math.floor(material.ocrPages)),
      chunkCount: chunks.length,
      totalChars: Math.max(0, Math.floor(material.totalChars)),
      outline: material.outline ?? [],
      createdAt,
      updatedAt,
    };
  },

  renameMaterial(
    userId: string,
    materialId: string,
    newTitle: string,
  ): boolean {
    const clean = newTitle.trim().slice(0, 120);
    if (!clean) return false;
    const now = new Date().toISOString();
    const res = db.executeSync(
      `UPDATE user_materials
       SET title = ?, updated_at = ?
       WHERE user_id = ? AND id = ?`,
      [clean, now, userId, materialId],
    );
    return res.rowsAffected > 0;
  },

  deleteMaterial(userId: string, materialId: string): boolean {
    let deleted = false;
    db.transactionSync(tx => {
      tx.executeSync(
        'DELETE FROM user_material_chunks WHERE user_id = ? AND material_id = ?',
        [userId, materialId],
      );
      tx.executeSync(
        'DELETE FROM user_material_qa_messages WHERE user_id = ? AND scope_key = ?',
        [userId, materialId],
      );
      const res = tx.executeSync(
        'DELETE FROM user_materials WHERE user_id = ? AND id = ?',
        [userId, materialId],
      );
      deleted = res.rowsAffected > 0;
    });
    return deleted;
  },

  queryFts(
    userId: string,
    matchExpression: string,
    materialIds?: readonly string[] | null,
    limit = 12,
  ): MaterialChunkHit[] {
    const expr = matchExpression.trim();
    if (!expr) return [];
    const clamped = Math.max(1, Math.min(30, Math.floor(limit)));
    const scope = buildMaterialScopeFilter(materialIds);
    const res = db.executeSync(
      `SELECT
         c.id,
         c.material_id,
         m.title AS material_title,
         m.file_name,
         m.file_kind,
         c.seq,
         c.heading,
         c.page_start,
         c.page_end,
         c.page_label,
         c.keywords,
         c.content,
         bm25(user_material_chunks_fts, 3.5, 2.5, 1.0) AS bm25_score
       FROM user_material_chunks_fts
       JOIN user_material_chunks c ON c.rowid = user_material_chunks_fts.rowid
       JOIN user_materials m ON m.id = c.material_id
       WHERE user_material_chunks_fts MATCH ?
         AND c.user_id = ?
         AND m.user_id = ?${scope.clause}
       ORDER BY bm25_score ASC, c.seq ASC
       LIMIT ?`,
      [expr, userId, userId, ...scope.params, clamped],
    );
    return res.rows.map(mapChunkHitRow);
  },

  queryFallbackLike(
    userId: string,
    tokens: readonly string[],
    materialIds?: readonly string[] | null,
    limit = 12,
  ): MaterialChunkHit[] {
    const cleanTokens = tokens
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6);
    if (cleanTokens.length === 0) return [];
    const clamped = Math.max(1, Math.min(30, Math.floor(limit)));
    const scope = buildMaterialScopeFilter(materialIds);
    const tokenClauses = cleanTokens
      .map(
        () =>
          "(LOWER(c.content) LIKE ? ESCAPE '\\' OR LOWER(c.heading) LIKE ? ESCAPE '\\' OR LOWER(c.keywords) LIKE ? ESCAPE '\\')",
      )
      .join(' OR ');
    const tokenParams: string[] = [];
    for (const token of cleanTokens) {
      const pattern = `%${escapeLike(token)}%`;
      tokenParams.push(pattern, pattern, pattern);
    }
    const res = db.executeSync(
      `SELECT
         c.id,
         c.material_id,
         m.title AS material_title,
         m.file_name,
         m.file_kind,
         c.seq,
         c.heading,
         c.page_start,
         c.page_end,
         c.page_label,
         c.keywords,
         c.content,
         -1.0 AS bm25_score
       FROM user_material_chunks c
       JOIN user_materials m ON m.id = c.material_id
       WHERE c.user_id = ?
         AND m.user_id = ?${scope.clause}
         AND (${tokenClauses})
       ORDER BY c.seq ASC
       LIMIT ?`,
      [userId, userId, ...scope.params, ...tokenParams, clamped],
    );
    return res.rows.map(mapChunkHitRow);
  },

  getChunksByPage(
    userId: string,
    pageNumber: number,
    materialIds?: readonly string[] | null,
    limit = 6,
  ): MaterialChunkHit[] {
    const page = Math.max(1, Math.floor(pageNumber));
    const clamped = Math.max(1, Math.min(20, Math.floor(limit)));
    const scope = buildMaterialScopeFilter(materialIds);
    const res = db.executeSync(
      `SELECT
         c.id,
         c.material_id,
         m.title AS material_title,
         m.file_name,
         m.file_kind,
         c.seq,
         c.heading,
         c.page_start,
         c.page_end,
         c.page_label,
         c.keywords,
         c.content,
         -10.0 AS bm25_score
       FROM user_material_chunks c
       JOIN user_materials m ON m.id = c.material_id
       WHERE c.user_id = ?
         AND m.user_id = ?
         AND c.page_start <= ?
         AND c.page_end >= ?${scope.clause}
       ORDER BY m.updated_at DESC, c.seq ASC
       LIMIT ?`,
      [userId, userId, page, page, ...scope.params, clamped],
    );
    return res.rows.map(mapChunkHitRow);
  },

  getOpeningChunks(
    userId: string,
    materialIds?: readonly string[] | null,
    limit = 4,
  ): MaterialChunkHit[] {
    const clamped = Math.max(1, Math.min(12, Math.floor(limit)));
    const scope = buildMaterialScopeFilter(materialIds);
    const res = db.executeSync(
      `SELECT
         c.id,
         c.material_id,
         m.title AS material_title,
         m.file_name,
         m.file_kind,
         c.seq,
         c.heading,
         c.page_start,
         c.page_end,
         c.page_label,
         c.keywords,
         c.content,
         -5.0 AS bm25_score
       FROM user_material_chunks c
       JOIN user_materials m ON m.id = c.material_id
       WHERE c.user_id = ?
         AND m.user_id = ?${scope.clause}
       ORDER BY c.seq ASC, m.updated_at DESC
       LIMIT ?`,
      [userId, userId, ...scope.params, clamped],
    );
    return res.rows.map(mapChunkHitRow);
  },

  getNeighborChunks(
    userId: string,
    materialId: string,
    seqs: readonly number[],
  ): MaterialChunkHit[] {
    const cleanSeqs = Array.from(
      new Set(seqs.filter(s => Number.isInteger(s) && s >= 1)),
    );
    if (cleanSeqs.length === 0) return [];
    const placeholders = cleanSeqs.map(() => '?').join(', ');
    const res = db.executeSync(
      `SELECT
         c.id,
         c.material_id,
         m.title AS material_title,
         m.file_name,
         m.file_kind,
         c.seq,
         c.heading,
         c.page_start,
         c.page_end,
         c.page_label,
         c.keywords,
         c.content,
         0.0 AS bm25_score
       FROM user_material_chunks c
       JOIN user_materials m ON m.id = c.material_id
       WHERE c.user_id = ?
         AND m.user_id = ?
         AND c.material_id = ?
         AND c.seq IN (${placeholders})
       ORDER BY c.seq ASC`,
      [userId, userId, materialId, ...cleanSeqs],
    );
    return res.rows.map(mapChunkHitRow);
  },

  getMaterialTextPreview(
    userId: string,
    materialId: string,
    maxChars = 12000,
  ): string {
    const res = db.executeSync(
      `SELECT content
       FROM user_material_chunks
       WHERE user_id = ? AND material_id = ?
       ORDER BY seq ASC`,
      [userId, materialId],
    );
    let out = '';
    for (const row of res.rows) {
      const piece = typeof row.content === 'string' ? row.content.trim() : '';
      if (!piece) continue;
      if (out.length > 0) out += '\n\n';
      out += piece;
      if (out.length >= maxChars) {
        return out.slice(0, maxChars);
      }
    }
    return out;
  },

  /**
   * Splits a lesson into consecutive parts of at most `maxChars` each, in
   * reading order, so a student can pick which part a quiz, deck or summary
   * uses instead of always getting the opening pages.
   */
  getMaterialSections(
    userId: string,
    materialId: string,
    maxChars = 12000,
  ): MaterialSection[] {
    const res = db.executeSync(
      `SELECT c.content, c.heading, c.page_start, c.page_end, m.file_kind
       FROM user_material_chunks c
       JOIN user_materials m ON m.id = c.material_id
       WHERE c.user_id = ? AND c.material_id = ? AND m.user_id = ?
       ORDER BY c.seq ASC`,
      [userId, materialId, userId],
    );
    const sections: MaterialSection[] = [];
    let text = '';
    let heading = '';
    let pageStart = 0;
    let pageEnd = 0;
    let kind = '';
    const flush = () => {
      if (!text) return;
      sections.push({
        index: sections.length,
        label: sectionLabel(kind, sections.length, pageStart, pageEnd),
        heading,
        text: text.slice(0, maxChars),
        pageStart,
        pageEnd,
      });
      text = '';
      heading = '';
    };
    for (const row of res.rows) {
      const piece = typeof row.content === 'string' ? row.content.trim() : '';
      if (!piece) continue;
      kind = String(row.file_kind ?? '');
      const start = Number(row.page_start) || 1;
      const end = Math.max(start, Number(row.page_end) || start);
      if (text && text.length + 2 + piece.length > maxChars) flush();
      if (!text) {
        pageStart = start;
        heading =
          typeof row.heading === 'string' ? row.heading.trim().slice(0, 60) : '';
      }
      pageEnd = Math.max(pageEnd, end);
      text = text ? `${text}\n\n${piece}` : piece;
      if (!heading && typeof row.heading === 'string') {
        heading = row.heading.trim().slice(0, 60);
      }
    }
    flush();
    return sections;
  },

  listMessages(
    userId: string,
    scopeKey: string,
    limit = 60,
  ): MaterialQaMessage[] {
    const clamped = Math.max(1, Math.min(200, Math.floor(limit)));
    const res = db.executeSync(
      `SELECT id, user_id, scope_key, sender, content, sources_json, used_online, created_at
       FROM user_material_qa_messages
       WHERE user_id = ? AND scope_key = ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`,
      [userId, scopeKey, clamped],
    );
    return res.rows.map(mapQaMessageRow).reverse();
  },

  getMessageCountsByScope(userId: string): Record<string, number> {
    const res = db.executeSync(
      `SELECT scope_key, COUNT(*) AS count
       FROM user_material_qa_messages
       WHERE user_id = ?
       GROUP BY scope_key`,
      [userId],
    );
    const counts: Record<string, number> = {};
    for (const row of res.rows) {
      const key = typeof row.scope_key === 'string' ? row.scope_key : '';
      if (key) counts[key] = Number(row.count ?? 0);
    }
    return counts;
  },

  addMessage(
    userId: string,
    input: {
      id?: string;
      scopeKey: string;
      sender: 'user' | 'assistant';
      content: string;
      sources?: MaterialCitation[];
      usedOnline?: boolean;
      createdAt?: string;
    },
  ): MaterialQaMessage {
    const id = input.id?.trim() || generateId('mqa');
    const createdAt = input.createdAt || new Date().toISOString();
    const sources = input.sources ?? [];
    const usedOnline = input.usedOnline === true;
    db.executeSync(
      `INSERT INTO user_material_qa_messages (
         id, user_id, scope_key, sender, content, sources_json, used_online, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        input.scopeKey,
        input.sender,
        input.content,
        sources.length > 0 ? JSON.stringify(sources) : null,
        usedOnline ? 1 : 0,
        createdAt,
      ],
    );
    return {
      id,
      userId,
      scopeKey: input.scopeKey,
      sender: input.sender,
      content: input.content,
      sources,
      usedOnline,
      createdAt,
    };
  },

  clearThread(userId: string, scopeKey: string): void {
    db.executeSync(
      'DELETE FROM user_material_qa_messages WHERE user_id = ? AND scope_key = ?',
      [userId, scopeKey],
    );
  },

  deleteMessage(userId: string, messageId: string): void {
    db.executeSync(
      'DELETE FROM user_material_qa_messages WHERE user_id = ? AND id = ?',
      [userId, messageId],
    );
  },

  clearForUser(userId: string, tx?: DatabaseTransaction): void {
    const run = (executor: Pick<DatabaseTransaction, 'executeSync'>) => {
      executor.executeSync(
        'DELETE FROM user_material_chunks WHERE user_id = ?',
        [userId],
      );
      executor.executeSync(
        'DELETE FROM user_material_qa_messages WHERE user_id = ?',
        [userId],
      );
      executor.executeSync('DELETE FROM user_materials WHERE user_id = ?', [
        userId,
      ]);
    };
    if (tx) {
      run(tx);
    } else {
      db.transactionSync(run);
    }
  },

  transferFromGuest(
    tx: DatabaseTransaction,
    guestUserId: string,
    cloudUserId: string,
  ): void {
    if (guestUserId === cloudUserId) return;
    // Drop guest copies whose exact content hash already exists on the cloud account.
    const dupes = tx.executeSync(
      `SELECT g.id
       FROM user_materials g
       JOIN user_materials c
         ON c.user_id = ? AND c.sha256 = g.sha256
       WHERE g.user_id = ?`,
      [cloudUserId, guestUserId],
    ).rows;
    for (const row of dupes) {
      const dupeId = String(row.id);
      tx.executeSync(
        'DELETE FROM user_material_chunks WHERE user_id = ? AND material_id = ?',
        [guestUserId, dupeId],
      );
      tx.executeSync(
        'DELETE FROM user_material_qa_messages WHERE user_id = ? AND scope_key = ?',
        [guestUserId, dupeId],
      );
      tx.executeSync(
        'DELETE FROM user_materials WHERE user_id = ? AND id = ?',
        [guestUserId, dupeId],
      );
    }

    tx.executeSync('UPDATE user_materials SET user_id = ? WHERE user_id = ?', [
      cloudUserId,
      guestUserId,
    ]);
    tx.executeSync(
      'UPDATE user_material_chunks SET user_id = ? WHERE user_id = ?',
      [cloudUserId, guestUserId],
    );
    tx.executeSync(
      'UPDATE user_material_qa_messages SET user_id = ? WHERE user_id = ?',
      [cloudUserId, guestUserId],
    );
  },
};
