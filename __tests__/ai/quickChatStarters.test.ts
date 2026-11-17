/**
 * Floating LAFINA (J-15, FLOAT-05): every quick-action chip's starter,
 * completed the way a student would type it, reaches the intended intent in
 * the existing fast-path parser. A chip whose starter the parser does not
 * understand must not ship.
 */
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {initDatabase, userStore} from '../../src/storage';
import {endReviewSession} from '../../src/ai/nlu/commandReview';
import {quickChatController} from '../../src/ai/quickChat/quickChatController';
import {QUICK_CHAT_STARTERS} from '../../src/ui/quickChat/quickChatStarters';

/**
 * "Schedule" means a timed item on the planner. The fast parser picks the
 * kind (event, study block or timed task); the review pipeline then decides
 * the card, as the end-to-end case below shows.
 */
const SCHEDULE_INTENTS = ['create_event', 'create_time_block', 'create_task'];

/** Wednesday 18 Nov 2026, 10:00 local. */
const REF = new Date(2026, 10, 18, 10, 0, 0);

const starter = (id: string): string => {
  const found = QUICK_CHAT_STARTERS.find(item => item.id === id);
  if (!found) throw new Error(`missing starter ${id}`);
  return found.starter;
};

const cases: Array<{id: string; completion: string; intents: string[]}> = [
  {
    id: 'schedule',
    completion: 'my networking exam this Friday at 9 AM',
    intents: SCHEDULE_INTENTS,
  },
  {
    id: 'schedule',
    completion: 'group study on Saturday at 2 PM',
    intents: SCHEDULE_INTENTS,
  },
  {
    id: 'reminder',
    completion: 'submit the lab report tomorrow at 8 PM',
    intents: ['create_reminder'],
  },
  {
    id: 'reminder',
    completion: 'call mom at 5 PM',
    intents: ['create_reminder'],
  },
  {
    id: 'note',
    completion: 'bring the lab manual on Thursday',
    intents: ['create_note'],
  },
  {
    id: 'note',
    completion: 'chapter 4 covers sorting algorithms',
    intents: ['create_note'],
  },
];

test('there are exactly the three chips from the UX spec', () => {
  expect(QUICK_CHAT_STARTERS.map(item => item.label)).toEqual([
    'Schedule',
    'Reminder',
    'Note',
  ]);
});

test.each(cases)('$id: "$completion"', ({id, completion, intents}) => {
  const text = `${starter(id)}${completion}`;
  expect(intents).toContain(parseIntentFastPath(text, REF).intent);
});

test('the schedule starter keeps the date and time', () => {
  const parsed = parseIntentFastPath(
    `${starter('schedule')}my networking exam this Friday at 9 AM`,
    REF,
  );
  expect(parsed.date).toBe('2026-11-20');
  expect(parsed.time).toBe('09:00');
});

test('end to end: the schedule chip plus the brief example gives a "Create event" card', async () => {
  await initDatabase();
  const userId = userStore.createGuestUser().id;
  endReviewSession();
  quickChatController.resetForTests();
  const sent = await quickChatController.send(
    userId,
    `${starter('schedule')}my networking exam this Friday at 9 AM`,
    {referenceDate: REF},
  );
  expect(sent.status).toBe('done');
  if (sent.status !== 'done') return;
  expect(sent.result.review?.status).toBe('proposal');
  if (sent.result.review?.status !== 'proposal') return;
  expect(sent.result.review.proposal.heading).toBe('Create event');
  quickChatController.resetForTests();
  endReviewSession();
});
