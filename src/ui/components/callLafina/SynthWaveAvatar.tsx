import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';
import type {ConversationPhase} from '../../../cloud/voiceConversation/types';
import {useTheme} from '../../contexts/ThemeContext';
import {
  DARK_STOPS,
  LIGHT_STOPS,
  strandHeightAt,
  voiceLevelAt,
} from '../../splash/synthWave';

export interface SynthWaveAvatarProps {
  phase: ConversationPhase;
  outputLevel?: number;
  muted?: boolean;
  size?: number;
  testID?: string;
}

const STRAND_COUNT = 9;
const POINT_COUNT = 24;

/**
 * Maps the conversation phase and output audio level into a target wave amplitude (0.0 .. 1.0).
 */
function getTargetAmplitude(
  phase: ConversationPhase,
  outputLevel?: number,
): number {
  if (phase === 'speaking') {
    const raw =
      typeof outputLevel === 'number' && !Number.isNaN(outputLevel)
        ? outputLevel
        : 0;
    // When Lafina speaks, the waveform comes vigorously alive (0.42 to 0.95)
    return Math.max(0.42, Math.min(0.95, raw > 0 ? 0.35 + raw * 0.65 : 0.65));
  }
  if (phase === 'thinking' || phase === 'tool_working') {
    return 0.28;
  }
  if (phase === 'listening') {
    return 0.14;
  }
  if (phase === 'connecting') {
    return 0.18;
  }
  // idle, ended, failed, restart_required
  return 0.08;
}

export const SynthWaveAvatar: React.FC<SynthWaveAvatarProps> = ({
  phase,
  outputLevel = 0,
  muted = false,
  size = 76,
  testID = 'synth-wave-avatar',
}) => {
  const {isDarkMode} = useTheme();
  const startRef = useRef(Date.now());

  const stops = useMemo(
    () => (isDarkMode ? DARK_STOPS : LIGHT_STOPS),
    [isDarkMode],
  );

  const halfHeight = size * 0.35;
  const middle = size / 2;

  const computeStrands = useCallback(
    (seconds: number, baseAmp: number): string[] => {
      let modulatedAmp = baseAmp;
      if (phase === 'speaking') {
        // Human syllable rhythm dynamics from synthWave
        modulatedAmp = Math.max(
          0.32,
          Math.min(1.0, baseAmp * (0.85 + 0.3 * voiceLevelAt(seconds))),
        );
      } else if (phase === 'thinking' || phase === 'tool_working') {
        modulatedAmp = baseAmp * (1 + 0.25 * Math.sin(seconds * 4));
      } else if (phase === 'listening') {
        modulatedAmp = baseAmp * (1 + 0.18 * Math.sin(seconds * 1.8));
      }

      const paths: string[] = [];
      for (let sIdx = 0; sIdx < STRAND_COUNT; sIdx += 1) {
        const strand = -1 + (2 * sIdx) / (STRAND_COUNT - 1);
        let path = '';
        for (let pIdx = 0; pIdx <= POINT_COUNT; pIdx += 1) {
          const x = pIdx / POINT_COUNT;
          const yNorm = strandHeightAt(x, strand, seconds, modulatedAmp);
          const px = x * size;
          const py = middle - yNorm * halfHeight;
          path += `${pIdx === 0 ? 'M' : ' L'}${px.toFixed(2)} ${py.toFixed(2)}`;
        }
        paths.push(path);
      }
      return paths;
    },
    [halfHeight, middle, phase, size],
  );

  const [strands, setStrands] = useState<string[]>(() =>
    computeStrands(0, getTargetAmplitude(phase, outputLevel)),
  );

  useEffect(() => {
    // In automated Jest test environments, avoid running background animation timers to prevent act() warnings
    if (process.env.NODE_ENV === 'test') {
      return undefined;
    }

    let raf = 0;
    let cancelled = false;
    let lastTime = 0;

    const tick = (nowMs: number): void => {
      if (cancelled) return;

      // Throttle to ~36 FPS (every 28ms) for silky-smooth motion while saving battery & CPU
      if (nowMs - lastTime >= 28) {
        lastTime = nowMs;
        const elapsed = (Date.now() - startRef.current) / 1000;
        const targetAmp = getTargetAmplitude(phase, outputLevel);
        const nextStrands = computeStrands(elapsed, targetAmp);
        setStrands(nextStrands);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [phase, outputLevel, computeStrands]);

  const centerIndex = Math.floor(STRAND_COUNT / 2);
  const centerStrand = strands[centerIndex] ?? '';

  const gradientId = useMemo(
    () => `synthWaveGrad_${Math.round(size)}_${isDarkMode ? 'dark' : 'light'}`,
    [size, isDarkMode],
  );

  const containerRadius = size / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: containerRadius,
          backgroundColor: isDarkMode ? '#14121E' : '#F6F3FC',
        },
      ]}
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        phase === 'speaking'
          ? 'Lafina is speaking'
          : phase === 'listening'
          ? 'Lafina is listening'
          : phase === 'thinking'
          ? 'Lafina is thinking'
          : 'Lafina voice waveform'
      }
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            {stops.map(([offset, colour]) => (
              <Stop key={offset} offset={offset} stopColor={colour} />
            ))}
          </LinearGradient>
        </Defs>

        {/* Thicker central glow strand */}
        {centerStrand ? (
          <Path
            d={centerStrand}
            stroke={`url(#${gradientId})`}
            strokeWidth={5}
            strokeOpacity={
              muted ? 0.1 : phase === 'speaking' ? (isDarkMode ? 0.35 : 0.25) : 0.15
            }
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}

        {/* Multi-strand high-definition synth waves */}
        {strands.map((d, index) =>
          d ? (
            <Path
              key={index}
              d={d}
              stroke={`url(#${gradientId})`}
              strokeWidth={1.5}
              strokeOpacity={
                muted
                  ? 0.25
                  : phase === 'speaking'
                  ? isDarkMode
                    ? 0.85
                    : 0.75
                  : isDarkMode
                  ? 0.55
                  : 0.42
              }
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null,
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
