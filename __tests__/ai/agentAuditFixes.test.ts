/**
 * Regression tests for the Lafina agent audit (2026-11-13, commit 24c39b1).
 * Each block names the finding it covers. Everything runs on the device path
 * (deterministic parser + review cards); no network.
 */
import {
  initDatabase,
  notesStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {
  chatOrchestrator,
  needsPlannerContext,
} from '../../src/ai/chatOrchestrator';
import {
  confirmReviewedCommand,
  endReviewSession,
  undoLowRiskCommand,
} from '../../src/ai/nlu/commandReview';
import type {CommandProposal} from '../../src/ai/nlu/commandReview';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {intentService} from '../../src/ai/nlu/intentService';
import {buildStudentVoiceContext} from '../../src/cloud/voiceConversation/localVoiceData';
import {remindersStore} from '../../src/storage/remindersStore';

/** Friday 13 Nov 2026, 10:00 local. */
const REF = new Date(2026, 10, 13, 10, 0, 0);
const TODAY = '2026-11-13';
const TOMORROW = '2026-11-14';

let ownerIndex = 0;
const owner = (tag: string): string => `audit-${tag}-${++ownerIndex}`;

const send = (userId: string, text: string) =>
  chatOrchestrator.processMessage(userId, text, {referenceDate: REF});

const proposalOf = (
  result: Awaited<ReturnType<typeof send>>,
): CommandProposal => {
  if (result.review?.status !== 'proposal') {
    throw new Error(`Expected a review card, got: ${result.reply}`);
  }
  return result.review.proposal;
};

const parse = (text: string) => parseIntentFastPath(text, REF);

beforeAll(() => {
  // The clock reads the reference time, so "already passed" and confirm-time
  // checks agree with REF. Timers stay real.
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
  endReviewSession();
});

describe('finding 4: planning questions are not saved as tasks', () => {
  test.each([
    'plan my week around my exams',
    'help me plan my study schedule for finals',
  ])('"%s" is conversation, not a task', async text => {
    expect(parse(text).intent).toBe('chat');
    const userId = owner('plan');
    const result = await send(userId, text);
    expect(result.review).toBeUndefined();
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
  });

  test('"find a free slot tomorrow for 2 hours" lists free windows and writes nothing', async () => {
    const userId = owner('slot');
    timeBlocksStore.insert({
      id: 'tb-slot',
      userId,
      title: 'Thesis',
      date: TOMORROW,
      startTime: '09:00',
      endTime: '11:00',
      color: '#4F46E5',
      category: 'Academic',
    });
    const parsed = parse('find a free slot tomorrow for 2 hours of studying');
    expect(parsed.intent).toBe('query_schedule');
    expect(parsed.details).toBe('free_slots');
    expect(parsed.durationMinutes).toBe(120);

    const result = await send(
      userId,
      'find a free slot tomorrow for 2 hours of studying',
    );
    expect(result.reply).toContain('7:00 AM – 9:00 AM');
    expect(result.reply).toContain('11:00 AM – 10:00 PM');
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
  });
});

describe('finding 5: conflicts are answered on the card', () => {
  test('an overlap shows a warning and free alternatives; the reply asks no question', async () => {
    const userId = owner('conflict');
    timeBlocksStore.insert({
      id: 'tb-busy',
      userId,
      title: 'Compiler Design',
      date: TOMORROW,
      startTime: '10:00',
      endTime: '12:00',
      color: '#4F46E5',
      category: 'Academic',
    });
    const result = await send(
      userId,
      'schedule a study block tomorrow from 11am to 1pm',
    );
    const proposal = proposalOf(result);
    expect(result.reply).not.toMatch(/Would you like/);
    expect(proposal.warnings.join(' ')).toContain('Compiler Design');
    expect(proposal.conflictAlternatives?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('finding 6: times that already passed', () => {
  test('"later at 7" at 10 AM is 7 PM today', async () => {
    const parsed = parse(
      'can you add a meeting with my groupmates later at 7?',
    );
    expect(parsed.time).toBe('19:00');
    const userId = owner('later');
    const proposal = proposalOf(
      await send(
        userId,
        'can you add a meeting with my groupmates later at 7?',
      ),
    );
    expect(proposal.details.join(' ')).toContain('7:00 PM');
    expect(proposal.details.join(' ')).toContain('Nov 13');
  });

  test.each([
    ['set my alarm for 6am', '06:00'],
    ['wake me up at 6', '06:00'],
  ])('"%s" rings tomorrow morning, titled Alarm', async (text, time) => {
    const parsed = parse(text);
    expect(parsed.intent).toBe('create_reminder');
    expect(parsed.title).toBe('Alarm');
    expect(parsed.time).toBe(time);
    const userId = owner('alarm');
    const proposal = proposalOf(await send(userId, text));
    expect(proposal.details.join(' ')).toContain('Nov 14');
    expect(proposal.assumptions.join(' ')).toMatch(/already passed today/);
  });

  test('an explicit evening alarm keeps its time', () => {
    expect(parse('set an alarm for 7pm').time).toBe('19:00');
  });
});

describe('finding 7: Taglish offline', () => {
  test('"paalala mo sakin mag-aral bukas ng 7pm" sets a reminder', () => {
    const parsed = parse('paalala mo sakin mag-aral bukas ng 7pm');
    expect(parsed.intent).toBe('create_reminder');
    expect(parsed.title).toBe('Study');
    expect(parsed.date).toBe(TOMORROW);
    expect(parsed.time).toBe('19:00');
    expect(parsed.rawTranscript).toBe('paalala mo sakin mag-aral bukas ng 7pm');
  });

  test('"ano schedule ko bukas" reads tomorrow', () => {
    const parsed = parse('ano schedule ko bukas');
    expect(parsed.intent).toBe('query_schedule');
    expect(parsed.date).toBe(TOMORROW);
  });

  test('"dagdag mo sa todo bumili ng bigas" adds a to-do', () => {
    const parsed = parse('dagdag mo sa todo bumili ng bigas');
    expect(parsed.intent).toBe('create_task');
    expect(parsed.title).toBe('Buy bigas');
  });
});

describe('finding 8: commands that were missing', () => {
  test('notes search finds text inside a note', async () => {
    const userId = owner('notes');
    notesStore.insert({
      id: 'n-phys',
      userId,
      title: 'Physics review',
      body: 'Newton second law F = ma',
      category: 'Academics',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });
    expect(parse('what did i write about physics?').intent).toBe('query_notes');
    const result = await send(userId, 'what did i write about physics?');
    expect(result.reply).toContain('Physics review');
  });

  test('"add rice to my groceries checklist" appends a checklist item', async () => {
    const userId = owner('checklist');
    notesStore.insert({
      id: 'n-groc',
      userId,
      title: 'Groceries',
      body: '- [ ] eggs',
      category: 'Personal',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });
    const proposal = proposalOf(
      await send(userId, 'add rice to my groceries checklist'),
    );
    expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
      'applied',
    );
    const body =
      notesStore.getAll(userId).find(n => n.id === 'n-groc')?.body ?? '';
    expect(body).toContain('eggs');
    expect(body).toMatch(/Rice/i);
  });

  test('overdue tasks are listed', async () => {
    const userId = owner('overdue');
    tasksStore.insertTask({
      id: 't-late',
      userId,
      title: 'Lab report',
      dueDate: '2026-11-10',
      dueTime: '17:00',
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
    });
    const result = await send(userId, 'show overdue tasks');
    expect(result.reply).toContain('Lab report');
  });

  test('"what\'s my next class" answers from the calendar', async () => {
    const userId = owner('next');
    timeBlocksStore.insert({
      id: 'tb-cs',
      userId,
      title: 'CS101 Lecture',
      date: '2026-11-16',
      startTime: '10:00',
      endTime: '11:30',
      color: '#4F46E5',
      category: 'Academic',
    });
    const result = await send(userId, "what's my next class");
    expect(result.reply).toContain('CS101 Lecture');
    expect(result.reply).toContain('10:00 AM');
  });

  test('"remind me 30 minutes before my math exam" links a reminder to the event', async () => {
    const userId = owner('lead');
    const exam = proposalOf(
      await send(userId, 'add math exam on friday at 9am'),
    );
    expect(exam.heading).toBe('Create event');
    confirmReviewedCommand(userId, exam.operationId);

    const proposal = proposalOf(
      await send(userId, 'remind me 30 minutes before my math exam'),
    );
    expect(proposal.details.join(' ')).toContain('8:30 AM');
    expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
      'applied',
    );
    expect(
      remindersStore
        .getAllReminders(userId)
        .some(r => /starts in 30 minutes/.test(r.task)),
    ).toBe(true);
  });

  test('"clear all completed tasks" previews the list and deletes only completed ones', async () => {
    const userId = owner('bulk');
    tasksStore.insertTask({
      id: 't-done',
      userId,
      title: 'Done one',
      dueDate: null,
      dueTime: null,
      isCompleted: true,
      priority: 'Low',
      category: 'Personal',
    });
    tasksStore.insertTask({
      id: 't-open',
      userId,
      title: 'Still open',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Low',
      category: 'Personal',
    });
    const proposal = proposalOf(
      await send(userId, 'clear all completed tasks'),
    );
    expect(proposal.destructive).toBe(true);
    expect(proposal.details.join(' ')).toContain('Done one');
    expect(proposal.details.join(' ')).not.toContain('Still open');
    expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
      'applied',
    );
    expect(tasksStore.getAllTasks(userId).map(t => t.title)).toEqual([
      'Still open',
    ]);
  });
});

describe('finding 9: titles, durations, repeat days and events', () => {
  test('"block out 2 hours tomorrow morning for thesis"', () => {
    const parsed = parse('block out 2 hours tomorrow morning for thesis');
    expect(parsed.intent).toBe('create_time_block');
    expect(parsed.title).toBe('Thesis');
    expect(parsed.durationMinutes).toBe(120);
    expect(parsed.time).toBe('09:00');
    expect(parsed.endTime).toBe('11:00');
  });

  test('"every monday and wednesday" repeats on both days', () => {
    const parsed = parse(
      'put CS101 lecture every monday and wednesday 10am to 11:30am on my calendar',
    );
    expect(parsed.title).toBe('CS101 Lecture');
    expect(parsed.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
  });

  test.each([
    'add math exam on friday at 9am',
    'add dentist appointment on monday at 2pm',
  ])('"%s" is a calendar event with a reminder', async text => {
    const parsed = parse(text);
    expect(parsed.intent).toBe('create_time_block');
    expect(parsed.targetEntityType).toBe('event');
    const proposal = proposalOf(await send(owner('event'), text));
    expect(proposal.heading).toBe('Create event');
    expect(proposal.details.join(' ')).toMatch(
      /Reminder: rings 15 minutes before/,
    );
  });

  test('"in 2 hours" is still a time, not a duration', () => {
    expect(
      parse('remind me to stretch in 2 hours').durationMinutes ?? null,
    ).toBeNull();
  });
});

describe('finding 10: Undo for immediate actions', () => {
  test('marking a task done offers Undo, and Undo reopens it', async () => {
    const userId = owner('undo');
    tasksStore.insertTask({
      id: 't-undo',
      userId,
      title: 'Buy bond paper',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Low',
      category: 'Personal',
    });
    const result = await send(userId, 'mark buy bond paper as done');
    expect(tasksStore.getAllTasks(userId)[0].isCompleted).toBe(true);
    expect(result.undo?.label).toMatch(/Marked .*Buy bond paper.* done/);

    const undone = undoLowRiskCommand(userId, result.undo!.token);
    expect(undone.status).toBe('undone');
    expect(tasksStore.getAllTasks(userId)[0].isCompleted).toBe(false);
    // An offer works once.
    expect(undoLowRiskCommand(userId, result.undo!.token).status).toBe(
      'refused',
    );
  });

  test('Undo is refused for another account', async () => {
    const userId = owner('undo-owner');
    tasksStore.insertTask({
      id: 't-undo-owner',
      userId,
      title: 'Return library book',
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Low',
      category: 'Personal',
    });
    const result = await send(userId, 'mark return library book as done');
    expect(undoLowRiskCommand('someone-else', result.undo!.token).status).toBe(
      'refused',
    );
    expect(tasksStore.getAllTasks(userId)[0].isCompleted).toBe(true);
  });
});

describe('finding 11 and 15: online planner context', () => {
  test('the planner rides along only for planner questions', () => {
    expect(needsPlannerContext('what do I have tomorrow?')).toBe(true);
    expect(needsPlannerContext('am I free tonight')).toBe(true);
    expect(needsPlannerContext('explain photosynthesis')).toBe(false);
    expect(needsPlannerContext('what is a linked list')).toBe(false);
  });

  test('the snapshot has the current time, overdue work and a per-day summary', () => {
    const userId = owner('context');
    tasksStore.insertTask({
      id: 't-ctx-late',
      userId,
      title: 'Late essay',
      dueDate: '2026-11-11',
      dueTime: '23:59',
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
    });
    for (let i = 0; i < 14; i += 1) {
      timeBlocksStore.insert({
        id: `tb-ctx-${i}`,
        userId,
        title: `Block ${i}`,
        date: i < 7 ? TODAY : TOMORROW,
        startTime: `${String(8 + (i % 7)).padStart(2, '0')}:00`,
        endTime: `${String(9 + (i % 7)).padStart(2, '0')}:00`,
        color: '#4F46E5',
        category: 'Academic',
      });
    }
    const context = buildStudentVoiceContext(userId, {referenceDate: REF});
    expect(context).toContain('now 10:00');
    expect(context).toContain('Overdue tasks (1)');
    expect(context).toContain('Late essay');
    expect(context).toMatch(/Friday 2026-11-13 \(today\)/);
    // More than the old cap of 10 blocks.
    expect(context).toContain('Block 13');
  });
});

describe('finding 13: vague follow-ups', () => {
  test('"add it" asks which item instead of creating "It"', async () => {
    const userId = owner('vague');
    const result = await send(userId, 'add it');
    expect(result.review?.status).not.toBe('proposal');
    expect(result.reply).toMatch(/Which task do you mean/);
    expect(tasksStore.getAllTasks(userId)).toHaveLength(0);
  });

  test('"yes" with nothing pending says so offline', async () => {
    const result = await send(owner('yes'), 'yes');
    expect(result.reply).toMatch(/nothing waiting for confirmation/);
    expect(result.reply).not.toMatch(/Online Mode/);
  });
});

describe('finding 14: review cards last 30 minutes', () => {
  test('a proposal expires 30 minutes after it was prepared', async () => {
    const proposal = proposalOf(
      await send(owner('ttl'), 'add buy bond paper to my to-do'),
    );
    expect(proposal.expiresAt - Date.now()).toBe(30 * 60 * 1000);
  });
});

describe('intent extraction keeps the original wording', () => {
  test('Taglish goes through intentService with the raw transcript intact', async () => {
    const validated = await intentService.extractIntent(
      'ano schedule ko bukas',
      {
        referenceDate: REF,
      },
    );
    expect(validated.intent).toBe('query_schedule');
    expect(validated.rawTranscript).toBe('ano schedule ko bukas');
  });
});
