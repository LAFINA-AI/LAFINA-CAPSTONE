import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, ChevronLeft, Download, Sparkles, Trash2 } from 'lucide-react-native';
import {
  getModelStatus,
  downloadQwenModel,
  cancelModelDownload,
  deleteQwenModel,
  type ModelStatus,
  type ModelDownloadProgress,
} from '../../ai/nlu';
import { preferencesStore } from '../../storage';
import type {
  LongestClassGap,
  SnoozeTendency,
  StudyPeakHour,
  UserPreferences,
  WeeklyClassCount,
} from '../../storage';
import {
  getReminderPermissionStatus,
  refreshPendingReminderLeadTimes,
} from '../../scheduler';
import type { ReminderPermissionStatus } from '../../scheduler';
import { Fonts, Layout, Shadows } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { ReminderPermissionModal } from '../components/call/ReminderPermissionModal';

interface PreferencesSettingsScreenProps {
  userId: string;
  onBack: () => void;
  onSaved: (preferences: UserPreferences) => void;
}

interface PreferenceOption {
  label: string;
  value: string;
}

interface PreferenceOptionGroupProps {
  title: string;
  options: PreferenceOption[];
  selectedValues: string[];
  onSelect: (value: string) => void;
}

const WAKE_OPTIONS: PreferenceOption[] = ['05:00', '06:00', '07:00', '08:00', '09:00'].map(
  (value) => ({ label: value, value }),
);
const SLEEP_OPTIONS: PreferenceOption[] = ['21:00', '22:00', '23:00', '00:00', '01:00'].map(
  (value) => ({ label: value, value }),
);
const STUDY_OPTIONS: PreferenceOption[] = [
  { label: 'Morning', value: 'morning' },
  { label: 'Late Morning', value: 'late_morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
  { label: 'Night', value: 'night' },
];
const BUSIEST_DAY_OPTIONS: PreferenceOption[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
].map((value) => ({ label: value, value }));
const REMINDER_LEAD_OPTIONS: PreferenceOption[] = [
  { label: 'On the dot', value: '0' },
  { label: '15 min before', value: '15' },
  { label: '30 min before', value: '30' },
  { label: '1 hour before', value: '60' },
];
const SNOOZE_OPTIONS: PreferenceOption[] = [
  { label: 'Do it right away', value: 'immediate' },
  { label: 'Snooze once', value: 'snooze_once' },
  { label: 'Snooze multiple times', value: 'snooze_multiple' },
  { label: 'Often ignore', value: 'ignore' },
];
const CLASS_COUNT_OPTIONS: PreferenceOption[] = ['1-3', '4-6', '7+'].map((value) => ({
  label: `${value} classes`,
  value,
}));
const CLASS_GAP_OPTIONS: PreferenceOption[] = ['None', '30 min', '1 hour', '2+ hours'].map(
  (value) => ({ label: value, value }),
);

const PreferenceOptionGroup: React.FC<PreferenceOptionGroupProps> = ({
  title,
  options,
  selectedValues,
  onSelect,
}) => {
  const { colors } = useTheme();

  return (
    <View style={styles.optionGroup}>
      <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
                isSelected && { backgroundColor: colors.blue, borderColor: colors.blue },
              ]}
              onPress={() => onSelect(option.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.textPrimary },
                  isSelected && { color: colors.white, fontWeight: 'bold' },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export const PreferencesSettingsScreen: React.FC<PreferencesSettingsScreenProps> = ({
  userId,
  onBack,
  onSaved,
}) => {
  const initial = useMemo(() => preferencesStore.get(userId), [userId]);
  const [wakeTime, setWakeTime] = useState(initial.wakeTime);
  const [sleepTime, setSleepTime] = useState(initial.sleepTime);
  const [studyPeakHours, setStudyPeakHours] = useState<StudyPeakHour[]>(
    initial.studyPeakHours,
  );
  const [busiestDay, setBusiestDay] = useState(initial.busiestDay);
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState(
    String(initial.reminderLeadMinutes),
  );
  const [snoozeTendency, setSnoozeTendency] = useState<SnoozeTendency>(
    initial.snoozeTendency,
  );
  const [weeklyClassCount, setWeeklyClassCount] = useState<WeeklyClassCount>(
    initial.weeklyClassCount,
  );
  const [longestClassGap, setLongestClassGap] = useState<LongestClassGap>(
    initial.longestClassGap,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<ReminderPermissionStatus | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const { colors } = useTheme();

  React.useEffect(() => {
    void getModelStatus().then(setModelStatus);
  }, []);

  const handleStartDownload = async () => {
    setIsDownloading(true);
    setDownloadProgress({ bytesWritten: 0, contentLength: 397800000, percent: 0, status: 'downloading' });
    try {
      await downloadQwenModel((prog) => {
        setDownloadProgress(prog);
      });
      const updated = await getModelStatus();
      setModelStatus(updated);
      setIsDownloading(false);
      setDownloadProgress(null);
      Alert.alert('AI Model Ready', 'Qwen2.5-0.5B model is downloaded and ready for offline voice intelligence!');
    } catch (err: any) {
      setIsDownloading(false);
      setDownloadProgress(null);
      Alert.alert('Download Error', err?.message || 'Could not download model. Check internet connection.');
    }
  };

  const handleCancelDownload = async () => {
    await cancelModelDownload();
    setIsDownloading(false);
    setDownloadProgress(null);
  };

  const handleDeleteModel = () => {
    Alert.alert(
      'Remove Offline AI Model',
      'Are you sure you want to delete the on-device AI model? LAFINA will continue working using high-accuracy fast-path parsing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteQwenModel();
            const updated = await getModelStatus();
            setModelStatus(updated);
          },
        },
      ],
    );
  };

  const handleOpenPermissions = async () => {
    try {
      const status = await getReminderPermissionStatus();
      setPermissionStatus(status);
    } catch {
      // Ignore
    }
    setPermissionModalVisible(true);
  };

  const wakeOptions = useMemo(
    () =>
      WAKE_OPTIONS.some((option) => option.value === wakeTime)
        ? WAKE_OPTIONS
        : [{ label: `Current: ${wakeTime}`, value: wakeTime }, ...WAKE_OPTIONS],
    [wakeTime],
  );
  const sleepOptions = useMemo(
    () =>
      SLEEP_OPTIONS.some((option) => option.value === sleepTime)
        ? SLEEP_OPTIONS
        : [{ label: `Current: ${sleepTime}`, value: sleepTime }, ...SLEEP_OPTIONS],
    [sleepTime],
  );

  const toggleStudyPeak = (value: string): void => {
    const typedValue = value as StudyPeakHour;
    setStudyPeakHours((current) =>
      current.includes(typedValue)
        ? current.filter((entry) => entry !== typedValue)
        : [...current, typedValue],
    );
  };

  const handleSave = async (): Promise<void> => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);

    const updatedPreferences: UserPreferences = {
      wakeTime,
      sleepTime,
      studyPeakHours,
      busiestDay,
      reminderLeadMinutes: Number.parseInt(reminderLeadMinutes, 10),
      snoozeTendency,
      weeklyClassCount,
      longestClassGap,
    };

    try {
      preferencesStore.save(userId, updatedPreferences);
      const refreshResult = await refreshPendingReminderLeadTimes(
        userId,
        updatedPreferences.reminderLeadMinutes,
      );
      onSaved(updatedPreferences);
      if (refreshResult.failedCount > 0) {
        Alert.alert(
          'Preferences saved',
          `${refreshResult.failedCount} existing reminder alarm(s) could not be updated. They will be reconciled when the app starts again.`,
        );
      }
      onBack();
    } catch (saveError) {
      console.error('Failed saving preference settings:', saveError);
      setError('Preferences could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <ChevronLeft size={22} color={colors.textPrimary} />
          <Text style={[styles.backText, { color: colors.textPrimary }]}>Profile</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Preferences</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Daily routine</Text>
          <PreferenceOptionGroup
            title="Wake-up time"
            options={wakeOptions}
            selectedValues={[wakeTime]}
            onSelect={setWakeTime}
          />
          <PreferenceOptionGroup
            title="Sleep time"
            options={sleepOptions}
            selectedValues={[sleepTime]}
            onSelect={setSleepTime}
          />
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Study habits</Text>
          <PreferenceOptionGroup
            title="Peak study hours"
            options={STUDY_OPTIONS}
            selectedValues={studyPeakHours}
            onSelect={toggleStudyPeak}
          />
          <PreferenceOptionGroup
            title="Busiest day"
            options={BUSIEST_DAY_OPTIONS}
            selectedValues={[busiestDay]}
            onSelect={setBusiestDay}
          />
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Reminders</Text>
          <PreferenceOptionGroup
            title="Reminder lead time"
            options={REMINDER_LEAD_OPTIONS}
            selectedValues={[reminderLeadMinutes]}
            onSelect={setReminderLeadMinutes}
          />
          <PreferenceOptionGroup
            title="Call alarm response"
            options={SNOOZE_OPTIONS}
            selectedValues={[snoozeTendency]}
            onSelect={(value) => setSnoozeTendency(value as SnoozeTendency)}
          />
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Academic load</Text>
          <PreferenceOptionGroup
            title="Weekly classes"
            options={CLASS_COUNT_OPTIONS}
            selectedValues={[weeklyClassCount]}
            onSelect={(value) => setWeeklyClassCount(value as WeeklyClassCount)}
          />
          <PreferenceOptionGroup
            title="Longest class gap"
            options={CLASS_GAP_OPTIONS}
            selectedValues={[longestClassGap]}
            onSelect={(value) => setLongestClassGap(value as LongestClassGap)}
          />
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
              Offline Voice Intelligence
            </Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: modelStatus?.isDownloaded
                    ? 'rgba(46, 204, 113, 0.15)'
                    : 'rgba(52, 152, 219, 0.15)',
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: modelStatus?.isDownloaded ? '#2ECC71' : colors.blue },
                ]}
              >
                {modelStatus?.isDownloaded ? 'Ready (On-Device)' : 'Fast-Path Only'}
              </Text>
            </View>
          </View>

          <Text style={[styles.permissionHelperText, { color: colors.textSecondary, marginTop: 8 }]}>
            {modelStatus?.isDownloaded
              ? 'Qwen2.5-0.5B model is active on-device. Speech commands are smartly parsed offline with contextual title and parameter extraction.'
              : 'Download the lightweight on-device AI model (Qwen2.5-0.5B, ~398 MB) to enable contextual speech parsing completely offline.'}
          </Text>

          {isDownloading ? (
            <View style={styles.downloadProgressContainer}>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${downloadProgress?.percent || 0}%`, backgroundColor: colors.blue },
                  ]}
                />
              </View>
              <View style={styles.progressRow}>
                <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                  Downloading: {downloadProgress?.percent || 0}% (
                  {Math.round((downloadProgress?.bytesWritten || 0) / (1024 * 1024))} /{' '}
                  {Math.round((downloadProgress?.contentLength || 397800000) / (1024 * 1024))} MB)
                </Text>
                <TouchableOpacity onPress={() => void handleCancelDownload()}>
                  <Text style={[styles.cancelDownloadText, { color: colors.error }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : modelStatus?.isDownloaded ? (
            <View style={styles.modelActionsRow}>
              <View style={styles.modelInfoCol}>
                <Sparkles size={16} color="#2ECC71" />
                <Text style={[styles.modelSizeText, { color: colors.textSecondary }]}>
                  {Math.round((modelStatus.fileSizeBytes || 0) / (1024 * 1024))} MB on disk
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.deleteModelButton, { borderColor: colors.error }]}
                onPress={handleDeleteModel}
              >
                <Trash2 size={15} color={colors.error} />
                <Text style={[styles.deleteModelText, { color: colors.error }]}>Remove Model</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.permissionButton, { borderColor: colors.blue, marginTop: 4 }]}
              onPress={() => void handleStartDownload()}
            >
              <Download size={18} color={colors.blue} />
              <Text style={[styles.permissionButtonText, { color: colors.blue }]}>
                Download AI Model (~398 MB)
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.card, Shadows.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Device permissions</Text>
          <Text style={[styles.permissionHelperText, { color: colors.textSecondary }]}>
            Ensure notifications, exact alarms, and full-screen calls are enabled so LAFINA can remind you on schedule.
          </Text>
          <TouchableOpacity
            style={[styles.permissionButton, { borderColor: colors.blue }]}
            onPress={() => void handleOpenPermissions()}
          >
            <Bell size={18} color={colors.blue} />
            <Text style={[styles.permissionButtonText, { color: colors.blue }]}>
              Check Reminder Permissions
            </Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>}

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.blue }]}
          onPress={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={[styles.saveButtonText, { color: colors.white }]}>Save Preferences</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ReminderPermissionModal
        visible={permissionModalVisible}
        status={permissionStatus}
        onClose={() => setPermissionModalVisible(false)}
        onRefreshStatus={() => {
          void getReminderPermissionStatus().then(setPermissionStatus);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 58,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  backButton: {
    width: 90,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 90,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  card: {
    borderRadius: Layout.borderRadiusCard,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  optionGroup: {
    marginTop: 14,
  },
  optionTitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 9,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusPill,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontFamily: Fonts.body,
    fontSize: 13,
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  saveButton: {
    minHeight: 50,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: 'bold',
  },
  permissionHelperText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusButton,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  permissionButtonText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '700',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.borderRadiusPill,
  },
  badgeText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
  downloadProgressContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  progressText: {
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  cancelDownloadText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: 'bold',
  },
  modelActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modelInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modelSizeText: {
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  deleteModelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
  },
  deleteModelText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
});
