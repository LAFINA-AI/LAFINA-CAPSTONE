import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  ActivityIndicator,
  Easing,
  Keyboard,
  DeviceEventEmitter,
  AppState,
} from 'react-native';
import { Fonts, Shadows } from '../theme';
import {
  X,
  Check,
  ArrowRight,
  Mic,
  CircleAlert,
  MessageSquareText,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import { NLU_PARSER_DELAY_MS, VOICE_SUCCESS_DELAY_MS } from '../../constants';
import type { ThemeColors } from '../contexts/ThemeContext';
import {
  cancelOfflineSpeechCapture,
  isMicrophoneBusyError,
  startOfflineSpeechCapture,
  stopOfflineSpeechCapture,
} from '../../ai/native/speechCapture';
import type { OfflineSpeechCaptureHandle } from '../../ai/native/speechCapture';
import { ensureMicrophonePermission } from '../../ai/stt/sttService';
import { chatOrchestrator } from '../../ai/chatOrchestrator';
import { ttsService } from '../../ai/tts/ttsService';
import type { PrepareResult } from '../../ai/nlu/commandReview';
import { useCommandReview } from '../hooks/useCommandReview';
import { CommandReviewCard } from './chat/CommandReviewCard';
import { DraftDecisionDialog } from './DraftDecisionDialog';
import type { DraftDialogRequest } from './DraftDecisionDialog';
import { useDraftProtection } from '../hooks/useDraftProtection';
import { chatDraftStore } from '../drafts/chatDraftStore';

export interface VoiceModalProps {
  visible: boolean;
  userId: string;
  onClose: (didUpdate?: boolean) => void;
  onTranscript?: (transcript: string) => void;
  onCommand?: (command: string, userId: string) => string | Promise<string>;
  /**
   * Opens Chat after the draft was placed in the Chat composer (AGY-PORT 05).
   * Nothing is sent: the student still presses Send there.
   */
  onUseInChat?: () => void;
}

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'review'
  | 'success'
  | 'error';

const WAVE_BAR_COUNT = 11;

/** The line under the title: what the mic is doing, in a few words. */
const STATUS_TEXT: Record<VoiceState, string> = {
  idle: 'Hold the mic button to talk',
  listening: 'Listening… let go when you’re done',
  processing: 'Working on it…',
  speaking: 'Reading aloud…',
  review: 'Check the details, then confirm',
  success: 'Done',
  error: 'That didn’t work',
};

/** Status while an editable draft waits for Prepare (AGY-PORT 05). */
const DRAFT_STATUS_TEXT = 'Edit if needed, then tap Prepare';

/** Recoverable: typing still works and an active recording is never stopped. */
export const MIC_BUSY_NOTICE =
  'The microphone is busy (a recording, or the last capture is still finishing). You can type instead, or try again in a moment.';

export const DRAFT_READY_NOTICE =
  'Check the text, then tap Prepare. Nothing has been sent or saved.';

interface CommandOutcome {
  reply: string;
  /** A planner change waiting for Confirm (AGY-PORT 04); nothing was written yet. */
  review?: PrepareResult;
}

const executeDefaultCommand = async (command: string, userId: string): Promise<CommandOutcome> => {
  const trimmed = command.trim();
  if (!trimmed) {
    return { reply: 'What would you like me to do?' };
  }
  try {
    const result = await chatOrchestrator.processMessage(userId, trimmed, {
      reviewSurface: 'voice',
    });
    return { reply: result.reply, review: result.review };
  } catch (err) {
    console.error('Chat orchestrator execution error:', err);
    return { reply: `Heard: "${trimmed}"` };
  }
};

export const VoiceModal: React.FC<VoiceModalProps> = ({
  visible,
  userId,
  onClose,
  onTranscript,
  onCommand,
  onUseInChat,
}) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [notice, setNotice] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [inputText, setInputText] = useState('');
  const [handoffDialog, setHandoffDialog] = useState<DraftDialogRequest | null>(
    null,
  );

  // Animated values
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Waveform bars
  const waveBars = useRef(
    Array.from({ length: WAVE_BAR_COUNT }, () => new Animated.Value(0.2)),
  ).current;
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCaptureRef = useRef(0);
  const pressActiveRef = useRef(false);
  const speechCaptureRef = useRef<OfflineSpeechCaptureHandle | null>(null);

  // Timers cleanup
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const safeSetTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, delay);
    timersRef.current.add(id);
    return id;
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      void ttsService.stop();
    };
  }, []);

  // AGY-PORT 04: a planner change waits on this card until the student confirms.
  const review = useCommandReview(userId, 'voice');
  const reviewRef = useRef(review);
  reviewRef.current = review;

  /** Stops any capture this sheet started; its late result is ignored. */
  const retireCapture = useCallback(() => {
    pressActiveRef.current = false;
    activeCaptureRef.current += 1;
    const capture = speechCaptureRef.current;
    speechCaptureRef.current = null;
    if (capture) void cancelOfflineSpeechCapture(capture.captureId);
  }, []);

  // AGY-PORT 05: an unsent draft or a waiting review is never lost silently.
  const draft = useDraftProtection(
    userId,
    inputText,
    review.proposal !== null,
    () => {
      reviewRef.current.cancel({ silent: true });
      setInputText('');
      setTranscript('');
    },
    (next) => setInputText(next),
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const handleDismiss = useCallback(() => {
    draftRef.current.requestLeave(() => {
      void ttsService.stop();
      retireCapture();
      // Closing the sheet never confirms; it discards the open proposal.
      reviewRef.current.cancel({ silent: true });
      setHandoffDialog(null);
      onClose(false);
    });
  }, [onClose, retireCapture]);

  const { colors } = useTheme();
  const themed = useThemedStyles(getVoiceThemedStyles);

  useEffect(() => {
    if (visible) {
      void ensureMicrophonePermission();
    }
  }, [visible]);

  useEffect(() => {
    const showHeard = (e: { captureId?: string; transcript?: string }) => {
      if (e.captureId && e.captureId !== speechCaptureRef.current?.captureId) {
        return;
      }
      if (e?.transcript) {
        setTranscript(e.transcript);
        setNotice('');
      }
    };
    const partialSub = DeviceEventEmitter.addListener('onSpeechPartialResult', showHeard);
    const finalSub = DeviceEventEmitter.addListener('onSpeechFinalResult', showHeard);

    return () => {
      partialSub.remove();
      finalSub.remove();
    };
  }, []);

  const stopWaveform = useCallback(() => {
    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = null;
    }
    waveBars.forEach((bar) => bar.setValue(0.2));
  }, [waveBars]);

  const startWaveform = useCallback(() => {
    stopWaveform();
    waveIntervalRef.current = setInterval(() => {
      waveBars.forEach((bar) => {
        Animated.timing(bar, {
          toValue: 0.2 + Math.random() * 0.8,
          duration: 180,
          easing: Easing.ease,
          useNativeDriver: true,
        }).start();
      });
    }, 200);
  }, [stopWaveform, waveBars]);

  useEffect(() => {
    if (!visible) {
      reviewRef.current.cancel({ silent: true });
      retireCapture();
      setHandoffDialog(null);
      setVoiceState('idle');
      setTranscript('');
      setNotice('');
      stopWaveform();
      return;
    }

    setTranscript('');
    setNotice('');
    setAiReply('');
    setInputText('');
    setVoiceState('idle');
  }, [visible, stopWaveform, retireCapture]);

  // Going to the background ends a live capture (its late result is ignored);
  // the typed or dictated draft stays.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' || !speechCaptureRef.current) return;
      retireCapture();
      setVoiceState('idle');
      setNotice('Listening stopped when LAFINA left the screen. Your draft is still here.');
    });
    return () => subscription.remove();
  }, [retireCapture]);

  // Account switch or sign-out: the previous owner's draft, review and any late
  // speech result are dropped; nothing carries over to the next account.
  const ownerRef = useRef(userId);
  useEffect(() => {
    if (ownerRef.current === userId) return;
    ownerRef.current = userId;
    retireCapture();
    void ttsService.stop();
    setHandoffDialog(null);
    setInputText('');
    setTranscript('');
    setNotice('');
    setAiReply('');
    setVoiceState('idle');
  }, [userId, retireCapture]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (visible && voiceState === 'listening') {
      startWaveform();

      pulseAnim.setValue(0);
      animation = Animated.loop(
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );
      animation.start();
    } else {
      pulseAnim.setValue(0);
      stopWaveform();
    }

    return () => {
      if (animation) {
        animation.stop();
      }
      stopWaveform();
    };
  }, [visible, voiceState, pulseAnim, startWaveform, stopWaveform]);

  const triggerErrorShake = useCallback(
    (nextState: VoiceState = 'idle') => {
      setVoiceState('error');
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
      ]).start(() => {
        safeSetTimeout(() => {
          setVoiceState(nextState);
        }, 1500);
      });
    },
    [safeSetTimeout, shakeAnim],
  );

  const runCommand = useCallback(
    async (command: string): Promise<CommandOutcome> => {
      if (onCommand) {
        return { reply: await Promise.resolve(onCommand(command, userId)) };
      }
      return executeDefaultCommand(command, userId);
    },
    [onCommand, userId],
  );

  /**
   * Shows and speaks the reply. Returns true when a review card is now waiting,
   * in which case the sheet stays open and nothing closes it automatically.
   */
  const presentOutcome = useCallback(
    async (outcome: CommandOutcome, uiCaptureId: number): Promise<boolean> => {
      setAiReply(outcome.reply);
      const waiting = outcome.review?.status === 'proposal';
      if (waiting) reviewRef.current.present(outcome.review);
      setVoiceState('speaking');

      try {
        await ttsService.speak(outcome.reply);
      } catch (err) {
        console.warn('[VoiceModal] TTS playback error:', err);
      }

      if (waiting) {
        if (activeCaptureRef.current === uiCaptureId) setVoiceState('review');
        return true;
      }
      if (outcome.review) {
        // A question back (missing time, unclear item): keep the sheet and the
        // draft so the student can edit it and prepare again.
        if (activeCaptureRef.current === uiCaptureId) setVoiceState('idle');
        return true;
      }
      return false;
    },
    [],
  );

  const handleConfirmReview = useCallback(async () => {
    const uiCaptureId = activeCaptureRef.current;
    const decision = await reviewRef.current.confirm();
    if (!decision || activeCaptureRef.current !== uiCaptureId) return;
    const applied = decision.outcome?.status === 'applied';
    setAiReply(decision.reply);
    setVoiceState('speaking');
    try {
      await ttsService.speak(decision.reply);
    } catch (err) {
      console.warn('[VoiceModal] TTS playback error:', err);
    }
    if (activeCaptureRef.current !== uiCaptureId) return;
    if (!applied) {
      setVoiceState('idle');
      return;
    }
    setVoiceState('success');
    safeSetTimeout(() => {
      if (activeCaptureRef.current === uiCaptureId) {
        onClose(true);
        setVoiceState('idle');
        setInputText('');
      }
    }, VOICE_SUCCESS_DELAY_MS);
  }, [onClose, safeSetTimeout]);

  const handleCancelReview = useCallback(() => {
    const decision = reviewRef.current.cancel();
    if (!decision) return;
    setAiReply(decision.reply);
    setVoiceState('idle');
  }, []);

  // Push-To-Talk: Press & Hold down mic button to speak
  const handlePressIn = useCallback(async () => {
    pressActiveRef.current = true;
    const captureId = activeCaptureRef.current + 1;
    activeCaptureRef.current = captureId;

    const hasPermission = await ensureMicrophonePermission();
    if (activeCaptureRef.current !== captureId || !pressActiveRef.current) {
      return;
    }
    if (!hasPermission) {
      setTranscript('');
      setNotice('LAFINA needs microphone access to hear you. Allow it and try again.');
      triggerErrorShake('idle');
      return;
    }

    setVoiceState('listening');
    setTranscript('');
    setNotice('');
    setAiReply('');

    try {
      const capture = startOfflineSpeechCapture({
        mode: 'manual',
        bargeIn: false,
        context: 'main_mic',
      });
      speechCaptureRef.current = capture;
      // AGY-PORT 05: "microphone busy" can arrive while the button is still held.
      capture.result.catch((error: unknown) => {
        if (
          !isMicrophoneBusyError(error) ||
          activeCaptureRef.current !== captureId ||
          speechCaptureRef.current?.captureId !== capture.captureId
        ) {
          return;
        }
        speechCaptureRef.current = null;
        setNotice(MIC_BUSY_NOTICE);
        setVoiceState('idle');
      });
    } catch (error) {
      if (isMicrophoneBusyError(error)) {
        setNotice(MIC_BUSY_NOTICE);
        setVoiceState('idle');
        return;
      }
      console.error('Failed to start offline Whisper capture:', error);
      setNotice('Speech recognition could not start. Please try again.');
      triggerErrorShake('idle');
    }
  }, [triggerErrorShake]);

  // Release the mic button to stop recording and process Whisper transcription
  const handlePressOut = useCallback(async () => {
    pressActiveRef.current = false;
    const uiCaptureId = activeCaptureRef.current;
    const capture = speechCaptureRef.current;
    if (!capture) {
      setVoiceState('idle');
      return;
    }

    setVoiceState('processing');
    try {
      await stopOfflineSpeechCapture(capture.captureId);
      const result = await capture.result;
      if (speechCaptureRef.current?.captureId === capture.captureId) {
        speechCaptureRef.current = null;
      }
      if (activeCaptureRef.current !== uiCaptureId) return;

      const finalTranscript = result.transcript.trim();
      setTranscript(finalTranscript);

      if (!finalTranscript) {
        setNotice('I didn’t catch that. Hold the mic and try again.');
        triggerErrorShake('idle');
        return;
      }

      // AGY-PORT 05: recognition ends in an editable draft. Nothing is prepared,
      // sent or saved until the student taps Prepare (and then Confirm).
      setVoiceState('idle');
      setNotice('');
      draftRef.current.offerText(finalTranscript);
    } catch (error) {
      if (speechCaptureRef.current?.captureId === capture.captureId) {
        speechCaptureRef.current = null;
      }
      if (activeCaptureRef.current !== uiCaptureId) return;
      if (isMicrophoneBusyError(error)) {
        setNotice(MIC_BUSY_NOTICE);
        setVoiceState('idle');
        return;
      }
      console.error('Failed to process offline Whisper capture:', error);
      setNotice('Speech recognition could not finish. Please try again.');
      triggerErrorShake('idle');
    }
  }, [triggerErrorShake]);

  /** Moves the draft into the Chat composer without sending it (Keep/Replace first). */
  const handleUseInChat = useCallback(() => {
    const text = inputText.trim();
    if (!text || !onUseInChat) return;
    const owner = userId;
    const handOff = () => {
      if (ownerRef.current !== owner) return;
      retireCapture();
      reviewRef.current.cancel({ silent: true });
      chatDraftStore.set(owner, text);
      setInputText('');
      setTranscript('');
      setHandoffDialog(null);
      onClose(false);
      onUseInChat();
    };
    const existing = chatDraftStore.get(owner);
    if (!existing.trim() || existing.trim() === text) {
      handOff();
      return;
    }
    setHandoffDialog({
      title: 'Replace your Chat draft?',
      message:
        'Chat already has unsent text. Keep it, or replace it with this draft. Nothing will be sent.',
      keepLabel: 'Keep Chat text',
      confirmLabel: 'Replace',
      onKeep: () => {
        setHandoffDialog(null);
        setNotice('');
        setAiReply('Your Chat draft was kept. This text is still here.');
      },
      onConfirm: handOff,
    });
  }, [inputText, onClose, onUseInChat, retireCapture, userId]);

  const handleCommandProcess = async (command: string) => {
    if (!command.trim()) return;
    activeCaptureRef.current += 1;
    const uiCaptureId = activeCaptureRef.current;
    Keyboard.dismiss();
    setTranscript(command);
    setNotice('');
    setVoiceState('processing');

    safeSetTimeout(async () => {
      try {
        if (onTranscript) {
          onTranscript(command);
        }

        const outcome = await runCommand(command);
        if (await presentOutcome(outcome, uiCaptureId)) return;

        if (activeCaptureRef.current === uiCaptureId) {
          setVoiceState('success');
          safeSetTimeout(() => {
            if (activeCaptureRef.current === uiCaptureId) {
              onClose(true);
              setVoiceState('idle');
              setInputText('');
            }
          }, VOICE_SUCCESS_DELAY_MS);
        }
      } catch (err) {
        console.error(err);
        triggerErrorShake('idle');
      }
    }, NLU_PARSER_DELAY_MS);
  };

  const showFallbackControls = voiceState === 'idle' || voiceState === 'listening';
  const listening = voiceState === 'listening';
  const hasDraftText = inputText.trim().length > 0;
  const statusLine =
    voiceState === 'idle' && hasDraftText
      ? DRAFT_STATUS_TEXT
      : STATUS_TEXT[voiceState];

  const micColor =
    voiceState === 'success' || voiceState === 'speaking'
      ? colors.success
      : voiceState === 'error'
      ? colors.error
      : listening
      ? colors.primary
      : colors.primary;

  const statusColor =
    voiceState === 'error'
      ? colors.error
      : voiceState === 'success' || voiceState === 'speaking'
      ? colors.success
      : listening
      ? colors.primary
      : colors.textSecondary;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleDismiss}
    >
      <TouchableOpacity
        style={[styles.overlay, themed.overlay]}
        activeOpacity={1}
        onPress={handleDismiss}
        testID="voice-modal-backdrop"
      >
        <TouchableOpacity
          style={[styles.modalContent, themed.modalContent]}
          activeOpacity={1}
          onPress={() => Keyboard.dismiss()}
          testID="voice-modal-content"
        >
          <View style={[styles.grabber, themed.grabber]} />

          {/* Close button */}
          <TouchableOpacity
            style={[styles.closeButton, themed.closeButton]}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close voice assistant"
            testID="voice-modal-close"
          >
            <X size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Heading */}
          <Text style={[styles.modalTitle, themed.modalTitle]}>
            LAFINA Voice Assistant
          </Text>
          <Text
            style={[styles.statusText, { color: statusColor }]}
            accessibilityLiveRegion="polite"
            testID="voice-status-text"
          >
            {statusLine}
          </Text>

          {/* Central Push-To-Talk Hold Button */}
          <View style={styles.animationArea}>
            {listening && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.listeningRing,
                  {
                    borderColor: colors.primary,
                    opacity: pulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.55, 0],
                    }),
                    transform: [
                      {
                        scale: pulseAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.55],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              accessibilityRole="button"
              accessibilityLabel="Hold to talk"
              testID="voice-hold-button"
            >
              <Animated.View
                style={[
                  styles.voicePulseCircle,
                  {
                    transform: [{ translateX: shakeAnim }],
                    backgroundColor: micColor,
                  },
                ]}
              >
                {voiceState === 'processing' ? (
                  <ActivityIndicator size="large" color={colors.textOnPrimary} />
                ) : voiceState === 'success' ? (
                  <Check size={32} color={colors.textOnPrimary} strokeWidth={3} />
                ) : voiceState === 'error' ? (
                  <X size={32} color={colors.textOnPrimary} strokeWidth={3} />
                ) : (
                  <Mic size={32} color={colors.textOnPrimary} />
                )}
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* What LAFINA heard */}
          <View
            style={[
              styles.transcriptCard,
              themed.transcriptCard,
              listening && { borderColor: colors.primary },
            ]}
          >
            <View style={styles.transcriptHeader}>
              <Text style={[styles.transcriptLabel, themed.transcriptLabel]}>
                You said
              </Text>
              {listening && (
                <View style={[styles.livePill, themed.livePill]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.liveText, { color: colors.primary }]}>Live</Text>
                </View>
              )}
            </View>

            {notice ? (
              <View style={styles.noticeRow} testID="voice-notice">
                <CircleAlert size={16} color={colors.error} />
                <Text style={[styles.noticeText, { color: colors.error }]}>{notice}</Text>
              </View>
            ) : transcript ? (
              <Text style={[styles.transcriptText, themed.transcriptText]} testID="voice-transcript">
                “{transcript}”
              </Text>
            ) : (
              <Text style={[styles.placeholderText, themed.placeholderText]}>
                {listening
                  ? 'Go ahead, I’m listening…'
                  : 'Your words will show up here as you speak.'}
              </Text>
            )}

            {listening && (
              <View style={styles.waveformContainer} testID="voice-waveform">
                {waveBars.map((bar, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveformBar,
                      { backgroundColor: colors.primary, transform: [{ scaleY: bar }] },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Confirmation / Result */}
          {aiReply ? (
            <View style={[styles.replyRow, themed.replyRow]} testID="voice-reply">
              <View style={[styles.replyIcon, { backgroundColor: colors.success }]}>
                <Check size={12} color={colors.textOnPrimary} strokeWidth={3} />
              </View>
              <Text style={[styles.replyText, themed.replyText]}>{aiReply}</Text>
            </View>
          ) : null}

          {review.proposal ? (
            <CommandReviewCard
              proposal={review.proposal}
              expired={review.expired}
              busy={review.busy}
              onConfirm={() => {
                void handleConfirmReview();
              }}
              onCancel={handleCancelReview}
              onDismiss={review.dismiss}
              testIDPrefix="voice-review"
            />
          ) : null}

          {/* Keyboard input fallback */}
          {showFallbackControls && (
            <View style={[styles.inputRow, themed.inputRow]}>
              <TextInput
                style={[styles.textInput, themed.textInput]}
                placeholder="Or type a command..."
                placeholderTextColor={colors.textSecondary}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={() => handleCommandProcess(inputText)}
                accessibilityLabel="Command draft"
                testID="voice-text-input"
              />
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.primary }]}
                onPress={() => handleCommandProcess(inputText)}
                accessibilityRole="button"
                accessibilityLabel="Prepare command for review"
                testID="voice-send-button"
              >
                <ArrowRight size={18} color={colors.textOnPrimary} />
              </TouchableOpacity>
            </View>
          )}

          {voiceState === 'idle' && hasDraftText ? (
            <Text
              style={[styles.draftHint, themed.placeholderText]}
              testID="voice-draft-hint"
            >
              {DRAFT_READY_NOTICE}
            </Text>
          ) : null}

          {voiceState === 'idle' && hasDraftText && onUseInChat ? (
            <TouchableOpacity
              style={styles.useInChatButton}
              onPress={handleUseInChat}
              accessibilityRole="button"
              accessibilityLabel="Use draft in Chat without sending"
              testID="voice-use-in-chat"
            >
              <MessageSquareText size={16} color={colors.primary} />
              <Text style={[styles.useInChatText, { color: colors.primary }]}>
                Use draft in Chat
              </Text>
            </TouchableOpacity>
          ) : null}

          <DraftDecisionDialog
            request={draft.dialog ?? handoffDialog}
            testIDPrefix="voice-draft"
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const getVoiceThemedStyles = (colors: ThemeColors) => ({
  overlay: { backgroundColor: colors.overlay },
  modalContent: { backgroundColor: colors.cardBg },
  grabber: { backgroundColor: colors.border },
  closeButton: { backgroundColor: colors.inputBg },
  modalTitle: { color: colors.textPrimary },
  transcriptCard: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  transcriptLabel: { color: colors.textSecondary },
  livePill: { backgroundColor: colors.cardBg },
  transcriptText: { color: colors.textPrimary },
  placeholderText: { color: colors.textMuted },
  replyRow: { backgroundColor: colors.inputBg },
  replyText: { color: colors.textPrimary },
  inputRow: { backgroundColor: colors.inputBg },
  textInput: { color: colors.textPrimary },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 20,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statusText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  animationArea: {
    height: 120,
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  listeningRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
  },
  voicePulseCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.micButton,
  },
  transcriptCard: {
    width: '100%',
    minHeight: 96,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  transcriptLabel: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  liveText: {
    fontFamily: Fonts.body,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  transcriptText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 23,
  },
  placeholderText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  waveformContainer: {
    flexDirection: 'row',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  waveformBar: {
    width: 3,
    height: 28,
    borderRadius: 1.5,
    marginHorizontal: 3,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  replyIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  replyText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    width: '100%',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    marginTop: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },
  draftHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    textAlign: 'center',
  },
  useInChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  useInChatText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
