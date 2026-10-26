import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {AppState} from 'react-native';
import {ChatScreen} from '../src/features/chat/ChatScreen';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {SpeechClient} from '../src/core/native/textToSpeech';
import type {SpeechInputClient} from '../src/core/native/speechToText';
import {createPlannerFixture} from './helpers/plannerFixtures';

function speech(): SpeechClient {
  return {
    initialize: jest.fn(async () => {
      throw new Error('Synthetic offline voice failure');
    }),
    speak: jest.fn(async requestId => ({accepted: false, requestId})),
    stop: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
    openSettings: jest.fn(async () => false),
    diagnostics: jest.fn(async () => ({events: []})),
    subscribe: jest.fn(() => () => undefined),
  };
}
function input(): SpeechInputClient {
  return {
    capabilities: jest.fn(async () => ({
      available: false,
      sdk: 30,
      permission: false,
      onDevice: false,
      whisper: false,
      selectedEngine: null,
    })),
    start: jest.fn(async sessionId => ({accepted: false, sessionId})),
    stop: jest.fn(async sessionId => ({accepted: false, sessionId})),
    cancel: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
    openSettings: jest.fn(async () => false),
    subscribe: jest.fn(() => () => undefined),
  };
}
function send(text: string) {
  fireEvent.changeText(screen.getByLabelText('Message'), text);
  fireEvent.press(screen.getByRole('button', {name: 'Send message'}));
}
function setup(voice = false) {
  const fixture = createPlannerFixture();
  const tts = speech();
  const stt = input();
  const preferences = {
    ...defaultPreferences('Asia/Manila'),
    leadMinutes: 0,
    replyMode: voice ? ('both' as const) : ('text' as const),
  };
  const props = {
    factory: () => fixture.repository,
    preferences,
    now: () => new Date(fixture.clock.now()),
    speech: tts,
    speechInput: stt,
    showSpeechInput: true,
    showDiagnostics: false,
  };
  const view = render(<ChatScreen {...props} />);
  return {
    ...fixture,
    tts,
    stt,
    props,
    view,
    cleanup: () => {
      view.unmount();
      fixture.close();
    },
  };
}

it('reviews a timed task before one durable save, then queries it without saving chat history', async () => {
  const f = setup();
  try {
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Send message'})).toBeEnabled(),
    );
    send('Remind me to revise tomorrow at 7 PM');
    expect(f.repository.tasksPage({filter: 'all'}).items).toHaveLength(0);
    fireEvent.press(screen.getByRole('button', {name: 'Confirm change'}));
    const tasks = f.repository.tasksPage({filter: 'all'}).items;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: 'revise',
      dueAt: '2026-10-23T11:00:00.000Z',
      status: 'TODO',
    });
    expect(screen.queryByRole('button', {name: 'Confirm change'})).toBeNull();
    send('Show tasks tomorrow');
    expect(f.repository.tasksPage({filter: 'all'}).items).toHaveLength(1);
    expect(f.repository.recentChat()).toEqual([]);
    expect(f.tts.initialize).not.toHaveBeenCalled();
  } finally {
    f.cleanup();
  }
});

it('invalidates a pending action when the composer changes or a review is discarded', async () => {
  const f = setup();
  try {
    send('Add task chapter one');
    expect(screen.getByRole('button', {name: 'Confirm change'})).toBeTruthy();
    fireEvent.changeText(
      screen.getByLabelText('Message'),
      'Add task chapter two',
    );
    expect(screen.queryByRole('button', {name: 'Confirm change'})).toBeNull();
    fireEvent.press(screen.getByRole('button', {name: 'Send message'}));
    fireEvent.press(screen.getByRole('button', {name: 'Discard change'}));
    expect(f.repository.tasksPage({filter: 'all'}).items).toHaveLength(0);
  } finally {
    f.cleanup();
  }
});

it.each([
  'Remind me to revise Friday at 7 PM',
  'Okay but remind me later',
  'do not acknowledge',
  'delete all tasks',
])('keeps ambiguous or destructive bulk words inert: %s', async text => {
  const f = setup();
  try {
    send(text);
    expect(screen.queryByRole('button', {name: 'Confirm change'})).toBeNull();
    expect(f.repository.tasksPage({filter: 'all'}).items).toEqual([]);
  } finally {
    f.cleanup();
  }
});

it('copies reviewed speech draft to the composer without parsing or writing until Send and Confirm', async () => {
  const f = setup();
  try {
    fireEvent.press(screen.getByRole('button', {name: 'Show speech input'}));
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Hold to talk'})).toBeDisabled(),
    );
    fireEvent.changeText(
      screen.getByLabelText('Draft text'),
      'Add task copied words',
    );
    fireEvent.press(screen.getByRole('button', {name: 'Use draft in chat'}));
    expect(screen.getByDisplayValue('Add task copied words')).toBeTruthy();
    expect(screen.queryByRole('button', {name: 'Confirm change'})).toBeNull();
    expect(f.repository.tasksPage({filter: 'all'}).items).toEqual([]);
    fireEvent.press(screen.getByRole('button', {name: 'Send message'}));
    expect(f.repository.tasksPage({filter: 'all'}).items).toEqual([]);
    fireEvent.press(screen.getByRole('button', {name: 'Confirm change'}));
    expect(f.repository.tasksPage({filter: 'all'}).items[0]?.title).toBe(
      'copied words',
    );
    expect(f.stt.start).not.toHaveBeenCalled();
  } finally {
    f.cleanup();
  }
});

it('keeps a durable result and manual composer usable when optional TTS rejects', async () => {
  const f = setup(true);
  try {
    send('Add task voice fallback');
    fireEvent.press(screen.getByRole('button', {name: 'Confirm change'}));
    await waitFor(() =>
      expect(
        screen.getByText(/Voice is unavailable or was interrupted/),
      ).toBeTruthy(),
    );
    expect(f.repository.tasksPage({filter: 'all'}).items).toHaveLength(1);
    expect(screen.getByRole('button', {name: 'Send message'})).toBeEnabled();
  } finally {
    f.cleanup();
  }
});

it('clears conversation and pending review without deleting saved planner data', async () => {
  const f = setup();
  try {
    send('Add task retained');
    fireEvent.press(screen.getByRole('button', {name: 'Confirm change'}));
    send('Delete task "retained"');
    fireEvent.press(screen.getByRole('button', {name: 'Clear conversation'}));
    expect(screen.queryByRole('button', {name: 'Confirm change'})).toBeNull();
    expect(f.repository.tasksPage({filter: 'all'}).items).toHaveLength(1);
    expect(screen.getByLabelText('Message')).toHaveProp('value', '');
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Send message'})).toBeEnabled(),
    );
    send('Repeat');
    expect(screen.queryByText(/Saved task/)).toBeNull();
  } finally {
    f.cleanup();
  }
});

it('cancels an unconfirmed review on background without a write', async () => {
  const original = AppState.addEventListener;
  const spy = jest.fn(original);
  AppState.addEventListener = spy;
  const f = setup();
  try {
    send('Add task hidden review');
    const listener = spy.mock.calls.find(call => call[0] === 'change')?.[1];
    act(() => listener?.('background'));
    expect(screen.queryByRole('button', {name: 'Confirm change'})).toBeNull();
    expect(f.repository.tasksPage({filter: 'all'}).items).toEqual([]);
  } finally {
    f.cleanup();
    AppState.addEventListener = original;
  }
});

it('offers retry and retains typed text when local storage cannot open', async () => {
  const f = setup();
  try {
    f.view.rerender(
      <ChatScreen
        {...f.props}
        factory={() => {
          throw new Error('Synthetic storage error');
        }}
      />,
    );
    expect(screen.getByText(/local planner could not open/)).toBeTruthy();
    fireEvent.changeText(
      screen.getByLabelText('Message'),
      'Add task keep draft',
    );
    expect(screen.getByDisplayValue('Add task keep draft')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Retry chat'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Send message'})).toBeDisabled();
  } finally {
    f.cleanup();
  }
});
