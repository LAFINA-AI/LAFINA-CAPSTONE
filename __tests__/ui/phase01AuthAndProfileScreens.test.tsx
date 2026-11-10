import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { WelcomeScreen } from '../../src/ui/screens/WelcomeScreen';
import { OnboardingScreen } from '../../src/ui/screens/OnboardingScreen';
import { ProfileScreen } from '../../src/ui/screens/ProfileScreen';
import { db, initDatabase, userStore } from '../../src/storage';
import { GUEST_USER_ID } from '../../src/constants';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import {NativeModules} from 'react-native';

describe('Phase 01 Welcome, Onboarding, and Profile Screens', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');
  });

  test('WelcomeScreen starts guest session on Get Started Free and navigates to Login/Register', () => {
    const onGetStarted = jest.fn();
    const onNavigateToLogin = jest.fn();
    const onNavigateToRegister = jest.fn();

    const { getByText } = render(
      <ThemeProvider userId={null}>
        <WelcomeScreen
          onGetStarted={onGetStarted}
          onNavigateToLogin={onNavigateToLogin}
          onNavigateToRegister={onNavigateToRegister}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByText('Get Started Free'));
    expect(onGetStarted).toHaveBeenCalledWith(GUEST_USER_ID);

    fireEvent.press(getByText('Log In'));
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Create Account'));
    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
  });

  test('OnboardingScreen steps through 6 steps and marks onboarding complete', async () => {
    const guest = userStore.createGuestUser();
    const onComplete = jest.fn();

    const { getByText } = render(
      <ThemeProvider userId={guest.id}>
        <OnboardingScreen
          userId={guest.id}
          onOnboardingComplete={onComplete}
        />
      </ThemeProvider>,
    );

    for (let i = 0; i < 5; i += 1) {
      fireEvent.press(getByText('Continue'));
    }
    fireEvent.press(getByText('Get Started'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(userStore.isOnboardingComplete(guest.id)).toBe(true);
  });

  test('onboarding saves optional name and conversation style as memories', async () => {
    const guest = userStore.createGuestUser();
    chatMemoryStore.setEnabled(guest.id, true);
    const onComplete = jest.fn();
    const ui = render(<ThemeProvider userId={guest.id}><OnboardingScreen userId={guest.id} onOnboardingComplete={onComplete} /></ThemeProvider>);
    for (let i = 0; i < 4; i += 1) fireEvent.press(ui.getByText('Continue'));
    fireEvent.changeText(ui.getByTestId('onboarding-preferred-name'), 'Alex');
    fireEvent.press(ui.getByTestId('onboarding-tone-casual'));
    fireEvent.press(ui.getByText('Continue'));
    fireEvent.press(ui.getByText('Get Started'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const values = chatMemoryStore.list(guest.id).map(m => m.text);
    expect(values).toContain('Prefers to be called Alex.');
    expect(values).toContain('Prefers a casual conversational tone.');
  });

  test('developer settings expose onboarding replay in debug builds', () => {
    const guest = userStore.createGuestUser();
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.CapstoneBuild;
    modules.CapstoneBuild = {backendSwitchEnabled:true};
    const onReplayOnboarding = jest.fn();
    try {
      const ui = render(<ThemeProvider userId={guest.id}><ProfileScreen userId={guest.id} refreshTrigger={0} onRefresh={() => undefined} onReplayOnboarding={onReplayOnboarding} /></ThemeProvider>);
      fireEvent.press(ui.getByText('Replay onboarding'));
      expect(onReplayOnboarding).toHaveBeenCalledTimes(1);
      ui.unmount();
    } finally { modules.CapstoneBuild = original; }
  });

  test('canceling an onboarding replay preserves existing memories', () => {
    const guest = userStore.createGuestUser();
    const prior = chatMemoryStore.list(guest.id).map(m => m.text);
    const cancel = jest.fn();
    const ui = render(<ThemeProvider userId={guest.id}><OnboardingScreen userId={guest.id} onOnboardingComplete={() => undefined} onCancel={cancel} /></ThemeProvider>);
    fireEvent.press(ui.getByText('Cancel replay'));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(chatMemoryStore.list(guest.id).map(m => m.text)).toEqual(prior);
  });

  test('ProfileScreen renders guest profile banner and settings items', () => {
    const guest = userStore.createGuestUser();
    const onLogout = jest.fn();
    const onNavigateToRegister = jest.fn();
    const onReplayTour = jest.fn();
    const onRefresh = jest.fn();

    const { getByText, queryByText } = render(
      <ThemeProvider userId={guest.id}>
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={onRefresh}
          onLogout={onLogout}
          onNavigateToRegister={onNavigateToRegister}
          onReplayTour={onReplayTour}
        />
      </ThemeProvider>,
    );

    expect(getByText('Guest User')).toBeTruthy();
    expect(queryByText('24-Hour Time Format')).toBeNull();
    expect(userStore.get24HourFormat(guest.id)).toBe(false);
    expect(getByText('Week Starts on Monday')).toBeTruthy();
    expect(getByText('Dark Mode')).toBeTruthy();
    expect(getByText('Test TTS Voice')).toBeTruthy();
  });
});
