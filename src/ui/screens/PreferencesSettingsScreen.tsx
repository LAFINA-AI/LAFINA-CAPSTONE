import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Bell,
  Check,
  ChevronLeft,
  Download,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import {
  OFFLINE_MODEL_CATALOG,
  getAllModelsStatus,
  getSelectedOfflineModelId,
  setSelectedOfflineModelId,
  downloadOfflineModel,
  cancelModelDownload,
  deleteOfflineModel,
  getDeviceAiRecommendation,
  OFFLINE_ENGINE_UNAVAILABLE_MESSAGE,
  type OfflineModelId,
  type DownloadableOfflineModelId,
  type ModelStatus,
  type DeviceAiRecommendation,
} from '../../ai/nlu';
import {
  useOfflineModelEngine,
  useSharedModelDownload,
} from '../hooks/useOfflineModels';
import {preferencesStore} from '../../storage';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {SETTING_KEY_ADAPTIVE_TIMING} from '../../ai/ml';
import type {
  LongestClassGap,
  SnoozeTendency,
  StudyPeakHour,
  UserPreferences,
  WeeklyClassCount,
} from '../../storage';
import {
  getAlarmHealth,
  getReminderPermissionStatus,
  refreshPendingReminderLeadTimes,
} from '../../scheduler';
import type {AlarmHealth, ReminderPermissionStatus} from '../../scheduler';
import {
  Fonts,
  Layout,
  ModernLayout,
  Shadows,
} from '../theme';
import {mixColors} from '../theme/colorMix';
import {useTheme} from '../contexts/ThemeContext';
import {ReminderPermissionModal} from '../components/call/ReminderPermissionModal';

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

const WAKE_OPTIONS: PreferenceOption[] = [
  '05:00',
  '06:00',
  '07:00',
  '08:00',
  '09:00',
].map(value => ({label: formatTo12Hour(value), value}));
const SLEEP_OPTIONS: PreferenceOption[] = [
  '21:00',
  '22:00',
  '23:00',
  '00:00',
  '01:00',
].map(value => ({label: formatTo12Hour(value), value}));
const STUDY_OPTIONS: PreferenceOption[] = [
  {label: 'Morning', value: 'morning'},
  {label: 'Late Morning', value: 'late_morning'},
  {label: 'Afternoon', value: 'afternoon'},
  {label: 'Evening', value: 'evening'},
  {label: 'Night', value: 'night'},
];
const BUSIEST_DAY_OPTIONS: PreferenceOption[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
].map(value => ({label: value, value}));
const REMINDER_LEAD_OPTIONS: PreferenceOption[] = [
  {label: 'On the dot', value: '0'},
  {label: '15 min before', value: '15'},
  {label: '30 min before', value: '30'},
  {label: '1 hour before', value: '60'},
];
const SNOOZE_OPTIONS: PreferenceOption[] = [
  {label: 'Do it right away', value: 'immediate'},
  {label: 'Snooze once', value: 'snooze_once'},
  {label: 'Snooze multiple times', value: 'snooze_multiple'},
  {label: 'Often ignore', value: 'ignore'},
];
const CLASS_COUNT_OPTIONS: PreferenceOption[] = ['1-3', '4-6', '7+'].map(
  value => ({
    label: `${value} classes`,
    value,
  }),
);
const CLASS_GAP_OPTIONS: PreferenceOption[] = [
  'None',
  '30 min',
  '1 hour',
  '2+ hours',
].map(value => ({label: value, value}));

const PreferenceOptionGroup: React.FC<PreferenceOptionGroupProps> = ({
  title,
  options,
  selectedValues,
  onSelect,
}) => {
  const {colors, isModern, modernPalette} = useTheme();

  return (
    <View style={styles.optionGroup}>
      <Text style={[styles.optionTitle, {color: colors.textPrimary}]}>
        {title}
      </Text>
      <View style={styles.chipRow}>
        {options.map(option => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.chip,
                {
                  backgroundColor: isModern
                    ? modernPalette.surface
                    : colors.inputBg,
                  borderColor: isModern ? modernPalette.border : colors.border,
                },
                isModern && styles.modernChip,
                isSelected && {
                  backgroundColor: isModern
                    ? modernPalette.accent
                    : colors.blue,
                  borderColor: isModern ? modernPalette.accent : colors.blue,
                },
              ]}
              onPress={() => onSelect(option.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  {color: colors.textPrimary},
                  isSelected && {color: colors.white, fontWeight: 'bold'},
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

export const PreferencesSettingsScreen: React.FC<
  PreferencesSettingsScreenProps
> = ({userId, onBack, onSaved}) => {
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
  const [adaptiveTimingEnabled, setAdaptiveTimingEnabled] = useState<boolean>(
    () =>
      localSettingsStore.get(userId, SETTING_KEY_ADAPTIVE_TIMING, 'true') !==
      'false',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [permissionStatus, setPermissionStatus] =
    useState<ReminderPermissionStatus | null>(null);
  const [alarmHealth, setAlarmHealth] = useState<AlarmHealth | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<OfflineModelId>(() =>
    getSelectedOfflineModelId(userId),
  );
  const [modelsStatus, setModelsStatus] = useState<Record<string, ModelStatus>>(
    {},
  );
  const [deviceRecommendation, setDeviceRecommendation] =
    useState<DeviceAiRecommendation | null>(null);
  // Shared with Chat's engine sheet, so the two screens never race
  // (audit M3), and downloads stay off without the llama engine (H4).
  const engineAvailable = useOfflineModelEngine();
  const engineReady = engineAvailable === true;
  const sharedDownload = useSharedModelDownload();
  const downloadingModelId = sharedDownload?.modelId ?? null;
  const downloadProgress = sharedDownload?.progress ?? null;
  const insets = useSafeAreaInsets();
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const cardShadow = isModern ? modernShadows.card : Shadows.card;
  const cardSurfaceStyle = isModern
    ? {
        borderRadius: ModernLayout.borderRadiusCard,
        borderWidth: 1,
        borderColor: modernPalette.border,
      }
    : null;
  const pillShapeStyle = isModern ? styles.modernPillButton : null;

  const refreshModelsState = React.useCallback(async () => {
    const [allStatuses, currentSelection] = await Promise.all([
      getAllModelsStatus(userId),
      Promise.resolve(getSelectedOfflineModelId(userId)),
    ]);
    const rec = await getDeviceAiRecommendation(allStatuses);
    const statusMap: Record<string, ModelStatus> = {};
    for (const item of allStatuses) {
      if (item.modelId) {
        statusMap[item.modelId] = item;
      }
    }
    setModelsStatus(statusMap);
    setSelectedModelId(currentSelection);
    setDeviceRecommendation(rec);
  }, [userId]);

  React.useEffect(() => {
    void refreshModelsState();
  }, [refreshModelsState]);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onBack]);

  const activePreset =
    OFFLINE_MODEL_CATALOG.find(item => item.id === selectedModelId) ||
    OFFLINE_MODEL_CATALOG[0];
  const activeStatus = modelsStatus[selectedModelId];
  const isActiveOnDeviceModelReady =
    engineReady &&
    selectedModelId !== 'fast_path_only' &&
    Boolean(activeStatus?.isDownloaded);
  const recommendedPreset = deviceRecommendation
    ? OFFLINE_MODEL_CATALOG.find(
        item => item.id === deviceRecommendation.recommendedModelId,
      ) || null
    : null;
  const recommendedStatus = deviceRecommendation
    ? modelsStatus[deviceRecommendation.recommendedModelId]
    : undefined;
  const recommendedReadyAndActive = Boolean(
    deviceRecommendation &&
      selectedModelId === deviceRecommendation.recommendedModelId &&
      (deviceRecommendation.recommendedModelId === 'fast_path_only' ||
        recommendedStatus?.isDownloaded),
  );

  const handleSelectModel = async (modelId: OfflineModelId) => {
    setSelectedOfflineModelId(modelId, userId);
    setSelectedModelId(modelId);
    await refreshModelsState();
  };

  const handleStartDownload = async (modelId: DownloadableOfflineModelId) => {
    const preset = OFFLINE_MODEL_CATALOG.find(item => item.id === modelId);
    if (!engineReady || downloadingModelId !== null) {
      return;
    }
    try {
      await downloadOfflineModel(modelId, undefined, userId);
      await refreshModelsState();
      Alert.alert(
        'AI Model Ready',
        `${preset?.name || 'Offline model'} is downloaded and ready for offline voice intelligence!`,
      );
    } catch (err: any) {
      const message = err?.message || '';
      if (/cancel/i.test(message)) {
        return;
      }
      Alert.alert(
        'Download Error',
        message || 'Could not download model. Check internet connection.',
      );
    }
  };

  const handleCancelDownload = async () => {
    await cancelModelDownload();
  };

  const handleDeleteModel = (modelId: DownloadableOfflineModelId) => {
    const preset = OFFLINE_MODEL_CATALOG.find(item => item.id === modelId);
    Alert.alert(
      'Remove Offline AI Model',
      `Are you sure you want to delete ${preset?.name || 'the on-device AI model'}? LAFINA will continue working using high-accuracy fast-path parsing.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteOfflineModel(modelId, userId);
            await refreshModelsState();
          },
        },
      ],
    );
  };

  const handleOpenPermissions = async () => {
    try {
      const [status, alarms] = await Promise.all([
        getReminderPermissionStatus(),
        getAlarmHealth(),
      ]);
      setPermissionStatus(status);
      setAlarmHealth(alarms);
    } catch {
      // Ignore
    }
    setPermissionModalVisible(true);
  };

  const wakeOptions = useMemo(
    () =>
      WAKE_OPTIONS.some(option => option.value === wakeTime)
        ? WAKE_OPTIONS
        : [
            {label: `Current: ${formatTo12Hour(wakeTime)}`, value: wakeTime},
            ...WAKE_OPTIONS,
          ],
    [wakeTime],
  );
  const sleepOptions = useMemo(
    () =>
      SLEEP_OPTIONS.some(option => option.value === sleepTime)
        ? SLEEP_OPTIONS
        : [
            {label: `Current: ${formatTo12Hour(sleepTime)}`, value: sleepTime},
            ...SLEEP_OPTIONS,
          ],
    [sleepTime],
  );

  const toggleStudyPeak = (value: string): void => {
    const typedValue = value as StudyPeakHour;
    setStudyPeakHours(current =>
      current.includes(typedValue)
        ? current.filter(entry => entry !== typedValue)
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
      localSettingsStore.set(
        userId,
        SETTING_KEY_ADAPTIVE_TIMING,
        adaptiveTimingEnabled ? 'true' : 'false',
      );
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
    <View
      testID="preferences-screen-root"
      style={[styles.container, {backgroundColor: colors.background}]}
    >
      <View
        testID="preferences-header"
        style={[
          styles.header,
          isModern && styles.modernHeader,
          {
            borderBottomColor: isModern ? modernPalette.border : colors.border,
          },
        ]}
      >
        <View style={styles.headerSideSlot}>
          <TouchableOpacity
            testID="preferences-back-button"
            accessibilityRole="button"
            accessibilityLabel="Back to Profile"
            activeOpacity={0.78}
            style={[
              styles.backButton,
              isModern && [
                styles.modernBackButton,
                modernShadows.subtle,
                {
                  backgroundColor: modernPalette.card,
                  borderColor: modernPalette.border,
                },
              ],
            ]}
            onPress={onBack}
          >
            <ChevronLeft
              size={18}
              strokeWidth={2.2}
              color={isModern ? modernPalette.text : colors.textPrimary}
            />
            <Text
              style={[
                styles.backText,
                isModern && styles.modernBackText,
                {color: isModern ? modernPalette.text : colors.textPrimary},
              ]}
              numberOfLines={1}
            >
              Profile
            </Text>
          </TouchableOpacity>
        </View>
        <Text
          style={[
            styles.headerTitle,
            isModern && styles.modernHeaderTitle,
            {color: isModern ? modernPalette.text : colors.textPrimary},
          ]}
          numberOfLines={1}
        >
          Preferences
        </Text>
        <View style={[styles.headerSideSlot, styles.headerRightSlot]} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingBottom: Math.max(insets.bottom, 12) + 120},
        ]}
      >
        <View
          style={[
            styles.card,
            cardShadow,
            {backgroundColor: colors.cardBg},
            cardSurfaceStyle,
          ]}
        >
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Daily routine
          </Text>
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

        <View
          style={[
            styles.card,
            cardShadow,
            {backgroundColor: colors.cardBg},
            cardSurfaceStyle,
          ]}
        >
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Study habits
          </Text>
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

        <View
          style={[
            styles.card,
            cardShadow,
            {backgroundColor: colors.cardBg},
            cardSurfaceStyle,
          ]}
        >
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Reminders
          </Text>
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
            onSelect={value => setSnoozeTendency(value as SnoozeTendency)}
          />
          <PreferenceOptionGroup
            title="Adaptive timing (AI Secretary)"
            options={[
              {label: 'Enabled (AI personalized)', value: 'true'},
              {label: 'Disabled (Fixed lead time)', value: 'false'},
            ]}
            selectedValues={[adaptiveTimingEnabled ? 'true' : 'false']}
            onSelect={value => setAdaptiveTimingEnabled(value === 'true')}
          />
        </View>

        <View
          style={[
            styles.card,
            cardShadow,
            {backgroundColor: colors.cardBg},
            cardSurfaceStyle,
          ]}
        >
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Academic load
          </Text>
          <PreferenceOptionGroup
            title="Weekly classes"
            options={CLASS_COUNT_OPTIONS}
            selectedValues={[weeklyClassCount]}
            onSelect={value => setWeeklyClassCount(value as WeeklyClassCount)}
          />
          <PreferenceOptionGroup
            title="Longest class gap"
            options={CLASS_GAP_OPTIONS}
            selectedValues={[longestClassGap]}
            onSelect={value => setLongestClassGap(value as LongestClassGap)}
          />
        </View>

        <View
          style={[
            styles.card,
            cardShadow,
            {backgroundColor: colors.cardBg},
            cardSurfaceStyle,
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <Text
              style={[
                styles.sectionTitle,
                {color: colors.textPrimary, marginBottom: 0},
              ]}
            >
              Offline Voice Intelligence
            </Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: isActiveOnDeviceModelReady
                    ? 'rgba(46, 204, 113, 0.15)'
                    : mixColors(colors.blue, colors.cardBg, 0.15),
                },
              ]}
            >
              <Text
                testID="offline-ai-header-badge"
                style={[
                  styles.badgeText,
                  {
                    color: isActiveOnDeviceModelReady
                      ? colors.success
                      : colors.blue,
                  },
                ]}
              >
                {isActiveOnDeviceModelReady
                  ? `Active: ${activePreset.shortLabel}`
                  : 'Fast-Path Only'}
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.permissionHelperText,
              {color: colors.textSecondary, marginTop: 8},
            ]}
          >
            Choose which offline engine extracts tasks, reminders, and schedule
            commands from your voice and text when you are offline.
          </Text>

          {engineAvailable === false && (
            <Text
              testID="offline-ai-engine-unavailable"
              style={[
                styles.permissionHelperText,
                {color: colors.warning, marginTop: 8},
              ]}
            >
              {OFFLINE_ENGINE_UNAVAILABLE_MESSAGE}
            </Text>
          )}

          {deviceRecommendation && recommendedPreset && (
            <View
              testID="offline-ai-recommendation-card"
              style={[
                styles.recommendationBanner,
                {
                  borderColor: colors.blue,
                  backgroundColor: mixColors(colors.blue, colors.cardBg, 0.08),
                },
              ]}
            >
              <View style={styles.recommendationHeaderRow}>
                <View style={styles.recommendationTitleCol}>
                  <Sparkles size={15} color={colors.blue} />
                  <Text
                    style={[styles.recommendationEyebrow, {color: colors.blue}]}
                  >
                    Recommended For Your Phone
                  </Text>
                </View>
                <View style={styles.modelMetaBadge}>
                  <Text
                    testID="offline-ai-device-specs"
                    style={[
                      styles.modelMetaText,
                      {color: colors.textSecondary},
                    ]}
                  >
                    {deviceRecommendation.specs.isDetected
                      ? deviceRecommendation.specSummary
                      : 'Auto Fit'}
                  </Text>
                </View>
              </View>

              <Text
                testID="offline-ai-recommended-model"
                style={[styles.modelPresetName, {color: colors.textPrimary, marginTop: 4}]}
              >
                {recommendedPreset.name}
                {deviceRecommendation.specs.isDetected
                  ? ` · ${deviceRecommendation.specs.deviceLabel}`
                  : ''}
              </Text>
              <Text
                style={[
                  styles.modelPresetDesc,
                  {color: colors.textSecondary},
                ]}
              >
                {deviceRecommendation.reason}
              </Text>

              {recommendedReadyAndActive ? (
                <View
                  testID="offline-ai-recommended-active"
                  style={[
                    styles.activeModelPill,
                    {
                      backgroundColor: 'rgba(46, 204, 113, 0.15)',
                      alignSelf: 'flex-start',
                      marginTop: 8,
                    },
                  ]}
                >
                  <Check size={14} color={colors.success} />
                  <Text
                    style={[styles.activeModelText, {color: colors.success}]}
                  >
                    Active Recommended Model
                  </Text>
                </View>
              ) : deviceRecommendation.recommendedModelId === 'fast_path_only' ||
                recommendedStatus?.isDownloaded ? (
                <TouchableOpacity
                  testID="offline-ai-use-recommended"
                  style={[
                    styles.selectModelButton,
                    pillShapeStyle,
                    {
                      borderColor: colors.blue,
                      alignSelf: 'flex-start',
                      marginTop: 8,
                    },
                  ]}
                  onPress={() =>
                    void handleSelectModel(
                      deviceRecommendation.recommendedModelId,
                    )
                  }
                >
                  <Text style={[styles.selectModelText, {color: colors.blue}]}>
                    Use {recommendedPreset.shortLabel}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  testID="offline-ai-download-recommended"
                  disabled={downloadingModelId !== null || !engineReady}
                  style={[
                    styles.selectModelButton,
                    pillShapeStyle,
                    {
                      borderColor: colors.blue,
                      alignSelf: 'flex-start',
                      marginTop: 8,
                      opacity:
                        downloadingModelId !== null || !engineReady ? 0.5 : 1,
                    },
                  ]}
                  onPress={() =>
                    void handleStartDownload(
                      deviceRecommendation.recommendedModelId as DownloadableOfflineModelId,
                    )
                  }
                >
                  <Text style={[styles.selectModelText, {color: colors.blue}]}>
                    {downloadingModelId ===
                    deviceRecommendation.recommendedModelId
                      ? `Downloading ${recommendedPreset.shortLabel}…`
                      : `Download & Use ${recommendedPreset.shortLabel}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.modelPresetList}>
            {OFFLINE_MODEL_CATALOG.map(preset => {
              const status = modelsStatus[preset.id];
              const isSelected = selectedModelId === preset.id;
              const isFastPath = preset.id === 'fast_path_only';
              const assessment =
                deviceRecommendation?.assessments?.[preset.id];
              const downloadableId = isFastPath
                ? null
                : (preset.id as DownloadableOfflineModelId);
              const isDownloaded = Boolean(status?.isDownloaded);
              const isDownloadingThis =
                downloadableId !== null &&
                downloadingModelId === downloadableId;
              const isAnotherDownloading =
                downloadingModelId !== null &&
                downloadingModelId !== downloadableId;
              const approxMB = Math.round(
                preset.approximateSizeBytes / (1024 * 1024),
              );
              const metaText = isFastPath
                ? '0 MB • Built-in'
                : `~${approxMB} MB • ${preset.recommendedRamGb}GB+ RAM`;

              return (
                <View
                  key={preset.id}
                  testID={`offline-model-card-${preset.id}`}
                  style={[
                    styles.modelPresetCard,
                    {
                      borderColor: isSelected
                        ? colors.blue
                        : 'rgba(150, 150, 150, 0.25)',
                      backgroundColor: isSelected
                        ? mixColors(colors.blue, colors.cardBg, 0.06)
                        : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.modelPresetHeader}>
                    <Text
                      style={[
                        styles.modelPresetName,
                        {color: colors.textPrimary},
                      ]}
                    >
                      {preset.name}
                    </Text>
                    <View style={styles.modelMetaRow}>
                      {assessment?.isRecommended && (
                        <View
                          testID={`offline-model-recommended-${preset.id}`}
                          style={[
                            styles.modelMetaBadge,
                            {
                              backgroundColor: mixColors(
                                colors.blue,
                                colors.cardBg,
                                0.16,
                              ),
                            },
                          ]}
                        >
                          <Text
                            style={[styles.modelMetaText, {color: colors.blue}]}
                          >
                            Recommended
                          </Text>
                        </View>
                      )}
                      {assessment &&
                        !assessment.isRecommended &&
                        assessment.note && (
                          <View
                            testID={`offline-model-compat-${preset.id}`}
                            style={[
                              styles.modelMetaBadge,
                              {
                                backgroundColor:
                                  assessment.tier === 'unsupported'
                                    ? 'rgba(255, 59, 48, 0.14)'
                                    : assessment.tier === 'tight_fit'
                                      ? 'rgba(244, 161, 0, 0.18)'
                                      : 'rgba(150, 150, 150, 0.14)',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.modelMetaText,
                                {
                                  color:
                                    assessment.tier === 'unsupported'
                                      ? colors.error
                                      : assessment.tier === 'tight_fit'
                                        ? colors.warning
                                        : colors.textSecondary,
                                },
                              ]}
                            >
                              {assessment.note}
                            </Text>
                          </View>
                        )}
                      <View style={styles.modelMetaBadge}>
                        <Text
                          style={[
                            styles.modelMetaText,
                            {color: colors.textSecondary},
                          ]}
                        >
                          {metaText}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.modelPresetDesc,
                      {color: colors.textSecondary},
                    ]}
                  >
                    {preset.description}
                  </Text>

                  {isFastPath ? (
                    <View style={styles.modelActionsRow}>
                      {isSelected ? (
                        <View
                          testID="offline-model-active-fast_path_only"
                          style={[
                            styles.activeModelPill,
                            {backgroundColor: 'rgba(46, 204, 113, 0.15)'},
                          ]}
                        >
                          <Check size={14} color={colors.success} />
                          <Text
                            style={[
                              styles.activeModelText,
                              {color: colors.success},
                            ]}
                          >
                            Active
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          testID="offline-model-select-fast_path_only"
                          style={[
                            styles.selectModelButton,
                            pillShapeStyle,
                            {borderColor: colors.blue},
                          ]}
                          onPress={() =>
                            void handleSelectModel('fast_path_only')
                          }
                        >
                          <Text
                            style={[
                              styles.selectModelText,
                              {color: colors.blue},
                            ]}
                          >
                            Use Fast-Path Only
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : isDownloadingThis ? (
                    <View style={styles.downloadProgressContainer}>
                      <View style={styles.progressBarBackground}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${downloadProgress?.percent || 0}%`,
                              backgroundColor: colors.blue,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.progressRow}>
                        <Text
                          style={[
                            styles.progressText,
                            {color: colors.textSecondary},
                          ]}
                        >
                          Downloading: {downloadProgress?.percent || 0}% (
                          {Math.round(
                            (downloadProgress?.bytesWritten || 0) /
                              (1024 * 1024),
                          )}{' '}
                          /{' '}
                          {Math.round(
                            (downloadProgress?.contentLength ||
                              preset.approximateSizeBytes) /
                              (1024 * 1024),
                          )}{' '}
                          MB)
                        </Text>
                        <TouchableOpacity
                          testID={`offline-model-cancel-${preset.id}`}
                          onPress={() => void handleCancelDownload()}
                        >
                          <Text
                            style={[
                              styles.cancelDownloadText,
                              {color: colors.error},
                            ]}
                          >
                            Cancel
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : isDownloaded ? (
                    <View style={styles.modelActionsRow}>
                      <View style={styles.modelInfoCol}>
                        <Sparkles size={15} color={colors.success} />
                        <Text
                          style={[
                            styles.modelSizeText,
                            {color: colors.textSecondary},
                          ]}
                        >
                          {Math.round(
                            (status?.fileSizeBytes || 0) / (1024 * 1024),
                          )}{' '}
                          MB on disk
                        </Text>
                      </View>
                      <View style={styles.modelActionButtons}>
                        {isSelected ? (
                          <View
                            testID={`offline-model-active-${preset.id}`}
                            style={[
                              styles.activeModelPill,
                              {backgroundColor: 'rgba(46, 204, 113, 0.15)'},
                            ]}
                          >
                            <Check size={14} color={colors.success} />
                            <Text
                              style={[
                                styles.activeModelText,
                                {color: colors.success},
                              ]}
                            >
                              Active
                            </Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            testID={`offline-model-select-${preset.id}`}
                            style={[
                              styles.selectModelButton,
                              pillShapeStyle,
                              {borderColor: colors.blue},
                            ]}
                            disabled={!engineReady}
                            onPress={() => void handleSelectModel(preset.id)}
                          >
                            <Text
                              style={[
                                styles.selectModelText,
                                {color: colors.blue},
                              ]}
                            >
                              Use Model
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          testID={`offline-model-delete-${preset.id}`}
                          accessibilityLabel={`Remove ${preset.shortLabel}`}
                          style={[
                            styles.deleteModelButton,
                            pillShapeStyle,
                            {borderColor: colors.error},
                          ]}
                          onPress={() =>
                            downloadableId && handleDeleteModel(downloadableId)
                          }
                        >
                          <Trash2 size={14} color={colors.error} />
                          <Text
                            style={[
                              styles.deleteModelText,
                              {color: colors.error},
                            ]}
                          >
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      testID={`offline-model-download-${preset.id}`}
                      disabled={isAnotherDownloading || !engineReady}
                      style={[
                        styles.permissionButton,
                        pillShapeStyle,
                        {
                          borderColor: colors.blue,
                          marginTop: 8,
                          opacity: isAnotherDownloading || !engineReady ? 0.5 : 1,
                        },
                      ]}
                      onPress={() =>
                        downloadableId &&
                        void handleStartDownload(downloadableId)
                      }
                    >
                      <Download size={16} color={colors.blue} />
                      <Text
                        style={[
                          styles.permissionButtonText,
                          {color: colors.blue},
                        ]}
                      >
                        Download {preset.shortLabel} (~{approxMB} MB)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.card,
            cardShadow,
            {backgroundColor: colors.cardBg},
            cardSurfaceStyle,
          ]}
        >
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Device permissions
          </Text>
          <Text
            style={[styles.permissionHelperText, {color: colors.textSecondary}]}
          >
            Ensure notifications, exact alarms, full-screen calls, and battery
            saver settings allow LAFINA to remind you on schedule.
          </Text>
          <TouchableOpacity
            style={[
              styles.permissionButton,
              pillShapeStyle,
              {borderColor: colors.blue},
            ]}
            onPress={() => void handleOpenPermissions()}
          >
            <Bell size={18} color={colors.blue} />
            <Text style={[styles.permissionButtonText, {color: colors.blue}]}>
              Check Reminder Permissions
            </Text>
          </TouchableOpacity>
        </View>

        {error && (
          <Text style={[styles.errorText, {color: colors.error}]}>{error}</Text>
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,
            pillShapeStyle,
            isModern && modernShadows.subtle,
            {backgroundColor: isModern ? modernPalette.accent : colors.blue},
          ]}
          onPress={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={[styles.saveButtonText, {color: colors.white}]}>
              Save Preferences
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ReminderPermissionModal
        visible={permissionModalVisible}
        status={permissionStatus}
        alarmHealth={alarmHealth}
        onClose={() => setPermissionModalVisible(false)}
        onRefreshStatus={() => {
          void getReminderPermissionStatus().then(setPermissionStatus);
          void getAlarmHealth().then(setAlarmHealth);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 54,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modernHeader: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerSideSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRightSlot: {
    justifyContent: 'flex-end',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 6,
    paddingRight: 10,
    minHeight: 36,
  },
  modernBackButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: ModernLayout.borderRadiusPill,
    borderWidth: 1,
    gap: 4,
  },
  backText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  modernBackText: {
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  modernHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
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
  recommendationBanner: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    padding: 12,
    marginBottom: 12,
  },
  recommendationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  recommendationTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recommendationEyebrow: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modelMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  modelPresetList: {
    gap: 10,
    marginTop: 2,
  },
  modelPresetCard: {
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusButton,
    padding: 12,
  },
  modelPresetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  modelPresetName: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  modelMetaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Layout.borderRadiusPill,
    backgroundColor: 'rgba(150, 150, 150, 0.14)',
  },
  modelMetaText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  modelPresetDesc: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  modelActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  modelInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modelActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeModelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Layout.borderRadiusPill,
  },
  activeModelText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  selectModelButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
  },
  selectModelText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
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
  modernChip: {
    borderRadius: ModernLayout.borderRadiusPill,
  },
  modernPillButton: {
    borderRadius: ModernLayout.borderRadiusPill,
  },
});
