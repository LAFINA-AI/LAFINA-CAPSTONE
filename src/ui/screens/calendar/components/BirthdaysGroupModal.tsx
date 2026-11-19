import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {Cake, Pencil, Plus, Search, Trash2, X} from 'lucide-react-native';
import {
  BIRTHDAY_ACCENT_COLOR,
  BIRTHDAY_RELATIONS,
  SHORT_MONTH_NAMES,
  deleteBirthday,
  formatBirthdayMonthDay,
  formatBirthdaySubtitle,
  getBirthdays,
  saveBirthday,
  type BirthdayEntry,
} from '../utils/calendarGroups';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

export interface BirthdaysGroupModalProps {
  visible: boolean;
  userId: string;
  refreshTrigger?: number;
  initialBirthdayId?: string | null;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Manager for the Birthdays & Anniversaries calendar group.
 * Stores each birthday as a yearly recurring all-day `Event` (`FREQ=YEARLY`).
 */
export const BirthdaysGroupModal: React.FC<BirthdaysGroupModalProps> = ({
  visible,
  userId,
  refreshTrigger = 0,
  initialBirthdayId = null,
  onClose,
  onChanged,
}) => {
  const palette = useSchedulePalette();

  const [entries, setEntries] = useState<BirthdayEntry[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [personName, setPersonName] = useState('');
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [dayText, setDayText] = useState<string>(String(new Date().getDate()));
  const [yearText, setYearText] = useState('');
  const [relation, setRelation] = useState<string>('Friend');
  const [notes, setNotes] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  const reload = () => {
    setEntries(getBirthdays(userId));
  };

  useEffect(() => {
    if (!visible) return;
    const loaded = getBirthdays(userId);
    setEntries(loaded);
    setSearch('');
    const target = initialBirthdayId
      ? loaded.find(entry => entry.id === initialBirthdayId)
      : undefined;
    if (target) {
      setEditingId(target.id);
      setPersonName(target.personName);
      setMonth(target.month);
      setDayText(String(target.day));
      setYearText(target.birthYear ? String(target.birthYear) : '');
      setRelation(target.relation || 'Friend');
      setNotes(target.notes || '');
    } else {
      setEditingId(null);
      setPersonName('');
      setMonth(new Date().getMonth() + 1);
      setDayText(String(new Date().getDate()));
      setYearText('');
      setRelation('Friend');
      setNotes('');
    }
    setStatusMessage(null);
  }, [visible, userId, refreshTrigger, initialBirthdayId]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(item =>
      [
        item.personName,
        item.relation,
        item.notes,
        formatBirthdayMonthDay(item.month, item.day),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [entries, search]);

  const resetForm = () => {
    setEditingId(null);
    setPersonName('');
    setMonth(new Date().getMonth() + 1);
    setDayText(String(new Date().getDate()));
    setYearText('');
    setRelation('Friend');
    setNotes('');
  };

  const handleEdit = (entry: BirthdayEntry) => {
    setStatusMessage(null);
    setEditingId(entry.id);
    setPersonName(entry.personName);
    setMonth(entry.month);
    setDayText(String(entry.day));
    setYearText(entry.birthYear ? String(entry.birthYear) : '');
    setRelation(entry.relation || 'Friend');
    setNotes(entry.notes || '');
  };

  const handleSave = () => {
    const cleanName = personName.trim();
    if (!cleanName) {
      setStatusMessage({kind: 'error', text: 'Enter a name for the birthday.'});
      return;
    }

    const parsedDay = Number.parseInt(dayText.trim(), 10);
    if (!Number.isFinite(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      setStatusMessage({
        kind: 'error',
        text: 'Enter a valid day of the month (1-31).',
      });
      return;
    }

    let parsedYear: number | null = null;
    if (yearText.trim().length > 0) {
      const y = Number.parseInt(yearText.trim(), 10);
      if (!Number.isFinite(y) || y < 1900 || y > 2100) {
        setStatusMessage({
          kind: 'error',
          text: 'Enter a 4-digit birth year (1900-2100) or leave blank.',
        });
        return;
      }
      parsedYear = y;
    }

    const checkYear = parsedYear ?? 2000;
    const maxDays = new Date(checkYear, month, 0).getDate();
    if (parsedDay > maxDays) {
      setStatusMessage({
        kind: 'error',
        text: `${SHORT_MONTH_NAMES[month - 1]} ${
          parsedYear ? `${parsedYear} ` : ''
        }only has ${maxDays} days.`,
      });
      return;
    }

    try {
      saveBirthday({
        userId,
        id: editingId ?? undefined,
        personName: cleanName,
        month,
        day: parsedDay,
        birthYear: parsedYear,
        relation,
        notes,
      });
      const actionWord = editingId ? 'Updated' : 'Added';
      resetForm();
      reload();
      onChanged();
      setStatusMessage({
        kind: 'success',
        text: `${actionWord} ${cleanName}'s birthday (${formatBirthdayMonthDay(
          month,
          parsedDay,
        )}).`,
      });
    } catch (error) {
      console.error('[BirthdaysGroupModal] Save failed:', error);
      setStatusMessage({
        kind: 'error',
        text: 'Could not save birthday right now.',
      });
    }
  };

  const confirmDelete = (entry: BirthdayEntry) => {
    Alert.alert(
      'Remove Birthday',
      `Remove ${entry.personName}'s birthday (${formatBirthdayMonthDay(
        entry.month,
        entry.day,
      )})?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            try {
              deleteBirthday(entry.id);
              if (editingId === entry.id) {
                resetForm();
              }
              reload();
              onChanged();
              setStatusMessage({
                kind: 'success',
                text: `Removed ${entry.personName}'s birthday.`,
              });
            } catch (error) {
              console.error('[BirthdaysGroupModal] Delete failed:', error);
              setStatusMessage({
                kind: 'error',
                text: 'Could not remove birthday right now.',
              });
            }
          },
        },
      ],
    );
  };

  const currentYear = new Date().getFullYear();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          testID="birthdays-group-modal"
          style={[
            styles.sheet,
            {backgroundColor: palette.bg, borderColor: palette.border},
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {backgroundColor: palette.card, borderBottomColor: palette.border},
            ]}
          >
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.headerIconBadge,
                  {backgroundColor: BIRTHDAY_ACCENT_COLOR + '1A'},
                ]}
              >
                <Cake size={18} color={BIRTHDAY_ACCENT_COLOR} />
              </View>
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerTitle, {color: palette.text}]}>
                  Birthdays
                </Text>
                <Text style={[styles.headerSubtitle, {color: palette.muted}]}>
                  {entries.length} saved · Repeats yearly on calendar
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close birthdays"
              testID="birthdays-close-button"
              style={[styles.closeBtn, {backgroundColor: palette.surface}]}
            >
              <X size={18} color={palette.muted} />
            </TouchableOpacity>
          </View>

          {statusMessage && (
            <View
              style={[
                styles.statusBanner,
                {
                  backgroundColor:
                    statusMessage.kind === 'error'
                      ? palette.dangerSoft
                      : palette.mint,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      statusMessage.kind === 'error'
                        ? palette.danger
                        : palette.mintInk,
                  },
                ]}
              >
                {statusMessage.text}
              </Text>
            </View>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Add / Edit Birthday Card */}
            <View
              style={[
                styles.formCard,
                {
                  backgroundColor: palette.card,
                  borderColor: palette.border,
                },
                !palette.isDarkMode && scheduleCardShadow,
              ]}
            >
              <View style={styles.formHeaderRow}>
                <Text style={[styles.formTitle, {color: palette.text}]}>
                  {editingId ? 'Edit Birthday' : 'Add Birthday'}
                </Text>
                {editingId && (
                  <TouchableOpacity onPress={resetForm}>
                    <Text style={[styles.cancelLink, {color: palette.muted}]}>
                      Cancel edit
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Person Name *
              </Text>
              <TextInput
                testID="birthday-name-input"
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    color: palette.text,
                  },
                ]}
                placeholder="e.g., Maria Santos"
                placeholderTextColor={palette.muted}
                value={personName}
                onChangeText={val => {
                  setStatusMessage(null);
                  setPersonName(val);
                }}
              />

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Month *
              </Text>
              <View style={styles.monthGrid}>
                {SHORT_MONTH_NAMES.map((label, idx) => {
                  const mNum = idx + 1;
                  const active = month === mNum;
                  return (
                    <TouchableOpacity
                      key={label}
                      testID={`birthday-month-${mNum}`}
                      onPress={() => {
                        setStatusMessage(null);
                        setMonth(mNum);
                      }}
                      style={[
                        styles.monthChip,
                        {
                          backgroundColor: active
                            ? BIRTHDAY_ACCENT_COLOR
                            : palette.surface,
                          borderColor: active
                            ? BIRTHDAY_ACCENT_COLOR
                            : palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.monthChipText,
                          {color: active ? '#FFFFFF' : palette.text},
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.rowTwoCol}>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Day *
                  </Text>
                  <TextInput
                    testID="birthday-day-input"
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                        color: palette.text,
                      },
                    ]}
                    keyboardType="numeric"
                    maxLength={2}
                    placeholder="1-31"
                    placeholderTextColor={palette.muted}
                    value={dayText}
                    onChangeText={val => {
                      setStatusMessage(null);
                      setDayText(val.replace(/[^0-9]/g, ''));
                    }}
                  />
                </View>

                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Birth Year (Optional)
                  </Text>
                  <TextInput
                    testID="birthday-year-input"
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                        color: palette.text,
                      },
                    ]}
                    keyboardType="numeric"
                    maxLength={4}
                    placeholder="e.g., 2004"
                    placeholderTextColor={palette.muted}
                    value={yearText}
                    onChangeText={val => {
                      setStatusMessage(null);
                      setYearText(val.replace(/[^0-9]/g, ''));
                    }}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Group / Relation
              </Text>
              <View style={styles.chipRow}>
                {BIRTHDAY_RELATIONS.map(rel => {
                  const active = relation === rel;
                  return (
                    <TouchableOpacity
                      key={rel}
                      onPress={() => setRelation(rel)}
                      style={[
                        styles.relChip,
                        {
                          backgroundColor: active
                            ? palette.accent
                            : palette.surface,
                          borderColor: active ? palette.accent : palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.relChipText,
                          {color: active ? '#FFFFFF' : palette.text},
                        ]}
                      >
                        {rel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Gift Idea / Note (Optional)
              </Text>
              <TextInput
                testID="birthday-notes-input"
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    color: palette.text,
                  },
                ]}
                placeholder="e.g., Matcha latte or book"
                placeholderTextColor={palette.muted}
                value={notes}
                onChangeText={setNotes}
              />

              <TouchableOpacity
                testID="birthday-save-button"
                onPress={handleSave}
                style={[
                  styles.saveBtn,
                  {backgroundColor: BIRTHDAY_ACCENT_COLOR},
                ]}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.saveBtnText}>
                  {editingId ? 'Save Changes' : 'Add Birthday'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Saved Birthdays List */}
            {entries.length > 0 && (
              <>
                <View style={styles.listHeaderRow}>
                  <Text style={[styles.sectionTitle, {color: palette.text}]}>
                    Saved Birthdays ({entries.length})
                  </Text>
                </View>

                <View
                  style={[
                    styles.searchBox,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Search size={15} color={palette.muted} />
                  <TextInput
                    testID="birthdays-search-input"
                    style={[styles.searchInput, {color: palette.text}]}
                    placeholder="Search birthdays..."
                    placeholderTextColor={palette.muted}
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>

                {filteredEntries.length === 0 ? (
                  <View
                    style={[
                      styles.emptyCard,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={[styles.emptyTitle, {color: palette.text}]}>
                      No matching birthdays
                    </Text>
                  </View>
                ) : (
                  filteredEntries.map((entry, idx) => (
                    <View
                      key={entry.id}
                      testID={`birthday-card-${idx}`}
                      style={[
                        styles.entryCard,
                        {
                          backgroundColor: palette.card,
                          borderColor: palette.border,
                        },
                        !palette.isDarkMode && scheduleCardShadow,
                      ]}
                    >
                      <View
                        style={[
                          styles.colorStripe,
                          {backgroundColor: BIRTHDAY_ACCENT_COLOR},
                        ]}
                      />
                      <View style={styles.entryBody}>
                        <View style={styles.entryTopRow}>
                          <View
                            style={[
                              styles.dateBadge,
                              {backgroundColor: BIRTHDAY_ACCENT_COLOR + '1A'},
                            ]}
                          >
                            <Text
                              style={[
                                styles.dateBadgeText,
                                {color: BIRTHDAY_ACCENT_COLOR},
                              ]}
                            >
                              {formatBirthdayMonthDay(entry.month, entry.day)}
                            </Text>
                          </View>

                          <View style={styles.cardActions}>
                            <TouchableOpacity
                              testID={`birthday-edit-${idx}`}
                              onPress={() => handleEdit(entry)}
                              style={[
                                styles.cardActionBtn,
                                {backgroundColor: palette.surface},
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Edit ${entry.personName}'s birthday`}
                            >
                              <Pencil size={13} color={palette.text} />
                              <Text
                                style={[
                                  styles.cardActionLabel,
                                  {color: palette.text},
                                ]}
                              >
                                Edit
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              testID={`birthday-delete-${idx}`}
                              onPress={() => confirmDelete(entry)}
                              style={[
                                styles.cardDeleteBtn,
                                {backgroundColor: palette.dangerSoft},
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${entry.personName}'s birthday`}
                            >
                              <Trash2 size={14} color={palette.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <Text
                          style={[styles.entryTitle, {color: palette.text}]}
                        >
                          {entry.personName}
                        </Text>
                        <Text
                          style={[styles.entrySub, {color: palette.muted}]}
                        >
                          {formatBirthdaySubtitle(entry, currentYear)}
                          {entry.notes ? ` · ${entry.notes}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  headerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
    gap: 12,
  },
  formCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cancelLink: {
    fontSize: 12,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  monthChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 46,
    alignItems: 'center',
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowTwoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  colHalf: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  relChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  relChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 14,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  entryCard: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  colorStripe: {
    width: 5,
  },
  entryBody: {
    flex: 1,
    padding: 13,
    gap: 5,
  },
  entryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dateBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  cardActionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  entrySub: {
    fontSize: 12.5,
    fontWeight: '500',
  },
});
