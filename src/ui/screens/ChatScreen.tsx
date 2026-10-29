import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Trash2, Sparkles, Bot } from 'lucide-react-native';
import { Fonts } from '../theme';
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
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

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
    <KeyboardAvoidingView
      style={[styles.container, themed.container]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
        ListFooterComponent={isSending ? <TypingBubble label="LAFINA is thinking…" /> : null}
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
      />
    </KeyboardAvoidingView>
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
