import {behaviorStore} from '../../src/storage/behaviorStore';
import {
  authorizeDataReset,
  resetPersonalData,
} from '../../src/storage/accountDataReset';
import {executeNluAction} from '../../src/ai/nlu/actionExecutor';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {
  db,
  initDatabase,
  userStore,
  tasksStore,
  remindersStore,
} from '../../src/storage';
import {
  prepareReviewedCommand,
  confirmReviewedCommand,
  cancelReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import type {ValidatedIntent} from '../../src/ai/nlu/types';
import * as timing from '../../src/ai/ml/timingAdvisor';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {
  recordReminderInteraction,
  getInteractionHistory,
} from '../../src/ai/ml/featureExtractor';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {acknowledgeReminderAction} from '../../src/scheduler/reminderActions';
let serial = 0;
const owner = () => {
  const id = `lem-integration-${++serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (id,username,email,role,is_new_user,created_at,updated_at) VALUES (?,?,?,'student',0,?,?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  userStore.setCurrentUser(id);
  return id;
};
const intent = (extra: Partial<ValidatedIntent> = {}): ValidatedIntent => ({
  intent: 'create_task',
  title: 'Synthetic integration',
  date: '2030-01-02',
  time: '12:00',
  endTime: null,
  durationMinutes: null,
  category: 'Academic',
  details: null,
  snoozeMinutes: null,
  confidence: 1,
  source: 'fast_path',
  rawTranscript: 'synthetic',
  isValid: true,
  ...extra,
});
const proposal = (userId: string, command: ValidatedIntent) => {
  const result = prepareReviewedCommand(userId, command);
  if (result.status !== 'proposal') throw new Error(JSON.stringify(result));
  return result.proposal;
};
const train = (userId: string) => {
  for (let n = 0; n < 5; n++)
    recordReminderInteraction(userId, {
      reminderId: `synthetic-${n}`,
      outcome: 'snoozed',
      latencySeconds: 150,
      snoozeMinutes: 10,
      channel: 'call',
    });
};
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date(2030, 0, 1, 9).getTime());
});
afterEach(() => {
  jest.restoreAllMocks();
});
it('shows the real ML offset, waits for Confirm and freezes the proposed trigger through Confirm/double Confirm', () => {
  const a = owner();
  train(a);
  const scheduledAt = new Date(2030, 0, 2, 12).toISOString();
  const expected = timing.getAdaptiveScheduleRecommendation(a, {
    scheduledAtIso: scheduledAt,
    priority: 'Medium',
  });
  expect(expected.source).toBe('ml_ensemble');
  expect(expected.recommendedTriggerAt).not.toBe(scheduledAt);
  const card = proposal(a, intent());
  expect(card.details.join(' ')).toContain('Adaptive reminder');
  expect(tasksStore.getAllTasks(a)).toHaveLength(0);
  expect(remindersStore.getAllReminders(a)).toHaveLength(0);
  // A change after review must not silently replace the time the user approves.
  localSettingsStore.set(a, timing.SETTING_KEY_ADAPTIVE_TIMING, 'false');
  const result = confirmReviewedCommand(a, card.operationId);
  expect(result.status).toBe('applied');
  const saved = remindersStore.getAllReminders(a);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    scheduledAt,
    triggerAt: expected.recommendedTriggerAt,
  });
  expect(confirmReviewedCommand(a, card.operationId)).toMatchObject({
    status: 'applied',
    repeated: true,
  });
  expect(remindersStore.getAllReminders(a)).toHaveLength(1);
});
it('keeps opt-out baseline timing and cancellation side-effect free', () => {
  const a = owner();
  train(a);
  localSettingsStore.set(a, timing.SETTING_KEY_ADAPTIVE_TIMING, 'false');
  const card = proposal(a, intent());
  expect(card.details.join(' ')).not.toContain('Adaptive reminder');
  cancelReviewedCommand(a, card.operationId);
  expect(confirmReviewedCommand(a, card.operationId).status).toBe('refused');
  expect(tasksStore.getAllTasks(a)).toHaveLength(0);
  const next = proposal(a, intent());
  expect(confirmReviewedCommand(a, next.operationId).status).toBe('applied');
  const saved = remindersStore.getAllReminders(a)[0];
  expect(saved.triggerAt).toBe(saved.scheduledAt);
});
it('falls back to requested timing if the advisor fails', () => {
  const a = owner();
  jest
    .spyOn(timing, 'getAdaptiveScheduleRecommendation')
    .mockImplementation(() => {
      throw new Error('synthetic advisor failure');
    });
  const card = proposal(a, intent());
  expect(confirmReviewedCommand(a, card.operationId).status).toBe('applied');
  const saved = remindersStore.getAllReminders(a)[0];
  expect(saved.triggerAt).toBe(saved.scheduledAt);
});
it('retains AGY recurring reminder parsing through review and call acknowledgement', async () => {
  const a = owner();
  const parsed = parseIntentFastPath(
    'remind me to study every Monday at 10 AM',
    new Date(2030, 0, 1, 9),
  );
  expect(parsed?.recurrenceRule).toBeTruthy();
  const card = proposal(
    a,
    intent({
      ...parsed,
      intent: 'create_reminder',
      date: '2030-01-07',
      time: '10:00',
    }),
  );
  expect(card.details.join(' ')).toContain('Repeats');
  expect(confirmReviewedCommand(a, card.operationId).status).toBe('applied');
  const before = remindersStore.getAllReminders(a)[0];
  expect(before.description).toContain('[RRULE:FREQ=WEEKLY;BYDAY=MO]');
  expect((await acknowledgeReminderAction(before.id, a)).ok).toBe(true);
  expect(
    remindersStore
      .getAllReminders(a)
      .some(r => r.status === 'pending' && r.scheduledAt > before.scheduledAt),
  ).toBe(true);
  expect(tasksStore.getAllTasks(a)[0].isCompleted).toBe(false);
});
it('records reviewed ACK feedback once after commit, never on double Confirm', () => {
  const a = owner();
  const at = new Date(2030, 0, 2, 12).toISOString();
  remindersStore.insertReminder({
    id: `${a}-r`,
    userId: a,
    task: 'Synthetic target',
    description: null,
    scheduledAt: at,
    triggerAt: at,
    status: 'pending',
    preCastAudioPath: null,
  });
  const card = proposal(
    a,
    intent({
      intent: 'acknowledge',
      title: null,
      targetTitle: 'Synthetic target',
      date: null,
      time: null,
    }),
  );
  expect(getInteractionHistory(a)).toHaveLength(0);
  expect(confirmReviewedCommand(a, card.operationId).status).toBe('applied');
  expect(getInteractionHistory(a)).toHaveLength(1);
  confirmReviewedCommand(a, card.operationId);
  expect(getInteractionHistory(a)).toHaveLength(1);
});
it('refuses an ML review from a different account with no planner writes', () => {
  const a = owner();
  train(a);
  const card = proposal(a, intent());
  const b = owner();
  expect(confirmReviewedCommand(b, card.operationId).status).toBe('refused');
  expect(tasksStore.getAllTasks(a)).toHaveLength(0);
  expect(remindersStore.getAllReminders(a)).toHaveLength(0);
});

it('reviewed ACK preserves recurrence and creates only one next occurrence on double Confirm', () => {
  const a = owner();
  const create = proposal(
    a,
    intent({intent: 'create_reminder', recurrenceRule: 'FREQ=DAILY'}),
  );
  expect(confirmReviewedCommand(a, create.operationId).status).toBe('applied');
  const before = remindersStore.getAllReminders(a)[0];
  const card = proposal(
    a,
    intent({
      intent: 'acknowledge',
      title: null,
      targetTitle: before.task,
      date: null,
      time: null,
    }),
  );
  expect(card.details.join(' ')).toContain('recurring schedule');
  expect(confirmReviewedCommand(a, card.operationId).status).toBe('applied');
  expect(remindersStore.getAllReminders(a)).toHaveLength(2);
  confirmReviewedCommand(a, card.operationId);
  expect(remindersStore.getAllReminders(a)).toHaveLength(2);
  expect(tasksStore.getAllTasks(a)[0].isCompleted).toBe(false);
});

it("Clear All Data forgets only the admitted owner's ML learning history", () => {
  const b = owner();
  train(b);
  const a = owner();
  train(a);
  expect(resetPersonalData(authorizeDataReset(a))).toMatchObject({
    admitted: true,
    planner: 'cleared',
  });
  expect(getInteractionHistory(a)).toHaveLength(0);
  expect(getInteractionHistory(b)).toHaveLength(5);
  expect(
    Number(
      db.executeSync(
        'SELECT COUNT(*) AS n FROM ml_feature_snapshots WHERE user_id=?',
        [a],
      ).rows[0].n,
    ),
  ).toBe(0);
});
it('a failed ML reset rolls back planner deletion and learning history together', () => {
  const a = owner();
  train(a);
  tasksStore.insertTask({
    id: `${a}-task`,
    userId: a,
    title: 'Keep me',
    dueDate: null,
    dueTime: null,
    isCompleted: false,
    priority: 'Medium',
    category: 'Academic',
    notes: null,
    recurrenceRule: null,
  });
  const real = db.executeSync.bind(db);
  jest.spyOn(db, 'executeSync').mockImplementation((sql, params) => {
    if (sql.startsWith('DELETE FROM ml_feature_snapshots'))
      throw new Error('synthetic model-data reset failure');
    return real(sql, params);
  });
  expect(resetPersonalData(authorizeDataReset(a))).toMatchObject({
    admitted: true,
    planner: 'failed',
  });
  expect(tasksStore.getAllTasks(a)).toHaveLength(1);
  expect(getInteractionHistory(a)).toHaveLength(5);
});
it('AGY weekly queries use bounded recurring reads instead of loading all tasks', async () => {
  const a = owner();
  tasksStore.insertTask({
    id: `${a}-weekly`,
    userId: a,
    title: 'Weekly integration task',
    dueDate: '2030-01-01',
    dueTime: '12:00',
    isCompleted: false,
    priority: 'Medium',
    category: 'Academic',
    notes: null,
    recurrenceRule: 'FREQ=DAILY',
  });
  const all = jest.spyOn(tasksStore, 'getAllTasks');
  const result = await executeNluAction(
    a,
    intent({intent: 'query_schedule', dateRange: 'this_week'}),
    {referenceDate: new Date(2030, 0, 1, 9)},
  );
  expect(result.success).toBe(true);
  expect(result.reply).toContain('Weekly integration task');
  expect(all).not.toHaveBeenCalled();
});
it('a failed weekly read reports storage failure instead of an empty week', async () => {
  const a = owner();
  jest.spyOn(plannerQueries, 'window').mockImplementation(() => {
    throw new Error('synthetic weekly read failure');
  });
  const result = await executeNluAction(
    a,
    intent({intent: 'query_schedule', dateRange: 'this_week'}),
    {referenceDate: new Date(2030, 0, 1, 9)},
  );
  expect(result).toMatchObject({success: false, error: 'storage_unavailable'});
  expect(result.reply).not.toContain('completely clear');
});

it('the latest ML snapshot wins even when timestamps tie and IDs sort in reverse insertion order', () => {
  const a = owner();
  const stamp = '2030-01-01T09:00:00.000Z';
  for (const [id, value] of [
    [`${a}-zz-first`, 'first'],
    [`${a}-aa-second`, 'second'],
  ])
    db.executeSync(
      'INSERT INTO ml_feature_snapshots (id,user_id,feature_type,feature_vector,computed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      [id, a, 'tie-regression', value, stamp, stamp, stamp],
    );
  expect(
    behaviorStore.getLatestFeatureSnapshot(a, 'tie-regression')?.featureVector,
  ).toBe('second');
});
