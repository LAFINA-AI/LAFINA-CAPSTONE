import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import {
  chatOrchestrator,
  timeToMinutes,
  minutesToTime,
  format12HourTime,
} from '../../src/ai/chatOrchestrator';
import { chatStore } from '../../src/storage/chatStore';
import { tasksStore } from '../../src/storage/tasksStore';
import { timeBlocksStore } from '../../src/storage/timeBlocksStore';
import { userStore } from '../../src/storage/userStore';
import { initDatabase } from '../../src/storage/dbInit';
import { ttsService } from '../../src/ai/tts/ttsService';
import { ChatScreen } from '../../src/ui/screens/ChatScreen';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';

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
      expect(result.reply).toContain('LAFINA');
      expect(result.userMessage.content).toBe('Hello LAFINA!');
      expect(result.assistantMessage.content).toBe(result.reply);

      const history = chatStore.getMessages(testUserId);
      expect(history.length).toBe(2);
      expect(history[0].sender).toBe('user');
      expect(history[1].sender).toBe('assistant');
    });

    test('processes task creation and saves both to tasksStore and chatStore', async () => {
      const result = await chatOrchestrator.processMessage(
        testUserId,
        'Add task to submit physics lab report',
        { referenceDate: fixedDate },
      );

      expect(result.intent.intent).toBe('create_task');
      expect(result.actionResult?.success).toBe(true);

      const tasks = tasksStore.getAllTasks(testUserId);
      const created = tasks.find((t) => t.title.toLowerCase().includes('physics lab'));
      expect(created).toBeDefined();

      const messages = chatStore.getMessages(testUserId);
      expect(messages.length).toBe(2);
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
      expect(forceResult.actionResult?.success).toBe(true);
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

      const { getByTestId, findByText } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} onRefresh={onRefresh} />
        </ThemeProvider>,
      );

      const input = getByTestId('chat-text-input');
      const sendBtn = getByTestId('chat-send-button');

      fireEvent.changeText(input, 'Take a note: Thesis ideas on offline secretarial assistants');
      fireEvent.press(sendBtn);

      expect(await findByText('Take a note: Thesis ideas on offline secretarial assistants')).toBeTruthy();
      await waitFor(() => {
        expect(chatStore.getMessages(testUserId).length).toBe(2);
      });
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

    test('clears conversation history when clear button is confirmed', async () => {
      chatStore.addMessage(testUserId, 'user', 'Previous message');
      chatStore.addMessage(testUserId, 'assistant', 'Previous reply');

      jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => {
        const clearBtn = buttons?.find((b) => b.text === 'Clear');
        clearBtn?.onPress?.();
      });

      const { getByTestId, findByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} />
        </ThemeProvider>,
      );

      const clearBtn = getByTestId('chat-clear-history-button');
      fireEvent.press(clearBtn);

      await waitFor(() => {
        expect(chatStore.getMessages(testUserId).length).toBe(0);
      });
      expect(await findByTestId('chat-empty-state')).toBeTruthy();
    });

    test('speaks message aloud when speaker button is pressed on assistant message', async () => {
      const speakSpy = jest.spyOn(ttsService, 'speak');
      const msg = chatStore.addMessage(testUserId, 'assistant', 'Your schedule is clear!');

      const { getByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <ChatScreen userId={testUserId} />
        </ThemeProvider>,
      );

      const speakBtn = getByTestId(`chat-speak-btn-${msg.id}`);
      await act(async () => {
        fireEvent.press(speakBtn);
      });

      expect(speakSpy).toHaveBeenCalledWith('Your schedule is clear!');
      speakSpy.mockRestore();
    });
  });
});
