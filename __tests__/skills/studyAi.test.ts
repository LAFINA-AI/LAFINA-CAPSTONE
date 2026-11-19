import {
  cardsFromSource,
  quizFromSource,
  STUDY_OFFLINE_MESSAGE,
} from '../../src/skills/studyAi';
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
