import { db } from './database';

export const localSettingsStore = {
  get: (
    userId: string,
    key: string,
    fallback: string | null = null,
  ): string | null => {
    try {
      const row = db.executeSync(
        'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, key],
      ).rows?.[0];
      return typeof row?.value === 'string' ? row.value : fallback;
    } catch (error) {
      console.error('Error reading local setting:', error);
      return fallback;
    }
  },

  set: (userId: string, key: string, value: string): void => {
    try {
      db.executeSync(
        `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [userId, key, value, new Date().toISOString()],
      );
    } catch (error) {
      console.error('Error saving local setting:', error);
    }
  },
};
