import React, {useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
} from 'lucide-react-native';
import type {Task} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';
import {
  Fonts,
  FontSize,
  Layout,
  ModernLayout,
  Shadows,
  Spacing,
  getCategoryColor,
} from '../../../theme';
import type {NoteChecklistTodoItem} from '../hooks/useTodoData';
import {toLocalYmd} from '../hooks/useTodoData';
import type {TodoFilterType} from '../types';

interface TodoListViewProps {
  undatedOpen: Task[];
  scheduledOpen: Task[];
  completedTasks: Task[];
  noteChecklists: NoteChecklistTodoItem[];
  allNoteChecklistCount: number;
  filter: TodoFilterType;
  onFilterChange: (filter: TodoFilterType) => void;
  quickTitle: string;
  onQuickTitleChange: (val: string) => void;
  quickPriority: Task['priority'];
  onQuickPriorityChange: (val: Task['priority']) => void;
  onQuickAdd: () => void;
  onToggleTodo: (task: Task) => void;
  onPressTodo: (task: Task) => void;
  onToggleChecklistItem: (item: NoteChecklistTodoItem) => void;
  onOpenParentNote: (noteId: string) => void;
  onOpenNewTodoModal: () => void;
  highlightedTaskId: string | null;
  searchQuery: string;
  isGridView?: boolean;
}

const FILTER_OPTIONS: Array<{key: TodoFilterType; label: string}> = [
  {key: 'open', label: 'All Open'},
  {key: 'undated', label: 'To-Do'},
  {key: 'scheduled', label: 'Scheduled'},
  {key: 'checklists', label: 'From Notes'},
  {key: 'completed', label: 'Completed'},
];

const NEXT_PRIORITY: Record<Task['priority'], Task['priority']> = {
  Medium: 'High',
  High: 'Low',
  Low: 'Medium',
};

const formatTime12h = (timeStr?: string | null): string => {
  if (!timeStr) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(timeStr);
  if (!match) return timeStr;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${meridiem}`;
};

const formatShortDate = (ymd: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
};

const formatDueLabel = (task: Task, todayStr: string): string => {
  if (!task.dueDate) return '';
  if (task.dueDate < todayStr) {
    return task.dueTime
      ? `Overdue · ${task.dueDate} ${formatTime12h(task.dueTime)}`
      : `Overdue · ${task.dueDate}`;
  }
  if (task.dueDate === todayStr) {
    return task.dueTime ? `Today · ${formatTime12h(task.dueTime)}` : 'Today';
  }
  return task.dueTime
    ? `${task.dueDate} · ${formatTime12h(task.dueTime)}`
    : task.dueDate;
};

const formatCompactDueLabel = (task: Task, todayStr: string): string => {
  if (!task.dueDate) return '';
  const shortDate = formatShortDate(task.dueDate);
  if (task.dueDate < todayStr) {
    return `Overdue · ${shortDate}`;
  }
  if (task.dueDate === todayStr) {
    return task.dueTime ? `Today · ${formatTime12h(task.dueTime)}` : 'Today';
  }
  return shortDate;
};

export const TodoListView: React.FC<TodoListViewProps> = ({
  undatedOpen,
  scheduledOpen,
  completedTasks,
  noteChecklists,
  allNoteChecklistCount,
  filter,
  onFilterChange,
  quickTitle,
  onQuickTitleChange,
  quickPriority,
  onQuickPriorityChange,
  onQuickAdd,
  onToggleTodo,
  onPressTodo,
  onToggleChecklistItem,
  onOpenParentNote,
  onOpenNewTodoModal,
  highlightedTaskId,
  searchQuery,
  isGridView = false,
}) => {
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const [showCompletedInline, setShowCompletedInline] = useState(false);
  const todayStr = toLocalYmd(new Date());

  const showUndated = filter === 'open' || filter === 'undated';
  const showScheduled = filter === 'open' || filter === 'scheduled';
  const showChecklists = filter === 'open' || filter === 'checklists';
  const showCompletedList = filter === 'completed';

  const visibleCount =
    (showUndated ? undatedOpen.length : 0) +
    (showScheduled ? scheduledOpen.length : 0) +
    (showChecklists ? noteChecklists.length : 0) +
    (showCompletedList ? completedTasks.length : 0);

  const priorityBadgeColor = (p: Task['priority']): string => {
    if (p === 'High') return colors.error;
    if (p === 'Medium') return colors.warning;
    return colors.success;
  };

  const accentColor = isModern ? modernPalette.accent : colors.red;
  const activeCardShadow = isModern ? modernShadows.card : Shadows.card;

  const getCardContainerStyle = (isHighlighted: boolean = false) => [
    styles.taskRow,
    activeCardShadow,
    isModern && styles.modernTaskRow,
    isGridView && styles.taskCardGrid,
    isGridView && isModern && styles.modernTaskGridCard,
    {
      backgroundColor: colors.cardBg,
      borderColor: isHighlighted
        ? accentColor
        : isModern
        ? modernPalette.border
        : colors.border,
      borderWidth: isHighlighted ? 1.5 : 1,
    },
  ];

  const renderCategoryPill = (category: string) => {
    const trimmed = category.trim();
    if (!trimmed) return null;
    const catColor = getCategoryColor(trimmed);
    return (
      <View
        style={[
          styles.metaPill,
          isGridView && styles.gridSinglePill,
          {backgroundColor: `${catColor}18`},
        ]}
      >
        <Text
          style={[
            styles.metaPillText,
            styles.gridSinglePillText,
            {color: catColor},
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {trimmed}
        </Text>
      </View>
    );
  };

  const renderTaskRow = (task: Task) => {
    const isOverdue =
      !task.isCompleted && Boolean(task.dueDate && task.dueDate < todayStr);
    const dueLabel = isGridView
      ? formatCompactDueLabel(task, todayStr)
      : formatDueLabel(task, todayStr);
    const isHighlighted = highlightedTaskId === task.id;
    const prioColor = priorityBadgeColor(task.priority);
    const hasCategory = Boolean(task.category?.trim());

    const checkboxNode = (
      <TouchableOpacity
        onPress={() => onToggleTodo(task)}
        accessibilityRole="checkbox"
        accessibilityState={{checked: task.isCompleted}}
        accessibilityLabel={`Toggle ${task.title}`}
        testID={`todo-checkbox-${task.id}`}
        hitSlop={isGridView ? {top: 6, bottom: 6, left: 6, right: 6} : undefined}
        style={[
          styles.checkbox,
          isGridView && styles.gridCheckbox,
          {
            borderColor: task.isCompleted ? accentColor : prioColor,
            backgroundColor: task.isCompleted ? accentColor : 'transparent',
          },
        ]}
      >
        {task.isCompleted ? (
          <Check size={isGridView ? 12 : 14} color={colors.white} />
        ) : null}
      </TouchableOpacity>
    );

    const priorityPill =
      task.priority !== 'Medium' ? (
        <View style={[styles.metaPill, {backgroundColor: `${prioColor}18`}]}>
          <Text style={[styles.metaPillText, {color: prioColor}]}>
            {task.priority}
          </Text>
        </View>
      ) : null;

    const duePill = dueLabel ? (
      <View
        style={[
          styles.metaPill,
          styles.duePill,
          styles.gridSinglePill,
          {
            backgroundColor: isOverdue
              ? `${colors.error}18`
              : colors.inputBg,
          },
        ]}
      >
        <Calendar
          size={11}
          color={isOverdue ? colors.error : colors.textSecondary}
        />
        <Text
          style={[
            styles.metaPillText,
            styles.gridSinglePillText,
            {color: isOverdue ? colors.error : colors.textSecondary},
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {dueLabel}
        </Text>
      </View>
    ) : null;

    if (isGridView) {
      const topRightBadge =
        priorityPill ?? (hasCategory ? renderCategoryPill(task.category) : null);
      const bottomBadge =
        duePill ??
        (priorityPill && hasCategory ? renderCategoryPill(task.category) : null);

      return (
        <View
          key={task.id}
          testID={`todo-row-${task.id}`}
          style={getCardContainerStyle(isHighlighted)}
        >
          <View style={styles.gridTopRow}>
            {checkboxNode}
            {topRightBadge}
          </View>
          <TouchableOpacity
            style={styles.gridBody}
            onPress={() => onPressTodo(task)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.taskTitle,
                styles.gridTaskTitle,
                {
                  color: task.isCompleted
                    ? colors.textSecondary
                    : colors.textPrimary,
                  textDecorationLine: task.isCompleted ? 'line-through' : 'none',
                },
              ]}
              numberOfLines={2}
            >
              {task.title}
            </Text>
            {bottomBadge ? (
              <View style={styles.gridFooter}>{bottomBadge}</View>
            ) : null}
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View
        key={task.id}
        testID={`todo-row-${task.id}`}
        style={getCardContainerStyle(isHighlighted)}
      >
        {checkboxNode}

        <TouchableOpacity
          style={styles.taskBody}
          onPress={() => onPressTodo(task)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.taskTitle,
              {
                color: task.isCompleted
                  ? colors.textSecondary
                  : colors.textPrimary,
                textDecorationLine: task.isCompleted ? 'line-through' : 'none',
              },
            ]}
            numberOfLines={2}
          >
            {task.title}
          </Text>

          {task.notes ? (
            <Text
              style={[styles.taskNotes, {color: colors.textSecondary}]}
              numberOfLines={1}
            >
              {task.notes}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            {priorityPill}
            {hasCategory ? renderCategoryPill(task.category) : null}
            {duePill}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderChecklistCard = (item: NoteChecklistTodoItem) => {
    const checkboxNode = (
      <TouchableOpacity
        onPress={() => onToggleChecklistItem(item)}
        accessibilityRole="checkbox"
        accessibilityState={{checked: item.done}}
        accessibilityLabel={`Toggle checklist item ${item.text}`}
        testID={`todo-note-checklist-${item.noteId}-${item.checklistIndex}`}
        hitSlop={isGridView ? {top: 6, bottom: 6, left: 6, right: 6} : undefined}
        style={[
          styles.checkbox,
          isGridView && styles.gridCheckbox,
          {
            borderColor: item.done ? accentColor : colors.primary,
            backgroundColor: item.done ? accentColor : 'transparent',
          },
        ]}
      >
        {item.done ? (
          <Check size={isGridView ? 12 : 14} color={colors.white} />
        ) : null}
      </TouchableOpacity>
    );

    const sourcePill = (
      <View
        style={[
          styles.metaPill,
          styles.duePill,
          styles.gridSinglePill,
          {backgroundColor: colors.inputBg},
        ]}
      >
        <FileText size={11} color={colors.textSecondary} />
        <Text
          style={[
            styles.metaPillText,
            styles.gridSinglePillText,
            {color: colors.textSecondary},
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          From: {item.noteTitle}
        </Text>
      </View>
    );

    if (isGridView) {
      return (
        <View
          key={item.id}
          testID={`todo-note-checklist-row-${item.noteId}-${item.checklistIndex}`}
          style={getCardContainerStyle(false)}
        >
          <View style={styles.gridTopRow}>{checkboxNode}</View>
          <TouchableOpacity
            style={styles.gridBody}
            onPress={() => onOpenParentNote(item.noteId)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.taskTitle,
                styles.gridTaskTitle,
                {
                  color: item.done ? colors.textSecondary : colors.textPrimary,
                  textDecorationLine: item.done ? 'line-through' : 'none',
                },
              ]}
              numberOfLines={2}
            >
              {item.text}
            </Text>
            <View style={styles.gridFooter}>{sourcePill}</View>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View
        key={item.id}
        testID={`todo-note-checklist-row-${item.noteId}-${item.checklistIndex}`}
        style={getCardContainerStyle(false)}
      >
        {checkboxNode}

        <TouchableOpacity
          style={styles.taskBody}
          onPress={() => onOpenParentNote(item.noteId)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.taskTitle,
              {
                color: item.done ? colors.textSecondary : colors.textPrimary,
                textDecorationLine: item.done ? 'line-through' : 'none',
              },
            ]}
            numberOfLines={2}
          >
            {item.text}
          </Text>
          <View style={styles.metaRow}>{sourcePill}</View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container} testID="notes-todo-view">
      {/* Quick-add bar */}
      <View
        style={[
          styles.quickAddBox,
          isModern && styles.modernQuickAddBox,
          {
            backgroundColor: colors.cardBg,
            borderColor: isModern ? modernPalette.border : colors.border,
          },
        ]}
      >
        <TextInput
          style={[styles.quickInput, {color: colors.textPrimary}]}
          placeholder="Quick add a to-do..."
          placeholderTextColor={colors.placeholder}
          value={quickTitle}
          onChangeText={onQuickTitleChange}
          onSubmitEditing={onQuickAdd}
          returnKeyType="done"
          testID="todo-quick-add-input"
        />
        <TouchableOpacity
          onPress={() => onQuickPriorityChange(NEXT_PRIORITY[quickPriority])}
          accessibilityRole="button"
          accessibilityLabel={`Quick add priority ${quickPriority}`}
          testID="todo-quick-priority"
          style={[
            styles.prioChip,
            {borderColor: priorityBadgeColor(quickPriority)},
          ]}
        >
          <Text
            style={[
              styles.prioChipText,
              {color: priorityBadgeColor(quickPriority)},
            ]}
          >
            {quickPriority}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onQuickAdd}
          accessibilityRole="button"
          accessibilityLabel="Add to-do"
          testID="todo-quick-add-submit"
          style={[
            styles.addBtn,
            isModern && styles.modernAddBtn,
            {
              backgroundColor: quickTitle.trim()
                ? accentColor
                : isModern
                ? modernPalette.surface
                : colors.inputBg,
            },
          ]}
        >
          <Plus
            size={18}
            color={quickTitle.trim() ? colors.white : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Filter pills */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroller}
        >
          {FILTER_OPTIONS.map(opt => {
            const active = filter === opt.key;
            const suffix =
              opt.key === 'checklists' && allNoteChecklistCount > 0
                ? ` (${allNoteChecklistCount})`
                : opt.key === 'completed' && completedTasks.length > 0
                ? ` (${completedTasks.length})`
                : '';
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => onFilterChange(opt.key)}
                testID={`todo-filter-${opt.key}`}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isModern
                      ? modernPalette.surface
                      : colors.inputBg,
                  },
                  active && {
                    backgroundColor: isModern
                      ? modernPalette.darkInkBtn
                      : colors.red,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {color: colors.textSecondary},
                    active && {
                      color: colors.white,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {opt.label}
                  {suffix}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {visibleCount === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, {color: colors.textPrimary}]}>
              {searchQuery.trim()
                ? 'No matching to-dos'
                : filter === 'completed'
                ? 'No completed to-dos yet'
                : 'Your To-Do list is clear'}
            </Text>
            <Text style={[styles.emptySub, {color: colors.textSecondary}]}>
              {searchQuery.trim()
                ? 'Try another search term or switch filters.'
                : 'Type above to add an undated to-do, tap + to set a due date, or ask LAFINA in Chat or Call.'}
            </Text>
            {!searchQuery.trim() && filter !== 'completed' ? (
              <TouchableOpacity
                onPress={onOpenNewTodoModal}
                style={[
                  styles.emptyBtn,
                  isModern && styles.modernPill,
                  {borderColor: accentColor, backgroundColor: colors.cardBg},
                ]}
              >
                <Text style={{color: accentColor, fontWeight: '700'}}>
                  Add detailed To-Do
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {showUndated && undatedOpen.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, {color: colors.textSecondary}]}>
              TO-DO ({undatedOpen.length})
            </Text>
            <View style={isGridView ? styles.gridContainer : undefined}>
              {undatedOpen.map(renderTaskRow)}
            </View>
          </View>
        ) : null}

        {showScheduled && scheduledOpen.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, {color: colors.textSecondary}]}>
              SCHEDULED & DEADLINES ({scheduledOpen.length})
            </Text>
            <View style={isGridView ? styles.gridContainer : undefined}>
              {scheduledOpen.map(renderTaskRow)}
            </View>
          </View>
        ) : null}

        {showChecklists && noteChecklists.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, {color: colors.textSecondary}]}>
              FROM NOTES CHECKLISTS ({noteChecklists.length})
            </Text>
            <View style={isGridView ? styles.gridContainer : undefined}>
              {noteChecklists.map(renderChecklistCard)}
            </View>
          </View>
        ) : null}

        {showCompletedList && completedTasks.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, {color: colors.textSecondary}]}>
              COMPLETED ({completedTasks.length})
            </Text>
            <View style={isGridView ? styles.gridContainer : undefined}>
              {completedTasks.map(renderTaskRow)}
            </View>
          </View>
        ) : null}

        {filter === 'open' && completedTasks.length > 0 ? (
          <View style={styles.section}>
            <TouchableOpacity
              onPress={() => setShowCompletedInline(prev => !prev)}
              style={styles.completedToggleRow}
              testID="todo-completed-toggle"
            >
              {showCompletedInline ? (
                <ChevronDown size={15} color={colors.textSecondary} />
              ) : (
                <ChevronRight size={15} color={colors.textSecondary} />
              )}
              <Text
                style={[styles.sectionHeader, {color: colors.textSecondary}]}
              >
                COMPLETED ({completedTasks.length})
              </Text>
            </TouchableOpacity>
            {showCompletedInline ? (
              <View style={isGridView ? styles.gridContainer : undefined}>
                {completedTasks.map(renderTaskRow)}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  quickAddBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingLeft: Spacing.md,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: Spacing.sm,
    gap: 8,
  },
  quickInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    paddingVertical: 4,
  },
  prioChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
  },
  prioChipText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.caption,
    fontWeight: '700',
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterContainer: {
    marginBottom: Spacing.sm,
  },
  filterScroller: {
    paddingRight: 16,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadiusPill,
    marginRight: 6,
  },
  filterChipText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  scrollContent: {
    paddingBottom: 190,
  },
  section: {
    marginBottom: Spacing.md,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  sectionHeader: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 12,
    overflow: 'hidden',
  },
  taskCardGrid: {
    width: '48.2%',
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    minHeight: 96,
  },
  gridTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  gridBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
    gap: 8,
  },
  gridFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  gridCheckbox: {
    width: 20,
    height: 20,
    marginTop: 0,
  },
  taskBody: {
    flex: 1,
    minWidth: 0,
  },
  taskTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
    lineHeight: 20,
  },
  gridTaskTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  taskNotes: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  metaPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Layout.borderRadiusPill,
  },
  gridSinglePill: {
    maxWidth: '100%',
    flexShrink: 1,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  gridSinglePillText: {
    flexShrink: 1,
  },
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaPillText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  completedToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 48,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  modernQuickAddBox: {
    borderRadius: ModernLayout.borderRadiusCard,
  },
  modernAddBtn: {
    borderRadius: ModernLayout.borderRadiusPill,
  },
  modernTaskRow: {
    borderRadius: ModernLayout.borderRadiusCard,
  },
  modernTaskGridCard: {
    borderRadius: ModernLayout.borderRadiusSubCard,
  },
  modernPill: {
    borderRadius: ModernLayout.borderRadiusPill,
  },
});
