import {
  createSpeechInputClient,
  type NativeSpeechInputBridge,
  type SpeechInputEvent,
} from '../src/core/native/speechToText';

const available = {
  available: true,
  sdk: 37,
  permission: true,
  onDevice: true,
  whisper: true,
  selectedEngine: 'android',
};
function fixture() {
  let callback: ((value: unknown) => void) | undefined;
  const bridge: NativeSpeechInputBridge = {
    capabilities: jest.fn(async () => JSON.stringify(available)),
    start: jest.fn(async (sessionId, _language, engine) =>
      JSON.stringify({
        accepted: true,
        sessionId,
        engine: engine === 'auto' ? 'android' : engine,
      }),
    ),
    stop: jest.fn(async sessionId =>
      JSON.stringify({accepted: true, sessionId}),
    ),
    cancel: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
    openSettings: jest.fn(async () => true),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
  const remove = jest.fn();
  const client = createSpeechInputClient(
    () => bridge,
    listener => {
      callback = listener;
      return remove;
    },
  );
  const listener = jest.fn<void, [SpeechInputEvent]>();
  const unsubscribe = client.subscribe(listener);
  const emit = (event: Partial<SpeechInputEvent> = {}) =>
    callback?.({
      sessionId: 'one',
      type: 'recording',
      elapsedMs: 100,
      ...event,
    });
  return {client, bridge, emit, listener, remove, unsubscribe};
}

describe('typed offline speech input boundary, not recognition accuracy proof', () => {
  it('honestly reports missing native capability and refuses capture', async () => {
    const client = createSpeechInputClient(
      () => undefined,
      () => () => undefined,
    );
    expect(await client.capabilities()).toMatchObject({
      available: false,
      reason: 'NATIVE_UNAVAILABLE',
      selectedEngine: null,
    });
    expect(await client.start('one', 'en-US', 'auto')).toMatchObject({
      accepted: false,
      reason: 'NATIVE_UNAVAILABLE',
    });
    expect(await client.stop('one')).toMatchObject({accepted: false});
    await expect(
      client.cancel('one', 'user_cancelled'),
    ).resolves.toBeUndefined();
    await expect(client.dispose()).resolves.toBeUndefined();
    expect(await client.openSettings()).toBe(false);
  });

  it('passes only explicit offline engine and language choices to the native boundary', async () => {
    const f = fixture();
    expect(await f.client.capabilities()).toEqual(available);
    expect(await f.client.start('one', 'fil-PH', 'whisper')).toEqual({
      accepted: true,
      sessionId: 'one',
      engine: 'whisper',
    });
    expect(f.bridge.start).toHaveBeenCalledWith('one', 'fil-PH', 'whisper');
    expect(await f.client.stop('one')).toEqual({
      accepted: true,
      sessionId: 'one',
    });
    expect(f.bridge.stop).toHaveBeenCalledWith('one');
  });

  it.each([
    {sdk: 30, onDevice: true},
    {sdk: 37.5},
    {available: 'true'},
    {available: true, selectedEngine: null},
    {selectedEngine: 'network'},
    {selectedEngine: 'whisper', whisper: false},
    {selectedEngine: 'android', onDevice: false},
  ])('rejects malformed/contradictory capability %j', async patch => {
    const f = fixture();
    jest
      .mocked(f.bridge.capabilities)
      .mockResolvedValue(JSON.stringify({...available, ...patch}));
    await expect(f.client.capabilities()).rejects.toThrow();
  });

  it('refuses overlapping starts and allows a fresh request after a terminal event', async () => {
    const f = fixture();
    await f.client.start('one', 'en-US', 'auto');
    expect(await f.client.start('two', 'en-US', 'auto')).toMatchObject({
      accepted: false,
      reason: 'BUSY',
    });
    expect(f.bridge.start).toHaveBeenCalledTimes(1);
    f.emit({type: 'result', transcript: 'Synthetic study draft.'});
    expect(f.listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'result',
        transcript: 'Synthetic study draft.',
      }),
    );
    await f.client.start('two', 'en-US', 'auto');
    expect(f.bridge.start).toHaveBeenCalledTimes(2);
  });

  it('drops stale identities and events after a terminal result', async () => {
    const f = fixture();
    await f.client.start('one', 'en-US', 'auto');
    f.emit({sessionId: 'old'});
    f.emit({
      type: 'result',
      transcript: 'Draft',
      recordingMs: 1000,
      transcriptionMs: 40,
    });
    f.emit({type: 'recording'});
    expect(f.listener).toHaveBeenCalledTimes(1);
    expect(f.listener.mock.calls[0]?.[0]).toEqual({
      sessionId: 'one',
      type: 'result',
      transcript: 'Draft',
      elapsedMs: 100,
      recordingMs: 1000,
      transcriptionMs: 40,
    });
  });

  it('invalidates cancelled work before its native cancellation promise resolves', async () => {
    const f = fixture();
    let finish: (() => void) | undefined;
    jest.mocked(f.bridge.cancel).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await f.client.start('one', 'en-US', 'auto');
    const cancellation = f.client.cancel('one', 'user_cancelled');
    f.emit({type: 'result', transcript: 'Late draft'});
    expect(f.listener).not.toHaveBeenCalled();
    await f.client.start('two', 'en-US', 'auto');
    finish?.();
    await cancellation;
  });

  it.each([
    {type: 'result', transcript: ' '},
    {type: 'result', transcript: 'x'.repeat(2001)},
    {type: 'recording', transcript: 'Unexpected words'},
    {type: 'recording', elapsedMs: -1},
    {type: 'result', transcript: 'Draft', engine: 'cloud'},
  ])(
    'fails malformed native events toward cancellation and text %j',
    async patch => {
      const f = fixture();
      await f.client.start('one', 'en-US', 'auto');
      f.emit(patch as Partial<SpeechInputEvent>);
      expect(f.bridge.cancel).toHaveBeenCalledWith(
        'one',
        'invalid_native_event',
      );
      expect(f.listener).toHaveBeenCalledWith({
        sessionId: 'one',
        type: 'error',
        elapsedMs: 0,
        reason: 'INVALID_NATIVE_EVENT',
      });
      f.emit({type: 'result', transcript: 'Late'});
      expect(f.listener).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects changed start/stop identities and cancels the affected native session', async () => {
    const f = fixture();
    jest
      .mocked(f.bridge.start)
      .mockResolvedValueOnce('{"sessionId":"other","accepted":true}');
    await expect(f.client.start('one', 'en-US', 'auto')).rejects.toThrow(
      'identity',
    );
    expect(f.bridge.cancel).toHaveBeenCalledWith(
      'one',
      'invalid_start_response',
    );
    await f.client.start('two', 'en-US', 'auto');
    jest
      .mocked(f.bridge.stop)
      .mockResolvedValueOnce('{"sessionId":"other","accepted":true}');
    await expect(f.client.stop('two')).rejects.toThrow('identity');
    expect(f.bridge.cancel).toHaveBeenCalledWith(
      'two',
      'invalid_stop_response',
    );
    await expect(
      f.client.start('three', 'en-US', 'auto'),
    ).resolves.toMatchObject({accepted: true});
  });

  it('bounds requests and cancellation reasons before native calls', async () => {
    const f = fixture();
    await expect(f.client.start('bad id', 'en-US', 'auto')).rejects.toThrow();
    await expect(
      f.client.start('one', 'en-US', 'network' as 'auto'),
    ).rejects.toThrow();
    await expect(
      f.client.start('one', 'xx' as 'en-US', 'auto'),
    ).rejects.toThrow();
    await expect(
      f.client.cancel('one', 'raw reason with private words'),
    ).rejects.toThrow();
    expect(f.bridge.start).not.toHaveBeenCalled();
    expect(f.bridge.cancel).not.toHaveBeenCalled();
  });

  it('disposes current identity, removes subscriptions and rejects nonboolean settings results', async () => {
    const f = fixture();
    await f.client.start('one', 'en-US', 'auto');
    await f.client.dispose();
    f.emit();
    expect(f.listener).not.toHaveBeenCalled();
    expect(f.bridge.dispose).toHaveBeenCalledTimes(1);
    f.unsubscribe();
    expect(f.remove).toHaveBeenCalledTimes(1);
    jest
      .mocked(f.bridge.openSettings)
      .mockResolvedValueOnce('true' as unknown as boolean);
    await expect(f.client.openSettings()).rejects.toThrow();
  });
});
