jest.unmock('../../src/cloud/chatMemoryService');
import {
  chatMemoryStore,
  db,
  initDatabase,
  notesStore,
  preferencesStore,
  tasksStore,
} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  explicitMemory,
  extractEmbeddedMemory,
  extractExplicitMemory,
} from '../../src/ai/explicitMemory';
import {
  inferStudyPeaksFromText,
  studyPreference,
} from '../../src/ai/studyPreference';
import {
  extractForgetSpecificMemoryQuery,
  isMemoryRecallQuery,
} from '../../src/ai/chatMemoryCommands';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {shouldUseOnlineIntentExtraction} from '../../src/ai/onlineIntentExtractor';
import {
  endReviewSession,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {validateIntent} from '../../src/ai/nlu/types';
import {buildMorningBriefing} from '../../src/ai/briefing/morningBriefing';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {runChatAgent} from '../../src/ai/chatAgent';

let seq = 0;
const makeUser = (prefix = 'mem-improve'): string => {
  seq += 1;
  const id = `${prefix}-${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  endReviewSession();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Natural study preference, chronotype, and personal fact capture', () => {
  it('captures "im an night owl, i prefer studying at night till 1am" as a study preference memory, never a note or task', async () => {
    const userId = makeUser('night-owl');
    const utterance = 'im an night owl, i prefer studying at night till 1am';

    expect(studyPreference(utterance)).toBe(
      'Prefers studying at night till 1am (night owl).',
    );
    expect(inferStudyPeaksFromText(utterance)).toContain('night');

    // Fast-path NLU must never misparse it as create_note or create_task
    const fast = parseIntentFastPath(utterance);
    expect(fast.intent).toBe('chat');
    expect(shouldUseOnlineIntentExtraction(utterance, validateIntent(fast))).toBe(
      false,
    );

    const onlineSpy = jest.spyOn(onlineChatSkill, 'sendChatMessage');
    const result = await chatOrchestrator.processMessage(userId, utterance, {
      onlineMode: true,
    });

    expect(onlineSpy).not.toHaveBeenCalled();
    expect(result.intent.intent).toBe('chat');
    expect(result.review).toBeUndefined();
    expect(result.reply).toContain("I'll remember your study preference.");
    expect(result.assistantMessage.memoryChanges?.added).toHaveLength(1);
    expect(notesStore.getAll(userId)).toHaveLength(0);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

    const saved = chatMemoryStore.list(userId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      text: 'Prefers studying at night till 1am (night owl).',
      tier: 'preference',
      category: 'study',
      slotKey: 'onboarding:study',
    });
  });

  it('handles standalone chronotypes, typos, and natural phrasing without miscreating notes', () => {
    expect(studyPreference("I'm a night owl")).toBe(
      'Prefers studying late at night (night owl).',
    );
    expect(studyPreference('im an night owl')).toBe(
      'Prefers studying late at night (night owl).',
    );
    expect(studyPreference("I'm a morning person")).toBe(
      'Prefers studying in the morning (morning person).',
    );
    expect(
      studyPreference("Note that I'm a night owl, I study best at night till 1am"),
    ).toBe('Prefers studying at night till 1am (night owl).');
    expect(explicitMemory('fyi im a 3rd year BSIT student')).toBe(
      'Student says: im a 3rd year BSIT student.',
    );
    expect(explicitMemory('I prefer short answers')).toBe(
      'Student says: I prefer short answers.',
    );
    expect(explicitMemory('I usually sleep around 2am')).toBe(
      'Student says: I usually sleep around 2am.',
    );
    expect(explicitMemory('call me Alex')).toBe('Prefers to be called Alex.');

    // Guardrails: never hijack real notes, scheduling, or reminder calls
    expect(explicitMemory('call me at 5pm')).toBeNull();
    expect(explicitMemory('call me about my exam')).toBeNull();
    expect(
      explicitMemory(
        'Take a note that midterm exam coverage is chapters 1 through 4',
      ),
    ).toBeNull();
    expect(
      parseIntentFastPath(
        'Take a note that midterm exam coverage is chapters 1 through 4',
      ).intent,
    ).toBe('create_note');
    expect(
      studyPreference('Schedule a study block tonight until 1am'),
    ).toBeNull();
    expect(
      studyPreference('I study math tomorrow at 10am'),
    ).toBeNull();
  });

  it('replaces an older study preference slot cleanly and restores it on Undo', async () => {
    const userId = makeUser('replace-slot');
    chatMemoryStore.add(userId, 'Prefers studying during: morning.', {
      tier: 'preference',
      category: 'study',
      slotKey: 'onboarding:study',
    });

    const result = await chatOrchestrator.processMessage(
      userId,
      'im an night owl, i prefer studying at night till 1am',
      {onlineMode: false},
    );

    expect(chatMemoryStore.list(userId).map(m => m.text)).toEqual([
      'Prefers studying at night till 1am (night owl).',
    ]);
    expect(result.assistantMessage.memoryChanges?.removed).toHaveLength(1);
    expect(result.assistantMessage.memoryChanges?.removed[0].text).toBe(
      'Prefers studying during: morning.',
    );

    chatMemoryStore.undoChanges(
      userId,
      result.assistantMessage.memoryChanges!,
    );
    expect(chatMemoryStore.list(userId).map(m => m.text)).toEqual([
      'Prefers studying during: morning.',
    ]);
  });

  it('extracts embedded memory from a mixed message and passes it to DeepSeek on the same turn', async () => {
    const userId = makeUser('mixed-turn');
    const mixed =
      'im an night owl, i prefer studying at night till 1am. Can you suggest a study routine for finals?';

    const embedded = extractEmbeddedMemory(mixed);
    expect(embedded?.text).toBe(
      'Prefers studying at night till 1am (night owl).',
    );

    const chatSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {
          reply: 'Since you are a night owl, try deep work from 9 PM to 1 AM.',
          sources: [],
          usedHandbook: false,
        },
      });

    const result = await chatOrchestrator.processMessage(userId, mixed, {
      onlineMode: true,
      useHandbook: false,
    });

    expect(result.usedOnline).toBe(true);
    expect(result.reply).toContain('night owl');
    expect(result.assistantMessage.memoryChanges?.added).toEqual([
      expect.objectContaining({
        text: 'Prefers studying at night till 1am (night owl).',
      }),
    ]);
    const passedMemories = chatSpy.mock.calls[0]?.[1]?.memories ?? [];
    expect(passedMemories.map(m => m.text)).toContain(
      'Prefers studying at night till 1am (night owl).',
    );
  });

  it('blocks ChatAgent from misusing create_note to save a personal preference', async () => {
    const userId = makeUser('agent-guard');
    jest
      .spyOn(onlineChatSkill, 'agentStep')
      .mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: '',
          toolCalls: [
            {
              id: 'call-note-pref',
              name: 'prepare_lafina_action',
              arguments: {
                request: 'im an night owl, i prefer studying at night till 1am',
                action: 'create_note',
                title: 'Study Preference',
                details: "I'm a night owl, I prefer studying at night till 1am",
              },
            },
          ],
          sources: [],
          usedHandbook: false,
        },
      })
      .mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: 'Got it, I will keep your night owl preference in mind.',
          toolCalls: [],
          sources: [],
          usedHandbook: false,
        },
      });

    const agent = await runChatAgent(
      userId,
      [{role: 'user', content: 'Help me plan around being a night owl'}],
      {
        useHandbook: false,
        referenceDate: new Date(2026, 10, 25, 10, 0, 0),
        localNow: 'Wednesday 2026-11-25, 10:00 AM',
      },
    );

    expect(agent).not.toBeNull();
    expect(agent?.review).toBeUndefined();
    expect(notesStore.getAll(userId)).toHaveLength(0);
  });
});

describe('Memory recall, targeted forget, and smart scheduling integration', () => {
  it('answers memory recall queries truthfully offline and online, and handles targeted forget with Undo', async () => {
    const userId = makeUser('recall-forget');

    expect(isMemoryRecallQuery('What do you remember about me?')).toBe(true);
    expect(isMemoryRecallQuery('Do you remember my study preference?')).toBe(
      true,
    );
    expect(isMemoryRecallQuery('Am I a night owl?')).toBe(true);
    expect(isMemoryRecallQuery('Do you know when my class is?')).toBe(false);
    expect(
      extractForgetSpecificMemoryQuery("Forget that I'm a night owl"),
    ).toBe("I'm a night owl");
    expect(extractForgetSpecificMemoryQuery("Don't forget that I'm a night owl")).toBeNull();
    expect(extractForgetSpecificMemoryQuery('forget it')).toBeNull();

    await chatOrchestrator.processMessage(
      userId,
      'im an night owl, i prefer studying at night till 1am',
      {onlineMode: false},
    );
    await chatOrchestrator.processMessage(
      userId,
      'Remember that I love iced coffee',
      {onlineMode: false},
    );

    const recallAll = await chatOrchestrator.processMessage(
      userId,
      'What do you remember about me?',
      {onlineMode: false},
    );
    expect(recallAll.reply).toContain(
      'Prefers studying at night till 1am (night owl).',
    );
    expect(recallAll.reply).toContain('I love iced coffee');

    const recallTopic = await chatOrchestrator.processMessage(
      userId,
      'Do you remember my study preference?',
      {onlineMode: false},
    );
    expect(recallTopic.reply).toContain(
      'Prefers studying at night till 1am (night owl).',
    );
    expect(recallTopic.reply).not.toContain('iced coffee');

    const spokenRecall = await chatOrchestrator.reviewSpokenTurn(
      userId,
      'Am I a night owl?',
    );
    expect(spokenRecall.kind).toBe('local_answer');
    if (spokenRecall.kind === 'local_answer') {
      expect(spokenRecall.reply).toContain('night owl');
    }

    const forgetOne = await chatOrchestrator.processMessage(
      userId,
      "Forget that I'm a night owl",
      {onlineMode: false},
    );
    expect(forgetOne.reply).toContain('forgotten');
    expect(forgetOne.assistantMessage.memoryChanges?.removed).toHaveLength(1);
    expect(chatMemoryStore.list(userId).map(m => m.text)).toEqual([
      'Student says: I love iced coffee.',
    ]);
  });

  it('uses chat-saved night-owl memory for smart study scheduling and morning briefing even over older defaults', async () => {
    const userId = makeUser('night-schedule');
    // Older onboarding preference set to morning
    preferencesStore.save(userId, {
      wakeTime: '07:00',
      sleepTime: '23:00',
      studyPeakHours: ['morning'],
      busiestDay: 'Monday',
      reminderLeadMinutes: 15,
      snoozeTendency: 'immediate',
      weeklyClassCount: '4-6',
      longestClassGap: '1 hour',
    });
    // Backdate stored preference so the chat memory is strictly newer
    db.executeSync(
      'UPDATE user_preferences SET updated_at = ? WHERE user_id = ?',
      ['2026-10-01T00:00:00.000Z', userId],
    );

    await chatOrchestrator.processMessage(
      userId,
      'im an night owl, i prefer studying at night till 1am',
      {onlineMode: false},
    );

    const ref = new Date(2026, 10, 26, 8, 0, 0);
    const proposal = prepareReviewedCommand(
      userId,
      validateIntent({
        intent: 'create_time_block',
        title: 'Study Calculus',
        date: '2026-11-27',
        time: null,
        endTime: null,
        durationMinutes: 60,
        category: 'Study',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'schedule study calculus tomorrow',
      }),
      {referenceDate: ref},
    );

    expect(proposal.status).toBe('proposal');
    if (proposal.status !== 'proposal') throw new Error('Expected proposal');
    expect(proposal.proposal.details.join(' ')).toContain('9:00 PM');
    expect(proposal.proposal.assumptions.join(' ')).toContain(
      'night study window',
    );

    const briefing = buildMorningBriefing(userId, ref);
    expect(briefing).toContain(
      'You have open night study time starting at 9:00 PM.',
    );
  });

  it('extractExplicitMemory sets preference tier and study category for chronotypes', () => {
    const m = extractExplicitMemory(
      'im an night owl, i prefer studying at night till 1am',
    );
    expect(m).toMatchObject({
      text: 'Prefers studying at night till 1am (night owl).',
      isStudyPreference: true,
      tier: 'preference',
      category: 'study',
      slotKey: 'onboarding:study',
      inferredPeaks: ['night'],
    });
  });
});
