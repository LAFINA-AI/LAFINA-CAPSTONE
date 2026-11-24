import type {KnowledgeSourceRef} from '../storage/localHandbookStore';
import {formatAsOfDate} from './knowledgeScope';

/** The parts of a reply source the citation note needs. */
export interface CampusCitationSource {
  collection?: string;
  links?: KnowledgeSourceRef[];
  asOf?: string | null;
}

/** At most this many official pages are listed under one reply. */
const MAX_LINKS = 4;

const pagesText = (pages: number[]): string =>
  pages.length === 0
    ? ''
    : pages.length === 1
    ? `, PDF p. ${pages[0]}`
    : `, PDF pp. ${pages.join(', ')}`;

/** Link labels are plain words: brackets would break the Markdown link. */
const labelText = (title: string): string =>
  title
    .replace(/[[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The citation line for campus-knowledge passages a reply used:
 * "USTP CDO sources (as of November 24, 2026): [Calendar, PDF p. 4](https://…) · …".
 * Every link is an official page recorded in the knowledge pack for those
 * passages (the builder never adds one the source documents do not name),
 * so nothing here is invented. Returns null when there is nothing to cite.
 */
export function campusSourceNote(
  sources: readonly CampusCitationSource[],
): string | null {
  const campus = sources.filter(s => s.collection === 'ustp_cdo');
  const byUrl = new Map<string, {title: string; pages: Set<number>}>();
  for (const source of campus) {
    for (const link of source.links ?? []) {
      if (!/^https:\/\//i.test(link.url)) continue;
      const entry = byUrl.get(link.url) ?? {
        title: labelText(link.title),
        pages: new Set<number>(),
      };
      for (const page of link.pages ?? []) entry.pages.add(page);
      byUrl.set(link.url, entry);
    }
  }
  if (byUrl.size === 0) {
    return null;
  }
  const links = Array.from(byUrl.entries())
    .slice(0, MAX_LINKS)
    .map(
      ([url, entry]) =>
        `[${entry.title}${pagesText(
          Array.from(entry.pages).sort((a, b) => a - b),
        )}](${url})`,
    );
  const dates = Array.from(
    new Set(campus.map(s => s.asOf).filter((d): d is string => Boolean(d))),
  ).sort();
  const asOf = dates.length
    ? ` (as of ${dates.map(formatAsOfDate).join(', ')})`
    : '';
  return `USTP CDO sources${asOf}: ${links.join(' · ')}`;
}
