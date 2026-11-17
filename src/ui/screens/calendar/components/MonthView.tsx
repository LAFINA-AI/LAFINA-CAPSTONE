import {useSchedulePage} from '../hooks/useSchedulePage';
import {ScheduleMoreButton} from './ScheduleMoreButton';
import React, {useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
} from 'react-native';
import {
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Plus,
} from 'lucide-react-native';
import type {TimeBlock, Task, Event, Reminder} from '../../../../storage';
import type {ScheduleTimelineItem} from '../types';
import {
  buildDayTimelineItems,
  formatLocalDate,
  formatShortMonthDay,
  formatShortWeekday,
  getDaysInMonth,
  reminderLocalDate,
} from '../utils/calendarHelpers';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

interface MonthViewProps {
  currentDate: Date;
  selectedDate: Date;
  weekStartsMonday: boolean;
  timeFormat24h: boolean;
  blocks: TimeBlock[];
  allTasks: Task[];
  allEvents: Event[];
  reminders?: Reminder[];
  onDayPress: (dayNum: number) => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onAddPlanItem?: () => void;
  onPressItem: (item: ScheduleTimelineItem) => void;
  onToggleTask?: (task: Task) => void;
}

interface DayIndicators {
  event: boolean;
  task: boolean;
  reminder: boolean;
  titles: Set<string>;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  selectedDate,
  weekStartsMonday,
  timeFormat24h,
  blocks,
  allTasks,
  allEvents,
  reminders = [],
  onDayPress,
  onPrevMonth,
  onNextMonth,
  onAddPlanItem,
  onPressItem,
  onToggleTask,
}) => {
  const palette = useSchedulePalette();

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dx) > 25 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5,
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dx < -45) {
            onNextMonth?.();
          } else if (gestureState.dx > 45) {
            onPrevMonth?.();
          }
        },
      }),
    [onPrevMonth, onNextMonth],
  );

  const {firstDayIndex, totalDays} = useMemo(
    () => getDaysInMonth(currentDate, weekStartsMonday),
    [currentDate, weekStartsMonday],
  );

  const weekdays = weekStartsMonday
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayStr = formatLocalDate(new Date());
  const selectedStr = formatLocalDate(selectedDate);
  const isSelectedToday = selectedStr === todayStr;

  const indicatorsByDate = useMemo(() => {
    const map = new Map<string, DayIndicators>();
    const ensure = (dateKey: string): DayIndicators => {
      let entry = map.get(dateKey);
      if (!entry) {
        entry = {event: false, task: false, reminder: false, titles: new Set()};
        map.set(dateKey, entry);
      }
      return entry;
    };

    for (const ev of allEvents) {
      if (!ev.date) continue;
      const entry = ensure(ev.date);
      entry.event = true;
      entry.titles.add(ev.title.trim().toLowerCase());
    }
    for (const blk of blocks) {
      if (!blk.date) continue;
      const entry = ensure(blk.date);
      entry.event = true;
      entry.titles.add(blk.title.trim().toLowerCase());
    }
    for (const task of allTasks) {
      if (!task.dueDate) continue;
      const entry = ensure(task.dueDate);
      entry.task = true;
      entry.titles.add(task.title.trim().toLowerCase());
    }
    for (const rem of reminders) {
      if (rem.status && rem.status !== 'pending') continue;
      const remDate = reminderLocalDate(rem);
      if (!remDate) continue;
      const entry = ensure(remDate);
      if (!entry.titles.has(rem.task.trim().toLowerCase())) {
        entry.reminder = true;
      }
    }

    return map;
  }, [allEvents, blocks, allTasks, reminders]);

  const rows = useMemo(() => {
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push(d);
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    const grouped: Array<Array<number | null>> = [];
    for (let r = 0; r < cells.length; r += 7) {
      grouped.push(cells.slice(r, r + 7));
    }
    return grouped;
  }, [firstDayIndex, totalDays]);

  const selectedPlanItems = useMemo(
    () =>
      buildDayTimelineItems({
        date: selectedDate,
        blocks,
        events: allEvents,
        tasks: allTasks,
        reminders,
        timeFormat24h,
      }),
    [selectedDate, blocks, allEvents, allTasks, reminders, timeFormat24h],
  );

  const todayBg = palette.isDarkMode ? palette.text : palette.darkInkBtn;
  const todayTextColor = palette.isDarkMode ? palette.bg : '#FFFFFF';

  const planHeading = isSelectedToday
    ? 'Today’s Plan'
    : `Plan · ${formatShortWeekday(selectedDate)}, ${formatShortMonthDay(
        selectedDate,
      )}`;

  const renderPlanIcon = (item: ScheduleTimelineItem) => {
    if (item.kind === 'reminder') {
      return <Bell size={18} color={palette.peachInk} />;
    }
    if (item.kind === 'task' && item.rawTask) {
      const task = item.rawTask;
      return (
        <TouchableOpacity
          onPress={() => onToggleTask?.(task)}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          accessibilityRole="checkbox"
          accessibilityLabel={`Toggle ${task.title}`}
          accessibilityState={{checked: Boolean(task.isCompleted)}}
        >
          <CheckCircle2
            size={18}
            color={palette.mintInk}
            style={task.isCompleted ? styles.completedIcon : undefined}
          />
        </TouchableOpacity>
      );
    }
    return <Calendar size={18} color={palette.accent} />;
  };

  const page = useSchedulePage(selectedStr, selectedPlanItems);

  return (
    <View style={styles.wrapper}>
      <View
        {...swipeResponder.panHandlers}
        style={[
          styles.calendarCard,
          {
            backgroundColor: palette.card,
            borderColor: palette.isDarkMode ? palette.border : 'transparent',
            borderWidth: palette.isDarkMode ? 1 : 0,
          },
          !palette.isDarkMode && scheduleCardShadow,
        ]}
      >
        <View style={styles.weekdayRow}>
          {weekdays.map(dayName => (
            <View key={dayName} style={styles.weekdayCell}>
              <Text style={[styles.weekdayText, {color: palette.muted}]}>
                {dayName}
              </Text>
            </View>
          ))}
        </View>

        {rows.map((weekRow, rowIdx) => (
          <View key={`row-${rowIdx}`} style={styles.gridRow}>
            {weekRow.map((dayNum, colIdx) => {
              if (dayNum === null) {
                return (
                  <View
                    key={`empty-${rowIdx}-${colIdx}`}
                    style={styles.dayCell}
                  />
                );
              }

              const dateObj = new Date(year, month, dayNum);
              const dateStr = formatLocalDate(dateObj);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedStr;
              const dots = indicatorsByDate.get(dateStr);

              let pillBg = 'rgba(0,0,0,0)';
              let numColor = palette.text;
              if (isToday) {
                pillBg = todayBg;
                numColor = todayTextColor;
              } else if (isSelected) {
                pillBg = palette.accent;
                numColor = '#FFFFFF';
              }

              const pillState = isToday ? 'today' : isSelected ? 'sel' : 'idle';

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={styles.dayCell}
                  onPress={() => onDayPress(dayNum)}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatShortMonthDay(dateObj)}`}
                  accessibilityState={{selected: isSelected}}
                >
                  <View
                    key={`pill-${dateStr}-${pillState}`}
                    collapsable={false}
                    style={[styles.dayPill, {backgroundColor: pillBg}]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        {
                          color: numColor,
                          fontWeight: isToday || isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {dayNum}
                    </Text>
                  </View>
                  <View style={styles.dotsRow}>
                    {dots?.event ? (
                      <View
                        style={[styles.dot, {backgroundColor: palette.accent}]}
                      />
                    ) : null}
                    {dots?.task ? (
                      <View
                        style={[styles.dot, {backgroundColor: palette.mintInk}]}
                      />
                    ) : null}
                    {dots?.reminder ? (
                      <View
                        style={[
                          styles.dot,
                          {backgroundColor: palette.peachInk},
                        ]}
                      />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.planHeaderRow}>
        <Text style={[styles.planTitle, {color: palette.text}]}>
          {planHeading}
        </Text>
        <TouchableOpacity
          style={[styles.planAddBtn, {backgroundColor: palette.accent}]}
          onPress={onAddPlanItem}
          accessibilityRole="button"
          accessibilityLabel="Add plan item"
        >
          <Plus size={18} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.planCard,
          {
            backgroundColor: palette.card,
            borderColor: palette.isDarkMode ? palette.border : 'transparent',
            borderWidth: palette.isDarkMode ? 1 : 0,
          },
          !palette.isDarkMode && scheduleCardShadow,
        ]}
      >
        {selectedPlanItems.length === 0 ? (
          <View style={styles.emptyPlan}>
            <Text style={[styles.emptyTitle, {color: palette.muted}]}>
              Nothing scheduled for this day
            </Text>
            <Text style={[styles.emptySub, {color: palette.muted}]}>
              Tap + to add a class, task, or reminder.
            </Text>
          </View>
        ) : (
          page.items.map((item, idx) => {
            const isCompletedTask =
              item.kind === 'task' && Boolean(item.rawTask?.isCompleted);
            return (
              <View key={item.id}>
                {idx > 0 && (
                  <View
                    style={[styles.divider, {backgroundColor: palette.border}]}
                  />
                )}
                <TouchableOpacity
                  activeOpacity={0.78}
                  onPress={() => onPressItem(item)}
                  style={styles.planRow}
                >
                  <View style={styles.planIconCol}>{renderPlanIcon(item)}</View>
                  <View style={styles.planBodyCol}>
                    <Text style={[styles.planCategory, {color: palette.muted}]}>
                      {item.categoryLabel}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.planItemTitle,
                        {
                          color: palette.text,
                          textDecorationLine: isCompletedTask
                            ? 'line-through'
                            : 'none',
                          opacity: isCompletedTask ? 0.65 : 1,
                        },
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.planTime, {color: palette.muted}]}>
                      {item.timeLabel}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={palette.muted} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
        <ScheduleMoreButton
          remaining={page.remaining}
          onPress={page.showMore}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: 16,
  },
  calendarCard: {
    marginHorizontal: 18,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '500',
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  dayPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 14,
  },
  dotsRow: {
    height: 8,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
  },
  planHeaderRow: {
    marginTop: 18,
    marginBottom: 10,
    marginHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  planAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCard: {
    marginHorizontal: 18,
    borderRadius: 22,
    overflow: 'hidden',
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  planIconCol: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedIcon: {
    opacity: 0.45,
  },
  planBodyCol: {
    flex: 1,
    paddingHorizontal: 12,
  },
  planCategory: {
    fontSize: 12,
    fontWeight: '500',
  },
  planItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  planTime: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 3,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  emptyPlan: {
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 12.5,
    marginTop: 4,
    textAlign: 'center',
  },
});
