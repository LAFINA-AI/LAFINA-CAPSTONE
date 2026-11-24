import React, {useMemo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Presentation,
  Share2,
  XCircle,
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
import {ChatReplyText} from './ChatReplyText';
import {MemoryNote} from './MemoryNote';
import {SourceNoteText} from './SourceNoteText';
import {hasWideMarkdownBlock} from '../../../utils';
import type {ChatReplyFormat} from '../../../storage/chatReplyFormatStore';

interface ChatMessageItemProps {
  item: ChatMessage;
  handbookNote?: string;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  /** The reply is still being written: show it as it grows, without controls. */
  streaming?: boolean;
  /** How assistant replies are drawn; the user's own words are always shown as typed. */
  replyFormat?: ChatReplyFormat;
  /** Undo for the memory change shown under a reply. */
  onUndoMemory?: (item: ChatMessage) => void;
  /** Developer timing for this reply (Developer Mode + performance tracking only). */
  timingLabel?: string;
  /** Opens the passages this reply's citation names ("See passages"). */
  onViewSources?: (item: ChatMessage) => void;
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

export const ChatMessageItem = React.memo(function MessageRow({
  item,
  handbookNote,
  onOpenAttachment,
  streaming = false,
  replyFormat = 'markdown',
  onUndoMemory,
  timingLabel,
  onViewSources,
}: ChatMessageItemProps) {
  const isUser = item.sender === 'user';
  const {colors, isDarkMode, isModern, modernPalette, modernShadows} =
    useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const assistantTextStyle = useMemo(
    () => [styles.messageText, themed.assistantText],
    [themed],
  );
  const reviewResolution = !isUser ? item.reviewResolution ?? null : null;
  const isConfirmedReview = reviewResolution?.status === 'confirmed';
  const isCancelledReview = reviewResolution?.status === 'cancelled';
  const confirmedBg = isModern
    ? modernPalette.mint
    : isDarkMode
    ? '#143326'
    : '#ECFDF5';
  const confirmedBorder = isModern
    ? isDarkMode
      ? '#2D6A54'
      : '#9AD8BE'
    : colors.success;
  const confirmedInk = isModern ? modernPalette.mintInk : colors.success;
  const cancelledBg = isModern ? modernPalette.surface : colors.surface;
  const cancelledBorder = isModern ? modernPalette.border : colors.border;
  const cancelledInk = isModern ? modernPalette.muted : colors.textSecondary;

  const attachment = item.attachment ?? null;
  const attachmentMeta =
    attachment && isDocumentFormat(attachment.format)
      ? DOCUMENT_FORMATS[attachment.format]
      : null;
  const attachmentSubtitle = attachment
    ? [
        attachmentMeta?.label || attachment.format.toUpperCase(),
        formatFileSize(attachment.sizeBytes),
        // Synced chat (ADR-040): the file stayed on the phone that has it.
        attachment.uri ? '' : 'On another phone',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

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
          isModern && {borderRadius: 22},
          isUser
            ? [
                styles.userBubble,
                {
                  backgroundColor: isModern
                    ? modernPalette.accent
                    : colors.primary,
                },
              ]
            : [
                styles.assistantBubble,
                themed.assistantBubble,
                isModern && [
                  styles.modernAssistantBubble,
                  modernShadows.subtle,
                  {
                    backgroundColor: modernPalette.card,
                    borderColor: modernPalette.border,
                  },
                ],
                isConfirmedReview && {
                  backgroundColor: confirmedBg,
                  borderColor: confirmedBorder,
                },
                isCancelledReview && {
                  backgroundColor: cancelledBg,
                  borderColor: cancelledBorder,
                },
                // Tables and code need the whole width of a phone to be read.
                replyFormat === 'markdown' &&
                  hasWideMarkdownBlock(item.content) &&
                  styles.wideBubble,
              ],
        ]}
        testID={`chat-bubble-${item.id}`}
      >
        {isConfirmedReview ? (
          <View
            style={styles.reviewStatusHeader}
            testID="chat-review-confirmed-badge"
          >
            <CheckCircle2 size={15} color={confirmedInk} />
            <Text style={[styles.reviewStatusText, {color: confirmedInk}]}>
              Confirmed · Saved
            </Text>
          </View>
        ) : isCancelledReview ? (
          <View
            style={styles.reviewStatusHeader}
            testID="chat-review-cancelled-badge"
          >
            <XCircle size={15} color={cancelledInk} />
            <Text style={[styles.reviewStatusText, {color: cancelledInk}]}>
              Cancelled · Not saved
            </Text>
          </View>
        ) : null}

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
            textStyle={assistantTextStyle}
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

        {reviewResolution?.summary ? (
          <View
            style={[
              styles.reviewSummaryBox,
              {
                borderTopColor: isConfirmedReview
                  ? confirmedBorder
                  : cancelledBorder,
              },
            ]}
            testID="chat-review-resolution-summary"
          >
            <Text
              style={[
                styles.reviewSummaryText,
                {color: isConfirmedReview ? confirmedInk : cancelledInk},
              ]}
            >
              {reviewResolution.summary}
            </Text>
          </View>
        ) : null}

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
          <View
            style={[
              styles.handbookRow,
              isModern && [
                styles.modernHandbookPill,
                {
                  backgroundColor: modernPalette.softViolet,
                  borderColor: modernPalette.accent + '28',
                },
              ],
            ]}
            testID="chat-handbook-citation"
          >
            <View style={styles.handbookIconWrap}>
              <BookOpen
                size={12}
                color={isModern ? modernPalette.accent : colors.textSecondary}
              />
            </View>
            <SourceNoteText
              note={handbookNote}
              style={[
                styles.handbookText,
                themed.assistantTime,
                isModern && {color: modernPalette.accent, fontWeight: '600'},
              ]}
              linkColor={isModern ? modernPalette.accent : colors.primary}
            />
          </View>
        ) : null}

        {!isUser &&
        handbookNote &&
        onViewSources &&
        !streaming &&
        (item.sourcePassageIds?.length ?? 0) > 0 ? (
          <TouchableOpacity
            style={styles.viewSourcesButton}
            onPress={() => onViewSources(item)}
            accessibilityRole="button"
            accessibilityLabel="See the passages this answer used"
            hitSlop={8}
            testID="chat-handbook-view-sources"
          >
            <Text
              style={[
                styles.viewSourcesText,
                {color: isModern ? modernPalette.accent : colors.primary},
              ]}
            >
              See passages ›
            </Text>
          </TouchableOpacity>
        ) : null}

        {!isUser && item.voiceInterrupted ? (
          <Text
            style={[
              styles.handbookText,
              styles.interruptedText,
              themed.assistantTime,
            ]}
            testID="chat-voice-interrupted"
          >
            Interrupted in Call Lafina (not heard to the end)
          </Text>
        ) : null}

        {!isUser && !streaming && item.memoryChanges ? (
          <MemoryNote
            messageId={item.id}
            changes={item.memoryChanges}
            onUndo={onUndoMemory ? () => onUndoMemory(item) : undefined}
          />
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
          </View>
        )}
        {!isUser && !streaming && timingLabel ? (
          <Text
            style={[styles.timingText, themed.assistantTime]}
            accessibilityLabel={`Developer timing: ${timingLabel}`}
            testID={`chat-timing-${item.id}`}
          >
            {timingLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

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
  modernAssistantBubble: {
    borderBottomLeftRadius: 6,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 10,
  },
  reviewStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  reviewStatusText: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  reviewSummaryBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewSummaryText: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  wideBubble: {
    width: '100%',
    maxWidth: '100%',
  },
  messageText: {
    fontFamily: Fonts.body,
    fontSize: 14.5,
    lineHeight: 22,
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
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    maxWidth: '100%',
  },
  modernHandbookPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
  },
  handbookIconWrap: {
    height: 15,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  handbookText: {
    flexShrink: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    lineHeight: 15,
    includeFontPadding: false,
  },
  viewSourcesButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 2,
  },
  viewSourcesText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
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
  timingText: {
    fontFamily: Fonts.body,
    fontSize: 10.5,
    marginTop: 2,
  },
  userTime: {
    color: 'rgba(255, 255, 255, 0.75)',
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
