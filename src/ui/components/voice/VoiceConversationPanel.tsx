import {verifyReminderDelivery} from '../../../scheduler/verifyReminderDelivery';
import {CallReadResults} from '../callLafina/CallReadResults';
import type {LocalVoiceResult} from '../../../cloud/voiceConversation/localVoiceData';
import type {CallNavigationTarget} from '../../navigation/callNavigation';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
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
import {Fonts, ModernLayout} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import {chatOrchestrator} from '../../../ai/chatOrchestrator';
import {UndoSnackbar} from '../chat/UndoSnackbar';
import type {PrepareResult, UndoOffer} from '../../../ai/nlu/commandReview';
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
import {
  actionService,
  SUGGESTED_CONFIRM_REFUSAL,
} from '../../../ai/voiceActions/actionService';
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
import {buildStudentVoiceContext} from '../../../cloud/voiceConversation/localVoiceData';
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
  appliedReviewReply,
} from '../../../ai/nlu/commandReview';
import {
  hasStructuredAction,
  prepareStructuredReview,
  SUGGESTED_CARD_NOTE,
} from '../../../ai/voiceActions/structuredAction';
import type {StructuredActionArgs} from '../../../ai/voiceActions/structuredAction';
import {validatePayload} from '../../../ai/voiceActions/actionValidator';

import {
  hasDraftApproval,
  isCompoundVoiceRequest,
} from '../../../cloud/voiceConversation/turnPolicy';

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
  /**
   * A card that needs the student's answer was just put on screen. The host
   * brings a minimized call forward so the card is never out of sight.
   */
  onAttention?: () => void;
  /** Tests inject fakes. */
  deps?: (userId: string) => VoiceConversationDeps;
  /** Whether the panel is rendered in full-screen presentation. Defaults to true. */
  fullScreen?: boolean;
}

const PHASE_TEXT: Record<ConversationPhase, string> = {
  idle: '',
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
  return PHASE_TEXT[snapshot.phase] ?? '';
};

/** What the model hears when nothing was prepared; it must not claim a card. */
const NO_ACTION_REPLY =
  'No action was prepared and no card is on screen. Nothing was saved. Do not tell the student a card is shown. Ask them to say what to add or change, with a day and time if it needs one.';

/** Shown when LAFINA talks about a card that is not on screen. */
const NO_CARD_NOTE =
  'No card was prepared, so nothing was saved. Say what to add or change again, or tap Type.';

/** LAFINA telling the student a card or draft is on screen. */
const CARD_CLAIM_RE =
  /\b(?:card|draft)\b[^.?!]*\b(?:on\s+(?:your|the)\s+screen|is\s+(?:now\s+)?(?:shown|showing|ready|up)|check|review|confirm|tap)\b|\b(?:put|placed|prepared|showing|pulled\s+up)\b[^.?!]*\b(?:card|draft)\b|\b(?:check|review|confirm|tap)\b[^.?!]*\b(?:card|draft)\b/i;
/** "There is no card", "I could not prepare a draft": not a claim. */
const CARD_DENIAL_RE =
  /\b(?:no|not|never|without|cannot|can['’]?t|couldn['’]?t|didn['’]?t|wasn['’]?t|isn['’]?t)\b[^.?!]*\b(?:card|draft)\b/i;

/** How long a card may still arrive after LAFINA mentions it. */
const CARD_CLAIM_GRACE_MS = 600;

type CardKind = 'review' | 'batch' | 'memory';

const LIVE = new Set<ConversationPhase>([
  'listening',
  'thinking',
  'tool_working',
  'speaking',
]);

const isVoiceDraftRevision = (text: string): boolean => {
  const t = text.trim();
  if (
    !t ||
    /\b(?:wait|hold on)[^a-z0-9]*(?:i['\u2019]?m|i am)\s+thinking\b/i.test(t)
  ) {
    return false;
  }
  if (
    /^(?:what|which|who|where|when|why|how\s+(?:many|much|long\s+is\s+my)|do\s+i|is\s+(?:there|that|it)\s+on|check|find|search|show|list)\b/i.test(
      t,
    ) &&
    !/^(?:what|how)\s+about\b/i.test(t)
  ) {
    return false;
  }
  return (
    /^(?:actually|no[, ]|change|make\s+(?:it|that|the)|move\s+(?:it|that|this|the)|shift\s+(?:it|that|this)|reschedule(?:\s+(?:it|that|this))?|set\s+(?:it|that|the\s+(?:time|date|title|duration|reminder))|update\s+(?:it|that|the)|edit\s+(?:it|that|the)|instead|rename|call\s+it|title(?:\s+it)?(?:\s+to|:)|let['\u2019]?s\s+(?:do|make|move|change|set)|how\s+about|what\s+about)\b/i.test(
      t,
    ) ||
    (/\b(?:change|move|shift|reschedule|update|edit|rename|make|set|put|schedule)\b/i.test(
      t,
    ) &&
      /\b(?:it|that|this|the\s+(?:time|date|title|name|duration|meeting|task|reminder|event|block|note))\b/i.test(
        t,
      )) ||
    /\binstead[.!?]*$/i.test(t)
  );
};

export const VoiceConversationPanel: React.FC<VoiceConversationPanelProps> = ({
  userId,
  review,
  onBack,
  onMinimize,
  onNavigate,
  onAttention,
  deps,
  fullScreen = true,
}) => {
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const modernCardStyle = isModern
    ? [
        modernShadows.card,
        {
          borderRadius: ModernLayout.borderRadiusCard,
          backgroundColor: modernPalette.card,
          borderColor: modernPalette.border,
        },
      ]
    : null;
  const [readResult, setReadResult] = useState<LocalVoiceResult | null>(null);
  const [localNote, setLocalNote] = useState<string | null>(null);
  // "Marked done · Undo" after an immediate action (audit finding 10).
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null);
  const hideUndo = useCallback(() => setUndoOffer(null), []);
  const [typed, setTyped] = useState('');
  const [draftCorrection, setDraftCorrection] = useState('');
  const [showTyping, setShowTyping] = useState(false);
  const [consented, setConsented] = useState(() => voiceConsent.read(userId));
  const [dataConsented, setDataConsented] = useState(
    () => localSettingsStore.get(userId, DATA_CONSENT, null) === 'true',
  );
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [dismissedTurnId, setDismissedTurnId] = useState<string | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const turnTicket = useRef(0);
  const ownerRef = useRef(userId);
  const actionSession = useRef(generateId('call-actions'));
  ownerRef.current = userId;
  const lastUserRequest = useRef('');
  const preparedTurn = useRef<{
    ticket: number;
    signature: string;
    id: string;
  } | null>(null);
  /** The student's words the device already executed this call (audit L10). */
  const executedTurn = useRef<{text: string; reply: string} | null>(null);
  const voiceTurns = useRef<string[]>([]);
  const awaitingDetails = useRef(false);
  const groundedReply = useRef(NO_ACTION_REPLY);
  /**
   * The device's reading of the student's latest turn. The model's
   * prepare_lafina_action for the same words waits for it instead of reading
   * them a second time (two cards, one replacing the other).
   */
  const turnReview = useRef<{
    text: string;
    done: Promise<void>;
    handled: boolean;
  } | null>(null);
  const attentionRef = useRef(onAttention);
  attentionRef.current = onAttention;
  /** Which card the stage shows when more than one is open. */
  const [cardFocus, setCardFocus] = useState<CardKind | null>(null);
  const lastLocalRevision = useRef<{
    oldId: string;
    newId: string;
    utterance: string;
    reply: string;
    at: number;
  } | null>(null);
  const confirmHandlersRef = useRef<{
    confirmDraft: () => Promise<{saved: boolean; message: string}>;
    saveMemory: (editedText?: string) => {saved: boolean; message: string};
    confirmMultiAll: () => Promise<{saved: boolean; message: string}>;
  }>({
    confirmDraft: async () => ({
      saved: false,
      message: 'No draft ready. Nothing has been saved.',
    }),
    saveMemory: () => ({
      saved: false,
      message: 'No memory draft ready. Nothing has been saved.',
    }),
    confirmMultiAll: async () => ({
      saved: false,
      message: 'No batch ready. Nothing has been saved.',
    }),
  });
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
  /**
   * Puts a review card on the stage and in front. A memory or grouped card
   * that is already finished (saved, cancelled) steps aside, so the card
   * LAFINA is talking about is the one the student sees.
   */
  const presentReview = useCallback(
    (prepared: PrepareResult | null | undefined): boolean => {
      if (prepared?.status !== 'proposal') return false;
      reviewRef.current.present(prepared);
      const cards = currentCards.current;
      if (cards.memory && cards.memory.status !== 'draft') {
        setActiveMemoryProposal(null);
        activeMemoryActionId.current = null;
      }
      if (
        cards.batch &&
        cards.batch.status !== 'draft' &&
        cards.batch.status !== 'partial' &&
        cards.batch.status !== 'failed'
      ) {
        setActiveMultiBatch(null);
      }
      setCardFocus('review');
      return true;
    },
    [],
  );
  const showMemoryCard = useCallback(
    (proposal: MemoryProposalData, actionId: string): void => {
      activeMemoryActionId.current = actionId;
      setActiveMemoryProposal(proposal);
      setCardFocus('memory');
    },
    [],
  );
  const showBatchCard = useCallback((batch: MultiActionBatchData): void => {
    setActiveMultiBatch(batch);
    setCardFocus('batch');
  }, []);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [callSettings, setCallSettings] = useState<CallLafinaSettings>(() =>
    getCallLafinaSettings(userId),
  );

  // Live call duration timer
  const [callDuration, setCallDuration] = useState(0);
  const callConnectedAt = useRef<number | null>(null);

  // Keep the live avatar visible in compact form alongside active cards.
  // Read questions can use local data immediately. Online tools interpret
  // planner changes into structured review cards before student confirmation.
  const onFinalUserText = useCallback(
    (text: string) => {
      if (!isToolExecutionPermitted(ownerRef.current).permitted) return;
      const session = actionSession.current;
      const ticket = ++turnTicket.current;
      voiceTurns.current = [...voiceTurns.current, text].slice(-8);
      lastUserRequest.current = text;
      // What an earlier turn prepared is not this turn's answer: a stale "card
      // is on screen" here made LAFINA announce a card that was long gone.
      groundedReply.current = NO_ACTION_REPLY;
      turnReview.current = null;
      const owner = ownerRef.current;
      const fact = explicitMemory(text);
      if (fact) {
        const prepared = actionService.createMemoryProposal(
          owner,
          actionSession.current,
          fact,
          text,
        );
        showMemoryCard(prepared.proposal, prepared.actionId);
        setLocalNote('Review the memory card. Nothing has been saved.');
        void conversationRef.current?.sendContext(
          'Memory review card shown for "' +
            prepared.proposal.text +
            '". Card ID: ' +
            prepared.actionId +
            '; revision: 1. Ask the student to confirm; the app handles spoken or tapped approval and reports the save receipt.',
        );
        return;
      }
      const cards = currentCards.current;
      const pending = latestPendingReview(owner, 'voice');
      const memoryOpen = cards.memory?.status === 'draft';
      const batchOpen =
        cards.batch &&
        (cards.batch.status === 'draft' ||
          cards.batch.status === 'partial' ||
          cards.batch.status === 'failed');
      const openCount =
        Number(!!pending) + Number(memoryOpen) + Number(!!batchOpen);
      const trimmed = text.trim();

      if (
        /^(?:actually[, ]+)?(?:cancel(?:\s+that|\s+it)?(?:[, ]+do\s+not\s+create\s+it)?|never\s*mind|don['\u2019]?t\s+save(?:\s+(?:it|that))?|discard(?:\s+(?:it|that))?)[.!]?$/i.test(
          trimmed,
        )
      ) {
        voiceTurns.current = [];
        awaitingDetails.current = false;
        if (openCount > 1) {
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
          const result = actionService.cancelMultiActionBatch(
            owner,
            cards.batch,
          );
          setActiveMultiBatch(result.batch);
          setLocalNote(result.spokenSummary);
          return;
        }
        if (pending) {
          cancelReviewedCommand(owner, pending.operationId);
          reviewRef.current.dismiss();
          voiceTurns.current = [];
          awaitingDetails.current = false;
          groundedReply.current = 'Draft canceled. Nothing was saved.';
          setLocalNote(groundedReply.current);
          return;
        }
        setLocalNote('Request canceled. Nothing was saved.');
        return;
      }

      if (
        openCount === 1 &&
        hasDraftApproval(
          trimmed,
          [...(conversationRef.current?.snapshot.turns ?? [])]
            .reverse()
            .find(
              turn =>
                turn.role === 'assistant' && turn.status !== 'provisional',
            )?.text ?? '',
        )
      ) {
        awaitingDetails.current = false;
        voiceTurns.current = [];
        groundedReply.current =
          'The student just confirmed the open card by voice and the app is saving it. Do not prepare it again.';
        if (pending) {
          void confirmHandlersRef.current.confirmDraft();
          return;
        }
        if (memoryOpen) {
          const memRes = confirmHandlersRef.current.saveMemory();
          void conversationRef.current?.sendContext(
            'Confirmed and handled memory draft: ' + memRes.message,
          );
          return;
        }
        if (batchOpen) {
          void confirmHandlersRef.current.confirmMultiAll();
          return;
        }
      }

      const fragment = parseIntentFastPath(text);
      const hasRevisionDelta = Boolean(
        fragment.date ||
          fragment.time ||
          fragment.endTime ||
          fragment.durationMinutes,
      );
      if (
        pending &&
        (isVoiceDraftRevision(trimmed) ||
          (!isVoiceScheduleStart(trimmed) &&
            hasRevisionDelta &&
            !/^(?:what|which|when|where|who|why|how|show|list|check|find|search|do\s+i|am\s+i|is\s+there|can\s+you\s+(?:show|check|find))\b/i.test(
              trimmed,
            )))
      ) {
        const revised = reviseReviewedCommand(owner, pending.operationId, text);
        if (
          revised.status === 'proposal' &&
          actionService.isSuggestedCard(pending.operationId)
        )
          actionService.markSuggestedCard(revised.proposal.operationId);
        if (revised.status === 'proposal') {
          presentReview(revised);
          lastLocalRevision.current = {
            oldId: pending.operationId,
            newId: revised.proposal.operationId,
            utterance: text,
            reply: revised.reply,
            at: Date.now(),
          };
          groundedReply.current =
            'A review card is shown: ' +
            revised.proposal.title +
            ' (' +
            revised.proposal.details.join(', ') +
            '). Card ID: ' +
            revised.proposal.operationId +
            '; revision: 1. Nothing has been saved yet. Ask the student to confirm; wait for the app save receipt.';
          setLocalNote(revised.reply);
          void conversationRef.current?.sendContext(
            'Draft card updated on screen: ' +
              revised.proposal.title +
              ' (' +
              revised.proposal.details.join(', ') +
              '). Card ID: ' +
              revised.proposal.operationId +
              '; revision: 1. Summarize the updated draft and call confirm_draft when the student confirms or asks you to save it.',
          );
        } else {
          setLocalNote(revised.reply);
          void conversationRef.current?.sendContext(
            'The student asked to adjust the open draft ("' +
              pending.title +
              '", Card ID: ' +
              pending.operationId +
              ', revision: 1) with "' +
              text +
              '". ' +
              revised.reply +
              ' If they specified concrete details, call revise_draft with this Card ID.',
          );
        }
        return;
      }

      // The live online model already has the conversation. Let its structured
      // tool describe mutations instead of racing a second LLM/local parser.
      if (
        fragment.intent.startsWith('create_') ||
        fragment.intent.startsWith('update_') ||
        fragment.intent.startsWith('delete_') ||
        fragment.intent === 'reschedule' ||
        isVoiceScheduleStart(text)
      ) {
        setLocalNote(null);
        return;
      }
      setLocalNote(null);
      if (
        directProviderTestEnabled() ||
        !['query_schedule', 'query_notes'].includes(fragment.intent)
      )
        return;
      const tracked = {text, done: Promise.resolve(), handled: false};
      turnReview.current = tracked;
      tracked.done = chatOrchestrator
        .reviewSpokenTurn(owner, text, {
          onlineMode: false,
          actionSessionId: session,
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
            if (
              result.kind === 'proposal' &&
              result.review.status === 'proposal'
            )
              cancelReviewedCommand(owner, result.review.proposal.operationId);
            return;
          }
          tracked.handled = true;
          if (result.kind === 'proposal') {
            if (presentReview(result.review))
              setLocalNote(
                'Check the card — nothing is saved until confirmed.',
              );
            if (result.review.status === 'proposal') {
              void conversationRef.current?.sendContext(
                'A review card is shown: ' +
                  result.review.proposal.title +
                  ' (' +
                  result.review.proposal.details.join(', ') +
                  '). Card ID: ' +
                  result.review.proposal.operationId +
                  '; revision: 1. Ask the student to confirm; wait for the app save receipt.',
              );
            }
          } else if (result.kind === 'executed') {
            executedTurn.current = {text, reply: result.reply};
            setLocalNote(result.reply);
            setUndoOffer(result.undo ?? null);
            groundedReply.current = result.reply;
            const updatedContext = buildStudentVoiceContext(owner);
            void conversationRef.current?.sendContext(
              `Executed immediately on device: ${result.reply}${
                updatedContext
                  ? `\n\n[UPDATED PLANNER CONTEXT]\n${updatedContext}`
                  : ''
              }`,
            );
          } else if (result.kind === 'multi') {
            reviewRef.current.dismiss();
            showBatchCard(result.batch);
            setLocalNote(result.reply);
            groundedReply.current = `Grouped review card is now on screen with ${result.batch.items.length} items. Nothing has been saved yet. Tell the student to review and tap Confirm All.`;
            void conversationRef.current?.sendContext(
              `Grouped review card is now on screen with ${result.batch.items.length} items. Tell the student to review and confirm all or cancel.`,
            );
          } else if (
            result.kind === 'note' ||
            result.kind === 'local_answer' ||
            result.kind === 'memory'
          ) {
            setLocalNote(result.reply);
            groundedReply.current = result.reply;
            void conversationRef.current?.sendContext(
              `Local verified database result for student request "${text}": ${result.reply}`,
            );
          }
        })
        .catch(() => undefined);
    },
    [presentReview, showBatchCard, showMemoryCard],
  );

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
        if (isCompoundVoiceRequest(lastUserRequest.current))
          return 'This request contains multiple actions. Use prepare_multi_action with separate structured items. No single-item card was prepared.';
        const fields = parameters as StructuredActionArgs;
        if (hasStructuredAction(fields)) {
          const checked = validatePayload('legacy.prepare_action', parameters);
          if (!checked.valid) return `Nothing was prepared: ${checked.error}`;
          const signature = JSON.stringify(
            Object.entries(checked.data as Record<string, unknown>).sort(
              ([a], [b]) => a.localeCompare(b),
            ),
          );
          const prior = preparedTurn.current;
          const pending = latestPendingReview(owner, 'voice');
          if (
            prior?.ticket === turnTicket.current &&
            prior.signature === signature &&
            pending?.operationId === prior.id
          )
            return `Review card is already shown: ${pending.title}. Card ID: ${pending.operationId}; revision: 1. Nothing was saved.`;
          const prepared = prepareStructuredReview(
            owner,
            checked.data as StructuredActionArgs,
            'voice',
          );
          if (!isCurrent()) {
            if (prepared?.status === 'proposal')
              cancelReviewedCommand(owner, prepared.proposal.operationId);
            return 'Request canceled. Nothing was saved.';
          }
          if (prepared?.status === 'proposal') {
            preparedTurn.current = {
              ticket: turnTicket.current,
              signature,
              id: prepared.proposal.operationId,
            };
            actionService.markSuggestedCard(prepared.proposal.operationId);
            presentReview(prepared);
            setLocalNote(
              'Check the card — nothing is saved until you confirm.',
            );
            return `Review card is now on screen: ${
              prepared.proposal.title
            }. ${prepared.proposal.details.join(' ')} Card ID: ${
              prepared.proposal.operationId
            }; revision: 1. ${SUGGESTED_CARD_NOTE}`;
          }
          return (
            prepared?.reply ||
            'The action needs more details. Nothing was saved.'
          );
        }
        // Compatibility for an older agent: parse only actual finalized user
        // turns, never the tool's rewritten request. Modern agents supply fields.
        if (voiceTurns.current.some(isVoiceScheduleStart)) {
          const draft = groundedVoiceDraft(voiceTurns.current, new Date());
          if (draft.kind === 'clarify') {
            setLocalNote(draft.reply);
            return draft.reply;
          }
          const prepared = prepareReviewedCommand(owner, draft.intent, {
            surface: 'voice',
          });
          if (prepared.status === 'proposal') {
            presentReview(prepared);
            setLocalNote('Check the card — nothing is saved until confirmed.');
            return `Review card is now on screen: ${prepared.proposal.title}. Card ID: ${prepared.proposal.operationId}; revision: 1. Nothing has been saved. Ask the student to confirm.`;
          }
          return prepared.reply;
        }
        // The device may still be reading the same words. Wait for that one
        // reading instead of starting a second: two readings made two cards,
        // and the later one cancelled the card already on screen.
        const sameTurn =
          turnReview.current?.text === lastUserRequest.current
            ? turnReview.current
            : null;
        if (sameTurn) {
          await sameTurn.done;
          if (!isCurrent()) {
            throw new Error(
              'Request cancelled because conversational turn updated.',
            );
          }
        }
        let pending = latestPendingReview(owner, 'voice');
        // The student's own turn already ran this low-risk request (complete,
        // pin…); never evaluate the same words a second time (audit L10).
        if (
          !pending &&
          executedTurn.current &&
          executedTurn.current.text === lastUserRequest.current
        ) {
          return `Done. Already executed on device: ${executedTurn.current.reply}`;
        }
        if (
          !pending &&
          !sameTurn?.handled &&
          !awaitingDetails.current &&
          lastUserRequest.current &&
          !directProviderTestEnabled()
        ) {
          const reviewed = await chatOrchestrator
            .reviewSpokenTurn(owner, lastUserRequest.current, {
              onlineMode: true,
              actionSessionId: actionSession.current,
              isCurrent,
            })
            .catch(() => null);
          if (!isCurrent()) {
            throw new Error(
              'Request cancelled because conversational turn updated.',
            );
          }
          if (
            reviewed?.kind === 'proposal' &&
            reviewed.review.status === 'proposal'
          ) {
            presentReview(reviewed.review);
            setLocalNote('Check the card — nothing is saved until confirmed.');
            pending = reviewed.review.proposal;
          } else if (reviewed?.kind === 'executed') {
            setLocalNote(reviewed.reply);
            setUndoOffer(reviewed.undo ?? null);
            groundedReply.current = reviewed.reply;
            return `Done. Executed immediately: ${reviewed.reply}`;
          } else if (reviewed?.kind === 'multi') {
            reviewRef.current.dismiss();
            showBatchCard(reviewed.batch);
            setLocalNote(reviewed.reply);
            groundedReply.current = reviewed.reply;
            return `Grouped review card is now on screen with ${reviewed.batch.items.length} items. Tell the student to review and tap Confirm All.`;
          } else if (
            reviewed &&
            (reviewed.kind === 'note' ||
              reviewed.kind === 'local_answer' ||
              reviewed.kind === 'memory')
          ) {
            setLocalNote(reviewed.reply);
            groundedReply.current = reviewed.reply;
          }
        }
        // "On screen" has to be true: a pending draft that the stage is not
        // showing (prepared elsewhere, or hidden) is put there first.
        if (
          pending &&
          reviewRef.current.proposal?.operationId !== pending.operationId
        ) {
          presentReview({
            status: 'proposal',
            proposal: pending,
            reply: pending.reply,
          });
          setLocalNote('Check the card — nothing is saved until confirmed.');
        } else if (pending) {
          setCardFocus('review');
        }
        return pending
          ? 'Review card is now on screen: ' +
              pending.title +
              ' (' +
              pending.details.join(', ') +
              '). Card ID: ' +
              pending.operationId +
              '; revision: 1. Nothing has been saved yet. Always speak directly in first person ("I", "me", "my") and tell the student to review and confirm it. Call confirm_draft if they confirm.'
          : groundedReply.current;
      }
      if (
        name === 'revise_draft' &&
        lastLocalRevision.current &&
        parameters.cardId === lastLocalRevision.current.oldId &&
        Date.now() - lastLocalRevision.current.at < 8000
      ) {
        const incomingInst = String(parameters.instruction || '')
          .trim()
          .toLowerCase();
        if (
          incomingInst ===
          lastLocalRevision.current.utterance.trim().toLowerCase()
        ) {
          return (
            'A review card is shown: ' +
            lastLocalRevision.current.reply +
            ' Card ID: ' +
            lastLocalRevision.current.newId +
            '; revision: 1. Nothing has been saved yet. Ask the student to confirm; wait for the app save receipt.'
          );
        }
        return 'That draft revision was replaced. Use the current on-screen card ID and repeat the requested change; nothing was changed.';
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
          onConfirmDraft: async (cardId, revision) => {
            if (revision !== 1) {
              return {
                saved: false,
                message:
                  'Stale draft revision. Nothing has been saved. Please check the current card.',
              };
            }
            const saved = appliedReviewReply(owner, cardId);
            if (saved)
              return {
                saved: true,
                message: 'Already saved after student confirmation: ' + saved,
              };
            return {saved: false, message: SUGGESTED_CONFIRM_REFUSAL};
          },
          onProposal: result => {
            if (result.kind === 'proposal') {
              presentReview(result.review);
              setLocalNote(
                'Check the card — nothing is saved until confirmed.',
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
            showMemoryCard(memProp, actionId);
            setLocalNote('Check the memory card — nothing is saved yet.');
          },
          onMultiActionBatch: batch => {
            showBatchCard(batch);
            setLocalNote(
              'Check the grouped actions card — nothing is saved yet.',
            );
          },
        },
      );
      if (toolError) throw new Error('Tool request failed.');
      return answer;
    },
    [
      deps,
      userId,
      callSettings.toolAudioCue,
      presentReview,
      showBatchCard,
      showMemoryCard,
    ],
  );

  const handleSaveMemory = useCallback(
    (editedText?: string): {saved: boolean; message: string} => {
      if (!activeMemoryProposal || !activeMemoryActionId.current) {
        return {
          saved: false,
          message: 'No memory card was active. Nothing has been saved.',
        };
      }
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
        return {saved: true, message: 'Saved to personal memory.'};
      } else if (result.status === 'duplicate') {
        setActiveMemoryProposal(prev =>
          prev ? {...prev, status: 'duplicate'} : null,
        );
        setLocalNote('That fact is already in your memory.');
        return {saved: false, message: 'That fact is already in your memory.'};
      } else if (result.status === 'disabled') {
        setActiveMemoryProposal(prev =>
          prev ? {...prev, status: 'disabled'} : null,
        );
        setLocalNote('Memory is turned off in Settings.');
        return {saved: false, message: 'Memory is turned off in Settings.'};
      } else {
        setActiveMemoryProposal(prev =>
          prev ? {...prev, status: 'failed', error: result.error} : null,
        );
        return {
          saved: false,
          message:
            result.error || 'Could not save memory. Nothing has been saved.',
        };
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

  const handleConfirmMultiAll = useCallback(async (): Promise<{
    saved: boolean;
    message: string;
  }> => {
    if (!activeMultiBatch) {
      return {
        saved: false,
        message: 'No grouped actions card is active. Nothing has been saved.',
      };
    }
    try {
      const {batch, spokenSummary} =
        await actionService.confirmMultiActionBatch(
          ownerRef.current,
          activeMultiBatch,
        );
      if (
        ownerRef.current !== batch.ownerId ||
        actionSession.current !== batch.sessionId
      ) {
        return {
          saved: false,
          message: 'Session ended. Nothing has been saved.',
        };
      }
      setActiveMultiBatch(batch);
      setLocalNote(spokenSummary);
      const refreshed = buildStudentVoiceContext(ownerRef.current);
      void conversationRef.current?.sendContext(
        refreshed ? `${spokenSummary}\n\n${refreshed}` : spokenSummary,
      );
      return {
        saved: batch.status === 'saved' || batch.status === 'partial',
        message: spokenSummary,
      };
    } catch {
      const msg =
        'Those grouped actions could not be saved. Review the card before retrying.';
      setLocalNote(msg);
      return {saved: false, message: msg};
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
    onTurnInterrupted: () => {
      turnTicket.current += 1;
    },
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
    setDismissedTurnId(null);
    setReadResult(null);
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

  const hasActiveCard = Boolean(
    review?.proposal || activeMemoryProposal || activeMultiBatch,
  );
  // One card at a time, the newest in front. The others wait behind it.
  const openCards: CardKind[] = [];
  if (review?.proposal) openCards.push('review');
  if (activeMultiBatch) openCards.push('batch');
  if (activeMemoryProposal) openCards.push('memory');
  const shownCard: CardKind | null =
    cardFocus && openCards.includes(cardFocus)
      ? cardFocus
      : openCards[0] ?? null;
  const batchNeedsAnswer =
    activeMultiBatch?.status === 'draft' ||
    activeMultiBatch?.status === 'partial' ||
    activeMultiBatch?.status === 'failed';
  /** A card is waiting for the student's Confirm or Cancel. */
  const needsAnswer = Boolean(
    review?.proposal ||
      activeMemoryProposal?.status === 'draft' ||
      batchNeedsAnswer,
  );
  const needsAnswerRef = useRef(needsAnswer);
  needsAnswerRef.current = needsAnswer;
  // The identity of the card that needs an answer; a new one asks the host
  // to bring a minimized call forward.
  const attentionKey =
    shownCard === 'review'
      ? review?.proposal?.operationId ?? null
      : shownCard === 'memory' && activeMemoryProposal?.status === 'draft'
      ? activeMemoryProposal.id
      : shownCard === 'batch' && batchNeedsAnswer
      ? activeMultiBatch?.id ?? null
      : null;
  useEffect(() => {
    if (attentionKey) attentionRef.current?.();
  }, [attentionKey]);

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
    executedTurn.current = null;
    voiceTurns.current = [];
    awaitingDetails.current = false;
    groundedReply.current = NO_ACTION_REPLY;
    turnReview.current = null;
    setCardFocus(null);
    turnTicket.current += 1;
    setDismissedTurnId(null);
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

  const handleConfirm = useCallback(async (): Promise<{
    saved: boolean;
    message: string;
  }> => {
    const owner = userId;
    const session = actionSession.current;
    const decision = await reviewRef.current.confirm({speakReply: false});
    if (!decision) {
      return {
        saved: false,
        message: 'No pending draft card was found. Nothing has been saved.',
      };
    }
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
    const saved = decision.outcome?.status === 'applied';
    if (
      owner !== ownerRef.current ||
      session !== actionSession.current ||
      !conversationRef.current ||
      !LIVE.has(conversationRef.current.snapshot.phase)
    ) {
      return {saved, message: reply};
    }
    setLocalNote(reply);
    groundedReply.current = saved
      ? 'The student confirmed the card and it was saved: ' +
        reply +
        ' No card is open now.'
      : 'The card was not saved: ' + reply;
    const refreshed = buildStudentVoiceContext(userId);
    const confirmMsg =
      (saved
        ? 'Confirmed and saved action result: '
        : 'Action was not saved: ') + reply;
    void conversation.sendContext(
      refreshed ? `${confirmMsg}\n\n${refreshed}` : confirmMsg,
    );
    return {saved, message: reply};
  }, [conversation, userId]);

  confirmHandlersRef.current = {
    confirmDraft: handleConfirm,
    saveMemory: handleSaveMemory,
    confirmMultiAll: handleConfirmMultiAll,
  };

  const handleCancelReview = useCallback(() => {
    const decision = reviewRef.current.cancel();
    if (decision) {
      setLocalNote(decision.reply);
      groundedReply.current =
        'The student canceled the card. Nothing was saved and no card is open now.';
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

  const latestAgentReply = (() => {
    for (let i = snapshot.turns.length - 1; i >= 0; i -= 1) {
      const turn = snapshot.turns[i];
      if (
        turn.role === 'assistant' &&
        turn.status !== 'provisional' &&
        turn.text.trim()
      ) {
        return turn;
      }
    }
    return null;
  })();
  const visibleAgentReply =
    latestAgentReply && latestAgentReply.id !== dismissedTurnId
      ? latestAgentReply
      : null;
  // LAFINA said a card is on screen. If none is there, and none arrives while
  // the device finishes reading the turn, bring back the pending draft or say
  // plainly that nothing was prepared, and tell the model so it stops.
  const claimTurnId =
    latestAgentReply &&
    live &&
    CARD_CLAIM_RE.test(latestAgentReply.text) &&
    !CARD_DENIAL_RE.test(latestAgentReply.text)
      ? latestAgentReply.id
      : null;
  const checkedClaim = useRef<string | null>(null);
  useEffect(() => {
    if (!claimTurnId || checkedClaim.current === claimTurnId) return undefined;
    let cancelled = false;
    const session = actionSession.current;
    const owner = ownerRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        await turnReview.current?.done;
        if (
          cancelled ||
          session !== actionSession.current ||
          owner !== ownerRef.current ||
          !conversationRef.current ||
          !LIVE.has(conversationRef.current.snapshot.phase)
        ) {
          return;
        }
        checkedClaim.current = claimTurnId;
        if (needsAnswerRef.current) return;
        const pending = latestPendingReview(owner, 'voice');
        if (pending) {
          presentReview({
            status: 'proposal',
            proposal: pending,
            reply: pending.reply,
          });
          setLocalNote('Check the card — nothing is saved until confirmed.');
          return;
        }
        // A saved or cancelled card still on the stage is what LAFINA means.
        if (currentCards.current.memory || currentCards.current.batch) return;
        setLocalNote(NO_CARD_NOTE);
        void conversationRef.current.sendContext(
          'No review card is on screen and nothing was saved. Do not say a card is shown unless a tool result says so. Tell the student nothing was prepared and ask them to say the request again with a title, and a day and time if it needs one.',
        );
      })();
    }, CARD_CLAIM_GRACE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [claimTurnId, presentReview]);

  const failure = snapshot.failure;
  const needsConsent = (!consented || !dataConsented) && !live && !connecting;
  const hasDetailsCard = Boolean(
    !hasActiveCard &&
      readResult === null &&
      !needsConsent &&
      !failure &&
      snapshot.phase !== 'restart_required' &&
      (localNote || snapshot.notice || visibleAgentReply),
  );
  const statusText = statusLine(snapshot, needsAnswer);
  const showOverlayContent = Boolean(
    needsConsent ||
      hasActiveCard ||
      readResult !== null ||
      hasDetailsCard ||
      localNote ||
      snapshot.notice ||
      failure ||
      snapshot.phase === 'restart_required' ||
      showTyping,
  );

  return (
    <View
      style={[styles.container, fullScreen && styles.fullScreenContainer]}
      testID="voice-conversation-panel"
    >
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerSide}>
          <TouchableOpacity
            onPress={handleBack}
            style={[
              styles.headerCircle,
              themed.headerCircle,
              isModern && modernShadows.subtle,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Back to push-to-talk"
            testID="voice-conversation-back"
          >
            <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerTitle, themed.title]}
            testID="call-header-title"
          >
            Call Lafina
          </Text>
          <View
            style={[
              styles.onlinePill,
              themed.pill,
              isModern && {
                backgroundColor: modernPalette.softViolet,
                borderRadius: ModernLayout.borderRadiusPill,
              },
            ]}
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

        <View style={[styles.headerSide, styles.headerRight]}>
          {onMinimize && (
            <TouchableOpacity
              onPress={onMinimize}
              style={[
                styles.headerCircle,
                themed.headerCircle,
                isModern && modernShadows.subtle,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Minimize Call Lafina to mini bar"
              testID="call-minimize-button"
            >
              <Minimize2 size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => setSettingsModalVisible(true)}
            style={[
              styles.headerCircle,
              themed.headerCircle,
              isModern && modernShadows.subtle,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Call Lafina settings"
            testID="call-settings-button"
          >
            <Sliders size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Fixed Non-Scrolling Visible Call Stage (ChatGPT-style) */}
      <View style={styles.contentStage} testID="call-content-stage">
        {/* Centered Identity & Waveform (hidden when a card or overlay is active) */}
        <View
          style={[
            styles.centerStage,
            showOverlayContent && styles.centerStageCompact,
          ]}
          testID="call-center-stage"
        >
          {live || !showOverlayContent ? (
            <View
              style={[
                styles.avatarRing,
                showOverlayContent && styles.avatarRingCompact,
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
                size={showOverlayContent ? 48 : 76}
                userLevel={snapshot.level}
              />
            </View>
          ) : null}

          {live ? (
            <Text style={[styles.timerText, themed.title]} testID="call-timer">
              {formatDuration(callDuration)}
            </Text>
          ) : null}

          <Text
            style={[
              styles.status,
              !statusText && styles.emptyStatus,
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
            {statusText}
          </Text>

          {!showOverlayContent ? (
            <CallWaveform
              phase={snapshot.phase}
              muted={snapshot.muted}
              micCapturing={snapshot.micCapturing}
              userLevel={snapshot.level}
              outputLevel={snapshot.outputLevel ?? 0}
              hasReviewItem={Boolean(review?.proposal)}
            />
          ) : null}
        </View>

        {/* Cards and notes scroll inside the fixed stage, so a tall card is
            never clipped (the stage itself does not scroll). */}
        <ScrollView
          style={styles.overlayScroll}
          contentContainerStyle={styles.overlayScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          testID="call-overlay-scroll"
        >
          {needsConsent ? (
            <View
              style={[styles.card, themed.card, modernCardStyle]}
              testID="voice-conversation-consent"
            >
              <Text style={[styles.cardTitle, themed.text]}>
                Before you start
              </Text>
              <Text style={[styles.cardBody, themed.text]}>
                While a call is open, your microphone audio streams to
                ElevenLabs for transcription and speech, and your words go to
                DeepSeek and LAFINA's server for answers. When a call starts, a
                short summary of your next 7 days (schedule, tasks and overdue
                items), recent notes and saved memories is shared with them so
                LAFINA can help with your plans. Capture continues when
                minimized inside the app, with a visible call strip. It stops
                when you tap End or leave the app, and you can mute at any time.
                Finished turns are saved to your Chat history. You can review,
                change, or confirm planner items by voice or tap.
              </Text>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  {backgroundColor: colors.primary},
                ]}
                onPress={handleConsent}
                accessibilityRole="button"
                testID="voice-conversation-consent-accept"
              >
                <Text
                  style={[styles.primaryText, {color: colors.textOnPrimary}]}
                >
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
              {openCards.length > 1 ? (
                <TouchableOpacity
                  style={[
                    styles.cardSwitch,
                    {
                      backgroundColor: isModern
                        ? modernPalette.softViolet
                        : colors.inputBg,
                      borderColor: isModern
                        ? modernPalette.border
                        : colors.border,
                    },
                  ]}
                  onPress={() => {
                    const at = shownCard ? openCards.indexOf(shownCard) : -1;
                    setCardFocus(openCards[(at + 1) % openCards.length]);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${openCards.length} cards are open. Show the next card`}
                  testID="call-card-switch"
                >
                  <Text
                    style={[styles.cardSwitchText, {color: colors.primary}]}
                  >
                    {openCards.length} cards open · Show next
                  </Text>
                </TouchableOpacity>
              ) : null}
              <ActionCardHost
                proposal={shownCard === 'review' ? review?.proposal : null}
                memoryProposal={
                  shownCard === 'memory' ? activeMemoryProposal : null
                }
                multiActionBatch={
                  shownCard === 'batch' ? activeMultiBatch : null
                }
                expired={review?.expired}
                busy={review?.busy}
                onEdit={patch => {
                  const result = reviewRef.current.edit?.(patch);
                  if (result?.status === 'proposal') {
                    void conversationRef.current?.sendContext(
                      `Draft updated on screen: ${
                        result.proposal.title
                      }. ${result.proposal.details.join(' ')} Card ID: ${
                        result.proposal.operationId
                      }; revision: 1. Nothing was saved.`,
                    );
                  }
                  return result;
                }}
                onConfirm={() => {
                  void handleConfirm();
                }}
                onCancel={() => {
                  if (shownCard === 'batch') {
                    handleCancelMultiAll();
                    setActiveMultiBatch(null);
                  } else if (shownCard === 'memory') {
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
                  if (shownCard === 'batch') {
                    setActiveMultiBatch(null);
                  } else if (shownCard === 'memory') {
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
                            screen:
                              item.kind === 'note' ||
                              (item.kind === 'task' && !item.date)
                                ? 'notes'
                                : 'calendar',
                            ...(item.kind === 'task' && !item.date
                              ? {notesTab: 'todo'}
                              : {}),
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
              {shownCard === 'review' && review?.proposal && !review.busy && (
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
                        presentReview(revised);
                        setDraftCorrection('');
                        void conversationRef.current?.sendContext(
                          `Draft updated on screen: ${
                            revised.proposal.title
                          }. ${revised.proposal.details.join(' ')} Card ID: ${
                            revised.proposal.operationId
                          }; revision: 1. Nothing was saved.`,
                        );
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

          {hasDetailsCard ? (
            <View
              style={[
                styles.card,
                themed.card,
                styles.detailsCard,
                modernCardStyle,
              ]}
              testID="call-details-card"
            >
              <View style={styles.detailsHeader}>
                <Text style={[styles.detailsLabel, {color: colors.primary}]}>
                  {visibleAgentReply ? 'LAFINA' : 'Details'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setLocalNote(null);
                    if (visibleAgentReply) {
                      setDismissedTurnId(visibleAgentReply.id);
                    }
                  }}
                  style={styles.detailsDismissBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Back to voice view"
                  testID="call-details-dismiss"
                >
                  <Text style={[styles.detailsDismissText, themed.muted]}>
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              {visibleAgentReply ? (
                <Text
                  style={[styles.detailsReplyText, themed.text]}
                  testID="call-details-reply"
                >
                  {visibleAgentReply.text}
                </Text>
              ) : null}
              {localNote ? (
                <Text
                  style={[styles.detailsNoteText, themed.text]}
                  testID="voice-conversation-local-note"
                >
                  {localNote}
                </Text>
              ) : null}
              {snapshot.notice ? (
                <Text
                  style={[styles.detailsNoteText, themed.muted]}
                  testID="voice-conversation-notice"
                >
                  {snapshot.notice}
                </Text>
              ) : null}
            </View>
          ) : (
            <>
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
            </>
          )}

          {readResult !== null && (
            <CallReadResults
              result={readResult}
              ownerId={userId}
              onDismiss={() => setReadResult(null)}
              onNavigate={onNavigate}
            />
          )}

          {failure || snapshot.phase === 'restart_required' ? (
            <View
              style={[styles.card, themed.card, modernCardStyle]}
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
                      style={[
                        styles.primaryText,
                        {color: colors.textOnPrimary},
                      ]}
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
        </ScrollView>

        {undoOffer ? (
          <UndoSnackbar
            offer={undoOffer}
            onHide={hideUndo}
            onUndo={token => {
              const owner = ownerRef.current;
              setUndoOffer(null);
              const outcome = chatOrchestrator.undoAction(owner, token);
              setLocalNote(outcome.reply);
              void conversationRef.current?.sendContext(
                `Planner update: ${outcome.reply}`,
              );
            }}
            testID="voice-undo"
          />
        ) : null}

        {showTyping ? (
          <View
            style={[
              styles.inputRow,
              themed.card,
              isModern && {
                backgroundColor: modernPalette.surface,
                borderColor: modernPalette.border,
                borderRadius: ModernLayout.borderRadiusPill,
              },
            ]}
          >
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
      </View>

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
              icon={<PhoneOff size={22} color={colors.textOnPrimary} />}
              color={colors.error}
              labelColor={colors.error}
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
                  <MicOff size={22} color={colors.warning} />
                ) : (
                  <Mic size={22} color={colors.textPrimary} />
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
              icon={<MessageSquareText size={22} color={colors.textPrimary} />}
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
              icon={<Square size={20} color={colors.textPrimary} />}
              color={colors.inputBg}
              textColor={colors.textPrimary}
              onPress={conversation.stopResponse}
              disabled={snapshot.phase === 'listening'}
              testID="voice-conversation-stop"
              accessibilityLabel="Stop LAFINA's answer"
            />
            <ControlButton
              label="End"
              icon={<PhoneOff size={22} color={colors.textOnPrimary} />}
              color={colors.error}
              labelColor={colors.error}
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
  /** Label colour when it differs from the icon colour (a filled button). */
  labelColor?: string;
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
  labelColor,
}) => (
  <TouchableOpacity
    style={[styles.control, disabled && styles.disabled]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{disabled: !!disabled, selected: !!selected}}
    testID={testID}
  >
    <View
      style={[
        styles.controlCircle,
        {backgroundColor: color, borderColor: selected ? textColor : color},
      ]}
    >
      {icon}
    </View>
    <Text
      style={[styles.controlText, {color: labelColor ?? textColor}]}
      numberOfLines={1}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const getThemedStyles = (colors: ThemeColors) => ({
  card: {backgroundColor: colors.inputBg, borderColor: colors.border},
  headerCircle: {backgroundColor: colors.cardBg, borderColor: colors.border},
  pill: {backgroundColor: colors.inputBg},
  dock: {backgroundColor: 'transparent', borderColor: 'transparent'},
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
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  // Equal sides keep the title centered whatever buttons the right side has.
  headerSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    justifyContent: 'flex-end',
  },
  headerCenter: {
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
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
  avatarRingCompact: {width: 56, height: 56, borderRadius: 28, borderWidth: 2},
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
  emptyStatus: {height: 0, margin: 0, padding: 0},
  detailsCard: {maxWidth: 420},
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsLabel: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  detailsDismissBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  detailsDismissText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  detailsReplyText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  detailsNoteText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
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
  centerStageCompact: {
    paddingVertical: 2,
    gap: 2,
  },
  contentStage: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
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
    gap: 18,
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
  },
  control: {
    minWidth: 64,
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
  overlayScroll: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 1,
  },
  overlayScrollContent: {
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  cardSwitch: {
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 6,
  },
  cardSwitchText: {fontFamily: Fonts.body, fontSize: 12, fontWeight: '700'},
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
