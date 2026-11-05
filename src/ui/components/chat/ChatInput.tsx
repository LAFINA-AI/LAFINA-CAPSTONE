import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Text,
} from 'react-native';
import { FilePlus2, FileText, Send, Sparkles, X } from 'lucide-react-native';
import { Fonts, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import type { ThemeColors } from '../../contexts/ThemeContext';
import {
  DOCUMENT_FORMATS,
  type DocumentFormat,
} from '../../../skills/documentSkill';

export interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  onSend: () => void;
  isSending?: boolean;
  isOnlineMode?: boolean;
  selectedFormat?: DocumentFormat | null;
  onOpenFormatPicker?: () => void;
  onClearFormat?: () => void;
  onSelectPrompt?: (prompt: string) => void;
  showSuggestions?: boolean;
  onFocus?: () => void;
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
  isOnlineMode = false,
  selectedFormat = null,
  onOpenFormatPicker,
  onClearFormat,
  onSelectPrompt,
  showSuggestions = true,
  onFocus,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const formatMeta = selectedFormat ? DOCUMENT_FORMATS[selectedFormat] : null;
  const placeholder = formatMeta
    ? `Describe the ${formatMeta.shortLabel} file…`
    : isOnlineMode
      ? 'Ask lafina or request a file…'
      : 'Ask lafina or add a schedule item…';

  const handlePromptPress = (prompt: string) => {
    if (onSelectPrompt) {
      onSelectPrompt(prompt);
    } else {
      setInputText(prompt);
    }
  };

  return (
    <View style={[styles.container, themed.container]}>
      {showSuggestions && !inputText && !formatMeta && (
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
              <Sparkles
                size={11}
                color={colors.primary}
                style={styles.chipIcon}
              />
              <Text style={[styles.suggestionText, themed.suggestionText]}>
                {prompt}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {formatMeta && (
        <View style={[styles.formatPill, themed.formatPill]}>
          <FileText size={13} color={colors.red} />
          <Text style={[styles.formatPillText, themed.formatPillText]}>
            Creating a {formatMeta.shortLabel} file
          </Text>
          {onClearFormat && (
            <TouchableOpacity
              onPress={onClearFormat}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Cancel ${formatMeta.label}`}
              testID="chat-clear-format-button"
            >
              <X size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.inputRow}>
        {onOpenFormatPicker && (
          <TouchableOpacity
            style={[
              styles.attachButton,
              themed.attachButton,
              formatMeta && themed.attachButtonActive,
            ]}
            onPress={onOpenFormatPicker}
            disabled={isSending}
            accessibilityRole="button"
            accessibilityLabel="Create a document file"
            testID="chat-document-format-button"
          >
            <FilePlus2
              size={18}
              color={formatMeta ? colors.red : colors.textSecondary}
            />
          </TouchableOpacity>
        )}
        <TextInput
          style={[styles.input, themed.input]}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          cursorColor={colors.primary}
          selectionColor={colors.primary + '40'}
          value={inputText}
          onChangeText={setInputText}
          onFocus={onFocus}
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
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionsScroll: {
    paddingBottom: 6,
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  formatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 6,
  },
  formatPillText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: 'bold',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 0,
    textAlignVertical: 'center',
    fontFamily: Fonts.body,
    fontSize: 14,
    borderWidth: 1,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    borderBottomColor: colors.border,
  },
  suggestionChip: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  suggestionText: {
    color: colors.textSecondary,
  },
  formatPill: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  formatPillText: {
    color: colors.textPrimary,
  },
  attachButton: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  attachButtonActive: {
    borderColor: colors.red,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
});
