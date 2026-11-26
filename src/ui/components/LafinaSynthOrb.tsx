import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, AppState, Easing, StyleSheet, View} from 'react-native';
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
import {useReducedMotion} from '../hooks/useReducedMotion';
import {strandHeightAt} from '../splash/synthWave';
import {
  type ModernAiButtonDesignId,
  type ModernPalette,
  type ModernThemeExtras,
  type ModernThemeId,
} from '../theme';
import {mixColors} from '../theme/colorMix';

export const MODERN_FAB_SIZE = 54;

const ORB_STRAND_COUNT = 7;
const ORB_POINT_COUNT = 24;
const ORB_STRAND_OPACITIES = [
  0.58, 0.71, 0.84, 0.96, 0.84, 0.71, 0.58,
] as const;
const ACOUSTIC_BAR_RATIOS = [0.18, 0.32, 0.48, 0.32, 0.18] as const;
const ACOUSTIC_BAR_OPACITIES = [0.64, 0.84, 0.98, 0.84, 0.64] as const;
const LIVE_EQ_BAR_RATIOS = [0.24, 0.38, 0.5, 0.38, 0.24] as const;
const LIVE_EQ_MIN_SCALES = [0.36, 0.44, 0.48, 0.4, 0.34] as const;
const LIVE_EQ_MAX_SCALES = [1.0, 1.0, 1.0, 1.0, 1.0] as const;
const LIVE_EQ_DURATIONS = [620, 470, 390, 520, 680] as const;

const ANIMATED_DESIGN_SET: ReadonlySet<ModernAiButtonDesignId> = new Set([
  'pulse_wave',
  'orbital_rings',
  'aurora_breathe',
  'equalizer_live',
  'celestial_spin',
  'quantum_sweep',
]);

export interface LafinaSynthOrbProps {
  size?: number;
  design?: ModernAiButtonDesignId;
  isActive: boolean;
  isDarkMode: boolean;
  modernTheme: ModernThemeId;
  modernPalette: ModernPalette;
  modernThemeExtras: ModernThemeExtras;
  /** Enable motion for animated button designs. Defaults to true. */
  animate?: boolean;
  testID?: string;
}

function buildPeriodicWavePath(
  width: number,
  middleY: number,
  amplitude: number,
  cycles: number,
  phaseRad: number,
  samples = 36,
): string {
  let d = '';
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const x = t * width;
    const angle = t * Math.PI * 2 * cycles + phaseRad;
    const y =
      middleY -
      Math.sin(angle) * amplitude * 0.72 -
      Math.sin(angle * 2 + 0.6) * amplitude * 0.28;
    d += `${i === 0 ? 'M' : ' L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

function buildFourPointStarPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): string {
  return [
    `M${cx.toFixed(2)} ${(cy - outerR).toFixed(2)}`,
    `L${(cx + innerR).toFixed(2)} ${(cy - innerR).toFixed(2)}`,
    `L${(cx + outerR).toFixed(2)} ${cy.toFixed(2)}`,
    `L${(cx + innerR).toFixed(2)} ${(cy + innerR).toFixed(2)}`,
    `L${cx.toFixed(2)} ${(cy + outerR).toFixed(2)}`,
    `L${(cx - innerR).toFixed(2)} ${(cy + innerR).toFixed(2)}`,
    `L${(cx - outerR).toFixed(2)} ${cy.toFixed(2)}`,
    `L${(cx - innerR).toFixed(2)} ${(cy - innerR).toFixed(2)}`,
    'Z',
  ].join(' ');
}

function buildArcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(
    2,
  )} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Multi-layered LAFINA AI orb: a theme-adaptive 3D luminous glass lens
 * supporting static and native-driven animated interior designs across
 * light and dark modes.
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
    animate = true,
    testID = 'modern-tab-synth-orb',
  }) => {
    const reducedMotion = useReducedMotion();
    const [appActive, setAppActive] = useState(
      () => AppState.currentState === 'active',
    );
    useEffect(() => {
      const sub = AppState.addEventListener('change', next => {
        setAppActive(next === 'active');
      });
      return () => sub.remove();
    }, []);
    const isAnimatedDesign = ANIMATED_DESIGN_SET.has(design);
    const shouldAnimate =
      animate &&
      appActive &&
      isAnimatedDesign &&
      !reducedMotion &&
      process.env.NODE_ENV !== 'test';

    const center = size / 2;
    const coreRadius = center - 2.25;

    // Shared native-driver animation values (allocated once, only started when needed)
    const primaryProgress = useRef(new Animated.Value(0)).current;
    const secondaryProgress = useRef(new Animated.Value(0)).current;
    const eqBarsRef = useRef<Animated.Value[] | null>(null);
    if (!eqBarsRef.current) {
      eqBarsRef.current = LIVE_EQ_BAR_RATIOS.map(
        (_, i) => new Animated.Value(i === 2 ? 0.92 : i % 2 === 1 ? 0.72 : 0.56),
      );
    }
    const eqBars = eqBarsRef.current;

    useEffect(() => {
      primaryProgress.setValue(0);
      secondaryProgress.setValue(0);

      if (!shouldAnimate) {
        eqBars.forEach((bar, i) => {
          bar.setValue(i === 2 ? 0.92 : i % 2 === 1 ? 0.74 : 0.56);
        });
        return undefined;
      }

      const running: Animated.CompositeAnimation[] = [];

      if (design === 'orbital_rings') {
        const cw = Animated.loop(
          Animated.timing(primaryProgress, {
            toValue: 1,
            duration: isActive ? 4200 : 5600,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        const ccw = Animated.loop(
          Animated.timing(secondaryProgress, {
            toValue: 1,
            duration: isActive ? 6200 : 8000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        running.push(cw, ccw);
      } else if (design === 'pulse_wave') {
        const driftA = Animated.loop(
          Animated.timing(primaryProgress, {
            toValue: 1,
            duration: isActive ? 2400 : 3400,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        const breathe = Animated.loop(
          Animated.sequence([
            Animated.timing(secondaryProgress, {
              toValue: 1,
              duration: isActive ? 1100 : 1550,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(secondaryProgress, {
              toValue: 0,
              duration: isActive ? 1100 : 1550,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        );
        running.push(driftA, breathe);
      } else if (design === 'aurora_breathe') {
        const spin = Animated.loop(
          Animated.timing(primaryProgress, {
            toValue: 1,
            duration: isActive ? 5400 : 7600,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        const pulse = Animated.loop(
          Animated.sequence([
            Animated.timing(secondaryProgress, {
              toValue: 1,
              duration: isActive ? 1150 : 1650,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(secondaryProgress, {
              toValue: 0,
              duration: isActive ? 1150 : 1650,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        );
        running.push(spin, pulse);
      } else if (design === 'equalizer_live') {
        eqBars.forEach((bar, idx) => {
          const minS = LIVE_EQ_MIN_SCALES[idx];
          const maxS = LIVE_EQ_MAX_SCALES[idx];
          const dur = isActive
            ? Math.round(LIVE_EQ_DURATIONS[idx] * 0.78)
            : LIVE_EQ_DURATIONS[idx];
          bar.setValue(idx % 2 === 0 ? minS : maxS);
          const loop = Animated.loop(
            Animated.sequence([
              Animated.timing(bar, {
                toValue: idx % 2 === 0 ? maxS : minS,
                duration: dur,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(bar, {
                toValue: idx % 2 === 0 ? minS : maxS,
                duration: dur,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ]),
          );
          running.push(loop);
        });
      } else if (design === 'celestial_spin') {
        const orbit = Animated.loop(
          Animated.timing(primaryProgress, {
            toValue: 1,
            duration: isActive ? 7200 : 9600,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        const twinkle = Animated.loop(
          Animated.sequence([
            Animated.timing(secondaryProgress, {
              toValue: 1,
              duration: isActive ? 950 : 1350,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(secondaryProgress, {
              toValue: 0,
              duration: isActive ? 950 : 1350,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        );
        running.push(orbit, twinkle);
      } else if (design === 'quantum_sweep') {
        const sweep = Animated.loop(
          Animated.timing(primaryProgress, {
            toValue: 1,
            duration: isActive ? 2300 : 3200,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        const ping = Animated.loop(
          Animated.timing(secondaryProgress, {
            toValue: 1,
            duration: isActive ? 1700 : 2200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        );
        running.push(sweep, ping);
      }

      running.forEach(anim => anim.start());
      return () => {
        running.forEach(anim => anim.stop());
      };
    }, [design, isActive, shouldAnimate, primaryProgress, secondaryProgress, eqBars]);

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

    const pulseWaveRibbons = useMemo(() => {
      if (design !== 'pulse_wave') return null;
      const ribbonW = size * 2;
      const amp = size * (isActive ? 0.16 : 0.125);
      return {
        ribbonW,
        primary: [
          buildPeriodicWavePath(ribbonW, center, amp, 2, 0),
          buildPeriodicWavePath(ribbonW, center, amp * 0.78, 2, 0.55),
          buildPeriodicWavePath(ribbonW, center, amp * 0.56, 2, 1.1),
        ],
        secondary: [
          buildPeriodicWavePath(ribbonW, center, amp * 0.86, 2, Math.PI * 0.5),
          buildPeriodicWavePath(ribbonW, center, amp * 0.6, 2, Math.PI * 1.15),
        ],
      };
    }, [design, isActive, size, center]);

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
    const highlightAccent = luminousWaveStops[0]?.[1] ?? '#FFFFFF';
    const coolAccent =
      luminousWaveStops[5]?.[1] ?? modernPalette.periwinkle;

    const renderBaseCenterpiece = () => {
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
          const arcD = buildArcPath(center, center, ringR, -195, 15);
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
          const starD = buildFourPointStarPath(center, center, outerR, waistR);
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
                stroke={highlightAccent}
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

        case 'neural_mesh': {
          const ringR = coreRadius * 0.62;
          const nodes = Array.from({length: 6}, (_, idx) => {
            const rad = ((idx * 60 - 90) * Math.PI) / 180;
            return {
              x: center + ringR * Math.cos(rad),
              y: center + ringR * Math.sin(rad),
            };
          });
          const perimeterD = `${nodes
            .map(
              (pt, idx) =>
                `${idx === 0 ? 'M' : ' L'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`,
            )
            .join('')} Z`;
          const spokesD = nodes
            .map(
              pt =>
                `M${center.toFixed(2)} ${center.toFixed(2)} L${pt.x.toFixed(
                  2,
                )} ${pt.y.toFixed(2)}`,
            )
            .join(' ');
          const crossD = `M${nodes[0].x.toFixed(2)} ${nodes[0].y.toFixed(
            2,
          )} L${nodes[2].x.toFixed(2)} ${nodes[2].y.toFixed(
            2,
          )} L${nodes[4].x.toFixed(2)} ${nodes[4].y.toFixed(2)} Z`;
          const nodeR = Math.max(1.5, size * 0.045);
          return (
            <>
              <Path
                d={perimeterD}
                stroke="#FFFFFF"
                strokeOpacity={0.34}
                strokeWidth={Math.max(0.9, size * 0.022)}
                fill="none"
              />
              <Path
                d={crossD}
                stroke={`url(#${waveGradId})`}
                strokeOpacity={0.62}
                strokeWidth={Math.max(1.0, size * 0.024)}
                fill="none"
              />
              <Path
                d={spokesD}
                stroke="#FFFFFF"
                strokeOpacity={isActive ? 0.72 : 0.56}
                strokeWidth={Math.max(1.0, size * 0.024)}
                strokeLinecap="round"
                fill="none"
              />
              {nodes.map((pt, idx) => (
                <Circle
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r={nodeR}
                  fill={idx % 2 === 0 ? '#FFFFFF' : highlightAccent}
                  fillOpacity={0.92}
                />
              ))}
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.26}
                fill={`url(#${pearlHotGradId})`}
              />
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.14}
                fill="#FFFFFF"
                fillOpacity={0.96}
              />
            </>
          );
        }

        case 'orbital_rings': {
          return (
            <>
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.68}
                stroke="#FFFFFF"
                strokeOpacity={0.16}
                strokeWidth={Math.max(0.9, size * 0.022)}
                fill="none"
              />
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.34}
                fill={`url(#${pearlHotGradId})`}
              />
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.16}
                fill="#FFFFFF"
                fillOpacity={isActive ? 0.98 : 0.9}
              />
            </>
          );
        }

        case 'aurora_breathe': {
          return (
            <Circle
              cx={center}
              cy={center}
              r={coreRadius * 0.72}
              fill={`url(#${pearlCoolGradId})`}
            />
          );
        }

        case 'equalizer_live': {
          const lineD = `M${(center - coreRadius * 0.62).toFixed(
            2,
          )} ${center.toFixed(2)} L${(center + coreRadius * 0.62).toFixed(
            2,
          )} ${center.toFixed(2)}`;
          return (
            <>
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.56}
                fill={`url(#${bloomGradId})`}
              />
              <Path
                d={lineD}
                stroke="#FFFFFF"
                strokeOpacity={0.2}
                strokeWidth={Math.max(0.9, size * 0.02)}
                strokeLinecap="round"
                fill="none"
              />
            </>
          );
        }

        case 'celestial_spin': {
          const haloR = coreRadius * 0.68;
          return (
            <>
              <Circle
                cx={center}
                cy={center}
                r={haloR}
                stroke="#FFFFFF"
                strokeOpacity={0.2}
                strokeWidth={Math.max(0.9, size * 0.02)}
                strokeDasharray={`${Math.max(2, size * 0.04)} ${Math.max(
                  3,
                  size * 0.07,
                )}`}
                fill="none"
              />
              <Circle
                cx={center}
                cy={center}
                r={coreRadius * 0.38}
                fill={`url(#${pearlHotGradId})`}
              />
            </>
          );
        }

        case 'quantum_sweep': {
          const outerRingR = coreRadius * 0.72;
          const midRingR = coreRadius * 0.44;
          const crossD = [
            `M${center.toFixed(2)} ${(center - outerRingR).toFixed(2)}`,
            `L${center.toFixed(2)} ${(center + outerRingR).toFixed(2)}`,
            `M${(center - outerRingR).toFixed(2)} ${center.toFixed(2)}`,
            `L${(center + outerRingR).toFixed(2)} ${center.toFixed(2)}`,
          ].join(' ');
          return (
            <>
              <Circle
                cx={center}
                cy={center}
                r={outerRingR}
                stroke="#FFFFFF"
                strokeOpacity={0.22}
                strokeWidth={Math.max(0.9, size * 0.02)}
                fill="none"
              />
              <Circle
                cx={center}
                cy={center}
                r={midRingR}
                stroke="#FFFFFF"
                strokeOpacity={0.18}
                strokeWidth={Math.max(0.8, size * 0.018)}
                fill="none"
              />
              <Path
                d={crossD}
                stroke="#FFFFFF"
                strokeOpacity={0.18}
                strokeWidth={Math.max(0.8, size * 0.018)}
                fill="none"
              />
              <Circle
                cx={center}
                cy={center}
                r={Math.max(2, coreRadius * 0.13)}
                fill="#FFFFFF"
                fillOpacity={0.96}
              />
            </>
          );
        }

        case 'pulse_wave':
          return null;

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

    const renderAnimatedOverlay = () => {
      if (!isAnimatedDesign) return null;

      const inset = center - coreRadius;
      const clipBoxStyle = {
        position: 'absolute' as const,
        top: inset,
        left: inset,
        width: coreRadius * 2,
        height: coreRadius * 2,
        borderRadius: coreRadius,
        overflow: 'hidden' as const,
      };
      const fullOverlayStyle = {
        position: 'absolute' as const,
        top: -inset,
        left: -inset,
        width: size,
        height: size,
      };

      if (design === 'pulse_wave' && pulseWaveRibbons) {
        const translateX = primaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -size],
        });
        const reverseX = primaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [-size, 0],
        });
        const waveScaleY = secondaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.88, 1.14],
        });
        const overlayWaveGradId = `orbPulseWaveGrad_${idSuffix}`;

        return (
          <View style={clipBoxStyle} pointerEvents="none">
            <Animated.View
              style={[
                fullOverlayStyle,
                {
                  width: pulseWaveRibbons.ribbonW,
                  transform: [{translateX: reverseX}],
                },
              ]}
            >
              <Svg
                width={pulseWaveRibbons.ribbonW}
                height={size}
                viewBox={`0 0 ${pulseWaveRibbons.ribbonW} ${size}`}
              >
                {pulseWaveRibbons.secondary.map((d, idx) => (
                  <Path
                    key={idx}
                    d={d}
                    stroke={coolAccent}
                    strokeWidth={Math.max(1.1, size * 0.028)}
                    strokeOpacity={idx === 0 ? 0.52 : 0.34}
                    strokeLinecap="round"
                    fill="none"
                  />
                ))}
              </Svg>
            </Animated.View>
            <Animated.View
              style={[
                fullOverlayStyle,
                {
                  width: pulseWaveRibbons.ribbonW,
                  transform: [{translateX}, {scaleY: waveScaleY}],
                },
              ]}
            >
              <Svg
                width={pulseWaveRibbons.ribbonW}
                height={size}
                viewBox={`0 0 ${pulseWaveRibbons.ribbonW} ${size}`}
              >
                <Defs>
                  <LinearGradient
                    id={overlayWaveGradId}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    {luminousWaveStops.map(([offset, colour]) => (
                      <Stop key={offset} offset={offset} stopColor={colour} />
                    ))}
                  </LinearGradient>
                </Defs>
                <Path
                  d={pulseWaveRibbons.primary[0]}
                  stroke={`url(#${overlayWaveGradId})`}
                  strokeWidth={Math.max(3.6, size * 0.09)}
                  strokeOpacity={isActive ? 0.36 : 0.24}
                  strokeLinecap="round"
                  fill="none"
                />
                {pulseWaveRibbons.primary.map((d, idx) => (
                  <Path
                    key={idx}
                    d={d}
                    stroke={idx === 0 ? '#FFFFFF' : `url(#${overlayWaveGradId})`}
                    strokeWidth={
                      idx === 0
                        ? Math.max(1.5, size * 0.036)
                        : Math.max(1.15, size * 0.026)
                    }
                    strokeOpacity={idx === 0 ? 0.96 : idx === 1 ? 0.78 : 0.56}
                    strokeLinecap="round"
                    fill="none"
                  />
                ))}
              </Svg>
            </Animated.View>
          </View>
        );
      }

      if (design === 'orbital_rings') {
        const spinCw = primaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        });
        const spinCcw = secondaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: ['360deg', '0deg'],
        });
        const outerR = coreRadius * 0.68;
        const innerR = coreRadius * 0.44;
        const outerArc1 = buildArcPath(center, center, outerR, -135, 10);
        const outerArc2 = buildArcPath(center, center, outerR, 45, 170);
        const innerArc = buildArcPath(center, center, innerR, -40, 165);
        const satR = Math.max(1.8, size * 0.055);
        const satSmallR = Math.max(1.3, size * 0.038);

        return (
          <View style={clipBoxStyle} pointerEvents="none">
            <Animated.View
              style={[fullOverlayStyle, {transform: [{rotate: spinCw}]}]}
            >
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Path
                  d={outerArc1}
                  stroke="#FFFFFF"
                  strokeWidth={Math.max(1.4, size * 0.038)}
                  strokeOpacity={0.9}
                  strokeLinecap="round"
                  fill="none"
                />
                <Path
                  d={outerArc2}
                  stroke={highlightAccent}
                  strokeWidth={Math.max(1.2, size * 0.032)}
                  strokeOpacity={0.72}
                  strokeLinecap="round"
                  fill="none"
                />
                <Circle
                  cx={center + outerR * Math.cos((10 * Math.PI) / 180)}
                  cy={center + outerR * Math.sin((10 * Math.PI) / 180)}
                  r={satR}
                  fill="#FFFFFF"
                />
                <Circle
                  cx={center + outerR * Math.cos((170 * Math.PI) / 180)}
                  cy={center + outerR * Math.sin((170 * Math.PI) / 180)}
                  r={satSmallR}
                  fill={highlightAccent}
                />
              </Svg>
            </Animated.View>
            <Animated.View
              style={[fullOverlayStyle, {transform: [{rotate: spinCcw}]}]}
            >
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Path
                  d={innerArc}
                  stroke={coolAccent}
                  strokeWidth={Math.max(1.1, size * 0.03)}
                  strokeOpacity={0.82}
                  strokeLinecap="round"
                  fill="none"
                />
                <Circle
                  cx={center + innerR * Math.cos((165 * Math.PI) / 180)}
                  cy={center + innerR * Math.sin((165 * Math.PI) / 180)}
                  r={satSmallR}
                  fill="#FFFFFF"
                  fillOpacity={0.94}
                />
              </Svg>
            </Animated.View>
          </View>
        );
      }

      if (design === 'aurora_breathe') {
        const auroraSpin = primaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        });
        const auroraScale = secondaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1.1],
        });
        const coreScale = secondaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.84, 1.14],
        });
        const coreOpacity = secondaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.74, 1],
        });
        const auroraHotId = `orbAuroraHot_${idSuffix}`;
        const auroraCoolId = `orbAuroraCool_${idSuffix}`;
        const sparkD = buildFourPointStarPath(
          center,
          center,
          coreRadius * 0.46,
          coreRadius * 0.14,
        );
        const swirlD = buildArcPath(center, center, coreRadius * 0.62, -160, 20);

        return (
          <View style={clipBoxStyle} pointerEvents="none">
            <Animated.View
              style={[
                fullOverlayStyle,
                {
                  transform: [{rotate: auroraSpin}, {scale: auroraScale}],
                },
              ]}
            >
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                  <RadialGradient id={auroraHotId} cx="0.5" cy="0.5" r="0.5">
                    <Stop
                      offset="0"
                      stopColor={highlightAccent}
                      stopOpacity={0.85}
                    />
                    <Stop
                      offset="1"
                      stopColor={highlightAccent}
                      stopOpacity={0}
                    />
                  </RadialGradient>
                  <RadialGradient id={auroraCoolId} cx="0.5" cy="0.5" r="0.5">
                    <Stop
                      offset="0"
                      stopColor={coolAccent}
                      stopOpacity={0.78}
                    />
                    <Stop offset="1" stopColor={coolAccent} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle
                  cx={center * 0.72}
                  cy={center * 0.78}
                  r={coreRadius * 0.64}
                  fill={`url(#${auroraHotId})`}
                />
                <Circle
                  cx={center * 1.28}
                  cy={center * 1.22}
                  r={coreRadius * 0.6}
                  fill={`url(#${auroraCoolId})`}
                />
                <Path
                  d={swirlD}
                  stroke="#FFFFFF"
                  strokeOpacity={0.55}
                  strokeWidth={Math.max(1.2, size * 0.032)}
                  strokeLinecap="round"
                  fill="none"
                />
              </Svg>
            </Animated.View>
            <Animated.View
              style={[
                fullOverlayStyle,
                {
                  opacity: coreOpacity,
                  transform: [{scale: coreScale}],
                },
              ]}
            >
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Path d={sparkD} fill="#FFFFFF" fillOpacity={0.94} />
              </Svg>
            </Animated.View>
          </View>
        );
      }

      if (design === 'equalizer_live') {
        const barWidth = Math.max(2, Math.round(size * 0.068));
        const barGap = Math.max(2, Math.round(size * 0.062));
        return (
          <View
            style={[clipBoxStyle, styles.eqOverlayContainer]}
            pointerEvents="none"
          >
            <View style={[styles.eqBarsRow, {gap: barGap}]}>
              {LIVE_EQ_BAR_RATIOS.map((ratio, idx) => {
                const maxH = Math.max(6, Math.round(size * ratio));
                return (
                  <Animated.View
                    key={idx}
                    style={{
                      width: barWidth,
                      height: maxH,
                      borderRadius: barWidth / 2,
                      backgroundColor:
                        idx === 2 ? '#FFFFFF' : idx % 2 === 1 ? '#FFFFFF' : highlightAccent,
                      opacity: ACOUSTIC_BAR_OPACITIES[idx],
                      transform: [{scaleY: eqBars[idx]}],
                    }}
                  />
                );
              })}
            </View>
          </View>
        );
      }

      if (design === 'celestial_spin') {
        const orbitSpin = primaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        });
        const starScale = secondaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.86, 1.14],
        });
        const starOpacity = secondaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.78, 1],
        });
        const ringR = coreRadius * 0.68;
        const arcA = buildArcPath(center, center, ringR, -75, 25);
        const arcB = buildArcPath(center, center, ringR, 105, 205);
        const mainStarD = buildFourPointStarPath(
          center,
          center,
          coreRadius * 0.54,
          coreRadius * 0.16,
        );
        const microStarR = Math.max(1.4, size * 0.042);

        return (
          <View style={clipBoxStyle} pointerEvents="none">
            <Animated.View
              style={[fullOverlayStyle, {transform: [{rotate: orbitSpin}]}]}
            >
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Path
                  d={arcA}
                  stroke={highlightAccent}
                  strokeWidth={Math.max(1.2, size * 0.032)}
                  strokeOpacity={0.86}
                  strokeLinecap="round"
                  fill="none"
                />
                <Path
                  d={arcB}
                  stroke="#FFFFFF"
                  strokeWidth={Math.max(1.1, size * 0.028)}
                  strokeOpacity={0.72}
                  strokeLinecap="round"
                  fill="none"
                />
                <Circle
                  cx={center + ringR * Math.cos((25 * Math.PI) / 180)}
                  cy={center + ringR * Math.sin((25 * Math.PI) / 180)}
                  r={microStarR}
                  fill="#FFFFFF"
                />
                <Circle
                  cx={center + ringR * Math.cos((205 * Math.PI) / 180)}
                  cy={center + ringR * Math.sin((205 * Math.PI) / 180)}
                  r={microStarR * 0.85}
                  fill={highlightAccent}
                />
              </Svg>
            </Animated.View>
            <Animated.View
              style={[
                fullOverlayStyle,
                {
                  opacity: starOpacity,
                  transform: [{scale: starScale}],
                },
              ]}
            >
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Path d={mainStarD} fill="#FFFFFF" fillOpacity={0.96} />
                <Circle
                  cx={center}
                  cy={center}
                  r={coreRadius * 0.12}
                  fill={highlightAccent}
                />
              </Svg>
            </Animated.View>
          </View>
        );
      }

      if (design === 'quantum_sweep') {
        const sweepRot = primaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        });
        const pingScale = secondaryProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.3, 1.0],
        });
        const pingOpacity = secondaryProgress.interpolate({
          inputRange: [0, 0.2, 1],
          outputRange: [0, 0.82, 0],
        });
        const sweepR = coreRadius * 0.76;
        const startRad = (-85 * Math.PI) / 180;
        const endRad = (-15 * Math.PI) / 180;
        const x1 = center + sweepR * Math.cos(startRad);
        const y1 = center + sweepR * Math.sin(startRad);
        const x2 = center + sweepR * Math.cos(endRad);
        const y2 = center + sweepR * Math.sin(endRad);
        const wedgeD = `M${center.toFixed(2)} ${center.toFixed(
          2,
        )} L${x1.toFixed(2)} ${y1.toFixed(2)} A${sweepR.toFixed(
          2,
        )} ${sweepR.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
        const leadLineD = `M${center.toFixed(2)} ${center.toFixed(
          2,
        )} L${x2.toFixed(2)} ${y2.toFixed(2)}`;
        const sweepArcD = buildArcPath(center, center, sweepR, -85, -15);

        return (
          <View style={clipBoxStyle} pointerEvents="none">
            <Animated.View
              style={[
                fullOverlayStyle,
                {
                  opacity: pingOpacity,
                  transform: [{scale: pingScale}],
                },
              ]}
            >
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Circle
                  cx={center}
                  cy={center}
                  r={coreRadius * 0.72}
                  stroke={highlightAccent}
                  strokeWidth={Math.max(1.2, size * 0.032)}
                  fill="none"
                />
              </Svg>
            </Animated.View>
            <Animated.View
              style={[fullOverlayStyle, {transform: [{rotate: sweepRot}]}]}
            >
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Path d={wedgeD} fill={highlightAccent} fillOpacity={0.28} />
                <Path
                  d={sweepArcD}
                  stroke="#FFFFFF"
                  strokeWidth={Math.max(1.4, size * 0.038)}
                  strokeOpacity={0.92}
                  strokeLinecap="round"
                  fill="none"
                />
                <Path
                  d={leadLineD}
                  stroke="#FFFFFF"
                  strokeWidth={Math.max(1.2, size * 0.03)}
                  strokeOpacity={0.94}
                  strokeLinecap="round"
                  fill="none"
                />
                <Circle
                  cx={x2}
                  cy={y2}
                  r={Math.max(1.5, size * 0.044)}
                  fill="#FFFFFF"
                />
              </Svg>
            </Animated.View>
          </View>
        );
      }

      return null;
    };

    return (
      <View
        testID={testID}
        style={[
          styles.orbWrapper,
          {width: size, height: size, borderRadius: center},
        ]}
        pointerEvents="none"
      >
        <Svg
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
                stopColor={highlightAccent}
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
                stopColor={coolAccent}
                stopOpacity={isActive ? 0.62 : 0.46}
              />
              <Stop offset="1" stopColor={coolAccent} stopOpacity={0} />
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

          {/* Clipped interior bloom, top sheen, and base centerpiece */}
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
            {renderBaseCenterpiece()}
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

        {renderAnimatedOverlay()}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  orbWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  eqOverlayContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eqBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
