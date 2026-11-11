import {useState, useEffect, useCallback, useMemo} from 'react';
import {Alert} from 'react-native';
import type {Task, Reminder} from '../../../../storage';
import {
  db,
  deliveryStore,
  isNoteEditConflict,
  notesEditStore,
  notesStore,
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

export const useTodoData = ({
  userId,
  refreshTrigger,
  searchQuery,
  onRefresh,
}: UseTodoDataOptions) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [noteChecklists, setNoteChecklists] = useState<NoteChecklistTodoItem[]>(
    [],
  );
  const [filter, setFilter] = useState<TodoFilterType>('open');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] =
    useState<Task['priority']>('Medium');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(
    null,
  );

  const loadTodos = useCallback(() => {
    try {
      const allTasks = tasksStore.getAllTasks(userId);
      setTasks(allTasks);
    } catch (err) {
      console.error('[To-Do] Failed to load tasks:', err);
      setTasks([]);
    }

    try {
      const notes = notesStore.getAll(userId);
      const extracted: NoteChecklistTodoItem[] = [];
      for (const note of notes) {
        const items = extractChecklistItems(note.body);
        items.forEach((item, checklistIndex) => {
          if (!item.text) return;
          extracted.push({
            id: `${note.id}::${checklistIndex}`,
            noteId: note.id,
            noteTitle: note.title || 'Untitled Note',
            noteCategory: note.category || 'Personal',
            checklistIndex,
            text: item.text,
            done: item.done,
          });
        });
      }
      setNoteChecklists(extracted);
    } catch (err) {
      console.error('[To-Do] Failed to extract note checklists:', err);
      setNoteChecklists([]);
    }
  }, [userId]);

  useEffect(() => {
    setHighlightedTaskId(null);
    setEditorVisible(false);
    setEditingTask(null);
    setQuickTitle('');
    setQuickPriority('Medium');
  }, [userId]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos, refreshTrigger]);

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
    const openTaskCount = tasks.filter(t => !t.isCompleted).length;
    const openChecklistCount = noteChecklists.filter(c => !c.done).length;
    return openTaskCount + openChecklistCount;
  }, [tasks, noteChecklists]);

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
