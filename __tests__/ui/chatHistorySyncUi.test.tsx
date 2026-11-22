/**
 * Chat history sync (ADR-040) controls in Preferences. The cloud call itself
 * is covered by __tests__/storage/chatHistorySync.test.ts; here it is mocked.
 */
import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {PreferencesSettingsScreen} from '../../src/ui/screens/PreferencesSettingsScreen';
import {db, initDatabase, userStore} from '../../src/storage';
import {chatSyncStore} from '../../src/storage/chatSyncStore';
import {chatStore} from '../../src/storage/chatStore';
import {ChatHistorySheet} from '../../src/ui/components/chat/ChatHistorySheet';
import {chatHistorySync} from '../../src/sync/chatHistorySync';
import {syncWorker} from '../../src/sync/syncWorker';

const signedInUser = (): string => {
  const id = `chs-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const renderPreferences = (userId: string) =>
  render(
    <ThemeProvider userId={userId}>
      <PreferencesSettingsScreen
        userId={userId}
        onBack={jest.fn()}
        onSaved={jest.fn()}
      />
    </ThemeProvider>,
  );

describe('Preferences: Chat history', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(syncWorker, 'performSync').mockResolvedValue(undefined);
  });

  test('a guest is told chats stay on this phone, with no sync controls', async () => {
    const guest = userStore.createGuestUser();
    const ui = renderPreferences(guest.id);
    await waitFor(() =>
      expect(ui.getByTestId('preferences-chat-sync-card')).toBeTruthy(),
    );
    expect(ui.getByText(/saved on this phone only/)).toBeTruthy();
    expect(ui.queryByText('Sync chat history')).toBeNull();
    expect(ui.queryByTestId('preferences-delete-cloud-chats')).toBeNull();
  });

  test('a signed-in student turns sync off and back on, applied at once', async () => {
    const me = signedInUser();
    const ui = renderPreferences(me);
    await waitFor(() => expect(ui.getByText('Sync chat history')).toBeTruthy());
    expect(chatSyncStore.isEnabled(me)).toBe(true);

    fireEvent.press(ui.getByText('Off (this phone only)'));
    expect(chatSyncStore.isEnabled(me)).toBe(false);
    expect(chatSyncStore.needsNotice(me)).toBe(false);

    fireEvent.press(ui.getByText('On (all my phones)'));
    expect(chatSyncStore.isEnabled(me)).toBe(true);
    expect(syncWorker.performSync).toHaveBeenCalledTimes(2);
  });

  test('Delete chat history from cloud asks first, then reports the result', async () => {
    const me = signedInUser();
    const alerts: Array<{title: string; buttons?: any[]}> = [];
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((title, _message, buttons) => {
        alerts.push({title, buttons: buttons as any[]});
      });
    const purge = jest
      .spyOn(chatHistorySync, 'deleteCloudCopy')
      .mockResolvedValue({
        status: 'deleted',
        deletedSessions: 2,
        deletedMessages: 9,
      });
    const ui = renderPreferences(me);
    await waitFor(() =>
      expect(ui.getByTestId('preferences-delete-cloud-chats')).toBeTruthy(),
    );

    fireEvent.press(ui.getByTestId('preferences-delete-cloud-chats'));
    expect(alerts[0].title).toBe('Delete chat history from cloud?');
    expect(purge).not.toHaveBeenCalled();

    const destructive = alerts[0].buttons?.find(b => b.style === 'destructive');
    await act(async () => {
      destructive.onPress();
    });
    expect(purge).toHaveBeenCalledWith(me);
    await waitFor(() =>
      expect(alerts.map(a => a.title)).toContain('Deleted from Cloud'),
    );
    // The switch shows Off, as on the phone.
    expect(ui.getByText('Off (this phone only)').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({fontWeight: 'bold'})]),
    );
  });

  test('a failed delete says why', async () => {
    const me = signedInUser();
    const alerts: Array<{title: string; message?: string; buttons?: any[]}> =
      [];
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      alerts.push({title, message, buttons: buttons as any[]});
    });
    jest.spyOn(chatHistorySync, 'deleteCloudCopy').mockResolvedValue({
      status: 'offline',
      message: 'Connect to the internet, then try again.',
    });
    const ui = renderPreferences(me);
    await waitFor(() =>
      expect(ui.getByTestId('preferences-delete-cloud-chats')).toBeTruthy(),
    );
    fireEvent.press(ui.getByTestId('preferences-delete-cloud-chats'));
    await act(async () => {
      alerts[0].buttons?.find(b => b.style === 'destructive').onPress();
    });
    await waitFor(() =>
      expect(alerts[alerts.length - 1]).toMatchObject({
        title: 'Not Deleted',
        message: 'Connect to the internet, then try again.',
      }),
    );
  });

  test('says when chats are not syncing yet, and when some are held by the limit', async () => {
    const me = signedInUser();
    db.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, 'chat.cloudLimitHeld', ?, ?)`,
      [me, JSON.stringify(['chat_session:a', 'chat_session:b']), 'now'],
    );
    const ui = renderPreferences(me);
    await waitFor(() =>
      expect(ui.getByTestId('preferences-chat-sync-unsupported')).toBeTruthy(),
    );
    expect(ui.getByText(/keeps up to 20 chats/)).toBeTruthy();
    expect(ui.getByTestId('preferences-chat-sync-held')).toHaveTextContent(
      /2 chats are saved on this phone only/,
    );

    db.executeSync(
      `INSERT INTO sync_state (user_id, scope_type, scope_id, cursor, status, server_entity_types, created_at, updated_at)
       VALUES (?, 'account', ?, 0, 'Synced', ?, 'now', 'now')`,
      [me, me, JSON.stringify(['task', 'chat_session', 'chat_message'])],
    );
    ui.unmount();
    const again = renderPreferences(me);
    await waitFor(() =>
      expect(again.getByText('Sync chat history')).toBeTruthy(),
    );
    expect(again.queryByTestId('preferences-chat-sync-unsupported')).toBeNull();
  });
});

describe('Chat list: the 20-chat limit', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const renderSheet = (userId: string) =>
    render(
      <ThemeProvider userId={userId}>
        <ChatHistorySheet
          visible
          userId={userId}
          currentSessionId={chatStore.currentSessionId(userId)}
          busy={false}
          onClose={jest.fn()}
          onChanged={jest.fn()}
        />
      </ThemeProvider>,
    );

  test('shows how many chats are used and explains when New chat is refused', async () => {
    const me = signedInUser();
    chatSyncStore.setEnabled(me, false);
    for (let n = 0; n < 20; n += 1) {
      const chat =
        n === 0 ? chatStore.currentSessionId(me) : chatStore.startNewChat(me);
      chatStore.addMessage(me, 'user', `chat ${n + 1}`, null, null, chat);
    }
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const ui = renderSheet(me);
    await waitFor(() =>
      expect(ui.getByTestId('chat-history-limit')).toHaveTextContent(
        '20 of 20 chats. Delete a chat to start a new one.',
      ),
    );
    fireEvent.press(ui.getByTestId('chat-history-new'));
    expect(alert).toHaveBeenCalledWith(
      'Chat Limit Reached',
      expect.stringContaining('Delete a chat to start a new one'),
    );
    expect(chatStore.chatLimit(me).count).toBe(20);
  });

  test('below the limit it counts and New chat works', async () => {
    const me = signedInUser();
    chatSyncStore.setEnabled(me, false);
    chatStore.addMessage(me, 'user', 'only chat');
    const ui = renderSheet(me);
    await waitFor(() =>
      expect(ui.getByTestId('chat-history-limit')).toHaveTextContent(
        '1 of 20 chats',
      ),
    );
    fireEvent.press(ui.getByTestId('chat-history-new'));
    expect(chatStore.currentSessionId(me)).toMatch(/^chat_session:/);
  });
});
