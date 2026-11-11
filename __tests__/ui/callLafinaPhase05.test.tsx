import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  chatStore,
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';
import {
  VOICE_CONSENT_KEY,
  VoiceConversationController,
} from '../../src/cloud/voiceConversation';
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

describe('Phase 05: Transcript, Typed Messages, and Chat Continuity', () => {
  const userId = 'student-phase05-user';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, 'phase05student', 'student05@ustp.edu.ph', 'student', 0, 0, 1, 0, ?, ?)`,
      [userId, now, now],
    );
    localSettingsStore.set(userId, 'chat.onlineMode', 'true');
    localSettingsStore.set(userId, VOICE_CONSENT_KEY, 'true');
    localSettingsStore.set(
      userId,
      'voiceConversation.directDataConsent.v1',
      'true',
    );
    localSettingsStore.set(
      userId,
      'speech.onlineVoice.v1',
      JSON.stringify({id: 'BtcCEANLn920ZIoN9grW', name: 'Rachel'}),
    );

    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId,
      accessToken: 'valid-test-token',
      refreshToken: 'valid-refresh-token',
    });
  });

  const createMockTransport = () => {
    let subscriber: ((event: TransportEvent) => void) | null = null;
    const sentMessages: string[] = [];
    const transport: VoiceTransport = {
      available: () => true,
      start: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockImplementation(() => {
        subscriber = null;
        return Promise.resolve();
      }),
      setMuted: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockImplementation((_k, json) => {
        sentMessages.push(json);
        return Promise.resolve(true);
      }),
      stopResponse: jest.fn().mockResolvedValue(true),
      subscribe: jest.fn().mockImplementation((_k, l) => {
        subscriber = l;
        return () => {
          subscriber = null;
        };
      }),
    };

    return {
      transport,
      sentMessages,
      emit(event: TransportEvent) {
        subscriber?.(event);
      },
    };
  };

  const createMockApi = (
    grantOverrides?: Partial<VoiceSessionGrant>,
  ): VoiceConversationApi => ({
    capabilities: jest.fn().mockResolvedValue({
      ok: true,
      data: {enabled: true, maxDurationSeconds: 300, maxTurns: 30},
    }),
    createSession: jest.fn().mockResolvedValue({
      ok: true,
      data: {
        sessionId: '00000000-0000-0000-0000-000000000005',
        signedUrl:
          'wss://api.elevenlabs.io/v1/convai/conversation?session=test05',
        grant: 'test-grant-token',
        voiceId: 'BtcCEANLn920ZIoN9grW',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        maxDurationSeconds: 300,
        maxTurns: 30,
        ...grantOverrides,
      },
    }),
    connected: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({
      ok: true,
      data: {
        status: 'active',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    }),
  });

  const renderPanel = (options?: {
    api?: VoiceConversationApi;
    onClientTool?: (
      name: string,
      params: Record<string, unknown>,
      isCurrent: () => boolean,
    ) => Promise<string>;
    review?: Partial<CommandReviewState>;
  }) => {
    const mockTransport = createMockTransport();
    const mockApi = options?.api ?? createMockApi();

    const depsFactory = () => ({
      gates: {
        isGuest: () => false,
        isSignedInOwner: () => true,
        isOnlineMode: () => true,
        isOnline: () => Promise.resolve(true),
        hasConsent: () => true,
        ensureMicPermission: () => Promise.resolve(true),
      },
      getVoice: () => ({id: 'BtcCEANLn920ZIoN9grW', name: 'Rachel'}),
      useHandbook: () => false,
      api: mockApi,
      transport: mockTransport.transport,
      allowLocalTestServer: true,
      onClientTool: options?.onClientTool,
      persistence: {
        userTurn: (text: string) => {
          chatStore.addMessage(userId, 'user', text);
        },
        assistantTurn: (text: string, heard: 'complete' | 'interrupted') => {
          chatStore.addMessage(userId, 'assistant', text, null, {
            voiceInterrupted: heard === 'interrupted',
          });
        },
      },
      limits: {
        connectTimeoutMs: 2000,
        thinkingTimeoutMs: 5000,
        inactivityMs: 5000,
        correctionWaitMs: 100,
        maxVisibleTurns: 10,
        maxTypedChars: 200,
      },
    });

    const defaultReview: CommandReviewState = {
      proposal: null,
      expired: false,
      busy: false,
      present: jest.fn(),
      confirm: jest
        .fn()
        .mockResolvedValue({status: 'executed', reply: 'Saved'}),
      cancel: jest
        .fn()
        .mockReturnValue({status: 'executed', reply: 'Canceled'}),
      dismiss: jest.fn(),
      ...options?.review,
    };

    const utils = render(
      <ThemeProvider userId={userId}>
        <VoiceConversationPanel
          userId={userId}
          review={defaultReview}
          onBack={jest.fn()}
          deps={depsFactory}
          fullScreen={true}
        />
      </ThemeProvider>,
    );

    return {
      ...utils,
      mockTransport,
      mockApi,
    };
  };

  describe('F-022 & P05-01: Live Provisional, Final Captions, and Interruption Persistence', () => {
    test('hides provisional and final captions on Call screen while persisting finalized turns to chat history', async () => {
      const {getByTestId, queryByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() =>
        expect(mockTransport.transport.start).toHaveBeenCalled(),
      );
      mockTransport.emit({kind: 'open'});

      // Provisional user speech stays hidden in Call Mode
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'tentative_user_transcript',
          tentative_user_transcription_event: {
            user_transcript: 'Hello there...',
          },
        }),
      });

      expect(queryByTestId('voice-turn-user-provisional')).toBeNull();
      expect(queryByTestId('voice-conversation-transcript')).toBeNull();

      // Final user speech
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {
            user_transcript: 'Hello there, Lafina!',
            event_id: 101,
          },
        }),
      });

      // Assistant streaming response part (provisional)
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'agent_chat_response_part',
          text_response_part: {type: 'delta', text: 'Hello! '},
        }),
      });

      expect(queryByTestId('voice-turn-assistant-provisional')).toBeNull();

      // Assistant final response
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'agent_response',
          agent_response_event: {
            agent_response: 'Hello! How can I help you today?',
            event_id: 102,
          },
        }),
      });

      fireEvent.press(getByTestId('voice-conversation-end'));

      await waitFor(() => {
        const msgs = chatStore.getMessages(userId);
        expect(
          msgs.some(
            m => m.sender === 'user' && m.content === 'Hello there, Lafina!',
          ),
        ).toBe(true);
        expect(
          msgs.some(
            m =>
              m.sender === 'assistant' &&
              m.content === 'Hello! How can I help you today?',
          ),
        ).toBe(true);
      });
      expect(queryByTestId('voice-conversation-transcript')).toBeNull();
    });

    test('interrupted assistant answer persists voiceInterrupted metadata while Call transcript remains hidden', async () => {
      const {getByTestId, queryByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() =>
        expect(mockTransport.transport.start).toHaveBeenCalled(),
      );
      mockTransport.emit({kind: 'open'});

      // Assistant starts speaking
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'agent_chat_response_part',
          text_response_part: {
            type: 'delta',
            text: 'Your next class is in room 304 and starts at...',
          },
        }),
      });

      expect(queryByTestId('voice-conversation-transcript')).toBeNull();

      // Interruption arrives
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({type: 'interruption', event_id: 202}),
      });

      await waitFor(() => {
        const interrupted = chatStore
          .getMessages(userId)
          .find(
            m =>
              m.sender === 'assistant' &&
              m.content.includes('Your next class is in room 304') &&
              m.voiceInterrupted === true,
          );
        expect(interrupted).toBeTruthy();
      });
      expect(queryByTestId('voice-turn-assistant-interrupted')).toBeNull();
    });
  });

  describe('F-023 & P05-02: Non-scrolling Call Stage Without Live Transcript', () => {
    test('keeps transcript chrome hidden during live call and renders non-scrolling View stage', async () => {
      const {getByTestId, queryByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() =>
        expect(mockTransport.transport.start).toHaveBeenCalled(),
      );
      mockTransport.emit({kind: 'open'});

      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {
            user_transcript: 'Check my schedule',
            event_id: 201,
          },
        }),
      });

      await waitFor(() => {
        expect(
          chatStore
            .getMessages(userId)
            .some(m => m.content.includes('Check my schedule')),
        ).toBe(true);
      });

      expect(getByTestId('call-content-stage').type).toBe('View');
      expect(queryByTestId('call-transcript-container')).toBeNull();
      expect(queryByTestId('call-transcript-toggle')).toBeNull();
      expect(queryByTestId('voice-conversation-transcript')).toBeNull();
      expect(queryByTestId('call-active-topic')).toBeNull();
      expect(queryByTestId('call-jump-to-latest')).toBeNull();
    });
  });

  describe('F-024 & P05-03: Typed Input Inside Live Voice Call', () => {
    test('typing during call sends user_message without terminating voice transport or duplicating echo', async () => {
      const {getByTestId, queryByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() =>
        expect(mockTransport.transport.start).toHaveBeenCalled(),
      );
      mockTransport.emit({kind: 'open'});

      // Tap "Type" dock button to reveal text input
      fireEvent.press(getByTestId('voice-conversation-type-instead'));

      await waitFor(() => {
        expect(getByTestId('voice-conversation-text-input')).toBeTruthy();
        expect(getByTestId('voice-conversation-send')).toBeTruthy();
      });

      // Type a message
      fireEvent.changeText(
        getByTestId('voice-conversation-text-input'),
        'What are the library hours today?',
      );

      // Send typed message
      fireEvent.press(getByTestId('voice-conversation-send'));

      // Verify user_message is sent over WebSocket
      await waitFor(() => {
        expect(
          mockTransport.sentMessages.some(m =>
            m.includes('What are the library hours today?'),
          ),
        ).toBe(true);
      });

      // Verify typed turn persists to chat history while Call transcript stays hidden
      await waitFor(() => {
        expect(
          chatStore
            .getMessages(userId)
            .some(m => m.content.includes('What are the library hours today?')),
        ).toBe(true);
      });
      expect(queryByTestId('voice-conversation-transcript')).toBeNull();

      // Verify voice transport was NOT terminated
      expect(mockTransport.transport.end).not.toHaveBeenCalled();

      // Provider echoes the typed turn over user_transcript within 5s
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {
            user_transcript: 'What are the library hours today?',
            event_id: 301,
          },
        }),
      });

      // Verify the turn was NOT duplicated
      const userTurns = chatStore
        .getMessages(userId)
        .filter(m => m.content.includes('What are the library hours today?'));
      expect(userTurns.length).toBeLessThanOrEqual(1);
    });
  });

  describe('F-025 & P05-04/P05-07: Chat History Persistence and Owner Isolation', () => {
    test('finished turns persist to Chat with correct roles, owner isolation, and interrupted flag', async () => {
      const initialCount = chatStore.getMessages(userId).length;

      const mockTransport = createMockTransport();
      const mockApi = createMockApi();

      const controller = new VoiceConversationController({
        gates: {
          isGuest: () => false,
          isSignedInOwner: () => true,
          isOnlineMode: () => true,
          isOnline: () => Promise.resolve(true),
          hasConsent: () => true,
          ensureMicPermission: () => Promise.resolve(true),
        },
        getVoice: () => ({id: 'BtcCEANLn920ZIoN9grW', name: 'Rachel'}),
        useHandbook: () => false,
        api: mockApi,
        transport: mockTransport.transport,
        allowLocalTestServer: true,
        persistence: {
          userTurn: text => {
            chatStore.addMessage(userId, 'user', text);
          },
          assistantTurn: (text, heard) => {
            chatStore.addMessage(userId, 'assistant', text, null, {
              voiceInterrupted: heard === 'interrupted',
            });
          },
        },
      });

      try {
        await controller.start();
        mockTransport.emit({kind: 'open'});

        // Complete user turn
        (
          controller as unknown as {
            onFinalUser: (w: string, id: string | null) => void;
          }
        ).onFinalUser('Submit assignment tomorrow', 'turn-u1');

        // Verify user turn saved
        const messagesAfterUser = chatStore.getMessages(userId);
        expect(messagesAfterUser.length).toBe(initialCount + 1);
        expect(messagesAfterUser[messagesAfterUser.length - 1].content).toBe(
          'Submit assignment tomorrow',
        );
        expect(messagesAfterUser[messagesAfterUser.length - 1].sender).toBe(
          'user',
        );

        // Assistant begins answer then gets interrupted
        (
          controller as unknown as {appendAnswer: (p: string) => void}
        ).appendAnswer('I noted your assignment for tomorrow morning.');
        (
          controller as unknown as {
            onMessage: (m: Record<string, unknown>) => void;
          }
        ).onMessage({
          type: 'interruption',
        });

        // New user turn closes the pending interrupted answer
        (
          controller as unknown as {
            onFinalUser: (w: string, id: string | null) => void;
          }
        ).onFinalUser('Actually Thursday instead', 'turn-u2');

        const allMessages = chatStore.getMessages(userId);
        const assistantMsg = allMessages.find(m =>
          m.content.includes('I noted your assignment for tomorrow morning.'),
        );
        expect(assistantMsg).toBeTruthy();
        expect(assistantMsg?.sender).toBe('assistant');
        expect(assistantMsg?.voiceInterrupted).toBe(true);

        // Verify other users do not see this owner's chat history
        const otherUserMessages = chatStore.getMessages(
          'different-student-user',
        );
        expect(
          otherUserMessages.some(m =>
            m.content.includes('Submit assignment tomorrow'),
          ),
        ).toBe(false);
      } finally {
        controller.dispose();
      }
    });
  });

  describe('F-026 & P05-05: Session End and Restart Protection', () => {
    test('ending call clears pending answer state and does not accept late events', async () => {
      const mockTransport = createMockTransport();
      const mockApi = createMockApi();

      const controller = new VoiceConversationController({
        gates: {
          isGuest: () => false,
          isSignedInOwner: () => true,
          isOnlineMode: () => true,
          isOnline: () => Promise.resolve(true),
          hasConsent: () => true,
          ensureMicPermission: () => Promise.resolve(true),
        },
        getVoice: () => ({id: 'v1', name: 'Rachel'}),
        useHandbook: () => false,
        api: mockApi,
        transport: mockTransport.transport,
        allowLocalTestServer: true,
      });

      try {
        await controller.start();
        mockTransport.emit({kind: 'open'});

        // End call
        controller.end();

        expect(controller.getSnapshot().phase).toBe('ended');

        // Late event from previous generation arrives
        mockTransport.emit({
          kind: 'message',
          data: JSON.stringify({
            type: 'agent_response',
            agent_response_event: {
              agent_response: 'Late response after end',
              event_id: 999,
            },
          }),
        });

        // Verify late response is ignored
        expect(controller.getSnapshot().phase).toBe('ended');
        expect(
          controller
            .getSnapshot()
            .turns.some(t => t.text.includes('Late response after end')),
        ).toBe(false);
      } finally {
        controller.dispose();
      }
    });
  });
});
