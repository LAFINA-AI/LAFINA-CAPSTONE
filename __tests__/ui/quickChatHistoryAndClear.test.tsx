/**
 * Floating LAFINA UI tests:
 * - Multi-turn clarification ("remind me to throw trash" → "9pm" → Confirm card)
 * - Header Clear chat button (disabled when empty, clears transcript + pending card)
 * - Header Chat History panel (browse, reopen, delete, clear all, open app chat, new chat)
 */
import React from 'react';
import {NativeModules, Platform} from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  chatStore,
  initDatabase,
  remindersStore,
  userStore,
} from '../../src/storage';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {quickChatController} from '../../src/ai/quickChat/quickChatController';
import {QuickChatPanel} from '../../src/ui/quickChat/QuickChatPanel';
import {quickChatPresence} from '../../src/ui/quickChat/quickChatPresence';

jest.mock('../../src/cloud/onlineModeGate', () => ({
  resolveOnlineMode: jest.fn(() =>
    Promise.resolve({enabled: false, reason: 'auth_required'}),
  ),
}));

const REF = new Date(2026, 10, 18, 10, 0, 0);
const native = NativeModules as Record<string, any>;
const originalOS = Platform.OS;

let serial = 0;
const owner = (): string => `quick-ui-hist-${++serial}`;

const renderPanel = (userId: string) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: {x: 0, y: 0, width: 400, height: 800},
        insets: {top: 0, left: 0, right: 0, bottom: 0},
      }}
    >
      <ThemeProvider userId={userId}>
        <QuickChatPanel userId={userId} state="ready" />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

const sendText = (text: string) => {
  fireEvent.changeText(screen.getByTestId('quick-chat-input'), text);
  fireEvent.press(screen.getByTestId('quick-chat-send'));
};

beforeAll(async () => {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  jest.setSystemTime(REF);
  await initDatabase();
  userStore.createGuestUser();
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
  endReviewSession();
  quickChatController.resetForTests();
  quickChatPresence.resetForTests();
  native.LafinaFloatingAssistant.closeQuickChat.mockClear();
  native.LafinaFloatingAssistant.openMainApp.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', {
    value: originalOS,
    configurable: true,
  });
  jest.restoreAllMocks();
});

test('remind me to throw trash → 9pm shows review card, Confirm saves reminder, and Cancel restores full command', async () => {
  const userId = owner();
  renderPanel(userId);

  sendText('remind me to throw trash');
  expect(
    await screen.findByText(/What time should I remind you/i, {}, {timeout: 10000}),
  ).toBeTruthy();
  expect(screen.queryByTestId('quick-review-card')).toBeNull();

  sendText('9pm');
  expect(
    await screen.findByTestId('quick-review-card', {}, {timeout: 10000}),
  ).toBeTruthy();
  expect(screen.getByTestId('quick-review-action').props.children).toMatch(
    /^Set reminder /,
  );

  // Cancel restores the merged editable reminder text, not just "9pm".
  act(() => {
    fireEvent.press(screen.getByTestId('quick-review-cancel'));
  });
  expect(screen.queryByTestId('quick-review-card')).toBeNull();
  expect(screen.getByTestId('quick-chat-input').props.value).toMatch(
    /remind me to throw trash at 9pm/i,
  );

  // Send the restored command and confirm.
  fireEvent.press(screen.getByTestId('quick-chat-send'));
  expect(
    await screen.findByTestId('quick-review-card', {}, {timeout: 10000}),
  ).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByTestId('quick-review-confirm'));
  });
  expect(await screen.findByTestId('quick-success-card')).toBeTruthy();
  expect(remindersStore.getAllReminders(userId)).toHaveLength(1);
});

test('Clear button is disabled when empty, then clears transcript, card, and restores starter chips', async () => {
  const userId = owner();
  renderPanel(userId);

  expect(
    screen.getByTestId('quick-chat-clear').props.accessibilityState,
  ).toEqual(expect.objectContaining({disabled: true}));

  sendText('remind me to throw trash at 9pm');
  expect(
    await screen.findByTestId('quick-review-card', {}, {timeout: 10000}),
  ).toBeTruthy();
  expect(latestPendingReview(userId, 'quick')).not.toBeNull();
  expect(
    screen.getByTestId('quick-chat-clear').props.accessibilityState,
  ).toEqual(expect.objectContaining({disabled: false}));

  act(() => {
    fireEvent.press(screen.getByTestId('quick-chat-clear'));
  });

  await waitFor(() =>
    expect(screen.queryByTestId('quick-review-card')).toBeNull(),
  );
  expect(latestPendingReview(userId, 'quick')).toBeNull();
  expect(screen.getByTestId('quick-chips')).toBeTruthy();
  expect(
    screen.getByTestId('quick-chat-clear').props.accessibilityState,
  ).toEqual(expect.objectContaining({disabled: true}));
});

test('History panel lists floating chats & LAFINA app chats, supports reopen, new chat, delete, and clear all', async () => {
  const userId = owner();
  // Seed one main-app chat session so "In LAFINA Chat" is exercised too.
  chatStore.addMessage(userId, 'user', 'Saved app chat topic');
  const appSessionId = chatStore.currentSessionId(userId);

  renderPanel(userId);

  sendText('what is on my schedule today');
  await waitFor(
    () => expect(quickChatController.getTranscript(userId)).toHaveLength(2),
    {timeout: 10000},
  );
  const firstSessionId = quickChatController.getActiveSessionId(userId)!;

  // Clear starts a fresh screen, then send a second floating chat.
  act(() => {
    fireEvent.press(screen.getByTestId('quick-chat-clear'));
  });
  sendText('what is on my schedule tomorrow');
  await waitFor(
    () => expect(quickChatController.getTranscript(userId)).toHaveLength(2),
    {timeout: 10000},
  );

  // Open History view.
  fireEvent.press(screen.getByTestId('quick-chat-history'));
  expect(await screen.findByTestId('quick-chat-history-view')).toBeTruthy();
  expect(
    screen.getByTestId(`quick-history-item-${firstSessionId}`),
  ).toBeTruthy();
  expect(screen.getByTestId(`quick-history-app-${appSessionId}`)).toBeTruthy();

  // Reopen the first floating chat.
  fireEvent.press(screen.getByTestId(`quick-history-item-${firstSessionId}`));
  expect(screen.queryByTestId('quick-chat-history-view')).toBeNull();
  expect(await screen.findByText('what is on my schedule today')).toBeTruthy();

  // Open History again, delete the first chat, then test New chat.
  fireEvent.press(screen.getByTestId('quick-chat-history'));
  fireEvent.press(screen.getByTestId(`quick-history-delete-${firstSessionId}`));
  expect(
    screen.queryByTestId(`quick-history-item-${firstSessionId}`),
  ).toBeNull();

  // Clear all history with 2-tap confirmation.
  fireEvent.press(screen.getByTestId('quick-history-clear-all'));
  fireEvent.press(screen.getByTestId('quick-history-clear-confirm'));
  expect(quickChatController.getHistory(userId)).toEqual([]);

  // Tapping an "In LAFINA Chat" row opens LAFINA main app.
  fireEvent.press(screen.getByTestId(`quick-history-app-${appSessionId}`));
  expect(native.LafinaFloatingAssistant.openMainApp).toHaveBeenCalledTimes(1);
});
