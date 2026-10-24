import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import { ThemeProvider, useTheme } from '../../src/ui/contexts/ThemeContext';
import { mixColors } from '../../src/ui/theme/colorMix';
import {
  splashMomentAt,
  splashLookAt,
  SPLASH_TIMING,
} from '../../src/ui/splash/synthWave';
import { buildTourSteps } from '../../src/ui/tour/tourSteps';
import { CustomTabBar } from '../../src/ui/components/CustomTabBar';
import { initDatabase, userStore } from '../../src/storage';

const ThemeProbe: React.FC = () => {
  const { isDarkMode, colors, toggleTheme } = useTheme();
  return (
    <TouchableOpacity testID="theme-toggle" onPress={() => toggleTheme()}>
      <Text testID="theme-mode">{isDarkMode ? 'dark' : 'light'}</Text>
      <Text testID="theme-bg">{colors.background}</Text>
    </TouchableOpacity>
  );
};

describe('Phase 01 Theme, SynthWave, ProductTour & CustomTabBar', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  test('mixColors computes valid blended hex values', () => {
    expect(mixColors('#000000', '#FFFFFF', 0.5).toLowerCase()).toBe('#808080');
    expect(mixColors('#D8163F', '#FAF9F6', 0)).toBe('#faf9f6');
  });

  test('synthWave computes splash phases and look envelopes cleanly', () => {
    const intro = splashMomentAt(100, null, SPLASH_TIMING);
    expect(intro.phase).toBe('intro');
    const look = splashLookAt(intro);
    expect(look.opacity).toBe(1);

    const done = splashMomentAt(3000, 1000, SPLASH_TIMING);
    expect(done.phase).toBe('done');
  });

  test('ThemeProvider toggles dark mode and persists to SQLite user row', async () => {
    const guest = userStore.createGuestUser();
    userStore.setDarkModeEnabled(guest.id, false);

    const { getByTestId } = render(
      <ThemeProvider userId={guest.id}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(getByTestId('theme-mode').props.children).toBe('light');
    fireEvent.press(getByTestId('theme-toggle'));
    expect(getByTestId('theme-mode').props.children).toBe('dark');
    expect(userStore.getDarkModeEnabled(guest.id)).toBe(true);
  });

  test('buildTourSteps returns the 7 student steps with no study-tool or business steps', () => {
    const guestSteps = buildTourSteps({ isGuest: true, isPro: false });
    expect(guestSteps.map((s) => s.id)).toEqual([
      'welcome',
      'calendar',
      'notes',
      'assistant',
      'voice',
      'account',
      'done',
    ]);
    expect(guestSteps[0]?.body).toContain('guest');
  });

  test('CustomTabBar renders student tabs and triggers tab and mic callbacks', () => {
    const onTabPress = jest.fn();
    const onMicPress = jest.fn();

    const { getByLabelText } = render(
      <ThemeProvider userId={null}>
        <CustomTabBar
          activeTab="calendar"
          onTabPress={onTabPress}
          onMicPress={onMicPress}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByLabelText('Notes tab'));
    expect(onTabPress).toHaveBeenCalledWith('notes');

    fireEvent.press(getByLabelText('Chat tab'));
    expect(onTabPress).toHaveBeenCalledWith('chat');

    fireEvent.press(getByLabelText('Profile tab'));
    expect(onTabPress).toHaveBeenCalledWith('profile');

    fireEvent.press(getByLabelText('Voice Action button'));
    expect(onMicPress).toHaveBeenCalledTimes(1);
  });
});
