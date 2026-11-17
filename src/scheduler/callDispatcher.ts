import { DeviceEventEmitter } from 'react-native';
import { remindersStore } from '../storage/remindersStore';
import { deliveryStore } from '../storage/deliveryStore';
import { db } from '../storage/database';
import { alertSuppression } from '../storage/sourceReminders';
import { initTts, stopSpeechPlayback } from '../ai/tts/ttsService';
import {
  cancelOfflineSpeechCapture,
  hasOfflineSpeechCapture,
  isMicrophoneBusyError,
  startOfflineSpeechCapture,
} from '../ai/native/speechCapture';
import type {
  OfflineSpeechCaptureHandle,
  OfflineSpeechResult,
} from '../ai/native/speechCapture';
import { getReminderPreferences } from './userPreferences';
import {
  ACKNOWLEDGE_MESSAGE,
  acknowledgeReminderAction,
  autoSnoozeReminderAction,
  snoozeMessage,
  snoozeReminderAction,
} from './reminderActions';
import type {
  ReminderActionOutcome,
  ReminderActionResult,
} from './reminderActions';
import {
  cancelReminderAlarm,
  finishNativeIncomingCall,
  startActiveCallSession,
  stopActiveCallSession,
} from './reminderAlarm';
import {
  CallSpeechProvider,
  defaultCallSpeechProvider,
} from './speechProvider';

export type CallState =
  | 'ringing'
  | 'connected'
  | 'speaking'
  | 'speaking_listening'
  | 'listening'
  | 'processing'
  | 'disconnected';

export type CallResolutionOutcome = Exclude<ReminderActionOutcome, 'rejected'>;

export interface CallResolution {
  outcome: CallResolutionOutcome;
  message: string;
}

export interface CallStateEvent {
  state: CallState;
  text?: string;
  /**
   * How the call ended. It arrives with `speaking` as soon as the reminder is
   * acknowledged or snoozed, so the screen shows the result while the
   * confirmation is spoken, and again with `disconnected` when the call closes.
   */
  resolution?: CallResolution;
}

interface CallDispatcherSession {
  id: number;
  reminderId: string;
  userId: string;
  /** Delivery generation captured when the call was shown; fences every action. */
  generation: number | null;
  task: string;
  state: CallState;
  retryCount: number;
  voiceEnabled: boolean;
  speechProvider: CallSpeechProvider;
  isResolving: boolean;
  externalVoice?: boolean;
}

interface EventSubscription {
  remove: () => void;
}

interface ActiveCallCapture {
  session: CallDispatcherSession;
  handle: OfflineSpeechCaptureHandle;
  speechStartedSubscription: EventSubscription;
}

export interface CallCommand {
  intent: 'acknowledge' | 'snooze';
  minutes: number | null;
}

let activeSession: CallDispatcherSession | null = null;
let activeCallCapture: ActiveCallCapture | null = null;
let sessionSequence = 0;

// The sentences the actions really return, so the prepared audio is the audio
// that plays (the old copy differed and the confirmation started late).
const ACKNOWLEDGE_CONFIRMATION = ACKNOWLEDGE_MESSAGE;
const RETRY_PROMPT =
  'I did not catch one of the choices shown on screen. Please try again now.';
const WHISPER_MODEL = 'ggml-tiny.en-q5_1.bin';
const STT_MEDIAN_TARGET_MS = 1_500;
const STT_P95_LIMIT_MS = 3_000;
/** A confirmation that never finishes speaking must not keep the call open. */
const OUTCOME_SPEECH_LIMIT_MS = 8_000;

const getSnoozeConfirmation = snoozeMessage;

const buildAnnouncement = (task: string): string =>
  `Hey! This is lafina. Your scheduled reminder is "${task}". Choose one of the two responses shown on screen at any time.`;

const warmCallResponseAudio = async (): Promise<void> => {
  try {
    await initTts();
  } catch (error) {
    console.warn('[CallDispatcher] Could not warm TTS engine:', error);
  }
};

/**
 * Prepares speech announcement and confirmations.
 */
export const prepareCallSpeech = async (
  provider: CallSpeechProvider,
  task: string,
  defaultSnoozeMinutes: number,
): Promise<void> => {
  if (!provider.prepareText) return;
  const preparePhrase = async (phrase: string): Promise<void> => {
    try {
      await provider.prepareText?.(phrase);
    } catch (error) {
      console.warn('[CallDispatcher] Could not prepare call speech:', error);
    }
  };

  await preparePhrase(buildAnnouncement(task));
  await Promise.all([
    preparePhrase(ACKNOWLEDGE_CONFIRMATION),
    preparePhrase(getSnoozeConfirmation(defaultSnoozeMinutes)),
  ]);
};

const publishCallState = (
  state: CallState,
  text?: string,
  resolution?: CallResolution,
): void => {
  if (activeSession) activeSession.state = state;
  const payload: CallStateEvent = { state };
  if (text !== undefined) payload.text = text;
  if (resolution) payload.resolution = resolution;
  DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', payload);
};

const resolutionFromAction = (
  action: ReminderActionResult,
): CallResolution | undefined => {
  if (!action.ok || action.outcome === 'rejected') return undefined;
  return {
    outcome: action.outcome,
    message: action.message,
  };
};

const isCurrentSession = (session: CallDispatcherSession): boolean =>
  activeSession === session;

const claimCallResolution = (session: CallDispatcherSession): boolean => {
  if (!isCurrentSession(session) || session.isResolving) return false;
  session.isResolving = true;
  return true;
};

const removeActiveCapture = (capture: ActiveCallCapture): void => {
  capture.speechStartedSubscription.remove();
  if (activeCallCapture === capture) activeCallCapture = null;
};

const cancelActiveCapture = (): void => {
  const capture = activeCallCapture;
  if (!capture) return;
  removeActiveCapture(capture);
  void cancelOfflineSpeechCapture(capture.handle.captureId).catch(
    (error: unknown) => {
      console.warn('[CallDispatcher] Could not cancel offline capture:', error);
    },
  );
};

const stopActiveAudioAndCapture = async (
  session: CallDispatcherSession | null = activeSession,
): Promise<void> => {
  cancelActiveCapture();
  if (session?.speechProvider.stopSpeech) {
    await session.speechProvider.stopSpeech().catch(() => undefined);
    return;
  }
  await stopSpeechPlayback().catch(() => undefined);
};

/**
 * Handles TTS playback while recovering the visible call state on failure.
 */
export const speakText = async (
  text: string,
  options?: { fallbackAudioPath?: string | null },
): Promise<void> => {
  try {
    publishCallState('speaking', text);
    const provider = activeSession?.speechProvider || defaultCallSpeechProvider;
    await provider.speakText(text, options);
  } catch (error) {
    console.error('[CallDispatcher] speakText error:', error);
    publishCallState('connected', '');
  }
};

/**
 * Speaks the result of an acknowledge or snooze. A successful result is
 * published first, so the screen changes the moment the action is saved
 * instead of after the sentence ends, and a stuck speech engine cannot hold
 * the call open.
 */
const speakOutcome = async (action: ReminderActionResult): Promise<void> => {
  const resolution = resolutionFromAction(action);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    publishCallState('speaking', action.message, resolution);
    const provider = activeSession?.speechProvider || defaultCallSpeechProvider;
    await Promise.race([
      provider.speakText(action.message),
      new Promise<void>(resolve => {
        timer = setTimeout(resolve, OUTCOME_SPEECH_LIMIT_MS);
      }),
    ]);
  } catch (error) {
    console.error('[CallDispatcher] Outcome speech error:', error);
    if (!resolution) publishCallState('connected', action.message);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const normalizeCallCommand = (transcript: string): string =>
  transcript
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=_`~?()-]/g, '')
    .replace(/\s+/g, ' ');

const editDistance = (left: string, right: string): number => {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = new Array<number>(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

const isNearKeyword = (
  candidates: readonly string[],
  keywords: readonly string[],
  maximumDistance: number,
): boolean =>
  candidates.some((candidate) =>
    keywords.some(
      (keyword) => editDistance(candidate, keyword) <= maximumDistance,
    ),
  );

const CALL_SPOKEN_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
};

const MINUTE_WORDS =
  '\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty';

/** "don't snooze", "do not acknowledge": never the action it names. */
const NEGATED_COMMAND_RE =
  /\b(?:don'?t|do\s+not|never|not)\s+(?:\w+\s+){0,2}?(?:snooz|ac?k?nowledg)/i;

/**
 * Short everyday answers. They count only as the whole reply to the offline
 * call's own question ("acknowledge or snooze?"), never inside a longer
 * sentence and never in the online conversation, where "okay" or "later"
 * is ordinary talk.
 */
const CASUAL_ACKNOWLEDGE_RE =
  /^(?:(?:yes|yeah|yep|yup|ok|okay|alright|all\s+right|sure|noted|copy(?:\s+that)?|will\s+do|i\s+will|i'?ll\s+do\s+it|i'?m\s+doing\s+it|doing\s+it(?:\s+now)?|on\s+my\s+way|sige|oo|opo)(?:\s+(?:lafina|please|thanks|thank\s+you|po))?)$/i;
const CASUAL_SNOOZE_RE =
  /^(?:(?:not\s+now|later|maybe\s+later|in\s+a\s+bit|in\s+a\s+while|a\s+bit\s+later|wait|hold\s+on|i'?m\s+busy|busy|mamaya(?:\s+na)?|saglit(?:\s+lang)?|teka(?:\s+lang)?)(?:\s+(?:lafina|please|po))?)$/i;
const BARE_MINUTES_RE = new RegExp(
  `^(?:in\\s+|for\\s+)?(${MINUTE_WORDS})\\s*(?:more\\s+)?(?:minutes?|mins?)(?:\\s+more)?(?:\\s+please)?$`,
  'i',
);

/**
 * Detects supported reminder-call keywords from speech text. `casual` also
 * accepts short everyday answers ("okay", "later", "ten more minutes"); use it
 * only when the app has just asked for one of the two choices.
 */
export const detectCallKeyword = (
  transcript: string,
  options: {casual?: boolean} = {},
): CallCommand | null => {
  const normalized = normalizeCallCommand(transcript);
  if (!normalized) return null;
  if (NEGATED_COMMAND_RE.test(normalized)) return null;

  if (options.casual) {
    const bareMinutes = BARE_MINUTES_RE.exec(normalized);
    if (bareMinutes) {
      const raw = bareMinutes[1].toLowerCase();
      const minutes = /^\d+$/.test(raw)
        ? Number.parseInt(raw, 10)
        : CALL_SPOKEN_NUMBERS[raw] ?? 0;
      if (minutes >= 1 && minutes <= 120) return {intent: 'snooze', minutes};
    }
    if (CASUAL_ACKNOWLEDGE_RE.test(normalized)) {
      return {intent: 'acknowledge', minutes: null};
    }
    if (CASUAL_SNOOZE_RE.test(normalized)) {
      return {intent: 'snooze', minutes: null};
    }
  }

  const acknowledgeExact =
    /\b(?:ac?k?nowledg?(?:e|ed|es|ing|ement|ment)?|nowledg?(?:e|ed|es|ing)?|got\s+it|understood|i'?m\s+on\s+it|on\s+it)\b/i.test(
      normalized,
    );
  const snoozeExact = /\bsnooz(?:e|ed)\b/i.test(normalized);
  if (acknowledgeExact && snoozeExact) return null;
  if (acknowledgeExact) {
    return { intent: 'acknowledge', minutes: null };
  }

  // 1. Explicit or natural snooze with minute specification (e.g. "snooze for 5 minutes", "remind me in 5 minutes", "remind me again in five minutes", "call me back in 10 minutes", "give me 5 minutes")
  const naturalMinuteMatch = normalized.match(
    /\b(?:snooz(?:e|ed)|remind\s+(?:(?:me|you)\s+)?(?:again\s+)?|call\s+(?:(?:me|you)\s+)?(?:back\s+)?|give\s+(?:me|us)|in)\s*(?:for\s+)?(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty)\s*(?:minutes?|mins?)\b/i,
  );
  if (naturalMinuteMatch?.[1]) {
    const rawVal = naturalMinuteMatch[1].toLowerCase();
    const minutes = /^\d+$/.test(rawVal)
      ? Number.parseInt(rawVal, 10)
      : CALL_SPOKEN_NUMBERS[rawVal] || 10;
    if (minutes >= 1 && minutes <= 120) {
      return { intent: 'snooze', minutes };
    }
  }

  // 2. Exact snooze without minutes
  const snoozeMatch = normalized.match(
    /\bsnooz(?:e|ed)\b(?:\s+(?:it|this|reminder))?(?:\s+(?:for\s+)?(\d{1,3})(?:\s*(?:minutes?|mins?))?)?/i,
  );
  if (snoozeExact && !snoozeMatch?.[1]) {
    return { intent: 'snooze', minutes: null };
  }
  if (snoozeExact && snoozeMatch?.[1]) {
    const minutes = Number.parseInt(snoozeMatch[1], 10);
    if (minutes < 1 || minutes > 120) return null;
    return { intent: 'snooze', minutes };
  }

  // 3. Natural conversational snooze without minute count (e.g. "remind me again", "remind me later", "call me back later", "postpone")
  const naturalSnoozeWithoutMinutes =
    /\b(?:remind\s+(?:me|you)\s+again|remind\s+(?:me|you)\s+later|call\s+(?:me|you)\s+later|call\s+(?:me|you)\s+back|postpone)\b/i.test(
      normalized,
    );
  if (naturalSnoozeWithoutMinutes) {
    return { intent: 'snooze', minutes: null };
  }

  // 4. Token near-matching fallback
  const tokens = normalized
    .split(' ')
    .filter(
      (token) =>
        !['please', 'say', 'i', 'it', 'this', 'reminder'].includes(token),
    );
  if (tokens.length === 0 || tokens.length > 3) return null;
  const candidates = [...tokens, tokens.join('')];
  const nearAcknowledge = isNearKeyword(
    candidates,
    [
      'acknowledge',
      'acknowledged',
      'knowledge',
      'knowledged',
      'acknowlege',
      'knowlege',
    ],
    2,
  );
  const nearSnooze = isNearKeyword(candidates, ['snooze', 'snoozed'], 2);
  if (nearAcknowledge === nearSnooze) return null;
  return nearAcknowledge
    ? { intent: 'acknowledge', minutes: null }
    : { intent: 'snooze', minutes: null };
};

const publishSttMetric = (result: OfflineSpeechResult): void => {
  DeviceEventEmitter.emit('LAFINA_CALL_STT_METRIC', {
    model: WHISPER_MODEL,
    captureDurationMs: result.captureDurationMs,
    inferenceDurationMs: result.inferenceDurationMs,
    medianTargetMs: STT_MEDIAN_TARGET_MS,
    p95LimitMs: STT_P95_LIMIT_MS,
    exceededP95Limit: result.inferenceDurationMs > STT_P95_LIMIT_MS,
  });
};

const handleFailedAttempt = async (
  session: CallDispatcherSession,
): Promise<void> => {
  if (!isCurrentSession(session)) return;
  session.retryCount += 1;
  if (session.retryCount >= 3) {
    await autoSnoozeCall();
    return;
  }
  await startAutomaticAttempt(session, RETRY_PROMPT);
};

const processCallTranscript = async (
  session: CallDispatcherSession,
  transcript: string,
): Promise<void> => {
  if (!isCurrentSession(session)) return;
  if (!transcript) {
    await handleFailedAttempt(session);
    return;
  }

  publishCallState('processing', 'Processing on this device...');
  const command = detectCallKeyword(transcript, {casual: true});
  if (!command) {
    await handleFailedAttempt(session);
    return;
  }
  if (!claimCallResolution(session)) return;

  try {
    const preferences = getReminderPreferences(session.userId);
    if (command.intent === 'acknowledge') {
      const action = await acknowledgeReminderAction(
        session.reminderId,
        session.userId,
        session.generation,
      );
      await speakOutcome(action);
      if (action.ok) {
        disconnectCall(resolutionFromAction(action));
      } else if (isCurrentSession(session)) {
        session.isResolving = false;
        await handleFailedAttempt(session);
      }
      return;
    }

    const minutes = command.minutes ?? preferences.snoozeDurationMinutes;
    const action = await snoozeReminderAction(
      session.reminderId,
      session.userId,
      minutes,
      session.generation,
    );
    await speakOutcome(action);
    if (action.ok) {
      disconnectCall(resolutionFromAction(action));
    } else if (isCurrentSession(session)) {
      session.isResolving = false;
      await handleFailedAttempt(session);
    }
  } catch (error) {
    console.error('[CallDispatcher] Voice response error:', error);
    if (isCurrentSession(session)) {
      session.isResolving = false;
      await handleFailedAttempt(session);
    }
  }
};

async function startAutomaticAttempt(
  session: CallDispatcherSession,
  prompt: string,
  cachedPath?: string | null,
): Promise<void> {
  if (!isCurrentSession(session) || !session.voiceEnabled) return;
  if (!hasOfflineSpeechCapture()) {
    session.voiceEnabled = false;
    void stopActiveCallSession();
    publishCallState(
      'connected',
      'Offline speech recognition is unavailable. Use the buttons below.',
    );
    return;
  }

  // 1. Play prompt announcement and wait for it to finish playing
  try {
    publishCallState('speaking', prompt);
    const provider = session.speechProvider || defaultCallSpeechProvider;
    await provider.speakText(prompt, { fallbackAudioPath: cachedPath });
  } catch (error) {
    console.error('[CallDispatcher] TTS playback failed:', error);
  }

  // A button already settled the call while the prompt was playing: do not
  // open the microphone over the spoken confirmation.
  if (!isCurrentSession(session) || session.isResolving) return;

  // 2. Start offline speech capture
  let handle: OfflineSpeechCaptureHandle;
  try {
    publishCallState('listening');
    handle = startOfflineSpeechCapture({
      mode: 'automatic',
      bargeIn: false,
      context: 'reminder_call',
    });
  } catch (error) {
    session.voiceEnabled = false;
    void stopActiveCallSession();
    console.error('[CallDispatcher] Could not start capture:', error);
    publishCallState(
      'connected',
      'Offline speech recognition could not start. Use the buttons below.',
    );
    return;
  }

  const speechStartedSubscription = DeviceEventEmitter.addListener(
    'onSpeechStarted',
    (event: { captureId?: string }) => {
      if (
        event.captureId !== handle.captureId ||
        !isCurrentSession(session) ||
        activeCallCapture?.handle.captureId !== handle.captureId
      ) {
        return;
      }
      publishCallState('listening');
    },
  );

  const capture: ActiveCallCapture = {
    session,
    handle,
    speechStartedSubscription,
  };
  activeCallCapture = capture;

  try {
    const result = await handle.result;
    removeActiveCapture(capture);
    if (
      !isCurrentSession(session) ||
      result.captureId !== handle.captureId ||
      result.cancelled
    ) {
      return;
    }
    publishSttMetric(result);
    await processCallTranscript(session, result.transcript.trim());
  } catch (error) {
    removeActiveCapture(capture);
    if (!isCurrentSession(session)) return;
    if (isMicrophoneBusyError(error)) {
      // AGY-PORT 05: another recorder owns the microphone. That is not a failed
      // answer, so it must not count toward auto-snooze, and the recording is left
      // alone. MIC_IN_USE names the other recorder; CAPTURE_BUSY is another voice
      // capture still finishing, which must not be described as a recording.
      session.voiceEnabled = false;
      const code = (error as { code?: unknown } | null)?.code;
      publishCallState(
        'connected',
        code === 'MIC_IN_USE'
          ? 'The microphone is being used by a recording. Use the buttons below.'
          : 'The microphone is still busy with another voice capture. Use the buttons below.',
      );
      return;
    }
    console.error('[CallDispatcher] Capture result error:', error);
    await handleFailedAttempt(session);
  }
}

/**
 * Resolves the delivery generation a call acts on. A captured generation that
 * no longer matches (edited, rescheduled, deleted, rekeyed or another owner)
 * makes the call inert: its native artifacts are dismissed, newer work is
 * left untouched.
 */
const captureCallGeneration = (
  reminderId: string,
  userId: string,
  expectedGeneration: number | null | undefined,
):
  | { ok: true; generation: number | null }
  | { ok: false; retired: boolean } => {
  const fence = deliveryStore.checkFence(
    reminderId,
    userId,
    expectedGeneration,
  );
  if (!fence.ok) {
    console.warn('[CallDispatcher] Ignoring stale call:', fence.reason);
    return { ok: false, retired: fence.reason === 'not_actionable' };
  }
  if (expectedGeneration !== undefined && expectedGeneration !== null) {
    return {
      ok: true,
      generation:
        expectedGeneration > 0 ? expectedGeneration : fence.job?.generation ?? null,
    };
  }
  return { ok: true, generation: fence.job?.generation ?? null };
};

/**
 * Answers a triggered reminder and starts call interaction.
 */
export const answerCall = async (
  reminderId: string,
  userId: string,
  voiceEnabled = true,
  speechProvider?: CallSpeechProvider,
  expectedGeneration?: number | null,
  externalVoice = false,
): Promise<boolean> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    console.error('[CallDispatcher] Reminder not found:', reminderId);
    return false;
  }
  const captured = captureCallGeneration(reminderId, userId, expectedGeneration);
  if (!captured.ok) {
    await finishNativeIncomingCall(reminderId);
    // A retired job has no newer work to protect; a stale generation might.
    if (captured.retired) await cancelReminderAlarm(reminderId);
    return false;
  }
  if (reminder.status === 'acknowledged' || reminder.status === 'missed') {
    await finishNativeIncomingCall(reminderId);
    await cancelReminderAlarm(reminderId);
    return false;
  }

  // Only the reminder's own task (exact link or strict evidence) counts; a
  // completed task that merely shares the title does not end this call.
  const isTaskDone = alertSuppression(db, reminder) === 'task_completed';
  if (isTaskDone) {
    remindersStore.acknowledgeReminder(reminder.id);
    await cancelReminderAlarm(reminder.id);
    await finishNativeIncomingCall(reminderId);
    return false;
  }

  const answerSequence = ++sessionSequence;
  await stopActiveAudioAndCapture();
  if (answerSequence !== sessionSequence) return false;
  const session: CallDispatcherSession = {
    id: sessionSequence,
    reminderId,
    userId,
    generation: captured.generation,
    task: reminder.task,
    state: 'connected',
    retryCount: 0,
    voiceEnabled,
    speechProvider: speechProvider || defaultCallSpeechProvider,
    isResolving: false,
    externalVoice: externalVoice && voiceEnabled,
  };
  activeSession = session;

  if (voiceEnabled) {
    try {
      await startActiveCallSession(reminder.task);
    } catch (error) {
      console.error('[CallDispatcher] Active-call service failed:', error);
    }
  }
  if (!isCurrentSession(session)) {
    if (!activeSession) void stopActiveCallSession().catch(() => undefined);
    return false;
  }
  await finishNativeIncomingCall(reminderId);
  if (!isCurrentSession(session)) return false;
  remindersStore.updateReminderStatus(reminderId, 'triggered');
  publishCallState('connected');

  if (session.externalVoice) {
    // Deliver the actual reminder before handing the speaker and microphone to
    // the conversation. No offline capture runs during the online session.
    await speakText(buildAnnouncement(reminder.task), {fallbackAudioPath: reminder.preCastAudioPath});
    if (!isCurrentSession(session)) return false;
    publishCallState('connected', 'Connecting to online conversation…');
    return true;
  }

  const preferences = getReminderPreferences(userId);
  const announcement = buildAnnouncement(reminder.task);
  void warmCallResponseAudio();
  void prepareCallSpeech(
    session.speechProvider,
    reminder.task,
    preferences.snoozeDurationMinutes,
  );

  if (!voiceEnabled) {
    void speakText(announcement).then(() => {
      // Not while a tap is being carried out: this line would replace the
      // confirmation on screen.
      if (isCurrentSession(session) && !session.isResolving) {
        publishCallState(
          'connected',
          'Microphone access is unavailable. Use the buttons below.',
        );
      }
    });
    return true;
  }

  void startAutomaticAttempt(session, announcement, reminder.preCastAudioPath);
  return true;
};

/** Resume the existing offline call only while the same accepted call remains active. */
export const resumeOfflineCall = (reminderId: string, userId: string): boolean => {
  const session = activeSession;
  if (!session || session.reminderId !== reminderId || session.userId !== userId ||
      !session.externalVoice || session.isResolving) return false;
  session.externalVoice = false;
  const reminder = remindersStore.getReminderById(reminderId);
  void startAutomaticAttempt(session, buildAnnouncement(session.task), reminder?.preCastAudioPath);
  return true;
};

/**
 * Automatically snoozes the active reminder or marks it missed at its limit.
 */
export const autoSnoozeCall = async (): Promise<void> => {
  const session = activeSession;
  if (!session || !claimCallResolution(session)) return;
  const showResolution = session.state !== 'ringing';
  await stopActiveAudioAndCapture(session);

  const action = await autoSnoozeReminderAction(
    session.reminderId,
    session.userId,
    session.generation,
  );
  if (session.state !== 'ringing') {
    await speakOutcome(action);
  }
  disconnectCall(showResolution ? resolutionFromAction(action) : undefined);
};

/**
 * Declines an incoming reminder and applies its automatic snooze behavior.
 */
export const declineCall = async (
  reminderId: string,
  userId: string,
  speechProvider: CallSpeechProvider = defaultCallSpeechProvider,
  expectedGeneration?: number | null,
): Promise<void> => {
  const reminder = remindersStore.getReminderById(reminderId);
  if (!reminder || reminder.userId !== userId) {
    await finishNativeIncomingCall(reminderId);
    return;
  }
  const captured = captureCallGeneration(reminderId, userId, expectedGeneration);
  if (!captured.ok) {
    await finishNativeIncomingCall(reminderId);
    return;
  }
  sessionSequence += 1;
  activeSession = {
    id: sessionSequence,
    reminderId,
    userId,
    generation: captured.generation,
    task: reminder.task,
    state: 'ringing',
    retryCount: 0,
    voiceEnabled: false,
    speechProvider,
    isResolving: false,
  };
  await autoSnoozeCall();
};

/**
 * Hanging up a call the student already answered. They heard the reminder,
 * so it is acknowledged (received, not task completed) instead of being
 * auto-snoozed. A call that was never answered still declines (audit
 * finding 2).
 */
export const endAnsweredCall = async (
  reminderId: string,
  userId: string,
  speechProvider: CallSpeechProvider = defaultCallSpeechProvider,
  expectedGeneration?: number | null,
): Promise<void> => {
  const session = activeSession;
  if (
    !session ||
    session.reminderId !== reminderId ||
    session.userId !== userId ||
    session.state === 'ringing'
  ) {
    await declineCall(reminderId, userId, speechProvider, expectedGeneration);
    return;
  }
  if (!claimCallResolution(session)) return;
  await stopActiveAudioAndCapture(session);
  const action = await acknowledgeReminderAction(
    reminderId,
    userId,
    session.generation,
  );
  if (!isCurrentSession(session)) return;
  // No spoken confirmation: the student hung up.
  disconnectCall(resolutionFromAction(action));
};

/**
 * What a tap on Acknowledge or Snooze did. `busy` means the call was already
 * being settled (a spoken answer or an earlier tap), so this tap changed
 * nothing; `failed` means the reminder could not be changed and the call
 * stays open.
 */
export type ManualCallResult = 'done' | 'busy' | 'failed';

/**
 * Runs a button's action against the live call. When the call session is
 * gone (lost with a reload, or closed underneath the screen) the button still
 * does what it says, fenced by the delivery generation the screen captured,
 * instead of doing nothing.
 */
const settleCallManually = async (
  reminderId: string,
  userId: string,
  expectedGeneration: number | null | undefined,
  act: (generation: number | null | undefined) => Promise<ReminderActionResult>,
): Promise<ManualCallResult> => {
  const session = activeSession;
  if (
    session &&
    session.reminderId === reminderId &&
    session.userId === userId
  ) {
    if (!claimCallResolution(session)) return 'busy';
    await stopActiveAudioAndCapture(session);
    const action = await act(session.generation);
    if (!isCurrentSession(session)) return action.ok ? 'done' : 'failed';
    await speakOutcome(action);
    if (action.ok) {
      disconnectCall(resolutionFromAction(action));
      return 'done';
    }
    if (isCurrentSession(session)) session.isResolving = false;
    return 'failed';
  }

  const action = await act(expectedGeneration);
  const resolution = resolutionFromAction(action);
  const event: CallStateEvent = resolution
    ? { state: 'disconnected', resolution }
    : { state: 'connected', text: action.message };
  DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', event);
  return action.ok ? 'done' : 'failed';
};

/**
 * Applies a manual snooze through the coordinated scheduler path.
 */
export const manualSnoozeCall = (
  reminderId: string,
  userId: string,
  minutes: number,
  expectedGeneration?: number | null,
): Promise<ManualCallResult> =>
  settleCallManually(reminderId, userId, expectedGeneration, generation =>
    snoozeReminderAction(reminderId, userId, minutes, generation),
  );

/**
 * Applies a manual acknowledgement through the coordinated scheduler path.
 */
export const manualAcknowledgeCall = (
  reminderId: string,
  userId: string,
  expectedGeneration?: number | null,
): Promise<ManualCallResult> =>
  settleCallManually(reminderId, userId, expectedGeneration, generation =>
    acknowledgeReminderAction(reminderId, userId, generation),
  );

/**
 * Stops the active call loop, microphone service, and terminal UI state.
 */
export const disconnectCall = (resolution?: CallResolution): void => {
  sessionSequence += 1;
  const session = activeSession;
  if (!session) return;
  session.state = 'disconnected';
  activeSession = null;
  void stopActiveAudioAndCapture(session);
  void stopActiveCallSession().catch(() => undefined);
  const event: CallStateEvent = { state: 'disconnected' };
  if (resolution) event.resolution = resolution;
  DeviceEventEmitter.emit('LAFINA_CALL_STATE_CHANGE', event);
};
