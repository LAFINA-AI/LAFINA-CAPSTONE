/**
 * Call Lafina 2.0 Memory Proposal & Review Card (F-037, F-039, F-075, P09-03, P09-04, P09-06).
 *
 * Dedicated structured card for explicitly reviewing and confirming personal memory items.
 * Displays exact fact, source utterance, editable input, truthful persistence states
 * (draft, saved, duplicate, disabled, failed, undone), and data disclosure notice.
 * Preserves transaction boundaries: no writes to chatMemoryStore until explicit Confirm.
 */

import React, {useState, useEffect} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {Brain, CheckCircle, CircleAlert} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../../theme';
import {useTheme} from '../../../contexts/ThemeContext';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import type {MemoryProposalData} from '../../../../ai/voiceActions/types';

export interface MemoryReviewCardProps {
  data: MemoryProposalData;
  expired?: boolean;
  busy?: boolean;
  onSave: (editedText?: string) => void;
  onCancel: () => void;
  onDismiss: () => void;
  onUndo?: () => void;
  testIDPrefix?: string;
}

export const MemoryReviewCard: React.FC<MemoryReviewCardProps> = ({
  data,
  expired = false,
  busy = false,
  onSave,
  onCancel,
  onDismiss,
  onUndo,
  testIDPrefix = 'memory-draft',
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [editText, setEditText] = useState(data.text);

  useEffect(() => {
    setEditText(data.text);
  }, [data.text]);

  const isDraft = data.status === 'draft';
  const isSaved = data.status === 'saved';
  const isDuplicate = data.status === 'duplicate';
  const isDisabled = data.status === 'disabled';
  const isUndone = data.status === 'undone';
  const isFailed = data.status === 'failed';
  const isCanceled = data.status === 'canceled';

  const accentColor = isSaved
    ? colors.primary
    : isDuplicate || isDisabled
    ? colors.warning
    : isFailed
    ? colors.error
    : colors.primary;

  const statusLabel = expired
    ? 'Expired'
    : isDraft
    ? 'Draft'
    : isSaved
    ? 'Saved'
    : isDuplicate
    ? 'Already Saved'
    : isDisabled
    ? 'Disabled'
    : isUndone
    ? 'Undone'
    : isFailed
    ? 'Failed'
    : isCanceled
    ? 'Canceled'
    : 'Review';

  return (
    <View
      style={[styles.card, themed.card, {borderColor: accentColor}]}
      accessibilityLabel={`Memory review card: ${statusLabel}`}
      testID={`${testIDPrefix}-card`}
    >
      <View testID="memory-review-card" pointerEvents="none" />
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Brain size={18} color={accentColor} />
          <Text
            style={[styles.kicker, {color: colors.textPrimary}]}
            accessibilityRole="header"
          >
            Personal Memory
          </Text>
        </View>
        <View style={[styles.statusBadge, {backgroundColor: colors.inputBg}]}>
          <Text
            style={[
              styles.statusText,
              {
                color: expired
                  ? colors.error
                  : isSaved
                  ? colors.primary
                  : colors.textSecondary,
              },
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      {data.sourceUtterance ? (
        <View style={styles.sourceBox}>
          <Text style={[styles.sourceLabel, {color: colors.textSecondary}]}>
            From spoken request:
          </Text>
          <Text style={[styles.sourceText, {color: colors.textSecondary}]}>
            “{data.sourceUtterance}”
          </Text>
        </View>
      ) : null}

      <View style={styles.contentSection}>
        {isDraft ? (
          <View style={styles.draftBox}>
            <Text style={[styles.instruction, {color: colors.textPrimary}]}>
              Review the fact Lafina will remember about you:
            </Text>
            <TextInput
              style={[
                styles.textInput,
                themed.textInput,
                {color: colors.textPrimary, borderColor: colors.border},
              ]}
              value={editText}
              onChangeText={setEditText}
              placeholder="Fact to remember..."
              placeholderTextColor={colors.textSecondary}
              maxLength={200}
              multiline
              editable={!expired && !busy}
              accessibilityLabel="Memory fact text input"
              testID="memory-draft-text-input"
            />
          </View>
        ) : isSaved ? (
          <View style={styles.resultBox}>
            <CheckCircle size={20} color={colors.primary} />
            <View style={styles.resultTextGroup}>
              <Text style={[styles.resultTitle, {color: colors.textPrimary}]}>
                Saved to personal memory
              </Text>
              <Text style={[styles.resultFact, {color: colors.textSecondary}]}>
                “{data.text}”
              </Text>
            </View>
          </View>
        ) : isDuplicate ? (
          <View style={styles.resultBox}>
            <CircleAlert size={20} color={colors.warning} />
            <Text style={[styles.resultTitle, {color: colors.textPrimary}]}>
              That fact is already in your memory.
            </Text>
          </View>
        ) : isDisabled ? (
          <View style={styles.resultBox}>
            <CircleAlert size={20} color={colors.warning} />
            <Text style={[styles.resultTitle, {color: colors.textPrimary}]}>
              Memory is turned off in Profile settings. No memories are saved or shared.
            </Text>
          </View>
        ) : isUndone ? (
          <View style={styles.resultBox}>
            <Text style={[styles.resultTitle, {color: colors.textPrimary}]}>
              Memory change undone. Fact removed from local storage.
            </Text>
          </View>
        ) : isFailed ? (
          <View style={styles.resultBox}>
            <CircleAlert size={20} color={colors.error} />
            <Text style={[styles.resultTitle, {color: colors.error}]}>
              {data.error || 'Could not save memory.'}
            </Text>
          </View>
        ) : isCanceled ? (
          <View style={styles.resultBox}>
            <Text style={[styles.resultTitle, {color: colors.textSecondary}]}>
              Memory proposal declined. Nothing was saved.
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={[styles.disclosureText, {color: colors.textSecondary}]}
        testID="memory-disclosure-text"
      >
        Stored on this device only. Relevant memories are shared with the voice provider during calls to personalize assistance.
      </Text>

      <View style={styles.buttonRow}>
        {isDraft ? (
          <>
            <TouchableOpacity
              style={[styles.button, themed.secondaryButton]}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Decline memory save"
              testID="memory-draft-cancel"
            >
              <Text style={[styles.buttonText, themed.secondaryButtonText]}>
                Decline
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                themed.primaryButton,
                (expired || busy || editText.trim().length < 2) && styles.disabledButton,
              ]}
              onPress={() => onSave(editText.trim())}
              disabled={expired || busy || editText.trim().length < 2}
              accessibilityRole="button"
              accessibilityLabel="Confirm memory save"
              testID="memory-draft-confirm"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={[styles.buttonText, themed.primaryButtonText]}>
                  Save Memory
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : isSaved ? (
          <>
            {onUndo ? (
              <TouchableOpacity
                style={[styles.button, themed.secondaryButton]}
                onPress={onUndo}
                accessibilityRole="button"
                accessibilityLabel="Undo memory save"
                testID="memory-draft-undo"
              >
                <Text style={[styles.buttonText, themed.secondaryButtonText]}>
                  Undo
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.button, themed.primaryButton]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss memory card"
              testID="memory-draft-dismiss"
            >
              <Text style={[styles.buttonText, themed.primaryButtonText]}>
                Done
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.button, themed.secondaryButton, {flex: 1}]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss memory card"
            testID="memory-draft-dismiss"
          >
            <Text style={[styles.buttonText, themed.secondaryButtonText]}>
              Dismiss
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {
    backgroundColor: colors.surface,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
  },
  textInput: {
    backgroundColor: colors.inputBg,
  },
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusCard,
    padding: Spacing.md,
    gap: Spacing.sm,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  kicker: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.caption,
  },
  sourceBox: {
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
    borderRadius: 6,
    padding: Spacing.xs,
    gap: 2,
  },
  sourceLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  sourceText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontStyle: 'italic',
  },
  contentSection: {
    marginVertical: Spacing.xs,
  },
  draftBox: {
    gap: Spacing.xs,
  },
  instruction: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  resultTextGroup: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  resultFact: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  disclosureText: {
    fontFamily: Fonts.body,
    fontSize: 10,
    lineHeight: 14,
    opacity: 0.85,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  button: {
    minHeight: 44,
    minWidth: 88,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
  },
  disabledButton: {
    opacity: 0.5,
  },
});