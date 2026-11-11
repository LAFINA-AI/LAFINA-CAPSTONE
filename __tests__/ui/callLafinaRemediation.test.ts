/** Regression acceptance using real host SQLite, synthetic owners and no provider calls. */
import {initDatabase} from '../../src/storage/dbInit';
import {db} from '../../src/storage/database';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {userStore} from '../../src/storage/userStore';
import {voiceConsent} from '../../src/cloud/voiceConversation';
import {actionService} from '../../src/ai/voiceActions/actionService';
import {draftRegistry} from '../../src/ai/voiceActions/draftRegistry';
import {validatePayload} from '../../src/ai/voiceActions/actionValidator';
import {
  createMultiActionBatch,
  executeMultiActionBatch,
} from '../../src/ai/voiceActions/multiActionService';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {assistantOperationStore} from '../../src/storage/assistantOperationStore';
import {notesStore} from '../../src/storage/notesStore';
import {tasksStore} from '../../src/storage/tasksStore';
import {remindersStore} from '../../src/storage/remindersStore';
import {deliveryStore} from '../../src/storage/deliveryStore';
import * as reconciler from '../../src/scheduler/deliveryReconciler';
import {verifyReminderDelivery} from '../../src/scheduler/verifyReminderDelivery';
import {readLocalVoiceResult} from '../../src/cloud/voiceConversation/localVoiceData';
import {resolveCallTarget} from '../../src/ui/navigation/resolveCallTarget';
import {checkScheduleConflict} from '../../src/ai/voiceActions/conflictChecker';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {
  saveCallLafinaSettings,
  getCallLafinaSettings,
} from '../../src/cloud/voiceConversation/callLafinaSettingsStore';
import {onlineVoiceSettingsStore} from '../../src/storage/onlineVoiceSettingsStore';

const owner = 'codex-audit-synthetic';
const count = (table: string) =>
  Number(
    db.executeSync(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`, [
      owner,
    ]).rows[0].n,
  );
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  jest.restoreAllMocks();
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at) VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [owner, owner, 'audit@example.invalid', now, now],
  );
  jest.spyOn(userStore, 'isGuest').mockReturnValue(false);
  jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
    userId: owner,
    accessToken: 'synthetic',
    refreshToken: null,
  });
  voiceConsent.write(owner);
  localSettingsStore.set(
    owner,
    'voiceConversation.directDataConsent.v1',
    'true',
  );
  chatMemoryStore.setEnabled(owner, true);
  chatMemoryStore.clear(owner);
  draftRegistry.clearAll();
});
afterEach(() => jest.restoreAllMocks());

test('spoken revision invalidates old approval and commits the revised time', async () => {
  let review: any;
  await actionService.executeTool(
    owner,
    'test-session',
    'prepare_lafina_action',
    {request: 'Add task: Physics tomorrow at 3pm'},
    () => true,
    {
      onProposal: r => {
        review = r;
      },
    },
  );
  const oldId = review.review.proposal.operationId;
  await actionService.executeTool(
    owner,
    'test-session',
    'revise_draft',
    {cardId: oldId, revision: 1, instruction: 'Change to 4 PM'},
    () => true,
    {
      onProposal: r => {
        review = r;
      },
    },
  );
  expect(review.review.proposal.operationId).not.toBe(oldId);
  const before = count('tasks');
  await chatOrchestrator.confirmReview(owner, oldId, {speakReply: false});
  expect(count('tasks')).toBe(before);
  await chatOrchestrator.confirmReview(
    owner,
    review.review.proposal.operationId,
    {speakReply: false},
  );
  expect(count('tasks')).toBe(before + 1);
  expect(
    db.executeSync(
      'SELECT due_time FROM tasks WHERE user_id = ? AND title = ?',
      [owner, review.review.proposal.title],
    ).rows[0].due_time,
  ).toBe('16:00');
});
test('confirm_draft saves authorized pending draft and cancellation rejects old approval', async () => {
  let review: any;
  await actionService.executeTool(
    owner,
    'test-session',
    'prepare_lafina_action',
    {request: 'Add task: Confirmed via tool tomorrow at 2pm'},
    () => true,
    {
      onProposal: r => {
        review = r;
      },
    },
  );
  const cardId = review.review.proposal.operationId;
  const before = count('tasks');
  const confirmed = await actionService.executeTool(
    owner,
    'test-session',
    'confirm_draft',
    {cardId, revision: 1},
    () => true,
  );
  expect(confirmed).toContain('Confirmed and saved');
  expect(count('tasks')).toBe(before + 1);

  let cancelReview: any;
  await actionService.executeTool(
    owner,
    'test-session',
    'prepare_lafina_action',
    {request: 'Add task: Cancellation tomorrow at 3pm'},
    () => true,
    {
      onProposal: r => {
        cancelReview = r;
      },
    },
  );
  const canceledCardId = cancelReview.review.proposal.operationId;
  const afterSave = count('tasks');
  await actionService.executeTool(
    owner,
    'test-session',
    'cancel_draft',
    {cardId: canceledCardId, revision: 1},
    () => true,
  );
  expect(
    await actionService.executeTool(
      owner,
      'test-session',
      'confirm_draft',
      {cardId: canceledCardId, revision: 1},
      () => true,
    ),
  ).toContain('Nothing has been saved');
  await chatOrchestrator.confirmReview(owner, canceledCardId, {
    speakReply: false,
  });
  expect(count('tasks')).toBe(afterSave);
});
test('legacy memory requests produce review without writing and expose the action ID', async () => {
  let actionId = '';
  await actionService.executeTool(
    owner,
    'test-session',
    'save_lafina_memory',
    {request: 'Remember that I prefer afternoons'},
    () => true,
    {
      onMemoryProposal: (_p, id) => {
        actionId = id;
      },
    },
  );
  expect(chatMemoryStore.list(owner)).toHaveLength(0);
  expect(actionService.confirmMemoryProposal(owner, actionId).success).toBe(
    true,
  );
  expect(chatMemoryStore.list(owner)).toHaveLength(1);
});
test('targeted retry never duplicates a saved item and missing reminder time fails', async () => {
  const batch = createMultiActionBatch('test-session', owner, [
    {
      id: 'one',
      kind: 'task',
      title: 'Retry',
      status: 'draft',
      savedEntityId: null,
      error: null,
    },
    {
      id: 'two',
      kind: 'reminder',
      title: 'Missing time',
      status: 'draft',
      savedEntityId: null,
      error: null,
    },
  ]);
  const before = count('tasks');
  await executeMultiActionBatch(batch, owner);
  expect(batch.status).toBe('partial');
  await executeMultiActionBatch(batch, owner, 'one');
  expect(count('tasks')).toBe(before + 1);
  expect(batch.items[1].status).toBe('failed');
});
test('advertised grouped tool schema validates without changing fields', () => {
  expect(
    validatePayload('multi.prepare', {
      items: [{kind: 'task', title: 'Physics'}],
    }),
  ).toMatchObject({
    valid: true,
    data: {items: [{kind: 'task', title: 'Physics'}]},
  });
});

test('stale cloned batch replays durable receipts without duplicating rows or outbox', async () => {
  const batch = createMultiActionBatch('durable-replay', owner, [
    {
      id: 'one',
      kind: 'task',
      title: 'Durable replay',
      status: 'draft',
      savedEntityId: null,
      error: null,
    },
  ]);
  const replay = JSON.parse(JSON.stringify(batch));
  await executeMultiActionBatch(batch, owner);
  const rows = count('tasks'),
    outbox = count('sync_outbox');
  await executeMultiActionBatch(replay, owner);
  expect(replay.items[0].savedEntityId).toBe(batch.items[0].savedEntityId);
  expect(count('tasks')).toBe(rows);
  expect(count('sync_outbox')).toBe(outbox);
});

test('receipt failure rolls back entity and outbox before a safe retry', async () => {
  const batch = createMultiActionBatch('rollback', owner, [
    {
      id: 'one',
      kind: 'note',
      title: 'Rollback note',
      body: 'Synthetic body',
      status: 'draft',
      savedEntityId: null,
      error: null,
    },
  ]);
  const rows = count('notes'),
    outbox = count('sync_outbox');
  const receipt = jest
    .spyOn(assistantOperationStore, 'insertReceipt')
    .mockImplementationOnce(() => {
      throw new Error('Injected transaction failure');
    });
  await executeMultiActionBatch(batch, owner);
  expect(batch.items[0]).toMatchObject({status: 'failed', savedEntityId: null});
  expect(count('notes')).toBe(rows);
  expect(count('sync_outbox')).toBe(outbox);
  receipt.mockRestore();
  await executeMultiActionBatch(batch, owner, 'one');
  expect(batch.items[0].status).toBe('saved');
  expect(count('notes')).toBe(rows + 1);
});

test('ending a session prevents confirmation and retires its authoritative review', async () => {
  let review: any;
  await actionService.executeTool(
    owner,
    'retired-regression',
    'prepare_lafina_action',
    {request: 'Add task: Must expire tomorrow at 2pm'},
    () => true,
    {
      onProposal: r => {
        review = r;
      },
    },
  );
  actionService.clearSessionActions('retired-regression');
  const before = count('tasks');
  await chatOrchestrator.confirmReview(
    owner,
    review.review.proposal.operationId,
    {speakReply: false},
  );
  expect(count('tasks')).toBe(before);
  expect(
    await actionService.executeTool(
      owner,
      'retired-regression',
      'prepare_memory',
      {text: 'Old call'},
      () => true,
    ),
  ).toContain('cancelled');
});

test('batch cancellation preserves and reports items already saved', async () => {
  const batch = createMultiActionBatch('partial-cancel', owner, [
    {
      id: 'saved',
      kind: 'task',
      title: 'Retain',
      status: 'saved',
      savedEntityId: 'synthetic-id',
      error: null,
    },
    {
      id: 'draft',
      kind: 'task',
      title: 'Cancel',
      status: 'draft',
      savedEntityId: null,
      error: null,
    },
  ]);
  const result = actionService.cancelMultiActionBatch(owner, batch);
  expect(result.batch.items.map(i => i.status)).toEqual(['saved', 'cancelled']);
  expect(result.spokenSummary).toContain('remain saved');
});

test('batch stops before the next write when its current-session guard is revoked', async () => {
  const batch = createMultiActionBatch('guard', owner, [
    {
      id: 'one',
      kind: 'task',
      title: 'First',
      status: 'draft',
      savedEntityId: null,
      error: null,
    },
    {
      id: 'two',
      kind: 'task',
      title: 'Second',
      status: 'draft',
      savedEntityId: null,
      error: null,
    },
  ]);
  let calls = 0;
  const before = count('tasks');
  const result = await executeMultiActionBatch(
    batch,
    owner,
    undefined,
    () => ++calls === 1,
  );
  expect(count('tasks')).toBe(before + 1);
  expect(result.spokenSummary).toContain('1 item(s) were not saved');
});

test('calendar tool honors bounded explicit date ranges and returns local IDs', async () => {
  tasksStore.insertEvent({
    id: 'range-event',
    userId: owner,
    title: 'Range lecture',
    date: '2030-05-10',
    startTime: '09:00',
    endTime: '10:00',
    location: null,
    recurrenceRule: null,
  });
  let result: any;
  await actionService.executeTool(
    owner,
    'range',
    'read_calendar',
    {start: '2030-05-01', end: '2030-07-01'},
    () => true,
    {
      onReadResult: r => {
        result = r;
      },
    },
  );
  expect(result.window).toEqual({start: '2030-05-01', end: '2030-05-31'});
  expect(result.events).toContainEqual(
    expect.objectContaining({id: 'range-event'}),
  );
  expect(result.partial).toBe(true);
});

test('saved note navigation re-reads exact owned, undeleted record', () => {
  notesStore.insert({
    id: 'exact-note',
    userId: owner,
    title: 'Exact record',
    body: 'Synthetic',
    category: 'Personal',
    isPinned: false,
    tags: [],
    isVoiceTranscribed: false,
    imageUri: null,
  });
  const target = {
    ownerId: owner,
    screen: 'notes' as const,
    entityKind: 'note' as const,
    entityId: 'exact-note',
  };
  expect(resolveCallTarget(owner, target)).toMatchObject({
    kind: 'note',
    item: {id: 'exact-note', title: 'Exact record'},
  });
  expect(resolveCallTarget('different-owner', target)).toBeNull();
  expect(
    resolveCallTarget(owner, {...target, ownerId: 'different-owner'}),
  ).toBeNull();
  notesStore.delete('exact-note');
  expect(resolveCallTarget(owner, target)).toBeNull();
});

test('search result includes exact note identity and respects owner isolation', () => {
  notesStore.insert({
    id: 'search-note',
    userId: owner,
    title: 'Unique search quantum',
    body: 'Synthetic',
    category: 'Personal',
    isPinned: false,
    tags: [],
    isVoiceTranscribed: false,
    imageUri: null,
  });
  const found = readLocalVoiceResult(owner, 'notes', 'Unique search quantum');
  expect(found).toMatchObject({notes: [{id: 'search-note'}]});
  expect(
    readLocalVoiceResult('different-owner', 'notes', 'Unique search quantum'),
  ).toMatchObject({notes: []});
});

test('reminder verification distinguishes pending, registered and failed native reconciliation', async () => {
  remindersStore.insertReminder({
    id: 'delivery-check',
    userId: owner,
    task: 'Delivery check',
    description: null,
    scheduledAt: '2030-05-10T09:00:00',
    triggerAt: '2030-05-10T09:00:00',
    status: 'pending',
    preCastAudioPath: null,
  });
  const reconcile = jest
    .spyOn(reconciler, 'reconcileReminderDelivery')
    .mockResolvedValue({
      nativeAvailable: true,
      registered: 0,
      kept: 0,
      cancelled: 0,
      failed: 0,
      receipts: 0,
    });
  expect((await verifyReminderDelivery(owner, 'delivery-check')).status).toBe(
    'pending',
  );
  const job = deliveryStore.get('delivery-check')!;
  jest.spyOn(deliveryStore, 'get').mockReturnValue({
    ...job,
    registrationState: 'registered',
    registeredGeneration: job.generation,
  });
  expect((await verifyReminderDelivery(owner, 'delivery-check')).status).toBe(
    'registered',
  );
  reconcile.mockRejectedValueOnce(new Error('Native failure'));
  expect(await verifyReminderDelivery(owner, 'delivery-check')).toMatchObject({
    status: 'unavailable',
    message: expect.stringContaining('Saved locally'),
  });
});

test('previous-day overnight event conflicts and read failures propagate', () => {
  tasksStore.insertEvent({
    id: 'overnight',
    userId: owner,
    title: 'Night laboratory',
    date: '2030-05-09',
    startTime: '23:00',
    endTime: '02:00',
    location: null,
    recurrenceRule: null,
  });
  expect(
    checkScheduleConflict(
      owner,
      '2030-05-10',
      '01:00',
      '01:30',
    ).conflictingItems.map(i => i.id),
  ).toContain('overnight');
  jest.spyOn(plannerQueries, 'window').mockImplementationOnce(() => {
    throw new Error('Storage unavailable');
  });
  expect(() =>
    checkScheduleConflict(owner, '2030-05-10', '01:00', '01:30'),
  ).toThrow('Storage unavailable');
});

test('authoritative voice draft carries grounded conflict warnings and alternatives', async () => {
  tasksStore.insertEvent({
    id: 'review-conflict',
    userId: owner,
    title: 'Existing laboratory',
    date: '2030-06-12',
    startTime: '14:00',
    endTime: '15:00',
    location: null,
    recurrenceRule: null,
  });
  let prepared: any;
  await actionService.executeTool(
    owner,
    'conflict-review',
    'prepare_lafina_action',
    {request: 'Block time for Physics on June 12 2030 from 2pm to 3pm'},
    () => true,
    {
      onProposal: r => {
        prepared = r;
      },
    },
  );
  expect(prepared?.kind).toBe('proposal');
  expect(prepared.review.proposal.warnings.join(' ')).toContain(
    'Existing laboratory',
  );
  expect(prepared.review.proposal.conflictAlternatives.length).toBeGreaterThan(
    0,
  );
});

test('settings and actual session use the same authoritative voice choice, including clearing it', () => {
  saveCallLafinaSettings(owner, {
    voiceId: 'test_voice',
    voiceName: 'Synthetic voice',
  });
  expect(onlineVoiceSettingsStore.read(owner)).toEqual({
    id: 'test_voice',
    name: 'Synthetic voice',
  });
  onlineVoiceSettingsStore.save(owner, null);
  expect(getCallLafinaSettings(owner).voiceId).toBeNull();
});

test.each([
  ['calendar.read', {date: '2030-02-30'}],
  ['calendar.read', {query: 42}],
  ['note.search', {query: 'test', limit: 1.5}],
  ['task.prepare', {title: 'test', priority: 'urgent'}],
  ['multi.prepare', {items: [{kind: 'task', title: 'test', ownerId: 'spoof'}]}],
  ['draft.confirm', {cardId: 'test', revision: NaN}],
  ['memory.prepare', {text: 'a'.repeat(201)}],
] as const)('rejects malformed %s payload before dispatch', (kind, payload) => {
  expect(validatePayload(kind, payload).valid).toBe(false);
});
