import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {notesQueryStore} from '../../storage/notesQueryStore';
import {notesStore} from '../../storage/notesStore';
import {tasksStore} from '../../storage/tasksStore';
import {plannerQueries} from '../../storage/plannerQueries';
import {isRealDate, addDaysToDate} from '../../storage/eventTime';
import {formatLocalDate} from '../../ai/nlu/fastPathParser';
import {sanitizeUntrustedContext} from '../../ai/voiceActions/promptSanitizer';
import {readOnboardingIdentity} from '../../storage/onboardingMemory';
import {extractChecklistItems, noteBodyToMarkdown} from '../../utils/richText';

/** Return only the current owner's requested records, bounded before network use. */
export const readLocalVoiceResult = (
  userId: string,
  kind: unknown,
  rawQuery: unknown,
  options: {start?: string; end?: string; limit?: number} = {},
) => {
  const query =
    typeof rawQuery === 'string' ? rawQuery.trim().slice(0, 100) : '';
  if (kind === 'memory') {
    if (!chatMemoryStore.isEnabled(userId))
      return 'Memory is turned off. No saved memories are available.';
    const all = chatMemoryStore.list(userId);
    const matched = query
      ? all.filter(m => m.text.toLowerCase().includes(query.toLowerCase()))
      : all;
    const memories = matched.slice(0, 10);
    return {
      memories: memories.map(m =>
        sanitizeUntrustedContext(m.text).slice(0, 250),
      ),
      partial: matched.length > 10,
      dataIsUntrusted: true,
    };
  }
  if (kind === 'notes') {
    const pageResult = notesQueryStore.page({
      userId,
      search: query,
      limit: Math.min(options.limit || 5, 5),
    });
    let items = pageResult.items;
    if (items.length === 0 && query) {
      try {
        const all = notesStore.getAll(userId);
        const q = query.toLowerCase();
        items = all
          .filter(
            n =>
              n.title.toLowerCase().includes(q) ||
              noteBodyToMarkdown(n.body).toLowerCase().includes(q) ||
              n.category?.toLowerCase().includes(q),
          )
          .slice(0, 5) as never;
      } catch {
        // best-effort
      }
    }
    return {
      notes: items.map(n => ({
        id: n.id,
        updatedAt: n.updatedAt,
        category: n.category,
        title: n.title.slice(0, 150),
        body: noteBodyToMarkdown(n.body).slice(0, 600),
      })),
      partial: pageResult.indexing || !!pageResult.nextCursor,
      dataIsUntrusted: true,
    };
  }
  if (kind === 'todos') {
    const q = query.toLowerCase();
    const limit = Math.min(options.limit || 12, 20);
    const allTasks = tasksStore.getAllTasks(userId);
    const openTasks = allTasks.filter(t => !t.isCompleted);
    const matchedTasks = q
      ? openTasks.filter(
          t =>
            t.title.toLowerCase().includes(q) ||
            (t.category || '').toLowerCase().includes(q) ||
            (t.notes || '').toLowerCase().includes(q),
        )
      : openTasks;
    matchedTasks.sort((a, b) => {
      const aUndated = a.dueDate ? 1 : 0;
      const bUndated = b.dueDate ? 1 : 0;
      if (aUndated !== bUndated) return aUndated - bUndated;
      const prioRank: Record<string, number> = {High: 0, Medium: 1, Low: 2};
      const prDiff = (prioRank[a.priority] ?? 1) - (prioRank[b.priority] ?? 1);
      if (prDiff !== 0) return prDiff;
      return (a.dueDate || '9999-99-99').localeCompare(
        b.dueDate || '9999-99-99',
      );
    });

    const noteChecklists: Array<{
      noteId: string;
      noteTitle: string;
      text: string;
    }> = [];
    try {
      for (const note of notesStore.getAll(userId)) {
        for (const item of extractChecklistItems(note.body)) {
          if (item.done || !item.text) continue;
          if (
            !q ||
            item.text.toLowerCase().includes(q) ||
            note.title.toLowerCase().includes(q)
          ) {
            noteChecklists.push({
              noteId: note.id,
              noteTitle: note.title.slice(0, 100),
              text: item.text.slice(0, 150),
            });
          }
        }
      }
    } catch {
      // best-effort
    }

    return {
      todos: matchedTasks.slice(0, limit).map(t => ({
        id: t.id,
        title: t.title.slice(0, 120),
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        priority: t.priority,
        category: t.category,
        completed: t.isCompleted,
      })),
      noteChecklists: noteChecklists.slice(0, 8),
      partial: matchedTasks.length > limit || noteChecklists.length > 8,
      dataIsUntrusted: true,
    };
  }
  if (kind === 'calendar') {
    const today = formatLocalDate(new Date());
    const date = isRealDate(query)
      ? query
      : /^today$/i.test(query)
      ? today
      : /^tomorrow$/i.test(query)
      ? addDaysToDate(today, 1)
      : null;
    const start = options.start || date || today;
    const requestedEnd =
      options.end || (date ? date : addDaysToDate(start, 30));
    const end =
      requestedEnd > addDaysToDate(start, 30)
        ? addDaysToDate(start, 30)
        : requestedEnd;
    const window = plannerQueries.window(userId, start, end);
    const match = (title: string) =>
      !query || !!date || title.toLowerCase().includes(query.toLowerCase());
    const events = window.events.filter(e => match(e.title));
    const tasks = window.tasks.filter(t => match(t.title));
    const blocks = window.blocks.filter(b => match(b.title));
    return {
      window: {start, end},
      events: events.slice(0, 8).map(e => ({
        id: e.id,
        title: e.title.slice(0, 100),
        date: e.date,
        start: e.startTime,
        end: e.endTime,
      })),
      tasks: tasks.slice(0, 8).map(t => ({
        id: t.id,
        title: t.title.slice(0, 100),
        date: t.dueDate,
        time: t.dueTime,
        completed: t.isCompleted,
      })),
      blocks: blocks.slice(0, 8).map(b => ({
        id: b.id,
        title: b.title.slice(0, 100),
        date: b.date,
        start: b.startTime,
        end: b.endTime,
      })),
      partial:
        requestedEnd !== end ||
        events.length > 8 ||
        tasks.length > 8 ||
        blocks.length > 8,
      dataIsUntrusted: true,
    };
  }
  throw new Error('Unsupported data type');
};

export type LocalVoiceResult = ReturnType<typeof readLocalVoiceResult>;
export const readLocalVoiceData = (
  userId: string,
  kind: unknown,
  query: unknown,
): string => {
  const result = readLocalVoiceResult(userId, kind, query);
  return typeof result === 'string' ? result : JSON.stringify(result);
};

/**
 * Builds a compact, plain-text summary of the student's active schedule,
 * tasks, saved notes, profile, and memories from the local SQLite database.
 * This context is provided to ElevenLabs / DeepSeek in Call Lafina so Lafina
 * has complete awareness of personal student data.
 */
export const buildStudentVoiceContext = (
  userId: string,
  options: {referenceDate?: Date} = {},
): string => {
  if (!userId) return '';
  const sections: string[] = [];

  // 1. Identity & Persona preferences
  try {
    const identity = readOnboardingIdentity(userId);
    const profileParts: string[] = [];
    if (identity.preferredName) {
      profileParts.push(`Student preferred name: ${identity.preferredName}`);
    }
    if (identity.tone) {
      profileParts.push(`Tone: ${identity.tone}`);
    }
    if (profileParts.length > 0) {
      sections.push(profileParts.join(', '));
    }
  } catch {
    // best-effort
  }

  // 2. Calendar Schedule: the current time, overdue work and a per-day
  // summary of the next 7 days, so "what's next?" and "am I free tonight?"
  // can be answered (audit finding 11). Bounded so the prompt stays small.
  try {
    const now = options.referenceDate ?? new Date();
    const today = formatLocalDate(now);
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}`;
    const upcomingEnd = addDaysToDate(today, 6);
    const window = plannerQueries.window(userId, today, upcomingEnd);

    const MAX_PER_DAY = 12;
    const MAX_ITEMS = 60;
    const byDay = new Map<string, {sortKey: string; line: string}[]>();
    const add = (date: string, sortKey: string, line: string) => {
      const list = byDay.get(date) ?? [];
      list.push({sortKey, line});
      byDay.set(date, list);
    };

    for (const b of window.blocks) {
      add(
        b.date,
        b.startTime || '',
        `Time block "${b.title}" on ${b.date} (${b.startTime}-${b.endTime})`,
      );
    }
    for (const e of window.events) {
      add(
        e.date,
        e.startTime || '',
        `Event "${e.title}" on ${e.date}${
          e.startTime ? ` at ${e.startTime}` : ''
        }${e.location ? ` @ ${e.location}` : ''}`,
      );
    }
    for (const t of window.tasks.filter(task => !task.isCompleted)) {
      add(
        t.dueDate || today,
        t.dueTime || '99:99',
        `Task "${t.title}" (${t.priority} priority)${
          t.dueDate ? ` due ${t.dueDate}` : ''
        }${t.dueTime ? ` at ${t.dueTime}` : ''}`,
      );
    }

    const dayLines: string[] = [];
    let total = 0;
    for (const date of [...byDay.keys()].sort()) {
      const entries = byDay
        .get(date)!
        .sort((x, y) => x.sortKey.localeCompare(y.sortKey));
      const shown = entries.slice(0, MAX_PER_DAY);
      if (total + shown.length > MAX_ITEMS) break;
      total += shown.length;
      const weekday = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
      });
      const more =
        entries.length > shown.length
          ? `\n  (+${entries.length - shown.length} more that day)`
          : '';
      dayLines.push(
        `${weekday} ${date}${date === today ? ' (today)' : ''} — ${
          entries.length
        } item${entries.length === 1 ? '' : 's'}:\n- ${shown
          .map(entry => entry.line)
          .join('\n- ')}${more}`,
      );
    }

    let overdueLine = '';
    try {
      const {items: overdue, total: overdueTotal} = plannerQueries.overdueTasks(
        userId,
        today,
        10,
      );
      if (overdue.length > 0) {
        overdueLine = `\nOverdue tasks (${overdueTotal}):\n- ${overdue
          .map(
            t =>
              `Task "${t.title}" (${t.priority} priority) was due ${t.dueDate}${
                t.dueTime ? ` at ${t.dueTime}` : ''
              }`,
          )
          .join('\n- ')}`;
      }
    } catch {
      // best-effort
    }

    const header = `Active Schedule & Calendar (Today is ${today}, now ${nowTime})`;
    if (dayLines.length > 0) {
      sections.push(`${header}:\n${dayLines.join('\n')}${overdueLine}`);
    } else {
      sections.push(
        `${header}: No upcoming events or pending tasks scheduled.${overdueLine}`,
      );
    }
  } catch {
    // best-effort
  }

  let cachedNotes: ReturnType<typeof notesStore.getAll> | null = null;
  try {
    cachedNotes = notesStore.getAll(userId);
  } catch {
    cachedNotes = null;
  }

  // 2b. To-Do List in Notes Tab (undated To-Dos, open tasks, and Note checklists)
  try {
    const allTasks = tasksStore.getAllTasks(userId);
    const openUndated = allTasks.filter(t => !t.isCompleted && !t.dueDate);
    const openDated = allTasks.filter(
      t => !t.isCompleted && Boolean(t.dueDate),
    );
    const checklistLines: string[] = [];
    if (cachedNotes) {
      for (const n of cachedNotes) {
        for (const item of extractChecklistItems(n.body)) {
          if (!item.done && item.text) {
            checklistLines.push(
              `• [Note Checklist] "${item.text.slice(
                0,
                100,
              )}" (from note "${n.title.slice(0, 60)}")`,
            );
          }
        }
      }
    }
    const todoLines: string[] = [
      ...openUndated
        .slice(0, 12)
        .map(
          t =>
            `• [To-Do] "${t.title.slice(0, 100)}" (undated, ${
              t.priority
            } priority${t.category ? `, ${t.category}` : ''})`,
        ),
      ...openDated
        .slice(0, 8)
        .map(
          t =>
            `• [Scheduled Task] "${t.title.slice(0, 100)}" (due ${t.dueDate}${
              t.dueTime ? ` at ${t.dueTime}` : ''
            }, ${t.priority} priority)`,
        ),
      ...checklistLines.slice(0, 8),
    ];
    if (todoLines.length > 0) {
      sections.push(`To-Do List in Notes tab:\n${todoLines.join('\n')}`);
    } else {
      sections.push(
        `To-Do List in Notes tab: No open To-Dos or unchecked checklists.`,
      );
    }
  } catch {
    // best-effort
  }

  // 3. Notes in Notes Tab
  try {
    const allNotes = cachedNotes ?? notesStore.getAll(userId);
    if (allNotes.length > 0) {
      const noteSummaries = allNotes.slice(0, 15).map(n => {
        const bodyClean = noteBodyToMarkdown(n.body)
          .replace(/\n+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        return `• ${n.isPinned ? '[Pinned] ' : ''}"${n.title}"${
          n.category ? ` [${n.category}]` : ''
        }: ${bodyClean || '(empty)'}`;
      });
      sections.push(`Saved Notes in Notes tab:\n${noteSummaries.join('\n')}`);
    } else {
      sections.push(`Saved Notes in Notes tab: No saved notes currently.`);
    }
  } catch {
    // best-effort
  }

  // 4. Saved Memories
  try {
    if (chatMemoryStore.isEnabled(userId)) {
      const memories = chatMemoryStore.list(userId);
      if (memories.length > 0) {
        const facts = memories.slice(0, 5).map(m => m.text);
        sections.push(`Student Memories & Preferences: ${facts.join('; ')}`);
      }
    }
  } catch {
    // best-effort
  }

  return sections.join('\n\n');
};
