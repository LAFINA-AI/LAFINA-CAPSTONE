import React from 'react';
import {AccessibilityInfo, Text} from 'react-native';
import {render} from '@testing-library/react-native';
import {
  alarmsStore,
  db,
  guestMigration,
  initDatabase,
  remindersStore,
  syncMetadataStore,
  syncOutboxStore,
  userStore,
} from '../../src/storage';
import {MAX_ALARMS_PER_OWNER} from '../../src/storage/alarmsStore';
import {getOccurrences} from '../../src/storage/rruleHelper';
import {createNextRecurringReminder} from '../../src/scheduler/reminderActions';
import {cloudClient, setMockOnlineState} from '../../src/cloud/cloudClient';
import {syncWorker} from '../../src/sync/syncWorker';
import {useReducedMotion} from '../../src/ui/hooks/useReducedMotion';
import {GUEST_USER_ID} from '../../src/constants';

describe('Audit performance & reliability regressions', () => {
  const previousFetch = global.fetch;

  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    global.fetch = previousFetch;
    setMockOnlineState(null);
  });

  test('local_settings notifies only matching key namespace and rollback preserves external invalidations', () => {
    const beforeSkills = db.getDataRevision(['local_settings:skills']);
    const beforeDashboard = db.getDataRevision(['local_settings:dashboard']);
    const beforeAll = db.getDataRevision(['local_settings']);

    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at)
       VALUES (?, ?, '{}', ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ['u-ns', 'skills.pomo.v1', now],
    );

    expect(db.getDataRevision(['local_settings:skills'])).toBeGreaterThan(
      beforeSkills,
    );
    expect(db.getDataRevision(['local_settings'])).toBeGreaterThan(beforeAll);
    expect(db.getDataRevision(['local_settings:dashboard'])).toBe(
      beforeDashboard,
    );

    const beforeNotes = db.getDataRevision(['notes']);
    const beforeAlarms = db.getDataRevision(['alarms']);

    expect(() =>
      db.transactionSync(tx => {
        tx.executeSync(
          `INSERT INTO notes (id, user_id, title, body, created_at, updated_at)
           VALUES ('n-rollback', 'u-ns', 'T', 'B', ?, ?)`,
          [now, now],
        );
        db.invalidateData(['alarms']);
        throw new Error('force rollback');
      }),
    ).toThrow('force rollback');

    expect(db.getDataRevision(['alarms'])).toBeGreaterThan(beforeAlarms);
    expect(db.getDataRevision(['notes'])).toBe(beforeNotes);
  });

  test('guestMigration handles existing user_preferences, enforces alarm cap, and only enqueues migrated guest items', async () => {
    const cloudUserId = 'cloud-audit-user';
    const now = new Date().toISOString();

    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM sync_metadata WHERE user_id = ?', [
      cloudUserId,
    ]);
    db.executeSync('DELETE FROM tasks WHERE user_id IN (?, ?)', [
      cloudUserId,
      GUEST_USER_ID,
    ]);
    db.executeSync('DELETE FROM alarms WHERE user_id IN (?, ?)', [
      cloudUserId,
      GUEST_USER_ID,
    ]);
    db.executeSync('DELETE FROM user_preferences WHERE user_id IN (?, ?)', [
      cloudUserId,
      GUEST_USER_ID,
    ]);

    userStore.createGuestUser();
    db.executeSync(
      `INSERT OR REPLACE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, 'CloudStudent', 'cloud@student.edu', 'student', 0, 0, 0, 0, ?, ?)`,
      [cloudUserId, now, now],
    );

    // Both guest and cloud account already have user_preferences
    db.executeSync(
      `INSERT INTO user_preferences (id, user_id, created_at, updated_at) VALUES ('pref-cloud', ?, ?, ?)`,
      [cloudUserId, now, now],
    );
    db.executeSync(
      `INSERT INTO user_preferences (id, user_id, created_at, updated_at) VALUES ('pref-guest', ?, ?, ?)`,
      [GUEST_USER_ID, now, now],
    );

    // Pre-existing synced cloud task + profile metadata
    db.executeSync(
      `INSERT INTO tasks (id, user_id, title, is_completed, priority, category, created_at, updated_at)
       VALUES ('cloud-task-1', ?, 'Already Synced', 0, 'medium', 'academic', ?, ?)`,
      [cloudUserId, now, now],
    );
    syncMetadataStore.upsert(cloudUserId, {
      entityType: 'task',
      entityId: 'cloud-task-1',
      version: 2,
      changeId: 10,
      updatedAt: now,
    });
    syncMetadataStore.upsert(cloudUserId, {
      entityType: 'profile',
      entityId: 'profile',
      version: 1,
      changeId: 9,
      updatedAt: now,
    });

    // Newly created guest task
    db.executeSync(
      `INSERT INTO tasks (id, user_id, title, is_completed, priority, category, created_at, updated_at)
       VALUES ('guest-task-1', ?, 'From Guest', 0, 'high', 'personal', ?, ?)`,
      [GUEST_USER_ID, now, now],
    );

    // 49 cloud alarms + 3 guest alarms -> capped at MAX_ALARMS_PER_OWNER (50)
    for (let i = 0; i < MAX_ALARMS_PER_OWNER - 1; i += 1) {
      alarmsStore.create(cloudUserId, {
        hour: 7,
        minute: i % 60,
        repeatDays: 0,
        label: `Cloud Alarm ${i}`,
      });
    }
    for (let i = 0; i < 3; i += 1) {
      alarmsStore.create(GUEST_USER_ID, {
        hour: 8,
        minute: i,
        repeatDays: 0,
        label: `Guest Alarm ${i}`,
      });
    }

    db.executeSync('DELETE FROM sync_outbox');

    await expect(
      guestMigration.linkGuestToCloudAccount(cloudUserId, 'cloud@student.edu'),
    ).resolves.toBeUndefined();

    const pending = syncOutboxStore.getPendingMutations(cloudUserId, 50);
    const taskMutations = pending.filter(m => m.entityType === 'task');
    expect(taskMutations.map(m => m.entityId)).toEqual(['guest-task-1']);
    expect(alarmsStore.list(cloudUserId)).toHaveLength(MAX_ALARMS_PER_OWNER);
    expect(alarmsStore.list(GUEST_USER_ID)).toHaveLength(0);
  });

  test('syncWorker preserves concurrent pending local edits and clears reminder precast_audio_path on task change', async () => {
    const uid = 'sync-audit-user';
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT OR REPLACE INTO users (id, username, email, role, is_new_user, cloud_account_id, cloud_linked, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, 'SyncStudent', 'sync@student.edu', 'student', 0, 'cloud-acc-1', 1, 0, 0, 0, ?, ?)`,
      [uid, now, now],
    );
    userStore.setCurrentUser(uid);
    userStore.saveSessionTokens(uid, 'valid-access-token', 'enc-refresh');
    cloudClient.resetSessionCache();
    setMockOnlineState(true);

    db.executeSync('DELETE FROM sync_outbox WHERE user_id = ?', [uid]);
    db.executeSync('DELETE FROM tasks WHERE user_id = ?', [uid]);
    db.executeSync('DELETE FROM reminders WHERE user_id = ?', [uid]);
    db.executeSync(
      `INSERT OR REPLACE INTO sync_state (user_id, scope_type, scope_id, cursor, status, server_entity_types, snapshot_entity_types, created_at, updated_at)
       VALUES (?, 'account', ?, 5, 'Synced', ?, ?, ?, ?)`,
      [
        uid,
        uid,
        JSON.stringify([
          'profile',
          'task',
          'event',
          'time_block',
          'reminder',
          'note',
          'custom_category',
        ]),
        JSON.stringify([
          'profile',
          'task',
          'event',
          'time_block',
          'reminder',
          'note',
          'custom_category',
        ]),
        now,
        now,
      ],
    );

    // Local task has an unsent pending edit
    db.executeSync(
      `INSERT INTO tasks (id, user_id, title, is_completed, priority, category, created_at, updated_at)
       VALUES ('t-local-edit', ?, 'Fresh Local Title', 0, 'medium', 'academic', ?, ?)`,
      [uid, now, now],
    );
    syncOutboxStore.enqueueMutation(uid, 'task', 't-local-edit', 'update', {
      title: 'Fresh Local Title',
      due_date: null,
      due_time: null,
      is_completed: false,
      priority: 'medium',
      category: 'academic',
      notes: null,
      recurrence_rule: null,
    });

    // Local reminder has a cached precast_audio_path for old task text
    db.executeSync(
      `INSERT INTO reminders (id, user_id, task, description, scheduled_at, trigger_at, status, precast_audio_path, snooze_count, created_at, updated_at)
       VALUES ('r-audio', ?, 'Old Reminder Text', null, ?, ?, 'pending', '/cache/rem-old.wav', 0, ?, ?)`,
      [uid, now, now, now, now],
    );

    let callCount = 0;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/auth/me')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              id: 'cloud-acc-1',
              email: 'sync@student.edu',
              role: 'student',
              is_active: true,
            }),
        } as unknown as Response;
      }
      callCount += 1;
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            mutations?: Array<{
              mutationId: string;
              entityType: string;
              entityId: string;
            }>;
          })
        : {};
      const accepted = (body.mutations ?? []).map(m => ({
        mutationId: m.mutationId,
        entityType: m.entityType,
        entityId: m.entityId,
        status: 'accepted',
        serverVersion: 2,
      }));
      if (callCount === 1) {
        // While batch 1 was in flight, another pending edit arrived for t-local-edit
        db.executeSync(`UPDATE tasks SET title = ? WHERE id = 't-local-edit'`, [
          'Newer Concurrent Edit',
        ]);
        syncOutboxStore.enqueueMutation(uid, 'task', 't-local-edit', 'update', {
          title: 'Newer Concurrent Edit',
          due_date: null,
          due_time: null,
          is_completed: false,
          priority: 'high',
          category: 'academic',
          notes: null,
          recurrence_rule: null,
        });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              accepted,
              rejected: [],
              changes: [
                {
                  changeId: 6,
                  entityType: 'task',
                  entityId: 't-local-edit',
                  operation: 'update',
                  version: 2,
                  updatedAt: now,
                  payload: {
                    title: 'Older Remote Title',
                    due_date: null,
                    due_time: null,
                    is_completed: false,
                    priority: 'low',
                    category: 'academic',
                    notes: null,
                    recurrence_rule: null,
                  },
                },
                {
                  changeId: 7,
                  entityType: 'reminder',
                  entityId: 'r-audio',
                  operation: 'update',
                  version: 2,
                  updatedAt: now,
                  payload: {
                    task: 'Renamed Remote Reminder',
                    description: null,
                    scheduled_at: now,
                    trigger_at: now,
                    status: 'pending',
                    snooze_count: 0,
                  },
                },
              ],
              nextCursor: 7,
              hasMore: false,
              resetRequired: false,
              serverTime: now,
            }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            accepted,
            rejected: [],
            changes: [],
            nextCursor: 7,
            hasMore: false,
            resetRequired: false,
            serverTime: now,
          }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await syncWorker.runSyncPass();

    const taskRow = db.executeSync('SELECT title FROM tasks WHERE id = ?', [
      't-local-edit',
    ]).rows[0];
    expect(taskRow?.title).toBe('Newer Concurrent Edit');

    const remRow = db.executeSync(
      'SELECT task, precast_audio_path FROM reminders WHERE id = ?',
      ['r-audio'],
    ).rows[0];
    expect(remRow?.task).toBe('Renamed Remote Reminder');
    expect(remRow?.precast_audio_path).toBeNull();
  });

  test('cloudClient handles 204 No Content and rejects malformed 200 non-JSON payloads as server_error', async () => {
    setMockOnlineState(true);

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 204,
      text: async () => '',
    })) as unknown as typeof fetch;

    const noContent = await cloudClient.requestOnce('/v1/ping', {}, false);
    expect(noContent.status).toBe('success');

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<html><body>Gateway HTML</body></html>',
    })) as unknown as typeof fetch;

    const badJson = await cloudClient.requestOnce('/v1/ping', {}, false);
    expect(badJson.status).toBe('server_error');
  });

  test('rruleHelper fast-forwards >1000-day series and createNextRecurringReminder schedules FREQ=YEARLY', () => {
    const daily = getOccurrences(
      '2015-01-01',
      'FREQ=DAILY;INTERVAL=1',
      new Date(2026, 10, 20),
      new Date(2026, 10, 22),
    );
    expect(daily).toEqual(['2026-11-20', '2026-11-21', '2026-11-22']);

    const monthly = getOccurrences(
      '2015-01-31',
      'FREQ=MONTHLY;INTERVAL=1',
      new Date(2026, 1, 1),
      new Date(2026, 2, 31),
    );
    expect(monthly).toEqual(['2026-02-28', '2026-03-31']);

    const weekly = getOccurrences(
      '2015-01-05',
      'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR',
      new Date(2026, 10, 16),
      new Date(2026, 10, 22),
    );
    expect(weekly).toEqual(['2026-11-16', '2026-11-20']);

    const yearlyOwner = 'u-yearly';
    const baseTrigger = new Date(2026, 4, 10, 9, 30, 0, 0).toISOString();
    remindersStore.insertReminder({
      id: 'rem-yearly-1',
      userId: yearlyOwner,
      task: 'Annual Renew',
      description: 'Renew ID [RRULE:FREQ=YEARLY;INTERVAL=1]',
      scheduledAt: baseTrigger,
      triggerAt: baseTrigger,
      status: 'acknowledged',
      preCastAudioPath: null,
    });
    const reminder = remindersStore.getReminderById('rem-yearly-1')!;
    const next = createNextRecurringReminder(
      reminder,
      yearlyOwner,
      undefined,
      new Date(2026, 4, 10, 10, 0, 0, 0),
    );
    expect(next).not.toBeNull();
    expect(new Date(next!.triggerAt).getFullYear()).toBe(2027);
  });

  test('useReducedMotion shares one AccessibilityInfo listener across multiple mounted components', () => {
    const addSpy = jest.spyOn(AccessibilityInfo, 'addEventListener');
    const Probe = () => {
      const reduced = useReducedMotion();
      return <Text>{reduced ? 'reduced' : 'full'}</Text>;
    };

    const first = render(
      <>
        <Probe />
        <Probe />
        <Probe />
      </>,
    );
    const reduceCalls = addSpy.mock.calls.filter(
      call => String(call[0]) === 'reduceMotionChanged',
    );
    expect(reduceCalls.length).toBeLessThanOrEqual(1);
    first.unmount();
    addSpy.mockRestore();
  });
});
