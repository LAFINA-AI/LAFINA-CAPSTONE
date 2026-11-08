import React, {useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {
  Volume2,
  VolumeX,
  Sparkles,
  BookOpen,
  FileSpreadsheet,
  FileText,
  Presentation,
  Share2,
} from 'lucide-react-native';
import {Fonts, Shadows} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
import type {ChatAttachment, ChatMessage} from '../../../storage/chatStore';
import {
  DOCUMENT_FORMATS,
  formatFileSize,
  isDocumentFormat,
} from '../../../skills/documentSkill';
import {ttsService} from '../../../ai/tts/ttsService';
import {ChatReplyText} from './ChatReplyText';
import {hasWideMarkdownBlock} from '../../../utils';
import type {ChatReplyFormat} from '../../../storage/chatReplyFormatStore';

interface ChatMessageItemProps {
  item: ChatMessage;
  handbookNote?: string;
  onSpeak?: (text: string) => void | Promise<unknown>;
  onStopSpeaking?: () => void | Promise<unknown>;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  /** The reply is still being written: show it as it grows, without controls. */
  streaming?: boolean;
  /** How assistant replies are drawn; the user's own words are always shown as typed. */
  replyFormat?: ChatReplyFormat;
}

const AttachmentIcon: React.FC<{format: string; color: string}> = ({
  format,
  color,
}) => {
  switch (format) {
    case 'xlsx':
      return <FileSpreadsheet size={20} color={color} />;
    case 'pptx':
      return <Presentation size={20} color={color} />;
    default:
      return <FileText size={20} color={color} />;
  }
};

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  item,
  handbookNote,
  onSpeak,
  onStopSpeaking,
  onOpenAttachment,
  streaming = false,
  replyFormat = 'markdown',
}) => {
  const isUser = item.sender === 'user';
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const [isPlaying, setIsPlaying] = useState(false);

  const attachment = item.attachment ?? null;
  const attachmentMeta =
    attachment && isDocumentFormat(attachment.format)
      ? DOCUMENT_FORMATS[attachment.format]
      : null;
  const attachmentSubtitle = attachment
    ? [
        attachmentMeta?.label || attachment.format.toUpperCase(),
        formatFileSize(attachment.sizeBytes),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const handleToggleSpeak = async () => {
    if (isPlaying) {
      if (onStopSpeaking) await onStopSpeaking();
      else await ttsService.stop();
      setIsPlaying(false);
      return;
    }

    try {
      setIsPlaying(true);
      if (onSpeak) await onSpeak(item.content);
      else await ttsService.speak(item.content);
    } catch (err) {
      console.warn('[ChatMessageItem] TTS speak error:', err);
    } finally {
      setIsPlaying(false);
    }
  };

  const formattedTime = new Date(item.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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
            ? [styles.userBubble, {backgroundColor: colors.primary}]
            : [
                styles.assistantBubble,
                themed.assistantBubble,
                // Tables and code need the whole width of a phone to be read.
                replyFormat === 'markdown' &&
                  hasWideMarkdownBlock(item.content) &&
                  styles.wideBubble,
              ],
        ]}
        testID={`chat-bubble-${item.id}`}
      >
        {!isUser && (
          <View style={styles.assistantHeader}>
            <View
              style={[
                styles.avatarBadge,
                {backgroundColor: colors.primary + '18'},
              ]}
            >
              <Sparkles size={11} color={colors.primary} />
            </View>
            <Text style={[styles.assistantName, {color: colors.primary}]}>
              lafina
            </Text>
          </View>
        )}

        {isUser ? (
          <Text
            style={[styles.messageText, styles.userText]}
            testID="chat-message-content"
          >
            {item.content}
          </Text>
        ) : (
          <ChatReplyText
            content={item.content}
            format={replyFormat}
            textStyle={[styles.messageText, themed.assistantText]}
            streaming={streaming}
            testID={
              streaming ? 'chat-streaming-content' : 'chat-message-content'
            }
            trailing={
              streaming ? (
                <Text style={{color: colors.primary}} accessible={false}>
                  {' ▍'}
                </Text>
              ) : null
            }
          />
        )}

        {attachment && (
          <TouchableOpacity
            style={[styles.attachmentCard, themed.attachmentCard]}
            onPress={() => onOpenAttachment?.(attachment)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Open or share ${attachment.fileName}`}
            testID="chat-attachment-card"
          >
            <View
              style={[styles.attachmentIconWrap, themed.attachmentIconWrap]}
            >
              <AttachmentIcon format={attachment.format} color={colors.red} />
            </View>
            <View style={styles.attachmentTextWrap}>
              <Text
                style={[styles.attachmentTitle, themed.attachmentTitle]}
                numberOfLines={1}
              >
                {attachment.fileName}
              </Text>
              <Text
                style={[styles.attachmentSubtitle, themed.attachmentSubtitle]}
                numberOfLines={1}
              >
                {attachmentSubtitle}
              </Text>
            </View>
            <Share2 size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {!isUser && handbookNote ? (
          <View style={styles.handbookRow} testID="chat-handbook-citation">
            <BookOpen size={11} color={colors.textSecondary} />
            <Text style={[styles.handbookText, themed.assistantTime]}>
              {handbookNote}
            </Text>
          </View>
        ) : null}

        {!isUser && item.voiceInterrupted ? (
          <Text
            style={[styles.handbookText, styles.interruptedText, themed.assistantTime]}
            testID="chat-voice-interrupted"
          >
            Interrupted in voice conversation (not heard to the end)
          </Text>
        ) : null}

        {streaming ? null : (
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
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              accessibilityRole="button"
              accessibilityLabel={
                isPlaying ? 'Stop reading message' : 'Read message aloud'
              }
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
        )}
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
  wideBubble: {
    width: '100%',
    maxWidth: '100%',
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
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  attachmentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentTextWrap: {
    flex: 1,
  },
  attachmentTitle: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: 'bold',
  },
  attachmentSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 11,
    marginTop: 2,
  },
  handbookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  handbookText: {
    fontFamily: Fonts.body,
    fontSize: 10.5,
  },
  interruptedText: {
    marginTop: 6,
    fontStyle: 'italic',
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
  attachmentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  attachmentIconWrap: {
    backgroundColor: colors.cardBg,
  },
  attachmentTitle: {
    color: colors.textPrimary,
  },
  attachmentSubtitle: {
    color: colors.textSecondary,
  },
});
