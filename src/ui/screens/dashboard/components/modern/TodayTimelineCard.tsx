import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CalendarPlus, Check, ChevronDown, ChevronUp, X} from 'lucide-react-native';
import type {DashboardScheduleFilter} from '../../../../../storage';
import {useTheme} from '../../../../contexts/ThemeContext';
import {Fonts} from '../../../../theme';
import {mixColors} from '../../../../theme/colorMix';
import type {DashboardScheduleItem, FreeStudyBlock} from '../../types';
import type {TodayTimelineRow} from './homeTimeline';

export interface TodayTimelineCardProps {
  rows: readonly TodayTimelineRow[];
  scheduleFilter: DashboardScheduleFilter;
  pomodoroActiveMinutes: number | null;
  onClearFilter: () => void;
  onPressItem: (item: DashboardScheduleItem) => void;
  onPressFocus: () => void;
  onAddStudyBlock: (slot: FreeStudyBlock) => void;
  onSeeAll: () => void;
}

const DEFAULT_VISIBLE_ROWS = 6;

const FILTER_LABELS: Record<Exclude<DashboardScheduleFilter, 'all'>, string> = {
  classes: 'Classes',
  events: 'Events',
};

const pickSmartWindow = (
  rows: readonly TodayTimelineRow[],
  limit: number,
): TodayTimelineRow[] => {
  if (rows.length <= limit) return [...rows];
  const anchorIndex = rows.findIndex(
    row =>
      row.kind === 'free_now' ||
      (row.kind === 'schedule' && (row.state === 'live' || row.isNext)),
  );
  if (anchorIndex < 0) return rows.slice(0, limit);
  // Keep up to 3 recent past items before Now/next so completed context stays visible.
  const start = Math.max(0, Math.min(anchorIndex - 3, rows.length - limit));
  return rows.slice(start, start + limit);
};

export const TodayTimelineCard: React.FC<TodayTimelineCardProps> = React.memo(
  ({
    rows,
    scheduleFilter,
    pomodoroActiveMinutes,
    onClearFilter,
    onPressItem,
    onPressFocus,
    onAddStudyBlock,
    onSeeAll,
  }) => {
    const {isDarkMode, modernPalette, modernShadows} = useTheme();
    const [expanded, setExpanded] = useState(false);

    const displayedRows = useMemo(
      () => (expanded ? rows : pickSmartWindow(rows, DEFAULT_VISIBLE_ROWS)),
      [rows, expanded],
    );

    const hiddenCount = Math.max(0, rows.length - displayedRows.length);
    const railColor = isDarkMode
      ? modernPalette.border
      : mixColors(modernPalette.accent, modernPalette.border, 0.12);
    const pastDotColor = mixColors(
      modernPalette.muted,
      modernPalette.border,
      isDarkMode ? 0.35 : 0.55,
    );
    const pastTitleColor = isDarkMode
      ? mixColors(modernPalette.text, modernPalette.muted, 0.55)
      : mixColors(modernPalette.text, modernPalette.muted, 0.65);

    return (
      <View style={styles.sectionWrap} testID="dashboard-widget-today-schedule">
        {/* Outside Section Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.sectionTitle, {color: modernPalette.text}]}>
              Today
            </Text>
            {scheduleFilter !== 'all' && (
              <TouchableOpacity
                testID="home-timeline-filter-pill"
                onPress={onClearFilter}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Filtered by ${FILTER_LABELS[scheduleFilter]}. Tap to show all`}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: modernPalette.softViolet,
                    borderColor: modernPalette.border,
                  },
                ]}
              >
                <Text
                  style={[styles.filterPillText, {color: modernPalette.accent}]}
                >
                  {FILTER_LABELS[scheduleFilter]}
                </Text>
                <X size={11} color={modernPalette.accent} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            testID="home-today-see-all"
            onPress={onSeeAll}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="See all of today's schedule"
          >
            <Text style={[styles.seeAllText, {color: modernPalette.accent}]}>
              See all
            </Text>
          </TouchableOpacity>
        </View>

        {/* Unified Timeline Card */}
        <View
          style={[
            styles.card,
            modernShadows.subtle,
            {
              backgroundColor: modernPalette.card,
              borderColor: modernPalette.border,
            },
          ]}
        >
          {displayedRows.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyState}
              onPress={onSeeAll}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Open Schedule to add classes or events"
            >
              <View
                style={[
                  styles.emptyIconWrap,
                  {backgroundColor: modernPalette.softViolet},
                ]}
              >
                <CalendarPlus size={20} color={modernPalette.accent} />
              </View>
              <View style={styles.emptyTextCol}>
                <Text style={[styles.emptyTitle, {color: modernPalette.text}]}>
                  {scheduleFilter === 'all'
                    ? 'Nothing scheduled yet today'
                    : `No ${FILTER_LABELS[scheduleFilter].toLowerCase()} scheduled today`}
                </Text>
                <Text style={[styles.emptySub, {color: modernPalette.muted}]}>
                  Tap to open Schedule and plan your day
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View>
              {displayedRows.map((row, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === displayedRows.length - 1;

                if (row.kind === 'free_now') {
                  return (
                    <View
                      key={row.id}
                      style={styles.row}
                      testID="home-timeline-free-now"
                    >
                      <View style={styles.timeCol}>
                        <Text
                          style={[
                            styles.timeText,
                            styles.timeTextBold,
                            {color: modernPalette.accent},
                          ]}
                          numberOfLines={1}
                        >
                          Now
                        </Text>
                      </View>

                      <View style={styles.railCol}>
                        {!isFirst && (
                          <View
                            style={[
                              styles.railUpper,
                              {backgroundColor: railColor},
                            ]}
                          />
                        )}
                        {!isLast && (
                          <View
                            style={[
                              styles.railLower,
                              {backgroundColor: railColor},
                            ]}
                          />
                        )}
                        <View
                          style={[
                            styles.nodeHalo,
                            {backgroundColor: modernPalette.mint},
                          ]}
                        >
                          <View
                            style={[
                              styles.nodeDotMedium,
                              {backgroundColor: modernPalette.mintInk},
                            ]}
                          />
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.bodyCol}
                        disabled={!row.matchingStudySlot}
                        onPress={() => {
                          if (row.matchingStudySlot) {
                            onAddStudyBlock(row.matchingStudySlot);
                          }
                        }}
                        activeOpacity={0.75}
                        accessibilityRole={
                          row.matchingStudySlot ? 'button' : 'text'
                        }
                        accessibilityLabel={
                          row.matchingStudySlot
                            ? `${row.title}. ${row.subtitle}. Tap to schedule a study block.`
                            : `${row.title}. ${row.subtitle}`
                        }
                      >
                        <Text
                          style={[
                            styles.rowTitle,
                            styles.rowTitleStrong,
                            {color: modernPalette.text},
                          ]}
                          numberOfLines={1}
                        >
                          {row.title}
                        </Text>
                        <Text
                          style={[styles.rowSub, {color: modernPalette.muted}]}
                          numberOfLines={1}
                        >
                          {row.subtitle}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        testID="home-timeline-focus-btn"
                        onPress={onPressFocus}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityLabel={
                          pomodoroActiveMinutes !== null
                            ? 'Resume active Focus session'
                            : 'Start Focus session'
                        }
                        style={[
                          styles.focusPill,
                          {backgroundColor: modernPalette.darkInkBtn},
                        ]}
                      >
                        <Text style={styles.focusPillText}>
                          {pomodoroActiveMinutes !== null ? 'Resume' : 'Focus'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                const isPast = row.state === 'past';
                const isLive = row.state === 'live';
                const isNext = row.isNext;
                const timeColor =
                  isLive || isNext
                    ? modernPalette.accent
                    : isPast
                    ? modernPalette.muted
                    : modernPalette.text;

                return (
                  <TouchableOpacity
                    key={row.id}
                    testID={`home-timeline-item-${row.item.baseId}`}
                    style={styles.row}
                    onPress={() => onPressItem(row.item)}
                    activeOpacity={0.76}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.title}, ${row.timeLabel}, ${row.subtitle}`}
                  >
                    <View style={styles.timeCol}>
                      <Text
                        style={[
                          styles.timeText,
                          (isLive || isNext) && styles.timeTextBold,
                          {color: timeColor},
                        ]}
                        numberOfLines={1}
                      >
                        {row.timeLabel}
                      </Text>
                    </View>

                    <View style={styles.railCol}>
                      {!isFirst && (
                        <View
                          style={[
                            styles.railUpper,
                            {backgroundColor: railColor},
                          ]}
                        />
                      )}
                      {!isLast && (
                        <View
                          style={[
                            styles.railLower,
                            {backgroundColor: railColor},
                          ]}
                        />
                      )}
                      {isLive || isNext ? (
                        <View
                          style={[
                            styles.nodeHalo,
                            {backgroundColor: modernPalette.softViolet},
                          ]}
                        >
                          <View
                            style={[
                              styles.nodeDotMedium,
                              {backgroundColor: modernPalette.accent},
                            ]}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.nodeDotSmall,
                            {
                              backgroundColor: isPast
                                ? pastDotColor
                                : row.item.color || modernPalette.accent,
                            },
                          ]}
                        />
                      )}
                    </View>

                    <View style={styles.bodyCol}>
                      <Text
                        style={[
                          styles.rowTitle,
                          !isPast && styles.rowTitleStrong,
                          {
                            color: isPast ? pastTitleColor : modernPalette.text,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {row.title}
                      </Text>
                      <Text
                        style={[styles.rowSub, {color: modernPalette.muted}]}
                        numberOfLines={1}
                      >
                        {row.subtitle}
                      </Text>
                    </View>

                    {isPast && (
                      <View
                        style={styles.trailingWrap}
                        testID={`home-timeline-done-${row.item.baseId}`}
                      >
                        <Check
                          size={16}
                          color={modernPalette.mintInk}
                          strokeWidth={2.4}
                        />
                      </View>
                    )}

                    {isLive && row.remainingLabel && (
                      <View
                        style={[
                          styles.liveBadge,
                          {backgroundColor: modernPalette.softViolet},
                        ]}
                      >
                        <Text
                          style={[
                            styles.liveBadgeText,
                            {color: modernPalette.accent},
                          ]}
                        >
                          {row.remainingLabel}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {(hiddenCount > 0 || expanded) && rows.length > DEFAULT_VISIBLE_ROWS && (
                <TouchableOpacity
                  testID="home-timeline-expand-btn"
                  style={[
                    styles.expandBtn,
                    {borderTopColor: modernPalette.border},
                  ]}
                  onPress={() => setExpanded(prev => !prev)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.expandText,
                      {color: modernPalette.accent},
                    ]}
                  >
                    {expanded
                      ? 'Show less'
                      : `Show all ${rows.length} items`}
                  </Text>
                  {expanded ? (
                    <ChevronUp size={14} color={modernPalette.accent} />
                  ) : (
                    <ChevronDown size={14} color={modernPalette.accent} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  sectionWrap: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  seeAllText: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 8,
    gap: 8,
  },
  timeCol: {
    width: 66,
    paddingRight: 2,
  },
  timeText: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  timeTextBold: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  railCol: {
    width: 24,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railUpper: {
    position: 'absolute',
    top: -8,
    bottom: '50%',
    width: 1.5,
  },
  railLower: {
    position: 'absolute',
    top: '50%',
    bottom: -8,
    width: 1.5,
  },
  nodeHalo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDotMedium: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  nodeDotSmall: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  bodyCol: {
    flex: 1,
    paddingLeft: 4,
  },
  rowTitle: {
    fontFamily: Fonts.heading,
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  rowTitleStrong: {
    fontWeight: '700',
  },
  rowSub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 1,
  },
  trailingWrap: {
    paddingLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusPill: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 12,
    marginLeft: 6,
  },
  focusPillText: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  liveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginLeft: 6,
  },
  liveBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 10,
    paddingBottom: 4,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandText: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  emptyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextCol: {
    flex: 1,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: 14.5,
    fontWeight: '700',
  },
  emptySub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    marginTop: 2,
  },
});
