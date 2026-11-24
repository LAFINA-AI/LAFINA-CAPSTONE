import React from 'react';
import {fireEvent, render, within} from '@testing-library/react-native';
import {Path} from 'react-native-svg';
import {ThemeProvider} from '../src/ui/contexts/ThemeContext';
import {CustomTabBar} from '../src/ui/components/CustomTabBar';
import {
  getModernPalette,
  getModernThemeExtras,
  MODERN_AI_BUTTON_DESIGNS,
} from '../src/ui/theme';
import {mixColors} from '../src/ui/theme/colorMix';
import {
  initDatabase,
  MODERN_AI_BUTTON_DESIGN_IDS,
  userStore,
  type ModernAiButtonDesignId,
} from '../src/storage';

const toSvgArgb = (hex: string): number =>
  0xff000000 | parseInt(hex.slice(1), 16) | 0;

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
    expect(ui.getByText('Skills')).toBeTruthy();
    expect(ui.getByText('Profile')).toBeTruthy();

    fireEvent.press(ui.getByLabelText('Schedule tab'));
    expect(onTabPress).toHaveBeenCalledWith('calendar');

    fireEvent.press(ui.getByLabelText('AI tab'));
    expect(onTabPress).toHaveBeenCalledWith('chat');

    fireEvent.press(ui.getByLabelText('Skills tab'));
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
    expect(ui.queryByText('Skills')).toBeNull();
    expect(ui.queryByText('Profile')).toBeNull();

    fireEvent.press(ui.getByLabelText('AI tab'));
    expect(onTabPress).toHaveBeenCalledWith('chat');
  });

  test('renders LAFINA Synth-Orb with theme-adaptive core and luminous wave stops across Light and Dark modes', () => {
    const lightThemes = ['violet', 'ocean', 'forest'] as const;

    for (const themeId of lightThemes) {
      const idleUi = render(
        <ThemeProvider
          userId={null}
          initialUIVariant="modern"
          initialModernTheme={themeId}
        >
          <CustomTabBar activeTab="dashboard" onTabPress={jest.fn()} />
        </ThemeProvider>,
      );

      const fab = idleUi.getByTestId('modern-tab-chat-fab');
      const orb = within(fab).getByTestId('modern-tab-synth-orb');
      expect(orb).toBeTruthy();

      // 1 central glow strand + 7 harmonic wave strands inside the orb
      const wavePaths = within(orb).UNSAFE_getAllByType(Path);
      expect(wavePaths).toHaveLength(8);
      for (const wavePath of wavePaths) {
        expect(typeof wavePath.props.d).toBe('string');
        expect(wavePath.props.d).toMatch(/^M\d/);
      }

      const serializedIdle = JSON.stringify(idleUi.toJSON());
      expect(serializedIdle).toContain(
        `orbBezelGrad_synth_orb_54_${themeId}_light_idle`,
      );
      expect(serializedIdle).toContain(
        `orbCoreGrad_synth_orb_54_${themeId}_light_idle`,
      );
      expect(serializedIdle).toContain(
        `orbWaveGrad_synth_orb_54_${themeId}_light_idle`,
      );

      const lightPalette = getModernPalette(false, themeId);
      const lightExtras = getModernThemeExtras(false, themeId);
      // Light mode core uses the active theme accent (not hardcoded near-black #0E0B1C / #06050C)
      expect(serializedIdle).toContain(String(toSvgArgb(lightPalette.accent)));
      expect(serializedIdle).not.toContain(String(toSvgArgb('#0E0B1C')));
      expect(serializedIdle).not.toContain(String(toSvgArgb('#06050C')));

      for (const [offset, stopHex] of lightExtras.synthWaveStops) {
        const expectedWaveHex = mixColors(
          '#FFFFFF',
          stopHex,
          offset <= 0.5 ? 0.46 : 0.78,
        );
        expect(serializedIdle).toContain(String(toSvgArgb(expectedWaveHex)));
      }
      idleUi.unmount();
    }

    // Active Light Mode uses accentDeep as the core midpoint
    const activeLightUi = render(
      <ThemeProvider
        userId={null}
        initialUIVariant="modern"
        initialModernTheme="ocean"
      >
        <CustomTabBar activeTab="chat" onTabPress={jest.fn()} />
      </ThemeProvider>,
    );
    const activeLightSerialized = JSON.stringify(activeLightUi.toJSON());
    expect(activeLightSerialized).toContain(
      'orbCoreGrad_synth_orb_54_ocean_light_active',
    );
    expect(activeLightSerialized).toContain(
      String(toSvgArgb(getModernPalette(false, 'ocean').accentDeep)),
    );
    activeLightUi.unmount();

    // Dark Mode uses heroBgColor when idle, accent when active, and dark luminous wave stops
    const darkGuest = userStore.createGuestUser();
    userStore.setDarkModeEnabled(darkGuest.id, true);

    const darkIdleUi = render(
      <ThemeProvider
        userId={darkGuest.id}
        initialUIVariant="modern"
        initialModernTheme="forest"
      >
        <CustomTabBar activeTab="dashboard" onTabPress={jest.fn()} />
      </ThemeProvider>,
    );
    const darkIdleSerialized = JSON.stringify(darkIdleUi.toJSON());
    const darkForestExtras = getModernThemeExtras(true, 'forest');
    const darkForestPalette = getModernPalette(true, 'forest');
    expect(darkIdleSerialized).toContain(
      'orbCoreGrad_synth_orb_54_forest_dark_idle',
    );
    expect(darkIdleSerialized).toContain(
      String(toSvgArgb(darkForestExtras.heroBgColor)),
    );
    for (const [offset, stopHex] of darkForestExtras.synthWaveStops) {
      const expectedWaveHex = mixColors(
        '#FFFFFF',
        stopHex,
        offset <= 0.5 ? 0.26 : 0.62,
      );
      expect(darkIdleSerialized).toContain(String(toSvgArgb(expectedWaveHex)));
    }
    darkIdleUi.unmount();

    const darkActiveUi = render(
      <ThemeProvider
        userId={darkGuest.id}
        initialUIVariant="modern"
        initialModernTheme="forest"
      >
        <CustomTabBar activeTab="chat" onTabPress={jest.fn()} />
      </ThemeProvider>,
    );
    const darkActiveSerialized = JSON.stringify(darkActiveUi.toJSON());
    expect(darkActiveSerialized).toContain(
      'orbCoreGrad_synth_orb_54_forest_dark_active',
    );
    expect(darkActiveSerialized).toContain(
      String(toSvgArgb(darkForestPalette.accent)),
    );
    darkActiveUi.unmount();
  });

  test('renders all 12 selectable AI button designs (static & animated) with distinct SVG structures and theme-scoped IDs', () => {
    const expectedPathCounts: Record<ModernAiButtonDesignId, number> = {
      synth_orb: 8,
      liquid_pearl: 1,
      eclipse_dial: 2,
      prism_lens: 4,
      acoustic_core: 6,
      neural_mesh: 3,
      pulse_wave: 6,
      orbital_rings: 3,
      aurora_breathe: 2,
      equalizer_live: 1,
      celestial_spin: 3,
      quantum_sweep: 4,
    };

    expect(MODERN_AI_BUTTON_DESIGNS.map(d => d.id)).toEqual([
      ...MODERN_AI_BUTTON_DESIGN_IDS,
    ]);

    for (const designId of MODERN_AI_BUTTON_DESIGN_IDS) {
      const ui = render(
        <ThemeProvider
          userId={null}
          initialUIVariant="modern"
          initialModernTheme="ocean"
          initialModernAiButtonDesign={designId}
        >
          <CustomTabBar activeTab="dashboard" onTabPress={jest.fn()} />
        </ThemeProvider>,
      );

      const fab = ui.getByTestId('modern-tab-chat-fab');
      const orb = within(fab).getByTestId('modern-tab-synth-orb');
      const paths = within(orb).UNSAFE_getAllByType(Path);
      expect(paths).toHaveLength(expectedPathCounts[designId]);

      const serialized = JSON.stringify(ui.toJSON());
      expect(serialized).toContain(
        `orbBezelGrad_${designId}_54_ocean_light_idle`,
      );
      expect(serialized).toContain(
        `orbCoreGrad_${designId}_54_ocean_light_idle`,
      );
      if (designId === 'liquid_pearl') {
        expect(serialized).toContain(
          'orbPearlHot_liquid_pearl_54_ocean_light_idle',
        );
        expect(serialized).toContain(
          'orbPearlCool_liquid_pearl_54_ocean_light_idle',
        );
      }

      ui.unmount();
    }
  });
});
