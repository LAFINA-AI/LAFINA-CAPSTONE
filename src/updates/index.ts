import { appUpdater } from './updateService';

export { appUpdater, apkBlocker, createUpdateService } from './updateService';
export type { InstallOutcome, UpdatePhase, UpdateService, UpdateState } from './updateService';
export { compareVersions } from './updateManifest';
export * from './updatePrompt';

let launchConfirmed = false;

/**
 * Tells the native side this start worked, so a downloaded update is kept
 * (one that never gets here twice is rolled back). Called as soon as a root
 * component — the app or Quick Chat — has mounted; safe to call repeatedly.
 */
export const confirmLaunch = (): void => {
  if (launchConfirmed) return;
  launchConfirmed = true;
  void appUpdater.markLaunchSuccessful();
};
