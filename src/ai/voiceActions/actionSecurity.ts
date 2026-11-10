/**
 * Call Lafina 2.0 Security and Capability Checks (P06-03, F-076, F-078).
 *
 * Replaces dev-only directProviderTestEnabled() gating with release-safe
 * capability, session ownership, data consent, and anti-injection guards.
 */

import {userStore} from '../../storage/userStore';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {voiceConsent} from '../../cloud/voiceConversation';
import {directProviderTestEnabled} from '../../cloud/directProviderTest';

export const DATA_CONSENT_KEY = 'voiceConversation.directDataConsent.v1';

export interface ToolPermissionResult {
  permitted: boolean;
  reason?: string;
}

/**
 * Checks whether client tool execution is permitted for this user.
 * Allows both production signed-in users with consent and QA test builds.
 */
export function isToolExecutionPermitted(userId: string): ToolPermissionResult {
  if (!userId || typeof userId !== 'string') {
    return {permitted: false, reason: 'Invalid user identifier'};
  }

  // QA direct test mode override
  if (directProviderTestEnabled()) {
    const hasConsent =
      localSettingsStore.get(userId, DATA_CONSENT_KEY, null) === 'true' ||
      voiceConsent.read(userId);
    if (!hasConsent) {
      return {
        permitted: false,
        reason: 'Please review the data disclosure before using tools.',
      };
    }
    return {permitted: true};
  }

  // Release check: user must be authenticated, non-guest, matching session token
  if (userStore.isGuest(userId)) {
    return {
      permitted: false,
      reason: 'Guest accounts cannot execute cloud tools. Please sign in.',
    };
  }

  const session = userStore.getActiveSessionToken();
  if (!session || !session.accessToken || session.userId !== userId) {
    return {
      permitted: false,
      reason: 'Active session does not match the requesting user.',
    };
  }

  const hasConsent =
    voiceConsent.read(userId) ||
    localSettingsStore.get(userId, DATA_CONSENT_KEY, null) === 'true';
  if (!hasConsent) {
    return {
      permitted: false,
      reason: 'Data access consent is required to execute assistant tools.',
    };
  }

  return {permitted: true};
}

/**
 * Detection of prompt injection and instruction tampering in untrusted data
 * (retrieved notes, external texts, or RAG content).
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
export function sanitizeUntrustedContext(text: string, maxLength = 1000): string {
  if (!text || typeof text !== 'string') return '';
  let sanitized = text.slice(0, maxLength);
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[filtered content]');
  }
  return sanitized;
}
