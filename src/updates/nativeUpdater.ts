import { DeviceEventEmitter, NativeModules } from 'react-native';

export interface UpdaterInfo {
  nativeVersionCode: number;
  nativeVersionName: string;
  isDebug: boolean;
  runningVersion: string | null;
  pendingVersion: string | null;
  rejectedVersions: string[];
  readyApkVersionCode?: number;
}

export interface ApkDownloadRequest {
  url: string;
  versionCode: number;
  size: number;
  sha256: string;
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
  getInfo: () => Promise<UpdaterInfo>;
  verifyManifest: (payload: string, signature: string, publicKey: string) => Promise<string>;
  downloadBundle: (request: DownloadRequest) => Promise<boolean>;
  cancelDownload: () => void;
  markLaunchSuccessful: () => Promise<boolean>;
  restart: () => Promise<boolean>;
  onProgress: (listener: (progress: DownloadProgress) => void) => { remove: () => void };
  downloadApk?: (request: ApkDownloadRequest) => Promise<boolean>;
  installApk?: (request: { versionCode: number; sha256: string }) => Promise<boolean>;
  canInstallApks?: () => Promise<boolean>;
  openInstallPermissionSettings?: () => Promise<boolean>;
  onInstallStatus?: (listener: (status: InstallStatus) => void) => { remove: () => void };
}

type LafinaUpdaterNativeModule = Omit<NativeUpdater, 'onProgress' | 'onInstallStatus'>;

const PROGRESS_EVENT = 'LafinaUpdaterProgress';
const INSTALL_STATUS_EVENT = 'LafinaUpdaterInstallStatus';

export const getNativeUpdater = (): NativeUpdater | null => {
  const module = NativeModules.LafinaUpdater as LafinaUpdaterNativeModule | undefined;
  if (!module?.verifyManifest || !module.downloadBundle) return null;
  return {
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
          installApk: (request: { versionCode: number; sha256: string }) =>
            module.installApk!(request),
          canInstallApks: () => module.canInstallApks?.() ?? Promise.resolve(true),
          openInstallPermissionSettings: () =>
            module.openInstallPermissionSettings?.() ?? Promise.resolve(false),
          onInstallStatus: (listener: (status: InstallStatus) => void) =>
            DeviceEventEmitter.addListener(INSTALL_STATUS_EVENT, listener),
        }
      : {}),
  };
};
