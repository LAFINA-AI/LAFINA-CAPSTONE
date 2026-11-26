import NetInfo from '@react-native-community/netinfo';
import {userStore} from '../storage/userStore';
import {accountLinkService} from './accountLinkService';
import {readInitialOnlineMode} from './providerTestDefaults';

/**
 * Why Online Mode is on or off for a request.
 * - `on`: opted in, connected, and the account may use online AI.
 * - `auth_required`: no signed-in account (guests never use Online Mode).
 * - `setting_off`: the student has not turned Online Mode on in Chat.
 * - `offline`: no usable connection.
 * - `unavailable`: the server refused or could not be reached.
 */
export type OnlineModeReason =
  | 'on'
  | 'auth_required'
  | 'setting_off'
  | 'offline'
  | 'unavailable';

export interface OnlineModeDecision {
  enabled: boolean;
  reason: OnlineModeReason;
  /** The server's own message when it refused. */
  message?: string;
}

const off = (
  reason: Exclude<OnlineModeReason, 'on'>,
  message?: string,
): OnlineModeDecision => ({enabled: false, reason, ...(message ? {message} : {})});

/**
 * The Chat tab's Online Mode rule as one function, for screens other than
 * Chat (Floating LAFINA's Quick Chat, ADR-036): the opt-in `chat.onlineMode`
 * setting, a usable connection, and `accountLinkService.authorizeOnlineMode`.
 * It reads the setting and never changes it.
 */
export const resolveOnlineMode = async (
  userId: string | null | undefined,
): Promise<OnlineModeDecision> => {
  if (!userId) return off('auth_required');
  let guest = false;
  try {
    guest = userStore.isGuest(userId);
  } catch {
    guest = false;
  }
  if (guest) return off('auth_required');

  let optedIn = false;
  try {
    optedIn = readInitialOnlineMode(userId);
  } catch {
    optedIn = false;
  }
  if (!optedIn) return off('setting_off');

  const net = await NetInfo.fetch().catch(() => null);
  const connected = Boolean(
    net?.isConnected && net.isInternetReachable !== false,
  );
  if (!connected) return off('offline');

  const auth = await accountLinkService
    .authorizeOnlineMode(userId)
    .catch(() => ({
      status: 'network_error' as const,
      message: 'Could not reach the LAFINA server. Try again.',
    }));
  if (auth.status === 'success') return {enabled: true, reason: 'on'};
  if (auth.status === 'offline') return off('offline', auth.message);
  if (auth.status === 'auth_required') return off('auth_required', auth.message);
  return off('unavailable', auth.message);
};
