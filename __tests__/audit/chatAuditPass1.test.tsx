/**
 * Chat Feature Audit — Pass 1 Regression & Edge-Case Tests.
 * Covers bugs found across ChatInput PTT, RetainedTab/UstpSourcesSheet,
 * ChatScreen lifecycle/account switch/Temporary Chat/USTP block/scan/retry,
 * ChatHistorySheet rename/delete, ChatOrchestrator, Quick Chat, chatMemoryStore,
 * chatSyncStore, chatMarkdown, SourceNoteText, CommandReviewCard, and chatFiles.
 */
import React from 'react';
import {Alert, Keyboard, NativeModules, Text} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import RNFS from 'react-native-fs';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {ChatInput} from '../../src/ui/components/chat/ChatInput';
import {ChatMessageItem} from '../../src/ui/components/chat/ChatMessageItem';
import {SourceNoteText} from '../../src/ui/components/chat/SourceNoteText';
import {UstpSourcesSheet} from '../../src/ui/components/chat/UstpSourcesSheet';
import {CommandReviewCard} from '../../src/ui/components/chat/CommandReviewCard';
import {
  removeAttachmentFiles,
  saveGeneratedFile,
} from '../../src/ui/components/chat/chatFiles';
import {VoiceModal} from '../../src/ui/components/VoiceModal';
import {RetainedTab, ScreenOverlays} from '../../src/ui/navigation/RetainedTab';
import {QuickChatConversation} from '../../src/ui/quickChat/QuickChatConversation';
import {quickChatController} from '../../src/ai/quickChat/quickChatController';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {sttService} from '../../src/ai/stt/sttService';
import {ttsService} from '../../src/ai/tts/ttsService';
import {visionService} from '../../src/ai/vision/visionService';
import * as scheduleParser from '../../src/ai/vision/scheduleParser';
import {
  normalizeSpeech,
  parseDateAndTime,
  parseIntentFastPath,
} from '../../src/ai/nlu/fastPathParser';
import {detectSkillIntent} from '../../src/ai/skills/skillIntent';
import {prepareSkillLaunch} from '../../src/ai/skills/skillHandoff';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import * as knowledgeLibrary from '../../src/handbook/knowledgeLibrary';
import {
  LOCAL_NO_EVIDENCE_REPLY,
  localHandbookService,
} from '../../src/handbook';
import {
  extractQueryTokens,
  linkifyUrls,
  shouldMergeFollowUpQuery,
} from '../../src/handbook/handbookSearch';
import {campusSourceNote} from '../../src/handbook/knowledgeCitations';
import {attachmentCleanupTarget} from '../../src/storage/attachmentCleanup';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import {
  editReviewedCommand,
  endReviewSession,
  latestPendingReview,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {
  hasWideMarkdownBlock,
  hideDanglingMarkers,
  parseChatMarkdown,
} from '../../src/utils/chatMarkdown';
import {
  chatMemoryStore,
  chatStore,
  db,
  initDatabase,
  localSettingsStore,
  notesStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {chatSyncStore} from '../../src/storage/chatSyncStore';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

let userSeq = 0;
const makeStudent = (tag: string): string => {
  userSeq += 1;
  const id = `audit-p1-${tag}-${userSeq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

beforeEach(() => {
  endReviewSession();
  quickChatController.resetForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
});

describe('Pass 1: ChatInput push-to-talk races & Call button guard', () => {
  it('never starts recording if user releases finger while mic permission prompt is pending', async () => {
    const userId = makeStudent('ptt-release-perm');
    const perm = deferred<boolean>();
    jest
      .spyOn(sttService, 'ensureMicrophonePermission')
      .mockReturnValueOnce(perm.promise);
    const startSpy = jest.spyOn(sttService, 'startListening');

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatInput
          inputText=""
          setInputText={jest.fn()}
          onSend={jest.fn()}
          isSending={false}
          isOnlineMode={false}
        />
      </ThemeProvider>,
    );

    const mic = ui.getByTestId('chat-mic-button');
    fireEvent(mic, 'pressIn', {nativeEvent: {pageX: 250, pageY: 500}});
    // Finger released before permission resolves
    await act(async () => {
      fireEvent(mic, 'pressOut');
    });
    await act(async () => {
      perm.resolve(true);
      await perm.promise;
    });

    expect(startSpy).not.toHaveBeenCalled();
    expect(ui.queryByText(/Listening/i)).toBeNull();
  });

  it('prevents double-tap pressIn from starting two captures while permission is pending', async () => {
    const userId = makeStudent('ptt-double-press');
    const perm = deferred<boolean>();
    const permSpy = jest
      .spyOn(sttService, 'ensureMicrophonePermission')
      .mockReturnValue(perm.promise);
    const startSpy = jest.spyOn(sttService, 'startListening');

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatInput
          inputText=""
          setInputText={jest.fn()}
          onSend={jest.fn()}
          isSending={false}
          isOnlineMode={false}
        />
      </ThemeProvider>,
    );

    const mic = ui.getByTestId('chat-mic-button');
    fireEvent(mic, 'pressIn', {nativeEvent: {pageX: 250, pageY: 500}});
    fireEvent(mic, 'pressIn', {nativeEvent: {pageX: 250, pageY: 500}});

    await act(async () => {
      perm.resolve(true);
      await perm.promise;
    });

    expect(permSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent(mic, 'touchCancel');
    });
  });

  it('does not call onSend if unmounted while transcribing', async () => {
    const userId = makeStudent('ptt-unmount');
    const resultDeferred = deferred<{
      captureId: string;
      transcript: string;
      speechDetected: boolean;
      cancelled: boolean;
      captureDurationMs: number;
      inferenceDurationMs: number;
    }>();
    jest
      .spyOn(sttService, 'ensureMicrophonePermission')
      .mockResolvedValue(true);
    jest.spyOn(sttService, 'startListening').mockReturnValue({
      captureId: 'cap-unmount',
      result: resultDeferred.promise,
    });
    jest.spyOn(sttService, 'stopListening').mockResolvedValue(true);
    const onSend = jest.fn();

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatInput
          inputText=""
          setInputText={jest.fn()}
          onSend={onSend}
          isSending={false}
          isOnlineMode={false}
        />
      </ThemeProvider>,
    );

    const mic = ui.getByTestId('chat-mic-button');
    await act(async () => {
      fireEvent(mic, 'pressIn', {nativeEvent: {pageX: 250, pageY: 500}});
    });
    fireEvent(mic, 'pressOut');
    ui.unmount();

    await act(async () => {
      resultDeferred.resolve({
        captureId: 'cap-unmount',
        transcript: 'Late transcript',
        speechDetected: true,
        cancelled: false,
        captureDurationMs: 600,
        inferenceDurationMs: 100,
      });
      await resultDeferred.promise;
    });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables Call Lafina button while a message is sending', () => {
    const userId = makeStudent('call-btn-busy');
    const onCall = jest.fn();
    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatInput
          inputText=""
          setInputText={jest.fn()}
          onSend={jest.fn()}
          onCallLafina={onCall}
          isSending={true}
          isOnlineMode={false}
        />
      </ThemeProvider>,
    );
    const callBtn = ui.getByTestId('chat-call-lafina-button');
    expect(callBtn.props.accessibilityState).toEqual(
      expect.objectContaining({disabled: true}),
    );
  });
});

describe('Pass 1: RetainedTab ScreenOverlays & UstpSourcesSheet error handling', () => {
  it('hides target-based overlays (UstpSourcesSheet) when RetainedTab becomes inactive', () => {
    const Probe = ({target}: {target: {kind: string} | null}) => (
      <Text>{target ? 'OPEN' : 'CLOSED'}</Text>
    );
    const Host = ({active}: {active: boolean}) => (
      <RetainedTab active={active} tables={[]}>
        <ScreenOverlays>
          <Probe target={{kind: 'library'}} />
        </ScreenOverlays>
      </RetainedTab>
    );

    const ui = render(<Host active={true} />);
    expect(ui.getByText('OPEN')).toBeTruthy();
    ui.rerender(<Host active={false} />);
    expect(ui.queryByText('OPEN')).toBeNull();
  });

  it('shows unavailable text instead of spinning forever when prepareKnowledgeLibrary rejects', async () => {
    const userId = makeStudent('sources-fail');
    jest
      .spyOn(knowledgeLibrary, 'prepareKnowledgeLibrary')
      .mockRejectedValueOnce(new Error('disk full'));

    const ui = render(
      <ThemeProvider userId={userId}>
        <UstpSourcesSheet target={{kind: 'library'}} onClose={jest.fn()} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        ui.getByText(
          'The USTP sources are not available on this phone right now.',
        ),
      ).toBeTruthy();
    });
    expect(ui.queryByTestId('ustp-sources-loading')).toBeNull();
  });
});

describe('Pass 1: ChatScreen lifecycle, account switch, Temporary Chat, USTP block, scan & rename', () => {
  it('resets Online Mode and in-flight sending state when switching accounts', async () => {
    const userA = makeStudent('switch-online-a');
    const userB = makeStudent('switch-online-b');
    localSettingsStore.set(userA, 'chat.onlineMode', 'true');
    localSettingsStore.set(userB, 'chat.onlineMode', 'false');

    const pendingA = deferred<any>();
    const processSpy = jest
      .spyOn(chatOrchestrator, 'processMessage')
      .mockImplementationOnce(() => pendingA.promise);

    const ui = render(
      <ThemeProvider userId={userA}>
        <ChatScreen userId={userA} />
      </ThemeProvider>,
    );

    expect(
      ui.getByTestId('chat-online-toggle-button').findByProps({
        children: 'Online',
      }),
    ).toBeTruthy();

    fireEvent.changeText(ui.getByTestId('chat-text-input'), 'Question from A');
    fireEvent.press(ui.getByTestId('chat-send-button'));
    expect(processSpy).toHaveBeenCalledTimes(1);

    // Switch to User B while User A's request is still in flight
    ui.rerender(
      <ThemeProvider userId={userB}>
        <ChatScreen userId={userB} />
      </ThemeProvider>,
    );

    // User B must NOT inherit User A's Online Mode or isSending lock
    await waitFor(() => {
      expect(ui.queryByText('Online')).toBeNull();
    });
    expect(ui.getByTestId('chat-text-input').props.editable).toBe(true);

    // Now User B starts its own request while A is still pending
    const pendingB = deferred<any>();
    processSpy.mockImplementationOnce(() => pendingB.promise);
    fireEvent.changeText(ui.getByTestId('chat-text-input'), 'Question from B');
    fireEvent.press(ui.getByTestId('chat-send-button'));
    expect(processSpy).toHaveBeenCalledTimes(2);
    expect(ui.getByTestId('chat-text-input').props.editable).toBe(false);

    // User A's late response finishes: must NOT unlock or clobber User B's active send
    await act(async () => {
      pendingA.resolve({
        userMessage: chatStore.addMessage(userA, 'user', 'Question from A'),
        assistantMessage: chatStore.addMessage(userA, 'assistant', 'Late A'),
        intent: {intent: 'chat'},
        reply: 'Late A',
      });
      await pendingA.promise;
    });
    expect(ui.getByTestId('chat-text-input').props.editable).toBe(false);

    // Finish User B's request cleanly
    await act(async () => {
      pendingB.resolve({
        userMessage: chatStore.addMessage(userB, 'user', 'Question from B'),
        assistantMessage: chatStore.addMessage(userB, 'assistant', 'Reply B'),
        intent: {intent: 'chat'},
        reply: 'Reply B',
      });
      await pendingB.promise;
    });
    await waitFor(() => {
      expect(ui.getByTestId('chat-text-input').props.editable).toBe(true);
    });
  });

  it('hides Load earlier messages and shows Temporary Chat empty state when entering Temp Chat from a long chat', () => {
    const userId = makeStudent('temp-from-long');
    for (let i = 0; i < 55; i += 1) {
      chatStore.addMessage(userId, i % 2 === 0 ? 'user' : 'assistant', `m${i}`);
    }

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('chat-load-earlier')).toBeTruthy();

    fireEvent.press(ui.getByTestId('chat-temporary-toggle-button'));

    expect(ui.queryByTestId('chat-load-earlier')).toBeNull();
    expect(ui.getByText('Not saved in history')).toBeTruthy();
  });

  it('preserves Temporary Chat messages when starting Ask USTP fails at the 20-chat limit', async () => {
    const userId = makeStudent('temp-ustp-limit');
    enableUstpForTest(userId);
    chatSyncStore.setEnabled(userId, false);
    for (let n = 0; n < 20; n += 1) {
      const sid =
        n === 0
          ? chatStore.currentSessionId(userId)
          : chatStore.startNewChat(userId);
      chatStore.addMessage(userId, 'user', `chat ${n + 1}`, null, null, sid);
    }
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    fireEvent.press(ui.getByTestId('chat-temporary-toggle-button'));
    fireEvent.changeText(ui.getByTestId('chat-text-input'), 'Keep my temp msg');
    await act(async () => {
      fireEvent.press(ui.getByTestId('chat-send-button'));
    });
    expect(await ui.findByText('Keep my temp msg')).toBeTruthy();

    // Open history sheet and tap Ask USTP (hits 20-chat limit)
    fireEvent.press(ui.getByTestId('chat-history-button'));
    fireEvent.press(ui.getByText('Ask USTP'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Chat Limit Reached',
      expect.any(String),
    );
    // Temporary Chat and its message MUST still be intact!
    expect(ui.getByText('Keep my temp msg')).toBeTruthy();
  });

  it('renaming the open chat refreshes the title without dropping loaded earlier pages', async () => {
    const userId = makeStudent('rename-keeps-pages');
    for (let i = 0; i < 55; i += 1) {
      chatStore.addMessage(userId, i % 2 === 0 ? 'user' : 'assistant', `m${i}`);
    }
    const sessionId = chatStore.currentSessionId(userId);

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(ui.getByTestId('chat-load-earlier'));
    });
    expect(
      (ui.getByTestId('chat-messages-list').props.data as unknown[]).length,
    ).toBe(55);

    fireEvent.press(ui.getByTestId('chat-history-button'));
    fireEvent.press(ui.getByTestId(`chat-history-rename-${sessionId}`));
    fireEvent.changeText(
      ui.getByTestId('chat-history-rename-input'),
      'Algorithms Study',
    );
    fireEvent.press(ui.getByTestId('chat-history-rename-save'));

    await waitFor(() => {
      expect(ui.getAllByText('Algorithms Study').length).toBeGreaterThanOrEqual(
        1,
      );
    });
    // All 55 loaded messages remain in memory (not reset back to 50)
    expect(
      (ui.getByTestId('chat-messages-list').props.data as unknown[]).length,
    ).toBe(55);
  });

  it('cancelling camera scan in Temporary Chat preserves Temporary Chat and blocks concurrent pickers', async () => {
    const userId = makeStudent('scan-cancel-temp');
    const photoDeferred = deferred<{uri: string} | null>();
    const takePhotoSpy = jest
      .spyOn(visionService, 'takePhoto')
      .mockReturnValueOnce(photoDeferred.promise as any);

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    fireEvent.press(ui.getByTestId('chat-temporary-toggle-button'));
    fireEvent.changeText(ui.getByTestId('chat-text-input'), 'Temp thought');
    await act(async () => {
      fireEvent.press(ui.getByTestId('chat-send-button'));
    });
    expect(await ui.findByText('Temp thought')).toBeTruthy();

    fireEvent.press(ui.getByTestId('chat-document-format-button'));
    fireEvent.press(ui.getByTestId('chat-attach-camera'));
    // Second tap while picker is open must be ignored
    fireEvent.press(ui.getByTestId('chat-document-format-button'));
    fireEvent.press(ui.getByTestId('chat-attach-camera'));
    expect(takePhotoSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      photoDeferred.resolve(null);
      await photoDeferred.promise;
    });

    expect(ui.getByText('Temp thought')).toBeTruthy();
  });

  it('shows refusal feedback instead of vanishing silently when confirming a stale card in Temporary Chat', async () => {
    const userId = makeStudent('temp-refused-card');
    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    fireEvent.press(ui.getByTestId('chat-temporary-toggle-button'));
    fireEvent.changeText(
      ui.getByTestId('chat-text-input'),
      'add task submit lab report tomorrow',
    );
    await act(async () => {
      fireEvent.press(ui.getByTestId('chat-send-button'));
    });
    expect(await ui.findByTestId('chat-review-confirm')).toBeTruthy();

    // Expire/end review session externally before tapping Confirm
    endReviewSession();
    await act(async () => {
      fireEvent.press(ui.getByTestId('chat-review-confirm'));
    });

    await waitFor(() => {
      expect(ui.queryByTestId('chat-review-card')).toBeNull();
    });
    expect(ui.getByText(/no longer available|expired/i)).toBeTruthy();
  });

  it('blocks composer and hides load-earlier on a blocked USTP chat with prior messages', () => {
    const userId = makeStudent('blocked-ustp-msg');
    enableUstpForTest(userId);
    const ustpId = chatStore.startNewUstpChat(userId);
    for (let i = 0; i < 55; i += 1) {
      chatStore.addMessage(userId, 'user', `ustp ${i}`, null, null, ustpId);
    }
    // Revoke USTP eligibility (e.g. student changed school setup)
    studentSetupStore.clear(userId);

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('chat-ustp-unavailable')).toBeTruthy();
    expect(ui.queryByTestId('chat-load-earlier')).toBeNull();
    expect(ui.getByTestId('chat-text-input').props.editable).toBe(false);
  });

  it('resets keyboard listener state cleanly on unmount after keyboardDidShow', () => {
    const userId = makeStudent('kb-cleanup');
    const listeners: Record<string, (e?: any) => void> = {};
    jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((event: string, cb: any) => {
        listeners[event] = cb;
        return {remove: jest.fn()} as any;
      });

    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );

    act(() => {
      listeners.keyboardDidShow?.({endCoordinates: {height: 300}});
    });
    // Unmounting while keyboard is open must clean up without throwing
    expect(() => ui.unmount()).not.toThrow();
  });
});

describe('Pass 1: ChatOrchestrator edge cases', () => {
  it('ignores empty/whitespace messages without writing empty rows to SQLite', async () => {
    const userId = makeStudent('empty-msg');
    const res = await chatOrchestrator.processMessage(userId, '   \n\t  ');
    expect(res.reply).toBeTruthy();
    expect(chatStore.getMessages(userId)).toHaveLength(0);
  });

  it('remembers scanned schedule review turn so replying "yes" confirms classes into Calendar', async () => {
    const userId = makeStudent('scan-yes');
    const refDate = new Date('2026-11-11T09:00:00Z');

    const first = await chatOrchestrator.processMessage(
      userId,
      'Scan schedule:\nCS 211 Data Structures | MWF 09:00 AM - 10:30 AM | Lab 1',
      {referenceDate: refDate},
    );
    expect(first.review?.status).toBe('proposal');

    const confirm = await chatOrchestrator.processMessage(userId, 'yes', {
      referenceDate: refDate,
    });
    expect(confirm.resolvedReview?.status).toBe('applied');
    expect(timeBlocksStore.getAll(userId)).toHaveLength(3);
  });

  it('does not crash when parseScannedSchedule returns a class with empty days array', async () => {
    const userId = makeStudent('scan-empty-days');
    jest.spyOn(scheduleParser, 'parseScannedSchedule').mockReturnValueOnce({
      classes: [
        {
          id: 'c1',
          subject: 'ORPHAN 101',
          days: [],
          startTime: '09:00',
          endTime: '10:00',
          startTime12: '9:00 AM',
          endTime12: '10:00 AM',
          recurrenceRule: 'FREQ=WEEKLY;UNTIL=20270317T235959Z',
          rawText: 'ORPHAN 101',
        },
      ],
      markdownTable: '### Scanned',
      rawText: 'ORPHAN 101',
      commandSummary: '',
      semesterEndDate: '20270317T235959Z',
    });

    const res = await chatOrchestrator.processMessage(
      userId,
      'Scan schedule: ORPHAN 101',
    );
    expect(res.reply).toBe('### Scanned');
    expect(res.review).toBeUndefined();
  });

  it('still sends current user message to DeepSeek when Temporary Chat passes temporaryHistory: []', async () => {
    const userId = makeStudent('temp-empty-hist');
    const sendSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: 'Photosynthesis converts light.',
          sources: [],
          usedHandbook: false,
        },
      });

    const res = await chatOrchestrator.processMessage(
      userId,
      'Explain photosynthesis briefly',
      {
        onlineMode: true,
        temporaryChat: true,
        temporaryHistory: [],
      },
    );

    expect(res.usedOnline).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [sentHistory] = sendSpy.mock.calls[0];
    expect(sentHistory.length).toBeGreaterThanOrEqual(1);
    expect(sentHistory[sentHistory.length - 1].content).toContain(
      'Explain photosynthesis briefly',
    );
  });

  it('does not falsely return LOCAL_NO_EVIDENCE_REPLY on a very long USTP question', async () => {
    const userId = makeStudent('long-ustp');
    enableUstpForTest(userId);
    await localHandbookService.ensureReady();

    const sendSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: 'You need a GWA of 1.75 or better for the Dean’s List.',
          sources: [],
          usedHandbook: false,
        },
      });

    const longPrefix = `${'Please explain USTP rules carefully. '.repeat(105)}`;
    const longQuestion = `${longPrefix}What GPA is required for Dean's List?`;
    expect(longQuestion.length).toBeGreaterThan(3700);

    const res = await chatOrchestrator.processMessage(userId, longQuestion, {
      onlineMode: true,
      useHandbook: true,
      ustpRagOnly: true,
    });

    expect(res.reply).not.toBe(LOCAL_NO_EVIDENCE_REPLY);
    expect(res.handbookNote).toContain('USTP Student Handbook');
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [sentHistory] = sendSpy.mock.calls[0];
    expect(
      sentHistory[sentHistory.length - 1].content.length,
    ).toBeLessThanOrEqual(3900);
  });

  it('treats an empty online reply as fallback instead of persisting empty usedOnline=true', async () => {
    const userId = makeStudent('empty-online-reply');
    jest.spyOn(onlineChatSkill, 'sendChatMessage').mockResolvedValueOnce({
      status: 'success',
      data: {reply: '   ', sources: [], usedHandbook: false},
    });

    const res = await chatOrchestrator.processMessage(
      userId,
      'Explain mitosis',
      {onlineMode: true, useHandbook: false},
    );
    expect(res.usedOnline).toBe(false);
    expect(res.reply.trim().length).toBeGreaterThan(0);
  });
});

describe('Pass 1: Quick Chat inline edit rebind, idle cleanup, account switch & citations', () => {
  it('inline edit in Quick Chat rebinds review turn so conversational "yes" confirms edited title', async () => {
    const userId = makeStudent('qc-edit-yes');
    const ui = render(
      <ThemeProvider userId={userId}>
        <QuickChatConversation userId={userId} onlineMode={false} />
      </ThemeProvider>,
    );

    fireEvent.changeText(
      ui.getByTestId('quick-chat-input'),
      'add task biology quiz tomorrow',
    );
    await act(async () => {
      fireEvent.press(ui.getByTestId('quick-chat-send'));
    });

    await waitFor(() => {
      expect(ui.getByTestId('quick-review-edit')).toBeTruthy();
    });

    // Inline edit title
    fireEvent.press(ui.getByTestId('quick-review-edit'));
    fireEvent.changeText(
      ui.getByTestId('quick-review-edit-title'),
      'Organic Chemistry Quiz',
    );
    fireEvent.press(ui.getByTestId('quick-review-edit-save'));

    await waitFor(() => {
      expect(ui.getByTestId('quick-review-action')).toHaveTextContent(
        /Organic Chemistry Quiz/,
      );
    });

    // Conversational "yes" must confirm the edited proposal!
    fireEvent.changeText(ui.getByTestId('quick-chat-input'), 'yes');
    await act(async () => {
      fireEvent.press(ui.getByTestId('quick-chat-send'));
    });

    await waitFor(() => {
      expect(
        tasksStore
          .getAllTasks(userId)
          .some(t => t.title === 'Organic Chemistry Quiz'),
      ).toBe(true);
    });
  });

  it('cancels orphaned pending Quick Chat review cards on 30-minute idle expiry', async () => {
    const userId = makeStudent('qc-idle-cancel');
    let clock = 1_700_000_000_000;
    quickChatController.resetForTests(() => clock);

    await quickChatController.send(userId, 'add task idle task tomorrow');
    expect(latestPendingReview(userId, 'quick')).not.toBeNull();

    // Advance clock past 30 minutes
    clock += 31 * 60 * 1000;
    expect(quickChatController.getTranscript(userId)).toEqual([]);
    expect(latestPendingReview(userId, 'quick')).toBeNull();
  });

  it('renders handbookNote citations in Quick Chat and resets draft on userId switch', async () => {
    const userA = makeStudent('qc-cite-a');
    const userB = makeStudent('qc-cite-b');
    const at = new Date().toISOString();
    jest.spyOn(chatOrchestrator, 'processMessage').mockResolvedValueOnce({
      userMessage: {
        id: 'qu-1',
        sessionId: 'temp_chat',
        sender: 'user',
        content: 'Dress code?',
        createdAt: at,
        updatedAt: at,
      },
      assistantMessage: {
        id: 'qa-1',
        sessionId: 'temp_chat',
        sender: 'assistant',
        content: 'Wear the official USTP uniform.',
        handbookNote: 'Referenced USTP Student Handbook (p. 120)',
        createdAt: at,
        updatedAt: at,
      },
      handbookNote: 'Referenced USTP Student Handbook (p. 120)',
      intent: {intent: 'chat'} as any,
      reply: 'Wear the official USTP uniform.',
    });

    const ui = render(
      <ThemeProvider userId={userA}>
        <QuickChatConversation userId={userA} onlineMode={false} />
      </ThemeProvider>,
    );

    fireEvent.changeText(ui.getByTestId('quick-chat-input'), 'Dress code?');
    await act(async () => {
      fireEvent.press(ui.getByTestId('quick-chat-send'));
    });

    expect(
      await ui.findByText(/Referenced USTP Student Handbook \(p\. 120\)/),
    ).toBeTruthy();

    fireEvent.changeText(ui.getByTestId('quick-chat-input'), 'Unsent draft A');
    ui.rerender(
      <ThemeProvider userId={userB}>
        <QuickChatConversation userId={userB} onlineMode={false} />
      </ThemeProvider>,
    );
    expect(ui.getByTestId('quick-chat-input').props.value).toBe('');
  });
});

describe('Pass 1: Memory store, Sync store, Markdown, MessageItem, SourceNote, CommandReview & chatFiles', () => {
  it('chatMemoryStore.applyChanges purges expired rows before snapshotting and update ignores expired duplicates', () => {
    const userId = makeStudent('mem-expired');
    const past = '2020-01-01T00:00:00.000Z';
    chatMemoryStore.add(userId, 'Temporary expired memory', {expiresAt: past});
    const live = chatMemoryStore.add(userId, 'Studies in the library');
    expect(live).not.toBeNull();

    const changes = chatMemoryStore.applyChanges(
      userId,
      {add: ['Prefers concise replies'], remove: []},
      null,
    );
    // Expired row must NOT show up as newly forgotten in changes.removed
    expect(changes.removed).toEqual([]);
    expect(changes.added).toHaveLength(1);

    // Add another expired row and make sure update() doesn't collide with it
    chatMemoryStore.add(userId, 'Prefers quiet corners', {expiresAt: past});
    const updated = chatMemoryStore.update(userId, live!.id, {
      text: 'Prefers quiet corners',
    });
    expect(updated?.text).toBe('Prefers quiet corners');
  });

  it('chatSyncStore.holdForLimit removes orphaned chat_message outbox rows after local delete', () => {
    const userId = makeStudent('sync-hold-orphan');
    const sid = chatStore.startNewChat(userId);
    const msg = chatStore.addMessage(
      userId,
      'user',
      'Orphan test',
      null,
      null,
      sid,
    );
    // Remove local message row while leaving its outbox entry behind
    db.executeSync('DELETE FROM messages WHERE id = ?', [msg.id]);

    db.transactionSync(tx => {
      chatSyncStore.holdForLimit(tx, userId, 'chat_message', msg.id, {
        session_id: sid,
      });
    });

    const remaining = db.executeSync(
      `SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ? AND entity_type = 'chat_message' AND entity_id = ?`,
      [userId, msg.id],
    ).rows[0]?.n;
    expect(Number(remaining ?? 0)).toBe(0);
  });

  it('chatMarkdown handles CRLF wide blocks, nested fences, and complete [Handbook] during streaming', () => {
    expect(hasWideMarkdownBlock('Intro\r\n```ts\r\nconst x = 1;\r\n```')).toBe(
      true,
    );
    expect(
      hasWideMarkdownBlock('| A | B |\r\n| --- | --- |\r\n| 1 | 2 |'),
    ).toBe(true);

    const blocks = parseChatMarkdown('````md\n```js\n1+1\n```\n````');
    expect(blocks).toEqual([
      {kind: 'code', language: 'md', text: '```js\n1+1\n```'},
    ]);

    expect(hideDanglingMarkers('See [Handbook]')).toBe('See [Handbook]');
    expect(hideDanglingMarkers('See [USTP](https://us')).toBe('See USTP');
    expect(hideDanglingMarkers('This is __bold')).toBe('This is bold');
  });

  it('ChatMessageItem handles invalid createdAt without rendering "Invalid Date"', () => {
    const userId = makeStudent('bad-date');
    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatMessageItem
          item={{
            id: 'bad-1',
            sessionId: 's1',
            sender: 'assistant',
            content: 'Hello world',
            createdAt: 'not-a-real-date',
            updatedAt: 'not-a-real-date',
          }}
        />
      </ThemeProvider>,
    );
    expect(ui.getByText('Hello world')).toBeTruthy();
    expect(ui.queryByText(/Invalid Date/i)).toBeNull();
  });

  it('SourceNoteText does not style non-https links as clickable chat-source-link', () => {
    const ui = render(
      <SourceNoteText
        note="Visit [Old HTTP](http://example.com/old)"
        style={{}}
        linkColor="#00f"
      />,
    );
    expect(ui.queryAllByTestId('chat-source-link')).toHaveLength(0);
    expect(ui.getByText(/Old HTTP/)).toBeTruthy();
  });

  it('CommandReviewCard clears stale editError after pressing Back and reopening Edit', () => {
    const userId = makeStudent('review-back-err');
    const ref = new Date(2030, 5, 10, 9, 0, 0);
    const prepared = prepareReviewedCommand(
      userId,
      {
        intent: 'create_task',
        title: 'Essay',
        date: '2030-06-11',
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'add task Essay',
        isValid: true,
      },
      {surface: 'chat', referenceDate: ref},
    );
    if (prepared.status !== 'proposal') throw new Error('Expected proposal');

    const ui = render(
      <ThemeProvider userId={userId}>
        <CommandReviewCard
          proposal={prepared.proposal}
          expired={false}
          busy={false}
          editError="Please enter a title before saving."
          onEdit={() => ({
            status: 'invalid',
            reply: 'Please enter a title before saving.',
          })}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
          onDismiss={jest.fn()}
          testIDPrefix="p1-review"
        />
      </ThemeProvider>,
    );

    fireEvent.press(ui.getByTestId('p1-review-edit'));
    // Opening editor freshly hides stale error until next save attempt
    expect(ui.queryByTestId('p1-review-edit-error')).toBeNull();

    // Trigger invalid save -> error shows
    fireEvent.changeText(ui.getByTestId('p1-review-edit-title'), '   ');
    fireEvent.press(ui.getByTestId('p1-review-edit-save'));
    expect(ui.getByTestId('p1-review-edit-error')).toBeTruthy();

    // Press Back, reopen Edit -> stale error is hidden again
    fireEvent.press(ui.getByTestId('p1-review-edit-cancel'));
    fireEvent.press(ui.getByTestId('p1-review-edit'));
    expect(ui.queryByTestId('p1-review-edit-error')).toBeNull();
  });

  it('editReviewedCommand preserves update_task priority, clears orphan dueTime on date clear, and preserves update_note isPinned', async () => {
    const userId = makeStudent('edit-preserve');
    const ref = new Date(2030, 5, 10, 9, 0, 0);

    tasksStore.insertTask({
      id: 'task-p1',
      userId,
      title: 'Calculus Homework',
      dueDate: '2030-06-11',
      dueTime: '15:00',
      priority: 'High',
      category: 'Academic',
      isCompleted: false,
    });

    const taskPrep = prepareReviewedCommand(
      userId,
      {
        intent: 'update_task',
        title: 'Calculus Homework',
        targetTitle: 'Calculus Homework',
        newTitle: 'Calculus HW 1',
        date: '2030-06-11',
        time: '15:00',
        endTime: null,
        durationMinutes: null,
        priority: 'High',
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'update task Calculus Homework',
        isValid: true,
      },
      {surface: 'chat', referenceDate: ref},
    );
    if (taskPrep.status !== 'proposal') throw new Error('Expected proposal');

    const taskEdited = editReviewedCommand(
      userId,
      taskPrep.proposal.operationId,
      {date: null},
      ref,
    );
    expect(taskEdited.status).toBe('proposal');
    if (taskEdited.status !== 'proposal') throw new Error('Expected proposal');
    expect(taskEdited.proposal.draftFields?.date).toBeNull();
    expect(taskEdited.proposal.draftFields?.time).toBeNull();
    await chatOrchestrator.confirmReview(
      userId,
      taskEdited.proposal.operationId,
    );
    const savedTask = tasksStore
      .getAllTasks(userId)
      .find(t => t.id === 'task-p1');
    expect(savedTask?.priority).toBe('High');
    expect(savedTask?.dueDate ?? null).toBeNull();
    expect(savedTask?.dueTime ?? null).toBeNull();

    // Note isPinned preservation on update_note edit
    notesStore.insert({
      id: 'note-p1',
      userId,
      title: 'Formula Sheet',
      body: 'E = mc^2',
      category: 'Academic',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });
    const notePrep = prepareReviewedCommand(
      userId,
      {
        intent: 'update_note',
        title: 'Formula Sheet',
        targetTitle: 'Formula Sheet',
        newTitle: 'Physics Formula Sheet',
        isPinned: true,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: 'E = mc^2',
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript:
          'pin note Formula Sheet and rename to Physics Formula Sheet',
        isValid: true,
      },
      {surface: 'chat', referenceDate: ref},
    );
    if (notePrep.status !== 'proposal')
      throw new Error('Expected note proposal');
    const noteEdited = editReviewedCommand(
      userId,
      notePrep.proposal.operationId,
      {details: 'E = mc^2 and F = ma'},
      ref,
    );
    expect(noteEdited.status).toBe('proposal');
    if (noteEdited.status !== 'proposal')
      throw new Error('Expected edited note');
    await chatOrchestrator.confirmReview(
      userId,
      noteEdited.proposal.operationId,
    );
    const savedNote = notesStore.getAll(userId).find(n => n.id === 'note-p1');
    expect(savedNote?.isPinned).toBe(true);
    expect(savedNote?.body).toBe('E = mc^2 and F = ma');
  });

  it('saveGeneratedFile sanitizes path traversal filenames', async () => {
    const writeSpy = jest
      .spyOn(RNFS, 'writeFile')
      .mockResolvedValueOnce(undefined);
    jest.spyOn(RNFS, 'exists').mockResolvedValueOnce(true);

    const attachment = await saveGeneratedFile({
      fileName: '../../etc/evil..pdf',
      format: 'pdf',
      mimeType: 'application/pdf',
      contentBase64: 'AAAA',
      sizeBytes: 3,
      title: 'Test',
      summary: 'Test summary',
    });

    expect(attachment.fileName).not.toContain('/');
    expect(attachment.fileName).not.toContain('..');
    expect(writeSpy.mock.calls[0][0]).toContain('/chat_files/');
    expect(writeSpy.mock.calls[0][0]).not.toContain('/etc/');
  });

  it('Quick Chat mock STT native module stays intact', () => {
    expect(NativeModules.LafinaSpeechToText).toBeDefined();
  });
});

describe('Pass 1 Wave 2: fastPathParser, skillIntent, skillHandoff, VoiceModal, handbook, scheduleParser & attachmentCleanup', () => {
  it('fastPathParser preserves meaningful words and avoids currency/page/advice false positives', () => {
    const ref = new Date(2026, 10, 11, 15, 0, 0); // 3:00 PM

    expect(
      normalizeSpeech('please remind me to buy something like milk'),
    ).toContain('like milk');

    const pesos = parseDateAndTime(
      'I need 500-800 pesos for the field trip',
      ref,
    );
    expect(pesos.time).toBeNull();
    expect(pesos.endTime).toBeNull();

    const pages = parseDateAndTime('read pages 100 to 120 tonight', ref);
    expect(pages.endTime).toBeNull();

    const bareRange = parseDateAndTime('score 5 to 7 points', ref);
    expect(bareRange.time).toBeNull();

    const wakeIn30 = parseIntentFastPath('Wake me up in 30 minutes', ref);
    expect(wakeIn30.intent).toBe('create_alarm');
    expect(wakeIn30.time).toBe('15:30');

    const advice = parseIntentFastPath('Give me advice on studying', ref);
    expect(advice.intent).not.toBe('snooze');
    const tips = parseIntentFastPath('Give me tips for calculus', ref);
    expect(tips.intent).not.toBe('snooze');

    const invalidTime = parseDateAndTime('meeting at 24:30', ref);
    expect(invalidTime.time).toBeNull();

    const zeroAm = parseDateAndTime('meeting at 0 am', ref);
    expect(zeroAm.time).toBeNull();

    const feb29NonLeap = parseDateAndTime('deadline on February 29, 2025', ref);
    expect(feb29NonLeap.date).toBe('2025-02-29');
    expect(feb29NonLeap.date).not.toBe('2025-03-01');
    const feb29Rollover = parseDateAndTime(
      'deadline on February 29',
      new Date(2024, 10, 11, 9, 0, 0),
    );
    expect(feb29Rollover.date).toBe('2025-02-29');
    expect(feb29Rollover.date).not.toBe('2025-03-01');

    const tagalogQ = parseIntentFastPath('May quiz ba bukas?', ref);
    expect(tagalogQ.intent).not.toBe('create_task');
    expect(tagalogQ.intent).not.toBe('create_reminder');
  });

  it('skillIntent avoids false hijacks on study chat, future schedules, general GWA/quiz questions, and planner queries', () => {
    expect(detectSkillIntent('I need to study for my midterm')).toBeNull();
    expect(
      detectSkillIntent('Schedule a pomodoro session tomorrow at 3pm'),
    ).toBeNull();
    expect(detectSkillIntent('What is a GWA?')).toBeNull();
    expect(detectSkillIntent('What is my GWA?')).toEqual(
      expect.objectContaining({kind: 'status', topic: 'gwa'}),
    );
    expect(detectSkillIntent('How do I pass my quiz?')).toBeNull();
    expect(detectSkillIntent('Prepare for my report tomorrow')).toBeNull();
    expect(detectSkillIntent('Show my tasks')).toBeNull();
    expect(detectSkillIntent('Show my notes')).toBeNull();

    const userId = makeStudent('skill-empty-mat');
    const prepared = prepareSkillLaunch(
      userId,
      {
        skill: 'flashcards',
        materialId: '   ',
      },
      {online: true},
    );
    expect(prepared?.launch.materialId).toBeUndefined();
  });

  it('VoiceModal stops TTS and retires capture cleanly when hidden externally', async () => {
    const userId = makeStudent('voice-hide');
    const stopSpeakSpy = jest
      .spyOn(ttsService, 'stop')
      .mockResolvedValue(undefined);
    jest.spyOn(sttService, 'cancelListening').mockResolvedValue(true);

    const ui = render(
      <ThemeProvider userId={userId}>
        <VoiceModal visible={true} userId={userId} onClose={jest.fn()} />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('voice-hold-button')).toBeTruthy();

    ui.rerender(
      <ThemeProvider userId={userId}>
        <VoiceModal visible={false} userId={userId} onClose={jest.fn()} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(stopSpeakSpy).toHaveBeenCalled();
    });
  });

  it('handbookSearch & knowledgeCitations preserve May dates, avoid double-linkify, and strip unsafe URLs', () => {
    expect(extractQueryTokens('What happens on May 15?')).toContain('may');
    expect(shouldMergeFollowUpQuery('How about 2nd sem?')).toBe(true);

    const alreadyLinked = 'See [USTP Portal](https://ustp.edu.ph/portal).';
    expect(linkifyUrls(alreadyLinked)).toBe(alreadyLinked);

    const bareUrl = 'Visit https://ustp.edu.ph/calendar.';
    expect(linkifyUrls(bareUrl)).toBe(
      'Visit [https://ustp.edu.ph/calendar](https://ustp.edu.ph/calendar).',
    );

    const unsafeScheme = ['javascript', ':alert(1)'].join('');
    const note = campusSourceNote([
      {
        collection: 'ustp_cdo',
        links: [
          {
            id: 's1',
            title: 'USTP Portal',
            url: unsafeScheme,
          },
          {
            id: 's2',
            title: '[]()',
            url: 'https://www.ustp.edu.ph/empty-label',
          },
          {
            id: 's3',
            title: 'Official Site',
            url: 'https://www.ustp.edu.ph',
          },
        ],
      },
    ]);
    expect(note).not.toContain(unsafeScheme);
    expect(note).not.toContain('empty-label');
    expect(note).toContain('https://www.ustp.edu.ph');
  });

  it('scheduleParser escapes markdown pipes, skips grade ranges, and handles PM/cross-noon inheritance', () => {
    const parsed = scheduleParser.parseScannedSchedule(
      [
        'CS 101 | Data Structures MWF 11:00 AM - 12:30 Room 101',
        'MATH 201 Calculus TTH 1:00 PM - 2:30 Room 202',
        'PHYS 100 Grade Range 85-90',
      ].join('\n'),
    );

    expect(parsed.classes).toHaveLength(2);
    expect(parsed.classes[0].startTime).toBe('11:00');
    expect(parsed.classes[0].endTime).toBe('12:30');
    expect(parsed.classes[1].startTime).toBe('13:00');
    expect(parsed.classes[1].endTime).toBe('14:30');
    expect(parsed.markdownTable).not.toMatch(/CS 101 \| Data/);
  });

  it('attachmentCleanupTarget and removeAttachmentFiles reject unsafe paths and directories', async () => {
    const root = String(RNFS.DocumentDirectoryPath ?? '/documents').replace(
      /\/+$/,
      '',
    );
    expect(attachmentCleanupTarget(`file://${root}/chat_files/ok.pdf`)).toBe(
      `${root}/chat_files/ok.pdf`,
    );
    expect(attachmentCleanupTarget('file:///etc/passwd')).toBeNull();
    expect(
      attachmentCleanupTarget(`file://${root}/chat_files/../secret.txt`),
    ).toBeNull();

    const unlinkSpy = jest.spyOn(RNFS, 'unlink').mockResolvedValue(undefined);
    jest.spyOn(RNFS, 'exists').mockResolvedValue(true);
    jest.spyOn(RNFS, 'stat').mockResolvedValue({
      isFile: () => false,
    } as any);

    await removeAttachmentFiles([
      'file:///etc/passwd',
      `file://${root}/chat_files/some_dir.pdf`,
    ]);
    expect(unlinkSpy).not.toHaveBeenCalled();
  });
});
