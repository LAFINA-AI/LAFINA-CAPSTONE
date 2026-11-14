import {
  extractNotifyOnlyRequest,
  parseIntentFastPath,
} from '../../src/ai/nlu/fastPathParser';

describe('notify-only phrasing (audit finding 16)', () => {
  const ref = new Date(2026, 10, 14, 9, 0, 0);

  it.each([
    ['notify me at 5pm to submit the essay', 'remind me at 5pm to submit the essay'],
    ['remind me at 5pm to submit the essay, notification only', 'remind me at 5pm to submit the essay'],
    ["remind me at 5pm to submit the essay but don't call me", 'remind me at 5pm to submit the essay'],
    ['remind me at 5pm to submit the essay, no call', 'remind me at 5pm to submit the essay'],
    ['remind me at 5pm to submit the essay without calling', 'remind me at 5pm to submit the essay'],
    ['remind me at 5pm to submit the essay just a notification', 'remind me at 5pm to submit the essay'],
  ])('reads %p as a notification request', (input, command) => {
    expect(extractNotifyOnlyRequest(input)).toBe(command);
  });

  it.each([
    'remind me to call mom at 5pm',
    'remind me at 5pm to submit the essay',
    'call me at 6am',
  ])('leaves %p alone', input => {
    expect(extractNotifyOnlyRequest(input)).toBeNull();
  });

  it('marks a reminder notify-only and keeps the title clean', () => {
    const intent = parseIntentFastPath(
      'notify me tomorrow at 7pm to review physics',
      ref,
    );
    expect(intent.intent).toBe('create_reminder');
    expect(intent.deliveryStyle).toBe('notify');
    expect(intent.time).toBe('19:00');
    expect(intent.title?.toLowerCase()).not.toMatch(/notif|call/);
  });

  it('defaults to a call', () => {
    const intent = parseIntentFastPath('remind me tomorrow at 7pm to review physics', ref);
    expect(intent.intent).toBe('create_reminder');
    expect(intent.deliveryStyle).toBeUndefined();
  });

  it('does not change non-reminder commands', () => {
    const intent = parseIntentFastPath('what is on my schedule, no call', ref);
    expect(intent.deliveryStyle).toBeUndefined();
  });
});

describe('notify-only reminders end to end (audit finding 16)', () => {
  const {NativeModules} = require('react-native');
  const storage = require('../../src/storage');
  const {chatOrchestrator} = require('../../src/ai/chatOrchestrator');
  const review = require('../../src/ai/nlu/commandReview');
  const {remindersStore} = require('../../src/storage/remindersStore');
  const {
    reminderDeliveryStyleStore,
  } = require('../../src/storage/reminderDeliveryStyleStore');
  const scheduler = require('../../src/scheduler');
  const {db} = require('../../src/storage/database');

  /** Saturday 14 Nov 2026, 09:00 local. */
  const REF = new Date(2026, 10, 14, 9, 0, 0);
  let n = 0;
  const owner = () => `notify-${++n}`;

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
    storage.userStore.createGuestUser();
    review.endReviewSession();
  });

  const card = async (userId: string, text: string) => {
    const result = await chatOrchestrator.processMessage(userId, text, {
      referenceDate: REF,
    });
    if (result.review?.status !== 'proposal') {
      throw new Error(`Expected a card, got: ${result.reply}`);
    }
    return result.review.proposal;
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const scheduledStyles = () =>
    (NativeModules.LafinaReminder.scheduleExactAlarm as jest.Mock).mock.calls.map(
      ([options]: [{style?: string}]) => options.style,
    );

  it('a reminder card defaults to Call me and saves no style row', async () => {
    const userId = owner();
    const proposal = await card(userId, 'remind me tomorrow at 7pm to review physics');
    expect(proposal.reminderDelivery).toBe('call');
    const applied = review.confirmReviewedCommand(userId, proposal.operationId);
    expect(applied.status).toBe('applied');
    await flush();
    const saved = remindersStore.getPendingReminders(userId)[0];
    expect(reminderDeliveryStyleStore.get(saved.id)).toBe('call');
    expect(
      db.executeSync(
        'SELECT COUNT(*) AS n FROM reminder_delivery_styles WHERE reminder_id = ?',
        [saved.id],
      ).rows[0].n,
    ).toBe(0);
    expect(scheduledStyles()).toContain('call');
  });

  it('switching the card to Notify only saves it with the reminder and tells native', async () => {
    const userId = owner();
    const proposal = await card(userId, 'remind me tomorrow at 7pm to review physics');
    const switched = review.setReviewReminderDelivery(
      userId,
      proposal.operationId,
      'notify',
    );
    expect(switched.status).toBe('proposal');
    expect(switched.proposal.operationId).toBe(proposal.operationId);
    expect(switched.proposal.reminderDelivery).toBe('notify');
    // Nothing is written before Confirm.
    expect(remindersStore.getPendingReminders(userId)).toHaveLength(0);
    expect(review.confirmReviewedCommand(userId, proposal.operationId).status).toBe(
      'applied',
    );
    await flush();
    const saved = remindersStore.getPendingReminders(userId)[0];
    expect(reminderDeliveryStyleStore.get(saved.id)).toBe('notify');
    expect(scheduledStyles()).toEqual(['notify']);
  });

  it('"notify me…" prepares a Notify only card; another user cannot switch it', async () => {
    const userId = owner();
    const proposal = await card(userId, 'notify me tomorrow at 7pm to review physics');
    expect(proposal.reminderDelivery).toBe('notify');
    expect(
      review.setReviewReminderDelivery('someone-else', proposal.operationId, 'call')
        .status,
    ).toBe('invalid');
  });

  it('cards that create no reminder have no delivery choice', async () => {
    const userId = owner();
    const proposal = await card(userId, 'create a note called lab ideas');
    expect(proposal.reminderDelivery ?? null).toBeNull();
    expect(
      review.setReviewReminderDelivery(userId, proposal.operationId, 'notify').status,
    ).toBe('invalid');
  });

  it('editing a Notify only card keeps the choice', async () => {
    const userId = owner();
    const proposal = await card(userId, 'notify me tomorrow at 7pm to review physics');
    const edited = review.editReviewedCommand(userId, proposal.operationId, {
      title: 'Review chemistry',
    });
    expect(edited.status).toBe('proposal');
    expect(edited.proposal.reminderDelivery).toBe('notify');
  });

  it('deleting the reminder removes its style row', async () => {
    const userId = owner();
    const proposal = await card(userId, 'notify me tomorrow at 7pm to review physics');
    review.confirmReviewedCommand(userId, proposal.operationId);
    const saved = remindersStore.getPendingReminders(userId)[0];
    expect(reminderDeliveryStyleStore.get(saved.id)).toBe('notify');
    remindersStore.deleteReminder(saved.id);
    expect(
      db.executeSync(
        'SELECT COUNT(*) AS n FROM reminder_delivery_styles WHERE reminder_id = ?',
        [saved.id],
      ).rows[0].n,
    ).toBe(0);
  });

  it('Acknowledge from the notification acknowledges without completing anything', async () => {
    const userId = owner();
    const proposal = await card(userId, 'notify me tomorrow at 7pm to review physics');
    review.confirmReviewedCommand(userId, proposal.operationId);
    const saved = remindersStore.getPendingReminders(userId)[0];
    const result = await scheduler.applyNotificationAction(
      saved.id,
      userId,
      'acknowledge',
      null,
    );
    expect(result.ok).toBe(true);
    expect(remindersStore.getReminderById(saved.id).status).toBe('acknowledged');
    expect(NativeModules.LafinaReminder.finishIncomingCall).toHaveBeenCalledWith(saved.id);
  });

  it('Snooze from the notification snoozes for 10 minutes', async () => {
    const userId = owner();
    const proposal = await card(userId, 'notify me tomorrow at 7pm to review physics');
    review.confirmReviewedCommand(userId, proposal.operationId);
    const saved = remindersStore.getPendingReminders(userId)[0];
    remindersStore.updateReminderStatus(saved.id, 'triggered');
    const result = await scheduler.applyNotificationAction(saved.id, userId, 'snooze', null);
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('snoozed');
    expect(scheduler.NOTIFY_SNOOZE_MINUTES).toBe(10);
    expect(new Date(result.triggerAt).getTime() - Date.now()).toBeGreaterThanOrEqual(
      9 * 60 * 1000,
    );
  });

  it('isNotificationAction only accepts the notification buttons', () => {
    expect(scheduler.isNotificationAction('acknowledge')).toBe(true);
    expect(scheduler.isNotificationAction('snooze')).toBe(true);
    expect(scheduler.isNotificationAction('call')).toBe(false);
    expect(scheduler.isNotificationAction('answer')).toBe(false);
  });
});
