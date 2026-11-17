import React, {forwardRef} from 'react';
import {StyleSheet, TextInput, TouchableOpacity, View} from 'react-native';
import {Send, Square} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../theme';

interface QuickChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** A request is running: Send becomes Stop. */
  busy: boolean;
  /** Quick Chat cannot take a message right now (for example, a card is open). */
  disabled?: boolean;
}

/**
 * Floating LAFINA (ADR-036): the slim Quick Chat composer. Multiline up to
 * four lines, focused when the panel opens. Send is disabled when the text is
 * empty; while a request runs it turns into Stop. The main chat input
 * (`ChatInput`) sets no length limit, so neither does this.
 */
export const QuickChatComposer = forwardRef<TextInput, QuickChatComposerProps>(
  ({value, onChangeText, onSend, onStop, busy, disabled = false}, ref) => {
    const {colors} = useTheme();
    const canSend = !busy && !disabled && value.trim().length > 0;

    return (
      <View style={styles.row}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          autoFocus
          multiline
          editable={!disabled}
          placeholder="Message LAFINA"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Message LAFINA"
          testID="quick-chat-input"
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              backgroundColor: colors.inputBg,
              borderColor: colors.border,
            },
          ]}
        />
        {busy ? (
          <TouchableOpacity
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel="Stop"
            testID="quick-chat-stop"
            style={[styles.button, {backgroundColor: colors.textSecondary}]}
          >
            <Square size={18} color={colors.surface} fill={colors.surface} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{disabled: !canSend}}
            testID="quick-chat-send"
            style={[
              styles.button,
              {
                backgroundColor: canSend
                  ? colors.primary
                  : colors.switchTrackOff,
              },
            ]}
          >
            <Send size={18} color={colors.textOnPrimary} />
          </TouchableOpacity>
        )}
      </View>
    );
  },
);

QuickChatComposer.displayName = 'QuickChatComposer';

const LINE_HEIGHT = 20;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 48,
    // Four lines plus padding.
    maxHeight: LINE_HEIGHT * 4 + Spacing.sm * 2 + 2,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: LINE_HEIGHT,
    textAlignVertical: 'center',
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
});
