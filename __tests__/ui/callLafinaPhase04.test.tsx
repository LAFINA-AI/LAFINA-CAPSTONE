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
import {
  VOICE_CONSENT_KEY,
  VoiceConversationController,
  buildVoicePersonaPrompt,
  detectConversationalDirective,
  sanitizeSpeechText,
  stripReasoningContent,
  getToolWorkingPhrase,
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

describe('Phase 04: Human-Feeling Voice Persona and Turn-Taking', () => {
  const userId = 'student-phase04-user';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, 'phase04student', 'student04@ustp.edu.ph', 'student', 0, 0, 1, 0, ?, ?)`,
      [userId, now, now],
    );
    localSettingsStore.set(userId, 'chat.onlineMode', 'true');
    localSettingsStore.set(userId, VOICE_CONSENT_KEY, 'true');
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
        if (!subscriber) {
          throw new Error('Transport not started yet');
        }
        subscriber(event);
      },
    };
  };

  const createMockApi = (grantOverrides?: Partial<VoiceSessionGrant>): VoiceConversationApi => ({
    capabilities: jest.fn().mockResolvedValue({
      ok: true,
      data: {enabled: true, maxDurationSeconds: 300, maxTurns: 30},
    }),
    createSession: jest.fn().mockResolvedValue({
      ok: true,
      data: {
        sessionId: '00000000-0000-0000-0000-000000000001',
        signedUrl: 'wss://api.elevenlabs.io/v1/convai/conversation?session=test',
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
    onClientTool?: (name: string, params: Record<string, unknown>, isCurrent: () => boolean) => Promise<string>;
    review?: Partial<CommandReviewState>;
    thinkingTimeoutMs?: number;
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
      limits: {
        connectTimeoutMs: 2000,
        thinkingTimeoutMs: options?.thinkingTimeoutMs ?? 5000,
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
      confirm: jest.fn().mockResolvedValue({status: 'executed', reply: 'Saved'}),
      cancel: jest.fn().mockReturnValue({status: 'executed', reply: 'Canceled'}),
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

  describe('P04-01 & F-021: Persona Prompt and Preferences', () => {
    test('buildVoicePersonaPrompt includes concise spoken guidelines and reflects preferences', () => {
      const defaultPrompt = buildVoicePersonaPrompt();
      expect(defaultPrompt).toContain('You are Lafina, an online voice assistant for a student');
      expect(defaultPrompt).toContain('Answer naturally in short spoken sentences, usually one to three');
      expect(defaultPrompt).toContain('Do not narrate internal chain of thought');
      expect(defaultPrompt).toContain('Do not use markdown in speech');
      expect(defaultPrompt).toContain('Keep answers extremely concise');

      const detailedPrompt = buildVoicePersonaPrompt({verbosity: 'detailed', pacing: 'slow'});
      expect(detailedPrompt).toContain('Provide a thorough explanation');
      expect(detailedPrompt).toContain('Explain concepts step-by-step with natural sentence pauses');
    });

    test('detectConversationalDirective identifies wait, brevity, and pacing commands', () => {
      expect(detectConversationalDirective("wait, I'm thinking")).toBe('wait');
      expect(detectConversationalDirective('hold on a second')).toBe('wait');
      expect(detectConversationalDirective('give me a moment')).toBe('wait');
      expect(detectConversationalDirective("don't answer yet")).toBe('wait');

      expect(detectConversationalDirective('keep it brief please')).toBe('brief');
      expect(detectConversationalDirective('explain in detail')).toBe('detailed');
      expect(detectConversationalDirective('speak slower')).toBe('slow');
      expect(detectConversationalDirective('talk normally')).toBe('normal');

      expect(detectConversationalDirective('What is on my calendar tomorrow?')).toBeNull();
    });
  });

  describe('P04-07 & F-017: Reasoning and Markdown Scrubbing', () => {
    test('stripReasoningContent strips complete and partial unclosed reasoning blocks', () => {
      const withThink = 'Hello! <think>Internal reasoning about USTP policies</think>Here is your schedule.';
      expect(stripReasoningContent(withThink)).toBe('Hello! Here is your schedule.');

      const unclosedThink = 'Good morning. <think>Still deciding what to say...';
      expect(stripReasoningContent(unclosedThink)).toBe('Good morning. ');

      const withReasoningTag = 'Sure. [reasoning]step 1, step 2[/reasoning]I can help with that.';
      expect(stripReasoningContent(withReasoningTag)).toBe('Sure. I can help with that.');
    });

    test('sanitizeSpeechText strips markdown symbols, links, and code fences', () => {
      const rawMarkdown = '### Today\'s Plan\nHere is your **important** note: [Study Group](https://example.com) with *physics*.\n```console.log("test")```';
      const clean = sanitizeSpeechText(rawMarkdown);

      expect(clean).not.toContain('###');
      expect(clean).not.toContain('**');
      expect(clean).not.toContain('*physics*');
      expect(clean).not.toContain('```');
      expect(clean).toContain('Today\'s Plan');
      expect(clean).toContain('important');
      expect(clean).toContain('Study Group');
      expect(clean).toContain('physics');
    });

    test('assistant response with leaked thinking tags is scrubbed before UI and transcript display', async () => {
      const {getByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});

      // User asks question
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {user_transcript: 'When is my next class?', event_id: 1},
        }),
      });

      // Provider sends agent response containing <think> reasoning tags and markdown bold
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'agent_response',
          agent_response_event: {
            agent_response: 'Your next class is **Physics 101** at 2 PM. <think>Checking calendar window...</think>',
            event_id: 2,
          },
        }),
      });

      await waitFor(() => {
        expect(getByTestId('voice-conversation-transcript')).toHaveTextContent(
          /Your next class is Physics 101 at 2 PM\./,
        );
        expect(getByTestId('voice-conversation-transcript')).not.toHaveTextContent('think');
        expect(getByTestId('voice-conversation-transcript')).not.toHaveTextContent('**');
      });
    });
  });

  describe('F-016 & P04-03: Patient Turn-Taking and Pauses', () => {
    test('tentative user speech does not commit or force reply; only final transcript does', async () => {
      const {getByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});

      // Tentative speech while user is still talking and pausing
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'tentative_user_transcript',
          tentative_user_transcription_event: {user_transcript: 'Remind me to submit...'},
        }),
      });

      await waitFor(() => {
        expect(getByTestId('voice-conversation-transcript')).toHaveTextContent(/Remind me to submit/);
      });

      // Status remains listening (patient turn taking), not thinking yet
      expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Listening/);

      // Student pauses and finishes speaking -> final user transcript emitted
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {
            user_transcript: 'Remind me to submit my capstone draft on Friday at 3 PM',
            event_id: 5,
          },
        }),
      });

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Thinking/);
      });
    });
  });

  describe('F-020 & P04-06: Explicit "Wait, I am thinking" Directive', () => {
    test('user telling Lafina to wait enters patient listening state without unsolicited thinking', async () => {
      const {getByTestId, mockTransport} = renderPanel();

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});

      // User says "Wait, I'm thinking"
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {
            user_transcript: "Wait, I'm thinking",
            event_id: 11,
          },
        }),
      });

      await waitFor(() => {
        // Status remains listening with explicit patient notice
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Listening/);
        expect(getByTestId('voice-conversation-notice')).toHaveTextContent(
          /I'll wait\. Take your time\./,
        );
      });
    });
  });

  describe('F-018 & P04-04: Genuine Tool Progress Phrases (Never Precedes Tool)', () => {
    test('tool phrase appears ONLY when client_tool_call arrives, and clears on completion', async () => {
      let clientToolCalled = false;
      let resolveTool!: (ans: string) => void;
      const toolPromise = new Promise<string>(resolve => {
        resolveTool = resolve;
      });
      const onClientTool = jest.fn().mockImplementation(() => {
        clientToolCalled = true;
        return toolPromise;
      });

      const {getByTestId, mockTransport} = renderPanel({onClientTool});

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});

      // User asks question
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {user_transcript: 'Check my schedule for tomorrow', event_id: 20},
        }),
      });

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Thinking/);
      });

      // Before client_tool_call, status is strictly Thinking, never "Checking your calendar"
      expect(getByTestId('voice-conversation-status')).not.toHaveTextContent(/Checking your calendar/);

      // Now server emits client_tool_call
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'client_tool_call',
          client_tool_call: {
            tool_name: 'read_lafina_data',
            tool_call_id: 'call_123',
            parameters: {kind: 'calendar', query: 'tomorrow'},
          },
        }),
      });

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Checking your calendar/);
      });

      // Verify tool actually executed
      await waitFor(() => {
        expect(clientToolCalled).toBe(true);
      });

      // Now resolve the tool and verify client tool result is sent back
      resolveTool(JSON.stringify({events: []}));
      await waitFor(() => {
        expect(mockTransport.sentMessages.some(m => m.includes('client_tool_result'))).toBe(true);
      });
    });

    test('getToolWorkingPhrase maps known tools truthfully', () => {
      expect(getToolWorkingPhrase('read_lafina_data', 'calendar')).toBe('Checking your calendar...');
      expect(getToolWorkingPhrase('read_lafina_data', 'notes')).toBe('Searching your notes...');
      expect(getToolWorkingPhrase('read_lafina_data', 'memory')).toBe('Checking saved preferences...');
      expect(getToolWorkingPhrase('prepare_lafina_action')).toBe('Preparing draft...');
      expect(getToolWorkingPhrase('save_lafina_memory')).toBe('Checking memory request...');
      expect(getToolWorkingPhrase('unknown_tool')).toBe('Working on your request...');
    });
  });

  describe('F-019 & P04-05: Single Soft-Timeout Notice on Genuine Delay', () => {
    test('thinking timeout emits exactly one truthful notice without repeated filler sounds', async () => {
      const mockApi = createMockApi();
      (mockApi.status as jest.Mock).mockResolvedValue({
        ok: true,
        data: {status: 'active', lastErrorCode: null, lastErrorMessage: 'DeepSeek is busy processing.'},
      });

      const {getByTestId, mockTransport} = renderPanel({api: mockApi, thinkingTimeoutMs: 200});

      fireEvent.press(getByTestId('voice-conversation-start'));
      await waitFor(() => expect(mockTransport.transport.start).toHaveBeenCalled());
      mockTransport.emit({kind: 'open'});

      // User sends turn
      mockTransport.emit({
        kind: 'message',
        data: JSON.stringify({
          type: 'user_transcript',
          user_transcription_event: {user_transcript: 'What are the graduation requirements?', event_id: 30},
        }),
      });

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Thinking/);
      });

      // Wait for thinking timeout (200ms in test limits)
      await waitFor(() => {
        expect(getByTestId('voice-conversation-notice')).toHaveTextContent(
          /DeepSeek is busy processing\./,
        );
      });

      // Verify status line returned to listening without disconnecting
      expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Listening/);

      // Verify no double TTS was spoken during thinking delay
      expect(ttsService.speak).not.toHaveBeenCalled();
    });
  });

  describe('P04-08: Truthful Error Copy for 401, 402, 503 and Failure Scenarios', () => {
    test('subscription / balance limit (402) reports limit_reached message', async () => {
      const mockApi = createMockApi();
      (mockApi.createSession as jest.Mock).mockResolvedValue({
        ok: false,
        status: 'validation_error',
        httpStatus: 402,
        message: 'You have reached your daily limit.',
      });

      const {getByTestId} = renderPanel({api: mockApi});

      fireEvent.press(getByTestId('voice-conversation-start'));

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Call Lafina unavailable/);
        expect(getByTestId('voice-conversation-problem-text')).toHaveTextContent(
          /You have reached your daily limit\./,
        );
      });
    });

    test('server not configured (503) reports not_configured message', async () => {
      const mockApi = createMockApi();
      (mockApi.createSession as jest.Mock).mockResolvedValue({
        ok: false,
        status: 'server_error',
        httpStatus: 503,
        message: 'Call Lafina is not available on the server yet.',
      });

      const {getByTestId} = renderPanel({api: mockApi});

      fireEvent.press(getByTestId('voice-conversation-start'));

      await waitFor(() => {
        expect(getByTestId('voice-conversation-status')).toHaveTextContent(/Call Lafina unavailable/);
        expect(getByTestId('voice-conversation-problem-text')).toHaveTextContent(
          /Call Lafina is not available on the server yet\./,
        );
      });
    });
  });

  describe('P04-09: Timing Metrics Tracking', () => {
    test('measures first text latency accurately from final user turn', () => {
      let now = 1000;
      const clock = {
        now: () => now,
        setTimeout: jest.fn().mockReturnValue(123),
        clearTimeout: jest.fn(),
      };
      const mockTransport = createMockTransport();

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
        api: createMockApi(),
        transport: mockTransport.transport,
        clock,
        allowLocalTestServer: true,
      });

      // Emulate user final turn at t = 1000
      now = 1000;
      (controller as unknown as {onFinalUser: (w: string, id: string | null) => void}).onFinalUser(
        'Hello Lafina',
        'e1',
      );

      // Emulate first answer part arrives at t = 1350 (350ms later)
      now = 1350;
      (controller as unknown as {appendAnswer: (p: string) => void}).appendAnswer('Hello!');

      const snapshot = controller.getSnapshot();
      expect(snapshot.lastTiming?.toFirstText).toBe(350);
    });
  });
});
