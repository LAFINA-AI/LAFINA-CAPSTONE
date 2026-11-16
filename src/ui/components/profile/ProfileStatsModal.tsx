import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  AlertCircle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  FileText,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {
  Fonts,
  FontSize,
  Layout,
  ModernLayout,
  ModernShadows,
  Shadows,
  Spacing,
  useThemedStyles,
} from '../../theme';
import {ToolSheet} from '../tools/ToolSheet';
import type {DetailedProfileStatistics} from '../../../storage/profileStatisticsStore';
import {formatAudioDuration, formatMinutesVerbose} from './statsFormatting';

interface ProfileStatsModalProps {
  visible: boolean;
  statistics: DetailedProfileStatistics;
  onClose: () => void;
}

const UNAVAILABLE = '—';

interface MetricCellProps {
  value: string;
  label: string;
  tintBg: string;
  valueColor: string;
  labelColor: string;
  borderColor?: string;
}

const MetricCell: React.FC<MetricCellProps> = ({
  value,
  label,
  tintBg,
  valueColor,
  labelColor,
  borderColor,
}) => (
  <View
    style={[
      styles.metricCell,
      {backgroundColor: tintBg},
      borderColor ? {borderWidth: 1, borderColor} : undefined,
    ]}
  >
    <Text style={[styles.metricCellValue, {color: valueColor}]}>{value}</Text>
    <Text style={[styles.metricCellLabel, {color: labelColor}]}>{label}</Text>
  </View>
);

interface DetailRowProps {
  label: string;
  value: string;
  labelColor: string;
  valueColor: string;
  dividerColor: string;
  isLast?: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({
  label,
  value,
  labelColor,
  valueColor,
  dividerColor,
  isLast = false,
}) => (
  <View
    style={[
      styles.detailRow,
      !isLast && {borderBottomWidth: 1, borderBottomColor: dividerColor},
    ]}
  >
    <Text style={[styles.detailRowLabel, {color: labelColor}]}>{label}</Text>
    <Text style={[styles.detailRowValue, {color: valueColor}]}>{value}</Text>
  </View>
);

/**
 * Detailed student analytics sheet backed by actual local SQLite records.
 */
export const ProfileStatsModal: React.FC<ProfileStatsModalProps> = ({
  visible,
  statistics,
  onClose,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const countText = (value: number | null): string =>
    statistics.available && value !== null ? String(value) : UNAVAILABLE;

  const sectionCardStyle = isModern
    ? [
        styles.sectionCard,
        styles.modernSectionCard,
        ModernShadows.subtle,
        {
          backgroundColor: modernPalette.card,
          borderColor: modernPalette.border,
        },
      ]
    : [styles.sectionCard, Shadows.card, themed.sectionCard];

  const primaryTint = isModern ? modernPalette.accent : colors.primary;
  const mutedTileBg = isModern ? modernPalette.surface : colors.inputBg;
  const dividerColor = isModern ? modernPalette.border : colors.divider;

  const taskRate =
    statistics.available && statistics.totalTasksCount
      ? `${statistics.taskCompletionRate ?? 0}%`
      : statistics.available
      ? '0%'
      : UNAVAILABLE;
  const taskProgressWidth =
    statistics.available && statistics.taskCompletionRate !== null
      ? `${Math.min(100, Math.max(0, statistics.taskCompletionRate))}%`
      : '0%';

  const footer = (
    <TouchableOpacity
      style={[
        styles.closeFooterBtn,
        {backgroundColor: isModern ? modernPalette.accent : colors.primary},
      ]}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="Close detailed statistics"
      testID="stats-modal-close-btn"
    >
      <Text style={[styles.closeFooterBtnText, {color: colors.textOnPrimary}]}>
        Done
      </Text>
    </TouchableOpacity>
  );

  return (
    <ToolSheet
      visible={visible}
      title="Student Statistics"
      onClose={onClose}
      footer={footer}
    >
      {!statistics.available ? (
        <View
          style={[...sectionCardStyle, styles.unavailableBox]}
          testID="stats-modal-unavailable"
        >
          <AlertCircle size={24} color={colors.textSecondary} />
          <Text style={[styles.unavailableTitle, themed.title]}>
            Statistics unavailable right now
          </Text>
          <Text style={[styles.unavailableBody, themed.subtitle]}>
            Could not read local planner records from storage. Try reopening
            this screen once local data finishes loading.
          </Text>
        </View>
      ) : (
        <View style={styles.sectionsWrap}>
          {/* Tasks & Deadlines */}
          <View style={sectionCardStyle} testID="stats-modal-tasks">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <CheckCircle2 size={16} color={primaryTint} />
                <Text style={[styles.sectionTitle, themed.title]}>
                  Tasks & Deadlines
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isModern
                      ? modernPalette.softViolet
                      : colors.inputBg,
                  },
                ]}
              >
                <Text style={[styles.badgeText, {color: primaryTint}]}>
                  {statistics.totalTasksCount
                    ? `${taskRate} complete`
                    : 'No tasks'}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.progressTrack,
                {
                  backgroundColor: isModern
                    ? modernPalette.surface
                    : colors.inputBg,
                },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: primaryTint,
                    width: taskProgressWidth as `${number}%`,
                  },
                ]}
              />
            </View>

            <View style={styles.metricGrid}>
              <MetricCell
                value={countText(statistics.completedTasksCount)}
                label="Completed"
                tintBg={isModern ? modernPalette.mint : colors.inputBg}
                valueColor={
                  isModern ? modernPalette.mintInk : colors.textPrimary
                }
                labelColor={colors.textSecondary}
                borderColor={isModern ? modernPalette.border : undefined}
              />
              <MetricCell
                value={countText(statistics.pendingTasksCount)}
                label="Open"
                tintBg={mutedTileBg}
                valueColor={colors.textPrimary}
                labelColor={colors.textSecondary}
                borderColor={isModern ? modernPalette.border : undefined}
              />
              <MetricCell
                value={countText(statistics.dueTodayTasksCount)}
                label="Due Today"
                tintBg={isModern ? modernPalette.blueSoft : colors.inputBg}
                valueColor={
                  isModern ? modernPalette.blueInk : colors.textPrimary
                }
                labelColor={colors.textSecondary}
                borderColor={isModern ? modernPalette.border : undefined}
              />
              <MetricCell
                value={countText(statistics.overdueTasksCount)}
                label="Overdue"
                tintBg={
                  (statistics.overdueTasksCount ?? 0) > 0
                    ? isModern
                      ? modernPalette.dangerSoft
                      : colors.bannerBg
                    : mutedTileBg
                }
                valueColor={
                  (statistics.overdueTasksCount ?? 0) > 0
                    ? isModern
                      ? modernPalette.danger
                      : colors.error
                    : colors.textPrimary
                }
                labelColor={colors.textSecondary}
                borderColor={isModern ? modernPalette.border : undefined}
              />
            </View>

            {(statistics.highPriorityPendingCount ?? 0) > 0 && (
              <Text style={[styles.hintLine, themed.subtitle]}>
                {statistics.highPriorityPendingCount}{' '}
                {statistics.highPriorityPendingCount === 1
                  ? 'high-priority task'
                  : 'high-priority tasks'}{' '}
                currently open
              </Text>
            )}
          </View>

          {/* Weekly Schedule & COR Load */}
          <View style={sectionCardStyle} testID="stats-modal-schedule">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <CalendarDays size={16} color={primaryTint} />
                <Text style={[styles.sectionTitle, themed.title]}>
                  This Week’s Load
                </Text>
              </View>
              <Text style={[styles.sectionTotal, {color: primaryTint}]}>
                {formatMinutesVerbose(statistics.weeklyScheduledMinutes ?? 0)}
              </Text>
            </View>

            <DetailRow
              label="Classes"
              value={`${
                statistics.weeklyClassCount ?? 0
              } sessions · ${formatMinutesVerbose(
                statistics.weeklyClassMinutes ?? 0,
              )}`}
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
            />
            <DetailRow
              label="Study & Focus Blocks"
              value={`${
                statistics.weeklyStudyBlockCount ?? 0
              } blocks · ${formatMinutesVerbose(
                statistics.weeklyStudyMinutes ?? 0,
              )}`}
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
            />
            <DetailRow
              label="Events"
              value={`${
                statistics.weeklyEventCount ?? 0
              } events · ${formatMinutesVerbose(
                statistics.weeklyEventMinutes ?? 0,
              )}`}
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
            />
            <DetailRow
              label="Academic COR Load"
              value={
                (statistics.enrolledCoursesCount ?? 0) > 0
                  ? `${statistics.enrolledCoursesCount} courses · ${
                      statistics.totalCreditUnits ?? 0
                    } units`
                  : 'No COR imported'
              }
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
              isLast
            />
          </View>

          {/* Notes & Lectures */}
          <View style={sectionCardStyle} testID="stats-modal-lectures">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <FileText size={16} color={primaryTint} />
                <Text style={[styles.sectionTitle, themed.title]}>
                  Notes & Lectures
                </Text>
              </View>
              <Text style={[styles.sectionTotal, themed.subtitle]}>
                {formatAudioDuration(statistics.totalLectureSeconds ?? 0)}
              </Text>
            </View>

            <DetailRow
              label="Notes Saved"
              value={`${statistics.notesCount ?? 0} total (${
                statistics.pinnedNotesCount ?? 0
              } pinned · ${statistics.voiceNotesCount ?? 0} voice)`}
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
            />
            <DetailRow
              label="Recorded Lectures"
              value={`${statistics.lecturesCount ?? 0} recordings`}
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
            />
            <DetailRow
              label="Transcripts & AI Notes"
              value={`${
                statistics.transcribedLecturesCount ?? 0
              } transcribed · ${statistics.lectureNotesCount ?? 0} AI notes`}
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
              isLast
            />
          </View>

          {/* Alarms & Reminder Punctuality */}
          <View style={sectionCardStyle} testID="stats-modal-alerts">
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <BellRing size={16} color={primaryTint} />
                <Text style={[styles.sectionTitle, themed.title]}>
                  Alarms & Reminders
                </Text>
              </View>
              {statistics.onTimeRate !== null && (
                <Text style={[styles.sectionTotal, {color: primaryTint}]}>
                  {statistics.onTimeRate}% on time
                </Text>
              )}
            </View>

            <DetailRow
              label="Alarms"
              value={`${statistics.enabledAlarmsCount ?? 0} enabled of ${
                statistics.totalAlarmsCount ?? 0
              }`}
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
            />
            <DetailRow
              label="Active Reminders"
              value={`${
                statistics.pendingRemindersCount ?? 0
              } upcoming or active`}
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
            />
            <DetailRow
              label="Follow-Through"
              value={
                (statistics.finishedRemindersCount ?? 0) > 0
                  ? `${statistics.onTimeCount ?? 0} on time · ${
                      statistics.snoozedOutcomesCount ?? 0
                    } snoozed · ${statistics.missedRemindersCount ?? 0} missed`
                  : 'No completed reminder outcomes yet'
              }
              labelColor={colors.textSecondary}
              valueColor={colors.textPrimary}
              dividerColor={dividerColor}
              isLast
            />
          </View>
        </View>
      )}
    </ToolSheet>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  sectionCard: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
  },
});

const styles = StyleSheet.create({
  sectionsWrap: {
    gap: Spacing.md,
  },
  sectionCard: {
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  modernSectionCard: {
    borderRadius: ModernLayout.borderRadiusCard,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 1,
  },
  sectionTitle: {
    fontSize: FontSize.bodyLarge,
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  sectionTotal: {
    fontSize: FontSize.small,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: ModernLayout.borderRadiusPill,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCell: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: ModernLayout.borderRadiusSubCard,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  metricCellValue: {
    fontSize: 18,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    includeFontPadding: false,
  },
  metricCellLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
  hintLine: {
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  detailRowLabel: {
    fontSize: FontSize.small,
    fontFamily: Fonts.body,
  },
  detailRowValue: {
    fontSize: FontSize.small,
    fontFamily: Fonts.body,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  unavailableBox: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  unavailableTitle: {
    fontSize: FontSize.bodyLarge,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  unavailableBody: {
    fontSize: FontSize.body,
    fontFamily: Fonts.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  closeFooterBtn: {
    borderRadius: ModernLayout.borderRadiusPill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  closeFooterBtnText: {
    fontSize: FontSize.bodyLarge,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
});
