/**
 * The small part of Markdown that GitHub release notes use — headings,
 * bullet and numbered lists, quotes, rules, bold, italics, code and links —
 * parsed into blocks the update sheet can draw with plain <Text>. Anything
 * else is shown as text. No HTML is ever interpreted.
 */

export type InlineSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string };

export type NoteBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { kind: 'paragraph'; spans: InlineSpan[] }
  | { kind: 'bullet'; depth: number; spans: InlineSpan[] }
  | { kind: 'numbered'; depth: number; number: string; spans: InlineSpan[] }
  | { kind: 'quote'; spans: InlineSpan[] }
  | { kind: 'rule' };

const INLINE =
  /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*([^*\s][^*]*)\*)/g;

export const parseInline = (text: string): InlineSpan[] => {
  const spans: InlineSpan[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ kind: 'text', text: text.slice(last, index) });
    if (match[2] ?? match[3]) spans.push({ kind: 'bold', text: (match[2] ?? match[3]) as string });
    else if (match[4]) spans.push({ kind: 'code', text: match[4] });
    else if (match[5] && match[6]) spans.push({ kind: 'link', text: match[5], url: match[6] });
    else spans.push({ kind: 'italic', text: match[7] as string });
    last = index + match[0].length;
  }
  if (last < text.length) spans.push({ kind: 'text', text: text.slice(last) });
  return spans.filter((span) => span.text !== '');
};

const stripHtml = (line: string): string => line.replace(/<\/?[A-Za-z][^>]*>/g, '');

export const parseReleaseNotes = (markdown: string | null | undefined): NoteBlock[] => {
  if (!markdown) return [];
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', spans: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = stripHtml(rawLine).replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*$/.exec(trimmed);
    if (heading) {
      flush();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, spans: parseInline(heading[2]) });
      continue;
    }
    const indent = line.length - line.trimStart().length;
    const depth = Math.min(2, Math.floor(indent / 2));
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', depth, spans: parseInline(bullet[1]) });
      continue;
    }
    const numbered = /^(\d{1,3})[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      flush();
      blocks.push({ kind: 'numbered', depth, number: numbered[1], spans: parseInline(numbered[2]) });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flush();
      if (quote[1].trim()) blocks.push({ kind: 'quote', spans: parseInline(quote[1]) });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
};
