import {useStorageRevision} from '../../hooks/useStorageRevision';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AlertCircle, RefreshCw} from 'lucide-react-native';
import {userStore, type DashboardWidgetId} from '../../../storage';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, ModernLayout, Spacing} from '../../theme';
import {useThemedStyles} from '../../theme/createThemedStyles';
import {AddBlockModal} from '../calendar/components/AddBlockModal';
import {
  CustomizeDashboardModal,
  DashboardHeader,
  FreeStudyBlocksWidget,
  ModernHomeContent,
  PinnedNotesWidget,
  TasksDueWidget,
  TodayScheduleWidget,
  UpNextWidget,
  UpcomingRemindersWidget,
} from './components';
import {useDashboardData} from './hooks/useDashboardData';
import {NextAlarmCard} from './components/NextAlarmCard';
import type {DashboardScheduleItem, DashboardScreenProps} from './types';

export const DashboardScreen = React.memo(function Dashboard({
  userId,
  refreshTrigger: explicitRefresh,
  isActive = true,
  tourAnchor,
  onRefresh,
  onOpenCalendarTab,
  onOpenNotesTab,
  onOpenChatTab,
}: DashboardScreenProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (isActive && tourAnchor) {
      scrollRef.current?.scrollTo?.({y: 0, animated: false});
    }
  }, [isActive, tourAnchor]);
  const refreshTrigger =
    explicitRefresh +
    useStorageRevision([
      'tasks',
      'events',
      'event_time_local',
      'time_blocks',
      'reminders',
      'notes',
      'alarms',
      'users',
      'local_settings',
      'custom_categories',
    ]);
  const {colors, isModern} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();
  const bottomClearance =
    Math.max(insets.bottom, 12) +
    (isModern
      ? ModernLayout.navbarContentHeight + 36
      : Layout.navbarHeight + 28);

  const {now, data, actions, blockModal} = useDashboardData({
    userId,
    refreshTrigger,
    isActive,
    onRefresh,
  });

  const [customizeVisible, setCustomizeVisible] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState(
    actions.config.scheduleFilterDefault,
  );

  // Sync local filter pill if user updates default filter in Customize modal.
  const prevDefaultFilterRef = React.useRef(
    actions.config.scheduleFilterDefault,
  );
  React.useEffect(() => {
    if (prevDefaultFilterRef.current !== actions.config.scheduleFilterDefault) {
      prevDefaultFilterRef.current = actions.config.scheduleFilterDefault;
      setScheduleFilter(actions.config.scheduleFilterDefault);
    }
  }, [actions.config.scheduleFilterDefault]);

  const timeFormat24h = useMemo(() => {
    void refreshTrigger;
    try {
      return userStore.get24HourFormat(userId);
    } catch {
      return false;
    }
  }, [userId, refreshTrigger]);

  const hiddenSet = useMemo(
    () => new Set(actions.config.hiddenWidgets),
    [actions.config.hiddenWidgets],
  );

  const visibleWidgets = useMemo(
    () => actions.config.widgetOrder.filter(id => !hiddenSet.has(id)),
    [actions.config.widgetOrder, hiddenSet],
  );

  const pendingTasksCount =
    data.tasksSummary.overdueTotal + data.tasksSummary.dueTodayTasks.length;

  const handleOpenScheduleItem = (item: DashboardScheduleItem) => {
    onOpenCalendarTab({
      entityId: item.baseId,
      entityKind: item.kind === 'event' ? 'event' : 'block',
      date: item.date,
    });
  };

  const renderWidget = (id: DashboardWidgetId) => {
    switch (id) {
      case 'up_next':
        return (
          <UpNextWidget
            key={id}
            summary={data.upNext}
            onPressItem={handleOpenScheduleItem}
            onOpenCalendar={() => onOpenCalendarTab()}
          />
        );
      case 'free_study_blocks':
        return (
          <FreeStudyBlocksWidget
            key={id}
            summary={data.freeStudy}
            minGapMinutes={actions.config.minFreeGapMinutes}
            onAddStudyBlock={actions.openStudyBlockSlot}
            onOpenCustomize={() => setCustomizeVisible(true)}
          />
        );
      case 'today_schedule':
        return (
          <TodayScheduleWidget
            key={id}
            items={data.todayItems}
            nowMinutes={data.nowMinutes}
            filter={scheduleFilter}
            onChangeFilter={setScheduleFilter}
            onPressItem={handleOpenScheduleItem}
            onOpenCalendar={() => onOpenCalendarTab()}
          />
        );
      case 'tasks_due':
        return (
          <TasksDueWidget
            key={id}
            summary={data.tasksSummary}
            todayStr={data.todayStr}
            onToggleTask={actions.toggleTaskComplete}
            onPressTask={task =>
              onOpenCalendarTab({
                entityId: task.id,
                entityKind: 'task',
                date: task.dueDate || data.todayStr,
              })
            }
            onOpenCalendar={() => onOpenCalendarTab()}
          />
        );
      case 'upcoming_reminders':
        return (
          <UpcomingRemindersWidget
            key={id}
            reminders={data.pendingReminders}
            todayStr={data.todayStr}
            onPressReminder={rem =>
              onOpenCalendarTab({
                entityId: rem.id,
                entityKind: 'reminder',
                date: rem.triggerAt.slice(0, 10),
              })
            }
            onOpenCalendar={() => onOpenCalendarTab()}
          />
        );
      case 'pinned_notes':
        return (
          <PinnedNotesWidget
            key={id}
            notes={data.highlightedNotes}
            hasPinnedNotes={data.pinnedNotesCount > 0}
            onPressNote={noteId => onOpenNotesTab(noteId)}
            onOpenAllNotes={() => onOpenNotesTab()}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View
      style={[styles.container, themed.container]}
      testID="dashboard-screen"
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isModern && styles.modernScrollContent,
          {paddingBottom: bottomClearance},
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              actions.refresh();
              onRefresh();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {isModern ? (
          <ModernHomeContent
            userId={userId}
            refreshTrigger={refreshTrigger}
            now={now}
            timeFormat24h={timeFormat24h}
            data={data}
            visibleWidgets={visibleWidgets}
            onToggleTask={actions.toggleTaskComplete}
            onPressTask={task =>
              onOpenCalendarTab({
                entityId: task.id,
                entityKind: 'task',
                date: task.dueDate || data.todayStr,
              })
            }
            onPressScheduleItem={handleOpenScheduleItem}
            onPressReminder={rem =>
              onOpenCalendarTab({
                entityId: rem.id,
                entityKind: 'reminder',
                date: rem.triggerAt.slice(0, 10),
              })
            }
            onPressNote={noteId => onOpenNotesTab(noteId)}
            onAddStudyBlock={actions.openStudyBlockSlot}
            onOpenCalendarTab={onOpenCalendarTab}
            onOpenNotesTab={onOpenNotesTab}
            onOpenChatTab={onOpenChatTab}
            onOpenAlarms={() => onOpenCalendarTab({scheduleSection: 'alarms'})}
            onOpenCustomize={() => setCustomizeVisible(true)}
            onRefresh={actions.refresh}
          />
        ) : (
          <>
            <DashboardHeader
              now={now}
              greetingName={data.greetingName}
              academicBadge={data.academicBadge}
              todayItemsCount={data.todayItems.length}
              usableFreeMinutes={data.freeStudy.totalRemainingFreeMinutes}
              pendingTasksCount={pendingTasksCount}
              onOpenCustomize={() => setCustomizeVisible(true)}
              onAskLafina={() =>
                onOpenChatTab(
                  "What's on my schedule today and when am I free to study?",
                )
              }
            />

            {data.readError && (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.error + '14',
                    borderColor: colors.error + '40',
                  },
                ]}
              >
                <AlertCircle size={16} color={colors.error} />
                <Text style={[styles.errorText, {color: colors.error}]}>
                  {data.readError}
                </Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={actions.refresh}
                  activeOpacity={0.75}
                >
                  <RefreshCw size={13} color={colors.error} />
                  <Text style={[styles.retryText, {color: colors.error}]}>
                    Retry
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <NextAlarmCard
              userId={userId}
              timeFormat24h={timeFormat24h}
              now={now}
              onOpenAlarms={() =>
                onOpenCalendarTab({scheduleSection: 'alarms'})
              }
            />

            {visibleWidgets.map(renderWidget)}
          </>
        )}
      </ScrollView>

      <AddBlockModal state={blockModal} timeFormat24h={timeFormat24h} />

      <CustomizeDashboardModal
        visible={customizeVisible}
        config={actions.config}
        onClose={() => setCustomizeVisible(false)}
        onApplyPreset={actions.applyPreset}
        onMoveWidget={actions.moveWidget}
        onToggleWidget={actions.toggleWidgetVisibility}
        onChangeMinGap={actions.setMinFreeGapMinutes}
        onChangeDefaultFilter={actions.setScheduleFilter}
        onReset={actions.resetConfig}
      />
    </View>
  );
});

const getThemedStyles = (colors: ThemeColors) => ({
  container: {
    backgroundColor: colors.background,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  modernScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retryText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
});
