import React from 'react';
import {Alert, AppState, PermissionsAndroid} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {IncomingCallScreen} from '../../src/ui/screens/IncomingCallScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {initDatabase} from '../../src/storage';
import {voiceConsent} from '../../src/cloud/voiceConversation';
import * as scheduler from '../../src/scheduler';

let mockOnlineProps: any;
const mockEndAndWait = jest.fn(async (): Promise<void> => undefined);
const originalAppState = AppState.currentState;

jest.mock('../../src/scheduler', () => ({
  ...jest.requireActual('../../src/scheduler'),
  answerCall: jest.fn(), declineCall: jest.fn(), manualAcknowledgeCall: jest.fn(), manualSnoozeCall: jest.fn(),
  resumeOfflineCall: jest.fn(), prepareCallSpeech: jest.fn(),
}));

jest.mock('../../src/ui/components/call/OnlineReminderConversation', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {OnlineReminderConversation: ReactModule.forwardRef((props: any, ref: any) => {
    mockOnlineProps = props;
    ReactModule.useImperativeHandle(ref, () => ({endAndWait: mockEndAndWait}), []);
    return ReactModule.createElement(View, {testID: 'online-reminder-conversation'});
  })};
});

jest.mock('../../src/cloud/speechService', () => ({
  createCallSpeechProvider: () => ({
    speakText: jest.fn(async () => ({source: 'native_tts'})),
    stopSpeech: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
  }),
}));

const renderCall = () => render(
  <ThemeProvider userId="student-online-call">
    <IncomingCallScreen visible reminderId="reminder-online" task="Review math"
      userId="student-online-call" onClose={jest.fn()} />
  </ThemeProvider>,
);

beforeAll(async () => { await initDatabase(); });

beforeEach(() => {
  mockOnlineProps = null;
  Object.assign(AppState, {currentState: 'active'});
  jest.spyOn(localSettingsStore, 'get').mockReturnValue('true');
  jest.spyOn(voiceConsent, 'read').mockReturnValue(true);
  jest.spyOn(isGuestAccountModule, 'isGuestAccount').mockReturnValue(false);
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  (scheduler.answerCall as jest.Mock).mockReset().mockResolvedValue(true);
  (scheduler.declineCall as jest.Mock).mockReset().mockResolvedValue(undefined);
  (scheduler.manualAcknowledgeCall as jest.Mock).mockReset().mockResolvedValue(undefined);
  (scheduler.manualSnoozeCall as jest.Mock).mockReset().mockResolvedValue(undefined);
  (scheduler.resumeOfflineCall as jest.Mock).mockReset().mockReturnValue(true);
  (scheduler.prepareCallSpeech as jest.Mock).mockReset().mockResolvedValue(undefined);
  mockEndAndWait.mockClear();
});

// Namespace import lets Jest replace the live entitlement function.
import * as isGuestAccountModule from '../../src/cloud/entitlements';

afterEach(() => { Object.assign(AppState, {currentState: originalAppState}); jest.restoreAllMocks(); });

it('starts online only after Answer and stops it before acknowledging', async () => {
  const screen = renderCall();
  expect(screen.queryByTestId('online-reminder-conversation')).toBeNull();
  expect(scheduler.answerCall).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(scheduler.answerCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', true,
    expect.anything(), null, true);
  expect(screen.getByTestId('online-reminder-conversation')).toBeTruthy();
  expect(screen.getByLabelText('Acknowledge reminder')).toBeTruthy();
  let release!: () => void;
  mockEndAndWait.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  await act(async () => { fireEvent.press(screen.getByLabelText('Acknowledge reminder')); });
  expect(mockEndAndWait).toHaveBeenCalled();
  expect(scheduler.manualAcknowledgeCall).not.toHaveBeenCalled();
  await act(async () => { release(); });
  expect(scheduler.manualAcknowledgeCall).toHaveBeenCalledWith('reminder-online', 'student-online-call');
  expect(mockEndAndWait.mock.invocationCallOrder[0]).toBeLessThan(
    (scheduler.manualAcknowledgeCall as jest.Mock).mock.invocationCallOrder[0]);
});

it('persists explicit consent for sharing reminder details before starting online voice', async () => {
  jest.spyOn(voiceConsent, 'read').mockReturnValue(false);
  const write = jest.spyOn(voiceConsent, 'write').mockReturnValue(true);
  const store = jest.spyOn(localSettingsStore, 'set').mockReturnValue(true);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(alert.mock.calls[0][1]).toContain('this reminder');
  await act(async () => { alert.mock.calls[0][2]![1].onPress?.(); });
  expect(write).toHaveBeenCalledWith('student-online-call');
  expect(store).toHaveBeenCalledWith('student-online-call', 'voiceConversation.reminderConsent.v1', 'true');
  expect(screen.getByTestId('online-reminder-conversation')).toBeTruthy();
});

it('asks separately before sharing reminders even if general voice consent exists', async () => {
  jest.spyOn(localSettingsStore, 'get').mockImplementation((_user, key) =>
    key === 'voiceConversation.reminderConsent.v1' ? null : 'true');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(alert).toHaveBeenCalled();
  expect(PermissionsAndroid.request).not.toHaveBeenCalled();
});

it('never treats a discussion about snoozing as a reminder action', async () => {
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  act(() => { mockOnlineProps.onSpokenTurn('Can you explain what snooze means?'); });
  expect(scheduler.manualSnoozeCall).not.toHaveBeenCalled();
  await act(async () => { mockOnlineProps.onSpokenTurn('Snooze for 10 minutes'); });
  expect(scheduler.manualSnoozeCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', 10);
});

it('asks for streaming consent before requesting microphone access', async () => {
  jest.spyOn(voiceConsent, 'read').mockReturnValue(false);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(alert).toHaveBeenCalled();
  expect(PermissionsAndroid.request).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => { buttons[0].onPress?.(); });
  expect(scheduler.answerCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', true,
    expect.anything(), null, false);
  expect(screen.queryByTestId('online-reminder-conversation')).toBeNull();
});

it('falls back to offline voice after an online startup failure', async () => {
  const previous = AppState.currentState;
  Object.assign(AppState, {currentState: 'active'});
  try {
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    await act(async () => { mockOnlineProps.onSnapshot({phase: 'failed', turns: [],
      failure: {kind: 'not_configured', message: 'Unavailable'}}); });
    await waitFor(() => expect(scheduler.resumeOfflineCall).toHaveBeenCalledWith('reminder-online', 'student-online-call'));
    expect(mockEndAndWait).toHaveBeenCalled();
  } finally {
    Object.assign(AppState, {currentState: previous});
  }
});

it('keeps manual controls without starting online voice when microphone permission is denied', async () => {
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(scheduler.answerCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', false,
    expect.anything(), null, false);
  expect(screen.queryByTestId('online-reminder-conversation')).toBeNull();
  expect(screen.getByLabelText('Acknowledge reminder')).toBeTruthy();
});

it('lets the student end while microphone permission is pending', async () => {
  let grant!: (result: string) => void;
  (PermissionsAndroid.request as jest.Mock).mockImplementationOnce(() =>
    new Promise(resolve => { grant = resolve; }));
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  await act(async () => { fireEvent.press(screen.getByLabelText('End reminder call')); });
  await act(async () => { grant(PermissionsAndroid.RESULTS.GRANTED); });
  expect(scheduler.declineCall).toHaveBeenCalled();
  expect(scheduler.answerCall).not.toHaveBeenCalled();
  expect(screen.queryByTestId('online-reminder-conversation')).toBeNull();
});

it('does not restart microphone capture when the app is backgrounded', async () => {
  const previous = AppState.currentState;
  try {
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    Object.assign(AppState, {currentState: 'background'});
    await act(async () => { mockOnlineProps.onSnapshot({phase: 'restart_required', turns: [],
      restartReason: 'The conversation connection closed.'}); });
    expect(mockEndAndWait).toHaveBeenCalled();
    expect(scheduler.resumeOfflineCall).not.toHaveBeenCalled();
  } finally {
    Object.assign(AppState, {currentState: previous});
  }
});

it('does not start online capture if the app backgrounds during the announcement', async () => {
  let finish!: (accepted: boolean) => void;
  (scheduler.answerCall as jest.Mock).mockImplementationOnce(() =>
    new Promise<boolean>(resolve => { finish = resolve; }));
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(finish).toBeDefined();
  Object.assign(AppState, {currentState: 'background'});
  await act(async () => { finish(true); });
  expect(screen.queryByTestId('online-reminder-conversation')).toBeNull();
  expect(screen.getByLabelText('Acknowledge reminder')).toBeTruthy();
});
