/**
 * ADR-046 in the Call LAFINA panel: a dropped line shows "Reconnecting…" and
 * carries on; a call the system stopped offers Continue call.
 */
import React from 'react';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';
import {VOICE_CONSENT_KEY} from '../../src/cloud/voiceConversation';
import type {
  TransportEvent,
  VoiceConversationApi,
  VoiceSessionGrant,
  VoiceTransport,
} from '../../src/cloud/voiceConversation/types';
import type {CommandReviewState} from '../../src/ui/hooks/useCommandReview';

jest.mock('../../src/ai/tts/ttsService', () => ({
  ttsService: {
    speak: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  },
}));

const userId = 'student-reconnect-panel';

const review: CommandReviewState = {
  proposal: null,
  expired: false,
  busy: false,
  present: jest.fn(),
  confirm: jest.fn(),
  cancel: jest.fn(),
  dismiss: jest.fn(),
} as unknown as CommandReviewState;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.clearAllMocks();
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [userId, userId, `${userId}@example.invalid`, now, now],
  );
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId,
    accessToken: 'test-jwt-token',
    refreshToken: 'test-refresh-token',
  }));
  localSettingsStore.set(userId, 'chat.onlineMode', 'true');
  localSettingsStore.set(userId, VOICE_CONSENT_KEY, 'true');
  localSettingsStore.set(
    userId,
    'voiceConversation.directDataConsent.v1',
    'true',
  );
});

const renderPanel = () => {
  const listeners = new Set<(event: TransportEvent) => void>();
  const transport: VoiceTransport = {
    available: () => true,
    start: jest.fn().mockResolvedValue(undefined),
    setMuted: jest.fn().mockResolvedValue(true),
    stopResponse: jest.fn().mockResolvedValue(true),
    sendMessage: jest.fn().mockResolvedValue(true),
    end: jest.fn().mockResolvedValue(true),
    subscribe: jest.fn().mockImplementation((_key, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  let n = 0;
  const grant = (): VoiceSessionGrant => {
    n += 1;
    return {
      sessionId: `sess-reconnect-${n}`,
      signedUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&s=${n}`,
      grant: 'grant-token',
      voiceId: 'voice_1',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      maxDurationSeconds: 600,
      maxTurns: 30,
    };
  };
  const api: VoiceConversationApi = {
    capabilities: jest.fn().mockResolvedValue({
      ok: true,
      data: {
        enabled: true,
        maxDurationSeconds: 600,
        maxTurns: 30,
        openingLine: true,
      },
    }),
    createSession: jest
      .fn()
      .mockImplementation(async () => ({ok: true, data: grant()})),
    connected: jest.fn().mockResolvedValue(null),
    end: jest.fn().mockResolvedValue(null),
    status: jest.fn().mockResolvedValue({
      ok: true,
      data: {status: 'active', lastErrorCode: null, lastErrorMessage: null},
    }),
  };
  const utils = render(
    <ThemeProvider userId={userId}>
      <VoiceConversationPanel
        userId={userId}
        review={review}
        onBack={jest.fn()}
        deps={() => ({
          gates: {
            isGuest: () => false,
            isSignedInOwner: () => true,
            isOnlineMode: () => true,
            isOnline: () => Promise.resolve(true),
            hasConsent: () => true,
            ensureMicPermission: () => Promise.resolve(true),
          },
          getVoice: () => ({id: 'voice_1', name: 'Bella'}),
          useHandbook: () => false,
          autoReconnect: true,
          api,
          transport,
        })}
      />
    </ThemeProvider>,
  );
  const emit = (event: TransportEvent) => {
    for (const listener of [...listeners]) listener(event);
  };
  const say = (text: string, eventId: number) =>
    emit({
      kind: 'message',
      data: JSON.stringify({
        type: 'user_transcript',
        user_transcription_event: {user_transcript: text, event_id: eventId},
      }),
    });
  return {...utils, transport, api, emit, say};
};

test('a dropped line reconnects and asks the unanswered question again', async () => {
  const {getByTestId, queryByTestId, transport, api, emit, say} = renderPanel();
  fireEvent.press(getByTestId('voice-conversation-start'));
  await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(getByTestId('voice-conversation-status')).toHaveTextContent(
      /Listening/,
    ),
  );
  await act(async () => say('What is due tomorrow?', 1));
  await act(async () => {
    emit({kind: 'closed', code: 1006, reason: 'network'});
  });
  await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(2));
  expect(api.createSession).toHaveBeenCalledTimes(2);
  // The question got no answer before the drop: it is asked again once.
  await waitFor(() =>
    expect(getByTestId('voice-conversation-status')).toHaveTextContent(
      /Thinking/,
    ),
  );
  const replays = (transport.sendMessage as jest.Mock).mock.calls
    .map(([, json]) => JSON.parse(json))
    .filter(frame => frame.type === 'user_message');
  expect(replays).toEqual([
    {type: 'user_message', text: 'What is due tomorrow?'},
  ]);
  const initiation = JSON.parse(
    (transport.start as jest.Mock).mock.calls[1][0].initiation,
  );
  expect(initiation.custom_llm_extra_body.student_context).toMatch(
    /^Call reconnected/,
  );
  expect(queryByTestId('voice-conversation-restart')).toBeNull();
  expect(queryByTestId('call-reconnecting-badge')).toBeNull();
});

test('while reconnecting the call says so and is still live', async () => {
  const {getByTestId, transport, emit} = renderPanel();
  // The new segment's native start never finishes during this test.
  fireEvent.press(getByTestId('voice-conversation-start'));
  await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(1));
  (transport.start as jest.Mock).mockImplementation(
    () => new Promise(() => undefined),
  );
  await act(async () => {
    emit({kind: 'closed', code: 1006, reason: 'network'});
  });
  await waitFor(() =>
    expect(getByTestId('voice-conversation-status')).toHaveTextContent(
      /Reconnecting/,
    ),
  );
  expect(getByTestId('call-reconnecting-badge')).toBeTruthy();
});

test('a call stopped by the system offers Continue call, which keeps the call going', async () => {
  const {getByTestId, transport, api, emit, say} = renderPanel();
  fireEvent.press(getByTestId('voice-conversation-start'));
  await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(1));
  await act(async () => say('Remind me about the quiz', 1));
  await act(async () => {
    emit({kind: 'backgrounded'});
  });
  await waitFor(() =>
    expect(getByTestId('voice-conversation-continue')).toBeTruthy(),
  );
  // Backgrounding never reconnects by itself.
  expect(transport.start).toHaveBeenCalledTimes(1);
  fireEvent.press(getByTestId('voice-conversation-continue'));
  await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(2));
  expect(api.createSession).toHaveBeenCalledTimes(2);
  await waitFor(() =>
    expect(getByTestId('voice-conversation-status')).toHaveTextContent(
      /Listening/,
    ),
  );
  const initiation = JSON.parse(
    (transport.start as jest.Mock).mock.calls[1][0].initiation,
  );
  expect(initiation.custom_llm_extra_body.student_context).toMatch(
    /^Call continued/,
  );
});
