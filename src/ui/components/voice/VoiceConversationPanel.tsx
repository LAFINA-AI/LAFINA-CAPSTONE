import {verifyReminderDelivery} from '../../../scheduler/verifyReminderDelivery';
import {CallReadResults} from '../callLafina/CallReadResults';
import type {LocalVoiceResult} from '../../../cloud/voiceConversation/localVoiceData';
import type {CallNavigationTarget} from '../../navigation/callNavigation';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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
  Calendar,
  CircleAlert,
  Cpu,
  MessageSquareText,
  Mic,
  MicOff,
  Minimize2,
  PhoneCall,
  PhoneOff,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Square,
} from 'lucide-react-native';
import {Fonts, ModernLayout} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import {chatOrchestrator} from '../../../ai/chatOrchestrator';
import {UndoSnackbar} from '../chat/UndoSnackbar';
import type {
  CommandProposal,
  PrepareResult,
  UndoOffer,
} from '../../../ai/nlu/commandReview';
import {
  CallDurationText,
  MeteredCallWaveform,
  MeteredSynthWaveAvatar,
} from '../callLafina/MeteredCallVisuals';
import {enableOnlineMode, voiceConsent} from '../../../cloud/voiceConversation';
import type {
  ConversationPhase,
  ConversationSnapshot,
  VoiceConversationDeps,
} from '../../../cloud/voiceConversation';
import {useVoiceConversation} from '../../hooks/useVoiceConversation';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import type {CommandReviewState} from '../../hooks/useCommandReview';
import {ActionCardHost} from '../callLafina/ActionCardHost';
import {CardSaveExit} from '../callLafina/CardSaveExit';
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
import {buildStudentVoiceContext} from '../../../cloud/voiceConversation/localVoiceData';
import {ChatReplyText} from '../chat/ChatReplyText';
import {useChatReplyFormat} from '../../hooks/useChatReplyFormat';
import {ttsService} from '../../../ai/tts/ttsService';
import {formatCallReplyMarkdown, generateId} from '../../../utils';
import {hideVendorNames} from '../../../utils/vendorNames';
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
  parseDraftTimeRevision,
  renamedTitleIn,
} from '../../../ai/nlu/commandReview';
import {
  hasStructuredAction,
  intentFromToolArguments,
  prepareStructuredReview,
  SUGGESTED_CARD_NOTE,
} from '../../../ai/voiceActions/structuredAction';
import type {StructuredActionArgs} from '../../../ai/voiceActions/structuredAction';
import {
  findRepeatOfSaved,
  normalizeTitle,
  savedCardById,
  savedCardFromProposal,
} from '../../../ai/voiceActions/recentSaves';
import type {SavedCard} from '../../../ai/voiceActions/recentSaves';
import {validatePayload} from '../../../ai/voiceActions/actionValidator';

import {
  callClosingKind,
  endsWithGoodbye,
  hasDraftApproval,
  isCompoundVoiceRequest,
  isDraftCancel,
  isPlainApproval,
  splitTrailingSave,
} from '../../../cloud/voiceConversation/turnPolicy';
import {detectSkillIntent} from '../../../ai/skills/skillIntent';
import {
  prepareSkillLaunch,
  skillControlLine,
  skillStatusLine,
} from '../../../ai/skills/skillHandoff';
import type {PreparedLaunch} from '../../../ai/skills/skillHandoff';
import {skillTitle} from '../../../skills/skillLaunch';
import type {SkillLaunch} from '../../../skills/skillLaunch';
import NetInfo from '@react-native-community/netinfo';
import {
  offlineReasonText,
  predictCallMode,
} from '../../../ai/offlineCall/callMode';
import type {
  CallMode,
  CallModeDecision,
} from '../../../ai/offlineCall/callMode';
import {
  OFFLINE_HELP_REPLY,
  savedConfirmation,
  speakable,
  spokenCardLine,
} from '../../../ai/offlineCall/spokenReplies';
import type {AlarmStatus} from '../../../ai/offlineCall/spokenReplies';
import type {
  OfflineCallDeps,
  OfflineReply,
  OfflineTurnContext,
  OfflineTurnSource,
} from '../../../ai/offlineCall/offlineCallController';
import {
  buildLocalConversationReply,
  classifySmallTalk,
} from '../../../ai/localConversation';
import {useOfflineCall} from '../../hooks/useOfflineCall';
import {warmUpOfflineModel} from '../../../ai/nlu/intentService';
import {warmupOfflineSpeech} from '../../../ai/native/speechCapture';
import {
  localHandbookService,
  searchUstpSourcesForVoice,
  shouldMergeFollowUpQuery,
} from '../../../handbook';
import {isHandbookQuestion} from '../../../ai/onlineIntentExtractor';
import {
  clearCallUstpSources,
  recordCallUstpSources,
} from '../../../ai/voiceActions/callUstpCitations';
import {
  UstpSourcesSheet,
  type UstpSourcesTarget,
} from '../chat/UstpSourcesSheet';

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
  /** Tests inject the offline call's microphone and voice. */
  offlineDeps?: (
    userId: string,
    respond: OfflineCallDeps['respond'],
  ) => OfflineCallDeps;
  /** Whether the panel is rendered in full-screen presentation. Defaults to true. */
  fullScreen?: boolean;
  /**
   * The call screen is not on screen (minimized). The call keeps running;
   * its animations and clock stop drawing until it comes back.
   */
  paused?: boolean;
}

const PHASE_TEXT: Record<ConversationPhase, string> = {
  idle: '',
  connecting: 'Connecting…',
  listening: 'Listening. Pause whenever you like',
  thinking: 'Thinking…',
  tool_working: 'Working…',
  speaking: 'Speaking. Talk to interrupt',
  reconnecting: 'Reconnecting…',
  restart_required: 'Call stopped',
  ended: 'Call ended',
  failed: 'Call Lafina unavailable',
};

/** The offline call takes turns: the mic is closed while LAFINA speaks. */
const OFFLINE_PHASE_TEXT: Partial<Record<ConversationPhase, string>> = {
  connecting: 'Starting offline call…',
  listening: 'Listening. Pause when you finish',
  thinking: 'Working on it…',
  speaking: 'Speaking. Tap Stop to talk',
};

const statusLine = (
  snapshot: ConversationSnapshot,
  hasReviewItem = false,
  offline = false,
) => {
  // ADR-046: the same call is coming back; nothing is heard meanwhile.
  if (snapshot.phase === 'reconnecting') return PHASE_TEXT.reconnecting;
  const active =
    snapshot.phase === 'listening' ||
    snapshot.phase === 'speaking' ||
    snapshot.phase === 'thinking' ||
    snapshot.phase === 'tool_working';
  if (snapshot.muted && active) return 'Muted. LAFINA cannot hear you';
  if (offline && snapshot.phase === 'speaking')
    return OFFLINE_PHASE_TEXT.speaking ?? '';
  if (snapshot.phase === 'tool_working') {
    return snapshot.toolPhrase || 'Working…';
  }
  if (
    hasReviewItem &&
    (snapshot.phase === 'listening' || snapshot.phase === 'idle')
  ) {
    return offline && snapshot.phase === 'listening'
      ? 'Waiting for you. Say save it, or tap Confirm'
      : 'Waiting for confirmation';
  }
  return (
    (offline ? OFFLINE_PHASE_TEXT[snapshot.phase] : undefined) ??
    PHASE_TEXT[snapshot.phase] ??
    ''
  );
};

/** What LAFINA says offline after a save attempt. */
const savedLine = (outcome: SaveOutcome): string =>
  outcome.saved ? outcome.message : `I couldn't save it. ${outcome.message}`;

/**
 * The installed model may take this long in a call before the parser's
 * reading is used (it reads only the new words; the instructions stay loaded).
 */
const OFFLINE_SLM_TIMEOUT_MS = 10_000;

/** Whether `note` only repeats LAFINA's `reply` (ignoring case and punctuation). */
const repeatsLine = (reply: string | undefined, note: string): boolean => {
  if (!reply) return false;
  const plain = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const said = plain(reply);
  const shown = plain(note);
  return !!shown && (said === shown || said.includes(shown));
};

const CANCELED_REPLY = 'Okay, I canceled it. Nothing was saved.';

/** Offline replies when there is nothing to answer about. */
const NOTHING_TO_SAVE_REPLY =
  "There's no card waiting to be saved. Tell me what you'd like to schedule.";

/** How long an offline clarifying question waits for its answer. */
const CLARIFY_WINDOW_MS = 2 * 60 * 1000;

const QUESTION_START_RE =
  /^(?:what|which|when|where|who|why|how|show|list|check|find|search|do\s+i|am\s+i|is\s+there|are\s+there)\b/i;

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

/** How the student approved a save: their words, or the card's button. */
type SaveVia = 'voice' | 'tap';
type SaveOutcome = {saved: boolean; message: string};

/** A card that was just saved, shown with "Saved" while it leaves the stage. */
type SavedExit =
  | {key: string; kind: 'review'; proposal: CommandProposal}
  | {key: string; kind: 'memory'; memory: MemoryProposalData}
  | {key: string; kind: 'batch'; batch: MultiActionBatchData};

/** If LAFINA's goodbye is never heard, the call still ends after this long. */
const END_AFTER_REPLY_MAX_MS = 10_000;

/** What LAFINA is told when the student says goodbye (online). */
const GOODBYE_CONTEXT =
  'The student is ending the call. Reply with one short, warm goodbye only (one sentence). Do not ask a question or offer more help. The app hangs up after your goodbye.';

/** Card tools refused while the student is asking for a Skill (ADR-041). */
const PLANNER_PREPARE_TOOLS = new Set([
  'prepare_lafina_action',
  'prepare_multi_action',
  'propose_follow_up_reminder',
  'find_free_time',
]);

/** A saved memory card keeps its Undo this long before it leaves. */
const MEMORY_SAVED_HOLD_MS = 4000;
/** A fully saved grouped card shows each item's status this long. */
const BATCH_SAVED_HOLD_MS = 2500;

/**
 * How long the student's spoken "save it" lets LAFINA's confirm_draft save
 * the card that was open when they said it.
 */
const APPROVAL_WINDOW_MS = 60 * 1000;
/**
 * How long a plain spoken "yes" lets LAFINA's confirm_draft save a card that
 * was open when it was said, when the device itself could not place the yes.
 */
const PLAIN_APPROVAL_WINDOW_MS = 20 * 1000;
/** How long confirm_draft for a card already saved still gets its receipt. */
const RECEIPT_WINDOW_MS = 5 * 60 * 1000;

/** What the model hears when it tries to save before the student said so. */
const NOT_APPROVED_REPLY =
  'Not saved yet: the student has not said to save this card. Ask them whether to save it now. When they say yes or save it, or tap Confirm, the app saves it and sends you the receipt. Never say you cannot save to their planner.';

/** What the model hears when it confirms with no card open and nothing saved. */
const NO_OPEN_CARD_REPLY =
  'No draft card is open, so nothing was saved. Prepare a card first if the student wants to add something.';

/** Describes the card in front for the model, in one short phrase. */
const cardLabel = (title: string | undefined): string =>
  title ? ` ("${title}")` : '';

/**
 * A reconnecting call is still the same call: its timer, cards and controls
 * stay (ADR-046).
 */
const LIVE = new Set<ConversationPhase>([
  'listening',
  'thinking',
  'tool_working',
  'speaking',
  'reconnecting',
]);

const PLACEHOLDER_CARD_ID_RE =
  /^(?:current|active|draft|latest|pending|open|card|this|it|none|unknown|null|undefined)$/i;

const draftFamily = (intent: string): string =>
  intent === 'create_event' || intent === 'create_time_block'
    ? 'calendar'
    : intent;

const draftHhmm = (value: string | null | undefined): string | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec((value || '').trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
};

/**
 * True when an already-open pending review card already matches the structured
 * creation fields the model is trying to prepare (for example, local voice
 * revision just updated the draft to 7:30-8:00 PM on the same turn).
 */
const matchesPendingDraft = (
  pending: CommandProposal,
  args: StructuredActionArgs,
): boolean => {
  if (
    !args.action?.startsWith('create_') ||
    !pending.intent.startsWith('create_')
  )
    return false;
  const intent = intentFromToolArguments(args);
  if (!intent) return false;
  if (draftFamily(pending.intent) !== draftFamily(intent.intent)) return false;
  const fields = pending.draftFields;
  const wantedTitle = normalizeTitle(intent.title || args.title);
  const currentTitle = normalizeTitle(fields?.title || pending.title);
  if (!wantedTitle || wantedTitle !== currentTitle) return false;
  const wantedDate = intent.date ?? args.date ?? null;
  if (wantedDate && fields?.date && wantedDate !== fields.date) return false;
  const wantedTime = draftHhmm(intent.time ?? args.time);
  const currentTime = draftHhmm(fields?.time);
  if (wantedTime && wantedTime !== currentTime) return false;
  const wantedEnd = draftHhmm(intent.endTime ?? args.endTime);
  const currentEnd = draftHhmm(fields?.endTime);
  if (wantedEnd && currentEnd && wantedEnd !== currentEnd) return false;
  if (
    args.action === 'create_note' &&
    typeof args.details === 'string' &&
    args.details.trim() &&
    fields?.details &&
    args.details.trim() !== fields.details.trim()
  ) {
    return false;
  }
  return true;
};

/**
 * True when a model `revise_draft` instruction is already reflected on the
 * card that `handleStudentTurn` just revised locally on the same turn.
 */
const instructionAlreadyReflectedInDraft = (
  instruction: string,
  pending: CommandProposal,
  lastUtterance: string,
  sameTurn: boolean,
): boolean => {
  const trimmed = instruction.trim();
  if (trimmed.toLowerCase() === lastUtterance.trim().toLowerCase()) return true;
  const fields = pending.draftFields;
  if (!fields) return sameTurn && !trimmed;
  const parsed = parseDraftTimeRevision(
    trimmed,
    fields.time,
    fields.supportsEndTime,
  );
  const renamed = renamedTitleIn(trimmed);
  const body = trimmed
    .match(
      /(?:(?:change|update|set|make)\s+(?:the\s+)?)?(?:body|content|details?|description|notes?)\s*(?:to|:)\s*['"\u201c]?([^'"\u201d\n]+?)['"\u201d]?\.?$/i,
    )?.[1]
    ?.trim();
  const wantsNotify =
    pending.reminderDelivery !== null &&
    /\b(?:notify\s+only|notification\s+only|just\s+(?:a\s+)?notif(?:y|ication)|don['’]?t\s+call|no\s+call|instead\s+of\s+(?:a\s+)?call)\b/i.test(
      trimmed,
    );
  const wantsCall =
    pending.reminderDelivery !== null &&
    /\b(?:call\s+me|reminder\s+call|ring\s+me|as\s+a\s+call)\b/i.test(trimmed);

  const hasAnyDelta = Boolean(
    parsed.date ||
      parsed.time ||
      parsed.endTime ||
      parsed.durationMinutes ||
      renamed ||
      body ||
      wantsNotify ||
      wantsCall,
  );
  if (!hasAnyDelta) return sameTurn;

  if (parsed.date && fields.date !== parsed.date) return false;
  if (parsed.time && draftHhmm(fields.time) !== draftHhmm(parsed.time))
    return false;
  if (parsed.endTime && draftHhmm(fields.endTime) !== draftHhmm(parsed.endTime))
    return false;
  if (
    parsed.durationMinutes &&
    !parsed.endTime &&
    fields.durationMinutes !== parsed.durationMinutes
  )
    return false;
  if (renamed && normalizeTitle(renamed) !== normalizeTitle(fields.title))
    return false;
  if (body && body !== (fields.details || '').trim()) return false;
  if (wantsNotify && pending.reminderDelivery !== 'notify') return false;
  if (wantsCall && pending.reminderDelivery !== 'call') return false;
  return true;
};

const formatReviewCardContext = (
  proposal: CommandProposal,
  prefix = 'Active review card on screen',
): string =>
  `${prefix}: ${proposal.title} (${proposal.details.join(', ')}). Card ID: ${
    proposal.operationId
  }; revision: 1. Nothing has been saved yet. Use this Card ID with revise_draft, confirm_draft, or cancel_draft.`;

const formatMemoryCardContext = (
  proposal: MemoryProposalData,
  actionId: string,
): string =>
  `Active memory card on screen: "${proposal.text}". Card ID: ${actionId}; revision: 1. Nothing has been saved yet. Use this Card ID with confirm_draft or cancel_draft.`;

const formatBatchCardContext = (batch: MultiActionBatchData): string =>
  `Active grouped review card on screen (${
    batch.items.length
  } items: ${batch.items.map(i => i.title).join(', ')}). Card ID: ${
    batch.id
  }; revision: 1. Nothing has been saved yet. Use this Card ID with confirm_draft or cancel_draft.`;

/**
 * True when an utterance names the open pending card's title ("make jogging
 * time 7:30pm to 8pm") rather than asking to add another separate item.
 */
const utteranceTargetsPendingTitle = (
  text: string,
  pending: CommandProposal,
): boolean => {
  if (/\b(?:another|new|second|also\s+add)\b/i.test(text)) return false;
  const titleNorm = normalizeTitle(pending.draftFields?.title || pending.title);
  if (titleNorm.length < 3) return false;
  const textNorm = normalizeTitle(text);
  return textNorm.includes(titleNorm);
};

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
    /^(?:actually|no[, ]|change|make\s+(?:it|that|the)|move\s+(?:it|that|this|the)|shift\s+(?:it|that|this|the)|push\s+(?:it|that|this|the)|postpone|delay|extend|shorten|reschedule(?:\s+(?:it|that|this|the))?|set\s+(?:it|that|the\s+(?:time|start\s+time|end\s+time|date|title|duration|reminder|schedule|alarm))|update\s+(?:it|that|the)|edit\s+(?:it|that|the)|instead|rename|call\s+it|title(?:\s+it)?(?:\s+to|:)|let['\u2019]?s\s+(?:do|make|move|change|set)|how\s+about|what\s+about)\b/i.test(
      t,
    ) ||
    (/\b(?:change|move|shift|push|postpone|delay|extend|shorten|reschedule|update|edit|rename|make|set|put|schedule)\b/i.test(
      t,
    ) &&
      /\b(?:it|that|this|the\s+(?:time|start\s+time|end\s+time|date|title|name|duration|meeting|task|reminder|event|block|note|schedule|alarm|draft|card))\b/i.test(
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
  offlineDeps,
  fullScreen = true,
  paused = false,
}) => {
  /**
   * Online whenever it can run; offline when there is no internet, no
   * signed-in account, or the student chose Offline Mode in Chat. Fixed for
   * the length of one call.
   */
  const [callMode, setCallMode] = useState<CallModeDecision>(() =>
    predictCallMode(userId, null),
  );
  const modeRef = useRef<CallMode>(callMode.mode);
  modeRef.current = callMode.mode;
  const offline = callMode.mode === 'offline';
  /** An offline scheduling request waiting for its missing day or time. */
  const pendingClarify = useRef<{text: string; at: number} | null>(null);
  /** Whether the offline turn being answered is still wanted (not timed out). */
  const offlineTurnOpen = useRef<() => boolean>(() => true);
  /** The words an offline card was made from, so a follow-up can complete them. */
  const offlineCardRequest = useRef<{text: string; operationId: string} | null>(
    null,
  );
  /** LAFINA's recent offline small-talk lines, so the next one differs. */
  const recentOfflineReplies = useRef<string[]>([]);
  /** Says an app-started line in the offline call (null when online). */
  const announceRef = useRef<
    ((text: string, options?: {inChat?: boolean}) => void) | null
  >(null);
  /** The saved line whose receipt Chat already has (not written twice). */
  const replyInChat = useRef<string | null>(null);
  const announce = useCallback((text: string, options?: {inChat?: boolean}) => {
    if (modeRef.current === 'offline') announceRef.current?.(text, options);
  }, []);
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const replyFormat = useChatReplyFormat(userId);
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
  const [ustpSourcesTarget, setUstpSourcesTarget] =
    useState<UstpSourcesTarget | null>(null);
  const lastOfflineUstpQuery = useRef<string | null>(null);
  // Pre-warm the on-device USTP SQLite FTS5 index so the first spoken USTP
  // question in online or offline Call LAFINA answers without cold-start lag.
  useEffect(() => {
    void localHandbookService.ensureReady().catch(() => undefined);
  }, []);
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
    ticket: number;
    oldId: string;
    newId: string;
    utterance: string;
    reply: string;
    proposal: CommandProposal;
    at: number;
  } | null>(null);
  /** Superseded card IDs -> newest card ID in this call (revisions & inline edits). */
  const replacedCardIds = useRef<Map<string, string>>(new Map());
  /** Last card canceled this call, for a racing model cancel_draft. */
  const lastLocalCancel = useRef<{
    cardId: string;
    title: string;
    at: number;
  } | null>(null);
  /** Last active card context sent via contextual_update (avoids duplicate frames). */
  const lastSentCardContextId = useRef<string | null>(null);
  /**
   * The one save running now. The student's "save it", the card's button and
   * LAFINA's confirm_draft can land together; they all share this save, so
   * the second never reports "no draft found" while the first is writing.
   */
  const saveInFlight = useRef<Promise<SaveOutcome> | null>(null);
  /** The last save this call made, for a confirm_draft that comes after it. */
  const lastReceipt = useRef<{message: string; at: number} | null>(null);
  /** Cards saved this call; LAFINA may not put one back as a new card. */
  const savedCards = useRef<SavedCard[]>([]);
  /**
   * The student's latest turn said to save. It names the cards that were open
   * at that moment, so it can never approve a card that appeared later. It
   * authorizes one save, by the device or by LAFINA's confirm_draft.
   */
  const approvalRef = useRef<{
    at: number;
    cardIds: ReadonlySet<string>;
    consumed: boolean;
  } | null>(null);
  /** The card in front, which "save it" means when several are open. */
  const shownCardRef = useRef<CardKind | null>(null);
  /** Student turns this call; a card shown since the last one is "just shown". */
  const studentTurnCount = useRef(0);
  const cardShownTurn = useRef(-1);
  /**
   * The student's latest turn and the cards open when they said it. LAFINA's
   * confirm_draft for one of those cards is accepted when the words were a
   * plain yes (the model knows what the yes answered; the device may not).
   */
  const lastStudentTurn = useRef<{
    text: string;
    at: number;
    cardIds: ReadonlySet<string>;
    used: boolean;
  } | null>(null);
  /**
   * CALLFIX-03: the call is closing after LAFINA's last line (the student said
   * goodbye). The banner offers Keep talking until the line has been said.
   */
  const [ending, setEnding] = useState<{
    label: string;
    skill?: boolean;
  } | null>(null);
  const endingRef = useRef(ending);
  endingRef.current = ending;
  /** The student said goodbye with an unsaved card; LAFINA asked once. */
  const askedBeforeLeaving = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  /**
   * ADR-041: the skill this call opens once LAFINA's line has been said. It
   * is set only from the student's own words (or their tap on a chip).
   */
  const pendingSkill = useRef<PreparedLaunch | null>(null);
  /** A skill the model offered without the student asking: a chip only. */
  const [skillChip, setSkillChip] = useState<PreparedLaunch | null>(null);
  const openSkill = useCallback((launch: SkillLaunch): boolean => {
    const navigate = onNavigateRef.current;
    if (!navigate) return false;
    navigate({ownerId: ownerRef.current, screen: 'notes', skill: launch});
    return true;
  }, []);
  /** What LAFINA is told when the call is about to end (online). */
  const leavingContext = (prefix = ''): string => {
    const skill = pendingSkill.current;
    return (
      prefix +
      (skill
        ? `The app opens ${skillTitle(
            skill.launch.skill,
          )} after your next line. Say only this, then stop: "${skill.line}"`
        : GOODBYE_CONTEXT)
    );
  };
  /**
   * Ends the call once LAFINA's next line has been said, then closes the call
   * screen. Online, LAFINA is asked for one short goodbye; offline, the line
   * this turn returns is the goodbye.
   */
  const beginClosing = useCallback(
    (label: string, contextNote?: string): void => {
      const call = conversationRef.current;
      if (!call) return;
      const skill = pendingSkill.current;
      const next = skill
        ? {label: `Opening ${skillTitle(skill.launch.skill)}…`, skill: true}
        : {label};
      setEnding(next);
      endingRef.current = next;
      if (contextNote) void call.sendContext(contextNote);
      call.endAfterReply(END_AFTER_REPLY_MAX_MS);
    },
    [],
  );
  /** The phone says the handoff line as the skill opens (online calls). */
  const speakOnArrival = useRef(false);
  /** True while unmounting specifically to speak a skill handoff line. */
  const handoffSpeakingRef = useRef(false);
  /** Latest typed edits inside MemoryReviewCard so voice "save it" keeps them. */
  const memoryEditedTextRef = useRef<string | undefined>(undefined);
  const [batchBusy, setBatchBusy] = useState(false);
  /**
   * Online skill handoff: the phone, not the agent, says the line. The
   * agent's own reply to the request (it may ask "how long?" or offer a
   * time block) is cut off and the call ends now; the line plays in the
   * phone's voice as the skill opens.
   */
  const handOffNow = useCallback((prepared: PreparedLaunch): void => {
    pendingSkill.current = prepared;
    speakOnArrival.current = true;
    const next = {
      label: `Opening ${skillTitle(prepared.launch.skill)}…`,
      skill: true,
    };
    setEnding(next);
    endingRef.current = next;
    setLocalNote(prepared.line);
    const call = conversationRef.current;
    if (!call) return;
    call.stopResponse();
    call.end();
  }, []);
  /** The student tapped the skill chip: open it now (asking first if a draft is unsaved). */
  const openSkillChip = useCallback(() => {
    const chip = skillChip;
    setSkillChip(null);
    if (!chip) return;
    const owner = ownerRef.current;
    const pending = latestPendingReview(owner, 'voice');
    const cards = currentCards.current;
    const memoryOpen = cards.memory?.status === 'draft';
    const batchOpen =
      cards.batch &&
      (cards.batch.status === 'draft' ||
        cards.batch.status === 'partial' ||
        cards.batch.status === 'failed');
    if (pending || memoryOpen || batchOpen) {
      pendingSkill.current = chip;
      askedBeforeLeaving.current = true;
      const name = skillTitle(chip.launch.skill);
      const title = pending?.title ?? cards.memory?.text;
      const ask = `Before I open ${name}, ${
        title ? `the card for ${title}` : 'your card'
      } isn't saved yet. Should I save it?`;
      setLocalNote(ask);
      void conversationRef.current?.sendContext(
        `The student tapped Open ${name}, but the card on screen${cardLabel(
          title,
        )} is not saved. Ask once whether to save it first.`,
      );
      return;
    }
    handOffNow(chip);
  }, [handOffNow, skillChip]);
  const keepTalking = useCallback(() => {
    const call = conversationRef.current;
    const skill = pendingSkill.current;
    pendingSkill.current = null;
    setEnding(null);
    endingRef.current = null;
    askedBeforeLeaving.current = false;
    if (!call) return;
    call.cancelEndAfterReply();
    void call.sendContext(
      skill
        ? `The student tapped Stay on call: ${skillTitle(
            skill.launch.skill,
          )} was not opened. Do not say goodbye or end the call; ask what else they need.`
        : 'The student tapped Keep talking: they are staying on the call. Do not say goodbye or end the call; ask what else they need.',
    );
  }, []);
  const runSave = useCallback(
    (save: () => Promise<SaveOutcome>): Promise<SaveOutcome> => {
      const running = saveInFlight.current;
      if (running) return running;
      let finished = false;
      let tracked!: Promise<SaveOutcome>;
      tracked = (async (): Promise<SaveOutcome> => {
        try {
          const outcome = await save();
          if (outcome.saved)
            lastReceipt.current = {message: outcome.message, at: Date.now()};
          return outcome;
        } catch {
          return {
            saved: false,
            message: 'That card could not be saved. Nothing was saved.',
          };
        } finally {
          finished = true;
          if (saveInFlight.current === tracked) {
            saveInFlight.current = null;
          }
        }
      })();
      if (!finished) {
        saveInFlight.current = tracked;
      }
      return tracked;
    },
    [],
  );
  const confirmHandlersRef = useRef<{
    confirmDraft: (via?: SaveVia, operationId?: string) => Promise<SaveOutcome>;
    saveMemory: (editedText?: string, via?: SaveVia) => SaveOutcome;
    confirmMultiAll: (via?: SaveVia) => Promise<SaveOutcome>;
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
  /** Saves the open card of one kind through the shared save. */
  const saveOpenCard = useCallback(
    (kind: CardKind, via: SaveVia): Promise<SaveOutcome> => {
      if (kind === 'review')
        return confirmHandlersRef.current.confirmDraft(via);
      if (kind === 'batch')
        return confirmHandlersRef.current.confirmMultiAll(via);
      return runSave(async () =>
        confirmHandlersRef.current.saveMemory(
          memoryEditedTextRef.current?.trim() || undefined,
          via,
        ),
      );
    },
    [runSave],
  );
  const conversationRef = useRef<ReturnType<
    typeof useVoiceConversation
  > | null>(null);
  const [activeMemoryProposal, setActiveMemoryProposal] =
    useState<MemoryProposalData | null>(null);
  const activeMemoryActionId = useRef<string | null>(null);
  const [activeMultiBatch, setActiveMultiBatch] =
    useState<MultiActionBatchData | null>(null);
  /** The card just saved, kept on the stage while it shows Saved and leaves. */
  const [savedExit, setSavedExit] = useState<SavedExit | null>(null);
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
  const recordReplacedCard = useCallback((oldId: string, newId: string) => {
    if (!oldId || !newId || oldId === newId) return;
    replacedCardIds.current.set(oldId, newId);
    while (replacedCardIds.current.size > 40) {
      const oldest = replacedCardIds.current.keys().next().value;
      if (oldest === undefined) break;
      replacedCardIds.current.delete(oldest);
    }
  }, []);

  const resolveReplacedCardId = useCallback((cardId: unknown): string => {
    if (typeof cardId !== 'string') return '';
    let current = cardId.trim();
    const seen = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      if (!current || seen.has(current)) break;
      seen.add(current);
      const next = replacedCardIds.current.get(current);
      if (!next) break;
      current = next;
    }
    return current;
  }, []);

  const syncCardContext = useCallback(
    (kind: CardKind, id: string, text: string, force = false): void => {
      if (modeRef.current === 'offline' || !id) return;
      const key = `${kind}:${id}`;
      if (!force && lastSentCardContextId.current === key) return;
      lastSentCardContextId.current = key;
      void conversationRef.current?.sendContext(text);
    },
    [],
  );

  const openCardReminder = useCallback((): string => {
    const parts: string[] = [];
    const pending = latestPendingReview(ownerRef.current, 'voice');
    if (pending) {
      parts.push(
        `Active review card on screen: "${pending.title}" (Card ID: ${pending.operationId}; revision: 1).`,
      );
    }
    const cards = currentCards.current;
    if (cards.memory?.status === 'draft' && cards.memoryActionId) {
      parts.push(
        `Active memory card on screen: "${cards.memory.text}" (Card ID: ${cards.memoryActionId}; revision: 1).`,
      );
    }
    if (
      cards.batch &&
      (cards.batch.status === 'draft' ||
        cards.batch.status === 'partial' ||
        cards.batch.status === 'failed')
    ) {
      parts.push(
        `Active grouped review card on screen (${cards.batch.items.length} items, Card ID: ${cards.batch.id}; revision: 1).`,
      );
    }
    return parts.join(' ');
  }, []);

  const sendContextPreservingCard = useCallback(
    (text: string): void => {
      if (modeRef.current === 'offline') return;
      const reminder = openCardReminder();
      void conversationRef.current?.sendContext(
        reminder ? `${text} ${reminder}` : text,
      );
    },
    [openCardReminder],
  );

  /**
   * Puts a review card on the stage and in front. A memory or grouped card
   * that is already finished (saved, cancelled) steps aside, so the card
   * LAFINA is talking about is the one the student sees.
   */
  const presentReview = useCallback(
    (prepared: PrepareResult | null | undefined): boolean => {
      if (prepared?.status !== 'proposal') return false;
      lastLocalCancel.current = null;
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
      cardShownTurn.current = studentTurnCount.current;
      return true;
    },
    [],
  );
  const showMemoryCard = useCallback(
    (proposal: MemoryProposalData, actionId: string): void => {
      lastLocalCancel.current = null;
      activeMemoryActionId.current = actionId;
      memoryEditedTextRef.current = proposal.text;
      setActiveMemoryProposal(proposal);
      setCardFocus('memory');
      cardShownTurn.current = studentTurnCount.current;
    },
    [],
  );
  const showBatchCard = useCallback((batch: MultiActionBatchData): void => {
    lastLocalCancel.current = null;
    setActiveMultiBatch(batch);
    setCardFocus('batch');
    cardShownTurn.current = studentTurnCount.current;
  }, []);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [callSettings, setCallSettings] = useState<CallLafinaSettings>(() =>
    getCallLafinaSettings(userId),
  );

  // When the live call connected; the clock itself ticks in CallDurationText.
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const callConnectedAt = useRef<number | null>(null);

  /**
   * The offline call's reading of one request: the same on-device reviewer
   * offline push-to-talk uses. Changes become review cards (nothing is
   * written until the student says save it or taps Confirm); questions are
   * answered from the planner on this phone.
   */
  const reviewOffline = useCallback(
    async (text: string): Promise<string> => {
      const owner = ownerRef.current;
      const session = actionSession.current;
      const ticket = turnTicket.current;
      const trimmed = text.trim();
      const smallTalk = classifySmallTalk(trimmed);
      const fragment = parseIntentFastPath(trimmed);
      const newRequest =
        isVoiceScheduleStart(trimmed) ||
        fragment.intent.startsWith('create_') ||
        fragment.intent.startsWith('update_') ||
        fragment.intent.startsWith('delete_') ||
        fragment.intent === 'reschedule';
      // "Schedule a capstone meeting" → "What time?" → "10 AM tomorrow": the
      // answer completes the request it was asked about.
      const clarify = pendingClarify.current;
      pendingClarify.current = null;
      const completesClarify =
        !!clarify &&
        Date.now() - clarify.at < CLARIFY_WINDOW_MS &&
        !newRequest &&
        !smallTalk &&
        !QUESTION_START_RE.test(trimmed);
      const request =
        completesClarify && clarify ? `${clarify.text} ${trimmed}` : trimmed;
      const turnStillOpen = offlineTurnOpen.current;
      const isCurrent = () =>
        ticket === turnTicket.current &&
        owner === ownerRef.current &&
        session === actionSession.current &&
        turnStillOpen() &&
        !!conversationRef.current &&
        LIVE.has(conversationRef.current.snapshot.phase);

      if (smallTalk && !completesClarify && !newRequest) {
        lastOfflineUstpQuery.current = null;
        const reply = buildLocalConversationReply(owner, trimmed, {
          recentReplies: recentOfflineReplies.current,
        });
        recentOfflineReplies.current = [
          ...recentOfflineReplies.current,
          reply,
        ].slice(-4);
        return reply;
      }

      const result = await chatOrchestrator
        .reviewSpokenTurn(owner, request, {
          onlineMode: false,
          actionSessionId: session,
          isCurrent,
          // A call cannot wait on the slower on-device model.
          slmTimeoutMs: OFFLINE_SLM_TIMEOUT_MS,
        })
        .catch(() => null);
      if (!isCurrent()) {
        if (result?.kind === 'proposal' && result.review.status === 'proposal')
          cancelReviewedCommand(owner, result.review.proposal.operationId);
        return '';
      }
      if (!result)
        return 'Sorry, I could not read that request. Nothing was changed.';
      switch (result.kind) {
        case 'proposal': {
          lastOfflineUstpQuery.current = null;
          if (result.review.status !== 'proposal') {
            setLocalNote(result.review.reply);
            return speakable(result.review.reply);
          }
          presentReview(result.review);
          offlineCardRequest.current = {
            text: request,
            operationId: result.review.proposal.operationId,
          };
          setLocalNote('Check the card. Nothing is saved until you confirm.');
          return spokenCardLine(result.review.proposal);
        }
        case 'multi': {
          lastOfflineUstpQuery.current = null;
          reviewRef.current.dismiss();
          showBatchCard(result.batch);
          setLocalNote(result.reply);
          const count = result.batch.items.length;
          return `I put ${count} ${
            count === 1 ? 'change' : 'changes'
          } on one card. Should I save them all?`;
        }
        case 'executed': {
          lastOfflineUstpQuery.current = null;
          executedTurn.current = {text: request, reply: result.reply};
          setLocalNote(result.reply);
          setUndoOffer(result.undo ?? null);
          return speakable(result.reply);
        }
        case 'note': {
          lastOfflineUstpQuery.current = null;
          // Usually a missing day or time; the next answer fills it in.
          if (newRequest || completesClarify)
            pendingClarify.current = {text: request, at: Date.now()};
          setLocalNote(result.reply);
          return speakable(result.reply);
        }
        case 'local_answer':
        case 'memory':
          lastOfflineUstpQuery.current = null;
          setLocalNote(result.reply);
          return speakable(result.reply);
        default: {
          // ADR-047: answer USTP Handbook and USTP CDO questions offline from
          // the on-device SQLite FTS5 index (respecting COR eligibility + pref).
          const explicitUstp =
            isHandbookQuestion(request) ||
            /\b(?:ustp|student\s+handbook|handbook|university\s+of\s+science\s+and\s+technology\s+of\s+southern\s+philippines)\b/i.test(
              request,
            );
          const followUpUstp =
            !explicitUstp &&
            lastOfflineUstpQuery.current !== null &&
            shouldMergeFollowUpQuery(request);
          if (explicitUstp || followUpUstp) {
            const ustpResult = await searchUstpSourcesForVoice(owner, request, {
              previousUserQuery: lastOfflineUstpQuery.current,
            });
            if (!isCurrent()) return '';
            if (ustpResult.status === 'ok') {
              lastOfflineUstpQuery.current = request;
              setReadResult(ustpResult);
              recordCallUstpSources(owner, ustpResult.sources);
              setLocalNote(ustpResult.spokenReply);
              return ustpResult.spokenReply;
            }
            clearCallUstpSources(owner);
            setReadResult(null);
            if (
              ustpResult.status === 'ineligible' ||
              ustpResult.status === 'disabled' ||
              ustpResult.status === 'wrong_academic_year' ||
              ustpResult.status === 'unavailable' ||
              explicitUstp
            ) {
              setReadResult(ustpResult);
              setLocalNote(ustpResult.spokenReply);
              return ustpResult.spokenReply;
            }
          }
          lastOfflineUstpQuery.current = null;
          return OFFLINE_HELP_REPLY;
        }
      }
    },
    [presentReview, showBatchCard],
  );

  /**
   * One student turn, spoken or typed. Online, the live model hears what
   * happened through context updates and answers itself; the returned line
   * is unused. Offline there is no model: the returned line is what LAFINA
   * says next (null: nothing to say).
   */
  const handleStudentTurn = useCallback(
    async (text: string, offlineTurn: boolean): Promise<string | null> => {
      if (!offlineTurn && !isToolExecutionPermitted(ownerRef.current).permitted)
        return null;
      const session = actionSession.current;
      const ticket = ++turnTicket.current;
      studentTurnCount.current += 1;
      const cardJustShown =
        cardShownTurn.current === studentTurnCount.current - 1;
      // New words while the call was closing: the student is staying (the
      // conversation already cancelled its hang-up); a goodbye below may
      // start closing again.
      if (endingRef.current) {
        endingRef.current = null;
        setEnding(null);
        conversationRef.current?.cancelEndAfterReply();
      }
      // A skill waits only for the answer to "save it before I open it?".
      if (!askedBeforeLeaving.current) pendingSkill.current = null;
      setSkillChip(null);
      setReadResult(null);
      voiceTurns.current = [...voiceTurns.current, text].slice(-8);
      lastUserRequest.current = text;
      // What an earlier turn prepared is not this turn's answer: a stale "card
      // is on screen" here made LAFINA announce a card that was long gone.
      groundedReply.current = NO_ACTION_REPLY;
      turnReview.current = null;
      // An approval answers only the turn it was said in.
      approvalRef.current = null;
      const owner = ownerRef.current;
      // Offline, "remember that…" is saved the way offline push-to-talk saves
      // it (reviewOffline); the memory card is the online model's flow.
      const fact = offlineTurn ? null : explicitMemory(text);
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
        return null;
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
      lastStudentTurn.current = {
        text: trimmed,
        at: Date.now(),
        cardIds: new Set(
          [
            pending?.operationId,
            memoryOpen ? cards.memoryActionId : null,
            batchOpen ? cards.batch?.id : null,
          ].filter((id): id is string => !!id),
        ),
        used: false,
      };

      // CALLFIX-03: LAFINA asked "save it before you go?" and the student
      // said no (or goodbye again): discard the card and end the call.
      if (
        askedBeforeLeaving.current &&
        openCount > 0 &&
        (isDraftCancel(trimmed) ||
          /^(?:no|nope|nah|hindi|wag na|huwag na|not now|no need|no it's fine|it's fine)\b/i.test(
            trimmed,
          ) ||
          callClosingKind(trimmed) === 'goodbye')
      ) {
        askedBeforeLeaving.current = false;
        voiceTurns.current = [];
        if (pending) {
          cancelReviewedCommand(owner, pending.operationId);
          reviewRef.current.dismiss();
        }
        if (memoryOpen && cards.memoryActionId) {
          actionService.cancelMemoryProposal(owner, cards.memoryActionId);
          setActiveMemoryProposal(null);
          activeMemoryActionId.current = null;
        }
        if (batchOpen && cards.batch) {
          actionService.cancelMultiActionBatch(owner, cards.batch);
          setActiveMultiBatch(null);
        }
        setLocalNote('Not saved. Ending the call.');
        if (!offlineTurn && pendingSkill.current) {
          handOffNow(pendingSkill.current);
          return null;
        }
        const goodbyeLine =
          pendingSkill.current?.line ??
          buildLocalConversationReply(owner, 'bye');
        beginClosing(
          'Ending call…',
          offlineTurn
            ? undefined
            : leavingContext(
                'The student chose not to save the card; it was discarded and nothing was saved. ',
              ),
        );
        if (!offlineTurn) return null;
        return `Okay, I won't save it. ${goodbyeLine}`;
      }

      if (isDraftCancel(trimmed)) {
        askedBeforeLeaving.current = false;
        pendingSkill.current = null;
        pendingClarify.current = null;
        lastOfflineUstpQuery.current = null;
        voiceTurns.current = [];
        awaitingDetails.current = false;
        if (openCount > 1) {
          setLocalNote(
            'Which draft should I cancel? Use Cancel on the card you mean.',
          );
          void conversationRef.current?.sendContext(
            'There is more than one open draft. Ask which card to cancel. Nothing was canceled or saved.',
          );
          return 'Which one should I cancel? Tap Cancel on the card you mean.';
        }
        const canceledNote =
          'The student canceled the draft card by voice. Nothing was saved and no card is open now. Do not save or prepare it again unless they ask.';
        if (memoryOpen && cards.memoryActionId) {
          lastLocalCancel.current = {
            cardId: cards.memoryActionId,
            title: cards.memory?.text || 'memory',
            at: Date.now(),
          };
          lastSentCardContextId.current = null;
          actionService.cancelMemoryProposal(owner, cards.memoryActionId);
          setActiveMemoryProposal(null);
          activeMemoryActionId.current = null;
          setLocalNote('Memory draft canceled. Nothing was saved.');
          groundedReply.current = canceledNote;
          void conversationRef.current?.sendContext(canceledNote);
          return CANCELED_REPLY;
        }
        if (batchOpen && cards.batch) {
          lastLocalCancel.current = {
            cardId: cards.batch.id,
            title: 'grouped actions',
            at: Date.now(),
          };
          lastSentCardContextId.current = null;
          const result = actionService.cancelMultiActionBatch(
            owner,
            cards.batch,
          );
          setActiveMultiBatch(result.batch);
          setLocalNote(result.spokenSummary);
          groundedReply.current = canceledNote;
          void conversationRef.current?.sendContext(canceledNote);
          return CANCELED_REPLY;
        }
        if (pending) {
          lastLocalCancel.current = {
            cardId: pending.operationId,
            title: pending.title,
            at: Date.now(),
          };
          lastSentCardContextId.current = null;
          cancelReviewedCommand(owner, pending.operationId);
          reviewRef.current.dismiss();
          groundedReply.current = canceledNote;
          setLocalNote('Draft canceled. Nothing was saved.');
          void conversationRef.current?.sendContext(canceledNote);
          return CANCELED_REPLY;
        }
        setLocalNote('Request canceled. Nothing was saved.');
        return 'Okay, never mind. Nothing was changed.';
      }

      const lastAssistantText =
        [...(conversationRef.current?.snapshot.turns ?? [])]
          .reverse()
          .find(
            turn => turn.role === 'assistant' && turn.status !== 'provisional',
          )?.text ?? '';
      if (
        hasDraftApproval(trimmed, lastAssistantText, {
          cardJustShown: cardJustShown && openCount > 0,
        })
      ) {
        if (openCount === 0) {
          // "Save it" after the card was already saved: say so, add nothing.
          const recent = lastReceipt.current;
          if (recent && Date.now() - recent.at < RECEIPT_WINDOW_MS) {
            groundedReply.current =
              'Nothing is waiting to be saved. The last card is already saved: ' +
              recent.message;
            setLocalNote('Already saved. ' + recent.message);
            void conversationRef.current?.sendContext(groundedReply.current);
            return "That's already saved.";
          }
          // Offline nothing else could be meant; online the model decides.
          if (offlineTurn) return NOTHING_TO_SAVE_REPLY;
        } else {
          // One open card is the one meant; with several, "it" is the card
          // in front of the student.
          const front = shownCardRef.current;
          const frontOpen =
            front === 'review'
              ? !!pending
              : front === 'memory'
              ? memoryOpen
              : front === 'batch'
              ? !!batchOpen
              : false;
          const target: CardKind | null =
            openCount === 1
              ? pending
                ? 'review'
                : memoryOpen
                ? 'memory'
                : 'batch'
              : frontOpen
              ? front
              : null;
          awaitingDetails.current = false;
          voiceTurns.current = [];
          const openIds = new Set(
            [
              pending?.operationId,
              memoryOpen ? cards.memoryActionId : null,
              batchOpen ? cards.batch?.id : null,
            ].filter((id): id is string => !!id),
          );
          if (!target) {
            // LAFINA may still pick the card the student named, by its ID.
            approvalRef.current = {
              at: Date.now(),
              cardIds: openIds,
              consumed: false,
            };
            setLocalNote(
              'Which card should I save? Tap Confirm on the card you mean.',
            );
            void conversationRef.current?.sendContext(
              'The student said to save, but more than one card is open. If their words name one card, call confirm_draft with that card ID; otherwise ask which card to save. Nothing was saved yet.',
            );
            return 'Which card should I save? Tap Confirm on the one you mean.';
          }
          const title =
            target === 'review'
              ? pending?.title
              : target === 'memory'
              ? cards.memory?.text
              : undefined;
          // Recorded first, consumed by this save, so a confirm_draft for the
          // same words waits for it instead of saving a second time.
          approvalRef.current = {
            at: Date.now(),
            cardIds: openIds,
            consumed: true,
          };
          groundedReply.current =
            'The student just said to save the open card and the app is saving it. Do not prepare it again or ask them to confirm again.';
          void conversationRef.current?.sendContext(
            `The student said to save the card on screen${cardLabel(
              title,
            )}. The app is saving it now and will send the save receipt. Do not ask them to confirm again and do not prepare it again.`,
          );
          if (lastStudentTurn.current) lastStudentTurn.current.used = true;
          // "Yes save it, bye", or yes to "save it before you go?": the call
          // ends once the save is done and LAFINA has said goodbye.
          const leaving =
            endsWithGoodbye(trimmed) || askedBeforeLeaving.current;
          askedBeforeLeaving.current = false;
          const saving = saveOpenCard(target, 'voice');
          if (!offlineTurn) {
            if (leaving)
              void saving.then(outcome => {
                if (outcome.saved && session === actionSession.current) {
                  if (pendingSkill.current) handOffNow(pendingSkill.current);
                  else beginClosing('Saved. Ending call…', leavingContext());
                } else if (!outcome.saved) pendingSkill.current = null;
              });
            return null;
          }
          const outcome = await saving;
          if (!offlineTurnOpen.current() || ticket !== turnTicket.current) {
            pendingSkill.current = null;
            return null;
          }
          if (leaving && outcome.saved) {
            const goodbyeLine =
              pendingSkill.current?.line ??
              buildLocalConversationReply(owner, 'bye');
            beginClosing('Saved. Ending call…');
            return `${savedLine(outcome)} ${goodbyeLine}`;
          }
          pendingSkill.current = null;
          return savedLine(outcome);
        }
      }

      // ADR-041: the student asked to use a Skill. Questions and Pomodoro
      // pause/resume are answered on the call; a launch says one line, ends
      // the call and opens the skill. An unsaved card is asked about first.
      const skillIntent = detectSkillIntent(trimmed);
      if (skillIntent) {
        askedBeforeLeaving.current = false;
        pendingSkill.current = null;
        pendingClarify.current = null;
        lastOfflineUstpQuery.current = null;
        voiceTurns.current = [];
        awaitingDetails.current = false;
        if (skillIntent.kind !== 'launch') {
          const line =
            skillIntent.kind === 'status'
              ? skillStatusLine(owner, skillIntent.topic)
              : await skillControlLine(owner, skillIntent.control);
          if (ticket !== turnTicket.current) return null;
          setLocalNote(line);
          if (offlineTurn) return line;
          sendContextPreservingCard(
            `From the student's Skills on this device: ${line} Tell them this in one short sentence. Nothing else was changed.`,
          );
          return null;
        }
        const prepared = onNavigateRef.current
          ? prepareSkillLaunch(owner, skillIntent.launch, {
              online: !offlineTurn,
              materialHint: skillIntent.materialHint,
            })
          : null;
        if (prepared) {
          pendingSkill.current = prepared;
          const name = skillTitle(prepared.launch.skill);
          if (openCount > 0) {
            askedBeforeLeaving.current = true;
            const title = pending?.title ?? cards.memory?.text;
            const ask = `Before I open ${name}, ${
              title ? `the card for ${title}` : 'your card'
            } isn't saved yet. Should I save it?`;
            setLocalNote(ask);
            if (offlineTurn) return ask;
            void conversationRef.current?.sendContext(
              `The student asked to open ${name}, but the card on screen${cardLabel(
                title,
              )} is not saved. Ask once, in one short sentence, whether to save it first. If they say yes, the app saves it and opens ${name}; if no, the app discards it and opens ${name}.`,
            );
            return null;
          }
          if (!offlineTurn) {
            handOffNow(prepared);
            return null;
          }
          setLocalNote(prepared.line);
          beginClosing(`Opening ${name}…`);
          return prepared.line;
        }
      }

      // CALLFIX-03: goodbye, or thanks with nothing left to answer, ends the
      // call after LAFINA's goodbye. With an unsaved card, LAFINA asks once.
      const closing = callClosingKind(trimmed);
      if (
        closing === 'goodbye' ||
        (closing === 'thanks' && openCount === 0 && !saveInFlight.current)
      ) {
        pendingClarify.current = null;
        lastOfflineUstpQuery.current = null;
        voiceTurns.current = [];
        awaitingDetails.current = false;
        if (openCount > 0 && !askedBeforeLeaving.current) {
          askedBeforeLeaving.current = true;
          const title = pending?.title ?? cards.memory?.text;
          const ask = `Before you go, ${
            title ? `the card for ${title}` : 'your card'
          } isn't saved yet. Should I save it?`;
          setLocalNote(ask);
          if (offlineTurn) return ask;
          void conversationRef.current?.sendContext(
            `The student said goodbye, but the card on screen${cardLabel(
              title,
            )} is not saved. Ask once, in one short sentence, whether to save it before they go. If they say yes, the app saves it and ends the call; if they say no or goodbye again, the app ends the call without saving.`,
          );
          return null;
        }
        beginClosing('Ending call…', offlineTurn ? undefined : GOODBYE_CONTEXT);
        if (!offlineTurn) return null;
        const farewell = buildLocalConversationReply(owner, 'bye');
        return closing === 'thanks' ? `You're welcome! ${farewell}` : farewell;
      }

      // Any non-leaving turn (draft revision or new request) retires a prior
      // "save before leaving?" prompt so a later "save it" does not hang up.
      askedBeforeLeaving.current = false;
      pendingSkill.current = null;
      // "Change it to 10:30 and save it": the change, then the save.
      const changeThenSave = pending ? splitTrailingSave(trimmed) : null;
      const changeText = changeThenSave ?? text;
      const changeTrimmed = changeText.trim();
      const fragment = parseIntentFastPath(changeText);
      const hasRevisionDelta = Boolean(
        fragment.date ||
          fragment.time ||
          fragment.endTime ||
          fragment.durationMinutes,
      );
      // Offline: "schedule a capstone meeting" made a card with no time, and
      // the next words give the time ("tomorrow 10 to 11"). Read both as one
      // request, so a meeting with a time becomes an event, not a task due
      // at 10. (Online, the model makes this call itself.)
      const madeFrom = offlineCardRequest.current;
      if (
        offlineTurn &&
        pending &&
        !changeThenSave &&
        madeFrom?.operationId === pending.operationId &&
        !parseIntentFastPath(madeFrom.text).time &&
        fragment.time &&
        !isVoiceScheduleStart(changeTrimmed) &&
        !isVoiceDraftRevision(changeTrimmed)
      ) {
        cancelReviewedCommand(owner, pending.operationId);
        reviewRef.current.dismiss();
        offlineCardRequest.current = null;
        return reviewOffline(`${madeFrom.text} ${changeTrimmed}`);
      }
      if (
        pending &&
        (shownCardRef.current === 'review' || openCount === 1) &&
        (isVoiceDraftRevision(changeTrimmed) ||
          (hasRevisionDelta &&
            (!isVoiceScheduleStart(changeTrimmed) ||
              utteranceTargetsPendingTitle(changeTrimmed, pending)) &&
            !/^(?:what|which|when|where|who|why|how|show|list|check|find|search|do\s+i|am\s+i|is\s+there|can\s+you\s+(?:show|check|find))\b/i.test(
              changeTrimmed,
            )))
      ) {
        const revised = reviseReviewedCommand(
          owner,
          pending.operationId,
          changeText,
        );
        if (
          revised.status === 'proposal' &&
          actionService.isSuggestedCard(pending.operationId)
        )
          actionService.markSuggestedCard(revised.proposal.operationId);
        if (revised.status === 'proposal') {
          presentReview(revised);
          recordReplacedCard(pending.operationId, revised.proposal.operationId);
          lastLocalRevision.current = {
            ticket,
            oldId: pending.operationId,
            newId: revised.proposal.operationId,
            utterance: text,
            reply: revised.reply,
            proposal: revised.proposal,
            at: Date.now(),
          };
          const summary =
            revised.proposal.title +
            ' (' +
            revised.proposal.details.join(', ') +
            '). Card ID: ' +
            revised.proposal.operationId +
            '; revision: 1.';
          if (changeThenSave) {
            // The student gave the change and the save together. Save the
            // card just made from it, by its ID: the rendered card is still
            // the old one until the next render.
            awaitingDetails.current = false;
            voiceTurns.current = [];
            approvalRef.current = {
              at: Date.now(),
              cardIds: new Set([revised.proposal.operationId]),
              consumed: true,
            };
            groundedReply.current =
              'The student changed the card and said to save it; the app is saving it now. Do not ask them to confirm again.';
            void conversationRef.current?.sendContext(
              'The student changed the draft and said to save it in the same sentence: ' +
                summary +
                ' The app is saving it now and will send the save receipt. Do not ask them to confirm again.',
            );
            const saving = confirmHandlersRef.current.confirmDraft(
              'voice',
              revised.proposal.operationId,
            );
            if (!offlineTurn) return null;
            return savedLine(await saving);
          }
          groundedReply.current =
            'A review card is shown: ' +
            summary +
            ' Nothing has been saved yet. Ask the student whether to save it; the app saves it when they say yes or save it.';
          setLocalNote(revised.reply);
          syncCardContext(
            'review',
            revised.proposal.operationId,
            'Draft card updated on screen: ' +
              summary +
              ' Nothing is saved yet. Tell the student the new details and ask whether to save it. When they say yes or save it, the app saves it and confirm_draft returns the receipt.',
            true,
          );
          return 'Updated. ' + spokenCardLine(revised.proposal);
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
        return revised.reply;
      }

      // Offline there is no model to read the request: the device does.
      if (offlineTurn) return reviewOffline(text);

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
        return null;
      }
      setLocalNote(null);
      // Fallback for backends that do not advertise `clientUstpTool: true` yet:
      // surface the on-device USTP Sources card immediately and push verified
      // passages as a contextual update so the model has grounded context.
      if (
        !directProviderTestEnabled() &&
        conversationRef.current?.snapshot.clientUstpTool !== true
      ) {
        const explicitUstp =
          isHandbookQuestion(trimmed) ||
          /\b(?:ustp|student\s+handbook|handbook|university\s+of\s+science\s+and\s+technology\s+of\s+southern\s+philippines)\b/i.test(
            trimmed,
          );
        const followUpUstp =
          !explicitUstp &&
          lastOfflineUstpQuery.current !== null &&
          shouldMergeFollowUpQuery(trimmed);
        if (explicitUstp || followUpUstp) {
          void searchUstpSourcesForVoice(owner, trimmed, {
            previousUserQuery: lastOfflineUstpQuery.current,
          })
            .then(ustpResult => {
              if (
                ticket !== turnTicket.current ||
                owner !== ownerRef.current ||
                session !== actionSession.current ||
                !conversationRef.current ||
                !LIVE.has(conversationRef.current.snapshot.phase)
              ) {
                return;
              }
              setReadResult(ustpResult);
              if (ustpResult.status === 'ok') {
                lastOfflineUstpQuery.current = trimmed;
                recordCallUstpSources(owner, ustpResult.sources);
                const summary = ustpResult.passages
                  .slice(0, 2)
                  .map(p => {
                    const cite = [
                      p.section || p.chapter,
                      p.pageLabel,
                      p.asOf ? `as of ${p.asOf}` : null,
                    ]
                      .filter(Boolean)
                      .join(', ');
                    return `[${cite}] ${p.excerpt.slice(0, 500)}`;
                  })
                  .join('\n');
                sendContextPreservingCard(
                  `Verified on-device USTP sources for "${trimmed}" (answer strictly from these passages, naming section, page, and as-of date):\n${summary}`,
                );
              } else {
                clearCallUstpSources(owner);
                sendContextPreservingCard(
                  `On-device USTP sources status for "${trimmed}": ${ustpResult.spokenReply}`,
                );
              }
            })
            .catch(() => undefined);
          return null;
        }
      }
      if (
        directProviderTestEnabled() ||
        !['query_schedule', 'query_notes'].includes(fragment.intent)
      )
        return null;
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
              syncCardContext(
                'review',
                result.review.proposal.operationId,
                'A review card is shown: ' +
                  result.review.proposal.title +
                  ' (' +
                  result.review.proposal.details.join(', ') +
                  '). Card ID: ' +
                  result.review.proposal.operationId +
                  '; revision: 1. Ask the student to confirm; wait for the app save receipt.',
                true,
              );
            }
          } else if (result.kind === 'executed') {
            executedTurn.current = {text, reply: result.reply};
            setLocalNote(result.reply);
            setUndoOffer(result.undo ?? null);
            groundedReply.current = result.reply;
            const updatedContext = buildStudentVoiceContext(owner);
            sendContextPreservingCard(
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
            groundedReply.current = `Grouped review card is now on screen with ${result.batch.items.length} items. Card ID: ${result.batch.id}; revision: 1. Nothing has been saved yet. Tell the student to review and tap Confirm All.`;
            syncCardContext(
              'batch',
              result.batch.id,
              formatBatchCardContext(result.batch),
              true,
            );
          } else if (
            result.kind === 'note' ||
            result.kind === 'local_answer' ||
            result.kind === 'memory'
          ) {
            setLocalNote(result.reply);
            groundedReply.current = result.reply;
            sendContextPreservingCard(
              `Local verified database result for student request "${text}": ${result.reply}`,
            );
          }
        })
        .catch(() => undefined);
      return null;
    },
    [
      beginClosing,
      handOffNow,
      presentReview,
      recordReplacedCard,
      reviewOffline,
      saveOpenCard,
      sendContextPreservingCard,
      showBatchCard,
      showMemoryCard,
      syncCardContext,
    ],
  );

  const onFinalUserText = useCallback(
    (text: string) => {
      void handleStudentTurn(text, false);
    },
    [handleStudentTurn],
  );

  /**
   * LAFINA's confirm_draft. LAFINA never authorizes a save on its own: it
   * saves only the card that was open when the student's own latest words
   * said to save it (read on this device), and otherwise reports the receipt
   * of a save the student already made by voice or by tapping Confirm.
   */
  const resolveModelConfirm = useCallback(
    async (cardId: string): Promise<SaveOutcome> => {
      const owner = ownerRef.current;
      const running = saveInFlight.current;
      if (running) {
        const outcome = await running;
        return outcome.saved
          ? {
              saved: true,
              message: 'Saved after the student confirmed: ' + outcome.message,
            }
          : outcome;
      }
      const applied = appliedReviewReply(owner, cardId);
      if (applied)
        return {
          saved: true,
          message: 'Already saved after student confirmation: ' + applied,
        };
      const cards = currentCards.current;
      if (
        cards.memory &&
        cards.memoryActionId === cardId &&
        cards.memory.status === 'saved'
      )
        return {
          saved: true,
          message:
            'Already saved to personal memory after the student confirmed.',
        };
      if (
        cards.batch &&
        cards.batch.id === cardId &&
        cards.batch.status === 'saved'
      )
        return {
          saved: true,
          message:
            'Already saved after student confirmation: ' +
            cards.batch.spokenSummary,
        };
      const pending = latestPendingReview(owner, 'voice');
      const memoryOpen =
        cards.memory?.status === 'draft' && !!cards.memoryActionId;
      const batchOpen =
        !!cards.batch &&
        (cards.batch.status === 'draft' ||
          cards.batch.status === 'partial' ||
          cards.batch.status === 'failed');
      let target: {kind: CardKind; id: string} | null = null;
      if (memoryOpen && cardId === cards.memoryActionId)
        target = {kind: 'memory', id: cardId};
      else if (batchOpen && cards.batch && cardId === cards.batch.id)
        target = {kind: 'batch', id: cardId};
      else if (
        pending &&
        cardId !== cards.memoryActionId &&
        cardId !== cards.batch?.id
      )
        // The open draft, even when LAFINA still holds the ID it had before
        // a spoken change replaced it.
        target = {kind: 'review', id: pending.operationId};
      const approval = approvalRef.current;
      if (
        target &&
        approval &&
        !approval.consumed &&
        Date.now() - approval.at < APPROVAL_WINDOW_MS &&
        approval.cardIds.has(target.id)
      ) {
        approval.consumed = true;
        const outcome = await saveOpenCard(target.kind, 'voice');
        return outcome.saved
          ? {
              saved: true,
              message:
                'Saved after the student said to save it: ' + outcome.message,
            }
          : outcome;
      }
      // The device could not tell what the student's "yes" answered, but the
      // words were a plain yes while this card was open: LAFINA, who heard the
      // whole conversation, may save it. A "yes but…", a time, a question or
      // a no is never enough.
      const turn = lastStudentTurn.current;
      if (
        target &&
        !approval &&
        turn &&
        !turn.used &&
        Date.now() - turn.at < PLAIN_APPROVAL_WINDOW_MS &&
        turn.cardIds.has(target.id) &&
        isPlainApproval(turn.text)
      ) {
        turn.used = true;
        const outcome = await saveOpenCard(target.kind, 'voice');
        return outcome.saved
          ? {
              saved: true,
              message: 'Saved after the student said yes: ' + outcome.message,
            }
          : outcome;
      }
      if (target) return {saved: false, message: NOT_APPROVED_REPLY};
      const recent = lastReceipt.current;
      if (recent && Date.now() - recent.at < RECEIPT_WINDOW_MS)
        return {
          saved: true,
          message:
            'Already saved after student confirmation: ' + recent.message,
        };
      return {saved: false, message: NO_OPEN_CARD_REPLY};
    },
    [saveOpenCard],
  );

  const resolvedDeps = useMemo(
    () => (deps ? deps(userId) : undefined),
    [deps, userId],
  );
  const resolvedDepsRef = useRef(resolvedDeps);
  resolvedDepsRef.current = resolvedDeps;
  const resolvedDepsFactory = useMemo(
    () => (resolvedDeps ? () => resolvedDeps : undefined),
    [resolvedDeps],
  );

  const onClientTool = useCallback(
    async (
      name: string,
      parameters: Record<string, unknown>,
      isCurrent: () => boolean,
    ): Promise<string> => {
      const injected = resolvedDepsRef.current?.onClientTool;
      if (injected) return injected(name, parameters, isCurrent);
      const owner = ownerRef.current;
      const perm = isToolExecutionPermitted(owner);
      if (!perm.permitted || !isCurrent())
        throw new Error(perm.reason || 'Tool unavailable');
      // ADR-041: Skills. Reading is local and read-only.
      if (name === 'read_skill_status') {
        const topic = parameters.topic;
        if (
          topic !== 'pomodoro' &&
          topic !== 'flashcards' &&
          topic !== 'gwa' &&
          topic !== 'quiz'
        )
          return 'Unknown topic. Nothing was read.';
        return skillStatusLine(owner, topic);
      }
      // Opening a skill ends the call, so it needs the student's own words;
      // a skill the model offers by itself is a button on screen only.
      if (name === 'open_lafina_skill') {
        const material =
          typeof parameters.material === 'string'
            ? parameters.material
            : undefined;
        const prepared = prepareSkillLaunch(
          owner,
          {
            skill: parameters.skill,
            action: parameters.action,
            breakKind: parameters.breakKind,
            count: parameters.count,
            topic: parameters.topic,
          },
          {online: true, materialHint: material},
        );
        if (!prepared)
          return 'That is not a skill LAFINA can open. Nothing was opened.';
        const label = skillTitle(prepared.launch.skill);
        const already = pendingSkill.current;
        const pendingDraft = latestPendingReview(owner, 'voice');
        const currentCardSet = currentCards.current;
        const hasUnsavedCard = Boolean(
          pendingDraft ||
            currentCardSet.memory?.status === 'draft' ||
            (currentCardSet.batch &&
              (currentCardSet.batch.status === 'draft' ||
                currentCardSet.batch.status === 'partial' ||
                currentCardSet.batch.status === 'failed')),
        );
        if (already?.launch.skill === prepared.launch.skill) {
          if (askedBeforeLeaving.current && hasUnsavedCard) {
            return `Do not open ${label} yet: an unsaved card is on screen. Ask the student once in one short sentence whether to save it before opening ${label}.`;
          }
          return `The app is opening ${label} and has ended the call. Say nothing more.`;
        }
        const asked = detectSkillIntent(lastUserRequest.current);
        if (
          asked?.kind === 'launch' &&
          asked.launch.skill === prepared.launch.skill &&
          onNavigateRef.current &&
          !endingRef.current
        ) {
          if (hasUnsavedCard) {
            pendingSkill.current = prepared;
            askedBeforeLeaving.current = true;
            return `Do not open ${label} yet: an unsaved card is on screen. Ask the student once in one short sentence whether to save it before opening ${label}.`;
          }
          handOffNow(prepared);
          return `The app is opening ${label} and has ended the call. Say nothing more.`;
        }
        setSkillChip(prepared);
        return `A button to open ${label} is on screen. The student's words did not ask to open it, so nothing was opened. Tell them they can tap it; do not end the call.`;
      }
      // A skill request is not a planner request: "start a pomodoro" never
      // becomes a time block, task or reminder card.
      if (PLANNER_PREPARE_TOOLS.has(name)) {
        const skillAsk = detectSkillIntent(lastUserRequest.current);
        const opening = pendingSkill.current?.launch.skill;
        if (opening || skillAsk?.kind === 'launch')
          return `The student asked to open ${skillTitle(
            opening ??
              (skillAsk?.kind === 'launch' ? skillAsk.launch.skill : 'hub'),
          )}, not to add anything to their planner. No card was prepared. The app opens the skill; say nothing more.`;
      }
      // Legacy model tool arguments cannot invent or replace a student's request.
      // New structured tools keep their validated on-screen review contracts.
      if (
        name === 'prepare_lafina_action' &&
        isCompoundVoiceRequest(lastUserRequest.current)
      ) {
        // Older agents still call the single-item tool for a grouped request.
        // Build the review from the student's words instead of rejecting the
        // call or letting one reminder absorb the other's date and title.
        name = 'prepare_multi_action';
        parameters = {text: lastUserRequest.current};
      }
      if (name === 'prepare_lafina_action') {
        const fields = parameters as StructuredActionArgs;
        // A save may be landing right now; decide after it, not before.
        if (saveInFlight.current) {
          await saveInFlight.current;
          if (!isCurrent())
            throw new Error(
              'Request cancelled because conversational turn updated.',
            );
        }
        const repeat = hasStructuredAction(fields)
          ? findRepeatOfSaved(fields, savedCards.current, Date.now())
          : null;
        if (repeat) {
          groundedReply.current = `"${repeat.title}" is already saved: ${repeat.receipt}`;
          return (
            `Already saved: ${repeat.receipt} The student saved "${repeat.title}" earlier in this call. ` +
            'No new card was made and nothing changed. Do not prepare it again and do not ask them to confirm it. ' +
            'Tell them it is saved. Only if they ask to change it, prepare a card that changes the saved item.'
          );
        }
        if (hasStructuredAction(fields)) {
          const checked = validatePayload('legacy.prepare_action', parameters);
          if (!checked.valid) return `Nothing was prepared: ${checked.error}`;
          const structuredData = checked.data as StructuredActionArgs;
          const signature = JSON.stringify(
            Object.entries(structuredData as Record<string, unknown>).sort(
              ([a], [b]) => a.localeCompare(b),
            ),
          );
          const prior = preparedTurn.current;
          const pending = latestPendingReview(owner, 'voice');
          if (
            prior?.ticket === turnTicket.current &&
            prior.signature === signature &&
            pending?.operationId === prior.id
          ) {
            syncCardContext(
              'review',
              pending.operationId,
              formatReviewCardContext(pending),
            );
            return `Review card is already shown: ${pending.title}. Card ID: ${pending.operationId}; revision: 1. Nothing was saved.`;
          }
          // If the student's turn already revised the open card locally to the
          // exact same fields, keep that card instead of minting a duplicate ID.
          if (pending && matchesPendingDraft(pending, structuredData)) {
            preparedTurn.current = {
              ticket: turnTicket.current,
              signature,
              id: pending.operationId,
            };
            presentReview({
              status: 'proposal',
              proposal: pending,
              reply: pending.reply,
            });
            setLocalNote(
              'Check the card — nothing is saved until you confirm.',
            );
            syncCardContext(
              'review',
              pending.operationId,
              formatReviewCardContext(pending),
            );
            return `Review card is now on screen: ${
              pending.title
            }. ${pending.details.join(' ')} Card ID: ${
              pending.operationId
            }; revision: 1. ${SUGGESTED_CARD_NOTE}`;
          }
          const prepared = prepareStructuredReview(
            owner,
            structuredData,
            'voice',
          );
          if (!isCurrent()) {
            if (prepared?.status === 'proposal')
              cancelReviewedCommand(owner, prepared.proposal.operationId);
            return 'Request canceled. Nothing was saved.';
          }
          if (prepared?.status === 'proposal') {
            if (
              pending &&
              pending.operationId !== prepared.proposal.operationId
            ) {
              recordReplacedCard(
                pending.operationId,
                prepared.proposal.operationId,
              );
            }
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
            syncCardContext(
              'review',
              prepared.proposal.operationId,
              formatReviewCardContext(prepared.proposal),
              true,
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
          const prevPending = latestPendingReview(owner, 'voice');
          const prepared = prepareReviewedCommand(owner, draft.intent, {
            surface: 'voice',
          });
          if (prepared.status === 'proposal') {
            if (
              prevPending &&
              prevPending.operationId !== prepared.proposal.operationId
            ) {
              recordReplacedCard(
                prevPending.operationId,
                prepared.proposal.operationId,
              );
            }
            presentReview(prepared);
            setLocalNote('Check the card — nothing is saved until confirmed.');
            syncCardContext(
              'review',
              prepared.proposal.operationId,
              formatReviewCardContext(prepared.proposal),
              true,
            );
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
            syncCardContext(
              'batch',
              reviewed.batch.id,
              formatBatchCardContext(reviewed.batch),
              true,
            );
            return `Grouped review card is now on screen with ${reviewed.batch.items.length} items. Card ID: ${reviewed.batch.id}; revision: 1. Tell the student to review and tap Confirm All.`;
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
        if (pending) {
          syncCardContext(
            'review',
            pending.operationId,
            formatReviewCardContext(pending),
          );
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
      if (name === 'revise_draft' || name === 'cancel_draft') {
        if (saveInFlight.current) {
          await saveInFlight.current;
          if (!isCurrent())
            throw new Error(
              'Request cancelled because conversational turn updated.',
            );
        }
        const mappedCardId = resolveReplacedCardId(parameters.cardId);
        const savedCard =
          savedCardById(parameters.cardId, savedCards.current, Date.now()) ??
          savedCardById(mappedCardId, savedCards.current, Date.now());
        if (
          savedCard &&
          latestPendingReview(owner, 'voice')?.operationId !==
            savedCard.operationId
        ) {
          return name === 'cancel_draft'
            ? `That card is already saved (${savedCard.receipt}), so there is no draft to cancel and nothing changed. If the student wants it removed, prepare a delete card for "${savedCard.title}".`
            : `That card is already saved (${savedCard.receipt}), so it cannot be revised as a draft and nothing changed. To change the saved "${savedCard.title}", prepare a card that updates or reschedules it.`;
        }
      }
      if (name === 'cancel_draft') {
        const cards = currentCards.current;
        const pending = latestPendingReview(owner, 'voice');
        const memoryOpen =
          cards.memory?.status === 'draft' && !!cards.memoryActionId;
        const batchOpen =
          !!cards.batch &&
          (cards.batch.status === 'draft' ||
            cards.batch.status === 'partial' ||
            cards.batch.status === 'failed');
        const rawId =
          typeof parameters.cardId === 'string' ? parameters.cardId.trim() : '';
        if (
          !pending &&
          !memoryOpen &&
          !batchOpen &&
          lastLocalCancel.current &&
          Date.now() - lastLocalCancel.current.at < RECEIPT_WINDOW_MS
        ) {
          return 'Draft already canceled. Nothing was saved.';
        }
        if (
          memoryOpen &&
          cards.memoryActionId &&
          (rawId === cards.memoryActionId ||
            (!pending &&
              !batchOpen &&
              (!rawId || PLACEHOLDER_CARD_ID_RE.test(rawId))))
        ) {
          lastLocalCancel.current = {
            cardId: cards.memoryActionId,
            title: cards.memory?.text || 'memory',
            at: Date.now(),
          };
          lastSentCardContextId.current = null;
          actionService.cancelMemoryProposal(owner, cards.memoryActionId);
          activeMemoryActionId.current = null;
          setActiveMemoryProposal(null);
          setLocalNote('Memory draft canceled. Nothing was saved.');
          sendContextPreservingCard(
            'Memory draft canceled. Nothing was saved.',
          );
          return 'Draft canceled. Nothing was saved.';
        }
        if (
          batchOpen &&
          cards.batch &&
          (rawId === cards.batch.id ||
            (!pending &&
              !memoryOpen &&
              (!rawId || PLACEHOLDER_CARD_ID_RE.test(rawId))))
        ) {
          lastLocalCancel.current = {
            cardId: cards.batch.id,
            title: 'grouped actions',
            at: Date.now(),
          };
          lastSentCardContextId.current = null;
          const result = actionService.cancelMultiActionBatch(
            owner,
            cards.batch,
          );
          setActiveMultiBatch(null);
          setLocalNote(result.spokenSummary);
          sendContextPreservingCard(
            'Grouped review card canceled. Nothing else was saved.',
          );
          return 'Draft canceled. Nothing was saved.';
        }
        if (pending) {
          const normalizedRev =
            parameters.revision === undefined ||
            (typeof parameters.revision === 'number' &&
              Number.isSafeInteger(parameters.revision) &&
              parameters.revision >= 1)
              ? 1
              : parameters.revision;
          const resolvedId =
            !rawId ||
            PLACEHOLDER_CARD_ID_RE.test(rawId) ||
            resolveReplacedCardId(rawId) === pending.operationId ||
            (rawId !== cards.memoryActionId && rawId !== cards.batch?.id)
              ? pending.operationId
              : rawId;
          parameters = {
            ...parameters,
            cardId: resolvedId,
            revision: normalizedRev,
          };
        }
      }
      if (name === 'revise_draft') {
        const pending = latestPendingReview(owner, 'voice');
        const rawId =
          typeof parameters.cardId === 'string' ? parameters.cardId.trim() : '';
        const mappedId = resolveReplacedCardId(rawId);
        const recentRev = lastLocalRevision.current;
        if (pending && recentRev && pending.operationId === recentRev.newId) {
          const isSameTurn = recentRev.ticket === turnTicket.current;
          const isRecentOldId =
            (rawId === recentRev.oldId ||
              mappedId === pending.operationId ||
              !rawId ||
              PLACEHOLDER_CARD_ID_RE.test(rawId)) &&
            Date.now() - recentRev.at < 8000;
          if (isSameTurn || isRecentOldId) {
            const incomingInst =
              typeof parameters.instruction === 'string'
                ? parameters.instruction.trim()
                : '';
            if (
              instructionAlreadyReflectedInDraft(
                incomingInst,
                pending,
                recentRev.utterance,
                isSameTurn,
              )
            ) {
              syncCardContext(
                'review',
                pending.operationId,
                formatReviewCardContext(
                  pending,
                  'Draft card updated on screen',
                ),
              );
              return (
                'A review card is shown: ' +
                recentRev.reply +
                ' Card ID: ' +
                pending.operationId +
                '; revision: 1. Nothing has been saved yet. Ask the student to confirm; when they say yes or save it, the app saves it and confirm_draft returns the receipt.'
              );
            }
          }
        }
        if (pending) {
          const cards = currentCards.current;
          const normalizedRev =
            parameters.revision === undefined ||
            (typeof parameters.revision === 'number' &&
              Number.isSafeInteger(parameters.revision) &&
              parameters.revision >= 1)
              ? 1
              : parameters.revision;
          const resolvedId =
            !rawId ||
            PLACEHOLDER_CARD_ID_RE.test(rawId) ||
            mappedId === pending.operationId ||
            (rawId !== cards.memoryActionId && rawId !== cards.batch?.id)
              ? pending.operationId
              : rawId;
          parameters = {
            ...parameters,
            cardId: resolvedId,
            revision: normalizedRev,
          };
        }
      }
      if (name === 'confirm_draft') {
        const rawId =
          typeof parameters.cardId === 'string' ? parameters.cardId.trim() : '';
        const pending = latestPendingReview(owner, 'voice');
        const cards = currentCards.current;
        const resolvedId =
          !rawId || PLACEHOLDER_CARD_ID_RE.test(rawId)
            ? pending?.operationId ||
              (cards.memory?.status === 'draft' && cards.memoryActionId
                ? cards.memoryActionId
                : null) ||
              cards.batch?.id ||
              savedCards.current[savedCards.current.length - 1]?.operationId ||
              'current'
            : resolveReplacedCardId(rawId) || rawId;
        const normalizedRev =
          parameters.revision === undefined ||
          (typeof parameters.revision === 'number' &&
            Number.isSafeInteger(parameters.revision) &&
            parameters.revision >= 1)
            ? 1
            : parameters.revision;
        parameters = {
          ...parameters,
          cardId: resolvedId,
          revision: normalizedRev,
        };
      }
      if (name === 'save_lafina_memory') {
        if (
          currentCards.current.memory?.status === 'draft' &&
          activeMemoryActionId.current
        ) {
          syncCardContext(
            'memory',
            activeMemoryActionId.current,
            formatMemoryCardContext(
              currentCards.current.memory,
              activeMemoryActionId.current,
            ),
          );
          return (
            `A memory review card is already open for "${currentCards.current.memory.text}". ` +
            `Card ID: ${activeMemoryActionId.current}; revision: 1. Nothing has been saved yet — wait for the student to confirm.`
          );
        }
        const rawReq =
          typeof parameters.request === 'string'
            ? parameters.request.trim()
            : '';
        const naturalRememberCue =
          /\b(?:remember|keep\s+in\s+mind|note\s+that|don'?t\s+forget)\b/i.test(
            lastUserRequest.current,
          ) &&
          !/\b(?:don'?t|do\s+not|never|stop)\s+remember\b/i.test(
            lastUserRequest.current,
          );
        const explicitFact = explicitMemory(lastUserRequest.current);
        if (explicitFact) {
          parameters = {request: lastUserRequest.current};
        } else if (naturalRememberCue && rawReq.length >= 3) {
          parameters = {request: rawReq};
        } else {
          return 'No memory was saved. Ask the student what they want remembered.';
        }
      }
      if (callSettings.toolAudioCue) {
        try {
          Vibration.vibrate(20);
        } catch {
          // best-effort
        }
      }
      const pendingBeforeTool = latestPendingReview(owner, 'voice');
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
          onDraftCanceled: () => {
            if (pendingBeforeTool) {
              lastLocalCancel.current = {
                cardId: pendingBeforeTool.operationId,
                title: pendingBeforeTool.title,
                at: Date.now(),
              };
            }
            lastSentCardContextId.current = null;
            reviewRef.current.dismiss();
            sendContextPreservingCard('Draft canceled. Nothing was saved.');
          },
          // Card revisions are always 1 here; the card ID and the student's
          // own words decide, so a model-side revision count never blocks.
          onConfirmDraft: cardId => resolveModelConfirm(cardId),
          onProposal: result => {
            if (result.kind === 'proposal') {
              presentReview(result.review);
              setLocalNote(
                'Check the card — nothing is saved until confirmed.',
              );
              if (result.review.status === 'proposal') {
                if (
                  pendingBeforeTool &&
                  pendingBeforeTool.operationId !==
                    result.review.proposal.operationId
                ) {
                  recordReplacedCard(
                    pendingBeforeTool.operationId,
                    result.review.proposal.operationId,
                  );
                }
                syncCardContext(
                  'review',
                  result.review.proposal.operationId,
                  formatReviewCardContext(
                    result.review.proposal,
                    name === 'revise_draft'
                      ? 'Draft card updated on screen'
                      : 'Active review card on screen',
                  ),
                  true,
                );
              }
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
            syncCardContext(
              'memory',
              actionId,
              formatMemoryCardContext(memProp, actionId),
              true,
            );
          },
          onMultiActionBatch: batch => {
            showBatchCard(batch);
            setLocalNote(
              'Check the grouped actions card — nothing is saved yet.',
            );
            syncCardContext(
              'batch',
              batch.id,
              formatBatchCardContext(batch),
              true,
            );
          },
        },
      );
      if (toolError) throw new Error('Tool request failed.');
      return answer;
    },
    [
      handOffNow,
      callSettings.toolAudioCue,
      presentReview,
      recordReplacedCard,
      resolveModelConfirm,
      resolveReplacedCardId,
      sendContextPreservingCard,
      showBatchCard,
      showMemoryCard,
      syncCardContext,
    ],
  );

  const handleSaveMemory = useCallback(
    (editedText?: string, via: SaveVia = 'tap'): SaveOutcome => {
      if (!activeMemoryProposal || !activeMemoryActionId.current) {
        return {
          saved: false,
          message: 'No memory card was active. Nothing has been saved.',
        };
      }
      if (via === 'tap') {
        askedBeforeLeaving.current = false;
        pendingSkill.current = null;
      }
      const owner = ownerRef.current;
      const result = actionService.confirmMemoryProposal(
        owner,
        activeMemoryActionId.current,
        editedText,
      );
      // LAFINA hears every outcome, tapped or spoken, so it never asks again
      // about a card the student already answered.
      const how =
        via === 'tap'
          ? 'The student tapped Save on the memory card.'
          : 'The student said to save the memory card.';
      void conversationRef.current?.sendContext(
        result.success && result.status === 'saved'
          ? `${how} Saved to personal memory. No memory card is waiting now; do not ask them to confirm it again.`
          : `${how} Not saved: ${
              result.status === 'duplicate'
                ? 'that fact is already in their memory.'
                : result.status === 'disabled'
                ? 'memory is turned off in Settings.'
                : result.error || 'could not save memory.'
            }`,
      );
      if (result.success && result.status === 'saved') {
        lastSentCardContextId.current = null;
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
      void conversationRef.current?.sendContext(
        'The student tapped Undo: that memory was removed and is no longer saved.',
      );
    }
  }, [activeMemoryProposal]);

  const handleConfirmMultiAll = useCallback(
    async (via: SaveVia = 'tap'): Promise<SaveOutcome> => {
      if (!activeMultiBatch) {
        return {
          saved: false,
          message: 'No grouped actions card is active. Nothing has been saved.',
        };
      }
      if (via === 'tap') {
        askedBeforeLeaving.current = false;
        pendingSkill.current = null;
      }
      setBatchBusy(true);
      try {
        const {batch, spokenSummary} =
          await actionService.confirmMultiActionBatch(
            ownerRef.current,
            activeMultiBatch,
            undefined,
            () => true,
            {onDevice: modeRef.current === 'offline'},
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
        if (batch.status === 'saved') lastSentCardContextId.current = null;
        setLocalNote(spokenSummary);
        const refreshed = buildStudentVoiceContext(ownerRef.current);
        const how =
          via === 'tap'
            ? 'The student tapped Confirm All on the grouped card.'
            : 'The student said to save the grouped card.';
        const summary = `${how} ${spokenSummary} Do not ask them to confirm these again.`;
        void conversationRef.current?.sendContext(
          refreshed ? `${summary}\n\n${refreshed}` : summary,
        );
        if (via === 'tap') announce(speakable(spokenSummary));
        return {
          saved: batch.status === 'saved' || batch.status === 'partial',
          message: spokenSummary,
        };
      } catch {
        const msg =
          'Those grouped actions could not be saved. Review the card before retrying.';
        setLocalNote(msg);
        void conversationRef.current?.sendContext('Not saved: ' + msg);
        return {saved: false, message: msg};
      } finally {
        setBatchBusy(false);
      }
    },
    [activeMultiBatch, announce],
  );

  const handleCancelMultiAll = useCallback(() => {
    if (!activeMultiBatch) return;
    askedBeforeLeaving.current = false;
    pendingSkill.current = null;
    lastLocalCancel.current = {
      cardId: activeMultiBatch.id,
      title: 'grouped actions',
      at: Date.now(),
    };
    lastSentCardContextId.current = null;
    const {batch, spokenSummary} = actionService.cancelMultiActionBatch(
      ownerRef.current,
      activeMultiBatch,
    );
    setActiveMultiBatch(batch);
    setLocalNote(spokenSummary);
    void conversationRef.current?.sendContext(
      'The student canceled the grouped card. ' +
        spokenSummary +
        ' Nothing else on it will be saved.',
    );
    announce(CANCELED_REPLY);
  }, [activeMultiBatch, announce]);

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
      await runSave(async (): Promise<SaveOutcome> => {
        setBatchBusy(true);
        try {
          const {batch, spokenSummary} =
            await actionService.retryMultiActionItem(
              ownerRef.current,
              activeMultiBatch,
              itemId,
              {onDevice: modeRef.current === 'offline'},
            );
          if (
            ownerRef.current !== batch.ownerId ||
            actionSession.current !== batch.sessionId
          ) {
            return {saved: false, message: 'Session ended.'};
          }
          setActiveMultiBatch(batch);
          if (batch.status === 'saved') lastSentCardContextId.current = null;
          setLocalNote(spokenSummary);
          return {
            saved: batch.status === 'saved' || batch.status === 'partial',
            message: spokenSummary,
          };
        } catch {
          const msg =
            'That grouped action could not be retried. Please review the card.';
          setLocalNote(msg);
          return {saved: false, message: msg};
        } finally {
          setBatchBusy(false);
        }
      });
    },
    [activeMultiBatch, runSave],
  );

  /** What is on screen, told to LAFINA when the call reconnects (ADR-046). */
  const callStateRef = useRef<() => string | null>(() => null);
  callStateRef.current = () => {
    const parts: string[] = [];
    const pending = latestPendingReview(ownerRef.current, 'voice');
    if (pending)
      parts.push(
        `a review card${cardLabel(pending.title)} (Card ID: ${
          pending.operationId
        }; revision: 1) is waiting for the student to save or cancel; nothing is saved yet.`,
      );
    if (
      activeMemoryProposal?.status === 'draft' &&
      activeMemoryActionId.current
    )
      parts.push(
        `a memory card (Card ID: ${activeMemoryActionId.current}; revision: 1) is waiting for the student to save or cancel.`,
      );
    if (
      activeMultiBatch &&
      (activeMultiBatch.status === 'draft' ||
        activeMultiBatch.status === 'partial' ||
        activeMultiBatch.status === 'failed')
    )
      parts.push(
        `a card with several changes (Card ID: ${activeMultiBatch.id}; revision: 1) is waiting for the student to save or cancel.`,
      );
    return parts.length ? parts.join(' ') : null;
  };
  const onlineConversation = useVoiceConversation(userId, {
    onFinalUserText,
    onTurnInterrupted: () => {
      turnTicket.current += 1;
    },
    onClientTool,
    getCallState: () => callStateRef.current(),
    deps: resolvedDepsFactory,
  });
  /** The offline call's turn: the device reads it and LAFINA says the line. */
  const respondOffline = useCallback(
    async (
      text: string,
      _source: OfflineTurnSource,
      turn: OfflineTurnContext,
    ): Promise<OfflineReply> => {
      offlineTurnOpen.current = turn.isCurrent;
      const trimmed = text.trim();
      // A goodbye (or a closing thanks) is read in handleStudentTurn, which
      // knows whether a card is still unsaved; it ends the call after the line.
      replyInChat.current = null;
      const reply = await handleStudentTurn(trimmed, true);
      // A save's receipt is already in Chat; the spoken line is not added.
      if (reply && reply === replyInChat.current)
        return {text: reply, inChat: true};
      return reply;
    },
    [handleStudentTurn],
  );
  const offlineCall = useOfflineCall(userId, {
    respond: respondOffline,
    deps: offlineDeps,
  });
  announceRef.current = offlineCall.announce;
  const callsRef = useRef({online: onlineConversation, offline: offlineCall});
  callsRef.current = {online: onlineConversation, offline: offlineCall};
  /** An online start is in progress; a connection failure falls back once. */
  const onlineAttempt = useRef(false);
  const startCallRef = useRef<(decision: CallModeDecision) => void>(
    () => undefined,
  );
  const connectedRef = useRef<boolean | null>(null);
  const conversation = offline ? offlineCall : onlineConversation;
  conversationRef.current = conversation;

  // Between calls the badge follows the connection; a running call keeps
  // the mode it started with.
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const apply = (
      state: {
        isConnected: boolean | null;
        isInternetReachable?: boolean | null;
      },
      fromEvent: boolean,
    ) => {
      if (!active) return;
      if (fromEvent) {
        receivedEvent = true;
      } else if (receivedEvent) {
        return;
      }
      connectedRef.current =
        state.isConnected === false || state.isInternetReachable === false
          ? false
          : state.isConnected === true
          ? true
          : null;
      const phase = conversationRef.current?.snapshot.phase ?? 'idle';
      if (phase !== 'idle' && phase !== 'ended') return;
      const next = predictCallMode(ownerRef.current, connectedRef.current);
      setCallMode(prev =>
        prev.mode === next.mode && prev.reason === next.reason ? prev : next,
      );
    };
    const unsubscribe = NetInfo.addEventListener(state => apply(state, true));
    void NetInfo.fetch()
      .then(state => apply(state, false))
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  // The online call could not reach the internet when it started: carry on
  // offline without another tap. Later drops offer "Call offline instead".
  const onlineFailure = onlineConversation.snapshot.failure;
  useEffect(() => {
    if (
      !onlineFailure ||
      modeRef.current !== 'online' ||
      !onlineAttempt.current
    )
      return;
    onlineAttempt.current = false;
    if (
      onlineFailure.kind === 'offline' ||
      onlineFailure.kind === 'connect_failed'
    )
      startCallRef.current({
        mode: 'offline',
        reason:
          onlineFailure.kind === 'offline'
            ? 'no_internet'
            : 'online_unavailable',
      });
  }, [onlineFailure]);
  // Once the online call is connected, a later failure is not a start failure.
  useEffect(() => {
    if (onlineConversation.snapshot.connectedAt) onlineAttempt.current = false;
  }, [onlineConversation.snapshot.connectedAt]);
  const {snapshot} = conversation;
  // CALLFIX-03: a call the student said goodbye to closes its screen once
  // LAFINA's goodbye has been said and the line is down.
  useEffect(() => {
    if (!endingRef.current) return;
    if (snapshot.phase === 'restart_required') {
      endingRef.current = null;
      setEnding(null);
      pendingSkill.current = null;
      speakOnArrival.current = false;
      askedBeforeLeaving.current = false;
      return;
    }
    if (snapshot.phase !== 'ended' && snapshot.phase !== 'failed') return;
    endingRef.current = null;
    setEnding(null);
    askedBeforeLeaving.current = false;
    const skill = pendingSkill.current;
    const speak = speakOnArrival.current;
    pendingSkill.current = null;
    speakOnArrival.current = false;
    // ADR-041: the skill opens in place of the call screen.
    if (skill) {
      if (speak) handoffSpeakingRef.current = true;
      if (openSkill(skill.launch)) {
        if (speak) {
          void ttsService
            .stop()
            .catch(() => undefined)
            .then(() => ttsService.speak(skill.line))
            .catch(() => undefined);
        } else {
          void ttsService.stop().catch(() => undefined);
        }
        return;
      }
      handoffSpeakingRef.current = false;
    }
    void ttsService.stop().catch(() => undefined);
    onBackRef.current();
  }, [snapshot.phase, openSkill]);
  const live = LIVE.has(snapshot.phase);
  const connecting = snapshot.phase === 'connecting';
  const reconnecting = snapshot.phase === 'reconnecting';
  const pulsing = connecting || reconnecting;
  const reducedMotion = useReducedMotion();
  const connectingPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (
      !pulsing ||
      paused ||
      reducedMotion ||
      process.env.NODE_ENV === 'test'
    ) {
      connectingPulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(connectingPulse, {
          toValue: 1,
          duration: 950,
          useNativeDriver: true,
        }),
        Animated.timing(connectingPulse, {
          toValue: 0,
          duration: 950,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulsing, paused, connectingPulse, reducedMotion]);
  // ADR-046: one soft buzz when the line drops, and a spoken status for
  // screen readers when it drops and when it comes back.
  const wasReconnecting = useRef(false);
  useEffect(() => {
    if (reconnecting === wasReconnecting.current) return;
    wasReconnecting.current = reconnecting;
    if (reconnecting) {
      if (callSettings.callConnectedHaptics) {
        try {
          Vibration.vibrate(20);
        } catch {
          // best-effort
        }
      }
      AccessibilityInfo.announceForAccessibility?.('Reconnecting the call');
    } else if (LIVE.has(snapshot.phase)) {
      AccessibilityInfo.announceForAccessibility?.('Call reconnected');
    }
  }, [reconnecting, snapshot.phase, callSettings.callConnectedHaptics]);
  useEffect(() => {
    if (
      snapshot.phase !== 'ended' &&
      snapshot.phase !== 'restart_required' &&
      snapshot.phase !== 'failed'
    )
      return;
    turnTicket.current += 1;
    actionService.clearSessionActions(actionSession.current);
    clearCallUstpSources(userId);
    const pending = latestPendingReview(userId, 'voice');
    if (pending) cancelReviewedCommand(userId, pending.operationId);
    reviewRef.current.dismiss();
    setActiveMemoryProposal(null);
    activeMemoryActionId.current = null;
    memoryEditedTextRef.current = undefined;
    setActiveMultiBatch(null);
    setReadResult(null);
    setShowTyping(false);
    setDraftCorrection('');
    setSkillChip(null);
    lastOfflineUstpQuery.current = null;
    askedBeforeLeaving.current = false;
    pendingSkill.current = null;
    lastLocalRevision.current = null;
    replacedCardIds.current.clear();
    lastLocalCancel.current = null;
    lastSentCardContextId.current = null;
  }, [snapshot.phase, userId]);

  // Records when the live call connected, with haptic cues. The once-a-second
  // clock is CallDurationText's own, so it never re-renders this screen.
  useEffect(() => {
    if (live) {
      if (!callConnectedAt.current) {
        callConnectedAt.current = snapshot.connectedAt || Date.now();
        setCallStartedAt(callConnectedAt.current);
        if (callSettings.callConnectedHaptics) {
          try {
            Vibration.vibrate(30);
          } catch {
            // best-effort
          }
        }
      }
      return;
    }
    if (callConnectedAt.current && callSettings.callEndHaptics) {
      try {
        Vibration.vibrate([0, 40, 30, 40]);
      } catch {
        // best-effort
      }
    }
    callConnectedAt.current = null;
    setCallStartedAt(null);
  }, [
    live,
    snapshot.phase,
    snapshot.connectedAt,
    callSettings.callConnectedHaptics,
    callSettings.callEndHaptics,
  ]);

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
    setDraftCorrection('');
    setShowTyping(false);
    setUndoOffer(null);
    setSkillChip(null);
    lastOfflineUstpQuery.current = null;
    setActiveMemoryProposal(null);
    activeMemoryActionId.current = null;
    memoryEditedTextRef.current = undefined;
    setActiveMultiBatch(null);
    lastLocalRevision.current = null;
    replacedCardIds.current.clear();
    lastLocalCancel.current = null;
    lastSentCardContextId.current = null;
    clearCallUstpSources(userId);
    setCallSettings(getCallLafinaSettings(userId));
    return () => {
      actionService.clearSessionActions(actionSession.current);
      clearCallUstpSources(userId);
      const pending = latestPendingReview(userId, 'voice');
      if (pending) cancelReviewedCommand(userId, pending.operationId);
    };
  }, [userId]);

  const hasActiveCard = Boolean(
    review?.proposal || activeMemoryProposal || activeMultiBatch,
  );
  // A new card takes the stage; a saved card still leaving is dropped.
  useEffect(() => {
    if (hasActiveCard) setSavedExit(null);
  }, [hasActiveCard]);
  // A saved memory card keeps Undo a moment, then leaves like a saved card.
  useEffect(() => {
    const memory = activeMemoryProposal;
    if (memory?.status !== 'saved') return undefined;
    const timer = setTimeout(() => {
      activeMemoryActionId.current = null;
      setActiveMemoryProposal(null);
      setSavedExit({key: `memory-${memory.id}`, kind: 'memory', memory});
    }, MEMORY_SAVED_HOLD_MS);
    return () => clearTimeout(timer);
  }, [activeMemoryProposal]);
  // A grouped card whose items all saved shows them a moment, then leaves.
  useEffect(() => {
    const batch = activeMultiBatch;
    if (batch?.status !== 'saved') return undefined;
    const timer = setTimeout(() => {
      setActiveMultiBatch(null);
      setSavedExit({
        key: `batch-${batch.id}-${batch.revision}`,
        kind: 'batch',
        batch,
      });
    }, BATCH_SAVED_HOLD_MS);
    return () => clearTimeout(timer);
  }, [activeMultiBatch]);
  // One card at a time, the newest in front. The others wait behind it.
  const openCards: CardKind[] = [];
  if (review?.proposal) openCards.push('review');
  if (activeMultiBatch) openCards.push('batch');
  if (activeMemoryProposal) openCards.push('memory');
  const shownCard: CardKind | null =
    cardFocus && openCards.includes(cardFocus)
      ? cardFocus
      : openCards[0] ?? null;
  shownCardRef.current = shownCard;
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
    if (attentionKey) {
      setSettingsModalVisible(false);
      setUstpSourcesTarget(null);
      attentionRef.current?.();
    }
  }, [attentionKey]);

  useEffect(() => {
    if (paused) {
      setSettingsModalVisible(false);
      setUstpSourcesTarget(null);
    }
  }, [paused]);

  useEffect(() => {
    return () => {
      if (!handoffSpeakingRef.current) {
        void ttsService.stop();
      }
    };
  }, []);

  // The screen is open and the next call will be offline: load speech
  // recognition now (it unloads itself after a minute unused), so tapping
  // Call does not start with a cold model. Nothing listens.
  const expectsOffline = callMode.mode === 'offline';
  useEffect(() => {
    if (expectsOffline && !paused) void warmupOfflineSpeech();
  }, [expectsOffline, paused]);
  // The next call will be online: ask the server what it offers now, so
  // tapping Call skips that round trip (consented, signed-in students only).
  const prepareOnline = onlineConversation.prepare;
  const onlineIdle =
    onlineConversation.snapshot.phase === 'idle' ||
    onlineConversation.snapshot.phase === 'ended';
  useEffect(() => {
    if (!expectsOffline && !paused && onlineIdle) prepareOnline();
    // prepareOnline is a new function each render; the controller dedupes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectsOffline, paused, onlineIdle, consented, dataConsented, userId]);

  /**
   * Starts one call in the given mode. Online and offline share the same
   * cards, saves and screen; only who listens and speaks differs.
   */
  const startCall = useCallback(
    (decision: CallModeDecision) => {
      void ttsService.stop();
      if (decision.mode === 'online') {
        const perm = isToolExecutionPermitted(ownerRef.current);
        if (!perm.permitted && perm.reason?.includes('disclosure')) {
          setEnableError('Please review the data disclosure before starting.');
          return;
        }
      }
      modeRef.current = decision.mode;
      onlineAttempt.current = decision.mode === 'online';
      setCallMode(decision);
      resetCallState();
      const calls = callsRef.current;
      // Speech recognition and the installed offline model load while LAFINA
      // greets the student, so the first answer does not wait for them. One
      // after the other: loading both at once competes for memory and cores
      // and makes the first listen slower.
      if (decision.mode === 'offline') {
        const owner = ownerRef.current;
        void warmupOfflineSpeech()
          .then(() => warmUpOfflineModel(owner))
          .catch(() => false);
      }
      (decision.mode === 'offline' ? calls.offline : calls.online).start();
    },
    // resetCallState only touches refs and state setters.
    [],
  );

  startCallRef.current = startCall;

  /**
   * Online whenever it can run, decided at the moment of the tap. If the
   * online call then cannot connect, it falls back to offline by itself.
   */
  const handleStart = useCallback(() => {
    startCall(predictCallMode(ownerRef.current, connectedRef.current));
  }, [startCall]);

  /** The online call failed or dropped: carry on with the phone's voice. */
  /**
   * ADR-046: the online call stopped (the app left the screen, a phone call,
   * or a drop that could not reconnect). Continue keeps the transcript and
   * tells LAFINA the call is continuing, so it picks up instead of greeting.
   */
  const handleContinue = useCallback(() => {
    void ttsService.stop();
    modeRef.current = 'online';
    onlineAttempt.current = false;
    // resetCallState only touches refs and state setters.
    resetCallState();
    callsRef.current.online.resume();
  }, []);

  const handleCallOffline = useCallback(() => {
    startCall({mode: 'offline', reason: 'online_unavailable'});
  }, [startCall]);

  function resetCallState(): void {
    actionService.clearSessionActions(actionSession.current);
    clearCallUstpSources(ownerRef.current);
    actionSession.current = generateId('call-actions');
    lastUserRequest.current = '';
    lastOfflineUstpQuery.current = null;
    setReadResult(null);
    setUstpSourcesTarget(null);
    setShowTyping(false);
    setDraftCorrection('');
    setSkillChip(null);
    setUndoOffer(null);
    askedBeforeLeaving.current = false;
    pendingSkill.current = null;
    memoryEditedTextRef.current = undefined;
    executedTurn.current = null;
    voiceTurns.current = [];
    awaitingDetails.current = false;
    groundedReply.current = NO_ACTION_REPLY;
    turnReview.current = null;
    approvalRef.current = null;
    lastReceipt.current = null;
    savedCards.current = [];
    lastLocalRevision.current = null;
    replacedCardIds.current.clear();
    lastLocalCancel.current = null;
    lastSentCardContextId.current = null;
    setCardFocus(null);
    turnTicket.current += 1;
    setDismissedTurnId(null);
    setLocalNote(null);
    setEnableError(null);
    pendingClarify.current = null;
    offlineCardRequest.current = null;
    recentOfflineReplies.current = [];
  }

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

  const handleConfirm = useCallback(
    async (
      via: SaveVia = 'tap',
      operationId?: string,
    ): Promise<SaveOutcome> => {
      if (via === 'tap') {
        askedBeforeLeaving.current = false;
        pendingSkill.current = null;
      }
      setDraftCorrection('');
      const owner = userId;
      const session = actionSession.current;
      // A tap applies the card the student is looking at. A spoken save applies
      // the one open draft (there is one per surface), which a spoken change
      // may have replaced since the last render.
      const targetId =
        operationId ??
        (via === 'voice'
          ? latestPendingReview(owner, 'voice')?.operationId
          : reviewRef.current.proposal?.operationId);
      const pendingNow = latestPendingReview(owner, 'voice');
      const confirming =
        pendingNow && pendingNow.operationId === targetId
          ? pendingNow
          : reviewRef.current.proposal?.operationId === targetId
          ? reviewRef.current.proposal
          : null;
      const decision = await reviewRef.current.confirm({
        speakReply: false,
        operationId:
          operationId ??
          (via === 'voice'
            ? latestPendingReview(owner, 'voice')?.operationId
            : undefined),
      });
      if (!decision) {
        return {
          saved: false,
          message: 'No pending draft card was found. Nothing has been saved.',
        };
      }
      const saved = decision.outcome?.status === 'applied';
      if (saved && confirming && owner === ownerRef.current) {
        // The card plays its Saved exit; the store has already retired it.
        setSavedExit({
          key: `review-${confirming.operationId}`,
          kind: 'review',
          proposal: confirming,
        });
        AccessibilityInfo.announceForAccessibility?.(
          `Saved: ${confirming.title}`,
        );
      }
      let alarm: AlarmStatus | null = null;
      if (
        decision.outcome?.status === 'applied' &&
        decision.outcome.receipt.reminderId
      ) {
        const delivery = await verifyReminderDelivery(
          owner,
          decision.outcome.receipt.reminderId,
        );
        alarm = delivery.status;
      }
      // One line: what was saved, when, and whether its alarm is set (it
      // used to be the alarm status alone, shown twice on the call screen).
      const reply = saved
        ? savedConfirmation(confirming, decision.reply, alarm)
        : decision.reply;
      if (saved && decision.assistantMessage) replyInChat.current = reply;
      if (saved && confirming) {
        const record = savedCardFromProposal(confirming, reply, Date.now());
        if (record)
          savedCards.current = [...savedCards.current, record].slice(-10);
        lastSentCardContextId.current = null;
      }
      if (
        owner !== ownerRef.current ||
        session !== actionSession.current ||
        !conversationRef.current ||
        !LIVE.has(conversationRef.current.snapshot.phase)
      ) {
        return {saved, message: reply};
      }
      setLocalNote(reply);
      const remaining = openCardReminder();
      groundedReply.current = saved
        ? 'The student confirmed the card and it was saved: ' +
          reply +
          (remaining ? ` ${remaining}` : ' No card is open now.')
        : 'The card was not saved: ' + reply;
      const refreshed = buildStudentVoiceContext(userId);
      const how =
        via === 'tap'
          ? 'The student tapped Confirm on the card.'
          : 'The student said to save the card.';
      const confirmMsg = saved
        ? `Confirmed and saved action result: ${reply} ${how} It is saved now${
            remaining ? `. ${remaining}` : ' and no card is open.'
          } Tell the student it is saved if they ask; do not ask them to confirm it again.`
        : `Action was not saved: ${reply} ${how}`;
      void conversation.sendContext(
        refreshed ? `${confirmMsg}\n\n${refreshed}` : confirmMsg,
      );
      // Offline, LAFINA says it out loud (a spoken save answers in its turn).
      if (via === 'tap')
        announce(speakable(saved ? reply : `I couldn't save it. ${reply}`), {
          inChat: saved && !!decision.assistantMessage,
        });
      return {saved, message: reply};
    },
    [announce, conversation, openCardReminder, userId],
  );

  // Every save path goes through runSave, so two at once share one write.
  confirmHandlersRef.current = {
    confirmDraft: (via = 'tap', operationId) =>
      runSave(() => handleConfirm(via, operationId)),
    saveMemory: handleSaveMemory,
    confirmMultiAll: (via = 'tap') => runSave(() => handleConfirmMultiAll(via)),
  };

  const handleCancelReview = useCallback(() => {
    askedBeforeLeaving.current = false;
    pendingSkill.current = null;
    setDraftCorrection('');
    const cancelledCard = reviewRef.current.proposal;
    const decision = reviewRef.current.cancel();
    if (decision) {
      if (cancelledCard) {
        lastLocalCancel.current = {
          cardId: cancelledCard.operationId,
          title: cancelledCard.title,
          at: Date.now(),
        };
      }
      lastSentCardContextId.current = null;
      const remaining = openCardReminder();
      setLocalNote(decision.reply);
      groundedReply.current =
        'The student canceled the card. Nothing was saved' +
        (remaining ? `. ${remaining}` : ' and no card is open now.');
      void conversation.sendContext(
        'The student canceled the review card. Nothing was saved' +
          (remaining ? `. ${remaining}` : ' and no card is open now.') +
          ' Do not save or prepare it again unless they ask.',
      );
      announce(CANCELED_REPLY);
    }
  }, [announce, conversation, openCardReminder]);

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
  // ADR-046: an online call that stopped part-way can continue with its memory.
  const canContinue =
    !offline &&
    !failure &&
    snapshot.phase === 'restart_required' &&
    snapshot.turns.some(turn => turn.status !== 'provisional');
  // The note is hidden when LAFINA just said the same thing (a save used to
  // show "Saved locally. Alarm registered." twice).
  const shownNote =
    localNote && !repeatsLine(visibleAgentReply?.text, localNote)
      ? localNote
      : null;
  // The consent card covers sending the microphone online; the offline call
  // keeps everything on the phone and needs only the OS microphone permission.
  const needsConsent =
    !offline && (!consented || !dataConsented) && !live && !connecting;
  const hasDetailsCard = Boolean(
    !hasActiveCard &&
      (readResult === null ||
        (typeof readResult !== 'string' &&
          'ustpSearch' in readResult &&
          Boolean(visibleAgentReply))) &&
      !needsConsent &&
      !failure &&
      snapshot.phase !== 'restart_required' &&
      (shownNote || snapshot.notice || visibleAgentReply),
  );
  const captionReplyStyle =
    callSettings.captionSize === 'extra_large'
      ? styles.detailsReplyExtraLarge
      : callSettings.captionSize === 'large'
      ? styles.detailsReplyLarge
      : null;
  const formattedAgentReply = visibleAgentReply
    ? formatCallReplyMarkdown(visibleAgentReply.text)
    : '';
  const formattedLocalNote = shownNote
    ? formatCallReplyMarkdown(shownNote)
    : '';
  const localNoteIsMultiLine = formattedLocalNote.includes('\n');
  const statusText =
    offline && snapshot.toolPhrase && live
      ? snapshot.toolPhrase
      : statusLine(snapshot, needsAnswer, offline);
  // Offline there are no live captions: show what LAFINA heard.
  const latestUserText = (() => {
    for (let i = snapshot.turns.length - 1; i >= 0; i -= 1)
      if (snapshot.turns[i].role === 'user') return snapshot.turns[i].text;
    return null;
  })();
  const showOverlayContent = Boolean(
    needsConsent ||
      hasActiveCard ||
      readResult !== null ||
      hasDetailsCard ||
      shownNote ||
      snapshot.notice ||
      failure ||
      snapshot.phase === 'restart_required' ||
      showTyping,
  );

  const closeSettings = useCallback(() => setSettingsModalVisible(false), []);
  const applyCallSettings = useCallback((newSettings: CallLafinaSettings) => {
    setCallSettings(newSettings);
    conversationRef.current?.setPreferences(newSettings);
  }, []);

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
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={styles.pillSpinner}
                />
                <Text
                  style={[styles.pillText, {color: colors.primary}]}
                  testID="call-connecting-badge"
                >
                  Connecting
                </Text>
              </>
            ) : reconnecting ? (
              <>
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={styles.pillSpinner}
                />
                <Text
                  style={[styles.pillText, {color: colors.primary}]}
                  testID="call-reconnecting-badge"
                >
                  Reconnecting
                </Text>
              </>
            ) : offline ? (
              <>
                <Cpu
                  size={12}
                  color={live ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.pillText,
                    {color: live ? colors.primary : colors.textSecondary},
                  ]}
                  testID="call-offline-badge"
                >
                  Offline
                </Text>
              </>
            ) : (
              <>
                <AudioLines
                  size={12}
                  color={live ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.pillText,
                    {color: live ? colors.primary : colors.textSecondary},
                  ]}
                  testID="call-online-badge"
                >
                  {live ? 'Online' : 'Not connected'}
                </Text>
              </>
            )}
          </View>
          {offline ? (
            <Text
              style={[styles.hint, themed.muted]}
              numberOfLines={1}
              accessibilityLabel={offlineReasonText(callMode.reason)}
              testID="call-offline-reason"
            >
              {offlineReasonText(callMode.reason)}
            </Text>
          ) : null}
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
            <View style={styles.avatarRingHost}>
              {pulsing && !showOverlayContent ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.connectingHalo,
                    {
                      borderColor: colors.primary,
                      opacity: connectingPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.42, 0.08],
                      }),
                      transform: [
                        {
                          scale: connectingPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.24],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.avatarRing,
                  showOverlayContent && styles.avatarRingCompact,
                  {
                    borderColor: live
                      ? snapshot.muted
                        ? colors.warning
                        : colors.primary
                      : connecting
                      ? colors.primary
                      : colors.border,
                  },
                ]}
                testID="call-identity-ring"
              >
                <MeteredSynthWaveAvatar
                  meter={conversation.meter}
                  phase={snapshot.phase}
                  muted={snapshot.muted}
                  size={showOverlayContent ? 48 : 76}
                  paused={paused}
                />
              </View>
            </View>
          ) : null}

          {live ? (
            <CallDurationText
              startedAt={callStartedAt ?? snapshot.connectedAt ?? null}
              paused={paused}
              style={[styles.timerText, themed.title]}
            />
          ) : null}

          <Text
            style={[
              styles.status,
              !statusText && styles.emptyStatus,
              {
                color: failure
                  ? colors.error
                  : live || connecting
                  ? colors.primary
                  : colors.textSecondary,
              },
            ]}
            accessibilityLiveRegion="polite"
            testID="voice-conversation-status"
          >
            {statusText}
          </Text>

          {offline && live && latestUserText ? (
            <Text
              style={[styles.connectingHint, themed.muted]}
              numberOfLines={2}
              testID="call-offline-heard"
            >
              {`You said: “${latestUserText}”`}
            </Text>
          ) : null}

          {connecting && !showOverlayContent ? (
            <Text
              style={[styles.connectingHint, themed.muted]}
              testID="call-connecting-hint"
            >
              Starting secure voice session
            </Text>
          ) : null}

          {live && !showOverlayContent ? (
            <MeteredCallWaveform
              meter={conversation.meter}
              paused={paused}
              phase={snapshot.phase}
              muted={snapshot.muted}
              micCapturing={snapshot.micCapturing}
              hasReviewItem={Boolean(review?.proposal)}
              showStatusText={false}
            />
          ) : null}
        </View>

        {/* Cards and notes scroll inside the fixed stage, so a tall card is
            never clipped (the stage itself does not scroll). */}
        <ScrollView
          style={styles.overlayScroll}
          contentContainerStyle={styles.overlayScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          nestedScrollEnabled
          testID="call-overlay-scroll"
        >
          {needsConsent ? (
            <View
              style={[
                styles.card,
                themed.card,
                styles.consentCard,
                modernCardStyle,
              ]}
              testID="voice-conversation-consent"
            >
              <View style={styles.consentHeader}>
                <View
                  style={[
                    styles.consentHeaderIcon,
                    {
                      backgroundColor: isModern
                        ? modernPalette.softViolet
                        : `${colors.primary}18`,
                    },
                  ]}
                >
                  <PhoneCall size={20} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.consentTitle, themed.text]}>
                    Before you start
                  </Text>
                  <Text style={[styles.consentSubtitle, themed.muted]}>
                    A quick look at how Call Lafina works
                  </Text>
                </View>
              </View>

              <View style={styles.consentList}>
                {[
                  {
                    key: 'voice',
                    icon: (
                      <Mic
                        size={16}
                        color={isModern ? modernPalette.accent : colors.primary}
                      />
                    ),
                    iconBg: isModern
                      ? modernPalette.softViolet
                      : `${colors.primary}16`,
                    title: 'Live voice replies',
                    body: 'Your voice is processed online while the call is open so LAFINA can hear you and reply.',
                  },
                  {
                    key: 'context',
                    icon: (
                      <Calendar
                        size={16}
                        color={isModern ? modernPalette.blueInk : colors.blue}
                      />
                    ),
                    iconBg: isModern
                      ? modernPalette.blueSoft
                      : `${colors.blue}16`,
                    title: 'Knows your upcoming plans',
                    body: 'LAFINA looks at your next 7 days, recent notes, saved memories and the last few messages of this chat, so its answers fit your schedule and it remembers what you were talking about. Reminder calls also share that reminder.',
                  },
                  {
                    key: 'control',
                    icon: (
                      <ShieldCheck
                        size={16}
                        color={
                          isModern ? modernPalette.mintInk : colors.success
                        }
                      />
                    ),
                    iconBg: isModern
                      ? modernPalette.mint
                      : `${colors.success}18`,
                    title: 'You stay in control',
                    body: 'Mute anytime, or tap End or leave the app to stop. Planner changes wait for your confirmation.',
                  },
                ].map(item => (
                  <View
                    key={item.key}
                    style={[
                      styles.consentItem,
                      {
                        backgroundColor: isModern
                          ? modernPalette.surface
                          : colors.cardBg,
                        borderColor: isModern
                          ? modernPalette.border
                          : colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.consentItemIcon,
                        {backgroundColor: item.iconBg},
                      ]}
                    >
                      {item.icon}
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.consentItemTitle, themed.text]}>
                        {item.title}
                      </Text>
                      <Text style={[styles.consentItemBody, themed.muted]}>
                        {item.body}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.consentFooter}>
                <MessageSquareText size={13} color={colors.textSecondary} />
                <Text style={[styles.consentFooterText, themed.muted]}>
                  Stays active when minimized in-app · Saves to Chat history
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  {backgroundColor: colors.primary},
                  isModern && {borderRadius: ModernLayout.borderRadiusButton},
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

          {skillChip && live && !ending ? (
            <View
              style={[
                styles.endingBanner,
                {
                  backgroundColor: isModern
                    ? modernPalette.softViolet
                    : colors.inputBg,
                  borderColor: isModern ? modernPalette.border : colors.border,
                },
              ]}
              testID="call-skill-chip"
            >
              <Text style={[styles.endingText, {color: colors.textPrimary}]}>
                {skillChip.line.replace(/^Got it[,.]\s*/, '')}
              </Text>
              <TouchableOpacity
                style={[styles.endingButton, {borderColor: colors.primary}]}
                onPress={openSkillChip}
                accessibilityRole="button"
                accessibilityLabel={`Open ${skillTitle(
                  skillChip.launch.skill,
                )}. This ends the call.`}
                testID="call-skill-chip-open"
              >
                <Text
                  style={[styles.endingButtonText, {color: colors.primary}]}
                >
                  {`Open ${skillTitle(skillChip.launch.skill)}`}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {ending && live ? (
            <View
              style={[
                styles.endingBanner,
                {
                  backgroundColor: isModern
                    ? modernPalette.softViolet
                    : colors.inputBg,
                  borderColor: isModern ? modernPalette.border : colors.border,
                },
              ]}
              accessibilityLiveRegion="polite"
              testID="call-ending-banner"
            >
              <Text
                style={[styles.endingText, {color: colors.textPrimary}]}
                accessibilityRole="text"
              >
                {ending.label}
              </Text>
              <TouchableOpacity
                style={[styles.endingButton, {borderColor: colors.primary}]}
                onPress={keepTalking}
                accessibilityRole="button"
                accessibilityLabel={
                  ending.skill
                    ? 'Stay on call. The skill does not open.'
                    : 'Keep talking. The call stays on.'
                }
                testID="call-ending-keep-talking"
              >
                <Text
                  style={[styles.endingButtonText, {color: colors.primary}]}
                >
                  {ending.skill ? 'Stay on call' : 'Keep talking'}
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
                expired={shownCard === 'review' ? review?.expired : false}
                busy={shownCard === 'batch' ? batchBusy : review?.busy}
                editError={shownCard === 'review' ? review?.editError : null}
                onEditMemoryText={text => {
                  memoryEditedTextRef.current = text;
                }}
                onEdit={patch => {
                  const prevId = reviewRef.current.proposal?.operationId;
                  const result = reviewRef.current.edit?.(patch);
                  if (result?.status === 'proposal') {
                    if (prevId && prevId !== result.proposal.operationId) {
                      recordReplacedCard(prevId, result.proposal.operationId);
                    }
                    syncCardContext(
                      'review',
                      result.proposal.operationId,
                      `Draft updated on screen: ${
                        result.proposal.title
                      }. ${result.proposal.details.join(' ')} Card ID: ${
                        result.proposal.operationId
                      }; revision: 1. Nothing was saved.`,
                      true,
                    );
                  }
                  return result;
                }}
                onConfirm={() => {
                  void confirmHandlersRef.current.confirmDraft('tap');
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
                      void conversationRef.current?.sendContext(
                        'The student tapped Cancel on the memory card. Nothing was saved and no memory card is open now.',
                      );
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
                onSaveMemory={editedText => {
                  void runSave(async () => handleSaveMemory(editedText, 'tap'));
                }}
                onUndoMemory={handleUndoMemory}
                onConfirmMultiAll={() => {
                  void confirmHandlersRef.current.confirmMultiAll('tap');
                }}
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
                        recordReplacedCard(
                          current.operationId,
                          revised.proposal.operationId,
                        );
                        presentReview(revised);
                        setDraftCorrection('');
                        syncCardContext(
                          'review',
                          revised.proposal.operationId,
                          `Draft updated on screen: ${
                            revised.proposal.title
                          }. ${revised.proposal.details.join(' ')} Card ID: ${
                            revised.proposal.operationId
                          }; revision: 1. Nothing was saved.`,
                          true,
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
          ) : savedExit ? (
            // The card just saved: "Saved" on its button, then it leaves.
            <View
              style={styles.actionCardSection}
              testID="call-action-card-stage"
            >
              <CardSaveExit
                key={savedExit.key}
                onDone={() =>
                  setSavedExit(current =>
                    current?.key === savedExit.key ? null : current,
                  )
                }
              >
                <ActionCardHost
                  proposal={
                    savedExit.kind === 'review' ? savedExit.proposal : null
                  }
                  memoryProposal={
                    savedExit.kind === 'memory' ? savedExit.memory : null
                  }
                  multiActionBatch={
                    savedExit.kind === 'batch' ? savedExit.batch : null
                  }
                  saved
                  testIDPrefix="voice-conversation-saved"
                />
              </CardSaveExit>
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
              <View
                style={[
                  styles.detailsHeader,
                  {
                    borderBottomColor: isModern
                      ? modernPalette.border
                      : colors.border,
                  },
                ]}
              >
                <View style={styles.detailsLabelRow}>
                  <AudioLines
                    size={13}
                    color={isModern ? modernPalette.accent : colors.primary}
                  />
                  <Text
                    style={[
                      styles.detailsLabel,
                      {
                        color: isModern ? modernPalette.accent : colors.primary,
                      },
                    ]}
                  >
                    {visibleAgentReply ? 'LAFINA' : 'Details'}
                  </Text>
                </View>
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
                <ChatReplyText
                  content={formattedAgentReply}
                  format={replyFormat}
                  textStyle={[
                    styles.detailsReplyText,
                    captionReplyStyle,
                    themed.text,
                  ]}
                  streaming={visibleAgentReply.status === 'provisional'}
                  testID="call-details-reply"
                />
              ) : null}
              {shownNote ? (
                <View
                  style={
                    visibleAgentReply
                      ? [
                          styles.detailsSubNote,
                          {
                            borderTopColor: isModern
                              ? modernPalette.border
                              : colors.border,
                          },
                        ]
                      : undefined
                  }
                >
                  <ChatReplyText
                    content={formattedLocalNote}
                    format={replyFormat}
                    textStyle={[styles.detailsNoteText, themed.text]}
                    testID="voice-conversation-local-note"
                  />
                </View>
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

              {shownNote ? (
                localNoteIsMultiLine ? (
                  <View
                    style={[
                      styles.card,
                      themed.card,
                      styles.detailsCard,
                      modernCardStyle,
                    ]}
                  >
                    <ChatReplyText
                      content={formattedLocalNote}
                      format={replyFormat}
                      textStyle={[styles.detailsNoteText, themed.text]}
                      testID="voice-conversation-local-note"
                    />
                  </View>
                ) : (
                  <ChatReplyText
                    content={formattedLocalNote}
                    format={replyFormat}
                    textStyle={[styles.notice, themed.text]}
                    testID="voice-conversation-local-note"
                  />
                )
              ) : null}
            </>
          )}

          {readResult !== null && (
            <CallReadResults
              result={readResult}
              ownerId={userId}
              onDismiss={() => setReadResult(null)}
              onNavigate={onNavigate}
              onSeePassages={passageIds =>
                setUstpSourcesTarget({kind: 'used', passageIds})
              }
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
                  {failure
                    ? hideVendorNames(failure.message)
                    : snapshot.restartReason}
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
                <>
                  {canContinue ? (
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        {backgroundColor: colors.primary},
                      ]}
                      onPress={handleContinue}
                      accessibilityRole="button"
                      accessibilityHint="Continues this call. LAFINA remembers what you were talking about."
                      testID="voice-conversation-continue"
                    >
                      <PhoneCall size={14} color={colors.textOnPrimary} />
                      <Text
                        style={[
                          styles.primaryText,
                          {color: colors.textOnPrimary},
                        ]}
                      >
                        Continue call
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.secondaryButton, themed.secondary]}
                    onPress={handleStart}
                    accessibilityRole="button"
                    testID="voice-conversation-restart"
                  >
                    <RotateCcw size={14} color={colors.textPrimary} />
                    <Text style={[styles.secondaryText, themed.text]}>
                      {failure
                        ? 'Try again'
                        : canContinue
                        ? 'New call'
                        : 'Start again'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              {!offline &&
              failure?.kind !== 'mic_denied' &&
              failure?.kind !== 'mic_busy' ? (
                <TouchableOpacity
                  style={[styles.secondaryButton, themed.secondary]}
                  onPress={handleCallOffline}
                  accessibilityRole="button"
                  accessibilityHint="Continues the call with the voice and speech recognition on this phone"
                  testID="voice-conversation-call-offline"
                >
                  <Cpu size={14} color={colors.textPrimary} />
                  <Text style={[styles.secondaryText, themed.text]}>
                    Call offline instead
                  </Text>
                </TouchableOpacity>
              ) : null}
              {enableError ? (
                <Text
                  style={[styles.notice, {color: colors.error}]}
                  testID="voice-conversation-enable-error"
                >
                  {enableError}
                </Text>
              ) : null}
              <Text style={[styles.hint, themed.muted]}>
                {offline
                  ? 'Typing in Chat and your schedule keep working.'
                  : 'Push-to-talk, typing and your schedule keep working offline.'}
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
              sendContextPreservingCard(`Planner update: ${outcome.reply}`);
            }}
            testID="voice-undo"
          />
        ) : null}

        {live && showTyping ? (
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
        onClose={closeSettings}
        onSettingsChanged={applyCallSettings}
      />
      <UstpSourcesSheet
        target={ustpSourcesTarget}
        onClose={() => setUstpSourcesTarget(null)}
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
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillSpinner: {transform: [{scale: 0.72}], marginRight: -2},
  pillText: {fontFamily: Fonts.body, fontSize: 11, fontWeight: 'bold'},
  centerStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    width: '100%',
  },
  avatarRingHost: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  connectingHalo: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 2,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  connectingHint: {
    fontFamily: Fonts.body,
    fontSize: 13,
    textAlign: 'center',
  },
  emptyStatus: {height: 0, margin: 0, padding: 0},
  detailsCard: {maxWidth: 420, padding: 16},
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
    marginBottom: 2,
  },
  detailsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  detailsReplyLarge: {
    fontSize: 18,
    lineHeight: 26,
  },
  detailsReplyExtraLarge: {
    fontSize: 22,
    lineHeight: 30,
  },
  detailsNoteText: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
  },
  detailsSubNote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 2,
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
  cardBody: {fontFamily: Fonts.body, fontSize: 13, lineHeight: 19},
  consentCard: {maxWidth: 420, padding: 18, gap: 14},
  consentHeader: {flexDirection: 'row', alignItems: 'center', gap: 12},
  consentHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentTitle: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  consentSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  consentList: {gap: 10},
  consentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  consentItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  consentItemTitle: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  consentItemBody: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
  consentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  consentFooterText: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    flexShrink: 1,
  },
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
  endingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    marginBottom: 8,
  },
  endingText: {fontFamily: Fonts.body, fontSize: 14, flexShrink: 1},
  endingButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endingButtonText: {fontFamily: Fonts.body, fontSize: 14, fontWeight: '700'},
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
