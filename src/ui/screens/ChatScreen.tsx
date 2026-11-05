import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
} from 'lucide-react-native';
import { Fonts, FontSize, Layout, Spacing } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';
import {
  chatStore,
  type ChatAttachment,
  type ChatMessage,
} from '../../storage/chatStore';
import { localSettingsStore } from '../../storage/localSettingsStore';
import { accountLinkService } from '../../cloud';
import {
  DOCUMENT_FORMAT_ORDER,
  DOCUMENT_FORMATS,
  type DocumentFormat,
} from '../../skills/documentSkill';
import { handbookPreference } from '../../skills/onlineChatSkill';
import { chatOrchestrator } from '../../ai/chatOrchestrator';
import { ChatMessageItem } from '../components/chat/ChatMessageItem';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingBubble } from '../components/chat/TypingBubble';
import {
  removeAttachmentFiles,
  shareAttachment,
} from '../components/chat/chatFiles';
import { ToolSheet } from '../components/tools';
import { MeetingsScreen } from './meetings';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isOnlineMode, setIsOnlineMode] = useState(() => {
    const saved = localSettingsStore.get(userId, 'chat.onlineMode', null);
    return saved === 'true';
  });
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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const [currentHeight, setCurrentHeight] = useState(() =>
    Math.max(0, Dimensions.get('window').height - (insets.top + 6)),
  );
  const maxHeightRef = useRef<number>(currentHeight);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

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
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      const kh = e.endCoordinates?.height ?? 0;
      setKeyboardHeight(kh);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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

  const loadMessages = useCallback(() => {
    const list = chatStore.getMessages(userId);
    setMessages(list);
  }, [userId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages, refreshTrigger]);

  useEffect(() => {
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
      const userPreference = localSettingsStore.get(
        userId,
        'chat.onlineMode',
        null,
      );

      // If user explicitly chose offline, honor their manual choice
      if (userPreference === 'false') {
        return;
      }

      if (isDeviceConnected) {
        const auth = await accountLinkService.authorizeOnlineMode(userId);
        if (active && auth.status === 'success') {
          setIsOnlineMode(true);
          localSettingsStore.set(userId, 'chat.onlineMode', 'true');
        }
      } else if (active) {
        setIsOnlineMode(false);
      }
    };

    NetInfo.fetch().then((state) => {
      void syncConnectivity(state.isConnected, state.isInternetReachable);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      void syncConnectivity(state.isConnected, state.isInternetReachable);
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

  const handleToggleOnline = async (): Promise<boolean> => {
    if (isOnlineMode) {
      setIsOnlineMode(false);
      setSelectedFormat(null);
      localSettingsStore.set(userId, 'chat.onlineMode', 'false');
      return false;
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      Alert.alert(
        'Device Offline',
        'Please connect to Wi-Fi or mobile data to use Online Mode.',
      );
      return false;
    }

    const result = await accountLinkService.authorizeOnlineMode(userId);
    if (result.status !== 'success') {
      Alert.alert(
        'Online Mode Unavailable',
        result.message || 'Could not enable online mode.',
      );
      return false;
    }

    setIsOnlineMode(true);
    localSettingsStore.set(userId, 'chat.onlineMode', 'true');
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
    setInputText('');
    setSelectedFormat(null);
    setIsSending(true);

    try {
      const result = await chatOrchestrator.processMessage(userId, query, {
        onlineMode: isOnlineMode,
        useHandbook,
        documentFormat: requestedFormat,
      });
      if (result.handbookNote && result.assistantMessage) {
        setHandbookNotes((prev) => ({
          ...prev,
          [result.assistantMessage.id]: result.handbookNote as string,
        }));
      }
      loadMessages();
      onRefresh?.();
    } catch (err) {
      console.error('[ChatScreen] Error processing chat message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Conversation',
      'Are you sure you want to clear your conversation history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            const attachmentUris = chatStore.getAttachmentUris(userId);
            chatStore.clearHistory(userId);
            void removeAttachmentFiles(attachmentUris);
            setHandbookNotes({});
            loadMessages();
          },
        },
      ],
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer} testID="chat-empty-state">
      <View
        style={[
          styles.emptyIconBadge,
          { backgroundColor: colors.primary + '18' },
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
        { paddingBottom: bottomClearance },
      ]}
      onLayout={(e) => {
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
              { backgroundColor: colors.primary + '18' },
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
                  accessibilityState={{ checked: useHandbook }}
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
                { backgroundColor: isOnlineMode ? colors.white : colors.textSecondary },
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
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <ChatMessageItem
            item={item}
            handbookNote={handbookNotes[item.id]}
            onOpenAttachment={handleOpenAttachment}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          messages.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={
          isSending ? <TypingBubble label="lafina is thinking…" /> : null
        }
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        testID="chat-messages-list"
      />

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
        onSelectPrompt={(prompt) => handleSend(prompt)}
        showSuggestions={messages.length === 0}
        onFocus={() => {
          setIsKeyboardVisible(true);
          setTimeout(
            () => flatListRef.current?.scrollToEnd({ animated: true }),
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
          naturally in chat (for example, “Create a PDF study guide for Calculus”).
        </Text>
        {DOCUMENT_FORMAT_ORDER.map((format) => {
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

      {/* Lecture & Meeting Recorder Modal */}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
