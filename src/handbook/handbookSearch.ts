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
]);

const CONCEPT_GROUPS: ReadonlyArray<readonly string[]> = [
  [
    'dean',
    'deans',
    'dl',
    'list',
    'honor',
    'honors',
    'latin',
    'cum',
    'laude',
    'magna',
    'summa',
    'scholar',
  ],
  ['inc', 'incomplete', 'completion', 'deficiency'],
  ['grade', 'grades', 'grading', 'gwa', 'gpa', 'rating', 'passing', 'mark'],
  ['fail', 'failed', 'failing', 'singko', '5', '00', 'delinquency'],
  ['drop', 'dropping', 'dropped', 'withdraw', 'withdrawal'],
  ['loa', 'leave', 'absence'],
  [
    'absent',
    'absences',
    'attendance',
    'tardy',
    'tardiness',
    'excused',
    'unexcused',
  ],
  ['uniform', 'dress', 'attire', 'haircut', 'id', 'identification'],
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
  ['shift', 'shifting', 'transfer', 'transferee', 'curriculum'],
  ['retention', 'probation', 'dismissal', 'dismissed', 'disqualification'],
  ['graduate', 'graduation', 'commencement', 'clearance', 'candidate'],
  ['tuition', 'fee', 'fees', 'scholarship', 'refund', 'unifast', 'free'],
  [
    'enroll',
    'enrollment',
    'enrolment',
    'load',
    'overload',
    'underload',
    'prerequisite',
    'registration',
    'units',
  ],
  ['nstp', 'rotc', 'cwts', 'lts'],
  ['grievance', 'appeal', 'complaint', 'petition', 'hearing'],
  ['examination', 'exam', 'exams', 'midterm', 'final', 'special'],
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

function quoteFtsToken(token: string): string {
  return `"${token.replace(/[^a-z0-9]/g, '')}"`;
}

function normalizeAlphaNumericWords(text: string): string[] {
  return (
    text
      .replace(/(\w)['\u2018\u2019](\w)/g, '$1$2')
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}

export function extractQueryTokens(rawQuery: string): string[] {
  const rawMatches = normalizeAlphaNumericWords(rawQuery);
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const raw of rawMatches) {
    const clean = raw.replace(/[^a-z0-9]/g, '');
    if (!clean) {
      continue;
    }
    const isImportantShortToken =
      clean === 'id' || clean === 'dl' || clean === '5';
    if (clean.length < 3 && !isImportantShortToken) {
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
  strictAndExpr: string | null;
  relaxedOrExpr: string | null;
}

export function buildFtsQueries(rawQuery: string): BuiltFtsQueries {
  const tokens = extractQueryTokens(rawQuery).slice(0, 8);
  if (tokens.length === 0) {
    return {
      tokens: [],
      conceptTerms: [],
      strictAndExpr: null,
      relaxedOrExpr: null,
    };
  }

  const groupBuckets = new Map<number, Set<string>>();
  const conceptTerms: string[][] = [];

  for (const token of tokens) {
    const groupIdx = TOKEN_TO_GROUP_INDEX.get(token);
    if (groupIdx !== undefined) {
      let bucket = groupBuckets.get(groupIdx);
      if (!bucket) {
        bucket = new Set<string>();
        groupBuckets.set(groupIdx, bucket);
        for (const synonym of CONCEPT_GROUPS[groupIdx]) {
          bucket.add(synonym);
        }
        conceptTerms.push(Array.from(bucket));
      } else {
        bucket.add(token);
      }
      // Also preserve unexpanded singular/stem variant if needed
      if (token.endsWith('s') && token.length > 4) {
        bucket.add(token.slice(0, -1));
      }
    } else {
      const variants = new Set<string>([token]);
      if (token.endsWith('s') && token.length > 4) {
        variants.add(token.slice(0, -1));
      }
      conceptTerms.push(Array.from(variants));
    }
  }

  const cappedConcepts = conceptTerms.slice(0, 6);
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

function countMatchedConcepts(
  hit: HandbookFtsHit,
  conceptTerms: string[][],
): number {
  if (conceptTerms.length === 0) {
    return 0;
  }
  const haystack = `${hit.chapter} ${hit.section} ${hit.keywords} ${hit.content}`;
  const docWords = new Set(normalizeAlphaNumericWords(haystack));

  let matched = 0;
  for (const terms of conceptTerms) {
    const hitFound = terms.some(term => {
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
      }
      return false;
    });
    if (hitFound) {
      matched += 1;
    }
  }
  return matched;
}

function countRawTokenHits(hit: HandbookFtsHit, tokens: string[]): number {
  const haystack = `${hit.chapter} ${hit.section} ${hit.keywords} ${hit.content}`;
  const docWords = normalizeAlphaNumericWords(haystack);
  const docSet = new Set(docWords);
  let count = 0;
  for (const token of tokens) {
    if (docSet.has(token)) {
      count += 1;
    } else if (token.length >= 5) {
      const prefix = token.slice(0, token.length - 1);
      if (docWords.some(w => w.startsWith(prefix))) {
        count += 1;
      }
    }
  }
  return count;
}

export function rankAndFilterFtsCandidates(
  rawQuery: string,
  built: BuiltFtsQueries,
  candidates: HandbookFtsHit[],
  limit: number,
): LocalHandbookSearchResult {
  if (candidates.length === 0 || built.conceptTerms.length === 0) {
    return {
      matches: [],
      queryUsed: rawQuery,
      insufficientEvidence: true,
      sources: [],
    };
  }

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
    const matchedConcepts = countMatchedConcepts(hit, built.conceptTerms);
    if (matchedConcepts === 0) {
      continue;
    }
    const rawTokenHits = countRawTokenHits(hit, built.tokens);
    // Require either domain concept match or literal raw token overlap
    const coverageRatio = matchedConcepts / totalConcepts;
    if (rawTokenHits === 0 && coverageRatio < 0.5) {
      continue;
    }

    // FTS5 bm25Score is negative (more negative = stronger match). Convert to positive relevance score.
    const bm25Magnitude = Math.max(0, -hit.bm25Score);
    const score = matchedConcepts * 4 + coverageRatio * 3 + bm25Magnitude;

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
    if (b.matchedConcepts !== a.matchedConcepts) {
      return b.matchedConcepts - a.matchedConcepts;
    }
    if (Math.abs(b.score - a.score) > 0.001) {
      return b.score - a.score;
    }
    return a.chunk.seq - b.chunk.seq;
  });

  const top = scored[0];
  if (!top) {
    return {
      matches: [],
      queryUsed: rawQuery,
      insufficientEvidence: true,
      sources: [],
    };
  }

  // Fail-closed gate: single generic token in a multi-concept unrelated question
  // without meaningful BM25 or concept overlap must not hallucinate a citation.
  const insufficientEvidence =
    totalConcepts >= 3 && top.matchedConcepts === 1 && top.score < 5.5;

  if (insufficientEvidence) {
    return {
      matches: [],
      queryUsed: rawQuery,
      insufficientEvidence: true,
      sources: [],
    };
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
    const excerpt = match.chunk.content.replace(/\s+/g, ' ').trim();
    return [
      `### ${match.chunk.section}${pagePart}${chapterPart}`,
      `> "${excerpt}"`,
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
