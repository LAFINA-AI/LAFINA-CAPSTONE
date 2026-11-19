import {
  db,
  notesStore,
  syncOutboxStore,
  timeBlocksStore,
} from '../../../../storage';
import type {TimeBlock} from '../../../../storage';
import {getNextDateForWeekday, pickSubjectColor} from '../../../../storage/academicProfileStore';
import {computeSemesterEndDate} from '../../../../ai/vision/scheduleParser';
import {generateId} from '../../../../utils';
import {registerCustomCategoryColor} from '../../../theme/categoryColors';
import {
  formatDaysBadge,
  sortWeekdays,
  weekdayNameForDate,
  type GroupedClassSchedule,
} from './classScheduleHelpers';

export {
  BIRTHDAY_ACCENT_COLOR,
  BIRTHDAY_RELATIONS,
  BIRTHDAYS_GROUP_ID,
  SHORT_MONTH_NAMES,
  deleteBirthday,
  formatBirthdayDisplayTitle,
  formatBirthdayLocation,
  formatBirthdayMonthDay,
  formatBirthdaySubtitle,
  getBirthdays,
  isBirthdayEvent,
  parseBirthdayEvent,
  saveBirthday,
  type BirthdayEntry,
  type SaveBirthdayInput,
} from './birthdayEvents';

/** Built-in Calendar Group / Layer IDs shared with calendarVisibilityStore. */
export const CLASSES_GROUP_ID = 'group:classes';
export const TASKS_GROUP_ID = 'group:tasks';
export const REMINDERS_GROUP_ID = 'group:reminders';

export const customGroupLayerId = (name: string): string =>
  `group:custom:${name.trim().toLowerCase()}`;

/**
 * Standard built-in block categories that should NOT be treated as user-created
 * custom schedule groups.
 */
export const STANDARD_BLOCK_CATEGORIES = new Set([
  'class',
  'academic',
  'work',
  'personal',
  'health',
  'learning',
  'imported',
  'general',
]);

// ---------------------------------------------------------------------------
// Custom Schedule Groups (custom_categories + time_blocks)
// ---------------------------------------------------------------------------

export interface CustomScheduleGroup {
  name: string;
  color: string;
  layerId: string;
  items: GroupedClassSchedule[];
  totalBlocks: number;
}

export const CUSTOM_GROUP_PRESETS: ReadonlyArray<{
  name: string;
  color: string;
}> = [
  {name: 'Exams', color: '#F75A5A'},
  {name: 'Org / Club', color: '#9B59B6'},
  {name: 'Workout', color: '#2ECC71'},
  {name: 'Study Group', color: '#3498DB'},
];

/** Collapses TimeBlock rows belonging to a custom group into logical items. */
export function groupBlocksByCategory(
  blocks: TimeBlock[],
  groupName: string,
  groupColor?: string,
): GroupedClassSchedule[] {
  const target = groupName.trim().toLowerCase();
  const filtered = blocks.filter(
    b => !b.deletedAt && b.category.trim().toLowerCase() === target,
  );
  const grouped = new Map<string, GroupedClassSchedule>();

  for (const block of filtered) {
    const cleanTitle = block.title.trim();
    const recurrenceRule = block.recurrenceRule?.trim() || '';
    const isRepeating = recurrenceRule.length > 0;
    const groupKey = isRepeating
      ? [
          cleanTitle.toLowerCase(),
          block.startTime,
          block.endTime,
          (block.notes || '').trim(),
          recurrenceRule,
        ].join('::')
      : `once::${block.id}`;

    const dayName = weekdayNameForDate(block.date);
    const existing = grouped.get(groupKey);
    if (existing) {
      if (dayName && !existing.days.includes(dayName)) {
        existing.days = sortWeekdays([...existing.days, dayName]);
        existing.daysLabel = formatDaysBadge(existing.days);
      }
      existing.blocks.push(block);
    } else {
      const days = isRepeating && dayName ? [dayName] : [];
      grouped.set(groupKey, {
        key: `${groupKey}::${block.id}`,
        code: '',
        subjectTitle: cleanTitle,
        displayTitle: cleanTitle,
        days,
        daysLabel: isRepeating
          ? days.length > 0
            ? formatDaysBadge(days)
            : block.date
          : block.date,
        startTime: block.startTime,
        endTime: block.endTime,
        room: (block.notes || '').trim(),
        section: '',
        faculty: '',
        color: block.color || groupColor || pickSubjectColor(groupName),
        recurrenceMode:
          recurrenceRule && !recurrenceRule.includes('UNTIL=')
            ? 'weekly'
            : 'semester',
        recurrenceRule,
        blocks: [block],
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const timeCmp = a.startTime.localeCompare(b.startTime);
    if (timeCmp !== 0) return timeCmp;
    return a.displayTitle.localeCompare(b.displayTitle);
  });
}

/**
 * Loads all user-created custom schedule groups from `custom_categories` and
 * any non-standard `time_blocks.category` values.
 */
export function getCustomScheduleGroups(
  userId: string,
  allUserBlocks?: TimeBlock[],
): CustomScheduleGroup[] {
  const groupsByLower = new Map<string, {name: string; color: string}>();
  try {
    const cats = notesStore.getCustomCategories(userId);
    for (const cat of cats) {
      const clean = cat.name.trim();
      if (!clean) continue;
      const lower = clean.toLowerCase();
      if (STANDARD_BLOCK_CATEGORIES.has(lower)) continue;
      registerCustomCategoryColor(clean, cat.color);
      groupsByLower.set(lower, {name: clean, color: cat.color});
    }
  } catch (error) {
    console.error('[calendarGroups] Could not read custom_categories:', error);
  }

  const blocks = allUserBlocks ?? timeBlocksStore.getAll(userId);
  for (const block of blocks) {
    if (block.deletedAt) continue;
    const cleanCat = block.category.trim();
    if (!cleanCat) continue;
    const lower = cleanCat.toLowerCase();
    if (STANDARD_BLOCK_CATEGORIES.has(lower)) continue;
    if (!groupsByLower.has(lower)) {
      groupsByLower.set(lower, {
        name: cleanCat,
        color: block.color || pickSubjectColor(cleanCat),
      });
    }
  }

  const result: CustomScheduleGroup[] = [];
  for (const {name, color} of groupsByLower.values()) {
    const items = groupBlocksByCategory(blocks, name, color);
    const totalBlocks = items.reduce((sum, item) => sum + item.blocks.length, 0);
    result.push({
      name,
      color,
      layerId: customGroupLayerId(name),
      items,
      totalBlocks,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export interface SaveCustomGroupItemInput {
  userId: string;
  groupName: string;
  groupColor: string;
  title: string;
  date: string; // YYYY-MM-DD (used when recurrenceMode === 'once')
  days: string[]; // weekday names (used when recurrenceMode !== 'once')
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  notes?: string;
  recurrenceMode: 'once' | 'weekly' | 'semester';
}

export interface UpdateCustomGroupInput {
  userId: string;
  oldName: string;
  newName: string;
  newColor: string;
}

/**
 * Renames and/or recolors a custom schedule group atomically across `custom_categories`
 * (plus any notes referencing that category) and all matching `time_blocks`.
 */
export function updateCustomScheduleGroup({
  userId,
  oldName,
  newName,
  newColor,
}: UpdateCustomGroupInput): void {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanOld || !cleanNew) {
    throw new Error('Enter a group name.');
  }
  const oldLower = cleanOld.toLowerCase();
  const newLower = cleanNew.toLowerCase();
  if (STANDARD_BLOCK_CATEGORIES.has(newLower)) {
    throw new Error(
      `"${cleanNew}" is a built-in category. Choose a custom group name.`,
    );
  }

  const existing = notesStore.getCustomCategories(userId);
  const oldCat = existing.find(
    c => c.name.trim().toLowerCase() === oldLower,
  );
  if (oldLower !== newLower) {
    const collidingCat = existing.find(
      c => c.name.trim().toLowerCase() === newLower,
    );
    const collidingBlocks =
      db.executeSync(
        `SELECT id FROM time_blocks
         WHERE user_id = ? AND lower(trim(category)) = ? AND deleted_at IS NULL
         LIMIT 1`,
        [userId, newLower],
      ).rows ?? [];
    if (collidingCat || collidingBlocks.length > 0) {
      throw new Error(`A group named "${cleanNew}" already exists.`);
    }
  }

  if (!oldCat) {
    notesStore.addCustomCategory(userId, cleanNew, newColor);
  } else if (oldCat.name !== cleanNew || oldCat.color !== newColor) {
    notesStore.updateCustomCategory(userId, oldCat.name, cleanNew, newColor);
  }

  db.transactionSync(tx => {
    const rows =
      tx.executeSync(
        `SELECT id, category, color FROM time_blocks
         WHERE user_id = ? AND lower(trim(category)) = ? AND deleted_at IS NULL`,
        [userId, oldLower],
      ).rows ?? [];
    for (const row of rows) {
      if (String(row.category) !== cleanNew || String(row.color) !== newColor) {
        timeBlocksStore.update(
          {
            id: String(row.id),
            category: cleanNew,
            color: newColor,
          },
          tx,
        );
      }
    }
  });

  registerCustomCategoryColor(cleanNew, newColor);
}

/** Ensures the custom group exists in `custom_categories` and matches the requested color. */
export function ensureCustomScheduleGroup(
  userId: string,
  groupName: string,
  groupColor: string,
): void {
  const cleanName = groupName.trim();
  if (!cleanName) return;
  const existing = notesStore.getCustomCategories(userId);
  const match = existing.find(
    c => c.name.trim().toLowerCase() === cleanName.toLowerCase(),
  );
  if (!match) {
    notesStore.addCustomCategory(userId, cleanName, groupColor);
    updateCustomScheduleGroup({
      userId,
      oldName: cleanName,
      newName: cleanName,
      newColor: groupColor,
    });
    return;
  }
  if (match.name !== cleanName || match.color !== groupColor) {
    updateCustomScheduleGroup({
      userId,
      oldName: match.name,
      newName: cleanName,
      newColor: groupColor,
    });
    return;
  }
  registerCustomCategoryColor(cleanName, groupColor);
}

/** Saves a single or weekly-repeating item into a named custom schedule group. */
export function saveCustomGroupItem(input: SaveCustomGroupItemInput): number {
  const cleanGroup = input.groupName.trim();
  const cleanTitle = input.title.trim();
  if (!cleanGroup) throw new Error('Enter a group name.');
  if (!cleanTitle) throw new Error('Enter an item title.');

  ensureCustomScheduleGroup(input.userId, cleanGroup, input.groupColor);

  const now = new Date();
  const semesterUntil = computeSemesterEndDate(now);
  let created = 0;

  db.transactionSync(tx => {
    if (input.recurrenceMode === 'once') {
      timeBlocksStore.insert(
        {
          id: generateId('block'),
          userId: input.userId,
          title: cleanTitle,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          color: input.groupColor,
          category: cleanGroup,
          notes: input.notes?.trim() || undefined,
          recurrenceRule: null,
        },
        tx,
      );
      created = 1;
      return;
    }

    const sortedDays = sortWeekdays(input.days);
    if (sortedDays.length === 0) {
      throw new Error('Select at least one day.');
    }
    const rule =
      input.recurrenceMode === 'weekly'
        ? 'FREQ=WEEKLY'
        : `FREQ=WEEKLY;UNTIL=${semesterUntil}`;
    for (const dayName of sortedDays) {
      const targetDate = getNextDateForWeekday(dayName, now);
      timeBlocksStore.insert(
        {
          id: generateId('block'),
          userId: input.userId,
          title: cleanTitle,
          date: targetDate,
          startTime: input.startTime,
          endTime: input.endTime,
          color: input.groupColor,
          category: cleanGroup,
          notes: input.notes?.trim() || undefined,
          recurrenceRule: rule,
        },
        tx,
      );
      created += 1;
    }
  });

  return created;
}

/** Deletes a custom group's category definition and all of its time blocks atomically. */
export function deleteCustomScheduleGroup(
  userId: string,
  groupName: string,
): void {
  const clean = groupName.trim().toLowerCase();
  if (!clean) return;
  const now = new Date().toISOString();

  db.transactionSync(tx => {
    const blocks =
      tx.executeSync(
        `SELECT id FROM time_blocks
         WHERE user_id = ? AND lower(trim(category)) = ? AND deleted_at IS NULL`,
        [userId, clean],
      ).rows ?? [];
    for (const row of blocks) {
      timeBlocksStore.delete(String(row.id), tx);
    }

    const cats =
      tx.executeSync(
        `SELECT id FROM custom_categories
         WHERE user_id = ? AND lower(trim(name)) = ? AND deleted_at IS NULL`,
        [userId, clean],
      ).rows ?? [];
    for (const cat of cats) {
      const id = String(cat.id);
      tx.executeSync(
        `UPDATE custom_categories SET deleted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id],
      );
      syncOutboxStore.enqueueMutation(
        userId,
        'custom_category',
        id,
        'delete',
        {},
        'account',
        userId,
        tx,
      );
    }
  });
}
