/**
 * The update sheet and its automatic offers (AppUpdatePrompt, UpdateSheet,
 * Profile's AppUpdateItem). Fakes stand in for GitHub and the native updater:
 * no download, restart or Android install is claimed by these tests.
 */
import React from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { initDatabase } from '../../src/storage';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { APP_VERSION } from '../../src/appVersion';
import { createUpdateService } from '../../src/updates/updateService';
import type { NativeUpdater, UpdaterInfo } from '../../src/updates/nativeUpdater';
import { EMPTY_MEMORY, SNOOZE_MS } from '../../src/updates/updatePrompt';
import { AppUpdatePrompt } from '../../src/ui/components/updates/AppUpdatePrompt';
import { loadUpdateMemory, saveUpdateMemory } from '../../src/ui/components/updates/updateMemory';
import { AppUpdateItem } from '../../src/ui/components/profile/AppUpdateItem';

const NEXT = '9.0.0';

const manifest = (nativeVersionCode = 7) => ({
  schema: 1,
  product: 'com.lafina.capstone',
  version: NEXT,
  platform: 'android',
  nativeVersionCode,
  file: `lafina-android-bundle-${NEXT}.zip`,
  size: 3 * 1024 * 1024,
  sha256: 'c'.repeat(64),
  signedAt: '2026-11-23T00:00:00.000Z',
  title: `LAFINA v${NEXT} — Calmer reminders`,
  notes: '## What is new\n- **Quieter** alarms',
  apk: {
    file: `LAFINA-v${NEXT}-arm64-v8a.apk`,
    size: 140 * 1024 * 1024,
    sha256: 'd'.repeat(64),
    versionCode: nativeVersionCode,
    abis: ['arm64-v8a'],
    signerSha256: 'a'.repeat(64),
  },
});

const makeService = (options: { nativeVersionCode?: number; canInstall?: boolean } = {}) => {
  const info: UpdaterInfo = {
    nativeVersionCode: 7,
    nativeVersionName: APP_VERSION,
    isDebug: false,
    updatesEnabled: true,
    runningVersion: null,
    pendingVersion: null,
    rejectedVersions: [],
    signerSha256: ['a'.repeat(64)],
    supportedAbis: ['arm64-v8a'],
  };
  let canInstall = options.canInstall ?? true;
  const native = {
    updatesEnabled: true,
    buildType: 'release',
    getInfo: jest.fn(async () => info),
    verifyManifest: jest.fn(async (payload: string) => Buffer.from(payload, 'base64').toString('utf8')),
    downloadBundle: jest.fn(async () => true),
    downloadApk: jest.fn(async () => true),
    installApk: jest.fn(async () => true),
    canInstallApks: jest.fn(async () => canInstall),
    openInstallPermissionSettings: jest.fn(async () => true),
    cancelDownload: jest.fn(),
    markLaunchSuccessful: jest.fn(async () => true),
    restart: jest.fn(async () => true),
    onProgress: jest.fn(() => ({ remove: jest.fn() })),
    onInstallStatus: jest.fn(() => ({ remove: jest.fn() })),
  } satisfies NativeUpdater;
  const body = JSON.stringify({
    payload: Buffer.from(JSON.stringify(manifest(options.nativeVersionCode))).toString('base64'),
    signature: 'Z29vZA==',
  });
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, text: async () => body }) as unknown as Response);
  const service = createUpdateService({
    native,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    currentVersion: APP_VERSION,
  });
  return { service, native, fetchImpl, allowInstall: () => (canInstall = true) };
};

const network = (type: 'wifi' | 'cellular') =>
  (NetInfo.fetch as jest.Mock).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
    type,
    details: { isConnectionExpensive: type === 'cellular' },
  });

let appStateListeners: Array<(state: AppStateStatus) => void> = [];

const themed = (node: React.ReactElement) => <ThemeProvider userId={null}>{node}</ThemeProvider>;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  saveUpdateMemory({ ...EMPTY_MEMORY, lastSeenVersion: APP_VERSION });
  network('cellular');
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateListeners.push(handler as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('automatic update offers', () => {
  it('checks on start and offers an update with its notes; Later hides it for a day', async () => {
    const { service, fetchImpl } = makeService();
    const view = render(themed(<AppUpdatePrompt suppressed={false} service={service} />));
    expect(await screen.findByText(`LAFINA ${NEXT} is available`)).toBeTruthy();
    expect(screen.getByText('Calmer reminders')).toBeTruthy();
    expect(screen.getByText('Quieter')).toBeTruthy();
    expect(screen.getByText(/You're on mobile data — this download is 3 MB/)).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('update-sheet-later'));
    expect(screen.queryByTestId('update-sheet')).toBeNull();
    const memory = loadUpdateMemory();
    expect(memory.snoozedVersion).toBe(NEXT);
    expect(memory.snoozedUntil! - Date.now()).toBeGreaterThan(SNOOZE_MS - 60_000);
    view.unmount();

    // Next start: still checked, not offered again while snoozed.
    const again = makeService();
    render(themed(<AppUpdatePrompt suppressed={false} service={again.service} />));
    await waitFor(() => expect(again.fetchImpl).toHaveBeenCalled());
    await waitFor(() => expect(again.service.getState().phase).toBe('available'));
    expect(again.service.getState()).toMatchObject({ version: NEXT });
    expect(screen.queryByTestId('update-sheet')).toBeNull();
  });

  it('waits for a call or the walkthrough to end before offering', async () => {
    const { service } = makeService();
    const view = render(themed(<AppUpdatePrompt suppressed service={service} />));
    await waitFor(() => expect(service.getState().phase).toBe('available'));
    expect(screen.queryByTestId('update-sheet')).toBeNull();
    view.rerender(themed(<AppUpdatePrompt suppressed={false} service={service} />));
    expect(await screen.findByTestId('update-sheet')).toBeTruthy();
  });

  it('downloads by itself on Wi-Fi, keeps the notes, and offers a restart', async () => {
    network('wifi');
    const { service, native } = makeService();
    render(themed(<AppUpdatePrompt suppressed={false} service={service} />));
    expect(await screen.findByText(`LAFINA ${NEXT} is ready`)).toBeTruthy();
    expect(native.downloadBundle).toHaveBeenCalledTimes(1);
    expect(loadUpdateMemory().whatsNew).toMatchObject({ version: NEXT, notes: expect.stringContaining('Quieter') });
    fireEvent.press(screen.getByTestId('update-sheet-restart'));
    await waitFor(() => expect(native.restart).toHaveBeenCalled());
  });

  it('"Update now" downloads and restarts in one go', async () => {
    const { service, native } = makeService();
    render(themed(<AppUpdatePrompt suppressed={false} service={service} />));
    fireEvent.press(await screen.findByTestId('update-sheet-update'));
    await waitFor(() => expect(native.restart).toHaveBeenCalled());
    expect(native.downloadBundle).toHaveBeenCalledTimes(1);
  });

  it('asks for the install permission and installs on return from settings', async () => {
    const { service, native, allowInstall } = makeService({ nativeVersionCode: 8, canInstall: false });
    render(themed(<AppUpdatePrompt suppressed={false} service={service} />));
    fireEvent.press(await screen.findByTestId('update-sheet-update'));
    expect(await screen.findByTestId('update-sheet-permission')).toBeTruthy();
    expect(native.installApk).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('update-sheet-permission'));
    expect(native.openInstallPermissionSettings).toHaveBeenCalled();
    allowInstall();
    await act(async () => {
      appStateListeners.forEach((listener) => listener('active'));
    });
    await waitFor(() =>
      expect(native.installApk).toHaveBeenCalledWith({
        versionCode: 8,
        sha256: 'd'.repeat(64),
        versionName: NEXT,
      }),
    );
  });

  it("shows What's new once after an update", async () => {
    saveUpdateMemory({
      ...EMPTY_MEMORY,
      lastSeenVersion: '0.0.1',
      whatsNew: { version: APP_VERSION, title: `LAFINA v${APP_VERSION} — Fresh`, notes: '- **New** sheet' },
    });
    const { service } = makeService();
    jest.spyOn(service, 'check').mockResolvedValue(service.getState());
    const view = render(themed(<AppUpdatePrompt suppressed={false} service={service} />));
    expect(await screen.findByText(`LAFINA ${APP_VERSION} is installed`)).toBeTruthy();
    expect(screen.getByText('Fresh')).toBeTruthy();
    fireEvent.press(screen.getByTestId('update-sheet-done'));
    expect(loadUpdateMemory()).toMatchObject({ lastSeenVersion: APP_VERSION, whatsNew: null });
    view.unmount();

    render(themed(<AppUpdatePrompt suppressed={false} service={service} />));
    await act(async () => undefined);
    expect(screen.queryByText(`LAFINA ${APP_VERSION} is installed`)).toBeNull();
  });
});

describe('Profile > Check for updates', () => {
  it('opens the sheet through the mounted prompt', async () => {
    const { service } = makeService();
    jest.spyOn(service, 'check').mockResolvedValue(service.getState());
    render(
      themed(
        <>
          <AppUpdatePrompt suppressed={false} service={service} />
          <AppUpdateItem service={service} />
        </>,
      ),
    );
    expect(screen.getByText('Check for updates')).toBeTruthy();
    fireEvent.press(screen.getByTestId('app-update-item'));
    expect(await screen.findByTestId('update-sheet')).toBeTruthy();
  });

  it('checks in place when no sheet is mounted, and shows the result', async () => {
    const { service } = makeService();
    render(themed(<AppUpdateItem service={service} openSheet={() => false} />));
    fireEvent.press(screen.getByTestId('app-update-item'));
    expect(await screen.findByText(`Update to ${NEXT}`)).toBeTruthy();
  });
});
