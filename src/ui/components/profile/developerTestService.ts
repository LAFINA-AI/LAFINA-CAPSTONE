import {DeviceEventEmitter} from 'react-native';
import {
  db,
  StorageHealth,
  DatabaseTransaction,
} from '../../../storage/database';
import {generateId} from '../../../utils/id';
import {remindersStore} from '../../../storage/remindersStore';
import {deliveryStore} from '../../../storage/deliveryStore';
import {tasksStore} from '../../../storage/tasksStore';
import {notesStore} from '../../../storage/notesStore';
import {timeBlocksStore} from '../../../storage/timeBlocksStore';
import {syncStateStore} from '../../../storage/syncStateStore';
import {localSettingsStore} from '../../../storage/localSettingsStore';
import {
  reconcileReminderDelivery,
  EVENT_CALL_TRIGGER,
  getReminderPermissionStatus,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
  cancelReminderAlarm,
} from '../../../scheduler';
import {getNativeDeliveryModule} from '../../../scheduler/reminderAlarm';
import type {
  ReminderPermissionStatus,
  NativeDeliveryRegistration,
} from '../../../scheduler';
import {syncWorker} from '../../../sync/syncWorker';
import {cloudClient} from '../../../cloud/cloudClient';
import {
  backendSelection,
  DEVICE_SETTINGS_OWNER,
} from '../../../cloud/backendSelection';
import {IntentService} from '../../../ai/nlu/intentService';
import {formatLocalDate} from '../../../ai/nlu/fastPathParser';
import {routeIntent} from '../../../ai/nlu/intentRoutes';
import {
  prepareReviewedCommand,
  confirmReviewedCommand,
} from '../../../ai/nlu/commandReview';
import {buildLocalConversationReply} from '../../../ai/localConversation';
import {plannerQueries} from '../../../storage/plannerQueries';
import {notesQueryStore} from '../../../storage/notesQueryStore';
import type {ValidatedIntent, NluActionResult} from '../../../ai/nlu/types';

export const DEVELOPER_MODE_KEY = 'debug.developer_mode';
export const DEV_FIXTURE_TAG = '[DevFixture]';

export interface DatabaseDiagnostics {
  health: StorageHealth;
  counts: {
    tasks: number;
    events: number;
    timeBlocks: number;
    reminders: number;
    notes: number;
    customCategories: number;
    outbox: number;
    deliveryJobs: number;
    chatMessages: number;
  };
}

export interface SyncDiagnostics {
  status: string;
  lastSyncedAt: string | null;
  cursor: number;
  errorMessage: string | null;
  outboxCount: number;
  outboxPending: number;
  outboxFailed: number;
  conflictCount: number;
  activeBaseUrl: string;
  backendChoice: string;
}

export interface AlarmDiagnostics {
  permissions: ReminderPermissionStatus | null;
  nativeRegistrations: NativeDeliveryRegistration[];
  pendingRemindersCount: number;
  armedJobsCount: number;
}

export const developerTestService = {
  /**
   * Checks whether developer mode is active.
   * Only enabled when explicitly toggled on (5 taps on App Version).
   */
  isDeveloperModeEnabled: (): boolean => {
    const saved = localSettingsStore.get(
      DEVICE_SETTINGS_OWNER,
      DEVELOPER_MODE_KEY,
    );
    return saved === 'true';
  },

  /**
   * Saves the developer mode state.
   */
  setDeveloperModeEnabled: (enabled: boolean): boolean => {
    return localSettingsStore.set(
      DEVICE_SETTINGS_OWNER,
      DEVELOPER_MODE_KEY,
      enabled ? 'true' : 'false',
    );
  },

  /**
   * Simulates an incoming reminder call immediately.
   * Creates a test reminder due now, reconciles it with deliveryStore,
   * and emits EVENT_CALL_TRIGGER to present the full IncomingCallScreen.
   */
  triggerImmediateCall: async (
    userId: string,
    taskTitle: string = 'CS402 Capstone Progress Check',
  ): Promise<{success: boolean; message: string; reminderId?: string}> => {
    try {
      const reminderId = generateId('dev-call');
      const nowIso = new Date().toISOString();
      const task = `${DEV_FIXTURE_TAG} ${taskTitle}`.trim();

      remindersStore.insertReminder({
        id: reminderId,
        userId,
        task,
        description:
          'Simulated incoming call triggered from Developer Settings for testing ringer, answer/decline, and voice recognition.',
        scheduledAt: nowIso,
        triggerAt: nowIso,
        status: 'pending',
        preCastAudioPath: null,
      });

      await reconcileReminderDelivery(userId);
      const job = deliveryStore.get(reminderId);

      DeviceEventEmitter.emit(EVENT_CALL_TRIGGER, {
        reminderId,
        task,
        ownerId: userId,
        generation: job?.generation ?? 1,
      });

      return {
        success: true,
        message: 'Simulated incoming call dispatched!',
        reminderId,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {success: false, message: `Failed to trigger call: ${msg}`};
    }
  },

  /**
   * Schedules an exact AlarmManager alarm due in N seconds.
   * Tests native background alarm delivery, lock screen full-screen intent,
   * and heads-up notification.
   */
  scheduleExactAlarmInSeconds: async (
    userId: string,
    seconds: number,
    taskTitle: string = 'Test Native Alarm',
  ): Promise<{success: boolean; message: string; reminderId?: string}> => {
    try {
      const reminderId = generateId('dev-alarm');
      const now = Date.now();
      const triggerMs = now + seconds * 1000;
      const triggerIso = new Date(triggerMs).toISOString();
      const task = `${DEV_FIXTURE_TAG} ${taskTitle}`.trim();

      remindersStore.insertReminder({
        id: reminderId,
        userId,
        task,
        description: `Exact alarm scheduled for ${seconds}s from Developer Settings.`,
        scheduledAt: new Date(now).toISOString(),
        triggerAt: triggerIso,
        status: 'pending',
        preCastAudioPath: null,
      });

      const summary = await reconcileReminderDelivery(userId);
      const timeStr = new Date(triggerMs).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      return {
        success: true,
        message: `AlarmManager exact alarm armed for ${timeStr} (in ${seconds}s). Registered: ${summary.registered}, Kept: ${summary.kept}. Lock screen or minimize app to test background wakeup!`,
        reminderId,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {success: false, message: `Failed to schedule alarm: ${msg}`};
    }
  },

  /**
   * Cancels all test reminders created by developer tools.
   */
  cancelAllTestReminders: async (userId: string): Promise<{count: number}> => {
    let count = 0;
    try {
      const pending = remindersStore.getPendingReminders(userId);
      for (const rem of pending) {
        if (
          rem.task.includes(DEV_FIXTURE_TAG) ||
          rem.id.startsWith('dev-') ||
          rem.id.startsWith('test-')
        ) {
          remindersStore.updateReminderStatus(rem.id, 'acknowledged');
          await cancelReminderAlarm(rem.id).catch(() => undefined);
          count++;
        }
      }
      await reconcileReminderDelivery(userId);
    } catch (error) {
      console.warn(
        '[DeveloperTestService] cancelAllTestReminders error:',
        error,
      );
    }
    return {count};
  },

  /**
   * Forces a cloud sync pass immediately and returns performance metrics.
   */
  triggerForceSync: async (): Promise<{
    success: boolean;
    message: string;
    durationMs: number;
  }> => {
    const start = Date.now();
    try {
      await syncWorker.performSync();
      const durationMs = Date.now() - start;
      return {
        success: true,
        message: `Sync completed successfully in ${durationMs}ms.`,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Sync pass encountered an error: ${msg}`,
        durationMs,
      };
    }
  },

  /**
   * Gathers sync diagnostics: status, cursor, outbox queue, conflicts, active backend.
   */
  getSyncDiagnostics: (userId: string): SyncDiagnostics => {
    const state = syncStateStore.load(userId);
    let outboxCount = 0;
    let outboxPending = 0;
    let outboxFailed = 0;
    let conflictCount = 0;

    try {
      const countRes = db.executeSync(
        'SELECT COUNT(*) as cnt, status FROM sync_outbox WHERE user_id = ? GROUP BY status',
        [userId],
      );
      for (const row of countRes.rows || []) {
        const cnt = Number(row.cnt || 0);
        outboxCount += cnt;
        if (row.status === 'pending') outboxPending += cnt;
        if (row.status === 'failed') outboxFailed += cnt;
      }
    } catch {
      // Ignore query errors
    }

    try {
      const conflictRes = db.executeSync(
        'SELECT COUNT(*) as cnt FROM sync_conflicts WHERE user_id = ?',
        [userId],
      );
      conflictCount = Number(conflictRes.rows?.[0]?.cnt || 0);
    } catch {
      // Ignore query errors
    }

    return {
      status: state.status,
      lastSyncedAt: state.lastSyncedAt,
      cursor: state.cursor,
      errorMessage: state.errorMessage,
      outboxCount,
      outboxPending,
      outboxFailed,
      conflictCount,
      activeBaseUrl: cloudClient.getBaseUrl(),
      backendChoice: backendSelection.current() || 'custom',
    };
  },

  /**
   * Clears pending items from the sync outbox (useful when a bad mutation blocks sync during testing).
   */
  clearSyncOutbox: (userId: string): number => {
    try {
      const res = db.executeSync('DELETE FROM sync_outbox WHERE user_id = ?', [
        userId,
      ]);
      return res.rowsAffected || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Resets the local sync cursor to 0, forcing a full snapshot re-fetch on the next sync pass.
   */
  resetSyncCursor: (userId: string): void => {
    try {
      syncStateStore.save(userId, {
        status: 'Synced',
        cursor: 0,
        lastSyncedAt: null,
        errorMessage: null,
      });
    } catch (error) {
      console.warn('[DeveloperTestService] Failed to reset cursor:', error);
    }
  },

  /**
   * Seeds realistic academic sample data (Tasks, Events, TimeBlocks, Reminders, Notes, Categories).
   */
  seedStudentSampleData: async (
    userId: string,
  ): Promise<{
    success: boolean;
    created: {
      tasks: number;
      events: number;
      timeBlocks: number;
      reminders: number;
      notes: number;
      categories: number;
    };
  }> => {
    const created = {
      tasks: 0,
      events: 0,
      timeBlocks: 0,
      reminders: 0,
      notes: 0,
      categories: 0,
    };

    try {
      // 1. Ensure sample Categories
      const existingCats = notesStore.getCustomCategories(userId);
      const catNames = new Set(
        existingCats.map((c: {name: string}) => c.name.toLowerCase()),
      );
      const sampleCats = [
        {name: 'Academics', color: '#3B82F6'},
        {name: 'Capstone Project', color: '#8B5CF6'},
        {name: 'Personal', color: '#10B981'},
      ];
      for (const cat of sampleCats) {
        if (!catNames.has(cat.name.toLowerCase())) {
          notesStore.addCustomCategory(userId, cat.name, cat.color);
          created.categories++;
        }
      }

      // Dates calculation
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      const inTwoDays = new Date(today);
      inTwoDays.setDate(inTwoDays.getDate() + 2);
      const inTwoDaysStr = inTwoDays.toISOString().slice(0, 10);

      // 2. Sample Tasks
      const sampleTasks = [
        {
          title: `${DEV_FIXTURE_TAG} Submit CS402 Capstone Proposal`,
          dueDate: inTwoDaysStr,
          dueTime: '17:00',
          priority: 'High' as const,
          category: 'Capstone Project',
          notes:
            'Include system architecture diagrams and offline synchronization design.',
        },
        {
          title: `${DEV_FIXTURE_TAG} Read Database Internals Chapter 4 (B-Trees & WAL)`,
          dueDate: tomorrowStr,
          dueTime: '20:00',
          priority: 'Medium' as const,
          category: 'Academics',
          notes:
            'Prepare notes on write-ahead logging and atomic transactions.',
        },
        {
          title: `${DEV_FIXTURE_TAG} Buy engineering notebook & sticky flags`,
          dueDate: null,
          dueTime: null,
          priority: 'Low' as const,
          category: 'Personal',
          notes: 'Campus bookstore or stationery shop.',
        },
      ];

      for (const t of sampleTasks) {
        tasksStore.insertTask({
          id: generateId('task'),
          userId,
          title: t.title,
          dueDate: t.dueDate,
          dueTime: t.dueTime,
          isCompleted: false,
          priority: t.priority,
          category: t.category,
          notes: t.notes,
          recurrenceRule: null,
        });
        created.tasks++;
      }

      // 3. Sample Events
      const sampleEvents = [
        {
          title: `${DEV_FIXTURE_TAG} Software Engineering Lecture`,
          date: todayStr,
          startTime: '10:00',
          endTime: '11:30',
          location: 'IT Building Room 302',
        },
        {
          title: `${DEV_FIXTURE_TAG} Database Systems Lab`,
          date: todayStr,
          startTime: '14:00',
          endTime: '16:00',
          location: 'Computer Lab 3',
        },
        {
          title: `${DEV_FIXTURE_TAG} Capstone Weekly Standup`,
          date: tomorrowStr,
          startTime: '13:00',
          endTime: '14:00',
          location: 'Conference Room B',
        },
      ];

      for (const ev of sampleEvents) {
        tasksStore.insertEvent({
          id: generateId('event'),
          userId,
          title: ev.title,
          date: ev.date,
          startTime: ev.startTime,
          endTime: ev.endTime,
          location: ev.location,
          linkedCalendarBlock: null,
          recurrenceRule: null,
        });
        created.events++;
      }

      // 4. Sample Time Block
      timeBlocksStore.insert({
        id: generateId('block'),
        userId,
        title: `${DEV_FIXTURE_TAG} Deep Focus: System Design & Offline STT`,
        date: todayStr,
        startTime: '16:30',
        endTime: '18:30',
        color: '#6366F1',
        category: 'Capstone Project',
        notes: 'Test Whisper.cpp integration and benchmark latency.',
        recurrenceRule: null,
      });
      created.timeBlocks++;

      // 5. Sample Reminders
      const remTrigger1 = new Date(
        Date.now() + 4 * 60 * 60 * 1000,
      ).toISOString();
      const remTrigger2 = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      remindersStore.insertReminder({
        id: generateId('reminder'),
        userId,
        task: `${DEV_FIXTURE_TAG} Review System Architecture Diagram with Mentor`,
        description:
          'Verify op-sqlite transaction boundaries and sync outbox pipeline.',
        scheduledAt: today.toISOString(),
        triggerAt: remTrigger1,
        status: 'pending',
        preCastAudioPath: null,
      });
      created.reminders++;

      remindersStore.insertReminder({
        id: generateId('reminder'),
        userId,
        task: `${DEV_FIXTURE_TAG} Submit Capstone Weekly Progress Report`,
        description:
          'Summarize offline NLU intent accuracy and ElevenLabs TTS fallback.',
        scheduledAt: today.toISOString(),
        triggerAt: remTrigger2,
        status: 'pending',
        preCastAudioPath: null,
      });
      created.reminders++;

      // 6. Sample Notes with Markdown
      const sampleNotes = [
        {
          title: `${DEV_FIXTURE_TAG} CS402 Capstone Architecture Notes`,
          category: 'Capstone Project',
          tags: ['capstone', 'architecture', 'offline-first'],
          body: [
            '# LAFINA-CAPSTONE System Architecture',
            '',
            '## Key Subsystems',
            '- **Local Database**: SQLite via `@op-engineering/op-sqlite` with write-ahead logging.',
            '- **Exact Alarms**: Android `AlarmManager` with cold-start full-screen intent.',
            '- **Offline Speech**: Whisper.cpp + Silero VAD on-device.',
            '- **Intent Extractor**: Deterministic fast path (<5ms) with SmolLM2 fallback.',
            '- **Cloud Sync**: Outbox pattern with vector cursors and Vercel backend.',
            '',
            '## Testing Guidelines',
            '1. Trigger immediate call to verify custom ringer and answered view.',
            '2. Schedule 5s native alarm to test device background wakeup.',
            '3. Run full sync to verify cloud replication.',
          ].join('\n'),
        },
        {
          title: `${DEV_FIXTURE_TAG} Database Normalization Cheat Sheet`,
          category: 'Academics',
          tags: ['database', 'study-notes', 'exams'],
          body: [
            '# Relational Database Normalization',
            '',
            '- **1NF**: Atomic column values, unique row keys.',
            '- **2NF**: In 1NF and no partial functional dependencies on candidate keys.',
            '- **3NF**: In 2NF and no transitive functional dependencies.',
            '- **BCNF**: For every functional dependency `X -> Y`, `X` must be a superkey.',
          ].join('\n'),
        },
      ];

      for (const n of sampleNotes) {
        notesStore.insert({
          id: generateId('note'),
          userId,
          title: n.title,
          body: n.body,
          isPinned: false,
          tags: n.tags,
          category: n.category,
          isVoiceTranscribed: false,
          imageUri: null,
        });
        created.notes++;
      }

      // Reconcile reminder delivery jobs
      await reconcileReminderDelivery(userId);

      return {success: true, created};
    } catch (error) {
      console.error(
        '[DeveloperTestService] seedStudentSampleData error:',
        error,
      );
      return {success: false, created};
    }
  },

  /**
   * Cleans up seeded student sample data without touching user's real records.
   */
  clearSeededStudentData: async (
    userId: string,
  ): Promise<{success: boolean; removed: number}> => {
    let removed = 0;
    try {
      db.transactionSync((tx: DatabaseTransaction) => {
        // Delete tasks
        const tasksRes = tx.executeSync(
          'DELETE FROM tasks WHERE user_id = ? AND (title LIKE ? OR notes LIKE ?)',
          [userId, `%${DEV_FIXTURE_TAG}%`, `%${DEV_FIXTURE_TAG}%`],
        );
        removed += tasksRes.rowsAffected || 0;

        // Delete events
        const eventsRes = tx.executeSync(
          'DELETE FROM events WHERE user_id = ? AND title LIKE ?',
          [userId, `%${DEV_FIXTURE_TAG}%`],
        );
        removed += eventsRes.rowsAffected || 0;

        // Delete time blocks
        const blocksRes = tx.executeSync(
          'DELETE FROM time_blocks WHERE user_id = ? AND title LIKE ?',
          [userId, `%${DEV_FIXTURE_TAG}%`],
        );
        removed += blocksRes.rowsAffected || 0;

        // Delete reminders
        const remsRes = tx.executeSync(
          'DELETE FROM reminders WHERE user_id = ? AND task LIKE ?',
          [userId, `%${DEV_FIXTURE_TAG}%`],
        );
        removed += remsRes.rowsAffected || 0;

        // Delete notes
        const notesRes = tx.executeSync(
          'DELETE FROM notes WHERE user_id = ? AND (title LIKE ? OR body LIKE ?)',
          [userId, `%${DEV_FIXTURE_TAG}%`, `%${DEV_FIXTURE_TAG}%`],
        );
        removed += notesRes.rowsAffected || 0;
      });

      await reconcileReminderDelivery(userId);
      return {success: true, removed};
    } catch (error) {
      console.error(
        '[DeveloperTestService] clearSeededStudentData error:',
        error,
      );
      return {success: false, removed};
    }
  },

  /**
   * Retrieves SQLite database diagnostics and record counts for all 7 entity types.
   */
  getDatabaseDiagnostics: (userId: string): DatabaseDiagnostics => {
    const countSoftDeleted = (table: string): number => {
      try {
        const res = db.executeSync(
          `SELECT COUNT(*) as cnt FROM ${table} WHERE user_id = ? AND deleted_at IS NULL`,
          [userId],
        );
        return Number(res.rows?.[0]?.cnt || 0);
      } catch {
        return 0;
      }
    };

    const countSimple = (table: string): number => {
      try {
        const res = db.executeSync(
          `SELECT COUNT(*) as cnt FROM ${table} WHERE user_id = ?`,
          [userId],
        );
        return Number(res.rows?.[0]?.cnt || 0);
      } catch {
        return 0;
      }
    };

    const countMessages = (): number => {
      try {
        const res = db.executeSync(
          `SELECT COUNT(*) as cnt FROM messages m
           JOIN chat_sessions s ON s.id = m.session_id
           WHERE s.user_id = ?`,
          [userId],
        );
        return Number(res.rows?.[0]?.cnt || 0);
      } catch {
        return 0;
      }
    };

    return {
      health: db.getHealth(),
      counts: {
        tasks: countSoftDeleted('tasks'),
        events: countSoftDeleted('events'),
        timeBlocks: countSoftDeleted('time_blocks'),
        reminders: countSoftDeleted('reminders'),
        notes: countSoftDeleted('notes'),
        customCategories: countSoftDeleted('custom_categories'),
        outbox: countSimple('sync_outbox'),
        deliveryJobs: countSimple('reminder_delivery_jobs'),
        chatMessages: countMessages(),
      },
    };
  },

  /**
   * Reads current alarm permissions and active registrations.
   */
  getAlarmDiagnostics: async (userId: string): Promise<AlarmDiagnostics> => {
    let permissions: ReminderPermissionStatus | null = null;
    let nativeRegistrations: NativeDeliveryRegistration[] = [];

    try {
      permissions = await getReminderPermissionStatus();
    } catch {
      // Permission check failed
    }

    try {
      const module = getNativeDeliveryModule();
      if (module?.listDeliveryRegistrations) {
        nativeRegistrations = (await module.listDeliveryRegistrations()) || [];
      }
    } catch {
      // Native module unavailable
    }

    let pendingRemindersCount = 0;
    let armedJobsCount = 0;

    try {
      const remRes = db.executeSync(
        "SELECT COUNT(*) as cnt FROM reminders WHERE user_id = ? AND status = 'pending' AND deleted_at IS NULL",
        [userId],
      );
      pendingRemindersCount = Number(remRes.rows?.[0]?.cnt || 0);

      const jobRes = db.executeSync(
        "SELECT COUNT(*) as cnt FROM reminder_delivery_jobs WHERE user_id = ? AND state = 'armed'",
        [userId],
      );
      armedJobsCount = Number(jobRes.rows?.[0]?.cnt || 0);
    } catch {
      // Ignore
    }

    return {
      permissions,
      nativeRegistrations,
      pendingRemindersCount,
      armedJobsCount,
    };
  },

  /**
   * Tests NLU intent extraction on a given user utterance.
   */
  testNluIntent: async (
    transcript: string,
    referenceDate?: Date,
  ): Promise<ValidatedIntent> => {
    const service = new IntentService();
    return service.extractIntent(transcript, {referenceDate});
  },

  /**
   * Executes a validated NLU intent on behalf of the user via the reviewed
   * command gate for planner mutations or local read/conversation handlers.
   */
  executeNluIntent: async (
    intent: ValidatedIntent,
    userId: string,
  ): Promise<NluActionResult> => {
    if (!intent.isValid) {
      return {
        success: false,
        intent: intent.intent,
        reply: intent.validationError || 'Could not understand the request.',
        error: intent.validationError,
      };
    }

    const route = routeIntent(intent.intent);
    if (route === 'reviewed_mutation') {
      const prepared = prepareReviewedCommand(userId, intent, {
        surface: 'chat',
      });
      if (prepared.status !== 'proposal') {
        return {
          success: false,
          intent: intent.intent,
          reply: prepared.reply,
          error: prepared.reply,
        };
      }
      const outcome = confirmReviewedCommand(
        userId,
        prepared.proposal.operationId,
      );
      if (outcome.status === 'applied') {
        return {
          success: true,
          intent: intent.intent,
          entityType: outcome.receipt
            .entityType as NluActionResult['entityType'],
          entityId: outcome.receipt.entityId ?? undefined,
          reply: outcome.reply,
        };
      }
      return {
        success: false,
        intent: intent.intent,
        reply: outcome.reply,
        error: outcome.reply,
      };
    }

    if (intent.intent === 'query_notes') {
      const search = (intent.title || intent.details || '').trim() || undefined;
      const page = notesQueryStore.page({
        userId,
        search,
        limit: 5,
      });
      const count = page.items.length;
      const reply =
        count === 0
          ? search
            ? `No notes found matching "${search}".`
            : 'You do not have any notes yet.'
          : `Found ${count} note${count === 1 ? '' : 's'}: ${page.items
              .map(n => n.title)
              .join(', ')}.`;
      return {success: true, intent: 'query_notes', reply};
    }

    if (intent.intent === 'query_schedule') {
      const dateStr = intent.date || formatLocalDate(new Date());
      const window = plannerQueries.window(userId, dateStr, dateStr);
      const total =
        window.tasks.length + window.events.length + window.blocks.length;
      const reply =
        total === 0
          ? `No tasks, events, or time blocks scheduled for ${dateStr}.`
          : `Schedule for ${dateStr}: ${window.tasks.length} task(s), ${window.events.length} event(s), ${window.blocks.length} time block(s).`;
      return {success: true, intent: 'query_schedule', reply};
    }

    return {
      success: true,
      intent: intent.intent,
      reply: buildLocalConversationReply(
        userId,
        intent.rawTranscript || intent.title || '',
      ),
    };
  },

  /**
   * Direct permission shortcuts to Android OS settings.
   */
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
};
