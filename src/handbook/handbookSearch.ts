import type {
  HandbookFtsHit,
  KnowledgeCollection,
  KnowledgeSourceRef,
} from '../storage/localHandbookStore';
import {
  analyzeKnowledgeQuery,
  formatAsOfDate,
  isSnapshotStale,
  scopeRejection,
  staleSnapshotNote,
  type ScopeRejection,
} from './knowledgeScope';

/**
 * Structurally compatible with `HandbookSource` in `src/skills/onlineChatSkill.ts`
 * without introducing any network/skill dependency inside `src/handbook/`.
 */
export interface LocalHandbookSource {
  title: string;
  section?: string | null;
  page?: number | null;
  snippet?: string | null;
  /** Absent for the Student Handbook; 'ustp_cdo' for the campus knowledge pack. */
  collection?: KnowledgeCollection;
  /** Official pages the passage cites (campus knowledge only, always https). */
  links?: KnowledgeSourceRef[];
  /** Date the campus snapshot was verified, "2026-11-24". */
  asOf?: string | null;
  /** "PDF p. 3" for the academic calendar. */
  pageLabel?: string | null;
  /** The indexed passage, so the student can open the exact text later. */
  passageId?: string;
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
  /**
   * Set when campus passages matched but belong to a different academic
   * year than the one asked about: the answer says which year LAFINA has
   * instead of giving another year's dates.
   */
  insufficientReason?: 'academic_year';
  /** The academic years LAFINA does have, for that reply. */
  availableYears?: string[];
  /** Official pages to check instead (from the refused passages). */
  fallbackLinks?: KnowledgeSourceRef[];
}

export const LOCAL_NO_EVIDENCE_REPLY =
  "I couldn't verify that from my USTP sources (the 2023 USTP Student Handbook and the USTP Cagayan de Oro knowledge snapshot). Try rephrasing with specific terms (such as INC completion, Dean's List, attendance, second semester midterms, enrollment, or e-Library), or check with the USTP CDO Registrar or Office of Student Affairs.";

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
  'mean',
  'means',
  'meaning',
  'stand',
  'stands',
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
  [
    'tuition',
    'fee',
    'fees',
    'scholarship',
    'scholarships',
    'grant',
    'grants',
    'stipend',
    'allowance',
    'refund',
    'unifast',
  ],
  [
    'enroll',
    'enrol',
    'enrolled',
    'enrollment',
    'enrolment',
    'preenrollment',
    'overload',
    'underload',
    'prerequisite',
    'registration',
  ],
  ['nstp', 'rotc', 'cwts', 'lts'],
  ['grievance', 'appeal', 'complaint', 'petition'],
  [
    'examination',
    'examinations',
    'exam',
    'exams',
    'midterm',
    'midterms',
    'finals',
    'preliminary',
    'prefinal',
  ],
  // USTP Cagayan de Oro knowledge pack (calendar, campus information). Same
  // rule as above: only words that name a campus topic on their own.
  ['semester', 'semesters', 'midyear', 'calendar'],
  ['holiday', 'holidays'],
  ['wow', 'orientation'],
  ['library', 'libraries', 'elibrary', 'opac', 'avr', 'librarian'],
  ['registrar', 'transcript', 'transcripts'],
  ['prisms', 'ustep', 'eclearance', 'portal', 'portals'],
  [
    'admission',
    'admissions',
    'ustat',
    'applicant',
    'applicants',
    'freshmen',
    'freshman',
  ],
  ['program', 'programs', 'bsit', 'bscs', 'degree', 'degrees'],
  [
    'organization',
    'organizations',
    'org',
    'orgs',
    'club',
    'clubs',
    'council',
    'scitc',
  ],
  ['aso', 'icts', 'guidance', 'counseling', 'counselling', 'clinic'],
  [
    'campus',
    'campuses',
    'cdo',
    'cdeo',
    'cagayan',
    'lapasan',
    'alubijid',
    'balubal',
    'claveria',
    'address',
  ],
  ['director', 'directors', 'officials'],
];

/**
 * Campus-question shorthand mapped to the words the sources use, applied
 * before tokenising ("2nd sem prelims" -> "second semester preliminary").
 */
const QUERY_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b1st\b/gi, 'first'],
  [/\b2nd\b/gi, 'second'],
  [/\bsems?\b/gi, 'semester'],
  [/\bprelims?\b/gi, 'preliminary'],
  [/\bpre-?finals?\b/gi, 'prefinal'],
  [/\bsummer\b/gi, 'midyear'],
  [/\bmid-year\b/gi, 'midyear'],
  [/\be-?\s?library\b/gi, 'elibrary'],
  [/\be-?\s?clearance\b/gi, 'eclearance'],
  [/\bpre-?\s?enrol(?:l)?ment\b/gi, 'preenrollment'],
  [/\bweek\s+of\s+welcome\b/gi, 'wow'],
  // Office tables say "main line local 137", not "phone number".
  [
    /\b(?:tele)?phone(?:\s+(?:numbers?|no\.?))?\b|\bcontact\s+(?:numbers?|no\.?)\b|\bhotline\b/gi,
    'contact',
  ],
  // "Where is USTP CDO (located)?" asks for the campus address.
  [
    /\bwhere\s+is\s+(?:the\s+)?(?:ustp\s*)?(?:cdo|cdeo|cagayan\s+de\s+oro)(?:\s+campus)?(?:\s+located)?\b/gi,
    'cdo campus address',
  ],
];

const applyQuerySynonyms = (text: string): string =>
  QUERY_SYNONYMS.reduce(
    (acc, [pattern, word]) => acc.replace(pattern, word),
    text,
  );

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
    applyQuerySynonyms(rawQuery).replace(NUMERIC_GRADE_RE, ' grade '),
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
  const snippet =
    snippetClean.length > 220
      ? `${snippetClean.slice(0, 217).trimEnd()}...`
      : snippetClean;
  if (hit.collection === 'ustp_cdo') {
    return {
      title: hit.sourceLabel || hit.chapter,
      section: hit.section,
      page: hit.meta?.pdfPages[0] ?? null,
      snippet,
      collection: 'ustp_cdo',
      links: hit.meta?.sources ?? [],
      asOf: hit.meta?.asOf ?? null,
      pageLabel: hit.pageLabel,
      passageId: hit.id,
    };
  }
  return {
    title: hit.sourceLabel || 'USTP Student Handbook',
    section: hit.section ? `${hit.chapter} · ${hit.section}` : hit.chapter,
    page: parsePageNumber(hit.pageLabel),
    snippet,
    passageId: hit.id,
  };
}

/** Words the question wrote in capitals ("SITE", "PRISMS"), lowercased. */
function acronymsOf(rawQuery: string): Set<string> {
  return new Set(
    (rawQuery.match(/\b[A-Z][A-Z0-9]{2,7}\b/g) ?? []).map(word =>
      word.toLowerCase(),
    ),
  );
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

/**
 * A passage's words for matching. Campus passages get the same shorthand
 * mapping as questions ("e-Library" -> "elibrary", "Week of Welcome" ->
 * "wow"); Student Handbook passages are matched exactly as before.
 */
function passageWords(hit: HandbookFtsHit, text: string): Set<string> {
  return new Set(
    normalizeAlphaNumericWords(
      hit.collection === 'ustp_cdo' ? applyQuerySynonyms(text) : text,
    ),
  );
}

function hitWords(hit: HandbookFtsHit): Set<string> {
  return passageWords(
    hit,
    `${hit.chapter} ${hit.section} ${hit.keywords} ${hit.content}`,
  );
}

/**
 * Query acronyms ("SITE") the passage writes in capitals too. "site" in
 * "activity site" is not evidence for "What does SITE stand for?".
 */
function acronymEvidence(
  hit: HandbookFtsHit,
  acronyms: ReadonlySet<string>,
): number {
  if (acronyms.size === 0) {
    return 0;
  }
  const upper = new Set(
    `${hit.section} ${hit.keywords} ${hit.content}`.match(
      /\b[A-Z][A-Z0-9]{2,7}\b/g,
    ) ?? [],
  );
  let count = 0;
  for (const acronym of acronyms) {
    if (upper.has(acronym.toUpperCase())) count += 1;
  }
  return count;
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** "Nov 30", "November 30" in a question -> /November 30\b/ for calendar rows. */
function monthDayPatterns(query: string): RegExp[] {
  const found: RegExp[] = [];
  const re =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})\b/gi;
  for (const match of query.matchAll(re)) {
    const prefix = match[1].toLowerCase().slice(0, 3);
    const month = MONTH_NAMES.find(name => name.startsWith(prefix));
    const day = Number(match[2]);
    if (month && day >= 1 && day <= 31) {
      found.push(new RegExp(`\\b${month}\\s+${day}\\b`, 'i'));
    }
  }
  return found;
}

/**
 * The rows of a campus list that answer the question best: a calendar part
 * holds about a dozen dated rows, and "2nd sem midterms" wants the midterm
 * rows. A named date ("Nov 30") picks its own rows; otherwise rows with the
 * most question words win. Words already in the passage title ("second
 * semester") do not pick rows. `matched` is false when no line of the list
 * is about the question at all (the passage is then not evidence); only a
 * list longer than three rows is narrowed for display.
 */
function rankListLines(
  hit: HandbookFtsHit,
  query: string,
): {lines: string[]; hidden: number; matched: boolean; narrowed: boolean} {
  const lines = hit.content.split('\n').filter(line => line.trim());
  const listLines = lines.filter(line => line.startsWith('- '));
  const unchanged = {lines, hidden: 0, matched: true, narrowed: false};
  if (listLines.length < 2) {
    return unchanged;
  }
  const dates = monthDayPatterns(query);
  const aliases = hit.meta?.aliases ?? {};
  let scoreOf: (line: string) => number;
  if (dates.length > 0) {
    scoreOf = line => (dates.some(re => re.test(line)) ? 1 : 0);
  } else {
    const titleWords = passageWords(hit, `${hit.chapter} ${hit.section}`);
    const tokens = extractQueryTokens(query).filter(
      token => !wordMatches(titleWords, token),
    );
    if (tokens.length === 0) {
      return unchanged;
    }
    scoreOf = line => {
      const words = passageWords(hit, line);
      const lower = line.toLowerCase();
      return tokens.filter(token => {
        if (wordMatches(words, token)) return true;
        // "CITC" picks the row that writes the full college name.
        const name = aliases[token.toUpperCase()];
        return Boolean(name && lower.includes(name.toLowerCase()));
      }).length;
    };
  }
  if (Math.max(0, ...lines.map(scoreOf)) === 0) {
    return {lines, hidden: 0, matched: false, narrowed: false};
  }
  const best = Math.max(0, ...listLines.map(scoreOf));
  if (listLines.length <= 3 || best === 0) {
    return unchanged;
  }
  const kept = lines.filter(
    line => !line.startsWith('- ') || scoreOf(line) === best,
  );
  const keptList = kept.filter(line => line.startsWith('- ')).length;
  return {
    lines: kept,
    hidden: listLines.length - keptList,
    matched: true,
    narrowed: true,
  };
}

function conceptFlags(
  docWords: Set<string>,
  conceptTerms: string[][],
): boolean[] {
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
  acronymHits: number,
): boolean {
  const total = flags.length;
  if (total === 0) {
    return false;
  }
  // "What does SITE stand for?": one word, written as an acronym, that the
  // passage itself writes in capitals.
  if (total === 1 && flags[0] && unknownFreeTokens === 0 && acronymHits > 0) {
    return true;
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
        (toks, i) =>
          !built.conceptIsDomain[i] && toks.some(t => unknown.has(t)),
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

  const acronyms = acronymsOf(rawQuery);
  const scope = analyzeKnowledgeQuery(rawQuery);
  const gated: HandbookFtsHit[] = [];
  for (const hit of deduped.values()) {
    const flags = conceptFlags(hitWords(hit), built.conceptTerms);
    if (
      passesEvidenceGate(
        flags,
        built,
        unknownFreeTokens,
        acronymEvidence(hit, acronyms),
      )
    ) {
      gated.push(hit);
    }
  }

  // Campus passages for another academic year, semester or audience never
  // answer; they are remembered so an "AY 2025-2026" question can be told
  // which year LAFINA has instead of being given this year's dates.
  const undergraduateAvailable = gated.some(
    hit =>
      hit.collection === 'ustp_cdo' &&
      hit.meta?.scope !== 'GR' &&
      scopeRejection(hit, scope, false) === null,
  );
  const rejectedFor = new Map<ScopeRejection, HandbookFtsHit[]>();
  const eligible = gated.filter(hit => {
    const why = scopeRejection(hit, scope, undergraduateAvailable);
    if (why) {
      rejectedFor.set(why, [...(rejectedFor.get(why) ?? []), hit]);
    }
    return why === null;
  });

  // A policy question is answered from the Student Handbook and a dated,
  // campus-information question from the USTP CDO knowledge pack whenever
  // that corpus has evidence, so the two never give competing answers.
  const preferred = scope.prefer;
  const inPreferred = preferred
    ? eligible.filter(hit => hit.collection === preferred)
    : [];
  const pool = inPreferred.length > 0 ? inPreferred : eligible;

  // A dated question for another academic year gets "LAFINA has AY …",
  // never another year's dates and never unrelated handbook passages.
  const wrongYear = rejectedFor.get('academic_year') ?? [];
  const campusEligible = eligible.some(hit => hit.collection === 'ustp_cdo');
  if (
    wrongYear.length > 0 &&
    scope.academicYear &&
    !campusEligible &&
    preferred !== 'handbook'
  ) {
    const years = Array.from(
      new Set(wrongYear.flatMap(hit => hit.meta?.academicYears ?? [])),
    ).sort();
    const links = uniqueLinks(
      wrongYear.flatMap(hit => hit.meta?.sources ?? []),
    );
    return {
      ...refused,
      insufficientReason: 'academic_year',
      availableYears: years,
      fallbackLinks: links,
    };
  }

  const scored: LocalHandbookMatch[] = [];
  for (const hit of pool) {
    const docWords = hitWords(hit);
    const flags = conceptFlags(docWords, built.conceptTerms);
    const matchedConcepts = flags.filter(Boolean).length;
    const matchedDomain = flags.filter(
      (f, i) => f && built.conceptIsDomain[i],
    ).length;
    const coverageRatio = matchedConcepts / totalConcepts;
    const literal = countLiteralHits(docWords, built.tokens);

    // The chapter/section title is the strongest signal of what a passage
    // is about (audit M5): "Grade Completion" should beat a chunk that
    // merely mentions grades. Keywords count, but less.
    const sectionWords = passageWords(hit, `${hit.chapter} ${hit.section}`);
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
    // The pack's conflict/refresh rules are written for the assistant; they
    // back up an answer but should not lead it when a direct passage exists.
    const guidanceOnly =
      hit.collection === 'ustp_cdo' && hit.meta?.category === 'qa' ? 3 : 0;
    // Asked about one semester: that semester's own passages first.
    const termMatch = scope.term && hit.meta?.term === scope.term ? 2 : 0;
    // A campus list with a row for the question beats one without.
    const listRows =
      hit.collection === 'ustp_cdo' ? rankListLines(hit, rawQuery) : null;
    const rowMatch = listRows?.narrowed ? 3 : 0;
    const acronymMatch = acronymEvidence(hit, acronyms) * 6;
    const score =
      matchedDomain * 5 +
      (matchedConcepts - matchedDomain) * 2 +
      coverageRatio * 3 +
      literal * 1.5 +
      sectionLiteral * 4 +
      sectionConcepts * 3 +
      keywordLiteral +
      bm25Magnitude * 0.4 +
      termMatch +
      rowMatch +
      acronymMatch -
      guidanceOnly;
    if (listRows && !listRows.matched) {
      // A dozen dated rows, none about the question: not evidence.
      continue;
    }

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

/** Each official page once, in first-seen order. */
export function uniqueLinks(links: KnowledgeSourceRef[]): KnowledgeSourceRef[] {
  const seen = new Set<string>();
  return links.filter(link => {
    if (seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
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

const HANDBOOK_ONLY_EXCERPTS_HEADER =
  '\n\n<handbook_excerpts note="Verified local USTP Student Handbook excerpts. Cite chapter/section and page labels accurately. If the excerpts do not answer the question, state that the handbook excerpts provided do not specify it.">\n';

const KNOWLEDGE_EXCERPTS_HEADER =
  '\n\n<handbook_excerpts note="Verified local USTP excerpts: the 2023 USTP Student Handbook (standing policies) and LAFINA\'s USTP Cagayan de Oro knowledge snapshot (official USTP pages and the CHED-noted Academic Calendar AY 2026-2027). Answer only from these excerpts. Name the source and page (for example: AY 2026-2027 calendar, PDF p. 3) and say campus information is as of its date. Keep undergraduate and graduate dates, semesters and academic years apart. If an excerpt has a Caveat, state it and never choose one of two conflicting dates. Never invent dates, fees, names, links or live announcements; the app shows the source links. If the excerpts do not answer the question, state that the excerpts provided do not specify it.">\n';

export interface KnowledgeFormatOptions {
  /** "Now" for snapshot freshness; defaults to the current time. */
  referenceDate?: Date;
}

/** How a campus passage is labelled for the model: source, date, scope. */
function campusEntryLabel(chunk: HandbookFtsHit): string {
  const meta = chunk.meta;
  const parts = ['USTP CDO knowledge'];
  if (meta?.asOf) parts[0] += `, as of ${formatAsOfDate(meta.asOf)}`;
  if (meta?.scope === 'UG') parts.push('undergraduate');
  if (meta?.scope === 'GR') parts.push('graduate');
  if (meta?.academicYears.length)
    parts.push(`AY ${meta.academicYears.join(', ')}`);
  return `(${parts.join('; ')})`;
}

export interface BuiltPromptHandbookContext {
  contextBlock: string;
  includedMatches: LocalHandbookMatch[];
  includedSources: LocalHandbookSource[];
}

export function buildPromptHandbookContextWithMeta(
  matches: LocalHandbookMatch[],
  maxChars = 2400,
  options: KnowledgeFormatOptions = {},
): BuiltPromptHandbookContext {
  if (matches.length === 0) {
    return {contextBlock: '', includedMatches: [], includedSources: []};
  }
  const referenceDate = options.referenceDate ?? new Date();
  const header = matches.some(m => m.chunk.collection === 'ustp_cdo')
    ? KNOWLEDGE_EXCERPTS_HEADER
    : HANDBOOK_ONLY_EXCERPTS_HEADER;
  const footer = '</handbook_excerpts>';
  const budget = Math.max(400, maxChars - header.length - footer.length);

  const lines: string[] = [];
  const includedMatches: LocalHandbookMatch[] = [];
  let used = 0;
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const pageStr = m.chunk.pageLabel ? `, ${m.chunk.pageLabel}` : '';
    const cleanBody = sanitizePassageForPrompt(m.chunk.content);
    const campus = m.chunk.collection === 'ustp_cdo' ? m.chunk.meta : null;
    const extras = campus
      ? [
          ...campus.caveats.map(
            c => `Caveat: ${sanitizePassageForPrompt(c.text)}`,
          ),
          ...(campus.asOf && isSnapshotStale(campus, referenceDate)
            ? [`Freshness: ${staleSnapshotNote(campus.asOf)}`]
            : []),
        ]
      : [];
    const label = campus ? ` ${campusEntryLabel(m.chunk)}` : '';
    const headingLine = `[${i + 1}] ${m.chunk.chapter} — ${
      m.chunk.section
    }${pageStr}${label}\n`;
    const extrasBlock = extras.map(e => `${e}\n`).join('');
    const entry = `${headingLine}${extrasBlock}${cleanBody}\n`;
    if (lines.length > 0 && used + entry.length > budget) {
      break;
    }
    if (lines.length === 0 && entry.length > budget) {
      const prefix = `${headingLine}${extrasBlock}`;
      const bodyBudget = Math.max(60, budget - prefix.length - 5);
      if (prefix.length < budget - 40) {
        lines.push(`${prefix}${cleanBody.slice(0, bodyBudget).trimEnd()}...\n`);
      } else {
        lines.push(
          `${entry.slice(0, Math.max(120, budget - 4)).trimEnd()}...\n`,
        );
      }
      includedMatches.push(m);
      break;
    }
    lines.push(entry);
    includedMatches.push(m);
    used += entry.length;
  }

  if (lines.length === 0) {
    return {contextBlock: '', includedMatches: [], includedSources: []};
  }
  return {
    contextBlock: `${header}${lines.join('')}${footer}`,
    includedMatches,
    includedSources: includedMatches.map(m => m.source),
  };
}

export function buildPromptHandbookContext(
  matches: LocalHandbookMatch[],
  maxChars = 2400,
  options: KnowledgeFormatOptions = {},
): string {
  return buildPromptHandbookContextWithMeta(matches, maxChars, options)
    .contextBlock;
}

/** Chunks can start mid-sentence; mark that honestly instead of hiding it. */
function presentExcerpt(content: string): string {
  const excerpt = content.replace(/\s+/g, ' ').trim();
  return /^[a-z,;)]/.test(excerpt) ? `…${excerpt}` : excerpt;
}

/** A bare https address in a campus passage becomes a tappable link. */
export function linkifyUrls(line: string): string {
  return line.replace(/https:\/\/[^\s<>()\]]+/g, raw => {
    const url = raw.replace(/[.,;:]+$/, '');
    return `[${url}](${url})${raw.slice(url.length)}`;
  });
}

function formatCampusBlock(match: LocalHandbookMatch, query: string): string {
  const chunk = match.chunk;
  const pagePart = chunk.pageLabel ? ` *(${chunk.pageLabel})*` : '';
  const {lines, hidden} = rankListLines(chunk, query);
  const body = lines.map(linkifyUrls);
  if (hidden > 0) {
    body.push(
      `*(${hidden} more ${hidden === 1 ? 'item' : 'items'} in this section.)*`,
    );
  }
  const caveats = (chunk.meta?.caveats ?? []).map(
    caveat => `> **Note:** ${caveat.text}`,
  );
  return [
    `### ${chunk.section}${pagePart}\n*${chunk.chapter}*`,
    body.join('\n'),
    ...(caveats.length ? [caveats.join('\n>\n')] : []),
  ].join('\n\n');
}

function formatHandbookBlock(match: LocalHandbookMatch): string {
  const pagePart = match.chunk.pageLabel ? ` *(${match.chunk.pageLabel})*` : '';
  const chapterPart = match.chunk.chapter ? `\n*${match.chunk.chapter}*` : '';
  return [
    `### ${match.chunk.section}${pagePart}${chapterPart}`,
    `> "${presentExcerpt(match.chunk.content)}"`,
  ].join('\n');
}

/** "AY 2025-2026" was asked, but LAFINA's calendar is for another year. */
export function wrongAcademicYearReply(
  result: LocalHandbookSearchResult,
): string {
  const asked = analyzeKnowledgeQuery(result.queryUsed).academicYear;
  const have = (result.availableYears ?? []).map(y => `AY ${y}`).join(' and ');
  const links = (result.fallbackLinks ?? [])
    .map(link => `[${link.title}](${link.url})`)
    .join(' or ');
  return [
    `My USTP Cagayan de Oro calendar information covers ${
      have || 'a different academic year'
    }, so I can't give ${asked ? `AY ${asked}` : 'those'} dates from it.`,
    links ? `Please check ${links} for that year's official calendar.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function formatOfflineHandbookReply(
  result: LocalHandbookSearchResult,
  options: KnowledgeFormatOptions = {},
): string {
  if (result.insufficientReason === 'academic_year') {
    return wrongAcademicYearReply(result);
  }
  if (result.insufficientEvidence || result.matches.length === 0) {
    return LOCAL_NO_EVIDENCE_REPLY;
  }

  const shown = result.matches.slice(0, 3);
  const campus = shown.filter(m => m.chunk.collection === 'ustp_cdo');
  if (campus.length === 0) {
    return [
      'According to the local USTP Student Handbook:',
      '',
      shown.map(formatHandbookBlock).join('\n\n---\n\n'),
    ].join('\n');
  }

  const referenceDate = options.referenceDate ?? new Date();
  const asOfDates = Array.from(
    new Set(campus.map(m => m.chunk.meta?.asOf).filter(Boolean)),
  ) as string[];
  const asOfText = asOfDates.length
    ? `, as of ${asOfDates.map(formatAsOfDate).join(' and ')}`
    : '';
  const intro =
    campus.length === shown.length
      ? `From my USTP Cagayan de Oro knowledge (official USTP sources${asOfText}):`
      : `From my USTP sources (USTP Student Handbook 2023 and USTP Cagayan de Oro knowledge${asOfText}):`;
  const blocks = shown.map(match =>
    match.chunk.collection === 'ustp_cdo'
      ? formatCampusBlock(match, result.queryUsed)
      : formatHandbookBlock(match),
  );
  const stale = campus.find(
    m => m.chunk.meta?.asOf && isSnapshotStale(m.chunk.meta, referenceDate),
  );
  const closing = stale?.chunk.meta?.asOf
    ? [`*${staleSnapshotNote(stale.chunk.meta.asOf)}*`]
    : [];
  return [
    intro,
    '',
    blocks.join('\n\n---\n\n'),
    ...closing.flatMap(c => ['', c]),
  ].join('\n');
}

export function shouldMergeFollowUpQuery(query: string): boolean {
  const meaningful = extractQueryTokens(query);
  return meaningful.length > 0 && meaningful.length <= 2;
}
