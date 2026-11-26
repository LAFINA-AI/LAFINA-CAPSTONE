import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {
  Bell,
  Cake,
  Calendar,
  CheckCircle2,
  Flag,
  GraduationCap,
  Paperclip,
} from 'lucide-react-native';
import {ScheduleTimelineItem} from '../types';
import type {Task} from '../../../../storage';
import {BIRTHDAY_ACCENT_COLOR} from '../utils/calendarGroups';
import {USTP_ACCENT_COLOR} from '../utils/ustpAcademicCalendar';
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
  const isCompletedTask =
    item.kind === 'task' && Boolean(item.rawTask?.isCompleted);
  const bg =
    item.tone === 'holiday'
      ? palette.isDarkMode
        ? 'rgba(11, 128, 67, 0.22)'
        : '#E6F4EA'
      : item.tone === 'ustp'
      ? palette.isDarkMode
        ? 'rgba(29, 78, 216, 0.22)'
        : '#EFF6FF'
      : item.tone === 'lilac'
      ? palette.isDarkMode
        ? 'rgba(233, 30, 99, 0.18)'
        : '#FCE4EC'
      : item.tone === 'mint'
      ? palette.mint
      : item.tone === 'blueSoft'
      ? palette.blueSoft
      : palette.peach;

  const metaLine = item.subtitle
    ? `${item.subtitle} · ${item.timeLabel}`
    : item.timeLabel;

  const renderIcon = () => {
    if (item.kind === 'holiday') {
      return <Flag size={18} color="#0B8043" />;
    }
    if (item.kind === 'ustp_event') {
      return <GraduationCap size={18} color={USTP_ACCENT_COLOR} />;
    }
    if (item.kind === 'birthday') {
      return <Cake size={18} color={BIRTHDAY_ACCENT_COLOR} />;
    }
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
          accessibilityState={{checked: Boolean(task.isCompleted)}}
        >
          <CheckCircle2
            size={18}
            color={task.isCompleted ? palette.mintInk : palette.text}
          />
        </TouchableOpacity>
      );
    }
    return <Calendar size={18} color={item.accentColor || palette.text} />;
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
          borderLeftWidth: 4,
          borderLeftColor:
            item.accentColor ||
            (item.kind === 'task'
              ? palette.mintInk
              : item.kind === 'reminder'
              ? palette.peachInk
              : palette.isDarkMode
              ? palette.border
              : 'transparent'),
          opacity: isCompletedTask ? 0.68 : 1,
        },
      ]}
    >
      <View style={styles.textCol}>
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            {
              color: palette.text,
              textDecorationLine: isCompletedTask ? 'line-through' : 'none',
            },
          ]}
        >
          {item.title}
        </Text>
        <View style={styles.metaRow}>
          <Text numberOfLines={1} style={[styles.meta, {color: palette.muted}]}>
            {metaLine}
          </Text>
          {(item.attachmentCount ?? 0) > 0 && (
            <View
              testID={`schedule-item-attachment-badge-${item.id}`}
              style={styles.attachmentBadge}
            >
              <Paperclip size={11} color={palette.muted} />
              <Text
                style={[styles.attachmentBadgeText, {color: palette.muted}]}
              >
                {item.attachmentCount}
              </Text>
            </View>
          )}
        </View>
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  meta: {
    fontSize: 12.5,
    fontWeight: '500',
    flexShrink: 1,
  },
  attachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
  },
  attachmentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  iconCol: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
