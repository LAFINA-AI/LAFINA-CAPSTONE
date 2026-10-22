import {useCallback, useEffect, useState} from 'react';
import {
  AppState,
  BackHandler,
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
import {useLocalPreferences} from './useLocalPreferences';

const systemNow = () => new Date();
type Tab = 'Today' | 'Calendar' | 'Chat' | 'Settings';
const tabs: Tab[] = ['Today', 'Calendar', 'Chat', 'Settings'];
type SettingsNavigation =
  | {kind: 'tab'; tab: Tab}
  | {kind: 'planner' | 'retake' | 'reminders'};

export function App({
  repositoryFactory = openPreferences,
  now = systemNow,
  plannerFactory = openPlanner,
  showPlannerHarness = NativeModules.CapstoneBuild?.plannerHarnessEnabled ===
    true,
  reminderClient = alarmClient,
  showReminderSettings = NativeModules.CapstoneReminders != null,
}: {
  repositoryFactory?: () => PreferencesRepository;
  now?: () => Date;
  plannerFactory?: () => PlannerRepository;
  showPlannerHarness?: boolean;
  reminderClient?: AlarmClient;
  showReminderSettings?: boolean;
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
  const [alarmError, setAlarmError] = useState(false);
  const plannerWithAlarms = useCallback(
    () =>
      reconcilePlanner(
        plannerFactory(),
        () => reminderClient.reconcile(),
        () => setAlarmError(true),
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
    setPendingNavigation(null);
    setSettingsDraft({dirty: false, saving: false});
    setSettingsRevision(value => value + 1);
    setConfirmRetake(destination.kind === 'retake');
    setReminderTools(destination.kind === 'reminders');
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
        !reminderTools
      ) {
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
      resetBusy,
      tab,
      plannerTools,
      reminderTools,
      performNavigation,
    ],
  );
  useEffect(() => {
    if (!settingsDraft.dirty && !settingsDraft.saving) {
      setPendingNavigation(null);
    }
  }, [settingsDraft.dirty, settingsDraft.saving]);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsDraft.saving || resetBusy) {
        return true;
      }
      if (pendingNavigation) {
        setPendingNavigation(null);
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
    settingsDraft.saving,
    resetBusy,
    pendingNavigation,
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
        <SafeAreaView
          style={[styles.root, {backgroundColor: theme.colors.background}]}
        >
          <View style={styles.root}>
            <ScrollView
              style={styles.viewport}
              key={onboarded ? tab : 'onboarding'}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scroll}
            >
              <View style={styles.content}>
                <Text style={[styles.brand, {color: theme.colors.primary}]}>
                  LAFINA{' '}
                  <Text style={{color: theme.colors.muted}}> / STUDENT</Text>
                </Text>
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
                    {alarmError ? (
                      <Message
                        error
                        text="Android reminder delivery needs attention. Your planner changes stay saved. Open Settings → Reminder delivery to check permissions and retry."
                      />
                    ) : null}
                    {tab === 'Settings' ? (
                      reminderTools && showReminderSettings ? (
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
                                  <Message text="Local settings and planner: SQLite. Native reminder status is in Reminder delivery. Network, STT, TTS and intent engines are absent. No microphone permission is requested." />
                                ) : null}
                              </>
                            ) : null}
                          </View>
                        </>
                      )
                    ) : (
                      <Overview
                        tab={tab}
                        nickname={state.preferences.nickname}
                        timezone={state.preferences.timezone}
                        date={now()}
                        onSettings={() => setTab('Settings')}
                      />
                    )}
                  </>
                )}
              </View>
            </ScrollView>
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
          <Message text="Your local setup is saved. Reminder delivery can be reviewed in Settings. Calendar tools will arrive in a later update." />
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
                : 'Your scheduling conversations will appear here. Text commands and hold-to-talk are not available yet.'
            }
          />
          <Message text="Your local preferences remain available in Settings." />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  viewport: {flex: 1, overflow: 'hidden'},
  scroll: {flexGrow: 1},
  content: {
    width: '100%',
    maxWidth: dimensions.contentMax,
    alignSelf: 'center',
  },
  brand: {
    fontSize: typography.small,
    fontWeight: '700',
    letterSpacing: 1,
    padding: spacing.lg,
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
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: dimensions.border,
    padding: spacing.xs,
  },
  tab: {
    flexGrow: 1,
    minHeight: dimensions.control,
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: dimensions.radius,
  },
  tabText: {fontSize: typography.small, fontWeight: '600', textAlign: 'center'},
});
