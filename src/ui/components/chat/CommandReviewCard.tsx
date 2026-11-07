import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {CircleAlert, ClipboardCheck} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
import type {CommandProposal} from '../../../ai/nlu/commandReview';

export interface CommandReviewCardProps {
  proposal: CommandProposal;
  expired: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  /** Prefix for test IDs, for example "chat-review" or "voice-review". */
  testIDPrefix: string;
}

/**
 * The exact change the assistant prepared (AGY-PORT 04). Nothing is saved until
 * Confirm; Cancel saves nothing. Defaults the assistant filled in are listed
 * under "Assumed" so none of them is silent.
 */
export const CommandReviewCard: React.FC<CommandReviewCardProps> = ({
  proposal,
  expired,
  busy,
  onConfirm,
  onCancel,
  onDismiss,
  testIDPrefix,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const accent = proposal.destructive ? colors.error : colors.primary;
  const action = `${proposal.heading} “${proposal.title}”`;

  return (
    <View
      style={[styles.card, themed.card, {borderColor: accent}]}
      accessibilityLabel={`Review before saving: ${action}`}
      testID={`${testIDPrefix}-card`}
    >
      <View style={styles.headerRow}>
        <ClipboardCheck size={16} color={accent} />
        <Text
          style={[styles.kicker, {color: accent}]}
          accessibilityRole="header"
        >
          Review before saving
        </Text>
      </View>
      <Text
        style={[styles.action, themed.primaryText]}
        testID={`${testIDPrefix}-action`}
      >
        {action}
      </Text>
      {proposal.details.map((line, index) => (
        <Text key={`d-${index}`} style={[styles.line, themed.secondaryText]}>
          {line}
        </Text>
      ))}
      {proposal.assumptions.length > 0 ? (
        <View
          style={[styles.assumptions, themed.assumptions]}
          testID={`${testIDPrefix}-assumptions`}
        >
          <Text style={[styles.sectionLabel, themed.secondaryText]}>
            Assumed
          </Text>
          {proposal.assumptions.map((line, index) => (
            <Text key={`a-${index}`} style={[styles.line, themed.primaryText]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {proposal.warnings.map((line, index) => (
        <View
          key={`w-${index}`}
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
        <>
          <Text
            style={[styles.footnote, {color: colors.error}]}
            accessibilityLiveRegion="polite"
            testID={`${testIDPrefix}-expired`}
          >
            This review expired, so nothing was saved. Ask again to start over.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, themed.secondaryButton]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss expired review"
              testID={`${testIDPrefix}-dismiss`}
            >
              <Text style={[styles.buttonText, themed.primaryText]}>
                Dismiss
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.footnote, themed.secondaryText]}>
            Nothing is saved until you confirm. This review expires in 5
            minutes.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, themed.secondaryButton]}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Cancel: ${action}`}
              accessibilityState={{disabled: busy}}
              testID={`${testIDPrefix}-cancel`}
            >
              <Text style={[styles.buttonText, themed.primaryText]}>
                Cancel
              </Text>
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
              accessibilityLabel={`Confirm: ${action}`}
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
        </>
      )}
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {backgroundColor: colors.cardBg},
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  assumptions: {backgroundColor: colors.inputBg},
  secondaryButton: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
});

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Layout.borderRadiusCard,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  kicker: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  action: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    fontWeight: '700',
    marginBottom: Spacing.xxs,
  },
  line: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
  },
  assumptions: {
    borderRadius: Layout.borderRadiusButton,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
    gap: Spacing.xxs,
  },
  sectionLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  warningText: {
    flex: 1,
  },
  footnote: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: Spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  button: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: Spacing.lg,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBusy: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
});
