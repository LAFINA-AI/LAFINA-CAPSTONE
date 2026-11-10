/**
 * Call Lafina 2.0 Action Card Host & Registry Renderer (P06-06, P06-07, F-027, F-028, F-029).
 *
 * Renders contextual action cards during live voice calls without interrupting
 * the voice connection. Provides safe fallbacks for unsupported card types.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {CircleAlert} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
import type {CommandProposal} from '../../../ai/nlu/commandReview';
import {CommandReviewCard} from '../chat/CommandReviewCard';
import type {ActionCardStatus} from '../../../ai/voiceActions/types';

export interface ActionCardHostProps {
  proposal: CommandProposal | null;
  expired?: boolean;
  busy?: boolean;
  status?: ActionCardStatus;
  unknownKind?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  testIDPrefix?: string;
}

export const ActionCardHost: React.FC<ActionCardHostProps> = ({
  proposal,
  expired = false,
  busy = false,
  status = 'prepare',
  unknownKind = null,
  onConfirm = () => {},
  onCancel = () => {},
  onDismiss = () => {},
  testIDPrefix = 'action-card',
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  if (unknownKind) {
    return (
      <View
        style={[styles.card, themed.card, {borderColor: colors.warning}]}
        accessibilityLabel="Unsupported action card"
        testID={`${testIDPrefix}-unknown-card`}
      >
        <View style={styles.headerRow}>
          <CircleAlert size={16} color={colors.warning} />
          <Text
            style={[styles.kicker, {color: colors.warning}]}
            accessibilityRole="header"
          >
            Unsupported Card Action
          </Text>
        </View>
        <Text style={[styles.bodyText, themed.primaryText]}>
          This action kind ({unknownKind}) is not supported by this version of Call Lafina.
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, themed.secondaryButton]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss unsupported action card"
            testID={`${testIDPrefix}-unknown-dismiss`}
          >
            <Text style={[styles.buttonText, themed.primaryText]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!proposal) {
    return null;
  }

  return (
    <View
      style={styles.hostContainer}
      testID="action-card-host"
      accessibilityLabel={`Action card: ${proposal.heading}`}
    >
      <CommandReviewCard
        proposal={proposal}
        expired={expired || status === 'expired'}
        busy={busy || status === 'confirm'}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onDismiss={onDismiss}
        testIDPrefix={testIDPrefix}
      />
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
  hostContainer: {
    width: '100%',
    marginVertical: Spacing.xs,
  },
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
  },
  bodyText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
    marginVertical: Spacing.xs,
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
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
});
