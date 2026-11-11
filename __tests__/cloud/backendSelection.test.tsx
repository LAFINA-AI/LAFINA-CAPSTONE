/**
 * Debug server switch: debug and test builds can point the app at the Vercel
 * backend or a backend on the developer's computer from Profile. Release
 * builds (no native flag) never show it and ignore a saved choice. Jest only;
 * the emulator check is in the Phase 09 backend-switch report.
 */
import React from 'react';
import {Alert, NativeModules} from 'react-native';
import type {AlertButton} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {
  CLOUD_API_BASE_URL,
  LOCAL_API_BASE_URL,
  cloudClient,
} from '../../src/cloud/cloudClient';
import {
  BACKEND_CHOICE_KEY,
  LOCAL_BACKEND_URL_KEY,
  validLocalBackendUrl,
  DEVICE_SETTINGS_OWNER,
  backendSelection,
} from '../../src/cloud/backendSelection';
import {ServerSwitchItem} from '../../src/ui/components/profile/ServerSwitchItem';
import {developerTestService} from '../../src/ui/components/profile/developerTestService';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

const native = NativeModules as {CapstoneBuild?: Record<string, unknown>};
const originalBuild = native.CapstoneBuild;
const setSwitchBuilt = (enabled: boolean) => {
  native.CapstoneBuild = {
    ...(originalBuild ?? {}),
    backendSwitchEnabled: enabled,
  };
};

const savedChoice = () =>
  localSettingsStore.get(DEVICE_SETTINGS_OWNER, BACKEND_CHOICE_KEY);

const clearSavedChoice = () => {
  db.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [
    DEVICE_SETTINGS_OWNER,
    BACKEND_CHOICE_KEY,
  ]);
};

/** Taps the alert button with this label from the latest Alert.alert call. */
const tapAlertButton = (spy: jest.SpyInstance, label: string) => {
  const buttons = spy.mock.calls.at(-1)?.[2] as AlertButton[] | undefined;
  const button = buttons?.find(candidate => candidate.text === label);
  if (!button?.onPress) throw new Error(`No "${label}" button`);
  button.onPress();
};

beforeAll(async () => {
  await initDatabase();
});

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  clearSavedChoice();
  cloudClient.resetBaseUrls();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  alertSpy.mockRestore();
  native.CapstoneBuild = originalBuild;
  cloudClient.resetBaseUrls();
});

describe('a release build (no switch compiled in)', () => {
  beforeEach(() => setSwitchBuilt(false));

  it('ignores a saved choice and refuses to switch', () => {
    localSettingsStore.set(DEVICE_SETTINGS_OWNER, BACKEND_CHOICE_KEY, 'local');
    expect(backendSelection.isAvailable()).toBe(false);
    expect(backendSelection.applySaved()).toBeNull();
    expect(backendSelection.select('local')).toEqual({
      switched: false,
      saved: false,
    });
    expect(cloudClient.getBaseUrl()).toBe(CLOUD_API_BASE_URL);
  });

  it('does not show the setting in Profile', () => {
    const guest = userStore.createGuestUser();
    const screen = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Server (debug)')).toBeNull();
    expect(screen.queryByText('Developer')).toBeNull();
    screen.unmount();
  });
});

describe('a debug or test build', () => {
  beforeEach(() => setSwitchBuilt(true));

  it('switches, remembers the choice and restores it on the next launch', () => {
    expect(backendSelection.current()).toBe('vercel');
    expect(backendSelection.select('local')).toEqual({
      switched: true,
      saved: true,
    });
    expect(cloudClient.getBaseUrl()).toBe(LOCAL_API_BASE_URL);
    expect(savedChoice()).toBe('local');

    cloudClient.resetBaseUrls(); // a new launch starts from the build default
    expect(backendSelection.applySaved()).toBe('local');
    expect(backendSelection.current()).toBe('local');

    backendSelection.select('vercel');
    cloudClient.resetBaseUrls();
    expect(backendSelection.applySaved()).toBe('vercel');
    expect(cloudClient.getBaseUrl()).toBe(CLOUD_API_BASE_URL);
  });

  it('keeps the build default when nothing or something unknown is saved', () => {
    expect(backendSelection.applySaved()).toBeNull();
    localSettingsStore.set(
      DEVICE_SETTINGS_OWNER,
      BACKEND_CHOICE_KEY,
      'https://evil.example',
    );
    expect(backendSelection.applySaved()).toBeNull();
    expect(cloudClient.getBaseUrl()).toBe(CLOUD_API_BASE_URL);
  });

  it('reports any other server as custom', () => {
    cloudClient.setBaseUrl('http://10.0.2.2:9000');
    expect(backendSelection.current()).toBeNull();
  });

  it('hides Developer in Profile until developer mode is enabled', () => {
    const guest = userStore.createGuestUser();
    const screen = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Developer')).toBeNull();
    expect(screen.queryByText('Server (debug)')).toBeNull();
    screen.unmount();
  });

  it('shows the setting in Profile with the current server', () => {
    developerTestService.setDeveloperModeEnabled(true);
    try {
      const guest = userStore.createGuestUser();
      const screen = render(
        <ThemeProvider userId={guest.id}>
          <ProfileScreen
            userId={guest.id}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );
      expect(screen.getByText('Developer')).toBeTruthy();
      expect(screen.getByText('Server (debug)')).toBeTruthy();
      expect(screen.getByText('Vercel')).toBeTruthy();
      screen.unmount();
    } finally {
      developerTestService.setDeveloperModeEnabled(false);
    }
  });

  it('switches a guest without signing out', async () => {
    const endSession = jest.fn(async () => undefined);
    const onSessionEnded = jest.fn();
    const screen = render(
      <ThemeProvider userId="guest-switch">
        <ServerSwitchItem
          isGuest
          endSession={endSession}
          onSessionEnded={onSessionEnded}
        />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByText('Server (debug)'));
    expect(alertSpy.mock.calls.at(-1)?.[0]).toBe('Server (debug build)');
    const offered = (alertSpy.mock.calls.at(-1)?.[2] as AlertButton[]).map(
      b => b.text,
    );
    expect(offered).toEqual(['Cancel', 'Set local Wi-Fi address', 'Use Local']);

    await act(async () => {
      tapAlertButton(alertSpy, 'Use Local');
    });

    expect(endSession).not.toHaveBeenCalled();
    expect(onSessionEnded).not.toHaveBeenCalled();
    expect(cloudClient.getBaseUrl()).toBe(LOCAL_API_BASE_URL);
    expect(alertSpy.mock.calls.at(-1)?.[0]).toBe('Server changed');
    expect(screen.getByText('Local')).toBeTruthy();
    screen.unmount();
  });

  it('signs a student out at the old server before switching', async () => {
    const serverAtSignOut: string[] = [];
    const endSession = jest.fn(async () => {
      serverAtSignOut.push(cloudClient.getBaseUrl());
    });
    const onSessionEnded = jest.fn();
    const screen = render(
      <ThemeProvider userId="student-switch">
        <ServerSwitchItem
          isGuest={false}
          endSession={endSession}
          onSessionEnded={onSessionEnded}
        />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByText('Server (debug)'));
    expect(String(alertSpy.mock.calls.at(-1)?.[1])).toContain(
      'Switching signs you out',
    );
    await act(async () => {
      tapAlertButton(alertSpy, 'Use Local');
    });

    expect(serverAtSignOut).toEqual([CLOUD_API_BASE_URL]);
    expect(cloudClient.getBaseUrl()).toBe(LOCAL_API_BASE_URL);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(String(alertSpy.mock.calls.at(-1)?.[1])).toContain('Sign in again');
    screen.unmount();
  });

  it('still switches when signing out at the old server fails', async () => {
    const endSession = jest.fn(async () => {
      throw new Error('offline');
    });
    const onSessionEnded = jest.fn();
    const screen = render(
      <ThemeProvider userId="student-switch-offline">
        <ServerSwitchItem
          isGuest={false}
          endSession={endSession}
          onSessionEnded={onSessionEnded}
        />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByText('Server (debug)'));
    await act(async () => {
      tapAlertButton(alertSpy, 'Use Local');
    });
    expect(cloudClient.getBaseUrl()).toBe(LOCAL_API_BASE_URL);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it('cancel changes nothing', () => {
    const screen = render(
      <ThemeProvider userId="cancel-switch">
        <ServerSwitchItem
          isGuest
          endSession={jest.fn()}
          onSessionEnded={jest.fn()}
        />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByText('Server (debug)'));
    const cancel = (alertSpy.mock.calls.at(-1)?.[2] as AlertButton[])[0];
    expect(cancel.style).toBe('cancel');
    expect(cancel.onPress).toBeUndefined();
    expect(cloudClient.getBaseUrl()).toBe(CLOUD_API_BASE_URL);
    expect(savedChoice()).toBeNull();
    screen.unmount();
  });
});

test('persists a private Wi-Fi endpoint and restores it after restart', () => {
  setSwitchBuilt(true);
  try {
    expect(backendSelection.saveLocalUrl('http://192.168.100.46:8000')).toBe(
      true,
    );
    expect(backendSelection.select('local').switched).toBe(true);
    expect(cloudClient.getBaseUrl()).toBe('http://192.168.100.46:8000');
    cloudClient.resetBaseUrls();
    backendSelection.applySaved();
    expect(cloudClient.getBaseUrl()).toBe('http://192.168.100.46:8000');
  } finally {
    db.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [
      DEVICE_SETTINGS_OWNER,
      LOCAL_BACKEND_URL_KEY,
    ]);
  }
});
test.each([
  'http://example.com:8000',
  'http://192.168.999.1:8000',
  'http://192.168.1.1:99999',
  'http://user:password@192.168.1.1:8000',
  'http://8.8.8.8:8000',
])('rejects unsafe local address %s', url =>
  expect(validLocalBackendUrl(url)).toBe(false),
);
