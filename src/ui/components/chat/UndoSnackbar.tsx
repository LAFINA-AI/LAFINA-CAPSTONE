import React, {useEffect, useRef} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Undo2} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {UndoOffer} from '../../../ai/nlu/commandReview';

/** How long the snackbar stays on screen. The undo itself lasts longer. */
export const UNDO_SNACKBAR_MS = 8_000;

export interface UndoSnackbarProps {
  offer: UndoOffer;
  onUndo: (token: string) => void;
  onHide: () => void;
  testID?: string;
}

/**
 * "Marked “Lab report” done · Undo" after an immediate action (audit
 * finding 10). Hides itself after a few seconds; nothing is reversed unless
 * Undo is tapped.
 */
export const UndoSnackbar: React.FC<UndoSnackbarProps> = ({
  offer,
  onUndo,
  onHide,
  testID = 'undo-snackbar',
}) => {
  const {colors} = useTheme();
  const pressedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const remaining = Math.min(
      UNDO_SNACKBAR_MS,
      Math.max(0, offer.expiresAt - Date.now()),
    );
    const timer = setTimeout(onHide, remaining);
    return () => clearTimeout(timer);
  }, [offer, onHide]);

  const handlePressUndo = () => {
    if (pressedTokenRef.current === offer.token) return;
    pressedTokenRef.current = offer.token;
    onUndo(offer.token);
  };

  return (
    <View
      style={[
        styles.bar,
        {backgroundColor: colors.cardBg, borderColor: colors.border},
      ]}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Text
        style={[styles.label, {color: colors.textPrimary}]}
        numberOfLines={2}
      >
        {offer.label}
      </Text>
      <TouchableOpacity
        style={styles.action}
        onPress={handlePressUndo}
        accessibilityRole="button"
        accessibilityLabel={`Undo: ${offer.label}`}
        testID={`${testID}-undo`}
      >
        <Undo2 size={16} color={colors.primary} />
        <Text style={[styles.actionText, {color: colors.primary}]}>Undo</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusCard,
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    marginVertical: Spacing.xs,
  },
  label: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 40,
    paddingHorizontal: Spacing.sm,
  },
  actionText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
});
