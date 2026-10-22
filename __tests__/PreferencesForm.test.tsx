import {fireEvent, render, screen} from '@testing-library/react-native';
import {defaultPreferences} from '../src/core/domain/preferences';
import {PreferencesForm} from '../src/features/onboarding/PreferencesForm';

describe('preference draft protection', () => {
  it('confirms discard, supports keeping edits and restores the last successful save', async () => {
    const initial = defaultPreferences('Asia/Manila');
    const onSave = jest.fn(async () => undefined);
    const state = jest.fn();
    render(
      <PreferencesForm
        initial={initial}
        onboarding={false}
        onSave={onSave}
        onDraftStateChange={state}
      />,
    );
    fireEvent.changeText(
      screen.getByLabelText('Nickname (optional)'),
      'Saved nickname',
    );
    fireEvent.press(screen.getByRole('button', {name: 'Save preferences'}));
    await screen.findByText('Preferences saved on this phone.');
    expect(state).toHaveBeenLastCalledWith({dirty: false, saving: false});
    fireEvent.changeText(
      screen.getByLabelText('Nickname (optional)'),
      'Unsaved nickname',
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard unsaved changes'}),
    );
    expect(screen.getByDisplayValue('Unsaved nickname')).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {name: 'Keep editing preferences'}),
    );
    expect(screen.getByDisplayValue('Unsaved nickname')).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard unsaved changes'}),
    );
    fireEvent.press(
      screen.getByRole('button', {name: 'Confirm discard preference edits'}),
    );
    expect(screen.getByDisplayValue('Saved nickname')).toBeTruthy();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(state).toHaveBeenLastCalledWith({dirty: false, saving: false});
  });
});
