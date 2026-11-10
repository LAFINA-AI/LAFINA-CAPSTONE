import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {LoginScreen} from '../../src/ui/screens/LoginScreen';
import {db, initDatabase, userStore} from '../../src/storage';
import {accountLinkService} from '../../src/cloud/accountLinkService';

jest.mock('../../src/cloud/accountLinkService', () => ({
  accountLinkService: {
    login: jest.fn(),
  },
}));

describe('LoginScreen Premium UI & Remember Me Logic', () => {
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

  test('renders clean, premium UI elements without clutter pills or badges', () => {
    const onLoginSuccess = jest.fn();
    const onNavigateToRegister = jest.fn();

    const {getByText, getByPlaceholderText, getByLabelText, queryByText} =
      render(
        <ThemeProvider userId={null}>
          <LoginScreen
            onLoginSuccess={onLoginSuccess}
            onNavigateToRegister={onNavigateToRegister}
          />
        </ThemeProvider>,
      );

    // Gimmicks removed
    expect(queryByText('Academic AI Secretary')).toBeNull();
    expect(queryByText('Offline ready')).toBeNull();
    expect(
      queryByText('Encrypted Local Storage • 100% Offline Vault'),
    ).toBeNull();
    expect(queryByText('OR')).toBeNull();

    // Clean brand & form elements
    expect(getByText('Welcome Back')).toBeTruthy();
    expect(getByText('Sign in to access your offline schedule')).toBeTruthy();
    expect(getByText('Email Address')).toBeTruthy();
    expect(getByPlaceholderText('student@ustp.edu.ph')).toBeTruthy();
    expect(getByText('Password')).toBeTruthy();
    expect(getByPlaceholderText('••••••••')).toBeTruthy();
    expect(getByText('Remember me')).toBeTruthy();
    expect(getByText('Sign In')).toBeTruthy();
    expect(getByText("Don't have an account? ")).toBeTruthy();
    expect(getByText('Register')).toBeTruthy();
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

    const eyeButton = getByLabelText('Show password');
    fireEvent.press(eyeButton);

    expect(getByLabelText('Hide password')).toBeTruthy();
    expect(queryByLabelText('Show password')).toBeNull();

    fireEvent.press(getByLabelText('Hide password'));
    expect(getByLabelText('Show password')).toBeTruthy();
  });

  test('validates required fields on sign in attempt', async () => {
    const {getByText} = render(
      <ThemeProvider userId={null}>
        <LoginScreen
          onLoginSuccess={jest.fn()}
          onNavigateToRegister={jest.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByText('Sign In'));

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

    const rememberMeButton = getByText('Remember me');
    fireEvent.press(rememberMeButton);

    // Before login, DB is still untouched (enabled: false, email: null)
    expect(userStore.getRememberMe().enabled).toBe(false);
  });

  test('successful login with Remember Me checked commits email to userStore', async () => {
    (accountLinkService.login as jest.Mock).mockResolvedValueOnce({
      status: 'success',
      localUserId: 'usr_local_test_123',
      message: 'Successfully logged in',
    });

    const onLoginSuccess = jest.fn();

    const {getByText, getByPlaceholderText} = render(
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

    fireEvent.press(getByText('Sign In'));

    await waitFor(() => {
      expect(accountLinkService.login).toHaveBeenCalledWith(
        'Student@USTP.edu.ph',
        'Password123!',
      );
      expect(onLoginSuccess).toHaveBeenCalledWith('usr_local_test_123');
    });

    // Check that Remember Me was persisted with normalized lowercase email
    const saved = userStore.getRememberMe();
    expect(saved.enabled).toBe(true);
    expect(saved.email).toBe('student@ustp.edu.ph');
  });

  test('successful login with Remember Me UNCHECKED clears previous email from userStore', async () => {
    // Pre-seed an existing saved remember me
    userStore.setRememberMe(true, 'previous@ustp.edu.ph');

    (accountLinkService.login as jest.Mock).mockResolvedValueOnce({
      status: 'success',
      localUserId: 'usr_local_test_123',
      message: 'Successfully logged in',
    });

    const onLoginSuccess = jest.fn();

    const {getByText, getByPlaceholderText} = render(
      <ThemeProvider userId={null}>
        <LoginScreen
          onLoginSuccess={onLoginSuccess}
          onNavigateToRegister={jest.fn()}
        />
      </ThemeProvider>,
    );

    // Initial mount restores the saved email and checked state
    expect(getByPlaceholderText('student@ustp.edu.ph').props.value).toBe(
      'previous@ustp.edu.ph',
    );

    // User unchecks Remember Me
    fireEvent.press(getByText('Remember me'));

    fireEvent.changeText(getByPlaceholderText('••••••••'), 'Password123!');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith('usr_local_test_123');
    });

    // Successfully logged in with unchecked -> saved email is erased
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

    const {getByText, getByPlaceholderText} = render(
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

    fireEvent.press(getByText('Sign In'));

    await waitFor(() => {
      expect(getByText('Invalid credentials provided')).toBeTruthy();
      expect(onLoginSuccess).not.toHaveBeenCalled();
    });

    // DB remains unchanged because login failed
    expect(userStore.getRememberMe().enabled).toBe(false);
  });

  test('navigates to register screen when Register link is pressed', () => {
    const onNavigateToRegister = jest.fn();

    const {getByText} = render(
      <ThemeProvider userId={null}>
        <LoginScreen
          onLoginSuccess={jest.fn()}
          onNavigateToRegister={onNavigateToRegister}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByText('Register'));
    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
  });
});
