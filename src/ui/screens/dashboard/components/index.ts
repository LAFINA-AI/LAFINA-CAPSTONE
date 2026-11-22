import React from 'react';
import {DashboardHeader as DashboardHeaderView} from './DashboardHeader';
import {UpNextWidget as UpNextWidgetView} from './UpNextWidget';
import {FreeStudyBlocksWidget as FreeStudyBlocksWidgetView} from './FreeStudyBlocksWidget';
import {TodayScheduleWidget as TodayScheduleWidgetView} from './TodayScheduleWidget';
import {TasksDueWidget as TasksDueWidgetView} from './TasksDueWidget';
import {UpcomingRemindersWidget as UpcomingRemindersWidgetView} from './UpcomingRemindersWidget';
import {PinnedNotesWidget as PinnedNotesWidgetView} from './PinnedNotesWidget';
import {CustomizeDashboardModal as CustomizeDashboardModalView} from './CustomizeDashboardModal';
import {ModernHomeContent as ModernHomeContentView} from './ModernHomeContent';

// Memoized: Home re-renders when it is shown or hidden, and none of these
// changes then. They read only their props (ModernHomeContent keys its own
// store reads on `refreshTrigger` and `now`).
export const DashboardHeader = React.memo(DashboardHeaderView);
export const UpNextWidget = React.memo(UpNextWidgetView);
export const FreeStudyBlocksWidget = React.memo(FreeStudyBlocksWidgetView);
export const TodayScheduleWidget = React.memo(TodayScheduleWidgetView);
export const TasksDueWidget = React.memo(TasksDueWidgetView);
export const UpcomingRemindersWidget = React.memo(UpcomingRemindersWidgetView);
export const PinnedNotesWidget = React.memo(PinnedNotesWidgetView);
export const CustomizeDashboardModal = React.memo(CustomizeDashboardModalView);
export const ModernHomeContent = React.memo(ModernHomeContentView);
