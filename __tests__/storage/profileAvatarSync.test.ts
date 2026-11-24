/**
 * Cross-device character avatar sync on real SQLite (node:sqlite):
 * - First-time users default to avatar_seed = null (neutral default person).
 * - Chosen character avatar seeds sync across devices via `profile` sync.
 * - Resetting to default neutral person syncs `avatar_seed: null` across devices.
 * - Phone photos (`avatar_uri`) NEVER leave the device or enter sync payloads.
 * - Unpatched servers rejecting `avatar_seed` with a payload validation error
 *   fall back seamlessly without recording conflicts or breaking profile sync.
 */
import {
  avatarSeedStore,
  db,
  initDatabase,
  syncConflictStore,
  syncOutboxStore,
  userStore,
} from '../../src/storage';
import {buildProfileSyncPayload} from '../../src/storage/profileSyncPayload';
import {cloudClient} from '../../src/cloud/cloudClient';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {syncWorker} from '../../src/sync/syncWorker';
import {syncState} from '../../src/sync/syncState';
import {
  AUTHORITATIVE_SYNC_ENTITY_TYPES,
  CLIENT_SYNC_ENTITY_TYPES,
} from '../../src/sync/syncEntityTypes';

type Json = Record<string, any>;

const insertSignedInUser = (id: string, email: string): void => {
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (
       id, username, email, role, is_new_user, time_format_24h,
       week_starts_monday, dark_mode, cloud_account_id, cloud_linked,
       cloud_linked_at, created_at, updated_at
     ) VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, 1, ?, ?, ?)`,
    [id, 'Student', email, `cloud-${email}`, now, now, now],
  );
  userStore.setCurrentUser(id);
};

class FakeProfileServer {
  profilePayload: Json | null = null;
  profileVersion = 0;
  changes: Json[] = [];
  requests: Json[] = [];
  rejectAvatarSeed = false;
  private seq = 0;

  private stamp(): string {
    return new Date(Date.UTC(2026, 10, 24, 12, 0, this.seq)).toISOString();
  }

  seedProfile(payload: Json): void {
    this.profileVersion += 1;
    this.seq += 1;
    this.profilePayload = {...payload};
  }

  handle(body: Json): Json {
    this.requests.push(body);
    const cursor = Number(body.cursor ?? 0);
    const accepted: Json[] = [];
    const rejected: Json[] = [];

    for (const mut of (body.mutations ?? []) as Json[]) {
      if (
        this.rejectAvatarSeed &&
        mut.entityType === 'profile' &&
        Object.prototype.hasOwnProperty.call(mut.payload ?? {}, 'avatar_seed')
      ) {
        rejected.push({
          mutationId: mut.mutationId,
          entityType: mut.entityType,
          entityId: mut.entityId,
          status: 'rejected',
          reason: 'invalid_payload: extra field avatar_seed',
        });
        continue;
      }

      if (mut.entityType === 'profile') {
        this.profileVersion += 1;
        this.seq += 1;
        this.profilePayload = {...mut.payload};
        const change = {
          changeId: this.seq,
          entityType: 'profile',
          entityId: 'profile',
          operation: mut.operation,
          version: this.profileVersion,
          payload: {...this.profilePayload},
          updatedAt: this.stamp(),
        };
        this.changes.push(change);
        accepted.push({
          mutationId: mut.mutationId,
          entityType: mut.entityType,
          entityId: mut.entityId,
          status: 'accepted',
          serverVersion: this.profileVersion,
        });
      }
    }

    if (body.snapshot) {
      const items = this.profilePayload
        ? [
            {
              changeId: this.seq,
              entityType: 'profile',
              entityId: 'profile',
              operation: 'update',
              version: this.profileVersion,
              payload: {...this.profilePayload},
              updatedAt: this.stamp(),
            },
          ]
        : [];
      return {
        accepted,
        rejected,
        changes: [],
        nextCursor: cursor,
        hasMore: false,
        resetRequired: false,
        snapshot: {
          items,
          boundaryCursor: this.seq,
          nextAfter: null,
          hasMore: false,
          complete: true,
          authoritativeEntityTypes: [...AUTHORITATIVE_SYNC_ENTITY_TYPES],
          prunePolicy: {
            preserveOutboxStatuses: ['pending', 'in_progress', 'failed'],
            requireExistingSyncMetadata: true,
          },
        },
        serverTime: this.stamp(),
        supportedEntityTypes: [...CLIENT_SYNC_ENTITY_TYPES],
      };
    }

    const delta = this.changes.filter(c => c.changeId > cursor);
    const nextCursor =
      delta.length > 0 ? delta[delta.length - 1].changeId : cursor;
    return {
      accepted,
      rejected,
      changes: delta,
      nextCursor,
      hasMore: false,
      resetRequired: false,
      serverTime: this.stamp(),
      supportedEntityTypes: [...CLIENT_SYNC_ENTITY_TYPES],
    };
  }
}

describe('Cross-device profile character avatar sync', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    syncWorker.resetServerCompatibility();
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_conflicts');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM sync_metadata');
    db.executeSync('DELETE FROM sync_state');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM users');
  });

  const attachFakeServer = (server: FakeProfileServer): void => {
    jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
    jest.spyOn(cloudClient, 'getAccessToken').mockReturnValue('fake-token');
    jest
      .spyOn(cloudClient, 'getBaseUrl')
      .mockReturnValue('https://fake-sync.example.invalid');
    jest
      .spyOn(accountLinkService, 'refreshCloudProfile')
      .mockResolvedValue({status: 'success', message: 'ok'});
    jest
      .spyOn(cloudClient, 'request')
      .mockImplementation(async (endpoint: string, options?: RequestInit) => {
        if (endpoint === '/v1/sync/batch') {
          const parsed = JSON.parse(String(options?.body ?? '{}'));
          return {
            status: 'success',
            data: server.handle(parsed),
          } as any;
        }
        return {status: 'error', error: `unexpected ${endpoint}`} as any;
      });
  };

  test('syncs character avatar seed from Device A to Device B, resets to neutral default on clear, and never syncs phone photos', async () => {
    const server = new FakeProfileServer();
    attachFakeServer(server);

    // Device A signs in and runs initial snapshot sync.
    const deviceA = 'user-device-a';
    insertSignedInUser(deviceA, 'shared@ustp.edu.ph');
    await syncWorker.runSyncPass();
    expect(avatarSeedStore.get(deviceA)).toBeNull();

    // Device A chooses a character avatar AND sets a local phone photo.
    avatarSeedStore.set(deviceA, 'char-sync-1-abc999');
    userStore.setAvatarUri(deviceA, '/documents/avatars/private-selfie.jpg');
    await syncWorker.runSyncPass();

    // Server received character avatar_seed, NEVER avatar_uri.
    expect(server.profilePayload?.avatar_seed).toBe('char-sync-1-abc999');
    expect(server.profilePayload).not.toHaveProperty('avatar_uri');
    expect(JSON.stringify(server.requests)).not.toContain('private-selfie.jpg');

    // Device B (fresh sign-in for the same account) pulls the synced profile.
    const deviceB = 'user-device-b';
    insertSignedInUser(deviceB, 'shared-b@ustp.edu.ph');
    await syncWorker.runSyncPass();

    expect(avatarSeedStore.get(deviceB)).toBe('char-sync-1-abc999');
    expect(userStore.getUserById(deviceB)?.avatarSeed).toBe(
      'char-sync-1-abc999',
    );
    expect(userStore.getUserById(deviceB)?.avatarUri).toBeNull();

    // Device A resets back to the default neutral person icon.
    userStore.setCurrentUser(deviceA);
    avatarSeedStore.clear(deviceA);
    await syncWorker.runSyncPass();
    expect(server.profilePayload?.avatar_seed).toBeNull();

    // Device B syncs and also returns to the neutral person default.
    userStore.setCurrentUser(deviceB);
    await syncWorker.runSyncPass();
    expect(avatarSeedStore.get(deviceB)).toBeNull();
    expect(userStore.getUserById(deviceB)?.avatarSeed).toBeNull();
  });

  test('preserves local avatar_seed when receiving an older profile payload that omits avatar_seed', async () => {
    const server = new FakeProfileServer();
    const legacyPayload: Json = {
      ...buildProfileSyncPayload('nonexistent'),
      username: 'Legacy Cloud Name',
    };
    delete legacyPayload.avatar_seed;
    server.seedProfile(legacyPayload);
    attachFakeServer(server);

    const userId = 'user-legacy-server-preserve';
    insertSignedInUser(userId, 'legacy@ustp.edu.ph');
    // Save local seed directly without enqueueing a competing pending profile mutation.
    db.executeSync('UPDATE users SET avatar_seed = ? WHERE id = ?', [
      'char-keep-me-42',
      userId,
    ]);

    await syncWorker.runSyncPass();

    expect(userStore.getUserById(userId)?.username).toBe('Legacy Cloud Name');
    expect(avatarSeedStore.get(userId)).toBe('char-keep-me-42');
  });

  test('gracefully falls back without conflicts when an unpatched server rejects avatar_seed on profile sync', async () => {
    const server = new FakeProfileServer();
    server.rejectAvatarSeed = true;
    attachFakeServer(server);

    const userId = 'user-unpatched-server';
    insertSignedInUser(userId, 'unpatched@ustp.edu.ph');
    await syncWorker.runSyncPass();

    // User updates username and picks a character avatar while backend is unpatched.
    userStore.setUsername(userId, 'Updated Student');
    avatarSeedStore.set(userId, 'char-local-until-backend-updates');
    await syncWorker.runSyncPass();

    // Sync succeeded cleanly without conflicts and synced username.
    expect(syncState.getState().status).toBe('Synced');
    expect(syncConflictStore.getUnresolved(userId)).toHaveLength(0);
    expect(syncOutboxStore.getPendingMutations(userId)).toHaveLength(0);
    expect(server.profilePayload?.username).toBe('Updated Student');
    expect(server.profilePayload).not.toHaveProperty('avatar_seed');
    // Local character avatar remains safely persisted on this phone.
    expect(avatarSeedStore.get(userId)).toBe(
      'char-local-until-backend-updates',
    );
  });

  test('does not permanently disable avatar_seed sync when a patched server rejects a different profile field', async () => {
    const server = new FakeProfileServer();
    let rejectWakeTimeOnce = true;
    const origHandle = server.handle.bind(server);
    server.handle = (body: Json): Json => {
      if (rejectWakeTimeOnce && (body.mutations ?? []).length > 0) {
        const profileMut = (body.mutations as Json[]).find(
          m => m.entityType === 'profile',
        );
        if (profileMut) {
          return {
            accepted: [],
            rejected: [
              {
                mutationId: profileMut.mutationId,
                entityType: 'profile',
                entityId: 'profile',
                status: 'rejected',
                reason: 'invalid_payload: wake_time must be HH:MM',
              },
            ],
            changes: [],
            nextCursor: Number(body.cursor ?? 0),
            hasMore: false,
            resetRequired: false,
            serverTime: new Date().toISOString(),
            supportedEntityTypes: [...CLIENT_SYNC_ENTITY_TYPES],
          };
        }
      }
      return origHandle(body);
    };
    attachFakeServer(server);

    const userId = 'user-other-validation-err';
    insertSignedInUser(userId, 'other@ustp.edu.ph');
    await syncWorker.runSyncPass();

    // Trigger an unrelated profile validation failure; both initial and stripped
    // attempts fail, recording a conflict without caching the server as legacy.
    userStore.setUsername(userId, 'Bad Wake Time');
    await syncWorker.runSyncPass();
    expect(syncConflictStore.getUnresolved(userId).length).toBeGreaterThan(0);

    // Once the unrelated validation error clears, avatar_seed still syncs!
    rejectWakeTimeOnce = false;
    avatarSeedStore.set(userId, 'char-still-syncs-99');
    await syncWorker.runSyncPass();
    expect(server.profilePayload?.avatar_seed).toBe('char-still-syncs-99');
  });
});
