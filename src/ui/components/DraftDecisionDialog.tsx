import React from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Fonts} from '../theme';
import {useTheme} from '../contexts/ThemeContext';
import type {ThemeColors} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';

/** One pending draft decision: discard an unsent draft, or replace it with new text. */
export interface DraftDialogRequest {
  title: string;
  message: string;
  /** The safe choice. Also what Android back and tapping outside do. */
  keepLabel: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive (discard). */
  destructive?: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}

export interface DraftDecisionDialogProps {
  request: DraftDialogRequest | null;
  testIDPrefix: string;
}

/**
 * Themed confirmation for unsent drafts (AGY-PORT 05). The default action always
 * keeps the student's text; nothing is discarded or replaced without a tap on the
 * confirm button.
 */
export const DraftDecisionDialog: React.FC<DraftDecisionDialogProps> = ({
  request,
  testIDPrefix,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  if (!request) return null;
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={request.onKeep}
    >
      <TouchableOpacity
        style={[styles.overlay, themed.overlay]}
        activeOpacity={1}
        onPress={request.onKeep}
        testID={`${testIDPrefix}-dialog-backdrop`}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.card, themed.card]}
          testID={`${testIDPrefix}-dialog`}
          accessibilityViewIsModal
        >
          <Text style={[styles.title, themed.title]} accessibilityRole="header">
            {request.title}
          </Text>
          <Text style={[styles.message, themed.message]}>
            {request.message}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, themed.keepButton]}
              onPress={request.onKeep}
              accessibilityRole="button"
              accessibilityLabel={request.keepLabel}
              testID={`${testIDPrefix}-dialog-keep`}
            >
              <Text style={[styles.buttonText, themed.keepText]}>
                {request.keepLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                {
                  backgroundColor: request.destructive
                    ? colors.error
                    : colors.primary,
                },
              ]}
              onPress={request.onConfirm}
              accessibilityRole="button"
              accessibilityLabel={request.confirmLabel}
              testID={`${testIDPrefix}-dialog-confirm`}
            >
              <Text style={[styles.buttonText, {color: colors.textOnPrimary}]}>
                {request.confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  overlay: {backgroundColor: colors.overlay},
  card: {backgroundColor: colors.cardBg, borderColor: colors.border},
  title: {color: colors.textPrimary},
  message: {color: colors.textSecondary},
  keepButton: {backgroundColor: colors.inputBg},
  keepText: {color: colors.textPrimary},
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  message: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
});
