import React, {useState} from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Calendar, Clock, Plus, Trash2, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {Task} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';
import {
  Colors,
  Fonts,
  FontSize,
  Layout,
  Spacing,
  registerCustomCategoryColor,
} from '../../../theme';
import type {TodoDraftInput} from '../hooks/useTodoData';
import {toLocalYmd} from '../hooks/useTodoData';

interface TodoEditorModalProps {
  visible: boolean;
  editingTask: Task | null;
  customCategories: string[];
  onClose: () => void;
  onSave: (draft: TodoDraftInput, editingTask: Task | null) => void;
  onDelete?: (task: Task) => void;
  onAddCategory?: (name: string, color: string) => void;
}

const PRIORITIES: Task['priority'][] = ['High', 'Medium', 'Low'];
const BASE_CATEGORIES = ['Personal', 'Academic', 'Work', 'Health', 'Learning'];
const CUSTOM_COLOR_OPTIONS = [
  '#3498DB',
  '#2ECC71',
  '#C8A800',
  '#9B59B6',
  '#F75A5A',
  '#E67E22',
  '#E91E63',
  '#1ABC9C',
];

const timeStringToDate = (timeStr: string | null): Date => {
  const base = new Date();
  if (!timeStr) {
    base.setHours(9, 0, 0, 0);
    return base;
  }
  const [h, m] = timeStr.split(':').map(Number);
  base.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return base;
};

const formatDisplayTime = (timeStr: string | null): string => {
  if (!timeStr) return 'Set time (optional)';
  const [h, m] = timeStr.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return timeStr;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${meridiem}`;
};

export const TodoEditorModal: React.FC<TodoEditorModalProps> = ({
  visible,
  editingTask,
  customCategories,
  onClose,
  onSave,
  onDelete,
  onAddCategory,
}) => {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(editingTask?.title || '');
  const [priority, setPriority] = useState<Task['priority']>(
    editingTask?.priority || 'Medium',
  );
  const [category, setCategory] = useState(editingTask?.category?.trim() || '');
  const [dueDate, setDueDate] = useState<string | null>(
    editingTask?.dueDate || null,
  );
  const [dueTime, setDueTime] = useState<string | null>(
    editingTask?.dueTime || null,
  );
  const [notes, setNotes] = useState(editingTask?.notes || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategoryColor, setSelectedCategoryColor] = useState(
    CUSTOM_COLOR_OPTIONS[0],
  );
  const [localCustomCategories, setLocalCustomCategories] = useState<string[]>(
    [],
  );

  const existingCategory = editingTask?.category?.trim();
  const categories = Array.from(
    new Set([
      ...BASE_CATEGORIES,
      ...customCategories,
      ...localCustomCategories,
      ...(existingCategory ? [existingCategory] : []),
    ]),
  );

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const match = categories.find(
      c => c.toLowerCase() === trimmed.toLowerCase(),
    );
    if (match) {
      setCategory(match);
      setNewCategoryName('');
      setAddingCategory(false);
      return;
    }
    if (onAddCategory) {
      onAddCategory(trimmed, selectedCategoryColor);
    } else {
      registerCustomCategoryColor(trimmed, selectedCategoryColor);
    }
    setLocalCustomCategories(prev =>
      prev.includes(trimmed) ? prev : [...prev, trimmed],
    );
    setCategory(trimmed);
    setNewCategoryName('');
    setAddingCategory(false);
  };

  const todayStr = toLocalYmd(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = toLocalYmd(tomorrowDate);

  const handleSavePress = () => {
    if (!title.trim()) {
      Alert.alert('To-Do title needed', 'Please enter a short description.');
      return;
    }
    onSave(
      {
        title: title.trim(),
        dueDate,
        dueTime: dueDate ? dueTime : null,
        priority,
        category,
        notes,
      },
      editingTask,
    );
  };

  const handleDeletePress = () => {
    if (!editingTask || !onDelete) return;
    Alert.alert('Delete To-Do', `Remove "${editingTask.title}"?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete(editingTask);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={[styles.overlay, {backgroundColor: colors.overlay}]}
        testID="todo-editor-modal"
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.md,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.heading, {color: colors.textPrimary}]}>
              {editingTask ? 'Edit To-Do' : 'New To-Do'}
            </Text>
            <View style={styles.headerRight}>
              {editingTask && onDelete && (
                <TouchableOpacity
                  onPress={handleDeletePress}
                  accessibilityRole="button"
                  accessibilityLabel="Delete to-do"
                  testID="todo-modal-delete"
                  style={styles.iconBtn}
                >
                  <Trash2 size={18} color={colors.error} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close to-do editor"
                style={styles.iconBtn}
              >
                <X size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            <Text style={[styles.label, {color: colors.textSecondary}]}>
              Task
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  color: colors.textPrimary,
                  borderColor: colors.border,
                },
              ]}
              placeholder="What needs to be done?"
              placeholderTextColor={colors.placeholder}
              value={title}
              onChangeText={setTitle}
              autoFocus={!editingTask}
              testID="todo-modal-title-input"
            />

            <Text style={[styles.label, {color: colors.textSecondary}]}>
              Priority
            </Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map(p => {
                const active = priority === p;
                const activeBg =
                  p === 'High'
                    ? colors.error
                    : p === 'Medium'
                    ? Colors.red
                    : colors.success;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPriority(p)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? activeBg : colors.inputBg,
                        borderColor: active ? activeBg : colors.border,
                      },
                    ]}
                    testID={`todo-modal-priority-${p}`}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: active ? colors.white : colors.textPrimary,
                          fontWeight: active ? '700' : '500',
                        },
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, {color: colors.textSecondary}]}>
              Due Date (Optional)
            </Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => {
                  setDueDate(null);
                  setDueTime(null);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: !dueDate ? Colors.red : colors.inputBg,
                    borderColor: !dueDate ? Colors.red : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {color: !dueDate ? colors.white : colors.textPrimary},
                  ]}
                >
                  No due date
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDueDate(todayStr)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      dueDate === todayStr ? Colors.red : colors.inputBg,
                    borderColor:
                      dueDate === todayStr ? Colors.red : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        dueDate === todayStr
                          ? colors.white
                          : colors.textPrimary,
                    },
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDueDate(tomorrowStr)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      dueDate === tomorrowStr ? Colors.red : colors.inputBg,
                    borderColor:
                      dueDate === tomorrowStr ? Colors.red : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        dueDate === tomorrowStr
                          ? colors.white
                          : colors.textPrimary,
                    },
                  ]}
                >
                  Tomorrow
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      dueDate && dueDate !== todayStr && dueDate !== tomorrowStr
                        ? Colors.red
                        : colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.chipIconRow}>
                  <Calendar
                    size={13}
                    color={
                      dueDate && dueDate !== todayStr && dueDate !== tomorrowStr
                        ? colors.white
                        : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color:
                          dueDate &&
                          dueDate !== todayStr &&
                          dueDate !== tomorrowStr
                            ? colors.white
                            : colors.textPrimary,
                      },
                    ]}
                  >
                    {dueDate && dueDate !== todayStr && dueDate !== tomorrowStr
                      ? dueDate
                      : 'Pick date'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {dueDate ? (
              <View style={styles.timeRow}>
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  style={[
                    styles.timeBtn,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Clock size={14} color={colors.textSecondary} />
                  <Text style={[styles.chipText, {color: colors.textPrimary}]}>
                    {formatDisplayTime(dueTime)}
                  </Text>
                </TouchableOpacity>
                {dueTime ? (
                  <TouchableOpacity
                    onPress={() => setDueTime(null)}
                    style={[
                      styles.clearBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.inputBg,
                      },
                    ]}
                  >
                    <Text style={{color: colors.textSecondary, fontSize: 12}}>
                      Clear time
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {dueDate && dueTime ? (
              <Text style={[styles.helperText, {color: colors.textSecondary}]}>
                Future due times schedule an automatic reminder alarm.
              </Text>
            ) : null}

            {showDatePicker && (
              <DateTimePicker
                value={dueDate ? new Date(`${dueDate}T12:00:00`) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, picked) => {
                  setShowDatePicker(false);
                  if (event.type === 'dismissed' || !picked) return;
                  setDueDate(toLocalYmd(picked));
                }}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={timeStringToDate(dueTime)}
                mode="time"
                is24Hour={false}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, picked) => {
                  setShowTimePicker(false);
                  if (event.type === 'dismissed' || !picked) return;
                  const hh = String(picked.getHours()).padStart(2, '0');
                  const mm = String(picked.getMinutes()).padStart(2, '0');
                  if (!dueDate) setDueDate(todayStr);
                  setDueTime(`${hh}:${mm}`);
                }}
              />
            )}

            <Text style={[styles.label, {color: colors.textSecondary}]}>
              Category
            </Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                key="__none__"
                onPress={() => setCategory('')}
                testID="todo-category-none"
                style={[
                  styles.chip,
                  {
                    backgroundColor: !category ? Colors.red : colors.inputBg,
                    borderColor: !category ? Colors.red : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {color: !category ? colors.white : colors.textPrimary},
                  ]}
                >
                  None
                </Text>
              </TouchableOpacity>
              {categories.map(cat => {
                const active = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategory(active ? '' : cat)}
                    testID={`todo-category-${cat}`}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? Colors.red : colors.inputBg,
                        borderColor: active ? Colors.red : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {color: active ? colors.white : colors.textPrimary},
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => setAddingCategory(prev => !prev)}
                testID="todo-category-add-btn"
                style={[
                  styles.chip,
                  styles.chipIconRow,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: addingCategory ? Colors.red : colors.border,
                  },
                ]}
              >
                <Plus size={13} color={colors.textSecondary} />
                <Text style={[styles.chipText, {color: colors.textSecondary}]}>
                  New
                </Text>
              </TouchableOpacity>
            </View>

            {addingCategory && (
              <View
                style={[
                  styles.addCatBox,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.cardBg,
                      color: colors.textPrimary,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="Custom category name"
                  placeholderTextColor={colors.placeholder}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  testID="todo-new-category-input"
                  autoFocus
                />
                <View style={styles.colorPaletteRow}>
                  {CUSTOM_COLOR_OPTIONS.map((hex, idx) => (
                    <TouchableOpacity
                      key={hex}
                      onPress={() => setSelectedCategoryColor(hex)}
                      testID={`todo-new-category-color-${idx}`}
                      style={[
                        styles.colorCircle,
                        {backgroundColor: hex},
                        selectedCategoryColor === hex && {
                          borderWidth: 2,
                          borderColor: colors.textPrimary,
                        },
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.addCatActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setAddingCategory(false);
                      setNewCategoryName('');
                    }}
                    style={[styles.clearBtn, {borderColor: colors.border}]}
                  >
                    <Text
                      style={[styles.chipText, {color: colors.textSecondary}]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleAddCategory}
                    testID="todo-new-category-submit"
                    style={[
                      styles.clearBtn,
                      {
                        backgroundColor: Colors.red,
                        borderColor: Colors.red,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {color: colors.white, fontWeight: '600'},
                      ]}
                    >
                      Add
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={[styles.label, {color: colors.textSecondary}]}>
              Details (Optional)
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.notesInput,
                {
                  backgroundColor: colors.inputBg,
                  color: colors.textPrimary,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Extra context, room number, links..."
              placeholderTextColor={colors.placeholder}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.cancelBtn,
                {borderColor: colors.border, backgroundColor: colors.inputBg},
              ]}
            >
              <Text style={[styles.cancelBtnText, {color: colors.textPrimary}]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSavePress}
              style={[styles.saveBtn, {backgroundColor: Colors.red}]}
              testID="todo-modal-save"
            >
              <Text style={[styles.saveBtnText, {color: colors.white}]}>
                {editingTask ? 'Save changes' : 'Add To-Do'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Layout.borderRadiusCard,
    borderTopRightRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
  },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
  },
  body: {
    paddingBottom: Spacing.md,
  },
  label: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
    marginTop: Spacing.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  notesInput: {
    minHeight: 74,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
  },
  chipIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  helperText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    marginTop: 6,
  },
  addCatBox: {
    marginTop: 10,
    padding: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    gap: 10,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  addCatActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
});
