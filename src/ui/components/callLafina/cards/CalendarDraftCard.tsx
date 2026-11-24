/**
 * Call Lafina 2.0 Calendar Event & Time Block Review Card (F-031, F-033, P07-02, P07-04).
 *
 * Dedicated structured card for prospective events and study time blocks.
 * Displays date, start/end times, device timezone, collision warnings, and
 * grounded free-slot alternatives.
 */

import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Calendar, CircleAlert, Clock} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../../theme';
import {useTheme} from '../../../contexts/ThemeContext';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import type {CommandProposal} from '../../../../ai/nlu/commandReview';
import {ConfirmSaveButton} from './ConfirmSaveButton';
import {CardDetailLine} from './CardDetailLine';

export interface CalendarDraftCardProps {
  proposal: CommandProposal;
  expired?: boolean;
  busy?: boolean;
  /** The card was just saved: it shows "Saved" while it leaves. */
  saved?: boolean;
  alternatives?: string[];
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  /** Moves the draft to a suggested free slot (still saved only on Confirm). */
  onPickAlternative?: (start: string, end: string) => void;
  testIDPrefix?: string;
}

const SLOT_RE = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/;
const padTime = (t: string): string => (t.length === 4 ? `0${t}` : t);

export const CalendarDraftCard: React.FC<CalendarDraftCardProps> = ({
  proposal,
  expired = false,
  busy = false,
  saved = false,
  alternatives = [],
  onConfirm,
  onCancel,
  onDismiss,
  onPickAlternative,
  testIDPrefix = 'calendar-draft',
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const isBlock =
    !/event/i.test(proposal.heading) &&
    (proposal.intent === 'create_time_block' ||
      proposal.intent === 'update_time_block');
  const Icon = isBlock ? Clock : Calendar;
  const accent = proposal.destructive ? colors.error : colors.primary;
  const actionText = `${proposal.heading} “${proposal.title}”`;

  let localTz = 'Local Time';
  try {
    localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
  } catch {
    localTz = 'Local Time';
  }

  return (
    <View
      style={[styles.card, themed.card, {borderColor: accent}]}
      accessibilityLabel={`Review calendar change: ${actionText}`}
      testID={`${testIDPrefix}-card`}
    >
      <View testID="calendar-draft-card" pointerEvents="none" />
      <View style={styles.headerRow}>
        <Icon size={16} color={accent} />
        <Text
          style={[styles.kicker, {color: accent}]}
          accessibilityRole="header"
        >
          {isBlock ? 'Time Block Review' : 'Calendar Event Review'}
        </Text>
      </View>

      <Text
        style={[styles.action, themed.primaryText]}
        testID={`${testIDPrefix}-action`}
      >
        <Text style={[styles.actionVerb, themed.secondaryText]}>
          {`${proposal.heading} `}
        </Text>
        <Text style={styles.actionTitle}>{`“${proposal.title}”`}</Text>
      </Text>

      <View style={[styles.detailsBox, themed.detailsBox]}>
        {proposal.details.map((line, index) => (
          <CardDetailLine
            key={`detail-${index}`}
            line={line}
            testID={`${testIDPrefix}-detail-${index}`}
          />
        ))}
        <CardDetailLine
          line={`Timezone: ${localTz}`}
          testID={`${testIDPrefix}-timezone`}
        />
      </View>

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

      {alternatives.length > 0 ? (
        <View
          style={[styles.alternativesBox, themed.alternativesBox]}
          testID={`${testIDPrefix}-conflict-alternatives`}
        >
          <Text style={[styles.sectionLabel, {color: colors.warning}]}>
            Suggested Free Slots:
          </Text>
          {alternatives.map((slot, index) => {
            const match = SLOT_RE.exec(slot.trim());
            if (!match || !onPickAlternative || expired) {
              return (
                <Text
                  key={`alt-${index}`}
                  style={[styles.line, themed.primaryText]}
                >
                  • {slot}
                </Text>
              );
            }
            const start = padTime(match[1]);
            const end = padTime(match[2]);
            return (
              <TouchableOpacity
                key={`alt-${index}`}
                onPress={() => onPickAlternative(start, end)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${slot}`}
                accessibilityState={{disabled: busy}}
                testID={`${testIDPrefix}-alternative-${start}`}
                style={styles.alternativeButton}
              >
                <Text style={[styles.line, {color: colors.primary}]}>
                  • {slot} — tap to use
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {expired ? (
        <View style={styles.expiredContainer}>
          <Text
            style={[styles.footnote, {color: colors.error}]}
            testID={`${testIDPrefix}-expired`}
          >
            This proposal expired. Nothing was saved to your calendar.
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
        </View>
      ) : (
        <View style={styles.footerContainer}>
          <Text style={[styles.footnote, themed.secondaryText]}>
            {saved ? 'Saved.' : 'Nothing is saved until you confirm.'}
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, themed.secondaryButton]}
              onPress={onCancel}
              disabled={busy || saved}
              accessibilityRole="button"
              accessibilityLabel={`Cancel: ${actionText}`}
              accessibilityState={{disabled: busy || saved}}
              testID={`${testIDPrefix}-cancel`}
            >
              <Text style={[styles.buttonText, themed.primaryText]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <ConfirmSaveButton
              busy={busy}
              saved={saved}
              color={accent}
              onPress={onConfirm}
              accessibilityLabel={`Confirm: ${actionText}`}
              testID={`${testIDPrefix}-confirm`}
              buttonStyle={styles.button}
              busyStyle={styles.buttonBusy}
              textStyle={styles.buttonText}
            />
          </View>
        </View>
      )}
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    detailsBox: {
      backgroundColor: colors.inputBg,
    },
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
    alternativesBox: {
      backgroundColor: colors.inputBg,
      borderColor: colors.warning,
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
    lineHeight: 24,
    marginBottom: Spacing.sm,
  },
  actionVerb: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  actionTitle: {
    fontWeight: '700',
  },
  detailsBox: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: Spacing.xs,
  },
  line: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
    marginVertical: 2,
  },
  timezoneLine: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: Spacing.xs,
  },
  assumptionsBox: {
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  alternativeButton: {
    minHeight: 36,
    justifyContent: 'center',
  },
  alternativesBox: {
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
