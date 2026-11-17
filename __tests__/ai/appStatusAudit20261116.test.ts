/**
 * Regression tests for the app status audit of 2026-11-16
 * (docs/reports/app-status-audit-2026-11-16.md). Each block names the
 * finding it covers. Runs on the host: in-memory node:sqlite, the real
 * bundled USTP handbook pack, and a mocked online chat skill.
 */
import {
  initDatabase,
  localHandbookStore,
  profileStatisticsStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {migrateHandbookIndex} from '../../src/storage/handbookSchema';
import {LOCAL_NO_EVIDENCE_REPLY, localHandbookService} from '../../src/handbook';
import {
  chatOrchestrator,
  replyDisclaimsHandbook,
} from '../../src/ai/chatOrchestrator';
import {
  extractHandbookClause,
  isHandbookQuestion,
} from '../../src/ai/onlineIntentExtractor';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {validateIntent} from '../../src/ai/nlu/types';
import {plainToolText} from '../../src/ai/voiceActions/structuredAction';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

/** Monday 16 Nov 2026, 09:00 local (the audit's reference time). */
const REF = new Date(2026, 10, 16, 9, 0, 0);
const GUEST = 'local_guest_user';

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask',
    ],
  });
  jest.setSystemTime(REF);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(async () => {
  await initDatabase();
  userStore.createGuestUser();
  // These audit cases exercise the handbook, a USTP-only feature.
  enableUstpForTest(GUEST);
  userStore.setCurrentUser(GUEST);
  endReviewSession();
  localHandbookService.resetForTests();
  jest.restoreAllMocks();
});

const online = (reply: string) =>
  jest.spyOn(onlineChatSkill, 'sendChatMessage').mockResolvedValue({
    status: 'success',
    data: {reply, sources: [], usedHandbook: false, interrupted: false},
  });

describe('H1: the local handbook search fails closed on off-topic questions', () => {
  test.each([
    'What is the weather tomorrow?',
    'explain photosynthesis',
    'how do I cook adobo',
    'who won the NBA finals',
    'write me a poem about love',
    'what is the capital of France',
    'solve 2x + 5 = 11',
    'what time is my class tomorrow',
    'I am tired, can I skip it',
    'help me study for my calculus final exam',
    'how long do I have',
    'tell me a joke',
    'can you explain that more simply',
    'thank you, can you explain it in Tagalog please',
    'what is machine learning',
    'list of best laptops for students',
    'is it free to park near the mall',
    'my id was stolen at the mall what should I do',
  ])('"%s" gets no handbook evidence', async question => {
    const result = await localHandbookService.search(question);
    expect(result.insufficientEvidence).toBe(true);
    expect(result.sources).toEqual([]);
  });

  test('an off-topic question in Ask USTP offline gets the no-evidence reply', async () => {
    const res = await chatOrchestrator.processMessage(
      GUEST,
      'explain photosynthesis',
      {onlineMode: false, useHandbook: true, ustpRagOnly: true, referenceDate: REF},
    );
    expect(res.reply).toBe(LOCAL_NO_EVIDENCE_REPLY);
    expect(res.handbookNote).toBeNull();
  });
});

describe('M5: the right section leads for on-topic questions', () => {
  test.each([
    ['How does INC grade completion work?', 'Grade Completion'],
    ['INC', 'Grade Completion'],
    ['what is the passing grade', 'Grading System'],
    ['ano ang grading system sa ustp', 'Grading System'],
    ['what is the penalty for cheating', 'Academic Offense'],
    ['What is the campus dress code policy?', 'DRESS CODE'],
    ['can I still drop this subject', 'Dropping of Subjects'],
    ['what is a leave of absence', 'Leave of Absence'],
    ['Pwede ba ako mag-drop ng subject?', 'Dropping of Subjects'],
  ])('"%s" leads with %s', async (question, section) => {
    const result = await localHandbookService.search(question);
    expect(result.insufficientEvidence).toBe(false);
    expect(result.matches[0].chunk.section).toContain(section);
  });
});

describe('H2: handbook excerpts and notes only where they belong', () => {
  test('a caller that does not opt in gets no excerpts or handbook note', async () => {
    const send = online('Photosynthesis turns light into chemical energy.');
    const res = await chatOrchestrator.processMessage(
      GUEST,
      'explain photosynthesis',
      {onlineMode: true, referenceDate: REF},
    );
    const [history, opts] = send.mock.calls[0];
    expect(history[history.length - 1].content).not.toContain(
      '<handbook_excerpts',
    );
    expect(opts?.useHandbook).toBe(false);
    expect(res.handbookNote).toBeNull();
  });

  test('a follow-up borrows only a previous handbook question', async () => {
    const afterSmallTalk = await localHandbookService.search('tell me a joke', {
      previousUserQuery: 'what should I eat for lunch',
    });
    expect(afterSmallTalk.insufficientEvidence).toBe(true);

    const afterInc = await localHandbookService.search('how long do I have', {
      previousUserQuery: 'How does INC grade completion work?',
    });
    expect(afterInc.insufficientEvidence).toBe(false);
    expect(afterInc.matches[0].chunk.section).toContain('Grade Completion');
  });

  test('a reply that says the excerpts do not cover it gets no handbook note', async () => {
    expect(
      replyDisclaimsHandbook(
        'The handbook excerpts provided do not specify a parking policy.',
      ),
    ).toBe(true);
    expect(replyDisclaimsHandbook('Per Art. 4 (p. 53), INC must be completed within a year.')).toBe(false);

    online('The handbook excerpts provided do not specify that.');
    const res = await chatOrchestrator.processMessage(
      GUEST,
      'What is the INC completion deadline?',
      {onlineMode: true, useHandbook: true, ustpRagOnly: true, referenceDate: REF},
    );
    expect(res.handbookNote).toBeNull();
  });
});

describe('H3: handbook vs planner signals', () => {
  test.each([
    'What is my GPA goal note?',
    'add task compute my gwa tonight',
    'remind me to pay tuition tomorrow at 9am',
    'schedule a meeting with the ustp registrar on friday 2pm',
    'take a note: prerequisite for CS 311 is CS 211',
    'how many absences do I have left in math',
  ])('"%s" stays with the planner', text => {
    expect(isHandbookQuestion(text)).toBe(false);
  });

  test.each([
    'can I still drop this subject',
    'what are the rules on cheating',
    'what happens if I fail a subject',
    'pwede pa ba mag shift ng course',
    "What GPA is required for Dean's List?",
    'What is the INC completion deadline?',
  ])('"%s" is a handbook question', text => {
    expect(isHandbookQuestion(text)).toBe(true);
  });

  test('a mixed question answers both halves offline', async () => {
    expect(
      extractHandbookClause(
        'What is my schedule tomorrow and what is the USTP attendance policy?',
      ),
    ).toMatch(/attendance policy/i);

    const res = await chatOrchestrator.processMessage(
      GUEST,
      'What is my schedule tomorrow and what is the USTP attendance policy?',
      {onlineMode: false, referenceDate: REF},
    );
    expect(res.route).toBe('read_only');
    expect(res.reply).toMatch(/tomorrow/i);
    expect(res.reply).toContain('According to the local USTP Student Handbook');
    expect(res.handbookNote).toMatch(/Referenced USTP Student Handbook/);
  });

  test('"how many absences do I have left" is not answered from the handbook offline', async () => {
    const res = await chatOrchestrator.processMessage(
      GUEST,
      'how many absences do I have left in math',
      {onlineMode: false, referenceDate: REF},
    );
    expect(res.reply).not.toContain('According to the local USTP Student Handbook');
  });
});

describe('H5: schema 28 without FTS5', () => {
  test('the migration keeps the plain tables and does not throw', () => {
    const statements: string[] = [];
    const tx = {
      executeSync: (sql: string) => {
        statements.push(sql.trim());
        if (/USING fts5/i.test(sql)) throw new Error('no such module: fts5');
        return {rows: []} as never;
      },
    };
    expect(() => migrateHandbookIndex(tx)).not.toThrow();
    expect(statements.some(s => s.startsWith('CREATE TABLE IF NOT EXISTS handbook_chunks'))).toBe(true);
    expect(statements).toContain('ROLLBACK TO SAVEPOINT handbook_fts');
    expect(statements.some(s => s.startsWith('CREATE TRIGGER'))).toBe(false);
  });

  test('the handbook reports not available instead of failing', async () => {
    jest.spyOn(localHandbookStore, 'ensureFtsIndex').mockReturnValue(false);
    const status = await localHandbookService.ensureReady();
    expect(status.populated).toBe(false);
    expect(localHandbookService.isPopulated()).toBe(false);
    const res = await chatOrchestrator.processMessage(
      GUEST,
      'What is the INC completion deadline?',
      {onlineMode: false, referenceDate: REF},
    );
    expect(res.reply).toMatch(/require Online Mode/);
  });

  test('a missing FTS index is rebuilt from the stored chunks', async () => {
    await localHandbookService.ensureReady();
    localHandbookStore.ensureFtsIndex();
    expect(localHandbookStore.hasTerm('dean')).toBe(true);
    expect(localHandbookStore.hasTerm('photosynthesis')).toBe(false);
  });
});

describe('M1: a review card answers only to its own turn and chat', () => {
  test('a bare "ok" after an unrelated online turn does not save the old card', async () => {
    const card = await chatOrchestrator.processMessage(
      GUEST,
      'add task print handouts tomorrow',
      {onlineMode: false, referenceDate: REF},
    );
    expect(card.review?.status).toBe('proposal');

    const send = online('Sure! Want me to quiz you on chapter 3?');
    await chatOrchestrator.processMessage(GUEST, 'what is osmosis', {
      onlineMode: true,
      referenceDate: REF,
    });
    send.mockResolvedValue({
      status: 'success',
      data: {
        reply: 'Great, first question: what is diffusion?',
        sources: [],
        usedHandbook: false,
        interrupted: false,
      },
    });
    const ok = await chatOrchestrator.processMessage(GUEST, 'ok', {
      onlineMode: true,
      referenceDate: REF,
    });
    expect(ok.resolvedReview).toBeUndefined();
    expect(tasksStore.getAllTasks(GUEST).some(t => /handouts/i.test(t.title))).toBe(false);

    // An explicit confirmation still works while the card is open.
    const confirm = await chatOrchestrator.processMessage(GUEST, 'confirm', {
      onlineMode: true,
      referenceDate: REF,
    });
    expect(confirm.resolvedReview?.status).toBe('applied');
  });

  test('"yes" right after the card still saves it', async () => {
    const card = await chatOrchestrator.processMessage(
      GUEST,
      'add task print handouts tomorrow',
      {onlineMode: false, referenceDate: REF},
    );
    expect(card.review?.status).toBe('proposal');
    const yes = await chatOrchestrator.processMessage(GUEST, 'yes', {
      onlineMode: false,
      referenceDate: REF,
    });
    expect(yes.resolvedReview?.status).toBe('applied');
  });
});

describe('M2: agent tool text is plain facts', () => {
  test('the Markdown "Say …" hint and emphasis are removed', () => {
    const text = plainToolText(
      'Tomorrow, you have room for **1 hour** in these free windows:\n\n• **7:00 AM – 2:00 PM**\n\n> Say *"block 1 hour at 7 AM tomorrow for studying"* and I\'ll prepare it for you to confirm.',
    );
    expect(text).not.toMatch(/\bSay\b|\*|^>/m);
    expect(text).toContain('7:00 AM – 2:00 PM');
  });
});

describe('M7: dates', () => {
  test('a month well in the past without a year means next year', () => {
    const parsed = parseIntentFastPath(
      'remind me on january 5 at 9am to pay fees',
      REF,
    );
    expect(parsed.date).toBe('2027-01-05');
  });

  test('a date a few days back stays this year', () => {
    expect(parseIntentFastPath('remind me on november 10 at 9am to study', REF).date).toBe(
      '2026-11-10',
    );
  });

  test.each([
    ['schedule exam review on november 31 at 3pm', 'November 31'],
    ['remind me on february 30 at 9am to study', 'February 30'],
  ])('"%s" is refused, not rolled over', (text, label) => {
    const validated = validateIntent(parseIntentFastPath(text, REF));
    expect(validated.isValid).toBe(false);
    expect(validated.validationError).toContain(`${label} doesn't exist`);
  });
});

describe('Low findings', () => {
  test('L2: Taglish fillers do not stay in titles', () => {
    const remind = parseIntentFastPath('Pa-remind bukas 9am magpasa ng lab report', REF);
    expect(remind.intent).toBe('create_reminder');
    expect(remind.title).not.toMatch(/pa-?remind/i);
    expect(remind.title).toMatch(/lab report/i);

    const quiz = parseIntentFastPath('May quiz kami bukas ng 10am', REF);
    expect(quiz.title).not.toMatch(/\bkami\b|\bmay\b/i);
    expect(quiz.title).toMatch(/quiz/i);
  });

  test('L4: "what tasks are overdue" is the overdue lookup', () => {
    const parsed = parseIntentFastPath('what tasks are overdue', REF);
    expect(parsed.intent).toBe('query_schedule');
    expect(parsed.details).toBe('overdue');
  });

  test('L3: an overnight block counts its minutes, and earlier today is overdue', () => {
    timeBlocksStore.insert({
      id: 'tb-night',
      userId: GUEST,
      title: 'Thesis sprint',
      date: '2026-11-16',
      startTime: '22:00',
      endTime: '01:00',
      color: '#4F46E5',
      category: 'Academic',
    });
    tasksStore.insertTask({
      id: 't-morning',
      userId: GUEST,
      title: 'Submit form',
      dueDate: '2026-11-16',
      dueTime: '08:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
    });
    const stats = profileStatisticsStore.readDetailed(GUEST, REF);
    expect(stats.weeklyStudyMinutes).toBe(180);
    expect(stats.overdueTasksCount).toBe(1);
    expect(stats.dueTodayTasksCount).toBe(0);
  });
});
