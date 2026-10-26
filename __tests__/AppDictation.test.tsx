import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

jest.mock('../src/core/storage/openPlanner', () => ({openPlanner: jest.fn()}));

import {App} from '../src/app/App';
import {defaultPreferences} from '../src/core/domain/preferences';
import type {PreferencesRepository} from '../src/core/domain/preferences';
import type {SpeechInputClient} from '../src/core/native/speechToText';
import {createPlannerFixture} from './helpers/plannerFixtures';

it('keeps the real planner unchanged when an unavailable offline engine leaves a manual draft for review', async () => {
  const fixture = createPlannerFixture();
  const preferences = {
    ...defaultPreferences('Asia/Manila'),
    onboardingCompletedAt: '2026-10-26T00:00:00.000Z',
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
      reason: 'OFFLINE_ENGINE_UNAVAILABLE',
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
      speechInputAdapter={speech}
      showSpeechInput
      showReminderSettings={false}
      now={() => new Date('2026-10-26T00:00:00.000Z')}
    />,
  );
  try {
    fireEvent.press(await screen.findByRole('tab', {name: /Chat/}));
    fireEvent.press(screen.getByRole('button', {name: 'Show speech input'}));
    await waitFor(() => expect(speech.capabilities).toHaveBeenCalled());
    expect(screen.getByRole('button', {name: 'Hold to talk'})).toBeDisabled();
    fireEvent.changeText(
      screen.getByLabelText('Draft text'),
      'cancel my library reminder',
    );
    fireEvent.press(screen.getByRole('button', {name: 'Use draft in chat'}));
    expect(screen.getByDisplayValue('cancel my library reminder')).toBeTruthy();
    expect(screen.queryByRole('button', {name: 'Confirm change'})).toBeNull();
    expect(fixture.repository.tasksPage({filter: 'active'}).items).toHaveLength(
      0,
    );
    expect(local.save).not.toHaveBeenCalled();
    expect(speech.start).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('tab', {name: /Calendar/}));
    await screen.findByText(/Nothing scheduled for this day/);
    expect(speech.dispose).toHaveBeenCalled();
  } finally {
    view.unmount();
    fixture.close();
  }
});
