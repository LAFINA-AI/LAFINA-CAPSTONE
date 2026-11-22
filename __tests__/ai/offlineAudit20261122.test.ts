/**
 * Offline chat/call audit (2026-11-22): whisper's invented words, LAFINA's
 * own voice heard back, the keep-screen-on holder, and the on-device model
 * being stopped when its time is up. Jest only: no device, model or speaker.
 */
import {NativeModules, Platform} from 'react-native';
import {
  GHOST_VAD_CONFIDENCE,
  isEchoOfLine,
  isHallucinatedSpeech,
} from '../../src/ai/stt/speechGhosts';
import {isHallucinatedSpeech as chatInputGhost} from '../../src/ui/components/chat/ChatInput';
import {
  keepScreenOnHolders,
  setKeepScreenOn,
} from '../../src/utils/keepScreenOn';
import {intentService} from '../../src/ai/nlu/intentService';

jest.mock('../../src/ai/nlu/modelManager', () => ({
  ...jest.requireActual('../../src/ai/nlu/modelManager'),
  getActiveOfflineModelReadyConfig: jest.fn(async () => ({
    modelId: 'test-model',
    modelPath: '/data/test-model.gguf',
    promptFormat: 'chatml',
    minValidSizeBytes: 1,
  })),
}));

describe('whisper ghosts', () => {
  it('always drops junk whisper writes on silence', () => {
    for (const text of ['you', 'You.', 'Thanks for watching!', 'Subtitles by the community', '', 'a']) {
      expect(isHallucinatedSpeech(text, 0.99)).toBe(true);
    }
  });

  it('drops plausible words only when the detector was unsure', () => {
    for (const text of ['Thank you.', 'Bye.', 'Okay.', 'Yes.']) {
      expect(isHallucinatedSpeech(text, GHOST_VAD_CONFIDENCE - 0.1)).toBe(true);
      expect(isHallucinatedSpeech(text, 0.9)).toBe(false);
    }
  });

  it('a call keeps plausible words when the detector score is unknown', () => {
    expect(isHallucinatedSpeech('Bye.', undefined)).toBe(false);
    expect(isHallucinatedSpeech('Bye.', undefined, 'push_to_talk')).toBe(true);
  });

  it('real requests are never ghosts', () => {
    expect(isHallucinatedSpeech('Add a quiz on Friday at 9', 0.2)).toBe(false);
    expect(isHallucinatedSpeech('thank you, add it tomorrow', 0.2)).toBe(false);
  });

  it("Chat push-to-talk keeps its old list, and trusts a confident detector", () => {
    expect(chatInputGhost('Thank you.')).toBe(true);
    expect(chatInputGhost('Thank you.', 0.95)).toBe(false);
    expect(chatInputGhost('okay')).toBe(false);
  });
});

describe("LAFINA's own voice heard back", () => {
  const line = 'Okay, I added Quiz to your calendar for Friday.';

  it('matches the exact tail of her last line', () => {
    expect(isEchoOfLine('calendar for Friday', line)).toBe(true);
    expect(isEchoOfLine('to your calendar for Friday.', line)).toBe(true);
  });

  it('never drops a short answer, even one that ends her question', () => {
    expect(isEchoOfLine('save it', 'Should I save it?')).toBe(false);
    expect(isEchoOfLine('yes', 'Say yes')).toBe(false);
    expect(isEchoOfLine('confirm', 'Say confirm')).toBe(false);
  });

  it('different words, or no previous line, are the student', () => {
    expect(isEchoOfLine('what about Saturday', line)).toBe(false);
    expect(isEchoOfLine('calendar for Friday', null)).toBe(false);
  });
});

describe('keep screen on', () => {
  const originalOS = Platform.OS;
  const originalModule = NativeModules.LafinaVoiceConversation;
  const setKeep = jest.fn(async () => true);

  beforeEach(() => {
    Platform.OS = 'android';
    NativeModules.LafinaVoiceConversation = {setKeepScreenOn: setKeep};
    setKeep.mockClear();
  });
  afterEach(() => {
    Platform.OS = originalOS;
    NativeModules.LafinaVoiceConversation = originalModule;
  });

  it('is on while any call holds it and off when the last one lets go', () => {
    setKeepScreenOn('call-a', true);
    setKeepScreenOn('call-b', true);
    expect(setKeep.mock.calls).toEqual([[true]]);
    setKeepScreenOn('call-a', false);
    expect(setKeep.mock.calls).toEqual([[true]]);
    setKeepScreenOn('call-b', false);
    expect(setKeep.mock.calls).toEqual([[true], [false]]);
    expect(keepScreenOnHolders()).toEqual([]);
  });

  it('an older build without the method is harmless', () => {
    NativeModules.LafinaVoiceConversation = {};
    expect(() => setKeepScreenOn('call-c', true)).not.toThrow();
    setKeepScreenOn('call-c', false);
  });
});

describe('on-device model time limit', () => {
  const originalOS = Platform.OS;
  const originalExtractor = NativeModules.LafinaIntentExtractor;
  let extract: jest.Mock;
  let cancel: jest.Mock;

  beforeEach(() => {
    Platform.OS = 'android';
    extract = jest.fn(() => new Promise(() => undefined));
    cancel = jest.fn(async () => true);
    NativeModules.LafinaIntentExtractor = {
      extractIntent: extract,
      cancelExtraction: cancel,
    };
  });
  afterEach(() => {
    Platform.OS = originalOS;
    NativeModules.LafinaIntentExtractor = originalExtractor;
  });

  it('stops the native model when the wait limit passes, and the parser answers', async () => {
    const result = await intentService.extractIntent(
      'pa-remind bukas 9am magpasa ng lab report',
      {preferOnDeviceSlm: true, userId: 'u-1', slmTimeoutMs: 20},
    );
    expect(extract).toHaveBeenCalledTimes(1);
    const {requestId} = extract.mock.calls[0][0];
    expect(typeof requestId).toBe('string');
    expect(cancel).toHaveBeenCalledWith(requestId);
    expect(result.source).not.toBe('on_device_slm');
  });

  it('a model that answers in time is not cancelled', async () => {
    extract.mockResolvedValue(
      JSON.stringify({
        intent: 'create_reminder',
        title: 'Submit Lab Report',
        date: null,
        time: '09:00',
        category: 'Academic',
        engine: 'slm',
      }),
    );
    await intentService.extractIntent('pa-remind bukas 9am magpasa ng lab report', {
      preferOnDeviceSlm: true,
      userId: 'u-1',
      slmTimeoutMs: 2_000,
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('a call trusts a confident parser reading instead of waiting for the model', async () => {
    const clear = 'Remind me to submit the lab report tomorrow at 9 AM';
    await intentService.extractIntent(clear, {
      preferOnDeviceSlm: true,
      trustConfidentFastPath: true,
      userId: 'u-1',
      slmTimeoutMs: 20,
    });
    const callAsked = extract.mock.calls.length;
    extract.mockClear();
    await intentService.extractIntent(clear, {
      preferOnDeviceSlm: true,
      userId: 'u-1',
      slmTimeoutMs: 20,
    });
    // Chat (no trust) asks the model; the call did not.
    expect(callAsked).toBe(0);
    expect(extract).toHaveBeenCalledTimes(1);
  });
});

describe('Chat shows the question at once', () => {
  it('hands the saved message to the screen before the reply is worked out', async () => {
    const {initDatabase} = require('../../src/storage');
    const {chatOrchestrator} = require('../../src/ai/chatOrchestrator');
    const {GUEST_USER_ID} = require('../../src/constants');
    await initDatabase();
    const order: string[] = [];
    const result = await chatOrchestrator.processMessage(
      GUEST_USER_ID,
      'what is on my schedule today?',
      {
        onlineMode: false,
        onUserMessage: (message: {content: string}) =>
          order.push(`user:${message.content}`),
      },
    );
    order.push('reply');
    expect(order).toEqual(['user:what is on my schedule today?', 'reply']);
    expect(result.userMessage.content).toBe('what is on my schedule today?');
  });
});
