import bundledCampusPack from './ustpCdoKnowledgePack.json';
import {
  localHandbookStore,
  type HandbookFtsHit,
  type KnowledgeChapter,
  type KnowledgeCollection,
  type KnowledgeSourceRef,
} from '../storage/localHandbookStore';
import {campusSourceNote} from './knowledgeCitations';
import {
  formatAsOfDate,
  isSnapshotStale,
  staleSnapshotNote,
} from './knowledgeScope';
import {linkifyUrls} from './handbookSearch';
import {localHandbookService} from './localHandbookService';

/**
 * The USTP sources library: every passage Ask USTP answers from, readable by
 * the student exactly as LAFINA stores it, with where each one came from.
 * Nothing here is summarized or reworded.
 */

export interface KnowledgeSourceSummary {
  collection: KnowledgeCollection;
  title: string;
  /** What the source is and how current it is, in one line. */
  description: string;
  passageCount: number;
  chapterCount: number;
  /** "chapters" or "documents". */
  chapterNoun: string;
}

const CAMPUS_AS_OF =
  typeof bundledCampusPack.asOf === 'string' ? bundledCampusPack.asOf : null;

export function listKnowledgeSources(): KnowledgeSourceSummary[] {
  const summaries: KnowledgeSourceSummary[] = [];
  const handbookChapters = localHandbookStore.listChapters('handbook');
  if (handbookChapters.length > 0) {
    const meta = localHandbookStore.getMeta();
    summaries.push({
      collection: 'handbook',
      title: 'USTP Student Handbook',
      description: `${
        meta?.edition ?? 'USTP Student Handbook'
      }. Standing rules: grades, enrollment, conduct, honors and student life.`,
      passageCount: sumPassages(handbookChapters),
      chapterCount: handbookChapters.length,
      chapterNoun: 'chapters',
    });
  }
  const campusChapters = localHandbookStore.listChapters('ustp_cdo');
  if (campusChapters.length > 0) {
    summaries.push({
      collection: 'ustp_cdo',
      title: 'USTP Cagayan de Oro',
      description: `Official USTP pages and the CHED-noted Academic Calendar AY 2026-2027${
        CAMPUS_AS_OF ? `, checked ${formatAsOfDate(CAMPUS_AS_OF)}` : ''
      }. Dates, offices, portals, programs, library and organizations.`,
      passageCount: sumPassages(campusChapters),
      chapterCount: campusChapters.length,
      chapterNoun: 'documents',
    });
  }
  return summaries;
}

const sumPassages = (chapters: KnowledgeChapter[]): number =>
  chapters.reduce((total, c) => total + c.passageCount, 0);

export const listKnowledgeChapters = (
  collection: KnowledgeCollection,
): KnowledgeChapter[] => localHandbookStore.listChapters(collection);

export const listChapterPassages = (
  collection: KnowledgeCollection,
  chapter: string,
): HandbookFtsHit[] => localHandbookStore.listPassages(collection, chapter);

export const getPassagesById = (ids: readonly string[]): HandbookFtsHit[] =>
  localHandbookStore.getPassages(ids);

export const searchKnowledgePassages = (text: string): HandbookFtsHit[] =>
  localHandbookStore.searchPassages(text, 30);

/** The library reads the index, so it waits for the packs to be loaded. */
export async function prepareKnowledgeLibrary(): Promise<boolean> {
  try {
    const status = await localHandbookService.ensureReady();
    return status.populated;
  } catch {
    return false;
  }
}

/**
 * Every official page the campus passages cite, once each, in pack order.
 * This is the whole list of web pages behind the USTP CDO answers.
 */
export function listOfficialPages(): KnowledgeSourceRef[] {
  const byUrl = new Map<string, KnowledgeSourceRef>();
  for (const chunk of bundledCampusPack.chunks) {
    for (const source of chunk.meta?.sources ?? []) {
      if (
        typeof source.url === 'string' &&
        /^https:\/\//i.test(source.url) &&
        !byUrl.has(source.url)
      ) {
        byUrl.set(source.url, {
          id: String(source.id),
          title: String(source.title),
          url: source.url,
        });
      }
    }
  }
  return Array.from(byUrl.values());
}

/** How a passage is shown: where it is, what it covers, where it came from. */
export interface PassageView {
  id: string;
  collection: KnowledgeCollection;
  heading: string;
  /** "Chapter 14. Grades · p. 53", "Academic Calendar … · PDF p. 3". */
  location: string;
  /** "Undergraduate · AY 2026-2027 · First semester", or empty. */
  scope: string;
  /** Passage text; campus links are Markdown so they can be tapped. */
  body: string;
  caveats: string[];
  /** Citation line (Markdown links for campus passages). */
  citation: string;
  /** Set when the snapshot is older than its topic allows. */
  staleNote: string | null;
}

const TERM_LABEL: Record<string, string> = {
  first: 'First semester',
  second: 'Second semester',
  midyear: 'Midyear',
};

export function toPassageView(
  hit: HandbookFtsHit,
  referenceDate: Date = new Date(),
): PassageView {
  const page = hit.pageLabel ? ` · ${hit.pageLabel}` : '';
  if (hit.collection !== 'ustp_cdo') {
    const meta = localHandbookStore.getMeta();
    return {
      id: hit.id,
      collection: 'handbook',
      heading: hit.section || hit.chapter,
      location: `${hit.chapter}${page}`,
      scope: '',
      body: hit.content,
      caveats: [],
      citation: `${
        meta?.edition ?? hit.sourceLabel ?? 'USTP Student Handbook'
      }${hit.pageLabel ? `, ${hit.pageLabel}` : ''}`,
      staleNote: null,
    };
  }
  const meta = hit.meta;
  const scope = [
    meta?.scope === 'UG'
      ? 'Undergraduate'
      : meta?.scope === 'GR'
      ? 'Graduate'
      : null,
    ...(meta?.academicYears ?? []).map(year => `AY ${year}`),
    meta?.term ? TERM_LABEL[meta.term] ?? null : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    id: hit.id,
    collection: 'ustp_cdo',
    heading: hit.section || hit.chapter,
    location: `${hit.chapter}${page}`,
    scope,
    body: hit.content.split('\n').map(linkifyUrls).join('\n'),
    caveats: (meta?.caveats ?? []).map(c => c.text),
    citation:
      campusSourceNote([
        {
          collection: 'ustp_cdo',
          links: meta?.sources ?? [],
          asOf: meta?.asOf ?? null,
        },
      ]) ??
      (meta?.asOf
        ? `USTP CDO knowledge, as of ${formatAsOfDate(meta.asOf)}`
        : ''),
    staleNote:
      meta?.asOf && isSnapshotStale(meta, referenceDate)
        ? staleSnapshotNote(meta.asOf)
        : null,
  };
}
