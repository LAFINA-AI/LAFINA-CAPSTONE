/**
 * Voice mode follows Online Mode: replies come from DeepSeek and are read
 * with the ElevenLabs voice, long replies in pieces with nothing cut off.
 * Offline, or if online speech fails, the device voice reads everything.
 */
import React from 'react';
import Tts from 'react-native-tts';
import RNFS from 'react-native-fs';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';
import {
  createCallSpeechProvider,
  speakableText,
  splitForSpeech,
  SPEECH_CHUNK_CHARS,
} from '../../src/cloud/speechService';
import {cloudClient} from '../../src/cloud/cloudClient';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {__resetTtsForTests} from '../../src/ai/tts/ttsService';
import {VoiceModal} from '../../src/ui/components/VoiceModal';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

const tts = Tts as unknown as Record<string, jest.Mock>;
const AUDIO = Buffer.from('SYNTHETIC_MP3_BYTES').toString('base64');

let serial = 0;
let activeUser: string | null = null;
const student = (label: string): string => {
  serial += 1;
  const id = `vmode-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};
const signIn = (userId: string, onlineMode: boolean) => {
  userStore.setCurrentUser(userId);
  activeUser = userId;
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: activeUser,
    accessToken: 'synthetic-token',
    refreshToken: null,
  }));
  localSettingsStore.set(
    userId,
    'chat.onlineMode',
    onlineMode ? 'true' : 'false',
  );
};

/** Fake ElevenLabs through the backend; returns the texts that were synthesized. */
const fakeSpeech = (respond?: (text: string) => unknown | Promise<unknown>) => {
  const texts: string[] = [];
  jest
    .spyOn(cloudClient, 'request')
    .mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/v1/ai/tts/capabilities') {
        return {
          status: 'success',
          data: {provider: 'elevenlabs', enabled: true},
        } as never;
      }
      if (path === '/v1/ai/tts') {
        const {text, voiceId} = JSON.parse(String(init?.body));
        texts.push(text);
        if (respond) return (await respond(text)) as never;
        return {
          status: 'success',
          data: {
            provider: 'elevenlabs',
            requestId: 'r',
            audioBase64: AUDIO,
            mimeType: 'audio/mpeg',
            model: 'eleven_v4',
            voice: voiceId ?? 'default',
            createdAt: new Date().toISOString(),
          },
        } as never;
      }
      throw new Error(`unexpected ${path}`);
    });
  return texts;
};

const sentence = (n: number) =>
  `Sentence number ${n} explains one more careful step of the process in plain words.`;
const LONG_REPLY = [
  '**Photosynthesis, step by step**',
  ...Array.from({length: 18}, (_, i) => `- ${sentence(i + 1)}`),
].join('\n');

const words = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');

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
    .mockResolvedValue({status: 'offline', message: 'offline in test'});
});

afterEach(() => {
  jest.restoreAllMocks();
  activeUser = null;
  db.executeSync('DELETE FROM active_session');
});

describe('Speech text', () => {
  it('drops markdown that should not be read aloud', () => {
    expect(
      speakableText(
        '## Steps\n**Bold** idea:\n- first `item`\n2. second\n\n\nDone',
      ),
    ).toBe('Steps\nBold idea:\nfirst item\nsecond\nDone');
  });

  it('splits long text at sentence ends, within the limit, losing nothing', () => {
    const text = speakableText(LONG_REPLY);
    const chunks = splitForSpeech(text);
    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(SPEECH_CHUNK_CHARS);
      expect(chunk).toMatch(/[.*a-z]$/i);
    });
    expect(words(chunks.join(' '))).toBe(words(text));
    // One endless sentence still splits at spaces.
    const endless = Array.from({length: 200}, () => 'word').join(' ');
    const pieces = splitForSpeech(endless);
    expect(pieces.every(p => p.length <= SPEECH_CHUNK_CHARS)).toBe(true);
    expect(words(pieces.join(' '))).toBe(endless);
    expect(splitForSpeech('Short.')).toEqual(['Short.']);
    expect(splitForSpeech('   ')).toEqual([]);
  });
});

describe('Online speech provider with long replies', () => {
  it('reads a long reply entirely with ElevenLabs, in pieces the server accepts', async () => {
    const userId = student('long');
    signIn(userId, true);
    const texts = fakeSpeech();
    const provider = createCallSpeechProvider(userId);
    const result = await provider.speakText(LONG_REPLY);
    expect(result.source).toBe('elevenlabs');
    expect(texts.length).toBeGreaterThan(2);
    texts.forEach(text => expect(text.length).toBeLessThanOrEqual(512));
    // Each piece is synthesized exactly once (the next one is fetched while
    // the current one plays, so requests may overlap), and together they are
    // the whole reply.
    const pieces = splitForSpeech(speakableText(LONG_REPLY));
    expect([...texts].sort()).toEqual([...pieces].sort());
    expect(words(pieces.join(' '))).toBe(words(speakableText(LONG_REPLY)));
    expect(texts.join(' ')).not.toMatch(/\*\*|^- /m);
    expect(tts.speak).not.toHaveBeenCalled();
    await provider.dispose?.();
  });

  it('Stop during a long reply ends it; no further pieces are requested', async () => {
    const userId = student('stop');
    signIn(userId, true);
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const texts = fakeSpeech(async () => {
      await gate;
      return {status: 'server_error', error: 'never used'};
    });
    const provider = createCallSpeechProvider(userId);
    const speaking = provider.speakText(LONG_REPLY);
    await waitFor(() => expect(texts.length).toBeGreaterThan(0));
    await provider.stopSpeech?.();
    release();
    expect((await speaking).source).toBe('cancelled');
    // The first piece and at most the prefetched second one.
    expect(texts.length).toBeLessThanOrEqual(2);
    expect(tts.speak).not.toHaveBeenCalled();
    await provider.dispose?.();
  });

  it('if ElevenLabs fails, the device voice reads the whole reply and says why', async () => {
    const userId = student('fail');
    signIn(userId, true);
    const texts = fakeSpeech(() => ({
      status: 'rate_limited',
      error: 'Speech limit reached.',
    }));
    const provider = createCallSpeechProvider(userId);
    const result = await provider.speakText(LONG_REPLY);
    expect(result.source).toBe('native_tts');
    expect(result.fallbackReason).toBe('Speech limit reached.');
    // One failed attempt (plus the prefetch), not one per piece.
    expect(texts.length).toBeLessThanOrEqual(2);
    const spoken = tts.speak.mock.calls.map(([text]) => text).join(' ');
    expect(words(spoken)).toBe(words(speakableText(LONG_REPLY)));
    await provider.dispose?.();
  });
});

describe('Voice mode', () => {
  const renderVoice = (userId: string) =>
    render(
      <ThemeProvider userId={userId}>
        <VoiceModal visible userId={userId} onClose={jest.fn()} />
      </ThemeProvider>,
    );
  const send = (utils: ReturnType<typeof renderVoice>, text: string) => {
    fireEvent.changeText(utils.getByTestId('voice-text-input'), text);
    fireEvent.press(utils.getByTestId('voice-send-button'));
  };

  it('in Online Mode asks DeepSeek and reads the reply with the online voice', async () => {
    const userId = student('modal-online');
    signIn(userId, true);
    const texts = fakeSpeech();
    const process = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockResolvedValue({reply: 'Hey! Kumusta ang araw mo?'} as never);
    const utils = renderVoice(userId);
    send(utils, 'hi lafina');
    await waitFor(() => expect(texts).toEqual(['Hey! Kumusta ang araw mo?']));
    expect(process).toHaveBeenCalledWith(
      userId,
      'hi lafina',
      expect.objectContaining({onlineMode: true, reviewSurface: 'voice'}),
    );
    expect(tts.speak).not.toHaveBeenCalled();
    utils.unmount();
  });

  it('offline it stays on-device: no DeepSeek, no ElevenLabs, device voice', async () => {
    const userId = student('modal-offline');
    signIn(userId, false);
    const request = jest.spyOn(cloudClient, 'request');
    const process = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockResolvedValue({reply: 'Hello! What can I help with?'} as never);
    const utils = renderVoice(userId);
    send(utils, 'hello');
    await waitFor(() =>
      expect(tts.speak).toHaveBeenCalledWith('Hello! What can I help with?'),
    );
    expect(process).toHaveBeenCalledWith(
      userId,
      'hello',
      expect.objectContaining({onlineMode: false}),
    );
    expect(request).not.toHaveBeenCalled();
    utils.unmount();
  });

  it('shows why when online speech fell back to the device voice', async () => {
    const userId = student('modal-fallback');
    signIn(userId, true);
    fakeSpeech(() => ({status: 'server_error', error: 'ElevenLabs is busy.'}));
    jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockResolvedValue({reply: 'Sige, ayusin natin.'} as never);
    const utils = renderVoice(userId);
    send(utils, 'help me plan');
    await waitFor(() =>
      expect(utils.getByTestId('voice-notice')).toHaveTextContent(
        /device voice: .*ElevenLabs is busy/,
      ),
    );
    expect(tts.speak).toHaveBeenCalledWith('Sige, ayusin natin.');
    utils.unmount();
  });
});
