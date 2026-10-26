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
import {
  SpeechSettings,
  SPEECH_PREVIEW_TEXT,
} from '../src/features/settings/SpeechSettings';

const options: SpeechPreferences = {
  enginePackage: null,
  voiceName: null,
  languageTag: 'en-US',
  rate: 1,
  pitch: 1,
};

function fixture(overrides: Partial<SpeechInventory> = {}) {
  const inventory: SpeechInventory = {
    available: true,
    enginePackage: 'synthetic.engine',
    engines: [
      {packageName: 'synthetic.engine', label: 'Installed synthetic engine'},
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
      {
        name: 'online-english',
        languageTag: 'en-US',
        offline: false,
        installed: true,
        quality: 500,
        latency: 100,
      },
      {
        name: 'uninstalled-english',
        languageTag: 'en-US',
        offline: true,
        installed: false,
        quality: 300,
        latency: 100,
      },
    ],
    selectedVoiceName: 'local-english',
    initializationMs: 30,
    ...overrides,
  };
  let listener: ((event: SpeechEvent) => void) | null = null;
  const unsubscribe = jest.fn();
  const client: SpeechClient = {
    initialize: jest.fn(async () => inventory),
    speak: jest.fn(async (requestId: string) => ({accepted: true, requestId})),
    stop: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
    openSettings: jest.fn(async () => true),
    diagnostics: jest.fn(async () => ({events: []})),
    subscribe: jest.fn(callback => {
      listener = callback;
      return unsubscribe;
    }),
  };
  const onSave = jest.fn(
    async (_value: SpeechPreferences): Promise<void> => undefined,
  );
  function emit(type: SpeechEvent['type'], extra: Partial<SpeechEvent> = {}) {
    const requestId =
      jest.mocked(client.speak).mock.calls.at(-1)?.[0] ?? 'not-requested';
    act(() => listener?.({requestId, type, elapsedMs: 100, ...extra}));
  }
  return {client, inventory, onSave, emit, unsubscribe};
}

async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', {name: 'Refresh installed voices'}),
    ).toBeEnabled(),
  );
}

async function play(f: ReturnType<typeof fixture>) {
  fireEvent.press(screen.getByRole('button', {name: 'Play voice preview'}));
  await waitFor(() => expect(f.client.speak).toHaveBeenCalled());
}

describe('offline speech settings with injected adapters, not audible device proof', () => {
  afterEach(() => jest.restoreAllMocks());

  it('inspects voices without autoplay or saving and offers installed offline voices only', async () => {
    const f = fixture();
    render(<SpeechSettings {...f} options={options} replyMode="text" />);
    await ready();
    expect(f.client.initialize).toHaveBeenCalledWith(options);
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(f.onSave).not.toHaveBeenCalled();
    expect(
      screen.getByRole('radio', {
        name: 'Installed offline voice: en-US · local-english',
      }),
    ).toBeChecked();
    expect(screen.queryByText(/online-english/)).toBeNull();
    expect(screen.queryByText(/uninstalled-english/)).toBeNull();
    expect(screen.getByText(SPEECH_PREVIEW_TEXT)).toBeTruthy();
    expect(screen.getByText(/Saved reply preference: Text/)).toBeTruthy();
    expect(
      screen.getByRole('button', {name: 'Stop voice preview'}),
    ).toBeDisabled();
  });

  it('keeps text visible and offers setup when no installed offline voice is available', async () => {
    const f = fixture({
      available: false,
      reason: 'NO_OFFLINE_VOICE',
      selectedVoiceName: null,
      voices: [],
    });
    jest.mocked(f.client.openSettings).mockResolvedValueOnce(false);
    render(<SpeechSettings {...f} options={options} replyMode="voice" />);
    await ready();
    expect(
      screen.getByText(/No installed offline voice is ready/),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {name: 'Play voice preview'}),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {name: 'Save voice options'}),
    ).toBeDisabled();
    expect(screen.getByText(SPEECH_PREVIEW_TEXT)).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {name: 'Open Android speech settings'}),
    );
    await screen.findByText(
      /Open Android Settings and look for Text-to-speech output/,
    );
    expect(f.client.openSettings).toHaveBeenCalledTimes(1);
    expect(f.client.speak).not.toHaveBeenCalled();
  });

  it('uses one explicit preview request and distinguishes acceptance, playback callbacks and audibility', async () => {
    const f = fixture();
    render(<SpeechSettings {...f} options={options} replyMode="text" />);
    await ready();
    fireEvent.press(screen.getByRole('button', {name: 'Play voice preview'}));
    fireEvent.press(screen.getByRole('button', {name: 'Play voice preview'}));
    await waitFor(() => expect(f.client.speak).toHaveBeenCalledTimes(1));
    expect(f.client.speak).toHaveBeenCalledWith(
      expect.stringMatching(/^preview_/),
      SPEECH_PREVIEW_TEXT,
    );
    expect(screen.getByText(/Voice preview requested/)).toBeTruthy();
    expect(screen.queryByText(/Android finished the preview/)).toBeNull();
    expect(
      screen.getByRole('button', {name: 'Play voice preview'}),
    ).toBeDisabled();
    f.emit('start', {requestToStartMs: 97.7});
    expect(screen.getByText(/Android playback callback: 98 ms/)).toBeTruthy();
    expect(
      screen.getByText(/This does not measure when sound became audible/),
    ).toBeTruthy();
    f.emit('done');
    expect(screen.getByText(/Android finished the preview/)).toBeTruthy();
    expect(
      screen.getByRole('button', {name: 'Play voice preview'}),
    ).toBeEnabled();
    expect(screen.getByText(SPEECH_PREVIEW_TEXT)).toBeTruthy();
  });

  it('retains text and permits retry after rejected requests and engine errors', async () => {
    const f = fixture();
    jest.mocked(f.client.speak).mockImplementationOnce(async requestId => ({
      accepted: false,
      requestId,
      reason: 'SENSITIVE_NATIVE_DETAIL',
    }));
    render(<SpeechSettings {...f} options={options} replyMode="both" />);
    await ready();
    await play(f);
    await screen.findByText(/Speech could not finish/);
    expect(screen.queryByText(/SENSITIVE_NATIVE_DETAIL/)).toBeNull();
    expect(screen.getByText(SPEECH_PREVIEW_TEXT)).toBeTruthy();
    await play(f);
    await waitFor(() => expect(f.client.speak).toHaveBeenCalledTimes(2));
    f.emit('error', {reason: 'ENGINE_FAILED'});
    expect(
      screen.getByRole('button', {name: 'Play voice preview'}),
    ).toBeEnabled();
    expect(screen.getByText(/Speech could not finish/)).toBeTruthy();
  });

  it('stops immediately, ignores late callbacks and can start a fresh preview', async () => {
    const f = fixture();
    render(<SpeechSettings {...f} options={options} replyMode="both" />);
    await ready();
    await play(f);
    const oldId = jest.mocked(f.client.speak).mock.calls[0]![0];
    fireEvent.press(screen.getByRole('button', {name: 'Stop voice preview'}));
    await screen.findByText(/Voice preview stopped/);
    expect(f.client.stop).toHaveBeenCalledWith('preview-stop');
    f.emit('start', {requestId: oldId, requestToStartMs: 9000});
    expect(screen.queryByText(/9000 ms/)).toBeNull();
    await play(f);
    await waitFor(() => expect(f.client.speak).toHaveBeenCalledTimes(2));
    f.emit('done', {requestId: oldId});
    expect(
      screen.getByRole('button', {name: 'Stop voice preview'}),
    ).toBeEnabled();
    f.emit('done');
    expect(
      screen.getByRole('button', {name: 'Stop voice preview'}),
    ).toBeDisabled();
  });

  it('stops on background entry without autoplay when returning to the app', async () => {
    const state = jest.spyOn(AppState, 'addEventListener');
    const f = fixture();
    render(<SpeechSettings {...f} options={options} replyMode="voice" />);
    await ready();
    await play(f);
    const change = state.mock.calls.at(-1)?.[1];
    await act(async () => change?.('background'));
    expect(f.client.stop).toHaveBeenCalledWith('settings-backgrounded');
    await act(async () => change?.('active'));
    expect(f.client.speak).toHaveBeenCalledTimes(1);
    expect(screen.getByText(SPEECH_PREVIEW_TEXT)).toBeTruthy();
  });

  it('stops when the saved reply preference changes to text', async () => {
    const f = fixture();
    const view = render(
      <SpeechSettings {...f} options={options} replyMode="both" />,
    );
    await ready();
    await play(f);
    view.rerender(<SpeechSettings {...f} options={options} replyMode="text" />);
    await waitFor(() =>
      expect(f.client.stop).toHaveBeenCalledWith('reply-mode-text'),
    );
    expect(
      screen.getByRole('button', {name: 'Stop voice preview'}),
    ).toBeDisabled();
    expect(screen.getByText(/Saved reply preference: Text/)).toBeTruthy();
  });

  it('unsubscribes and releases the speech session on unmount, including stop failures', async () => {
    const f = fixture();
    const view = render(
      <SpeechSettings {...f} options={options} replyMode="both" />,
    );
    await ready();
    await play(f);
    jest
      .mocked(f.client.stop)
      .mockRejectedValueOnce(new Error('Engine already gone'));
    view.unmount();
    await waitFor(() => expect(f.client.dispose).toHaveBeenCalledTimes(1));
    expect(f.client.stop).toHaveBeenCalledWith('settings-unmounted');
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('enqueues disposal before a new session initializes even when the old stop promise is delayed', async () => {
    const f = fixture();
    const view = render(
      <SpeechSettings {...f} options={options} replyMode="both" />,
    );
    await ready();
    let finishStop: (() => void) | undefined;
    jest.mocked(f.client.stop).mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finishStop = resolve;
        }),
    );
    view.unmount();
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
    render(<SpeechSettings {...f} options={options} replyMode="both" />);
    await ready();
    expect(
      jest.mocked(f.client.dispose).mock.invocationCallOrder[0],
    ).toBeLessThan(
      jest.mocked(f.client.initialize).mock.invocationCallOrder.at(-1)!,
    );
    await act(async () => finishStop?.());
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports unsaved changes for parent navigation guards and clears them only after a durable save', async () => {
    const f = fixture();
    const onDraftStateChange = jest.fn();
    render(
      <SpeechSettings
        {...f}
        options={options}
        replyMode="both"
        onDraftStateChange={onDraftStateChange}
      />,
    );
    await ready();
    expect(onDraftStateChange).toHaveBeenLastCalledWith({
      dirty: false,
      saving: false,
    });
    fireEvent.press(screen.getByRole('radio', {name: 'Speech speed: Fast'}));
    expect(onDraftStateChange).toHaveBeenLastCalledWith({
      dirty: true,
      saving: false,
    });
    f.onSave.mockRejectedValueOnce(new Error('Disk unavailable'));
    fireEvent.press(screen.getByRole('button', {name: 'Save voice options'}));
    await screen.findByText(/Voice options could not be saved/);
    expect(onDraftStateChange).toHaveBeenLastCalledWith({
      dirty: true,
      saving: false,
    });
    fireEvent.press(screen.getByRole('button', {name: 'Save voice options'}));
    await screen.findByText(/Voice options saved on this phone/);
    expect(onDraftStateChange).toHaveBeenLastCalledWith({
      dirty: false,
      saving: false,
    });
  });

  it('permits navigation during slow voice initialization but guards an actual preference write', async () => {
    const f = fixture();
    const onDraftStateChange = jest.fn();
    let finishInitialization: ((value: SpeechInventory) => void) | undefined;
    jest.mocked(f.client.initialize).mockReturnValueOnce(
      new Promise<SpeechInventory>(resolve => {
        finishInitialization = resolve;
      }),
    );
    render(
      <SpeechSettings
        {...f}
        options={options}
        replyMode="both"
        onDraftStateChange={onDraftStateChange}
      />,
    );
    expect(onDraftStateChange).toHaveBeenLastCalledWith({
      dirty: false,
      saving: false,
    });
    expect(
      screen.getByRole('button', {name: 'Refresh installed voices'}),
    ).toBeDisabled();
    await act(async () => finishInitialization?.(f.inventory));
    await ready();
    fireEvent.press(screen.getByRole('radio', {name: 'Speech speed: Fast'}));
    let finishSave: (() => void) | undefined;
    f.onSave.mockReturnValueOnce(
      new Promise<void>(resolve => {
        finishSave = resolve;
      }),
    );
    fireEvent.press(screen.getByRole('button', {name: 'Save voice options'}));
    expect(onDraftStateChange).toHaveBeenLastCalledWith({
      dirty: true,
      saving: true,
    });
    await act(async () => finishSave?.());
    expect(onDraftStateChange).toHaveBeenLastCalledWith({
      dirty: false,
      saving: false,
    });
  });

  it('saves explicit offline voice and tuning only on request and keeps selections on save failure', async () => {
    const f = fixture();
    f.onSave.mockRejectedValueOnce(new Error('Storage unavailable'));
    render(<SpeechSettings {...f} options={options} replyMode="both" />);
    await ready();
    fireEvent.press(screen.getByRole('radio', {name: 'Speech speed: Fast'}));
    fireEvent.press(screen.getByRole('radio', {name: 'Voice pitch: Lower'}));
    expect(f.onSave).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', {name: 'Save voice options'}));
    await screen.findByText(/Voice options could not be saved/);
    expect(
      screen.getByRole('radio', {name: 'Speech speed: Fast'}),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', {name: 'Voice pitch: Lower'}),
    ).toBeChecked();
    fireEvent.press(screen.getByRole('button', {name: 'Save voice options'}));
    await screen.findByText(/Voice options saved on this phone/);
    expect(f.onSave).toHaveBeenLastCalledWith({
      enginePackage: 'synthetic.engine',
      voiceName: 'local-english',
      languageTag: 'en-US',
      rate: 1.25,
      pitch: 0.8,
    });
    expect(f.client.speak).not.toHaveBeenCalled();
  });

  it('refreshes the selected engine and voice without playing or silently saving', async () => {
    const f = fixture({
      engines: [
        {packageName: 'synthetic.engine', label: 'Engine one'},
        {packageName: 'synthetic.second', label: 'Engine two'},
      ],
    });
    render(<SpeechSettings {...f} options={options} replyMode="both" />);
    await ready();
    jest.mocked(f.client.initialize).mockResolvedValueOnce({
      ...f.inventory,
      enginePackage: 'synthetic.second',
      voices: [
        {
          name: 'local-filipino',
          languageTag: 'fil-PH',
          offline: true,
          installed: true,
          quality: 300,
          latency: 100,
        },
      ],
      selectedVoiceName: 'local-filipino',
    });
    fireEvent.press(
      screen.getByRole('radio', {name: 'Speech engine: Engine two'}),
    );
    await ready();
    expect(f.client.initialize).toHaveBeenLastCalledWith({
      enginePackage: 'synthetic.second',
      voiceName: null,
      languageTag: 'en-US',
      rate: 1,
      pitch: 1,
    });
    expect(
      screen.getByRole('radio', {
        name: 'Installed offline voice: fil-PH · local-filipino',
      }),
    ).toBeChecked();
    expect(
      screen.queryByRole('radio', {
        name: 'Installed offline voice: en-US · local-english',
      }),
    ).toBeNull();
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(f.onSave).not.toHaveBeenCalled();
  });

  it('offers recovery after initialization failure and never sends text to an unavailable engine', async () => {
    const f = fixture();
    jest
      .mocked(f.client.initialize)
      .mockRejectedValueOnce(new Error('Unsupported native engine'));
    render(<SpeechSettings {...f} options={options} replyMode="both" />);
    await screen.findByText(/Speech could not finish/);
    expect(
      screen.getByRole('button', {name: 'Play voice preview'}),
    ).toBeDisabled();
    fireEvent.press(
      screen.getByRole('button', {name: 'Refresh installed voices'}),
    );
    await ready();
    expect(
      screen.getByRole('button', {name: 'Play voice preview'}),
    ).toBeEnabled();
    expect(f.client.speak).not.toHaveBeenCalled();
  });

  it('does not speak if an offline voice disappears while preparing the preview', async () => {
    const f = fixture();
    render(<SpeechSettings {...f} options={options} replyMode="voice" />);
    await ready();
    jest.mocked(f.client.initialize).mockResolvedValueOnce({
      ...f.inventory,
      available: false,
      selectedVoiceName: null,
    });
    fireEvent.press(screen.getByRole('button', {name: 'Play voice preview'}));
    await screen.findByText(/Speech could not finish/);
    expect(f.client.speak).not.toHaveBeenCalled();
    expect(screen.getByText(SPEECH_PREVIEW_TEXT)).toBeTruthy();
    expect(
      screen.getByRole('button', {name: 'Play voice preview'}),
    ).toBeEnabled();
  });
});
