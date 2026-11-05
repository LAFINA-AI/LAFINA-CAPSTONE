import type { DocumentFormat } from '../skills/documentSkill';

export interface DetectedDocumentRequest {
  format: DocumentFormat;
  prompt: string;
}

const VERB =
  /\b(?:create|make|generate|export|write|build|draft|prepare|turn\b[\s\S]{0,40}?\binto|convert\b[\s\S]{0,40}?\b(?:to|into)|save\b[\s\S]{0,40}?\bas|download\b[\s\S]{0,40}?\bas)\b/i;

const SCHEDULING_LEAD =
  /^\s*(?:remind\s+me\b|set\s+a?\s*reminder\b|schedule\s+(?:a\s+)?(?:call|meeting|appointment|event|class|reminder|task)\b|add\s+(?:a\s+)?(?:task|event|reminder|time\s*block)\b|wake\s+me\b|call\s+me\b)/i;

const FORMAT_PATTERNS: ReadonlyArray<{ format: DocumentFormat; pattern: RegExp }> = [
  { format: 'pdf', pattern: /\bpdfs?\b|\bportable\s+document\b/i },
  {
    format: 'docx',
    pattern:
      /\bdocx\b|\bword\s+(?:doc|document|file)s?\b|\bms\s+word\b|\bmicrosoft\s+word\b|\b\.docx\b/i,
  },
  {
    format: 'xlsx',
    pattern:
      /\bxlsx\b|\bexcel\b|\bspreadsheets?\b|\bworkbooks?\b|\b\.xlsx\b/i,
  },
  {
    format: 'pptx',
    pattern:
      /\bpptx?\b|\bpower\s*points?\b|\bslide\s*decks?\b|\bpresentation\s+(?:slides|deck|file)\b|\b\.pptx\b/i,
  },
];

export const detectDocumentRequest = (
  text: string,
): DetectedDocumentRequest | null => {
  const trimmed = text.trim();
  if (trimmed.length < 6) return null;
  if (SCHEDULING_LEAD.test(trimmed)) return null;
  if (!VERB.test(trimmed)) return null;

  for (const entry of FORMAT_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return { format: entry.format, prompt: trimmed };
    }
  }
  return null;
};
