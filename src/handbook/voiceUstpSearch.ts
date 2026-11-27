import {localSettingsStore} from '../storage/localSettingsStore';
import {
  getUstpEligibility,
  ustpUnavailableMessage,
} from '../storage/ustpEligibility';
import type {KnowledgeCollection} from '../storage/localHandbookStore';
import {
  formatSpokenHandbookReply,
  sanitizePassageForPrompt,
  type LocalHandbookSource,
} from './handbookSearch';
import {
  formatAsOfDate,
  isSnapshotStale,
  staleSnapshotNote,
} from './knowledgeScope';
import {localHandbookService} from './localHandbookService';

export type UstpSearchCollection = 'all' | 'handbook' | 'ustp_cdo';

export interface VoiceUstpPassage {
  passageId: string;
  collection: KnowledgeCollection;
  sourceTitle: string;
  chapter: string;
  section: string;
  pageLabel: string | null;
  asOf: string | null;
  scope: string | null;
  caveats: string[];
  staleNote: string | null;
  excerpt: string;
}

export interface VoiceUstpSearchResult {
  ustpSearch: true;
  status:
    | 'ok'
    | 'no_evidence'
    | 'wrong_academic_year'
    | 'disabled'
    | 'ineligible'
    | 'unavailable';
  query: string;
  passages: VoiceUstpPassage[];
  sources: LocalHandbookSource[];
  message?: string;
  guidance?: string;
  spokenReply: string;
  dataIsUntrusted: true;
}

const HANDBOOK_SETTING_KEY = 'chat.useHandbook';
const HANDBOOK_SETTING_ALIAS = 'ustp_handbook_enabled';
const MAX_EXCERPT_BUDGET = 2000;
const MAX_PASSAGES = 4;

const isHandbookPreferenceEnabled = (userId: string): boolean => {
  const stored =
    localSettingsStore.get(userId, HANDBOOK_SETTING_KEY) ??
    localSettingsStore.get(userId, HANDBOOK_SETTING_ALIAS);
  return stored === null ? true : stored === 'true';
};

const DISABLED_MESSAGE =
  'USTP sources are turned off in your chat settings. Turn them back on in Chat or Preferences to check USTP rules and campus information.';

const UNAVAILABLE_MESSAGE =
  'My on-device USTP sources are not ready on this phone right now. Check with the USTP Registrar or Office of Student Affairs.';

const GROUNDING_GUIDANCE =
  'Answer strictly from these verified USTP passages in 1 to 3 plain spoken sentences without markdown or raw URLs. Name the section and page (and the as-of date for USTP CDO campus info). If a caveat or freshness note is present, state it and never choose between conflicting dates. If the passages do not answer the question, say so plainly.';

const NO_EVIDENCE_GUIDANCE =
  'Do not invent or guess USTP rules, penalties, offices, or dates. Tell the student plainly that you could not verify that from your USTP sources.';

/**
 * Searches the on-device USTP sources (2023 Student Handbook + USTP CDO
 * knowledge pack) for Call LAFINA and ChatAgent (ADR-047). Read-only,
 * owner-scoped, respects confirmed-COR eligibility and user preference.
 */
export async function searchUstpSourcesForVoice(
  userId: string,
  rawQuery: string,
  options: {
    collection?: UstpSearchCollection;
    previousUserQuery?: string | null;
    referenceDate?: Date;
  } = {},
): Promise<VoiceUstpSearchResult> {
  const query = rawQuery.trim().slice(0, 200);
  const referenceDate = options.referenceDate ?? new Date();
  if (!/[0-9a-z]/i.test(query)) {
    const emptyReply =
      'I did not hear a USTP question to look up. Try asking about a handbook rule, office, or campus date.';
    return {
      ustpSearch: true,
      status: 'no_evidence',
      query,
      passages: [],
      sources: [],
      message: emptyReply,
      guidance: NO_EVIDENCE_GUIDANCE,
      spokenReply: emptyReply,
      dataIsUntrusted: true,
    };
  }

  const eligibility = getUstpEligibility(userId);
  if (!eligibility.eligible) {
    const message =
      ustpUnavailableMessage(eligibility.reason) ||
      'USTP school features are not enabled for this account yet.';
    return {
      ustpSearch: true,
      status: 'ineligible',
      query,
      passages: [],
      sources: [],
      message,
      guidance:
        'Explain this reason plainly in one or two spoken sentences. Do not invent USTP rules or claim a technical failure.',
      spokenReply: message,
      dataIsUntrusted: true,
    };
  }

  if (!isHandbookPreferenceEnabled(userId)) {
    return {
      ustpSearch: true,
      status: 'disabled',
      query,
      passages: [],
      sources: [],
      message: DISABLED_MESSAGE,
      guidance:
        'Tell the student that USTP sources are turned off in their settings and how to re-enable them. Do not invent USTP rules.',
      spokenReply: DISABLED_MESSAGE,
      dataIsUntrusted: true,
    };
  }

  const ready = await localHandbookService.ensureReady();
  if (!ready.populated) {
    return {
      ustpSearch: true,
      status: 'unavailable',
      query,
      passages: [],
      sources: [],
      message: UNAVAILABLE_MESSAGE,
      guidance:
        'Tell the student honestly that on-device USTP sources are unavailable right now. Do not guess university policy.',
      spokenReply: UNAVAILABLE_MESSAGE,
      dataIsUntrusted: true,
    };
  }

  const collections: readonly KnowledgeCollection[] | undefined =
    options.collection === 'handbook'
      ? ['handbook']
      : options.collection === 'ustp_cdo'
      ? ['ustp_cdo']
      : undefined;

  const result = await localHandbookService.search(query, {
    limit: MAX_PASSAGES,
    previousUserQuery: options.previousUserQuery,
    collections,
  });

  const spokenReply = formatSpokenHandbookReply(result, {referenceDate});

  if (result.insufficientReason === 'academic_year') {
    return {
      ustpSearch: true,
      status: 'wrong_academic_year',
      query,
      passages: [],
      sources: [],
      message: spokenReply,
      guidance:
        'State plainly which academic year LAFINA has and that you cannot give dates for the requested year. Never substitute another year.',
      spokenReply,
      dataIsUntrusted: true,
    };
  }

  if (result.insufficientEvidence || result.matches.length === 0) {
    return {
      ustpSearch: true,
      status: 'no_evidence',
      query,
      passages: [],
      sources: [],
      message: spokenReply,
      guidance: NO_EVIDENCE_GUIDANCE,
      spokenReply,
      dataIsUntrusted: true,
    };
  }

  const passages: VoiceUstpPassage[] = [];
  const sources: LocalHandbookSource[] = [];
  let usedChars = 0;

  for (const match of result.matches.slice(0, MAX_PASSAGES)) {
    const chunk = match.chunk;
    const cleanBody = sanitizePassageForPrompt(chunk.content);
    const remaining = MAX_EXCERPT_BUDGET - usedChars;
    if (passages.length > 0 && remaining < 120) break;
    const excerpt =
      cleanBody.length <= remaining
        ? cleanBody
        : `${cleanBody.slice(0, Math.max(100, remaining - 3)).trimEnd()}...`;
    usedChars += excerpt.length;

    const meta = chunk.collection === 'ustp_cdo' ? chunk.meta : null;
    const scopeParts = meta
      ? [
          meta.scope === 'UG'
            ? 'undergraduate'
            : meta.scope === 'GR'
            ? 'graduate'
            : null,
          meta.academicYears.length
            ? `AY ${meta.academicYears.join(', ')}`
            : null,
          meta.term ? `${meta.term} semester` : null,
        ].filter(Boolean)
      : [];

    passages.push({
      passageId: chunk.id,
      collection: chunk.collection,
      sourceTitle:
        chunk.collection === 'ustp_cdo'
          ? chunk.sourceLabel || 'USTP CDO Knowledge'
          : chunk.sourceLabel || 'USTP Student Handbook (2023)',
      chapter: chunk.chapter,
      section: chunk.section,
      pageLabel: chunk.pageLabel,
      asOf: meta?.asOf ? formatAsOfDate(meta.asOf) : null,
      scope: scopeParts.length ? scopeParts.join('; ') : null,
      caveats: (meta?.caveats ?? []).map(c => sanitizePassageForPrompt(c.text)),
      staleNote:
        meta?.asOf && isSnapshotStale(meta, referenceDate)
          ? staleSnapshotNote(meta.asOf)
          : null,
      excerpt,
    });
    sources.push(match.source);
  }

  return {
    ustpSearch: true,
    status: 'ok',
    query,
    passages,
    sources,
    guidance: GROUNDING_GUIDANCE,
    spokenReply,
    dataIsUntrusted: true,
  };
}

/** Compact JSON payload sent to DeepSeek / ElevenLabs (omits UI-only fields). */
export function formatVoiceUstpToolResult(
  result: VoiceUstpSearchResult,
): string {
  return JSON.stringify({
    status: result.status,
    query: result.query,
    ...(result.passages.length > 0 ? {passages: result.passages} : {}),
    ...(result.message ? {message: result.message} : {}),
    ...(result.guidance ? {guidance: result.guidance} : {}),
    dataIsUntrusted: true,
  });
}
