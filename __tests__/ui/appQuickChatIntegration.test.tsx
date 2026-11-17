/**
 * Floating LAFINA (J-17, FLOAT-03): the main `App` root and Quick Chat.
 * - While Quick Chat is the visible screen, returning to "active" does not
 *   start the foreground reminder poller or take the pending native call
 *   (ADR-036 Decision 6, risk R-03, FLOAT-00 Spike D).
 * - The hidden main screen's refresh waits until the Quick Chat panel has
 *   appeared, and is dropped if Quick Chat closes first.
 * - A data change confirmed in Quick Chat refreshes the student's data.
 * - A navigation request is consumed once Quick Chat has left the front,
 *   only for the current student.
 */
import React from 'react';
import {
  AppState,
  DeviceEventEmitter,
  NativeModules,
  type AppStateStatus,
} from 'react-native';
import {act, render, screen, waitFor} from '@testing-library/react-native';
import App from '../../App';
import {db, initDatabase, userStore} from '../../src/storage';
import {QUICK_CHAT_DATA_CHANGED_EVENT} from '../../src/ai/quickChat/quickChatController';
import {quickChatPresence} from '../../src/ui/quickChat/quickChatPresence';

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() =>
    jest.requireActual('../fixtures/sqliteFile').openSqliteFile(':memory:'),
  ),
}));

const native = NativeModules as Record<string, any>;
let listeners: Array<(state: AppStateStatus) => void> = [];
let logSpy: jest.SpyInstance;

const pollerStarts = (userId: string): number =>
  logSpy.mock.calls.filter(
    call => call[0] === `[ReminderPoller] Poller started for user ${userId}`,
  ).length;

const becomeActive = async () => {
  await act(async () => {
    listeners.slice().forEach(listener => listener('active'));
    await Promise.resolve();
  });
};

const startApp = async (): Promise<string> => {
  const guest = userStore.createGuestUser();
  userStore.setCurrentUser(guest.id);
  userStore.markOnboardingComplete(guest.id);
  render(<App />);
  // The userId effect starts the poller once startup has found the student.
  await waitFor(() => expect(pollerStarts(guest.id)).toBeGreaterThan(0), {
    timeout: 10000,
  });
  return guest.id;
};

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  listeners = [];
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, handler) => {
      listeners.push(handler as (state: AppStateStatus) => void);
      return {
        remove: () => {
          listeners = listeners.filter(item => item !== handler);
        },
      } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  quickChatPresence.resetForTests();
  db.reopen();
  await initDatabase();
  native.LafinaReminder.consumePendingCall.mockClear();
});

afterEach(() => {
  quickChatPresence.resetForTests();
  jest.restoreAllMocks();
});

test('Quick Chat in front: no foreground poller and no native call taken; main in front: both', async () => {
  const userId = await startApp();
  const startsBefore = pollerStarts(userId);
  native.LafinaReminder.consumePendingCall.mockClear();

  quickChatPresence.setOpen(true);
  await becomeActive();
  expect(pollerStarts(userId)).toBe(startsBefore);
  expect(native.LafinaReminder.consumePendingCall).not.toHaveBeenCalled();

  quickChatPresence.setOpen(false);
  await becomeActive();
  expect(pollerStarts(userId)).toBe(startsBefore + 1);
  expect(native.LafinaReminder.consumePendingCall).toHaveBeenCalled();
}, 20000);

test('opening Quick Chat: the hidden main screen refreshes only after the panel appears', async () => {
  await startApp();
  native.LafinaReminder.getPermissionStatus.mockClear();
  native.LafinaReminder.consumePendingCall.mockClear();

  quickChatPresence.setOpen(true);
  await becomeActive();
  // Held: the panel has not appeared yet, so the JS thread is left to it.
  expect(native.LafinaReminder.getPermissionStatus).not.toHaveBeenCalled();

  await act(async () => {
    quickChatPresence.markPanelShown();
    await Promise.resolve();
  });
  expect(native.LafinaReminder.getPermissionStatus).toHaveBeenCalledTimes(1);
  // Still Quick Chat in front: the R-03 rule is unchanged.
  expect(native.LafinaReminder.consumePendingCall).not.toHaveBeenCalled();
}, 20000);

test('Quick Chat closed before its panel appeared: the held refresh is dropped', async () => {
  await startApp();
  native.LafinaReminder.getPermissionStatus.mockClear();

  quickChatPresence.setOpen(true);
  await becomeActive();
  act(() => quickChatPresence.setOpen(false));
  await act(async () => {
    quickChatPresence.markPanelShown();
    await Promise.resolve();
  });
  expect(native.LafinaReminder.getPermissionStatus).not.toHaveBeenCalled();

  // The main screen's own return to the front does the work.
  await becomeActive();
  expect(native.LafinaReminder.getPermissionStatus).toHaveBeenCalledTimes(1);
}, 20000);

test('data changed in Quick Chat refreshes only for the current student', async () => {
  const userId = await startApp();
  const invalidate = jest.spyOn(db, 'invalidateData');

  act(() => {
    DeviceEventEmitter.emit(QUICK_CHAT_DATA_CHANGED_EVENT, {
      ownerId: 'someone-else',
      reason: 'confirmed',
    });
  });
  expect(invalidate).not.toHaveBeenCalledWith(['alarms', 'reminders', 'tasks']);

  act(() => {
    DeviceEventEmitter.emit(QUICK_CHAT_DATA_CHANGED_EVENT, {
      ownerId: userId,
      reason: 'confirmed',
    });
  });
  expect(invalidate).toHaveBeenCalledWith(['alarms', 'reminders', 'tasks']);
}, 20000);

test('navigation waits for Quick Chat to leave, then opens only for the same student', async () => {
  const userId = await startApp();

  // Another owner's request is discarded, never shown.
  quickChatPresence.setOpen(true);
  quickChatPresence.requestNavigation({
    ownerId: 'someone-else',
    screen: 'notes',
  });
  expect(quickChatPresence.hasPendingNavigation()).toBe(true);
  act(() => quickChatPresence.setOpen(false));
  expect(quickChatPresence.hasPendingNavigation()).toBe(false);

  // The student's own request stays pending while Quick Chat is in front.
  act(() => quickChatPresence.setOpen(true));
  act(() =>
    quickChatPresence.requestNavigation({ownerId: userId, screen: 'notes'}),
  );
  expect(quickChatPresence.hasPendingNavigation()).toBe(true);

  act(() => quickChatPresence.setOpen(false));
  expect(quickChatPresence.hasPendingNavigation()).toBe(false);
  await waitFor(() =>
    expect(
      screen.getByTestId('modern-tab-notes').props.accessibilityState,
    ).toEqual(expect.objectContaining({selected: true})),
  );
}, 20000);
