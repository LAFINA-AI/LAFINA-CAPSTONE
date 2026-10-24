import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { Colors } from '../../../theme';
import type { TimeBlock } from '../../../../storage';
import { timeBlocksStore } from '../../../../storage';
import { TimeBlockForm, TimeBlockModalState } from '../types';
import { generateId } from '../../../../utils';

interface UseTimeBlockModalOptions {
  userId: string;
  selectedDate: Date;
  onSaved: () => void;
  onRefresh: () => void;
  resetForm?: () => TimeBlockForm;
}

const defaultForm = (): TimeBlockForm => ({
  title: '',
  startTime: '09:00',
  endTime: '10:00',
  category: 'Work',
  color: Colors.blue,
  notes: '',
  recurrenceRule: null,
});

export const useTimeBlockModal = (options: UseTimeBlockModalOptions): TimeBlockModalState => {
  const { userId, selectedDate, onSaved, onRefresh } = options;
  const [visible, setVisible] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [form, setForm] = useState<TimeBlockForm>(defaultForm());
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

  const openNewBlock = useCallback(() => {
    setEditingBlock(null);
    setForm(defaultForm());
    setVisible(true);
  }, []);

  const openEditBlock = useCallback((block: TimeBlock) => {
    setEditingBlock(block);
    setForm({
      title: block.title,
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

    const dateStr = selectedDate.toISOString().split('T')[0];
    const rule = recurrenceRule !== undefined ? recurrenceRule : (form.recurrenceRule || null);

    if (editingBlock) {
      timeBlocksStore.update({
        id: editingBlock.id,
        title: form.title,
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
        title: form.title,
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
    showStartPicker,
    showEndPicker,
    openNewBlock,
    openEditBlock,
    close,
    updateField,
    save,
    delete: handleDelete,
    setShowStartPicker,
    setShowEndPicker,
  };
};
