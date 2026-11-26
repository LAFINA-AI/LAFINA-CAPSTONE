import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import {Cake, Flag, GraduationCap} from 'lucide-react-native';
import type {
  TimeBlock,
  Task,
  Event,
  Reminder,
  ScheduleAttachedEntry,
} from '../../../../storage';
import type {ScheduleTimelineItem} from '../types';
import {buildDayTimelineItems, formatLocalDate} from '../utils/calendarHelpers';
import {BIRTHDAY_ACCENT_COLOR} from '../utils/calendarGroups';
import {USTP_ACCENT_COLOR} from '../utils/ustpAcademicCalendar';
import {WeekStrip} from './WeekStrip';
import {ScheduleItemCard} from './ScheduleItemCard';
import {useSchedulePalette} from './schedulePalette';
import {useSchedulePage} from '../hooks/useSchedulePage';
import {ScheduleMoreButton} from './ScheduleMoreButton';

interface DayViewProps {
  weekDays: Date[];
  selectedDate: Date;
  timeFormat24h: boolean;
  showHolidays?: boolean;
  showUstpCalendar?: boolean;
  showUstpGraduate?: boolean;
  blocks: TimeBlock[];
  tasks: Task[];
  events: Event[];
  reminders?: Reminder[];
  attachedEntries?: ScheduleAttachedEntry[];
  onSelectDate: (date: Date) => void;
  onAddBlock: (hour: number) => void;
  onPressItem: (item: ScheduleTimelineItem) => void;
  onToggleTask?: (task: Task) => void;
  now?: Date;
  onCurrentTimeLayout?: (y: number) => void;
}

function HourItems({
  day,
  items,
  onPress,
  onToggleTask,
}: {
  day: string;
  items: ScheduleTimelineItem[];
  onPress: DayViewProps['onPressItem'];
  onToggleTask: DayViewProps['onToggleTask'];
}) {
  const page = useSchedulePage(day, items);
  return (
    <View style={styles.slotList}>
      {page.items.map(item => (
        <ScheduleItemCard
          key={item.id}
          item={item}
          compact
          onPress={onPress}
          onToggleTask={onToggleTask}
        />
      ))}
      <ScheduleMoreButton remaining={page.remaining} onPress={page.showMore} />
    </View>
  );
}

const formatHourLabel = (hour: number, timeFormat24h: boolean): string => {
  if (timeFormat24h) {
    return `${String(hour).padStart(2, '0')}:00`;
  }
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
};

const formatExactTimeLabel = (date: Date, timeFormat24h: boolean): string => {
  const hour = date.getHours();
  const min = String(date.getMinutes()).padStart(2, '0');
  if (timeFormat24h) {
    return `${String(hour).padStart(2, '0')}:${min}`;
  }
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${min} ${suffix}`;
};

export const DayView: React.FC<DayViewProps> = React.memo(({
  weekDays,
  selectedDate,
  timeFormat24h,
  showHolidays = true,
  showUstpCalendar = false,
  showUstpGraduate = false,
  blocks,
  tasks,
  events,
  reminders = [],
  attachedEntries,
  onSelectDate,
  onAddBlock,
  onPressItem,
  onToggleTask,
  now,
  onCurrentTimeLayout,
}) => {
  const palette = useSchedulePalette();
  const [clockNow, setClockNow] = useState<Date>(() => now ?? new Date());
  const clockNowRef = useRef(clockNow);
  clockNowRef.current = clockNow;
  const timelineYRef = useRef<number | null>(null);
  const currentRowYRef = useRef<number | null>(null);

  useEffect(() => {
    if (now) {
      return;
    }
    const fresh = new Date();
    if (
      Math.floor(fresh.getTime() / 60_000) !==
      Math.floor(clockNowRef.current.getTime() / 60_000)
    ) {
      setClockNow(fresh);
    }
    const id = setInterval(() => {
      const next = new Date();
      if (
        Math.floor(next.getTime() / 60_000) !==
        Math.floor(clockNowRef.current.getTime() / 60_000)
      ) {
        setClockNow(next);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [now]);

  const effectiveNow = now ?? clockNow;
  const isToday = useMemo(
    () => formatLocalDate(selectedDate) === formatLocalDate(effectiveNow),
    [selectedDate, effectiveNow],
  );
  const currentHour = effectiveNow.getHours();
  const currentMinute = effectiveNow.getMinutes();
  const currentTimeLabel = useMemo(
    () => formatExactTimeLabel(effectiveNow, timeFormat24h),
    [effectiveNow, timeFormat24h],
  );

  const dayItems = useMemo(
    () =>
      buildDayTimelineItems({
        date: selectedDate,
        blocks,
        events,
        tasks,
        reminders,
        timeFormat24h,
        showHolidays,
        showUstpCalendar,
        showUstpGraduate,
        attachedEntries,
      }),
    [
      selectedDate,
      blocks,
      events,
      tasks,
      reminders,
      timeFormat24h,
      showHolidays,
      showUstpCalendar,
      showUstpGraduate,
      attachedEntries,
    ],
  );

  const {allDayItems, timedItems} = useMemo(() => {
    const allDay: ScheduleTimelineItem[] = [];
    const timed: ScheduleTimelineItem[] = [];
    for (const item of dayItems) {
      if (item.isAllDay) allDay.push(item);
      else timed.push(item);
    }
    return {allDayItems: allDay, timedItems: timed};
  }, [dayItems]);

  const {hours, itemsByHour} = useMemo(() => {
    const grouped = new Map<number, ScheduleTimelineItem[]>();
    let minHour = isToday ? Math.min(7, currentHour) : 7;
    let maxHour = isToday ? Math.max(20, currentHour) : 20;

    for (const item of timedItems) {
      if (item.hour < minHour) minHour = item.hour;
      if (item.hour > maxHour) maxHour = item.hour;
      const list = grouped.get(item.hour) ?? [];
      list.push(item);
      grouped.set(item.hour, list);
    }

    const hourList: number[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      hourList.push(h);
    }

    return {
      hours: hourList,
      itemsByHour: grouped,
    };
  }, [timedItems, isToday, currentHour]);

  useEffect(() => {
    if (!isToday) {
      currentRowYRef.current = null;
    }
  }, [isToday]);

  const reportCurrentTimeLayout = useCallback(() => {
    if (
      !isToday ||
      timelineYRef.current === null ||
      currentRowYRef.current === null
    ) {
      return;
    }
    onCurrentTimeLayout?.(timelineYRef.current + currentRowYRef.current);
  }, [isToday, onCurrentTimeLayout]);

  const handleTimelineLayout = useCallback(
    (e: LayoutChangeEvent) => {
      timelineYRef.current = e.nativeEvent.layout.y;
      reportCurrentTimeLayout();
    },
    [reportCurrentTimeLayout],
  );

  const handleCurrentRowLayout = useCallback(
    (e: LayoutChangeEvent) => {
      currentRowYRef.current = e.nativeEvent.layout.y;
      reportCurrentTimeLayout();
    },
    [reportCurrentTimeLayout],
  );

  const minutePct = Math.min(
    90,
    Math.max(4, Math.round((currentMinute / 60) * 100)),
  );
  const currentRowBg = palette.isDarkMode
    ? 'rgba(239, 68, 68, 0.10)'
    : 'rgba(239, 68, 68, 0.05)';

  return (
    <View style={styles.container}>
      <WeekStrip
        weekDays={weekDays}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />

      {allDayItems.length > 0 && (
        <View
          testID="day-all-day-banner"
          style={[styles.allDayBanner, {borderBottomColor: palette.border}]}
        >
          <View style={styles.allDayLabelCol}>
            <Text style={[styles.allDayLabel, {color: palette.muted}]}>
              All-day
            </Text>
          </View>
          <View style={styles.allDayList}>
            {allDayItems.map(item => {
              const isHoliday = item.kind === 'holiday';
              const isUstp = item.kind === 'ustp_event';
              const accent =
                item.accentColor ||
                (isHoliday
                  ? '#0B8043'
                  : isUstp
                  ? USTP_ACCENT_COLOR
                  : BIRTHDAY_ACCENT_COLOR);
              const chipBg = isHoliday
                ? palette.isDarkMode
                  ? 'rgba(11, 128, 67, 0.22)'
                  : '#E6F4EA'
                : isUstp
                ? palette.isDarkMode
                  ? 'rgba(29, 78, 216, 0.24)'
                  : '#EFF6FF'
                : palette.isDarkMode
                ? 'rgba(233, 30, 99, 0.18)'
                : '#FCE4EC';
              return (
                <TouchableOpacity
                  key={item.id}
                  testID={
                    isHoliday
                      ? 'holiday-chip'
                      : isUstp
                      ? 'ustp-event-chip'
                      : 'birthday-chip'
                  }
                  activeOpacity={0.8}
                  onPress={() => onPressItem(item)}
                  style={[
                    styles.allDayChip,
                    {
                      backgroundColor: chipBg,
                      borderLeftColor: accent,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${item.subtitle}`}
                >
                  {isHoliday ? (
                    <Flag size={13} color={accent} />
                  ) : isUstp ? (
                    <GraduationCap size={13} color={accent} />
                  ) : (
                    <Cake size={13} color={accent} />
                  )}
                  <Text
                    numberOfLines={1}
                    style={[styles.allDayChipTitle, {color: palette.text}]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.allDayChipSub, {color: palette.muted}]}
                  >
                    {item.subtitle}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View
        testID="day-timeline"
        style={styles.timeline}
        onLayout={handleTimelineLayout}
      >
        {hours.map(hour => {
          const slotItems = itemsByHour.get(hour) ?? [];
          const hourLabel = formatHourLabel(hour, timeFormat24h);
          const isCurrentHour = isToday && hour === currentHour;

          return (
            <View
              key={hour}
              testID={isCurrentHour ? 'day-current-hour-row' : undefined}
              onLayout={isCurrentHour ? handleCurrentRowLayout : undefined}
              style={styles.hourRow}
            >
              <View style={styles.hourLabelCol}>
                <Text
                  style={[
                    styles.hourLabel,
                    {color: isCurrentHour ? palette.danger : palette.muted},
                    isCurrentHour && styles.hourLabelActive,
                  ]}
                >
                  {hourLabel}
                </Text>
                {isCurrentHour && (
                  <View
                    testID="day-current-time-badge"
                    style={[styles.nowBadge, {backgroundColor: palette.danger}]}
                  >
                    <Text style={styles.nowBadgeText} numberOfLines={1}>
                      {currentTimeLabel}
                    </Text>
                  </View>
                )}
              </View>
              <View
                style={[
                  styles.slotCol,
                  {
                    borderTopColor: isCurrentHour
                      ? palette.danger
                      : palette.border,
                  },
                  isCurrentHour && {backgroundColor: currentRowBg},
                ]}
              >
                {isCurrentHour && (
                  <View
                    testID="day-current-time-line"
                    pointerEvents="none"
                    style={[styles.nowLineRow, {top: `${minutePct}%`}]}
                  >
                    <View
                      style={[styles.nowDot, {backgroundColor: palette.danger}]}
                    />
                    <View
                      style={[
                        styles.nowLine,
                        {backgroundColor: palette.danger},
                      ]}
                    />
                  </View>
                )}
                {slotItems.length === 0 ? (
                  <TouchableOpacity
                    style={styles.emptySlot}
                    onPress={() => onAddBlock(hour)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add block at ${hourLabel}`}
                  />
                ) : (
                  <HourItems
                    day={formatLocalDate(selectedDate)}
                    items={slotItems}
                    onPress={onPressItem}
                    onToggleTask={onToggleTask}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  timeline: {
    paddingHorizontal: 18,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 58,
  },
  hourLabelCol: {
    width: 58,
    paddingTop: 2,
    paddingRight: 6,
    alignItems: 'flex-start',
  },
  hourLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  hourLabelActive: {
    fontWeight: '700',
  },
  nowBadge: {
    marginTop: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  nowBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  slotCol: {
    flex: 1,
    position: 'relative',
    borderTopWidth: 1,
    paddingTop: 6,
    paddingBottom: 10,
    minHeight: 58,
    borderRadius: 8,
  },
  nowLineRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{translateY: -4}],
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  nowLine: {
    flex: 1,
    height: 2,
  },
  emptySlot: {
    flex: 1,
    minHeight: 40,
  },
  slotList: {
    gap: 8,
  },
  allDayBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  allDayLabelCol: {
    width: 58,
    paddingTop: 6,
    paddingRight: 6,
  },
  allDayLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  allDayList: {
    flex: 1,
    gap: 6,
  },
  allDayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 10,
    borderLeftWidth: 3.5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  allDayChipTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  allDayChipSub: {
    fontSize: 11,
    fontWeight: '500',
  },
});
