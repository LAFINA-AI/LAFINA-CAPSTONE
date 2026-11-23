import { DeviceEventEmitter, NativeModules } from 'react-native';

export interface UpdaterInfo {
  nativeVersionCode: number;
  nativeVersionName: string;
  isDebug: boolean;
  /** Only release builds take in-app updates (debug/test builds have another app ID). */
  updatesEnabled?: boolean;
  runningVersion: string | null;
  pendingVersion: string | null;
  rejectedVersions: string[];
  /** SHA-256 of the certificates this installed app is signed with. */
  signerSha256?: string[];
  supportedAbis?: string[];
  readyApkVersionCode?: number;
  readyApkSha256?: string;
}

export interface ApkDownloadRequest {
  url: string;
  versionCode: number;
  size: number;
  sha256: string;
}

export interface ApkInstallRequest {
  versionCode: number;
  sha256: string;
  versionName: string;
}

export interface InstallStatus {
  status: 'confirming' | 'success' | 'cancelled' | 'failure';
  message: string | null;
}

export interface DownloadRequest {
  url: string;
  version: string;
  nativeVersionCode: number;
  size: number;
  sha256: string;
}

export interface DownloadProgress {
  received: number;
  total: number;
}

export interface NativeUpdater {
  /** False in debug and test builds, which cannot take an in-app update. */
  updatesEnabled: boolean;
  buildType: string;
  getInfo: () => Promise<UpdaterInfo>;
  verifyManifest: (payload: string, signature: string, publicKey: string) => Promise<string>;
  downloadBundle: (request: DownloadRequest) => Promise<boolean>;
  cancelDownload: () => void;
  markLaunchSuccessful: () => Promise<boolean>;
  restart: () => Promise<boolean>;
  onProgress: (listener: (progress: DownloadProgress) => void) => { remove: () => void };
  downloadApk?: (request: ApkDownloadRequest) => Promise<boolean>;
  installApk?: (request: ApkInstallRequest) => Promise<boolean>;
  canInstallApks?: () => Promise<boolean>;
  openInstallPermissionSettings?: () => Promise<boolean>;
  onInstallStatus?: (listener: (status: InstallStatus) => void) => { remove: () => void };
}

type LafinaUpdaterNativeModule = Omit<
  NativeUpdater,
  'onProgress' | 'onInstallStatus' | 'updatesEnabled' | 'buildType'
> & {
  updatesEnabled?: unknown;
  buildType?: unknown;
};

const PROGRESS_EVENT = 'LafinaUpdaterProgress';
const INSTALL_STATUS_EVENT = 'LafinaUpdaterInstallStatus';

export const getNativeUpdater = (): NativeUpdater | null => {
  const module = NativeModules.LafinaUpdater as LafinaUpdaterNativeModule | undefined;
  if (!module?.verifyManifest || !module.downloadBundle) return null;
  return {
    updatesEnabled: module.updatesEnabled === true,
    buildType: typeof module.buildType === 'string' ? module.buildType : 'unknown',
    getInfo: () => module.getInfo(),
    verifyManifest: (payload, signature, publicKey) =>
      module.verifyManifest(payload, signature, publicKey),
    downloadBundle: (request) => module.downloadBundle(request),
    cancelDownload: () => module.cancelDownload(),
    markLaunchSuccessful: () => module.markLaunchSuccessful(),
    restart: () => module.restart(),
    onProgress: (listener) => DeviceEventEmitter.addListener(PROGRESS_EVENT, listener),
    ...(module.downloadApk && module.installApk
      ? {
          downloadApk: (request: ApkDownloadRequest) => module.downloadApk!(request),
          installApk: (request: ApkInstallRequest) => module.installApk!(request),
          canInstallApks: () => module.canInstallApks?.() ?? Promise.resolve(true),
          openInstallPermissionSettings: () =>
            module.openInstallPermissionSettings?.() ?? Promise.resolve(false),
          onInstallStatus: (listener: (status: InstallStatus) => void) =>
            DeviceEventEmitter.addListener(INSTALL_STATUS_EVENT, listener),
        }
      : {}),
  };
};
