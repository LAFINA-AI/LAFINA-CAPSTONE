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
  avatarSeedStore,
  dashboardConfigStore,
  MAX_HOME_QUICK_ACTIONS,
  MIN_HOME_QUICK_ACTIONS,
  notesQueryStore,
  notesStore,
  preferencesStore,
  remindersStore,
  tasksStore,
  userStore,
} from '../../../../storage';
import {
  getConfirmedAcademicProfile,
  isUstpSchoolEnabled,
} from '../../../../storage/ustpEligibility';
import type {
  AcademicProfileRecord,
  DashboardConfig,
  DashboardPresetId,
  DashboardScheduleFilter,
  DashboardWidgetId,
  Event,
  HomeDensityMode,
  HomeQuickActionId,
  MinFreeGapMinutes,
  NoteSnapshot,
  Reminder,
  Task,
  TimeBlock,
  UpNextCardStyleId,
  UpNextCardToneId,
  UserPreferences,
} from '../../../../storage';
import {calendarVisibilityStore} from '../../../../storage/calendarVisibilityStore';
import {
  importedBatchesStore,
  type ImportBatch,
} from '../../../../storage/importedBatchesStore';
import {
  BIRTHDAYS_GROUP_ID,
  CLASSES_GROUP_ID,
  STANDARD_BLOCK_CATEGORIES,
  TASKS_GROUP_ID,
  customGroupLayerId,
  isBirthdayEvent,
} from '../../calendar/utils/calendarGroups';
import {plannerQueries} from '../../../../storage/plannerQueries';
import {getDefaultUserPreferences} from '../../../../storage/preferencesStore';
import {Colors} from '../../../theme';
import {registerCustomCategoryColor} from '../../../theme/categoryColors';
import {useTimeBlockModal} from '../../calendar/hooks/useTimeBlockModal';
import {useScheduleItemModal} from '../../calendar/hooks/useScheduleItemModal';
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
  configRevision?: number;
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
  avatarUri: string | null;
  avatarSeed: string | null;
  ustpSchoolEnabled: boolean;
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
  user: ReturnType<typeof userStore.getUserById>,
  academic: AcademicProfileRecord | null,
): string => {
  const preferred = academic?.preferredName?.trim();
  if (preferred) return preferred;
  const formatted = academic?.formattedName?.trim();
  if (formatted) return formatted.split(/\s+/)[0] || formatted;
  const username = user?.username?.trim();
  if (username && username.toLowerCase() !== 'guest') {
    return username.split(/[\s_]+/)[0] || username;
  }
  return 'Student';
};

const readDashboardSnapshot = (userId: string, refDate: Date): RawSnapshot => {
  const todayStr = formatLocalDateStr(refDate);
  const yesterdayStr = formatLocalDateStr(addDaysToDate(refDate, -1));
  const sevenDaysStr = formatLocalDateStr(addDaysToDate(refDate, 7));

  let academic: AcademicProfileRecord | null = null;
  try {
    // School details appear only from a reviewed COR (USTP mode).
    academic = getConfirmedAcademicProfile(userId);
  } catch {
    academic = null;
  }

  let user: ReturnType<typeof userStore.getUserById> = null;
  try {
    user = userStore.getUserById(userId);
  } catch {
    user = null;
  }

  let avatarSeed: string | null = null;
  try {
    avatarSeed = avatarSeedStore.get(userId);
  } catch {
    avatarSeed = null;
  }

  let ustpSchoolEnabled = false;
  try {
    ustpSchoolEnabled = isUstpSchoolEnabled(userId);
  } catch {
    ustpSchoolEnabled = false;
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
    const win = plannerQueries.window(userId, yesterdayStr, sevenDaysStr);
    blocks = win.blocks;
    events = win.events;
    windowTasks = win.tasks.filter(t => !t.dueDate || t.dueDate >= todayStr);
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
    greetingName: resolveGreetingName(user, academic),
    academicBadge: buildAcademicBadge(academic),
    avatarUri: user?.avatarUri ?? null,
    avatarSeed,
    ustpSchoolEnabled,
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
  configRevision = 0,
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
  const configRef = useRef(config);
  configRef.current = config;
  const setConfig = useCallback((next: DashboardConfig) => {
    if (JSON.stringify(configRef.current) === JSON.stringify(next)) {
      return;
    }
    configRef.current = next;
    setConfigState(next);
  }, []);
  const [batches, setBatches] = useState<ImportBatch[]>(
    () => importedBatchesStore.getCachedImportedBatches(userId) ?? [],
  );
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>(
    () =>
      calendarVisibilityStore.getCachedVisibilityMap(userId) ?? {main: true},
  );
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
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
      if (!mountedRef.current || activeUserRef.current !== userId) return;
      setBatches(prev =>
        areBatchesEqual(prev, fetchedBatches) ? prev : fetchedBatches,
      );
      setVisibilityMap(prev =>
        areVisibilityMapsEqual(prev, fetchedVisibility)
          ? prev
          : fetchedVisibility,
      );
    } catch {
      if (!mountedRef.current || activeUserRef.current !== userId) return;
      setBatches(prev => (prev.length === 0 ? prev : []));
      setVisibilityMap(prev =>
        areVisibilityMapsEqual(prev, {main: true}) ? prev : {main: true},
      );
    }
  }, [userId]);

  const refresh = useCallback(() => {
    const freshNow = new Date();
    setNow(freshNow);
    setConfig(dashboardConfigStore.get(userId));
    loadRawData(freshNow);
    syncVisibilityFromCache();
    void loadVisibility();
  }, [userId, setConfig, loadRawData, syncVisibilityFromCache, loadVisibility]);

  const loadedConfigRevRef = useRef({userId, configRevision});
  useLayoutEffect(() => {
    if (
      loadedConfigRevRef.current.userId === userId &&
      loadedConfigRevRef.current.configRevision === configRevision
    ) {
      return;
    }
    loadedConfigRevRef.current = {userId, configRevision};
    setConfig(dashboardConfigStore.get(userId));
  }, [userId, configRevision, setConfig]);

  const dirtyRef = useRef(false);
  const loadedIdentityRef = useRef({userId, refreshTrigger});
  useLayoutEffect(() => {
    const userChanged = loadedIdentityRef.current.userId !== userId;
    const triggerChanged =
      loadedIdentityRef.current.refreshTrigger !== refreshTrigger;
    if (!userChanged && !triggerChanged) {
      return;
    }
    loadedIdentityRef.current = {userId, refreshTrigger};
    if (userChanged) {
      setBatches(importedBatchesStore.getCachedImportedBatches(userId) ?? []);
      setVisibilityMap(
        calendarVisibilityStore.getCachedVisibilityMap(userId) ?? {main: true},
      );
    }
    if (!userChanged && !isActive) {
      dirtyRef.current = true;
      return;
    }
    dirtyRef.current = false;
    refresh();
  }, [userId, refreshTrigger, isActive, refresh]);

  useEffect(() => {
    void loadVisibility();
  }, [loadVisibility]);

  const prevActiveRef = useRef(isActive);
  useLayoutEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (!wasActive && isActive) {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        refresh();
        return;
      }
      syncVisibilityFromCache();
      const freshNow = new Date();
      // A new day must not paint yesterday's plan: reload before paint.
      if (formatLocalDateStr(freshNow) !== formatLocalDateStr(nowRef.current)) {
        setNow(freshNow);
        loadRawData(freshNow);
      }
    }
  }, [isActive, syncVisibilityFromCache, loadRawData, refresh]);
  // A new minute only moves countdowns: it updates right after the switch
  // paints, so returning Home is not held for a second render.
  useEffect(() => {
    if (!isActive) return;
    const freshNow = new Date();
    if (
      Math.floor(freshNow.getTime() / 60_000) !==
      Math.floor(nowRef.current.getTime() / 60_000)
    ) {
      setNow(freshNow);
    }
  }, [isActive]);

  // Keep live countdowns & current-class progress fresh while active.
  useEffect(() => {
    if (!isActive) return undefined;
    const tick = () => {
      const freshNow = new Date();
      const prev = nowRef.current;
      if (formatLocalDateStr(freshNow) !== formatLocalDateStr(prev)) {
        setNow(freshNow);
        loadRawData(freshNow);
        return;
      }
      if (
        Math.floor(freshNow.getTime() / 60_000) !==
        Math.floor(prev.getTime() / 60_000)
      ) {
        setNow(freshNow);
      }
    };
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
  }, [isActive, refresh, loadRawData]);

  const todayDate = useMemo(() => new Date(now), [now]);
  const onModalSaved = useCallback(
    () => loadRawData(new Date()),
    [loadRawData],
  );
  const blockModal = useTimeBlockModal({
    userId,
    selectedDate: todayDate,
    onSaved: onModalSaved,
    onRefresh,
  });
  const taskModal = useScheduleItemModal({
    userId,
    selectedDate: todayDate,
    onSaved: onModalSaved,
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

    const filterBlocks = (items: readonly TimeBlock[]): TimeBlock[] =>
      items.filter(block => {
        const id = baseEntityId(block.id);
        if (importedBlockIds.has(id)) return !hiddenBlockIds.has(id);
        const lowerCat = (block.category || '').trim().toLowerCase();
        if (lowerCat === 'class') {
          return visibilityMap[CLASSES_GROUP_ID] !== false;
        }
        if (lowerCat && !STANDARD_BLOCK_CATEGORIES.has(lowerCat)) {
          return visibilityMap[customGroupLayerId(lowerCat)] !== false;
        }
        return !hideMain;
      });

    const filterEvents = (items: readonly Event[]): Event[] =>
      items.filter(event => {
        const id = baseEntityId(event.id);
        if (importedEventIds.has(id)) return !hiddenEventIds.has(id);
        if (isBirthdayEvent(event)) {
          return visibilityMap[BIRTHDAYS_GROUP_ID] !== false;
        }
        return !hideMain;
      });

    const filterTasks = (items: readonly Task[]): Task[] =>
      items.filter(task => {
        const id = baseEntityId(task.id);
        if (importedTaskIds.has(id)) return !hiddenTaskIds.has(id);
        return visibilityMap[TASKS_GROUP_ID] !== false;
      });

    return {
      blocks: filterBlocks(raw.blocks),
      events: filterEvents(raw.events),
      windowTasks: filterTasks(raw.windowTasks),
      overdueItems: filterTasks(raw.overdue.items),
    };
  }, [batches, visibilityMap, raw]);

  const todayStr = formatLocalDateStr(now);
  const tomorrowStr = useMemo(
    () => formatLocalDateStr(addDaysToDate(now, 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayStr],
  );

  const staticDailyData = useMemo(() => {
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
      tomorrowItems,
      todayItems,
      tasksSummary,
      highlightedNotes,
      pinnedNotesCount: pinnedNotes.length,
      pendingReminders: raw.reminders.slice(0, 4),
    };
  }, [todayStr, tomorrowStr, visibleData, raw]);

  const data: DashboardLoadedData = useMemo(() => {
    const upNext = computeUpNextSummary(
      staticDailyData.todayItems,
      staticDailyData.tomorrowItems,
      now,
    );
    const freeStudy = computeFreeStudySummary(
      staticDailyData.todayItems,
      raw.preferences,
      now,
      config.minFreeGapMinutes,
    );

    return {
      todayStr: staticDailyData.todayStr,
      nowMinutes: now.getHours() * 60 + now.getMinutes(),
      greetingName: raw.greetingName,
      academicBadge: raw.academicBadge,
      avatarUri: raw.avatarUri,
      avatarSeed: raw.avatarSeed,
      ustpSchoolEnabled: raw.ustpSchoolEnabled,
      todayItems: staticDailyData.todayItems,
      upNext,
      freeStudy,
      tasksSummary: staticDailyData.tasksSummary,
      pendingReminders: staticDailyData.pendingReminders,
      highlightedNotes: staticDailyData.highlightedNotes,
      pinnedNotesCount: staticDailyData.pinnedNotesCount,
      readError: raw.readError,
      rawBlocksCount: visibleData.blocks.length,
      rawEventsCount: visibleData.events.length,
    };
  }, [
    now,
    staticDailyData,
    visibleData.blocks.length,
    visibleData.events.length,
    raw.preferences,
    raw.greetingName,
    raw.academicBadge,
    raw.avatarUri,
    raw.avatarSeed,
    raw.ustpSchoolEnabled,
    raw.readError,
    config.minFreeGapMinutes,
  ]);

  const updateConfig = useCallback(
    (patch: Partial<DashboardConfig>) => {
      const next = dashboardConfigStore.save(userId, patch);
      setConfig(next);
    },
    [userId, setConfig],
  );

  const applyPreset = useCallback(
    (presetId: DashboardPresetId) => {
      const next = dashboardConfigStore.applyPreset(userId, presetId);
      setConfig(next);
    },
    [userId, setConfig],
  );

  const resetConfig = useCallback(() => {
    const next = dashboardConfigStore.reset(userId);
    setConfig(next);
  }, [userId, setConfig]);

  const moveWidget = useCallback(
    (id: DashboardWidgetId, direction: 'up' | 'down') => {
      const current = [...configRef.current.widgetOrder];
      const idx = current.indexOf(id);
      if (idx < 0) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= current.length) return;
      const [moved] = current.splice(idx, 1);
      current.splice(targetIdx, 0, moved);
      updateConfig({widgetOrder: current});
    },
    [updateConfig],
  );

  const toggleWidgetVisibility = useCallback(
    (id: DashboardWidgetId) => {
      const latest = configRef.current;
      const hidden = new Set(latest.hiddenWidgets);
      if (hidden.has(id)) {
        hidden.delete(id);
      } else {
        // Ensure at least one widget stays visible.
        const visibleCount = latest.widgetOrder.length - hidden.size;
        if (visibleCount <= 1) return;
        hidden.add(id);
      }
      updateConfig({hiddenWidgets: Array.from(hidden)});
    },
    [updateConfig],
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

  const setUpNextStyle = useCallback(
    (style: UpNextCardStyleId) => {
      updateConfig({upNextStyle: style});
    },
    [updateConfig],
  );

  const setUpNextTone = useCallback(
    (tone: UpNextCardToneId) => {
      updateConfig({upNextTone: tone});
    },
    [updateConfig],
  );

  const setShowQuickActions = useCallback(
    (show: boolean) => {
      updateConfig({showQuickActions: show});
    },
    [updateConfig],
  );

  const toggleQuickAction = useCallback(
    (actionId: HomeQuickActionId) => {
      const current = configRef.current.quickActions;
      const exists = current.includes(actionId);
      if (exists) {
        if (current.length <= MIN_HOME_QUICK_ACTIONS) return;
        updateConfig({
          quickActions: current.filter(id => id !== actionId),
        });
      } else {
        if (current.length >= MAX_HOME_QUICK_ACTIONS) return;
        updateConfig({quickActions: [...current, actionId]});
      }
    },
    [updateConfig],
  );

  const setHomeDensity = useCallback(
    (density: HomeDensityMode) => {
      updateConfig({homeDensity: density});
    },
    [updateConfig],
  );

  const setShowGreetingAvatar = useCallback(
    (show: boolean) => {
      updateConfig({showGreetingAvatar: show});
    },
    [updateConfig],
  );

  const toggleTaskComplete = useCallback(
    (task: Task) => {
      try {
        tasksStore.updateTask({
          id: baseEntityId(task.id),
          isCompleted: !task.isCompleted,
        });
        loadRawData(new Date());
        onRefresh();
      } catch {
        // Keep Home responsive if storage write fails.
      }
    },
    [loadRawData, onRefresh],
  );

  // Read through a ref: the modal hooks return new objects each render, and
  // stable handlers let Home's memoized widgets skip re-rendering.
  const blockModalRef = useRef(blockModal);
  blockModalRef.current = blockModal;
  const openStudyBlockSlot = useCallback((slot: FreeStudyBlock) => {
    const modal = blockModalRef.current;
    if (modal.openNewSlot) {
      modal.openNewSlot({
        date: formatLocalDateStr(new Date()),
        startTime: slot.startTime,
        endTime: slot.suggestedEndTime,
        title: 'Study Block',
        category: 'Learning',
        color: Colors.blue,
      });
    } else {
      const startH = Math.floor(slot.startMinutes / 60);
      modal.openNewBlock(startH, new Date());
    }
  }, []);

  const taskModalRef = useRef(taskModal);
  taskModalRef.current = taskModal;
  const openAddTaskModal = useCallback(() => {
    taskModalRef.current.openNew('task');
  }, []);

  const actions: DashboardActions = useMemo(
    () => ({
      config,
      setConfig: updateConfig,
      applyPreset,
      resetConfig,
      moveWidget,
      toggleWidgetVisibility,
      setMinFreeGapMinutes,
      setScheduleFilter,
      setUpNextStyle,
      setUpNextTone,
      setShowQuickActions,
      toggleQuickAction,
      setHomeDensity,
      setShowGreetingAvatar,
      toggleTaskComplete,
      openStudyBlockSlot,
      openAddTaskModal,
      refresh,
    }),
    [
      config,
      updateConfig,
      applyPreset,
      resetConfig,
      moveWidget,
      toggleWidgetVisibility,
      setMinFreeGapMinutes,
      setScheduleFilter,
      setUpNextStyle,
      setUpNextTone,
      setShowQuickActions,
      toggleQuickAction,
      setHomeDensity,
      setShowGreetingAvatar,
      toggleTaskComplete,
      openStudyBlockSlot,
      openAddTaskModal,
      refresh,
    ],
  );

  return {
    now,
    data,
    actions,
    blockModal,
    taskModal,
  };
};
