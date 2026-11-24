import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  DeviceEventEmitter,
  Easing,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BookOpen,
  Camera,
  Library,
  Image as ImageIcon,
  Lightbulb,
  Maximize2,
  MessageCircleDashed,
  MessageSquare,
  MessageSquarePlus,
  Minimize2,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
import {Fonts, FontSize, Shadows} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {
  chatStore,
  isChatLimitReachedError,
  isUstpSessionId,
  MAX_CHAT_TITLE,
  type ChatSessionKind,
  type ChatSummary,
} from '../../../storage/chatStore';
import {removeAttachmentFiles} from './chatFiles';
import {
  CHAT_REMOTE_CHANGED_EVENT,
  type ChatRemoteChangedEvent,
} from '../../../sync/chatSyncEvents';
import {isUstpSchoolEnabled} from '../../../storage/ustpEligibility';

export interface ChatHistorySheetProps {
  visible: boolean;
  userId: string;
  currentSessionId: string;
  isTemporaryChat?: boolean;
  /** A reply is still being written: switching chats waits for it. */
  busy: boolean;
  onClose: () => void;
  /** The student opened another chat, started a new one, or deleted the open one. */
  onChanged: () => void;
  onStartUstpChat?: () => void;
  /** Opens the USTP sources library (every passage Ask USTP answers from). */
  onOpenUstpSources?: () => void;
  /** USTP school features (handbook chat) are on for this student. */
  ustpAvailable?: boolean;
  onStartTemporaryChat?: () => void;
  onScanCamera?: () => void;
  onScanGallery?: () => void;
  onOpenGuide?: () => void;
}

type FilterTab = 'all' | ChatSessionKind;

const FILTER_OPTIONS: readonly {key: FilterTab; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'general', label: 'General'},
  {key: 'ustp', label: 'USTP'},
];

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ChatHistoryRowProps {
  item: ChatSummary;
  isOpen: boolean;
  showPreview: boolean;
  isRenaming: boolean;
  renameTitle: string;
  accent: string;
  softViolet: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  onOpen: (id: string) => void;
  onStartRename: (item: ChatSummary) => void;
  onChangeRename: (title: string) => void;
  onSaveRename: () => void;
  onRequestDelete: (item: ChatSummary) => void;
}

const ChatHistoryRow = React.memo<ChatHistoryRowProps>(
  ({
    item,
    isOpen,
    showPreview,
    isRenaming,
    renameTitle,
    accent,
    softViolet,
    textPrimary,
    textSecondary,
    borderColor,
    onOpen,
    onStartRename,
    onChangeRename,
    onSaveRename,
    onRequestDelete,
  }) => {
    const isUstp = item.kind === 'ustp';
    if (isRenaming) {
      return (
        <View style={[styles.row, {borderColor}]}>
          <TextInput
            value={renameTitle}
            onChangeText={onChangeRename}
            onSubmitEditing={onSaveRename}
            maxLength={MAX_CHAT_TITLE}
            autoFocus
            style={[
              styles.renameInput,
              {color: textPrimary, borderColor: accent},
            ]}
            accessibilityLabel="Chat title"
            testID="chat-history-rename-input"
          />
          <TouchableOpacity
            onPress={onSaveRename}
            accessibilityRole="button"
            accessibilityLabel="Save chat title"
            testID="chat-history-rename-save"
            style={styles.textButton}
          >
            <Text style={[styles.textButtonLabel, {color: accent}]}>Save</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.row, isOpen && {backgroundColor: softViolet}]}>
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => onOpen(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open chat ${item.title}${
            isOpen ? ', open now' : ''
          }`}
          testID={`chat-history-item-${item.id}`}
        >
          <View style={styles.titleRow}>
            {isUstp ? (
              <BookOpen size={14} color={accent} />
            ) : (
              <MessageSquare
                size={14}
                color={isOpen ? accent : textSecondary}
              />
            )}
            <Text
              style={[
                styles.title,
                {color: textPrimary},
                isOpen && {fontWeight: '700'},
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {isUstp && (
              <View
                style={[styles.itemBadge, {backgroundColor: softViolet}]}
                testID={`chat-history-ustp-badge-${item.id}`}
              >
                <Text style={[styles.itemBadgeText, {color: accent}]}>
                  USTP
                </Text>
              </View>
            )}
            <Text style={[styles.when, {color: textSecondary}]}>
              {formatWhen(item.lastMessageAt)}
            </Text>
          </View>
          {showPreview && !!item.preview && (
            <Text
              style={[styles.preview, {color: textSecondary}]}
              numberOfLines={1}
            >
              {item.preview}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onStartRename(item)}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
          accessibilityRole="button"
          accessibilityLabel={`Rename chat ${item.title}`}
          testID={`chat-history-rename-${item.id}`}
          style={styles.iconButton}
        >
          <Pencil size={14} color={textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onRequestDelete(item)}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
          accessibilityRole="button"
          accessibilityLabel={`Delete chat ${item.title}`}
          testID={`chat-history-delete-${item.id}`}
          style={styles.iconButton}
        >
          <Trash2 size={14} color={textSecondary} />
        </TouchableOpacity>
      </View>
    );
  },
);

const formatWhen = (iso: string, now = new Date()): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : {year: 'numeric'}),
  });
};

/**
 * Gemini-style slide-out sidebar that expands into a full-screen drawer for
 * searching chats, switching to the dedicated "Ask LAFINA about USTP" RAG chat,
 * and launching quick schedule-scanning and command-guide tools.
 */
export const ChatHistorySheet: React.FC<ChatHistorySheetProps> = ({
  visible,
  userId,
  currentSessionId,
  isTemporaryChat = false,
  busy,
  onClose,
  onChanged,
  onStartUstpChat,
  onOpenUstpSources,
  ustpAvailable,
  onStartTemporaryChat,
  onScanCamera,
  onScanGallery,
  onOpenGuide,
}) => {
  const {colors, isDarkMode, isModern, modernPalette, modernShadows} =
    useTheme();
  const insets = useSafeAreaInsets();
  const accent = isModern ? modernPalette.accent : colors.primary;
  const surfaceBg = isModern ? modernPalette.surface : colors.cardBg;
  const cardBg = isModern ? modernPalette.card : colors.background;
  const softViolet = isModern
    ? modernPalette.softViolet
    : colors.primary + '16';
  const textPrimary = isModern ? modernPalette.text : colors.textPrimary;
  const textSecondary = isModern ? modernPalette.muted : colors.textSecondary;
  const borderColor = isModern ? modernPalette.border : colors.border;
  const dangerInk = isModern ? modernPalette.danger : colors.error;
  const dangerSoftBg = isModern
    ? modernPalette.dangerSoft
    : isDarkMode
    ? '#3A1D24'
    : '#FDECEC';
  const dangerButtonBg = isDarkMode
    ? '#DC3B30'
    : isModern
    ? modernPalette.danger
    : colors.error;
  const safeBg = isModern
    ? modernPalette.mint
    : isDarkMode
    ? '#143326'
    : '#ECFDF5';
  const safeInk = isModern ? modernPalette.mintInk : colors.success;
  const {width: windowWidth} = useWindowDimensions();
  const safeWindowWidth = Math.max(windowWidth || 360, 320);
  const sidebarWidth = Math.min(Math.round(safeWindowWidth * 0.85), 360);

  const [prevVisible, setPrevVisible] = useState(visible);
  const [modalVisible, setModalVisible] = useState(visible);
  const modalVisibleRef = useRef(modalVisible);
  modalVisibleRef.current = modalVisible;
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<FilterTab>('all');
  const showUstp = ustpAvailable ?? isUstpSchoolEnabled(userId);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [renaming, setRenaming] = useState<{id: string; title: string} | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<ChatSummary | null>(null);

  const isTestEnv = process.env.NODE_ENV === 'test';
  const slideAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  const isCurrentUstp = !isTemporaryChat && isUstpSessionId(currentSessionId);

  // Saved chats against the per-account limit, read again with the list.
  const chatLimit = React.useMemo(() => {
    try {
      return chatStore.chatLimit(userId);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, userId]);

  const reload = useCallback(() => {
    try {
      setChats(chatStore.listSessions(userId, search, kindFilter));
      setLoadError(false);
    } catch (error) {
      console.error('[ChatHistory] Could not list chats:', error);
      setLoadError(true);
    }
  }, [kindFilter, search, userId]);

  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setModalVisible(true);
      try {
        setChats(chatStore.listSessions(userId, '', 'all'));
        setLoadError(false);
      } catch (error) {
        console.error('[ChatHistory] Could not list chats:', error);
        setLoadError(true);
      }
    } else {
      setSearch('');
      setKindFilter('all');
      setIsFullScreen(false);
      setRenaming(null);
      setPendingDelete(null);
    }
  }

  useEffect(() => {
    if (visible) reload();
  }, [visible, reload]);

  // Chats synced from another phone show while the list is open (ADR-040).
  useEffect(() => {
    if (!visible) return;
    const subscription = DeviceEventEmitter.addListener(
      CHAT_REMOTE_CHANGED_EVENT,
      (event: ChatRemoteChangedEvent) => {
        if (event?.userId === userId) reload();
      },
    );
    return () => subscription.remove();
  }, [visible, reload, userId]);

  useEffect(() => {
    if (visible) {
      if (isTestEnv) {
        slideAnim.setValue(1);
        return;
      }
      slideAnim.setValue(0);
      const anim = Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      anim.start();
      return () => anim.stop();
    }

    if (isTestEnv || !modalVisibleRef.current) {
      slideAnim.setValue(0);
      setModalVisible(false);
      return;
    }

    const anim = Animated.timing(slideAnim, {
      toValue: 0,
      duration: 155,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({finished}) => {
      if (finished) setModalVisible(false);
    });
    return () => anim.stop();
  }, [visible, isTestEnv, slideAnim]);

  const setExpandedAnimated = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      if (!isTestEnv) {
        LayoutAnimation.configureNext({
          duration: 180,
          create: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
          },
          update: {type: LayoutAnimation.Types.easeInEaseOut},
        });
      }
      setIsFullScreen(next);
    },
    [isTestEnv],
  );

  const blockedWhileBusy = useCallback((): boolean => {
    if (!busy) return false;
    Alert.alert(
      'One moment',
      'Wait for LAFINA to finish this reply, then switch chats.',
    );
    return true;
  }, [busy]);

  const handleRequestClose = () => {
    if (pendingDelete) {
      setPendingDelete(null);
      return;
    }
    if (isFullScreen) {
      setExpandedAnimated(false);
      return;
    }
    onClose();
  };

  const openChat = (id: string) => {
    if (id === currentSessionId && !isTemporaryChat) {
      onClose();
      return;
    }
    if (blockedWhileBusy()) return;
    try {
      chatStore.openSession(userId, id);
    } catch (error) {
      console.error('[ChatHistory] Could not open chat:', error);
      Alert.alert(
        'Could Not Open',
        'That chat could not be opened. Nothing was changed.',
      );
      return;
    }
    onChanged();
    onClose();
  };

  const startNewChat = () => {
    if (blockedWhileBusy()) return;
    try {
      chatStore.startNewChat(userId, 'general');
    } catch (error) {
      if (isChatLimitReachedError(error)) {
        Alert.alert('Chat Limit Reached', error.message);
        return;
      }
      console.error('[ChatHistory] Could not start a chat:', error);
      Alert.alert(
        'Could Not Start',
        'A new chat could not be started right now.',
      );
      return;
    }
    onChanged();
    onClose();
  };

  const startUstpChat = () => {
    if (blockedWhileBusy()) return;
    if (onStartUstpChat) {
      onStartUstpChat();
      return;
    }
    try {
      chatStore.startNewUstpChat(userId);
    } catch (error) {
      if (isChatLimitReachedError(error)) {
        Alert.alert('Chat Limit Reached', error.message);
        return;
      }
      console.error('[ChatHistory] Could not start USTP chat:', error);
      Alert.alert(
        'Could Not Start',
        'Could not open Ask LAFINA about USTP right now.',
      );
      return;
    }
    onChanged();
    onClose();
  };

  const saveRename = () => {
    if (!renaming) return;
    try {
      chatStore.renameSession(userId, renaming.id, renaming.title);
    } catch (error) {
      console.error('[ChatHistory] Could not rename chat:', error);
      Alert.alert('Not Renamed', 'The chat could not be renamed. Try again.');
      return;
    }
    setRenaming(null);
    reload();
    if (renaming.id === currentSessionId) {
      onChanged();
    }
  };

  const requestDelete = useCallback(
    (chat: ChatSummary) => {
      if (chat.id === currentSessionId && blockedWhileBusy()) return;
      setPendingDelete(chat);
    },
    [blockedWhileBusy, currentSessionId],
  );

  const executePendingDelete = () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    try {
      const {attachmentUris} = chatStore.deleteSession(userId, target.id);
      void removeAttachmentFiles(attachmentUris);
    } catch (error) {
      console.error('[ChatHistory] Could not delete chat:', error);
      Alert.alert(
        'Could Not Delete',
        'The chat could not be deleted. Nothing was removed.',
      );
      return;
    }
    reload();
    if (target.id === currentSessionId) onChanged();
  };

  const handleStartRename = useCallback((chat: ChatSummary) => {
    setRenaming({
      id: chat.id,
      title: chat.customTitle ? chat.title : '',
    });
  }, []);

  const handleChangeRename = useCallback((title: string) => {
    setRenaming(prev => (prev ? {...prev, title} : prev));
  }, []);

  const isSearching = search.trim().length > 0;
  const showPreview = isSearching || isFullScreen;

  const renderChat = useCallback(
    ({item}: {item: ChatSummary}) => (
      <ChatHistoryRow
        item={item}
        isOpen={!isTemporaryChat && item.id === currentSessionId}
        showPreview={showPreview}
        isRenaming={renaming?.id === item.id}
        renameTitle={renaming?.id === item.id ? renaming.title : ''}
        accent={accent}
        softViolet={softViolet}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
        borderColor={borderColor}
        onOpen={openChat}
        onStartRename={handleStartRename}
        onChangeRename={handleChangeRename}
        onSaveRename={saveRename}
        onRequestDelete={requestDelete}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isTemporaryChat,
      currentSessionId,
      showPreview,
      renaming,
      accent,
      softViolet,
      textPrimary,
      textSecondary,
      borderColor,
      requestDelete,
    ],
  );

  const renderDrawerHeader = () => {
    return (
      <View style={styles.listTopSections}>
        {!isSearching && (
          <>
            <View style={styles.primaryActionsRow}>
              <TouchableOpacity
                style={[styles.newChat, {backgroundColor: accent}]}
                onPress={startNewChat}
                accessibilityRole="button"
                accessibilityLabel="New chat"
                testID="chat-history-new"
              >
                <MessageSquarePlus size={16} color="#FFFFFF" />
                <Text style={[styles.newChatText, {color: '#FFFFFF'}]}>
                  New chat
                </Text>
              </TouchableOpacity>

              {onStartTemporaryChat && (
                <TouchableOpacity
                  style={[
                    styles.tempChatBtn,
                    {
                      backgroundColor: isTemporaryChat ? softViolet : surfaceBg,
                      borderColor: isTemporaryChat ? accent : borderColor,
                    },
                  ]}
                  onPress={() => {
                    if (blockedWhileBusy()) return;
                    onStartTemporaryChat();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Temporary chat"
                  testID="chat-history-temp-new"
                >
                  <MessageCircleDashed
                    size={16}
                    color={isTemporaryChat ? accent : textSecondary}
                  />
                  <Text
                    style={[
                      styles.tempChatText,
                      {color: isTemporaryChat ? accent : textPrimary},
                    ]}
                  >
                    Temporary
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {chatLimit ? (
              <Text
                style={[
                  styles.chatLimitText,
                  {color: chatLimit.reached ? accent : textSecondary},
                ]}
                testID="chat-history-limit"
              >
                {chatLimit.reached
                  ? `${chatLimit.count} of ${chatLimit.max} chats. Delete a chat to start a new one.`
                  : `${chatLimit.count} of ${chatLimit.max} chats`}
              </Text>
            ) : null}

            {showUstp && (
              <TouchableOpacity
                style={[
                  styles.ustpRow,
                  {
                    backgroundColor: isCurrentUstp ? softViolet : surfaceBg,
                    borderColor: isCurrentUstp ? accent : borderColor,
                  },
                ]}
                onPress={startUstpChat}
                accessibilityRole="button"
                accessibilityLabel="Ask LAFINA anything about USTP"
                testID="chat-history-ustp-new"
              >
                <BookOpen size={16} color={accent} />
                <Text
                  style={[styles.ustpRowTitle, {color: textPrimary}]}
                  numberOfLines={1}
                >
                  Ask USTP
                </Text>
              </TouchableOpacity>
            )}

            {showUstp && onOpenUstpSources ? (
              <TouchableOpacity
                style={[
                  styles.ustpRow,
                  {backgroundColor: surfaceBg, borderColor: borderColor},
                ]}
                onPress={onOpenUstpSources}
                accessibilityRole="button"
                accessibilityLabel="Browse every USTP source LAFINA answers from"
                testID="chat-history-ustp-sources"
              >
                <Library size={16} color={accent} />
                <Text
                  style={[styles.ustpRowTitle, {color: textPrimary}]}
                  numberOfLines={1}
                >
                  USTP sources
                </Text>
              </TouchableOpacity>
            ) : null}

            {(onScanCamera || onScanGallery || onOpenGuide) && (
              <View style={styles.toolsSection}>
                <View style={styles.quickScanRow}>
                  {onScanCamera && (
                    <TouchableOpacity
                      style={[
                        styles.toolPill,
                        {
                          backgroundColor: surfaceBg,
                          borderColor,
                        },
                      ]}
                      onPress={() => {
                        if (blockedWhileBusy()) return;
                        onScanCamera();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Scan schedule with camera"
                      testID="chat-sidebar-scan-camera"
                    >
                      <Camera size={15} color={accent} />
                      <Text style={[styles.toolPillText, {color: textPrimary}]}>
                        Camera
                      </Text>
                    </TouchableOpacity>
                  )}

                  {onScanGallery && (
                    <TouchableOpacity
                      style={[
                        styles.toolPill,
                        {
                          backgroundColor: surfaceBg,
                          borderColor,
                        },
                      ]}
                      onPress={() => {
                        if (blockedWhileBusy()) return;
                        onScanGallery();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Scan schedule from photos"
                      testID="chat-sidebar-scan-gallery"
                    >
                      <ImageIcon size={15} color={accent} />
                      <Text style={[styles.toolPillText, {color: textPrimary}]}>
                        Gallery
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {onOpenGuide && (
                  <TouchableOpacity
                    style={[
                      styles.guideRow,
                      {
                        backgroundColor: surfaceBg,
                        borderColor,
                      },
                    ]}
                    onPress={onOpenGuide}
                    accessibilityRole="button"
                    accessibilityLabel="Show what you can ask"
                    testID="chat-sidebar-guide"
                  >
                    <Lightbulb size={15} color={accent} />
                    <Text style={[styles.guideRowTitle, {color: textPrimary}]}>
                      What can you ask?
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}

        <View style={[styles.recentHeaderRow, {borderTopColor: borderColor}]}>
          <View style={[styles.segmentedFilter, {backgroundColor: surfaceBg}]}>
            {FILTER_OPTIONS.filter(
              option => showUstp || option.key !== 'ustp',
            ).map(option => {
              const active = kindFilter === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.filterTab,
                    active && {
                      backgroundColor: cardBg,
                    },
                    active && modernShadows.subtle,
                  ]}
                  onPress={() => setKindFilter(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{selected: active}}
                  accessibilityLabel={`Filter ${option.label} chats`}
                  testID={`chat-history-filter-${option.key}`}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      {color: active ? textPrimary : textSecondary},
                      active && {fontWeight: '700'},
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const emptyMessage = search.trim()
    ? 'No chats match your search.'
    : kindFilter === 'ustp'
    ? 'No Ask USTP chats yet. Ask anything about USTP!'
    : kindFilter === 'general'
    ? 'No general chats yet. Start a new chat above!'
    : 'No chats yet. Say hi to LAFINA!';

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-sidebarWidth, 0],
  });
  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.42],
  });

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={handleRequestClose}
    >
      <View style={styles.overlayRoot}>
        <Animated.View
          style={[styles.backdrop, {opacity: backdropOpacity}]}
          pointerEvents={isFullScreen ? 'none' : 'auto'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close sidebar"
            testID="chat-history-backdrop"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              backgroundColor: cardBg,
              borderRightColor: borderColor,
              borderRightWidth: isFullScreen ? 0 : StyleSheet.hairlineWidth,
              width: isFullScreen ? safeWindowWidth : sidebarWidth,
              borderTopRightRadius: isFullScreen ? 0 : 22,
              borderBottomRightRadius: isFullScreen ? 0 : 22,
              transform: [{translateX}],
              paddingTop: Math.max(insets.top, 14),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
          testID="chat-history-sheet"
        >
          <View style={styles.header}>
            <Text style={[styles.heading, {color: textPrimary}]}>Chat</Text>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setExpandedAnimated(prev => !prev)}
                accessibilityRole="button"
                accessibilityLabel={
                  isFullScreen ? 'Collapse to sidebar' : 'Expand to full screen'
                }
                accessibilityState={{expanded: isFullScreen}}
                testID="chat-history-expand"
                style={[
                  styles.headerActionBtn,
                  {backgroundColor: surfaceBg, borderColor},
                ]}
                hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
              >
                {isFullScreen ? (
                  <Minimize2 size={16} color={textPrimary} />
                ) : (
                  <Maximize2 size={16} color={textPrimary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close chats"
                testID="chat-history-close"
                style={[
                  styles.headerActionBtn,
                  {backgroundColor: surfaceBg, borderColor},
                ]}
                hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
              >
                <X size={17} color={textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: surfaceBg,
                borderColor: isFullScreen ? accent : borderColor,
              },
            ]}
          >
            <Search size={15} color={textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              onFocus={() => setExpandedAnimated(true)}
              placeholder="Search chats…"
              placeholderTextColor={textSecondary}
              style={[styles.searchInput, {color: textPrimary}]}
              accessibilityLabel="Search chats"
              testID="chat-history-search"
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                testID="chat-history-search-clear"
                hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
              >
                <X size={15} color={textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {loadError ? (
            <Text style={[styles.empty, {color: textSecondary}]}>
              Your chats could not be loaded right now. Nothing was deleted.
            </Text>
          ) : (
            <FlatList
              data={chats}
              keyExtractor={chat => chat.id}
              renderItem={renderChat}
              ListHeaderComponent={renderDrawerHeader}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              initialNumToRender={12}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={!isTestEnv}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <Text
                  style={[styles.empty, {color: textSecondary}]}
                  testID="chat-history-empty"
                >
                  {emptyMessage}
                </Text>
              }
            />
          )}
        </Animated.View>

        {pendingDelete ? (
          <View
            style={styles.deleteOverlay}
            testID="chat-history-delete-dialog"
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPendingDelete(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss delete confirmation"
            />
            <View
              style={[
                styles.deleteCard,
                modernShadows.floating,
                {backgroundColor: cardBg, borderColor},
              ]}
            >
              <View
                style={[
                  styles.deleteIconBadge,
                  {backgroundColor: dangerSoftBg},
                ]}
              >
                <Trash2 size={20} color={dangerInk} />
              </View>
              <Text style={[styles.deleteTitle, {color: textPrimary}]}>
                Delete this chat?
              </Text>
              <View
                style={[
                  styles.deleteChatChip,
                  {backgroundColor: surfaceBg, borderColor},
                ]}
              >
                {pendingDelete.kind === 'ustp' ? (
                  <BookOpen size={13} color={accent} />
                ) : (
                  <MessageSquare size={13} color={textSecondary} />
                )}
                <Text
                  style={[styles.deleteChatName, {color: textPrimary}]}
                  numberOfLines={1}
                >
                  {pendingDelete.title}
                </Text>
              </View>

              <View style={styles.deleteImpactList}>
                <View
                  style={[
                    styles.deleteImpactRow,
                    {backgroundColor: dangerSoftBg},
                  ]}
                >
                  <Trash2
                    size={15}
                    color={dangerInk}
                    style={styles.deleteImpactIcon}
                  />
                  <View style={styles.deleteImpactBody}>
                    <Text
                      style={[styles.deleteImpactTitle, {color: dangerInk}]}
                    >
                      Removed from this phone
                    </Text>
                    <Text
                      style={[styles.deleteImpactText, {color: textSecondary}]}
                    >
                      Messages and attached files in this chat will be deleted.
                    </Text>
                  </View>
                </View>

                <View
                  style={[styles.deleteImpactRow, {backgroundColor: safeBg}]}
                >
                  <ShieldCheck
                    size={15}
                    color={safeInk}
                    style={styles.deleteImpactIcon}
                  />
                  <View style={styles.deleteImpactBody}>
                    <Text style={[styles.deleteImpactTitle, {color: safeInk}]}>
                      Kept safely
                    </Text>
                    <Text
                      style={[styles.deleteImpactText, {color: textSecondary}]}
                    >
                      Saved schedule items, tasks, notes, and memories stay
                      intact.
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.deleteButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.deleteCancelBtn,
                    {backgroundColor: surfaceBg, borderColor},
                  ]}
                  onPress={() => setPendingDelete(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel deleting chat"
                  testID="chat-history-delete-cancel"
                >
                  <Text style={[styles.deleteBtnText, {color: textPrimary}]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.deleteConfirmBtn,
                    {backgroundColor: dangerButtonBg},
                  ]}
                  onPress={executePendingDelete}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm delete ${pendingDelete.title}`}
                  testID="chat-history-delete-confirm"
                >
                  <Trash2 size={15} color="#FFFFFF" />
                  <Text style={[styles.deleteBtnText, {color: '#FFFFFF'}]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000',
  },
  drawer: {
    height: '100%',
    paddingHorizontal: 14,
    gap: 10,
    ...Shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  headerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    paddingVertical: 8,
  },
  listContainer: {
    paddingBottom: 16,
  },
  listTopSections: {
    gap: 8,
    marginBottom: 8,
  },
  primaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newChat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    paddingVertical: 11,
  },
  newChatText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  chatLimitText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: -4,
    marginBottom: 8,
  },
  tempChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  tempChatText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  ustpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 9,
  },
  ustpRowTitle: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '600',
  },
  toolsSection: {
    gap: 7,
  },
  quickScanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  toolPillText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  guideRowTitle: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  recentHeaderRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  segmentedFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 9,
  },
  filterTabText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 4,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  itemBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  itemBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 9.5,
    fontWeight: '700',
  },
  when: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  preview: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    paddingLeft: 20,
  },
  iconButton: {
    padding: 6,
  },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  textButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  textButtonLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
  },
  empty: {
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    paddingVertical: 24,
  },
  deleteOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 13, 30, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  deleteIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  deleteChatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  deleteChatName: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  deleteImpactList: {
    width: '100%',
    gap: 8,
    marginBottom: 18,
  },
  deleteImpactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deleteImpactIcon: {
    marginTop: 2,
  },
  deleteImpactBody: {
    flex: 1,
    gap: 2,
  },
  deleteImpactTitle: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  deleteImpactText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  deleteButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  deleteCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteBtnText: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
});
