import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {Button} from '../../core/ui/controls';
import {calendarMonth, shiftCalendarMonth} from './calendarMonthModel';

const minimumDate = '2000-01-01';
const maximumDate = '2100-12-31';
const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Month-grid layout adapted from LAFINA-CAPSTONE origin 9c183a2,
 * src/ui/screens/calendar/components/MonthView.tsx. Its account stores, device-
 * local Date interpretation and unbounded per-cell record scans are not ported.
 * The selected date's paged agenda remains the authoritative item list below.
 */
export function CalendarMonth({
  selectedDate,
  today,
  onSelect,
  showHeader = true,
  weekStartsMonday = true,
}: {
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
  showHeader?: boolean;
  weekStartsMonday?: boolean;
}) {
  const {colors} = useTheme();
  const {fontScale} = useWindowDimensions();
  // Wrap whole controls as text grows instead of splitting "Previous month"
  // into narrow fragments on smaller phones. Navigation stays in normal flow.
  const navigationButton = {
    minWidth: Math.ceil(dimensions.control * 2.25 * fontScale),
  };
  const month = calendarMonth(selectedDate, weekStartsMonday);
  const weekdays = weekStartsMonday
    ? weekdayNames
    : ['Sun', ...weekdayNames.slice(0, 6)];
  const previousDisabled = selectedDate.slice(0, 7) <= minimumDate.slice(0, 7);
  const nextDisabled = selectedDate.slice(0, 7) >= maximumDate.slice(0, 7);
  return (
    <View style={styles.section}>
      {showHeader ? (
        <>
          <Text
            accessibilityRole="header"
            style={[styles.title, {color: colors.text}]}
          >
            {month.title}
          </Text>
          <View style={styles.navigation}>
            <View style={[styles.navButton, navigationButton]}>
              <Button
                label="Previous month"
                secondary
                disabled={previousDisabled}
                onPress={() => {
                  if (!previousDisabled)
                    onSelect(shiftCalendarMonth(selectedDate, -1));
                }}
              />
            </View>
            <View style={[styles.navButton, navigationButton]}>
              <Button label="Today" secondary onPress={() => onSelect(today)} />
            </View>
            <View style={[styles.navButton, navigationButton]}>
              <Button
                label="Next month"
                secondary
                disabled={nextDisabled}
                onPress={() => {
                  if (!nextDisabled)
                    onSelect(shiftCalendarMonth(selectedDate, 1));
                }}
              />
            </View>
          </View>
        </>
      ) : null}
      <ScrollView horizontal contentContainerStyle={styles.gridContent}>
        <View style={styles.grid}>
          <View style={styles.row}>
            {weekdays.map(day => (
              <Text key={day} style={[styles.weekday, {color: colors.muted}]}>
                {day}
              </Text>
            ))}
          </View>
          {Array.from({length: month.cells.length / 7}, (_, row) => (
            <View key={row} style={styles.row}>
              {month.cells.slice(row * 7, row * 7 + 7).map((date, column) => {
                const selected = date === selectedDate;
                return date ? (
                  <Pressable
                    key={date}
                    accessibilityRole="radio"
                    accessibilityLabel={`Day: ${date}`}
                    accessibilityHint="Shows this date's agenda below"
                    accessibilityState={{checked: selected}}
                    onPress={() => onSelect(date)}
                    style={[
                      styles.cell,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected
                          ? colors.selected
                          : colors.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.day, {color: colors.text}]}>
                      {Number(date.slice(8))}
                    </Text>
                    {date === today ? (
                      <Text style={[styles.today, {color: colors.primary}]}>
                        •
                      </Text>
                    ) : null}
                  </Pressable>
                ) : (
                  <View key={`empty_${column}`} style={styles.emptyCell} />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={[styles.caption, {color: colors.muted}]}>
        Choose a date to view its agenda below.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginBottom: spacing.md},
  title: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  navigation: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  navButton: {flexGrow: 1, flexBasis: 0},
  // Preserve 48dp date targets on narrow phones instead of squeezing seven
  // columns. Horizontal scrolling is limited to the grid, not the whole form.
  gridContent: {flexGrow: 1, minWidth: dimensions.control * 7},
  grid: {flex: 1},
  row: {flexDirection: 'row'},
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.small,
    paddingVertical: spacing.sm,
  },
  cell: {
    flex: 1,
    minWidth: dimensions.control,
    minHeight: dimensions.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: dimensions.border,
    borderRadius: spacing.xs,
  },
  emptyCell: {
    flex: 1,
    minWidth: dimensions.control,
    minHeight: dimensions.control,
  },
  day: {fontSize: typography.body, fontWeight: '600'},
  today: {fontSize: typography.small, lineHeight: typography.small},
  caption: {fontSize: typography.small, marginTop: spacing.sm},
});
