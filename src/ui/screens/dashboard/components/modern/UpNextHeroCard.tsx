import React, {useMemo} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {Check, ChevronRight} from 'lucide-react-native';
import type {UpNextCardStyleId, UpNextCardToneId} from '../../../../../storage';
import {useTheme} from '../../../../contexts/ThemeContext';
import {LafinaSynthOrb} from '../../../../components/LafinaSynthOrb';
import {
  Fonts,
  type ModernPalette,
  type ModernThemeExtras,
} from '../../../../theme';
import {mixColors} from '../../../../theme/colorMix';
import type {HomeHeroModel} from './homeTimeline';

const LAFINA_MASCOT = require('../../../../../assets/new_lafina_app_logo/lafina_app_logo.png');

export interface UpNextHeroCardProps {
  hero: HomeHeroModel;
  styleVariant?: UpNextCardStyleId;
  tone?: UpNextCardToneId;
  compact?: boolean;
  isActive?: boolean;
  previewMode?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

export interface ResolvedHeroToneColors {
  cardBg: string;
  cardBorder: string;
  borderWidth: number;
  shadowColor: string;
  ambientPrimary: string;
  ambientPrimaryOpacity: number;
  ambientSecondary: string;
  titleColor: string;
  subtitleColor: string;
  pillBg: string;
  pillText: string;
  ctaBg: string;
  ctaText: string;
  ringTrack: string;
  ringActive: string;
  ringValueColor: string;
  ringCaptionColor: string;
  segmentFilled: string;
  segmentEmpty: string;
  progressLabelColor: string;
  progressCountColor: string;
  mascotRingBg: string;
  mascotRingBorder: string;
  footerSurfaceBg: string;
  footerTextColor: string;
  compactBadgeBg: string;
  compactBadgeText: string;
  compactBadgeSub: string;
}

/**
 * Derives 100% theme-scalable colors for any Up Next card finish (`vivid`,
 * `soft`, `minimal`) across every Modern palette in Light and Dark mode.
 */
export const resolveHeroToneColors = (
  tone: UpNextCardToneId,
  isDarkMode: boolean,
  modernPalette: ModernPalette,
  modernThemeExtras: ModernThemeExtras,
): ResolvedHeroToneColors => {
  if (tone === 'soft') {
    const softBg = isDarkMode
      ? mixColors(modernPalette.accent, modernPalette.card, 0.16)
      : modernPalette.softViolet;
    const softBorder = isDarkMode
      ? mixColors(modernPalette.accent, modernPalette.border, 0.36)
      : mixColors(modernPalette.accent, modernPalette.border, 0.24);
    const softTrack = isDarkMode
      ? 'rgba(255,255,255,0.14)'
      : mixColors(modernPalette.accent, '#FFFFFF', 0.2);

    return {
      cardBg: softBg,
      cardBorder: softBorder,
      borderWidth: 1,
      shadowColor: modernThemeExtras.shadowColor,
      ambientPrimary: modernPalette.accent,
      ambientPrimaryOpacity: isDarkMode ? 0.14 : 0.08,
      ambientSecondary: isDarkMode
        ? 'rgba(255,255,255,0.04)'
        : 'rgba(255,255,255,0.52)',
      titleColor: modernPalette.text,
      subtitleColor: modernPalette.muted,
      pillBg: isDarkMode
        ? mixColors(modernPalette.accent, modernPalette.surface, 0.18)
        : mixColors(modernPalette.accent, '#FFFFFF', 0.14),
      pillText: isDarkMode
        ? mixColors('#FFFFFF', modernPalette.periwinkle, 0.3)
        : modernPalette.accentDeep,
      ctaBg: isDarkMode ? modernPalette.accentDeep : modernPalette.accent,
      ctaText: '#FFFFFF',
      ringTrack: softTrack,
      ringActive: modernPalette.accent,
      ringValueColor: modernPalette.text,
      ringCaptionColor: modernPalette.muted,
      segmentFilled: modernPalette.accent,
      segmentEmpty: softTrack,
      progressLabelColor: modernPalette.text,
      progressCountColor: modernPalette.muted,
      mascotRingBg: isDarkMode
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(255,255,255,0.78)',
      mascotRingBorder: softBorder,
      footerSurfaceBg: isDarkMode
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(255,255,255,0.72)',
      footerTextColor: modernPalette.text,
      compactBadgeBg: isDarkMode
        ? mixColors(modernPalette.accent, modernPalette.surface, 0.18)
        : '#FFFFFF',
      compactBadgeText: isDarkMode
        ? mixColors('#FFFFFF', modernPalette.periwinkle, 0.3)
        : modernPalette.accentDeep,
      compactBadgeSub: modernPalette.muted,
    };
  }

  if (tone === 'minimal') {
    const minimalInk = isDarkMode
      ? mixColors('#FFFFFF', modernPalette.periwinkle, 0.3)
      : modernPalette.accentDeep;
    return {
      cardBg: modernPalette.card,
      cardBorder: modernPalette.border,
      borderWidth: 1,
      shadowColor: modernThemeExtras.shadowColor,
      ambientPrimary: modernPalette.softViolet,
      ambientPrimaryOpacity: isDarkMode ? 0.45 : 0.72,
      ambientSecondary: 'transparent',
      titleColor: modernPalette.text,
      subtitleColor: modernPalette.muted,
      pillBg: modernPalette.softViolet,
      pillText: minimalInk,
      ctaBg: isDarkMode ? modernPalette.accentDeep : modernPalette.accent,
      ctaText: '#FFFFFF',
      ringTrack: modernPalette.surface,
      ringActive: modernPalette.accent,
      ringValueColor: modernPalette.text,
      ringCaptionColor: modernPalette.muted,
      segmentFilled: modernPalette.accent,
      segmentEmpty: modernPalette.surface,
      progressLabelColor: modernPalette.text,
      progressCountColor: modernPalette.muted,
      mascotRingBg: modernPalette.softViolet,
      mascotRingBorder: modernPalette.border,
      footerSurfaceBg: modernPalette.surface,
      footerTextColor: modernPalette.text,
      compactBadgeBg: modernPalette.softViolet,
      compactBadgeText: minimalInk,
      compactBadgeSub: modernPalette.muted,
    };
  }

  // Default: 'vivid'
  return {
    cardBg: modernThemeExtras.heroBgColor,
    cardBorder: 'transparent',
    borderWidth: 0,
    shadowColor: modernThemeExtras.shadowColor,
    ambientPrimary: modernThemeExtras.heroHighlightColor,
    ambientPrimaryOpacity: 0.24,
    ambientSecondary: 'rgba(255,255,255,0.08)',
    titleColor: '#FFFFFF',
    subtitleColor: '#FFFFFF',
    pillBg: 'rgba(0,0,0,0.2)',
    pillText: '#FFFFFF',
    ctaBg: isDarkMode ? 'rgba(255,255,255,0.95)' : '#FFFFFF',
    ctaText: isDarkMode
      ? modernPalette.heroCardSecondary
      : modernPalette.accentDeep,
    ringTrack: 'rgba(255,255,255,0.26)',
    ringActive: '#FFFFFF',
    ringValueColor: '#FFFFFF',
    ringCaptionColor: '#FFFFFF',
    segmentFilled: '#FFFFFF',
    segmentEmpty: 'rgba(255,255,255,0.28)',
    progressLabelColor: '#FFFFFF',
    progressCountColor: '#FFFFFF',
    mascotRingBg: 'rgba(255,255,255,0.14)',
    mascotRingBorder: 'rgba(255,255,255,0.44)',
    footerSurfaceBg: 'rgba(0,0,0,0.18)',
    footerTextColor: '#FFFFFF',
    compactBadgeBg: 'rgba(0,0,0,0.2)',
    compactBadgeText: '#FFFFFF',
    compactBadgeSub: 'rgba(255,255,255,0.94)',
  };
};

const RING_SIZE = 104;
const RING_STROKE = 7.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
const MAX_PROGRESS_SEGMENTS = 8;

const computeSegments = (
  completed: number,
  total: number,
): {count: number; filled: number} => {
  if (total <= 0) {
    return {count: 4, filled: 0};
  }
  if (total <= MAX_PROGRESS_SEGMENTS) {
    return {
      count: total,
      filled: Math.max(0, Math.min(total, completed)),
    };
  }
  const ratio = Math.max(0, Math.min(1, completed / total));
  return {
    count: MAX_PROGRESS_SEGMENTS,
    filled: Math.round(ratio * MAX_PROGRESS_SEGMENTS),
  };
};

export const UpNextHeroCard: React.FC<UpNextHeroCardProps> = React.memo(
  ({
    hero,
    styleVariant = 'countdown_ring',
    tone = 'vivid',
    compact = false,
    isActive = true,
    previewMode = false,
    onPress,
    onLongPress,
  }) => {
    const {
      isDarkMode,
      modernPalette,
      modernTheme,
      modernThemeExtras,
      modernAiButtonDesign,
    } = useTheme();

    const toneColors = useMemo(
      () =>
        resolveHeroToneColors(
          tone,
          isDarkMode,
          modernPalette,
          modernThemeExtras,
        ),
      [tone, isDarkMode, modernPalette, modernThemeExtras],
    );

    const safeProgress = Number.isFinite(hero.ringProgress)
      ? hero.ringProgress
      : 0;
    const clampedProgress = Math.max(0.04, Math.min(1, safeProgress));
    const dashOffset = RING_CIRC * (1 - clampedProgress);
    const isLongValue = hero.ringValue.length > 3;

    const rootTestID = previewMode
      ? 'customize-upnext-preview'
      : 'dashboard-widget-up-next';
    const tid = (name: string) =>
      previewMode ? `customize-preview-${name}` : name;

    const previewA11yProps = previewMode
      ? {accessible: false}
      : {accessibilityRole: 'button' as const};

    const cardSurfaceStyle = [
      styles.card,
      tone === 'vivid' ? styles.elevationVivid : styles.elevationSoft,
      {
        backgroundColor: toneColors.cardBg,
        borderColor: toneColors.cardBorder,
        borderWidth: toneColors.borderWidth,
        shadowColor: toneColors.shadowColor,
      },
    ];

    /* ------------------------------------------------------------------ */
    /* Variant 2: Mascot & Segmented Day Progress (Sample 1)              */
    /* ------------------------------------------------------------------ */
    if (styleVariant === 'mascot_progress') {
      const segments = computeSegments(
        hero.dayProgressCompleted,
        hero.dayProgressTotal,
      );

      return (
        <Pressable
          testID={rootTestID}
          onPress={previewMode ? undefined : onPress}
          onLongPress={previewMode ? undefined : onLongPress}
          disabled={previewMode}
          {...previewA11yProps}
          accessibilityLabel={
            previewMode
              ? undefined
              : `${hero.pillMeta}: ${hero.title}. ${hero.subtitle}. ${hero.dayProgressLabel}: ${hero.dayProgressText}`
          }
          style={[
            cardSurfaceStyle,
            styles.mascotCard,
            compact && styles.cardCompactPadding,
          ]}
        >
          {/* Large right-side circular ambient shape scaled to active theme */}
          <View
            pointerEvents="none"
            style={[
              styles.ambientRightLarge,
              {
                backgroundColor: toneColors.ambientPrimary,
                opacity: toneColors.ambientPrimaryOpacity,
              },
            ]}
          />

          <View style={styles.mascotTopRow}>
            <View style={styles.mascotLeftCol}>
              <View
                testID={tid('dashboard-hero-badge-pill')}
                style={[styles.badgePill, {backgroundColor: toneColors.pillBg}]}
              >
                <Text
                  style={[styles.badgeText, {color: toneColors.pillText}]}
                  numberOfLines={1}
                >
                  {hero.pillMeta}
                </Text>
              </View>

              <Text
                style={[styles.mascotTitle, {color: toneColors.titleColor}]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {hero.title}
              </Text>

              <Text
                style={[styles.heroSub, {color: toneColors.subtitleColor}]}
                numberOfLines={2}
              >
                {hero.subtitle}
              </Text>
            </View>

            <View
              testID={tid('dashboard-hero-mascot')}
              pointerEvents="none"
              style={[
                styles.mascotCircle,
                {
                  backgroundColor: toneColors.mascotRingBg,
                  borderColor: toneColors.mascotRingBorder,
                },
              ]}
            >
              <Image
                source={LAFINA_MASCOT}
                style={styles.mascotImage}
                resizeMode="contain"
                accessibilityLabel="LAFINA mascot"
              />
            </View>
          </View>

          <View
            style={styles.dayProgressWrap}
            testID={tid('dashboard-hero-day-progress')}
          >
            <View style={styles.dayProgressHeader}>
              <Text
                style={[
                  styles.dayProgressLabel,
                  {color: toneColors.progressLabelColor},
                ]}
              >
                {hero.dayProgressLabel}
              </Text>
              <Text
                style={[
                  styles.dayProgressCount,
                  {color: toneColors.progressCountColor},
                ]}
              >
                {hero.dayProgressText}
              </Text>
            </View>

            <View style={styles.segmentsRow}>
              {Array.from({length: segments.count}, (_, idx) => {
                const filled = idx < segments.filled;
                return (
                  <View
                    key={idx}
                    testID={tid(`dashboard-hero-segment-${idx}`)}
                    style={[
                      styles.segmentBar,
                      {
                        backgroundColor: filled
                          ? toneColors.segmentFilled
                          : toneColors.segmentEmpty,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        </Pressable>
      );
    }

    /* ------------------------------------------------------------------ */
    /* Variant 3: Orb & Brief                                             */
    /* ------------------------------------------------------------------ */
    if (styleVariant === 'orb_brief') {
      const footerCopy =
        hero.followingLabel ||
        `${hero.dayProgressLabel} · ${hero.dayProgressText}`;

      return (
        <Pressable
          testID={rootTestID}
          onPress={previewMode ? undefined : onPress}
          onLongPress={previewMode ? undefined : onLongPress}
          disabled={previewMode}
          {...previewA11yProps}
          accessibilityLabel={
            previewMode
              ? undefined
              : `${hero.pillMeta}: ${hero.title}. ${hero.subtitle}`
          }
          style={[
            cardSurfaceStyle,
            styles.orbBriefCard,
            compact && styles.cardCompactPadding,
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              styles.ambientBottomLeft,
              {
                backgroundColor: toneColors.ambientPrimary,
                opacity: toneColors.ambientPrimaryOpacity,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.ambientTopRight,
              {backgroundColor: toneColors.ambientSecondary},
            ]}
          />

          <View style={styles.orbBriefTopRow}>
            <View style={styles.orbBriefLeftCol}>
              <View
                testID={tid('dashboard-hero-badge-pill')}
                style={[styles.badgePill, {backgroundColor: toneColors.pillBg}]}
              >
                <Text
                  style={[styles.badgeText, {color: toneColors.pillText}]}
                  numberOfLines={1}
                >
                  {hero.pillMeta}
                </Text>
              </View>

              <Text
                style={[styles.heroTitle, {color: toneColors.titleColor}]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {hero.title}
              </Text>

              <Text
                style={[styles.heroSub, {color: toneColors.subtitleColor}]}
                numberOfLines={2}
              >
                {hero.subtitle}
              </Text>
            </View>

            <View
              style={[
                styles.orbHalo,
                {
                  backgroundColor: toneColors.mascotRingBg,
                  borderColor: toneColors.mascotRingBorder,
                },
              ]}
              pointerEvents="none"
              testID={tid('dashboard-hero-orb')}
            >
              <LafinaSynthOrb
                design={modernAiButtonDesign}
                size={58}
                isActive={true}
                isDarkMode={isDarkMode}
                modernTheme={modernTheme}
                modernPalette={modernPalette}
                modernThemeExtras={modernThemeExtras}
                animate={isActive && !previewMode}
                testID={tid('dashboard-hero-orb-graphic')}
              />
            </View>
          </View>

          <View
            style={[
              styles.orbFooterBar,
              {backgroundColor: toneColors.footerSurfaceBg},
            ]}
          >
            <Text
              style={[
                styles.orbFooterText,
                {color: toneColors.footerTextColor},
              ]}
              numberOfLines={1}
            >
              {footerCopy}
            </Text>

            <TouchableOpacity
              testID={tid('dashboard-hero-cta')}
              onPress={previewMode ? undefined : onPress}
              disabled={previewMode}
              activeOpacity={0.85}
              accessibilityRole={previewMode ? undefined : 'button'}
              accessibilityLabel={previewMode ? undefined : hero.ctaLabel}
              style={[styles.orbFooterCta, {backgroundColor: toneColors.ctaBg}]}
            >
              <Text
                testID={tid('dashboard-hero-cta-text')}
                style={[styles.orbFooterCtaText, {color: toneColors.ctaText}]}
                numberOfLines={1}
              >
                {hero.ctaLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      );
    }

    /* ------------------------------------------------------------------ */
    /* Variant 4: Compact Glance                                          */
    /* ------------------------------------------------------------------ */
    if (styleVariant === 'compact_glance') {
      return (
        <Pressable
          testID={rootTestID}
          onPress={previewMode ? undefined : onPress}
          onLongPress={previewMode ? undefined : onLongPress}
          disabled={previewMode}
          {...previewA11yProps}
          accessibilityLabel={
            previewMode
              ? undefined
              : `${hero.badge}: ${hero.title}. ${hero.subtitle}`
          }
          style={[cardSurfaceStyle, styles.compactCard]}
        >
          <View
            style={styles.compactRow}
            testID={tid('dashboard-hero-compact')}
          >
            <View style={styles.compactLeftCol}>
              <View style={styles.compactBadgeRow}>
                <View
                  testID={tid('dashboard-hero-badge-pill')}
                  style={[
                    styles.compactPill,
                    {backgroundColor: toneColors.pillBg},
                  ]}
                >
                  <Text
                    style={[
                      styles.compactPillText,
                      {color: toneColors.pillText},
                    ]}
                    numberOfLines={1}
                  >
                    {hero.badge}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.compactProgressMeta,
                    {color: toneColors.subtitleColor},
                  ]}
                  numberOfLines={1}
                >
                  {hero.dayProgressText}
                </Text>
              </View>

              <Text
                style={[styles.compactTitle, {color: toneColors.titleColor}]}
                numberOfLines={1}
              >
                {hero.title}
              </Text>

              <Text
                style={[styles.compactSub, {color: toneColors.subtitleColor}]}
                numberOfLines={1}
              >
                {hero.subtitle}
              </Text>
            </View>

            <View style={styles.compactRightGroup}>
              <View
                style={[
                  styles.compactTimeChip,
                  {backgroundColor: toneColors.compactBadgeBg},
                ]}
              >
                {hero.ringShowCheck ? (
                  <Check
                    color={toneColors.compactBadgeText}
                    size={16}
                    strokeWidth={2.6}
                  />
                ) : (
                  <Text
                    style={[
                      styles.compactTimeVal,
                      {color: toneColors.compactBadgeText},
                    ]}
                    numberOfLines={1}
                  >
                    {hero.ringValue}
                  </Text>
                )}
                <Text
                  style={[
                    styles.compactTimeCap,
                    {color: toneColors.compactBadgeSub},
                  ]}
                  numberOfLines={1}
                >
                  {hero.ringCaption}
                </Text>
              </View>
              <ChevronRight
                size={16}
                color={toneColors.subtitleColor}
                strokeWidth={2.2}
              />
            </View>
          </View>

          <View
            style={[
              styles.compactBarTrack,
              {backgroundColor: toneColors.segmentEmpty},
            ]}
          >
            <View
              style={[
                styles.compactBarFill,
                {
                  backgroundColor: toneColors.segmentFilled,
                  width: `${Math.round(clampedProgress * 100)}%`,
                },
              ]}
            />
          </View>
        </Pressable>
      );
    }

    /* ------------------------------------------------------------------ */
    /* Variant 1 (Default): Countdown Ring (Sample 2)                     */
    /* ------------------------------------------------------------------ */
    return (
      <Pressable
        testID={rootTestID}
        onPress={previewMode ? undefined : onPress}
        onLongPress={previewMode ? undefined : onLongPress}
        disabled={previewMode}
        {...previewA11yProps}
        accessibilityLabel={
          previewMode
            ? undefined
            : `${hero.badge}: ${hero.title}. ${hero.subtitle}`
        }
        style={[cardSurfaceStyle, compact && styles.cardCompactPadding]}
      >
        {/* Subtle layered ambient shapes scaled to active theme */}
        <View
          pointerEvents="none"
          style={[
            styles.ambientBottomLeft,
            {
              backgroundColor: toneColors.ambientPrimary,
              opacity: toneColors.ambientPrimaryOpacity,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.ambientTopRight,
            {backgroundColor: toneColors.ambientSecondary},
          ]}
        />

        <View style={styles.contentRow}>
          <View style={styles.leftCol}>
            <View
              testID={tid('dashboard-hero-badge-pill')}
              style={[styles.badgePill, {backgroundColor: toneColors.pillBg}]}
            >
              <Text style={[styles.badgeText, {color: toneColors.pillText}]}>
                {hero.badge}
              </Text>
            </View>

            <Text
              style={[styles.heroTitle, {color: toneColors.titleColor}]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.86}
            >
              {hero.title}
            </Text>

            <Text
              style={[styles.heroSub, {color: toneColors.subtitleColor}]}
              numberOfLines={2}
            >
              {hero.subtitle}
            </Text>

            <View style={styles.ctaWrap}>
              <TouchableOpacity
                testID={tid('dashboard-hero-cta')}
                onPress={previewMode ? undefined : onPress}
                disabled={previewMode}
                activeOpacity={0.85}
                accessibilityRole={previewMode ? undefined : 'button'}
                accessibilityLabel={previewMode ? undefined : hero.ctaLabel}
                style={[styles.ctaBtn, {backgroundColor: toneColors.ctaBg}]}
              >
                <Text
                  testID={tid('dashboard-hero-cta-text')}
                  style={[styles.ctaText, {color: toneColors.ctaText}]}
                >
                  {hero.ctaLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={styles.ringWrap}
            pointerEvents="none"
            testID={tid('dashboard-hero-ring')}
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
                stroke={toneColors.ringTrack}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={toneColors.ringActive}
                strokeWidth={RING_STROKE}
                strokeDasharray={`${RING_CIRC} ${RING_CIRC}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>

            <View style={styles.ringCenter}>
              {hero.ringShowCheck ? (
                <Check
                  color={toneColors.ringActive}
                  size={26}
                  strokeWidth={2.75}
                />
              ) : (
                <Text
                  style={[
                    styles.ringValue,
                    isLongValue && styles.ringValueCompact,
                    {color: toneColors.ringValueColor},
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {hero.ringValue}
                </Text>
              )}
              <Text
                style={[
                  styles.ringCaption,
                  {color: toneColors.ringCaptionColor},
                ]}
                numberOfLines={1}
              >
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
  cardCompactPadding: {
    padding: 16,
    minHeight: 164,
  },
  elevationVivid: {
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 4,
  },
  elevationSoft: {
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  ambientBottomLeft: {
    position: 'absolute',
    left: -42,
    bottom: -64,
    width: 196,
    height: 196,
    borderRadius: 98,
  },
  ambientTopRight: {
    position: 'absolute',
    right: -34,
    top: -48,
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  ambientRightLarge: {
    position: 'absolute',
    right: -48,
    top: -36,
    width: 224,
    height: 224,
    borderRadius: 112,
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
  },
  heroTitle: {
    fontFamily: Fonts.heading,
    fontSize: 23,
    fontWeight: '700',
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
    marginTop: 2,
    textAlign: 'center',
  },

  /* Mascot & Progress variant (Sample 1) */
  mascotCard: {
    justifyContent: 'space-between',
    minHeight: 182,
  },
  mascotTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mascotLeftCol: {
    flex: 1,
    minWidth: 0,
  },
  mascotTitle: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 27,
    letterSpacing: -0.45,
    marginTop: 11,
  },
  mascotCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mascotImage: {
    width: 72,
    height: 72,
  },
  dayProgressWrap: {
    marginTop: 18,
  },
  dayProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayProgressLabel: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    fontWeight: '600',
  },
  dayProgressCount: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
  },
  segmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentBar: {
    flex: 1,
    height: 6,
    borderRadius: 999,
  },

  /* Orb & Brief variant */
  orbBriefCard: {
    justifyContent: 'space-between',
    minHeight: 184,
  },
  orbBriefTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  orbBriefLeftCol: {
    flex: 1,
    minWidth: 0,
  },
  orbHalo: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbFooterBar: {
    marginTop: 15,
    borderRadius: 16,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  orbFooterText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  orbFooterCta: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
  },
  orbFooterCtaText: {
    fontFamily: Fonts.heading,
    fontSize: 11.5,
    fontWeight: '700',
  },

  /* Compact Glance variant */
  compactCard: {
    minHeight: 96,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'space-between',
    gap: 11,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  compactLeftCol: {
    flex: 1,
    minWidth: 0,
  },
  compactBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  compactPillText: {
    fontFamily: Fonts.heading,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  compactProgressMeta: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    fontWeight: '600',
  },
  compactTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 5,
  },
  compactSub: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    marginTop: 2,
  },
  compactRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactTimeChip: {
    minWidth: 66,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactTimeVal: {
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  compactTimeCap: {
    fontFamily: Fonts.body,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  compactBarTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  compactBarFill: {
    height: '100%',
    borderRadius: 999,
  },
});
