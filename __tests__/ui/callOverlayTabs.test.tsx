/**
 * The full-screen Call LAFINA covers every tab (2026-11-22). While it is
 * open no tab is active underneath, so a saved call turn does not reload
 * Chat behind the call; closing or minimizing it makes the tab active again.
 */
import React from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type {ReactTestInstance} from 'react-test-renderer';
import App from '../../App';
import {db, initDatabase, userStore} from '../../src/storage';
import {quickChatPresence} from '../../src/ui/quickChat/quickChatPresence';

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() =>
    jest.requireActual('../fixtures/sqliteFile').openSqliteFile(':memory:'),
  ),
}));

/** The tab's own boundary: the nearest ancestor that says if it is hidden. */
const tabHidden = (node: ReactTestInstance): boolean | undefined => {
  let current: ReactTestInstance | null = node;
  while (current) {
    if (typeof current.props?.accessibilityElementsHidden === 'boolean')
      return current.props.accessibilityElementsHidden;
    current = current.parent;
  }
  return undefined;
};

const chatHidden = () =>
  tabHidden(
    screen.getByTestId('chat-screen-container', {includeHiddenElements: true}),
  );

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(
      (_type, _handler: (state: AppStateStatus) => void) =>
        ({remove: () => undefined} as unknown as ReturnType<
          typeof AppState.addEventListener
        >),
    );
  quickChatPresence.resetForTests();
  db.reopen();
  await initDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('Chat is not active under the full-screen call, and is again after', async () => {
  const guest = userStore.createGuestUser();
  userStore.setCurrentUser(guest.id);
  userStore.markOnboardingComplete(guest.id);
  render(<App />);

  const chatTab = await screen.findByTestId(
    'modern-tab-chat',
    {},
    {timeout: 10000},
  );
  fireEvent.press(chatTab);
  await waitFor(() => expect(chatHidden()).toBe(false), {timeout: 10000});

  // Chat may open the call by itself (the "start with Call LAFINA" setting).
  if (!screen.queryByTestId('call-lafina-screen')) {
    fireEvent.press(
      await screen.findByTestId('chat-call-lafina-button', {}, {timeout: 5000}),
    );
  }
  await screen.findByTestId('call-lafina-screen');
  await waitFor(() => expect(chatHidden()).toBe(true));

  // No live call: minimizing closes the call screen; Chat is active again.
  await act(async () => {
    fireEvent.press(screen.getByTestId('call-minimize-button'));
  });
  await waitFor(() =>
    expect(screen.queryByTestId('call-lafina-screen')).toBeNull(),
  );
  await waitFor(() => expect(chatHidden()).toBe(false));
}, 30000);
