import {
  createSpeechClient,
  type NativeSpeechBridge,
  type SpeechInventory,
} from '../src/core/native/textToSpeech';
import {
  decodePreferences,
  defaultPreferences,
  speechPreferences,
  validateSpeechPreferences,
} from '../src/core/domain/preferences';

const options = speechPreferences(defaultPreferences('UTC'));
const ready: SpeechInventory = {
  available: true,
  enginePackage: 'synthetic.engine',
  engines: [{packageName: 'synthetic.engine', label: 'Synthetic engine'}],
  voices: [
    {
      name: 'local',
      languageTag: 'en-US',
      offline: true,
      installed: true,
      quality: 300,
      latency: 100,
    },
  ],
  selectedVoiceName: 'local',
  initializationMs: 7,
};
function fixture() {
  const native: NativeSpeechBridge = {
    initialize: jest.fn(async () => JSON.stringify(ready)),
    speak: jest.fn(async id => JSON.stringify({accepted: true, requestId: id})),
    stop: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
    openSettings: jest.fn(async () => true),
    diagnostics: jest.fn(async () => '{"events":[]}'),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
  let listener: ((value: unknown) => void) | undefined;
  const remove = jest.fn();
  const client = createSpeechClient(
    () => native,
    callback => {
      listener = callback;
      return remove;
    },
  );
  return {native, client, emit: (value: unknown) => listener?.(value), remove};
}

describe('system speech interoperability and compatible voice preferences', () => {
  it('keeps older schema-1 settings unchanged and derives lazy local defaults', () => {
    const old = defaultPreferences('UTC');
    const decoded = decodePreferences(JSON.stringify(old));
    expect(decoded).toEqual(old);
    expect(decoded.tts).toBeUndefined();
    expect(speechPreferences(decoded)).toEqual({
      enginePackage: null,
      voiceName: null,
      languageTag: 'en-US',
      rate: 1,
      pitch: 1,
    });
    const saved = {
      ...old,
      tts: {
        ...options,
        enginePackage: 'synthetic.engine',
        voiceName: 'local',
        rate: 0.75,
      },
    };
    expect(decodePreferences(JSON.stringify(saved))).toEqual(saved);
  });
  it.each([
    null,
    {},
    {...options, enginePackage: 'https://engine.example'},
    {...options, voiceName: ''},
    {...options, languageTag: 'en_US'},
    {...options, rate: '1'},
    {...options, rate: 0.49},
    {...options, pitch: 2.01},
  ])(
    'rejects invalid persisted voice options without rewriting other settings: %p',
    tts => {
      expect(validateSpeechPreferences(tts)).not.toBeNull();
      expect(() =>
        decodePreferences(JSON.stringify({...defaultPreferences('UTC'), tts})),
      ).toThrow();
    },
  );
  it('has an honest missing-native fallback and harmless cleanup', async () => {
    const client = createSpeechClient(
      () => undefined,
      () => () => undefined,
    );
    expect(await client.initialize(options)).toMatchObject({
      available: false,
      reason: 'NATIVE_UNAVAILABLE',
    });
    expect(await client.speak('request1', 'Synthetic reply')).toEqual({
      accepted: false,
      requestId: 'request1',
      reason: 'NATIVE_UNAVAILABLE',
    });
    await client.stop('user-stopped');
    await client.dispose();
    expect(await client.openSettings()).toBe(false);
    expect(await client.diagnostics()).toEqual({events: []});
  });
  it('passes validated options and accepts only an installed offline selection', async () => {
    const f = fixture();
    expect(await f.client.initialize(options)).toEqual(ready);
    expect(f.native.initialize).toHaveBeenCalledWith(JSON.stringify(options));
    for (const change of [{offline: false}, {installed: false}]) {
      jest
        .mocked(f.native.initialize)
        .mockResolvedValueOnce(
          JSON.stringify({...ready, voices: [{...ready.voices[0], ...change}]}),
        );
      await expect(f.client.initialize(options)).rejects.toThrow(
        'offline voice',
      );
    }
  });
  it('rejects oversized/malformed native inventories rather than claiming speech is ready', async () => {
    const f = fixture();
    for (const raw of [
      '{',
      'x'.repeat(512_001),
      JSON.stringify({...ready, voices: Array(501).fill(ready.voices[0])}),
      JSON.stringify({...ready, available: 'true'}),
    ]) {
      jest.mocked(f.native.initialize).mockResolvedValueOnce(raw);
      await expect(f.client.initialize(options)).rejects.toThrow();
    }
  });
  it('validates request identity and text before sending it to the platform', async () => {
    const f = fixture();
    for (const [id, text] of [
      ['bad/id', 'reply'],
      ['ok', ' '],
      ['ok', 'x'.repeat(601)],
    ] as const) {
      await expect(f.client.speak(id, text)).rejects.toThrow();
    }
    expect(f.native.speak).not.toHaveBeenCalled();
    jest
      .mocked(f.native.speak)
      .mockResolvedValueOnce('{"accepted":true,"requestId":"wrong"}');
    await expect(f.client.speak('valid', 'A synthetic reply')).rejects.toThrow(
      'identity',
    );
  });
  it('distinguishes immediate acceptance from later start/done callbacks and strips transcript fields', async () => {
    const f = fixture();
    const events = jest.fn();
    const off = f.client.subscribe(events);
    expect(await f.client.speak('valid', 'A synthetic reply')).toEqual({
      accepted: true,
      requestId: 'valid',
    });
    expect(events).not.toHaveBeenCalled();
    f.emit({
      requestId: 'valid',
      type: 'start',
      elapsedMs: 14,
      requestToStartMs: 14,
      text: 'private text must not become diagnostics',
    });
    expect(events).toHaveBeenLastCalledWith({
      requestId: 'valid',
      type: 'start',
      elapsedMs: 14,
      requestToStartMs: 14,
    });
    f.emit({requestId: 'valid', type: 'done', elapsedMs: 100});
    expect(events).toHaveBeenLastCalledWith({
      requestId: 'valid',
      type: 'done',
      elapsedMs: 100,
    });
    off();
    expect(f.remove).toHaveBeenCalledTimes(1);
  });
  it('fails malformed native events toward text and stops the current request', async () => {
    const f = fixture();
    const events = jest.fn();
    f.client.subscribe(events);
    await f.client.speak('current', 'A synthetic reply');
    f.emit({requestId: 'current', type: 'start', elapsedMs: -1});
    expect(events).toHaveBeenCalledWith({
      requestId: 'current',
      type: 'error',
      elapsedMs: 0,
      reason: 'INVALID_NATIVE_EVENT',
    });
    expect(f.native.stop).toHaveBeenCalledWith('invalid_native_event');
  });
  it('bounds native event history and validates setup results and stop reasons', async () => {
    const f = fixture();
    jest
      .mocked(f.native.diagnostics)
      .mockResolvedValueOnce(JSON.stringify({events: Array(201).fill({})}));
    await expect(f.client.diagnostics()).rejects.toThrow('history');
    jest
      .mocked(f.native.openSettings)
      .mockResolvedValueOnce('true' as unknown as boolean);
    await expect(f.client.openSettings()).rejects.toThrow();
    await expect(f.client.stop('a private transcript')).rejects.toThrow();
    expect(f.native.stop).not.toHaveBeenCalled();
  });
});
