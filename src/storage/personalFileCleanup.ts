import RNFS from 'react-native-fs';
import {meetingRecorder} from '../ai/native/meetingRecorder';
import {db, type DatabaseTransaction} from './database';
import {GUEST_USER_ID} from '../constants';

const KEY = 'dataReset.fileCleanup.v1';
type Target = {kind: 'meeting' | 'document'; value: string};
const read = (
  owner: string,
  tx: Pick<DatabaseTransaction, 'executeSync'> = db,
): Target[] => {
  const raw = tx.executeSync(
    'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
    [owner, KEY],
  ).rows[0]?.value;
  if (raw == null) return [];
  const parsed: unknown = JSON.parse(String(raw));
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      item =>
        item &&
        ['meeting', 'document'].includes(item.kind) &&
        typeof item.value === 'string',
    )
  )
    throw new Error('Saved file cleanup could not be read.');
  return parsed;
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
  const entries = read(owner, tx);
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

/** Failed deletions remain durable and are reported even after a restart. */
export const runPersonalFileCleanup = async (
  owner: string,
  current: () => boolean,
): Promise<{pending: number | null}> => {
  try {
    for (const target of read(owner).slice(0, 50)) {
      if (!current()) break;
      try {
        if (target.kind === 'meeting') {
          if (
            !/^[A-Za-z0-9_-]+$/.test(target.value) ||
            !(await meetingRecorder.deleteMeetingAudio(target.value))
          )
            continue;
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
            [owner, GUEST_USER_ID].some(id =>
              target.value.startsWith(
                `${root}/skills_documents/${encodeURIComponent(id)}/`,
              ),
            );
          if (!valid) continue;
          if (await RNFS.exists(target.value)) {
            if (!(await RNFS.stat(target.value)).isFile()) continue;
            await RNFS.unlink(target.value);
            if (await RNFS.exists(target.value)) continue;
          }
        }
        if (!current()) break;
        db.transactionSync(tx =>
          write(
            owner,
            read(owner, tx).filter(
              item => item.kind !== target.kind || item.value !== target.value,
            ),
            tx,
          ),
        );
      } catch {
        // The obligation stays for the next attempt.
      }
    }
    return {pending: read(owner).length};
  } catch {
    return {pending: null};
  }
};
