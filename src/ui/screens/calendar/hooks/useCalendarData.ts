import { useState, useEffect, useCallback, useRef } from 'react';
import { ViewMode, CalendarData } from '../types';
import type { TimeBlock, Task, Event } from '../../../../storage';
import { userStore } from '../../../../storage';
import { plannerQueries } from '../../../../storage/plannerQueries';

import { importedBatchesStore, ImportBatch } from '../../../../storage/importedBatchesStore';
import { calendarVisibilityStore } from '../../../../storage/calendarVisibilityStore';
import { generateIcsString, parseIcsString } from '../../../../storage/icsHelper';
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { Alert } from 'react-native';
import {
  persistImportedCalendarBatch,
  removeImportedCalendarBatch,
} from './calendarImportPersistence';

interface UseCalendarDataOptions {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  propViewMode?: ViewMode;
  propOnViewModeChange?: (mode: ViewMode) => void;
}

/** Calendar's own occurrence IDs are `${id}_occur_${date}`; visibility uses the base ID. */
const baseIdOf = (id: string): string => {
  const at = id.indexOf('_occur_');
  return at < 0 ? id : id.slice(0, at);
};

const toLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Overdue chips shown at most; the total is still reported. */
export const OVERDUE_LIMIT = 100;

export const useCalendarData = (options: UseCalendarDataOptions): CalendarData & {
  getOverdueTasks: () => Task[];
  overdueTotal: number;
} => {
  const { userId, refreshTrigger, onRefresh, propViewMode, propOnViewModeChange } = options;

  const [localViewMode, setLocalViewMode] = useState<ViewMode>('week');
  const viewMode = propViewMode !== undefined ? propViewMode : localViewMode;
  const setViewMode = propOnViewModeChange !== undefined ? propOnViewModeChange : setLocalViewMode;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [weekDays, setWeekDays] = useState<Date[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [overdue, setOverdue] = useState<{ items: Task[]; total: number }>({ items: [], total: 0 });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [timeFormat24h, setTimeFormat24h] = useState(false);
  const [weekStartsMonday, setWeekStartsMonday] = useState(false);

  // Visibility and imports state
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({ main: true });
  const [username, setUsername] = useState('Main Calendar');
  const [layersModalVisible, setLayersModalVisible] = useState(false);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;

  const generateWeekDays = useCallback(() => {
    const days: Date[] = [];
    const base = new Date(selectedDate);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push(d);
    }
    setWeekDays(days);
  }, [selectedDate]);

  const loadSettings = useCallback(() => {
    const is24h = userStore.get24HourFormat(userId);
    setTimeFormat24h(is24h);
    const mondayStart = userStore.getWeekStartsMonday(userId);
    setWeekStartsMonday(mondayStart);
  }, [userId]);

  const loadImportsAndVisibility = useCallback(async () => {
    try {
      const [fetchedBatches, fetchedVisibility] = await Promise.all([
        importedBatchesStore.getImportedBatches(userId),
        calendarVisibilityStore.getVisibilityMap(userId),
      ]);
      if (activeUserIdRef.current !== userId) return;
      setBatches(fetchedBatches);
      setVisibilityMap(fetchedVisibility);
      const user = userStore.getUserById(userId);
      if (user) {
        setUsername(user.username);
      }
    } catch (error) {
      console.error('Failed to load visibility or batches:', error);
    }
  }, [userId]);

  const getViewRange = useCallback((): { start: Date; end: Date } => {
    if (viewMode === 'week') {
      const start = new Date(selectedDate);
      start.setDate(selectedDate.getDate() - 3);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setDate(selectedDate.getDate() + 3);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    } else {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 15);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 15);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }, [viewMode, selectedDate, currentDate]);

  const loadBlocks = useCallback(() => {
    // AGY-PORT 06: only the visible window is read (recurrences expanded by SQL-bounded rows).
    const { start: rangeStart, end: rangeEnd } = getViewRange();
    let rawData: TimeBlock[];
    try {
      rawData = plannerQueries.window(userId, toLocalDate(rangeStart), toLocalDate(rangeEnd)).blocks;
    } catch (error) {
      console.error('[Calendar] Could not read time blocks:', error);
      rawData = [];
    }

    const importedBlockIds = new Set<string>();
    const hiddenBlockIds = new Set<string>();
    const hideMain = visibilityMap.main === false;

    batches.forEach((batch) => {
      const isVisible = visibilityMap[batch.id] !== false;
      batch.blocks.forEach((id) => {
        importedBlockIds.add(id);
        if (!isVisible) {
          hiddenBlockIds.add(id);
        }
      });
    });

    rawData = rawData.filter((block) => {
      const id = baseIdOf(block.id);
      const isImported = importedBlockIds.has(id);
      if (isImported) {
        return !hiddenBlockIds.has(id);
      } else {
        return !hideMain;
      }
    });

    setBlocks(rawData);
  }, [userId, batches, visibilityMap, getViewRange]);

  const loadScheduleData = useCallback(() => {
    // AGY-PORT 06: the visible window only. Undated tasks stay in the paged
    // UndatedTasksModal (AGY-PORT 04).
    const { start: rangeStart, end: rangeEnd } = getViewRange();
    let rawTasks: Task[] = [];
    let rawEvents: Event[] = [];
    try {
      const visible = plannerQueries.window(userId, toLocalDate(rangeStart), toLocalDate(rangeEnd));
      rawTasks = visible.tasks;
      rawEvents = visible.events;
    } catch (error) {
      console.error('[Calendar] Could not read tasks and events:', error);
    }
    try {
      setOverdue(plannerQueries.overdueTasks(userId, toLocalDate(new Date()), OVERDUE_LIMIT));
    } catch (error) {
      console.error('[Calendar] Could not read overdue tasks:', error);
      setOverdue({ items: [], total: 0 });
    }

    const importedTaskIds = new Set<string>();
    const hiddenTaskIds = new Set<string>();
    const importedEventIds = new Set<string>();
    const hiddenEventIds = new Set<string>();
    const hideMain = visibilityMap.main === false;

    batches.forEach((batch) => {
      const isVisible = visibilityMap[batch.id] !== false;
      batch.tasks.forEach((id) => {
        importedTaskIds.add(id);
        if (!isVisible) {
          hiddenTaskIds.add(id);
        }
      });
      batch.events.forEach((id) => {
        importedEventIds.add(id);
        if (!isVisible) {
          hiddenEventIds.add(id);
        }
      });
    });

    const expandedTasks = rawTasks.filter((t) => {
      const id = baseIdOf(t.id);
      const isImported = importedTaskIds.has(id);
      if (isImported) {
        return !hiddenTaskIds.has(id);
      } else {
        return !hideMain;
      }
    });

    const expandedEvents = rawEvents.filter((e) => {
      const id = baseIdOf(e.id);
      const isImported = importedEventIds.has(id);
      if (isImported) {
        return !hiddenEventIds.has(id);
      } else {
        return !hideMain;
      }
    });

    setAllTasks(expandedTasks);
    setAllEvents(expandedEvents);

    const formatLocalDate = (d: Date): string => {
      const year = d.getFullYear();
      const month = `${d.getMonth() + 1}`.padStart(2, '0');
      const day = `${d.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const dateStr = formatLocalDate(selectedDate);
    const dayTasks = expandedTasks.filter((t) => t.dueDate === dateStr);
    const dayEvents = expandedEvents.filter((e) => e.date === dateStr);

    setTasks(dayTasks);
    setEvents(dayEvents);
  }, [userId, batches, visibilityMap, selectedDate, getViewRange]);

  useEffect(() => {
    loadBlocks();
    loadScheduleData();
    generateWeekDays();
  }, [userId, selectedDate, refreshTrigger, loadBlocks, loadScheduleData, generateWeekDays]);

  useEffect(() => {
    loadSettings();
  }, [userId, refreshTrigger, loadSettings]);

  useEffect(() => {
    setBatches([]);
    setVisibilityMap({ main: true });
  }, [userId]);

  useEffect(() => {
    loadImportsAndVisibility();
  }, [userId, refreshTrigger, loadImportsAndVisibility]);

  const handleToggleVisibility = useCallback(async (calendarId: string, isVisible: boolean) => {
    try {
      await calendarVisibilityStore.setVisibility(userId, calendarId, isVisible);
      const updatedMap = await calendarVisibilityStore.getVisibilityMap(userId);
      if (activeUserIdRef.current === userId) setVisibilityMap(updatedMap);
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  }, [userId]);

  const handleImportCalendar = useCallback(async () => {
    try {
      const res = await pick({
        type: ['text/calendar', 'application/octet-stream'],
      });

      if (!res || res.length === 0 || !res[0].uri) return;

      const fileUri = res[0].uri;
      const fileName = res[0].name || 'imported_calendar.ics';
      const content = await RNFS.readFile(fileUri, 'utf8');

      const { events: parsedEvents, blocks: parsedBlocks, tasks: parsedTasks } = parseIcsString(content);
      const totalCount = parsedEvents.length + parsedBlocks.length + parsedTasks.length;

      if (totalCount === 0) {
        Alert.alert('Import Calendar', 'No valid calendar events, tasks, or time blocks found in the selected file.');
        return;
      }

      Alert.alert(
        'Import Calendar',
        `Found ${parsedEvents.length} events, ${parsedBlocks.length} time blocks, and ${parsedTasks.length} tasks. Do you want to import them?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              try {
                await persistImportedCalendarBatch(userId, fileName, {
                  events: parsedEvents,
                  blocks: parsedBlocks,
                  tasks: parsedTasks,
                });

                Alert.alert('Success', `Successfully imported ${totalCount} items.`);
                loadImportsAndVisibility();
                onRefresh();
              } catch (err) {
                console.error('Failed to save imported items:', err);
                Alert.alert('Error', 'Failed to save imported calendar items.');
              }
            },
          },
        ]
      );
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        // User cancelled picker
      } else {
        console.error('Failed to import file:', err);
        Alert.alert('Error', 'Failed to read or parse the calendar file.');
      }
    }
  }, [userId, loadImportsAndVisibility, onRefresh]);

  const handleExportCalendar = useCallback(async () => {
    try {
      // Explicit full export: every owned item, read in bounded batches (AGY-PORT 06).
      const everything = plannerQueries.exportAll(userId);
      const allTasksData = everything.tasks;
      const allEventsData = everything.events;
      const allBlocksData = everything.blocks;
      if (allTasksData.length === 0 && allEventsData.length === 0 && allBlocksData.length === 0) {
        Alert.alert('Export Calendar', 'Your calendar is empty. Nothing to export.');
        return;
      }
      const icsString = generateIcsString(allEventsData, allBlocksData, allTasksData);
      const tempPath = `${RNFS.TemporaryDirectoryPath}/lafina_calendar_export.ics`;
      await RNFS.writeFile(tempPath, icsString, 'utf8');
      await Share.open({
        url: `file://${tempPath}`,
        type: 'text/calendar',
        filename: 'lafina_calendar_export',
        title: 'Export LAFINA Calendar',
      });
      await RNFS.unlink(tempPath).catch((err: any) => console.warn('Clean temp file failed:', err));
    } catch (err) {
      if (err && (err as any).message && (err as any).message.includes('User did not share')) {
        return;
      }
      console.error('Failed to export calendar:', err);
      Alert.alert('Error', 'Failed to generate or share calendar file.');
    }
  }, [userId]);

  const confirmBatchRemoval = useCallback((batch: ImportBatch) => {
    const totalCount = batch.events.length + batch.blocks.length + batch.tasks.length;

    Alert.alert(
      'Confirm Removal',
      `Are you sure you want to delete all ${totalCount} items imported from "${batch.fileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeImportedCalendarBatch(userId, batch);

              loadImportsAndVisibility();
              onRefresh();
              Alert.alert('Success', `Successfully removed ${totalCount} items.`);
            } catch (err) {
              console.error('Failed to remove imported calendar batch:', err);
              Alert.alert('Error', 'Failed to remove calendar items.');
            }
          },
        },
      ]
    );
  }, [userId, loadImportsAndVisibility, onRefresh]);

  const startRemoveFlow = useCallback(async () => {
    try {
      const fetchedBatches = await importedBatchesStore.getImportedBatches(userId);
      if (fetchedBatches.length === 0) {
        Alert.alert('Remove Imported Calendar', 'No previously imported calendars were found.');
        return;
      }

      const buttons = fetchedBatches.map((batch) => {
        const dateFormatted = new Date(batch.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        return {
          text: `${batch.fileName} (${dateFormatted})`,
          onPress: () => confirmBatchRemoval(batch),
        };
      });

      buttons.push({
        text: 'Cancel',
        style: 'cancel',
      } as any);

      Alert.alert(
        'Remove Imported Calendar',
        'Select the calendar import batch you wish to remove:',
        buttons
      );
    } catch (err) {
      console.error('Failed to load import batches:', err);
      Alert.alert('Error', 'Failed to load import history.');
    }
  }, [userId, confirmBatchRemoval]);

  const navigateWeek = useCallback((direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setSelectedDate(newDate);
    setCurrentDate(newDate);
  }, [selectedDate]);

  const navigateMonth = useCallback((direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  }, [currentDate]);

  const handlePrevPress = useCallback(() => {
    if (viewMode === 'week') navigateWeek('prev');
    else navigateMonth('prev');
  }, [viewMode, navigateWeek, navigateMonth]);

  const handleNextPress = useCallback(() => {
    if (viewMode === 'week') navigateWeek('next');
    else navigateMonth('next');
  }, [viewMode, navigateWeek, navigateMonth]);

  const handleGoToToday = useCallback(() => {
    const today = new Date();
    setSelectedDate(today);
    setCurrentDate(today);
  }, []);

  const handleDayTap = useCallback((dayNum: number) => {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
    setSelectedDate(targetDate);
    setViewMode('week');
  }, [currentDate, setViewMode]);

  // Bounded and loaded with the schedule (no full read per render).
  const getOverdueTasks = useCallback(() => overdue.items, [overdue]);

  return {
    currentDate,
    selectedDate,
    viewMode,
    blocks,
    weekDays,
    tasks,
    events,
    allTasks,
    allEvents,
    timeFormat24h,
    weekStartsMonday,
    showDatePicker,
    setViewMode,
    setSelectedDate,
    setCurrentDate,
    setShowDatePicker,
    handlePrevPress,
    handleNextPress,
    handleGoToToday,
    handleDayTap,
    loadBlocks,
    loadScheduleData,
    getOverdueTasks,
    overdueTotal: overdue.total,

    // Visibility and Import/Export
    batches,
    visibilityMap,
    username,
    layersModalVisible,
    setLayersModalVisible,
    handleToggleVisibility,
    handleImportCalendar,
    handleExportCalendar,
    startRemoveFlow,
    handleRemoveBatch: confirmBatchRemoval,
  };
};
