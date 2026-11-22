import {ScreenOverlays} from '../navigation/RetainedTab';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Keyboard,
  Platform,
  Dimensions,
  BackHandler,
  DeviceEventEmitter,
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {
  Menu,
  ChevronDown,
  Clock,
  BookOpen,
  CheckSquare,
  CalendarDays,
  Award,
  Scale,
  ShieldCheck,
  GraduationCap,
  Camera,
  Image as ImageIcon,
  MessageCircleDashed,
} from 'lucide-react-native';
import {Fonts, FontSize, Layout, ModernLayout, Spacing} from '../theme';
import {useTheme} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {ThemeColors} from '../contexts/ThemeContext';
import {
  chatStore,
  isChatLimitReachedError,
  isRemoteOnlyAttachment,
  isUstpSessionId,
  type ChatAttachment,
  type ChatMessage,
} from '../../storage/chatStore';
import {userStore} from '../../storage/userStore';
import {db} from '../../storage/database';
import {chatSyncStore} from '../../storage/chatSyncStore';
import {chatHistorySync} from '../../sync/chatHistorySync';
import {
  CHAT_REMOTE_CHANGED_EVENT,
  type ChatRemoteChangedEvent,
} from '../../sync/chatSyncEvents';
import {mergeChatPages} from './chat/chatPaging';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {accountLinkService} from '../../cloud';
import {visionService} from '../../ai/vision/visionService';
import {readInitialOnlineMode} from '../../cloud/providerTestDefaults';
import {ONLINE_MODE_CHANGED_EVENT} from '../../cloud/voiceConversation';
import {
  CHAT_MEMORY_CHANGED_EVENT,
  chatMemoryService,
} from '../../cloud/chatMemoryService';
import type {ChatMemoryChangedEvent} from '../../cloud/chatMemoryService';
import {
  CHAT_OFFLINE_SLM_TIMEOUT_MS,
  chatOrchestrator,
  rebindReviewTurn,
} from '../../ai/chatOrchestrator';
import {
  chatTimingStore,
  compactTimingLabel,
  createRequestTrace,
  isPerfTrackingEnabled,
  monotonicNow,
  subscribePerfTracking,
  type RequestTrace,
} from '../../ai/benchmark';
import {localHandbookService, type LocalHandbookStatus} from '../../handbook';
import {
  OFFLINE_MODEL_CATALOG,
  getAllModelsStatus,
  getOfflineModelPreset,
  getSelectedOfflineModelId,
} from '../../ai/nlu/modelManager';
import {getDeviceAiRecommendation} from '../../ai/nlu/deviceSpecs';
import type {
  DeviceAiRecommendation,
  ModelStatus,
  OfflineModelId,
} from '../../ai/nlu/types';
import {ChatMessageItem} from '../components/chat/ChatMessageItem';
import {ChatHistorySheet} from '../components/chat/ChatHistorySheet';
import {
  getConfirmedAcademicProfile,
  getUstpEligibility,
  ustpUnavailableMessage,
} from '../../storage/ustpEligibility';
import type {UstpEligibility} from '../../storage/ustpEligibility';
import {studentSetupStore} from '../../storage/studentSetupStore';
import {effectiveGoal} from '../../ai/personalization';
import {ChatEngineSheet} from '../components/chat/ChatEngineSheet';
import {
  ChatInput,
  SUGGESTED_PROMPTS,
  USTP_SUGGESTED_PROMPTS,
} from '../components/chat/ChatInput';
import {TypingBubble} from '../components/chat/TypingBubble';
import {CommandReviewCard} from '../components/chat/CommandReviewCard';
import {UndoSnackbar} from '../components/chat/UndoSnackbar';
import {skillTitle} from '../../skills/skillLaunch';
import type {SkillLaunch} from '../../skills/skillLaunch';
import {CommandGuide} from '../components/chat/CommandGuide';
import {EndTemporaryChatModal} from '../components/chat/EndTemporaryChatModal';
import {useCommandReview} from '../hooks/useCommandReview';
import {
  cancelReviewedCommand,
  formatResolvedReviewContent,
  type ReviewEditPatch,
  type UndoOffer,
} from '../../ai/nlu/commandReview';
import {warmUpOfflineModel} from '../../ai/nlu/intentService';
import {useDraftProtection} from '../hooks/useDraftProtection';
import {useChatReplyFormat} from '../hooks/useChatReplyFormat';
import {DraftDecisionDialog} from '../components/DraftDecisionDialog';
import {chatDraftStore} from '../drafts/chatDraftStore';
import {shareAttachment} from '../components/chat/chatFiles';
import {ToolSheet} from '../components/tools';
import {MultiActionCard} from '../components/callLafina/cards/MultiActionCard';
import {actionService} from '../../ai/voiceActions/actionService';
import {reviseMultiItem} from '../../ai/voiceActions/multiActionService';
import {tourTargetRef} from '../tour/tourTargets';
import type {
  MultiActionBatchData,
  MultiActionItemData,
} from '../../ai/voiceActions/types';

/** How often a reply that is still arriving repaints (about 20 times a second). */
const STREAM_REPAINT_MS = 50;
/** Developer timing waits this long for the reply to be drawn before recording it. */
const TIMING_RENDER_WAIT_MS = 5_000;

/** Focusing the input loads the offline model at most this often. */
const SLM_FOCUS_WARMUP_INTERVAL_MS = 45_000;

const LAFINA_MASCOT = require('../../assets/new_lafina_app_logo/lafina_app_logo.png');

type SampleCardIconKey =
  | 'clock'
  | 'book'
  | 'tasks'
  | 'upcoming'
  | 'award'
  | 'scale'
  | 'shield'
  | 'grad';

interface SampleChatCardConfig {
  label: string;
  prompt: string;
  iconKey: SampleCardIconKey;
}

const GENERAL_SAMPLE_CARDS: readonly SampleChatCardConfig[] = [
  {
    label: "Today's Schedule",
    prompt: SUGGESTED_PROMPTS[0],
    iconKey: 'clock',
  },
  {
    label: 'Free Study Time',
    prompt: SUGGESTED_PROMPTS[1],
    iconKey: 'book',
  },
  {
    label: 'Pending Tasks',
    prompt: SUGGESTED_PROMPTS[2],
    iconKey: 'tasks',
  },
  {
    label: 'Upcoming Schedule',
    prompt: SUGGESTED_PROMPTS[3],
    iconKey: 'upcoming',
  },
];

const USTP_SAMPLE_CARDS: readonly SampleChatCardConfig[] = [
  {
    label: "Dean's List GPA",
    prompt: USTP_SUGGESTED_PROMPTS[0],
    iconKey: 'award',
  },
  {
    label: 'Grading & GPA',
    prompt: USTP_SUGGESTED_PROMPTS[1],
    iconKey: 'scale',
  },
  {
    label: 'Retention Policy',
    prompt: USTP_SUGGESTED_PROMPTS[2],
    iconKey: 'shield',
  },
  {
    label: 'Absences Rules',
    prompt: USTP_SUGGESTED_PROMPTS[3],
    iconKey: 'grad',
  },
];

function buildInitialModelStatuses(
  selectedModelId: OfflineModelId,
): ModelStatus[] {
  return OFFLINE_MODEL_CATALOG.map(preset => ({
    isDownloaded: preset.id === 'fast_path_only',
    filePath: '',
    fileSizeBytes: 0,
    modelName: preset.name,
    modelId: preset.id,
    shortLabel: preset.shortLabel,
    approximateSizeBytes: preset.approximateSizeBytes,
    recommendedRamGb: preset.recommendedRamGb,
    description: preset.description,
    isSelected: preset.id === selectedModelId,
  }));
}

function areModelStatusesEqual(
  prev: ModelStatus[],
  next: ModelStatus[],
): boolean {
  if (prev.length !== next.length) {
    return false;
  }
  return prev.every((item, index) => {
    const other = next[index];
    return (
      item.modelId === other.modelId &&
      item.isDownloaded === other.isDownloaded &&
      item.isSelected === other.isSelected &&
      item.fileSizeBytes === other.fileSizeBytes
    );
  });
}

/** The chosen main goal puts its most relevant starter first. */
function orderCardsByGoal(
  cards: readonly SampleChatCardConfig[],
  goal: ReturnType<typeof effectiveGoal>,
): readonly SampleChatCardConfig[] {
  const firstKey =
    goal === 'deadlines' ? 'tasks' : goal === 'schedule' ? 'clock' : null;
  if (!firstKey) return cards;
  return [
    ...cards.filter(card => card.iconKey === firstKey),
    ...cards.filter(card => card.iconKey !== firstKey),
  ];
}

function resolveStudentGreetingName(userId: string): string {
  // The name the student chose comes first; a COR legal name never replaces it.
  const chosen = studentSetupStore.get(userId).preferredName.trim();
  if (chosen) {
    return chosen;
  }
  const academic = getConfirmedAcademicProfile(userId);
  const preferred = academic?.preferredName?.trim();
  if (preferred) {
    return preferred;
  }
  const formatted = academic?.formattedName?.trim();
  if (formatted) {
    const firstWord = formatted.split(/\s+/)[0]?.trim();
    if (firstWord) {
      return firstWord;
    }
  }
  const user = userStore.getUserById(userId);
  const username = user?.username?.trim();
  if (username && username.toLowerCase() !== 'guest') {
    return username;
  }
  return 'Student';
}

function renderSampleCardIcon(iconKey: SampleCardIconKey, color: string) {
  switch (iconKey) {
    case 'clock':
      return <Clock size={18} color={color} />;
    case 'book':
      return <BookOpen size={18} color={color} />;
    case 'tasks':
      return <CheckSquare size={18} color={color} />;
    case 'upcoming':
      return <CalendarDays size={18} color={color} />;
    case 'award':
      return <Award size={18} color={color} />;
    case 'scale':
      return <Scale size={18} color={color} />;
    case 'shield':
      return <ShieldCheck size={18} color={color} />;
    case 'grad':
      return <GraduationCap size={18} color={color} />;
  }
}

const CHAT_HISTORY_TABLES = ['messages', 'chat_sessions'] as const;

function areUstpEligibilitiesEqual(
  prev: UstpEligibility,
  next: UstpEligibility,
): boolean {
  return prev.eligible === next.eligible && prev.reason === next.reason;
}

function areLocalHandbookStatusesEqual(
  prev: LocalHandbookStatus,
  next: LocalHandbookStatus,
): boolean {
  return (
    prev.ready === next.ready &&
    prev.populated === next.populated &&
    prev.chunkCount === next.chunkCount &&
    prev.title === next.title &&
    prev.edition === next.edition &&
    prev.sourceLabel === next.sourceLabel &&
    prev.sha256 === next.sha256 &&
    prev.origin === next.origin
  );
}

interface ChatComposerProps {
  userId: string;
  isSending: boolean;
  isOnlineMode: boolean;
  isUstpChat: boolean;
  schoolEnabled: boolean;
  onSendText: (overrideText?: string, sendOptions?: {preserveDraft?: boolean}) => void;
  onCallLafina?: () => void;
  onOpenFormatPicker?: () => void;
  onInputFocus: () => void;
}

const ChatComposer = React.memo(function ChatComposerView({
  userId,
  isSending,
  isOnlineMode,
  isUstpChat,
  schoolEnabled,
  onSendText,
  onCallLafina,
  onOpenFormatPicker,
  onInputFocus,
}: ChatComposerProps) {
  const [inputText, setInputTextState] = useState(() =>
    chatDraftStore.get(userId),
  );
  useEffect(() => {
    setInputTextState(chatDraftStore.get(userId));
    return chatDraftStore.subscribe((owner, text) => {
      if (owner === userId) setInputTextState(text);
    });
  }, [userId]);

  const setInputText = useCallback(
    (text: string) => {
      chatDraftStore.set(userId, text);
      setInputTextState(text);
    },
    [userId],
  );

  const handleSendInput = useCallback(
    (overrideText?: string) => onSendText(overrideText),
    [onSendText],
  );
  const handleSelectPrompt = useCallback(
    (prompt: string) => onSendText(prompt, {preserveDraft: true}),
    [onSendText],
  );

  return (
    <ChatInput
      inputText={inputText}
      setInputText={setInputText}
      onSend={handleSendInput}
      isSending={isSending}
      isOnlineMode={isOnlineMode}
      onCallLafina={onCallLafina}
      onOpenFormatPicker={onOpenFormatPicker}
      onSelectPrompt={handleSelectPrompt}
      showSuggestions={false}
      placeholderOverride={
        isUstpChat && schoolEnabled
          ? 'Ask anything about the USTP Handbook…'
          : undefined
      }
      onFocus={onInputFocus}
    />
  );
});

export interface ChatScreenProps {
  userId: string;
  refreshTrigger?: number;
  onRefresh?: () => void;
  onCallLafina?: () => void;
  /** Opens a skill the student asked for in Chat (ADR-041), on their tap. */
  onOpenSkill?: (launch: SkillLaunch) => void;
}

export const ChatScreen = React.memo(function ChatScreenView({
  userId,
  refreshTrigger = 0,
  onRefresh,
  onCallLafina,
  onOpenSkill,
}: ChatScreenProps) {
  const [initialPage] = useState(() => {
    try {
      const rev = db.getDataRevision(CHAT_HISTORY_TABLES);
      const page = chatStore.getMessagesPage(userId);
      return {page, rev};
    } catch {
      return null;
    }
  });
  const loadedMessagesRevRef = useRef<number>(initialPage?.rev ?? 0);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialPage?.page.items ?? [],
  );
  const [olderCursor, setOlderCursor] = useState<string | null>(
    initialPage?.page.nextCursor ?? null,
  );
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const readCurrentChat = useCallback((): string => {
    try {
      return chatStore.currentSessionId(userId);
    } catch {
      return '';
    }
  }, [userId]);
  const [currentChatId, setCurrentChatId] = useState(readCurrentChat);
  const shownChatIdRef = useRef(currentChatId);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(
    initialPage
      ? null
      : 'Your conversation could not be loaded right now. Nothing was deleted.',
  );
  const [legacyHiddenCount, setLegacyHiddenCount] = useState(() => {
    try {
      return chatStore.getLegacyQuarantineSummary().messageCount;
    } catch {
      return 0;
    }
  });
  const [legacyNoticeDismissed, setLegacyNoticeDismissed] = useState(
    () =>
      localSettingsStore.get(userId, 'chat.legacyNoticeDismissed', null) ===
      'true',
  );
  const [isTemporaryChat, setIsTemporaryChat] = useState(false);
  const isTemporaryChatRef = useRef(false);
  isTemporaryChatRef.current = isTemporaryChat;
  // One-time notice that a signed-in account's chats sync (ADR-040).
  const [chatSyncNoticeVisible, setChatSyncNoticeVisible] = useState(() =>
    chatSyncStore.needsNotice(userId),
  );
  const [tempMessages, setTempMessages] = useState<ChatMessage[]>([]);
  const [endTempConfirmVisible, setEndTempConfirmVisible] = useState(false);
  const [chatTitle, setChatTitle] = useState('New chat');

  const refreshChatTitle = useCallback(() => {
    if (isTemporaryChat) {
      setChatTitle('Temporary Chat');
      return;
    }
    try {
      const title = chatStore.getSessionTitle(userId, currentChatId);
      setChatTitle(title);
    } catch {
      setChatTitle('New chat');
    }
  }, [currentChatId, isTemporaryChat, userId]);

  useEffect(() => {
    refreshChatTitle();
  }, [refreshChatTitle]);
  // Async results are applied only while the same account is still shown.
  const activeUserRef = useRef(userId);
  const replyFormat = useChatReplyFormat(userId);
  activeUserRef.current = userId;
  const suppressAutoScrollRef = useRef(false);
  const hasInitialMessages = (initialPage?.page.items.length ?? 0) > 0;
  const needsInitialScrollRef = useRef(hasInitialMessages);
  const initialSettleUntilRef = useRef(
    hasInitialMessages ? Date.now() + 300 : 0,
  );
  const layoutReadyRef = useRef(false);
  const contentReadyRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const isSendingRef = useRef(false);
  const messagesLengthRef = useRef(messages.length);
  messagesLengthRef.current = messages.length;
  const listOpacity = useRef(new Animated.Value(1)).current;
  const revealRafRef = useRef<number | null>(null);
  const fallbackRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // The text a waiting review came from; Cancel puts it back in an empty composer.
  const reviewSourceRef = useRef<{
    operationId: string;
    text: string;
    messageId?: string;
    isTemporary?: boolean;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  // "Marked done · Undo" after an immediate action (audit finding 10).
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null);
  /** ADR-041: the skill the last reply offers to open. */
  const [skillOffer, setSkillOffer] = useState<SkillLaunch | null>(null);
  const hideUndo = useCallback(() => setUndoOffer(null), []);
  const [chatMultiBatch, setChatMultiBatch] =
    useState<MultiActionBatchData | null>(null);
  const [chatMultiBusy, setChatMultiBusy] = useState(false);
  isSendingRef.current = isSending;
  // DeepSeek's reply while it is still being written (Online Mode only).
  const [streamingReply, setStreamingReply] = useState<{
    text: string;
    startedAt: string;
  } | null>(null);
  const streamFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Developer timing (Developer Mode + performance tracking only).
  const [perfOn, setPerfOn] = useState(isPerfTrackingEnabled);
  const [timingLabels, setTimingLabels] = useState<Record<string, string>>({});
  const pendingTraceRef = useRef<{
    trace: RequestTrace;
    assistantId: string | null;
    tempMode: boolean;
  } | null>(null);
  /** The request whose streamed text is on screen now. */
  const liveTraceRef = useRef<RequestTrace | null>(null);
  useEffect(() => subscribePerfTracking(setPerfOn), []);
  useEffect(() => {
    if (!perfOn) {
      setTimingLabels({});
      return undefined;
    }
    const update = () => {
      const next: Record<string, string> = {};
      for (const entry of chatTimingStore.list()) {
        if (entry.messageId && !next[entry.messageId]) {
          next[entry.messageId] = compactTimingLabel(entry.snapshot);
        }
      }
      setTimingLabels(next);
    };
    update();
    return chatTimingStore.subscribe(update);
  }, [perfOn]);
  // First streamed text: marked on the first frame after it was committed.
  useEffect(() => {
    const live = liveTraceRef.current;
    if (!live || !streamingReply?.text) return;
    requestAnimationFrame(() => live.mark('firstContentRendered'));
  }, [streamingReply]);
  // The saved reply: marked on the first frame after it is in the list.
  useEffect(() => {
    const pending = pendingTraceRef.current;
    if (!pending) return;
    const list = pending.tempMode ? tempMessages : messages;
    if (!list.some(msg => msg.id === pending.assistantId)) return;
    pendingTraceRef.current = null;
    requestAnimationFrame(() => {
      pending.trace.mark('firstContentRendered');
      pending.trace.mark('finalRendered');
      pending.trace.finalize();
    });
  }, [messages, tempMessages]);
  const [isOnlineMode, setIsOnlineMode] = useState(() =>
    readInitialOnlineMode(userId),
  );
  const isOnlineModeRef = useRef(isOnlineMode);
  isOnlineModeRef.current = isOnlineMode;
  const onlineAuthVerifiedUserRef = useRef<string | null>(null);
  const lastNetConnectivityRef = useRef<boolean | null>(null);
  const isUstpChat = !isTemporaryChat && isUstpSessionId(currentChatId);
  // One eligibility decision for every USTP entry point on this screen.
  const [schoolEligibility, setSchoolEligibility] = useState<UstpEligibility>(
    () => getUstpEligibility(userId),
  );
  const schoolEnabled = schoolEligibility.eligible;
  const ustpChatBlocked = isUstpChat && !schoolEnabled;
  const updateSchoolEligibility = useCallback((next: UstpEligibility) => {
    setSchoolEligibility(prev =>
      areUstpEligibilitiesEqual(prev, next) ? prev : next,
    );
  }, []);
  useEffect(() => {
    let cancelled = false;
    const requestUser = userId;
    updateSchoolEligibility(getUstpEligibility(requestUser));
    const unsubscribe = studentSetupStore.subscribe(changedUserId => {
      if (
        !cancelled &&
        changedUserId === requestUser &&
        activeUserRef.current === requestUser
      ) {
        updateSchoolEligibility(getUstpEligibility(requestUser));
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId, refreshTrigger, updateSchoolEligibility]);
  const [handbookNotes, setHandbookNotes] = useState<Record<string, string>>(
    {},
  );
  const [formatPickerOpen, setFormatPickerOpen] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [engineSheetVisible, setEngineSheetVisible] = useState(false);
  const [selectedOfflineModelId, setSelectedOfflineModelIdState] =
    useState<OfflineModelId>(() => getSelectedOfflineModelId(userId));
  const [modelsStatus, setModelsStatus] = useState<ModelStatus[]>(() =>
    buildInitialModelStatuses(getSelectedOfflineModelId(userId)),
  );
  const [deviceRecommendation, setDeviceRecommendation] =
    useState<DeviceAiRecommendation | null>(null);
  const [localHandbookStatus, setLocalHandbookStatus] =
    useState<LocalHandbookStatus>(() => localHandbookService.getStatus());
  const modelsStatusRef = useRef<ModelStatus[]>(modelsStatus);
  modelsStatusRef.current = modelsStatus;
  const [studentName, setStudentName] = useState(() =>
    resolveStudentGreetingName(userId),
  );
  const studentNameRef = useRef(studentName);
  studentNameRef.current = studentName;
  const selectedModelRef = useRef(selectedOfflineModelId);
  selectedModelRef.current = selectedOfflineModelId;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const [currentHeight, setCurrentHeight] = useState(() =>
    Math.max(0, Dimensions.get('window').height - (insets.top + 6)),
  );
  const maxHeightRef = useRef<number>(currentHeight);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const {
    colors,
    isDarkMode,
    isModern,
    modernPalette,
    modernTheme,
    modernThemeExtras,
    modernShadows,
  } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const modelCheckedAt = useRef(0);
  const refreshModelAndProfileState = useCallback(
    async (force = false, isCancelled?: () => boolean) => {
      const requestUser = userId;
      const nextName = resolveStudentGreetingName(requestUser);
      const nextSelected = getSelectedOfflineModelId(requestUser);
      if (studentNameRef.current !== nextName) {
        studentNameRef.current = nextName;
        setStudentName(nextName);
      }
      if (selectedModelRef.current !== nextSelected) {
        selectedModelRef.current = nextSelected;
        setSelectedOfflineModelIdState(nextSelected);
      }
      if (!force && Date.now() - modelCheckedAt.current < 30_000) return;
      try {
        const statuses = await getAllModelsStatus(requestUser);
        modelCheckedAt.current = Date.now();
        if (isCancelled?.() || activeUserRef.current !== requestUser) {
          return;
        }
        if (!areModelStatusesEqual(modelsStatusRef.current, statuses)) {
          modelsStatusRef.current = statuses;
          setModelsStatus(statuses);
        }
      } catch {
        // Preserve last known model download statuses if storage inspection fails
      }
    },
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    void refreshModelAndProfileState(engineSheetVisible, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [refreshModelAndProfileState, refreshTrigger, engineSheetVisible]);

  useEffect(() => {
    let cancelled = false;
    const requestUser = userId;
    void localHandbookService
      .ensureReady()
      .then(status => {
        if (!cancelled && activeUserRef.current === requestUser) {
          setLocalHandbookStatus(prev =>
            areLocalHandbookStatusesEqual(prev, status) ? prev : status,
          );
        }
      })
      .catch(() => {
        // Keep last known local handbook status
      });
    return () => {
      cancelled = true;
    };
  }, [isUstpChat, refreshTrigger, userId]);

  useEffect(() => {
    if (!engineSheetVisible) {
      return;
    }
    let cancelled = false;
    void getDeviceAiRecommendation(modelsStatus)
      .then(rec => {
        if (!cancelled) {
          setDeviceRecommendation(rec);
        }
      })
      .catch(() => {
        // Keep last recommendation if device telemetry read fails
      });
    return () => {
      cancelled = true;
    };
  }, [engineSheetVisible, modelsStatus]);

  const centerPillInfo = useMemo(() => {
    if (isOnlineMode) {
      return {
        label: 'Online',
        isReady: true,
      };
    }
    const preset = getOfflineModelPreset(selectedOfflineModelId);
    if (selectedOfflineModelId === 'fast_path_only') {
      return {
        label: preset.shortLabel,
        isReady: true,
      };
    }
    const status = modelsStatus.find(
      item => item.modelId === selectedOfflineModelId,
    );
    if (status?.isDownloaded) {
      return {
        label: preset.shortLabel,
        isReady: true,
      };
    }
    return {
      label: `${preset.shortLabel} · Setup`,
      isReady: false,
    };
  }, [isOnlineMode, modelsStatus, selectedOfflineModelId]);
  // AGY-PORT 04: planner changes wait on this card until Confirm.
  const review = useCommandReview(userId, 'chat');
  // A card belongs to the chat that offered it: opening or starting another
  // chat cancels it silently, so a later "ok" there cannot save it (audit M1).
  const cancelOpenReviewRef = useRef(review.cancel);
  cancelOpenReviewRef.current = review.cancel;

  // AGY-PORT 05: Android back with unsent text asks first (default keeps it).
  const readDraft = useCallback(() => chatDraftStore.get(userId), [userId]);
  const clearDraft = useCallback(() => chatDraftStore.set(userId, ''), [userId]);
  const replaceDraft = useCallback(
    (next: string) => chatDraftStore.set(userId, next),
    [userId],
  );
  const draft = useDraftProtection(
    userId,
    readDraft,
    false,
    clearDraft,
    replaceDraft,
  );
  const {requestLeave, hasDraft} = draft;

  const prevDraftUserRef = useRef(userId);
  useEffect(() => {
    if (prevDraftUserRef.current === userId) return;
    prevDraftUserRef.current = userId;
    reviewSourceRef.current = null;
    setUndoOffer(null);
  }, [userId]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!hasDraft()) return false;
        requestLeave(() => BackHandler.exitApp(), {
          title: 'Leave with an unsent draft?',
          message:
            'Your unsent Chat text will be discarded. Saved items and any change waiting for Confirm are kept.',
          confirmLabel: 'Discard and leave',
        });
        return true;
      },
    );
    return () => subscription.remove();
  }, [hasDraft, requestLeave]);

  // Floating bottom CustomTabBar clearance when keyboard is closed
  const tabBarBottomOffset = Math.max(insets.bottom, 12) + 14;
  const tabBarClearance = isModern
    ? ModernLayout.navbarContentHeight + Math.max(insets.bottom, 8) + 40
    : tabBarBottomOffset + Layout.navbarHeight + 8;

  // Bottom clearance when soft keyboard is open:
  // On modern Android edge-to-edge / targetSdkVersion 35+, adjustResize may not shrink the root view.
  // We check if the container window was already shrunken by Android's window manager:
  const windowShrunk =
    maxHeightRef.current > 0 && currentHeight > 0
      ? Math.max(0, maxHeightRef.current - currentHeight)
      : 0;

  // If the window has already shrunk to accommodate the keyboard, only small padding is needed.
  // If the window did not shrink (edge-to-edge overlay), lift by full keyboard height + navigation insets.
  const unhandledKeyboardHeight =
    windowShrunk > 100
      ? Math.max(0, (keyboardHeight || 300) - windowShrunk)
      : keyboardHeight > 0
      ? keyboardHeight + Math.max(insets.bottom, 24)
      : 320;

  const keyboardClearance = unhandledKeyboardHeight + 12;

  const bottomClearance = isKeyboardVisible
    ? keyboardClearance
    : tabBarClearance;

  const clearInitialRevealHandles = useCallback(() => {
    if (revealRafRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(revealRafRef.current);
      }
      revealRafRef.current = null;
    }
    if (fallbackRevealTimerRef.current !== null) {
      clearTimeout(fallbackRevealTimerRef.current);
      fallbackRevealTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearInitialRevealHandles, [clearInitialRevealHandles]);

  const scheduleFallbackReveal = useCallback(() => {
    if (fallbackRevealTimerRef.current !== null) {
      clearTimeout(fallbackRevealTimerRef.current);
    }
    fallbackRevealTimerRef.current = setTimeout(() => {
      fallbackRevealTimerRef.current = null;
      needsInitialScrollRef.current = false;
      flatListRef.current?.scrollToOffset({offset: 0, animated: false});
      listOpacity.setValue(1);
    }, 200);
  }, [listOpacity]);

  useEffect(() => {
    if (hasInitialMessages && needsInitialScrollRef.current) {
      scheduleFallbackReveal();
    }
  }, [hasInitialMessages, scheduleFallbackReveal]);

  const beginInitialScroll = useCallback(
    (hasMessages: boolean) => {
      clearInitialRevealHandles();
      contentReadyRef.current = false;
      isNearBottomRef.current = true;
      if (!hasMessages) {
        needsInitialScrollRef.current = false;
        initialSettleUntilRef.current = 0;
        listOpacity.setValue(1);
        return;
      }
      needsInitialScrollRef.current = true;
      initialSettleUntilRef.current = Date.now() + 300;
      listOpacity.setValue(1);
      scheduleFallbackReveal();
    },
    [clearInitialRevealHandles, listOpacity, scheduleFallbackReveal],
  );

  const finishInitialScroll = useCallback(() => {
    if (!needsInitialScrollRef.current) {
      listOpacity.setValue(1);
      return;
    }
    needsInitialScrollRef.current = false;
    isNearBottomRef.current = true;
    clearInitialRevealHandles();
    flatListRef.current?.scrollToOffset({offset: 0, animated: false});
    const commitReveal = () => {
      revealRafRef.current = null;
      flatListRef.current?.scrollToOffset({offset: 0, animated: false});
      listOpacity.setValue(1);
    };
    if (typeof requestAnimationFrame === 'function') {
      revealRafRef.current = requestAnimationFrame(commitReveal);
    } else {
      commitReveal();
    }
  }, [clearInitialRevealHandles, listOpacity]);

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const {contentOffset} = event.nativeEvent;
      const distanceFromBottom = contentOffset.y;
      isNearBottomRef.current = distanceFromBottom <= 80;
    },
    [],
  );

  const handleListContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (height > 0) {
        contentReadyRef.current = true;
      }
      // Prepending an earlier page keeps the reader where they were.
      if (suppressAutoScrollRef.current) {
        suppressAutoScrollRef.current = false;
        return;
      }
      if (needsInitialScrollRef.current) {
        if (height > 0) {
          flatListRef.current?.scrollToOffset({offset: 0, animated: false});
          if (layoutReadyRef.current) {
            finishInitialScroll();
          }
        }
        return;
      }
      if (Date.now() < initialSettleUntilRef.current) {
        flatListRef.current?.scrollToOffset({offset: 0, animated: false});
        return;
      }
      if (isNearBottomRef.current) {
        flatListRef.current?.scrollToOffset({offset: 0, animated: true});
      }
    },
    [finishInitialScroll],
  );

  const handleListLayout = useCallback(
    (event: {nativeEvent: {layout: {height: number}}}) => {
      if (event.nativeEvent.layout.height <= 0) return;
      layoutReadyRef.current = true;
      if (needsInitialScrollRef.current) {
        flatListRef.current?.scrollToOffset({offset: 0, animated: false});
        if (contentReadyRef.current) {
          finishInitialScroll();
        }
        return;
      }
      if (isNearBottomRef.current) {
        flatListRef.current?.scrollToOffset({offset: 0, animated: false});
      }
    },
    [finishInitialScroll],
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => {
      setIsKeyboardVisible(true);
      const kh = e.endCoordinates?.height ?? 0;
      setKeyboardHeight(kh);
      needsInitialScrollRef.current = false;
      initialSettleUntilRef.current = 0;
      isNearBottomRef.current = true;
      setTimeout(
        () => flatListRef.current?.scrollToOffset({offset: 0, animated: true}),
        100,
      );
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  /** Reloads the newest page, keeping earlier pages the student already opened. */
  const loadMessages = useCallback(
    (options?: {replace?: boolean}): number | null => {
      try {
        const rev = db.getDataRevision(CHAT_HISTORY_TABLES);
        const page = chatStore.getMessagesPage(userId);
        loadedMessagesRevRef.current = rev;
        if (options?.replace) {
          beginInitialScroll(page.items.length > 0);
          setMessages(page.items);
          setOlderCursor(page.nextCursor);
        } else {
          if (
            messagesLengthRef.current === 0 &&
            page.items.length > 0 &&
            !isSendingRef.current
          ) {
            beginInitialScroll(true);
          }
          setMessages(current => {
            const merged = mergeChatPages(current, page);
            if (!merged.keptEarlier) {
              setOlderCursor(page.nextCursor);
            }
            return merged.items;
          });
        }
        setLoadError(null);
        return page.items.length;
      } catch (error) {
        if (options?.replace) {
          beginInitialScroll(false);
          setMessages([]);
        }
        console.error('[ChatScreen] Could not load conversation:', error);
        setLoadError(
          'Your conversation could not be loaded right now. Nothing was deleted.',
        );
        return null;
      }
    },
    [beginInitialScroll, userId],
  );

  const handleLoadEarlier = useCallback(() => {
    if (!olderCursor || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    try {
      const page = chatStore.getMessagesPage(userId, {before: olderCursor});
      suppressAutoScrollRef.current = true;
      setMessages(current => {
        const shown = new Set(current.map(existing => existing.id));
        return [...page.items.filter(item => !shown.has(item.id)), ...current];
      });
      setOlderCursor(page.nextCursor);
      setLoadError(null);
    } catch (error) {
      console.error('[ChatScreen] Could not load earlier messages:', error);
      setLoadError('Earlier messages could not be loaded. Try again.');
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [isLoadingEarlier, olderCursor, userId]);

  const prevUserIdRef = useRef(userId);
  // A different account never sees the previous account's messages or cursor.
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    onlineAuthVerifiedUserRef.current = null;
    lastNetConnectivityRef.current = null;
    messagesLengthRef.current = 0;
    isTemporaryChatRef.current = false;
    setIsTemporaryChat(false);
    setTempMessages([]);
    setEndTempConfirmVisible(false);
    setChatMultiBatch(null);
    setChatMultiBusy(false);
    setUndoOffer(null);
    setMessages([]);
    setOlderCursor(null);
    setHandbookNotes({});
    setLoadError(null);
    const nextChatId = readCurrentChat();
    shownChatIdRef.current = nextChatId;
    setCurrentChatId(nextChatId);
    setHistoryVisible(false);
    setLegacyHiddenCount(chatStore.getLegacyQuarantineSummary().messageCount);
    setLegacyNoticeDismissed(
      localSettingsStore.get(userId, 'chat.legacyNoticeDismissed', null) ===
        'true',
    );
    setChatSyncNoticeVisible(chatSyncStore.needsNotice(userId));
    beginInitialScroll(false);
  }, [userId, readCurrentChat, beginInitialScroll]);

  // The sync notice is due once the server is known to store chat, which the
  // first sync pass after an update learns.
  useEffect(() => {
    setChatSyncNoticeVisible(chatSyncStore.needsNotice(userId));
  }, [userId, refreshTrigger]);

  // Automatically detect Wi-Fi / data connection and sync online mode
  useEffect(() => {
    let active = true;

    const syncConnectivity = async (
      isConnected: boolean | null,
      isInternetReachable: boolean | null,
      isInitialFetch = false,
    ) => {
      if (!active) return;
      const isDeviceConnected = Boolean(
        isConnected && isInternetReachable !== false,
      );
      const optedIn = () =>
        localSettingsStore.get(userId, 'chat.onlineMode', null) === 'true';

      // Avoid redundant re-authorization on <Activity> warm return when already
      // connected, opted-in, online, and verified for this user.
      if (isInitialFetch && lastNetConnectivityRef.current === isDeviceConnected) {
        if (
          isDeviceConnected &&
          optedIn() &&
          isOnlineModeRef.current &&
          onlineAuthVerifiedUserRef.current === userId
        ) {
          return;
        }
      } else if (
        !isInitialFetch &&
        lastNetConnectivityRef.current === isDeviceConnected
      ) {
        return;
      }
      lastNetConnectivityRef.current = isDeviceConnected;
      // Online Mode is opt-in: connectivity alone never turns it on.
      if (!optedIn()) {
        onlineAuthVerifiedUserRef.current = null;
        return;
      }

      if (isDeviceConnected) {
        if (
          isOnlineModeRef.current &&
          onlineAuthVerifiedUserRef.current === userId
        ) {
          return;
        }
        const auth = await accountLinkService.authorizeOnlineMode(userId);
        // The student may have switched Online Mode off while this was pending.
        if (active && auth.status === 'success' && optedIn()) {
          onlineAuthVerifiedUserRef.current = userId;
          setIsOnlineMode(true);
        }
      } else if (active) {
        onlineAuthVerifiedUserRef.current = null;
        setIsOnlineMode(false);
      }
    };

    void NetInfo.fetch()
      .then(state => {
        if (!active) return;
        void syncConnectivity(
          state.isConnected,
          state.isInternetReachable,
          true,
        ).catch(() => undefined);
      })
      .catch(() => undefined);

    const unsubscribe = NetInfo.addEventListener(state => {
      void syncConnectivity(state.isConnected, state.isInternetReachable).catch(
        () => undefined,
      );
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  // Voice conversation can turn Online Mode on (explicit tap there too).
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      ONLINE_MODE_CHANGED_EVENT,
      (event: {userId?: string; enabled?: boolean}) => {
        if (event?.userId === userId && typeof event.enabled === 'boolean') {
          setIsOnlineMode(event.enabled);
        }
      },
    );
    return () => subscription.remove();
  }, [userId]);

  // A reply's memory changes arrive after it is shown (and when undone).
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      CHAT_MEMORY_CHANGED_EVENT,
      (event: ChatMemoryChangedEvent) => {
        if (event?.userId !== userId) return;
        setMessages(current =>
          current.map(message =>
            message.id === event.messageId
              ? {...message, memoryChanges: event.changes}
              : message,
          ),
        );
      },
    );
    return () => subscription.remove();
  }, [userId]);

  const handleUndoMemory = useCallback(
    (message: ChatMessage) => {
      if (!message.memoryChanges || message.memoryChanges.undone) return;
      try {
        chatMemoryService.undo(userId, message.id, message.memoryChanges);
      } catch (error) {
        console.error('[ChatScreen] Could not undo the memory change:', error);
        Alert.alert(
          'Not Undone',
          'The memory change could not be undone. Try again.',
        );
      }
    },
    [userId],
  );

  /** Shows the chat that is now open (after New chat, opening another, or deleting the open one). */
  const showCurrentChat = useCallback(() => {
    const nextChatId = readCurrentChat();
    // Only a real switch cancels the card; renaming the open chat does not.
    if (nextChatId !== shownChatIdRef.current) {
      cancelOpenReviewRef.current({silent: true});
      reviewSourceRef.current = null;
      setChatMultiBatch(null);
    }
    shownChatIdRef.current = nextChatId;
    isTemporaryChatRef.current = false;
    setIsTemporaryChat(false);
    setTempMessages([]);
    setCurrentChatId(nextChatId);
    setHandbookNotes({});
    setOlderCursor(null);
    setLoadError(null);
    loadMessages({replace: true});
    refreshChatTitle();
  }, [loadMessages, readCurrentChat, refreshChatTitle]);

  const loadedChatRevision = useRef({userId, refreshTrigger});
  useEffect(() => {
    const previous = loadedChatRevision.current;
    if (
      previous.userId === userId &&
      previous.refreshTrigger === refreshTrigger
    )
      return;
    loadedChatRevision.current = {userId, refreshTrigger};
    if (previous.userId !== userId) {
      loadMessages({replace: true});
      refreshChatTitle();
      return;
    }
    if (isSendingRef.current || isTemporaryChatRef.current) return;
    if (readCurrentChat() !== shownChatIdRef.current) {
      showCurrentChat();
      return;
    }
    const hadMessages = messagesLengthRef.current > 0;
    const msgRev = db.getDataRevision(CHAT_HISTORY_TABLES);
    if (
      msgRev === loadedMessagesRevRef.current &&
      (msgRev > 0 || !hadMessages)
    ) {
      return;
    }
    const loadedCount = loadMessages();
    refreshChatTitle();
    // If history was cleared in Profile while on Default Chat, dismiss stale cards.
    if (hadMessages && loadedCount === 0) {
      if (!reviewSourceRef.current?.isTemporary) {
        cancelOpenReviewRef.current({silent: true});
        reviewSourceRef.current = null;
      }
      setChatMultiBatch(null);
    }
  }, [
    userId,
    loadMessages,
    readCurrentChat,
    refreshChatTitle,
    refreshTrigger,
    showCurrentChat,
  ]);

  // Chats synced from another phone (ADR-040). A send in progress or an open
  // Temporary Chat is left alone; the next load or reopen shows the changes.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      CHAT_REMOTE_CHANGED_EVENT,
      (event: ChatRemoteChangedEvent) => {
        if (event?.userId === userId) {
          setChatSyncNoticeVisible(chatSyncStore.needsNotice(userId));
        }
        if (
          event?.userId !== userId ||
          isSendingRef.current ||
          isTemporaryChatRef.current
        )
          return;
        if (readCurrentChat() !== shownChatIdRef.current) {
          // The open chat was deleted on another phone.
          showCurrentChat();
          return;
        }
        loadMessages();
        refreshChatTitle();
      },
    );
    return () => subscription.remove();
  }, [
    userId,
    loadMessages,
    readCurrentChat,
    refreshChatTitle,
    showCurrentChat,
  ]);

  /**
   * Opens a general chat: a new one, or at the chat limit the latest general
   * chat (the student is told). False when neither is possible.
   */
  const openGeneralChat = (announceFallback: boolean): boolean => {
    try {
      chatStore.startNewChat(userId, 'general');
      return true;
    } catch (error) {
      if (!isChatLimitReachedError(error)) throw error;
      const opened = chatStore.openLatestGeneralChat(userId);
      if (!opened || announceFallback) {
        Alert.alert(
          'Chat Limit Reached',
          opened
            ? `${error.message} Your latest chat is open instead.`
            : error.message,
        );
      }
      return opened !== null;
    }
  };

  /** Before a scan or call: leaves a USTP or Temporary Chat. False to stop the action. */
  const ensureGeneralSessionForTool = (): boolean => {
    const currentlyTemp = isTemporaryChatRef.current;
    const currentlyUstp =
      !currentlyTemp && isUstpSessionId(shownChatIdRef.current);
    if (!currentlyTemp && !currentlyUstp) return true;
    try {
      if (!openGeneralChat(false)) return false;
      isTemporaryChatRef.current = false;
      setIsTemporaryChat(false);
      setTempMessages([]);
      setChatMultiBatch(null);
      showCurrentChat();
      return true;
    } catch (error) {
      console.error('[ChatScreen] Could not switch to general chat:', error);
      Alert.alert(
        'Could Not Switch Chat',
        'Could not open a regular chat right now. Try again.',
      );
      return false;
    }
  };

  const showUstpUnavailable = () => {
    Alert.alert(
      'USTP features unavailable',
      ustpUnavailableMessage(getUstpEligibility(userId).reason),
    );
  };

  const handleLeaveBlockedUstpChat = () => {
    try {
      if (openGeneralChat(true)) showCurrentChat();
    } catch (error) {
      console.error('[ChatScreen] Could not open a scheduling chat:', error);
    }
  };

  const handleStartUstpChat = () => {
    if (isSending) return;
    if (!getUstpEligibility(userId).eligible) {
      setHistoryVisible(false);
      showUstpUnavailable();
      return;
    }
    setHistoryVisible(false);
    setIsTemporaryChat(false);
    setTempMessages([]);
    try {
      chatStore.startNewUstpChat(userId);
    } catch (error) {
      if (isChatLimitReachedError(error)) {
        Alert.alert('Chat Limit Reached', error.message);
        return;
      }
      console.error('[ChatScreen] Could not start Ask USTP chat:', error);
      Alert.alert(
        'Could Not Start',
        'Could not open Ask LAFINA about USTP right now.',
      );
      return;
    }
    showCurrentChat();
  };

  const enterTemporaryChat = useCallback(() => {
    if (isSendingRef.current) return;
    setHistoryVisible(false);
    setEndTempConfirmVisible(false);
    cancelOpenReviewRef.current({silent: true});
    reviewSourceRef.current = null;
    setChatMultiBatch(null);
    setUndoOffer(null);
    isTemporaryChatRef.current = true;
    setIsTemporaryChat(true);
    setTempMessages([]);
    beginInitialScroll(false);
  }, [beginInitialScroll]);

  const handleStartTemporaryFromSidebar = () => {
    enterTemporaryChat();
  };

  const handleConfirmEndTemporaryChat = useCallback(() => {
    setEndTempConfirmVisible(false);
    if (reviewSourceRef.current?.isTemporary) {
      cancelOpenReviewRef.current({silent: true});
      reviewSourceRef.current = null;
    }
    setChatMultiBatch(null);
    setUndoOffer(null);
    isTemporaryChatRef.current = false;
    setIsTemporaryChat(false);
    setTempMessages([]);
    showCurrentChat();
  }, [showCurrentChat]);

  const onlineToggleTicket = useRef(0);
  const handleToggleOnline = async (): Promise<boolean> => {
    // Any tap (on or off) supersedes a pending enable from an earlier tap.
    const ticket = ++onlineToggleTicket.current;
    if (isOnlineMode) {
      onlineAuthVerifiedUserRef.current = null;
      setIsOnlineMode(false);
      localSettingsStore.set(userId, 'chat.onlineMode', 'false');
      return false;
    }

    const netState = await NetInfo.fetch().catch(() => null);
    if (ticket !== onlineToggleTicket.current) return false;
    if (!netState?.isConnected) {
      Alert.alert(
        'Device Offline',
        'Please connect to Wi-Fi or mobile data to use Online Mode.',
      );
      return false;
    }

    const result = await accountLinkService
      .authorizeOnlineMode(userId)
      .catch(() => ({
        status: 'network_error' as const,
        message: 'Could not reach the LAFINA server. Try again.',
      }));
    if (ticket !== onlineToggleTicket.current) return false;
    if (result.status !== 'success') {
      Alert.alert(
        'Online Mode Unavailable',
        result.message || 'Could not enable online mode.',
      );
      return false;
    }

    if (!localSettingsStore.set(userId, 'chat.onlineMode', 'true')) {
      Alert.alert(
        'Online Mode Unavailable',
        'Could not save the Online Mode setting on this device. Try again.',
      );
      return false;
    }
    onlineAuthVerifiedUserRef.current = userId;
    setIsOnlineMode(true);
    return true;
  };

  const handleOpenFormatPicker = () => {
    setFormatPickerOpen(true);
  };

  const handleScanCamera = async () => {
    setFormatPickerOpen(false);
    if (!ensureGeneralSessionForTool()) return;
    try {
      const photo = await visionService.takePhoto();
      if (!photo?.uri) return;

      setIsSending(true);
      const ocrResult = await visionService.scanScheduleFromUri(photo.uri);
      setIsSending(false);

      if (!ocrResult.rawText.trim()) {
        Alert.alert(
          'No Text Detected',
          'Could not find any readable text in this photo. Make sure the schedule is clear and well-lit.',
        );
        return;
      }

      await handleSend(`Scan schedule:\n\n${ocrResult.rawText}`, {
        preserveDraft: true,
      });
    } catch (err: any) {
      setIsSending(false);
      Alert.alert(
        'Camera Scan Failed',
        err?.message || 'Could not scan photo.',
      );
    }
  };

  const handleScanGallery = async () => {
    setFormatPickerOpen(false);
    if (!ensureGeneralSessionForTool()) return;
    try {
      const photo = await visionService.pickImageFromGallery();
      if (!photo?.uri) return;

      setIsSending(true);
      const ocrResult = await visionService.scanScheduleFromUri(photo.uri);
      setIsSending(false);

      if (!ocrResult.rawText.trim()) {
        Alert.alert(
          'No Text Detected',
          'Could not find readable text in this image.',
        );
        return;
      }

      await handleSend(`Scan schedule:\n\n${ocrResult.rawText}`, {
        preserveDraft: true,
      });
    } catch (err: any) {
      setIsSending(false);
      Alert.alert(
        'Image Scan Failed',
        err?.message || 'Could not process image.',
      );
    }
  };

  const handleOpenAttachment = useCallback(
    async (attachment: ChatAttachment) => {
      if (isRemoteOnlyAttachment(attachment)) {
        Alert.alert(
          'File on Another Phone',
          `${attachment.fileName} is saved on the phone where this chat happened. Synced chats keep the text, not the file.`,
        );
        return;
      }
      if (!chatStore.hasAttachment(userId, attachment.uri)) {
        Alert.alert(
          'File Not Available',
          'That file is no longer in this conversation.',
        );
        return;
      }
      const status = await shareAttachment(attachment);
      if (status === 'Unavailable') {
        Alert.alert(
          'File Not Found',
          'This file is no longer stored on your device. Ask lafina to generate it again.',
        );
      } else if (status === 'failed') {
        Alert.alert(
          'Could Not Open File',
          'No app on this device could open or share the file.',
        );
      }
    },
    [userId],
  );

  // Offline, the installed model loads while the student types, so the first
  // message is not also waiting for it (it unloads itself after a minute idle).
  const lastModelWarmupRef = useRef(0);
  const warmOfflineModelForTyping = () => {
    if (isOnlineMode) return;
    const now = Date.now();
    if (now - lastModelWarmupRef.current < SLM_FOCUS_WARMUP_INTERVAL_MS) return;
    lastModelWarmupRef.current = now;
    void warmUpOfflineModel(userId).catch(() => false);
  };

  const handleSend = async (
    overrideText?: string,
    sendOptions?: {preserveDraft?: boolean},
  ) => {
    const sentAt = monotonicNow();
    const query = (overrideText || chatDraftStore.get(userId)).trim();
    if (!query || isSendingRef.current) return;
    // One trace per request, handed to this request only. A late callback
    // from an older request can never reach it.
    let timedAssistantId: string | null = null;
    const trace = isPerfTrackingEnabled()
      ? createRequestTrace({
          requestedMode: isOnlineMode ? 'online' : 'offline',
          source: 'chat',
          startedAtMonotonic: sentAt,
          onFinalize: snapshot =>
            chatTimingStore.record(timedAssistantId, snapshot),
        })
      : null;
    if (pendingTraceRef.current) {
      // The previous request's reply never reached the screen.
      pendingTraceRef.current.trace.finalize();
      pendingTraceRef.current = null;
    }
    liveTraceRef.current = trace;

    const requestUser = userId;
    const requestChatId = shownChatIdRef.current;
    const tempMode = isTemporaryChatRef.current;
    const ustpMode = !tempMode && isUstpSessionId(requestChatId);
    if (!sendOptions?.preserveDraft) {
      chatDraftStore.set(userId, '');
    }
    isSendingRef.current = true;
    needsInitialScrollRef.current = false;
    initialSettleUntilRef.current = 0;
    isNearBottomRef.current = true;
    clearInitialRevealHandles();
    listOpacity.setValue(1);
    setIsSending(true);

    // Pieces of the reply arrive many times a second; repaint at most every
    // STREAM_REPAINT_MS so long replies stay smooth on slower phones.
    let latestText = '';
    let shownFirst = false;
    const startedAt = new Date().toISOString();
    let userTempMsg: ChatMessage | null = null;
    if (tempMode) {
      userTempMsg = {
        id: `temp_user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sessionId: 'temp_chat',
        sender: 'user',
        content: query,
        createdAt: startedAt,
        updatedAt: startedAt,
      };
      setTempMessages(prev => [...prev, userTempMsg!]);
    }

    const showLatest = () => {
      streamFlushRef.current = null;
      if (activeUserRef.current !== requestUser) return;
      setStreamingReply({text: latestText, startedAt});
    };
    let questionShown = false;
    const stillShown = () =>
      activeUserRef.current === requestUser &&
      shownChatIdRef.current === requestChatId &&
      isTemporaryChatRef.current === tempMode;
    // The question appears the moment it is saved, not after the reply
    // (an offline reply can take seconds while the on-device model reads it).
    const onUserMessage = () => {
      if (tempMode || questionShown || !stillShown()) return;
      questionShown = true;
      loadMessages();
    };
    const onReplyText = (replySoFar: string) => {
      latestText = replySoFar;
      if (!shownFirst) {
        // The question is saved before the reply starts; show it above.
        shownFirst = true;
        if (!tempMode && !questionShown) {
          questionShown = true;
          loadMessages();
        }
        showLatest();
        return;
      }
      if (!streamFlushRef.current) {
        streamFlushRef.current = setTimeout(showLatest, STREAM_REPAINT_MS);
      }
    };

    try {
      const result = await chatOrchestrator.processMessage(userId, query, {
        onlineMode: isOnlineMode,
        useHandbook: ustpMode,
        ustpRagOnly: ustpMode,
        onReplyText,
        onUserMessage,
        // Offline, the on-device model gets this long; the parser answers after.
        slmTimeoutMs: CHAT_OFFLINE_SLM_TIMEOUT_MS,
        isCurrent: stillShown,
        trace,
        temporaryChat: tempMode,
        temporaryHistory: tempMode
          ? userTempMsg
            ? [...tempMessages, userTempMsg]
            : tempMessages
          : undefined,
      });
      if (trace) {
        timedAssistantId = result.assistantMessage?.id ?? null;
        trace.setOutcome('success');
        if (stillShown() && timedAssistantId) {
          // Finalized once the saved reply is drawn (see the effect below).
          pendingTraceRef.current = {
            trace,
            assistantId: timedAssistantId,
            tempMode,
          };
          // A reply that never reaches the screen still gets recorded.
          setTimeout(() => {
            if (pendingTraceRef.current?.trace === trace) {
              pendingTraceRef.current = null;
            }
            trace.finalize();
          }, TIMING_RENDER_WAIT_MS);
        } else {
          trace.finalize();
        }
      }
      // If the account changed while the reply was pending, the reply was saved
      // for the account that sent it and must not appear in this one.
      if (activeUserRef.current !== requestUser) return;
      setUndoOffer(result.undo ?? null);
      setSkillOffer(result.skillLaunch ?? null);
      if (result.handbookNote && result.assistantMessage) {
        setHandbookNotes(prev => ({
          ...prev,
          [result.assistantMessage.id]: result.handbookNote as string,
        }));
      }
      if (result.multiBatch) {
        reviewSourceRef.current = null;
        review.dismiss();
        setChatMultiBatch(result.multiBatch);
      } else if (result.resolvedReview) {
        const prevSource = reviewSourceRef.current;
        if (
          tempMode &&
          (result.resolvedReview.status === 'applied' ||
            result.resolvedReview.status === 'cancelled')
        ) {
          updateTempReviewMessage(
            result.resolvedReview.status === 'applied'
              ? 'confirmed'
              : 'cancelled',
            result.reply,
            prevSource?.messageId,
          );
        }
        reviewSourceRef.current = null;
        review.dismiss();
      } else if (result.review?.status === 'proposal' && !stillShown()) {
        // The student opened another chat while this was being read: the
        // card would land under the wrong conversation. Discard it quietly;
        // nothing was written. Saying it again in that chat brings it back.
        cancelReviewedCommand(requestUser, result.review.proposal.operationId);
      } else {
        setChatMultiBatch(null);
        if (result.review?.status === 'proposal') {
          reviewSourceRef.current = {
            operationId: result.review.proposal.operationId,
            text: query,
            messageId: result.assistantMessage?.id,
            isTemporary: tempMode,
          };
        }
        review.present(result.review);
      }
      if (tempMode) {
        setTempMessages(prev => [...prev, result.assistantMessage]);
      } else {
        loadMessages();
        refreshChatTitle();
      }
      onRefresh?.();
    } catch (err) {
      if (trace) {
        trace.setOutcome(
          'failure',
          err instanceof Error ? err.message.slice(0, 200) : 'error',
        );
        trace.finalize();
      }
      if (tempMode && userTempMsg && activeUserRef.current === requestUser) {
        const failedId = userTempMsg.id;
        setTempMessages(prev => prev.filter(msg => msg.id !== failedId));
      }
      if (isChatLimitReachedError(err)) {
        // Nothing was saved: this chat would have been one too many.
        Alert.alert('Chat Limit Reached', err.message);
      } else {
        console.error('[ChatScreen] Error processing chat message:', err);
        Alert.alert(
          'Message Not Sent',
          'Could not send your message right now. Try again.',
        );
      }
      // Nothing was answered: give the text back unless the student typed more.
      if (
        !sendOptions?.preserveDraft &&
        activeUserRef.current === requestUser &&
        !chatDraftStore.get(requestUser).trim()
      ) {
        chatDraftStore.set(requestUser, query);
      }
    } finally {
      // The saved reply (loaded above) replaces the live bubble in one render.
      if (streamFlushRef.current) {
        clearTimeout(streamFlushRef.current);
        streamFlushRef.current = null;
      }
      setStreamingReply(null);
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  const handleUndo = (token: string) => {
    const requestUser = userId;
    setUndoOffer(null);
    const outcome = chatOrchestrator.undoAction(requestUser, token, {
      recordInChat: !isTemporaryChat,
    });
    if (activeUserRef.current !== requestUser) return;
    if (isTemporaryChat || outcome.status === 'refused') {
      Alert.alert(
        outcome.status === 'undone' ? 'Undone' : 'Not undone',
        outcome.reply,
      );
    }
    if (!isTemporaryChat) loadMessages();
    onRefresh?.();
  };

  const updateTempReviewMessage = (
    status: 'confirmed' | 'cancelled',
    summary: string,
    targetMessageId?: string,
  ) => {
    const resolvedAt = new Date().toISOString();
    setTempMessages(prev => {
      let targetIdx = targetMessageId
        ? prev.findIndex(msg => msg.id === targetMessageId)
        : -1;
      if (targetIdx === -1) {
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          const candidate = prev[i];
          if (
            candidate.sender === 'assistant' &&
            !candidate.reviewResolution &&
            /^(?:\*\*)?Please review:/i.test(candidate.content.trim())
          ) {
            targetIdx = i;
            break;
          }
        }
      }
      if (targetIdx === -1) return prev;
      return prev.map((msg, idx) =>
        idx === targetIdx
          ? {
              ...msg,
              content: formatResolvedReviewContent(msg.content),
              reviewResolution: {status, summary, resolvedAt},
            }
          : msg,
      );
    });
  };

  const handleConfirmReview = async () => {
    const requestUser = userId;
    const source = reviewSourceRef.current;
    const confirmedInTemp = Boolean(source?.isTemporary ?? isTemporaryChat);
    try {
      const decision = await review.confirm({
        temporaryChat: confirmedInTemp,
      });
      if (!decision || activeUserRef.current !== requestUser) return;
      if (decision.outcome?.status === 'applied') {
        if (confirmedInTemp) {
          updateTempReviewMessage(
            'confirmed',
            decision.reply,
            source?.messageId,
          );
        }
        reviewSourceRef.current = null;
      }
      if (!confirmedInTemp) loadMessages();
      onRefresh?.();
    } catch (err) {
      console.error('[ChatScreen] Error confirming a reviewed command:', err);
    }
  };

  const handleCancelReview = () => {
    const cancelled = review.proposal;
    const source = reviewSourceRef.current;
    const cancelledInTemp = Boolean(source?.isTemporary ?? isTemporaryChat);
    const decision = review.cancel({temporaryChat: cancelledInTemp});
    if (!decision) return;
    // AGY-PORT 05: cancelling keeps the text editable; nothing was saved.
    if (
      cancelled &&
      source?.operationId === cancelled.operationId &&
      !chatDraftStore.get(userId).trim()
    ) {
      chatDraftStore.set(userId, source.text);
    }
    if (cancelledInTemp) {
      updateTempReviewMessage('cancelled', decision.reply, source?.messageId);
    } else {
      loadMessages();
    }
    reviewSourceRef.current = null;
  };

  const handleEditReview = (patch: ReviewEditPatch) => {
    const previousId = review.proposal?.operationId;
    const edited = review.edit ? review.edit(patch) : null;
    if (edited?.status === 'proposal' && previousId) {
      rebindReviewTurn(previousId, edited.proposal.operationId);
      const source = reviewSourceRef.current;
      if (source?.operationId === previousId) {
        reviewSourceRef.current = {
          ...source,
          operationId: edited.proposal.operationId,
        };
        if (source.isTemporary && source.messageId) {
          setTempMessages(prev =>
            prev.map(msg =>
              msg.id === source.messageId
                ? {...msg, content: edited.reply}
                : msg,
            ),
          );
        }
      }
    }
    return edited;
  };

  const handleConfirmChatMultiAll = async () => {
    if (!chatMultiBatch || chatMultiBusy) return;
    const requestUser = userId;
    const confirmedInTemp = isTemporaryChatRef.current;
    setChatMultiBusy(true);
    try {
      const {batch, spokenSummary} =
        await actionService.confirmMultiActionBatch(
          requestUser,
          chatMultiBatch,
          undefined,
          () => activeUserRef.current === requestUser,
          {onDevice: true},
        );
      if (activeUserRef.current !== requestUser) return;
      setChatMultiBatch(batch);
      if (confirmedInTemp) {
        const now = new Date().toISOString();
        setTempMessages(prev => [
          ...prev,
          {
            id: `temp_asst_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 7)}`,
            sessionId: 'temp_chat',
            sender: 'assistant',
            content: spokenSummary,
            localReply: true,
            createdAt: now,
            updatedAt: now,
          },
        ]);
      } else {
        chatStore.addMessage(
          requestUser,
          'assistant',
          spokenSummary,
          null,
          {localReply: true},
          readCurrentChat(),
        );
        loadMessages();
      }
      onRefresh?.();
    } catch (err) {
      console.warn('[ChatScreen] Multi-action confirm failed:', err);
      Alert.alert(
        'Could Not Save',
        err instanceof Error
          ? err.message
          : 'Could not save these items right now. Try again.',
      );
    } finally {
      setChatMultiBusy(false);
    }
  };

  const handleCancelChatMultiAll = () => {
    if (!chatMultiBatch) return;
    actionService.cancelMultiActionBatch(userId, chatMultiBatch);
    setChatMultiBatch(null);
  };

  const handleCancelChatMultiItem = (itemId: string) => {
    if (!chatMultiBatch) return;
    const remaining = chatMultiBatch.items.filter(i => i.id !== itemId);
    if (remaining.length === 0) {
      setChatMultiBatch(null);
      return;
    }
    setChatMultiBatch({
      ...chatMultiBatch,
      revision: chatMultiBatch.revision + 1,
      items: remaining,
    });
  };

  const handleRetryChatMultiItem = async (itemId: string) => {
    if (!chatMultiBatch || chatMultiBusy) return;
    const requestUser = userId;
    const confirmedInTemp = isTemporaryChatRef.current;
    setChatMultiBusy(true);
    try {
      const {batch} = await actionService.confirmMultiActionBatch(
        requestUser,
        chatMultiBatch,
        itemId,
        () => activeUserRef.current === requestUser,
        {onDevice: true},
      );
      if (activeUserRef.current !== requestUser) return;
      setChatMultiBatch(batch);
      if (!confirmedInTemp) {
        loadMessages();
      }
      onRefresh?.();
    } catch (err) {
      console.warn('[ChatScreen] Multi-action item retry failed:', err);
      Alert.alert(
        'Retry Failed',
        err instanceof Error
          ? err.message
          : 'Could not retry this item right now. Try again.',
      );
    } finally {
      setChatMultiBusy(false);
    }
  };

  const handleEditChatMultiItemFields = (
    itemId: string,
    patch: Partial<
      Pick<MultiActionItemData, 'date' | 'time' | 'endTime' | 'body'>
    >,
  ) => {
    setChatMultiBatch(prev => {
      if (!prev) return prev;
      const updated = reviseMultiItem(prev, itemId, patch);
      return {...updated, items: [...updated.items]};
    });
  };

  const handleEditChatMultiItemTitle = (itemId: string, newTitle: string) => {
    setChatMultiBatch(prev => {
      if (!prev) return prev;
      const updated = reviseMultiItem(prev, itemId, {title: newTitle});
      return {...updated, items: [...updated.items]};
    });
  };

  const dismissLegacyNotice = () => {
    setLegacyNoticeDismissed(true);
    localSettingsStore.set(userId, 'chat.legacyNoticeDismissed', 'true');
  };

  const acknowledgeChatSync = (keepSyncing: boolean) => {
    setChatSyncNoticeVisible(false);
    try {
      if (keepSyncing) chatSyncStore.markNoticeSeen(userId);
      else chatHistorySync.setEnabled(userId, false);
    } catch (error) {
      console.warn('[ChatScreen] Chat sync choice was not saved:', error);
    }
  };

  const displayedMessages = useMemo(() => {
    const current = isTemporaryChat
      ? tempMessages
      : ustpChatBlocked
      ? []
      : messages;
    return [...current].reverse();
  }, [isTemporaryChat, tempMessages, ustpChatBlocked, messages]);

  const orderedGeneralSampleCards = useMemo(
    () => orderCardsByGoal(GENERAL_SAMPLE_CARDS, effectiveGoal(userId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputes only when userId or refreshTrigger changes student setup
    [userId, refreshTrigger],
  );
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const handleStartUstpChatRef = useRef(handleStartUstpChat);
  handleStartUstpChatRef.current = handleStartUstpChat;
  const handleLeaveBlockedUstpChatRef = useRef(handleLeaveBlockedUstpChat);
  handleLeaveBlockedUstpChatRef.current = handleLeaveBlockedUstpChat;
  const handleToggleOnlineRef = useRef(handleToggleOnline);
  handleToggleOnlineRef.current = handleToggleOnline;
  const acknowledgeChatSyncRef = useRef(acknowledgeChatSync);
  acknowledgeChatSyncRef.current = acknowledgeChatSync;
  const dismissLegacyNoticeRef = useRef(dismissLegacyNotice);
  dismissLegacyNoticeRef.current = dismissLegacyNotice;
  const handleLoadEarlierRef = useRef(handleLoadEarlier);
  handleLoadEarlierRef.current = handleLoadEarlier;
  const loadMessagesRef = useRef(loadMessages);
  loadMessagesRef.current = loadMessages;
  const ensureGeneralSessionForToolRef = useRef(ensureGeneralSessionForTool);
  ensureGeneralSessionForToolRef.current = ensureGeneralSessionForTool;
  const handleOpenFormatPickerRef = useRef(handleOpenFormatPicker);
  handleOpenFormatPickerRef.current = handleOpenFormatPicker;
  const warmOfflineModelForTypingRef = useRef(warmOfflineModelForTyping);
  warmOfflineModelForTypingRef.current = warmOfflineModelForTyping;

  const handleComposerSend = useCallback(
    (overrideText?: string, sendOptions?: {preserveDraft?: boolean}) => {
      void handleSendRef.current(overrideText, sendOptions);
    },
    [],
  );
  const handleComposerCall = useMemo(
    () =>
      onCallLafina && !isTemporaryChat
        ? () => {
            if (isSendingRef.current) return;
            if (!ensureGeneralSessionForToolRef.current()) return;
            onCallLafina();
          }
        : undefined,
    [onCallLafina, isTemporaryChat],
  );
  const handleComposerOpenPicker = useMemo(
    () =>
      isUstpChat
        ? undefined
        : () => {
            handleOpenFormatPickerRef.current();
          },
    [isUstpChat],
  );
  const handleComposerFocus = useCallback(() => {
    setIsKeyboardVisible(true);
    warmOfflineModelForTypingRef.current();
    needsInitialScrollRef.current = false;
    initialSettleUntilRef.current = 0;
    isNearBottomRef.current = true;
    setTimeout(
      () => flatListRef.current?.scrollToOffset({offset: 0, animated: true}),
      100,
    );
  }, []);

  const listFooterElement = useMemo(
    () => (
      <View>
        {chatSyncNoticeVisible && !isTemporaryChat ? (
          <View
            style={[
              styles.noticeCard,
              themed.headerButton,
              isModern && styles.modernNoticeCard,
            ]}
            testID="chat-sync-notice"
          >
            <Text style={[styles.noticeText, themed.emptySubtitle]}>
              Your chats are now saved to your LAFINA account, so they appear on
              your other phones and come back if you reinstall. Chats you write
              offline sync when you reconnect. Attached files stay on this phone.
              You can change this in Preferences.
            </Text>
            <View style={styles.noticeActions}>
              <TouchableOpacity
                onPress={() => acknowledgeChatSyncRef.current(true)}
                accessibilityRole="button"
                accessibilityLabel="Keep syncing chat history"
                testID="chat-sync-notice-keep"
              >
                <Text style={[styles.noticeAction, {color: colors.primary}]}>
                  Got it
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => acknowledgeChatSyncRef.current(false)}
                accessibilityRole="button"
                accessibilityLabel="Keep chat history on this phone only"
                testID="chat-sync-notice-off"
              >
                <Text style={[styles.noticeAction, {color: colors.primary}]}>
                  Keep on this phone only
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {legacyHiddenCount > 0 && !legacyNoticeDismissed ? (
          <View
            style={[
              styles.noticeCard,
              themed.headerButton,
              isModern && styles.modernNoticeCard,
            ]}
            testID="chat-legacy-notice"
          >
            <Text style={[styles.noticeText, themed.emptySubtitle]}>
              Some chat history saved before accounts were kept separate could
              not be matched to a single account. It is still stored on this
              device, hidden from every account, and nothing was deleted.
            </Text>
            <TouchableOpacity
              onPress={() => dismissLegacyNoticeRef.current()}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notice about older chat history"
              testID="chat-legacy-notice-dismiss"
            >
              <Text style={[styles.noticeAction, {color: colors.primary}]}>
                Got it
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {loadError ? (
          <View
            style={[
              styles.noticeCard,
              themed.headerButton,
              isModern && styles.modernNoticeCard,
            ]}
            testID="chat-load-error"
          >
            <Text style={[styles.noticeText, themed.emptySubtitle]}>
              {loadError}
            </Text>
            <TouchableOpacity
              onPress={() =>
                olderCursor
                  ? handleLoadEarlierRef.current()
                  : loadMessagesRef.current()
              }
              accessibilityRole="button"
              accessibilityLabel="Retry loading the conversation"
              testID="chat-load-retry"
            >
              <Text style={[styles.noticeAction, {color: colors.primary}]}>
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {olderCursor ? (
          <TouchableOpacity
            style={[
              styles.loadEarlierButton,
              themed.headerButton,
              isModern && {backgroundColor: modernPalette.surface},
            ]}
            onPress={() => handleLoadEarlierRef.current()}
            disabled={isLoadingEarlier}
            accessibilityRole="button"
            accessibilityLabel="Load earlier messages"
            testID="chat-load-earlier"
          >
            <Text style={[styles.loadEarlierText, themed.onlineToggleText]}>
              {isLoadingEarlier ? 'Loading...' : 'Load earlier messages'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ),
    [
      chatSyncNoticeVisible,
      colors.primary,
      isLoadingEarlier,
      isModern,
      isTemporaryChat,
      legacyHiddenCount,
      legacyNoticeDismissed,
      loadError,
      modernPalette.surface,
      olderCursor,
      themed,
    ],
  );

  const renderSampleGrid = (
    cards: readonly SampleChatCardConfig[],
    testIdPrefix: string,
  ) => {
    const iconColor = isModern ? modernPalette.accent : colors.primary;
    const cardBg = isModern ? modernPalette.card : colors.surface;
    const cardBorder = isModern ? modernPalette.border : colors.border;
    const textColor = isModern ? modernPalette.text : colors.textPrimary;

    return (
      <View style={styles.sampleGrid}>
        {[cards.slice(0, 2), cards.slice(2, 4)].map((row, rowIndex) => (
          <View key={rowIndex} style={styles.sampleGridRow}>
            {row.map((card, colIndex) => {
              const index = rowIndex * 2 + colIndex;
              return (
                <TouchableOpacity
                  key={card.label}
                  style={[
                    styles.sampleCard,
                    isModern && modernShadows.card,
                    {
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                    },
                  ]}
                  onPress={() =>
                    void handleSendRef.current(card.prompt, {
                      preserveDraft: true,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={card.prompt}
                  testID={`${testIdPrefix}-${index}`}
                  activeOpacity={0.78}
                >
                  <View style={styles.sampleCardIcon}>
                    {renderSampleCardIcon(card.iconKey, iconColor)}
                  </View>
                  <Text
                    style={[styles.sampleCardText, {color: textColor}]}
                    numberOfLines={2}
                  >
                    {card.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const listEmptyElement = useMemo(() => {
    if (loadError) return null;
    const greetingColor = isModern ? modernPalette.text : colors.textPrimary;
    const subtitleColor = isModern ? modernPalette.muted : colors.textSecondary;
    const accentColor = isModern ? modernPalette.accent : colors.primary;
    const softVioletBg = isModern
      ? modernPalette.softViolet
      : colors.primary + '16';

    if (ustpChatBlocked) {
      // An old USTP chat, a restored screen or a stale link: explained, not answered.
      return (
        <View style={styles.emptyContainer} testID="chat-ustp-unavailable">
          <View style={styles.greetingBlock}>
            <Text style={[styles.greetingEyebrow, {color: subtitleColor}]}>
              USTP school features
            </Text>
            <Text style={[styles.greetingTitle, {color: greetingColor}]}>
              Not available right now
            </Text>
            <Text
              style={[
                styles.greetingEyebrow,
                {color: subtitleColor, marginTop: 10, lineHeight: 20},
              ]}
            >
              {ustpUnavailableMessage(schoolEligibility.reason)}
            </Text>
          </View>
          <View style={styles.emptyBottomSection}>
            <TouchableOpacity
              style={[
                styles.ustpOnlineBanner,
                isModern && styles.modernUstpBanner,
                {
                  backgroundColor: softVioletBg,
                  borderColor: accentColor + '35',
                },
              ]}
              onPress={() => handleLeaveBlockedUstpChatRef.current()}
              accessibilityRole="button"
              accessibilityLabel="Back to a scheduling chat"
              testID="chat-ustp-unavailable-back"
              activeOpacity={0.75}
            >
              <Text style={[styles.ustpOnlineBannerText, {color: accentColor}]}>
                Back to a scheduling chat
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (isUstpChat) {
      return (
        <View style={styles.emptyContainer} testID="chat-empty-state">
          <View style={styles.greetingBlock}>
            <Text style={[styles.greetingEyebrow, {color: subtitleColor}]}>
              USTP Academic Policy & Handbook
            </Text>
            <Text style={[styles.greetingTitle, {color: greetingColor}]}>
              Ask LAFINA anything about USTP
            </Text>
          </View>

          <View style={styles.mascotStage} testID="chat-ustp-empty-badge">
            <Image
              source={LAFINA_MASCOT}
              style={styles.mascotImage}
              resizeMode="contain"
              testID="chat-empty-mascot"
              accessibilityLabel="LAFINA mascot"
            />
            <View
              style={[
                styles.mascotModeTag,
                {
                  backgroundColor: isModern
                    ? modernPalette.card
                    : colors.surface,
                  borderColor: accentColor + '44',
                },
              ]}
            >
              <BookOpen size={13} color={accentColor} />
              <Text style={[styles.mascotModeTagText, {color: accentColor}]}>
                {localHandbookStatus.populated
                  ? 'Local FTS5 Ready'
                  : 'USTP Handbook'}
              </Text>
            </View>
          </View>

          <View style={styles.emptyBottomSection}>
            {!isOnlineMode && (
              <TouchableOpacity
                style={[
                  styles.ustpOnlineBanner,
                  isModern && styles.modernUstpBanner,
                  {
                    backgroundColor: softVioletBg,
                    borderColor: accentColor + '35',
                  },
                ]}
                onPress={() => {
                  void handleToggleOnlineRef.current();
                }}
                accessibilityRole="button"
                accessibilityLabel="Enable Online Mode for USTP Handbook lookup"
                testID="chat-ustp-enable-online"
                activeOpacity={0.75}
              >
                <Text
                  style={[styles.ustpOnlineBannerText, {color: accentColor}]}
                >
                  {localHandbookStatus.populated
                    ? `Offline USTP Handbook ready (${localHandbookStatus.chunkCount} sections) · Tap to turn on Online AI`
                    : 'Online Mode is off · Tap to enable USTP lookup'}
                </Text>
              </TouchableOpacity>
            )}
            {renderSampleGrid(USTP_SAMPLE_CARDS, 'chat-ustp-prompt-chip')}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer} testID="chat-empty-state">
        <View style={styles.greetingBlock}>
          <Text style={[styles.greetingEyebrow, {color: subtitleColor}]}>
            {isTemporaryChat
              ? 'Not saved in history'
              : `Hello, ${studentName}!`}
          </Text>
          <Text style={[styles.greetingTitle, {color: greetingColor}]}>
            {isTemporaryChat ? 'Temporary Chat' : 'How can I help you today?'}
          </Text>
        </View>

        <View style={styles.mascotStage}>
          <Image
            source={LAFINA_MASCOT}
            style={styles.mascotImage}
            resizeMode="contain"
            testID="chat-empty-mascot"
            accessibilityLabel="LAFINA mascot"
          />
          {isTemporaryChat && (
            <View
              style={[
                styles.mascotModeTag,
                {
                  backgroundColor: isModern
                    ? modernPalette.card
                    : colors.surface,
                  borderColor: accentColor + '44',
                },
              ]}
            >
              <MessageCircleDashed size={13} color={accentColor} />
              <Text style={[styles.mascotModeTagText, {color: accentColor}]}>
                Unsaved
              </Text>
            </View>
          )}
        </View>

        <View style={styles.emptyBottomSection}>
          {renderSampleGrid(orderedGeneralSampleCards, 'chat-prompt-chip')}
          {!isTemporaryChat && schoolEnabled && (
            <TouchableOpacity
              style={[
                styles.ustpCompactLink,
                {
                  backgroundColor: softVioletBg,
                  borderColor: isModern
                    ? modernPalette.border
                    : colors.primary + '38',
                },
              ]}
              onPress={() => handleStartUstpChatRef.current()}
              accessibilityRole="button"
              accessibilityLabel="Ask LAFINA anything about USTP"
              testID="chat-switch-to-ustp-button"
              activeOpacity={0.78}
            >
              <BookOpen size={14} color={accentColor} />
              <Text
                style={[styles.ustpCompactLinkText, {color: accentColor}]}
                numberOfLines={1}
              >
                Ask LAFINA anything about USTP
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renderSampleGrid uses the listed theme & card deps
  }, [
    colors.primary,
    colors.surface,
    colors.textPrimary,
    colors.textSecondary,
    isModern,
    isOnlineMode,
    isTemporaryChat,
    isUstpChat,
    loadError,
    localHandbookStatus.chunkCount,
    localHandbookStatus.populated,
    modernPalette.accent,
    modernPalette.border,
    modernPalette.card,
    modernPalette.muted,
    modernPalette.softViolet,
    modernPalette.text,
    modernShadows.card,
    orderedGeneralSampleCards,
    schoolEligibility.reason,
    schoolEnabled,
    studentName,
    ustpChatBlocked,
  ]);

  const backgroundSvg = useMemo(
    () => (
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient
            id={`chatUniGuideBg_${modernTheme}_${
              isDarkMode ? 'dark' : 'light'
            }`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <Stop
              offset="0%"
              stopColor={
                isModern ? modernThemeExtras.chatBgStops[0] : colors.background
              }
            />
            <Stop
              offset="44%"
              stopColor={
                isModern ? modernThemeExtras.chatBgStops[1] : colors.background
              }
            />
            <Stop
              offset="100%"
              stopColor={
                isModern ? modernThemeExtras.chatBgStops[2] : colors.background
              }
            />
          </LinearGradient>
        </Defs>
        <Rect
          width="100%"
          height="100%"
          fill={
            isModern
              ? `url(#chatUniGuideBg_${modernTheme}_${
                  isDarkMode ? 'dark' : 'light'
                })`
              : colors.background
          }
        />
      </Svg>
    ),
    [colors.background, isDarkMode, isModern, modernTheme, modernThemeExtras],
  );

  const flatListKeyExtractor = useCallback((item: ChatMessage) => item.id, []);
  const flatListRenderItem = useCallback(
    ({item}: {item: ChatMessage}) => (
      <ChatMessageItem
        item={item}
        replyFormat={replyFormat}
        handbookNote={
          schoolEnabled ? item.handbookNote ?? handbookNotes[item.id] : undefined
        }
        onUndoMemory={handleUndoMemory}
        onOpenAttachment={handleOpenAttachment}
        timingLabel={perfOn ? timingLabels[item.id] : undefined}
      />
    ),
    [
      handbookNotes,
      handleOpenAttachment,
      handleUndoMemory,
      perfOn,
      replyFormat,
      schoolEnabled,
      timingLabels,
    ],
  );
  const handleListScrollBeginDrag = useCallback(() => {
    needsInitialScrollRef.current = false;
    initialSettleUntilRef.current = 0;
  }, []);
  const hasNoMessages =
    (isTemporaryChat ? tempMessages.length : messages.length) === 0;
  const listContentContainerStyle = useMemo(
    () => [styles.listContent, hasNoMessages && styles.listContentEmpty],
    [hasNoMessages],
  );
  const listHeaderElement = useMemo(
    () =>
      streamingReply ? (
        <ChatMessageItem
          replyFormat={replyFormat}
          item={{
            id: 'streaming-reply',
            sessionId: '',
            sender: 'assistant',
            content: streamingReply.text,
            createdAt: streamingReply.startedAt,
            updatedAt: streamingReply.startedAt,
          }}
          streaming
        />
      ) : isSending ? (
        <TypingBubble label="lafina is thinking…" />
      ) : null,
    [isSending, replyFormat, streamingReply],
  );
  const renderListFooter = useCallback(
    () => listFooterElement,
    [listFooterElement],
  );
  const renderListEmpty = useCallback(
    () => listEmptyElement,
    [listEmptyElement],
  );
  const renderListHeader = useCallback(
    () => listHeaderElement,
    [listHeaderElement],
  );

  return (
    <View
      style={[
        styles.container,
        themed.container,
        {paddingBottom: bottomClearance},
      ]}
      onLayout={e => {
        const h = e.nativeEvent.layout.height;
        if (h > maxHeightRef.current) {
          maxHeightRef.current = h;
        }
        setCurrentHeight(prev => (prev === h ? prev : h));
      }}
      testID="chat-screen-container"
    >
      {backgroundSvg}

      {/* Top Header */}
      <View
        style={[styles.header, themed.header, isModern && styles.modernHeader]}
      >
        <TouchableOpacity
          style={[
            styles.headerCircleButton,
            themed.headerCircleButton,
            isModern && modernShadows.subtle,
          ]}
          onPress={() => setHistoryVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Open chats, USTP Handbook, and skills sidebar"
          testID="chat-history-button"
        >
          <Menu size={20} color={themed.headerTitle.color} strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <TouchableOpacity
            ref={tourTargetRef('chat-engine-pill')}
            style={[
              styles.centerStatusPill,
              themed.headerCircleButton,
              isModern && modernShadows.subtle,
            ]}
            onPress={() => {
              void refreshModelAndProfileState();
              setEngineSheetVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              isOnlineMode
                ? 'Online mode active. Tap to switch mode or download offline models'
                : `Offline model: ${centerPillInfo.label}. Tap to view or download offline models`
            }
            testID="chat-online-toggle-button"
          >
            <View
              style={[
                styles.centerPillDot,
                {
                  backgroundColor: centerPillInfo.isReady
                    ? '#10B981'
                    : isModern
                    ? modernPalette.accent
                    : colors.primary,
                },
              ]}
            />
            <Text
              style={[styles.centerPillText, themed.headerTitle]}
              numberOfLines={1}
            >
              {centerPillInfo.label}
            </Text>
            <View style={styles.centerPillChevron}>
              <ChevronDown
                size={14}
                color={themed.headerSubtitle.color}
                strokeWidth={2.2}
              />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[
              styles.headerCircleButton,
              themed.headerCircleButton,
              isModern && modernShadows.subtle,
              isTemporaryChat && {
                backgroundColor: isModern
                  ? modernPalette.softViolet
                  : colors.primary + '20',
                borderColor: isModern ? modernPalette.accent : colors.primary,
              },
            ]}
            onPress={() => {
              if (isSending) return;
              if (isTemporaryChat) {
                setEndTempConfirmVisible(true);
              } else {
                enterTemporaryChat();
              }
            }}
            disabled={isSending}
            accessibilityRole="button"
            accessibilityLabel={
              isTemporaryChat
                ? 'Turn off temporary chat'
                : 'Turn on temporary chat'
            }
            accessibilityState={{
              selected: isTemporaryChat,
              disabled: isSending,
            }}
            testID="chat-temporary-toggle-button"
          >
            <MessageCircleDashed
              size={18}
              color={
                isTemporaryChat
                  ? isModern
                    ? modernPalette.accent
                    : colors.primary
                  : themed.headerTitle.color
              }
            />
          </TouchableOpacity>
        </View>
      </View>

      {(isUstpChat ||
        (isTemporaryChat && tempMessages.length > 0) ||
        (!isTemporaryChat &&
          chatTitle &&
          chatTitle !== 'New chat' &&
          chatTitle !== messages[0]?.content)) && (
        <View style={styles.contextStrip}>
          {isUstpChat ? (
            <View
              style={[
                styles.contextPill,
                {
                  backgroundColor: isModern
                    ? modernPalette.softViolet
                    : colors.primary + '16',
                  borderColor: isModern
                    ? modernPalette.accent + '38'
                    : colors.primary + '38',
                },
              ]}
              testID="chat-ustp-mode-badge"
            >
              <View style={styles.contextPillIcon}>
                <BookOpen
                  size={12}
                  color={isModern ? modernPalette.accent : colors.primary}
                />
              </View>
              <Text
                style={[
                  styles.contextPillText,
                  {color: isModern ? modernPalette.accent : colors.primary},
                ]}
                numberOfLines={1}
              >
                {chatTitle &&
                chatTitle !== 'New chat' &&
                chatTitle !== 'Ask LAFINA about USTP'
                  ? localHandbookStatus.populated
                    ? `Offline USTP Handbook · ${chatTitle}`
                    : `USTP Handbook · ${chatTitle}`
                  : localHandbookStatus.populated
                  ? 'Offline USTP Handbook'
                  : 'USTP Handbook'}
              </Text>
            </View>
          ) : isTemporaryChat ? (
            <View
              style={[
                styles.contextPill,
                {
                  backgroundColor: isModern
                    ? modernPalette.softViolet
                    : colors.primary + '16',
                  borderColor: isModern
                    ? modernPalette.accent + '45'
                    : colors.primary + '45',
                },
              ]}
            >
              <View style={styles.contextPillIcon}>
                <MessageCircleDashed
                  size={12}
                  color={isModern ? modernPalette.accent : colors.primary}
                />
              </View>
              <Text
                style={[
                  styles.contextPillText,
                  {color: isModern ? modernPalette.accent : colors.primary},
                ]}
                numberOfLines={1}
              >
                Temporary Chat · Not saved in history
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.contextPill,
                {
                  backgroundColor: isModern
                    ? modernPalette.card
                    : colors.surface,
                  borderColor: isModern ? modernPalette.border : colors.border,
                },
              ]}
            >
              <Text
                style={[styles.contextPillText, themed.headerSubtitle]}
                numberOfLines={1}
              >
                {chatTitle}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Messages List */}
      <Animated.View style={[styles.messagesList, {opacity: listOpacity}]}>
        <FlatList
          ref={flatListRef}
          data={displayedMessages}
          inverted={displayedMessages.length > 0}
          maintainVisibleContentPosition={{minIndexForVisible: 0}}
          initialNumToRender={12}
          maxToRenderPerBatch={6}
          windowSize={7}
          // Switching the reply format or chat mode redraws replies/empty state.
          extraData={`${replyFormat}:${isOnlineMode}:${isTemporaryChat}:${isUstpChat}:${studentName}:${modernTheme}:${isDarkMode}:${perfOn ? Object.keys(timingLabels)[0] ?? "" : ""}`}
          keyExtractor={flatListKeyExtractor}
          style={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={16}
          onScroll={handleListScroll}
          onScrollBeginDrag={handleListScrollBeginDrag}
          renderItem={flatListRenderItem}
          contentContainerStyle={listContentContainerStyle}
          ListFooterComponent={renderListFooter}
          ListEmptyComponent={renderListEmpty}
          ListHeaderComponent={renderListHeader}
          onContentSizeChange={handleListContentSizeChange}
          onLayout={handleListLayout}
          testID="chat-messages-list"
        />
      </Animated.View>

      {chatMultiBatch ? (
        <View style={styles.reviewContainer}>
          <MultiActionCard
            batch={chatMultiBatch}
            busy={chatMultiBusy}
            onConfirmAll={() => {
              void handleConfirmChatMultiAll();
            }}
            onCancelAll={handleCancelChatMultiAll}
            onCancelItem={handleCancelChatMultiItem}
            onRetryItem={itemId => {
              void handleRetryChatMultiItem(itemId);
            }}
            onDismiss={() => setChatMultiBatch(null)}
            onEditItemTitle={handleEditChatMultiItemTitle}
            onEditItemFields={handleEditChatMultiItemFields}
          />
        </View>
      ) : review.proposal ? (
        <View style={styles.reviewContainer}>
          <CommandReviewCard
            proposal={review.proposal}
            expired={review.expired}
            busy={review.busy}
            onEdit={handleEditReview}
            onDeliveryChange={review.setDelivery}
            editError={review.editError}
            onConfirm={() => {
              void handleConfirmReview();
            }}
            onCancel={handleCancelReview}
            onDismiss={review.dismiss}
            testIDPrefix="chat-review"
          />
        </View>
      ) : null}

      {undoOffer ? (
        <View style={styles.reviewContainer}>
          <UndoSnackbar
            offer={undoOffer}
            onUndo={handleUndo}
            onHide={hideUndo}
            testID="chat-undo"
          />
        </View>
      ) : null}

      {skillOffer && onOpenSkill ? (
        <View style={[styles.reviewContainer, styles.skillOfferRow]}>
          <TouchableOpacity
            style={[styles.skillOfferButton, {backgroundColor: colors.primary}]}
            onPress={() => {
              const launch = skillOffer;
              setSkillOffer(null);
              onOpenSkill(launch);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open ${skillTitle(skillOffer.skill)}`}
            testID="chat-skill-open"
          >
            <Text
              style={[styles.skillOfferText, {color: colors.textOnPrimary}]}
            >
              {`Open ${skillTitle(skillOffer.skill)}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skillOfferDismiss}
            onPress={() => setSkillOffer(null)}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            testID="chat-skill-dismiss"
          >
            <Text style={{color: colors.textSecondary}}>Not now</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Bottom Input */}
      <ChatComposer
        userId={userId}
        isSending={isSending}
        isOnlineMode={isOnlineMode}
        isUstpChat={isUstpChat}
        schoolEnabled={schoolEnabled}
        onSendText={handleComposerSend}
        onCallLafina={handleComposerCall}
        onOpenFormatPicker={handleComposerOpenPicker}
        onInputFocus={handleComposerFocus}
      />

      {/* Attachment & Create Picker Sheet (Gemini-style) */}
      <ScreenOverlays>
        {formatPickerOpen ? (
          <ToolSheet
            visible
            title="Add to conversation"
            onClose={() => setFormatPickerOpen(false)}
          >
            <Text style={[styles.sectionHeader, themed.sectionHeader]}>
              Photos & Schedule
            </Text>

            <TouchableOpacity
              style={[styles.formatOption, themed.formatOption]}
              onPress={() => {
                void handleScanCamera();
              }}
              accessibilityRole="button"
              accessibilityLabel="Take photo with camera"
              testID="chat-attach-camera"
            >
              <Camera size={20} color={colors.primary} />
              <View style={styles.formatOptionText}>
                <Text
                  style={[styles.formatOptionTitle, themed.formatOptionTitle]}
                >
                  Camera
                </Text>
                <Text
                  style={[
                    styles.formatOptionSubtitle,
                    themed.formatOptionSubtitle,
                  ]}
                >
                  Scan timetable, syllabus, or notes
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.formatOption, themed.formatOption]}
              onPress={() => {
                void handleScanGallery();
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose from photos"
              testID="chat-attach-gallery"
            >
              <ImageIcon size={20} color={colors.primary} />
              <View style={styles.formatOptionText}>
                <Text
                  style={[styles.formatOptionTitle, themed.formatOptionTitle]}
                >
                  Photos & Screenshots
                </Text>
                <Text
                  style={[
                    styles.formatOptionSubtitle,
                    themed.formatOptionSubtitle,
                  ]}
                >
                  Import schedule image from gallery
                </Text>
              </View>
            </TouchableOpacity>
          </ToolSheet>
        ) : null}

        {historyVisible ? (
          <ChatHistorySheet
            visible
            userId={userId}
            currentSessionId={currentChatId}
            isTemporaryChat={isTemporaryChat}
            busy={isSending}
            onClose={() => setHistoryVisible(false)}
            onChanged={showCurrentChat}
            onStartUstpChat={handleStartUstpChat}
            ustpAvailable={schoolEnabled}
            onStartTemporaryChat={handleStartTemporaryFromSidebar}
            onScanCamera={() => {
              setHistoryVisible(false);
              if (ensureGeneralSessionForTool()) void handleScanCamera();
            }}
            onScanGallery={() => {
              setHistoryVisible(false);
              if (ensureGeneralSessionForTool()) void handleScanGallery();
            }}
            onOpenGuide={() => {
              setHistoryVisible(false);
              setGuideVisible(true);
            }}
          />
        ) : null}

        {/* AGY-PORT 06: an example only fills the draft; unsent text is kept unless replaced. */}
        {guideVisible ? (
          <CommandGuide
            visible
            onClose={() => setGuideVisible(false)}
            onSelect={command => {
              setGuideVisible(false);
              draft.offerText(command, undefined, {
                title: 'Replace your draft?',
                message:
                  'Keep your current text, or replace it with this example. Nothing will be sent.',
              });
            }}
          />
        ) : null}

        {engineSheetVisible ? (
          <ChatEngineSheet
            visible
            onClose={() => setEngineSheetVisible(false)}
            userId={userId}
            isOnlineMode={isOnlineMode}
            onToggleOnline={async () => {
              await handleToggleOnline();
              await refreshModelAndProfileState(true);
            }}
            selectedModelId={selectedOfflineModelId}
            modelsStatus={modelsStatus}
            onModelsUpdated={() => refreshModelAndProfileState(true)}
            deviceRecommendation={deviceRecommendation}
          />
        ) : null}

        {draft.dialog ? (
          <DraftDecisionDialog
            request={draft.dialog}
            testIDPrefix="chat-draft"
          />
        ) : null}

        {endTempConfirmVisible ? (
          <EndTemporaryChatModal
            visible
            messageCount={tempMessages.length}
            onCancel={() => setEndTempConfirmVisible(false)}
            onConfirm={handleConfirmEndTemporaryChat}
          />
        ) : null}
      </ScreenOverlays>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  reviewContainer: {
    paddingHorizontal: Spacing.lg,
  },
  skillOfferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  skillOfferButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    justifyContent: 'center',
  },
  skillOfferText: {
    fontWeight: '600',
  },
  skillOfferDismiss: {
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  noticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  noticeText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
  },
  noticeAction: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
  },
  noticeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  loadEarlierButton: {
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  loadEarlierText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
  },
  messagesList: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modernHeader: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerCircleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  centerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  centerPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  centerPillText: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    includeFontPadding: false,
    textAlignVertical: 'center',
    flexShrink: 1,
  },
  centerPillChevron: {
    height: 17,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  contextStrip: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    maxWidth: '90%',
  },
  contextPillIcon: {
    height: 15,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  contextPillText: {
    fontFamily: Fonts.heading,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
    includeFontPadding: false,
    textAlignVertical: 'center',
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  listContent: {
    paddingVertical: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  emptyContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  greetingBlock: {
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  greetingEyebrow: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  greetingTitle: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  mascotStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  mascotImage: {
    width: 176,
    height: 176,
  },
  mascotModeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  mascotModeTagText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBottomSection: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    gap: 10,
  },
  sampleGrid: {
    width: '100%',
    gap: 10,
  },
  sampleGridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sampleCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 13,
    minHeight: 54,
  },
  sampleCardIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleCardText: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 17.5,
  },
  ustpCompactLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 2,
  },
  ustpCompactLinkText: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
  },
  ustpOnlineBanner: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  ustpOnlineBannerText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  sheetHint: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  formatOptionText: {
    flex: 1,
  },
  formatOptionTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: 'bold',
  },
  formatOptionSubtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    marginTop: 2,
  },
  sectionHeader: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modernNoticeCard: {
    borderRadius: ModernLayout.borderRadiusCard,
  },
  modernUstpBanner: {
    borderRadius: ModernLayout.borderRadiusSubCard,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  sectionHeader: {
    color: colors.textSecondary,
  },
  container: {
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
  },
  headerCircleButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  headerTitle: {
    color: colors.textPrimary,
  },
  headerSubtitle: {
    color: colors.textSecondary,
  },
  headerButton: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  emptySubtitle: {
    color: colors.textSecondary,
  },
  onlineToggleText: {
    color: colors.textSecondary,
  },
  sheetHint: {
    color: colors.textSecondary,
  },
  formatOption: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  formatOptionActive: {
    borderColor: colors.red,
  },
  formatOptionTitle: {
    color: colors.textPrimary,
  },
  formatOptionSubtitle: {
    color: colors.textSecondary,
  },
});
