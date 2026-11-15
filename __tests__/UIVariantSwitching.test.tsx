import React from 'react';
import {Text} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  ThemeProvider,
  useTheme,
  useUIVariant,
} from '../src/ui/contexts/ThemeContext';
import {ProfileScreen} from '../src/ui/screens/ProfileScreen';
import {Colors} from '../src/ui/theme';
import {
  DEFAULT_UI_VARIANT,
  UI_VARIANT_DEVICE_SCOPE,
  UI_VARIANT_SETTING_KEY,
  db,
  getSavedUIVariant,
  initDatabase,
  localSettingsStore,
  normalizeUIVariant,
  notesStore,
  saveUIVariant,
  userStore,
} from '../src/storage';
import {GUEST_USER_ID} from '../src/constants';

const ThemeProbe: React.FC = () => {
  const theme = useTheme();
  const variant = useUIVariant();
  return (
    <>
      <Text testID="probe-variant">{variant.uiVariant}</Text>
      <Text testID="probe-is-modern">{String(variant.isModern)}</Text>
      <Text testID="probe-dark">{String(theme.isDarkMode)}</Text>
      <Text testID="probe-bg">{theme.colors.background}</Text>
      <Text testID="probe-primary">{theme.colors.primary}</Text>
      <Text testID="probe-accent">{theme.modernPalette.accent}</Text>
    </>
  );
};

describe('UI Variant Persistence & Independent Appearance Switching (Phase 02)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM users');
    userStore.createGuestUser();
  });

  test('defaults to modern safely when missing or invalid and preserves explicit classic choices', () => {
    expect(DEFAULT_UI_VARIANT).toBe('modern');
    expect(getSavedUIVariant(GUEST_USER_ID)).toBe('modern');
    expect(normalizeUIVariant(undefined)).toBe('modern');
    expect(normalizeUIVariant('unexpected_value')).toBe('modern');
    expect(normalizeUIVariant('classic')).toBe('classic');

    saveUIVariant(GUEST_USER_ID, 'classic');
    expect(getSavedUIVariant(GUEST_USER_ID)).toBe('classic');
    expect(
      localSettingsStore.get(
        UI_VARIANT_DEVICE_SCOPE,
        UI_VARIANT_SETTING_KEY,
        '',
      ),
    ).toBe('classic');

    // Corrupted saved row falls back safely without throwing
    localSettingsStore.set(GUEST_USER_ID, UI_VARIANT_SETTING_KEY, 'corrupt');
    localSettingsStore.set(
      UI_VARIANT_DEVICE_SCOPE,
      UI_VARIANT_SETTING_KEY,
      'corrupt',
    );
    expect(getSavedUIVariant(GUEST_USER_ID)).toBe('modern');
  });

  test('supports all 4 combinations independently: Modern Light, Modern Dark, Classic Light, Classic Dark', async () => {
    const userId = GUEST_USER_ID;

    // 1. Modern Light
    saveUIVariant(userId, 'modern');
    userStore.setDarkModeEnabled(userId, false);
    const ml = render(
      <ThemeProvider userId={userId}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(ml.getByTestId('probe-variant').props.children).toBe('modern'),
    );
    expect(ml.getByTestId('probe-dark').props.children).toBe('false');
    expect(ml.getByTestId('probe-bg').props.children).toBe('#FCFBFF');
    expect(ml.getByTestId('probe-primary').props.children).toBe('#5945EB');
    ml.unmount();

    // 2. Modern Dark
    userStore.setDarkModeEnabled(userId, true);
    const md = render(
      <ThemeProvider userId={userId}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(md.getByTestId('probe-dark').props.children).toBe('true'),
    );
    expect(md.getByTestId('probe-variant').props.children).toBe('modern');
    expect(md.getByTestId('probe-bg').props.children).toBe('#11101E');
    expect(md.getByTestId('probe-primary').props.children).toBe('#7C6BFF');
    md.unmount();

    // 3. Classic Light
    saveUIVariant(userId, 'classic');
    userStore.setDarkModeEnabled(userId, false);
    const cl = render(
      <ThemeProvider userId={userId}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(cl.getByTestId('probe-variant').props.children).toBe('classic'),
    );
    expect(cl.getByTestId('probe-dark').props.children).toBe('false');
    expect(cl.getByTestId('probe-bg').props.children).toBe('#FAF9F6');
    expect(cl.getByTestId('probe-primary').props.children).toBe(Colors.red);
    cl.unmount();

    // 4. Classic Dark
    userStore.setDarkModeEnabled(userId, true);
    const cd = render(
      <ThemeProvider userId={userId}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(cd.getByTestId('probe-variant').props.children).toBe('classic'),
    );
    expect(cd.getByTestId('probe-dark').props.children).toBe('true');
    expect(cd.getByTestId('probe-bg').props.children).toBe('#121212');
    expect(cd.getByTestId('probe-primary').props.children).toBe(Colors.red);
    cd.unmount();
  });

  test('ProfileScreen App Interface switches immediately between Modern and Classic without altering user data or dark mode', async () => {
    const userId = GUEST_USER_ID;
    db.executeSync('UPDATE users SET is_new_user = 0 WHERE id = ?', [userId]);
    localSettingsStore.set(userId, 'custom_setting_keep', 'intact');
    notesStore.insert({
      id: 'note-keep-1',
      userId,
      title: 'Algorithm Notes',
      body: 'Keep across UI switch',
      isPinned: false,
      tags: [],
      category: 'General',
      isVoiceTranscribed: false,
    });

    const onRefresh = jest.fn();
    const ui = render(
      <ThemeProvider userId={userId}>
        <ThemeProbe />
        <ProfileScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={onRefresh}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(ui.getByText('App Interface')).toBeTruthy();
      expect(ui.getByText('Choose how LAFINA looks')).toBeTruthy();
    });

    // Starts in Modern Light
    expect(ui.getByTestId('probe-variant').props.children).toBe('modern');
    expect(
      ui.getByTestId('ui-variant-modern').props.accessibilityState.checked,
    ).toBe(true);

    // Switch to Classic offline immediately
    fireEvent.press(ui.getByTestId('ui-variant-classic'));
    await waitFor(() => {
      expect(ui.getByTestId('probe-variant').props.children).toBe('classic');
      expect(getSavedUIVariant(userId)).toBe('classic');
    });
    expect(ui.getByTestId('probe-dark').props.children).toBe('false');

    // Toggle Dark Mode independently in Classic
    fireEvent(ui.getByLabelText('Dark Mode'), 'valueChange', true);
    await waitFor(() => {
      expect(ui.getByTestId('probe-dark').props.children).toBe('true');
      expect(ui.getByTestId('probe-variant').props.children).toBe('classic');
    });

    // Switch back to Modern Dark — Dark Mode stays true and user data/onboarding are untouched
    fireEvent.press(ui.getByTestId('ui-variant-modern'));
    await waitFor(() => {
      expect(ui.getByTestId('probe-variant').props.children).toBe('modern');
      expect(ui.getByTestId('probe-dark').props.children).toBe('true');
    });

    expect(userStore.getUserById(userId)?.isNewUser).toBe(false);
    expect(localSettingsStore.get(userId, 'custom_setting_keep', '')).toBe(
      'intact',
    );
    const keptNotes = db.executeSync('SELECT title FROM notes WHERE id = ?', [
      'note-keep-1',
    ]).rows;
    expect(keptNotes).toHaveLength(1);
    expect(keptNotes?.[0]?.title).toBe('Algorithm Notes');
  });

  test('loads saved variant safely across guest/signed-in account transitions', async () => {
    saveUIVariant(GUEST_USER_ID, 'classic');
    const signedInId = await userStore.register(
      'Juan Dela Cruz',
      'student1@ustp.edu.ph',
      'StrongPass123!',
    );
    saveUIVariant(signedInId, 'modern');

    const {getByTestId, rerender} = render(
      <ThemeProvider userId={GUEST_USER_ID}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(getByTestId('probe-variant').props.children).toBe('classic'),
    );

    rerender(
      <ThemeProvider userId={signedInId}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(getByTestId('probe-variant').props.children).toBe('modern'),
    );
  });
});
