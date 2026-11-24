import React, {useMemo, useState} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {CalendarDays, House, Sparkles, User, Wrench} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import type {ThemeColors} from '../contexts/ThemeContext';
import {Fonts, Layout, ModernLayout, Shadows} from '../theme';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {TourAnchor} from '../tour/tourSteps';
import {tourTargetRef} from '../tour/tourTargets';
import {
  LafinaSynthOrb,
  MODERN_FAB_SIZE,
  type LafinaSynthOrbProps,
} from './LafinaSynthOrb';

export {LafinaSynthOrb, type LafinaSynthOrbProps};

export type TabType = 'chat' | 'calendar' | 'dashboard' | 'notes' | 'profile';

/**
 * Home | Schedule | AI | Notes | Profile (tab redesign plan T1). The keys stay
 * as they were, so call navigation, tour anchors and widget links still work;
 * only what the student sees changes.
 */
export const TAB_ORDER: readonly TabType[] = [
  'dashboard',
  'calendar',
  'chat',
  'notes',
  'profile',
];

export const TAB_LABELS: Record<TabType, string> = {
  dashboard: 'Home',
  calendar: 'Schedule',
  chat: 'AI',
  notes: 'Skills',
  profile: 'Profile',
};

const TAB_ICONS: Record<
  TabType,
  React.ComponentType<{size: number; color: string}>
> = {
  dashboard: House,
  calendar: CalendarDays,
  chat: Sparkles,
  notes: Wrench,
  profile: User,
};

/** LAFINA's AI sits in the raised centre slot. */
const CENTER_TAB: TabType = 'chat';

const TOUR_TABS: Record<TabType, TourAnchor> = {
  chat: 'tab-chat',
  calendar: 'tab-calendar',
  dashboard: 'tab-dashboard',
  notes: 'tab-notes',
  profile: 'tab-profile',
};

const BAR_BOTTOM_OFFSET = 24;
const MODERN_FAB_OVERHANG = 28;

interface CustomTabBarProps {
  activeTab: TabType;
  onTabPress: (tab: TabType) => void;
}

function buildCurvedTabBarPath(width: number, totalHeight: number): string {
  const safeW = Math.max(width, 240);
  const r = ModernLayout.navbarTopRadius;
  const centerX = safeW / 2;
  const notchHalf = ModernLayout.navbarNotchHalf;
  const notchDepth = ModernLayout.navbarNotchDepth;
  const outerLeft = Math.max(r + 4, centerX - notchHalf - 14);
  const innerLeft = Math.max(r + 8, centerX - notchHalf);
  const outerRight = Math.min(safeW - r - 4, centerX + notchHalf + 14);
  const innerRight = Math.min(safeW - r - 8, centerX + notchHalf);

  return [
    `M0,${r}`,
    `Q0,0 ${r},0`,
    `L${outerLeft},0`,
    `C${innerLeft},0 ${innerLeft + 8},${notchDepth} ${centerX},${notchDepth}`,
    `C${innerRight - 8},${notchDepth} ${innerRight},0 ${outerRight},0`,
    `L${safeW - r},0`,
    `Q${safeW},0 ${safeW},${r}`,
    `L${safeW},${totalHeight}`,
    `L0,${totalHeight}`,
    'Z',
  ].join(' ');
}

export const CustomTabBar: React.FC<CustomTabBarProps> = React.memo(({
  activeTab,
  onTabPress,
}) => {
  const {
    colors,
    isDarkMode,
    isModern,
    modernAiButtonDesign,
    modernPalette,
    modernShadows,
    modernTheme,
    modernThemeExtras,
  } = useTheme();
  const themed = useThemedStyles(getTabThemedStyles);
  const insets = useSafeAreaInsets();
  const windowWidth = useWindowDimensions().width;
  const [barWidth, setBarWidth] = useState(() =>
    Math.round(windowWidth > 0 ? windowWidth : 360),
  );

  const handleModernLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    if (measured > 0 && measured !== barWidth) {
      setBarWidth(measured);
    }
  };

  const bottomInset = Math.max(insets.bottom, 8);
  const contentHeight = ModernLayout.navbarContentHeight;
  const totalHeight = contentHeight + bottomInset;
  const navPath = useMemo(
    () => buildCurvedTabBarPath(barWidth, totalHeight),
    [barWidth, totalHeight],
  );

  if (isModern) {

    return (
      <View
        testID="modern-custom-tab-bar"
        onLayout={handleModernLayout}
        pointerEvents="box-none"
        style={[
          styles.modernOuterContainer,
          {height: totalHeight + MODERN_FAB_OVERHANG},
        ]}
        accessible={false}
      >
        <View
          style={[
            styles.modernSvgBackdrop,
            {top: MODERN_FAB_OVERHANG, height: totalHeight},
          ]}
          pointerEvents="none"
        >
          <Svg width={barWidth} height={totalHeight}>
            <Path d={navPath} fill={modernPalette.card} />
          </Svg>
        </View>

        <View
          pointerEvents="box-none"
          style={[
            styles.modernTabRow,
            {
              height: contentHeight,
              bottom: bottomInset,
            },
          ]}
          accessibilityRole="tablist"
        >
          {TAB_ORDER.map(tab => {
            const label = TAB_LABELS[tab];
            const isActive = activeTab === tab;
            const anchor = TOUR_TABS[tab];
            const isCenter = tab === CENTER_TAB;

            if (isCenter) {
              return (
                <TouchableOpacity
                  key={tab}
                  testID={`modern-tab-${tab}`}
                  style={styles.modernCenterSlot}
                  onPress={() => onTabPress(tab)}
                  activeOpacity={0.85}
                  accessible={true}
                  accessibilityRole="tab"
                  accessibilityLabel={`${label} tab`}
                  accessibilityState={{selected: isActive}}
                >
                  <View
                    collapsable={false}
                    pointerEvents="none"
                    ref={tourTargetRef(anchor)}
                    style={styles.modernCenterTourTarget}
                  />
                  <View
                    testID="modern-tab-chat-fab"
                    style={[
                      styles.modernCenterFab,
                      styles.modernCenterFabShadow,
                      {
                        shadowColor: modernShadows.floating.shadowColor,
                        backgroundColor: isActive
                          ? modernPalette.accentDeep
                          : modernPalette.accent,
                      },
                    ]}
                  >
                    <LafinaSynthOrb
                      size={MODERN_FAB_SIZE}
                      design={modernAiButtonDesign}
                      isActive={isActive}
                      isDarkMode={isDarkMode}
                      modernTheme={modernTheme}
                      modernPalette={modernPalette}
                      modernThemeExtras={modernThemeExtras}
                    />
                  </View>
                  <Text
                    style={[
                      styles.modernCenterLabel,
                      {
                        color: isActive
                          ? modernPalette.accent
                          : modernPalette.text,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            }

            const IconComponent = TAB_ICONS[tab];

            return (
              <TouchableOpacity
                key={tab}
                ref={tourTargetRef(anchor)}
                testID={`modern-tab-${tab}`}
                style={styles.modernTab}
                onPress={() => onTabPress(tab)}
                activeOpacity={0.8}
                accessible={true}
                accessibilityRole="tab"
                accessibilityLabel={`${label} tab`}
                accessibilityState={{selected: isActive}}
              >
                <IconComponent
                  size={22}
                  color={isActive ? modernPalette.accent : modernPalette.muted}
                />
                <Text
                  style={[
                    styles.modernLabel,
                    {
                      color: isActive
                        ? modernPalette.accent
                        : modernPalette.muted,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  const bottomOffset = Math.max(insets.bottom, 12) + 14;

  const renderClassicTab = (
    tab: TabType,
    label: string,
    IconComponent: React.ComponentType<{size: number; color: string}>,
    isCenter = false,
  ) => {
    const isActive = activeTab === tab;
    const anchor = TOUR_TABS[tab];

    if (isCenter) {
      return (
        <TouchableOpacity
          key={tab}
          ref={tourTargetRef(anchor)}
          style={styles.tab}
          onPress={() => onTabPress(tab)}
          activeOpacity={0.8}
          accessible={true}
          accessibilityRole="tab"
          accessibilityLabel={`${label} tab`}
          accessibilityState={{selected: isActive}}
        >
          <View
            style={[
              styles.centerBadge,
              isActive ? themed.centerBadgeActive : themed.centerBadgeIdle,
            ]}
          >
            <IconComponent
              size={21}
              color={isActive ? colors.red : colors.textSecondary}
            />
          </View>
          {isActive && (
            <Text
              style={[
                styles.label,
                styles.centerActiveLabel,
                themed.activeLabel,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {label}
            </Text>
          )}
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={tab}
        ref={tourTargetRef(anchor)}
        style={styles.tab}
        onPress={() => onTabPress(tab)}
        activeOpacity={0.8}
        accessible={true}
        accessibilityRole="tab"
        accessibilityLabel={`${label} tab`}
        accessibilityState={{selected: isActive}}
      >
        <IconComponent
          size={21}
          color={isActive ? colors.red : colors.textMuted}
        />
        {isActive && (
          <Text
            style={[
              styles.label,
              themed.label,
              styles.activeLabel,
              themed.activeLabel,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      testID="classic-custom-tab-bar"
      style={[styles.outerContainer, {bottom: bottomOffset}]}
      accessible={false}
    >
      <View
        style={[styles.container, themed.container]}
        accessibilityRole="tablist"
      >
        {TAB_ORDER.map(tab =>
          renderClassicTab(
            tab,
            TAB_LABELS[tab],
            TAB_ICONS[tab],
            tab === CENTER_TAB,
          ),
        )}
      </View>
    </View>
  );
});

const getTabThemedStyles = (colors: ThemeColors) => ({
  container: {backgroundColor: colors.cardBg, borderColor: colors.border},
  label: {color: colors.textMuted},
  activeLabel: {color: colors.red},
  centerBadgeIdle: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  centerBadgeActive: {
    backgroundColor: colors.red + '1A',
    borderColor: colors.red + '45',
  },
});

const styles = StyleSheet.create({
  modernOuterContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    backgroundColor: 'transparent',
  },
  modernSvgBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  modernTabRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  modernTab: {
    flex: 1,
    height: ModernLayout.navbarContentHeight,
    minHeight: 48,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  modernLabel: {
    fontSize: 10.5,
    fontFamily: Fonts.body,
  },
  modernCenterSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 11,
    height: ModernLayout.navbarContentHeight,
  },
  modernCenterTourTarget: {
    position: 'absolute',
    top: -MODERN_FAB_OVERHANG,
    bottom: 4,
    left: 4,
    right: 4,
  },
  modernCenterFab: {
    position: 'absolute',
    top: -28,
    width: MODERN_FAB_SIZE,
    height: MODERN_FAB_SIZE,
    borderRadius: MODERN_FAB_SIZE / 2,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernCenterFabShadow: {
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  modernCenterLabel: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
  },
  outerContainer: {
    position: 'absolute',
    bottom: BAR_BOTTOM_OFFSET,
    left: 16,
    right: 16,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 36,
    height: Layout.navbarHeight,
    width: '100%',
    paddingHorizontal: 10,
    borderWidth: 1,
    ...Shadows.navbar,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 6,
  },
  centerBadge: {
    width: 40,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontFamily: Fonts.body,
    marginTop: 4,
  },
  centerActiveLabel: {
    marginTop: 2,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  activeLabel: {
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
});
