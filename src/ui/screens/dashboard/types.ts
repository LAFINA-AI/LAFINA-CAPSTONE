import type {
  DashboardConfig,
  DashboardPresetId,
  DashboardScheduleFilter,
  DashboardWidgetId,
  MinFreeGapMinutes,
  NoteSnapshot,
  Reminder,
  Task,
} from '../../../storage';
import type {CallNavigationTarget} from '../../navigation/callNavigation';

export interface DashboardScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  onOpenCalendarTab: (
    target?: Omit<CallNavigationTarget, 'ownerId' | 'screen'>,
  ) => void;
  onOpenNotesTab: (noteId?: string) => void;
  onOpenChatTab: (prefillPrompt?: string) => void;
}

export interface DashboardScheduleItem {
  id: string;
  baseId: string;
  kind: 'class' | 'block' | 'event';
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  color: string;
  category: string;
  subtitle: string | null;
  room: string | null;
  section: string | null;
  faculty: string | null;
}

export interface UpNextSummary {
  mode: 'live' | 'upcoming' | 'wrapped_up';
  primaryItem: DashboardScheduleItem | null;
  followingItem: DashboardScheduleItem | null;
  tomorrowPreview: DashboardScheduleItem | null;
  progressPercent: number;
  minutesRemaining: number | null;
  minutesUntilStart: number | null;
}

export interface FreeStudyBlock {
  id: string;
  startTime: string;
  endTime: string;
  suggestedEndTime: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  isPeakFocus: boolean;
  peakLabel: string | null;
}

export interface FreeStudySummary {
  wakeTime: string;
  sleepTime: string;
  dayEnded: boolean;
  totalRemainingFreeMinutes: number;
  usableStudyFreeMinutes: number;
  plannedStudyMinutesToday: number;
  freeBlocks: FreeStudyBlock[];
}

export interface DashboardTasksSummary {
  overdueTasks: Task[];
  overdueTotal: number;
  dueTodayTasks: Task[];
  upcomingTasks: Task[];
}

export interface DashboardActions {
  config: DashboardConfig;
  setConfig: (patch: Partial<DashboardConfig>) => void;
  applyPreset: (presetId: DashboardPresetId) => void;
  resetConfig: () => void;
  moveWidget: (id: DashboardWidgetId, direction: 'up' | 'down') => void;
  toggleWidgetVisibility: (id: DashboardWidgetId) => void;
  setMinFreeGapMinutes: (minutes: MinFreeGapMinutes) => void;
  setScheduleFilter: (filter: DashboardScheduleFilter) => void;
  toggleTaskComplete: (task: Task) => void;
  openStudyBlockSlot: (slot: FreeStudyBlock) => void;
  refresh: () => void;
}

export interface DashboardLoadedData {
  todayStr: string;
  nowMinutes: number;
  greetingName: string;
  academicBadge: string | null;
  todayItems: DashboardScheduleItem[];
  upNext: UpNextSummary;
  freeStudy: FreeStudySummary;
  tasksSummary: DashboardTasksSummary;
  pendingReminders: Reminder[];
  highlightedNotes: NoteSnapshot[];
  pinnedNotesCount: number;
  readError: string | null;
  rawBlocksCount: number;
  rawEventsCount: number;
}
