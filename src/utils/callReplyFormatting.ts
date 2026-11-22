/**
 * Formats Call Lafina and reminder-call replies into scannable Markdown so
 * live spoken answers read cleanly on mobile instead of one dense paragraph.
 *
 * When a reply already uses Markdown (such as local planner summaries from
 * `actionExecutor`), its existing structure is preserved untouched. Plain
 * spoken prose (from ElevenLabs / speech-sanitized streams) is split into
 * short paragraphs, inline lists/steps become Markdown lists, and high-signal
 * anchors (times, explicit dates, handbook citations) get subtle bold weight.
 */

const EXPLICIT_MARKDOWN_PATTERNS: RegExp[] = [
  /^[ \t]{0,3}#{1,6}[ \t]+\S/m,
  /^[ \t]*(?:[-*+•]|\d{1,3}[.)])[ \t]+\S/m,
  /^[ \t]{0,3}>[ \t]?\S/m,
  /`{3,}|~{3,}/,
  /^[ \t]*\|.*\|[ \t]*$/m,
  /\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/,
  /\n[ \t]*\n/,
];

const hasExplicitFormatting = (text: string): boolean =>
  EXPLICIT_MARKDOWN_PATTERNS.some(pattern => pattern.test(text));

interface Stash {
  text: string;
  restore: (value: string) => string;
}

const createStash = (
  initial: string,
): {
  stash: (pattern: RegExp) => void;
  finish: () => Stash;
} => {
  const tokens: string[] = [];
  let current = initial;
  return {
    stash(pattern: RegExp) {
      current = current.replace(pattern, match => {
        const key = `\u0000${tokens.length}\u0000`;
        tokens.push(match);
        return key;
      });
    },
    finish(): Stash {
      const restore = (value: string): string => {
        let out = value;
        for (let i = tokens.length - 1; i >= 0; i -= 1) {
          out = out.split(`\u0000${i}\u0000`).join(tokens[i]);
        }
        return out;
      };
      return {text: current, restore};
    },
  };
};

/**
 * Splits prose into sentences without breaking URLs, abbreviations,
 * decimals, meridiem markers, or parenthetical citations.
 */
export const splitCallSentences = (input: string): string[] => {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const stasher = createStash(trimmed);
  stasher.stash(/https?:\/\/[^\s)]+/gi);
  stasher.stash(/\([^()\n]{1,160}\)/g);
  stasher.stash(/\.{3}|…/g);
  stasher.stash(/\b\d+\.\d+(?:\.\d+)*/g);
  stasher.stash(/\b(?:[ap]\.m\.|(?:[A-Za-z]\.){2,})/gi);
  stasher.stash(
    /\b(?:Dr|Mr|Mrs|Ms|Prof|Engr|Atty|Rev|Gen|Col|Lt|Sgt|St|Jr|Sr|vs|etc|e\.g|i\.e|pp?|Sec|No|Fig|Dept|Univ|Jan|Feb|Mar|Apr|Aug|Sept?|Oct|Nov|Dec)\./gi,
  );
  stasher.stash(/\b[A-Z]\.(?=\s+[A-Z][a-z])/g);

  const {text: safe, restore} = stasher.finish();
  const boundary =
    /[.!?…]+["'\u201D\u2019)]*(?=\s+(?:[A-Z0-9"'\u201C\u2018(]|Step\s+\d))/g;

  const sentences: string[] = [];
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(safe)) !== null) {
    const end = match.index + match[0].length;
    const piece = restore(safe.slice(start, end)).trim();
    if (piece) sentences.push(piece);
    start = end;
    while (start < safe.length && /\s/.test(safe[start])) start += 1;
  }

  const tail = restore(safe.slice(start)).trim();
  if (tail) sentences.push(tail);
  return sentences;
};

const INLINE_ANCHOR_RE =
  /\b(?:(?:Section|Article|Rule)\s+\d+(?:\.\d+)*[A-Za-z]?\b|(?:pages?|pp?\.)\s*\d+(?:\s*[–-]\s*\d+)?\b|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b|\d{4}-\d{2}-\d{2}\b|(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s?(?:AM|PM|a\.m\.|p\.m\.)(?=$|[\s,;!?)\]]|\.(?!\w))|(?:[01]?\d|2[0-3]):[0-5]\d\b)/gi;

/**
 * Adds subtle bold weight to clock times, explicit calendar dates, and handbook
 * citations while leaving existing Markdown, inline code, and URLs untouched.
 */
export const highlightCallInlineDetails = (input: string): string => {
  if (!input) return '';
  const stasher = createStash(input);
  stasher.stash(/`[^`\n]+`/g);
  stasher.stash(/\*\*[^*\n]+\*\*/g);
  stasher.stash(/https?:\/\/[^\s)]+/gi);
  stasher.stash(/\[[^\]\n]+\]\([^)\n]+\)/g);

  const {text: safe, restore} = stasher.finish();
  const highlighted = safe.replace(INLINE_ANCHOR_RE, match => `**${match}**`);
  return restore(highlighted);
};

const STEP_MARKER_RE = /(?:^|\s)(Step\s+\d{1,2})\s*([:.,-])\s+/gi;

const formatInlineSteps = (text: string): string | null => {
  const matches: Array<{index: number; fullLen: number; label: string}> = [];
  STEP_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STEP_MARKER_RE.exec(text)) !== null) {
    const leadSpace = /^\s/.test(m[0]) ? 1 : 0;
    const rawStep = m[1].replace(/\s+/g, ' ');
    const normalizedStep =
      rawStep.charAt(0).toUpperCase() + rawStep.slice(1).toLowerCase();
    matches.push({
      index: m.index + leadSpace,
      fullLen: m[0].length - leadSpace,
      label: `${normalizedStep}:`,
    });
  }
  if (matches.length < 2) return null;

  const intro = text.slice(0, matches[0].index).trim();
  const stepLines: string[] = [];

  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index + matches[i].fullLen;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (!body) return null;
    if (i === matches.length - 1) {
      const sub = splitCallSentences(body);
      if (sub.length >= 2 && sub[sub.length - 1].endsWith('?')) {
        const closing = sub.pop()!;
        const stepBody = sub.join(' ').trim();
        if (!stepBody) return null;
        stepLines.push(
          `- **${matches[i].label}** ${highlightCallInlineDetails(stepBody)}`,
        );
        const prefix = intro ? `${highlightCallInlineDetails(intro)}\n` : '';
        return `${prefix}${stepLines.join(
          '\n',
        )}\n\n${highlightCallInlineDetails(closing)}`;
      }
    }
    stepLines.push(
      `- **${matches[i].label}** ${highlightCallInlineDetails(body)}`,
    );
  }

  const prefix = intro ? `${highlightCallInlineDetails(intro)}\n` : '';
  return `${prefix}${stepLines.join('\n')}`;
};

const INLINE_NUMBER_RE =
  /(?:^|[:.!?]\s+|\s(?=\(\d|\d+\)))\s*(?:\((\d{1,2})\)|(\d{1,2})[.)])\s+(?=[A-Za-z"'\u201C])/g;

const formatInlineNumbered = (text: string): string | null => {
  const markers: Array<{
    index: number;
    contentStart: number;
    num: number;
  }> = [];
  INLINE_NUMBER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_NUMBER_RE.exec(text)) !== null) {
    const num = Number(m[1] || m[2]);
    const digitAt = m[0].search(/\d/);
    const markerIndex = m.index + Math.max(0, digitAt - (m[1] ? 1 : 0));
    markers.push({
      index: markerIndex,
      contentStart: m.index + m[0].length,
      num,
    });
  }
  if (markers.length < 2 || markers[0].num !== 1) return null;

  const seq: typeof markers = [markers[0]];
  for (let i = 1; i < markers.length; i += 1) {
    if (markers[i].num === seq[seq.length - 1].num + 1) {
      seq.push(markers[i]);
    }
  }
  if (seq.length < 2) return null;

  const intro = text.slice(0, seq[0].index).trim();
  const listLines: string[] = [];

  for (let i = 0; i < seq.length; i += 1) {
    const end = i + 1 < seq.length ? seq[i + 1].index : text.length;
    const body = text.slice(seq[i].contentStart, end).trim();
    if (!body) return null;
    if (i === seq.length - 1) {
      const sub = splitCallSentences(body);
      if (sub.length >= 2 && sub[sub.length - 1].endsWith('?')) {
        const closing = sub.pop()!;
        const itemBody = sub.join(' ').trim();
        if (!itemBody) return null;
        listLines.push(
          `${seq[i].num}. ${highlightCallInlineDetails(itemBody)}`,
        );
        const prefix = intro ? `${highlightCallInlineDetails(intro)}\n` : '';
        return `${prefix}${listLines.join(
          '\n',
        )}\n\n${highlightCallInlineDetails(closing)}`;
      }
    }
    listLines.push(`${seq[i].num}. ${highlightCallInlineDetails(body)}`);
  }

  const prefix = intro ? `${highlightCallInlineDetails(intro)}\n` : '';
  return `${prefix}${listLines.join('\n')}`;
};

const ORDINAL_OPENER_RE = /^(First(?:\s+of\s+all)?|To\s+start)(,?)\s+(.*)$/i;
const ORDINAL_CONT_RE =
  /^(Second|Third|Fourth|Fifth|Next|Then|After\s+that|Finally|Lastly)(,?)\s+(.*)$/i;

const formatOrdinalSentences = (sentences: string[]): string[] | null => {
  if (sentences.length < 2) return null;
  const openerIndex = sentences.findIndex(s => ORDINAL_OPENER_RE.test(s));
  if (openerIndex < 0) return null;

  const listItems: string[] = [];
  let cursor = openerIndex;
  while (cursor < sentences.length) {
    const s = sentences[cursor];
    const match =
      cursor === openerIndex
        ? ORDINAL_OPENER_RE.exec(s)
        : ORDINAL_CONT_RE.exec(s);
    if (!match) break;
    listItems.push(
      `- **${match[1]}${match[2]}** ${highlightCallInlineDetails(match[3])}`,
    );
    cursor += 1;
  }
  if (listItems.length < 2) return null;

  const blocks: string[] = [];
  const before = sentences.slice(0, openerIndex);
  if (before.length > 0) {
    blocks.push(before.map(highlightCallInlineDetails).join(' '));
  }
  blocks.push(listItems.join('\n'));
  const after = sentences.slice(cursor);
  if (after.length > 0) {
    blocks.push(...after.map(highlightCallInlineDetails));
  }
  return blocks;
};

const LIST_INTRO_CUE_RE =
  /\b(?:tasks?|events?|reminders?|alarms?|notes?|items?|classes?|courses?|slots?|windows?|options?|steps?|ways?|things?|priorities|highlights|matches|results?|are|include|includes|such as|following|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\s*:$/i;

const SUBORDINATE_STARTER_RE =
  /^(?:if|when|while|because|since|although|though|unless|before|after|until|once|so|but|however|therefore|which|that|who|where)\b/i;

const splitListTail = (tail: string): string[] | null => {
  const cleanTail = tail.replace(/\.$/, '').trim();
  if (!cleanTail) return null;

  const stasher = createStash(cleanTail);
  stasher.stash(/\([^()\n]{1,120}\)/g);
  stasher.stash(/\b(?:e\.g\.|i\.e\.),?/gi);
  stasher.stash(
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Aug|Sept?|Oct|Nov|Dec)\b/gi,
  );
  stasher.stash(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Aug\.?|Sept?\.?|Oct\.?|Nov\.?|Dec\.?)\s+\d{1,2}(?:st|nd|rd|th)?,\s*\d{4}\b/gi,
  );
  const {text: safe, restore} = stasher.finish();

  let rawParts: string[];
  const hasCommaConjunction = /,\s*(?:and|or)\s+/i.test(safe);
  if (safe.includes(';')) {
    rawParts = safe.split(/;\s*(?:(?:and|or)\s+)?/i);
  } else {
    rawParts = safe.split(/,\s*(?:(?:and|or)\s+)?/i);
    if (!hasCommaConjunction && rawParts.length >= 2) {
      const last = rawParts[rawParts.length - 1];
      const conjMatch = /\s+(?:and|or)\s+/i.exec(last);
      if (conjMatch) {
        const left = last.slice(0, conjMatch.index).trim();
        const right = last.slice(conjMatch.index + conjMatch[0].length).trim();
        const leftWords = left.split(/\s+/).length;
        const rightWords = right.split(/\s+/).length;
        if (
          (leftWords >= 2 && rightWords >= 2) ||
          (/\d/.test(left) && /\d/.test(right))
        ) {
          rawParts.splice(rawParts.length - 1, 1, left, right);
        }
      }
    }
  }

  const items = rawParts.map(p => restore(p).trim()).filter(Boolean);
  if (items.length < 2) return null;
  if (items.some(item => item.length < 2 || item.length > 110)) return null;
  if (items.length === 2 && SUBORDINATE_STARTER_RE.test(items[0])) return null;
  return items;
};

const formatColonListSentence = (sentence: string): string | null => {
  if (sentence.endsWith('?')) return null;

  // Locate a prose colon followed by space (not time like 9:00 or URL like https://)
  let colonAt = -1;
  for (let i = 1; i < sentence.length - 2; i += 1) {
    if (sentence[i] !== ':' || sentence[i + 1] !== ' ') continue;
    if (/\d/.test(sentence[i - 1])) continue;
    const prefix = sentence.slice(Math.max(0, i - 5), i).toLowerCase();
    if (prefix.endsWith('http') || prefix.endsWith('https')) continue;
    colonAt = i;
    break;
  }
  if (colonAt < 4 || colonAt > 120) return null;

  const head = sentence.slice(0, colonAt + 1).trim();
  const tail = sentence.slice(colonAt + 1).trim();
  const items = splitListTail(tail);
  if (!items) return null;

  const hasExplicitSeparator = /,\s*(?:and|or)\s+|;/i.test(tail);
  if (
    items.length < 3 &&
    !(hasExplicitSeparator && LIST_INTRO_CUE_RE.test(head))
  ) {
    return null;
  }

  return `${highlightCallInlineDetails(head)}\n${items
    .map(item => `- ${highlightCallInlineDetails(item)}`)
    .join('\n')}`;
};

const formatPlainParagraph = (paragraph: string): string[] => {
  const stepFormatted = formatInlineSteps(paragraph);
  if (stepFormatted) return [stepFormatted];

  const numberedFormatted = formatInlineNumbered(paragraph);
  if (numberedFormatted) return [numberedFormatted];

  const sentences = splitCallSentences(paragraph);
  if (sentences.length === 0) return [];

  const ordinalBlocks = formatOrdinalSentences(sentences);
  if (ordinalBlocks) {
    return ordinalBlocks;
  }

  const totalChars = paragraph.length;
  const formattedSentences = sentences.map(
    s => formatColonListSentence(s) ?? highlightCallInlineDetails(s),
  );
  const hasListBlock = formattedSentences.some(s => s.includes('\n- '));

  if (!hasListBlock && sentences.length === 1) {
    return formattedSentences;
  }
  if (!hasListBlock && sentences.length === 2 && totalChars <= 105) {
    return [formattedSentences.join(' ')];
  }

  const blocks: string[] = [];
  for (let i = 0; i < formattedSentences.length; i += 1) {
    const piece = formattedSentences[i];
    const isList = piece.includes('\n- ');
    const isTrailingQuestion =
      i === formattedSentences.length - 1 &&
      sentences[i].endsWith('?') &&
      blocks.length > 0;
    const prev = blocks[blocks.length - 1];
    const prevIsList = Boolean(prev && prev.includes('\n- '));

    if (
      !isList &&
      !prevIsList &&
      !isTrailingQuestion &&
      prev &&
      prev.length <= 45 &&
      prev.length + piece.length <= 95
    ) {
      blocks[blocks.length - 1] = `${prev} ${piece}`;
    } else {
      blocks.push(piece);
    }
  }
  return blocks;
};

/**
 * Formats a Call Lafina or reminder-call reply into clean Markdown for
 * `ChatReplyText`. Already-formatted Markdown is returned as-is.
 */
export const formatCallReplyMarkdown = (raw: string): string => {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  if (!text) return '';
  if (hasExplicitFormatting(text)) return text;

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return formatPlainParagraph(text).join('\n\n');
  }

  return lines.flatMap(formatPlainParagraph).join('\n\n');
};
