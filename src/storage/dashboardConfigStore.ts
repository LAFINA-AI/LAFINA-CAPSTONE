import type {DatabaseTransaction} from './database';
import {localSettingsStore} from './localSettingsStore';

export const DASHBOARD_CONFIG_KEY = 'dashboard.config.v1';

export type DashboardWidgetId =
  | 'up_next'
  | 'free_study_blocks'
  | 'today_schedule'
  | 'tasks_due'
  | 'upcoming_reminders'
  | 'pinned_notes';

export type DashboardScheduleFilter = 'all' | 'classes' | 'events';

export type MinFreeGapMinutes = 30 | 45 | 60;

export type DashboardPresetId =
  | 'balanced'
  | 'class_focus'
  | 'exam_crunch'
  | 'minimal_day';

export type UpNextCardStyleId =
  | 'countdown_ring'
  | 'mascot_progress'
  | 'orb_brief'
  | 'compact_glance';

export type UpNextCardToneId = 'vivid' | 'soft' | 'minimal';

export type HomeQuickActionId =
  | 'add_task'
  | 'set_alarm'
  | 'focus'
  | 'ask_ai'
  | 'notes'
  | 'schedule';

export type HomeDensityMode = 'comfortable' | 'compact';

export interface DashboardConfig {
  version: 1;
  widgetOrder: DashboardWidgetId[];
  hiddenWidgets: DashboardWidgetId[];
  minFreeGapMinutes: MinFreeGapMinutes;
  scheduleFilterDefault: DashboardScheduleFilter;
  upNextStyle: UpNextCardStyleId;
  upNextTone: UpNextCardToneId;
  showQuickActions: boolean;
  quickActions: HomeQuickActionId[];
  homeDensity: HomeDensityMode;
  showGreetingAvatar: boolean;
}

export interface UpNextCardStyleMeta {
  id: UpNextCardStyleId;
  label: string;
  description: string;
}

export interface UpNextCardToneMeta {
  id: UpNextCardToneId;
  label: string;
  description: string;
}

export interface HomeQuickActionMeta {
  id: HomeQuickActionId;
  label: string;
  ustpLabel?: string;
}

export const ALL_UP_NEXT_CARD_STYLES: readonly UpNextCardStyleId[] = [
  'countdown_ring',
  'mascot_progress',
  'orb_brief',
  'compact_glance',
] as const;

export const UP_NEXT_CARD_STYLES: readonly UpNextCardStyleMeta[] = [
  {
    id: 'countdown_ring',
    label: 'Countdown Ring',
    description: 'Live progress ring & schedule button',
  },
  {
    id: 'mascot_progress',
    label: 'Mascot & Progress',
    description: 'LAFINA mascot & segmented day bar',
  },
  {
    id: 'orb_brief',
    label: 'Orb & Brief',
    description: 'Your AI orb & up-after summary',
  },
  {
    id: 'compact_glance',
    label: 'Compact',
    description: 'Slim card that brings Today higher',
  },
] as const;

export const ALL_UP_NEXT_CARD_TONES: readonly UpNextCardToneId[] = [
  'vivid',
  'soft',
  'minimal',
] as const;

export const UP_NEXT_CARD_TONES: readonly UpNextCardToneMeta[] = [
  {
    id: 'vivid',
    label: 'Vivid',
    description: 'Rich theme accent fill',
  },
  {
    id: 'soft',
    label: 'Soft Tint',
    description: 'Gentle theme-tinted surface',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Clean card with theme accents',
  },
] as const;

export const ALL_HOME_QUICK_ACTION_IDS: readonly HomeQuickActionId[] = [
  'add_task',
  'set_alarm',
  'focus',
  'ask_ai',
  'notes',
  'schedule',
] as const;

export const DEFAULT_HOME_QUICK_ACTIONS: readonly HomeQuickActionId[] = [
  'add_task',
  'set_alarm',
  'focus',
  'ask_ai',
] as const;

export const MIN_HOME_QUICK_ACTIONS = 2;
export const MAX_HOME_QUICK_ACTIONS = 4;

export const HOME_QUICK_ACTIONS: readonly HomeQuickActionMeta[] = [
  {id: 'add_task', label: 'Add task'},
  {id: 'set_alarm', label: 'Set alarm'},
  {id: 'focus', label: 'Focus'},
  {id: 'ask_ai', label: 'Ask AI', ustpLabel: 'Ask USTP'},
  {id: 'notes', label: 'Notes'},
  {id: 'schedule', label: 'Schedule'},
] as const;

export const HOME_DENSITY_OPTIONS: readonly HomeDensityMode[] = [
  'comfortable',
  'compact',
] as const;

export interface DashboardWidgetMeta {
  id: DashboardWidgetId;
  title: string;
  description: string;
}

export const ALL_DASHBOARD_WIDGET_IDS: readonly DashboardWidgetId[] = [
  'up_next',
  'today_schedule',
  'tasks_due',
  'free_study_blocks',
  'upcoming_reminders',
  'pinned_notes',
] as const;

export const DASHBOARD_WIDGET_META: Record<
  DashboardWidgetId,
  DashboardWidgetMeta
> = {
  up_next: {
    id: 'up_next',
    title: 'Up Next & Live Now',
    description:
      'Current class or event progress and countdown to what is next',
  },
  free_study_blocks: {
    id: 'free_study_blocks',
    title: 'Free Study Blocks',
    description:
      'Available study gaps between classes and total free time today',
  },
  today_schedule: {
    id: 'today_schedule',
    title: "Today's Schedule",
    description: 'Chronological timeline of classes, events, and time blocks',
  },
  tasks_due: {
    id: 'tasks_due',
    title: 'Tasks & Deadlines',
    description: 'Overdue alerts and upcoming tasks with quick check-off',
  },
  upcoming_reminders: {
    id: 'upcoming_reminders',
    title: 'Upcoming Reminders',
    description: 'Pending and snoozed alarms scheduled for today and beyond',
  },
  pinned_notes: {
    id: 'pinned_notes',
    title: 'Pinned & Recent Notes',
    description: 'Quick jump to pinned or recent lecture notes',
  },
};

export interface DashboardPreset {
  id: DashboardPresetId;
  label: string;
  description: string;
  widgetOrder: DashboardWidgetId[];
  hiddenWidgets: DashboardWidgetId[];
}

export const DASHBOARD_PRESETS: Record<DashboardPresetId, DashboardPreset> = {
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'All widgets in daily priority order',
    widgetOrder: [...ALL_DASHBOARD_WIDGET_IDS],
    hiddenWidgets: [],
  },
  class_focus: {
    id: 'class_focus',
    label: 'Class & Free Time',
    description:
      'Focus on live classes, today’s schedule, and open study blocks',
    widgetOrder: [
      'up_next',
      'today_schedule',
      'free_study_blocks',
      'tasks_due',
      'upcoming_reminders',
      'pinned_notes',
    ],
    hiddenWidgets: ['tasks_due', 'upcoming_reminders', 'pinned_notes'],
  },
  exam_crunch: {
    id: 'exam_crunch',
    label: 'Exam Crunch',
    description: 'Prioritize deadlines, study gaps, alarms, and pinned notes',
    widgetOrder: [
      'tasks_due',
      'free_study_blocks',
      'upcoming_reminders',
      'pinned_notes',
      'up_next',
      'today_schedule',
    ],
    hiddenWidgets: ['today_schedule'],
  },
  minimal_day: {
    id: 'minimal_day',
    label: 'Minimal Day',
    description: 'Clean focus on Up Next, today’s timeline, and pending tasks',
    widgetOrder: [
      'up_next',
      'today_schedule',
      'tasks_due',
      'free_study_blocks',
      'upcoming_reminders',
      'pinned_notes',
    ],
    hiddenWidgets: ['free_study_blocks', 'upcoming_reminders', 'pinned_notes'],
  },
};

export const getDefaultDashboardConfig = (): DashboardConfig => ({
  version: 1,
  widgetOrder: [...ALL_DASHBOARD_WIDGET_IDS],
  hiddenWidgets: [],
  minFreeGapMinutes: 30,
  scheduleFilterDefault: 'all',
  upNextStyle: 'countdown_ring',
  upNextTone: 'vivid',
  showQuickActions: true,
  quickActions: [...DEFAULT_HOME_QUICK_ACTIONS],
  homeDensity: 'comfortable',
  showGreetingAvatar: true,
});

const isWidgetId = (value: unknown): value is DashboardWidgetId =>
  typeof value === 'string' &&
  (ALL_DASHBOARD_WIDGET_IDS as readonly string[]).includes(value);

const isQuickActionId = (value: unknown): value is HomeQuickActionId =>
  typeof value === 'string' &&
  (ALL_HOME_QUICK_ACTION_IDS as readonly string[]).includes(value);

const VALID_MIN_GAPS: readonly MinFreeGapMinutes[] = [30, 45, 60];
const VALID_FILTERS: readonly DashboardScheduleFilter[] = [
  'all',
  'classes',
  'events',
];

export const normalizeDashboardConfig = (
  raw: Partial<DashboardConfig> | null | undefined,
): DashboardConfig => {
  const defaults = getDefaultDashboardConfig();
  if (!raw || typeof raw !== 'object') return defaults;

  const seenOrder = new Set<DashboardWidgetId>();
  const widgetOrder: DashboardWidgetId[] = [];
  if (Array.isArray(raw.widgetOrder)) {
    for (const id of raw.widgetOrder) {
      if (isWidgetId(id) && !seenOrder.has(id)) {
        seenOrder.add(id);
        widgetOrder.push(id);
      }
    }
  }
  for (const id of ALL_DASHBOARD_WIDGET_IDS) {
    if (!seenOrder.has(id)) {
      seenOrder.add(id);
      widgetOrder.push(id);
    }
  }

  const hiddenSet = new Set<DashboardWidgetId>();
  if (Array.isArray(raw.hiddenWidgets)) {
    for (const id of raw.hiddenWidgets) {
      if (isWidgetId(id)) hiddenSet.add(id);
    }
  }
  // Keep at least one widget visible so the dashboard is never blank.
  if (hiddenSet.size >= widgetOrder.length) {
    hiddenSet.delete(widgetOrder[0]);
  }

  const minFreeGapMinutes: MinFreeGapMinutes = VALID_MIN_GAPS.includes(
    raw.minFreeGapMinutes as MinFreeGapMinutes,
  )
    ? (raw.minFreeGapMinutes as MinFreeGapMinutes)
    : defaults.minFreeGapMinutes;

  const scheduleFilterDefault: DashboardScheduleFilter = VALID_FILTERS.includes(
    raw.scheduleFilterDefault as DashboardScheduleFilter,
  )
    ? (raw.scheduleFilterDefault as DashboardScheduleFilter)
    : defaults.scheduleFilterDefault;

  const upNextStyle: UpNextCardStyleId = (
    ALL_UP_NEXT_CARD_STYLES as readonly string[]
  ).includes(raw.upNextStyle as string)
    ? (raw.upNextStyle as UpNextCardStyleId)
    : defaults.upNextStyle;

  const upNextTone: UpNextCardToneId = (
    ALL_UP_NEXT_CARD_TONES as readonly string[]
  ).includes(raw.upNextTone as string)
    ? (raw.upNextTone as UpNextCardToneId)
    : defaults.upNextTone;

  const showQuickActions =
    typeof raw.showQuickActions === 'boolean'
      ? raw.showQuickActions
      : defaults.showQuickActions;

  const seenActions = new Set<HomeQuickActionId>();
  const quickActions: HomeQuickActionId[] = [];
  if (Array.isArray(raw.quickActions)) {
    for (const actionId of raw.quickActions) {
      if (
        isQuickActionId(actionId) &&
        !seenActions.has(actionId) &&
        quickActions.length < MAX_HOME_QUICK_ACTIONS
      ) {
        seenActions.add(actionId);
        quickActions.push(actionId);
      }
    }
  }
  if (quickActions.length < MIN_HOME_QUICK_ACTIONS) {
    for (const fallbackId of DEFAULT_HOME_QUICK_ACTIONS) {
      if (quickActions.length >= DEFAULT_HOME_QUICK_ACTIONS.length) break;
      if (!seenActions.has(fallbackId)) {
        seenActions.add(fallbackId);
        quickActions.push(fallbackId);
      }
    }
  }

  const homeDensity: HomeDensityMode = (
    HOME_DENSITY_OPTIONS as readonly string[]
  ).includes(raw.homeDensity as string)
    ? (raw.homeDensity as HomeDensityMode)
    : defaults.homeDensity;

  const showGreetingAvatar =
    typeof raw.showGreetingAvatar === 'boolean'
      ? raw.showGreetingAvatar
      : defaults.showGreetingAvatar;

  return {
    version: 1,
    widgetOrder,
    hiddenWidgets: widgetOrder.filter(id => hiddenSet.has(id)),
    minFreeGapMinutes,
    scheduleFilterDefault,
    upNextStyle,
    upNextTone,
    showQuickActions,
    quickActions,
    homeDensity,
    showGreetingAvatar,
  };
};

export const dashboardConfigStore = {
  get: (userId: string): DashboardConfig => {
    try {
      const raw = localSettingsStore.get(userId, DASHBOARD_CONFIG_KEY, '');
      if (!raw) return getDefaultDashboardConfig();
      const parsed = JSON.parse(raw) as Partial<DashboardConfig>;
      return normalizeDashboardConfig(parsed);
    } catch {
      return getDefaultDashboardConfig();
    }
  },

  save: (userId: string, patch: Partial<DashboardConfig>): DashboardConfig => {
    const current = dashboardConfigStore.get(userId);
    const next = normalizeDashboardConfig({...current, ...patch, version: 1});
    localSettingsStore.set(userId, DASHBOARD_CONFIG_KEY, JSON.stringify(next));
    return next;
  },

  applyPreset: (
    userId: string,
    presetId: DashboardPresetId,
  ): DashboardConfig => {
    const preset = DASHBOARD_PRESETS[presetId] ?? DASHBOARD_PRESETS.balanced;
    return dashboardConfigStore.save(userId, {
      widgetOrder: [...preset.widgetOrder],
      hiddenWidgets: [...preset.hiddenWidgets],
    });
  },

  reset: (userId: string): DashboardConfig => {
    const defaults = getDefaultDashboardConfig();
    localSettingsStore.set(
      userId,
      DASHBOARD_CONFIG_KEY,
      JSON.stringify(defaults),
    );
    return defaults;
  },

  transferFromGuest: (
    tx: Pick<DatabaseTransaction, 'executeSync'>,
    fromUserId: string,
    toUserId: string,
  ): void => {
    if (fromUserId === toUserId) return;
    tx.executeSync(
      `UPDATE OR IGNORE local_settings SET user_id = ? WHERE user_id = ? AND key = ?`,
      [toUserId, fromUserId, DASHBOARD_CONFIG_KEY],
    );
    tx.executeSync(`DELETE FROM local_settings WHERE user_id = ? AND key = ?`, [
      fromUserId,
      DASHBOARD_CONFIG_KEY,
    ]);
  },
};
