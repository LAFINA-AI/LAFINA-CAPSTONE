import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AlertCircle, RefreshCw} from 'lucide-react-native';
import {
  avatarSeedStore,
  getDefaultDashboardConfig,
  userStore,
  type DashboardConfig,
  type DashboardScheduleFilter,
  type DashboardWidgetId,
  type Reminder,
  type Task,
} from '../../../../storage';
import {isUstpSchoolEnabled} from '../../../../storage/ustpEligibility';
import {nextAlarm} from '../../../../scheduler/alarmService';
import {
  readPomodoro,
  subscribePomodoro,
} from '../../../../skills/pomodoroService';
import {useTheme} from '../../../contexts/ThemeContext';
import {avatarSource} from '../../../components/profile/avatarFile';
import {Fonts, ModernLayout, Spacing} from '../../../theme';
import type {CallNavigationTarget} from '../../../navigation/callNavigation';
import type {
  DashboardLoadedData,
  DashboardScheduleItem,
  FreeStudyBlock,
} from '../types';
import {
  buildHeroModel,
  buildTodayTimelineRows,
  HomeAlarmsRemindersCard,
  HomeFreeStudyCard,
  HomeHeader,
  HomeNotesCard,
  HomeTasksCard,
  QuickActionsRow,
  TodayTimelineCard,
  UpNextHeroCard,
} from './modern';

export interface ModernHomeContentProps {
  userId: string;
  refreshTrigger?: number;
  isActive?: boolean;
  now: Date;
  timeFormat24h: boolean;
  data: DashboardLoadedData;
  config?: DashboardConfig;
  visibleWidgets: readonly DashboardWidgetId[];
  scheduleFilter: DashboardScheduleFilter;
  onClearScheduleFilter: () => void;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  onPressScheduleItem: (item: DashboardScheduleItem) => void;
  onPressReminder: (reminder: Reminder) => void;
  onPressNote: (noteId: string) => void;
  onAddStudyBlock: (slot: FreeStudyBlock) => void;
  onOpenAddTask: () => void;
  onOpenSetAlarm: () => void;
  onOpenFocus: () => void;
  onOpenAskUstp: () => void;
  onOpenCalendarTab: (
    target?: Omit<CallNavigationTarget, 'ownerId' | 'screen'>,
  ) => void;
  onOpenNotesTab: (noteId?: string) => void;
  onOpenChatTab: (prefillPrompt?: string) => void;
  onOpenAlarms: () => void;
  onOpenCustomize: () => void;
  onRefresh: () => void;
}

const readActivePomodoro = (
  userId: string,
  nowMs: number,
): {minutes: number; deadlineMs: number} | null => {
  try {
    const effectiveNow = Math.max(nowMs, Date.now());
    const state = readPomodoro(userId, effectiveNow);
    if (!state.deadline || state.remaining <= 0) return null;
    return {
      minutes: Math.max(1, Math.ceil(state.remaining / 60)),
      deadlineMs: state.deadline,
    };
  } catch {
    return null;
  }
};

const DEFAULT_CONFIG = getDefaultDashboardConfig();

export const ModernHomeContent: React.FC<ModernHomeContentProps> = ({
  userId,
  refreshTrigger = 0,
  isActive = true,
  now,
  timeFormat24h,
  data,
  config = DEFAULT_CONFIG,
  visibleWidgets,
  scheduleFilter,
  onClearScheduleFilter,
  onToggleTask,
  onPressTask,
  onPressScheduleItem,
  onPressReminder,
  onPressNote,
  onAddStudyBlock,
  onOpenAddTask,
  onOpenSetAlarm,
  onOpenFocus,
  onOpenAskUstp,
  onOpenCalendarTab,
  onOpenNotesTab,
  onOpenChatTab,
  onOpenAlarms,
  onOpenCustomize,
  onRefresh,
}) => {
  const {colors, modernPalette} = useTheme();
  const [pomodoroTick, setPomodoroTick] = useState(0);

  useEffect(() => {
    return subscribePomodoro(userId, () => {
      setPomodoroTick(t => t + 1);
    });
  }, [userId]);

  const activePomodoro = useMemo(() => {
    void pomodoroTick;
    void refreshTrigger;
    return readActivePomodoro(userId, now.getTime());
  }, [userId, now, pomodoroTick, refreshTrigger]);

  const pomodoroActiveMinutes = activePomodoro?.minutes ?? null;
  const pomodoroDeadlineMs = activePomodoro?.deadlineMs ?? null;

  useEffect(() => {
    if (!pomodoroDeadlineMs) return undefined;
    const delayMs = Math.max(50, pomodoroDeadlineMs - Date.now() + 50);
    if (delayMs > 6 * 60 * 60 * 1000) return undefined;
    const timer = setTimeout(() => {
      setPomodoroTick(t => t + 1);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [pomodoroDeadlineMs]);

  const {photoSource, avatarSeed} = useMemo(() => {
    void refreshTrigger;
    let avatarUri: string | null = data.avatarUri ?? null;
    if (data.avatarUri === undefined) {
      try {
        avatarUri = userStore.getUserById(userId)?.avatarUri ?? null;
      } catch {
        avatarUri = null;
      }
    }
    let seed: string | null = data.avatarSeed ?? null;
    if (data.avatarSeed === undefined) {
      try {
        seed = avatarSeedStore.get(userId);
      } catch {
        seed = null;
      }
    }
    return {
      photoSource: avatarSource(avatarUri),
      avatarSeed: seed,
    };
  }, [userId, refreshTrigger, data.avatarUri, data.avatarSeed]);

  const activeAlarm = useMemo(() => {
    void refreshTrigger;
    try {
      return nextAlarm(userId, now);
    } catch {
      return null;
    }
  }, [userId, now, refreshTrigger]);

  const ustpEnabled = useMemo(() => {
    if (data.ustpSchoolEnabled !== undefined) return data.ustpSchoolEnabled;
    try {
      return isUstpSchoolEnabled(userId);
    } catch {
      return false;
    }
  }, [data.ustpSchoolEnabled, userId]);

  const allPendingTasks = useMemo(
    () => [
      ...data.tasksSummary.overdueTasks,
      ...data.tasksSummary.dueTodayTasks,
      ...data.tasksSummary.upcomingTasks,
    ],
    [data.tasksSummary],
  );

  const completedTasksCount = data.tasksSummary.completedCount ?? 0;

  const hero = useMemo(
    () =>
      buildHeroModel({
        data,
        activeAlarm,
        allPendingTasks,
        completedTasksCount,
        now,
        timeFormat24h,
        ustpEnabled,
      }),
    [
      data,
      activeAlarm,
      allPendingTasks,
      completedTasksCount,
      now,
      timeFormat24h,
      ustpEnabled,
    ],
  );

  const handlePressHero = useCallback(() => {
    switch (hero.actionKind) {
      case 'calendar_item':
      case 'tomorrow':
        onOpenCalendarTab({date: hero.targetDate ?? data.todayStr});
        return;
      case 'alarms':
        onOpenAlarms();
        return;
      case 'task':
        if (hero.targetTask) {
          onPressTask(hero.targetTask);
        } else {
          onOpenCalendarTab();
        }
        return;
      case 'chat':
        onOpenChatTab();
        return;
    }
  }, [
    hero,
    data.todayStr,
    onOpenCalendarTab,
    onOpenAlarms,
    onPressTask,
    onOpenChatTab,
  ]);

  const handleAskPrimary = useCallback(() => {
    if (ustpEnabled) {
      onOpenAskUstp();
    } else {
      onOpenChatTab();
    }
  }, [ustpEnabled, onOpenAskUstp, onOpenChatTab]);

  const handleSeeAllToday = useCallback(
    () =>
      onOpenCalendarTab({
        scheduleSection: 'calendar',
        date: data.todayStr,
      }),
    [onOpenCalendarTab, data.todayStr],
  );

  const handleOpenAllNotes = useCallback(
    () => onOpenNotesTab(),
    [onOpenNotesTab],
  );

  const filteredTodayItems = useMemo(() => {
    if (scheduleFilter === 'classes') {
      return data.todayItems.filter(item => item.kind === 'class');
    }
    if (scheduleFilter === 'events') {
      return data.todayItems.filter(item => item.kind === 'event');
    }
    return data.todayItems;
  }, [data.todayItems, scheduleFilter]);

  const {hasLiveUnfilteredItem, nextUnfilteredStartMinutes} = useMemo(() => {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let hasLive = false;
    let nextStart: number | null = null;
    for (const item of data.todayItems) {
      if (item.startMinutes <= nowMinutes && item.endMinutes > nowMinutes) {
        hasLive = true;
      } else if (item.startMinutes > nowMinutes) {
        if (nextStart === null || item.startMinutes < nextStart) {
          nextStart = item.startMinutes;
        }
      }
    }
    return {
      hasLiveUnfilteredItem: hasLive,
      nextUnfilteredStartMinutes: nextStart,
    };
  }, [data.todayItems, now]);

  const timelineRows = useMemo(
    () =>
      buildTodayTimelineRows({
        items: filteredTodayItems,
        freeStudy: data.freeStudy,
        now,
        timeFormat24h,
        hasLiveUnfilteredItem,
        nextUnfilteredStartMinutes,
      }),
    [
      filteredTodayItems,
      data.freeStudy,
      now,
      timeFormat24h,
      hasLiveUnfilteredItem,
      nextUnfilteredStartMinutes,
    ],
  );

  const isCompactDensity = config.homeDensity === 'compact';

  const renderWidget = (id: DashboardWidgetId): React.ReactNode => {
    switch (id) {
      case 'up_next':
        return (
          <UpNextHeroCard
            key={id}
            hero={hero}
            styleVariant={config.upNextStyle}
            tone={config.upNextTone}
            compact={isCompactDensity}
            isActive={isActive}
            onPress={handlePressHero}
            onLongPress={onOpenCustomize}
          />
        );
      case 'today_schedule':
        return (
          <TodayTimelineCard
            key={id}
            rows={timelineRows}
            scheduleFilter={scheduleFilter}
            pomodoroActiveMinutes={pomodoroActiveMinutes}
            onClearFilter={onClearScheduleFilter}
            onPressItem={onPressScheduleItem}
            onPressFocus={onOpenFocus}
            onAddStudyBlock={onAddStudyBlock}
            onSeeAll={handleSeeAllToday}
          />
        );
      case 'tasks_due':
        return (
          <HomeTasksCard
            key={id}
            tasks={allPendingTasks}
            todayStr={data.todayStr}
            timeFormat24h={timeFormat24h}
            onToggleTask={onToggleTask}
            onPressTask={onPressTask}
            onAddTask={onOpenAddTask}
          />
        );
      case 'free_study_blocks':
        return (
          <HomeFreeStudyCard
            key={id}
            summary={data.freeStudy}
            timeFormat24h={timeFormat24h}
            onAddStudyBlock={onAddStudyBlock}
            onOpenCustomize={onOpenCustomize}
          />
        );
      case 'upcoming_reminders':
        return (
          <HomeAlarmsRemindersCard
            key={id}
            activeAlarm={activeAlarm}
            reminders={data.pendingReminders}
            todayStr={data.todayStr}
            timeFormat24h={timeFormat24h}
            onOpenAlarms={onOpenAlarms}
            onSetAlarm={onOpenSetAlarm}
            onPressReminder={onPressReminder}
          />
        );
      case 'pinned_notes':
        return (
          <HomeNotesCard
            key={id}
            notes={data.highlightedNotes}
            onPressNote={onPressNote}
            onOpenAllNotes={handleOpenAllNotes}
          />
        );
      default:
        return null;
    }
  };

  const heroFirst = visibleWidgets[0] === 'up_next';
  const remainingWidgets = heroFirst ? visibleWidgets.slice(1) : visibleWidgets;

  return (
    <View
      style={[styles.container, isCompactDensity && styles.containerCompact]}
    >
      <HomeHeader
        now={now}
        greetingName={data.greetingName}
        academicBadge={data.academicBadge}
        photoSource={photoSource}
        avatarSeed={avatarSeed}
        showAvatar={config.showGreetingAvatar}
        onOpenCustomize={onOpenCustomize}
      />

      {data.readError && (
        <View
          style={[
            styles.errorBanner,
            {
              backgroundColor: modernPalette.dangerSoft,
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
            onPress={onRefresh}
            activeOpacity={0.75}
          >
            <RefreshCw size={13} color={colors.error} />
            <Text style={[styles.retryText, {color: colors.error}]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {heroFirst && (
        <UpNextHeroCard
          hero={hero}
          styleVariant={config.upNextStyle}
          tone={config.upNextTone}
          compact={isCompactDensity}
          isActive={isActive}
          onPress={handlePressHero}
          onLongPress={onOpenCustomize}
        />
      )}

      {config.showQuickActions && (
        <QuickActionsRow
          actions={config.quickActions}
          compact={isCompactDensity}
          ustpEnabled={ustpEnabled}
          pomodoroActiveMinutes={pomodoroActiveMinutes}
          onAddTask={onOpenAddTask}
          onSetAlarm={onOpenSetAlarm}
          onOpenFocus={onOpenFocus}
          onAskPrimary={handleAskPrimary}
          onOpenNotes={handleOpenAllNotes}
          onOpenSchedule={handleSeeAllToday}
        />
      )}

      {remainingWidgets.map(renderWidget)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 18,
  },
  containerCompact: {
    gap: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: ModernLayout.borderRadiusSubCard,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 12.5,
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
    fontSize: 12,
    fontWeight: '700',
  },
});
