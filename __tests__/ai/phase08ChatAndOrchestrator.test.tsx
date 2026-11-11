import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import {
  chatOrchestrator,
  timeToMinutes,
  minutesToTime,
  format12HourTime,
} from '../../src/ai/chatOrchestrator';
import { chatStore } from '../../src/storage/chatStore';
import { tasksStore } from '../../src/storage/tasksStore';
import { timeBlocksStore } from '../../src/storage/timeBlocksStore';
import { notesStore } from '../../src/storage/notesStore';
import { userStore } from '../../src/storage/userStore';
import { initDatabase } from '../../src/storage/dbInit';
import { ttsService } from '../../src/ai/tts/ttsService';
import { ChatScreen } from '../../src/ui/screens/ChatScreen';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';

/**
 * AGY-PORT 04 (PF05 intentional change): assistant-proposed planner changes now
 * return a review and write nothing until Confirm. These helpers keep the
 * original end-to-end expectations while going through prepare + confirm.
 */
const confirmProposal = async (
  userId: string,
  result: Awaited<ReturnType<typeof chatOrchestrator.processMessage>>,
) => {
  expect(result.review?.status).toBe('proposal');
  if (result.review?.status !== 'proposal') throw new Error('expected a proposal');
  const decision = await chatOrchestrator.confirmReview(
    userId,
    result.review.proposal.operationId,
  );
  expect(decision.outcome?.status).toBe('applied');
  return decision;
};

describe('Phase 08: End-to-End Offline Student Assistant & ChatScreen Integration', () => {
  const testUserId = 'test-student-phase08';
  const fixedDate = new Date(2026, 9, 30, 8, 30, 0); // Friday, Oct 30, 2026 08:30

  beforeAll(() => {
    initDatabase();
    userStore.createGuestUser();
  });

  beforeEach(() => {
    chatStore.clearHistory(testUserId);
    jest.clearAllMocks();
  });

  describe('1. Time & Slot Helper Arithmetic', () => {
    test('converts HH:mm to minutes from midnight and back correctly', () => {
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('09:30')).toBe(9 * 60 + 30);
      expect(timeToMinutes('14:45')).toBe(14 * 60 + 45);
      expect(timeToMinutes('23:59')).toBe(23 * 60 + 59);

      expect(minutesToTime(0)).toBe('00:00');
      expect(minutesToTime(570)).toBe('09:30');
      expect(minutesToTime(885)).toBe('14:45');
    });

    test('formats times into natural 12-hour AM/PM representations', () => {
      expect(format12HourTime('09:00')).toBe('9:00 AM');
      expect(format12HourTime('12:00')).toBe('12:00 PM');
      expect(format12HourTime('13:30')).toBe('1:30 PM');
      expect(format12HourTime('00:00')).toBe('12:00 AM');
    });
  });

  describe('2. ChatOrchestrator Assistant Loop & Conflict Detection', () => {
    test('processes conversational greeting and stores in chat history', async () => {
      const result = await chatOrchestrator.processMessage(
        testUserId,
        'Hello LAFINA!',
        { referenceDate: fixedDate },
      );

      expect(result.intent.intent).toBe('chat');
      // A natural greeting now, not the old fixed self-introduction.
      expect(result.reply.trim().length).toBeGreaterThan(0);
      expect(result.reply).not.toMatch(/your offline academic assistant/i);
      expect(result.assistantMessage.localReply).toBe(true);
      expect(result.userMessage.content).toBe('Hello LAFINA!');
      expect(result.assistantMessage.content).toBe(result.reply);

      const history = chatStore.getMessages(testUserId);
      expect(history.length).toBe(2);
      expect(history[0].sender).toBe('user');
      expect(history[1].sender).toBe('assistant');
    });

    test('handles identity questions like "What are you" without saving as a note', async () => {
      const initialNotes = notesStore.getAll(testUserId);
      const initialNoteCount = initialNotes.length;

      const result = await chatOrchestrator.processMessage(
        testUserId,
        'What are you',
        { referenceDate: fixedDate },
      );

      expect(result.intent.intent).toBe('chat');
      expect(result.reply).toMatch(/lafina/i);
      expect(result.reply).not.toMatch(/your offline academic assistant/i);
      expect(result.userMessage.content).toBe('What are you');

      // Crucial: No note should be created!
      const currentNotes = notesStore.getAll(testUserId);
      expect(currentNotes.length).toBe(initialNoteCount);
    });

    test('only saves as a note when user explicitly asks to note or save as a note', async () => {
      const initialNotes = notesStore.getAll(testUserId);
      const initialNoteCount = initialNotes.length;

      const result = await chatOrchestrator.processMessage(
        testUserId,
        'Save this as a note that Chemistry midterms coverage chapters 1-4',
        { referenceDate: fixedDate },
      );

      expect(result.intent.intent).toBe('create_note');
      // Nothing is saved before Confirm.
      expect(notesStore.getAll(testUserId).length).toBe(initialNoteCount);
      const decision = await confirmProposal(testUserId, result);
      expect(decision.reply).toContain('Saved note');

      const updatedNotes = notesStore.getAll(testUserId);
      expect(updatedNotes.length).toBe(initialNoteCount + 1);
      expect(
        updatedNotes.some(
          (n) => n.title.includes('Chemistry midterms') || n.body.includes('Chemistry midterms'),
        ),
      ).toBe(true);
    });

    test('processes task creation and saves both to tasksStore and chatStore', async () => {
      const result = await chatOrchestrator.processMessage(
        testUserId,
        'Add task to submit physics lab report',
        { referenceDate: fixedDate },
      );

      expect(result.intent.intent).toBe('create_task');
      expect(
        tasksStore.getAllTasks(testUserId).some((t) => t.title.toLowerCase().includes('physics lab')),
      ).toBe(false);
      expect(chatStore.getMessages(testUserId).length).toBe(2);
      await confirmProposal(testUserId, result);

      const tasks = tasksStore.getAllTasks(testUserId);
      const created = tasks.find((t) => t.title.toLowerCase().includes('physics lab'));
      expect(created).toBeDefined();

      // User message, the review summary, and the confirmed outcome.
      const messages = chatStore.getMessages(testUserId);
      expect(messages.length).toBe(3);
    });

    test('detects schedule conflicts and recommends available daytime slots', async () => {
      // 1. Create existing block on 2026-10-31 from 10:00 to 12:00
      timeBlocksStore.insert({
        id: 'tb-phase08-existing',
        userId: testUserId,
        title: 'Compiler Design Lecture',
        date: '2026-10-31',
        startTime: '10:00',
        endTime: '12:00',
        color: '#4F46E5',
        category: 'Academic',
      });

      // 2. Try to schedule an overlapping block from 11:00 to 13:00
      const conflictCheck = chatOrchestrator.checkScheduleConflict(
        testUserId,
        '2026-10-31',
        '11:00',
        '13:00',
      );
      expect(conflictCheck.hasConflict).toBe(true);
      expect(conflictCheck.conflictingTitle).toBe('Compiler Design Lecture');

      // 3. Process conflicting scheduling request through orchestrator
      const result = await chatOrchestrator.processMessage(
        testUserId,
        'Add study block for Algorithms from 11am to 1pm on 2026-10-31',
        { referenceDate: fixedDate },
      );

      expect(result.conflict?.hasConflict).toBe(true);
      expect(result.recommendedSlot).toBeDefined();
      expect(result.reply).toContain('Compiler Design Lecture');
      expect(result.reply).toContain('Would you like me to schedule it then?');

      // 4. Test force scheduling ignores conflict when specified
      const forceResult = await chatOrchestrator.processMessage(
        testUserId,
        'Add study block for Algorithms from 11am to 1pm on 2026-10-31',
        { referenceDate: fixedDate, forceSchedule: true },
      );
      const forced = await confirmProposal(testUserId, forceResult);
      expect(forced.outcome?.status === 'applied' && forced.outcome.receipt.entityType).toBe(
        'time_block',
      );
    });

    test('executes schedule queries and speaks reply when speakReply is true', async () => {
      const speakSpy = jest.spyOn(ttsService, 'speak');

      const result = await chatOrchestrator.processMessage(
        testUserId,
        "What's on my schedule today?",
        { referenceDate: fixedDate, speakReply: true },
      );

      expect(result.intent.intent).toBe('query_schedule');
      expect(result.reply).toContain('Today');
      expect(speakSpy).toHaveBeenCalledWith(result.reply);

      speakSpy.mockRestore();
    });

    test('executes cancel/delete and update commands for tasks, events, and time blocks via chatOrchestrator', async () => {
      const cancelChatUser = 'test-student-phase08-cancel';

      // 1. Schedule a coffee date via conversational prompt
      const schedRes = await chatOrchestrator.processMessage(
        cancelChatUser,
        "So let's schedule at 2 PM for a coffee date.",
        { referenceDate: fixedDate },
      );
      expect(tasksStore.getAllTasks(cancelChatUser)).toHaveLength(0);
      const scheduled = await confirmProposal(cancelChatUser, schedRes);
      expect(scheduled.reply).toContain('"Coffee Date"');
      expect(scheduled.reply).toContain('at 2:00 PM');
      expect(scheduled.reply).not.toContain('14:00');
      const createdTasks = tasksStore.getAllTasks(cancelChatUser);
      expect(createdTasks).toHaveLength(1);
      expect(createdTasks[0].dueTime).toBe('14:00');

      // 2. Cancel the coffee date by time through ChatOrchestrator
      const cancelTaskRes = await chatOrchestrator.processMessage(
        cancelChatUser,
        'Cancel my 2 PM task',
        { referenceDate: fixedDate },
      );
      expect(tasksStore.getAllTasks(cancelChatUser)).toHaveLength(1);
      const cancelled = await confirmProposal(cancelChatUser, cancelTaskRes);
      expect(cancelled.reply).toContain('Removed task: "Coffee Date"');
      expect(tasksStore.getAllTasks(cancelChatUser)).toHaveLength(0);

      // 3. Insert an event and delete it by name through ChatOrchestrator
      tasksStore.insertEvent({
        id: 'ev-phase08-cancel',
        userId: cancelChatUser,
        title: 'Faculty Consultation',
        date: '2026-10-30',
        startTime: '15:00',
        endTime: '16:00',
      });
      const deleteEventRes = await chatOrchestrator.processMessage(
        cancelChatUser,
        'Delete my Faculty Consultation event',
        { referenceDate: fixedDate },
      );
      const deletedEvent = await confirmProposal(cancelChatUser, deleteEventRes);
      expect(
        deletedEvent.outcome?.status === 'applied' && deletedEvent.outcome.receipt.entityType,
      ).toBe('event');
      expect(tasksStore.getAllEvents(cancelChatUser)).toHaveLength(0);
    });
  });

  describe('3. ChatScreen Component & User Interactions', () => {
    test('renders empty state initially with greeting and suggestions', () => {
      const { getByTestId, getByText } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} />
        </ThemeProvider>,
      );

      expect(getByTestId('chat-empty-state')).toBeTruthy();
      expect(getByText('LAFINA Academic Assistant')).toBeTruthy();
      expect(getByTestId('chat-prompt-chip-0')).toBeTruthy();
    });

    test('sends message via text input and displays user and assistant bubbles', async () => {
      const onRefresh = jest.fn();

      const { getByTestId, findByText, findAllByText } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} onRefresh={onRefresh} />
        </ThemeProvider>,
      );

      const input = getByTestId('chat-text-input');
      fireEvent.changeText(input, 'Take a note: Thesis ideas on offline secretarial assistants');
      const sendBtn = getByTestId('chat-send-button');
      fireEvent.press(sendBtn);

      const matches = await findAllByText('Take a note: Thesis ideas on offline secretarial assistants');
      expect(matches.length).toBeGreaterThanOrEqual(1);
      await waitFor(() => {
        expect(chatStore.getMessages(testUserId).length).toBe(2);
      });
      expect(await findByText(/Please review|Saved note/i)).toBeTruthy();
      expect(onRefresh).toHaveBeenCalled();
    });

    test('sends prompt suggestion when a prompt chip is pressed', async () => {
      const { getByTestId, findByText } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} />
        </ThemeProvider>,
      );

      const chip = getByTestId('chat-prompt-chip-0');
      fireEvent.press(chip);

      expect(await findByText("What's on my schedule today?")).toBeTruthy();
      await waitFor(() => {
        expect(chatStore.getMessages(testUserId).length).toBe(2);
      });
    });

    test('clears conversation history when session is deleted from history', async () => {
      chatStore.addMessage(testUserId, 'user', 'Previous message');
      chatStore.addMessage(testUserId, 'assistant', 'Previous reply');

      jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => {
        const deleteBtn = buttons?.find((b) => b.text === 'Delete');
        deleteBtn?.onPress?.();
      });

      const { getByTestId, findByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} />
        </ThemeProvider>,
      );

      fireEvent.press(getByTestId('chat-history-button'));
      const sessionId = chatStore.currentSessionId(testUserId);
      fireEvent.press(getByTestId(`chat-history-delete-${sessionId}`));

      await waitFor(() => {
        expect(chatStore.getMessages(testUserId).length).toBe(0);
      });
      expect(await findByTestId('chat-empty-state')).toBeTruthy();
    });

    test('does not render speaker button on assistant message (clean ChatGPT style)', async () => {
      const msg = chatStore.addMessage(testUserId, 'assistant', 'Your schedule is clear!');

      const { queryByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} />
        </ThemeProvider>,
      );

      expect(queryByTestId(`chat-speak-btn-${msg.id}`)).toBeNull();
    });

    test('reserves bottom padding for CustomTabBar and updates padding on keyboard focus', async () => {
      const { getByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} />
        </ThemeProvider>,
      );

      const container = getByTestId('chat-screen-container');
      const input = getByTestId('chat-text-input');

      // Before focus: bottomNavReserve should be at least tabBarClearance (> 64)
      const initialStyle = StyleSheet.flatten(container.props.style);
      expect(initialStyle.paddingBottom).toBeGreaterThanOrEqual(64);

      // On focus: triggers keyboard visibility mode
      act(() => {
        fireEvent(input, 'focus');
      });

      const focusedStyle = StyleSheet.flatten(container.props.style);
      expect(focusedStyle.paddingBottom).toBeDefined();
    });
  });
});
