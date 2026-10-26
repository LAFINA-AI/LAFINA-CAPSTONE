import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {defaultPreferences} from '../src/core/domain/preferences';
import {ProfileScreen} from '../src/features/settings/ProfileScreen';

function props() {
  return {
    preferences: {
      ...defaultPreferences('Asia/Manila'),
      clockFormat: '24h' as const,
      weekStartsMonday: true,
    },
    counts: {completedTasks: 12, notes: 3},
    onPreferences: jest.fn(),
    onReminders: jest.fn(),
    onSpeech: jest.fn(),
  };
}

it('shows anonymous local identity and real counts without account or fabricated voice statistics', () => {
  render(<ProfileScreen {...props()} />);
  expect(screen.getByText('Guest User')).toBeTruthy();
  expect(screen.getByText('GU')).toBeTruthy();
  expect(screen.getByText('12')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getByText('Tasks Done')).toBeTruthy();
  expect(screen.getByText('Notes Saved')).toBeTruthy();
  expect(screen.getByText('Local only')).toBeTruthy();
  expect(
    screen.queryByText(/Voice Uses|No email set|Student Pro|Sign In|Sign Out/i),
  ).toBeNull();
  expect(screen.getByLabelText('24-Hour Time Format')).toBeDisabled();
  expect(screen.getByLabelText('Week Starts on Monday')).toBeDisabled();
});

it('persists display toggles through async callbacks and preserves the saved value on failure', async () => {
  const values = props();
  let rejectSave: (error: Error) => void = () => undefined;
  const onClockFormat = jest.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectSave = reject;
      }),
  );
  const onSavingChange = jest.fn();
  const onWeekStartsMonday = jest.fn(async () => undefined);
  render(
    <ProfileScreen
      {...values}
      onClockFormat={onClockFormat}
      onWeekStartsMonday={onWeekStartsMonday}
      onSavingChange={onSavingChange}
    />,
  );
  fireEvent(screen.getByLabelText('24-Hour Time Format'), 'valueChange', false);
  expect(onClockFormat).toHaveBeenCalledWith('12h');
  expect(onSavingChange).toHaveBeenCalledWith(true);
  expect(screen.getByLabelText('Week Starts on Monday')).toBeDisabled();
  await act(async () => {
    rejectSave(new Error('Synthetic storage failure'));
  });
  await screen.findByText(/This preference could not be saved/);
  expect(screen.getByLabelText('24-Hour Time Format')).toHaveProp(
    'value',
    true,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Week Starts on Monday')).toBeEnabled(),
  );
  expect(onSavingChange).toHaveBeenLastCalledWith(false);
  fireEvent(
    screen.getByLabelText('Week Starts on Monday'),
    'valueChange',
    false,
  );
  await waitFor(() => expect(onWeekStartsMonday).toHaveBeenCalledWith(false));
});

it('opens the existing preference, voice and reminder editors through typed callbacks', () => {
  const values = props();
  render(<ProfileScreen {...values} />);
  fireEvent.press(
    screen.getByRole('button', {name: 'Scheduling & Reminder Preferences'}),
  );
  fireEvent.press(screen.getByRole('button', {name: 'Appearance'}));
  fireEvent.press(screen.getByRole('button', {name: 'Timezone'}));
  expect(values.onPreferences).toHaveBeenCalledTimes(3);
  fireEvent.press(screen.getByRole('button', {name: 'Voice & Text-to-Speech'}));
  expect(values.onSpeech).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', {name: 'Reminder delivery'}));
  expect(values.onReminders).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', {name: 'Planner test tools'})).toBeNull();
});

it('preserves nickname wrapping and unknown-count state instead of reporting a false zero', () => {
  const values = props();
  render(
    <ProfileScreen
      {...values}
      preferences={{...values.preferences, nickname: 'Alex Student'}}
      counts={null}
      onPlannerTools={jest.fn()}
    />,
  );
  expect(screen.getByText('Alex Student')).toBeTruthy();
  expect(screen.getByText('AS')).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(2);
  expect(screen.getByText(/Saved counts are unavailable/)).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Planner test tools'})).toBeTruthy();
});
