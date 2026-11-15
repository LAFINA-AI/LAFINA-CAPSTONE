import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {Bell, Calendar, CheckCircle2} from 'lucide-react-native';
import {ScheduleTimelineItem} from '../types';
import type {Task} from '../../../../storage';
import {useSchedulePalette} from './schedulePalette';

interface ScheduleItemCardProps {
  item: ScheduleTimelineItem;
  compact?: boolean;
  onPress: (item: ScheduleTimelineItem) => void;
  onToggleTask?: (task: Task) => void;
}

export const ScheduleItemCard: React.FC<ScheduleItemCardProps> = ({
  item,
  compact = false,
  onPress,
  onToggleTask,
}) => {
  const palette = useSchedulePalette();
  const isCompletedTask = item.kind === 'task' && Boolean(item.rawTask?.isCompleted);
  const bg =
    item.tone === 'mint'
      ? palette.mint
      : item.tone === 'blueSoft'
        ? palette.blueSoft
        : palette.peach;

  const metaLine = item.subtitle
    ? `${item.subtitle} · ${item.timeLabel}`
    : item.timeLabel;

  const renderIcon = () => {
    if (item.kind === 'reminder') {
      return <Bell size={18} color={palette.text} />;
    }
    if (item.kind === 'task' && item.rawTask) {
      const task = item.rawTask;
      return (
        <TouchableOpacity
          onPress={() => onToggleTask?.(task)}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          accessibilityRole="checkbox"
          accessibilityLabel={`Toggle ${task.title}`}
          accessibilityState={{checked: Boolean(task.isCompleted)}}>
          <CheckCircle2
            size={18}
            color={task.isCompleted ? palette.mintInk : palette.text}
          />
        </TouchableOpacity>
      );
    }
    return <Calendar size={18} color={palette.text} />;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => onPress(item)}
      style={[
        styles.card,
        compact && styles.cardCompact,
        {
          backgroundColor: bg,
          borderColor: palette.isDarkMode ? palette.border : 'transparent',
          borderWidth: palette.isDarkMode ? 1 : 0,
          opacity: isCompletedTask ? 0.68 : 1,
        },
      ]}>
      <View style={styles.textCol}>
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            {
              color: palette.text,
              textDecorationLine: isCompletedTask ? 'line-through' : 'none',
            },
          ]}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, {color: palette.muted}]}>
          {metaLine}
        </Text>
      </View>
      <View style={styles.iconCol}>{renderIcon()}</View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardCompact: {
    paddingVertical: 12,
    borderRadius: 16,
  },
  textCol: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  meta: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 3,
  },
  iconCol: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
