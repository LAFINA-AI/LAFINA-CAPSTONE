/**
 * Floating LAFINA (J-10, FLOAT-04): the Quick Chat conversation.
 * Send disabled when empty; the question appears at once with the honest
 * "Working on it…" label; "Still working…" after 8 s; a streamed reply grows
 * in place; the final reply is shown; a thrown error gives the text back;
 * Stop discards the reply and gives the question back; a double tap sends
 * once; a real offline request answers from local data and writes no chat
 * rows.
 */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {db, initDatabase, userStore} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import type {
  ChatOrchestratorResult,
  ProcessMessageOptions,
} from '../../src/ai/chatOrchestrator';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {quickChatController} from '../../src/ai/quickChat/quickChatController';
import {
  QUICK_CHAT_ERROR_TEXT,
  QUICK_CHAT_STILL_WORKING_MS,
  QuickChatConversation,
} from '../../src/ui/quickChat/QuickChatConversation';

let serial = 0;
const owner = (): string => `quick-panel-${++serial}`;

const chatRowCount = (): number => {
  const count = (table: string): number =>
    Number(
      db.executeSync(`SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.n ?? 0,
    );
  return count('messages') + count('chat_sessions');
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

const reply = (text: string): ChatOrchestratorResult => {
  const at = new Date().toISOString();
  return {
    userMessage: {
      id: 'u',
      sessionId: 'temp_chat',
      sender: 'user',
      content: 'q',
      createdAt: at,
      updatedAt: at,
    },
    assistantMessage: {
      id: `a-${Math.random()}`,
      sessionId: 'temp_chat',
      sender: 'assistant',
      content: text,
      createdAt: at,
      updatedAt: at,
    },
    intent: {} as ChatOrchestratorResult['intent'],
  } as ChatOrchestratorResult;
};

const view = (userId: string, onlineMode = false) => (
  <ThemeProvider userId={userId}>
    <QuickChatConversation userId={userId} onlineMode={onlineMode} />
  </ThemeProvider>
);

const type = (text: string) =>
  fireEvent.changeText(screen.getByTestId('quick-chat-input'), text);

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

beforeEach(() => {
  endReviewSession();
  quickChatController.resetForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('Send is disabled while the box is empty', () => {
  render(view(owner()));
  expect(
    screen.getByTestId('quick-chat-send').props.accessibilityState,
  ).toEqual(expect.objectContaining({disabled: true}));
  type('   ');
  expect(
    screen.getByTestId('quick-chat-send').props.accessibilityState,
  ).toEqual(expect.objectContaining({disabled: true}));
  type('hello');
  expect(
    screen.getByTestId('quick-chat-send').props.accessibilityState,
  ).toEqual(expect.objectContaining({disabled: false}));
});

test('echo, Working on it…, streamed text, then the reply; options are Quick Chat’s', async () => {
  const userId = owner();
  const pending = deferred<ChatOrchestratorResult>();
  let options: ProcessMessageOptions | undefined;
  const spy = jest
    .spyOn(chatOrchestrator, 'processMessage')
    .mockImplementation((_user, _text, opts) => {
      options = opts;
      return pending.promise;
    });
  render(view(userId, true));
  type('what is a good study plan');
  fireEvent.press(screen.getByTestId('quick-chat-send'));

  expect(await screen.findByText('what is a good study plan')).toBeTruthy();
  expect(screen.getByText('Working on it…')).toBeTruthy();
  expect(screen.getByTestId('quick-chat-stop')).toBeTruthy();
  expect(screen.getByTestId('quick-chat-input').props.value).toBe('');
  expect(options).toEqual(
    expect.objectContaining({
      temporaryChat: true,
      reviewSurface: 'quick',
      onlineMode: true,
    }),
  );

  act(() => options?.onReplyText?.('Start with'));
  expect(await screen.findByText(/Start with/)).toBeTruthy();

  await act(async () => {
    pending.resolve(reply('Start with one subject a day.'));
    await pending.promise;
  });
  expect(
    await screen.findByText(/Start with one subject a day\./),
  ).toBeTruthy();
  expect(screen.queryByText('Working on it…')).toBeNull();
  expect(screen.getByTestId('quick-chat-send')).toBeTruthy();
  expect(spy).toHaveBeenCalledTimes(1);
});

test('"Still working…" appears after 8 s, not before', async () => {
  jest.useFakeTimers();
  const pending = deferred<ChatOrchestratorResult>();
  jest
    .spyOn(chatOrchestrator, 'processMessage')
    .mockReturnValue(pending.promise);
  render(view(owner()));
  type('summarise my week');
  fireEvent.press(screen.getByTestId('quick-chat-send'));
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText('Working on it…')).toBeTruthy();

  act(() => jest.advanceTimersByTime(QUICK_CHAT_STILL_WORKING_MS - 100));
  expect(screen.queryByText('Still working…')).toBeNull();
  act(() => jest.advanceTimersByTime(200));
  expect(screen.getByText('Still working…')).toBeTruthy();

  await act(async () => {
    pending.resolve(reply('Done.'));
    await pending.promise;
  });
});

test('a thrown error gives the text back with a plain message', async () => {
  const pending = deferred<ChatOrchestratorResult>();
  jest
    .spyOn(chatOrchestrator, 'processMessage')
    .mockReturnValue(pending.promise);
  render(view(owner()));
  type('remind me to call mom at 5');
  fireEvent.press(screen.getByTestId('quick-chat-send'));
  expect(await screen.findByText('Working on it…')).toBeTruthy();

  await act(async () => {
    pending.reject(new Error('network down'));
    await pending.promise.catch(() => undefined);
  });
  await waitFor(() =>
    expect(screen.getByTestId('quick-chat-input').props.value).toBe(
      'remind me to call mom at 5',
    ),
  );
  expect(screen.getByTestId('quick-chat-notice').props.children).toBe(
    QUICK_CHAT_ERROR_TEXT,
  );
  // The failed question is not left in the transcript.
  expect(screen.queryByTestId('quick-chat-transcript')).toBeNull();
});

test('Stop discards the reply and gives the question back', async () => {
  const userId = owner();
  const pending = deferred<ChatOrchestratorResult>();
  jest
    .spyOn(chatOrchestrator, 'processMessage')
    .mockReturnValue(pending.promise);
  render(view(userId));
  type('plan my weekend');
  fireEvent.press(screen.getByTestId('quick-chat-send'));
  expect(await screen.findByTestId('quick-chat-stop')).toBeTruthy();

  fireEvent.press(screen.getByTestId('quick-chat-stop'));
  expect(screen.getByTestId('quick-chat-input').props.value).toBe(
    'plan my weekend',
  );
  expect(screen.getByTestId('quick-chat-send')).toBeTruthy();

  await act(async () => {
    pending.resolve(reply('A late reply'));
    await pending.promise;
  });
  expect(screen.queryByText('A late reply')).toBeNull();
  expect(quickChatController.getTranscript(userId)).toEqual([]);
});

test('a double tap on Send sends once', async () => {
  const pending = deferred<ChatOrchestratorResult>();
  const spy = jest
    .spyOn(chatOrchestrator, 'processMessage')
    .mockReturnValue(pending.promise);
  render(view(owner()));
  type('note: bring the lab manual');
  const sendButton = screen.getByTestId('quick-chat-send');
  fireEvent.press(sendButton);
  fireEvent.press(sendButton);
  await act(async () => {
    await Promise.resolve();
  });
  expect(spy).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve(reply('Noted.'));
    await pending.promise;
  });
});

test('offline, real pipeline: the schedule question is answered locally and writes no chat rows', async () => {
  const userId = userStore.createGuestUser().id;
  const before = chatRowCount();
  render(view(userId));
  type('what is on my schedule tomorrow');
  fireEvent.press(screen.getByTestId('quick-chat-send'));
  await waitFor(
    () => expect(quickChatController.getTranscript(userId)).toHaveLength(2),
    {timeout: 10000},
  );
  const [question, answer] = quickChatController.getTranscript(userId);
  expect(question.content).toBe('what is on my schedule tomorrow');
  expect(answer.sender).toBe('assistant');
  expect(answer.content.trim().length).toBeGreaterThan(0);
  expect(chatRowCount()).toBe(before);
}, 20000);
