import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {ConversationPhase} from '../../../cloud/voiceConversation/types';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize} from '../../theme';

export interface CallWaveformProps {
  phase: ConversationPhase;
  muted: boolean;
  micCapturing: boolean;
  userLevel: number;
  outputLevel: number;
  activeTool?: string | null;
  hasReviewItem?: boolean;
  reduceMotion?: boolean;
  testID?: string;
}

const ASSISTANT_MULTIPLIERS = [0.35, 0.55, 0.75, 0.95, 1.0, 0.95, 0.75, 0.55, 0.35];
const USER_MULTIPLIERS = [0.4, 0.75, 1.0, 0.75, 0.4];

export function getTruthfulStateText(props: {
  phase: ConversationPhase;
  muted: boolean;
  userLevel: number;
  hasReviewItem?: boolean;
  activeTool?: string | null;
}): string {
  const {phase, muted, userLevel, hasReviewItem, activeTool} = props;
  const isActive =
    phase === 'listening' ||
    phase === 'speaking' ||
    phase === 'thinking' ||
    phase === 'tool_working';

  if (phase === 'connecting') return 'Connecting…';
  if (muted && isActive) return 'Muted. LAFINA cannot hear you';
  if (hasReviewItem && (phase === 'listening' || phase === 'idle'))
    return 'Waiting for confirmation';
  if (phase === 'tool_working') {
    return activeTool ? `Working on ${activeTool}…` : 'Working…';
  }
  if (phase === 'thinking') return 'Thinking…';
  if (phase === 'speaking') return 'Speaking. Talk to interrupt';
  if (phase === 'listening') {
    return userLevel > 0.08
      ? 'Listening to you…'
      : 'Listening. Pause whenever you like';
  }
  if (phase === 'restart_required') return 'Call stopped';
  if (phase === 'ended') return 'Call ended';
  if (phase === 'failed') return 'Call Lafina unavailable';
  return 'Talk with LAFINA naturally, hands-free';
}

export const CallWaveform: React.FC<CallWaveformProps> = ({
  phase,
  muted,
  micCapturing,
  userLevel,
  outputLevel,
  activeTool,
  hasReviewItem = false,
  reduceMotion: reduceMotionProp,
  testID = 'call-waveform-area',
}) => {
  const {colors} = useTheme();
  const [deviceReduceMotion, setDeviceReduceMotion] = useState(false);
  const isReducedMotion = reduceMotionProp ?? deviceReduceMotion;

  // Subtle pulse animation for thinking / tool working
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (mounted) setDeviceReduceMotion(enabled);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      enabled => {
        if (mounted) setDeviceReduceMotion(enabled);
      },
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (isReducedMotion) {
      pulseAnim.setValue(0.7);
      return;
    }
    if (phase === 'thinking' || phase === 'tool_working') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.35,
            duration: 650,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(0.4);
    }
  }, [phase, isReducedMotion, pulseAnim]);

  const isSpeaking = phase === 'speaking';
  const effectiveOutputLevel = isSpeaking
    ? Math.max(0.12, Math.min(1.0, outputLevel))
    : 0;

  const isUserActive = micCapturing && !muted;
  const effectiveUserLevel = isUserActive
    ? Math.max(0, Math.min(1.0, userLevel))
    : 0;

  const stateText = getTruthfulStateText({
    phase,
    muted,
    userLevel: effectiveUserLevel,
    hasReviewItem,
    activeTool,
  });

  return (
    <View style={styles.container} testID={testID}>
      {/* 1. Assistant Audio Waveform Area (Prominent Central) */}
      <View
        style={styles.assistantWaveformBox}
        testID={
          isSpeaking
            ? 'call-assistant-waveform-speaking'
            : 'call-assistant-waveform-idle'
        }
        accessible={true}
        accessibilityRole="progressbar"
        accessibilityLabel={
          isSpeaking
            ? 'Lafina is speaking'
            : phase === 'thinking'
            ? 'Lafina is thinking'
            : phase === 'tool_working'
            ? 'Lafina is working on an action'
            : 'Lafina is waiting'
        }
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(effectiveOutputLevel * 100),
        }}>
        {ASSISTANT_MULTIPLIERS.map((mul, idx) => {
          const barHeight = isSpeaking
            ? Math.round(
                Math.max(6, Math.min(48, 6 + effectiveOutputLevel * 42 * mul)),
              )
            : 4;
          return (
            <View
              key={`ast-bar-${idx}`}
              testID={`assistant-waveform-bar-${idx}`}
              style={[
                styles.assistantBar,
                {
                  height: barHeight,
                  backgroundColor: isSpeaking
                    ? colors.primary
                    : colors.border,
                  opacity: isSpeaking ? 0.95 : 0.35,
                },
              ]}
            />
          );
        })}
      </View>

      {/* 2. Distinct Non-Audio Status Pulse (Thinking / Tool Working) */}
      {phase === 'thinking' && (
        <Animated.View
          style={[styles.thinkingIndicatorBox, {opacity: pulseAnim}]}
          testID="call-thinking-indicator">
          <View
            style={[styles.thinkingDot, {backgroundColor: colors.primary}]}
          />
          <View
            style={[
              styles.thinkingDot,
              {backgroundColor: colors.primary, marginHorizontal: 6},
            ]}
          />
          <View
            style={[styles.thinkingDot, {backgroundColor: colors.primary}]}
          />
        </Animated.View>
      )}

      {phase === 'tool_working' && (
        <Animated.View
          style={[styles.toolWorkingIndicatorBox, {opacity: pulseAnim}]}
          testID="call-tool-working-indicator">
          <View
            style={[styles.toolWorkingPill, {borderColor: colors.primary}]}>
            <View
              style={[styles.thinkingDot, {backgroundColor: colors.primary}]}
            />
            <Text
              style={[styles.toolWorkingText, {color: colors.textPrimary}]}>
              {activeTool ? `Checking ${activeTool}` : 'Working…'}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* 3. Truthful Concise State Line */}
      <Text
        style={[styles.stateText, {color: colors.textMuted}]}
        testID="call-waveform-status-text"
        accessibilityLiveRegion="polite">
        {stateText}
      </Text>

      {/* 4. User Input Waveform (Secondary Micro-meter) */}
      <View
        style={styles.userWaveformBox}
        testID="call-user-waveform"
        accessible={true}
        accessibilityLabel={
          muted
            ? 'Microphone is muted'
            : isUserActive
            ? 'Microphone active'
            : 'Microphone idle'
        }
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(effectiveUserLevel * 100),
        }}>
        {muted ? (
          <View
            style={[styles.userMutedLine, {backgroundColor: colors.error}]}
            testID="call-user-waveform-muted"
          />
        ) : !micCapturing ? (
          <View
            style={[
              styles.userIdleDot,
              {backgroundColor: colors.textMuted, opacity: 0.3},
            ]}
            testID="call-user-waveform-idle"
          />
        ) : (
          <View
            style={styles.userBarsRow}
            testID="call-user-waveform-active">
            {USER_MULTIPLIERS.map((mul, idx) => {
              const uHeight =
                effectiveUserLevel > 0.04
                  ? Math.round(
                      Math.max(
                        3,
                        Math.min(16, 3 + effectiveUserLevel * 13 * mul),
                      ),
                    )
                  : 3;
              return (
                <View
                  key={`usr-bar-${idx}`}
                  testID={`user-waveform-bar-${idx}`}
                  style={[
                    styles.userBar,
                    {
                      height: uHeight,
                      backgroundColor:
                        effectiveUserLevel > 0.04
                          ? colors.primary
                          : colors.textMuted,
                      opacity: effectiveUserLevel > 0.04 ? 0.9 : 0.35,
                    },
                  ]}
                />
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    width: '100%',
  },
  assistantWaveformBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    width: '100%',
    paddingHorizontal: 20,
  },
  assistantBar: {
    width: 4,
    borderRadius: 2,
    marginHorizontal: 3,
  },
  thinkingIndicatorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    height: 14,
  },
  thinkingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  toolWorkingIndicatorBox: {
    marginTop: 6,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolWorkingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  toolWorkingText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginLeft: 6,
  },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    minHeight: 18,
  },
  userWaveformBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 20,
    marginTop: 6,
    minWidth: 60,
  },
  userMutedLine: {
    width: 40,
    height: 2,
    borderRadius: 1,
    opacity: 0.8,
  },
  userIdleDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  userBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 20,
  },
  userBar: {
    width: 3,
    borderRadius: 1.5,
    marginHorizontal: 2,
  },
});
