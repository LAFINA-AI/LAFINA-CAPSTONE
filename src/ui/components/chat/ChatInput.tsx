import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Text,
  ActivityIndicator,
  Vibration,
  Alert,
  GestureResponderEvent,
} from 'react-native';
import { FileText, Mic, Plus, Send, Sparkles, X } from 'lucide-react-native';
import { Fonts, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import type { ThemeColors } from '../../contexts/ThemeContext';
import {
  DOCUMENT_FORMATS,
  type DocumentFormat,
} from '../../../skills/documentSkill';
import {
  sttService,
  type OfflineSpeechCaptureHandle,
} from '../../../ai/stt/sttService';

export interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  onSend: (overrideText?: string) => void;
  isSending?: boolean;
  isOnlineMode?: boolean;
  selectedFormat?: DocumentFormat | null;
  onOpenFormatPicker?: () => void;
  onClearFormat?: () => void;
  onSelectPrompt?: (prompt: string) => void;
  showSuggestions?: boolean;
  placeholderOverride?: string;
  onFocus?: () => void;
}

export const SUGGESTED_PROMPTS = [
  "What's on my schedule today?",
  'Add study block for Math tomorrow from 2pm to 4pm',
  'Remind me tomorrow at 9am to submit lab report',
  'Take a note: Operating Systems lecture topics',
];

export const USTP_SUGGESTED_PROMPTS = [
  "What are the requirements for the Dean's List?",
  'How does the USTP grading system and GPA work?',
  'What is the retention policy and maximum academic load?',
  'What are the USTP rules on attendance and excused absences?',
];

/**
 * Detects common Whisper hallucination artifacts generated from silence,
 * background rustling, or brief audio glitches.
 */
export const isHallucinatedSpeech = (rawText: string): boolean => {
  const clean = rawText
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim();
  if (!clean || clean.length < 2) return true;
  const commonGhosts = new Set([
    'you',
    'thank you',
    'thanks',
    'thanks for watching',
    'thank you for watching',
    'subtitles by',
    'translated by',
    'bye',
    'goodbye',
    'silence',
    'music',
    'audio',
    'the end',
  ]);
  return commonGhosts.has(clean);
};

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
  showSuggestions = false,
  placeholderOverride,
  onFocus,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const formatMeta = selectedFormat ? DOCUMENT_FORMATS[selectedFormat] : null;
  const placeholder = formatMeta
    ? `Describe the ${formatMeta.shortLabel} file…`
    : placeholderOverride
      ? placeholderOverride
      : isOnlineMode
        ? 'Ask lafina or request a file…'
        : 'Ask lafina or add a schedule item…';

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  const activeCaptureRef = useRef<OfflineSpeechCaptureHandle | null>(null);
  const isRecordingRef = useRef(false);
  const isCancelledRef = useRef(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const pressStartTimeRef = useRef(0);

  const hasText = Boolean(inputText && inputText.trim().length > 0);

  // Clean up native audio capture on unmount if in-flight
  useEffect(() => {
    return () => {
      if (activeCaptureRef.current) {
        void sttService.cancelListening(activeCaptureRef.current.captureId);
        activeCaptureRef.current = null;
      }
    };
  }, []);

  const handlePromptPress = (prompt: string) => {
    if (onSelectPrompt) {
      onSelectPrompt(prompt);
    } else {
      setInputText(prompt);
    }
  };

  const handleMicPressIn = async (event: GestureResponderEvent) => {
    if (isSending || isTranscribing || isRecordingRef.current) return;

    touchStartXRef.current = event.nativeEvent.pageX;
    touchStartYRef.current = event.nativeEvent.pageY;
    pressStartTimeRef.current = Date.now();
    isCancelledRef.current = false;
    setIsCancelled(false);

    try {
      const hasPermission = await sttService.ensureMicrophonePermission();
      if (!hasPermission) {
        Alert.alert(
          'Microphone Permission',
          'LAFINA needs microphone access to record and transcribe your voice.',
        );
        return;
      }

      try {
        Vibration.vibrate(30);
      } catch {}

      const handle = sttService.startListening({
        mode: 'manual',
        context: 'main_mic',
      });

      activeCaptureRef.current = handle;
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (error: any) {
      console.warn('[ChatInput] Could not start speech capture:', error);
      activeCaptureRef.current = null;
      isRecordingRef.current = false;
      setIsRecording(false);
      Alert.alert(
        'Microphone Unavailable',
        error?.message || 'Unable to record voice right now. Try again.',
      );
    }
  };

  const handleTouchMove = (event: GestureResponderEvent) => {
    if (!isRecordingRef.current) return;
    // Once latched as cancelled, it remains permanently cancelled for this touch
    if (isCancelledRef.current) return;

    const deltaX = touchStartXRef.current - event.nativeEvent.pageX;
    const deltaY = touchStartYRef.current - event.nativeEvent.pageY;

    // Slid left (> 30px) or slid upwards (> 40px) triggers cancel latch
    if (deltaX > 30 || deltaY > 40) {
      isCancelledRef.current = true;
      setIsCancelled(true);
      try {
        Vibration.vibrate(40);
      } catch {}

      // Immediately cancel native recording in background so no speech is captured
      const handle = activeCaptureRef.current;
      if (handle) {
        void sttService.cancelListening(handle.captureId).catch(() => undefined);
      }
    }
  };

  const handleTouchCancel = async () => {
    if (!isRecordingRef.current) return;
    isCancelledRef.current = true;
    setIsCancelled(true);
    const handle = activeCaptureRef.current;
    activeCaptureRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);
    if (handle) {
      try {
        await sttService.cancelListening(handle.captureId);
      } catch (err) {
        console.warn('[ChatInput] Error cancelling on touchCancel:', err);
      }
    }
    setIsCancelled(false);
    isCancelledRef.current = false;
  };

  const handleManualCancel = async () => {
    if (!isRecordingRef.current) return;
    isCancelledRef.current = true;
    setIsCancelled(true);
    try {
      Vibration.vibrate(25);
    } catch {}
    const handle = activeCaptureRef.current;
    activeCaptureRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);
    if (handle) {
      try {
        await sttService.cancelListening(handle.captureId);
      } catch {}
    }
    setIsCancelled(false);
    isCancelledRef.current = false;
  };

  const handleMicPressOut = async () => {
    if (!isRecordingRef.current) return;

    const handle = activeCaptureRef.current;
    activeCaptureRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);

    if (!handle) return;

    // If cancelled by sliding or tapping, discard audio immediately
    if (isCancelledRef.current) {
      setIsCancelled(false);
      isCancelledRef.current = false;
      try {
        await sttService.cancelListening(handle.captureId);
      } catch (err) {
        console.warn('[ChatInput] Error cancelling speech capture:', err);
      }
      return;
    }

    // Minimum hold duration check (quick accidental taps or fast slides under 350ms are discarded)
    const durationMs = Date.now() - pressStartTimeRef.current;
    if (durationMs < 350 && process.env.NODE_ENV !== 'test') {
      try {
        await sttService.cancelListening(handle.captureId);
      } catch {}
      return;
    }

    // Otherwise stop listening and await transcription
    setIsTranscribing(true);
    try {
      await sttService.stopListening(handle.captureId);
      const result = await handle.result;
      setIsTranscribing(false);

      if (result.cancelled) return;

      // Reject utterances where Silero VAD did not detect genuine human speech
      if (!result.speechDetected) {
        console.log('[ChatInput] No speech detected by VAD, discarding audio.');
        return;
      }

      const text = result.transcript ? result.transcript.trim() : '';
      if (!text || isHallucinatedSpeech(text)) {
        console.log('[ChatInput] Discarding empty or hallucinated speech artifact:', text);
        return;
      }

      onSend(text);
    } catch (err) {
      setIsTranscribing(false);
      console.warn('[ChatInput] Error transcribing voice:', err);
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
            disabled={isSending || isRecording || isTranscribing}
            accessibilityRole="button"
            accessibilityLabel="Add attachment, scan schedule, or create document"
            testID="chat-document-format-button"
          >
            <Plus
              size={20}
              color={formatMeta ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        )}

        {isRecording || isTranscribing ? (
          <View style={[styles.recordingContainer, themed.recordingContainer]}>
            {isTranscribing ? (
              <View style={styles.recordingStatusRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.recordingText, themed.recordingText]}>
                  Transcribing voice…
                </Text>
              </View>
            ) : isCancelled ? (
              <View style={styles.recordingStatusRow}>
                <X size={15} color={colors.red} />
                <Text style={[styles.recordingCancelText, { color: colors.red }]}>
                  Release to cancel
                </Text>
              </View>
            ) : (
              <View style={styles.recordingStatusRow}>
                <View style={[styles.recordingDot, { backgroundColor: colors.red }]} />
                <Text style={[styles.recordingText, themed.recordingText]}>
                  Listening…
                </Text>
                <TouchableOpacity
                  onPress={handleManualCancel}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel recording"
                  style={styles.cancelTapTarget}
                >
                  <Text style={[styles.cancelHintText, { color: colors.textSecondary }]}>
                    slide ← cancel
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <TextInput
            style={[styles.input, themed.input]}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            cursorColor={colors.primary}
            selectionColor={colors.primary + '40'}
            value={inputText}
            onChangeText={setInputText}
            onFocus={onFocus}
            onSubmitEditing={() => onSend()}
            returnKeyType="send"
            multiline={false}
            editable={!isSending}
            testID="chat-text-input"
          />
        )}

        {hasText ? (
          <TouchableOpacity
            onPress={() => onSend()}
            style={[
              styles.sendButton,
              { backgroundColor: colors.primary },
              isSending && styles.sendDisabled,
            ]}
            disabled={isSending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            testID="chat-send-button"
          >
            <Send size={18} color={colors.textOnPrimary} />
          </TouchableOpacity>
        ) : (
          <Pressable
            onPressIn={handleMicPressIn}
            onPressOut={handleMicPressOut}
            onTouchMove={handleTouchMove}
            onTouchCancel={handleTouchCancel}
            onResponderTerminate={handleTouchCancel}
            style={({ pressed }) => [
              styles.sendButton,
              isRecording
                ? [
                    styles.micButtonRecording,
                    {
                      backgroundColor: isCancelled
                        ? colors.border
                        : colors.red,
                    },
                  ]
                : [styles.micButtonIdle, themed.micButtonIdle],
              (isSending || isTranscribing) && styles.sendDisabled,
              pressed && { opacity: 0.8 },
            ]}
            disabled={isSending || isTranscribing}
            accessibilityRole="button"
            accessibilityLabel={isCancelled ? 'Cancelled' : 'Hold to speak'}
            testID="chat-mic-button"
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : isCancelled ? (
              <X size={20} color={colors.red} />
            ) : (
              <Mic
                size={20}
                color={
                  isRecording
                    ? colors.textOnPrimary || '#ffffff'
                    : colors.textPrimary
                }
              />
            )}
          </Pressable>
        )}
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
  recordingContainer: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 16,
    borderWidth: 1,
    justifyContent: 'center',
  },
  recordingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '500',
  },
  recordingCancelText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  cancelHintText: {
    fontFamily: Fonts.body,
    fontSize: 11,
  },
  cancelTapTarget: {
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  micButtonIdle: {
    borderWidth: 1,
  },
  micButtonRecording: {
    ...Shadows.card,
    transform: [{ scale: 1.05 }],
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
  recordingContainer: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  recordingText: {
    color: colors.textPrimary,
  },
  micButtonIdle: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
});
