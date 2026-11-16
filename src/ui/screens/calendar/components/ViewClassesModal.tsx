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
  BookOpen,
  Clock,
  GraduationCap,
  Hash,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {
  academicProfileStore,
  timeBlocksStore,
  type AcademicProfileRecord,
} from '../../../../storage';
import {
  dateToTimeString,
  formatTimeForDisplay,
  timeStringToDate,
} from '../utils/calendarHelpers';
import {
  DAY_PATTERN_PRESETS,
  deleteClassGroupFromStore,
  groupClassBlocks,
  groupedClassToDraft,
  sortWeekdays,
  updateClassGroupInStore,
  validateManualClassDraft,
  WEEKDAY_OPTIONS,
  type ClassRecurrenceMode,
  type GroupedClassSchedule,
  type ManualClassDraft,
} from '../utils/classScheduleHelpers';
import {useSchedulePalette, scheduleCardShadow} from './schedulePalette';

export interface ViewClassesModalProps {
  visible: boolean;
  userId: string;
  refreshTrigger?: number;
  timeFormat24h: boolean;
  onClose: () => void;
  onChanged: () => void;
  onAddClassSchedule: () => void;
}

/**
 * Student-focused manager for viewing, filtering, editing, and removing
 * repeating class schedules added via USTP COR scan or manual class entry.
 */
export const ViewClassesModal: React.FC<ViewClassesModalProps> = ({
  visible,
  userId,
  refreshTrigger = 0,
  timeFormat24h,
  onClose,
  onChanged,
  onAddClassSchedule,
}) => {
  const {colors} = useTheme();
  const palette = useSchedulePalette();

  const [profile, setProfile] = useState<AcademicProfileRecord | null>(null);
  const [rawBlocks, setRawBlocks] = useState(() => {
    try {
      return timeBlocksStore.getAll(userId);
    } catch {
      return [];
    }
  });
  const [search, setSearch] = useState('');
  const [editingGroup, setEditingGroup] = useState<GroupedClassSchedule | null>(
    null,
  );
  const [draft, setDraft] = useState<ManualClassDraft | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  const reloadRawBlocks = () => {
    try {
      setRawBlocks(timeBlocksStore.getAll(userId));
    } catch {
      setRawBlocks([]);
    }
  };

  useEffect(() => {
    if (!visible) return;
    try {
      setProfile(academicProfileStore.get(userId));
    } catch {
      setProfile(null);
    }
    try {
      setRawBlocks(timeBlocksStore.getAll(userId));
    } catch {
      setRawBlocks([]);
    }
    setSearch('');
    setEditingGroup(null);
    setDraft(null);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setStatusMessage(null);
  }, [visible, userId, refreshTrigger]);

  const classGroups = useMemo(() => groupClassBlocks(rawBlocks), [rawBlocks]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classGroups;
    return classGroups.filter(item =>
      [
        item.code,
        item.subjectTitle,
        item.daysLabel,
        item.room,
        item.section,
        item.faculty,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [classGroups, search]);

  const totalWeeklySlots = useMemo(
    () => classGroups.reduce((sum, g) => sum + g.blocks.length, 0),
    [classGroups],
  );

  const profileHeadline = useMemo(() => {
    if (!profile) return null;
    const parts = [
      profile.program,
      profile.section || profile.primarySection,
      profile.academicTerm || profile.academicYearTerm,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [profile]);

  const startEditing = (group: GroupedClassSchedule) => {
    setStatusMessage(null);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setEditingGroup(group);
    setDraft(groupedClassToDraft(group));
  };

  const cancelEditing = () => {
    setEditingGroup(null);
    setDraft(null);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setStatusMessage(null);
  };

  const toggleDraftDay = (dayKey: string) => {
    setStatusMessage(null);
    setDraft(prev => {
      if (!prev) return prev;
      const exists = prev.days.includes(dayKey);
      return {
        ...prev,
        days: exists
          ? prev.days.filter(d => d !== dayKey)
          : sortWeekdays([...prev.days, dayKey]),
      };
    });
  };

  const applyDraftPreset = (days: string[]) => {
    setStatusMessage(null);
    setDraft(prev => (prev ? {...prev, days: [...days]} : prev));
  };

  const handleSaveEdit = () => {
    if (!editingGroup || !draft) return;
    const err = validateManualClassDraft(draft);
    if (err) {
      setStatusMessage({kind: 'error', text: err});
      return;
    }

    try {
      updateClassGroupInStore({
        userId,
        group: editingGroup,
        draft,
      });
      const updatedTitle = draft.code.trim()
        ? `${draft.code.trim()} · ${draft.subjectTitle.trim()}`
        : draft.subjectTitle.trim();
      setEditingGroup(null);
      setDraft(null);
      setShowStartPicker(false);
      setShowEndPicker(false);
      setStatusMessage({
        kind: 'success',
        text: `Updated "${updatedTitle}".`,
      });
      reloadRawBlocks();
      onChanged();
    } catch (error) {
      console.error('[ViewClassesModal] Failed updating class:', error);
      setStatusMessage({
        kind: 'error',
        text: 'Could not update this class right now. Please try again.',
      });
    }
  };

  const confirmDeleteGroup = (group: GroupedClassSchedule) => {
    const slotCount = group.blocks.length;
    Alert.alert(
      'Remove Class',
      `Remove "${group.displayTitle}" (${group.daysLabel}, ${slotCount} weekly slot${
        slotCount === 1 ? '' : 's'
      }) from your schedule?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            try {
              deleteClassGroupFromStore(group.blocks.map(b => b.id));
              setStatusMessage({
                kind: 'success',
                text: `Removed "${group.displayTitle}".`,
              });
              reloadRawBlocks();
              onChanged();
            } catch (error) {
              console.error('[ViewClassesModal] Failed deleting class:', error);
              setStatusMessage({
                kind: 'error',
                text: 'Could not remove that class right now.',
              });
            }
          },
        },
      ],
    );
  };

  const confirmClearAll = () => {
    const allIds = classGroups.flatMap(g => g.blocks.map(b => b.id));
    if (allIds.length === 0) return;
    Alert.alert(
      'Remove All Repeating Classes',
      `Remove all ${classGroups.length} classes (${allIds.length} scheduled sessions) from your Calendar?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove All',
          style: 'destructive',
          onPress: () => {
            try {
              deleteClassGroupFromStore(allIds);
              setStatusMessage({
                kind: 'success',
                text: 'Cleared all repeating classes from your schedule.',
              });
              reloadRawBlocks();
              onChanged();
            } catch (error) {
              console.error(
                '[ViewClassesModal] Failed clearing all classes:',
                error,
              );
              setStatusMessage({
                kind: 'error',
                text: 'Could not clear classes right now.',
              });
            }
          },
        },
      ],
    );
  };

  const isEditing = editingGroup !== null && draft !== null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={isEditing ? cancelEditing : onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          testID="view-classes-modal"
          style={[
            styles.sheet,
            {
              backgroundColor: palette.bg,
              borderColor: palette.border,
            },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: palette.card,
                borderBottomColor: palette.border,
              },
            ]}
          >
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.headerIconBadge,
                  {backgroundColor: palette.accent + '18'},
                ]}
              >
                <BookOpen size={18} color={palette.accent} />
              </View>
              <View style={styles.headerTextCol}>
                <Text style={[styles.headerTitle, {color: palette.text}]}>
                  {isEditing ? 'Edit Class' : 'My Classes'}
                </Text>
                <Text style={[styles.headerSubtitle, {color: palette.muted}]}>
                  {isEditing
                    ? editingGroup.displayTitle
                    : `${classGroups.length} repeating class${
                        classGroups.length === 1 ? '' : 'es'
                      } · ${totalWeeklySlots} weekly slot${
                        totalWeeklySlots === 1 ? '' : 's'
                      }`}
                </Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              {!isEditing && (
                <TouchableOpacity
                  testID="view-classes-add-button"
                  style={[styles.addPillBtn, {backgroundColor: palette.accent}]}
                  onPress={() => {
                    onClose();
                    onAddClassSchedule();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Add COR or class schedule"
                >
                  <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.addPillText}>Add</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={isEditing ? cancelEditing : onClose}
                accessibilityRole="button"
                accessibilityLabel={
                  isEditing ? 'Cancel editing class' : 'Close my classes'
                }
                style={[
                  styles.closeBtn,
                  {backgroundColor: palette.surface},
                ]}
              >
                <X size={18} color={palette.muted} />
              </TouchableOpacity>
            </View>
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

          {isEditing ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.editContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.rowTwoCol}>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Course Code
                  </Text>
                  <TextInput
                    testID="view-class-edit-code"
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                        color: palette.text,
                      },
                    ]}
                    placeholder="e.g., IT311"
                    placeholderTextColor={palette.muted}
                    value={draft.code}
                    onChangeText={val => {
                      setStatusMessage(null);
                      setDraft(prev => (prev ? {...prev, code: val} : prev));
                    }}
                  />
                </View>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Section
                  </Text>
                  <TextInput
                    testID="view-class-edit-section"
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                        color: palette.text,
                      },
                    ]}
                    placeholder="e.g., IT3R1"
                    placeholderTextColor={palette.muted}
                    value={draft.section}
                    onChangeText={val => {
                      setStatusMessage(null);
                      setDraft(prev => (prev ? {...prev, section: val} : prev));
                    }}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Subject Title *
              </Text>
              <TextInput
                testID="view-class-edit-title"
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.card,
                    borderColor: palette.border,
                    color: palette.text,
                  },
                ]}
                placeholder="e.g., Systems Integration"
                placeholderTextColor={palette.muted}
                value={draft.subjectTitle}
                onChangeText={val => {
                  setStatusMessage(null);
                  setDraft(prev =>
                    prev ? {...prev, subjectTitle: val} : prev,
                  );
                }}
              />

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Quick Day Patterns
              </Text>
              <View style={styles.chipRow}>
                {DAY_PATTERN_PRESETS.map(preset => {
                  const selected =
                    preset.days.length === draft.days.length &&
                    preset.days.every(d => draft.days.includes(d));
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      testID={`view-class-edit-preset-${preset.label}`}
                      onPress={() => applyDraftPreset(preset.days)}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: selected
                            ? palette.accent
                            : palette.card,
                          borderColor: selected
                            ? palette.accent
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
                Class Days *
              </Text>
              <View style={styles.chipRow}>
                {WEEKDAY_OPTIONS.map(day => {
                  const selected = draft.days.includes(day.key);
                  return (
                    <TouchableOpacity
                      key={day.key}
                      testID={`view-class-edit-day-${day.short}`}
                      onPress={() => toggleDraftDay(day.key)}
                      accessibilityRole="button"
                      accessibilityState={{selected}}
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: selected
                            ? palette.accent
                            : palette.card,
                          borderColor: selected
                            ? palette.accent
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

              <View style={styles.rowTwoCol}>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Start Time
                  </Text>
                  <TouchableOpacity
                    testID="view-class-edit-start-time"
                    style={[
                      styles.timeBtn,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                      },
                    ]}
                    onPress={() => {
                      setShowEndPicker(false);
                      setShowStartPicker(true);
                    }}
                  >
                    <Clock size={14} color={palette.accent} />
                    <Text style={[styles.timeBtnText, {color: palette.text}]}>
                      {formatTimeForDisplay(draft.startTime, timeFormat24h)}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    End Time
                  </Text>
                  <TouchableOpacity
                    testID="view-class-edit-end-time"
                    style={[
                      styles.timeBtn,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                      },
                    ]}
                    onPress={() => {
                      setShowStartPicker(false);
                      setShowEndPicker(true);
                    }}
                  >
                    <Clock size={14} color={palette.accent} />
                    <Text style={[styles.timeBtnText, {color: palette.text}]}>
                      {formatTimeForDisplay(draft.endTime, timeFormat24h)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {showStartPicker && (
                <DateTimePicker
                  value={timeStringToDate(draft.startTime)}
                  mode="time"
                  is24Hour={timeFormat24h}
                  display="default"
                  onChange={(_ev, selectedDate) => {
                    setShowStartPicker(false);
                    if (selectedDate) {
                      setStatusMessage(null);
                      setDraft(prev =>
                        prev
                          ? {...prev, startTime: dateToTimeString(selectedDate)}
                          : prev,
                      );
                    }
                  }}
                />
              )}

              {showEndPicker && (
                <DateTimePicker
                  value={timeStringToDate(draft.endTime)}
                  mode="time"
                  is24Hour={timeFormat24h}
                  display="default"
                  onChange={(_ev, selectedDate) => {
                    setShowEndPicker(false);
                    if (selectedDate) {
                      setStatusMessage(null);
                      setDraft(prev =>
                        prev
                          ? {...prev, endTime: dateToTimeString(selectedDate)}
                          : prev,
                      );
                    }
                  }}
                />
              )}

              <View style={styles.rowTwoCol}>
                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Room
                  </Text>
                  <TextInput
                    testID="view-class-edit-room"
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                        color: palette.text,
                      },
                    ]}
                    placeholder="e.g., 09-301"
                    placeholderTextColor={palette.muted}
                    value={draft.room}
                    onChangeText={val => {
                      setStatusMessage(null);
                      setDraft(prev => (prev ? {...prev, room: val} : prev));
                    }}
                  />
                </View>

                <View style={styles.colHalf}>
                  <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                    Faculty / Instructor
                  </Text>
                  <TextInput
                    testID="view-class-edit-faculty"
                    style={[
                      styles.input,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.border,
                        color: palette.text,
                      },
                    ]}
                    placeholder="e.g., Prof. Tamayo"
                    placeholderTextColor={palette.muted}
                    value={draft.faculty}
                    onChangeText={val => {
                      setStatusMessage(null);
                      setDraft(prev => (prev ? {...prev, faculty: val} : prev));
                    }}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, {color: palette.muted}]}>
                Repeat Duration
              </Text>
              <View style={styles.chipRow}>
                {(
                  [
                    {key: 'semester', label: 'Every Semester'},
                    {key: 'weekly', label: 'Every Week'},
                  ] as ReadonlyArray<{key: ClassRecurrenceMode; label: string}>
                ).map(opt => {
                  const selected = draft.recurrenceMode === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() =>
                        setDraft(prev =>
                          prev ? {...prev, recurrenceMode: opt.key} : prev,
                        )
                      }
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: selected
                            ? palette.accent
                            : palette.card,
                          borderColor: selected
                            ? palette.accent
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
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.editActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.editCancelBtn,
                    {backgroundColor: palette.surface},
                  ]}
                  onPress={cancelEditing}
                >
                  <Text style={[styles.editCancelText, {color: palette.text}]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="view-class-edit-save"
                  style={[styles.editSaveBtn, {backgroundColor: palette.accent}]}
                  onPress={handleSaveEdit}
                >
                  <Text style={styles.editSaveText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {profileHeadline ? (
                <View
                  style={[
                    styles.profileCard,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.border,
                    },
                    !palette.isDarkMode && scheduleCardShadow,
                  ]}
                >
                  <GraduationCap size={17} color={colors.blue} />
                  <Text
                    style={[styles.profileText, {color: palette.text}]}
                    numberOfLines={2}
                  >
                    {profileHeadline}
                  </Text>
                </View>
              ) : null}

              {classGroups.length >= 3 && (
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
                    testID="view-classes-search"
                    style={[styles.searchInput, {color: palette.text}]}
                    placeholder="Filter by subject, code, room, or faculty..."
                    placeholderTextColor={palette.muted}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <X size={15} color={palette.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {filteredGroups.length === 0 ? (
                <View
                  testID="view-classes-empty"
                  style={[
                    styles.emptyCard,
                    {
                      backgroundColor: palette.card,
                      borderColor: palette.border,
                    },
                    !palette.isDarkMode && scheduleCardShadow,
                  ]}
                >
                  <BookOpen size={28} color={palette.accent} />
                  <Text style={[styles.emptyTitle, {color: palette.text}]}>
                    {classGroups.length === 0
                      ? 'No repeating classes yet'
                      : 'No classes match your filter'}
                  </Text>
                  <Text style={[styles.emptyDesc, {color: palette.muted}]}>
                    {classGroups.length === 0
                      ? 'Scan your USTP COR or add recurring classes manually to view, edit, or remove them anytime.'
                      : 'Try clearing the search query to see all repeating classes.'}
                  </Text>
                  {classGroups.length === 0 && (
                    <TouchableOpacity
                      testID="view-classes-empty-add"
                      style={[
                        styles.emptyCtaBtn,
                        {backgroundColor: palette.accent},
                      ]}
                      onPress={() => {
                        onClose();
                        onAddClassSchedule();
                      }}
                    >
                      <GraduationCap size={16} color="#FFFFFF" />
                      <Text style={styles.emptyCtaText}>
                        Add COR / Class Schedule
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                filteredGroups.map((group, index) => (
                  <View
                    key={group.key}
                    testID={`view-class-card-${index}`}
                    style={[
                      styles.classCard,
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
                        {backgroundColor: group.color},
                      ]}
                    />
                    <View style={styles.classCardBody}>
                      <View style={styles.classCardTopRow}>
                        <View style={styles.badgesWrap}>
                          {group.code ? (
                            <View
                              style={[
                                styles.codeBadge,
                                {backgroundColor: group.color + '1D'},
                              ]}
                            >
                              <Text
                                style={[
                                  styles.codeBadgeText,
                                  {color: group.color},
                                ]}
                              >
                                {group.code}
                              </Text>
                            </View>
                          ) : null}
                          <View
                            style={[
                              styles.modeBadge,
                              {backgroundColor: palette.surface},
                            ]}
                          >
                            <Text
                              style={[
                                styles.modeBadgeText,
                                {color: palette.muted},
                              ]}
                            >
                              {group.recurrenceMode === 'weekly'
                                ? 'Weekly'
                                : 'Semester'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            testID={`view-class-edit-${index}`}
                            style={[
                              styles.cardActionBtn,
                              {backgroundColor: palette.surface},
                            ]}
                            onPress={() => startEditing(group)}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${group.displayTitle}`}
                          >
                            <Pencil size={13} color={palette.accent} />
                            <Text
                              style={[
                                styles.cardActionLabel,
                                {color: palette.accent},
                              ]}
                            >
                              Edit
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`view-class-delete-${index}`}
                            style={[
                              styles.cardDeleteBtn,
                              {backgroundColor: palette.dangerSoft},
                            ]}
                            onPress={() => confirmDeleteGroup(group)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${group.displayTitle}`}
                          >
                            <Trash2 size={14} color={palette.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={[styles.subjectTitle, {color: palette.text}]}>
                        {group.subjectTitle}
                      </Text>

                      <View style={styles.detailsGrid}>
                        <View style={styles.detailRow}>
                          <Clock size={13} color={palette.accent} />
                          <Text
                            style={[styles.detailText, {color: palette.text}]}
                          >
                            {`${group.daysLabel} · ${formatTimeForDisplay(
                              group.startTime,
                              timeFormat24h,
                            )} – ${formatTimeForDisplay(
                              group.endTime,
                              timeFormat24h,
                            )}`}
                          </Text>
                        </View>

                        {group.room ? (
                          <View style={styles.detailRow}>
                            <MapPin size={13} color={palette.muted} />
                            <Text
                              style={[
                                styles.detailText,
                                {color: palette.muted},
                              ]}
                            >
                              {`Room ${group.room}`}
                            </Text>
                          </View>
                        ) : null}

                        {group.section ? (
                          <View style={styles.detailRow}>
                            <Hash size={13} color={palette.muted} />
                            <Text
                              style={[
                                styles.detailText,
                                {color: palette.muted},
                              ]}
                            >
                              {`Section ${group.section}`}
                            </Text>
                          </View>
                        ) : null}

                        {group.faculty ? (
                          <View style={styles.detailRow}>
                            <User size={13} color={palette.muted} />
                            <Text
                              style={[
                                styles.detailText,
                                {color: palette.muted},
                              ]}
                            >
                              {group.faculty}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))
              )}

              {classGroups.length > 0 && (
                <TouchableOpacity
                  testID="view-classes-clear-all"
                  style={[
                    styles.clearAllBtn,
                    {
                      backgroundColor: palette.dangerSoft,
                      borderColor: palette.danger + '33',
                    },
                  ]}
                  onPress={confirmClearAll}
                  accessibilityRole="button"
                >
                  <Trash2 size={14} color={palette.danger} />
                  <Text style={[styles.clearAllText, {color: palette.danger}]}>
                    Remove All Repeating Classes
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
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
    height: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  addPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  editContent: {
    padding: 16,
    paddingBottom: 36,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  profileText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 32,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 16,
    marginTop: 6,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  classCard: {
    flexDirection: 'row',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  colorStripe: {
    width: 5,
  },
  classCardBody: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  classCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  codeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
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
    paddingVertical: 6,
    borderRadius: 10,
  },
  cardActionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardDeleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  detailsGrid: {
    gap: 5,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  detailText: {
    fontSize: 13,
    fontWeight: '500',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  clearAllText: {
    fontSize: 13,
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
    paddingVertical: 10,
    fontSize: 14,
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
    gap: 8,
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dayChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  timeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  editCancelBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  editCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  editSaveBtn: {
    flex: 1.5,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  editSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
