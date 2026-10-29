import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Text,
} from 'react-native';
import { Send, Sparkles } from 'lucide-react-native';
import { Fonts, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import type { ThemeColors } from '../../contexts/ThemeContext';

export interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  onSend: () => void;
  isSending?: boolean;
  onSelectPrompt?: (prompt: string) => void;
  showSuggestions?: boolean;
}

const SUGGESTED_PROMPTS = [
  "What's on my schedule today?",
  'Add study block for Math tomorrow from 2pm to 4pm',
  'Remind me tomorrow at 9am to submit lab report',
  'Take a note: Operating Systems lecture topics',
];

export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  setInputText,
  onSend,
  isSending = false,
  onSelectPrompt,
  showSuggestions = true,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const handlePromptPress = (prompt: string) => {
    if (onSelectPrompt) {
      onSelectPrompt(prompt);
    } else {
      setInputText(prompt);
    }
  };

  return (
    <View style={[styles.container, themed.container]}>
      {showSuggestions && !inputText && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsScroll}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTED_PROMPTS.map((prompt, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.suggestionChip, themed.suggestionChip]}
              onPress={() => handlePromptPress(prompt)}
              activeOpacity={0.7}
              testID={`chat-prompt-chip-${index}`}
            >
              <Sparkles size={11} color={colors.primary} style={styles.chipIcon} />
              <Text style={[styles.suggestionText, themed.suggestionText]}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, themed.input]}
          placeholder="Ask LAFINA or add a schedule item…"
          placeholderTextColor={colors.textSecondary}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={onSend}
          returnKeyType="send"
          multiline={false}
          editable={!isSending}
          testID="chat-text-input"
        />
        <TouchableOpacity
          onPress={onSend}
          style={[
            styles.sendButton,
            { backgroundColor: colors.primary },
            (!inputText.trim() || isSending) && styles.sendDisabled,
          ]}
          disabled={!inputText.trim() || isSending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          testID="chat-send-button"
        >
          <Send size={18} color={colors.textOnPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  suggestionsScroll: {
    paddingBottom: 8,
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipIcon: {
    marginRight: 6,
  },
  suggestionText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 18,
    fontFamily: Fonts.body,
    fontSize: 14.5,
    borderWidth: 1,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  sendDisabled: {
    opacity: 0.45,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  container: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
  },
  suggestionChip: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  suggestionText: {
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
});
