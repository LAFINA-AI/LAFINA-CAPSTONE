/**
 * Regression tests for the Chat tab & LAFINA Call audit fixes (2026-11-21).
 */
import React from 'react';
import {Alert, AppState, DeviceEventEmitter, PermissionsAndroid} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {IncomingCallScreen} from '../../src/ui/screens/IncomingCallScreen';
import {
  chatStore,
  db,
  initDatabase,
  localSettingsStore,
  remindersStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';
import {
  createMultiActionBatch,
  executeMultiActionBatch,
  parseGroupedRequest,
} from '../../src/ai/voiceActions/multiActionService';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {predictCallMode} from '../../src/ai/offlineCall/callMode';
import {visionService} from '../../src/ai/vision/visionService';
import {
  defaultVoiceConversationDeps,
  voiceConsent,
} from '../../src/cloud/voiceConversation';
import * as entitlements from '../../src/cloud/entitlements';
import * as scheduler from '../../src/scheduler';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

let mockOnlineProps: any;
const mockEndAndWait = jest.fn(async (): Promise<void> => undefined);
const mockSendContext = jest.fn(
  async (_context: string): Promise<boolean> => true,
);

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

let serial = 0;
const seedStudent = (label: string): string => {
  serial += 1;
  const id = `audit21-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const futureDate = (daysAhead = 5): string => {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

beforeEach(() => {
  mockOnlineProps = null;
  mockEndAndWait.mockClear();
  mockSendContext.mockClear();
  (scheduler.answerCall as jest.Mock).mockReset().mockResolvedValue(true);
  (scheduler.manualAcknowledgeCall as jest.Mock)
    .mockReset()
    .mockResolvedValue('done');
  (scheduler.resumeOfflineCall as jest.Mock).mockReset().mockReturnValue(true);
  (scheduler.prepareCallSpeech as jest.Mock)
    .mockReset()
    .mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
});

describe('1.1 & 2.4 — Chat MultiActionCard works for guests, edits titles/fields cleanly, and isolates Temporary Chat', () => {
  it('saves grouped items for local_guest_user without voice consent and allows inline title editing', async () => {
    const day = futureDate(3);
    const batch = createMultiActionBatch('chat-guest-batch', GUEST_USER_ID, [
      {
        id: 'g-1',
        kind: 'task',
        title: 'Finish lab report',
        date: day,
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
      {
        id: 'g-2',
        kind: 'event',
        title: 'Study group',
        date: day,
        time: '14:00',
        endTime: '15:00',
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
    ]);

    const spy = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockResolvedValueOnce({
        userMessage: chatStore.addMessage(
          GUEST_USER_ID,
          'user',
          'Add task finish lab report and schedule study group',
        ),
        assistantMessage: chatStore.addMessage(
          GUEST_USER_ID,
          'assistant',
          'Prepared 2 items for review.',
        ),
        intent: {
          intent: 'chat',
          title: '',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Academic',
          details: '',
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: '',
          isValid: true,
        },
        multiBatch: batch,
        reply: 'Prepared 2 items for review.',
      });

    const screen = render(
      <ThemeProvider userId={GUEST_USER_ID}>
        <ChatScreen userId={GUEST_USER_ID} />
      </ThemeProvider>,
    );

    const input = screen.getByTestId('chat-text-input');
    fireEvent.changeText(input, 'Add task finish lab report and schedule study group');
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-send-button'));
    });

    expect(spy).toHaveBeenCalled();
    const titleInput = await screen.findByTestId('multi-item-title-input-0');
    expect(titleInput.props.editable).toBe(true);

    fireEvent.changeText(titleInput, 'Finish physics lab report');
    await act(async () => {
      fireEvent.press(screen.getByTestId('multi-action-confirm-all'));
    });

    await waitFor(() => {
      const tasks = tasksStore.getAllTasks(GUEST_USER_ID);
      expect(tasks.some(t => t.title === 'Finish physics lab report')).toBe(true);
    });
    const events = tasksStore.getAllEvents(GUEST_USER_ID);
    expect(events.some(e => e.title === 'Study group' && e.endTime === '15:00')).toBe(true);
  });

  it('keeps MultiActionCard confirmation out of SQLite chat history during Temporary Chat', async () => {
    const userId = seedStudent('temp-multi');
    const beforeCount = chatStore.getMessages(userId).length;
    const batch = createMultiActionBatch('temp-batch', userId, [
      {
        id: 't-1',
        kind: 'task',
        title: 'Temp grouped task',
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
    ]);

    jest.spyOn(chatOrchestrator, 'processMessage').mockResolvedValueOnce({
      userMessage: {
        id: 'tu-1',
        sessionId: 'temp_chat',
        sender: 'user',
        content: 'temp multi',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      assistantMessage: {
        id: 'ta-1',
        sessionId: 'temp_chat',
        sender: 'assistant',
        content: 'Prepared 1 item.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      intent: {
        intent: 'chat',
        title: '',
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: '',
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: '',
        isValid: true,
      },
      multiBatch: batch,
      reply: 'Prepared 1 item.',
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('chat-temporary-toggle-button'));
    fireEvent.changeText(screen.getByTestId('chat-text-input'), 'temp multi');
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-send-button'));
    });

    await screen.findByTestId('multi-action-confirm-all');
    await act(async () => {
      fireEvent.press(screen.getByTestId('multi-action-confirm-all'));
    });

    expect(chatStore.getMessages(userId)).toHaveLength(beforeCount);
    expect(screen.getByText(/All 1 items saved successfully/i)).toBeTruthy();
  });
});

describe('1.2 — Multi-action event endTime default and UTC/future reminder validation', () => {
  it('defaults event endTime to startTime + 60m and saves grouped event + future UTC reminder', async () => {
    const userId = seedStudent('multi-utc');
    const refDate = new Date(Date.now() + 2 * 86_400_000);
    const parsed = parseGroupedRequest(
      'Add meeting with "Adviser Dr. Santos" tomorrow at 2 PM and remind me tomorrow at 8 PM to prepare slides',
      refDate,
    );

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].kind).toBe('event');
    expect(parsed.items[0].time).toBe('14:00');
    expect(parsed.items[0].endTime).toBe('15:00');

    const batch = createMultiActionBatch('sess-utc', userId, parsed.items);
    const {batch: saved} = await executeMultiActionBatch(batch, userId);

    expect(saved.status).toBe('saved');
    expect(saved.items[0].status).toBe('saved');
    expect(saved.items[1].status).toBe('saved');

    const reminders = remindersStore.getAllReminders(userId);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].triggerAt.endsWith('Z')).toBe(true);
    expect(reminders[0].scheduledAt.endsWith('Z')).toBe(true);
  });

  it('rejects a grouped reminder set in the past without writing to SQLite', async () => {
    const userId = seedStudent('multi-past');
    const batch = createMultiActionBatch('sess-past', userId, [
      {
        id: 'rem-past',
        kind: 'reminder',
        title: 'Old reminder',
        date: '2020-01-01',
        time: '09:00',
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
    ]);

    const {batch: result} = await executeMultiActionBatch(batch, userId);
    expect(result.status).toBe('failed');
    expect(result.items[0].status).toBe('failed');
    expect(result.items[0].error).toMatch(/future/i);
    expect(remindersStore.getAllReminders(userId)).toHaveLength(0);
  });
});

describe('1.3 & 3.2 — Online Reminder Call planner turns and offline fallback notice', () => {
  beforeEach(() => {
    Object.assign(AppState, {currentState: 'active'});
    jest.spyOn(localSettingsStore, 'get').mockReturnValue('true');
    jest.spyOn(voiceConsent, 'read').mockReturnValue(true);
    jest.spyOn(entitlements, 'isGuestAccount').mockReturnValue(false);
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  });

  it('passes temporaryChat: true for spoken planner turns and keeps call open when "I finished it" needs clarification', async () => {
    const userId = seedStudent('online-rem');
    const processSpy = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockResolvedValueOnce({
        reply: 'I could not find an open task matching "Review math".',
        review: {
          status: 'clarify',
          reply: 'I could not find an open task matching "Review math".',
        },
      } as never);

    const screen = render(
      <ThemeProvider userId={userId}>
        <IncomingCallScreen
          visible
          reminderId="rem-clarify"
          task="Review math"
          userId={userId}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Answer reminder call'));
    });

    await act(async () => {
      mockOnlineProps.onSpokenTurn('I finished it');
    });

    expect(processSpy).toHaveBeenCalledWith(
      userId,
      'Mark task "Review math" as done',
      expect.objectContaining({
        reviewSurface: 'voice',
        temporaryChat: true,
      }),
    );
    // Must not auto-acknowledge and close the call when completion failed/clarified.
    expect(scheduler.manualAcknowledgeCall).not.toHaveBeenCalled();
    expect(screen.getByTestId('reminder-call-notice')).toHaveTextContent(
      /could not find an open task/i,
    );
  });

  it('keeps the offline fallback reason visible in notice even after resumeOfflineCall emits a state event', async () => {
    const userId = seedStudent('online-fallback');
    (scheduler.resumeOfflineCall as jest.Mock).mockImplementationOnce(() => {
      DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', {
        state: 'listening',
        text: 'Offline voice is ready. Choose one of the two responses shown on screen.',
      });
      return true;
    });

    const screen = render(
      <ThemeProvider userId={userId}>
        <IncomingCallScreen
          visible
          reminderId="rem-fallback"
          task="Submit essay"
          userId={userId}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Answer reminder call'));
    });

    await act(async () => {
      mockOnlineProps.onSnapshot({
        phase: 'failed',
        failure: {kind: 'connect_failed', message: 'Connection lost.'},
        turns: [],
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('reminder-call-notice')).toHaveTextContent(
        /Connection lost\. Switching to offline voice\./i,
      );
    });
  });
});

describe('1.4 — Call Lafina mode prediction matches VoiceConversationController isOnlineMode gate', () => {
  it('agrees on online when chat.onlineMode is unset (null) and offline when explicitly false', () => {
    const userId = seedStudent('null-online');
    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId,
      accessToken: 'tok',
      refreshToken: null,
    });
    expect(localSettingsStore.get(userId, 'chat.onlineMode', null)).toBeNull();
    expect(predictCallMode(userId, true)).toEqual({
      mode: 'online',
      reason: 'online',
    });
    expect(defaultVoiceConversationDeps(userId).gates.isOnlineMode()).toBe(
      true,
    );

    localSettingsStore.set(userId, 'chat.onlineMode', 'false');
    expect(predictCallMode(userId, true)).toEqual({
      mode: 'offline',
      reason: 'chose_offline',
    });
    expect(defaultVoiceConversationDeps(userId).gates.isOnlineMode()).toBe(
      false,
    );

    localSettingsStore.set(userId, 'chat.onlineMode', 'true');
    expect(predictCallMode(userId, true)).toEqual({
      mode: 'online',
      reason: 'online',
    });
    expect(defaultVoiceConversationDeps(userId).gates.isOnlineMode()).toBe(
      true,
    );
  });

  it('predicts signed_out (not chose_offline) for guests', () => {
    expect(predictCallMode(GUEST_USER_ID, true)).toEqual({
      mode: 'offline',
      reason: 'signed_out',
    });
  });
});

describe('2.2, 2.3, 2.4, 3.1 & 3.3 — Chat persistence, history clear sync, Temporary Chat UX, and scan draft preservation', () => {
  it('chatStore.addGeneralMessage avoids polluting USTP handbook chats', () => {
    const userId = seedStudent('ustp-voice');
    const ustpId = chatStore.startNewUstpChat(userId);
    expect(chatStore.currentSessionId(userId)).toBe(ustpId);

    const saved = chatStore.addGeneralMessage(userId, 'user', 'Hello from Call Lafina');
    expect(saved).not.toBeNull();
    expect(saved!.sessionId).not.toBe(ustpId);
    expect(chatStore.getMessages(userId, ustpId)).toHaveLength(0);
    expect(chatStore.getMessages(userId, saved!.sessionId)).toHaveLength(1);
  });

  it('resets USTP session state in ChatScreen when history is cleared externally and refreshTrigger bumps', async () => {
    const userId = seedStudent('clear-sync');
    enableUstpForTest(userId);
    chatStore.startNewUstpChat(userId);

    const screen = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} refreshTrigger={0} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('chat-ustp-mode-badge')).toBeTruthy();

    chatStore.clearHistory(userId);
    screen.rerender(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} refreshTrigger={1} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('chat-ustp-mode-badge')).toBeNull();
    });
  });

  it('hides Call Lafina button and Temporary Chat context pill when Temporary Chat is empty (even if background chat has messages)', () => {
    const userId = seedStudent('temp-ux');
    chatStore.addMessage(userId, 'user', 'Background message');
    chatStore.renameSession(
      userId,
      chatStore.currentSessionId(userId),
      'Custom Study Chat',
    );

    const screen = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} onCallLafina={jest.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('chat-call-lafina-button')).toBeTruthy();

    fireEvent.press(screen.getByTestId('chat-temporary-toggle-button'));

    // Call Lafina is hidden in Temporary Chat so voice turns cannot leak to SQLite.
    expect(screen.queryByTestId('chat-call-lafina-button')).toBeNull();
    // Context pill should NOT appear on an empty Temporary Chat screen.
    expect(
      screen.queryByText(/Temporary Chat · Not saved in history/i),
    ).toBeNull();
  });

  it('supports conversational confirm on CommandReviewCard inside Temporary Chat without persisting to SQLite', async () => {
    const userId = seedStudent('temp-confirm');
    const day = futureDate(4);
    const first = await chatOrchestrator.processMessage(
      userId,
      `Add task "Finish Temp Review" on ${day}`,
      {temporaryChat: true, temporaryHistory: []},
    );
    expect(first.review?.status).toBe('proposal');

    const second = await chatOrchestrator.processMessage(userId, 'confirm', {
      temporaryChat: true,
      temporaryHistory: [first.userMessage, first.assistantMessage],
    });
    expect(second.resolvedReview?.status).toBe('applied');
    expect(chatStore.getMessages(userId)).toHaveLength(0);
    expect(
      tasksStore.getAllTasks(userId).some(t => t.title === 'Finish Temp Review'),
    ).toBe(true);
  });

  it('preserves unsent composer draft when scanning a schedule from Camera', async () => {
    const userId = seedStudent('scan-draft');
    jest
      .spyOn(visionService, 'takePhoto')
      .mockResolvedValueOnce({uri: 'file:///schedule.jpg'} as never);
    jest
      .spyOn(visionService, 'scanScheduleFromUri')
      .mockResolvedValueOnce({rawText: 'CS101 Mon 9:00 AM - 10:00 AM'} as never);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const sendSpy = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockResolvedValueOnce({
        userMessage: chatStore.addMessage(userId, 'user', 'Scan schedule'),
        assistantMessage: chatStore.addMessage(userId, 'assistant', 'Scanned!'),
        intent: {
          intent: 'chat',
          title: '',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Academic',
          details: '',
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: '',
          isValid: true,
        },
        reply: 'Scanned!',
      });

    const screen = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    const input = screen.getByTestId('chat-text-input');
    fireEvent.changeText(input, 'My unsent draft note');

    fireEvent.press(screen.getByTestId('chat-document-format-button'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-attach-camera'));
    });

    expect(sendSpy).toHaveBeenCalledWith(
      userId,
      expect.stringContaining('Scan schedule:'),
      expect.anything(),
    );
    expect(screen.getByTestId('chat-text-input').props.value).toBe(
      'My unsent draft note',
    );
  });
});
