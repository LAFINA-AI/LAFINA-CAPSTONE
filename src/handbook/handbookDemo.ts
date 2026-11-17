/**
 * The introduction's "Ask anything about USTP" preview. It quotes a real
 * passage from the bundled USTP Student Handbook pack (no generated or
 * invented answer) with its chapter, section and page, and the pack's
 * actual edition. Reading the bundled file creates no records and needs no
 * network or permission.
 */
interface PackChunk {
  id: string;
  chapter: string;
  section: string;
  pageLabel: string;
  content: string;
}
interface Pack {
  edition: string;
  chunks: PackChunk[];
}

/** Chapter 14 (Grades), Art. 1 (Grading System), p. 50 of the 2023 pack. */
export const HANDBOOK_DEMO_CHUNK_ID = 'ustp-a4cfe942f5ba';
export const HANDBOOK_DEMO_QUESTION = 'How does the grading system work?';

export interface HandbookDemoExcerpt {
  question: string;
  quote: string;
  chapter: string;
  section: string;
  pageLabel: string;
  edition: string;
  citation: string;
}

let cached: HandbookDemoExcerpt | null | undefined;

export const getHandbookDemoExcerpt = (): HandbookDemoExcerpt | null => {
  if (cached !== undefined) return cached;
  try {
    const pack = require('./ustpHandbookPack.json') as Pack;
    const chunk = pack.chunks.find(c => c.id === HANDBOOK_DEMO_CHUNK_ID);
    const found = chunk?.content
      .split(/\.\s+/)
      .find(s => /multiples of 0\.25/.test(s));
    const sentence = found ? `${found.replace(/\.$/, '')}.` : null;
    if (!chunk || !sentence) {
      cached = null;
      return cached;
    }
    // The sentence is shown from "the grading system shall use …" verbatim.
    const quote = sentence.slice(
      Math.max(0, sentence.search(/the grading system shall/i)),
    );
    const chapterNo = /Chapter\s+(\d+)/i.exec(chunk.chapter)?.[1];
    const articleNo = /Art\.\s*(\d+)/i.exec(chunk.section)?.[1];
    const year = /(\d{4})\s+Edition/i.exec(pack.edition)?.[1];
    cached = {
      question: HANDBOOK_DEMO_QUESTION,
      quote: quote.charAt(0).toUpperCase() + quote.slice(1),
      chapter: chunk.chapter,
      section: chunk.section,
      pageLabel: chunk.pageLabel,
      edition: pack.edition,
      citation: `${year ? `${year} Handbook` : 'Handbook'}${
        chapterNo ? ` · Ch. ${chapterNo}` : ''
      }${articleNo ? ` · Art. ${articleNo}` : ''} · ${chunk.pageLabel}`,
    };
  } catch {
    cached = null;
  }
  return cached;
};
