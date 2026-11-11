/**
 * Call Lafina 2.0 Security and Capability Checks (P06-03, F-076, F-078).
 *
 * Replaces dev-only directProviderTestEnabled() gating with release-safe
 * capability, session ownership, data consent, and anti-injection guards.
 */

import {userStore} from '../../storage/userStore';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {voiceConsent} from '../../cloud/voiceConversation';

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

  // Release check: user must be authenticated, non-guest, matching session token
  if (userStore.isGuest(userId)) {
    return {
      permitted: false,
      reason: 'Guest accounts cannot execute cloud tools. Please sign in.',
    };
  }

  let session;
  try {
    session = userStore.getActiveSessionToken();
  } catch {
    return {permitted: false, reason: 'Sign in before using assistant tools.'};
  }
  if (!session || !session.accessToken || session.userId !== userId) {
    return {
      permitted: false,
      reason: 'Active session does not match the requesting user.',
    };
  }

  const hasConsent =
    voiceConsent.read(userId) &&
    localSettingsStore.get(userId, DATA_CONSENT_KEY, null) === 'true';
  if (!hasConsent) {
    return {
      permitted: false,
      reason:
        'Data consent is required. Please review the data disclosure before using tools.',
    };
  }

  return {permitted: true};
}

export {
  containsPromptInjection,
  sanitizeUntrustedContext,
} from './promptSanitizer';
