import {verifyReminderDelivery} from '../../../scheduler/verifyReminderDelivery';
import {CallReadResults} from '../callLafina/CallReadResults';
import type {LocalVoiceResult} from '../../../cloud/voiceConversation/localVoiceData';
import type {CallNavigationTarget} from '../../navigation/callNavigation';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
    CircleAlert,
  MessageSquareText,
  Mic,
  MicOff,
  Minimize2,
  PhoneCall,
  PhoneOff,
  RotateCcw,
  Sliders,
  Square,
} from 'lucide-react-native';
import {Fonts} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import {chatOrchestrator} from '../../../ai/chatOrchestrator';
import {SynthWaveAvatar} from '../callLafina/SynthWaveAvatar';
import {enableOnlineMode, voiceConsent} from '../../../cloud/voiceConversation';
import type {
  ConversationPhase,
  ConversationSnapshot,
  VoiceConversationDeps,
} from '../../../cloud/voiceConversation';
import {useVoiceConversation} from '../../hooks/useVoiceConversation';
import type {CommandReviewState} from '../../hooks/useCommandReview';
import {ActionCardHost} from '../callLafina/ActionCardHost';
import {isToolExecutionPermitted} from '../../../ai/voiceActions/actionSecurity';
import {actionService} from '../../../ai/voiceActions/actionService';
import type {
  MemoryProposalData,
  MultiActionBatchData,
} from '../../../ai/voiceActions/types';
import {
  cancelMultiItem,
  reviseMultiItem,
} from '../../../ai/voiceActions/multiActionService';
import {CallLafinaSettingsModal} from '../callLafina/CallLafinaSettingsModal';
import {
  getCallLafinaSettings,
  type CallLafinaSettings,
} from '../../../cloud/voiceConversation/callLafinaSettingsStore';
import {directProviderTestEnabled} from '../../../cloud/directProviderTest';
import {localSettingsStore} from '../../../storage/localSettingsStore';
import {explicitMemory} from '../../../ai/explicitMemory';
import {onboardingVoiceContext} from '../../../storage/onboardingMemory';
import {CallWaveform} from '../callLafina/CallWaveform';
import {ttsService} from '../../../ai/tts/ttsService';
import {generateId} from '../../../utils';
import {
  groundedVoiceDraft,
  isVoiceScheduleStart,
} from '../../../ai/nlu/groundedVoiceDraft';
import {parseIntentFastPath} from '../../../ai/nlu/fastPathParser';
import {
  prepareReviewedCommand,
  latestPendingReview,
  reviseReviewedCommand,
  cancelReviewedCommand,
} from '../../../ai/nlu/commandReview';

const DATA_CONSENT = 'voiceConversation.directDataConsent.v1';

export interface VoiceConversationPanelProps {
  userId: string;
  /** The voice sheet's review card; proposals from spoken turns wait here. */
  review: CommandReviewState;
  /** Back to push-to-talk (ends any running conversation). */
  onBack: () => void;
  /** Minimize call to in-app mini bar without ending the session (Phase 13, F-054). */
  onMinimize?: () => void;
  onNavigate?: (target: CallNavigationTarget) => void;
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
  if (snapshot.phase === 'tool_working') {
    return snapshot.toolPhrase || 'Working…';
  }
  if (
    hasReviewItem &&
    (snapshot.phase === 'listening' || snapshot.phase === 'idle')
  ) {
    return 'Waiting for confirmation';
  }
  return PHASE_TEXT[snapshot.phase] ?? 'Talk with LAFINA naturally, hands-free';
};

const LIVE = new Set<ConversationPhase>([
  'listening',
  'thinking',
  'tool_working',
  'speaking',
]);

export const VoiceConversationPanel: React.FC<VoiceConversationPanelProps> = ({
  userId,
  review,
  onBack,
  onMinimize,
  onNavigate,
  deps,
  fullScreen = true,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [readResult, setReadResult] = useState<LocalVoiceResult | null>(null);
  const [savedTarget, setSavedTarget] = useState<CallNavigationTarget | null>(
    null,
  );
  const [localNote, setLocalNote] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [draftCorrection, setDraftCorrection] = useState('');
  const [showTyping, setShowTyping] = useState(false);
  const [consented, setConsented] = useState(() => voiceConsent.read(userId));
  const [dataConsented, setDataConsented] = useState(
    () => localSettingsStore.get(userId, DATA_CONSENT, null) === 'true',
  );
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const turnTicket = useRef(0);
  const ownerRef = useRef(userId);
  const actionSession = useRef(generateId('call-actions'));
  ownerRef.current = userId;
  const lastUserRequest = useRef('');
  const voiceTurns = useRef<string[]>([]);
  const awaitingDetails = useRef(false);
  const groundedReply = useRef('No action was prepared. Nothing was saved.');
  const identityContextSent = useRef(false);
  const conversationRef = useRef<ReturnType<
    typeof useVoiceConversation
  > | null>(null);
  const [activeMemoryProposal, setActiveMemoryProposal] =
    useState<MemoryProposalData | null>(null);
  const activeMemoryActionId = useRef<string | null>(null);
  const [activeMultiBatch, setActiveMultiBatch] =
    useState<MultiActionBatchData | null>(null);
  const currentCards = useRef({
    memory: activeMemoryProposal,
    memoryActionId: activeMemoryActionId.current,
    batch: activeMultiBatch,
  });
  currentCards.current = {
    memory: activeMemoryProposal,
    memoryActionId: activeMemoryActionId.current,
    batch: activeMultiBatch,
  };
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [callSettings, setCallSettings] = useState<CallLafinaSettings>(() =>
    getCallLafinaSettings(userId),
  );

  // Live call duration timer
  const [callDuration, setCallDuration] = useState(0);
  const callConnectedAt = useRef<number | null>(null);

  // Transcript drawer and auto-scroll state
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const {layoutMeasurement, contentOffset, contentSize} = event.nativeEvent;
      const paddingToBottom = 24;
      const atBottom =
        layoutMeasurement.height + contentOffset.y >=
        contentSize.height - paddingToBottom;
      setIsAtBottom(atBottom);
    },
    [],
  );

  const jumpToLatest = useCallback(() => {
    scrollRef.current?.scrollToEnd({animated: true});
    setIsAtBottom(true);
  }, []);

  // A finished spoken turn is also read on the device: a planner change
  // becomes a review card (nothing is saved until Confirm), and a schedule
  // question gets the on-device answer next to the spoken one.
  const onFinalUserText = useCallback((text: string) => {
    if (!isToolExecutionPermitted(ownerRef.current).permitted) return;
    const session = actionSession.current;
    const ticket = ++turnTicket.current;
    voiceTurns.current = [...voiceTurns.current, text].slice(-8);
    lastUserRequest.current = text;
    const owner = ownerRef.current;
    const fact = explicitMemory(text);
    if (fact) {
      const prepared = actionService.createMemoryProposal(
        owner,
        actionSession.current,
        fact,
        text,
      );
      activeMemoryActionId.current = prepared.actionId;
      setActiveMemoryProposal(prepared.proposal);
      setLocalNote('Review the memory card. Nothing has been saved.');
      return;
    }
    const pending = latestPendingReview(owner, 'voice');
    if (/^cancel that[.!]?$/i.test(text.trim())) {
      const cards = currentCards.current;
      const memoryOpen = cards.memory?.status === 'draft';
      const batchOpen =
        cards.batch &&
        (cards.batch.status === 'draft' ||
          cards.batch.status === 'partial' ||
          cards.batch.status === 'failed');
      if (Number(!!pending) + Number(memoryOpen) + Number(!!batchOpen) > 1) {
        setLocalNote(
          'Which draft should I cancel? Use Cancel on the card you mean.',
        );
        void conversationRef.current?.sendContext(
          'There is more than one open draft. Ask which card to cancel. Nothing was canceled or saved.',
        );
        return;
      }
      if (memoryOpen && cards.memoryActionId) {
        actionService.cancelMemoryProposal(owner, cards.memoryActionId);
        setActiveMemoryProposal(null);
        activeMemoryActionId.current = null;
        setLocalNote('Memory draft canceled. Nothing was saved.');
        return;
      }
      if (batchOpen && cards.batch) {
        const result = actionService.cancelMultiActionBatch(owner, cards.batch);
        setActiveMultiBatch(result.batch);
        setLocalNote(result.spokenSummary);
        return;
      }
    }

    if (
      pending &&
      /^(?:actually|no[, ]|change|make (?:it|that)|cancel that|rename|call it)/i.test(
        text.trim(),
      )
    ) {
      if (/^cancel that/i.test(text.trim())) {
        cancelReviewedCommand(owner, pending.operationId);
        reviewRef.current.dismiss();
        voiceTurns.current = [];
        awaitingDetails.current = false;
        groundedReply.current = 'Draft canceled. Nothing was saved.';
        setLocalNote(groundedReply.current);
      } else {
        const revised = reviseReviewedCommand(owner, pending.operationId, text);
        if (revised.status === 'proposal') reviewRef.current.present(revised);
        setLocalNote(revised.reply);
      }
      return;
    }
    const fragment = parseIntentFastPath(text);
    const supplementsDraft =
      pending &&
      !isVoiceScheduleStart(text) &&
      !!(
        fragment.date ||
        fragment.time ||
        fragment.endTime ||
        fragment.durationMinutes
      );
    if (
      isVoiceScheduleStart(text) ||
      awaitingDetails.current ||
      supplementsDraft
    ) {
      const now = new Date();
      const draft = groundedVoiceDraft(voiceTurns.current, now);
      if (draft.kind === 'clarify') {
        awaitingDetails.current = true;
        groundedReply.current = draft.reply;
      } else {
        if (pending) cancelReviewedCommand(owner, pending.operationId);
        const prepared = prepareReviewedCommand(owner, draft.intent, {
          referenceDate: now,
          surface: 'voice',
        });
        awaitingDetails.current = prepared.status !== 'proposal';
        groundedReply.current = prepared.reply;
        if (prepared.status === 'proposal') {
          reviewRef.current.present(prepared);
          groundedReply.current =
            'Check the card below. Nothing is saved until you tap Confirm.';
        }
      }
      setLocalNote(groundedReply.current);
      return;
    }
    if (directProviderTestEnabled()) return;
    void chatOrchestrator
      .reviewSpokenTurn(owner, text, {
        isCurrent: () =>
          ticket === turnTicket.current &&
          owner === ownerRef.current &&
          session === actionSession.current &&
          !!conversationRef.current &&
          LIVE.has(conversationRef.current.snapshot.phase),
      })
      .then(result => {
        if (
          ticket !== turnTicket.current ||
          owner !== ownerRef.current ||
          session !== actionSession.current ||
          !conversationRef.current ||
          !LIVE.has(conversationRef.current.snapshot.phase)
        ) {
          if (result.kind === 'proposal' && result.review.status === 'proposal')
            cancelReviewedCommand(owner, result.review.proposal.operationId);
          return;
        }
        if (result.kind === 'proposal') {
          reviewRef.current.present(result.review);
          setLocalNote(
            'Check the card below. Nothing is saved until you tap Confirm.',
          );
        } else if (
          result.kind === 'note' ||
          result.kind === 'local_answer' ||
          result.kind === 'memory'
        ) {
          setLocalNote(result.reply);
        }
      })
      .catch(() => undefined);
  }, []);

  const onClientTool = useCallback(
    async (
      name: string,
      parameters: Record<string, unknown>,
      isCurrent: () => boolean,
    ): Promise<string> => {
      const injected = deps ? deps(userId).onClientTool : undefined;
      if (injected) return injected(name, parameters, isCurrent);
      const owner = ownerRef.current;
      const perm = isToolExecutionPermitted(owner);
      if (!perm.permitted || !isCurrent())
        throw new Error(perm.reason || 'Tool unavailable');
      // Legacy model tool arguments cannot invent or replace a student's request.
      // New structured tools keep their validated on-screen review contracts.
      if (name === 'prepare_lafina_action') {
        const pending = latestPendingReview(owner, 'voice');
        return pending
          ? `A review card is shown: ${pending.title}. Nothing has been saved. Check and confirm the card.`
          : groundedReply.current;
      }
      if (name === 'save_lafina_memory') {
        if (!explicitMemory(lastUserRequest.current))
          return 'No memory was saved. Ask the student what they want remembered.';
        parameters = {request: lastUserRequest.current};
      }
      if (callSettings.toolAudioCue) {
        try {
          Vibration.vibrate(20);
        } catch {
          // best-effort
        }
      }
      let toolError = false;
      const answer = await actionService.executeTool(
        owner,
        actionSession.current,
        name,
        parameters,
        isCurrent,
        {
          onError: () => {
            toolError = true;
          },
          onReadResult: result => {
            if (isCurrent() && owner === ownerRef.current)
              setReadResult(result);
          },
          onDraftCanceled: () => reviewRef.current.dismiss(),
          onProposal: result => {
            if (result.kind === 'proposal') {
              reviewRef.current.present(result.review);
              setLocalNote(
                'Check the card below. Nothing is saved until you tap Confirm.',
              );
            } else if (
              result.kind === 'note' ||
              result.kind === 'local_answer' ||
              result.kind === 'memory'
            ) {
              setLocalNote(result.reply);
            }
          },
          onMemoryProposal: (memProp, actionId) => {
            activeMemoryActionId.current = actionId;
            setActiveMemoryProposal(memProp);
            setLocalNote(
              'Check the memory card below. Nothing is saved until you tap Save.',
            );
          },
          onMultiActionBatch: batch => {
            setActiveMultiBatch(batch);
            setLocalNote(
              'Check the grouped actions card below. Nothing is saved until you tap Save All.',
            );
          },
        },
      );
      if (toolError) throw new Error('Tool request failed.');
      return answer;
    },
    [deps, userId, callSettings.toolAudioCue],
  );

  const handleSaveMemory = useCallback(
    (editedText?: string) => {
      if (!activeMemoryProposal || !activeMemoryActionId.current) return;
      const owner = ownerRef.current;
      const result = actionService.confirmMemoryProposal(
        owner,
        activeMemoryActionId.current,
        editedText,
      );
      if (result.success && result.status === 'saved') {
        setActiveMemoryProposal(prev =>
          prev
            ? {
                ...prev,
                text: editedText || prev.text,
                status: 'saved',
                savedMemoryId: result.memoryId,
              }
            : null,
        );
        setLocalNote('Saved to personal memory.');
      } else if (result.status === 'duplicate') {
        setActiveMemoryProposal(prev =>
          prev ? {...prev, status: 'duplicate'} : null,
        );
        setLocalNote('That fact is already in your memory.');
      } else if (result.status === 'disabled') {
        setActiveMemoryProposal(prev =>
          prev ? {...prev, status: 'disabled'} : null,
        );
        setLocalNote('Memory is turned off in Settings.');
      } else {
        setActiveMemoryProposal(prev =>
          prev ? {...prev, status: 'failed', error: result.error} : null,
        );
      }
    },
    [activeMemoryProposal],
  );

  const handleUndoMemory = useCallback(() => {
    if (!activeMemoryProposal || !activeMemoryActionId.current) return;
    const owner = ownerRef.current;
    const result = actionService.undoMemoryProposal(
      owner,
      activeMemoryActionId.current,
    );
    if (result.success) {
      setActiveMemoryProposal(prev =>
        prev ? {...prev, status: 'undone', savedMemoryId: null} : null,
      );
      setLocalNote('Memory change undone.');
    }
  }, [activeMemoryProposal]);

  const handleConfirmMultiAll = useCallback(async () => {
    if (!activeMultiBatch) return;
    try {
      const {batch, spokenSummary} =
        await actionService.confirmMultiActionBatch(
          ownerRef.current,
          activeMultiBatch,
        );
      if (
        ownerRef.current !== batch.ownerId ||
        actionSession.current !== batch.sessionId
      )
        return;
      setActiveMultiBatch(batch);
      setLocalNote(spokenSummary);
      if (
        ownerRef.current !== batch.ownerId ||
        actionSession.current !== batch.sessionId
      )
        return;
      void conversationRef.current?.sendContext(spokenSummary);
    } catch {
      setLocalNote(
        'Those grouped actions could not be saved. Review the card before retrying.',
      );
    }
  }, [activeMultiBatch]);

  const handleCancelMultiAll = useCallback(() => {
    if (!activeMultiBatch) return;
    const {batch, spokenSummary} = actionService.cancelMultiActionBatch(
      ownerRef.current,
      activeMultiBatch,
    );
    setActiveMultiBatch(batch);
    setLocalNote(spokenSummary);
  }, [activeMultiBatch]);

  const handleCancelMultiItem = useCallback(
    (itemId: string) => {
      if (!activeMultiBatch) return;
      const updated = cancelMultiItem(activeMultiBatch, itemId);
      setActiveMultiBatch({...updated});
    },
    [activeMultiBatch],
  );

  const handleRetryMultiItem = useCallback(
    async (itemId: string) => {
      if (!activeMultiBatch) return;
      try {
        const {batch, spokenSummary} = await actionService.retryMultiActionItem(
          ownerRef.current,
          activeMultiBatch,
          itemId,
        );
        if (
          ownerRef.current !== batch.ownerId ||
          actionSession.current !== batch.sessionId
        )
          return;
        setActiveMultiBatch(batch);
        setLocalNote(spokenSummary);
      } catch {
        setLocalNote(
          'That grouped action could not be retried. Please review the card.',
        );
      }
    },
    [activeMultiBatch],
  );

  const conversation = useVoiceConversation(userId, {
    onFinalUserText,
    onClientTool,
    deps,
  });
  conversationRef.current = conversation;
  const {snapshot} = conversation;
  const live = LIVE.has(snapshot.phase);
  const connecting = snapshot.phase === 'connecting';
  useEffect(() => {
    if (
      snapshot.phase !== 'ended' &&
      snapshot.phase !== 'restart_required' &&
      snapshot.phase !== 'failed'
    )
      return;
    turnTicket.current += 1;
    actionService.clearSessionActions(actionSession.current);
    const pending = latestPendingReview(userId, 'voice');
    if (pending) cancelReviewedCommand(userId, pending.operationId);
    reviewRef.current.dismiss();
    setActiveMemoryProposal(null);
    activeMemoryActionId.current = null;
    setActiveMultiBatch(null);
  }, [snapshot.phase, userId]);

  // Timer effect: tracks elapsed time in seconds during active call, with haptic cues
  useEffect(() => {
    if (live) {
      if (!callConnectedAt.current) {
        callConnectedAt.current = snapshot.connectedAt || Date.now();
        if (callSettings.callConnectedHaptics) {
          try {
            Vibration.vibrate(30);
          } catch {
            // best-effort
          }
        }
      }
      const interval = setInterval(() => {
        if (callConnectedAt.current) {
          setCallDuration(
            Math.floor((Date.now() - callConnectedAt.current) / 1000),
          );
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      if (callConnectedAt.current && callSettings.callEndHaptics) {
        try {
          Vibration.vibrate([0, 40, 30, 40]);
        } catch {
          // best-effort
        }
      }
      callConnectedAt.current = null;
      if (snapshot.phase === 'idle') {
        setCallDuration(0);
      }
    }
  }, [
    live,
    snapshot.phase,
    snapshot.connectedAt,
    callSettings.callConnectedHaptics,
    callSettings.callEndHaptics,
  ]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    actionSession.current = generateId('call-actions');
    voiceTurns.current = [];
    awaitingDetails.current = false;
    setConsented(voiceConsent.read(userId));
    setDataConsented(
      localSettingsStore.get(userId, DATA_CONSENT, null) === 'true',
    );
    setLocalNote(null);
    setReadResult(null);
    setSavedTarget(null);
    setTyped('');
    setShowTyping(false);
    setActiveMemoryProposal(null);
    activeMemoryActionId.current = null;
    setActiveMultiBatch(null);
    setCallSettings(getCallLafinaSettings(userId));
    return () => {
      actionService.clearSessionActions(actionSession.current);
      const pending = latestPendingReview(userId, 'voice');
      if (pending) cancelReviewedCommand(userId, pending.operationId);
    };
  }, [userId]);

  useEffect(() => {
    if (
      !directProviderTestEnabled() ||
      !dataConsented ||
      identityContextSent.current ||
      snapshot.phase !== 'listening'
    )
      return;
    const context = onboardingVoiceContext(userId);
    identityContextSent.current = true;
    if (context) void conversation.sendContext(context);
  }, [snapshot.phase, userId, dataConsented, conversation]);

  const scrollRef = useRef<ScrollView | null>(null);
  const mainScrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    if (isAtBottom && !transcriptCollapsed) {
      scrollRef.current?.scrollToEnd({animated: true});
    }
  }, [snapshot.turns, isAtBottom, transcriptCollapsed]);

  const hasActiveCard = Boolean(
    review?.proposal || activeMemoryProposal || activeMultiBatch,
  );
  useEffect(() => {
    if (hasActiveCard) {
      setTimeout(() => {
        mainScrollRef.current?.scrollTo({y: 120, animated: true});
      }, 80);
    }
  }, [hasActiveCard, review?.proposal?.operationId]);

  useEffect(() => {
    return () => {
      void ttsService.stop();
    };
  }, []);

  const handleStart = useCallback(() => {
    void ttsService.stop();
    const perm = isToolExecutionPermitted(ownerRef.current);
    if (!perm.permitted && perm.reason?.includes('disclosure')) {
      setEnableError('Please review the data disclosure before starting.');
      return;
    }
    actionService.clearSessionActions(actionSession.current);
    actionSession.current = generateId('call-actions');
    lastUserRequest.current = '';
    voiceTurns.current = [];
    awaitingDetails.current = false;
    groundedReply.current = 'No action was prepared. Nothing was saved.';
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
    if (!localSettingsStore.set(userId, DATA_CONSENT, 'true')) {
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
    const owner = userId;
    const session = actionSession.current;
    const decision = await reviewRef.current.confirm({speakReply: false});
    if (decision) {
      let reply = decision.reply;
      if (
        decision.outcome?.status === 'applied' &&
        decision.outcome.receipt.reminderId
      ) {
        const delivery = await verifyReminderDelivery(
          owner,
          decision.outcome.receipt.reminderId,
        );
        reply = delivery.message;
      }
      if (
        owner !== ownerRef.current ||
        session !== actionSession.current ||
        !conversationRef.current ||
        !LIVE.has(conversationRef.current.snapshot.phase)
      )
        return;
      setLocalNote(reply);
      if (decision.outcome?.status === 'applied') {
        const receipt = decision.outcome.receipt;
        const kind =
          receipt.entityType === 'time_block' ? 'block' : receipt.entityType;
        if (
          kind === 'note' ||
          kind === 'task' ||
          kind === 'event' ||
          kind === 'block' ||
          kind === 'reminder'
        ) {
          setSavedTarget({
            ownerId: userId,
            screen: kind === 'note' ? 'notes' : 'calendar',
            entityKind: kind,
            entityId: receipt.entityId || undefined,
          });
        }
      }
      void conversation.sendContext(
        `The student's on-screen review result: ${reply}`,
      );
    }
  }, [conversation, userId]);

  const handleCancelReview = useCallback(() => {
    const decision = reviewRef.current.cancel();
    if (decision) {
      setLocalNote(decision.reply);
      void conversation.sendContext(
        'The student canceled the review card. Nothing was saved.',
      );
    }
  }, [conversation]);

  const handleSendTyped = useCallback(async () => {
    const text = typed.trim();
    if (!text) return;
    if (await conversation.sendText(text)) setTyped('');
  }, [conversation, typed]);

  const handleBack = useCallback(() => {
    void ttsService.stop();
    conversation.end();
    onBack();
  }, [conversation, onBack]);

  const failure = snapshot.failure;
  const needsConsent = (!consented || !dataConsented) && !live && !connecting;
  const turns = snapshot.turns;
  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const latestUserTurn = [...turns].reverse().find(t => t.role === 'user');
  const latestAssistantTurn = [...turns]
    .reverse()
    .find(t => t.role === 'assistant');

  return (
    <View
      style={[styles.container, fullScreen && styles.fullScreenContainer]}
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

        <Text
          style={[styles.headerTitle, themed.title]}
          testID="call-header-title"
        >
          Call Lafina
        </Text>

        <View style={styles.headerRight}>
          {onMinimize && (
            <TouchableOpacity
              onPress={onMinimize}
              style={styles.settingsButton}
              accessibilityRole="button"
              accessibilityLabel="Minimize Call Lafina to mini bar"
              testID="call-minimize-button"
            >
              <Minimize2 size={18} color={colors.primary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setSettingsModalVisible(true)}
            style={styles.settingsButton}
            accessibilityRole="button"
            accessibilityLabel="Call Lafina settings"
            testID="call-settings-button"
          >
            <Sliders size={18} color={colors.primary} />
          </TouchableOpacity>

          <View
            style={[styles.onlinePill, themed.pill]}
            testID="call-status-badge"
          >
            {snapshot.muted ? (
              <>
                <MicOff size={12} color={colors.warning} />
                <Text
                  style={[styles.pillText, {color: colors.warning}]}
                  testID="call-muted-badge"
                >
                  Muted
                </Text>
              </>
            ) : connecting ? (
              <>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={[styles.pillText, {color: colors.primary}]}
                  testID="call-connecting-badge"
                >
                  Connecting
                </Text>
              </>
            ) : (
              <>
                <AudioLines size={12} color={colors.primary} />
                <Text
                  style={[styles.pillText, {color: colors.primary}]}
                  testID="call-online-badge"
                >
                  {live ? 'Online' : 'Not connected'}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Middle Scrollable Deck for Cards, Turns and Messages */}
      <ScrollView
        ref={mainScrollRef}
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
            <SynthWaveAvatar
              phase={snapshot.phase}
              outputLevel={snapshot.outputLevel ?? 0}
              muted={snapshot.muted}
              size={76}
            />
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

        {needsConsent ? (
          <View
            style={[styles.card, themed.card]}
            testID="voice-conversation-consent"
          >
            <Text style={[styles.cardTitle, themed.text]}>
              Before you start
            </Text>
            <Text style={[styles.cardBody, themed.text]}>
              While a call is open, your microphone audio streams to ElevenLabs
              for transcription and speech, and your words go to DeepSeek and
              LAFINA's server for answers. If you ask about your calendar, notes
              or saved memories, bounded relevant records are shared with the
              voice provider. Capture continues when minimized inside the app,
              with a visible call strip. It stops when you tap End or leave the
              app, and you can mute at any time. Finished turns are saved to
              your Chat history. Planner changes still need your Confirm.
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

        {/* Promoted Action Card Stage (Immediate focus above history, no scrolling needed) */}
        {hasActiveCard ? (
          <View
            style={styles.actionCardSection}
            testID="call-action-card-stage"
          >
            <ActionCardHost
              proposal={review?.proposal}
              memoryProposal={activeMemoryProposal}
              multiActionBatch={activeMultiBatch}
              expired={review?.expired}
              busy={review?.busy}
              onConfirm={() => {
                void handleConfirm();
              }}
              onCancel={() => {
                if (activeMultiBatch) {
                  handleCancelMultiAll();
                  setActiveMultiBatch(null);
                } else if (activeMemoryProposal) {
                  if (activeMemoryActionId.current) {
                    actionService.cancelMemoryProposal(
                      ownerRef.current,
                      activeMemoryActionId.current,
                    );
                    activeMemoryActionId.current = null;
                  }
                  setActiveMemoryProposal(null);
                } else {
                  handleCancelReview();
                }
              }}
              onDismiss={() => {
                if (activeMultiBatch) {
                  setActiveMultiBatch(null);
                } else if (activeMemoryProposal) {
                  setActiveMemoryProposal(null);
                } else {
                  review.dismiss();
                }
              }}
              onSaveMemory={handleSaveMemory}
              onUndoMemory={handleUndoMemory}
              onConfirmMultiAll={handleConfirmMultiAll}
              onCancelMultiAll={handleCancelMultiAll}
              onCancelMultiItem={handleCancelMultiItem}
              onRetryMultiItem={handleRetryMultiItem}
              onOpenMultiItem={
                onNavigate
                  ? item => {
                      if (item.status === 'saved' && item.savedEntityId)
                        onNavigate({
                          ownerId: userId,
                          screen: item.kind === 'note' ? 'notes' : 'calendar',
                          entityKind: item.kind,
                          entityId: item.savedEntityId,
                          date: item.date,
                        });
                    }
                  : undefined
              }
              onEditMultiItemFields={(itemId, patch) => {
                if (!activeMultiBatch) return;
                const updated = reviseMultiItem(
                  activeMultiBatch,
                  itemId,
                  patch,
                );
                setActiveMultiBatch({...updated});
              }}
              onEditMultiItemTitle={(itemId, title) => {
                setActiveMultiBatch(previous =>
                  previous
                    ? {
                        ...previous,
                        revision: previous.revision + 1,
                        items: previous.items.map(item =>
                          item.id === itemId && item.status !== 'saved'
                            ? {...item, title}
                            : item,
                        ),
                      }
                    : null,
                );
              }}
              testIDPrefix="voice-conversation-review"
            />
            {review?.proposal && !review.busy && (
              <View style={styles.draftRevisionRow}>
                <TextInput
                  value={draftCorrection}
                  onChangeText={setDraftCorrection}
                  accessibilityLabel="Edit draft date, time, title or note content"
                  placeholder="Need changes? Type or speak (e.g. 'Change to 4 PM')"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.draftRevisionInput,
                    {
                      color: colors.textPrimary,
                      borderColor: colors.border,
                      backgroundColor: colors.inputBg,
                    },
                  ]}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Update draft"
                  style={[
                    styles.draftRevisionBtn,
                    {
                      backgroundColor: draftCorrection.trim()
                        ? colors.primary
                        : colors.inputBg,
                      borderColor: colors.border,
                    },
                  ]}
                  disabled={!draftCorrection.trim()}
                  onPress={() => {
                    const current = reviewRef.current.proposal;
                    if (!current) return;
                    const revised = reviseReviewedCommand(
                      userId,
                      current.operationId,
                      draftCorrection,
                    );
                    if (revised.status === 'proposal') {
                      reviewRef.current.present(revised);
                      setDraftCorrection('');
                    }
                    setLocalNote(revised.reply);
                  }}
                >
                  <Text
                    style={{
                      color: draftCorrection.trim()
                        ? colors.textOnPrimary
                        : colors.textSecondary,
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                  >
                    Update
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : null}

        {/* Active Topic Showcase (ChatGPT-style: Topic at a time) */}
        {latestTurn && (
          <View
            style={[
              styles.activeTopicCard,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
              },
            ]}
            testID="call-active-topic"
          >
            <View style={styles.activeTopicHeaderRow}>
              <View
                style={[
                  styles.activeTopicDot,
                  {
                    backgroundColor: live
                      ? colors.primary
                      : colors.textSecondary,
                  },
                ]}
              />
              <Text
                style={[styles.activeTopicBadge, {color: colors.textSecondary}]}
              >
                ACTIVE TOPIC
              </Text>
            </View>
            {latestUserTurn && (
              <View style={styles.activeTopicPromptRow}>
                <Text style={[styles.activeTopicRole, {color: colors.primary}]}>
                  You
                </Text>
                <Text
                  style={[
                    styles.activeTopicText,
                    {color: colors.textPrimary},
                    latestUserTurn.status === 'provisional' &&
                      styles.provisional,
                  ]}
                  numberOfLines={3}
                >
                  {latestUserTurn.text}
                </Text>
              </View>
            )}
            {latestAssistantTurn && latestAssistantTurn.text ? (
              <View style={styles.activeTopicReplyRow}>
                <Text
                  style={[
                    styles.activeTopicRole,
                    {color: colors.textSecondary},
                  ]}
                >
                  LAFINA{' '}
                  {latestAssistantTurn.status === 'interrupted'
                    ? '· interrupted'
                    : ''}
                </Text>
                <Text
                  style={[
                    styles.activeTopicReplyText,
                    {color: colors.textPrimary},
                    latestAssistantTurn.status === 'provisional' &&
                      styles.provisional,
                  ]}
                >
                  {latestAssistantTurn.text}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {snapshot.turns.length > 0 ? (
          <View
            style={styles.transcriptContainer}
            testID="call-transcript-container"
          >
            <TouchableOpacity
              style={[styles.transcriptToggle, themed.pill]}
              onPress={() => setTranscriptCollapsed(prev => !prev)}
              accessibilityRole="button"
              accessibilityLabel={
                transcriptCollapsed
                  ? 'Expand transcript'
                  : 'Collapse transcript'
              }
              testID="call-transcript-toggle"
            >
              <Text style={[styles.transcriptToggleText, themed.muted]}>
                {transcriptCollapsed
                  ? `Transcript (${snapshot.turns.length}) · Tap to expand`
                  : 'Transcript · Tap to collapse'}
              </Text>
            </TouchableOpacity>

            {!transcriptCollapsed ? (
              <View style={styles.transcriptWrapper}>
                <ScrollView
                  ref={scrollRef}
                  style={[styles.transcript, themed.card]}
                  contentContainerStyle={styles.transcriptContent}
                  nestedScrollEnabled
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  testID="voice-conversation-transcript"
                >
                  {snapshot.turns.map(turn => (
                    <View
                      key={turn.id}
                      style={[
                        styles.turn,
                        turn.role === 'user'
                          ? styles.userTurn
                          : styles.agentTurn,
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
                          callSettings.captionSize === 'large' &&
                            styles.turnTextLarge,
                          callSettings.captionSize === 'extra_large' &&
                            styles.turnTextExtraLarge,
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
                {!isAtBottom ? (
                  <TouchableOpacity
                    style={[
                      styles.jumpButton,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={jumpToLatest}
                    accessibilityRole="button"
                    accessibilityLabel="Jump to latest transcript message"
                    testID="call-jump-to-latest"
                  >
                    <Text
                      style={[styles.jumpButtonText, {color: colors.primary}]}
                    >
                      Jump to latest ↓
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
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

        {onNavigate && (
          <TouchableOpacity
            style={{minHeight: 48, justifyContent: 'center'}}
            accessibilityRole="button"
            accessibilityLabel="Read earlier Chat messages"
            onPress={() => onNavigate({ownerId: userId, screen: 'chat'})}
          >
            <Text style={{color: colors.primary}}>Open Chat history</Text>
          </TouchableOpacity>
        )}
        {readResult !== null && (
          <CallReadResults
            result={readResult}
            ownerId={userId}
            onDismiss={() => setReadResult(null)}
            onNavigate={onNavigate}
          />
        )}
        {savedTarget && onNavigate && (
          <TouchableOpacity
            style={{minHeight: 48, justifyContent: 'center'}}
            accessibilityRole="button"
            accessibilityLabel="Open saved item"
            onPress={() => onNavigate(savedTarget)}
          >
            <Text style={{color: colors.primary}}>Open saved item</Text>
          </TouchableOpacity>
        )}

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
                style={[
                  styles.primaryButton,
                  {backgroundColor: colors.primary},
                ]}
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
      <View
        style={[styles.dockContainer, themed.dock]}
        testID="call-control-dock"
      >
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
              {snapshot.phase === 'ended' ? 'Call Lafina again' : 'Call Lafina'}
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
              accessibilityLabel={
                showTyping
                  ? 'Return to voice only'
                  : 'Type a turn instead of speaking'
              }
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

      {/* Call Settings Modal */}
      <CallLafinaSettingsModal
        userId={userId}
        visible={settingsModalVisible}
        isCallActive={live || connecting}
        onClose={() => setSettingsModalVisible(false)}
        onSettingsChanged={newSettings => {
          setCallSettings(newSettings);
          conversation.setPreferences(newSettings);
        }}
      />
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
    flexWrap: 'wrap',
    gap: 8,
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsButton: {
    padding: 6,
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    minHeight: 0,
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
  transcriptContainer: {width: '100%', marginVertical: 6},
  transcriptToggle: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 6,
  },
  transcriptToggleText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  transcriptWrapper: {position: 'relative', width: '100%'},
  jumpButton: {
    minHeight: 44,
    justifyContent: 'center',
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 3,
  },
  jumpButtonText: {fontFamily: Fonts.body, fontSize: 12, fontWeight: 'bold'},
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
  turnTextLarge: {fontSize: 18, lineHeight: 25},
  turnTextExtraLarge: {fontSize: 22, lineHeight: 30},
  provisional: {fontStyle: 'italic'},
  placeholder: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  notice: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  hint: {fontFamily: Fonts.body, fontSize: 12, lineHeight: 16},
  dockContainer: {
    flexShrink: 0,
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
    flexWrap: 'wrap',
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
  actionCardSection: {
    width: '100%',
    marginVertical: 4,
  },
  draftRevisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  draftRevisionInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  draftRevisionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  activeTopicCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    marginVertical: 4,
  },
  activeTopicHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  activeTopicDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeTopicBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  activeTopicPromptRow: {
    gap: 2,
  },
  activeTopicReplyRow: {
    gap: 2,
    marginTop: 2,
  },
  activeTopicRole: {
    fontSize: 11,
    fontWeight: '600',
  },
  activeTopicText: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: Fonts.body,
  },
  activeTopicReplyText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
  },
});
