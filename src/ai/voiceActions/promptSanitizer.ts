/**
 * Prompt-injection detection, sensitive-secret detection, and untrusted-context
 * sanitization for retrieved notes, memories, external texts, and RAG content.
 *
 * Kept dependency-free so offline voice modules, storage stores, and online
 * conversation context builders can share it without forming import cycles.
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

const SENSITIVE_SECRET_PATTERNS = [
  /\b(?:password|passcode|passphrase|pin\s+code|otp|one[- ]time\s+(?:code|password|pin)|cvv|cvc|security\s+code|backup\s+code|recovery\s+code)\b\s*(?:is|are|=|:|\s)\s*\S+/i,
  /\b(?:atm|bank|gcash|card|phone|device|unlock|sim|my|preferred|security)\s+pin\b\s*(?:is|are|=|:|\s)\s*(?=[0-9*#])\S+/i,
  /\bpin\s*(?:is|=|:)\s*\d{4,}\b/i,
  /\b(?:api[_\s-]?key|access[_\s-]?token|refresh[_\s-]?token|secret[_\s-]?key|private[_\s-]?key|bearer\s+[A-Za-z0-9._-]{8,})\b/i,
  /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/,
  /\b(?:credit\s+card|debit\s+card|card\s+(?:number|no\.?))\b[^\n]{0,20}\d{4}[\s-]?\d{4}/i,
  /\b(?:\d{4}[\s-]){3}\d{4}\b/,
  /\b(?:bank\s+account(?:\s+(?:number|no\.?))?|account\s+(?:number|no\.?)|gcash\s+(?:number|no\.?|account))\b(?:\s+is|\s*[:=#-]|\s)+\d[\d\s-]{5,}/i,
  /\b(?:student\s+(?:id|number|no\.?)|id\s+number|ssn|social\s+security|tin\s+number)\b(?:\s+is|\s*[:=#-]|\s)+\d[\d-]{5,}/i,
];

const passesLuhn = (digits: string): boolean => {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
};

const hasBarePaymentCardNumber = (text: string): boolean => {
  const re = /\b\d{13,19}\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const prefix = text.slice(Math.max(0, match.index - 10), match.index);
    if (/\bisbn[\s:-]*$/i.test(prefix)) continue;
    if (passesLuhn(match[0])) return true;
  }
  return false;
};

export function containsPromptInjection(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

export function containsSensitiveSecret(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return (
    SENSITIVE_SECRET_PATTERNS.some(pattern => pattern.test(text)) ||
    hasBarePaymentCardNumber(text)
  );
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
