import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState} from 'react-native';
import {quickChatPresence} from '../../../quickChat/quickChatPresence';
import {
  dashboardConfigStore,
  notesQueryStore,
  notesStore,
  preferencesStore,
  remindersStore,
  tasksStore,
  userStore,
} from '../../../../storage';
import {getConfirmedAcademicProfile} from '../../../../storage/ustpEligibility';
import type {
  AcademicProfileRecord,
  DashboardConfig,
  DashboardPresetId,
  DashboardScheduleFilter,
  DashboardWidgetId,
  Event,
  MinFreeGapMinutes,
  NoteSnapshot,
  Reminder,
  Task,
  TimeBlock,
  UserPreferences,
} from '../../../../storage';
import {calendarVisibilityStore} from '../../../../storage/calendarVisibilityStore';
import {
  importedBatchesStore,
  type ImportBatch,
} from '../../../../storage/importedBatchesStore';
import {plannerQueries} from '../../../../storage/plannerQueries';
import {getDefaultUserPreferences} from '../../../../storage/preferencesStore';
import {Colors} from '../../../theme';
import {registerCustomCategoryColor} from '../../../theme/categoryColors';
import {useTimeBlockModal} from '../../calendar/hooks/useTimeBlockModal';
import {
  addDaysToDate,
  baseEntityId,
  buildDayScheduleItems,
  computeFreeStudySummary,
  computeUpNextSummary,
  formatLocalDateStr,
  summarizeDashboardTasks,
} from '../dashboardCalculations';
import type {
  DashboardActions,
  DashboardLoadedData,
  FreeStudyBlock,
} from '../types';

interface UseDashboardDataOptions {
  userId: string;
  refreshTrigger: number;
  isActive?: boolean;
  onRefresh: () => void;
}

interface RawSnapshot {
  blocks: TimeBlock[];
  events: Event[];
  windowTasks: Task[];
  overdue: {items: Task[]; total: number};
  reminders: Reminder[];
  notes: NoteSnapshot[];
  preferences: UserPreferences;
  greetingName: string;
  academicBadge: string | null;
  readError: string | null;
}

const buildAcademicBadge = (
  profile: AcademicProfileRecord | null,
): string | null => {
  if (!profile) return null;
  const parts: string[] = [];
  if (profile.program) parts.push(profile.program);
  if (profile.yearLevelShort) parts.push(profile.yearLevelShort);
  else if (profile.yearLevel) parts.push(profile.yearLevel);
  if (profile.section) parts.push(profile.section);
  return parts.length > 0 ? parts.join(' · ') : null;
};

const resolveGreetingName = (
  userId: string,
  academic: AcademicProfileRecord | null,
): string => {
  const preferred = academic?.preferredName?.trim();
  if (preferred) return preferred;
  const formatted = academic?.formattedName?.trim();
  if (formatted) return formatted.split(/\s+/)[0] || formatted;
  try {
    const user = userStore.getUserById(userId);
    const username = user?.username?.trim();
    if (username && username.toLowerCase() !== 'guest') {
      return username.split(/[\s_]+/)[0] || username;
    }
  } catch {
    // Fallback below
  }
  return 'Student';
};

const readDashboardSnapshot = (userId: string, refDate: Date): RawSnapshot => {
  const todayStr = formatLocalDateStr(refDate);
  const sevenDaysStr = formatLocalDateStr(addDaysToDate(refDate, 7));

  let academic: AcademicProfileRecord | null = null;
  try {
    // School details appear only from a reviewed COR (USTP mode).
    academic = getConfirmedAcademicProfile(userId);
  } catch {
    academic = null;
  }

  let preferences = getDefaultUserPreferences();
  try {
    preferences = preferencesStore.get(userId);
  } catch {
    // Keep defaults on error
  }

  try {
    const customCats = notesStore.getCustomCategories(userId);
    customCats.forEach(c => registerCustomCategoryColor(c.name, c.color));
  } catch {
    // Ignore custom category color load failure
  }

  let blocks: TimeBlock[] = [];
  let events: Event[] = [];
  let windowTasks: Task[] = [];
  let overdue: {items: Task[]; total: number} = {items: [], total: 0};
  let readError: string | null = null;

  try {
    const win = plannerQueries.window(userId, todayStr, sevenDaysStr);
    blocks = win.blocks;
    events = win.events;
    windowTasks = win.tasks;
    overdue = plannerQueries.overdueTasks(userId, todayStr, 20);
  } catch {
    readError = 'Could not read your local schedule from storage.';
  }

  let reminders: Reminder[] = [];
  try {
    reminders = remindersStore.getPendingReminders(userId);
  } catch {
    reminders = [];
  }

  let notes: NoteSnapshot[] = [];
  try {
    notes = notesQueryStore.page({
      userId,
      filter: 'All',
      limit: 6,
    }).items;
  } catch {
    notes = [];
  }

  return {
    blocks,
    events,
    windowTasks,
    overdue,
    reminders,
    notes,
    preferences,
    greetingName: resolveGreetingName(userId, academic),
    academicBadge: buildAcademicBadge(academic),
    readError,
  };
};

const areStringArraysEqual = (
  a: readonly string[],
  b: readonly string[],
): boolean => a.length === b.length && a.every((item, idx) => item === b[idx]);

const areBatchesEqual = (
  a: readonly ImportBatch[],
  b: readonly ImportBatch[],
): boolean =>
  a.length === b.length &&
  a.every((left, idx) => {
    const right = b[idx];
    return (
      left.id === right.id &&
      left.userId === right.userId &&
      left.timestamp === right.timestamp &&
      left.fileName === right.fileName &&
      areStringArraysEqual(left.events, right.events) &&
      areStringArraysEqual(left.blocks, right.blocks) &&
      areStringArraysEqual(left.tasks, right.tasks)
    );
  });

const areVisibilityMapsEqual = (
  a: Record<string, boolean>,
  b: Record<string, boolean>,
): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => a[k] === b[k]);
};

export const useDashboardData = ({
  userId,
  refreshTrigger,
  isActive = true,
  onRefresh,
}: UseDashboardDataOptions) => {
  const initialNowRef = useRef<Date | null>(null);
  if (!initialNowRef.current) {
    initialNowRef.current = new Date();
  }

  const [now, setNow] = useState<Date>(() => initialNowRef.current!);
  const nowRef = useRef(now);
  nowRef.current = now;

  const [config, setConfigState] = useState<DashboardConfig>(() =>
    dashboardConfigStore.get(userId),
  );
  const [batches, setBatches] = useState<ImportBatch[]>(
    () => importedBatchesStore.getCachedImportedBatches(userId) ?? [],
  );
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>(
    () =>
      calendarVisibilityStore.getCachedVisibilityMap(userId) ?? {main: true},
  );
  const activeUserRef = useRef(userId);
  activeUserRef.current = userId;

  const [raw, setRaw] = useState<RawSnapshot>(() =>
    readDashboardSnapshot(userId, initialNowRef.current!),
  );

  const loadRawData = useCallback(
    (refDate: Date = new Date()) => {
      setRaw(readDashboardSnapshot(userId, refDate));
    },
    [userId],
  );

  const syncVisibilityFromCache = useCallback(() => {
    const cachedBatches = importedBatchesStore.getCachedImportedBatches(userId);
    if (cachedBatches) {
      setBatches(prev =>
        areBatchesEqual(prev, cachedBatches) ? prev : cachedBatches,
      );
    }
    const cachedMap = calendarVisibilityStore.getCachedVisibilityMap(userId);
    if (cachedMap) {
      setVisibilityMap(prev =>
        areVisibilityMapsEqual(prev, cachedMap) ? prev : cachedMap,
      );
    }
  }, [userId]);

  const loadVisibility = useCallback(async () => {
    try {
      const [fetchedBatches, fetchedVisibility] = await Promise.all([
        importedBatchesStore.getImportedBatches(userId),
        calendarVisibilityStore.getVisibilityMap(userId),
      ]);
      if (activeUserRef.current !== userId) return;
      setBatches(prev =>
        areBatchesEqual(prev, fetchedBatches) ? prev : fetchedBatches,
      );
      setVisibilityMap(prev =>
        areVisibilityMapsEqual(prev, fetchedVisibility)
          ? prev
          : fetchedVisibility,
      );
    } catch {
      if (activeUserRef.current !== userId) return;
      setBatches(prev => (prev.length === 0 ? prev : []));
      setVisibilityMap(prev =>
        areVisibilityMapsEqual(prev, {main: true}) ? prev : {main: true},
      );
    }
  }, [userId]);

  const refresh = useCallback(() => {
    const freshNow = new Date();
    setNow(freshNow);
    setConfigState(dashboardConfigStore.get(userId));
    loadRawData(freshNow);
    syncVisibilityFromCache();
    void loadVisibility();
  }, [userId, loadRawData, syncVisibilityFromCache, loadVisibility]);

  const loadedIdentityRef = useRef({userId, refreshTrigger});
  useLayoutEffect(() => {
    if (
      loadedIdentityRef.current.userId === userId &&
      loadedIdentityRef.current.refreshTrigger === refreshTrigger
    ) {
      return;
    }
    loadedIdentityRef.current = {userId, refreshTrigger};
    refresh();
  }, [userId, refreshTrigger, refresh]);

  useEffect(() => {
    void loadVisibility();
  }, [loadVisibility]);

  const prevActiveRef = useRef(isActive);
  useLayoutEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (!wasActive && isActive) {
      syncVisibilityFromCache();
      const freshNow = new Date();
      if (formatLocalDateStr(freshNow) !== formatLocalDateStr(nowRef.current)) {
        setNow(freshNow);
        loadRawData(freshNow);
      } else if (
        Math.floor(freshNow.getTime() / 60_000) !==
        Math.floor(nowRef.current.getTime() / 60_000)
      ) {
        setNow(freshNow);
      }
    }
  }, [isActive, syncVisibilityFromCache, loadRawData]);

  // Keep live countdowns & current-class progress fresh while active.
  useEffect(() => {
    if (!isActive) return undefined;
    const tick = () => setNow(new Date());
    const interval = setInterval(tick, 30_000);
    // Floating LAFINA: a hidden Home waits for the opening Quick Chat panel.
    let cancelRefresh: () => void = () => undefined;
    const sub = AppState.addEventListener('change', state => {
      cancelRefresh();
      cancelRefresh = () => undefined;
      if (state === 'active') {
        cancelRefresh = quickChatPresence.deferWhileOpening(refresh);
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
      cancelRefresh();
    };
  }, [isActive, refresh]);

  const todayDate = useMemo(() => new Date(now), [now]);
  const blockModal = useTimeBlockModal({
    userId,
    selectedDate: todayDate,
    onSaved: () => loadRawData(new Date()),
    onRefresh,
  });

  // Apply calendar layer visibility consistently with CalendarScreen.
  const visibleData = useMemo(() => {
    const importedBlockIds = new Set<string>();
    const hiddenBlockIds = new Set<string>();
    const importedEventIds = new Set<string>();
    const hiddenEventIds = new Set<string>();
    const importedTaskIds = new Set<string>();
    const hiddenTaskIds = new Set<string>();
    const hideMain = visibilityMap.main === false;

    for (const batch of batches) {
      const visible = visibilityMap[batch.id] !== false;
      batch.blocks.forEach(id => {
        importedBlockIds.add(id);
        if (!visible) hiddenBlockIds.add(id);
      });
      batch.events.forEach(id => {
        importedEventIds.add(id);
        if (!visible) hiddenEventIds.add(id);
      });
      batch.tasks.forEach(id => {
        importedTaskIds.add(id);
        if (!visible) hiddenTaskIds.add(id);
      });
    }

    const filterVisible = <T extends {id: string}>(
      items: readonly T[],
      importedSet: Set<string>,
      hiddenSet: Set<string>,
    ): T[] =>
      items.filter(item => {
        const id = baseEntityId(item.id);
        return importedSet.has(id) ? !hiddenSet.has(id) : !hideMain;
      });

    return {
      blocks: filterVisible(raw.blocks, importedBlockIds, hiddenBlockIds),
      events: filterVisible(raw.events, importedEventIds, hiddenEventIds),
      windowTasks: filterVisible(
        raw.windowTasks,
        importedTaskIds,
        hiddenTaskIds,
      ),
      overdueItems: filterVisible(
        raw.overdue.items,
        importedTaskIds,
        hiddenTaskIds,
      ),
    };
  }, [batches, visibilityMap, raw]);

  const data: DashboardLoadedData = useMemo(() => {
    const todayStr = formatLocalDateStr(now);
    const tomorrowStr = formatLocalDateStr(addDaysToDate(now, 1));
    const todayItems = buildDayScheduleItems(
      todayStr,
      visibleData.blocks,
      visibleData.events,
    );
    const tomorrowItems = buildDayScheduleItems(
      tomorrowStr,
      visibleData.blocks,
      visibleData.events,
    );
    const upNext = computeUpNextSummary(todayItems, tomorrowItems, now);
    const freeStudy = computeFreeStudySummary(
      todayItems,
      raw.preferences,
      now,
      config.minFreeGapMinutes,
    );
    const tasksSummary = summarizeDashboardTasks(
      {
        items: visibleData.overdueItems,
        total:
          visibleData.overdueItems.length === raw.overdue.items.length
            ? raw.overdue.total
            : visibleData.overdueItems.length,
      },
      visibleData.windowTasks,
      todayStr,
    );

    const pinnedNotes = raw.notes.filter(n => n.isPinned);
    const highlightedNotes = (
      pinnedNotes.length > 0 ? pinnedNotes : raw.notes
    ).slice(0, 3);

    return {
      todayStr,
      nowMinutes: now.getHours() * 60 + now.getMinutes(),
      greetingName: raw.greetingName,
      academicBadge: raw.academicBadge,
      todayItems,
      upNext,
      freeStudy,
      tasksSummary,
      pendingReminders: raw.reminders.slice(0, 4),
      highlightedNotes,
      pinnedNotesCount: pinnedNotes.length,
      readError: raw.readError,
      rawBlocksCount: visibleData.blocks.length,
      rawEventsCount: visibleData.events.length,
    };
  }, [now, visibleData, raw, config.minFreeGapMinutes]);

  const updateConfig = useCallback(
    (patch: Partial<DashboardConfig>) => {
      const next = dashboardConfigStore.save(userId, patch);
      setConfigState(next);
    },
    [userId],
  );

  const applyPreset = useCallback(
    (presetId: DashboardPresetId) => {
      const next = dashboardConfigStore.applyPreset(userId, presetId);
      setConfigState(next);
    },
    [userId],
  );

  const resetConfig = useCallback(() => {
    const next = dashboardConfigStore.reset(userId);
    setConfigState(next);
  }, [userId]);

  const moveWidget = useCallback(
    (id: DashboardWidgetId, direction: 'up' | 'down') => {
      const current = [...config.widgetOrder];
      const idx = current.indexOf(id);
      if (idx < 0) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= current.length) return;
      const [moved] = current.splice(idx, 1);
      current.splice(targetIdx, 0, moved);
      updateConfig({widgetOrder: current});
    },
    [config.widgetOrder, updateConfig],
  );

  const toggleWidgetVisibility = useCallback(
    (id: DashboardWidgetId) => {
      const hidden = new Set(config.hiddenWidgets);
      if (hidden.has(id)) {
        hidden.delete(id);
      } else {
        // Ensure at least one widget stays visible.
        const visibleCount = config.widgetOrder.length - hidden.size;
        if (visibleCount <= 1) return;
        hidden.add(id);
      }
      updateConfig({hiddenWidgets: Array.from(hidden)});
    },
    [config.hiddenWidgets, config.widgetOrder.length, updateConfig],
  );

  const setMinFreeGapMinutes = useCallback(
    (minutes: MinFreeGapMinutes) => {
      updateConfig({minFreeGapMinutes: minutes});
    },
    [updateConfig],
  );

  const setScheduleFilter = useCallback(
    (filter: DashboardScheduleFilter) => {
      updateConfig({scheduleFilterDefault: filter});
    },
    [updateConfig],
  );

  const toggleTaskComplete = useCallback(
    (task: Task) => {
      tasksStore.updateTask({id: task.id, isCompleted: !task.isCompleted});
      loadRawData(new Date());
      onRefresh();
    },
    [loadRawData, onRefresh],
  );

  const openStudyBlockSlot = useCallback(
    (slot: FreeStudyBlock) => {
      if (blockModal.openNewSlot) {
        blockModal.openNewSlot({
          date: formatLocalDateStr(new Date()),
          startTime: slot.startTime,
          endTime: slot.suggestedEndTime,
          title: 'Study Block',
          category: 'Learning',
          color: Colors.blue,
        });
      } else {
        const startH = Math.floor(slot.startMinutes / 60);
        blockModal.openNewBlock(startH, new Date());
      }
    },
    [blockModal],
  );

  const actions: DashboardActions = {
    config,
    setConfig: updateConfig,
    applyPreset,
    resetConfig,
    moveWidget,
    toggleWidgetVisibility,
    setMinFreeGapMinutes,
    setScheduleFilter,
    toggleTaskComplete,
    openStudyBlockSlot,
    refresh,
  };

  return {
    now,
    data,
    actions,
    blockModal,
  };
};
