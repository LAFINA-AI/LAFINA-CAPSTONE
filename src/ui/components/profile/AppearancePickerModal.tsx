import React, {useEffect, useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Check,
  Moon,
  Palette,
  Sparkles,
  Sun,
  X,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {
  Fonts,
  MODERN_AI_BUTTON_DESIGNS,
  MODERN_THEMES,
  ModernLayout,
  Spacing,
} from '../../theme';
import {LafinaSynthOrb} from '../LafinaSynthOrb';

export type AppearancePickerTab = 'themes' | 'ai_button';

interface AppearancePickerModalProps {
  visible: boolean;
  initialTab: AppearancePickerTab;
  onClose: () => void;
}

export const AppearancePickerModal: React.FC<AppearancePickerModalProps> = ({
  visible,
  initialTab,
  onClose,
}) => {
  const {
    colors,
    isDarkMode,
    toggleTheme,
    modernPalette,
    modernTheme,
    modernThemeMeta,
    modernThemeExtras,
    setModernTheme,
    modernAiButtonDesign,
    modernAiButtonDesignMeta,
    setModernAiButtonDesign,
  } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<AppearancePickerTab>(initialTab);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  const animatedDesigns = useMemo(
    () => MODERN_AI_BUTTON_DESIGNS.filter(d => Boolean(d.animated)),
    [],
  );
  const staticDesigns = useMemo(
    () => MODERN_AI_BUTTON_DESIGNS.filter(d => !d.animated),
    [],
  );

  const renderDesignTile = (
    design: (typeof MODERN_AI_BUTTON_DESIGNS)[number],
  ) => {
    const active = modernAiButtonDesign === design.id;
    return (
      <TouchableOpacity
        key={design.id}
        testID={`appearance-modal-ai-button-${design.id}`}
        accessibilityRole="radio"
        accessibilityState={{checked: active, selected: active}}
        accessibilityLabel={`${design.label}${
          design.animated ? ' (Animated)' : ''
        } AI button — ${design.subtitle}`}
        activeOpacity={0.82}
        onPress={() => setModernAiButtonDesign(design.id)}
        style={[
          styles.gridTile,
          {
            backgroundColor: active
              ? modernPalette.softViolet
              : modernPalette.surface,
            borderColor: active ? modernPalette.accent : modernPalette.border,
          },
        ]}
      >
        <LafinaSynthOrb
          design={design.id}
          size={34}
          isActive={active}
          isDarkMode={isDarkMode}
          modernTheme={modernTheme}
          modernPalette={modernPalette}
          modernThemeExtras={modernThemeExtras}
          animate={visible && activeTab === 'ai_button'}
          testID={`appearance-modal-ai-button-preview-${design.id}`}
        />
        <View style={styles.tileTextCol}>
          <View style={styles.tileTitleRow}>
            <Text
              style={[
                styles.tileLabel,
                {color: active ? modernPalette.accent : colors.textPrimary},
              ]}
              numberOfLines={1}
            >
              {design.label}
            </Text>
          </View>
          <Text
            style={[styles.tileSubtitle, {color: colors.textSecondary}]}
            numberOfLines={1}
          >
            {design.subtitle}
          </Text>
        </View>
        {active && (
          <View
            style={[
              styles.tileCheck,
              {backgroundColor: modernPalette.accent},
            ]}
          >
            <Check size={10} color="#FFFFFF" strokeWidth={3} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="appearance-picker-modal"
    >
      <View
        style={[
          styles.backdrop,
          {
            backgroundColor: colors.overlay,
            paddingTop: Math.max(insets.top + 16, 40),
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          testID="appearance-picker-backdrop"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: modernPalette.card,
              borderColor: modernPalette.border,
              paddingBottom: Math.max(insets.bottom, Spacing.lg),
            },
          ]}
          accessibilityViewIsModal
          testID="appearance-picker-sheet"
        >
          <View style={styles.dragHandleWrap}>
            <View
              style={[
                styles.dragHandle,
                {backgroundColor: modernPalette.border},
              ]}
            />
          </View>

          <View
            style={[
              styles.header,
              {borderBottomColor: modernPalette.border},
            ]}
          >
            <View style={styles.headerCopy}>
              <Text
                accessibilityRole="header"
                style={[styles.title, {color: colors.textPrimary}]}
              >
                Appearance Studio
              </Text>
              <Text
                style={[styles.subtitle, {color: colors.textSecondary}]}
                numberOfLines={1}
              >
                {modernThemeMeta.label} · {modernAiButtonDesignMeta.label}
              </Text>
            </View>
            <TouchableOpacity
              testID="appearance-modal-dark-toggle"
              accessibilityRole="button"
              accessibilityLabel={
                isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'
              }
              activeOpacity={0.8}
              onPress={() => toggleTheme()}
              style={[
                styles.modeToggleBtn,
                {
                  backgroundColor: modernPalette.surface,
                  borderColor: modernPalette.border,
                },
              ]}
            >
              {isDarkMode ? (
                <Moon size={15} color={modernPalette.accent} />
              ) : (
                <Sun size={15} color={modernPalette.accent} />
              )}
              <Text
                style={[
                  styles.modeToggleLabel,
                  {color: colors.textPrimary},
                ]}
              >
                {isDarkMode ? 'Dark' : 'Light'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="appearance-picker-close"
              accessibilityRole="button"
              accessibilityLabel="Close appearance studio"
              activeOpacity={0.8}
              onPress={onClose}
              style={[
                styles.closeBtn,
                {backgroundColor: modernPalette.surface},
              ]}
            >
              <X size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabBarWrap}>
            <View
              style={[
                styles.tabBar,
                {
                  backgroundColor: modernPalette.surface,
                  borderColor: modernPalette.border,
                },
              ]}
              accessibilityRole="tablist"
            >
              <TouchableOpacity
                testID="appearance-modal-tab-themes"
                accessibilityRole="tab"
                accessibilityState={{selected: activeTab === 'themes'}}
                activeOpacity={0.82}
                onPress={() => setActiveTab('themes')}
                style={[
                  styles.tabButton,
                  activeTab === 'themes' && {
                    backgroundColor: modernPalette.card,
                    borderColor: modernPalette.border,
                  },
                ]}
              >
                <Palette
                  size={15}
                  color={
                    activeTab === 'themes'
                      ? modernPalette.accent
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color:
                        activeTab === 'themes'
                          ? modernPalette.accent
                          : colors.textSecondary,
                    },
                  ]}
                >
                  Themes ({MODERN_THEMES.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="appearance-modal-tab-ai-button"
                accessibilityRole="tab"
                accessibilityState={{selected: activeTab === 'ai_button'}}
                activeOpacity={0.82}
                onPress={() => setActiveTab('ai_button')}
                style={[
                  styles.tabButton,
                  activeTab === 'ai_button' && {
                    backgroundColor: modernPalette.card,
                    borderColor: modernPalette.border,
                  },
                ]}
              >
                <Sparkles
                  size={15}
                  color={
                    activeTab === 'ai_button'
                      ? modernPalette.accent
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color:
                        activeTab === 'ai_button'
                          ? modernPalette.accent
                          : colors.textSecondary,
                    },
                  ]}
                >
                  AI Button ({MODERN_AI_BUTTON_DESIGNS.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'themes' ? (
              <>
                <View
                  testID="appearance-modal-theme-preview"
                  style={[
                    styles.themeHeroPreview,
                    {backgroundColor: modernThemeExtras.heroBgColor},
                  ]}
                >
                  <View style={styles.themeHeroLeft}>
                    <View style={styles.themeHeroPillRow}>
                      <View
                        style={[
                          styles.themeHeroPill,
                          {backgroundColor: modernPalette.heroPillBg},
                        ]}
                      >
                        <Text
                          style={[
                            styles.themeHeroPillText,
                            {color: modernPalette.heroText},
                          ]}
                        >
                          {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                        </Text>
                      </View>
                      {modernThemeMeta.badge ? (
                        <View
                          style={[
                            styles.themeHeroPill,
                            {backgroundColor: modernPalette.heroPillBg},
                          ]}
                        >
                          <Text
                            style={[
                              styles.themeHeroPillText,
                              {color: modernPalette.heroText},
                            ]}
                          >
                            {modernThemeMeta.badge}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.themeHeroName,
                        {color: modernPalette.heroText},
                      ]}
                    >
                      {modernThemeMeta.label}
                    </Text>
                    <Text
                      style={[
                        styles.themeHeroSubtitle,
                        {color: modernPalette.heroMutedText},
                      ]}
                    >
                      {modernThemeMeta.subtitle}
                    </Text>
                    {modernTheme === 'oled' && !isDarkMode ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => toggleTheme()}
                        style={[
                          styles.oledHintPill,
                          {backgroundColor: modernPalette.heroPillBg},
                        ]}
                      >
                        <Moon size={12} color={modernPalette.heroText} />
                        <Text
                          style={[
                            styles.oledHintText,
                            {color: modernPalette.heroText},
                          ]}
                        >
                          Tap to preview true black Dark Mode
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={styles.themeHeroOrbWrap}>
                    <LafinaSynthOrb
                      design={modernAiButtonDesign}
                      size={56}
                      isActive={true}
                      isDarkMode={isDarkMode}
                      modernTheme={modernTheme}
                      modernPalette={modernPalette}
                      modernThemeExtras={modernThemeExtras}
                      animate={visible}
                      testID="appearance-modal-theme-preview-orb"
                    />
                  </View>
                </View>

                <View
                  style={styles.grid}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="All color themes"
                >
                  {MODERN_THEMES.map(theme => {
                    const active = modernTheme === theme.id;
                    const preview = isDarkMode
                      ? theme.previewDark
                      : theme.previewLight;
                    return (
                      <TouchableOpacity
                        key={theme.id}
                        testID={`appearance-modal-theme-${theme.id}`}
                        accessibilityRole="radio"
                        accessibilityState={{checked: active, selected: active}}
                        accessibilityLabel={`${theme.label} theme — ${theme.subtitle}`}
                        activeOpacity={0.82}
                        onPress={() => setModernTheme(theme.id)}
                        style={[
                          styles.gridTile,
                          {
                            backgroundColor: active
                              ? modernPalette.softViolet
                              : modernPalette.surface,
                            borderColor: active
                              ? modernPalette.accent
                              : modernPalette.border,
                          },
                        ]}
                      >
                        <View style={styles.swatchTriad}>
                          <View
                            style={[
                              styles.swatchMain,
                              {
                                backgroundColor: preview[0],
                                borderColor: modernPalette.card,
                              },
                            ]}
                          />
                          <View
                            style={[
                              styles.swatchMid,
                              {
                                backgroundColor: preview[1],
                                borderColor: modernPalette.card,
                              },
                            ]}
                          />
                          <View
                            style={[
                              styles.swatchTint,
                              {
                                backgroundColor: preview[2],
                                borderColor: modernPalette.border,
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.tileTextCol}>
                          <View style={styles.tileTitleRow}>
                            <Text
                              style={[
                                styles.tileLabel,
                                {
                                  color: active
                                    ? modernPalette.accent
                                    : colors.textPrimary,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {theme.label}
                            </Text>
                            {theme.badge ? (
                              <View
                                style={[
                                  styles.miniBadge,
                                  {
                                    backgroundColor: active
                                      ? modernPalette.accent
                                      : modernPalette.card,
                                    borderColor: modernPalette.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.miniBadgeText,
                                    {
                                      color: active
                                        ? '#FFFFFF'
                                        : colors.textSecondary,
                                    },
                                  ]}
                                >
                                  {theme.badge}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text
                            style={[
                              styles.tileSubtitle,
                              {color: colors.textSecondary},
                            ]}
                            numberOfLines={1}
                          >
                            {theme.subtitle}
                          </Text>
                        </View>
                        {active && (
                          <View
                            style={[
                              styles.tileCheck,
                              {backgroundColor: modernPalette.accent},
                            ]}
                          >
                            <Check size={10} color="#FFFFFF" strokeWidth={3} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View
                  testID="appearance-modal-orb-stage"
                  style={[
                    styles.orbStageCard,
                    {
                      backgroundColor: modernPalette.surface,
                      borderColor: modernPalette.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.orbStageHalo,
                      {backgroundColor: modernPalette.softViolet},
                    ]}
                  >
                    <LafinaSynthOrb
                      design={modernAiButtonDesign}
                      size={74}
                      isActive={true}
                      isDarkMode={isDarkMode}
                      modernTheme={modernTheme}
                      modernPalette={modernPalette}
                      modernThemeExtras={modernThemeExtras}
                      animate={visible && activeTab === 'ai_button'}
                      testID="appearance-modal-orb-stage-preview"
                    />
                  </View>
                  <View style={styles.orbStageCopy}>
                    <View style={styles.orbStageBadgeRow}>
                      <Text
                        style={[
                          styles.orbStageTitle,
                          {color: colors.textPrimary},
                        ]}
                      >
                        {modernAiButtonDesignMeta.label}
                      </Text>
                      <View
                        style={[
                          styles.motionBadge,
                          {
                            backgroundColor: modernAiButtonDesignMeta.animated
                              ? modernPalette.softViolet
                              : modernPalette.card,
                            borderColor: modernAiButtonDesignMeta.animated
                              ? modernPalette.accent
                              : modernPalette.border,
                          },
                        ]}
                      >
                        {modernAiButtonDesignMeta.animated ? (
                          <Sparkles size={10} color={modernPalette.accent} />
                        ) : null}
                        <Text
                          style={[
                            styles.motionBadgeText,
                            {
                              color: modernAiButtonDesignMeta.animated
                                ? modernPalette.accent
                                : colors.textSecondary,
                            },
                          ]}
                        >
                          {modernAiButtonDesignMeta.animated
                            ? 'Animated'
                            : 'Still'}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.orbStageSubtitle,
                        {color: colors.textSecondary},
                      ]}
                    >
                      {modernAiButtonDesignMeta.subtitle}
                    </Text>
                  </View>
                </View>

                <View style={styles.sectionHeaderRow}>
                  <Sparkles size={13} color={modernPalette.accent} />
                  <Text
                    style={[
                      styles.sectionLabel,
                      {color: colors.textPrimary},
                    ]}
                  >
                    Animated Designs
                  </Text>
                  <Text
                    style={[
                      styles.sectionCount,
                      {color: colors.textSecondary},
                    ]}
                  >
                    {animatedDesigns.length}
                  </Text>
                </View>
                <View
                  style={styles.grid}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Animated AI button designs"
                >
                  {animatedDesigns.map(renderDesignTile)}
                </View>

                <View
                  style={[styles.sectionHeaderRow, styles.sectionHeaderSpacer]}
                >
                  <Text
                    style={[
                      styles.sectionLabel,
                      {color: colors.textPrimary},
                    ]}
                  >
                    Classic Designs
                  </Text>
                  <Text
                    style={[
                      styles.sectionCount,
                      {color: colors.textSecondary},
                    ]}
                  >
                    {staticDesigns.length}
                  </Text>
                </View>
                <View
                  style={styles.grid}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Classic AI button designs"
                >
                  {staticDesigns.map(renderDesignTile)}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '90%',
    borderTopLeftRadius: ModernLayout.borderRadiusSheet,
    borderTopRightRadius: ModernLayout.borderRadiusSheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  modeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
  },
  modeToggleLabel: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabLabel: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  themeHeroPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: ModernLayout.borderRadiusCard,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },
  themeHeroLeft: {
    flex: 1,
    minWidth: 0,
  },
  themeHeroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  themeHeroPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  themeHeroPillText: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
  },
  themeHeroName: {
    fontFamily: Fonts.heading,
    fontSize: 19,
    fontWeight: '700',
  },
  themeHeroSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    marginTop: 2,
  },
  oledHintPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  oledHintText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '600',
  },
  themeHeroOrbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbStageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: ModernLayout.borderRadiusCard,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  orbStageHalo: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbStageCopy: {
    flex: 1,
    minWidth: 0,
  },
  orbStageBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  orbStageTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: '700',
  },
  orbStageSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 17,
  },
  motionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  motionBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionHeaderSpacer: {
    marginTop: 16,
  },
  sectionLabel: {
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
  },
  sectionCount: {
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridTile: {
    width: '48.2%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: ModernLayout.borderRadiusSubCard,
    borderWidth: 1.5,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  swatchTriad: {
    width: 30,
    height: 28,
    position: 'relative',
    justifyContent: 'center',
  },
  swatchMain: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    borderWidth: 1.5,
  },
  swatchMid: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  swatchTint: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    position: 'absolute',
    right: 1,
    top: 0,
  },
  tileTextCol: {
    flex: 1,
    minWidth: 0,
  },
  tileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tileLabel: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  miniBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  miniBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 8.5,
    fontWeight: '700',
  },
  tileSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 10.5,
    marginTop: 1,
  },
  tileCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
