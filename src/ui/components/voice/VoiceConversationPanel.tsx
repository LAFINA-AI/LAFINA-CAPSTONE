import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
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
import {directProviderTestEnabled} from '../../../cloud/directProviderTest';
import {readLocalVoiceData} from '../../../cloud/voiceConversation/localVoiceData';
import {localSettingsStore} from '../../../storage/localSettingsStore';
import {explicitMemory} from '../../../ai/explicitMemory';
import {onboardingVoiceContext} from '../../../storage/onboardingMemory';
import {userStore} from '../../../storage/userStore';
import type {SpokenTurnReview} from '../../../ai/chatOrchestrator';
import {groundedVoiceDraft, isVoiceScheduleStart} from '../../../ai/nlu/groundedVoiceDraft';
import {parseIntentFastPath} from '../../../ai/nlu/fastPathParser';
import {cancelReviewedCommand, prepareReviewedCommand} from '../../../ai/nlu/commandReview';
import {startOwnedSpeech, stopOwnedSpeech} from '../../../ai/tts/ttsService';
import type {ValidatedIntent} from '../../../ai/nlu/types';

const DATA_CONSENT = 'voiceConversation.directDataConsent.v1';

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
  const [decisionEnded, setDecisionEnded] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
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
  const activePhase = useRef<ConversationPhase>('idle');
  const voiceTurns = useRef<string[]>([]);
  const awaitingDetails = useRef(false);
  const proposalPending = useRef(false);
  const confirming = useRef(false);
  const pendingOperation = useRef<string | null>(null);
  const lastDraft = useRef<ValidatedIntent | null>(null);
  const actionTurn = useRef(false);
  const allowAgentSpeech = useRef(false);
  const actionReply = useRef('No action was prepared. Nothing was saved.');
  const speechEpoch = useRef(0);
  const speechToken = useRef<number | null>(null);
  const mounted = useRef(true);
  const foreground = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const stopOutcome = useCallback(() => {
    speechEpoch.current += 1;
    if (speechToken.current !== null) void stopOwnedSpeech(speechToken.current);
    speechToken.current = null;
    if (mounted.current) setLocalSpeaking(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; turnTicket.current += 1; stopOutcome(); };
  }, [stopOutcome]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (state !== 'active') stopOutcome();
    });
    return () => listener.remove();
  }, [stopOutcome]);

  const speakDecision = useCallback((reply: string) => {
    if (!mounted.current || !foreground.current) return;
    stopOutcome();
    const epoch = speechEpoch.current;
    const owner = ownerRef.current;
    const current = conversationRef.current;
    if (!current) return;
    setDecisionEnded(true);
    // Release the provider and microphone before the authoritative app reply.
    void current.endAndWait().then(released => {
      if (!released || !mounted.current || !foreground.current || epoch !== speechEpoch.current || owner !== ownerRef.current) return;
      const speech = startOwnedSpeech(reply, `voice-decision:${owner}`, () => mounted.current && foreground.current && epoch === speechEpoch.current && owner === ownerRef.current);
      void speech.token.then(token => {
        if (epoch !== speechEpoch.current && token !== null) void stopOwnedSpeech(token);
        else speechToken.current = token;
      });
      void speech.result.then(() => { if (epoch === speechEpoch.current) speechToken.current = null; });
    });
  }, [stopOutcome]);

  const speakInSession = useCallback((reply: string, providerReply = false) => {
    const current = conversationRef.current;
    if (!current || !mounted.current || !foreground.current) return;
    stopOutcome();
    const epoch = speechEpoch.current;
    const owner = ownerRef.current;
    const valid = () => mounted.current && foreground.current && owner === ownerRef.current && epoch === speechEpoch.current && LIVE.has(activePhase.current);
    void (async () => {
      if (!(await current.setSpeechPaused(true))) return;
      if (!valid()) return;
      setLocalSpeaking(true);
      if (providerReply) current.appSpeechStarted();
      const speech = startOwnedSpeech(reply, `voice-turn:${owner}`, valid);
      void speech.token.then(token => {
        if (!valid() && token !== null) void stopOwnedSpeech(token);
        else speechToken.current = token;
      });
      const outcome = await speech.result;
      if (valid()) {
        if (providerReply) current.appSpeechFinished(outcome === 'finished');
        speechToken.current = null;
        setLocalSpeaking(false);
        await current.setSpeechPaused(false);
      }
    })();
  }, [stopOutcome]);

  // A finished spoken turn is also read on the device: a planner change
  // becomes a review card (nothing is saved until Confirm), and a schedule
  // question gets the on-device answer next to the spoken one.
  const onFinalUserText = useCallback((text: string) => {
    stopOutcome();
    void conversationRef.current?.setSpeechPaused(false);
    turnTicket.current += 1;
    lastUserRequest.current = text;
    voiceTurns.current = [...voiceTurns.current, text].slice(-8);
    if ((reviewRef.current.proposal || proposalPending.current || awaitingDetails.current) && /^\s*(?:cancel|discard|never mind|nevermind)(?:\s+(?:that|it|the (?:request|review|action)))?[.!]?\s*$/i.test(text)) {
        actionTurn.current = true;
        if (confirming.current || reviewRef.current.busy) {
          setLocalNote('The confirmation is still processing. Please wait for the result.');
          return;
        }
        voiceTurns.current = [];
        awaitingDetails.current = false;
        proposalPending.current = false;
        lastDraft.current = null;
        const decision = reviewRef.current.cancel();
        if (decision) {
          pendingOperation.current = null;
          setLocalNote(decision.reply);
          speakDecision(decision.reply);
        } else {
          if (pendingOperation.current) cancelReviewedCommand(ownerRef.current, pendingOperation.current);
          pendingOperation.current = null;
          reviewRef.current.dismiss();
          setLocalNote('Canceled. Nothing was saved.');
          speakDecision('Canceled. Nothing was saved.');
        }
        return;
    }
    if (explicitMemory(text) && !reviewRef.current.proposal && !proposalPending.current && !awaitingDetails.current) {
      const owner = ownerRef.current;
      actionTurn.current = true;
      allowAgentSpeech.current = false;
      if (userStore.getActiveSessionToken().userId !== owner || (directProviderTestEnabled() && localSettingsStore.get(owner, DATA_CONSENT, null) !== 'true')) return;
      const ticket = turnTicket.current;
      const result = chatOrchestrator.reviewSpokenTurn(owner, text);
      pendingMemory.current = {text, owner, result};
      void result.then(value => {
        if (ticket !== turnTicket.current || owner !== ownerRef.current || value.kind !== 'memory') return;
        setLocalNote(value.reply);
        conversationRef.current?.completeLocalTurn();
        speakInSession(value.reply);
      }).catch(() => undefined);
      return;
    }
    const fragment = parseIntentFastPath(text);
    const previous = lastDraft.current;
    const conflictingDetail = !!previous && !!((fragment.date && previous.date && fragment.date !== previous.date) || (fragment.time && previous.time && fragment.time !== previous.time) || (fragment.endTime && previous.endTime && fragment.endTime !== previous.endTime) || (fragment.durationMinutes && previous.durationMinutes && fragment.durationMinutes !== previous.durationMinutes));
    const supplement = !!previous && !!(proposalPending.current || reviewRef.current.proposal) && !confirming.current && !reviewRef.current.busy && !isVoiceScheduleStart(text) &&
      !conflictingDetail && !!((fragment.date && !previous.date) || (fragment.time && !previous.time) || ((fragment.endTime || fragment.durationMinutes) && !previous.endTime && !previous.durationMinutes));
    if (supplement) {
      if (pendingOperation.current) cancelReviewedCommand(ownerRef.current, pendingOperation.current);
      reviewRef.current.cancel({silent: true});
      reviewRef.current.dismiss();
      proposalPending.current = false;
      pendingOperation.current = null;
    }
    const schedule = !explicitMemory(text) && (supplement || awaitingDetails.current || isVoiceScheduleStart(text));
    const mutation = /\b(?:delete|remove|update|change|move|reschedule|snooze)\b/i.test(text) || /\b(?:take|save|create|add)\s+(?:a\s+)?note\b/i.test(text);
    const unknownAction = !explicitMemory(text) && !schedule && !mutation && fragment.intent !== 'query_schedule' && /\b(?:schedule|book|arrange|remind|create|add|put|plan)\b/i.test(text);
    actionTurn.current = schedule || mutation || unknownAction || proposalPending.current || !!reviewRef.current.proposal;
    // Only clearly conversational questions and greetings may use model text
    // as speech. Unrecognized commands stay silent until the app can clarify.
    allowAgentSpeech.current = !actionTurn.current && /^(?:\s*(?:who|what|when|where|why|how|explain|define|tell me|hello|hi|hey)\b)/i.test(text) &&
      !/\b(?:schedule|calendar|planner|task|event|remind|reminder|appointment|plan|book|save|add|create|change|delete|tomorrow|today)\b/i.test(text);
    if (!actionTurn.current) actionReply.current = 'No action was prepared. Nothing was saved.';
    if (actionTurn.current) {
      if (confirming.current || reviewRef.current.busy) {
        actionReply.current = 'The confirmation is still processing. Please wait for the result.';
      } else if (!supplement && (proposalPending.current || reviewRef.current.proposal)) {
        actionReply.current = conflictingDetail
          ? 'To change those details, cancel the current card and ask again. Nothing was saved.'
          : 'Please review the existing card and tap Confirm or Cancel. Nothing else was saved.';
      } else if (unknownAction) {
        actionReply.current = 'I could not prepare that request. Please say it again. Nothing was saved.';
      } else if (!schedule) {
        const owner = ownerRef.current;
        const ticket = turnTicket.current;
        actionReply.current = 'The app is checking your request. Nothing has been saved.';
        void chatOrchestrator.reviewSpokenTurn(owner, text, {isCurrent: () => ticket === turnTicket.current && owner === ownerRef.current && LIVE.has(activePhase.current)})
          .then(result => {
            if (ticket !== turnTicket.current || owner !== ownerRef.current || !LIVE.has(activePhase.current)) return;
            if (result.kind === 'proposal' && result.review.status === 'proposal') { proposalPending.current = true; pendingOperation.current = result.review.proposal.operationId; reviewRef.current.present(result.review); }
            actionReply.current = result.kind === 'none' ? 'I could not prepare that change. Nothing was saved.' : result.reply;
            setLocalNote(actionReply.current);
            conversationRef.current?.completeLocalTurn();
            speakInSession(actionReply.current);
          }).catch(() => undefined);
        return;
      } else {
        const now = new Date();
        const draft = groundedVoiceDraft(voiceTurns.current, now);
        if (draft.kind === 'clarify') {
          awaitingDetails.current = true;
          actionReply.current = draft.reply;
        } else {
          const prepared = prepareReviewedCommand(ownerRef.current, draft.intent, {referenceDate: now, surface: 'voice'});
          awaitingDetails.current = prepared.status !== 'proposal';
          if (prepared.status === 'proposal') {
            proposalPending.current = true;
            pendingOperation.current = prepared.proposal.operationId;
            lastDraft.current = draft.intent;
            reviewRef.current.present(prepared);
          }
          actionReply.current = prepared.reply;
        }
      }
      setLocalNote(actionReply.current);
      conversationRef.current?.completeLocalTurn();
      speakInSession(actionReply.current);
      return;
    }
    if (directProviderTestEnabled()) {
      pendingMemory.current = null;
      return;
    }
    if (parseIntentFastPath(text).intent !== 'query_schedule') return;
    const ticket = ++turnTicket.current;
    const owner = ownerRef.current;
    void chatOrchestrator
      .reviewSpokenTurn(owner, text, {isCurrent: () => ticket === turnTicket.current && owner === ownerRef.current && LIVE.has(activePhase.current)})
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
  }, [speakDecision, speakInSession, stopOutcome]);

  const onClientTool = useCallback(async (name: string, parameters: Record<string, unknown>, isCurrent: () => boolean): Promise<string> => {
    if (!directProviderTestEnabled() || !isCurrent() || localSettingsStore.get(ownerRef.current, DATA_CONSENT, null) !== 'true') throw new Error('Tool unavailable');
    const owner = ownerRef.current;
    const spoken = lastUserRequest.current;
    if (name === 'prepare_lafina_action') {
      if (!actionTurn.current) {
        actionTurn.current = true;
        allowAgentSpeech.current = false;
        actionReply.current = 'I could not prepare that request. Please say it again. Nothing was saved.';
        setLocalNote(actionReply.current);
        conversationRef.current?.completeLocalTurn();
        speakInSession(actionReply.current);
      }
      return actionReply.current;
    }
    if (name === 'read_lafina_data') {
      const word = parameters.kind === 'calendar' ? /\b(calendar|schedule|event|meeting|appointment|agenda|plans?)\b/i
        : parameters.kind === 'notes' ? /\b(notes?|notebook|wrote|written)\b/i
        : /\b(remember|memory|memories|prefer|preference|like|study|studying|name|call me|talk|tone|style)\b/i;
      if (!word.test(spoken)) return 'No data was read. Ask the student which personal data they want to access.';
      return readLocalVoiceData(owner, parameters.kind, parameters.query);
    }
    if (name !== 'save_lafina_memory' || typeof parameters.request !== 'string') throw new Error('Unknown tool');
    if (!explicitMemory(spoken)) return 'No memory was saved. Ask the student to state what they want remembered.';
    const pending = pendingMemory.current;
    const result = pending && pending.owner === owner && pending.text === spoken
      ? await pending.result : await chatOrchestrator.reviewSpokenTurn(owner, spoken);
    if (!isCurrent() || owner !== ownerRef.current) throw new Error('Conversation changed');
    return result.kind === 'memory' ? result.reply : 'No memory was saved.';

  }, [speakInSession]);
  const onAgentText = useCallback((text: string) => {
    if (!allowAgentSpeech.current || actionTurn.current || /\b(?:saved|created|scheduled|deleted|cancelled|canceled|updated|confirmed|added|booked|rescheduled|all set|taken care of|put (?:it|that)|on (?:your|the) calendar|set (?:a |the )?reminder)\b/i.test(text)) {
      if (!actionTurn.current) setLocalNote('Read this answer in the transcript.');
      return;
    }
    speakInSession(text, true);
  }, [speakInSession]);
  const conversation = useVoiceConversation(userId, {onFinalUserText, onClientTool, onAgentText, suppressAgentResponse: () => actionTurn.current, appOwnedAudio: true, deps});
  conversationRef.current = conversation;
  const {snapshot} = conversation;
  activePhase.current = snapshot.phase;
  const live = LIVE.has(snapshot.phase);
  const connecting = snapshot.phase === 'connecting';

  useEffect(() => {
    stopOutcome();
    turnTicket.current += 1;
    voiceTurns.current = [];
    awaitingDetails.current = false;
    proposalPending.current = false;
    pendingOperation.current = null;
    lastDraft.current = null;
    allowAgentSpeech.current = false;
    actionTurn.current = false;
    setConsented(voiceConsent.read(userId));
    setDataConsented(localSettingsStore.get(userId, DATA_CONSENT, null) === 'true');
    setLocalNote(null);
    setDecisionEnded(false);
    setTyped('');
    setShowTyping(false);
  }, [userId, stopOutcome]);

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
    stopOutcome();
    if (directProviderTestEnabled() && localSettingsStore.get(ownerRef.current, DATA_CONSENT, null) !== 'true') {
      setEnableError('Please review the data disclosure before starting.');
      return;
    }
    lastUserRequest.current = '';
    voiceTurns.current = [];
    awaitingDetails.current = false;
    allowAgentSpeech.current = false;
    actionTurn.current = false;
    lastDraft.current = null;
    pendingMemory.current = null;
    identityContextSent.current = false;
    turnTicket.current += 1;
    setLocalNote(null);
    setDecisionEnded(false);
    setEnableError(null);
    conversation.start();
  }, [conversation, stopOutcome]);

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
    if (confirming.current) return;
    confirming.current = true;
    const owner = ownerRef.current;
    const epoch = speechEpoch.current;
    try {
      const decision = await reviewRef.current.confirm({speakReply: false});
      if (decision && mounted.current && owner === ownerRef.current) {
        proposalPending.current = decision.outcome?.status === 'refused' && decision.outcome.reason === 'failed';
        if (!proposalPending.current) pendingOperation.current = null;
        if (!proposalPending.current) lastDraft.current = null;
        setLocalNote(decision.reply);
        if (foreground.current && epoch === speechEpoch.current) speakDecision(decision.reply);
      }
    } catch {
      if (mounted.current && owner === ownerRef.current) {
        const reply = 'I could not verify the result. Please check your planner before trying again.';
        setLocalNote(reply);
        if (foreground.current && epoch === speechEpoch.current) speakDecision(reply);
      }
    } finally {
      confirming.current = false;
    }
  }, [speakDecision]);

  const handleCancelReview = useCallback(() => {
    const decision = reviewRef.current.cancel();
    if (decision) {
      proposalPending.current = false;
      pendingOperation.current = null;
      lastDraft.current = null;
      voiceTurns.current = [];
      awaitingDetails.current = false;
      setLocalNote(decision.reply);
      speakDecision(decision.reply);
    }
  }, [speakDecision]);

  const handleSendTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text) return;
    if (await conversation.sendText(text)) setTyped('');
  }, [conversation, typed]);

  const handleBack = useCallback(() => {
    stopOutcome();
    turnTicket.current += 1;
    conversation.end();
    onBack();
  }, [conversation, onBack, stopOutcome]);

  const handleEnd = useCallback(() => {
    stopOutcome();
    turnTicket.current += 1;
    conversation.end();
  }, [conversation, stopOutcome]);

  const failure = snapshot.failure;
  const needsConsent = (!consented || (directProviderTestEnabled() && !dataConsented)) && !live && !connecting;

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
        {localSpeaking ? 'Speaking. Tap Stop to interrupt' : statusLine(snapshot)}
      </Text>
      {snapshot.voiceName && (live || connecting) ? (
        <Text
          style={[styles.voiceName, themed.muted]}
          testID="voice-conversation-voice"
        >
          Speech: device voice
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
            ElevenLabs for transcription, and your words go to
            DeepSeek for answers. {directProviderTestEnabled()
              ? 'If you ask about your calendar, notes or saved memories, relevant records are sent to the voice provider to answer. '
              : "Your words also go to LAFINA's server. "}It only listens on this
            screen, stops when you tap End or leave the app, and you can mute at
            any time. Replies use your device voice, and the microphone pauses
            during speech. Finished turns are saved to your Chat history.
            Planner changes still need your Confirm.
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
      {decisionEnded ? (
        <Text style={[styles.notice, themed.muted]}>
          Conversation ended after the review. Start a new conversation to continue.
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
          onDismiss={() => { proposalPending.current = false; pendingOperation.current = null; lastDraft.current = null; voiceTurns.current = []; review.dismiss(); }}
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
            onPress={handleEnd}
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
              onPress={() => { stopOutcome(); void conversation.setSpeechPaused(false); conversation.stopResponse(); }}
              disabled={snapshot.phase === 'listening' && !localSpeaking}
              testID="voice-conversation-stop"
              accessibilityLabel="Stop LAFINA's answer"
            />
            <ControlButton
              label="End"
              icon={<PhoneOff size={18} color={colors.textOnPrimary} />}
              color={colors.error}
              textColor={colors.textOnPrimary}
              onPress={handleEnd}
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
