import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  AlarmClock,
  BookOpen,
  CalendarDays,
  FileText,
  Plus,
  Sparkles,
  Timer,
} from 'lucide-react-native';
import {
  DEFAULT_HOME_QUICK_ACTIONS,
  type HomeQuickActionId,
} from '../../../../../storage';
import {useTheme} from '../../../../contexts/ThemeContext';
import {Fonts} from '../../../../theme';

export interface QuickActionsRowProps {
  actions?: readonly HomeQuickActionId[];
  compact?: boolean;
  ustpEnabled: boolean;
  pomodoroActiveMinutes: number | null;
  onAddTask: () => void;
  onSetAlarm: () => void;
  onOpenFocus: () => void;
  onAskPrimary: () => void;
  onOpenNotes?: () => void;
  onOpenSchedule?: () => void;
}

interface ActionTile {
  id: HomeQuickActionId;
  testID: string;
  label: string;
  accessibilityLabel: string;
  active?: boolean;
  badge?: string;
  renderIcon: (color: string) => React.ReactNode;
  onPress: () => void;
}

export const QuickActionsRow: React.FC<QuickActionsRowProps> = React.memo(
  ({
    actions = DEFAULT_HOME_QUICK_ACTIONS,
    compact = false,
    ustpEnabled,
    pomodoroActiveMinutes,
    onAddTask,
    onSetAlarm,
    onOpenFocus,
    onAskPrimary,
    onOpenNotes,
    onOpenSchedule,
  }) => {
    const {modernPalette, modernShadows} = useTheme();
    const isFocusing = pomodoroActiveMinutes !== null;
    const iconSize = compact ? 19 : 22;

    const tileMap: Record<HomeQuickActionId, ActionTile> = {
      add_task: {
        id: 'add_task',
        testID: 'home-quick-add-task',
        label: 'Add task',
        accessibilityLabel: 'Add task',
        renderIcon: color => (
          <Plus color={color} size={iconSize} strokeWidth={2.2} />
        ),
        onPress: onAddTask,
      },
      set_alarm: {
        id: 'set_alarm',
        testID: 'home-quick-set-alarm',
        label: 'Set alarm',
        accessibilityLabel: 'Set alarm',
        renderIcon: color => (
          <AlarmClock color={color} size={iconSize} strokeWidth={2} />
        ),
        onPress: onSetAlarm,
      },
      focus: {
        id: 'focus',
        testID: 'home-quick-focus',
        label: isFocusing ? `${pomodoroActiveMinutes}m left` : 'Focus',
        accessibilityLabel: isFocusing
          ? `Focus session running, ${pomodoroActiveMinutes} minutes left`
          : 'Open Focus timer',
        active: isFocusing,
        renderIcon: color => (
          <Timer color={color} size={iconSize} strokeWidth={2} />
        ),
        onPress: onOpenFocus,
      },
      ask_ai: {
        id: 'ask_ai',
        testID: ustpEnabled ? 'home-quick-ask-ustp' : 'home-quick-ask-ai',
        label: ustpEnabled ? 'Ask USTP' : 'Ask AI',
        accessibilityLabel: ustpEnabled
          ? 'Ask USTP student handbook'
          : 'Ask LAFINA AI',
        renderIcon: color =>
          ustpEnabled ? (
            <BookOpen color={color} size={iconSize - 1} strokeWidth={2} />
          ) : (
            <Sparkles color={color} size={iconSize - 1} strokeWidth={2} />
          ),
        onPress: onAskPrimary,
      },
      notes: {
        id: 'notes',
        testID: 'home-quick-notes',
        label: 'Notes',
        accessibilityLabel: 'Open Notes',
        renderIcon: color => (
          <FileText color={color} size={iconSize - 1} strokeWidth={2} />
        ),
        onPress: () => onOpenNotes?.(),
      },
      schedule: {
        id: 'schedule',
        testID: 'home-quick-schedule',
        label: 'Schedule',
        accessibilityLabel: 'Open Schedule',
        renderIcon: color => (
          <CalendarDays color={color} size={iconSize - 1} strokeWidth={2} />
        ),
        onPress: () => onOpenSchedule?.(),
      },
    };

    const tiles = actions
      .map(id => tileMap[id])
      .filter((tile): tile is ActionTile => Boolean(tile));

    return (
      <View style={styles.row} testID="home-quick-actions">
        {tiles.map(tile => (
          <TouchableOpacity
            key={tile.id}
            testID={tile.testID}
            onPress={tile.onPress}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={tile.accessibilityLabel}
            style={styles.tileWrap}
          >
            <View
              style={[
                styles.iconBox,
                compact && styles.iconBoxCompact,
                modernShadows.subtle,
                {
                  backgroundColor: tile.active
                    ? modernPalette.softViolet
                    : modernPalette.card,
                  borderColor: tile.active
                    ? modernPalette.accent
                    : modernPalette.border,
                },
              ]}
            >
              {tile.renderIcon(modernPalette.accent)}
              {tile.active && (
                <View
                  style={[
                    styles.activeDot,
                    {backgroundColor: modernPalette.mintInk},
                  ]}
                />
              )}
            </View>
            <Text
              style={[
                styles.label,
                compact && styles.labelCompact,
                {
                  color: tile.active
                    ? modernPalette.accent
                    : modernPalette.text,
                },
              ]}
              numberOfLines={1}
            >
              {tile.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  tileWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxCompact: {
    width: 50,
    height: 50,
    borderRadius: 16,
  },
  activeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  label: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  labelCompact: {
    fontSize: 11.5,
  },
});
