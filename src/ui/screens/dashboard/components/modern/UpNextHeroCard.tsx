import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {Check} from 'lucide-react-native';
import {useTheme} from '../../../../contexts/ThemeContext';
import {Fonts} from '../../../../theme';
import type {HomeHeroModel} from './homeTimeline';

export interface UpNextHeroCardProps {
  hero: HomeHeroModel;
  onPress: () => void;
}

const RING_SIZE = 104;
const RING_STROKE = 7.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

export const UpNextHeroCard: React.FC<UpNextHeroCardProps> = React.memo(
  ({hero, onPress}) => {
    const {isDarkMode, modernPalette, modernThemeExtras} = useTheme();

    const clampedProgress = Math.max(0.04, Math.min(1, hero.ringProgress));
    const dashOffset = RING_CIRC * (1 - clampedProgress);
    const ctaBg = isDarkMode ? 'rgba(255,255,255,0.95)' : '#FFFFFF';
    const ctaTextColor = isDarkMode
      ? modernPalette.heroCardSecondary
      : modernPalette.accentDeep;
    const isLongValue = hero.ringValue.length > 3;

    return (
      <Pressable
        testID="dashboard-widget-up-next"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${hero.badge}: ${hero.title}. ${hero.subtitle}`}
        style={[
          styles.card,
          styles.elevation,
          {
            backgroundColor: modernThemeExtras.heroBgColor,
            shadowColor: modernThemeExtras.shadowColor,
          },
        ]}
      >
        {/* Subtle layered ambient shapes scaled to active theme */}
        <View
          pointerEvents="none"
          style={[
            styles.ambientBottomLeft,
            {backgroundColor: modernThemeExtras.heroHighlightColor},
          ]}
        />
        <View pointerEvents="none" style={styles.ambientTopRight} />

        <View style={styles.contentRow}>
          <View style={styles.leftCol}>
            <View
              testID="dashboard-hero-badge-pill"
              style={[
                styles.badgePill,
                {backgroundColor: modernPalette.heroPillBg},
              ]}
            >
              <Text style={styles.badgeText}>{hero.badge}</Text>
            </View>

            <Text
              style={styles.heroTitle}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.86}
            >
              {hero.title}
            </Text>

            <Text
              style={[styles.heroSub, {color: modernPalette.heroMutedText}]}
              numberOfLines={2}
            >
              {hero.subtitle}
            </Text>

            <View style={styles.ctaWrap}>
              <TouchableOpacity
                testID="dashboard-hero-cta"
                onPress={onPress}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={hero.ctaLabel}
                style={[styles.ctaBtn, {backgroundColor: ctaBg}]}
              >
                <Text
                  testID="dashboard-hero-cta-text"
                  style={[styles.ctaText, {color: ctaTextColor}]}
                >
                  {hero.ctaLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={styles.ringWrap}
            pointerEvents="none"
            testID="dashboard-hero-ring"
          >
            <Svg
              width={RING_SIZE}
              height={RING_SIZE}
              style={{transform: [{rotate: '-90deg'}]}}
            >
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(255,255,255,0.26)"
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="#FFFFFF"
                strokeWidth={RING_STROKE}
                strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>

            <View style={styles.ringCenter}>
              {hero.ringShowCheck ? (
                <Check color="#FFFFFF" size={26} strokeWidth={2.75} />
              ) : (
                <Text
                  style={[
                    styles.ringValue,
                    isLongValue && styles.ringValueCompact,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {hero.ringValue}
                </Text>
              )}
              <Text style={styles.ringCaption} numberOfLines={1}>
                {hero.ringCaption}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    overflow: 'hidden',
    padding: 20,
    minHeight: 184,
    justifyContent: 'center',
  },
  elevation: {
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 4,
  },
  ambientBottomLeft: {
    position: 'absolute',
    left: -42,
    bottom: -64,
    width: 196,
    height: 196,
    borderRadius: 98,
    opacity: 0.24,
  },
  ambientTopRight: {
    position: 'absolute',
    right: -34,
    top: -48,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  leftCol: {
    flex: 1,
    justifyContent: 'space-between',
  },
  badgePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  heroTitle: {
    fontFamily: Fonts.heading,
    fontSize: 23,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 28,
    letterSpacing: -0.45,
    marginTop: 12,
  },
  heroSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  ctaWrap: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  ctaText: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    width: RING_SIZE - 16,
  },
  ringValue: {
    fontFamily: Fonts.heading,
    fontSize: 27,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 30,
    letterSpacing: -0.6,
    includeFontPadding: false,
  },
  ringValueCompact: {
    fontSize: 19,
    lineHeight: 23,
  },
  ringCaption: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    textAlign: 'center',
  },
});
