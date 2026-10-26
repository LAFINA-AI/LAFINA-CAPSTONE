import {useRef} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {calendarWeek} from './calendarTimeline';

/** Rounded date strip adapted from Nol-branch 9c183a2 WeekView. */
export function CalendarWeek({
  date,
  onSelect,
  weekStartsMonday = true,
}: {
  date: string;
  onSelect: (date: string) => void;
  weekStartsMonday?: boolean;
}) {
  const {colors} = useTheme();
  const scroll = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dates}
    >
      {calendarWeek(date, weekStartsMonday).map(day => {
        const selected = day === date;
        const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
          new Date(`${day}T12:00:00Z`).getUTCDay()
        ];
        return (
          <Pressable
            key={day}
            accessibilityRole="radio"
            accessibilityLabel={`Day: ${day}`}
            accessibilityState={{checked: selected}}
            onLayout={event => {
              // A Sunday can move to the last column when the saved week start
              // changes. Keep the selected day reachable without guessing its width.
              if (selected)
                scroll.current?.scrollTo({
                  x: Math.max(
                    0,
                    event.nativeEvent.layout.x - dimensions.control * 2,
                  ),
                  animated: false,
                });
            }}
            onPress={() => onSelect(day)}
            style={[
              styles.date,
              {
                backgroundColor: selected ? colors.surface : colors.background,
                borderColor: colors.border,
              },
              selected && styles.selected,
            ]}
          >
            <Text
              style={[
                styles.weekday,
                {color: selected ? colors.text : colors.muted},
              ]}
            >
              {weekday}
            </Text>
            <Text
              style={[
                styles.day,
                {color: selected ? colors.text : colors.muted},
              ]}
            >
              {Number(day.slice(8))}
            </Text>
            {selected ? (
              <View
                style={[styles.underline, {backgroundColor: colors.accent}]}
              />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dates: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  date: {
    minWidth: dimensions.control + spacing.md,
    minHeight: 84,
    borderRadius: 20,
    borderWidth: dimensions.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  selected: {elevation: 4},
  weekday: {fontSize: typography.small},
  day: {fontSize: typography.title, fontWeight: '700'},
  underline: {
    position: 'absolute',
    bottom: 0,
    height: 5,
    left: spacing.sm,
    right: spacing.sm,
    borderBottomLeftRadius: dimensions.radius,
    borderBottomRightRadius: dimensions.radius,
  },
});
