import React from 'react';
import {DeviceEventEmitter} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import App from '../../App';
import {db, initDatabase, remindersStore, userStore} from '../../src/storage';
import {deliveryStore} from '../../src/storage/deliveryStore';
import {callLifecycle} from '../../src/scheduler/callLifecycle';

let mockShown: {visible: boolean; reminderId: string; onClose: () => void};
let mockReplayOnboarding: () => void;
let mockOnboardingMounts = 0;
jest.mock('../../src/ui/screens/ProfileScreen', () => ({
  ProfileScreen: (props: {onReplayOnboarding: () => void}) => {
    mockReplayOnboarding = props.onReplayOnboarding;
    return null;
  },
}));
jest.mock('../../src/ui/screens/OnboardingScreen', () => ({
  OnboardingScreen: () => {
    const ReactModule = require('react');
    ReactModule.useEffect(() => {
      mockOnboardingMounts += 1;
    }, []);
    return null;
  },
}));
jest.mock('../../src/ui/screens/IncomingCallScreen', () => ({
  IncomingCallScreen: (props: typeof mockShown) => {
    mockShown = props;
    return null;
  },
}));
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() =>
    jest.requireActual('../fixtures/sqliteFile').openSqliteFile(':memory:'),
  ),
}));

beforeEach(async () => {
  mockOnboardingMounts = 0;
  db.reopen();
  await initDatabase();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('two synchronous arrivals retain A and queue B; a stale close cannot hide B', async () => {
  const guest = userStore.createGuestUser();
  userStore.setCurrentUser(guest.id);
  userStore.markOnboardingComplete(guest.id);
  render(<App />);
  await waitFor(() => expect(mockShown).toBeDefined(), {timeout: 10000});
  const due = new Date(Date.now() + 60_000).toISOString();
  const insert = (id: string) => {
    remindersStore.insertReminder({
      id,
      userId: guest.id,
      task: id,
      description: null,
      scheduledAt: due,
      triggerAt: due,
      status: 'triggered',
      preCastAudioPath: null,
    });
    return {
      reminderId: id,
      ownerId: guest.id,
      generation: deliveryStore.get(id)!.generation,
      action: 'call',
    };
  };
  const a = insert('queue-A');
  const b = insert('queue-B');
  act(() => {
    DeviceEventEmitter.emit('LAFINA_CALL_TRIGGER', a);
    DeviceEventEmitter.emit('LAFINA_CALL_TRIGGER', b);
  });
  expect(mockShown.reminderId).toBe('queue-A');
  expect(mockShown.visible).toBe(true);
  expect(
    callLifecycle.list(guest.id).map(entry => entry.request.reminderId),
  ).toEqual(['queue-A', 'queue-B']);
  const closeA = mockShown.onClose;
  act(closeA);
  await waitFor(() => expect(mockShown.reminderId).toBe('queue-B'));
  act(closeA);
  expect(mockShown.visible).toBe(true);
  expect(mockShown.reminderId).toBe('queue-B');
}, 20000);

it('presents during onboarding replay without unmounting its progress', async () => {
  const guest = userStore.createGuestUser();
  userStore.setCurrentUser(guest.id);
  userStore.markOnboardingComplete(guest.id);
  const ui = render(<App />);
  await waitFor(
    () => expect(ui.getByTestId('modern-tab-profile')).toBeTruthy(),
    {timeout: 10000},
  );
  fireEvent.press(ui.getByTestId('modern-tab-profile'));
  await waitFor(() => expect(mockReplayOnboarding).toBeDefined());
  act(() => mockReplayOnboarding());
  expect(mockOnboardingMounts).toBe(1);
  const now = new Date().toISOString();
  remindersStore.insertReminder({
    id: 'replay-call',
    userId: guest.id,
    task: 'Replay reminder',
    description: null,
    scheduledAt: now,
    triggerAt: now,
    status: 'triggered',
    preCastAudioPath: null,
  });
  act(() =>
    DeviceEventEmitter.emit('LAFINA_CALL_TRIGGER', {
      reminderId: 'replay-call',
      ownerId: guest.id,
      generation: deliveryStore.get('replay-call')!.generation,
    }),
  );
  expect(mockShown.visible).toBe(true);
  expect(mockShown.reminderId).toBe('replay-call');
  expect(mockOnboardingMounts).toBe(1);
  act(mockShown.onClose);
  expect(mockOnboardingMounts).toBe(1);
}, 20000);
