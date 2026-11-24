import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  AlarmClock,
  BookOpen,
  Plus,
  Sparkles,
  Timer,
} from 'lucide-react-native';
import {useTheme} from '../../../../contexts/ThemeContext';
import {Fonts} from '../../../../theme';

export interface QuickActionsRowProps {
  ustpEnabled: boolean;
  pomodoroActiveMinutes: number | null;
  onAddTask: () => void;
  onSetAlarm: () => void;
  onOpenFocus: () => void;
  onAskPrimary: () => void;
}

interface ActionTile {
  id: string;
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
    ustpEnabled,
    pomodoroActiveMinutes,
    onAddTask,
    onSetAlarm,
    onOpenFocus,
    onAskPrimary,
  }) => {
    const {modernPalette, modernShadows} = useTheme();
    const isFocusing = pomodoroActiveMinutes !== null;

    const tiles: ActionTile[] = [
      {
        id: 'add-task',
        testID: 'home-quick-add-task',
        label: 'Add task',
        accessibilityLabel: 'Add task',
        renderIcon: color => <Plus color={color} size={22} strokeWidth={2.2} />,
        onPress: onAddTask,
      },
      {
        id: 'set-alarm',
        testID: 'home-quick-set-alarm',
        label: 'Set alarm',
        accessibilityLabel: 'Set alarm',
        renderIcon: color => (
          <AlarmClock color={color} size={22} strokeWidth={2} />
        ),
        onPress: onSetAlarm,
      },
      {
        id: 'focus',
        testID: 'home-quick-focus',
        label: isFocusing ? `${pomodoroActiveMinutes}m left` : 'Focus',
        accessibilityLabel: isFocusing
          ? `Focus session running, ${pomodoroActiveMinutes} minutes left`
          : 'Open Focus timer',
        active: isFocusing,
        renderIcon: color => <Timer color={color} size={22} strokeWidth={2} />,
        onPress: onOpenFocus,
      },
      {
        id: 'ask',
        testID: ustpEnabled ? 'home-quick-ask-ustp' : 'home-quick-ask-ai',
        label: ustpEnabled ? 'Ask USTP' : 'Ask AI',
        accessibilityLabel: ustpEnabled
          ? 'Ask USTP student handbook'
          : 'Ask LAFINA AI',
        renderIcon: color =>
          ustpEnabled ? (
            <BookOpen color={color} size={21} strokeWidth={2} />
          ) : (
            <Sparkles color={color} size={21} strokeWidth={2} />
          ),
        onPress: onAskPrimary,
      },
    ];

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
});
