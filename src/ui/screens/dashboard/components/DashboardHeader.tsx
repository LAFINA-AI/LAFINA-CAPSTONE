import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  Clock,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import {
  formatDurationMinutes,
  getTimeOfDayGreeting,
} from '../dashboardCalculations';

interface DashboardHeaderProps {
  now: Date;
  greetingName: string;
  academicBadge: string | null;
  todayItemsCount: number;
  usableFreeMinutes: number;
  pendingTasksCount: number;
  onOpenCustomize: () => void;
  onAskLafina: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  now,
  greetingName,
  academicBadge,
  todayItemsCount,
  usableFreeMinutes,
  pendingTasksCount,
  onOpenCustomize,
  onAskLafina,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const greeting = getTimeOfDayGreeting(now);

  return (
    <View style={styles.wrapper}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.dateText, themed.secondaryText]}>
            {dateLabel.toUpperCase()}
          </Text>
          <Text
            style={[styles.greetingText, themed.primaryText]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {greeting}, {greetingName}
          </Text>
          {academicBadge && (
            <View style={[styles.academicBadge, themed.academicBadge]}>
              <Text
                style={[styles.academicBadgeText, {color: colors.primary}]}
                numberOfLines={1}
              >
                {academicBadge}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.iconPillBtn, themed.pillBtn, Shadows.card]}
            onPress={onAskLafina}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Ask Lafina"
            testID="dashboard-ask-lafina-btn"
          >
            <Sparkles size={15} color={colors.blue} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.customizeBtn, themed.pillBtn, Shadows.card]}
            onPress={onOpenCustomize}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Customize dashboard"
            testID="dashboard-customize-btn"
          >
            <SlidersHorizontal size={15} color={colors.textPrimary} />
            <Text style={[styles.customizeBtnText, themed.primaryText]}>
              Customize
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.summaryStrip}>
        <View style={[styles.summaryChip, themed.summaryChip]}>
          <CalendarDays size={13} color={colors.blue} />
          <Text style={[styles.summaryChipText, themed.primaryText]}>
            {todayItemsCount} {todayItemsCount === 1 ? 'session' : 'sessions'}
          </Text>
        </View>

        <View style={[styles.summaryChip, themed.summaryChip]}>
          <Clock size={13} color={colors.success} />
          <Text style={[styles.summaryChipText, themed.primaryText]}>
            {formatDurationMinutes(usableFreeMinutes)} free
          </Text>
        </View>

        <View style={[styles.summaryChip, themed.summaryChip]}>
          <CheckCircle2
            size={13}
            color={pendingTasksCount > 0 ? colors.warning : colors.textMuted}
          />
          <Text style={[styles.summaryChipText, themed.primaryText]}>
            {pendingTasksCount}{' '}
            {pendingTasksCount === 1 ? 'task due' : 'tasks due'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  pillBtn: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  summaryChip: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  academicBadge: {
    backgroundColor: colors.primary + '14',
    borderColor: colors.primary + '30',
  },
});

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  titleBlock: {
    flex: 1,
  },
  dateText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  greetingText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.title,
    fontWeight: '700',
  },
  academicBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
  },
  academicBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  iconPillBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
  },
  customizeBtnText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  summaryStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.md,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Layout.borderRadiusPill,
    borderWidth: 1,
  },
  summaryChipText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
});
