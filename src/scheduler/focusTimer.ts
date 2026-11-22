import {NativeModules} from 'react-native';

interface FocusNativeModule {
  cancel?: () => Promise<boolean>;
}

/** Cancels any pending Pomodoro focus notification or DND alarm cleanly. */
export async function cancelFocusTimer(): Promise<void> {
  const mod = NativeModules.LafinaFocus as FocusNativeModule | undefined;
  if (!mod?.cancel) return;
  try {
    await mod.cancel();
  } catch {
    // Best-effort cleanup when signing out or clearing account data.
  }
}
