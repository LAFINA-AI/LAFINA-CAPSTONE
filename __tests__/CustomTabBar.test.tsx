import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {ThemeProvider} from '../src/ui/contexts/ThemeContext';
import {CustomTabBar} from '../src/ui/components/CustomTabBar';
import {initDatabase} from '../src/storage';

describe('CustomTabBar (Phase 03 Modern Curved SVG + Classic Pill)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  test('renders Modern curved bottom navigation bar with always-visible labels and raised AI slot', () => {
    const onTabPress = jest.fn();
    const ui = render(
      <ThemeProvider userId={null} initialUIVariant="modern">
        <CustomTabBar activeTab="dashboard" onTabPress={onTabPress} />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('modern-custom-tab-bar')).toBeTruthy();
    expect(ui.queryByTestId('classic-custom-tab-bar')).toBeNull();

    // Always-visible labels in Modern mode
    expect(ui.getByText('Home')).toBeTruthy();
    expect(ui.getByText('Schedule')).toBeTruthy();
    expect(ui.getByText('AI')).toBeTruthy();
    expect(ui.getByText('Tools')).toBeTruthy();
    expect(ui.getByText('Profile')).toBeTruthy();

    fireEvent.press(ui.getByLabelText('Schedule tab'));
    expect(onTabPress).toHaveBeenCalledWith('calendar');

    fireEvent.press(ui.getByLabelText('AI tab'));
    expect(onTabPress).toHaveBeenCalledWith('chat');

    fireEvent.press(ui.getByLabelText('Tools tab'));
    expect(onTabPress).toHaveBeenCalledWith('notes');

    fireEvent.press(ui.getByLabelText('Profile tab'));
    expect(onTabPress).toHaveBeenCalledWith('profile');
  });

  test('preserves Classic floating pill CustomTabBar when ui_variant is classic', () => {
    const onTabPress = jest.fn();
    const ui = render(
      <ThemeProvider userId={null} initialUIVariant="classic">
        <CustomTabBar activeTab="dashboard" onTabPress={onTabPress} />
      </ThemeProvider>,
    );

    expect(ui.getByTestId('classic-custom-tab-bar')).toBeTruthy();
    expect(ui.queryByTestId('modern-custom-tab-bar')).toBeNull();

    // Classic mode shows only the active tab's label
    expect(ui.getByText('Home')).toBeTruthy();
    expect(ui.queryByText('Schedule')).toBeNull();
    expect(ui.queryByText('Tools')).toBeNull();
    expect(ui.queryByText('Profile')).toBeNull();

    fireEvent.press(ui.getByLabelText('AI tab'));
    expect(onTabPress).toHaveBeenCalledWith('chat');
  });
});
