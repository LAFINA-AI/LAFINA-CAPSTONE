import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ttsService} from '../../src/ai/tts/ttsService';
import {
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';
import {VOICE_CONSENT_KEY} from '../../src/cloud/voiceConversation';
import type {
  VoiceConversationApi,
  VoiceSessionGrant,
  VoiceTransport,
  TransportEvent,
} from '../../src/cloud/voiceConversation/types';
import type {CommandReviewState} from '../../src/ui/hooks/useCommandReview';

jest.mock('../../src/ai/tts/ttsService', () => ({
  ttsService: {
    speak: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Phase 03: Live Audio Ownership, Provider Voice, Interruptions & Lifecycle', () => {
  const userId = 'student-phase03-user';

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
  });

  const createMockReview = (proposal: CommandReviewState['proposal'] = null): CommandReviewState => ({
    proposal,
    expired: false,
    busy: false,
    present: jest.fn(),
    confirm: jest.fn().mockResolvedValue({status: 'executed', reply: 'Task confirmed'}),
    cancel: jest.fn().mockReturnValue({status: 'executed', reply: 'Task canceled'}),
    dismiss: jest.fn(),
  });

  const setupMockTransport = () => {
    let listener: ((e: TransportEvent) => void) | null = null;
    const sentMessages: string[] = [];
    const transport: VoiceTransport = {
      available: () => true,
      start: jest.fn().mockResolvedValue(undefined),
      setMuted: jest.fn().mockResolvedValue(true),
      stopResponse: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockImplementation((_k, json) => {
        sentMessages.push(json);
        return Promise.resolve(true);
      }),
      end: jest.fn().mockResolvedValue(true),
      subscribe: jest.fn().mockImplementation((_k, l) => {
        listener = l;
        return () => {
          listener = null;
        };
      }),
    };
    return {
      transport,
      emit: (e: TransportEvent) => listener?.(e),
      sentMessages,
    };
  };

  const setupMockApi = () => {
    const grant: VoiceSessionGrant = {
      sessionId: 'sess-p03',
      signedUrl: 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=123',
      grant: 'grant-token',
      voiceId: 'eleven-voice-rachel',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      maxDurationSeconds: 600,
      maxTurns: 30,
    };
    const api: VoiceConversationApi = {
      capabilities: jest.fn().mockResolvedValue({
        ok: true,
        data: {enabled: true, maxDurationSeconds: 600, maxTurns: 30},
      }),
      createSession: jest.fn().mockResolvedValue({ok: true, data: grant}),
      connected: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined),
      status: jest.fn().mockResolvedValue({ok: true, data: {status: 'active', lastErrorCode: null, lastErrorMessage: null}}),
    };
    return {api, grant};
  };

  const renderPanel = (options?: {
    transport?: VoiceTransport;
    api?: VoiceConversationApi;
    review?: CommandReviewState;
    getVoice?: () => {id: string; name: string} | null;
  }) => {
    const mockTransport = setupMockTransport();
    const mockApi = setupMockApi();
    const review = options?.review ?? createMockReview();
    const transport = options?.transport ?? mockTransport.transport;
    const api = options?.api ?? mockApi.api;

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
            getVoice: options?.getVoice ?? (() => ({id: 'eleven-voice-rachel', name: 'Rachel'})),
            useHandbook: () => false,
            api,
            transport,
          })}
        />
      </ThemeProvider>,
    );

    return {
      ...utils,
      mockTransport,
      mockApi,
      review,
    };
  };

  describe('F-015 & P03-01/P03-03: Single active audio output (no double TTS)', () => {
    test('calls ttsService.stop() when starting Call Lafina to silence any local speech', async () => {
      const {getByTestId} = renderPanel();

      const startButton = getByTestId('voice-conversation-start');
      fireEvent.press(startButton);

      expect(ttsService.stop).toHaveBeenCalled();
    });

    test('confirming a review card passes speakReply: false so local TTS is not triggered', async () => {
      const mockProposal = {
        operationId: 'op-1',
        ownerId: userId,
        surface: 'voice' as const,
        intent: 'create_task' as const,
        heading: 'Create task',
        title: 'Submit capstone proposal',
        details: ['Due Friday'],
        assumptions: [],
        warnings: [],
        destructive: false,
        expiresAt: Date.now() + 600000,
        reply: 'I prepared a task to submit capstone proposal.',
      };
      const review = createMockReview(mockProposal);
      const {getByTestId} = renderPanel({review});

      // Confirm button on CommandReviewCard
      const confirmButton = getByTestId('voice-conversation-review-confirm');
      fireEvent.press(confirmButton);

      await waitFor(() => {
        expect(review.confirm).toHaveBeenCalledWith({speakReply: false});
      });
      // Local TTS service speak should NOT be called
      expect(ttsService.speak).not.toHaveBeenCalled();
    });
  });

  describe('F-014 & P03-02: Selected ElevenLabs voice identity used and displayed truthfully', () => {
    test('displays the exact saved online voice name, never misleading device voice', async () => {
      const {getByTestId, mockTransport} = renderPanel({
        getVoice: () => ({id: 'voice-adam-id', name: 'Adam (ElevenLabs)'}),
      });

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});

      await waitFor(() => {
        const voiceText = getByTestId('voice-conversation-voice');
        expect(voiceText.props.children).toEqual(['Voice: ', 'Adam (ElevenLabs)']);
      });
    });
  });

  describe('F-010 & P03-05: Mute releases native microphone', () => {
    test('tapping Mute calls native setMuted(true) and updates status', async () => {
      const {getByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});
      mockTransport.emit({kind: 'mic', capturing: true});

      await waitFor(() => {
        expect(getByTestId('voice-conversation-mute')).toBeTruthy();
      });

      // Press Mute
      fireEvent.press(getByTestId('voice-conversation-mute'));

      await waitFor(() => {
        expect(mockTransport.transport.setMuted).toHaveBeenCalledWith(
          expect.stringContaining('vc-'),
          true,
        );
      });

      // Emit mic release from native
      mockTransport.emit({kind: 'mic', capturing: false});

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(
          /Muted. LAFINA cannot hear you/,
        );
      });
    });
  });

  describe('F-011 & P03-04: Stop response silences current audio', () => {
    test('tapping Stop while speaking invokes stopResponse and resets output', async () => {
      const {getByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});
      mockTransport.emit({kind: 'playback', speaking: true});
      mockTransport.emit({kind: 'output_level', level: 0.8});

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Speaking/);
      });

      // Press Stop
      fireEvent.press(getByTestId('voice-conversation-stop'));

      await waitFor(() => {
        expect(mockTransport.transport.stopResponse).toHaveBeenCalled();
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Listening/);
      });
    });
  });

  describe('F-012 & P03-04: Barge-in speech interruption', () => {
    test('interruption event from provider silences assistant and switches to listening', async () => {
      const {getByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});
      mockTransport.emit({kind: 'playback', speaking: true});
      mockTransport.emit({kind: 'output_level', level: 0.9});

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Speaking/);
      });

      // User barges in: provider emits interruption
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({type: 'interruption', event_id: 10}),
      });

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Listening/);
      });
    });
  });

  describe('F-013, F-071, F-074 & P03-06/P03-07/P03-09: Connection loss requires explicit Start again', () => {
    test('connection closed enters restart_required with Start again button, never auto-reconnects', async () => {
      const {getByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});

      // Simulate connection drop
      mockTransport.emit({
        kind: 'closed',
        code: 1006,
        reason: 'Network connection closed abnormally',
      });

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Call stopped/);
        expect(getByTestId('voice-conversation-problem-text')).toHaveTextContent(
          /The conversation connection closed. Start again when you are ready./,
        );
        expect(getByTestId('voice-conversation-restart')).toBeTruthy();
      });

      // Verify it does NOT restart by itself
      expect(mockTransport.transport.start).toHaveBeenCalledTimes(1);

      // Explicit user tap restarts
      fireEvent.press(getByTestId('voice-conversation-restart'));

      await waitFor(() => {
        expect(mockTransport.transport.start).toHaveBeenCalledTimes(2);
      });
    });

    test('audio focus loss halts call cleanly and offers Start again', async () => {
      const {getByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});

      // Audio focus lost (e.g. phone call or reminder alert)
      mockTransport.emit({kind: 'audio_focus_lost'});

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Call stopped/);
        expect(getByTestId('voice-conversation-problem-text')).toHaveTextContent(
          /A call, a reminder or another app took the audio/,
        );
        expect(getByTestId('voice-conversation-restart')).toBeTruthy();
      });
    });
  });
});
