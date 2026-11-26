import RNFS from 'react-native-fs';
import {meetingRecorder} from '../ai/native/meetingRecorder';
import {db, type DatabaseTransaction} from './database';
import {GUEST_USER_ID} from '../constants';

const KEY = 'dataReset.fileCleanup.v1';
type Target = {kind: 'meeting' | 'document'; value: string};
const inFlightByOwner = new Map<string, Promise<{pending: number | null}>>();

const isValidTarget = (item: unknown): item is Target =>
  Boolean(
    item &&
      typeof item === 'object' &&
      ['meeting', 'document'].includes((item as Target).kind) &&
      typeof (item as Target).value === 'string',
  );

const read = (
  owner: string,
  tx: Pick<DatabaseTransaction, 'executeSync'> = db,
  tolerateCorruptJson = false,
): Target[] => {
  const raw = tx.executeSync(
    'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
    [owner, KEY],
  ).rows[0]?.value;
  if (raw == null) return [];
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) {
      if (tolerateCorruptJson) return [];
      throw new Error('Saved file cleanup could not be read.');
    }
    if (tolerateCorruptJson) {
      return parsed.filter(isValidTarget);
    }
    if (!parsed.every(isValidTarget)) {
      throw new Error('Saved file cleanup could not be read.');
    }
    return parsed;
  } catch (error) {
    if (tolerateCorruptJson) return [];
    throw error;
  }
};
const write = (
  owner: string,
  entries: Target[],
  tx: Pick<DatabaseTransaction, 'executeSync'> = db,
) => {
  tx.executeSync(
    `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [owner, KEY, JSON.stringify(entries), new Date().toISOString()],
  );
};

export const hasPersonalFileCleanup = (owner: string): boolean => {
  try {
    return read(owner).length > 0;
  } catch {
    return true;
  }
};

/** Saved in the same transaction that removes the last database references. */
export const recordPersonalFileCleanup = (
  tx: DatabaseTransaction,
  owner: string,
  meetings: string[],
  documents: string[],
): void => {
  const entries = read(owner, tx, true);
  for (const target of [
    ...meetings.map(value => ({kind: 'meeting' as const, value})),
    ...documents.map(value => ({kind: 'document' as const, value})),
  ]) {
    if (
      !entries.some(
        item => item.kind === target.kind && item.value === target.value,
      )
    )
      entries.push(target);
  }
  write(owner, entries, tx);
};

/** Guest -> cloud upgrade: preserve pending personal file cleanup obligations. */
export const transferPersonalFileCleanupFromGuest = (
  tx: Pick<DatabaseTransaction, 'executeSync'>,
  fromUserId: string,
  toUserId: string,
): void => {
  if (fromUserId === toUserId) return;
  const guestEntries = read(fromUserId, tx, true);
  if (guestEntries.length > 0) {
    const merged = read(toUserId, tx, true);
    for (const target of guestEntries) {
      if (
        !merged.some(
          item => item.kind === target.kind && item.value === target.value,
        )
      ) {
        merged.push(target);
      }
    }
    write(toUserId, merged, tx);
  }
  tx.executeSync(
    'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
    [fromUserId, KEY],
  );
};

/** Failed deletions remain durable and are reported even after a restart. */
export const runPersonalFileCleanup = (
  owner: string,
  current: () => boolean,
): Promise<{pending: number | null}> => {
  const prior = inFlightByOwner.get(owner) ?? Promise.resolve({pending: 0});
  const run = prior.catch(() => ({pending: null})).then(async () => {
    try {
      const failed: Target[] = [];
      for (const target of read(owner, db, false).slice(0, 50)) {
        if (!current()) break;
        let removed = false;
        try {
          if (target.kind === 'meeting') {
            if (
              /^[A-Za-z0-9_-]+$/.test(target.value) &&
              (await meetingRecorder.deleteMeetingAudio(target.value))
            ) {
              removed = true;
            }
          } else {
            const root = String(RNFS.DocumentDirectoryPath ?? '').replace(
              /\/+$/,
              '',
            );
            const valid =
              root.startsWith('/') &&
              // eslint-disable-next-line no-control-regex
              !/[\\\x00-\x1f]/.test(target.value) &&
              !target.value
                .split('/')
                .some(part => part === '..' || part === '.') &&
              ([owner, GUEST_USER_ID].some(id =>
                target.value.startsWith(
                  `${root}/skills_documents/${encodeURIComponent(id)}/`,
                ),
              ) ||
                target.value.startsWith(`${root}/cor_drafts/`));
            if (valid) {
              if (await RNFS.exists(target.value)) {
                if ((await RNFS.stat(target.value)).isFile()) {
                  await RNFS.unlink(target.value);
                  removed = !(await RNFS.exists(target.value));
                }
              } else {
                removed = true;
              }
            }
          }
        } catch {
          removed = false;
        }
        if (!removed) {
          failed.push(target);
          continue;
        }
        if (!current()) break;
        db.transactionSync(tx =>
          write(
            owner,
            read(owner, tx, true).filter(
              item => item.kind !== target.kind || item.value !== target.value,
            ),
            tx,
          ),
        );
      }
      // Rotate attempted-but-failed targets to the tail so head-of-line items cannot starve later ones.
      if (failed.length > 0 && current()) {
        db.transactionSync(tx => {
          const currentQueue = read(owner, tx, true);
          const failedKey = (t: Target) => `${t.kind}:${t.value}`;
          const failedKeys = new Set(failed.map(failedKey));
          const rest = currentQueue.filter(t => !failedKeys.has(failedKey(t)));
          const tail = currentQueue.filter(t => failedKeys.has(failedKey(t)));
          if (rest.length > 0 && tail.length > 0) {
            write(owner, [...rest, ...tail], tx);
          }
        });
      }
      return {pending: read(owner, db, false).length};
    } catch {
      return {pending: null};
    }
  });
  inFlightByOwner.set(owner, run);
  void run.finally(() => {
    if (inFlightByOwner.get(owner) === run) {
      inFlightByOwner.delete(owner);
    }
  });
  return run;
};
