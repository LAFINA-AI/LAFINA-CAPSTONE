import React, {useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';
import type {ConversationPhase} from '../../../cloud/voiceConversation/types';
import {useTheme} from '../../contexts/ThemeContext';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  DARK_STOPS,
  LIGHT_STOPS,
  strandHeightAt,
  voiceLevelAt,
} from '../../splash/synthWave';

export interface SynthWaveAvatarProps {
  phase: ConversationPhase;
  outputLevel?: number;
  userLevel?: number;
  muted?: boolean;
  size?: number;
  /**
   * The avatar is not on screen (for example a minimized call). It shows a
   * still frame and runs no animation loop.
   */
  paused?: boolean;
  testID?: string;
}

const STRAND_COUNT = 9;
const POINT_COUNT = 24;
/** ~25 frames a second: smooth at 76 px, and half the work of the old 36. */
const FRAME_MS = 40;
/** Share of the gap to the target amplitude closed each frame. */
const EASE = 0.35;

/** Phases where the wave moves; the others show one still frame. */
const MOVING = new Set<ConversationPhase>([
  'connecting',
  'listening',
  'thinking',
  'tool_working',
  'speaking',
]);

const finiteOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Maps the conversation phase and output audio level into a target wave amplitude (0.0 .. 1.0).
 */
function getTargetAmplitude(
  phase: ConversationPhase,
  outputLevel?: number,
): number {
  if (phase === 'speaking') {
    return Math.max(0.08, Math.min(0.95, finiteOr(outputLevel, 0)));
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

/** The amplitude the wave moves toward: the student's voice while listening. */
function targetFor(
  phase: ConversationPhase,
  muted: boolean,
  userLevel: number,
  outputLevel: number,
): number {
  if (phase === 'listening' && !muted) {
    return Math.max(0.08, Math.min(0.95, finiteOr(userLevel, 0)));
  }
  return getTargetAmplitude(phase, outputLevel);
}

/** Adds the speaking syllable rhythm and the thinking breath. */
function modulate(
  phase: ConversationPhase,
  seconds: number,
  amplitude: number,
): number {
  if (phase === 'speaking') {
    return Math.max(
      0.08,
      Math.min(1.0, amplitude * (0.85 + 0.3 * voiceLevelAt(seconds))),
    );
  }
  if (phase === 'thinking' || phase === 'tool_working') {
    return amplitude * (1 + 0.25 * Math.sin(seconds * 4));
  }
  return amplitude;
}

function buildStrands(seconds: number, amplitude: number, size: number) {
  const halfHeight = size * 0.35;
  const middle = size / 2;
  const paths: string[] = [];
  for (let sIdx = 0; sIdx < STRAND_COUNT; sIdx += 1) {
    const strand = -1 + (2 * sIdx) / (STRAND_COUNT - 1);
    let path = '';
    for (let pIdx = 0; pIdx <= POINT_COUNT; pIdx += 1) {
      const x = pIdx / POINT_COUNT;
      const yNorm = strandHeightAt(x, strand, seconds, amplitude);
      const px = x * size;
      const py = middle - yNorm * halfHeight;
      path += `${pIdx === 0 ? 'M' : ' L'}${px.toFixed(2)} ${py.toFixed(2)}`;
    }
    paths.push(path);
  }
  return paths;
}

export const SynthWaveAvatar: React.FC<SynthWaveAvatarProps> = React.memo(
  function SynthWaveAvatarView({
    phase,
    outputLevel = 0,
    userLevel = 0,
    muted = false,
    size = 76,
    paused = false,
    testID = 'synth-wave-avatar',
  }: SynthWaveAvatarProps) {
    const {isDarkMode, isModern, modernTheme, modernThemeExtras} = useTheme();
    const reducedMotion = useReducedMotion();
    const startRef = useRef(Date.now());

    // The loop reads the latest levels from here, so a level change (up to
    // 10 a second) never restarts it.
    const levelsRef = useRef({userLevel, outputLevel});
    levelsRef.current = {userLevel, outputLevel};

    const stops = useMemo(
      () =>
        isModern
          ? modernThemeExtras.synthWaveStops
          : isDarkMode
          ? DARK_STOPS
          : LIGHT_STOPS,
      [isModern, isDarkMode, modernThemeExtras.synthWaveStops],
    );

    const animated =
      !paused &&
      !reducedMotion &&
      MOVING.has(phase) &&
      // Jest: no background timers (they cause act() warnings).
      process.env.NODE_ENV !== 'test';

    const stillStrands = useMemo(
      () =>
        animated
          ? []
          : buildStrands(
              0,
              modulate(phase, 0, targetFor(phase, muted, userLevel, outputLevel)),
              size,
            ),
      [animated, phase, muted, userLevel, outputLevel, size],
    );

    const animatedSeedStrands = useMemo(
      () =>
        animated
          ? buildStrands(
              0,
              modulate(
                phase,
                0,
                targetFor(
                  phase,
                  muted,
                  levelsRef.current.userLevel,
                  levelsRef.current.outputLevel,
                ),
              ),
              size,
            )
          : null,
      [animated, phase, muted, size],
    );

    const [movingStrands, setMovingStrands] = useState<string[] | null>(null);

    useEffect(() => {
      if (!animated) {
        setMovingStrands(null);
        return undefined;
      }

      let raf = 0;
      let cancelled = false;
      let lastTime = 0;
      let eased = targetFor(
        phase,
        muted,
        levelsRef.current.userLevel,
        levelsRef.current.outputLevel,
      );

      const tick = (nowMs: number): void => {
        if (cancelled) return;
        if (nowMs - lastTime >= FRAME_MS) {
          lastTime = nowMs;
          const {userLevel: user, outputLevel: output} = levelsRef.current;
          eased += (targetFor(phase, muted, user, output) - eased) * EASE;
          const seconds = (Date.now() - startRef.current) / 1000;
          setMovingStrands(
            buildStrands(seconds, modulate(phase, seconds, eased), size),
          );
        }
        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }, [animated, phase, muted, size]);

    const strands = animated
      ? movingStrands ?? animatedSeedStrands ?? []
      : stillStrands;

    const centerIndex = Math.floor(STRAND_COUNT / 2);
    const centerStrand = strands[centerIndex] ?? '';

    const gradientId = useMemo(
      () =>
        `synthWaveGrad_${Math.round(size)}_${
          isDarkMode ? 'dark' : 'light'
        }_${modernTheme}`,
      [size, isDarkMode, modernTheme],
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
            backgroundColor: isModern
              ? modernThemeExtras.synthAvatarBg
              : isDarkMode
              ? '#14121E'
              : '#F6F3FC',
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
                muted
                  ? 0.1
                  : phase === 'speaking'
                  ? isDarkMode
                    ? 0.35
                    : 0.25
                  : 0.15
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
  },
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
