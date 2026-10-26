import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {BackHandler} from 'react-native';
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
import {alarmClient} from '../src/core/native/reminders';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {
  Preferences,
  PreferencesRepository,
} from '../src/core/domain/preferences';
import {createPlannerFixture} from './helpers/plannerFixtures';

const now = () => new Date('2026-10-21T00:00:00.000Z');
beforeEach(() => {
  // Foundation tests use a resolved, explicitly disabled adapter. No mock
  // validates Android delivery; planner UI must remain usable without it.
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

function store(initial: Preferences | null = null) {
  let saved = initial;
  const repository: PreferencesRepository = {
    load: jest.fn(async () => saved),
    save: jest.fn(async next => {
      saved = next;
    }),
  };
  return {repository, factory: () => repository, current: () => saved};
}
async function enterSetup() {
  fireEvent.press(
    await screen.findByRole('button', {name: 'Set up my planner'}),
  );
}
async function finishSetup() {
  await enterSetup();
  fireEvent.press(screen.getByRole('button', {name: 'Finish setup'}));
  await screen.findByRole('radio', {name: 'Calendar display: Week'});
}

async function openPreferences() {
  fireEvent.press(await screen.findByRole('tab', {name: /Profile/}));
  fireEvent.press(
    screen.getByRole('button', {name: 'Scheduling & Reminder Preferences'}),
  );
}
function openAddMenu(label: 'Add task' | 'Add event') {
  fireEvent.press(screen.getByRole('button', {name: 'Add new item'}));
  fireEvent.press(screen.getByRole('button', {name: label}));
}
async function expectCalendarDeliveryWarning() {
  fireEvent.press(await screen.findByRole('button', {name: 'Calendar tools'}));
  await screen.findByText(
    /Android alerts are off or notifications are blocked/,
  );
  fireEvent.press(screen.getByRole('button', {name: 'Close calendar tools'}));
}

describe('Phase 01 anonymous foundation', () => {
  it('persists the Profile display switches without losing local identity and restores them after remount', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      nickname: 'Local student',
      onboardingCompletedAt: now().toISOString(),
    });
    const view = render(<App repositoryFactory={local.factory} now={now} />);
    fireEvent.press(await screen.findByRole('tab', {name: /Profile/}));
    await act(async () => {
      fireEvent(
        screen.getByLabelText('24-Hour Time Format'),
        'valueChange',
        false,
      );
    });
    await waitFor(() => expect(local.current()?.clockFormat).toBe('12h'));
    await act(async () => {
      fireEvent(
        screen.getByLabelText('Week Starts on Monday'),
        'valueChange',
        false,
      );
    });
    await waitFor(() => expect(local.current()?.weekStartsMonday).toBe(false));
    expect(local.current()).toMatchObject({
      nickname: 'Local student',
      timezone: 'Asia/Manila',
    });
    expect(local.repository.save).toHaveBeenCalledTimes(2);
    view.unmount();
    render(<App repositoryFactory={local.factory} now={now} />);
    fireEvent.press(await screen.findByRole('tab', {name: /Profile/}));
    expect(screen.getByLabelText('24-Hour Time Format')).toHaveProp(
      'value',
      false,
    );
    expect(screen.getByLabelText('Week Starts on Monday')).toHaveProp(
      'value',
      false,
    );
    expect(screen.getByText('Local student')).toBeTruthy();
  });

  it('opens saved preferences even if the runtime timezone lookup throws', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      nickname: 'Saved',
      onboardingCompletedAt: now().toISOString(),
    });
    const formatter = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(() => {
        throw new RangeError('unavailable locale');
      });
    try {
      render(<App repositoryFactory={local.factory} now={now} />);
      fireEvent.press(await screen.findByRole('tab', {name: /Profile/}));
      expect(screen.getByText('Saved')).toBeTruthy();
      await openPreferences();
      expect(screen.getByDisplayValue('Asia/Manila')).toBeTruthy();
      expect(local.repository.save).not.toHaveBeenCalled();
    } finally {
      formatter.mockRestore();
    }
  });
  it('uses UTC for fresh setup when system timezone discovery fails', async () => {
    const local = store();
    const formatter = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(() => {
        throw new RangeError('unavailable locale');
      });
    try {
      render(<App repositoryFactory={local.factory} now={now} />);
      await enterSetup();
      expect(screen.getByDisplayValue('UTC')).toBeTruthy();
      expect(local.repository.save).not.toHaveBeenCalled();
    } finally {
      formatter.mockRestore();
    }
  });
  it('keeps Settings mounted while a preference save is outstanding', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      onboardingCompletedAt: now().toISOString(),
    });
    let finish: (() => void) | undefined;
    jest.mocked(local.repository.save).mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    render(<App repositoryFactory={local.factory} now={now} />);
    await openPreferences();
    fireEvent.changeText(
      screen.getByLabelText('Nickname (optional)'),
      'Saving draft',
    );
    fireEvent.press(screen.getByRole('button', {name: 'Save preferences'}));
    await screen.findByRole('button', {
      name: 'Saving preferences…',
      disabled: true,
    });
    fireEvent.press(screen.getByRole('tab', {name: /Calendar/}));
    expect(screen.getByDisplayValue('Saving draft')).toBeTruthy();
    expect(screen.queryByText(/Nothing scheduled for this day/)).toBeNull();
    finish?.();
    await screen.findByText('Preferences saved on this phone.');
    fireEvent.press(screen.getByRole('tab', {name: /Calendar/}));
    expect(screen.getByText(/Nothing scheduled for this day/)).toBeTruthy();
    await expectCalendarDeliveryWarning();
    expect(screen.queryByText(/You have unsaved preferences/)).toBeNull();
  });

  it('guards tab navigation and preserves edits until discard is confirmed', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      nickname: 'Saved',
      onboardingCompletedAt: now().toISOString(),
    });
    render(<App repositoryFactory={local.factory} now={now} />);
    await openPreferences();
    fireEvent.changeText(screen.getByLabelText('Nickname (optional)'), 'Draft');
    fireEvent.press(screen.getByRole('tab', {name: /Calendar/}));
    expect(screen.getByText(/You have unsaved preferences/)).toBeTruthy();
    expect(screen.getByDisplayValue('Draft')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', {name: 'Stay in Settings'}));
    expect(screen.getByDisplayValue('Draft')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', {name: /Calendar/}));
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard preferences and continue'}),
    );
    expect(screen.getByText(/Nothing scheduled for this day/)).toBeTruthy();
    await openPreferences();
    expect(screen.getByDisplayValue('Saved')).toBeTruthy();
    expect(local.repository.save).not.toHaveBeenCalled();
  });

  it('guards hardware Back with unsaved preferences and clears dirty state only after a successful save', async () => {
    const subscription = jest.spyOn(BackHandler, 'addEventListener');
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      onboardingCompletedAt: now().toISOString(),
    });
    jest
      .mocked(local.repository.save)
      .mockRejectedValueOnce(new Error('write failed'));
    try {
      render(<App repositoryFactory={local.factory} now={now} />);
      await openPreferences();
      fireEvent.changeText(
        screen.getByLabelText('Nickname (optional)'),
        'Keep me',
      );
      act(() => {
        subscription.mock.calls.at(-1)?.[1]({
          type: 'hardwareBackPress',
          timeStamp: 0,
        });
      });
      expect(screen.getByText(/You have unsaved preferences/)).toBeTruthy();
      fireEvent.press(screen.getByRole('button', {name: 'Stay in Settings'}));
      fireEvent.press(screen.getByRole('button', {name: 'Save preferences'}));
      await screen.findByText(/Your settings could not be saved/);
      act(() => {
        subscription.mock.calls.at(-1)?.[1]({
          type: 'hardwareBackPress',
          timeStamp: 0,
        });
      });
      expect(screen.getByText(/You have unsaved preferences/)).toBeTruthy();
      fireEvent.press(screen.getByRole('button', {name: 'Stay in Settings'}));
      fireEvent.press(screen.getByRole('button', {name: 'Save preferences'}));
      await screen.findByText('Preferences saved on this phone.');
      act(() => {
        subscription.mock.calls.at(-1)?.[1]({
          type: 'hardwareBackPress',
          timeStamp: 0,
        });
      });
      await screen.findByText('Keep me');
      expect(screen.queryByText(/You have unsaved preferences/)).toBeNull();
    } finally {
      subscription.mockRestore();
    }
  });

  it('guards opening the test harness while Settings has a draft', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      onboardingCompletedAt: now().toISOString(),
    });
    const factory = jest.fn(() => {
      throw new Error('storage unavailable');
    });
    render(
      <App
        repositoryFactory={local.factory}
        plannerFactory={factory}
        showPlannerHarness
        now={now}
      />,
    );
    await openPreferences();
    // Calendar legitimately opens the production planner before Profile. The
    // guarded QA harness must not cause an additional open until discard.
    expect(factory).toHaveBeenCalledTimes(1);
    factory.mockClear();
    fireEvent.changeText(
      screen.getByLabelText('Default snooze (minutes)'),
      '20',
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Open data test harness'}),
    );
    expect(factory).not.toHaveBeenCalled();
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard preferences and continue'}),
    );
    await screen.findByText(/Planner storage could not be opened/);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('keeps Calendar usable when the device cannot format the saved timezone', async () => {
    const local = store({
      ...defaultPreferences('Pacific/Chatham'),
      onboardingCompletedAt: now().toISOString(),
    });
    // Use a zone not already present in scheduleTime's bounded formatter cache.
    // The failure must occur in a new formatter, rather than reusing a valid one.
    const original = Intl.DateTimeFormat;
    const format = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation((locales, options) => {
        if (options?.timeZone === 'Pacific/Chatham') {
          throw new RangeError('device timezone data unavailable');
        }
        return new original(locales, options);
      });
    try {
      render(<App repositoryFactory={local.factory} now={now} />);
      await screen.findByRole('radio', {name: 'Calendar display: Week'});
      expect(
        screen.getByText(/device clock or timezone could not provide/),
      ).toBeTruthy();
      await openPreferences();
      expect(screen.getByLabelText('Timezone').props.value).toBe(
        'Pacific/Chatham',
      );
      expect(local.repository.save).not.toHaveBeenCalled();
    } finally {
      format.mockRestore();
    }
  });

  it('keeps the data harness out of release and opens QA storage only on demand with a recoverable error', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      onboardingCompletedAt: now().toISOString(),
    });
    const plannerFactory = jest.fn(() => {
      throw new Error('Native database unavailable');
    });
    const view = render(
      <App
        repositoryFactory={local.factory}
        plannerFactory={plannerFactory}
        showPlannerHarness={false}
        now={now}
      />,
    );
    await openPreferences();
    expect(
      screen.queryByRole('button', {name: 'Open data test harness'}),
    ).toBeNull();
    expect(plannerFactory).toHaveBeenCalledTimes(1);
    view.unmount();
    plannerFactory.mockClear();
    render(
      <App
        repositoryFactory={local.factory}
        plannerFactory={plannerFactory}
        showPlannerHarness
        now={now}
      />,
    );
    await openPreferences();
    expect(plannerFactory).toHaveBeenCalledTimes(1);
    plannerFactory.mockClear();
    fireEvent.press(
      screen.getByRole('button', {name: 'Open data test harness'}),
    );
    await screen.findByText(/Planner storage could not be opened/);
    fireEvent.press(
      screen.getByRole('button', {name: 'Retry opening planner'}),
    );
    await waitFor(() => expect(plannerFactory).toHaveBeenCalledTimes(2));
    fireEvent.press(screen.getByRole('button', {name: 'Back to preferences'}));
    expect(screen.getByRole('button', {name: 'Save preferences'})).toBeTruthy();
  });
  it('guards a dirty production planner form when switching tabs until discard is confirmed', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      onboardingCompletedAt: now().toISOString(),
    });
    render(<App repositoryFactory={local.factory} now={now} />);
    await expectCalendarDeliveryWarning();
    openAddMenu('Add task');
    fireEvent.changeText(screen.getByLabelText('Title'), 'Keep planner draft');
    fireEvent.press(screen.getByRole('tab', {name: /Profile/}));
    expect(screen.getByText(/You have unsaved planner changes/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', {name: 'Keep editing planner'}));
    expect(screen.getByDisplayValue('Keep planner draft')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', {name: /Profile/}));
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Discard planner changes and continue',
      }),
    );
    expect(
      screen.getByRole('button', {name: 'Scheduling & Reminder Preferences'}),
    ).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {name: 'Scheduling & Reminder Preferences'}),
    );
    expect(screen.getByRole('button', {name: 'Save preferences'})).toBeTruthy();
    expect(screen.queryByDisplayValue('Keep planner draft')).toBeNull();
    expect(local.repository.save).not.toHaveBeenCalled();
  });

  it('keeps a committed task after native reconcile fails and clears the old delivery error after the next successful mutation without resuming', async () => {
    const fixture = createPlannerFixture();
    const local = store({
      ...defaultPreferences('UTC'),
      onboardingCompletedAt: now().toISOString(),
    });
    const capabilities = await alarmClient.capabilities();
    const reconcile = jest.spyOn(alarmClient, 'reconcile').mockResolvedValue({
      ...capabilities,
      scheduled: 0,
      cancelled: 0,
      failed: 0,
    });
    const view = render(
      <App
        repositoryFactory={local.factory}
        plannerFactory={() => fixture.repository}
        now={now}
        showReminderSettings
      />,
    );
    try {
      await expectCalendarDeliveryWarning();
      await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
      reconcile.mockRejectedValueOnce(
        new Error('Native reminder service unavailable'),
      );
      openAddMenu('Add task');
      fireEvent.changeText(
        screen.getByLabelText('Title'),
        'Synthetic delivery recovery',
      );
      await act(async () => {
        fireEvent.press(screen.getByRole('button', {name: 'Save task'}));
      });
      expect(
        screen.getByRole('header', {name: 'Synthetic delivery recovery'}),
      ).toBeTruthy();
      expect(
        await screen.findByText(/Android reminder delivery needs attention/),
      ).toBeTruthy();
      expect(reconcile).toHaveBeenCalledTimes(2);
      const saved = fixture.repository.tasksPage({filter: 'active'}).items;
      expect(saved).toHaveLength(1);
      expect(saved[0]?.status).toBe('TODO');

      // No AppState bounce: a second durable manual mutation alone retries the
      // adapter. Its success must clear the earlier failure banner immediately.
      await act(async () => {
        fireEvent.press(screen.getByRole('button', {name: 'Start task'}));
      });
      await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(3));
      await waitFor(() => {
        expect(
          screen.queryByText(/Android reminder delivery needs attention/),
        ).toBeNull();
      });
      expect(screen.getByText('Task · IN PROGRESS')).toBeTruthy();
      expect(
        fixture.repository.tasksPage({filter: 'active'}).items,
      ).toHaveLength(1);
      expect(fixture.repository.getTask(saved[0]!.id)?.status).toBe(
        'IN_PROGRESS',
      );
    } finally {
      view.unmount();
      fixture.close();
    }
  });

  it('guards hardware Back in a dirty production event form and preserves it when staying', async () => {
    const subscription = jest.spyOn(BackHandler, 'addEventListener');
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      onboardingCompletedAt: now().toISOString(),
    });
    render(<App repositoryFactory={local.factory} now={now} />);
    await expectCalendarDeliveryWarning();
    openAddMenu('Add event');
    fireEvent.changeText(screen.getByLabelText('Title'), 'Keep weekly draft');
    act(() => {
      subscription.mock.calls.at(-1)?.[1]({
        type: 'hardwareBackPress',
        timeStamp: 0,
      });
    });
    expect(
      screen.getByText('Leave this form and discard unsaved changes?'),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('button', {name: 'Keep editing planner'}));
    expect(screen.getByDisplayValue('Keep weekly draft')).toBeTruthy();
    act(() => {
      subscription.mock.calls.at(-1)?.[1]({
        type: 'hardwareBackPress',
        timeStamp: 0,
      });
    });
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard planner changes'}),
    );
    expect(screen.getByRole('button', {name: 'Add new item'})).toBeTruthy();
    expect(screen.queryByDisplayValue('Keep weekly draft')).toBeNull();
    expect(local.repository.save).not.toHaveBeenCalled();
  });
  it('saves anonymous setup only on completion and persists across remount', async () => {
    const local = store();
    const view = render(<App repositoryFactory={local.factory} now={now} />);
    await screen.findByText('Your student secretary');
    expect(local.repository.save).not.toHaveBeenCalled();
    await finishSetup();
    expect(local.current()).toMatchObject({
      nickname: '',
      onboardingCompletedAt: now().toISOString(),
    });
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    view.unmount();
    render(<App repositoryFactory={local.factory} now={now} />);
    await screen.findByRole('radio', {name: 'Calendar display: Week'});
    expect(screen.queryByText('Your student secretary')).toBeNull();
  });
  it('retains input and blocks navigation after a failed save, then permits retry', async () => {
    const local = store();
    jest
      .mocked(local.repository.save)
      .mockRejectedValueOnce(new Error('write failed'));
    render(<App repositoryFactory={local.factory} now={now} />);
    await enterSetup();
    fireEvent.changeText(screen.getByLabelText('Nickname (optional)'), 'Kai');
    fireEvent.press(screen.getByRole('button', {name: 'Finish setup'}));
    await screen.findByRole('alert');
    expect(screen.getByDisplayValue('Kai')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    fireEvent.press(screen.getByRole('button', {name: 'Finish setup'}));
    await screen.findByRole('radio', {name: 'Calendar display: Week'});
    fireEvent.press(screen.getByRole('tab', {name: /Profile/}));
    expect(screen.getByText('Kai')).toBeTruthy();
  });
  it('validates a timezone without writing invalid preferences', async () => {
    const local = store();
    render(<App repositoryFactory={local.factory} now={now} />);
    await enterSetup();
    fireEvent.changeText(screen.getByLabelText('Timezone'), 'invalid/place');
    fireEvent.press(screen.getByRole('button', {name: 'Finish setup'}));
    await screen.findByText('Enter a valid timezone, such as Asia/Manila.');
    expect(local.repository.save).not.toHaveBeenCalled();
  });
  it('recovers from failed storage initialization instead of using volatile defaults', async () => {
    const local = store();
    const factory = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('native unavailable');
      })
      .mockImplementation(local.factory);
    render(<App repositoryFactory={factory} now={now} />);
    fireEvent.press(
      await screen.findByRole('button', {name: 'Retry opening settings'}),
    );
    await screen.findByText('Your student secretary');
    expect(local.repository.save).not.toHaveBeenCalled();
  });
  it('updates theme/settings, shows honest placeholders and reopens setup without losing preferences', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      nickname: 'Kai',
      onboardingCompletedAt: now().toISOString(),
    });
    render(<App repositoryFactory={local.factory} now={now} />);
    fireEvent.press(await screen.findByRole('tab', {name: /Calendar/}));
    await screen.findByText(/Nothing scheduled for this day/);
    fireEvent.press(screen.getByRole('tab', {name: /Chat/}));
    await screen.findByText('LAFINA Assistant');
    expect(screen.getByRole('button', {name: 'Send message'})).toBeEnabled();
    await openPreferences();
    fireEvent.press(screen.getByRole('radio', {name: 'Appearance: Dark'}));
    fireEvent.press(
      screen.getByRole('radio', {name: 'Reply preference: Both'}),
    );
    fireEvent.press(screen.getByRole('button', {name: 'Save preferences'}));
    await screen.findByText('Preferences saved on this phone.');
    expect(local.current()).toMatchObject({
      theme: 'dark',
      replyMode: 'both',
      nickname: 'Kai',
    });
    fireEvent.press(screen.getByRole('button', {name: 'Review onboarding'}));
    fireEvent.press(screen.getByRole('button', {name: 'Reopen onboarding'}));
    await screen.findByText('Your student secretary');
    expect(local.current()).toMatchObject({
      nickname: 'Kai',
      theme: 'dark',
      onboardingCompletedAt: null,
    });
  });
  it('does not advance until an outstanding save resolves', async () => {
    const local = store();
    let finish: (() => void) | undefined;
    jest.mocked(local.repository.save).mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    render(<App repositoryFactory={local.factory} now={now} />);
    await enterSetup();
    fireEvent.press(screen.getByRole('button', {name: 'Finish setup'}));
    await screen.findByRole('button', {
      name: 'Saving preferences…',
      disabled: true,
    });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    finish?.();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(4));
  });
});
