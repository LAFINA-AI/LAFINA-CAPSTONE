import {initDatabase} from '../../src/storage/dbInit';
import {db} from '../../src/storage/database';
import {tasksStore} from '../../src/storage/tasksStore';
import {timeBlocksStore} from '../../src/storage/timeBlocksStore';
import {validateIntent} from '../../src/ai/nlu/types';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {
  prepareReviewedCommand,
  reviseReviewedCommand,
  confirmReviewedCommand,
  endReviewSession,
} from '../../src/ai/nlu/commandReview';
import {
  hasDraftApproval,
  isCompoundVoiceRequest,
} from '../../src/cloud/voiceConversation/turnPolicy';
import {prepareStructuredReview} from '../../src/ai/voiceActions/structuredAction';

const owner = 'call-remediation-owner';
beforeAll(async () => {
  await initDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at) VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [owner, owner, 'call-remediation@example.invalid', now, now],
  );
});
afterEach(endReviewSession);

test.each([
  [
    'Yeah. I want you to set a schedule for capstone meeting tomorrow at 5 PM',
    'Capstone Meeting',
  ],
  [
    'Yeah, I want you to set a schedule for capstone meeting tomorrow at 5 PM',
    'Capstone Meeting',
  ],
])('legacy fallback strips conversational framing: %s', (request, title) => {
  expect(parseIntentFastPath(request).title).toBe(title);
});

test.each(['yes', 'okay', 'sure'])(
  'a bare %s answers only a save question',
  text => {
    expect(
      hasDraftApproval(text, 'Do you want to hear tomorrow’s schedule?'),
    ).toBe(false);
    expect(hasDraftApproval(text, 'Shall I save Capstone Meeting?')).toBe(true);
  },
);
test.each([
  'yes, but change it to tomorrow',
  'do not save it',
  'not yet',
  'maybe later',
  'yes, change the title',
])('qualified or negative approval cannot save: %s', text => {
  expect(hasDraftApproval(text, 'Shall I save this?')).toBe(false);
});
test('compound request is distinguished from a single title containing and', () => {
  expect(
    isCompoundVoiceRequest(
      'Add a meeting tomorrow at 5 PM and a reminder to submit slides Friday at 3 PM',
    ),
  ).toBe(true);
  expect(
    isCompoundVoiceRequest(
      'Add a task to review Research and Development tomorrow',
    ),
  ).toBe(false);
});

test('structured event needs a time rather than silently choosing nine', () => {
  expect(
    prepareStructuredReview(
      owner,
      {
        request: 'schedule capstone',
        action: 'create_event',
        title: 'Capstone Meeting',
      },
      'voice',
    ),
  ).toMatchObject({status: 'invalid'});
});

test('a time-only edit preserves recurring event location and type, and retires old approval', () => {
  const prepared = prepareReviewedCommand(
    owner,
    validateIntent({
      ...parseIntentFastPath(
        'Add an event Capstone Meeting on December 21 2030 at 3 PM',
      ),
      intent: 'create_time_block',
      targetEntityType: 'event',
      title: 'Capstone Meeting',
      date: '2030-12-21',
      time: '15:00',
      endTime: '16:00',
      location: 'Room 201',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=SA',
    }),
    {surface: 'voice'},
  );
  if (prepared.status !== 'proposal') throw new Error(prepared.reply);
  const revised = reviseReviewedCommand(
    owner,
    prepared.proposal.operationId,
    'Change it to 4 PM',
  );
  if (revised.status !== 'proposal') throw new Error(revised.reply);
  expect(revised.proposal.details.join(' ')).toContain('Room 201');
  expect(
    confirmReviewedCommand(owner, prepared.proposal.operationId).status,
  ).toBe('refused');
  expect(
    confirmReviewedCommand(owner, revised.proposal.operationId).status,
  ).toBe('applied');
  expect(
    tasksStore.getAllEvents(owner).find(e => e.title === 'Capstone Meeting'),
  ).toMatchObject({
    startTime: '16:00',
    endTime: '17:00',
    location: 'Room 201',
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=SA',
  });
});

test('question with a date leaves the original draft valid and unchanged', () => {
  const p = prepareStructuredReview(
    owner,
    {
      request: 'Add thesis review',
      action: 'create_task',
      title: 'Thesis review',
      date: '2030-12-21',
      time: '15:00',
      priority: 'high',
    },
    'voice',
  );
  if (p?.status !== 'proposal') throw new Error('No proposal');
  expect(
    reviseReviewedCommand(
      owner,
      p.proposal.operationId,
      'What is on my schedule tomorrow?',
    ).status,
  ).toBe('invalid');
  expect(confirmReviewedCommand(owner, p.proposal.operationId).status).toBe(
    'applied',
  );
  expect(
    tasksStore.getAllTasks(owner).find(t => t.title === 'Thesis review'),
  ).toMatchObject({dueDate: '2030-12-21', priority: 'High'});
});

test('time-only edit preserves high task priority', () => {
  const p = prepareStructuredReview(
    owner,
    {
      request: 'Add submit draft',
      action: 'create_task',
      title: 'Submit revised draft',
      date: '2030-12-21',
      time: '15:00',
      priority: 'high',
    },
    'voice',
  );
  if (p?.status !== 'proposal') throw new Error('No proposal');
  const r = reviseReviewedCommand(
    owner,
    p.proposal.operationId,
    'Change it to 4 PM',
  );
  if (r.status !== 'proposal') throw new Error(r.reply);
  expect(confirmReviewedCommand(owner, r.proposal.operationId).status).toBe(
    'applied',
  );
  expect(
    tasksStore.getAllTasks(owner).find(t => t.title === 'Submit revised draft'),
  ).toMatchObject({dueTime: '16:00', priority: 'High'});
});

test('time-only edit keeps a weekly time block recurring', () => {
  const p = prepareStructuredReview(
    owner,
    {
      request: 'Add weekly capstone work',
      action: 'create_time_block',
      title: 'Recurring capstone work',
      date: '2030-12-21',
      time: '15:00',
      endTime: '16:00',
      repeat: 'weekly:sa',
    },
    'voice',
  );
  if (p?.status !== 'proposal') throw new Error('No proposal');
  const r = reviseReviewedCommand(
    owner,
    p.proposal.operationId,
    'Change it to 4 PM',
  );
  if (r.status !== 'proposal') throw new Error(r.reply);
  expect(confirmReviewedCommand(owner, r.proposal.operationId).status).toBe(
    'applied',
  );
  expect(
    timeBlocksStore
      .getAll(owner)
      .find(b => b.title === 'Recurring capstone work'),
  ).toMatchObject({startTime: '16:00', recurrenceRule: 'FREQ=WEEKLY;BYDAY=SA'});
});
