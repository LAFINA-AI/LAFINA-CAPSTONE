import {ANSWERED_CALL_LIMIT_MS} from '../../../scheduler/callLifecycle';
import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  BellRing,
  Check,
  Clock,
  Mic,
  PhoneCall,
  PhoneOff,
  Volume2,
} from 'lucide-react-native';
import type {CallResolution, CallState} from '../../../scheduler';
import {Fonts, Layout, ModernLayout, Shadows} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';

/** The button the student just tapped, while the app carries it out. */
export type CallPendingAction = 'acknowledge' | 'snooze' | 'end';

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
  /**
   * A line from the app itself, such as "No card was prepared". It stays in
   * view while the conversation keeps replacing LAFINA's reply.
   */
  notice?: string;
  onlineConversation?: React.ReactNode;
  /** The call is still being set up; the buttons cannot act yet. */
  busy?: boolean;
  /** A tap is being carried out. Shown at once, before the app answers. */
  pendingAction?: CallPendingAction | null;
  /** A planner change waiting for Confirm, asked for during the call. */
  reviewCard?: React.ReactNode;
}

/** Other snooze lengths offered next to the student's default. */
const SNOOZE_CHOICES = [5, 10, 15, 30] as const;

const formatCallDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return minutes + ':' + remainingSeconds;
};

/** How a reminder call ended: acknowledged, snoozed or missed. */
export const CallResultView: React.FC<{resolution: CallResolution}> = ({
  resolution,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const cardSurface = isModern ? modernPalette.card : colors.cardBg;
  const resolutionColor =
    resolution.outcome === 'acknowledged' ? colors.success : colors.warning;
  const title =
    resolution.outcome === 'acknowledged'
      ? 'Reminder acknowledged'
      : resolution.outcome === 'snoozed'
      ? 'Reminder snoozed'
      : 'Reminder missed';
  const icon =
    resolution.outcome === 'acknowledged' ? (
      <Check size={40} color={resolutionColor} strokeWidth={2.4} />
    ) : resolution.outcome === 'snoozed' ? (
      <Clock size={38} color={resolutionColor} strokeWidth={2.2} />
    ) : (
      <AlertTriangle size={38} color={resolutionColor} strokeWidth={2.2} />
    );

  return (
    <View
      style={styles.result}
      accessibilityLiveRegion="polite"
      testID="reminder-call-result"
    >
      <View
        style={[
          styles.resultIcon,
          {borderColor: resolutionColor, backgroundColor: cardSurface},
        ]}
      >
        {icon}
      </View>
      <Text style={[styles.resultTitle, {color: resolutionColor}]}>
        {title}
      </Text>
      <Text style={[styles.resultMessage, {color: colors.textSecondary}]}>
        {resolution.message}
      </Text>
    </View>
  );
};

/** Renders the answered reminder call and its result. */
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
  notice = '',
  onlineConversation,
  busy = false,
  pendingAction = null,
  reviewCard,
}) => {
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const callStartedAtRef = useRef(Date.now());
  const pulse = useRef(new Animated.Value(1)).current;
  const wavePhaseRef = useRef(0);
  const waveBars = useRef(
    Array.from(
      {length: 9},
      (_, index) => new Animated.Value(8 + (index % 4) * 6),
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
            toValue: 1.12,
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
      waveBars.forEach((bar, index) => bar.setValue(8 + (index % 4) * 6));
      return;
    }

    const interval = setInterval(() => {
      wavePhaseRef.current += 1;
      waveBars.forEach((bar, index) => {
        const nextHeight = 8 + ((index * 3 + wavePhaseRef.current * 2) % 6) * 6;
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

  const accent = isModern ? modernPalette.accent : colors.primary;
  const softSurface = isModern ? modernPalette.softViolet : colors.inputBg;
  const cardSurface = isModern ? modernPalette.card : colors.cardBg;
  const borderColor = isModern ? modernPalette.border : colors.border;
  const cardRadius = isModern
    ? ModernLayout.borderRadiusCard
    : Layout.borderRadiusCard;
  const cardShadow = isModern ? modernShadows.card : Shadows.card;
  const card = [
    styles.card,
    cardShadow,
    {backgroundColor: cardSurface, borderColor, borderRadius: cardRadius},
  ];

  const getBarColor = (index: number): string => {
    if (isModern) return index % 2 === 0 ? accent : modernPalette.periwinkle;
    if (index < 3) return colors.yellow;
    if (index < 6) return colors.red;
    return colors.blue;
  };

  // One tap settles the call: after it, or while the call is still being set
  // up, the buttons wait instead of looking tappable and doing nothing.
  const controlsEnabled = resolution === null && !busy && !pendingAction;
  const endEnabled = resolution === null && pendingAction !== 'end';

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
            {height: bar, backgroundColor: getBarColor(index)},
          ]}
        />
      ))}
    </View>
  );

  const renderStatus = (): React.ReactNode => {
    if (callState === 'speaking' || callState === 'speaking_listening') {
      return (
        <View style={styles.statusRow}>
          {renderWaveform()}
          <View style={styles.statusLabelRow}>
            <Volume2 size={16} color={accent} />
            <Text style={[styles.statusLabel, {color: accent}]}>
              {callState === 'speaking_listening'
                ? 'LAFINA is speaking. You can answer now'
                : 'LAFINA is speaking…'}
            </Text>
          </View>
        </View>
      );
    }

    if (callState === 'listening') {
      return (
        <View style={styles.statusRow}>
          <Animated.View
            style={[
              styles.statusIcon,
              {
                backgroundColor: softSurface,
                borderColor: accent,
                transform: [{scale: pulse}],
              },
            ]}
          >
            <Mic size={26} color={accent} />
          </Animated.View>
          <Text style={[styles.statusLabel, {color: accent}]}>
            Listening. Say “acknowledge” or “snooze”
          </Text>
        </View>
      );
    }

    if (callState === 'processing') {
      return (
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusIcon,
              {backgroundColor: softSurface, borderColor},
            ]}
          >
            <ActivityIndicator color={accent} />
          </View>
          <Text style={[styles.statusLabel, {color: colors.textSecondary}]}>
            Working on it…
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusIcon,
            {backgroundColor: softSurface, borderColor},
          ]}
        >
          <PhoneCall size={26} color={accent} />
        </View>
        <Text style={[styles.statusLabel, {color: colors.textSecondary}]}>
          Say “acknowledge” or “snooze”, or use the buttons
        </Text>
      </View>
    );
  };

  const renderResult = (): React.ReactNode =>
    resolution ? <CallResultView resolution={resolution} /> : null;

  const otherSnoozeChoices = SNOOZE_CHOICES.filter(
    minutes => minutes !== snoozeMinutes,
  );

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, {color: colors.textSecondary}]}>
          REMINDER CALL
        </Text>
        <Text style={[styles.assistantName, {color: colors.textPrimary}]}>
          LAFINA
        </Text>
        <View
          style={[
            styles.durationPill,
            {backgroundColor: softSurface, borderColor},
          ]}
        >
          <View
            style={[
              styles.connectionDot,
              {
                backgroundColor: resolution ? colors.textMuted : colors.success,
              },
            ]}
          />
          <Text style={[styles.duration, {color: colors.textPrimary}]}>
            {resolution ? 'Call ended' : 'On call'} ·{' '}
            {formatCallDuration(elapsedSeconds)} · Ends in{' '}
            {formatCallDuration(
              Math.max(0, ANSWERED_CALL_LIMIT_MS / 1000 - elapsedSeconds),
            )}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="reminder-call-body"
      >
        <View style={card}>
          <View style={styles.cardLabelRow}>
            <BellRing size={13} color={accent} />
            <Text style={[styles.cardLabel, {color: accent}]}>REMINDER</Text>
          </View>
          <Text style={[styles.taskText, {color: colors.textPrimary}]}>
            {task || 'Scheduled academic reminder'}
          </Text>
        </View>

        {resolution ? (
          renderResult()
        ) : (
          <>
            {/* A card that needs an answer sits in the open, directly under
                the reminder, never inside the small conversation box. */}
            {reviewCard ? (
              <View
                style={styles.reviewSlot}
                testID="reminder-call-review-slot"
              >
                <Text style={[styles.cardLabel, {color: accent}]}>
                  NEEDS YOUR CONFIRMATION
                </Text>
                {reviewCard}
              </View>
            ) : null}

            {notice ? (
              <View
                style={[
                  styles.notice,
                  {backgroundColor: softSurface, borderColor},
                ]}
                accessibilityLiveRegion="polite"
                testID="reminder-call-notice"
              >
                <Text style={[styles.noticeText, {color: colors.textPrimary}]}>
                  {notice}
                </Text>
              </View>
            ) : null}

            <View style={styles.statusArea}>
              {onlineConversation || renderStatus()}
            </View>

            {reply || transcript ? (
              <View style={card} testID="reminder-call-conversation">
                {reply ? (
                  <>
                    <Text style={[styles.cardLabel, {color: colors.textMuted}]}>
                      LAFINA
                    </Text>
                    <Text
                      style={[styles.replyText, {color: colors.textPrimary}]}
                    >
                      {reply}
                    </Text>
                  </>
                ) : null}
                {reply && transcript ? (
                  <View
                    style={[
                      styles.cardDivider,
                      {backgroundColor: colors.divider},
                    ]}
                  />
                ) : null}
                {transcript ? (
                  <>
                    <Text style={[styles.cardLabel, {color: colors.textMuted}]}>
                      YOU SAID
                    </Text>
                    <Text
                      style={[
                        styles.transcriptText,
                        {color: colors.textSecondary},
                      ]}
                    >
                      {transcript}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.controls}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={!controlsEnabled}
            onPress={onAcknowledge}
            style={[
              styles.actionButton,
              {backgroundColor: colors.success, borderColor: colors.success},
              !controlsEnabled &&
                pendingAction !== 'acknowledge' &&
                styles.disabledControl,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Acknowledge reminder"
            accessibilityHint="Marks the reminder as received and ends the call. The task itself is not marked done."
            accessibilityState={{
              disabled: !controlsEnabled,
              busy: pendingAction === 'acknowledge',
            }}
            testID="reminder-call-acknowledge"
          >
            {pendingAction === 'acknowledge' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Check size={18} color={colors.white} strokeWidth={2.6} />
            )}
            <Text style={[styles.actionText, {color: colors.white}]}>
              {pendingAction === 'acknowledge'
                ? 'Acknowledging…'
                : 'Acknowledge'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={!controlsEnabled}
            onPress={() => onSnooze(snoozeMinutes)}
            style={[
              styles.actionButton,
              {backgroundColor: cardSurface, borderColor},
              !controlsEnabled &&
                pendingAction !== 'snooze' &&
                styles.disabledControl,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              'Snooze reminder for ' + snoozeMinutes + ' minutes'
            }
            accessibilityState={{
              disabled: !controlsEnabled,
              busy: pendingAction === 'snooze',
            }}
            testID="reminder-call-snooze"
          >
            {pendingAction === 'snooze' ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <Clock size={18} color={accent} />
            )}
            <Text style={[styles.actionText, {color: colors.textPrimary}]}>
              {pendingAction === 'snooze'
                ? 'Snoozing…'
                : `Snooze ${snoozeMinutes}m`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.snoozeChoices}>
          <Text style={[styles.snoozeHint, {color: colors.textMuted}]}>
            Or snooze for
          </Text>
          {otherSnoozeChoices.map(minutes => (
            <TouchableOpacity
              key={minutes}
              activeOpacity={0.8}
              disabled={!controlsEnabled}
              onPress={() => onSnooze(minutes)}
              style={[
                styles.snoozeChip,
                {backgroundColor: softSurface, borderColor},
                !controlsEnabled && styles.disabledControl,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Snooze reminder for ${minutes} minutes`}
              accessibilityState={{disabled: !controlsEnabled}}
              testID={`reminder-call-snooze-${minutes}`}
            >
              <Text style={[styles.snoozeChipText, {color: accent}]}>
                {minutes}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          disabled={!endEnabled}
          onPress={onDecline}
          style={[
            styles.endButton,
            {backgroundColor: colors.error},
            !endEnabled && styles.disabledControl,
          ]}
          accessibilityRole="button"
          accessibilityLabel="End reminder call"
          accessibilityHint="Ends the call. The reminder counts as received."
          accessibilityState={{disabled: !endEnabled}}
          testID="reminder-call-end"
        >
          <PhoneOff size={18} color={colors.white} />
          <Text style={[styles.actionText, {color: colors.white}]}>
            End call
          </Text>
        </TouchableOpacity>
        <Text style={[styles.footnote, {color: colors.textMuted}]}>
          Ending the call counts the reminder as received.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  header: {
    alignItems: 'center',
    gap: 4,
  },
  eyebrow: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  assistantName: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 2,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  duration: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  body: {
    flex: 1,
    width: '100%',
    marginTop: 14,
  },
  bodyContent: {
    flexGrow: 1,
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    width: '100%',
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardLabel: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  taskText: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 2,
  },
  reviewSlot: {
    width: '100%',
    gap: 6,
  },
  notice: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  statusArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  statusRow: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformContainer: {
    height: 48,
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
    gap: 6,
  },
  statusLabel: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  replyText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
  },
  transcriptText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  result: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  resultIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  resultTitle: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  resultMessage: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  controls: {
    width: '100%',
    gap: 10,
    paddingTop: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  actionText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: '700',
  },
  snoozeChoices: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  snoozeHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  snoozeChip: {
    minWidth: 52,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  snoozeChipText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '700',
  },
  endButton: {
    minHeight: 52,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footnote: {
    fontFamily: Fonts.body,
    fontSize: 11,
    textAlign: 'center',
  },
  disabledControl: {
    opacity: 0.4,
  },
});
