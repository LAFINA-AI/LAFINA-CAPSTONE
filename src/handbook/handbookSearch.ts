import type {HandbookFtsHit} from '../storage/localHandbookStore';

/**
 * Structurally compatible with `HandbookSource` in `src/skills/onlineChatSkill.ts`
 * without introducing any network/skill dependency inside `src/handbook/`.
 */
export interface LocalHandbookSource {
  title: string;
  section?: string | null;
  page?: number | null;
  snippet?: string | null;
}

export interface LocalHandbookMatch {
  chunk: HandbookFtsHit;
  score: number;
  matchedConcepts: number;
  totalConcepts: number;
  pageNumber: number | null;
  source: LocalHandbookSource;
}

export interface LocalHandbookSearchResult {
  matches: LocalHandbookMatch[];
  queryUsed: string;
  insufficientEvidence: boolean;
  sources: LocalHandbookSource[];
}

export const LOCAL_NO_EVIDENCE_REPLY =
  "I couldn't find an official USTP Student Handbook section supporting that question in the local handbook index. Try rephrasing with specific academic terms (such as grading system, INC completion, Dean's List, attendance, uniform, or retention policy) or verify with the USTP Registrar / Office of Student Affairs.";

const STOP_WORDS = new Set([
  'a',
  'about',
  'after',
  'all',
  'also',
  'am',
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
  'get',
  'give',
  'got',
  'had',
  'has',
  'have',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'know',
  'like',
  'make',
  'many',
  'may',
  'me',
  'more',
  'most',
  'must',
  'my',
  'near',
  'need',
  'no',
  'not',
  'of',
  'on',
  'only',
  'or',
  'our',
  'out',
  'over',
  'own',
  'please',
  'policy',
  'policies',
  'rule',
  'rules',
  'said',
  'say',
  'section',
  'should',
  'so',
  'some',
  'student',
  'students',
  'such',
  'tell',
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
  'to',
  'under',
  'university',
  'ustp',
  'handbook',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  // Conversational filler: never evidence of a handbook topic.
  'another',
  'explain',
  'help',
  'okay',
  'other',
  'simply',
  'study',
  'studying',
  'sure',
  'thank',
  'thanks',
  'want',
  'yeah',
  'yes',
  // Tagalog / Taglish function words.
  'ako',
  'ang',
  'ano',
  'anong',
  'bago',
  'bakit',
  'din',
  'ilan',
  'ilang',
  'ito',
  'kailan',
  'kami',
  'kapag',
  'kasi',
  'kayo',
  'kung',
  'lang',
  'mag',
  'mga',
  'naman',
  'natin',
  'nga',
  'paano',
  'pag',
  'para',
  'pede',
  'puwede',
  'pwede',
  'rin',
  'saan',
  'sila',
  'siya',
  'tayo',
  'wala',
  'yan',
  'yung',
]);

/**
 * Domain concept groups. Every term here is specific to academic policy:
 * generic English words ("list", "free", "final", "load", "leave", "mark")
 * and bare digits were removed because a single generic hit used to count
 * as handbook evidence (audit 2026-11-16 H1). Numeric grades such as "5.0"
 * are normalised to the word "grade" before tokenising instead.
 */
const CONCEPT_GROUPS: ReadonlyArray<readonly string[]> = [
  [
    'dean',
    'deans',
    'dl',
    'honor',
    'honors',
    'latin',
    'cum',
    'laude',
    'magna',
    'summa',
    'valedictorian',
    'salutatorian',
  ],
  ['inc', 'incomplete', 'completion', 'deficiency'],
  ['grade', 'grades', 'grading', 'passing'],
  ['gwa', 'gpa'],
  ['fail', 'failed', 'failing', 'singko', 'delinquency'],
  ['drop', 'dropping', 'dropped', 'withdraw', 'withdrawal'],
  ['loa'],
  [
    'absent',
    'absence',
    'absences',
    'attendance',
    'tardy',
    'tardiness',
    'excused',
    'unexcused',
  ],
  ['uniform', 'dress', 'attire', 'haircut'],
  [
    'cheat',
    'cheating',
    'plagiarism',
    'plagiarize',
    'dishonesty',
    'misconduct',
    'offense',
    'disciplinary',
    'discipline',
    'sanction',
    'suspension',
    'expulsion',
  ],
  ['shift', 'shifting', 'transferee'],
  ['retention', 'probation', 'dismissal', 'dismissed', 'disqualification'],
  ['graduate', 'graduation', 'commencement', 'clearance'],
  ['tuition', 'fee', 'fees', 'scholarship', 'refund', 'unifast'],
  [
    'enroll',
    'enrollment',
    'enrolment',
    'overload',
    'underload',
    'prerequisite',
    'registration',
  ],
  ['nstp', 'rotc', 'cwts', 'lts'],
  ['grievance', 'appeal', 'complaint', 'petition'],
  ['examination', 'exam', 'exams', 'midterm'],
];

const TOKEN_TO_GROUP_INDEX: Map<string, number> = (() => {
  const map = new Map<string, number>();
  CONCEPT_GROUPS.forEach((group, idx) => {
    for (const term of group) {
      map.set(term, idx);
    }
  });
  return map;
})();

/** "5.0", "1.75", "3.00" read as a grade, never as loose digits. */
const NUMERIC_GRADE_RE = /\b[1-5]\.(?:0{1,2}|25|5|50|75)\b/g;

function quoteFtsToken(token: string): string {
  return `"${token.replace(/[^a-z0-9]/g, '')}"`;
}

function normalizeAlphaNumericWords(text: string): string[] {
  return (
    text
      .replace(/(\w)['‘’](\w)/g, '$1$2')
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}

export function extractQueryTokens(rawQuery: string): string[] {
  const rawMatches = normalizeAlphaNumericWords(
    rawQuery.replace(NUMERIC_GRADE_RE, ' grade '),
  );
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const raw of rawMatches) {
    const clean = raw.replace(/[^a-z0-9]/g, '');
    if (!clean) {
      continue;
    }
    const isImportantShortToken = clean === 'id' || clean === 'dl';
    if (clean.length < 3 && !isImportantShortToken) {
      continue;
    }
    if (/^\d+$/.test(clean)) {
      continue;
    }
    if (STOP_WORDS.has(clean)) {
      continue;
    }
    if (!seen.has(clean)) {
      seen.add(clean);
      tokens.push(clean);
    }
  }
  return tokens;
}

export interface BuiltFtsQueries {
  tokens: string[];
  conceptTerms: string[][];
  /** Parallel to `conceptTerms`: true when the concept is a policy domain group. */
  conceptIsDomain: boolean[];
  /** Parallel to `conceptTerms`: the query tokens that produced each concept. */
  conceptTokens: string[][];
  strictAndExpr: string | null;
  relaxedOrExpr: string | null;
}

export function buildFtsQueries(rawQuery: string): BuiltFtsQueries {
  const tokens = extractQueryTokens(rawQuery).slice(0, 8);
  if (tokens.length === 0) {
    return {
      tokens: [],
      conceptTerms: [],
      conceptIsDomain: [],
      conceptTokens: [],
      strictAndExpr: null,
      relaxedOrExpr: null,
    };
  }

  const groupBuckets = new Map<number, {terms: Set<string>; index: number}>();
  const conceptTerms: string[][] = [];
  const conceptIsDomain: boolean[] = [];
  const conceptTokens: string[][] = [];

  for (const token of tokens) {
    const groupIdx = TOKEN_TO_GROUP_INDEX.get(token);
    if (groupIdx !== undefined) {
      let bucket = groupBuckets.get(groupIdx);
      if (!bucket) {
        bucket = {
          terms: new Set<string>(CONCEPT_GROUPS[groupIdx]),
          index: conceptTerms.length,
        };
        groupBuckets.set(groupIdx, bucket);
        conceptTerms.push([]);
        conceptIsDomain.push(true);
        conceptTokens.push([]);
      }
      bucket.terms.add(token);
      if (token.endsWith('s') && token.length > 4) {
        bucket.terms.add(token.slice(0, -1));
      }
      conceptTerms[bucket.index] = Array.from(bucket.terms);
      conceptTokens[bucket.index].push(token);
    } else {
      const variants = new Set<string>([token]);
      if (token.endsWith('s') && token.length > 4) {
        variants.add(token.slice(0, -1));
      }
      conceptTerms.push(Array.from(variants));
      conceptIsDomain.push(false);
      conceptTokens.push([token]);
    }
  }

  const cap = 6;
  const cappedConcepts = conceptTerms.slice(0, cap);
  const groupExprs = cappedConcepts.map(terms => {
    const quoted = terms.map(quoteFtsToken);
    return quoted.length === 1 ? quoted[0] : `(${quoted.join(' OR ')})`;
  });

  const allUniqueTerms = Array.from(new Set(cappedConcepts.flat()));
  const strictAndExpr =
    groupExprs.length >= 2 ? groupExprs.join(' AND ') : null;
  const relaxedOrExpr =
    allUniqueTerms.length > 0
      ? allUniqueTerms.map(quoteFtsToken).join(' OR ')
      : null;

  return {
    tokens,
    conceptTerms: cappedConcepts,
    conceptIsDomain: conceptIsDomain.slice(0, cap),
    conceptTokens: conceptTokens.slice(0, cap),
    strictAndExpr,
    relaxedOrExpr,
  };
}

export function parsePageNumber(pageLabel: string | null): number | null {
  if (!pageLabel) {
    return null;
  }
  const match = pageLabel.match(/\b(\d{1,4})\b/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function hitToHandbookSource(hit: HandbookFtsHit): LocalHandbookSource {
  const snippetClean = hit.content.replace(/\s+/g, ' ').trim();
  return {
    title: hit.sourceLabel || 'USTP Student Handbook',
    section: hit.section ? `${hit.chapter} · ${hit.section}` : hit.chapter,
    page: parsePageNumber(hit.pageLabel),
    snippet:
      snippetClean.length > 220
        ? `${snippetClean.slice(0, 217).trimEnd()}...`
        : snippetClean,
  };
}

/** Whole word, or a stem-like prefix for longer words ("grading" ~ "grade"). */
function wordMatches(docWords: Set<string>, term: string): boolean {
  if (docWords.has(term)) {
    return true;
  }
  if (term.length >= 5) {
    const prefix = term.slice(0, term.length - 1);
    for (const word of docWords) {
      if (word.startsWith(prefix)) {
        return true;
      }
    }
  } else if (term.length === 4) {
    for (const word of docWords) {
      if (word.startsWith(term)) {
        return true;
      }
    }
  }
  return false;
}

function hitWords(hit: HandbookFtsHit): Set<string> {
  return new Set(
    normalizeAlphaNumericWords(
      `${hit.chapter} ${hit.section} ${hit.keywords} ${hit.content}`,
    ),
  );
}

function conceptFlags(docWords: Set<string>, conceptTerms: string[][]): boolean[] {
  return conceptTerms.map(terms => terms.some(t => wordMatches(docWords, t)));
}

function countLiteralHits(docWords: Set<string>, tokens: string[]): number {
  return tokens.filter(token => wordMatches(docWords, token)).length;
}

/**
 * Evidence gate (audit H1). A passage counts as evidence only when:
 * - a free (non-domain) word the handbook never uses is outweighed by two
 *   matched policy concepts, or by one policy concept plus more matched
 *   known words than unknown ones ("explain photosynthesis", "best laptops",
 *   "park near the mall" are refused);
 * - a question with no policy concept matches all of its words (two or more);
 * - a question with policy concepts matches at least one of them and at least
 *   half of all its concepts.
 */
function passesEvidenceGate(
  flags: boolean[],
  built: BuiltFtsQueries,
  unknownFreeTokens: number,
): boolean {
  const total = flags.length;
  if (total === 0) {
    return false;
  }
  const domainTotal = built.conceptIsDomain.filter(Boolean).length;
  const matchedTotal = flags.filter(Boolean).length;
  const matchedDomain = flags.filter(
    (f, i) => f && built.conceptIsDomain[i],
  ).length;

  const matchedFree = matchedTotal - matchedDomain;
  if (
    unknownFreeTokens > 0 &&
    matchedDomain < 2 &&
    !(matchedDomain >= 1 && matchedFree > unknownFreeTokens)
  ) {
    return false;
  }
  if (domainTotal === 0) {
    return total >= 2 && matchedTotal === total;
  }
  if (matchedDomain === 0) {
    return false;
  }
  return matchedTotal / total >= 0.5;
}

export interface RankOptions {
  /**
   * Free (non-domain) query tokens that appear nowhere in the handbook index.
   * Supplied by the service; when omitted every token is treated as known.
   */
  unknownTokens?: ReadonlySet<string>;
}

export function rankAndFilterFtsCandidates(
  rawQuery: string,
  built: BuiltFtsQueries,
  candidates: HandbookFtsHit[],
  limit: number,
  options: RankOptions = {},
): LocalHandbookSearchResult {
  const refused: LocalHandbookSearchResult = {
    matches: [],
    queryUsed: rawQuery,
    insufficientEvidence: true,
    sources: [],
  };
  if (candidates.length === 0 || built.conceptTerms.length === 0) {
    return refused;
  }

  const unknown = options.unknownTokens;
  const unknownFreeTokens = unknown
    ? built.conceptTokens.filter(
        (toks, i) => !built.conceptIsDomain[i] && toks.some(t => unknown.has(t)),
      ).length
    : 0;

  const totalConcepts = built.conceptTerms.length;
  const deduped = new Map<string, HandbookFtsHit>();
  for (const hit of candidates) {
    const existing = deduped.get(hit.id);
    if (!existing || hit.bm25Score < existing.bm25Score) {
      deduped.set(hit.id, hit);
    }
  }

  const scored: LocalHandbookMatch[] = [];
  for (const hit of deduped.values()) {
    const docWords = hitWords(hit);
    const flags = conceptFlags(docWords, built.conceptTerms);
    if (!passesEvidenceGate(flags, built, unknownFreeTokens)) {
      continue;
    }
    const matchedConcepts = flags.filter(Boolean).length;
    const matchedDomain = flags.filter(
      (f, i) => f && built.conceptIsDomain[i],
    ).length;
    const coverageRatio = matchedConcepts / totalConcepts;
    const literal = countLiteralHits(docWords, built.tokens);

    // The chapter/section title is the strongest signal of what a passage
    // is about (audit M5): "Grade Completion" should beat a chunk that
    // merely mentions grades. Keywords count, but less.
    const sectionWords = new Set(
      normalizeAlphaNumericWords(`${hit.chapter} ${hit.section}`),
    );
    const sectionLiteral = countLiteralHits(sectionWords, built.tokens);
    const sectionConcepts = conceptFlags(
      sectionWords,
      built.conceptTerms,
    ).filter(Boolean).length;
    const keywordLiteral = countLiteralHits(
      new Set(normalizeAlphaNumericWords(hit.keywords)),
      built.tokens,
    );

    // FTS5 bm25 is negative (more negative = stronger). Clamp it so long,
    // repetitive chunks cannot drown the literal and title signals.
    const bm25Magnitude = Math.min(15, Math.max(0, -hit.bm25Score));
    const score =
      matchedDomain * 5 +
      (matchedConcepts - matchedDomain) * 2 +
      coverageRatio * 3 +
      literal * 1.5 +
      sectionLiteral * 4 +
      sectionConcepts * 3 +
      keywordLiteral +
      bm25Magnitude * 0.4;

    scored.push({
      chunk: hit,
      score,
      matchedConcepts,
      totalConcepts,
      pageNumber: parsePageNumber(hit.pageLabel),
      source: hitToHandbookSource(hit),
    });
  }

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) {
      return b.score - a.score;
    }
    return a.chunk.seq - b.chunk.seq;
  });

  const top = scored[0];
  if (!top) {
    return refused;
  }

  const finalMatches = scored
    .filter(
      item =>
        item.matchedConcepts >= Math.max(1, top.matchedConcepts - 1) &&
        item.score >= top.score * 0.45,
    )
    .slice(0, Math.max(1, limit));

  return {
    matches: finalMatches,
    queryUsed: rawQuery,
    insufficientEvidence: false,
    sources: finalMatches.map(m => m.source),
  };
}

/** Free (non-domain) tokens of a query, the ones checked against the index vocabulary. */
export function freeTokensOf(built: BuiltFtsQueries): string[] {
  return built.conceptTokens
    .filter((_toks, i) => !built.conceptIsDomain[i])
    .flat();
}

/**
 * Strips prompt-injection fence tags and control markers from retrieved passages
 * before injecting them into the online AI prompt.
 */
export function sanitizePassageForPrompt(text: string): string {
  return text
    .replace(/<\/?[a-z_:-]+>/gi, ' ')
    .replace(/<<<|>>>/g, ' ')
    .replace(
      /\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?\b/gi,
      '[redacted]',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildPromptHandbookContext(
  matches: LocalHandbookMatch[],
  maxChars = 2400,
): string {
  if (matches.length === 0) {
    return '';
  }
  const header =
    '\n\n<handbook_excerpts note="Verified local USTP Student Handbook excerpts. Cite chapter/section and page labels accurately. If the excerpts do not answer the question, state that the handbook excerpts provided do not specify it.">\n';
  const footer = '</handbook_excerpts>';
  const budget = Math.max(400, maxChars - header.length - footer.length);

  const lines: string[] = [];
  let used = 0;
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const pageStr = m.chunk.pageLabel ? `, ${m.chunk.pageLabel}` : '';
    const cleanBody = sanitizePassageForPrompt(m.chunk.content);
    const entry = `[${i + 1}] ${m.chunk.chapter} — ${
      m.chunk.section
    }${pageStr}\n${cleanBody}\n`;
    if (lines.length > 0 && used + entry.length > budget) {
      break;
    }
    if (lines.length === 0 && entry.length > budget) {
      lines.push(`${entry.slice(0, Math.max(120, budget - 4)).trimEnd()}...\n`);
      break;
    }
    lines.push(entry);
    used += entry.length;
  }

  if (lines.length === 0) {
    return '';
  }
  return `${header}${lines.join('')}${footer}`;
}

/** Chunks can start mid-sentence; mark that honestly instead of hiding it. */
function presentExcerpt(content: string): string {
  const excerpt = content.replace(/\s+/g, ' ').trim();
  return /^[a-z,;)]/.test(excerpt) ? `…${excerpt}` : excerpt;
}

export function formatOfflineHandbookReply(
  result: LocalHandbookSearchResult,
): string {
  if (result.insufficientEvidence || result.matches.length === 0) {
    return LOCAL_NO_EVIDENCE_REPLY;
  }

  const blocks = result.matches.slice(0, 3).map(match => {
    const pagePart = match.chunk.pageLabel
      ? ` *(${match.chunk.pageLabel})*`
      : '';
    const chapterPart = match.chunk.chapter ? `\n*${match.chunk.chapter}*` : '';
    return [
      `### ${match.chunk.section}${pagePart}${chapterPart}`,
      `> "${presentExcerpt(match.chunk.content)}"`,
    ].join('\n');
  });

  return [
    'According to the local USTP Student Handbook:',
    '',
    blocks.join('\n\n---\n\n'),
  ].join('\n');
}

export function shouldMergeFollowUpQuery(query: string): boolean {
  const meaningful = extractQueryTokens(query);
  return meaningful.length > 0 && meaningful.length <= 2;
}
