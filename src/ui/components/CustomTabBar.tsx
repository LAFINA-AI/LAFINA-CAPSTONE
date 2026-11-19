import React, {useMemo, useState} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import {CalendarDays, House, Sparkles, User, Wrench} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import type {ThemeColors} from '../contexts/ThemeContext';
import {strandHeightAt} from '../splash/synthWave';
import {
  Fonts,
  Layout,
  ModernLayout,
  Shadows,
  type ModernAiButtonDesignId,
  type ModernPalette,
  type ModernThemeExtras,
  type ModernThemeId,
} from '../theme';
import {mixColors} from '../theme/colorMix';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {TourAnchor} from '../tour/tourSteps';
import {tourTargetRef} from '../tour/tourTargets';

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
  notes: 'Tools',
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
const MODERN_FAB_SIZE = 54;
const ORB_STRAND_COUNT = 7;
const ORB_POINT_COUNT = 24;
const ORB_STRAND_OPACITIES = [
  0.58, 0.71, 0.84, 0.96, 0.84, 0.71, 0.58,
] as const;
const ACOUSTIC_BAR_RATIOS = [0.18, 0.32, 0.48, 0.32, 0.18] as const;
const ACOUSTIC_BAR_OPACITIES = [0.64, 0.84, 0.98, 0.84, 0.64] as const;

export interface LafinaSynthOrbProps {
  size?: number;
  design?: ModernAiButtonDesignId;
  isActive: boolean;
  isDarkMode: boolean;
  modernTheme: ModernThemeId;
  modernPalette: ModernPalette;
  modernThemeExtras: ModernThemeExtras;
  testID?: string;
}

/**
 * Multi-layered LAFINA AI orb: a theme-adaptive 3D luminous glass lens
 * supporting 5 selectable interior designs across light and dark modes.
 */
export const LafinaSynthOrb: React.FC<LafinaSynthOrbProps> = React.memo(
  ({
    size = MODERN_FAB_SIZE,
    design = 'synth_orb',
    isActive,
    isDarkMode,
    modernTheme,
    modernPalette,
    modernThemeExtras,
    testID = 'modern-tab-synth-orb',
  }) => {
    const center = size / 2;
    const coreRadius = center - 2.25;

    const strands = useMemo(() => {
      if (design !== 'synth_orb') return [];
      const pad = 4.5;
      const span = size - pad * 2;
      const halfHeight = size * 0.34;
      const middle = size / 2;
      const seconds = isActive ? 1.42 : 0.85;
      const amplitude = isActive ? 0.78 : 0.58;
      const paths: string[] = [];

      for (let sIdx = 0; sIdx < ORB_STRAND_COUNT; sIdx += 1) {
        const strand = -1 + (2 * sIdx) / (ORB_STRAND_COUNT - 1);
        let path = '';
        for (let pIdx = 0; pIdx <= ORB_POINT_COUNT; pIdx += 1) {
          const xNorm = pIdx / ORB_POINT_COUNT;
          const yNorm = strandHeightAt(xNorm, strand, seconds, amplitude);
          const px = pad + xNorm * span;
          const py = middle - yNorm * halfHeight;
          path += `${pIdx === 0 ? 'M' : ' L'}${px.toFixed(2)} ${py.toFixed(2)}`;
        }
        paths.push(path);
      }
      return paths;
    }, [design, isActive, size]);

    const idSuffix = `${design}_${Math.round(size)}_${modernTheme}_${
      isDarkMode ? 'dark' : 'light'
    }_${isActive ? 'active' : 'idle'}`;
    const bezelGradId = `orbBezelGrad_${idSuffix}`;
    const coreGradId = `orbCoreGrad_${idSuffix}`;
    const bloomGradId = `orbBloomGrad_${idSuffix}`;
    const sheenGradId = `orbSheenGrad_${idSuffix}`;
    const waveGradId = `orbWaveGrad_${idSuffix}`;
    const rimGradId = `orbRimGrad_${idSuffix}`;
    const pearlHotGradId = `orbPearlHot_${idSuffix}`;
    const pearlCoolGradId = `orbPearlCool_${idSuffix}`;
    const coreClipId = `orbCoreClip_${idSuffix}`;

    const waveStops = modernThemeExtras.synthWaveStops;
    const bezelWarm = waveStops[0]?.[1] ?? modernPalette.periwinkle;

    const coreTop = isDarkMode
      ? mixColors(
          modernThemeExtras.heroHighlightColor,
          modernPalette.accent,
          isActive ? 0.45 : 0.32,
        )
      : mixColors(
          '#FFFFFF',
          modernThemeExtras.heroHighlightColor,
          isActive ? 0.14 : 0.24,
        );
    const coreMid = isDarkMode
      ? isActive
        ? modernPalette.accent
        : modernThemeExtras.heroBgColor
      : isActive
      ? modernPalette.accentDeep
      : modernPalette.accent;
    const coreBottom = isDarkMode
      ? mixColors(modernThemeExtras.shadowColor, modernPalette.accentDeep, 0.55)
      : mixColors(
          modernThemeExtras.shadowColor,
          modernPalette.accentDeep,
          isActive ? 0.42 : 0.28,
        );

    const bezelStop0 = isDarkMode
      ? mixColors('#FFFFFF', bezelWarm, 0.35)
      : mixColors('#FFFFFF', modernThemeExtras.heroHighlightColor, 0.72);
    const bezelStop1 = isDarkMode
      ? modernThemeExtras.heroHighlightColor
      : mixColors('#FFFFFF', bezelWarm, 0.42);
    const bezelStop2 = isDarkMode
      ? modernPalette.accent
      : modernPalette.periwinkle;
    const bezelStop3 = modernPalette.accentDeep;

    const bloomCenterColor = isDarkMode
      ? modernThemeExtras.heroHighlightColor
      : mixColors('#FFFFFF', modernPalette.softViolet, 0.6);

    const luminousWaveStops = useMemo(
      () =>
        waveStops.map(
          ([offset, colour]) =>
            [
              offset,
              mixColors(
                '#FFFFFF',
                colour,
                offset <= 0.5
                  ? isDarkMode
                    ? 0.26
                    : 0.46
                  : isDarkMode
                  ? 0.62
                  : 0.78,
              ),
            ] as const,
        ),
      [waveStops, isDarkMode],
    );

    const centerIndex = Math.floor(ORB_STRAND_COUNT / 2);
    const centerStrand = strands[centerIndex] ?? '';

    const renderCenterpiece = () => {
      switch (design) {
        case 'liquid_pearl': {
          const arcD = `M${(center - coreRadius * 0.56).toFixed(2)} ${(
            center -
            coreRadius * 0.16
          ).toFixed(2)} Q${(center - coreRadius * 0.18).toFixed(2)} ${(
            center -
            coreRadius * 0.68
          ).toFixed(2)} ${(center + coreRadius * 0.46).toFixed(2)} ${(
            center -
            coreRadius * 0.52
          ).toFixed(2)}`;
          return (
            <>
              <Circle
                cx={center * 0.82}
                cy={center * 0.86}
                r={coreRadius * 0.78}
                fill={`url(#${pearlHotGradId})`}
              />
              <Circle
                cx={center * 1.24}
                cy={center * 1.22}
                r={coreRadius * 0.72}
                fill={`url(#${pearlCoolGradId})`}
              />
              <Circle
                cx={center * 0.92}
                cy={center * 0.92}
                r={coreRadius * 0.42}
                fill="#FFFFFF"
                fillOpacity={isActive ? 0.28 : 0.2}
              />
              <Path
                d={arcD}
                stroke="#FFFFFF"
                strokeOpacity={isActive ? 0.8 : 0.62}
                strokeWidth={Math.max(1.2, size * 0.036)}
                strokeLinecap="round"
                fill="none"
              />
            </>
          );
        }

        case 'eclipse_dial': {
          const ringR = coreRadius * 0.66;
          const tickHalf = Math.max(1.2, size * 0.034);
          const startRad = (-195 * Math.PI) / 180;
          const endRad = (15 * Math.PI) / 180;
          const startX = center + ringR * Math.cos(startRad);
          const startY = center + ringR * Math.sin(startRad);
          const endX = center + ringR * Math.cos(endRad);
          const endY = center + ringR * Math.sin(endRad);
          const arcD = `M${startX.toFixed(2)} ${startY.toFixed(
            2,
          )} A${ringR.toFixed(2)} ${ringR.toFixed(2)} 0 1 1 ${endX.toFixed(
            2,
          )} ${endY.toFixed(2)}`;
          const ticksD = [
            `M${center.toFixed(2)} ${(center - ringR - tickHalf).toFixed(
              2,
            )} L${center.toFixed(2)} ${(center - ringR + tickHalf).toFixed(2)}`,
            `M${(center + ringR - tickHalf).toFixed(2)} ${center.toFixed(
              2,
            )} L${(center + ringR + tickHalf).toFixed(2)} ${center.toFixed(2)}`,
            `M${center.toFixed(2)} ${(center + ringR - tickHalf).toFixed(
              2,
            )} L${center.toFixed(2)} ${(center + ringR + tickHalf).toFixed(2)}`,
            `M${(center - ringR - tickHalf).toFixed(2)} ${center.toFixed(
              2,
            )} L${(center - ringR + tickHalf).toFixed(2)} ${center.toFixed(2)}`,
          ].join(' ');
          return (
            <>
              <Circle
                cx={center}
                cy={center}
                r={ringR}
                stroke="#FFFFFF"
                strokeOpacity={0.22}
                strokeWidth={Math.max(1, size * 0.025)}
                fill="none"
              />
              <Path
                d={ticksD}
                stroke="#FFFFFF"
                strokeOpacity={0.45}
                strokeWidth={Math.max(1, size * 0.024)}
                strokeLinecap="round"
                fill="none"
              />
              <Path
                d={arcD}
                stroke={`url(#${waveGradId})`}
                strokeWidth={Math.max(1.8, size * 0.056)}
                strokeOpacity={isActive ? 0.96 : 0.88}
                strokeLinecap="round"
                fill="none"
              />
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.34}
                fill={`url(#${bloomGradId})`}
              />
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.16}
                fill="#FFFFFF"
                fillOpacity={isActive ? 0.96 : 0.88}
              />
            </>
          );
        }

        case 'prism_lens': {
          const outerR = coreRadius * 0.64;
          const waistR = coreRadius * 0.21;
          const crossHalf = coreRadius * 0.3;
          const innerR = coreRadius * 0.2;
          const crossFacetD = `M${(center - crossHalf).toFixed(2)} ${(
            center - crossHalf
          ).toFixed(2)} L${(center + crossHalf).toFixed(2)} ${(
            center - crossHalf
          ).toFixed(2)} L${(center + crossHalf).toFixed(2)} ${(
            center + crossHalf
          ).toFixed(2)} L${(center - crossHalf).toFixed(2)} ${(
            center + crossHalf
          ).toFixed(2)} Z`;
          const starD = [
            `M${center.toFixed(2)} ${(center - outerR).toFixed(2)}`,
            `L${(center + waistR).toFixed(2)} ${(center - waistR).toFixed(2)}`,
            `L${(center + outerR).toFixed(2)} ${center.toFixed(2)}`,
            `L${(center + waistR).toFixed(2)} ${(center + waistR).toFixed(2)}`,
            `L${center.toFixed(2)} ${(center + outerR).toFixed(2)}`,
            `L${(center - waistR).toFixed(2)} ${(center + waistR).toFixed(2)}`,
            `L${(center - outerR).toFixed(2)} ${center.toFixed(2)}`,
            `L${(center - waistR).toFixed(2)} ${(center - waistR).toFixed(2)}`,
            'Z',
          ].join(' ');
          const topFacetD = [
            `M${center.toFixed(2)} ${(center - outerR).toFixed(2)}`,
            `L${(center + waistR).toFixed(2)} ${(center - waistR).toFixed(2)}`,
            `L${center.toFixed(2)} ${center.toFixed(2)}`,
            `L${(center - waistR).toFixed(2)} ${(center - waistR).toFixed(2)}`,
            'Z',
          ].join(' ');
          const coreDiamondD = [
            `M${center.toFixed(2)} ${(center - innerR).toFixed(2)}`,
            `L${(center + innerR).toFixed(2)} ${center.toFixed(2)}`,
            `L${center.toFixed(2)} ${(center + innerR).toFixed(2)}`,
            `L${(center - innerR).toFixed(2)} ${center.toFixed(2)}`,
            'Z',
          ].join(' ');
          return (
            <>
              <Path d={crossFacetD} fill="#FFFFFF" fillOpacity={0.22} />
              <Path
                d={starD}
                fill={`url(#${waveGradId})`}
                fillOpacity={isActive ? 0.96 : 0.9}
              />
              <Path d={topFacetD} fill="#FFFFFF" fillOpacity={0.72} />
              <Path d={coreDiamondD} fill="#FFFFFF" fillOpacity={0.92} />
            </>
          );
        }

        case 'acoustic_core': {
          const spacing = size * 0.13;
          const barStrokeWidth = Math.max(1.8, size * 0.056);
          const barPaths = ACOUSTIC_BAR_RATIOS.map((ratio, idx) => {
            const x = center + (idx - 2) * spacing;
            const halfH = (size * ratio) / 2;
            return `M${x.toFixed(2)} ${(center - halfH).toFixed(
              2,
            )} L${x.toFixed(2)} ${(center + halfH).toFixed(2)}`;
          });
          return (
            <>
              <Circle
                cx={center}
                cy={center}
                r={size * 0.28}
                fill={`url(#${bloomGradId})`}
              />
              <Path
                d={barPaths[2]}
                stroke={luminousWaveStops[0]?.[1] ?? '#FFFFFF'}
                strokeWidth={barStrokeWidth * 2.4}
                strokeOpacity={isActive ? 0.36 : 0.24}
                strokeLinecap="round"
                fill="none"
              />
              {barPaths.map((d, idx) => (
                <Path
                  key={idx}
                  d={d}
                  stroke="#FFFFFF"
                  strokeWidth={barStrokeWidth}
                  strokeOpacity={ACOUSTIC_BAR_OPACITIES[idx] ?? 0.84}
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
            </>
          );
        }

        case 'synth_orb':
        default:
          return (
            <>
              {centerStrand ? (
                <Path
                  d={centerStrand}
                  stroke={`url(#${waveGradId})`}
                  strokeWidth={isActive ? 5.2 : 4}
                  strokeOpacity={isActive ? 0.42 : 0.26}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ) : null}
              {strands.map((d, index) => (
                <Path
                  key={index}
                  d={d}
                  stroke={`url(#${waveGradId})`}
                  strokeWidth={index === centerIndex ? 1.65 : 1.25}
                  strokeOpacity={ORB_STRAND_OPACITIES[index] ?? 0.72}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </>
          );
      }
    };

    return (
      <Svg
        testID={testID}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id={bezelGradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={bezelStop0} />
            <Stop offset="0.32" stopColor={bezelStop1} />
            <Stop offset="0.68" stopColor={bezelStop2} />
            <Stop offset="1" stopColor={bezelStop3} />
          </LinearGradient>

          <LinearGradient id={coreGradId} x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={coreTop} />
            <Stop offset="0.5" stopColor={coreMid} />
            <Stop offset="1" stopColor={coreBottom} />
          </LinearGradient>

          <RadialGradient id={bloomGradId} cx="0.5" cy="0.5" r="0.5">
            <Stop
              offset="0"
              stopColor={bloomCenterColor}
              stopOpacity={
                isDarkMode ? (isActive ? 0.44 : 0.28) : isActive ? 0.38 : 0.26
              }
            />
            <Stop
              offset="0.6"
              stopColor={modernThemeExtras.heroHighlightColor}
              stopOpacity={0.12}
            />
            <Stop
              offset="1"
              stopColor={modernThemeExtras.heroHighlightColor}
              stopOpacity={0}
            />
          </RadialGradient>

          <RadialGradient id={sheenGradId} cx="0.5" cy="0.5" r="0.5">
            <Stop
              offset="0"
              stopColor="#FFFFFF"
              stopOpacity={
                isDarkMode ? (isActive ? 0.24 : 0.18) : isActive ? 0.34 : 0.26
              }
            />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>

          <RadialGradient id={pearlHotGradId} cx="0.5" cy="0.5" r="0.5">
            <Stop
              offset="0"
              stopColor={luminousWaveStops[0]?.[1] ?? '#FFFFFF'}
              stopOpacity={isActive ? 0.72 : 0.56}
            />
            <Stop
              offset="0.55"
              stopColor={luminousWaveStops[2]?.[1] ?? modernPalette.periwinkle}
              stopOpacity={0.28}
            />
            <Stop
              offset="1"
              stopColor={luminousWaveStops[2]?.[1] ?? modernPalette.periwinkle}
              stopOpacity={0}
            />
          </RadialGradient>

          <RadialGradient id={pearlCoolGradId} cx="0.5" cy="0.5" r="0.5">
            <Stop
              offset="0"
              stopColor={luminousWaveStops[5]?.[1] ?? modernPalette.periwinkle}
              stopOpacity={isActive ? 0.62 : 0.46}
            />
            <Stop
              offset="1"
              stopColor={luminousWaveStops[5]?.[1] ?? modernPalette.periwinkle}
              stopOpacity={0}
            />
          </RadialGradient>

          <LinearGradient id={waveGradId} x1="0" y1="0" x2="1" y2="0">
            {luminousWaveStops.map(([offset, colour]) => (
              <Stop key={offset} offset={offset} stopColor={colour} />
            ))}
          </LinearGradient>

          <LinearGradient id={rimGradId} x1="0.3" y1="0" x2="0.7" y2="1">
            <Stop
              offset="0"
              stopColor="#FFFFFF"
              stopOpacity={isActive ? 0.65 : 0.45}
            />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.08} />
            <Stop
              offset="1"
              stopColor={modernPalette.periwinkle}
              stopOpacity={0.12}
            />
          </LinearGradient>

          <ClipPath id={coreClipId}>
            <Circle cx={center} cy={center} r={coreRadius} />
          </ClipPath>
        </Defs>

        {/* Outer gradient bezel */}
        <Circle
          cx={center}
          cy={center}
          r={center - 0.75}
          fill={`url(#${bezelGradId})`}
        />

        {/* Theme-adaptive 3D gradient core */}
        <Circle
          cx={center}
          cy={center}
          r={coreRadius}
          fill={`url(#${coreGradId})`}
        />

        {/* Clipped interior bloom, top sheen, and selectable centerpiece */}
        <G clipPath={`url(#${coreClipId})`}>
          <Circle
            cx={center}
            cy={center + 2}
            r={coreRadius * 0.9}
            fill={`url(#${bloomGradId})`}
          />
          <Circle
            cx={center * 0.76}
            cy={center * 0.52}
            r={coreRadius * 0.75}
            fill={`url(#${sheenGradId})`}
          />
          {renderCenterpiece()}
        </G>

        {/* Top-lit glass inner rim */}
        <Circle
          cx={center}
          cy={center}
          r={coreRadius}
          stroke={`url(#${rimGradId})`}
          strokeWidth={1.1}
          fill="none"
        />
      </Svg>
    );
  },
);

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

export const CustomTabBar: React.FC<CustomTabBarProps> = ({
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
  const [barWidth, setBarWidth] = useState(360);

  const handleModernLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    if (measured > 0 && measured !== barWidth) {
      setBarWidth(measured);
    }
  };

  if (isModern) {
    const bottomInset = Math.max(insets.bottom, 8);
    const contentHeight = ModernLayout.navbarContentHeight;
    const totalHeight = contentHeight + bottomInset;
    const navPath = buildCurvedTabBarPath(barWidth, totalHeight);

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
