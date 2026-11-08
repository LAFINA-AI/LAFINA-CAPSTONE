/**
 * Live voice conversation UI (Phase 09 follow-up, ADR-030). Rendered in Jest
 * with the node:sqlite mock and a fake transport; it proves the screen logic,
 * gating and persistence, not audio, ElevenLabs or a real phone.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {NativeModules, PermissionsAndroid} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {VoiceModal} from '../../src/ui/components/VoiceModal';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {
  chatStore,
  db,
  initDatabase,
  localSettingsStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  defaultVoiceConversationDeps,
  endActiveVoiceConversation,
  VOICE_CONSENT_KEY,
} from '../../src/cloud/voiceConversation';
import type {
  TransportEvent,
  VoiceTransport,
} from '../../src/cloud/voiceConversation';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';
import {GUEST_USER_ID} from '../../src/constants';

const SESSION_ID = '11111111-2222-3333-4444-555555555555';
let serial = 0;
let activeUser: string | null = null;

const student = (label: string): string => {
  serial += 1;
  const id = `vconv-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const signIn = (userId: string, {online = true, consent = true} = {}) => {
  activeUser = userId;
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: activeUser,
    accessToken: 'synthetic-token',
    refreshToken: null,
  }));
  localSettingsStore.set(userId, 'chat.onlineMode', online ? 'true' : 'false');
  localSettingsStore.set(userId, VOICE_CONSENT_KEY, consent ? 'true' : 'false');
};

/** Fake backend for the voice routes; any other path fails the test. */
const fakeServer = (options: {enabled?: boolean} = {}) => {
  const paths: string[] = [];
  jest
    .spyOn(cloudClient, 'request')
    .mockImplementation(async (path: string) => {
      paths.push(path);
      if (path === '/v1/ai/voice/capabilities') {
        return {
          status: 'success',
          data: {
            enabled: options.enabled ?? true,
            maxDurationSeconds: 300,
            maxTurns: 30,
            detail:
              options.enabled === false
                ? 'Voice conversation is not set up on the server yet.'
                : null,
          },
        } as never;
      }
      if (path === '/v1/ai/voice/sessions') {
        return {
          status: 'success',
          data: {
            sessionId: SESSION_ID,
            signedUrl:
              'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',
            grant: 'synthetic-grant',
            voiceId: 'default_voice',
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
            maxDurationSeconds: 300,
            maxTurns: 30,
          },
        } as never;
      }
      if (path.startsWith(`/v1/ai/voice/sessions/${SESSION_ID}`)) {
        return {
          status: 'success',
          data: {status: 'active', lastErrorCode: null, lastErrorMessage: null},
        } as never;
      }
      throw new Error(`unexpected ${path}`);
    });
  return paths;
};

const fakeTransport = () => {
  let listener: ((event: TransportEvent) => void) | null = null;
  const calls = {start: 0, end: 0, muted: [] as boolean[], initiation: ''};
  const transport: VoiceTransport = {
    available: () => true,
    start: async options => {
      calls.start += 1;
      calls.initiation = options.initiation;
    },
    setMuted: async (_key, muted) => {
      calls.muted.push(muted);
      return true;
    },
    stopResponse: async () => true,
    sendMessage: async () => true,
    end: async () => {
      calls.end += 1;
      return true;
    },
    subscribe: (_key, fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  const message = (payload: object) =>
    act(() => {
      listener?.({kind: 'message', data: JSON.stringify(payload)});
    });
  const emit = (event: TransportEvent) =>
    act(() => {
      listener?.(event);
    });
  return {transport, calls, message, emit};
};

const PanelHost: React.FC<{userId: string; transport: VoiceTransport}> = ({
  userId,
  transport,
}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onBack={() => undefined}
      deps={id => ({
        ...defaultVoiceConversationDeps(id),
        transport,
        log: () => undefined,
      })}
    />
  );
};

const renderPanel = (userId: string, transport: VoiceTransport) =>
  render(
    <ThemeProvider userId={userId}>
      <PanelHost userId={userId} transport={transport} />
    </ThemeProvider>,
  );

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

beforeEach(() => {
  jest.spyOn(ttsService, 'speak').mockResolvedValue(undefined as never);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
  activeUser = null;
  delete (NativeModules as Record<string, unknown>).LafinaVoiceConversation;
});

describe('voice conversation entry in the voice sheet', () => {
  test('push-to-talk stays the default; the conversation opens only on tap', async () => {
    const userId = student('entry');
    signIn(userId);
    const paths = fakeServer();
    const utils = render(
      <ThemeProvider userId={userId}>
        <VoiceModal visible userId={userId} onClose={() => undefined} />
      </ThemeProvider>,
    );
    expect(utils.getByTestId('voice-hold-button')).toBeTruthy();
    expect(utils.queryByTestId('voice-conversation-panel')).toBeNull();
    fireEvent.press(utils.getByTestId('voice-open-conversation'));
    expect(utils.getByTestId('voice-conversation-panel')).toBeTruthy();
    expect(utils.getByTestId('voice-conversation-start')).toBeTruthy();
    // Opening the panel sends nothing; only Start does.
    expect(paths).toEqual([]);
    fireEvent.press(utils.getByTestId('voice-conversation-back'));
    expect(utils.getByTestId('voice-hold-button')).toBeTruthy();
  });

  test('a guest is asked to sign in and nothing reaches the network', async () => {
    const paths = fakeServer();
    const {transport, calls} = fakeTransport();
    localSettingsStore.set(GUEST_USER_ID, VOICE_CONSENT_KEY, 'true');
    const utils = renderPanel(GUEST_USER_ID, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    expect(
      await utils.findByTestId('voice-conversation-problem-text'),
    ).toHaveTextContent(/Sign in/);
    expect(paths).toEqual([]);
    expect(calls.start).toBe(0);
    expect(utils.queryByTestId('voice-conversation-restart')).toBeNull();
  });

  test('consent comes first, once per account', async () => {
    const userId = student('consent');
    signIn(userId, {consent: false});
    const paths = fakeServer();
    const {transport} = fakeTransport();
    const utils = renderPanel(userId, transport);
    expect(utils.getByTestId('voice-conversation-consent')).toBeTruthy();
    expect(utils.queryByTestId('voice-conversation-start')).toBeNull();
    fireEvent.press(utils.getByTestId('voice-conversation-consent-accept'));
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
        /Listening/,
      ),
    );
    expect(localSettingsStore.get(userId, VOICE_CONSENT_KEY)).toBe('true');
    expect(paths).toEqual([
      '/v1/ai/voice/capabilities',
      '/v1/ai/voice/sessions',
    ]);
  });

  test('Online Mode off: explained, and turned on only by an explicit tap', async () => {
    const userId = student('mode');
    signIn(userId, {online: false});
    const paths = fakeServer();
    const {transport, calls} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    expect(
      await utils.findByTestId('voice-conversation-enable-online'),
    ).toBeTruthy();
    expect(paths).toEqual([]);
    expect(calls.start).toBe(0);
    expect(localSettingsStore.get(userId, 'chat.onlineMode')).toBe('false');
  });

  test('a server that is not set up says so plainly', async () => {
    const userId = student('unset');
    signIn(userId);
    fakeServer({enabled: false});
    const {transport, calls} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    expect(
      await utils.findByTestId('voice-conversation-problem-text'),
    ).toHaveTextContent(/not set up/);
    expect(calls.start).toBe(0);
  });

  test('the real transport is not offered without the native module', async () => {
    const userId = student('native');
    signIn(userId);
    const paths = fakeServer();
    const utils = render(
      <ThemeProvider userId={userId}>
        <PanelHostDefault userId={userId} />
      </ThemeProvider>,
    );
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    expect(
      await utils.findByTestId('voice-conversation-problem-text'),
    ).toHaveTextContent(/updated LAFINA app/);
    expect(paths).toEqual([]);
  });
});

const PanelHostDefault: React.FC<{userId: string}> = ({userId}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onBack={() => undefined}
    />
  );
};

describe('a live conversation', () => {
  test('live words, controls, a reviewed planner change and saved turns', async () => {
    const userId = student('live');
    signIn(userId);
    fakeServer();
    const {transport, calls, message, emit} = fakeTransport();
    const tasksBefore = tasksStore.getAllTasks(userId).length;
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    expect(
      JSON.parse(calls.initiation).conversation_config_override.tts.voice_id,
    ).toBe('default_voice');
    expect(utils.getByTestId('voice-conversation-voice')).toHaveTextContent(
      /Server default voice/,
    );

    message({
      type: 'tentative_user_transcript',
      tentative_user_transcription_event: {user_transcript: 'Add task'},
    });
    expect(utils.getByTestId('voice-turn-user-provisional')).toHaveTextContent(
      /Add task$/,
    );
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'Add task: read chapter 5',
        event_id: 1,
      },
    });
    expect(utils.getByTestId('voice-turn-user-final')).toHaveTextContent(
      /Add task: read chapter 5$/,
    );

    // The planner change waits on the card; nothing is saved by speaking.
    expect(
      await utils.findByTestId('voice-conversation-review-card'),
    ).toBeTruthy();
    expect(
      utils.getByTestId('voice-conversation-local-note'),
    ).toHaveTextContent(/Nothing is saved until you tap Confirm/);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(tasksBefore);

    message({
      type: 'agent_response',
      agent_response_event: {
        agent_response: 'I prepared that task. Check the card and tap Confirm.',
        event_id: 2,
      },
    });
    emit({kind: 'playback', speaking: true});
    expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
      /Speaking/,
    );

    fireEvent.press(utils.getByTestId('voice-conversation-mute'));
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
        /Muted/,
      ),
    );
    expect(calls.muted).toEqual([true]);

    message({type: 'interruption'});
    fireEvent.press(utils.getByTestId('voice-conversation-end'));
    expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
      /ended/,
    );
    expect(calls.end).toBe(1);

    const saved = chatStore.getRecentMessages(userId, 10);
    expect(saved.map(m => [m.sender, m.content, m.voiceInterrupted])).toEqual([
      ['user', 'Add task: read chapter 5', false],
      [
        'assistant',
        'I prepared that task. Check the card and tap Confirm.',
        true,
      ],
    ]);
    // Speaking never confirmed the review.
    expect(tasksStore.getAllTasks(userId)).toHaveLength(tasksBefore);
    expect(utils.getByTestId('voice-conversation-review-card')).toBeTruthy();
  });

  test('a reminder call stops the conversation; only a tap starts it again', async () => {
    const userId = student('call');
    signIn(userId);
    const paths = fakeServer();
    const {transport, calls} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    act(() =>
      endActiveVoiceConversation(
        'A reminder call started, so the conversation stopped.',
      ),
    );
    expect(
      utils.getByTestId('voice-conversation-problem-text'),
    ).toHaveTextContent(/reminder call/);
    expect(calls.end).toBe(1);
    const sessionsBefore = paths.filter(
      p => p === '/v1/ai/voice/sessions',
    ).length;
    fireEvent.press(utils.getByTestId('voice-conversation-restart'));
    await waitFor(() => expect(calls.start).toBe(2));
    expect(paths.filter(p => p === '/v1/ai/voice/sessions').length).toBe(
      sessionsBefore + 1,
    );
  });

  test('closing the panel ends the session and releases the transport', async () => {
    const userId = student('unmount');
    signIn(userId);
    fakeServer();
    const {transport, calls} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    utils.unmount();
    expect(calls.end).toBe(1);
  });
});

describe('Chat history', () => {
  test('an interrupted voice answer is labelled; a complete one is not', () => {
    const {
      ChatMessageItem,
    } = require('../../src/ui/components/chat/ChatMessageItem');
    const base = {
      sessionId: 's',
      sender: 'assistant' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const utils = render(
      <ThemeProvider userId="history-user">
        <ChatMessageItem
          item={{
            ...base,
            id: 'a',
            content: 'Cut short',
            voiceInterrupted: true,
          }}
        />
        <ChatMessageItem
          item={{
            ...base,
            id: 'b',
            content: 'Heard fully',
            voiceInterrupted: false,
          }}
        />
      </ThemeProvider>,
    );
    expect(utils.getAllByTestId('chat-voice-interrupted')).toHaveLength(1);
  });
});
