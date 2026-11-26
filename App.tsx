import {recoverNativeCall} from './src/scheduler/nativeCallRecovery';
import {callLifecycle, sameCall} from './src/scheduler/callLifecycle';
import {
  finishNativeIncomingCall,
  consumePendingNativeCalls,
} from './src/scheduler/reminderAlarm';
import {cancelFocusTimer} from './src/scheduler/focusTimer';
import {preparePerformanceFixture} from './src/utils/performanceFixture';
import {beginTabSwitch, finishTabSwitch} from './src/utils/tabPerformance';
import {generateId} from './src/utils';
import type {
  CallNavigationRequest,
  CallNavigationTarget,
} from './src/ui/navigation/callNavigation';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  Keyboard,
  AppState,
  DeviceEventEmitter,
  PermissionsAndroid,
  Platform,
  BackHandler,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import {Fonts, Layout, Spacing, useThemedStyles} from './src/ui/theme';
import {
  db,
  initDatabase,
  userStore,
  syncOutboxStore,
  productTourStore,
  calendarVisibilityStore,
  importedBatchesStore,
} from './src/storage';
import {CustomTabBar, TabType} from './src/ui/components/CustomTabBar';
import {StorageRecoveryScreen} from './src/ui/screens/StorageRecoveryScreen';
import {endActiveVoiceConversation} from './src/cloud/voiceConversation';
import {backendSelection} from './src/cloud/backendSelection';
import {startMorningBriefing} from './src/ai/briefing/morningBriefing';
import {ThemeProvider, useTheme} from './src/ui/contexts/ThemeContext';
import type {ThemeColors} from './src/ui/contexts/ThemeContext';
import {MeetingsProvider} from './src/ui/contexts/MeetingsContext';
import {useStorageRevision} from './src/ui/hooks/useStorageRevision';
import {
  startAlarmLifecycle,
  rescheduleUserReminders,
  startReminderPoller,
  stopReminderPoller,
  getReminderPermissionStatus,
  reconcileReminderDelivery,
  admitReminderCall,
  applyNotificationAction,
  disconnectCall,
  isNotificationAction,
  isNotifyOnlyReminder,
  showNotifyOnlyReminderAlert,
  syncAlertPreferencesToNative,
  EVENT_CALL_TRIGGER,
} from './src/scheduler';
import type {
  CallRequest,
  NativeCallAction,
  NativeCallTrigger,
  ReminderPermissionStatus,
} from './src/scheduler';
import {syncWorker} from './src/sync/syncWorker';
import {createSyncScheduler} from './src/sync/syncScheduler';
import {appUpdater} from './src/updates';

// Screens & UI
import {ChatScreen} from './src/ui/screens/ChatScreen';
import {ProfileScreen} from './src/ui/screens/ProfileScreen';
import {CalendarScreen} from './src/ui/screens/calendar';
import {DashboardScreen} from './src/ui/screens/dashboard';
import {SkillsScreen as NotesScreen} from './src/ui/screens/skills/SkillsScreen';
import type {SkillLaunch} from './src/skills/skillLaunch';
import {SynthSplash} from './src/ui/splash';
import {WelcomeScreen} from './src/ui/screens/WelcomeScreen';
import {LoginScreen} from './src/ui/screens/LoginScreen';
import {RegisterScreen} from './src/ui/screens/RegisterScreen';
import {OnboardingScreen} from './src/ui/screens/OnboardingScreen';
import {IncomingCallScreen} from './src/ui/screens/IncomingCallScreen';
import {ReminderPermissionModal} from './src/ui/components/call/ReminderPermissionModal';
import {ProductTour} from './src/ui/tour/ProductTour';
import {buildWalkthroughSteps, type TourStep} from './src/ui/tour/tourSteps';
import {isGuestAccount} from './src/cloud/entitlements';
import {getUstpEligibility} from './src/storage/ustpEligibility';
import {studentSetupStore} from './src/storage/studentSetupStore';
import {onboardingProgressStore} from './src/storage/onboardingProgressStore';
import type {OnboardingCompletion} from './src/ui/screens/OnboardingScreen';

import {CallLafinaScreen} from './src/ui/screens/CallLafinaScreen';
import {LiveMiniCallBar} from './src/ui/components/callLafina/LiveMiniCallBar';
import {RetainedTab} from './src/ui/navigation/RetainedTab';
import {isVoiceConversationActive} from './src/cloud/voiceConversation';
import {getCallLafinaSettings} from './src/cloud/voiceConversation/callLafinaSettingsStore';
import {endReviewSession} from './src/ai/nlu/commandReview';
import {chatDraftStore} from './src/ui/drafts/chatDraftStore';
import {docGenDraftStore} from './src/ui/drafts/docGenDraftStore';
import {applySpeechPreferences} from './src/ai/tts/speechPreferences';
import {QUICK_CHAT_DATA_CHANGED_EVENT} from './src/ai/quickChat/quickChatController';
import type {QuickChatDataChangedEvent} from './src/ai/quickChat/quickChatController';
import {quickChatPresence} from './src/ui/quickChat/quickChatPresence';
import {applyFloatingAssistantForUser} from './src/ui/quickChat/floatingAssistantAccount';
import {confirmLaunch} from './src/updates';
import {AppUpdatePrompt} from './src/ui/components/updates/AppUpdatePrompt';

const TAB_DATA_TABLES = {
  calendar: [
    'tasks',
    'events',
    'event_time_local',
    'time_blocks',
    'reminders',
    'users',
    'custom_categories',
    'local_settings:schedule',
    'local_settings:academic',
    'local_settings:student',
    'local_settings:cor',
  ],
  chat: [
    'messages',
    'chat_sessions',
    'users',
    'local_settings:chat',
    'local_settings:academic',
    'local_settings:student',
    'local_settings:cor',
    'local_settings:onboarding',
    'local_settings:offline_ai_model_id',
  ],
  notes: [
    'notes',
    'tasks',
    'reminders',
    'alarms',
    'recorded_meetings',
    'custom_categories',
    'user_materials',
    'user_material_qa_messages',
    'local_settings:notes',
    'local_settings:skills',
    'local_settings:academic',
    'local_settings:student',
  ],
  profile: [
    'users',
    'tasks',
    'notes',
    'events',
    'time_blocks',
    'reminders',
    'alarms',
    'recorded_meetings',
    'chat_memories',
    'local_settings:profile',
    'local_settings:academic',
    'local_settings:student',
    'local_settings:cor',
    'local_settings:alert_preferences_v1',
    'local_settings:memory',
    'local_settings:chat',
    'local_settings:ai',
    'local_settings:onboarding',
    'local_settings:speech_tts_v1',
    'local_settings:speech',
    'local_settings:event_memory_v1',
    'local_settings:modern_theme',
    'local_settings:modern_ai_button_design',
    'local_settings:ui_variant',
  ],
} as const;

const THEME_DATA_TABLES = [
  'users',
  'local_settings:modern_theme',
  'local_settings:modern_ai_button_design',
  'local_settings:ui_variant',
] as const;

const MEETINGS_DATA_TABLES = ['recorded_meetings'] as const;

const AppThemeProvider = React.memo(function AppThemeProviderView({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const themeRevision = useStorageRevision(THEME_DATA_TABLES);
  return (
    <ThemeProvider userId={userId} refreshTrigger={themeRevision}>
      {children}
    </ThemeProvider>
  );
});

const AppMeetingsProvider = React.memo(function AppMeetingsProviderView({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const meetingsRevision = useStorageRevision(MEETINGS_DATA_TABLES);
  return (
    <MeetingsProvider
      key={userId}
      userId={userId}
      syncRevision={meetingsRevision}
    >
      {children}
    </MeetingsProvider>
  );
});

function AppContent({
  userId,
  setUserId,
}: {
  userId: string | null;
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState<
    'welcome' | 'login' | 'register'
  >('welcome');
  const [guestUpgradePending, setGuestUpgradePending] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [isOnboardingReplay, setIsOnboardingReplay] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [skillsPageOpen, setSkillsPageOpen] = useState(false);
  useLayoutEffect(() => finishTabSwitch(activeTab), [activeTab]);

  const [tourOpen, setTourOpen] = useState(false);
  const [activeTourStep, setActiveTourStep] = useState<TourStep | null>(null);
  const tourReturnTabRef = useRef<TabType>('dashboard');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [startupReady, setStartupReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [storageHealth, setStorageHealth] = useState(() => db.getHealth());
  const [quickChatOpen, setQuickChatOpen] = useState(() =>
    quickChatPresence.isOpen(),
  );
  useEffect(
    () =>
      quickChatPresence.subscribe(() =>
        setQuickChatOpen(quickChatPresence.isOpen()),
      ),
    [],
  );
  const [callNavigation, setCallNavigation] =
    useState<CallNavigationRequest | null>(null);
  const [callLafinaVisible, setCallLafinaVisible] = useState(false);
  const [callLafinaMinimized, setCallLafinaMinimized] = useState(false);
  const callLafinaMinimizedRef = useRef(callLafinaMinimized);
  callLafinaMinimizedRef.current = callLafinaMinimized;
  // Stable, so the memoized call screen skips unrelated app renders.
  const navigateFromCall = useCallback(
    (target: CallNavigationTarget) => {
      if (target.ownerId !== userId) return;
      setCallNavigation({...target, requestId: generateId('call-nav')});
      setActiveTab(target.screen);
      setCallLafinaVisible(false);
      // A skill handoff (ADR-041) ends the call; other links keep it minimized.
      setCallLafinaMinimized(!target.skill && isVoiceConversationActive());
    },
    [userId],
  );
  // ADR-041: a skill the student tapped open from Chat.
  const openSkillFromChat = useCallback(
    (launch: SkillLaunch) => {
      if (!userId) return;
      setCallNavigation({
        ownerId: userId,
        screen: 'notes',
        skill: launch,
        requestId: generateId('chat-skill'),
      });
      setActiveTab('notes');
    },
    [userId],
  );
  const closeMiniCall = useCallback(() => {
    setCallLafinaMinimized(false);
  }, []);
  useEffect(() => {
    if (!callLafinaVisible) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      const stillLive = isVoiceConversationActive();
      setCallLafinaVisible(false);
      setCallLafinaMinimized(stillLive);
      if (!stillLive) {
        setActiveTab('chat');
      }
      return true;
    });
    return () => listener.remove();
  }, [callLafinaVisible]);

  // Incoming Call State
  const [callVisible, setCallVisible] = useState(false);
  const [callReminderId, setCallReminderId] = useState('');
  const [callTask, setCallTask] = useState('');
  const [callAction, setCallAction] = useState<NativeCallAction>('call');
  // Delivery identity captured when the call is admitted; every action is fenced by it.
  const [callGeneration, setCallGeneration] = useState<number | null>(null);
  const callOwnerRef = useRef<string | null>(null);
  const previousUserRef = useRef<string | null>(null);
  const activeCallRequest = useRef<CallRequest | null>(null);

  // Reminder Permission State
  const [permissionStatus, setPermissionStatus] =
    useState<ReminderPermissionStatus | null>(null);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);

  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
  );

  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () =>
      setIsKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setIsKeyboardVisible(false),
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // One admission path for every call source: owner + captured identity fence first.
  const presentCall = useCallback(
    (incoming: CallRequest): boolean => {
      if (!userId || quickChatPresence.isOpen()) return false;
      if (
        isOnboarding &&
        !isOnboardingReplay &&
        incoming.action !== 'acknowledge' &&
        incoming.action !== 'snooze' &&
        incoming.action !== 'decline'
      ) {
        if (!incoming.ownerId || incoming.ownerId === userId) {
          callLifecycle.put(userId, {
            ...incoming,
            ownerId: userId,
            action: 'call',
          });
        }
        return false;
      }
      const request = recoverNativeCall(incoming, userId);
      if (!request) return false;
      // Startup events are retained natively until account hydration finishes.
      if (!userId) return false;
      const admission = admitReminderCall(request, userId);
      if (!admission.admitted || !userId) return false;
      // "Notify only" (audit finding 16): the notification's own buttons are
      // applied directly, and the in-app fallback is an alert, never a call.
      if (isNotificationAction(admission.action)) {
        void applyNotificationAction(
          admission.reminder.id,
          userId,
          admission.action,
          admission.generation,
        );
        return false;
      }
      if (
        admission.action === 'call' &&
        isNotifyOnlyReminder(admission.reminder.id, userId, Date.now())
      ) {
        showNotifyOnlyReminderAlert(
          admission.reminder.id,
          userId,
          admission.task,
          admission.generation,
        );
        return false;
      }
      const identity: CallRequest = {
        reminderId: admission.reminder.id,
        ownerId: userId,
        generation: admission.generation,
        action: admission.action,
      };
      if (isOnboarding && !isOnboardingReplay) {
        callLifecycle.put(userId, {...identity, action: 'call'});
        return false;
      }
      if (activeCallRequest.current) {
        if (!sameCall(activeCallRequest.current, identity)) {
          callLifecycle.put(userId, {...identity, action: 'call'});
          // Silence competing notification audio without deleting its durable request.
          void finishNativeIncomingCall(
            identity.reminderId,
            userId,
            identity.generation,
            true,
          ).catch(() => undefined);
        }
        return false;
      }
      callLifecycle.put(userId, identity, 'ringing');
      activeCallRequest.current = identity;
      // The reminder call takes the microphone and speaker; a live voice
      // conversation ends first and is never resumed by itself.
      endActiveVoiceConversation(
        'A reminder call started, so the conversation stopped.',
      );
      callOwnerRef.current = admission.reminder.userId;
      setCallReminderId(admission.reminder.id);
      setCallTask(admission.task);
      setCallAction(admission.action);
      setCallGeneration(admission.generation);
      setCallVisible(true);
      return true;
    },
    [userId, isOnboarding, isOnboardingReplay],
  );

  // Account switch or logout retires the previous owner's call UI, speech and
  // native registrations; their jobs stay in SQLite for a later return.
  useEffect(() => {
    const previous = previousUserRef.current;
    previousUserRef.current = userId;
    if (previous === userId) return;
    // Open assistant reviews never outlive the account they were prepared for
    // (AGY-PORT 04): sign-out, sign-in and account switch all end them.
    endReviewSession();
    endActiveVoiceConversation(
      'You switched accounts, so the conversation stopped.',
    );
    // AGY-PORT 05: the previous owner's unsent Chat text and open voice sheet go too.
    chatDraftStore.retainOnly(userId);
    docGenDraftStore.retainOnly(userId);

    if (callOwnerRef.current && callOwnerRef.current !== userId) {
      activeCallRequest.current = null;
      callOwnerRef.current = null;
      setCallVisible(false);
      setCallGeneration(null);
      disconnectCall();
    }
    if (previous && !userId) {
      void reconcileReminderDelivery(null);
    }
  }, [userId]);

  // AGY-PORT 10: the signed-in account's own offline voice choice, or AGY's
  // automatic default when it has none (or nobody is signed in).
  useEffect(() => {
    void applySpeechPreferences(userId);
  }, [userId]);

  // Floating LAFINA (ADR-036): only the active student's own choice runs the
  // orb, and Quick Chat keeps nothing from another account. Waits for startup
  // so the not-yet-known user does not stop an orb that should stay.
  useEffect(() => {
    if (!startupReady) return;
    void applyFloatingAssistantForUser(userId ?? null);
  }, [userId, startupReady]);

  // Floating LAFINA: a change confirmed in Quick Chat refreshes these screens.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      QUICK_CHAT_DATA_CHANGED_EVENT,
      (event: QuickChatDataChangedEvent) => {
        if (!userId || event?.ownerId !== userId) return;
        db.invalidateData(['alarms', 'reminders', 'tasks']);
      },
    );
    return () => subscription.remove();
  }, [userId]);

  // Floating LAFINA: "Open LAFINA" / "View in LAFINA" from Quick Chat, once,
  // for the same student only, after Quick Chat has left the front.
  const navigateFromCallRef = useRef(navigateFromCall);
  navigateFromCallRef.current = navigateFromCall;
  useEffect(() => {
    if (!userId || !startupReady) return undefined;
    const consume = () => {
      if (
        quickChatPresence.isOpen() ||
        !quickChatPresence.hasPendingNavigation()
      )
        return;
      const target = quickChatPresence.consumeNavigation(userId);
      if (target) navigateFromCallRef.current(target);
    };
    consume();
    const unsubscribe = quickChatPresence.subscribe(consume);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') consume();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [userId, startupReady]);

  const lastCallEntryTab = useRef(activeTab);
  useEffect(() => {
    const entered = lastCallEntryTab.current !== activeTab;
    lastCallEntryTab.current = activeTab;
    if (entered && activeTab === 'chat' && userId && !tourOpen) {
      const settings = getCallLafinaSettings(userId);
      if (
        settings.startWithCallLafina &&
        !callLafinaVisible &&
        !callLafinaMinimized
      ) {
        setCallLafinaVisible(true);
      }
    }
  }, [activeTab, userId, callLafinaVisible, callLafinaMinimized, tourOpen]);

  // Alarm plan A2: Android holds exactly the active student's alarms (none
  // when signed out); native's ring/dismiss/snooze events are recorded here.
  // Alarm plan A4: the optional morning briefing after a dismissed alarm
  // (registered first, so the first event read finds it).
  useEffect(() => startMorningBriefing(), []);
  useEffect(() => startAlarmLifecycle(userId ?? null), [userId]);
  useEffect(() => {
    if (userId) void syncAlertPreferencesToNative(userId);
  }, [userId]);

  const presentCallRef = useRef(presentCall);
  presentCallRef.current = presentCall;

  useEffect(() => {
    if (!userId) {
      stopReminderPoller();
      return undefined;
    }
    let cancelled = false;
    const runStartup = async () => {
      if (!quickChatPresence.isOpen()) {
        try {
          const payloads = await consumePendingNativeCalls();
          if (cancelled) return;
          for (const payload of payloads) {
            if (presentCallRef.current(payload)) setIsLoading(false);
          }
        } catch {
          // Non-fatal: durable call queue recovery still runs.
        }
      }
      if (cancelled) return;
      await rescheduleUserReminders(userId, !quickChatPresence.isOpen());
      if (!cancelled) startReminderPoller(userId);
    };
    void runStartup();
    return () => {
      cancelled = true;
      stopReminderPoller();
    };
  }, [userId]);

  // Verify reminder permissions once onboarding and the walkthrough are done.
  useEffect(() => {
    if (!userId) return undefined;
    if (isOnboarding || tourOpen || productTourStore.isPending(userId)) {
      return undefined;
    }
    let cancelled = false;

    void (async (): Promise<void> => {
      try {
        let status = await getReminderPermissionStatus();
        if (cancelled) return;
        if (
          Platform.OS === 'android' &&
          (!status || !status.notificationsEnabled)
        ) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          if (cancelled) return;
          status = await getReminderPermissionStatus();
          if (cancelled) return;
        }
        setPermissionStatus(status);

        // If any critical reminder permission is missing, show educational guidance
        if (
          status &&
          (!status.canScheduleExactAlarms ||
            !status.canUseFullScreenIntent ||
            !status.notificationsEnabled)
        ) {
          setPermissionModalVisible(true);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[App] Failed to check reminder permissions:', error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isOnboarding, tourOpen]);

  // Recover durable queue entries after a close/restart; never auto-answer recovery.
  useEffect(() => {
    if (
      !userId ||
      (isOnboarding && !isOnboardingReplay) ||
      isLoading ||
      callVisible ||
      quickChatOpen
    )
      return;
    const entries = callLifecycle.list(userId);
    for (const entry of entries) {
      if (entry.deadline <= Date.now()) {
        callLifecycle.expire(userId, entry.request);
        continue;
      }
      if (presentCall({...entry.request, action: 'call'})) break;
      callLifecycle.remove(userId, entry.request);
    }
  }, [
    userId,
    isOnboarding,
    isOnboardingReplay,
    isLoading,
    callVisible,
    quickChatOpen,
    presentCall,
  ]);

  // Listen for both foreground scheduler events and native alarm/activity intents
  useEffect(() => {
    const foregroundSubscription = DeviceEventEmitter.addListener(
      EVENT_CALL_TRIGGER,
      (event: CallRequest) => {
        presentCall({...event, action: 'call'});
      },
    );
    const nativeSubscription = DeviceEventEmitter.addListener(
      'LAFINA_NATIVE_CALL_TRIGGER',
      (event: NativeCallTrigger) => {
        presentCall(event);
      },
    );

    return () => {
      foregroundSubscription.remove();
      nativeSubscription.remove();
    };
  }, [presentCall]);

  const setupApp = useCallback(async () => {
    setStartupError(null);
    try {
      await initDatabase();
      preparePerformanceFixture();
      // Debug/test builds: use the server chosen in Profile before any request.
      backendSelection.applySaved();

      const currentUser = userStore.getCurrentUserOrThrow();
      if (currentUser) {
        setUserId(currentUser.id);
        setIsOnboarding(currentUser.isNewUser);
        await Promise.allSettled([
          importedBatchesStore.getImportedBatches(currentUser.id),
          calendarVisibilityStore.getVisibilityMap(currentUser.id),
        ]);
      }

      setStartupReady(true);

      void appUpdater
        .markLaunchSuccessful()
        .then(() => appUpdater.check({quiet: true}))
        .catch(() => undefined);
    } catch (error) {
      console.error('Failed application startup setup:', error);
      setStartupError(
        error instanceof Error
          ? error.message
          : 'Local storage could not be read on startup.',
      );
      setIsLoading(false);
    }
  }, [setUserId]);

  // Keep a downloaded OTA bundle only after local storage and the first screen
  // succeed without hitting recovery.
  useEffect(() => {
    if (
      startupReady &&
      !isLoading &&
      !startupError &&
      storageHealth.status !== 'unavailable' &&
      storageHealth.status !== 'quarantined'
    ) {
      confirmLaunch();
    }
  }, [startupReady, isLoading, startupError, storageHealth.status]);

  // Subscribed before setup runs so no health change is missed.
  useEffect(() => db.subscribeHealth(setStorageHealth), []);

  useEffect(() => {
    void setupApp();
  }, [setupApp]);

  const retryStorage = useCallback(async () => {
    db.reopen();
    await setupApp();
  }, [setupApp]);

  const syncSchedulerRef = useRef<ReturnType<
    typeof createSyncScheduler
  > | null>(null);

  useEffect(() => {
    if (!userId) return undefined;
    const scheduler = createSyncScheduler({
      runPass: async () => {
        await syncWorker.performSync();
        return syncWorker.takeRemoteChangeCount() > 0;
      },
      onRemoteChanges: () => undefined,
      getBackoffAttempt: () => syncWorker.getRetryAttempt?.() ?? 0,
    });
    syncSchedulerRef.current = scheduler;
    if (AppState.currentState === 'active') {
      scheduler.start();
      void scheduler.runNow();
    }

    const unsubscribeRemoteChanges = syncWorker.onRemoteChanges(
      changedUserId => {
        if (changedUserId === userId) {
          void rescheduleUserReminders(userId, !quickChatPresence.isOpen());
        }
      },
    );

    let wasOnline = true;
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      const isOnline =
        Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (isOnline && !wasOnline && AppState.currentState === 'active') {
        void scheduler.runNow();
      }
      wasOnline = isOnline;
    });

    let disposed = false;
    const runForegroundWork = (): void => {
      if (disposed || AppState.currentState !== 'active') return;
      db.invalidateData(['alarms', 'reminders', 'tasks']);
      scheduler.start();
      // Floating LAFINA (ADR-036 Decision 6, risk R-03): while Quick Chat is
      // the visible screen this root is hidden, so reminders stay with
      // Android exactly as when LAFINA is in the background.
      const quickChatInFront = quickChatPresence.isOpen();
      void (async () => {
        if (!quickChatInFront) {
          const payloads = await consumePendingNativeCalls().catch(() => []);
          if (disposed || AppState.currentState !== 'active') return;
          payloads.forEach(p => presentCallRef.current(p));
        }
        await rescheduleUserReminders(userId, !quickChatPresence.isOpen());
        if (disposed || AppState.currentState !== 'active') return;
        if (!quickChatPresence.isOpen()) startReminderPoller(userId);
      })();
      void getReminderPermissionStatus()
        .then(status => {
          if (!disposed && status) setPermissionStatus(status);
        })
        .catch(() => undefined);
      void scheduler.runNow();
    };

    // Opening Quick Chat also makes this hidden root "active". That refresh
    // waits until the panel has appeared, so the two do not compete for the
    // one JS thread (measured on device: the panel was ~0.5 s later). Not
    // in Quick Chat, it runs at once, as before.
    let cancelForegroundWork: () => void = () => undefined;
    const appStateSubscription = AppState.addEventListener(
      'change',
      nextState => {
        cancelForegroundWork();
        cancelForegroundWork = () => undefined;
        if (nextState === 'active') {
          cancelForegroundWork =
            quickChatPresence.deferWhileOpening(runForegroundWork);
          return;
        }
        scheduler.stop();
        stopReminderPoller();
        // Leaving the foreground: make Android hold exactly the armed work in
        // SQLite, so a retired or edited reminder cannot ring while the app
        // stays closed.
        if (nextState === 'background') void reconcileReminderDelivery(userId);
      },
    );
    const unsubscribeOutbox = syncOutboxStore.onEnqueue(localUserId => {
      if (localUserId === userId) scheduler.schedule();
    });

    return () => {
      disposed = true;
      syncSchedulerRef.current = null;
      appStateSubscription.remove();
      cancelForegroundWork();
      unsubscribeOutbox();
      unsubscribeRemoteChanges();
      unsubscribeNetInfo();
      scheduler.dispose();
    };
  }, [userId]);

  const triggerRefresh = useCallback(() => undefined, []);

  const applyPendingOnboardingReset = useCallback((uid: string): boolean => {
    if (!onboardingProgressStore.consumeResetPending()) return false;
    userStore.markOnboardingPending(uid);
    onboardingProgressStore.clear(uid);
    productTourStore.reset(uid);
    return true;
  }, []);

  const handleGetStarted = (uid: string) => {
    setGuestUpgradePending(false);
    tourReturnTabRef.current = 'dashboard';
    const resetPending = applyPendingOnboardingReset(uid);
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(resetPending || (user ? user.isNewUser : false));
    setActiveTab('dashboard');
  };

  const resetSessionUi = useCallback(() => {
    void cancelFocusTimer();
    activeCallRequest.current = null;
    callOwnerRef.current = null;
    setCallVisible(false);
    setCallGeneration(null);
    setCallLafinaVisible(false);
    setCallLafinaMinimized(false);
    setCallNavigation(null);
    setPermissionModalVisible(false);
    setSkillsPageOpen(false);
    tourReturnTabRef.current = 'dashboard';
    setTourOpen(false);
    setActiveTourStep(null);
    setIsOnboardingReplay(false);
    setIsOnboarding(false);
    setActiveTab('dashboard');
  }, []);

  const handleGuestCreateAccount = useCallback(() => {
    resetSessionUi();
    userStore.logout();
    setGuestUpgradePending(true);
    setUserId(null);
    setAuthScreen('register');
  }, [resetSessionUi, setUserId]);

  const handleLoginSuccess = (uid: string) => {
    setGuestUpgradePending(false);
    tourReturnTabRef.current = 'dashboard';
    const resetPending = applyPendingOnboardingReset(uid);
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(resetPending || (user ? user.isNewUser : false));
    setActiveTab('dashboard');
  };

  const handleRegisterSuccess = (uid: string) => {
    setGuestUpgradePending(false);
    applyPendingOnboardingReset(uid);
    setUserId(uid);
    setIsOnboarding(true);
    setActiveTab('dashboard');
  };

  const handleOnboardingComplete = (completion?: OnboardingCompletion) => {
    const startTour = completion?.startTour ?? !isOnboardingReplay;
    const goalTab: TabType =
      completion?.goal === 'schedule'
        ? 'calendar'
        : completion?.goal === 'handbook'
        ? 'chat'
        : 'dashboard';
    if (userId && startTour) {
      tourReturnTabRef.current = goalTab;
      productTourStore.queue(userId);
    } else if (userId && !isOnboardingReplay) {
      productTourStore.markSeen(userId, false);
    }
    setIsOnboardingReplay(false);
    setIsOnboarding(false);
    // Without the tour, land where the chosen goal starts.
    if (!startTour) {
      setActiveTab(goalTab);
    }
    void syncSchedulerRef.current?.runNow();
  };

  useEffect(() => {
    if (!userId || isOnboarding || isLoading) return;
    if (productTourStore.isPending(userId)) {
      Keyboard.dismiss();
      setPermissionModalVisible(false);
      setTourOpen(true);
    }
  }, [userId, isOnboarding, isLoading]);

  const finishTour = useCallback(
    (completed: boolean) => {
      if (userId) productTourStore.markSeen(userId, completed);
      setTourOpen(false);
      setActiveTourStep(null);
      setActiveTab(tourReturnTabRef.current);
    },
    [userId],
  );

  const handleLogout = useCallback(
    (isGuestParam?: boolean) => {
      resetSessionUi();
      setGuestUpgradePending(false);
      setUserId(null);
      setAuthScreen(isGuestParam ? 'welcome' : 'login');
    },
    [resetSessionUi, setUserId],
  );

  const handleOpenCalendarFromDashboard = useCallback(
    (target?: Omit<CallNavigationTarget, 'ownerId' | 'screen'>) => {
      if (!userId) return;
      if (target?.scheduleSection === 'alarms') {
        setCallNavigation({
          ownerId: userId,
          screen: 'notes',
          notesTab: 'alarms',
          ...target,
          requestId: generateId('dash-nav'),
        });
        setActiveTab('notes');
        return;
      }
      if (target) {
        setCallNavigation({
          ownerId: userId,
          screen: 'calendar',
          ...target,
          requestId: generateId('dash-nav'),
        });
      }
      setActiveTab('calendar');
    },
    [userId],
  );

  const handleOpenNotesFromDashboard = useCallback(
    (noteId?: string) => {
      if (!userId) return;
      if (noteId) {
        setCallNavigation({
          ownerId: userId,
          screen: 'notes',
          entityId: noteId,
          entityKind: 'note',
          requestId: generateId('dash-nav'),
        });
      }
      setActiveTab('notes');
    },
    [userId],
  );

  const handleOpenChatFromDashboard = useCallback(
    (prefillPrompt?: string) => {
      if (!userId) return;
      if (prefillPrompt) {
        chatDraftStore.set(userId, prefillPrompt);
      }
      setActiveTab('chat');
    },
    [userId],
  );

  const handleOpenAskUstpFromDashboard = useCallback(() => {
    if (!userId) return;
    setCallNavigation({
      ownerId: userId,
      screen: 'chat',
      chatMode: 'ustp',
      requestId: generateId('dash-ustp'),
    });
    setActiveTab('chat');
  }, [userId]);

  const openCallLafina = useCallback(() => setCallLafinaVisible(true), []);
  const closeCallLafina = useCallback(() => {
    setCallLafinaVisible(false);
    setCallLafinaMinimized(false);
    setActiveTab('chat');
    triggerRefresh();
  }, [triggerRefresh]);
  const minimizeCallLafina = useCallback(() => {
    setCallLafinaVisible(false);
    setCallLafinaMinimized(isVoiceConversationActive());
  }, []);
  const callLafinaNeedsAttention = useCallback(() => {
    // LAFINA just put up a card that needs an answer. A minimized call
    // comes forward so the card is on screen when she says so.
    if (callLafinaMinimizedRef.current) {
      setCallLafinaMinimized(false);
      setCallLafinaVisible(true);
    }
  }, []);
  const openProfileTab = useCallback(() => setActiveTab('profile'), []);
  // Read through a ref so Profile (which gets this) is not re-rendered by
  // every tab switch.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const handleTabPress = useCallback(
    (tab: TabType) => {
      if (tab !== activeTabRef.current) beginTabSwitch(tab, userId);
      setActiveTab(tab);
    },
    [userId],
  );
  const replayTour = useCallback(() => {
    tourReturnTabRef.current = activeTabRef.current;
    Keyboard.dismiss();
    setPermissionModalVisible(false);
    setTourOpen(true);
  }, []);
  const handleTourStepChange = useCallback((step: TourStep) => {
    setActiveTourStep(step);
  }, []);
  const walkthroughSteps = useMemo(() => {
    if (!tourOpen || !userId) return [];
    const eligible = getUstpEligibility(userId).eligible;
    return buildWalkthroughSteps({
      isGuest: isGuestAccount(userId),
      schoolEnabled: eligible,
      corPending:
        studentSetupStore.get(userId).affiliation === 'ustp' && !eligible,
    });
  }, [tourOpen, userId]);
  const replayOnboarding = useCallback(() => {
    setIsOnboardingReplay(true);
    setIsOnboarding(true);
  }, []);
  const resetFromOnboarding = useCallback(() => {
    resetSessionUi();
    setGuestUpgradePending(false);
    setAuthScreen('welcome');
    setUserId(null);
  }, [resetSessionUi, setUserId]);
  const finishOpenRequest = useCallback((requestId: string) => {
    setCallNavigation(current =>
      current?.requestId === requestId ? null : current,
    );
  }, []);

  const renderScreen = (tab: TabType) => {
    if (!userId) {
      return (
        <View style={[styles.errorScreen, themed.errorScreen]}>
          <Text style={themed.errorText}>Access Denied</Text>
        </View>
      );
    }
    switch (tab) {
      case 'dashboard':
        return null;
      case 'chat':
        return (
          <ChatScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={triggerRefresh}
            onCallLafina={openCallLafina}
            onOpenSkill={openSkillFromChat}
            onOpenRequestHandled={finishOpenRequest}
            openRequest={
              callNavigation?.ownerId === userId &&
              callNavigation.screen === 'chat'
                ? callNavigation
                : undefined
            }
          />
        );
      case 'calendar':
        return (
          <CalendarScreen
            onOpenRequestHandled={finishOpenRequest}
            openRequest={
              callNavigation?.ownerId === userId &&
              callNavigation.screen === 'calendar'
                ? callNavigation
                : undefined
            }
            userId={userId}
            refreshTrigger={0}
            onRefresh={triggerRefresh}
          />
        );
      case 'notes':
        return (
          <NotesScreen
            onSkillsPageChange={setSkillsPageOpen}
            onOpenRequestHandled={finishOpenRequest}
            openRequest={
              callNavigation?.ownerId === userId &&
              callNavigation.screen === 'notes'
                ? callNavigation
                : undefined
            }
            tourSubTab={
              tourOpen && activeTourStep?.tab === 'notes'
                ? activeTourStep.notesSubTab
                : undefined
            }
            userId={userId}
            refreshTrigger={0}
            onOpenProfile={openProfileTab}
            onNavigateToRegister={handleGuestCreateAccount}
            onRefresh={triggerRefresh}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            userId={userId}
            refreshTrigger={0}
            onRefresh={triggerRefresh}
            onLogout={handleLogout}
            onNavigateToRegister={handleGuestCreateAccount}
            onReplayTour={replayTour}
            onReplayOnboarding={replayOnboarding}
            onResetFromOnboarding={resetFromOnboarding}
            tourAnchor={
              tourOpen && activeTourStep?.tab === 'profile'
                ? activeTourStep.anchor ?? null
                : null
            }
          />
        );
      default:
        return (
          <View style={[styles.errorScreen, themed.errorScreen]}>
            <Text style={themed.errorText}>Page Not Found</Text>
          </View>
        );
    }
  };

  if (
    storageHealth.status === 'unavailable' ||
    storageHealth.status === 'quarantined' ||
    startupError
  ) {
    const recoveryHealth =
      storageHealth.status === 'unavailable' ||
      storageHealth.status === 'quarantined'
        ? storageHealth
        : {
            ...storageHealth,
            status: 'unavailable' as const,
            durable: false,
            reason: 'unreadable' as const,
            message:
              startupError ?? 'Local storage could not be read on startup.',
          };
    return (
      <StorageRecoveryScreen health={recoveryHealth} onRetry={retryStorage} />
    );
  }

  if (isLoading) {
    return (
      <>
        <StatusBar
          barStyle={colors.statusBarStyle}
          backgroundColor={colors.background}
        />
        <SynthSplash
          ready={startupReady}
          onFinished={() => setIsLoading(false)}
        />
      </>
    );
  }

  if (!userId && authScreen === 'welcome') {
    // The introduction is a full-screen native pager (onboarding redesign).
    return (
      <>
        <StatusBar
          barStyle={colors.statusBarStyle}
          backgroundColor={colors.background}
        />
        <WelcomeScreen
          onGetStarted={handleGetStarted}
          onNavigateToLogin={() => setAuthScreen('login')}
          onNavigateToRegister={() => setAuthScreen('register')}
        />
      </>
    );
  }

  if (!userId) {
    return authScreen === 'register' ? (
      <RegisterScreen
        fromGuest={guestUpgradePending}
        onRegisterSuccess={handleRegisterSuccess}
        onNavigateToLogin={() => setAuthScreen('login')}
        onBack={() => {
          setGuestUpgradePending(false);
          setAuthScreen('welcome');
        }}
      />
    ) : (
      <LoginScreen
        fromGuest={guestUpgradePending}
        onLoginSuccess={handleLoginSuccess}
        onNavigateToRegister={() => setAuthScreen('register')}
        onBack={() => {
          setGuestUpgradePending(false);
          setAuthScreen('welcome');
        }}
      />
    );
  }

  const incomingCallLayer = (
    <IncomingCallScreen
      key={`${userId}:${callReminderId}:${callGeneration}`}
      visible={callVisible}
      reminderId={callReminderId}
      task={callTask}
      userId={userId}
      initialAction={callAction}
      deliveryGeneration={callGeneration}
      onClose={() => {
        const current = activeCallRequest.current;
        if (
          !current ||
          current.reminderId !== callReminderId ||
          current.ownerId !== userId ||
          current.generation !== callGeneration
        )
          return;
        if (current && userId) callLifecycle.remove(userId, current);
        activeCallRequest.current = null;
        callOwnerRef.current = null;
        setCallVisible(false);
        triggerRefresh();
      }}
    />
  );

  if (isOnboarding) {
    return (
      <>
        <OnboardingScreen
          userId={userId}
          onOnboardingComplete={handleOnboardingComplete}
          onCancel={
            isOnboardingReplay
              ? () => {
                  setIsOnboardingReplay(false);
                  setIsOnboarding(false);
                }
              : undefined
          }
        />
        {incomingCallLayer}
      </>
    );
  }

  return (
    <View
      style={[
        styles.safeContainer,
        themed.safeContainer,
        {paddingTop: topInset + 6},
      ]}
    >
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor={colors.background}
      />

      <AppMeetingsProvider userId={userId}>
        <View style={styles.content}>
          {userId ? (
            <View
              style={[
                styles.tabScreenLayer,
                activeTab !== 'dashboard' && styles.hiddenTabLayer,
              ]}
              pointerEvents={activeTab === 'dashboard' ? 'auto' : 'none'}
              accessibilityElementsHidden={activeTab !== 'dashboard'}
              importantForAccessibility={
                activeTab === 'dashboard' ? 'auto' : 'no-hide-descendants'
              }
            >
              <DashboardScreen
                key={userId}
                userId={userId}
                isActive={activeTab === 'dashboard' && !callLafinaVisible}
                tourAnchor={
                  tourOpen && activeTourStep?.tab === 'dashboard'
                    ? activeTourStep.anchor ?? null
                    : null
                }
                refreshTrigger={0}
                onRefresh={triggerRefresh}
                onOpenCalendarTab={handleOpenCalendarFromDashboard}
                onOpenNotesTab={handleOpenNotesFromDashboard}
                onOpenChatTab={handleOpenChatFromDashboard}
                onOpenAskUstp={handleOpenAskUstpFromDashboard}
                onOpenSkill={openSkillFromChat}
              />
            </View>
          ) : null}
          {(['calendar', 'chat', 'notes', 'profile'] as const).map(tab => (
            <RetainedTab
              key={`${userId}:${tab}`}
              // The full-screen call covers every tab: none of them refreshes
              // under it (each saved call turn used to reload Chat).
              active={activeTab === tab && !callLafinaVisible}
              tables={TAB_DATA_TABLES[tab]}
            >
              {renderScreen(tab)}
            </RetainedTab>
          ))}
        </View>
      </AppMeetingsProvider>

      {!isKeyboardVisible && !(activeTab === 'notes' && skillsPageOpen) && (
        <CustomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
      )}

      {callLafinaMinimized && (
        <LiveMiniCallBar
          bottomOffset={
            (isKeyboardVisible
              ? Math.max(insets.bottom, 12)
              : Math.max(insets.bottom, 12) + 14 + Layout.navbarHeight) +
            Spacing.sm
          }
          onExpand={() => {
            setCallLafinaMinimized(false);
            setCallLafinaVisible(true);
          }}
          onEnd={closeMiniCall}
        />
      )}

      {(callLafinaVisible || callLafinaMinimized) && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: 100,
              backgroundColor: colors.background,
              display: callLafinaVisible ? 'flex' : 'none',
            },
          ]}
          accessibilityViewIsModal={callLafinaVisible}
        >
          <CallLafinaScreen
            onNavigate={navigateFromCall}
            userId={userId || 'local_guest_user'}
            onClose={closeCallLafina}
            onMinimize={minimizeCallLafina}
            onAttention={callLafinaNeedsAttention}
            paused={!callLafinaVisible}
          />
        </View>
      )}

      {tourOpen && (
        <ProductTour
          steps={walkthroughSteps}
          label="Walkthrough"
          onNavigate={setActiveTab}
          onStepChange={handleTourStepChange}
          onFinish={finishTour}
        />
      )}

      {incomingCallLayer}

      {/* In-app updates from the GitHub release; never over a call or the walkthrough. */}
      <AppUpdatePrompt
        suppressed={
          callVisible || callLafinaVisible || tourOpen || permissionModalVisible
        }
      />

      {/* Reminder Permissions Educational / Onboarding Modal */}
      <ReminderPermissionModal
        visible={permissionModalVisible}
        status={permissionStatus}
        onClose={() => setPermissionModalVisible(false)}
        onRefreshStatus={() => {
          void getReminderPermissionStatus()
            .then(setPermissionStatus)
            .catch(() => undefined);
        }}
      />
    </View>
  );
}

const getThemedStyles = (colors: ThemeColors) => ({
  safeContainer: {
    backgroundColor: colors.background,
  },
  errorScreen: {
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.textPrimary,
  },
  text: {
    color: colors.textPrimary,
  },
  mutedText: {
    color: colors.textMuted,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
});

export function App() {
  const [userId, setUserId] = useState<string | null>(null);

  return (
    <SafeAreaProvider>
      <AppThemeProvider userId={userId}>
        <AppContent userId={userId} setUserId={setUserId} />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabScreenLayer: {
    flex: 1,
  },
  hiddenTabLayer: {
    display: 'none',
  },
  errorScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderTitle: {
    fontSize: 20,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  placeholderSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  modalCloseBtn: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  modalCloseText: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default App;
