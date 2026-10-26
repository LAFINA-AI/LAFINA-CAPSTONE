import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {AppState} from 'react-native';
import type {SpeechPreferences} from '../src/core/domain/preferences';
import type {
  SpeechClient,
  SpeechEvent,
  SpeechInventory,
} from '../src/core/native/textToSpeech';
import {ReplyMessage} from '../src/core/voice/ReplyMessage';

const options: SpeechPreferences = {
  enginePackage: null,
  voiceName: null,
  languageTag: 'en-US',
  rate: 1,
  pitch: 1,
};
const reply = {
  id: 'reply_one',
  text: 'Your study task was saved on this phone.',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return {promise, resolve, reject};
}

function fixture(overrides: Partial<SpeechInventory> = {}) {
  const inventory: SpeechInventory = {
    available: true,
    enginePackage: 'synthetic.engine',
    engines: [
      {packageName: 'synthetic.engine', label: 'Synthetic installed engine'},
    ],
    voices: [
      {
        name: 'local-english',
        languageTag: 'en-US',
        offline: true,
        installed: true,
        quality: 300,
        latency: 100,
      },
    ],
    selectedVoiceName: 'local-english',
    initializationMs: 20,
    ...overrides,
  };
  const listeners: Array<(event: SpeechEvent) => void> = [];
  const removals: jest.Mock[] = [];
  const client: SpeechClient = {
    initialize: jest.fn(async () => inventory),
    speak: jest.fn(async (requestId: string) => ({accepted: true, requestId})),
    stop: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
    openSettings: jest.fn(async () => true),
    diagnostics: jest.fn(async () => ({events: []})),
    subscribe: jest.fn(listener => {
      listeners.push(listener);
      const remove = jest.fn();
      removals.push(remove);
      return remove;
    }),
  };
  function emit(
    type: SpeechEvent['type'],
    extra: Partial<SpeechEvent> = {},
    index = listeners.length - 1,
  ) {
    act(() =>
      listeners[index]?.({requestId: reply.id, type, elapsedMs: 100, ...extra}),
    );
  }
  return {client, inventory, emit, removals};
}

describe('written reply and optional speech lifecycle with injected adapters, not device audio proof', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders text immediately without initializing or subscribing to speech in text mode', () => {
    const f = fixture();
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="text"
        options={options}
        client={f.client}
      />,
    );
    expect(screen.getByText(reply.text)).toBeTruthy();
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
    expect(f.client.initialize).not.toHaveBeenCalled();
    expect(f.client.subscribe).not.toHaveBeenCalled();
    expect(f.client.speak).not.toHaveBeenCalled();
    view.unmount();
    expect(f.client.dispose).not.toHaveBeenCalled();
  });

  it('shows written confirmation while voice initialization is unresolved', () => {
    const f = fixture();
    const pending = deferred<SpeechInventory>();
    jest.mocked(f.client.initialize).mockReturnValueOnce(pending.promise);
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    expect(screen.getByText(reply.text)).toBeTruthy();
    expect(
      screen.getByText(/The written reply is ready. Preparing optional voice/),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {name: 'Stop reading reply'}),
    ).toBeEnabled();
    expect(f.client.initialize).toHaveBeenCalledWith(options);
    expect(f.client.speak).not.toHaveBeenCalled();
    view.unmount();
  });

  it('keeps text available with missing offline voice and never requests synthesis', async () => {
    const f = fixture({
      available: false,
      reason: 'NO_OFFLINE_VOICE',
      voices: [],
      selectedVoiceName: null,
    });
    render(
      <ReplyMessage
        reply={reply}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice is unavailable or was interrupted/);
    expect(screen.getByText(reply.text)).toBeTruthy();
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
    expect(screen.queryByText('NO_OFFLINE_VOICE')).toBeNull();
  });

  it('cancels a pending initialization so a late result cannot start speech', async () => {
    const f = fixture();
    const pending = deferred<SpeechInventory>();
    jest.mocked(f.client.initialize).mockReturnValueOnce(pending.promise);
    render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    fireEvent.press(screen.getByRole('button', {name: 'Stop reading reply'}));
    expect(f.client.stop).toHaveBeenCalledWith('reply-stopped');
    expect(
      screen.getByText(/Voice stopped. Your written reply remains available/),
    ).toBeTruthy();
    await act(async () => pending.resolve(f.inventory));
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(screen.getByText(reply.text)).toBeTruthy();
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
  });

  it('treats accepted requests as pending until a matching terminal event and retains text throughout', async () => {
    const f = fixture();
    render(
      <ReplyMessage
        reply={reply}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice requested. The written reply is ready/);
    expect(f.client.speak).toHaveBeenCalledWith(reply.id, reply.text);
    expect(
      screen.getByRole('button', {name: 'Stop reading reply'}),
    ).toBeEnabled();
    f.emit('done', {requestId: 'another_reply'});
    expect(
      screen.getByRole('button', {name: 'Stop reading reply'}),
    ).toBeEnabled();
    f.emit('start', {requestToStartMs: 75});
    expect(screen.getByText(/Android started reading this reply/)).toBeTruthy();
    expect(screen.getByText(reply.text)).toBeTruthy();
    f.emit('done');
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
    expect(screen.queryByText(/Voice requested/)).toBeNull();
    expect(screen.getByText(reply.text)).toBeTruthy();
  });

  it('does not re-enable speech when a terminal callback arrives before the acceptance promise', async () => {
    const f = fixture();
    const acceptance = deferred<{accepted: boolean; requestId: string}>();
    jest.mocked(f.client.speak).mockReturnValueOnce(acceptance.promise);
    render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    await waitFor(() => expect(f.client.speak).toHaveBeenCalledTimes(1));
    f.emit('done');
    await act(async () =>
      acceptance.resolve({accepted: true, requestId: reply.id}),
    );
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
    expect(screen.queryByText(/Voice requested/)).toBeNull();
    expect(screen.getByText(reply.text)).toBeTruthy();
  });

  it('ignores a late start callback after the same request already ended', async () => {
    const f = fixture();
    render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice requested/);
    f.emit('cancelled');
    expect(
      screen.getByText(/Voice is unavailable or was interrupted/),
    ).toBeTruthy();
    f.emit('start');
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
    expect(screen.queryByText(/Android started reading this reply/)).toBeNull();
    expect(screen.getByText(reply.text)).toBeTruthy();
  });

  it('does not let an old stop rejection overwrite the new reply status', async () => {
    const f = fixture();
    const pendingStop = deferred<void>();
    jest.mocked(f.client.stop).mockReturnValueOnce(pendingStop.promise);
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice requested/);
    fireEvent.press(screen.getByRole('button', {name: 'Stop reading reply'}));
    const next = {
      id: 'reply_after_stop',
      text: 'Your replacement plan is ready.',
    };
    view.rerender(
      <ReplyMessage
        reply={next}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice requested/);
    await act(async () =>
      pendingStop.reject(new Error('Old engine disconnected')),
    );
    expect(screen.getByText(/Voice requested/)).toBeTruthy();
    expect(
      screen.queryByText(/Voice is unavailable or was interrupted/),
    ).toBeNull();
    expect(screen.getByText(next.text)).toBeTruthy();
  });

  it('ignores replaced reply initialization and disposes it before initializing the new reply', async () => {
    const f = fixture();
    const first = deferred<SpeechInventory>();
    const second = deferred<SpeechInventory>();
    jest
      .mocked(f.client.initialize)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    const next = {id: 'reply_two', text: 'Your class was saved on this phone.'};
    view.rerender(
      <ReplyMessage
        reply={next}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
    expect(
      jest.mocked(f.client.dispose).mock.invocationCallOrder[0],
    ).toBeLessThan(
      jest.mocked(f.client.initialize).mock.invocationCallOrder[1]!,
    );
    await act(async () => first.resolve(f.inventory));
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(screen.queryByText(reply.text)).toBeNull();
    expect(screen.getByText(next.text)).toBeTruthy();
    await act(async () => second.resolve(f.inventory));
    expect(f.client.speak).toHaveBeenCalledTimes(1);
    expect(f.client.speak).toHaveBeenCalledWith(next.id, next.text);
    f.emit('start', {requestId: reply.id}, 0);
    expect(screen.queryByText(/Android started reading this reply/)).toBeNull();
  });

  it('does not speak after unmounting while initialization is pending', async () => {
    const f = fixture();
    const pending = deferred<SpeechInventory>();
    jest.mocked(f.client.initialize).mockReturnValueOnce(pending.promise);
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    view.unmount();
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
    expect(f.removals[0]).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(f.inventory));
    expect(f.client.speak).not.toHaveBeenCalled();
  });

  it('cancels pending voice on background entry and does not restart on foreground entry', async () => {
    const state = jest.spyOn(AppState, 'addEventListener');
    const f = fixture();
    const pending = deferred<SpeechInventory>();
    jest.mocked(f.client.initialize).mockReturnValueOnce(pending.promise);
    render(
      <ReplyMessage
        reply={reply}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    const change = state.mock.calls.at(-1)?.[1];
    await act(async () => change?.('background'));
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Voice stopped while the app was in the background/),
    ).toBeTruthy();
    await act(async () => pending.resolve(f.inventory));
    await act(async () => change?.('active'));
    expect(f.client.initialize).toHaveBeenCalledTimes(1);
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(screen.getByText(reply.text)).toBeTruthy();
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
  });

  it('disposes an accepted voice session on background entry and ignores its later callbacks', async () => {
    const state = jest.spyOn(AppState, 'addEventListener');
    const f = fixture();
    render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice requested/);
    const change = state.mock.calls.at(-1)?.[1];
    await act(async () => change?.('inactive'));
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
    f.emit('start');
    expect(screen.queryByText(/Android started reading this reply/)).toBeNull();
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
    await act(async () => change?.('active'));
    expect(f.client.speak).toHaveBeenCalledTimes(1);
  });

  it('enqueues disposal synchronously when unmounting so delayed stop promises cannot release a new session', async () => {
    const f = fixture();
    const pendingStop = deferred<void>();
    jest.mocked(f.client.stop).mockReturnValueOnce(pendingStop.promise);
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice requested/);
    fireEvent.press(screen.getByRole('button', {name: 'Stop reading reply'}));
    view.unmount();
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
    const next = {id: 'reply_new', text: 'Your updated plan is ready.'};
    render(
      <ReplyMessage
        reply={next}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    await waitFor(() => expect(f.client.initialize).toHaveBeenCalledTimes(2));
    expect(
      jest.mocked(f.client.dispose).mock.invocationCallOrder[0],
    ).toBeLessThan(
      jest.mocked(f.client.initialize).mock.invocationCallOrder[1]!,
    );
    await act(async () => pendingStop.resolve());
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
  });

  it('uses visible text fallback on initialization failure, rejected synthesis and native errors', async () => {
    const f = fixture();
    jest
      .mocked(f.client.initialize)
      .mockRejectedValueOnce(new Error('SENSITIVE_ENGINE_FAILURE'));
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="voice"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice is unavailable or was interrupted/);
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(screen.queryByText(/SENSITIVE_ENGINE_FAILURE/)).toBeNull();
    const next = {...reply, id: 'reply_rejected'};
    jest.mocked(f.client.speak).mockResolvedValueOnce({
      accepted: false,
      requestId: next.id,
      reason: 'FOCUS_DENIED',
    });
    view.rerender(
      <ReplyMessage
        reply={next}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice is unavailable or was interrupted/);
    expect(screen.getByText(reply.text)).toBeTruthy();
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
    const last = {...reply, id: 'reply_native_error'};
    view.rerender(
      <ReplyMessage
        reply={last}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice requested/);
    f.emit('error', {requestId: last.id, reason: 'ENGINE_FAILED'});
    expect(
      screen.getByText(/Voice is unavailable or was interrupted/),
    ).toBeTruthy();
    expect(screen.getByText(reply.text)).toBeTruthy();
    expect(screen.queryByText('ENGINE_FAILED')).toBeNull();
  });

  it('cancels pending voice when changing to text mode and never initializes the new text reply', async () => {
    const f = fixture();
    const pending = deferred<SpeechInventory>();
    jest.mocked(f.client.initialize).mockReturnValueOnce(pending.promise);
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    view.rerender(
      <ReplyMessage
        reply={reply}
        mode="text"
        options={options}
        client={f.client}
      />,
    );
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(f.inventory));
    expect(f.client.initialize).toHaveBeenCalledTimes(1);
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(screen.getByText(reply.text)).toBeTruthy();
    expect(
      screen.queryByRole('button', {name: 'Stop reading reply'}),
    ).toBeNull();
  });

  it('does not restart speech when the parent recreates identical option and reply objects', async () => {
    const f = fixture();
    const view = render(
      <ReplyMessage
        reply={reply}
        mode="both"
        options={options}
        client={f.client}
      />,
    );
    await screen.findByText(/Voice requested/);
    view.rerender(
      <ReplyMessage
        reply={{...reply}}
        mode="both"
        options={{...options}}
        client={f.client}
      />,
    );
    expect(f.client.initialize).toHaveBeenCalledTimes(1);
    expect(f.client.speak).toHaveBeenCalledTimes(1);
    expect(f.client.dispose).not.toHaveBeenCalled();
  });
});
