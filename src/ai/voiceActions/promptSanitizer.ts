/**
 * Prompt-injection detection and untrusted-context sanitization for retrieved
 * notes, external texts, and RAG content.
 *
 * Kept dependency-free so offline voice modules and online conversation
 * context builders can share it without forming import cycles.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /disregard\s+(?:all\s+)?prior\s+instructions/i,
  /<\|(?:im_start|im_end|system|user|assistant)\|>/i,
  /<system>[\s\S]*?<\/system>/i,
  /\[SYSTEM_INSTRUCTION\]/i,
  /bypass\s+confirmation/i,
  /execute\s+silently/i,
  /delete\s+all\s+(?:tasks|events|notes)/i,
];

export function containsPromptInjection(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Sanitize untrusted content before including in tool context.
 */
export function sanitizeUntrustedContext(
  text: string,
  maxLength = 1000,
): string {
  if (!text || typeof text !== 'string') return '';
  let sanitized = text.slice(0, maxLength);
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[filtered content]');
  }
  return sanitized;
}
