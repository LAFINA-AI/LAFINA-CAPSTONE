/**
 * Floating LAFINA (J-09, FLOAT-03): the Quick Chat root waits for storage,
 * then shows the panel only for a set-up student. No user → "Open LAFINA to
 * finish setting up"; storage problem → storage state; both without a
 * message box. Also: the presence flag follows the native visibility event
 * and the panel's mount, and Close / Open LAFINA go through the native module.
 */
import React from 'react';
import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {
  QUICK_CHAT_VISIBILITY_EVENT,
  QuickChatRoot,
} from '../../src/ui/quickChat/QuickChatRoot';
import {quickChatPresence} from '../../src/ui/quickChat/quickChatPresence';

jest.mock('../../src/cloud/onlineModeGate', () => ({
  resolveOnlineMode: jest.fn(() =>
    Promise.resolve({enabled: false, reason: 'auth_required'}),
  ),
}));

// The shared mock registers a Jest hook on open, which is not allowed mid-test.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() =>
    jest.requireActual('../fixtures/sqliteFile').openSqliteFile(':memory:'),
  ),
}));

const native = NativeModules as Record<string, any>;
const originalOS = Platform.OS;

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(async () => {
  Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  quickChatPresence.resetForTests();
  db.reopen();
  await initDatabase();
  native.LafinaFloatingAssistant.closeQuickChat.mockClear();
  native.LafinaFloatingAssistant.openMainApp.mockClear();
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: originalOS,
    configurable: true,
  });
  jest.restoreAllMocks();
});

test('no student set up → "open LAFINA" state, no composer', async () => {
  userStore.logout();
  render(<QuickChatRoot />);
  expect(
    await screen.findByTestId('quick-chat-state-no_user', {}, {timeout: 5000}),
  ).toBeTruthy();
  expect(screen.getByText('Open LAFINA to finish setting up.')).toBeTruthy();
  expect(screen.queryByTestId('quick-chat-input')).toBeNull();

  fireEvent.press(screen.getByTestId('quick-chat-state-open'));
  expect(native.LafinaFloatingAssistant.openMainApp).toHaveBeenCalledTimes(1);
  // No owner, so no navigation request is left behind.
  expect(quickChatPresence.hasPendingNavigation()).toBe(false);
});

test('a student still in onboarding counts as not set up', async () => {
  const guest = userStore.createGuestUser();
  userStore.setCurrentUser(guest.id);
  render(<QuickChatRoot />);
  expect(
    await screen.findByTestId('quick-chat-state-no_user', {}, {timeout: 5000}),
  ).toBeTruthy();
});

test('storage problem → storage state, no composer', async () => {
  db.requireRecovery('open_failed');
  render(<QuickChatRoot />);
  expect(
    await screen.findByTestId('quick-chat-state-storage', {}, {timeout: 5000}),
  ).toBeTruthy();
  expect(screen.getByText('LAFINA’s storage needs attention.')).toBeTruthy();
  expect(screen.queryByTestId('quick-chat-input')).toBeNull();
});

test('set-up student → panel with composer; Close and Open LAFINA', async () => {
  const guest = userStore.createGuestUser();
  userStore.setCurrentUser(guest.id);
  userStore.markOnboardingComplete(guest.id);
  render(<QuickChatRoot />);
  expect(
    await screen.findByTestId('quick-chat-input', {}, {timeout: 5000}),
  ).toBeTruthy();
  expect(screen.getByText('Quick Chat')).toBeTruthy();
  await settle();
  expect(screen.getByTestId('quick-chat-status-chip')).toBeTruthy();
  expect(screen.getByText('Offline')).toBeTruthy();

  fireEvent.press(screen.getByTestId('quick-chat-close'));
  expect(native.LafinaFloatingAssistant.closeQuickChat).toHaveBeenCalledTimes(
    1,
  );

  fireEvent.press(screen.getByTestId('quick-chat-open-lafina'));
  expect(native.LafinaFloatingAssistant.openMainApp).toHaveBeenCalledTimes(1);
  expect(quickChatPresence.consumeNavigation(guest.id)).toEqual({
    ownerId: guest.id,
    screen: 'chat',
  });
});

test('presence: open while mounted, follows the native visibility event', async () => {
  const view = render(<QuickChatRoot />);
  expect(quickChatPresence.isOpen()).toBe(true);
  await settle();

  act(() => {
    DeviceEventEmitter.emit(QUICK_CHAT_VISIBILITY_EVENT, {visible: false});
  });
  expect(quickChatPresence.isOpen()).toBe(false);
  act(() => {
    DeviceEventEmitter.emit(QUICK_CHAT_VISIBILITY_EVENT, {visible: true});
  });
  expect(quickChatPresence.isOpen()).toBe(true);
  await settle();

  view.unmount();
  expect(quickChatPresence.isOpen()).toBe(false);
});
