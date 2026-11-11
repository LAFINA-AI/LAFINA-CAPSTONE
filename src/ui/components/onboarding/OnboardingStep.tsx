import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Colors, Fonts, Layout, Shadows, useThemedStyles } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import type { ConversationTone } from '../../../storage/onboardingMemory';
import {
  BookOpen,

  Activity,
  Award,
  FileText,
  Camera,
  CheckCircle,
  GraduationCap,
} from 'lucide-react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type {
  LongestClassGap,
  SnoozeTendency,
  StudyPeakHour,
  WeeklyClassCount,
} from '../../../storage';
import type { ParsedUstpCorResult } from '../../../ai/vision/ustpCorParser';
import type { ParsedScheduleResult } from '../../../ai/vision/scheduleParser';

interface OnboardingStepProps {
  step: number;
  wakeTime: string;
  setWakeTime: (val: string) => void;
  sleepTime: string;
  setSleepTime: (val: string) => void;
  studyPeak: StudyPeakHour[];
  toggleStudyPeak: (val: StudyPeakHour) => void;
  busiestDay: string;
  setBusiestDay: (val: string) => void;
  reminderLead: string;
  setReminderLead: (val: string) => void;
  snoozeTendency: SnoozeTendency;
  setSnoozeTendency: (val: SnoozeTendency) => void;
  classCount: WeeklyClassCount;
  setClassCount: (val: WeeklyClassCount) => void;
  longestGap: LongestClassGap;
  setLongestGap: (val: LongestClassGap) => void;
  preferredName: string;
  setPreferredName: (value: string) => void;
  tone: ConversationTone;
  setTone: (value: ConversationTone) => void;
  memoryEnabled: boolean;
  isUstpStudent?: boolean | null;
  setIsUstpStudent?: (value: boolean) => void;
  parsedCor?: ParsedUstpCorResult | null;
  corFileName?: string | null;
  onAttachUstpCor?: () => void;
  onClearUstpCor?: () => void;
  scannedSchedule?: ParsedScheduleResult | null;
  scheduleFileName?: string | null;
  onScanScheduleGallery?: () => void;
  onScanScheduleCamera?: () => void;
  onClearScannedSchedule?: () => void;
  isScanningDocument?: boolean;
  scanStatusMessage?: string | null;
}

const studyPeakOptions: { label: string; value: StudyPeakHour }[] = [
  { label: 'Morning (6-10 AM)', value: 'morning' },
  { label: 'Late Morning (10 AM-12 PM)', value: 'late_morning' },
  { label: 'Afternoon (12-4 PM)', value: 'afternoon' },
  { label: 'Evening (4-8 PM)', value: 'evening' },
  { label: 'Night (8 PM-12 AM)', value: 'night' },
];

const busiestDayOptions = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const reminderLeadOptions = [
  { label: 'On the dot', value: '0' },
  { label: '15 min before', value: '15' },
  { label: '30 min before', value: '30' },
  { label: '1 hour before', value: '60' },
];

const snoozeTendencyOptions: { label: string; value: SnoozeTendency }[] = [
  { label: 'Do it right away', value: 'immediate' },
  { label: 'Snooze once', value: 'snooze_once' },
  { label: 'Snooze multiple times', value: 'snooze_multiple' },
  { label: 'Often ignore', value: 'ignore' },
];

const classCountOptions: WeeklyClassCount[] = ['1-3', '4-6', '7+'];
const longestGapOptions: LongestClassGap[] = ['None', '30 min', '1 hour', '2+ hours'];

const wakeTimeOptions = ['05:00', '06:00', '07:00', '08:00', '09:00'];
const sleepTimeOptions = ['21:00', '22:00', '23:00', '00:00', '01:00'];

export const OnboardingStep: React.FC<OnboardingStepProps> = ({
  step,
  wakeTime,
  setWakeTime,
  sleepTime,
  setSleepTime,
  studyPeak,
  toggleStudyPeak,
  busiestDay,
  setBusiestDay,
  reminderLead,
  setReminderLead,
  snoozeTendency,
  setSnoozeTendency,
  classCount,
  setClassCount,
  longestGap,
  setLongestGap,
  preferredName,
  setPreferredName,
  tone,
  setTone,
  memoryEnabled,
  isUstpStudent = null,
  setIsUstpStudent,
  parsedCor = null,
  corFileName = null,
  onAttachUstpCor,
  onClearUstpCor,
  scannedSchedule = null,
  scheduleFileName = null,
  onScanScheduleGallery,
  onScanScheduleCamera,
  onClearScannedSchedule,
  isScanningDocument = false,
  scanStatusMessage = null,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const [showWakePicker, setShowWakePicker] = useState(false);
  const [showSleepPicker, setShowSleepPicker] = useState(false);

  const formatTo12Hour = (time24: string): string => {
    if (!time24) return '';
    const parts = time24.split(':');
    if (parts.length < 2) return time24;
    const hour = parseInt(parts[0], 10);
    const minStr = parts[1];
    if (isNaN(hour)) return time24;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${minStr} ${ampm}`;
  };

  const getTimeDate = (timeStr: string): Date => {
    const [hours, minutes] = timeStr.split(':').map((s) => parseInt(s, 10));
    const d = new Date();
    d.setHours(hours);
    d.setMinutes(minutes);
    d.setSeconds(0);
    return d;
  };

  const isWakeCustom = !wakeTimeOptions.includes(wakeTime);
  const isSleepCustom = !sleepTimeOptions.includes(sleepTime);

  switch (step) {
    case 1:
      return (
        <View>
          <View style={styles.iconHeaderContainer}>
            <GraduationCap size={40} color={Colors.blue} />
          </View>
          <Text style={[styles.stepTitle, themed.stepTitle]}>School & Daily Routine</Text>
          <Text style={[styles.stepDesc, themed.stepDesc]}>
            Set up your class schedule automatically and tell us when your day begins and ends.
          </Text>

          {/* USTP Student Question */}
          <Text style={[styles.inputLabel, themed.inputLabel]}>Are you a USTP Student?</Text>
          <View style={styles.chipContainer}>
            <TouchableOpacity
              testID="onboarding-ustp-yes"
              accessibilityRole="radio"
              accessibilityState={{ selected: isUstpStudent === true }}
              style={[
                styles.chip,
                themed.chip,
                isUstpStudent === true && styles.activeChip,
              ]}
              onPress={() => setIsUstpStudent?.(true)}
            >
              <Text
                style={[
                  styles.chipText,
                  themed.chipText,
                  isUstpStudent === true && styles.activeChipText,
                ]}
              >
                Yes, USTP Student
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="onboarding-ustp-no"
              accessibilityRole="radio"
              accessibilityState={{ selected: isUstpStudent === false }}
              style={[
                styles.chip,
                themed.chip,
                isUstpStudent === false && styles.activeChip,
              ]}
              onPress={() => setIsUstpStudent?.(false)}
            >
              <Text
                style={[
                  styles.chipText,
                  themed.chipText,
                  isUstpStudent === false && styles.activeChipText,
                ]}
              >
                No, Another School
              </Text>
            </TouchableOpacity>
          </View>

          {/* Branch A: USTP Student -> Attach COR PDF/Image */}
          {isUstpStudent === true && (
            <View style={[styles.corBox, themed.summaryCard]}>
              <View style={styles.corHeaderRow}>
                <FileText size={18} color={Colors.blue} />
                <Text style={[styles.corBoxTitle, themed.summaryTitle]}>
                  Attach Your USTP COR (Optional)
                </Text>
              </View>
              <Text style={[styles.corBoxDesc, themed.stepDesc]}>
                Upload your USTP Certificate of Registration (PDF or screenshot). LAFINA will extract your student profile, subjects, section, rooms, and faculty into your Calendar and memory.
              </Text>

              <TouchableOpacity
                testID="onboarding-attach-cor"
                accessibilityRole="button"
                accessibilityLabel="Attach USTP COR"
                disabled={isScanningDocument}
                onPress={onAttachUstpCor}
                style={[styles.uploadButton, { backgroundColor: Colors.blue }]}
              >
                {isScanningDocument ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.uploadButtonText}>
                    {parsedCor ? 'Replace USTP COR (PDF / Image)' : 'Attach USTP COR (PDF / Image)'}
                  </Text>
                )}
              </TouchableOpacity>

              {scanStatusMessage ? (
                <Text
                  testID="onboarding-scan-status"
                  style={[styles.statusNote, { color: colors.textSecondary }]}
                >
                  {scanStatusMessage}
                </Text>
              ) : null}

              {parsedCor && (
                <View testID="onboarding-cor-preview" style={[styles.previewCard, { borderColor: colors.border }]}>
                  <View style={styles.previewHeaderRow}>
                    <View style={styles.verifiedBadge}>
                      <CheckCircle size={15} color={colors.success} />
                      <Text style={[styles.verifiedText, { color: colors.success }]}>
                        USTP COR Extracted{corFileName ? ` (${corFileName})` : ''}
                      </Text>
                    </View>
                    {onClearUstpCor && (
                      <TouchableOpacity
                        testID="onboarding-remove-cor"
                        onPress={onClearUstpCor}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.error, fontSize: 12, fontWeight: 'bold' }}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {parsedCor.profile.formattedName ? (
                    <Text style={[styles.previewDetail, themed.summaryItem]}>
                      • Name: {parsedCor.profile.formattedName}
                      {parsedCor.profile.studentNo ? ` (${parsedCor.profile.studentNo})` : ''}
                    </Text>
                  ) : null}
                  {parsedCor.profile.program ? (
                    <Text style={[styles.previewDetail, themed.summaryItem]}>
                      • Program: {parsedCor.profile.program}
                      {parsedCor.profile.yearLevelShort ? ` · ${parsedCor.profile.yearLevelShort}` : ''}
                    </Text>
                  ) : null}
                  {parsedCor.profile.college ? (
                    <Text style={[styles.previewDetail, themed.summaryItem]}>
                      • College: {parsedCor.profile.collegeShort || parsedCor.profile.college}
                      {parsedCor.profile.section ? ` · Sec ${parsedCor.profile.section}` : ''}
                    </Text>
                  ) : null}
                  {parsedCor.profile.academicTerm ? (
                    <Text style={[styles.previewDetail, themed.summaryItem]}>
                      • Term: {parsedCor.profile.academicTerm}
                      {parsedCor.profile.totalUnits ? ` (${parsedCor.profile.totalUnits} Units)` : ''}
                    </Text>
                  ) : null}

                  <Text style={[styles.previewSubheader, themed.summaryTitle]}>
                    Enrolled Subjects ({parsedCor.courses.length}):
                  </Text>
                  {parsedCor.courses.map((course) => (
                    <View key={`${course.code}-${course.section}`} style={styles.courseRow}>
                      <Text style={[styles.courseTitle, themed.summaryItem]}>
                        {course.code} — {course.title} ({course.section})
                      </Text>
                      <Text style={[styles.courseMeta, { color: colors.textSecondary }]}>
                        {course.scheduleSummary} · Prof. {course.faculty}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Branch B: Non-USTP Student -> Scan Schedule Image */}
          {isUstpStudent === false && (
            <View style={[styles.corBox, themed.summaryCard]}>
              <View style={styles.corHeaderRow}>
                <Camera size={18} color={Colors.blue} />
                <Text style={[styles.corBoxTitle, themed.summaryTitle]}>
                  Add Your Class Schedule (Optional)
                </Text>
              </View>
              <Text style={[styles.corBoxDesc, themed.stepDesc]}>
                Attach a schedule image so our OCR can set up your recurring classes now, or skip and add them manually later.
              </Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  testID="onboarding-scan-schedule-image"
                  accessibilityRole="button"
                  disabled={isScanningDocument}
                  onPress={onScanScheduleGallery}
                  style={[styles.uploadButton, styles.halfButton, { backgroundColor: Colors.blue }]}
                >
                  <Text style={styles.uploadButtonText}>Upload Schedule Image</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="onboarding-scan-schedule-camera"
                  accessibilityRole="button"
                  disabled={isScanningDocument}
                  onPress={onScanScheduleCamera}
                  style={[
                    styles.uploadButton,
                    styles.halfButton,
                    { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.uploadButtonText, { color: colors.textPrimary }]}>
                    Take Photo
                  </Text>
                </TouchableOpacity>
              </View>

              {scanStatusMessage ? (
                <Text
                  testID="onboarding-scan-status"
                  style={[styles.statusNote, { color: colors.textSecondary }]}
                >
                  {scanStatusMessage}
                </Text>
              ) : null}

              {scannedSchedule && scannedSchedule.classes.length > 0 && (
                <View testID="onboarding-schedule-preview" style={[styles.previewCard, { borderColor: colors.border }]}>
                  <View style={styles.previewHeaderRow}>
                    <View style={styles.verifiedBadge}>
                      <CheckCircle size={15} color={colors.success} />
                      <Text style={[styles.verifiedText, { color: colors.success }]}>
                        {scannedSchedule.classes.length} Recurring Classes Detected
                        {scheduleFileName ? ` (${scheduleFileName})` : ''}
                      </Text>
                    </View>
                    {onClearScannedSchedule && (
                      <TouchableOpacity
                        testID="onboarding-remove-schedule"
                        onPress={onClearScannedSchedule}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.error, fontSize: 12, fontWeight: 'bold' }}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {scannedSchedule.classes.map((cls) => (
                    <View key={cls.id} style={styles.courseRow}>
                      <Text style={[styles.courseTitle, themed.summaryItem]}>{cls.subject}</Text>
                      <Text style={[styles.courseMeta, { color: colors.textSecondary }]}>
                        {cls.days.map(d => d.slice(0, 3)).join(', ')} · {cls.startTime12}–{cls.endTime12}
                        {cls.room && cls.room !== 'TBA' ? ` · ${cls.room}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <Text style={[styles.inputLabel, themed.inputLabel]}>Typical Wake-Up Time</Text>
          <View style={styles.chipContainer}>
            {wakeTimeOptions.map((time) => (
              <TouchableOpacity
                key={time}
                style={[
                  styles.chip,
                  themed.chip,
                  wakeTime === time && styles.activeChip,
                ]}
                onPress={() => setWakeTime(time)}
              >
                <Text
                  style={[
                    styles.chipText,
                    themed.chipText,
                    wakeTime === time && styles.activeChipText,
                  ]}
                >
                  {formatTo12Hour(time)}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.chip,
                themed.chip,
                isWakeCustom && styles.activeChip,
              ]}
              onPress={() => setShowWakePicker(true)}
            >
              <Text
                style={[
                  styles.chipText,
                  themed.chipText,
                  isWakeCustom && styles.activeChipText,
                ]}
              >
                {isWakeCustom ? `Custom: ${formatTo12Hour(wakeTime)}` : 'Custom...'}
              </Text>
            </TouchableOpacity>
          </View>

          {showWakePicker && (
            <DateTimePicker
              value={getTimeDate(wakeTime)}
              mode="time"
              display="default"
              is24Hour={false}
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                setShowWakePicker(false);
                if (date) {
                  const hours = date.getHours().toString().padStart(2, '0');
                  const minutes = date.getMinutes().toString().padStart(2, '0');
                  setWakeTime(`${hours}:${minutes}`);
                }
              }}
            />
          )}

          <Text style={[styles.inputLabel, themed.inputLabel]}>Typical Sleep Time</Text>
          <View style={styles.chipContainer}>
            {sleepTimeOptions.map((time) => (
              <TouchableOpacity
                key={time}
                style={[
                  styles.chip,
                  themed.chip,
                  sleepTime === time && styles.activeChip,
                ]}
                onPress={() => setSleepTime(time)}
              >
                <Text
                  style={[
                    styles.chipText,
                    themed.chipText,
                    sleepTime === time && styles.activeChipText,
                  ]}
                >
                  {formatTo12Hour(time)}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.chip,
                themed.chip,
                isSleepCustom && styles.activeChip,
              ]}
              onPress={() => setShowSleepPicker(true)}
            >
              <Text
                style={[
                  styles.chipText,
                  themed.chipText,
                  isSleepCustom && styles.activeChipText,
                ]}
              >
                {isSleepCustom ? `Custom: ${formatTo12Hour(sleepTime)}` : 'Custom...'}
              </Text>
            </TouchableOpacity>
          </View>

          {showSleepPicker && (
            <DateTimePicker
              value={getTimeDate(sleepTime)}
              mode="time"
              display="default"
              is24Hour={false}
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                setShowSleepPicker(false);
                if (date) {
                  const hours = date.getHours().toString().padStart(2, '0');
                  const minutes = date.getMinutes().toString().padStart(2, '0');
                  setSleepTime(`${hours}:${minutes}`);
                }
              }}
            />
          )}
        </View>
      );
    case 2:
      return (
        <View>
          <View style={styles.iconHeaderContainer}>
            <BookOpen size={40} color={Colors.blue} />
          </View>
          <Text style={[styles.stepTitle, themed.stepTitle]}>Study Habits</Text>
          <Text style={[styles.stepDesc, themed.stepDesc]}>
            Tell us when you feel most productive studying.
          </Text>

          <Text style={[styles.inputLabel, themed.inputLabel]}>
            Peak Study Hours (Select multiple)
          </Text>
          <View style={styles.chipContainer}>
            {studyPeakOptions.map((option) => {
              const isSelected = studyPeak.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.chip,
                    themed.chip,
                    isSelected && styles.activeChip,
                  ]}
                  onPress={() => toggleStudyPeak(option.value)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.chipText,
                      isSelected && styles.activeChipText,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.inputLabel, themed.inputLabel]}>Your Busiest Weekday</Text>
          <View style={styles.chipContainer}>
            {busiestDayOptions.map((day) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.chip,
                  themed.chip,
                  busiestDay === day && styles.activeChip,
                ]}
                onPress={() => setBusiestDay(day)}
              >
                <Text
                  style={[
                    styles.chipText,
                    themed.chipText,
                    busiestDay === day && styles.activeChipText,
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    case 3:
      return (
        <View>
          <View style={styles.iconHeaderContainer}>
            <Activity size={40} color={Colors.blue} />
          </View>
          <Text style={[styles.stepTitle, themed.stepTitle]}>Task Reminders</Text>
          <Text style={[styles.stepDesc, themed.stepDesc]}>
            How do you react to task notifications?
          </Text>

          <Text style={[styles.inputLabel, themed.inputLabel]}>Reminder Lead Time</Text>
          <View style={styles.chipContainer}>
            {reminderLeadOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  themed.chip,
                  reminderLead === opt.value && styles.activeChip,
                ]}
                onPress={() => setReminderLead(opt.value)}
              >
                <Text
                  style={[
                    styles.chipText,
                    themed.chipText,
                    reminderLead === opt.value && styles.activeChipText,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.inputLabel, themed.inputLabel]}>
            How do you handle call alarms?
          </Text>
          <View style={styles.chipContainer}>
            {snoozeTendencyOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  themed.chip,
                  snoozeTendency === opt.value && styles.activeChip,
                ]}
                onPress={() => setSnoozeTendency(opt.value)}
              >
                <Text
                  style={[
                    styles.chipText,
                    themed.chipText,
                    snoozeTendency === opt.value && styles.activeChipText,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    case 4:
      return (
        <View>
          <View style={styles.iconHeaderContainer}>
            <Award size={40} color={Colors.blue} />
          </View>
          <Text style={[styles.stepTitle, themed.stepTitle]}>Academic Load</Text>
          <Text style={[styles.stepDesc, themed.stepDesc]}>
            Help us optimize schedule gaps for task creation.
          </Text>

          <Text style={[styles.inputLabel, themed.inputLabel]}>Weekly Class Load</Text>
          <View style={styles.chipContainer}>
            {classCountOptions.map((load) => (
              <TouchableOpacity
                key={load}
                style={[
                  styles.chip,
                  themed.chip,
                  classCount === load && styles.activeChip,
                ]}
                onPress={() => setClassCount(load)}
              >
                <Text
                  style={[
                    styles.chipText,
                    themed.chipText,
                    classCount === load && styles.activeChipText,
                  ]}
                >
                  {load} Classes
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.inputLabel, themed.inputLabel]}>Longest Class Gap</Text>
          <View style={styles.chipContainer}>
            {longestGapOptions.map((gap) => (
              <TouchableOpacity
                key={gap}
                style={[
                  styles.chip,
                  themed.chip,
                  longestGap === gap && styles.activeChip,
                ]}
                onPress={() => setLongestGap(gap)}
              >
                <Text
                  style={[
                    styles.chipText,
                    themed.chipText,
                    longestGap === gap && styles.activeChipText,
                  ]}
                >
                  {gap}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    case 5:
      return (
        <View>
          <Text style={[styles.stepTitle, themed.stepTitle]}>Make LAFINA yours</Text>
          <Text style={[styles.stepDesc, themed.stepDesc]}>
            These details are optional. They are saved in your phone's memory when it is enabled, and can be edited or removed in Profile.
          </Text>
          {!memoryEnabled ? <Text style={[styles.stepDesc, themed.stepDesc]}>Memory is off, so these details will not be saved.</Text> : null}
          <Text style={[styles.inputLabel, themed.inputLabel]}>What should LAFINA call you?</Text>
          <TextInput testID="onboarding-preferred-name" accessibilityLabel="Preferred name" value={preferredName}
            onChangeText={setPreferredName} maxLength={60} placeholder="Your preferred name" placeholderTextColor={colors.textMuted}
            editable={memoryEnabled} style={[styles.nameInput, themed.chip, themed.chipText]} />
          <Text style={[styles.inputLabel, themed.inputLabel]}>How should LAFINA talk?</Text>
          <View style={styles.chipContainer}>
            {(['casual', 'professional'] as const).map(value => (
              <TouchableOpacity key={value} testID={`onboarding-tone-${value}`} accessibilityRole="radio"
                accessibilityState={{selected:tone === value, disabled:!memoryEnabled}} disabled={!memoryEnabled}
                onPress={() => setTone(tone === value ? '' : value)} style={[styles.chip, themed.chip, tone === value && styles.activeChip]}>
                <Text style={[styles.chipText, themed.chipText, tone === value && styles.activeChipText]}>{value === 'casual' ? 'Casual' : 'Professional'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    case 6:
      return (
        <View style={styles.finishContainer}>
          <View style={[styles.iconCircle, themed.iconCircle, Shadows.card]}>
            <Award size={50} color={colors.success} />
          </View>
          <Text style={[styles.stepTitle, themed.stepTitle]}>Ready to Sync</Text>
          <Text style={[styles.stepDesc, themed.stepDesc]}>
            We've created a baseline configuration. LAFINA will now learn from your daily schedule
            choices, phone call reminder responses, and voice scheduler tasks to offer adaptive
            scheduling.
          </Text>

          <View style={[styles.summaryCard, themed.summaryCard]}>
            <Text style={[styles.summaryTitle, themed.summaryTitle]}>Configuration Baseline</Text>
            {parsedCor ? (
              <>
                <Text style={[styles.summaryItem, themed.summaryItem]}>
                  • USTP Student: {parsedCor.profile.formattedName || parsedCor.profile.fullName}
                  {parsedCor.profile.studentNo ? ` (${parsedCor.profile.studentNo})` : ''}
                </Text>
                <Text style={[styles.summaryItem, themed.summaryItem]}>
                  • Program: {parsedCor.profile.program}
                  {parsedCor.profile.yearLevelShort ? ` · ${parsedCor.profile.yearLevelShort}` : ''}
                </Text>
                <Text style={[styles.summaryItem, themed.summaryItem]}>
                  • COR Schedule: {parsedCor.sessions.length} weekly class sessions ({parsedCor.courses.length} subjects)
                </Text>
              </>
            ) : scannedSchedule && scannedSchedule.classes.length > 0 ? (
              <Text style={[styles.summaryItem, themed.summaryItem]}>
                • Scanned Schedule: {scannedSchedule.classes.length} recurring weekly classes
              </Text>
            ) : null}
            <Text style={[styles.summaryItem, themed.summaryItem]}>
              • Sleep Cycle: {formatTo12Hour(wakeTime)} - {formatTo12Hour(sleepTime)}
            </Text>
            <Text style={[styles.summaryItem, themed.summaryItem]}>
              • Study Preference: {studyPeak.length > 0 ? studyPeak.join(', ') : 'Flexible'}
            </Text>
            <Text style={[styles.summaryItem, themed.summaryItem]}>
              • Reminder Lead: {reminderLead} minutes
            </Text>
            <Text style={[styles.summaryItem, themed.summaryItem]}>
              • Class Gap Slots: {longestGap}
            </Text>
          </View>
        </View>
      );
    default:
      return null;
  }
};

const styles = StyleSheet.create({
  nameInput: {borderWidth: 1.5, borderRadius: Layout.borderRadiusCard, paddingHorizontal: 14, paddingVertical: 10, fontFamily: Fonts.body, fontSize: 15},
  iconHeaderContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  stepTitle: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  stepDesc: {
    fontFamily: Fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 20,
  },
  inputLabel: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 14,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusPill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  activeChip: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blue,
  },
  chipText: {
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  activeChipText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  corBox: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusCard,
    padding: 14,
    marginBottom: 10,
  },
  corHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  corBoxTitle: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: 'bold',
  },
  corBoxDesc: {
    fontFamily: Fonts.body,
    fontSize: 12,
    textAlign: 'left',
    marginTop: 0,
    marginBottom: 12,
    lineHeight: 17,
  },
  uploadButton: {
    borderRadius: Layout.borderRadiusPill,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  halfButton: {
    flex: 1,
  },
  statusNote: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 8,
  },
  previewCard: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  verifiedText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: 'bold',
  },
  previewDetail: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginBottom: 2,
  },
  previewSubheader: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  courseRow: {
    marginBottom: 6,
  },
  courseTitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: 'bold',
  },
  courseMeta: {
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  finishContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryCard: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusCard,
    padding: 16,
    width: '100%',
    marginTop: 8,
  },
  summaryTitle: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  summaryItem: {
    fontFamily: Fonts.body,
    fontSize: 13,
    marginBottom: 4,
  },
});

const getThemedStyles = (colors: ThemeColors, isDarkMode: boolean) => ({
  stepTitle: {
    color: colors.textPrimary,
  },
  stepDesc: {
    color: colors.textSecondary,
  },
  inputLabel: {
    color: colors.textPrimary,
  },
  chip: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.textPrimary,
  },
  iconCircle: {
    backgroundColor: isDarkMode ? 'rgba(46, 204, 113, 0.15)' : '#E8F8F0',
  },
  summaryCard: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  summaryTitle: {
    color: colors.textPrimary,
  },
  summaryItem: {
    color: colors.textPrimary,
  },
});
