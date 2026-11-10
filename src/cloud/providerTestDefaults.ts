import {NativeModules} from 'react-native';
import {GUEST_USER_ID} from '../constants';
import {localSettingsStore} from '../storage/localSettingsStore';
import {userStore} from '../storage/userStore';

/** Owner-requested defaults, compiled only into the separate provider QA APK. */
export const isProviderTestingEnabled = (): boolean => {
  const build = NativeModules.CapstoneBuild as
    | {providerTestingEnabled?: unknown; backendSwitchEnabled?: unknown}
    | undefined;
  return (
    build?.providerTestingEnabled === true &&
    build.backendSwitchEnabled === true
  );
};

/** Preserve an explicit Offline choice, guest mode and account ownership. */
export const readInitialOnlineMode = (userId: string): boolean => {
  const saved = localSettingsStore.get(userId, 'chat.onlineMode', null);
  if (saved !== null) return saved === 'true';
  if (!isProviderTestingEnabled() || userId === GUEST_USER_ID) return false;
  try {
    const session = userStore.getActiveSessionToken();
    if (session.userId !== userId || !session.accessToken) return false;
    return localSettingsStore.set(userId, 'chat.onlineMode', 'true');
  } catch {
    return false;
  }
};
