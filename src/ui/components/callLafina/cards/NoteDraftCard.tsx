/**
 * Call Lafina 2.0 Speech-to-Note Draft Review Card (F-034, P08-04).
 *
 * Dedicated structured card for reviewing dictated notes during live voice calls.
 * Displays title, body excerpt, category, and assumptions.
 * Preserves transaction boundaries: nothing is saved until explicit Confirm.
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {FileText, CircleAlert} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../../theme';
import {useTheme} from '../../../contexts/ThemeContext';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import type {CommandProposal} from '../../../../ai/nlu/commandReview';

export interface NoteDraftCardProps {
  proposal: CommandProposal;
  expired?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  testIDPrefix?: string;
}

export const NoteDraftCard: React.FC<NoteDraftCardProps> = ({
  proposal,
  expired = false,
  busy = false,
  onConfirm,
  onCancel,
  onDismiss,
  testIDPrefix = 'note-draft',
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const accent = colors.primary;
  const actionText = `${proposal.heading} “${proposal.title}”`;

  return (
    <View
      style={[styles.card, themed.card, {borderColor: accent}]}
      accessibilityLabel={`Review note before saving: ${actionText}`}
      testID={`${testIDPrefix}-card`}
    >
      <View testID="note-draft-card" pointerEvents="none" />
      <View style={styles.headerRow}>
        <FileText size={16} color={accent} />
        <Text
          style={[styles.kicker, {color: accent}]}
          accessibilityRole="header"
        >
          Note Review
        </Text>
      </View>

      <Text
        style={[styles.action, themed.primaryText]}
        testID={`${testIDPrefix}-action`}
      >
        {actionText}
      </Text>

      {proposal.details.map((line, index) => (
        <Text
          key={`detail-${index}`}
          style={[styles.line, themed.secondaryText]}
          testID={`${testIDPrefix}-detail-${index}`}
        >
          {line}
        </Text>
      ))}

      {proposal.assumptions.length > 0 ? (
        <View
          style={[styles.assumptionsBox, themed.assumptionsBox]}
          testID={`${testIDPrefix}-assumptions`}
        >
          <Text style={[styles.sectionLabel, themed.secondaryText]}>
            Assumed
          </Text>
          {proposal.assumptions.map((line, index) => (
            <Text
              key={`assump-${index}`}
              style={[styles.line, themed.primaryText]}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {proposal.warnings.map((line, index) => (
        <View
          key={`warn-${index}`}
          style={styles.warningRow}
          testID={`${testIDPrefix}-warning`}
        >
          <CircleAlert size={14} color={colors.warning} />
          <Text style={[styles.line, styles.warningText, themed.primaryText]}>
            {line}
          </Text>
        </View>
      ))}

      {expired ? (
        <View style={styles.expiredContainer}>
          <Text
            style={[styles.footnote, {color: colors.error}]}
            testID={`${testIDPrefix}-expired`}
          >
            This proposal expired. Nothing was saved to your notes.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, themed.secondaryButton]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss expired review"
              testID={`${testIDPrefix}-dismiss`}
            >
              <Text style={[styles.buttonText, themed.primaryText]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.footerContainer}>
          <Text style={[styles.footnote, themed.secondaryText]}>
            Nothing is saved until you confirm.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, themed.secondaryButton]}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Cancel: ${actionText}`}
              accessibilityState={{disabled: busy}}
              testID={`${testIDPrefix}-cancel`}
            >
              <Text style={[styles.buttonText, themed.primaryText]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                {backgroundColor: accent},
                busy && styles.buttonBusy,
              ]}
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Confirm: ${actionText}`}
              accessibilityState={{disabled: busy, busy}}
              testID={`${testIDPrefix}-confirm`}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <Text
                  style={[styles.buttonText, {color: colors.textOnPrimary}]}
                >
                  Confirm
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
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
    assumptionsBox: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
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
  action: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    marginBottom: Spacing.xs,
  },
  line: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
    marginVertical: 2,
  },
  assumptionsBox: {
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  sectionLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    marginBottom: 2,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  warningText: {
    flex: 1,
  },
  expiredContainer: {
    marginTop: Spacing.sm,
  },
  footerContainer: {
    marginTop: Spacing.sm,
  },
  footnote: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: Spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
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
  buttonBusy: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
});

