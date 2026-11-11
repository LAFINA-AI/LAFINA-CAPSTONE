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
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  Maximize2,
  MessageCircleDashed,
  MessageSquare,
  MessageSquarePlus,
  Minimize2,
  Pencil,
  Presentation,
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
import {
  DOCUMENT_FORMAT_ORDER,
  DOCUMENT_FORMATS,
  type DocumentFormat,
} from '../../../skills/documentSkill';
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
  onSelectDocumentFormat?: (format: DocumentFormat) => void;
  onScanCamera?: () => void;
  onScanGallery?: () => void;
  onOpenGuide?: () => void;
}

type FilterTab = 'all' | ChatSessionKind;

const FILTER_OPTIONS: readonly {key: FilterTab; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'general', label: 'General'},
  {key: 'ustp', label: 'USTP RAG'},
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

const DocFormatIcon: React.FC<{format: DocumentFormat; color: string}> = ({
  format,
  color,
}) => {
  switch (format) {
    case 'xlsx':
      return <FileSpreadsheet size={14} color={color} />;
    case 'pptx':
      return <Presentation size={14} color={color} />;
    default:
      return <FileText size={14} color={color} />;
  }
};

/**
 * Gemini-style slide-out sidebar that expands into a full-screen drawer for
 * searching chats, switching to the dedicated "Ask LAFINA about USTP" RAG chat,
 * and launching quick tools like document creation and schedule scanning.
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
  onSelectDocumentFormat,
  onScanCamera,
  onScanGallery,
  onOpenGuide,
}) => {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
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
              const {attachmentUris} = chatStore.deleteSession(
                userId,
                chat.id,
              );
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
    if (renaming?.id === item.id) {
      return (
        <View style={[styles.row, {borderColor: colors.border}]}>
          <TextInput
            value={renaming.title}
            onChangeText={title => setRenaming({id: item.id, title})}
            onSubmitEditing={saveRename}
            maxLength={MAX_CHAT_TITLE}
            autoFocus
            style={[
              styles.renameInput,
              {color: colors.textPrimary, borderColor: colors.primary},
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
            <Text style={[styles.textButtonLabel, {color: colors.primary}]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View
        style={[
          styles.row,
          {borderColor: colors.border},
          isOpen && {backgroundColor: colors.primary + '14'},
        ]}
      >
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => openChat(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open chat ${item.title}${isOpen ? ', open now' : ''}`}
          testID={`chat-history-item-${item.id}`}
        >
          <View style={styles.titleRow}>
            {isUstp ? (
              <BookOpen size={14} color={colors.primary} />
            ) : (
              <MessageSquare size={14} color={colors.textSecondary} />
            )}
            <Text
              style={[styles.title, {color: colors.textPrimary}]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {isUstp && (
              <View
                style={[
                  styles.itemBadge,
                  {backgroundColor: colors.primary + '16'},
                ]}
                testID={`chat-history-ustp-badge-${item.id}`}
              >
                <Text style={[styles.itemBadgeText, {color: colors.primary}]}>
                  USTP
                </Text>
              </View>
            )}
            <Text style={[styles.when, {color: colors.textSecondary}]}>
              {formatWhen(item.lastMessageAt)}
            </Text>
          </View>
          <Text
            style={[styles.preview, {color: colors.textSecondary}]}
            numberOfLines={isFullScreen ? 2 : 1}
          >
            {item.preview}
          </Text>
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
          <Pencil size={15} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => confirmDelete(item)}
          hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
          accessibilityRole="button"
          accessibilityLabel={`Delete chat ${item.title}`}
          testID={`chat-history-delete-${item.id}`}
          style={styles.iconButton}
        >
          <X size={16} color={colors.textSecondary} />
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
            <TouchableOpacity
              style={[styles.newChat, {backgroundColor: colors.primary}]}
              onPress={startNewChat}
              accessibilityRole="button"
              accessibilityLabel="New chat"
              testID="chat-history-new"
            >
              <MessageSquarePlus size={16} color={colors.white} />
              <Text style={[styles.newChatText, {color: colors.white}]}>
                New chat
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.assistantCard,
                {
                  backgroundColor: isCurrentUstp
                    ? colors.primary + '16'
                    : colors.cardBg,
                  borderColor: isCurrentUstp ? colors.primary : colors.border,
                },
              ]}
              onPress={startUstpChat}
              accessibilityRole="button"
              accessibilityLabel="Ask LAFINA anything about USTP"
              testID="chat-history-ustp-new"
            >
              <View
                style={[
                  styles.assistantIconBadge,
                  {backgroundColor: colors.primary + '20'},
                ]}
              >
                <BookOpen size={17} color={colors.primary} />
              </View>
              <View style={styles.assistantTextWrap}>
                <Text
                  style={[styles.assistantTitle, {color: colors.textPrimary}]}
                  numberOfLines={1}
                >
                  Ask LAFINA about USTP
                </Text>
                <Text
                  style={[
                    styles.assistantSubtitle,
                    {color: colors.textSecondary},
                  ]}
                  numberOfLines={isFullScreen ? 2 : 1}
                >
                  USTP Student Handbook RAG · Citations
                </Text>
              </View>
              <View
                style={[
                  styles.ragPill,
                  {backgroundColor: colors.primary + '18'},
                ]}
              >
                <Text style={[styles.ragPillText, {color: colors.primary}]}>
                  RAG
                </Text>
              </View>
            </TouchableOpacity>

            {onStartTemporaryChat && (
              <TouchableOpacity
                style={[
                  styles.secondaryActionRow,
                  {
                    backgroundColor: isTemporaryChat
                      ? colors.primary + '12'
                      : colors.cardBg,
                    borderColor: isTemporaryChat
                      ? colors.primary
                      : colors.border,
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
                  color={
                    isTemporaryChat ? colors.primary : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.secondaryActionTitle,
                    {color: colors.textPrimary},
                  ]}
                >
                  Temporary chat
                </Text>
                <Text
                  style={[
                    styles.secondaryActionHint,
                    {color: colors.textSecondary},
                  ]}
                >
                  Unsaved
                </Text>
              </TouchableOpacity>
            )}

            {(onSelectDocumentFormat ||
              onScanCamera ||
              onScanGallery ||
              onOpenGuide) && (
              <View style={styles.toolsSection}>
                <Text
                  style={[styles.sectionLabel, {color: colors.textSecondary}]}
                >
                  Create & Tools
                </Text>

                {onSelectDocumentFormat && (
                  <View style={styles.chipGrid}>
                    {DOCUMENT_FORMAT_ORDER.map(format => {
                      const meta = DOCUMENT_FORMATS[format];
                      return (
                        <TouchableOpacity
                          key={format}
                          style={[
                            styles.toolChip,
                            {
                              backgroundColor: colors.cardBg,
                              borderColor: colors.border,
                            },
                          ]}
                          onPress={() => {
                            if (blockedWhileBusy()) return;
                            onSelectDocumentFormat(format);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Create ${meta.label}`}
                          testID={`chat-sidebar-doc-${format}`}
                        >
                          <DocFormatIcon
                            format={format}
                            color={colors.primary}
                          />
                          <Text
                            style={[
                              styles.toolChipText,
                              {color: colors.textPrimary},
                            ]}
                          >
                            {meta.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View style={styles.chipGrid}>
                  {onScanCamera && (
                    <TouchableOpacity
                      style={[
                        styles.toolChip,
                        {
                          backgroundColor: colors.cardBg,
                          borderColor: colors.border,
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
                      <Camera size={14} color={colors.primary} />
                      <Text
                        style={[
                          styles.toolChipText,
                          {color: colors.textPrimary},
                        ]}
                      >
                        Camera
                      </Text>
                    </TouchableOpacity>
                  )}

                  {onScanGallery && (
                    <TouchableOpacity
                      style={[
                        styles.toolChip,
                        {
                          backgroundColor: colors.cardBg,
                          borderColor: colors.border,
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
                      <ImageIcon size={14} color={colors.primary} />
                      <Text
                        style={[
                          styles.toolChipText,
                          {color: colors.textPrimary},
                        ]}
                      >
                        Gallery
                      </Text>
                    </TouchableOpacity>
                  )}

                  {onOpenGuide && (
                    <TouchableOpacity
                      style={[
                        styles.toolChip,
                        {
                          backgroundColor: colors.cardBg,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={onOpenGuide}
                      accessibilityRole="button"
                      accessibilityLabel="Show what you can ask"
                      testID="chat-sidebar-guide"
                    >
                      <Lightbulb size={14} color={colors.textSecondary} />
                      <Text
                        style={[
                          styles.toolChipText,
                          {color: colors.textPrimary},
                        ]}
                      >
                        Ask Guide
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </>
        )}

        <View style={styles.recentHeaderRow}>
          <Text style={[styles.sectionLabel, {color: colors.textSecondary}]}>
            {isSearching ? 'Search Results' : 'Recent Chats'}
          </Text>
          <View style={styles.filterPillsRow}>
            {FILTER_OPTIONS.map(option => {
              const active = kindFilter === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: active
                        ? colors.primary + '18'
                        : 'transparent',
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setKindFilter(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{selected: active}}
                  accessibilityLabel={`Filter ${option.label} chats`}
                  testID={`chat-history-filter-${option.key}`}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      {color: active ? colors.primary : colors.textSecondary},
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
              backgroundColor: colors.background,
              borderRightColor: colors.border,
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
            <View style={styles.headerTitleGroup}>
              <Text style={[styles.heading, {color: colors.textPrimary}]}>
                lafina
              </Text>
              <View
                style={[
                  styles.modePill,
                  {backgroundColor: colors.primary + '14'},
                ]}
              >
                <Text style={[styles.modePillText, {color: colors.primary}]}>
                  {isFullScreen ? 'All Chats' : 'Chats & Tools'}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setIsFullScreen(prev => !prev)}
                accessibilityRole="button"
                accessibilityLabel={
                  isFullScreen
                    ? 'Collapse to sidebar'
                    : 'Expand to full screen'
                }
                accessibilityState={{expanded: isFullScreen}}
                testID="chat-history-expand"
                style={[
                  styles.headerActionBtn,
                  {backgroundColor: colors.cardBg, borderColor: colors.border},
                ]}
                hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
              >
                {isFullScreen ? (
                  <Minimize2 size={16} color={colors.textPrimary} />
                ) : (
                  <Maximize2 size={16} color={colors.textPrimary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close chats"
                testID="chat-history-close"
                style={[
                  styles.headerActionBtn,
                  {backgroundColor: colors.cardBg, borderColor: colors.border},
                ]}
                hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}
              >
                <X size={17} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: colors.inputBg,
                borderColor: isFullScreen ? colors.primary : colors.border,
              },
            ]}
          >
            <Search size={15} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              onFocus={() => setIsFullScreen(true)}
              placeholder="Search chats & messages…"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, {color: colors.textPrimary}]}
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
                <X size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {loadError ? (
            <Text style={[styles.empty, {color: colors.textSecondary}]}>
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
                  style={[styles.empty, {color: colors.textSecondary}]}
                  testID="chat-history-empty"
                >
                  {emptyMessage}
                </Text>
              }
            />
          )}

          <Text style={[styles.footnote, {color: colors.textSecondary}]}>
            Chats are kept on this phone only.
          </Text>
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
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
  },
  modePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  modePillText: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  headerActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    paddingVertical: 8,
  },
  listContainer: {
    paddingBottom: 12,
  },
  listTopSections: {
    gap: 8,
    marginBottom: 8,
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 11,
  },
  newChatText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  assistantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 10,
  },
  assistantIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  assistantTitle: {
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
  },
  assistantSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    marginTop: 1,
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
  secondaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  secondaryActionTitle: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryActionHint: {
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  toolsSection: {
    marginTop: 4,
    gap: 7,
  },
  sectionLabel: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toolChipText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  recentHeaderRow: {
    marginTop: 6,
    gap: 6,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterPillText: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 8,
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
  footnote: {
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
});
