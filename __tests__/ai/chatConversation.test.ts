/**
 * Human small talk: Online Mode always asks DeepSeek (greetings included);
 * offline replies are varied, name/time/schedule-aware and never repeat the
 * previous line. On-device replies are tagged and never sent to DeepSeek.
 */
import {db, initDatabase, userStore, chatStore} from '../../src/storage';
import {
  chatOrchestrator,
  describeOnlineChatFailure,
} from '../../src/ai/chatOrchestrator';
import {
  buildLocalConversationReply,
  classifySmallTalk,
  OFFLINE_REPLY_NOTE,
} from '../../src/ai/localConversation';
import {cloudClient} from '../../src/cloud/cloudClient';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {GUEST_USER_ID} from '../../src/constants';

let serial = 0;
const student = (username: string): string => {
  serial += 1;
  const id = `conv-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, username, `${id}@example.invalid`, now, now],
  );
  return id;
};

const emptyDay = {tasks: [], events: [], blocks: []};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  userStore.createGuestUser();
  chatStore.clearHistory(GUEST_USER_ID);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('classifySmallTalk', () => {
  it.each([
    ['hi', 'greeting'],
    ['Hello!', 'greeting'],
    ['hey lafina', 'greeting'],
    ['good morning', 'greeting'],
    ['kumusta', 'how_are_you'],
    ['how are you?', 'how_are_you'],
    ['what are you?', 'identity'],
    ['who are you', 'identity'],
    ['are you a bot?', 'identity'],
    ['who made you', 'creator'],
    ['what can you do?', 'capabilities'],
    ['thanks!', 'thanks'],
    ['thank you so much', 'thanks'],
    ['salamat', 'thanks'],
    ['bye', 'farewell'],
    ['good night', 'farewell'],
    ['ok', 'acknowledgement'],
    ['got it.', 'acknowledgement'],
  ])('%s -> %s', (text, kind) => {
    expect(classifySmallTalk(text)).toBe(kind);
  });

  it.each([
    'explain photosynthesis',
    'hi can you explain the difference between mitosis and meiosis in detail please',
    'ok so what is the derivative of x squared',
    '',
  ])('treats "%s" as a real message, not small talk', text => {
    expect(classifySmallTalk(text)).toBeNull();
  });
});

describe('buildLocalConversationReply', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 7, h, m);

  it('greets by first name and time of day, with what is left today', () => {
    const userId = student('maria santos');
    jest.spyOn(plannerQueries, 'window').mockReturnValue({
      tasks: [],
      events: [
        {title: 'Physics lecture', date: '2026-11-07', startTime: '15:00'},
        {title: 'Earlier class', date: '2026-11-07', startTime: '08:00'},
      ],
      blocks: [
        {title: 'Thesis writing', date: '2026-11-07', startTime: '19:30'},
      ],
    } as never);
    const reply = buildLocalConversationReply(userId, 'hi', {
      now: at(9),
      random: () => 0,
    });
    expect(reply).toMatch(/^Good morning, Maria!/);
    expect(reply).toContain(
      'You have 2 things left today, starting with "Physics lecture" at 3:00 PM.',
    );
    expect(reply).not.toContain('Earlier class');
  });

  it('uses singular wording and 12-hour time like the rest of the app', () => {
    const userId = student('jo');
    jest.spyOn(plannerQueries, 'window').mockReturnValue({
      ...emptyDay,
      tasks: [
        {
          title: 'Submit lab',
          dueDate: '2026-11-07',
          dueTime: '17:00',
          isCompleted: false,
        },
      ],
    } as never);
    const reply = buildLocalConversationReply(userId, 'hello', {
      now: at(13),
      random: () => 0,
    });
    expect(reply).toContain(
      'You have one thing left today: "Submit lab" at 5:00 PM.',
    );
  });

  it('never repeats the opener it just used, and greets guests without a name', () => {
    jest.spyOn(plannerQueries, 'window').mockReturnValue(emptyDay as never);
    const first = buildLocalConversationReply(GUEST_USER_ID, 'hi', {
      now: at(10),
      random: () => 0,
    });
    const second = buildLocalConversationReply(GUEST_USER_ID, 'hi', {
      now: at(10),
      random: () => 0,
      recentReplies: [first],
    });
    expect(first).not.toEqual(second);
    expect(first.split('!')[0]).not.toEqual(second.split('!')[0]);
    expect(first).not.toMatch(/Guest/);
  });

  it('answers "how are you" as a person, not with an identity line', () => {
    const reply = buildLocalConversationReply(student('ana'), 'how are you?', {
      now: at(10),
    });
    expect(reply).not.toMatch(/I am lafina|academic secretary/i);
    expect(reply).toMatch(/\?$/);
  });

  it('still works when the schedule cannot be read', () => {
    jest.spyOn(plannerQueries, 'window').mockImplementation(() => {
      throw new Error('db busy');
    });
    expect(
      buildLocalConversationReply(GUEST_USER_ID, 'hi', {now: at(10)}),
    ).toMatch(/!/);
  });
});

describe('Chat routing', () => {
  it('offline: greetings are varied, tagged local, and never the old canned line', async () => {
    jest.spyOn(cloudClient, 'request');
    const replies: string[] = [];
    for (const text of ['hi', 'hi', 'hello', 'what are you?', 'how are you?']) {
      const result = await chatOrchestrator.processMessage(
        GUEST_USER_ID,
        text,
        {onlineMode: false},
      );
      expect(result.usedOnline).toBe(false);
      expect(result.assistantMessage.localReply).toBe(true);
      expect(result.reply).not.toMatch(/your offline academic assistant/i);
      replies.push(result.reply);
    }
    expect(replies[0]).not.toEqual(replies[1]);
    expect(cloudClient.request).not.toHaveBeenCalled();
    // The tag survives a reload from SQLite.
    const stored = chatStore.getRecentMessages(GUEST_USER_ID, 2);
    expect(stored.find(m => m.sender === 'assistant')?.localReply).toBe(true);
  });

  it('online: "hi" goes to DeepSeek, and on-device replies are left out of its history', async () => {
    await chatOrchestrator.processMessage(GUEST_USER_ID, 'hello', {
      onlineMode: false,
    });
    chatStore.addMessage(
      GUEST_USER_ID,
      'assistant',
      'I am lafina, your offline academic assistant. Old line.',
    );
    const request = jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {
        provider: 'deepseek',
        reply: 'Hey! Good to see you again. What are we tackling today?',
        usedHandbook: false,
        sources: [],
      },
    } as never);
    const result = await chatOrchestrator.processMessage(GUEST_USER_ID, 'hi', {
      onlineMode: true,
    });
    expect(result.usedOnline).toBe(true);
    expect(result.reply).toBe(
      'Hey! Good to see you again. What are we tackling today?',
    );
    expect(result.assistantMessage.localReply).toBe(false);
    const body = JSON.parse(
      String((request.mock.calls[0][1] as RequestInit).body),
    );
    const sent: Array<{role: string; content: string}> = body.messages;
    expect(sent.filter(m => m.role === 'assistant')).toEqual([]);
    expect(sent[sent.length - 1]).toEqual({role: 'user', content: 'hi'});
  });

  it('online failure: small talk stays friendly but labelled; real questions say DeepSeek did not reply', async () => {
    jest
      .spyOn(cloudClient, 'request')
      .mockResolvedValue({
        status: 'server_unavailable',
        error: 'down',
      } as never);
    const hi = await chatOrchestrator.processMessage(GUEST_USER_ID, 'hi', {
      onlineMode: true,
    });
    expect(hi.usedOnline).toBe(false);
    expect(hi.reply.endsWith(OFFLINE_REPLY_NOTE)).toBe(true);
    expect(hi.assistantMessage.localReply).toBe(true);
    const question = await chatOrchestrator.processMessage(
      GUEST_USER_ID,
      'explain photosynthesis',
      {
        onlineMode: true,
        useHandbook: false,
      },
    );
    expect(question.reply).toBe(
      describeOnlineChatFailure('server_unavailable'),
    );
  });

  it('"thanks" and "ok" outside a reminder call are conversation, not a refused acknowledgement', async () => {
    const thanks = await chatOrchestrator.processMessage(
      GUEST_USER_ID,
      'thanks',
      {onlineMode: false},
    );
    expect(thanks.reply).not.toMatch(
      /no active reminders|Nothing was changed/i,
    );
    expect(thanks.assistantMessage.localReply).toBe(true);
    const ok = await chatOrchestrator.processMessage(GUEST_USER_ID, 'ok', {
      onlineMode: false,
    });
    expect(ok.reply).not.toMatch(/no active reminders|Nothing was changed/i);

    const request = jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {reply: 'Anytime!', usedHandbook: false, sources: []},
    } as never);
    const online = await chatOrchestrator.processMessage(
      GUEST_USER_ID,
      'thanks',
      {onlineMode: true},
    );
    expect(online.reply).toBe('Anytime!');
    expect(request).toHaveBeenCalledWith(
      '/v1/ai/chat',
      expect.anything(),
      true,
    );
  });

  it('offline handbook questions still point to Online Mode', async () => {
    const result = await chatOrchestrator.processMessage(
      GUEST_USER_ID,
      'What is the USTP dress code?',
      {
        onlineMode: false,
      },
    );
    expect(result.reply).toContain(
      'Official USTP Student Handbook guidelines require Online Mode',
    );
  });
});
