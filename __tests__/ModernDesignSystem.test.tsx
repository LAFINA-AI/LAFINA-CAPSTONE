import React from 'react';
import {render} from '@testing-library/react-native';
import {Text} from 'react-native';
import {ThemeProvider} from '../src/ui/contexts/ThemeContext';
import {
  Colors,
  Layout,
  ModernLayout,
  ModernShadows,
  ModernTypography,
  getModernPalette,
  modernDarkPalette,
  modernDarkThemeColors,
  modernLightPalette,
  modernLightThemeColors,
} from '../src/ui/theme';
import {
  ModernBadge,
  ModernCard,
  ModernIconButton,
  ModernPillChip,
  ModernSectionHeader,
} from '../src/ui/components/modern/ModernPrimitives';
import {initDatabase} from '../src/storage';

describe('Modern Design System (Phase 01)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  test('preserves Classic Colors and Layout constants untouched', () => {
    expect(Colors.red).toBe('#F75A5A');
    expect(Colors.blue).toBe('#E6003A');
    expect(Layout.borderRadiusCard).toBe(16);
    expect(Layout.navbarHeight).toBe(72);
  });

  test('exposes UniGuide-inspired Modern Light & Dark palettes and ThemeColors mappings', () => {
    expect(modernLightPalette.bg).toBe('#FCFBFF');
    expect(modernLightPalette.card).toBe('#FFFFFF');
    expect(modernLightPalette.surface).toBe('#F4F2FA');
    expect(modernLightPalette.accent).toBe('#5945EB');
    expect(modernLightPalette.softViolet).toBe('#F2EFFF');
    expect(modernLightPalette.mint).toBe('#E5F8F0');
    expect(modernLightPalette.blueSoft).toBe('#EAF1FF');
    expect(modernLightPalette.peach).toBe('#FFF0E8');
    expect(modernLightPalette.lilac).toBe('#F2E9FA');
    expect(modernLightPalette.cream).toBe('#FFF3CA');

    expect(modernDarkPalette.bg).toBe('#11101E');
    expect(modernDarkPalette.card).toBe('#1B192E');
    expect(modernDarkPalette.surface).toBe('#24213C');
    expect(modernDarkPalette.accent).toBe('#7C6BFF');

    expect(modernLightThemeColors.background).toBe('#FCFBFF');
    expect(modernLightThemeColors.primary).toBe('#5945EB');
    expect(modernDarkThemeColors.background).toBe('#11101E');
    expect(modernDarkThemeColors.primary).toBe('#7C6BFF');

    expect(getModernPalette(false)).toBe(modernLightPalette);
    expect(getModernPalette(true)).toBe(modernDarkPalette);

    expect(ModernLayout.borderRadiusCard).toBe(24);
    expect(ModernLayout.borderRadiusSheet).toBe(28);
    expect(ModernLayout.borderRadiusInput).toBe(16);
    expect(ModernShadows.card.elevation).toBe(3);
    expect(ModernTypography.hero.fontSize).toBe(26);
  });

  test('renders ModernPrimitives cleanly in both Light and Dark Modern modes', () => {
    const onAction = jest.fn();
    const ui = render(
      <ThemeProvider userId={null} initialUIVariant="modern">
        <ModernCard testID="modern-card-sample" tone="softViolet">
          <ModernSectionHeader
            title="Academic Overview"
            subtitle="USTP 1st Semester"
            actionLabel="View All"
            onActionPress={onAction}
          />
          <ModernPillChip label="All" active onPress={onAction} />
          <ModernBadge label="LIVE NOW" tone="mint" />
          <ModernIconButton accessibilityLabel="Quick icon" onPress={onAction}>
            <Text>+</Text>
          </ModernIconButton>
        </ModernCard>
      </ThemeProvider>,
    );

    expect(ui.getByTestId('modern-card-sample')).toBeTruthy();
    expect(ui.getByText('Academic Overview')).toBeTruthy();
    expect(ui.getByText('USTP 1st Semester')).toBeTruthy();
    expect(ui.getByText('View All')).toBeTruthy();
    expect(ui.getByText('All')).toBeTruthy();
    expect(ui.getByText('LIVE NOW')).toBeTruthy();
  });
});
