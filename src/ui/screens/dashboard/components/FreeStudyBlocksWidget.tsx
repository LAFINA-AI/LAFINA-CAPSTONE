import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {BookOpen, Clock, Plus, Sparkles} from 'lucide-react-native';
import type {MinFreeGapMinutes} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import {formatDurationMinutes, formatTimeLabel} from '../dashboardCalculations';
import type {FreeStudyBlock, FreeStudySummary} from '../types';

interface FreeStudyBlocksWidgetProps {
  summary: FreeStudySummary;
  minGapMinutes: MinFreeGapMinutes;
  onAddStudyBlock: (slot: FreeStudyBlock) => void;
  onOpenCustomize: () => void;
}

export const FreeStudyBlocksWidget: React.FC<FreeStudyBlocksWidgetProps> = ({
  summary,
  minGapMinutes,
  onAddStudyBlock,
  onOpenCustomize,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [expanded, setExpanded] = useState(false);

  const visibleSlots = expanded
    ? summary.freeBlocks
    : summary.freeBlocks.slice(0, 4);

  return (
    <View
      style={[styles.card, themed.card, Shadows.card]}
      testID="dashboard-widget-free-study-blocks"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <BookOpen size={17} color={colors.blue} />
          <Text style={[styles.headerTitle, themed.primaryText]}>
            Free Study Blocks
          </Text>
        </View>
        <TouchableOpacity onPress={onOpenCustomize} activeOpacity={0.7}>
          <Text style={[styles.thresholdBadge, themed.secondaryText]}>
            Min {minGapMinutes}m
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricBox, themed.metricBox]}>
          <Text style={[styles.metricValue, {color: colors.success}]}>
            {formatDurationMinutes(summary.totalRemainingFreeMinutes)}
          </Text>
          <Text style={[styles.metricLabel, themed.secondaryText]}>
            Total free left today
          </Text>
        </View>

        <View style={[styles.metricBox, themed.metricBox]}>
          <Text style={[styles.metricValue, {color: colors.blue}]}>
            {formatDurationMinutes(summary.plannedStudyMinutesToday)}
          </Text>
          <Text style={[styles.metricLabel, themed.secondaryText]}>
            Study planned today
          </Text>
        </View>
      </View>

      {summary.dayEnded ? (
        <View style={[styles.emptyBox, themed.emptyBox]}>
          <Text style={[styles.emptyText, themed.secondaryText]}>
            Your active hours ({formatTimeLabel(summary.wakeTime)} –{' '}
            {formatTimeLabel(summary.sleepTime)}) have ended for today.
          </Text>
        </View>
      ) : summary.freeBlocks.length === 0 ? (
        <View style={[styles.emptyBox, themed.emptyBox]}>
          <Text style={[styles.emptyText, themed.secondaryText]}>
            No gaps of {minGapMinutes} minutes or longer left today. Adjust the
            minimum block size in Customize if you want shorter slots.
          </Text>
        </View>
      ) : (
        <View style={styles.slotsList}>
          {visibleSlots.map(slot => (
            <View
              key={slot.id}
              style={[styles.slotRow, themed.slotRow]}
              testID={`dashboard-free-slot-${slot.id}`}
            >
              <View style={styles.slotInfo}>
                <View style={styles.slotTimeRow}>
                  <Clock size={13} color={colors.textSecondary} />
                  <Text style={[styles.slotTimeText, themed.primaryText]}>
                    {formatTimeLabel(slot.startTime)} –{' '}
                    {formatTimeLabel(slot.endTime)}
                  </Text>
                </View>

                <View style={styles.slotBadgesRow}>
                  <View
                    style={[
                      styles.durationChip,
                      {backgroundColor: colors.success + '18'},
                    ]}
                  >
                    <Text
                      style={[styles.durationChipText, {color: colors.success}]}
                    >
                      {formatDurationMinutes(slot.durationMinutes)}
                    </Text>
                  </View>

                  {slot.isPeakFocus && (
                    <View
                      style={[
                        styles.peakChip,
                        {backgroundColor: colors.yellow + '22'},
                      ]}
                    >
                      <Sparkles size={11} color={colors.yellow} />
                      <Text
                        style={[styles.peakChipText, {color: colors.yellow}]}
                      >
                        {slot.peakLabel || 'Peak Focus'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.addBtn, {backgroundColor: colors.primary}]}
                onPress={() => onAddStudyBlock(slot)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Add study block from ${formatTimeLabel(
                  slot.startTime,
                )} to ${formatTimeLabel(slot.suggestedEndTime)}`}
                testID={`free-slot-add-${slot.id}`}
              >
                <Plus size={14} color={colors.white} />
                <Text style={styles.addBtnText}>Study</Text>
              </TouchableOpacity>
            </View>
          ))}

          {summary.freeBlocks.length > 4 && (
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={() => setExpanded(prev => !prev)}
              activeOpacity={0.7}
            >
              <Text style={[styles.expandBtnText, {color: colors.primary}]}>
                {expanded
                  ? 'Show fewer slots'
                  : `Show all ${summary.freeBlocks.length} study slots`}
              </Text>
            </TouchableOpacity>
          )}
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
  metricBox: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  slotRow: {
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
    marginBottom: Spacing.md,
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
  thresholdBadge: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  metricBox: {
    flex: 1,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  metricValue: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
  },
  metricLabel: {
    fontFamily: Fonts.body,
    fontSize: 11,
    marginTop: 2,
  },
  slotsList: {
    gap: Spacing.sm,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  slotInfo: {
    flex: 1,
    gap: 5,
  },
  slotTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slotTimeText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  slotBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  durationChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Layout.borderRadiusPill,
  },
  durationChipText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  peakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Layout.borderRadiusPill,
  },
  peakChipText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.borderRadiusPill,
  },
  addBtnText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  expandBtn: {
    alignItems: 'center',
    paddingTop: 4,
  },
  expandBtnText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
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
