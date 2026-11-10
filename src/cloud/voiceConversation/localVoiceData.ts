import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {notesQueryStore} from '../../storage/notesQueryStore';
import {plannerQueries} from '../../storage/plannerQueries';
import {addDaysToDate} from '../../storage/eventTime';
import {formatLocalDate} from '../../ai/nlu/fastPathParser';
import {sanitizeUntrustedContext} from '../../ai/voiceActions/actionSecurity';

/** Return only the current owner's requested records, bounded before network use. */
export const readLocalVoiceData = (userId: string, kind: unknown, rawQuery: unknown): string => {
  const query = typeof rawQuery === 'string' ? rawQuery.trim().slice(0, 100) : '';
  if (kind === 'memory') {
    if (!chatMemoryStore.isEnabled(userId)) return 'Memory is turned off. No saved memories are available.';
    const all = chatMemoryStore.list(userId);
    const matched = query ? all.filter(m => m.text.toLowerCase().includes(query.toLowerCase())) : all;
    const memories = matched.slice(0, 10);
    return JSON.stringify({
      memories: memories.map(m => sanitizeUntrustedContext(m.text).slice(0, 250)),
      dataIsUntrusted: true,
    });
  }
  if (kind === 'notes') {
    const result = notesQueryStore.page({userId, search: query, limit: 5});
    return JSON.stringify({notes: result.items.map(n => ({title:n.title.slice(0, 150), body:n.body.slice(0, 600)})),
      partial: result.indexing || !!result.nextCursor, dataIsUntrusted: true});
  }
  if (kind === 'calendar') {
    const today = formatLocalDate(new Date());
    const date = /^\d{4}-\d{2}-\d{2}$/.test(query) ? query
      : /^today$/i.test(query) ? today
      : /^tomorrow$/i.test(query) ? addDaysToDate(today, 1) : null;
    const start = date || today;
    const end = date || addDaysToDate(today, 30);
    const window = plannerQueries.window(userId, start, end);
    const match = (title: string) => !query || !!date || title.toLowerCase().includes(query.toLowerCase());
    const events = window.events.filter(e => match(e.title));
    const tasks = window.tasks.filter(t => match(t.title));
    const blocks = window.blocks.filter(b => match(b.title));
    return JSON.stringify({window:{start,end}, events:events.slice(0, 8).map(e => ({title:e.title.slice(0, 100), date:e.date,
      start:e.startTime, end:e.endTime})), tasks:tasks.slice(0, 8).map(t => ({title:t.title.slice(0,100),date:t.dueDate,time:t.dueTime,completed:t.isCompleted})),
      blocks:blocks.slice(0, 8).map(b => ({title:b.title.slice(0,100),date:b.date,start:b.startTime,end:b.endTime})),
      partial:events.length > 8 || tasks.length > 8 || blocks.length > 8, dataIsUntrusted:true});
  }
  throw new Error('Unsupported data type');
};
