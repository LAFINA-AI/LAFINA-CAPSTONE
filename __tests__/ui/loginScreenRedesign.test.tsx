import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {LoginScreen} from '../../src/ui/screens/LoginScreen';
import {RegisterScreen} from '../../src/ui/screens/RegisterScreen';
import {db, initDatabase, userStore} from '../../src/storage';
import {accountLinkService} from '../../src/cloud/accountLinkService';

jest.mock('../../src/cloud/accountLinkService', () => ({
  accountLinkService: {
    login: jest.fn(),
    registerCloudFirst: jest.fn(),
    registerOfflineOnly: jest.fn(),
  },
}));

describe('Auth Screens Redesign (Sign In & Create Account)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');
    userStore.setRememberMe(false, null);
  });

  describe('LoginScreen', () => {
    test('renders redesigned hero, segmented tabs, and clean form elements', () => {
      const {
        getByText,
        getByPlaceholderText,
        getByLabelText,
        getByTestId,
        queryByText,
      } = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={jest.fn()}
            onNavigateToRegister={jest.fn()}
            onBack={jest.fn()}
          />
        </ThemeProvider>,
      );

      // Gimmicks remain absent
      expect(queryByText('Academic AI Secretary')).toBeNull();
      expect(queryByText('Offline ready')).toBeNull();
      expect(
        queryByText('Encrypted Local Storage • 100% Offline Vault'),
      ).toBeNull();
      expect(queryByText('OR')).toBeNull();

      // Hero & segmented switcher
      expect(getByTestId('auth-back-button')).toBeTruthy();
      expect(getByText('LAFINA')).toBeTruthy();
      expect(getByText('Welcome back')).toBeTruthy();
      expect(
        getByText('Sign in to access your schedule and keep it in sync.'),
      ).toBeTruthy();
      expect(getByTestId('auth-tab-login')).toBeTruthy();
      expect(getByTestId('auth-tab-register')).toBeTruthy();

      // Form elements
      expect(getByText('Email')).toBeTruthy();
      expect(getByPlaceholderText('student@ustp.edu.ph')).toBeTruthy();
      expect(getByText('Password')).toBeTruthy();
      expect(getByPlaceholderText('••••••••')).toBeTruthy();
      expect(getByText('Remember me')).toBeTruthy();
      expect(getByTestId('login-submit-button')).toBeTruthy();
      expect(getByLabelText('Show password')).toBeTruthy();
    });

    test('toggles password visibility', () => {
      const {getByLabelText, queryByLabelText} = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={jest.fn()}
            onNavigateToRegister={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.press(getByLabelText('Show password'));
      expect(getByLabelText('Hide password')).toBeTruthy();
      expect(queryByLabelText('Show password')).toBeNull();

      fireEvent.press(getByLabelText('Hide password'));
      expect(getByLabelText('Show password')).toBeTruthy();
    });

    test('validates required fields on sign in attempt', async () => {
      const {getByTestId, getByText} = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={jest.fn()}
            onNavigateToRegister={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.press(getByTestId('login-submit-button'));

      await waitFor(() => {
        expect(getByText('Please fill in all fields')).toBeTruthy();
      });
    });

    test('toggling Remember Me does NOT write to SQLite prematurely', () => {
      const {getByText} = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={jest.fn()}
            onNavigateToRegister={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.press(getByText('Remember me'));
      expect(userStore.getRememberMe().enabled).toBe(false);
    });

    test('successful login with Remember Me checked commits email to userStore', async () => {
      (accountLinkService.login as jest.Mock).mockResolvedValueOnce({
        status: 'success',
        localUserId: 'usr_local_test_123',
        message: 'Successfully logged in',
      });

      const onLoginSuccess = jest.fn();

      const {getByText, getByPlaceholderText, getByTestId} = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={onLoginSuccess}
            onNavigateToRegister={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.changeText(
        getByPlaceholderText('student@ustp.edu.ph'),
        'Student@USTP.edu.ph ',
      );
      fireEvent.changeText(getByPlaceholderText('••••••••'), 'Password123!');
      fireEvent.press(getByText('Remember me'));
      fireEvent.press(getByTestId('login-submit-button'));

      await waitFor(() => {
        expect(accountLinkService.login).toHaveBeenCalledWith(
          'Student@USTP.edu.ph',
          'Password123!',
        );
        expect(onLoginSuccess).toHaveBeenCalledWith('usr_local_test_123');
      });

      const saved = userStore.getRememberMe();
      expect(saved.enabled).toBe(true);
      expect(saved.email).toBe('student@ustp.edu.ph');
    });

    test('successful login with Remember Me UNCHECKED clears previous email from userStore', async () => {
      userStore.setRememberMe(true, 'previous@ustp.edu.ph');

      (accountLinkService.login as jest.Mock).mockResolvedValueOnce({
        status: 'success',
        localUserId: 'usr_local_test_123',
        message: 'Successfully logged in',
      });

      const onLoginSuccess = jest.fn();

      const {getByText, getByPlaceholderText, getByTestId} = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={onLoginSuccess}
            onNavigateToRegister={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(getByPlaceholderText('student@ustp.edu.ph').props.value).toBe(
        'previous@ustp.edu.ph',
      );

      fireEvent.press(getByText('Remember me'));
      fireEvent.changeText(getByPlaceholderText('••••••••'), 'Password123!');
      fireEvent.press(getByTestId('login-submit-button'));

      await waitFor(() => {
        expect(onLoginSuccess).toHaveBeenCalledWith('usr_local_test_123');
      });

      const saved = userStore.getRememberMe();
      expect(saved.enabled).toBe(false);
      expect(saved.email).toBeNull();
    });

    test('displays error message when login fails and does not alter Remember Me', async () => {
      (accountLinkService.login as jest.Mock).mockResolvedValueOnce({
        status: 'error',
        message: 'Invalid credentials provided',
      });

      const onLoginSuccess = jest.fn();

      const {getByText, getByPlaceholderText, getByTestId} = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={onLoginSuccess}
            onNavigateToRegister={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.changeText(
        getByPlaceholderText('student@ustp.edu.ph'),
        'student@ustp.edu.ph',
      );
      fireEvent.changeText(getByPlaceholderText('••••••••'), 'WrongPassword');
      fireEvent.press(getByText('Remember me'));
      fireEvent.press(getByTestId('login-submit-button'));

      await waitFor(() => {
        expect(getByText('Invalid credentials provided')).toBeTruthy();
        expect(onLoginSuccess).not.toHaveBeenCalled();
      });

      expect(userStore.getRememberMe().enabled).toBe(false);
    });

    test('switches to Create account tab and triggers back action', () => {
      const onNavigateToRegister = jest.fn();
      const onBack = jest.fn();

      const {getByTestId} = render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={jest.fn()}
            onNavigateToRegister={onNavigateToRegister}
            onBack={onBack}
          />
        </ThemeProvider>,
      );

      fireEvent.press(getByTestId('auth-tab-register'));
      expect(onNavigateToRegister).toHaveBeenCalledTimes(1);

      fireEvent.press(getByTestId('auth-back-button'));
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('RegisterScreen', () => {
    test('renders redesigned hero, segmented tabs, strength meter, and legal checkbox', () => {
      const {getByText, getByPlaceholderText, getByTestId, getByLabelText} =
        render(
          <ThemeProvider userId={null}>
            <RegisterScreen
              onRegisterSuccess={jest.fn()}
              onNavigateToLogin={jest.fn()}
              onBack={jest.fn()}
            />
          </ThemeProvider>,
        );

      expect(getByTestId('auth-back-button')).toBeTruthy();
      expect(getByText('LAFINA')).toBeTruthy();
      expect(getByText('Create your account')).toBeTruthy();
      expect(
        getByText('Back up your schedule and keep it in sync.'),
      ).toBeTruthy();
      expect(getByTestId('auth-tab-login')).toBeTruthy();
      expect(getByTestId('auth-tab-register')).toBeTruthy();

      expect(getByText('Name')).toBeTruthy();
      expect(getByPlaceholderText('What should LAFINA call you?')).toBeTruthy();
      expect(getByText('Email')).toBeTruthy();
      expect(getByPlaceholderText('student@ustp.edu.ph')).toBeTruthy();
      expect(getByText('Password')).toBeTruthy();
      expect(getByPlaceholderText('Create a password')).toBeTruthy();
      expect(getByLabelText('Show password')).toBeTruthy();
      expect(getByTestId('register-password-strength')).toBeTruthy();
      expect(getByText('Use 8+ characters with a number.')).toBeTruthy();
      expect(getByTestId('register-terms-checkbox')).toBeTruthy();
      expect(getByText('Terms')).toBeTruthy();
      expect(getByText('Privacy Policy')).toBeTruthy();
      expect(getByTestId('register-submit-button')).toBeTruthy();
    });

    test('updates password strength indicator as user types', () => {
      const {getByPlaceholderText, getByTestId} = render(
        <ThemeProvider userId={null}>
          <RegisterScreen
            onRegisterSuccess={jest.fn()}
            onNavigateToLogin={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(
        getByTestId('register-password-strength').props.accessibilityLabel,
      ).toBe('Password strength 0 of 5');

      fireEvent.changeText(
        getByPlaceholderText('Create a password'),
        'StrongPass1!',
      );
      expect(
        getByTestId('register-password-strength').props.accessibilityLabel,
      ).toBe('Password strength 5 of 5');
    });

    test('opens Terms and Privacy Policy modals from links', () => {
      const {getByTestId, getByText} = render(
        <ThemeProvider userId={null}>
          <RegisterScreen
            onRegisterSuccess={jest.fn()}
            onNavigateToLogin={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.press(getByTestId('register-terms-link'));
      expect(getByText('Terms of Use')).toBeTruthy();
      fireEvent.press(getByText('Close'));

      fireEvent.press(getByTestId('register-privacy-link'));
      expect(getByText('1. Data Collection')).toBeTruthy();
      fireEvent.press(getByText('Close'));
    });

    test('validates fields, password rule, and terms checkbox before registering', async () => {
      const {getByPlaceholderText, getByTestId, getByText} = render(
        <ThemeProvider userId={null}>
          <RegisterScreen
            onRegisterSuccess={jest.fn()}
            onNavigateToLogin={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.press(getByTestId('register-submit-button'));
      await waitFor(() => {
        expect(getByText('Please fill in all fields')).toBeTruthy();
      });

      fireEvent.changeText(
        getByPlaceholderText('What should LAFINA call you?'),
        'Juan',
      );
      fireEvent.changeText(
        getByPlaceholderText('student@ustp.edu.ph'),
        'juan@ustp.edu.ph',
      );
      fireEvent.changeText(getByPlaceholderText('Create a password'), 'abcdef');
      fireEvent.press(getByTestId('register-submit-button'));
      await waitFor(() => {
        expect(accountLinkService.registerCloudFirst).not.toHaveBeenCalled();
      });

      fireEvent.changeText(
        getByPlaceholderText('Create a password'),
        'Password1',
      );
      fireEvent.press(getByTestId('register-submit-button'));
      await waitFor(() => {
        expect(
          getByText('Please agree to the Terms and Privacy Policy'),
        ).toBeTruthy();
      });
    });

    test('submits cloud-first registration when form is valid and terms checked', async () => {
      (
        accountLinkService.registerCloudFirst as jest.Mock
      ).mockResolvedValueOnce({
        status: 'success',
        localUserId: 'usr_reg_123',
        message: 'Registered',
      });

      const onRegisterSuccess = jest.fn();

      const {getByPlaceholderText, getByTestId} = render(
        <ThemeProvider userId={null}>
          <RegisterScreen
            onRegisterSuccess={onRegisterSuccess}
            onNavigateToLogin={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.changeText(
        getByPlaceholderText('What should LAFINA call you?'),
        'Juan dela Cruz',
      );
      fireEvent.changeText(
        getByPlaceholderText('student@ustp.edu.ph'),
        'juan@ustp.edu.ph',
      );
      fireEvent.changeText(
        getByPlaceholderText('Create a password'),
        'Password123',
      );
      fireEvent.press(getByTestId('register-terms-checkbox'));
      fireEvent.press(getByTestId('register-submit-button'));

      await waitFor(() => {
        expect(accountLinkService.registerCloudFirst).toHaveBeenCalledWith({
          username: 'Juan dela Cruz',
          email: 'juan@ustp.edu.ph',
          password: 'Password123',
        });
        expect(onRegisterSuccess).toHaveBeenCalledWith('usr_reg_123');
      });
    });

    test('offers offline-only registration fallback when device is offline', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      (
        accountLinkService.registerCloudFirst as jest.Mock
      ).mockResolvedValueOnce({
        status: 'offline',
        message: 'Device is offline.',
      });

      const {getByPlaceholderText, getByTestId} = render(
        <ThemeProvider userId={null}>
          <RegisterScreen
            onRegisterSuccess={jest.fn()}
            onNavigateToLogin={jest.fn()}
          />
        </ThemeProvider>,
      );

      fireEvent.changeText(
        getByPlaceholderText('What should LAFINA call you?'),
        'Juan',
      );
      fireEvent.changeText(
        getByPlaceholderText('student@ustp.edu.ph'),
        'juan@ustp.edu.ph',
      );
      fireEvent.changeText(
        getByPlaceholderText('Create a password'),
        'Password123',
      );
      fireEvent.press(getByTestId('register-terms-checkbox'));
      fireEvent.press(getByTestId('register-submit-button'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Device Offline',
          expect.stringContaining('Device is offline.'),
          expect.any(Array),
        );
      });
    });

    test('switches to Sign in tab and triggers back action', () => {
      const onNavigateToLogin = jest.fn();
      const onBack = jest.fn();

      const {getByTestId} = render(
        <ThemeProvider userId={null}>
          <RegisterScreen
            onRegisterSuccess={jest.fn()}
            onNavigateToLogin={onNavigateToLogin}
            onBack={onBack}
          />
        </ThemeProvider>,
      );

      fireEvent.press(getByTestId('auth-tab-login'));
      expect(onNavigateToLogin).toHaveBeenCalledTimes(1);

      fireEvent.press(getByTestId('auth-back-button'));
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});
