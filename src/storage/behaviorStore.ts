import { generateId } from '../utils';
import { db } from './database';

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
        [id, userId, eventType, eventKey, eventValue, now, now]
      );
    } catch (error) {
      console.error('Error inserting user behavior log:', error);
      throw error;
    }
  },

  getBehaviorLogs: (userId: string, eventType?: string): BehaviorLog[] => {
    try {
      const result = db.executeSync('SELECT * FROM user_behavior_logs');
      let rows = result.rows.filter((row: Record<string, unknown>) => row.user_id === userId);
      if (eventType) {
        rows = rows.filter((row: Record<string, unknown>) => row.event_type === eventType);
      }

      return rows.map((row: Record<string, unknown>) => ({
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
        [id, userId, featureType, featureVector, now, now, now]
      );
    } catch (error) {
      console.error('Error inserting ML feature snapshot:', error);
      throw error;
    }
  },

  getLatestFeatureSnapshot: (userId: string, featureType: string): FeatureSnapshot | null => {
    try {
      const result = db.executeSync('SELECT * FROM ml_feature_snapshots');
      const filtered = result.rows
        .filter(
          (row: Record<string, unknown>) =>
            row.user_id === userId && row.feature_type === featureType,
        )
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          String(b.computed_at).localeCompare(String(a.computed_at)),
        );

      if (filtered.length > 0) {
        const row = filtered[0];
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
