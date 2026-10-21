import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {defaultPreferences} from '../src/core/domain/preferences';
import {createPreferencesRepository} from '../src/core/storage/preferencesRepository';
import type {LocalSqlConnection} from '../src/core/storage/preferencesRepository';

function connect(db: DatabaseSync): LocalSqlConnection {
  return {
    execute(sql, params = []) {
      const statement = db.prepare(sql);
      if (/^SELECT/i.test(sql)) {
        return statement.all(...params);
      }
      statement.run(...params);
      return [];
    },
  };
}

describe('settings SQL using real host SQLite, not Android JSI', () => {
  it('persists completion and all settings across database close/reopen', async () => {
    const tempRoot = fs.realpathSync(os.tmpdir());
    const directory = fs.mkdtempSync(path.join(tempRoot, 'lafina-prefs-'));
    const file = path.join(directory, 'settings.sqlite');
    const first = new DatabaseSync(file);
    const repository = createPreferencesRepository(connect(first));
    expect(await repository.load()).toBeNull();
    const preferences = {
      ...defaultPreferences('Asia/Manila'),
      nickname: "O'Neil",
      onboardingCompletedAt: '2026-10-21T00:00:00.000Z',
    };
    await repository.save(preferences);
    first.close();
    const second = new DatabaseSync(file);
    try {
      const reopened = createPreferencesRepository(connect(second));
      expect(await reopened.load()).toEqual(preferences);
      await reopened.save({...preferences, onboardingCompletedAt: null});
      expect(await reopened.load()).toEqual({
        ...preferences,
        onboardingCompletedAt: null,
      });
    } finally {
      second.close();
      // Delete only the dedicated directory created by this test, never an unchecked path.
      if (
        path.dirname(fs.realpathSync(directory)) !== tempRoot ||
        !path.basename(directory).startsWith('lafina-prefs-')
      ) {
        throw new Error('Unexpected test cleanup path');
      }
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
  it('preserves the previous snapshot when a write is rejected and surfaces corrupt rows', async () => {
    const db = new DatabaseSync(':memory:');
    try {
      const repository = createPreferencesRepository(connect(db));
      const initial = defaultPreferences('Asia/Manila');
      await repository.save(initial);
      db.exec(
        "CREATE TRIGGER reject_write BEFORE UPDATE ON app_settings BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END",
      );
      await expect(
        repository.save({...initial, nickname: 'Changed'}),
      ).rejects.toThrow();
      expect(await repository.load()).toEqual(initial);
      db.exec('DROP TRIGGER reject_write');
      db.prepare('UPDATE app_settings SET payload = ?').run('{corrupt');
      await expect(repository.load()).rejects.toThrow();
    } finally {
      db.close();
    }
  });
});
