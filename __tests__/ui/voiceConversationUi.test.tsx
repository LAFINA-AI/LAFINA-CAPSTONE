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
  chatMemoryStore,
  notesStore,
} from '../../src/storage';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  defaultVoiceConversationDeps,
  endActiveVoiceConversation,
  LAFINA_VOICE_SYSTEM_PROMPT,
  VOICE_CONSENT_KEY,
} from '../../src/cloud/voiceConversation';
import type {
  TransportEvent,
  VoiceTransport,
} from '../../src/cloud/voiceConversation';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {intentService} from '../../src/ai/nlu/intentService';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';
import type {CallNavigationTarget} from '../../src/ui/navigation/callNavigation';
import {GUEST_USER_ID} from '../../src/constants';
import {directTestVoiceApi} from '../../src/cloud/directProviderTest';

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
  localSettingsStore.set(
    userId,
    'voiceConversation.directDataConsent.v1',
    consent ? 'true' : 'false',
  );
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
  const calls = {start: 0, end: 0, muted: [] as boolean[], initiation: '', sent: [] as string[]};
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
    sendMessage: async (_key, payload) => {
      calls.sent.push(payload);
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

const PanelHost: React.FC<{
  userId: string;
  transport: VoiceTransport;
  onNavigate?: (target: CallNavigationTarget) => void;
}> = ({userId, transport, onNavigate}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onNavigate={onNavigate}
      onBack={() => undefined}
      deps={id => ({
        ...defaultVoiceConversationDeps(id),
        transport,
        log: () => undefined,
      })}
    />
  );
};

const renderPanel = (
  userId: string,
  transport: VoiceTransport,
  onNavigate?: (target: CallNavigationTarget) => void,
) =>
  render(
    <ThemeProvider userId={userId}>
      <PanelHost
        userId={userId}
        transport={transport}
        onNavigate={onNavigate}
      />
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
    localSettingsStore.set(
      GUEST_USER_ID,
      'voiceConversation.directDataConsent.v1',
      'true',
    );
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
  test('closing during intent extraction cannot leave a late review', async () => {
    const userId = student('late-extraction');
    signIn(userId);
    fakeServer();
    const original = intentService.extractIntent.bind(intentService);
    let release: (() => void) | undefined;
    jest
      .spyOn(intentService, 'extractIntent')
      .mockImplementation(async (...args) => {
        await new Promise<void>(resolve => {
          release = resolve;
        });
        return original(...args);
      });
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'Delete task: read chapter 5',
        event_id: 1,
      },
    });
    await waitFor(() => expect(release).toBeDefined());
    fireEvent.press(utils.getByTestId('voice-conversation-end'));
    await act(async () => {
      release?.();
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(latestPendingReview(userId, 'voice')).toBeNull();
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
    utils.unmount();
  });

  test('an unsolicited legacy tool cannot invent a scheduling review', async () => {
    const userId = student('unsolicited');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const sent: string[] = [];
    transport.sendMessage = async (_key, json) => {
      sent.push(json);
      return true;
    };
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'invented',
        parameters: {request: 'Add task: invented'},
      },
    });
    await waitFor(() =>
      expect(sent.some(value => value.includes('Nothing was saved'))).toBe(
        true,
      ),
    );
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
    utils.unmount();
  });

  test('missing schedule details come from follow-up speech rather than tool guesses', async () => {
    const userId = student('grounded-followup');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'Add a time block for study session tomorrow',
        event_id: 1,
      },
    });
    expect(
      utils.getByTestId('voice-conversation-local-note'),
    ).toHaveTextContent(/What time/);
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'guess',
        parameters: {
          request: 'Add a time block for study session tomorrow at 9am',
        },
      },
    });
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
    message({
      type: 'user_transcript',
      user_transcription_event: {user_transcript: 'from 2 to 4pm', event_id: 2},
    });
    await utils.findByTestId('voice-conversation-review-card');
    expect(
      utils.getByTestId('voice-conversation-review-card'),
    ).toHaveTextContent(/2:00 PM/);
    expect(
      utils.getByTestId('voice-conversation-review-card'),
    ).toHaveTextContent(/4:00 PM/);
    utils.unmount();
  });

  test('direct voice requires memory review and on-screen approval', async () => {
    const userId = student('voice-memory');
    signIn(userId);
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {
      providerTestingEnabled: true,
      directElevenKey: 'test',
      directDeepseekKey: 'test',
      directAgentId: 'test',
      directVoiceId: 'test',
    };
    localSettingsStore.set(
      userId,
      'voiceConversation.directDataConsent.v1',
      'true',
    );
    jest.spyOn(directTestVoiceApi, 'capabilities').mockResolvedValue({
      ok: true,
      data: {enabled: true, maxDurationSeconds: 300, maxTurns: 30},
    });
    jest.spyOn(directTestVoiceApi, 'createSession').mockResolvedValue({
      ok: true,
      data: {
        sessionId: SESSION_ID,
        signedUrl:
          'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',
        grant: '',
        voiceId: 'test',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        maxDurationSeconds: 300,
        maxTurns: 30,
      },
    });
    const {transport, calls, message} = fakeTransport();
    const sent: string[] = [];
    transport.sendMessage = async (_key, json) => {
      sent.push(json);
      return true;
    };
    try {
      const utils = renderPanel(userId, transport);
      fireEvent.press(utils.getByTestId('voice-conversation-start'));
      await waitFor(() => expect(calls.start).toBe(1));
      message({
        type: 'user_transcript',
        user_transcription_event: {
          user_transcript: 'Remember that I like studying between 10pm to 2am',
          event_id: 1,
        },
      });
      await waitFor(() =>
        expect(utils.getByTestId('memory-review-card')).toBeTruthy(),
      );
      expect(chatMemoryStore.list(userId)).toHaveLength(0);
      message({
        type: 'client_tool_call',
        client_tool_call: {
          tool_name: 'save_lafina_memory',
          tool_call_id: 'memory-1',
          parameters: {
            request: 'Remember that I like studying between 10pm to 2am',
          },
        },
      });
      await waitFor(() =>
        expect(
          sent.some(value => value.includes('Nothing has been saved')),
        ).toBe(true),
      );
      expect(chatMemoryStore.list(userId)).toHaveLength(0);
      fireEvent.press(utils.getByTestId('memory-draft-confirm'));
      await waitFor(() => expect(chatMemoryStore.list(userId)).toHaveLength(1));
      expect(chatMemoryStore.list(userId)[0].text).toBe(
        'Prefers studying between 10pm to 2am.',
      );
      utils.unmount();
    } finally {
      modules.CapstoneBuild = original;
    }
  });

  test.each([false, true])(
    'personal-data tools require disclosure even with prior voice consent (direct=%s)',
    direct => {
      const userId = student('data-consent');
      signIn(userId);
      localSettingsStore.set(
        userId,
        'voiceConversation.directDataConsent.v1',
        'false',
      );
      const modules = NativeModules as Record<string, unknown>;
      const original = modules.CapstoneBuild;
      modules.CapstoneBuild = {
        providerTestingEnabled: direct,
        directElevenKey: 'test',
        directDeepseekKey: 'test',
        directAgentId: 'test',
        directVoiceId: 'test',
      };
      try {
        const {transport} = fakeTransport();
        const utils = renderPanel(userId, transport);
        expect(
          utils.getByTestId('voice-conversation-consent'),
        ).toHaveTextContent(/calendar, notes or saved memories/);
        expect(utils.queryByTestId('voice-conversation-start')).toBeNull();
        utils.unmount();
      } finally {
        modules.CapstoneBuild = original;
      }
    },
  );

  test('direct agent receives a truthful review result without saving the task', async () => {
    const userId = student('tool');
    signIn(userId);
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {
      providerTestingEnabled: true,
      directElevenKey: 'test',
      directDeepseekKey: 'test',
      directAgentId: 'test',
      directVoiceId: 'test',
    };
    localSettingsStore.set(
      userId,
      'voiceConversation.directDataConsent.v1',
      'true',
    );
    jest.spyOn(directTestVoiceApi, 'capabilities').mockResolvedValue({
      ok: true,
      data: {enabled: true, maxDurationSeconds: 300, maxTurns: 30},
    });
    jest.spyOn(directTestVoiceApi, 'createSession').mockResolvedValue({
      ok: true,
      data: {
        sessionId: SESSION_ID,
        signedUrl:
          'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',
        grant: '',
        voiceId: 'test',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        maxDurationSeconds: 300,
        maxTurns: 30,
      },
    });
    const {transport, calls, message} = fakeTransport();
    const sent: string[] = [];
    transport.sendMessage = async (_key, json) => {
      sent.push(json);
      return true;
    };
    const before = tasksStore.getAllTasks(userId).length;
    try {
      const utils = renderPanel(userId, transport);
      fireEvent.press(utils.getByTestId('voice-conversation-start'));
      await waitFor(() => expect(calls.start).toBe(1));
      // A follow-up may contain only details; the agent combines the request.
      message({
        type: 'user_transcript',
        user_transcription_event: {
          user_transcript: 'Add a task to read chapter 5',
          event_id: 1,
        },
      });
      message({
        type: 'client_tool_call',
        client_tool_call: {
          tool_name: 'prepare_lafina_action',
          tool_call_id: 'call-1',
          parameters: {request: 'Add task: read chapter 9'},
        },
      });
      expect(
        await utils.findByTestId('voice-conversation-review-card'),
      ).toBeTruthy();
      await waitFor(() =>
        expect(sent.some(s => s.includes('Nothing has been saved'))).toBe(true),
      );
      expect(
        utils.getByTestId('voice-conversation-review-card'),
      ).toHaveTextContent(/chapter 5/i);
      expect(
        utils.getByTestId('voice-conversation-review-card'),
      ).not.toHaveTextContent(/chapter 9/i);
      expect(tasksStore.getAllTasks(userId)).toHaveLength(before);
      utils.unmount();
    } finally {
      modules.CapstoneBuild = original;
    }
  });

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
    expect(utils.queryByTestId('voice-conversation-voice')).toBeNull();
    expect(utils.queryByText('Talk with LAFINA naturally, hands-free')).toBeNull();

    message({
      type: 'tentative_user_transcript',
      tentative_user_transcription_event: {user_transcript: 'Add task'},
    });
    expect(utils.queryByTestId('voice-turn-user-provisional')).toBeNull();
    expect(utils.queryByTestId('voice-conversation-transcript')).toBeNull();
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'Add task: read chapter 5',
        event_id: 1,
      },
    });
    expect(utils.queryByTestId('voice-turn-user-final')).toBeNull();

    // The planner change waits on the card; nothing is saved by speaking.
    expect(
      await utils.findByTestId('voice-conversation-review-card'),
    ).toBeTruthy();
    expect(
      utils.getByTestId('voice-conversation-local-note'),
    ).toHaveTextContent(/nothing is saved until confirmed/i);
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
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
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

describe('connected Call Lafina result cards', () => {
  test('provider note search renders the actual local note and opens its exact ID without ending the call', async () => {
    const userId = student('results');
    signIn(userId);
    fakeServer();
    notesStore.insert({
      id: 'panel-note',
      userId,
      title: 'Quantum panel note',
      body: 'Synthetic excerpt',
      category: 'Personal',
      tags: [],
      isPinned: false,
      isVoiceTranscribed: false,
      imageUri: null,
    });
    const {transport, calls, message} = fakeTransport();
    const navigate = jest.fn();
    const utils = renderPanel(userId, transport, navigate);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'search_notes',
        tool_call_id: 'search-panel',
        parameters: {query: 'Quantum panel'},
      },
    });
    await waitFor(() =>
      expect(utils.getByTestId('call-note-results')).toBeTruthy(),
    );
    expect(utils.getByText('Quantum panel note')).toBeTruthy();
    fireEvent.press(utils.getByTestId('note-result-open-note'));
    expect(navigate).toHaveBeenCalledWith({
      ownerId: userId,
      screen: 'notes',
      entityKind: 'note',
      entityId: 'panel-note',
    });
    expect(calls.end).toBe(0);
    expect(utils.queryByLabelText('Read earlier Chat messages')).toBeNull();
    expect(utils.queryByText('Open Chat history')).toBeNull();
    expect(utils.queryByText('Open saved item')).toBeNull();
  });
  test('provider calendar read renders a bounded agenda and opens Calendar on the requested date', async () => {
    const userId = student('agenda');
    signIn(userId);
    fakeServer();
    tasksStore.insertEvent({
      id: 'panel-event',
      userId,
      title: 'Panel lecture',
      date: '2030-06-01',
      startTime: '10:00',
      endTime: '11:00',
      location: null,
      recurrenceRule: null,
    });
    const {transport, calls, message} = fakeTransport();
    const navigate = jest.fn();
    const utils = renderPanel(userId, transport, navigate);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'read_calendar',
        tool_call_id: 'agenda-panel',
        parameters: {date: '2030-06-01'},
      },
    });
    await waitFor(() =>
      expect(utils.getByTestId('call-agenda-result')).toBeTruthy(),
    );
    expect(utils.getByText('Panel lecture (2030-06-01)')).toBeTruthy();
    fireEvent.press(utils.getByLabelText('Open agenda in Calendar'));
    expect(navigate).toHaveBeenCalledWith({
      ownerId: userId,
      screen: 'calendar',
      date: '2030-06-01',
    });
    expect(calls.end).toBe(0);
  });
});

describe('Call Lafina draft ambiguity and grouped editing', () => {
  test('ambiguous cancel with a memory and planner draft does not choose one', async () => {
    const userId = student('ambiguous');
    signIn(userId);
    fakeServer();
    chatMemoryStore.setEnabled(userId, true);
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_memory',
        tool_call_id: 'amb-memory',
        parameters: {text: 'I prefer afternoon classes'},
      },
    });
    await waitFor(() =>
      expect(utils.getByTestId('memory-review-card')).toBeTruthy(),
    );
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'Add task: Ambiguous tomorrow at 4pm',
        event_id: 100,
      },
    });
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'amb-task',
        parameters: {request: 'Add task: Ambiguous tomorrow at 4pm'},
      },
    });
    await waitFor(() =>
      expect(
        utils.getByText('Check the card — nothing is saved until confirmed.'),
      ).toBeTruthy(),
    );
    message({
      type: 'user_transcript',
      user_transcription_event: {user_transcript: 'Cancel that', event_id: 101},
    });
    await waitFor(() =>
      expect(
        utils.getByText(
          'Which draft should I cancel? Use Cancel on the card you mean.',
        ),
      ).toBeTruthy(),
    );
    expect(chatMemoryStore.list(userId)).toHaveLength(0);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
  });
  test('grouped date and time corrections save the edited fields once', async () => {
    const userId = student('group-edit');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_multi_action',
        tool_call_id: 'edit-group',
        parameters: {items: [{kind: 'task', title: 'Edited group task'}]},
      },
    });
    await waitFor(() =>
      expect(utils.getByTestId('multi-action-confirm-all')).toBeTruthy(),
    );
    fireEvent.changeText(
      utils.getByTestId('multi-item-date-input-0'),
      '2030-06-12',
    );
    fireEvent.changeText(utils.getByTestId('multi-item-time-input-0'), '16:00');
    fireEvent.press(utils.getByTestId('multi-action-confirm-all'));
    await waitFor(() => expect(tasksStore.getAllTasks(userId)).toHaveLength(1));
    expect(tasksStore.getAllTasks(userId)[0]).toMatchObject({
      dueDate: '2030-06-12',
      dueTime: '16:00',
    });
  });
});

describe('Call Mode ChatGPT-style UX, live card revisions, and saving', () => {
  test('uses non-scrolling stage, hides waveform while card is active, revises open draft on follow-up, and saves via voice', async () => {
    const userId = student('chatgpt-ux');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));

    // Non-scrolling stage, avatar/waveform visible initially, transcript & extra nav buttons hidden
    expect(utils.getByTestId('call-content-stage').type).toBe('View');
    expect(utils.getByTestId('call-identity-ring')).toBeTruthy();
    expect(utils.queryByTestId('voice-conversation-transcript')).toBeNull();
    expect(utils.queryByText('Open Chat history')).toBeNull();
    expect(utils.queryByText('Open saved item')).toBeNull();

    // Ask Lafina to schedule a meeting at 1pm
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'schedule me a meeting at 1pm',
        event_id: 201,
      },
    });

    const card = await utils.findByTestId('voice-conversation-review-card');
    expect(card).toHaveTextContent(/1:00 PM/);
    // Waveform/avatar hides while card is shown on screen
    expect(utils.queryByTestId('call-identity-ring')).toBeNull();

    // Follow-up spoken edit dynamically updates the displayed card
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'change it to 2pm',
        event_id: 202,
      },
    });
    await waitFor(() => {
      const updated = utils.getByTestId('voice-conversation-review-card');
      expect(updated).toHaveTextContent(/2:00 PM/);
    });

    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'rename it to Team Sync',
        event_id: 203,
      },
    });
    await waitFor(() => {
      const renamed = utils.getByTestId('voice-conversation-review-card');
      expect(renamed).toHaveTextContent(/Team Sync/);
    });

    // Spoken confirmation saves the revised draft directly
    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'yes, lock it in',
        event_id: 204,
      },
    });

    await waitFor(() => expect(tasksStore.getAllTasks(userId)).toHaveLength(1));
    expect(tasksStore.getAllTasks(userId)[0]).toMatchObject({
      title: 'Team Sync',
      dueTime: '14:00',
    });
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
    expect(utils.queryByText('Open saved item')).toBeNull();
  });

  test('confirm_draft client tool call commits pending card inside panel', async () => {
    const userId = student('confirm-tool');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));

    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'Add task: Submit slides tomorrow at 3pm',
        event_id: 301,
      },
    });
    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'prepare_lafina_action',
        tool_call_id: 'prep-save',
        parameters: {request: 'Add task: Submit slides tomorrow at 3pm'},
      },
    });

    await utils.findByTestId('voice-conversation-review-card');
    const cardId = latestPendingReview(userId, 'voice')?.operationId;
    expect(cardId).toBeTruthy();

    message({
      type: 'client_tool_call',
      client_tool_call: {
        tool_name: 'confirm_draft',
        tool_call_id: 'confirm-save',
        parameters: {cardId, revision: 1},
      },
    });

    await waitFor(() => expect(tasksStore.getAllTasks(userId)).toHaveLength(1));
    expect(tasksStore.getAllTasks(userId)[0]).toMatchObject({
      dueTime: '15:00',
    });
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
  });

  test('schedule me a meeting and polite question form show confirmation card and hide orb/waveform', async () => {
    const userId = student('schedule-meeting');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));

    // Initial connect must not send duplicate student-context contextual_update frames
    expect(
      calls.sent.some(
        s => s.includes('contextual_update') && s.includes('Student timezone'),
      ),
    ).toBe(false);

    expect(utils.getByTestId('call-identity-ring')).toBeTruthy();
    expect(utils.getByTestId('call-waveform-area')).toBeTruthy();

    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'schedule me a meeting',
        event_id: 401,
      },
    });
    const card = await utils.findByTestId('voice-conversation-review-card');
    expect(card).toHaveTextContent(/Meeting/);
    expect(utils.queryByTestId('call-identity-ring')).toBeNull();
    expect(utils.queryByTestId('call-waveform-area')).toBeNull();

    // Cancel first draft, then test polite question variant
    fireEvent.press(utils.getByTestId('voice-conversation-review-cancel'));
    await waitFor(() =>
      expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull(),
    );

    message({
      type: 'user_transcript',
      user_transcription_event: {
        user_transcript: 'Can you schedule me a meeting?',
        event_id: 402,
      },
    });
    const politeCard = await utils.findByTestId('voice-conversation-review-card');
    expect(politeCard).toHaveTextContent(/Meeting/);
    expect(utils.queryByTestId('call-identity-ring')).toBeNull();
    expect(utils.queryByTestId('call-waveform-area')).toBeNull();
  });

  test('hides orb and waveform when displaying clarification details or assistant reply, and Done restores orb', async () => {
    const userId = student('details-card');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));

    message({
      type: 'agent_response',
      agent_response_event: {
        agent_response: 'I can help plan your week. Just tell me the day and time.',
        event_id: 501,
      },
    });

    const detailsCard = await utils.findByTestId('call-details-card');
    expect(detailsCard).toHaveTextContent(/I can help plan your week/);
    expect(utils.queryByTestId('call-identity-ring')).toBeNull();
    expect(utils.queryByTestId('call-waveform-area')).toBeNull();

    fireEvent.press(utils.getByTestId('call-details-dismiss'));
    await waitFor(() => {
      expect(utils.queryByTestId('call-details-card')).toBeNull();
      expect(utils.getByTestId('call-identity-ring')).toBeTruthy();
      expect(utils.getByTestId('call-waveform-area')).toBeTruthy();
    });

    expect(LAFINA_VOICE_SYSTEM_PROMPT).toContain('first person');
    expect(LAFINA_VOICE_SYSTEM_PROMPT).not.toContain('LAFINA shows');
  });
});
