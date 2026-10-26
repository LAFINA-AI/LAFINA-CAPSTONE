import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import type {PreferencesRepository} from '../core/domain/preferences';
import {speechPreferences} from '../core/domain/preferences';
import {speechClient, type SpeechClient} from '../core/native/textToSpeech';
import {ReplyMessage, type WrittenReply} from '../core/voice/ReplyMessage';
import {
  speechInputClient,
  type SpeechInputClient,
} from '../core/native/speechToText';
import {ChatScreen} from '../features/chat/ChatScreen';
import type {PlannerRepository} from '../core/domain/planner';
import {alarmClient} from '../core/native/reminders';
import type {AlarmClient} from '../core/native/reminders';
import {reconcilePlanner} from '../core/native/reconcilePlanner';
import {openPreferences} from '../core/storage/openPreferences';
import {openPlanner} from '../core/storage/openPlanner';
import {runPlannerSqlChecks} from '../core/storage/runPlannerSqlChecks';
import {ThemeContext, useTheme} from '../core/theme/ThemeContext';
import {
  dimensions,
  resolveTheme,
  spacing,
  typography,
} from '../core/theme/theme';
import {Button, Message} from '../core/ui/controls';
import {formatOverviewDate} from '../core/ui/formatOverviewDate';
import {PreferencesForm} from '../features/onboarding/PreferencesForm';
import {PlannerHarness} from '../features/scheduling/PlannerHarness';
import {ReminderSettings} from '../features/reminders/ReminderSettings';
import {PlannerScreen} from '../features/calendar/PlannerScreen';
import {SpeechSettings} from '../features/settings/SpeechSettings';
import {useLocalPreferences} from './useLocalPreferences';

const systemNow = () => new Date();
type Tab = 'Today' | 'Calendar' | 'Chat' | 'Settings';
const tabs: Tab[] = ['Today', 'Calendar', 'Chat', 'Settings'];
type SettingsNavigation =
  | {kind: 'tab'; tab: Tab}
  | {kind: 'planner' | 'retake' | 'reminders' | 'speech' | 'preferences'};

export function App({
  repositoryFactory = openPreferences,
  now = systemNow,
  plannerFactory = openPlanner,
  showPlannerHarness = NativeModules.CapstoneBuild?.plannerHarnessEnabled ===
    true,
  reminderClient = alarmClient,
  showReminderSettings = NativeModules.CapstoneReminders != null,
  speechAdapter = speechClient,
  showSpeechSettings = NativeModules.CapstoneTts != null,
  speechInputAdapter = speechInputClient,
  showSpeechInput = NativeModules.CapstoneStt != null,
}: {
  repositoryFactory?: () => PreferencesRepository;
  now?: () => Date;
  plannerFactory?: () => PlannerRepository;
  showPlannerHarness?: boolean;
  reminderClient?: AlarmClient;
  showReminderSettings?: boolean;
  speechAdapter?: SpeechClient;
  showSpeechSettings?: boolean;
  speechInputAdapter?: SpeechInputClient;
  showSpeechInput?: boolean;
}) {
  const {state, save, retry} = useLocalPreferences(repositoryFactory);
  const scheme = useColorScheme();
  const [tab, setTab] = useState<Tab>('Today');
  const [confirmRetake, setConfirmRetake] = useState(false);
  const [resetError, setResetError] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [plannerTools, setPlannerTools] = useState(false);
  const [reminderTools, setReminderTools] = useState(false);
  const [speechTools, setSpeechTools] = useState(false);
  const [reply, setReply] = useState<WrittenReply | null>(null);
  const replySequence = useRef(0);
  const publishReply = useCallback((text: string) => {
    setReply({
      id: `reply_${Date.now().toString(36)}_${replySequence.current++}`,
      text,
    });
  }, []);
  const [alarmError, setAlarmError] = useState(false);
  const [plannerDirty, setPlannerDirty] = useState(false);
  const [plannerSubscreen, setPlannerSubscreen] = useState(false);
  const [plannerBackRequest, setPlannerBackRequest] = useState(0);
  const [plannerRevision, setPlannerRevision] = useState(0);
  const [deliveryRevision, setDeliveryRevision] = useState(0);
  const appMounted = useRef(true);
  useEffect(() => {
    appMounted.current = true;
    return () => {
      appMounted.current = false;
    };
  }, []);
  const [pendingPlannerNavigation, setPendingPlannerNavigation] =
    useState<SettingsNavigation | null>(null);
  const plannerWithAlarms = useCallback(
    () =>
      reconcilePlanner(
        plannerFactory(),
        async () => {
          const result = await reminderClient.reconcile();
          if (appMounted.current) {
            setAlarmError(false);
            setDeliveryRevision(value => value + 1);
          }
          return result;
        },
        () => {
          if (appMounted.current) setAlarmError(true);
        },
      ),
    [plannerFactory, reminderClient],
  );
  useEffect(() => {
    if (state.kind !== 'ready' || !showReminderSettings) {
      return;
    }
    let active = true;
    const reconcile = async () => {
      try {
        plannerFactory();
        await reminderClient.reconcile();
        if (active) {
          setAlarmError(false);
          setDeliveryRevision(value => value + 1);
        }
      } catch {
        if (active) {
          setAlarmError(true);
        }
      }
    };
    void reconcile();
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active') {
        void reconcile();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [state.kind, showReminderSettings, plannerFactory, reminderClient]);
  const [settingsDraft, setSettingsDraft] = useState({
    dirty: false,
    saving: false,
  });
  const [pendingNavigation, setPendingNavigation] =
    useState<SettingsNavigation | null>(null);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const preferences = state.kind === 'ready' ? state.preferences : null;
  const theme = resolveTheme(preferences?.theme ?? 'system', scheme);
  const performNavigation = useCallback((destination: SettingsNavigation) => {
    setReply(null);
    setPendingPlannerNavigation(null);
    setPlannerDirty(false);
    setPlannerSubscreen(false);
    setPlannerRevision(value => value + 1);
    setPendingNavigation(null);
    setSettingsDraft({dirty: false, saving: false});
    setSettingsRevision(value => value + 1);
    setConfirmRetake(destination.kind === 'retake');
    setReminderTools(destination.kind === 'reminders');
    setSpeechTools(destination.kind === 'speech');
    if (destination.kind === 'tab') {
      setTab(destination.tab);
      setPlannerTools(false);
    } else if (destination.kind === 'planner') {
      setPlannerTools(true);
    }
  }, []);
  const requestNavigation = useCallback(
    (destination: SettingsNavigation) => {
      if (settingsDraft.saving || resetBusy) {
        return;
      }
      if (
        destination.kind === 'tab' &&
        destination.tab === tab &&
        !plannerTools &&
        !reminderTools &&
        !speechTools
      ) {
        return;
      }
      if ((tab === 'Today' || tab === 'Calendar') && plannerDirty) {
        setPendingPlannerNavigation(destination);
        return;
      }
      if (
        tab === 'Settings' &&
        !plannerTools &&
        !reminderTools &&
        settingsDraft.dirty
      ) {
        setPendingNavigation(destination);
        return;
      }
      performNavigation(destination);
    },
    [
      settingsDraft,
      plannerDirty,
      resetBusy,
      tab,
      plannerTools,
      reminderTools,
      speechTools,
      performNavigation,
    ],
  );
  useEffect(() => {
    if (!settingsDraft.dirty && !settingsDraft.saving) {
      setPendingNavigation(null);
    }
  }, [settingsDraft.dirty, settingsDraft.saving]);
  useEffect(() => {
    if (!plannerDirty) setPendingPlannerNavigation(null);
  }, [plannerDirty]);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsDraft.saving || resetBusy) {
        return true;
      }
      if (pendingPlannerNavigation) {
        setPendingPlannerNavigation(null);
        return true;
      }
      if ((tab === 'Today' || tab === 'Calendar') && plannerSubscreen) {
        setPlannerBackRequest(value => value + 1);
        return true;
      }
      if (pendingNavigation) {
        setPendingNavigation(null);
        return true;
      }
      if (speechTools) {
        requestNavigation({kind: 'preferences'});
        return true;
      }
      if (plannerTools) {
        setPlannerTools(false);
        return true;
      }
      if (reminderTools) {
        setReminderTools(false);
        return true;
      }
      if (confirmRetake) {
        setConfirmRetake(false);
        return true;
      }
      if (tab !== 'Today') {
        requestNavigation({kind: 'tab', tab: 'Today'});
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [
    tab,
    confirmRetake,
    plannerTools,
    reminderTools,
    speechTools,
    settingsDraft.saving,
    resetBusy,
    pendingNavigation,
    pendingPlannerNavigation,
    plannerSubscreen,
    requestNavigation,
  ]);
  async function retake() {
    if (!preferences) {
      return;
    }
    setResetBusy(true);
    try {
      await save({...preferences, onboardingCompletedAt: null});
      setConfirmRetake(false);
      setTab('Today');
      setResetError(false);
    } catch {
      setResetError(true);
    } finally {
      setResetBusy(false);
    }
  }
  const onboarded = preferences?.onboardingCompletedAt != null;
  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={theme}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <Modal
          visible={pendingPlannerNavigation !== null}
          transparent={false}
          onRequestClose={() => setPendingPlannerNavigation(null)}
        >
          <View
            accessibilityViewIsModal
            style={[
              styles.plannerModal,
              {backgroundColor: theme.colors.background},
            ]}
          >
            <Message text="You have unsaved planner changes. Keep editing or discard them before leaving." />
            <Button
              label="Keep editing planner"
              secondary
              onPress={() => setPendingPlannerNavigation(null)}
            />
            <Button
              label="Discard planner changes and continue"
              onPress={() => {
                if (pendingPlannerNavigation)
                  performNavigation(pendingPlannerNavigation);
              }}
            />
          </View>
        </Modal>
        <Modal
          testID="voice-navigation-confirmation"
          visible={speechTools && pendingNavigation !== null}
          transparent={false}
          onRequestClose={() => setPendingNavigation(null)}
        >
          <View
            accessibilityViewIsModal
            style={[
              styles.plannerModal,
              {backgroundColor: theme.colors.background},
            ]}
          >
            <Message text="You have unsaved voice options. Keep editing or discard them before leaving." />
            <Button
              label="Stay in voice settings"
              secondary
              onPress={() => setPendingNavigation(null)}
            />
            <Button
              label="Discard voice options and continue"
              onPress={() => {
                if (pendingNavigation) performNavigation(pendingNavigation);
              }}
            />
          </View>
        </Modal>
        <SafeAreaView
          style={[styles.root, {backgroundColor: theme.colors.background}]}
        >
          <View style={styles.root}>
            <KeyboardAvoidingView style={styles.root}>
              <ScrollView
                style={styles.viewport}
                key={onboarded ? tab : 'onboarding'}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scroll}
              >
                <View style={styles.content}>
                  <View style={styles.brandRow}>
                    <Image
                      source={require('../assets/lafina_app_logo.png')}
                      style={styles.brandImage}
                      accessible={false}
                      resizeMode="contain"
                    />
                    <View>
                      <Text
                        style={[styles.brand, {color: theme.colors.primary}]}
                      >
                        LAFINA
                      </Text>
                      <Text
                        style={[
                          styles.brandCaption,
                          {color: theme.colors.muted},
                        ]}
                      >
                        Student planner · Offline
                      </Text>
                    </View>
                  </View>
                  {state.kind === 'loading' ? (
                    <Message text="Opening your local planner…" />
                  ) : state.kind === 'error' ? (
                    <View style={styles.padded}>
                      <Message
                        error
                        text="Local settings could not be opened. Your saved data has not been reset. Try again."
                      />
                      <Button label="Retry opening settings" onPress={retry} />
                    </View>
                  ) : !onboarded ? (
                    <PreferencesForm
                      initial={state.preferences}
                      onboarding
                      onSave={async next => {
                        await save({
                          ...next,
                          onboardingCompletedAt: now().toISOString(),
                        });
                        setTab('Today');
                      }}
                    />
                  ) : (
                    <>
                      {reply && !speechTools && tab !== 'Chat' ? (
                        <View style={styles.padded}>
                          <ReplyMessage
                            reply={reply}
                            mode={state.preferences.replyMode}
                            options={speechPreferences(state.preferences)}
                            client={speechAdapter}
                          />
                        </View>
                      ) : null}
                      {alarmError ? (
                        <Message
                          error
                          text="Android reminder delivery needs attention. Your planner changes stay saved. Open Settings → Reminder delivery to check permissions and retry."
                        />
                      ) : null}
                      {tab === 'Settings' ? (
                        speechTools && showSpeechSettings ? (
                          <View style={styles.padded}>
                            <Button
                              label="Back to preferences"
                              secondary
                              disabled={settingsDraft.saving}
                              onPress={() =>
                                requestNavigation({kind: 'preferences'})
                              }
                            />
                            <SpeechSettings
                              client={speechAdapter}
                              showDiagnostics={showPlannerHarness}
                              options={speechPreferences(state.preferences)}
                              replyMode={state.preferences.replyMode}
                              onDraftStateChange={setSettingsDraft}
                              onSave={async options => {
                                await save({
                                  ...state.preferences,
                                  tts: options,
                                });
                              }}
                            />
                          </View>
                        ) : reminderTools && showReminderSettings ? (
                          <View style={styles.padded}>
                            <Button
                              label="Back to preferences"
                              secondary
                              onPress={() => setReminderTools(false)}
                            />
                            <ReminderSettings
                              client={reminderClient}
                              plannerFactory={plannerWithAlarms}
                              showQa={showPlannerHarness}
                            />
                          </View>
                        ) : plannerTools && showPlannerHarness ? (
                          <View style={styles.padded}>
                            <Button
                              label="Back to preferences"
                              secondary
                              onPress={() => setPlannerTools(false)}
                            />
                            <PlannerTools
                              factory={
                                showReminderSettings
                                  ? plannerWithAlarms
                                  : plannerFactory
                              }
                              timezone={state.preferences.timezone}
                            />
                          </View>
                        ) : (
                          <>
                            {pendingNavigation ? (
                              <View style={styles.padded}>
                                <Message text="You have unsaved preferences. Keep editing or discard them before leaving." />
                                <Button
                                  label="Stay in Settings"
                                  secondary
                                  onPress={() => setPendingNavigation(null)}
                                />
                                <Button
                                  label="Discard preferences and continue"
                                  secondary
                                  onPress={() =>
                                    performNavigation(pendingNavigation)
                                  }
                                />
                              </View>
                            ) : null}
                            {showReminderSettings ? (
                              <View style={styles.padded}>
                                <Button
                                  label="Reminder delivery"
                                  secondary
                                  disabled={settingsDraft.saving || resetBusy}
                                  onPress={() =>
                                    requestNavigation({kind: 'reminders'})
                                  }
                                />
                              </View>
                            ) : null}
                            {showSpeechSettings ? (
                              <View style={styles.padded}>
                                <Button
                                  label="Offline speech settings"
                                  secondary
                                  disabled={settingsDraft.saving || resetBusy}
                                  onPress={() =>
                                    requestNavigation({kind: 'speech'})
                                  }
                                />
                              </View>
                            ) : null}
                            {showPlannerHarness ? (
                              <View style={styles.padded}>
                                <Button
                                  label="Open data test harness"
                                  secondary
                                  disabled={settingsDraft.saving || resetBusy}
                                  onPress={() =>
                                    requestNavigation({kind: 'planner'})
                                  }
                                />
                              </View>
                            ) : null}
                            <PreferencesForm
                              key={settingsRevision}
                              initial={state.preferences}
                              onboarding={false}
                              onSave={save}
                              onDraftStateChange={setSettingsDraft}
                            />
                            <View style={styles.padded}>
                              {confirmRetake ? (
                                <>
                                  <Message text="Reopen setup? Your preferences will be kept. This does not erase local data." />
                                  <Button
                                    label={
                                      resetBusy
                                        ? 'Reopening setup…'
                                        : 'Reopen onboarding'
                                    }
                                    disabled={resetBusy}
                                    onPress={() => {
                                      void retake();
                                    }}
                                  />
                                  <Button
                                    label="Keep current setup"
                                    secondary
                                    disabled={resetBusy}
                                    onPress={() => setConfirmRetake(false)}
                                  />
                                </>
                              ) : (
                                <Button
                                  label="Review onboarding"
                                  secondary
                                  disabled={settingsDraft.saving || resetBusy}
                                  onPress={() =>
                                    requestNavigation({kind: 'retake'})
                                  }
                                />
                              )}
                              {resetError ? (
                                <Message
                                  error
                                  text="Setup could not be reopened. Your current preferences are unchanged. Try again."
                                />
                              ) : null}
                              {__DEV__ ? (
                                <>
                                  <Button
                                    label={
                                      diagnostics
                                        ? 'Hide diagnostics'
                                        : 'Show diagnostics'
                                    }
                                    secondary
                                    onPress={() =>
                                      setDiagnostics(value => !value)
                                    }
                                  />
                                  {diagnostics ? (
                                    <Message text="Local settings and planner: SQLite. Reminder status is in Reminder delivery. Offline commands require review; optional Android TTS and hold-to-talk use native adapters. No cloud engine is configured." />
                                  ) : null}
                                </>
                              ) : null}
                            </View>
                          </>
                        )
                      ) : tab === 'Today' || tab === 'Calendar' ? (
                        <>
                          {tab === 'Today' ? (
                            <Overview
                              tab="Today"
                              nickname={state.preferences.nickname}
                              timezone={state.preferences.timezone}
                              date={now()}
                              onSettings={() =>
                                requestNavigation({
                                  kind: 'tab',
                                  tab: 'Settings',
                                })
                              }
                            />
                          ) : null}
                          <PlannerScreen
                            key={`${tab}_${plannerRevision}`}
                            mode={tab}
                            preferences={state.preferences}
                            factory={
                              showReminderSettings
                                ? plannerWithAlarms
                                : plannerFactory
                            }
                            reminderClient={reminderClient}
                            deliveryRevision={deliveryRevision}
                            now={now}
                            backRequest={plannerBackRequest}
                            onDraftStateChange={setPlannerDirty}
                            onRouteChange={setPlannerSubscreen}
                            onSaved={kind =>
                              publishReply(
                                kind === 'task'
                                  ? 'Your task is saved on this phone.'
                                  : 'Your event is saved on this phone.',
                              )
                            }
                          />
                        </>
                      ) : (
                        <ChatScreen
                          factory={
                            showReminderSettings
                              ? plannerWithAlarms
                              : plannerFactory
                          }
                          preferences={state.preferences}
                          now={now}
                          speech={speechAdapter}
                          speechInput={speechInputAdapter}
                          showSpeechInput={showSpeechInput}
                          showDiagnostics={showPlannerHarness}
                        />
                      )}
                    </>
                  )}
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
            {onboarded ? (
              <View
                accessible={false}
                collapsable={false}
                style={[
                  styles.tabs,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                {tabs.map(item => (
                  <Pressable
                    key={item}
                    accessibilityRole="tab"
                    accessibilityState={{
                      selected: tab === item,
                      disabled: settingsDraft.saving || resetBusy,
                    }}
                    disabled={settingsDraft.saving || resetBusy}
                    onPress={() => {
                      requestNavigation({kind: 'tab', tab: item});
                    }}
                    style={[
                      styles.tab,
                      {
                        backgroundColor:
                          tab === item
                            ? theme.colors.selected
                            : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        {
                          color:
                            tab === item
                              ? theme.colors.primary
                              : theme.colors.muted,
                        },
                      ]}
                    >
                      {tab === item ? '• ' : ''}
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

function PlannerTools({
  factory,
  timezone,
}: {
  factory: () => PlannerRepository;
  timezone: string;
}) {
  const [repository, setRepository] = useState<PlannerRepository | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sqlResult, setSqlResult] = useState('');
  const [sqlBusy, setSqlBusy] = useState(false);
  useEffect(() => {
    try {
      setRepository(factory());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [factory, attempt]);
  if (failed) {
    return (
      <>
        <Message
          error
          text="Planner storage could not be opened. Saved data has not been reset."
        />
        <Button
          label="Retry opening planner"
          onPress={() => setAttempt(value => value + 1)}
        />
      </>
    );
  }
  return repository ? (
    <>
      <Button
        label={
          sqlBusy ? 'Checking isolated SQLite…' : 'Run isolated SQLite checks'
        }
        disabled={sqlBusy}
        secondary
        onPress={() => {
          setSqlBusy(true);
          void runPlannerSqlChecks()
            .then(setSqlResult)
            .catch(() =>
              setSqlResult(
                'FAIL: native SQLite QA checks could not finish. Student data was not changed.',
              ),
            )
            .finally(() => setSqlBusy(false));
        }}
      />
      {sqlResult ? (
        <Message text={sqlResult} error={sqlResult.startsWith('FAIL')} />
      ) : null}
      <PlannerHarness repository={repository} timezone={timezone} />
    </>
  ) : (
    <Message text="Opening planner storage…" />
  );
}

function Overview({
  tab,
  nickname,
  timezone,
  date,
  onSettings,
}: {
  tab: Exclude<Tab, 'Settings'>;
  nickname: string;
  timezone: string;
  date: Date;
  onSettings: () => void;
}) {
  const {colors} = useTheme();
  const formattedDate = formatOverviewDate(date, timezone);
  return (
    <View style={styles.padded}>
      <Text
        accessibilityRole="header"
        style={[styles.title, {color: colors.text}]}
      >
        {tab === 'Today' ? `You're set, ${nickname || 'Student'}.` : tab}
      </Text>
      {tab === 'Today' ? (
        <>
          <Message text={formattedDate.text} />
          {formattedDate.warning ? (
            <Message text={formattedDate.warning} error />
          ) : null}
          <Text style={[styles.heading, {color: colors.text}]}>
            A quieter place for your academic plans.
          </Text>
          <Message text="Plan your academic day below. Review Android reminder delivery in Settings." />
          <Message
            text={`Timezone: ${timezone}. No account or connection required.`}
          />
          <Button label="Adjust my preferences" onPress={onSettings} />
        </>
      ) : (
        <>
          <Message
            text={
              tab === 'Calendar'
                ? 'Your academic calendar will appear here. Creating tasks, events and reminders is not available yet.'
                : 'Review a local text or speech draft here. Automatic scheduling commands are not available yet.'
            }
          />
          <Message text="Your local preferences remain available in Settings." />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plannerModal: {flex: 1, justifyContent: 'center', padding: spacing.lg},
  root: {flex: 1},
  viewport: {flex: 1, overflow: 'hidden'},
  scroll: {flexGrow: 1},
  content: {
    width: '100%',
    maxWidth: dimensions.contentMax,
    alignSelf: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  brandImage: {width: 48, height: 48},
  brandCaption: {fontSize: typography.small},
  brand: {
    fontSize: typography.small,
    fontWeight: '700',
    letterSpacing: 1,
  },
  padded: {padding: spacing.lg},
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  heading: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  tabs: {
    // Adapted from incoming CustomTabBar at 9c183a2; stays in normal layout
    // so the final planner controls are never hidden beneath an overlay.
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: dimensions.border,
    borderRadius: dimensions.navigationRadius,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    maxWidth: dimensions.contentMax,
    alignSelf: 'center',
    width: '92%',
    padding: spacing.sm,
  },
  tab: {
    flexGrow: 1,
    minHeight: dimensions.control,
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: dimensions.navigationRadius,
  },
  tabText: {fontSize: typography.small, fontWeight: '600', textAlign: 'center'},
});
