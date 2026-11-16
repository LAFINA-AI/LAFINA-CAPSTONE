import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import type {TimeBlock, Task, Event, Reminder} from '../../../../storage';
import type {ScheduleTimelineItem} from '../types';
import {
  buildDayTimelineItems,
  formatFullWeekday,
} from '../utils/calendarHelpers';
import {WeekStrip} from './WeekStrip';
import {ScheduleItemCard} from './ScheduleItemCard';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

interface WeekViewProps {
  weekDays: Date[];
  selectedDate: Date;
  timeFormat24h: boolean;
  blocks: TimeBlock[];
  tasks: Task[];
  events: Event[];
  reminders?: Reminder[];
  onSelectDate: (date: Date) => void;
  onPressItem: (item: ScheduleTimelineItem) => void;
  onToggleTask?: (task: Task) => void;
}

export const WeekView: React.FC<WeekViewProps> = ({
  weekDays,
  selectedDate,
  timeFormat24h,
  blocks,
  tasks,
  events,
  reminders = [],
  onSelectDate,
  onPressItem,
  onToggleTask,
}) => {
  const palette = useSchedulePalette();

  const dayItems = useMemo(
    () =>
      buildDayTimelineItems({
        date: selectedDate,
        blocks,
        events,
        tasks,
        reminders,
        timeFormat24h,
      }),
    [selectedDate, blocks, events, tasks, reminders, timeFormat24h],
  );

  return (
    <View style={styles.container}>
      <WeekStrip
        weekDays={weekDays}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />

      {dayItems.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: palette.card,
              borderColor: palette.isDarkMode ? palette.border : 'transparent',
              borderWidth: palette.isDarkMode ? 1 : 0,
            },
            !palette.isDarkMode && scheduleCardShadow,
          ]}>
          <Text style={[styles.emptyText, {color: palette.muted}]}>
            {`Clear schedule on ${formatFullWeekday(selectedDate)}. Tap + to add.`}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {dayItems.map(item => (
            <ScheduleItemCard
              key={item.id}
              item={item}
              onPress={onPressItem}
              onToggleTask={onToggleTask}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  list: {
    paddingHorizontal: 18,
    gap: 12,
  },
  emptyCard: {
    marginHorizontal: 18,
    borderRadius: 20,
    padding: 20,
  },
  emptyText: {
    fontSize: 13.5,
    fontWeight: '500',
  },
});
