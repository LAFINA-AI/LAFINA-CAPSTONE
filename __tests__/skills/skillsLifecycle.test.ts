import {NativeModules} from 'react-native';
import RNFS from 'react-native-fs';
import {
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';
import {guestMigration} from '../../src/storage/guestMigration';
import {
  authorizeDataReset,
  readSkillsDocumentPaths,
  resetPersonalData,
} from '../../src/storage/accountDataReset';

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  for (const table of [
    'active_session',
    'local_settings',
    'recorded_meetings',
  ]) {
    db.executeSync(`DELETE FROM ${table}`);
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('guestMigration transfers Skills settings and recorded meetings to the cloud account', async () => {
  const guest = userStore.createGuestUser();
  expect(guest.id).toBe(GUEST_USER_ID);
  localSettingsStore.set(guest.id, 'skills.pins', '["pomodoro"]');
  localSettingsStore.set(guest.id, 'skills.gwa.lastSemester', '2026-1');
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO recorded_meetings (id, user_id, title, status, started_at, created_at, updated_at)
     VALUES ('mtg-1', ?, 'Study Group', 'completed', ?, ?, ?)`,
    [guest.id, now, now, now],
  );

  await guestMigration.linkGuestToCloudAccount(
    'cloud-u1',
    'cloud@example.invalid',
  );

  expect(localSettingsStore.get('cloud-u1', 'skills.pins')).toBe(
    '["pomodoro"]',
  );
  expect(localSettingsStore.get('cloud-u1', 'skills.gwa.lastSemester')).toBe(
    '2026-1',
  );
  expect(localSettingsStore.get(GUEST_USER_ID, 'skills.pins')).toBeNull();
  const mtg = db.executeSync(
    'SELECT user_id FROM recorded_meetings WHERE id = ?',
    ['mtg-1'],
  ).rows[0] as {user_id?: string} | undefined;
  expect(mtg?.user_id).toBe('cloud-u1');
});

test('resetPersonalData clears Skills state, recorded meetings, cancels focus timer, and scopes doc paths safely', () => {
  const cancelSpy = jest.fn(() => Promise.resolve(true));
  (NativeModules as Record<string, unknown>).LafinaFocus = {cancel: cancelSpy};
  const ownerId = 'skills-reset-owner';
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [ownerId, ownerId, `${ownerId}@example.invalid`, now, now],
  );
  userStore.setCurrentUser(ownerId);

  const root = String(RNFS.DocumentDirectoryPath).replace(/\/+$/, '');
  localSettingsStore.set(
    ownerId,
    'skills.files.v1',
    JSON.stringify([
      {
        id: 'f1',
        attachment: {
          uri: `file://${root}/skills_documents/${encodeURIComponent(
            ownerId,
          )}/report.pdf`,
        },
      },
      {
        id: 'f2',
        attachment: {
          uri: `file://${root}/skills_documents/${encodeURIComponent(
            ownerId,
          )}/../other.pdf`,
        },
      },
    ]),
  );
  localSettingsStore.set(ownerId, 'theme.mode', 'dark');
  db.executeSync(
    `INSERT INTO recorded_meetings (id, user_id, title, status, started_at, created_at, updated_at)
     VALUES ('mtg-reset', ?, 'Lecture', 'completed', ?, ?, ?)`,
    [ownerId, now, now, now],
  );

  const paths = readSkillsDocumentPaths(ownerId);
  expect(paths).toEqual([
    `${root}/skills_documents/${encodeURIComponent(ownerId)}/report.pdf`,
  ]);

  const authority = authorizeDataReset(ownerId);
  const outcome = resetPersonalData(authority);
  expect(outcome).toMatchObject({admitted: true, defaults: 'cleared'});
  expect(localSettingsStore.get(ownerId, 'skills.files.v1')).toBeNull();
  expect(localSettingsStore.get(ownerId, 'theme.mode')).toBe('dark');
  expect(
    db.executeSync('SELECT id FROM recorded_meetings WHERE user_id = ?', [
      ownerId,
    ]).rows,
  ).toHaveLength(0);
  expect(cancelSpy).toHaveBeenCalled();
});

test('guestMigration merges guest flashcard decks with existing cloud decks instead of dropping them', async () => {
  userStore.createGuestUser();
  const cloudId = 'cloud-decks-u1';
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, 'clouddecks', 'clouddecks@example.invalid', 'student', 0, 0, 0, 0, ?, ?)`,
    [cloudId, now, now],
  );
  localSettingsStore.set(
    cloudId,
    'skills.decks.v1',
    JSON.stringify([
      {id: 'shared-1', title: 'Cloud Version', cards: [], createdAt: now},
      {id: 'cloud-only', title: 'Cloud Only', cards: [], createdAt: now},
    ]),
  );
  localSettingsStore.set(
    GUEST_USER_ID,
    'skills.decks.v1',
    JSON.stringify([
      {id: 'shared-1', title: 'Guest Duplicate', cards: [], createdAt: now},
      {id: 'guest-only', title: 'Guest Bio', cards: [], createdAt: now},
    ]),
  );

  await guestMigration.linkGuestToCloudAccount(
    cloudId,
    'clouddecks@example.invalid',
  );

  const merged = JSON.parse(
    localSettingsStore.get(cloudId, 'skills.decks.v1') ?? '[]',
  ) as Array<{id: string; title: string}>;
  expect(merged.map(d => d.id)).toEqual([
    'shared-1',
    'cloud-only',
    'guest-only',
  ]);
  expect(merged[0].title).toBe('Cloud Version');
  expect(localSettingsStore.get(GUEST_USER_ID, 'skills.decks.v1')).toBeNull();
});
