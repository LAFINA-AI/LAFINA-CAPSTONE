import React, {useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlarmClock,
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Pin,
  Plus,
} from 'lucide-react-native';
import {formatAlarmTime} from '../../../../../scheduler/alarmSchedule';
import type {NoteSnapshot, Reminder, Task} from '../../../../../storage';
import {useTheme} from '../../../../contexts/ThemeContext';
import {Fonts} from '../../../../theme';
import {
  formatDurationMinutes,
  formatLocalDateStr,
  formatTimeLabel,
} from '../../dashboardCalculations';
import type {FreeStudyBlock, FreeStudySummary} from '../../types';
import {
  formatAlarmDayPrefix,
  formatHomeTimeRange,
  formatTaskDueCompact,
  type NextAlarmOccurrence,
} from './homeTimeline';

const formatReminderWhen = (
  isoStr: string,
  todayStr: string,
  use24h: boolean,
): string => {
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  const datePart = formatLocalDateStr(dt);
  const hhmm = `${String(dt.getHours()).padStart(2, '0')}:${String(
    dt.getMinutes(),
  ).padStart(2, '0')}`;
  const timeLabel = formatTimeLabel(hhmm, use24h);
  if (datePart === todayStr) return `Today · ${timeLabel}`;
  const dayLabel = dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${dayLabel} · ${timeLabel}`;
};

interface SectionFrameProps {
  title: string;
  badgeText?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  testID: string;
  children: React.ReactNode;
}

const HomeSectionFrame: React.FC<SectionFrameProps> = ({
  title,
  badgeText,
  actionLabel,
  onActionPress,
  testID,
  children,
}) => {
  const {modernPalette, modernShadows} = useTheme();
  return (
    <View style={styles.sectionWrap} testID={testID}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitleGroup}>
          <Text style={[styles.sectionTitle, {color: modernPalette.text}]}>
            {title}
          </Text>
          {badgeText ? (
            <View
              style={[
                styles.countPill,
                {backgroundColor: modernPalette.softViolet},
              ]}
            >
              <Text
                style={[styles.countPillText, {color: modernPalette.accent}]}
              >
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>
        {actionLabel && onActionPress ? (
          <TouchableOpacity onPress={onActionPress} activeOpacity={0.75}>
            <Text style={[styles.sectionLink, {color: modernPalette.accent}]}>
              {actionLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View
        style={[
          styles.card,
          modernShadows.subtle,
          {
            backgroundColor: modernPalette.card,
            borderColor: modernPalette.border,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/* 1. Tasks & Deadlines Card                                                  */
/* -------------------------------------------------------------------------- */

export interface HomeTasksCardProps {
  tasks: readonly Task[];
  todayStr: string;
  timeFormat24h: boolean;
  onToggleTask: (task: Task) => void;
  onPressTask: (task: Task) => void;
  onAddTask: () => void;
}

export const HomeTasksCard: React.FC<HomeTasksCardProps> = React.memo(
  ({tasks, todayStr, timeFormat24h, onToggleTask, onPressTask, onAddTask}) => {
    const {modernPalette} = useTheme();
    const visible = tasks.slice(0, 4);

    return (
      <HomeSectionFrame
        title="Tasks"
        badgeText={tasks.length > 0 ? String(tasks.length) : undefined}
        actionLabel="+ Add"
        onActionPress={onAddTask}
        testID="dashboard-widget-tasks-due"
      >
        {visible.length > 0 ? (
          <View>
            {visible.map((task, idx) => {
              const isOverdue = Boolean(task.dueDate && task.dueDate < todayStr);
              const meta = [
                task.category || 'Academic',
                formatTaskDueCompact(task, todayStr, timeFormat24h),
              ].join(' · ');

              return (
                <View
                  key={task.id}
                  style={[
                    styles.listRow,
                    idx < visible.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: modernPalette.border,
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
                      styles.checkCircle,
                      task.isCompleted
                        ? {
                            backgroundColor: modernPalette.accent,
                            borderColor: modernPalette.accent,
                          }
                        : {
                            borderColor: isOverdue
                              ? modernPalette.danger
                              : modernPalette.muted,
                          },
                    ]}
                  >
                    {task.isCompleted && <Check size={12} color="#FFFFFF" />}
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
                      {meta}
                    </Text>
                  </TouchableOpacity>

                  {task.priority === 'High' && (
                    <View
                      style={[
                        styles.priorityPill,
                        {backgroundColor: modernPalette.dangerSoft},
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityText,
                          {color: modernPalette.danger},
                        ]}
                      >
                        High
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyCopy, {color: modernPalette.muted}]}>
            You’re all caught up on tasks.
          </Text>
        )}
      </HomeSectionFrame>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* 2. Free Study Blocks Card                                                  */
/* -------------------------------------------------------------------------- */

export interface HomeFreeStudyCardProps {
  summary: FreeStudySummary;
  timeFormat24h: boolean;
  onAddStudyBlock: (slot: FreeStudyBlock) => void;
  onOpenCustomize: () => void;
}

export const HomeFreeStudyCard: React.FC<HomeFreeStudyCardProps> = React.memo(
  ({summary, timeFormat24h, onAddStudyBlock, onOpenCustomize}) => {
    const {modernPalette} = useTheme();
    const [expanded, setExpanded] = useState(false);
    const firstSlot = summary.freeBlocks[0] ?? null;

    return (
      <HomeSectionFrame
        title="Free Study"
        badgeText={
          !summary.dayEnded && summary.usableStudyFreeMinutes > 0
            ? formatDurationMinutes(summary.usableStudyFreeMinutes)
            : undefined
        }
        actionLabel="Adjust"
        onActionPress={onOpenCustomize}
        testID="dashboard-widget-free-study-blocks"
      >
        <View style={styles.studyTopRow}>
          <View
            style={[
              styles.iconBadge,
              {backgroundColor: modernPalette.mint},
            ]}
          >
            <Clock size={18} color={modernPalette.mintInk} />
          </View>

          <Pressable
            style={styles.rowBody}
            onPress={() => {
              if (summary.freeBlocks.length > 1) {
                setExpanded(prev => !prev);
              }
            }}
          >
            <Text
              style={[styles.rowTitle, {color: modernPalette.text}]}
              numberOfLines={1}
            >
              {summary.dayEnded
                ? 'Active study hours wrapped up'
                : firstSlot
                ? formatHomeTimeRange(
                    firstSlot.startTime,
                    firstSlot.suggestedEndTime,
                    timeFormat24h,
                  )
                : 'No open study gaps remaining'}
            </Text>
            <Text
              style={[styles.rowSub, {color: modernPalette.muted}]}
              numberOfLines={1}
            >
              {firstSlot
                ? `${formatDurationMinutes(firstSlot.durationMinutes)} open${
                    firstSlot.peakLabel ? ` · ${firstSlot.peakLabel}` : ''
                  }`
                : summary.dayEnded
                ? 'Rest up for tomorrow’s schedule'
                : 'Try lowering the minimum gap in Customize'}
            </Text>
          </Pressable>

          {firstSlot && (
            <TouchableOpacity
              testID={`free-slot-add-${firstSlot.id}`}
              onPress={() => onAddStudyBlock(firstSlot)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`Add study block from ${formatTimeLabel(
                firstSlot.startTime,
                timeFormat24h,
              )} to ${formatTimeLabel(firstSlot.suggestedEndTime, timeFormat24h)}`}
              style={[
                styles.studyBtn,
                {backgroundColor: modernPalette.darkInkBtn},
              ]}
            >
              <Plus size={13} color="#FFFFFF" />
              <Text style={styles.studyBtnText}>Study</Text>
            </TouchableOpacity>
          )}
        </View>

        {summary.freeBlocks.length > 1 && (
          <>
            {expanded && (
              <View style={styles.extraSlotsWrap}>
                {summary.freeBlocks.slice(1, 4).map(slot => (
                  <View
                    key={slot.id}
                    style={[
                      styles.extraSlotRow,
                      {borderTopColor: modernPalette.border},
                    ]}
                  >
                    <Text
                      style={[
                        styles.extraSlotText,
                        {color: modernPalette.text},
                      ]}
                      numberOfLines={1}
                    >
                      {formatHomeTimeRange(
                        slot.startTime,
                        slot.endTime,
                        timeFormat24h,
                      )}{' '}
                      ({formatDurationMinutes(slot.durationMinutes)})
                    </Text>
                    <TouchableOpacity
                      testID={`free-slot-add-${slot.id}`}
                      onPress={() => onAddStudyBlock(slot)}
                      activeOpacity={0.78}
                      style={[
                        styles.extraSlotPill,
                        {backgroundColor: modernPalette.softViolet},
                      ]}
                    >
                      <Text
                        style={[
                          styles.extraSlotPillText,
                          {color: modernPalette.accent},
                        ]}
                      >
                        + Study
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.expandSlotsBtn,
                {borderTopColor: modernPalette.border},
              ]}
              onPress={() => setExpanded(prev => !prev)}
              activeOpacity={0.75}
            >
              <Text
                style={[styles.expandSlotsText, {color: modernPalette.accent}]}
              >
                {expanded
                  ? 'Hide extra slots'
                  : `+${summary.freeBlocks.length - 1} more open ${
                      summary.freeBlocks.length - 1 === 1 ? 'window' : 'windows'
                    }`}
              </Text>
              {expanded ? (
                <ChevronUp size={14} color={modernPalette.accent} />
              ) : (
                <ChevronDown size={14} color={modernPalette.accent} />
              )}
            </TouchableOpacity>
          </>
        )}
      </HomeSectionFrame>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* 3. Alarms & Reminders Card                                                 */
/* -------------------------------------------------------------------------- */

export interface HomeAlarmsRemindersCardProps {
  activeAlarm: NextAlarmOccurrence | null;
  reminders: readonly Reminder[];
  todayStr: string;
  timeFormat24h: boolean;
  onOpenAlarms: () => void;
  onSetAlarm: () => void;
  onPressReminder: (reminder: Reminder) => void;
}

export const HomeAlarmsRemindersCard: React.FC<HomeAlarmsRemindersCardProps> =
  React.memo(
    ({
      activeAlarm,
      reminders,
      todayStr,
      timeFormat24h,
      onOpenAlarms,
      onSetAlarm,
      onPressReminder,
    }) => {
      const {modernPalette} = useTheme();
      const visibleReminders = reminders.slice(0, 3);
      const hasAny = Boolean(activeAlarm || visibleReminders.length > 0);

      return (
        <HomeSectionFrame
          title="Alarms & Reminders"
          actionLabel="+ Add"
          onActionPress={onSetAlarm}
          testID="dashboard-widget-upcoming-reminders"
        >
          {hasAny ? (
            <View>
              {activeAlarm && (
                <TouchableOpacity
                  testID="dashboard-next-alarm"
                  onPress={onOpenAlarms}
                  activeOpacity={0.76}
                  style={[
                    styles.listRow,
                    visibleReminders.length > 0 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: modernPalette.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.iconBadge,
                      {backgroundColor: modernPalette.softViolet},
                    ]}
                  >
                    <AlarmClock size={17} color={modernPalette.accent} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text
                      style={[styles.rowTitle, {color: modernPalette.text}]}
                      numberOfLines={1}
                    >
                      {activeAlarm.alarm.label || 'Scheduled Alarm'}
                    </Text>
                    <Text
                      style={[styles.rowSub, {color: modernPalette.muted}]}
                      numberOfLines={1}
                    >
                      Next alarm ·{' '}
                      {formatAlarmDayPrefix(activeAlarm.at, todayStr)} ·{' '}
                      {formatAlarmTime(
                        activeAlarm.alarm.hour,
                        activeAlarm.alarm.minute,
                        timeFormat24h,
                      )}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {visibleReminders.map((rem, idx) => (
                <TouchableOpacity
                  key={rem.id}
                  onPress={() => onPressReminder(rem)}
                  activeOpacity={0.76}
                  accessibilityRole="button"
                  accessibilityLabel={`Reminder: ${rem.task}`}
                  style={[
                    styles.listRow,
                    idx < visibleReminders.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: modernPalette.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.iconBadge,
                      {backgroundColor: modernPalette.blueSoft},
                    ]}
                  >
                    <BellRing size={16} color={modernPalette.blueInk} />
                  </View>
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
                      {formatReminderWhen(rem.triggerAt, todayStr, timeFormat24h)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyCopy, {color: modernPalette.muted}]}>
              No active alarms or reminders.
            </Text>
          )}
        </HomeSectionFrame>
      );
    },
  );

/* -------------------------------------------------------------------------- */
/* 4. Pinned & Recent Notes Card                                              */
/* -------------------------------------------------------------------------- */

export interface HomeNotesCardProps {
  notes: readonly NoteSnapshot[];
  onPressNote: (noteId: string) => void;
  onOpenAllNotes: () => void;
}

export const HomeNotesCard: React.FC<HomeNotesCardProps> = React.memo(
  ({notes, onPressNote, onOpenAllNotes}) => {
    const {modernPalette} = useTheme();
    const visible = notes.slice(0, 3);

    return (
      <HomeSectionFrame
        title="Notes"
        actionLabel="All notes"
        onActionPress={onOpenAllNotes}
        testID="dashboard-widget-pinned-notes"
      >
        {visible.length > 0 ? (
          <View>
            {visible.map((note, idx) => (
              <TouchableOpacity
                key={note.id}
                testID={`dashboard-note-item-${note.id}`}
                onPress={() => onPressNote(note.id)}
                activeOpacity={0.76}
                accessibilityRole="button"
                accessibilityLabel={`Open note ${note.title || 'Untitled Note'}`}
                style={[
                  styles.listRow,
                  idx < visible.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: modernPalette.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconBadge,
                    {backgroundColor: modernPalette.cream},
                  ]}
                >
                  {note.isPinned ? (
                    <Pin size={16} color={modernPalette.creamInk} />
                  ) : (
                    <FileText size={16} color={modernPalette.creamInk} />
                  )}
                </View>
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
      </HomeSectionFrame>
    );
  },
);

const styles = StyleSheet.create({
  sectionWrap: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  countPillText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionLink: {
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: Fonts.heading,
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
  rowSub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    marginTop: 2,
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  priorityText: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
  },
  emptyCopy: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    paddingVertical: 10,
  },
  studyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  studyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 12,
  },
  studyBtnText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  extraSlotsWrap: {
    marginTop: 2,
  },
  extraSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  extraSlotText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  extraSlotPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  extraSlotPillText: {
    fontFamily: Fonts.heading,
    fontSize: 11.5,
    fontWeight: '700',
  },
  expandSlotsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandSlotsText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
});
