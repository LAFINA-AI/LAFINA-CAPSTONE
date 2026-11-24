import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, StatusBar, StyleSheet, Text, View} from 'react-native';
import {behaviorStore, preferencesStore, userStore} from '../../storage';
import type {StudyPeakHour} from '../../storage';
import {useTheme} from '../contexts/ThemeContext';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {
  readOnboardingIdentity,
  syncOnboardingMemories,
} from '../../storage/onboardingMemory';
import {studentSetupStore} from '../../storage/studentSetupStore';
import type {
  ExplicitPreference,
  MainGoal,
  MemoryChoices,
  ResponseStyle,
  StudentSetupState,
} from '../../storage/studentSetupStore';
import {
  emptyAnswers,
  onboardingProgressStore,
} from '../../storage/onboardingProgressStore';
import type {
  OnboardingAnswers,
  OnboardingStage,
} from '../../storage/onboardingProgressStore';
import {
  getConfirmedAcademicProfile,
  getUstpEligibility,
} from '../../storage/ustpEligibility';
import {chooseNotUstpMode, chooseUstpMode} from '../../storage/studentMode';
import {IntroPager} from './onboarding/IntroPager';
import {CorReviewFlow} from './onboarding/CorReviewFlow';
import {OfflineModelStep} from './onboarding/OfflineModelStep';
import {PermissionsStep} from './onboarding/PermissionsStep';
import {
  getOfflineModelPreset,
  getSelectedOfflineModelId,
  isModelReadyById,
} from '../../ai/nlu';
import {useSharedModelDownload} from '../hooks/useOfflineModels';
import {
  Card,
  CheckRow,
  ChoiceButton,
  Field,
  Notice,
  OnboardingPage,
  SecondaryButton,
  SlimRow,
  Tag,
  TagRow,
  onboardingStyles,
  useOnboardingTokens,
} from './onboarding/onboardingUi';

/**
 * Simplified USTP-first onboarding:
 *   1. Choose your offline AI model (with device recommendation; downloads in background)
 *   2. Add & review your USTP COR (all on 1 screen, or defer / choose scheduling-only)
 *   3. Enable alerts & voice permissions (notifications, alarms, full-screen calls, mic)
 *   4. Optional quick preferences (name, tone, reminder lead time, memory) → Done
 *
 * Every answer is saved as the student goes so Back, restarts and
 * interruptions preserve progress.
 */
export interface OnboardingCompletion {
  startTour: boolean;
  goal: MainGoal | null;
}

interface OnboardingScreenProps {
  userId: string;
  onOnboardingComplete: (completion?: OnboardingCompletion) => void;
  /** Present when setup is replayed from Profile. */
  onCancel?: () => void;
}

type Page = 'ai' | 'cor' | 'permissions' | 'finish';
const PAGES: Page[] = ['ai', 'cor', 'permissions', 'finish'];
const FLEXIBLE = 'flexible';
const LEAD_OPTIONS = [5, 10, 15, 30, 60, 120, 180, 300];

const formatLeadOption = (minutes: number): string =>
  minutes >= 60 && minutes % 60 === 0
    ? `${minutes / 60} hr`
    : `${minutes} min`;

/** Replaying setup starts from what the student chose before (never from defaults). */
const answersFromSaved = (
  userId: string,
  setup: StudentSetupState,
): OnboardingAnswers => {
  const prefs = preferencesStore.get(userId);
  const explicit = new Set(setup.explicit);
  const identity = readOnboardingIdentity(userId);
  return {
    name: setup.preferredName || identity.preferredName,
    tone: setup.tone ?? (identity.tone || null),
    goal: setup.goal,
    wake: explicit.has('routine') ? prefs.wakeTime : null,
    sleep: explicit.has('routine') ? prefs.sleepTime : null,
    study: explicit.has('study')
      ? prefs.studyPeakHours.length
        ? prefs.studyPeakHours
        : [FLEXIBLE]
      : null,
    response: setup.responseStyle,
    lead: explicit.has('lead') ? prefs.reminderLeadMinutes : null,
  };
};

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  userId,
  onOnboardingComplete,
  onCancel,
}) => {
  const {colors} = useTheme();
  const t = useOnboardingTokens();
  const [initial] = useState(() => {
    const saved = onboardingProgressStore.get(userId);
    const setup = studentSetupStore.get(userId);
    if (saved) {
      return {
        stage: saved.stage,
        page: Math.min(Math.max(saved.page, 0), PAGES.length - 1),
        answers: saved.answers,
      };
    }
    return {
      stage: (onCancel || onboardingProgressStore.introSeen()
        ? 'details'
        : 'intro') as OnboardingStage,
      page: 0,
      answers: onCancel ? answersFromSaved(userId, setup) : emptyAnswers(),
    };
  });
  const [stage, setStage] = useState<OnboardingStage>(initial.stage);
  const [page, setPage] = useState(
    Math.min(Math.max(initial.page, 0), PAGES.length - 1),
  );
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial.answers);
  const [setup, setSetup] = useState<StudentSetupState>(() =>
    studentSetupStore.get(userId),
  );
  const [corOpen, setCorOpen] = useState(false);
  const [memoryOn, setMemoryOn] = useState(() =>
    chatMemoryStore.isEnabled(userId),
  );
  const [choices] = useState<MemoryChoices>(
    () => studentSetupStore.get(userId).memory,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sharedDownload = useSharedModelDownload();
  const [activeModelReady, setActiveModelReady] = useState(false);
  const saving = useRef(false);

  const schoolOn = getUstpEligibility(userId).eligible;
  const notUstp = setup.affiliation === 'not_ustp';
  const selectedModelId = getSelectedOfflineModelId(userId);

  useEffect(() => {
    let active = true;
    void isModelReadyById(selectedModelId)
      .then(ready => {
        if (active) setActiveModelReady(ready);
      })
      .catch(() => {
        if (active) setActiveModelReady(false);
      });
    return () => {
      active = false;
    };
  }, [selectedModelId, sharedDownload?.modelId, page]);

  useEffect(
    () =>
      studentSetupStore.subscribe(changed => {
        if (changed === userId) setSetup(studentSetupStore.get(userId));
      }),
    [userId],
  );

  // Progress is saved on every change (Back, restart and interruptions keep answers).
  useEffect(() => {
    onboardingProgressStore.save(userId, {stage, page, answers});
  }, [userId, stage, page, answers]);

  useEffect(() => {
    if (!schoolOn && answers.goal === 'handbook') {
      setAnswers(current => ({...current, goal: null}));
    }
  }, [schoolOn, answers.goal]);

  const set = <K extends keyof OnboardingAnswers>(
    key: K,
    value: OnboardingAnswers[K],
  ) => setAnswers(current => ({...current, [key]: value}));

  const go = useCallback((next: number) => {
    setError(null);
    setNotice(null);
    setPage(Math.max(0, Math.min(next, PAGES.length - 1)));
  }, []);

  const forward = () => go(page + 1);

  const back = useCallback((): boolean => {
    if (corOpen) return false;
    if (stage === 'intro') return false;
    if (page > 0) {
      go(page - 1);
      return true;
    }
    if (onCancel) {
      onCancel();
      return true;
    }
    if (!onboardingProgressStore.introSeen()) return false;
    setStage('intro');
    return true;
  }, [corOpen, stage, page, onCancel, go]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      back,
    );
    return () => subscription.remove();
  }, [back]);

  const finishIntro = () => {
    onboardingProgressStore.markIntroSeen();
    setStage('details');
  };

  const openCorSetup = () => {
    try {
      setSetup(chooseUstpMode(userId));
      setCorOpen(true);
    } catch (modeError) {
      console.error('[Onboarding] Could not choose USTP mode:', modeError);
      setError('That choice could not be saved. Try again.');
    }
  };

  const complete = (startTour: boolean) => {
    if (saving.current) return;
    saving.current = true;
    setError(null);
    try {
      const current = studentSetupStore.get(userId);
      const school = getUstpEligibility(userId).eligible;
      const flexible = answers.study?.includes(FLEXIBLE) ?? false;
      const peaks = answers.study
        ? (answers.study.filter(v => v !== FLEXIBLE) as StudyPeakHour[])
        : null;
      const goal = answers.goal === 'handbook' && !school ? null : answers.goal;
      const explicit: ExplicitPreference[] = [];
      if (answers.name.trim()) explicit.push('name');
      if (answers.tone) explicit.push('tone');
      if (goal) explicit.push('goal');
      if (answers.wake || answers.sleep) explicit.push('routine');
      if (answers.study) explicit.push('study');
      if (answers.response) explicit.push('response');
      if (answers.lead !== null) explicit.push('lead');

      const prefs = preferencesStore.get(userId);
      preferencesStore.save(userId, {
        ...prefs,
        wakeTime: answers.wake ?? prefs.wakeTime,
        sleepTime: answers.sleep ?? prefs.sleepTime,
        studyPeakHours: peaks ?? prefs.studyPeakHours,
        reminderLeadMinutes: answers.lead ?? prefs.reminderLeadMinutes,
      });
      if (answers.wake) {
        behaviorStore.logBehaviorEvent(
          userId,
          'onboarding_response',
          'typical_wake_time',
          answers.wake,
        );
      }
      if (answers.sleep) {
        behaviorStore.logBehaviorEvent(
          userId,
          'onboarding_response',
          'typical_sleep_time',
          answers.sleep,
        );
      }
      if (answers.study) {
        behaviorStore.logBehaviorEvent(
          userId,
          'onboarding_response',
          'study_peak_hours',
          JSON.stringify(answers.study),
        );
      }
      if (answers.lead !== null) {
        behaviorStore.logBehaviorEvent(
          userId,
          'onboarding_response',
          'preferred_reminder_lead_time',
          String(answers.lead),
        );
      }

      studentSetupStore.update(userId, {
        preferredName: answers.name.trim(),
        tone: answers.tone,
        goal,
        responseStyle: answers.response as ResponseStyle | null,
        explicit,
        memory: choices,
        setupCompletedAt: new Date().toISOString(),
      });
      if (chatMemoryStore.isEnabled(userId) !== memoryOn) {
        chatMemoryStore.setEnabled(userId, memoryOn);
      }
      syncOnboardingMemories(userId, {
        identity: {
          preferredName: answers.name.trim(),
          tone: answers.tone ?? '',
        },
        peaks,
        flexibleStudy: flexible,
        goal,
        choices,
        schedulingOnly: current.affiliation === 'not_ustp',
      });
      userStore.markOnboardingComplete(userId);
      onboardingProgressStore.clear(userId);
      onOnboardingComplete({startTour, goal});
    } catch (completeError) {
      console.error('[Onboarding] Could not save setup:', completeError);
      setError(
        'Your setup could not be saved. Your answers are kept — try again.',
      );
    } finally {
      saving.current = false;
    }
  };

  if (stage === 'intro') {
    return (
      <View style={[styles.root, {backgroundColor: t.bg}]}>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={t.bg} />
        <IntroPager
          mode="flow"
          onFinish={finishIntro}
          onSkip={finishIntro}
        />
      </View>
    );
  }

  if (corOpen) {
    return (
      <View style={[styles.root, {backgroundColor: t.bg}]}>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={t.bg} />
        <CorReviewFlow
          userId={userId}
          laterLabel="I'll add my COR later"
          onClose={outcome => {
            setCorOpen(false);
            setSetup(studentSetupStore.get(userId));
            if (outcome.status === 'confirmed') {
              const profile = getConfirmedAcademicProfile(userId);
              if (profile?.formattedName && !answers.name.trim()) {
                set('name', profile.formattedName.slice(0, 60));
              }
              go(PAGES.indexOf('permissions'));
            } else if (outcome.status === 'later') {
              go(PAGES.indexOf('permissions'));
              setNotice(
                'COR pending: scheduling works now; USTP features turn on after you add your COR.',
              );
            } else {
              setNotice(
                'COR setup was cancelled. You can add it anytime from Profile or Schedule.',
              );
            }
          }}
        />
      </View>
    );
  }

  const progress = {count: PAGES.length, active: page};
  const onBack =
    page > 0 || onCancel || onboardingProgressStore.introSeen()
      ? () => back()
      : undefined;
  const headLabel = onCancel ? 'Edit your setup' : 'Set up LAFINA';
  const pageName = PAGES[page];
  const common = {
    pageKey: pageName,
    headLabel,
    onBack,
    backLabel: page === 0 && onCancel ? 'Cancel replay' : 'Back',
    progress,
    error,
  };

  const statusTag = () =>
    schoolOn ? (
      <Tag label="USTP · COR confirmed" tone="good" />
    ) : setup.affiliation === 'ustp' ? (
      <Tag
        label={
          setup.corStatus === 'needs_review'
            ? 'USTP · COR needs review'
            : 'USTP · COR pending'
        }
        tone="attention"
      />
    ) : notUstp ? (
      <Tag label="Scheduling mode" tone="good" />
    ) : null;

  if (pageName === 'ai') {
    return (
      <View
        style={[styles.root, {backgroundColor: t.bg}]}
        testID="onboarding-screen"
      >
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={t.bg} />
        <OfflineModelStep
          userId={userId}
          headLabel={headLabel}
          onBack={onBack}
          backLabel={common.backLabel}
          progress={progress}
          onContinue={forward}
        />
      </View>
    );
  }

  if (pageName === 'cor') {
    const profile = schoolOn ? getConfirmedAcademicProfile(userId) : null;
    return (
      <View
        style={[styles.root, {backgroundColor: t.bg}]}
        testID="onboarding-screen"
      >
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={t.bg} />
        <OnboardingPage
          {...common}
          title={schoolOn ? 'Your USTP COR is ready.' : 'Add your USTP COR.'}
          copy="Upload your Certificate of Registration to import your classes and unlock Ask USTP."
          note={notice ?? undefined}
          primary={
            schoolOn || notUstp
              ? {
                  label: 'Continue',
                  onPress: forward,
                  testID: 'onboarding-continue',
                }
              : {
                  label:
                    setup.corStatus === 'needs_review'
                      ? 'Review my USTP COR'
                      : 'Set up my USTP COR',
                  onPress: openCorSetup,
                  testID: 'onboarding-setup-cor',
                }
          }
          secondary={
            schoolOn
              ? {
                  label: 'Replace my COR',
                  onPress: () => setCorOpen(true),
                  testID: 'onboarding-replace-cor',
                }
              : notUstp
              ? {
                  label: "I'm a USTP student · set up my COR",
                  onPress: openCorSetup,
                  testID: 'onboarding-setup-cor',
                }
              : {
                  label: "I'll add my COR later",
                  onPress: () => {
                    try {
                      setSetup(chooseUstpMode(userId));
                      forward();
                    } catch (modeError) {
                      console.error(
                        '[Onboarding] Could not choose USTP mode:',
                        modeError,
                      );
                      setError('That choice could not be saved. Try again.');
                    }
                  },
                  testID: 'onboarding-cor-later',
                }
          }
        >
          <TagRow>{statusTag()}</TagRow>
          {sharedDownload ? (
            <Notice
              testID="onboarding-cor-ai-downloading"
              text={`Downloading ${
                getOfflineModelPreset(sharedDownload.modelId).shortLabel
              } (${sharedDownload.progress.percent}%) in the background…`}
            />
          ) : null}
          {profile ? (
            <Card>
              <SlimRow label="Campus" value={profile.campus} />
              <SlimRow label="Program" value={profile.program} />
              <SlimRow label="Subjects" value={`${profile.courses.length}`} />
            </Card>
          ) : (
            <Card>
              <Text style={[onboardingStyles.body, {color: t.ink}]}>
                • Imports your class schedule in one simple review{'\n'}• Turns
                on USTP Student Handbook answers{'\n'}• You can also add or
                replace it anytime in Profile
              </Text>
            </Card>
          )}
          <SecondaryButton
            label={
              notUstp ? "I'm not a USTP student ✓" : "I'm not a USTP student"
            }
            onPress={() => {
              try {
                setSetup(chooseNotUstpMode(userId));
                forward();
              } catch (modeError) {
                console.error(
                  '[Onboarding] Could not choose scheduling mode:',
                  modeError,
                );
                setError('That choice could not be saved. Try again.');
              }
            }}
            testID="onboarding-not-ustp"
          />
        </OnboardingPage>
      </View>
    );
  }

  if (pageName === 'permissions') {
    return (
      <View
        style={[styles.root, {backgroundColor: t.bg}]}
        testID="onboarding-screen"
      >
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={t.bg} />
        <PermissionsStep
          headLabel={headLabel}
          onBack={onBack}
          backLabel={common.backLabel}
          progress={progress}
          onContinue={forward}
        />
      </View>
    );
  }

  const aiStatusLabel = sharedDownload
    ? `${
        getOfflineModelPreset(sharedDownload.modelId).shortLabel
      } · Downloading ${sharedDownload.progress.percent}%`
    : selectedModelId !== 'fast_path_only' && activeModelReady
    ? `${getOfflineModelPreset(selectedModelId).shortLabel} · Ready`
    : 'Fast-Path Only (Built-in)';

  return (
    <View
      style={[styles.root, {backgroundColor: t.bg}]}
      testID="onboarding-screen"
    >
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={t.bg} />
      <OnboardingPage
        {...common}
        scrollable
        title={schoolOn ? 'Almost done!' : 'Quick preferences.'}
        copy="Optional — you can change these anytime in Profile."
        note={notice ?? undefined}
        primary={{
          label: 'Start using LAFINA',
          onPress: () => complete(false),
          testID: 'onboarding-finish',
        }}
        secondary={{
          label: 'Take a quick tour first',
          onPress: () => complete(true),
          testID: 'onboarding-finish-tour',
        }}
        testID="onboarding-ready"
      >
        <TagRow>{statusTag() ?? <Tag label="Scheduling mode" />}</TagRow>
        <Card testID="onboarding-finish-ai-status">
          <SlimRow label="Offline AI" value={aiStatusLabel} />
        </Card>
        <Field
          label="Preferred name"
          value={answers.name}
          onChangeText={value => set('name', value.slice(0, 60))}
          maxLength={60}
          autoCapitalize="words"
          placeholder="e.g. Sam"
          returnKeyType="done"
          testID="onboarding-name"
        />
        <Text style={[styles.label, {color: t.ink}]}>Assistant tone</Text>
        <View style={onboardingStyles.rowGap}>
          <ChoiceButton
            label="Casual"
            selected={answers.tone === 'casual'}
            onPress={() =>
              set('tone', answers.tone === 'casual' ? null : 'casual')
            }
            testID="onboarding-tone-casual"
          />
          <ChoiceButton
            label="Professional"
            selected={answers.tone === 'professional'}
            onPress={() =>
              set(
                'tone',
                answers.tone === 'professional' ? null : 'professional',
              )
            }
            testID="onboarding-tone-professional"
          />
        </View>
        <Text style={[styles.label, {color: t.ink}]}>
          Remind me before class / tasks
        </Text>
        <View style={styles.wrap}>
          {LEAD_OPTIONS.map(minutes => (
            <ChoiceButton
              key={minutes}
              label={formatLeadOption(minutes)}
              selected={answers.lead === minutes}
              onPress={() =>
                set('lead', answers.lead === minutes ? null : minutes)
              }
              testID={`onboarding-lead-${minutes}`}
              style={styles.leadChip}
            />
          ))}
        </View>
        <CheckRow
          label="Remember my details for AI replies"
          detail={
            memoryOn
              ? 'Stored on this phone; selected facts may be included in online AI requests.'
              : 'Off: nothing is remembered. Scheduling still works.'
          }
          checked={memoryOn}
          onToggle={() => setMemoryOn(!memoryOn)}
          testID="onboarding-memory-toggle"
        />
      </OnboardingPage>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  label: {fontSize: 13, fontWeight: '600', marginTop: 4},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  leadChip: {
    flexGrow: 1,
    flexBasis: '22%',
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});
