import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {BackHandler} from 'react-native';
import {App} from '../src/app/App';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {
  Preferences,
  PreferencesRepository,
} from '../src/core/domain/preferences';

const now = () => new Date('2026-10-21T00:00:00.000Z');
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
  await screen.findByText("You're set, Student.");
}

describe('Phase 01 anonymous foundation', () => {
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
      await screen.findByText("You're set, Saved.");
      fireEvent.press(screen.getByRole('tab', {name: /Settings/}));
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
    fireEvent.press(await screen.findByRole('tab', {name: /Settings/}));
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
    expect(
      screen.queryByText(/Your academic calendar will appear here/),
    ).toBeNull();
    finish?.();
    await screen.findByText('Preferences saved on this phone.');
    fireEvent.press(screen.getByRole('tab', {name: /Calendar/}));
    expect(
      screen.getByText(/Your academic calendar will appear here/),
    ).toBeTruthy();
    expect(screen.queryByText(/You have unsaved preferences/)).toBeNull();
  });

  it('guards tab navigation and preserves edits until discard is confirmed', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      nickname: 'Saved',
      onboardingCompletedAt: now().toISOString(),
    });
    render(<App repositoryFactory={local.factory} now={now} />);
    fireEvent.press(await screen.findByRole('tab', {name: /Settings/}));
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
    expect(
      screen.getByText(/Your academic calendar will appear here/),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', {name: /Settings/}));
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
      fireEvent.press(await screen.findByRole('tab', {name: /Settings/}));
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
      await screen.findByText("You're set, Keep me.");
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
    fireEvent.press(await screen.findByRole('tab', {name: /Settings/}));
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

  it('keeps Today usable when the device cannot format the saved timezone', async () => {
    const local = store({
      ...defaultPreferences('Asia/Manila'),
      onboardingCompletedAt: now().toISOString(),
    });
    const original = Intl.DateTimeFormat;
    const format = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation((locales, options) => {
        if (options?.dateStyle === 'full') {
          throw new RangeError('device timezone data unavailable');
        }
        return new original(locales, options);
      });
    try {
      render(<App repositoryFactory={local.factory} now={now} />);
      await screen.findByText('2026-10-21 (UTC)');
      expect(
        screen.getByText(/This device could not format the saved timezone/),
      ).toBeTruthy();
      fireEvent.press(
        screen.getByRole('button', {name: 'Adjust my preferences'}),
      );
      expect(screen.getByLabelText('Timezone').props.value).toBe('Asia/Manila');
      expect(local.repository.save).not.toHaveBeenCalled();
    } finally {
      format.mockRestore();
    }
  });

  it('keeps the data harness out of release and opens QA storage lazily with a recoverable error', async () => {
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
    fireEvent.press(await screen.findByRole('tab', {name: /Settings/}));
    expect(
      screen.queryByRole('button', {name: 'Open data test harness'}),
    ).toBeNull();
    expect(plannerFactory).not.toHaveBeenCalled();
    view.unmount();
    render(
      <App
        repositoryFactory={local.factory}
        plannerFactory={plannerFactory}
        showPlannerHarness
        now={now}
      />,
    );
    fireEvent.press(await screen.findByRole('tab', {name: /Settings/}));
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
    await screen.findByText("You're set, Student.");
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
    await screen.findByText("You're set, Kai.");
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
    await screen.findByText(/Your academic calendar will appear here/);
    fireEvent.press(screen.getByRole('tab', {name: /Chat/}));
    await screen.findByText(
      /Text commands and hold-to-talk are not available yet/,
    );
    fireEvent.press(screen.getByRole('tab', {name: /Settings/}));
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
