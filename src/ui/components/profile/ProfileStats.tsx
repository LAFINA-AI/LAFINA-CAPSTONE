import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Fonts, Layout, ModernLayout, ModernShadows, Shadows, useThemedStyles } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import type { ProfileStatistics } from '../../../storage/profileStatisticsStore';

interface ProfileStatsProps {
  statistics: ProfileStatistics;
}

const UNAVAILABLE = '—';

/**
 * AGY-PORT 09: counts from actual records (profileStatisticsStore). "On time"
 * is reminders acknowledged without a snooze out of reminders that were
 * acknowledged or missed; before any outcome it says "No data".
 */
export const ProfileStats: React.FC<ProfileStatsProps> = ({ statistics }) => {
  const { isModern, modernPalette } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const number = (value: number | null): string =>
    statistics.available && value !== null ? String(value) : UNAVAILABLE;

  let onTime = UNAVAILABLE;
  let onTimeLabel = 'On-time reminders unavailable';
  if (statistics.available && statistics.finishedRemindersCount !== null) {
    if (statistics.onTimeRate === null) {
      onTime = 'No data';
      onTimeLabel = 'On-time reminders: no acknowledged or missed reminders yet';
    } else {
      onTime = `${statistics.onTimeRate}%`;
      onTimeLabel =
        `On-time reminders: ${statistics.onTimeCount} of ${statistics.finishedRemindersCount} ` +
        'acknowledged without snoozing';
    }
  }

  const card = (
    value: string,
    label: string,
    accessibilityLabel: string,
    testID: string,
    modernTint: string,
  ) => (
    <View
      style={[
        styles.statCard,
        isModern
          ? [
              ModernShadows.subtle,
              styles.modernStatCard,
              {
                backgroundColor: modernTint,
                borderColor: modernPalette.border,
              },
            ]
          : [Shadows.card, themed.statCard],
      ]}
      accessible
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Text style={[styles.statVal, isModern && styles.modernStatVal, themed.statVal]}>{value}</Text>
      <Text style={[styles.statLabel, themed.statLabel]}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.statsRow}>
      {card(
        number(statistics.completedTasksCount),
        'Tasks Done',
        `Tasks done: ${number(statistics.completedTasksCount)}`,
        'stat-tasks-done',
        modernPalette.softViolet,
      )}
      {card(
        number(statistics.notesCount),
        'Notes Saved',
        `Notes saved: ${number(statistics.notesCount)}`,
        'stat-notes-saved',
        modernPalette.mint,
      )}
      {card(onTime, 'On Time', onTimeLabel, 'stat-on-time', modernPalette.blueSoft)}
    </View>
  );
};

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: Layout.borderRadiusCard,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modernStatCard: {
    borderRadius: ModernLayout.borderRadiusCard,
    borderWidth: 1,
    paddingVertical: 14,
  },
  statVal: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modernStatVal: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Fonts.heading,
  },
  statLabel: {
    fontSize: 10,
    marginTop: 4,
    fontFamily: Fonts.body,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  statCard: {
    backgroundColor: colors.cardBg,
  },
  statVal: {
    color: colors.textPrimary,
  },
  statLabel: {
    color: colors.textSecondary,
  },
});
