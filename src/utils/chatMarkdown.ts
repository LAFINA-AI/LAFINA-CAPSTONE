/**
 * Reads an assistant reply's markdown into blocks the chat can draw.
 *
 * DeepSeek already answers in markdown (`**Step 1**`, lists, tables, code),
 * so this is about showing what arrives, not asking for more. A reply is read
 * line by line: a single line break stays a line break, because the model
 * uses it that way ("**Step 1**" on one line, its explanation on the next).
 *
 * While a reply is still streaming, the last line may end with an opening
 * marker whose partner has not arrived yet (`**Step 3: Car`); `streaming`
 * hides that marker so the half-written word does not flash as raw markup.
 */

/** A run of text, with the emphasis wrapped around it. */
export interface ChatInline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Only http(s) targets are kept; anything else stays plain text. */
  href?: string;
}

export type ChatBlock =
  | {kind: 'heading'; level: 1 | 2 | 3; spans: ChatInline[]}
  | {kind: 'paragraph'; spans: ChatInline[]}
  | {kind: 'bullet'; depth: number; spans: ChatInline[]}
  | {kind: 'ordered'; depth: number; marker: string; spans: ChatInline[]}
  | {kind: 'checklist'; depth: number; checked: boolean; spans: ChatInline[]}
  | {kind: 'quote'; spans: ChatInline[]}
  | {kind: 'code'; language: string; text: string}
  | {kind: 'table'; header: ChatInline[][]; rows: ChatInline[][][]}
  | {kind: 'divider'}
  | {kind: 'blank'};

export interface ChatMarkdownOptions {
  /** The reply is still being written: hide a dangling opening marker. */
  streaming?: boolean;
}

const FENCE_LINE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([\w+#.-]*)[ \t]*$/;
const HEADING_LINE = /^[ \t]{0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const CHECKLIST_LINE = /^([ \t]*)[-*+][ \t]+\[([ xX])\][ \t]+(.*)$/;
const BULLET_LINE = /^([ \t]*)[-*+•][ \t]+(.*)$/;
const ORDERED_LINE = /^([ \t]*)(\d{1,3})[.)][ \t]+(.*)$/;
const QUOTE_LINE = /^[ \t]{0,3}>[ \t]?(.*)$/;
const DIVIDER_LINE = /^[ \t]{0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/;
const TABLE_LINE = /^[ \t]*\|.*\|[ \t]*$/;
const TABLE_SEPARATOR = /^[ \t]*\|?(?:[ \t]*:?-{2,}:?[ \t]*\|)+(?:[ \t]*:?-{2,}:?[ \t]*)?\|?[ \t]*$/;

/**
 * Nesting from indentation. Models indent nested lists by two, three or four
 * spaces; any of those is one level, so a sub-list is never pushed in twice.
 */
const listDepth = (indent: string): number => {
  let columns = 0;
  for (const character of indent) columns += character === '\t' ? 4 : 1;
  return Math.min(4, Math.ceil(columns / 4));
};

/**
 * Emphasis rules, most specific first: `***` before `**` before `*`, or bold
 * would be read as an italic around an empty string. Single `*` and `_` need
 * a non-space right inside each marker, so "2 * 3 * 4" and snake_case words
 * stay as written.
 */
interface InlineRule {
  pattern: RegExp;
  marks: Partial<ChatInline>;
  /** Code: markers inside are part of the snippet. */
  literal?: boolean;
  /** Group 1 is a character before the marker that stays plain text. */
  lead?: boolean;
}
const INLINE_RULES: InlineRule[] = [
  {pattern: /`([^`\n]+)`/, marks: {code: true}, literal: true},
  {pattern: /\*\*\*([^*\n]+)\*\*\*/, marks: {bold: true, italic: true}},
  {pattern: /\*\*([^\n]+?)\*\*/, marks: {bold: true}},
  {pattern: /__([^_\n]+)__/, marks: {bold: true}},
  {pattern: /~~([^~\n]+)~~/, marks: {strike: true}},
  {pattern: /\*([^\s*](?:[^*\n]*[^\s*])?)\*/, marks: {italic: true}},
  {
    pattern: /(^|[\s(])_([^\s_](?:[^_\n]*[^\s_])?)_(?=$|[\s.,;:!?)])/,
    marks: {italic: true},
    lead: true,
  },
];
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/;

const pushText = (spans: ChatInline[], text: string, marks: Partial<ChatInline>): void => {
  if (!text) return;
  const last = spans[spans.length - 1];
  const sameMarks =
    last &&
    !!last.bold === !!marks.bold &&
    !!last.italic === !!marks.italic &&
    !!last.strike === !!marks.strike &&
    !!last.code === !!marks.code &&
    last.href === marks.href;
  if (sameMarks) last.text += text;
  else spans.push({...marks, text});
};

/** Splits one line into styled runs. Emphasis nests; code is taken literally. */
export const parseChatInline = (
  line: string,
  marks: Partial<ChatInline> = {},
): ChatInline[] => {
  const spans: ChatInline[] = [];
  let rest = line;

  while (rest) {
    let earliest: {index: number; length: number; apply: () => void} | null = null;

    const link = marks.href || marks.code ? null : LINK.exec(rest);
    if (link) {
      const [whole, label, target] = link;
      earliest = {
        index: link.index,
        length: whole.length,
        apply: () => {
          if (/^https?:\/\//i.test(target)) {
            for (const span of parseChatInline(label, {...marks, href: target})) {
              pushText(spans, span.text, span);
            }
          } else {
            // Not a web link: keep the words, drop the target.
            for (const span of parseChatInline(label, marks)) pushText(spans, span.text, span);
          }
        },
      };
    }

    for (const rule of INLINE_RULES) {
      const match = rule.pattern.exec(rest);
      if (!match) continue;
      const lead = rule.lead ? match[1].length : 0;
      const start = match.index + lead;
      if (earliest && start >= earliest.index) continue;
      const inner = rule.lead ? match[2] : match[1];
      const nested = {...marks, ...rule.marks};
      earliest = {
        index: start,
        length: match[0].length - lead,
        apply: rule.literal
          ? () => pushText(spans, inner, nested)
          : () => {
              for (const span of parseChatInline(inner, nested)) pushText(spans, span.text, span);
            },
      };
    }

    if (!earliest) break;
    pushText(spans, rest.slice(0, earliest.index), marks);
    earliest.apply();
    rest = rest.slice(earliest.index + earliest.length);
  }

  pushText(spans, rest, marks);
  return spans;
};

const count = (text: string, marker: string): number => text.split(marker).length - 1;

const dropLast = (text: string, marker: string): string => {
  const at = text.lastIndexOf(marker);
  return at < 0 ? text : text.slice(0, at) + text.slice(at + marker.length);
};

/**
 * Hides an opening marker on the line being written whose closing marker has
 * not streamed in yet. Only the last line is touched, and only while
 * streaming; a finished reply is shown exactly as written.
 */
export const hideDanglingMarkers = (line: string): string => {
  let out = line;
  if (count(out, '`') % 2 === 1) out = dropLast(out, '`');
  if (count(out, '~~') % 2 === 1) out = dropLast(out, '~~');
  if (count(out, '**') % 2 === 1) out = dropLast(out, '**');
  // A lone "*" left after the pairs is an unfinished italic, unless it is a
  // list marker at the start of the line.
  const body = out.replace(/^([ \t]*)[-*+][ \t]+/, '$1');
  const prefix = out.slice(0, out.length - body.length);
  const singles = body.replace(/\*\*/g, '');
  if (count(singles, '*') % 2 === 1 && /\*\S[^*]*$/.test(body)) out = prefix + dropLast(body, '*');
  // An unfinished link: "[label](htt" shows as just "label" until it closes.
  out = out.replace(/\[([^\]\n]*)\]?(?:\([^)\n]*)?$/, (whole, label: string) =>
    whole.endsWith(')') ? whole : label,
  );
  return out;
};

const splitRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
};

/** Reads a reply into blocks. Safe to call on every streamed piece. */
export const parseChatMarkdown = (
  text: string,
  options: ChatMarkdownOptions = {},
): ChatBlock[] => {
  if (!text) return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (options.streaming && lines.length > 0) {
    lines[lines.length - 1] = hideDanglingMarkers(lines[lines.length - 1]);
  }

  const blocks: ChatBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    const fence = FENCE_LINE.exec(line);
    if (fence) {
      const closer = fence[1][0];
      const body: string[] = [];
      index += 1;
      while (index < lines.length) {
        const close = FENCE_LINE.exec(lines[index]);
        if (close && close[1][0] === closer && !close[2]) break;
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({kind: 'code', language: fence[2], text: body.join('\n')});
      index += 1; // the closing fence, or past the end while streaming
      continue;
    }

    if (TABLE_LINE.test(line) && index + 1 < lines.length && TABLE_SEPARATOR.test(lines[index + 1])) {
      const header = splitRow(line).map((cell) => parseChatInline(cell));
      const rows: ChatInline[][][] = [];
      index += 2;
      while (index < lines.length && TABLE_LINE.test(lines[index])) {
        rows.push(splitRow(lines[index]).map((cell) => parseChatInline(cell)));
        index += 1;
      }
      blocks.push({kind: 'table', header, rows});
      continue;
    }

    index += 1;
    if (!line.trim()) {
      // Runs of blank lines are one gap.
      if (blocks.length > 0 && blocks[blocks.length - 1].kind !== 'blank') {
        blocks.push({kind: 'blank'});
      }
      continue;
    }
    if (DIVIDER_LINE.test(line)) {
      blocks.push({kind: 'divider'});
      continue;
    }
    const heading = HEADING_LINE.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({kind: 'heading', level, spans: parseChatInline(heading[2])});
      continue;
    }
    const checklist = CHECKLIST_LINE.exec(line);
    if (checklist) {
      blocks.push({
        kind: 'checklist',
        depth: listDepth(checklist[1]),
        checked: checklist[2].toLowerCase() === 'x',
        spans: parseChatInline(checklist[3]),
      });
      continue;
    }
    const bullet = BULLET_LINE.exec(line);
    if (bullet) {
      blocks.push({kind: 'bullet', depth: listDepth(bullet[1]), spans: parseChatInline(bullet[2])});
      continue;
    }
    const ordered = ORDERED_LINE.exec(line);
    if (ordered) {
      blocks.push({
        kind: 'ordered',
        depth: listDepth(ordered[1]),
        marker: ordered[2],
        spans: parseChatInline(ordered[3]),
      });
      continue;
    }
    const quote = QUOTE_LINE.exec(line);
    if (quote) {
      blocks.push({kind: 'quote', spans: parseChatInline(quote[1])});
      continue;
    }
    blocks.push({kind: 'paragraph', spans: parseChatInline(line.trim())});
  }

  while (blocks.length > 0 && blocks[blocks.length - 1].kind === 'blank') blocks.pop();
  return blocks;
};

/**
 * True when a reply holds a table or a code block, which need the full width
 * of the chat to be readable on a phone.
 */
export const hasWideMarkdownBlock = (text: string): boolean =>
  text.split('\n').some((line) => FENCE_LINE.test(line) || TABLE_SEPARATOR.test(line));

const spansText = (spans: ChatInline[]): string => spans.map((span) => span.text).join('');

/**
 * The same reply without markup, for the "plain text" setting: list markers
 * become bullets or numbers, headings and emphasis lose their symbols, tables
 * become rows of cells, and line breaks stay where they were.
 */
export const chatMarkdownToPlainText = (
  text: string,
  options: ChatMarkdownOptions = {},
): string =>
  parseChatMarkdown(text, options)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
        case 'paragraph':
        case 'quote':
          return spansText(block.spans);
        case 'bullet':
          return `${'  '.repeat(block.depth)}• ${spansText(block.spans)}`;
        case 'ordered':
          return `${'  '.repeat(block.depth)}${block.marker}. ${spansText(block.spans)}`;
        case 'checklist':
          return `${'  '.repeat(block.depth)}${block.checked ? '☑' : '☐'} ${spansText(block.spans)}`;
        case 'code':
          return block.text;
        case 'table':
          return [block.header, ...block.rows]
            .map((row) => row.map(spansText).join(' | '))
            .join('\n');
        case 'divider':
        case 'blank':
          return '';
      }
    })
    .join('\n');
