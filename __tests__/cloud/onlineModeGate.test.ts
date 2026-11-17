/**
 * Floating LAFINA FLOAT-01 (J-06): Quick Chat's Online Mode follows the Chat
 * tab's rule (opt-in setting, connection, account authorization) and never
 * changes the setting.
 */
import NetInfo from '@react-native-community/netinfo';
import {GUEST_USER_ID} from '../../src/constants';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {resolveOnlineMode} from '../../src/cloud/onlineModeGate';
import {localSettingsStore} from '../../src/storage/localSettingsStore';

const USER = 'online-gate-owner';
const fetchMock = NetInfo.fetch as jest.Mock;

let setting: string | null = 'true';

beforeEach(() => {
  setting = 'true';
  jest
    .spyOn(localSettingsStore, 'get')
    .mockImplementation((_user, key) =>
      key === 'chat.onlineMode' ? setting : null,
    );
  jest.spyOn(localSettingsStore, 'set').mockReturnValue(true);
  fetchMock.mockResolvedValue({isConnected: true, isInternetReachable: true});
  jest
    .spyOn(accountLinkService, 'authorizeOnlineMode')
    .mockResolvedValue({status: 'success', message: 'ok'});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('opted in, connected and authorized: on', async () => {
  await expect(resolveOnlineMode(USER)).resolves.toEqual({
    enabled: true,
    reason: 'on',
  });
  expect(localSettingsStore.set).not.toHaveBeenCalled();
});

test('no owner or the guest: auth_required, without asking the server', async () => {
  await expect(resolveOnlineMode(null)).resolves.toMatchObject({
    enabled: false,
    reason: 'auth_required',
  });
  await expect(resolveOnlineMode(GUEST_USER_ID)).resolves.toMatchObject({
    enabled: false,
    reason: 'auth_required',
  });
  expect(accountLinkService.authorizeOnlineMode).not.toHaveBeenCalled();
});

test.each([['false'], [null]])(
  'setting %p: setting_off, connectivity alone never turns it on',
  async value => {
    setting = value;
    await expect(resolveOnlineMode(USER)).resolves.toMatchObject({
      enabled: false,
      reason: 'setting_off',
    });
    expect(accountLinkService.authorizeOnlineMode).not.toHaveBeenCalled();
  },
);

test.each([
  [{isConnected: false, isInternetReachable: false}],
  [{isConnected: true, isInternetReachable: false}],
  [null],
])('no usable connection %j: offline', async state => {
  fetchMock.mockResolvedValue(state);
  await expect(resolveOnlineMode(USER)).resolves.toMatchObject({
    enabled: false,
    reason: 'offline',
  });
  expect(accountLinkService.authorizeOnlineMode).not.toHaveBeenCalled();
});

test('reachability unknown counts as connected (same as Chat)', async () => {
  fetchMock.mockResolvedValue({isConnected: true, isInternetReachable: null});
  await expect(resolveOnlineMode(USER)).resolves.toMatchObject({enabled: true});
});

test('NetInfo failure: offline', async () => {
  fetchMock.mockRejectedValue(new Error('netinfo'));
  await expect(resolveOnlineMode(USER)).resolves.toMatchObject({
    reason: 'offline',
  });
});

test('server refusal keeps its message; a throw is unavailable', async () => {
  (accountLinkService.authorizeOnlineMode as jest.Mock).mockResolvedValueOnce({
    status: 'auth_required',
    message: 'Sign in again.',
  });
  await expect(resolveOnlineMode(USER)).resolves.toEqual({
    enabled: false,
    reason: 'auth_required',
    message: 'Sign in again.',
  });

  (accountLinkService.authorizeOnlineMode as jest.Mock).mockRejectedValueOnce(
    new Error('down'),
  );
  await expect(resolveOnlineMode(USER)).resolves.toMatchObject({
    enabled: false,
    reason: 'unavailable',
  });
});
