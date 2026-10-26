import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { Colors } from '../../../theme';
import type { TimeBlock } from '../../../../storage';
import { timeBlocksStore } from '../../../../storage';
import { TimeBlockForm, TimeBlockModalState } from '../types';
import { generateId } from '../../../../utils';
import { formatLocalDate } from '../utils/calendarHelpers';

interface UseTimeBlockModalOptions {
  userId: string;
  selectedDate: Date;
  onSaved: () => void;
  onRefresh: () => void;
  resetForm?: () => TimeBlockForm;
}

const defaultForm = (initialDate?: Date): TimeBlockForm => ({
  title: '',
  date: formatLocalDate(initialDate || new Date()),
  startTime: '09:00',
  endTime: '10:00',
  category: 'Academic',
  color: Colors.blue,
  notes: '',
  recurrenceRule: null,
});

export const useTimeBlockModal = (options: UseTimeBlockModalOptions): TimeBlockModalState => {
  const { userId, selectedDate, onSaved, onRefresh } = options;
  const [visible, setVisible] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [form, setForm] = useState<TimeBlockForm>(defaultForm(selectedDate));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const updateField = useCallback(<K extends keyof TimeBlockForm>(key: K, value: TimeBlockForm[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'startTime') {
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

  const openNewBlock = useCallback((initialHour?: number, targetDate?: Date) => {
    setEditingBlock(null);
    const dateToUse = targetDate || selectedDate;
    const startH = initialHour !== undefined ? initialHour : 9;
    const endH = (startH + 1) % 24;
    setForm({
      ...defaultForm(dateToUse),
      date: formatLocalDate(dateToUse),
      startTime: `${String(startH).padStart(2, '0')}:00`,
      endTime: `${String(endH).padStart(2, '0')}:00`,
    });
    setVisible(true);
  }, [selectedDate]);

  const openEditBlock = useCallback((block: TimeBlock) => {
    setEditingBlock(block);
    setForm({
      title: block.title,
      date: block.date,
      startTime: block.startTime,
      endTime: block.endTime,
      category: block.category,
      color: block.color,
      notes: block.notes || '',
      recurrenceRule: block.recurrenceRule || null,
    });
    setVisible(true);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const save = useCallback((recurrenceRule?: string | null) => {
    if (!form.title.trim()) {
      Alert.alert('Error', 'Please enter a title.');
      return;
    }
    if (form.startTime > form.endTime) {
      Alert.alert('Invalid Time Range', 'Start time cannot be after end time.');
      return;
    }

    const dateStr = form.date || formatLocalDate(selectedDate);
    const rule = recurrenceRule !== undefined ? recurrenceRule : (form.recurrenceRule || null);

    if (editingBlock) {
      timeBlocksStore.update({
        id: editingBlock.id,
        title: form.title.trim(),
        date: dateStr,
        startTime: form.startTime,
        endTime: form.endTime,
        color: form.color,
        category: form.category,
        notes: form.notes,
        recurrenceRule: rule,
      });
    } else {
      timeBlocksStore.insert({
        id: generateId('block'),
        userId,
        title: form.title.trim(),
        date: dateStr,
        startTime: form.startTime,
        endTime: form.endTime,
        color: form.color,
        category: form.category,
        notes: form.notes,
        recurrenceRule: rule,
      });
    }

    setVisible(false);
    onSaved();
    onRefresh();
  }, [form, editingBlock, selectedDate, userId, onSaved, onRefresh]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete Block', 'Are you sure you want to delete this time block?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          timeBlocksStore.delete(id);
          setVisible(false);
          onSaved();
          onRefresh();
        },
      },
    ]);
  }, [onSaved, onRefresh]);

  return {
    visible,
    editingBlock,
    form,
    showDatePicker,
    showStartPicker,
    showEndPicker,
    openNewBlock,
    openEditBlock,
    close,
    updateField,
    save,
    delete: handleDelete,
    setShowDatePicker,
    setShowStartPicker,
    setShowEndPicker,
  };
};
