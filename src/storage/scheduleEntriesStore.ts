import {db, type DatabaseTransaction} from './database';
import {localSettingsStore} from './localSettingsStore';
import type {Event, Task} from './tasksStore';
import type {TimeBlock} from './timeBlocksStore';
import type {Reminder} from './remindersStore';
import {generateId} from '../utils';

export const SCHEDULE_ENTRIES_KEY = 'schedule.entries.v1';

export type ScheduleEntryTargetKind =
  | 'event'
  | 'block'
  | 'class_group'
  | 'task'
  | 'reminder'
  | 'holiday'
  | 'ustp_event'
  | 'birthday';

export type ScheduleEntryType = 'note' | 'link';

export interface ScheduleAttachedEntry {
  id: string;
  userId: string;
  targetKind: ScheduleEntryTargetKind;
  targetId: string;
  entryType: ScheduleEntryType;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedScheduleEntryTarget {
  targetKind: ScheduleEntryTargetKind;
  targetId: string;
  fallbackIds: string[];
  isSharedAcrossSessions: boolean;
}

export interface ScheduleEntryTargetInput {
  id?: string;
  kind:
    | 'event'
    | 'block'
    | 'task'
    | 'reminder'
    | 'holiday'
    | 'ustp_event'
    | 'birthday';
  rawEvent?: Pick<
    Event,
    'id' | 'location' | 'linkedCalendarBlock' | 'recurrenceRule'
  >;
  rawBlock?: Pick<
    TimeBlock,
    'id' | 'title' | 'startTime' | 'endTime' | 'category' | 'recurrenceRule'
  >;
  rawTask?: Pick<Task, 'id' | 'recurrenceRule'>;
  rawReminder?: Pick<Reminder, 'id'>;
  rawHoliday?: {date: string; name: string};
  rawUstpEvent?: {event: {id: string}};
}

/** Strips the synthetic `_occur_YYYY-MM-DD` suffix from expanded recurrences. */
export function baseScheduleEntityId(id: string): string {
  const at = id.indexOf('_occur_');
  return at < 0 ? id : id.slice(0, at);
}

const isBirthdayEventLike = (
  event: Pick<Event, 'linkedCalendarBlock' | 'location'>,
): boolean =>
  event.linkedCalendarBlock === 'group:birthdays' ||
  (typeof event.location === 'string' &&
    event.location.startsWith('[BIRTHDAY]'));

/**
 * Resolves a stable target key and fallback IDs for attaching notes or links to
 * a schedule item. Repeating classes share attachments across all sessions of
 * that subject (`class_group`) without touching `time_blocks.notes`.
 */
export function resolveScheduleEntryTarget(
  input: ScheduleEntryTargetInput,
): ResolvedScheduleEntryTarget {
  if (input.kind === 'block' && input.rawBlock) {
    const blk = input.rawBlock;
    const baseId = baseScheduleEntityId(blk.id);
    const catLower = (blk.category || '').trim().toLowerCase();
    const titleLower = (blk.title || '').trim().toLowerCase();
    if (catLower === 'class') {
      return {
        targetKind: 'class_group',
        targetId: `class::${titleLower}::${blk.startTime}::${blk.endTime}`,
        fallbackIds: [baseId],
        isSharedAcrossSessions: true,
      };
    }
    if (blk.recurrenceRule && blk.recurrenceRule.trim().length > 0) {
      return {
        targetKind: 'block',
        targetId: `block_group::${catLower}::${titleLower}::${blk.startTime}::${blk.endTime}`,
        fallbackIds: [baseId],
        isSharedAcrossSessions: true,
      };
    }
    return {
      targetKind: 'block',
      targetId: baseId,
      fallbackIds: [],
      isSharedAcrossSessions: false,
    };
  }

  if ((input.kind === 'event' || input.kind === 'birthday') && input.rawEvent) {
    const ev = input.rawEvent;
    const isBirthday = input.kind === 'birthday' || isBirthdayEventLike(ev);
    return {
      targetKind: isBirthday ? 'birthday' : 'event',
      targetId: baseScheduleEntityId(ev.id),
      fallbackIds: [],
      isSharedAcrossSessions: Boolean(ev.recurrenceRule?.trim()),
    };
  }

  if (input.kind === 'task' && input.rawTask) {
    return {
      targetKind: 'task',
      targetId: baseScheduleEntityId(input.rawTask.id),
      fallbackIds: [],
      isSharedAcrossSessions: Boolean(input.rawTask.recurrenceRule?.trim()),
    };
  }

  if (input.kind === 'reminder' && input.rawReminder) {
    return {
      targetKind: 'reminder',
      targetId: baseScheduleEntityId(input.rawReminder.id),
      fallbackIds: [],
      isSharedAcrossSessions: false,
    };
  }

  if (input.kind === 'holiday' && input.rawHoliday) {
    return {
      targetKind: 'holiday',
      targetId: `${input.rawHoliday.date}::${input.rawHoliday.name}`,
      fallbackIds: [],
      isSharedAcrossSessions: false,
    };
  }

  if (input.kind === 'ustp_event' && input.rawUstpEvent) {
    return {
      targetKind: 'ustp_event',
      targetId: `ustp::${input.rawUstpEvent.event.id}`,
      fallbackIds: [],
      isSharedAcrossSessions: true,
    };
  }

  return {
    targetKind: input.kind,
    targetId: baseScheduleEntityId(input.id || 'unknown'),
    fallbackIds: [],
    isSharedAcrossSessions: false,
  };
}

/** Normalizes a user-supplied URL by trimming and defaulting to `https://`. */
export function normalizeEntryUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

const URL_TEXT_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>"')\]]+|(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|ph|io|app|me|co|us|uk)(?:\.[a-z]{2})?(?:\/[^\s<>"')\]]*)?/gi;

/** Extracts unique clickable web URLs from a free-text note body. */
export function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of text.matchAll(URL_TEXT_REGEX)) {
    const raw = match[0];
    const idx = match.index ?? 0;
    const prevChar = idx > 0 ? text[idx - 1] : '';
    if (!/^https?:\/\//i.test(raw) && /[a-zA-Z0-9_@.-]/.test(prevChar)) {
      continue;
    }
    const cleaned = raw.replace(/[.,;:!?]+$/, '');
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    urls.push(cleaned);
  }
  return urls;
}

const isValidEntry = (item: unknown): item is ScheduleAttachedEntry => {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.targetId === 'string' &&
    (candidate.entryType === 'note' || candidate.entryType === 'link') &&
    typeof candidate.content === 'string'
  );
};

const parseEntries = (raw: string | null): ScheduleAttachedEntry[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
};

const readEntriesStrict = (
  userId: string,
  tx: Pick<DatabaseTransaction, 'executeSync'>,
): ScheduleAttachedEntry[] => {
  const row = tx.executeSync(
    'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
    [userId, SCHEDULE_ENTRIES_KEY],
  ).rows?.[0];
  return parseEntries(typeof row?.value === 'string' ? row.value : null);
};

const writeEntries = (
  userId: string,
  entries: ScheduleAttachedEntry[],
  executor?: DatabaseTransaction,
): void => {
  const serialized = JSON.stringify(entries);
  if (executor) {
    executor.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, SCHEDULE_ENTRIES_KEY, serialized, new Date().toISOString()],
    );
    return;
  }
  const ok = localSettingsStore.set(userId, SCHEDULE_ENTRIES_KEY, serialized);
  if (!ok) {
    throw new Error('Could not save schedule entries.');
  }
};

export const scheduleEntriesStore = {
  getAll: (userId: string): ScheduleAttachedEntry[] => {
    try {
      const raw = localSettingsStore.get(userId, SCHEDULE_ENTRIES_KEY, '');
      return parseEntries(raw);
    } catch (error) {
      console.error('[scheduleEntriesStore] Error reading entries:', error);
      return [];
    }
  },

  getForTarget: (
    userId: string,
    targetId: string,
    fallbackIds: string[] = [],
  ): ScheduleAttachedEntry[] => {
    const accepted = new Set([targetId, ...fallbackIds]);
    return scheduleEntriesStore
      .getAll(userId)
      .filter(entry => accepted.has(entry.targetId));
  },

  addEntry: (input: {
    userId: string;
    targetKind: ScheduleEntryTargetKind;
    targetId: string;
    entryType: ScheduleEntryType;
    title?: string;
    content: string;
  }): ScheduleAttachedEntry => {
    const trimmedContent = input.content.trim();
    if (!trimmedContent) {
      throw new Error(
        input.entryType === 'link' ? 'Enter a link URL.' : 'Enter note text.',
      );
    }
    const now = new Date().toISOString();
    const content =
      input.entryType === 'link'
        ? normalizeEntryUrl(trimmedContent)
        : trimmedContent;
    const entry: ScheduleAttachedEntry = {
      id: generateId('sched_entry'),
      userId: input.userId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      entryType: input.entryType,
      title: (input.title ?? '').trim(),
      content,
      createdAt: now,
      updatedAt: now,
    };
    db.transactionSync(tx => {
      const existing = readEntriesStrict(input.userId, tx);
      writeEntries(input.userId, [...existing, entry], tx);
    });
    return entry;
  },

  updateEntry: (
    userId: string,
    entryId: string,
    patch: {
      title?: string;
      content?: string;
      entryType?: ScheduleEntryType;
    },
  ): ScheduleAttachedEntry | null => {
    let updated: ScheduleAttachedEntry | null = null;
    db.transactionSync(tx => {
      const existing = readEntriesStrict(userId, tx);
      const next = existing.map(item => {
        if (item.id !== entryId) return item;
        const entryType = patch.entryType ?? item.entryType;
        const rawContent =
          patch.content !== undefined ? patch.content.trim() : item.content;
        if (!rawContent) {
          throw new Error(
            entryType === 'link' ? 'Enter a link URL.' : 'Enter note text.',
          );
        }
        const content =
          entryType === 'link' ? normalizeEntryUrl(rawContent) : rawContent;
        updated = {
          ...item,
          entryType,
          title: patch.title !== undefined ? patch.title.trim() : item.title,
          content,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      });
      if (updated) {
        writeEntries(userId, next, tx);
      }
    });
    return updated;
  },

  deleteEntry: (userId: string, entryId: string): void => {
    db.transactionSync(tx => {
      const existing = readEntriesStrict(userId, tx);
      const next = existing.filter(item => item.id !== entryId);
      if (next.length !== existing.length) {
        writeEntries(userId, next, tx);
      }
    });
  },

  /** Moves all entries from an old target key to a new target key (e.g., class rename/reschedule). */
  rekeyTarget: (
    userId: string,
    oldTargetId: string,
    newTargetId: string,
  ): void => {
    if (!oldTargetId || !newTargetId || oldTargetId === newTargetId) return;
    db.transactionSync(tx => {
      const existing = readEntriesStrict(userId, tx);
      let changed = false;
      const now = new Date().toISOString();
      const next = existing.map(entry => {
        if (entry.targetId !== oldTargetId) return entry;
        changed = true;
        return {
          ...entry,
          targetId: newTargetId,
          updatedAt: now,
        };
      });
      if (changed) {
        writeEntries(userId, next, tx);
      }
    });
  },

  /** Deletes all attached entries belonging to a deleted schedule target. */
  removeEntriesForTarget: (
    userId: string,
    targetId: string,
    fallbackIds: string[] = [],
  ): void => {
    const targets = new Set([targetId, ...fallbackIds].filter(Boolean));
    if (targets.size === 0) return;
    db.transactionSync(tx => {
      const existing = readEntriesStrict(userId, tx);
      const next = existing.filter(entry => !targets.has(entry.targetId));
      if (next.length !== existing.length) {
        writeEntries(userId, next, tx);
      }
    });
  },

  /** Replaces, creates, or clears the synced untitled form note for an Event. */
  upsertFormNoteForEvent: (
    userId: string,
    eventId: string,
    noteText: string,
  ): void => {
    const clean = noteText.trim();
    const targetId = baseScheduleEntityId(eventId);
    db.transactionSync(tx => {
      const existing = readEntriesStrict(userId, tx);
      const match = existing.find(
        e =>
          e.targetKind === 'event' &&
          e.targetId === targetId &&
          e.entryType === 'note' &&
          !e.title,
      );
      if (!clean) {
        if (match) {
          writeEntries(
            userId,
            existing.filter(item => item.id !== match.id),
            tx,
          );
        }
        return;
      }
      const now = new Date().toISOString();
      if (match) {
        writeEntries(
          userId,
          existing.map(item =>
            item.id === match.id ? {...item, content: clean, updatedAt: now} : item,
          ),
          tx,
        );
      } else {
        writeEntries(
          userId,
          [
            ...existing,
            {
              id: generateId('sched_entry'),
              userId,
              targetKind: 'event',
              targetId,
              entryType: 'note',
              title: '',
              content: clean,
              createdAt: now,
              updatedAt: now,
            },
          ],
          tx,
        );
      }
    });
  },

  clear: (userId: string, executor?: DatabaseTransaction): void => {
    const run = (tx: Pick<DatabaseTransaction, 'executeSync'>) => {
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [userId, SCHEDULE_ENTRIES_KEY],
      );
    };
    if (executor) run(executor);
    else db.transactionSync(run);
  },

  transferFromGuest: (
    tx: Pick<DatabaseTransaction, 'executeSync'>,
    fromUserId: string,
    toUserId: string,
  ): void => {
    if (fromUserId === toUserId) return;
    const fromRaw = tx.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [fromUserId, SCHEDULE_ENTRIES_KEY],
    ).rows?.[0]?.value;
    const fromEntries = parseEntries(
      typeof fromRaw === 'string' ? fromRaw : null,
    );
    if (fromEntries.length === 0) {
      tx.executeSync(
        'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
        [fromUserId, SCHEDULE_ENTRIES_KEY],
      );
      return;
    }

    const toRaw = tx.executeSync(
      'SELECT value FROM local_settings WHERE user_id = ? AND key = ?',
      [toUserId, SCHEDULE_ENTRIES_KEY],
    ).rows?.[0]?.value;
    const toEntries = parseEntries(typeof toRaw === 'string' ? toRaw : null);

    const seen = new Set(toEntries.map(e => e.id));
    const merged = [...toEntries];
    for (const entry of fromEntries) {
      if (!seen.has(entry.id)) {
        merged.push({...entry, userId: toUserId});
      }
    }

    tx.executeSync(
      `INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [
        toUserId,
        SCHEDULE_ENTRIES_KEY,
        JSON.stringify(merged),
        new Date().toISOString(),
      ],
    );
    tx.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [
      fromUserId,
      SCHEDULE_ENTRIES_KEY,
    ]);
  },
};
