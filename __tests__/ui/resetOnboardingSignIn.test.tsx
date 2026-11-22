import React from 'react';
import {Alert} from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import App from '../../App';
import {db, initDatabase, productTourStore, userStore} from '../../src/storage';
import {onboardingProgressStore} from '../../src/storage/onboardingProgressStore';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {developerTestService} from '../../src/ui/components/profile/developerTestService';

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() =>
    jest.requireActual('../fixtures/sqliteFile').openSqliteFile(':memory:'),
  ),
}));

jest.mock('../../src/sync/syncWorker', () => ({
  syncWorker: {
    performSync: jest.fn().mockResolvedValue(undefined),
    takeRemoteChangeCount: jest.fn().mockReturnValue(0),
    onRemoteChanges: jest.fn().mockReturnValue(() => undefined),
  },
}));

describe('Clear all data & reset onboarding -> existing account sign-in', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    db.reopen();
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('runs intro, user setup, and walkthrough when signing into an existing cloud account after reset', async () => {
    const existingId = await userStore.register(
      'Existing Student',
      'existing@ustp.edu.ph',
      'Password123!',
    );
    userStore.setCurrentUser(existingId);
    userStore.markOnboardingComplete(existingId);
    productTourStore.markSeen(existingId, true);

    const reset = await developerTestService.clearAllDataAndResetOnboarding();
    expect(reset.success).toBe(true);
    expect(onboardingProgressStore.isResetPending()).toBe(true);

    jest
      .spyOn(accountLinkService, 'login')
      .mockImplementation(async (email, password) => {
        const restoredId = await userStore.createFromCloud({
          email,
          password,
          cloudAccountId: 'cloud-existing-1',
          role: 'student',
        });
        userStore.setCurrentUser(restoredId);
        return {
          status: 'success',
          localUserId: restoredId,
          restoredFromCloud: true,
          message: 'Welcome back. Your account was restored from the cloud.',
        };
      });

    render(<App />);

    // 1. LAFINA introduction (Welcome -> 4 slides -> Sign in)
    await waitFor(() => {
      expect(screen.getByTestId('intro-get-started')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('intro-get-started'));
    expect(screen.getByTestId('intro-page-1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('intro-skip'));
    expect(screen.getByTestId('intro-page-4')).toBeTruthy();
    fireEvent.press(screen.getByTestId('intro-sign-in'));

    // 2. Sign in to existing account
    await waitFor(() => {
      expect(screen.getByTestId('login-submit-button')).toBeTruthy();
    });
    fireEvent.changeText(
      screen.getByPlaceholderText('student@ustp.edu.ph'),
      'existing@ustp.edu.ph',
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('••••••••'),
      'Password123!',
    );
    fireEvent.press(screen.getByTestId('login-submit-button'));

    // 3. User setup (OnboardingScreen) runs despite cloud restore
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-ai')).toBeTruthy();
    });
    expect(onboardingProgressStore.isResetPending()).toBe(false);

    fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(screen.getByTestId('onboarding-cor-later')).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-cor-later'));
    expect(screen.getByTestId('onboarding-permissions')).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(screen.getByTestId('onboarding-ready')).toBeTruthy();

    // 4. Walkthrough runs when requested at the end of user setup
    fireEvent.press(screen.getByTestId('onboarding-finish-tour'));
    await waitFor(() => {
      expect(screen.getByTestId('product-tour-next')).toBeTruthy();
      expect(screen.getByText('Your day at a glance')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('product-tour-skip'));
    await waitFor(() => {
      expect(screen.queryByTestId('product-tour-next')).toBeNull();
    });

    const currentUser = userStore.getCurrentUser();
    expect(currentUser).not.toBeNull();
    expect(currentUser?.isNewUser).toBe(false);
    expect(onboardingProgressStore.isResetPending()).toBe(false);
  }, 20000);

  test('does not re-run onboarding on a normal cloud restore when reset was not requested', async () => {
    jest
      .spyOn(accountLinkService, 'login')
      .mockImplementation(async (email, password) => {
        const restoredId = await userStore.createFromCloud({
          email,
          password,
          cloudAccountId: 'cloud-normal-1',
          role: 'student',
        });
        userStore.setCurrentUser(restoredId);
        return {
          status: 'success',
          localUserId: restoredId,
          restoredFromCloud: true,
          message: 'Welcome back. Your account was restored from the cloud.',
        };
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('intro-have-account')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('intro-have-account'));

    await waitFor(() => {
      expect(screen.getByTestId('login-submit-button')).toBeTruthy();
    });
    fireEvent.changeText(
      screen.getByPlaceholderText('student@ustp.edu.ph'),
      'normal@ustp.edu.ph',
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('••••••••'),
      'Password123!',
    );
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(userStore.getCurrentUser()).not.toBeNull();
    });
    expect(screen.queryByTestId('onboarding-screen')).toBeNull();
    expect(screen.queryByLabelText('Walkthrough')).toBeNull();
  }, 20000);
});
