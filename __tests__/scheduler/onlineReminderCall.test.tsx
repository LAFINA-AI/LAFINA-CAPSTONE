import React from 'react';
import {Alert, AppState, PermissionsAndroid} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {IncomingCallScreen} from '../../src/ui/screens/IncomingCallScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {initDatabase} from '../../src/storage';
import {voiceConsent} from '../../src/cloud/voiceConversation';
import * as scheduler from '../../src/scheduler';
import * as callDispatcherModule from '../../src/scheduler/callDispatcher';
import {ANSWERED_CALL_LIMIT_MS} from '../../src/scheduler/callLifecycle';

let mockOnlineProps: any;
const mockEndAndWait = jest.fn(async (): Promise<void> => undefined);
const mockSetMuted = jest.fn();
const mockStopResponse = jest.fn();
const mockSendText = jest.fn(async (_text: string): Promise<boolean> => true);
const originalAppState = AppState.currentState;

jest.mock('../../src/scheduler', () => ({
  ...jest.requireActual('../../src/scheduler'),
  answerCall: jest.fn(),
  declineCall: jest.fn(),
  endAnsweredCall: jest.fn(),
  manualAcknowledgeCall: jest.fn(),
  manualSnoozeCall: jest.fn(),
  resumeOfflineCall: jest.fn(),
  prepareCallSpeech: jest.fn(),
}));

jest.mock('../../src/ui/components/call/OnlineReminderConversation', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {OnlineReminderConversation: ReactModule.forwardRef((props: any, ref: any) => {
    mockOnlineProps = props;
    ReactModule.useImperativeHandle(ref, () => ({endAndWait: mockEndAndWait,
      setMuted: mockSetMuted, stopResponse: mockStopResponse, sendText: mockSendText}), []);
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
  (scheduler.endAnsweredCall as jest.Mock)
    .mockReset()
    .mockResolvedValue(undefined);
  (scheduler.manualAcknowledgeCall as jest.Mock)
    .mockReset()
    .mockResolvedValue(undefined);
  (scheduler.manualSnoozeCall as jest.Mock)
    .mockReset()
    .mockResolvedValue(undefined);
  (scheduler.resumeOfflineCall as jest.Mock).mockReset().mockReturnValue(true);
  (scheduler.prepareCallSpeech as jest.Mock).mockReset().mockResolvedValue(undefined);
  mockEndAndWait.mockClear();
  mockSetMuted.mockClear();
  mockStopResponse.mockClear();
  mockSendText.mockClear();
});

// Namespace import lets Jest replace the live entitlement function.
import * as isGuestAccountModule from '../../src/cloud/entitlements';

afterEach(() => { Object.assign(AppState, {currentState: originalAppState}); jest.restoreAllMocks(); });

it('starts online only after Answer and stops it before a spoken acknowledgement', async () => {
  const screen = renderCall();
  expect(screen.queryByTestId('online-reminder-conversation')).toBeNull();
  expect(scheduler.answerCall).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(scheduler.answerCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', true,
    expect.anything(), null, true);
  expect(screen.getByTestId('online-reminder-conversation')).toBeTruthy();
  let release!: () => void;
  mockEndAndWait.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  await act(async () => { mockOnlineProps.onSpokenTurn('Okay, got it, thanks.'); });
  expect(mockEndAndWait).toHaveBeenCalled();
  expect(scheduler.manualAcknowledgeCall).not.toHaveBeenCalled();
  await act(async () => { release(); });
  expect(scheduler.manualAcknowledgeCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', null);
  expect(mockEndAndWait.mock.invocationCallOrder[0]).toBeLessThan(
    (scheduler.manualAcknowledgeCall as jest.Mock).mock.invocationCallOrder[0]);
});

describe('online reminder call: a conversation, not buttons', () => {
  it('shows the Call LAFINA style call with no Acknowledge or Snooze buttons', async () => {
    const screen = renderCall();
    expect(screen.getByText('Talk with LAFINA')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    expect(screen.getByTestId('online-reminder-call-view')).toBeTruthy();
    expect(screen.queryByLabelText('Acknowledge reminder')).toBeNull();
    expect(screen.queryByTestId('reminder-call-snooze')).toBeNull();
    expect(screen.queryByTestId('reminder-call-snooze-10')).toBeNull();
    expect(screen.getByTestId('online-reminder-call-hint')).toHaveTextContent(/call me back/i);
    expect(screen.getByLabelText('End reminder call')).toBeTruthy();
  });

  it('opens straight into the online view while the checks run, without flashing the buttons', async () => {
    let grant!: (result: string) => void;
    (PermissionsAndroid.request as jest.Mock).mockImplementationOnce(() =>
      new Promise(resolve => { grant = resolve; }));
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    expect(screen.getByTestId('online-reminder-call-view')).toBeTruthy();
    expect(screen.queryByLabelText('Acknowledge reminder')).toBeNull();
    expect(screen.getByTestId('online-reminder-call-status')).toHaveTextContent(/Connecting/);
    await act(async () => { grant(PermissionsAndroid.RESULTS.GRANTED); });
    expect(screen.getByTestId('online-reminder-conversation')).toBeTruthy();
  });

  it('hanging up acknowledges through the answered-call path', async () => {
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('End reminder call')); });
    expect(mockEndAndWait).toHaveBeenCalled();
    expect(scheduler.endAnsweredCall).toHaveBeenCalledWith('reminder-online', 'student-online-call',
      expect.anything(), null);
  });

  it('a spoken "call me back in 20 minutes" snoozes for 20 minutes', async () => {
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    await act(async () => { mockOnlineProps.onSpokenTurn('Snooze for 20 minutes'); });
    expect(scheduler.manualSnoozeCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', 20, null);
  });

  it('passes the student\'s usual snooze to the conversation', async () => {
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    expect(typeof mockOnlineProps.snoozeMinutes).toBe('number');
    expect(mockOnlineProps.snoozeMinutes).toBeGreaterThan(0);
  });

  it('Mute, Stop and Type reach the live conversation', async () => {
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    await act(async () => { mockOnlineProps.onSnapshot({phase: 'speaking', muted: false, turns: []}); });
    await act(async () => { fireEvent.press(screen.getByTestId('online-reminder-call-mute')); });
    expect(mockSetMuted).toHaveBeenCalledWith(true);
    await act(async () => { fireEvent.press(screen.getByTestId('online-reminder-call-stop')); });
    expect(mockStopResponse).toHaveBeenCalled();
    await act(async () => { fireEvent.press(screen.getByTestId('online-reminder-call-type')); });
    fireEvent.changeText(screen.getByTestId('online-reminder-call-input'), 'call me back in 15 minutes');
    await act(async () => { fireEvent.press(screen.getByTestId('online-reminder-call-send')); });
    expect(mockSendText).toHaveBeenCalledWith('call me back in 15 minutes');
  });

  it('a failed spoken acknowledgement gives the offline buttons back', async () => {
    (scheduler.manualAcknowledgeCall as jest.Mock).mockResolvedValueOnce('failed');
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    await act(async () => { mockOnlineProps.onSpokenTurn('Okay, got it.'); });
    expect(scheduler.manualAcknowledgeCall).toHaveBeenCalled();
    expect(screen.queryByTestId('online-reminder-call-view')).toBeNull();
    expect(screen.getByLabelText('Acknowledge reminder')).toBeTruthy();
  });

  it('at the time limit, a call the student talked on ends as received', async () => {
    const realNow = Date.now();
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    await act(async () => { mockOnlineProps.onSpokenTurn('What else do I have today?'); });
    const autoSnooze = jest.spyOn(callDispatcherModule, 'autoSnoozeCall').mockResolvedValue(undefined);
    jest.spyOn(Date, 'now').mockReturnValue(realNow + ANSWERED_CALL_LIMIT_MS + 5_000);
    await waitFor(() => expect(scheduler.endAnsweredCall).toHaveBeenCalled(), {timeout: 3_000});
    expect(autoSnooze).not.toHaveBeenCalled();
  });

  it('at the time limit, an online call nobody spoke on still rings again later', async () => {
    const realNow = Date.now();
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    const autoSnooze = jest.spyOn(callDispatcherModule, 'autoSnoozeCall').mockResolvedValue(undefined);
    jest.spyOn(Date, 'now').mockReturnValue(realNow + ANSWERED_CALL_LIMIT_MS + 5_000);
    await waitFor(() => expect(autoSnooze).toHaveBeenCalled(), {timeout: 3_000});
    expect(scheduler.endAnsweredCall).not.toHaveBeenCalled();
  });
});

describe('offline reminder call keeps Acknowledge and Snooze', () => {
  beforeEach(() => {
    (localSettingsStore.get as jest.Mock).mockImplementation((_user: string, key: string) =>
      key === 'chat.onlineMode' ? 'false' : 'true');
  });

  it('shows the buttons and never starts the online conversation', async () => {
    const screen = renderCall();
    expect(screen.getByText('Hear the reminder')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    expect(scheduler.answerCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', true,
      expect.anything(), null, false);
    expect(screen.queryByTestId('online-reminder-call-view')).toBeNull();
    expect(screen.queryByTestId('online-reminder-conversation')).toBeNull();
    expect(screen.getByLabelText('Acknowledge reminder')).toBeTruthy();
    expect(screen.getByLabelText('Snooze reminder for 5 minutes')).toBeTruthy();
  });

  it('a guest account is always offline, even with Online Mode stored', async () => {
    (localSettingsStore.get as jest.Mock).mockReturnValue('true');
    (isGuestAccountModule.isGuestAccount as jest.Mock).mockReturnValue(true);
    const screen = renderCall();
    await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
    expect(screen.queryByTestId('online-reminder-call-view')).toBeNull();
    expect(screen.getByLabelText('Acknowledge reminder')).toBeTruthy();
  });
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
  expect(store).toHaveBeenCalledWith('student-online-call', 'voiceConversation.reminderConsent.v2', 'true');
  // The online conversation also requires the data-sharing consent this dialog discloses.
  expect(store).toHaveBeenCalledWith('student-online-call', 'voiceConversation.directDataConsent.v1', 'true');
  expect(screen.getByTestId('online-reminder-conversation')).toBeTruthy();
});

it('asks again when only the data-sharing consent is missing', async () => {
  jest.spyOn(localSettingsStore, 'get').mockImplementation((_user, key) =>
    key === 'voiceConversation.directDataConsent.v1' ? null : 'true');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(alert).toHaveBeenCalled();
});

it('does not accept consent given to the older v1 wording', async () => {
  jest.spyOn(voiceConsent, 'read').mockRestore();
  jest.spyOn(localSettingsStore, 'get').mockImplementation((_user, key) =>
    key === 'voiceConversation.consent.v2' || key === 'voiceConversation.reminderConsent.v2' ? null : 'true');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const screen = renderCall();
  await act(async () => { fireEvent.press(screen.getByLabelText('Answer reminder call')); });
  expect(alert).toHaveBeenCalled();
  expect(alert.mock.calls[0][1]).toContain('next 7 days');
});

it('asks separately before sharing reminders even if general voice consent exists', async () => {
  jest.spyOn(localSettingsStore, 'get').mockImplementation((_user, key) =>
    key === 'voiceConversation.reminderConsent.v2' ? null : 'true');
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
  expect(scheduler.manualSnoozeCall).toHaveBeenCalledWith('reminder-online', 'student-online-call', 10, null);
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
    // Offline voice took over, so the offline buttons are back.
    expect(screen.queryByTestId('online-reminder-call-view')).toBeNull();
    expect(screen.getByLabelText('Acknowledge reminder')).toBeTruthy();
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
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Answer reminder call'));
  });
  await act(async () => {
    fireEvent.press(screen.getByLabelText('End reminder call'));
  });
  await act(async () => {
    grant(PermissionsAndroid.RESULTS.GRANTED);
  });
  // End after Answer goes through endAnsweredCall, which declines (snoozes)
  // only when no answered session exists yet.
  expect(scheduler.endAnsweredCall).toHaveBeenCalled();
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
