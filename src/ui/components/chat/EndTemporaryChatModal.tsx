import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {MessageCircleDashed, RotateCcw, Trash2, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, Layout, ModernLayout, Shadows} from '../../theme';

export interface EndTemporaryChatModalProps {
  visible: boolean;
  /** Number of in-memory messages currently in the temporary conversation. */
  messageCount?: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Theme-adaptive confirmation dialog shown before exiting Temporary Chat.
 * Adapts surfaces, radii, shadows, and accent tokens across Classic Light/Dark
 * and every Modern theme palette.
 */
export const EndTemporaryChatModal: React.FC<EndTemporaryChatModalProps> = ({
  visible,
  messageCount = 0,
  onCancel,
  onConfirm,
}) => {
  const {colors, isDarkMode, isModern, modernPalette, modernShadows} =
    useTheme();
  const {width} = useWindowDimensions();

  if (!visible) {
    return null;
  }

  const safeWidth = width > 0 ? width : 360;
  const isCompact = safeWidth < 360;
  const hasMessages = messageCount > 0;

  const cardBg = isModern ? modernPalette.card : colors.cardBg;
  const surfaceBg = isModern ? modernPalette.surface : colors.inputBg;
  const borderColor = isModern ? modernPalette.border : colors.border;
  const textPrimary = isModern ? modernPalette.text : colors.textPrimary;
  const textSecondary = isModern ? modernPalette.muted : colors.textSecondary;
  const accentColor = isModern ? modernPalette.accent : colors.primary;
  const accentSoftBg = isModern
    ? modernPalette.softViolet
    : `${colors.primary}16`;
  const accentBorder = isModern
    ? `${modernPalette.accent}38`
    : `${colors.primary}38`;

  const dangerInk = isModern ? modernPalette.danger : colors.error;
  const dangerSoftBg = isModern
    ? modernPalette.dangerSoft
    : isDarkMode
    ? '#3A1D24'
    : '#FDECEC';
  const dangerBorder = isModern
    ? `${modernPalette.danger}34`
    : `${colors.error}34`;

  const safeInk = isModern ? modernPalette.mintInk : colors.success;
  const safeSoftBg = isModern
    ? modernPalette.mint
    : isDarkMode
    ? '#143326'
    : '#ECFDF5';
  const safeBorder = isModern
    ? `${modernPalette.mintInk}30`
    : `${colors.success}34`;

  const cardRadius = isModern
    ? ModernLayout.borderRadiusCard
    : Layout.borderRadiusCard;
  const subCardRadius = isModern ? ModernLayout.borderRadiusSubCard : 12;
  const buttonRadius = isModern ? 16 : Layout.borderRadiusButton;
  const cardShadow = isModern ? modernShadows.floating : Shadows.card;

  const badgeLabel = hasMessages
    ? `${messageCount} UNSAVED ${messageCount === 1 ? 'MESSAGE' : 'MESSAGES'}`
    : 'TEMPORARY SESSION';

  const summaryText = hasMessages
    ? 'Leaving temporary mode clears this in-memory conversation and brings back your saved chat.'
    : 'Leave temporary mode and return to your saved conversations.';

  const clearedBody = hasMessages
    ? `${messageCount} temporary ${
        messageCount === 1 ? 'message' : 'messages'
      } will be discarded and not saved to history.`
    : 'No messages were sent — nothing will be added to your chat history.';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
      testID="end-temp-chat-modal"
    >
      <View
        style={[
          styles.backdrop,
          {
            backgroundColor: colors.overlay,
            paddingHorizontal: isCompact ? 16 : 22,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Keep temporary chat"
          testID="end-temp-chat-backdrop"
        />

        <View
          accessibilityViewIsModal
          testID="end-temp-chat-card"
          style={[
            styles.card,
            cardShadow,
            {
              backgroundColor: cardBg,
              borderColor,
              borderRadius: cardRadius,
            },
          ]}
        >
          <View
            testID="end-temp-chat-accent-bar"
            style={[styles.topAccentBar, {backgroundColor: accentColor}]}
          />

          <View
            style={[
              styles.content,
              {
                paddingHorizontal: isCompact ? 16 : 20,
                paddingTop: isCompact ? 16 : 18,
                paddingBottom: isCompact ? 16 : 20,
              },
            ]}
          >
            <View style={styles.headerRow}>
              <View
                style={[
                  styles.iconHalo,
                  {
                    width: isCompact ? 40 : 44,
                    height: isCompact ? 40 : 44,
                    borderRadius: isCompact ? 14 : 16,
                    backgroundColor: accentSoftBg,
                    borderColor: accentBorder,
                  },
                ]}
              >
                <MessageCircleDashed
                  size={isCompact ? 19 : 21}
                  color={accentColor}
                  strokeWidth={2.2}
                />
              </View>

              <View style={styles.headerTitleCol}>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: accentSoftBg,
                      borderColor: accentBorder,
                    },
                  ]}
                >
                  <Text
                    style={[styles.statusBadgeText, {color: accentColor}]}
                    numberOfLines={1}
                  >
                    {badgeLabel}
                  </Text>
                </View>

                <Text
                  testID="end-temp-chat-title"
                  accessibilityRole="header"
                  style={[
                    styles.title,
                    {
                      color: textPrimary,
                      fontSize: isCompact ? 18 : 19.5,
                    },
                  ]}
                  numberOfLines={1}
                >
                  End Temporary Chat?
                </Text>
              </View>

              <TouchableOpacity
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Close end temporary chat dialog"
                testID="end-temp-chat-close-btn"
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                style={[
                  styles.closeBtn,
                  {
                    backgroundColor: surfaceBg,
                    borderColor,
                  },
                ]}
              >
                <X size={16} color={textSecondary} />
              </TouchableOpacity>
            </View>

            <Text
              testID="end-temp-chat-message"
              style={[
                styles.message,
                {
                  color: textSecondary,
                  fontSize: isCompact ? 13 : 13.5,
                  lineHeight: isCompact ? 18.5 : 19.5,
                },
              ]}
            >
              {summaryText}
            </Text>

            <View style={styles.impactStack}>
              <View
                testID="end-temp-chat-cleared-card"
                style={[
                  styles.impactCard,
                  {
                    backgroundColor: dangerSoftBg,
                    borderColor: dangerBorder,
                    borderRadius: subCardRadius,
                    padding: isCompact ? 10 : 12,
                  },
                ]}
              >
                <View
                  style={[
                    styles.impactIconBox,
                    {
                      backgroundColor: cardBg,
                      borderColor: dangerBorder,
                    },
                  ]}
                >
                  <Trash2 size={14} color={dangerInk} />
                </View>
                <View style={styles.impactBody}>
                  <Text style={[styles.impactTitle, {color: dangerInk}]}>
                    Cleared on exit
                  </Text>
                  <Text style={[styles.impactText, {color: textSecondary}]}>
                    {clearedBody}
                  </Text>
                </View>
              </View>

              <View
                testID="end-temp-chat-restored-card"
                style={[
                  styles.impactCard,
                  {
                    backgroundColor: safeSoftBg,
                    borderColor: safeBorder,
                    borderRadius: subCardRadius,
                    padding: isCompact ? 10 : 12,
                  },
                ]}
              >
                <View
                  style={[
                    styles.impactIconBox,
                    {
                      backgroundColor: cardBg,
                      borderColor: safeBorder,
                    },
                  ]}
                >
                  <RotateCcw size={14} color={safeInk} />
                </View>
                <View style={styles.impactBody}>
                  <Text style={[styles.impactTitle, {color: safeInk}]}>
                    Saved chats restored
                  </Text>
                  <Text style={[styles.impactText, {color: textSecondary}]}>
                    Your previous conversation, tasks, notes, and memories
                    remain untouched.
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Keep temporary chat"
                testID="end-temp-chat-cancel-btn"
                style={[
                  styles.button,
                  styles.cancelButton,
                  {
                    backgroundColor: surfaceBg,
                    borderColor,
                    borderRadius: buttonRadius,
                    minHeight: isCompact ? 42 : 46,
                  },
                ]}
              >
                <Text style={[styles.buttonText, {color: textPrimary}]}>
                  Keep Chat
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onConfirm}
                accessibilityRole="button"
                accessibilityLabel="End temporary chat"
                testID="end-temp-chat-confirm-btn"
                style={[
                  styles.button,
                  isModern && modernShadows.subtle,
                  {
                    backgroundColor: accentColor,
                    borderRadius: buttonRadius,
                    minHeight: isCompact ? 42 : 46,
                  },
                ]}
              >
                <Text
                  style={[styles.buttonText, {color: colors.textOnPrimary}]}
                >
                  End Chat
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 372,
    borderWidth: 1,
    overflow: 'hidden',
  },
  topAccentBar: {
    height: 4,
    width: '100%',
  },
  content: {
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconHalo: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  statusBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: Fonts.heading,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  message: {
    fontFamily: Fonts.body,
  },
  impactStack: {
    gap: 8,
  },
  impactCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
  },
  impactIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  impactBody: {
    flex: 1,
    gap: 2,
  },
  impactTitle: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
  },
  impactText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  button: {
    flex: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
});
