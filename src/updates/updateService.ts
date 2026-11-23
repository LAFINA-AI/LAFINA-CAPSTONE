import { APP_VERSION } from '../appVersion';
import { getNativeUpdater, type NativeUpdater, type UpdaterInfo } from './nativeUpdater';
import {
  latestAssetUrl,
  latestReleaseApiUrl,
  latestReleasePageUrl,
  UPDATE_CONFIG,
  type UpdateConfig,
} from './updateConfig';
import {
  compareVersions,
  isReleaseKey,
  MAX_NOTES_CHARS,
  parseSignedManifest,
  readVerifiedManifest,
  UpdateError,
  type SignedManifest,
  type UpdateManifest,
} from './updateManifest';

export type UpdatePhase =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'needs-install'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  version: string | null;
  /** The release's title, e.g. "LAFINA v1.1.0 — In-app updates". */
  title: string | null;
  /** The release notes, Markdown. */
  notes: string | null;
  percent: number | null;
  message: string | null;
  releaseUrl: string;
  kind: 'bundle' | 'apk' | null;
  size: number | null;
  /** Why the update must be installed from the release page (phase `needs-install`). */
  reason: string | null;
  /** When GitHub last answered a check (ms since epoch). */
  checkedAt: number | null;
  /** Android's install confirmation is on screen. */
  installing: boolean;
}

export type InstallOutcome = 'installing' | 'needs-permission' | 'failed';

type Fetch = typeof fetch;

interface UpdateServiceDeps {
  config?: UpdateConfig;
  currentVersion?: string;
  native?: NativeUpdater | null;
  fetchImpl?: Fetch;
  now?: () => number;
}

const MANIFEST_TIMEOUT_MS = 20_000;
const NOTES_TIMEOUT_MS = 10_000;

const NATIVE_ERRORS: Record<string, UpdateError['code']> = {
  E_CANCELLED: 'cancelled',
  E_NETWORK: 'network_unavailable',
  E_STORAGE: 'insufficient_storage',
  E_VERIFY: 'verification_failed',
  E_INCOMPATIBLE: 'verification_failed',
  E_RESTART: 'restart_failed',
  E_BUSY: 'download_failed',
};

const fromNativeError = (error: unknown): UpdateError => {
  if (error instanceof UpdateError) return error;
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const mapped = typeof code === 'string' ? NATIVE_ERRORS[code] : undefined;
  if (mapped && typeof message === 'string' && message) return new UpdateError(mapped, message);
  return new UpdateError('download_failed', 'The update could not be downloaded. Try again.');
};

const messageOf = (error: unknown): string =>
  error instanceof UpdateError ? error.message : 'Something went wrong while updating. Try again.';

const fetchWithin = async (
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const ABI_REASON =
  'This release was built for a different kind of phone processor, so it cannot be installed from inside the app.';
const SIGNER_REASON =
  'This copy of LAFINA was installed from a differently signed build, so Android cannot update it in place. ' +
  'Install the new version from the release page once; after that, updates install from inside the app.';

/** Why this phone cannot install the release's APK in place, or null. */
export const apkBlocker = (manifest: UpdateManifest, info: UpdaterInfo): string | null => {
  const apk = manifest.apk;
  if (!apk) return null;
  const abis = info.supportedAbis ?? [];
  if (apk.abis && abis.length > 0 && !apk.abis.some((abi) => abis.includes(abi))) {
    return ABI_REASON;
  }
  const signers = info.signerSha256 ?? [];
  if (apk.signerSha256 && signers.length > 0 && !signers.includes(apk.signerSha256)) {
    return SIGNER_REASON;
  }
  return null;
};

export const createUpdateService = (deps: UpdateServiceDeps = {}) => {
  const config = deps.config ?? UPDATE_CONFIG;
  const currentVersion = deps.currentVersion ?? APP_VERSION;
  const native = deps.native === undefined ? getNativeUpdater() : deps.native;
  const fetchImpl: Fetch = deps.fetchImpl ?? ((...args) => fetch(...args));
  const now = deps.now ?? Date.now;

  const unsupportedReason = ((): string | null => {
    if (!native) return 'In-app updates are not available in this build.';
    if (!native.updatesEnabled) {
      return `In-app updates work only in the release app. This is a ${native.buildType} build.`;
    }
    if (!isReleaseKey(config.publicKey)) return 'Updates are not set up for this build.';
    return null;
  })();

  let state: UpdateState = {
    phase: unsupportedReason ? 'unsupported' : 'idle',
    currentVersion,
    version: null,
    title: null,
    notes: null,
    percent: null,
    message: unsupportedReason,
    releaseUrl: latestReleasePageUrl(config),
    kind: null,
    size: null,
    reason: null,
    checkedAt: null,
    installing: false,
  };
  let offer: UpdateManifest | null = null;
  let inFlight: Promise<UpdateState> | null = null;
  const listeners = new Set<(next: UpdateState) => void>();

  const setState = (patch: Partial<UpdateState>): UpdateState => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
    return state;
  };

  const getState = (): UpdateState => state;

  native?.onInstallStatus?.(({ status, message }) => {
    if (state.kind !== 'apk') return;
    if (status === 'confirming') {
      setState({ installing: true, message: null });
    } else if (status === 'failure') {
      setState({
        installing: false,
        message: message ?? 'The update could not be installed. Try again.',
      });
    } else if (status === 'cancelled') {
      setState({ installing: false, message: null });
    }
  });

  const subscribe = (listener: (next: UpdateState) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const fetchSignedManifest = async (): Promise<SignedManifest | null> => {
    let response: Response;
    try {
      response = await fetchWithin(
        fetchImpl,
        latestAssetUrl(config, config.manifestAsset),
        { method: 'GET', headers: { Accept: 'application/json' } },
        MANIFEST_TIMEOUT_MS,
      );
    } catch {
      throw new UpdateError(
        'network_unavailable',
        'Could not reach GitHub. Check the connection and try again.',
      );
    }
    // No release yet, or the latest release has no in-app update in it.
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new UpdateError('server_error', `GitHub answered ${response.status}. Try again later.`);
    }
    return parseSignedManifest(await response.text());
  };

  /** Notes for a manifest that does not carry its own (older release tooling). */
  const fetchNotes = async (file: string): Promise<string | null> => {
    try {
      const response = await fetchWithin(
        fetchImpl,
        latestReleaseApiUrl(config),
        { method: 'GET', headers: { Accept: 'application/vnd.github+json' } },
        NOTES_TIMEOUT_MS,
      );
      if (!response.ok) return null;
      const data = (await response.json()) as { body?: unknown; assets?: unknown };
      const assets = Array.isArray(data.assets) ? data.assets : [];
      if (!assets.some((asset) => (asset as { name?: unknown })?.name === file)) return null;
      const body = typeof data.body === 'string' ? data.body.trim() : '';
      return body ? body.slice(0, MAX_NOTES_CHARS) : null;
    } catch {
      return null;
    }
  };

  const notesFor = async (manifest: UpdateManifest): Promise<string | null> =>
    manifest.notes ?? (await fetchNotes(manifest.file));

  const runCheck = async (quiet: boolean): Promise<UpdateState> => {
    if (!native) return state;
    const before = state;
    setState({ phase: 'checking', message: null });
    try {
      const signed = await fetchSignedManifest();
      const info = await native.getInfo();
      const checkedAt = now();
      const nothingNew = (message: string | null = null): UpdateState => {
        offer = null;
        return setState({
          phase: quiet ? 'idle' : 'up-to-date',
          version: null,
          title: null,
          notes: null,
          percent: null,
          message: quiet ? null : message,
          kind: null,
          size: null,
          reason: null,
          checkedAt,
          installing: false,
        });
      };
      if (!signed) return nothingNew();

      const payload = await native
        .verifyManifest(signed.payload, signed.signature, config.publicKey)
        .catch(() => {
          throw new UpdateError(
            'verification_failed',
            'The update could not be verified (bad signature), so it was not downloaded.',
          );
        });
      const manifest = readVerifiedManifest(payload, { product: config.product });

      if (compareVersions(manifest.version, currentVersion) <= 0) return nothingNew();
      if (info.rejectedVersions.includes(manifest.version)) {
        return nothingNew(
          `LAFINA ${manifest.version} did not start properly on this phone, so it was undone and is not offered again.`,
        );
      }
      if (manifest.nativeVersionCode < info.nativeVersionCode) return nothingNew();

      const found = {
        version: manifest.version,
        title: manifest.title ?? null,
        percent: null,
        reason: null,
        checkedAt,
        installing: false,
      };

      if (manifest.nativeVersionCode > info.nativeVersionCode) {
        const blocker = manifest.apk ? apkBlocker(manifest, info) : null;
        if (manifest.apk && !blocker && native.downloadApk && native.installApk) {
          offer = manifest;
          const ready =
            info.readyApkVersionCode === manifest.apk.versionCode &&
            info.readyApkSha256 === manifest.apk.sha256;
          return setState({
            ...found,
            phase: ready ? 'ready' : 'available',
            kind: 'apk',
            size: manifest.apk.size,
            notes: await notesFor(manifest),
            percent: ready ? 100 : null,
          });
        }
        offer = null;
        return setState({
          ...found,
          phase: 'needs-install',
          kind: null,
          size: manifest.apk?.size ?? null,
          notes: await notesFor(manifest),
          reason:
            blocker ??
            'This version changes the app itself, so download and install it from the release page.',
        });
      }

      offer = manifest;
      const ready = info.pendingVersion === manifest.version;
      return setState({
        ...found,
        phase: ready ? 'ready' : 'available',
        kind: 'bundle',
        size: manifest.size,
        notes: await notesFor(manifest),
        percent: ready ? 100 : null,
      });
    } catch (error) {
      if (quiet) {
        console.log(`[updates] Background check skipped: ${messageOf(error)}`);
        return setState({ ...before, phase: before.phase === 'checking' ? 'idle' : before.phase });
      }
      console.warn(`[updates] Check failed: ${messageOf(error)}`);
      return setState({ phase: 'error', message: messageOf(error) });
    }
  };

  /**
   * Asks GitHub for the latest release. A quiet check (on start, on return to
   * the app) keeps errors out of sight; a check the person asked for shows them.
   * Concurrent calls share one request.
   */
  const check = (request: { quiet?: boolean } = {}): Promise<UpdateState> => {
    if (unsupportedReason || !native) return Promise.resolve(state);
    if (inFlight) return inFlight;
    if (state.phase === 'downloading') return Promise.resolve(state);
    inFlight = runCheck(Boolean(request.quiet)).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const download = async (): Promise<UpdateState> => {
    if (!native || state.phase !== 'available' || !offer) return state;
    const manifest = offer;
    setState({ phase: 'downloading', percent: 0, message: null });
    const progress = native.onProgress(({ received, total }) => {
      if (total > 0 && state.phase === 'downloading') {
        setState({ percent: Math.min(100, Math.floor((received / total) * 100)) });
      }
    });
    try {
      if (state.kind === 'apk' && manifest.apk && native.downloadApk) {
        await native.downloadApk({
          url: latestAssetUrl(config, manifest.apk.file),
          versionCode: manifest.apk.versionCode,
          size: manifest.apk.size,
          sha256: manifest.apk.sha256,
        });
      } else {
        await native.downloadBundle({
          url: latestAssetUrl(config, manifest.file),
          version: manifest.version,
          nativeVersionCode: manifest.nativeVersionCode,
          size: manifest.size,
          sha256: manifest.sha256,
        });
      }
      return setState({ phase: 'ready', percent: 100 });
    } catch (error) {
      const failure = fromNativeError(error);
      if (failure.code === 'cancelled') return setState({ phase: 'available', percent: null });
      console.warn(`[updates] Download failed: ${failure.message}`);
      // The offer stays: "Try again" downloads (and an APK resumes) without a new check.
      return setState({ phase: 'error', percent: null, message: failure.message });
    } finally {
      progress.remove();
    }
  };

  /** After a failed download, offers the same update again without a new check. */
  const retry = async (): Promise<UpdateState> => {
    if (state.phase !== 'error') return state;
    if (offer) {
      setState({ phase: 'available', message: null });
      return download();
    }
    return check();
  };

  const cancel = (): void => {
    if (state.phase === 'downloading') native?.cancelDownload();
  };

  const restart = async (): Promise<UpdateState> => {
    if (!native || state.phase !== 'ready' || state.kind !== 'bundle') return state;
    try {
      await native.restart();
      return state;
    } catch (error) {
      return setState({ message: fromNativeError(error).message });
    }
  };

  const install = async (): Promise<InstallOutcome> => {
    const apk = offer?.apk;
    if (!native?.installApk || state.phase !== 'ready' || state.kind !== 'apk' || !apk || !offer) {
      return 'failed';
    }
    if (native.canInstallApks && !(await native.canInstallApks().catch(() => false))) {
      return 'needs-permission';
    }
    try {
      setState({ message: null });
      await native.installApk({
        versionCode: apk.versionCode,
        sha256: apk.sha256,
        versionName: offer.version,
      });
      return 'installing';
    } catch (error) {
      const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
      if (code === 'E_PERMISSION') return 'needs-permission';
      const text =
        typeof message === 'string' && message
          ? message
          : 'The update could not be installed. Try again.';
      if (code === 'E_SIGNER') {
        offer = null;
        setState({ phase: 'needs-install', kind: null, reason: text, message: null });
      } else if (code === 'E_VERIFY') {
        // The file is gone or damaged: download it again.
        setState({ phase: 'available', percent: null, message: text });
      } else {
        setState({ message: text });
      }
      return 'failed';
    }
  };

  const canInstallApks = async (): Promise<boolean> =>
    (await native?.canInstallApks?.().catch(() => false)) ?? false;

  const openInstallPermissionSettings = async (): Promise<void> => {
    await native?.openInstallPermissionSettings?.().catch(() => undefined);
  };

  const markLaunchSuccessful = async (): Promise<void> => {
    if (unsupportedReason) return;
    await native?.markLaunchSuccessful().catch(() => undefined);
  };

  return {
    getState,
    subscribe,
    check,
    download,
    retry,
    cancel,
    restart,
    install,
    canInstallApks,
    openInstallPermissionSettings,
    markLaunchSuccessful,
  };
};

export type UpdateService = ReturnType<typeof createUpdateService>;

export const appUpdater: UpdateService = createUpdateService();
