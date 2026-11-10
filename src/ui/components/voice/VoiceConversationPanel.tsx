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
  Bot,
  CircleAlert,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneCall,
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
import {directProviderTestEnabled} from '../../../cloud/directProviderTest';
import {readLocalVoiceData} from '../../../cloud/voiceConversation/localVoiceData';
import {localSettingsStore} from '../../../storage/localSettingsStore';
import {explicitMemory} from '../../../ai/explicitMemory';
import {onboardingVoiceContext} from '../../../storage/onboardingMemory';
import {userStore} from '../../../storage/userStore';
import type {SpokenTurnReview} from '../../../ai/chatOrchestrator';
import {CallWaveform} from '../callLafina/CallWaveform';

const DATA_CONSENT = 'voiceConversation.directDataConsent.v1';

export interface VoiceConversationPanelProps {
  userId: string;
  /** The voice sheet's review card; proposals from spoken turns wait here. */
  review: CommandReviewState;
  /** Back to push-to-talk (ends any running conversation). */
  onBack: () => void;
  /** Tests inject fakes. */
  deps?: (userId: string) => VoiceConversationDeps;
  /** Whether the panel is rendered in full-screen presentation. Defaults to true. */
  fullScreen?: boolean;
}

const PHASE_TEXT: Record<ConversationPhase, string> = {
  idle: 'Talk with LAFINA naturally, hands-free',
  connecting: 'Connecting…',
  listening: 'Listening. Pause whenever you like',
  thinking: 'Thinking…',
  tool_working: 'Working…',
  speaking: 'Speaking. Talk to interrupt',
  restart_required: 'Call stopped',
  ended: 'Call ended',
  failed: 'Call Lafina unavailable',
};

const statusLine = (snapshot: ConversationSnapshot, hasReviewItem = false) => {
  const active =
    snapshot.phase === 'listening' ||
    snapshot.phase === 'speaking' ||
    snapshot.phase === 'thinking' ||
    snapshot.phase === 'tool_working';
  if (snapshot.muted && active) return 'Muted. LAFINA cannot hear you';
  if (hasReviewItem && (snapshot.phase === 'listening' || snapshot.phase === 'idle')) {
    return 'Waiting for confirmation';
  }
  return PHASE_TEXT[snapshot.phase] ?? 'Talk with LAFINA naturally, hands-free';
};

const LIVE = new Set<ConversationPhase>(['listening', 'thinking', 'tool_working', 'speaking']);

export const VoiceConversationPanel: React.FC<VoiceConversationPanelProps> = ({
  userId,
  review,
  onBack,
  deps,
  fullScreen = true,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [localNote, setLocalNote] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [showTyping, setShowTyping] = useState(false);
  const [consented, setConsented] = useState(() => voiceConsent.read(userId));
  const [dataConsented, setDataConsented] = useState(() => localSettingsStore.get(userId, DATA_CONSENT, null) === 'true');
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const turnTicket = useRef(0);
  const ownerRef = useRef(userId);
  ownerRef.current = userId;
  const lastUserRequest = useRef('');
  const identityContextSent = useRef(false);
  const conversationRef = useRef<ReturnType<typeof useVoiceConversation> | null>(null);
  const pendingMemory = useRef<{text: string; owner: string; result: Promise<SpokenTurnReview>} | null>(null);

  // Live call duration timer
  const [callDuration, setCallDuration] = useState(0);
  const callConnectedAt = useRef<number | null>(null);

  // A finished spoken turn is also read on the device: a planner change
  // becomes a review card (nothing is saved until Confirm), and a schedule
  // question gets the on-device answer next to the spoken one.
  const onFinalUserText = useCallback((text: string) => {
    lastUserRequest.current = text;
    if (directProviderTestEnabled()) {
      const owner = ownerRef.current;
      if (explicitMemory(text) && localSettingsStore.get(owner, DATA_CONSENT, null) === 'true' && userStore.getActiveSessionToken().userId === owner) {
        const result = chatOrchestrator.reviewSpokenTurn(owner, text);
        pendingMemory.current = {text, owner, result};
        void result.then(value => {
          if (owner !== ownerRef.current || pendingMemory.current?.result !== result || value.kind !== 'memory') return;
          setLocalNote(value.reply);
          void conversationRef.current?.sendContext(`The app processed the student's memory request. Actual result: ${value.reply}`);
        }).catch(() => undefined);
      } else pendingMemory.current = null;
      return;
    }
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
        } else if (result.kind === 'note' || result.kind === 'local_answer' || result.kind === 'memory') {
          setLocalNote(result.reply);
        }
      })
      .catch(() => undefined);
  }, []);

  const onClientTool = useCallback(async (name: string, parameters: Record<string, unknown>, isCurrent: () => boolean): Promise<string> => {
    if (!directProviderTestEnabled() || !isCurrent() || localSettingsStore.get(ownerRef.current, DATA_CONSENT, null) !== 'true') throw new Error('Tool unavailable');
    const owner = ownerRef.current;
    const spoken = lastUserRequest.current;
    if (name === 'read_lafina_data') {
      const word = parameters.kind === 'calendar' ? /\b(calendar|schedule|event|meeting|appointment|agenda|plans?)\b/i
        : parameters.kind === 'notes' ? /\b(notes?|notebook|wrote|written)\b/i
        : /\b(remember|memory|memories|prefer|preference|like|study|studying|name|call me|talk|tone|style)\b/i;
      if (!word.test(spoken)) return 'No data was read. Ask the student which personal data they want to access.';
      return readLocalVoiceData(owner, parameters.kind, parameters.query);
    }
    if (!['prepare_lafina_action', 'save_lafina_memory'].includes(name) || typeof parameters.request !== 'string') throw new Error('Unknown tool');
    if (name === 'save_lafina_memory' && !explicitMemory(spoken)) {
      return 'No memory was saved. Ask the student to state what they want remembered.';
    }
    const request = (explicitMemory(spoken) ? spoken : parameters.request).trim().slice(0, 1000);
    if (!request) return 'No action was prepared. Ask the student for the details.';
    const ticket = ++turnTicket.current;
    const pending = pendingMemory.current;
    const result = pending && pending.owner === owner && pending.text === request
      ? await pending.result : await chatOrchestrator.reviewSpokenTurn(owner, request);
    if (!isCurrent() || ticket !== turnTicket.current || owner !== ownerRef.current) throw new Error('Conversation changed');
    if (result.kind === 'proposal') {
      reviewRef.current.present(result.review);
      setLocalNote('Check the card below. Nothing is saved until you tap Confirm.');
      return `A review card is shown: ${result.reply} Nothing has been saved. Ask the student to check and confirm the card.`;
    }
    if (result.kind === 'memory') {
      setLocalNote(result.reply);
      return result.reply;
    }
    if (result.kind === 'note' || result.kind === 'local_answer') {
      setLocalNote(result.reply);
      return `No change has been saved. ${result.reply}`;
    }
    return 'No action was prepared or saved. Ask for the exact details and try again.';
  }, []);

  const conversation = useVoiceConversation(userId, {onFinalUserText, onClientTool, deps});
  conversationRef.current = conversation;
  const {snapshot} = conversation;
  const live = LIVE.has(snapshot.phase);
  const connecting = snapshot.phase === 'connecting';

  // Timer effect: tracks elapsed time in seconds during active call
  useEffect(() => {
    if (live) {
      if (!callConnectedAt.current) {
        callConnectedAt.current = Date.now();
      }
      const interval = setInterval(() => {
        if (callConnectedAt.current) {
          setCallDuration(Math.floor((Date.now() - callConnectedAt.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      callConnectedAt.current = null;
      if (snapshot.phase === 'idle') {
        setCallDuration(0);
      }
    }
  }, [live, snapshot.phase]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    setConsented(voiceConsent.read(userId));
    setDataConsented(localSettingsStore.get(userId, DATA_CONSENT, null) === 'true');
    setLocalNote(null);
    setTyped('');
    setShowTyping(false);
  }, [userId]);

  useEffect(() => {
    if (!directProviderTestEnabled() || !dataConsented || identityContextSent.current || snapshot.phase !== 'listening') return;
    const context = onboardingVoiceContext(userId);
    identityContextSent.current = true;
    if (context) void conversation.sendContext(context);
  }, [snapshot.phase, userId, dataConsented, conversation]);

  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollToEnd({animated: true});
  }, [snapshot.turns]);

  const handleStart = useCallback(() => {
    if (directProviderTestEnabled() && localSettingsStore.get(ownerRef.current, DATA_CONSENT, null) !== 'true') {
      setEnableError('Please review the data disclosure before starting.');
      return;
    }
    lastUserRequest.current = '';
    pendingMemory.current = null;
    identityContextSent.current = false;
    turnTicket.current += 1;
    setLocalNote(null);
    setEnableError(null);
    conversation.start();
  }, [conversation]);

  const handleConsent = useCallback(() => {
    if (!voiceConsent.write(userId)) {
      setEnableError('Could not save your choice on this device. Try again.');
      return;
    }
    if (directProviderTestEnabled() && !localSettingsStore.set(userId, DATA_CONSENT, 'true')) {
      setEnableError('Could not save your choice on this device. Try again.');
      return;
    }
    setConsented(true);
    setDataConsented(true);
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
    const decision = await reviewRef.current.confirm({speakReply: false});
    if (decision) {
      setLocalNote(decision.reply);
      if (directProviderTestEnabled()) void conversation.sendContext(`The student confirmed the review card. Actual result: ${decision.reply}`);
    }
  }, [conversation]);

  const handleCancelReview = useCallback(() => {
    const decision = reviewRef.current.cancel();
    if (decision) {
      setLocalNote(decision.reply);
      if (directProviderTestEnabled()) void conversation.sendContext('The student canceled the review card. Nothing was saved.');
    }
  }, [conversation]);

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
  const needsConsent = (!consented || (directProviderTestEnabled() && !dataConsented)) && !live && !connecting;

  return (
    <View
      style={[
        styles.container,
        fullScreen && styles.fullScreenContainer,
      ]}
      testID="voice-conversation-panel"
    >
      {/* Top Header Row */}
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

        <Text style={[styles.headerTitle, themed.title]} testID="call-header-title">
          Call Lafina
        </Text>

        <View style={[styles.onlinePill, themed.pill]} testID="call-status-badge">
          {snapshot.muted ? (
            <>
              <MicOff size={12} color={colors.warning} />
              <Text style={[styles.pillText, {color: colors.warning}]} testID="call-muted-badge">
                Muted
              </Text>
            </>
          ) : connecting ? (
            <>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.pillText, {color: colors.primary}]} testID="call-connecting-badge">
                Connecting
              </Text>
            </>
          ) : (
            <>
              <AudioLines size={12} color={colors.primary} />
              <Text style={[styles.pillText, {color: colors.primary}]} testID="call-online-badge">
                Online
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Centered Identity Stage */}
      <View style={styles.centerStage} testID="call-center-stage">
        <View
          style={[
            styles.avatarRing,
            {
              borderColor: live
                ? snapshot.muted
                  ? colors.warning
                  : colors.primary
                : colors.border,
            },
          ]}
          testID="call-identity-ring"
        >
          <View
            style={[
              styles.avatarInner,
              {backgroundColor: colors.primary + '18'},
            ]}
          >
            <Bot size={40} color={colors.primary} />
          </View>
        </View>

        {live ? (
          <Text style={[styles.timerText, themed.title]} testID="call-timer">
            {formatDuration(callDuration)}
          </Text>
        ) : null}

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
          {statusLine(snapshot, Boolean(review?.proposal))}
        </Text>

        {snapshot.voiceName && (live || connecting) ? (
          <Text
            style={[styles.voiceName, themed.muted]}
            testID="voice-conversation-voice"
          >
            Voice: {snapshot.voiceName}
          </Text>
        ) : null}

        {/* Central Responsive Dual Waveform and Truthful Activity Indicators */}
        <CallWaveform
          phase={snapshot.phase}
          muted={snapshot.muted}
          micCapturing={snapshot.micCapturing}
          userLevel={snapshot.level}
          outputLevel={snapshot.outputLevel ?? 0}
          hasReviewItem={Boolean(review?.proposal)}
        />
      </View>

      {/* Middle Scrollable Deck for Cards, Turns and Messages */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {needsConsent ? (
          <View
            style={[styles.card, themed.card]}
            testID="voice-conversation-consent"
          >
            <Text style={[styles.cardTitle, themed.text]}>Before you start</Text>
            <Text style={[styles.cardBody, themed.text]}>
              While a call is open, your microphone audio streams to
              ElevenLabs for transcription and speech, and your words go to
              DeepSeek for answers. {directProviderTestEnabled()
                ? 'If you ask about your calendar, notes or saved memories, relevant records are sent to the voice provider to answer. '
                : "Your words also go to LAFINA's server. "}It only listens on this
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
        ) : null}
      </ScrollView>

      {/* Bottom Control Dock */}
      <View style={[styles.dockContainer, themed.dock]} testID="call-control-dock">
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
            accessibilityLabel="Call Lafina"
            testID="voice-conversation-start"
          >
            <PhoneCall size={18} color={colors.textOnPrimary} />
            <Text style={[styles.primaryText, {color: colors.textOnPrimary}]}>
              {snapshot.phase === 'ended'
                ? 'Call Lafina again'
                : 'Call Lafina'}
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
          <View style={styles.controls}>
            <ControlButton
              label={snapshot.muted ? 'Unmute' : 'Mute'}
              icon={
                snapshot.muted ? (
                  <MicOff size={18} color={colors.warning} />
                ) : (
                  <Mic size={18} color={colors.textPrimary} />
                )
              }
              color={colors.inputBg}
              textColor={snapshot.muted ? colors.warning : colors.textPrimary}
              onPress={() => conversation.setMuted(!snapshot.muted)}
              selected={snapshot.muted}
              testID="voice-conversation-mute"
            />
            <ControlButton
              label={showTyping ? 'Voice' : 'Type'}
              icon={<MessageSquareText size={18} color={colors.textPrimary} />}
              color={showTyping ? colors.primary + '20' : colors.inputBg}
              textColor={colors.textPrimary}
              onPress={() => setShowTyping(prev => !prev)}
              testID="voice-conversation-type-instead"
              accessibilityLabel={showTyping ? 'Return to voice only' : 'Type a turn instead of speaking'}
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
              accessibilityLabel="End Call Lafina"
            />
          </View>
        ) : null}
      </View>
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
  dock: {backgroundColor: colors.cardBg, borderColor: colors.border},
  text: {color: colors.textPrimary},
  title: {color: colors.textPrimary},
  muted: {color: colors.textSecondary},
  secondary: {backgroundColor: colors.cardBg, borderColor: colors.border},
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fullScreenContainer: {
    flex: 1,
    height: '100%',
    justifyContent: 'space-between',
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    minHeight: 44,
  },
  linkText: {fontFamily: Fonts.body, fontSize: 14, fontWeight: '600'},
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillText: {fontFamily: Fonts.body, fontSize: 11, fontWeight: 'bold'},
  centerStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    width: '100%',
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontFamily: Fonts.heading,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  status: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  voiceName: {fontFamily: Fonts.body, fontSize: 12, marginTop: -2},
  waveformContainer: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  waveformBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
    minHeight: 6,
  },
  contentScroll: {
    flex: 1,
    width: '100%',
  },
  contentScrollContainer: {
    paddingVertical: 8,
    gap: 12,
    alignItems: 'center',
  },
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
  placeholder: {fontFamily: Fonts.body, fontSize: 14, fontStyle: 'italic', textAlign: 'center'},
  notice: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  hint: {fontFamily: Fonts.body, fontSize: 12, lineHeight: 16},
  dockContainer: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 24,
  },
  startButton: {width: '100%', maxWidth: 280},
  primaryText: {fontFamily: Fonts.body, fontSize: 15, fontWeight: 'bold'},
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  secondaryText: {fontFamily: Fonts.body, fontSize: 14, fontWeight: '600'},
  controls: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  control: {
    flex: 1,
    maxWidth: 90,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
  },
  controlText: {fontFamily: Fonts.body, fontSize: 12, fontWeight: 'bold'},
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
