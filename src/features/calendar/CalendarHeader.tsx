import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {Icon, IconButton} from '../../core/ui/Icon';
import {calendarRangeLabel} from './calendarTimeline';

export function CalendarHeader({
  date,
  mode,
  onMode,
  onPrevious,
  onNext,
  onToday,
  onChoose,
  previousDisabled,
  nextDisabled,
  weekStartsMonday = true,
}: {
  date: string;
  mode: 'month' | 'week';
  onMode: (mode: 'month' | 'week') => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onChoose: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
  weekStartsMonday?: boolean;
}) {
  const {colors} = useTheme();
  return (
    <View>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose calendar date"
          onPress={onChoose}
          style={styles.date}
        >
          <Text style={[styles.title, {color: colors.text}]}>
            {calendarRangeLabel(date, mode, weekStartsMonday)}
          </Text>
          <Icon name="chevron-down" size={20} color={colors.muted} />
        </Pressable>
        <View style={styles.navigation}>
          <IconButton
            name="chevron-left"
            label={`Previous ${mode}`}
            onPress={onPrevious}
            disabled={previousDisabled}
          />
          <Pressable
            accessibilityRole="button"
            onPress={onToday}
            style={[styles.today, {borderColor: colors.border}]}
          >
            <Text style={[styles.todayText, {color: colors.text}]}>Today</Text>
          </Pressable>
          <IconButton
            name="chevron-right"
            label={`Next ${mode}`}
            onPress={onNext}
            disabled={nextDisabled}
          />
        </View>
      </View>
      <View style={[styles.segments, {backgroundColor: colors.subtle}]}>
        {(['month', 'week'] as const).map(value => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={`Calendar display: ${
              value === 'month' ? 'Month' : 'Week'
            }`}
            accessibilityState={{checked: mode === value}}
            onPress={() => onMode(value)}
            style={[
              styles.segment,
              mode === value
                ? {backgroundColor: colors.surface, borderColor: colors.border}
                : styles.unselected,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                {color: mode === value ? colors.text : colors.muted},
                mode === value && styles.active,
              ]}
            >
              {value === 'month' ? 'Month' : 'Week'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  date: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
    minHeight: dimensions.control,
  },
  title: {fontSize: typography.section, fontWeight: '700', flexShrink: 1},
  navigation: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  today: {
    minHeight: dimensions.control,
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    borderWidth: dimensions.border,
    borderRadius: dimensions.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: {fontSize: typography.body},
  segments: {flexDirection: 'row', padding: 2, borderRadius: dimensions.radius},
  segment: {
    flex: 1,
    minHeight: dimensions.control,
    borderRadius: dimensions.radius - 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: dimensions.border,
  },
  unselected: {borderColor: 'transparent'},
  segmentText: {fontSize: typography.body},
  active: {fontWeight: '700'},
});
