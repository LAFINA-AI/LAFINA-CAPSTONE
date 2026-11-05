export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

const HALLUCINATION_PATTERNS: readonly RegExp[] = [
  /^\[(?:blank_audio|music|applause|laughter|silence|noise|inaudible)\]$/i,
  /^\((?:music|applause|laughter|silence|inaudible)\)$/i,
  /^♪+$/,
  /^(?:thank you for watching|thanks for watching|please subscribe|subtitles by .*)$/i,
];

const normalizeText = (raw: string): string =>
  raw.replace(/\s+/g, ' ').trim();

export const isHallucination = (text: string): boolean => {
  const cleaned = normalizeText(text);
  if (!cleaned) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(cleaned)) return true;
  return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(cleaned));
};

export const cleanSegments = (raw: TranscriptSegment[]): TranscriptSegment[] => {
  const sorted = [...raw]
    .map((seg) => ({
      startMs: Math.max(0, Math.round(Number(seg.startMs) || 0)),
      endMs: Math.max(0, Math.round(Number(seg.endMs) || 0)),
      text: normalizeText(String(seg.text ?? '')),
    }))
    .filter((seg) => !isHallucination(seg.text))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged: TranscriptSegment[] = [];
  for (const seg of sorted) {
    const endMs = Math.max(seg.startMs, seg.endMs);
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.text.toLowerCase() === seg.text.toLowerCase() &&
      seg.startMs - prev.endMs <= 2000
    ) {
      prev.endMs = Math.max(prev.endMs, endMs);
      continue;
    }
    merged.push({ startMs: seg.startMs, endMs, text: seg.text });
  }
  return merged;
};

export const formatTimestamp = (ms: number, forceHours = false): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0 || forceHours) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
};

export const transcriptToText = (
  segments: TranscriptSegment[],
  options: { timestamps?: boolean } = {},
): string => {
  if (segments.length === 0) return '';
  const includeHours = segments.some((s) => s.startMs >= 3_600_000);
  return segments
    .map((seg) =>
      options.timestamps
        ? `[${formatTimestamp(seg.startMs, includeHours)}] ${seg.text}`
        : seg.text,
    )
    .join('\n');
};

export const wordCount = (segments: TranscriptSegment[]): number => {
  let count = 0;
  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    count += words.length;
  }
  return count;
};

export interface TranscriptSection {
  index: number;
  startMs: number;
  endMs: number;
  segments: TranscriptSegment[];
  text: string;
}

const DEFAULT_SECTION_CHAR_BUDGET = 12_000;

export const partitionTranscript = (
  segments: TranscriptSegment[],
  maxCharsPerSection = DEFAULT_SECTION_CHAR_BUDGET,
): TranscriptSection[] => {
  if (segments.length === 0) return [];
  const budget = Math.max(1000, maxCharsPerSection);
  const includeHours = segments.some((s) => s.startMs >= 3_600_000);
  const sections: TranscriptSection[] = [];

  let currentSegments: TranscriptSegment[] = [];
  let currentLines: string[] = [];
  let currentChars = 0;

  const flush = (): void => {
    if (currentSegments.length === 0) return;
    sections.push({
      index: sections.length,
      startMs: currentSegments[0].startMs,
      endMs: currentSegments[currentSegments.length - 1].endMs,
      segments: currentSegments,
      text: currentLines.join('\n'),
    });
    currentSegments = [];
    currentLines = [];
    currentChars = 0;
  };

  for (const seg of segments) {
    const line = `[${formatTimestamp(seg.startMs, includeHours)}] ${seg.text}`;
    if (currentSegments.length > 0 && currentChars + line.length + 1 > budget) {
      flush();
    }
    currentSegments.push(seg);
    currentLines.push(line);
    currentChars += line.length + 1;
  }
  flush();

  return sections;
};
