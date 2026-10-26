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
import type {PreferencesRepository} from '../src/core/domain/preferences';
import type {SpeechInputClient} from '../src/core/native/speechToText';
import {createNotesRepository} from '../src/core/storage/notesRepository';
import {createPlannerFixture, fixtureNow} from './helpers/plannerFixtures';

function setup() {
  const fixture = createPlannerFixture();
  const notes = createNotesRepository(fixture.sql, fixture.clock);
  const preferences = {
    ...defaultPreferences('Asia/Manila'),
    onboardingCompletedAt: fixtureNow,
  };
  const local: PreferencesRepository = {
    load: jest.fn(async () => preferences),
    save: jest.fn(async () => undefined),
  };
  const speech: SpeechInputClient = {
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
  const view = render(
    <App
      repositoryFactory={() => local}
      plannerFactory={() => fixture.repository}
      notesFactory={() => notes}
      speechInputAdapter={speech}
      showSpeechInput
      showReminderSettings={false}
      now={() => new Date(fixtureNow)}
    />,
  );
  return {
    ...fixture,
    notes,
    speech,
    local,
    view,
    cleanup() {
      view.unmount();
      fixture.close();
    },
  };
}

it('guards a dirty note before opening the central voice assistant and never starts capture automatically', async () => {
  const f = setup();
  try {
    fireEvent.press(await screen.findByRole('tab', {name: 'Notes'}));
    fireEvent.press(screen.getByRole('button', {name: 'Add note'}));
    fireEvent.changeText(
      screen.getByLabelText('Note title'),
      'Synthetic unsaved note',
    );
    fireEvent.press(screen.getByRole('button', {name: 'Open voice assistant'}));
    expect(screen.getByText(/You have unsaved note changes/)).toBeTruthy();
    expect(f.speech.capabilities).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', {name: 'Keep editing note'}));
    expect(screen.getByLabelText('Note title')).toHaveProp(
      'value',
      'Synthetic unsaved note',
    );
    fireEvent.press(screen.getByRole('button', {name: 'Open voice assistant'}));
    fireEvent.press(
      screen.getByRole('button', {name: 'Discard note changes and continue'}),
    );
    await screen.findByLabelText('Draft text');
    await waitFor(() => expect(f.speech.capabilities).toHaveBeenCalled());
    expect(f.speech.start).not.toHaveBeenCalled();
    expect(f.notes.counts().notes).toBe(0);
    expect(f.repository.tasksPage({filter: 'all'}).items).toEqual([]);
    expect(f.local.save).not.toHaveBeenCalled();
  } finally {
    f.cleanup();
  }
});

it('returns Android Back from a clean note editor to the Notes list without leaving the tab', async () => {
  const subscription = jest.spyOn(BackHandler, 'addEventListener');
  const f = setup();
  try {
    fireEvent.press(await screen.findByRole('tab', {name: 'Notes'}));
    fireEvent.press(screen.getByRole('button', {name: 'Add note'}));
    expect(screen.getByLabelText('Note title')).toHaveProp('value', '');
    act(() => {
      subscription.mock.calls.at(-1)?.[1]({
        type: 'hardwareBackPress',
        timeStamp: 0,
      });
    });
    expect(screen.getByRole('header', {name: 'Notes'})).toBeTruthy();
    expect(screen.getByText('No notes found')).toBeTruthy();
    expect(
      screen.getByRole('tab', {name: 'Notes'}).props.accessibilityState
        .selected,
    ).toBe(true);
    expect(f.notes.counts().notes).toBe(0);
    expect(f.speech.start).not.toHaveBeenCalled();
    expect(f.local.save).not.toHaveBeenCalled();
  } finally {
    f.cleanup();
    subscription.mockRestore();
  }
});
