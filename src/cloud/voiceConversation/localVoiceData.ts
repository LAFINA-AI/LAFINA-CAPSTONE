import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {notesQueryStore} from '../../storage/notesQueryStore';
import {plannerQueries} from '../../storage/plannerQueries';
import {isRealDate, addDaysToDate} from '../../storage/eventTime';
import {formatLocalDate} from '../../ai/nlu/fastPathParser';
import {sanitizeUntrustedContext} from '../../ai/voiceActions/actionSecurity';

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
    const result = notesQueryStore.page({
      userId,
      search: query,
      limit: Math.min(options.limit || 5, 5),
    });
    return {
      notes: result.items.map(n => ({
        id: n.id,
        updatedAt: n.updatedAt,
        category: n.category,
        title: n.title.slice(0, 150),
        body: n.body.slice(0, 600),
      })),
      partial: result.indexing || !!result.nextCursor,
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
