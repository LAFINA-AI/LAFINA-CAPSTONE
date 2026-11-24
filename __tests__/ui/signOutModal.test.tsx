import React from 'react';
import * as RN from 'react-native';
import {StyleSheet} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {authService} from '../../src/cloud/authService';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {SignOutModal} from '../../src/ui/components/profile/SignOutModal';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {
  classicLightColors,
  getModernPalette,
  type ModernThemeId,
} from '../../src/ui/theme';

let seq = 0;
const makeStudent = (prefix: string): string => {
  seq += 1;
  const id = `signout-${prefix}-${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, `SignOut ${prefix}`, `${id}@example.invalid`, now, now],
  );
  return id;
};

describe('SignOutModal (scalable & theme-adaptive)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('adapts card dimensions and theme surfaces across compact phones, tablets, OLED dark, and Classic light', () => {
    const uid = makeStudent('responsive');
    userStore.setDarkModeEnabled(uid, true);

    jest.spyOn(RN.Dimensions, 'get').mockReturnValue({
      width: 320,
      height: 540,
      scale: 2,
      fontScale: 1.3,
    });

    const compactUi = render(
      <ThemeProvider
        userId={uid}
        initialUIVariant="modern"
        initialModernTheme={'oled' as ModernThemeId}
      >
        <SignOutModal
          visible={true}
          isGuest={false}
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
        />
      </ThemeProvider>,
    );

    const compactCard = StyleSheet.flatten(
      compactUi.getByTestId('sign-out-modal-card').props.style,
    );
    const oledDark = getModernPalette(true, 'oled');
    expect(compactCard.backgroundColor).toBe(oledDark.card);
    expect(compactCard.maxWidth).toBeLessThanOrEqual(292);
    expect(compactCard.maxHeight).toBeLessThanOrEqual(500);
    compactUi.unmount();

    jest.spyOn(RN.Dimensions, 'get').mockReturnValue({
      width: 800,
      height: 1200,
      scale: 2,
      fontScale: 1,
    });
    userStore.setDarkModeEnabled(uid, false);

    const tabletUi = render(
      <ThemeProvider userId={uid} initialUIVariant="classic">
        <SignOutModal
          visible={true}
          isGuest={true}
          onCancel={jest.fn()}
          onConfirm={jest.fn()}
          onCreateAccount={jest.fn()}
        />
      </ThemeProvider>,
    );

    const tabletCard = StyleSheet.flatten(
      tabletUi.getByTestId('sign-out-modal-card').props.style,
    );
    expect(tabletCard.backgroundColor).toBe(classicLightColors.cardBg);
    expect(tabletCard.maxWidth).toBe(480);
    expect(tabletUi.getByTestId('sign-out-create-account-btn')).toBeTruthy();
    tabletUi.unmount();
  });

  test('ProfileScreen opens scalable SignOutModal for signed-in student and signs out on confirm', async () => {
    const uid = makeStudent('profile-student');
    const onLogout = jest.fn();
    const logoutSpy = jest
      .spyOn(authService, 'logout')
      .mockResolvedValue({status: 'success', data: null});

    const ui = render(
      <ThemeProvider
        userId={uid}
        initialUIVariant="modern"
        initialModernTheme="violet"
      >
        <ProfileScreen
          userId={uid}
          refreshTrigger={0}
          onRefresh={jest.fn()}
          onLogout={onLogout}
        />
      </ThemeProvider>,
    );

    expect(ui.queryByTestId('sign-out-modal')).toBeNull();
    fireEvent.press(ui.getByText('Sign Out'));

    expect(ui.getByTestId('sign-out-modal')).toBeTruthy();
    expect(ui.getByTestId('sign-out-modal-title').props.children).toBe(
      'Sign Out',
    );
    expect(ui.queryByTestId('sign-out-create-account-btn')).toBeNull();

    // Cancel closes cleanly without logging out
    fireEvent.press(ui.getByTestId('sign-out-cancel-btn'));
    expect(ui.queryByTestId('sign-out-modal')).toBeNull();
    expect(onLogout).not.toHaveBeenCalled();

    // Re-open and confirm
    fireEvent.press(ui.getByText('Sign Out'));
    await act(async () => {
      fireEvent.press(ui.getByTestId('sign-out-confirm-btn'));
      await Promise.resolve();
    });

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledWith(false);
    ui.unmount();
  });

  test('ProfileScreen opens guest Dismiss Guest modal with Create Account shortcut and confirms guest dismissal', async () => {
    const guest = userStore.createGuestUser();
    const onLogout = jest.fn();
    const onNavigateToRegister = jest.fn();

    const ui = render(
      <ThemeProvider
        userId={guest.id}
        initialUIVariant="modern"
        initialModernTheme="ocean"
      >
        <ProfileScreen
          userId={guest.id}
          refreshTrigger={0}
          onRefresh={jest.fn()}
          onLogout={onLogout}
          onNavigateToRegister={onNavigateToRegister}
        />
      </ThemeProvider>,
    );

    fireEvent.press(ui.getByText('Dismiss Guest & Sign Out'));
    expect(ui.getByTestId('sign-out-modal')).toBeTruthy();
    expect(ui.getByTestId('sign-out-modal-title').props.children).toBe(
      'Dismiss Guest Session',
    );

    fireEvent.press(ui.getByTestId('sign-out-create-account-btn'));
    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
    expect(ui.queryByTestId('sign-out-modal')).toBeNull();

    fireEvent.press(ui.getByText('Dismiss Guest & Sign Out'));
    await act(async () => {
      fireEvent.press(ui.getByTestId('sign-out-confirm-btn'));
      await Promise.resolve();
    });

    expect(onLogout).toHaveBeenCalledWith(true);
    ui.unmount();
  });
});
