import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Calendar,
  FileText,
  LayoutDashboard,
  MessageSquare,
  User,
} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import type {ThemeColors} from '../contexts/ThemeContext';
import {Fonts, Layout, Shadows} from '../theme';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {TourAnchor} from '../tour/tourSteps';
import {tourTargetRef} from '../tour/tourTargets';

export type TabType = 'chat' | 'calendar' | 'dashboard' | 'notes' | 'profile';

const TOUR_TABS: Record<TabType, TourAnchor> = {
  chat: 'tab-chat',
  calendar: 'tab-calendar',
  dashboard: 'tab-dashboard',
  notes: 'tab-notes',
  profile: 'tab-profile',
};

const BAR_BOTTOM_OFFSET = 24;

interface CustomTabBarProps {
  activeTab: TabType;
  onTabPress: (tab: TabType) => void;
}

export const CustomTabBar: React.FC<CustomTabBarProps> = ({
  activeTab,
  onTabPress,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getTabThemedStyles);
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 12) + 14;

  const renderTab = (
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
      style={[styles.outerContainer, {bottom: bottomOffset}]}
      accessible={false}
    >
      <View
        style={[styles.container, themed.container]}
        accessibilityRole="tablist"
      >
        {renderTab('chat', 'Chat', MessageSquare)}
        {renderTab('calendar', 'Calendar', Calendar)}
        {renderTab('dashboard', 'Dashboard', LayoutDashboard, true)}
        {renderTab('notes', 'Notes', FileText)}
        {renderTab('profile', 'Profile', User)}
      </View>
    </View>
  );
};

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
