/**
 * Call Lafina 2.0 Read-Only Agenda & Calendar Result Card (F-032, P07-03).
 *
 * Displays retrieved schedule items, tasks, and time blocks for a requested date.
 * Explicitly surfaces partial truncation flags without fabricating hidden events.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {CalendarDays, CheckCircle2, Clock, Circle} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../../theme';
import {useTheme} from '../../../contexts/ThemeContext';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import type {ThemeColors} from '../../../contexts/ThemeContext';

export interface AgendaItem {
  id?: string;
  title: string;
  type: 'event' | 'task' | 'block';
  time?: string;
  endTime?: string;
  completed?: boolean;
}

export interface AgendaCardData {
  date: string;
  items: AgendaItem[];
  partial?: boolean;
  totalCount?: number;
}

export interface AgendaCardProps {
  data: AgendaCardData;
  onDismiss: () => void;
  testIDPrefix?: string;
}

export const AgendaCard: React.FC<AgendaCardProps> = ({
  data,
  onDismiss,
  testIDPrefix = 'agenda-card',
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const hasItems = data.items && data.items.length > 0;

  return (
    <View
      style={[styles.card, themed.card, {borderColor: colors.primary}]}
      accessibilityLabel={`Agenda for ${data.date}`}
      testID="agenda-result-card"
    >
      <View style={styles.headerRow}>
        <CalendarDays size={16} color={colors.primary} />
        <Text
          style={[styles.kicker, {color: colors.primary}]}
          accessibilityRole="header"
        >
          Agenda
        </Text>
        <Text style={[styles.dateText, themed.secondaryText]}>
          {data.date}
        </Text>
      </View>

      {!hasItems ? (
        <Text
          style={[styles.emptyText, themed.secondaryText]}
          testID={`${testIDPrefix}-empty`}
        >
          No scheduled events or tasks for this date.
        </Text>
      ) : (
        <View style={styles.itemsList} testID={`${testIDPrefix}-items`}>
          {data.items.map((item, index) => {
            const timeStr = item.time
              ? item.endTime
                ? `${item.time} - ${item.endTime}`
                : item.time
              : 'All day';

            return (
              <View
                key={`agenda-item-${index}`}
                style={styles.itemRow}
                testID={`${testIDPrefix}-item-${index}`}
              >
                {item.type === 'task' ? (
                  item.completed ? (
                    <CheckCircle2 size={14} color={colors.success} />
                  ) : (
                    <Circle size={14} color={colors.textSecondary} />
                  )
                ) : (
                  <Clock size={14} color={colors.primary} />
                )}
                <Text style={[styles.itemTime, themed.secondaryText]}>
                  {timeStr}
                </Text>
                <Text
                  style={[
                    styles.itemTitle,
                    themed.primaryText,
                    item.completed && styles.completedTitle,
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {data.partial ? (
        <Text
          style={[styles.partialNotice, {color: colors.warning}]}
          testID={`${testIDPrefix}-partial-notice`}
        >
          Showing {data.items.length} items (more in your full calendar).
        </Text>
      ) : null}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, themed.secondaryButton]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss agenda card"
          testID={`${testIDPrefix}-dismiss`}
        >
          <Text style={[styles.buttonText, themed.primaryText]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
    },
    primaryText: {
      color: colors.textPrimary,
    },
    secondaryText: {
      color: colors.textSecondary,
    },
    secondaryButton: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
      borderWidth: 1,
    },
  });

const styles = StyleSheet.create({
  card: {
    marginVertical: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1.5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  kicker: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    textTransform: 'uppercase',
  },
  dateText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginLeft: 'auto',
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    marginVertical: Spacing.sm,
    fontStyle: 'italic',
  },
  itemsList: {
    marginVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  itemTime: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    width: 80,
  },
  itemTitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    flex: 1,
  },
  completedTitle: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  partialNotice: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: Spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.sm,
  },
  button: {
    minHeight: 44,
    minWidth: 88,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
});

