import React, {useCallback, useEffect, useState} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Check, Inbox, X} from 'lucide-react-native';
import {tasksStore} from '../../../../storage';
import type {Task} from '../../../../storage';
import {Fonts, FontSize, Layout, Spacing} from '../../../theme';
import {useTheme} from '../../../contexts/ThemeContext';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import type {ThemeColors} from '../../../contexts/ThemeContext';

export const UNDATED_PAGE_SIZE = 20;

interface UndatedTasksModalProps {
  visible: boolean;
  userId: string;
  refreshTrigger?: number;
  onClose: () => void;
  /** Manual completion, saved immediately like every Calendar checkbox. */
  onToggleTask: (task: Task) => void;
}

/**
 * Open tasks without a due date (AGY-PORT 04). They have no day to appear on in
 * Month or Week view, so this paged list is where they stay reachable.
 */
export const UndatedTasksModal: React.FC<UndatedTasksModalProps> = ({
  visible,
  userId,
  refreshTrigger = 0,
  onClose,
  onToggleTask,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [items, setItems] = useState<Task[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const loadFirstPage = useCallback(() => {
    try {
      const page = tasksStore.getUndatedTasksPage(userId, {
        limit: UNDATED_PAGE_SIZE,
      });
      setItems(page.items);
      setCursor(page.nextCursor);
      setFailed(false);
    } catch (error) {
      console.warn('[UndatedTasks] Could not load undated tasks:', error);
      setItems([]);
      setCursor(null);
      setFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    if (visible) loadFirstPage();
  }, [visible, loadFirstPage, refreshTrigger]);

  const loadMore = () => {
    if (!cursor) return;
    try {
      const page = tasksStore.getUndatedTasksPage(userId, {
        limit: UNDATED_PAGE_SIZE,
        after: cursor,
      });
      setItems(current => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      console.warn('[UndatedTasks] Could not load more undated tasks:', error);
      setFailed(true);
    }
  };

  const complete = (task: Task) => {
    onToggleTask(task);
    setItems(current => current.filter(item => item.id !== task.id));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, themed.overlay]}>
        <View style={[styles.sheet, themed.sheet]} testID="undated-tasks-modal">
          <View style={styles.headerRow}>
            <Inbox size={18} color={colors.textPrimary} />
            <Text
              style={[styles.title, themed.primary]}
              accessibilityRole="header"
            >
              Undated tasks
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, themed.closeButton]}
              accessibilityRole="button"
              accessibilityLabel="Close undated tasks"
              testID="undated-tasks-close"
            >
              <X size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, themed.secondary]}>
            Open tasks with no due date. They do not appear on a calendar day.
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
          >
            {failed ? (
              <View style={styles.emptyBox} testID="undated-tasks-error">
                <Text style={[styles.hint, themed.secondary]}>
                  Undated tasks could not be loaded right now. Nothing was
                  changed.
                </Text>
                <TouchableOpacity
                  onPress={loadFirstPage}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading undated tasks"
                  testID="undated-tasks-retry"
                >
                  <Text style={[styles.action, {color: colors.primary}]}>
                    Try again
                  </Text>
                </TouchableOpacity>
              </View>
            ) : items.length === 0 ? (
              <Text
                style={[styles.hint, themed.secondary]}
                testID="undated-tasks-empty"
              >
                No undated tasks.
              </Text>
            ) : (
              items.map(task => (
                <View
                  key={task.id}
                  style={[styles.row, themed.row]}
                  testID={`undated-task-${task.id}`}
                >
                  <TouchableOpacity
                    onPress={() => complete(task)}
                    style={[styles.checkbox, {borderColor: colors.primary}]}
                    accessibilityRole="checkbox"
                    accessibilityState={{checked: false}}
                    accessibilityLabel={`Mark ${task.title} as done`}
                    testID={`undated-task-done-${task.id}`}
                  >
                    <Check size={12} color={colors.primary} />
                  </TouchableOpacity>
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.rowTitle, themed.primary]}
                      numberOfLines={2}
                    >
                      {task.title}
                    </Text>
                    <Text style={[styles.rowMeta, themed.secondary]}>
                      {task.category} · {task.priority} priority
                    </Text>
                  </View>
                </View>
              ))
            )}
            {cursor && !failed ? (
              <TouchableOpacity
                onPress={loadMore}
                style={[styles.moreButton, themed.closeButton]}
                accessibilityRole="button"
                accessibilityLabel="Show more undated tasks"
                testID="undated-tasks-more"
              >
                <Text style={[styles.action, themed.primary]}>Show more</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  overlay: {backgroundColor: colors.overlay},
  sheet: {backgroundColor: colors.cardBg},
  primary: {color: colors.textPrimary},
  secondary: {color: colors.textSecondary},
  closeButton: {backgroundColor: colors.inputBg},
  row: {borderColor: colors.border},
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  list: {
    marginTop: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.lg,
  },
  emptyBox: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.bodyLarge,
    fontWeight: '600',
  },
  rowMeta: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: Spacing.xxs,
  },
  moreButton: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 40,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
});
