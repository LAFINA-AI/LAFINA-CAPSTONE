import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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
