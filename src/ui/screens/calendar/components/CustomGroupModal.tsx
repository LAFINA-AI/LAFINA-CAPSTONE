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
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Calendar as CalendarIcon,
  Clock,
  FolderPlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import {CUSTOM_CATEGORY_SWATCHES} from '../../../theme';
import {
  dateToTimeString,
  formatLocalDate,
  formatTimeForDisplay,
  timeStringToDate,
} from '../utils/calendarHelpers';
import {
  DAY_PATTERN_PRESETS,
  WEEKDAY_OPTIONS,
  deleteClassGroupFromStore,
  parseTimeMinutes,
  sortWeekdays,
} from '../utils/classScheduleHelpers';
import {
  CUSTOM_GROUP_PRESETS,
  STANDARD_BLOCK_CATEGORIES,
  deleteCustomScheduleGroup,
  ensureCustomScheduleGroup,
  getCustomScheduleGroups,
  saveCustomGroupItem,
  updateCustomScheduleGroup,
  type CustomScheduleGroup,
} from '../utils/calendarGroups';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

export interface CustomGroupModalProps {
  visible: boolean;
  userId: string;
  timeFormat24h: boolean;
  initialGroupName?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal for creating and managing user-defined schedule groups (e.g., Exams,
 * Org / Club, Workout, Family) with color coding and single or recurring blocks.
 */
export const CustomGroupModal: React.FC<CustomGroupModalProps> = ({
  visible,
  userId,
  timeFormat24h,
  initialGroupName,
  onClose,
  onSaved,
}) => {
  const palette = useSchedulePalette();

  const [groups, setGroups] = useState<CustomScheduleGroup[]>([]);
  const [persistedGroupName, setPersistedGroupName] = useState<string | null>(
    null,
  );
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState<string>(
    CUSTOM_CATEGORY_SWATCHES[0],
  );
  const [itemTitle, setItemTitle] = useState('');
  const [recurrenceMode, setRecurrenceMode] = useState<
    'once' | 'weekly' | 'semester'
  >('weekly');
  const [targetDate, setTargetDate] = useState(() =>
    formatLocalDate(new Date()),
  );
  const [days, setDays] = useState<string[]>(['Monday', 'Wednesday', 'Friday']);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  const reloadGroups = () => {
    setGroups(getCustomScheduleGroups(userId));
  };

  useEffect(() => {
    if (!visible) return;
    const loaded = getCustomScheduleGroups(userId);
    setGroups(loaded);
    const trimmedInitial = initialGroupName?.trim() || '';
    const existing = trimmedInitial
      ? loaded.find(
          g => g.name.toLowerCase() === trimmedInitial.toLowerCase(),
        )
      : null;

    setPersistedGroupName(existing ? existing.name : null);
    setGroupName(existing ? existing.name : trimmedInitial);
    setGroupColor(existing ? existing.color : CUSTOM_CATEGORY_SWATCHES[0]);
    setItemTitle('');
    setRecurrenceMode('weekly');
    setTargetDate(formatLocalDate(new Date()));
    setDays(['Monday', 'Wednesday', 'Friday']);
    setStartTime('09:00');
    setEndTime('10:00');
    setNotes('');
    setShowDatePicker(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setStatusMessage(null);
  }, [visible, userId, initialGroupName]);

  const activeGroup = useMemo(() => {
    const clean = (persistedGroupName ?? groupName.trim()).toLowerCase();
    if (!clean) return null;
    return groups.find(g => g.name.toLowerCase() === clean) ?? null;
  }, [groups, persistedGroupName, groupName]);

  const toggleDay = (dayKey: string) => {
    setStatusMessage(null);
    setDays(prev =>
      prev.includes(dayKey)
        ? prev.filter(d => d !== dayKey)
        : sortWeekdays([...prev, dayKey]),
    );
  };

  const handleSave = () => {
    const cleanGroup = groupName.trim();
    if (!cleanGroup) {
      setStatusMessage({kind: 'error', text: 'Enter a group name.'});
      return;
    }
    if (STANDARD_BLOCK_CATEGORIES.has(cleanGroup.toLowerCase())) {
      setStatusMessage({
        kind: 'error',
        text: `"${cleanGroup}" is a built-in category. Choose a custom group name.`,
      });
      return;
    }

    const cleanItemTitle = itemTitle.trim();
    if (!cleanItemTitle) {
      // Allow creating, renaming, or recoloring just the group container when no item title is typed.
      try {
        if (persistedGroupName) {
          updateCustomScheduleGroup({
            userId,
            oldName: persistedGroupName,
            newName: cleanGroup,
            newColor: groupColor,
          });
        } else {
          ensureCustomScheduleGroup(userId, cleanGroup, groupColor);
        }
        setPersistedGroupName(cleanGroup);
        reloadGroups();
        onSaved();
        setStatusMessage({
          kind: 'success',
          text: `Saved group "${cleanGroup}". Add schedule items below anytime.`,
        });
      } catch (error) {
        console.error('[CustomGroupModal] Save group failed:', error);
        setStatusMessage({
          kind: 'error',
          text:
            error instanceof Error
              ? error.message
              : 'Could not save this group right now.',
        });
      }
      return;
    }

    if (recurrenceMode !== 'once' && days.length === 0) {
      setStatusMessage({kind: 'error', text: 'Select at least one day.'});
      return;
    }
    const startMin = parseTimeMinutes(startTime);
    const endMin = parseTimeMinutes(endTime);
    if (startMin === null || endMin === null || endMin <= startMin) {
      setStatusMessage({
        kind: 'error',
        text: 'End time must be after start time.',
      });
      return;
    }

    try {
      if (persistedGroupName) {
        updateCustomScheduleGroup({
          userId,
          oldName: persistedGroupName,
          newName: cleanGroup,
          newColor: groupColor,
        });
      }
      const count = saveCustomGroupItem({
        userId,
        groupName: cleanGroup,
        groupColor,
        title: cleanItemTitle,
        date: targetDate,
        days,
        startTime,
        endTime,
        notes,
        recurrenceMode,
      });
      setPersistedGroupName(cleanGroup);
      setItemTitle('');
      setNotes('');
      reloadGroups();
      onSaved();
      setStatusMessage({
        kind: 'success',
        text: `Added "${cleanItemTitle}" (${count} slot${
          count === 1 ? '' : 's'
        }) to ${cleanGroup}.`,
      });
    } catch (error) {
      console.error('[CustomGroupModal] Save item failed:', error);
      setStatusMessage({
        kind: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not save schedule item right now.',
      });
    }
  };

  const confirmDeleteItem = (title: string, blockIds: string[]) => {
    Alert.alert(
      'Remove Item',
      `Remove "${title}" from ${activeGroup?.name ?? groupName.trim()}?`,
      [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          try {
            deleteClassGroupFromStore(blockIds);
            reloadGroups();
            onSaved();
            setStatusMessage({
              kind: 'success',
              text: `Removed "${title}".`,
            });
          } catch (error) {
            console.error('[CustomGroupModal] Delete item failed:', error);
            setStatusMessage({
              kind: 'error',
              text: 'Could not remove item right now.',
            });
          }
        },
      },
    ]);
  };

  const confirmDeleteGroup = () => {
    if (!activeGroup) return;
    Alert.alert(
      'Delete Group',
      `Delete "${activeGroup.name}" and all ${activeGroup.totalBlocks} scheduled item${
        activeGroup.totalBlocks === 1 ? '' : 's'
      } in it?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete Group',
          style: 'destructive',
          onPress: () => {
            try {
              deleteCustomScheduleGroup(userId, activeGroup.name);
              onSaved();
              onClose();
            } catch (error) {
              console.error('[CustomGroupModal] Delete group failed:', error);
              setStatusMessage({
                kind: 'error',
                text: 'Could not delete group right now.',
              });
            }
          },
        },
      ],
    );
  };

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
          testID="custom-group-modal"
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
                  {backgroundColor: groupColor + '20'},
                ]}
              >
                <FolderPlus size={18} color={groupColor} />
              </View>
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerTitle, {color: palette.text}]}>
                  {activeGroup ? activeGroup.name : 'New Schedule Group'}
                </Text>
                <Text style={[styles.headerSubtitle, {color: palette.muted}]}>
                  {activeGroup
                    ? `${activeGroup.items.length} item${
                        activeGroup.items.length === 1 ? '' : 's'
                      } · Color-coded calendar layer`
                    : 'Group recurring events like Exams, Org, or Workout'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close schedule group"
              testID="custom-group-close-button"
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
            {/* Group Identity Card */}
            <View
              style={[
                styles.card,
                {backgroundColor: palette.card, borderColor: palette.border},
                !palette.isDarkMode && scheduleCardShadow,
              ]}
            >
              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Group Name *
              </Text>
              <TextInput
                testID="custom-group-name-input"
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    color: palette.text,
                  },
                ]}
                placeholder="e.g., USTP Org Events, Exams, Gym"
                placeholderTextColor={palette.muted}
                value={groupName}
                onChangeText={val => {
                  setStatusMessage(null);
                  setGroupName(val);
                }}
              />

              {!initialGroupName && (
                <View style={styles.chipRow}>
                  {CUSTOM_GROUP_PRESETS.map(preset => {
                    const selected =
                      groupName.trim().toLowerCase() ===
                      preset.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={preset.name}
                        onPress={() => {
                          setGroupName(preset.name);
                          setGroupColor(preset.color);
                          setStatusMessage(null);
                        }}
                        style={[
                          styles.presetChip,
                          {
                            backgroundColor: selected
                              ? preset.color
                              : palette.surface,
                            borderColor: selected
                              ? preset.color
                              : palette.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            {color: selected ? '#FFFFFF' : palette.text},
                          ]}
                        >
                          {preset.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Group Color
              </Text>
              <View style={styles.swatchRow}>
                {CUSTOM_CATEGORY_SWATCHES.map(swatch => {
                  const selected = groupColor === swatch;
                  return (
                    <TouchableOpacity
                      key={swatch}
                      testID={`custom-group-swatch-${swatch}`}
                      onPress={() => setGroupColor(swatch)}
                      style={[
                        styles.swatch,
                        {backgroundColor: swatch},
                        selected && {
                          borderColor: palette.text,
                          borderWidth: 2.5,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Select color ${swatch}`}
                    />
                  );
                })}
              </View>
            </View>

            {/* Add Item to Group Card */}
            <View
              style={[
                styles.card,
                {backgroundColor: palette.card, borderColor: palette.border},
                !palette.isDarkMode && scheduleCardShadow,
              ]}
            >
              <Text style={[styles.cardTitle, {color: palette.text}]}>
                Add Schedule Item
              </Text>

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Item Title (Optional when creating group)
              </Text>
              <TextInput
                testID="custom-group-item-title-input"
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    color: palette.text,
                  },
                ]}
                placeholder="e.g., General Assembly, Review Session"
                placeholderTextColor={palette.muted}
                value={itemTitle}
                onChangeText={val => {
                  setStatusMessage(null);
                  setItemTitle(val);
                }}
              />

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Schedule Type
              </Text>
              <View style={styles.modeRow}>
                {(
                  [
                    {key: 'once', label: 'Single Date'},
                    {key: 'weekly', label: 'Every Week'},
                    {key: 'semester', label: 'This Semester'},
                  ] as const
                ).map(opt => {
                  const active = recurrenceMode === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      testID={`custom-group-mode-${opt.key}`}
                      onPress={() => setRecurrenceMode(opt.key)}
                      style={[
                        styles.modeBtn,
                        {
                          backgroundColor: active
                            ? groupColor
                            : palette.surface,
                          borderColor: active ? groupColor : palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeBtnText,
                          {color: active ? '#FFFFFF' : palette.text},
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {recurrenceMode === 'once' ? (
                <>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Date
                  </Text>
                  <TouchableOpacity
                    testID="custom-group-date-btn"
                    onPress={() => setShowDatePicker(true)}
                    style={[
                      styles.pickerBtn,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <CalendarIcon size={14} color={groupColor} />
                    <Text style={[styles.pickerBtnText, {color: palette.text}]}>
                      {targetDate}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={new Date(`${targetDate}T12:00:00`)}
                      mode="date"
                      display="default"
                      onChange={(_e, date) => {
                        setShowDatePicker(false);
                        if (date) setTargetDate(formatLocalDate(date));
                      }}
                    />
                  )}
                </>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Quick Day Patterns
                  </Text>
                  <View style={styles.chipRow}>
                    {DAY_PATTERN_PRESETS.map(preset => {
                      const selected =
                        preset.days.length === days.length &&
                        preset.days.every(d => days.includes(d));
                      return (
                        <TouchableOpacity
                          key={preset.label}
                          onPress={() => setDays([...preset.days])}
                          style={[
                            styles.presetChip,
                            {
                              backgroundColor: selected
                                ? groupColor
                                : palette.surface,
                              borderColor: selected
                                ? groupColor
                                : palette.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.presetChipText,
                              {color: selected ? '#FFFFFF' : palette.text},
                            ]}
                          >
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Days *
                  </Text>
                  <View style={styles.chipRow}>
                    {WEEKDAY_OPTIONS.map(day => {
                      const selected = days.includes(day.key);
                      return (
                        <TouchableOpacity
                          key={day.key}
                          testID={`custom-group-day-${day.short}`}
                          onPress={() => toggleDay(day.key)}
                          style={[
                            styles.dayChip,
                            {
                              backgroundColor: selected
                                ? groupColor
                                : palette.surface,
                              borderColor: selected
                                ? groupColor
                                : palette.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayChipText,
                              {color: selected ? '#FFFFFF' : palette.text},
                            ]}
                          >
                            {day.short}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={styles.rowTwoCol}>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Start Time
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowEndPicker(false);
                      setShowStartPicker(true);
                    }}
                    style={[
                      styles.pickerBtn,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Clock size={14} color={groupColor} />
                    <Text style={[styles.pickerBtnText, {color: palette.text}]}>
                      {formatTimeForDisplay(startTime, timeFormat24h)}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    End Time
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowStartPicker(false);
                      setShowEndPicker(true);
                    }}
                    style={[
                      styles.pickerBtn,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Clock size={14} color={groupColor} />
                    <Text style={[styles.pickerBtnText, {color: palette.text}]}>
                      {formatTimeForDisplay(endTime, timeFormat24h)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {showStartPicker && (
                <DateTimePicker
                  value={timeStringToDate(startTime)}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={(_e, date) => {
                    setShowStartPicker(false);
                    if (date) setStartTime(dateToTimeString(date));
                  }}
                />
              )}
              {showEndPicker && (
                <DateTimePicker
                  value={timeStringToDate(endTime)}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={(_e, date) => {
                    setShowEndPicker(false);
                    if (date) setEndTime(dateToTimeString(date));
                  }}
                />
              )}

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Location / Notes (Optional)
              </Text>
              <TextInput
                testID="custom-group-item-notes-input"
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    color: palette.text,
                  },
                ]}
                placeholder="e.g., Gymnasium or Google Meet"
                placeholderTextColor={palette.muted}
                value={notes}
                onChangeText={setNotes}
              />

              <TouchableOpacity
                testID="custom-group-save-button"
                onPress={handleSave}
                style={[styles.saveBtn, {backgroundColor: groupColor}]}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.saveBtnText}>
                  {itemTitle.trim() ? 'Add to Group' : 'Save Group'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Items in Active Group */}
            {activeGroup && (
              <>
                <Text style={[styles.sectionTitle, {color: palette.text}]}>
                  Items in {activeGroup.name} ({activeGroup.items.length})
                </Text>

                {activeGroup.items.length === 0 ? (
                  <View
                    style={[
                      styles.emptyCard,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={[styles.emptyText, {color: palette.muted}]}>
                      No items in this group yet. Add one above!
                    </Text>
                  </View>
                ) : (
                  activeGroup.items.map((item, idx) => (
                    <View
                      key={item.key}
                      testID={`custom-group-item-${idx}`}
                      style={[
                        styles.itemCard,
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
                          {backgroundColor: item.color || groupColor},
                        ]}
                      />
                      <View style={styles.itemBody}>
                        <View style={styles.itemTopRow}>
                          <Text
                            style={[styles.itemTitle, {color: palette.text}]}
                          >
                            {item.displayTitle}
                          </Text>
                          <TouchableOpacity
                            testID={`custom-group-item-delete-${idx}`}
                            onPress={() =>
                              confirmDeleteItem(
                                item.displayTitle,
                                item.blocks.map(b => b.id),
                              )
                            }
                            style={[
                              styles.deleteIconBtn,
                              {backgroundColor: palette.dangerSoft},
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${item.displayTitle}`}
                          >
                            <Trash2 size={14} color={palette.danger} />
                          </TouchableOpacity>
                        </View>
                        <Text
                          style={[styles.itemMeta, {color: palette.muted}]}
                        >
                          {item.daysLabel} ·{' '}
                          {formatTimeForDisplay(item.startTime, timeFormat24h)}{' '}
                          - {formatTimeForDisplay(item.endTime, timeFormat24h)}
                          {item.room ? ` · ${item.room}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))
                )}

                <TouchableOpacity
                  testID="custom-group-delete-button"
                  onPress={confirmDeleteGroup}
                  style={[
                    styles.deleteGroupBtn,
                    {
                      backgroundColor: palette.dangerSoft,
                      borderColor: palette.danger + '33',
                    },
                  ]}
                >
                  <Trash2 size={15} color={palette.danger} />
                  <Text
                    style={[styles.deleteGroupText, {color: palette.danger}]}
                  >
                    Delete "{activeGroup.name}" Group
                  </Text>
                </TouchableOpacity>
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
    fontSize: 18,
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
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dayChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  dayChipText: {
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
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerBtnText: {
    fontSize: 13.5,
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  itemCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  colorStripe: {
    width: 5,
  },
  itemBody: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
  },
  deleteIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  deleteGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    marginTop: 4,
  },
  deleteGroupText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
