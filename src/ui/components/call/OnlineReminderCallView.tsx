import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowRight,
  AudioLines,
  BellRing,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneOff,
  Square,
} from 'lucide-react-native';
import {ANSWERED_CALL_LIMIT_MS} from '../../../scheduler/callLifecycle';
import type {CallResolution, CallState} from '../../../scheduler';
import type {
  ConversationPhase,
  ConversationSnapshot,
} from '../../../cloud/voiceConversation';
import {Fonts, Layout, ModernLayout, Shadows} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {SynthWaveAvatar} from '../callLafina/SynthWaveAvatar';
import {CallWaveform} from '../callLafina/CallWaveform';
import {CallResultView} from './CallAnsweredView';
import type {CallPendingAction} from './CallAnsweredView';

interface OnlineReminderCallViewProps {
  task: string;
  /** The online conversation's latest state; null until it is mounted. */
  snapshot: ConversationSnapshot | null;
  /** The scheduler's call state ("speaking" while the reminder is read). */
  callState: CallState;
  resolution: CallResolution | null;
  reply: string;
  transcript: string;
  notice?: string;
  pendingAction?: CallPendingAction | null;
  reviewCard?: React.ReactNode;
  onToggleMute: () => void;
  onStopResponse: () => void;
  /** Sends a typed turn; resolves true when LAFINA received it. */
  onSendText: (text: string) => Promise<boolean>;
  onEnd: () => void;
}

const LIVE_PHASES: ReadonlySet<ConversationPhase> = new Set([
  'listening',
  'thinking',
  'tool_working',
  'speaking',
]);

const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  return minutes + ':' + (safe % 60).toString().padStart(2, '0');
};

/**
 * The answered reminder call while Online Mode is on, drawn like Call LAFINA:
 * the live avatar, a timer, the waveform and a Mute / Type / Stop / End dock.
 * There are no Acknowledge or Snooze buttons. The student talks ("call me back
 * in 15 minutes", "got it") or hangs up, and hanging up counts the reminder as
 * received. The offline call keeps its buttons (CallAnsweredView).
 */
export const OnlineReminderCallView: React.FC<OnlineReminderCallViewProps> = ({
  task,
  snapshot,
  callState,
  resolution,
  reply,
  transcript,
  notice = '',
  pendingAction = null,
  reviewCard,
  onToggleMute,
  onStopResponse,
  onSendText,
  onEnd,
}) => {
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(Date.now());
  const [showTyping, setShowTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (resolution) return;
    const startedAt = startedAtRef.current;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [resolution]);

  const phase = snapshot?.phase ?? 'idle';
  const live = LIVE_PHASES.has(phase) && !resolution;
  const muted = !!snapshot?.muted;
  // Before the conversation connects, the app itself reads the reminder.
  const announcing =
    !live &&
    !resolution &&
    (callState === 'speaking' || callState === 'speaking_listening');
  const avatarPhase: ConversationPhase = announcing
    ? 'speaking'
    : live
    ? phase
    : 'connecting';

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

  const statusText = (() => {
    if (pendingAction === 'end') return 'Ending the call…';
    if (pendingAction) return 'Wrapping up…';
    if (announcing) return 'LAFINA is reading your reminder…';
    if (!live) return 'Connecting to LAFINA…';
    if (muted) return 'Muted. LAFINA cannot hear you';
    if (phase === 'tool_working') return snapshot?.toolPhrase || 'Working…';
    if (phase === 'thinking') return 'Thinking…';
    if (phase === 'speaking') return 'Speaking. Talk to interrupt';
    return 'Listening. Talk whenever you’re ready';
  })();

  const controlsEnabled = live && !pendingAction;
  const endEnabled = !resolution && pendingAction !== 'end';
  const pillLabel = muted && live ? 'Muted' : live ? 'Online' : 'Connecting';

  const send = async (): Promise<void> => {
    const text = typed.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (await onSendText(text)) setTyped('');
    } finally {
      setSending(false);
    }
  };

  return (
    <View
      style={[styles.container, {backgroundColor: colors.background}]}
      testID="online-reminder-call-view"
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, {color: colors.textSecondary}]}>
          REMINDER CALL
        </Text>
        <Text style={[styles.assistantName, {color: colors.textPrimary}]}>
          LAFINA
        </Text>
        <View
          style={[
            styles.pill,
            {backgroundColor: softSurface, borderColor},
            isModern && {borderRadius: ModernLayout.borderRadiusPill},
          ]}
          testID="online-reminder-call-badge"
        >
          {muted && live ? (
            <MicOff size={12} color={colors.warning} />
          ) : live ? (
            <AudioLines size={12} color={accent} />
          ) : (
            <ActivityIndicator size="small" color={accent} />
          )}
          <Text
            style={[
              styles.pillText,
              {color: muted && live ? colors.warning : accent},
            ]}
          >
            {resolution ? 'Call ended' : pillLabel}
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
          <CallResultView resolution={resolution} />
        ) : (
          <>
            <View style={styles.centerStage} testID="online-reminder-stage">
              <View
                style={[
                  styles.avatarRing,
                  reviewCard ? styles.avatarRingCompact : null,
                  {
                    borderColor: live
                      ? muted
                        ? colors.warning
                        : accent
                      : announcing
                      ? accent
                      : borderColor,
                  },
                ]}
              >
                <SynthWaveAvatar
                  phase={avatarPhase}
                  outputLevel={snapshot?.outputLevel ?? 0}
                  userLevel={snapshot?.level ?? 0}
                  muted={muted}
                  size={reviewCard ? 48 : 76}
                />
              </View>
              <Text
                style={[styles.timerText, {color: colors.textPrimary}]}
                testID="online-reminder-call-timer"
              >
                {formatClock(elapsedSeconds)}
              </Text>
              <Text style={[styles.endsIn, {color: colors.textMuted}]}>
                Ends in{' '}
                {formatClock(ANSWERED_CALL_LIMIT_MS / 1000 - elapsedSeconds)}
              </Text>
              <Text
                style={[
                  styles.status,
                  {color: live || announcing ? accent : colors.textSecondary},
                ]}
                accessibilityLiveRegion="polite"
                testID="online-reminder-call-status"
              >
                {statusText}
              </Text>
              {live && !reviewCard ? (
                <CallWaveform
                  phase={phase}
                  muted={muted}
                  micCapturing={!!snapshot?.micCapturing}
                  userLevel={snapshot?.level ?? 0}
                  outputLevel={snapshot?.outputLevel ?? 0}
                  activeTool={snapshot?.toolPhrase ?? null}
                  showStatusText={false}
                />
              ) : null}
            </View>

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

            {showTyping ? (
              <View
                style={[
                  styles.inputRow,
                  {backgroundColor: softSurface, borderColor},
                  isModern && {borderRadius: ModernLayout.borderRadiusPill},
                ]}
              >
                <TextInput
                  style={[styles.input, {color: colors.textPrimary}]}
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="Type instead, e.g. call me back in 15 minutes"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={500}
                  editable={controlsEnabled}
                  onSubmitEditing={() => void send()}
                  accessibilityLabel="Type a message to LAFINA"
                  testID="online-reminder-call-input"
                />
                <TouchableOpacity
                  style={[styles.sendButton, {backgroundColor: accent}]}
                  onPress={() => void send()}
                  disabled={!controlsEnabled || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Send typed message"
                  testID="online-reminder-call-send"
                >
                  {sending ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <ArrowRight size={16} color={colors.white} />
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.dock} testID="online-reminder-call-dock">
        <View style={styles.controls}>
          <DockButton
            label={muted ? 'Unmute' : 'Mute'}
            icon={
              muted ? (
                <MicOff size={22} color={colors.warning} />
              ) : (
                <Mic size={22} color={colors.textPrimary} />
              )
            }
            color={softSurface}
            ring={muted ? colors.warning : softSurface}
            labelColor={muted ? colors.warning : colors.textPrimary}
            onPress={onToggleMute}
            disabled={!controlsEnabled}
            accessibilityLabel={
              muted ? 'Unmute reminder call' : 'Mute reminder call'
            }
            testID="online-reminder-call-mute"
          />
          <DockButton
            label={showTyping ? 'Voice' : 'Type'}
            icon={<MessageSquareText size={22} color={colors.textPrimary} />}
            color={showTyping ? accent + '26' : softSurface}
            ring={showTyping ? accent : softSurface}
            labelColor={colors.textPrimary}
            onPress={() => setShowTyping(previous => !previous)}
            disabled={!controlsEnabled}
            accessibilityLabel={
              showTyping ? 'Hide typing' : 'Type instead of speaking'
            }
            testID="online-reminder-call-type"
          />
          <DockButton
            label="Stop"
            icon={<Square size={20} color={colors.textPrimary} />}
            color={softSurface}
            ring={softSurface}
            labelColor={colors.textPrimary}
            onPress={onStopResponse}
            disabled={!controlsEnabled || phase !== 'speaking'}
            accessibilityLabel="Stop LAFINA's answer"
            testID="online-reminder-call-stop"
          />
          <DockButton
            label="End"
            icon={
              pendingAction === 'end' ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <PhoneOff size={22} color={colors.white} />
              )
            }
            color={colors.error}
            ring={colors.error}
            labelColor={colors.error}
            onPress={onEnd}
            disabled={!endEnabled}
            accessibilityLabel="End reminder call"
            accessibilityHint="Hangs up. The reminder counts as received."
            testID="reminder-call-end"
          />
        </View>
        <Text
          style={[styles.footnote, {color: colors.textMuted}]}
          testID="online-reminder-call-hint"
        >
          Need more time? Say “call me back in 15 minutes”. Hanging up counts
          the reminder as received.
        </Text>
      </View>
    </View>
  );
};

const DockButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  color: string;
  ring: string;
  labelColor: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID: string;
}> = ({
  label,
  icon,
  color,
  ring,
  labelColor,
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}) => (
  <TouchableOpacity
    style={[styles.control, disabled && styles.disabled]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
    accessibilityState={{disabled}}
    testID={testID}
  >
    <View
      style={[
        styles.controlCircle,
        {backgroundColor: color, borderColor: ring},
      ]}
    >
      {icon}
    </View>
    <Text style={[styles.controlText, {color: labelColor}]} numberOfLines={1}>
      {label}
    </Text>
  </TouchableOpacity>
);

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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 2,
  },
  pillText: {fontFamily: Fonts.body, fontSize: 11, fontWeight: '700'},
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
  centerStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
    width: '100%',
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarRingCompact: {width: 56, height: 56, borderRadius: 28, borderWidth: 2},
  timerText: {
    fontFamily: Fonts.heading,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  endsIn: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  status: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
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
  inputRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 6,
    height: 48,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    paddingVertical: 0,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dock: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
  },
  controls: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
  },
  control: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  controlCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: {fontFamily: Fonts.body, fontSize: 12, fontWeight: '600'},
  disabled: {opacity: 0.45},
  footnote: {
    fontFamily: Fonts.body,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
