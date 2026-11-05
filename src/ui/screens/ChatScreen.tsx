import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2, Sparkles, Bot } from 'lucide-react-native';
import { Fonts, Layout } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import type { ThemeColors } from '../contexts/ThemeContext';
import { chatStore, type ChatMessage } from '../../storage/chatStore';
import { chatOrchestrator } from '../../ai/chatOrchestrator';
import { ChatMessageItem } from '../components/chat/ChatMessageItem';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingBubble } from '../components/chat/TypingBubble';

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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [currentHeight, setCurrentHeight] = useState(0);
  const maxHeightRef = useRef<number>(0);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  // Floating bottom CustomTabBar clearance: bottomOffset + navbarHeight + gap
  const tabBarBottomOffset = Math.max(insets.bottom, 12) + 14;
  const tabBarClearance = tabBarBottomOffset + Layout.navbarHeight + 12;

  // Check if root view has already been shrunken by Android adjustResize or window inset
  const isWindowResized =
    maxHeightRef.current > 0 &&
    keyboardHeight > 0 &&
    maxHeightRef.current - currentHeight >= keyboardHeight * 0.7;

  // When keyboard is visible, lift ChatInput above keyboard cleanly:
  // If the window already resized to fit keyboard, only small padding is needed.
  // If the window did not resize (e.g. edge-to-edge), add keyboard height + margin.
  const keyboardPadding = isWindowResized
    ? Math.max(insets.bottom, 8)
    : keyboardHeight > 0
      ? keyboardHeight + 6
      : 8;

  const bottomNavReserve = isKeyboardVisible ? keyboardPadding : tabBarClearance;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      const kh = e.endCoordinates?.height ?? 0;
      setKeyboardHeight(kh);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
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

  const handleSend = async (overrideText?: string) => {
    const query = (overrideText || inputText).trim();
    if (!query || isSending) return;

    setInputText('');
    setIsSending(true);

    try {
      // Process message through offline assistant loop
      await chatOrchestrator.processMessage(userId, query);
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
            chatStore.clearHistory(userId);
            loadMessages();
          },
        },
      ],
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer} testID="chat-empty-state">
      <View style={[styles.emptyIconBadge, { backgroundColor: colors.primary + '18' }]}>
        <Bot size={36} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, themed.emptyTitle]}>LAFINA Academic Assistant</Text>
      <Text style={[styles.emptySubtitle, themed.emptySubtitle]}>
        Your offline secretary for university life. I can schedule your study blocks, set exact alarms for classes and deadlines, take notes, or read your schedule aloud.
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        themed.container,
        { paddingBottom: bottomNavReserve },
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
          <View style={[styles.headerBadge, { backgroundColor: colors.primary + '18' }]}>
            <Sparkles size={16} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.headerTitle, themed.headerTitle]}>LAFINA Assistant</Text>
            <Text style={[styles.headerSubtitle, themed.headerSubtitle]}>
              Offline Academic Secretary
            </Text>
          </View>
        </View>

        {messages.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearHistory}
            accessibilityRole="button"
            accessibilityLabel="Clear conversation history"
            testID="chat-clear-history-button"
          >
            <Trash2 size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatMessageItem item={item} />}
        contentContainerStyle={[
          styles.listContent,
          messages.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={isSending ? <TypingBubble label="lafina is thinking…" /> : null}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        testID="chat-messages-list"
      />

      {/* Bottom Input */}
      <ChatInput
        inputText={inputText}
        setInputText={setInputText}
        onSend={() => handleSend()}
        isSending={isSending}
        onSelectPrompt={(prompt) => handleSend(prompt)}
        showSuggestions={messages.length === 0}
        onFocus={() => {
          setIsKeyboardVisible(true);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  clearButton: {
    padding: 6,
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
  emptyTitle: {
    color: colors.textPrimary,
  },
  emptySubtitle: {
    color: colors.textSecondary,
  },
});
