/**
 * Alarm plan A3: alarm requests in plain English and Taglish, offline. Every
 * change goes through a review card and is written only on Confirm; questions
 * are answered from local data. No network.
 */
import {initDatabase, alarmsStore, userStore} from '../../src/storage';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  confirmReviewedCommand,
  endReviewSession,
} from '../../src/ai/nlu/commandReview';
import type {CommandProposal} from '../../src/ai/nlu/commandReview';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {WEEKDAYS} from '../../src/scheduler/alarmSchedule';

/** Friday 13 Nov 2026, 10:00 local. */
const REF = new Date(2026, 10, 13, 10, 0, 0);
const TOMORROW = '2026-11-14';
const WEEKDAY_RULE = 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';

let ownerIndex = 0;
const owner = (): string => `alarm-lang-${++ownerIndex}`;
const parse = (text: string) => parseIntentFastPath(text, REF);
const send = (userId: string, text: string) =>
  chatOrchestrator.processMessage(userId, text, {referenceDate: REF});
const proposalOf = (
  result: Awaited<ReturnType<typeof send>>,
): CommandProposal => {
  if (result.review?.status !== 'proposal')
    throw new Error(`Expected a review card, got: ${result.reply}`);
  return result.review.proposal;
};

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
  endReviewSession();
});

describe('the parser reads alarm requests', () => {
  test.each([
    // [text, intent, time, rule, date, label]
    ['set an alarm for 6', 'create_alarm', '06:00', null, null, null],
    ['set my alarm for 6am', 'create_alarm', '06:00', null, null, null],
    ['set an alarm for 7pm', 'create_alarm', '19:00', null, null, null],
    ['wake me up at 6', 'create_alarm', '06:00', null, null, 'Wake up'],
    [
      'wake me up at 5:30 on weekdays',
      'create_alarm',
      '05:30',
      WEEKDAY_RULE,
      null,
      'Wake up',
    ],
    [
      'wake me up at 6 every day',
      'create_alarm',
      '06:00',
      'RRULE:FREQ=DAILY',
      null,
      'Wake up',
    ],
    [
      'set a 5:30 alarm every monday and wednesday',
      'create_alarm',
      '05:30',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
      null,
      null,
    ],
    [
      'set an alarm for 6:15 on mondays',
      'create_alarm',
      '06:15',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      null,
      null,
    ],
    [
      'set an alarm at 6 tomorrow for school',
      'create_alarm',
      '06:00',
      null,
      TOMORROW,
      'School',
    ],
    [
      'wake me up at 6 for my exam',
      'create_alarm',
      '06:00',
      null,
      null,
      'Exam',
    ],
    ['alarm at 7 tomorrow', 'create_alarm', '07:00', null, TOMORROW, null],
    [
      'hey lafina can you set an alarm for 5 am please',
      'create_alarm',
      '05:00',
      null,
      null,
      null,
    ],
    // Taglish
    [
      'gisingin mo ako ng 6 bukas',
      'create_alarm',
      '06:00',
      null,
      TOMORROW,
      'Wake up',
    ],
    [
      'alarm ko 5:30 tuwing weekdays',
      'create_alarm',
      '05:30',
      WEEKDAY_RULE,
      null,
      null,
    ],
    [
      'mag-alarm ka ng 6 araw-araw',
      'create_alarm',
      '06:00',
      'RRULE:FREQ=DAILY',
      null,
      null,
    ],
  ])('"%s"', (text, intent, time, rule, date, label) => {
    const parsed = parse(text);
    expect(parsed.intent).toBe(intent);
    expect(parsed.time).toBe(time);
    expect(parsed.recurrenceRule ?? null).toBe(rule);
    expect(parsed.date).toBe(date);
    expect(parsed.title).toBe(label);
  });

  test.each([
    ['turn off my 6am alarm', false, '06:00', null],
    ['turn my alarm off', false, null, null],
    ['disable the gym alarm', false, null, 'Gym'],
    ['turn on my wake up alarm', true, null, 'Wake up'],
    ['patayin mo yung alarm ko', false, null, null],
  ])('"%s" turns an alarm on or off', (text, on, targetTime, targetTitle) => {
    const parsed = parse(text);
    expect(parsed.intent).toBe('toggle_alarm');
    expect(parsed.alarmEnabled).toBe(on);
    expect(parsed.targetTime).toBe(targetTime);
    expect(parsed.targetTitle).toBe(targetTitle);
  });

  test('changes, deletes and questions', () => {
    expect(parse('change my 6am alarm to 6:30')).toMatchObject({
      intent: 'update_alarm',
      targetTime: '06:00',
      time: '06:30',
    });
    expect(parse('move my alarm to 7')).toMatchObject({
      intent: 'update_alarm',
      time: '07:00',
    });
    expect(parse('set my 6am alarm to weekdays')).toMatchObject({
      intent: 'update_alarm',
      targetTime: '06:00',
      recurrenceRule: WEEKDAY_RULE,
    });
    expect(parse('rename my 6am alarm to gym')).toMatchObject({
      intent: 'update_alarm',
      newTitle: 'Gym',
    });
    expect(parse('delete my 6 am alarm')).toMatchObject({
      intent: 'delete_alarm',
      targetTime: '06:00',
    });
    for (const q of [
      'what time is my alarm',
      'do i have an alarm tomorrow',
      'show my alarms',
    ])
      expect(parse(q).intent).toBe('list_alarms');
  });

  test('other requests that mention alarms stay what they were', () => {
    expect(parse('remind me to buy an alarm clock').intent).toBe(
      'create_reminder',
    );
    expect(parse('set a reminder to fix the alarm').intent).toBe(
      'create_reminder',
    );
  });
});

describe('review cards', () => {
  test('"wake me up at 6 on weekdays": one card, nothing saved until Confirm', async () => {
    const userId = owner();
    const proposal = proposalOf(
      await send(userId, 'wake me up at 6 on weekdays'),
    );
    expect(proposal.intent).toBe('create_alarm');
    expect(proposal.heading).toBe('Set alarm');
    expect(proposal.title).toBe('Wake up');
    expect(proposal.details.join(' ')).toMatch(/6:00 AM.*Weekdays/);
    expect(proposal.details.join(' ')).toContain('Rings in 2 d 20 h');
    expect(alarmsStore.list(userId)).toHaveLength(0);

    const confirmed = confirmReviewedCommand(userId, proposal.operationId);
    expect(confirmed.status).toBe('applied');
    const [alarm] = alarmsStore.list(userId);
    expect(alarm).toMatchObject({
      hour: 6,
      minute: 0,
      repeatDays: WEEKDAYS,
      label: 'Wake up',
      enabled: true,
    });
    expect(confirmed.reply).toBe('Alarm set for 6:00 AM (Weekdays, Wake up).');
  });

  test('a one-shot alarm whose hour has passed rings tomorrow, and says so', async () => {
    const userId = owner();
    const proposal = proposalOf(await send(userId, 'set an alarm for 6'));
    expect(proposal.assumptions.join(' ')).toContain(
      '6:00 AM has already passed today, so it rings tomorrow (Sat, Nov 14).',
    );
    confirmReviewedCommand(userId, proposal.operationId);
    expect(alarmsStore.list(userId)[0].oneShotDate).toBe(TOMORROW);
  });

  test('"set an alarm" without a time asks for one and changes nothing', async () => {
    const userId = owner();
    const result = await send(userId, 'set an alarm');
    expect(result.review?.status).not.toBe('proposal');
    expect(result.reply).toMatch(/What time should the alarm ring/);
    expect(alarmsStore.list(userId)).toHaveLength(0);
  });

  test('turn off, change and delete name the alarm by its time', async () => {
    const userId = owner();
    alarmsStore.create(userId, {hour: 6, minute: 0, repeatDays: WEEKDAYS});
    alarmsStore.create(userId, {hour: 7, minute: 30, label: 'Gym'});

    const off = proposalOf(await send(userId, 'turn off my 6am alarm'));
    expect(off.heading).toBe('Turn off alarm');
    expect(confirmReviewedCommand(userId, off.operationId).status).toBe(
      'applied',
    );
    const six = alarmsStore.list(userId).find(a => a.hour === 6);
    expect(six?.enabled).toBe(false);

    const change = proposalOf(await send(userId, 'change my gym alarm to 8'));
    expect(change.details.join(' ')).toContain('7:30 AM → 8:00 AM');
    confirmReviewedCommand(userId, change.operationId);
    expect(alarmsStore.list(userId).find(a => a.label === 'Gym')?.hour).toBe(8);

    const del = proposalOf(await send(userId, 'delete my 6 am alarm'));
    expect(del.destructive).toBe(true);
    confirmReviewedCommand(userId, del.operationId);
    expect(alarmsStore.list(userId).map(a => a.label)).toEqual(['Gym']);
  });

  test('two alarms and no time named: asks which, changes nothing', async () => {
    const userId = owner();
    alarmsStore.create(userId, {hour: 6, minute: 0});
    alarmsStore.create(userId, {hour: 7, minute: 0});
    const result = await send(userId, 'delete my alarm');
    expect(result.review?.status).toBe('clarify');
    expect(result.reply).toMatch(/Which alarm do you mean\?.*6:00 AM.*7:00 AM/);
    expect(alarmsStore.list(userId)).toHaveLength(2);
  });

  test('"turn my alarm off" picks the only alarm that is on', async () => {
    const userId = owner();
    alarmsStore.create(userId, {hour: 6, minute: 0});
    alarmsStore.create(userId, {hour: 7, minute: 0, enabled: false});
    const proposal = proposalOf(await send(userId, 'turn my alarm off'));
    expect(proposal.details.join(' ')).toContain('6:00 AM');
  });

  test('an alarm edited in the Alarms screen makes the card stale', async () => {
    const userId = owner();
    const alarm = alarmsStore.create(userId, {hour: 6, minute: 0});
    const proposal = proposalOf(await send(userId, 'turn off my 6am alarm'));
    alarmsStore.update(alarm.id, userId, {label: 'Edited'});
    const result = confirmReviewedCommand(userId, proposal.operationId);
    expect(result).toMatchObject({status: 'refused', reason: 'stale'});
    expect(alarmsStore.get(alarm.id, userId)?.enabled).toBe(true);
  });

  test('another owner’s alarm is never found', async () => {
    const other = owner();
    alarmsStore.create(other, {hour: 6, minute: 0});
    const userId = owner();
    const result = await send(userId, 'turn off my 6am alarm');
    expect(result.reply).toMatch(/don’t have any alarms yet/);
    expect(alarmsStore.list(other)[0].enabled).toBe(true);
  });

  test('"what time is my alarm" answers from local data', async () => {
    const userId = owner();
    alarmsStore.create(userId, {
      hour: 6,
      minute: 0,
      repeatDays: WEEKDAYS,
      label: 'Wake up',
    });
    const result = await send(userId, 'what time is my alarm');
    expect(result.reply).toBe(
      'Your next alarm is 6:00 AM (Weekdays, Wake up), in 2 d 20 h.',
    );
  });
});

describe('agent tools (ADR-033) for alarms', () => {
  const {
    validatePayload,
  } = require('../../src/ai/voiceActions/actionValidator');
  const {
    intentFromToolArguments,
    prepareStructuredReview,
  } = require('../../src/ai/voiceActions/structuredAction');
  const {
    STRUCTURED_ACTIONS,
  } = require('../../src/ai/voiceActions/actionRegistry');
  const {
    readLocalVoiceResult,
  } = require('../../src/cloud/voiceConversation/localVoiceData');

  test('the model may create or switch an alarm, never delete one', () => {
    expect(STRUCTURED_ACTIONS).toEqual(
      expect.arrayContaining(['create_alarm', 'toggle_alarm']),
    );
    expect(STRUCTURED_ACTIONS.some((a: string) => a.startsWith('delete'))).toBe(
      false,
    );
    expect(
      validatePayload('legacy.prepare_action', {
        request: 'turn it off',
        action: 'toggle_alarm',
        time: '06:00',
        enabled: 'no',
      }).valid,
    ).toBe(false);
    expect(validatePayload('legacy.read_data', {kind: 'alarms'}).valid).toBe(
      true,
    );
  });

  test('create_alarm fields become a card the student confirms', () => {
    const userId = owner();
    const result = prepareStructuredReview(
      userId,
      {
        request: 'set an alarm for that time',
        action: 'create_alarm',
        title: 'Exam day',
        time: '05:00',
        date: '2026-11-16',
      },
      'chat',
      REF,
    );
    expect(result?.status).toBe('proposal');
    expect(result.proposal.heading).toBe('Set alarm');
    expect(result.proposal.details.join(' ')).toContain('Mon, Nov 16');
    expect(alarmsStore.list(userId)).toHaveLength(0);
  });

  test('toggle_alarm needs on/off and a time or label', () => {
    expect(
      intentFromToolArguments({
        request: 'x',
        action: 'toggle_alarm',
        time: '06:00',
      }),
    ).toBeNull();
    expect(
      intentFromToolArguments({
        request: 'x',
        action: 'toggle_alarm',
        enabled: false,
      }),
    ).toBeNull();
    expect(
      intentFromToolArguments({
        request: 'turn that one off',
        action: 'toggle_alarm',
        title: 'Gym',
        enabled: false,
      }),
    ).toMatchObject({
      intent: 'toggle_alarm',
      targetTitle: 'Gym',
      alarmEnabled: false,
    });
  });

  test('read_lafina_data alarms: only this owner, labels treated as untrusted', () => {
    const userId = owner();
    alarmsStore.create(userId, {
      hour: 6,
      minute: 0,
      repeatDays: WEEKDAYS,
      label: 'Wake up',
    });
    alarmsStore.create(owner(), {hour: 9, minute: 0, label: 'Not mine'});
    const result = readLocalVoiceResult(userId, 'alarms', '');
    expect(result).toEqual({
      alarms: [
        {
          time: '6:00 AM',
          repeat: 'Weekdays',
          label: 'Wake up',
          on: true,
          rings: 'in 2 d 20 h',
        },
      ],
      partial: false,
      dataIsUntrusted: true,
    });
  });
});
