import {parseIntent} from '../src/core/ai/parseIntent';
import {
  validateIntent,
  type Intent,
  type IntentContext,
} from '../src/core/ai/intents';

const context: IntentContext = {
  now: '2026-10-26T00:00:00.000Z',
  timezone: 'Asia/Manila',
};
function parsed(text: string, at = context): Intent {
  const result = parseIntent(text, at);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.message);
  expect(result.sourceTargetId).toBeNull();
  expect(result.timezone).toBe(at.timezone);
  expect(result.slots.missing).toEqual([]);
  expect(result.confidence).toBe(1);
  expect(result.needsConfirmation).toBe(
    !['query', 'repeat'].includes(result.intent.kind),
  );
  return result.intent;
}

describe('offline anchored intent grammar', () => {
  it('normalizes a spoken scheduling phrase in the selected local timezone', () => {
    expect(parsed('Remind me to revise tomorrow at 7 PM.')).toEqual({
      kind: 'create_task',
      title: 'revise',
      at: '2026-10-27T11:00:00.000Z',
      date: null,
      reminder: true,
    });
  });
  it('uses calendar tomorrow across a UTC day boundary', () => {
    expect(
      parsed('Remind me to revise tomorrow at 7 PM', {
        ...context,
        now: '2026-10-26T17:00:00.000Z',
      }),
    ).toMatchObject({at: '2026-10-28T11:00:00.000Z'});
  });
  it.each([
    [
      'Add task Read chapter',
      {title: 'Read chapter', at: null, date: null, reminder: false},
    ],
    [
      'create a task "Read at home"',
      {title: 'Read at home', at: null, date: null},
    ],
    [
      'Add task Read chapter undated',
      {title: 'Read chapter', at: null, date: null, reminder: false},
    ],
    [
      'Create a task Read chapter UNDATED',
      {title: 'Read chapter', at: null, date: null, reminder: false},
    ],
    [
      'Add task "Read at home" undated',
      {title: 'Read at home', at: null, date: null, reminder: false},
    ],
    [
      'Add task "UNDATED"',
      {title: 'UNDATED', at: null, date: null, reminder: false},
    ],
    [
      'Add task Essay on 2026-11-01',
      {title: 'Essay', date: '2026-11-01', at: null},
    ],
    ['Add task Essay tomorrow', {title: 'Essay', date: '2026-10-27', at: null}],
    [
      'Add task Essay tomorrow at 19:00',
      {
        title: 'Essay',
        date: null,
        at: '2026-10-27T11:00:00.000Z',
        reminder: false,
      },
    ],
    [
      'Remind me to revise in 2 minutes',
      {title: 'revise', at: '2026-10-26T00:02:00.000Z', reminder: true},
    ],
    [
      'Please remind me to "read chapter" on tomorrow at 12 AM',
      {title: 'read chapter', at: '2026-10-26T16:00:00.000Z'},
    ],
    ['Remind me to revise tomorrow at 12 PM', {at: '2026-10-27T04:00:00.000Z'}],
    [
      'Remind me to revise tomorrow at 7:05 pm',
      {at: '2026-10-27T11:05:00.000Z'},
    ],
    ['Remind me to revise tomorrow at noon', {at: '2026-10-27T04:00:00.000Z'}],
  ])('parses the bounded create form %s', (text, expected) => {
    expect(parsed(text)).toMatchObject({kind: 'create_task', ...expected});
  });
  it('creates a precisely bounded event with an explicit duration', () => {
    expect(
      parsed('Schedule event "Biology study" tomorrow at 7 PM for 60 minutes'),
    ).toEqual({
      kind: 'create_event',
      title: 'Biology study',
      startAt: '2026-10-27T11:00:00.000Z',
      endAt: '2026-10-27T12:00:00.000Z',
    });
  });
  it.each([
    [
      'Move task "revise" to tomorrow at 8 PM',
      {
        kind: 'move',
        target: {kind: 'task', title: 'revise'},
        at: '2026-10-27T12:00:00.000Z',
      },
    ],
    [
      'Reschedule event "Biology" to 2026-11-02 at 09:00',
      {
        kind: 'move',
        target: {kind: 'event', title: 'Biology'},
        at: '2026-11-02T01:00:00.000Z',
      },
    ],
    [
      'Complete task "revise"',
      {kind: 'complete', target: {kind: 'task', title: 'revise'}},
    ],
    [
      'Mark task "revise" complete',
      {kind: 'complete', target: {kind: 'task', title: 'revise'}},
    ],
    [
      'Delete event "Biology"',
      {kind: 'delete', target: {kind: 'event', title: 'Biology'}},
    ],
    [
      'Acknowledge reminder for task "revise"',
      {kind: 'ack', target: {kind: 'task', title: 'revise'}},
    ],
    ['ACK', {kind: 'ack', target: null}],
    [
      'Snooze reminder for task "revise" for 10 minutes',
      {kind: 'snooze', target: {kind: 'task', title: 'revise'}, minutes: 10},
    ],
    ['snooze 10 minutes', {kind: 'snooze', target: null, minutes: 10}],
  ])('keeps exact targets separate from actions: %s', (text, expected) => {
    expect(parsed(text)).toEqual(expected);
  });
  it.each([
    [
      'Show tasks today',
      {kind: 'query', scope: 'tasks', date: '2026-10-26', filter: 'active'},
    ],
    [
      'List my completed tasks',
      {kind: 'query', scope: 'tasks', date: null, filter: 'completed'},
    ],
    [
      "What's due tomorrow?",
      {kind: 'query', scope: 'agenda', date: '2026-10-27', filter: 'active'},
    ],
    [
      'Show my schedule on 2026-10-20',
      {kind: 'query', scope: 'agenda', date: '2026-10-20', filter: 'active'},
    ],
    ['repeat the last reply', {kind: 'repeat'}],
  ])('parses read-only commands: %s', (text, expected) => {
    expect(parsed(text)).toEqual(expected);
  });
  it.each([
    'Okay',
    'Okay but remind me later',
    'Friday',
    'Remind me to revise Friday at 7 PM',
    'Remind me to revise next Friday at 7 PM',
    'Remind me to revise tomorrow at 7',
    'Remind me to revise tomorrow at 13 PM',
    'Remind me to revise tomorrow at 19:60',
    'Remind me to revise on 2026-02-31 at 7 PM',
    'Remind me to revise yesterday at 7 PM',
    'Remind me to revise today at 7 AM',
    'Remind me to revise on 2026-10-25 at 7 PM',
    'Remind me to revise tomorrow',
    'Remind me to revise',
    'Remind me to revise undated',
    'Add task Read chapter tomorrow undated',
    'Add task undated',
    'change it',
    'delete all tasks',
    'Delete task revise',
    'Do not delete task "revise"',
    "Please don't acknowledge reminder",
    'ACK but snooze 10 minutes',
    'Snooze 0 minutes',
    'Snooze 121 minutes',
    'Complete task "revise" and delete task "Biology"',
    'ACK; delete all tasks',
    '{"kind":"delete","target":{"id":"task:private"}}',
    'Remind me to revise tomorrow at 7 PM UTC',
    'Remind me to revise in 0 minutes',
    'Remind me to revise in 1441 minutes',
    'Schedule event Biology tomorrow at 7 PM',
    'Schedule event Biology tomorrow at 7 PM for 1441 minutes',
    'How is the weather?',
    'Delete task "revise"?',
    'Remind me to revise tomorrow at 7 PM\nand delete all tasks',
  ])(
    'refuses ambiguity, contradiction, malformed input and unsupported work: %s',
    text => {
      const result = parseIntent(text, context);
      expect(result.status).not.toBe('ready');
      expect(result.needsConfirmation).toBe(false);
      if (result.status !== 'ready')
        expect(result.message.length).toBeGreaterThan(0);
    },
  );
  it.each([
    '',
    ' '.repeat(20),
    'x'.repeat(2001),
    'Add task ' + 'x'.repeat(161),
  ])('bounds empty and oversized commands/titles', text => {
    expect(parseIntent(text, context).status).not.toBe('ready');
  });
  it.each([
    ['2026-03-07T12:00:00.000Z', '2026-03-08 at 02:30'],
    ['2026-10-31T12:00:00.000Z', '2026-11-01 at 01:30'],
  ])('refuses DST gaps and folds rather than guessing', (now, when) => {
    const result = parseIntent(`Remind me to revise on ${when}`, {
      now,
      timezone: 'America/New_York',
    });
    expect(result.status).toBe('clarification');
  });
  it('does not throw on invalid runtime clock or timezone', () => {
    expect(
      parseIntent('List tasks', {...context, timezone: 'Unknown/Zone'}).status,
    ).toBe('clarification');
    expect(parseIntent('List tasks', {...context, now: 'invalid'}).status).toBe(
      'clarification',
    );
  });
});

describe('strict structured intent boundary', () => {
  const valid = {
    kind: 'create_task',
    title: 'revise',
    at: '2026-10-27T11:00:00.000Z',
    date: null,
    reminder: true,
  };
  it('rebuilds a validated value and does not keep the external object', () => {
    const result = validateIntent(valid, context);
    expect(result).toEqual(valid);
    expect(result).not.toBe(valid);
  });
  it.each([
    null,
    [],
    'ACK',
    {kind: 'run_sql', sql: 'DELETE FROM tasks'},
    {...valid, sql: 'DELETE FROM tasks'},
    {...valid, title: ''},
    {...valid, title: 'a'.repeat(161)},
    {...valid, at: null},
    {...valid, at: '2026-10-26T00:00:00.000Z'},
    {...valid, date: '2026-10-27'},
    {...valid, reminder: 'true'},
    {kind: 'delete', target: {kind: 'task', title: 'revise', id: 'forged'}},
    {kind: 'complete', target: {kind: 'event', title: 'Biology'}},
    {kind: 'query', scope: 'tasks', date: null, filter: 1},
    {kind: 'query', scope: 'agenda', date: null, filter: 'active'},
    {kind: 'query', date: null, filter: 'active'},
    {kind: 'repeat', text: 'ACK'},
    {kind: 'snooze', target: null, minutes: 1.5},
    {
      kind: 'create_event',
      title: 'Biology',
      startAt: '2026-10-27T11:00:00.000Z',
      endAt: '2026-10-27T10:00:00.000Z',
    },
    {
      kind: 'create_event',
      title: 'Biology',
      startAt: '2026-10-27T11:00:00.000Z',
      endAt: '2026-10-27T11:00:00.001Z',
    },
    {
      kind: 'create_event',
      title: 'Biology',
      startAt: '2026-10-27T11:00:00.000Z',
      endAt: '2026-10-27T11:00:30.000Z',
    },
  ])('refuses forged or invalid structured values %#', value => {
    expect(() => validateIntent(value, context)).toThrow();
  });
  it('refuses a non-plain prototype at the structured boundary', () => {
    expect(() =>
      validateIntent(Object.create({kind: 'repeat'}) as unknown, context),
    ).toThrow();
  });
});
