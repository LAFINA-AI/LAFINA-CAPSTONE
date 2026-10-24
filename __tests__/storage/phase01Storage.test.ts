import {
  db,
  initDatabase,
  normalizeEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  userStore,
  preferencesStore,
  getDefaultUserPreferences,
  completeUserOnboarding,
  behaviorStore,
  syncOutboxStore,
  productTourStore,
} from '../../src/storage';
import { GUEST_USER_ID } from '../../src/constants';
import {
  PERSONAL_SYNC_ENTITY_TYPES,
  isSupportedSyncEntityType,
} from '../../src/sync/syncEntityTypes';

describe('Phase 01 Storage, Auth, Onboarding & Sync Schema', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM remember_me');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM user_behavior_logs');
    db.executeSync('DELETE FROM ml_feature_snapshots');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');
    db.executeSync('DELETE FROM local_settings');
  });

  test('creates all personal student tables and excludes forbidden business/study-tool tables', () => {
    const res = db.executeSync(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const tables = res.rows.map((r) => String(r.name));

    const expectedTables = [
      'users',
      'user_preferences',
      'tasks',
      'events',
      'time_blocks',
      'reminders',
      'notes',
      'custom_categories',
      'chat_sessions',
      'messages',
      'user_behavior_logs',
      'ml_feature_snapshots',
      'active_session',
      'remember_me',
      'sync_outbox',
      'sync_metadata',
      'sync_state',
      'sync_conflicts',
      'local_settings',
    ];
    for (const table of expectedTables) {
      expect(tables).toContain(table);
    }

    const forbiddenTables = [
      'business_tasks',
      'business_task_assignments',
      'business_work_blocks',
      'pomodoro_sessions',
      'pomodoro_settings',
      'flashcard_decks',
      'study_summaries',
      'recorded_meetings',
    ];
    for (const forbidden of forbiddenTables) {
      expect(tables).not.toContain(forbidden);
    }
  });

  test('validates, hashes, and verifies passwords and normalizes emails', async () => {
    expect(normalizeEmail('  Student@USTP.edu.ph ')).toBe('student@ustp.edu.ph');
    expect(validatePassword('short').isValid).toBe(false);
    expect(validatePassword('ValidPass123').isValid).toBe(true);

    const hash = await hashPassword('ValidPass123');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyPassword('ValidPass123', hash)).toBe(true);
    expect(await verifyPassword('WrongPass123', hash)).toBe(false);
  });

  test('creates offline guest user and persists session', () => {
    const guest = userStore.createGuestUser();
    expect(guest.id).toBe(GUEST_USER_ID);
    expect(userStore.isGuest(guest.id)).toBe(true);
    expect(guest.isNewUser).toBe(true);

    userStore.setCurrentUser(guest.id);
    expect(userStore.getCurrentUser()?.id).toBe(GUEST_USER_ID);

    userStore.logout();
    expect(userStore.getCurrentUser()).toBeNull();
  });

  test('registers and logs in a student user and enqueues profile sync mutation', async () => {
    const userId = await userStore.register(
      'Noel Student',
      'Noel@ustp.edu.ph',
      'StrongPass123',
    );
    expect(userId).toBeTruthy();

    const loggedIn = await userStore.login('noel@ustp.edu.ph', 'StrongPass123');
    expect(loggedIn).not.toBeNull();
    expect(loggedIn?.username).toBe('Noel Student');
    expect(loggedIn?.role).toBe('student');
    expect(loggedIn?.isNewUser).toBe(true);

    const pendingOutbox = syncOutboxStore.getPendingMutations(userId);
    expect(pendingOutbox).toHaveLength(1);
    expect(pendingOutbox[0]?.entityType).toBe('profile');
    expect(pendingOutbox[0]?.operation).toBe('create');
  });

  test('completes onboarding, saves preferences, logs behavior events, and queues product tour', async () => {
    const userId = await userStore.register(
      'Jane Student',
      'jane@ustp.edu.ph',
      'StrongPass123',
    );
    const prefs = {
      ...getDefaultUserPreferences(),
      wakeTime: '06:30',
      sleepTime: '22:30',
      reminderLeadMinutes: 15,
    };

    completeUserOnboarding(userId, prefs);

    expect(userStore.isOnboardingComplete(userId)).toBe(true);
    const savedPrefs = preferencesStore.get(userId);
    expect(savedPrefs.wakeTime).toBe('06:30');
    expect(savedPrefs.sleepTime).toBe('22:30');
    expect(savedPrefs.reminderLeadMinutes).toBe(15);

    const logs = behaviorStore.getBehaviorLogs(userId, 'onboarding_response');
    expect(logs).toHaveLength(8);

    const snapshot = behaviorStore.getLatestFeatureSnapshot(
      userId,
      'schedule_preference',
    );
    expect(snapshot).not.toBeNull();

    productTourStore.queue(userId);
    expect(productTourStore.isPending(userId)).toBe(true);
    productTourStore.markSeen(userId, true);
    expect(productTourStore.isPending(userId)).toBe(false);
  });

  test('supports only the 7 personal entity types matching LAFINA-backend', () => {
    expect(PERSONAL_SYNC_ENTITY_TYPES).toEqual([
      'profile',
      'task',
      'event',
      'time_block',
      'reminder',
      'note',
      'custom_category',
    ]);
    expect(isSupportedSyncEntityType('task')).toBe(true);
    expect(isSupportedSyncEntityType('note')).toBe(true);
    expect(isSupportedSyncEntityType('business_task')).toBe(false);
    expect(isSupportedSyncEntityType('pomodoro_session')).toBe(false);
  });
});
