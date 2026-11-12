import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
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
import {
  PanelLeft,
  Bot,
  BookOpen,
  Camera,
  Image as ImageIcon,
  Sparkles,
  MessageCircleDashed,
  Lightbulb,
  Phone,
} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../theme';
import {useTheme} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {ThemeColors} from '../contexts/ThemeContext';
import {
  CHAT_PAGE_SIZE,
  chatStore,
  isUstpSessionId,
  type ChatAttachment,
  type ChatMessage,
} from '../../storage/chatStore';
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
import {chatOrchestrator} from '../../ai/chatOrchestrator';
import {ChatMessageItem} from '../components/chat/ChatMessageItem';
import {ChatHistorySheet} from '../components/chat/ChatHistorySheet';
import {
  ChatInput,
  SUGGESTED_PROMPTS,
  USTP_SUGGESTED_PROMPTS,
} from '../components/chat/ChatInput';
import {TypingBubble} from '../components/chat/TypingBubble';
import {CommandReviewCard} from '../components/chat/CommandReviewCard';
import {CommandGuide} from '../components/chat/CommandGuide';
import {useCommandReview} from '../hooks/useCommandReview';
import type {ReviewEditPatch} from '../../ai/nlu/commandReview';
import {useDraftProtection} from '../hooks/useDraftProtection';
import {useChatReplyFormat} from '../hooks/useChatReplyFormat';
import {DraftDecisionDialog} from '../components/DraftDecisionDialog';
import {chatDraftStore} from '../drafts/chatDraftStore';
import {shareAttachment} from '../components/chat/chatFiles';
import {ToolSheet} from '../components/tools';
import {MultiActionCard} from '../components/callLafina/cards/MultiActionCard';
import {actionService} from '../../ai/voiceActions/actionService';
import type {
  MultiActionBatchData,
  MultiActionItemData,
} from '../../ai/voiceActions/types';

/** How often a reply that is still arriving repaints (about 20 times a second). */
const STREAM_REPAINT_MS = 50;

export interface ChatScreenProps {
  userId: string;
  refreshTrigger?: number;
  onRefresh?: () => void;
  onCallLafina?: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  userId,
  refreshTrigger = 0,
  onRefresh,
  onCallLafina,
}) => {
  const [initialPage] = useState(() => {
    try {
      return chatStore.getMessagesPage(userId);
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialPage?.items ?? [],
  );
  const [olderCursor, setOlderCursor] = useState<string | null>(
    initialPage?.nextCursor ?? null,
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
  const [historyVisible, setHistoryVisible] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [tempMessages, setTempMessages] = useState<ChatMessage[]>([]);
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
  const hasInitialMessages = (initialPage?.items.length ?? 0) > 0;
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
  const listOpacity = useRef(
    new Animated.Value(hasInitialMessages ? 0 : 1),
  ).current;
  const revealRafRef = useRef<number | null>(null);
  const fallbackRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // AGY-PORT 05: the composer draft lives in an owner-bound memory store, so tab
  // switches, tool sheets and the Voice handoff never lose it.
  const [inputText, setInputTextState] = useState(() =>
    chatDraftStore.get(userId),
  );
  const setInputText = useCallback(
    (text: string) => {
      chatDraftStore.set(userId, text);
      setInputTextState(text);
    },
    [userId],
  );
  // The text a waiting review came from; Cancel puts it back in an empty composer.
  const reviewSourceRef = useRef<{operationId: string; text: string} | null>(
    null,
  );
  const [isSending, setIsSending] = useState(false);
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
  const [isOnlineMode, setIsOnlineMode] = useState(() =>
    readInitialOnlineMode(userId),
  );
  const isUstpChat = !isTemporaryChat && isUstpSessionId(currentChatId);
  const [handbookNotes, setHandbookNotes] = useState<Record<string, string>>(
    {},
  );
  const [formatPickerOpen, setFormatPickerOpen] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const [currentHeight, setCurrentHeight] = useState(() =>
    Math.max(0, Dimensions.get('window').height - (insets.top + 6)),
  );
  const maxHeightRef = useRef<number>(currentHeight);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  // AGY-PORT 04: planner changes wait on this card until Confirm.
  const review = useCommandReview(userId, 'chat');

  // AGY-PORT 05: Android back with unsent text asks first (default keeps it).
  const draft = useDraftProtection(
    userId,
    inputText,
    false,
    () => setInputText(''),
    next => setInputText(next),
  );
  const {requestLeave, hasDraft} = draft;

  useEffect(() => {
    setInputTextState(chatDraftStore.get(userId));
    reviewSourceRef.current = null;
    return chatDraftStore.subscribe((owner, text) => {
      if (owner === userId) setInputTextState(text);
    });
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
  const tabBarClearance = tabBarBottomOffset + Layout.navbarHeight + 8;

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
      flatListRef.current?.scrollToEnd({animated: false});
      listOpacity.setValue(1);
    }, 200);
  }, [listOpacity]);

  useEffect(() => {
    if (hasInitialMessages) {
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
      listOpacity.setValue(0);
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
    flatListRef.current?.scrollToEnd({animated: false});
    const commitReveal = () => {
      revealRafRef.current = null;
      flatListRef.current?.scrollToEnd({animated: false});
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
      const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
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
          flatListRef.current?.scrollToEnd({animated: false});
          if (layoutReadyRef.current) {
            finishInitialScroll();
          }
        }
        return;
      }
      if (Date.now() < initialSettleUntilRef.current) {
        flatListRef.current?.scrollToEnd({animated: false});
        return;
      }
      if (isNearBottomRef.current) {
        flatListRef.current?.scrollToEnd({animated: true});
      }
    },
    [finishInitialScroll],
  );

  const handleListLayout = useCallback(
    (event: {nativeEvent: {layout: {height: number}}}) => {
      if (event.nativeEvent.layout.height <= 0) return;
      layoutReadyRef.current = true;
      if (needsInitialScrollRef.current) {
        flatListRef.current?.scrollToEnd({animated: false});
        if (contentReadyRef.current) {
          finishInitialScroll();
        }
        return;
      }
      if (isNearBottomRef.current) {
        flatListRef.current?.scrollToEnd({animated: false});
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
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
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
    (options?: {replace?: boolean}) => {
      try {
        const page = chatStore.getMessagesPage(userId);
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
      } catch (error) {
        if (options?.replace) {
          beginInitialScroll(false);
          setMessages([]);
        }
        console.error('[ChatScreen] Could not load conversation:', error);
        setLoadError(
          'Your conversation could not be loaded right now. Nothing was deleted.',
        );
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
      setMessages(current => [
        ...page.items.filter(
          item => !current.some(existing => existing.id === item.id),
        ),
        ...current,
      ]);
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
    messagesLengthRef.current = 0;
    setIsTemporaryChat(false);
    setTempMessages([]);
    setMessages([]);
    setOlderCursor(null);
    setHandbookNotes({});
    setLoadError(null);
    setCurrentChatId(readCurrentChat());
    setHistoryVisible(false);
    setLegacyHiddenCount(chatStore.getLegacyQuarantineSummary().messageCount);
    setLegacyNoticeDismissed(
      localSettingsStore.get(userId, 'chat.legacyNoticeDismissed', null) ===
        'true',
    );
    beginInitialScroll(false);
  }, [userId, readCurrentChat, beginInitialScroll]);

  useEffect(() => {
    loadMessages();
  }, [userId, loadMessages, refreshTrigger]);

  // Automatically detect Wi-Fi / data connection and sync online mode
  useEffect(() => {
    let active = true;

    const syncConnectivity = async (
      isConnected: boolean | null,
      isInternetReachable: boolean | null,
    ) => {
      if (!active) return;
      const isDeviceConnected = Boolean(
        isConnected && isInternetReachable !== false,
      );
      const optedIn = () =>
        localSettingsStore.get(userId, 'chat.onlineMode', null) === 'true';

      // Online Mode is opt-in: connectivity alone never turns it on.
      if (!optedIn()) {
        return;
      }

      if (isDeviceConnected) {
        const auth = await accountLinkService.authorizeOnlineMode(userId);
        // The student may have switched Online Mode off while this was pending.
        if (active && auth.status === 'success' && optedIn()) {
          setIsOnlineMode(true);
        }
      } else if (active) {
        setIsOnlineMode(false);
      }
    };

    void NetInfo.fetch()
      .then(state => {
        if (!active) return;
        void syncConnectivity(
          state.isConnected,
          state.isInternetReachable,
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
    setIsTemporaryChat(false);
    setTempMessages([]);
    setCurrentChatId(readCurrentChat());
    setHandbookNotes({});
    setOlderCursor(null);
    setLoadError(null);
    loadMessages({replace: true});
    refreshChatTitle();
  }, [loadMessages, readCurrentChat, refreshChatTitle]);

  const ensureGeneralSessionForTool = () => {
    if (!isTemporaryChat && !isUstpChat) return;
    setIsTemporaryChat(false);
    setTempMessages([]);
    try {
      chatStore.startNewChat(userId, 'general');
      showCurrentChat();
    } catch (error) {
      console.error('[ChatScreen] Could not switch to general chat:', error);
    }
  };

  const handleStartUstpChat = () => {
    if (isSending) return;
    setHistoryVisible(false);
    setIsTemporaryChat(false);
    setTempMessages([]);
    try {
      chatStore.startNewUstpChat(userId);
    } catch (error) {
      console.error('[ChatScreen] Could not start Ask USTP chat:', error);
      Alert.alert(
        'Could Not Start',
        'Could not open Ask LAFINA about USTP right now.',
      );
      return;
    }
    showCurrentChat();
  };

  const handleStartTemporaryFromSidebar = () => {
    if (isSending) return;
    setHistoryVisible(false);
    setIsTemporaryChat(true);
    setTempMessages([]);
    beginInitialScroll(false);
  };

  const onlineToggleTicket = useRef(0);
  const handleToggleOnline = async (): Promise<boolean> => {
    // Any tap (on or off) supersedes a pending enable from an earlier tap.
    const ticket = ++onlineToggleTicket.current;
    if (isOnlineMode) {
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
    setIsOnlineMode(true);
    return true;
  };

  const handleOpenFormatPicker = () => {
    setFormatPickerOpen(true);
  };

  const handleScanCamera = async () => {
    setFormatPickerOpen(false);
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

      await handleSend(`Scan schedule:\n\n${ocrResult.rawText}`);
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

      await handleSend(`Scan schedule:\n\n${ocrResult.rawText}`);
    } catch (err: any) {
      setIsSending(false);
      Alert.alert(
        'Image Scan Failed',
        err?.message || 'Could not process image.',
      );
    }
  };

  const handleOpenAttachment = async (attachment: ChatAttachment) => {
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
  };

  const handleSend = async (overrideText?: string) => {
    const query = (overrideText || inputText).trim();
    if (!query || isSending) return;

    const requestUser = userId;
    setInputText('');
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
    if (isTemporaryChat) {
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
    const onReplyText = (replySoFar: string) => {
      latestText = replySoFar;
      if (!shownFirst) {
        // The question is saved before the reply starts; show it above.
        shownFirst = true;
        if (!isTemporaryChat) {
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
        useHandbook: isUstpChat,
        ustpRagOnly: isUstpChat,
        onReplyText,
        temporaryChat: isTemporaryChat,
        temporaryHistory: isTemporaryChat
          ? userTempMsg
            ? [...tempMessages, userTempMsg]
            : tempMessages
          : undefined,
      });
      // If the account changed while the reply was pending, the reply was saved
      // for the account that sent it and must not appear in this one.
      if (activeUserRef.current !== requestUser) return;
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
        reviewSourceRef.current = null;
        review.dismiss();
      } else {
        setChatMultiBatch(null);
        if (result.review?.status === 'proposal') {
          reviewSourceRef.current = {
            operationId: result.review.proposal.operationId,
            text: query,
          };
        }
        review.present(result.review);
      }
      if (isTemporaryChat) {
        setTempMessages(prev => [...prev, result.assistantMessage]);
      } else {
        loadMessages();
        refreshChatTitle();
      }
      onRefresh?.();
    } catch (err) {
      console.error('[ChatScreen] Error processing chat message:', err);
      // Nothing was answered: give the text back unless the student typed more.
      if (
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

  const handleConfirmReview = async () => {
    const requestUser = userId;
    try {
      const decision = await review.confirm();
      if (!decision || activeUserRef.current !== requestUser) return;
      loadMessages();
      onRefresh?.();
    } catch (err) {
      console.error('[ChatScreen] Error confirming a reviewed command:', err);
    }
  };

  const handleCancelReview = () => {
    const cancelled = review.proposal;
    if (!review.cancel()) return;
    // AGY-PORT 05: cancelling keeps the text editable; nothing was saved.
    const source = reviewSourceRef.current;
    if (
      cancelled &&
      source?.operationId === cancelled.operationId &&
      !inputText.trim()
    ) {
      setInputText(source.text);
    }
    reviewSourceRef.current = null;
    loadMessages();
  };

  const handleEditReview = (patch: ReviewEditPatch) => {
    const previousId = review.proposal?.operationId;
    const edited = review.edit ? review.edit(patch) : null;
    if (
      edited?.status === 'proposal' &&
      previousId &&
      reviewSourceRef.current?.operationId === previousId
    ) {
      reviewSourceRef.current = {
        operationId: edited.proposal.operationId,
        text: reviewSourceRef.current.text,
      };
    }
    return edited;
  };

  const handleConfirmChatMultiAll = async () => {
    if (!chatMultiBatch || chatMultiBusy) return;
    setChatMultiBusy(true);
    try {
      const {batch, spokenSummary} = await actionService.confirmMultiActionBatch(
        userId,
        chatMultiBatch,
      );
      setChatMultiBatch(batch);
      chatStore.addMessage(
        userId,
        'assistant',
        spokenSummary,
        null,
        {localReply: true},
        readCurrentChat(),
      );
      loadMessages();
      onRefresh?.();
    } catch (err) {
      console.warn('[ChatScreen] Multi-action confirm failed:', err);
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
    setChatMultiBusy(true);
    try {
      const {batch} = await actionService.confirmMultiActionBatch(
        userId,
        chatMultiBatch,
        itemId,
      );
      setChatMultiBatch(batch);
      loadMessages();
      onRefresh?.();
    } catch (err) {
      console.warn('[ChatScreen] Multi-action item retry failed:', err);
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
    if (!chatMultiBatch) return;
    setChatMultiBatch({
      ...chatMultiBatch,
      revision: chatMultiBatch.revision + 1,
      items: chatMultiBatch.items.map(item =>
        item.id === itemId ? {...item, ...patch} : item,
      ),
    });
  };

  const dismissLegacyNotice = () => {
    setLegacyNoticeDismissed(true);
    localSettingsStore.set(userId, 'chat.legacyNoticeDismissed', 'true');
  };

  const renderListHeader = () => (
    <View>
      {legacyHiddenCount > 0 && !legacyNoticeDismissed ? (
        <View
          style={[styles.noticeCard, themed.headerButton]}
          testID="chat-legacy-notice"
        >
          <Text style={[styles.noticeText, themed.emptySubtitle]}>
            Some chat history saved before accounts were kept separate could not
            be matched to a single account. It is still stored on this device,
            hidden from every account, and nothing was deleted.
          </Text>
          <TouchableOpacity
            onPress={dismissLegacyNotice}
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
          style={[styles.noticeCard, themed.headerButton]}
          testID="chat-load-error"
        >
          <Text style={[styles.noticeText, themed.emptySubtitle]}>
            {loadError}
          </Text>
          <TouchableOpacity
            onPress={() => (olderCursor ? handleLoadEarlier() : loadMessages())}
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
          style={[styles.loadEarlierButton, themed.headerButton]}
          onPress={handleLoadEarlier}
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
  );

  const renderEmptyState = () => {
    if (isUstpChat) {
      return (
        <View style={styles.emptyContainer} testID="chat-empty-state">
          <View
            style={[
              styles.emptyIconBadge,
              {backgroundColor: colors.primary + '18'},
            ]}
            testID="chat-ustp-empty-badge"
          >
            <BookOpen size={34} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, themed.emptyTitle]}>
            Ask LAFINA anything about USTP
          </Text>
          <Text style={[styles.emptySubtitle, themed.emptySubtitle]}>
            Get citation-backed answers from the USTP Student Handbook on
            grading, Dean's List honors, retention, and policies.
          </Text>
          {!isOnlineMode && (
            <TouchableOpacity
              style={[
                styles.ustpOnlineBanner,
                {
                  backgroundColor: colors.primary + '14',
                  borderColor: colors.primary + '44',
                },
              ]}
              onPress={() => {
                void handleToggleOnline();
              }}
              accessibilityRole="button"
              accessibilityLabel="Enable Online Mode for USTP Handbook lookup"
              testID="chat-ustp-enable-online"
              activeOpacity={0.75}
            >
              <Text style={[styles.ustpOnlineBannerText, {color: colors.primary}]}>
                Online Mode is off · Tap to enable USTP lookup
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.emptySuggestionsWrapper}>
            {USTP_SUGGESTED_PROMPTS.map((prompt, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.emptySuggestionPill, themed.headerButton]}
                onPress={() => handleSend(prompt)}
                accessibilityRole="button"
                accessibilityLabel={prompt}
                testID={`chat-ustp-prompt-chip-${index}`}
                activeOpacity={0.7}
              >
                <BookOpen size={14} color={colors.primary} />
                <Text
                  style={[
                    styles.emptySuggestionText,
                    themed.emptySuggestionText,
                  ]}
                  numberOfLines={2}
                >
                  {prompt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer} testID="chat-empty-state">
        <View
          style={[
            styles.emptyIconBadge,
            {backgroundColor: colors.primary + '18'},
          ]}
        >
          {isTemporaryChat ? (
            <MessageCircleDashed size={32} color={colors.primary} />
          ) : (
            <Bot size={36} color={colors.primary} />
          )}
        </View>
        <Text style={[styles.emptyTitle, themed.emptyTitle]}>
          {isTemporaryChat ? 'Temporary Chat' : 'LAFINA Academic Assistant'}
        </Text>
        {isTemporaryChat && (
          <Text style={[styles.emptySubtitle, themed.emptySubtitle]}>
            Messages in this chat are not saved in history and will disappear
            when you leave.
          </Text>
        )}
        <View style={styles.emptySuggestionsWrapper}>
          {SUGGESTED_PROMPTS.map((prompt, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.emptySuggestionPill, themed.headerButton]}
              onPress={() => handleSend(prompt)}
              accessibilityRole="button"
              accessibilityLabel={prompt}
              testID={`chat-prompt-chip-${index}`}
              activeOpacity={0.7}
            >
              <Sparkles size={14} color={colors.primary} />
              <Text
                style={[styles.emptySuggestionText, themed.emptySuggestionText]}
                numberOfLines={2}
              >
                {prompt}
              </Text>
            </TouchableOpacity>
          ))}
          {!isTemporaryChat && (
            <TouchableOpacity
              style={[
                styles.ustpEntryPill,
                {
                  backgroundColor: colors.primary + '12',
                  borderColor: colors.primary + '44',
                },
              ]}
              onPress={handleStartUstpChat}
              accessibilityRole="button"
              accessibilityLabel="Ask LAFINA anything about USTP"
              testID="chat-switch-to-ustp-button"
              activeOpacity={0.75}
            >
              <BookOpen size={15} color={colors.primary} />
              <Text
                style={[styles.ustpEntryText, {color: colors.primary}]}
                numberOfLines={1}
              >
                Ask LAFINA anything about USTP
              </Text>
              <Text style={[styles.ustpEntryTag, {color: colors.primary}]}>
                RAG
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

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
        setCurrentHeight(h);
      }}
      testID="chat-screen-container"
    >
      {/* Top Header */}
      <View style={[styles.header, themed.header]}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity
            style={[
              styles.headerBadge,
              {backgroundColor: colors.primary + '18'},
            ]}
            onPress={() => setHistoryVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open chats, USTP Handbook, and tools sidebar"
            testID="chat-history-button"
          >
            <PanelLeft size={16} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text
              style={[styles.headerTitle, themed.headerTitle]}
              numberOfLines={1}
            >
              {isTemporaryChat ? 'Temporary Chat' : chatTitle}
            </Text>
            <View style={styles.headerSubtitleRow}>
              {isUstpChat ? (
                <View
                  style={[styles.handbookChip, styles.handbookChipActive]}
                  testID="chat-ustp-mode-badge"
                >
                  <BookOpen size={10} color={colors.primary} />
                  <Text
                    style={[
                      styles.handbookChipText,
                      themed.handbookToggleTextActive,
                    ]}
                  >
                    USTP Handbook RAG
                  </Text>
                </View>
              ) : (
                <Text
                  style={[styles.headerSubtitle, themed.headerSubtitle]}
                  numberOfLines={1}
                >
                  {isTemporaryChat
                    ? 'Not saved in history'
                    : isOnlineMode
                    ? 'Online AI'
                    : 'Offline Secretary'}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
          {onCallLafina && (
            <TouchableOpacity
              style={[styles.headerIconButton, themed.headerButton]}
              onPress={onCallLafina}
              accessibilityRole="button"
              accessibilityLabel="Call Lafina"
              testID="chat-call-lafina-button"
            >
              <Phone size={15} color={colors.primary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.headerIconButton,
              themed.headerButton,
              isTemporaryChat && {
                backgroundColor: colors.primary + '20',
                borderColor: colors.primary,
              },
            ]}
            onPress={() => {
              if (isTemporaryChat) {
                Alert.alert(
                  'End Temporary Chat?',
                  'This temporary conversation will be cleared and your saved chats restored.',
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {
                      text: 'End',
                      style: 'destructive',
                      onPress: () => {
                        setIsTemporaryChat(false);
                        setTempMessages([]);
                        showCurrentChat();
                      },
                    },
                  ],
                );
              } else {
                setIsTemporaryChat(true);
                setTempMessages([]);
                beginInitialScroll(false);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={
              isTemporaryChat
                ? 'Turn off temporary chat'
                : 'Turn on temporary chat'
            }
            testID="chat-temporary-toggle-button"
          >
            <MessageCircleDashed
              size={15}
              color={isTemporaryChat ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerIconButton, themed.headerButton]}
            onPress={() => setGuideVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Show what you can ask"
            testID="chat-guide-button"
          >
            <Lightbulb size={15} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.onlineToggle,
              themed.headerButton,
              isOnlineMode && styles.onlineToggleActive,
            ]}
            onPress={() => {
              void handleToggleOnline();
            }}
            accessibilityRole="button"
            accessibilityLabel={
              isOnlineMode ? 'Switch to Offline Mode' : 'Switch to Online Mode'
            }
            testID="chat-online-toggle-button"
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isOnlineMode
                    ? colors.white
                    : colors.textSecondary,
                },
              ]}
            />
            <Text
              style={[
                styles.onlineToggleText,
                themed.onlineToggleText,
                isOnlineMode && styles.onlineToggleTextActive,
              ]}
            >
              {isOnlineMode ? 'Online' : 'Offline'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages List */}
      <Animated.View style={[styles.messagesList, {opacity: listOpacity}]}>
        <FlatList
          ref={flatListRef}
          data={isTemporaryChat ? tempMessages : messages}
          initialNumToRender={CHAT_PAGE_SIZE}
          // Switching the reply format in Profile redraws replies already shown.
          extraData={replyFormat}
          keyExtractor={item => item.id}
          style={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={16}
          onScroll={handleListScroll}
          onScrollBeginDrag={() => {
            needsInitialScrollRef.current = false;
            initialSettleUntilRef.current = 0;
          }}
          renderItem={({item}) => (
            <ChatMessageItem
              item={item}
              replyFormat={replyFormat}
              handbookNote={item.handbookNote ?? handbookNotes[item.id]}
              onUndoMemory={handleUndoMemory}
              onOpenAttachment={handleOpenAttachment}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            (isTemporaryChat ? tempMessages.length : messages.length) === 0 &&
              styles.listContentEmpty,
          ]}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={loadError ? null : renderEmptyState}
          ListFooterComponent={
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
            ) : null
          }
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

      {/* Bottom Input */}
      <ChatInput
        inputText={inputText}
        setInputText={setInputText}
        onSend={text => handleSend(text)}
        isSending={isSending}
        isOnlineMode={isOnlineMode}
        onOpenFormatPicker={
          isUstpChat
            ? undefined
            : () => {
                void handleOpenFormatPicker();
              }
        }
        onSelectPrompt={prompt => handleSend(prompt)}
        showSuggestions={false}
        placeholderOverride={
          isUstpChat ? 'Ask anything about the USTP Handbook…' : undefined
        }
        onFocus={() => {
          setIsKeyboardVisible(true);
          needsInitialScrollRef.current = false;
          initialSettleUntilRef.current = 0;
          isNearBottomRef.current = true;
          setTimeout(
            () => flatListRef.current?.scrollToEnd({animated: true}),
            100,
          );
        }}
      />

      {/* Attachment & Create Picker Sheet (Gemini-style) */}
      <ToolSheet
        visible={formatPickerOpen}
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
            <Text style={[styles.formatOptionTitle, themed.formatOptionTitle]}>
              Camera
            </Text>
            <Text
              style={[styles.formatOptionSubtitle, themed.formatOptionSubtitle]}
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
            <Text style={[styles.formatOptionTitle, themed.formatOptionTitle]}>
              Photos & Screenshots
            </Text>
            <Text
              style={[styles.formatOptionSubtitle, themed.formatOptionSubtitle]}
            >
              Import schedule image from gallery
            </Text>
          </View>
        </TouchableOpacity>

      </ToolSheet>

      <ChatHistorySheet
        visible={historyVisible}
        userId={userId}
        currentSessionId={currentChatId}
        isTemporaryChat={isTemporaryChat}
        busy={isSending}
        onClose={() => setHistoryVisible(false)}
        onChanged={showCurrentChat}
        onStartUstpChat={handleStartUstpChat}
        onStartTemporaryChat={handleStartTemporaryFromSidebar}
        onScanCamera={() => {
          setHistoryVisible(false);
          ensureGeneralSessionForTool();
          void handleScanCamera();
        }}
        onScanGallery={() => {
          setHistoryVisible(false);
          ensureGeneralSessionForTool();
          void handleScanGallery();
        }}
        onOpenGuide={() => {
          setHistoryVisible(false);
          setGuideVisible(true);
        }}
      />

      {/* AGY-PORT 06: an example only fills the draft; unsent text is kept unless replaced. */}
      <CommandGuide
        visible={guideVisible}
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

      <DraftDecisionDialog request={draft.dialog} testIDPrefix="chat-draft" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  reviewContainer: {
    paddingHorizontal: Spacing.lg,
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
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 8,
  },
  headerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  headerSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
  },
  handbookChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  handbookChipActive: {
    borderColor: '#D32F2F',
    backgroundColor: '#D32F2F12',
  },
  handbookChipText: {
    fontFamily: Fonts.body,
    fontSize: 10,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  headerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineToggleActive: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  onlineToggleText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  onlineToggleTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingVertical: 12,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptySuggestionsWrapper: {
    width: '100%',
    maxWidth: 420,
    gap: 10,
    alignSelf: 'center',
  },
  emptySuggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
  },
  emptySuggestionText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 18,
  },
  ustpEntryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
  },
  ustpEntryText: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
  },
  ustpEntryTag: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
  },
  ustpOnlineBanner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
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
  onlineToggleText: {
    color: colors.textSecondary,
  },
  handbookChip: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  handbookChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '14',
  },
  handbookChipTextActive: {
    color: colors.primary,
  },
  handbookChipTextInactive: {
    color: colors.textSecondary,
  },
  handbookToggleActive: {
    borderColor: colors.red,
  },
  handbookToggleTextActive: {
    color: colors.red,
  },
  emptyTitle: {
    color: colors.textPrimary,
  },
  emptySubtitle: {
    color: colors.textSecondary,
  },
  emptySuggestionText: {
    color: colors.textPrimary,
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
