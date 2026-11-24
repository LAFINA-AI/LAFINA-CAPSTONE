/**
 * Reminder call (online): a change the student already said is made once.
 *
 * Before this fix, "move it to 7 PM" in a reminder call was read as "update a
 * task called It" (nothing found), the agent's own planner tool was refused
 * with "ask the student to say the change", and LAFINA asked the student to
 * repeat themselves. Real SQLite (node:sqlite); the online conversation and
 * the scheduler's audio are mocks, so this proves what the screen and the
 * planner do, not what a phone speaks.
 */
import React from 'react';
import {AppState, PermissionsAndroid} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {IncomingCallScreen} from '../../src/ui/screens/IncomingCallScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {initDatabase, remindersStore} from '../../src/storage';
import {voiceConsent} from '../../src/cloud/voiceConversation';
import {cloudClient} from '../../src/cloud/cloudClient';
import * as scheduler from '../../src/scheduler';
import * as entitlements from '../../src/cloud/entitlements';
import * as reminderAlarm from '../../src/scheduler/reminderAlarm';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {parseRingingReminderChange} from '../../src/ai/nlu/ringingReminderChange';

let mockOnlineProps: any;
const mockSendContext = jest.fn(async (_text: string) => true);
const mockEndAndWait = jest.fn(async (): Promise<void> => undefined);
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
    OnlineReminderConversation: ReactModule.forwardRef(
      (props: any, ref: any) => {
        mockOnlineProps = props;
        ReactModule.useImperativeHandle(
          ref,
          () => ({endAndWait: mockEndAndWait, sendContext: mockSendContext}),
          [],
        );
        return ReactModule.createElement(View, {
          testID: 'online-reminder-conversation',
        });
      },
    ),
  };
});

jest.mock('../../src/cloud/speechService', () => ({
  createCallSpeechProvider: () => ({
    speakText: jest.fn(async () => ({source: 'native_tts'})),
    stopSpeech: jest.fn(async () => undefined),
    dispose: jest.fn(async () => undefined),
  }),
}));

const USER = 'student-move-call';
let serial = 0;
let reminderId = '';

const seedReminder = (task: string): string => {
  const id = `${USER}-rem-${(serial += 1)}`;
  const at = new Date(Date.now() + 60_000).toISOString();
  remindersStore.insertReminder({
    id,
    userId: USER,
    task,
    description: null,
    scheduledAt: at,
    triggerAt: at,
    status: 'pending',
    preCastAudioPath: null,
  });
  return id;
};

const renderCall = () =>
  render(
    <ThemeProvider userId={USER}>
      <IncomingCallScreen
        visible
        reminderId={reminderId}
        task="Team meeting prep"
        userId={USER}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  );

const answer = async (screen: ReturnType<typeof renderCall>) => {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Answer reminder call'));
  });
  await waitFor(() => expect(mockOnlineProps).toBeTruthy());
};

const tool = (name = 'prepare_lafina_action') =>
  mockOnlineProps.onPlannerTool(
    name,
    {title: 'whatever the model says'},
    () => true,
  );

/** A local "HH:mm" this many minutes from now, and its 12-hour wording. */
const inMinutes = (minutes: number) => {
  const at = new Date(Date.now() + minutes * 60_000);
  const h = at.getHours();
  const m = String(at.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Asking the student to repeat a change (a "do not ask" instruction is fine). */
const NEVER_ASKS_AGAIN =
  /(?<!(?:not|never|don't) )ask (?:the student|them) to (?:say|repeat)|say (?:the change|it|that) (?:again|once more)/i;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  mockOnlineProps = null;
  mockSendContext.mockClear();
  mockEndAndWait.mockClear();
  reminderId = seedReminder('Team meeting prep');
  Object.assign(AppState, {currentState: 'active'});
  jest.spyOn(localSettingsStore, 'get').mockReturnValue('true');
  jest.spyOn(voiceConsent, 'read').mockReturnValue(true);
  jest.spyOn(entitlements, 'isGuestAccount').mockReturnValue(false);
  jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
  jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  jest
    .spyOn(reminderAlarm, 'scheduleReminderAlarm')
    .mockResolvedValue(undefined);
  jest.spyOn(reminderAlarm, 'cancelReminderAlarm').mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (scheduler.answerCall as jest.Mock).mockReset().mockResolvedValue(true);
  (scheduler.manualSnoozeCall as jest.Mock)
    .mockReset()
    .mockResolvedValue('done');
  (scheduler.manualAcknowledgeCall as jest.Mock)
    .mockReset()
    .mockResolvedValue('done');
  (scheduler.prepareCallSpeech as jest.Mock)
    .mockReset()
    .mockResolvedValue(undefined);
});

afterEach(() => {
  Object.assign(AppState, {currentState: originalAppState});
  jest.restoreAllMocks();
  endReviewSession();
});

describe('parseRingingReminderChange: "it" is the ringing reminder', () => {
  const now = new Date(2026, 10, 24, 18, 0, 0);
  it.each([
    [
      'Move it to 7 PM.',
      {kind: 'reschedule', date: '2026-11-24', time: '19:00'},
    ],
    [
      'Move the reminder to 7 PM.',
      {kind: 'reschedule', date: '2026-11-24', time: '19:00'},
    ],
    [
      'Move my reminder to 7 PM.',
      {kind: 'reschedule', date: '2026-11-24', time: '19:00'},
    ],
    [
      'Can you move this reminder to tomorrow at 9 AM?',
      {kind: 'reschedule', date: '2026-11-25', time: '09:00'},
    ],
    [
      'Lafina, move it to 8 tonight.',
      {kind: 'reschedule', date: '2026-11-24', time: '20:00'},
    ],
    [
      "Let's move it to 8 PM.",
      {kind: 'reschedule', date: '2026-11-24', time: '20:00'},
    ],
    [
      'Reschedule it to tomorrow morning.',
      {kind: 'reschedule', date: '2026-11-25', time: '09:00'},
    ],
    [
      'Change the reminder to 6 PM tomorrow.',
      {kind: 'reschedule', date: '2026-11-25', time: '18:00'},
    ],
    [
      'Push it to 9 PM.',
      {kind: 'reschedule', date: '2026-11-24', time: '21:00'},
    ],
    // Already past today: the next one, never a time behind the student.
    [
      'Move it to 7 AM.',
      {kind: 'reschedule', date: '2026-11-25', time: '07:00'},
    ],
    // A call-back within two hours is a snooze; later is a moved reminder.
    ['Call me back at 7 PM.', {kind: 'snooze', minutes: 60}],
    ['Remind me again at 6:30 PM.', {kind: 'snooze', minutes: 30}],
    [
      'Call me back at 11 PM.',
      {kind: 'reschedule', date: '2026-11-24', time: '23:00'},
    ],
    // Moving it with no time: ask for the time only.
    ['Can you move it?', {kind: 'ask_time'}],
    ['Move the reminder please.', {kind: 'ask_time'}],
    // Past date without time and impossible calendar dates never silently roll over.
    ['Move it to November 1.', {kind: 'ask_time'}],
    ['Move it to November 31.', {kind: 'ask_time'}],
    ['Move it to November 31 at 7 PM.', {kind: 'ask_time'}],
  ])('%s', (text, expected) => {
    expect(parseRingingReminderChange(text, now)).toEqual(expected);
  });

  it.each([
    'Add a task to review notes tomorrow at 5 PM.',
    'Move my quiz task to 7 PM.',
    'Okay, I will do it later.',
    'What else do I have today?',
    "That's fine, let's move on.",
    'Make it quick.',
    "Don't move it.",
    "Don't reschedule it.",
    "Don't postpone it.",
  ])('leaves "%s" alone', text => {
    expect(parseRingingReminderChange(text, now)).toBeNull();
  });
});

describe('online reminder call: a spoken change is made once', () => {
  it('"Move it to <time>" shows one card for this reminder and the agent is told so', async () => {
    const before = remindersStore.getReminderById(reminderId)?.triggerAt;
    const screen = renderCall();
    await answer(screen);
    const when = inMinutes(180);
    await act(async () => {
      mockOnlineProps.onSpokenTurn(`Move it to ${when}.`);
    });
    const open = latestPendingReview(USER, 'voice');
    expect(open?.heading).toMatch(/move reminder/i);
    expect(open?.title).toBe('Team meeting prep');
    expect(screen.getByTestId('online-reminder-conversation')).toBeTruthy();
    const answerText: string = await tool();
    expect(answerText).toMatch(/^Review card is now on screen/);
    expect(answerText).toContain('Team meeting prep');
    expect(answerText).not.toMatch(NEVER_ASKS_AGAIN);
    // The agent's turn reads the same card; nothing new is made.
    expect(latestPendingReview(USER, 'voice')?.operationId).toBe(
      open?.operationId,
    );
    for (const [line] of mockSendContext.mock.calls)
      expect(line).not.toMatch(NEVER_ASKS_AGAIN);
    // Nothing is saved before the student confirms.
    expect(remindersStore.getReminderById(reminderId)?.triggerAt).toBe(before);
  });

  it('the agent tool arriving before the device finished waits for that one reading', async () => {
    const screen = renderCall();
    await answer(screen);
    let answerText = '';
    await act(async () => {
      mockOnlineProps.onSpokenTurn(
        `Can you move this reminder to tomorrow at 9 AM?`,
      );
      answerText = await tool();
    });
    expect(answerText).toMatch(/^Review card is now on screen/);
  });

  it('"confirm" saves the moved reminder and confirm_draft reports it saved', async () => {
    const screen = renderCall();
    await answer(screen);
    await act(async () => {
      mockOnlineProps.onSpokenTurn('Move it to tomorrow at 9 AM.');
    });
    expect(latestPendingReview(USER, 'voice')).toBeTruthy();
    await act(async () => {
      mockOnlineProps.onSpokenTurn('Confirm.');
    });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await waitFor(() =>
      expect(remindersStore.getReminderById(reminderId)?.triggerAt).toBe(
        tomorrow.toISOString(),
      ),
    );
    expect(await tool('confirm_draft')).toMatch(/^Saved:/);
  });

  it('"Push it to <time>" moves the reminder instead of making a task called "Push It"', async () => {
    const screen = renderCall();
    await answer(screen);
    await act(async () => {
      mockOnlineProps.onSpokenTurn(`Push it to ${inMinutes(200)}.`);
    });
    const open = latestPendingReview(USER, 'voice');
    expect(open?.heading).toMatch(/move reminder/i);
    expect(open?.title).not.toMatch(/push it/i);
  });

  it('"Call me back at <30 minutes from now>" snoozes this call for 30 minutes', async () => {
    const screen = renderCall();
    await answer(screen);
    await act(async () => {
      mockOnlineProps.onSpokenTurn(`Call me back at ${inMinutes(30)}.`);
    });
    await waitFor(() => expect(scheduler.manualSnoozeCall).toHaveBeenCalled());
    const minutes = (scheduler.manualSnoozeCall as jest.Mock).mock.calls[0][2];
    expect(minutes).toBeGreaterThanOrEqual(29);
    expect(minutes).toBeLessThanOrEqual(30);
    expect(latestPendingReview(USER, 'voice')).toBeNull();
  });

  it('"move it" with no time asks only for the time, not for the whole change', async () => {
    const screen = renderCall();
    await answer(screen);
    await act(async () => {
      mockOnlineProps.onSpokenTurn('Can you move it?');
    });
    const answerText: string = await tool();
    expect(answerText).toMatch(/when should the reminder ring/i);
    expect(answerText).not.toMatch(NEVER_ASKS_AGAIN);
    expect(latestPendingReview(USER, 'voice')).toBeNull();
  });

  it('revise_draft evaluates the student revision instead of returning the unchanged open card', async () => {
    const screen = renderCall();
    await answer(screen);
    await act(async () => {
      mockOnlineProps.onSpokenTurn('Move it to tomorrow at 9 AM.');
    });
    const initial = latestPendingReview(USER, 'voice');
    expect(initial?.heading).toMatch(/move reminder/i);
    // A revision phrase not matched by the fast ringing-reminder parser falls
    // through with outcome "none"; revise_draft should re-run the planner.
    await act(async () => {
      mockOnlineProps.onSpokenTurn('Actually 10 AM tomorrow.');
    });
    let revisedText = '';
    await act(async () => {
      revisedText = await tool('revise_draft');
    });
    expect(revisedText).toMatch(/^Review card is now on screen/);
    expect(revisedText).toMatch(/10:00 AM/);
  });

  it('a model that mentions a missing card is never told to make the student repeat', async () => {
    const screen = renderCall();
    await answer(screen);
    await act(async () => {
      mockOnlineProps.onSnapshot({
        phase: 'listening',
        turns: [
          {
            id: 'a1',
            role: 'assistant',
            text: 'I put a card on your screen.',
            status: 'final',
          },
        ],
      });
    });
    await waitFor(() => expect(mockSendContext).toHaveBeenCalled(), {
      timeout: 2000,
    });
    for (const [line] of mockSendContext.mock.calls)
      expect(line).not.toMatch(NEVER_ASKS_AGAIN);
  });
});

describe('online reminder call: connects while the reminder is read', () => {
  it('mounts the conversation before the reading ends and holds audio until it does', async () => {
    let finishReading!: (accepted: boolean) => void;
    (scheduler.answerCall as jest.Mock).mockImplementation(
      () => new Promise<boolean>(resolve => (finishReading = resolve)),
    );
    const screen = renderCall();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Answer reminder call'));
    });
    // The reminder is still being read, and the conversation is already set up.
    await waitFor(() =>
      expect(screen.getByTestId('online-reminder-conversation')).toBeTruthy(),
    );
    let opened = false;
    const gate = mockOnlineProps.beforeAudio().then(() => {
      opened = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(opened).toBe(false);
    await act(async () => {
      finishReading(true);
      await gate;
    });
    expect(opened).toBe(true);
  });
});
