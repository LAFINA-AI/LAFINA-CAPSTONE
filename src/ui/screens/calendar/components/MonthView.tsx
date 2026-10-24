import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors } from '../../../theme';
import { getDaysInMonth } from '../utils/calendarHelpers';
import type { TimeBlock, Task, Event } from '../../../../storage';

interface MonthViewProps {
  currentDate: Date;
  selectedDate?: Date;
  weekStartsMonday: boolean;
  viewMode: string;
  blocks: TimeBlock[];
  allTasks: Task[];
  allEvents: Event[];
  onDayTap: (dayNum: number) => void;
  getCategoryColor: (cat: string) => string;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  selectedDate,
  weekStartsMonday,
  blocks,
  allTasks,
  allEvents,
  onDayTap,
  getCategoryColor,
  onSwipeLeft,
  onSwipeRight,
}) => {
  const { colors, isDarkMode } = useTheme();

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const wasSwipe = useRef(false);

  const handleTouchStart = (e: any) => {
    touchStartX.current = e.nativeEvent.pageX;
    touchStartY.current = e.nativeEvent.pageY;
    wasSwipe.current = false;
  };

  const handleTouchEnd = (e: any) => {
    const touchEndX = e.nativeEvent.pageX;
    const touchEndY = e.nativeEvent.pageY;

    const dx = touchEndX - touchStartX.current;
    const dy = touchEndY - touchStartY.current;

    // Check if it is a horizontal swipe (dx is large, dy is small)
    if (Math.abs(dx) > 50 && Math.abs(dy) < 60) {
      wasSwipe.current = true;
      if (dx < 0 && onSwipeLeft) {
        onSwipeLeft();
      } else if (dx > 0 && onSwipeRight) {
        onSwipeRight();
      }
    } else {
      wasSwipe.current = false;
    }
  };

  const handleDayPress = (day: number) => {
    if (wasSwipe.current) {
      wasSwipe.current = false;
      return;
    }
    onDayTap(day);
  };
  const { firstDayIndex, totalDays } = getDaysInMonth(currentDate, weekStartsMonday);
  const cells: React.ReactNode[] = [];

  for (let i = 0; i < firstDayIndex; i++) {
    cells.push(<View key={`empty-${i}`} style={styles.calendarCellEmpty} />);
  }

  const today = new Date();
  const isCurrentMonth = today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();

  const getScheduledItemLabel = (count: number): string => {
    if (count === 0) return 'no scheduled items';
    return `${count} scheduled ${count === 1 ? 'item' : 'items'}`;
  };

  for (let day = 1; day <= totalDays; day++) {
    const isToday = isCurrentMonth && today.getDate() === day;
    const previewBg = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
    const cellDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const cellBlocks = blocks.filter((b) => b.date === cellDateStr);
    const cellTasks = allTasks.filter((t) => t.dueDate === cellDateStr);
    const cellEvents = allEvents.filter((e) => e.date === cellDateStr);

    const combined: { title: string; time: string; color: string }[] = [];

    cellBlocks.forEach((b) => {
      combined.push({ title: b.title, time: b.startTime, color: b.color });
    });
    cellTasks.forEach((t) => {
      combined.push({ title: t.title, time: t.dueTime || '00:00', color: getCategoryColor(t.category) });
    });
    cellEvents.forEach((e) => {
      combined.push({ title: e.title, time: e.startTime, color: Colors.blue });
    });

    combined.sort((a, b) => a.time.localeCompare(b.time));
    const displayItems = combined.slice(0, 3);
    const remainingCount = combined.length - 3;

    const isSelected = selectedDate ? (
      day === selectedDate.getDate() &&
      currentDate.getMonth() === selectedDate.getMonth() &&
      currentDate.getFullYear() === selectedDate.getFullYear()
    ) : false;

    const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateLabel = dateObj.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    cells.push(
      <TouchableOpacity
        key={`day-${day}`}
        style={[
          styles.calendarCell,
          { borderColor: isSelected ? colors.red : colors.border },
          isSelected && styles.selectedCell,
        ]}
        onPress={() => handleDayPress(day)}
        accessibilityRole="button"
        accessibilityLabel={`${dateLabel}, ${getScheduledItemLabel(combined.length)}`}
        accessibilityHint="Opens this date in day view"
        accessibilityState={{ selected: isSelected }}
      >
        <View style={[styles.dayContainer, isToday && styles.todayContainer]}>
          <Text style={[styles.dayText, { color: colors.textPrimary }, isToday && styles.todayText]}>
            {day}
          </Text>
        </View>
        <View style={styles.monthItemsWrapper}>
          {displayItems.map((item, idx) => (
            <View key={idx} style={[styles.monthItemPreview, { backgroundColor: previewBg, borderLeftColor: item.color }]}>
              <Text style={[{ color: colors.textPrimary }, styles.monthItemText]} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          ))}
          {remainingCount > 0 && (
            <Text style={[styles.monthItemMore, { color: colors.red }]}>+{remainingCount} more</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  const weekdayLabels = weekStartsMonday
    ? ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View
      style={styles.monthGridContainer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <View style={styles.weekdayHeaderRow}>
        {weekdayLabels.map((wd, i) => (
          <Text key={i} style={[styles.weekdayLabel, { color: colors.textSecondary }]}>
            {wd}
          </Text>
        ))}
      </View>
      <View style={styles.monthCellsGrid}>{cells}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  monthGridContainer: { flex: 1 },
  weekdayHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: 12 },
  monthCellsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: '14.28%', minHeight: 70, padding: 2, borderWidth: 0.5, alignItems: 'stretch' },
  calendarCellEmpty: { width: '14.28%', minHeight: 70, borderWidth: 0.5, borderColor: 'transparent' },
  dayContainer: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 2 },
  todayContainer: { backgroundColor: Colors.red },
  dayText: { fontFamily: 'sans-serif', fontSize: 11 },
  todayText: { color: Colors.textLight, fontWeight: 'bold' },
  selectedCell: { borderWidth: 1.5 },
  monthItemsWrapper: { flex: 1, width: '100%' },
  monthItemPreview: { borderLeftWidth: 2, paddingLeft: 3, marginVertical: 1, marginHorizontal: 1, borderRadius: 2 },
  monthItemText: { fontSize: 8, fontFamily: 'sans-serif', lineHeight: 10 },
  monthItemMore: { fontSize: 8, fontFamily: 'sans-serif', textAlign: 'center', marginTop: 1 },
});
