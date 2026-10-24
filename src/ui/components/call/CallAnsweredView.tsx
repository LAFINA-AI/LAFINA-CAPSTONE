import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Check,
  Clock,
  Mic,
  PhoneOff,
  PhoneCall,
  Volume2,
} from 'lucide-react-native';
import type { CallResolution, CallState } from '../../../scheduler';
import { Fonts, Layout, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

const lafinaLogo = require('../../../assets/lafina_default_logo.png');

interface CallAnsweredViewProps {
  task: string;
  callState: CallState;
  resolution: CallResolution | null;
  snoozeMinutes: number;
  onSnooze: (minutes: number) => void;
  onAcknowledge: () => void;
  onDecline: () => void;
  transcript: string;
  reply: string;
}

const formatCallDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return minutes + ':' + remainingSeconds;
};

/** Renders the connected offline reminder call and its terminal result state. */
export const CallAnsweredView: React.FC<CallAnsweredViewProps> = ({
  task,
  callState,
  resolution,
  snoozeMinutes,
  onSnooze,
  onAcknowledge,
  onDecline,
  transcript,
  reply,
}) => {
  const { isDarkMode, colors } = useTheme();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const callStartedAtRef = useRef(Date.now());
  const pulse = useRef(new Animated.Value(1)).current;
  const wavePhaseRef = useRef(0);
  const waveBars = useRef(
    Array.from(
      { length: 11 },
      (_, index) => new Animated.Value(10 + (index % 4) * 7),
    ),
  ).current;

  useEffect(() => {
    if (resolution) return;

    const startedAt = callStartedAtRef.current;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [resolution]);

  useEffect(() => {
    let pulseAnimation: Animated.CompositeAnimation | null = null;
    if (callState === 'listening' && !resolution) {
      pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.16,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseAnimation.start();
    } else {
      pulse.setValue(1);
    }

    return () => pulseAnimation?.stop();
  }, [callState, pulse, resolution]);

  useEffect(() => {
    const waveformActive =
      !resolution &&
      (callState === 'speaking' ||
        callState === 'speaking_listening' ||
        callState === 'listening');

    if (!waveformActive) {
      waveBars.forEach((bar, index) => bar.setValue(10 + (index % 4) * 7));
      return;
    }

    const interval = setInterval(() => {
      wavePhaseRef.current += 1;
      waveBars.forEach((bar, index) => {
        const nextHeight =
          10 + ((index * 3 + wavePhaseRef.current * 2) % 6) * 7;
        Animated.timing(bar, {
          toValue: nextHeight,
          duration: 180,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }).start();
      });
    }, 220);

    return () => clearInterval(interval);
  }, [callState, resolution, waveBars]);

  const getBarColor = (index: number): string => {
    if (index < 4) return colors.yellow;
    if (index < 8) return colors.red;
    return colors.blue;
  };

  const resolutionColor =
    resolution?.outcome === 'missed'
      ? colors.warning
      : resolution?.outcome === 'snoozed'
      ? colors.yellow
      : colors.success;
  const controlsEnabled = resolution === null;

  const themed = {
    container: { backgroundColor: colors.background },
    primaryText: { color: colors.textPrimary },
    secondaryText: { color: colors.textSecondary },
    mutedText: { color: colors.textMuted },
    card: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
    },
    divider: { backgroundColor: colors.divider },
    statusSurface: {
      backgroundColor: isDarkMode
        ? 'rgba(255, 255, 255, 0.06)'
        : 'rgba(230, 0, 58, 0.06)',
      borderColor: isDarkMode
        ? 'rgba(255, 255, 255, 0.10)'
        : 'rgba(230, 0, 58, 0.12)',
    },
    compactAction: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
    },
  };

  const renderWaveform = (): React.ReactNode => (
    <View
      style={styles.waveformContainer}
      accessibilityLabel="LAFINA voice activity"
    >
      {waveBars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.waveformBar,
            { height: bar, backgroundColor: getBarColor(index) },
          ]}
        />
      ))}
    </View>
  );

  const renderStatusVisual = (): React.ReactNode => {
    if (resolution) {
      const title =
        resolution.outcome === 'acknowledged'
          ? 'REMINDER ACKNOWLEDGED'
          : resolution.outcome === 'snoozed'
          ? 'REMINDER SNOOZED'
          : 'REMINDER MISSED';
      const icon =
        resolution.outcome === 'acknowledged' ? (
          <Check size={42} color={resolutionColor} strokeWidth={2.4} />
        ) : resolution.outcome === 'snoozed' ? (
          <Clock size={40} color={resolutionColor} strokeWidth={2.2} />
        ) : (
          <AlertTriangle size={40} color={resolutionColor} strokeWidth={2.2} />
        );

      return (
        <View style={styles.statusVisual}>
          <View style={[styles.resultIcon, { borderColor: resolutionColor }]}>
            {icon}
          </View>
          <Text style={[styles.resultTitle, { color: resolutionColor }]}>
            {title}
          </Text>
          <Text style={[styles.resultMessage, themed.secondaryText]}>
            {resolution.message}
          </Text>
        </View>
      );
    }

    if (callState === 'speaking' || callState === 'speaking_listening') {
      return (
        <View style={styles.statusVisual}>
          {renderWaveform()}
          <View style={styles.statusLabelRow}>
            <Volume2 size={17} color={colors.blue} />
            <Text style={[styles.statusLabel, { color: colors.blue }]}>
              {callState === 'speaking_listening'
                ? 'LAFINA is speaking - you can respond now'
                : 'LAFINA is speaking...'}
            </Text>
          </View>
        </View>
      );
    }

    if (callState === 'listening') {
      return (
        <View style={styles.statusVisual}>
          <Animated.View
            style={[
              styles.listeningSurface,
              themed.statusSurface,
              { transform: [{ scale: pulse }] },
            ]}
          >
            <Mic size={38} color={colors.red} />
          </Animated.View>
          {renderWaveform()}
          <Text style={[styles.statusLabel, { color: colors.red }]}>
            Listening for your response...
          </Text>
        </View>
      );
    }

    if (callState === 'processing') {
      return (
        <View style={styles.statusVisual}>
          <View style={[styles.processingSurface, themed.statusSurface]}>
            <ActivityIndicator size="large" color={colors.blue} />
          </View>
          <Text style={[styles.statusLabel, themed.secondaryText]}>
            Processing on this device...
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.statusVisual}>
        <View style={[styles.connectedSurface, themed.statusSurface]}>
          <PhoneCall size={38} color={colors.blue} />
        </View>
        <Text style={[styles.statusLabel, themed.secondaryText]}>
          Say Acknowledge or Snooze at any time
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, themed.container]}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, themed.secondaryText]}>
          ACTIVE SCHEDULED CALL
        </Text>
        <View style={styles.identityRow}>
          <Image
            source={lafinaLogo}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={[styles.assistantName, themed.primaryText]}>
            LAFINA Assistant
          </Text>
        </View>
        <View style={styles.connectionRow}>
          <View
            style={[styles.connectionDot, { backgroundColor: colors.success }]}
          />
          <Text style={[styles.duration, { color: colors.success }]}>
            {formatCallDuration(elapsedSeconds)}
          </Text>
        </View>
      </View>

      <View style={styles.visualArea}>{renderStatusVisual()}</View>

      <View style={[styles.transcriptCard, themed.card]}>
        <Text style={[styles.cardLabel, themed.mutedText]}>REMINDER</Text>
        <Text style={[styles.taskText, themed.primaryText]}>
          {task || 'Scheduled academic reminder'}
        </Text>

        {reply ? (
          <>
            <View style={[styles.cardDivider, themed.divider]} />
            <Text style={[styles.cardLabel, themed.mutedText]}>LAFINA</Text>
            <Text style={[styles.replyText, themed.primaryText]}>{reply}</Text>
          </>
        ) : null}

        {callState === 'listening' || transcript ? (
          <>
            <View style={[styles.cardDivider, themed.divider]} />
            <Text style={[styles.cardLabel, themed.mutedText]}>
              YOUR RESPONSE
            </Text>
            <Text style={[styles.transcriptText, themed.secondaryText]}>
              {transcript || 'Listening... Say "acknowledge" or "snooze".'}
            </Text>
          </>
        ) : null}
      </View>

      <View style={styles.controls}>
        <View style={styles.primaryControls}>
          <View style={styles.controlColumn}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!controlsEnabled}
              onPress={onDecline}
              style={[
                styles.roundControl,
                { backgroundColor: colors.error },
                !controlsEnabled && styles.disabledControl,
              ]}
              accessibilityRole="button"
              accessibilityLabel="End reminder call"
              accessibilityState={{ disabled: !controlsEnabled }}
            >
              <PhoneOff size={30} color={colors.white} />
            </TouchableOpacity>
            <Text style={[styles.controlLabel, themed.secondaryText]}>
              End call
            </Text>
          </View>
        </View>

        <View style={styles.compactActions}>
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={!controlsEnabled}
            onPress={onAcknowledge}
            style={[
              styles.compactAction,
              themed.compactAction,
              !controlsEnabled && styles.disabledControl,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Acknowledge reminder"
            accessibilityState={{ disabled: !controlsEnabled }}
          >
            <Check size={18} color={colors.success} />
            <Text style={[styles.compactActionText, themed.primaryText]}>
              Acknowledge
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            disabled={!controlsEnabled}
            onPress={() => onSnooze(snoozeMinutes)}
            style={[
              styles.compactAction,
              themed.compactAction,
              !controlsEnabled && styles.disabledControl,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              'Snooze reminder for ' + snoozeMinutes + ' minutes'
            }
            accessibilityState={{ disabled: !controlsEnabled }}
          >
            <Clock size={18} color={colors.yellow} />
            <Text style={[styles.compactActionText, themed.primaryText]}>
              Snooze {snoozeMinutes}m
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
  },
  eyebrow: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  headerLogo: {
    width: 42,
    height: 24,
    marginRight: 8,
  },
  assistantName: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    fontWeight: '700',
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  duration: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  visualArea: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  waveformContainer: {
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformBar: {
    width: 5,
    borderRadius: 3,
    marginHorizontal: 3,
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  statusLabel: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
    textAlign: 'center',
  },
  listeningSurface: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  processingSurface: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  connectedSurface: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  resultIcon: {
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  resultTitle: {
    fontFamily: Fonts.heading,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  resultMessage: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
  },
  transcriptCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Layout.borderRadiusCard,
    padding: 16,
    minHeight: 104,
    ...Shadows.card,
  },
  cardLabel: {
    fontFamily: Fonts.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  taskText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 5,
  },
  cardDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  replyText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  transcriptText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    marginTop: 4,
  },
  controls: {
    width: '100%',
    marginTop: 18,
  },
  primaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
  },
  controlColumn: {
    width: 138,
    alignItems: 'center',
  },
  roundControl: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  controlLabel: {
    fontFamily: Fonts.body,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
    minHeight: 30,
  },
  compactActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  compactAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactActionText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 7,
  },
  disabledControl: {
    opacity: 0.38,
  },
});
