import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {CircleAlert, ClipboardCheck, Pencil} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
import type {
  CommandProposal,
  EditableProposalFields,
  PrepareResult,
  ReviewEditPatch,
} from '../../../ai/nlu/commandReview';

export interface CommandReviewCardProps {
  proposal: CommandProposal;
  expired: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onEdit?: (patch: ReviewEditPatch) => PrepareResult | null;
  editError?: string | null;
  /** Prefix for test IDs, for example "chat-review" or "voice-review". */
  testIDPrefix: string;
}

const toLocalIsoDate = (offsetDays: number = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const to12HourDisplay = (hhmm: string | null): string => {
  if (!hhmm) return '';
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!match) return hhmm;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${period}`;
};

interface DraftFormSnapshot {
  title: string;
  date: string;
  time: string;
  endTime: string;
  category: string;
  details: string;
}

const snapshotFromFields = (
  fields: EditableProposalFields,
): DraftFormSnapshot => ({
  title: fields.title,
  date: fields.date ?? '',
  time: to12HourDisplay(fields.time),
  endTime: to12HourDisplay(fields.endTime),
  category: fields.category ?? 'Personal',
  details: fields.details ?? '',
});

/**
 * The exact change the assistant prepared (AGY-PORT 04). Nothing is saved until
 * Confirm; Cancel saves nothing. When editable, fields can be adjusted inline
 * before confirming. Defaults the assistant filled in are listed under
 * "Assumed" so none of them is silent.
 */
export const CommandReviewCard: React.FC<CommandReviewCardProps> = ({
  proposal,
  expired,
  busy,
  onConfirm,
  onCancel,
  onDismiss,
  onEdit,
  editError,
  testIDPrefix,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const accent = proposal.destructive ? colors.error : colors.primary;
  const action = `${proposal.heading} “${proposal.title}”`;
  const fields = proposal.draftFields ?? null;
  const canEdit = Boolean(!expired && fields && onEdit);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DraftFormSnapshot>(() =>
    fields
      ? snapshotFromFields(fields)
      : {
          title: proposal.title,
          date: '',
          time: '',
          endTime: '',
          category: 'Personal',
          details: '',
        },
  );
  const [baseline, setBaseline] = useState<DraftFormSnapshot>(form);

  useEffect(() => {
    setEditing(false);
    if (fields) {
      const next = snapshotFromFields(fields);
      setForm(next);
      setBaseline(next);
    }
  }, [proposal.operationId, expired, fields]);

  const openEditor = () => {
    if (!fields || busy || expired) return;
    const next = snapshotFromFields(fields);
    setForm(next);
    setBaseline(next);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    if (!fields || !onEdit || busy) return;
    const patch: ReviewEditPatch = {};
    const trimmedTitle = form.title.trim();
    if (trimmedTitle !== baseline.title) {
      patch.title = trimmedTitle;
    }
    if (fields.supportsDate && form.date.trim() !== baseline.date) {
      patch.date = form.date.trim() || null;
    }
    if (fields.supportsTime && form.time.trim() !== baseline.time) {
      patch.time = form.time.trim() || null;
    }
    if (fields.supportsEndTime && form.endTime.trim() !== baseline.endTime) {
      patch.endTime = form.endTime.trim() || null;
    }
    if (
      fields.supportsCategory &&
      form.category.trim() !== baseline.category
    ) {
      patch.category = form.category.trim() || 'Personal';
    }
    if (fields.supportsDetails && form.details.trim() !== baseline.details) {
      patch.details = form.details.trim() || null;
    }

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    const result = onEdit(patch);
    if (result?.status === 'proposal') {
      setEditing(false);
    }
  };

  const categoryChoices =
    fields &&
    fields.category &&
    fields.category !== 'Academic' &&
    fields.category !== 'Personal'
      ? [fields.category, 'Academic', 'Personal']
      : ['Academic', 'Personal'];

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
          {editing ? 'Edit draft' : 'Review before saving'}
        </Text>
      </View>
      <Text
        style={[styles.action, themed.primaryText]}
        testID={`${testIDPrefix}-action`}
      >
        {action}
      </Text>

      {editing && fields && !expired ? (
        <View style={styles.editForm} testID={`${testIDPrefix}-edit-form`}>
          <ScrollView
            style={styles.editFieldsScroll}
            contentContainerStyle={styles.editFieldsContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, themed.secondaryText]}>
                Title
              </Text>
              <TextInput
                style={[styles.input, themed.input]}
                value={form.title}
                onChangeText={value =>
                  setForm(prev => ({...prev, title: value}))
                }
                placeholder="Title"
                placeholderTextColor={colors.textSecondary}
                editable={!busy}
                accessibilityLabel="Edit title"
                testID={`${testIDPrefix}-edit-title`}
              />
            </View>

            {fields.supportsDate ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, themed.secondaryText]}>
                  Date
                </Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, themed.secondaryButton]}
                    onPress={() =>
                      setForm(prev => ({...prev, date: toLocalIsoDate(0)}))
                    }
                    disabled={busy}
                    testID={`${testIDPrefix}-edit-date-today`}
                  >
                    <Text style={[styles.chipText, themed.primaryText]}>
                      Today
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chip, themed.secondaryButton]}
                    onPress={() =>
                      setForm(prev => ({...prev, date: toLocalIsoDate(1)}))
                    }
                    disabled={busy}
                    testID={`${testIDPrefix}-edit-date-tomorrow`}
                  >
                    <Text style={[styles.chipText, themed.primaryText]}>
                      Tomorrow
                    </Text>
                  </TouchableOpacity>
                  {proposal.intent === 'create_task' ? (
                    <TouchableOpacity
                      style={[styles.chip, themed.secondaryButton]}
                      onPress={() =>
                        setForm(prev => ({...prev, date: '', time: ''}))
                      }
                      disabled={busy}
                      testID={`${testIDPrefix}-edit-date-clear`}
                    >
                      <Text style={[styles.chipText, themed.secondaryText]}>
                        No date
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.input, themed.input]}
                  value={form.date}
                  onChangeText={value =>
                    setForm(prev => ({...prev, date: value}))
                  }
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  editable={!busy}
                  accessibilityLabel="Edit date"
                  testID={`${testIDPrefix}-edit-date`}
                />
              </View>
            ) : null}

            {fields.supportsTime ? (
              <View style={styles.timeRow}>
                <View style={[styles.fieldGroup, styles.timeField]}>
                  <Text style={[styles.fieldLabel, themed.secondaryText]}>
                    {fields.supportsEndTime ? 'Start time' : 'Time'}
                  </Text>
                  <TextInput
                    style={[styles.input, themed.input]}
                    value={form.time}
                    onChangeText={value =>
                      setForm(prev => ({...prev, time: value}))
                    }
                    placeholder="3:00 PM or 15:00"
                    placeholderTextColor={colors.textSecondary}
                    editable={!busy}
                    accessibilityLabel="Edit time"
                    testID={`${testIDPrefix}-edit-time`}
                  />
                </View>
                {fields.supportsEndTime ? (
                  <View style={[styles.fieldGroup, styles.timeField]}>
                    <Text style={[styles.fieldLabel, themed.secondaryText]}>
                      End time
                    </Text>
                    <TextInput
                      style={[styles.input, themed.input]}
                      value={form.endTime}
                      onChangeText={value =>
                        setForm(prev => ({...prev, endTime: value}))
                      }
                      placeholder="4:00 PM or 16:00"
                      placeholderTextColor={colors.textSecondary}
                      editable={!busy}
                      accessibilityLabel="Edit end time"
                      testID={`${testIDPrefix}-edit-end-time`}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {fields.supportsCategory ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, themed.secondaryText]}>
                  Category
                </Text>
                <View style={styles.chipRow}>
                  {categoryChoices.map(cat => {
                    const selected =
                      form.category.toLowerCase() === cat.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.chip,
                          selected
                            ? {backgroundColor: accent, borderColor: accent}
                            : themed.secondaryButton,
                        ]}
                        onPress={() =>
                          setForm(prev => ({...prev, category: cat}))
                        }
                        disabled={busy}
                        testID={`${testIDPrefix}-edit-category-${cat.toLowerCase()}`}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected
                              ? {color: colors.textOnPrimary}
                              : themed.primaryText,
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {fields.supportsDetails ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, themed.secondaryText]}>
                  {proposal.intent === 'create_note' ||
                  proposal.intent === 'update_note'
                    ? 'Note content'
                    : 'Notes'}
                </Text>
                <TextInput
                  style={[styles.input, styles.multilineInput, themed.input]}
                  value={form.details}
                  onChangeText={value =>
                    setForm(prev => ({...prev, details: value}))
                  }
                  placeholder="Optional notes"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  editable={!busy}
                  accessibilityLabel="Edit notes"
                  testID={`${testIDPrefix}-edit-details`}
                />
              </View>
            ) : null}
          </ScrollView>

          {editError ? (
            <Text
              style={[styles.errorText, {color: colors.error}]}
              accessibilityLiveRegion="polite"
              testID={`${testIDPrefix}-edit-error`}
            >
              {editError}
            </Text>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, themed.secondaryButton]}
              onPress={() => setEditing(false)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Cancel editing ${action}`}
              testID={`${testIDPrefix}-edit-cancel`}
            >
              <Text style={[styles.buttonText, themed.primaryText]}>
                Back
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, {backgroundColor: accent}]}
              onPress={handleSaveEdit}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Save edits to ${action}`}
              testID={`${testIDPrefix}-edit-save`}
            >
              <Text style={[styles.buttonText, {color: colors.textOnPrimary}]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
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
                This review expired, so nothing was saved. Ask again to start
                over.
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
                {canEdit ? (
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.editButton,
                      themed.secondaryButton,
                    ]}
                    onPress={openEditor}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit: ${action}`}
                    accessibilityState={{disabled: busy}}
                    testID={`${testIDPrefix}-edit`}
                  >
                    <Pencil size={14} color={colors.textPrimary} />
                    <Text style={[styles.buttonText, themed.primaryText]}>
                      Edit
                    </Text>
                  </TouchableOpacity>
                ) : null}
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
                    <ActivityIndicator
                      size="small"
                      color={colors.textOnPrimary}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.buttonText,
                        {color: colors.textOnPrimary},
                      ]}
                    >
                      Confirm
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
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
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
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
  editForm: {
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  editFieldsScroll: {
    maxHeight: 280,
  },
  editFieldsContent: {
    gap: Spacing.sm,
  },
  fieldGroup: {
    gap: Spacing.xxs,
  },
  fieldLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 40,
  },
  multilineInput: {
    minHeight: 68,
    textAlignVertical: 'top',
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timeField: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.xxs,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  chipText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  footnote: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: Spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  button: {
    minHeight: 44,
    minWidth: 84,
    paddingHorizontal: Spacing.md,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    flexDirection: 'row',
    gap: Spacing.xs,
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
