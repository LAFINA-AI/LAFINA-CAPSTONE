/**
 * Online Chat agent (ADR-033): several tool steps, one card, never a save.
 * DeepSeek is replaced by a scripted `agentStep`; the tools run on the
 * in-memory database.
 */
const storage = require('../../src/storage');
const review = require('../../src/ai/nlu/commandReview');
const {chatOrchestrator} = require('../../src/ai/chatOrchestrator');
const {onlineChatSkill} = require('../../src/skills/onlineChatSkill');
const {runChatAgent, CHAT_AGENT_MAX_STEPS} = require('../../src/ai/chatAgent');
const {cloudClient} = require('../../src/cloud');

/** Saturday 14 Nov 2026, 09:00 local. */
const REF = new Date(2026, 10, 14, 9, 0, 0);
const QUESTION =
  'can you help me fit 2 hours of physics review into my Monday?';
let n = 0;
let user = '';

const step = (reply: string, toolCalls: unknown[] = []) => ({
  status: 'success',
  data: {reply, toolCalls, sources: [], usedHandbook: false},
});
/** What one agentStep call received: the conversation and the options. */
type StepCall = [
  {role: string; content: string}[],
  {
    tools: string[];
    localNow: string;
    exchange: {role: string; content?: string}[];
  },
];
const stepCalls = (spy: jest.SpyInstance) =>
  spy.mock.calls as unknown as StepCall[];

const call = (id: string, name: string, args: Record<string, unknown>) => ({
  id,
  name,
  arguments: args,
});

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
afterAll(() => jest.useRealTimers());

beforeEach(async () => {
  await storage.initDatabase();
  review.endReviewSession();
  user = `chat-agent-${++n}`;
  // Nothing reaches the network: the scripted agent is the only "online" part.
  jest.spyOn(cloudClient, 'request').mockResolvedValue({status: 'offline'});
  jest
    .spyOn(onlineChatSkill, 'sendChatMessage')
    .mockResolvedValue({
      status: 'success',
      data: {reply: 'Plain reply.', sources: [], usedHandbook: false},
    });
  jest
    .spyOn(onlineChatSkill, 'streamChatMessage')
    .mockResolvedValue({
      status: 'success',
      data: {reply: 'Plain reply.', sources: [], usedHandbook: false},
    });
});
afterEach(() => jest.restoreAllMocks());

const scriptedPlan = () =>
  jest
    .spyOn(onlineChatSkill, 'agentStep')
    .mockResolvedValueOnce(
      step('', [
        call('c1', 'find_free_time', {
          date: '2026-11-16',
          durationMinutes: 120,
        }),
      ]),
    )
    .mockResolvedValueOnce(
      step('', [
        call('c2', 'prepare_lafina_action', {
          request: 'book the first free slot',
          action: 'create_time_block',
          title: 'Physics review',
          date: '2026-11-16',
          time: '07:00',
          endTime: '09:00',
        }),
      ]),
    )
    .mockResolvedValueOnce(
      step(
        'You are free all Monday morning, so I put a 7 to 9 AM physics review on a card for you to confirm.',
      ),
    );

it('looks up free time, prepares one card and answers, saving nothing', async () => {
  const agent = scriptedPlan();
  const result = await chatOrchestrator.processMessage(user, QUESTION, {
    onlineMode: true,
    useHandbook: false,
    referenceDate: REF,
  });
  expect(agent).toHaveBeenCalledTimes(3);
  expect(result.reply).toMatch(/physics review on a card/);
  expect(result.usedOnline).toBe(true);
  expect(result.review?.status).toBe('proposal');
  const proposal = result.review.proposal;
  expect(proposal.title).toBe('Physics review');
  expect(proposal.surface).toBe('chat');
  expect(review.appliedReviewReply(user, proposal.operationId)).toBeNull();
  expect(review.latestPendingReview(user, 'chat')?.operationId).toBe(
    proposal.operationId,
  );

  // Every step sends the same conversation; the exchange grows with results.
  const [first, second, third] = stepCalls(agent);
  expect(first[0][first[0].length - 1]).toEqual({
    role: 'user',
    content: QUESTION,
  });
  expect(first[1].tools).toEqual(
    expect.arrayContaining([
      'read_calendar',
      'find_free_time',
      'prepare_lafina_action',
    ]),
  );
  expect(first[1].tools).not.toContain('confirm_draft');
  expect(first[1].localNow).toBe('Saturday 2026-11-14, 9:00 AM');
  expect(second[1].exchange.map(m => m.role)).toEqual(['assistant', 'tool']);
  expect(second[1].exchange[1].content).toMatch(/free windows/);
  expect(third[1].exchange.map(m => m.role)).toEqual([
    'assistant',
    'tool',
    'assistant',
    'tool',
  ]);
  expect(third[1].exchange[3].content).toMatch(
    /Nothing is saved until they tap Confirm/,
  );

  // The student's own "yes" saves it, like any Chat card.
  const confirmed = await chatOrchestrator.processMessage(user, 'yes', {
    onlineMode: true,
    referenceDate: REF,
  });
  expect(confirmed.resolvedReview?.status).toBe('applied');
});

it('never prepares a deletion from the model and keeps one card per reply', async () => {
  const agent = jest
    .spyOn(onlineChatSkill, 'agentStep')
    .mockResolvedValueOnce(
      step('', [
        call('c1', 'prepare_lafina_action', {
          request: 'x',
          action: 'delete_task',
          title: 'Essay',
        }),
        call('c2', 'prepare_lafina_action', {
          request: 'x',
          action: 'create_task',
          title: 'Essay outline',
          date: '2026-11-16',
        }),
        call('c3', 'prepare_lafina_action', {
          request: 'x',
          action: 'create_task',
          title: 'Second card',
          date: '2026-11-16',
        }),
      ]),
    )
    .mockResolvedValueOnce(step('Done looking.'));
  const result = await runChatAgent(
    user,
    [{role: 'user', content: 'tidy my tasks'}],
    {
      useHandbook: false,
      referenceDate: REF,
      localNow: 'Saturday 2026-11-14, 9:00 AM',
    },
  );
  const results = stepCalls(agent)[1][1].exchange.filter(
    m => m.role === 'tool',
  );
  expect(results[0].content).toMatch(/Invalid arguments: Unsupported action/);
  expect(results[1].content).toMatch(/A review card is shown/);
  expect(results[2].content).toMatch(/already on the student’s screen/);
  expect(result.review.proposal.title).toBe('Essay outline');
});

it('stops after the step limit instead of looping', async () => {
  const agent = jest
    .spyOn(onlineChatSkill, 'agentStep')
    .mockImplementation(async () =>
      step('', [
        call(`c${Math.random()}`, 'read_calendar', {date: '2026-11-16'}),
      ]),
    );
  const result = await runChatAgent(
    user,
    [{role: 'user', content: 'what is on Monday'}],
    {
      useHandbook: false,
      referenceDate: REF,
      localNow: 'Saturday 2026-11-14, 9:00 AM',
    },
  );
  expect(agent).toHaveBeenCalledTimes(CHAT_AGENT_MAX_STEPS);
  expect(result.reply).toMatch(/could not finish that in one go/);
});

it('falls back to the ordinary online reply when the agent is unavailable', async () => {
  const agent = jest
    .spyOn(onlineChatSkill, 'agentStep')
    .mockResolvedValue({
      status: 'server_unavailable',
      error: 'Chat agent is unavailable.',
      httpStatus: 404,
    });
  const result = await chatOrchestrator.processMessage(user, QUESTION, {
    onlineMode: true,
    useHandbook: false,
    referenceDate: REF,
  });
  expect(agent).toHaveBeenCalledTimes(1);
  expect(result.reply).toBe('Plain reply.');
  expect(result.review).toBeUndefined();
});

it('cancels a prepared card when a later step fails', async () => {
  jest
    .spyOn(onlineChatSkill, 'agentStep')
    .mockResolvedValueOnce(
      step('', [
        call('c1', 'prepare_lafina_action', {
          request: 'x',
          action: 'create_task',
          title: 'Essay outline',
          date: '2026-11-16',
        }),
      ]),
    )
    .mockResolvedValueOnce({status: 'offline'});
  const result = await runChatAgent(
    user,
    [{role: 'user', content: 'add my essay outline'}],
    {
      useHandbook: false,
      referenceDate: REF,
      localNow: 'Saturday 2026-11-14, 9:00 AM',
    },
  );
  expect(result).toBeNull();
  expect(review.latestPendingReview(user, 'chat')).toBeNull();
});

it('small talk and study questions never start the agent', async () => {
  const agent = jest.spyOn(onlineChatSkill, 'agentStep');
  await chatOrchestrator.processMessage(user, 'hello!', {
    onlineMode: true,
    referenceDate: REF,
  });
  await chatOrchestrator.processMessage(user, 'explain photosynthesis', {
    onlineMode: true,
    useHandbook: false,
    referenceDate: REF,
  });
  expect(agent).not.toHaveBeenCalled();
});

describe('follow-ups that point back at the conversation (audit 2, B2)', () => {
  const bookFirst = () =>
    jest
      .spyOn(onlineChatSkill, 'agentStep')
      .mockResolvedValueOnce(
        step('', [
          call('f1', 'prepare_lafina_action', {
            request: 'book the first one',
            action: 'create_time_block',
            title: 'Physics review',
            date: '2026-11-16',
            time: '07:00',
            endTime: '09:00',
          }),
        ]),
      )
      .mockResolvedValueOnce(step('I put the 7 to 9 AM slot on a card.'));

  it('"book the first one" goes to the agent, not a card called "First one"', async () => {
    const agent = bookFirst();
    const result = await chatOrchestrator.processMessage(
      user,
      'book the first one',
      {onlineMode: true, useHandbook: true, referenceDate: REF},
    );
    expect(agent).toHaveBeenCalled();
    expect(result.review?.status).toBe('proposal');
    expect(result.review.proposal.title).toBe('Physics review');
    expect(JSON.stringify(result.review)).not.toMatch(/First one/i);
    // Planner turns never ask for handbook passages (B4).
    const [, options] = stepCalls(agent)[0];
    expect((options as unknown as {useHandbook: boolean}).useHandbook).toBe(
      false,
    );
  });

  it('without the agent, a pointer is asked about, never guessed', async () => {
    jest.spyOn(onlineChatSkill, 'agentStep').mockResolvedValue({
      status: 'server_unavailable',
      httpStatus: 404,
    });
    const result = await chatOrchestrator.processMessage(
      user,
      'book the first one',
      {onlineMode: true, referenceDate: REF},
    );
    expect(result.review).toBeUndefined();
    expect(result.reply).toMatch(/Which one do you mean/);
    expect(storage.tasksStore.getAllTasks(user)).toHaveLength(0);
  });

  it('offline, a pointer asks instead of preparing a junk card', async () => {
    const result = await chatOrchestrator.processMessage(
      user,
      'book the first one',
      {onlineMode: false, referenceDate: REF},
    );
    expect(result.review).toBeUndefined();
    expect(result.reply).toMatch(/Which one do you mean/);
  });

  it('a short Taglish follow-up after a free-time answer reaches the agent', async () => {
    jest
      .spyOn(onlineChatSkill, 'agentStep')
      .mockResolvedValueOnce(
        step('You are free Monday 7 to 9 AM and 1 to 3 PM.'),
      );
    await chatOrchestrator.processMessage(user, QUESTION, {
      onlineMode: true,
      referenceDate: REF,
    });
    const agent = bookFirst();
    const result = await chatOrchestrator.processMessage(
      user,
      'yung una na lang',
      {onlineMode: true, referenceDate: REF},
    );
    expect(agent).toHaveBeenCalled();
    expect(result.review?.proposal?.title).toBe('Physics review');
  });

  it('a request with real content keeps its own card', async () => {
    const agent = jest.spyOn(onlineChatSkill, 'agentStep');
    const result = await chatOrchestrator.processMessage(
      user,
      'add a task first aid kit review tomorrow at 3pm',
      {onlineMode: true, referenceDate: REF},
    );
    expect(agent).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toMatch(/[Ff]irst aid kit review/);
  });
});
