import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Layout } from '../theme';
import { userStore, behaviorStore, preferencesStore } from '../../storage';
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

interface OnboardingScreenProps {
  userId: string;
  onOnboardingComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  userId,
  onOnboardingComplete,
}) => {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  const [wakeTime, setWakeTime] = useState('07:00');
  const [sleepTime, setSleepTime] = useState('22:00');
  const [studyPeak, setStudyPeak] = useState<StudyPeakHour[]>([]);
  const [busiestDay, setBusiestDay] = useState('Monday');
  const [reminderLead, setReminderLead] = useState('15');
  const [snoozeTendency, setSnoozeTendency] = useState<SnoozeTendency>('snooze_once');
  const [classCount, setClassCount] = useState<WeeklyClassCount>('4-6');
  const [longestGap, setLongestGap] = useState<LongestClassGap>('1 hour');

  const { colors } = useTheme();
  const themed = useThemedStyles(getOnboardThemedStyles);

  const toggleStudyPeak = (value: StudyPeakHour) => {
    if (studyPeak.includes(value)) {
      setStudyPeak(studyPeak.filter((p) => p !== value));
    } else {
      setStudyPeak([...studyPeak, value]);
    }
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
      const leadMinutes = parseInt(reminderLead, 10) || 15;

      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'typical_wake_time', wakeTime);
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
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'busiest_day', busiestDay);
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
      behaviorStore.logBehaviorEvent(userId, 'onboarding_response', 'longest_class_gap', longestGap);

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

      behaviorStore.saveFeatureSnapshot(userId, 'schedule_preference', initialFeatureVector);

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

      userStore.markOnboardingComplete(userId);
      onOnboardingComplete();
    } catch (error) {
      console.error('Failed completing onboarding:', error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, themed.container]}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />

      <OnboardingProgress step={step} totalSteps={totalSteps} />

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
