import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {AppState} from 'react-native';
import {
  type SpeechInputCapabilities,
  type SpeechInputClient,
  type SpeechInputEvent,
} from '../src/core/native/speechToText';
import {SpeechInputPanel} from '../src/features/chat/SpeechInputPanel';
import type {MicrophonePermission} from '../src/features/chat/useSpeechInputSession';

function fixture(patch: Partial<SpeechInputCapabilities> = {}) {
  let listener: ((event: SpeechInputEvent) => void) | undefined;
  const remove = jest.fn();
  const capability: SpeechInputCapabilities = {
    available: true,
    sdk: 37,
    permission: true,
    onDevice: true,
    whisper: true,
    selectedEngine: 'android',
    ...patch,
  };
  const client: SpeechInputClient = {
    capabilities: jest.fn(async () => capability),
    start: jest.fn(async sessionId => ({
      accepted: true,
      sessionId,
      engine: 'android' as const,
    })),
    stop: jest.fn(async sessionId => ({accepted: true, sessionId})),
    cancel: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
    openSettings: jest.fn(async () => true),
    subscribe: jest.fn(callback => {
      listener = callback;
      return remove;
    }),
  };
  const permission: MicrophonePermission = {
    check: jest.fn(async () => true),
    request: jest.fn(async () => 'granted' as const),
  };
  const onBeforeCapture = jest.fn(async (): Promise<void> => undefined);
  function emit(
    type: SpeechInputEvent['type'],
    extra: Partial<SpeechInputEvent> = {},
  ) {
    const sessionId =
      jest.mocked(client.start).mock.calls.at(-1)?.[0] ?? 'not-started';
    act(() => listener?.({sessionId, type, elapsedMs: 500, ...extra}));
  }
  return {client, permission, onBeforeCapture, emit, remove};
}
async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', {name: 'Refresh offline speech options'}),
    ).toBeEnabled(),
  );
}
async function begin(f: ReturnType<typeof fixture>) {
  fireEvent(screen.getByRole('button', {name: 'Hold to talk'}), 'pressIn');
  await waitFor(() => expect(f.client.start).toHaveBeenCalled());
}
function release() {
  fireEvent(screen.getByRole('button', {name: 'Hold to talk'}), 'pressOut');
}
const draft = () => screen.getByLabelText('Draft text');

describe('hold-to-talk UI using injected adapters, not physical microphone proof', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never asks permission or captures on mount and supports manual draft confirmation when offline engines are unavailable', async () => {
    const f = fixture({
      available: false,
      onDevice: false,
      whisper: false,
      selectedEngine: null,
    });
    render(<SpeechInputPanel {...f} />);
    await ready();
    expect(f.permission.check).not.toHaveBeenCalled();
    expect(f.permission.request).not.toHaveBeenCalled();
    expect(f.client.start).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: 'Hold to talk'})).toBeDisabled();
    fireEvent.changeText(draft(), 'Read chapter one');
    fireEvent.press(screen.getByRole('button', {name: 'Confirm draft text'}));
    expect(
      screen.getByText(
        /No task, event or reminder has been created or changed/,
      ),
    ).toBeTruthy();
    fireEvent.changeText(draft(), 'Changed draft');
    expect(
      screen.queryByText(/Draft text confirmed on this screen/),
    ).toBeNull();
    fireEvent.changeText(draft(), '');
    fireEvent.press(screen.getByRole('button', {name: 'Confirm draft text'}));
    expect(screen.getByText(/Type or review some words/)).toBeTruthy();
  });

  it('requires a fresh hold after permission grant and does not record because an OS dialog completed', async () => {
    const f = fixture({permission: false});
    jest.mocked(f.permission.check).mockResolvedValueOnce(false);
    render(<SpeechInputPanel {...f} />);
    await ready();
    fireEvent(screen.getByRole('button', {name: 'Hold to talk'}), 'pressIn');
    await screen.findByText(/Microphone access allowed. Release the button/);
    expect(f.client.start).not.toHaveBeenCalled();
    expect(f.onBeforeCapture).not.toHaveBeenCalled();
    release();
    await ready();
    await begin(f);
    expect(f.client.start).toHaveBeenCalledTimes(1);
    expect(f.onBeforeCapture).toHaveBeenCalledTimes(1);
  });

  it.each(['denied', 'blocked'] as const)(
    'retains typed text after %s microphone permission',
    async outcome => {
      const f = fixture();
      jest.mocked(f.permission.check).mockResolvedValue(false);
      jest.mocked(f.permission.request).mockResolvedValue(outcome);
      render(<SpeechInputPanel {...f} />);
      await ready();
      fireEvent.changeText(draft(), 'Manual fallback');
      fireEvent(screen.getByRole('button', {name: 'Hold to talk'}), 'pressIn');
      await waitFor(() =>
        expect(f.permission.request).toHaveBeenCalledTimes(1),
      );
      expect(
        await screen.findByText(
          outcome === 'denied'
            ? /Microphone access was not granted/
            : /Microphone access is blocked/,
        ),
      ).toBeTruthy();
      expect(screen.getByDisplayValue('Manual fallback')).toBeTruthy();
      expect(f.client.start).not.toHaveBeenCalled();
    },
  );

  it('invalidates a permission check when the finger releases before it resolves', async () => {
    const f = fixture();
    let finish: ((allowed: boolean) => void) | undefined;
    jest.mocked(f.permission.check).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    render(<SpeechInputPanel {...f} />);
    await ready();
    fireEvent(screen.getByRole('button', {name: 'Hold to talk'}), 'pressIn');
    release();
    await act(async () => {
      finish?.(true);
    });
    expect(f.client.start).not.toHaveBeenCalled();
    expect(f.onBeforeCapture).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing will start later/)).toBeTruthy();
  });

  it('does not begin capture after release while stopping prior TTS', async () => {
    const f = fixture();
    let finish: (() => void) | undefined;
    f.onBeforeCapture.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    render(<SpeechInputPanel {...f} />);
    await ready();
    fireEvent(screen.getByRole('button', {name: 'Hold to talk'}), 'pressIn');
    await waitFor(() => expect(f.onBeforeCapture).toHaveBeenCalled());
    release();
    await act(async () => {
      finish?.();
    });
    expect(f.client.start).not.toHaveBeenCalled();
  });

  it('cancels an accepted but not-ready session on release and ignores its late recording/result', async () => {
    const f = fixture();
    render(<SpeechInputPanel {...f} />);
    await ready();
    await begin(f);
    release();
    expect(f.client.cancel).toHaveBeenCalledWith(
      expect.any(String),
      'released_before_recording',
    );
    expect(f.client.stop).not.toHaveBeenCalled();
    f.emit('recording');
    f.emit('result', {transcript: 'Late words'});
    expect(
      screen.queryByLabelText('Recognized speech (review before use)'),
    ).toBeNull();
    expect(
      screen.getByRole('button', {name: 'Cancel speech input'}),
    ).toBeDisabled();
  });

  it('stops on release, keeps typed edits separate from recognition, then requires explicit draft replacement/confirmation', async () => {
    const f = fixture();
    render(<SpeechInputPanel {...f} />);
    await ready();
    fireEvent.changeText(draft(), 'Existing typed draft');
    await begin(f);
    f.emit('recording');
    release();
    expect(f.client.stop).toHaveBeenCalledWith(
      jest.mocked(f.client.start).mock.calls[0]?.[0],
    );
    fireEvent.changeText(draft(), 'Edited while transcribing');
    f.emit('result', {
      transcript: 'Recognized lecture draft',
      recordingMs: 2000,
      transcriptionMs: 120,
    });
    expect(screen.getByDisplayValue('Edited while transcribing')).toBeTruthy();
    expect(screen.getByDisplayValue('Recognized lecture draft')).toBeTruthy();
    fireEvent.changeText(
      screen.getByLabelText('Recognized speech (review before use)'),
      'Reviewed lecture draft',
    );
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Replace draft with recognized speech',
      }),
    );
    expect(draft()).toHaveProp('value', 'Reviewed lecture draft');
    expect(
      screen.queryByText(/Draft text confirmed on this screen/),
    ).toBeNull();
    fireEvent.press(screen.getByRole('button', {name: 'Confirm draft text'}));
    expect(
      screen.getByText(
        /No task, event or reminder has been created or changed/,
      ),
    ).toBeTruthy();
  });

  it('sends only explicitly reviewed words to the chat composer, never a raw or interim result', async () => {
    const f = fixture();
    const copyToChat = jest.fn();
    render(<SpeechInputPanel {...f} onDraftReady={copyToChat} />);
    await ready();
    await begin(f);
    f.emit('recording');
    release();
    f.emit('result', {transcript: 'Remind me to revise tomorrow at 7 PM'});
    expect(copyToChat).not.toHaveBeenCalled();
    fireEvent.changeText(
      screen.getByLabelText('Recognized speech (review before use)'),
      'Remind me to revise tomorrow at 8 PM',
    );
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Replace draft with recognized speech',
      }),
    );
    expect(copyToChat).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', {name: 'Use draft in chat'}));
    expect(copyToChat).toHaveBeenCalledTimes(1);
    expect(copyToChat).toHaveBeenCalledWith(
      'Remind me to revise tomorrow at 8 PM',
    );
  });

  it('does not restart after Android ends recognition while the finger is still held', async () => {
    const f = fixture();
    render(<SpeechInputPanel {...f} />);
    await ready();
    await begin(f);
    f.emit('recording');
    f.emit('transcribing');
    f.emit('result', {transcript: 'Auto-ended draft'});
    release();
    expect(f.client.start).toHaveBeenCalledTimes(1);
    expect(f.client.stop).not.toHaveBeenCalled();
    f.emit('recording');
    expect(screen.getByDisplayValue('Auto-ended draft')).toBeTruthy();
  });

  it.each([
    'NO_SPEECH',
    'MIC_BUSY',
    'PERMISSION_REVOKED',
    'TRANSCRIPTION_TIMEOUT',
    'FOCUS_LOST',
  ] as const)(
    'shows recoverable %s without changing typed text',
    async reason => {
      const f = fixture();
      render(<SpeechInputPanel {...f} />);
      await ready();
      fireEvent.changeText(draft(), 'Typed fallback');
      await begin(f);
      f.emit('error', {reason});
      expect(screen.getByDisplayValue('Typed fallback')).toBeTruthy();
      expect(
        screen.getByRole('button', {name: 'Cancel speech input'}),
      ).toBeDisabled();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(
        screen.queryByLabelText('Recognized speech (review before use)'),
      ).toBeNull();
    },
  );

  it('rejects stale previous-session results after explicit cancellation and a new hold', async () => {
    const f = fixture();
    render(<SpeechInputPanel {...f} />);
    await ready();
    await begin(f);
    const previous = jest.mocked(f.client.start).mock.calls[0]?.[0];
    fireEvent.press(screen.getByRole('button', {name: 'Cancel speech input'}));
    await begin(f);
    f.emit('result', {sessionId: previous!, transcript: 'Stale words'});
    expect(screen.queryByDisplayValue('Stale words')).toBeNull();
    f.emit('result', {transcript: 'Current words'});
    expect(screen.getByDisplayValue('Current words')).toBeTruthy();
  });

  it('cancels and disposes when hidden and does not resume recording on foreground return', async () => {
    const f = fixture();
    const state = jest.spyOn(AppState, 'addEventListener');
    render(<SpeechInputPanel {...f} />);
    await ready();
    await begin(f);
    f.emit('recording');
    act(() => {
      state.mock.calls.at(-1)?.[1]('background');
    });
    expect(f.client.cancel).toHaveBeenCalledWith(
      expect.any(String),
      'app_backgrounded',
    );
    expect(f.client.dispose).toHaveBeenCalled();
    act(() => {
      state.mock.calls.at(-1)?.[1]('active');
    });
    f.emit('result', {transcript: 'Hidden result'});
    expect(f.client.start).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue('Hidden result')).toBeNull();
    expect(
      screen.getByText(/Speech input stopped while the app was hidden/),
    ).toBeTruthy();
  });

  it('queues cancellation and disposal immediately on unmount while native start is unresolved', async () => {
    const f = fixture();
    let finish:
      | ((result: {accepted: boolean; sessionId: string}) => void)
      | undefined;
    jest.mocked(f.client.start).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const view = render(<SpeechInputPanel {...f} />);
    await ready();
    await begin(f);
    const sessionId = jest.mocked(f.client.start).mock.calls[0]?.[0];
    view.unmount();
    expect(f.client.cancel).toHaveBeenCalledWith(sessionId, 'panel_unmounted');
    expect(f.client.dispose).toHaveBeenCalledTimes(1);
    expect(f.remove).toHaveBeenCalled();
    await act(async () => {
      finish?.({accepted: true, sessionId: sessionId!});
    });
    expect(f.client.cancel).toHaveBeenCalledWith(
      sessionId,
      'hold_no_longer_active',
    );
  });

  it('recovers from start rejection and stop failure without showing raw native text', async () => {
    const f = fixture();
    jest
      .mocked(f.client.start)
      .mockRejectedValueOnce(new Error('Private raw failure detail'));
    render(<SpeechInputPanel {...f} />);
    await ready();
    await begin(f);
    await screen.findByText(/Speech input could not finish/);
    expect(screen.queryByText(/Private raw failure detail/)).toBeNull();
    expect(f.client.cancel).toHaveBeenCalledWith(
      expect.any(String),
      'preparation_failed',
    );
    await begin(f);
    f.emit('recording');
    jest.mocked(f.client.stop).mockRejectedValueOnce(new Error('Stop failure'));
    release();
    await waitFor(() =>
      expect(f.client.cancel).toHaveBeenCalledWith(
        expect.any(String),
        'stop_failed',
      ),
    );
  });

  it('passes language/engine selection and exposes only timing diagnostics in QA mode', async () => {
    const f = fixture();
    render(<SpeechInputPanel {...f} showDiagnostics />);
    await ready();
    fireEvent.press(
      screen.getByRole('radio', {name: 'Speech language: Filipino'}),
    );
    fireEvent.press(
      screen.getByRole('radio', {
        name: 'Offline speech engine: Whisper local model',
      }),
    );
    await begin(f);
    expect(f.client.start).toHaveBeenCalledWith(
      expect.any(String),
      'fil-PH',
      'whisper',
    );
    f.emit('result', {
      transcript: 'Synthetic words',
      engine: 'whisper',
      recordingMs: 1000,
      transcriptionMs: 50,
    });
    expect(
      screen.getByText(
        /QA speech result: result; engine whisper; recording 1000 ms; transcription 50 ms/,
      ),
    ).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {name: 'Open Android speech settings'}),
    );
    await screen.findByText(/Return here and refresh/);
    expect(f.client.openSettings).toHaveBeenCalledTimes(1);
  });
});
