import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {BackHandler, Modal} from 'react-native';

jest.mock('../src/core/storage/openPlanner', () => ({
  openPlanner: () => ({
    getTask: jest.fn(() => null),
    getEvent: jest.fn(() => null),
    tasksPage: jest.fn(() => ({items: [], hasMore: false})),
    agendaPage: jest.fn(() => ({items: [], nextCursor: null})),
    reminderPage: jest.fn(() => ({items: [], hasMore: false})),
  }),
}));

import {App} from '../src/app/App';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {
  Preferences,
  PreferencesRepository,
  ReplyMode,
} from '../src/core/domain/preferences';
import {alarmClient} from '../src/core/native/reminders';
import type {
  SpeechClient,
  SpeechInventory,
} from '../src/core/native/textToSpeech';
import {createPlannerFixture} from './helpers/plannerFixtures';

const now = () => new Date('2026-10-25T08:00:00.000Z');
const help =
  'Use Calendar to add a class or task. Android reminders can alert you offline. In Chat, send a clear command such as Remind me to revise tomorrow at 7 PM. Review the exact time and confirm the change before it is saved.';
const writtenFallback =
  'Voice is unavailable or was interrupted. Your written reply and planner controls remain available.';
const inventory: SpeechInventory = {
  available: true,
  enginePackage: 'synthetic.engine',
  engines: [{packageName: 'synthetic.engine', label: 'Synthetic engine'}],
  voices: [
    {
      name: 'synthetic-offline-english',
      languageTag: 'en-US',
      offline: true,
      installed: true,
      quality: 300,
      latency: 100,
    },
  ],
  selectedVoiceName: 'synthetic-offline-english',
  initializationMs: 12,
};

function speech(): SpeechClient {
  return {
    initialize: jest.fn(async () => inventory),
    speak: jest.fn(async requestId => ({accepted: true, requestId})),
    stop: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
    openSettings: jest.fn(async () => true),
    diagnostics: jest.fn(async () => ({events: []})),
    subscribe: jest.fn(() => () => undefined),
  };
}

function store(replyMode: ReplyMode = 'text') {
  const initial: Preferences = {
    ...defaultPreferences('Asia/Manila'),
    nickname: 'Synthetic student',
    theme: 'dark',
    leadMinutes: 25,
    snoozeMinutes: 7,
    quietHoursEnabled: true,
    quietStart: '23:00',
    quietEnd: '06:00',
    replyMode,
    onboardingCompletedAt: now().toISOString(),
  };
  let saved = initial;
  const repository: PreferencesRepository = {
    load: jest.fn(async () => saved),
    save: jest.fn(async next => {
      saved = next;
    }),
  };
  return {initial, repository, factory: () => repository, current: () => saved};
}

async function openPreferences() {
  fireEvent.press(await screen.findByRole('tab', {name: /Profile/}));
  fireEvent.press(
    screen.getByRole('button', {name: 'Scheduling & Reminder Preferences'}),
  );
}

async function openSpeechSettings() {
  await openPreferences();
  fireEvent.press(
    screen.getByRole('button', {name: 'Offline speech settings'}),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', {name: 'Save voice options'}),
    ).toBeEnabled(),
  );
}

beforeEach(() => {
  jest.spyOn(alarmClient, 'capabilities').mockResolvedValue({
    sdk: 30,
    enabled: false,
    notifications: false,
    exact: false,
    fullScreen: false,
    fullScreenEnabled: false,
    channelImportance: 0,
  });
});

afterEach(async () => {
  await act(async () => {});
  jest.restoreAllMocks();
});

describe('App speech integration with synthetic adapters, not audible device proof', () => {
  it('shows canned help in default text mode without initializing speech or changing a schedule', async () => {
    const local = store();
    const client = speech();
    render(
      <App
        repositoryFactory={local.factory}
        speechAdapter={client}
        showSpeechSettings
        now={now}
      />,
    );
    fireEvent.press(await screen.findByRole('tab', {name: /Chat/}));
    fireEvent.press(screen.getByRole('button', {name: 'Chat tools'}));
    fireEvent.press(screen.getByRole('button', {name: 'Show planner help'}));
    expect(screen.getByText(help)).toBeTruthy();
    expect(client.initialize).not.toHaveBeenCalled();
    expect(client.speak).not.toHaveBeenCalled();
    expect(local.repository.save).not.toHaveBeenCalled();
  });

  it.each<ReplyMode>(['voice', 'both'])(
    'renders the %s written reply while initialization is pending and retains it when no offline voice is available',
    async mode => {
      const local = store(mode);
      const client = speech();
      let finish: ((result: SpeechInventory) => void) | undefined;
      jest.mocked(client.initialize).mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      );
      render(
        <App
          repositoryFactory={local.factory}
          speechAdapter={client}
          showSpeechSettings
          now={now}
        />,
      );
      fireEvent.press(await screen.findByRole('tab', {name: /Chat/}));
      fireEvent.press(screen.getByRole('button', {name: 'Chat tools'}));
      fireEvent.press(screen.getByRole('button', {name: 'Show planner help'}));
      expect(screen.getByText(help)).toBeTruthy();
      expect(
        screen.getByText(/written reply is ready.*Preparing optional voice/),
      ).toBeTruthy();
      expect(client.initialize).toHaveBeenCalledTimes(1);
      expect(client.speak).not.toHaveBeenCalled();
      await act(async () => {
        finish?.({
          ...inventory,
          available: false,
          reason: 'OFFLINE_VOICE_UNAVAILABLE',
          selectedVoiceName: null,
          voices: [],
        });
      });
      expect(screen.getByText(help)).toBeTruthy();
      expect(screen.getByText(writtenFallback)).toBeTruthy();
      expect(screen.getByRole('tab', {name: /Calendar/})).toBeEnabled();
      expect(client.speak).not.toHaveBeenCalled();
      expect(local.repository.save).not.toHaveBeenCalled();
    },
  );

  it('preserves exactly one real SQLite task and its written confirmation when post-save speech initialization rejects', async () => {
    const local = store('voice');
    const client = speech();
    jest
      .mocked(client.initialize)
      .mockRejectedValueOnce(new Error('Synthetic engine failure'));
    const fixture = createPlannerFixture();
    const create = jest.spyOn(fixture.repository, 'createTask');
    const view = render(
      <App
        repositoryFactory={local.factory}
        plannerFactory={() => fixture.repository}
        speechAdapter={client}
        showSpeechSettings
        now={now}
      />,
    );
    try {
      fireEvent.press(
        await screen.findByRole('button', {name: 'Calendar tools'}),
      );
      await screen.findByText(
        /Android alerts are off or notifications are blocked/,
      );
      fireEvent.press(
        screen.getByRole('button', {name: 'Close calendar tools'}),
      );
      fireEvent.press(screen.getByRole('button', {name: 'Add new item'}));
      fireEvent.press(screen.getByRole('button', {name: 'Add task'}));
      fireEvent.changeText(
        screen.getByLabelText('Title'),
        'Synthetic speech failure task',
      );
      await act(async () => {
        fireEvent.press(screen.getByRole('button', {name: 'Save task'}));
      });
      expect(
        screen.getByText('Your task is saved on this phone.'),
      ).toBeTruthy();
      expect(await screen.findByText(writtenFallback)).toBeTruthy();
      expect(
        screen.getByRole('header', {name: 'Synthetic speech failure task'}),
      ).toBeTruthy();
      const saved = fixture.repository.tasksPage({filter: 'active'}).items;
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        title: 'Synthetic speech failure task',
        status: 'TODO',
        version: 1,
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect(client.initialize).toHaveBeenCalledTimes(1);
      expect(client.speak).not.toHaveBeenCalled();
      expect(
        screen.queryByText(/could not be saved|was not saved/i),
      ).toBeNull();
    } finally {
      view.unmount();
      fixture.close();
    }
  });

  it('saves optional voice settings without replacing existing schema-1 preferences or speaking', async () => {
    const local = store('both');
    const client = speech();
    render(
      <App
        repositoryFactory={local.factory}
        speechAdapter={client}
        showSpeechSettings
        now={now}
      />,
    );
    await openSpeechSettings();
    fireEvent.press(screen.getByRole('radio', {name: 'Speech speed: Slow'}));
    fireEvent.press(screen.getByRole('radio', {name: 'Voice pitch: Higher'}));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', {name: 'Save voice options'}));
    });
    await screen.findByText('Voice options saved on this phone.');
    expect(local.current()).toEqual({
      ...local.initial,
      tts: {
        enginePackage: 'synthetic.engine',
        voiceName: 'synthetic-offline-english',
        languageTag: 'en-US',
        rate: 0.75,
        pitch: 1.2,
      },
    });
    expect(local.repository.save).toHaveBeenCalledTimes(1);
    expect(client.speak).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', {name: 'Back to preferences'}));
    expect(screen.getByDisplayValue(local.initial.nickname)).toBeTruthy();
    expect(screen.queryByText(/You have unsaved voice options/)).toBeNull();
  });

  it('guards tab navigation from edited voice options and discards only after confirmation', async () => {
    const local = store();
    const client = speech();
    render(
      <App
        repositoryFactory={local.factory}
        speechAdapter={client}
        showSpeechSettings
        now={now}
      />,
    );
    await openSpeechSettings();
    fireEvent.press(screen.getByRole('radio', {name: 'Speech speed: Fast'}));
    fireEvent.press(screen.getByRole('tab', {name: /Chat/}));
    expect(screen.getByText(/You have unsaved voice options/)).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {name: 'Stay in voice settings'}),
    );
    expect(
      screen.getByRole('radio', {name: 'Speech speed: Fast'}),
    ).toBeChecked();
    fireEvent.press(screen.getByRole('tab', {name: /Chat/}));
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard voice options and continue'}),
    );
    expect(screen.getByRole('button', {name: 'Chat tools'})).toBeTruthy();
    await openSpeechSettings();
    expect(
      screen.getByRole('radio', {name: 'Speech speed: Normal'}),
    ).toBeChecked();
    expect(local.repository.save).not.toHaveBeenCalled();
    expect(local.current().tts).toBeUndefined();
  });

  it('guards Android Back from voice settings and keeps the edited speed until an explicit discard', async () => {
    const local = store();
    const client = speech();
    const subscription = jest.spyOn(BackHandler, 'addEventListener');
    render(
      <App
        repositoryFactory={local.factory}
        speechAdapter={client}
        showSpeechSettings
        now={now}
      />,
    );
    await openSpeechSettings();
    fireEvent.press(screen.getByRole('radio', {name: 'Speech speed: Slow'}));
    act(() => {
      subscription.mock.calls.at(-1)?.[1]({
        type: 'hardwareBackPress',
        timeStamp: 0,
      });
    });
    expect(screen.getByText(/You have unsaved voice options/)).toBeTruthy();
    // A warning inside the long voice list can be outside the current viewport.
    expect(
      screen
        .UNSAFE_getAllByType(Modal)
        .some(
          dialog =>
            dialog.props.visible &&
            dialog.props.testID === 'voice-navigation-confirmation',
        ),
    ).toBe(true);
    fireEvent.press(
      screen.getByRole('button', {name: 'Stay in voice settings'}),
    );
    expect(
      screen.getByRole('radio', {name: 'Speech speed: Slow'}),
    ).toBeChecked();
    act(() => {
      subscription.mock.calls.at(-1)?.[1]({
        type: 'hardwareBackPress',
        timeStamp: 0,
      });
    });
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard voice options and continue'}),
    );
    expect(screen.getByRole('button', {name: 'Save preferences'})).toBeTruthy();
    expect(local.repository.save).not.toHaveBeenCalled();
  });

  it('protects a general preference draft before entering the speech subpage', async () => {
    const local = store();
    const client = speech();
    render(
      <App
        repositoryFactory={local.factory}
        speechAdapter={client}
        showSpeechSettings
        now={now}
      />,
    );
    await openPreferences();
    fireEvent.changeText(
      screen.getByLabelText('Nickname (optional)'),
      'Unsaved synthetic draft',
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Offline speech settings'}),
    );
    expect(screen.getByText(/You have unsaved preferences/)).toBeTruthy();
    expect(client.initialize).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', {name: 'Stay in preferences'}));
    expect(screen.getByDisplayValue('Unsaved synthetic draft')).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {name: 'Offline speech settings'}),
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard preferences and continue'}),
    );
    await screen.findByRole('header', {name: 'Offline speech'});
    await waitFor(() =>
      expect(
        screen.getByRole('button', {name: 'Save voice options'}),
      ).toBeEnabled(),
    );
    expect(client.initialize).toHaveBeenCalledTimes(1);
    expect(local.current()).toEqual(local.initial);
    expect(local.repository.save).not.toHaveBeenCalled();
  });
});
