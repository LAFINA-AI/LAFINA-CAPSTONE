import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';
import { tourTargetRef } from '../tour/tourTargets';
import type { TourAnchor } from '../tour/tourSteps';
import {
  Calendar,
  MessageSquare,
  FileText,
  User,
  Mic,
} from 'lucide-react-native';

export type TabType = 'chat' | 'calendar' | 'notes' | 'profile';

const TOUR_TABS: Record<TabType, TourAnchor> = {
  chat: 'tab-chat',
  calendar: 'tab-calendar',
  notes: 'tab-notes',
  profile: 'tab-profile',
};

const BAR_BOTTOM_OFFSET = 24;
const MIC_BOTTOM_INSET = 12;

export const MIC_CENTER_FROM_BOTTOM =
  BAR_BOTTOM_OFFSET + MIC_BOTTOM_INSET + Layout.micButtonSize / 2;

interface CustomTabBarProps {
  activeTab: TabType;
  onTabPress: (tab: TabType) => void;
  onMicPress: () => void;
}

export const CustomTabBar: React.FC<CustomTabBarProps> = ({
  activeTab,
  onTabPress,
  onMicPress,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getTabThemedStyles);

  const renderTab = (
    tab: TabType,
    label: string,
    IconComponent: React.ComponentType<{ size: number; color: string }>,
  ) => {
    const isActive = activeTab === tab;
    const anchor = TOUR_TABS[tab];
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
        accessibilityState={{ selected: isActive }}
      >
        <IconComponent
          size={22}
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
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.outerContainer} accessible={false}>
      <View
        style={[styles.container, themed.container]}
        accessibilityRole="tablist"
      >
        {renderTab('chat', 'Chat', MessageSquare)}
        {renderTab('calendar', 'Calendar', Calendar)}

        <View style={styles.micContainer}>
          <Pressable
            ref={tourTargetRef('mic')}
            style={({ pressed }) => [
              styles.micButton,
              Shadows.micButton,
              pressed && styles.micPressed,
            ]}
            onPress={onMicPress}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Voice Action button"
            accessibilityHint="Double tap to open speech and reminder assistant"
          >
            <Mic size={28} color={colors.white} />
          </Pressable>
        </View>

        {renderTab('notes', 'Notes', FileText)}
        {renderTab('profile', 'Profile', User)}
      </View>
    </View>
  );
};

const getTabThemedStyles = (colors: ThemeColors) => ({
  container: { backgroundColor: colors.cardBg, borderColor: colors.border },
  label: { color: colors.textMuted },
  activeLabel: { color: colors.red },
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
    paddingHorizontal: 12,
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
    paddingVertical: 8,
  },
  label: {
    fontSize: 10,
    fontFamily: Fonts.body,
    marginTop: 4,
  },
  activeLabel: {
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  micContainer: {
    width: Layout.micButtonSize + 8,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    position: 'absolute',
    bottom: MIC_BOTTOM_INSET,
    width: Layout.micButtonSize,
    height: Layout.micButtonSize,
    borderRadius: Layout.micButtonSize / 2,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPressed: {
    opacity: 0.9,
  },
});
