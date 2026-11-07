/**
 * AGY-PORT 04: reviewed assistant commands on real SQLite (node:sqlite).
 *
 * Proposals are private and in memory; Confirm re-checks owner, session,
 * expiry and local revisions, then writes item + linked reminder + outbox +
 * receipt in one transaction. Native alarm calls are Jest mocks: these tests
 * prove what is written and registered after commit, not that Android rang.
 */
import {
  assistantOperationStore,
  db,
  deliveryStore,
  guestMigration,
  initDatabase,
  notesStore,
  remindersStore,
  syncOutboxStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import * as reminderAlarm from '../../src/scheduler/reminderAlarm';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {intentService} from '../../src/ai/nlu/intentService';
import {executeNluAction} from '../../src/ai/nlu/actionExecutor';
import {formatLocalDate} from '../../src/ai/nlu/fastPathParser';
import {INTENT_ROUTES, routeIntent} from '../../src/ai/nlu/intentRoutes';
import {
  cancelReviewedCommand,
  confirmReviewedCommand,
  endReviewSession,
  latestPendingReview,
  prepareReviewedCommand,
  REVIEW_TTL_MS,
} from '../../src/ai/nlu/commandReview';
import type {PrepareResult} from '../../src/ai/nlu/commandReview';
import type {ParsedIntentType, ValidatedIntent} from '../../src/ai/nlu/types';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {documentSkill} from '../../src/skills/documentSkill';
import {GUEST_USER_ID} from '../../src/constants';
import * as ttsModule from '../../src/ai/tts/ttsService';
import {cloudClient} from '../../src/cloud/cloudClient';
import {syncWorker} from '../../src/sync/syncWorker';
import {
  AUTHORITATIVE_SYNC_ENTITY_TYPES,
  CLIENT_SYNC_ENTITY_TYPES,
} from '../../src/sync/syncEntityTypes';
import fs from 'fs';
import path from 'path';

const ALL_INTENTS: ParsedIntentType[] = [
  'create_task',
  'create_time_block',
  'create_reminder',
  'create_note',
  'update_task',
  'update_time_block',
  'update_note',
  'delete_task',
  'delete_time_block',
  'delete_note',
  'acknowledge',
  'snooze',
  'reschedule',
  'query_schedule',
  'chat',
  'out_of_scope',
];

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  return `p04-${label}-${serial}`;
};

const tomorrow = (): string => {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return formatLocalDate(value);
};

const intent = (overrides: Partial<ValidatedIntent>): ValidatedIntent => ({
  intent: 'create_task',
  title: null,
  date: null,
  time: null,
  endTime: null,
  durationMinutes: null,
  category: 'Academic',
  details: null,
  snoozeMinutes: null,
  confidence: 0.9,
  source: 'fast_path',
  rawTranscript: '',
  isValid: true,
  ...overrides,
});

/** Everything a reviewed command could write for one owner. */
const footprint = (userId: string) => {
  const count = (sql: string) =>
    Number(db.executeSync(sql, [userId]).rows[0]?.n ?? 0);
  return {
    tasks: count(
      'SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND deleted_at IS NULL',
    ),
    events: count(
      'SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND deleted_at IS NULL',
    ),
    blocks: count(
      'SELECT COUNT(*) AS n FROM time_blocks WHERE user_id = ? AND deleted_at IS NULL',
    ),
    notes: count(
      'SELECT COUNT(*) AS n FROM notes WHERE user_id = ? AND deleted_at IS NULL',
    ),
    reminders: count(
      "SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND deleted_at IS NULL AND status IN ('pending','snoozed','triggered')",
    ),
    outbox: count('SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ?'),
    receipts: count(
      'SELECT COUNT(*) AS n FROM assistant_operation_receipts WHERE user_id = ?',
    ),
    jobs: count(
      'SELECT COUNT(*) AS n FROM reminder_delivery_jobs WHERE user_id = ?',
    ),
  };
};

const expectProposal = (result: PrepareResult) => {
  expect(result.status).toBe('proposal');
  if (result.status !== 'proposal')
    throw new Error(`expected a proposal: ${result.reply}`);
  return result.proposal;
};

const seedTask = (
  userId: string,
  title: string,
  extra: Partial<Parameters<typeof tasksStore.insertTask>[0]> = {},
) => {
  const id = `${userId}-task-${title.replace(/\W+/g, '-')}-${(serial += 1)}`;
  tasksStore.insertTask({
    id,
    userId,
    title,
    dueDate: null,
    dueTime: null,
    isCompleted: false,
    priority: 'Medium',
    category: 'Academic',
    notes: null,
    recurrenceRule: null,
    ...extra,
  });
  return id;
};

const seedReminder = (userId: string, task: string, minutesAhead = 120) => {
  const id = `${userId}-rem-${(serial += 1)}`;
  const at = new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();
  remindersStore.insertReminder({
    id,
    userId,
    task,
    description: null,
    scheduledAt: at,
    triggerAt: at,
    status: 'pending',
    preCastAudioPath: null,
  });
  return id;
};

/**
 * An older, unlinked reminder made the way the Calendar form makes one: scheduled
 * at the item's own date and time, ringing `leadMinutes` earlier. This is the
 * strict evidence that ties an unlinked reminder to exactly one item.
 */
const seedItemReminder = (
  userId: string,
  task: string,
  date: string,
  time: string,
  leadMinutes = 0,
) => {
  const id = `${userId}-rem-${(serial += 1)}`;
  const scheduled = new Date(`${date}T${time}:00`);
  remindersStore.insertReminder({
    id,
    userId,
    task,
    description: 'Scheduled reminder',
    scheduledAt: scheduled.toISOString(),
    triggerAt: new Date(
      scheduled.getTime() - leadMinutes * 60 * 1000,
    ).toISOString(),
    status: 'pending',
    preCastAudioPath: null,
  });
  return id;
};

describe('AGY-PORT 04 reviewed assistant commands', () => {
  beforeAll(async () => {
    await initDatabase();
    userStore.createGuestUser();
  });

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest
      .spyOn(reminderAlarm, 'scheduleReminderAlarm')
      .mockResolvedValue(undefined);
    jest
      .spyOn(reminderAlarm, 'cancelReminderAlarm')
      .mockResolvedValue(undefined);
    jest
      .spyOn(reminderAlarm, 'finishNativeIncomingCall')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    endReviewSession();
  });

  describe('routing table', () => {
    test('every intent type has exactly one route', () => {
      expect(Object.keys(INTENT_ROUTES).sort()).toEqual(
        [...ALL_INTENTS].sort(),
      );
      const routes = Object.fromEntries(
        ALL_INTENTS.map(i => [i, routeIntent(i)]),
      );
      expect(routes).toEqual({
        create_task: 'reviewed_mutation',
        create_time_block: 'reviewed_mutation',
        create_reminder: 'reviewed_mutation',
        create_note: 'reviewed_mutation',
        update_task: 'reviewed_mutation',
        update_time_block: 'reviewed_mutation',
        update_note: 'reviewed_mutation',
        delete_task: 'reviewed_mutation',
        delete_time_block: 'reviewed_mutation',
        delete_note: 'reviewed_mutation',
        acknowledge: 'reviewed_mutation',
        snooze: 'reviewed_mutation',
        reschedule: 'reviewed_mutation',
        query_schedule: 'read_only',
        chat: 'conversation',
        out_of_scope: 'conversation',
      });
    });

    test('only acknowledge and snooze become immediate inside a ringing call', () => {
      const ringingCall = {reminderId: 'r', generation: 2};
      const immediate = ALL_INTENTS.filter(
        i => routeIntent(i, {ringingCall}) === 'call_context_immediate',
      );
      expect(immediate).toEqual(['acknowledge', 'snooze']);
      expect(routeIntent('reschedule', {ringingCall})).toBe(
        'reviewed_mutation',
      );
      // A malformed call context is not a call.
      expect(
        routeIntent('acknowledge', {
          ringingCall: {reminderId: '', generation: 1},
        }),
      ).toBe('reviewed_mutation');
      expect(
        routeIntent('acknowledge', {
          ringingCall: {reminderId: 'r', generation: -1},
        }),
      ).toBe('reviewed_mutation');
    });

    test('an unknown intent value routes to conversation, which never writes', () => {
      expect(routeIntent('drop_tables' as ParsedIntentType)).toBe(
        'conversation',
      );
      const result = prepareReviewedCommand(
        'x',
        intent({intent: 'drop_tables' as ParsedIntentType}),
      );
      expect(result.status).toBe('invalid');
    });
  });

  describe('no write before Confirm', () => {
    const phrases: Array<[string, ParsedIntentType]> = [
      ['Add task: read chapter 5', 'create_task'],
      ['Add task review notes tomorrow at 3pm', 'create_task'],
      [
        'Schedule study block for Algorithms tomorrow from 2pm to 4pm',
        'create_time_block',
      ],
      ['Remind me to take medicine tomorrow at 8am', 'create_reminder'],
      ['Save this as a note that the lab moved to room 4', 'create_note'],
    ];

    test.each(phrases)(
      'fast path: "%s" prepares %s and writes nothing',
      async (text, expected) => {
        const userId = owner('nowrite');
        const before = footprint(userId);
        const result = await chatOrchestrator.processMessage(userId, text);
        expect(result.intent.intent).toBe(expected);
        expect(result.route).toBe('reviewed_mutation');
        expectProposal(result.review as PrepareResult);
        expect(result.actionResult).toBeUndefined();
        expect(footprint(userId)).toEqual(before);
        expect(reminderAlarm.scheduleReminderAlarm).not.toHaveBeenCalled();
      },
    );

    test('update, delete, acknowledge, snooze and reschedule prepare without writing', async () => {
      const userId = owner('nowrite-targets');
      seedTask(userId, 'Physics homework', {
        dueDate: tomorrow(),
        dueTime: '10:00',
      });
      timeBlocksStore.insert({
        id: `${userId}-block`,
        userId,
        title: 'Algorithms',
        date: tomorrow(),
        startTime: '14:00',
        endTime: '15:00',
        color: '#3498DB',
        category: 'Academic',
      });
      notesStore.insert({
        id: `${userId}-note`,
        userId,
        title: 'Thesis ideas',
        body: 'offline secretary',
        isPinned: false,
        tags: [],
        category: 'Academic',
        isVoiceTranscribed: false,
      });
      seedReminder(userId, 'Quiz');
      const before = footprint(userId);
      const intents: ValidatedIntent[] = [
        intent({
          intent: 'update_task',
          targetTitle: 'Physics homework',
          time: '17:00',
          targetEntityType: 'task',
        }),
        intent({
          intent: 'update_time_block',
          targetTitle: 'Algorithms',
          time: '17:00',
        }),
        intent({
          intent: 'update_note',
          targetTitle: 'Thesis ideas',
          newTitle: 'Thesis plan',
        }),
        intent({
          intent: 'delete_task',
          targetTitle: 'Physics homework',
          targetEntityType: 'task',
        }),
        intent({intent: 'delete_time_block', targetTitle: 'Algorithms'}),
        intent({intent: 'delete_note', targetTitle: 'Thesis ideas'}),
        intent({intent: 'acknowledge', targetTitle: 'Quiz'}),
        intent({intent: 'snooze', snoozeMinutes: 15}),
        intent({
          intent: 'reschedule',
          targetTitle: 'Quiz',
          date: tomorrow(),
          time: '09:00',
        }),
      ];
      for (const item of intents) {
        const result = prepareReviewedCommand(userId, item);
        expect([item.intent, result.status]).toEqual([item.intent, 'proposal']);
      }
      expect(footprint(userId)).toEqual(before);
    });

    test('a model-sourced intent is re-validated; extra or malformed fields never reach a command', async () => {
      const userId = owner('model');
      jest.spyOn(intentService, 'extractIntent').mockResolvedValueOnce({
        ...intent({
          intent: 'create_task',
          title: `  Lab report ${'x'.repeat(500)}  `,
          date: tomorrow(),
          time: '09:30',
          source: 'on_device_slm',
          rawTranscript: 'add my lab report',
        }),
        // Extra keys a model might emit are ignored.
        sql: 'DROP TABLE tasks',
        userId: 'someone-else',
      } as unknown as ValidatedIntent);
      const result = await chatOrchestrator.processMessage(
        userId,
        'add my lab report',
      );
      const proposal = expectProposal(result.review as PrepareResult);
      expect(proposal.title.length).toBeLessThanOrEqual(200);
      expect(proposal.ownerId).toBe(userId);
      const decision = confirmReviewedCommand(userId, proposal.operationId);
      expect(decision.status).toBe('applied');
      expect(tasksStore.getAllTasks('someone-else')).toHaveLength(0);
      expect(tasksStore.getAllTasks(userId)).toHaveLength(1);

      const badDate = prepareReviewedCommand(
        userId,
        intent({
          intent: 'create_task',
          title: 'X',
          date: '2026-13-45',
          source: 'on_device_slm',
        }),
      );
      expect(badDate.status).toBe('invalid');
      const badTime = prepareReviewedCommand(
        userId,
        intent({
          intent: 'create_reminder',
          title: 'X',
          time: '25:99',
          source: 'on_device_slm',
        }),
      );
      expect(badTime.status).toBe('invalid');
      expect(footprint(userId).tasks).toBe(1);
    });
  });

  describe('confirm', () => {
    test('writes task, linked reminder, delivery job, outbox and receipt together; alarm after commit', () => {
      const userId = owner('confirm');
      const date = tomorrow();
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({title: 'Review notes', date, time: '15:00'}),
        ),
      );
      expect(proposal.details.join(' ')).toMatch(/Reminder: rings at 3:00 PM/);
      const decision = confirmReviewedCommand(userId, proposal.operationId);
      expect(decision.status).toBe('applied');
      if (decision.status !== 'applied') return;
      const {entityId, reminderId} = decision.receipt;
      expect(entityId).toBeTruthy();
      expect(reminderId).toBeTruthy();
      const task = tasksStore.getAllTasks(userId)[0];
      expect([task.id, task.dueDate, task.dueTime]).toEqual([
        entityId,
        date,
        '15:00',
      ]);
      expect(
        deliveryStore.findBySource(userId, 'task', String(entityId)),
      ).toEqual([reminderId]);
      expect(deliveryStore.get(String(reminderId))?.state).toBe('armed');
      const outbox = syncOutboxStore.getPendingMutations(userId, 20);
      expect(outbox.map(m => `${m.entityType}:${m.operation}`).sort()).toEqual([
        'reminder:create',
        'task:create',
      ]);
      expect(
        assistantOperationStore.getReceipt(proposal.operationId)?.operation,
      ).toBe('create_task');
      expect(reminderAlarm.scheduleReminderAlarm).toHaveBeenCalledWith(
        reminderId,
        'Review notes',
        expect.any(String),
      );
    });

    test('a repeated Confirm returns the same receipt and writes nothing again', () => {
      const userId = owner('double');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({intent: 'create_note', title: 'Lab', details: 'Room 4'}),
        ),
      );
      const first = confirmReviewedCommand(userId, proposal.operationId);
      const after = footprint(userId);
      const second = confirmReviewedCommand(userId, proposal.operationId);
      expect(first.status).toBe('applied');
      expect(second.status).toBe('applied');
      if (first.status !== 'applied' || second.status !== 'applied') return;
      expect(second.repeated).toBe(true);
      expect(second.receipt).toEqual(first.receipt);
      expect(footprint(userId)).toEqual(after);
      // Another account cannot read it back either.
      expect(
        confirmReviewedCommand('intruder', proposal.operationId).status,
      ).toBe('refused');
    });

    test('Cancel writes nothing and a later Confirm is refused', () => {
      const userId = owner('cancel');
      const before = footprint(userId);
      const proposal = expectProposal(
        prepareReviewedCommand(userId, intent({title: 'Essay'})),
      );
      expect(cancelReviewedCommand('someone-else', proposal.operationId)).toBe(
        false,
      );
      expect(cancelReviewedCommand(userId, proposal.operationId)).toBe(true);
      const decision = confirmReviewedCommand(userId, proposal.operationId);
      expect(decision).toMatchObject({status: 'refused', reason: 'cancelled'});
      expect(footprint(userId)).toEqual(before);
      expect(latestPendingReview(userId)).toBeNull();
    });

    test('an expired review is refused and writes nothing; nothing confirms by itself', () => {
      const userId = owner('expiry');
      const before = footprint(userId);
      const proposal = expectProposal(
        prepareReviewedCommand(userId, intent({title: 'Essay'})),
      );
      const start = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(start + REVIEW_TTL_MS + 1);
      expect(
        confirmReviewedCommand(userId, proposal.operationId),
      ).toMatchObject({
        status: 'refused',
        reason: 'expired',
      });
      expect(footprint(userId)).toEqual(before);
    });

    test('a manual edit between prepare and Confirm makes the review stale', () => {
      const userId = owner('stale-manual');
      const taskId = seedTask(userId, 'Physics homework');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'delete_task',
            targetTitle: 'Physics homework',
            targetEntityType: 'task',
          }),
        ),
      );
      tasksStore.updateTask({id: taskId, notes: 'edited by hand'});
      const decision = confirmReviewedCommand(userId, proposal.operationId);
      expect(decision).toMatchObject({status: 'refused', reason: 'stale'});
      expect(tasksStore.getAllTasks(userId).map(t => t.id)).toEqual([taskId]);
      // Refused reviews stay refused.
      expect(
        confirmReviewedCommand(userId, proposal.operationId),
      ).toMatchObject({reason: 'stale'});
    });

    test('a sync pull between prepare and Confirm makes the review stale', () => {
      const userId = owner('stale-sync');
      const taskId = seedTask(userId, 'Lab report', {
        dueDate: tomorrow(),
        dueTime: '10:00',
      });
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'update_task',
            targetTitle: 'Lab report',
            time: '16:00',
            targetEntityType: 'task',
          }),
        ),
      );
      // The same UPSERT statement shape the sync worker uses to apply a pulled task.
      db.executeSync(
        `INSERT INTO tasks (id, user_id, title, due_date, due_time, is_completed, priority, category, notes, recurrence_rule, created_at, updated_at, deleted_at)
         VALUES (?, ?, 'Lab report v2', ?, '11:00', 0, 'Medium', 'Academic', NULL, NULL, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, due_time = excluded.due_time, updated_at = excluded.updated_at, deleted_at = NULL`,
        [
          taskId,
          userId,
          tomorrow(),
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
      expect(
        confirmReviewedCommand(userId, proposal.operationId),
      ).toMatchObject({reason: 'stale'});
      expect(tasksStore.getAllTasks(userId)[0]).toMatchObject({
        title: 'Lab report v2',
        dueTime: '11:00',
      });
    });

    test('an owner switch refuses the review', () => {
      const userId = owner('switch-a');
      const other = owner('switch-b');
      const before = footprint(userId);
      const proposal = expectProposal(
        prepareReviewedCommand(userId, intent({title: 'Essay'})),
      );
      expect(confirmReviewedCommand(other, proposal.operationId)).toMatchObject(
        {reason: 'owner_mismatch'},
      );
      // The active session changing under the same caller is also refused.
      db.executeSync('DELETE FROM active_session');
      db.executeSync(
        'INSERT INTO active_session (user_id, created_at, updated_at) VALUES (?, ?, ?)',
        [other, new Date().toISOString(), new Date().toISOString()],
      );
      try {
        expect(
          confirmReviewedCommand(userId, proposal.operationId),
        ).toMatchObject({reason: 'owner_mismatch'});
      } finally {
        db.executeSync('DELETE FROM active_session');
      }
      expect(footprint(userId)).toEqual(before);
    });

    test('guest linking during a review refuses it, for creations and for targets', async () => {
      const cloudId = owner('cloud');
      seedTask(GUEST_USER_ID, 'Guest chore');
      const create = expectProposal(
        prepareReviewedCommand(GUEST_USER_ID, intent({title: 'Guest essay'})),
      );
      const remove = expectProposal(
        prepareReviewedCommand(
          GUEST_USER_ID,
          intent({
            intent: 'delete_task',
            targetTitle: 'Guest chore',
            targetEntityType: 'task',
          }),
        ),
      );
      await guestMigration.linkGuestToCloudAccount(
        cloudId,
        `${cloudId}@example.test`,
      );
      try {
        expect(
          confirmReviewedCommand(GUEST_USER_ID, create.operationId).status,
        ).toBe('refused');
        expect(
          confirmReviewedCommand(GUEST_USER_ID, remove.operationId).status,
        ).toBe('refused');
        expect(tasksStore.getAllTasks(cloudId).map(t => t.title)).toEqual([
          'Guest chore',
        ]);
        expect(tasksStore.getAllTasks(GUEST_USER_ID)).toHaveLength(0);
      } finally {
        db.executeSync('DELETE FROM active_session');
        userStore.createGuestUser();
      }
    });

    test('a failure inside the transaction rolls everything back and the review can be retried', () => {
      const userId = owner('rollback');
      const before = footprint(userId);
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'create_reminder',
            title: 'Take medicine',
            date: tomorrow(),
            time: '08:00',
          }),
        ),
      );
      const original = syncOutboxStore.enqueueMutation;
      const spy = jest
        .spyOn(syncOutboxStore, 'enqueueMutation')
        .mockImplementation((...args: Parameters<typeof original>) => {
          if (args[1] === 'reminder') throw new Error('disk full');
          return original(...args);
        });
      expect(
        confirmReviewedCommand(userId, proposal.operationId),
      ).toMatchObject({reason: 'failed'});
      expect(footprint(userId)).toEqual(before);
      expect(reminderAlarm.scheduleReminderAlarm).not.toHaveBeenCalled();
      spy.mockRestore();
      const retry = confirmReviewedCommand(userId, proposal.operationId);
      expect(retry.status).toBe('applied');
      expect(footprint(userId)).toMatchObject({
        tasks: 1,
        reminders: 1,
        receipts: 1,
      });
    });

    test('ending the review session makes open proposals unconfirmable', () => {
      const userId = owner('session');
      const proposal = expectProposal(
        prepareReviewedCommand(userId, intent({title: 'Essay'})),
      );
      endReviewSession();
      expect(
        confirmReviewedCommand(userId, proposal.operationId),
      ).toMatchObject({reason: 'not_found'});
      expect(footprint(userId).tasks).toBe(0);
    });

    test('a newer proposal on the same surface replaces the older card', () => {
      const userId = owner('supersede');
      const first = expectProposal(
        prepareReviewedCommand(userId, intent({title: 'First'})),
      );
      const second = expectProposal(
        prepareReviewedCommand(userId, intent({title: 'Second'})),
      );
      expect(latestPendingReview(userId, 'chat')?.operationId).toBe(
        second.operationId,
      );
      expect(confirmReviewedCommand(userId, first.operationId)).toMatchObject({
        reason: 'cancelled',
      });
      const voice = expectProposal(
        prepareReviewedCommand(userId, intent({title: 'Voice'}), {
          surface: 'voice',
        }),
      );
      expect(latestPendingReview(userId, 'chat')?.operationId).toBe(
        second.operationId,
      );
      expect(latestPendingReview(userId, 'voice')?.operationId).toBe(
        voice.operationId,
      );
    });
  });

  describe('targets', () => {
    test('ambiguous delete targets produce a clarification listing the candidates', () => {
      const userId = owner('ambiguous');
      seedTask(userId, 'Physics homework', {dueDate: tomorrow()});
      seedTask(userId, 'Physics lab report');
      const before = footprint(userId);
      const result = prepareReviewedCommand(
        userId,
        intent({
          intent: 'delete_task',
          targetTitle: 'Physics',
          targetEntityType: 'task',
        }),
      );
      expect(result.status).toBe('clarify');
      if (result.status !== 'clarify') return;
      expect(result.candidates.map(c => c.title).sort()).toEqual([
        'Physics homework',
        'Physics lab report',
      ]);
      expect(result.reply).toContain('Physics homework');
      expect(result.reply).toContain('Physics lab report');
      expect(footprint(userId)).toEqual(before);
      // The full name resolves it.
      expect(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'delete_task',
            targetTitle: 'Physics homework',
            targetEntityType: 'task',
          }),
        ).status,
      ).toBe('proposal');
    });

    test('ambiguous reschedule targets produce a clarification', () => {
      const userId = owner('ambiguous-resched');
      seedReminder(userId, 'Quiz one', 60);
      seedReminder(userId, 'Quiz two', 90);
      const result = prepareReviewedCommand(
        userId,
        intent({
          intent: 'reschedule',
          targetTitle: 'Quiz',
          date: tomorrow(),
          time: '09:00',
        }),
      );
      expect(result.status).toBe('clarify');
      if (result.status === 'clarify')
        expect(result.candidates).toHaveLength(2);
    });

    test('a missing target is reported without guessing', () => {
      const userId = owner('missing');
      const result = prepareReviewedCommand(
        userId,
        intent({intent: 'delete_note', targetTitle: 'Nothing here'}),
      );
      expect(result.status).toBe('clarify');
      expect(result.reply).toMatch(/could not find a note/i);
    });

    test('a reviewed delete removes only its exactly linked reminder; an unlinked one goes only with the item it matches by title and time', () => {
      const userId = owner('links');
      const date = tomorrow();
      const created = confirmReviewedCommand(
        userId,
        expectProposal(
          prepareReviewedCommand(
            userId,
            intent({title: 'Quiz', date, time: '15:00'}),
          ),
        ).operationId,
      );
      if (created.status !== 'applied') throw new Error('setup failed');
      const linkedReminder = String(created.receipt.reminderId);
      // A second, manually created item with the same title and its own unlinked reminder.
      const manualTask = seedTask(userId, 'Quiz', {
        dueDate: date,
        dueTime: '18:00',
      });
      const manualReminder = seedItemReminder(userId, 'Quiz', date, '18:00');
      // Same title, but no Quiz item is due at 09:00: a standalone reminder.
      const standalone = seedItemReminder(userId, 'Quiz', date, '09:00');

      // Deleting the manual item takes its evidence-matched reminder, never the linked one.
      tasksStore.deleteTask(manualTask);
      expect(remindersStore.getReminderById(manualReminder)).toBeNull();
      expect(remindersStore.getReminderById(linkedReminder)).not.toBeNull();
      expect(remindersStore.getReminderById(standalone)).not.toBeNull();

      const unlinkedAgain = seedItemReminder(userId, 'Quiz', date, '15:00', 10);
      const remove = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'delete_task',
            targetTitle: 'Quiz',
            targetEntityType: 'task',
          }),
        ),
      );
      expect(confirmReviewedCommand(userId, remove.operationId).status).toBe(
        'applied',
      );
      // The linked reminder went with its task, the unlinked one matched by title
      // and time went too, and the title-only standalone reminder stayed.
      expect(remindersStore.getReminderById(linkedReminder)).toBeNull();
      expect(remindersStore.getReminderById(unlinkedAgain)).toBeNull();
      expect(remindersStore.getReminderById(standalone)).not.toBeNull();
      expect(reminderAlarm.cancelReminderAlarm).toHaveBeenCalledWith(
        linkedReminder,
      );
    });

    test('a recent reference ("it") picks the newest item and says so', () => {
      const userId = owner('recent');
      const older = seedTask(userId, 'Older');
      seedTask(userId, 'Newest');
      db.executeSync(
        "UPDATE tasks SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
        [older],
      );
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'delete_task',
            targetTitle: 'it',
            targetEntityType: 'task',
          }),
        ),
      );
      expect(proposal.title).toBe('Newest');
      expect(proposal.assumptions.join(' ')).toMatch(/most recent task/);
    });
  });

  describe('untimed and date-only tasks', () => {
    test('a task with no date stays undated, has no reminder, and appears in the Undated view', async () => {
      const userId = owner('undated');
      const result = await chatOrchestrator.processMessage(
        userId,
        'Add task: read chapter 5',
      );
      const proposal = expectProposal(result.review as PrepareResult);
      expect(proposal.details.join(' ')).toMatch(/No due date/);
      expect(proposal.assumptions).toEqual([]);
      expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
        'applied',
      );
      const task = tasksStore.getAllTasks(userId)[0];
      expect([task.dueDate, task.dueTime]).toEqual([null, null]);
      expect(footprint(userId).reminders).toBe(0);
      expect(
        tasksStore.getUndatedTasksPage(userId).items.map(t => t.id),
      ).toEqual([task.id]);
    });

    test('a date-only task keeps its date and gets no reminder', async () => {
      const userId = owner('dateonly');
      const result = await chatOrchestrator.processMessage(
        userId,
        'Add task submit essay tomorrow',
      );
      const proposal = expectProposal(result.review as PrepareResult);
      expect(proposal.details.join(' ')).toMatch(/date only/);
      confirmReviewedCommand(userId, proposal.operationId);
      const task = tasksStore.getAllTasks(userId)[0];
      expect([task.dueDate, task.dueTime]).toEqual([tomorrow(), null]);
      expect(footprint(userId).reminders).toBe(0);
    });

    test('defaults are always visible: a time without a date says it uses today', () => {
      const userId = owner('defaults');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({title: 'Call registrar', time: '23:59'}),
        ),
      );
      expect(proposal.assumptions.join(' ')).toMatch(
        /No date was given, so it is due today/,
      );
      const block = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({intent: 'create_time_block', title: 'Algorithms'}),
        ),
      );
      expect(block.assumptions).toEqual([
        expect.stringMatching(/No date was given/),
        expect.stringMatching(/starts at 9:00 AM/),
        expect.stringMatching(/lasts 1 hour/),
      ]);
    });

    test('a reminder without a time asks instead of inventing 09:00', () => {
      const userId = owner('notime');
      const result = prepareReviewedCommand(
        userId,
        intent({intent: 'create_reminder', title: 'Take medicine'}),
      );
      expect(result.status).toBe('clarify');
      expect(result.reply).toMatch(/What time should I remind you/);
      expect(footprint(userId).reminders).toBe(0);
    });

    test('the Undated view pages with a stable cursor', () => {
      const userId = owner('paging');
      for (let i = 0; i < 25; i += 1)
        seedTask(userId, `Undated ${String(i).padStart(2, '0')}`);
      seedTask(userId, 'Dated', {dueDate: tomorrow()});
      const first = tasksStore.getUndatedTasksPage(userId, {limit: 20});
      expect(first.items).toHaveLength(20);
      expect(first.nextCursor).toBeTruthy();
      const second = tasksStore.getUndatedTasksPage(userId, {
        limit: 20,
        after: first.nextCursor,
      });
      expect(second.items).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map(t => t.id);
      expect(new Set(ids).size).toBe(25);
      expect(() =>
        tasksStore.getUndatedTasksPage(userId, {after: 'garbage'}),
      ).toThrow();
    });
  });

  describe('reminder actions', () => {
    test('acknowledge outside a call stops the reminder but never completes the task', () => {
      const userId = owner('ack');
      const date = tomorrow();
      const created = confirmReviewedCommand(
        userId,
        expectProposal(
          prepareReviewedCommand(
            userId,
            intent({title: 'Quiz', date, time: '15:00'}),
          ),
        ).operationId,
      );
      if (created.status !== 'applied') throw new Error('setup failed');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'acknowledge',
            targetTitle: 'Quiz',
            targetEntityType: 'task',
          }),
        ),
      );
      expect(proposal.details.join(' ')).toMatch(/not marked done/);
      expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
        'applied',
      );
      const reminder = db.executeSync(
        'SELECT status FROM reminders WHERE id = ?',
        [created.receipt.reminderId],
      ).rows[0];
      expect(reminder.status).toBe('acknowledged');
      expect(tasksStore.getAllTasks(userId)[0].isCompleted).toBe(false);
    });

    test('acknowledge with only a task match asks instead of completing it', () => {
      const userId = owner('ack-task');
      seedTask(userId, 'Read chapter');
      const result = prepareReviewedCommand(
        userId,
        intent({intent: 'acknowledge', targetTitle: 'Read chapter'}),
      );
      // No reminder matches, so nothing is proposed; the reply points to the completion command.
      expect(result.status).not.toBe('proposal');
      expect(result.reply).toMatch(/mark it as done/);
      expect(tasksStore.getAllTasks(userId)[0].isCompleted).toBe(false);
    });

    test('snooze outside a call is reviewed, bounded and fenced on the delivery generation', () => {
      const userId = owner('snooze');
      const reminderId = seedReminder(userId, 'Quiz');
      const tooLong = prepareReviewedCommand(
        userId,
        intent({intent: 'snooze', snoozeMinutes: 500}),
      );
      expect(tooLong.status).toBe('clarify');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({intent: 'snooze', snoozeMinutes: 15}),
        ),
      );
      // The reminder is moved by someone else first: generation and revision change.
      remindersStore.updateReminderTriggerAt(
        reminderId,
        new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      );
      expect(
        confirmReviewedCommand(userId, proposal.operationId),
      ).toMatchObject({reason: 'stale'});
      const fresh = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({intent: 'snooze', snoozeMinutes: 15}),
        ),
      );
      expect(confirmReviewedCommand(userId, fresh.operationId).status).toBe(
        'applied',
      );
      expect(remindersStore.getReminderById(reminderId)?.status).toBe(
        'snoozed',
      );
    });

    test('reschedule moves only the reminder and refuses a past time', () => {
      const userId = owner('resched');
      const reminderId = seedReminder(userId, 'Quiz');
      const past = prepareReviewedCommand(
        userId,
        intent({
          intent: 'reschedule',
          targetTitle: 'Quiz',
          date: '2020-01-01',
          time: '09:00',
        }),
      );
      expect(past.status).toBe('clarify');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'reschedule',
            targetTitle: 'Quiz',
            date: tomorrow(),
            time: '09:00',
          }),
        ),
      );
      expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
        'applied',
      );
      const moved = remindersStore.getReminderById(reminderId);
      expect(moved?.triggerAt).toBe(
        new Date(`${tomorrow()}T09:00:00`).toISOString(),
      );
    });

    test('inside a ringing call, acknowledge is immediate with the captured identity; a stale identity changes nothing', async () => {
      const userId = owner('call');
      const reminderId = seedReminder(userId, 'Quiz');
      const generation = deliveryStore.get(reminderId)?.generation ?? 1;
      const stale = await chatOrchestrator.processMessage(
        userId,
        'Acknowledge',
        {
          ringingCall: {reminderId, generation: generation + 5},
        },
      );
      expect(stale.route).toBe('call_context_immediate');
      expect(stale.actionResult?.success).toBe(false);
      expect(remindersStore.getReminderById(reminderId)?.status).toBe(
        'pending',
      );

      const result = await chatOrchestrator.processMessage(
        userId,
        'Acknowledge',
        {
          ringingCall: {reminderId, generation},
        },
      );
      expect(result.route).toBe('call_context_immediate');
      expect(result.review).toBeUndefined();
      expect(result.actionResult?.success).toBe(true);
      expect(remindersStore.getReminderById(reminderId)?.status).toBe(
        'acknowledged',
      );
    });

    test('inside a ringing call, reschedule is still reviewed but targets exactly that reminder', () => {
      const userId = owner('call-resched');
      seedReminder(userId, 'Quiz');
      const ringing = seedReminder(userId, 'Quiz');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({intent: 'reschedule', date: tomorrow(), time: '07:30'}),
          {
            ringingCall: {
              reminderId: ringing,
              generation: deliveryStore.get(ringing)?.generation ?? 1,
            },
          },
        ),
      );
      expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
        'applied',
      );
      expect(remindersStore.getReminderById(ringing)?.triggerAt).toBe(
        new Date(`${tomorrow()}T07:30:00`).toISOString(),
      );
    });
  });

  describe('routes that are not reviewed stay unchanged', () => {
    test('schedule queries are read-only and immediate', async () => {
      const userId = owner('query');
      const before = footprint(userId);
      const result = await chatOrchestrator.processMessage(
        userId,
        "What's on my schedule today?",
      );
      expect(result.route).toBe('read_only');
      expect(result.review).toBeUndefined();
      expect(result.actionResult?.intent).toBe('query_schedule');
      expect(footprint(userId)).toEqual(before);
    });

    test('document requests are routed exactly as before, with no review', async () => {
      const userId = owner('doc');
      const offline = await chatOrchestrator.processMessage(
        userId,
        'Create a PDF study guide for Calculus',
      );
      expect(offline.review).toBeUndefined();
      expect(offline.route).toBeUndefined();
      expect(offline.reply).toMatch(/requires Online Mode/);
      const generate = jest.spyOn(documentSkill, 'generate').mockResolvedValue({
        status: 'error',
        error: 'offline',
      } as never);
      const online = await chatOrchestrator.processMessage(
        userId,
        'Create a PDF study guide for Calculus',
        {
          onlineMode: true,
        },
      );
      expect(generate).toHaveBeenCalled();
      expect(online.review).toBeUndefined();
    });

    test('online chat and Handbook RAG are routed exactly as before, with no review', async () => {
      const userId = owner('rag');
      const send = jest
        .spyOn(onlineChatSkill, 'sendChatMessage')
        .mockResolvedValue({
          status: 'success',
          data: {
            reply: 'An INC must be completed within one year.',
            sources: [
              {title: 'USTP Student Handbook', section: 'INC', page: 46},
            ],
          },
        } as never);
      const result = await chatOrchestrator.processMessage(
        userId,
        'What is the INC rule in the handbook?',
        {
          onlineMode: true,
          useHandbook: true,
        },
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][1]).toEqual({useHandbook: true});
      expect(result.route).toBe('conversation');
      expect(result.review).toBeUndefined();
      expect(result.handbookNote).toBe(
        'Referenced USTP Student Handbook (p. 46)',
      );
    });

    test('executeNluAction stays exported and still writes directly for legacy callers', async () => {
      const userId = owner('legacy');
      const result = await executeNluAction(
        userId,
        intent({title: 'Legacy task', date: tomorrow()}),
      );
      expect(result.success).toBe(true);
      expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
    });
  });

  describe('Chat transcript', () => {
    test('Confirm and Cancel record their outcome once', async () => {
      const userId = owner('transcript');
      const {chatStore} = require('../../src/storage');
      const prepared = await chatOrchestrator.processMessage(
        userId,
        'Add task: read chapter 5',
      );
      const proposal = expectProposal(prepared.review as PrepareResult);
      expect(chatStore.getMessages(userId)).toHaveLength(2);
      const confirmed = await chatOrchestrator.confirmReview(
        userId,
        proposal.operationId,
      );
      expect(confirmed.assistantMessage?.content).toMatch(/Added task/);
      await chatOrchestrator.confirmReview(userId, proposal.operationId);
      expect(chatStore.getMessages(userId)).toHaveLength(3);

      const again = await chatOrchestrator.processMessage(
        userId,
        'Add task: read chapter 6',
      );
      const second = expectProposal(again.review as PrepareResult);
      const cancelled = chatOrchestrator.cancelReview(
        userId,
        second.operationId,
      );
      expect(cancelled.cancelled).toBe(true);
      expect(cancelled.reply).toBe('Cancelled. Nothing was changed.');
      expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
    });
  });

  describe('review follow-up', () => {
    const reminderRow = (id: string) =>
      db.executeSync(
        'SELECT task, trigger_at, precast_audio_path, deleted_at FROM reminders WHERE id = ?',
        [id],
      ).rows?.[0];

    const createReviewedTask = (
      userId: string,
      title: string,
      time: string,
    ) => {
      const created = confirmReviewedCommand(
        userId,
        expectProposal(
          prepareReviewedCommand(
            userId,
            intent({title, date: tomorrow(), time}),
          ),
        ).operationId,
      );
      if (created.status !== 'applied') throw new Error('setup failed');
      return {
        taskId: String(created.receipt.entityId),
        reminderId: String(created.receipt.reminderId),
      };
    };

    test('renaming a task renames its linked and legacy reminders and re-registers the alarm with the new title', () => {
      const userId = owner('rename');
      const other = owner('rename-other');
      const {reminderId, taskId} = createReviewedTask(
        userId,
        'Review notes',
        '15:00',
      );
      db.executeSync(
        "UPDATE reminders SET precast_audio_path = '/data/old-title.wav' WHERE id = ?",
        [reminderId],
      );
      const legacy = seedItemReminder(
        userId,
        '  review   NOTES ',
        tomorrow(),
        '15:00',
        5,
      );
      const foreign = seedItemReminder(other, 'Review notes', tomorrow(), '15:00');
      const titleOnly = seedItemReminder(
        userId,
        'Review notes',
        tomorrow(),
        '20:00',
      );
      const removeAudio = jest
        .spyOn(ttsModule, 'deletePreCachedReminderAudio')
        .mockResolvedValue(undefined as never);
      (reminderAlarm.scheduleReminderAlarm as jest.Mock).mockClear();

      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'update_task',
            targetTitle: 'Review notes',
            newTitle: 'Review chapter 3',
            targetEntityType: 'task',
          }),
        ),
      );
      const card = proposal.details.join(' ');
      expect(card).toMatch(/Its 2 reminders will say “Review chapter 3”/);
      expect(card).toMatch(
        /1 older reminder with no link, matched by its title and this item’s time/,
      );
      expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
        'applied',
      );

      expect(reminderRow(reminderId)).toMatchObject({
        task: 'Review chapter 3',
        precast_audio_path: null,
      });
      expect(reminderRow(legacy).task).toBe('Review chapter 3');
      // Confirming recorded the exact link, so the rename cannot orphan it.
      expect(deliveryStore.get(legacy)).toMatchObject({
        sourceType: 'task',
        sourceId: taskId,
      });
      expect(reminderRow(foreign).task).toBe('Review notes');
      expect(reminderRow(titleOnly).task).toBe('Review notes');
      expect(reminderAlarm.scheduleReminderAlarm).toHaveBeenCalledWith(
        reminderId,
        'Review chapter 3',
        String(reminderRow(reminderId).trigger_at),
      );
      expect(reminderAlarm.scheduleReminderAlarm).not.toHaveBeenCalledWith(
        expect.anything(),
        'Review notes',
        expect.anything(),
      );
      expect(removeAudio).toHaveBeenCalledWith('/data/old-title.wav');
      // The outbox carries the new text (coalesced into the pending row).
      const pushed = syncOutboxStore
        .getPendingMutations(userId, 50)
        .filter(m => m.entityId === reminderId);
      expect(pushed.at(-1)?.payload).toMatchObject({task: 'Review chapter 3'});
    });

    test('renaming and moving a task moves its reminder with the new title', () => {
      const userId = owner('rename-move');
      const {reminderId} = createReviewedTask(userId, 'Lab report', '10:00');
      (reminderAlarm.scheduleReminderAlarm as jest.Mock).mockClear();
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'update_task',
            targetTitle: 'Lab report',
            newTitle: 'Lab report draft',
            time: '17:00',
            targetEntityType: 'task',
          }),
        ),
      );
      expect(proposal.details.join(' ')).toMatch(
        /Its reminder moves to 5:00 PM/,
      );
      expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
        'applied',
      );
      const at = new Date(`${tomorrow()}T17:00:00`).toISOString();
      expect(reminderRow(reminderId)).toMatchObject({
        task: 'Lab report draft',
        trigger_at: at,
      });
      expect(reminderAlarm.scheduleReminderAlarm).toHaveBeenCalledWith(
        reminderId,
        'Lab report draft',
        at,
      );
    });

    test('renaming and moving a time block carries its reminder along and keeps its lead time', () => {
      const userId = owner('block-move');
      const date = tomorrow();
      timeBlocksStore.insert({
        id: `${userId}-block`,
        userId,
        title: 'Algorithms',
        date,
        startTime: '14:00',
        endTime: '15:00',
        color: '#3498DB',
        category: 'Academic',
      });
      // Like the Calendar form: a reminder 10 minutes before the start, no link.
      const reminderId = `${userId}-rem`;
      const lead = new Date(`${date}T13:50:00`).toISOString();
      remindersStore.insertReminder({
        id: reminderId,
        userId,
        task: 'Algorithms',
        description: 'Scheduled reminder',
        scheduledAt: new Date(`${date}T14:00:00`).toISOString(),
        triggerAt: lead,
        status: 'pending',
        preCastAudioPath: null,
      });
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'update_time_block',
            targetTitle: 'Algorithms',
            newTitle: 'Algorithms lab',
            time: '16:00',
          }),
        ),
      );
      expect(proposal.details.join(' ')).toMatch(/moves with it/);
      expect(proposal.details.join(' ')).toMatch(/older reminder with no link/);
      expect(confirmReviewedCommand(userId, proposal.operationId).status).toBe(
        'applied',
      );
      expect(deliveryStore.get(reminderId)).toMatchObject({
        sourceType: 'time_block',
        sourceId: `${userId}-block`,
      });
      expect(reminderRow(reminderId)).toMatchObject({
        task: 'Algorithms lab',
        trigger_at: new Date(`${date}T15:50:00`).toISOString(),
      });
      expect(reminderAlarm.scheduleReminderAlarm).toHaveBeenCalledWith(
        reminderId,
        'Algorithms lab',
        new Date(`${date}T15:50:00`).toISOString(),
      );
    });

    test('legacy reminder cleanup ignores case and spacing but stays within the owner', () => {
      const userId = owner('legacy-case');
      const other = owner('legacy-case-other');
      const date = tomorrow();
      const taskId = seedTask(userId, 'Quiz', {dueDate: date, dueTime: '11:00'});
      const mine = seedItemReminder(userId, '  QUIZ ', date, '11:00');
      const spaced = seedItemReminder(userId, 'quiz', date, '11:00', 10);
      const foreign = seedItemReminder(other, 'Quiz', date, '11:00');
      const unrelated = seedItemReminder(userId, 'Quiz review', date, '11:00');
      const otherTime = seedItemReminder(userId, 'Quiz', date, '12:00');
      tasksStore.deleteTask(taskId);
      expect(remindersStore.getReminderById(mine)).toBeNull();
      expect(remindersStore.getReminderById(spaced)).toBeNull();
      expect(remindersStore.getReminderById(foreign)).not.toBeNull();
      expect(remindersStore.getReminderById(unrelated)).not.toBeNull();
      // A shared title without the item's time is never treated as ownership.
      expect(remindersStore.getReminderById(otherTime)).not.toBeNull();
    });

    test('an unlinked reminder that two items could own belongs to neither', () => {
      const userId = owner('legacy-ambiguous');
      const date = tomorrow();
      const first = seedTask(userId, 'Group study', {
        dueDate: date,
        dueTime: '16:00',
      });
      seedTask(userId, 'group study', {dueDate: date, dueTime: '16:00'});
      const shared = seedItemReminder(userId, 'Group study', date, '16:00');
      tasksStore.deleteTask(first);
      expect(remindersStore.getReminderById(shared)).not.toBeNull();
      expect(reminderRow(shared).task).toBe('Group study');
    });

    test('the delete card lists every reminder that goes with the item, and a changed set refuses', () => {
      const userId = owner('delete-card');
      const {reminderId} = createReviewedTask(userId, 'Essay', '15:00');
      const legacy = seedItemReminder(userId, 'essay', tomorrow(), '15:00', 30);
      const elsewhere = seedItemReminder(userId, 'Essay', tomorrow(), '08:00');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'delete_task',
            targetTitle: 'Essay',
            targetEntityType: 'task',
          }),
        ),
      );
      const lines = proposal.details.filter(line =>
        line.startsWith('Also removes'),
      );
      expect(lines).toHaveLength(2);
      expect(lines.filter(line => /older reminder with no link/.test(line))).toEqual([
        expect.stringContaining('“essay”'),
      ]);
      expect(proposal.details.join(' ')).not.toMatch(/its own pending/);

      // A new same-title reminder appears before Confirm: not on the card, so refuse.
      const late = seedItemReminder(userId, 'ESSAY', tomorrow(), '15:00', 60);
      expect(
        confirmReviewedCommand(userId, proposal.operationId),
      ).toMatchObject({reason: 'stale'});
      expect(tasksStore.getAllTasks(userId)).toHaveLength(1);
      expect(remindersStore.getReminderById(late)).not.toBeNull();

      const again = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'delete_task',
            targetTitle: 'Essay',
            targetEntityType: 'task',
          }),
        ),
      );
      expect(
        again.details.filter(line => line.startsWith('Also removes')),
      ).toHaveLength(3);
      expect(confirmReviewedCommand(userId, again.operationId).status).toBe(
        'applied',
      );
      for (const id of [reminderId, legacy, late]) {
        expect(remindersStore.getReminderById(id)).toBeNull();
      }
      expect(remindersStore.getReminderById(elsewhere)).not.toBeNull();
    });

    test('an item with no reminders says so instead of promising cleanup', () => {
      const userId = owner('delete-none');
      seedTask(userId, 'Read chapter');
      const proposal = expectProposal(
        prepareReviewedCommand(
          userId,
          intent({
            intent: 'delete_task',
            targetTitle: 'Read chapter',
            targetEntityType: 'task',
          }),
        ),
      );
      expect(proposal.details).toContain(
        'No reminders are attached, so only this item is removed.',
      );
    });

    test('a card prepared before sign-out cannot be confirmed after signing back in', () => {
      const userId = owner('relogin');
      userStore.setCurrentUser(userId);
      try {
        const proposal = expectProposal(
          prepareReviewedCommand(userId, intent({title: 'Essay'})),
        );
        const signedInAt = String(
          db.executeSync('SELECT created_at FROM active_session').rows?.[0]
            ?.created_at,
        );
        userStore.logout();
        // Make sure the new sign-in has a later timestamp.
        while (new Date().toISOString() === signedInAt) {
          /* spin for one millisecond */
        }
        userStore.setCurrentUser(userId);
        expect(
          confirmReviewedCommand(userId, proposal.operationId),
        ).toMatchObject({status: 'refused', reason: 'owner_mismatch'});
        expect(tasksStore.getAllTasks(userId)).toHaveLength(0);

        // App.tsx also ends the review session on every account change.
        const next = expectProposal(
          prepareReviewedCommand(userId, intent({title: 'Essay'})),
        );
        endReviewSession();
        expect(confirmReviewedCommand(userId, next.operationId)).toMatchObject({
          reason: 'not_found',
        });
      } finally {
        db.executeSync('DELETE FROM active_session');
      }
    });

    test('App ends open reviews when the active account changes', () => {
      const app = fs.readFileSync(
        path.join(__dirname, '../../App.tsx'),
        'utf8',
      );
      const effect = app.slice(
        app.indexOf('const previous = previousUserRef.current;'),
      );
      expect(effect.indexOf('endReviewSession();')).toBeGreaterThan(0);
      expect(effect.indexOf('endReviewSession();')).toBeLessThan(
        effect.indexOf('}, [userId]);'),
      );
    });

    test('no product module calls the unreviewed end-to-end helper', () => {
      const root = path.join(__dirname, '../../src');
      const walk = (dir: string): string[] =>
        fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) return walk(full);
          return /\.tsx?$/.test(entry.name) ? [full] : [];
        });
      const offenders = walk(root)
        .map(file => path.relative(root, file).split(path.sep).join('/'))
        .filter(file => file !== 'ai/nlu/intentService.ts')
        .filter(file =>
          /\bprocessAndExecuteIntent\b/.test(
            fs.readFileSync(path.join(root, file), 'utf8'),
          ),
        );
      expect(offenders).toEqual([]);
    });

    describe('sync pull between prepare and Confirm (full runSyncPass, fake server)', () => {
      const originalToken = cloudClient.getAccessToken;
      const originalOnline = cloudClient.isOnline;
      const previousFetch = global.fetch;
      let serverChanges: unknown[] = [];
      let changeId = 100;

      const respond = (payload: unknown) =>
        ({
          ok: true,
          status: 200,
          headers: {get: () => 'application/json'},
          text: async () => JSON.stringify(payload),
          json: async () => payload,
        } as unknown as Response);

      beforeEach(() => {
        cloudClient.getAccessToken = () => 'synthetic-token';
        cloudClient.isOnline = async () => true;
        global.fetch = jest.fn(async (url: string, init: RequestInit) => {
          if (!String(url).endsWith('/v1/sync/batch')) {
            return {...respond({}), ok: false, status: 404} as Response;
          }
          const body = JSON.parse(String(init.body));
          const changes = serverChanges;
          serverChanges = [];
          return respond({
            accepted: (body.mutations as any[]).map(m => ({
              mutationId: m.mutationId,
              entityType: m.entityType,
              entityId: m.entityId,
              status: 'accepted',
              serverVersion: 1,
            })),
            rejected: [],
            changes: body.snapshot ? [] : changes,
            nextCursor: body.snapshot ? body.cursor : changeId,
            hasMore: false,
            resetRequired: false,
            serverTime: new Date().toISOString(),
            snapshot: body.snapshot
              ? {
                  boundaryCursor: changeId,
                  items: [],
                  nextAfter: null,
                  hasMore: false,
                  complete: true,
                  authoritativeEntityTypes: AUTHORITATIVE_SYNC_ENTITY_TYPES,
                  prunePolicy: {
                    preserveOutboxStatuses: [
                      'pending',
                      'in_progress',
                      'failed',
                    ],
                    requireExistingSyncMetadata: true,
                  },
                }
              : null,
            supportedEntityTypes: [...CLIENT_SYNC_ENTITY_TYPES],
          });
        }) as unknown as typeof fetch;
      });

      afterEach(() => {
        cloudClient.getAccessToken = originalToken;
        cloudClient.isOnline = originalOnline;
        global.fetch = previousFetch;
        db.executeSync('DELETE FROM active_session');
      });

      const seedSyncedTask = (userId: string, id: string, title: string) => {
        const now = new Date().toISOString();
        db.executeSync(
          `INSERT INTO tasks (id, user_id, title, due_date, due_time, is_completed, priority, category, notes, recurrence_rule, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, '10:00', 0, 'Medium', 'Academic', NULL, NULL, ?, ?, NULL)`,
          [id, userId, title, tomorrow(), now, now],
        );
      };

      const taskChange = (id: string, title: string) => {
        changeId += 1;
        return {
          changeId,
          entityType: 'task',
          entityId: id,
          operation: 'update',
          version: changeId,
          payload: {
            title,
            due_date: tomorrow(),
            due_time: '10:00',
            is_completed: false,
            priority: 'Medium',
            category: 'Academic',
            notes: null,
            recurrence_rule: null,
          },
          updatedAt: new Date(Date.now() + 60_000).toISOString(),
        };
      };

      test('an echo with identical values keeps the review confirmable; a real change refuses it', async () => {
        const userId = owner('sync-echo');
        const now = new Date().toISOString();
        db.executeSync(
          `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
           VALUES (?, ?, ?, 'student', 0, ?, ?)`,
          [userId, userId, `${userId}@example.invalid`, now, now],
        );
        userStore.setCurrentUser(userId);
        await syncWorker.runSyncPass(); // first pass negotiates the snapshot

        const echoId = `${userId}-echo`;
        const changedId = `${userId}-changed`;
        seedSyncedTask(userId, echoId, 'Echo task');
        seedSyncedTask(userId, changedId, 'Changed task');
        const echoReview = expectProposal(
          prepareReviewedCommand(
            userId,
            intent({
              intent: 'update_task',
              targetTitle: 'Echo task',
              time: '16:00',
              targetEntityType: 'task',
            }),
          ),
        );
        const changedReview = expectProposal(
          prepareReviewedCommand(
            userId,
            intent({
              intent: 'delete_task',
              targetTitle: 'Changed task',
              targetEntityType: 'task',
            }),
            {surface: 'voice'},
          ),
        );
        const before = {
          echo: assistantOperationStore.revisionOf('task', echoId),
          changed: assistantOperationStore.revisionOf('task', changedId),
        };

        serverChanges = [
          taskChange(echoId, 'Echo task'),
          taskChange(changedId, 'Changed task (edited on laptop)'),
        ];
        await syncWorker.runSyncPass();

        // The pull really ran: the changed row has the server's title.
        expect(
          tasksStore.getAllTasks(userId).find(t => t.id === changedId)?.title,
        ).toBe('Changed task (edited on laptop)');
        expect(assistantOperationStore.revisionOf('task', echoId)).toBe(
          before.echo,
        );
        expect(assistantOperationStore.revisionOf('task', changedId)).toBe(
          before.changed + 1,
        );

        expect(
          confirmReviewedCommand(userId, echoReview.operationId).status,
        ).toBe('applied');
        expect(
          confirmReviewedCommand(userId, changedReview.operationId),
        ).toMatchObject({reason: 'stale'});
        expect(
          tasksStore.getAllTasks(userId).find(t => t.id === changedId),
        ).toBeDefined();
      });
    });
  });
});
