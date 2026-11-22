import {generateId} from '../utils';
import {db} from './database';

export interface BehaviorLog {
  id: string;
  userId: string;
  eventType: string;
  eventKey: string;
  eventValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureSnapshot {
  id: string;
  userId: string;
  featureType: string;
  featureVector: string;
  computedAt: string;
  createdAt: string;
  updatedAt: string;
}

export const MAX_BEHAVIOR_LOGS_PER_TYPE = 500;
export const MAX_FEATURE_SNAPSHOTS_PER_TYPE = 20;

export const behaviorStore = {
  logBehaviorEvent: (
    userId: string,
    eventType: string,
    eventKey: string,
    eventValue: string,
  ): void => {
    const id = generateId('beh');
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO user_behavior_logs (id, user_id, event_type, event_key, event_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, eventType, eventKey, eventValue, now, now],
      );
      db.executeSync(
        `DELETE FROM user_behavior_logs
         WHERE user_id = ? AND event_type = ?
           AND id NOT IN (
             SELECT id FROM user_behavior_logs
             WHERE user_id = ? AND event_type = ?
             ORDER BY created_at DESC, rowid DESC
             LIMIT ?
           )`,
        [userId, eventType, userId, eventType, MAX_BEHAVIOR_LOGS_PER_TYPE],
      );
    } catch (error) {
      console.error('Error inserting user behavior log:', error);
      throw error;
    }
  },

  getBehaviorLogs: (
    userId: string,
    eventType?: string,
    limit: number = 250,
  ): BehaviorLog[] => {
    try {
      const safeLimit = Math.max(
        1,
        Math.min(MAX_BEHAVIOR_LOGS_PER_TYPE, limit),
      );
      const result = eventType
        ? db.executeSync(
            `SELECT * FROM (
               SELECT *, rowid AS beh_rowid FROM user_behavior_logs
               WHERE user_id = ? AND event_type = ?
               ORDER BY created_at DESC, rowid DESC
               LIMIT ?
             ) ORDER BY created_at ASC, beh_rowid ASC`,
            [userId, eventType, safeLimit],
          )
        : db.executeSync(
            `SELECT * FROM (
               SELECT *, rowid AS beh_rowid FROM user_behavior_logs
               WHERE user_id = ?
               ORDER BY created_at DESC, rowid DESC
               LIMIT ?
             ) ORDER BY created_at ASC, beh_rowid ASC`,
            [userId, safeLimit],
          );

      return result.rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        userId: String(row.user_id),
        eventType: String(row.event_type),
        eventKey: String(row.event_key),
        eventValue: String(row.event_value),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    } catch (error) {
      console.error('Error fetching behavior logs:', error);
      return [];
    }
  },

  saveFeatureSnapshot: (
    userId: string,
    featureType: string,
    featureVector: string,
  ): void => {
    const id = generateId('fs');
    const now = new Date().toISOString();
    try {
      db.executeSync(
        `INSERT INTO ml_feature_snapshots (id, user_id, feature_type, feature_vector, computed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, featureType, featureVector, now, now, now],
      );
      db.executeSync(
        `DELETE FROM ml_feature_snapshots
         WHERE user_id = ? AND feature_type = ?
           AND id NOT IN (
             SELECT id FROM ml_feature_snapshots
             WHERE user_id = ? AND feature_type = ?
             ORDER BY computed_at DESC, created_at DESC, rowid DESC
             LIMIT ?
           )`,
        [
          userId,
          featureType,
          userId,
          featureType,
          MAX_FEATURE_SNAPSHOTS_PER_TYPE,
        ],
      );
    } catch (error) {
      console.error('Error inserting ML feature snapshot:', error);
      throw error;
    }
  },

  getLatestFeatureSnapshot: (
    userId: string,
    featureType: string,
  ): FeatureSnapshot | null => {
    try {
      // Append order, rather than a random ID, breaks same-millisecond ties.
      const result = db.executeSync(
        `SELECT * FROM ml_feature_snapshots
         WHERE user_id = ? AND feature_type = ?
         ORDER BY computed_at DESC, created_at DESC, rowid DESC
         LIMIT 1`,
        [userId, featureType],
      );

      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return {
          id: String(row.id),
          userId: String(row.user_id),
          featureType: String(row.feature_type),
          featureVector: String(row.feature_vector),
          computedAt: String(row.computed_at),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching latest feature snapshot:', error);
      return null;
    }
  },
};
