import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
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
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  GraduationCap,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {Colors, Shadows} from '../../../theme';
import {
  academicProfileStore,
  db,
  pickSubjectColor,
  preferencesStore,
} from '../../../../storage';
import type {AcademicProfileRecord} from '../../../../storage';
import {
  readOnboardingIdentity,
  saveOnboardingMemories,
} from '../../../../storage/onboardingMemory';
import {visionService} from '../../../../ai/vision/visionService';
import type {ParsedUstpCorResult} from '../../../../ai/vision/ustpCorParser';
import {
  dateToTimeString,
  formatTimeForDisplay,
  timeStringToDate,
} from '../utils/calendarHelpers';
import {
  buildMergedAcademicProfile,
  corResultToManualEntries,
  createEmptyClassDraft,
  DAY_PATTERN_PRESETS,
  formatDaysBadge,
  isDraftUntouched,
  manualEntriesToScheduleInputs,
  normalizeDraftToEntry,
  scannedScheduleToManualEntries,
  sortWeekdays,
  validateManualClassDraft,
  WEEKDAY_OPTIONS,
} from '../utils/classScheduleHelpers';
import type {
  ClassRecurrenceMode,
  ManualClassDraft,
  ManualClassEntry,
  ManualCorStudentInfo,
} from '../utils/classScheduleHelpers';

interface ClassScheduleModalProps {
  visible: boolean;
  userId: string;
  timeFormat24h: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_COR_INFO: ManualCorStudentInfo = {
  studentNo: '',
  program: '',
  yearLevel: '',
  section: '',
  academicTerm: '',
};

/**
 * Modal for manually entering a COR / class schedule (multi-subject batch or
 * single class) or importing subjects from a USTP COR PDF/schedule photo into
 * recurring `'Class'` time blocks.
 */
export const ClassScheduleModal: React.FC<ClassScheduleModalProps> = ({
  visible,
  userId,
  timeFormat24h,
  onClose,
  onSaved,
}) => {
  const {colors} = useTheme();
  const [mode, setMode] = useState<'manual' | 'scan'>('manual');
  const [draft, setDraft] = useState<ManualClassDraft>(() =>
    createEmptyClassDraft(),
  );
  const [entries, setEntries] = useState<ManualClassEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [existingProfile, setExistingProfile] =
    useState<AcademicProfileRecord | null>(null);
  const [scannedCor, setScannedCor] = useState<ParsedUstpCorResult | null>(
    null,
  );
  const [showCorInfo, setShowCorInfo] = useState(false);
  const [hasEditedCorInfo, setHasEditedCorInfo] = useState(false);
  const [corInfo, setCorInfo] = useState<ManualCorStudentInfo>(EMPTY_COR_INFO);
  const updateCorField = <K extends keyof ManualCorStudentInfo>(
    key: K,
    val: string,
  ) => {
    setHasEditedCorInfo(true);
    setCorInfo(prev => ({...prev, [key]: val}));
  };
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    kind: 'error' | 'success' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;
    let existing: AcademicProfileRecord | null = null;
    try {
      existing = academicProfileStore.get(userId);
    } catch {
      existing = null;
    }
    setExistingProfile(existing);
    setMode('manual');
    setEntries([]);
    setEditingEntryId(null);
    setScannedCor(null);
    setShowCorInfo(false);
    setHasEditedCorInfo(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setIsScanning(false);
    setStatusMessage(null);
    const defaultSection = existing?.section || existing?.primarySection || '';
    setCorInfo(
      existing
        ? {
            studentNo: existing.studentNo || '',
            program: existing.program || '',
            yearLevel: existing.yearLevel || '',
            section: defaultSection,
            academicTerm:
              existing.academicTerm || existing.academicYearTerm || '',
          }
        : EMPTY_COR_INFO,
    );
    setDraft(createEmptyClassDraft({section: defaultSection}));
  }, [visible, userId]);

  const toggleDay = (dayKey: string) => {
    setStatusMessage(null);
    setDraft(prev => {
      const exists = prev.days.includes(dayKey);
      const nextDays = exists
        ? prev.days.filter(d => d !== dayKey)
        : sortWeekdays([...prev.days, dayKey]);
      return {...prev, days: nextDays};
    });
  };

  const applyDayPreset = (presetDays: string[]) => {
    setStatusMessage(null);
    setDraft(prev => ({...prev, days: [...presetDays]}));
  };

  const handleAddOrUpdateSubject = () => {
    const err = validateManualClassDraft(draft);
    if (err) {
      setStatusMessage({kind: 'error', text: err});
      return;
    }
    const entry = normalizeDraftToEntry({
      ...draft,
      id: editingEntryId || draft.id,
    });
    setEntries(prev => {
      if (editingEntryId) {
        return prev.map(item => (item.id === editingEntryId ? entry : item));
      }
      return [...prev, entry];
    });
    setEditingEntryId(null);
    setDraft(
      createEmptyClassDraft({
        section: draft.section.trim() || corInfo.section.trim(),
        recurrenceMode: draft.recurrenceMode,
      }),
    );
    setStatusMessage({
      kind: 'success',
      text: editingEntryId
        ? `Updated "${entry.code ? `${entry.code} · ` : ''}${
            entry.subjectTitle
          }".`
        : `Added "${entry.code ? `${entry.code} · ` : ''}${
            entry.subjectTitle
          }" to the list.`,
    });
  };

  const handleEditQueuedEntry = (entry: ManualClassEntry) => {
    setStatusMessage(null);
    setEditingEntryId(entry.id);
    setDraft({...entry, days: [...entry.days]});
    setMode('manual');
  };

  const handleRemoveQueuedEntry = (id: string) => {
    setEntries(prev => prev.filter(item => item.id !== id));
    if (editingEntryId === id) {
      setEditingEntryId(null);
      setDraft(
        createEmptyClassDraft({
          section: corInfo.section.trim(),
        }),
      );
    }
  };

  const handleUploadUstpCor = async () => {
    if (isScanning) return;
    try {
      const picked = await visionService.pickCorDocument();
      if (!picked) return;
      setIsScanning(true);
      setStatusMessage(null);
      const cor = await visionService.scanUstpCorFromUri(picked.uri);
      if (
        !cor ||
        (cor.courses.length === 0 &&
          !cor.profile.studentNo &&
          !cor.profile.fullName)
      ) {
        setStatusMessage({
          kind: 'error',
          text: 'Could not extract USTP COR details from that file. You can try another file or enter classes manually.',
        });
        return;
      }
      const parsedEntries = corResultToManualEntries(cor);
      setScannedCor(cor);
      setEntries(prev => [...prev, ...parsedEntries]);
      const sec = cor.profile.section || cor.profile.primarySection || '';
      setCorInfo({
        studentNo: cor.profile.studentNo || '',
        program: cor.profile.program || '',
        yearLevel: cor.profile.yearLevel || '',
        section: sec,
        academicTerm: cor.profile.academicTerm || '',
      });
      if (sec) {
        setDraft(prev => ({...prev, section: prev.section || sec}));
      }
      setMode('manual');
      setStatusMessage({
        kind: 'success',
        text: `Extracted ${parsedEntries.length} class session${
          parsedEntries.length === 1 ? '' : 's'
        } from USTP COR. Review or add more below, then tap Save.`,
      });
    } catch (error) {
      console.error('[ClassScheduleModal] COR scan failed:', error);
      setStatusMessage({
        kind: 'error',
        text: 'Failed to scan COR file. Try entering your classes manually.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanSchedulePhoto = async (source: 'gallery' | 'camera') => {
    if (isScanning) return;
    try {
      const photo =
        source === 'camera'
          ? await visionService.takePhoto()
          : await visionService.pickImageFromGallery();
      if (!photo) return;
      setIsScanning(true);
      setStatusMessage(null);
      const result = await visionService.scanScheduleFromUri(photo.uri);
      if (!result || result.classes.length === 0) {
        setStatusMessage({
          kind: 'error',
          text: 'No clear class schedule was detected. Try another image or add classes manually.',
        });
        return;
      }
      const parsedEntries = scannedScheduleToManualEntries(result);
      setEntries(prev => [...prev, ...parsedEntries]);
      setMode('manual');
      setStatusMessage({
        kind: 'success',
        text: `Detected ${parsedEntries.length} recurring class${
          parsedEntries.length === 1 ? '' : 'es'
        }. Review below before saving.`,
      });
    } catch (error) {
      console.error('[ClassScheduleModal] Schedule photo scan failed:', error);
      setStatusMessage({
        kind: 'error',
        text: 'Could not scan schedule image. Try entering your classes manually.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveAll = () => {
    const includeCurrentDraft =
      !isDraftUntouched(draft) || entries.length === 0;
    let finalEntries = [...entries];

    if (includeCurrentDraft) {
      const draftErr = validateManualClassDraft(draft);
      if (draftErr) {
        setStatusMessage({kind: 'error', text: draftErr});
        return;
      }
      const normalized = normalizeDraftToEntry({
        ...draft,
        id: editingEntryId || draft.id,
      });
      if (editingEntryId) {
        finalEntries = finalEntries.map(item =>
          item.id === editingEntryId ? normalized : item,
        );
      } else {
        finalEntries.push(normalized);
      }
    }

    if (finalEntries.length === 0) {
      setStatusMessage({
        kind: 'error',
        text: 'Add at least one subject to save.',
      });
      return;
    }

    const sessions = manualEntriesToScheduleInputs(finalEntries);
    const mergedProfile =
      scannedCor || hasEditedCorInfo
        ? buildMergedAcademicProfile({
            existing: existingProfile,
            scannedCor,
            manualInfo: corInfo,
            entries: finalEntries,
          })
        : null;

    try {
      let savedSessionsCount = 0;
      let savedProfile: AcademicProfileRecord | null = null;
      db.transactionSync(tx => {
        savedSessionsCount = academicProfileStore.persistRecurringSchedule(
          userId,
          sessions,
          new Date(),
          tx,
        );
        if (mergedProfile) {
          savedProfile = academicProfileStore.save(userId, mergedProfile, tx);
        }
      });

      if (
        savedProfile &&
        (savedProfile as AcademicProfileRecord).isUstpStudent
      ) {
        try {
          const prefs = preferencesStore.get(userId);
          const ident = readOnboardingIdentity(userId);
          saveOnboardingMemories(
            userId,
            {
              preferredName:
                (savedProfile as AcademicProfileRecord).preferredName ||
                ident.preferredName,
              tone: ident.tone,
            },
            prefs.studyPeakHours,
            savedProfile,
          );
        } catch (memErr) {
          console.error(
            '[ClassScheduleModal] Failed saving COR onboarding memory:',
            memErr,
          );
        }
      }

      onSaved();
      onClose();
      Alert.alert(
        'Class Schedule Saved',
        `Scheduled ${savedSessionsCount} recurring class session${
          savedSessionsCount === 1 ? '' : 's'
        } across ${finalEntries.length} subject${
          finalEntries.length === 1 ? '' : 's'
        } in your Calendar.`,
      );
    } catch (error) {
      console.error(
        '[ClassScheduleModal] Failed saving class schedule:',
        error,
      );
      setStatusMessage({
        kind: 'error',
        text: 'Could not save your class schedule right now. Please try again.',
      });
    }
  };

  const pendingDraftReady =
    !isDraftUntouched(draft) && validateManualClassDraft(draft) === null;
  const totalReadySubjects =
    editingEntryId !== null
      ? entries.length
      : entries.length + (pendingDraftReady ? 1 : 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          testID="class-schedule-modal"
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.border,
              borderWidth: 1,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, {borderBottomColor: colors.divider}]}>
            <View style={styles.headerTitleRow}>
              <GraduationCap size={20} color={colors.blue} />
              <View style={styles.headerTextCol}>
                <Text
                  style={[styles.modalHeaderTitle, {color: colors.textPrimary}]}
                >
                  Add COR / Class Schedule
                </Text>
                <Text
                  style={[styles.modalSubtitle, {color: colors.textSecondary}]}
                >
                  Recurring weekly classes appear in Calendar & Dashboard
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close class schedule modal"
              style={styles.closeBtn}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Mode Tabs */}
          <View style={[styles.modeBar, {backgroundColor: colors.divider}]}>
            <TouchableOpacity
              testID="class-schedule-mode-manual"
              onPress={() => setMode('manual')}
              accessibilityRole="button"
              accessibilityState={{selected: mode === 'manual'}}
              style={[
                styles.modeBtn,
                mode === 'manual' && {
                  backgroundColor: colors.cardBg,
                  ...Shadows.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  {color: colors.textSecondary},
                  mode === 'manual' && {
                    color: colors.textPrimary,
                    fontWeight: 'bold',
                  },
                ]}
              >
                Manual Entry
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="class-schedule-mode-scan"
              onPress={() => setMode('scan')}
              accessibilityRole="button"
              accessibilityState={{selected: mode === 'scan'}}
              style={[
                styles.modeBtn,
                mode === 'scan' && {
                  backgroundColor: colors.cardBg,
                  ...Shadows.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  {color: colors.textSecondary},
                  mode === 'scan' && {
                    color: colors.textPrimary,
                    fontWeight: 'bold',
                  },
                ]}
              >
                Scan COR / Photo
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {statusMessage && (
              <View
                testID="class-schedule-status"
                style={[
                  styles.statusBanner,
                  {
                    backgroundColor:
                      statusMessage.kind === 'error'
                        ? colors.red + '18'
                        : colors.blue + '18',
                    borderColor:
                      statusMessage.kind === 'error' ? colors.red : colors.blue,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBannerText,
                    {
                      color:
                        statusMessage.kind === 'error'
                          ? colors.red
                          : colors.textPrimary,
                    },
                  ]}
                >
                  {statusMessage.text}
                </Text>
              </View>
            )}

            {mode === 'scan' ? (
              <View
                style={[
                  styles.scanCard,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.scanHeading, {color: colors.textPrimary}]}>
                  Import from USTP COR or Schedule Photo
                </Text>
                <Text style={[styles.scanDesc, {color: colors.textSecondary}]}>
                  Extracted classes load into your editable list so you can add
                  missing details before saving.
                </Text>

                <TouchableOpacity
                  testID="class-schedule-upload-cor"
                  accessibilityRole="button"
                  disabled={isScanning}
                  onPress={() => void handleUploadUstpCor()}
                  style={[
                    styles.scanPrimaryBtn,
                    {backgroundColor: colors.blue},
                  ]}
                >
                  {isScanning ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <FileText size={16} color="#FFFFFF" />
                      <Text style={styles.scanPrimaryBtnText}>
                        Attach USTP COR (PDF / Image)
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.scanRow}>
                  <TouchableOpacity
                    testID="class-schedule-scan-gallery"
                    accessibilityRole="button"
                    disabled={isScanning}
                    onPress={() => void handleScanSchedulePhoto('gallery')}
                    style={[
                      styles.scanSecondaryBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.cardBg,
                      },
                    ]}
                  >
                    <Upload size={15} color={colors.textPrimary} />
                    <Text
                      style={[
                        styles.scanSecondaryBtnText,
                        {color: colors.textPrimary},
                      ]}
                    >
                      Schedule Image
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="class-schedule-scan-camera"
                    accessibilityRole="button"
                    disabled={isScanning}
                    onPress={() => void handleScanSchedulePhoto('camera')}
                    style={[
                      styles.scanSecondaryBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.cardBg,
                      },
                    ]}
                  >
                    <Camera size={15} color={colors.textPrimary} />
                    <Text
                      style={[
                        styles.scanSecondaryBtnText,
                        {color: colors.textPrimary},
                      ]}
                    >
                      Take Photo
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {/* Subject Code + Section */}
                <View style={styles.twoColRow}>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Subject Code (Optional)
                    </Text>
                    <TextInput
                      testID="class-code-input"
                      style={[
                        styles.input,
                        {
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          backgroundColor: colors.inputBg,
                        },
                      ]}
                      placeholder="e.g. IT414"
                      placeholderTextColor={colors.placeholder}
                      value={draft.code}
                      onChangeText={val => {
                        setStatusMessage(null);
                        setDraft(prev => ({...prev, code: val}));
                      }}
                      autoCapitalize="characters"
                    />
                  </View>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Section (Optional)
                    </Text>
                    <TextInput
                      testID="class-section-input"
                      style={[
                        styles.input,
                        {
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          backgroundColor: colors.inputBg,
                        },
                      ]}
                      placeholder="e.g. IT4R11"
                      placeholderTextColor={colors.placeholder}
                      value={draft.section}
                      onChangeText={val => {
                        setStatusMessage(null);
                        setDraft(prev => ({...prev, section: val}));
                      }}
                    />
                  </View>
                </View>

                {/* Subject Title */}
                <Text
                  style={[styles.fieldLabel, {color: colors.textSecondary}]}
                >
                  Subject / Class Title *
                </Text>
                <TextInput
                  testID="class-title-input"
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      backgroundColor: colors.inputBg,
                    },
                  ]}
                  placeholder="e.g. Integrative Programming & Tech"
                  placeholderTextColor={colors.placeholder}
                  value={draft.subjectTitle}
                  onChangeText={val => {
                    setStatusMessage(null);
                    setDraft(prev => ({...prev, subjectTitle: val}));
                  }}
                />

                {/* Days of Week */}
                <View style={styles.daysHeaderRow}>
                  <Text
                    style={[styles.fieldLabel, {color: colors.textSecondary}]}
                  >
                    Class Days *
                  </Text>
                  <View style={styles.presetRow}>
                    {DAY_PATTERN_PRESETS.map(preset => {
                      const active =
                        preset.days.length === draft.days.length &&
                        preset.days.every(d => draft.days.includes(d));
                      return (
                        <TouchableOpacity
                          key={preset.label}
                          testID={`class-preset-${preset.label}`}
                          onPress={() => applyDayPreset(preset.days)}
                          style={[
                            styles.presetChip,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.inputBg,
                            },
                            active && {
                              borderColor: colors.blue,
                              backgroundColor: colors.blue + '22',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.presetChipText,
                              {
                                color: active
                                  ? colors.blue
                                  : colors.textSecondary,
                              },
                            ]}
                          >
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.weekdayRow}>
                  {WEEKDAY_OPTIONS.map(day => {
                    const selected = draft.days.includes(day.key);
                    return (
                      <TouchableOpacity
                        key={day.key}
                        testID={`class-day-${day.key}`}
                        accessibilityRole="checkbox"
                        accessibilityLabel={day.key}
                        accessibilityState={{checked: selected}}
                        onPress={() => toggleDay(day.key)}
                        style={[
                          styles.weekdayChip,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.inputBg,
                          },
                          selected && {
                            backgroundColor: colors.blue,
                            borderColor: colors.blue,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekdayChipText,
                            {color: colors.textSecondary},
                            selected && {color: '#FFFFFF', fontWeight: 'bold'},
                          ]}
                        >
                          {day.short}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Time Row */}
                <View style={styles.twoColRow}>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Start Time
                    </Text>
                    <TouchableOpacity
                      testID="class-start-time-btn"
                      onPress={() => setShowStartPicker(true)}
                      style={[
                        styles.timeBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.inputBg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timeBtnText,
                          {color: colors.textPrimary},
                        ]}
                      >
                        {formatTimeForDisplay(draft.startTime, timeFormat24h)}
                      </Text>
                    </TouchableOpacity>
                    {showStartPicker && (
                      <DateTimePicker
                        testID="class-start-time-picker"
                        value={timeStringToDate(draft.startTime)}
                        mode="time"
                        is24Hour={timeFormat24h}
                        display="default"
                        onChange={(_event, date) => {
                          setShowStartPicker(false);
                          if (date) {
                            setStatusMessage(null);
                            setDraft(prev => ({
                              ...prev,
                              startTime: dateToTimeString(date),
                            }));
                          }
                        }}
                      />
                    )}
                  </View>

                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      End Time
                    </Text>
                    <TouchableOpacity
                      testID="class-end-time-btn"
                      onPress={() => setShowEndPicker(true)}
                      style={[
                        styles.timeBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.inputBg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timeBtnText,
                          {color: colors.textPrimary},
                        ]}
                      >
                        {formatTimeForDisplay(draft.endTime, timeFormat24h)}
                      </Text>
                    </TouchableOpacity>
                    {showEndPicker && (
                      <DateTimePicker
                        testID="class-end-time-picker"
                        value={timeStringToDate(draft.endTime)}
                        mode="time"
                        is24Hour={timeFormat24h}
                        display="default"
                        onChange={(_event, date) => {
                          setShowEndPicker(false);
                          if (date) {
                            setStatusMessage(null);
                            setDraft(prev => ({
                              ...prev,
                              endTime: dateToTimeString(date),
                            }));
                          }
                        }}
                      />
                    )}
                  </View>
                </View>

                {/* Room + Faculty */}
                <View style={styles.twoColRow}>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Room (Optional)
                    </Text>
                    <TextInput
                      testID="class-room-input"
                      style={[
                        styles.input,
                        {
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          backgroundColor: colors.inputBg,
                        },
                      ]}
                      placeholder="e.g. 09-302"
                      placeholderTextColor={colors.placeholder}
                      value={draft.room}
                      onChangeText={val =>
                        setDraft(prev => ({...prev, room: val}))
                      }
                    />
                  </View>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Instructor (Optional)
                    </Text>
                    <TextInput
                      testID="class-faculty-input"
                      style={[
                        styles.input,
                        {
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          backgroundColor: colors.inputBg,
                        },
                      ]}
                      placeholder="e.g. Prof. Tamayo"
                      placeholderTextColor={colors.placeholder}
                      value={draft.faculty}
                      onChangeText={val =>
                        setDraft(prev => ({...prev, faculty: val}))
                      }
                    />
                  </View>
                </View>

                {/* Recurrence Mode */}
                <Text
                  style={[styles.fieldLabel, {color: colors.textSecondary}]}
                >
                  Schedule Duration
                </Text>
                <View style={styles.durationRow}>
                  {(
                    [
                      {id: 'semester', label: 'This Semester (18 wks)'},
                      {id: 'weekly', label: 'Repeat Weekly'},
                    ] as Array<{id: ClassRecurrenceMode; label: string}>
                  ).map(option => {
                    const active = draft.recurrenceMode === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        testID={`class-duration-${option.id}`}
                        onPress={() =>
                          setDraft(prev => ({
                            ...prev,
                            recurrenceMode: option.id,
                          }))
                        }
                        style={[
                          styles.durationBtn,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.inputBg,
                          },
                          active && {
                            borderColor: colors.blue,
                            backgroundColor: colors.blue + '22',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.durationBtnText,
                            {
                              color: active
                                ? colors.blue
                                : colors.textSecondary,
                            },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Add another / update list button */}
                <TouchableOpacity
                  testID="class-add-to-list-button"
                  onPress={handleAddOrUpdateSubject}
                  accessibilityRole="button"
                  style={[
                    styles.addSubjectBtn,
                    {
                      borderColor: colors.blue,
                      backgroundColor: colors.blue + '14',
                    },
                  ]}
                >
                  <Plus size={16} color={colors.blue} />
                  <Text
                    style={[styles.addSubjectBtnText, {color: colors.blue}]}
                  >
                    {editingEntryId
                      ? 'Update Subject in List'
                      : 'Add Subject & Enter Another'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Queued / Extracted Subjects List */}
            {entries.length > 0 && (
              <View style={styles.queuedSection}>
                <View style={styles.queuedHeader}>
                  <CheckCircle size={15} color={colors.success} />
                  <Text
                    style={[styles.queuedTitle, {color: colors.textPrimary}]}
                  >
                    Queued Subjects ({entries.length})
                  </Text>
                </View>

                {entries.map(entry => {
                  const accent = pickSubjectColor(
                    entry.code || entry.subjectTitle,
                  );
                  const isEditingThis = editingEntryId === entry.id;
                  const metaParts = [
                    entry.room,
                    entry.section,
                    entry.faculty,
                  ].filter(Boolean);
                  return (
                    <View
                      key={entry.id}
                      testID={`class-queued-item-${entry.id}`}
                      style={[
                        styles.queuedItem,
                        {
                          backgroundColor: colors.inputBg,
                          borderColor: isEditingThis
                            ? colors.blue
                            : colors.border,
                        },
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.queuedItemMain}
                        onPress={() => handleEditQueuedEntry(entry)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${entry.subjectTitle}`}
                      >
                        <View
                          style={[styles.colorDot, {backgroundColor: accent}]}
                        />
                        <View style={styles.queuedItemTextCol}>
                          <Text
                            style={[
                              styles.queuedItemTitle,
                              {color: colors.textPrimary},
                            ]}
                            numberOfLines={1}
                          >
                            {entry.code ? `${entry.code} · ` : ''}
                            {entry.subjectTitle}
                          </Text>
                          <Text
                            style={[
                              styles.queuedItemSub,
                              {color: colors.textSecondary},
                            ]}
                          >
                            {formatDaysBadge(entry.days)} ·{' '}
                            {formatTimeForDisplay(
                              entry.startTime,
                              timeFormat24h,
                            )}
                            –
                            {formatTimeForDisplay(entry.endTime, timeFormat24h)}
                            {metaParts.length > 0
                              ? ` · ${metaParts.join(' · ')}`
                              : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`class-remove-${entry.id}`}
                        onPress={() => handleRemoveQueuedEntry(entry.id)}
                        style={styles.queuedDeleteBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${entry.subjectTitle}`}
                      >
                        <Trash2 size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Collapsible COR / Student Details */}
            <TouchableOpacity
              testID="class-cor-info-toggle"
              onPress={() => setShowCorInfo(prev => !prev)}
              style={[
                styles.corToggleRow,
                {borderColor: colors.border, backgroundColor: colors.inputBg},
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.corToggleText, {color: colors.textPrimary}]}>
                Student / COR Details (Optional)
              </Text>
              {showCorInfo ? (
                <ChevronUp size={16} color={colors.textSecondary} />
              ) : (
                <ChevronDown size={16} color={colors.textSecondary} />
              )}
            </TouchableOpacity>

            {showCorInfo && (
              <View
                style={[
                  styles.corInfoCard,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.inputBg,
                  },
                ]}
              >
                <View style={styles.twoColRow}>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Student No.
                    </Text>
                    <TextInput
                      testID="class-cor-student-no-input"
                      style={[
                        styles.input,
                        {
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          backgroundColor: colors.cardBg,
                        },
                      ]}
                      placeholder="e.g. 2022301234"
                      placeholderTextColor={colors.placeholder}
                      value={corInfo.studentNo}
                      onChangeText={val => updateCorField('studentNo', val)}
                    />
                  </View>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Primary Section
                    </Text>
                    <TextInput
                      testID="class-cor-section-input"
                      style={[
                        styles.input,
                        {
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          backgroundColor: colors.cardBg,
                        },
                      ]}
                      placeholder="e.g. IT4R11"
                      placeholderTextColor={colors.placeholder}
                      value={corInfo.section}
                      onChangeText={val => updateCorField('section', val)}
                    />
                  </View>
                </View>

                <Text
                  style={[styles.fieldLabel, {color: colors.textSecondary}]}
                >
                  Program / Course
                </Text>
                <TextInput
                  testID="class-cor-program-input"
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      color: colors.textPrimary,
                      backgroundColor: colors.cardBg,
                    },
                  ]}
                  placeholder="e.g. BS Information Technology"
                  placeholderTextColor={colors.placeholder}
                  value={corInfo.program}
                  onChangeText={val => updateCorField('program', val)}
                />

                <View style={styles.twoColRow}>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Year Level
                    </Text>
                    <TextInput
                      testID="class-cor-year-input"
                      style={[
                        styles.input,
                        {
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          backgroundColor: colors.cardBg,
                        },
                      ]}
                      placeholder="e.g. 4th Year"
                      placeholderTextColor={colors.placeholder}
                      value={corInfo.yearLevel}
                      onChangeText={val => updateCorField('yearLevel', val)}
                    />
                  </View>
                  <View style={styles.colHalf}>
                    <Text
                      style={[styles.fieldLabel, {color: colors.textSecondary}]}
                    >
                      Academic Term
                    </Text>
                    <TextInput
                      testID="class-cor-term-input"
                      style={[
                        styles.input,
                        {
                          borderColor: colors.border,
                          color: colors.textPrimary,
                          backgroundColor: colors.cardBg,
                        },
                      ]}
                      placeholder="e.g. 1st Sem 2026-2027"
                      placeholderTextColor={colors.placeholder}
                      value={corInfo.academicTerm}
                      onChangeText={val => updateCorField('academicTerm', val)}
                    />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footerRow, {borderTopColor: colors.divider}]}>
            <TouchableOpacity
              testID="class-schedule-cancel-button"
              onPress={onClose}
              style={[styles.footerBtn, {backgroundColor: colors.divider}]}
              accessibilityRole="button"
            >
              <Text
                style={[styles.footerCancelText, {color: colors.textPrimary}]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="class-schedule-save-button"
              onPress={handleSaveAll}
              style={[
                styles.footerBtn,
                styles.footerSaveBtn,
                {backgroundColor: colors.blue},
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.footerSaveText}>
                {totalReadySubjects > 1
                  ? `Save ${totalReadySubjects} Subjects`
                  : 'Save to Calendar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    borderRadius: 16,
    width: '100%',
    maxWidth: 460,
    maxHeight: '92%',
    overflow: 'hidden',
    ...Shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerTextCol: {
    marginLeft: 10,
    flex: 1,
  },
  modalHeaderTitle: {
    fontFamily: 'sans-serif-medium',
    fontSize: 17,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  modeBar: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 18,
    marginTop: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 13,
    fontFamily: 'sans-serif',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
  },
  statusBanner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  statusBannerText: {
    fontSize: 12,
    lineHeight: 17,
  },
  scanCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  scanHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  scanDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  scanPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    marginBottom: 10,
  },
  scanPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  scanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  scanSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  scanSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  twoColRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  colHalf: {
    width: '48%',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    marginBottom: 10,
  },
  daysHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: 'row',
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },
  presetChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  weekdayChip: {
    flex: 1,
    marginHorizontal: 2,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  weekdayChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  timeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  durationBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  durationBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addSubjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 14,
  },
  addSubjectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  queuedSection: {
    marginBottom: 12,
  },
  queuedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  queuedTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  queuedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 7,
  },
  queuedItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  queuedItemTextCol: {
    flex: 1,
  },
  queuedItemTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  queuedItemSub: {
    fontSize: 11,
    marginTop: 2,
  },
  queuedDeleteBtn: {
    padding: 6,
    marginLeft: 6,
  },
  corToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  corToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  corInfoCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  footerSaveBtn: {
    minWidth: 135,
    alignItems: 'center',
  },
  footerCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerSaveText: {
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
