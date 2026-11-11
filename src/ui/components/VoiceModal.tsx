import React, {useCallback, useState, useEffect, useRef} from 'react';
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
  ScrollView,
  AppState,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {Fonts, Shadows} from '../theme';
import {
  X,
  Check,
  ArrowRight,
  Mic,
  CircleAlert,
  MessageSquareText,
  AudioLines,
} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';
import {NLU_PARSER_DELAY_MS, VOICE_SUCCESS_DELAY_MS} from '../../constants';
import type {ThemeColors} from '../contexts/ThemeContext';
import {
  cancelOfflineSpeechCapture,
  isMicrophoneBusyError,
  startOfflineSpeechCapture,
  stopOfflineSpeechCapture,
  warmupOfflineSpeech,
} from '../../ai/native/speechCapture';
import type {OfflineSpeechCaptureHandle} from '../../ai/native/speechCapture';
import {ensureMicrophonePermission} from '../../ai/stt/sttService';
import {chatOrchestrator} from '../../ai/chatOrchestrator';
import {ttsService} from '../../ai/tts/ttsService';
import {createCallSpeechProvider} from '../../cloud/speechService';
import type {
  CallSpeechProvider,
  SpeechStream,
} from '../../scheduler/speechProvider';
import {localSettingsStore} from '../../storage/localSettingsStore';
import {handbookPreference} from '../../skills/onlineChatSkill';
import type {PrepareResult} from '../../ai/nlu/commandReview';
import {useCommandReview} from '../hooks/useCommandReview';
import {CommandReviewCard} from './chat/CommandReviewCard';
import {DraftDecisionDialog} from './DraftDecisionDialog';
import type {DraftDialogRequest} from './DraftDecisionDialog';
import {useDraftProtection} from '../hooks/useDraftProtection';
import {chatDraftStore} from '../drafts/chatDraftStore';
import {ChatReplyText} from './chat/ChatReplyText';
import {useChatReplyFormat} from '../hooks/useChatReplyFormat';
import {VoiceConversationPanel} from './voice/VoiceConversationPanel';

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
  /**
   * Opens Call Lafina in dedicated full-screen presentation.
   */
  onOpenCallLafina?: () => void;
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
const WHISPER_WARMUP_DELAY_MS = 300;

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

const executeDefaultCommand = async (
  command: string,
  userId: string,
  onReplyText?: (replySoFar: string) => void,
): Promise<CommandOutcome> => {
  const trimmed = command.trim();
  if (!trimmed) {
    return {reply: 'What would you like me to do?'};
  }
  try {
    // Same Online Mode switch as Chat: online, conversation goes to DeepSeek,
    // and the reply streams in so it can be shown and spoken as it is written.
    const result = await chatOrchestrator.processMessage(userId, trimmed, {
      reviewSurface: 'voice',
      onlineMode:
        localSettingsStore.get(userId, 'chat.onlineMode', null) === 'true',
      useHandbook: handbookPreference.read(userId),
      ...(onReplyText ? {onReplyText} : {}),
    });
    return {reply: result.reply, review: result.review};
  } catch (err) {
    console.error('Chat orchestrator execution error:', err);
    return {reply: `Heard: "${trimmed}"`};
  }
};

export const VoiceModal: React.FC<VoiceModalProps> = ({
  visible,
  userId,
  onClose,
  onTranscript,
  onCommand,
  onUseInChat,
  onOpenCallLafina,
}) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [notice, setNotice] = useState('');
  const [aiReply, setAiReply] = useState('');
  const replyFormat = useChatReplyFormat(userId);
  const [inputText, setInputText] = useState('');
  const [handoffDialog, setHandoffDialog] = useState<DraftDialogRequest | null>(
    null,
  );
  // Push-to-talk (offline-first) or a live online conversation (explicit tap).
  const [mode, setMode] = useState<'push' | 'conversation'>('push');
  const appliedRef = useRef(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const modalScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardOpen(true);
      setTimeout(() => {
        modalScrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardOpen(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Animated values
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Waveform bars
  const waveBars = useRef(
    Array.from({length: WAVE_BAR_COUNT}, () => new Animated.Value(0.2)),
  ).current;
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCaptureRef = useRef(0);
  const pressActiveRef = useRef(false);
  const speechCaptureRef = useRef<OfflineSpeechCaptureHandle | null>(null);

  // Replies are read with the online voice in Online Mode (ElevenLabs, with
  // the voice chosen in Profile), and with the device voice otherwise or if
  // online speech fails.
  const speechRef = useRef<CallSpeechProvider | null>(null);
  useEffect(() => {
    // A conversation: ask the server for its fastest voice model.
    const provider = createCallSpeechProvider(userId, {latency: 'low'});
    speechRef.current = provider;
    return () => {
      if (speechRef.current === provider) speechRef.current = null;
      void provider.dispose?.().catch(() => undefined);
    };
  }, [userId]);
  const stopSpeaking = useCallback(() => {
    void speechRef.current?.stopSpeech?.().catch(() => undefined);
    void ttsService.stop();
  }, []);
  const speakReply = useCallback(
    async (text: string, stream?: SpeechStream | null) => {
      const provider = speechRef.current;
      if (!provider) {
        await ttsService.speak(text);
        return;
      }
      const result = stream
        ? await stream.finish(text)
        : await provider.speakText(text);
      if (result.fallbackReason) {
        setNotice(`Read with the device voice: ${result.fallbackReason}`);
      }
    },
    [],
  );

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
      timers.forEach(id => clearTimeout(id));
      timers.clear();
      stopSpeaking();
    };
  }, [stopSpeaking]);

  // AGY-PORT 04: a planner change waits on this card until the student confirms.
  const review = useCommandReview(userId, 'voice');
  const reviewRef = useRef(review);
  reviewRef.current = review;

  useEffect(() => {
    if (review?.proposal) {
      setTimeout(() => {
        modalScrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [review?.proposal]);

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
      reviewRef.current.cancel({silent: true});
      setInputText('');
      setTranscript('');
    },
    next => setInputText(next),
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // ponytail: exiting while Lafina is speaking after a schedule was set keeps the schedule and calls onClose(true)
  const handleDismiss = useCallback(() => {
    stopSpeaking();
    retireCapture();

    if (appliedRef.current) {
      const didUpdate = true;
      appliedRef.current = false;
      setInputText('');
      setTranscript('');
      setHandoffDialog(null);
      onClose(didUpdate);
      return;
    }

    draftRef.current.requestLeave(() => {
      stopSpeaking();
      retireCapture();
      if (reviewRef.current.proposal) {
        reviewRef.current.cancel({silent: true});
      }
      setHandoffDialog(null);
      onClose(false);
    });
  }, [onClose, retireCapture, stopSpeaking]);

  const {colors} = useTheme();
  const themed = useThemedStyles(getVoiceThemedStyles);

  useEffect(() => {
    if (!visible) return;
    void ensureMicrophonePermission();
    // Debounced so an open-then-close tap doesn't load the model for nothing.
    const warmupTimer = setTimeout(
      warmupOfflineSpeech,
      WHISPER_WARMUP_DELAY_MS,
    );
    // Check online speech now, so the first reply does not wait for it.
    void speechRef.current?.warmUp?.().catch(() => undefined);
    return () => clearTimeout(warmupTimer);
  }, [visible]);

  useEffect(() => {
    const showHeard = (e: {captureId?: string; transcript?: string}) => {
      if (e.captureId && e.captureId !== speechCaptureRef.current?.captureId) {
        return;
      }
      if (e?.transcript) {
        setTranscript(e.transcript);
        setNotice('');
      }
    };
    const partialSub = DeviceEventEmitter.addListener(
      'onSpeechPartialResult',
      showHeard,
    );
    const finalSub = DeviceEventEmitter.addListener(
      'onSpeechFinalResult',
      showHeard,
    );

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
    waveBars.forEach(bar => bar.setValue(0.2));
  }, [waveBars]);

  const startWaveform = useCallback(() => {
    stopWaveform();
    waveIntervalRef.current = setInterval(() => {
      waveBars.forEach(bar => {
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
      reviewRef.current.cancel({silent: true});
      retireCapture();
      setMode('push');
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
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active' || !speechCaptureRef.current) return;
      retireCapture();
      setVoiceState('idle');
      setNotice(
        'Listening stopped when LAFINA left the screen. Your draft is still here.',
      );
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
    stopSpeaking();
    setMode('push');
    setHandoffDialog(null);
    setInputText('');
    setTranscript('');
    setNotice('');
    setAiReply('');
    setVoiceState('idle');
  }, [userId, retireCapture, stopSpeaking]);

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
    async (
      command: string,
      onReplyText?: (replySoFar: string) => void,
    ): Promise<CommandOutcome> => {
      if (onCommand) {
        return {reply: await Promise.resolve(onCommand(command, userId))};
      }
      return executeDefaultCommand(command, userId, onReplyText);
    },
    [onCommand, userId],
  );

  /**
   * Shows and speaks the reply (finishing `stream` when the reply was already
   * being spoken as it arrived). Returns true when a review card is now
   * waiting, in which case the sheet stays open and nothing closes it.
   */
  const presentOutcome = useCallback(
    async (
      outcome: CommandOutcome,
      uiCaptureId: number,
      stream?: SpeechStream | null,
    ): Promise<boolean> => {
      setAiReply(outcome.reply);
      const waiting = outcome.review?.status === 'proposal';
      if (waiting) reviewRef.current.present(outcome.review);
      setVoiceState('speaking');

      try {
        await speakReply(outcome.reply, stream);
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
    [speakReply],
  );

  const handleConfirmReview = useCallback(async () => {
    const uiCaptureId = activeCaptureRef.current;
    const decision = await reviewRef.current.confirm();
    if (!decision || activeCaptureRef.current !== uiCaptureId) return;
    const applied = decision.outcome?.status === 'applied';
    if (applied) {
      appliedRef.current = true;
    }
    setAiReply(decision.reply);
    setVoiceState('speaking');
    try {
      await speakReply(decision.reply);
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
  }, [onClose, safeSetTimeout, speakReply]);

  const handleCancelReview = useCallback(() => {
    stopSpeaking();
    activeCaptureRef.current += 1;
    const decision = reviewRef.current.cancel();
    if (!decision) return;
    setAiReply(decision.reply);
    setVoiceState('idle');
  }, [stopSpeaking]);

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
      setNotice(
        'LAFINA needs microphone access to hear you. Allow it and try again.',
      );
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
      reviewRef.current.cancel({silent: true});
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

  const handleOpenConversation = useCallback(() => {
    // The two modes never share the microphone or the speaker.
    retireCapture();
    stopSpeaking();
    setNotice('');
    setAiReply('');
    setVoiceState('idle');
    if (onOpenCallLafina) {
      onOpenCallLafina();
    } else {
      setMode('conversation');
    }
  }, [onOpenCallLafina, retireCapture, stopSpeaking]);

  const handleCommandProcess = async (command: string) => {
    if (!command.trim()) return;
    activeCaptureRef.current += 1;
    const uiCaptureId = activeCaptureRef.current;
    Keyboard.dismiss();
    setTranscript(command);
    setNotice('');
    setVoiceState('processing');

    safeSetTimeout(async () => {
      // The reply is shown and spoken while it is still being written.
      const stream = onCommand
        ? null
        : speechRef.current?.startSpeechStream?.() ?? null;
      try {
        if (onTranscript) {
          onTranscript(command);
        }

        const outcome = await runCommand(command, replySoFar => {
          if (activeCaptureRef.current !== uiCaptureId) {
            stream?.cancel();
            return;
          }
          setAiReply(replySoFar);
          setVoiceState('speaking');
          stream?.update(replySoFar);
        });
        if (activeCaptureRef.current !== uiCaptureId) {
          stream?.cancel();
          return;
        }
        if (await presentOutcome(outcome, uiCaptureId, stream)) return;

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
        stream?.cancel();
        console.error(err);
        triggerErrorShake('idle');
      }
    }, NLU_PARSER_DELAY_MS);
  };

  const showFallbackControls =
    voiceState === 'idle' || voiceState === 'listening';
  const listening = voiceState === 'listening';
  const hasDraftText = inputText.trim().length > 0;
  const statusLine =
    review.proposal
      ? STATUS_TEXT.review
      : voiceState === 'idle' && hasDraftText
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
    review.proposal
      ? colors.primary
      : voiceState === 'error'
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
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <TouchableOpacity
          style={[
            styles.overlay,
            themed.overlay,
            mode === 'conversation' && styles.overlayFullScreen,
          ]}
          activeOpacity={1}
          onPress={handleDismiss}
          testID="voice-modal-backdrop"
        >
          <TouchableOpacity
            style={[
              styles.modalContent,
              themed.modalContent,
              isKeyboardOpen && styles.modalContentKeyboard,
              mode === 'conversation' && styles.modalContentFullScreen,
            ]}
            activeOpacity={1}
            onPress={() => Keyboard.dismiss()}
            testID="voice-modal-content"
          >
          {mode === 'push' && (
            <View style={[styles.grabber, themed.grabber]} />
          )}

          {/* Close button */}
          {mode === 'push' && (
            <TouchableOpacity
              style={[styles.closeButton, themed.closeButton]}
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel="Close voice assistant"
              testID="voice-modal-close"
            >
              <X size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          )}

          {/* Heading */}
          {mode === 'push' && (
            <Text style={[styles.modalTitle, themed.modalTitle]}>
              LAFINA Voice Assistant
            </Text>
          )}
          {mode === 'push' ? (
            <Text
              style={[styles.statusText, {color: statusColor}]}
              accessibilityLiveRegion="polite"
              testID="voice-status-text"
            >
              {statusLine}
            </Text>
          ) : null}

          {mode === 'conversation' ? (
            <VoiceConversationPanel
              userId={userId}
              review={review}
              onBack={() => setMode('push')}
              fullScreen={true}
            />
          ) : (
            <ScrollView
              ref={modalScrollRef}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Central Push-To-Talk Hold Button */}
              {!isKeyboardOpen && (
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
                        transform: [{translateX: shakeAnim}],
                        backgroundColor: micColor,
                      },
                    ]}
                  >
                    {voiceState === 'processing' ? (
                      <ActivityIndicator
                        size="large"
                        color={colors.textOnPrimary}
                      />
                    ) : voiceState === 'success' ? (
                      <Check
                        size={32}
                        color={colors.textOnPrimary}
                        strokeWidth={3}
                      />
                    ) : voiceState === 'error' ? (
                      <X
                        size={32}
                        color={colors.textOnPrimary}
                        strokeWidth={3}
                      />
                    ) : (
                      <Mic size={32} color={colors.textOnPrimary} />
                    )}
                  </Animated.View>
                </TouchableOpacity>
              </View>
              )}

              {/* What LAFINA heard */}
              <View
                style={[
                  styles.transcriptCard,
                  themed.transcriptCard,
                  listening && {borderColor: colors.primary},
                ]}
              >
                <View style={styles.transcriptHeader}>
                  <Text
                    style={[styles.transcriptLabel, themed.transcriptLabel]}
                  >
                    You said
                  </Text>
                  {listening && (
                    <View style={[styles.livePill, themed.livePill]}>
                      <View
                        style={[
                          styles.liveDot,
                          {backgroundColor: colors.primary},
                        ]}
                      />
                      <Text style={[styles.liveText, {color: colors.primary}]}>
                        Live
                      </Text>
                    </View>
                  )}
                </View>

                {notice ? (
                  <View style={styles.noticeRow} testID="voice-notice">
                    <CircleAlert size={16} color={colors.error} />
                    <Text style={[styles.noticeText, {color: colors.error}]}>
                      {notice}
                    </Text>
                  </View>
                ) : transcript ? (
                  <ScrollView
                    style={styles.transcriptScroll}
                    contentContainerStyle={styles.transcriptScrollContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    <Text
                      style={[styles.transcriptText, themed.transcriptText]}
                      testID="voice-transcript"
                    >
                      “{transcript}”
                    </Text>
                  </ScrollView>
                ) : (
                  <Text
                    style={[styles.placeholderText, themed.placeholderText]}
                  >
                    {listening
                      ? 'Go ahead, I’m listening…'
                      : 'Your words will show up here as you speak.'}
                  </Text>
                )}

                {listening && (
                  <View
                    style={styles.waveformContainer}
                    testID="voice-waveform"
                  >
                    {waveBars.map((bar, i) => (
                      <Animated.View
                        key={i}
                        style={[
                          styles.waveformBar,
                          {
                            backgroundColor: colors.primary,
                            transform: [{scaleY: bar}],
                          },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>

              {/* Confirmation / Result */}
              {aiReply ? (
                <View
                  style={[styles.replyRow, themed.replyRow]}
                  testID="voice-reply"
                >
                  <View
                    style={[
                      styles.replyIcon,
                      {backgroundColor: colors.success},
                    ]}
                  >
                    <Check
                      size={12}
                      color={colors.textOnPrimary}
                      strokeWidth={3}
                    />
                  </View>
                  <ScrollView
                    style={styles.replyScroll}
                    contentContainerStyle={styles.replyScrollContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    <ChatReplyText
                      content={aiReply}
                      format={replyFormat}
                      textStyle={[styles.replyText, themed.replyText]}
                    />
                  </ScrollView>
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
                    onFocus={() => {
                      setIsKeyboardOpen(true);
                      setTimeout(() => {
                        modalScrollRef.current?.scrollToEnd({ animated: true });
                      }, 100);
                    }}
                    onSubmitEditing={() => handleCommandProcess(inputText)}
                    accessibilityLabel="Command draft"
                    testID="voice-text-input"
                  />
                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      {backgroundColor: colors.primary},
                    ]}
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
                  <Text style={[styles.useInChatText, {color: colors.primary}]}>
                    Use draft in Chat
                  </Text>
                </TouchableOpacity>
              ) : null}

              {voiceState === 'idle' && !review.proposal ? (
                <TouchableOpacity
                  style={styles.useInChatButton}
                  onPress={handleOpenConversation}
                  accessibilityRole="button"
                  accessibilityLabel="Call Lafina (Online live voice)"
                  testID="voice-open-conversation"
                >
                  <AudioLines size={16} color={colors.primary} />
                  <Text style={[styles.useInChatText, {color: colors.primary}]}>
                    Call Lafina
                  </Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          )}

          <DraftDecisionDialog
            request={draft.dialog ?? handoffDialog}
            testIDPrefix="voice-draft"
          />
        </TouchableOpacity>
      </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getVoiceThemedStyles = (colors: ThemeColors) => ({
  overlay: {backgroundColor: colors.overlay},
  modalContent: {backgroundColor: colors.cardBg},
  grabber: {backgroundColor: colors.border},
  closeButton: {backgroundColor: colors.inputBg},
  modalTitle: {color: colors.textPrimary},
  transcriptCard: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  transcriptLabel: {color: colors.textSecondary},
  livePill: {backgroundColor: colors.cardBg},
  transcriptText: {color: colors.textPrimary},
  placeholderText: {color: colors.textMuted},
  replyRow: {backgroundColor: colors.inputBg},
  replyText: {color: colors.textPrimary},
  inputRow: {backgroundColor: colors.inputBg},
  textInput: {color: colors.textPrimary},
});

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayFullScreen: {
    justifyContent: 'flex-start',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    alignItems: 'center',
    width: '100%',
    maxHeight: '90%',
  },
  modalContentFullScreen: {
    flex: 1,
    height: '100%',
    maxHeight: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 0,
  },
  modalContentKeyboard: {
    maxHeight: '65%',
    paddingBottom: 16,
  },
  modalScroll: {
    width: '100%',
  },
  modalScrollContent: {
    alignItems: 'center',
    paddingBottom: 16,
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
    minHeight: 76,
    maxHeight: 110,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  transcriptScroll: {
    maxHeight: 65,
  },
  transcriptScrollContent: {
    flexGrow: 0,
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
    maxHeight: 145,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  replyScroll: {
    flex: 1,
    maxHeight: 120,
  },
  replyScrollContent: {
    flexGrow: 1,
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
