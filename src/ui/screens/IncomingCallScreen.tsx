import {
  ANSWERED_CALL_LIMIT_MS,
  callLifecycle,
} from '../../scheduler/callLifecycle';
import {
  autoSnoozeCall,
  commitAgentSnooze,
  downgradeExternalVoiceToButtons,
  isExternalVoiceDowngraded,
  ownsCallCapture,
} from '../../scheduler/callDispatcher';
import {deliveryStore} from '../../storage/deliveryStore';
import {silenceNativeIncomingCall} from '../../scheduler/reminderAlarm';
import {stopSpeechPlayback} from '../../ai/tts/ttsService';
import {cloudClient} from '../../cloud/cloudClient';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  AppState,
  DeviceEventEmitter,
  Easing,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {BellRing, Phone, PhoneOff} from 'lucide-react-native';
import {CallAnsweredView} from '../components/call/CallAnsweredView';
import type {CallPendingAction} from '../components/call/CallAnsweredView';
import {OnlineReminderConversation} from '../components/call/OnlineReminderConversation';
import type {OnlineReminderHandle} from '../components/call/OnlineReminderConversation';
import {OnlineReminderCallView} from '../components/call/OnlineReminderCallView';
import {
  answerCall,
  resumeOfflineCall,
  detectCallKeyword,
  declineCall,
  endAnsweredCall,
  getReminderPreferences,
  manualAcknowledgeCall,
  manualSnoozeCall,
  prepareCallSpeech,
} from '../../scheduler';
import type {
  CallResolution,
  CallSpeechProvider,
  CallState,
  CallStateEvent,
  NativeCallAction,
} from '../../scheduler';
import {CALL_RESULT_DELAY_MS} from '../../constants';
import {chatOrchestrator} from '../../ai/chatOrchestrator';
import {parseIntentFastPath} from '../../ai/nlu/fastPathParser';
import {parseRingingReminderChange} from '../../ai/nlu/ringingReminderChange';
import {
  latestPendingReview,
  prepareReviewedCommand,
  reviseReviewedCommand,
} from '../../ai/nlu/commandReview';
import type {CommandProposal, PrepareResult} from '../../ai/nlu/commandReview';
import {Fonts, ModernLayout, Shadows} from '../theme';
import {useTheme} from '../contexts/ThemeContext';
import {createCallSpeechProvider} from '../../cloud/speechService';
import {
  alertPreferencesStore,
  DEFAULT_ALERT_PREFERENCES,
  DEFAULT_CALLER_SUBTITLE,
} from '../../storage/alertPreferencesStore';
import type {
  AlertPreferences,
  CallAnswerMode,
  VibrationPattern,
} from '../../storage/alertPreferencesStore';
import {isGuestAccount} from '../../cloud/entitlements';
import {
  endActiveVoiceConversation,
  hasOnlineCallConsent,
  RECONNECT_FAILED_REASON,
  waitForVoiceConversationRelease,
} from '../../cloud/voiceConversation';
import {choseOfflineMode} from '../../ai/offlineCall/callMode';
import {setKeepScreenOn} from '../../utils/keepScreenOn';
import {useCommandReview} from '../hooks/useCommandReview';
import {useChatReplyFormat} from '../hooks/useChatReplyFormat';
import {CommandReviewCard} from '../components/chat/CommandReviewCard';
import type {ConversationSnapshot} from '../../cloud/voiceConversation';
import type {CallMeter} from '../hooks/callMeter';
import {isExplicitSaveCommand} from '../../cloud/voiceConversation/turnPolicy';

const lafinaLogo = require('../../assets/new_lafina_app_logo/lafina_app_logo.png');

interface IncomingCallScreenProps {
  visible: boolean;
  reminderId: string;
  task: string;
  userId: string;
  onClose: () => void;
  initialAction?: NativeCallAction;
  /** Delivery generation captured at admission; Answer/Decline act only on it. */
  deliveryGeneration?: number | null;
}

const SPOKEN_CONFIRM_RE =
  /^(?:(?:yes|yeah|yep|okay|ok|sure)[,\s]*)?(?:please\s+)?(?:confirm|save\s+(?:it|that)|do\s+it|go\s+ahead|yes|yeah|yep|that'?s\s+right|correct)(?:\s+(?:it|that))?(?:\s+please)?[.!]*$/i;
const SPOKEN_CANCEL_RE =
  /^(?:(?:no|nope)[,\s]*)?(?:please\s+)?(?:cancel|discard|never\s*mind|don'?t\s+(?:save|add)\s+(?:it|that)|no|nope)(?:\s+(?:it|that))?(?:\s+please)?[.!]*$/i;

/** Planner changes the device can turn into a review card from spoken words. */
const CARD_INTENTS = new Set([
  'create_task',
  'create_time_block',
  'create_reminder',
  'create_note',
  'update_task',
  'update_time_block',
  'update_note',
  'delete_task',
  'delete_time_block',
  'delete_note',
]);

/** LAFINA telling the student a card or draft is on screen. */
const CARD_CLAIM_RE =
  /\b(?:card|draft)\b[^.?!]*\b(?:on\s+(?:your|the)\s+screen|is\s+(?:now\s+)?(?:shown|showing|ready|up)|check|review|confirm|tap)\b|\b(?:put|placed|prepared|showing|pulled\s+up)\b[^.?!]*\b(?:card|draft)\b|\b(?:check|review|confirm|tap)\b[^.?!]*\b(?:card|draft)\b/i;
const CARD_DENIAL_RE =
  /\b(?:no|not|never|without|cannot|can['’]?t|couldn['’]?t|didn['’]?t|wasn['’]?t|isn['’]?t)\b[^.?!]*\b(?:card|draft)\b/i;
/** How long a card may still arrive after LAFINA mentions it. */
const CARD_CLAIM_GRACE_MS = 600;
const NO_CARD_NOTE = 'No card is on screen, so nothing was changed.';
/** What the agent hears when it mentioned a card the screen does not show. */
const NO_CARD_CONTEXT =
  'No review card is on screen and nothing was changed. Do not say a card is shown unless a tool answer or app update says so. Do not ask the student to repeat what they already said; if a detail such as the time is missing, ask only for that detail.';

/** How long the agent's planner tool waits for the device's reading of a turn. */
const TURN_READ_WAIT_MS = 8000;
/** Longest the online audio waits for the reminder reading to finish. */
const GREETING_GATE_MAX_MS = 45_000;

/** What the device made of one student turn, for the agent's planner tools. */
type TurnOutcome =
  | {kind: 'card'; proposal: CommandProposal}
  | {kind: 'saved' | 'cancelled' | 'settled'; reply: string}
  /** No card. `unresolved`: the planner needs a detail or refused. */
  | {kind: 'note'; reply: string; unresolved?: boolean}
  | {kind: 'none'};

interface TurnReading {
  text: string;
  done: Promise<TurnOutcome>;
}

/** One line telling the agent which card is on screen, never asking again. */
export const describeCallCard = (proposal: CommandProposal): string =>
  `Review card is now on screen: ${proposal.heading} "${proposal.title}"${
    proposal.details.length ? ` (${proposal.details.join(' ')})` : ''
  }. Card ID: ${proposal.operationId}; revision: 1. Nothing is saved until the student says confirm or taps Confirm. Tell them briefly what the card does and ask them to confirm; do not ask them to repeat the change.`;

const plainReply = (text: string): string =>
  text
    .replace(/\*\*/g, '')
    .replace(/^[>•*]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

const RESCHEDULE_INTENT_BASE = {
  title: null,
  endTime: null,
  durationMinutes: null,
  category: 'Academic',
  details: null,
  snoozeMinutes: null,
  confidence: 1,
  source: 'fast_path' as const,
  isValid: true,
};

const callVibrationArray = (
  enabled: boolean,
  pattern: VibrationPattern,
): number[] | null => {
  if (!enabled || pattern === 'off') return null;
  switch (pattern) {
    case 'gentle':
      return [600, 1200];
    case 'urgent':
      return [300, 200, 300, 200, 500, 600];
    case 'standard':
    default:
      return [1000, 1000, 1000, 1000];
  }
};

/**
 * Answer is expected to open the online conversation: the same rule as Call
 * Lafina (a signed-in account that has not picked Offline Mode in Chat),
 * and the student already agreed to the online call disclosure there. The
 * reminder call never asks for consent while it rings; without it the call
 * is simply offline. Only a prediction: Answer still checks the connection
 * and the microphone before the conversation starts.
 */
const expectsOnlineCall = (
  userId: string,
  answerMode: CallAnswerMode = 'auto_online',
): boolean =>
  answerMode === 'auto_online' &&
  !choseOfflineMode(userId) &&
  !isGuestAccount(userId) &&
  hasOnlineCallConsent(userId);

/**
 * Shown in an offline reminder call when the only thing missing for the
 * online one is the Call LAFINA agreement (never a pop-up mid-call).
 */
export const OFFLINE_CONSENT_HINT =
  'Offline voice. To talk with online LAFINA in reminder calls, start Call LAFINA once and agree.';

/** Renders and coordinates the complete offline reminder call experience. */
export const IncomingCallScreen: React.FC<IncomingCallScreenProps> = ({
  visible,
  reminderId,
  task,
  userId,
  onClose,
  initialAction = 'call',
  deliveryGeneration = null,
}) => {
  const {isDarkMode, colors, isModern, modernPalette, modernShadows} =
    useTheme();
  const replyFormat = useChatReplyFormat(userId);
  // A planner change asked for during an online reminder call becomes a voice
  // review card; it is shown here so it can be confirmed (audit finding 3).
  const review = useCommandReview(userId, 'voice');
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const [callState, setCallState] = useState<CallState>('ringing');
  const [resolution, setResolution] = useState<CallResolution | null>(null);
  const [snoozeMinutes, setSnoozeMinutes] = useState(5);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  /** A line from the app itself (not the agent) that stays until the next turn. */
  const [notice, setNotice] = useState('');
  const [onlineCall, setOnlineCall] = useState(false);
  /**
   * The answered call is shown as an online conversation (Call LAFINA style,
   * no Acknowledge or Snooze buttons). Any fallback to offline voice, or to
   * the buttons, turns this off so the offline controls come back.
   */
  const [onlineView, setOnlineViewState] = useState(false);
  const onlineViewRef = useRef(false);
  const setOnlineView = useCallback((value: boolean): void => {
    onlineViewRef.current = value;
    setOnlineViewState(value);
  }, []);
  const [onlineSnapshot, setOnlineSnapshot] =
    useState<ConversationSnapshot | null>(null);
  const [onlineMeter, setOnlineMeter] = useState<CallMeter | null>(null);
  /** The student said or typed something during the online call. */
  const studentSpokeRef = useRef(false);
  /** Online Mode is on at ring time; Answer will try the online call. */
  const [expectOnline, setExpectOnline] = useState(false);
  const alertPrefs = useMemo<AlertPreferences>(
    () =>
      visible ? alertPreferencesStore.read(userId) : DEFAULT_ALERT_PREFERENCES,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, userId, reminderId],
  );
  const alertPrefsRef = useRef<AlertPreferences>(alertPrefs);
  alertPrefsRef.current = alertPrefs;
  const [answering, setAnswering] = useState(false);
  // The button just tapped. Shown at once: acknowledging cancels alarms and
  // speaks a confirmation, which used to leave the screen looking unchanged.
  const [pendingAction, setPendingAction] = useState<CallPendingAction | null>(
    null,
  );
  const pendingActionRef = useRef<CallPendingAction | null>(null);
  // The scheduler's call session exists (it has reported a state), so the
  // buttons can act even while the reminder is still being read aloud.
  const [sessionLive, setSessionLive] = useState(false);
  const resolvedRef = useRef(false);
  /** Spoken planner requests the device is still turning into a card. */
  const plannerInFlightRef = useRef(0);
  const claimCheckRef = useRef<{
    turnId: string | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({turnId: null, timer: null});
  const ringAnim = useRef(new Animated.Value(1)).current;
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedActionRef = useRef('');
  const closingRef = useRef(false);
  const speechProviderRef = useRef<CallSpeechProvider | null>(null);
  const onlineRef = useRef<OnlineReminderHandle | null>(null);
  const answeringRef = useRef(false);
  const decliningRef = useRef(false);
  const onlineFailedRef = useRef(false);
  const answeredAtRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const transitioningRef = useRef(false);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedRef = useRef(false);
  /** The device's reading of the student's latest turn (one per turn). */
  const turnRef = useRef<TurnReading | null>(null);
  /** The last card decision, for an agent confirm_draft that comes late. */
  const lastDecisionRef = useRef<{
    kind: 'saved' | 'cancelled';
    reply: string;
  } | null>(null);
  /**
   * Held while the app reads the reminder aloud. The online conversation
   * connects meanwhile and opens the microphone only once this resolves.
   */
  const greetingGateRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
  } | null>(null);

  const clearResultTimeout = useCallback((): void => {
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      closingRef.current = true;
      clearResultTimeout();
      if (snoozeTimerRef.current) {
        clearTimeout(snoozeTimerRef.current);
        snoozeTimerRef.current = null;
      }
      if (claimCheckRef.current.timer) {
        clearTimeout(claimCheckRef.current.timer);
        claimCheckRef.current.timer = null;
      }
      greetingGateRef.current?.resolve();
      greetingGateRef.current = null;
      try {
        Vibration.cancel();
      } catch {
        // Ignore vibration cancel failure on unmount
      }
    },
    [clearResultTimeout],
  );

  const resetPresentation = useCallback((): void => {
    attemptRef.current += 1;
    answeringRef.current = false;
    decliningRef.current = false;
    onlineFailedRef.current = false;
    answeredAtRef.current = null;
    transitioningRef.current = false;
    greetingGateRef.current?.resolve();
    greetingGateRef.current = null;
    turnRef.current = null;
    lastDecisionRef.current = null;
    setAnswering(false);
    setOnlineCall(false);
    setOnlineView(false);
    setOnlineSnapshot(null);
    setOnlineMeter(null);
    warnedRef.current = false;
    if (snoozeTimerRef.current) {
      clearTimeout(snoozeTimerRef.current);
      snoozeTimerRef.current = null;
    }
    studentSpokeRef.current = false;
    pendingActionRef.current = null;
    setPendingAction(null);
    setSessionLive(false);
    resolvedRef.current = false;
    if (claimCheckRef.current.timer) clearTimeout(claimCheckRef.current.timer);
    claimCheckRef.current = {turnId: null, timer: null};
    clearResultTimeout();
    Vibration.cancel();
    setCallState('ringing');
    setResolution(null);
    setTranscript('');
    setReply('');
    setNotice('');
    ringAnim.setValue(1);
    processedActionRef.current = '';
  }, [clearResultTimeout, ringAnim, setOnlineView]);

  const stopOnline = useCallback(async (): Promise<void> => {
    const current = onlineRef.current;
    if (current) await current.endAndWait();
    setOnlineCall(false);
  }, []);

  const openGreetingGate = useCallback((): void => {
    greetingGateRef.current?.resolve();
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>(done => {
      resolve = done;
    });
    greetingGateRef.current = {promise, resolve};
  }, []);
  const releaseGreetingGate = useCallback((): void => {
    greetingGateRef.current?.resolve();
  }, []);
  const waitForGreeting = useCallback((): Promise<void> => {
    const gate = greetingGateRef.current;
    if (!gate) return Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | null = null;
    return Promise.race([
      gate.promise,
      new Promise<void>(done => {
        timer = setTimeout(() => {
          void stopSpeechPlayback().catch(() => undefined);
          done();
        }, GREETING_GATE_MAX_MS);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }, []);

  const closeCallScreen = useCallback((): void => {
    if (closingRef.current) return;
    closingRef.current = true;
    // A card nobody confirmed during the call is discarded, never applied.
    reviewRef.current.cancel({silent: true});
    resetPresentation();
    onClose();
  }, [onClose, resetPresentation]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      resetPresentation();
      const defaultSnoozeMinutes =
        getReminderPreferences(userId).snoozeDurationMinutes;
      setSnoozeMinutes(defaultSnoozeMinutes);
      const currentAlertPrefs = alertPrefsRef.current;
      const online = expectsOnlineCall(
        userId,
        currentAlertPrefs.callAnswerMode,
      );
      setExpectOnline(online);
      let ringing = true;
      // The online voice reads the reminder only when this call goes online;
      // an offline call never sends the reminder text anywhere.
      const speechProvider = createCallSpeechProvider(userId, {
        isOnlineMode: () =>
          !onlineFailedRef.current &&
          expectsOnlineCall(userId, alertPrefsRef.current.callAnswerMode),
      });
      speechProviderRef.current = speechProvider;
      const prepare = (asOnline: boolean): void => {
        if (currentAlertPrefs.callAnswerMode === 'buttons_only') return;
        // Prepare the opening line this call is expected to use.
        if (currentAlertPrefs.callGreetingStyle === 'friendly') {
          void prepareCallSpeech(
            speechProvider,
            task,
            defaultSnoozeMinutes,
            asOnline,
          );
        } else {
          void prepareCallSpeech(
            speechProvider,
            task,
            defaultSnoozeMinutes,
            asOnline,
            currentAlertPrefs.callGreetingStyle,
          );
        }
      };
      prepare(online);
      if (online) {
        // No connection while it rings: say so on the Answer button, and
        // prepare the offline opening instead.
        void cloudClient
          .isOnline()
          .catch(() => false)
          .then(connected => {
            if (!ringing || connected) return;
            setExpectOnline(false);
            prepare(false);
          });
      }
      return () => {
        ringing = false;
        if (speechProviderRef.current === speechProvider) {
          speechProviderRef.current = null;
        }
        void speechProvider.dispose?.().catch(() => undefined);
      };
    }

    resetPresentation();
    return undefined;
  }, [reminderId, resetPresentation, task, userId, visible]);

  // An answered call keeps the screen on: a screen that times out pauses
  // the app, and pausing ends the call (the online voice tears down).
  const callLive =
    visible && callState !== 'ringing' && callState !== 'disconnected';
  useEffect(() => {
    if (!callLive) return undefined;
    const owner = `reminder-call:${reminderId}`;
    setKeepScreenOn(owner, true);
    return () => setKeepScreenOn(owner, false);
  }, [callLive, reminderId]);

  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;

    if (visible && callState === 'ringing') {
      const vibPattern = callVibrationArray(
        alertPrefs.callVibrate,
        alertPrefs.callVibrationPattern,
      );
      if (vibPattern) {
        Vibration.vibrate(vibPattern, true);
      }
      animLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, {
            toValue: 1.1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      animLoop.start();
    } else {
      Vibration.cancel();
      ringAnim.setValue(1);
    }

    return () => {
      Vibration.cancel();
      animLoop?.stop();
    };
  }, [
    visible,
    callState,
    ringAnim,
    alertPrefs.callVibrate,
    alertPrefs.callVibrationPattern,
  ]);

  // Stop background vibration when leaving the screen while ringing, and
  // dismiss stale ringing UI if native auto-snoozed or remote sync settled it.
  useEffect(() => {
    if (!visible || callState !== 'ringing') return undefined;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        try {
          Vibration.cancel();
        } catch {
          // ignore
        }
        return;
      }
      if (
        reminderId &&
        userId &&
        !deliveryStore.checkFence(reminderId, userId, deliveryGeneration).ok
      ) {
        closeCallScreen();
      }
    });
    return () => sub.remove();
  }, [visible, callState, reminderId, userId, deliveryGeneration, closeCallScreen]);

  useEffect(() => {
    if (!visible) return;

    const stateSub = DeviceEventEmitter.addListener(
      'LAFINA_CALL_STATE_CHANGE',
      (event: CallStateEvent) => {
        if (
          event.reminderId &&
          (event.reminderId !== reminderId ||
            event.userId !== userId ||
            (event.generation != null &&
              deliveryGeneration != null &&
              event.generation !== deliveryGeneration))
        )
          return;
        if (event.state === 'disconnected') {
          if (event.resolution) {
            Vibration.cancel();
            resolvedRef.current = true;
            setCallState('disconnected');
            setResolution(event.resolution);
            setReply(event.resolution.message);
            clearResultTimeout();
            resultTimeoutRef.current = setTimeout(
              closeCallScreen,
              CALL_RESULT_DELAY_MS,
            );
            return;
          }

          closeCallScreen();
          return;
        }

        setSessionLive(true);
        setCallState(event.state);
        if (event.text !== undefined) {
          setReply(event.text);
        }
        // The reminder is already acknowledged or snoozed: show that now,
        // while the confirmation is spoken, not after it ends.
        if (event.resolution) {
          Vibration.cancel();
          resolvedRef.current = true;
          setResolution(event.resolution);
        }
      },
    );

    const partialSub = DeviceEventEmitter.addListener(
      'onSpeechPartialResult',
      (event: {transcript?: string; captureId?: string}) => {
        if (ownsCallCapture(userId, reminderId, event.captureId))
          setTranscript(event.transcript || '');
      },
    );

    const finalSub = DeviceEventEmitter.addListener(
      'onSpeechFinalResult',
      (event: {transcript?: string; captureId?: string}) => {
        if (ownsCallCapture(userId, reminderId, event.captureId))
          setTranscript(event.transcript || '');
      },
    );

    return () => {
      stateSub.remove();
      partialSub.remove();
      finalSub.remove();
    };
  }, [
    clearResultTimeout,
    closeCallScreen,
    visible,
    reminderId,
    userId,
    deliveryGeneration,
  ]);

  const handleAnswer = useCallback(async (): Promise<void> => {
    if (answeringRef.current || decliningRef.current || closingRef.current)
      return;
    answeringRef.current = true;
    setAnswering(true);
    const attempt = ++attemptRef.current;
    Vibration.cancel();
    void silenceNativeIncomingCall(reminderId, userId, deliveryGeneration);
    setCallState('connected');
    const currentAlertPrefs = alertPrefsRef.current;
    // Online Mode on (when allowed by answer mode): open straight into the
    // conversation view ("Connecting…") instead of flashing offline buttons.
    setOnlineView(expectsOnlineCall(userId, currentAlertPrefs.callAnswerMode));
    answeredAtRef.current = Date.now();
    callLifecycle.put(
      userId,
      {
        reminderId,
        ownerId: userId,
        generation: deliveryGeneration,
        action: 'call',
      },
      'answered',
    );
    // A Call Lafina still running (online or offline) ends here: the reminder
    // call takes the microphone and the speaker.
    endActiveVoiceConversation('A reminder call was answered.');

    if (currentAlertPrefs.callAnswerMode === 'buttons_only') {
      try {
        const speechProvider =
          speechProviderRef.current || createCallSpeechProvider(userId);
        const accepted = await answerCall(
          reminderId,
          userId,
          false,
          speechProvider,
          deliveryGeneration,
          false,
          {
            buttonsOnly: true,
            greetingStyle: currentAlertPrefs.callGreetingStyle,
          },
        );
        if (attempt !== attemptRef.current || closingRef.current) return;
        if (!accepted && !resolvedRef.current && !pendingActionRef.current) {
          closeCallScreen();
        }
      } catch (error) {
        console.error('[CallScreen] Could not answer reminder call:', error);
        if (attempt === attemptRef.current && !closingRef.current) {
          setOnlineView(false);
          setReply(
            'LAFINA could not start the voice call. Use the buttons below.',
          );
        }
      } finally {
        if (attempt === attemptRef.current) {
          answeringRef.current = false;
          setAnswering(false);
        }
      }
      return;
    }

    await waitForVoiceConversationRelease();
    if (attempt !== attemptRef.current || closingRef.current) return;

    // Online whenever Call Lafina would be (signed in, Offline Mode not
    // picked, its disclosure already agreed to) and the phone is connected.
    // No pop-up mid-call: without that agreement the call is just offline.
    const useOnline =
      expectsOnlineCall(userId, currentAlertPrefs.callAnswerMode) &&
      (await cloudClient.isOnline().catch(() => false));
    if (attempt !== attemptRef.current || closingRef.current) return;

    let microphoneGranted = false;
    try {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      microphoneGranted = permission === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.error(
        '[CallScreen] Could not request microphone permission:',
        error,
      );
    }

    if (attempt !== attemptRef.current || closingRef.current) return;
    if (
      microphoneGranted &&
      Platform.OS === 'android' &&
      process.env.NODE_ENV !== 'test' &&
      AppState.currentState !== 'active'
    ) {
      await new Promise<void>(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          sub?.remove();
          resolve();
        };
        const sub = AppState.addEventListener('change', next => {
          if (next === 'active') finish();
        });
        const timer = setTimeout(finish, 300);
      });
    }
    if (attempt !== attemptRef.current || closingRef.current) return;
    if (AppState.currentState !== 'active') microphoneGranted = false;
    // No connection, no consent or no microphone: this is an offline call and
    // keeps its Acknowledge and Snooze buttons.
    if (!(useOnline && microphoneGranted)) setOnlineView(false);
    const goOnline = useOnline && microphoneGranted;
    if (goOnline) {
      // Connect while the reminder is read aloud, not after: the server
      // session is made now and the microphone opens when the reading ends.
      openGreetingGate();
      setOnlineView(true);
      setOnlineCall(true);
    }

    try {
      const speechProvider =
        speechProviderRef.current || createCallSpeechProvider(userId);
      const accepted =
        currentAlertPrefs.callGreetingStyle === 'friendly'
          ? await answerCall(
              reminderId,
              userId,
              microphoneGranted,
              speechProvider,
              deliveryGeneration,
              useOnline && microphoneGranted,
            )
          : await answerCall(
              reminderId,
              userId,
              microphoneGranted,
              speechProvider,
              deliveryGeneration,
              useOnline && microphoneGranted,
              {greetingStyle: currentAlertPrefs.callGreetingStyle},
            );
      if (attempt !== attemptRef.current || closingRef.current) return;
      if (!accepted) {
        // A button settled the call while the reminder was being read, or
        // online already handed off to offline voice: do not close a live call.
        if (goOnline && !onlineFailedRef.current) void stopOnline();
        if (
          !resolvedRef.current &&
          !pendingActionRef.current &&
          !onlineFailedRef.current
        )
          closeCallScreen();
        return;
      }
      if (goOnline && isExternalVoiceDowngraded?.(reminderId, userId)) {
        onlineFailedRef.current = true;
        void stopOnline();
        downgradeExternalVoiceToButtons(reminderId, userId);
        setOnlineView(false);
        setReply(
          'Microphone access is unavailable. Use Acknowledge or Snooze below.',
        );
      } else if (goOnline && AppState.currentState !== 'active') {
        onlineFailedRef.current = true;
        void stopOnline();
        downgradeExternalVoiceToButtons(reminderId, userId);
        setOnlineView(false);
        setReply('The app left the screen. Use Acknowledge or Snooze below.');
      }
      if (!microphoneGranted) {
        setReply(
          'Microphone permission is unavailable. Use Acknowledge or Snooze below.',
        );
      } else if (
        !useOnline &&
        currentAlertPrefs.callAnswerMode === 'auto_online' &&
        !choseOfflineMode(userId) &&
        !isGuestAccount(userId) &&
        !hasOnlineCallConsent(userId)
      ) {
        // Offline only because Call LAFINA was never agreed to: say how to
        // change that once, without interrupting the call.
        setNotice(OFFLINE_CONSENT_HINT);
      }
    } catch (error) {
      console.error('[CallScreen] Could not answer reminder call:', error);
      if (goOnline) void stopOnline();
      if (attempt === attemptRef.current && !closingRef.current) {
        setOnlineView(false);
        setReply(
          'LAFINA could not start the voice call. Use the buttons below.',
        );
      }
    } finally {
      // The reminder has been read (or the answer failed): audio may open.
      releaseGreetingGate();
      if (attempt === attemptRef.current) {
        answeringRef.current = false;
        setAnswering(false);
      }
    }
  }, [
    closeCallScreen,
    deliveryGeneration,
    openGreetingGate,
    releaseGreetingGate,
    reminderId,
    setOnlineView,
    stopOnline,
    userId,
  ]);

  const handleDecline = useCallback(async (): Promise<void> => {
    if (decliningRef.current || closingRef.current) return;
    decliningRef.current = true;
    Vibration.cancel();
    attemptRef.current += 1;
    try {
      await stopOnline();
      const speechProvider =
        speechProviderRef.current || createCallSpeechProvider(userId);
      await declineCall(reminderId, userId, speechProvider, deliveryGeneration);
    } catch (error) {
      console.error('[CallScreen] Could not end reminder call:', error);
    } finally {
      closeCallScreen();
    }
  }, [closeCallScreen, deliveryGeneration, reminderId, stopOnline, userId]);

  /** End after Answer: the reminder was received, so it is acknowledged. */
  const handleEndAnswered = useCallback(async (): Promise<void> => {
    if (closingRef.current) return;
    if (resolvedRef.current) {
      closeCallScreen();
      return;
    }
    if (pendingActionRef.current) return;
    Vibration.cancel();
    attemptRef.current += 1;
    pendingActionRef.current = 'end';
    setPendingAction('end');
    try {
      await stopOnline();
      const speechProvider =
        speechProviderRef.current || createCallSpeechProvider(userId);
      await endAnsweredCall(
        reminderId,
        userId,
        speechProvider,
        deliveryGeneration,
      );
    } catch (error) {
      console.error('[CallScreen] Could not end reminder call:', error);
    } finally {
      closeCallScreen();
    }
  }, [closeCallScreen, deliveryGeneration, reminderId, stopOnline, userId]);

  const handleReviewConfirm = useCallback(async (): Promise<string | null> => {
    const decision = await reviewRef.current.confirm({speakReply: false});
    if (!decision || closingRef.current) return null;
    setReply(decision.reply);
    lastDecisionRef.current = {
      kind: 'saved',
      reply: plainReply(decision.reply),
    };
    void onlineRef.current?.sendContext(`Planner update: ${decision.reply}`);
    return plainReply(decision.reply);
  }, []);

  const handleReviewCancel = useCallback((): string | null => {
    const decision = reviewRef.current.cancel();
    if (!decision || closingRef.current) return null;
    setReply(decision.reply);
    lastDecisionRef.current = {
      kind: 'cancelled',
      reply: plainReply(decision.reply),
    };
    void onlineRef.current?.sendContext(`Planner update: ${decision.reply}`);
    return plainReply(decision.reply);
  }, []);

  /**
   * Runs Acknowledge or Snooze once. The button shows its working state at
   * once and a second tap is ignored; if the reminder could not be changed
   * the buttons come back with the reason, instead of silently doing nothing.
   */
  const settle = useCallback(
    async (
      action: 'acknowledge' | 'snooze',
      run: () => Promise<'done' | 'busy' | 'failed' | void>,
      failure: string,
    ): Promise<void> => {
      if (pendingActionRef.current || resolvedRef.current) return;
      pendingActionRef.current = action;
      setPendingAction(action);
      const attempt = attemptRef.current;
      const release = (message?: string, failed = true): void => {
        if (attempt !== attemptRef.current || closingRef.current) return;
        if (pendingActionRef.current === action) {
          pendingActionRef.current = null;
          setPendingAction(null);
        }
        // The online conversation was stopped for this action; when it could
        // not be carried out, the student gets the offline buttons back
        // instead of a silent call. ("busy": another path is settling it.)
        if (failed && onlineViewRef.current) setOnlineView(false);
        if (message) setReply(message);
      };
      try {
        await stopOnline();
        const result = await run();
        // "busy": a spoken answer is already settling the call; its result
        // arrives on its own. "failed": the scheduler said why (shown as
        // LAFINA's reply), so only the buttons are given back.
        if (result === 'failed') release();
        else if (result === 'busy') release(undefined, false);
      } catch (error) {
        console.error(`[CallScreen] Could not ${action} reminder:`, error);
        release(failure);
      }
    },
    [setOnlineView, stopOnline],
  );

  const handleManualSnooze = useCallback(
    (minutes: number): Promise<void> =>
      settle(
        'snooze',
        () => manualSnoozeCall(reminderId, userId, minutes, deliveryGeneration),
        'LAFINA could not snooze this reminder. Please try again.',
      ),
    [deliveryGeneration, reminderId, settle, userId],
  );

  // The online agent's snooze_reminder tool. The dispatcher speaks the result
  // and ends the call, so the snooze runs after the tool answers.
  const handleAgentSnooze = useCallback(
    async (minutes: number): Promise<string> => {
      const committed = await commitAgentSnooze(
        reminderId,
        userId,
        minutes,
        deliveryGeneration,
      );
      if (!committed)
        return 'This call is already being handled. No additional snooze was saved.';
      if (committed.result.ok) {
        // Yield for the controller to send the actual tool result, then release audio
        // and speak the confirmation before closing so the student does not hear silence.
        if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
        snoozeTimerRef.current = setTimeout(() => {
          snoozeTimerRef.current = null;
          void stopOnline().then(() =>
            committed.speakAndClose
              ? committed.speakAndClose()
              : committed.close(),
          );
        }, 0);
      }
      return committed.result.message;
    },
    [reminderId, userId, deliveryGeneration, stopOnline],
  );

  const handleManualAcknowledge = useCallback(
    (): Promise<void> =>
      settle(
        'acknowledge',
        () => manualAcknowledgeCall(reminderId, userId, deliveryGeneration),
        'LAFINA could not acknowledge this reminder. Please try again.',
      ),
    [deliveryGeneration, reminderId, settle, userId],
  );

  /**
   * Shows what the device made of the student's words and tells the agent
   * the same thing, so it never asks for a change it already heard.
   */
  const showPlannerResult = useCallback(
    (
      planned: PrepareResult | null | undefined,
      message: string,
    ): TurnOutcome => {
      if (closingRef.current) return {kind: 'none'};
      reviewRef.current.present(planned);
      setReply(message);
      if (planned?.status === 'proposal') {
        setNotice('');
        void onlineRef.current?.sendContext(
          `Planner update: ${describeCallCard(planned.proposal)}`,
        );
        return {kind: 'card', proposal: planned.proposal};
      }
      // The conversation keeps replacing the reply line; a result that made
      // no card stays readable as a note until the next turn.
      setNotice(message);
      const plain = plainReply(message);
      const stillOpen =
        reviewRef.current.proposal && !reviewRef.current.expired
          ? reviewRef.current.proposal
          : null;
      void onlineRef.current?.sendContext(
        stillOpen
          ? `Planner update: ${plain} ${describeCallCard(stillOpen)}`
          : `Planner update: ${plain} No review card is on screen. If a detail is missing, ask only for that detail; do not ask the student to repeat the change.`,
      );
      return {
        kind: 'note',
        reply: plain,
        unresolved:
          planned?.status === 'clarify' || planned?.status === 'invalid',
      };
    },
    [],
  );

  /** The general planner on the student's own words, scoped to this call. */
  const runPlanner = useCallback(
    async (prompt: string): Promise<TurnOutcome> => {
      plannerInFlightRef.current += 1;
      try {
        const result = await chatOrchestrator.processMessage(userId, prompt, {
          onlineMode: true,
          ringingCall: {
            reminderId,
            generation: deliveryGeneration ?? 1,
          },
          reviewSurface: 'voice',
          // OnlineReminderConversation already persists turns to Chat History;
          // keep planner command evaluation out of SQLite chat history so turns
          // are never duplicated and the 20-chat limit cannot block call actions.
          temporaryChat: true,
        });
        return showPlannerResult(result.review, result.reply);
      } catch (error) {
        console.warn('[IncomingCallScreen] Online planner turn failed:', error);
        if (closingRef.current) return {kind: 'none'};
        const message =
          'Could not prepare that planner action right now. Nothing was changed.';
        setNotice(message);
        return {kind: 'note', reply: message};
      } finally {
        plannerInFlightRef.current = Math.max(
          0,
          plannerInFlightRef.current - 1,
        );
      }
    },
    [deliveryGeneration, reminderId, showPlannerResult, userId],
  );

  /** Moves exactly the ringing reminder (a review card; nothing saved yet). */
  const prepareMove = useCallback(
    (date: string | null, time: string | null, words: string): TurnOutcome => {
      const prepared = prepareReviewedCommand(
        userId,
        {
          ...RESCHEDULE_INTENT_BASE,
          intent: 'reschedule',
          date,
          time,
          rawTranscript: words,
        },
        {
          surface: 'voice',
          ringingCall: {reminderId, generation: deliveryGeneration ?? 1},
        },
      );
      return showPlannerResult(prepared, prepared.reply);
    },
    [deliveryGeneration, reminderId, showPlannerResult, userId],
  );

  const handleOnlineTurn = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (!trimmed) return;
      studentSpokeRef.current = true;
      setNotice('');
      // One reading per turn; the agent's planner tool waits for it.
      let finish: (outcome: TurnOutcome) => void = () => undefined;
      const reading: TurnReading = {
        text: trimmed,
        done: new Promise<TurnOutcome>(resolve => {
          finish = resolve;
        }),
      };
      turnRef.current = reading;
      const none = (): void => finish({kind: 'none'});

      // A spoken "confirm" / "cancel" answers the card on screen.
      if (reviewRef.current.proposal && !reviewRef.current.expired) {
        // "Okay, save it, Lafina." reads as a save, not as talk.
        if (SPOKEN_CONFIRM_RE.test(trimmed) || isExplicitSaveCommand(trimmed)) {
          void handleReviewConfirm().then(saved =>
            finish(saved ? {kind: 'saved', reply: saved} : {kind: 'none'}),
          );
          return;
        }
        if (SPOKEN_CANCEL_RE.test(trimmed)) {
          const cancelled = handleReviewCancel();
          finish(
            cancelled ? {kind: 'cancelled', reply: cancelled} : {kind: 'none'},
          );
          return;
        }
      }
      // Ordinary conversation or questions about snoozing/acknowledging must not resolve the reminder.
      // The whole reply has to be the command, with at most a polite lead-in
      // or ending ("okay, got it, thanks"); "I got it from the library" is talk.
      const command = detectCallKeyword(trimmed);
      if (command) {
        if (command.intent === 'acknowledge') void handleManualAcknowledge();
        else void handleManualSnooze(command.minutes ?? snoozeMinutes);
        finish({
          kind: 'settled',
          reply:
            command.intent === 'acknowledge'
              ? 'The reminder is acknowledged and the call is ending.'
              : `The reminder rings again in ${
                  command.minutes ?? snoozeMinutes
                } minutes and the call is ending.`,
        });
        return;
      }

      // "Move it to 7 PM", "call me back at 8": this reminder, not a new task.
      const change = parseRingingReminderChange(trimmed);
      if (change?.kind === 'snooze') {
        void handleManualSnooze(change.minutes);
        finish({
          kind: 'settled',
          reply: `The reminder rings again in ${change.minutes} minutes and the call is ending.`,
        });
        return;
      }
      if (change?.kind === 'reschedule') {
        finish(prepareMove(change.date, change.time, trimmed));
        return;
      }
      if (change?.kind === 'ask_time') {
        // No usable time: the planner asks for exactly that, nothing else.
        finish(prepareMove(null, null, trimmed));
        return;
      }

      if (
        /\?$/.test(trimmed) &&
        !/^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:mark|reschedule|move|schedule|add|create|pin|unpin|remind|note|take|put|set|delete|remove|cancel|change|rename)/i.test(
          trimmed,
        )
      ) {
        none();
        return;
      }
      if (
        /\b(?:about\s+snoozing|what\s+does\s+snooze|should\s+i\s+snooze)\b/i.test(
          trimmed,
        )
      ) {
        none();
        return;
      }

      const isDoneCommand =
        /^(?:please\s+)?(?:i\s+(?:finished|completed|did)\s+(?:it|this|that)|mark\s+(?:it|this|that|the\s+(?:task|reminder))\s+(?:as\s+)?done|complete\s+(?:it|this|the\s+(?:task|reminder)))(?:\s+please)?[.!]*$/i.test(
          trimmed,
        );
      const isPlannerActionCommand =
        isDoneCommand ||
        /^(?:please\s+)?(?:(?:can|could|will)\s+you\s+(?:please\s+)?)?(?:add\s+(?:a\s+)?(?:task|todo|to-?do|note|reminder|event)|schedule\s+|create\s+(?:a\s+)?(?:task|todo|to-?do|note|reminder|event)|pin\s+|unpin\s+)/i.test(
          trimmed,
        );

      // LAFINA tells the student the app makes a card from their words, so any
      // clear planner request has to make one ("I need to add a task to…",
      // "remind me to…", "take a note that…"), not only a few fixed openings.
      // A command verb is required so ordinary talk ("okay, I will do it
      // later") does not turn into a card.
      const spokenIntent = parseIntentFastPath(trimmed);
      const isSpokenPlannerRequest =
        CARD_INTENTS.has(spokenIntent.intent) &&
        !!(spokenIntent.title || spokenIntent.targetTitle) &&
        (spokenIntent.confidence >= 0.9 ||
          /\b(?:add|create|schedule|remind|note|put|set|move|reschedule|postpone|delete|remove|cancel|mark|rename|change|block)\b/i.test(
            trimmed,
          ));

      if (!isPlannerActionCommand && !isSpokenPlannerRequest) {
        none();
        return;
      }

      const routedPrompt =
        isDoneCommand && task ? `Mark task "${task}" as done` : trimmed;
      void runPlanner(routedPrompt).then(outcome => {
        finish(outcome);
        // Ending the call discards an unanswered card or hides a clarification,
        // so "I finished it" acknowledges only when nothing is waiting.
        if (
          isDoneCommand &&
          outcome.kind === 'note' &&
          !outcome.unresolved &&
          !closingRef.current
        )
          void handleManualAcknowledge();
      });
    },
    [
      handleManualAcknowledge,
      handleManualSnooze,
      handleReviewCancel,
      handleReviewConfirm,
      prepareMove,
      runPlanner,
      snoozeMinutes,
      task,
    ],
  );

  /**
   * The agent's planner tools. They are answered from the device's reading
   * of the student's own words (the same words the agent heard), so a card
   * the student asked for appears once and the agent is told exactly what
   * is on screen. The model's own arguments never write anything.
   */
  const handlePlannerTool = useCallback(
    async (
      name: string,
      _parameters: Record<string, unknown>,
      isCurrent: () => boolean,
    ): Promise<string> => {
      const reading = turnRef.current;
      let outcome: TurnOutcome = {kind: 'none'};
      if (reading) {
        let timer: ReturnType<typeof setTimeout> | null = null;
        outcome = await Promise.race([
          reading.done,
          new Promise<TurnOutcome>(resolve => {
            timer = setTimeout(
              () => resolve({kind: 'none'}),
              TURN_READ_WAIT_MS,
            );
          }),
        ]);
        if (timer) clearTimeout(timer);
      }
      if (!isCurrent() || closingRef.current)
        throw new Error(
          'Request cancelled because conversational turn updated.',
        );
      const open = latestPendingReview(userId, 'voice');

      if (name === 'confirm_draft') {
        if (outcome.kind === 'saved') return `Saved: ${outcome.reply}`;
        if (open)
          return 'Not saved yet: the student has not said to save this card. Ask whether to save it; when they say confirm or tap Confirm, the app saves it and tells you.';
        const last = lastDecisionRef.current;
        if (last)
          return last.kind === 'saved'
            ? `Already saved: ${last.reply}`
            : `The card was cancelled: ${last.reply}`;
        return 'No card is open, so nothing was saved.';
      }
      if (name === 'cancel_draft') {
        if (outcome.kind === 'cancelled') return `Cancelled: ${outcome.reply}`;
        if (open)
          return 'The card is still on screen. The app cancels it when the student says cancel or taps Cancel. Nothing was saved.';
        return 'No card is open. Nothing was saved.';
      }

      switch (outcome.kind) {
        case 'card':
          return describeCallCard(outcome.proposal);
        case 'saved':
          return `Already saved: ${outcome.reply} Do not prepare it again.`;
        case 'cancelled':
          return `The student cancelled the card: ${outcome.reply}`;
        case 'settled':
          return `${outcome.reply} Say nothing more.`;
        case 'note':
          return `${outcome.reply} No review card is on screen. If a detail is missing, ask only for that detail; do not ask the student to repeat the change.`;
        default:
          break;
      }
      if (open && name === 'revise_draft') {
        const inst =
          typeof _parameters.instruction === 'string' &&
          _parameters.instruction.trim()
            ? _parameters.instruction.trim()
            : reading?.text || '';
        if (inst) {
          const revised = reviseReviewedCommand(userId, open.operationId, inst);
          if (revised.status === 'proposal') {
            showPlannerResult(revised, revised.reply);
            return describeCallCard(revised.proposal);
          }
        }
      }
      if (open && name !== 'revise_draft') return describeCallCard(open);
      // The device saw no planner request in these words, but the agent did
      // (including a revision to an open card): read the same words once more
      // with the planner (a card at most).
      if (reading?.text) {
        const fresh = await runPlanner(reading.text);
        if (!isCurrent() || closingRef.current)
          throw new Error(
            'Request cancelled because conversational turn updated.',
          );
        if (fresh.kind === 'card') return describeCallCard(fresh.proposal);
        if (fresh.kind === 'note') {
          if (open) return describeCallCard(open);
          return `${fresh.reply} No review card is on screen. If a detail is missing, ask only for that detail; do not ask the student to repeat the change.`;
        }
      }
      if (open) return describeCallCard(open);
      return 'No planner change was found in what the student said, so nothing was changed. Ask what they would like to change.';
    },
    [runPlanner, showPlannerResult, userId],
  );

  const handleOnlineSnapshot = useCallback(
    (snapshot: ConversationSnapshot): void => {
      setOnlineSnapshot(snapshot);
      const latestUser = [...snapshot.turns]
        .reverse()
        .find(turn => turn.role === 'user');
      const latestAssistant = [...snapshot.turns]
        .reverse()
        .find(turn => turn.role === 'assistant');
      if (latestUser) setTranscript(latestUser.text);
      if (latestAssistant) setReply(latestAssistant.text);
      // LAFINA said a card is on screen. If none is there once the device has
      // finished reading the student's words, say so and tell the agent.
      if (
        latestAssistant &&
        latestAssistant.status !== 'provisional' &&
        claimCheckRef.current.turnId !== latestAssistant.id &&
        CARD_CLAIM_RE.test(latestAssistant.text) &&
        !CARD_DENIAL_RE.test(latestAssistant.text)
      ) {
        const check = claimCheckRef.current;
        check.turnId = latestAssistant.id;
        if (check.timer) clearTimeout(check.timer);
        const attempt = attemptRef.current;
        const verify = (): void => {
          check.timer = null;
          if (closingRef.current || attempt !== attemptRef.current) return;
          if (plannerInFlightRef.current > 0) {
            check.timer = setTimeout(verify, CARD_CLAIM_GRACE_MS);
            return;
          }
          if (reviewRef.current.proposal) return;
          setNotice(NO_CARD_NOTE);
          void onlineRef.current?.sendContext(NO_CARD_CONTEXT);
        };
        check.timer = setTimeout(verify, CARD_CLAIM_GRACE_MS);
      }
      if (snapshot.phase !== 'failed' && snapshot.phase !== 'restart_required')
        return;
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      onlineFailedRef.current = true;
      const rawMessage =
        snapshot.failure?.message ||
        snapshot.restartReason ||
        'Online conversation stopped.';
      const message =
        rawMessage === RECONNECT_FAILED_REASON
          ? 'The connection dropped and could not be restored.'
          : rawMessage;
      const noMicrophone =
        snapshot.failure?.kind === 'mic_denied' ||
        snapshot.failure?.kind === 'mic_busy' ||
        snapshot.failure?.kind === 'audio';
      const connectionLost =
        snapshot.phase === 'restart_required' &&
        /(?:connection closed|connection dropped)/i.test(
          snapshot.restartReason || '',
        );
      const canFallBack =
        ((snapshot.phase === 'failed' && !noMicrophone) || connectionLost) &&
        AppState.currentState === 'active';
      const attempt = attemptRef.current;
      void (async () => {
        await stopOnline();
        if (closingRef.current || attempt !== attemptRef.current) return;
        // Offline voice (or the buttons) takes over: show the offline call.
        setOnlineView(false);
        const fallbackMessage = `${message} ${
          canFallBack
            ? 'Switching to offline voice.'
            : 'Use Acknowledge or Snooze below.'
        }`;
        setNotice(fallbackMessage);
        setReply(fallbackMessage);
        if (!canFallBack) {
          downgradeExternalVoiceToButtons(reminderId, userId);
          return;
        }
        // The connection can fail while the reminder is still being read
        // (it connects meanwhile): offline voice starts after the reading.
        await waitForGreeting();
        if (closingRef.current || attempt !== attemptRef.current) return;
        resumeOfflineCall(reminderId, userId);
      })();
    },
    [reminderId, setOnlineView, stopOnline, userId, waitForGreeting],
  );

  const handleToggleMute = useCallback((): void => {
    onlineRef.current?.setMuted?.(!onlineSnapshot?.muted);
  }, [onlineSnapshot?.muted]);

  const handleStopResponse = useCallback((): void => {
    onlineRef.current?.stopResponse?.();
  }, []);

  /** A typed turn, for a student who cannot speak out loud right now. */
  const handleSendText = useCallback(async (text: string): Promise<boolean> => {
    const send = onlineRef.current?.sendText;
    if (!send) return false;
    return send(text).catch(() => false);
  }, []);

  useEffect(() => {
    if (!visible || !reminderId) return;
    const actionKey =
      reminderId + ':' + String(deliveryGeneration) + ':' + initialAction;
    if (processedActionRef.current === actionKey) return;
    processedActionRef.current = actionKey;

    if (initialAction === 'answer') void handleAnswer();
    if (initialAction === 'decline') void handleDecline();
  }, [
    visible,
    reminderId,
    deliveryGeneration,
    initialAction,
    handleAnswer,
    handleDecline,
  ]);

  useEffect(() => {
    if (!visible || callState === 'ringing' || callState === 'disconnected')
      return;
    const tick = setInterval(() => {
      const start = answeredAtRef.current;
      if (start === null || resolvedRef.current || pendingActionRef.current)
        return;
      if (Date.now() - start >= ANSWERED_CALL_LIMIT_MS) {
        answeredAtRef.current = null;
        reviewRef.current.cancel({silent: true});
        // A student who has been talking with LAFINA has plainly received
        // the reminder: the call ends as if they hung up. An answered call
        // nobody spoke on still rings again later.
        if (onlineViewRef.current && studentSpokeRef.current) {
          void handleEndAnswered();
          return;
        }
        void stopOnline().then(() =>
          autoSnoozeCall({reminderId, userId, generation: deliveryGeneration}),
        );
      } else if (
        !warnedRef.current &&
        Date.now() - start >= ANSWERED_CALL_LIMIT_MS - 60_000
      ) {
        warnedRef.current = true;
        setNotice(
          onlineViewRef.current
            ? 'This reminder call ends in less than a minute. Say “call me back later” if you need more time.'
            : 'This reminder call ends in less than a minute. Acknowledge or Snooze to choose what happens next.',
        );
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [
    visible,
    callState,
    stopOnline,
    handleEndAnswered,
    reminderId,
    userId,
    deliveryGeneration,
  ]);

  useEffect(() => {
    if (!visible || callState !== 'ringing') return;
    const timeoutMs = alertPrefs.callRingTimeoutSec * 1000;
    const timeout = setTimeout(() => void handleDecline(), timeoutMs);
    return () => clearTimeout(timeout);
  }, [visible, callState, handleDecline, alertPrefs.callRingTimeoutSec]);

  if (!visible) return null;

  const reviewCard = review.proposal ? (
    <CommandReviewCard
      proposal={review.proposal}
      expired={review.expired}
      busy={review.busy}
      onConfirm={() => void handleReviewConfirm()}
      onCancel={handleReviewCancel}
      onDismiss={review.dismiss}
      onEdit={patch => {
        const result = review.edit?.(patch) ?? null;
        if (result?.status === 'proposal') {
          void onlineRef.current?.sendContext(
            `Planner update: ${describeCallCard(result.proposal)}`,
          );
        }
        return result;
      }}
      onDeliveryChange={review.setDelivery}
      editError={review.editError}
      testIDPrefix="reminder-call-review"
    />
  ) : undefined;

  const themed = {
    container: {backgroundColor: colors.background},
    primaryText: {color: colors.textPrimary},
    secondaryText: {color: colors.textSecondary},
    mutedText: {color: colors.textMuted},
    badge: isModern
      ? {
          backgroundColor: modernPalette.softViolet,
          borderColor: modernPalette.border,
        }
      : {
          backgroundColor: isDarkMode
            ? 'rgba(230, 0, 58, 0.16)'
            : 'rgba(230, 0, 58, 0.08)',
          borderColor: isDarkMode
            ? 'rgba(230, 0, 58, 0.36)'
            : 'rgba(230, 0, 58, 0.20)',
        },
    logoSurface: {
      backgroundColor: isModern
        ? modernPalette.card
        : isDarkMode
        ? 'rgba(255, 255, 255, 0.05)'
        : colors.cardBg,
      borderColor: isModern ? modernPalette.accent : colors.blue,
    },
    taskCard: {
      backgroundColor: colors.cardBg,
      borderColor: isModern ? modernPalette.border : colors.border,
    },
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={() => {
        if (resolvedRef.current || callState === 'disconnected') {
          closeCallScreen();
          return;
        }
        if (pendingActionRef.current) return;
        void (callState === 'ringing' ? handleDecline() : handleEndAnswered());
      }}
    >
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor={colors.background}
      />
      <SafeAreaView style={[styles.container, themed.container]}>
        {callState === 'ringing' ? (
          <View style={styles.ringingContainer}>
            <View style={styles.header}>
              <View style={[styles.badge, themed.badge]}>
                <BellRing
                  size={13}
                  color={isModern ? modernPalette.accent : colors.blue}
                />
                <Text
                  style={[
                    styles.badgeText,
                    {color: isModern ? modernPalette.accent : colors.blue},
                  ]}
                >
                  REMINDER CALL
                </Text>
              </View>
              <Text style={[styles.callerName, themed.primaryText]}>
                LAFINA
              </Text>
              <Text
                testID="incoming-call-subtitle"
                style={[styles.callType, themed.secondaryText]}
              >
                {alertPrefs.callCallerSubtitle || DEFAULT_CALLER_SUBTITLE}
              </Text>
            </View>

            <View style={styles.middle}>
              <Animated.View
                style={[
                  styles.avatarRingOuter,
                  {
                    borderColor: isModern
                      ? modernPalette.periwinkle
                      : colors.yellow,
                    transform: [{scale: ringAnim}],
                  },
                ]}
              >
                <View
                  style={[
                    styles.avatarRingInner,
                    {
                      borderColor: isModern ? modernPalette.accent : colors.red,
                    },
                  ]}
                >
                  <View style={[styles.avatarCircle, themed.logoSurface]}>
                    <Image
                      source={lafinaLogo}
                      style={styles.avatarImage}
                      resizeMode="contain"
                      accessibilityLabel="LAFINA logo"
                    />
                  </View>
                </View>
              </Animated.View>

              <View
                style={[
                  styles.taskCard,
                  isModern && modernShadows.card,
                  themed.taskCard,
                  isModern && {borderRadius: ModernLayout.borderRadiusCard},
                ]}
              >
                <Text style={[styles.taskLabel, themed.mutedText]}>
                  REMINDER
                </Text>
                <Text style={[styles.taskText, themed.primaryText]}>
                  {task || 'Scheduled academic reminder'}
                </Text>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={[styles.offlineLabel, themed.mutedText]}>
                Simulated reminder call from the app, not a phone call
              </Text>
              <View style={styles.actionRow}>
                <View style={styles.buttonColumn}>
                  <TouchableOpacity
                    style={[
                      styles.circleButton,
                      {backgroundColor: colors.error},
                    ]}
                    disabled={answering}
                    onPress={() => void handleDecline()}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Decline reminder call"
                    accessibilityHint="Ends this call and applies the automatic snooze policy."
                  >
                    <PhoneOff size={30} color={colors.white} />
                  </TouchableOpacity>
                  <Text style={[styles.buttonLabel, themed.secondaryText]}>
                    Decline
                  </Text>
                  <Text style={[styles.buttonSubLabel, themed.mutedText]}>
                    Rings again later
                  </Text>
                </View>

                <View style={styles.buttonColumn}>
                  <TouchableOpacity
                    style={[
                      styles.circleButton,
                      {backgroundColor: colors.success},
                    ]}
                    disabled={answering}
                    onPress={() => void handleAnswer()}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Answer reminder call"
                    accessibilityHint="Answers the reminder call. Online conversation starts when enabled and permitted."
                  >
                    <Phone size={30} color={colors.white} />
                  </TouchableOpacity>
                  <Text style={[styles.buttonLabel, themed.secondaryText]}>
                    Answer
                  </Text>
                  <Text
                    testID="incoming-call-answer-sublabel"
                    style={[styles.buttonSubLabel, themed.mutedText]}
                  >
                    {alertPrefs.callAnswerMode === 'buttons_only'
                      ? 'Buttons only (silent)'
                      : expectOnline
                      ? 'Talk with LAFINA'
                      : 'Hear the reminder'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : onlineView ? (
          // Online: a conversation like Call LAFINA. No Acknowledge or Snooze
          // buttons; the student talks, or hangs up (counts as received).
          <OnlineReminderCallView
            task={task}
            snapshot={onlineSnapshot}
            meter={onlineMeter}
            callState={callState}
            resolution={resolution}
            transcript={transcript}
            reply={reply}
            replyFormat={replyFormat}
            notice={notice}
            pendingAction={pendingAction}
            reviewCard={reviewCard}
            onToggleMute={handleToggleMute}
            onStopResponse={handleStopResponse}
            onSendText={handleSendText}
            onEnd={handleEndAnswered}
            answeredAtMs={answeredAtRef.current}
          />
        ) : (
          // Offline (or the online conversation could not run): the
          // Acknowledge and Snooze buttons stay, with offline voice.
          <CallAnsweredView
            task={task}
            callState={callState}
            resolution={resolution}
            snoozeMinutes={snoozeMinutes}
            onSnooze={handleManualSnooze}
            onAcknowledge={handleManualAcknowledge}
            onDecline={handleEndAnswered}
            transcript={transcript}
            reply={reply}
            replyFormat={replyFormat}
            notice={notice}
            busy={answering && !sessionLive}
            pendingAction={pendingAction}
            reviewCard={reviewCard}
            answeredAtMs={answeredAtRef.current}
          />
        )}
        {onlineCall && callState !== 'ringing' ? (
          <OnlineReminderConversation
            ref={onlineRef}
            userId={userId}
            task={task}
            snoozeMinutes={snoozeMinutes}
            onSnapshot={handleOnlineSnapshot}
            onMeter={setOnlineMeter}
            onSpokenTurn={handleOnlineTurn}
            onSnooze={handleAgentSnooze}
            onPlannerTool={handlePlannerTool}
            beforeAudio={waitForGreeting}
            getCallState={() => {
              const open =
                reviewRef.current.proposal && !reviewRef.current.expired
                  ? reviewRef.current.proposal
                  : null;
              return open ? describeCallCard(open) : null;
            }}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  ringingContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 26,
  },
  header: {
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  buttonSubLabel: {
    fontFamily: Fonts.body,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  badgeText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  callerName: {
    fontFamily: Fonts.heading,
    fontSize: 30,
    fontWeight: '800',
    marginTop: 18,
    textAlign: 'center',
  },
  callType: {
    fontFamily: Fonts.body,
    fontSize: 15,
    marginTop: 7,
    textAlign: 'center',
  },
  middle: {
    width: '100%',
    alignItems: 'center',
  },
  avatarRingOuter: {
    width: 194,
    height: 194,
    borderRadius: 97,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingInner: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 146,
    height: 146,
    borderRadius: 73,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Shadows.card,
  },
  avatarImage: {
    width: 124,
    height: 72,
  },
  taskCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 34,
    ...Shadows.card,
  },
  taskLabel: {
    fontFamily: Fonts.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    textAlign: 'center',
  },
  taskText: {
    fontFamily: Fonts.body,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 6,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
  },
  offlineLabel: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 18,
  },
  actionRow: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  buttonColumn: {
    alignItems: 'center',
    minWidth: 110,
  },
  circleButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  buttonLabel: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
});
