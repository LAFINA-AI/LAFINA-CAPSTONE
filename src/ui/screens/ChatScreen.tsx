import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  AppState,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Dimensions,
  BackHandler,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import {
  Trash2,
  Sparkles,
  Bot,
  BookOpen,
  FileSpreadsheet,
  FileText,
  Presentation,
  AudioLines,
  Lightbulb,
} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../theme';
import {useTheme} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {ThemeColors} from '../contexts/ThemeContext';
import {
  chatStore,
  type ChatAttachment,
  type ChatMessage,
} from '../../storage/chatStore';
import {mergeChatPages} from './chat/chatPaging';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {accountLinkService} from '../../cloud';
import {createCallSpeechProvider} from '../../cloud/speechService';
import type {CallSpeechProvider} from '../../scheduler/speechProvider';
import {
  DOCUMENT_FORMAT_ORDER,
  DOCUMENT_FORMATS,
  type DocumentFormat,
} from '../../skills/documentSkill';
import {handbookPreference} from '../../skills/onlineChatSkill';
import {chatOrchestrator} from '../../ai/chatOrchestrator';
import {ChatMessageItem} from '../components/chat/ChatMessageItem';
import {ChatInput} from '../components/chat/ChatInput';
import {TypingBubble} from '../components/chat/TypingBubble';
import {CommandReviewCard} from '../components/chat/CommandReviewCard';
import {CommandGuide} from '../components/chat/CommandGuide';
import {useCommandReview} from '../hooks/useCommandReview';
import {useDraftProtection} from '../hooks/useDraftProtection';
import {useChatReplyFormat} from '../hooks/useChatReplyFormat';
import {DraftDecisionDialog} from '../components/DraftDecisionDialog';
import {chatDraftStore} from '../drafts/chatDraftStore';
import {
  removeAttachmentFiles,
  shareAttachment,
} from '../components/chat/chatFiles';
import {ToolSheet} from '../components/tools';
import {MeetingsScreen} from './meetings';

/** How often a reply that is still arriving repaints (about 20 times a second). */
const STREAM_REPAINT_MS = 50;

export interface ChatScreenProps {
  userId: string;
  refreshTrigger?: number;
  onRefresh?: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  userId,
  refreshTrigger = 0,
  onRefresh,
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [legacyHiddenCount, setLegacyHiddenCount] = useState(0);
  const [legacyNoticeDismissed, setLegacyNoticeDismissed] = useState(
    () =>
      localSettingsStore.get(userId, 'chat.legacyNoticeDismissed', null) ===
      'true',
  );
  // Async results are applied only while the same account is still shown.
  const activeUserRef = useRef(userId);
  const replyFormat = useChatReplyFormat(userId);
  activeUserRef.current = userId;
  const suppressAutoScrollRef = useRef(false);
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
  // DeepSeek's reply while it is still being written (Online Mode only).
  const [streamingReply, setStreamingReply] = useState<{
    text: string;
    startedAt: string;
  } | null>(null);
  const streamFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOnlineMode, setIsOnlineMode] = useState(() => {
    const saved = localSettingsStore.get(userId, 'chat.onlineMode', null);
    return saved === 'true';
  });
  const onlineSpeech = useRef<CallSpeechProvider | null>(null);
  useEffect(() => {
    const provider = createCallSpeechProvider(userId);
    onlineSpeech.current = provider;
    const background = AppState.addEventListener('change', state => {
      if (state !== 'active')
        void provider.stopSpeech?.().catch(() => undefined);
    });
    return () => {
      onlineSpeech.current = null;
      background.remove();
      void provider.dispose?.().catch(() => undefined);
    };
  }, [userId]);
  const [useHandbook, setUseHandbook] = useState(() =>
    handbookPreference.read(userId),
  );
  const [handbookNotes, setHandbookNotes] = useState<Record<string, string>>(
    {},
  );
  const [selectedFormat, setSelectedFormat] = useState<DocumentFormat | null>(
    null,
  );
  const [formatPickerOpen, setFormatPickerOpen] = useState(false);
  const [meetingsModalVisible, setMeetingsModalVisible] = useState(false);
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

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, e => {
      setIsKeyboardVisible(true);
      const kh = e.endCoordinates?.height ?? 0;
      setKeyboardHeight(kh);
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
  const loadMessages = useCallback(() => {
    try {
      const page = chatStore.getMessagesPage(userId);
      setMessages(current => {
        const merged = mergeChatPages(current, page);
        if (!merged.keptEarlier) {
          setOlderCursor(page.nextCursor);
        }
        return merged.items;
      });
      setLoadError(null);
    } catch (error) {
      console.error('[ChatScreen] Could not load conversation:', error);
      setLoadError(
        'Your conversation could not be loaded right now. Nothing was deleted.',
      );
    }
  }, [userId]);

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

  // A different account never sees the previous account's messages or cursor.
  useEffect(() => {
    setMessages([]);
    setOlderCursor(null);
    setHandbookNotes({});
    setLoadError(null);
    setLegacyHiddenCount(chatStore.getLegacyQuarantineSummary().messageCount);
    setLegacyNoticeDismissed(
      localSettingsStore.get(userId, 'chat.legacyNoticeDismissed', null) ===
        'true',
    );
  }, [userId]);

  useEffect(() => {
    loadMessages();
  }, [userId, loadMessages, refreshTrigger]);

  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    setUseHandbook(handbookPreference.read(userId));
  }, [userId]);

  // Automatically detect Wi-Fi / data connection and sync online mode
  useEffect(() => {
    let active = true;

    const syncConnectivity = async (
      isConnected: boolean | null,
      isInternetReachable: boolean | null,
    ) => {
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

  const handleToggleHandbook = () => {
    const next = !useHandbook;
    setUseHandbook(next);
    handbookPreference.write(userId, next);
  };

  const onlineToggleTicket = useRef(0);
  const handleToggleOnline = async (): Promise<boolean> => {
    // Any tap (on or off) supersedes a pending enable from an earlier tap.
    const ticket = ++onlineToggleTicket.current;
    if (isOnlineMode) {
      void onlineSpeech.current?.stopSpeech?.().catch(() => undefined);
      setIsOnlineMode(false);
      setSelectedFormat(null);
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

  const handleOpenFormatPicker = async () => {
    if (!isOnlineMode) {
      const enabled = await handleToggleOnline();
      if (!enabled) return;
    }
    setFormatPickerOpen(true);
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

    const requestedFormat = selectedFormat;
    const requestUser = userId;
    setInputText('');
    setSelectedFormat(null);
    setIsSending(true);

    // Pieces of the reply arrive many times a second; repaint at most every
    // STREAM_REPAINT_MS so long replies stay smooth on slower phones.
    let latestText = '';
    let shownFirst = false;
    const startedAt = new Date().toISOString();
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
        loadMessages();
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
        useHandbook,
        documentFormat: requestedFormat,
        onReplyText,
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
      if (result.review?.status === 'proposal') {
        reviewSourceRef.current = {
          operationId: result.review.proposal.operationId,
          text: query,
        };
      }
      review.present(result.review);
      loadMessages();
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

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Conversation',
      'Clear your conversation history? This cannot be undone. Saved schedule items, notes and your unsent draft are kept.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            try {
              const attachmentUris = chatStore.getAttachmentUris(userId);
              chatStore.clearHistory(userId);
              void removeAttachmentFiles(attachmentUris);
            } catch (error) {
              console.error(
                '[ChatScreen] Could not clear conversation:',
                error,
              );
              Alert.alert(
                'Could Not Clear',
                'Your conversation could not be cleared right now. Nothing was deleted.',
              );
              return;
            }
            setHandbookNotes({});
            setMessages([]);
            setOlderCursor(null);
            loadMessages();
          },
        },
      ],
    );
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
            onPress={olderCursor ? handleLoadEarlier : loadMessages}
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

  const renderEmptyState = () => (
    <View style={styles.emptyContainer} testID="chat-empty-state">
      <View
        style={[
          styles.emptyIconBadge,
          {backgroundColor: colors.primary + '18'},
        ]}
      >
        <Bot size={36} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, themed.emptyTitle]}>
        LAFINA Academic Assistant
      </Text>
      <Text style={[styles.emptySubtitle, themed.emptySubtitle]}>
        Your offline secretary for university life. I can schedule your study
        blocks, set exact alarms for classes and deadlines, take notes, read
        your schedule aloud, or generate PDF, Word, Excel, and PowerPoint files
        in Online Mode.
      </Text>
    </View>
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
        setCurrentHeight(h);
      }}
      testID="chat-screen-container"
    >
      {/* Top Header */}
      <View style={[styles.header, themed.header]}>
        <View style={styles.headerTitleRow}>
          <View
            style={[
              styles.headerBadge,
              {backgroundColor: colors.primary + '18'},
            ]}
          >
            <Sparkles size={16} color={colors.primary} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text
              style={[styles.headerTitle, themed.headerTitle]}
              numberOfLines={1}
            >
              LAFINA Assistant
            </Text>
            <View style={styles.headerSubtitleRow}>
              <Text
                style={[styles.headerSubtitle, themed.headerSubtitle]}
                numberOfLines={1}
              >
                {isOnlineMode ? 'Online AI' : 'Offline Secretary'}
              </Text>
              {isOnlineMode && (
                <TouchableOpacity
                  style={[
                    styles.handbookChip,
                    themed.headerButton,
                    useHandbook && styles.handbookChipActive,
                  ]}
                  onPress={handleToggleHandbook}
                  accessibilityRole="switch"
                  accessibilityState={{checked: useHandbook}}
                  accessibilityLabel="Toggle USTP Student Handbook"
                  testID="chat-handbook-toggle-button"
                >
                  <BookOpen
                    size={10}
                    color={useHandbook ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.handbookChipText,
                      useHandbook
                        ? themed.handbookToggleTextActive
                        : themed.onlineToggleText,
                    ]}
                  >
                    USTP
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <View style={styles.headerRight}>
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
            style={[styles.headerIconButton, themed.headerButton]}
            onPress={() => setMeetingsModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open Lecture and Meeting Recorder"
            testID="chat-meetings-button"
          >
            <AudioLines size={15} color={colors.textSecondary} />
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

          {messages.length > 0 && (
            <TouchableOpacity
              style={[styles.headerIconButton, themed.headerButton]}
              onPress={handleClearHistory}
              accessibilityRole="button"
              accessibilityLabel="Clear conversation history"
              testID="chat-clear-history-button"
            >
              <Trash2 size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        // Switching the reply format in Profile redraws replies already shown.
        extraData={replyFormat}
        keyExtractor={item => item.id}
        style={styles.messagesList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({item}) => (
          <ChatMessageItem
            item={item}
            replyFormat={replyFormat}
            handbookNote={item.handbookNote ?? handbookNotes[item.id]}
            onSpeak={
              isOnlineMode
                ? async text => {
                    const result = await onlineSpeech.current?.speakText(text);
                    if (result?.fallbackReason)
                      Alert.alert('Using offline voice', result.fallbackReason);
                    return result;
                  }
                : undefined
            }
            onStopSpeaking={
              isOnlineMode
                ? () => onlineSpeech.current?.stopSpeech?.()
                : undefined
            }
            onOpenAttachment={handleOpenAttachment}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          messages.length === 0 && styles.listContentEmpty,
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
        onContentSizeChange={() => {
          // Prepending an earlier page keeps the reader where they were.
          if (suppressAutoScrollRef.current) {
            suppressAutoScrollRef.current = false;
            return;
          }
          flatListRef.current?.scrollToEnd({animated: true});
        }}
        onLayout={() => flatListRef.current?.scrollToEnd({animated: false})}
        testID="chat-messages-list"
      />

      {review.proposal ? (
        <View style={styles.reviewContainer}>
          <CommandReviewCard
            proposal={review.proposal}
            expired={review.expired}
            busy={review.busy}
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
        onSend={() => handleSend()}
        isSending={isSending}
        isOnlineMode={isOnlineMode}
        selectedFormat={selectedFormat}
        onOpenFormatPicker={() => {
          void handleOpenFormatPicker();
        }}
        onClearFormat={() => setSelectedFormat(null)}
        onSelectPrompt={prompt => handleSend(prompt)}
        showSuggestions={messages.length === 0}
        onFocus={() => {
          setIsKeyboardVisible(true);
          setTimeout(
            () => flatListRef.current?.scrollToEnd({animated: true}),
            100,
          );
        }}
      />

      {/* Document Format Picker Sheet */}
      <ToolSheet
        visible={formatPickerOpen}
        title="Create a document file"
        onClose={() => setFormatPickerOpen(false)}
      >
        <Text style={[styles.sheetHint, themed.sheetHint]}>
          Choose a file format, then describe what you want inside it — or ask
          naturally in chat (for example, “Create a PDF study guide for
          Calculus”).
        </Text>
        {DOCUMENT_FORMAT_ORDER.map(format => {
          const meta = DOCUMENT_FORMATS[format];
          const active = selectedFormat === format;
          const Icon =
            format === 'xlsx'
              ? FileSpreadsheet
              : format === 'pptx'
              ? Presentation
              : FileText;
          return (
            <TouchableOpacity
              key={format}
              style={[
                styles.formatOption,
                themed.formatOption,
                active && themed.formatOptionActive,
              ]}
              onPress={() => {
                setSelectedFormat(format);
                setFormatPickerOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={meta.label}
              testID={`chat-format-option-${format}`}
            >
              <Icon
                size={20}
                color={active ? colors.red : colors.textPrimary}
              />
              <View style={styles.formatOptionText}>
                <Text
                  style={[styles.formatOptionTitle, themed.formatOptionTitle]}
                >
                  {meta.label}
                </Text>
                <Text
                  style={[
                    styles.formatOptionSubtitle,
                    themed.formatOptionSubtitle,
                  ]}
                >
                  .{meta.extension}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ToolSheet>

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

      {/* Lecture & Meeting Recorder Modal */}
      {meetingsModalVisible && (
        <Modal
          visible={meetingsModalVisible}
          animationType="slide"
          statusBarTranslucent={true}
          onRequestClose={() => setMeetingsModalVisible(false)}
        >
          <View style={[styles.modalContainer, themed.container]}>
            <MeetingsScreen
              onBack={() => setMeetingsModalVisible(false)}
              onNotesSaved={() => {
                onRefresh?.();
              }}
            />
          </View>
        </Modal>
      )}
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
  modalContainer: {
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
    paddingHorizontal: 36,
  },
  emptyIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
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
});

const getThemedStyles = (colors: ThemeColors) => ({
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
