import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  AlertTriangle,
  CheckSquare,
  ChevronRight,
  Square,
} from 'lucide-react-native';
import type {Task} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import {formatTimeLabel} from '../dashboardCalculations';
import type {DashboardTasksSummary} from '../types';

interface TasksDueWidgetProps {
  summary: DashboardTasksSummary;
  todayStr: string;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  onOpenCalendar: () => void;
}

const formatTaskDueLabel = (task: Task, todayStr: string): string => {
  if (!task.dueDate) return 'No due date';
  if (task.dueDate < todayStr) {
    return task.dueTime
      ? `Overdue · ${task.dueDate} ${formatTimeLabel(task.dueTime)}`
      : `Overdue · ${task.dueDate}`;
  }
  if (task.dueDate === todayStr) {
    return task.dueTime
      ? `Today · ${formatTimeLabel(task.dueTime)}`
      : 'Due today';
  }
  const dt = new Date(`${task.dueDate}T12:00:00`);
  const dayLabel = Number.isNaN(dt.getTime())
    ? task.dueDate
    : dt.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  return task.dueTime
    ? `${dayLabel} · ${formatTimeLabel(task.dueTime)}`
    : dayLabel;
};

export const TasksDueWidget: React.FC<TasksDueWidgetProps> = ({
  summary,
  todayStr,
  onToggleTask,
  onPressTask,
  onOpenCalendar,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const priorityColor = (priority: Task['priority']): string => {
    if (priority === 'High') return colors.error;
    if (priority === 'Medium') return colors.warning;
    return colors.success;
  };

  const combinedTasks = [
    ...summary.overdueTasks.slice(0, 3),
    ...summary.dueTodayTasks,
    ...summary.upcomingTasks,
  ].slice(0, 5);

  return (
    <View
      style={[styles.card, themed.card, Shadows.card]}
      testID="dashboard-widget-tasks-due"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <CheckSquare size={17} color={colors.warning} />
          <Text style={[styles.headerTitle, themed.primaryText]}>
            Tasks & Deadlines
          </Text>
        </View>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={onOpenCalendar}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewAllText, {color: colors.primary}]}>
            See all
          </Text>
          <ChevronRight size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {summary.overdueTotal > 0 && (
        <View
          style={[
            styles.overdueBanner,
            {
              backgroundColor: colors.error + '14',
              borderColor: colors.error + '38',
            },
          ]}
        >
          <AlertTriangle size={14} color={colors.error} />
          <Text style={[styles.overdueText, {color: colors.error}]}>
            {summary.overdueTotal}{' '}
            {summary.overdueTotal === 1 ? 'overdue task' : 'overdue tasks'} need
            attention
          </Text>
        </View>
      )}

      {combinedTasks.length === 0 ? (
        <View style={[styles.emptyBox, themed.emptyBox]}>
          <Text style={[styles.emptyText, themed.secondaryText]}>
            No tasks due in the next 7 days. You are on top of your deadlines!
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {combinedTasks.map(task => {
            const isOverdue = Boolean(task.dueDate && task.dueDate < todayStr);
            const dotColor = priorityColor(task.priority);

            return (
              <View key={task.id} style={[styles.taskRow, themed.taskRow]}>
                <TouchableOpacity
                  style={styles.checkboxHit}
                  onPress={() => onToggleTask(task)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: task.isCompleted}}
                  accessibilityLabel={`Mark ${task.title} complete`}
                  testID={`dashboard-task-toggle-${task.id}`}
                >
                  {task.isCompleted ? (
                    <CheckSquare size={20} color={colors.success} />
                  ) : (
                    <Square size={20} color={colors.textMuted} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.taskBody}
                  onPress={() => onPressTask(task)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[styles.taskTitle, themed.primaryText]}
                    numberOfLines={1}
                  >
                    {task.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <View
                      style={[styles.priorityDot, {backgroundColor: dotColor}]}
                    />
                    <Text
                      style={[
                        styles.metaText,
                        isOverdue
                          ? {color: colors.error, fontWeight: '600'}
                          : themed.secondaryText,
                      ]}
                      numberOfLines={1}
                    >
                      {formatTaskDueLabel(task, todayStr)} · {task.category}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  taskRow: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  emptyBox: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    fontWeight: '700',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  overdueText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  list: {
    gap: Spacing.sm,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  checkboxHit: {
    padding: 4,
  },
  taskBody: {
    flex: 1,
  },
  taskTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  priorityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  metaText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    flex: 1,
  },
  emptyBox: {
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    padding: Spacing.md,
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 19,
  },
});
