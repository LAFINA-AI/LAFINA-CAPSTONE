import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BookOpen,
  Camera,
  Image as ImageIcon,
  Lightbulb,
  Maximize2,
  MessageCircleDashed,
  MessageSquare,
  MessageSquarePlus,
  Minimize2,
  Pencil,
  Search,
  X,
} from 'lucide-react-native';
import {Fonts, FontSize, Shadows} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {
  chatStore,
  isUstpSessionId,
  MAX_CHAT_TITLE,
  type ChatSessionKind,
  type ChatSummary,
} from '../../../storage/chatStore';
import {removeAttachmentFiles} from './chatFiles';

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
  onStartTemporaryChat,
  onScanCamera,
  onScanGallery,
  onOpenGuide,
}) => {
  const {colors, isModern, modernPalette, modernShadows} = useTheme();
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
  const {width: windowWidth} = useWindowDimensions();
  const safeWindowWidth = Math.max(windowWidth || 360, 320);
  const sidebarWidth = Math.min(Math.round(safeWindowWidth * 0.85), 360);

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<FilterTab>('all');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [renaming, setRenaming] = useState<{id: string; title: string} | null>(
    null,
  );

  const isTestEnv = process.env.NODE_ENV === 'test';
  const slideAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

  const isCurrentUstp = !isTemporaryChat && isUstpSessionId(currentSessionId);

  const reload = useCallback(() => {
    try {
      setChats(chatStore.listSessions(userId, search, kindFilter));
      setLoadError(false);
    } catch (error) {
      console.error('[ChatHistory] Could not list chats:', error);
      setLoadError(true);
    }
  }, [kindFilter, search, userId]);

  useEffect(() => {
    if (visible) reload();
  }, [visible, reload]);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setKindFilter('all');
      setIsFullScreen(false);
      setRenaming(null);
      slideAnim.setValue(0);
      expandAnim.setValue(0);
      return;
    }
    if (isTestEnv) {
      slideAnim.setValue(1);
      return;
    }
    const anim = Animated.timing(slideAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, isTestEnv, slideAnim, expandAnim]);

  useEffect(() => {
    if (!visible) return;
    if (isTestEnv) {
      expandAnim.setValue(isFullScreen ? 1 : 0);
      return;
    }
    const anim = Animated.timing(expandAnim, {
      toValue: isFullScreen ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [isFullScreen, visible, isTestEnv, expandAnim]);

  const blockedWhileBusy = (): boolean => {
    if (!busy) return false;
    Alert.alert(
      'One moment',
      'Wait for LAFINA to finish this reply, then switch chats.',
    );
    return true;
  };

  const handleRequestClose = () => {
    if (isFullScreen) {
      setIsFullScreen(false);
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

  const confirmDelete = (chat: ChatSummary) => {
    if (chat.id === currentSessionId && blockedWhileBusy()) return;
    Alert.alert(
      'Delete Chat',
      `Delete "${chat.title}"? Its messages and files are removed from this phone. Saved schedule items, notes and memories are kept.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              const {attachmentUris} = chatStore.deleteSession(userId, chat.id);
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
            if (chat.id === currentSessionId) onChanged();
          },
        },
      ],
    );
  };

  const renderChat = ({item}: {item: ChatSummary}) => {
    const isOpen = !isTemporaryChat && item.id === currentSessionId;
    const isUstp = item.kind === 'ustp';
    const isSearching = search.trim().length > 0;
    if (renaming?.id === item.id) {
      return (
        <View style={[styles.row, {borderColor}]}>
          <TextInput
            value={renaming.title}
            onChangeText={title => setRenaming({id: item.id, title})}
            onSubmitEditing={saveRename}
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
            onPress={saveRename}
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
          onPress={() => openChat(item.id)}
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
          {(isSearching || isFullScreen) && !!item.preview && (
            <Text
              style={[styles.preview, {color: textSecondary}]}
              numberOfLines={1}
            >
              {item.preview}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            setRenaming({
              id: item.id,
              title: item.customTitle ? item.title : '',
            })
          }
          hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
          accessibilityRole="button"
          accessibilityLabel={`Rename chat ${item.title}`}
          testID={`chat-history-rename-${item.id}`}
          style={styles.iconButton}
        >
          <Pencil size={14} color={textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => confirmDelete(item)}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
          accessibilityRole="button"
          accessibilityLabel={`Delete chat ${item.title}`}
          testID={`chat-history-delete-${item.id}`}
          style={styles.iconButton}
        >
          <X size={15} color={textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderDrawerHeader = () => {
    const isSearching = search.trim().length > 0;
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
                USTP Handbook
              </Text>
              <View style={[styles.ragPill, {backgroundColor: softViolet}]}>
                <Text style={[styles.ragPillText, {color: accent}]}>RAG</Text>
              </View>
            </TouchableOpacity>

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
            {FILTER_OPTIONS.map(option => {
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
    ? 'No USTP Handbook chats yet. Ask LAFINA anything about USTP!'
    : kindFilter === 'general'
    ? 'No general chats yet. Start a new chat above!'
    : 'No chats yet. Say hi to LAFINA!';

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-sidebarWidth, 0],
  });
  const drawerWidth = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sidebarWidth, safeWindowWidth],
  });
  const drawerRadius = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });
  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.42],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
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
              width: drawerWidth,
              borderTopRightRadius: drawerRadius,
              borderBottomRightRadius: drawerRadius,
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
                onPress={() => setIsFullScreen(prev => !prev)}
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
              onFocus={() => setIsFullScreen(true)}
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
  ragPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
  },
  ragPillText: {
    fontFamily: Fonts.heading,
    fontSize: 10,
    fontWeight: '700',
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
});
