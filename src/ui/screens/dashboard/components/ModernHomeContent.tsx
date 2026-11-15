import React, {useId, useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlarmClock,
  AlertCircle,
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react-native';
import Svg, {Circle, Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {
  avatarSeedStore,
  userStore,
  type DashboardWidgetId,
  type Reminder,
  type Task,
} from '../../../../storage';
import {formatAlarmTime} from '../../../../scheduler/alarmSchedule';
import {nextAlarm} from '../../../../scheduler/alarmService';
import {useTheme} from '../../../contexts/ThemeContext';
import {CharacterAvatar} from '../../../components/profile/CharacterAvatar';
import {avatarSource} from '../../../components/profile/avatarFile';
import {Fonts, ModernLayout, ModernShadows, Spacing} from '../../../theme';
import type {CallNavigationTarget} from '../../../navigation/callNavigation';
import {
  formatDurationMinutes,
  formatLocalDateStr,
  formatTimeLabel,
} from '../dashboardCalculations';
import type {
  DashboardLoadedData,
  DashboardScheduleItem,
  FreeStudyBlock,
} from '../types';

type HomeFilter = 'All' | 'Tasks' | 'Alarms' | 'Docs';

const HOME_FILTERS: readonly HomeFilter[] = ['All', 'Tasks', 'Alarms', 'Docs'];

export interface ModernHomeContentProps {
  userId: string;
  now: Date;
  timeFormat24h: boolean;
  data: DashboardLoadedData;
  visibleWidgets: readonly DashboardWidgetId[];
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  onPressScheduleItem: (item: DashboardScheduleItem) => void;
  onPressReminder: (reminder: Reminder) => void;
  onPressNote: (noteId: string) => void;
  onAddStudyBlock: (slot: FreeStudyBlock) => void;
  onOpenCalendarTab: (
    target?: Omit<CallNavigationTarget, 'ownerId' | 'screen'>,
  ) => void;
  onOpenNotesTab: (noteId?: string) => void;
  onOpenChatTab: (prefillPrompt?: string) => void;
  onOpenAlarms: () => void;
  onOpenCustomize: () => void;
  onRefresh: () => void;
}

const formatTaskDueShort = (task: Task, todayStr: string): string => {
  if (!task.dueDate) return 'No due date';
  if (task.dueDate < todayStr) return 'Overdue';
  if (task.dueDate === todayStr) {
    return task.dueTime ? `Today, ${formatTimeLabel(task.dueTime)}` : 'Today';
  }
  const dt = new Date(`${task.dueDate}T12:00:00`);
  const dayLabel = Number.isNaN(dt.getTime())
    ? task.dueDate
    : dt.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  return task.dueTime
    ? `${dayLabel}, ${formatTimeLabel(task.dueTime)}`
    : dayLabel;
};

const formatReminderShort = (isoStr: string, todayStr: string): string => {
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  const datePart = formatLocalDateStr(dt);
  const timeLabel = dt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (datePart === todayStr) return timeLabel;
  const dayLabel = dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${dayLabel} · ${timeLabel}`;
};

interface ProgressRingProps {
  progress: number;
  label: string;
  size?: number;
  trackColor: string;
  ringColor: string;
  textColor: string;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  label,
  size = 46,
  trackColor,
  ringColor,
  textColor,
}) => {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circ * (1 - clamped);

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size} style={{transform: [{rotate: '-90deg'}]}}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Text style={[styles.ringLabel, {color: textColor}]}>{label}</Text>
    </View>
  );
};

export const ModernHomeContent: React.FC<ModernHomeContentProps> = ({
  userId,
  now,
  timeFormat24h,
  data,
  visibleWidgets,
  onToggleTask,
  onPressTask,
  onPressScheduleItem,
  onPressReminder,
  onPressNote,
  onAddStudyBlock,
  onOpenCalendarTab,
  onOpenNotesTab,
  onOpenChatTab,
  onOpenAlarms,
  onOpenCustomize,
  onRefresh,
}) => {
  const {colors, isDarkMode, modernPalette} = useTheme();
  const reactId = useId();
  const heroGradientId = useMemo(
    () => `homeHeroGrad_${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [reactId],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<HomeFilter>('All');
  const [studySlotsExpanded, setStudySlotsExpanded] = useState(false);

  const visibleSet = useMemo(() => new Set(visibleWidgets), [visibleWidgets]);
  const isVisible = (id: DashboardWidgetId): boolean => visibleSet.has(id);

  const {photoSource, avatarSeed} = useMemo(() => {
    let avatarUri: string | null = null;
    try {
      avatarUri = userStore.getUserById(userId)?.avatarUri ?? null;
    } catch {
      avatarUri = null;
    }
    let seed = userId || 'student';
    try {
      seed = avatarSeedStore.get(userId) || userId || 'student';
    } catch {
      seed = userId || 'student';
    }
    return {
      photoSource: avatarSource(avatarUri),
      avatarSeed: seed,
    };
  }, [userId]);

  const activeAlarm = useMemo(() => {
    try {
      return nextAlarm(userId, now);
    } catch {
      return null;
    }
  }, [userId, now]);

  const allPendingTasks = useMemo(
    () => [
      ...data.tasksSummary.overdueTasks,
      ...data.tasksSummary.dueTodayTasks,
      ...data.tasksSummary.upcomingTasks,
    ],
    [data.tasksSummary],
  );

  const completedTasksCount = data.tasksSummary.completedCount ?? 0;
  const totalTasksCount = completedTasksCount + allPendingTasks.length;
  const taskProgress =
    totalTasksCount > 0 ? completedTasksCount / totalTasksCount : 0;

  const query = searchQuery.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    if (!query) return allPendingTasks;
    return allPendingTasks.filter(
      t =>
        t.title.toLowerCase().includes(query) ||
        (t.category && t.category.toLowerCase().includes(query)),
    );
  }, [allPendingTasks, query]);

  const filteredReminders = useMemo(() => {
    if (!query) return data.pendingReminders;
    return data.pendingReminders.filter(r =>
      r.task.toLowerCase().includes(query),
    );
  }, [data.pendingReminders, query]);

  const filteredNotes = useMemo(() => {
    if (!query) return data.highlightedNotes;
    return data.highlightedNotes.filter(
      n =>
        n.title.toLowerCase().includes(query) ||
        n.body.toLowerCase().includes(query) ||
        (n.category && n.category.toLowerCase().includes(query)),
    );
  }, [data.highlightedNotes, query]);

  const filteredSchedule = useMemo(() => {
    if (!query) return data.todayItems;
    return data.todayItems.filter(
      item =>
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(query)),
    );
  }, [data.todayItems, query]);

  const hero = useMemo(() => {
    const primary = data.upNext.primaryItem;
    if (
      (data.upNext.mode === 'live' || data.upNext.mode === 'upcoming') &&
      primary
    ) {
      const timeRange = `${formatTimeLabel(
        primary.startTime,
      )} – ${formatTimeLabel(primary.endTime)}`;
      const detailParts = [
        data.upNext.mode === 'live' && data.upNext.minutesRemaining !== null
          ? `${formatDurationMinutes(data.upNext.minutesRemaining)} left`
          : `Today · ${timeRange}`,
        primary.subtitle,
      ].filter(Boolean);

      return {
        badge: data.upNext.mode === 'live' ? 'LIVE NOW' : 'UP NEXT',
        title: primary.title,
        subtitle: detailParts.join(' · '),
        cta: 'VIEW SCHEDULE',
        onPress: () => onPressScheduleItem(primary),
      };
    }

    if (activeAlarm) {
      const timeStr = formatAlarmTime(
        activeAlarm.alarm.hour,
        activeAlarm.alarm.minute,
        timeFormat24h,
      );
      return {
        badge: 'NEXT ALARM',
        title: activeAlarm.alarm.label || 'Morning class prep',
        subtitle: `Today · ${timeStr}`,
        cta: 'VIEW ALARM',
        onPress: onOpenAlarms,
      };
    }

    if (allPendingTasks.length > 0) {
      const firstTask = allPendingTasks[0];
      return {
        badge: 'TO DO NEXT',
        title: firstTask.title,
        subtitle: formatTaskDueShort(firstTask, data.todayStr),
        cta: 'VIEW TASKS',
        onPress: () => onPressTask(firstTask),
      };
    }

    if (data.upNext.tomorrowPreview) {
      const tomorrow = data.upNext.tomorrowPreview;
      return {
        badge: 'TOMORROW',
        title: tomorrow.title,
        subtitle: `Tomorrow · ${formatTimeLabel(tomorrow.startTime)}`,
        cta: 'VIEW SCHEDULE',
        onPress: () => onPressScheduleItem(tomorrow),
      };
    }

    return {
      badge: 'ALL CLEAR',
      title: 'No more classes or events today',
      subtitle: 'Ask LAFINA about your handbook or plan your study day',
      cta: 'ASK LAFINA',
      onPress: () => onOpenChatTab(),
    };
  }, [
    data.upNext,
    data.todayStr,
    activeAlarm,
    timeFormat24h,
    allPendingTasks,
    onPressScheduleItem,
    onOpenAlarms,
    onPressTask,
    onOpenChatTab,
  ]);

  const firstStudySlot = data.freeStudy.freeBlocks[0] ?? null;
  const hasAlertDot = Boolean(activeAlarm || data.pendingReminders.length > 0);
  const subtitleText = data.academicBadge || 'USTP · Cagayan de Oro';
  const heroGradientColors = isDarkMode
    ? ['#6E7FF3', '#4734D4']
    : ['#95AEFF', '#6C4DFF'];

  return (
    <View style={styles.container}>
      {/* Top Greeting Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerIdentity}>
          <View
            style={[
              styles.avatarFrame,
              {
                borderColor: modernPalette.accent,
                backgroundColor: modernPalette.cream,
              },
            ]}
          >
            {photoSource ? (
              <Image
                source={photoSource}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <CharacterAvatar
                seed={avatarSeed}
                size={40}
                testID="home-character-avatar"
              />
            )}
          </View>
          <View style={styles.greetingColumn}>
            <Text
              style={[styles.greetingTitle, {color: modernPalette.text}]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              Hello, {data.greetingName}
            </Text>
            <Text
              style={[styles.greetingSub, {color: modernPalette.muted}]}
              numberOfLines={1}
            >
              {subtitleText}
            </Text>
          </View>
        </View>

        <View style={styles.headerButtons}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open alarms"
            onPress={onOpenAlarms}
            activeOpacity={0.8}
            style={[
              styles.circleActionBtn,
              ModernShadows.subtle,
              {
                backgroundColor: modernPalette.card,
                borderColor: modernPalette.border,
              },
            ]}
          >
            <Bell color={modernPalette.text} size={19} />
            {hasAlertDot && (
              <View
                style={[
                  styles.notifDot,
                  {backgroundColor: modernPalette.peachInk},
                ]}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Customize dashboard"
            testID="dashboard-customize-btn"
            onPress={onOpenCustomize}
            activeOpacity={0.8}
            style={[
              styles.circleActionBtn,
              ModernShadows.subtle,
              {
                backgroundColor: modernPalette.card,
                borderColor: modernPalette.border,
              },
            ]}
          >
            <SlidersHorizontal color={modernPalette.text} size={17} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banner if local storage read failed */}
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

      {/* Pill Search / Ask Bar */}
      <View
        style={[
          styles.searchPill,
          {
            backgroundColor: modernPalette.surface,
            borderColor: modernPalette.border,
          },
        ]}
      >
        <Search color={modernPalette.muted} size={18} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search handbook, classes, notes..."
          placeholderTextColor={modernPalette.muted}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (searchQuery.trim()) {
              onOpenChatTab(searchQuery.trim());
            }
          }}
          style={[styles.searchInput, {color: modernPalette.text}]}
        />
        {searchQuery.trim().length > 0 && (
          <Pressable
            onPress={() => onOpenChatTab(searchQuery.trim())}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Ask LAFINA"
          >
            <Text style={[styles.searchGoText, {color: modernPalette.accent}]}>
              Ask
            </Text>
          </Pressable>
        )}
      </View>

      {/* Periwinkle / Indigo Hero Card (No Mascot) */}
      {isVisible('up_next') && (
        <Pressable
          testID="dashboard-widget-up-next"
          onPress={hero.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${hero.badge}: ${hero.title}`}
          style={[styles.heroCard, ModernShadows.floating]}
        >
          <Svg
            width="100%"
            height="100%"
            style={StyleSheet.absoluteFill}
            preserveAspectRatio="none"
          >
            <Defs>
              <LinearGradient id={heroGradientId} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={heroGradientColors[0]} />
                <Stop offset="1" stopColor={heroGradientColors[1]} />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill={`url(#${heroGradientId})`}
            />
          </Svg>
          <View pointerEvents="none" style={styles.heroGlowTopRight} />
          <View pointerEvents="none" style={styles.heroGlowBottomRight} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroBadgePill}>
              <Sparkles color="#FFFFFF" size={13} />
              <Text style={styles.heroPillText}>{hero.badge}</Text>
            </View>
            <View style={styles.heroStatsPill}>
              <Text style={styles.heroPillText}>
                {data.todayItems.length} today · {allPendingTasks.length} todo
              </Text>
            </View>
          </View>

          <View style={styles.heroBody}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {hero.title}
            </Text>
            <Text style={styles.heroSub} numberOfLines={2}>
              {hero.subtitle}
            </Text>
          </View>

          <View style={styles.heroFooter}>
            <TouchableOpacity
              onPress={hero.onPress}
              activeOpacity={0.85}
              style={styles.heroCtaBtn}
            >
              <Text style={styles.heroCtaText}>{hero.cta}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {/* Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {HOME_FILTERS.map(item => {
          const active = filter === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{selected: active}}
              onPress={() => setFilter(item)}
              style={[
                styles.filterChip,
                active
                  ? {
                      backgroundColor: modernPalette.darkInkBtn,
                      borderColor: modernPalette.darkInkBtn,
                    }
                  : {
                      backgroundColor: modernPalette.card,
                      borderColor: modernPalette.border,
                    },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  {color: active ? '#FFFFFF' : modernPalette.text},
                ]}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 2-Column Bento Grid */}
      <View style={styles.bentoRow}>
        {/* Left Bento Card: Study Tasks */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Study Tasks"
          onPress={() =>
            setFilter(prev => (prev === 'Tasks' ? 'All' : 'Tasks'))
          }
          style={[
            styles.bentoCard,
            ModernShadows.card,
            {backgroundColor: modernPalette.lilac},
          ]}
        >
          <View style={styles.bentoTopRow}>
            <View
              style={[
                styles.bentoIconCircle,
                {backgroundColor: modernPalette.darkInkBtn},
              ]}
            >
              <CheckCircle2 color="#FFFFFF" size={18} />
            </View>
            <ProgressRing
              progress={taskProgress}
              label={`${completedTasksCount}/${totalTasksCount}`}
              trackColor={
                isDarkMode ? 'rgba(247,246,255,0.18)' : 'rgba(21,19,39,0.12)'
              }
              ringColor={isDarkMode ? modernPalette.accent : modernPalette.text}
              textColor={modernPalette.text}
            />
          </View>

          <View style={styles.bentoBottom}>
            <Text
              style={[styles.bentoCaption, {color: modernPalette.lilacInk}]}
              numberOfLines={1}
            >
              {allPendingTasks.length} pending
            </Text>
            <Text
              style={[styles.bentoTitle, {color: modernPalette.text}]}
              numberOfLines={1}
            >
              Study Tasks
            </Text>
          </View>
        </Pressable>

        {/* Right Bento Card: Campus Hub / Notes */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Campus Hub and Notes"
          onPress={() => onOpenNotesTab()}
          style={[
            styles.bentoCard,
            ModernShadows.card,
            {backgroundColor: modernPalette.cream},
          ]}
        >
          <View style={styles.bentoTopRow}>
            <View
              style={[
                styles.bentoIconCircle,
                {backgroundColor: modernPalette.darkInkBtn},
              ]}
            >
              <BookOpen color="#FFFFFF" size={18} />
            </View>
            <View
              style={[
                styles.bentoBadgePill,
                {
                  backgroundColor: isDarkMode
                    ? 'rgba(255,255,255,0.16)'
                    : 'rgba(255,255,255,0.78)',
                },
              ]}
            >
              <Text
                style={[
                  styles.bentoBadgeText,
                  {color: isDarkMode ? modernPalette.text : '#151327'},
                ]}
              >
                {data.highlightedNotes.length} Offline
              </Text>
            </View>
          </View>

          <View style={styles.bentoBottom}>
            <Text
              style={[styles.bentoCaption, {color: modernPalette.creamInk}]}
              numberOfLines={1}
            >
              {data.pinnedNotesCount > 0
                ? `${data.pinnedNotesCount} pinned`
                : 'Notes & Handbook'}
            </Text>
            <Text
              style={[styles.bentoTitle, {color: modernPalette.text}]}
              numberOfLines={1}
            >
              Campus Hub
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Mint Free Study Banner Card (No Mascot) */}
      {(filter === 'All' || filter === 'Docs') &&
        isVisible('free_study_blocks') && (
          <View
            testID="dashboard-widget-free-study-blocks"
            style={[
              styles.mintBanner,
              ModernShadows.card,
              {backgroundColor: modernPalette.mint},
            ]}
          >
            <View style={styles.mintBannerTop}>
              <Pressable
                style={styles.mintTextCol}
                onPress={() => {
                  if (data.freeStudy.freeBlocks.length > 1) {
                    setStudySlotsExpanded(prev => !prev);
                  }
                }}
              >
                <Text
                  style={[styles.mintTitle, {color: modernPalette.text}]}
                  numberOfLines={1}
                >
                  {data.freeStudy.dayEnded
                    ? 'Day Wrapped Up'
                    : `Free Study: ${formatDurationMinutes(
                        data.freeStudy.usableStudyFreeMinutes,
                      )}`}
                </Text>
                <Text
                  style={[styles.mintSub, {color: modernPalette.muted}]}
                  numberOfLines={1}
                >
                  {firstStudySlot
                    ? `Next gap · ${formatTimeLabel(
                        firstStudySlot.startTime,
                      )} – ${formatTimeLabel(firstStudySlot.endTime)}`
                    : data.freeStudy.dayEnded
                    ? 'Active study hours ended for today'
                    : 'No open study gaps remaining today'}
                </Text>
              </Pressable>

              {firstStudySlot && (
                <TouchableOpacity
                  testID={`free-slot-add-${firstStudySlot.id}`}
                  onPress={() => onAddStudyBlock(firstStudySlot)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Add study block from ${formatTimeLabel(
                    firstStudySlot.startTime,
                  )} to ${formatTimeLabel(firstStudySlot.suggestedEndTime)}`}
                  style={[
                    styles.mintActionPill,
                    {backgroundColor: modernPalette.darkInkBtn},
                  ]}
                >
                  <Plus size={13} color="#FFFFFF" />
                  <Text style={styles.mintActionText}>Study</Text>
                </TouchableOpacity>
              )}
            </View>

            {studySlotsExpanded && data.freeStudy.freeBlocks.length > 1 && (
              <View style={styles.extraSlotsList}>
                {data.freeStudy.freeBlocks.slice(1, 4).map(slot => (
                  <View
                    key={slot.id}
                    style={[
                      styles.extraSlotRow,
                      {borderTopColor: 'rgba(0,0,0,0.06)'},
                    ]}
                  >
                    <View style={styles.extraSlotLeft}>
                      <Clock size={13} color={modernPalette.mintInk} />
                      <Text
                        style={[
                          styles.extraSlotText,
                          {color: modernPalette.text},
                        ]}
                      >
                        {formatTimeLabel(slot.startTime)} –{' '}
                        {formatTimeLabel(slot.endTime)} (
                        {formatDurationMinutes(slot.durationMinutes)})
                      </Text>
                    </View>
                    <TouchableOpacity
                      testID={`free-slot-add-${slot.id}`}
                      onPress={() => onAddStudyBlock(slot)}
                      activeOpacity={0.8}
                      style={[
                        styles.extraSlotBtn,
                        {backgroundColor: modernPalette.card},
                      ]}
                    >
                      <Text
                        style={[
                          styles.extraSlotBtnText,
                          {color: modernPalette.text},
                        ]}
                      >
                        + Study
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      {/* Upcoming Tasks Card */}
      {(filter === 'All' || filter === 'Tasks') && isVisible('tasks_due') && (
        <View
          testID="dashboard-widget-tasks-due"
          style={[
            styles.sectionCard,
            ModernShadows.card,
            {backgroundColor: modernPalette.card},
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, {color: modernPalette.text}]}>
              Upcoming Tasks
            </Text>
            <TouchableOpacity
              onPress={() => onOpenCalendarTab()}
              activeOpacity={0.75}
            >
              <Text style={[styles.sectionLink, {color: modernPalette.accent}]}>
                + Add
              </Text>
            </TouchableOpacity>
          </View>

          {filteredTasks.length > 0 ? (
            <View>
              {filteredTasks
                .slice(0, filter === 'Tasks' ? 8 : 3)
                .map((task, idx, arr) => {
                  const isOverdue = Boolean(
                    task.dueDate && task.dueDate < data.todayStr,
                  );
                  const metaParts = [
                    task.category || 'Academic',
                    task.priority,
                    formatTaskDueShort(task, data.todayStr),
                  ];
                  return (
                    <View
                      key={task.id}
                      style={[
                        styles.flatRow,
                        {
                          borderBottomColor: modernPalette.border,
                          borderBottomWidth:
                            idx < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
                        },
                      ]}
                    >
                      <TouchableOpacity
                        testID={`dashboard-task-toggle-${task.id}`}
                        onPress={() => onToggleTask(task)}
                        activeOpacity={0.75}
                        accessibilityRole="checkbox"
                        accessibilityState={{checked: task.isCompleted}}
                        accessibilityLabel={`Mark ${task.title} complete`}
                        style={[
                          styles.circleCheck,
                          task.isCompleted
                            ? {
                                backgroundColor: modernPalette.accent,
                                borderColor: modernPalette.accent,
                              }
                            : {borderColor: modernPalette.muted},
                        ]}
                      >
                        {task.isCompleted && (
                          <Check size={13} color="#FFFFFF" />
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.rowBody}
                        onPress={() => onPressTask(task)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[styles.rowTitle, {color: modernPalette.text}]}
                          numberOfLines={1}
                        >
                          {task.title}
                        </Text>
                        <Text
                          style={[
                            styles.rowSub,
                            {
                              color: isOverdue
                                ? modernPalette.danger
                                : modernPalette.muted,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {metaParts.join(' · ')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
            </View>
          ) : (
            <Text style={[styles.emptyCopy, {color: modernPalette.muted}]}>
              You’re all caught up.
            </Text>
          )}
        </View>
      )}

      {/* Alarms Card */}
      {(filter === 'All' || filter === 'Alarms') &&
        isVisible('upcoming_reminders') && (
          <View
            testID="dashboard-widget-upcoming-reminders"
            style={[
              styles.sectionCard,
              ModernShadows.card,
              {backgroundColor: modernPalette.blueSoft},
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <Pressable onPress={onOpenAlarms}>
                <Text
                  style={[styles.sectionTitle, {color: modernPalette.text}]}
                >
                  Alarms
                </Text>
              </Pressable>
              <TouchableOpacity onPress={onOpenAlarms} activeOpacity={0.75}>
                <Text
                  style={[styles.sectionLink, {color: modernPalette.accent}]}
                >
                  + Add
                </Text>
              </TouchableOpacity>
            </View>

            {activeAlarm || filteredReminders.length > 0 ? (
              <View>
                {activeAlarm && !query && (
                  <TouchableOpacity
                    testID="dashboard-next-alarm"
                    onPress={onOpenAlarms}
                    activeOpacity={0.75}
                    style={[
                      styles.flatRow,
                      {
                        borderBottomColor: modernPalette.border,
                        borderBottomWidth:
                          filteredReminders.length > 0
                            ? StyleSheet.hairlineWidth
                            : 0,
                      },
                    ]}
                  >
                    <AlarmClock color={modernPalette.blueInk} size={18} />
                    <View style={styles.rowBody}>
                      <Text
                        style={[styles.rowTitle, {color: modernPalette.text}]}
                        numberOfLines={1}
                      >
                        {activeAlarm.alarm.label || 'Morning class prep'}
                      </Text>
                      <Text
                        style={[styles.rowSub, {color: modernPalette.muted}]}
                        numberOfLines={1}
                      >
                        {formatAlarmTime(
                          activeAlarm.alarm.hour,
                          activeAlarm.alarm.minute,
                          timeFormat24h,
                        )}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {filteredReminders
                  .slice(0, filter === 'Alarms' ? 6 : 3)
                  .map((rem, idx, arr) => (
                    <TouchableOpacity
                      key={rem.id}
                      onPress={() => onPressReminder(rem)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Reminder: ${rem.task}`}
                      style={[
                        styles.flatRow,
                        {
                          borderBottomColor: modernPalette.border,
                          borderBottomWidth:
                            idx < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
                        },
                      ]}
                    >
                      <AlarmClock color={modernPalette.blueInk} size={18} />
                      <View style={styles.rowBody}>
                        <Text
                          style={[styles.rowTitle, {color: modernPalette.text}]}
                          numberOfLines={1}
                        >
                          {rem.task}
                        </Text>
                        <Text
                          style={[styles.rowSub, {color: modernPalette.muted}]}
                          numberOfLines={1}
                        >
                          {formatReminderShort(rem.triggerAt, data.todayStr)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
              </View>
            ) : (
              <Text style={[styles.emptyCopy, {color: modernPalette.muted}]}>
                No active alarms.
              </Text>
            )}
          </View>
        )}

      {/* Today's Schedule Card */}
      {filter === 'All' && isVisible('today_schedule') && (
        <View
          testID="dashboard-widget-today-schedule"
          style={[
            styles.sectionCard,
            ModernShadows.card,
            {backgroundColor: modernPalette.card},
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, {color: modernPalette.text}]}>
              Today’s Schedule
            </Text>
            <TouchableOpacity
              onPress={() =>
                onOpenCalendarTab({
                  scheduleSection: 'calendar',
                  date: data.todayStr,
                })
              }
              activeOpacity={0.75}
            >
              <Text style={[styles.sectionLink, {color: modernPalette.accent}]}>
                See all
              </Text>
            </TouchableOpacity>
          </View>

          {filteredSchedule.length > 0 ? (
            <View>
              {filteredSchedule.slice(0, 3).map((item, idx, arr) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => onPressScheduleItem(item)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${formatTimeLabel(
                    item.startTime,
                  )}`}
                  style={[
                    styles.flatRow,
                    {
                      borderBottomColor: modernPalette.border,
                      borderBottomWidth:
                        idx < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.scheduleDot,
                      {backgroundColor: item.color || modernPalette.accent},
                    ]}
                  />
                  <View style={styles.rowBody}>
                    <Text
                      style={[styles.rowTitle, {color: modernPalette.text}]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.rowSub, {color: modernPalette.muted}]}
                      numberOfLines={1}
                    >
                      {formatTimeLabel(item.startTime)} –{' '}
                      {formatTimeLabel(item.endTime)}
                      {item.subtitle ? ` · ${item.subtitle}` : ''}
                    </Text>
                  </View>
                  <Calendar size={16} color={modernPalette.muted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyCopy, {color: modernPalette.muted}]}>
              No classes or events scheduled today.
            </Text>
          )}
        </View>
      )}

      {/* Notes / Docs Card */}
      {(filter === 'All' || filter === 'Docs') && isVisible('pinned_notes') && (
        <View
          testID="dashboard-widget-pinned-notes"
          style={[
            styles.sectionCard,
            ModernShadows.card,
            {backgroundColor: modernPalette.card},
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, {color: modernPalette.text}]}>
              Campus Notes
            </Text>
            <TouchableOpacity
              onPress={() => onOpenNotesTab()}
              activeOpacity={0.75}
            >
              <Text style={[styles.sectionLink, {color: modernPalette.accent}]}>
                All notes
              </Text>
            </TouchableOpacity>
          </View>

          {filteredNotes.length > 0 ? (
            <View>
              {filteredNotes
                .slice(0, filter === 'Docs' ? 6 : 3)
                .map((note, idx, arr) => (
                  <TouchableOpacity
                    key={note.id}
                    testID={`dashboard-note-item-${note.id}`}
                    onPress={() => onPressNote(note.id)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Open note ${note.title}`}
                    style={[
                      styles.flatRow,
                      {
                        borderBottomColor: modernPalette.border,
                        borderBottomWidth:
                          idx < arr.length - 1 ? StyleSheet.hairlineWidth : 0,
                      },
                    ]}
                  >
                    <FileText color={modernPalette.lilacInk} size={18} />
                    <View style={styles.rowBody}>
                      <Text
                        style={[styles.rowTitle, {color: modernPalette.text}]}
                        numberOfLines={1}
                      >
                        {note.title || 'Untitled Note'}
                      </Text>
                      <Text
                        style={[styles.rowSub, {color: modernPalette.muted}]}
                        numberOfLines={1}
                      >
                        {note.category && note.category !== 'None'
                          ? note.category
                          : note.isPinned
                          ? 'Pinned note'
                          : 'Saved offline'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
          ) : (
            <Text style={[styles.emptyCopy, {color: modernPalette.muted}]}>
              No notes saved yet.
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarFrame: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
  },
  greetingColumn: {
    flex: 1,
  },
  greetingTitle: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  greetingSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
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
    fontSize: 12,
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
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchGoText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 26,
    padding: 20,
    minHeight: 175,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heroGlowTopRight: {
    position: 'absolute',
    right: -32,
    top: -42,
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroGlowBottomRight: {
    position: 'absolute',
    right: -12,
    bottom: -48,
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  heroBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroStatsPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  heroPillText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroBody: {
    marginTop: 12,
  },
  heroTitle: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  heroSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 3,
    lineHeight: 18,
  },
  heroFooter: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroCtaBtn: {
    backgroundColor: '#151327',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  heroCtaText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
  filterChipText: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bentoCard: {
    flex: 1,
    borderRadius: 24,
    padding: 16,
    minHeight: 188,
    justifyContent: 'space-between',
  },
  bentoTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bentoIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoBadgePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  bentoBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  bentoBottom: {
    marginTop: 14,
  },
  bentoCaption: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  bentoTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  ringLabel: {
    position: 'absolute',
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  mintBanner: {
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  mintBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mintTextCol: {
    flex: 1,
  },
  mintTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  mintSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  mintActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  mintActionText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  extraSlotsList: {
    marginTop: 4,
    gap: 4,
  },
  extraSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  extraSlotLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  extraSlotText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  extraSlotBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  extraSlotBtnText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionLink: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  circleCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  rowSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  emptyCopy: {
    fontFamily: Fonts.body,
    fontSize: 13,
  },
});
