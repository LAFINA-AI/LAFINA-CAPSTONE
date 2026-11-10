/**
 * Voice mode answers like a conversation: the reply is shown while DeepSeek
 * writes it, and its first sentence is spoken before the rest exists. Later
 * sentences are grouped so a reply needs only a few speech requests.
 */
import React from 'react';
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
  createCallSpeechProvider,
  speakableText,
  takeSpeechSegment,
  FIRST_SEGMENT_MAX_CHARS,
} from '../../src/cloud/speechService';
import {cloudClient} from '../../src/cloud/cloudClient';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {__resetTtsForTests} from '../../src/ai/tts/ttsService';
import {VoiceModal} from '../../src/ui/components/VoiceModal';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

const tts = Tts as unknown as Record<string, jest.Mock>;
const AUDIO = Buffer.from('SYNTHETIC_MP3_BYTES').toString('base64');

let serial = 0;
let activeUser: string | null = null;
const student = (label: string): string => {
  serial += 1;
  const id = `vstream-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};
const signIn = (userId: string) => {
  userStore.setCurrentUser(userId);
  activeUser = userId;
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: activeUser,
    accessToken: 'synthetic-token',
    refreshToken: null,
  }));
  localSettingsStore.set(userId, 'chat.onlineMode', 'true');
};

interface SpeechCall {
  text: string;
  latency?: string;
}
/** Fake ElevenLabs through the backend; records each synthesized text. */
const fakeSpeech = (
  respond?: (text: string) => unknown | Promise<unknown>,
): SpeechCall[] => {
  const calls: SpeechCall[] = [];
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
        const body = JSON.parse(String(init?.body));
        calls.push({text: body.text, latency: body.latency});
        if (respond) return (await respond(body.text)) as never;
        return {
          status: 'success',
          data: {
            provider: 'elevenlabs',
            requestId: 'r',
            audioBase64: AUDIO,
            mimeType: 'audio/mpeg',
            model: 'eleven_v4_turbo',
            voice: 'default',
            createdAt: new Date().toISOString(),
          },
        } as never;
      }
      throw new Error(`unexpected ${path}`);
    });
  return calls;
};

const words = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');

const REPLY = [
  'Hey Lem, kumusta ka today?',
  'Photosynthesis is how plants turn light into food.',
  'Leaves catch sunlight with chlorophyll.',
  'Water is split and oxygen is released.',
  'Then carbon dioxide becomes sugar for growth.',
].join(' ');

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

describe('Cutting a reply that is still being written', () => {
  const first = {first: true, final: false};
  const later = {first: false, final: false};

  it('starts with the first finished sentence and waits for unfinished ones', () => {
    expect(takeSpeechSegment('Hey Lem, kumusta', 0, first)).toBeNull();
    // A sentence counts as finished once the next word has begun.
    expect(takeSpeechSegment('Hey Lem, kumusta ka today?', 0, first)).toBeNull();
    const piece = takeSpeechSegment('Hey Lem, kumusta ka today? Photo', 0, first);
    expect(piece).toEqual({text: 'Hey Lem, kumusta ka today?', end: 26});
    // Too short to be worth its own request: it joins the next sentence.
    expect(takeSpeechSegment('Hi! How are you doing? I', 0, first)?.text).toBe(
      'Hi! How are you doing?',
    );
  });

  it('later pieces take every finished sentence, and the last takes the rest', () => {
    const text = 'One sentence here. Two sentences here. Three is still being wri';
    expect(takeSpeechSegment(text, 0, later)?.text).toBe(
      'One sentence here. Two sentences here.',
    );
    expect(takeSpeechSegment(text, 38, later)).toBeNull();
    expect(
      takeSpeechSegment(text, 38, {first: false, final: true})?.text,
    ).toBe('Three is still being wri');
  });

  it('a long first sentence is cut at a comma so the voice still starts early', () => {
    const long = `${'This sentence keeps going, '.repeat(10)}and so on`;
    const piece = takeSpeechSegment(long, 0, first);
    expect(piece).not.toBeNull();
    expect(piece!.text.length).toBeLessThanOrEqual(FIRST_SEGMENT_MAX_CHARS);
    expect(piece!.text.endsWith(',')).toBe(true);
  });
});

describe('Speaking a streamed reply', () => {
  it('speaks the first sentence before the reply is finished, in few requests', async () => {
    const userId = student('stream');
    signIn(userId);
    const calls = fakeSpeech();
    const provider = createCallSpeechProvider(userId, {latency: 'low'});
    const stream = provider.startSpeechStream!();

    // DeepSeek writes the reply a few words at a time.
    const tokens = REPLY.split(/(?<= )/);
    let soFar = '';
    for (const [index, token] of tokens.entries()) {
      soFar += token;
      stream.update(soFar);
      if (index === 6) {
        // Only the first sentence exists yet, and it is already being voiced.
        await waitFor(() => expect(calls.length).toBe(1));
        expect(calls[0].text).toBe('Hey Lem, kumusta ka today?');
      }
    }
    const result = await stream.finish(REPLY);
    expect(result.source).toBe('elevenlabs');
    // Everything spoken exactly once, in order, with nothing left out.
    expect(words(calls.map(c => c.text).join(' '))).toBe(words(REPLY));
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls.every(c => c.latency === 'low')).toBe(true);
    expect(tts.speak).not.toHaveBeenCalled();
    await provider.dispose?.();
  });

  it('once the reply is complete, the rest is requested without waiting for the first audio', async () => {
    const userId = student('prefetch');
    signIn(userId);
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    let count = 0;
    const calls = fakeSpeech(async () => {
      count += 1;
      if (count === 1) await firstGate; // the first piece is slow to synthesize
      return {
        status: 'success',
        data: {
          provider: 'elevenlabs',
          requestId: 'r',
          audioBase64: AUDIO,
          mimeType: 'audio/mpeg',
          model: 'eleven_v4_turbo',
          voice: 'default',
          createdAt: new Date().toISOString(),
        },
      };
    });
    const provider = createCallSpeechProvider(userId);
    const stream = provider.startSpeechStream!();
    stream.update(REPLY.slice(0, 40));
    await waitFor(() => expect(calls.length).toBe(1));
    const done = stream.finish(REPLY);
    // The rest is already being synthesized while the first piece still is.
    await waitFor(() => expect(calls.length).toBe(2));
    releaseFirst();
    expect((await done).source).toBe('elevenlabs');
    expect(words(calls.map(c => c.text).join(' '))).toBe(words(REPLY));
    await provider.dispose?.();
  });

  it('does not repeat a sentence when the saved reply only changes letter case', async () => {
    const userId = student('case');
    signIn(userId);
    const calls = fakeSpeech();
    const provider = createCallSpeechProvider(userId);
    const stream = provider.startSpeechStream!();
    stream.update('I am LAFINA, your helper. Ask me ');
    await waitFor(() => expect(calls.length).toBe(1));
    await stream.finish('I am lafina, your helper. Ask me anything.');
    expect(calls.map(c => c.text)).toEqual([
      'I am LAFINA, your helper.',
      'Ask me anything.',
    ]);
    // Without the option the standard (most expressive) model is used.
    expect(calls[0].latency).toBeUndefined();
    await provider.dispose?.();
  });

  it('if online speech fails, the device voice reads the rest of the reply', async () => {
    const userId = student('fail');
    signIn(userId);
    const calls = fakeSpeech(() => ({
      status: 'rate_limited',
      error: 'Speech limit reached.',
    }));
    const provider = createCallSpeechProvider(userId);
    const stream = provider.startSpeechStream!();
    stream.update(REPLY.slice(0, 40));
    const result = await stream.finish(REPLY);
    expect(result).toEqual({
      source: 'native_tts',
      fallbackReason: 'Speech limit reached.',
    });
    const spoken = tts.speak.mock.calls.map(([text]) => text).join(' ');
    expect(words(spoken)).toBe(words(REPLY));
    expect(calls.length).toBeLessThanOrEqual(3);
    await provider.dispose?.();
  });

  it('Stop ends a streamed reply; nothing more is requested', async () => {
    const userId = student('stop');
    signIn(userId);
    const calls = fakeSpeech();
    const provider = createCallSpeechProvider(userId);
    const stream = provider.startSpeechStream!();
    stream.update('First sentence is here. Sec');
    await waitFor(() => expect(calls.length).toBe(1));
    await provider.stopSpeech?.();
    stream.update(REPLY);
    expect((await stream.finish(REPLY)).source).toBe('cancelled');
    expect(calls.length).toBe(1);
    await provider.dispose?.();
  });

  it('a reply that was never streamed is still spoken, first sentence first', async () => {
    const userId = student('whole');
    signIn(userId);
    const calls = fakeSpeech();
    const provider = createCallSpeechProvider(userId);
    const result = await provider.startSpeechStream!().finish(REPLY);
    expect(result.source).toBe('elevenlabs');
    expect(calls[0].text).toBe('Hey Lem, kumusta ka today?');
    expect(words(calls.map(c => c.text).join(' '))).toBe(
      words(speakableText(REPLY)),
    );
    await provider.dispose?.();
  });
});

describe('Voice mode', () => {
  it('shows and speaks the reply while DeepSeek is still writing it', async () => {
    const userId = student('modal');
    signIn(userId);
    const calls = fakeSpeech();
    let finishReply: () => void = () => undefined;
    const process = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockImplementation(async (_user, _text, options) => {
        options?.onReplyText?.('Sige! Let us plan your week. Fir');
        await new Promise<void>(resolve => {
          finishReply = resolve;
        });
        return {
          reply: 'Sige! Let us plan your week. First, list your exams.',
        } as never;
      });
    const utils = render(
      <ThemeProvider userId={userId}>
        <VoiceModal visible userId={userId} onClose={jest.fn()} />
      </ThemeProvider>,
    );
    fireEvent.changeText(utils.getByTestId('voice-text-input'), 'plan my week');
    fireEvent.press(utils.getByTestId('voice-send-button'));

    // Before the reply is finished: its text is on screen and being voiced.
    await waitFor(() =>
      expect(utils.getByTestId('voice-reply')).toHaveTextContent(
        /Let us plan your week\. Fir/,
      ),
    );
    await waitFor(() =>
      expect(calls.map(c => c.text)).toEqual(['Sige! Let us plan your week.']),
    );
    expect(process).toHaveBeenCalledWith(
      userId,
      'plan my week',
      expect.objectContaining({
        onlineMode: true,
        onReplyText: expect.any(Function),
      }),
    );
    await act(async () => finishReply());
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1]).toEqual({text: 'First, list your exams.', latency: 'low'});
    expect(tts.speak).not.toHaveBeenCalled();
    utils.unmount();
  });
});

describe('Handbook search for small talk', () => {
  const ask = async (userId: string, text: string) => {
    const stream = jest
      .spyOn(onlineChatSkill, 'streamChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {reply: 'Hello!', sources: []},
      } as never);
    await chatOrchestrator.processMessage(userId, text, {
      onlineMode: true,
      useHandbook: true,
      onReplyText: () => undefined,
    });
    const used = stream.mock.calls[0][1].useHandbook;
    stream.mockRestore();
    return used;
  };

  it('greetings skip the search; real questions keep it', async () => {
    const userId = student('handbook');
    signIn(userId);
    expect(await ask(userId, 'hello')).toBe(false);
    expect(await ask(userId, 'thanks!')).toBe(false);
    expect(await ask(userId, 'hi, what is the USTP dress code?')).toBe(true);
    expect(await ask(userId, 'how do I get on the deans list')).toBe(true);
  });
});
