import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {formatLocalDate, formatShortWeekday} from '../utils/calendarHelpers';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

interface WeekStripProps {
  weekDays: Date[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

export const WeekStrip: React.FC<WeekStripProps> = ({
  weekDays,
  selectedDate,
  onSelectDate,
}) => {
  const palette = useSchedulePalette();
  const todayStr = formatLocalDate(new Date());
  const selectedStr = formatLocalDate(selectedDate);

  const todayBg = palette.isDarkMode ? palette.text : palette.darkInkBtn;
  const todayTextColor = palette.isDarkMode ? palette.bg : '#FFFFFF';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.card,
          borderColor: palette.isDarkMode ? palette.border : 'transparent',
          borderWidth: palette.isDarkMode ? 1 : 0,
        },
        !palette.isDarkMode && scheduleCardShadow,
      ]}>
      {weekDays.map(day => {
        const dayStr = formatLocalDate(day);
        const isToday = dayStr === todayStr;
        const isSelected = dayStr === selectedStr;
        const isActive = isToday || isSelected;

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
            key={dayStr}
            onPress={() => onSelectDate(new Date(day))}
            accessibilityRole="button"
            accessibilityLabel={`${formatShortWeekday(day)} ${day.getDate()}`}
            accessibilityState={{selected: isSelected}}
            style={styles.col}>
            <Text
              style={[
                styles.weekday,
                {
                  color: isActive ? palette.text : palette.muted,
                  fontWeight: isActive ? '700' : '500',
                },
              ]}>
              {formatShortWeekday(day)}
            </Text>
            <View
              key={`pill-${dayStr}-${pillState}`}
              collapsable={false}
              style={[styles.pill, {backgroundColor: pillBg}]}>
              <Text
                style={[
                  styles.dayNum,
                  {
                    color: numColor,
                    fontWeight: isActive ? '700' : '600',
                  },
                ]}>
                {day.getDate()}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 18,
    marginBottom: 14,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  weekday: {
    fontSize: 12,
    marginBottom: 8,
  },
  pill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 14,
  },
});
