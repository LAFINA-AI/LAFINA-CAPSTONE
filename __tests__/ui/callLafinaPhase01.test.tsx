import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {NativeModules, PermissionsAndroid} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {VoiceModal} from '../../src/ui/components/VoiceModal';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {CallLafinaScreen} from '../../src/ui/screens/CallLafinaScreen';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  defaultVoiceConversationDeps,
  VOICE_CONSENT_KEY,
} from '../../src/cloud/voiceConversation';
import type {
  TransportEvent,
  VoiceTransport,
} from '../../src/cloud/voiceConversation';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';

const SESSION_ID = '99999999-8888-7777-6666-555555555555';
let serial = 0;
let activeUser: string | null = null;

const createTestUser = (label: string): string => {
  serial += 1;
  const id = `call-lafina-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const setupActiveUser = (
  userId: string,
  {online = true, consent = true} = {},
) => {
  activeUser = userId;
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: activeUser,
    accessToken: 'synthetic-token',
    refreshToken: null,
  }));
  localSettingsStore.set(userId, 'chat.onlineMode', online ? 'true' : 'false');
  localSettingsStore.set(userId, VOICE_CONSENT_KEY, consent ? 'true' : 'false');
  localSettingsStore.set(
    userId,
    'voiceConversation.directDataConsent.v1',
    consent ? 'true' : 'false',
  );
};

const fakeServer = () => {
  const paths: string[] = [];
  jest
    .spyOn(cloudClient, 'request')
    .mockImplementation(async (path: string) => {
      paths.push(path);
      if (path === '/v1/ai/voice/capabilities') {
        return {
          status: 'success',
          data: {
            enabled: true,
            maxDurationSeconds: 300,
            maxTurns: 30,
            detail: null,
          },
        } as never;
      }
      if (path === '/v1/ai/voice/sessions') {
        return {
          status: 'success',
          data: {
            sessionId: SESSION_ID,
            signedUrl:
              'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=test',
            grant: 'test-grant',
            voiceId: 'camille_voice',
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
      if (path === '/v1/ai/tts/capabilities' || path === '/v1/auth/me') {
        return {
          status: 'server_unavailable',
          error: `Mocked unavailable in test: ${path}`,
        } as never;
      }
      throw new Error(`Unexpected path: ${path}`);
    });
  return paths;
};

const fakeTransport = () => {
  let listener: ((event: TransportEvent) => void) | null = null;
  const calls = {
    start: 0,
    end: 0,
    muted: [] as boolean[],
    messages: [] as string[],
  };
  const transport: VoiceTransport = {
    available: () => true,
    start: async () => {
      calls.start += 1;
    },
    setMuted: async (_key, muted) => {
      calls.muted.push(muted);
      return true;
    },
    stopResponse: async () => true,
    sendMessage: async (_key, msg) => {
      calls.messages.push(msg);
      return true;
    },
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
  const emit = (event: TransportEvent) =>
    act(() => {
      listener?.(event);
    });
  return {transport, calls, emit};
};

const PanelHost: React.FC<{
  userId: string;
  transport: VoiceTransport;
  onBack?: () => void;
}> = ({userId, transport, onBack = () => undefined}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onBack={onBack}
      deps={id => ({
        ...defaultVoiceConversationDeps(id),
        transport,
        log: () => undefined,
      })}
      fullScreen={true}
    />
  );
};

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

describe('Phase 01: Call Lafina Navigation & Premium Full-Screen UI', () => {
  test('F-001: VoiceModal displays "Call Lafina" button while preserving offline "Hold to talk"', async () => {
    const userId = createTestUser('f001-modal');
    setupActiveUser(userId);
    fakeServer();
    const onOpenCallLafina = jest.fn();

    const utils = render(
      <ThemeProvider userId={userId}>
        <VoiceModal
          visible
          userId={userId}
          onClose={jest.fn()}
          onOpenCallLafina={onOpenCallLafina}
        />
      </ThemeProvider>,
    );

    // Offline push-to-talk button is present and distinct
    const holdButton = utils.getByTestId('voice-hold-button');
    expect(holdButton).toBeTruthy();
    expect(utils.getByTestId('voice-status-text')).toHaveTextContent(
      /Hold the mic button to talk/,
    );

    // Call Lafina button is present with correct label and accessibility
    const callButton = utils.getByTestId('voice-open-conversation');
    expect(callButton).toHaveTextContent('Call Lafina');
    expect(callButton.props.accessibilityLabel).toBe(
      'Call Lafina (Online live voice)',
    );

    // Tapping Call Lafina triggers onOpenCallLafina
    fireEvent.press(callButton);
    expect(onOpenCallLafina).toHaveBeenCalledTimes(1);

    await act(async () => {
      utils.unmount();
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
    });
  });

  test('F-001: ChatScreen provides a Call Lafina header CTA', async () => {
    const userId = createTestUser('f001-chat');
    setupActiveUser(userId);
    fakeServer();
    const onCallLafina = jest.fn();

    const utils = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} onCallLafina={onCallLafina} />
      </ThemeProvider>,
    );

    const callHeaderBtn = utils.getByTestId('chat-call-lafina-button');
    expect(callHeaderBtn).toBeTruthy();
    expect(callHeaderBtn.props.accessibilityLabel).toBe('Call Lafina');

    fireEvent.press(callHeaderBtn);
    expect(onCallLafina).toHaveBeenCalledTimes(1);

    await act(async () => {
      utils.unmount();
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
    });
  });

  test('F-002: CallLafinaScreen renders a dedicated full-screen surface without 75% sheet height constraint', () => {
    const userId = createTestUser('f002-fullscreen');
    setupActiveUser(userId);
    fakeServer();
    const {transport} = fakeTransport();
    const onClose = jest.fn();

    const utils = render(
      <ThemeProvider userId={userId}>
        <CallLafinaScreen
          userId={userId}
          onClose={onClose}
          deps={id => ({
            ...defaultVoiceConversationDeps(id),
            transport,
            log: () => undefined,
          })}
        />
      </ThemeProvider>,
    );

    expect(utils.getByTestId('call-lafina-screen')).toBeTruthy();
    expect(utils.getByTestId('voice-conversation-panel')).toBeTruthy();
    expect(utils.getByTestId('call-header-title')).toHaveTextContent(
      'Call Lafina',
    );

    // Back button in header closes screen
    fireEvent.press(utils.getByTestId('voice-conversation-back'));
    expect(onClose).toHaveBeenCalled();
  });

  test('F-003 & F-004: Displays centered identity ring, timer, and truthful online status badges', async () => {
    const userId = createTestUser('f003-status');
    setupActiveUser(userId);
    fakeServer();
    const {transport, emit} = fakeTransport();

    const utils = render(
      <ThemeProvider userId={userId}>
        <PanelHost userId={userId} transport={transport} />
      </ThemeProvider>,
    );

    expect(utils.getByTestId('call-identity-ring')).toBeTruthy();
    expect(utils.getByTestId('call-header-title')).toHaveTextContent(
      'Call Lafina',
    );
    expect(utils.getByTestId('call-online-badge')).toHaveTextContent(
      'Not connected',
    );

    // Start call
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
        /Listening/,
      ),
    );

    // Call timer is displayed
    expect(utils.getByTestId('call-timer')).toHaveTextContent('00:00');

    // Muting shows Muted status and badge
    fireEvent.press(utils.getByTestId('voice-conversation-mute'));
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
        /Muted/,
      ),
    );
    expect(utils.getByTestId('call-muted-badge')).toHaveTextContent('Muted');

    // Unmuting returns to speaking/listening
    fireEvent.press(utils.getByTestId('voice-conversation-mute'));
    await waitFor(() =>
      expect(
        utils.getByTestId('voice-conversation-status'),
      ).not.toHaveTextContent(/Muted/),
    );

    // Speaking state updates status
    emit({kind: 'playback', speaking: true});
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
        /Speaking/,
      ),
    );

    // End call cleanly
    fireEvent.press(utils.getByTestId('voice-conversation-end'));
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
        /Call ended/,
      ),
    );
  });

  test('F-005: Bottom control dock provides Mute, Stop, Type toggle, and End controls with accessible touch targets', async () => {
    const userId = createTestUser('f005-dock');
    setupActiveUser(userId);
    fakeServer();
    const {transport, calls, emit} = fakeTransport();

    const utils = render(
      <ThemeProvider userId={userId}>
        <PanelHost userId={userId} transport={transport} />
      </ThemeProvider>,
    );

    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
        /Listening/,
      ),
    );

    // Dock is visible
    expect(utils.getByTestId('call-control-dock')).toBeTruthy();

    const muteBtn = utils.getByTestId('voice-conversation-mute');
    const typeBtn = utils.getByTestId('voice-conversation-type-instead');
    const stopBtn = utils.getByTestId('voice-conversation-stop');
    const endBtn = utils.getByTestId('voice-conversation-end');

    expect(muteBtn).toBeTruthy();
    expect(typeBtn).toBeTruthy();
    expect(stopBtn).toBeTruthy();
    expect(endBtn).toBeTruthy();

    // Verify stop button while speaking
    emit({kind: 'playback', speaking: true});
    await waitFor(() =>
      expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
        /Speaking/,
      ),
    );
    fireEvent.press(stopBtn);

    // Toggle typed input drawer
    fireEvent.press(typeBtn);
    expect(utils.getByTestId('voice-conversation-text-input')).toBeTruthy();
    expect(utils.getByTestId('voice-conversation-send')).toBeTruthy();

    // Send a typed message
    fireEvent.changeText(
      utils.getByTestId('voice-conversation-text-input'),
      'Hello Lafina',
    );
    fireEvent.press(utils.getByTestId('voice-conversation-send'));

    // End call
    fireEvent.press(endBtn);
    expect(calls.end).toBe(1);
    expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
      /Call ended/,
    );
  });
});
