import React, {useEffect} from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {CheckCircle2} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing} from '../theme';

interface QuickChatSuccessCardProps {
  /** The confirmation text returned by the existing confirm call. */
  message: string;
  onViewInLafina: () => void;
  onDone: () => void;
}

/**
 * Floating LAFINA (UX `03` §8): shown after Confirm saved the change. The
 * panel never closes by itself; the student chooses Done or View in LAFINA.
 */
export const QuickChatSuccessCard: React.FC<QuickChatSuccessCardProps> = ({
  message,
  onViewInLafina,
  onDone,
}) => {
  const {colors} = useTheme();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View
      style={[
        styles.card,
        {borderColor: colors.border, backgroundColor: colors.cardBg},
      ]}
      testID="quick-success-card"
    >
      <View style={styles.titleRow}>
        <CheckCircle2 size={20} color={colors.success} />
        <Text
          style={[styles.message, {color: colors.success}]}
          testID="quick-success-message"
        >
          {message}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onViewInLafina}
          accessibilityRole="button"
          testID="quick-success-view"
          style={styles.secondary}
        >
          <Text style={[styles.secondaryLabel, {color: colors.primary}]}>
            View in LAFINA
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDone}
          accessibilityRole="button"
          testID="quick-success-done"
          style={[styles.primary, {backgroundColor: colors.primary}]}
        >
          <Text style={[styles.primaryLabel, {color: colors.textOnPrimary}]}>
            Done
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusCard,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  titleRow: {flexDirection: 'row', alignItems: 'flex-start'},
  message: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  secondary: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  secondaryLabel: {fontFamily: Fonts.heading, fontSize: FontSize.body},
  primary: {
    minHeight: 48,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    marginLeft: Spacing.sm,
  },
  primaryLabel: {fontFamily: Fonts.heading, fontSize: FontSize.body},
});
