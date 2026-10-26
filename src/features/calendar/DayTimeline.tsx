import {useEffect, useRef} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type {AgendaItem} from '../../core/domain/planner';
import {localDateTime} from '../../core/domain/scheduleTime';
import {useTheme} from '../../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../../core/theme/theme';
import {clockText} from './plannerDisplay';
import {calendarHourHeight, calendarIntervals} from './calendarTimeline';
import type {CalendarInterval} from './calendarTimeline';

/** Real paged agenda occurrences drawn to scale; opening a card uses existing details. */
export function DayTimeline({
  items,
  date,
  timezone,
  clockFormat,
  now,
  onSelect,
}: {
  items: readonly AgendaItem[];
  date: string;
  timezone: string;
  clockFormat: '12h' | '24h';
  now: Date;
  onSelect: (item: AgendaItem) => void;
}) {
  const {colors} = useTheme();
  const {fontScale, width} = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const scale = Math.max(1, fontScale);
  const hourHeight = calendarHourHeight * scale;
  const axisWidth = 56 * scale;
  let timed: CalendarInterval[] = [];
  let dateOnly: AgendaItem[] = [];
  let displayUnavailable = false;
  try {
    ({timed, dateOnly} = calendarIntervals(items, date, timezone, clockFormat));
  } catch {
    displayUnavailable = true;
  }
  const columns = Math.max(1, ...timed.map(entry => entry.columns));
  const timelineWidth = Math.max(
    width - spacing.md * 2,
    axisWidth + columns * dimensions.control * scale,
  );
  let currentMinute: number | null = null;
  try {
    const local = localDateTime(now.toISOString(), timezone);
    if (local.date === date)
      currentMinute =
        Number(local.time.slice(0, 2)) * 60 + Number(local.time.slice(3, 5));
  } catch {
    // Invalid device clock is already explained by the planner warning.
  }
  useEffect(() => {
    // Fresh time is supplied on foreground/refresh, with no background polling.
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo({y: 7 * hourHeight, animated: false}),
    );
    return () => cancelAnimationFrame(frame);
  }, [date, hourHeight]);
  if (displayUnavailable)
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text
          accessibilityRole="alert"
          style={[styles.title, {color: colors.danger}]}
        >
          Local times could not be displayed. Check the timezone in Profile.
          Saved item details remain available.
        </Text>
        {items.map(item => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.kind === 'task' ? 'Task' : 'Event'}: ${
              item.title
            }`}
            onPress={() => onSelect(item)}
            style={[
              styles.allDayCard,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}
          >
            <Text style={[styles.title, {color: colors.text}]}>
              {item.title}
            </Text>
            <Text style={[styles.detail, {color: colors.muted}]}>
              {item.at ?? item.date}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  return (
    <View style={styles.scroll}>
      {dateOnly.length ? (
        <ScrollView
          style={styles.allDay}
          contentContainerStyle={styles.allDayContent}
        >
          <Text style={[styles.detail, {color: colors.muted}]}>Date only</Text>
          {dateOnly.map(item => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`Task: ${item.title}`}
              onPress={() => onSelect(item)}
              style={[
                styles.allDayCard,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}
            >
              <Text style={[styles.title, {color: colors.text}]}>
                {item.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <ScrollView
        horizontal
        style={styles.scroll}
        contentContainerStyle={styles.horizontalContent}
      >
        <ScrollView
          ref={scroll}
          nestedScrollEnabled
          style={[styles.scroll, {width: timelineWidth}]}
          contentContainerStyle={styles.content}
          testID="calendar-day-timeline"
        >
          <View style={[styles.grid, {height: 24 * hourHeight + spacing.lg}]}>
            {Array.from({length: 25}, (_, hour) => (
              <View
                key={hour}
                pointerEvents="none"
                style={[styles.hourRow, {top: hour * hourHeight}]}
              >
                <Text
                  style={[styles.hour, {width: axisWidth, color: colors.muted}]}
                >
                  {clockText(
                    `${String(hour % 24).padStart(2, '0')}:00`,
                    clockFormat,
                  )}
                </Text>
                <View
                  style={[styles.line, {backgroundColor: colors.timelineLine}]}
                />
              </View>
            ))}
            <View
              style={[
                styles.column,
                {
                  left: axisWidth,
                  height: 24 * hourHeight,
                  backgroundColor: colors.timeline,
                },
              ]}
            >
              {timed.map(entry => (
                <Pressable
                  key={entry.item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${
                    entry.item.kind === 'task' ? 'Task' : 'Event'
                  }: ${entry.item.title}`}
                  accessibilityHint={`${entry.label}. Opens saved item details.`}
                  onPress={() => onSelect(entry.item)}
                  style={[
                    styles.card,
                    {
                      top: (entry.start * hourHeight) / 60,
                      minHeight: dimensions.control * scale,
                      height: Math.max(
                        dimensions.control * scale,
                        ((entry.end - entry.start) * hourHeight) / 60,
                      ),
                      left: `${(entry.column * 100) / entry.columns}%`,
                      width: `${100 / entry.columns}%`,
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderLeftColor: colors.accent,
                    },
                  ]}
                >
                  <Text
                    style={[styles.title, {color: colors.text}]}
                    numberOfLines={2}
                  >
                    {entry.item.title}
                  </Text>
                  <Text
                    style={[styles.detail, {color: colors.muted}]}
                    numberOfLines={2}
                  >
                    {entry.label}
                  </Text>
                </Pressable>
              ))}
              {currentMinute !== null ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.now,
                    {
                      top: (currentMinute * hourHeight) / 60,
                      backgroundColor: colors.accent,
                    },
                  ]}
                  testID="calendar-current-time"
                >
                  <View
                    style={[styles.nowDot, {backgroundColor: colors.accent}]}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {flex: 1},
  content: {paddingTop: spacing.md, paddingBottom: 100},
  grid: {position: 'relative', marginTop: spacing.sm},
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  hour: {
    fontSize: typography.caption,
    textAlign: 'right',
    paddingRight: spacing.sm,
    transform: [{translateY: -8}],
  },
  line: {height: 1, flex: 1},
  column: {position: 'absolute', top: 0, right: 0},
  card: {
    position: 'absolute',
    padding: spacing.sm,
    borderWidth: dimensions.border,
    borderLeftWidth: 3,
    borderRadius: spacing.xs,
    zIndex: 2,
  },
  title: {fontSize: typography.small, fontWeight: '600'},
  detail: {fontSize: typography.caption},
  now: {position: 'absolute', left: 0, right: 0, height: 2, zIndex: 3},
  nowDot: {
    position: 'absolute',
    left: -4,
    top: -3,
    height: 8,
    width: 8,
    borderRadius: 4,
  },
  horizontalContent: {flexGrow: 1},
  allDay: {maxHeight: 160},
  allDayContent: {gap: spacing.xs, paddingVertical: spacing.xs},
  allDayCard: {
    minHeight: dimensions.control,
    borderRadius: spacing.sm,
    borderWidth: dimensions.border,
    padding: spacing.sm,
    justifyContent: 'center',
  },
});
