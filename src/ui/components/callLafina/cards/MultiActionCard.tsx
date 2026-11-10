/**
 * Call Lafina 2.0 Multi-Action Review Card (Phase 11, P11-02, F-043, F-044, F-045).
 *
 * Renders grouped requests with per-item review, inline title edit, individual
 * removal, context-driven follow-ups, partial failure indicators with retry,
 * and authoritative entity links.
 */

import React, {useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Bell,
  ListTodo,
  FileText,
} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../../theme';
import {useTheme} from '../../../contexts/ThemeContext';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import type {MultiActionBatchData, MultiActionItemData} from '../../../../ai/voiceActions/types';

export interface MultiActionCardProps {
  batch: MultiActionBatchData;
  busy?: boolean;
  onConfirmAll?: () => void;
  onCancelAll?: () => void;
  onConfirmItem?: (itemId: string) => void;
  onCancelItem?: (itemId: string) => void;
  onRetryItem?: (itemId: string) => void;
  onDismiss?: () => void;
  onEditItemTitle?: (itemId: string, newTitle: string) => void;
  testIDPrefix?: string;
}

export const MultiActionCard: React.FC<MultiActionCardProps> = ({
  batch,
  busy = false,
  onConfirmAll = () => {},
  onCancelAll = () => {},
  onCancelItem = () => {},
  onRetryItem = () => {},
  onDismiss = () => {},
  onEditItemTitle,
  testIDPrefix = 'multi-action',
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [editingTitles, setEditingTitles] = useState<Record<string, string>>({});

  const handleTitleChange = (itemId: string, text: string) => {
    setEditingTitles(prev => ({...prev, [itemId]: text}));
    onEditItemTitle?.(itemId, text);
  };

  const getItemIcon = (kind: MultiActionItemData['kind']) => {
    switch (kind) {
      case 'event':
        return <Calendar size={14} color={colors.primary} />;
      case 'reminder':
        return <Bell size={14} color={colors.warning} />;
      case 'note':
        return <FileText size={14} color={colors.success} />;
      case 'task':
      default:
        return <ListTodo size={14} color={colors.primary} />;
    }
  };

  const getStatusBadge = (status: MultiActionItemData['status']) => {
    switch (status) {
      case 'saved':
        return {label: 'Saved', color: colors.success};
      case 'failed':
        return {label: 'Failed', color: colors.error};
      case 'saving':
        return {label: 'Saving…', color: colors.primary};
      case 'cancelled':
        return {label: 'Cancelled', color: colors.textSecondary};
      case 'draft':
      default:
        return {label: 'Draft', color: colors.primary};
    }
  };

  const activeItems = batch.items.filter(i => i.status !== 'cancelled');
  const canConfirm =
    !busy &&
    (batch.status === 'draft' || batch.status === 'partial') &&
    activeItems.some(i => i.status !== 'saved');

  return (
    <View
      style={[styles.card, themed.card]}
      testID={`${testIDPrefix}-card`}
      accessibilityLabel={`Grouped actions card with ${batch.items.length} items`}
    >
      {/* Group Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <ListTodo size={18} color={colors.primary} />
          <Text style={[styles.headerTitle, themed.primaryText]}>
            Grouped Actions ({activeItems.length})
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                batch.status === 'saved'
                  ? colors.success + '20'
                  : batch.status === 'partial'
                  ? colors.warning + '20'
                  : batch.status === 'failed'
                  ? colors.error + '20'
                  : colors.primary + '20',
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              {
                color:
                  batch.status === 'saved'
                    ? colors.success
                    : batch.status === 'partial'
                    ? colors.warning
                    : batch.status === 'failed'
                    ? colors.error
                    : colors.primary,
              },
            ]}
          >
            {batch.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Truncation notice (P11-09) */}
      {batch.truncated && (
        <View
          style={[styles.alertBanner, {backgroundColor: colors.warning + '15', borderColor: colors.warning}]}
          testID="multi-action-truncated-notice"
        >
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={[styles.alertText, {color: colors.warning}]}>
            Capped to 5 items to protect performance.
          </Text>
        </View>
      )}

      {/* Partial outcome alert (P11-03) */}
      {batch.status === 'partial' && (
        <View
          style={[styles.alertBanner, {backgroundColor: colors.warning + '15', borderColor: colors.warning}]}
          testID="multi-action-partial-alert"
        >
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={[styles.alertText, {color: colors.warning}]}>
            Some items failed. Tap Retry on failed items below.
          </Text>
        </View>
      )}

      {/* Scrollable list of items (P11-02) */}
      <ScrollView
        style={styles.scrollList}
        nestedScrollEnabled
        testID="multi-action-card-scroll"
      >
        {batch.items.map((item, index) => {
          const badge = getStatusBadge(item.status);
          const isFinal = item.status === 'saved' || item.status === 'cancelled';
          const titleValue =
            editingTitles[item.id] !== undefined
              ? editingTitles[item.id]
              : item.title;

          return (
            <View
              key={item.id}
              style={[
                styles.itemContainer,
                themed.itemContainer,
                item.status === 'failed' && {borderColor: colors.error},
                item.status === 'cancelled' && {opacity: 0.5},
              ]}
              testID={`${testIDPrefix}-item-${index}`}
            >
              {/* Item Header */}
              <View style={styles.itemHeader}>
                <View style={styles.kindBadge}>
                  {getItemIcon(item.kind)}
                  <Text style={[styles.kindBadgeText, {color: colors.primary}]}>
                    {item.kind.toUpperCase()}
                  </Text>
                </View>

                {item.followUp && (
                  <View
                    style={[styles.followUpBadge, {backgroundColor: colors.primary + '15'}]}
                    testID={`multi-item-followup-badge-${index}`}
                  >
                    <Clock size={10} color={colors.primary} />
                    <Text style={[styles.followUpText, {color: colors.primary}]}>
                      Follow-up
                    </Text>
                  </View>
                )}

                <View style={[styles.itemStatusPill, {backgroundColor: badge.color + '20'}]}>
                  <Text style={[styles.itemStatusText, {color: badge.color}]}>
                    {badge.label}
                  </Text>
                </View>
              </View>

              {/* Title: Editable if draft/failed, static if saved */}
              {!isFinal ? (
                <TextInput
                  style={[styles.titleInput, themed.input]}
                  value={titleValue}
                  onChangeText={text => handleTitleChange(item.id, text)}
                  placeholder="Action title"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel={`Edit title for item ${index + 1}`}
                  testID={`multi-item-title-input-${index}`}
                />
              ) : (
                <Text style={[styles.staticTitle, themed.primaryText]}>
                  {item.title}
                </Text>
              )}

              {/* Date & Time if present */}
              {(item.date || item.time) && (
                <View style={styles.dateTimeRow} testID={`multi-item-datetime-${index}`}>
                  <Calendar size={12} color={colors.textSecondary} />
                  <Text style={[styles.dateTimeText, themed.secondaryText]}>
                    {item.date || ''} {item.time ? `at ${item.time}` : ''}
                    {item.endTime ? ` - ${item.endTime}` : ''}
                  </Text>
                </View>
              )}

              {/* Saved Link (P11-05) */}
              {item.status === 'saved' && item.savedEntityId && (
                <View style={styles.savedLinkRow} testID={`multi-item-link-${index}`}>
                  <CheckCircle2 size={12} color={colors.success} />
                  <Text style={[styles.savedLinkText, {color: colors.success}]}>
                    Saved ID: {item.savedEntityId} ({item.kind})
                  </Text>
                </View>
              )}

              {/* Error display if failed */}
              {item.status === 'failed' && item.error && (
                <Text
                  style={[styles.errorText, {color: colors.error}]}
                  testID={`multi-item-error-${index}`}
                >
                  Error: {item.error}
                </Text>
              )}

              {/* Per-item controls: Retry if failed, Remove if draft */}
              <View style={styles.itemActionsRow}>
                {item.status === 'failed' && (
                  <TouchableOpacity
                    style={[styles.itemButton, {backgroundColor: colors.primary}]}
                    onPress={() => onRetryItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Retry item ${index + 1}`}
                    testID={`multi-item-retry-${index}`}
                  >
                    <RotateCcw size={12} color="#FFFFFF" />
                    <Text style={styles.itemButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'draft' && (
                  <TouchableOpacity
                    style={[styles.itemButtonSecondary, {borderColor: colors.border}]}
                    onPress={() => onCancelItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${index + 1}`}
                    testID={`multi-item-cancel-${index}`}
                  >
                    <Trash2 size={12} color={colors.textSecondary} />
                    <Text style={[styles.itemButtonTextSecondary, themed.secondaryText]}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.footerRow}>
        {canConfirm && (
          <TouchableOpacity
            style={[styles.confirmButton, {backgroundColor: colors.primary}, busy && {opacity: 0.6}]}
            disabled={busy}
            onPress={onConfirmAll}
            accessibilityRole="button"
            accessibilityLabel="Confirm all actions"
            testID="multi-action-confirm-all"
          >
            <CheckCircle2 size={16} color="#FFFFFF" />
            <Text style={styles.confirmButtonText}>
              {busy ? 'Saving…' : 'Save All'}
            </Text>
          </TouchableOpacity>
        )}

        {(batch.status === 'draft' || batch.status === 'partial') && (
          <TouchableOpacity
            style={[styles.cancelButton, themed.secondaryButton]}
            disabled={busy}
            onPress={onCancelAll}
            accessibilityRole="button"
            accessibilityLabel="Cancel all actions"
            testID="multi-action-cancel-all"
          >
            <Text style={[styles.cancelButtonText, themed.secondaryText]}>
              Cancel All
            </Text>
          </TouchableOpacity>
        )}

        {(batch.status === 'saved' || batch.status === 'cancelled') && (
          <TouchableOpacity
            style={[styles.confirmButton, {backgroundColor: colors.primary}]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss grouped card"
            testID="multi-action-dismiss"
          >
            <Text style={styles.confirmButtonText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    itemContainer: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
    },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
    primaryText: {
      color: colors.textPrimary,
    },
    secondaryText: {
      color: colors.textSecondary,
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      borderColor: colors.border,
    },
  });

const styles = StyleSheet.create({
  card: {
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
    maxHeight: 460,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '700',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.xs,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  alertText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    flex: 1,
  },
  scrollList: {
    maxHeight: 300,
  },
  itemContainer: {
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  kindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kindBadgeText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '700',
  },
  followUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  followUpText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '600',
  },
  itemStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  itemStatusText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '600',
  },
  titleInput: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginVertical: Spacing.xs,
  },
  staticTitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
    marginVertical: Spacing.xs,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateTimeText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  savedLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  savedLinkText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '600',
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    marginTop: Spacing.xs,
  },
  itemActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  itemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Layout.borderRadiusButton,
  },
  itemButtonText: {
    color: '#FFFFFF',
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '600',
  },
  itemButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  itemButtonTextSecondary: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
});
