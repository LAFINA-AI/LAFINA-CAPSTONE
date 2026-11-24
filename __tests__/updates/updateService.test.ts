/**
 * In-app updates from the GitHub release (src/updates). Fakes stand in for
 * GitHub and the native LafinaUpdater module; nothing here downloads,
 * restarts or installs on a phone.
 */
import {createUpdateService} from '../../src/updates/updateService';
import type {
  NativeUpdater,
  UpdaterInfo,
  InstallStatus,
} from '../../src/updates/nativeUpdater';
import {UPDATE_CONFIG} from '../../src/updates/updateConfig';
import {readVerifiedManifest} from '../../src/updates/updateManifest';

const SIGNER = 'a'.repeat(64);
const OTHER_SIGNER = 'b'.repeat(64);

const manifest = (overrides: Record<string, unknown> = {}) => ({
  schema: 1,
  product: 'com.lafina.capstone',
  version: '1.2.0',
  platform: 'android',
  nativeVersionCode: 7,
  file: 'lafina-android-bundle-1.2.0.zip',
  size: 4_000_000,
  sha256: 'c'.repeat(64),
  signedAt: '2026-11-23T00:00:00.000Z',
  title: 'LAFINA v1.2.0 — Smoother updates',
  notes: '## What is new\n- **Faster** calls',
  apk: {
    file: 'LAFINA-v1.2.0-arm64-v8a.apk',
    size: 140_000_000,
    sha256: 'd'.repeat(64),
    versionCode: 7,
    abis: ['arm64-v8a'],
    signerSha256: SIGNER,
  },
  ...overrides,
});

const signed = (data: unknown, signature = 'Z29vZA==') =>
  JSON.stringify({
    payload: Buffer.from(JSON.stringify(data), 'utf8').toString('base64'),
    signature,
  });

const response = (status: number, body = ''): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response);

interface FakeNative extends NativeUpdater {
  info: UpdaterInfo;
  emitInstall: (status: InstallStatus) => void;
  emitProgress: (received: number, total: number) => void;
}

const fakeNative = (info: Partial<UpdaterInfo> = {}): FakeNative => {
  const installListeners: Array<(status: InstallStatus) => void> = [];
  const progressListeners: Array<
    (p: {received: number; total: number}) => void
  > = [];
  const native: Record<string, unknown> & {info: UpdaterInfo} = {
    updatesEnabled: true,
    buildType: 'release',
    info: {
      nativeVersionCode: 7,
      nativeVersionName: '1.1.0',
      isDebug: false,
      updatesEnabled: true,
      runningVersion: null,
      pendingVersion: null,
      rejectedVersions: [],
      signerSha256: [SIGNER],
      supportedAbis: ['arm64-v8a', 'armeabi-v7a'],
      ...info,
    },
    getInfo: jest.fn(async (): Promise<UpdaterInfo> => native.info),
    verifyManifest: jest.fn(async (payload: string, signature: string) => {
      if (signature !== 'Z29vZA==')
        throw Object.assign(new Error('bad'), {code: 'E_SIGNATURE'});
      return Buffer.from(payload, 'base64').toString('utf8');
    }),
    downloadBundle: jest.fn(async () => true),
    downloadApk: jest.fn(async () => true),
    installApk: jest.fn(async () => true),
    canInstallApks: jest.fn(async () => true),
    openInstallPermissionSettings: jest.fn(async () => true),
    cancelDownload: jest.fn(),
    markLaunchSuccessful: jest.fn(async () => true),
    restart: jest.fn(async () => true),
    onProgress: jest.fn(listener => {
      progressListeners.push(listener);
      return {remove: jest.fn()};
    }),
    onInstallStatus: jest.fn(listener => {
      installListeners.push(listener);
      return {remove: jest.fn()};
    }),
    emitInstall: (status: InstallStatus) =>
      installListeners.forEach(l => l(status)),
    emitProgress: (received: number, total: number) =>
      progressListeners.forEach(l => l({received, total})),
  };
  return native as unknown as FakeNative;
};

const setup = (
  options: {
    body?: unknown;
    status?: number;
    signature?: string;
    info?: Partial<UpdaterInfo>;
    currentVersion?: string;
  } = {},
) => {
  const native = fakeNative(options.info);
  const fetchImpl = jest.fn(async (url: string) => {
    if (url.includes('api.github.com'))
      return response(200, JSON.stringify({body: 'API notes', assets: []}));
    if (options.status && options.status !== 200)
      return response(options.status);
    return response(200, signed(options.body ?? manifest(), options.signature));
  });
  const service = createUpdateService({
    native,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    currentVersion: options.currentVersion ?? '1.1.0',
    now: () => 1_000,
  });
  return {native, fetchImpl, service};
};

describe('update check', () => {
  it('times out a manifest whose headers arrive but whose body stalls', async () => {
    jest.useFakeTimers();
    try {
      const native = fakeNative();
      const fetchImpl = jest.fn(async () => ({
        ok: true,
        status: 200,
        text: () => new Promise(() => undefined),
      }));
      const service = createUpdateService({
        native,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const pending = service.check();
      await jest.advanceTimersByTimeAsync(20001);
      expect((await pending).phase).toBe('error');
      expect(native.verifyManifest).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it('is unavailable without the native module or in a debug/test build', async () => {
    expect(createUpdateService({native: null}).getState().phase).toBe(
      'unsupported',
    );
    const debugNative = {
      ...fakeNative(),
      updatesEnabled: false,
      buildType: 'dataQa',
    };
    const service = createUpdateService({native: debugNative});
    expect(service.getState()).toMatchObject({phase: 'unsupported'});
    expect(service.getState().message).toContain('dataQa');
    expect((await service.check()).phase).toBe('unsupported');
    expect(debugNative.getInfo).not.toHaveBeenCalled();
  });

  it('reports up to date when the latest release has no update file (404)', async () => {
    const {service} = setup({status: 404});
    expect((await service.check()).phase).toBe('up-to-date');
    const quiet = setup({status: 404}).service;
    expect((await quiet.check({quiet: true})).phase).toBe('idle');
  });

  it('offers a JavaScript update with the signed title and notes, without the GitHub API', async () => {
    const {service, fetchImpl} = setup();
    const state = await service.check();
    expect(state).toMatchObject({
      phase: 'available',
      kind: 'bundle',
      version: '1.2.0',
      size: 4_000_000,
      title: 'LAFINA v1.2.0 — Smoother updates',
      notes: '## What is new\n- **Faster** calls',
      checkedAt: 1_000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://github.com/LAFINA-AI/LAFINA-CAPSTONE/releases/latest/download/lafina-update-android.json',
    );
  });

  it('falls back to the GitHub API for notes when the manifest has none', async () => {
    const body = manifest({notes: undefined});
    const native = fakeNative();
    const fetchImpl = jest.fn(async (url: string) =>
      url.includes('api.github.com')
        ? response(
            200,
            JSON.stringify({body: 'API notes', assets: [{name: body.file}]}),
          )
        : response(200, signed(body)),
    );
    const service = createUpdateService({
      native,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      currentVersion: '1.1.0',
    });
    expect((await service.check()).notes).toBe('API notes');
  });

  it('ignores the same or an older version, and a version that was rolled back', async () => {
    expect((await setup({currentVersion: '1.2.0'}).service.check()).phase).toBe(
      'up-to-date',
    );
    expect((await setup({currentVersion: '1.3.0'}).service.check()).phase).toBe(
      'up-to-date',
    );
    const rejected = await setup({
      info: {rejectedVersions: ['1.2.0']},
    }).service.check();
    expect(rejected.phase).toBe('up-to-date');
    expect(rejected.message).toContain('did not start properly');
  });

  it('refuses a bad signature, loudly when asked and silently in the background', async () => {
    const loud = await setup({signature: 'YmFk'}).service.check();
    expect(loud.phase).toBe('error');
    expect(loud.message).toContain('bad signature');
    const quiet = await setup({signature: 'YmFk'}).service.check({quiet: true});
    expect(quiet.phase).toBe('idle');
    expect(quiet.message).toBeNull();
  });

  it('refuses a manifest signed for another app', async () => {
    const state = await setup({
      body: manifest({product: 'com.lafina'}),
    }).service.check();
    expect(state.phase).toBe('error');
    expect(state.message).toContain('signed for another app');
  });

  it('reports a network failure', async () => {
    const native = fakeNative();
    const service = createUpdateService({
      native,
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      currentVersion: '1.1.0',
    });
    const state = await service.check();
    expect(state.phase).toBe('error');
    expect(state.message).toContain('Could not reach GitHub');
  });

  it('shares one request between overlapping checks', async () => {
    const {service, fetchImpl} = setup();
    const [a, b] = await Promise.all([
      service.check({quiet: true}),
      service.check(),
    ]);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('APK updates (a newer native build)', () => {
  const apkRelease = () =>
    manifest({nativeVersionCode: 8, apk: {...manifest().apk, versionCode: 8}});

  it('offers the APK with its size', async () => {
    const state = await setup({body: apkRelease()}).service.check();
    expect(state).toMatchObject({
      phase: 'available',
      kind: 'apk',
      size: 140_000_000,
    });
  });

  it('is ready only when the downloaded APK matches this release checksum', async () => {
    const ready = await setup({
      body: apkRelease(),
      info: {readyApkVersionCode: 8, readyApkSha256: 'd'.repeat(64)},
    }).service.check();
    expect(ready).toMatchObject({phase: 'ready', kind: 'apk', percent: 100});
    expect(ready.notes).toContain('Faster');

    const stale = await setup({
      body: apkRelease(),
      info: {readyApkVersionCode: 8, readyApkSha256: 'e'.repeat(64)},
    }).service.check();
    expect(stale.phase).toBe('available');
  });

  it('sends a differently signed install to the release page before downloading 140 MB', async () => {
    const {service, native} = setup({
      body: apkRelease(),
      info: {signerSha256: [OTHER_SIGNER]},
    });
    const state = await service.check();
    expect(state.phase).toBe('needs-install');
    expect(state.reason).toContain('differently signed');
    await service.download();
    expect(native.downloadApk).not.toHaveBeenCalled();
  });

  it('sends a phone with another processor type to the release page', async () => {
    const state = await setup({
      body: apkRelease(),
      info: {supportedAbis: ['x86_64']},
    }).service.check();
    expect(state.phase).toBe('needs-install');
    expect(state.reason).toContain('processor');
  });

  it('downloads, then installs with the version name for the after-update notice', async () => {
    const {service, native} = setup({body: apkRelease()});
    await service.check();
    expect((await service.download()).phase).toBe('ready');
    expect(native.downloadApk).toHaveBeenCalledWith({
      url: 'https://github.com/LAFINA-AI/LAFINA-CAPSTONE/releases/latest/download/LAFINA-v1.2.0-arm64-v8a.apk',
      versionCode: 8,
      size: 140_000_000,
      sha256: 'd'.repeat(64),
    });
    expect(await service.install()).toBe('installing');
    expect(native.installApk).toHaveBeenCalledWith({
      versionCode: 8,
      sha256: 'd'.repeat(64),
      versionName: '1.2.0',
    });
    native.emitInstall({status: 'confirming', message: null});
    expect(service.getState().installing).toBe(true);
    native.emitInstall({status: 'cancelled', message: null});
    expect(service.getState()).toMatchObject({
      phase: 'ready',
      installing: false,
    });
    native.emitInstall({
      status: 'failure',
      message: 'Android blocked installing the update.',
    });
    expect(service.getState().message).toBe(
      'Android blocked installing the update.',
    );
  });

  it('asks for the install permission first', async () => {
    const {service, native} = setup({body: apkRelease()});
    native.canInstallApks = jest.fn(async () => false);
    await service.check();
    await service.download();
    expect(await service.install()).toBe('needs-permission');
    expect(native.installApk).not.toHaveBeenCalled();
  });

  it('handles a signer refusal and a damaged file from the native install check', async () => {
    const signer = setup({body: apkRelease()});
    signer.native.installApk = jest.fn(async () => {
      throw Object.assign(new Error('x'), {
        code: 'E_SIGNER',
        message: 'Install it from the release page.',
      });
    });
    await signer.service.check();
    await signer.service.download();
    expect(await signer.service.install()).toBe('failed');
    expect(signer.service.getState()).toMatchObject({
      phase: 'needs-install',
      reason: 'Install it from the release page.',
    });

    const damaged = setup({body: apkRelease()});
    damaged.native.installApk = jest.fn(async () => {
      throw Object.assign(new Error('x'), {
        code: 'E_VERIFY',
        message: 'Download it again.',
      });
    });
    await damaged.service.check();
    await damaged.service.download();
    expect(await damaged.service.install()).toBe('failed');
    expect(damaged.service.getState()).toMatchObject({
      phase: 'available',
      message: 'Download it again.',
    });
  });
});

describe('JavaScript updates', () => {
  it('downloads, reports progress and restarts', async () => {
    const {service, native} = setup();
    await service.check();
    native.downloadBundle = jest.fn(async () => {
      native.emitProgress(2_000_000, 4_000_000);
      expect(service.getState().percent).toBe(50);
      return true;
    });
    expect((await service.download()).phase).toBe('ready');
    await service.restart();
    expect(native.restart).toHaveBeenCalled();
  });

  it('is ready at once when the same version is already staged', async () => {
    const state = await setup({
      info: {pendingVersion: '1.2.0'},
    }).service.check();
    expect(state).toMatchObject({phase: 'ready', kind: 'bundle'});
  });

  it('goes back to the offer when a download is cancelled', async () => {
    const {service, native} = setup();
    await service.check();
    native.downloadBundle = jest.fn(async () => {
      throw Object.assign(new Error('x'), {
        code: 'E_CANCELLED',
        message: 'The update was cancelled.',
      });
    });
    expect((await service.download()).phase).toBe('available');
  });

  it('retries a failed download without asking GitHub again', async () => {
    const {service, native, fetchImpl} = setup();
    await service.check();
    native.downloadBundle = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('x'), {
          code: 'E_NETWORK',
          message: 'The download stopped.',
        }),
      )
      .mockResolvedValueOnce(true);
    const failed = await service.download();
    expect(failed).toMatchObject({
      phase: 'error',
      message: 'The download stopped.',
    });
    expect((await service.retry()).phase).toBe('ready');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not start a check while downloading', async () => {
    const {service, native, fetchImpl} = setup();
    await service.check();
    let finish: (value: boolean) => void = () => undefined;
    native.downloadBundle = jest.fn(
      () => new Promise<boolean>(resolve => (finish = resolve)),
    );
    const pending = service.download();
    await service.check();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    finish(true);
    await pending;
  });
});

describe('manifest fields', () => {
  const read = (data: unknown) =>
    readVerifiedManifest(JSON.stringify(data), {
      product: UPDATE_CONFIG.product,
    });

  it('keeps title, notes, CPU types and signer', () => {
    const parsed = read(manifest());
    expect(parsed.title).toBe('LAFINA v1.2.0 — Smoother updates');
    expect(parsed.apk).toMatchObject({
      abis: ['arm64-v8a'],
      signerSha256: SIGNER,
    });
  });

  it('cuts very long notes and drops blank ones', () => {
    expect(read(manifest({notes: 'x'.repeat(20_000)})).notes).toHaveLength(
      12_000,
    );
    expect(read(manifest({notes: '   '})).notes).toBeUndefined();
  });

  it('refuses malformed CPU types or signer', () => {
    expect(() => read(manifest({apk: {...manifest().apk, abis: []}}))).toThrow(
      'invalid app package',
    );
    expect(() =>
      read(manifest({apk: {...manifest().apk, abis: ['ARM 64!']}})),
    ).toThrow('invalid app package');
    expect(() =>
      read(manifest({apk: {...manifest().apk, signerSha256: 'nothex'}})),
    ).toThrow('invalid app package');
  });
});
