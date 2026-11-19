import {ScreenOverlays} from '../../navigation/RetainedTab';
import {resolveCallTarget} from '../../navigation/resolveCallTarget';
import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckSquare,
  FileText,
  MoreVertical,
  Calendar as CalendarIcon,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {registerCustomCategoryColor} from '../../theme/categoryColors';
import {useCalendarData} from './hooks/useCalendarData';
import {useTimeBlockModal} from './hooks/useTimeBlockModal';
import {useScheduleItemModal} from './hooks/useScheduleItemModal';
import {
  WeekView,
  MonthView,
  DayView,
  AddBlockModal,
  AddTaskEventModal,
  ClassScheduleModal,
  CalendarOptionsSidebar,
  ViewClassesModal,
  BirthdaysGroupModal,
  HolidaysGroupModal,
  CustomGroupModal,
  ScheduleItemDetailModal,
} from './components';
import {
  useSchedulePalette,
  scheduleCardShadow,
} from './components/schedulePalette';
import {UndatedTasksModal} from './components/UndatedTasksModal';
import {NoteEditor} from '../notes/components/NoteEditor';
import {
  formatCompactTime,
  formatHeaderDateLabel,
  formatLocalDate,
  formatShortWeekday,
} from './utils/calendarHelpers';
import {groupClassBlocks} from './utils/classScheduleHelpers';
import {
  getBirthdays,
  getCustomScheduleGroups,
  isBirthdayEvent,
  type CustomScheduleGroup,
} from './utils/calendarGroups';
import {HOLIDAY_CALENDAR_ID} from './utils/philippineHolidays';
import {CalendarScreenProps, ScheduleTimelineItem, ViewMode} from './types';
import {
  baseScheduleEntityId,
  tasksStore,
  timeBlocksStore,
  notesStore,
  remindersStore,
  scheduleEntriesStore,
} from '../../../storage';
import {getConfirmedAcademicProfile} from '../../../storage/ustpEligibility';
import type {ScheduleAttachedEntry, Task, TimeBlock} from '../../../storage';
import {
  cancelReminderAlarm,
  finishNativeIncomingCall,
} from '../../../scheduler';
import {
  applyNoteFormat,
  continueListOnNewline,
  generateId,
  toggleChecklistItem,
} from '../../../utils';
import {CalendarLayersModal} from '../../components/calendar/CalendarLayersModal';
import {tourTargetRef} from '../../tour/tourTargets';

/** Renders the offline calendar workspace and its local scheduling actions. */
export const CalendarScreen = React.memo(function CalendarScreenView({
  userId,
  refreshTrigger,
  onRefresh,
  openRequest,
  onOpenRequestHandled,
  viewMode: propViewMode,
  onViewModeChange: propOnViewModeChange,
}: CalendarScreenProps) {
  const {colors} = useTheme();
  const palette = useSchedulePalette();
  const insets = useSafeAreaInsets();
  const scrollBottomPad = Math.max(insets.bottom, 16) + 96;

  const [fabMenuVisible, setFabMenuVisible] = useState(false);
  const [calendarMenuVisible, setCalendarMenuVisible] = useState(false);
  const [hasUndated, setHasUndated] = useState(false);
  const [undatedVisible, setUndatedVisible] = useState(false);
  const [classScheduleVisible, setClassScheduleVisible] = useState(false);
  const [viewClassesVisible, setViewClassesVisible] = useState(false);
  const [selectedDetailItem, setSelectedDetailItem] =
    useState<ScheduleTimelineItem | null>(null);
  const [initialEditClassBlock, setInitialEditClassBlock] =
    useState<TimeBlock | null>(null);
  const [attachedEntries, setAttachedEntries] = useState<
    ScheduleAttachedEntry[]
  >(() => {
    try {
      return scheduleEntriesStore.getAll(userId);
    } catch {
      return [];
    }
  });
  const [birthdaysModalVisible, setBirthdaysModalVisible] = useState(false);
  const [highlightBirthdayId, setHighlightBirthdayId] = useState<string | null>(
    null,
  );
  const [holidaysModalVisible, setHolidaysModalVisible] = useState(false);
  const [customGroupModalState, setCustomGroupModalState] = useState<{
    visible: boolean;
    groupName: string | null;
  }>({visible: false, groupName: null});
  const [birthdayCount, setBirthdayCount] = useState(0);
  const [customGroups, setCustomGroups] = useState<CustomScheduleGroup[]>([]);
  const [classSummary, setClassSummary] = useState<{
    count: number;
    profileText: string | null;
  }>({count: 0, profileText: null});
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteCategory, setNoteCategory] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [noteSelection, setNoteSelection] = useState({start: 0, end: 0});
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const cats = notesStore.getCustomCategories(userId);
      cats.forEach(c => {
        registerCustomCategoryColor(c.name, c.color);
      });
      return cats.map(c => c.name);
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    if (!noteModalVisible) return;
    try {
      const cats = notesStore.getCustomCategories(userId);
      cats.forEach(c => {
        registerCustomCategoryColor(c.name, c.color);
      });
      setCustomCategories(cats.map(c => c.name));
    } catch (e) {
      console.error(e);
    }
  }, [userId, noteModalVisible]);

  const handleAddCategory = (name: string, color: string) => {
    if (!name.trim()) return;
    const normalizedName = name.trim();
    const standard = ['Work', 'Personal', 'Health', 'Learning'];
    if (
      standard.includes(normalizedName) ||
      customCategories.includes(normalizedName)
    ) {
      return;
    }
    notesStore.addCustomCategory(userId, normalizedName, color);
    registerCustomCategoryColor(normalizedName, color);
    setCustomCategories([...customCategories, normalizedName]);
    refreshGroupSummaries();
  };

  const handleDeleteCategory = (name: string) => {
    notesStore.deleteCustomCategory(userId, name);
    const cats = notesStore.getCustomCategories(userId);
    setCustomCategories(cats.map(c => c.name));
    refreshGroupSummaries();
  };

  const handleUpdateCategory = (
    oldName: string,
    newName: string,
    color: string,
  ) => {
    if (!newName.trim()) return;
    const normalizedName = newName.trim();
    const standard = ['Work', 'Personal', 'Health', 'Learning'];
    if (
      normalizedName !== oldName &&
      (standard.includes(normalizedName) ||
        customCategories.includes(normalizedName))
    ) {
      return;
    }
    notesStore.updateCustomCategory(userId, oldName, normalizedName, color);
    registerCustomCategoryColor(normalizedName, color);
    const cats = notesStore.getCustomCategories(userId);
    setCustomCategories(cats.map(c => c.name));
    if (noteCategory === oldName) {
      setNoteCategory(normalizedName);
    }
    refreshGroupSummaries();
  };

  const calendar = useCalendarData({
    userId,
    refreshTrigger,
    onRefresh,
    propViewMode,
    propOnViewModeChange,
  });

  const reloadAttachedEntries = React.useCallback(() => {
    try {
      setAttachedEntries(scheduleEntriesStore.getAll(userId));
    } catch {
      setAttachedEntries([]);
    }
  }, [userId]);

  useEffect(() => {
    reloadAttachedEntries();
  }, [reloadAttachedEntries, refreshTrigger]);

  const blockModal = useTimeBlockModal({
    userId,
    selectedDate: calendar.selectedDate,
    onSaved: () => {
      calendar.loadBlocks();
      refreshGroupSummaries();
      reloadAttachedEntries();
    },
    onRefresh,
  });

  const scheduleModal = useScheduleItemModal({
    userId,
    selectedDate: calendar.selectedDate,
    onSaved: () => {
      calendar.loadScheduleData();
      refreshGroupSummaries();
      reloadAttachedEntries();
    },
    onRefresh,
  });

  const scrollViewRef = useRef<ScrollView>(null);
  const prevViewModeRef = useRef<ViewMode>(calendar.viewMode);
  const pendingDayAutoScrollRef = useRef<boolean>(calendar.viewMode === 'day');
  const syncScrollOnContentResizeRef = useRef<number | null>(null);
  const dayContainerYRef = useRef<number>(0);
  const selectedDayKey = calendar.selectedDate.toDateString();

  useEffect(() => {
    const prevMode = prevViewModeRef.current;
    prevViewModeRef.current = calendar.viewMode;

    if (calendar.viewMode === 'day') {
      pendingDayAutoScrollRef.current = true;
      syncScrollOnContentResizeRef.current = null;
    } else if (prevMode === 'day') {
      pendingDayAutoScrollRef.current = false;
      syncScrollOnContentResizeRef.current = null;
      scrollViewRef.current?.scrollTo?.({y: 0, animated: false});
    }
  }, [calendar.viewMode, selectedDayKey]);

  const handleDayCurrentTimeLayout = React.useCallback((yInDayView: number) => {
    if (!pendingDayAutoScrollRef.current) {
      return;
    }
    const targetY = Math.max(0, dayContainerYRef.current + yInDayView - 140);
    pendingDayAutoScrollRef.current = false;
    syncScrollOnContentResizeRef.current = targetY;
    scrollViewRef.current?.scrollTo?.({y: targetY, animated: false});
  }, []);

  const refreshGroupSummaries = React.useCallback(() => {
    try {
      const page = tasksStore.getUndatedTasksPage(userId, {limit: 1});
      setHasUndated(page.items.length > 0);
    } catch {
      setHasUndated(false);
    }
    try {
      const count = groupClassBlocks(timeBlocksStore.getClasses(userId)).length;
      const profile = getConfirmedAcademicProfile(userId);
      const profileText = profile
        ? [
            profile.program,
            profile.section || profile.primarySection,
            profile.academicTerm || profile.academicYearTerm,
          ]
            .filter(Boolean)
            .join(' · ') || null
        : null;
      setClassSummary({count, profileText});
    } catch {
      setClassSummary({count: 0, profileText: null});
    }
    try {
      setBirthdayCount(getBirthdays(userId).length);
    } catch {
      setBirthdayCount(0);
    }
    try {
      setCustomGroups(getCustomScheduleGroups(userId));
    } catch {
      setCustomGroups([]);
    }
  }, [userId]);

  const loadedClassSummary = useRef('');
  useEffect(() => {
    const key = `${userId}:${refreshTrigger}`;
    if (loadedClassSummary.current === key) return;
    loadedClassSummary.current = key;
    refreshGroupSummaries();
  }, [userId, refreshTrigger, refreshGroupSummaries]);

  const handledRequest = useRef<string | null>(null);
  useEffect(() => {
    if (
      !openRequest ||
      handledRequest.current === openRequest.requestId ||
      openRequest.ownerId !== userId
    )
      return;
    handledRequest.current = openRequest.requestId;
    onOpenRequestHandled?.(openRequest.requestId);
    try {
      const resolved = openRequest.entityId
        ? resolveCallTarget(userId, openRequest)
        : null;
      if (openRequest.entityId && !resolved) {
        Alert.alert(
          'Item unavailable',
          'This item is no longer available for this account.',
        );
        return;
      }
      const date =
        resolved?.kind === 'task'
          ? resolved.item.dueDate
          : resolved?.kind === 'event' || resolved?.kind === 'block'
          ? resolved.item.date
          : resolved?.kind === 'reminder'
          ? resolved.item.triggerAt.slice(0, 10)
          : openRequest.date;
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const chosen = new Date(`${date}T12:00:00`);
        calendar.setSelectedDate(chosen);
        calendar.setCurrentDate(chosen);
        calendar.setViewMode('week');
      }
      if (resolved?.kind === 'event' && isBirthdayEvent(resolved.item)) {
        const at = resolved.item.id.indexOf('_occur_');
        setHighlightBirthdayId(
          at < 0 ? resolved.item.id : resolved.item.id.slice(0, at),
        );
        setBirthdaysModalVisible(true);
      } else if (resolved?.kind === 'task' || resolved?.kind === 'event') {
        scheduleModal.openEdit(resolved.item, resolved.kind);
      } else if (resolved?.kind === 'block')
        blockModal.openEditBlock(resolved.item);
      else if (resolved?.kind === 'reminder')
        Alert.alert(
          resolved.item.task,
          `${resolved.item.description || ''}\n${
            resolved.item.triggerAt
          }\nStatus: ${resolved.item.status}`,
        );
    } catch {
      Alert.alert(
        'Item unavailable',
        'Could not read this item. Please try again.',
      );
    }
  }, [
    openRequest,
    userId,
    calendar,
    scheduleModal,
    blockModal,
    onOpenRequestHandled,
  ]);

  const handleFABPress = () => {
    setFabMenuVisible(true);
  };

  const handleSaveNote = () => {
    if (!noteTitle.trim() && !noteBody.trim()) {
      setNoteModalVisible(false);
      return;
    }
    notesStore.insert({
      id: generateId('note'),
      userId,
      title: noteTitle.trim() || 'Untitled Note',
      body: noteBody,
      category: noteCategory,
      isPinned: isPinned,
      tags: [],
      isVoiceTranscribed: false,
      imageUri: null,
    });
    setNoteTitle('');
    setNoteBody('');
    setNoteCategory('');
    setIsPinned(false);
    setNoteModalVisible(false);
    onRefresh();
  };

  const toggleTaskCompletion = (task: Task) => {
    const baseId = baseScheduleEntityId(task.id);
    const nextCompleted = !task.isCompleted;
    tasksStore.updateTask({id: baseId, isCompleted: nextCompleted});
    setSelectedDetailItem(prev => {
      if (
        !prev ||
        prev.kind !== 'task' ||
        !prev.rawTask ||
        baseScheduleEntityId(prev.rawTask.id) !== baseId
      ) {
        return prev;
      }
      return {
        ...prev,
        rawTask: {...prev.rawTask, isCompleted: nextCompleted},
      };
    });
    calendar.loadScheduleData();
    onRefresh();
  };

  const handlePressTimelineItem = (item: ScheduleTimelineItem) => {
    setSelectedDetailItem(item);
  };

  const handleEditScheduleFromDetail = (item: ScheduleTimelineItem) => {
    setSelectedDetailItem(null);
    if (item.kind === 'event' && item.rawEvent) {
      scheduleModal.openEdit(item.rawEvent, 'event');
    } else if (item.kind === 'task' && item.rawTask) {
      scheduleModal.openEdit(item.rawTask, 'task');
    } else if (item.kind === 'block' && item.rawBlock) {
      if (item.rawBlock.category.trim().toLowerCase() === 'class') {
        setInitialEditClassBlock(item.rawBlock);
        setViewClassesVisible(true);
      } else {
        blockModal.openEditBlock(item.rawBlock);
      }
    } else if (item.kind === 'birthday') {
      const rawId = item.rawEvent?.id ?? null;
      const occurIdx = rawId ? rawId.indexOf('_occur_') : -1;
      setHighlightBirthdayId(
        rawId ? (occurIdx < 0 ? rawId : rawId.slice(0, occurIdx)) : null,
      );
      setBirthdaysModalVisible(true);
    } else if (item.kind === 'holiday') {
      setHolidaysModalVisible(true);
    } else if (item.kind === 'reminder' && item.rawReminder) {
      const rem = item.rawReminder;
      Alert.alert('Delete Reminder', `Delete "${rem.task}"?`, [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const remId = baseScheduleEntityId(rem.id);
            remindersStore.deleteReminder(remId);
            scheduleEntriesStore.removeEntriesForTarget(userId, remId);
            void cancelReminderAlarm(remId);
            void finishNativeIncomingCall(remId);
            reloadAttachedEntries();
            calendar.loadScheduleData();
            onRefresh();
          },
        },
      ]);
    }
  };

  const handleSelectStripDate = (date: Date) => {
    calendar.setSelectedDate(date);
    calendar.setCurrentDate(date);
  };

  const overdueTasks = calendar.getOverdueTasks();
  const overdueMore = Math.max(
    0,
    (calendar.overdueTotal ?? overdueTasks.length) - overdueTasks.length,
  );
  const viewModes: ViewMode[] = ['month', 'week', 'day'];
  const todayStr = formatLocalDate(new Date());
  const isViewingToday =
    calendar.viewMode === 'month'
      ? formatLocalDate(calendar.currentDate).slice(0, 7) ===
          todayStr.slice(0, 7) &&
        formatLocalDate(calendar.selectedDate) === todayStr
      : formatLocalDate(calendar.selectedDate) === todayStr;

  return (
    <View style={[styles.container, {backgroundColor: palette.bg}]}>
      {!calendarMenuVisible && (
        <TouchableOpacity
          testID="calendar-undated-button"
          style={styles.hiddenTrigger}
          onPress={() => setUndatedVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Undated tasks"
        />
      )}

      {/* Compact date header matching UniGuide */}
      <View style={styles.topHeaderRow}>
        <TouchableOpacity
          onPress={() => calendar.setShowDatePicker(true)}
          style={styles.headerTitleContainer}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Choose calendar date"
          accessibilityHint="Opens the date picker"
        >
          <Text
            style={[styles.headerTitle, {color: palette.text}]}
            numberOfLines={1}
          >
            {formatHeaderDateLabel(
              calendar.viewMode,
              calendar.selectedDate,
              calendar.currentDate,
            )}
          </Text>
          <Text style={[styles.headerWeekday, {color: palette.muted}]}>
            {formatShortWeekday(calendar.selectedDate)}
          </Text>
        </TouchableOpacity>

        <View style={styles.navGroup}>
          {!isViewingToday && (
            <TouchableOpacity
              testID="calendar-header-today-button"
              onPress={calendar.handleGoToToday}
              style={[
                styles.todayHeaderBtn,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
            >
              <Text
                style={[styles.todayHeaderBtnText, {color: palette.accent}]}
              >
                Today
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={calendar.handlePrevPress}
            style={styles.iconChevronBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Previous ${calendar.viewMode}`}
          >
            <ChevronLeft size={20} color={palette.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={calendar.handleNextPress}
            style={styles.iconChevronBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Next ${calendar.viewMode}`}
          >
            <ChevronRight size={20} color={palette.text} />
          </TouchableOpacity>

          <TouchableOpacity
            ref={tourTargetRef('calendar-more-button')}
            onPress={() => setCalendarMenuVisible(true)}
            style={styles.iconChevronBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Calendar options and tools"
            testID="calendar-more-menu-button"
          >
            <MoreVertical size={18} color={palette.text} />
            {hasUndated && (
              <View
                style={[styles.menuBadgeDot, {backgroundColor: palette.danger}]}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            ref={tourTargetRef('calendar-add-button')}
            style={[styles.addCircleBtn, {backgroundColor: palette.accent}]}
            onPress={handleFABPress}
            activeOpacity={0.85}
            accessibilityLabel="Add New Item"
            accessibilityRole="button"
          >
            <Plus size={20} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      {calendar.showDatePicker && (
        <DateTimePicker
          value={
            calendar.viewMode === 'month'
              ? calendar.currentDate
              : calendar.selectedDate
          }
          mode="date"
          display="default"
          onChange={(_event, date) => {
            calendar.setShowDatePicker(false);
            if (date) {
              calendar.setSelectedDate(date);
              calendar.setCurrentDate(date);
            }
          }}
        />
      )}

      {/* 3-way Segmented View Toggle: Month | Week | Day */}
      <View style={styles.subHeaderContainer}>
        <View
          style={[styles.toggleRow, {backgroundColor: palette.surface}]}
          accessibilityRole="tablist"
        >
          {viewModes.map(mode => {
            const active = calendar.viewMode === mode;
            const label = mode.charAt(0).toUpperCase() + mode.slice(1);
            return (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.toggleBtn,
                  active && {
                    backgroundColor: palette.card,
                    ...(palette.isDarkMode ? {} : scheduleCardShadow),
                  },
                ]}
                onPress={() => calendar.setViewMode(mode)}
                accessibilityRole="tab"
                accessibilityLabel={`${label} view`}
                accessibilityState={{selected: active}}
              >
                <Text
                  style={[
                    styles.toggleText,
                    {
                      color: active ? palette.text : palette.muted,
                      fontWeight: active ? '700' : '600',
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Scrollable Schedule Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.body}
        contentContainerStyle={{paddingBottom: scrollBottomPad}}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (
            calendar.viewMode === 'day' &&
            syncScrollOnContentResizeRef.current !== null
          ) {
            const targetY = syncScrollOnContentResizeRef.current;
            syncScrollOnContentResizeRef.current = null;
            scrollViewRef.current?.scrollTo?.({y: targetY, animated: false});
          }
        }}
      >
        {/* Codex audit A2: a read failure is never presented as an empty schedule. */}
        {calendar.readError && calendar.readError.ownerId === userId && (
          <View
            testID="calendar-read-error"
            accessibilityRole="alert"
            style={[
              styles.readError,
              {
                borderColor: colors.warning,
                backgroundColor: palette.card,
              },
            ]}
          >
            <Text style={[styles.readErrorText, {color: palette.text}]}>
              {calendar.readError.showingPrevious
                ? 'Your schedule could not be refreshed. What is shown is from the last successful read and may be out of date.'
                : 'Your schedule could not be read right now. This does not mean your calendar is empty.'}
            </Text>
            <TouchableOpacity
              testID="calendar-read-retry"
              onPress={calendar.retryRead}
              accessibilityRole="button"
              accessibilityLabel="Try reading the schedule again"
              style={[styles.readErrorButton, {borderColor: palette.border}]}
            >
              <Text style={[styles.actionButtonText, {color: palette.text}]}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {calendar.viewMode === 'month' && (
          <MonthView
            currentDate={calendar.currentDate}
            selectedDate={calendar.selectedDate}
            weekStartsMonday={calendar.weekStartsMonday}
            timeFormat24h={calendar.timeFormat24h}
            showHolidays={calendar.showHolidays}
            blocks={calendar.blocks}
            allTasks={calendar.allTasks}
            allEvents={calendar.allEvents}
            reminders={calendar.reminders}
            attachedEntries={attachedEntries}
            onDayPress={calendar.handleDayTap}
            onPrevMonth={calendar.handlePrevPress}
            onNextMonth={calendar.handleNextPress}
            onAddPlanItem={handleFABPress}
            onPressItem={handlePressTimelineItem}
            onToggleTask={toggleTaskCompletion}
          />
        )}
        {calendar.viewMode === 'week' && (
          <WeekView
            weekDays={calendar.weekDays}
            selectedDate={calendar.selectedDate}
            timeFormat24h={calendar.timeFormat24h}
            showHolidays={calendar.showHolidays}
            blocks={calendar.blocks}
            tasks={calendar.allTasks}
            events={calendar.allEvents}
            reminders={calendar.reminders}
            attachedEntries={attachedEntries}
            onSelectDate={handleSelectStripDate}
            onPressItem={handlePressTimelineItem}
            onToggleTask={toggleTaskCompletion}
          />
        )}
        {calendar.viewMode === 'day' && (
          <View
            onLayout={e => {
              dayContainerYRef.current = e.nativeEvent.layout.y;
            }}
          >
            <DayView
              weekDays={calendar.weekDays}
              selectedDate={calendar.selectedDate}
              timeFormat24h={calendar.timeFormat24h}
              showHolidays={calendar.showHolidays}
              blocks={calendar.blocks}
              tasks={calendar.allTasks}
              events={calendar.allEvents}
              reminders={calendar.reminders}
              attachedEntries={attachedEntries}
              onSelectDate={handleSelectStripDate}
              onAddBlock={hour =>
                blockModal.openNewBlock(hour, calendar.selectedDate)
              }
              onPressItem={handlePressTimelineItem}
              onToggleTask={toggleTaskCompletion}
              onCurrentTimeLayout={handleDayCurrentTimeLayout}
            />
          </View>
        )}

        {overdueTasks.length > 0 && (
          <View
            style={[
              styles.overdueCard,
              {
                backgroundColor: palette.dangerSoft,
                borderColor: palette.isDarkMode
                  ? palette.border
                  : 'transparent',
                borderWidth: palette.isDarkMode ? 1 : 0,
              },
            ]}
          >
            <Text style={[styles.overdueHeading, {color: palette.danger}]}>
              Overdue
            </Text>
            <View style={styles.overdueChips}>
              {overdueTasks.map(ot => (
                <TouchableOpacity
                  key={ot.id}
                  onPress={() =>
                    setSelectedDetailItem({
                      id: `task-${ot.id}`,
                      kind: 'task',
                      title: ot.title,
                      subtitle: 'To Do',
                      categoryLabel: 'To Do',
                      timeLabel: ot.dueTime
                        ? formatCompactTime(ot.dueTime, calendar.timeFormat24h)
                        : 'Anytime',
                      hour: 9,
                      sortMinutes: 0,
                      tone: 'mint',
                      rawTask: ot,
                    })
                  }
                  style={[styles.overdueChip, {backgroundColor: palette.card}]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.overdueChipText, {color: palette.text}]}
                  >
                    {ot.title}
                  </Text>
                </TouchableOpacity>
              ))}
              {overdueMore > 0 && (
                <View
                  testID="calendar-overdue-more"
                  style={[styles.overdueChip, {backgroundColor: palette.card}]}
                >
                  <Text
                    style={[styles.overdueChipText, {color: palette.muted}]}
                  >
                    {`+${overdueMore} more`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <ScreenOverlays>
        {/* Modals */}
        {blockModal.visible && (
          <AddBlockModal
            state={blockModal}
            timeFormat24h={calendar.timeFormat24h}
            customGroups={customGroups}
          />
        )}
        {scheduleModal.visible && (
          <AddTaskEventModal
            state={scheduleModal}
            timeFormat24h={calendar.timeFormat24h}
          />
        )}
        <UndatedTasksModal
          visible={undatedVisible}
          userId={userId}
          refreshTrigger={refreshTrigger}
          onClose={() => setUndatedVisible(false)}
          onToggleTask={toggleTaskCompletion}
        />

        <ClassScheduleModal
          visible={classScheduleVisible}
          userId={userId}
          timeFormat24h={calendar.timeFormat24h}
          onClose={() => setClassScheduleVisible(false)}
          onSaved={() => {
            calendar.loadBlocks();
            refreshGroupSummaries();
            onRefresh();
          }}
        />

        <ViewClassesModal
          visible={viewClassesVisible}
          userId={userId}
          refreshTrigger={refreshTrigger}
          timeFormat24h={calendar.timeFormat24h}
          initialEditBlock={initialEditClassBlock}
          onClose={() => {
            setViewClassesVisible(false);
            setInitialEditClassBlock(null);
          }}
          onChanged={() => {
            calendar.loadBlocks();
            refreshGroupSummaries();
            reloadAttachedEntries();
            onRefresh();
          }}
          onAddClassSchedule={() => setClassScheduleVisible(true)}
        />

        <ScheduleItemDetailModal
          visible={selectedDetailItem !== null}
          userId={userId}
          item={selectedDetailItem}
          selectedDate={calendar.selectedDate}
          allBlocks={calendar.blocks}
          onClose={() => setSelectedDetailItem(null)}
          onEditSchedule={handleEditScheduleFromDetail}
          onToggleTask={toggleTaskCompletion}
          onEntriesChanged={reloadAttachedEntries}
        />

        <BirthdaysGroupModal
          visible={birthdaysModalVisible}
          userId={userId}
          refreshTrigger={refreshTrigger}
          initialBirthdayId={highlightBirthdayId}
          onClose={() => {
            setBirthdaysModalVisible(false);
            setHighlightBirthdayId(null);
          }}
          onChanged={() => {
            calendar.loadScheduleData();
            refreshGroupSummaries();
            onRefresh();
          }}
        />

        <HolidaysGroupModal
          visible={holidaysModalVisible}
          initialYear={(calendar.viewMode === 'month'
            ? calendar.currentDate
            : calendar.selectedDate
          ).getFullYear()}
          holidaysVisible={calendar.showHolidays}
          onToggleVisibility={isVisible => {
            void calendar.handleToggleVisibility(
              HOLIDAY_CALENDAR_ID,
              isVisible,
            );
          }}
          onSelectHolidayDate={dateStr => {
            const chosen = new Date(`${dateStr}T12:00:00`);
            if (!Number.isNaN(chosen.getTime())) {
              calendar.setSelectedDate(chosen);
              calendar.setCurrentDate(chosen);
            }
          }}
          onClose={() => setHolidaysModalVisible(false)}
        />

        <CustomGroupModal
          visible={customGroupModalState.visible}
          userId={userId}
          timeFormat24h={calendar.timeFormat24h}
          initialGroupName={customGroupModalState.groupName}
          onClose={() =>
            setCustomGroupModalState({visible: false, groupName: null})
          }
          onSaved={() => {
            calendar.loadBlocks();
            refreshGroupSummaries();
            onRefresh();
          }}
        />

        <CalendarOptionsSidebar
          visible={calendarMenuVisible}
          onClose={() => setCalendarMenuVisible(false)}
          classCount={classSummary.count}
          birthdayCount={birthdayCount}
          customGroups={customGroups}
          visibilityMap={calendar.visibilityMap}
          profileSummary={classSummary.profileText}
          hasUndated={hasUndated}
          onViewClasses={() => setViewClassesVisible(true)}
          onAddClassSchedule={() => setClassScheduleVisible(true)}
          onGoToToday={calendar.handleGoToToday}
          onOpenLayers={() => calendar.setLayersModalVisible(true)}
          onOpenUndated={() => setUndatedVisible(true)}
          onImportCalendar={calendar.handleImportCalendar}
          onRemoveImportedCalendar={calendar.startRemoveFlow}
          onExportCalendar={calendar.handleExportCalendar}
          onToggleLayer={(layerId, isVisible) => {
            void calendar.handleToggleVisibility(layerId, isVisible);
          }}
          onOpenBirthdays={() => {
            setHighlightBirthdayId(null);
            setBirthdaysModalVisible(true);
          }}
          onOpenHolidays={() => setHolidaysModalVisible(true)}
          onOpenCustomGroup={groupName =>
            setCustomGroupModalState({
              visible: true,
              groupName: groupName ?? null,
            })
          }
        />

        {calendar.layersModalVisible && (
          <CalendarLayersModal
            visible={calendar.layersModalVisible}
            onClose={() => calendar.setLayersModalVisible(false)}
            username={calendar.username}
            batches={calendar.batches}
            customGroups={customGroups}
            visibilityMap={calendar.visibilityMap}
            onToggleVisibility={calendar.handleToggleVisibility}
            onRemoveBatch={calendar.handleRemoveBatch}
          />
        )}

        {/* FAB Choice Overlay Menu */}
        {fabMenuVisible && (
          <Modal
            visible={fabMenuVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setFabMenuVisible(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setFabMenuVisible(false)}
            >
              <View
                style={[
                  styles.modalContent,
                  {
                    backgroundColor: colors.cardBg,
                    borderColor: colors.border,
                    borderWidth: 1.5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modalHeaderTitle,
                    {color: colors.textPrimary, textAlign: 'center'},
                  ]}
                >
                  Create New
                </Text>

                <TouchableOpacity
                  style={[
                    styles.fabMenuItem,
                    {borderBottomColor: colors.divider},
                  ]}
                  onPress={() => {
                    setFabMenuVisible(false);
                    scheduleModal.openNew('event');
                  }}
                >
                  <CalendarIcon
                    size={20}
                    color={palette.accent}
                    style={styles.fabMenuItemIcon}
                  />
                  <Text
                    style={[
                      styles.fabMenuItemText,
                      {color: colors.textPrimary},
                    ]}
                  >
                    Class / Event
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.fabMenuItem,
                    {borderBottomColor: colors.divider},
                  ]}
                  onPress={() => {
                    setFabMenuVisible(false);
                    blockModal.openNewBlock(undefined, calendar.selectedDate);
                  }}
                >
                  <Clock
                    size={20}
                    color={colors.blue}
                    style={styles.fabMenuItemIcon}
                  />
                  <Text
                    style={[
                      styles.fabMenuItemText,
                      {color: colors.textPrimary},
                    ]}
                  >
                    Time Block
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.fabMenuItem,
                    {borderBottomColor: colors.divider},
                  ]}
                  onPress={() => {
                    setFabMenuVisible(false);
                    scheduleModal.openNew('task');
                  }}
                >
                  <CheckSquare
                    size={20}
                    color={colors.red}
                    style={styles.fabMenuItemIcon}
                  />
                  <Text
                    style={[
                      styles.fabMenuItemText,
                      {color: colors.textPrimary},
                    ]}
                  >
                    Task
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.fabMenuItem,
                    {borderBottomColor: colors.divider},
                  ]}
                  onPress={() => {
                    setFabMenuVisible(false);
                    setNoteTitle('');
                    setNoteBody('');
                    setNoteCategory('Personal');
                    setIsPinned(false);
                    setNoteSelection({start: 0, end: 0});
                    setNoteModalVisible(true);
                  }}
                >
                  <FileText
                    size={20}
                    color={colors.textSecondary}
                    style={styles.fabMenuItemIcon}
                  />
                  <Text
                    style={[
                      styles.fabMenuItemText,
                      {color: colors.textPrimary},
                    ]}
                  >
                    Note
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: colors.divider,
                      marginTop: 16,
                      alignSelf: 'stretch',
                      alignItems: 'center',
                    },
                  ]}
                  onPress={() => setFabMenuVisible(false)}
                >
                  <Text
                    style={[
                      styles.modalBtnTextDark,
                      {color: colors.textPrimary, fontWeight: 'bold'},
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Full Note Editor Modal matching NotesScreen */}
        {noteModalVisible && (
          <NoteEditor
            visible={noteModalVisible}
            editingNote={null}
            noteTitle={noteTitle}
            noteBody={noteBody}
            noteCategory={noteCategory}
            noteTags={[]}
            isPinned={isPinned}
            imageUri={null}
            selection={noteSelection}
            aiLoading={false}
            aiActionType=""
            onTitleChange={setNoteTitle}
            onBodyChange={next => {
              const carried = continueListOnNewline(noteBody, next);
              setNoteBody(carried ? carried.body : next);
              if (carried) setNoteSelection(carried.selection);
            }}
            onCategoryChange={setNoteCategory}
            onPinToggle={() => setIsPinned(p => !p)}
            onImageUriChange={() => {}}
            onSelectionChange={setNoteSelection}
            onClose={() => setNoteModalVisible(false)}
            onSave={handleSaveNote}
            onDelete={() => {}}
            onFormatting={type => {
              const edit = applyNoteFormat(noteBody, noteSelection, type);
              setNoteBody(edit.body);
              setNoteSelection(edit.selection);
            }}
            onToggleChecklist={index =>
              setNoteBody(toggleChecklistItem(noteBody, index))
            }
            onAttachImage={() => {}}
            onRemoveImage={() => {}}
            onAiAction={() => {}}
            customCategories={customCategories}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            onUpdateCategory={handleUpdateCategory}
          />
        )}
      </ScreenOverlays>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hiddenTrigger: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  },
  topHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  headerWeekday: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  todayHeaderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 4,
  },
  todayHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  iconChevronBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  addCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  subHeaderContainer: {
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  toggleText: {
    fontSize: 13,
  },
  overdueCard: {
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 16,
    padding: 12,
  },
  overdueHeading: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  overdueChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  overdueChip: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 180,
  },
  overdueChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonText: {
    marginLeft: 6,
    fontFamily: 'sans-serif-medium',
    fontSize: 11,
    fontWeight: '600',
  },
  menuBadgeDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  readError: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  readErrorText: {
    flex: 1,
    fontSize: 12,
    marginRight: 8,
  },
  readErrorButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  body: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '90%',
  },
  modalHeaderTitle: {
    fontFamily: 'sans-serif-medium',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  saveBtn: {},
  cancelBtn: {},
  modalBtnText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalBtnTextDark: {
    fontSize: 14,
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  fabMenuItemIcon: {
    marginRight: 16,
  },
  fabMenuItemText: {
    fontSize: 15,
    fontFamily: 'sans-serif-medium',
  },
});
