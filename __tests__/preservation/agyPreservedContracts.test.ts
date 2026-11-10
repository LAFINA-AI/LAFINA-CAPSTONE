/**
 * AGY-PORT 00 characterization of protected AGY contracts (PF01-PF13) at seams
 * the port will touch. Every value here is synthetic; cloud calls go to a fake
 * `fetch`, so these are contract tests and never evidence of live behavior.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  db,
  initDatabase,
  notesStore,
  remindersStore,
  syncOutboxStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {guestMigration} from '../../src/storage/guestMigration';
import {syncStateStore} from '../../src/storage/syncStateStore';
import {GUEST_USER_ID} from '../../src/constants';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  hasProEntitlement,
  isGuestAccount,
  isStudentProAccount,
  isStudentProRole,
} from '../../src/cloud/entitlements';
import {syncWorker} from '../../src/sync/syncWorker';
import {
  AUTHORITATIVE_SYNC_ENTITY_TYPES,
  CLIENT_SYNC_ENTITY_TYPES,
  PERSONAL_SYNC_ENTITY_TYPES,
} from '../../src/sync/syncEntityTypes';
import {executeNluAction} from '../../src/ai/nlu/actionExecutor';
import {validateIntent} from '../../src/ai/nlu/types';
import type {ExtractedIntent, ParsedIntentType} from '../../src/ai/nlu/types';
import {detectDocumentRequest} from '../../src/ai/documentIntent';
import {
  DOCUMENT_FORMAT_ORDER,
  DOCUMENT_FORMATS,
} from '../../src/skills/documentSkill';
import {handbookPreference} from '../../src/skills/onlineChatSkill';
import {UPDATE_CONFIG} from '../../src/updates/updateConfig';

const ROOT = resolve(__dirname, '..', '..');
const readRepoFile = (relative: string): string =>
  readFileSync(resolve(ROOT, relative), 'utf8');

const PERSONAL_TABLES = [
  'sync_outbox',
  'sync_metadata',
  'sync_state',
  'sync_control',
  'sync_conflicts',
  'messages',
  'chat_sessions',
  'reminders',
  'notes',
  'custom_categories',
  'time_blocks',
  'events',
  'tasks',
  'local_settings',
  'user_preferences',
  'active_session',
  'users',
];

const clearSynthetic = (): void => {
  for (const table of PERSONAL_TABLES) {
    db.executeSync(`DELETE FROM ${table}`);
  }
};

const insertUser = (id: string, role: string): void => {
  const now = '2026-11-06T00:00:00.000Z';
  db.executeSync(
    `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, role, now, now],
  );
};

const baseIntent = (intent: ParsedIntentType): ExtractedIntent => ({
  intent,
  title: null,
  date: null,
  time: null,
  endTime: null,
  durationMinutes: null,
  category: 'General',
  details: null,
  snoozeMinutes: null,
  confidence: 0.99,
  source: 'fast_path',
  rawTranscript: 'synthetic',
});

const seedTask = (id: string, owner: string, title: string): void => {
  tasksStore.insertTask({
    id,
    userId: owner,
    title,
    dueDate: '2026-11-10',
    dueTime: '09:00',
    isCompleted: false,
    priority: 'High',
    category: 'General',
    notes: 'n',
  } as never);
};

const seedNote = (id: string, owner: string, title: string): void => {
  notesStore.insert({
    id,
    userId: owner,
    title,
    body: '**rich**',
    isPinned: false,
    tags: ['a'],
    category: 'General',
    isVoiceTranscribed: false,
    sortOrder: 1,
  } as never);
};

const seedBlock = (id: string, owner: string, title: string): void => {
  timeBlocksStore.insert({
    id,
    userId: owner,
    title,
    date: '2026-11-10',
    startTime: '12:00',
    endTime: '13:00',
    color: '#E6003A',
    category: 'personal',
  } as never);
};

describe('AGY preserved contracts', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    clearSynthetic();
  });

  describe('PF02 tier and entitlement matrix', () => {
    test.each([
      ['student', false, false],
      ['student_pro', true, true],
      ['admin', true, false],
    ])(
      '%s: pro entitlement=%s, student-pro badge=%s',
      (role, pro, studentPro) => {
        insertUser(`u-${role}`, role);
        expect(hasProEntitlement(`u-${role}`)).toBe(pro);
        expect(isStudentProAccount(`u-${role}`)).toBe(studentPro);
        expect(isStudentProRole(role)).toBe(studentPro);
        expect(isGuestAccount(`u-${role}`)).toBe(false);
      },
    );

    test('guest and unknown accounts hold no entitlement', () => {
      expect(hasProEntitlement(GUEST_USER_ID)).toBe(false);
      expect(isStudentProAccount(GUEST_USER_ID)).toBe(false);
      expect(isGuestAccount(GUEST_USER_ID)).toBe(true);
      expect(hasProEntitlement('')).toBe(false);
      expect(hasProEntitlement('nobody')).toBe(false);
    });
  });

  describe('PF03 guest linking', () => {
    const seedGuest = (): void => {
      insertUser(GUEST_USER_ID, 'student');
      seedTask('g-task', GUEST_USER_ID, 'Guest task');
      seedNote('g-note', GUEST_USER_ID, 'Guest note');
    };

    test('rekeys personal records and rebuilds the outbox for the account only', async () => {
      seedGuest();
      expect(
        syncOutboxStore.getPendingMutations(GUEST_USER_ID, 50).length,
      ).toBeGreaterThan(0);

      await guestMigration.linkGuestToCloudAccount(
        'cloud-1',
        'a@example.invalid',
      );

      expect(tasksStore.getAllTasks('cloud-1').map(t => t.id)).toEqual([
        'g-task',
      ]);
      expect(notesStore.getAll('cloud-1').map(n => n.id)).toEqual(['g-note']);
      expect(tasksStore.getAllTasks(GUEST_USER_ID)).toHaveLength(0);
      expect(
        syncOutboxStore.getPendingMutations(GUEST_USER_ID, 50),
      ).toHaveLength(0);

      const pending = syncOutboxStore.getPendingMutations('cloud-1', 50);
      expect(new Set(pending.map(p => p.entityType))).toEqual(
        new Set(['task', 'note', 'profile']),
      );
      expect(pending.every(p => p.scopeId === 'cloud-1')).toBe(true);
      expect(userStore.getActiveSessionToken().userId).toBe('cloud-1');
    });

    test('a failure inside the link transaction rolls every change back', async () => {
      seedGuest();
      db.executeSync(
        `CREATE TRIGGER pf03_fail BEFORE UPDATE ON notes
         BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`,
      );
      try {
        await expect(
          guestMigration.linkGuestToCloudAccount(
            'cloud-1',
            'a@example.invalid',
          ),
        ).rejects.toThrow();
      } finally {
        db.executeSync('DROP TRIGGER pf03_fail');
      }
      expect(tasksStore.getAllTasks(GUEST_USER_ID)).toHaveLength(1);
      expect(tasksStore.getAllTasks('cloud-1')).toHaveLength(0);
      expect(syncOutboxStore.getPendingMutations('cloud-1', 50)).toHaveLength(
        0,
      );
    });
  });

  describe('PF04 seven-type sync wire contract', () => {
    const OWNER = 'cloud-sync-owner';

    const seedOneOfEach = (): void => {
      insertUser(OWNER, 'student');
      seedTask('w-task', OWNER, 'Task');
      tasksStore.insertEvent({
        id: 'w-event',
        userId: OWNER,
        title: 'Event',
        date: '2026-11-10',
        startTime: '10:00',
        endTime: '11:00',
      } as never);
      seedBlock('w-block', OWNER, 'Block');
      remindersStore.insertReminder({
        id: 'w-reminder',
        userId: OWNER,
        task: 'Reminder',
        status: 'pending',
        scheduledAt: '2026-11-10T09:00:00.000Z',
        triggerAt: '2026-11-10T09:00:00.000Z',
      } as never);
      seedNote('w-note', OWNER, 'Note');
      notesStore.addCustomCategory(OWNER, 'Custom', '#112233');
    };

    /** Field names sent today. New local metadata must never appear here silently. */
    const WIRE_FIELDS: Record<string, string[]> = {
      task: [
        'category',
        'due_date',
        'due_time',
        'is_completed',
        'notes',
        'priority',
        'recurrence_rule',
        'title',
      ],
      event: [
        'date',
        'end_time',
        'linked_calendar_block',
        'location',
        'recurrence_rule',
        'start_time',
        'title',
      ],
      time_block: [
        'category',
        'color',
        'date',
        'end_time',
        'notes',
        'recurrence_rule',
        'start_time',
        'title',
      ],
      reminder: [
        'description',
        'scheduled_at',
        'snooze_count',
        'status',
        'task',
        'trigger_at',
      ],
      note: [
        'body',
        'category',
        'is_pinned',
        'is_voice_transcribed',
        'sort_order',
        'tags',
        'title',
      ],
      custom_category: ['color', 'name'],
    };

    test('exactly seven entity types are negotiated', () => {
      expect([...CLIENT_SYNC_ENTITY_TYPES].sort()).toEqual([
        'custom_category',
        'event',
        'note',
        'profile',
        'reminder',
        'task',
        'time_block',
      ]);
      expect([...PERSONAL_SYNC_ENTITY_TYPES].sort()).toEqual(
        [...CLIENT_SYNC_ENTITY_TYPES].sort(),
      );
    });

    test('outbox create payloads keep the frozen field set for each type', () => {
      seedOneOfEach();
      const pending = syncOutboxStore.getPendingMutations(OWNER, 50);
      for (const [entityType, fields] of Object.entries(WIRE_FIELDS)) {
        const item = pending.find(p => p.entityType === entityType);
        expect(item).toBeDefined();
        expect(item?.operation).toBe('create');
        expect(Object.keys(item?.payload ?? {}).sort()).toEqual(fields);
      }
    });

    test('POST /v1/sync/batch carries the mutation envelope and acks clear the outbox', async () => {
      seedOneOfEach();
      userStore.setCurrentUser(OWNER);
      const original = cloudClient.getAccessToken;
      const originalOnline = cloudClient.isOnline;
      cloudClient.getAccessToken = () => 'synthetic-token';
      cloudClient.isOnline = async () => true;

      const bodies: Array<Record<string, any>> = [];
      const fakeFetch = jest.fn(async (url: string, init: RequestInit) => {
        if (String(url).endsWith('/v1/sync/batch')) {
          const body = JSON.parse(String(init.body));
          bodies.push(body);
          const accepted = (body.mutations as any[]).map(m => ({
            mutationId: m.mutationId,
            entityType: m.entityType,
            entityId: m.entityId,
            status: 'accepted',
            serverVersion: 1,
          }));
          const payload = {
            accepted,
            rejected: [],
            changes: [],
            nextCursor: body.snapshot ? body.cursor : 1,
            hasMore: false,
            resetRequired: false,
            serverTime: '2026-11-06T00:00:00.000Z',
            snapshot: body.snapshot
              ? {
                  boundaryCursor: 1,
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
          };
          return {
            ok: true,
            status: 200,
            headers: {get: () => 'application/json'},
            text: async () => JSON.stringify(payload),
            json: async () => payload,
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 404,
          headers: {get: () => 'application/json'},
          text: async () => '{}',
          json: async () => ({}),
        } as unknown as Response;
      });
      const previousFetch = global.fetch;
      global.fetch = fakeFetch as unknown as typeof fetch;
      try {
        await syncWorker.runSyncPass();
        await syncWorker.runSyncPass();
      } finally {
        global.fetch = previousFetch;
        cloudClient.getAccessToken = original;
        cloudClient.isOnline = originalOnline;
      }

      expect(bodies.length).toBeGreaterThan(0);
      const sent = bodies.flatMap(b => b.mutations as any[]);
      expect(new Set(sent.map(m => m.entityType))).toEqual(
        new Set([
          'task',
          'event',
          'time_block',
          'reminder',
          'note',
          'custom_category',
        ]),
      );
      for (const mutation of sent) {
        expect(Object.keys(mutation).sort()).toEqual([
          'baseVersion',
          'clientUpdatedAt',
          'entityId',
          'entityType',
          'mutationId',
          'operation',
          'payload',
        ]);
        expect(mutation.operation).toBe('create');
        expect(mutation.baseVersion).toBe(0);
        expect(Object.keys(mutation.payload).sort()).toEqual(
          WIRE_FIELDS[mutation.entityType],
        );
      }
      expect(bodies[0].entityTypes).toEqual([...CLIENT_SYNC_ENTITY_TYPES]);
      expect(syncOutboxStore.getPendingMutations(OWNER, 50)).toHaveLength(0);
      expect(
        [
          ...(syncStateStore.loadEntityTypes(OWNER).serverEntityTypes ?? []),
        ].sort(),
      ).toEqual([...CLIENT_SYNC_ENTITY_TYPES].sort());
    });
  });

  describe('PF05 every AGY intent has an offline route', () => {
    const OWNER = 'pf05-owner';
    /** `Record` keeps this exhaustive: a new or removed intent fails to compile. */
    const ROUTES: Record<ParsedIntentType, Partial<ExtractedIntent>> = {
      create_task: {title: 'Read', date: '2026-11-10', time: '09:00'},
      create_time_block: {
        title: 'Block',
        date: '2026-11-10',
        time: '10:00',
        endTime: '11:00',
      },
      create_reminder: {title: 'Ping', date: '2099-11-10', time: '09:00'},
      create_note: {title: 'Idea', details: 'body'},
      update_task: {targetTitle: 'Seed task', isCompleted: true},
      update_time_block: {
        targetTitle: 'Seed block',
        newTitle: 'Renamed block',
      },
      update_note: {targetTitle: 'Seed note', details: 'more'},
      delete_task: {targetTitle: 'Seed task'},
      delete_time_block: {targetTitle: 'Seed block'},
      delete_note: {targetTitle: 'Seed note'},
      acknowledge: {},
      snooze: {snoozeMinutes: 10},
      reschedule: {time: '15:00'},
      query_schedule: {date: '2026-11-10'},
      chat: {},
      out_of_scope: {},
    };

    test.each(Object.keys(ROUTES) as ParsedIntentType[])(
      '%s validates, returns a reply and never touches the network',
      async intent => {
        insertUser(OWNER, 'student');
        seedTask('seed-task', OWNER, 'Seed task');
        seedBlock('seed-block', OWNER, 'Seed block');
        seedNote('seed-note', OWNER, 'Seed note');
        const previousFetch = global.fetch;
        const sentinel = jest.fn(() => {
          throw new Error('network sentinel tripped');
        });
        global.fetch = sentinel as unknown as typeof fetch;
        try {
          const validated = validateIntent({
            ...baseIntent(intent),
            ...ROUTES[intent],
          });
          expect(validated.isValid).toBe(true);
          const result = await executeNluAction(OWNER, validated, {
            referenceDate: new Date(2026, 10, 6, 8, 0, 0),
          });
          expect(result.intent).toBe(intent);
          expect(typeof result.reply).toBe('string');
        } finally {
          global.fetch = previousFetch;
        }
        expect(sentinel).not.toHaveBeenCalled();
      },
    );
  });

  describe('PF06 Handbook preference aliases', () => {
    test('defaults on, writes both keys and honors the legacy alias', () => {
      const owner = 'pf06-owner';
      insertUser(owner, 'student');
      expect(handbookPreference.read(owner)).toBe(true);
      handbookPreference.write(owner, false);
      expect(handbookPreference.read(owner)).toBe(false);
      const stored = db
        .executeSync(
          'SELECT key, value FROM local_settings WHERE user_id = ? ORDER BY key',
          [owner],
        )
        .rows.map(row => ({key: row.key, value: row.value}));
      expect(stored).toEqual([
        {key: 'chat.useHandbook', value: 'false'},
        {key: 'ustp_handbook_enabled', value: 'false'},
      ]);
      db.executeSync(
        "DELETE FROM local_settings WHERE key = 'chat.useHandbook'",
      );
      expect(handbookPreference.read(owner)).toBe(false);
    });
  });

  describe('PF07 document routing', () => {
    test('four formats stay defined and scheduling never routes to documents', () => {
      expect([...DOCUMENT_FORMAT_ORDER]).toEqual([
        'pdf',
        'docx',
        'xlsx',
        'pptx',
      ]);
      expect(Object.keys(DOCUMENT_FORMATS).sort()).toEqual([
        'docx',
        'pdf',
        'pptx',
        'xlsx',
      ]);
      expect(detectDocumentRequest('make a pdf of my notes')?.format).toBe(
        'pdf',
      );
      expect(
        detectDocumentRequest('create a word document about OS')?.format,
      ).toBe('docx');
      expect(
        detectDocumentRequest('generate an excel sheet of grades')?.format,
      ).toBe('xlsx');
      expect(
        detectDocumentRequest('build a powerpoint on networks')?.format,
      ).toBe('pptx');
      expect(
        detectDocumentRequest('remind me to print the pdf at 5pm'),
      ).toBeNull();
      expect(
        detectDocumentRequest('add a task to review the excel sheet'),
      ).toBeNull();
    });
  });

  describe('PF09 speech defaults', () => {
    test('react-native-tts stays the only local TTS dependency and Kokoro is absent', () => {
      const pkg = JSON.parse(readRepoFile('package.json'));
      expect(pkg.dependencies['react-native-tts']).toBeDefined();
      const everything = JSON.stringify({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      });
      expect(everything).not.toMatch(/kokoro/i);
      expect(readRepoFile('src/ai/tts/ttsService.ts')).toMatch(
        /react-native-tts/,
      );
      expect(readRepoFile('src/cloud/speechService.ts')).toMatch(
        /\/v1\/ai\/tts/,
      );
    });
  });

  describe('PF11 acknowledgement semantics', () => {
    test('acknowledging a reminder never completes the underlying task', () => {
      const owner = 'pf11-owner';
      insertUser(owner, 'student');
      seedTask('pf11-task', owner, 'Submit lab');
      remindersStore.insertReminder({
        id: 'pf11-reminder',
        userId: owner,
        task: 'Submit lab',
        status: 'pending',
        scheduledAt: '2026-11-10T09:00:00.000Z',
        triggerAt: '2026-11-10T09:00:00.000Z',
      } as never);
      remindersStore.acknowledgeReminder('pf11-reminder');
      expect(remindersStore.getReminderById('pf11-reminder')?.status).toBe(
        'acknowledged',
      );
      expect(tasksStore.getAllTasks(owner)[0].isCompleted).toBe(false);
    });
  });

  describe('PF13 install and update identity', () => {
    test('application id, version and update product are unchanged', () => {
      const gradle = readRepoFile('android/app/build.gradle');
      expect(gradle).toMatch(/applicationId 'com\.lafina\.capstone'/);
      expect(gradle).toMatch(/namespace 'com\.lafina\.capstone'/);
      expect(gradle).toMatch(/versionCode 6\b/);
      expect(gradle).toMatch(/versionName '0\.6\.0'/);
      expect(gradle).toMatch(/applicationIdSuffix '\.debug'/);
      expect(UPDATE_CONFIG.product).toBe('com.lafina.capstone');
      expect(UPDATE_CONFIG.repo).toBe('LAFINA-CAPSTONE');
    });

    test('public native module names and background components stay registered', () => {
      const dir = 'android/app/src/main/java/com/lafina/capstone';
      const names: Array<[string, string]> = [
        ['LafinaReminderModule.kt', 'LafinaReminder'],
        ['LafinaSpeechToTextModule.kt', 'LafinaSpeechToText'],
        ['LafinaMeetingRecorderModule.kt', 'LafinaMeetingRecorder'],
        ['LafinaIntentExtractorModule.kt', 'LafinaIntentExtractor'],
        ['LafinaAudioPlayerModule.kt', 'LafinaAudioPlayer'],
      ];
      for (const [file, name] of names) {
        expect(readRepoFile(`${dir}/${file}`)).toContain(`"${name}"`);
      }
      const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');
      for (const component of [
        '.ReminderAlarmReceiver',
        '.ReminderBootReceiver',
        '.LafinaReminderService',
        '.LafinaMeetingService',
      ]) {
        expect(manifest).toContain(component);
      }
      expect(manifest).toMatch(/foregroundServiceType="microphone"/);
      expect(manifest).not.toMatch(/kokoro/i);
    });
  });
});
