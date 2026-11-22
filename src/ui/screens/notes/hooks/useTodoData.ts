import {mapRowToTask} from '../../../../storage/tasksStore';
import {escapeLike} from '../../../../storage/notesQueryStore';
import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {Alert} from 'react-native';
import type {Task, Reminder} from '../../../../storage';
import {
  db,
  deliveryStore,
  isNoteEditConflict,
  notesEditStore,
  remindersStore,
  tasksStore,
} from '../../../../storage';
import {remindersForSource} from '../../../../storage/sourceReminders';
import {
  cancelReminderAlarm,
  finishNativeIncomingCall,
  getReminderPreferences,
  scheduleReminderAlarm,
} from '../../../../scheduler';
import {
  extractChecklistItems,
  generateId,
  toggleChecklistItem,
} from '../../../../utils';
import type {TodoFilterType} from '../types';

export interface NoteChecklistTodoItem {
  id: string;
  noteId: string;
  noteTitle: string;
  noteCategory: string;
  checklistIndex: number;
  text: string;
  done: boolean;
}

export interface TodoDraftInput {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: Task['priority'];
  category: string;
  notes?: string;
}

interface UseTodoDataOptions {
  userId: string;
  refreshTrigger: number;
  searchQuery: string;
  onRefresh: () => void;
  enabled?: boolean;
}

const LIVE_REMINDER_STATUSES = ['pending', 'snoozed', 'triggered'] as const;

const PRIORITY_RANK: Record<Task['priority'], number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export const toLocalYmd = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const retireTaskReminders = (
  userId: string,
  task: Pick<Task, 'id' | 'title'>,
): void => {
  try {
    const ids = remindersForSource(
      db,
      userId,
      'task',
      task.id,
      task.title,
      LIVE_REMINDER_STATUSES,
    ).map(r => r.id);
    for (const id of ids) {
      remindersStore.deleteReminder(id);
      void cancelReminderAlarm(id);
      void finishNativeIncomingCall(id);
    }
  } catch (err) {
    console.warn('[To-Do] Could not retire linked reminders:', err);
  }
};

const scheduleTaskReminder = (
  userId: string,
  taskId: string,
  title: string,
  dueDate: string | null,
  dueTime: string | null,
): void => {
  if (!dueDate || !dueTime) return;
  try {
    const scheduledDate = new Date(`${dueDate}T${dueTime}:00`);
    if (
      Number.isNaN(scheduledDate.getTime()) ||
      scheduledDate.getTime() <= Date.now()
    ) {
      return;
    }
    const prefs = getReminderPreferences(userId);
    const triggerMs =
      scheduledDate.getTime() - prefs.leadTimeMinutes * 60 * 1000;
    const triggerAt = new Date(
      Math.max(triggerMs, Date.now() + 1000),
    ).toISOString();
    const reminderId = generateId('rem');
    const reminder: Omit<
      Reminder,
      'createdAt' | 'updatedAt' | 'deletedAt' | 'snoozeCount'
    > = {
      id: reminderId,
      userId,
      task: title,
      description: 'To-Do reminder',
      scheduledAt: scheduledDate.toISOString(),
      triggerAt,
      status: 'pending',
      preCastAudioPath: null,
    };
    db.transactionSync(tx => {
      remindersStore.insertReminder(reminder, tx);
      deliveryStore.linkSource(reminderId, 'task', taskId, tx);
    });
    void scheduleReminderAlarm(reminderId, title, triggerAt).catch(err => {
      console.warn('[To-Do] Failed to schedule reminder alarm:', err);
    });
  } catch (err) {
    console.warn('[To-Do] Failed to prepare reminder:', err);
  }
};

interface CachedChecklistEntry {
  revision: number;
  updatedAt: string;
  title: string;
  items: NoteChecklistTodoItem[];
}

const checklistCachesByUser = new Map<
  string,
  Map<string, CachedChecklistEntry>
>();

const getChecklistCacheForUser = (
  userId: string,
): Map<string, CachedChecklistEntry> => {
  let cache = checklistCachesByUser.get(userId);
  if (!cache) {
    cache = new Map();
    if (checklistCachesByUser.size >= 8) {
      const oldest = checklistCachesByUser.keys().next().value;
      if (oldest !== undefined) checklistCachesByUser.delete(oldest);
    }
    checklistCachesByUser.set(userId, cache);
  }
  return cache;
};

export const useTodoData = ({
  userId,
  refreshTrigger,
  searchQuery,
  onRefresh,
  enabled = true,
}: UseTodoDataOptions) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [noteChecklists, setNoteChecklists] = useState<NoteChecklistTodoItem[]>(
    [],
  );
  const [filter, setFilter] = useState<TodoFilterType>('open');
  const [taskLimit, setTaskLimit] = useState(100);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] =
    useState<Task['priority']>('Medium');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(
    null,
  );

  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openTaskCount, setOpenTaskCount] = useState(0);
  const loadedKey = useRef('');
  const cancelScan = useCallback(() => {
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = null;
  }, []);
  const loadTodos = useCallback(() => {
    cancelScan();
    const revision = db.getDataRevision(['tasks', 'notes']);
    const key = `${userId}:${revision}:${enabled}:${filter}:${searchQuery}:${taskLimit}`;
    if (loadedKey.current === key) return;
    try {
      setOpenTaskCount(
        Number(
          db.executeSync(
            'SELECT COUNT(*) AS count FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND is_completed = 0',
            [userId],
          ).rows[0]?.count ?? 0,
        ),
      );
      // Notes needs the badge, not every task body and its sorted lists.
      if (enabled) {
        let where = 'user_id = ? AND deleted_at IS NULL';
        const parameters: unknown[] = [userId];
        if (filter === 'undated')
          where +=
            " AND is_completed = 0 AND (due_date IS NULL OR due_date = '')";
        if (filter === 'scheduled')
          where +=
            " AND is_completed = 0 AND due_date IS NOT NULL AND due_date <> ''";
        if (filter === 'completed') where += ' AND is_completed = 1';
        if (searchQuery.trim()) {
          where +=
            " AND (lower(title) LIKE ? ESCAPE '\\' OR lower(COALESCE(notes, '')) LIKE ? ESCAPE '\\' OR lower(category) LIKE ? ESCAPE '\\')";
          const pattern = `%${escapeLike(searchQuery.trim().toLowerCase())}%`;
          parameters.push(pattern, pattern, pattern);
        }
        const rows = db.executeSync(
          `SELECT * FROM tasks WHERE ${where} ORDER BY is_completed,
            CASE WHEN due_date IS NULL OR due_date = '' THEN 0 ELSE 1 END,
            CASE WHEN due_date IS NULL OR due_date = '' THEN CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END END,
            CASE WHEN is_completed = 1 OR due_date IS NULL OR due_date = '' THEN updated_at END DESC,
            CASE WHEN is_completed = 0 THEN due_date END,
            CASE WHEN is_completed = 0 THEN due_time END,
            CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, id LIMIT ?`,
          [...parameters, taskLimit + 1],
        ).rows;
        setTasks(rows.slice(0, taskLimit).map(mapRowToTask));
        setHasMoreTasks(rows.length > taskLimit);
      }
      const checklistCache = getChecklistCacheForUser(userId);
      const metadata = db.executeSync(
        `SELECT n.id, n.updated_at, n.title, COALESCE(r.revision, 0) AS revision
        FROM notes n LEFT JOIN entity_local_revisions r ON r.entity_type = 'note' AND r.entity_id = n.id
        WHERE n.user_id = ? AND n.deleted_at IS NULL ORDER BY n.id`,
        [userId],
      ).rows;
      const liveIds = new Set(metadata.map(row => String(row.id)));
      for (const id of checklistCache.keys())
        if (!liveIds.has(id)) checklistCache.delete(id);
      const stale = metadata.filter(row => {
        const cached = checklistCache.get(String(row.id));
        return (
          !cached ||
          cached.revision !== Number(row.revision) ||
          cached.updatedAt !== String(row.updated_at ?? '') ||
          cached.title !== String(row.title ?? '')
        );
      });
      const publish = () =>
        setNoteChecklists(
          Array.from(checklistCache.values()).flatMap(entry => entry.items),
        );
      if (stale.length === 0) {
        publish();
        loadedKey.current = key;
        setChecklistsLoading(false);
        return;
      }
      setChecklistsLoading(stale.length > 8);
      let offset = 0;
      const batch = () => {
        try {
          // Yield between small batches; unchanged bodies are never read/parsed again.
          for (const row of stale.slice(offset, offset + 8)) {
            const note = db.executeSync(
              'SELECT title, category, body, updated_at FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
              [row.id, userId],
            ).rows[0];
            if (!note) continue;
            const noteId = String(row.id);
            const items = extractChecklistItems(
              String(note.body ?? ''),
            ).flatMap((item, checklistIndex) =>
              item.text
                ? [
                    {
                      id: `${noteId}::${checklistIndex}`,
                      noteId,
                      noteTitle: String(note.title || 'Untitled Note'),
                      noteCategory: String(note.category || 'Personal'),
                      checklistIndex,
                      text: item.text,
                      done: item.done,
                    },
                  ]
                : [],
            );
            checklistCache.set(noteId, {
              revision: Number(row.revision),
              updatedAt: String(note.updated_at ?? row.updated_at ?? ''),
              title: String(note.title ?? row.title ?? ''),
              items,
            });
          }
          offset += 8;
          publish();
          if (offset < stale.length) scanTimer.current = setTimeout(batch, 16);
          else {
            scanTimer.current = null;
            loadedKey.current = key;
            setChecklistsLoading(false);
          }
        } catch (error) {
          loadedKey.current = '';
          scanTimer.current = null;
          setChecklistsLoading(false);
          console.error('[To-Do] Could not read checklist batch:', error);
        }
      };
      batch();
    } catch (err) {
      loadedKey.current = '';
      console.error('[To-Do] Could not load local items:', err);
    }
  }, [userId, enabled, filter, searchQuery, taskLimit, cancelScan]);
  useEffect(() => cancelScan, [cancelScan]);

  const checklistOwner = useRef(userId);
  useEffect(() => {
    if (checklistOwner.current === userId) return;
    checklistOwner.current = userId;
    loadedKey.current = '';
    setHighlightedTaskId(null);
    setEditorVisible(false);
    setEditingTask(null);
    setQuickTitle('');
    setQuickPriority('Medium');
  }, [userId]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos, refreshTrigger]);

  useEffect(() => {
    setTaskLimit(100);
  }, [userId, filter, searchQuery]);
  const query = searchQuery.trim().toLowerCase();

  const matchesTaskQuery = useCallback(
    (task: Task) => {
      if (!query) return true;
      return (
        task.title.toLowerCase().includes(query) ||
        (task.notes || '').toLowerCase().includes(query) ||
        (task.category || '').toLowerCase().includes(query)
      );
    },
    [query],
  );

  const undatedOpen = useMemo(() => {
    return tasks
      .filter(t => !t.isCompleted && !t.dueDate && matchesTaskQuery(t))
      .sort((a, b) => {
        const prioDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (prioDiff !== 0) return prioDiff;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
  }, [tasks, matchesTaskQuery]);

  const scheduledOpen = useMemo(() => {
    return tasks
      .filter(t => !t.isCompleted && Boolean(t.dueDate) && matchesTaskQuery(t))
      .sort((a, b) => {
        const dateDiff = (a.dueDate || '9999-99-99').localeCompare(
          b.dueDate || '9999-99-99',
        );
        if (dateDiff !== 0) return dateDiff;
        const timeDiff = (a.dueTime || '23:59').localeCompare(
          b.dueTime || '23:59',
        );
        if (timeDiff !== 0) return timeDiff;
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      });
  }, [tasks, matchesTaskQuery]);

  const completedTasks = useMemo(() => {
    return tasks
      .filter(t => t.isCompleted && matchesTaskQuery(t))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [tasks, matchesTaskQuery]);

  const filteredNoteChecklists = useMemo(() => {
    return noteChecklists.filter(item => {
      if (filter !== 'checklists' && item.done) return false;
      if (!query) return true;
      return (
        item.text.toLowerCase().includes(query) ||
        item.noteTitle.toLowerCase().includes(query) ||
        item.noteCategory.toLowerCase().includes(query)
      );
    });
  }, [noteChecklists, filter, query]);

  const pendingCount = useMemo(() => {
    const openChecklistCount = noteChecklists.filter(c => !c.done).length;
    return openTaskCount + openChecklistCount;
  }, [openTaskCount, noteChecklists]);

  const addTodo = useCallback(
    (input: TodoDraftInput) => {
      const title = input.title.trim();
      if (!title) return null;
      const taskId = generateId('task');
      tasksStore.insertTask({
        id: taskId,
        userId,
        title,
        dueDate: input.dueDate || null,
        dueTime: input.dueDate ? input.dueTime || null : null,
        isCompleted: false,
        priority: input.priority || 'Medium',
        category: (input.category ?? '').trim(),
        notes: input.notes?.trim() || '',
        recurrenceRule: null,
      });
      if (input.dueDate && input.dueTime) {
        scheduleTaskReminder(
          userId,
          taskId,
          title,
          input.dueDate,
          input.dueTime,
        );
      }
      loadTodos();
      onRefresh();
      return taskId;
    },
    [userId, loadTodos, onRefresh],
  );

  const submitQuickAdd = useCallback(() => {
    const trimmed = quickTitle.trim();
    if (!trimmed) return;
    addTodo({
      title: trimmed,
      dueDate: null,
      dueTime: null,
      priority: quickPriority,
      category: '',
      notes: '',
    });
    setQuickTitle('');
    setQuickPriority('Medium');
  }, [quickTitle, quickPriority, addTodo]);

  const updateTodo = useCallback(
    (task: Task, input: TodoDraftInput) => {
      const title = input.title.trim();
      if (!title) return;
      retireTaskReminders(userId, task);
      const cleanDate = input.dueDate || null;
      const cleanTime = cleanDate ? input.dueTime || null : null;
      tasksStore.updateTask({
        id: task.id,
        title,
        dueDate: cleanDate,
        dueTime: cleanTime,
        priority: input.priority,
        category: (input.category ?? '').trim(),
        notes: input.notes?.trim() || '',
      });
      if (!task.isCompleted && cleanDate && cleanTime) {
        scheduleTaskReminder(userId, task.id, title, cleanDate, cleanTime);
      }
      loadTodos();
      onRefresh();
    },
    [userId, loadTodos, onRefresh],
  );

  const toggleTodo = useCallback(
    (task: Task) => {
      const nextCompleted = !task.isCompleted;
      let ownReminderIds: string[] = [];
      if (nextCompleted) {
        try {
          ownReminderIds = remindersForSource(
            db,
            userId,
            'task',
            task.id,
            task.title,
            LIVE_REMINDER_STATUSES,
          ).map(r => r.id);
        } catch {
          ownReminderIds = [];
        }
      }
      tasksStore.updateTask({
        id: task.id,
        isCompleted: nextCompleted,
      });
      if (nextCompleted) {
        for (const remId of ownReminderIds) {
          void cancelReminderAlarm(remId);
          void finishNativeIncomingCall(remId);
        }
      } else if (task.dueDate && task.dueTime) {
        scheduleTaskReminder(
          userId,
          task.id,
          task.title,
          task.dueDate,
          task.dueTime,
        );
      }
      loadTodos();
      onRefresh();
    },
    [userId, loadTodos, onRefresh],
  );

  const deleteTodo = useCallback(
    (task: Task) => {
      let ownReminderIds: string[] = [];
      try {
        ownReminderIds = remindersForSource(
          db,
          userId,
          'task',
          task.id,
          task.title,
          LIVE_REMINDER_STATUSES,
        ).map(r => r.id);
      } catch {
        ownReminderIds = [];
      }
      tasksStore.deleteTask(task.id);
      for (const remId of ownReminderIds) {
        void cancelReminderAlarm(remId);
        void finishNativeIncomingCall(remId);
      }
      loadTodos();
      onRefresh();
    },
    [userId, loadTodos, onRefresh],
  );

  const toggleNoteChecklistItem = useCallback(
    (item: NoteChecklistTodoItem) => {
      const snapshot = notesEditStore.getSnapshot(userId, item.noteId);
      if (!snapshot) {
        loadTodos();
        Alert.alert('Note unavailable', 'This note is no longer available.');
        return;
      }
      const nextBody = toggleChecklistItem(snapshot.body, item.checklistIndex);
      if (nextBody === snapshot.body) return;
      try {
        notesEditStore.save(
          {
            id: snapshot.id,
            userId: snapshot.userId,
            revision: snapshot.revision,
          },
          {body: nextBody},
        );
      } catch (error) {
        loadTodos();
        Alert.alert(
          isNoteEditConflict(error)
            ? 'Note changed elsewhere'
            : 'Checklist not saved',
          isNoteEditConflict(error)
            ? 'The latest version is loaded now. Tap the checkbox again to save.'
            : 'Please try again.',
        );
        return;
      }
      loadTodos();
      onRefresh();
    },
    [userId, loadTodos, onRefresh],
  );

  const openNewTodo = useCallback(() => {
    setEditingTask(null);
    setEditorVisible(true);
  }, []);

  const openEditTodo = useCallback((task: Task) => {
    setEditingTask(task);
    setEditorVisible(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorVisible(false);
    setEditingTask(null);
  }, []);

  return {
    checklistsLoading,
    hasMoreTasks,
    loadMoreTasks: () => setTaskLimit(limit => limit + 100),
    tasks,
    undatedOpen,
    scheduledOpen,
    completedTasks,
    noteChecklists: filteredNoteChecklists,
    allNoteChecklistCount: noteChecklists.filter(c => !c.done).length,
    pendingCount,
    filter,
    setFilter,
    quickTitle,
    setQuickTitle,
    quickPriority,
    setQuickPriority,
    submitQuickAdd,
    editorVisible,
    editingTask,
    highlightedTaskId,
    setHighlightedTaskId,
    openNewTodo,
    openEditTodo,
    closeEditor,
    addTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    toggleNoteChecklistItem,
    loadTodos,
  };
};
