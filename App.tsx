import {recoverNativeCall} from './src/scheduler/nativeCallRecovery';
import {callLifecycle, sameCall} from './src/scheduler/callLifecycle';
import {
  finishNativeIncomingCall,
  consumePendingNativeCalls,
} from './src/scheduler/reminderAlarm';
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
import {NotesScreen} from './src/ui/screens/notes';
import {SynthSplash} from './src/ui/splash';
import {WelcomeScreen} from './src/ui/screens/WelcomeScreen';
import {LoginScreen} from './src/ui/screens/LoginScreen';
import {RegisterScreen} from './src/ui/screens/RegisterScreen';
import {OnboardingScreen} from './src/ui/screens/OnboardingScreen';
import {IncomingCallScreen} from './src/ui/screens/IncomingCallScreen';
import {ReminderPermissionModal} from './src/ui/components/call/ReminderPermissionModal';
import {AuthBackdrop} from './src/ui/components/auth/AuthBackdrop';
import {ProductTour} from './src/ui/tour/ProductTour';
import {
  buildWalkthroughSteps,
  type TourStep,
} from './src/ui/tour/tourSteps';
import {isGuestAccount} from './src/cloud/entitlements';
import {getUstpEligibility} from './src/storage/ustpEligibility';
import {studentSetupStore} from './src/storage/studentSetupStore';
import type {OnboardingCompletion} from './src/ui/screens/OnboardingScreen';

import {CallLafinaScreen} from './src/ui/screens/CallLafinaScreen';
import {LiveMiniCallBar} from './src/ui/components/callLafina/LiveMiniCallBar';
import {RetainedTab} from './src/ui/navigation/RetainedTab';
import {isVoiceConversationActive} from './src/cloud/voiceConversation';
import {getCallLafinaSettings} from './src/cloud/voiceConversation/callLafinaSettingsStore';
import {endReviewSession} from './src/ai/nlu/commandReview';
import {chatDraftStore} from './src/ui/drafts/chatDraftStore';
import {applySpeechPreferences} from './src/ai/tts/speechPreferences';
import {QUICK_CHAT_DATA_CHANGED_EVENT} from './src/ai/quickChat/quickChatController';
import type {QuickChatDataChangedEvent} from './src/ai/quickChat/quickChatController';
import {quickChatPresence} from './src/ui/quickChat/quickChatPresence';
import {applyFloatingAssistantForUser} from './src/ui/quickChat/floatingAssistantAccount';

const TAB_DATA_TABLES = {
  calendar: [
    'tasks',
    'events',
    'event_time_local',
    'time_blocks',
    'reminders',
    'local_settings',
    'users',
    'custom_categories',
  ],
  chat: ['messages', 'chat_sessions', 'local_settings', 'users'],
  notes: [
    'notes',
    'tasks',
    'reminders',
    'alarms',
    'custom_categories',
    'local_settings',
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
    'local_settings',
    'chat_memories',
  ],
} as const;

function AppContent({
  userId,
  setUserId,
  refreshTrigger,
  setRefreshTrigger,
}: {
  userId: string | null;
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;
  refreshTrigger: number;
  setRefreshTrigger: React.Dispatch<React.SetStateAction<number>>;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState<
    'welcome' | 'login' | 'register'
  >('welcome');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [isOnboardingReplay, setIsOnboardingReplay] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  useLayoutEffect(() => finishTabSwitch(activeTab), [activeTab]);

  const [tourOpen, setTourOpen] = useState(false);
  const [activeTourStep, setActiveTourStep] = useState<TourStep | null>(null);
  const tourReturnTabRef = useRef<TabType>('dashboard');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [startupReady, setStartupReady] = useState(false);
  const [storageHealth, setStorageHealth] = useState(() => db.getHealth());
  const [callNavigation, setCallNavigation] =
    useState<CallNavigationRequest | null>(null);
  const navigateFromCall = (target: CallNavigationTarget) => {
    if (target.ownerId !== userId) return;
    setCallNavigation({...target, requestId: generateId('call-nav')});
    setActiveTab(target.screen);
    setCallLafinaVisible(false);
    setCallLafinaMinimized(isVoiceConversationActive());
  };
  const [callLafinaVisible, setCallLafinaVisible] = useState(false);
  const [callLafinaMinimized, setCallLafinaMinimized] = useState(false);
  const closeMiniCall = useCallback(() => setCallLafinaMinimized(false), []);
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
        isNotifyOnlyReminder(admission.reminder.id)
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
          );
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
        setRefreshTrigger(previous => previous + 1);
      },
    );
    return () => subscription.remove();
  }, [userId, setRefreshTrigger]);

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
    if (!userId) {
      stopReminderPoller();
      return undefined;
    }
    void rescheduleUserReminders(userId, !quickChatPresence.isOpen());
    startReminderPoller(userId);
    return () => {
      stopReminderPoller();
    };
  }, [userId]);

  // Reconcile exact alarms, verify reminder permissions, and consume cold-start call intents
  useEffect(() => {
    if (!userId) return;

    void reconcileReminderDelivery(userId);

    void (async (): Promise<void> => {
      // Onboarding redesign: no permission prompt while first-use setup or
      // the walkthrough is open. Reminder permissions are asked after, in context.
      if (isOnboarding || tourOpen || productTourStore.isPending(userId)) {
        return;
      }
      try {
        let status = await getReminderPermissionStatus();
        if (
          Platform.OS === 'android' &&
          (!status || !status.notificationsEnabled)
        ) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          status = await getReminderPermissionStatus();
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
        console.warn('[App] Failed to check reminder permissions:', error);
      }
    })();

    if (quickChatPresence.isOpen()) return;
    void consumePendingNativeCalls().then(payloads => {
      for (const payload of payloads)
        if (presentCall(payload)) setIsLoading(false);
    });
  }, [userId, presentCall, isOnboarding, tourOpen]);

  // Recover durable queue entries after a close/restart; never auto-answer recovery.
  useEffect(() => {
    if (
      !userId ||
      (isOnboarding && !isOnboardingReplay) ||
      isLoading ||
      callVisible
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
    try {
      await initDatabase();
      preparePerformanceFixture();
      // Debug/test builds: use the server chosen in Profile before any request.
      backendSelection.applySaved();

      const currentUser = userStore.getCurrentUser();
      if (currentUser) {
        setUserId(currentUser.id);
        setIsOnboarding(currentUser.isNewUser);
        await Promise.allSettled([
          importedBatchesStore.getImportedBatches(currentUser.id),
          calendarVisibilityStore.getVisibilityMap(currentUser.id),
        ]);
        syncWorker
          .performSync()
          .then(() => {
            setRefreshTrigger(previous => previous + 1);
          })
          .catch(() => undefined);
      }

      setStartupReady(true);

      void appUpdater
        .markLaunchSuccessful()
        .then(() => appUpdater.check({quiet: true}));
    } catch (error) {
      console.error('Failed application startup setup:', error);
      setIsLoading(false);
    }
  }, [setUserId, setRefreshTrigger]);

  // Subscribed before setup runs so no health change is missed.
  useEffect(() => db.subscribeHealth(setStorageHealth), []);

  useEffect(() => {
    void setupApp();
  }, [setupApp]);

  const retryStorage = useCallback(async () => {
    db.reopen();
    await setupApp();
  }, [setupApp]);

  useEffect(() => {
    if (!userId) return undefined;
    const scheduler = createSyncScheduler({
      runPass: async () => {
        await syncWorker.performSync();
        return syncWorker.takeRemoteChangeCount() > 0;
      },
      onRemoteChanges: () => undefined,
    });
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

    const runForegroundWork = (): void => {
      db.invalidateData(['alarms', 'reminders', 'tasks']);
      scheduler.start();
      // Floating LAFINA (ADR-036 Decision 6, risk R-03): while Quick Chat is
      // the visible screen this root is hidden, so reminders stay with
      // Android exactly as when LAFINA is in the background.
      const quickChatInFront = quickChatPresence.isOpen();
      if (!quickChatInFront) startReminderPoller(userId);
      void rescheduleUserReminders(userId, !quickChatPresence.isOpen());
      if (!quickChatInFront) {
        void consumePendingNativeCalls().then(payloads => {
          payloads.forEach(presentCall);
        });
      }
      void getReminderPermissionStatus().then(status => {
        if (status) setPermissionStatus(status);
      });
      syncWorker
        .performSync()
        .then(() => {
          setRefreshTrigger(previous => previous + 1);
          void rescheduleUserReminders(userId, !quickChatPresence.isOpen());
        })
        .catch(() => undefined);
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
      appStateSubscription.remove();
      cancelForegroundWork();
      unsubscribeOutbox();
      unsubscribeRemoteChanges();
      unsubscribeNetInfo();
      scheduler.dispose();
    };
  }, [userId, setRefreshTrigger, presentCall]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, [setRefreshTrigger]);

  const handleGetStarted = (uid: string) => {
    tourReturnTabRef.current = 'dashboard';
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(user ? user.isNewUser : false);
    setActiveTab('dashboard');
  };

  const handleGuestCreateAccount = useCallback(() => {
    userStore.logout();
    setUserId(null);
    setAuthScreen('register');
  }, [setUserId]);

  const handleLoginSuccess = (uid: string) => {
    tourReturnTabRef.current = 'dashboard';
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(user ? user.isNewUser : false);
    setActiveTab('dashboard');
    syncWorker
      .performSync()
      .then(() => {
        setRefreshTrigger(previous => previous + 1);
      })
      .catch(() => undefined);
  };

  const handleRegisterSuccess = (uid: string) => {
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
    syncWorker
      .performSync()
      .then(() => {
        setRefreshTrigger(previous => previous + 1);
      })
      .catch(() => undefined);
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
      tourReturnTabRef.current = 'dashboard';
      setTourOpen(false);
      setActiveTourStep(null);
      setUserId(null);
      setAuthScreen(isGuestParam ? 'welcome' : 'login');
      setIsOnboarding(false);
      setActiveTab('dashboard');
    },
    [setUserId],
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

  const openCallLafina = useCallback(() => setCallLafinaVisible(true), []);
  const replayTour = useCallback(() => {
    tourReturnTabRef.current = activeTab;
    Keyboard.dismiss();
    setPermissionModalVisible(false);
    setTourOpen(true);
  }, [activeTab]);
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
    activeCallRequest.current = null;
    callOwnerRef.current = null;
    previousUserRef.current = null;
    setCallVisible(false);
    setCallGeneration(null);
    setCallLafinaVisible(false);
    setCallLafinaMinimized(false);
    setCallNavigation(null);
    setPermissionModalVisible(false);
    setTourOpen(false);
    setActiveTourStep(null);
    tourReturnTabRef.current = 'dashboard';
    setIsOnboardingReplay(false);
    setIsOnboarding(false);
    setActiveTab('dashboard');
    setAuthScreen('welcome');
    setUserId(null);
    setRefreshTrigger(previous => previous + 1);
  }, [setUserId, setRefreshTrigger]);
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
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
            onCallLafina={openCallLafina}
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
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
          />
        );
      case 'notes':
        return (
          <NotesScreen
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
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
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
    storageHealth.status === 'quarantined'
  ) {
    return (
      <StorageRecoveryScreen health={storageHealth} onRetry={retryStorage} />
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
    return (
      <AuthBackdrop>
        {authScreen === 'login' && (
          <LoginScreen
            onLoginSuccess={handleLoginSuccess}
            onNavigateToRegister={() => setAuthScreen('register')}
          />
        )}
        {authScreen === 'register' && (
          <RegisterScreen
            onRegisterSuccess={handleRegisterSuccess}
            onNavigateToLogin={() => setAuthScreen('login')}
          />
        )}
      </AuthBackdrop>
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
              isActive={activeTab === 'dashboard'}
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
            />
          </View>
        ) : null}
        {(['calendar', 'chat', 'notes', 'profile'] as const).map(tab => (
          <RetainedTab
            key={`${userId}:${tab}`}
            active={activeTab === tab}
            tables={TAB_DATA_TABLES[tab]}
          >
            {renderScreen(tab)}
          </RetainedTab>
        ))}
      </View>

      {!isKeyboardVisible && (
        <CustomTabBar
          activeTab={activeTab}
          onTabPress={tab => {
            if (tab !== activeTab) beginTabSwitch(tab, userId);
            setActiveTab(tab);
          }}
        />
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
            onClose={() => {
              setCallLafinaVisible(false);
              setCallLafinaMinimized(false);
              setActiveTab('chat');
              triggerRefresh();
            }}
            onMinimize={() => {
              setCallLafinaVisible(false);
              setCallLafinaMinimized(isVoiceConversationActive());
            }}
            onAttention={() => {
              // LAFINA just put up a card that needs an answer. A minimized
              // call comes forward so the card is on screen when she says so.
              if (callLafinaMinimized) {
                setCallLafinaMinimized(false);
                setCallLafinaVisible(true);
              }
            }}
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

      {/* Reminder Permissions Educational / Onboarding Modal */}
      <ReminderPermissionModal
        visible={permissionModalVisible}
        status={permissionStatus}
        onClose={() => setPermissionModalVisible(false)}
        onRefreshStatus={() => {
          void getReminderPermissionStatus().then(setPermissionStatus);
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <SafeAreaProvider>
      <ThemeProvider userId={userId} refreshTrigger={refreshTrigger}>
        <AppContent
          userId={userId}
          setUserId={setUserId}
          refreshTrigger={refreshTrigger}
          setRefreshTrigger={setRefreshTrigger}
        />
      </ThemeProvider>
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
