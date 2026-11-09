/**
 * Phase 09 follow-up: signed-in Online Mode (DeepSeek chat + ElevenLabs
 * speech) for every active account, the account-scoped online voice choice,
 * and the picker sheet. All network and audio are Jest fakes; nothing here
 * claims audible or device behavior.
 */
import React from 'react';
import {AppState, NativeModules} from 'react-native';
import type {AppStateStatus} from 'react-native';
import Tts from 'react-native-tts';
import RNFS from 'react-native-fs';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';
import {
  ONLINE_VOICE_KEY,
  onlineVoiceSettingsStore,
} from '../../src/storage/onlineVoiceSettingsStore';
import {speechSettingsStore} from '../../src/storage/speechSettingsStore';
import {loadOnlineVoices} from '../../src/cloud/onlineVoiceService';
import {createCallSpeechProvider} from '../../src/cloud/speechService';
import {cloudClient} from '../../src/cloud/cloudClient';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {
  chatOrchestrator,
  describeOnlineChatFailure,
} from '../../src/ai/chatOrchestrator';
import * as ttsService from '../../src/ai/tts/ttsService';
import {__resetTtsForTests} from '../../src/ai/tts/ttsService';
import {
  OnlineVoice,
  ONLINE_PREVIEW_TEXT,
} from '../../src/ui/components/profile/OnlineVoice';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {GUEST_USER_ID} from '../../src/constants';
import {meetingRecorder} from '../../src/ai/native/meetingRecorder';

const tts = Tts as unknown as Record<string, jest.Mock>;
const AUDIO = Buffer.from('SYNTHETIC_MP3_BYTES').toString('base64');

let serial = 0;
const student = (label: string, role = 'student'): string => {
  serial += 1;
  const id = `p09ov-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, role, now, now],
  );
  return id;
};

/** Signs `userId` in with a synthetic token and Online Mode switched on. */
const signIn = (userId: string, onlineMode = true) => {
  userStore.setCurrentUser(userId);
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: activeUser,
    accessToken: activeUser === GUEST_USER_ID ? null : 'synthetic-token',
    refreshToken: null,
  }));
  activeUser = userId;
  localSettingsStore.set(
    userId,
    'chat.onlineMode',
    onlineMode ? 'true' : 'false',
  );
};
let activeUser: string | null = null;

const ttsOk = (voice: string) => ({
  status: 'success' as const,
  data: {
    provider: 'elevenlabs',
    requestId: 'r',
    audioBase64: AUDIO,
    mimeType: 'audio/mpeg',
    model: 'eleven_flash_v2_5',
    voice,
    createdAt: new Date().toISOString(),
  },
});
const capabilityOk = {
  status: 'success' as const,
  data: {provider: 'elevenlabs', enabled: true},
};

/** Routes fake cloud requests by path; returns the spy for body assertions. */
const fakeCloud = (
  respond: (body: {voiceId?: string}) => unknown | Promise<unknown>,
) =>
  jest
    .spyOn(cloudClient, 'request')
    .mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/v1/ai/tts/capabilities') return capabilityOk as never;
      if (path === '/v1/ai/tts')
        return (await respond(JSON.parse(String(init?.body)))) as never;
      throw new Error(`unexpected ${path}`);
    });

const ttsBodies = (spy: jest.SpyInstance) =>
  spy.mock.calls
    .filter(([path]) => path === '/v1/ai/tts')
    .map(([, init]) => JSON.parse(init.body));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return {promise, resolve};
};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  __resetTtsForTests();
  jest.clearAllMocks();
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
  (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
  (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
  jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
  jest.spyOn(cloudClient, 'getAccessToken').mockReturnValue('synthetic-token');
  jest
    .spyOn(accountLinkService, 'completeDeferredCloudLink')
    .mockResolvedValue({
      status: 'offline',
      message: 'offline in test',
    });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  activeUser = null;
  db.executeSync('DELETE FROM active_session');
});

describe('Online Mode access: every signed-in account, guests sign in', () => {
  it.each(['student', 'student_pro', 'admin'])(
    'authorizes an active %s account from the live profile without a plan check',
    async role => {
      const userId = student(role, role);
      const refresh = jest
        .spyOn(accountLinkService, 'refreshCloudProfile')
        .mockResolvedValue({
          status: 'success',
          localUserId: userId,
          role,
          message: 'ok',
        });
      const result = await accountLinkService.authorizeOnlineMode(userId);
      expect(result.status).toBe('success');
      expect(refresh).toHaveBeenCalledWith(userId);
    },
  );

  it('asks guests to sign in without contacting the server', async () => {
    const refresh = jest.spyOn(accountLinkService, 'refreshCloudProfile');
    const result = await accountLinkService.authorizeOnlineMode(GUEST_USER_ID);
    expect(result.status).toBe('auth_required');
    expect(result.message).toMatch(/Sign in to use Online Mode/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('passes through a disabled or expired live account result unchanged', async () => {
    const userId = student('disabled');
    jest.spyOn(accountLinkService, 'refreshCloudProfile').mockResolvedValue({
      status: 'account_disabled',
      message: 'Account disabled.',
    });
    expect((await accountLinkService.authorizeOnlineMode(userId)).status).toBe(
      'account_disabled',
    );
  });
});

describe('Online voice preference store', () => {
  it('saves per account, stays separate from offline voice settings, and clears to server default', () => {
    const first = student('pref-a');
    const second = student('pref-b');
    signIn(first);
    const offlineBefore = speechSettingsStore.read(first);
    onlineVoiceSettingsStore.save(first, {id: 'voice_b', name: 'Bella'});
    expect(onlineVoiceSettingsStore.read(first)).toEqual({
      id: 'voice_b',
      name: 'Bella',
    });
    expect(onlineVoiceSettingsStore.read(second)).toBeNull();
    expect(speechSettingsStore.read(first)).toEqual(offlineBefore);
    expect(localSettingsStore.get(first, 'speech_tts_v1')).toBeNull();
    onlineVoiceSettingsStore.save(first, null);
    expect(onlineVoiceSettingsStore.read(first)).toBeNull();
  });

  it('rejects guests, a different active owner, malformed IDs and failed writes', () => {
    const owner = student('pref-owner');
    const other = student('pref-other');
    signIn(other);
    expect(() =>
      onlineVoiceSettingsStore.save(owner, {id: 'voice_a', name: 'A'}),
    ).toThrow(/Sign in/);
    expect(() =>
      onlineVoiceSettingsStore.save(GUEST_USER_ID, {id: 'voice_a', name: 'A'}),
    ).toThrow(/Sign in/);
    activeUser = owner;
    expect(() =>
      onlineVoiceSettingsStore.save(owner, {id: '../x', name: 'A'}),
    ).toThrow(/valid/);
    expect(() =>
      onlineVoiceSettingsStore.save(owner, {id: 'voice_a', name: '  '}),
    ).toThrow(/valid/);
    jest.spyOn(localSettingsStore, 'set').mockReturnValueOnce(false);
    expect(() =>
      onlineVoiceSettingsStore.save(owner, {id: 'voice_a', name: 'A'}),
    ).toThrow(/Could not save/);
    expect(onlineVoiceSettingsStore.read(owner)).toBeNull();
  });

  it('never turns corrupt saved data into a request ID', () => {
    const userId = student('pref-corrupt');
    localSettingsStore.set(
      userId,
      ONLINE_VOICE_KEY,
      JSON.stringify({id: '../../admin', name: 'x'}),
    );
    expect(() => onlineVoiceSettingsStore.read(userId)).toThrow(
      /Choose a voice again/,
    );
    localSettingsStore.set(userId, ONLINE_VOICE_KEY, '{not json');
    expect(() => onlineVoiceSettingsStore.read(userId)).toThrow();
  });
});

describe('Voice catalogue loading', () => {
  it('loads and sanitizes the catalogue for a signed-in student in Online Mode', async () => {
    const userId = student('cat');
    signIn(userId);
    const request = jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {
        provider: 'elevenlabs',
        voices: [
          {id: 'voice_a', name: 'Alice'},
          {id: '../bad', name: 'Bad'},
          {id: 'voice_c', name: ''},
          null,
          {id: 'voice_d', name: 'D'.repeat(300)},
        ],
      },
    } as never);
    const voices = await loadOnlineVoices(userId, new AbortController().signal);
    expect(request).toHaveBeenCalledWith(
      '/v1/ai/tts/voices',
      expect.objectContaining({method: 'GET'}),
      true,
    );
    expect(voices.map(v => v.id)).toEqual(['voice_a', 'voice_d']);
    expect(voices[1].name).toHaveLength(160);
  });

  it.each([
    ['a guest', GUEST_USER_ID, true, true, /Sign in/],
    ['Online Mode off', 'off', false, true, /Enable Online Mode/],
    ['no internet', 'net', true, false, /Connect to the internet/],
  ])('makes no request for %s', async (_label, kind, mode, online, message) => {
    const userId =
      kind === GUEST_USER_ID ? GUEST_USER_ID : student(String(kind));
    if (userId === GUEST_USER_ID) {
      userStore.createGuestUser();
    }
    signIn(userId, mode as boolean);
    (cloudClient.isOnline as jest.Mock).mockResolvedValue(online);
    const request = jest.spyOn(cloudClient, 'request');
    await expect(
      loadOnlineVoices(userId, new AbortController().signal),
    ).rejects.toThrow(message as RegExp);
    expect(request).not.toHaveBeenCalled();
  });

  it('discards a response that arrives after an account switch or malformed payloads', async () => {
    const userId = student('cat-switch');
    signIn(userId);
    jest.spyOn(cloudClient, 'request').mockImplementationOnce(async () => {
      activeUser = 'someone-else';
      return {
        status: 'success',
        data: {provider: 'elevenlabs', voices: [{id: 'voice_a', name: 'A'}]},
      } as never;
    });
    await expect(
      loadOnlineVoices(userId, new AbortController().signal),
    ).rejects.toThrow(/stopped/);
    activeUser = userId;
    jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
      status: 'success',
      data: {provider: 'other', voices: []},
    } as never);
    await expect(
      loadOnlineVoices(userId, new AbortController().signal),
    ).rejects.toThrow(/unavailable/);
  });
});

describe('Online speech provider with a selected voice', () => {
  it('requests fast speech by default only in the provider test APK and honors an explicit standard request', async () => {
    const native = NativeModules as {CapstoneBuild?: Record<string, unknown>};
    const original = native.CapstoneBuild;
    const userId = student('provider-test-default');
    signIn(userId);
    const request = fakeCloud(() => ttsOk('server_default'));
    try {
      native.CapstoneBuild = {
        providerTestingEnabled: true,
        backendSwitchEnabled: true,
      };
      const fast = createCallSpeechProvider(userId);
      await fast.speakText('Fast test speech');
      await fast.dispose?.();
      const standard = createCallSpeechProvider(userId, {latency: 'standard'});
      await standard.speakText('Standard test speech');
      await standard.dispose?.();
      native.CapstoneBuild = {
        providerTestingEnabled: false,
        backendSwitchEnabled: true,
      };
      const ordinary = createCallSpeechProvider(userId);
      await ordinary.speakText('Normal build speech');
      await ordinary.dispose?.();
      expect(ttsBodies(request).map(body => body.latency)).toEqual([
        'low',
        undefined,
        undefined,
      ]);
    } finally {
      native.CapstoneBuild = original;
    }
  });

  it('sends the saved voiceId for an ordinary student and plays ElevenLabs audio', async () => {
    const userId = student('speak');
    signIn(userId);
    onlineVoiceSettingsStore.save(userId, {id: 'voice_b', name: 'Bella'});
    const request = fakeCloud(body => ttsOk(body.voiceId ?? 'default'));
    const provider = createCallSpeechProvider(userId);
    const result = await provider.speakText('Your thesis draft is due at 5 PM');
    expect(result).toEqual({source: 'elevenlabs'});
    expect(ttsBodies(request)).toEqual([
      expect.objectContaining({
        voiceId: 'voice_b',
        provider: 'elevenlabs',
        text: 'Your thesis draft is due at 5 PM',
      }),
    ]);
    expect(tts.speak).not.toHaveBeenCalled();
    await provider.dispose?.();
  });

  it('omits voiceId for the server default', async () => {
    const userId = student('speak-default');
    signIn(userId);
    const request = fakeCloud(() => ttsOk('server_default'));
    const provider = createCallSpeechProvider(userId);
    expect((await provider.speakText('Hello')).source).toBe('elevenlabs');
    expect(ttsBodies(request)[0]).not.toHaveProperty('voiceId');
    await provider.dispose?.();
  });

  it('falls back to the device voice, with the reason, when the server used a different voice', async () => {
    const userId = student('speak-mismatch');
    signIn(userId);
    let voiceId: string | null = 'voice_b';
    fakeCloud(() => ttsOk('voice_a'));
    const provider = createCallSpeechProvider(userId, {
      getVoiceId: () => voiceId,
    });
    const result = await provider.speakText('Lab report');
    expect(result.source).toBe('native_tts');
    expect(result.fallbackReason).toMatch(/invalid audio/);
    expect(tts.speak).toHaveBeenCalledWith('Lab report');
    voiceId = null;
    await provider.dispose?.();
  });

  it('keys prepared audio by voice, so a new choice is never served stale audio', async () => {
    const userId = student('cache');
    signIn(userId);
    let voiceId: string | null = 'voice_a';
    const request = fakeCloud(body => ttsOk(body.voiceId ?? 'default'));
    const provider = createCallSpeechProvider(userId, {
      getVoiceId: () => voiceId,
    });
    await provider.prepareText?.('Algorithms exam');
    voiceId = 'voice_b';
    expect((await provider.speakText('Algorithms exam')).source).toBe(
      'elevenlabs',
    );
    expect(ttsBodies(request).map(b => b.voiceId)).toEqual([
      'voice_a',
      'voice_b',
    ]);
    voiceId = 'voice_a';
    expect((await provider.speakText('Algorithms exam')).source).toBe(
      'elevenlabs',
    );
    // voice_a audio was prepared earlier, so no third paid request is made.
    expect(ttsBodies(request)).toHaveLength(2);
    await provider.dispose?.();
  });

  it.each([
    ['voice change', 'voice'],
    ['account switch', 'owner'],
    ['explicit Stop', 'stop'],
  ])(
    'cancels silently on a %s while the paid request is pending',
    async (_label, change) => {
      const userId = student(`pending-${change}`);
      signIn(userId);
      let voiceId: string | null = 'voice_a';
      const gate = deferred<unknown>();
      fakeCloud(() => gate.promise);
      const provider = createCallSpeechProvider(userId, {
        getVoiceId: () => voiceId,
      });
      const speaking = provider.speakText('Pending reminder');
      await waitFor(() =>
        expect(cloudClient.request).toHaveBeenCalledWith(
          '/v1/ai/tts',
          expect.anything(),
          true,
        ),
      );
      if (change === 'voice') voiceId = 'voice_b';
      if (change === 'owner') activeUser = 'another-account';
      if (change === 'stop') await provider.stopSpeech?.();
      gate.resolve(ttsOk('voice_a'));
      expect((await speaking).source).toBe('cancelled');
      expect(tts.speak).not.toHaveBeenCalled();
      expect(RNFS.writeFile).not.toHaveBeenCalled();
      await provider.dispose?.();
    },
  );

  it('falls back to the device voice when ElevenLabs times out, unlike an explicit Stop', async () => {
    jest.useFakeTimers();
    const userId = student('timeout');
    signIn(userId);
    jest
      .spyOn(cloudClient, 'request')
      .mockImplementation(async (path: string, init?: RequestInit) => {
        if (path === '/v1/ai/tts/capabilities') return capabilityOk as never;
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ) as never;
      });
    const provider = createCallSpeechProvider(userId, {getVoiceId: () => null});
    const speaking = provider.speakText('Slow network reminder');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(18_000);
    });
    const result = await speaking;
    expect(result.source).toBe('native_tts');
    expect(result.fallbackReason).toMatch(/took too long/);
    expect(tts.speak).toHaveBeenCalledWith('Slow network reminder');
    await provider.dispose?.();
  });

  it('does not leak one operation’s failure reason into the next', async () => {
    const userId = student('reason');
    signIn(userId);
    let fail = true;
    fakeCloud(() =>
      fail
        ? {status: 'rate_limited', error: 'Daily speech quota reached.'}
        : ttsOk('voice_a'),
    );
    const provider = createCallSpeechProvider(userId, {
      getVoiceId: () => 'voice_a',
    });
    expect((await provider.speakText('One')).fallbackReason).toBe(
      'Daily speech quota reached.',
    );
    fail = false;
    expect(await provider.speakText('Two')).toEqual({source: 'elevenlabs'});
    (cloudClient.isOnline as jest.Mock).mockResolvedValue(false);
    expect(await provider.speakText('Three')).toEqual({source: 'native_tts'});
    await provider.dispose?.();
  });

  it('keeps offline speech independent: no request when Online Mode is off, offline, or for guests', async () => {
    const userId = student('offline');
    signIn(userId, false);
    const request = jest.spyOn(cloudClient, 'request');
    const off = createCallSpeechProvider(userId);
    expect(await off.speakText('Mode off')).toEqual({source: 'native_tts'});
    await off.dispose?.();

    localSettingsStore.set(userId, 'chat.onlineMode', 'true');
    (cloudClient.isOnline as jest.Mock).mockResolvedValue(false);
    const noNet = createCallSpeechProvider(userId);
    expect(await noNet.speakText('No internet')).toEqual({
      source: 'native_tts',
    });
    await noNet.dispose?.();

    const guest = createCallSpeechProvider(GUEST_USER_ID, {
      isOnlineMode: () => true,
    });
    (cloudClient.isOnline as jest.Mock).mockResolvedValue(true);
    expect(await guest.speakText('Guest reminder')).toEqual({
      source: 'native_tts',
    });
    await guest.dispose?.();

    expect(request).not.toHaveBeenCalled();
    expect(tts.speak).toHaveBeenCalledTimes(3);
  });

  it('still speaks offline when the saved online voice is corrupt, and explains it online', async () => {
    const userId = student('corrupt-speak');
    signIn(userId, false);
    localSettingsStore.set(userId, ONLINE_VOICE_KEY, '{broken');
    const request = jest.spyOn(cloudClient, 'request');
    const offline = createCallSpeechProvider(userId);
    expect(await offline.speakText('Offline still works')).toEqual({
      source: 'native_tts',
    });
    await offline.dispose?.();
    expect(request).not.toHaveBeenCalled();

    localSettingsStore.set(userId, 'chat.onlineMode', 'true');
    const online = createCallSpeechProvider(userId);
    const result = await online.speakText('Online with a broken choice');
    expect(result.source).toBe('native_tts');
    expect(result.fallbackReason).toMatch(/Choose an online voice again/);
    expect(request).not.toHaveBeenCalledWith(
      '/v1/ai/tts',
      expect.anything(),
      true,
    );
    await online.dispose?.();
  });

  it('does not stop other speech when an idle provider is disposed', async () => {
    const stop = jest.spyOn(ttsService, 'stopSpeechPlayback');
    const provider = createCallSpeechProvider(student('idle'));
    await provider.dispose?.();
    expect(stop).not.toHaveBeenCalled();
  });
});

describe('DeepSeek chat contract', () => {
  it('sends camelCase useHandbook and fits the server limits while keeping the newest turn', async () => {
    const request = jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {reply: 'ok', usedHandbook: false, sources: []},
    } as never);
    const history = Array.from({length: 14}, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: `${i}:` + 'x'.repeat(5000),
    }));
    history.push({role: 'user', content: 'Newest question?'});
    await onlineChatSkill.sendChatMessage(history, {useHandbook: true});
    const body = JSON.parse(
      String((request.mock.calls[0][1] as RequestInit).body),
    );
    expect(body).toHaveProperty('useHandbook', true);
    expect(body).not.toHaveProperty('use_handbook');
    expect(body.messages.length).toBeLessThanOrEqual(10);
    expect(
      body.messages.every((m: {content: string}) => m.content.length <= 4090),
    ).toBe(true);
    expect(
      body.messages.reduce(
        (n: number, m: {content: string}) => n + m.content.length,
        0,
      ),
    ).toBeLessThanOrEqual(8000);
    expect(body.messages[body.messages.length - 1]).toEqual({
      role: 'user',
      content: 'Newest question?',
    });
  });

  it('normalizes backend handbook pages, usedHandbook and status fields', async () => {
    jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
      status: 'success',
      data: {
        provider: 'deepseek',
        reply: 'Grounded answer.',
        usedHandbook: true,
        sources: [
          {page: '42', pageEnd: '43', section: 'Grading System', score: 0.8},
        ],
      },
    } as never);
    const reply = await onlineChatSkill.sendChatMessage([
      {role: 'user', content: 'Grading?'},
    ]);
    expect(reply.data?.usedHandbook).toBe(true);
    expect(reply.data?.sources[0].page).toBe(42);

    jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
      status: 'success',
      data: {enabled: true, functional: true, passages: 312},
    } as never);
    const status = await onlineChatSkill.fetchHandbookStatus();
    expect(status.data).toMatchObject({available: true, chunkCount: 312});
  });

  it('identifies a failed online reply instead of presenting a local one as DeepSeek', async () => {
    userStore.createGuestUser();
    jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
      status: 'auth_required',
      error: 'Sign in again.',
    } as never);
    const result = await chatOrchestrator.processMessage(
      GUEST_USER_ID,
      'Tell me a fun fact about space',
      {
        onlineMode: true,
        useHandbook: false,
      },
    );
    expect(result.usedOnline).toBe(false);
    expect(result.reply).toBe(describeOnlineChatFailure('auth_required'));
    expect(describeOnlineChatFailure('rate_limited')).toMatch(/usage limit/);
    expect(describeOnlineChatFailure('server_error')).toMatch(
      /could not reply/,
    );
  });
});

describe('Online Voice picker sheet', () => {
  const themed = (node: React.ReactElement) => (
    <ThemeProvider userId={null}>{node}</ThemeProvider>
  );
  const appStateListeners = (): Array<(state: AppStateStatus) => void> => {
    const listeners: Array<(state: AppStateStatus) => void> = [];
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, handler) => {
        listeners.push(handler as (state: AppStateStatus) => void);
        return {remove: jest.fn()} as unknown as ReturnType<
          typeof AppState.addEventListener
        >;
      });
    return listeners;
  };
  const catalogue = {
    status: 'success' as const,
    data: {
      provider: 'elevenlabs',
      defaultVoiceId: 'voice_a',
      voices: [
        {id: 'voice_a', name: 'Alice'},
        {id: 'voice_b', name: 'Bella'},
      ],
    },
  };

  it('lists Filipina voices first under their own heading, and saves only the ID and name', async () => {
    const userId = student('filipina');
    signIn(userId);
    appStateListeners();
    jest
      .spyOn(cloudClient, 'request')
      .mockImplementation(async (path: string) => {
        if (path !== '/v1/ai/tts/voices') return capabilityOk as never;
        return {
          status: 'success',
          data: {
            provider: 'elevenlabs',
            voices: [
              {
                id: 'fil_camille',
                name: 'Camille',
                language: 'fil',
                gender: 'female',
              },
              {
                id: 'fil_daniella',
                name: 'Ate Daniella',
                language: 'fil',
                gender: 'female',
              },
              {id: 'en_adam', name: 'Adam', language: 'en', gender: 'male'},
              {id: 'odd', name: 'Odd', language: '<b>', gender: 7},
            ],
          },
        } as never;
      });
    const screen = render(
      themed(<OnlineVoice userId={userId} visible onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('online-voice-fil_camille')).toBeTruthy(),
    );
    expect(
      screen.getByTestId('online-voice-group-filipino').props.children,
    ).toBe('Filipina voices');
    expect(screen.getByTestId('online-voice-group-more')).toBeTruthy();
    expect(
      screen.getByTestId('online-voice-fil_camille').props.accessibilityLabel,
    ).toBe('Camille, Female · Filipino');
    expect(
      screen.getByTestId('online-voice-odd').props.accessibilityLabel,
    ).toBe('Odd');
    // On-screen order: default, Filipina voices, then everything else.
    const order = screen
      .getAllByRole('radio')
      .map(node => node.props.testID as string);
    expect(order).toEqual([
      'online-voice-default',
      'online-voice-fil_camille',
      'online-voice-fil_daniella',
      'online-voice-en_adam',
      'online-voice-odd',
    ]);
    await act(async () => {
      fireEvent.press(screen.getByTestId('online-voice-fil_daniella'));
    });
    expect(
      JSON.parse(String(localSettingsStore.get(userId, ONLINE_VOICE_KEY))),
    ).toEqual({id: 'fil_daniella', name: 'Ate Daniella'});
  });

  it('loads voices, saves a tapped voice with radio state, and reports actual ElevenLabs preview', async () => {
    const userId = student('sheet');
    signIn(userId);
    appStateListeners();
    const request = jest
      .spyOn(cloudClient, 'request')
      .mockImplementation(async (path: string, init?: RequestInit) => {
        if (path === '/v1/ai/tts/voices') return catalogue as never;
        if (path === '/v1/ai/tts/capabilities') return capabilityOk as never;
        return ttsOk(JSON.parse(String(init?.body)).voiceId) as never;
      });
    const onChanged = jest.fn();
    const screen = render(
      themed(
        <OnlineVoice
          userId={userId}
          visible
          onClose={jest.fn()}
          onChanged={onChanged}
        />,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('online-voice-voice_b')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('online-voice-voice_b'));
    });
    expect(onlineVoiceSettingsStore.read(userId)).toEqual({
      id: 'voice_b',
      name: 'Bella',
    });
    expect(onChanged).toHaveBeenCalled();
    expect(
      screen.getByTestId('online-voice-voice_b').props.accessibilityState,
    ).toMatchObject({checked: true});
    expect(
      screen.getByTestId('online-voice-default').props.accessibilityState,
    ).toMatchObject({checked: false});
    await act(async () => {
      fireEvent.press(screen.getByTestId('online-voice-preview'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('online-voice-notice').props.children).toMatch(
        /ElevenLabs preview finished/,
      ),
    );
    const previewBody = ttsBodies(request)[0];
    expect(previewBody).toMatchObject({
      voiceId: 'voice_b',
      text: ONLINE_PREVIEW_TEXT,
    });
  });

  it('says honestly when Preview used the offline device voice', async () => {
    const userId = student('sheet-native');
    signIn(userId);
    appStateListeners();
    jest
      .spyOn(cloudClient, 'request')
      .mockImplementation(async (path: string) => {
        if (path === '/v1/ai/tts/voices') return catalogue as never;
        if (path === '/v1/ai/tts/capabilities') return capabilityOk as never;
        return {
          status: 'server_unavailable',
          error: 'ElevenLabs is busy.',
        } as never;
      });
    const screen = render(
      themed(<OnlineVoice userId={userId} visible onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('online-voice-voice_a')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('online-voice-preview'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('online-voice-notice').props.children).toMatch(
        /offline device voice, not ElevenLabs\. ElevenLabs is busy\./,
      ),
    );
  });

  it('refuses Preview while other audio is busy, and ignores repeated taps during admission', async () => {
    const userId = student('sheet-busy');
    signIn(userId);
    appStateListeners();
    jest.spyOn(cloudClient, 'request').mockResolvedValue(catalogue as never);
    const gate = deferred<boolean>();
    const isRecording = jest
      .spyOn(meetingRecorder, 'isRecording')
      .mockReturnValue(gate.promise);
    const screen = render(
      themed(<OnlineVoice userId={userId} visible onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('online-voice-voice_a')).toBeTruthy(),
    );
    act(() => {
      fireEvent.press(screen.getByTestId('online-voice-preview'));
    });
    // A second tap while admission is pending stops instead of starting twice.
    act(() => {
      fireEvent.press(screen.getByTestId('online-voice-preview'));
    });
    await act(async () => {
      gate.resolve(true);
    });
    expect(isRecording).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('online-voice-notice').props.children).toBe(
      'Preview stopped.',
    );
    expect(tts.speak).not.toHaveBeenCalled();

    isRecording.mockResolvedValue(true);
    await act(async () => {
      fireEvent.press(screen.getByTestId('online-voice-preview'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('online-voice-notice').props.children).toMatch(
        /Finish the current speech or recording/,
      ),
    );
    expect(tts.speak).not.toHaveBeenCalled();
  });

  it('stops loading on background, and never saves for a closed sheet', async () => {
    const userId = student('sheet-close');
    signIn(userId);
    const listeners = appStateListeners();
    let signal: AbortSignal | undefined;
    jest
      .spyOn(cloudClient, 'request')
      .mockImplementation((_path: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise(() => undefined) as never;
      });
    const screen = render(
      themed(<OnlineVoice userId={userId} visible onClose={jest.fn()} />),
    );
    await waitFor(() => expect(signal).toBeDefined());
    act(() => listeners.forEach(listener => listener('background')));
    expect(signal?.aborted).toBe(true);
    screen.rerender(
      themed(
        <OnlineVoice userId={userId} visible={false} onClose={jest.fn()} />,
      ),
    );
    expect(onlineVoiceSettingsStore.read(userId)).toBeNull();
  });

  it('shows the server default and a notice when the saved choice is corrupt', async () => {
    const userId = student('sheet-corrupt');
    signIn(userId, false);
    appStateListeners();
    localSettingsStore.set(userId, ONLINE_VOICE_KEY, '{broken');
    const request = jest.spyOn(cloudClient, 'request');
    const screen = render(
      themed(<OnlineVoice userId={userId} visible onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('online-voice-notice').props.children).toMatch(
        /Enable Online Mode in Chat/,
      ),
    );
    expect(
      screen.getByTestId('online-voice-default').props.accessibilityState,
    ).toMatchObject({checked: true});
    expect(request).not.toHaveBeenCalled();
  });
});
