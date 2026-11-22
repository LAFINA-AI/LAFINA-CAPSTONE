import type {
  MaterialChunkInput,
  MaterialFileKind,
  MaterialOutlineEntry,
} from '../storage/materialStore';
import type {ExtractedPage} from './materialExtractor';

const TARGET_CHUNK_WORDS = 220;
const OVERLAP_WORDS = 40;
const MAX_CHUNK_CHARS = 1350;
const MAX_OUTLINE_ENTRIES = 40;

const DOT_LEADER_RE = /(?:\.\s?){5,}\s*(?:[ivxlcdm]{1,6}|\d{1,4})\s*$/i;
const MARKDOWN_HEADING_RE = /^#{1,4}\s+(.{2,95})$/;
const NAMED_HEADING_RE =
  /^(?:chapter|unit|module|lesson|topic|part|section|sec\.?|article|art\.?|appendix)\s+(?:[ivxlcdm]+|\d+(?:\.\d+)*)(?:[:.\-\s]+.*)?$/i;
const NUMBERED_HEADING_RE = /^\d+(?:\.\d+){0,3}\s+[A-Z][^\n]{2,82}$/;

const KEYWORD_STOP_WORDS = new Set([
  'a',
  'about',
  'after',
  'all',
  'also',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'during',
  'each',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'may',
  'more',
  'most',
  'must',
  'no',
  'not',
  'of',
  'on',
  'one',
  'only',
  'or',
  'other',
  'our',
  'out',
  'over',
  'page',
  'said',
  'same',
  'see',
  'should',
  'since',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'two',
  'under',
  'up',
  'use',
  'used',
  'using',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'ang',
  'mga',
  'ito',
  'iyan',
  'yung',
  'para',
  'kapag',
  'kung',
  'naman',
  'lang',
]);

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function utf8Bytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/** Pure-JS SHA-256 hex digest so content deduplication requires zero native/node dependencies. */
export function sha256Hex(text: string): string {
  const data = utf8Bytes(text);
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Int32Array(64);
  const rotr = (v: number, n: number) => (v >>> n) | (v << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getInt32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(v => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

export function cleanTitleFromFileName(fileName: string): string {
  const leaf = fileName.split(/[/\\]/).pop() || 'Lesson material';
  const stripped = leaf.replace(/\.[a-z0-9]{1,8}$/i, '');
  const spaced = stripped.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (spaced || 'Lesson material').slice(0, 90);
}

export function formatMaterialPageLabel(
  fileKind: MaterialFileKind,
  pageStart: number,
  pageEnd: number,
  pageCount: number,
): string {
  if (fileKind === 'pptx') {
    return pageStart === pageEnd
      ? `Slide ${pageStart}`
      : `Slides ${pageStart}–${pageEnd}`;
  }
  if (fileKind === 'txt' || fileKind === 'md' || fileKind === 'csv') {
    if (pageCount <= 1 && pageStart === 1 && pageEnd === 1) {
      return 'Text';
    }
    return pageStart === pageEnd
      ? `Part ${pageStart}`
      : `Parts ${pageStart}–${pageEnd}`;
  }
  return pageStart === pageEnd
    ? `p. ${pageStart}`
    : `pp. ${pageStart}–${pageEnd}`;
}

function normalizeEdgeKey(line: string): string {
  return line
    .trim()
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function findRunningEdgeLines(pages: ExtractedPage[]): Set<string> {
  if (pages.length < 4) return new Set();
  const counts = new Map<string, number>();
  for (const page of pages) {
    const lines = page.text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const candidates = Array.from(
      new Set(
        [...lines.slice(0, 2), ...lines.slice(-2)]
          .filter(l => l.length <= 100)
          .map(normalizeEdgeKey),
      ),
    );
    for (const key of candidates) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.ceil(pages.length * 0.6);
  const running = new Set<string>();
  for (const [key, count] of counts.entries()) {
    if (count >= threshold && key.length > 0) {
      running.add(key);
    }
  }
  return running;
}

function stripPageEdgesAndToc(
  rawText: string,
  runningEdges: Set<string>,
): string[] {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim());
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length === 0) return [];

  // Skip whole pages that are predominantly Table-of-Contents dot-leader entries.
  const dotLeaderCount = nonEmpty.filter(l => DOT_LEADER_RE.test(l)).length;
  if (
    dotLeaderCount >= 3 &&
    dotLeaderCount >= Math.ceil(nonEmpty.length * 0.45)
  ) {
    return [];
  }

  let start = 0;
  let end = lines.length;
  for (let i = 0; i < Math.min(2, lines.length); i += 1) {
    if (!lines[i] || runningEdges.has(normalizeEdgeKey(lines[i]))) {
      start = i + 1;
    } else {
      break;
    }
  }
  for (
    let i = lines.length - 1;
    i >= Math.max(start, lines.length - 2);
    i -= 1
  ) {
    if (!lines[i] || runningEdges.has(normalizeEdgeKey(lines[i]))) {
      end = i;
    } else {
      break;
    }
  }

  return lines
    .slice(start, end)
    .filter(line => line.length > 0 && !DOT_LEADER_RE.test(line));
}

function detectHeading(
  line: string,
  isFirstLineOnSlide: boolean,
): string | null {
  const md = MARKDOWN_HEADING_RE.exec(line);
  if (md) return md[1].trim().slice(0, 100);
  if (line.length < 3 || line.length > 95) return null;
  if (/^\d+$/.test(line)) return null;
  if (/^(?:fig(?:ure)?|table)\s+\d+/i.test(line)) return null;
  if (
    /^\d+(?:\.\d+)?\s*(?:mg|ml|kg|g|cm|mm|km|ms|hz|kb|mb|gb|%)\b/i.test(line)
  ) {
    return null;
  }
  if (NAMED_HEADING_RE.test(line)) return line;
  if (NUMBERED_HEADING_RE.test(line) && !/[.;,!?]$/.test(line)) return line;
  if (isFirstLineOnSlide && line.length <= 85 && !/[.;,!?]$/.test(line)) {
    return line;
  }
  const colonIdx = line.indexOf(':');
  if (colonIdx > 0 && line.slice(colonIdx + 1).trim().length > 45) {
    return null;
  }
  const hasLetters = /[A-Za-z]/.test(line);
  if (!hasLetters || /[.;,!?]$/.test(line)) return null;
  const words = line.split(/\s+/);
  if (words.length >= 2 && words.length <= 10) {
    const isAllCaps = line === line.toUpperCase() && /[A-Z]{3}/.test(line);
    if (isAllCaps) return line;
    const capitalizedCount = words.filter(w => /^[A-Z0-9]/.test(w)).length;
    if (
      capitalizedCount >= Math.ceil(words.length * 0.75) &&
      line.length <= 75
    ) {
      return line;
    }
  }
  return null;
}

function extractTopKeywords(text: string): string {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const rawTokens = normalized.match(/[a-z0-9][a-z0-9._-]{0,30}/g) ?? [];
  const freq = new Map<string, number>();
  for (const raw of rawTokens) {
    const clean = raw.replace(/^[._-]+|[._-]+$/g, '');
    if (clean.length < 2) continue;
    if (KEYWORD_STOP_WORDS.has(clean)) continue;
    freq.set(clean, (freq.get(clean) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([term]) => term)
    .join(' ');
}

interface WordToken {
  word: string;
  pageNumber: number;
  heading: string;
  groupId: number;
  lineBreakBefore?: boolean;
}

export function chunkExtractedPages(input: {
  fileName: string;
  fileKind: MaterialFileKind;
  pages: ExtractedPage[];
}): {
  title: string;
  sha256: string;
  outline: MaterialOutlineEntry[];
  chunks: MaterialChunkInput[];
  totalChars: number;
} {
  const title = cleanTitleFromFileName(input.fileName);
  const runningEdges = findRunningEdgeLines(input.pages);
  const outline: MaterialOutlineEntry[] = [];
  const seenOutline = new Set<string>();
  const wordStream: WordToken[] = [];
  const canonicalTextParts: string[] = [];

  let activeHeading = '';
  let groupId = 0;
  for (const page of input.pages) {
    const lines = stripPageEdgesAndToc(page.text, runningEdges);
    if (lines.length === 0) continue;
    canonicalTextParts.push(lines.join('\n'));
    if (input.fileKind === 'pptx' && wordStream.length > 0) {
      groupId += 1;
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const detected = detectHeading(
        line,
        input.fileKind === 'pptx' && i === 0,
      );
      if (detected) {
        if (
          input.fileKind !== 'pptx' &&
          wordStream.length > 0 &&
          wordStream[wordStream.length - 1].pageNumber !== page.pageNumber
        ) {
          groupId += 1;
        }
        activeHeading = detected;
        const outlineKey = `${detected.toLowerCase()}|${page.pageNumber}`;
        if (
          !seenOutline.has(outlineKey) &&
          outline.length < MAX_OUTLINE_ENTRIES
        ) {
          seenOutline.add(outlineKey);
          outline.push({
            heading: detected,
            pageNumber: page.pageNumber,
            pageLabel: formatMaterialPageLabel(
              input.fileKind,
              page.pageNumber,
              page.pageNumber,
              input.pages.length,
            ),
          });
        }
      }
      const cleanLine = line.replace(/^#{1,4}\s+/, '');
      const words = cleanLine.split(/\s+/).filter(Boolean);
      for (let w = 0; w < words.length; w += 1) {
        wordStream.push({
          word: words[w],
          pageNumber: page.pageNumber,
          heading: activeHeading,
          groupId,
          lineBreakBefore: w === 0 && wordStream.length > 0,
        });
      }
    }
  }

  const canonicalText = canonicalTextParts.join('\n\n');
  const sha256 = sha256Hex(canonicalText || input.fileName);
  const chunks: MaterialChunkInput[] = [];

  let start = 0;
  while (start < wordStream.length) {
    const currentGroup = wordStream[start].groupId;
    const window: WordToken[] = [];
    let charLen = 0;
    let end = start;
    while (
      end < wordStream.length &&
      window.length < TARGET_CHUNK_WORDS &&
      wordStream[end].groupId === currentGroup
    ) {
      const nextWord = wordStream[end].word;
      const addedLen = (window.length > 0 ? 1 : 0) + nextWord.length;
      if (window.length > 0 && charLen + addedLen > MAX_CHUNK_CHARS) {
        break;
      }
      window.push(wordStream[end]);
      charLen += addedLen;
      end += 1;
      if (charLen >= MAX_CHUNK_CHARS) break;
    }

    if (window.length === 0) break;

    const first = window[0];
    const last = window[window.length - 1];
    const headingCounts = new Map<string, number>();
    for (const token of window) {
      if (!token.heading) continue;
      headingCounts.set(
        token.heading,
        (headingCounts.get(token.heading) ?? 0) + 1,
      );
    }
    let dominantHeading = first.heading;
    let bestCount = 0;
    for (const [heading, count] of headingCounts.entries()) {
      if (count > bestCount) {
        dominantHeading = heading;
        bestCount = count;
      }
    }

    const content = window
      .map((t, idx) =>
        idx === 0 ? t.word : `${t.lineBreakBefore ? '\n' : ' '}${t.word}`,
      )
      .join('')
      .trim();
    const pageStart = Math.min(first.pageNumber, last.pageNumber);
    const pageEnd = Math.max(first.pageNumber, last.pageNumber);
    const seq = chunks.length + 1;
    chunks.push({
      seq,
      heading: dominantHeading,
      pageStart,
      pageEnd,
      pageLabel: formatMaterialPageLabel(
        input.fileKind,
        pageStart,
        pageEnd,
        input.pages.length,
      ),
      keywords: extractTopKeywords(
        dominantHeading ? `${dominantHeading} ${content}` : content,
      ),
      content,
    });

    if (end >= wordStream.length) break;
    if (wordStream[end].groupId !== currentGroup) {
      start = end;
    } else {
      const step = Math.max(1, window.length - OVERLAP_WORDS);
      start += step;
    }
  }

  return {
    title,
    sha256,
    outline,
    chunks,
    totalChars: canonicalText.length,
  };
}
