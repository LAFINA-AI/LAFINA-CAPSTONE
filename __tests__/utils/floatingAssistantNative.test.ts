/**
 * Floating LAFINA FLOAT-01 (J-08): the native wrapper never throws and falls
 * back to a safe "unavailable" status when the module is missing or fails.
 */
import {NativeModules, Platform} from 'react-native';
import {
  DEFAULT_ORB_CUSTOMIZATION,
  UNAVAILABLE_STATUS,
  isValidOrbChange,
  normalizeOrbCustomization,
  floatingAssistantNative,
} from '../../src/utils/floatingAssistantNative';

const native = NativeModules as Record<string, unknown>;
const originalOS = Platform.OS;

const setOS = (os: string): void => {
  Object.defineProperty(Platform, 'OS', {value: os, configurable: true});
};

let warn: jest.SpyInstance;

beforeEach(() => {
  setOS('android');
  delete native.LafinaFloatingAssistant;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  delete native.LafinaFloatingAssistant;
  setOS(originalOS);
  warn.mockRestore();
});

test('missing module: unavailable status and false for every action', async () => {
  expect(floatingAssistantNative.isAvailable()).toBe(false);
  await expect(floatingAssistantNative.getStatus()).resolves.toEqual(
    UNAVAILABLE_STATUS,
  );
  await expect(
    floatingAssistantNative.setEnabled(true, 'owner'),
  ).resolves.toEqual(UNAVAILABLE_STATUS);
  await expect(floatingAssistantNative.openOverlaySettings()).resolves.toBe(
    false,
  );
  await expect(floatingAssistantNative.closeQuickChat()).resolves.toBe(false);
  await expect(floatingAssistantNative.openMainApp()).resolves.toBe(false);
  await expect(floatingAssistantNative.resetOrbPosition()).resolves.toBe(false);
});

test('not Android: the module is ignored even when present', async () => {
  setOS('ios');
  native.LafinaFloatingAssistant = {getStatus: jest.fn()};
  expect(floatingAssistantNative.isAvailable()).toBe(false);
  await expect(floatingAssistantNative.getStatus()).resolves.toEqual(
    UNAVAILABLE_STATUS,
  );
});

test('status keeps only strict booleans', async () => {
  native.LafinaFloatingAssistant = {
    getStatus: jest.fn().mockResolvedValue({
      supported: true,
      overlayGranted: 'yes',
      enabled: true,
      running: 1,
    }),
  };
  await expect(floatingAssistantNative.getStatus()).resolves.toEqual({
    ...UNAVAILABLE_STATUS,
    supported: true,
    enabled: true,
  });
});

test('a throwing getStatus or setEnabled falls back safely', async () => {
  const getStatus = jest
    .fn()
    .mockRejectedValueOnce(new Error('boom'))
    .mockResolvedValueOnce({supported: true});
  native.LafinaFloatingAssistant = {
    getStatus,
    setEnabled: jest.fn().mockRejectedValue(new Error('no')),
  };
  await expect(floatingAssistantNative.getStatus()).resolves.toEqual(
    UNAVAILABLE_STATUS,
  );
  await expect(
    floatingAssistantNative.setEnabled(true, 'owner'),
  ).resolves.toMatchObject({supported: true, enabled: false});
});

test('setEnabled passes the owner through', async () => {
  const setEnabled = jest
    .fn()
    .mockResolvedValue({supported: true, enabled: true, running: true});
  native.LafinaFloatingAssistant = {setEnabled};
  await expect(
    floatingAssistantNative.setEnabled(true, 'owner-1'),
  ).resolves.toMatchObject({enabled: true, running: true});
  expect(setEnabled).toHaveBeenCalledWith(true, 'owner-1');
});

test('void actions report success and failure without throwing', async () => {
  const closeQuickChat = jest.fn().mockResolvedValue(undefined);
  const openMainApp = jest.fn().mockRejectedValue(new Error('blocked'));
  native.LafinaFloatingAssistant = {closeQuickChat, openMainApp};
  await expect(floatingAssistantNative.closeQuickChat()).resolves.toBe(true);
  await expect(floatingAssistantNative.openMainApp()).resolves.toBe(false);
  expect(closeQuickChat).toHaveBeenCalledTimes(1);
});

test('orb colour is validated before it reaches native code', async () => {
  const setOrbAppearance = jest.fn().mockResolvedValue(undefined);
  native.LafinaFloatingAssistant = {setOrbAppearance};
  await expect(floatingAssistantNative.setOrbAppearance('red')).resolves.toBe(
    false,
  );
  await expect(
    floatingAssistantNative.setOrbAppearance('#12AB34'),
  ).resolves.toBe(true);
  expect(setOrbAppearance).toHaveBeenCalledTimes(1);
  expect(setOrbAppearance).toHaveBeenCalledWith({color: '#12AB34'});
});

describe('button look (owner request 2026-11-18)', () => {
  test('a missing module or a failure gives the defaults, never a crash', async () => {
    native.LafinaFloatingAssistant = {};
    await expect(
      floatingAssistantNative.getOrbCustomization(),
    ).resolves.toEqual(DEFAULT_ORB_CUSTOMIZATION);
    await expect(
      floatingAssistantNative.setOrbCustomization({size: 'small'}),
    ).resolves.toBeNull();
    native.LafinaFloatingAssistant = {
      getOrbCustomization: jest.fn().mockRejectedValue(new Error('gone')),
    };
    await expect(
      floatingAssistantNative.getOrbCustomization(),
    ).resolves.toEqual(DEFAULT_ORB_CUSTOMIZATION);
  });

  test('saved values are normalized field by field', () => {
    expect(
      normalizeOrbCustomization({
        style: 'bubble',
        size: 'huge',
        side: 'left',
        idleOpacity: 5,
        color: '#abcdef',
        tuckWhenIdle: 'yes',
        lockPosition: true,
      }),
    ).toEqual({
      ...DEFAULT_ORB_CUSTOMIZATION,
      style: 'bubble',
      side: 'left',
      color: '#ABCDEF',
      lockPosition: true,
    });
    expect(normalizeOrbCustomization(null)).toEqual(DEFAULT_ORB_CUSTOMIZATION);
  });

  test('invalid changes never reach native code', async () => {
    const setOrbCustomization = jest.fn().mockImplementation(async changes => ({
      ...DEFAULT_ORB_CUSTOMIZATION,
      ...changes,
    }));
    native.LafinaFloatingAssistant = {setOrbCustomization};
    for (const bad of [
      {style: 'square'},
      {idleOpacity: 0},
      {idleOpacity: 101},
      {color: 'red'},
      {color: '#12345678'},
      {side: 'top'},
      {lockPosition: 'true'},
      {unknown: 1},
    ]) {
      await expect(
        floatingAssistantNative.setOrbCustomization(bad as never),
      ).resolves.toBeNull();
    }
    expect(setOrbCustomization).not.toHaveBeenCalled();
    expect(isValidOrbChange({style: 'bubble', idleOpacity: 50})).toBe(true);
    await expect(
      floatingAssistantNative.setOrbCustomization({color: 'theme'}),
    ).resolves.toMatchObject({color: 'theme'});
    expect(setOrbCustomization).toHaveBeenCalledWith({color: 'theme'});
  });
});
