import {useStorageRevision} from '../../hooks/useStorageRevision';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import {
  alarmsStore,
  userStore,
  type AlarmInput,
  type DashboardWidgetId,
} from '../../../storage';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, ModernLayout, Spacing} from '../../theme';
import {useThemedStyles} from '../../theme/createThemedStyles';
import {AddBlockModal} from '../calendar/components/AddBlockModal';
import {AddTaskEventModal} from '../calendar/components/AddTaskEventModal';
import {AlarmEditorModal} from '../calendar/components/AlarmEditorModal';
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
import type {Reminder, Task} from '../../../storage';

const DASHBOARD_DATA_TABLES = [
  'tasks',
  'events',
  'event_time_local',
  'time_blocks',
  'reminders',
  'notes',
  'alarms',
  'users',
  'custom_categories',
  'local_settings:dashboard',
  'local_settings:academic',
  'local_settings:student',
  'local_settings:profile',
  'local_settings:cor',
  'local_settings:schedule',
  'local_settings:onboarding',
] as const;

export const DashboardScreen = React.memo(function Dashboard({
  userId,
  refreshTrigger: explicitRefresh,
  isActive = true,
  tourAnchor,
  onRefresh,
  onOpenCalendarTab,
  onOpenNotesTab,
  onOpenChatTab,
  onOpenAskUstp,
  onOpenSkill,
}: DashboardScreenProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (isActive && tourAnchor) {
      scrollRef.current?.scrollTo?.({y: 0, animated: false});
    }
  }, [isActive, tourAnchor]);
  const refreshTrigger = explicitRefresh + useStorageRevision(DASHBOARD_DATA_TABLES);
  const {colors, isModern} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();
  const bottomClearance =
    Math.max(insets.bottom, 12) +
    (isModern
      ? ModernLayout.navbarContentHeight + 36
      : Layout.navbarHeight + 28);

  const {now, data, actions, blockModal, taskModal} = useDashboardData({
    userId,
    refreshTrigger,
    isActive,
    onRefresh,
  });

  const [customizeVisible, setCustomizeVisible] = useState(false);
  const [alarmModalVisible, setAlarmModalVisible] = useState(false);
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

  // Stable handlers: the memoized widgets then skip the re-render Home gets
  // each time it is shown or hidden.
  const handleOpenScheduleItem = useCallback(
    (item: DashboardScheduleItem) => {
      onOpenCalendarTab({
        entityId: item.baseId,
        entityKind: item.kind === 'event' ? 'event' : 'block',
        date: item.date,
      });
    },
    [onOpenCalendarTab],
  );
  const openCalendar = useCallback(
    () => onOpenCalendarTab(),
    [onOpenCalendarTab],
  );
  const openAlarms = useCallback(
    () => onOpenCalendarTab({scheduleSection: 'alarms'}),
    [onOpenCalendarTab],
  );
  const todayStr = data.todayStr;
  const pressTask = useCallback(
    (task: Task) =>
      onOpenCalendarTab({
        entityId: task.id,
        entityKind: 'task',
        date: task.dueDate || todayStr,
      }),
    [onOpenCalendarTab, todayStr],
  );
  const pressReminder = useCallback(
    (rem: Reminder) =>
      onOpenCalendarTab({
        entityId: rem.id,
        entityKind: 'reminder',
        date: rem.triggerAt.slice(0, 10),
      }),
    [onOpenCalendarTab],
  );
  const pressNote = useCallback(
    (noteId: string) => onOpenNotesTab(noteId),
    [onOpenNotesTab],
  );
  const openAllNotes = useCallback(() => onOpenNotesTab(), [onOpenNotesTab]);
  const openCustomize = useCallback(() => setCustomizeVisible(true), []);
  const closeCustomize = useCallback(() => setCustomizeVisible(false), []);
  const openSetAlarm = useCallback(() => setAlarmModalVisible(true), []);
  const closeSetAlarm = useCallback(() => setAlarmModalVisible(false), []);
  const clearScheduleFilter = useCallback(() => setScheduleFilter('all'), []);
  const openFocus = useCallback(() => {
    if (onOpenSkill) {
      onOpenSkill({skill: 'pomodoro', action: 'open'});
      return;
    }
    onOpenNotesTab();
  }, [onOpenSkill, onOpenNotesTab]);
  const openAskUstp = useCallback(() => {
    if (onOpenAskUstp) {
      onOpenAskUstp();
      return;
    }
    onOpenChatTab();
  }, [onOpenAskUstp, onOpenChatTab]);
  const askLafina = useCallback(
    () =>
      onOpenChatTab("What's on my schedule today and when am I free to study?"),
    [onOpenChatTab],
  );
  const refreshData = actions.refresh;
  const handleSaveAlarm = useCallback(
    (input: AlarmInput): string | null => {
      try {
        alarmsStore.create(userId, input);
        setAlarmModalVisible(false);
        refreshData();
        onRefresh();
        return null;
      } catch (err) {
        return err instanceof Error
          ? err.message
          : 'Could not save this alarm right now.';
      }
    },
    [userId, refreshData, onRefresh],
  );
  const pullToRefresh = useCallback(() => {
    refreshData();
    onRefresh();
  }, [refreshData, onRefresh]);

  const renderWidget = (id: DashboardWidgetId) => {
    switch (id) {
      case 'up_next':
        return (
          <UpNextWidget
            key={id}
            summary={data.upNext}
            onPressItem={handleOpenScheduleItem}
            onOpenCalendar={openCalendar}
          />
        );
      case 'free_study_blocks':
        return (
          <FreeStudyBlocksWidget
            key={id}
            summary={data.freeStudy}
            minGapMinutes={actions.config.minFreeGapMinutes}
            onAddStudyBlock={actions.openStudyBlockSlot}
            onOpenCustomize={openCustomize}
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
            onOpenCalendar={openCalendar}
          />
        );
      case 'tasks_due':
        return (
          <TasksDueWidget
            key={id}
            summary={data.tasksSummary}
            todayStr={data.todayStr}
            onToggleTask={actions.toggleTaskComplete}
            onPressTask={pressTask}
            onOpenCalendar={openCalendar}
          />
        );
      case 'upcoming_reminders':
        return (
          <UpcomingRemindersWidget
            key={id}
            reminders={data.pendingReminders}
            todayStr={data.todayStr}
            onPressReminder={pressReminder}
            onOpenCalendar={openCalendar}
          />
        );
      case 'pinned_notes':
        return (
          <PinnedNotesWidget
            key={id}
            notes={data.highlightedNotes}
            hasPinnedNotes={data.pinnedNotesCount > 0}
            onPressNote={pressNote}
            onOpenAllNotes={openAllNotes}
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
            onRefresh={pullToRefresh}
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
            scheduleFilter={scheduleFilter}
            onClearScheduleFilter={clearScheduleFilter}
            onToggleTask={actions.toggleTaskComplete}
            onPressTask={pressTask}
            onPressScheduleItem={handleOpenScheduleItem}
            onPressReminder={pressReminder}
            onPressNote={pressNote}
            onAddStudyBlock={actions.openStudyBlockSlot}
            onOpenAddTask={actions.openAddTaskModal}
            onOpenSetAlarm={openSetAlarm}
            onOpenFocus={openFocus}
            onOpenAskUstp={openAskUstp}
            onOpenCalendarTab={onOpenCalendarTab}
            onOpenNotesTab={onOpenNotesTab}
            onOpenChatTab={onOpenChatTab}
            onOpenAlarms={openAlarms}
            onOpenCustomize={openCustomize}
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
              onOpenCustomize={openCustomize}
              onAskLafina={askLafina}
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
              onOpenAlarms={openAlarms}
            />

            {visibleWidgets.map(renderWidget)}
          </>
        )}
      </ScrollView>

      {blockModal.visible && (
        <AddBlockModal state={blockModal} timeFormat24h={timeFormat24h} />
      )}

      {taskModal.visible && (
        <AddTaskEventModal state={taskModal} timeFormat24h={timeFormat24h} />
      )}

      {alarmModalVisible && (
        <AlarmEditorModal
          visible={alarmModalVisible}
          alarm={null}
          use24h={timeFormat24h}
          onSave={handleSaveAlarm}
          onClose={closeSetAlarm}
        />
      )}

      {customizeVisible && (
        <CustomizeDashboardModal
          visible={customizeVisible}
          config={actions.config}
          onClose={closeCustomize}
          onApplyPreset={actions.applyPreset}
          onMoveWidget={actions.moveWidget}
          onToggleWidget={actions.toggleWidgetVisibility}
          onChangeMinGap={actions.setMinFreeGapMinutes}
          onChangeDefaultFilter={actions.setScheduleFilter}
          onReset={actions.resetConfig}
        />
      )}
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
