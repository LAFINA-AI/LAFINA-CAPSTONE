import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  Radio,
} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import {
  formatCountdownText,
  formatDurationMinutes,
  formatTimeLabel,
} from '../dashboardCalculations';
import type {DashboardScheduleItem, UpNextSummary} from '../types';

interface UpNextWidgetProps {
  summary: UpNextSummary;
  onPressItem: (item: DashboardScheduleItem) => void;
  onOpenCalendar: () => void;
}

export const UpNextWidget: React.FC<UpNextWidgetProps> = ({
  summary,
  onPressItem,
  onOpenCalendar,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  if (summary.mode === 'wrapped_up') {
    const tomorrow = summary.tomorrowPreview;
    return (
      <View
        style={[styles.card, themed.card, Shadows.card]}
        testID="dashboard-widget-up-next"
      >
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.statusPill,
              {backgroundColor: colors.success + '18'},
            ]}
          >
            <CheckCircle2 size={12} color={colors.success} />
            <Text style={[styles.statusPillText, {color: colors.success}]}>
              ALL CAUGHT UP
            </Text>
          </View>
          <TouchableOpacity onPress={onOpenCalendar} activeOpacity={0.7}>
            <Text style={[styles.linkText, {color: colors.primary}]}>
              Open Calendar
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, themed.primaryText]}>
          No more classes or events today
        </Text>

        {tomorrow ? (
          <TouchableOpacity
            style={[styles.followingBox, themed.followingBox]}
            onPress={() => onPressItem(tomorrow)}
            activeOpacity={0.75}
          >
            <View style={styles.followingLeft}>
              <Text style={[styles.followingEyebrow, themed.secondaryText]}>
                TOMORROW AT {formatTimeLabel(tomorrow.startTime)}
              </Text>
              <Text
                style={[styles.followingTitle, themed.primaryText]}
                numberOfLines={1}
              >
                {tomorrow.title}
              </Text>
            </View>
            <ArrowRight size={15} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <Text style={[styles.subtitle, themed.secondaryText]}>
            Your schedule is clear for the rest of today and tomorrow.
          </Text>
        )}
      </View>
    );
  }

  const item = summary.primaryItem!;
  const isLive = summary.mode === 'live';
  const badgeColor = isLive ? colors.red : colors.blue;
  const badgeLabel = isLive ? 'LIVE NOW' : 'UP NEXT';
  const timingCopy = isLive
    ? `${formatDurationMinutes(summary.minutesRemaining ?? 0)} left`
    : `Starts ${formatCountdownText(summary.minutesUntilStart ?? 0)}`;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        themed.card,
        Shadows.card,
        {borderLeftWidth: 4, borderLeftColor: item.color || badgeColor},
      ]}
      onPress={() => onPressItem(item)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${badgeLabel}: ${item.title}`}
      testID="dashboard-widget-up-next"
    >
      <View style={styles.badgeRow}>
        <View style={[styles.statusPill, {backgroundColor: badgeColor + '1A'}]}>
          {isLive ? (
            <Radio size={12} color={badgeColor} />
          ) : (
            <Clock size={12} color={badgeColor} />
          )}
          <Text style={[styles.statusPillText, {color: badgeColor}]}>
            {badgeLabel}
          </Text>
        </View>

        <Text style={[styles.timingCopy, {color: badgeColor}]}>
          {timingCopy}
        </Text>
      </View>

      <Text style={[styles.title, themed.primaryText]} numberOfLines={2}>
        {item.title}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Clock size={13} color={colors.textSecondary} />
          <Text style={[styles.metaText, themed.secondaryText]}>
            {formatTimeLabel(item.startTime)} – {formatTimeLabel(item.endTime)}
          </Text>
        </View>

        {item.subtitle && (
          <View style={styles.metaItem}>
            <MapPin size={13} color={colors.textSecondary} />
            <Text
              style={[styles.metaText, themed.secondaryText]}
              numberOfLines={1}
            >
              {item.subtitle}
            </Text>
          </View>
        )}
      </View>

      {isLive && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressTrack, themed.progressTrack]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${summary.progressPercent}%`,
                  backgroundColor: item.color || badgeColor,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressPct, themed.secondaryText]}>
            {summary.progressPercent}%
          </Text>
        </View>
      )}

      {summary.followingItem && (
        <View style={[styles.followingBox, themed.followingBox]}>
          <View style={styles.followingLeft}>
            <Text style={[styles.followingEyebrow, themed.secondaryText]}>
              AFTER THIS · {formatTimeLabel(summary.followingItem.startTime)}
            </Text>
            <Text
              style={[styles.followingTitle, themed.primaryText]}
              numberOfLines={1}
            >
              {summary.followingItem.title}
            </Text>
          </View>
          <ArrowRight size={14} color={colors.textSecondary} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  progressTrack: {backgroundColor: colors.divider},
  followingBox: {
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Layout.borderRadiusPill,
  },
  statusPillText: {
    fontFamily: Fonts.heading,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  timingCopy: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  linkText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  metaText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressPct: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'right',
  },
  followingBox: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  followingLeft: {
    flex: 1,
  },
  followingEyebrow: {
    fontFamily: Fonts.heading,
    fontSize: 10,
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  followingTitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
});
