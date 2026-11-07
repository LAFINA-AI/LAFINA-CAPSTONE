/**
 * Attachment-cleanup audit C2 (codex-attachment-cleanup-audit-69aafcd-20261107.md;
 * ADR-026): saved cleanup obligations are attempted fairly across bounded
 * passes. Obligations that keep failing, refused saved paths and directories
 * take their turn and yield it, so they can no longer hold the front of the
 * queue and starve a removable file behind them.
 *
 * Synthetic owners and paths; an in-memory filesystem fake behind the
 * react-native-fs Jest mock; restart cases reopen a real SQLite file with a
 * fresh module registry, so no fairness state survives in module memory.
 */
import RNFS from 'react-native-fs';
import { db, initDatabase, userStore } from '../../src/storage';
import { DatabaseService } from '../../src/storage/database';
import { SCHEMA_MIGRATIONS, initDatabase as initDatabaseWith } from '../../src/storage/dbInit';
import { authorizeDataReset, finishAttachmentCleanup } from '../../src/storage/accountDataReset';
import {
  MAX_CLEANUP_PER_RUN,
  pendingAttachmentCleanup,
  recordAttachmentCleanup,
  runAttachmentCleanup,
} from '../../src/storage/attachmentCleanup';
import type { AttachmentCleanupResult } from '../../src/storage/attachmentCleanup';
import { createOwnedTempDirectory, openSqliteFile } from '../fixtures/sqliteFile';
import type { OwnedTempDirectory } from '../fixtures/sqliteFile';

type Mock = jest.Mock;
type Executor = { executeSync: typeof db.executeSync };

const FROZEN = '2026-11-07T00:00:00.000Z';

/** In-memory files, directories and persistent per-path unlink failures. */
const fakeFs = (fs: { exists: unknown; stat: unknown; unlink: unknown }) => {
  const files = new Set<string>();
  const directories = new Set<string>();
  const failing = new Set<string>();
  /** Every path the cleanup looked at, in order (one `exists` per attempt). */
  const looked: string[] = [];
  const hang = new Set<string>();
  (fs.exists as Mock).mockImplementation((p: string) => {
    looked.push(p);
    if (hang.has(p)) return new Promise<boolean>(() => undefined); // the process "stops" here
    return Promise.resolve(files.has(p) || directories.has(p));
  });
  (fs.stat as Mock).mockImplementation(async (p: string) => ({
    isFile: () => files.has(p),
    isDirectory: () => directories.has(p),
    size: 1,
  }));
  (fs.unlink as Mock).mockImplementation(async (p: string) => {
    if (failing.has(p)) throw new Error('synthetic persistent unlink failure');
    files.delete(p);
    directories.delete(p);
  });
  return { files, directories, failing, looked, hang };
};

let serial = 0;
const owner = (label: string, executor: Executor = db): string => {
  serial += 1;
  const id = `acf-${label}-${serial}`;
  const now = new Date().toISOString();
  executor.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const paths = (label: string, count: number, from = 0): string[] =>
  Array.from({ length: count }, (_, i) => `/documents/chat_files/${label}_${String(from + i).padStart(3, '0')}.pdf`);

interface Row {
  path: string;
  attempts: number;
  queue_order: number;
  recorded_at: string;
  last_attempt_at: string | null;
}

const rows = (userId: string, executor: Executor = db): Row[] =>
  executor
    .executeSync(
      'SELECT path, attempts, queue_order, recorded_at, last_attempt_at FROM attachment_cleanup WHERE user_id = ? ORDER BY path',
      [userId],
    )
    .rows.map(row => row as unknown as Row);

const attemptsOf = (userId: string, executor: Executor = db): Map<string, number> =>
  new Map(rows(userId, executor).map(row => [row.path, Number(row.attempts)]));

/** One explicit retry, as Profile runs it after the reset: the bounded pass. */
const pass = (userId: string): Promise<AttachmentCleanupResult> => {
  const authority = authorizeDataReset(userId);
  if (!authority) throw new Error('not admitted');
  return finishAttachmentCleanup(authority);
};

const unlink = RNFS.unlink as unknown as Mock;
const exists = RNFS.exists as unknown as Mock;
let fs: ReturnType<typeof fakeFs>;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  unlink.mockClear();
  exists.mockClear();
  fs = fakeFs(RNFS);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Records `list` the way a reset does: one transaction, one timestamp. */
const record = (userId: string, list: string[], executor: { transactionSync: typeof db.transactionSync } = db) =>
  executor.transactionSync(tx => recordAttachmentCleanup(tx, userId, list));

describe('fair attachment cleanup across bounded passes (C2)', () => {
  it('a removable file behind at least 50 persistent failures is removed, with at most 50 attempts per pass', async () => {
    const a = owner('starve');
    userStore.setCurrentUser(a);
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(FROZEN); // frozen clock
    const stuck = paths('stuck', MAX_CLEANUP_PER_RUN + 10);
    const free = paths('free', 3);
    [...stuck, ...free].forEach(p => fs.files.add(p));
    stuck.forEach(p => fs.failing.add(p));
    record(a, [...stuck, ...free]);
    // Equal timestamps for every obligation: ties must not pin the same batch.
    expect(new Set(rows(a).map(r => r.recorded_at))).toEqual(new Set([FROZEN]));

    const results: AttachmentCleanupResult[] = [];
    const perPass: string[][] = [];
    for (let i = 0; i < 2; i += 1) {
      fs.looked.length = 0;
      results.push(await pass(a));
      perPass.push([...fs.looked]);
    }
    perPass.forEach(seen => {
      expect(seen.length).toBeLessThanOrEqual(MAX_CLEANUP_PER_RUN);
      expect(new Set(seen).size).toBe(seen.length);
    });
    free.forEach(p => expect(fs.files.has(p)).toBe(false));
    expect(results[0]).toEqual({ removed: 0, pending: stuck.length + free.length, interrupted: false, unsaved: 0 });
    expect(results[1]).toEqual({ removed: free.length, pending: stuck.length, interrupted: false, unsaved: 0 });
    // Failures are never dropped or deleted to make progress.
    expect(pendingAttachmentCleanup(a).sort()).toEqual([...stuck].sort());
    stuck.forEach(p => expect(fs.files.has(p)).toBe(true));
    expect(new Set(rows(a).map(r => r.last_attempt_at))).toEqual(new Set([FROZEN]));
  });

  it('every saved obligation is attempted within ceil(N / 50) passes, round after round', async () => {
    const a = owner('rotate');
    userStore.setCurrentUser(a);
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(FROZEN);
    const all = paths('rot', 2 * MAX_CLEANUP_PER_RUN + 20); // 120 persistent failures
    all.forEach(p => {
      fs.files.add(p);
      fs.failing.add(p);
    });
    record(a, all);
    const rounds = Math.ceil(all.length / MAX_CLEANUP_PER_RUN);
    for (let round = 1; round <= 3; round += 1) {
      const seen = new Set<string>();
      for (let i = 0; i < rounds; i += 1) {
        fs.looked.length = 0;
        const result = await pass(a);
        expect(fs.looked.length).toBeLessThanOrEqual(MAX_CLEANUP_PER_RUN);
        expect(result).toEqual({ removed: 0, pending: all.length, interrupted: false, unsaved: 0 });
        fs.looked.forEach(p => seen.add(p));
      }
      expect(seen.size).toBe(all.length);
      const counts = [...attemptsOf(a).values()];
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('refused saved paths and directory targets ahead of a valid file take their turn and yield it', async () => {
    const a = owner('refused-dirs');
    userStore.setCurrentUser(a);
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(FROZEN);
    // Saved directly, bypassing the path rules a real reset applies (tampered or older rows).
    const refused = Array.from({ length: 30 }, (_, i) => `/documents/models/m_${String(i).padStart(2, '0')}.bin`);
    refused.forEach((p, i) => {
      fs.files.add(p);
      db.executeSync('INSERT INTO attachment_cleanup (user_id, path, recorded_at, queue_order) VALUES (?, ?, ?, ?)', [
        a,
        p,
        FROZEN,
        i + 1,
      ]);
    });
    const dirs = paths('dir', 25);
    dirs.forEach(p => fs.directories.add(p));
    record(a, dirs);
    const valid = '/documents/chat_files/valid_after.pdf';
    fs.files.add(valid);
    record(a, [valid]);
    expect(pendingAttachmentCleanup(a)[0]).toBe(refused[0]);

    const first = await pass(a);
    expect(first).toEqual({ removed: 0, pending: 56, interrupted: false, unsaved: 0 });
    const second = await pass(a);
    expect(second).toEqual({ removed: 1, pending: 55, interrupted: false, unsaved: 0 });
    expect(fs.files.has(valid)).toBe(false);
    // Unsafe targets are never touched or dropped: they stay saved and visible.
    refused.forEach(p => {
      expect(exists).not.toHaveBeenCalledWith(p);
      expect(fs.files.has(p)).toBe(true);
    });
    dirs.forEach(p => expect(fs.directories.has(p)).toBe(true));
    expect(unlink.mock.calls).toEqual([[valid]]);
    expect(pendingAttachmentCleanup(a).sort()).toEqual([...refused, ...dirs].sort());
    const counts = attemptsOf(a);
    expect(counts.get(refused[0])).toBe(2); // its turn came twice and it yielded each time
    expect(counts.get(dirs[dirs.length - 1])).toBe(1);
  });

  it('new obligations arriving between passes join the back, and are reached once the ones ahead had their turn', async () => {
    const a = owner('arrivals');
    userStore.setCurrentUser(a);
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(FROZEN);
    const old = paths('old', MAX_CLEANUP_PER_RUN + 5);
    old.forEach(p => {
      fs.files.add(p);
      fs.failing.add(p);
    });
    record(a, old);
    await pass(a);
    const fresh = paths('new', 2);
    fresh.forEach(p => fs.files.add(p));
    record(a, fresh);
    // 55 obligations are ahead of the new ones: two passes reach them.
    fs.looked.length = 0;
    expect(await pass(a)).toMatchObject({ removed: 0, pending: 57 });
    expect(fs.looked).toEqual([...old.slice(MAX_CLEANUP_PER_RUN), ...old.slice(0, 45)]);
    expect(await pass(a)).toEqual({ removed: 2, pending: 55, interrupted: false, unsaved: 0 });
    fresh.forEach(p => expect(fs.files.has(p)).toBe(false));

    // Later arrivals never push the obligations already waiting further back.
    const later = paths('later', MAX_CLEANUP_PER_RUN);
    later.forEach(p => {
      fs.files.add(p);
      fs.failing.add(p);
    });
    record(a, later);
    const before = attemptsOf(a);
    fs.looked.length = 0;
    await pass(a);
    expect(fs.looked.every(p => old.includes(p))).toBe(true);
    expect(fs.looked.length).toBe(MAX_CLEANUP_PER_RUN);
    later.forEach(p => expect(before.get(p)).toBe(0));
  });

  it('recording a saved path again keeps its place and attempts; repeated passes stay idempotent', async () => {
    const a = owner('dups');
    userStore.setCurrentUser(a);
    const list = paths('dupq', 3);
    list.forEach(p => {
      fs.files.add(p);
      fs.failing.add(p);
    });
    record(a, list);
    await pass(a);
    const before = rows(a);
    record(a, [list[0], list[0], list[2]]);
    expect(rows(a)).toEqual(before);
    expect(pendingAttachmentCleanup(a)).toHaveLength(3);
    for (let i = 0; i < 3; i += 1) {
      expect(await pass(a)).toEqual({ removed: 0, pending: 3, interrupted: false, unsaved: 0 });
    }
    expect([...attemptsOf(a).values()]).toEqual([4, 4, 4]);
    fs.failing.clear();
    expect(await pass(a)).toEqual({ removed: 3, pending: 0, interrupted: false, unsaved: 0 });
    expect(await pass(a)).toEqual({ removed: 0, pending: 0, interrupted: false, unsaved: 0 });
  });

  it("never reads, moves or attempts another owner's obligations", async () => {
    const b = owner('fair-b');
    const a = owner('fair-a');
    const bList = paths('bq', MAX_CLEANUP_PER_RUN + 1);
    bList.forEach(p => {
      fs.files.add(p);
      fs.failing.add(p);
    });
    record(b, bList);
    const bBefore = rows(b);
    userStore.setCurrentUser(a);
    const aList = paths('aq', MAX_CLEANUP_PER_RUN + 1);
    aList.forEach(p => {
      fs.files.add(p);
      fs.failing.add(p);
    });
    fs.failing.delete(aList[aList.length - 1]);
    record(a, aList);
    // Turns are per owner: A's queue numbering never depends on B's.
    expect(rows(a).map(r => Number(r.queue_order)).sort((x, y) => x - y)).toEqual(
      Array.from({ length: aList.length }, (_, i) => i + 1),
    );
    await pass(a);
    expect(await pass(a)).toMatchObject({ removed: 1, pending: MAX_CLEANUP_PER_RUN });
    expect(rows(b)).toEqual(bBefore);
    expect(fs.looked.some(p => bList.includes(p))).toBe(false);
  });

  it('a sign-in change mid-pass leaves the unreached obligations at the front for that owner', async () => {
    const a = owner('switch-a');
    const b = owner('switch-b');
    userStore.setCurrentUser(a);
    const list = paths('sw', 4);
    list.forEach(p => {
      fs.files.add(p);
      fs.failing.add(p);
    });
    record(a, list);
    unlink.mockImplementation(async (p: string) => {
      if (p === list[0]) userStore.setCurrentUser(b);
      throw new Error('synthetic persistent unlink failure');
    });
    expect(await pass(a)).toEqual({ removed: 0, pending: 4, interrupted: true, unsaved: 0 });
    expect([...attemptsOf(a).values()]).toEqual([1, 0, 0, 0]);
    expect(pendingAttachmentCleanup(a)).toEqual([list[1], list[2], list[3], list[0]]);
    expect(pendingAttachmentCleanup(b)).toEqual([]);
    userStore.setCurrentUser(a);
    unlink.mockImplementation(async (p: string) => {
      fs.files.delete(p);
    });
    fs.looked.length = 0;
    expect(await pass(a)).toEqual({ removed: 4, pending: 0, interrupted: false, unsaved: 0 });
    expect(fs.looked).toEqual([list[1], list[2], list[3], list[0]]);
  });

  it('obligations that move to another owner mid-pass are neither attempted nor counted', async () => {
    const guest = owner('move-guest');
    const cloud = owner('move-cloud');
    userStore.setCurrentUser(guest);
    const list = paths('mv', 3);
    list.forEach(p => fs.files.add(p));
    record(guest, list);
    // While the first file is removed, the rest (and the first) move to another owner.
    unlink.mockImplementation(async (p: string) => {
      fs.files.delete(p);
      if (p === list[0]) {
        db.executeSync('UPDATE attachment_cleanup SET user_id = ? WHERE user_id = ?', [cloud, guest]);
      }
    });
    expect(await runAttachmentCleanup(guest)).toEqual({ removed: 0, pending: 0, interrupted: false, unsaved: 0 });
    expect(unlink.mock.calls).toEqual([[list[0]]]);
    expect(fs.files.has(list[1]) && fs.files.has(list[2])).toBe(true);
    expect(attemptsOf(cloud).get(list[1])).toBe(0);
    expect(pendingAttachmentCleanup(cloud)).toHaveLength(3);
  });
});

describe('bookkeeping failures are reported, never presented as progress (C2)', () => {
  const failClaims = (when: (params: unknown[]) => boolean) => {
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/^UPDATE attachment_cleanup SET attempts/.test(sql) && when(params ?? [])) {
        throw new Error('synthetic scheduling write failure');
      }
      return real(sql, params as never);
    });
  };

  it('when no attempt can be saved, no file is touched, nothing moves, and the pass says so', async () => {
    const a = owner('claim-fail');
    userStore.setCurrentUser(a);
    const list = paths('cf', 3);
    list.forEach(p => fs.files.add(p));
    record(a, list);
    const before = rows(a);
    failClaims(() => true);
    const result = await pass(a);
    jest.restoreAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(result).toEqual({ removed: 0, pending: 3, interrupted: false, unsaved: 3 });
    expect(exists).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(rows(a)).toEqual(before);
    // Recoverable: once writes work again, the next pass finishes the work.
    expect(await pass(a)).toEqual({ removed: 3, pending: 0, interrupted: false, unsaved: 0 });
  });

  it('one obligation whose attempt cannot be saved does not block the others', async () => {
    const a = owner('claim-one');
    userStore.setCurrentUser(a);
    const list = paths('co', 3);
    list.forEach(p => fs.files.add(p));
    record(a, list);
    failClaims(params => params.includes(list[0]));
    const result = await pass(a);
    expect(result).toEqual({ removed: 2, pending: 1, interrupted: false, unsaved: 1 });
    expect(fs.files.has(list[0])).toBe(true);
    expect(pendingAttachmentCleanup(a)).toEqual([list[0]]);
    expect(attemptsOf(a).get(list[0])).toBe(0);
  });

  it('a removed file whose obligation cannot be retired is reported unsaved, and still yields its turn', async () => {
    const a = owner('retire-fail');
    userStore.setCurrentUser(a);
    const list = paths('rf', 2);
    list.forEach(p => fs.files.add(p));
    record(a, list);
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/^DELETE FROM attachment_cleanup/.test(sql) && (params ?? []).includes(list[0])) {
        throw new Error('synthetic retire failure');
      }
      return real(sql, params as never);
    });
    expect(await pass(a)).toEqual({ removed: 1, pending: 1, interrupted: false, unsaved: 1 });
    jest.restoreAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(attemptsOf(a).get(list[0])).toBe(1);
    unlink.mockClear();
    expect(await pass(a)).toEqual({ removed: 1, pending: 0, interrupted: false, unsaved: 0 });
    expect(unlink).not.toHaveBeenCalled();
  });

  it('an unreadable queue is reported as unknown, never as progress', async () => {
    const a = owner('read-fail');
    userStore.setCurrentUser(a);
    record(a, paths('rd', 1));
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/^SELECT path FROM attachment_cleanup .* LIMIT \?$/.test(sql)) throw new Error('synthetic read failure');
      return real(sql, params as never);
    });
    expect(await runAttachmentCleanup(a)).toEqual({ removed: 0, pending: null, interrupted: false, unsaved: 0 });
  });
});

describe('overlapping passes for one owner (C2)', () => {
  it('a second pass waits for the first, so no obligation is worked twice or counted twice', async () => {
    const a = owner('overlap');
    userStore.setCurrentUser(a);
    const list = paths('ov', 3);
    list.forEach(p => fs.files.add(p));
    fs.failing.add(list[1]);
    fs.failing.add(list[2]);
    record(a, list);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const order: string[] = [];
    unlink.mockImplementation(async (p: string) => {
      order.push(p);
      if (p === list[0]) await gate;
      if (fs.failing.has(p)) throw new Error('synthetic persistent unlink failure');
      fs.files.delete(p);
    });
    const first = pass(a);
    const second = pass(a);
    await new Promise(resolve => setImmediate(resolve));
    expect(order).toEqual([list[0]]); // the second pass has not started any file
    release();
    const [one, two] = await Promise.all([first, second]);
    expect(one).toEqual({ removed: 1, pending: 2, interrupted: false, unsaved: 0 });
    expect(two).toEqual({ removed: 0, pending: 2, interrupted: false, unsaved: 0 });
    expect(order).toEqual([list[0], list[1], list[2], list[1], list[2]]);
    expect([...attemptsOf(a).entries()]).toEqual([
      [list[1], 2],
      [list[2], 2],
    ]);
  });

  it('a pass for one owner does not wait for another owner', async () => {
    const a = owner('ov-a');
    const b = owner('ov-b');
    const aPath = '/documents/chat_files/ov_a.pdf';
    const bPath = '/documents/chat_files/ov_b.pdf';
    fs.files.add(aPath);
    fs.files.add(bPath);
    record(a, [aPath]);
    record(b, [bPath]);
    fs.hang.add(aPath);
    void runAttachmentCleanup(a);
    expect(await runAttachmentCleanup(b)).toEqual({ removed: 1, pending: 0, interrupted: false, unsaved: 0 });
  });
});

describe('fairness survives restarts (real SQLite file, fresh modules)', () => {
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
    const disk = fakeFs(files);
    // The registry may hand back the same mock functions: count this run's calls only.
    (files.unlink as unknown as Mock).mockClear();
    const retry = (userId: string) => reset.finishAttachmentCleanup(reset.authorizeDataReset(userId)!);
    return { connection, storage, reset, cleanup, files, disk, retry };
  };

  it('after a restart the next pass continues behind the failures instead of repeating them', async () => {
    const file = directory.file('fair-restart.db');
    const run1 = await launch(file);
    const a = owner('restart-fair', run1.storage.db);
    run1.storage.userStore.setCurrentUser(a);
    const list = paths('rs', MAX_CLEANUP_PER_RUN + 1);
    const last = list[list.length - 1];
    record(a, list, run1.storage.db);
    list.forEach(p => run1.disk.files.add(p));
    list.slice(0, -1).forEach(p => run1.disk.failing.add(p));
    expect(await run1.retry(a)).toEqual({
      removed: 0,
      pending: list.length,
      interrupted: false,
      unsaved: 0,
    });
    expect(run1.disk.files.has(last)).toBe(true);
    run1.connection.close();

    const run2 = await launch(file);
    list.forEach(p => run2.disk.files.add(p));
    list.slice(0, -1).forEach(p => run2.disk.failing.add(p));
    expect(run2.cleanup.pendingAttachmentCleanup(a)[0]).toBe(last);
    expect(await run2.retry(a)).toEqual({
      removed: 1,
      pending: MAX_CLEANUP_PER_RUN,
      interrupted: false,
      unsaved: 0,
    });
    expect(run2.disk.files.has(last)).toBe(false);
    expect(run2.disk.looked[0]).toBe(last);
    run2.connection.close();
  });

  it('a crash after the attempt is saved: the next launch starts behind that obligation, which stays saved', async () => {
    const file = directory.file('crash-after-claim.db');
    const run1 = await launch(file);
    const a = owner('crash-after', run1.storage.db);
    run1.storage.userStore.setCurrentUser(a);
    const list = paths('ca', 3);
    record(a, list, run1.storage.db);
    list.forEach(p => run1.disk.files.add(p));
    run1.disk.hang.add(list[0]); // the process stops while this file is being handled
    void run1.retry(a);
    await new Promise(resolve => setImmediate(resolve));
    expect(run1.disk.looked).toEqual([list[0]]);
    run1.connection.close();

    const run2 = await launch(file);
    list.forEach(p => run2.disk.files.add(p));
    expect(attemptsOf(a, run2.storage.db).get(list[0])).toBe(1);
    expect(run2.cleanup.pendingAttachmentCleanup(a)).toEqual([list[1], list[2], list[0]]);
    expect(await run2.retry(a)).toEqual({ removed: 3, pending: 0, interrupted: false, unsaved: 0 });
    expect(run2.disk.looked).toEqual([list[1], list[2], list[0]]);
    run2.connection.close();
  });

  it('a crash before the attempt is saved: the obligation keeps its place and goes first on the next launch', async () => {
    const file = directory.file('crash-before-claim.db');
    const run1 = await launch(file);
    const a = owner('crash-before', run1.storage.db);
    run1.storage.userStore.setCurrentUser(a);
    const list = paths('cb', 3);
    record(a, list, run1.storage.db);
    list.forEach(p => {
      run1.disk.files.add(p);
      run1.disk.failing.add(p);
    });
    // The first attempt is saved; the process dies while saving the second.
    let crashed = false;
    run1.connection.failWhen = (query: string) => {
      if (!/^UPDATE attachment_cleanup SET attempts/.test(query)) return false;
      if (attemptsOf(a, run1.storage.db).get(list[0]) === 1) crashed = true;
      return crashed;
    };
    const partial = await run1.cleanup.runAttachmentCleanup(a, () => !crashed);
    expect(partial).toMatchObject({ removed: 0, interrupted: true, unsaved: 1 });
    expect(run1.disk.looked).toEqual([list[0]]);
    run1.connection.failWhen = null;
    run1.connection.close();

    const run2 = await launch(file);
    list.forEach(p => run2.disk.files.add(p));
    expect([...attemptsOf(a, run2.storage.db).values()]).toEqual([1, 0, 0]);
    expect(run2.cleanup.pendingAttachmentCleanup(a)).toEqual([list[1], list[2], list[0]]);
    expect(await run2.retry(a)).toEqual({ removed: 3, pending: 0, interrupted: false, unsaved: 0 });
    expect(run2.disk.looked).toEqual([list[1], list[2], list[0]]);
    run2.connection.close();
  });

  it('schema 24 upgrades saved schema-23 obligations additively; ones the old order starved go first', async () => {
    const file = directory.file('schema-23.db');
    const seed = openSqliteFile(file);
    await initDatabaseWith(
      new DatabaseService(() => seed),
      SCHEMA_MIGRATIONS.filter(m => m.version <= 23),
    );
    const a = owner('upgrade', seed as unknown as Executor);
    const starvedPaths = paths('up', 3);
    const legacy = [
      [starvedPaths[0], 7, FROZEN],
      [starvedPaths[1], 7, FROZEN],
      [starvedPaths[2], 0, null],
    ] as const;
    legacy.forEach(([p, n, at]) =>
      seed.executeSync(
        'INSERT INTO attachment_cleanup (user_id, path, recorded_at, attempts, last_attempt_at) VALUES (?, ?, ?, ?, ?)',
        [a, p, FROZEN, n, at],
      ),
    );
    const before = seed.executeSync('SELECT * FROM attachment_cleanup ORDER BY path').rows;
    seed.close();

    const run = await launch(file);
    expect(Number(run.connection.executeSync('PRAGMA user_version').rows[0]?.user_version)).toBe(24);
    const after = run.connection.executeSync('SELECT * FROM attachment_cleanup ORDER BY path').rows;
    const withoutTurn = after.map(row => {
      const copy: Record<string, unknown> = { ...row };
      delete copy.queue_order;
      return copy;
    });
    expect(withoutTurn).toEqual(before);
    expect(after.map(r => r.queue_order)).toEqual([7, 7, 0]);
    expect(run.cleanup.pendingAttachmentCleanup(a)).toEqual([starvedPaths[2], starvedPaths[0], starvedPaths[1]]);
    run.connection.close();
  });
});
