import {NativeModules, Platform} from 'react-native';

/**
 * Keeps the phone screen on while a call is live. A sleeping screen pauses
 * the app, and a paused app ends every call on purpose (nothing listens in
 * the background), so a quiet moment in a call must not let the screen time
 * out. Several owners may hold it; the screen may sleep again once none do.
 * The power button still turns the screen off and ends the call.
 */
interface ScreenModule {
  setKeepScreenOn?: (enabled: boolean) => Promise<boolean>;
}

const holders = new Set<string>();

const apply = (enabled: boolean): void => {
  if (Platform.OS !== 'android') return;
  const module = NativeModules.LafinaVoiceConversation as
    | ScreenModule
    | undefined;
  try {
    void Promise.resolve(module?.setKeepScreenOn?.(enabled)).catch(
      () => undefined,
    );
  } catch {
    // An older build without the method: the screen keeps its own timeout.
  }
};

export const setKeepScreenOn = (owner: string, enabled: boolean): void => {
  const before = holders.size > 0;
  if (enabled) holders.add(owner);
  else holders.delete(owner);
  const after = holders.size > 0;
  if (before !== after) apply(after);
};

/** Test helper. */
export const keepScreenOnHolders = (): string[] => [...holders];
