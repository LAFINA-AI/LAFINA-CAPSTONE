export interface KeyTopic {
  topic: string;
  discussion: string;
}

export interface ActionItem {
  task: string;
  assignee: string;
  deadline: string;
  status: 'pending' | 'done';
}

export interface MeetingNotes {
  title: string;
  summary: string;
  key_topics: KeyTopic[];
  decisions: string[];
  action_items: ActionItem[];
  important_dates: string[];
  issues: string[];
  unresolved_questions: string[];
  key_points: string[];
}

export const emptyNotes = (): MeetingNotes => ({
  title: '',
  summary: '',
  key_topics: [],
  decisions: [],
  action_items: [],
  important_dates: [],
  issues: [],
  unresolved_questions: [],
  key_points: [],
});

const cleanText = (value: unknown, maxLen = 4000): string =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLen)
    : '';

const cleanMultiline = (value: unknown, maxLen = 8000): string =>
  typeof value === 'string'
    ? value
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, maxLen)
    : '';

const cleanStringList = (value: unknown, maxItems = 40): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = cleanText(item, 600);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
};

const cleanTopics = (value: unknown, maxItems = 30): KeyTopic[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: KeyTopic[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const topic = cleanText(row.topic ?? row.heading ?? row.name, 200);
    const discussion = cleanText(row.discussion ?? row.details ?? row.summary, 1200);
    if (!topic && !discussion) continue;
    const key = `${topic.toLowerCase()}|${discussion.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ topic: topic || 'Discussion', discussion });
    if (result.length >= maxItems) break;
  }
  return result;
};

const cleanActionItems = (value: unknown, maxItems = 50): ActionItem[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ActionItem[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const task = cleanText(item, 500);
      if (task && !seen.has(task.toLowerCase())) {
        seen.add(task.toLowerCase());
        result.push({ task, assignee: '', deadline: '', status: 'pending' });
      }
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const task = cleanText(row.task ?? row.action ?? row.description ?? row.title, 500);
    if (!task) continue;
    const assignee = cleanText(row.assignee ?? row.owner ?? row.who, 120);
    const deadline = cleanText(row.deadline ?? row.due ?? row.due_date, 120);
    const status = row.status === 'done' || row.completed === true ? 'done' : 'pending';
    const key = `${task.toLowerCase()}|${assignee.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ task, assignee, deadline, status });
    if (result.length >= maxItems) break;
  }
  return result;
};

export const normalizeNotes = (raw: unknown): MeetingNotes => {
  if (!raw || typeof raw !== 'object') return emptyNotes();
  const data = raw as Record<string, unknown>;
  return {
    title: cleanText(data.title, 140),
    summary: cleanMultiline(data.summary ?? data.overview, 6000),
    key_topics: cleanTopics(data.key_topics ?? data.topics),
    decisions: cleanStringList(data.decisions),
    action_items: cleanActionItems(data.action_items ?? data.actions ?? data.tasks),
    important_dates: cleanStringList(data.important_dates ?? data.dates ?? data.deadlines),
    issues: cleanStringList(data.issues ?? data.risks ?? data.blockers),
    unresolved_questions: cleanStringList(
      data.unresolved_questions ?? data.open_questions ?? data.questions,
    ),
    key_points: cleanStringList(data.key_points ?? data.highlights ?? data.notes),
  };
};

export const isNotesEmpty = (notes: MeetingNotes | null | undefined): boolean => {
  if (!notes) return true;
  return (
    !notes.summary &&
    notes.key_topics.length === 0 &&
    notes.decisions.length === 0 &&
    notes.action_items.length === 0 &&
    notes.important_dates.length === 0 &&
    notes.issues.length === 0 &&
    notes.unresolved_questions.length === 0 &&
    notes.key_points.length === 0
  );
};

export const deadlinesOf = (
  notes: MeetingNotes,
): Array<{ deadline: string; task: string }> => {
  const seen = new Set<string>();
  const out: Array<{ deadline: string; task: string }> = [];
  const push = (deadline: string, task: string): void => {
    const key = `${deadline.toLowerCase()}|${task.toLowerCase()}`;
    if (!deadline || seen.has(key)) return;
    seen.add(key);
    out.push({ deadline, task });
  };
  for (const item of notes.action_items) {
    if (item.deadline) {
      push(
        item.deadline,
        item.assignee ? `${item.task} (${item.assignee})` : item.task,
      );
    }
  }
  for (const raw of notes.important_dates) {
    const dash = raw.match(/^([^—–:-]{2,60})\s*[—–:-]\s*(.+)$/);
    if (dash) push(dash[1].trim(), dash[2].trim());
    else push(raw, 'Mentioned in lecture/meeting');
  }
  return out;
};

export interface NotesMeta {
  title: string;
  recordedAt?: string;
  durationSeconds?: number;
}

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hours}h ${rem}m`;
  }
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

export const notesToMarkdown = (notes: MeetingNotes, meta: NotesMeta): string => {
  const heading = notes.title || meta.title || 'Meeting Notes';
  const lines: string[] = [`# ${heading}`];

  const metaParts: string[] = [];
  if (meta.recordedAt) {
    const date = new Date(meta.recordedAt);
    if (!Number.isNaN(date.getTime())) {
      metaParts.push(
        date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
      );
    }
  }
  const dur = formatDuration(meta.durationSeconds);
  if (dur) metaParts.push(dur);
  if (metaParts.length) lines.push(`_${metaParts.join(' · ')}_`);
  lines.push('');

  if (notes.summary) {
    lines.push('## Summary', '', notes.summary, '');
  }

  if (notes.key_topics.length) {
    lines.push('## Key Topics', '');
    for (const topic of notes.key_topics) {
      lines.push(
        `- **${topic.topic}**${topic.discussion ? ` — ${topic.discussion}` : ''}`,
      );
    }
    lines.push('');
  }

  if (notes.decisions.length) {
    lines.push('## Decisions', '');
    for (const item of notes.decisions) lines.push(`- ${item}`);
    lines.push('');
  }

  if (notes.action_items.length) {
    lines.push('## Action Items', '');
    for (const item of notes.action_items) {
      const box = item.status === 'done' ? '[x]' : '[ ]';
      const who = item.assignee ? ` (${item.assignee})` : '';
      const due = item.deadline ? ` — due ${item.deadline}` : '';
      lines.push(`- ${box} ${item.task}${who}${due}`);
    }
    lines.push('');
  }

  const deadlines = deadlinesOf(notes);
  if (deadlines.length) {
    lines.push('## Deadlines & Important Dates', '');
    for (const d of deadlines) lines.push(`- **${d.deadline}:** ${d.task}`);
    lines.push('');
  }

  if (notes.issues.length) {
    lines.push('## Issues Raised', '');
    for (const item of notes.issues) lines.push(`- ${item}`);
    lines.push('');
  }

  if (notes.unresolved_questions.length) {
    lines.push('## Unresolved Questions', '');
    for (const item of notes.unresolved_questions) lines.push(`- ${item}`);
    lines.push('');
  }

  if (notes.key_points.length) {
    lines.push('## Key Points', '');
    for (const item of notes.key_points) lines.push(`- ${item}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
};
