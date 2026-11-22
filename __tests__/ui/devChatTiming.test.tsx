/**
 * Developer Testing Hub (DEVTEST-01): Chat shows a timing line under a reply
 * only while Developer Mode and performance tracking are on, measures the
 * first drawn text and the final reply separately, and records no message
 * text. Jest render only: frame timing on a phone is NOT measured here.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {chatStore, db, initDatabase, userStore} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  chatTimingStore,
  refreshPerfTrackingCache,
  setPerfTrackingEnabled,
} from '../../src/ai/benchmark';
import {developerTestService} from '../../src/ui/components/profile/developerTestService';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {GUEST_USER_ID} from '../../src/constants';

beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  db.executeSync('DELETE FROM local_settings');
  refreshPerfTrackingCache();
  userStore.createGuestUser();
  chatStore.clearHistory(GUEST_USER_ID);
  chatTimingStore.clear();
});
afterEach(() => {
  jest.restoreAllMocks();
  developerTestService.setDeveloperModeEnabled(false);
  setPerfTrackingEnabled(false);
});

const streamedReply = () => {
  let finish: () => void = () => undefined;
  let grow: (text: string) => void = () => undefined;
  const spy = jest
    .spyOn(chatOrchestrator, 'processMessage')
    .mockImplementationOnce((owner, text, options) => {
      chatStore.addMessage(owner, 'user', text);
      options?.trace?.mark('userSaved');
      grow = partial => {
        options?.trace?.mark('firstContentReceived');
        options?.onReplyText?.(partial);
      };
      return new Promise(resolve => {
        finish = () => {
          options?.trace?.note({
            onlineAttempted: true,
            onlineUsed: true,
            streamed: true,
          });
          options?.trace?.mark('replyReady');
          const saved = chatStore.addMessage(
            owner,
            'assistant',
            'Hello there!',
          );
          resolve({
            reply: saved.content,
            assistantMessage: saved,
            intent: {intent: 'chat', source: 'fast_path'},
          } as never);
        };
      });
    });
  return {spy, finish: () => finish(), grow: (t: string) => grow(t)};
};

const renderChat = () =>
  render(
    <ThemeProvider userId={GUEST_USER_ID}>
      <ChatScreen userId={GUEST_USER_ID} />
    </ThemeProvider>,
  );

const send = async (utils: ReturnType<typeof renderChat>, text: string) => {
  fireEvent.changeText(utils.getByTestId('chat-text-input'), text);
  await act(async () => {
    fireEvent.press(utils.getByTestId('chat-send-button'));
  });
};

it('with timing off, Chat passes no trace and shows no timing line', async () => {
  const {spy, finish} = streamedReply();
  const utils = renderChat();
  await send(utils, 'hi');
  await act(async () => finish());
  expect(spy.mock.calls[0][2]?.trace ?? null).toBeNull();
  expect(chatTimingStore.list()).toHaveLength(0);
  expect(utils.queryByText(/⏱/)).toBeNull();
});

it('with timing on, the reply gets a timing line from its own trace', async () => {
  developerTestService.setDeveloperModeEnabled(true);
  setPerfTrackingEnabled(true);
  const {finish, grow} = streamedReply();
  const utils = renderChat();
  await send(utils, 'hi');
  act(() => grow('Hello'));
  await act(async () => finish());

  await waitFor(() => expect(chatTimingStore.list()).toHaveLength(1));
  const [entry] = chatTimingStore.list();
  const saved = chatStore
    .getRecentMessages(GUEST_USER_ID, 5)
    .find(m => m.sender === 'assistant');
  expect(entry.messageId).toBe(saved?.id);
  const snap = entry.snapshot;
  expect(snap.source).toBe('chat');
  expect(snap.outcome).toBe('success');
  expect(snap.executionPath).toBe('online_provider');
  expect(snap.marks.userSaved).toBeDefined();
  expect(snap.marks.firstContentRendered).toBeDefined();
  expect(snap.marks.finalRendered).toBeDefined();
  expect(snap.marks.finalRendered as number).toBeGreaterThanOrEqual(
    snap.marks.firstContentRendered as number,
  );
  // Structured timings only: no message text is kept.
  expect(JSON.stringify(entry)).not.toContain('Hello there!');
  expect(JSON.stringify(entry)).not.toContain('"hi"');
  await waitFor(() =>
    expect(utils.getByTestId(`chat-timing-${saved?.id}`)).toHaveTextContent(
      /⏱.*Online provider/,
    ),
  );
});

it('a failed send is recorded as a failure, not a timing for another message', async () => {
  developerTestService.setDeveloperModeEnabled(true);
  setPerfTrackingEnabled(true);
  jest
    .spyOn(chatOrchestrator, 'processMessage')
    .mockRejectedValueOnce(new Error('disk full'));
  const utils = renderChat();
  await send(utils, 'hi');
  await waitFor(() => expect(chatTimingStore.list()).toHaveLength(1));
  const [entry] = chatTimingStore.list();
  expect(entry.messageId).toBeNull();
  expect(entry.snapshot.outcome).toBe('failure');
});
