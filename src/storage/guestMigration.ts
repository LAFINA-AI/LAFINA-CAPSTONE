import {db, DatabaseTransaction} from './database';
import {GUEST_USER_ID, GUEST_USERNAME} from '../constants';
import {academicProfileStore} from './academicProfileStore';
import {scheduleEntriesStore} from './scheduleEntriesStore';
import {corImportStore} from './corImportStore';
import {studentSetupStore} from './studentSetupStore';
import {avatarSeedStore} from './avatarSeedStore';
import {dashboardConfigStore} from './dashboardConfigStore';
import {syncOutboxStore} from './syncOutboxStore';
import {buildProfileSyncPayload} from './profileSyncPayload';
import {transferChatOwnership} from './chatOwnership';
import {personalMemoryStore} from './personalMemoryStore';
import {chatMemoryStore} from './chatMemoryStore';
import {speechSettingsStore} from './speechSettingsStore';
import {alertPreferencesStore} from './alertPreferencesStore';
import {noteSessionChange} from './sessionEpoch';
import {ATTACHMENT_CLEANUP_TABLE} from './attachmentCleanupSchema';
import {materialStore} from './materialStore';
import {
  refreshAcademicMemories,
  removeAcademicMemories,
} from './onboardingMemory';
import {isUstpSchoolEnabled} from './ustpEligibility';

export interface GuestDataSummary {
  taskCount: number;
  eventCount: number;
  timeBlockCount: number;
  reminderCount: number;
  noteCount: number;
  categoryCount: number;
}

/** Same cap as Quiz Maker's saved list (MAX_SAVED_QUIZZES in src/skills/quizLogic). */
const MAX_MERGED_QUIZZES = 12;

const parseSkillsList = (raw: string): Array<Record<string, unknown>> | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item as {id?: unknown}).id === 'string',
    );
  } catch {
    return null;
  }
};

/**
 * Merges a guest's Skills list setting into the account's when both exist:
 * one copy per id (the account's wins), newest first, optionally capped.
 * When only the guest has the list, the generic re-key moves it as before.
 */
function mergeSkillsList(
  tx: DatabaseTransaction,
  key: string,
  guestUserId: string,
  cloudUserId: string,
  options: {newestFirstBy: string; limit?: number; now: string},
): void {
  const read = (owner: string) =>
    tx.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ? LIMIT 1',
      [owner, key],
    ).rows?.[0] as {value?: unknown} | undefined;
  const guestRow = read(guestUserId);
  const cloudRow = read(cloudUserId);
  if (typeof guestRow?.value !== 'string' || typeof cloudRow?.value !== 'string')
    return;
  const guestItems = parseSkillsList(guestRow.value);
  if (!guestItems?.length) return;
  const cloudItems = parseSkillsList(cloudRow.value) ?? [];
  const seen = new Set(cloudItems.map(item => String(item.id)));
  const stamp = (item: Record<string, unknown>) => {
    const value = item[options.newestFirstBy];
    return typeof value === 'string' ? value : '';
  };
  let merged = [
    ...cloudItems,
    ...guestItems.filter(item => !seen.has(String(item.id))),
  ].sort((a, b) => stamp(b).localeCompare(stamp(a)));
  if (options.limit !== undefined) merged = merged.slice(0, options.limit);
  tx.executeSync(
    `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [cloudUserId, key, JSON.stringify(merged), options.now],
  );
  tx.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [
    guestUserId,
    key,
  ]);
}

export const guestMigration = {
  /**
   * Retrieves summary count of local guest records.
   */
  getGuestDataSummary: (): GuestDataSummary => {
    const taskRes = db.executeSync(
      'SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND deleted_at IS NULL',
      [GUEST_USER_ID],
    );
    const eventRes = db.executeSync(
      'SELECT COUNT(*) as count FROM events WHERE user_id = ? AND deleted_at IS NULL',
      [GUEST_USER_ID],
    );
    const timeBlockRes = db.executeSync(
      'SELECT COUNT(*) as count FROM time_blocks WHERE user_id = ? AND deleted_at IS NULL',
      [GUEST_USER_ID],
    );
    const reminderRes = db.executeSync(
      'SELECT COUNT(*) as count FROM reminders WHERE user_id = ? AND deleted_at IS NULL',
      [GUEST_USER_ID],
    );
    const noteRes = db.executeSync(
      'SELECT COUNT(*) as count FROM notes WHERE user_id = ? AND deleted_at IS NULL',
      [GUEST_USER_ID],
    );
    const catRes = db.executeSync(
      'SELECT COUNT(*) as count FROM custom_categories WHERE user_id = ? AND deleted_at IS NULL',
      [GUEST_USER_ID],
    );

    return {
      taskCount: Number(taskRes.rows?.[0]?.count ?? 0),
      eventCount: Number(eventRes.rows?.[0]?.count ?? 0),
      timeBlockCount: Number(timeBlockRes.rows?.[0]?.count ?? 0),
      reminderCount: Number(reminderRes.rows?.[0]?.count ?? 0),
      noteCount: Number(noteRes.rows?.[0]?.count ?? 0),
      categoryCount: Number(catRes.rows?.[0]?.count ?? 0),
    };
  },

  /**
   * Re-keys all guest records to cloudUserId, enqueues outbox sync entries,
   * and clears local password hash upon cloud authentication confirmation.
   */
  linkGuestToCloudAccount: async (
    cloudUserId: string,
    cloudEmail: string,
  ): Promise<void> => {
    db.transactionSync((tx: DatabaseTransaction) => {
      const now = new Date().toISOString();

      const guestRow = tx.executeSync(
        'SELECT username FROM users WHERE id = ?',
        [GUEST_USER_ID],
      ).rows?.[0];
      const guestCustomName =
        typeof guestRow?.username === 'string' &&
        guestRow.username.trim().length > 0 &&
        guestRow.username.trim() !== GUEST_USERNAME
          ? guestRow.username.trim()
          : null;

      // 1. Insert or ignore new user entry for cloudUserId
      tx.executeSync(
        `INSERT OR IGNORE INTO users (id, username, email, password_hash, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 'student', 0, 0, 0, 0, ?, ?)`,
        [
          cloudUserId,
          guestCustomName || cloudEmail.split('@')[0],
          cloudEmail,
          now,
          now,
        ],
      );
      if (guestCustomName) {
        tx.executeSync(
          `UPDATE users SET username = ?, updated_at = ? WHERE id = ? AND (username = ? OR username = '')`,
          [guestCustomName, now, cloudUserId, cloudEmail.split('@')[0]],
        );
      }

      // 2. Re-key child entity tables
      tx.executeSync(`UPDATE tasks SET user_id = ? WHERE user_id = ?`, [
        cloudUserId,
        GUEST_USER_ID,
      ]);
      tx.executeSync(`UPDATE events SET user_id = ? WHERE user_id = ?`, [
        cloudUserId,
        GUEST_USER_ID,
      ]);
      tx.executeSync(`UPDATE time_blocks SET user_id = ? WHERE user_id = ?`, [
        cloudUserId,
        GUEST_USER_ID,
      ]);
      tx.executeSync(`UPDATE reminders SET user_id = ? WHERE user_id = ?`, [
        cloudUserId,
        GUEST_USER_ID,
      ]);
      tx.executeSync(`UPDATE notes SET user_id = ? WHERE user_id = ?`, [
        cloudUserId,
        GUEST_USER_ID,
      ]);
      tx.executeSync(
        `UPDATE custom_categories SET user_id = ? WHERE user_id = ?`,
        [cloudUserId, GUEST_USER_ID],
      );
      tx.executeSync(
        `UPDATE user_preferences SET user_id = ? WHERE user_id = ?`,
        [cloudUserId, GUEST_USER_ID],
      );
      tx.executeSync(
        `UPDATE job_queue_items SET user_id = ? WHERE user_id = ?`,
        [cloudUserId, GUEST_USER_ID],
      );
      // Chat sessions are owner-derived, so the guest conversation is moved rather than relabelled.
      transferChatOwnership(tx, GUEST_USER_ID, cloudUserId, now);
      // Chat memories follow the conversations they came from.
      chatMemoryStore.transferFromGuest(tx, GUEST_USER_ID, cloudUserId);
      tx.executeSync(
        `UPDATE user_behavior_logs SET user_id = ? WHERE user_id = ?`,
        [cloudUserId, GUEST_USER_ID],
      );
      tx.executeSync(
        `UPDATE ml_feature_snapshots SET user_id = ? WHERE user_id = ?`,
        [cloudUserId, GUEST_USER_ID],
      );
      // Device-local event defaults (AGY-PORT 09): the account keeps its own choices.
      personalMemoryStore.transferFromGuest(tx, cloudUserId, now);
      // Device-local offline voice choice (AGY-PORT 10), same rule.
      speechSettingsStore.transferFromGuest(tx, cloudUserId, now);
      // Device-local alert tones, notification & call preferences, same rule.
      alertPreferencesStore.transferFromGuest(tx, cloudUserId, now);
      academicProfileStore.transferFromGuest(tx, GUEST_USER_ID, cloudUserId);
      scheduleEntriesStore.transferFromGuest(tx, GUEST_USER_ID, cloudUserId);
      // Onboarding redesign: the USTP/scheduling choice, COR draft and import
      // ledger stay with the data they describe.
      studentSetupStore.transferFromGuest(tx, GUEST_USER_ID, cloudUserId);
      corImportStore.transferFromGuest(tx, GUEST_USER_ID, cloudUserId);
      if (isUstpSchoolEnabled(cloudUserId)) {
        refreshAcademicMemories(cloudUserId, tx);
      } else {
        removeAcademicMemories(cloudUserId, tx);
      }
      dashboardConfigStore.transferFromGuest(tx, GUEST_USER_ID, cloudUserId);
      avatarSeedStore.transferFromGuest(tx, GUEST_USER_ID, cloudUserId);
      // Merge guest flashcard decks with any existing cloud decks before generic skills.* re-key.
      if (cloudUserId !== GUEST_USER_ID) {
        const guestDecksRow = tx.executeSync(
          `SELECT value FROM local_settings WHERE user_id = ? AND key = 'skills.decks.v1' LIMIT 1`,
          [GUEST_USER_ID],
        ).rows?.[0];
        const cloudDecksRow = tx.executeSync(
          `SELECT value FROM local_settings WHERE user_id = ? AND key = 'skills.decks.v1' LIMIT 1`,
          [cloudUserId],
        ).rows?.[0];
        if (
          typeof guestDecksRow?.value === 'string' &&
          typeof cloudDecksRow?.value === 'string'
        ) {
          const parseDecksArray = (
            raw: string,
          ): Array<Record<string, unknown>> | null => {
            try {
              const parsed = JSON.parse(raw);
              if (!Array.isArray(parsed)) return null;
              return parsed.filter(
                (item): item is Record<string, unknown> =>
                  Boolean(item) &&
                  typeof item === 'object' &&
                  !Array.isArray(item) &&
                  typeof (item as {id?: unknown}).id === 'string',
              );
            } catch {
              return null;
            }
          };
          const guestDecks = parseDecksArray(guestDecksRow.value);
          const cloudDecks = parseDecksArray(cloudDecksRow.value);
          let mergedDecks: Array<Record<string, unknown>> | null = null;
          if (cloudDecks && guestDecks) {
            const seenIds = new Set(cloudDecks.map(d => String(d.id)));
            mergedDecks = [
              ...cloudDecks,
              ...guestDecks.filter(d => !seenIds.has(String(d.id))),
            ];
          } else if (guestDecks) {
            mergedDecks = guestDecks;
          } else if (cloudDecks) {
            mergedDecks = cloudDecks;
          }
          if (mergedDecks !== null) {
            tx.executeSync(
              `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, 'skills.decks.v1', ?, ?)
               ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
              [cloudUserId, JSON.stringify(mergedDecks), now],
            );
          }
          tx.executeSync(
            `DELETE FROM local_settings WHERE user_id = ? AND key = 'skills.decks.v1'`,
            [GUEST_USER_ID],
          );
        }
      }
      // Saved quizzes and Create with LAFINA files are lists, like decks: when
      // the account already has its own on this phone, merge rather than let
      // the generic re-key below drop the guest's copy.
      if (cloudUserId !== GUEST_USER_ID) {
        mergeSkillsList(tx, 'skills.quizzes.v1', GUEST_USER_ID, cloudUserId, {
          newestFirstBy: 'updatedAt',
          limit: MAX_MERGED_QUIZZES,
          now,
        });
        mergeSkillsList(tx, 'skills.files.v1', GUEST_USER_ID, cloudUserId, {
          newestFirstBy: 'createdAt',
          now,
        });
      }
      // Transfer local Skills preferences/timers/GWA/study state and recorded meetings from guest.
      tx.executeSync(
        `UPDATE OR IGNORE local_settings SET user_id = ? WHERE user_id = ? AND key LIKE 'skills.%'`,
        [cloudUserId, GUEST_USER_ID],
      );
      tx.executeSync(
        `DELETE FROM local_settings WHERE user_id = ? AND key LIKE 'skills.%'`,
        [GUEST_USER_ID],
      );
      tx.executeSync(
        `UPDATE recorded_meetings SET user_id = ? WHERE user_id = ?`,
        [cloudUserId, GUEST_USER_ID],
      );
      materialStore.transferFromGuest(tx, GUEST_USER_ID, cloudUserId);
      // Pending attachment cleanup (ADR-026) follows the conversation that owned
      // the files; an obligation the account already holds is kept once.
      tx.executeSync(
        `UPDATE OR IGNORE ${ATTACHMENT_CLEANUP_TABLE} SET user_id = ? WHERE user_id = ?`,
        [cloudUserId, GUEST_USER_ID],
      );
      tx.executeSync(
        `DELETE FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ?`,
        [GUEST_USER_ID],
      );

      // 3. Remove old guest record if different
      if (cloudUserId !== GUEST_USER_ID) {
        tx.executeSync(`DELETE FROM users WHERE id = ?`, [GUEST_USER_ID]);
      }

      // The guest's session is replaced: its open confirmations are retired.
      noteSessionChange();
      tx.executeSync('DELETE FROM active_session');
      tx.executeSync(
        `INSERT INTO active_session (user_id, created_at, updated_at) VALUES (?, ?, ?)`,
        [cloudUserId, now, now],
      );

      // Guest-scoped mutations cannot be sent under the new account token. Rebuild them below.
      tx.executeSync(`DELETE FROM sync_outbox WHERE user_id = ?`, [
        GUEST_USER_ID,
      ]);
      tx.executeSync(`DELETE FROM sync_metadata WHERE user_id = ?`, [
        GUEST_USER_ID,
      ]);
      tx.executeSync(`DELETE FROM sync_state WHERE user_id = ?`, [
        GUEST_USER_ID,
      ]);
      tx.executeSync(`DELETE FROM sync_control WHERE user_id = ?`, [
        GUEST_USER_ID,
      ]);

      // 4. Enqueue a complete snapshot atomically with the ownership migration.
      const tasks = tx.executeSync(
        'SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL',
        [cloudUserId],
      );
      tasks.rows?.forEach(row =>
        syncOutboxStore.enqueueMutation(
          cloudUserId,
          'task',
          String(row.id),
          'create',
          {
            title: row.title,
            due_date: row.due_date,
            due_time: row.due_time,
            is_completed: row.is_completed === 1,
            priority: row.priority,
            category: row.category,
            notes: row.notes,
            recurrence_rule: row.recurrence_rule,
          },
          'account',
          cloudUserId,
          tx,
        ),
      );

      const events = tx.executeSync(
        'SELECT * FROM events WHERE user_id = ? AND deleted_at IS NULL',
        [cloudUserId],
      );
      events.rows?.forEach(row =>
        syncOutboxStore.enqueueMutation(
          cloudUserId,
          'event',
          String(row.id),
          'create',
          {
            title: row.title,
            date: row.date,
            start_time: row.start_time,
            end_time: row.end_time,
            location: row.location,
            linked_calendar_block: row.linked_calendar_block,
            recurrence_rule: row.recurrence_rule,
          },
          'account',
          cloudUserId,
          tx,
        ),
      );

      const timeBlocks = tx.executeSync(
        'SELECT * FROM time_blocks WHERE user_id = ? AND deleted_at IS NULL',
        [cloudUserId],
      );
      timeBlocks.rows?.forEach(row =>
        syncOutboxStore.enqueueMutation(
          cloudUserId,
          'time_block',
          String(row.id),
          'create',
          {
            title: row.title,
            date: row.date,
            start_time: row.start_time,
            end_time: row.end_time,
            color: row.color,
            category: row.category,
            notes: row.notes,
            recurrence_rule: row.recurrence_rule,
          },
          'account',
          cloudUserId,
          tx,
        ),
      );

      const reminders = tx.executeSync(
        'SELECT * FROM reminders WHERE user_id = ? AND deleted_at IS NULL',
        [cloudUserId],
      );
      reminders.rows?.forEach(row =>
        syncOutboxStore.enqueueMutation(
          cloudUserId,
          'reminder',
          String(row.id),
          'create',
          {
            task: row.task,
            description: row.description,
            scheduled_at: row.scheduled_at,
            trigger_at: row.trigger_at,
            status: row.status,
            snooze_count: row.snooze_count,
          },
          'account',
          cloudUserId,
          tx,
        ),
      );

      const notes = tx.executeSync(
        'SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NULL',
        [cloudUserId],
      );
      notes.rows?.forEach(row =>
        syncOutboxStore.enqueueMutation(
          cloudUserId,
          'note',
          String(row.id),
          'create',
          {
            title: row.title,
            body: row.body,
            is_pinned: row.is_pinned === 1,
            tags: row.tags,
            category: row.category,
            is_voice_transcribed: row.is_voice_transcribed === 1,
            sort_order: row.sort_order,
          },
          'account',
          cloudUserId,
          tx,
        ),
      );

      const categories = tx.executeSync(
        'SELECT * FROM custom_categories WHERE user_id = ? AND deleted_at IS NULL',
        [cloudUserId],
      );
      categories.rows?.forEach(row =>
        syncOutboxStore.enqueueMutation(
          cloudUserId,
          'custom_category',
          String(row.id),
          'create',
          {
            name: row.name,
            color: row.color,
          },
          'account',
          cloudUserId,
          tx,
        ),
      );

      syncOutboxStore.enqueueMutation(
        cloudUserId,
        'profile',
        'profile',
        'create',
        buildProfileSyncPayload(cloudUserId, tx),
        'account',
        cloudUserId,
        tx,
      );
    });
  },
};
