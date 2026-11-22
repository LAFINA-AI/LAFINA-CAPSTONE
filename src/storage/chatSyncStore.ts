import {GUEST_USER_ID} from '../constants';
import {
  attachmentCleanupTarget,
  recordAttachmentCleanup,
} from './attachmentCleanup';
import {
  NEW_CHAT_PREFIX,
  NEW_SESSION_GENERATION_SQL,
  PLACEHOLDER_CHAT_TITLES,
  isUstpSessionId,
  isValidChatOwner,
  ownedChatSessionId,
} from './chatOwnership';
import {db} from './database';
import type {DatabaseTransaction} from './database';
import {syncMetadataStore} from './syncMetadataStore';
import {syncOutboxStore} from './syncOutboxStore';
import {syncStateStore} from './syncStateStore';
import type {SyncEntityType, SyncOperation, SyncPayload} from './syncTypes';

/**
 * Chat history sync (ADR-040). Conversations follow a signed-in account to
 * its other phones and to a reinstall through the ordinary sync outbox, as two
 * entity types: `chat_session` and `chat_message`.
 *
 * - Every chat write in `chatStore` queues its mutation in the same
 *   transaction, so a chat written offline goes up when the phone reconnects.
 * - The first chat's id is built from this phone's local user id, which differs
 *   on every phone. It travels as `chat_default` and maps back to each phone's
 *   own first chat, so the first chats of all phones become one.
 * - Only what another phone can use is sent: a file's description, never its
 *   path, and never the device-only memory notice (its Undo acts on memories
 *   that stay on this phone).
 * - Guests never sync. Signed-in accounts sync by default; `chat.cloudSync`
 *   = 'false' keeps new chat writes on this phone only.
 */

type Executor = Pick<DatabaseTransaction, 'executeSync'>;
type ChatEntityType = Extract<SyncEntityType, 'chat_session' | 'chat_message'>;

export const CHAT_SYNC_SETTING_KEY = 'chat.cloudSync';
/** Set once the student has seen the "chats sync to your account" notice. */
export const CHAT_SYNC_NOTICE_KEY = 'chat.cloudSyncNoticeSeen';
/** The cloud id of every phone's first chat. */
export const CLOUD_DEFAULT_CHAT_ID = 'chat_default';
/** Matches the server's limit; longer text is cut for the cloud copy only. */
export const MAX_SYNCED_MESSAGE_CHARS = 100_000;
/** At most this many unsynced messages are queued per sync pass. */
export const CHAT_BACKFILL_BATCH = 500;
const MAX_CLOUD_TITLE = 128;
const MAX_CLOUD_ID = 128;
const ACCOUNT = 'account';
/** The server's rejection when an account already has its most chats. */
export const CHAT_LIMIT_REASON = 'chat_limit_reached';
/**
 * Chats the server refused because the account had its most chats: kept on
 * this phone, not queued again until the cloud may have room (a chat was
 * deleted, sync was turned back on, or the cloud copy was deleted).
 */
export const CHAT_LIMIT_HELD_KEY = 'chat.cloudLimitHeld';

const SYNCABLE_SESSION = `(s.id = ? OR substr(s.id, 1, ${NEW_CHAT_PREFIX.length}) = '${NEW_CHAT_PREFIX}')
  AND s.id NOT IN (SELECT session_id FROM chat_legacy_quarantine)`;

const asTransaction = (tx: Executor): DatabaseTransaction =>
  tx as DatabaseTransaction;

const readSetting = (
  tx: Executor,
  userId: string,
  key: string,
): string | null => {
  const value = tx.executeSync(
    'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
    [userId, key],
  ).rows?.[0]?.value;
  return typeof value === 'string' ? value : null;
};

const writeSetting = (
  tx: Executor,
  userId: string,
  key: string,
  value: string,
): void => {
  tx.executeSync(
    `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [userId, key, value, new Date().toISOString()],
  );
};

const readHeld = (tx: Executor, userId: string): string[] => {
  const raw = readSetting(tx, userId, CHAT_LIMIT_HELD_KEY);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
};

const writeHeld = (tx: Executor, userId: string, ids: string[]): void => {
  if (ids.length === 0) {
    tx.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [
      userId,
      CHAT_LIMIT_HELD_KEY,
    ]);
    return;
  }
  writeSetting(tx, userId, CHAT_LIMIT_HELD_KEY, JSON.stringify(ids));
};

const isHeld = (
  tx: Executor,
  userId: string,
  localSessionId: string,
): boolean => readHeld(tx, userId).includes(localSessionId);

const parseObject = (raw: unknown): Record<string, unknown> | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

const hasMetadata = (
  tx: Executor,
  userId: string,
  entityType: ChatEntityType,
  entityId: string,
): boolean =>
  syncMetadataStore.getVersion(
    userId,
    entityType,
    entityId,
    ACCOUNT,
    userId,
    asTransaction(tx),
  ) !== null;

const hasOutbox = (
  tx: Executor,
  userId: string,
  entityType: ChatEntityType,
  entityId: string,
  statuses: readonly string[] = ['pending', 'in_progress', 'failed'],
): boolean =>
  (tx.executeSync(
    `SELECT 1 FROM sync_outbox
     WHERE user_id = ? AND scope_type = ? AND scope_id = ?
       AND entity_type = ? AND entity_id = ?
       AND status IN (${statuses.map(() => '?').join(',')})
     LIMIT 1`,
    [userId, ACCOUNT, userId, entityType, entityId, ...statuses],
  ).rows?.length ?? 0) > 0;

const enqueue = (
  tx: Executor,
  userId: string,
  entityType: ChatEntityType,
  entityId: string,
  operation: SyncOperation,
  payload: SyncPayload,
): void => {
  syncOutboxStore.enqueueMutation(
    userId,
    entityType,
    entityId,
    operation,
    payload,
    ACCOUNT,
    userId,
    asTransaction(tx),
  );
};

/** A create restores a row deleted on the server; an update to one is ignored. */
const upsertOperation = (
  tx: Executor,
  userId: string,
  entityType: ChatEntityType,
  entityId: string,
): SyncOperation =>
  hasMetadata(tx, userId, entityType, entityId) ? 'update' : 'create';

const isQuarantined = (tx: Executor, sessionId: string): boolean =>
  (tx.executeSync(
    'SELECT 1 FROM chat_legacy_quarantine WHERE session_id = ? LIMIT 1',
    [sessionId],
  ).rows?.length ?? 0) > 0;

const placeholderTitle = (userId: string, localSessionId: string): string =>
  localSessionId === ownedChatSessionId(userId)
    ? 'Default Chat'
    : isUstpSessionId(localSessionId)
    ? 'Ask about USTP'
    : 'New chat';

/** This phone's session id as the cloud knows it. */
export const toCloudSessionId = (
  userId: string,
  localSessionId: string,
): string =>
  localSessionId === ownedChatSessionId(userId)
    ? CLOUD_DEFAULT_CHAT_ID
    : localSessionId;

/** The local session for a cloud id, or null for an id this app never makes. */
export const toLocalSessionId = (
  userId: string,
  cloudSessionId: unknown,
): string | null => {
  if (cloudSessionId === CLOUD_DEFAULT_CHAT_ID)
    return ownedChatSessionId(userId);
  return typeof cloudSessionId === 'string' &&
    cloudSessionId.startsWith(NEW_CHAT_PREFIX) &&
    cloudSessionId.length > NEW_CHAT_PREFIX.length &&
    cloudSessionId.length <= MAX_CLOUD_ID
    ? cloudSessionId
    : null;
};

const sessionPayload = (row: Record<string, unknown>): SyncPayload => {
  const id = String(row.id);
  const stored = typeof row.title === 'string' ? row.title.trim() : '';
  return {
    title: PLACEHOLDER_CHAT_TITLES.includes(stored)
      ? ''
      : stored.slice(0, MAX_CLOUD_TITLE),
    kind: isUstpSessionId(id) ? 'ustp' : 'general',
    created_at: String(row.created_at),
  };
};

const messagePayload = (
  userId: string,
  row: Record<string, unknown>,
): SyncPayload => {
  const metadata = parseObject(row.metadata_json) ?? {};
  const review = metadata.reviewResolution as
    | Record<string, unknown>
    | undefined;
  const attachment = parseObject(row.attachment_json);
  const size = attachment?.sizeBytes;
  return {
    session_id: toCloudSessionId(userId, String(row.session_id)),
    sender: row.sender === 'assistant' ? 'assistant' : 'user',
    content: text(row.content, MAX_SYNCED_MESSAGE_CHARS),
    created_at: String(row.created_at),
    handbook_note:
      typeof metadata.handbookNote === 'string' && metadata.handbookNote
        ? metadata.handbookNote.slice(0, 2000)
        : null,
    local_reply: metadata.localReply === true,
    voice_interrupted: metadata.voiceInterrupted === true,
    review_resolution:
      review && (review.status === 'confirmed' || review.status === 'cancelled')
        ? {
            status: review.status,
            summary:
              typeof review.summary === 'string'
                ? review.summary.slice(0, 2000)
                : null,
            resolved_at:
              typeof review.resolvedAt === 'string'
                ? review.resolvedAt.slice(0, 64)
                : null,
          }
        : null,
    attachment:
      attachment && typeof attachment.fileName === 'string'
        ? {
            file_name: attachment.fileName.slice(0, 255),
            format: text(attachment.format, 32),
            mime_type: text(attachment.mimeType, 128),
            size_bytes:
              typeof size === 'number' && Number.isSafeInteger(size) && size > 0
                ? size
                : 0,
          }
        : null,
  };
};

/** Queues the session's create once, before the first message that needs it. */
const ensureSessionQueued = (
  tx: Executor,
  userId: string,
  localSessionId: string,
): void => {
  const cloudId = toCloudSessionId(userId, localSessionId);
  if (
    hasMetadata(tx, userId, 'chat_session', cloudId) ||
    hasOutbox(tx, userId, 'chat_session', cloudId)
  )
    return;
  const row = tx.executeSync(
    'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
    [localSessionId, userId],
  ).rows?.[0];
  if (row)
    enqueue(tx, userId, 'chat_session', cloudId, 'create', sessionPayload(row));
};

/** The message row with its session owner, if `userId` owns a syncable one. */
const ownedMessage = (
  tx: Executor,
  userId: string,
  messageId: string,
): Record<string, unknown> | null => {
  const row = tx.executeSync(
    `SELECT m.* FROM messages m JOIN chat_sessions s ON s.id = m.session_id
     WHERE m.id = ? AND s.user_id = ? AND ${SYNCABLE_SESSION}`,
    [messageId, userId, ownedChatSessionId(userId)],
  ).rows?.[0];
  return row ?? null;
};

const removeLocalMessages = (
  tx: Executor,
  userId: string,
  where: string,
  params: unknown[],
): void => {
  const rows =
    tx.executeSync(
      `SELECT attachment_json FROM messages WHERE ${where} AND attachment_json IS NOT NULL`,
      params,
    ).rows ?? [];
  const targets = new Set<string>();
  for (const row of rows) {
    const target = attachmentCleanupTarget(
      parseObject(row.attachment_json)?.uri,
    );
    if (target) targets.add(target);
  }
  // The file goes with the message (ADR-026): saved now, removed after sync.
  if (targets.size) recordAttachmentCleanup(tx, userId, targets);
  tx.executeSync(`DELETE FROM messages WHERE ${where}`, params);
};

export interface ChatRemoteDeleteResult {
  /** False when this phone kept a row the server never heard of from it. */
  recordMetadata: boolean;
  /** True when a local row was removed. */
  removed: boolean;
}

export const chatSyncStore = {
  /** Whether new chat writes of `userId` go to the cloud. Guests never. */
  isEnabled: (userId: string, executor: Executor = db): boolean => {
    if (userId === GUEST_USER_ID || !isValidChatOwner(userId)) return false;
    try {
      return readSetting(executor, userId, CHAT_SYNC_SETTING_KEY) !== 'false';
    } catch {
      return false;
    }
  },

  setEnabled: (userId: string, enabled: boolean): void => {
    db.transactionSync(tx => {
      writeSetting(
        tx,
        userId,
        CHAT_SYNC_SETTING_KEY,
        enabled ? 'true' : 'false',
      );
      writeSetting(tx, userId, CHAT_SYNC_NOTICE_KEY, 'true');
      // Turning sync on tries held chats again.
      if (enabled) writeHeld(tx, userId, []);
    });
  },

  /** Chats on this phone the cloud refused because the account was full. */
  heldChatCount: (userId: string): number => {
    try {
      return readHeld(db, userId).length;
    } catch {
      return 0;
    }
  },

  /**
   * The server refused a chat write with CHAT_LIMIT_REASON. Its chat stays on
   * this phone and its queued writes are dropped, so the next pass does not
   * send them again.
   */
  holdForLimit: (
    tx: Executor,
    userId: string,
    entityType: ChatEntityType,
    entityId: string,
    payload: Record<string, unknown>,
  ): void => {
    const localId =
      entityType === 'chat_session'
        ? toLocalSessionId(userId, entityId)
        : toLocalSessionId(userId, payload.session_id) ??
          ((tx.executeSync('SELECT session_id FROM messages WHERE id = ?', [
            entityId,
          ]).rows?.[0]?.session_id as string | undefined) ||
            null);
    const scope = [userId, ACCOUNT, userId];
    if (!localId) {
      tx.executeSync(
        `DELETE FROM sync_outbox WHERE user_id = ? AND scope_type = ? AND scope_id = ?
           AND entity_type = ? AND entity_id = ?`,
        [...scope, entityType, entityId],
      );
      return;
    }
    const held = readHeld(tx, userId);
    if (!held.includes(localId)) writeHeld(tx, userId, [...held, localId]);
    tx.executeSync(
      `DELETE FROM sync_outbox WHERE user_id = ? AND scope_type = ? AND scope_id = ?
         AND ((entity_type = 'chat_session' AND entity_id = ?)
           OR (entity_type = 'chat_message'
               AND entity_id IN (SELECT id FROM messages WHERE session_id = ?)))`,
      [...scope, toCloudSessionId(userId, localId), localId],
    );
  },

  /** Whether this account's server has listed both chat types. */
  serverSupportsChat: (userId: string): boolean => {
    if (userId === GUEST_USER_ID || !isValidChatOwner(userId)) return false;
    try {
      const types = syncStateStore.loadEntityTypes(userId).serverEntityTypes;
      return (
        !!types &&
        types.includes('chat_session') &&
        types.includes('chat_message')
      );
    } catch {
      return false;
    }
  },

  /**
   * True until the student has seen (or answered) the sync notice. Shown
   * only while chats really go to the account: sync on, server supports it.
   */
  needsNotice: (userId: string): boolean => {
    if (userId === GUEST_USER_ID || !isValidChatOwner(userId)) return false;
    try {
      return (
        readSetting(db, userId, CHAT_SYNC_NOTICE_KEY) !== 'true' &&
        chatSyncStore.isEnabled(userId) &&
        chatSyncStore.serverSupportsChat(userId)
      );
    } catch {
      return false;
    }
  },

  markNoticeSeen: (userId: string): void => {
    writeSetting(db, userId, CHAT_SYNC_NOTICE_KEY, 'true');
  },

  /** After a message is written or edited: queue it (and its chat, first). */
  afterMessageWrite: (
    tx: Executor,
    userId: string,
    messageId: string,
  ): void => {
    if (!chatSyncStore.isEnabled(userId, tx)) return;
    const row = ownedMessage(tx, userId, messageId);
    if (!row) return;
    if (isHeld(tx, userId, String(row.session_id))) return;
    ensureSessionQueued(tx, userId, String(row.session_id));
    enqueue(
      tx,
      userId,
      'chat_message',
      messageId,
      upsertOperation(tx, userId, 'chat_message', messageId),
      messagePayload(userId, row),
    );
  },

  /** After a rename: queue the chat, unless it is an empty chat never sent. */
  afterSessionWrite: (
    tx: Executor,
    userId: string,
    localSessionId: string,
  ): void => {
    if (!chatSyncStore.isEnabled(userId, tx)) return;
    if (!toLocalSessionId(userId, toCloudSessionId(userId, localSessionId)))
      return;
    if (isQuarantined(tx, localSessionId)) return;
    if (isHeld(tx, userId, localSessionId)) return;
    const cloudId = toCloudSessionId(userId, localSessionId);
    const row = tx.executeSync(
      `SELECT s.*, EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id) AS has_messages
       FROM chat_sessions s WHERE s.id = ? AND s.user_id = ?`,
      [localSessionId, userId],
    ).rows?.[0];
    if (!row) return;
    const known = hasMetadata(tx, userId, 'chat_session', cloudId);
    if (!known && !Number(row.has_messages)) return;
    enqueue(
      tx,
      userId,
      'chat_session',
      cloudId,
      known ? 'update' : 'create',
      sessionPayload(row),
    );
  },

  /**
   * Before a chat's messages are deleted on this phone. Never-sent writes are
   * dropped from the outbox; a chat the server knows gets one delete, and the
   * server deletes its messages. Queued even with sync off, so turning it back
   * on cannot restore what was deleted here.
   */
  beforeSessionDelete: (
    tx: Executor,
    userId: string,
    localSessionId: string,
  ): void => {
    if (userId === GUEST_USER_ID || !isValidChatOwner(userId)) return;
    const cloudId = toCloudSessionId(userId, localSessionId);
    if (!toLocalSessionId(userId, cloudId) || isQuarantined(tx, localSessionId))
      return;
    const scope = [userId, ACCOUNT, userId];
    const messagesKnown =
      (tx.executeSync(
        `SELECT 1 FROM messages m WHERE m.session_id = ? AND (
           EXISTS (SELECT 1 FROM sync_metadata md
                   WHERE md.user_id = ? AND md.scope_type = ? AND md.scope_id = ?
                     AND md.entity_type = 'chat_message' AND md.entity_id = m.id)
           OR EXISTS (SELECT 1 FROM sync_outbox o
                   WHERE o.user_id = ? AND o.scope_type = ? AND o.scope_id = ?
                     AND o.entity_type = 'chat_message' AND o.entity_id = m.id
                     AND o.status IN ('in_progress', 'failed')))
         LIMIT 1`,
        [localSessionId, ...scope, ...scope],
      ).rows?.length ?? 0) > 0;
    const sessionKnown =
      hasMetadata(tx, userId, 'chat_session', cloudId) ||
      hasOutbox(tx, userId, 'chat_session', cloudId, ['in_progress', 'failed']);
    tx.executeSync(
      `DELETE FROM sync_outbox
       WHERE user_id = ? AND scope_type = ? AND scope_id = ? AND status = 'pending'
         AND entity_type = 'chat_message'
         AND entity_id IN (SELECT id FROM messages WHERE session_id = ?)`,
      [...scope, localSessionId],
    );
    tx.executeSync(
      `DELETE FROM sync_outbox
       WHERE user_id = ? AND scope_type = ? AND scope_id = ? AND status = 'pending'
         AND entity_type = 'chat_session' AND entity_id = ?`,
      [...scope, cloudId],
    );
    const held = readHeld(tx, userId);
    if (sessionKnown || messagesKnown) {
      enqueue(tx, userId, 'chat_session', cloudId, 'delete', {});
      // A cloud chat is going away: held chats may now fit.
      if (held.length) writeHeld(tx, userId, []);
    } else if (held.includes(localSessionId)) {
      writeHeld(
        tx,
        userId,
        held.filter(id => id !== localSessionId),
      );
    }
  },

  /** A chat from the cloud: created or retitled on this phone. */
  applyRemoteSession: (
    tx: Executor,
    userId: string,
    cloudSessionId: string,
    payload: Record<string, unknown>,
    updatedAt: string,
  ): boolean => {
    const localId = toLocalSessionId(userId, cloudSessionId);
    if (!localId || isQuarantined(tx, localId)) return false;
    const title =
      text(payload.title, MAX_CLOUD_TITLE).trim() ||
      placeholderTitle(userId, localId);
    const createdAt =
      typeof payload.created_at === 'string' && payload.created_at
        ? payload.created_at
        : updatedAt;
    const owner = tx.executeSync(
      'SELECT user_id FROM chat_sessions WHERE id = ?',
      [localId],
    ).rows?.[0]?.user_id;
    if (owner !== undefined && owner !== userId) {
      throw new Error(
        'A synced chat belongs to another account on this phone.',
      );
    }
    if (owner === undefined) {
      tx.executeSync(
        `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
         VALUES (?, ?, ?, ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
        [localId, userId, title, createdAt, updatedAt],
      );
    } else {
      tx.executeSync(
        'UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        [title, updatedAt, localId, userId],
      );
    }
    return true;
  },

  /** A message from the cloud. Its device-only memory notice is kept. */
  applyRemoteMessage: (
    tx: Executor,
    userId: string,
    messageId: string,
    payload: Record<string, unknown>,
    updatedAt: string,
  ): boolean => {
    const localSession = toLocalSessionId(userId, payload.session_id);
    if (!localSession || isQuarantined(tx, localSession)) return false;
    if (typeof payload.content !== 'string') {
      throw new Error('Synced chat message is missing its text.');
    }
    const sender = payload.sender === 'assistant' ? 'assistant' : 'user';
    const createdAt =
      typeof payload.created_at === 'string' && payload.created_at
        ? payload.created_at
        : updatedAt;

    const sessionOwner = tx.executeSync(
      'SELECT user_id FROM chat_sessions WHERE id = ?',
      [localSession],
    ).rows?.[0]?.user_id;
    if (sessionOwner !== undefined && sessionOwner !== userId) {
      throw new Error(
        'A synced chat belongs to another account on this phone.',
      );
    }
    if (sessionOwner === undefined) {
      // The chat's own change may come later (or was deleted): hold a place.
      tx.executeSync(
        `INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, generation)
         VALUES (?, ?, ?, ?, ?, ${NEW_SESSION_GENERATION_SQL})`,
        [
          localSession,
          userId,
          placeholderTitle(userId, localSession),
          createdAt,
          updatedAt,
        ],
      );
    }

    const existing = tx.executeSync(
      `SELECT m.content, m.attachment_json, m.metadata_json, s.user_id AS owner
       FROM messages m LEFT JOIN chat_sessions s ON s.id = m.session_id
       WHERE m.id = ?`,
      [messageId],
    ).rows?.[0];
    if (existing && existing.owner !== userId) {
      throw new Error('A synced chat message belongs to another account.');
    }
    // The cloud keeps at most MAX_SYNCED_MESSAGE_CHARS; this phone's own
    // longer original is not replaced by its shortened echo.
    const localContent =
      typeof existing?.content === 'string' ? existing.content : '';
    const content =
      payload.content.length === MAX_SYNCED_MESSAGE_CHARS &&
      localContent.length > MAX_SYNCED_MESSAGE_CHARS &&
      localContent.startsWith(payload.content)
        ? localContent
        : payload.content;

    const localMetadata = parseObject(existing?.metadata_json) ?? {};
    const review = payload.review_resolution as
      | Record<string, unknown>
      | null
      | undefined;
    const metadata: Record<string, unknown> = {
      ...(localMetadata.memoryChanges
        ? {memoryChanges: localMetadata.memoryChanges}
        : {}),
      ...(typeof payload.handbook_note === 'string' && payload.handbook_note
        ? {handbookNote: payload.handbook_note}
        : {}),
      ...(payload.local_reply === true ? {localReply: true} : {}),
      ...(payload.voice_interrupted === true ? {voiceInterrupted: true} : {}),
      ...(review &&
      (review.status === 'confirmed' || review.status === 'cancelled')
        ? {
            reviewResolution: {
              status: review.status,
              ...(typeof review.summary === 'string' && review.summary
                ? {summary: review.summary}
                : {}),
              ...(typeof review.resolved_at === 'string'
                ? {resolvedAt: review.resolved_at}
                : {}),
            },
          }
        : {}),
    };

    const remoteFile = payload.attachment as
      | Record<string, unknown>
      | null
      | undefined;
    const localFile = parseObject(existing?.attachment_json);
    const attachment =
      remoteFile && typeof remoteFile.file_name === 'string'
        ? {
            // This phone's own copy stays reachable; another phone's is not.
            uri:
              localFile?.fileName === remoteFile.file_name &&
              typeof localFile.uri === 'string'
                ? localFile.uri
                : '',
            fileName: remoteFile.file_name,
            format: text(remoteFile.format, 32),
            mimeType: text(remoteFile.mime_type, 128),
            sizeBytes:
              typeof remoteFile.size_bytes === 'number'
                ? remoteFile.size_bytes
                : 0,
          }
        : null;
    const attachmentJson = attachment ? JSON.stringify(attachment) : null;
    const metadataJson = Object.keys(metadata).length
      ? JSON.stringify(metadata)
      : null;

    if (existing) {
      tx.executeSync(
        `UPDATE messages SET session_id = ?, sender = ?, content = ?, attachment_json = ?,
           metadata_json = ?, created_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          localSession,
          sender,
          content,
          attachmentJson,
          metadataJson,
          createdAt,
          updatedAt,
          messageId,
        ],
      );
    } else {
      tx.executeSync(
        `INSERT INTO messages (id, session_id, sender, content, attachment_json, metadata_json, seq, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM messages), ?, ?)`,
        [
          messageId,
          localSession,
          sender,
          content,
          attachmentJson,
          metadataJson,
          createdAt,
          updatedAt,
        ],
      );
      tx.executeSync(
        'UPDATE chat_sessions SET updated_at = ? WHERE id = ? AND updated_at < ?',
        [updatedAt, localSession, updatedAt],
      );
    }
    return true;
  },

  /**
   * A delete from the cloud. Only rows this phone had synced are removed: a
   * row the cloud never got from this phone (after "Delete chat history from
   * cloud", say) is kept and uploaded again.
   */
  applyRemoteDelete: (
    tx: Executor,
    userId: string,
    entityType: ChatEntityType,
    entityId: string,
  ): ChatRemoteDeleteResult => {
    if (entityType === 'chat_message') {
      const row = tx.executeSync(
        `SELECT s.user_id AS owner FROM messages m JOIN chat_sessions s ON s.id = m.session_id
         WHERE m.id = ?`,
        [entityId],
      ).rows?.[0];
      if (!row) return {recordMetadata: true, removed: false};
      if (row.owner !== userId) {
        throw new Error('A synced chat message belongs to another account.');
      }
      if (!hasMetadata(tx, userId, 'chat_message', entityId)) {
        return {recordMetadata: false, removed: false};
      }
      removeLocalMessages(tx, userId, 'id = ?', [entityId]);
      return {recordMetadata: true, removed: true};
    }

    // A chat deleted in the cloud frees room: held chats are tried again.
    if (readHeld(tx, userId).length) writeHeld(tx, userId, []);
    const localId = toLocalSessionId(userId, entityId);
    if (!localId || isQuarantined(tx, localId))
      return {recordMetadata: true, removed: false};
    const owner = tx.executeSync(
      'SELECT user_id FROM chat_sessions WHERE id = ?',
      [localId],
    ).rows?.[0]?.user_id;
    if (owner === undefined) return {recordMetadata: true, removed: false};
    if (owner !== userId) {
      throw new Error(
        'A synced chat belongs to another account on this phone.',
      );
    }
    if (!hasMetadata(tx, userId, 'chat_session', entityId)) {
      return {recordMetadata: false, removed: false};
    }
    // Messages the server knew are deleted with the chat; ones written here
    // and not yet sent stay, and bring the chat back when they are sent.
    removeLocalMessages(
      tx,
      userId,
      `session_id = ? AND id IN (
         SELECT entity_id FROM sync_metadata
         WHERE user_id = ? AND scope_type = ? AND scope_id = ? AND entity_type = 'chat_message')`,
      [localId, userId, ACCOUNT, userId],
    );
    const remaining = Number(
      tx.executeSync(
        'SELECT COUNT(*) AS n FROM messages WHERE session_id = ?',
        [localId],
      ).rows?.[0]?.n ?? 0,
    );
    if (remaining === 0) {
      if (localId === ownedChatSessionId(userId)) {
        tx.executeSync(
          `UPDATE chat_sessions SET title = 'Default Chat', generation = ${NEW_SESSION_GENERATION_SQL}
           WHERE id = ? AND user_id = ?`,
          [localId, userId],
        );
      } else {
        tx.executeSync(
          'DELETE FROM chat_sessions WHERE id = ? AND user_id = ?',
          [localId, userId],
        );
      }
    }
    return {recordMetadata: true, removed: true};
  },

  /**
   * Queues chats and messages of `userId` that the cloud has never had from
   * this phone: history from before sync, from while it was off, or moved
   * here from the guest account. Bounded per call; returns how many messages.
   */
  enqueueUnsynced: (
    userId: string,
    limit: number = CHAT_BACKFILL_BATCH,
  ): number => {
    if (!chatSyncStore.isEnabled(userId)) return 0;
    return db.transactionSync(tx => {
      const owned = ownedChatSessionId(userId);
      const scope = [userId, ACCOUNT, userId];
      const held = readHeld(tx, userId);
      const notHeld = held.length
        ? `AND s.id NOT IN (${held.map(() => '?').join(',')})`
        : '';
      // Most recently used first: when the account is near its chat limit,
      // those are the chats that reach the cloud.
      const sessions =
        tx.executeSync(
          `SELECT s.* FROM chat_sessions s
           WHERE s.user_id = ? AND ${SYNCABLE_SESSION} ${notHeld}
             AND EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id)
           ORDER BY s.updated_at DESC`,
          [userId, owned, ...held],
        ).rows ?? [];
      for (const session of sessions) {
        ensureSessionQueued(tx, userId, String(session.id));
      }
      const messages =
        tx.executeSync(
          `SELECT m.* FROM messages m JOIN chat_sessions s ON s.id = m.session_id
           WHERE s.user_id = ? AND ${SYNCABLE_SESSION} ${notHeld}
             AND NOT EXISTS (SELECT 1 FROM sync_metadata md
                   WHERE md.user_id = ? AND md.scope_type = ? AND md.scope_id = ?
                     AND md.entity_type = 'chat_message' AND md.entity_id = m.id)
             AND NOT EXISTS (SELECT 1 FROM sync_outbox o
                   WHERE o.user_id = ? AND o.scope_type = ? AND o.scope_id = ?
                     AND o.entity_type = 'chat_message' AND o.entity_id = m.id)
           ORDER BY m.created_at ASC, m.seq ASC
           LIMIT ?`,
          [userId, owned, ...held, ...scope, ...scope, limit],
        ).rows ?? [];
      for (const message of messages) {
        enqueue(
          tx,
          userId,
          'chat_message',
          String(message.id),
          'create',
          messagePayload(userId, message),
        );
      }
      return messages.length;
    });
  },

  /**
   * After the cloud copy was deleted: forget what this phone had synced, so a
   * later "sync on" uploads this phone's chats again instead of deleting them.
   */
  forgetCloudState: (userId: string): void => {
    db.transactionSync(tx => {
      tx.executeSync(
        `DELETE FROM sync_metadata WHERE user_id = ? AND scope_type = ? AND scope_id = ?
           AND entity_type IN ('chat_session', 'chat_message')`,
        [userId, ACCOUNT, userId],
      );
      tx.executeSync(
        `DELETE FROM sync_outbox WHERE user_id = ? AND scope_type = ? AND scope_id = ?
           AND entity_type IN ('chat_session', 'chat_message') AND status <> 'in_progress'`,
        [userId, ACCOUNT, userId],
      );
      writeHeld(tx, userId, []);
    });
  },
};
