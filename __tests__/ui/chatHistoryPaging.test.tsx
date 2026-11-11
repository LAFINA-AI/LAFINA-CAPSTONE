/**
 * AGY-PORT 02: ChatScreen paging, error and legacy-notice states, account
 * switching, and Handbook citations that survive a reload.
 */
import React from 'react';
import {FlatList} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {mergeChatPages} from '../../src/ui/screens/chat/chatPaging';
import {
  CHAT_PAGE_SIZE,
  chatStore,
  initDatabase,
  userStore,
} from '../../src/storage';
import type {ChatMessage} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai';
import {cloudClient} from '../../src/cloud';

const screen = (userId: string) => (
  <ThemeProvider userId={userId}>
    <ChatScreen userId={userId} />
  </ThemeProvider>
);

const listData = (
  getByTestId: (id: string) => {props: Record<string, unknown>},
): ChatMessage[] =>
  getByTestId('chat-messages-list').props.data as ChatMessage[];

const seed = (userId: string, count: number): void => {
  for (let i = 0; i < count; i += 1) {
    chatStore.addMessage(userId, i % 2 === 0 ? 'user' : 'assistant', `m${i}`);
  }
};

const message = (
  id: string,
  createdAt: string,
  sequence: number,
): ChatMessage => ({
  id,
  sessionId: 's',
  sender: 'user',
  content: id,
  sequence,
  createdAt,
  updatedAt: createdAt,
});

describe('AGY-PORT 02: Chat history paging UI', () => {
  beforeAll(async () => {
    await initDatabase();
    userStore.createGuestUser();
  });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('mergeChatPages', () => {
    const t = '2026-11-06T00:00:00.000Z';

    test('keeps earlier loaded messages and never duplicates the newest reply', () => {
      const current = [
        message('a', t, 1),
        message('b', t, 2),
        message('c', t, 3),
      ];
      const merged = mergeChatPages(current, {
        items: [message('b', t, 2), message('c', t, 3), message('d', t, 4)],
        nextCursor: 'cursor',
      });
      expect(merged.items.map(m => m.id)).toEqual(['a', 'b', 'c', 'd']);
      expect(merged.keptEarlier).toBe(true);
    });

    test('a page holding the whole conversation replaces the list (clear shows)', () => {
      const merged = mergeChatPages([message('a', t, 1)], {
        items: [],
        nextCursor: null,
      });
      expect(merged).toEqual({items: [], keptEarlier: false});
    });

    test('a newest page with no overlap replaces the list instead of leaving a gap', () => {
      const merged = mergeChatPages([message('a', t, 1)], {
        items: [message('y', t, 9), message('z', t, 10)],
        nextCursor: 'cursor',
      });
      expect(merged.items.map(m => m.id)).toEqual(['y', 'z']);
      expect(merged.keptEarlier).toBe(false);
    });
  });

  test('shows the newest 50, loads earlier without duplicates, and keeps the draft', async () => {
    const user = 'paging-user';
    seed(user, 55);
    const {getByTestId, queryByTestId} = render(screen(user));

    expect(listData(getByTestId)).toHaveLength(50);
    expect(listData(getByTestId)[49].content).toBe('m54');
    fireEvent.changeText(getByTestId('chat-text-input'), 'unsent draft');

    await act(async () => {
      fireEvent.press(getByTestId('chat-load-earlier'));
    });
    const all = listData(getByTestId);
    expect(all.map(m => m.content)).toEqual(
      Array.from({length: 55}, (_, i) => `m${i}`),
    );
    expect(queryByTestId('chat-load-earlier')).toBeNull();
    expect(getByTestId('chat-text-input').props.value).toBe('unsent draft');

    // Sending keeps the earlier page and adds the reply exactly once.
    fireEvent.changeText(getByTestId('chat-text-input'), 'Hello LAFINA!');
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
    });
    await waitFor(() => expect(listData(getByTestId)).toHaveLength(57));
    const afterSend = listData(getByTestId);
    expect(new Set(afterSend.map(m => m.id)).size).toBe(57);
    expect(afterSend[0].content).toBe('m0');
    expect(afterSend[55].content).toBe('Hello LAFINA!');
    expect(afterSend[56].sender).toBe('assistant');
  });

  test('a load failure shows a retryable error, not the empty state, and keeps the draft', async () => {
    const user = 'error-user';
    seed(user, 2);
    const original = chatStore.getMessagesPage;
    const spy = jest
      .spyOn(chatStore, 'getMessagesPage')
      .mockImplementation(() => {
        throw new Error('storage unavailable');
      });
    const {getByTestId, queryByTestId} = render(screen(user));

    expect(getByTestId('chat-load-error')).toBeTruthy();
    expect(queryByTestId('chat-empty-state')).toBeNull();
    fireEvent.changeText(getByTestId('chat-text-input'), 'keep this');

    spy.mockImplementation(original);
    await act(async () => {
      fireEvent.press(getByTestId('chat-load-retry'));
    });
    expect(queryByTestId('chat-load-error')).toBeNull();
    expect(listData(getByTestId).map(m => m.content)).toEqual(['m0', 'm1']);
    expect(getByTestId('chat-text-input').props.value).toBe('keep this');
  });

  test('a failed earlier page keeps what is shown and can be retried', async () => {
    const user = 'earlier-error-user';
    seed(user, 52);
    const {getByTestId, queryByTestId} = render(screen(user));
    const original = chatStore.getMessagesPage;
    const spy = jest
      .spyOn(chatStore, 'getMessagesPage')
      .mockImplementationOnce(() => {
        throw new Error('storage unavailable');
      });
    await act(async () => {
      fireEvent.press(getByTestId('chat-load-earlier'));
    });
    expect(getByTestId('chat-load-error')).toBeTruthy();
    expect(listData(getByTestId)).toHaveLength(50);

    spy.mockImplementation(original);
    await act(async () => {
      fireEvent.press(getByTestId('chat-load-retry'));
    });
    expect(queryByTestId('chat-load-error')).toBeNull();
    expect(listData(getByTestId)).toHaveLength(52);
  });

  test('switching account never shows the previous account history', () => {
    seed('switch-a', 3);
    const {getByTestId, rerender, queryByTestId} = render(screen('switch-a'));
    expect(listData(getByTestId)).toHaveLength(3);
    rerender(screen('switch-b'));
    expect(listData(getByTestId)).toEqual([]);
    expect(queryByTestId('chat-load-earlier')).toBeNull();
  });

  test('a reply that finishes after an account switch is saved for the sender only', async () => {
    let finish: () => void = () => undefined;
    jest.spyOn(chatOrchestrator, 'processMessage').mockImplementationOnce(
      (owner, text) =>
        new Promise(resolve => {
          finish = () => {
            chatStore.addMessage(owner, 'user', text);
            const reply = chatStore.addMessage(
              owner,
              'assistant',
              'late reply',
            );
            resolve({reply: 'late reply', assistantMessage: reply} as never);
          };
        }),
    );
    const {getByTestId, rerender} = render(screen('delayed-a'));
    fireEvent.changeText(getByTestId('chat-text-input'), 'slow question');
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
    });
    rerender(screen('delayed-b'));
    await act(async () => {
      finish();
    });
    expect(listData(getByTestId)).toEqual([]);
    expect(chatStore.getMessages('delayed-b')).toEqual([]);
    expect(chatStore.getMessages('delayed-a').map(m => m.content)).toEqual([
      'slow question',
      'late reply',
    ]);
  });

  test('the legacy notice explains hidden history and stays dismissed for that account', () => {
    jest
      .spyOn(chatStore, 'getLegacyQuarantineSummary')
      .mockReturnValue({sessionCount: 1, messageCount: 3});
    const first = render(screen('legacy-user'));
    expect(first.getByTestId('chat-legacy-notice')).toBeTruthy();
    expect(first.getByText(/nothing was deleted/)).toBeTruthy();
    fireEvent.press(first.getByTestId('chat-legacy-notice-dismiss'));
    expect(first.queryByTestId('chat-legacy-notice')).toBeNull();
    first.unmount();

    expect(
      render(screen('legacy-user')).queryByTestId('chat-legacy-notice'),
    ).toBeNull();
    expect(
      render(screen('other-legacy-user')).getByTestId('chat-legacy-notice'),
    ).toBeTruthy();
  });

  test('a Handbook citation is stored with the reply and shown after a remount', async () => {
    const user = 'local_guest_user';
    chatStore.clearHistory(user);
    jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
      status: 'success',
      data: {
        reply: 'An incomplete grade must be completed within one school year.',
        used_handbook: true,
        sources: [{title: 'USTP Student Handbook', section: 'INC', page: 46}],
      },
    });
    const result = await chatOrchestrator.processMessage(
      user,
      'INC grade rule?',
      {
        onlineMode: true,
        useHandbook: true,
      },
    );
    expect(result.handbookNote).toBe(
      'Referenced USTP Student Handbook (p. 46)',
    );
    const stored = chatStore.getMessagesPage(user).items;
    expect(stored[stored.length - 1].handbookNote).toBe(
      'Referenced USTP Student Handbook (p. 46)',
    );

    const {findByText} = render(screen(user));
    expect(
      await findByText(/Referenced USTP Student Handbook \(p\. 46\)/),
    ).toBeTruthy();
  });

  const flushAnimationFrame = () =>
    act(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve()),
      );
    });

  test('opening or returning to a non-empty chat snaps to bottom immediately without animated scroll-down', async () => {
    const user = 'initial-scroll-user';
    seed(user, 30);
    const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const {getByTestId} = render(screen(user));

    const list = getByTestId('chat-messages-list');
    expect(list.props.initialNumToRender).toBe(CHAT_PAGE_SIZE);

    act(() => {
      fireEvent(list, 'layout', {
        nativeEvent: {layout: {width: 360, height: 600}},
      });
      fireEvent(list, 'contentSizeChange', 360, 2400);
      fireEvent(list, 'contentSizeChange', 360, 2480);
    });
    await flushAnimationFrame();

    expect(scrollToEndSpy).toHaveBeenCalled();
    expect(
      scrollToEndSpy.mock.calls.every(args => args[0]?.animated === false),
    ).toBe(true);

    // Sending a message after initial positioning scrolls smoothly.
    scrollToEndSpy.mockClear();
    fireEvent.changeText(getByTestId('chat-text-input'), 'Check bottom scroll');
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
    });
    act(() => {
      fireEvent(list, 'contentSizeChange', 360, 2600);
    });
    expect(scrollToEndSpy).toHaveBeenCalledWith({animated: true});

    // When scrolled up, layout/content changes do not yank back to bottom.
    scrollToEndSpy.mockClear();
    act(() => {
      fireEvent.scroll(list, {
        nativeEvent: {
          contentOffset: {x: 0, y: 120},
          contentSize: {width: 360, height: 2600},
          layoutMeasurement: {width: 360, height: 600},
        },
      });
      fireEvent(list, 'layout', {
        nativeEvent: {layout: {width: 360, height: 580}},
      });
      fireEvent(list, 'contentSizeChange', 360, 2640);
    });
    expect(scrollToEndSpy).not.toHaveBeenCalled();
  });

  test('switching chats in history snaps to bottom without animated scroll-down', async () => {
    const user = 'switch-chat-scroll-user';
    seed(user, 15);
    const firstId = chatStore.currentSessionId(user);
    chatStore.startNewChat(user);
    seed(user, 10);

    const scrollToEndSpy = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const {getByTestId} = render(screen(user));

    const list = getByTestId('chat-messages-list');
    act(() => {
      fireEvent(list, 'layout', {
        nativeEvent: {layout: {width: 360, height: 600}},
      });
      fireEvent(list, 'contentSizeChange', 360, 1200);
    });

    scrollToEndSpy.mockClear();
    fireEvent.press(getByTestId('chat-history-button'));
    await act(async () => {
      fireEvent.press(getByTestId(`chat-history-item-${firstId}`));
    });
    act(() => {
      fireEvent(list, 'contentSizeChange', 360, 1800);
    });
    await flushAnimationFrame();

    expect(scrollToEndSpy).toHaveBeenCalled();
    expect(
      scrollToEndSpy.mock.calls.every(args => args[0]?.animated === false),
    ).toBe(true);
  });
});
