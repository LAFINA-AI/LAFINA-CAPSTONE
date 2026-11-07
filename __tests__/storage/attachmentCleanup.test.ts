/**
 * Clear-data audit C1 (codex-clear-data-audit-8823b11-20261107.md; ADR-026):
 * durable, owner-bound chat attachment cleanup obligations for Clear All Data.
 *
 * Synthetic owners, synthetic documents and an in-memory filesystem fake
 * behind the react-native-fs Jest mock. The restart cases reopen a real SQLite
 * file in a fresh module registry, so nothing survives in module state.
 */
import RNFS from 'react-native-fs';
import { db, initDatabase, chatStore, userStore } from '../../src/storage';
import { GUEST_USER_ID } from '../../src/constants';
import { guestMigration } from '../../src/storage/guestMigration';
import {
  authorizeDataReset,
  finishAttachmentCleanup,
  resetPersonalData,
} from '../../src/storage/accountDataReset';
import {
  attachmentCleanupTarget,
  MAX_CLEANUP_PER_RUN,
  pendingAttachmentCleanup,
  recordAttachmentCleanup,
} from '../../src/storage/attachmentCleanup';
import { createOwnedTempDirectory, openSqliteFile } from '../fixtures/sqliteFile';
import type { OwnedTempDirectory } from '../fixtures/sqliteFile';

type Mock = jest.Mock;

/** In-memory files plus per-path failures, wired into a react-native-fs mock. */
const fakeFs = (fs: { exists: unknown; stat: unknown; unlink: unknown }) => {
  const files = new Set<string>();
  const directories = new Set<string>();
  const failUnlink = new Map<string, number>();
  const onUnlink: Array<(path: string) => void> = [];
  (fs.exists as Mock).mockImplementation(async (p: string) => files.has(p) || directories.has(p));
  (fs.stat as Mock).mockImplementation(async (p: string) => ({
    isFile: () => files.has(p),
    isDirectory: () => directories.has(p),
    size: 1,
  }));
  (fs.unlink as Mock).mockImplementation(async (p: string) => {
    const left = failUnlink.get(p) ?? 0;
    if (left > 0) {
      failUnlink.set(p, left - 1);
      throw new Error('synthetic unlink failure');
    }
    files.delete(p);
    directories.delete(p);
    onUnlink.forEach(hook => hook(p));
  });
  return { files, directories, failUnlink, onUnlink };
};

let serial = 0;
const owner = (label: string, executor: { executeSync: typeof db.executeSync } = db): string => {
  serial += 1;
  const id = `acl-${label}-${serial}`;
  const now = new Date().toISOString();
  executor.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const doc = (uri: string) => ({
  uri,
  fileName: uri.split('/').pop() ?? 'doc.pdf',
  format: 'pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
});

const attempts = (userId: string, path: string): number =>
  Number(
    db.executeSync('SELECT attempts FROM attachment_cleanup WHERE user_id = ? AND path = ?', [userId, path])
      .rows[0]?.attempts ?? -1,
  );

const messageCount = (userId: string): number =>
  Number(
    db.executeSync(
      'SELECT COUNT(*) AS n FROM messages m JOIN chat_sessions s ON s.id = m.session_id WHERE s.user_id = ?',
      [userId],
    ).rows[0]?.n ?? 0,
  );

/** One Clear All Data as Profile runs it: the reset, then the cleanup pass. */
const clearAll = async (userId: string) => {
  const authority = authorizeDataReset(userId);
  const outcome = resetPersonalData(authority);
  if (!outcome.admitted || !authority) throw new Error('not admitted');
  return { outcome, cleanup: await finishAttachmentCleanup(authority) };
};

const unlink = RNFS.unlink as unknown as Mock;
let fs: ReturnType<typeof fakeFs>;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  unlink.mockClear();
  fs = fakeFs(RNFS);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('attachmentCleanupTarget refuses anything that is not a chat attachment file', () => {
  it.each([
    ['file:///documents/chat_files/1700000000000_report.pdf', '/documents/chat_files/1700000000000_report.pdf'],
    ['/documents/chat_files/2_notes.docx', '/documents/chat_files/2_notes.docx'],
    ['file:///documents/synthetic.pdf', '/documents/synthetic.pdf'],
  ])('accepts %s', (uri, path) => {
    expect(attachmentCleanupTarget(uri)).toBe(path);
  });

  it.each([
    'content://com.android.providers/document/1',
    'https://example.invalid/a.pdf',
    'chat_files/a.pdf',
    '',
    '/documents',
    '/documents/',
    '/documents/chat_files',
    '/documents/chat_files/',
    '/documents/../etc/hosts.txt',
    '/documents/chat_files/../models/model.bin',
    '/documents/./a.pdf',
    '/documents//a.pdf',
    '/documents/models/ggml-base.en-q5_1.bin',
    '/documents/meetings/m1/chunk-0001.wav',
    '/documents/avatars/me.png',
    '/documents/chat_files/nested/a.pdf',
    '/documents/calendar_visibility.json',
    '/documents/imported_batches.json',
    '/documents/.hidden.pdf',
    '/documents/no-extension',
    '/documents2/a.pdf',
    '/cache/chat_share/a.pdf',
    '/documents/a\\b.pdf',
    '/documents/a\u0000.pdf',
    'file://documents/a.pdf',
  ])('refuses %j', uri => {
    expect(attachmentCleanupTarget(uri)).toBeNull();
  });

  it('refuses non-strings', () => {
    expect(attachmentCleanupTarget(undefined)).toBeNull();
    expect(attachmentCleanupTarget(42)).toBeNull();
  });
});

describe('Clear All Data attachment cleanup (C1)', () => {
  it('keeps a failed removal saved, and a later Clear All Data removes it', async () => {
    const a = owner('retry');
    userStore.setCurrentUser(a);
    const path = `/documents/chat_files/1_${a}.pdf`;
    fs.files.add(path);
    fs.failUnlink.set(path, 1);
    chatStore.addMessage(a, 'assistant', 'Synthetic document', doc(`file://${path}`));

    const first = await clearAll(a);
    expect(first.outcome).toMatchObject({ chat: 'cleared', refusedAttachments: 0 });
    expect(first.cleanup).toEqual({ removed: 0, pending: 1, interrupted: false });
    expect(fs.files.has(path)).toBe(true);
    expect(messageCount(a)).toBe(0);
    expect(pendingAttachmentCleanup(a)).toEqual([path]);
    expect(attempts(a, path)).toBe(1);

    // Chat history is already empty: the saved obligation is what is retried.
    const second = await clearAll(a);
    expect(second.cleanup).toEqual({ removed: 1, pending: 0, interrupted: false });
    expect(fs.files.has(path)).toBe(false);
    expect(pendingAttachmentCleanup(a)).toEqual([]);
    expect(unlink).toHaveBeenCalledTimes(2);
  });

  it('an already-missing file completes its cleanup without an unlink', async () => {
    const a = owner('missing');
    userStore.setCurrentUser(a);
    chatStore.addMessage(a, 'assistant', 'Synthetic document', doc('file:///documents/chat_files/gone.pdf'));
    const { cleanup } = await clearAll(a);
    expect(cleanup).toEqual({ removed: 1, pending: 0, interrupted: false });
    expect(unlink).not.toHaveBeenCalled();
  });

  it('records duplicate references once, counts them once, and retries idempotently', async () => {
    const a = owner('dup');
    userStore.setCurrentUser(a);
    const path = '/documents/chat_files/dup.pdf';
    fs.files.add(path);
    fs.failUnlink.set(path, 2);
    chatStore.addMessage(a, 'assistant', 'one', doc(`file://${path}`));
    chatStore.addMessage(a, 'assistant', 'two', doc(path));
    chatStore.addMessage(a, 'assistant', 'three', doc(`file://${path}`));

    const first = await clearAll(a);
    expect(first.cleanup.pending).toBe(1);
    const second = await clearAll(a);
    expect(second.cleanup.pending).toBe(1);
    expect(attempts(a, path)).toBe(2);
    // Recording the same path again (another reset) does not add a row.
    db.transactionSync(tx => recordAttachmentCleanup(tx, a, [path, path]));
    expect(pendingAttachmentCleanup(a)).toEqual([path]);
    const third = await clearAll(a);
    expect(third.cleanup).toEqual({ removed: 1, pending: 0, interrupted: false });
    expect(unlink).toHaveBeenCalledTimes(3);
    expect(fs.files.has(path)).toBe(false);
  });

  it('a failure to save the obligation keeps the chat messages and reports chat not cleared', async () => {
    const a = owner('persist');
    userStore.setCurrentUser(a);
    const path = '/documents/chat_files/persist.pdf';
    fs.files.add(path);
    chatStore.addMessage(a, 'assistant', 'Synthetic document', doc(`file://${path}`));
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/INSERT OR IGNORE INTO attachment_cleanup/.test(sql)) throw new Error('synthetic obligation write failure');
      return real(sql, params as never);
    });
    const { outcome, cleanup } = await clearAll(a);
    jest.restoreAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(outcome).toMatchObject({ planner: 'cleared', chat: 'failed' });
    expect(cleanup).toEqual({ removed: 0, pending: 0, interrupted: false });
    // The only reference to the file is still there, so nothing is lost.
    expect(messageCount(a)).toBe(1);
    expect(chatStore.getAttachmentUris(a)).toEqual([`file://${path}`]);
    expect(fs.files.has(path)).toBe(true);
    expect(unlink).not.toHaveBeenCalled();

    const retry = await clearAll(a);
    expect(retry.outcome).toMatchObject({ chat: 'cleared' });
    expect(retry.cleanup).toEqual({ removed: 1, pending: 0, interrupted: false });
    expect(fs.files.has(path)).toBe(false);
  });

  it('a failure to retire a completed obligation is not success, and the next pass finishes it', async () => {
    const a = owner('retire');
    userStore.setCurrentUser(a);
    const path = '/documents/chat_files/retire.pdf';
    fs.files.add(path);
    chatStore.addMessage(a, 'assistant', 'Synthetic document', doc(`file://${path}`));
    const authority = authorizeDataReset(a);
    expect(resetPersonalData(authority)).toMatchObject({ chat: 'cleared' });
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/^DELETE FROM attachment_cleanup/.test(sql)) throw new Error('synthetic retire failure');
      return real(sql, params as never);
    });
    const cleanup = await finishAttachmentCleanup(authority!);
    jest.restoreAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(cleanup).toEqual({ removed: 0, pending: 1, interrupted: false });
    expect(fs.files.has(path)).toBe(false);

    const next = await clearAll(a);
    expect(next.cleanup).toEqual({ removed: 1, pending: 0, interrupted: false });
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it("never touches another owner's obligations or files", async () => {
    const b = owner('other-b');
    userStore.setCurrentUser(b);
    const bPath = '/documents/chat_files/b.pdf';
    fs.files.add(bPath);
    fs.failUnlink.set(bPath, 1);
    chatStore.addMessage(b, 'assistant', 'B document', doc(`file://${bPath}`));
    await clearAll(b);
    expect(pendingAttachmentCleanup(b)).toEqual([bPath]);
    unlink.mockClear();

    const a = owner('other-a');
    userStore.setCurrentUser(a);
    const aPath = '/documents/chat_files/a.pdf';
    fs.files.add(aPath);
    chatStore.addMessage(a, 'assistant', 'A document', doc(`file://${aPath}`));
    const { cleanup } = await clearAll(a);
    expect(cleanup).toEqual({ removed: 1, pending: 0, interrupted: false });
    expect(unlink.mock.calls).toEqual([[aPath]]);
    expect(pendingAttachmentCleanup(b)).toEqual([bPath]);
    expect(fs.files.has(bPath)).toBe(true);
  });

  it('refused references are left alone, never recorded, and reported', async () => {
    const a = owner('refused');
    userStore.setCurrentUser(a);
    const model = '/documents/models/ggml-base.en-q5_1.bin';
    fs.files.add(model);
    chatStore.addMessage(a, 'assistant', 'forged', doc(`file://${model}`));
    chatStore.addMessage(a, 'assistant', 'remote', doc('https://example.invalid/a.pdf'));
    const { outcome, cleanup } = await clearAll(a);
    expect(outcome).toMatchObject({ chat: 'cleared', refusedAttachments: 2 });
    expect(cleanup.pending).toBe(0);
    expect(pendingAttachmentCleanup(a)).toEqual([]);
    expect(unlink).not.toHaveBeenCalled();
    expect(fs.files.has(model)).toBe(true);
  });

  it('a saved row that fails the path rules (tampered or older) is never acted on', async () => {
    const a = owner('stored-invalid');
    userStore.setCurrentUser(a);
    const model = '/documents/models/ggml-base.en-q5_1.bin';
    fs.files.add(model);
    // Written directly, bypassing the checks a real reset applies.
    db.executeSync('INSERT INTO attachment_cleanup (user_id, path, recorded_at) VALUES (?, ?, ?)', [
      a,
      model,
      new Date().toISOString(),
    ]);
    const { cleanup } = await clearAll(a);
    expect(cleanup).toEqual({ removed: 0, pending: 1, interrupted: false });
    expect(unlink).not.toHaveBeenCalled();
    expect(RNFS.exists).not.toHaveBeenCalledWith(model);
    expect(fs.files.has(model)).toBe(true);
  });

  it('a target that is a directory is never unlinked and stays saved', async () => {
    const a = owner('dir');
    userStore.setCurrentUser(a);
    const path = '/documents/chat_files/looks-like.pdf';
    fs.directories.add(path);
    db.transactionSync(tx => recordAttachmentCleanup(tx, a, [path]));
    const { cleanup } = await clearAll(a);
    expect(cleanup).toEqual({ removed: 0, pending: 1, interrupted: false });
    expect(unlink).not.toHaveBeenCalled();
    expect(fs.directories.has(path)).toBe(true);
  });

  it('stops when the sign-in changes mid-cleanup; the rest stays saved for that owner only', async () => {
    const a = owner('switch-a');
    const b = owner('switch-b');
    userStore.setCurrentUser(a);
    const first = '/documents/chat_files/1_first.pdf';
    const second = '/documents/chat_files/2_second.pdf';
    fs.files.add(first);
    fs.files.add(second);
    chatStore.addMessage(a, 'assistant', 'first', doc(`file://${first}`));
    chatStore.addMessage(a, 'assistant', 'second', doc(`file://${second}`));
    // Another account signs in while the first file is being removed.
    fs.onUnlink.push(path => {
      if (path === first) userStore.setCurrentUser(b);
    });
    const { cleanup } = await clearAll(a);
    fs.onUnlink.length = 0;
    expect(cleanup).toEqual({ removed: 1, pending: 1, interrupted: true });
    expect(fs.files.has(second)).toBe(true);
    expect(pendingAttachmentCleanup(a)).toEqual([second]);
    expect(pendingAttachmentCleanup(b)).toEqual([]);

    userStore.setCurrentUser(a);
    const again = await clearAll(a);
    expect(again.cleanup).toEqual({ removed: 1, pending: 0, interrupted: false });
    expect(fs.files.has(second)).toBe(false);
  });

  it('removes at most MAX_CLEANUP_PER_RUN files per Clear All Data and counts the rest', async () => {
    const a = owner('bounded');
    userStore.setCurrentUser(a);
    const paths = Array.from({ length: MAX_CLEANUP_PER_RUN + 2 }, (_, i) => `/documents/chat_files/${i}_b.pdf`);
    db.transactionSync(tx => recordAttachmentCleanup(tx, a, paths));
    const first = await clearAll(a);
    expect(first.cleanup).toEqual({ removed: MAX_CLEANUP_PER_RUN, pending: 2, interrupted: false });
    const second = await clearAll(a);
    expect(second.cleanup).toEqual({ removed: 2, pending: 0, interrupted: false });
  });

  it("guest linking moves the guest's saved cleanup to the account", async () => {
    const cloud = owner('cloud');
    userStore.setCurrentUser(GUEST_USER_ID);
    const path = '/documents/chat_files/guest.pdf';
    fs.files.add(path);
    fs.failUnlink.set(path, 1);
    chatStore.addMessage(GUEST_USER_ID, 'assistant', 'guest document', doc(`file://${path}`));
    expect((await clearAll(GUEST_USER_ID)).cleanup.pending).toBe(1);
    await guestMigration.linkGuestToCloudAccount(cloud, `${cloud}@example.invalid`);
    expect(pendingAttachmentCleanup(GUEST_USER_ID)).toEqual([]);
    expect(pendingAttachmentCleanup(cloud)).toEqual([path]);
    const { cleanup } = await clearAll(cloud);
    expect(cleanup).toEqual({ removed: 1, pending: 0, interrupted: false });
    expect(fs.files.has(path)).toBe(false);
  });
});

describe('saved cleanup survives a restart (real SQLite file, fresh modules)', () => {
  let directory: OwnedTempDirectory;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    directory = createOwnedTempDirectory();
  });

  afterEach(() => {
    directory.remove();
  });

  /** Opens `file` with a fresh copy of every module, as a new process would. */
  const launch = async (file: string) => {
    const connection = openSqliteFile(file);
    let storage!: typeof import('../../src/storage');
    let reset!: typeof import('../../src/storage/accountDataReset');
    let cleanup!: typeof import('../../src/storage/attachmentCleanup');
    let files!: typeof RNFS;
    jest.isolateModules(() => {
      jest.doMock('@op-engineering/op-sqlite', () => ({ open: () => connection }));
      storage = require('../../src/storage');
      reset = require('../../src/storage/accountDataReset');
      cleanup = require('../../src/storage/attachmentCleanup');
      files = require('react-native-fs');
    });
    await storage.initDatabase();
    return { connection, storage, reset, cleanup, files };
  };

  it('a crash after the commit but before any unlink: the next launch removes the file', async () => {
    const file = directory.file('crash-before-unlink.db');
    const run1 = await launch(file);
    const a = owner('restart-a', run1.storage.db);
    run1.storage.userStore.setCurrentUser(a);
    const path = '/documents/chat_files/restart.pdf';
    run1.storage.chatStore.addMessage(a, 'assistant', 'doc', doc(`file://${path}`));
    expect(run1.reset.resetPersonalData(run1.reset.authorizeDataReset(a))).toMatchObject({ chat: 'cleared' });
    // The process ends here: no cleanup pass ran.
    run1.connection.close();

    const run2 = await launch(file);
    const disk = fakeFs(run2.files);
    disk.files.add(path);
    expect(run2.cleanup.pendingAttachmentCleanup(a)).toEqual([path]);
    expect(run2.storage.chatStore.getAttachmentUris(a)).toEqual([]);
    const authority = run2.reset.authorizeDataReset(a);
    expect(run2.reset.resetPersonalData(authority)).toMatchObject({ admitted: true, chat: 'cleared' });
    expect(await run2.reset.finishAttachmentCleanup(authority!)).toEqual({
      removed: 1,
      pending: 0,
      interrupted: false,
    });
    expect(disk.files.has(path)).toBe(false);
    run2.connection.close();
  });

  it('a crash after the unlink but before retiring: the next launch finds the file gone and retires it', async () => {
    const file = directory.file('crash-after-unlink.db');
    const run1 = await launch(file);
    const a = owner('restart-b', run1.storage.db);
    run1.storage.userStore.setCurrentUser(a);
    const path = '/documents/chat_files/half-done.pdf';
    const disk1 = fakeFs(run1.files);
    disk1.files.add(path);
    run1.storage.chatStore.addMessage(a, 'assistant', 'doc', doc(`file://${path}`));
    const authority1 = run1.reset.authorizeDataReset(a);
    run1.reset.resetPersonalData(authority1);
    // The file is removed, then the process dies before the row is retired.
    run1.connection.failWhen = query => /^DELETE FROM attachment_cleanup/.test(query);
    expect((await run1.reset.finishAttachmentCleanup(authority1!)).pending).toBe(1);
    expect(disk1.files.has(path)).toBe(false);
    run1.connection.failWhen = null;
    run1.connection.close();

    const run2 = await launch(file);
    const disk2 = fakeFs(run2.files);
    // The registry may hand back the same mock function: count run 2's calls only.
    (run2.files.unlink as unknown as Mock).mockClear();
    expect(run2.cleanup.pendingAttachmentCleanup(a)).toEqual([path]);
    const authority2 = run2.reset.authorizeDataReset(a);
    run2.reset.resetPersonalData(authority2);
    expect(await run2.reset.finishAttachmentCleanup(authority2!)).toEqual({
      removed: 1,
      pending: 0,
      interrupted: false,
    });
    expect(run2.files.unlink).not.toHaveBeenCalled();
    expect(disk2.files.size).toBe(0);
    run2.connection.close();
  });
});
