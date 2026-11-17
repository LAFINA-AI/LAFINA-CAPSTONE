import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AlarmClock, CalendarPlus, StickyNote} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing} from '../theme';
import {QUICK_CHAT_STARTERS} from './quickChatStarters';
import type {QuickChatStarter} from './quickChatStarters';

const ICONS = {
  schedule: CalendarPlus,
  reminder: AlarmClock,
  note: StickyNote,
} as const;

interface QuickActionChipsProps {
  /** Puts the starter into the composer. Chips never send anything. */
  onPick: (starter: QuickChatStarter) => void;
}

/** Floating LAFINA (UX `03` §5): shown while the transcript is empty and no card is open. */
export const QuickActionChips: React.FC<QuickActionChipsProps> = ({onPick}) => {
  const {colors} = useTheme();
  return (
    <View style={styles.row} testID="quick-chips">
      {QUICK_CHAT_STARTERS.map(item => {
        const Icon = ICONS[item.id];
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onPick(item)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityHint="Starts your message"
            testID={`quick-chip-${item.id}`}
            hitSlop={{top: 4, bottom: 4}}
            style={[styles.chip, {borderColor: colors.border}]}
          >
            <Icon size={16} color={colors.textSecondary} />
            <Text style={[styles.label, {color: colors.textPrimary}]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  chip: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Layout.borderRadiusPill,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  label: {
    marginLeft: Spacing.xs,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
});
