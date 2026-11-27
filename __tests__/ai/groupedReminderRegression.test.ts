import {splitGroupedClauses} from '../../src/ai/nlu/groupedClauses';
import {
  parseGroupedRequest,
  createMultiActionBatch,
  executeMultiActionBatch,
} from '../../src/ai/voiceActions/multiActionService';
import {validatePayload} from '../../src/ai/voiceActions/actionValidator';
import {
  isCompoundVoiceRequest,
  isExplicitSaveCommand,
} from '../../src/cloud/voiceConversation/turnPolicy';
import {db, initDatabase, userStore} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';

const REPORTED =
  'remind me to go walking tomorrow at 7am and then on monday 8am to go jogging';
const REF = new Date(2026, 10, 27, 3, 39);

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

test('the exact reported sentence has two reminders with independent titles, dates and times', () => {
  expect(isCompoundVoiceRequest(REPORTED)).toBe(true);
  const parsed = parseGroupedRequest(REPORTED, REF);
  expect(parsed.items).toHaveLength(2);
  expect(parsed.items[0]).toMatchObject({
    kind: 'reminder',
    title: 'Go walking',
    date: '2026-11-28',
    time: '07:00',
  });
  expect(parsed.items[1]).toMatchObject({
    kind: 'reminder',
    title: 'Go jogging',
    date: '2026-11-30',
    time: '08:00',
  });
});

test('the offline spoken-turn route returns the same two-item review without saving', async () => {
  const owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
  const reviewed = await chatOrchestrator.reviewSpokenTurn(owner, REPORTED, {
    onlineMode: false,
    referenceDate: REF,
    actionSessionId: 'offline-shared-verb-regression',
  });
  expect(reviewed.kind).toBe('multi');
  if (reviewed.kind !== 'multi') throw new Error('Expected grouped review');
  expect(reviewed.batch.items.map(i => [i.title, i.date, i.time])).toEqual([
    ['Go walking', '2026-11-28', '07:00'],
    ['Go jogging', '2026-11-30', '08:00'],
  ]);
  expect(reviewed.batch.items.every(i => i.status === 'draft')).toBe(true);
});

test.each([
  'remind me to go walking tomorrow at 7am and on monday 8am to go jogging',
  'remind me to go walking tomorrow at 7am, then on monday at 8am to go jogging',
  'Remind me to go walking tomorrow at 7 AM and then on Monday 8 AM to go jogging.',
])('shared reminder verb is retained: %s', text => {
  const parsed = parseGroupedRequest(text, REF);
  expect(parsed.items.map(i => [i.kind, i.title, i.date, i.time])).toEqual([
    ['reminder', 'Go walking', '2026-11-28', '07:00'],
    ['reminder', 'Go jogging', '2026-11-30', '08:00'],
  ]);
});

test('title conjunctions, quoted actions and trailing approval do not become extra tasks', () => {
  for (const text of [
    'remind me to buy bread and milk tomorrow at 7am',
    'remind me to buy bread, and milk tomorrow at 7am',
    'add task "Read and create diagrams" tomorrow',
    'add task "Read; create diagrams" tomorrow',
    "add task 'Read and create diagrams' tomorrow",
    'remind me to go walking tomorrow at 7am and save it',
  ]) {
    expect(splitGroupedClauses(text)).toHaveLength(1);
    expect(isCompoundVoiceRequest(text)).toBe(false);
  }
  expect(
    isCompoundVoiceRequest(
      'remind me to go walking tomorrow at 7am and save it',
    ),
  ).toBe(false);
});

test('a second explicit action has no invented date or time inherited from the first', () => {
  const parsed = parseGroupedRequest(
    'remind me to go walking tomorrow at 7am and remind me to go jogging',
    REF,
  );
  expect(parsed.items).toHaveLength(2);
  expect(parsed.items[1]).toMatchObject({
    kind: 'reminder',
    title: 'Go jogging',
  });
  expect(parsed.items[1].date).toBeUndefined();
  expect(parsed.items[1].time).toBeUndefined();
});

test('saving both is an approval, while a qualified save is not', () => {
  for (const text of [
    'save both',
    'save both reminders',
    'confirm all',
    'save both of them',
  ])
    expect(isExplicitSaveCommand(text)).toBe(true);
  expect(isExplicitSaveCommand('save both but change jogging to 9am')).toBe(
    false,
  );
});

test('structured grouped fields normalize optional nulls and accept a summary alongside items', () => {
  const checked = validatePayload('multi.prepare', {
    text: REPORTED,
    items: [
      {
        kind: 'reminder',
        title: 'Go walking',
        date: '2030-06-15',
        time: '07:00',
        endTime: null,
        priority: null,
        body: null,
      },
      {
        kind: 'reminder',
        title: 'Go jogging',
        date: '2030-06-17',
        time: '08:00',
        endTime: null,
      },
    ],
  });
  expect(checked).toEqual({
    valid: true,
    data: {
      items: [
        {
          kind: 'reminder',
          title: 'Go walking',
          date: '2030-06-15',
          time: '07:00',
        },
        {
          kind: 'reminder',
          title: 'Go jogging',
          date: '2030-06-17',
          time: '08:00',
        },
      ],
    },
  });
});

test.each([
  {kind: 'reminder', title: 'Jogging', date: '2030-02-30'},
  {kind: 'reminder', title: 'Jogging', time: '25:00'},
  {kind: 'reminder', title: null},
  {kind: 'reminder', title: 'Jogging', ownerId: null},
])('malformed grouped items stay rejected: %j', item => {
  expect(validatePayload('multi.prepare', {items: [item]}).valid).toBe(false);
});

test('both reminders persist once with separate schedules and transactional outbox entries', async () => {
  const owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
  const parsed = parseGroupedRequest(REPORTED, new Date(2030, 5, 14, 12));
  const batch = createMultiActionBatch(
    'shared-verb-regression',
    owner,
    parsed.items,
  );
  const before = db.executeSync('SELECT id FROM reminders WHERE user_id = ?', [
    owner,
  ]).rows.length;
  const saved = await executeMultiActionBatch(batch, owner);
  expect(saved.batch.status).toBe('saved');
  expect(saved.batch.items.every(i => i.status === 'saved')).toBe(true);
  const ids = saved.batch.items.map(i => i.savedEntityId);
  expect(new Set(ids).size).toBe(2);
  const rows = db.executeSync(
    'SELECT task, trigger_at FROM reminders WHERE id IN (?, ?)',
    ids as string[],
  ).rows;
  expect(rows.map(r => r.task).sort()).toEqual(['Go jogging', 'Go walking']);
  const times = rows
    .map(r => new Date(r.trigger_at as string).getHours())
    .sort();
  expect(times).toEqual([7, 8]);
  await executeMultiActionBatch(saved.batch, owner);
  expect(
    db.executeSync('SELECT id FROM reminders WHERE user_id = ?', [owner]).rows
      .length,
  ).toBe(before + 2);
  expect(
    db.executeSync(
      'SELECT entity_id FROM sync_outbox WHERE entity_type = ? AND entity_id IN (?, ?)',
      ['reminder', ...ids] as string[],
    ).rows,
  ).toHaveLength(2);
});
