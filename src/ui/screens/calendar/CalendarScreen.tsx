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
  ChevronDown,
  Upload,
  Download,
  Layers,
  Clock,
  CheckSquare,
  FileText,
  Inbox,
  MoreVertical,
  GraduationCap,
  X,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {Colors, Shadows} from '../../theme';
import {
  getCategoryColor,
  registerCustomCategoryColor,
} from '../../theme/categoryColors';
import {useCalendarData} from './hooks/useCalendarData';
import {useTimeBlockModal} from './hooks/useTimeBlockModal';
import {useScheduleItemModal} from './hooks/useScheduleItemModal';
import {
  WeekView,
  MonthView,
  AddBlockModal,
  AddTaskEventModal,
  ClassScheduleModal,
} from './components';
import {UndatedTasksModal} from './components/UndatedTasksModal';
import {NoteEditor} from '../notes/components/NoteEditor';
import {getHeaderTitle} from './utils/calendarHelpers';
import {CalendarScreenProps, ViewMode} from './types';
import {tasksStore, notesStore} from '../../../storage';
import type {Task} from '../../../storage';
import {
  applyNoteFormat,
  continueListOnNewline,
  generateId,
  toggleChecklistItem,
} from '../../../utils';
import {CalendarLayersModal} from '../../components/calendar/CalendarLayersModal';

/** Renders the offline calendar workspace and its local scheduling actions. */
export const CalendarScreen: React.FC<CalendarScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  openRequest,
  onOpenRequestHandled,
  viewMode: propViewMode,
  onViewModeChange: propOnViewModeChange,
}) => {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const fabBottom = Math.max(insets.bottom, 12) + 90;

  const [fabMenuVisible, setFabMenuVisible] = useState(false);
  const [calendarMenuVisible, setCalendarMenuVisible] = useState(false);
  const [hasUndated, setHasUndated] = useState(false);
  const [undatedVisible, setUndatedVisible] = useState(false);
  const [classScheduleVisible, setClassScheduleVisible] = useState(false);
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
  };

  const handleDeleteCategory = (name: string) => {
    notesStore.deleteCustomCategory(userId, name);
    const cats = notesStore.getCustomCategories(userId);
    setCustomCategories(cats.map(c => c.name));
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
  };

  const calendar = useCalendarData({
    userId,
    refreshTrigger,
    onRefresh,
    propViewMode,
    propOnViewModeChange,
  });

  const blockModal = useTimeBlockModal({
    userId,
    selectedDate: calendar.selectedDate,
    onSaved: calendar.loadBlocks,
    onRefresh,
  });

  const scheduleModal = useScheduleItemModal({
    userId,
    selectedDate: calendar.selectedDate,
    onSaved: calendar.loadScheduleData,
    onRefresh,
  });

  useEffect(() => {
    try {
      const page = tasksStore.getUndatedTasksPage(userId, {limit: 1});
      setHasUndated(page.items.length > 0);
    } catch {
      setHasUndated(false);
    }
  }, [userId, refreshTrigger, calendar.blocks, calendar.allTasks]);

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
      if (resolved?.kind === 'task' || resolved?.kind === 'event')
        scheduleModal.openEdit(resolved.item, resolved.kind);
      else if (resolved?.kind === 'block')
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
    tasksStore.updateTask({id: task.id, isCompleted: !task.isCompleted});
    calendar.loadScheduleData();
    onRefresh();
  };

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      {/* Shared date header for the month and week views. */}
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
            style={[styles.headerTitle, {color: colors.textPrimary}]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {getHeaderTitle(
              calendar.viewMode,
              calendar.selectedDate,
              calendar.currentDate,
              calendar.weekDays,
            )}
          </Text>
          <ChevronDown
            size={18}
            color={colors.textSecondary}
            style={styles.titleChevron}
          />
        </TouchableOpacity>

        <View style={styles.navGroup}>
          <TouchableOpacity
            onPress={calendar.handlePrevPress}
            style={[
              styles.navButton,
              {backgroundColor: colors.inputBg, borderColor: colors.border},
            ]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Previous ${calendar.viewMode}`}
          >
            <ChevronLeft size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={calendar.handleGoToToday}
            style={[
              styles.todayButton,
              {borderColor: colors.border, backgroundColor: colors.inputBg},
            ]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go to today"
          >
            <Text style={[styles.todayButtonText, {color: colors.textPrimary}]}>
              Today
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={calendar.handleNextPress}
            style={[
              styles.navButton,
              {backgroundColor: colors.inputBg, borderColor: colors.border},
            ]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Next ${calendar.viewMode}`}
          >
            <ChevronRight size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCalendarMenuVisible(true)}
            style={[
              styles.navButton,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                marginLeft: 6,
                position: 'relative',
              },
            ]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Calendar options and tools"
            testID="calendar-more-menu-button"
          >
            <MoreVertical size={16} color={colors.textPrimary} />
            {hasUndated && (
              <View
                style={[styles.menuBadgeDot, {backgroundColor: colors.red}]}
              />
            )}
          </TouchableOpacity>

          {!calendarMenuVisible && (
            <TouchableOpacity
              testID="calendar-undated-button"
              style={{width: 0, height: 0, opacity: 0, position: 'absolute'}}
              onPress={() => setUndatedVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Undated tasks"
            />
          )}
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

      {/* View mode toggle */}
      <View style={styles.subHeaderContainer}>
        <View style={[styles.toggleRow, {backgroundColor: colors.divider}]}>
          {(['month', 'week'] as ViewMode[]).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.toggleBtn,
                {backgroundColor: 'transparent'},
                calendar.viewMode === mode && {
                  backgroundColor: colors.cardBg,
                  ...Shadows.card,
                },
              ]}
              onPress={() => calendar.setViewMode(mode)}
              accessibilityRole="button"
              accessibilityLabel={`${
                mode.charAt(0).toUpperCase() + mode.slice(1)
              } view`}
              accessibilityState={{selected: calendar.viewMode === mode}}
            >
              <Text
                style={[
                  styles.toggleText,
                  {color: colors.textSecondary},
                  calendar.viewMode === mode && {
                    color: colors.textPrimary,
                    fontWeight: 'bold',
                  },
                ]}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Codex audit A2: a read failure is never presented as an empty schedule. */}
      {calendar.readError && calendar.readError.ownerId === userId && (
        <View
          testID="calendar-read-error"
          accessibilityRole="alert"
          style={[
            styles.readError,
            {borderColor: colors.warning, backgroundColor: colors.inputBg},
          ]}
        >
          <Text style={[styles.readErrorText, {color: colors.textPrimary}]}>
            {calendar.readError.showingPrevious
              ? 'Your schedule could not be refreshed. What is shown is from the last successful read and may be out of date.'
              : 'Your schedule could not be read right now. This does not mean your calendar is empty.'}
          </Text>
          <TouchableOpacity
            testID="calendar-read-retry"
            onPress={calendar.retryRead}
            accessibilityRole="button"
            accessibilityLabel="Try reading the schedule again"
            style={[styles.readErrorButton, {borderColor: colors.border}]}
          >
            <Text
              style={[styles.actionButtonText, {color: colors.textPrimary}]}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Body */}
      <View style={styles.body}>
        {calendar.viewMode === 'month' && (
          <MonthView
            currentDate={calendar.currentDate}
            selectedDate={calendar.selectedDate}
            weekStartsMonday={calendar.weekStartsMonday}
            viewMode={calendar.viewMode}
            blocks={calendar.blocks}
            allTasks={calendar.allTasks}
            allEvents={calendar.allEvents}
            onDayTap={calendar.handleDayTap}
            getCategoryColor={getCategoryColor}
            onSwipeLeft={calendar.handleNextPress}
            onSwipeRight={calendar.handlePrevPress}
          />
        )}
        {calendar.viewMode === 'week' && (
          <WeekView
            calendar={calendar}
            selectedDate={calendar.selectedDate}
            setSelectedDate={calendar.setSelectedDate}
            weekDays={calendar.weekDays}
            timeFormat24h={calendar.timeFormat24h}
            onEditTask={task => scheduleModal.openEdit(task, 'task')}
            onEditEvent={event => scheduleModal.openEdit(event, 'event')}
            onEditBlock={block => blockModal.openEditBlock(block)}
            onToggleTask={toggleTaskCompletion}
            onAddBlock={hour =>
              blockModal.openNewBlock(hour, calendar.selectedDate)
            }
            getCategoryColor={getCategoryColor}
          />
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, Shadows.card, {bottom: fabBottom}]}
        onPress={handleFABPress}
        accessibilityLabel="Add New Item"
        accessibilityRole="button"
      >
        <Plus size={24} color={colors.white} />
      </TouchableOpacity>

      {/* Modals */}
      {blockModal.visible && (
        <AddBlockModal
          state={blockModal}
          timeFormat24h={calendar.timeFormat24h}
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
          onRefresh();
        }}
      />

      {/* Calendar Options & Tools Overflow Modal */}
      <Modal
        visible={calendarMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCalendarMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCalendarMenuVisible(false)}
        >
          <View
            style={[
              styles.menuModalContent,
              {
                backgroundColor: colors.cardBg,
                borderColor: colors.border,
                borderWidth: 1.5,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.menuModalHeader}>
              <Text
                style={[
                  styles.modalHeaderTitle,
                  {color: colors.textPrimary, marginBottom: 0},
                ]}
              >
                Calendar Options
              </Text>
              <TouchableOpacity
                onPress={() => setCalendarMenuVisible(false)}
                style={styles.menuCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close calendar options"
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View
              style={[styles.menuDivider, {backgroundColor: colors.divider}]}
            />

            <ScrollView
              style={styles.menuScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Calendars & Layers */}
              <TouchableOpacity
                style={[styles.menuItem, {borderBottomColor: colors.divider}]}
                onPress={() => {
                  setCalendarMenuVisible(false);
                  calendar.setLayersModalVisible(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Manage calendars and visibility"
              >
                <View
                  style={[
                    styles.menuItemIconWrap,
                    {backgroundColor: colors.inputBg},
                  ]}
                >
                  <Layers size={18} color={colors.blue} />
                </View>
                <View style={styles.menuItemTextCol}>
                  <Text
                    style={[styles.menuItemTitle, {color: colors.textPrimary}]}
                  >
                    Calendars & Visibility
                  </Text>
                  <Text
                    style={[styles.menuItemDesc, {color: colors.textSecondary}]}
                  >
                    Manage active subjects, schedules, and holidays
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Add COR / Class Schedule */}
              <TouchableOpacity
                testID="calendar-add-cor-schedule-button"
                style={[styles.menuItem, {borderBottomColor: colors.divider}]}
                onPress={() => {
                  setCalendarMenuVisible(false);
                  setClassScheduleVisible(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add COR or class schedule"
              >
                <View
                  style={[
                    styles.menuItemIconWrap,
                    {backgroundColor: colors.inputBg},
                  ]}
                >
                  <GraduationCap size={18} color={colors.blue} />
                </View>
                <View style={styles.menuItemTextCol}>
                  <Text
                    style={[styles.menuItemTitle, {color: colors.textPrimary}]}
                  >
                    Add COR / Class Schedule
                  </Text>
                  <Text
                    style={[styles.menuItemDesc, {color: colors.textSecondary}]}
                  >
                    Manually enter classes or scan a USTP COR / schedule
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Undated Tasks */}
              <TouchableOpacity
                testID="calendar-undated-button"
                style={[styles.menuItem, {borderBottomColor: colors.divider}]}
                onPress={() => {
                  setCalendarMenuVisible(false);
                  setUndatedVisible(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Undated tasks"
              >
                <View
                  style={[
                    styles.menuItemIconWrap,
                    {backgroundColor: colors.inputBg},
                  ]}
                >
                  <Inbox size={18} color={colors.red} />
                </View>
                <View style={styles.menuItemTextCol}>
                  <View style={styles.menuItemTitleRow}>
                    <Text
                      style={[
                        styles.menuItemTitle,
                        {color: colors.textPrimary},
                      ]}
                    >
                      Undated Tasks
                    </Text>
                    {hasUndated && (
                      <View
                        style={[
                          styles.menuBadgePill,
                          {backgroundColor: colors.red + '22'},
                        ]}
                      >
                        <Text
                          style={[styles.menuBadgeText, {color: colors.red}]}
                        >
                          Backlog
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.menuItemDesc, {color: colors.textSecondary}]}
                  >
                    Open tasks and assignments without a due date
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Import Calendar */}
              <TouchableOpacity
                style={[styles.menuItem, {borderBottomColor: colors.divider}]}
                onPress={() => {
                  setCalendarMenuVisible(false);
                  calendar.handleImportCalendar();
                }}
                onLongPress={() => {
                  setCalendarMenuVisible(false);
                  calendar.startRemoveFlow();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Import calendar"
                accessibilityHint="Imports an .ics file. Long press to remove imported calendar."
              >
                <View
                  style={[
                    styles.menuItemIconWrap,
                    {backgroundColor: colors.inputBg},
                  ]}
                >
                  <Upload size={18} color={colors.success} />
                </View>
                <View style={styles.menuItemTextCol}>
                  <Text
                    style={[styles.menuItemTitle, {color: colors.textPrimary}]}
                  >
                    Import Calendar (.ics)
                  </Text>
                  <Text
                    style={[styles.menuItemDesc, {color: colors.textSecondary}]}
                  >
                    Import external schedule file (Hold to remove)
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Export Calendar */}
              <TouchableOpacity
                style={[styles.menuItem, {borderBottomWidth: 0}]}
                onPress={() => {
                  setCalendarMenuVisible(false);
                  calendar.handleExportCalendar();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Export calendar"
                accessibilityHint="Exports the visible local calendar"
              >
                <View
                  style={[
                    styles.menuItemIconWrap,
                    {backgroundColor: colors.inputBg},
                  ]}
                >
                  <Download size={18} color={colors.primary} />
                </View>
                <View style={styles.menuItemTextCol}>
                  <Text
                    style={[styles.menuItemTitle, {color: colors.textPrimary}]}
                  >
                    Export Calendar (.ics)
                  </Text>
                  <Text
                    style={[styles.menuItemDesc, {color: colors.textSecondary}]}
                  >
                    Export your schedule and classes to an .ics file
                  </Text>
                </View>
              </TouchableOpacity>
            </ScrollView>

            {/* Done Button */}
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
              onPress={() => setCalendarMenuVisible(false)}
            >
              <Text
                style={[
                  styles.modalBtnTextDark,
                  {color: colors.textPrimary, fontWeight: 'bold'},
                ]}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {calendar.layersModalVisible && (
        <CalendarLayersModal
          visible={calendar.layersModalVisible}
          onClose={() => calendar.setLayersModalVisible(false)}
          username={calendar.username}
          batches={calendar.batches}
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
                  blockModal.openNewBlock(undefined, calendar.selectedDate);
                }}
              >
                <Clock
                  size={20}
                  color={colors.blue}
                  style={styles.fabMenuItemIcon}
                />
                <Text
                  style={[styles.fabMenuItemText, {color: colors.textPrimary}]}
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
                  style={[styles.fabMenuItemText, {color: colors.textPrimary}]}
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
                  style={[styles.fabMenuItemText, {color: colors.textPrimary}]}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 190, // Account for elevated floating bottom tab bar and FAB
  },
  topHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  headerTitle: {
    fontFamily: 'sans-serif-medium',
    fontSize: 22,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  titleChevron: {
    marginLeft: 4,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 6,
  },
  todayButtonText: {
    fontSize: 12,
    fontFamily: 'sans-serif',
    fontWeight: '600',
  },
  subHeaderContainer: {
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleText: {
    fontFamily: 'sans-serif',
    fontSize: 13,
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
  menuModalContent: {
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 420,
  },
  menuModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  menuCloseBtn: {
    padding: 4,
  },
  menuScroll: {
    maxHeight: 420,
  },
  menuDivider: {
    height: 1,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuItemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuItemTextCol: {
    flex: 1,
  },
  menuItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemTitle: {
    fontSize: 15,
    fontFamily: 'sans-serif-medium',
    fontWeight: '600',
  },
  menuBadgePill: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  menuBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  menuItemDesc: {
    fontSize: 12,
    fontFamily: 'sans-serif',
    marginTop: 2,
  },
  readError: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
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
  fab: {
    position: 'absolute',
    bottom: 96,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
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
  saveBtn: {
    backgroundColor: Colors.red,
  },
  cancelBtn: {},
  modalBtnText: {
    color: Colors.textLight,
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
