import React from 'react';
import {StyleSheet} from 'react-native';
import {render} from '@testing-library/react-native';
import {
  alarmsStore,
  initDatabase,
  saveUIVariant,
  tasksStore,
  timeBlocksStore,
  userStore,
  type ChatMessage,
} from '../../src/storage';
import {
  answerPlannerLookup,
  executeNluAction,
} from '../../src/ai/nlu/actionExecutor';
import {describeAlarmsReply} from '../../src/ai/nlu/alarmReview';
import type {ValidatedIntent} from '../../src/ai/nlu/types';
import {ttsService} from '../../src/ai/tts/ttsService';
import {ChatMessageItem} from '../../src/ui/components/chat/ChatMessageItem';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {chatMarkdownToPlainText} from '../../src/utils/chatMarkdown';

const REF_DATE = new Date(2026, 10, 16, 10, 0, 0); // Mon Nov 16 2026 10:00
const TODAY = '2026-11-16';
const YESTERDAY = '2026-11-15';

let userCounter = 0;
const nextOwner = (prefix: string): string => {
  userCounter += 1;
  return `${prefix}-${userCounter}`;
};

const makeLookupIntent = (
  details: ValidatedIntent['details'],
  date: string | null = TODAY,
): ValidatedIntent => ({
  intent: 'query_schedule',
  title: null,
  date,
  time: null,
  endTime: null,
  durationMinutes: null,
  category: 'Academic',
  details,
  snoozeMinutes: null,
  confidence: 1,
  source: 'fast_path',
  rawTranscript: `lookup ${details ?? 'day'}`,
  isValid: true,
});

describe('Offline Chat Response Design & Performance', () => {
  beforeAll(async () => {
    await initDatabase();
    userStore.createGuestUser();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('formats multi-alarm replies with next-alarm callout and All Alarms bullets while stripping Markdown for plain speech', () => {
    const userId = nextOwner('offline-alarms');
    alarmsStore.create(userId, {
      hour: 6,
      minute: 30,
      label: 'Morning Quiz Prep',
    });
    alarmsStore.create(userId, {
      hour: 14,
      minute: 0,
      label: 'Defense Check-in',
    });

    const reply = describeAlarmsReply(userId, REF_DATE);
    expect(reply).toContain('> **Next alarm:**');
    expect(reply).toContain('### All Alarms (2)');
    expect(reply).toContain('• **6:30 AM** *(Once, Morning Quiz Prep)*');
    expect(reply).toContain('• **2:00 PM** *(Once, Defense Check-in)*');

    const plain = chatMarkdownToPlainText(reply);
    expect(plain).not.toContain('###');
    expect(plain).not.toContain('**');
    expect(plain).not.toMatch(/^>/m);
    expect(plain).toContain('All Alarms (2)');
  });

  it('formats mixed daily schedules with Timed & All-Day sections while speaking plain prose to TTS', async () => {
    const userId = nextOwner('offline-daily');
    timeBlocksStore.insert({
      id: `${userId}-tb1`,
      userId,
      title: 'IT413 · Social and Professional Issues',
      date: TODAY,
      startTime: '15:00',
      endTime: '16:30',
      category: 'Academic',
      color: '#6366F1',
    });
    tasksStore.insertTask({
      id: `${userId}-t1`,
      userId,
      title: 'Finish Capstone UI/UX',
      dueDate: TODAY,
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
    });

    const speakSpy = jest.spyOn(ttsService, 'speak').mockResolvedValue();

    const startMs = Date.now();
    const res = await executeNluAction(userId, makeLookupIntent(null, TODAY), {
      referenceDate: REF_DATE,
      speakResult: true,
    });
    const elapsedMs = Date.now() - startMs;

    expect(res.success).toBe(true);
    expect(elapsedMs).toBeLessThan(150);
    expect(res.reply).toContain('### Timed');
    expect(res.reply).toContain(
      '• **3:00 PM – 4:30 PM** — IT413 · Social and Professional Issues *(Block)*',
    );
    expect(res.reply).toContain('### All-Day Tasks');
    expect(res.reply).toContain('• **Finish Capstone UI/UX**');

    expect(speakSpy).toHaveBeenCalledTimes(1);
    const spoken = speakSpy.mock.calls[0][0];
    expect(spoken).not.toContain('###');
    expect(spoken).not.toContain('**');
    expect(spoken).not.toContain('•');
    expect(spoken).toContain('IT413');
  });

  it('formats planner lookup shortcuts (next_item, free_slots, overdue) cleanly in structured Markdown', () => {
    const userId = nextOwner('offline-lookups');
    timeBlocksStore.insert({
      id: `${userId}-tb-next`,
      userId,
      title: 'Algorithms Studio',
      date: TODAY,
      startTime: '13:00',
      endTime: '15:00',
      category: 'Academic',
      color: '#6366F1',
    });
    tasksStore.insertTask({
      id: `${userId}-t-overdue`,
      userId,
      title: 'Submit Lab Reflection',
      dueDate: YESTERDAY,
      dueTime: '17:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
    });

    const nextReply = answerPlannerLookup(
      userId,
      makeLookupIntent('next_item', TODAY),
      REF_DATE,
    );
    expect(nextReply).toContain('> **Next up:** **Algorithms Studio**');

    const freeReply = answerPlannerLookup(
      userId,
      makeLookupIntent('free_slots', TODAY),
      REF_DATE,
    );
    expect(freeReply).toContain('• **10:30 AM – 1:00 PM**');
    expect(freeReply).toContain('• **3:00 PM – 10:00 PM**');
    expect(freeReply).toContain('> Say');

    const overdueReply = answerPlannerLookup(
      userId,
      makeLookupIntent('overdue', TODAY),
      REF_DATE,
    );
    expect(overdueReply).toContain('You have **1 overdue task**:');
    expect(overdueReply).toContain(
      '• **Submit Lab Reflection** — *due yesterday at 5:00 PM*',
    );
  });

  it('renders Modern assistant bubble, callout quote, heading, bold text, and citation pill cleanly', () => {
    const userId = nextOwner('offline-ui');
    const message: ChatMessage = {
      id: 'msg-modern-1',
      sessionId: 'sess-1',
      sender: 'assistant',
      content: [
        'Today you have **1 time block** scheduled:',
        '',
        '### Timed',
        '• **3:00 PM – 4:30 PM** — IT413 Seminar *(Block)*',
        '',
        '> Tip: Say "add a reminder" before class.',
      ].join('\n'),
      handbookNote: 'USTP Student Handbook · p. 42',
      localReply: true,
      createdAt: '2026-11-16T02:41:00.000Z',
      updatedAt: '2026-11-16T02:41:00.000Z',
    };

    const {getByTestId, getByText, queryByText} = render(
      <ThemeProvider userId={userId}>
        <ChatMessageItem
          item={message}
          handbookNote={message.handbookNote ?? undefined}
        />
      </ThemeProvider>,
    );

    const bubbleStyle = StyleSheet.flatten(
      getByTestId('chat-bubble-msg-modern-1').props.style,
    );
    expect(bubbleStyle.maxWidth).toBe('82%');
    expect(bubbleStyle.borderBottomLeftRadius).toBe(6);

    expect(getByText('Timed')).toBeTruthy();
    expect(getByText('3:00 PM – 4:30 PM')).toBeTruthy();
    expect(getByText(/Tip: Say/)).toBeTruthy();
    expect(getByTestId('chat-handbook-citation')).toBeTruthy();
    expect(getByText('USTP Student Handbook · p. 42')).toBeTruthy();
    expect(queryByText('### Timed')).toBeNull();
  });

  it('preserves Classic bubble styling, plain-text replyFormat, and bold heading inheritance', () => {
    const classicUser = nextOwner('offline-classic');
    saveUIVariant(classicUser, 'classic');

    const message: ChatMessage = {
      id: 'msg-classic-1',
      sessionId: 'sess-2',
      sender: 'assistant',
      content: [
        '### **Bold Heading**',
        '• **9:00 AM** — Quiz *(Task)*',
        '',
        '> Note: Bring ID.',
      ].join('\n'),
      handbookNote: 'USTP Student Handbook · p. 12',
      localReply: true,
      createdAt: '2026-11-16T02:41:00.000Z',
      updatedAt: '2026-11-16T02:41:00.000Z',
    };

    const classicView = render(
      <ThemeProvider userId={classicUser}>
        <ChatMessageItem
          item={message}
          handbookNote={message.handbookNote ?? undefined}
        />
      </ThemeProvider>,
    );
    const classicBubble = StyleSheet.flatten(
      classicView.getByTestId('chat-bubble-msg-classic-1').props.style,
    );
    expect(classicBubble.borderBottomLeftRadius).toBe(3);

    const boldInHeadingStyle = StyleSheet.flatten(
      classicView.getByText('Bold Heading').props.style,
    );
    expect(boldInHeadingStyle.fontWeight).toBe('700');
    expect(boldInHeadingStyle.color).toBeUndefined();

    const plainUser = nextOwner('offline-plain');
    const plainView = render(
      <ThemeProvider userId={plainUser}>
        <ChatMessageItem item={message} replyFormat="plain" />
      </ThemeProvider>,
    );
    const plainText = String(
      plainView.getByTestId('chat-message-content').props.children,
    );
    expect(plainText).not.toContain('###');
    expect(plainText).not.toContain('**');
    expect(plainText).toContain('Bold Heading');
  });
});
