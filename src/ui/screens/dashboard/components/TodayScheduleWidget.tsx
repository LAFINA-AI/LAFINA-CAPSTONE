import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Calendar, ChevronRight} from 'lucide-react-native';
import type {DashboardScheduleFilter} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import {formatTimeLabel} from '../dashboardCalculations';
import type {DashboardScheduleItem} from '../types';

interface TodayScheduleWidgetProps {
  items: readonly DashboardScheduleItem[];
  nowMinutes: number;
  filter: DashboardScheduleFilter;
  onChangeFilter: (filter: DashboardScheduleFilter) => void;
  onPressItem: (item: DashboardScheduleItem) => void;
  onOpenCalendar: () => void;
}

const FILTERS: ReadonlyArray<{id: DashboardScheduleFilter; label: string}> = [
  {id: 'all', label: 'All'},
  {id: 'classes', label: 'Classes'},
  {id: 'events', label: 'Events'},
];

export const TodayScheduleWidget: React.FC<TodayScheduleWidgetProps> = ({
  items,
  nowMinutes,
  filter,
  onChangeFilter,
  onPressItem,
  onOpenCalendar,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const filteredItems = items.filter(item => {
    if (filter === 'classes') return item.kind === 'class';
    if (filter === 'events') return item.kind === 'event';
    return true;
  });

  return (
    <View
      style={[styles.card, themed.card, Shadows.card]}
      testID="dashboard-widget-today-schedule"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <Calendar size={17} color={colors.red} />
          <Text style={[styles.headerTitle, themed.primaryText]}>
            Today's Schedule
          </Text>
        </View>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={onOpenCalendar}
          activeOpacity={0.7}
        >
          <Text style={[styles.viewAllText, {color: colors.primary}]}>
            Full week
          </Text>
          <ChevronRight size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              style={[
                styles.filterChip,
                themed.filterChip,
                active && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => onChangeFilter(f.id)}
              activeOpacity={0.75}
              testID={`dashboard-schedule-filter-${f.id}`}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active ? {color: colors.white} : themed.secondaryText,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filteredItems.length === 0 ? (
        <View style={[styles.emptyBox, themed.emptyBox]}>
          <Text style={[styles.emptyText, themed.secondaryText]}>
            {filter === 'all'
              ? 'Nothing scheduled for today yet. Tap a free study block above or open Calendar to plan your day.'
              : `No ${filter} scheduled for today.`}
          </Text>
        </View>
      ) : (
        <View style={styles.timelineList}>
          {filteredItems.map(item => {
            const isPast = item.endMinutes <= nowMinutes;
            const isNow =
              item.startMinutes <= nowMinutes && item.endMinutes > nowMinutes;

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.itemRow,
                  themed.itemRow,
                  isPast && styles.itemRowPast,
                  isNow && {borderColor: item.color || colors.red},
                ]}
                onPress={() => onPressItem(item)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatTimeLabel(
                  item.startTime,
                )} to ${formatTimeLabel(item.endTime)}`}
              >
                <View style={styles.timeCol}>
                  <Text style={[styles.startTimeText, themed.primaryText]}>
                    {formatTimeLabel(item.startTime)}
                  </Text>
                  <Text style={[styles.endTimeText, themed.secondaryText]}>
                    {formatTimeLabel(item.endTime)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.colorBar,
                    {backgroundColor: item.color || colors.blue},
                  ]}
                />

                <View style={styles.itemBody}>
                  <View style={styles.itemTopRow}>
                    <Text
                      style={[styles.itemTitle, themed.primaryText]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {isNow && (
                      <View
                        style={[
                          styles.nowBadge,
                          {backgroundColor: colors.red + '1A'},
                        ]}
                      >
                        <Text
                          style={[styles.nowBadgeText, {color: colors.red}]}
                        >
                          Now
                        </Text>
                      </View>
                    )}
                    {isPast && (
                      <Text style={[styles.doneTag, themed.mutedText]}>
                        Done
                      </Text>
                    )}
                  </View>

                  <Text
                    style={[styles.itemSubtitle, themed.secondaryText]}
                    numberOfLines={1}
                  >
                    {item.subtitle
                      ? `${item.category} · ${item.subtitle}`
                      : item.category}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  mutedText: {color: colors.textMuted},
  filterChip: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  itemRow: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  emptyBox: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    fontWeight: '700',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
  },
  filterChipText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  timelineList: {
    gap: Spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  itemRowPast: {
    opacity: 0.55,
  },
  timeCol: {
    width: 68,
  },
  startTimeText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  endTimeText: {
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  colorBar: {
    width: 3,
    height: 30,
    borderRadius: 2,
  },
  itemBody: {
    flex: 1,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  itemTitle: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  itemSubtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: 2,
  },
  nowBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Layout.borderRadiusPill,
  },
  nowBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 10,
    fontWeight: '700',
  },
  doneTag: {
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  emptyBox: {
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    padding: Spacing.md,
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 19,
  },
});
