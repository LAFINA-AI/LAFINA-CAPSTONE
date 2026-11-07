/**
 * Clear-data audit C1 (ADR-026): what Profile "Clear All Data" says about chat
 * attachment files. "Data Cleared" only once every saved cleanup obligation
 * for the owner is resolved; otherwise an exact count and an honest retry.
 *
 * Synthetic owners and documents; Alert and react-native-fs are Jest fakes.
 */
import React from 'react';
import { Alert } from 'react-native';
import type { AlertButton } from 'react-native';
import RNFS from 'react-native-fs';
import { act, fireEvent, render } from '@testing-library/react-native';
import { chatStore, db, initDatabase, userStore } from '../../src/storage';
import { pendingAttachmentCleanup } from '../../src/storage/attachmentCleanup';
import { ProfileScreen } from '../../src/ui/screens/ProfileScreen';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';

type Mock = jest.Mock;
type AlertCall = { title: string; message?: string; buttons?: AlertButton[] };

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `cdac-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  userStore.setCurrentUser(id);
  return id;
};

const attach = (userId: string, uri: string) =>
  chatStore.addMessage(userId, 'assistant', 'Synthetic document', {
    uri,
    fileName: uri.split('/').pop() ?? 'doc.pdf',
    format: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
  });

const files = new Set<string>();
const failing = new Set<string>();
const onUnlink: Array<(path: string) => void> = [];

const settle = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise(resolve => setImmediate(resolve));
};

const clearAllData = async (userId: string): Promise<AlertCall> => {
  const alerts: AlertCall[] = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    alerts.push({ title, message, buttons });
  });
  const view = render(
    <ThemeProvider userId={userId}>
      <ProfileScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} onLogout={jest.fn()} />
    </ThemeProvider>,
  );
  fireEvent.press(view.getByText('Clear All Data'));
  const button = alerts
    .find(entry => entry.title === 'Clear All Data')
    ?.buttons?.find(entry => entry.text === 'Delete Everything');
  await act(async () => {
    button!.onPress!();
    await settle();
  });
  view.unmount();
  (Alert.alert as unknown as Mock).mockRestore();
  return alerts.filter(entry => entry.title !== 'Clear All Data').pop()!;
};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  files.clear();
  failing.clear();
  onUnlink.length = 0;
  (RNFS.exists as unknown as Mock).mockImplementation(async (p: string) => files.has(p));
  (RNFS.unlink as unknown as Mock).mockImplementation(async (p: string) => {
    if (failing.has(p)) throw new Error('synthetic unlink failure');
    files.delete(p);
    onUnlink.forEach(hook => hook(p));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  (RNFS.exists as unknown as Mock).mockImplementation(() => Promise.resolve(false));
  (RNFS.unlink as unknown as Mock).mockImplementation(() => Promise.resolve());
});

describe('Clear All Data reports chat attachment cleanup truthfully (C1)', () => {
  it('a failed file stays listed, the retry removes it, and only then says Data Cleared', async () => {
    const a = owner('retry');
    const path = '/documents/chat_files/1_retry.pdf';
    files.add(path);
    failing.add(path);
    attach(a, `file://${path}`);

    const first = await clearAllData(a);
    expect(first.title).toBe('Data Partly Cleared');
    expect(first.message).toContain(
      "1 chat attachment file could not be removed from this phone's storage yet; Clear All Data keeps it listed and tries again.",
    );
    expect(first.message).toMatch(/Try Clear All Data again\./);
    expect(first.message).toMatch(/chat history.*were cleared/);
    expect(files.has(path)).toBe(true);

    failing.clear();
    const second = await clearAllData(a);
    expect(second.title).toBe('Data Cleared');
    expect(second.message).toBe('All personal scheduling data and saved event defaults have been deleted.');
    expect(files.has(path)).toBe(false);
    expect(pendingAttachmentCleanup(a)).toEqual([]);
  });

  it('counts distinct files, not references, in the plural', async () => {
    const a = owner('plural');
    const one = '/documents/chat_files/1_one.pdf';
    const two = '/documents/chat_files/2_two.pdf';
    [one, two].forEach(path => {
      files.add(path);
      failing.add(path);
    });
    attach(a, `file://${one}`);
    attach(a, one);
    attach(a, `file://${two}`);
    const result = await clearAllData(a);
    expect(result.title).toBe('Data Partly Cleared');
    expect(result.message).toContain('2 chat attachment files could not be removed');
    expect(result.message).toContain('keeps them listed and tries again');
  });

  it('a refused reference is reported, without a retry that could not help', async () => {
    const a = owner('refused');
    attach(a, 'file:///documents/models/ggml-base.en-q5_1.bin');
    const result = await clearAllData(a);
    expect(result.title).toBe('Data Partly Cleared');
    expect(result.message).toContain(
      "1 chat attachment reference did not point to this app's attachment storage, so that file was left untouched.",
    );
    expect(result.message).not.toMatch(/Try Clear All Data again/);
    expect(RNFS.unlink).not.toHaveBeenCalled();
  });

  it('an unreadable cleanup count is never full success', async () => {
    const a = owner('count');
    const path = '/documents/chat_files/count.pdf';
    files.add(path);
    attach(a, `file://${path}`);
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/SELECT COUNT\(\*\) AS n FROM attachment_cleanup/.test(sql)) throw new Error('synthetic count failure');
      return real(sql, params as never);
    });
    const result = await clearAllData(a);
    expect(result.title).toBe('Data Partly Cleared');
    expect(result.message).toContain('This phone could not confirm that every chat attachment file was removed.');
    expect(result.message).toMatch(/Try Clear All Data again\./);
  });

  it('a sign-in change during cleanup is said, and the rest stays listed for that account', async () => {
    const b = owner('switch-b');
    const a = owner('switch-a');
    const first = '/documents/chat_files/1_first.pdf';
    const second = '/documents/chat_files/2_second.pdf';
    [first, second].forEach(path => files.add(path));
    attach(a, `file://${first}`);
    attach(a, `file://${second}`);
    onUnlink.push(path => {
      if (path === first) userStore.setCurrentUser(b);
    });
    const result = await clearAllData(a);
    expect(result.title).toBe('Data Partly Cleared');
    expect(result.message).toContain('The sign-in changed before every file was removed; the rest stay listed for this account.');
    expect(result.message).toContain('1 chat attachment file could not be removed');
    expect(pendingAttachmentCleanup(a)).toEqual([second]);
    expect(pendingAttachmentCleanup(b)).toEqual([]);
    expect(files.has(second)).toBe(true);
  });
});

describe('Clear All Data reports fair cleanup progress truthfully (C2)', () => {
  it('a removable file behind 50 persistent failures is removed by the next Clear All Data, with exact counts', async () => {
    const a = owner('starve');
    const stuck = Array.from({ length: 50 }, (_, i) => `/documents/chat_files/s_${String(i).padStart(2, '0')}.pdf`);
    const free = '/documents/chat_files/z_free.pdf';
    [...stuck, free].forEach(path => {
      files.add(path);
      attach(a, `file://${path}`);
    });
    stuck.forEach(path => failing.add(path));

    const first = await clearAllData(a);
    expect(first.title).toBe('Data Partly Cleared');
    expect(first.message).toContain('51 chat attachment files could not be removed');
    expect(files.has(free)).toBe(true);

    const second = await clearAllData(a);
    expect(second.title).toBe('Data Partly Cleared');
    expect(second.message).toContain(
      "50 chat attachment files could not be removed from this phone's storage yet; Clear All Data keeps them listed and tries again.",
    );
    expect(second.message).toMatch(/Try Clear All Data again\./);
    expect(files.has(free)).toBe(false);
    expect(pendingAttachmentCleanup(a)).toHaveLength(50);
  });

  it('progress that could not be saved is said, and is never Data Cleared', async () => {
    const a = owner('unsaved');
    const one = '/documents/chat_files/1_unsaved.pdf';
    const two = '/documents/chat_files/2_unsaved.pdf';
    [one, two].forEach(path => {
      files.add(path);
      attach(a, `file://${path}`);
    });
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/^UPDATE attachment_cleanup SET attempts/.test(sql)) throw new Error('synthetic scheduling write failure');
      return real(sql, params as never);
    });
    const result = await clearAllData(a);
    expect(result.title).toBe('Data Partly Cleared');
    expect(result.message).toContain(
      'This phone could not save its cleanup progress for 2 chat attachment files; they stay listed for the next Clear All Data.',
    );
    expect(result.message).toContain('2 chat attachment files could not be removed');
    expect(result.message).toMatch(/Try Clear All Data again\./);
    expect(RNFS.unlink).not.toHaveBeenCalled();
    expect(files.has(one) && files.has(two)).toBe(true);
  });

  it('a removed file whose cleanup could not be recorded is said in the singular', async () => {
    const a = owner('retire');
    const path = '/documents/chat_files/retire_once.pdf';
    files.add(path);
    attach(a, `file://${path}`);
    const real = db.executeSync.bind(db);
    jest.spyOn(db, 'executeSync').mockImplementation((sql: string, params?: unknown[]) => {
      if (/^DELETE FROM attachment_cleanup/.test(sql)) throw new Error('synthetic retire failure');
      return real(sql, params as never);
    });
    const result = await clearAllData(a);
    expect(result.title).toBe('Data Partly Cleared');
    expect(result.message).toContain(
      'This phone could not save its cleanup progress for 1 chat attachment file; it stays listed for the next Clear All Data.',
    );
    expect(result.message).toMatch(/Try Clear All Data again\./);
    jest.restoreAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const retry = await clearAllData(a);
    expect(retry.title).toBe('Data Cleared');
  });
});
