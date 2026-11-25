import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {SlidersHorizontal} from 'lucide-react-native';
import {useTheme} from '../../../../contexts/ThemeContext';
import {CharacterAvatar} from '../../../../components/profile/CharacterAvatar';
import {DefaultProfileAvatar} from '../../../../components/profile/DefaultProfileAvatar';
import {Fonts} from '../../../../theme';
import {mixColors} from '../../../../theme/colorMix';
import {tourTargetRef} from '../../../../tour/tourTargets';
import {getTimeOfDayGreeting} from '../../dashboardCalculations';

export interface HomeHeaderProps {
  now: Date;
  greetingName: string;
  academicBadge: string | null;
  photoSource: ImageSourcePropType | null;
  avatarSeed: string | null;
  showAvatar?: boolean;
  onOpenCustomize: () => void;
}

export const HomeHeader: React.FC<HomeHeaderProps> = React.memo(
  ({
    now,
    greetingName,
    academicBadge,
    photoSource,
    avatarSeed,
    showAvatar = true,
    onOpenCustomize,
  }) => {
    const {isDarkMode, modernPalette, modernShadows} = useTheme();

    const greeting = getTimeOfDayGreeting(now);
    const dateLabel = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const subtitle = academicBadge
      ? `${dateLabel} · ${academicBadge}`
      : dateLabel;
    const avatarBg = isDarkMode
      ? modernPalette.softViolet
      : mixColors(modernPalette.accent, modernPalette.softViolet, 0.14);
    const avatarBorder = isDarkMode
      ? modernPalette.border
      : mixColors(modernPalette.accent, modernPalette.border, 0.2);

    return (
      <View style={styles.headerRow} testID="home-header">
        <View style={styles.identity}>
          {showAvatar && (
            <View
              testID="home-header-avatar"
              style={[
                styles.avatarFrame,
                {
                  backgroundColor: avatarBg,
                  borderColor: avatarBorder,
                },
              ]}
            >
              {photoSource ? (
                <Image
                  source={photoSource}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  accessibilityLabel={`${greetingName} avatar`}
                />
              ) : avatarSeed ? (
                <CharacterAvatar
                  seed={avatarSeed}
                  size={40}
                  testID="home-character-avatar"
                />
              ) : (
                <DefaultProfileAvatar
                  size={40}
                  isDarkMode={isDarkMode}
                  testID="home-default-avatar"
                />
              )}
            </View>
          )}

          <View style={styles.greetingCol}>
            <Text
              style={[styles.greetingTitle, {color: modernPalette.text}]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              testID="home-greeting-title"
            >
              {greeting}, {greetingName}
            </Text>
            <Text
              style={[styles.dateSubtitle, {color: modernPalette.muted}]}
              numberOfLines={1}
              testID="home-date-subtitle"
            >
              {subtitle}
            </Text>
          </View>
        </View>

        <View collapsable={false} ref={tourTargetRef('home-actions')}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Customize dashboard"
            testID="dashboard-customize-btn"
            onPress={onOpenCustomize}
            activeOpacity={0.78}
            style={[
              styles.customizeBtn,
              modernShadows.subtle,
              {
                backgroundColor: modernPalette.card,
                borderColor: modernPalette.border,
              },
            ]}
          >
            <SlidersHorizontal color={modernPalette.text} size={18} />
          </TouchableOpacity>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarFrame: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
  },
  greetingCol: {
    flex: 1,
  },
  greetingTitle: {
    fontFamily: Fonts.heading,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  dateSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    marginTop: 1,
    lineHeight: 18,
  },
  customizeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
