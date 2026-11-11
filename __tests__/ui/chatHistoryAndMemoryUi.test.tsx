/**
 * Chat history sheet (open, start, rename, delete and search chats), the
 * memory note under a reply with Undo, and Profile → Memory.
 */
import React from 'react';
import {Alert, DeviceEventEmitter} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {ChatMemorySettings} from '../../src/ui/components/profile/ChatMemorySettings';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {chatMemoryStore, chatStore, initDatabase} from '../../src/storage';
import {accountLinkService} from '../../src/cloud';
import type {ChatMessage} from '../../src/storage';
import {CHAT_MEMORY_CHANGED_EVENT} from '../../src/cloud/chatMemoryService';
import {ownedChatSessionId} from '../../src/storage/chatOwnership';

let serial = 0;
const student = (): string => {
  serial += 1;
  return `history-ui-${serial}`;
};

const chat = (userId: string) => (
  <ThemeProvider userId={userId}>
    <ChatScreen userId={userId} />
  </ThemeProvider>
);

const shown = (getByTestId: (id: string) => {props: Record<string, unknown>}): string[] =>
  (getByTestId('chat-messages-list').props.data as ChatMessage[]).map(m => m.content);

/** Presses the button labelled `label` in the next Alert. */
const confirmAlerts = (label: string) =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find(button => button.text === label)?.onPress?.();
  });

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('chat history sheet', () => {
  const twoChats = () => {
    const me = student();
    chatStore.addMessage(me, 'user', 'Biology review');
    chatStore.addMessage(me, 'assistant', 'Cells first.');
    const second = chatStore.startNewChat(me);
    chatStore.addMessage(me, 'user', 'Math homework');
    return {me, first: ownedChatSessionId(me), second};
  };

  it('lists chats, opens another one and starts a new one', async () => {
    const {me, first, second} = twoChats();
    const {getByTestId, queryByTestId, getByText} = render(chat(me));
    expect(shown(getByTestId)).toEqual(['Math homework']);

    fireEvent.press(getByTestId('chat-history-button'));
    expect(getByTestId(`chat-history-item-${second}`)).toBeTruthy();
    expect(getByText('Biology review')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId(`chat-history-item-${first}`));
    });
    expect(shown(getByTestId)).toEqual(['Biology review', 'Cells first.']);
    expect(queryByTestId('chat-history-sheet')).toBeNull();

    fireEvent.press(getByTestId('chat-history-button'));
    await act(async () => {
      fireEvent.press(getByTestId('chat-history-new'));
    });
    expect(shown(getByTestId)).toEqual([]);
    expect(chatStore.currentSessionId(me)).not.toBe(first);
    expect(chatStore.currentSessionId(me)).not.toBe(second);
  });

  it('searches, renames and deletes a chat', async () => {
    const {me, first, second} = twoChats();
    const {getByTestId, queryByTestId, getByText} = render(chat(me));
    fireEvent.press(getByTestId('chat-history-button'));

    fireEvent.changeText(getByTestId('chat-history-search'), 'cells');
    await waitFor(() => expect(queryByTestId(`chat-history-item-${second}`)).toBeNull());
    expect(getByTestId(`chat-history-item-${first}`)).toBeTruthy();
    fireEvent.changeText(getByTestId('chat-history-search'), 'zzz');
    await waitFor(() => expect(getByTestId('chat-history-empty')).toBeTruthy());
    fireEvent.changeText(getByTestId('chat-history-search'), '');

    await waitFor(() => expect(getByTestId(`chat-history-rename-${first}`)).toBeTruthy());
    fireEvent.press(getByTestId(`chat-history-rename-${first}`));
    fireEvent.changeText(getByTestId('chat-history-rename-input'), 'Bio finals');
    fireEvent.press(getByTestId('chat-history-rename-save'));
    expect(getByText('Bio finals')).toBeTruthy();

    // Deleting the open chat leaves an empty chat on screen.
    confirmAlerts('Delete');
    await act(async () => {
      fireEvent.press(getByTestId(`chat-history-delete-${second}`));
    });
    expect(queryByTestId(`chat-history-item-${second}`)).toBeNull();
    expect(shown(getByTestId)).toEqual([]);
    expect(chatStore.listSessions(me).map(c => c.title)).toEqual(['Bio finals']);
  });

  it('temporary chat does not save messages to history', async () => {
    const me = student();
    const {getByTestId} = render(chat(me));
    // Toggle temporary chat on
    fireEvent.press(getByTestId('chat-temporary-toggle-button'));
    // In temporary chat, send a message
    fireEvent.changeText(getByTestId('chat-text-input'), 'Hello in temporary mode');
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-button'));
    });
    // Messages must NOT be saved in chatStore
    expect(chatStore.getMessages(me)).toHaveLength(0);
  });

  it('a new account sees none of the previous chats', () => {
    const {me} = twoChats();
    const other = student();
    const {getByTestId, rerender, getByText} = render(chat(me));
    rerender(chat(other));
    fireEvent.press(getByTestId('chat-history-button'));
    expect(getByTestId('chat-history-empty')).toBeTruthy();
    expect(() => getByText('Biology review')).toThrow();
  });

  it('expands sidebar to full screen via expand button or search focus, filters General vs USTP chats, and launches Create Document from sidebar', async () => {
    const me = student();
    chatStore.addMessage(me, 'user', 'Physics problem set');
    const ustpId = chatStore.startNewUstpChat(me);
    chatStore.addMessage(me, 'user', 'USTP Retention Rule');
    chatStore.startNewChat(me, 'general');

    jest.spyOn(accountLinkService, 'authorizeOnlineMode').mockResolvedValue({
      status: 'success',
      message: 'Online mode ready.',
    });

    const {getByTestId, queryByTestId, getAllByText, queryByText, findByText} = render(chat(me));

    fireEvent.press(getByTestId('chat-history-button'));
    expect(getByTestId('chat-history-sheet')).toBeTruthy();
    expect(getByTestId('chat-history-expand').props.accessibilityState).toEqual({
      expanded: false,
    });

    // Manual expand -> full screen -> collapse -> auto-expand on Search focus
    fireEvent.press(getByTestId('chat-history-expand'));
    expect(getByTestId('chat-history-expand').props.accessibilityState).toEqual({
      expanded: true,
    });
    fireEvent.press(getByTestId('chat-history-expand'));
    expect(getByTestId('chat-history-expand').props.accessibilityState).toEqual({
      expanded: false,
    });

    fireEvent(getByTestId('chat-history-search'), 'focus');
    expect(getByTestId('chat-history-expand').props.accessibilityState).toEqual({
      expanded: true,
    });
    fireEvent.changeText(getByTestId('chat-history-search'), 'Retention');
    expect(getByTestId(`chat-history-item-${ustpId}`)).toBeTruthy();
    expect(getByTestId(`chat-history-ustp-badge-${ustpId}`)).toBeTruthy();
    fireEvent.press(getByTestId('chat-history-search-clear'));
    await waitFor(() => expect(getAllByText('Physics problem set').length).toBeGreaterThanOrEqual(1));

    // Filter chips separate USTP RAG chats from General chats
    fireEvent.press(getByTestId('chat-history-filter-ustp'));
    expect(queryByText('Physics problem set')).toBeNull();
    expect(getByTestId(`chat-history-item-${ustpId}`)).toBeTruthy();

    fireEvent.press(getByTestId('chat-history-filter-general'));
    expect(queryByTestId(`chat-history-item-${ustpId}`)).toBeNull();
    expect(getAllByText('Physics problem set').length).toBeGreaterThanOrEqual(1);

    fireEvent.press(getByTestId('chat-history-filter-all'));
    fireEvent.press(getByTestId('chat-history-expand'));

    // Launch Create PDF directly from the sidebar -> switches back from USTP/temp if needed & selects PDF format
    await act(async () => {
      fireEvent.press(getByTestId('chat-sidebar-doc-pdf'));
    });
    expect(queryByTestId('chat-history-sheet')).toBeNull();
    expect(await findByText('Creating a PDF file')).toBeTruthy();

    // Command Guide launches cleanly from the sidebar
    fireEvent.press(getByTestId('chat-history-button'));
    fireEvent.press(getByTestId('chat-sidebar-guide'));
    expect(await findByText('What you can ask')).toBeTruthy();
  });
});

describe('memory note under a reply', () => {
  it('appears when the background update lands, and Undo reverts it', async () => {
    const me = student();
    chatStore.addMessage(me, 'user', "I'm a nursing student");
    const reply = chatStore.addMessage(me, 'assistant', 'Nice!');
    const {getByTestId, getByText, queryByTestId} = render(chat(me));
    expect(queryByTestId(`chat-memory-note-${reply.id}`)).toBeNull();

    // What chatMemoryService does once the server answers.
    const changes = chatMemoryStore.applyChanges(me, {add: ['Is a nursing student.'], remove: []}, reply.sessionId);
    chatStore.setMemoryChanges(me, reply.id, changes);
    act(() => {
      DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, {userId: me, messageId: reply.id, changes});
    });
    expect(getByText('Memory updated')).toBeTruthy();
    expect(getByText('Remembered: Is a nursing student.')).toBeTruthy();

    act(() => {
      fireEvent.press(getByTestId(`chat-memory-undo-${reply.id}`));
    });
    expect(getByText('Memory change undone')).toBeTruthy();
    expect(queryByTestId(`chat-memory-undo-${reply.id}`)).toBeNull();
    expect(chatMemoryStore.list(me)).toEqual([]);
  });

  it('is kept with the reply after reopening Chat, and ignores other accounts', () => {
    const me = student();
    const reply = chatStore.addMessage(me, 'assistant', 'Okay');
    chatStore.setMemoryChanges(me, reply.id, {added: [], removed: [{id: 'm1', text: 'Works nights.'}]});
    const {getByText, queryByText} = render(chat(me));
    expect(getByText('Forgot: Works nights.')).toBeTruthy();
    act(() => {
      DeviceEventEmitter.emit(CHAT_MEMORY_CHANGED_EVENT, {
        userId: 'someone-else',
        messageId: reply.id,
        changes: {added: [{id: 'x', text: 'Not mine.'}], removed: []},
      });
    });
    expect(queryByText('Remembered: Not mine.')).toBeNull();
  });
});

describe('Profile → Memory', () => {
  const sheet = (userId: string, onChanged = jest.fn()) => (
    <ThemeProvider userId={userId}>
      <ChatMemorySettings userId={userId} isGuest={false} visible onClose={jest.fn()} onChanged={onChanged} />
    </ThemeProvider>
  );

  it('adds, lists, deletes and forgets memories', () => {
    const me = student();
    const onChanged = jest.fn();
    const {getByTestId, getByText, queryByTestId} = render(sheet(me, onChanged));
    expect(getByTestId('memory-empty')).toBeTruthy();

    fireEvent.changeText(getByTestId('memory-add-input'), 'Lives in Cagayan de Oro.');
    fireEvent.press(getByTestId('memory-add-button'));
    fireEvent.changeText(getByTestId('memory-add-input'), 'Prefers bullet points.');
    fireEvent.press(getByTestId('memory-add-button'));
    expect(getByText('Lives in Cagayan de Oro.')).toBeTruthy();
    expect(onChanged).toHaveBeenCalledTimes(2);

    fireEvent.changeText(getByTestId('memory-add-input'), 'prefers BULLET points.');
    fireEvent.press(getByTestId('memory-add-button'));
    expect(getByTestId('memory-notice')).toBeTruthy();

    const [newest] = chatMemoryStore.list(me);
    fireEvent.press(getByTestId(`memory-delete-${newest.id}`));
    expect(queryByTestId(`memory-item-${newest.id}`)).toBeNull();

    confirmAlerts('Forget');
    fireEvent.press(getByTestId('memory-forget-all'));
    expect(getByTestId('memory-empty')).toBeTruthy();
    expect(chatMemoryStore.list(me)).toEqual([]);
  });

  it('the switch turns memory off and back on', () => {
    const me = student();
    const {getByTestId} = render(sheet(me));
    expect(getByTestId('memory-enabled-switch').props.value).toBe(true);
    fireEvent(getByTestId('memory-enabled-switch'), 'valueChange', false);
    expect(chatMemoryStore.isEnabled(me)).toBe(false);
    expect(getByTestId('memory-enabled-switch').props.value).toBe(false);
    fireEvent(getByTestId('memory-enabled-switch'), 'valueChange', true);
    expect(chatMemoryStore.isEnabled(me)).toBe(true);
  });
});
