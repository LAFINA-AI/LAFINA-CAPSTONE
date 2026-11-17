/**
 * Call flow audit (2026-11-16): the reminder call screen. The scheduler and
 * the online conversation are mocked, so this proves what the screen shows
 * and asks for, not alarms, speech or a real phone.
 * See docs/reports/call-flow-audit-2026-11-16.md.
 */
import React from 'react';
import {AppState, DeviceEventEmitter, PermissionsAndroid} from 'react-native';
import {act, fireEvent, render, waitFor, within} from '@testing-library/react-native';
import {IncomingCallScreen} from '../../src/ui/screens/IncomingCallScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {initDatabase} from '../../src/storage';
import {voiceConsent} from '../../src/cloud/voiceConversation';
import * as entitlements from '../../src/cloud/entitlements';
import * as scheduler from '../../src/scheduler';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  endReviewSession,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {validateIntent} from '../../src/ai/nlu/types';

const USER = 'student-call-screen-audit';
const REMINDER = 'reminder-screen-audit';

let mockOnlineProps: any;
const mockEndAndWait = jest.fn(async (): Promise<void> => undefined);
const mockSendContext = jest.fn(async (_context: string): Promise<boolean> => true);
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
  return {
    OnlineReminderConversation: ReactModule.forwardRef((props: any, ref: any) => {
      mockOnlineProps = props;
      ReactModule.useImperativeHandle(
        ref,
        () => ({endAndWait: mockEndAndWait, sendContext: mockSendContext}),
        [],
      );
      return ReactModule.createElement(View, {
        testID: 'online-reminder-conversation',
      });
    }),
  };
});

jest.mock('../../src/cloud/speechService', () => ({
  createCallSpeechProvider: () => ({
    speakText: jest.fn(async () => ({source: 'native_tts'})),
    stopSpeech: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
  }),
}));

const renderCall = () =>
  render(
    <ThemeProvider userId={USER}>
      <IncomingCallScreen
        visible
        reminderId={REMINDER}
        task="Review math"
        userId={USER}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  );

const answer = async (screen: ReturnType<typeof renderCall>) => {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Answer reminder call'));
  });
};

const callEvent = (event: object) =>
  act(() => {
    DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', event);
  });

const agentTurn = (id: string, text: string) => ({
  phase: 'listening',
  turns: [{id, role: 'assistant', text, status: 'final'}],
});

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  mockOnlineProps = null;
  Object.assign(AppState, {currentState: 'active'});
  jest.spyOn(localSettingsStore, 'get').mockReturnValue('true');
  jest.spyOn(voiceConsent, 'read').mockReturnValue(true);
  jest.spyOn(entitlements, 'isGuestAccount').mockReturnValue(false);
  jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  (scheduler.answerCall as jest.Mock).mockReset().mockResolvedValue(true);
  (scheduler.declineCall as jest.Mock).mockReset().mockResolvedValue(undefined);
  (scheduler.endAnsweredCall as jest.Mock)
    .mockReset()
    .mockResolvedValue(undefined);
  (scheduler.manualAcknowledgeCall as jest.Mock)
    .mockReset()
    .mockResolvedValue('done');
  (scheduler.manualSnoozeCall as jest.Mock)
    .mockReset()
    .mockResolvedValue('done');
  (scheduler.resumeOfflineCall as jest.Mock).mockReset().mockReturnValue(true);
  (scheduler.prepareCallSpeech as jest.Mock)
    .mockReset()
    .mockResolvedValue(undefined);
  mockEndAndWait.mockClear();
  mockSendContext.mockClear();
});

afterEach(() => {
  Object.assign(AppState, {currentState: originalAppState});
  jest.restoreAllMocks();
  endReviewSession();
});

describe('Acknowledge and Snooze give feedback at once', () => {
  it('shows "Acknowledging…" on the tap and ignores a second tap', async () => {
    let finish!: (result: string) => void;
    (scheduler.manualAcknowledgeCall as jest.Mock).mockImplementationOnce(
      () => new Promise(resolve => { finish = resolve; }),
    );
    const screen = renderCall();
    await answer(screen);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Acknowledge reminder'));
    });
    expect(screen.getByText('Acknowledging…')).toBeTruthy();
    expect(
      screen.getByLabelText('Snooze reminder for 5 minutes').props
        .accessibilityState.disabled,
    ).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Acknowledge reminder'));
    });
    expect(scheduler.manualAcknowledgeCall).toHaveBeenCalledTimes(1);
    await act(async () => { finish('done'); });
  });

  it('gives the buttons back when the reminder could not be changed', async () => {
    (scheduler.manualSnoozeCall as jest.Mock).mockResolvedValueOnce('failed');
    const screen = renderCall();
    await answer(screen);

    await act(async () => {
      fireEvent.press(screen.getByTestId('reminder-call-snooze-10'));
    });
    expect(scheduler.manualSnoozeCall).toHaveBeenCalledWith(REMINDER, USER, 10, null);
    expect(screen.queryByText('Snoozing…')).toBeNull();
    expect(
      screen.getByLabelText('Acknowledge reminder').props.accessibilityState
        .disabled,
    ).toBe(false);
  });

  it('shows the result while the confirmation is still being spoken', async () => {
    const screen = renderCall();
    await answer(screen);

    callEvent({
      state: 'speaking',
      text: 'Great! Reminder acknowledged. Have a productive day.',
      resolution: {
        outcome: 'acknowledged',
        message: 'Great! Reminder acknowledged. Have a productive day.',
      },
    });

    expect(screen.getByTestId('reminder-call-result')).toHaveTextContent(
      /Reminder acknowledged/,
    );
    expect(
      screen.getByLabelText('Acknowledge reminder').props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('lets the buttons act while the reminder is still being read aloud', async () => {
    // Answer has not finished (the announcement is playing), but the
    // scheduler's session is up and has reported a state.
    (scheduler.answerCall as jest.Mock).mockImplementationOnce(
      () => new Promise<boolean>(() => undefined),
    );
    const screen = renderCall();
    await answer(screen);
    expect(
      screen.getByLabelText('Acknowledge reminder').props.accessibilityState
        .disabled,
    ).toBe(true);

    callEvent({state: 'speaking', text: 'Your scheduled reminder is…'});
    expect(
      screen.getByLabelText('Acknowledge reminder').props.accessibilityState
        .disabled,
    ).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Acknowledge reminder'));
    });
    expect(scheduler.manualAcknowledgeCall).toHaveBeenCalledWith(REMINDER, USER, null);
  });
});

describe('online reminder call: what LAFINA says matches the screen', () => {
  const proposalFor = (text: string) => {
    const prepared = prepareReviewedCommand(
      USER,
      validateIntent(parseIntentFastPath(text)),
      {surface: 'voice'},
    );
    if (prepared.status !== 'proposal') throw new Error(prepared.reply);
    return prepared;
  };

  it('a spoken planner request puts its card in the open, not in the transcript box', async () => {
    const text = 'I need to add a task to buy milk tomorrow at 5pm';
    const process = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockImplementation(async () => {
        const review = proposalFor(text);
        return {reply: review.reply, review} as never;
      });
    const screen = renderCall();
    await answer(screen);

    await act(async () => { mockOnlineProps.onSpokenTurn(text); });

    expect(process).toHaveBeenCalledWith(
      USER,
      text,
      expect.objectContaining({reviewSurface: 'voice'}),
    );
    const slot = await screen.findByTestId('reminder-call-review-slot');
    expect(within(slot).getByTestId('reminder-call-review-card')).toHaveTextContent(
      /Buy Milk/i,
    );
    expect(mockSendContext).toHaveBeenCalledWith(
      expect.stringMatching(/review card is now shown on screen/i),
    );
  });

  it('ordinary talk does not become a card', async () => {
    const process = jest.spyOn(chatOrchestrator, 'processMessage');
    const screen = renderCall();
    await answer(screen);
    for (const text of [
      'okay I will do it later tonight',
      'I have a quiz tomorrow',
      'that sounds good',
      'what should I do first?',
    ]) {
      await act(async () => { mockOnlineProps.onSpokenTurn(text); });
    }
    expect(process).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reminder-call-review-slot')).toBeNull();
  });

  it('says so when LAFINA talks about a card that is not on screen', async () => {
    const screen = renderCall();
    await answer(screen);

    await act(async () => {
      mockOnlineProps.onSnapshot(
        agentTurn('a1', 'I put a confirmation card on your screen. Tap Confirm.'),
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('reminder-call-notice')).toHaveTextContent(
        /No card was prepared/,
      ),
    );
    expect(mockSendContext).toHaveBeenCalledWith(
      expect.stringMatching(/No review card is on screen/),
    );
    // The note stays while the conversation keeps updating the reply line.
    await act(async () => {
      mockOnlineProps.onSnapshot(
        agentTurn('a1', 'I put a confirmation card on your screen. Tap Confirm.'),
      );
    });
    expect(screen.getByTestId('reminder-call-notice')).toBeTruthy();
  });

  it('a polite "got it" ends the call; the same words in a sentence do not', async () => {
    const screen = renderCall();
    await answer(screen);

    await act(async () => {
      mockOnlineProps.onSpokenTurn('I got it from the library yesterday');
    });
    expect(scheduler.manualAcknowledgeCall).not.toHaveBeenCalled();

    await act(async () => {
      mockOnlineProps.onSpokenTurn('Okay, got it, thanks.');
    });
    expect(scheduler.manualAcknowledgeCall).toHaveBeenCalledWith(REMINDER, USER, null);
  });

  it('"I finished it" keeps the call open while its card waits for Confirm', async () => {
    jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockImplementation(async () => {
        const review = proposalFor('Add task: Review math tomorrow at 9am');
        return {reply: review.reply, review} as never;
      });
    const screen = renderCall();
    await answer(screen);

    await act(async () => { mockOnlineProps.onSpokenTurn('I finished it'); });

    await screen.findByTestId('reminder-call-review-slot');
    expect(scheduler.manualAcknowledgeCall).not.toHaveBeenCalled();
  });
});
