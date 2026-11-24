import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {act, fireEvent, render, within} from '@testing-library/react-native';
import {
  DEFAULT_MODERN_AI_BUTTON_DESIGN,
  DEFAULT_MODERN_THEME,
  db,
  getSavedModernAiButtonDesign,
  getSavedModernTheme,
  initDatabase,
  localSettingsStore,
  MODERN_AI_BUTTON_DESIGN_IDS,
  MODERN_AI_BUTTON_DESIGN_SETTING_KEY,
  MODERN_THEME_DEVICE_SCOPE,
  MODERN_THEME_IDS,
  MODERN_THEME_SETTING_KEY,
  normalizeModernAiButtonDesign,
  normalizeModernTheme,
  saveModernAiButtonDesign,
  saveModernTheme,
  type ModernThemeId,
} from '../src/storage';
import {
  ThemeProvider,
  useModernTheme,
  useTheme,
} from '../src/ui/contexts/ThemeContext';
import {
  classicDarkColors,
  classicLightColors,
  getModernPalette,
  getModernShadows,
  getModernThemeExtras,
  getThemeColors,
  MODERN_THEMES,
  modernDarkPalette,
  modernDarkThemeColors,
  modernLightPalette,
  modernLightThemeColors,
} from '../src/ui/theme';
import {useThemedStyles} from '../src/ui/theme/createThemedStyles';
import {CustomTabBar} from '../src/ui/components/CustomTabBar';
import {SynthWaveAvatar} from '../src/ui/components/callLafina/SynthWaveAvatar';
import {ChatScreen} from '../src/ui/screens/ChatScreen';
import {DashboardScreen} from '../src/ui/screens/dashboard';
import {ProfileScreen} from '../src/ui/screens/ProfileScreen';

const relativeLuminance = (hex: string): number => {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => {
    const channel = parseInt(clean.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (foreground: string, background: string): number => {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

let seq = 0;
const makeStudent = (prefix: string): string => {
  seq += 1;
  const id = `mtheme-${prefix}-${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, `Theme ${prefix}`, `${id}@example.invalid`, now, now],
  );
  return id;
};

describe('Modern Color Themes', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('palette, extras, and WCAG contrast contracts', () => {
    test('preserves exact default Violet and Classic object references', () => {
      expect(DEFAULT_MODERN_THEME).toBe('violet');
      expect(getModernPalette(false)).toBe(modernLightPalette);
      expect(getModernPalette(true)).toBe(modernDarkPalette);
      expect(getModernPalette(false, 'violet')).toBe(modernLightPalette);
      expect(getModernPalette(true, 'violet')).toBe(modernDarkPalette);

      expect(getThemeColors('modern', false)).toBe(modernLightThemeColors);
      expect(getThemeColors('modern', true)).toBe(modernDarkThemeColors);
      expect(getThemeColors('classic', false, 'forest')).toBe(
        classicLightColors,
      );
      expect(getThemeColors('classic', true, 'rose')).toBe(classicDarkColors);
    });

    test('provides 12 distinct themes (including true-black OLED) with readable contrast in both Light and Dark modes', () => {
      expect(MODERN_THEMES.map(t => t.id)).toEqual([...MODERN_THEME_IDS]);
      expect(MODERN_THEME_IDS).toEqual([
        'violet',
        'forest',
        'ocean',
        'rose',
        'sunset',
        'slate',
        'oled',
        'midnight',
        'cyber',
        'amber',
        'sakura',
        'matcha',
      ]);

      // OLED dark mode uses true pitch-black canvas and chat backdrop stops
      const oledDark = getModernPalette(true, 'oled');
      const oledDarkExtras = getModernThemeExtras(true, 'oled');
      expect(oledDark.bg).toBe('#000000');
      expect(oledDarkExtras.chatBgStops[2]).toBe('#000000');

      const lightAccents = new Set<string>();
      const darkAccents = new Set<string>();
      const shadowColors = new Set<string>();

      for (const id of MODERN_THEME_IDS) {
        const light = getModernPalette(false, id);
        const dark = getModernPalette(true, id);
        const lightTheme = getThemeColors('modern', false, id);
        const darkTheme = getThemeColors('modern', true, id);
        const lightExtras = getModernThemeExtras(false, id);
        const darkExtras = getModernThemeExtras(true, id);

        lightAccents.add(light.accent);
        darkAccents.add(dark.accent);
        shadowColors.add(lightExtras.shadowColor);

        // ThemeColors mirrors ModernPalette accents in both modes
        expect(lightTheme.primary).toBe(light.accent);
        expect(lightTheme.blue).toBe(light.accent);
        expect(lightTheme.red).toBe(light.accent);
        expect(lightTheme.background).toBe(light.bg);
        expect(lightTheme.statusBarStyle).toBe('dark-content');

        expect(darkTheme.primary).toBe(dark.accent);
        expect(darkTheme.background).toBe(dark.bg);
        expect(darkTheme.statusBarStyle).toBe('light-content');

        // Contrast checks for white text/icons on interactive surfaces & cards
        expect(contrastRatio('#FFFFFF', light.accent)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrastRatio(light.accentDeep, '#FFFFFF'),
        ).toBeGreaterThanOrEqual(5.5);
        expect(contrastRatio('#FFFFFF', light.darkInkBtn)).toBeGreaterThan(
          10.0,
        );
        expect(
          contrastRatio('#FFFFFF', lightExtras.heroBgColor),
        ).toBeGreaterThanOrEqual(4.4);
        expect(contrastRatio(light.text, light.bg)).toBeGreaterThan(10.0);
        expect(contrastRatio(light.text, light.card)).toBeGreaterThan(10.0);

        expect(contrastRatio('#FFFFFF', dark.accent)).toBeGreaterThanOrEqual(
          3.8,
        );
        expect(
          contrastRatio(dark.heroCardSecondary, '#FFFFFF'),
        ).toBeGreaterThanOrEqual(5.5);
        expect(
          contrastRatio('#FFFFFF', dark.darkInkBtn),
        ).toBeGreaterThanOrEqual(5.4);
        expect(
          contrastRatio('#FFFFFF', darkExtras.heroBgColor),
        ).toBeGreaterThanOrEqual(5.0);
        expect(contrastRatio(dark.text, dark.bg)).toBeGreaterThan(12.0);
        expect(contrastRatio(dark.text, dark.card)).toBeGreaterThan(11.0);

        // Chat background gradient + SynthWave stops + tinted shadows
        expect(lightExtras.chatBgStops).toHaveLength(3);
        expect(darkExtras.chatBgStops).toHaveLength(3);
        expect(lightExtras.synthWaveStops).toHaveLength(8);
        expect(darkExtras.synthWaveStops).toHaveLength(8);
        expect(getModernShadows(lightExtras.shadowColor).card.shadowColor).toBe(
          lightExtras.shadowColor,
        );
      }

      expect(lightAccents.size).toBe(MODERN_THEME_IDS.length);
      expect(darkAccents.size).toBe(MODERN_THEME_IDS.length);
      expect(shadowColors.size).toBe(MODERN_THEME_IDS.length);
    });
  });

  describe('modernThemeStore persistence', () => {
    test('normalizes invalid values to default violet and persists per user + device fallback', () => {
      expect(normalizeModernTheme(null)).toBe('violet');
      expect(normalizeModernTheme('unknown-theme')).toBe('violet');
      expect(normalizeModernTheme('forest')).toBe('forest');

      const u1 = makeStudent('store-1');
      const u2 = makeStudent('store-2');

      saveModernTheme(null, 'ocean');
      expect(getSavedModernTheme(null)).toBe('ocean');
      // New user inherits device fallback when they have not chosen their own yet
      expect(getSavedModernTheme(u1)).toBe('ocean');

      saveModernTheme(u1, 'rose');
      expect(getSavedModernTheme(u1)).toBe('rose');
      expect(getSavedModernTheme(null)).toBe('rose');

      saveModernTheme(u2, 'sunset');
      expect(getSavedModernTheme(u2)).toBe('sunset');
      expect(getSavedModernTheme(u1)).toBe('rose');

      // Corrupt row normalizes cleanly without throwing
      localSettingsStore.set(u1, MODERN_THEME_SETTING_KEY, 'corrupt_value');
      expect(getSavedModernTheme(u1)).toBe('violet');

      // Device scope can recover cleanly on SQLite exception
      jest.spyOn(localSettingsStore, 'get').mockImplementation(() => {
        throw new Error('sqlite unavailable');
      });
      expect(getSavedModernTheme(u1)).toBe('violet');
      expect(() =>
        saveModernTheme(MODERN_THEME_DEVICE_SCOPE, 'forest'),
      ).not.toThrow();
    });

    test('normalizes and persists AI button design per user + device fallback', () => {
      expect(DEFAULT_MODERN_AI_BUTTON_DESIGN).toBe('synth_orb');
      expect(MODERN_AI_BUTTON_DESIGN_IDS).toEqual([
        'synth_orb',
        'liquid_pearl',
        'eclipse_dial',
        'prism_lens',
        'acoustic_core',
        'neural_mesh',
        'pulse_wave',
        'orbital_rings',
        'aurora_breathe',
        'equalizer_live',
        'celestial_spin',
        'quantum_sweep',
      ]);
      expect(normalizeModernAiButtonDesign(null)).toBe('synth_orb');
      expect(normalizeModernAiButtonDesign('unknown')).toBe('synth_orb');
      expect(normalizeModernAiButtonDesign('eclipse_dial')).toBe(
        'eclipse_dial',
      );

      const u1 = makeStudent('ai-btn-1');
      const u2 = makeStudent('ai-btn-2');

      saveModernAiButtonDesign(null, 'prism_lens');
      expect(getSavedModernAiButtonDesign(null)).toBe('prism_lens');
      expect(getSavedModernAiButtonDesign(u1)).toBe('prism_lens');

      saveModernAiButtonDesign(u1, 'liquid_pearl');
      expect(getSavedModernAiButtonDesign(u1)).toBe('liquid_pearl');
      expect(getSavedModernAiButtonDesign(null)).toBe('liquid_pearl');

      saveModernAiButtonDesign(u2, 'acoustic_core');
      expect(getSavedModernAiButtonDesign(u2)).toBe('acoustic_core');
      expect(getSavedModernAiButtonDesign(u1)).toBe('liquid_pearl');

      localSettingsStore.set(
        u1,
        MODERN_AI_BUTTON_DESIGN_SETTING_KEY,
        'corrupt',
      );
      expect(getSavedModernAiButtonDesign(u1)).toBe('synth_orb');
    });
  });

  describe('ThemeContext & UI integration', () => {
    test('ThemeProvider and useThemedStyles update reactively while preserving Dark Mode & Classic isolation', () => {
      const uid = makeStudent('ctx');
      const seenThemes: ModernThemeId[] = [];
      let controls!: ReturnType<typeof useTheme> &
        ReturnType<typeof useModernTheme>;

      const getBoxStyles = (
        colors: ReturnType<typeof useTheme>['colors'],
        _dark: boolean,
        meta: {
          modernTheme: ModernThemeId;
          modernPalette: ReturnType<typeof useTheme>['modernPalette'];
          modernShadows: ReturnType<typeof useTheme>['modernShadows'];
        },
      ) => {
        seenThemes.push(meta.modernTheme);
        return StyleSheet.create({
          box: {
            backgroundColor: colors.primary,
            borderColor: meta.modernPalette.border,
            shadowColor: meta.modernShadows.floating.shadowColor,
          },
        });
      };

      const Probe: React.FC = () => {
        const theme = useTheme();
        const modern = useModernTheme();
        const boxStyles = useThemedStyles(getBoxStyles);
        controls = {...theme, ...modern};
        return (
          <View testID="theme-probe" style={boxStyles.box}>
            <Text testID="theme-probe-label">
              {theme.modernThemeMeta.label}
            </Text>
            <TouchableOpacity
              testID="pick-slate"
              onPress={() => modern.setModernTheme('slate')}
            />
          </View>
        );
      };

      const ui = render(
        <ThemeProvider userId={uid} initialModernTheme="violet">
          <Probe />
        </ThemeProvider>,
      );

      expect(ui.getByTestId('theme-probe-label').props.children).toBe('Violet');
      expect(ui.getByTestId('theme-probe').props.style.backgroundColor).toBe(
        getModernPalette(false, 'violet').accent,
      );

      act(() => {
        controls.setModernTheme('forest');
      });
      expect(ui.getByTestId('theme-probe-label').props.children).toBe('Forest');
      expect(ui.getByTestId('theme-probe').props.style.backgroundColor).toBe(
        getModernPalette(false, 'forest').accent,
      );
      expect(ui.getByTestId('theme-probe').props.style.shadowColor).toBe(
        getModernThemeExtras(false, 'forest').shadowColor,
      );
      expect(seenThemes).toEqual(['violet', 'forest']);

      // Switching to Classic preserves Modern selection without overwriting Classic colors
      act(() => {
        controls.setUIVariant('classic');
      });
      expect(controls.colors).toBe(classicLightColors);
      expect(controls.modernTheme).toBe('forest');
    });

    test('ProfileScreen exposes compact Color Theme quick-picks and More themes modal with all 12 themes', () => {
      const uid = makeStudent('profile');
      const onRefresh = jest.fn();

      const ui = render(
        <ThemeProvider
          userId={uid}
          initialUIVariant="modern"
          initialModernTheme="violet"
          initialModernAiButtonDesign="synth_orb"
        >
          <ProfileScreen
            userId={uid}
            refreshTrigger={0}
            onRefresh={onRefresh}
          />
        </ThemeProvider>,
      );

      expect(ui.getByTestId('modern-theme-selector')).toBeTruthy();
      expect(
        within(ui.getByTestId('modern-theme-active-badge')).getByText('Violet'),
      ).toBeTruthy();
      // Compact preview shows 4 featured themes instead of crowding Profile
      expect(ui.getByTestId('modern-theme-violet')).toBeTruthy();
      expect(ui.getByTestId('modern-theme-oled')).toBeTruthy();
      expect(ui.getByTestId('modern-theme-forest')).toBeTruthy();
      expect(ui.getByTestId('modern-theme-ocean')).toBeTruthy();
      expect(ui.queryByTestId('modern-theme-rose')).toBeNull();

      expect(
        ui.getByTestId('modern-theme-violet').props.accessibilityState,
      ).toEqual({checked: true, selected: true});

      // Open Appearance Studio via "More themes" button to access all 12 themes
      fireEvent.press(ui.getByTestId('modern-theme-more-button'));
      expect(ui.getByTestId('appearance-picker-modal')).toBeTruthy();
      for (const themeId of MODERN_THEME_IDS) {
        expect(ui.getByTestId(`appearance-modal-theme-${themeId}`)).toBeTruthy();
      }

      fireEvent.press(ui.getByTestId('appearance-modal-theme-rose'));
      expect(
        within(ui.getByTestId('modern-theme-active-badge')).getByText('Rose'),
      ).toBeTruthy();
      expect(getSavedModernTheme(uid)).toBe('rose');

      // Close modal: active theme Rose is now surfaced in the compact Profile grid
      fireEvent.press(ui.getByTestId('appearance-picker-close'));
      expect(ui.queryByTestId('appearance-picker-modal')).toBeNull();
      expect(
        ui.getByTestId('modern-theme-rose').props.accessibilityState,
      ).toEqual({checked: true, selected: true});
      expect(
        ui.getByTestId('modern-theme-violet').props.accessibilityState,
      ).toEqual({checked: false, selected: false});
    });

    test('ProfileScreen exposes compact AI Button quick-picks and More designs modal with static and animated designs', () => {
      const uid = makeStudent('ai-design-profile');
      const ui = render(
        <ThemeProvider
          userId={uid}
          initialUIVariant="modern"
          initialModernTheme="violet"
          initialModernAiButtonDesign="synth_orb"
        >
          <ProfileScreen
            userId={uid}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(ui.getByTestId('modern-ai-button-selector')).toBeTruthy();
      expect(
        within(ui.getByTestId('modern-ai-button-active-badge')).getByText(
          'Synth Orb',
        ),
      ).toBeTruthy();

      // Compact quick-picks include static + animated designs
      expect(ui.getByTestId('modern-ai-button-synth_orb')).toBeTruthy();
      expect(ui.getByTestId('modern-ai-button-pulse_wave')).toBeTruthy();
      expect(ui.getByTestId('modern-ai-button-orbital_rings')).toBeTruthy();
      expect(ui.getByTestId('modern-ai-button-liquid_pearl')).toBeTruthy();
      expect(ui.queryByTestId('modern-ai-button-eclipse_dial')).toBeNull();

      expect(
        ui.getByTestId('modern-ai-button-synth_orb').props.accessibilityState,
      ).toEqual({checked: true, selected: true});

      // Open Appearance Studio directly on the AI Button tab
      fireEvent.press(ui.getByTestId('modern-ai-button-more-button'));
      expect(ui.getByTestId('appearance-picker-modal')).toBeTruthy();
      expect(ui.getByTestId('appearance-modal-orb-stage')).toBeTruthy();
      for (const designId of MODERN_AI_BUTTON_DESIGN_IDS) {
        expect(
          ui.getByTestId(`appearance-modal-ai-button-${designId}`),
        ).toBeTruthy();
        expect(
          ui.getByTestId(`appearance-modal-ai-button-preview-${designId}`),
        ).toBeTruthy();
      }

      fireEvent.press(ui.getByTestId('appearance-modal-ai-button-quantum_sweep'));
      expect(
        within(ui.getByTestId('modern-ai-button-active-badge')).getByText(
          'Quantum Sweep',
        ),
      ).toBeTruthy();
      expect(getSavedModernAiButtonDesign(uid)).toBe('quantum_sweep');

      fireEvent.press(ui.getByTestId('appearance-picker-close'));
      expect(
        ui.getByTestId('modern-ai-button-quantum_sweep').props
          .accessibilityState,
      ).toEqual({checked: true, selected: true});
      expect(
        ui.getByTestId('modern-ai-button-synth_orb').props.accessibilityState,
      ).toEqual({checked: false, selected: false});
    });

    test('ProfileScreen hides Modern Color Theme selector when Classic interface is active', () => {
      const uid = makeStudent('classic-profile');
      const ui = render(
        <ThemeProvider
          userId={uid}
          initialUIVariant="classic"
          initialModernTheme="ocean"
        >
          <ProfileScreen
            userId={uid}
            refreshTrigger={0}
            onRefresh={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(ui.queryByTestId('modern-theme-selector')).toBeNull();
      expect(ui.queryByTestId('modern-ai-button-selector')).toBeNull();
    });

    test('ModernHomeContent, CustomTabBar, ChatScreen, and SynthWaveAvatar adopt selected theme tokens', async () => {
      const uid = makeStudent('screens');

      const homeUi = render(
        <ThemeProvider
          userId={uid}
          initialUIVariant="modern"
          initialModernTheme="forest"
        >
          <DashboardScreen
            userId={uid}
            refreshTrigger={0}
            onRefresh={jest.fn()}
            onOpenCalendarTab={jest.fn()}
            onOpenNotesTab={jest.fn()}
            onOpenChatTab={jest.fn()}
          />
        </ThemeProvider>,
      );
      await act(async () => {
        await Promise.resolve();
      });

      const forestExtras = getModernThemeExtras(false, 'forest');
      const forestPalette = getModernPalette(false, 'forest');
      const heroStyle = StyleSheet.flatten(
        homeUi.getByTestId('dashboard-widget-up-next').props.style,
      );
      const ctaStyle = StyleSheet.flatten(
        homeUi.getByTestId('dashboard-hero-cta').props.style,
      );
      const ctaTextStyle = StyleSheet.flatten(
        homeUi.getByTestId('dashboard-hero-cta-text').props.style,
      );
      expect(heroStyle.backgroundColor).toBe(forestExtras.heroBgColor);
      expect(heroStyle.shadowColor).toBe(forestExtras.shadowColor);
      expect(ctaStyle.backgroundColor).toBe('#FFFFFF');
      expect(ctaTextStyle.color).toBe(forestPalette.accentDeep);

      const tabUi = render(
        <ThemeProvider
          userId={uid}
          initialUIVariant="modern"
          initialModernTheme="ocean"
        >
          <CustomTabBar activeTab="dashboard" onTabPress={jest.fn()} />
        </ThemeProvider>,
      );
      const oceanPalette = getModernPalette(false, 'ocean');
      const oceanExtras = getModernThemeExtras(false, 'ocean');
      const centerFabStyle = StyleSheet.flatten(
        tabUi.getByTestId('modern-tab-chat-fab').props.style,
      );
      expect(centerFabStyle.backgroundColor).toBe(oceanPalette.accent);
      expect(centerFabStyle.shadowColor).toBe(oceanExtras.shadowColor);

      const avatarUi = render(
        <ThemeProvider
          userId={uid}
          initialUIVariant="modern"
          initialModernTheme="sunset"
        >
          <SynthWaveAvatar phase="idle" size={76} testID="sunset-wave" />
        </ThemeProvider>,
      );
      const sunsetExtras = getModernThemeExtras(false, 'sunset');
      const avatarStyle = StyleSheet.flatten(
        avatarUi.getByTestId('sunset-wave').props.style,
      );
      expect(avatarStyle.backgroundColor).toBe(sunsetExtras.synthAvatarBg);

      const chatUi = render(
        <ThemeProvider
          userId={uid}
          initialUIVariant="modern"
          initialModernTheme="forest"
        >
          <ChatScreen userId={uid} />
        </ThemeProvider>,
      );
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
      });
      expect(chatUi.getByTestId('chat-screen-container')).toBeTruthy();
      const chatTree = JSON.stringify(chatUi.toJSON());
      expect(chatTree).toContain('chatUniGuideBg_forest_light');
      const toSvgArgb = (hex: string): number =>
        0xff000000 | parseInt(hex.slice(1), 16) | 0;
      for (const stop of forestExtras.chatBgStops) {
        expect(chatTree).toContain(String(toSvgArgb(stop)));
      }
      const composerStyle = StyleSheet.flatten(
        chatUi.getByTestId('chat-composer-input-row').props.style,
      );
      expect(composerStyle.shadowColor).toBe(forestExtras.shadowColor);
      chatUi.unmount();
      avatarUi.unmount();
      tabUi.unmount();
      homeUi.unmount();
    });
  });
});
