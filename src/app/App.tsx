import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  BackHandler,
  Image,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
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
import {ThemeContext, useTheme} from '../core/theme/ThemeContext';
import {
  dimensions,
  resolveTheme,
  spacing,
  typography,
} from '../core/theme/theme';
import {Button, Message} from '../core/ui/controls';
import {PreferencesForm} from '../features/onboarding/PreferencesForm';
import {ReminderSettings} from '../features/reminders/ReminderSettings';
import {PlannerScreen} from '../features/calendar/PlannerScreen';
import {SpeechSettings} from '../features/settings/SpeechSettings';
import {useLocalPreferences} from './useLocalPreferences';
import {StudentTabBar} from './StudentTabBar';
import {ProfileScreen} from '../features/settings/ProfileScreen';
import {PlannerDiagnostics} from '../features/settings/PlannerDiagnostics';
import {NotesScreen} from '../features/notes/NotesScreen';
import {openNotes} from '../core/storage/openNotes';
import type {NotesRepository} from '../core/domain/notes';

const systemNow = () => new Date();
type Tab = 'Today' | 'Calendar' | 'Chat' | 'Notes' | 'Settings';
type SettingsNavigation =
  | {kind: 'tab'; tab: Tab}
  | {
      kind:
        | 'planner'
        | 'retake'
        | 'reminders'
        | 'speech'
        | 'preferences'
        | 'profile'
        | 'voice';
    };

export function App({
  repositoryFactory = openPreferences,
  now = systemNow,
  plannerFactory = openPlanner,
  notesFactory = openNotes,
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
  notesFactory?: () => NotesRepository;
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
  const [tab, setTab] = useState<Tab>('Calendar');
  const [confirmRetake, setConfirmRetake] = useState(false);
  const [resetError, setResetError] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [plannerTools, setPlannerTools] = useState(false);
  const [reminderTools, setReminderTools] = useState(false);
  const [speechTools, setSpeechTools] = useState(false);
  const [preferencesTools, setPreferencesTools] = useState(false);
  const [panelParent, setPanelParent] = useState<'profile' | 'preferences'>(
    'profile',
  );
  const [voiceRequest, setVoiceRequest] = useState(0);
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSubscreen, setNotesSubscreen] = useState(false);
  const [notesBackRequest, setNotesBackRequest] = useState(0);
  const [notesRevision, setNotesRevision] = useState(0);
  const [pendingNotesNavigation, setPendingNotesNavigation] =
    useState<SettingsNavigation | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [counts, setCounts] = useState<{
    completedTasks: number;
    notes: number;
  } | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
  const performNavigation = useCallback(
    (destination: SettingsNavigation) => {
      if (
        destination.kind === 'planner' ||
        destination.kind === 'reminders' ||
        destination.kind === 'speech'
      ) {
        setPanelParent(preferencesTools ? 'preferences' : 'profile');
      }
      setReply(null);
      setPendingPlannerNavigation(null);
      setPlannerDirty(false);
      setPlannerSubscreen(false);
      setPlannerRevision(value => value + 1);
      setPendingNotesNavigation(null);
      setNotesDirty(false);
      setNotesSubscreen(false);
      setNotesRevision(value => value + 1);
      setPendingNavigation(null);
      setSettingsDraft({dirty: false, saving: false});
      setSettingsRevision(value => value + 1);
      setConfirmRetake(destination.kind === 'retake');
      setReminderTools(destination.kind === 'reminders');
      setSpeechTools(destination.kind === 'speech');
      setPlannerTools(destination.kind === 'planner');
      setPreferencesTools(
        destination.kind === 'preferences' || destination.kind === 'retake',
      );
      if (destination.kind === 'voice') {
        setTab('Chat');
        setVoiceRequest(value => value + 1);
      } else {
        setVoiceRequest(0);
        setTab(destination.kind === 'tab' ? destination.tab : 'Settings');
      }
    },
    [preferencesTools],
  );
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
        !speechTools &&
        !preferencesTools &&
        !notesSubscreen
      ) {
        return;
      }
      if ((tab === 'Today' || tab === 'Calendar') && plannerDirty) {
        setPendingPlannerNavigation(destination);
        return;
      }
      if (tab === 'Notes' && notesDirty) {
        setPendingNotesNavigation(destination);
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
      notesDirty,
      notesSubscreen,
      preferencesTools,
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
    if (!notesDirty) setPendingNotesNavigation(null);
  }, [notesDirty]);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsDraft.saving || resetBusy) return true;
      if (pendingPlannerNavigation) {
        setPendingPlannerNavigation(null);
        return true;
      }
      if (pendingNotesNavigation) {
        setPendingNotesNavigation(null);
        return true;
      }
      if (pendingNavigation) {
        setPendingNavigation(null);
        return true;
      }
      if ((tab === 'Today' || tab === 'Calendar') && plannerSubscreen) {
        setPlannerBackRequest(value => value + 1);
        return true;
      }
      if (tab === 'Notes' && notesSubscreen) {
        setNotesBackRequest(value => value + 1);
        return true;
      }
      if (confirmRetake) {
        setConfirmRetake(false);
        return true;
      }
      if (speechTools || reminderTools || plannerTools) {
        requestNavigation({kind: panelParent});
        return true;
      }
      if (preferencesTools) {
        requestNavigation({kind: 'profile'});
        return true;
      }
      if (tab !== 'Calendar') {
        requestNavigation({kind: 'tab', tab: 'Calendar'});
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
    preferencesTools,
    panelParent,
    settingsDraft.saving,
    resetBusy,
    pendingNavigation,
    pendingPlannerNavigation,
    pendingNotesNavigation,
    plannerSubscreen,
    notesSubscreen,
    requestNavigation,
  ]);
  useEffect(() => {
    if (state.kind !== 'ready' || tab !== 'Settings') return;
    try {
      setCounts(notesFactory().counts());
    } catch {
      setCounts(null);
    }
  }, [state.kind, tab, notesFactory]);
  async function retake() {
    if (!preferences) {
      return;
    }
    setResetBusy(true);
    try {
      await save({...preferences, onboardingCompletedAt: null});
      setConfirmRetake(false);
      setTab('Calendar');
      setPreferencesTools(false);
      setResetError(false);
    } catch {
      setResetError(true);
    } finally {
      setResetBusy(false);
    }
  }
  const onboarded = preferences?.onboardingCompletedAt != null;
  let content;
  if (state.kind === 'loading') {
    content = (
      <Page>
        <Message text="Opening your local planner…" />
      </Page>
    );
  } else if (state.kind === 'error') {
    content = (
      <Page>
        <Message
          error
          text="Local settings could not be opened. Your saved data has not been reset. Try again."
        />
        <Button label="Retry opening settings" onPress={retry} />
      </Page>
    );
  } else if (!onboarded) {
    content = (
      <Page>
        <View style={styles.brandRow}>
          <Image
            source={require('../assets/lafina_app_logo.png')}
            style={styles.brandImage}
            accessible={false}
          />
          <Text style={[styles.brand, {color: theme.colors.primary}]}>
            LAFINA / STUDENT
          </Text>
        </View>
        <PreferencesForm
          initial={state.preferences}
          onboarding
          onSave={async next => {
            await save({...next, onboardingCompletedAt: now().toISOString()});
            setTab('Calendar');
            setPreferencesTools(false);
          }}
        />
      </Page>
    );
  } else if (tab === 'Settings') {
    content =
      preferencesTools || speechTools || reminderTools || plannerTools ? (
        <Page>
          <View style={styles.panelBack}>
            <Button
              label={
                preferencesTools || panelParent === 'profile'
                  ? 'Back to profile'
                  : 'Back to preferences'
              }
              secondary
              disabled={settingsDraft.saving || resetBusy}
              onPress={() =>
                requestNavigation({
                  kind: preferencesTools ? 'profile' : panelParent,
                })
              }
            />
          </View>
          {speechTools ? (
            <View style={styles.padded}>
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
          ) : reminderTools ? (
            <View style={styles.padded}>
              <ReminderSettings
                client={reminderClient}
                plannerFactory={plannerWithAlarms}
                showQa={showPlannerHarness}
              />
            </View>
          ) : plannerTools && showPlannerHarness ? (
            <View style={styles.padded}>
              <PlannerDiagnostics
                factory={
                  showReminderSettings ? plannerWithAlarms : plannerFactory
                }
                timezone={state.preferences.timezone}
              />
            </View>
          ) : (
            <>
              {showReminderSettings ? (
                <View style={styles.padded}>
                  <Button
                    label="Reminder delivery"
                    secondary
                    disabled={settingsDraft.saving || resetBusy}
                    onPress={() => requestNavigation({kind: 'reminders'})}
                  />
                </View>
              ) : null}
              {showSpeechSettings ? (
                <View style={styles.padded}>
                  <Button
                    label="Offline speech settings"
                    secondary
                    disabled={settingsDraft.saving || resetBusy}
                    onPress={() => requestNavigation({kind: 'speech'})}
                  />
                </View>
              ) : null}
              {showPlannerHarness ? (
                <View style={styles.padded}>
                  <Button
                    label="Open data test harness"
                    secondary
                    disabled={settingsDraft.saving || resetBusy}
                    onPress={() => requestNavigation({kind: 'planner'})}
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
                        resetBusy ? 'Reopening setup…' : 'Reopen onboarding'
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
                    onPress={() => requestNavigation({kind: 'retake'})}
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
                        diagnostics ? 'Hide diagnostics' : 'Show diagnostics'
                      }
                      secondary
                      onPress={() => setDiagnostics(value => !value)}
                    />
                    {diagnostics ? (
                      <Message text="Local settings and planner: SQLite. Reminder status is in Reminder delivery. Offline commands require review; optional Android TTS and hold-to-talk use native adapters. No cloud engine is configured." />
                    ) : null}
                  </>
                ) : null}
              </View>
            </>
          )}
        </Page>
      ) : (
        <Page>
          <ProfileScreen
            preferences={state.preferences}
            counts={counts}
            onPreferences={() => requestNavigation({kind: 'preferences'})}
            onReminders={() => requestNavigation({kind: 'reminders'})}
            onSpeech={() => requestNavigation({kind: 'speech'})}
            onPlannerTools={
              showPlannerHarness
                ? () => requestNavigation({kind: 'planner'})
                : undefined
            }
            onClockFormat={async clockFormat => {
              await save({...state.preferences, clockFormat});
            }}
            onWeekStartsMonday={async weekStartsMonday => {
              await save({...state.preferences, weekStartsMonday});
            }}
            onSavingChange={saving => setSettingsDraft({dirty: false, saving})}
          />
        </Page>
      );
  } else if (tab === 'Notes') {
    content = (
      <NotesScreen
        key={notesRevision}
        factory={notesFactory}
        now={now}
        backRequest={notesBackRequest}
        onDraftStateChange={setNotesDirty}
        onRouteChange={setNotesSubscreen}
      />
    );
  } else if (tab === 'Chat') {
    content = (
      <ChatScreen
        factory={showReminderSettings ? plannerWithAlarms : plannerFactory}
        preferences={state.preferences}
        now={now}
        speech={speechAdapter}
        speechInput={speechInputAdapter}
        showSpeechInput={showSpeechInput}
        showDiagnostics={showPlannerHarness}
        voiceRequest={voiceRequest}
      />
    );
  } else {
    content = (
      <PlannerScreen
        key={`${tab}_${plannerRevision}`}
        mode={tab}
        preferences={state.preferences}
        factory={showReminderSettings ? plannerWithAlarms : plannerFactory}
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
    );
  }
  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={theme}>
        <StatusBar
          barStyle={theme.dark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.colors.background}
        />
        <SafeAreaView
          style={[styles.root, {backgroundColor: theme.colors.background}]}
        >
          <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {alarmError ? (
              <View style={styles.banner}>
                <Message
                  error
                  text="Android reminder delivery needs attention. Your planner changes stay saved. Open Profile → Reminder delivery to check permissions and retry."
                />
              </View>
            ) : null}
            {reply && (tab === 'Calendar' || tab === 'Today') ? (
              <View style={styles.banner}>
                <ReplyMessage
                  reply={reply}
                  mode={preferences?.replyMode ?? 'text'}
                  options={speechPreferences(preferences!)}
                  client={speechAdapter}
                />
              </View>
            ) : null}
            <View style={styles.root}>{content}</View>
          </KeyboardAvoidingView>
          {onboarded && !keyboardOpen ? (
            <StudentTabBar
              tab={tab}
              disabled={settingsDraft.saving || resetBusy}
              onTab={value => requestNavigation({kind: 'tab', tab: value})}
              onVoice={() => requestNavigation({kind: 'voice'})}
            />
          ) : null}
        </SafeAreaView>
        <NavigationConfirmation
          visible={pendingPlannerNavigation !== null}
          message="You have unsaved planner changes. Keep editing or discard them before leaving."
          keepLabel="Keep editing planner"
          discardLabel="Discard planner changes and continue"
          onKeep={() => setPendingPlannerNavigation(null)}
          onDiscard={() => {
            if (pendingPlannerNavigation)
              performNavigation(pendingPlannerNavigation);
          }}
        />
        <NavigationConfirmation
          visible={pendingNotesNavigation !== null}
          message="You have unsaved note changes. Keep editing or discard them before leaving."
          keepLabel="Keep editing note"
          discardLabel="Discard note changes and continue"
          onKeep={() => setPendingNotesNavigation(null)}
          onDiscard={() => {
            if (pendingNotesNavigation)
              performNavigation(pendingNotesNavigation);
          }}
        />
        <NavigationConfirmation
          testID={
            speechTools
              ? 'voice-navigation-confirmation'
              : 'preferences-navigation-confirmation'
          }
          visible={pendingNavigation !== null}
          message={
            speechTools
              ? 'You have unsaved voice options. Keep editing or discard them before leaving.'
              : 'You have unsaved preferences. Keep editing or discard them before leaving.'
          }
          keepLabel={
            speechTools ? 'Stay in voice settings' : 'Stay in preferences'
          }
          discardLabel={
            speechTools
              ? 'Discard voice options and continue'
              : 'Discard preferences and continue'
          }
          onKeep={() => setPendingNavigation(null)}
          onDiscard={() => {
            if (pendingNavigation) performNavigation(pendingNavigation);
          }}
        />
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

function Page({children}: {children: React.ReactNode}) {
  return (
    <ScrollView
      style={styles.root}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.page}
    >
      <View style={styles.pageContent}>{children}</View>
    </ScrollView>
  );
}
function NavigationConfirmation({
  visible,
  message,
  keepLabel,
  discardLabel,
  onKeep,
  onDiscard,
  testID,
}: {
  visible: boolean;
  message: string;
  keepLabel: string;
  discardLabel: string;
  onKeep: () => void;
  onDiscard: () => void;
  testID?: string;
}) {
  const {colors} = useTheme();
  return (
    <Modal visible={visible} testID={testID} onRequestClose={onKeep}>
      <SafeAreaView
        accessibilityViewIsModal
        style={[styles.confirmation, {backgroundColor: colors.background}]}
      >
        <Message text={message} />
        <Button label={keepLabel} secondary onPress={onKeep} />
        <Button label={discardLabel} onPress={onDiscard} />
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: {flex: 1},
  page: {flexGrow: 1},
  pageContent: {
    width: '100%',
    maxWidth: dimensions.contentMax,
    alignSelf: 'center',
  },
  padded: {padding: spacing.lg},
  panelBack: {paddingHorizontal: spacing.md, paddingTop: spacing.sm},
  banner: {paddingHorizontal: spacing.md, paddingTop: spacing.sm},
  confirmation: {flex: 1, justifyContent: 'center', padding: spacing.lg},
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  brandImage: {width: 48, height: 48},
  brand: {fontSize: typography.small, fontWeight: '700', letterSpacing: 1},
});
