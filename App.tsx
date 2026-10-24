import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  Keyboard,
  AppState,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Fonts, useThemedStyles } from './src/ui/theme';
import {
  initDatabase,
  userStore,
  syncOutboxStore,
  productTourStore,
} from './src/storage';
import { CustomTabBar, TabType } from './src/ui/components/CustomTabBar';
import { hasProEntitlement } from './src/cloud';
import { ThemeProvider, useTheme } from './src/ui/contexts/ThemeContext';
import type { ThemeColors } from './src/ui/contexts/ThemeContext';
import {
  rescheduleUserReminders,
  startReminderPoller,
  stopReminderPoller,
} from './src/scheduler';
import { syncWorker } from './src/sync/syncWorker';
import { createSyncScheduler } from './src/sync/syncScheduler';
import { appUpdater } from './src/updates';

// Screens & UI
import { ProfileScreen } from './src/ui/screens/ProfileScreen';
import { CalendarScreen } from './src/ui/screens/calendar';
import { NotesScreen } from './src/ui/screens/notes';
import { SynthSplash } from './src/ui/splash';
import { WelcomeScreen } from './src/ui/screens/WelcomeScreen';
import { LoginScreen } from './src/ui/screens/LoginScreen';
import { RegisterScreen } from './src/ui/screens/RegisterScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';
import { AuthBackdrop } from './src/ui/components/auth/AuthBackdrop';
import { ProductTour } from './src/ui/tour/ProductTour';
import { buildTourSteps } from './src/ui/tour/tourSteps';

function AppContent({
  userId,
  setUserId,
}: {
  userId: string | null;
  setUserId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState<'welcome' | 'login' | 'register'>('welcome');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [startupReady, setStartupReady] = useState(false);

  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () =>
      setIsKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () =>
      setIsKeyboardVisible(false),
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

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

  useEffect(() => {
    const setupApp = async () => {
      try {
        await initDatabase();

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
    };
    void setupApp();
  }, [setUserId]);

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
    if (AppState.currentState === 'active') scheduler.start();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        scheduler.stop();
        stopReminderPoller();
        return;
      }
      scheduler.start();
      startReminderPoller(userId);
      void rescheduleUserReminders(userId);
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
      scheduler.dispose();
    };
  }, [userId]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

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
        if (syncWorker.takeRemoteChangeCount() > 0) {
          setRefreshTrigger((previous) => previous + 1);
        }
      })
      .catch(() => undefined);
  };

  const handleRegisterSuccess = (uid: string) => {
    setUserId(uid);
    setIsOnboarding(true);
    setActiveTab('calendar');
  };

  const handleOnboardingComplete = () => {
    if (userId) productTourStore.queue(userId);
    setIsOnboarding(false);
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

  const renderPlaceholderScreen = (title: string, subtitle: string) => (
    <View style={[styles.errorScreen, themed.errorScreen]}>
      <Text style={[styles.placeholderTitle, themed.text]}>{title}</Text>
      <Text style={[styles.placeholderSubtitle, themed.mutedText]}>{subtitle}</Text>
    </View>
  );

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
        return renderPlaceholderScreen(
          'LAFINA Assistant',
          'Offline scheduling & USTP Student Handbook assistant.',
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
      />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safeContainer, themed.safeContainer]}>
        <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />

        <View style={styles.content}>{renderScreen()}</View>

        {!isKeyboardVisible && (
          <CustomTabBar
            activeTab={activeTab}
            onTabPress={setActiveTab}
            onMicPress={() => setVoiceVisible(true)}
          />
        )}

        <Modal
          visible={voiceVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setVoiceVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, themed.modalCard]}>
              <Text style={[styles.placeholderTitle, themed.text]}>Voice Assistant</Text>
              <Text style={[styles.placeholderSubtitle, themed.mutedText]}>
                Push-to-talk offline voice input is enabled in the Voice phase.
              </Text>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]}
                onPress={() => setVoiceVisible(false)}
              >
                <Text style={[styles.modalCloseText, { color: colors.textOnPrimary }]}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {tourOpen && (
          <ProductTour
            steps={buildTourSteps({ isGuest: userStore.isGuest(userId), isPro: hasPro })}
            onNavigate={setActiveTab}
            onFinish={finishTour}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
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
    <ThemeProvider userId={userId}>
      <AppContent userId={userId} setUserId={setUserId} />
    </ThemeProvider>
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
