import {
  cardsFromSource,
  condenseSourceForBudget,
  quizFromSource,
  STUDY_CANCELLED_MESSAGE,
  STUDY_OFFLINE_MESSAGE,
  studyReply,
  verifyQuoteAgainstSource,
} from '../../src/skills/studyAi';
import * as personalization from '../../src/ai/personalization';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';

beforeAll(async () => {
  await initDatabase();
});
afterEach(() => jest.restoreAllMocks());
const setup = () => {
  db.executeSync('DELETE FROM active_session');
  const user = userStore.createGuestUser();
  userStore.setCurrentUser(user.id);
  localSettingsStore.set(user.id, 'chat.onlineMode', 'true');
  return user.id;
};
test('offline preference prevents a network request and explains the existing online requirement', async () => {
  const owner = setup();
  localSettingsStore.set(owner, 'chat.onlineMode', 'false');
  const spy = jest.spyOn(onlineChatSkill, 'sendChatMessage');
  await expect(cardsFromSource(owner, 'Actual source')).rejects.toThrow(
    STUDY_OFFLINE_MESSAGE,
  );
  expect(spy).not.toHaveBeenCalled();
});
test('manual-source AI cards are validated and start due now', async () => {
  const owner = setup();
  jest.spyOn(onlineChatSkill, 'sendChatMessage').mockResolvedValue({
    status: 'success',
    data: {
      reply:
        '```json\n{"cards":[{"question":"What is the source?","answer":"The source is supplied by the student."}]}\n```',
      sources: [],
      usedHandbook: false,
    },
  });
  const now = Date.now();
  const cards = await cardsFromSource(
    owner,
    'The source is supplied by the student.',
  );
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({intervalDays: 0, ease: 2.5, reviews: 0});
  expect(cards[0].dueAt).toBeGreaterThanOrEqual(now);
});
test('malformed AI output never becomes a saved deck', async () => {
  const owner = setup();
  jest.spyOn(onlineChatSkill, 'sendChatMessage').mockResolvedValue({
    status: 'success',
    data: {
      reply: '{"cards":[{"question":"Q"}]}',
      sources: [],
      usedHandbook: false,
    },
  });
  await expect(cardsFromSource(owner, 'source')).rejects.toThrow(
    'incomplete card',
  );
});
test('quiz requires verifiable source quotes and the exact requested question count', async () => {
  const owner = setup();
  const question = {
    question: 'Which?',
    options: ['Yes', 'No'],
    correct: 0,
    explanation: 'The source says so.',
    source: 'source says yes',
  };
  const spy = jest.spyOn(onlineChatSkill, 'sendChatMessage').mockResolvedValue({
    status: 'success',
    data: {
      reply: JSON.stringify({questions: [question]}),
      sources: [],
      usedHandbook: false,
    },
  });
  expect(
    await quizFromSource(owner, 'The source says yes.', 1, 'True / False'),
  ).toEqual([question]);
  spy.mockResolvedValue({
    status: 'success',
    data: {
      reply: JSON.stringify({
        questions: [{...question, source: 'invented quote'}],
      }),
      sources: [],
      usedHandbook: false,
    },
  });
  await expect(
    quizFromSource(owner, 'The source says yes.', 1, 'True / False'),
  ).rejects.toThrow('could not be verified');
  await expect(
    quizFromSource(owner, 'The source says yes.', 5, 'True / False'),
  ).rejects.toThrow('incomplete quiz');
});
test('quiz quote verifier tolerates Markdown, smart punctuation, and ligatures', async () => {
  const owner = setup();
  const source =
    'In **physics**, ﬂuid dynamics states: “energy stays conserved” — even under load.';
  const question = {
    question: 'What does fluid dynamics state?',
    options: [
      'Energy stays conserved',
      'Energy vanishes',
      'Mass doubles',
      'Entropy reverses',
    ],
    correct: 0,
    explanation: 'Directly stated in the passage.',
    source: 'fluid dynamics states: "energy stays conserved" - even under load',
  };
  jest.spyOn(onlineChatSkill, 'sendChatMessage').mockResolvedValue({
    status: 'success',
    data: {
      reply: JSON.stringify({questions: [question]}),
      sources: [],
      usedHandbook: false,
    },
  });
  await expect(
    quizFromSource(owner, source, 1, 'Multiple choice'),
  ).resolves.toEqual([question]);
});
test('quiz generation batches large counts into <=5 question requests and combines results', async () => {
  const owner = setup();
  const source =
    'Mitochondria convert nutrients into ATP molecules inside cells.';
  let callIndex = 0;
  const spy = jest
    .spyOn(onlineChatSkill, 'sendChatMessage')
    .mockImplementation(async () => {
      callIndex += 1;
      const items = Array.from({length: 5}, (_, idx) => ({
        question: `Question ${callIndex}-${idx + 1}?`,
        options: ['ATP', 'DNA', 'RNA', 'GTP'],
        correct: 0,
        explanation: 'Backed by source.',
        source: 'Mitochondria convert nutrients into ATP molecules',
      }));
      return {
        status: 'success',
        data: {
          reply: JSON.stringify({questions: items}),
          sources: [],
          usedHandbook: false,
        },
      };
    });
  const quiz = await quizFromSource(owner, source, 10, 'Multiple choice');
  expect(spy).toHaveBeenCalledTimes(2);
  expect(quiz).toHaveLength(10);
});
test('flashcard generation chunks oversized sources and deduplicates repeated questions', async () => {
  const owner = setup();
  const paragraphA =
    'Cellular respiration breaks down glucose into pyruvate. '.repeat(80);
  const paragraphB =
    'Calvin cycle fixes carbon dioxide in stroma reactions. '.repeat(80);
  const longSource = `${paragraphA}\n\n${paragraphB}`;
  let callIndex = 0;
  const spy = jest
    .spyOn(onlineChatSkill, 'sendChatMessage')
    .mockImplementation(async () => {
      callIndex += 1;
      return {
        status: 'success',
        data: {
          reply: JSON.stringify({
            cards: [
              {question: 'Duplicate Q', answer: 'First answer.'},
              {
                question: `Unique Q ${callIndex}`,
                answer: `Answer ${callIndex}.`,
              },
            ],
          }),
          sources: [],
          usedHandbook: false,
        },
      };
    });
  const cards = await cardsFromSource(owner, longSource, 6);
  expect(spy.mock.calls.length).toBeGreaterThan(1);
  expect(cards.filter(c => c.question === 'Duplicate Q')).toHaveLength(1);
  expect(cards.length).toBeLessThanOrEqual(6);
});
test('cardsFromSource handles null JSON, direct array, Unicode/math dedupe, trailing empty chunks, progress, and cancellation', async () => {
  const owner = setup();
  const spy = jest.spyOn(onlineChatSkill, 'sendChatMessage');

  spy.mockResolvedValueOnce({
    status: 'success',
    data: {reply: 'null', sources: [], usedHandbook: false},
  });
  await expect(cardsFromSource(owner, 'Valid source text')).rejects.toThrow(
    'invalid deck',
  );

  spy.mockResolvedValueOnce({
    status: 'success',
    data: {
      reply: JSON.stringify([
        {question: 'x^2 + y^2 = z^2?', answer: 'Pythagoras'},
        {question: 'a^2 + b^2 = c^2?', answer: 'Same formula letters'},
        {question: 'こんにちは？', answer: 'Hello'},
        {question: 'さようなら？', answer: 'Goodbye'},
        {question: 'Duplicate Q', answer: 'One'},
        {question: 'duplicate q?', answer: 'Two'},
      ]),
      sources: [],
      usedHandbook: false,
    },
  });
  const unicodeCards = await cardsFromSource(owner, 'Math and greetings', 10);
  expect(unicodeCards.map(c => c.question)).toEqual([
    'x^2 + y^2 = z^2?',
    'a^2 + b^2 = c^2?',
    'こんにちは？',
    'さようなら？',
    'Duplicate Q',
  ]);

  const chunkA = 'First topic sentence for chunk one. '.repeat(90);
  const chunkB = 'Second topic bibliography page. '.repeat(90);
  const multiSource = `${chunkA}\n\n${chunkB}`;
  const progressCalls: Array<[number, number]> = [];
  let multiIdx = 0;
  spy.mockImplementation(async () => {
    multiIdx += 1;
    if (multiIdx === 1) {
      return {
        status: 'success',
        data: {
          reply: JSON.stringify({
            cards: [
              {question: 'Q1', answer: 'A1'},
              {question: 'Q2', answer: 'A2'},
              {question: 'Q3', answer: 'A3'},
              {question: 'Q4', answer: 'A4'},
            ],
          }),
          sources: [],
          usedHandbook: false,
        },
      };
    }
    return {
      status: 'success',
      data: {
        reply: JSON.stringify({cards: []}),
        sources: [],
        usedHandbook: false,
      },
    };
  });
  const boundedCards = await cardsFromSource(owner, multiSource, 3, {
    onProgress: (done, total) => progressCalls.push([done, total]),
  });
  expect(boundedCards).toHaveLength(3);
  expect(progressCalls).toEqual([
    [1, 2],
    [2, 2],
  ]);

  spy.mockClear();
  let cancelled = false;
  spy.mockImplementationOnce(async () => {
    cancelled = true;
    return {
      status: 'success',
      data: {
        reply: JSON.stringify({cards: [{question: 'Q1', answer: 'A1'}]}),
        sources: [],
        usedHandbook: false,
      },
    };
  });
  const abortedCards = await cardsFromSource(owner, multiSource, 6, {
    isCancelled: () => cancelled,
  });
  expect(abortedCards).toEqual([]);
  expect(spy).toHaveBeenCalledTimes(1);
});

test('verifyQuoteAgainstSource rejects trivial stop-words and accepts Unicode and math quotes', () => {
  const prose =
    'The quick brown fox jumps over the lazy dog near the quiet river bank.';
  expect(verifyQuoteAgainstSource(prose, 'the')).toBe(false);
  expect(verifyQuoteAgainstSource(prose, 'a')).toBe(false);
  expect(verifyQuoteAgainstSource(prose, 'quick brown fox jumps')).toBe(true);

  const filipinoAndMath =
    'Si José Rizal ay sumulat sa Espanyol; para sa parabola, f(x) = x^2 + 1 kapag x >= 0.';
  expect(
    verifyQuoteAgainstSource(filipinoAndMath, 'José Rizal ay sumulat'),
  ).toBe(true);
  expect(
    verifyQuoteAgainstSource(filipinoAndMath, 'f(x) = x^2 + 1 kapag x >= 0'),
  ).toBe(true);
});

test('quizFromSource distributes batches across chunks, avoids repeats, and retries partial deficits', async () => {
  const owner = setup();
  const chunk1 = 'Alpha chunk discusses TCP congestion windows. '.repeat(80);
  const chunk2 = 'Beta chunk explains UDP datagram headers. '.repeat(80);
  const multiSource = `${chunk1}\n\n${chunk2}`;

  const sentBodies: string[] = [];
  let batch = 0;
  jest
    .spyOn(onlineChatSkill, 'sendChatMessage')
    .mockImplementation(async messages => {
      batch += 1;
      sentBodies.push(messages[0].content);
      if (batch === 1) {
        return {
          status: 'success',
          data: {
            reply: JSON.stringify({
              questions: [
                {
                  question: 'What does Alpha chunk discuss?',
                  options: ['TCP congestion', 'DNS', 'SMTP', 'ARP'],
                  correct: 0,
                  explanation: 'From Alpha.',
                  source: 'Alpha chunk discusses TCP congestion windows',
                },
                {
                  question: 'Which protocol is in Alpha?',
                  options: ['TCP', 'ICMP', 'FTP', 'SSH'],
                  correct: 0,
                  explanation: 'From Alpha.',
                  source: 'Alpha chunk discusses TCP congestion windows',
                },
              ],
            }),
            sources: [],
            usedHandbook: false,
          },
        };
      }
      if (batch === 2) {
        // Deliberately repeat Q1 + provide only 2 of 3 new items -> triggers fill-in retry
        return {
          status: 'success',
          data: {
            reply: JSON.stringify({
              questions: [
                {
                  question: 'What does Alpha chunk discuss?',
                  options: ['TCP congestion', 'DNS', 'SMTP', 'ARP'],
                  correct: 0,
                  explanation: 'Duplicate.',
                  source: 'Alpha chunk discusses TCP congestion windows',
                },
                {
                  question: 'What does Beta chunk explain?',
                  options: ['UDP datagrams', 'TLS', 'BGP', 'SNMP'],
                  correct: 0,
                  explanation: 'From Beta.',
                  source: 'Beta chunk explains UDP datagram headers',
                },
              ],
            }),
            sources: [],
            usedHandbook: false,
          },
        };
      }
      return {
        status: 'success',
        data: {
          reply: JSON.stringify({
            questions: [
              {
                question: 'Which header appears in Beta?',
                options: ['UDP datagram', 'TCP syn', 'ARP frame', 'DNS txt'],
                correct: 0,
                explanation: 'From Beta.',
                source: 'Beta chunk explains UDP datagram headers',
              },
              {
                question: 'Is UDP covered in Beta?',
                options: ['True', 'False'],
                correct: 0,
                explanation: 'From Beta.',
                source: 'Beta chunk explains UDP datagram headers',
              },
            ],
          }),
          sources: [],
          usedHandbook: false,
        },
      };
    });

  const progressEvents: number[] = [];
  const quiz = await quizFromSource(owner, multiSource, 5, 'Mixed', {
    onProgress: info => progressEvents.push(info.collected),
  });
  expect(quiz).toHaveLength(5);
  expect(sentBodies[0]).toContain('TCP congestion windows');
  expect(sentBodies[1]).toContain('UDP datagram headers');
  expect(sentBodies[1]).toContain('Avoid repeating');
  expect(progressEvents.length).toBeGreaterThanOrEqual(4);
});

test('quizFromSource supports allowPartial, prefix stripping, duplicate-option rejection, shuffleOptions, jsonOnly, and cancellation', async () => {
  const owner = setup();
  jest
    .spyOn(personalization, 'replyPreferenceInstruction')
    .mockReturnValue(
      '[Reply settings chosen by the student (formatting preference only): use a friendly tone.]',
    );

  const spy = jest.spyOn(onlineChatSkill, 'sendChatMessage');
  spy.mockResolvedValueOnce({
    status: 'success',
    data: {reply: 'Summary text.', sources: [], usedHandbook: false},
  });
  await studyReply(owner, 'Summarize', 'Source body for summary.');
  expect(spy.mock.calls[0][0][0].content).toContain('use a friendly tone');

  spy.mockClear();
  const source =
    'IaaS lets you manage virtual machines while SaaS delivers ready software over the internet.';
  spy
    .mockResolvedValueOnce({
      status: 'success',
      data: {
        reply: JSON.stringify({
          questions: [
            {
              question: 'Which model provides VMs?',
              options: ['A. IaaS', 'B. SaaS', 'C. PaaS', 'D. On-prem'],
              correct: 0,
              explanation: 'IaaS manages VMs.',
              source: 'IaaS lets you manage virtual machines',
            },
            {
              question: 'Invalid duplicate option question?',
              options: ['Same', 'same', 'Other', 'Another'],
              correct: 0,
              explanation: 'Invalid options.',
              source: 'IaaS lets you manage virtual machines',
            },
          ],
        }),
        sources: [],
        usedHandbook: false,
      },
    })
    .mockResolvedValueOnce({
      status: 'success',
      data: {
        reply: JSON.stringify({questions: []}),
        sources: [],
        usedHandbook: false,
      },
    });

  const partial = await quizFromSource(owner, source, 2, 'Multiple choice', {
    shuffleOptions: true,
    allowPartial: true,
  });
  expect(spy.mock.calls[0][0][0].content).not.toContain('use a friendly tone');
  expect(partial).toHaveLength(1);
  expect(partial[0].options.slice().sort()).toEqual([
    'IaaS',
    'On-prem',
    'PaaS',
    'SaaS',
  ]);
  expect(partial[0].options[partial[0].correct]).toBe('IaaS');

  let cancelled = false;
  spy.mockImplementationOnce(async () => {
    cancelled = true;
    return {
      status: 'success',
      data: {
        reply: JSON.stringify({
          questions: [
            {
              question: 'Q1?',
              options: ['True', 'False'],
              correct: 0,
              explanation: 'Exp.',
              source: 'IaaS lets you manage virtual machines',
            },
          ],
        }),
        sources: [],
        usedHandbook: false,
      },
    };
  });
  await expect(
    quizFromSource(owner, source, 2, 'True / False', {
      isCancelled: () => cancelled,
    }),
  ).rejects.toThrow('cancelled');
});

test('condenseSourceForBudget leaves short text alone and fits long text in the budget', async () => {
  const owner = setup();
  const spy = jest.spyOn(onlineChatSkill, 'sendChatMessage');
  await expect(condenseSourceForBudget(owner, ' short notes ', 2000)).resolves.toBe(
    'short notes',
  );
  expect(spy).not.toHaveBeenCalled();

  spy.mockImplementation(async messages => ({
    status: 'success',
    data: {
      reply: messages[0].content.includes('Condense these study notes')
        ? 'Final condensed notes.'
        : 'n'.repeat(900),
      sources: [],
      usedHandbook: false,
    },
  }));
  const long = 'Process scheduling decides which process runs next. '.repeat(200);
  const progress: Array<[number, number]> = [];
  const condensed = await condenseSourceForBudget(owner, long, 1200, {
    onProgress: (done, total) => progress.push([done, total]),
  });
  // Every part was condensed (none skipped), then the joined notes were
  // condensed once more because they were still over budget.
  const parts = progress[progress.length - 1][1];
  expect(parts).toBeGreaterThan(1);
  expect(progress.map(p => p[0])).toEqual(
    Array.from({length: parts}, (_, i) => i + 1),
  );
  expect(spy).toHaveBeenCalledTimes(parts + 1);
  expect(condensed).toBe('Final condensed notes.');
  expect(condensed.length).toBeLessThanOrEqual(1200);
});

test('cancel aborts the online request itself and stops further requests', async () => {
  const owner = setup();
  const controller = new AbortController();
  const seenSignals: Array<AbortSignal | undefined> = [];
  const spy = jest
    .spyOn(onlineChatSkill, 'sendChatMessage')
    .mockImplementation(async (_messages, options) => {
      seenSignals.push(options?.signal);
      controller.abort();
      return {status: 'server_unavailable', error: 'cancelled'};
    });
  await expect(
    cardsFromSource(owner, 'Mitochondria make ATP. '.repeat(400), 12, {
      signal: controller.signal,
    }),
  ).rejects.toThrow(STUDY_CANCELLED_MESSAGE);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(seenSignals[0]).toBe(controller.signal);

  spy.mockClear();
  await expect(
    quizFromSource(owner, 'Mitochondria make ATP. '.repeat(50), 5, 'Multiple choice', {
      signal: controller.signal,
    }),
  ).rejects.toThrow(STUDY_CANCELLED_MESSAGE);
  expect(spy).not.toHaveBeenCalled();
});
