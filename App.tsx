import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  Keyboard,
  Modal,
  AppState,
  DeviceEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { Fonts, useThemedStyles } from './src/ui/theme';
import {
  db,
  initDatabase,
  userStore,
  syncOutboxStore,
  productTourStore,
} from './src/storage';
import { CustomTabBar, TabType } from './src/ui/components/CustomTabBar';
import { StorageRecoveryScreen } from './src/ui/screens/StorageRecoveryScreen';
import { hasProEntitlement } from './src/cloud';
import { endActiveVoiceConversation } from './src/cloud/voiceConversation';
import { backendSelection } from './src/cloud/backendSelection';
import { ThemeProvider, useTheme } from './src/ui/contexts/ThemeContext';
import { MeetingsProvider } from './src/ui/contexts/MeetingsContext';
import type { ThemeColors } from './src/ui/contexts/ThemeContext';
import {
  rescheduleUserReminders,
  startReminderPoller,
  stopReminderPoller,
  consumePendingNativeCall,
  getReminderPermissionStatus,
  reconcileReminderDelivery,
  admitReminderCall,
  disconnectCall,
  EVENT_CALL_TRIGGER,
} from './src/scheduler';
import type {
  CallRequest,
  NativeCallAction,
  NativeCallTrigger,
  ReminderPermissionStatus,
} from './src/scheduler';
import { syncWorker } from './src/sync/syncWorker';
import { createSyncScheduler } from './src/sync/syncScheduler';
import { appUpdater } from './src/updates';

// Screens & UI
import { ChatScreen } from './src/ui/screens/ChatScreen';
import { ProfileScreen } from './src/ui/screens/ProfileScreen';
import { CalendarScreen } from './src/ui/screens/calendar';
import { NotesScreen } from './src/ui/screens/notes';
import { SynthSplash } from './src/ui/splash';
import { WelcomeScreen } from './src/ui/screens/WelcomeScreen';
import { LoginScreen } from './src/ui/screens/LoginScreen';
import { RegisterScreen } from './src/ui/screens/RegisterScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';
import { IncomingCallScreen } from './src/ui/screens/IncomingCallScreen';
import { ReminderPermissionModal } from './src/ui/components/call/ReminderPermissionModal';
import { AuthBackdrop } from './src/ui/components/auth/AuthBackdrop';
import { ProductTour } from './src/ui/tour/ProductTour';
import { buildTourSteps } from './src/ui/tour/tourSteps';
import { VoiceModal } from './src/ui/components/VoiceModal';
import { CallLafinaScreen } from './src/ui/screens/CallLafinaScreen';
import { endReviewSession } from './src/ai/nlu/commandReview';
import { chatDraftStore } from './src/ui/drafts/chatDraftStore';
import { applySpeechPreferences } from './src/ai/tts/speechPreferences';

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
  const [authScreen, setAuthScreen] = useState<'welcome' | 'login' | 'register'>('welcome');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [isOnboardingReplay, setIsOnboardingReplay] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [startupReady, setStartupReady] = useState(false);
  const [storageHealth, setStorageHealth] = useState(() => db.getHealth());
  const [callLafinaVisible, setCallLafinaVisible] = useState(false);

  // Incoming Call State
  const [callVisible, setCallVisible] = useState(false);
  const [callReminderId, setCallReminderId] = useState('');
  const [callTask, setCallTask] = useState('');
  const [callAction, setCallAction] = useState<NativeCallAction>('call');
  // Delivery identity captured when the call is admitted; every action is fenced by it.
  const [callGeneration, setCallGeneration] = useState<number | null>(null);
  const callOwnerRef = useRef<string | null>(null);
  const previousUserRef = useRef<string | null>(null);

  // Reminder Permission State
  const [permissionStatus, setPermissionStatus] = useState<ReminderPermissionStatus | null>(null);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);

  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  );

  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
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
    (request: CallRequest): boolean => {
      const admission = admitReminderCall(request, userId);
      if (!admission.admitted) return false;
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
    [userId],
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
    endActiveVoiceConversation('You switched accounts, so the conversation stopped.');
    // AGY-PORT 05: the previous owner's unsent Chat text and open voice sheet go too.
    chatDraftStore.retainOnly(userId);
    setVoiceVisible(false);
    if (callOwnerRef.current && callOwnerRef.current !== userId) {
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

  useEffect(() => {
    if (!userId) {
      stopReminderPoller();
      return undefined;
    }
    void rescheduleUserReminders(userId);
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
      try {
        let status = await getReminderPermissionStatus();
        if (Platform.OS === 'android' && (!status || !status.notificationsEnabled)) {
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

    void consumePendingNativeCall().then((payload) => {
      if (payload && presentCall(payload)) setIsLoading(false);
    });
  }, [userId, presentCall]);

  // Listen for both foreground scheduler events and native alarm/activity intents
  useEffect(() => {
    const foregroundSubscription = DeviceEventEmitter.addListener(
      EVENT_CALL_TRIGGER,
      (event: CallRequest) => {
        presentCall({ ...event, action: 'call' });
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
      // Debug/test builds: use the server chosen in Profile before any request.
      backendSelection.applySaved();

      const currentUser = userStore.getCurrentUser();
      if (currentUser) {
        setUserId(currentUser.id);
        setIsOnboarding(currentUser.isNewUser);
        syncWorker
          .performSync()
          .then(() => {
            setRefreshTrigger((previous) => previous + 1);
          })
          .catch(() => undefined);
      }

      setStartupReady(true);

      void appUpdater
        .markLaunchSuccessful()
        .then(() => appUpdater.check({ quiet: true }));
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
      onRemoteChanges: () => {
        setRefreshTrigger((previous) => previous + 1);
      },
    });
    if (AppState.currentState === 'active') {
      scheduler.start();
      void scheduler.runNow();
    }

    const unsubscribeRemoteChanges = syncWorker.onRemoteChanges((changedUserId) => {
      if (changedUserId === userId) {
        setRefreshTrigger((previous) => previous + 1);
        void rescheduleUserReminders(userId);
      }
    });

    let wasOnline = true;
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const isOnline =
        Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (isOnline && !wasOnline && AppState.currentState === 'active') {
        void scheduler.runNow();
      }
      wasOnline = isOnline;
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        scheduler.stop();
        stopReminderPoller();
        // Leaving the foreground: make Android hold exactly the armed work in
        // SQLite, so a retired or edited reminder cannot ring while the app
        // stays closed.
        if (nextState === 'background') void reconcileReminderDelivery(userId);
        return;
      }
      scheduler.start();
      startReminderPoller(userId);
      void rescheduleUserReminders(userId);
      void consumePendingNativeCall().then((payload) => {
        if (payload) presentCall(payload);
      });
      void getReminderPermissionStatus().then((status) => {
        if (status) setPermissionStatus(status);
      });
      syncWorker
        .performSync()
        .then(() => {
          setRefreshTrigger((previous) => previous + 1);
          void rescheduleUserReminders(userId);
        })
        .catch(() => undefined);
    });
    const unsubscribeOutbox = syncOutboxStore.onEnqueue((localUserId) => {
      if (localUserId === userId) scheduler.schedule();
    });

    return () => {
      appStateSubscription.remove();
      unsubscribeOutbox();
      unsubscribeRemoteChanges();
      unsubscribeNetInfo();
      scheduler.dispose();
    };
  }, [userId, setRefreshTrigger, presentCall]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, [setRefreshTrigger]);

  const hasPro = userId ? hasProEntitlement(userId) : false;

  const handleGetStarted = (uid: string) => {
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(user ? user.isNewUser : false);
    setActiveTab('calendar');
  };

  const handleGuestCreateAccount = () => {
    userStore.logout();
    setUserId(null);
    setAuthScreen('register');
  };

  const handleLoginSuccess = (uid: string) => {
    setUserId(uid);
    const user = userStore.getUserById(uid);
    setIsOnboarding(user ? user.isNewUser : false);
    setActiveTab('calendar');
    syncWorker
      .performSync()
      .then(() => {
        setRefreshTrigger((previous) => previous + 1);
      })
      .catch(() => undefined);
  };

  const handleRegisterSuccess = (uid: string) => {
    setUserId(uid);
    setIsOnboarding(true);
    setActiveTab('calendar');
  };

  const handleOnboardingComplete = () => {
    if (userId && !isOnboardingReplay) productTourStore.queue(userId);
    setIsOnboardingReplay(false);
    setIsOnboarding(false);
    syncWorker
      .performSync()
      .then(() => {
        setRefreshTrigger((previous) => previous + 1);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!userId || isOnboarding || isLoading) return;
    if (productTourStore.isPending(userId)) setTourOpen(true);
  }, [userId, isOnboarding, isLoading]);

  const finishTour = useCallback(
    (completed: boolean) => {
      if (userId) productTourStore.markSeen(userId, completed);
      setTourOpen(false);
    },
    [userId],
  );

  const handleLogout = (isGuestParam?: boolean) => {
    setTourOpen(false);
    setUserId(null);
    setAuthScreen(isGuestParam ? 'welcome' : 'login');
    setIsOnboarding(false);
    setActiveTab('calendar');
  };

  const renderScreen = () => {
    if (!userId) {
      return (
        <View style={[styles.errorScreen, themed.errorScreen]}>
          <Text style={themed.errorText}>Access Denied</Text>
        </View>
      );
    }
    switch (activeTab) {
      case 'chat':
        return (
          <ChatScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
            onCallLafina={() => setCallLafinaVisible(true)}
          />
        );
      case 'calendar':
        return (
          <CalendarScreen
            userId={userId}
            refreshTrigger={refreshTrigger}
            onRefresh={triggerRefresh}
          />
        );
      case 'notes':
        return (
          <NotesScreen
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
            onReplayTour={() => setTourOpen(true)}
            onReplayOnboarding={() => { setIsOnboardingReplay(true); setIsOnboarding(true); }}
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

  if (storageHealth.status === 'unavailable' || storageHealth.status === 'quarantined') {
    return <StorageRecoveryScreen health={storageHealth} onRetry={retryStorage} />;
  }

  if (isLoading) {
    return (
      <>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
        <SynthSplash ready={startupReady} onFinished={() => setIsLoading(false)} />
      </>
    );
  }

  if (!userId) {
    return (
      <AuthBackdrop>
        {authScreen === 'welcome' && (
          <WelcomeScreen
            onGetStarted={handleGetStarted}
            onNavigateToLogin={() => setAuthScreen('login')}
            onNavigateToRegister={() => setAuthScreen('register')}
          />
        )}
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

  if (isOnboarding) {
    return (
      <OnboardingScreen
        userId={userId}
        onOnboardingComplete={handleOnboardingComplete}
        onCancel={isOnboardingReplay ? () => { setIsOnboardingReplay(false); setIsOnboarding(false); } : undefined}
      />
    );
  }

  return (
    <View
      style={[
        styles.safeContainer,
        themed.safeContainer,
        { paddingTop: topInset + 6 },
      ]}
    >
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />

      <View style={styles.content}>{renderScreen()}</View>

      {!isKeyboardVisible && (
        <CustomTabBar
          activeTab={activeTab}
          onTabPress={setActiveTab}
          onMicPress={() => setVoiceVisible(true)}
        />
      )}

      <VoiceModal
        visible={voiceVisible}
        userId={userId || 'local_guest_user'}
        onClose={(didUpdate) => {
          setVoiceVisible(false);
          if (didUpdate) {
            setRefreshTrigger((prev) => prev + 1);
          }
        }}
        onUseInChat={() => setActiveTab('chat')}
        onOpenCallLafina={() => {
          setVoiceVisible(false);
          setCallLafinaVisible(true);
        }}
      />

      {callLafinaVisible && (
        <Modal
          visible={callLafinaVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setCallLafinaVisible(false)}
        >
          <CallLafinaScreen
            userId={userId || 'local_guest_user'}
            onClose={() => setCallLafinaVisible(false)}
          />
        </Modal>
      )}

      {tourOpen && (
        <ProductTour
          steps={buildTourSteps({ isGuest: userStore.isGuest(userId), isPro: hasPro })}
          onNavigate={setActiveTab}
          onFinish={finishTour}
        />
      )}

      {/* Proactive Incoming Reminder Call */}
      <IncomingCallScreen
        visible={callVisible}
        reminderId={callReminderId}
        task={callTask}
        userId={userId}
        initialAction={callAction}
        deliveryGeneration={callGeneration}
        onClose={() => {
          callOwnerRef.current = null;
          setCallVisible(false);
          triggerRefresh();
        }}
      />

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
        <MeetingsProvider userId={userId || 'local_guest_user'}>
          <AppContent
            userId={userId}
            setUserId={setUserId}
            refreshTrigger={refreshTrigger}
            setRefreshTrigger={setRefreshTrigger}
          />
        </MeetingsProvider>
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
