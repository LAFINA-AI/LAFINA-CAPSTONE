import {NativeModules} from 'react-native';
import {GUEST_USER_ID} from '../../src/constants';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {userStore} from '../../src/storage/userStore';
import {
  isProviderTestingEnabled,
  readInitialOnlineMode,
} from '../../src/cloud/providerTestDefaults';

const native = NativeModules as {CapstoneBuild?: Record<string, unknown>};
const original = native.CapstoneBuild;
beforeEach(() => {
  native.CapstoneBuild = {
    providerTestingEnabled: true,
    backendSwitchEnabled: true,
  };
  jest.spyOn(localSettingsStore, 'get').mockReturnValue(null);
  jest.spyOn(localSettingsStore, 'set').mockReturnValue(true);
  jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
    userId: 'test-owner',
    accessToken: 'synthetic',
    refreshToken: null,
  });
});
afterEach(() => {
  native.CapstoneBuild = original;
  jest.restoreAllMocks();
});

it.each([
  undefined,
  {},
  {providerTestingEnabled: true},
  {
    providerTestingEnabled: true,
    backendSwitchEnabled: false,
  },
])(
  'does not enable test defaults without both native build flags: %j',
  build => {
    native.CapstoneBuild = build;
    expect(isProviderTestingEnabled()).toBe(false);
    expect(readInitialOnlineMode('test-owner')).toBe(false);
    expect(localSettingsStore.set).not.toHaveBeenCalled();
  },
);

it('defaults a signed-in owner to Online Mode only in the opted-in APK', () => {
  expect(readInitialOnlineMode('test-owner')).toBe(true);
  expect(localSettingsStore.set).toHaveBeenCalledWith(
    'test-owner',
    'chat.onlineMode',
    'true',
  );
});

it.each(['false', 'true', 'unrecognized'])(
  'preserves an existing mode preference: %s',
  saved => {
    jest.mocked(localSettingsStore.get).mockReturnValue(saved);
    expect(readInitialOnlineMode('test-owner')).toBe(saved === 'true');
    expect(localSettingsStore.set).not.toHaveBeenCalled();
  },
);

it.each([GUEST_USER_ID, 'another-owner'])(
  'keeps guest and other accounts offline: %s',
  owner => {
    expect(readInitialOnlineMode(owner)).toBe(false);
    expect(localSettingsStore.set).not.toHaveBeenCalled();
  },
);

it('keeps manual/offline mode when auth is unavailable or saving fails', () => {
  jest.mocked(userStore.getActiveSessionToken).mockImplementationOnce(() => {
    throw new Error('locked');
  });
  expect(readInitialOnlineMode('test-owner')).toBe(false);
  jest.mocked(localSettingsStore.set).mockReturnValue(false);
  expect(readInitialOnlineMode('test-owner')).toBe(false);
});
