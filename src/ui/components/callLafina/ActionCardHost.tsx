/**
 * Call Lafina 2.0 Action Card Host & Registry Renderer (P06-06, P07-01, P07-02, P07-03, F-027..F-033).
 *
 * Renders contextual action cards during live voice calls without interrupting
 * the voice connection. Dispatches to specialized cards:
 * - ReminderDraftCard for tasks and reminders (F-030)
 * - CalendarDraftCard for events, time blocks, and conflict alternatives (F-031, F-033)
 * - AgendaCard for read-only agenda/schedule results (F-032)
 * - CommandReviewCard generic fallback
 * - Safe fallback for unsupported card kinds (F-027)
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
import {ReminderDraftCard} from './cards/ReminderDraftCard';
import {CalendarDraftCard} from './cards/CalendarDraftCard';
import {AgendaCard} from './cards/AgendaCard';
import type {AgendaCardData} from './cards/AgendaCard';
import {NoteDraftCard} from './cards/NoteDraftCard';
import {NoteResultCard} from './cards/NoteResultCard';
import type {NoteResultCardData} from './cards/NoteResultCard';
import {MemoryReviewCard} from './cards/MemoryReviewCard';
import type {MemoryProposalData, MultiActionBatchData} from '../../../ai/voiceActions/types';
import {MultiActionCard} from './cards/MultiActionCard';

export interface ActionCardHostProps {
  proposal?: CommandProposal | null;
  agendaData?: AgendaCardData | null;
  noteResultData?: NoteResultCardData | null;
  memoryProposal?: MemoryProposalData | null;
  multiActionBatch?: MultiActionBatchData | null;
  alternatives?: string[];
  expired?: boolean;
  busy?: boolean;
  status?: ActionCardStatus;
  unknownKind?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  onOpenNote?: (noteId: string) => void;
  onSaveMemory?: (editedText?: string) => void;
  onUndoMemory?: () => void;
  onConfirmMultiAll?: () => void;
  onCancelMultiAll?: () => void;
  onCancelMultiItem?: (itemId: string) => void;
  onRetryMultiItem?: (itemId: string) => void;
  onEditMultiItemTitle?: (itemId: string, newTitle: string) => void;
  testIDPrefix?: string;
}

export const ActionCardHost: React.FC<ActionCardHostProps> = ({
  proposal = null,
  agendaData = null,
  noteResultData = null,
  memoryProposal = null,
  multiActionBatch = null,
  alternatives = [],
  expired = false,
  busy = false,
  status = 'prepare',
  unknownKind = null,
  onConfirm = () => {},
  onCancel = () => {},
  onDismiss = () => {},
  onOpenNote,
  onSaveMemory,
  onUndoMemory,
  onConfirmMultiAll,
  onCancelMultiAll,
  onCancelMultiItem,
  onRetryMultiItem,
  onEditMultiItemTitle,
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

  if (agendaData) {
    return (
      <View
        style={styles.hostContainer}
        testID="action-card-host"
        accessibilityLabel={`Agenda card: ${agendaData.date}`}
      >
        <AgendaCard
          data={agendaData}
          onDismiss={onDismiss}
          testIDPrefix={testIDPrefix}
        />
      </View>
    );
  }

  if (noteResultData) {
    return (
      <View
        style={styles.hostContainer}
        testID="action-card-host"
        accessibilityLabel={`Note result card: ${noteResultData.title}`}
      >
        <NoteResultCard
          data={noteResultData}
          onOpenNote={onOpenNote}
          onDismiss={onDismiss}
          testIDPrefix={testIDPrefix}
        />
      </View>
    );
  }

  if (memoryProposal) {
    return (
      <View
        style={styles.hostContainer}
        testID="action-card-host"
        accessibilityLabel={`Memory card: ${memoryProposal.status}`}
      >
        <MemoryReviewCard
          data={memoryProposal}
          expired={expired || status === 'expired'}
          busy={busy || status === 'confirm'}
          onSave={onSaveMemory ?? onConfirm}
          onCancel={onCancel}
          onDismiss={onDismiss}
          onUndo={onUndoMemory}
          testIDPrefix={testIDPrefix}
        />
      </View>
    );
  }

  if (multiActionBatch) {
    return (
      <View
        style={styles.hostContainer}
        testID="action-card-host"
        accessibilityLabel={`Grouped actions card with ${multiActionBatch.items.length} items`}
      >
        <MultiActionCard
          batch={multiActionBatch}
          busy={busy || status === 'confirm'}
          onConfirmAll={onConfirmMultiAll ?? onConfirm}
          onCancelAll={onCancelMultiAll ?? onCancel}
          onCancelItem={onCancelMultiItem}
          onRetryItem={onRetryMultiItem}
          onDismiss={onDismiss}
          onEditItemTitle={onEditMultiItemTitle}
          testIDPrefix={testIDPrefix}
        />
      </View>
    );
  }

  if (!proposal) {
    return null;
  }

  const isTaskOrReminder =
    proposal.intent === 'create_task' ||
    proposal.intent === 'create_reminder' ||
    proposal.intent === 'update_task';

  const isEventOrBlock =
    proposal.intent === 'create_time_block' ||
    proposal.intent === 'update_time_block';

  const isNote =
    proposal.intent === 'create_note' ||
    proposal.intent === 'update_note';

  return (
    <View
      style={styles.hostContainer}
      testID="action-card-host"
      accessibilityLabel={`Action card: ${proposal.heading}`}
    >
      {isTaskOrReminder ? (
        <ReminderDraftCard
          proposal={proposal}
          expired={expired || status === 'expired'}
          busy={busy || status === 'confirm'}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onDismiss={onDismiss}
          testIDPrefix={testIDPrefix}
        />
      ) : isEventOrBlock ? (
        <CalendarDraftCard
          proposal={proposal}
          expired={expired || status === 'expired'}
          busy={busy || status === 'confirm'}
          alternatives={alternatives}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onDismiss={onDismiss}
          testIDPrefix={testIDPrefix}
        />
      ) : isNote ? (
        <NoteDraftCard
          proposal={proposal}
          expired={expired || status === 'expired'}
          busy={busy || status === 'confirm'}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onDismiss={onDismiss}
          testIDPrefix={testIDPrefix}
        />
      ) : (
        <CommandReviewCard
          proposal={proposal}
          expired={expired || status === 'expired'}
          busy={busy || status === 'confirm'}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onDismiss={onDismiss}
          testIDPrefix={testIDPrefix}
        />
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
