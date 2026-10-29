import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Volume2, VolumeX, Sparkles } from 'lucide-react-native';
import { Fonts, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import type { ThemeColors } from '../../contexts/ThemeContext';
import type { ChatMessage } from '../../../storage/chatStore';
import { ttsService } from '../../../ai/tts/ttsService';

interface ChatMessageItemProps {
  item: ChatMessage;
  onSpeak?: (text: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ item, onSpeak }) => {
  const isUser = item.sender === 'user';
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleToggleSpeak = async () => {
    if (isPlaying) {
      await ttsService.stop();
      setIsPlaying(false);
      return;
    }

    if (onSpeak) {
      onSpeak(item.content);
      return;
    }

    try {
      setIsPlaying(true);
      await ttsService.speak(item.content);
    } catch (err) {
      console.warn('[ChatMessageItem] TTS speak error:', err);
    } finally {
      setIsPlaying(false);
    }
  };

  const formattedTime = new Date(item.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}
      testID={`chat-message-${item.id}`}
    >
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.primary }]
            : [styles.assistantBubble, themed.assistantBubble],
        ]}
      >
        {!isUser && (
          <View style={styles.assistantHeader}>
            <View style={[styles.avatarBadge, { backgroundColor: colors.primary + '18' }]}>
              <Sparkles size={11} color={colors.primary} />
            </View>
            <Text style={[styles.assistantName, { color: colors.primary }]}>LAFINA</Text>
          </View>
        )}

        <Text
          style={[
            styles.messageText,
            isUser ? styles.userText : themed.assistantText,
          ]}
          testID="chat-message-content"
        >
          {item.content}
        </Text>

        <View style={styles.footerRow}>
          <Text
            style={[
              styles.timeText,
              isUser ? styles.userTime : themed.assistantTime,
            ]}
          >
            {formattedTime}
          </Text>

          {!isUser && (
            <TouchableOpacity
              style={styles.speakButton}
              onPress={handleToggleSpeak}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Stop reading message' : 'Read message aloud'}
              testID={`chat-speak-btn-${item.id}`}
            >
              {isPlaying ? (
                <VolumeX size={14} color={colors.primary} />
              ) : (
                <Volume2 size={14} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    marginVertical: 5,
    width: '100%',
    paddingHorizontal: 16,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    ...Shadows.card,
  },
  userBubble: {
    borderBottomRightRadius: 3,
  },
  assistantBubble: {
    borderBottomLeftRadius: 3,
    borderWidth: 1,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  avatarBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  assistantName: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  messageText: {
    fontFamily: Fonts.body,
    fontSize: 14.5,
    lineHeight: 21,
  },
  userText: {
    color: '#FFFFFF',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  timeText: {
    fontFamily: Fonts.body,
    fontSize: 10.5,
  },
  userTime: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  speakButton: {
    marginLeft: 8,
    padding: 2,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  assistantBubble: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  assistantText: {
    color: colors.textPrimary,
  },
  assistantTime: {
    color: colors.textSecondary,
  },
});
