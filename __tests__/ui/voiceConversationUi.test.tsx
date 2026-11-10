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
  timeBlocksStore,
  userStore,
  chatMemoryStore,
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
import {endReviewSession, latestPendingReview} from '../../src/ai/nlu/commandReview';
import {intentService} from '../../src/ai/nlu/intentService';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';
import {GUEST_USER_ID} from '../../src/constants';
import {directTestVoiceApi} from '../../src/cloud/directProviderTest';
import * as localSpeech from '../../src/ai/tts/ttsService';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';

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
  const calls = {start: 0, end: 0, muted: [] as boolean[], initiation: '', appOwnedAudio: false};
  const transport: VoiceTransport = {
    available: () => true,
    start: async options => {
      calls.start += 1;
      calls.initiation = options.initiation;
      calls.appOwnedAudio = options.appOwnedAudio === true;
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
  test('a general answer uses the device voice while provider audio is gated', async () => {
    const userId = student('general-speech');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const speech = jest.spyOn(localSpeech, 'startOwnedSpeech').mockImplementation(() => ({token: Promise.resolve(null), result: Promise.resolve('finished')}));
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    expect(calls.appOwnedAudio).toBe(true);
    message({type:'user_transcript',user_transcription_event:{user_transcript:'What is photosynthesis?',event_id:1}});
    message({type:'agent_response',agent_response_event:{agent_response:'Plants use light to make food.',event_id:2}});
    await waitFor(() => expect(speech.mock.calls.some(call => call[0] === 'Plants use light to make food.')).toBe(true));
    utils.unmount();
  });

  test('closing during intent extraction cannot leave a late review', async () => {
    const userId = student('late-extraction');
    signIn(userId);
    fakeServer();
    const original = intentService.extractIntent.bind(intentService);
    let release: (() => void) | undefined;
    jest.spyOn(intentService, 'extractIntent').mockImplementation(async (...args) => {
      await new Promise<void>(resolve => { release = resolve; });
      return original(...args);
    });
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({type:'user_transcript',user_transcription_event:{user_transcript:'Delete task: read chapter 5',event_id:1}});
    await waitFor(() => expect(release).toBeDefined());
    fireEvent.press(utils.getByTestId('voice-conversation-end'));
    await act(async () => { release?.(); await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(latestPendingReview(userId, 'voice')).toBeNull();
    expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
    utils.unmount();
  });

  test('direct voice saves a spoken study preference rather than showing a schedule card', async () => {
    const userId = student('voice-memory');
    signIn(userId);
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {providerTestingEnabled:true, directElevenKey:'test', directDeepseekKey:'test', directAgentId:'test', directVoiceId:'test'};
    localSettingsStore.set(userId, 'voiceConversation.directDataConsent.v1', 'true');
    const speech = jest.spyOn(localSpeech, 'startOwnedSpeech').mockImplementation(() => ({token: Promise.resolve(null), result: Promise.resolve('finished')}));
    jest.spyOn(directTestVoiceApi, 'capabilities').mockResolvedValue({ok:true,data:{enabled:true,maxDurationSeconds:300,maxTurns:30}});
    jest.spyOn(directTestVoiceApi, 'createSession').mockResolvedValue({ok:true,data:{sessionId:SESSION_ID,signedUrl:'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',grant:'',voiceId:'test',expiresAt:new Date(Date.now()+300000).toISOString(),maxDurationSeconds:300,maxTurns:30}});
    const {transport, calls, message} = fakeTransport();
    const sent: string[] = [];
    transport.sendMessage = async (_key, json) => { sent.push(json); return true; };
    try {
      const utils = renderPanel(userId, transport);
      fireEvent.press(utils.getByTestId('voice-conversation-start'));
      await waitFor(() => expect(calls.start).toBe(1));
      message({type:'user_transcript',user_transcription_event:{user_transcript:'Remember that I like studying between 10pm to 2am',event_id:1}});
      // Save is deterministic even if the provider omits its tool call.
      await waitFor(() => expect(chatMemoryStore.list(userId).map(m => m.text)).toContain('Prefers studying between 10pm to 2am.'));
      await waitFor(() => expect(speech.mock.calls.some(call => call[0] === 'I saved that in your memory.')).toBe(true));
      message({type:'client_tool_call',client_tool_call:{tool_name:'save_lafina_memory',tool_call_id:'memory-1',parameters:{request:'Remember that I like studying between 10pm to 2am'}}});
      await waitFor(() => expect(sent.some(s => s.includes('I saved that in your memory'))).toBe(true));
      expect(chatMemoryStore.list(userId).map(m => m.text)).toContain('Prefers studying between 10pm to 2am.');
      expect(chatMemoryStore.list(userId)).toHaveLength(1);
      expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
      utils.unmount();
    } finally { modules.CapstoneBuild = original; }
  });

  test('direct personal-data tools require their own disclosure even with prior voice consent', () => {
    const userId = student('data-consent');
    signIn(userId);
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {providerTestingEnabled:true, directElevenKey:'test', directDeepseekKey:'test', directAgentId:'test', directVoiceId:'test'};
    try {
      const {transport} = fakeTransport();
      const utils = renderPanel(userId, transport);
      expect(utils.getByTestId('voice-conversation-consent')).toHaveTextContent(/calendar, notes or saved memories/);
      expect(utils.queryByTestId('voice-conversation-start')).toBeNull();
      utils.unmount();
    } finally { modules.CapstoneBuild = original; }
  });

  test('an unsolicited provider action tool cannot create a review', async () => {
    const userId = student('unsolicited-tool');
    signIn(userId);
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {providerTestingEnabled:true, directElevenKey:'test', directDeepseekKey:'test', directAgentId:'test', directVoiceId:'test'};
    localSettingsStore.set(userId, 'voiceConversation.directDataConsent.v1', 'true');
    jest.spyOn(directTestVoiceApi, 'capabilities').mockResolvedValue({ok:true,data:{enabled:true,maxDurationSeconds:300,maxTurns:30}});
    jest.spyOn(directTestVoiceApi, 'createSession').mockResolvedValue({ok:true,data:{sessionId:SESSION_ID,signedUrl:'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',grant:'',voiceId:'test',expiresAt:new Date(Date.now()+300000).toISOString(),maxDurationSeconds:300,maxTurns:30}});
    const {transport, calls, message} = fakeTransport();
    const sent: string[] = [];
    transport.sendMessage = async (_key, json) => { sent.push(json); return true; };
    try {
      const utils = renderPanel(userId, transport);
      fireEvent.press(utils.getByTestId('voice-conversation-start'));
      await waitFor(() => expect(calls.start).toBe(1));
      message({type:'user_transcript',user_transcription_event:{user_transcript:'Hello',event_id:1}});
      message({type:'client_tool_call',client_tool_call:{tool_name:'prepare_lafina_action',tool_call_id:'invented',parameters:{request:'Add task: invented'}}});
      await waitFor(() => expect(sent.some(value => value.includes('Nothing was saved'))).toBe(true));
      expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
      utils.unmount();
    } finally { modules.CapstoneBuild = original; }
  });

  test('direct agent receives a truthful review result without saving the task', async () => {
    const userId = student('tool');
    signIn(userId);
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {providerTestingEnabled:true, directElevenKey:'test', directDeepseekKey:'test', directAgentId:'test', directVoiceId:'test'};
    localSettingsStore.set(userId, 'voiceConversation.directDataConsent.v1', 'true');
    jest.spyOn(directTestVoiceApi, 'capabilities').mockResolvedValue({ok:true,data:{enabled:true,maxDurationSeconds:300,maxTurns:30}});
    jest.spyOn(directTestVoiceApi, 'createSession').mockResolvedValue({ok:true,data:{sessionId:SESSION_ID,signedUrl:'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',grant:'',voiceId:'test',expiresAt:new Date(Date.now()+300000).toISOString(),maxDurationSeconds:300,maxTurns:30}});
    const {transport, calls, message} = fakeTransport();
    const sent: string[] = [];
    transport.sendMessage = async (_key, json) => { sent.push(json); return true; };
    const before = tasksStore.getAllTasks(userId).length;
    try {
      const utils = renderPanel(userId, transport);
      fireEvent.press(utils.getByTestId('voice-conversation-start'));
      await waitFor(() => expect(calls.start).toBe(1));
      // A follow-up may contain only details; the agent combines the request.
      message({type:'user_transcript',user_transcription_event:{user_transcript:'Add a task to read chapter 5',event_id:1}});
      message({type:'user_transcript',user_transcription_event:{user_transcript:'Tomorrow',event_id:2}});
      message({type:'client_tool_call',client_tool_call:{tool_name:'prepare_lafina_action',tool_call_id:'call-1',parameters:{request:'Add task: read chapter 9 tomorrow'}}});
      expect(await utils.findByTestId('voice-conversation-review-card')).toBeTruthy();
      expect(utils.getByTestId('voice-conversation-review-action')).toHaveTextContent(/chapter 5/i);
      expect(utils.getByTestId('voice-conversation-review-card')).toHaveTextContent(/Due:/);
      await waitFor(() => expect(sent.some(s => s.includes('Nothing is saved'))).toBe(true));
      expect(tasksStore.getAllTasks(userId)).toHaveLength(before);
      message({type:'client_tool_call',client_tool_call:{tool_name:'prepare_lafina_action',tool_call_id:'call-2',parameters:{request:'Add task: read chapter 5'}}});
      await waitFor(() => expect(sent.filter(s => s.includes('Nothing is saved')).length).toBeGreaterThanOrEqual(2));
      message({type:'user_transcript',user_transcription_event:{user_transcript:'Cancel that',event_id:3}});
      await waitFor(() => expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull());
      expect(tasksStore.getAllTasks(userId)).toHaveLength(before);
      utils.unmount();
    } finally { modules.CapstoneBuild = original; }
  });

  test('a missing time is collected from the next spoken turn without another tool call', async () => {
    const userId = student('followup');
    signIn(userId);
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {providerTestingEnabled:true, directElevenKey:'test', directDeepseekKey:'test', directAgentId:'test', directVoiceId:'test'};
    localSettingsStore.set(userId, 'voiceConversation.directDataConsent.v1', 'true');
    jest.spyOn(directTestVoiceApi, 'capabilities').mockResolvedValue({ok:true,data:{enabled:true,maxDurationSeconds:300,maxTurns:30}});
    jest.spyOn(directTestVoiceApi, 'createSession').mockResolvedValue({ok:true,data:{sessionId:SESSION_ID,signedUrl:'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',grant:'',voiceId:'test',expiresAt:new Date(Date.now()+300000).toISOString(),maxDurationSeconds:300,maxTurns:30}});
    const {transport, calls, message} = fakeTransport();
    const speech = jest.spyOn(localSpeech, 'startOwnedSpeech').mockImplementation(() => ({token: Promise.resolve(null), result: Promise.resolve('finished')}));
    const sent: string[] = [];
    transport.sendMessage = async (_key, json) => { sent.push(json); return true; };
    try {
      const utils = renderPanel(userId, transport);
      fireEvent.press(utils.getByTestId('voice-conversation-start'));
      await waitFor(() => expect(calls.start).toBe(1));
      expect(calls.appOwnedAudio).toBe(true);
      message({type:'user_transcript',user_transcription_event:{user_transcript:'Add a time block for study session tomorrow',event_id:1}});
      await waitFor(() => expect(utils.getByTestId('voice-conversation-local-note')).toHaveTextContent(/What time should I use/));
      message({type:'agent_response',agent_response_event:{agent_response:'I saved it for 9 AM.',event_id:5}});
      expect(utils.queryByText('I saved it for 9 AM.')).toBeNull();
      expect(speech.mock.calls.some(call => call[0].includes('saved it for 9 AM'))).toBe(false);
      message({type:'client_tool_call',client_tool_call:{tool_name:'prepare_lafina_action',tool_call_id:'missing',parameters:{request:'Add a time block for study session tomorrow at 9am'}}});
      await waitFor(() => expect(sent.some(value => value.includes('What time should I use'))).toBe(true));
      expect(utils.queryByTestId('voice-conversation-review-card')).toBeNull();
      message({type:'user_transcript',user_transcription_event:{user_transcript:'from 2 to 4pm',event_id:2}});
      await utils.findByTestId('voice-conversation-review-card');
      expect(utils.getByTestId('voice-conversation-review-card')).toHaveTextContent(/2:00 PM/);
      expect(utils.getByTestId('voice-conversation-review-card')).not.toHaveTextContent(/9:00 AM/);
      message({type:'user_transcript',user_transcription_event:{user_transcript:'Yes',event_id:3}});
      expect(utils.getByTestId('voice-conversation-review-card')).toBeTruthy();
      expect(timeBlocksStore.getAll(userId)).toHaveLength(0);
      expect(utils.getByTestId('voice-conversation-local-note')).toHaveTextContent(/Confirm or Cancel/);
      utils.unmount();
    } finally { modules.CapstoneBuild = original; }
  });

  test('confirmation speaks only the actual result after the provider releases audio', async () => {
    const userId = student('owned-outcome');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    const speech = jest.spyOn(localSpeech, 'startOwnedSpeech').mockImplementation((_text, owner) => {
      if (owner.startsWith('voice-decision:')) expect(calls.end).toBe(1);
      return {token: Promise.resolve(null), result: Promise.resolve('finished')};
    });
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({type:'user_transcript',user_transcription_event:{user_transcript:'Add task: read chapter 5',event_id:1}});
    await utils.findByTestId('voice-conversation-review-card');
    fireEvent.press(utils.getByTestId('voice-conversation-review-confirm'));
    await waitFor(() => expect(speech.mock.calls.some(call => call[1].startsWith('voice-decision:'))).toBe(true));
    const actual = utils.getByTestId('voice-conversation-local-note').props.children;
    expect(speech.mock.calls.find(call => call[1].startsWith('voice-decision:'))?.[0]).toBe(actual);
    expect(tasksStore.getAllTasks(userId).some(task => /chapter 5/i.test(task.title))).toBe(true);
    utils.unmount();
  });

  test('closing while provider audio is releasing prevents delayed outcome speech', async () => {
    const userId = student('closed-outcome');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    let release: ((value: boolean) => void) | undefined;
    transport.end = () => new Promise(resolve => { release = resolve; });
    const speech = jest.spyOn(localSpeech, 'startOwnedSpeech').mockImplementation(() => ({token: Promise.resolve(null), result: Promise.resolve('finished')}));
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({type:'user_transcript',user_transcription_event:{user_transcript:'Add task: read chapter 5',event_id:1}});
    await utils.findByTestId('voice-conversation-review-card');
    await waitFor(() => expect(speech).toHaveBeenCalled());
    speech.mockClear();
    fireEvent.press(utils.getByTestId('voice-conversation-review-confirm'));
    await waitFor(() => expect(release).toBeDefined());
    utils.unmount();
    await act(async () => { release?.(true); await Promise.resolve(); });
    expect(speech).not.toHaveBeenCalled();
  });

  test('a spoken cancellation during confirmation waits for the actual result', async () => {
    const userId = student('cancel-during-confirm');
    signIn(userId);
    fakeServer();
    const {transport, calls, message} = fakeTransport();
    let finish: ((value: {assistantMessage: null; reply: string}) => void) | undefined;
    jest.spyOn(chatOrchestrator, 'confirmReview').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const speech = jest.spyOn(localSpeech, 'startOwnedSpeech').mockImplementation(() => ({token: Promise.resolve(null), result: Promise.resolve('finished')}));
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({type:'user_transcript',user_transcription_event:{user_transcript:'Add task: read chapter 5',event_id:1}});
    await utils.findByTestId('voice-conversation-review-card');
    fireEvent.press(utils.getByTestId('voice-conversation-review-confirm'));
    await waitFor(() => expect(finish).toBeDefined());
    message({type:'user_transcript',user_transcription_event:{user_transcript:'Cancel that',event_id:2}});
    expect(utils.getByTestId('voice-conversation-local-note')).toHaveTextContent(/still processing/);
    await act(async () => { finish?.({assistantMessage: null, reply: 'The task was saved.'}); });
    await waitFor(() => expect(utils.getByTestId('voice-conversation-local-note')).toHaveTextContent(/The task was saved/));
    expect(speech.mock.calls.some(call => /Canceled\. Nothing was saved/.test(call[0]))).toBe(false);
    utils.unmount();
  });

  test('an unexpected confirmation error reports an unknown result', async () => {
    const userId = student('unknown-confirm');
    signIn(userId);
    fakeServer();
    jest.spyOn(chatOrchestrator, 'confirmReview').mockRejectedValue(new Error('synthetic failure'));
    const speech = jest.spyOn(localSpeech, 'startOwnedSpeech').mockImplementation(() => ({token: Promise.resolve(null), result: Promise.resolve('finished')}));
    const {transport, calls, message} = fakeTransport();
    const utils = renderPanel(userId, transport);
    fireEvent.press(utils.getByTestId('voice-conversation-start'));
    await waitFor(() => expect(calls.start).toBe(1));
    message({type:'user_transcript',user_transcription_event:{user_transcript:'Add task: read chapter 5',event_id:1}});
    await utils.findByTestId('voice-conversation-review-card');
    fireEvent.press(utils.getByTestId('voice-conversation-review-confirm'));
    await waitFor(() => expect(speech.mock.calls.some(call => /could not verify the result/i.test(call[0]))).toBe(true));
    expect(utils.getByTestId('voice-conversation-local-note')).toHaveTextContent(/check your planner/i);
    utils.unmount();
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
    expect(utils.getByTestId('voice-conversation-voice')).toHaveTextContent(
      /device voice/,
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
    ).toHaveTextContent(/Nothing is saved until you press Confirm/);
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
    expect(calls.muted[calls.muted.length - 1]).toBe(true);

    message({type: 'interruption'});
    fireEvent.press(utils.getByTestId('voice-conversation-end'));
    expect(utils.getByTestId('voice-conversation-status')).toHaveTextContent(
      /ended/,
    );
    expect(calls.end).toBe(1);

    const saved = chatStore.getRecentMessages(userId, 10);
    expect(saved.map(m => [m.sender, m.content, m.voiceInterrupted])).toEqual([
      ['user', 'Add task: read chapter 5', false],
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
