import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Cloud, Paperclip} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing, type ThemeColors} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';

/** Explains the account setting, rather than claiming every upload is complete. */
export function ChatSyncNotice({
  onChoice,
}: {
  onChoice: (keepSyncing: boolean) => void;
}) {
  const {colors} = useTheme();
  const themed = useThemedStyles(themeStyles);
  return (
    <View style={[styles.card, themed.card]} testID="chat-sync-notice">
      <View style={styles.headingRow}>
        <View style={[styles.icon, themed.icon]} accessible={false}>
          <Cloud size={22} color={colors.primary} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, themed.title]}>
          Chat history sync is on
        </Text>
      </View>
      <Text style={[styles.body, themed.body]}>
        Your chats sync to your account when you’re online. Pick up where you
        left off on another phone.
      </Text>
      <View style={[styles.attachment, themed.attachment]}>
        <View accessible={false}>
          <Paperclip size={16} color={colors.textSecondary} />
        </View>
        <Text style={[styles.detail, themed.body]}>
          Attached files stay on this phone.
        </Text>
      </View>
      <Pressable
        onPress={() => onChoice(true)}
        accessibilityRole="button"
        accessibilityLabel="Keep syncing chat history"
        testID="chat-sync-notice-keep"
        style={({pressed}) => [
          styles.button,
          themed.primary,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.buttonText, themed.primaryText]}>
          Keep syncing
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChoice(false)}
        accessibilityRole="button"
        accessibilityLabel="Keep chat history on this phone only"
        accessibilityHint="Stops future chat syncing. Your existing cloud copy is kept."
        testID="chat-sync-notice-off"
        style={({pressed}) => [
          styles.button,
          themed.secondary,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.buttonText, themed.title]}>
          Use this phone only
        </Text>
      </Pressable>
      <Text style={[styles.footnote, themed.body]}>
        Change this anytime in Preferences. Turning sync off keeps your existing
        cloud copy.
      </Text>
    </View>
  );
}

const themeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {backgroundColor: colors.surface, borderColor: colors.border},
    icon: {backgroundColor: colors.background},
    title: {color: colors.textPrimary},
    body: {color: colors.textSecondary},
    attachment: {borderColor: colors.border},
    primary: {backgroundColor: colors.primary},
    primaryText: {color: colors.textOnPrimary},
    secondary: {borderColor: colors.border},
  });
const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  headingRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.md},
  icon: {
    width: 44,
    height: 44,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    lineHeight: 25,
  },
  body: {fontFamily: Fonts.body, fontSize: FontSize.body, lineHeight: 21},
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detail: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
  },
  button: {
    minHeight: 48,
    padding: Spacing.md,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {borderWidth: 1},
  buttonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    textAlign: 'center',
  },
  footnote: {fontFamily: Fonts.body, fontSize: FontSize.small, lineHeight: 18},
  pressed: {opacity: 0.72},
});
