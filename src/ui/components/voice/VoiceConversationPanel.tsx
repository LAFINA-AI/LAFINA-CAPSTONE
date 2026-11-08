import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  CircleAlert,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Square,
} from 'lucide-react-native';
import {Fonts} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import {chatOrchestrator} from '../../../ai/chatOrchestrator';
import {enableOnlineMode, voiceConsent} from '../../../cloud/voiceConversation';
import type {
  ConversationPhase,
  ConversationSnapshot,
  VoiceConversationDeps,
} from '../../../cloud/voiceConversation';
import {useVoiceConversation} from '../../hooks/useVoiceConversation';
import type {CommandReviewState} from '../../hooks/useCommandReview';
import {CommandReviewCard} from '../chat/CommandReviewCard';

export interface VoiceConversationPanelProps {
  userId: string;
  /** The voice sheet's review card; proposals from spoken turns wait here. */
  review: CommandReviewState;
  /** Back to push-to-talk (ends any running conversation). */
  onBack: () => void;
  /** Tests inject fakes. */
  deps?: (userId: string) => VoiceConversationDeps;
}

const PHASE_TEXT: Record<ConversationPhase, string> = {
  idle: 'Talk with LAFINA naturally, hands-free',
  connecting: 'Connecting…',
  listening: 'Listening. Pause whenever you like',
  thinking: 'Thinking…',
  speaking: 'Speaking. Talk to interrupt',
  restart_required: 'Conversation stopped',
  ended: 'Conversation ended',
  failed: 'Voice conversation unavailable',
};

const statusLine = (snapshot: ConversationSnapshot) =>
  snapshot.muted &&
  (snapshot.phase === 'listening' ||
    snapshot.phase === 'speaking' ||
    snapshot.phase === 'thinking')
    ? 'Muted. LAFINA cannot hear you'
    : PHASE_TEXT[snapshot.phase];

const LIVE = new Set<ConversationPhase>(['listening', 'thinking', 'speaking']);

export const VoiceConversationPanel: React.FC<VoiceConversationPanelProps> = ({
  userId,
  review,
  onBack,
  deps,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [localNote, setLocalNote] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [showTyping, setShowTyping] = useState(false);
  const [consented, setConsented] = useState(() => voiceConsent.read(userId));
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const turnTicket = useRef(0);
  const ownerRef = useRef(userId);
  ownerRef.current = userId;

  // A finished spoken turn is also read on the device: a planner change
  // becomes a review card (nothing is saved until Confirm), and a schedule
  // question gets the on-device answer next to the spoken one.
  const onFinalUserText = useCallback((text: string) => {
    const ticket = ++turnTicket.current;
    const owner = ownerRef.current;
    void chatOrchestrator
      .reviewSpokenTurn(owner, text)
      .then(result => {
        if (ticket !== turnTicket.current || owner !== ownerRef.current) return;
        if (result.kind === 'proposal') {
          reviewRef.current.present(result.review);
          setLocalNote(
            'Check the card below. Nothing is saved until you tap Confirm.',
          );
        } else if (result.kind === 'note' || result.kind === 'local_answer') {
          setLocalNote(result.reply);
        }
      })
      .catch(() => undefined);
  }, []);

  const conversation = useVoiceConversation(userId, {onFinalUserText, deps});
  const {snapshot} = conversation;
  const live = LIVE.has(snapshot.phase);
  const connecting = snapshot.phase === 'connecting';

  useEffect(() => {
    setConsented(voiceConsent.read(userId));
    setLocalNote(null);
    setTyped('');
    setShowTyping(false);
  }, [userId]);

  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollToEnd({animated: true});
  }, [snapshot.turns]);

  const handleStart = useCallback(() => {
    setLocalNote(null);
    setEnableError(null);
    conversation.start();
  }, [conversation]);

  const handleConsent = useCallback(() => {
    if (!voiceConsent.write(userId)) {
      setEnableError('Could not save your choice on this device. Try again.');
      return;
    }
    setConsented(true);
    handleStart();
  }, [handleStart, userId]);

  const handleEnableOnline = useCallback(async () => {
    setEnabling(true);
    setEnableError(null);
    const result = await enableOnlineMode(userId);
    setEnabling(false);
    if (!result.ok) {
      setEnableError(result.message);
      return;
    }
    handleStart();
  }, [handleStart, userId]);

  const handleConfirm = useCallback(async () => {
    // Shown, not spoken: the conversation owns the speaker right now.
    const decision = await reviewRef.current.confirm({speakReply: false});
    if (decision) setLocalNote(decision.reply);
  }, []);

  const handleCancelReview = useCallback(() => {
    const decision = reviewRef.current.cancel();
    if (decision) setLocalNote(decision.reply);
  }, []);

  const handleSendTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text) return;
    if (await conversation.sendText(text)) setTyped('');
  }, [conversation, typed]);

  const handleBack = useCallback(() => {
    conversation.end();
    onBack();
  }, [conversation, onBack]);

  const failure = snapshot.failure;
  const needsConsent = !consented && !live && !connecting;

  return (
    <View style={styles.container} testID="voice-conversation-panel">
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to push-to-talk"
          testID="voice-conversation-back"
        >
          <ArrowLeft size={16} color={colors.primary} />
          <Text style={[styles.linkText, {color: colors.primary}]}>
            Push-to-talk
          </Text>
        </TouchableOpacity>
        <View style={[styles.onlinePill, themed.pill]}>
          <AudioLines size={12} color={colors.primary} />
          <Text style={[styles.pillText, {color: colors.primary}]}>Online</Text>
        </View>
      </View>

      <Text
        style={[
          styles.status,
          {
            color: failure
              ? colors.error
              : live
              ? colors.primary
              : colors.textSecondary,
          },
        ]}
        accessibilityLiveRegion="polite"
        testID="voice-conversation-status"
      >
        {statusLine(snapshot)}
      </Text>
      {snapshot.voiceName && (live || connecting) ? (
        <Text
          style={[styles.voiceName, themed.muted]}
          testID="voice-conversation-voice"
        >
          Voice: {snapshot.voiceName}
        </Text>
      ) : null}

      {needsConsent ? (
        <View
          style={[styles.card, themed.card]}
          testID="voice-conversation-consent"
        >
          <Text style={[styles.cardTitle, themed.text]}>Before you start</Text>
          <Text style={[styles.cardBody, themed.text]}>
            While a conversation is open, your microphone audio streams to
            ElevenLabs for transcription and speech, and your words go to
            LAFINA's server and DeepSeek for answers. It only listens on this
            screen, stops when you tap End or leave the app, and you can mute at
            any time. Finished turns are saved to your Chat history. Planner
            changes still need your Confirm.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, {backgroundColor: colors.primary}]}
            onPress={handleConsent}
            accessibilityRole="button"
            testID="voice-conversation-consent-accept"
          >
            <Text style={[styles.primaryText, {color: colors.textOnPrimary}]}>
              I understand, start
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {snapshot.turns.length > 0 ? (
        <ScrollView
          ref={scrollRef}
          style={[styles.transcript, themed.card]}
          contentContainerStyle={styles.transcriptContent}
          nestedScrollEnabled
          testID="voice-conversation-transcript"
        >
          {snapshot.turns.map(turn => (
            <View
              key={turn.id}
              style={[
                styles.turn,
                turn.role === 'user' ? styles.userTurn : styles.agentTurn,
              ]}
              testID={`voice-turn-${turn.role}-${turn.status}`}
            >
              <Text style={[styles.turnLabel, themed.muted]}>
                {turn.role === 'user' ? 'You' : 'LAFINA'}
                {turn.status === 'interrupted' ? ' · interrupted' : ''}
              </Text>
              <Text
                style={[
                  styles.turnText,
                  themed.text,
                  turn.status === 'provisional' && [
                    styles.provisional,
                    themed.muted,
                  ],
                ]}
              >
                {turn.text}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : live ? (
        <Text style={[styles.placeholder, themed.muted]}>
          Say something. Your words appear here as you speak.
        </Text>
      ) : null}

      {snapshot.notice ? (
        <Text
          style={[styles.notice, themed.muted]}
          testID="voice-conversation-notice"
        >
          {snapshot.notice}
        </Text>
      ) : null}
      {localNote ? (
        <Text
          style={[styles.notice, themed.text]}
          testID="voice-conversation-local-note"
        >
          {localNote}
        </Text>
      ) : null}

      {review.proposal ? (
        <CommandReviewCard
          proposal={review.proposal}
          expired={review.expired}
          busy={review.busy}
          onConfirm={() => {
            void handleConfirm();
          }}
          onCancel={handleCancelReview}
          onDismiss={review.dismiss}
          testIDPrefix="voice-conversation-review"
        />
      ) : null}

      {failure || snapshot.phase === 'restart_required' ? (
        <View
          style={[styles.card, themed.card]}
          testID="voice-conversation-problem"
        >
          <View style={styles.problemRow}>
            <CircleAlert
              size={16}
              color={failure ? colors.error : colors.textSecondary}
            />
            <Text
              style={[styles.cardBody, styles.flex, themed.text]}
              testID="voice-conversation-problem-text"
            >
              {failure ? failure.message : snapshot.restartReason}
            </Text>
          </View>
          {failure?.kind === 'online_mode_required' ? (
            <TouchableOpacity
              style={[styles.primaryButton, {backgroundColor: colors.primary}]}
              onPress={() => {
                void handleEnableOnline();
              }}
              disabled={enabling}
              accessibilityRole="button"
              testID="voice-conversation-enable-online"
            >
              {enabling ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text
                  style={[styles.primaryText, {color: colors.textOnPrimary}]}
                >
                  Turn on Online Mode and start
                </Text>
              )}
            </TouchableOpacity>
          ) : failure?.kind === 'mic_denied' ? (
            <TouchableOpacity
              style={[styles.secondaryButton, themed.secondary]}
              onPress={() => {
                void Linking.openSettings().catch(() => undefined);
              }}
              accessibilityRole="button"
              testID="voice-conversation-open-settings"
            >
              <Text style={[styles.secondaryText, themed.text]}>
                Open Settings
              </Text>
            </TouchableOpacity>
          ) : failure?.kind === 'signin_required' ||
            failure?.kind === 'not_configured' ||
            failure?.kind === 'voice_unavailable' ? null : (
            <TouchableOpacity
              style={[styles.secondaryButton, themed.secondary]}
              onPress={handleStart}
              accessibilityRole="button"
              testID="voice-conversation-restart"
            >
              <RotateCcw size={14} color={colors.textPrimary} />
              <Text style={[styles.secondaryText, themed.text]}>
                {failure ? 'Try again' : 'Start again'}
              </Text>
            </TouchableOpacity>
          )}
          {enableError ? (
            <Text
              style={[styles.notice, {color: colors.error}]}
              testID="voice-conversation-enable-error"
            >
              {enableError}
            </Text>
          ) : null}
          <Text style={[styles.hint, themed.muted]}>
            Push-to-talk, typing and your schedule keep working offline.
          </Text>
        </View>
      ) : null}

      {!needsConsent &&
      !failure &&
      (snapshot.phase === 'idle' || snapshot.phase === 'ended') ? (
        <TouchableOpacity
          style={[
            styles.primaryButton,
            styles.startButton,
            {backgroundColor: colors.primary},
          ]}
          onPress={handleStart}
          accessibilityRole="button"
          accessibilityLabel="Start voice conversation"
          testID="voice-conversation-start"
        >
          <Mic size={18} color={colors.textOnPrimary} />
          <Text style={[styles.primaryText, {color: colors.textOnPrimary}]}>
            {snapshot.phase === 'ended'
              ? 'Start a new conversation'
              : 'Start conversation'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {connecting ? (
        <View style={styles.controls}>
          <ActivityIndicator color={colors.primary} />
          <ControlButton
            label="Cancel"
            icon={<PhoneOff size={18} color={colors.textOnPrimary} />}
            color={colors.error}
            textColor={colors.textOnPrimary}
            onPress={conversation.end}
            testID="voice-conversation-end"
          />
        </View>
      ) : null}

      {live ? (
        <>
          <View style={styles.controls}>
            <ControlButton
              label={snapshot.muted ? 'Unmute' : 'Mute'}
              icon={
                snapshot.muted ? (
                  <MicOff size={18} color={colors.textPrimary} />
                ) : (
                  <Mic size={18} color={colors.textPrimary} />
                )
              }
              color={colors.inputBg}
              textColor={colors.textPrimary}
              onPress={() => conversation.setMuted(!snapshot.muted)}
              selected={snapshot.muted}
              testID="voice-conversation-mute"
            />
            <ControlButton
              label="Stop"
              icon={<Square size={16} color={colors.textPrimary} />}
              color={colors.inputBg}
              textColor={colors.textPrimary}
              onPress={conversation.stopResponse}
              disabled={snapshot.phase === 'listening'}
              testID="voice-conversation-stop"
              accessibilityLabel="Stop LAFINA's answer"
            />
            <ControlButton
              label="End"
              icon={<PhoneOff size={18} color={colors.textOnPrimary} />}
              color={colors.error}
              textColor={colors.textOnPrimary}
              onPress={conversation.end}
              testID="voice-conversation-end"
              accessibilityLabel="End voice conversation"
            />
          </View>
          {showTyping ? (
            <View style={[styles.inputRow, themed.card]}>
              <TextInput
                style={[styles.input, themed.text]}
                value={typed}
                onChangeText={setTyped}
                placeholder="Type instead…"
                placeholderTextColor={colors.textSecondary}
                maxLength={1000}
                onSubmitEditing={() => {
                  void handleSendTyped();
                }}
                accessibilityLabel="Type a turn"
                testID="voice-conversation-text-input"
              />
              <TouchableOpacity
                style={[styles.sendButton, {backgroundColor: colors.primary}]}
                onPress={() => {
                  void handleSendTyped();
                }}
                accessibilityRole="button"
                accessibilityLabel="Send typed turn"
                testID="voice-conversation-send"
              >
                <ArrowRight size={16} color={colors.textOnPrimary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowTyping(true)}
              accessibilityRole="button"
              testID="voice-conversation-type-instead"
            >
              <Text style={[styles.linkText, {color: colors.primary}]}>
                Type instead
              </Text>
            </TouchableOpacity>
          )}
        </>
      ) : null}
    </View>
  );
};

const ControlButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  color: string;
  textColor: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
}> = ({
  label,
  icon,
  color,
  textColor,
  onPress,
  testID,
  disabled,
  selected,
  accessibilityLabel,
}) => (
  <TouchableOpacity
    style={[
      styles.control,
      {backgroundColor: color},
      disabled && styles.disabled,
    ]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{disabled: !!disabled, selected: !!selected}}
    testID={testID}
  >
    {icon}
    <Text style={[styles.controlText, {color: textColor}]}>{label}</Text>
  </TouchableOpacity>
);

const getThemedStyles = (colors: ThemeColors) => ({
  card: {backgroundColor: colors.inputBg, borderColor: colors.border},
  pill: {backgroundColor: colors.inputBg},
  text: {color: colors.textPrimary},
  muted: {color: colors.textSecondary},
  secondary: {backgroundColor: colors.cardBg, borderColor: colors.border},
});

const styles = StyleSheet.create({
  container: {width: '100%', alignItems: 'center', gap: 10},
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  linkText: {fontFamily: Fonts.body, fontSize: 14, fontWeight: '600'},
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {fontFamily: Fonts.body, fontSize: 11, fontWeight: 'bold'},
  status: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  voiceName: {fontFamily: Fonts.body, fontSize: 12, marginTop: -6},
  card: {width: '100%', borderRadius: 16, borderWidth: 1, padding: 14, gap: 10},
  cardTitle: {fontFamily: Fonts.heading, fontSize: 15, fontWeight: 'bold'},
  cardBody: {fontFamily: Fonts.body, fontSize: 13, lineHeight: 19},
  flex: {flex: 1},
  problemRow: {flexDirection: 'row', gap: 8, alignItems: 'flex-start'},
  transcript: {width: '100%', maxHeight: 220, borderRadius: 16, borderWidth: 1},
  transcriptContent: {padding: 12, gap: 10},
  turn: {maxWidth: '92%'},
  userTurn: {alignSelf: 'flex-end'},
  agentTurn: {alignSelf: 'flex-start'},
  turnLabel: {
    fontFamily: Fonts.body,
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  turnText: {fontFamily: Fonts.body, fontSize: 15, lineHeight: 21},
  provisional: {fontStyle: 'italic'},
  placeholder: {fontFamily: Fonts.body, fontSize: 14, fontStyle: 'italic'},
  notice: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  hint: {fontFamily: Fonts.body, fontSize: 12, lineHeight: 16},
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
  },
  startButton: {marginTop: 6},
  primaryText: {fontFamily: Fonts.body, fontSize: 15, fontWeight: 'bold'},
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  secondaryText: {fontFamily: Fonts.body, fontSize: 14, fontWeight: '600'},
  controls: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  control: {
    minWidth: 84,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
  },
  controlText: {fontFamily: Fonts.body, fontSize: 14, fontWeight: 'bold'},
  disabled: {opacity: 0.45},
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
  input: {flex: 1, fontFamily: Fonts.body, fontSize: 14, paddingVertical: 0},
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
