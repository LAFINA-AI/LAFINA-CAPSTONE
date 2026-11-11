import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Layout } from '../theme';
import {
  userStore,
  behaviorStore,
  preferencesStore,
  academicProfileStore,
  mapCorCoursesToAcademicRecords,
} from '../../storage';
import type {
  StudyPeakHour,
  SnoozeTendency,
  WeeklyClassCount,
  LongestClassGap,
} from '../../storage';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';
import { OnboardingProgress } from '../components/onboarding/OnboardingProgress';
import { OnboardingStep } from '../components/onboarding/OnboardingStep';
import { OnboardingNavigation } from '../components/onboarding/OnboardingNavigation';
import { chatMemoryStore } from '../../storage/chatMemoryStore';
import {
  readOnboardingIdentity,
  saveOnboardingMemories,
} from '../../storage/onboardingMemory';
import type { ConversationTone } from '../../storage/onboardingMemory';
import { visionService } from '../../ai/vision/visionService';
import type { ParsedUstpCorResult } from '../../ai/vision/ustpCorParser';
import type { ParsedScheduleResult } from '../../ai/vision/scheduleParser';

interface OnboardingScreenProps {
  userId: string;
  onOnboardingComplete: () => void;
  onCancel?: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  userId,
  onOnboardingComplete,
  onCancel,
}) => {
  const [step, setStep] = useState(1);
  const [saveError, setSaveError] = useState<string | null>(null);
  const totalSteps = 6;
  const [existing] = useState(() => preferencesStore.get(userId));
  const [existingAcademicProfile] = useState(() => academicProfileStore.get(userId));
  const [identity] = useState(() => readOnboardingIdentity(userId));
  const [preferredName, setPreferredName] = useState(
    identity.preferredName || existingAcademicProfile?.preferredName || '',
  );
  const [tone, setTone] = useState<ConversationTone>(identity.tone);
  const [memoryEnabled] = useState(() => chatMemoryStore.isEnabled(userId));

  const [isUstpStudent, setIsUstpStudent] = useState<boolean | null>(
    existingAcademicProfile ? existingAcademicProfile.isUstpStudent : null,
  );
  const [parsedCor, setParsedCor] = useState<ParsedUstpCorResult | null>(null);
  const [corFileName, setCorFileName] = useState<string | null>(null);
  const [scannedSchedule, setScannedSchedule] = useState<ParsedScheduleResult | null>(
    null,
  );
  const [scheduleFileName, setScheduleFileName] = useState<string | null>(null);
  const [isScanningDocument, setIsScanningDocument] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string | null>(null);

  const [wakeTime, setWakeTime] = useState(existing.wakeTime);
  const [sleepTime, setSleepTime] = useState(existing.sleepTime);
  const [studyPeak, setStudyPeak] = useState<StudyPeakHour[]>(
    onCancel ? existing.studyPeakHours : [],
  );
  const [busiestDay, setBusiestDay] = useState(existing.busiestDay);
  const [reminderLead, setReminderLead] = useState(String(existing.reminderLeadMinutes));
  const [snoozeTendency, setSnoozeTendency] = useState<SnoozeTendency>(
    existing.snoozeTendency,
  );
  const [classCount, setClassCount] = useState<WeeklyClassCount>(
    existing.weeklyClassCount,
  );
  const [longestGap, setLongestGap] = useState<LongestClassGap>(existing.longestClassGap);

  const { colors } = useTheme();
  const themed = useThemedStyles(getOnboardThemedStyles);

  const toggleStudyPeak = (value: StudyPeakHour) => {
    if (studyPeak.includes(value)) {
      setStudyPeak(studyPeak.filter((p) => p !== value));
    } else {
      setStudyPeak([...studyPeak, value]);
    }
  };

  const handleSelectUstpStudent = (value: boolean) => {
    setIsUstpStudent(value);
    setScanStatusMessage(null);
  };

  const handleAttachUstpCor = async () => {
    if (isScanningDocument) return;
    try {
      const picked = await visionService.pickCorDocument();
      if (!picked) return;

      setIsScanningDocument(true);
      setScanStatusMessage(null);

      const cor = await visionService.scanUstpCorFromUri(picked.uri);
      if (
        !cor ||
        (cor.courses.length === 0 &&
          !cor.profile.studentNo &&
          !cor.profile.fullName)
      ) {
        setScanStatusMessage(
          'Could not recognize USTP COR details in that file. Please try a clearer COR PDF or screenshot.',
        );
        return;
      }

      setParsedCor(cor);
      setCorFileName(picked.fileName || 'USTP COR');
      if (cor.profile.preferredName && (!preferredName || preferredName === identity.preferredName)) {
        setPreferredName(cor.profile.preferredName);
      }
      setBusiestDay(cor.recommendedPreferences.busiestDay);
      setClassCount(cor.recommendedPreferences.weeklyClassCount);
      setLongestGap(cor.recommendedPreferences.longestClassGap);
    } catch (error) {
      console.error('[OnboardingScreen] Failed scanning USTP COR:', error);
      setScanStatusMessage('Failed to read COR document. Please try again.');
    } finally {
      setIsScanningDocument(false);
    }
  };

  const handleClearUstpCor = () => {
    setParsedCor(null);
    setCorFileName(null);
    setScanStatusMessage(null);
  };

  const runScheduleScan = async (
    uri: string,
    fileName?: string,
  ): Promise<void> => {
    setIsScanningDocument(true);
    setScanStatusMessage(null);
    try {
      const result = await visionService.scanScheduleFromUri(uri);
      if (!result || result.classes.length === 0) {
        setScanStatusMessage(
          'No clear class schedule was found in that image. You can try another photo or add classes manually later.',
        );
        return;
      }
      setScannedSchedule(result);
      setScheduleFileName(fileName || 'Schedule Image');
      const count = result.classes.length;
      setClassCount(count <= 3 ? '1-3' : count <= 6 ? '4-6' : '7+');
    } catch (error) {
      console.error('[OnboardingScreen] Failed scanning schedule image:', error);
      setScanStatusMessage('Failed to scan schedule image. Please try again.');
    } finally {
      setIsScanningDocument(false);
    }
  };

  const handleScanScheduleGallery = async () => {
    if (isScanningDocument) return;
    const photo = await visionService.pickImageFromGallery();
    if (!photo) return;
    await runScheduleScan(photo.uri, photo.fileName);
  };

  const handleScanScheduleCamera = async () => {
    if (isScanningDocument) return;
    const photo = await visionService.takePhoto();
    if (!photo) return;
    await runScheduleScan(photo.uri, photo.fileName || 'Camera Capture');
  };

  const handleClearScannedSchedule = () => {
    setScannedSchedule(null);
    setScheduleFileName(null);
    setScanStatusMessage(null);
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const completeOnboarding = () => {
    try {
      setSaveError(null);
      const leadMinutes = parseInt(reminderLead, 10) || 15;

      behaviorStore.logBehaviorEvent(
        userId,
        'onboarding_response',
        'typical_wake_time',
        wakeTime,
      );
      behaviorStore.logBehaviorEvent(
        userId,
        'onboarding_response',
        'typical_sleep_time',
        sleepTime,
      );
      behaviorStore.logBehaviorEvent(
        userId,
        'onboarding_response',
        'study_peak_hours',
        JSON.stringify(studyPeak),
      );
      behaviorStore.logBehaviorEvent(
        userId,
        'onboarding_response',
        'busiest_day',
        busiestDay,
      );
      behaviorStore.logBehaviorEvent(
        userId,
        'onboarding_response',
        'preferred_reminder_lead_time',
        reminderLead,
      );
      behaviorStore.logBehaviorEvent(
        userId,
        'onboarding_response',
        'reminder_response_tendency',
        snoozeTendency,
      );
      behaviorStore.logBehaviorEvent(
        userId,
        'onboarding_response',
        'weekly_class_count',
        classCount,
      );
      behaviorStore.logBehaviorEvent(
        userId,
        'onboarding_response',
        'longest_class_gap',
        longestGap,
      );

      const initialFeatureVector = JSON.stringify({
        preferredStudyTimes: studyPeak,
        busiestDay,
        typicalWakeTime: wakeTime,
        typicalSleepTime: sleepTime,
        reminderLeadMinutes: leadMinutes,
        reminderSnoozeBehavior: snoozeTendency,
        academicLoadScore: classCount === '1-3' ? 1 : classCount === '4-6' ? 2 : 3,
        freeTimeGapsHours:
          longestGap === 'None'
            ? 0
            : longestGap === '30 min'
              ? 0.5
              : longestGap === '1 hour'
                ? 1.0
                : 2.0,
      });

      behaviorStore.saveFeatureSnapshot(
        userId,
        'schedule_preference',
        initialFeatureVector,
      );

      preferencesStore.save(userId, {
        wakeTime,
        sleepTime,
        studyPeakHours: studyPeak,
        busiestDay,
        reminderLeadMinutes: leadMinutes,
        snoozeTendency,
        weeklyClassCount: classCount,
        longestClassGap: longestGap,
      });

      let activeAcademicProfile = existingAcademicProfile;

      if (isUstpStudent && parsedCor) {
        activeAcademicProfile = academicProfileStore.save(userId, {
          ...parsedCor.profile,
          isUstpStudent: true,
          courses: mapCorCoursesToAcademicRecords(parsedCor.courses),
        });
        academicProfileStore.persistRecurringSchedule(userId, parsedCor.sessions);
        behaviorStore.logBehaviorEvent(
          userId,
          'onboarding_response',
          'ustp_cor_attached',
          parsedCor.profile.studentNo || 'true',
        );
      } else if (
        isUstpStudent === false &&
        scannedSchedule &&
        scannedSchedule.classes.length > 0
      ) {
        academicProfileStore.persistRecurringSchedule(
          userId,
          scannedSchedule.classes.map((c) => ({
            code: c.code,
            subjectTitle: c.subjectTitle || c.subject,
            section: c.section,
            faculty: c.faculty,
            room: c.room,
            days: c.days,
            startTime: c.startTime,
            endTime: c.endTime,
            recurrenceRule: c.recurrenceRule,
          })),
        );
        behaviorStore.logBehaviorEvent(
          userId,
          'onboarding_response',
          'schedule_image_scanned',
          String(scannedSchedule.classes.length),
        );
      }

      saveOnboardingMemories(
        userId,
        { preferredName, tone },
        studyPeak,
        activeAcademicProfile,
      );
      userStore.markOnboardingComplete(userId);
      onOnboardingComplete();
    } catch (error) {
      console.error('Failed completing onboarding:', error);
      setSaveError('Could not save your setup. Please try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, themed.container]}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />

      {onCancel ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.cancel}
        >
          <Text style={{ color: colors.textSecondary }}>Cancel replay</Text>
        </TouchableOpacity>
      ) : null}

      <OnboardingProgress step={step} totalSteps={totalSteps} />
      {saveError ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.error, paddingHorizontal: 24 }}
        >
          {saveError}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, themed.card]}>
          <OnboardingStep
            step={step}
            wakeTime={wakeTime}
            setWakeTime={setWakeTime}
            sleepTime={sleepTime}
            setSleepTime={setSleepTime}
            studyPeak={studyPeak}
            toggleStudyPeak={toggleStudyPeak}
            busiestDay={busiestDay}
            setBusiestDay={setBusiestDay}
            reminderLead={reminderLead}
            setReminderLead={setReminderLead}
            snoozeTendency={snoozeTendency}
            setSnoozeTendency={setSnoozeTendency}
            classCount={classCount}
            setClassCount={setClassCount}
            longestGap={longestGap}
            setLongestGap={setLongestGap}
            preferredName={preferredName}
            setPreferredName={setPreferredName}
            tone={tone}
            setTone={setTone}
            memoryEnabled={memoryEnabled}
            isUstpStudent={isUstpStudent}
            setIsUstpStudent={handleSelectUstpStudent}
            parsedCor={parsedCor}
            corFileName={corFileName}
            onAttachUstpCor={handleAttachUstpCor}
            onClearUstpCor={handleClearUstpCor}
            scannedSchedule={scannedSchedule}
            scheduleFileName={scheduleFileName}
            onScanScheduleGallery={handleScanScheduleGallery}
            onScanScheduleCamera={handleScanScheduleCamera}
            onClearScannedSchedule={handleClearScannedSchedule}
            isScanningDocument={isScanningDocument}
            scanStatusMessage={scanStatusMessage}
          />
        </View>
      </ScrollView>

      <OnboardingNavigation
        step={step}
        totalSteps={totalSteps}
        onBack={handleBack}
        onNext={handleNext}
      />
    </SafeAreaView>
  );
};

const getOnboardThemedStyles = (colors: ThemeColors, isDarkMode: boolean) => ({
  container: { backgroundColor: colors.background },
  progressBarBg: { backgroundColor: colors.border },
  progressText: { color: colors.textMuted },
  card: { backgroundColor: colors.cardBg },
  stepTitle: { color: colors.textPrimary },
  stepDesc: { color: colors.textSecondary },
  inputLabel: { color: colors.textPrimary },
  chip: { backgroundColor: colors.inputBg, borderColor: colors.border },
  chipText: { color: colors.textPrimary },
  navigation: { borderTopColor: colors.border },
  backButtonText: { color: colors.textSecondary },
  iconCircle: {
    backgroundColor: isDarkMode ? 'rgba(46, 204, 113, 0.15)' : 'rgba(46, 204, 113, 0.08)',
  },
  summaryCard: { backgroundColor: colors.inputBg, borderColor: colors.border },
  summaryTitle: { color: colors.textPrimary },
  summaryItem: { color: colors.textPrimary },
});

const styles = StyleSheet.create({
  cancel: { alignSelf: 'flex-end', paddingHorizontal: 24, paddingVertical: 10 },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Layout.borderRadiusCard,
    padding: 24,
    minHeight: 380,
  },
});
