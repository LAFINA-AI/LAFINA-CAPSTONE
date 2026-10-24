import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { WelcomeScreen } from '../../src/ui/screens/WelcomeScreen';
import { OnboardingScreen } from '../../src/ui/screens/OnboardingScreen';
import { ProfileScreen } from '../../src/ui/screens/ProfileScreen';
import { db, initDatabase, userStore } from '../../src/storage';
import { GUEST_USER_ID } from '../../src/constants';

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

  test('OnboardingScreen steps through 5 steps and marks onboarding complete', async () => {
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

    for (let i = 0; i < 4; i += 1) {
      fireEvent.press(getByText('Continue'));
    }
    fireEvent.press(getByText('Get Started'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(userStore.isOnboardingComplete(guest.id)).toBe(true);
  });

  test('ProfileScreen renders guest profile banner and settings items', () => {
    const guest = userStore.createGuestUser();
    const onLogout = jest.fn();
    const onNavigateToRegister = jest.fn();
    const onReplayTour = jest.fn();
    const onRefresh = jest.fn();

    const { getByText } = render(
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
    expect(getByText('24-Hour Time Format')).toBeTruthy();
    expect(getByText('Week Starts on Monday')).toBeTruthy();
    expect(getByText('Dark Mode')).toBeTruthy();
    expect(getByText('Test TTS Voice')).toBeTruthy();
  });
});
