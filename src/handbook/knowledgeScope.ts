import type {
  HandbookFtsHit,
  KnowledgeChunkMeta,
  KnowledgeCollection,
  KnowledgeScope,
  KnowledgeTerm,
  KnowledgeVolatility,
} from '../storage/localHandbookStore';

/**
 * What a question says about which part of the USTP knowledge it wants:
 * an academic year, a semester, undergraduate or graduate dates, and whether
 * it is a standing-policy question (the 2023 Student Handbook) or a dated,
 * campus-information question (the USTP CDO knowledge pack).
 */
export interface KnowledgeQueryScope {
  /** "2025-2026" when the question names an academic year. */
  academicYear: string | null;
  term: KnowledgeTerm | null;
  /** 'GR' only when the question is clearly about graduate studies. */
  audience: KnowledgeScope | null;
  prefer: KnowledgeCollection | null;
}

const AY_RE =
  /\b(?:a\.?y\.?|s\.?y\.?|school\s+year|academic\s+year)?\s*(20\d{2})\s*(?:-|–|—|\/|to)\s*(20\d{2}|\d{2})\b/i;

const FIRST_TERM_RE = /\b(?:first|1st)\s+(?:sem(?:ester)?|term)\b/i;
const SECOND_TERM_RE = /\b(?:second|2nd)\s+(?:sem(?:ester)?|term)\b/i;
const MIDYEAR_RE = /\b(?:mid-?\s?year|summer)\b/i;

/** "graduate students", "grad school", "masters" — not "graduating" or "graduation". */
const GRADUATE_AUDIENCE_RE =
  /\b(?:graduate\s+(?:school|students?|studies|level|programs?|classes|calendar|enrol(?:l)?ment|midterms?|finals?|exams?|examinations?|admissions?|semester|term|midyear|orientation)|grad\s+school|master['’]?s|masters|ph\.?\s?d|doctoral|post-?grad(?:uate)?)\b/i;

/** Standing rules: answered from the Student Handbook. */
const POLICY_RE =
  /\b(?:polic(?:y|ies)|rules?|regulations?|allowed|allowable|permitted|prohibited|banned|forbidden|penalt(?:y|ies)|sanctions?|offen[cs]es?|discipline|disciplinary|grading|grades?|gwa|gpa|inc|incomplete|retention|probation|honors?|latin|cum\s+laude|dress\s+code|uniform|attire|haircut|jeans|tattered|torn|ripped|slippers|shorts|sleeveless|earrings?|blouses?|miniskirts?|midriff|curfew|attendance|absences?|tardiness|cheating|plagiari[sz]m|conduct|loa|leave\s+of\s+absence|shift(?:ing)?|can\s+(?:i|we|students?)|may\s+i|am\s+i\s+allowed|is\s+it\s+(?:ok|okay)|pwede|puwede|bawal|what\s+happens\s+if|what\s+if)\b/i;

/** Dates, places, offices, portals, programs: answered from the campus pack. */
const CAMPUS_INFO_RE =
  /\b(?:when|dates?|schedules?|calendar|starts?|begins?|ends?|semester|sem|midyear|summer|holidays?|exams?|examinations?|midterms?|finals|prelims?|enrol(?:l|ment|lment)?|wow|week\s+of\s+welcome|where|located|location|address|contact|phone|telephone|numbers?|extensions?|offices?|registrar|aso|icts|portal|prisms|ustep|e-?clearance|website|link|programs?|courses?\s+offered|offers?|offered|bsit|bscs|admissions?|ustat|apply|applications?|library|e-?library|scholarships?|organi[sz]ations?|orgs?|clubs?|dean\s+of|director|officials)\b/i;

const normalizeAy = (start: string, end: string): string | null => {
  const s = Number(start);
  const e =
    end.length === 2 ? Math.floor(s / 100) * 100 + Number(end) : Number(end);
  return e === s + 1 ? `${s}-${e}` : null;
};

export function analyzeKnowledgeQuery(query: string): KnowledgeQueryScope {
  const ay = AY_RE.exec(query);
  const academicYear = ay ? normalizeAy(ay[1], ay[2]) : null;
  const first = FIRST_TERM_RE.test(query);
  const second = SECOND_TERM_RE.test(query);
  const midyear = MIDYEAR_RE.test(query);
  const termCount = [first, second, midyear].filter(Boolean).length;
  const term: KnowledgeTerm | null =
    termCount !== 1 ? null : first ? 'first' : second ? 'second' : 'midyear';
  const policy = POLICY_RE.test(query);
  const campus = CAMPUS_INFO_RE.test(query);
  return {
    academicYear,
    term,
    audience: GRADUATE_AUDIENCE_RE.test(query) ? 'GR' : null,
    prefer:
      policy && !campus ? 'handbook' : campus && !policy ? 'ustp_cdo' : null,
  };
}

export type ScopeRejection = 'academic_year' | 'term' | 'audience';

/**
 * Why a campus chunk does not answer this question, or null when it may.
 * Handbook chunks are never filtered here. `undergraduateAvailable` is true
 * when an undergraduate or campus-wide chunk also matched: then graduate rows
 * are left out of a question that did not ask for them, so undergraduate and
 * graduate dates are never mixed in one answer.
 */
export function scopeRejection(
  hit: HandbookFtsHit,
  scope: KnowledgeQueryScope,
  undergraduateAvailable: boolean,
): ScopeRejection | null {
  const meta = hit.meta;
  if (hit.collection !== 'ustp_cdo' || !meta) {
    return null;
  }
  if (
    scope.academicYear &&
    meta.academicYears.length > 0 &&
    !meta.academicYears.includes(scope.academicYear) &&
    !hit.content.includes(scope.academicYear)
  ) {
    return 'academic_year';
  }
  if (scope.term && meta.term && meta.term !== scope.term) {
    return 'term';
  }
  if (scope.audience === 'GR' && meta.scope === 'UG') {
    return 'audience';
  }
  if (!scope.audience && meta.scope === 'GR' && undergraduateAvailable) {
    return 'audience';
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a snapshot stays current, by the pack's volatility labels. */
const FRESH_DAYS: Record<KnowledgeVolatility, number> = {
  high: 45,
  medium: 120,
  low: 365,
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-11-24" -> "November 24, 2026" (the date as written, no time zone shift). */
export function formatAsOfDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : isoDate;
}

/** True when the snapshot is older than its volatility allows. */
export function isSnapshotStale(
  meta: Pick<KnowledgeChunkMeta, 'asOf' | 'volatility'> | null,
  referenceDate: Date,
): boolean {
  if (!meta?.asOf) {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(meta.asOf);
  if (!match) {
    return false;
  }
  const asOf = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const ref = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const ageDays = (ref - asOf) / DAY_MS;
  return ageDays > FRESH_DAYS[meta.volatility ?? 'medium'];
}

export function staleSnapshotNote(asOf: string): string {
  return `This comes from a snapshot dated ${formatAsOfDate(
    asOf,
  )} and may have changed since. Check the official source before relying on it.`;
}
