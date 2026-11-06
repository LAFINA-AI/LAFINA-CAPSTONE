import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import type { Task, Event } from '../../../../storage';
import { db, deliveryStore, tasksStore, remindersStore } from '../../../../storage';
import type { Reminder } from '../../../../storage';
import { remindersForSource } from '../../../../storage/sourceReminders';
import { ScheduleItemForm, ScheduleItemModalState } from '../types';
import { generateId } from '../../../../utils';
import {
  cancelReminderAlarm,
  finishNativeIncomingCall,
  getReminderPreferences,
  scheduleReminderAlarm,
} from '../../../../scheduler';
import { formatLocalDate } from '../utils/calendarHelpers';
import {
  checkEventWallTime,
  deviceTimeZone,
  isEventTimeError,
  resolveEventZoneTiming,
} from '../../../../storage/eventTime';
import type { EventFolds } from '../../../../storage/eventTime';

interface UseScheduleItemModalOptions {
  userId: string;
  selectedDate: Date;
  onSaved: () => void;
  onRefresh: () => void;
}

const defaultForm = (): ScheduleItemForm => ({
  title: '',
  time: '12:00',
  endTime: '13:00',
  priority: 'Medium',
  category: 'Work',
  location: '',
  notes: '',
  recurrenceRule: null,
});

type Priority = 'High' | 'Medium' | 'Low';

/** Reminder states the form replaces or removes together with their item. */
const LIVE_REMINDER_STATUSES = ['pending', 'snoozed', 'triggered'] as const;

/**
 * The reminders that belong to one Calendar item: its exact links, plus older
 * unlinked reminders only under the strict evidence rule (same title and the
 * item's own due time, with no other item qualifying). Another item's or a
 * standalone reminder that merely shares the title is never touched.
 */
const ownReminderIds = (
  userId: string,
  type: 'task' | 'event',
  item: Pick<Task | Event, 'id' | 'title'>,
): string[] => {
  try {
    return remindersForSource(db, userId, type, item.id, item.title, LIVE_REMINDER_STATUSES).map(
      (row) => row.id,
    );
  } catch (err) {
    console.warn('[Calendar] Could not read the reminders of this item:', err);
    return [];
  }
};

const retireReminder = (reminderId: string): void => {
  remindersStore.deleteReminder(reminderId);
  void cancelReminderAlarm(reminderId);
  void finishNativeIncomingCall(reminderId);
};

export const useScheduleItemModal = (options: UseScheduleItemModalOptions): ScheduleItemModalState => {
  const { userId, selectedDate, onSaved, onRefresh } = options;
  const [visible, setVisible] = useState(false);
  const [modalType, setModalType] = useState<'task' | 'event'>('task');
  const [editingItem, setEditingItem] = useState<Task | Event | null>(null);
  const [form, setForm] = useState<ScheduleItemForm>(defaultForm());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const updateField = useCallback(<K extends keyof ScheduleItemForm>(key: K, value: ScheduleItemForm[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'time') {
        const startStr = value as string;
        const [h, m] = startStr.split(':').map(Number);
        const date = new Date();
        date.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
        date.setHours(date.getHours() + 1);
        const nextH = date.getHours().toString().padStart(2, '0');
        const nextM = date.getMinutes().toString().padStart(2, '0');
        next.endTime = `${nextH}:${nextM}`;
      }
      return next;
    });
  }, []);

  const openNew = useCallback((type: 'task' | 'event') => {
    setModalType(type);
    setEditingItem(null);
    setForm(defaultForm());
    setVisible(true);
  }, []);

  const openEdit = useCallback((item: Task | Event, type: 'task' | 'event') => {
    setModalType(type);
    setEditingItem(item);
    setForm({
      title: item.title,
      // The item's own date (AGY-PORT 06): editing an overdue or other-day item
      // from a chip must not move its reminder to the day currently selected.
      date: (type === 'task' ? (item as Task).dueDate : (item as Event).date) || undefined,
      time: type === 'task' ? (item as Task).dueTime || '12:00' : (item as Event).startTime,
      endTime: type === 'event' ? (item as Event).endTime : '13:00',
      priority: type === 'task' ? (item as Task).priority || 'Medium' : 'Medium',
      category: type === 'task' ? (item as Task).category || 'Work' : 'Work',
      location: type === 'event' ? (item as Event).location || '' : '',
      notes: type === 'task' ? (item as Task).notes || '' : '',
      recurrenceRule: item.recurrenceRule || null,
    });
    setVisible(true);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const save = useCallback((recurrenceRule?: string | null, folds: EventFolds = {}) => {
    if (!form.title.trim()) {
      Alert.alert('Error', 'Please enter a title.');
      return;
    }

    const dateStr = form.date || formatLocalDate(selectedDate);
    const rule = recurrenceRule !== undefined ? recurrenceRule : (form.recurrenceRule || null);

    // Events (AGY-PORT 08): an end before the start ends the next day; an equal
    // start and end, a time the clocks skip, or a repeated time with no choice
    // is refused here rather than moved. Only a new or changed time is checked,
    // so a legacy event whose time is untouched saves as before.
    let eventStartAt: string | null = null;
    if (modalType === 'event') {
      const wall = { date: dateStr, startTime: form.time, endTime: form.endTime };
      const current = editingItem as Event | null;
      const wallChanged =
        !current ||
        current.date !== wall.date ||
        current.startTime !== wall.startTime ||
        current.endTime !== wall.endTime;
      if (wallChanged) {
        const check = checkEventWallTime(wall);
        if (!check.ok) {
          Alert.alert('Invalid Time Range', check.message);
          return;
        }
        const zone = deviceTimeZone();
        if (zone) {
          try {
            eventStartAt = resolveEventZoneTiming(wall, zone, folds).startAt;
          } catch (error) {
            // Not a time problem (an engine failure): save floating, as before.
            if (!isEventTimeError(error)) {
              console.warn('[Calendar] Could not resolve the event timezone:', error);
            } else if (error.problem === 'ambiguous' && error.which) {
              const key = error.which === 'start' ? 'startFold' : 'endFold';
              Alert.alert('Repeated time', error.message, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Earlier', onPress: () => save(recurrenceRule, { ...folds, [key]: 'earlier' }) },
                { text: 'Later', onPress: () => save(recurrenceRule, { ...folds, [key]: 'later' }) },
              ]);
            } else {
              Alert.alert('Invalid Time Range', error.message);
            }
            if (isEventTimeError(error)) return;
          }
        }
      }
    }

    // Read before the item changes: the evidence rule uses the item's current
    // title and time.
    const replacedReminderIds = editingItem ? ownReminderIds(userId, modalType, editingItem) : [];

    const syncReminder = (
      title: string,
      date: string,
      time: string,
      sourceId: string,
      exactStartAt: string | null = null,
    ) => {
      try {
        const prefs = getReminderPreferences(userId);
        const leadTimeMinutes = prefs.leadTimeMinutes;
        // The exact instant when the event's time was resolved in this device's
        // timezone (so a repeated time uses the chosen one), else as before.
        const localScheduledDate = exactStartAt
          ? new Date(exactStartAt)
          : new Date(`${date}T${time}:00`);
        if (isNaN(localScheduledDate.getTime())) return;

        // Replace only this item's own reminders, so it never has duplicate or zombie alarms.
        for (const oldId of replacedReminderIds) retireReminder(oldId);
        // An item whose time has already passed gets no new call (it used to ring
        // one second after saving).
        if (localScheduledDate.getTime() <= Date.now()) return;

        const scheduledAt = localScheduledDate.toISOString();
        const preferredTriggerMs =
          localScheduledDate.getTime() - leadTimeMinutes * 60 * 1000;
        const triggerAt = new Date(
          Math.max(preferredTriggerMs, Date.now() + 1000),
        ).toISOString();

        const reminderId = generateId('rem');
        const reminder: Omit<Reminder, 'createdAt' | 'updatedAt' | 'deletedAt' | 'snoozeCount'> = {
          id: reminderId,
          userId,
          task: title,
          description: 'Scheduled reminder',
          scheduledAt,
          triggerAt,
          status: 'pending',
          preCastAudioPath: null,
        };
        // The reminder and its exact link to this item commit together.
        db.transactionSync((tx) => {
          remindersStore.insertReminder(reminder, tx);
          deliveryStore.linkSource(reminderId, modalType, sourceId, tx);
        });

        void scheduleReminderAlarm(reminderId, title, triggerAt).catch((err) => {
          console.error('[Calendar] Failed to schedule reminder alarm:', err);
        });
      } catch (err) {
        console.error('[Calendar] Failed to create auto-reminder:', err);
      }
    };

    if (modalType === 'task') {
      if (editingItem) {
        tasksStore.updateTask({
          id: editingItem.id,
          title: form.title,
          dueTime: form.time,
          priority: form.priority as Priority,
          category: form.category,
          notes: form.notes,
          recurrenceRule: rule,
        });
        // A task with no due date keeps no reminder (same rule as reviewed commands).
        if ((editingItem as Task).dueDate) {
          syncReminder(form.title, dateStr, form.time, editingItem.id);
        } else {
          for (const oldId of replacedReminderIds) retireReminder(oldId);
        }
      } else {
        const taskId = generateId('task');
        tasksStore.insertTask({
          id: taskId,
          userId,
          title: form.title,
          dueDate: dateStr,
          dueTime: form.time,
          isCompleted: false,
          priority: form.priority as Priority,
          category: form.category,
          notes: form.notes,
          recurrenceRule: rule,
        });
        syncReminder(form.title, dateStr, form.time, taskId);
      }
    } else {
      if (editingItem) {
        tasksStore.updateEvent({
          id: editingItem.id,
          title: form.title,
          date: dateStr,
          startTime: form.time,
          endTime: form.endTime,
          location: form.location,
          recurrenceRule: rule,
        }, undefined, folds);
        syncReminder(form.title, dateStr, form.time, editingItem.id, eventStartAt);
      } else {
        const eventId = generateId('event');
        tasksStore.insertEvent({
          id: eventId,
          userId,
          title: form.title,
          date: dateStr,
          startTime: form.time,
          endTime: form.endTime,
          location: form.location,
          recurrenceRule: rule,
        }, undefined, folds);
        syncReminder(form.title, dateStr, form.time, eventId, eventStartAt);
      }
    }

    setVisible(false);
    onSaved();
    onRefresh();
  }, [form, modalType, editingItem, selectedDate, userId, onSaved, onRefresh]);

  const handleDelete = useCallback((id: string, type: 'task' | 'event') => {
    Alert.alert(`Delete ${type === 'task' ? 'Task' : 'Event'}`, `Are you sure?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Read this item's own reminders before it is deleted (the evidence
          // rule needs its title and time), then remove exactly those.
          const ownIds = ownReminderIds(userId, type, { id, title: editingItem?.title || '' });
          if (type === 'task') tasksStore.deleteTask(id);
          else tasksStore.deleteEvent(id);
          // The store cascade already removed pending and snoozed ones; retire the rest.
          const stillLive = new Set(remindersStore.getPendingReminders(userId).map((r) => r.id));
          for (const oldId of ownIds) if (stillLive.has(oldId)) retireReminder(oldId);

          setVisible(false);
          onSaved();
          onRefresh();
        },
      },
    ]);
  }, [editingItem, onSaved, onRefresh, userId]);

  return {
    visible,
    modalType,
    editingItem,
    form,
    showTimePicker,
    showEndTimePicker,
    openNew,
    openEdit,
    close,
    updateField,
    save,
    delete: handleDelete,
    setShowTimePicker,
    setShowEndTimePicker,
  };
};
